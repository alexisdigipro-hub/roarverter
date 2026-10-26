# Roarverter · instructions for Claude Code

Roarverter converts and compresses pictures, videos and sound on your own computer. The Mad Lions Lab
(Alex Konstantinidis, film director, Athens; not a developer). Talk to him in Greek, friendly and concrete, no em
dashes; the app's own text is English by default, with Greek as a choice (renderer.js: `t()` and the `EL` table,
English text as the key; in index.html `data-i18n`, `data-i18n-html`, `data-i18n-ph`, `data-i18n-label`). Every new
text goes through `t()` or a data-i18n attribute and gets its Greek.

- Electron app (Mac and Windows), no build step: `src/index.html`, `renderer.js`, `styles.css` are the page;
  `src/main.js` the window and IPC, `src/preload.js` what the page may ask, `src/updater.js` the self-update.
- `src/convert.js` does every conversion, plain Node: sharp for pictures, ffmpeg for video and sound (and for BMP,
  ICO, and any picture sharp cannot read). On a Mac the system's `sips` reads HEIC, RAW, PSD, EXR, JPEG XL and PDF and
  writes HEIC; on Windows those say so in a clear error. Change it only with `npm test` passing, with the Apple
  Silicon ffmpeg and with `FFMPEG=vendor/ffmpeg/darwin-x64/ffmpeg npm test` (Intel and Windows have no SVT-AV1).
- The static ffmpegs differ: only the Apple Silicon one has SVT-AV1 (AV1 falls back to libaom); VideoToolbox is in
  both Mac ones (the `hw` option, with a software retry). Check `-encoders` before using a new encoder.
- ffmpeg is a static binary per platform in `vendor/ffmpeg/<platform>-<arch>/` (scripts/fetch-ffmpeg.js, run by
  `npm install`); packaged as `resources/bin/ffmpeg`. The Mac build makes arm64 and x64 from one machine, so
  `dist:mac` fetches both ffmpegs and both sharp binaries (scripts/sharp-mac.js).
- Look: RoarMe's dark glass, as RoarTwin (graphite, round glass buttons, pill fields, soft tiles, the chosen option
  as glass with the sliding lens), accent #ff453a.
- Releases: bump `version` in package.json, tag `vX.Y.Z`, push the tag (.github/workflows/desktop.yml); the release's
  files are the download links (themadlions.com/lab/roarverter/) and what src/updater.js looks at.
- Work on a branch, open a PR, wait for the green check (.github/workflows/check.yml), merge it yourself.
