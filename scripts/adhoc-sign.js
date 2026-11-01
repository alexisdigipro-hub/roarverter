// A Mac app has to carry at least an ad-hoc signature or an Apple Silicon Mac calls it "damaged".
// There is no paid Apple certificate (Alex, 15 Oct: a few people of his own), so the app is signed
// ad hoc after packing; the first open then needs Open Anyway once, nothing more.
//
// The old name inside the new app (30 Oct, Roarverter became RoarMorph): Roarverter 0.3.x updates itself with a script
// that takes the new app only if it holds Contents/MacOS/Roarverter (its own program's name). RoarMorph.app's program is
// Contents/MacOS/RoarMorph, so a link Roarverter -> RoarMorph beside it, signed with the app, lets them take it (as
// Roarverter.app, which then runs RoarMorph); 0.4.0 and later look at the app's own CFBundleExecutable and rename it
// RoarMorph.app on the next update. As RoarTwin -> RoarKit did.
const { execFileSync } = require('child_process')
const fs = require('fs')
const path = require('path')

exports.default = async function (context) {
  if (context.electronPlatformName !== 'darwin') return
  const name = context.packager.appInfo.productFilename
  const app = path.join(context.appOutDir, `${name}.app`)
  const old = path.join(app, 'Contents', 'MacOS', 'Roarverter')
  if (name !== 'Roarverter' && !fs.existsSync(old)) fs.symlinkSync(name, old)
  // the camera readers and their makers' libraries in Resources/bin are not where --deep looks: signed first, by name
  const bin = path.join(app, 'Contents', 'Resources', 'bin')
  const dylibs = fs.existsSync(bin) ? fs.readdirSync(bin).filter((n) => n.endsWith('.dylib')) : []
  for (const f of ['BlackmagicRawAPI.framework', ...dylibs, 'roarplay-braw', 'roarplay-r3d', 'ffmpeg']) {
    const p = path.join(bin, f)
    if (fs.existsSync(p)) execFileSync('codesign', ['--force', ...(f.endsWith('.framework') ? ['--deep'] : []), '--sign', '-', p], { stdio: 'inherit' })
  }
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', app], { stdio: 'inherit' })
}
