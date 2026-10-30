# RoarMorph

(Roarverter until 30 Oct 2026.) The name: on screen, the app file (RoarMorph.app, RoarMorph.exe) and the installers are
RoarMorph since 0.4.0. Kept as Roarverter on purpose, so nothing installed or saved breaks: the bundle id
com.themadlions.roarverter, the settings folder (main.js setPath), the repository (updater REPO), and the Roarverter-*.dmg/exe
copies on each release for old download links. The Mac app carries Contents/MacOS/Roarverter, a link to RoarMorph
(scripts/adhoc-sign.js): the 0.3.x updater takes a new app only if it holds a program of that name. 0.4.0's updater
reads the new app's own CFBundleExecutable and puts RoarMorph.app in place of Roarverter.app on the next update.

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
- **Video to GIF or animated WebP**, with its own palette, and **a GIF into a video** (MP4, MOV, ProRes, WebM…; since 0.3.1 a GIF counts as a moving picture, and an odd size like 481×271 is made even for H.264).
- **The sound only:** MP3, M4A (AAC), WAV 16-bit or 24-bit 48 kHz, AIFF 24-bit, ALAC, FLAC, OGG (Opus).
- **A still:** one frame, JPG or PNG, at any moment.
- Drop many files or whole folders; pictures go three at a time, videos one by one. A file RoarMorph cannot read is
  named in a message, not dropped silently.
- English, with Greek as a choice. Updates itself from the GitHub releases.

## The bitrate
Since 0.5.1 (Alex, 30 Oct: "set the bitrate of the compression for videos"): under Compression, By quality or By bitrate.
By bitrate: a slider from 0.5 to 150 Mb/s (even through the small values), quick choices 2 to 100 Mb/s, the number in
Mb/s, and about how big the videos in the list will come out (their length, the sound included). It is an average kept
close, as Resolve's "Restrict to" (convert.js bitrateMbps); Two passes in More options lands on it exactly; a Target
size in More options still wins over both. A bitrate set in More options before 0.5.1 becomes this choice.

## What a file is made of
Since 0.5.1 (Alex, 30 Oct: "read its bitrate and compression from the metadata and write it"): every dropped file shows
a line under its chips. A video: codec and profile (H.264 High, ProRes HQ), its bitrate, frame rate, bit depth and
chroma, and its sound (AAC LC 256 kb/s, PCM 24-bit). Sound alone: codec, bitrate, kHz, channels. A picture: format, a
JPEG's quality (read from its quantization table, convert.js jpegQuality), chroma, bit depth, bits a pixel and how much
smaller it is than its raw pixels. ffmpeg's own description gives the video facts (convert.js streamFacts), sharp the
picture's; both are tested in test/convert.test.js.

Again (0.5.1, Alex, 30 Oct: "redo a file already in the list"): a finished row has a round Again button, and the list
head Again for all: the row goes back to ready with the choices as they are now, and the next Convert makes a new file
beside the first (never over it). Dropping a finished file in again does the same.

The window opens at 1240 x 840 in the middle of the screen for everyone (smaller only on a smaller screen).

## Settings
Since 0.5.0 (Alex, 30 Oct: "RoarMorph needs settings and auto update"): the gear at the top right, or Cmd/Ctrl+,.
Language (English, Ελληνικά); Updates: the version, Check now, Restart to update when one is ready, and Update by
itself (on: it looks every two hours, brings the new version in the background and puts it in when RoarMorph closes;
off: it looks only on Check now; src/updater.js `rv:update-auto`); When the files are ready: a notification when a batch
ends while RoarMorph is not in front, with or without the computer's sound; Reset the choices (the conversion choices
back to the start, language and updates kept); Privacy & Terms (opens in the browser).

## Look
Since 0.4.1 (30 Oct) RoarMorph wears RoarMail's look, as RoarKit, RoarWriter and RoarList do: `src/theme.css` over
`src/styles.css` (graphite glass columns floating on a graphite backdrop, one red accent that glows, the chosen thing lit
from inside, 12px corners, the wordmark in Jost from `src/fonts`, OFL).

## Download
From [themadlions.com/lab/roarmorph](https://themadlions.com/lab/roarmorph/), or the newest release:
Mac with Apple Silicon `RoarMorph-Mac-arm64.dmg` · Mac with Intel `RoarMorph-Mac-x64.dmg` · Windows
`RoarMorph-Windows-Setup.exe`.

The app is not signed by Apple: the first time, right-click RoarMorph in Applications and choose Open (or System
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
