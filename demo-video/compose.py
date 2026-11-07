"""Compose the recorded scenes into the final demo video, with subtitles and a narration script.

    uv run --no-project --with imageio-ffmpeg --with pillow python demo-video/compose.py [all|scenes|join|burn] [scene ids]

Outputs (demo-video/out/): countersign-demo.mp4 (subtitles burned in), countersign-demo-clean.mp4
(no subtitles, for the voice-over edit), countersign-demo.srt, and narration-script.md.
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

import imageio_ffmpeg
from PIL import Image, ImageDraw, ImageFilter, ImageFont

HERE = Path(__file__).resolve().parent
OUT = HERE / "out"
FRAMES = OUT / "frames"
WORK = OUT / "work"
FF = imageio_ffmpeg.get_ffmpeg_exe()
STORY = json.loads((HERE / "storyboard.json").read_text(encoding="utf-8"))
WPS = STORY["words_per_second"]

W, H, FPS = 1920, 1080, 30
APP_W, APP_H, APP_X, APP_Y = 1680, 945, 120, 26  # leaves a 109 px band for subtitles
PHONE_W, PHONE_H, PHONE_X, PHONE_Y = 416, 900, 752, 38
T = 0.6  # transition length (s)
LEAD = 0.3  # subtitle appears this long after its moment starts on screen
MIN_GAP = 0.3  # minimum gap between subtitles
FONT_DIR = Path("C:/Windows/Fonts")


def run(cmd: list[str], cwd: Path | None = None) -> None:
    r = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True)
    if r.returncode != 0:
        print(r.stderr[-3000:])
        raise SystemExit(f"ffmpeg failed: {' '.join(cmd[:6])}")


# ---------------------------------------------------------------- static assets
def gradient_bg() -> Image.Image:
    base = Image.new("RGB", (W, H), (11, 13, 20))
    glow = Image.new("RGB", (W, H), (0, 0, 0))
    d = ImageDraw.Draw(glow)
    d.ellipse((-400, -500, 900, 500), fill=(52, 70, 160))
    d.ellipse((1100, 500, 2400, 1500), fill=(92, 60, 150))
    d.ellipse((700, 300, 1300, 900), fill=(20, 80, 80))
    glow = glow.filter(ImageFilter.GaussianBlur(220))
    img = Image.blend(base, glow, 0.55).convert("RGBA")
    lines = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    grid = ImageDraw.Draw(lines)
    for x in range(0, W, 48):
        grid.line([(x, 0), (x, H)], fill=(255, 255, 255, 9), width=1)
    for y in range(0, H, 48):
        grid.line([(0, y), (W, y)], fill=(255, 255, 255, 9), width=1)
    img.alpha_composite(lines)
    return img.convert("RGB")


def rounded_mask(w: int, h: int, r: int) -> Image.Image:
    m = Image.new("L", (w * 2, h * 2), 0)
    ImageDraw.Draw(m).rounded_rectangle((0, 0, w * 2 - 1, h * 2 - 1), radius=r * 2, fill=255)
    return m.resize((w, h), Image.LANCZOS)


def with_shadow(bg: Image.Image, box: tuple[int, int, int, int], r: int, spread: int = 40) -> Image.Image:
    sh = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    x, y, w, h = box
    ImageDraw.Draw(sh).rounded_rectangle((x - 4, y + 10, x + w + 4, y + h + 22), radius=r, fill=(0, 0, 0, 170))
    sh = sh.filter(ImageFilter.GaussianBlur(spread))
    out = bg.convert("RGBA")
    out.alpha_composite(sh)
    ring = ImageDraw.Draw(out)
    ring.rounded_rectangle((x - 1, y - 1, x + w, y + h), radius=r + 1, outline=(255, 255, 255, 40), width=1)
    return out


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(str(FONT_DIR / ("seguisb.ttf" if bold else "segoeui.ttf")), size)


def build_assets() -> None:
    WORK.mkdir(parents=True, exist_ok=True)
    bg = gradient_bg()
    with_shadow(bg, (APP_X, APP_Y, APP_W, APP_H), 18).convert("RGB").save(WORK / "bg_app.png")
    rounded_mask(APP_W, APP_H, 18).save(WORK / "mask_app.png")
    # Phone: bezel, shadow, and a caption on the left.
    ph = with_shadow(bg, (PHONE_X - 14, PHONE_Y - 14, PHONE_W + 28, PHONE_H + 28), 50, 50)
    d = ImageDraw.Draw(ph)
    d.rounded_rectangle((PHONE_X - 14, PHONE_Y - 14, PHONE_X + PHONE_W + 14, PHONE_Y + PHONE_H + 14), radius=50, fill=(6, 7, 11), outline=(70, 76, 92), width=2)
    d.text((150, 380), "Employee self-service", font=font(44, True), fill=(255, 255, 255))
    d.text((150, 442), "Confirm a missed punch in one tap", font=font(26), fill=(201, 205, 216))
    for k, line in enumerate(["Badge evidence shown", "The note stays untrusted", "The manager approves every change"]):
        d.text((150, 506 + k * 34), "·  " + line, font=font(21), fill=(160, 168, 186))
    ph.convert("RGB").save(WORK / "bg_phone.png")
    rounded_mask(PHONE_W, PHONE_H, 38).save(WORK / "mask_phone.png")
    fonts = WORK / "fonts"
    fonts.mkdir(exist_ok=True)
    shutil.copy(FONT_DIR / "seguisb.ttf", fonts / "seguisb.ttf")


# ---------------------------------------------------------------- timing
def words(line: str) -> int:
    return len(line.split())


def scene_timing(scene: dict, meta: dict) -> tuple[float, list[tuple[float, float, str]]]:
    t0 = meta["t0"]
    cues: list[tuple[float, float, str]] = []
    prev_end = 0.0
    for i, line in enumerate(scene["lines"]):
        mark = meta["marks"].get(str(i), meta["marks"].get(i))
        rel = (mark - t0) if mark is not None else prev_end
        start = max(rel + LEAD, prev_end + MIN_GAP, T + 0.3)
        dur = max(1.5, words(line) / WPS + 0.25)
        cues.append((start, start + dur, line))
        prev_end = start + dur
    recorded = meta["end"] - t0
    duration = max(recorded, (cues[-1][1] + T + 0.5) if cues else recorded)
    return duration, cues


# ---------------------------------------------------------------- per-scene clips
def frame_sequence(meta: dict, duration: float, frame_dir: Path, seq_dir: Path) -> None:
    """Resample the captured frames to exactly FPS: output frame n shows the latest frame captured at
    or before t0 + n / FPS. Hard links keep this free on disk."""
    t0 = meta["t0"]
    frames = sorted(meta["frames"], key=lambda f: f["t"])
    if seq_dir.exists():
        shutil.rmtree(seq_dir)
    seq_dir.mkdir(parents=True)
    k = 0
    for n in range(int(round(duration * FPS))):
        t = t0 + n / FPS
        while k + 1 < len(frames) and frames[k + 1]["t"] <= t:
            k += 1
        src = frame_dir / frames[k]["file"]
        dst = seq_dir / f"{n:06d}.jpg"
        try:
            os.link(src, dst)
        except OSError:
            shutil.copyfile(src, dst)


def render_scene(scene: dict, meta: dict, duration: float) -> Path:
    sid = scene["id"]
    frame_dir = FRAMES / sid
    seq = WORK / f"seq_{sid}"
    frame_sequence(meta, duration, frame_dir, seq)
    src = ["-framerate", str(FPS), "-i", str(seq / "%06d.jpg")]
    out = WORK / f"{sid}.mp4"
    enc = ["-c:v", "libx264", "-preset", "medium", "-crf", "16", "-pix_fmt", "yuv420p", "-color_range", "tv", "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", "-r", str(FPS), "-t", f"{duration:.3f}"]
    if scene["kind"] == "card":
        cmd = [FF, "-y", *src, "-vf", f"scale={W}:{H}:flags=lanczos:out_range=tv:out_color_matrix=bt709,format=yuv420p", *enc, str(out)]
    else:
        phone = sid == "mobile"
        bg, mask = ("bg_phone.png", "mask_phone.png") if phone else ("bg_app.png", "mask_app.png")
        w, h, x, y = (PHONE_W, PHONE_H, PHONE_X, PHONE_Y) if phone else (APP_W, APP_H, APP_X, APP_Y)
        graph = (
            f"[1:v]scale={w}:{h}:flags=lanczos,format=rgba[v];"
            f"[2:v]format=gray,scale={w}:{h}[m];[v][m]alphamerge[vm];"
            f"[0:v][vm]overlay={x}:{y}:shortest=1,scale=out_range=tv:out_color_matrix=bt709,format=yuv420p[o]"
        )
        cmd = [FF, "-y", "-loop", "1", "-framerate", str(FPS), "-i", str(WORK / bg), *src, "-loop", "1", "-framerate", str(FPS), "-i", str(WORK / mask), "-filter_complex", graph, "-map", "[o]", *enc, str(out)]
    run(cmd)
    shutil.rmtree(seq, ignore_errors=True)
    return out


# ---------------------------------------------------------------- subtitles
def ts_srt(s: float) -> str:
    ms = int(round(s * 1000))
    return f"{ms // 3600000:02d}:{ms // 60000 % 60:02d}:{ms // 1000 % 60:02d},{ms % 1000:03d}"


def ts_ass(s: float) -> str:
    cs = int(round(s * 100))
    return f"{cs // 360000}:{cs // 6000 % 60:02d}:{cs // 100 % 60:02d}.{cs % 100:02d}"


def write_subtitles(cues: list[tuple[float, float, str, bool]]) -> None:
    srt = []
    for k, (a, b, text, _) in enumerate(cues, 1):
        srt.append(f"{k}\n{ts_srt(a)} --> {ts_srt(b)}\n{text}\n")
    (OUT / "countersign-demo.srt").write_text("\n".join(srt), encoding="utf-8")
    head = f"""[Script Info]
ScriptType: v4.00+
PlayResX: {W}
PlayResY: {H}
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: App,Segoe UI Semibold,36,&H00FFFFFF,&H00FFFFFF,&H5A0B0D14,&H00000000,0,0,0,0,100,100,0,0,3,9,0,2,180,180,22,1
Style: Card,Segoe UI Semibold,38,&H00FFFFFF,&H00FFFFFF,&H5A0B0D14,&H00000000,0,0,0,0,100,100,0,0,3,10,0,2,180,180,60,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
    ev = [f"Dialogue: 0,{ts_ass(a)},{ts_ass(b)},{'Card' if card else 'App'},,0,0,0,,{{\\fad(180,160)}}{text}" for a, b, text, card in cues]
    (WORK / "subs.ass").write_text(head + "\n".join(ev) + "\n", encoding="utf-8")


def write_script(scenes: list[dict], starts: list[float], all_cues: list[tuple[float, float, str, bool]], total: float) -> None:
    out = ["# Countersign demo: narration script", "", f"Total length {int(total // 60)}:{total % 60:04.1f}. Read each line when its subtitle appears; every line has room to finish before the next.", ""]
    by_scene: dict[int, list[tuple[float, float, str, bool]]] = {}
    k = 0
    for i, s in enumerate(scenes):
        n = len(s["lines"])
        by_scene[i] = all_cues[k : k + n]
        k += n
    for i, s in enumerate(scenes):
        label = s.get("card", {}).get("title") or s["id"].replace("-", " ").title()
        out.append(f"## {int(starts[i] // 60)}:{int(starts[i] % 60):02d}  {label}")
        out.append("")
        if not by_scene[i]:
            out.append("_(no narration: chapter card)_")
        for a, b, text, _ in by_scene[i]:
            out.append(f"- `{int(a // 60)}:{a % 60:04.1f}` {text}")
        out.append("")
    (OUT / "narration-script.md").write_text("\n".join(out), encoding="utf-8")


# ---------------------------------------------------------------- assembly
def main(stage: str = "all") -> None:
    build_assets()
    scenes = [s for s in STORY["scenes"] if (FRAMES / s["id"] / "meta.json").exists()]
    missing = [s["id"] for s in STORY["scenes"] if s not in scenes]
    if missing:
        print("missing scenes (skipped):", missing)
    clips, durations, scene_cues = [], [], []
    only = set(sys.argv[2:])
    for s in scenes:
        meta = json.loads((FRAMES / s["id"] / "meta.json").read_text(encoding="utf-8"))
        d, cues = scene_timing(s, meta)
        clip = WORK / f"{s['id']}.mp4"
        if stage in ("all", "scenes") and (not only or s["id"] in only):
            render_scene(s, meta, d)
            print(f"{s['id']:14s} {d:6.1f} s  {len(cues)} cues")
        clips.append(clip)
        durations.append(d)
        scene_cues.append(cues)
    if stage == "scenes":
        return

    starts = [0.0]
    for d in durations[:-1]:
        starts.append(starts[-1] + d - T)
    total = starts[-1] + durations[-1]
    all_cues = [(starts[i] + a, starts[i] + b, text, scenes[i]["kind"] == "card") for i, cues in enumerate(scene_cues) for a, b, text in cues]
    write_subtitles(all_cues)
    write_script(scenes, starts, all_cues, total)
    clean = OUT / "countersign-demo-clean.mp4"
    color = ["-color_range", "tv", "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709"]

    if stage in ("all", "join"):
        # Transitions: dip through dark into chapter cards, plain cross-fades elsewhere.
        inputs: list[str] = []
        for c in clips:
            inputs += ["-i", str(c)]
        parts, last = [], "[0:v]"
        for k in range(1, len(clips)):
            kind = "fadeblack" if scenes[k]["kind"] == "card" and scenes[k]["id"] != "closing" else "fade"
            label = f"[x{k}]"
            parts.append(f"{last}[{k}:v]xfade=transition={kind}:duration={T}:offset={starts[k]:.3f}{label}")
            last = label
        graph = ";".join(parts) + f";{last}format=yuv420p[v]"
        run([FF, "-y", *inputs, "-f", "lavfi", "-t", f"{total:.3f}", "-i", "anullsrc=r=48000:cl=stereo", "-filter_complex", graph, "-map", "[v]", "-map", f"{len(clips)}:a", "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p", *color, "-r", str(FPS), "-c:a", "aac", "-b:a", "128k", "-shortest", "-movflags", "+faststart", str(clean)])
        print(f"joined: {total / 60:.2f} min")

    if stage in ("all", "burn"):
        burned = OUT / "countersign-demo.mp4"
        run([FF, "-y", "-i", str(clean), "-vf", "subtitles=subs.ass:fontsdir=fonts", "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p", *color, "-c:a", "copy", "-movflags", "+faststart", str(burned)], cwd=WORK)
        print(f"done: {total / 60:.2f} min, {len(all_cues)} subtitles -> {burned}")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "all")
