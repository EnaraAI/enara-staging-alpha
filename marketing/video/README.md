# ENARA school film (marketing only; no product code)

- `narration.json`: the script (English) with Arabic subtitles, per scene. `tts.py` + `.github/workflows/marketing-tts.yml` make the narration on GitHub (open TTS model Kokoro-82M, Apache-2.0, voice `af_heart`) and publish it to `claude/tutor-marketing-assets`.
- `film.html`: deterministic motion graphics (render(t)); `render.js`: frames -> ffmpeg (16:9 and 9:16), plan, stills, SRT.
- `music.py`: original background music composed in code (owned by ENARA).
- `mix.py`: narration + ducked music -> final MP4.
- Fonts: Inter (system) and Noto Sans Arabic (SIL OFL 1.1, `assets/`). Pictures: ENARA's own kids set.
