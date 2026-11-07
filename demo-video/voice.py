"""Lay a recorded voice-over under the finished demo and caption it word by word.

The narrator records while watching the subtitled video, so each spoken line lands a little after
its subtitle. This script finds every line in the recording, moves it onto its on-screen moment,
mixes the voice track, and writes captions that reveal each word as it is spoken.

    uv run --no-project --with faster-whisper --with imageio-ffmpeg --with pillow --with numpy \
        python demo-video/voice.py path/to/voice.wav [transcribe|build|burn|all]

Inputs:  out/countersign-demo-clean.mp4 (from compose.py), the voice recording, and
         voiceover.txt (what the narrator actually says, one narration line per row).
Outputs: out/countersign-demo-voice.mp4 (voice + word-by-word captions burned in),
         out/countersign-demo-voice-clean.mp4 (voice, no captions), out/countersign-demo-voice.srt.
"""

from __future__ import annotations

import difflib
import json
import re
import sys
import wave
from pathlib import Path

import numpy as np

import compose as C

SR = 48000
VOICE = C.OUT / "voice"
LINES_FILE = C.HERE / "voiceover.txt"
SPEECH_AT = 0.0  # a line's first word lands this long after its old subtitle start (moment + 0.3 s)
MIN_SPEECH_GAP = 0.3  # never closer than this between two spoken lines
FIRST_LINE_AT = 0.5  # the opening line starts with the title card
SPEECH_DB = -50  # frame level that counts as speech
MAX_CHARS = 58  # caption chunk width
WORD_FADE_MS = 110
HOTWORDS = "Countersign Groq gpt-oss-20b Priya Kai Diego Arjun Grace Marcus Fremont Austin Bangalore pgvector FastAPI OpenAPI scrypt revocable countersignature"


def norm(w: str) -> str:
    return re.sub(r"[^a-z0-9]", "", w.lower())


# ---------------------------------------------------------------- inputs
def timeline() -> tuple[list[dict], float]:
    """Narration lines of the composed video with their subtitle start and their scene's window."""
    scenes = [s for s in C.STORY["scenes"] if (C.FRAMES / s["id"] / "meta.json").exists()]
    lines: list[dict] = []
    start = 0.0
    total = 0.0
    for s in scenes:
        meta = json.loads((C.FRAMES / s["id"] / "meta.json").read_text(encoding="utf-8"))
        d, cues = C.scene_timing(s, meta)
        for a, _, text in cues:
            lines.append({"cue": start + a, "script": text, "card": s["kind"] == "card", "win": (start + C.T, start + d - C.T)})
        total = start + d
        start += d - C.T
    return lines, total


def load_voice(path: Path) -> np.ndarray:
    raw = VOICE / "voice48k.f32"
    VOICE.mkdir(parents=True, exist_ok=True)
    C.run([C.FF, "-y", "-loglevel", "error", "-i", str(path), "-ac", "1", "-ar", str(SR), "-f", "f32le", str(raw)])
    return np.fromfile(raw, dtype=np.float32)


def transcribe(path: Path) -> list[dict]:
    from faster_whisper import WhisperModel

    raw = VOICE / "voice16k.f32"
    VOICE.mkdir(parents=True, exist_ok=True)
    C.run([C.FF, "-y", "-loglevel", "error", "-i", str(path), "-ac", "1", "-ar", "16000", "-f", "f32le", str(raw)])
    a16 = np.fromfile(raw, dtype=np.float32)
    model = WhisperModel("medium.en", device="cpu", compute_type="int8")
    segs, _ = model.transcribe(a16, language="en", word_timestamps=True, beam_size=5, hotwords=HOTWORDS)
    words = [{"w": w.word.strip(), "s": round(w.start, 3), "e": round(w.end, 3)} for seg in segs for w in seg.words]
    (VOICE / "words.json").write_text(json.dumps(words, indent=0), encoding="utf-8")
    return words


# ---------------------------------------------------------------- alignment
def assign(script_lines: list[str], words: list[dict]) -> list[list[int]]:
    """Give every recognised word to a narration line. Matched words follow the script; a run of
    unmatched words between two lines is split at its longest pause."""
    st, owner = [], []
    for i, line in enumerate(script_lines):
        for w in line.split():
            if norm(w):
                st.append(norm(w))
                owner.append(i)
    at = [norm(w["w"]) for w in words]
    line_of: list[int | None] = [None] * len(words)
    for a, b, n in difflib.SequenceMatcher(None, st, at, autojunk=False).get_matching_blocks():
        for k in range(n):
            line_of[b + k] = owner[a + k]
    # Monotonic clean-up: a matched word can never belong to an earlier line than the one before it.
    hi = 0
    for k, v in enumerate(line_of):
        if v is not None:
            if v < hi:
                line_of[k] = None
            else:
                hi = v
    k = 0
    while k < len(words):
        if line_of[k] is not None:
            k += 1
            continue
        j = k
        while j < len(words) and line_of[j] is None:
            j += 1
        prev = line_of[k - 1] if k > 0 else 0
        nxt = line_of[j] if j < len(words) else len(script_lines) - 1
        if prev == nxt:
            for m in range(k, j):
                line_of[m] = prev
        else:
            # split before the word that follows the longest pause (including the run's edges)
            cands = range(k, j + 1)

            def score(m: int) -> float:
                gap = (words[m]["s"] if m < len(words) else 1e9) - (words[m - 1]["e"] if m > 0 else -1e9)
                ends = m > 0 and words[m - 1]["w"][-1:] in ".?!"
                return gap + (0.5 if ends else 0.0) + m * 1e-6  # ties: keep the run with the earlier line

            cut = max(cands, key=score)
            for m in range(k, j):
                line_of[m] = prev if m < cut else nxt
        k = j
    groups: list[list[int]] = [[] for _ in script_lines]
    for k, v in enumerate(line_of):
        groups[v].append(k)  # type: ignore[index]
    return groups


def word_times(spoken: str, idx: list[int], words: list[dict]) -> list[tuple[str, float, float]]:
    """Time each word of the corrected caption text from the recognised words of its line."""
    toks = spoken.split()
    rec = [words[k] for k in idx]
    a = [norm(t) for t in toks]
    b = [norm(w["w"]) for w in rec]
    out: list[tuple[str, float, float] | None] = [None] * len(toks)
    for tag, i1, i2, j1, j2 in difflib.SequenceMatcher(None, a, b, autojunk=False).get_opcodes():
        if tag == "equal":
            for d in range(i2 - i1):
                out[i1 + d] = (toks[i1 + d], rec[j1 + d]["s"], rec[j1 + d]["e"])
        elif tag in ("replace", "delete") and i2 > i1:
            if j2 > j1:
                s0, s1 = rec[j1]["s"], rec[j2 - 1]["e"]
            else:  # nothing recognised here: squeeze between neighbours
                s0 = rec[j1 - 1]["e"] if j1 > 0 else (rec[0]["s"] if rec else 0.0)
                s1 = rec[j1]["s"] if j1 < len(rec) else s0 + 0.3 * (i2 - i1)
            weights = [max(1, len(t)) for t in toks[i1:i2]]
            tot, acc = sum(weights), 0
            for d, wgt in enumerate(weights):
                ws = s0 + (s1 - s0) * acc / tot
                acc += wgt
                out[i1 + d] = (toks[i1 + d], ws, s0 + (s1 - s0) * acc / tot)
    return [o for o in out if o is not None]


def speech_mask(audio: np.ndarray) -> np.ndarray:
    """True for every 10 ms frame that holds speech (the recording is gated, so pauses are silent)."""
    hop = SR // 100
    n = len(audio) // hop
    level = 10 * np.log10(np.mean(audio[: n * hop].reshape(n, hop) ** 2, axis=1) + 1e-12)
    return level > SPEECH_DB


def snap_words(mask: np.ndarray, words: list[dict]) -> list[dict]:
    """Recognised word times can drift into a pause. Move any word that starts in silence onto the
    next speech, keep the order, and spread words that collapse onto one instant."""
    n = len(mask)
    nxt = np.full(n + 1, n)
    for i in range(n - 1, -1, -1):
        nxt[i] = i if mask[i] else nxt[i + 1]
    out, prev = [], 0.0
    for w in words:
        s = max(w["s"], prev)
        i = int(s * 100)
        if i < n and not mask[i] and nxt[i] < n and nxt[i] / 100 < max(w["e"], s) + 6.0:
            s = nxt[i] / 100
        out.append(dict(w, s=round(s, 3)))
        prev = s
    k = 0
    while k < len(out):
        j = k
        while j + 1 < len(out) and out[j + 1]["s"] - out[k]["s"] < 0.03:
            j += 1
        if j > k:
            s0 = out[k]["s"]
            end = out[j + 1]["s"] if j + 1 < len(out) else max(out[j]["e"], s0 + 0.3 * (j - k + 1))
            end = min(end, s0 + 0.45 * (j - k + 1))
            weights = [max(1, len(x["w"])) for x in out[k : j + 1]]
            tot, acc = sum(weights), 0
            for m in range(k, j + 1):
                out[m]["s"] = round(s0 + (end - s0) * acc / tot, 3)
                acc += weights[m - k]
        k = j + 1
    for m, w in enumerate(out):
        nx = out[m + 1]["s"] if m + 1 < len(out) else w["e"] + 1
        w["e"] = round(min(max(w["e"], w["s"] + 0.08), max(nx, w["s"] + 0.08)), 3)
    return out


def refine(mask: np.ndarray, s: float, e: float) -> tuple[float, float]:
    """Snap a line's start and end to the speech energy around the recognised times."""
    on = lambda t: 0 <= int(t * 100) < len(mask) and bool(mask[int(t * 100)])
    onset = next((float(t) for t in np.arange(max(0.0, s - 0.3), s + 0.3, 0.01) if on(t)), s)
    offset = next((float(t) for t in np.arange(e + 0.5, max(onset, e - 0.4), -0.01) if on(t)), e)
    return onset, offset + 0.01


# ---------------------------------------------------------------- placement and mix
def place(lines: list[dict], audio: np.ndarray, total: float) -> np.ndarray:
    """Move every spoken line so its first word lands on its moment; keep the narrator's pacing
    inside the line. Returns the voice track on the video timeline."""
    prev_end = -1.0
    for k, ln in enumerate(lines):
        target = FIRST_LINE_AT if k == 0 else ln["cue"] + SPEECH_AT
        start = max(target, prev_end + MIN_SPEECH_GAP)
        ln["shift"] = start - ln["on"]
        ln["out"] = (start, ln["off"] + ln["shift"])
        prev_end = ln["out"][1]
    track = np.zeros(int((total + 1) * SR), dtype=np.float32)
    for k, ln in enumerate(lines):
        o0, o1 = ln["out"]
        before = (o0 - lines[k - 1]["out"][1]) if k else 1.0
        after = (lines[k + 1]["out"][0] - o1) if k + 1 < len(lines) else 1.0
        pre, post = min(0.25, before / 2), min(0.4, after / 2)
        a0, a1 = max(0.0, ln["on"] - pre), min(len(audio) / SR, ln["off"] + post)
        clip = audio[int(a0 * SR) : int(a1 * SR)].copy()
        f = min(int(0.03 * SR), len(clip) // 2)
        clip[:f] *= np.linspace(0, 1, f, dtype=np.float32)
        clip[len(clip) - f :] *= np.linspace(1, 0, f, dtype=np.float32)
        i0 = int((a0 + ln["shift"]) * SR)
        track[i0 : i0 + len(clip)] += clip[: len(track) - i0]
    return track[: int(total * SR)]


def write_wav(path: Path, mono: np.ndarray) -> None:
    pcm = (np.clip(mono, -1, 1) * 32767).astype("<i2")
    with wave.open(str(path), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())


# ---------------------------------------------------------------- captions
def chunks(timed: list[tuple[str, float, float]]) -> list[list[tuple[str, float, float]]]:
    """Group a line's words into short caption phrases at sentence ends, pauses, and a width limit."""
    out: list[list[tuple[str, float, float]]] = []
    cur: list[tuple[str, float, float]] = []
    for k, w in enumerate(timed):
        if cur and len(" ".join(x[0] for x in cur + [w])) > MAX_CHARS:
            out.append(cur)
            cur = []
        cur.append(w)
        nxt = timed[k + 1] if k + 1 < len(timed) else None
        text = " ".join(x[0] for x in cur)
        if nxt is None:
            break
        pause = nxt[1] - w[2]
        sentence_end = w[0][-1] in ".?!:;" and len(cur) >= 2
        long_pause = pause > 0.45 and len(cur) >= 2
        comma_break = w[0][-1] == "," and len(text) > 34
        if sentence_end or long_pause or comma_break:
            out.append(cur)
            cur = []
    if cur:
        if out and len(cur) == 1 and len(" ".join(x[0] for x in out[-1] + cur)) <= MAX_CHARS + 12:
            out[-1] += cur
        else:
            out.append(cur)
    return out


def ass_text(chunk: list[tuple[str, float, float]], t0: float) -> str:
    parts = []
    for w, s, _ in chunk:
        ms = max(0, round((s - t0) * 1000))
        if ms < 40:
            parts.append(w)
        else:
            parts.append(f"{{\\alpha&HFF&\\t({ms},{ms + WORD_FADE_MS},\\alpha&H00&)}}{w}")
    return "{\\fad(0,140)}" + " ".join(parts)


def write_captions(lines: list[dict]) -> list[tuple[float, float, str, str]]:
    events: list[tuple[float, float, list[tuple[str, float, float]], bool, tuple[float, float]]] = []
    for ln in lines:
        timed = [(w, s + ln["shift"], e + ln["shift"]) for w, s, e in ln["timed"]]
        for ch in chunks(timed):
            events.append((ch[0][1] - 0.06, ch[-1][2], ch, ln["card"], ln["win"]))
    rows = []
    for k, (a, last, ch, card, win) in enumerate(events):
        end = max(last + 0.75, a + 0.8)
        if k + 1 < len(events):
            end = min(end, events[k + 1][0] - 0.02)  # a phrase is gone before the next one starts
        rows.append((a, end, ch, card))
    srt, ev = [], []
    for k, (a, b, ch, card) in enumerate(rows, 1):
        plain = " ".join(w for w, _, _ in ch)
        srt.append(f"{k}\n{C.ts_srt(a)} --> {C.ts_srt(b)}\n{plain}\n")
        ev.append(f"Dialogue: 0,{C.ts_ass(a)},{C.ts_ass(b)},{'Card' if card else 'App'},,0,0,0,,{ass_text(ch, round(a, 2))}")
    (C.OUT / "countersign-demo-voice.srt").write_text("\n".join(srt), encoding="utf-8")
    head = f"""[Script Info]
ScriptType: v4.00+
PlayResX: {C.W}
PlayResY: {C.H}
WrapStyle: 2
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: App,Segoe UI Semibold,38,&H00FFFFFF,&H00FFFFFF,&H64000000,&H8C000000,0,0,0,0,100,100,0,0,1,1.6,1.5,2,160,160,30,1
Style: Card,Segoe UI Semibold,40,&H00FFFFFF,&H00FFFFFF,&H64000000,&H8C000000,0,0,0,0,100,100,0,0,1,1.6,1.5,2,160,160,64,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
    (C.WORK / "voice.ass").write_text(head + "\n".join(ev) + "\n", encoding="utf-8")
    return rows  # type: ignore[return-value]


# ---------------------------------------------------------------- main
def build(voice_path: Path) -> None:
    audio = load_voice(voice_path)
    mask = speech_mask(audio)
    words = snap_words(mask, json.loads((VOICE / "words.json").read_text(encoding="utf-8")))
    lines, total = timeline()
    spoken = [ln.strip() for ln in LINES_FILE.read_text(encoding="utf-8").splitlines() if ln.strip()]
    if len(spoken) != len(lines):
        sys.exit(f"voiceover.txt has {len(spoken)} lines, the video has {len(lines)} narration lines")
    groups = assign(spoken, words)
    report = []
    for ln, idx, text in zip(lines, groups, spoken):
        if not idx:
            sys.exit(f"no speech found for: {ln['script']}")
        ln["timed"] = word_times(text, idx, words)
        ln["on"], ln["off"] = refine(mask, words[idx[0]]["s"], words[idx[-1]]["e"])
        ln["heard"] = " ".join(words[k]["w"] for k in idx)
    track = place(lines, audio, total)
    for k, ln in enumerate(lines, 1):
        o0, o1 = ln["out"]
        late = o0 - ln["cue"]
        over = o1 - ln["win"][1]
        flag = (f"  LATE {late:.2f}" if late > 0.05 else "") + (f"  OVERRUNS SCENE {over:.2f}" if over > 0 else "")
        report.append(f"{k:2d} {o0:7.2f}-{o1:7.2f} shift {ln['shift']:+5.2f}{flag}\n   said:  {ln['heard']}\n   shown: {' '.join(w for w, _, _ in ln['timed'])}")
    (VOICE / "placement.txt").write_text("\n".join(report), encoding="utf-8")
    print("\n".join(r.split("\n")[0] for r in report))
    write_wav(VOICE / "voice-track.wav", track)
    rows = write_captions(lines)
    print(f"{len(rows)} caption phrases, {sum(len(ln['timed']) for ln in lines)} words")
    clean = C.OUT / "countersign-demo-voice-clean.mp4"
    C.run(
        [
            C.FF,
            "-y",
            "-loglevel",
            "error",
            "-i",
            str(C.OUT / "countersign-demo-clean.mp4"),
            "-i",
            str(VOICE / "voice-track.wav"),
            "-filter_complex",
            "[1:a]pan=stereo|c0=c0|c1=c0[a]",
            "-map",
            "0:v",
            "-map",
            "[a]",
            "-c:v",
            "copy",
            "-c:a",
            "aac",
            "-b:a",
            "192k",
            "-movflags",
            "+faststart",
            str(clean),
        ]
    )
    print("muxed", clean)


def burn() -> None:
    color = ["-color_range", "tv", "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709"]
    out = C.OUT / "countersign-demo-voice.mp4"
    C.run(
        [
            C.FF,
            "-y",
            "-loglevel",
            "error",
            "-i",
            str(C.OUT / "countersign-demo-voice-clean.mp4"),
            "-vf",
            "subtitles=voice.ass:fontsdir=fonts",
            "-c:v",
            "libx264",
            "-preset",
            "medium",
            "-crf",
            "18",
            "-pix_fmt",
            "yuv420p",
            *color,
            "-c:a",
            "copy",
            "-movflags",
            "+faststart",
            str(out),
        ],
        cwd=C.WORK,
    )
    print("done", out)


if __name__ == "__main__":
    voice = Path(sys.argv[1])
    stage = sys.argv[2] if len(sys.argv) > 2 else "all"
    if stage in ("all", "transcribe"):
        transcribe(voice)
    if stage in ("all", "build"):
        build(voice)
    if stage in ("all", "burn"):
        burn()
