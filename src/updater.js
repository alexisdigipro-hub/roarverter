// RoarMorph (Roarverter until 30 Oct) updates itself, like the other Roar apps (no paid Apple certificate, so not Electron's own updater).
// It looks at the newest GitHub release itself, downloads the right installer in the background, and when it
// is ready the page shows "Restart to update". Restarting (or simply quitting) swaps the app for the new one:
// on a Mac a small script waits for RoarMorph to close, copies the new app over the old one and opens it; on
// Windows the installer runs silently and opens RoarMorph again. If the app cannot be replaced where it sits (a
// folder it may not write to), the downloaded installer is opened instead, as before.
const { app, BrowserWindow, Notification, net, shell } = require('electron')
const { spawn } = require('child_process')
const fs = require('fs')
const path = require('path')

const REPO = 'alexisdigipro-hub/roarverter'
const EVERY = 2 * 3600e3

let state = { status: 'idle', version: '', progress: 0, error: '', checkedAt: 0 }
// Settings > Update by itself (Alex, 30 Oct): off, it looks only when asked (Check now)
let auto = true
let file = ''
let timer = null
let busy = false
let notified = ''
let hook = null

const send = (patch) => {
  state = { ...state, ...patch }
  BrowserWindow.getAllWindows().forEach((w) => { try { w.webContents.send('rv:update', state) } catch { /* closing */ } })
  if (hook) try { hook(state) } catch { /* no menu */ }
}
const newer = (a, b) => {
  const x = a.split('.').map(Number), y = b.split('.').map(Number)
  for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0)
  return false
}
// the installer for this computer among the release's files
const pick = (assets) => {
  const re = process.platform === 'win32' ? /Windows-Setup\.exe$/
    : process.arch === 'arm64' ? /Mac-arm64\.dmg$/ : /Mac-x64\.dmg$/
  const list = assets.filter((a) => re.test(a.name))
  return list.find((a) => /\d+\.\d+\.\d+/.test(a.name)) || list[0] || null
}
const dir = () => path.join(app.getPath('userData'), 'updates')

async function check() {
  if (!app.isPackaged || busy || state.status === 'ready') return state
  busy = true
  try {
    send({ status: 'checking', error: '' })
    const r = await net.fetch(`https://api.github.com/repos/${REPO}/releases/latest`, { headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'RoarMorph' } })
    if (!r.ok) throw new Error(`GitHub ${r.status}`)
    const d = await r.json()
    const version = (String(d.name || '').match(/(\d+\.\d+\.\d+)/) || [])[1] || ''
    if (!version || !newer(version, app.getVersion())) { send({ status: 'idle', version: '', checkedAt: Date.now() }); return state }
    const asset = pick(d.assets || [])
    if (!asset) { send({ status: 'idle', version: '' }); return state }
    fs.mkdirSync(dir(), { recursive: true })
    // anything older left from before goes
    for (const f of fs.readdirSync(dir())) if (!f.includes(version)) { try { fs.rmSync(path.join(dir(), f), { force: true, recursive: true }) } catch { /* in use */ } }
    const target = path.join(dir(), asset.name.includes(version) ? asset.name : `${version}-${asset.name}`)
    if (!(fs.existsSync(target) && fs.statSync(target).size === asset.size)) {
      send({ status: 'downloading', version, progress: 0 })
      const res = await net.fetch(asset.browser_download_url, { headers: { 'User-Agent': 'RoarMorph' } })
      if (!res.ok || !res.body) throw new Error(`download ${res.status}`)
      const total = Number(res.headers.get('content-length')) || asset.size || 0
      const part = `${target}.part`
      const out = fs.createWriteStream(part)
      const reader = res.body.getReader()
      let got = 0, last = 0
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        got += value.length
        if (!out.write(Buffer.from(value))) await new Promise((ok) => out.once('drain', ok))
        const p = total ? Math.floor((got / total) * 100) : 0
        if (p !== last) { last = p; send({ progress: p }) }
      }
      await new Promise((ok, bad) => { out.end(); out.on('finish', ok); out.on('error', bad) })
      if (asset.size && fs.statSync(part).size !== asset.size) throw new Error('incomplete download')
      fs.renameSync(part, target)
    }
    file = target
    send({ status: 'ready', version, progress: 100, checkedAt: Date.now() })
    if (notified !== version && Notification.isSupported()) {
      notified = version
      const n = new Notification({ title: `RoarMorph ${version} is ready`, body: 'Restart RoarMorph to update. It takes a few seconds.' })
      n.on('click', () => { BrowserWindow.getAllWindows()[0]?.show() })
      n.show()
    }
  } catch (e) {
    send({ status: 'error', error: String(e?.message || e), checkedAt: Date.now() })
  } finally {
    busy = false
  }
  return state
}

// where this app lives (…/RoarMorph.app/Contents/MacOS/RoarMorph)
const macBundle = () => path.resolve(path.dirname(process.execPath), '..', '..')
const canReplace = (bundle) => {
  if (!/\.app$/.test(bundle) || bundle.includes('/Volumes/') || bundle.includes('AppTranslocation')) return false
  try { fs.accessSync(path.dirname(bundle), fs.constants.W_OK); fs.accessSync(bundle, fs.constants.W_OK); return true } catch { return false }
}

/* swap the app for the downloaded one; relaunch after a restart, not after a quit */
function install(relaunch) {
  if (state.status !== 'ready' || !file || !fs.existsSync(file)) return false
  if (process.platform === 'darwin') {
    const bundle = macBundle()
    if (!canReplace(bundle)) { shell.openPath(file); return false }
    const script = path.join(dir(), 'swap.sh')
    fs.writeFileSync(script, MAC_SWAP, { mode: 0o755 })
    spawn('/bin/bash', [script, String(process.pid), file, bundle, relaunch ? '1' : '0'], { detached: true, stdio: 'ignore' }).unref()
  } else if (process.platform === 'win32') {
    spawn(file, relaunch ? ['/S', '--force-run'] : ['/S'], { detached: true, stdio: 'ignore' }).unref()
  } else return false
  state = { ...state, status: 'installing' }
  return true
}

// waits for RoarMorph to close, puts the new RoarMorph.app in place of the old (the old stays if anything fails), opens it
const MAC_SWAP = `#!/bin/bash
PID="$1"; DMG="$2"; APP="$3"; RELAUNCH="$4"
for i in $(seq 1 100); do kill -0 "$PID" 2>/dev/null || break; sleep 0.2; done
MNT="$(mktemp -d /tmp/roarverter-update.XXXXXX)"
if hdiutil attach -nobrowse -readonly -noautoopen -mountpoint "$MNT" "$DMG" >/dev/null 2>&1; then
  SRC="$(ls -d "$MNT"/*.app 2>/dev/null | head -1)"
  # the new app keeps its own name (Roarverter became RoarMorph, 30 Oct), next to where the old one was
  DEST="$(dirname "$APP")/$(basename "$SRC")"
  EXE="$(defaults read "$SRC/Contents/Info" CFBundleExecutable 2>/dev/null)"
  if [ -n "$SRC" ] && [ -n "$EXE" ] && ditto "$SRC" "$DEST.new" && [ -x "$DEST.new/Contents/MacOS/$EXE" ]; then
    rm -rf "$APP.old" && mv "$APP" "$APP.old"
    [ "$DEST" != "$APP" ] && rm -rf "$DEST"
    if mv "$DEST.new" "$DEST"; then rm -rf "$APP.old"; APP="$DEST"; else mv "$APP.old" "$APP"; rm -rf "$DEST.new"; fi
    xattr -dr com.apple.quarantine "$APP" 2>/dev/null
    rm -f "$DMG"
  else
    rm -rf "$DEST.new"
  fi
  hdiutil detach "$MNT" -quiet -force >/dev/null 2>&1
fi
rmdir "$MNT" 2>/dev/null
[ "$RELAUNCH" = "1" ] && open "$APP"
exit 0
`

// restart into the new version now (the page's Restart to update)
function restart(onQuitting) {
  if (!install(true)) return false
  onQuitting()
  setTimeout(() => app.quit(), 200)
  return true
}

function start(ipcMain, onQuitting, onState) {
  hook = onState || null
  ipcMain.handle('rv:update-state', () => state)
  ipcMain.handle('rv:update-check', () => check())
  ipcMain.handle('rv:update-install', () => restart(onQuitting))
  ipcMain.handle('rv:update-auto', (_e, on) => { auto = on !== false; return auto })
  // quitting with an update waiting installs it (no reopening)
  app.on('will-quit', () => { if (state.status === 'ready') install(false) })
  setTimeout(() => { if (auto) check() }, 15e3)
  timer = setInterval(() => { if (auto) check() }, EVERY)
}

module.exports = { start, check, restart, getState: () => state, MAC_SWAP }
