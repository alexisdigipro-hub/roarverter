const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn, execFile } = require('child_process');
const sharp = require('sharp');

const IS_WIN = process.platform === 'win32';
const IS_MAC = process.platform === 'darwin';
let FFMPEG = path.join(__dirname, '..', 'vendor', 'ffmpeg', `${process.platform}-${process.arch}`, IS_WIN ? 'ffmpeg.exe' : 'ffmpeg');
const setFfmpegPath = (p) => { FFMPEG = p; };

// camera RAW, read through the Mac's own ImageIO (sips); there is no RAW reader on Windows yet
const RAW_EXT = ['dng', 'cr2', 'cr3', 'crw', 'nef', 'nrw', 'arw', 'srf', 'sr2', 'raf', 'orf', 'rw2', 'pef', 'srw', '3fr', 'fff', 'iiq', 'mos', 'erf', 'dcr', 'mrw', 'rwl', 'x3f'];
// read only on a Mac (sips): JPEG XL and a PDF's first page
const MAC_ONLY_EXT = [...RAW_EXT, 'jxl', 'pdf'];
const IMAGE_EXT = ['jpg', 'jpeg', 'png', 'webp', 'avif', 'tif', 'tiff', 'bmp', 'heic', 'heif', 'svg', 'ico', 'jfif', 'tga', 'jp2', 'psd', 'exr', 'dpx', ...MAC_ONLY_EXT];
// a GIF is a moving picture (Alex, 26 Oct: "Roarverter does not turn a GIF into a video"): ffmpeg reads it like a clip,
// so it gets every video format (MP4, MOV, WebM… and GIF or one frame as a picture)
const VIDEO_EXT = ['gif', 'mp4', 'mov', 'm4v', 'mkv', 'webm', 'avi', 'wmv', 'flv', 'mpg', 'mpeg', 'ts', 'mts', 'm2ts', '3gp', 'ogv', 'vob', 'mxf', 'dv'];
const AUDIO_EXT = ['mp3', 'wav', 'm4a', 'aac', 'flac', 'ogg', 'opus', 'wma', 'aiff', 'aif', 'caf', 'ac3'];

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
// the bitrates, the codec's profile, bit depth and chroma, and the sound's own bitrate, from ffmpeg's description:
// "Duration: …, bitrate: 470 kb/s", "Video: h264 (High) (avc1 / …), yuv420p(progressive), 640x360 […], 333 kb/s",
// "Audio: pcm_s24le (in24 / …), 48000 Hz, stereo, s32 (24 bit), 2304 kb/s"
function streamFacts(stderr) {
  const total = /Duration:[^\n]*?bitrate: (\d+) kb\/s/.exec(stderr);
  const vline = /Stream #[^\n]*?Video: ([^\n]*)/.exec(stderr)?.[1] || '';
  const aline = /Stream #[^\n]*?Audio: ([^\n]*)/.exec(stderr)?.[1] || '';
  const vprofile = /^\w+ \(([^)/]+)\)/.exec(vline)?.[1];
  const pixfmt = /(?:^|, |\) )((?:yuvj?|gbrp?|gbrap|rgba?|bgra?|argb|abgr|nv|gray|ya|p01|xyz)[a-z0-9]*)/.exec(vline)?.[1];
  const deep = pixfmt && /(\d{2})(?:le|be)$/.exec(pixfmt);
  const chroma = !pixfmt ? undefined : /^yuvj?420|^nv12|^p01/.test(pixfmt) ? '4:2:0' : /^yuvj?422/.test(pixfmt) ? '4:2:2' : /^yuvj?444|^gbr|^rgb|^bgr|^argb|^abgr/.test(pixfmt) ? '4:4:4' : undefined;
  const aprofile = /^\w+ \(([^)/]+)\)/.exec(aline)?.[1];
  return {
    bitrate: total ? +total[1] : 0,
    vbitrate: +(/(\d+) kb\/s/.exec(vline)?.[1] || 0),
    vprofile,
    pixfmt,
    bitDepth: !pixfmt ? 0 : deep ? +deep[1] : /48|64/.test(pixfmt) ? 16 : 8,
    chroma,
    abitrate: +(/(\d+) kb\/s/.exec(aline)?.[1] || 0),
    abits: +(/\((\d+) bit\)/.exec(aline)?.[1] || 0),
    aprofile,
  };
}

// a JPEG's quality, 1 to 100, from its luminance table: libjpeg scales Annex K's table by the quality, so the table's
// sum against Annex K's gives the scale back (order does not matter for a sum). 0 when it cannot tell.
const ANNEX_K = [16, 11, 10, 16, 24, 40, 51, 61, 12, 12, 14, 19, 26, 58, 60, 55, 14, 13, 16, 24, 40, 57, 69, 56, 14, 17, 22, 29, 51, 87, 80, 62,
  18, 22, 37, 56, 68, 109, 103, 77, 24, 35, 55, 64, 81, 104, 113, 92, 49, 64, 78, 87, 103, 121, 120, 101, 72, 92, 95, 98, 112, 100, 103, 99];
function jpegQuality(file) {
  let buf;
  try { const fd = fs.openSync(file, 'r'); buf = Buffer.alloc(65536); const n = fs.readSync(fd, buf, 0, buf.length, 0); fs.closeSync(fd); buf = buf.subarray(0, n); } catch { return 0; }
  if (buf[0] !== 0xff || buf[1] !== 0xd8) return 0;
  for (let i = 2; i + 4 < buf.length;) {
    if (buf[i] !== 0xff) return 0;
    const m = buf[i + 1], len = buf.readUInt16BE(i + 2);
    if (m === 0xdb) {
      for (let j = i + 4; j < i + 2 + len && j + 65 <= buf.length;) {
        const wide = buf[j] >> 4, table = buf[j] & 15;
        j++;
        const q = [];
        for (let k = 0; k < 64; k++) { q.push(wide ? buf.readUInt16BE(j) : buf[j]); j += wide ? 2 : 1; }
        if (table === 0) {
          if (q.every((v) => v === 1)) return 100;
          const scale = (q.reduce((a, b) => a + b, 0) * 100) / ANNEX_K.reduce((a, b) => a + b, 0);
          return Math.max(1, Math.min(100, Math.round(scale <= 100 ? (200 - scale) / 2 : 5000 / scale)));
        }
      }
    }
    if (m === 0xda) return 0;
    i += 2 + len;
  }
  return 0;
}

function probe(file) {
  return new Promise((resolve) => {
    execFile(FFMPEG, ['-hide_banner', '-i', file], { maxBuffer: 10 * 1024 * 1024 }, (_err, _out, stderr) => {
      const video = /Stream #.*Video: ([^,\s]+).*?, (\d{2,5})x(\d{2,5})/.exec(stderr);
      const fps = /(\d+(?:\.\d+)?) fps/.exec(stderr);
      const audio = /Stream #.*Audio: ([^,\s]+)[^\n]*?, (\d+) Hz, ([^,\n]+)/.exec(stderr);
      // the colour: yuv420p10le(tv, bt2020nc/bt2020/arib-std-b67, …) says how the picture was made (HLG, PQ, Rec.709)
      // (one name when all three are the same: "yuv420p(tv, bt709, progressive)")
      const colour = /Stream #.*Video: [^\n]*?\((?:tv|pc), ([\w-]+)(?:\/([\w-]+)\/([\w-]+))?[,)]/.exec(stderr);
      resolve({
        duration: parseDuration(stderr),
        hasAudio: !!audio,
        acodec: audio?.[1],
        sampleRate: audio ? +audio[2] : 0,
        channels: audio?.[3]?.trim(),
        transfer: colour ? colour[3] || (colour[1] === 'progressive' ? undefined : colour[1]) : undefined,
        hasVideo: !!video,
        vcodec: video?.[1],
        width: video ? +video[2] : 0,
        height: video ? +video[3] : 0,
        fps: fps ? parseFloat(fps[1]) : 0,
        // what the file is made of, shown on its row (Alex, 30 Oct: "read its bitrate and its compression and write it")
        ...streamFacts(stderr),
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

const tmpFile = (ext) => path.join(os.tmpdir(), `rv-${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`);
const sips = (args) => new Promise((res, rej) => execFile('sips', args, (e, _o, se) => (e ? rej(new Error(String(se || e.message).trim().split('\n').pop())) : res())));

async function decodeFallback(input) {
  // HEIC, RAW, PSD, EXR, BMP, ICO and the like that sharp cannot read: first into a temporary PNG
  const tmp = tmpFile('png');
  const ext = path.extname(input).slice(1).toLowerCase();
  if (IS_MAC && ['heic', 'heif', 'psd', 'exr', ...MAC_ONLY_EXT].includes(ext)) {
    await sips(['-s', 'format', 'png', input, '--out', tmp]);
  } else if (MAC_ONLY_EXT.includes(ext)) {
    throw new Error('Opens only on a Mac for now');
  } else {
    await new Promise((res, rej) => execFile(FFMPEG, ['-hide_banner', '-y', '-i', input, '-frames:v', '1', tmp], (e, _o, se) => (e ? rej(new Error(se.split('\n').slice(-2).join(' '))) : res())));
  }
  return tmp;
}

async function convertImage(id, input, o) {
  const fmt = o.format === 'original' ? normalizeImageExt(path.extname(input).slice(1)) : o.format;
  const ext = fmt === 'jpeg' ? 'jpg' : fmt;
  const out = o._out || outputPathFor(input, ext, o);

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

  if (fmt === 'heic') {
    // there is no HEIC encoder in sharp or ffmpeg: the picture is made as a PNG, then the Mac's sips writes HEIC
    if (!IS_MAC) throw new Error('HEIC can be saved only on a Mac');
    const png = tmpFile('png');
    try {
      await convertImage(id, input, { ...o, format: 'png', quality: 100, outputDir: path.dirname(png), suffix: '', _out: png });
      await sips(['-s', 'format', 'heic', '-s', 'formatOptions', String(Math.round(o.quality)), png, '--out', out]);
    } finally {
      fs.rm(png, () => {});
    }
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
  if (['heic', 'heif'].includes(ext) && IS_MAC) return 'heic';
  return 'jpeg'; // RAW, PSD, SVG and the like become JPG
}

// ---------- Video and sound ----------

const VIDEO_FORMATS = {
  'mp4-h264': { ext: 'mp4', v: 'libx264', a: 'aac' },
  'mp4-h265': { ext: 'mp4', v: 'libx265', a: 'aac' },
  'mp4-av1': { ext: 'mp4', v: 'libsvtav1', a: 'aac' },
  'webm-vp9': { ext: 'webm', v: 'libvpx-vp9', a: 'libopus' },
  'mov-h264': { ext: 'mov', v: 'libx264', a: 'aac' },
  'mov-prores': { ext: 'mov', v: 'prores_ks', a: 'pcm_s16le', pro: 'prores' },
  'mov-dnxhr': { ext: 'mov', v: 'dnxhd', a: 'pcm_s16le', pro: 'dnxhr' },
  'mxf-dnxhr': { ext: 'mxf', v: 'dnxhd', a: 'pcm_s24le', ar: 48000, pro: 'dnxhr' },
  'mxf-mpeg2': { ext: 'mxf', v: 'mpeg2video', a: 'pcm_s24le', ar: 48000, xdcam: true },
  'mkv-ffv1': { ext: 'mkv', v: 'ffv1', a: 'flac', lossless: true },
  'mpg-mpeg2': { ext: 'mpg', v: 'mpeg2video', a: 'mp2' },
  'mkv-h264': { ext: 'mkv', v: 'libx264', a: 'aac' },
  'mkv-h265': { ext: 'mkv', v: 'libx265', a: 'aac' },
  avi: { ext: 'avi', v: 'mpeg4', a: 'libmp3lame' },
  gif: { ext: 'gif', gif: true },
  'webp-anim': { ext: 'webp', v: 'libwebp_anim', anim: true },
  mp3: { ext: 'mp3', audio: 'libmp3lame' },
  m4a: { ext: 'm4a', audio: 'aac' },
  wav: { ext: 'wav', audio: 'pcm_s16le' },
  wav24: { ext: 'wav', audio: 'pcm_s24le', ar: 48000 },
  aiff: { ext: 'aiff', audio: 'pcm_s24be' },
  alac: { ext: 'm4a', audio: 'alac' },
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

// ProRes and DNxHR: a profile, not a quality
const PRORES = { proxy: ['0', 'yuv422p10le'], lt: ['1', 'yuv422p10le'], '422': ['2', 'yuv422p10le'], hq: ['3', 'yuv422p10le'], '4444': ['4', 'yuva444p10le'] };
const DNXHR = { lb: 'yuv422p', sq: 'yuv422p', hq: 'yuv422p', hqx: 'yuv422p10le', '444': 'yuv444p10le' };
const proresFromQuality = (q) => (q >= 80 ? 'hq' : q >= 50 ? '422' : q >= 25 ? 'lt' : 'proxy');
const dnxhrFromQuality = (q) => (q >= 80 ? 'hq' : q >= 40 ? 'sq' : 'lb');

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
const HARDWARE = { libx264: 'h264_videotoolbox', libx265: 'hevc_videotoolbox' };
async function videoEncoder(v, hw) {
  if (v === 'libsvtav1' && !(await hasEncoder('libsvtav1'))) return 'libaom-av1';
  // the Mac's own video engine: several times faster, a little bigger for the same picture
  if (hw && IS_MAC && HARDWARE[v] && (await hasEncoder(HARDWARE[v]))) return HARDWARE[v];
  return v;
}

// ---------- The picture's way through: desqueeze, HDR, LUT, reframe, size, frame rate ----------

const HDR_TRANSFERS = ['smpte2084', 'arib-std-b67']; // PQ (HDR10, Dolby Vision) and HLG (iPhone)
const ASPECTS = { '16:9': 16 / 9, '9:16': 9 / 16, '1:1': 1, '4:5': 4 / 5, '4:3': 4 / 3, '2.39:1': 2.39 };
const even = (n) => Math.max(2, Math.round(n / 2) * 2);

// a path inside a filter graph: forward slashes, the drive's colon and quotes escaped (Windows too)
const filterPath = (p) => p.replace(/\\/g, '/').replace(/'/g, "\\\\'").replace(/:/g, '\\:');

// The whole picture chain as one filter graph from [0:v] to [v]; `tail` is added at its end (a GIF's palette).
function pictureGraph(o, info, tail = []) {
  const chain = [];
  let w = info.width, h = info.height;
  if (o.desqueeze && o.desqueeze > 1) {
    // anamorphic: stretch the width, square pixels
    chain.push(`scale=trunc(iw*${o.desqueeze}/2)*2:ih`, 'setsar=1');
    w = even(w * o.desqueeze);
  }
  if (o.hdrToSdr !== false && HDR_TRANSFERS.includes(info.transfer)) {
    // HDR to Rec.709 SDR, so iPhone and HDR videos do not look grey and washed out
    chain.push('zscale=t=linear:npl=100', 'format=gbrpf32le', 'zscale=p=bt709', 'tonemap=tonemap=hable:desat=0', 'zscale=t=bt709:m=bt709:r=tv', 'format=yuv420p');
  }
  if (o.lut) chain.push(`lut3d=file='${filterPath(o.lut)}'`);

  let graph = `[0:v]${chain.length ? chain.join(',') : 'null'}`;
  const a = ASPECTS[o.aspect];
  if (a && w && h) {
    // the frame for social: crop to it, or fit the whole picture with its own blurred copy behind
    // crop: the biggest frame of that shape inside the picture, never enlarged
    const cover = w / h > a ? [even(h * a), even(h)] : [even(w), even(w / a)];
    // fit: a frame whose short side is the picture's short side (1920×1080 to 9:16 is 1080×1920)
    const short = Math.min(w, h);
    const fit = a < 1 ? [even(short), even(short / a)] : [even(short * a), even(short)];
    if (o.reframe === 'fit') {
      const [W, H] = fit;
      graph += `,split[rva][rvb];[rva]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},boxblur=40:2,eq=brightness=-0.08[rvbg];` +
        `[rvb]scale=${W}:${H}:force_original_aspect_ratio=decrease[rvfg];[rvbg][rvfg]overlay=(W-w)/2:(H-h)/2`;
      w = W; h = H;
    } else {
      const [W, H] = cover;
      graph += `,crop=${W}:${H}`;
      w = W; h = H;
    }
  }
  const more = [];
  if (o.width && o.height) {
    // a size of your own: fitted in, black bars where the shape differs
    const W = even(o.width), H = even(o.height);
    more.push(`scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2,setsar=1`);
  } else if (o.resolution) {
    // the resolution is the short side, so it works for upright videos too
    const s = w >= h ? scaleFilter(0, o.resolution) : scaleFilter(o.resolution, 0);
    if (s) more.push(s);
  }
  // square pixels at the end, or a player may stretch what the frame and the blur made
  if (o.desqueeze > 1 || a || (o.width && o.height)) more.push('setsar=1');
  // an odd width or height (common in GIFs: 481×271) at its own size: one pixel off, as H.264 and the rest need even
  else if (!o.resolution && ((w % 2) || (h % 2))) more.push('scale=trunc(iw/2)*2:trunc(ih/2)*2');
  more.push(...tail);
  if (more.length) graph += `,${more.join(',')}`;
  return `${graph}[v]`;
}

// loudness, channels and sample rate for the sound
function soundArgs(o, fixedRate) {
  const args = [];
  if (o.loudness) args.push('-af', `loudnorm=I=${o.loudness}:TP=${o.loudness <= -20 ? -2 : -1.5}:LRA=11`);
  if (o.channels) args.push('-ac', String(o.channels));
  const ar = fixedRate || o.sampleRate || (o.loudness ? 48000 : 0); // loudnorm works at 192 kHz inside: say what comes out
  if (ar) args.push('-ar', String(ar));
  return args;
}

async function convertMedia(id, input, o, onProgress) {
  const f = VIDEO_FORMATS[o.format];
  if (!f) throw new Error(`Unknown format: ${o.format}`);
  const info = await probe(input);
  const out = outputPathFor(input, f.ext, o);
  const args = [];

  if (o.trimStart) args.push('-ss', String(o.trimStart));
  args.push('-i', input);
  if (o.trimEnd && o.trimEnd > (o.trimStart || 0)) args.push('-t', String(o.trimEnd - (o.trimStart || 0)));

  let duration = info.duration;
  if (o.trimEnd && o.trimEnd > (o.trimStart || 0)) duration = Math.min(duration || Infinity, o.trimEnd - (o.trimStart || 0));
  else if (o.trimStart) duration = Math.max(0, duration - o.trimStart);

  // the sound only
  if (f.audio) {
    if (!info.hasAudio) throw new Error('The file has no sound');
    args.push('-vn', '-c:a', f.audio);
    if (['libmp3lame', 'aac', 'libopus'].includes(f.audio)) args.push('-b:a', `${o.audioBitrate || 192}k`);
    args.push(...soundArgs(o, f.ar), out);
    await runFfmpeg(id, args, duration, onProgress);
    return out;
  }

  if (!info.hasVideo) throw new Error(f.frame ? 'The file has no picture' : 'The file has no video');

  // one still
  if (f.frame) {
    args.push('-filter_complex', pictureGraph(o, info), '-map', '[v]');
    if (f.ext === 'jpg') args.push('-q:v', String(Math.round(2 + (1 - o.quality / 100) * 20)));
    args.push('-frames:v', '1', '-update', '1', out);
    await runFfmpeg(id, args, 0, () => {});
    return out;
  }

  // a GIF with its own palette, for a better picture
  if (f.gif) {
    const fps = o.fps || 12;
    const w = Math.min(info.width || 480, o.gifWidth || 640);
    const colors = Math.max(32, Math.round((o.quality / 100) * 256));
    args.push('-filter_complex', pictureGraph({ ...o, resolution: 0, width: 0, height: 0 }, info,
      [`fps=${fps}`, `scale=${w}:-1:flags=lanczos`, `split[a][b];[a]palettegen=max_colors=${colors}:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4`]),
    '-map', '[v]', '-loop', '0', out);
    await runFfmpeg(id, args, duration, onProgress);
    return out;
  }

  if (f.anim) {
    const fps = o.fps || 15;
    const w = Math.min(info.width || 480, o.gifWidth || 640);
    args.push('-filter_complex', pictureGraph({ ...o, resolution: 0, width: 0, height: 0 }, info, [`fps=${fps}`, `scale=${w}:-1:flags=lanczos`]),
      '-map', '[v]', '-c:v', 'libwebp_anim', '-quality', String(Math.round(o.quality)), '-loop', '0', '-an', out);
    await runFfmpeg(id, args, duration, onProgress);
    return out;
  }

  args.push('-filter_complex', pictureGraph(o, info, o.fps ? [`fps=${o.fps}`] : []), '-map', '[v]');
  const sound = !o.removeAudio && info.hasAudio;
  if (sound) args.push('-map', '0:a:0');

  const base = args.slice();
  const v = await videoEncoder(f.v, o.hw);
  try {
    await encodeVideo(id, base, v, f, o, info, duration, out, onProgress);
  } catch (e) {
    if (v === f.v || /Cancelled/.test(e.message)) throw e;
    // the Mac's encoder said no (an old Mac, an odd size): the same file with the software one
    fs.rm(out, () => {});
    await encodeVideo(id, base, await videoEncoder(f.v, false), f, o, info, duration, out, onProgress);
  }
  return out;
}

const TWO_PASS = ['libx264', 'libx265', 'libvpx-vp9', 'libaom-av1'];

async function encodeVideo(id, base, v, f, o, info, duration, out, onProgress) {
  const args = base.slice();
  args.push('-c:v', v);
  const speed = SPEED[v]?.[o.speed || 'balanced'];
  if (speed) args.push(['libvpx-vp9', 'libaom-av1'].includes(v) ? '-cpu-used' : '-preset', speed);

  const audioKbps = o.removeAudio || !info.hasAudio ? 0 : o.audioBitrate || 128;
  let byRate = false; // a bitrate was set: two passes can make it land

  if (f.pro === 'prores') {
    const [profile, pix] = PRORES[o.profile] || PRORES[proresFromQuality(o.quality)];
    args.push('-profile:v', profile, '-pix_fmt', pix, '-vendor', 'apl0');
  } else if (f.pro === 'dnxhr') {
    const p = DNXHR[o.profile] ? o.profile : dnxhrFromQuality(o.quality);
    args.push('-profile:v', `dnxhr_${p}`, '-pix_fmt', DNXHR[p]);
  } else if (f.lossless) {
    args.push('-level', '3', '-g', '1', '-slicecrc', '1');
  } else if (f.xdcam) {
    // XDCAM HD422 style: 50 Mbit/s, 4:2:2, long GOP
    args.push('-b:v', '50M', '-minrate', '50M', '-maxrate', '50M', '-bufsize', '17825792', '-pix_fmt', 'yuv422p', '-g', '12', '-bf', '2');
  } else if (o.targetSizeMB && duration > 0) {
    // a target size: bitrate = size / length (4% left for the container)
    const totalKbps = (o.targetSizeMB * 8 * 1024 * 0.96) / duration;
    const vKbps = Math.max(50, Math.floor(totalKbps - audioKbps));
    args.push('-b:v', `${vKbps}k`);
    if (!o.twoPass) args.push('-maxrate', `${Math.floor(vKbps * 1.2)}k`, '-bufsize', `${vKbps * 2}k`);
    byRate = true;
  } else if (o.bitrateMbps) {
    // a bitrate, as Resolve's "Restrict to": an average, never far above it
    const kbps = Math.round(o.bitrateMbps * 1000);
    args.push('-b:v', `${kbps}k`, '-maxrate', `${Math.round(kbps * 1.25)}k`, '-bufsize', `${kbps * 2}k`);
    byRate = true;
  } else if (v.endsWith('_videotoolbox')) {
    args.push('-q:v', String(Math.max(1, Math.round(o.quality))));
  } else if (v === 'mpeg4' || v === 'mpeg2video') {
    args.push('-q:v', String(Math.round(2 + (1 - o.quality / 100) * 18)));
  } else {
    args.push('-crf', String(crfFor(v, o.quality)));
    if (['libvpx-vp9', 'libaom-av1'].includes(v)) args.push('-b:v', '0');
  }
  if (['libvpx-vp9', 'libaom-av1'].includes(v)) args.push('-row-mt', '1');
  if (o.keyframes && !f.pro && !f.lossless && !f.xdcam) args.push('-g', String(Math.round(o.keyframes)));

  if (['libx264', 'libx265', 'h264_videotoolbox', 'hevc_videotoolbox', 'mpeg2video', 'libsvtav1', 'libaom-av1'].includes(v) && !f.xdcam) args.push('-pix_fmt', 'yuv420p');
  if (['libx265', 'hevc_videotoolbox'].includes(v) && f.ext !== 'mkv') args.push('-tag:v', 'hvc1'); // so QuickTime and iPhones play it
  if (o.hdrToSdr !== false && HDR_TRANSFERS.includes(info.transfer)) args.push('-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709');

  const video = args.slice();
  if (audioKbps === 0) args.push('-an');
  else {
    if (/^pcm_|^flac$/.test(f.a)) args.push('-c:a', f.a); // no bitrate for uncompressed or lossless sound
    else args.push('-c:a', f.a, '-b:a', `${audioKbps}k`);
    args.push(...soundArgs(o, f.ar));
  }
  if (['mp4', 'mov'].includes(f.ext)) args.push('-movflags', '+faststart');
  args.push('-map_metadata', o.keepMetadata ? '0' : '-1');

  if (o.twoPass && byRate && TWO_PASS.includes(v)) {
    // two passes: the first only measures, so the second spends the bits where the picture needs them
    const log = tmpFile('2pass').replace(/\.2pass$/, '');
    const pass = (n) => (v === 'libx265' ? ['-x265-params', `pass=${n}:stats=${log}.log`] : ['-pass', String(n), '-passlogfile', log]);
    try {
      await runFfmpeg(id, [...video, ...pass(1), '-an', '-f', 'null', IS_WIN ? 'NUL' : '/dev/null'], duration, (p) => onProgress(p / 2));
      await runFfmpeg(id, [...args, ...pass(2), out], duration, (p) => onProgress(0.5 + p / 2));
    } finally {
      for (const f2 of fs.readdirSync(path.dirname(log))) if (f2.startsWith(path.basename(log))) fs.rm(path.join(path.dirname(log), f2), () => {});
    }
    return out;
  }

  args.push(out);
  await runFfmpeg(id, args, duration, onProgress);
  return out;
}

module.exports = {
  IMAGE_EXT, VIDEO_EXT, AUDIO_EXT, MAC_ONLY_EXT, setFfmpegPath, kindOf, probe, streamFacts, jpegQuality, convertImage, convertMedia, cancel, cancelAll,
};
