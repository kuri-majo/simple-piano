# simple-piano

A tiny browser piano: two octaves of keys (C4–C6) you can click, tap, or
play from your computer keyboard. Each note you play is shown on a treble
staff above the keys.

Sound is synthesized in the browser with the Web Audio API; the server is a
minimal Flask app on Cloud Run that just serves the page.

## Run locally

```bash
uv sync
uv run python src/main.py
```

Then open http://localhost:8080.
