// Κατεβάζει στατικά binaries ffmpeg για κάθε πλατφόρμα στο vendor/ffmpeg/<platform>-<arch>/
//
// Since 0.6.0 (Alex, 31 Oct: "For Resolume", DXV and HAP): ffmpeg-static's 6.1 wrote neither, so each platform takes a
// build that writes both, checked on real Macs and Windows (.github/workflows/probe-ffmpeg.yml, then removed):
//   Mac arm64 / x64 and Linux x64: Martin Riedl's static builds (ffmpeg.martin-riedl.de), 9.x, with DXV, HAP,
//     SVT-AV1, libaom, x265 and on the Mac VideoToolbox; only the system's own frameworks.
//   Windows x64: gyan.dev's full build 7.1.1 (GitHub GyanD/codexffmpeg), with DXV, HAP, SVT-AV1, x265.
// Alex allowed these sources (31 Oct). A build that cannot write DXV or HAP fails here, not in someone's hands.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const SOURCES = {
  'darwin-arm64': 'https://ffmpeg.martin-riedl.de/redirect/latest/macos/arm64/release/ffmpeg.zip',
  'darwin-x64': 'https://ffmpeg.martin-riedl.de/redirect/latest/macos/amd64/release/ffmpeg.zip',
  'linux-x64': 'https://ffmpeg.martin-riedl.de/redirect/latest/linux/amd64/release/ffmpeg.zip',
  'linux-arm64': 'https://ffmpeg.martin-riedl.de/redirect/latest/linux/arm64/release/ffmpeg.zip',
  'win32-x64': 'https://github.com/GyanD/codexffmpeg/releases/download/7.1.1/ffmpeg-7.1.1-full_build.zip',
};
const targets = process.argv.slice(2).length
  ? process.argv.slice(2)
  : [`${process.platform}-${process.arch}`];

// a zip opened with what the system has: bsdtar on a Mac and Windows, unzip on Linux
function unzip(zip, dir) {
  try { execFileSync('tar', ['-xf', zip, '-C', dir], { stdio: 'ignore' }); return; } catch { /* GNU tar: no zip */ }
  execFileSync('unzip', ['-oq', zip, '-d', dir], { stdio: 'ignore' });
}
function find(dir, name) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { const f = find(p, name); if (f) return f; } else if (e.name === name) return p;
  }
  return '';
}

(async () => {
  for (const t of targets) {
    const [platform] = t.split('-');
    const name = platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
    const dir = path.join(__dirname, '..', 'vendor', 'ffmpeg', t);
    const out = path.join(dir, name);
    if (fs.existsSync(out) && fs.existsSync(path.join(dir, 'SOURCE'))) { console.log(`✓ ${t} υπάρχει ήδη`); continue; }
    const url = SOURCES[t];
    if (!url) throw new Error(`${t}: no ffmpeg for this platform`);
    fs.mkdirSync(dir, { recursive: true });
    console.log(`↓ ${t} ...`);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${t}: HTTP ${res.status}`);
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ffmpeg-'));
    const zip = path.join(tmp, 'ffmpeg.zip');
    fs.writeFileSync(zip, Buffer.from(await res.arrayBuffer()));
    unzip(zip, tmp);
    const bin = find(tmp, name);
    if (!bin) throw new Error(`${t}: no ${name} in the download`);
    fs.copyFileSync(bin, out);
    fs.chmodSync(out, 0o755);
    const lic = find(tmp, 'LICENSE') || find(tmp, 'LICENSE.txt');
    if (lic) fs.copyFileSync(lic, path.join(dir, 'LICENSE'));
    fs.writeFileSync(path.join(dir, 'SOURCE'), `${url}\n`);
    fs.rmSync(tmp, { recursive: true, force: true });
    // the codecs RoarMorph promises, where this machine can run the binary
    if (t === `${process.platform}-${process.arch}`) {
      const enc = execFileSync(out, ['-hide_banner', '-encoders'], { encoding: 'utf8' });
      for (const need of ['dxv', 'hap', 'libx264', 'libx265']) if (!new RegExp(`\\s${need}\\s`).test(enc)) throw new Error(`${t}: this ffmpeg cannot write ${need}`);
    }
    console.log(`✓ ${t}`);
  }
})().catch((e) => { console.error(e); process.exit(1); });
