#!/usr/bin/env node
// A stand-in for RoarPlay's camera readers (roarplay-braw, roarplay-r3d), so the BRAW and RED path through ffmpeg is
// tested on any machine: it speaks as they do (info / video / audio) about a made-up clip of 160x90, 24 fps, 48
// frames, with sound. Frame n is one colour whose red is n * 5, so a test can tell which frame came out. As the
// real readers: RGBA from BRAW, BGRA from RED, the sound as 24-bit (BRAW) or 32-bit (RED) little-endian PCM.
const path = require('path');
const red = /r3d/.test(path.basename(process.argv[1]));
const [cmd, clip, a3, a4] = process.argv.slice(2);
const W = 160, H = 90, FPS = 24, FRAMES = 48, RATE = 48000, CH = 2, BITS = red ? 32 : 24;
if (!clip || /broken/.test(clip)) { process.stderr.write(red ? 'Not a RED or N-RAW clip, or it cannot be read\n' : 'Not a Blackmagic RAW clip, or it cannot be read (SDK code 0x80004005)\n'); process.exit(1); }
process.stdout.on('error', () => process.exit(0));
if (cmd === 'info') {
  console.log(JSON.stringify({ width: W, height: H, fps: FPS, frames: FRAMES, timecode: '01:00:00:00', camera: red ? 'V-RAPTOR' : 'URSA Cine 12K', audio: { channels: CH, bits: BITS, rate: RATE, samples: (FRAMES / FPS) * RATE } }));
} else if (cmd === 'video') {
  const s = +a4 || 1, w = Math.floor(W / s), h = Math.floor(H / s);
  (async () => {
    for (let f = +a3 || 0; f < FRAMES; f++) {
      const b = Buffer.alloc(w * h * 4);
      for (let i = 0; i < w * h; i++) { const R = f * 5, G = 40, B = 200; b[i * 4] = red ? B : R; b[i * 4 + 1] = G; b[i * 4 + 2] = red ? R : B; b[i * 4 + 3] = 255; }
      if (!process.stdout.write(b)) await new Promise((r) => process.stdout.once('drain', r));
    }
  })();
} else if (cmd === 'audio') {
  const n = (FRAMES / FPS) * RATE - (+a3 || 0), bytes = BITS / 8;
  const b = Buffer.alloc(Math.max(0, n) * CH * bytes);
  for (let i = 0; i < n * CH; i++) { const v = Math.round(Math.sin(i / 20) * 0.3 * 2 ** (BITS - 1)); if (bytes === 4) b.writeInt32LE(v, i * 4); else b.writeIntLE(v, i * 3, 3); }
  process.stdout.write(b);
} else { process.stderr.write('usage: roarplay-braw info|video|audio <clip> ...\n'); process.exit(1); }
