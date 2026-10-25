# Roarverter

Converts and compresses pictures, videos and sound, all on your own computer: nothing is uploaded. Mac and Windows.
An experiment of The Mad Lions Lab, in the Roar family (RoarMe, RoarTwin, RoarWriter…).

## What it does
- **Pictures:** JPG, PNG, WebP, AVIF, TIFF, GIF, BMP and ICO out; HEIC (iPhone), SVG, JFIF and TGA in too. Quality,
  the largest side, and EXIF kept or left out. JPG through mozjpeg; a PNG under quality 95 becomes a palette PNG (as
  TinyPNG does).
- **Video:** MP4 (H.264, H.265, AV1), WebM (VP9), MOV (H.264, ProRes), MKV and AVI. Quality as each codec's CRF,
  resolution as the short side (so upright videos work too), frame rate, encoding speed, the sound removed, a start
  and an end.
- **A target size:** say 25 MB, and the bitrate is worked out from the length (one pass, so it lands close to it).
- **Video to GIF or animated WebP**, with its own palette.
- **The sound only:** MP3, M4A, WAV, FLAC, OGG.
- **A still:** one frame, JPG or PNG, at any moment.
- Drop many files or whole folders; pictures go three at a time, videos one by one.
- English, with Greek as a choice. Updates itself from the GitHub releases.

## Download
From [themadlions.com/lab/roarverter](https://themadlions.com/lab/roarverter/), or the newest release:
Mac with Apple Silicon `Roarverter-Mac-arm64.dmg` · Mac with Intel `Roarverter-Mac-x64.dmg` · Windows
`Roarverter-Windows-Setup.exe`.

The app is not signed by Apple: the first time, right-click Roarverter in Applications and choose Open (or System
Settings › Privacy & Security › Open Anyway). On Windows: More info › Run anyway.

## Working on it
```bash
npm install        # also fetches ffmpeg for this computer into vendor/
npm start          # runs the app
npm test           # every conversion on real files made with ffmpeg
npm run dist:mac   # .dmg for Apple Silicon and Intel, in out/
npm run dist:win   # the Windows installer, in out/
```

A release: bump `version` in package.json, tag `vX.Y.Z` and push the tag; `.github/workflows/desktop.yml` builds on
GitHub's Macs and Windows and puts the files on the release.

## Where things are
- `src/convert.js`: every conversion (sharp for pictures, ffmpeg for video and sound)
- `src/main.js`, `src/preload.js`: the window, the file dialogs, IPC
- `src/updater.js`: the self-update, as in the other Roar apps
- `src/index.html`, `src/renderer.js`, `src/styles.css`: the page, with its Greek in `EL`
- `scripts/fetch-ffmpeg.js`: static ffmpeg per platform; `scripts/sharp-mac.js`: both Mac sharp binaries;
  `scripts/adhoc-sign.js`: the ad hoc signature a Mac needs

## Known limits
- On Windows, HEIC photos from an iPhone may not open (a Mac reads them through the system's `sips`).
- An animated WebP made from a video cannot be read back by ffmpeg itself, so it shows no size in the list.
