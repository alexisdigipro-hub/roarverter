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

// a small Photoshop file, written by hand: 40 x 20 RGB, a blue background layer and a red layer over its right half
// (named in Greek, through the Unicode name block), raw data, and the flattened picture
function makePsd() {
  const W = 40, H = 20;
  const u16 = (v) => { const b = Buffer.alloc(2); b.writeUInt16BE(v); return b; };
  const i16 = (v) => { const b = Buffer.alloc(2); b.writeInt16BE(v); return b; };
  const u32 = (v) => { const b = Buffer.alloc(4); b.writeUInt32BE(v); return b; };
  const plane = (w, h, v) => Buffer.alloc(w * h, v);
  const pascal = (s) => { const n = Buffer.from(s, 'latin1'); const len = n.length + 1; return Buffer.concat([Buffer.from([n.length]), n, Buffer.alloc((4 - (len % 4)) % 4)]); };
  const luni = (s) => { const t = Buffer.from(s, 'utf16le').swap16(); const body = Buffer.concat([u32(s.length), t]); const pad = body.length % 2 ? Buffer.alloc(1) : Buffer.alloc(0); return Buffer.concat([Buffer.from('8BIMluni'), u32(body.length), body, pad]); };
  const layer = (top, left, h, w, rgb, name, uname) => {
    const chans = [[-1, plane(w, h, 255)], [0, plane(w, h, rgb[0])], [1, plane(w, h, rgb[1])], [2, plane(w, h, rgb[2])]];
    const extra = Buffer.concat([u32(0), u32(0), pascal(name), uname ? luni(uname) : Buffer.alloc(0)]);
    const rec = Buffer.concat([u32(top), u32(left), u32(top + h), u32(left + w), u16(chans.length), ...chans.map(([id, d]) => Buffer.concat([i16(id), u32(d.length + 2)])),
      Buffer.from('8BIMnorm'), Buffer.from([255, 0, 0, 0]), u32(extra.length), extra]);
    const data = Buffer.concat(chans.map(([, d]) => Buffer.concat([u16(0), d])));
    return { rec, data };
  };
  const a = layer(0, 0, H, W, [0, 0, 255], 'Background');
  const b = layer(0, 20, H, 20, [255, 0, 0], 'Kokkino', 'Κόκκινο');
  let li = Buffer.concat([i16(2), a.rec, b.rec, a.data, b.data]);
  if (li.length % 2) li = Buffer.concat([li, Buffer.alloc(1)]);
  const lm = Buffer.concat([u32(li.length), li, u32(0)]);
  const flat = (c) => { const p = Buffer.alloc(W * H); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) p[y * W + x] = x >= 20 ? [255, 0, 0][c] : [0, 0, 255][c]; return p; };
  return Buffer.concat([Buffer.from('8BPS'), u16(1), Buffer.alloc(6), u16(3), u32(H), u32(W), u16(8), u16(3), u32(0), u32(0), u32(lm.length), lm, u16(0), flat(0), flat(1), flat(2)]);
}

ff('-f', 'lavfi', '-i', 'testsrc2=size=1920x1080:rate=30:duration=6', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=6', '-c:v', 'libx264', '-crf', '10', '-c:a', 'aac', '-shortest', path.join(T, 'test video.mov'));
ff('-f', 'lavfi', '-i', 'testsrc2=size=1080x1920:rate=30:duration=3', '-c:v', 'libx264', path.join(T, 'vertical.mp4'));
ff('-f', 'lavfi', '-i', 'mandelbrot=size=3000x2000', '-frames:v', '1', path.join(T, 'photo.png'));
ff('-i', path.join(T, 'photo.png'), path.join(T, 'photo.bmp'));
ff('-i', path.join(T, 'photo.png'), '-c:v', 'exr', '-pix_fmt', 'gbrpf32le', path.join(T, 'photo.exr'));
// an HLG clip, as an iPhone records it
ff('-f', 'lavfi', '-i', 'testsrc2=size=1920x1080:rate=25:duration=2', '-vf', 'zscale=pin=bt709:tin=bt709:min=bt709:p=bt2020:t=arib-std-b67:m=bt2020nc,format=yuv420p10le',
  '-c:v', 'libx265', '-x265-params', 'log-level=error', '-color_primaries', 'bt2020', '-color_trc', 'arib-std-b67', '-colorspace', 'bt2020nc', path.join(T, 'hlg.mov'));
// a LUT that makes everything red
fs.writeFileSync(path.join(T, 'red look.cube'), 'LUT_3D_SIZE 2\n' + '1.0 0.0 0.0\n'.repeat(8));
ff('-i', path.join(T, 'photo.png'), path.join(T, 'photo.dpx'));
// a moving GIF with an odd size, as they come from the web
ff('-f', 'lavfi', '-i', 'testsrc2=size=481x271:rate=15:duration=2', '-vf', 'split[a][b];[a]palettegen[p];[b][p]paletteuse', path.join(T, 'moving.gif'));
const mac = process.platform === 'darwin';
const heic = mac;
if (mac) {
  execFileSync('sips', ['-s', 'format', 'heic', path.join(T, 'photo.png'), '--out', path.join(T, 'photo.heic')], { stdio: 'ignore' });
  execFileSync('sips', ['-s', 'format', 'psd', path.join(T, 'photo.png'), '--out', path.join(T, 'photo.psd')], { stdio: 'ignore' });
}

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
  ['image', 'photo.exr', { format: 'jpeg', quality: 80 }, { w: 3000 }],
  ['image', 'photo.dpx', { format: 'png', quality: 100 }, { w: 3000 }],
  ...(mac ? [
    ['image', 'photo.psd', { format: 'webp', quality: 80 }, { w: 3000 }],
    ['image', 'photo.png', { format: 'heic', quality: 70, maxDim: 1920 }, { w: 1920 }],
  ] : [
    ['image', 'photo.png', { format: 'heic', quality: 70 }, { error: 'HEIC can be saved only on a Mac' }],
  ]),
  ['video', 'test video.mov', { format: 'mp4-h264', quality: 60, resolution: 720, speed: 'fast', audioBitrate: 128 }, { w: 1280, h: 720, d: 6 }],
  ['video', 'test video.mov', { format: 'mp4-h265', quality: 50, speed: 'fast', audioBitrate: 96 }, { w: 1920, d: 6 }],
  ['video', 'test video.mov', { format: 'mp4-h264', quality: 60, targetSizeMB: 1, speed: 'fast', audioBitrate: 96 }, { maxBytes: 1.15 * 1024 * 1024 }],
  ['video', 'test video.mov', { format: 'webm-vp9', quality: 50, resolution: 480, speed: 'fast', audioBitrate: 96 }, { h: 480 }],
  ['video', 'test video.mov', { format: 'mp4-av1', quality: 50, resolution: 480, speed: 'fast', audioBitrate: 96 }, { h: 480 }],
  ['video', 'test video.mov', { format: 'mov-prores', quality: 50, resolution: 480 }, { h: 480, codec: 'prores' }],
  ['video', 'test video.mov', { format: 'mov-prores', profile: '4444', resolution: 480 }, { h: 480, codec: 'prores' }],
  ['video', 'test video.mov', { format: 'mov-prores', profile: 'proxy', resolution: 480 }, { h: 480, codec: 'prores' }],
  ['video', 'test video.mov', { format: 'mov-dnxhr', profile: 'lb' }, { w: 1920, codec: 'dnxhd' }],
  ['video', 'test video.mov', { format: 'mov-dnxhr', profile: 'hqx', resolution: 720 }, { h: 720, codec: 'dnxhd' }],
  ['video', 'test video.mov', { format: 'mxf-dnxhr', profile: 'sq' }, { w: 1920, codec: 'dnxhd', audio: true }],
  ['video', 'test video.mov', { format: 'mxf-mpeg2' }, { w: 1920, codec: 'mpeg2video', audio: true }],
  ['video', 'test video.mov', { format: 'mkv-ffv1', resolution: 480 }, { h: 480, codec: 'ffv1', d: 6 }],
  ['video', 'test video.mov', { format: 'mpg-mpeg2', quality: 60 }, { w: 1920, codec: 'mpeg2video' }],
  ...(mac ? [
    ['video', 'test video.mov', { format: 'mp4-h264', quality: 60, hw: true }, { w: 1920, codec: 'h264', d: 6 }],
    ['video', 'test video.mov', { format: 'mp4-h265', quality: 60, hw: true, targetSizeMB: 2 }, { w: 1920, codec: 'hevc', maxBytes: 2.3 * 1024 * 1024 }],
  ] : []),
  ['video', 'test video.mov', { format: 'avi', quality: 60, removeAudio: true }, { noAudio: true }],
  ['video', 'test video.mov', { format: 'mkv-h264', quality: 60, fps: 15, trimStart: 1, trimEnd: 4, speed: 'fast' }, { d: 3 }],
  ['video', 'test video.mov', { format: 'gif', quality: 70, gifWidth: 480, fps: 12, trimEnd: 3 }, { w: 480 }],
  ['video', 'test video.mov', { format: 'webp-anim', quality: 60, gifWidth: 320, fps: 12, trimEnd: 2 }, {}],
  ['video', 'test video.mov', { format: 'mp3', audioBitrate: 192 }, { d: 6 }],
  ['video', 'test video.mov', { format: 'flac' }, { d: 6 }],
  ['video', 'test video.mov', { format: 'wav24' }, { d: 6, acodec: 'pcm_s24le' }],
  ['video', 'test video.mov', { format: 'aiff' }, { d: 6, acodec: 'pcm_s24be' }],
  ['video', 'test video.mov', { format: 'alac' }, { d: 6, acodec: 'alac' }],
  ['video', 'test video.mov', { format: 'frame-jpg', quality: 80, trimStart: 2 }, { w: 1920 }],
  ['video', 'vertical.mp4', { format: 'mp4-h264', quality: 60, resolution: 720, speed: 'fast' }, { w: 720, h: 1280 }],
  ['video', 'vertical.mp4', { format: 'mp3' }, { error: 'The file has no sound' }],
  // 0.3.0: the look, the frame, the size, the bitrate, the sound
  ['video', 'hlg.mov', { format: 'mp4-h264', quality: 60, speed: 'fast' }, { w: 1920, transfer: 'bt709' }],
  ['video', 'hlg.mov', { format: 'mp4-h265', quality: 60, speed: 'fast', hdrToSdr: false }, { w: 1920, transfer: 'arib-std-b67' }],
  ['video', 'test video.mov', { format: 'frame-png', trimStart: 1, lut: path.join(T, 'red look.cube') }, { w: 1920, red: true }],
  ['video', 'test video.mov', { format: 'mp4-h264', quality: 60, speed: 'fast', lut: path.join(T, 'red look.cube'), aspect: '9:16' }, { w: 608, h: 1080 }],
  ['video', 'test video.mov', { format: 'mp4-h264', quality: 60, speed: 'fast', aspect: '9:16', reframe: 'fit' }, { w: 1080, h: 1920, audio: true }],
  ['video', 'test video.mov', { format: 'mp4-h264', quality: 60, speed: 'fast', aspect: '1:1' }, { w: 1080, h: 1080 }],
  ['video', 'test video.mov', { format: 'mp4-h264', quality: 60, speed: 'fast', aspect: '4:5', reframe: 'fit', resolution: 720 }, { w: 720, h: 900 }],
  ['video', 'test video.mov', { format: 'mov-prores', profile: 'proxy', desqueeze: 2 }, { w: 3840, h: 1080 }],
  ['video', 'vertical.mp4', { format: 'mp4-h264', quality: 60, speed: 'fast', width: 1280, height: 720 }, { w: 1280, h: 720 }],
  ['video', 'test video.mov', { format: 'mp4-h264', bitrateMbps: 1, speed: 'fast', audioBitrate: 96 }, { maxBytes: 0.95 * 1024 * 1024 }],
  ['video', 'test video.mov', { format: 'mp4-h264', targetSizeMB: 1, twoPass: true, speed: 'fast', audioBitrate: 96 }, { minBytes: 0.85 * 1024 * 1024, maxBytes: 1.02 * 1024 * 1024 }],
  ['video', 'test video.mov', { format: 'mp4-h265', targetSizeMB: 1, twoPass: true, speed: 'fast', audioBitrate: 96 }, { minBytes: 0.8 * 1024 * 1024, maxBytes: 1.05 * 1024 * 1024 }],
  ['video', 'test video.mov', { format: 'mp4-h264', quality: 60, speed: 'fast', keyframes: 25 }, { w: 1920, d: 6 }],
  ['video', 'test video.mov', { format: 'mp3', loudness: -14, channels: 1, audioBitrate: 128 }, { d: 6, channels: 'mono', rate: 48000 }],
  ['video', 'test video.mov', { format: 'mp4-h264', quality: 60, speed: 'fast', loudness: -23, channels: 2, sampleRate: 44100 }, { channels: 'stereo', rate: 44100 }],
  // a GIF into a video (26 Oct): every format a clip gets, the odd size made even
  ['video', 'moving.gif', { format: 'mp4-h264', quality: 60, speed: 'fast' }, { w: 480, h: 270, codec: 'h264', d: 2 }],
  ['video', 'moving.gif', { format: 'mov-prores', profile: 'proxy' }, { w: 480, codec: 'prores' }],
  ['video', 'moving.gif', { format: 'webm-vp9', quality: 60, speed: 'fast', resolution: 240 }, { h: 240 }],
  ['video', 'moving.gif', { format: 'gif', quality: 70, gifWidth: 320, fps: 12 }, { w: 320 }],
  ['video', 'moving.gif', { format: 'frame-png', trimStart: 1 }, { w: 480 }],
  // for Resolume (31 Oct): DXV, HAP Q and HAP Alpha, the frame a multiple of 4 on each side (the GIF's 270 becomes 268)
  ['video', 'test video.mov', { format: 'mov-dxv', resolution: 720 }, { h: 720, codec: 'dxv', d: 6 }],
  ['video', 'test video.mov', { format: 'mov-hapq', resolution: 720 }, { h: 720, codec: 'hap', d: 6 }],
  ['video', 'moving.gif', { format: 'mov-hapa' }, { w: 480, h: 268, codec: 'hap' }],
  ['video', 'moving.gif', { format: 'mov-dxv' }, { w: 480, h: 268, codec: 'dxv' }],
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
      if (kind === 'image' && !p.width) { const m = await require('sharp')(out).metadata(); p.width = m.width; p.height = m.height; }
      const bad = [];
      if (want.error) bad.push('should have failed');
      if (!size) bad.push('empty file');
      if (want.w && p.width !== want.w) bad.push(`width ${p.width}, not ${want.w}`);
      if (want.h && p.height !== want.h) bad.push(`height ${p.height}, not ${want.h}`);
      if (want.d && Math.abs(p.duration - want.d) > 0.3) bad.push(`length ${p.duration}, not ${want.d}`);
      if (want.noAudio && p.hasAudio) bad.push('still has sound');
      if (want.audio && !p.hasAudio) bad.push('lost its sound');
      if (want.codec && p.vcodec !== want.codec) bad.push(`codec ${p.vcodec}, not ${want.codec}`);
      if (want.acodec && p.acodec !== want.acodec) bad.push(`sound ${p.acodec}, not ${want.acodec}`);
      if (want.maxBytes && size > want.maxBytes) bad.push(`${size} bytes, over the target`);
      if (want.minBytes && size < want.minBytes) bad.push(`${size} bytes, far under the target`);
      if (want.transfer && p.transfer !== want.transfer) bad.push(`transfer ${p.transfer}, not ${want.transfer}`);
      if (want.channels && p.channels !== want.channels) bad.push(`${p.channels}, not ${want.channels}`);
      if (want.rate && p.sampleRate !== want.rate) bad.push(`${p.sampleRate} Hz, not ${want.rate}`);
      if (want.red) { const st = await require('sharp')(out).stats(); const [r, g, b] = st.channels.map((ch) => ch.mean); if (!(r > 200 && g < 40 && b < 40)) bad.push(`not red: ${Math.round(r)},${Math.round(g)},${Math.round(b)}`); }
      if (bad.length) { failed++; console.log(`✗ ${label}: ${bad.join(', ')}`); } else console.log(`✓ ${label} (${Math.round(size / 1024)} KB)`);
    } catch (e) {
      if (want.error && e.message.startsWith(want.error)) console.log(`✓ ${label}: ${e.message}`);
      else { failed++; console.log(`✗ ${label}: ${e.message}`); }
    }
  }
  // a PSD read by RoarMorph itself (psd.js): its flattened picture and each layer as its own PNG (Alex, 30 Oct)
  {
    const bad = [];
    const file = path.join(T, 'layers.psd');
    fs.writeFileSync(file, makePsd());
    const info = require('../src/psd').readPsdInfo(file);
    if (info.width !== 40 || info.height !== 20 || info.layers !== 2 || info.depth !== 8 || info.mode !== 'RGB') bad.push(`info ${JSON.stringify(info)}`);
    if (info.names.join('|') !== 'Background|Κόκκινο') bad.push(`names ${info.names.join('|')}`);
    const png = await c.convertImage('psd', file, { format: 'png', quality: 100, outputDir: O, suffix: '_psd' });
    const raw = await require('sharp')(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const at = (x, y) => [...raw.data.subarray((y * raw.info.width + x) * 4, (y * raw.info.width + x) * 4 + 4)].join(',');
    if (raw.info.width !== 40 || at(2, 2) !== '0,0,255,255' || at(30, 10) !== '255,0,0,255') bad.push(`flattened ${raw.info.width} ${at(2, 2)} ${at(30, 10)}`);
    const split = await c.splitPsdLayers(file, { outputDir: O, suffix: '_psd' });
    const names = fs.readdirSync(split.dir).sort();
    if (split.count !== 2 || names.join('|') !== '01 Background.png|02 Κόκκινο.png') bad.push(`layers ${split.count} ${names.join('|')}`);
    else {
      const red = await require('sharp')(path.join(split.dir, names[1])).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      const px = (x, y) => [...red.data.subarray((y * 40 + x) * 4, (y * 40 + x) * 4 + 4)].join(',');
      if (red.info.width !== 40 || px(30, 10) !== '255,0,0,255' || px(2, 2) !== '0,0,0,0') bad.push(`red layer ${px(30, 10)} ${px(2, 2)}`);
    }
    if (bad.length) { failed++; console.log(`✗ PSD: ${bad.join(', ')}`); } else console.log('✓ PSD: flattened picture and 2 layers as PNG');
  }

  // what a dropped file is made of (Alex, 30 Oct): bitrates, profile, bit depth, chroma, a JPEG's quality
  {
    const bad = [];
    const v = await c.probe(path.join(T, 'test video.mov'));
    if (v.vcodec !== 'h264' || !v.vprofile) bad.push(`codec ${v.vcodec} ${v.vprofile}`);
    if (!(v.bitrate > 0 && v.vbitrate > 0 && v.abitrate > 0)) bad.push(`bitrates ${v.bitrate}/${v.vbitrate}/${v.abitrate}`);
    if (v.bitDepth !== 8 || v.chroma !== '4:2:0') bad.push(`${v.bitDepth}-bit ${v.chroma}`);
    const h = await c.probe(path.join(T, 'hlg.mov'));
    if (h.bitDepth !== 10) bad.push(`HLG ${h.bitDepth}-bit`);
    const jpg = path.join(T, 'q80.jpg');
    await require('sharp')(path.join(T, 'photo.png')).jpeg({ quality: 80 }).toFile(jpg);
    const q = c.jpegQuality(jpg);
    if (q < 77 || q > 83) bad.push(`JPEG quality ${q}, not about 80`);
    if (c.jpegQuality(path.join(T, 'photo.png')) !== 0) bad.push('a PNG has a JPEG quality');
    if (bad.length) { failed++; console.log(`✗ file facts: ${bad.join(', ')}`); } else console.log(`✓ file facts (H.264 ${v.vprofile} ${v.vbitrate} kb/s, JPEG q ${q})`);
  }
  fs.rmSync(T, { recursive: true, force: true });
  console.log(failed ? `\n${failed} failed` : '\nall good');
  process.exit(failed ? 1 : 0);
})();
