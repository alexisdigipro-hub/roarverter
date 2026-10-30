# RoarMorph (Roarverter until 30 Oct 2026) · instructions for Claude Code

RoarMorph converts and compresses pictures, videos and sound on your own computer. The Mad Lions Lab
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
- Every picture goes through one filter graph, `pictureGraph()` in convert.js, from [0:v] to [v]: desqueeze, HDR to
  Rec.709 (zscale + tonemap, only when the source's transfer is HLG or PQ), LUT, reframe, size, frame rate. New
  picture options belong there, so stills, GIFs and videos all get them.
- The static ffmpegs differ: only the Apple Silicon one has SVT-AV1 (AV1 falls back to libaom); VideoToolbox is in
  both Mac ones (the `hw` option, with a software retry). Check `-encoders` before using a new encoder.
- ffmpeg is a static binary per platform in `vendor/ffmpeg/<platform>-<arch>/` (scripts/fetch-ffmpeg.js, run by
  `npm install`); packaged as `resources/bin/ffmpeg`. The Mac build makes arm64 and x64 from one machine, so
  `dist:mac` fetches both ffmpegs and both sharp binaries (scripts/sharp-mac.js).
- Look since 0.4.1 (Alex, 30 Oct: "RoarWriter, RoarList, RoarMorph, RoarKit exactly alike, as RoarMail"): src/theme.css,
  loaded after styles.css, is RoarMail's Simba (floating graphite glass columns, red #d40000 that glows, the chosen thing
  lit from inside, 12px corners, Jost wordmark from src/fonts). Keep it in step with RoarMail and RoarKit's app/theme.css.
- Releases: bump `version` in package.json, tag `vX.Y.Z`, push the tag (.github/workflows/desktop.yml); the release's
  files are the download links (themadlions.com/lab/roarmorph/) and what src/updater.js looks at.
- Work on a branch, open a PR, wait for the green check (.github/workflows/check.yml), merge it yourself.
- The name (Alex, 30 Oct): RoarMorph on screen, in the app file and the installers; bundle id, settings folder (main.js
  setPath), repo and the Roarverter-* release copies stay Roarverter, and the Mac app keeps Contents/MacOS/Roarverter
  (scripts/adhoc-sign.js) for the 0.3.x updater. See README.
- Settings (Alex, 30 Oct, 0.5.0): the gear in the top row opens a glass window (index.html #settings, renderer.js setOpen):
  language, updates (updater.js auto flag through rv:update-auto, checkedAt), the notification when a batch ends (tellDone),
  reset. New settings go there, as a DEFAULTS key with an input of the same id.
