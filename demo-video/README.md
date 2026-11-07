# Demo video

A scripted, reproducible pipeline for the Countersign product demo: it drives the real running app in a browser, captures sharp frames, and composes them into a finished video with chapter cards, transitions, and subtitles. Nothing in the video is mocked; every screen is the live product with synthetic data and real gpt-oss-20b drafts.

| File | Purpose |
|---|---|
| `storyboard.json` | Scenes in order, chapter cards, and every narration line (one subtitle per line) |
| `record.mjs` | Prepares the demo data, pre-generates the model drafts, then records each scene with a visible cursor, smooth scrolling, and camera zooms; marks the moment each narration line starts |
| `cards/card.html` | Animated title, chapter, architecture, and closing cards |
| `compose.py` | Frames each scene on a branded background, joins scenes with cross-fades, times subtitles to the marks, and writes the outputs |

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
3. Record the voice as one take or line by line, then lay it under `countersign-demo.mp4` (subtitles burned in) in any editor. To keep subtitles switchable instead, use `countersign-demo-clean.mp4` and attach `countersign-demo.srt` as captions on YouTube.
