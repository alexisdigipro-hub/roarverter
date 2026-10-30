// Photoshop files, read by RoarMorph itself (Alex, 30 Oct: "take a PSD and make it a picture, and if it has layers ask
// whether to split it into a PNG per layer"), so a PSD opens the same on a Mac and on Windows. Plain Node, no library.
// What it reads: the header (size, bit depth, colour mode), the layers (name, place, opacity, hidden) and their pixels,
// and the flattened picture Photoshop keeps at the end ("Maximize compatibility", on by default). Colour modes: RGB,
// grayscale, CMYK; 8, 16 and 32 bits; raw, RLE and ZIP data. PSB (the big format) and Lab or indexed colour are not
// read here (convert.js falls back to the Mac's sips or ffmpeg). Everything comes out as 8-bit RGBA.
const fs = require('fs');
const zlib = require('zlib');

const MODES = { 0: 'Bitmap', 1: 'Grayscale', 2: 'Indexed', 3: 'RGB', 4: 'CMYK', 7: 'Multichannel', 8: 'Duotone', 9: 'Lab' };

// a reader over the file that never loads all of it: a 1 GB PSD costs only what is read
class Reader {
  constructor(file) { this.fd = fs.openSync(file, 'r'); this.pos = 0; this.size = fs.fstatSync(this.fd).size; }
  bytes(n) {
    if (this.pos + n > this.size) throw new Error('The PSD is cut short');
    const b = Buffer.alloc(n);
    fs.readSync(this.fd, b, 0, n, this.pos);
    this.pos += n;
    return b;
  }
  u8() { return this.bytes(1)[0]; }
  u16() { return this.bytes(2).readUInt16BE(0); }
  i16() { return this.bytes(2).readInt16BE(0); }
  u32() { return this.bytes(4).readUInt32BE(0); }
  i32() { return this.bytes(4).readInt32BE(0); }
  str(n) { return this.bytes(n).toString('latin1'); }
  skip(n) { this.pos += n; }
  close() { try { fs.closeSync(this.fd); } catch {} }
}

function header(r) {
  if (r.str(4) !== '8BPS') throw new Error('Not a Photoshop file');
  const version = r.u16();
  if (version !== 1) throw new Error('PSB (large document) files are not read yet');
  r.skip(6);
  const channels = r.u16(), height = r.u32(), width = r.u32(), depth = r.u16(), mode = r.u16();
  return { channels, height, width, depth, mode, modeName: MODES[mode] || String(mode) };
}

// the layer records (where each layer is and what it holds), and where each one's pixels start in the file
function layerRecords(r, h, start, len) {
  r.pos = start;
  if (!len) return { count: 0, mergedAlpha: false, layers: [] };
  let count = r.i16();
  const mergedAlpha = count < 0;
  count = Math.abs(count);
  const layers = [];
  for (let i = 0; i < count; i++) {
    const top = r.i32(), left = r.i32(), bottom = r.i32(), right = r.i32();
    const n = r.u16();
    const channels = [];
    for (let c = 0; c < n; c++) channels.push({ id: r.i16(), len: r.u32() });
    r.skip(4); // 8BIM
    const blend = r.str(4);
    const opacity = r.u8(), clipping = r.u8(), flags = r.u8();
    r.skip(1);
    const extraLen = r.u32();
    const extraEnd = r.pos + extraLen;
    const maskLen = r.u32();
    let mask = null;
    if (maskLen >= 16) { const t = r.i32(), l = r.i32(), b = r.i32(), rt = r.i32(); mask = { top: t, left: l, bottom: b, right: rt }; r.skip(maskLen - 16); } else r.skip(maskLen);
    r.skip(r.u32()); // blending ranges
    const nameLen = r.u8();
    let name = r.str(nameLen);
    r.skip((4 - ((nameLen + 1) % 4)) % 4);
    let divider = 0;
    // tagged blocks: the Unicode name (luni), and the folder markers (lsct) that are not pixel layers
    while (r.pos + 12 <= extraEnd) {
      const sig = r.str(4);
      if (sig !== '8BIM' && sig !== '8B64') break;
      const key = r.str(4);
      const blen = r.u32();
      const bend = r.pos + blen;
      if (key === 'luni' && blen >= 4) { const chars = r.u32(); name = r.bytes(chars * 2).swap16().toString('utf16le').replace(/\0+$/, ''); }
      else if (key === 'lsct' && blen >= 4) divider = r.u32();
      r.pos = bend + (blen % 2);
    }
    r.pos = extraEnd;
    layers.push({ name, top, left, width: right - left, height: bottom - top, channels, blend, opacity, clipping, hidden: !!(flags & 2), divider, mask });
  }
  // the pixels follow the records, layer after layer, channel after channel
  for (const L of layers) for (const c of L.channels) { c.at = r.pos; r.pos += c.len; }
  return { count, mergedAlpha, layers };
}

// where everything is: the layer section (or Photoshop's Lr16/Lr32 block in 16 and 32-bit files) and the flattened picture
function layout(r) {
  const h = header(r);
  r.skip(r.u32()); // colour mode data
  r.skip(r.u32()); // image resources
  const lmLen = r.u32();
  const lmStart = r.pos;
  const imageAt = lmStart + lmLen;
  let info = { count: 0, mergedAlpha: false, layers: [] };
  if (lmLen) {
    const liLen = r.u32();
    const liStart = r.pos;
    if (liLen) info = layerRecords(r, h, liStart, liLen);
    else {
      // 16 and 32-bit documents keep their layers in a tagged block after the global mask
      r.pos = liStart;
      r.skip(r.u32()); // global layer mask
      while (r.pos + 12 <= imageAt) {
        const sig = r.str(4);
        if (sig !== '8BIM' && sig !== '8B64') break;
        const key = r.str(4);
        const blen = r.u32();
        const bstart = r.pos;
        if (key === 'Lr16' || key === 'Lr32' || key === 'Layr') { info = layerRecords(r, h, bstart, blen); break; }
        r.pos = bstart + blen + (blen % 2);
        r.pos += (4 - ((r.pos - lmStart) % 4)) % 4;
      }
    }
  }
  return { ...h, ...info, imageAt };
}

/** What a PSD is, without reading its pixels: size, bit depth, colour mode, and its pixel layers. */
function readPsdInfo(file) {
  const r = new Reader(file);
  try {
    const L = layout(r);
    const pixelLayers = L.layers.filter((l) => !l.divider && l.width > 0 && l.height > 0);
    return { width: L.width, height: L.height, depth: L.depth, mode: L.modeName, layers: pixelLayers.length, names: pixelLayers.map((l) => l.name) };
  } finally { r.close(); }
}

// ---------- pixels ----------

function unpackBits(src, out, outAt, len) {
  let i = 0, o = outAt;
  const end = outAt + len;
  while (o < end && i < src.length) {
    const n = src[i++];
    if (n < 128) { const c = n + 1; src.copy(out, o, i, i + c); i += c; o += c; }
    else if (n > 128) { const c = 257 - n; out.fill(src[i++], o, o + c); o += c; }
  }
}

// one channel's samples (width × height × bytes a sample) from its compression
function decodeChannel(data, comp, w, h, bps) {
  const rowBytes = w * bps;
  const out = Buffer.alloc(rowBytes * h);
  if (comp === 0) data.copy(out, 0, 0, Math.min(data.length, out.length));
  else if (comp === 1) {
    let at = h * 2;
    for (let y = 0; y < h; y++) { const n = data.readUInt16BE(y * 2); unpackBits(data.subarray(at, at + n), out, y * rowBytes, rowBytes); at += n; }
  } else if (comp === 2 || comp === 3) {
    const raw = zlib.inflateSync(data);
    raw.copy(out, 0, 0, Math.min(raw.length, out.length));
    if (comp === 3) unpredict(out, w, h, bps);
  } else throw new Error(`Unknown PSD compression ${comp}`);
  return out;
}

// ZIP with prediction: each sample is stored as the difference from the one before it in the row
function unpredict(buf, w, h, bps) {
  if (bps === 1) for (let y = 0; y < h; y++) for (let x = 1; x < w; x++) buf[y * w + x] = (buf[y * w + x] + buf[y * w + x - 1]) & 255;
  else if (bps === 2) for (let y = 0; y < h; y++) for (let x = 1; x < w; x++) { const i = (y * w + x) * 2; buf.writeUInt16BE((buf.readUInt16BE(i) + buf.readUInt16BE(i - 2)) & 65535, i); }
  else if (bps === 4) {
    // 32-bit: the bytes of each row are split into planes, then delta-coded
    const row = w * 4, tmp = Buffer.alloc(row);
    for (let y = 0; y < h; y++) {
      const o = y * row;
      for (let i = 1; i < row; i++) buf[o + i] = (buf[o + i] + buf[o + i - 1]) & 255;
      for (let x = 0; x < w; x++) for (let b = 0; b < 4; b++) tmp[x * 4 + b] = buf[o + b * w + x];
      tmp.copy(buf, o);
    }
  }
}

// a sample to 8 bits
const to8 = (buf, i, bps) => (bps === 1 ? buf[i] : bps === 2 ? buf[i * 2] : Math.max(0, Math.min(255, Math.round(Math.pow(Math.max(0, buf.readFloatBE(i * 4)), 1 / 2.2) * 255))));

// colour channels (by mode) and an alpha into RGBA 8-bit
function toRGBA(mode, planes, alpha, n, bps) {
  const out = Buffer.alloc(n * 4);
  for (let i = 0; i < n; i++) {
    let r, g, b;
    if (mode === 'RGB') { r = to8(planes[0], i, bps); g = to8(planes[1], i, bps); b = to8(planes[2], i, bps); }
    else if (mode === 'CMYK') {
      // Photoshop stores CMYK inverted (255 is no ink)
      const k = to8(planes[3], i, bps);
      r = (to8(planes[0], i, bps) * k) / 255; g = (to8(planes[1], i, bps) * k) / 255; b = (to8(planes[2], i, bps) * k) / 255;
    } else { r = g = b = to8(planes[0], i, bps); }
    out[i * 4] = r; out[i * 4 + 1] = g; out[i * 4 + 2] = b;
    out[i * 4 + 3] = alpha ? to8(alpha, i, bps) : 255;
  }
  return out;
}

const COLOURS = { RGB: 3, CMYK: 4, Grayscale: 1, Duotone: 1 };
function needMode(L) {
  if (!COLOURS[L.modeName]) throw new Error(`${L.modeName} PSDs are not read yet`);
  if (![8, 16, 32].includes(L.depth)) throw new Error(`${L.depth}-bit PSDs are not read yet`);
  return COLOURS[L.modeName];
}

/** The flattened picture Photoshop keeps: { width, height, data } in RGBA 8-bit. */
function readPsdImage(file) {
  const r = new Reader(file);
  try {
    const L = layout(r);
    const nColour = needMode(L);
    const bps = L.depth / 8, w = L.width, h = L.height, n = w * h;
    r.pos = L.imageAt;
    const comp = r.u16();
    const planes = [];
    const wanted = Math.min(L.channels, nColour + 1);
    if (comp === 1) {
      const counts = [];
      for (let i = 0; i < L.channels * h; i++) counts.push(r.u16());
      for (let c = 0; c < wanted; c++) {
        const rows = counts.slice(c * h, (c + 1) * h);
        const len = rows.reduce((a, b) => a + b, 0);
        const head = Buffer.alloc(h * 2);
        rows.forEach((v, y) => head.writeUInt16BE(v, y * 2));
        planes.push(decodeChannel(Buffer.concat([head, r.bytes(len)]), 1, w, h, bps));
      }
    } else if (comp === 0) {
      for (let c = 0; c < wanted; c++) planes.push(decodeChannel(r.bytes(n * bps), 0, w, h, bps));
    } else {
      const all = decodeChannel(r.bytes(r.size - r.pos), comp, w, h * L.channels, bps);
      for (let c = 0; c < wanted; c++) planes.push(all.subarray(c * n * bps, (c + 1) * n * bps));
    }
    // a fourth (RGB) or second (grayscale) channel is the picture's transparency when the layers were merged with it
    const alpha = L.mergedAlpha && planes.length > nColour ? planes[nColour] : null;
    return { width: w, height: h, data: toRGBA(L.modeName, planes, alpha, n, bps) };
  } finally { r.close(); }
}

/** Every pixel layer, one at a time (a big document's layers never sit in memory together), as a picture the size of
 *  the document with the layer in its place: await fn({ index, name, hidden, width, height, data }). Returns how many. */
async function eachPsdLayer(file, fn) {
  const r = new Reader(file);
  try {
    const L = layout(r);
    needMode(L);
    const bps = L.depth / 8, W = L.width, H = L.height;
    let index = 0;
    for (const l of L.layers) {
      if (l.divider || l.width <= 0 || l.height <= 0) continue;
      const planes = {};
      for (const c of l.channels) {
        r.pos = c.at;
        if (c.id === -2 || c.id === -3) continue; // masks have their own size
        const comp = r.u16();
        planes[c.id] = decodeChannel(r.bytes(c.len - 2), comp, l.width, l.height, bps);
      }
      const colour = L.modeName === 'RGB' ? [0, 1, 2] : L.modeName === 'CMYK' ? [0, 1, 2, 3] : [0];
      if (colour.some((id) => !planes[id])) continue;
      const rgba = toRGBA(L.modeName, colour.map((id) => planes[id]), planes[-1] || null, l.width * l.height, bps);
      // the layer's opacity goes into its transparency, then it is placed on a document-sized clear canvas
      const canvas = Buffer.alloc(W * H * 4);
      for (let y = 0; y < l.height; y++) {
        const dy = l.top + y;
        if (dy < 0 || dy >= H) continue;
        for (let x = 0; x < l.width; x++) {
          const dx = l.left + x;
          if (dx < 0 || dx >= W) continue;
          const s = (y * l.width + x) * 4, d = (dy * W + dx) * 4;
          canvas[d] = rgba[s]; canvas[d + 1] = rgba[s + 1]; canvas[d + 2] = rgba[s + 2];
          canvas[d + 3] = Math.round((rgba[s + 3] * l.opacity) / 255);
        }
      }
      await fn({ index: index++, name: l.name, hidden: l.hidden, width: W, height: H, data: canvas });
    }
    return index;
  } finally { r.close(); }
}

module.exports = { readPsdInfo, readPsdImage, eachPsdLayer };
