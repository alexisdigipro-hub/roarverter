// Κατεβάζει στατικά binaries ffmpeg για κάθε πλατφόρμα στο vendor/ffmpeg/<platform>-<arch>/
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { pipeline } = require('stream/promises');
const { Readable } = require('stream');

const TAG = 'b6.1.1';
const BASE = `https://github.com/eugeneware/ffmpeg-static/releases/download/${TAG}`;
const targets = process.argv.slice(2).length
  ? process.argv.slice(2)
  : [`${process.platform}-${process.arch}`];

(async () => {
  for (const t of targets) {
    const [platform] = t.split('-');
    const dir = path.join(__dirname, '..', 'vendor', 'ffmpeg', t);
    const out = path.join(dir, platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg');
    if (fs.existsSync(out)) { console.log(`✓ ${t} υπάρχει ήδη`); continue; }
    fs.mkdirSync(dir, { recursive: true });
    console.log(`↓ ${t} ...`);
    const res = await fetch(`${BASE}/ffmpeg-${t}.gz`);
    if (!res.ok) throw new Error(`${t}: HTTP ${res.status}`);
    await pipeline(Readable.fromWeb(res.body), zlib.createGunzip(), fs.createWriteStream(out));
    fs.chmodSync(out, 0o755);
    const lic = await fetch(`${BASE}/${t}.LICENSE`);
    if (lic.ok) fs.writeFileSync(path.join(dir, 'LICENSE'), await lic.text());
    console.log(`✓ ${t}`);
  }
})().catch((e) => { console.error(e); process.exit(1); });
