const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn, execFile } = require('child_process');
const sharp = require('sharp');

const IS_WIN = process.platform === 'win32';
let FFMPEG = path.join(__dirname, '..', 'vendor', 'ffmpeg', `${process.platform}-${process.arch}`, IS_WIN ? 'ffmpeg.exe' : 'ffmpeg');
const setFfmpegPath = (p) => { FFMPEG = p; };

const IMAGE_EXT = ['jpg', 'jpeg', 'png', 'webp', 'avif', 'tif', 'tiff', 'gif', 'bmp', 'heic', 'heif', 'svg', 'ico', 'jfif', 'tga', 'jp2'];
const VIDEO_EXT = ['mp4', 'mov', 'm4v', 'mkv', 'webm', 'avi', 'wmv', 'flv', 'mpg', 'mpeg', 'ts', 'mts', 'm2ts', '3gp', 'ogv', 'vob', 'mxf'];
const AUDIO_EXT = ['mp3', 'wav', 'm4a', 'aac', 'flac', 'ogg', 'opus', 'wma', 'aiff', 'aif'];

const running = new Map(); // id -> child process

function kindOf(file) {
  const ext = path.extname(file).slice(1).toLowerCase();
  if (IMAGE_EXT.includes(ext)) return 'image';
  if (VIDEO_EXT.includes(ext)) return 'video';
  if (AUDIO_EXT.includes(ext)) return 'audio';
  return null;
}

function cancel(id) {
  const p = running.get(id);
  if (p) { p.cancelled = true; p.kill('SIGKILL'); }
}

function cancelAll() {
  for (const id of running.keys()) cancel(id);
}

// ---------- Helpers ----------

function uniquePath(dir, base, ext) {
  let p = path.join(dir, `${base}.${ext}`);
  let i = 1;
  while (fs.existsSync(p)) p = path.join(dir, `${base} (${i++}).${ext}`);
  return p;
}

function outputPathFor(input, ext, opts) {
  const dir = opts.outputDir || path.dirname(input);
  const base = path.basename(input, path.extname(input)) + (opts.suffix ?? '_converted');
  return uniquePath(dir, base, ext);
}

function parseDuration(text) {
  const m = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(text);
  return m ? (+m[1]) * 3600 + (+m[2]) * 60 + parseFloat(m[3]) : 0;
}

// What a file holds, from `ffmpeg -i` (it prints the metadata on stderr)
function probe(file) {
  return new Promise((resolve) => {
    execFile(FFMPEG, ['-hide_banner', '-i', file], { maxBuffer: 10 * 1024 * 1024 }, (_err, _out, stderr) => {
      const video = /Stream #.*Video: ([^,\s]+).*?, (\d{2,5})x(\d{2,5})/.exec(stderr);
      const fps = /(\d+(?:\.\d+)?) fps/.exec(stderr);
      resolve({
        duration: parseDuration(stderr),
        hasAudio: /Stream #.*Audio:/.test(stderr),
        hasVideo: !!video,
        vcodec: video?.[1],
        width: video ? +video[2] : 0,
        height: video ? +video[3] : 0,
        fps: fps ? parseFloat(fps[1]) : 0,
      });
    });
  });
}

function runFfmpeg(id, args, duration, onProgress) {
  return new Promise((resolve, reject) => {
    const p = spawn(FFMPEG, ['-hide_banner', '-y', '-nostats', '-progress', 'pipe:1', ...args]);
    running.set(id, p);
    let err = '';
    let buf = '';
    p.stdout.on('data', (d) => {
      buf += d.toString();
      const lines = buf.split('\n');
      buf = lines.pop();
      for (const l of lines) {
        const m = /^out_time_(?:us|ms)=(\d+)/.exec(l);
        if (m && duration > 0) onProgress(Math.min(0.99, +m[1] / 1e6 / duration));
      }
    });
    p.stderr.on('data', (d) => { err = (err + d.toString()).slice(-4000); });
    p.on('close', (code, signal) => {
      running.delete(id);
      if (p.cancelled) return reject(new Error('Cancelled'));
      if (code === 0) return resolve();
      const lastLines = err.trim().split('\n').slice(-3).join(' | ');
      reject(new Error(lastLines || `ffmpeg exit ${code ?? signal}`));
    });
    p.on('error', reject);
  });
}

function scaleFilter(maxW, maxH) {
  // only ever smaller, never bigger, same proportions, even sizes
  if (maxW && maxH) return `scale='min(iw,${maxW})':'min(ih,${maxH})':force_original_aspect_ratio=decrease:force_divisible_by=2`;
  if (maxW) return `scale='min(iw,${maxW})':-2`;
  if (maxH) return `scale=-2:'min(ih,${maxH})'`;
  return null;
}

// ---------- Pictures ----------

async function decodeFallback(input) {
  // HEIC, BMP, ICO and the like that sharp cannot read: first into a temporary PNG
  const tmp = path.join(os.tmpdir(), `mc-${Date.now()}-${Math.random().toString(36).slice(2)}.png`);
  const ext = path.extname(input).slice(1).toLowerCase();
  if (process.platform === 'darwin' && ['heic', 'heif'].includes(ext)) {
    await new Promise((res, rej) => execFile('sips', ['-s', 'format', 'png', input, '--out', tmp], (e) => (e ? rej(e) : res())));
  } else {
    await new Promise((res, rej) => execFile(FFMPEG, ['-hide_banner', '-y', '-i', input, '-frames:v', '1', tmp], (e, _o, se) => (e ? rej(new Error(se.split('\n').slice(-2).join(' '))) : res())));
  }
  return tmp;
}

async function convertImage(id, input, o) {
  const fmt = o.format === 'original' ? normalizeImageExt(path.extname(input).slice(1)) : o.format;
  const ext = fmt === 'jpeg' ? 'jpg' : fmt;
  const out = outputPathFor(input, ext, o);

  if (fmt === 'bmp' || fmt === 'ico') {
    // sharp does not write BMP or ICO: ffmpeg does
    const args = ['-i', input];
    const vf = [];
    if (fmt === 'ico') vf.push("scale='min(256,iw)':'min(256,ih)':force_original_aspect_ratio=decrease");
    else if (o.maxDim) vf.push(`scale='min(iw,${o.maxDim})':'min(ih,${o.maxDim})':force_original_aspect_ratio=decrease`);
    if (vf.length) args.push('-vf', vf.join(','));
    args.push('-frames:v', '1', out);
    await runFfmpeg(id, args, 0, () => {});
    return out;
  }

  const animated = fmt === 'gif' || fmt === 'webp';
  try {
    await encodeImage(sharp(input, { animated, limitInputPixels: false }), fmt, o, out);
  } catch (e) {
    // formats sharp cannot decode (HEIC, BMP, ICO, TGA…): through a PNG first
    fs.rm(out, () => {});
    let tmp;
    try {
      tmp = await decodeFallback(input);
    } catch {
      throw new Error(`Cannot read the picture: ${e.message.split('\n').pop()}`);
    }
    try {
      await encodeImage(sharp(tmp, { limitInputPixels: false }), fmt, o, out);
    } finally {
      fs.rm(tmp, () => {});
    }
  }
  return out;
}

async function encodeImage(base, fmt, o, out) {
  const q = Math.round(o.quality);
  let img = base.rotate(); // follows the EXIF orientation
  if (o.keepMetadata) img = img.keepMetadata();
  if (o.maxDim) {
    img = img.resize({ width: o.maxDim, height: o.maxDim, fit: 'inside', withoutEnlargement: true });
  }
  if (fmt === 'jpeg') {
    img = img.flatten({ background: '#ffffff' }).jpeg({ quality: q, mozjpeg: true, progressive: true });
  } else if (fmt === 'png') {
    // below 95, a palette PNG (as TinyPNG does)
    img = q < 95 ? img.png({ palette: true, quality: q, compressionLevel: 9, effort: 8 }) : img.png({ compressionLevel: 9 });
  } else if (fmt === 'webp') {
    img = img.webp({ quality: q, lossless: q >= 100, effort: 5 });
  } else if (fmt === 'avif') {
    img = img.avif({ quality: Math.max(1, q - 10), lossless: q >= 100, effort: 5 });
  } else if (fmt === 'tiff') {
    img = img.tiff({ quality: q, compression: q >= 100 ? 'lzw' : 'jpeg' });
  } else if (fmt === 'gif') {
    img = img.gif({ effort: 8, colours: Math.max(16, Math.round((q / 100) * 256)) });
  } else {
    throw new Error(`Cannot save in this format: ${fmt}`);
  }
  await img.toFile(out);
}

function normalizeImageExt(ext) {
  ext = ext.toLowerCase();
  if (['jpg', 'jpeg', 'jfif'].includes(ext)) return 'jpeg';
  if (['tif', 'tiff'].includes(ext)) return 'tiff';
  if (['png', 'webp', 'avif', 'gif', 'bmp'].includes(ext)) return ext;
  return 'jpeg'; // HEIC, SVG and the like become JPG
}

// ---------- Video and sound ----------

const VIDEO_FORMATS = {
  'mp4-h264': { ext: 'mp4', v: 'libx264', a: 'aac' },
  'mp4-h265': { ext: 'mp4', v: 'libx265', a: 'aac' },
  'mp4-av1': { ext: 'mp4', v: 'libsvtav1', a: 'aac' },
  'webm-vp9': { ext: 'webm', v: 'libvpx-vp9', a: 'libopus' },
  'mov-h264': { ext: 'mov', v: 'libx264', a: 'aac' },
  'mov-prores': { ext: 'mov', v: 'prores_ks', a: 'pcm_s16le' },
  'mkv-h264': { ext: 'mkv', v: 'libx264', a: 'aac' },
  'mkv-h265': { ext: 'mkv', v: 'libx265', a: 'aac' },
  avi: { ext: 'avi', v: 'mpeg4', a: 'libmp3lame' },
  gif: { ext: 'gif', gif: true },
  'webp-anim': { ext: 'webp', v: 'libwebp_anim', anim: true },
  mp3: { ext: 'mp3', audio: 'libmp3lame' },
  m4a: { ext: 'm4a', audio: 'aac' },
  wav: { ext: 'wav', audio: 'pcm_s16le' },
  flac: { ext: 'flac', audio: 'flac' },
  ogg: { ext: 'ogg', audio: 'libopus' },
  'frame-jpg': { ext: 'jpg', frame: true },
  'frame-png': { ext: 'png', frame: true },
};

// quality 0-100 to each codec's CRF
function crfFor(codec, q) {
  const t = 1 - q / 100; // 0 is the best
  switch (codec) {
    case 'libx264': return Math.round(16 + t * 20); // 16-36
    case 'libx265': return Math.round(18 + t * 20); // 18-38
    case 'libsvtav1': return Math.round(22 + t * 30); // 22-52
    case 'libaom-av1': return Math.round(22 + t * 30); // 22-52
    case 'libvpx-vp9': return Math.round(20 + t * 30); // 20-50
    default: return null;
  }
}

const SPEED = {
  libx264: { fast: 'veryfast', balanced: 'medium', small: 'slow' },
  libx265: { fast: 'veryfast', balanced: 'medium', small: 'slow' },
  libsvtav1: { fast: '10', balanced: '7', small: '5' },
  'libaom-av1': { fast: '8', balanced: '6', small: '4' },
  'libvpx-vp9': { fast: '5', balanced: '2', small: '1' },
};

// Not every static ffmpeg has the same AV1 encoder: the Apple Silicon one has SVT-AV1, the Intel Mac and Windows
// ones only libaom. AV1 uses whichever this ffmpeg has.
let encoders = null;
function hasEncoder(name) {
  encoders ??= new Promise((resolve) => {
    execFile(FFMPEG, ['-hide_banner', '-encoders'], { maxBuffer: 10 * 1024 * 1024 }, (_e, out) => resolve(String(out || '')));
  });
  return encoders.then((list) => new RegExp(`\\s${name}\\s`).test(list));
}
async function videoEncoder(v) {
  if (v === 'libsvtav1' && !(await hasEncoder('libsvtav1'))) return 'libaom-av1';
  return v;
}

async function convertMedia(id, input, o, onProgress) {
  const f = VIDEO_FORMATS[o.format];
  if (!f) throw new Error(`Unknown format: ${o.format}`);
  const info = await probe(input);
  if (o.resolution) {
    // the resolution is the short side, so it works for upright videos too
    o = info.width >= info.height ? { ...o, maxHeight: o.resolution } : { ...o, maxWidth: o.resolution };
  }
  const out = outputPathFor(input, f.ext, o);
  const args = [];
  const vf = [];

  if (o.trimStart) args.push('-ss', String(o.trimStart));
  args.push('-i', input);
  if (o.trimEnd && o.trimEnd > (o.trimStart || 0)) args.push('-t', String(o.trimEnd - (o.trimStart || 0)));

  let duration = info.duration;
  if (o.trimEnd && o.trimEnd > (o.trimStart || 0)) duration = Math.min(duration || Infinity, o.trimEnd - (o.trimStart || 0));
  else if (o.trimStart) duration = Math.max(0, duration - o.trimStart);

  const scale = scaleFilter(o.maxWidth, o.maxHeight);

  // the sound only
  if (f.audio) {
    if (!info.hasAudio) throw new Error('The file has no sound');
    args.push('-vn', '-c:a', f.audio);
    if (['libmp3lame', 'aac', 'libopus'].includes(f.audio)) args.push('-b:a', `${o.audioBitrate || 192}k`);
    args.push(out);
    await runFfmpeg(id, args, duration, onProgress);
    return out;
  }

  // one still
  if (f.frame) {
    if (!info.hasVideo) throw new Error('The file has no picture');
    if (scale) args.push('-vf', scale);
    if (f.ext === 'jpg') args.push('-q:v', String(Math.round(2 + (1 - o.quality / 100) * 20)));
    args.push('-frames:v', '1', '-update', '1', out);
    await runFfmpeg(id, args, 0, () => {});
    return out;
  }

  if (!info.hasVideo) throw new Error('The file has no video');

  // a GIF with its own palette, for a better picture
  if (f.gif) {
    const fps = o.fps || 12;
    const w = Math.min(info.width || 480, o.gifWidth || 640);
    const colors = Math.max(32, Math.round((o.quality / 100) * 256));
    args.push('-filter_complex',
      `fps=${fps},scale=${w}:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=${colors}:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4`,
      '-loop', '0', out);
    await runFfmpeg(id, args, duration, onProgress);
    return out;
  }

  if (f.anim) {
    const fps = o.fps || 15;
    const w = Math.min(info.width || 480, o.gifWidth || 640);
    args.push('-vf', `fps=${fps},scale=${w}:-1:flags=lanczos`, '-c:v', 'libwebp_anim', '-quality', String(Math.round(o.quality)), '-loop', '0', '-an', out);
    await runFfmpeg(id, args, duration, onProgress);
    return out;
  }

  if (scale) vf.push(scale);
  if (o.fps) vf.push(`fps=${o.fps}`);
  if (vf.length) args.push('-vf', vf.join(','));

  const v = await videoEncoder(f.v);
  args.push('-c:v', v);
  const speed = SPEED[v]?.[o.speed || 'balanced'];
  if (speed) args.push(['libvpx-vp9', 'libaom-av1'].includes(v) ? '-cpu-used' : '-preset', speed);

  const audioKbps = o.removeAudio || !info.hasAudio ? 0 : o.audioBitrate || 128;

  if (o.targetSizeMB && duration > 0 && v !== 'prores_ks') {
    // a target size: bitrate = size / length (4% left for the container)
    const totalKbps = (o.targetSizeMB * 8 * 1024 * 0.96) / duration;
    const vKbps = Math.max(50, Math.floor(totalKbps - audioKbps));
    args.push('-b:v', `${vKbps}k`, '-maxrate', `${Math.floor(vKbps * 1.2)}k`, '-bufsize', `${vKbps * 2}k`);
    if (['libvpx-vp9', 'libaom-av1'].includes(v)) args.push('-row-mt', '1');
  } else if (v === 'prores_ks') {
    args.push('-profile:v', o.quality >= 80 ? '3' : o.quality >= 50 ? '2' : '0', '-pix_fmt', 'yuv422p10le');
  } else if (v === 'mpeg4') {
    args.push('-q:v', String(Math.round(2 + (1 - o.quality / 100) * 18)));
  } else {
    const crf = crfFor(v, o.quality);
    args.push('-crf', String(crf));
    if (['libvpx-vp9', 'libaom-av1'].includes(v)) args.push('-b:v', '0', '-row-mt', '1');
  }

  if (['libx264', 'libx265'].includes(v)) args.push('-pix_fmt', 'yuv420p');
  if (v === 'libx265' && f.ext !== 'mkv') args.push('-tag:v', 'hvc1'); // so QuickTime and iPhones play it
  if (['libsvtav1', 'libaom-av1'].includes(v)) args.push('-pix_fmt', 'yuv420p');

  if (audioKbps === 0) args.push('-an');
  else if (f.a === 'pcm_s16le') args.push('-c:a', f.a);
  else args.push('-c:a', f.a, '-b:a', `${audioKbps}k`);

  if (['mp4', 'mov'].includes(f.ext)) args.push('-movflags', '+faststart');
  args.push('-map_metadata', o.keepMetadata ? '0' : '-1');
  args.push(out);

  await runFfmpeg(id, args, duration, onProgress);
  return out;
}

module.exports = {
  IMAGE_EXT, VIDEO_EXT, AUDIO_EXT, setFfmpegPath, kindOf, probe, convertImage, convertMedia, cancel, cancelAll,
};
