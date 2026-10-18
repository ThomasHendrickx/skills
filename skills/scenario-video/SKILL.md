---
name: scenario-video
description: Use when making an Aeolus use-case or scenario video from a script, the same story without and with Aeolus, delivered as a page and a 1080p MP4.
---

# Scenario video

A video is two data files in a workdir: `scenario.json` (what is on screen, when) and `vo.json` (what is said, when). The look, the engine and the score live in `assets/` and `scripts/`; never edit them for one video: when a story needs something they lack, say so instead. Every script takes the workdir as its first argument.

Steps:
1. Kit: when `scripts/` is not beside this file, `git clone --depth 1 --branch v3.1.0 https://github.com/ThomasHendrickx/skills` and work from its `skills/scenario-video`. Done when `scripts/build.py` exists.
2. Tools: `pip install kokoro-onnx==0.6.1 faster-whisper==1.2.1 soundfile scipy numpy pillow playwright` (add `--break-system-packages` if pip asks), `ffmpeg`, and a Chromium for Playwright (`python3 -m playwright install chromium` only when none is installed). Done when `python3 -c "import kokoro_onnx, faster_whisper, playwright"` and `ffmpeg -version` succeed.
3. Reference: copy `example/` to a workdir, run `build.py`, then `frames.py <wd> 7.5,24,37.6,44.2,50.8,60.2,75.5,86`. Done when you have looked at both sheets (the look to match) and it printed `page errors: none`.
4. Story: read `references/scenario.md`, then write a beat table on its 90-second template: the script's story as run A (without Aeolus) and run B (with Aeolus). Done when both runs hold the same decisions by the same people, and every scene has one caption and its voice lines.
5. Data: in a new workdir, write `scenario.json` and `vo.json` from the table, starting from the example's. Done when `build.py` writes `page.html`.
6. Review: `frames.py` with at least one time per caption scene and per vignette, then `check_paths.py`. Done when no sheet shows an overlap or clipped text, there are no page errors, and only `own:` hits are listed.
7. Voice: `make_vo.py`. Done when no line prints OVER (shorten the line or widen its window, then rerun).
8. Score: `make_sound.py`. Done when it prints `sound.wav at -16 LUFS`.
9. Hearing check: `check_voice.py`. Done when every missing word is only spelled differently (a respelled name, a numeral, labour and labor).
10. Export: `export.py <wd> <name>`, with nothing else running. Done when `<name>.mp4` is 1920x1080 with sound and lasts `timeline.dur`.
11. Deliver `page.html` with `sound.mp3` beside it (the page plays it by that name), and the MP4.

Story rules:
- The same call, played twice: without Aeolus, then with it. The same decisions, by the same people, in both runs; only how the work between them moves changes.
- People decide; agents and apps carry the rest. An agent steps in when a person is busy (show why) and never replaces one.
- The proof card counts only decisions by people (N of N in both runs) and hand-offs by people (some, then none). No time or money claims: the story clock tells the time.
- One caption per scene, under 12 words. Every voice line names what is on screen and says the numbers the counters show.
- Plain words: people, apps, agents, the network. No product jargon, vendor names or em dashes. The end card says "Scenario".

Gotchas:
- `export.py` takes about 6 minutes for 90 seconds on 2 cores, longer with anything heavy beside it; stopped midway, it continues from its saved frames when run again.
- The voice reads names and numbers its own way: respell names in `vo.json` (`"Jens": "Yens"`) and write times as words ("ten fifteen").
- `check_voice.py` often drops the first word of the file (check that line alone); a swallowed "-ed" before "the" is real: reword the line.
- `make_vo.py` downloads the voice model once (about 350 MB, from GitHub); `export.py` needs Google Fonts and stops when they did not load.
