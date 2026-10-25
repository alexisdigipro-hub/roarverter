// Roarverter's conversions on real files made with ffmpeg: every picture format, every video and sound format,
// a target size, trims, an upright video, and the errors that must come back. `npm test`.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const c = require('../src/convert');

const FF = process.env.FFMPEG || path.join(__dirname, '..', 'vendor', 'ffmpeg', `${process.platform}-${process.arch}`, process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg');
c.setFfmpegPath(FF);
const T = fs.mkdtempSync(path.join(os.tmpdir(), 'roarverter-test-'));
const O = path.join(T, 'out');
fs.mkdirSync(O);
const ff = (...a) => execFileSync(FF, ['-hide_banner', '-loglevel', 'error', '-y', ...a]);

ff('-f', 'lavfi', '-i', 'testsrc2=size=1920x1080:rate=30:duration=6', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=6', '-c:v', 'libx264', '-crf', '10', '-c:a', 'aac', '-shortest', path.join(T, 'test video.mov'));
ff('-f', 'lavfi', '-i', 'testsrc2=size=1080x1920:rate=30:duration=3', '-c:v', 'libx264', path.join(T, 'vertical.mp4'));
ff('-f', 'lavfi', '-i', 'mandelbrot=size=3000x2000', '-frames:v', '1', path.join(T, 'photo.png'));
ff('-i', path.join(T, 'photo.png'), path.join(T, 'photo.bmp'));
const heic = process.platform === 'darwin';
if (heic) execFileSync('sips', ['-s', 'format', 'heic', path.join(T, 'photo.png'), '--out', path.join(T, 'photo.heic')], { stdio: 'ignore' });

// [kind, input, options, what the result must be]
const jobs = [
  ['image', 'photo.png', { format: 'jpeg', quality: 80 }, { w: 3000 }],
  ['image', 'photo.png', { format: 'webp', quality: 75, maxDim: 1920 }, { w: 1920 }],
  ['image', 'photo.png', { format: 'avif', quality: 60 }, {}],
  ['image', 'photo.png', { format: 'png', quality: 70 }, { w: 3000 }],
  ['image', 'photo.png', { format: 'ico', quality: 80 }, { w: 256 }],
  ['image', 'photo.bmp', { format: 'tiff', quality: 80 }, { w: 3000 }],
  ['image', 'photo.png', { format: 'bmp', quality: 80, maxDim: 800 }, { w: 800 }],
  ['image', 'photo.png', { format: 'gif', quality: 80, maxDim: 600 }, { w: 600 }],
  ...(heic ? [['image', 'photo.heic', { format: 'jpeg', quality: 80 }, { w: 3000 }]] : []),
  ['video', 'test video.mov', { format: 'mp4-h264', quality: 60, resolution: 720, speed: 'fast', audioBitrate: 128 }, { w: 1280, h: 720, d: 6 }],
  ['video', 'test video.mov', { format: 'mp4-h265', quality: 50, speed: 'fast', audioBitrate: 96 }, { w: 1920, d: 6 }],
  ['video', 'test video.mov', { format: 'mp4-h264', quality: 60, targetSizeMB: 1, speed: 'fast', audioBitrate: 96 }, { maxBytes: 1.15 * 1024 * 1024 }],
  ['video', 'test video.mov', { format: 'webm-vp9', quality: 50, resolution: 480, speed: 'fast', audioBitrate: 96 }, { h: 480 }],
  ['video', 'test video.mov', { format: 'mp4-av1', quality: 50, resolution: 480, speed: 'fast', audioBitrate: 96 }, { h: 480 }],
  ['video', 'test video.mov', { format: 'mov-prores', quality: 50, resolution: 480 }, { h: 480 }],
  ['video', 'test video.mov', { format: 'avi', quality: 60, removeAudio: true }, { noAudio: true }],
  ['video', 'test video.mov', { format: 'mkv-h264', quality: 60, fps: 15, trimStart: 1, trimEnd: 4, speed: 'fast' }, { d: 3 }],
  ['video', 'test video.mov', { format: 'gif', quality: 70, gifWidth: 480, fps: 12, trimEnd: 3 }, { w: 480 }],
  ['video', 'test video.mov', { format: 'webp-anim', quality: 60, gifWidth: 320, fps: 12, trimEnd: 2 }, {}],
  ['video', 'test video.mov', { format: 'mp3', audioBitrate: 192 }, { d: 6 }],
  ['video', 'test video.mov', { format: 'flac' }, { d: 6 }],
  ['video', 'test video.mov', { format: 'frame-jpg', quality: 80, trimStart: 2 }, { w: 1920 }],
  ['video', 'vertical.mp4', { format: 'mp4-h264', quality: 60, resolution: 720, speed: 'fast' }, { w: 720, h: 1280 }],
  ['video', 'vertical.mp4', { format: 'mp3' }, { error: 'The file has no sound' }],
  ['video', 'test video.mov', { format: 'nope' }, { error: 'Unknown format' }],
];

(async () => {
  let failed = 0;
  for (const [i, [kind, file, opts, want]] of jobs.entries()) {
    const label = `${opts.format.padEnd(10)} ${file}`;
    try {
      const o = { outputDir: O, suffix: `_${i}`, ...opts };
      const out = kind === 'image' ? await c.convertImage(i, path.join(T, file), o) : await c.convertMedia(i, path.join(T, file), o, () => {});
      const size = fs.statSync(out).size;
      const p = await c.probe(out);
      const bad = [];
      if (want.error) bad.push('should have failed');
      if (!size) bad.push('empty file');
      if (want.w && p.width !== want.w) bad.push(`width ${p.width}, not ${want.w}`);
      if (want.h && p.height !== want.h) bad.push(`height ${p.height}, not ${want.h}`);
      if (want.d && Math.abs(p.duration - want.d) > 0.3) bad.push(`length ${p.duration}, not ${want.d}`);
      if (want.noAudio && p.hasAudio) bad.push('still has sound');
      if (want.maxBytes && size > want.maxBytes) bad.push(`${size} bytes, over the target`);
      if (bad.length) { failed++; console.log(`✗ ${label}: ${bad.join(', ')}`); } else console.log(`✓ ${label} (${Math.round(size / 1024)} KB)`);
    } catch (e) {
      if (want.error && e.message.startsWith(want.error)) console.log(`✓ ${label}: ${e.message}`);
      else { failed++; console.log(`✗ ${label}: ${e.message}`); }
    }
  }
  fs.rmSync(T, { recursive: true, force: true });
  console.log(failed ? `\n${failed} failed` : '\nall good');
  process.exit(failed ? 1 : 0);
})();
