# Demo video

A scripted, reproducible pipeline for the Countersign product demo: it drives the real running app in a browser, captures sharp frames, and composes them into a finished video with chapter cards, transitions, and subtitles. Nothing in the video is mocked; every screen is the live product with synthetic data and real gpt-oss-20b drafts.

| File | Purpose |
|---|---|
| `storyboard.json` | Scenes in order, chapter cards, and every narration line (one subtitle per line) |
| `record.mjs` | Prepares the demo data, pre-generates the model drafts, then records each scene with a visible cursor, smooth scrolling, and camera zooms; marks the moment each narration line starts |
| `cards/card.html` | Animated title, chapter, architecture, and closing cards |
| `compose.py` | Frames each scene on a branded background, joins scenes with cross-fades, times subtitles to the marks, and writes the outputs |
| `voice.py` | Lays a recorded voice-over under the video, places each spoken line on its moment, and burns word-by-word captions |
| `voiceover.txt` | What the narrator actually says, one row per narration line; the caption text |

## Regenerate

Start the app first (API on port 8000 with a Groq key, web on port 5173), then:

```bash
node demo-video/record.mjs                       # resets demo data and records every scene
node demo-video/record.mjs root meal             # re-record selected scenes only
uv run --no-project --with imageio-ffmpeg --with pillow python demo-video/compose.py
```

Outputs land in `demo-video/out/` (not committed):

| Output | Use |
|---|---|
| `countersign-demo.mp4` | Final video with subtitles burned in |
| `countersign-demo-clean.mp4` | The same video without subtitles, for editing in the voice-over |
| `countersign-demo.srt` | Subtitles as a separate track (YouTube accepts it directly) |
| `narration-script.md` | The voice-over script with the timestamp of every line |

## Timing rules

- A subtitle appears 0.3 s after its moment starts on screen, never during a transition, and stays for the time the line takes to say at 2.35 words per second (about 140 words per minute), plus a short tail.
- Lines are at least 0.3 s apart, so the narrator always has a breath between them.
- Chapter cards carry no narration; they give the voice a natural pause.

## Recording the voice-over

1. Open `narration-script.md` and play `countersign-demo.mp4`.
2. Read each line as its subtitle appears. Each one has room to finish at a calm pace.
3. Record the voice as one take, then let `voice.py` lay it under the video (below).

## Adding the recorded voice

`voice.py` turns one continuous voice recording into the final video:

```bash
uv run --no-project --with faster-whisper --with imageio-ffmpeg --with pillow --with numpy \
    python demo-video/voice.py path/to/voice.wav            # transcribe, build, burn
```

- **Transcribe.** faster-whisper (`medium.en`, on the CPU) gives every spoken word a time.
- **Place.** Each word is assigned to its narration line. Each spoken line then moves so its first word lands on the moment its scene shows, keeping the narrator's own pacing inside the line. The recording is gated, so the pauses between lines are silent and moving lines leaves no audible cut.
- **Caption.** `voiceover.txt` holds what the narrator actually says, one row per narration line, with recognition slips corrected and numbers written as they appear on screen. Captions show short phrases, and each word fades in as it is spoken.
- **Output.** `out/countersign-demo-voice.mp4` (voice and captions), `out/countersign-demo-voice-clean.mp4` (voice only), `out/countersign-demo-voice.srt`, and `out/voice/placement.txt` (where every line landed, what was heard, and what is shown).

If the narration is re-recorded, transcribe first (`... voice.py voice.wav transcribe`), adjust `voiceover.txt` to the new wording, then run `build` and `burn`.
