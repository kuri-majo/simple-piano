# simple-piano

A two-octave (C4–C6) playable piano in the browser. Pressing a key plays its
note and draws it on a treble-clef staff above the keyboard. No sign-in: the
Cloud Run service is deployed public (`--allow-unauthenticated`).

This repo is one of several independent apps linked from the organisatrix
hub — see that repo's `AGENTS.md` for the shared conventions (single GCP
project, Cloud Run + Artifact Registry + Workload Identity Federation,
scale-to-zero only, budget alerts). This file only holds what's specific to
this app.

## What this app does

- Everything happens client-side in `src/static/`: `piano.js` builds the
  keyboard, synthesizes sound with the Web Audio API (additive synth, no
  audio files), and renders notes as SVG on a treble staff.
- `src/main.py` is a Flask app that only serves those static files.
- Input: mouse/touch (multi-touch and glissando via pointer events) and the
  computer keyboard, mapped by physical key code (`KeyZ`…`KeyM` lower
  octave, `KeyQ`…`KeyI` upper octave, the row above each for black keys),
  so the layout works on QWERTZ/AZERTY too.
- Staff: recent notes scroll left to right; notes pressed while the latest
  note is still held stack into a chord. Sharps are spelled as sharps
  (C♯, not D♭).
- Staff glyphs (clef, note heads, ♯) use Bravura, a SMuFL engraving font,
  served unmodified from `src/static/fonts/` (SIL OFL 1.1, license file
  alongside — keep it there, and don't subset/modify the font without
  renaming it, since "Bravura" is a Reserved Font Name). Glyph placement
  uses Bravura's published metrics (`redist/Bravura.json` in
  steinbergmedia/bravura): font-size = 4 staff spaces, stems on the
  `stemUpSE`/`stemDownNW` anchors.
- Stems follow engraving rules: up below the middle line, down on/above
  it; 3.5 spaces long but always reaching the middle line; in chords,
  notes a second apart sit on opposite sides of the stem.

## GCP APIs used

None beyond a plain Cloud Run deploy.

## Running locally

```bash
uv sync
uv run python src/main.py
```

Serves on `http://localhost:8080`.

## Deploying

Push to `main` — GitHub Actions builds the container and deploys it to
Cloud Run (`.github/workflows/deploy.yml`). The deploy service account and
the `GCP_PROJECT_ID`, `GCP_WORKLOAD_IDENTITY_PROVIDER`, `GCP_SERVICE_ACCOUNT`
repository variables are set up per organisatrix's `infra/README.md` step 4.
