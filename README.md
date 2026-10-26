# Roarverter

Converts and compresses pictures, videos and sound, all on your own computer: nothing is uploaded. Mac and Windows.
An experiment of The Mad Lions Lab, in the Roar family (RoarMe, RoarTwin, RoarWriter…).

## What it does
- **Pictures:** JPG, PNG, WebP, AVIF, TIFF, GIF, BMP and ICO out, and HEIC on a Mac. In: those, plus HEIC (iPhone),
  SVG, JFIF, TGA, JPEG 2000, PSD, EXR and DPX; on a Mac also camera RAW (DNG, CR2, CR3, NEF, ARW, RAF, ORF, RW2…),
  JPEG XL and a PDF's first page, through the system's own sips. Quality, the largest side, EXIF kept or left out.
  JPG through mozjpeg; a PNG under quality 95 becomes a palette PNG (as TinyPNG does).
- **Video for sharing:** MP4 (H.264, H.265, AV1), WebM (VP9), MOV, MKV, AVI, MPG (MPEG-2). Quality as each codec's
  CRF, resolution as the short side (so upright videos work too), frame rate, encoding speed, the sound removed, a
  start and an end. On a Mac, H.264 and H.265 can use the Mac's own encoder (several times faster); if it says no,
  the same file is made with the software one.
- **Video for the edit:** ProRes (Proxy, LT, 422, HQ, 4444 with alpha), DNxHR (LB, SQ, HQ, HQX, 444) in MOV or in
  MXF for Avid, XDCAM HD422 50 Mbit/s in MXF for broadcast, and FFV1 in MKV, lossless, for an archive.
- **A target size or a bitrate:** say 25 MB, and the bitrate is worked out from the length; or a bitrate in Mb/s, as
  Resolve's "Restrict to". With **two passes** it lands on it (a 1 MB target comes out at 0.96 MB).
- **Look & frame:** HDR (iPhone HLG, HDR10) to Rec.709 SDR, so it does not look grey; a LUT (.cube, .3dl) on every
  clip; the frame for social (16:9, 9:16, 1:1, 4:5, 2.39:1), cropped or whole with its own blurred copy behind;
  anamorphic desqueeze (1.33×, 1.5×, 1.8×, 2×); a size of your own (width × height, with bars where the shape
  differs); a keyframe every N frames.
- **Sound:** loudness to −14 LUFS (web), −16 (podcast) or −23 (TV, EBU R128); mono or stereo; 44.1 or 48 kHz.
- **Video to GIF or animated WebP**, with its own palette.
- **The sound only:** MP3, M4A (AAC), WAV 16-bit or 24-bit 48 kHz, AIFF 24-bit, ALAC, FLAC, OGG (Opus).
- **A still:** one frame, JPG or PNG, at any moment.
- Drop many files or whole folders; pictures go three at a time, videos one by one. A file Roarverter cannot read is
  named in a message, not dropped silently.
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
- On Windows, HEIC photos from an iPhone may not open, and RAW, JPEG XL and PDF do not open at all yet (a Mac reads
  them through the system's `sips`). HEIC can be saved only on a Mac.
- RED R3D, Blackmagic RAW and ARRIRAW need their makers' own SDKs and are not read.
- An animated WebP made from a video cannot be read back by ffmpeg itself, so it shows no size in the list.
