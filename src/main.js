const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');
const conv = require('./convert');
const updater = require('./updater');
const { IMAGE_EXT, VIDEO_EXT, AUDIO_EXT, MAC_ONLY_EXT, kindOf, probe } = conv;

if (app.isPackaged) {
  conv.setFfmpegPath(path.join(process.resourcesPath, 'bin', process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg'));
}

let win;
let quitting = false;

function createWindow() {
  const frame = process.platform === 'darwin'
    ? { titleBarStyle: 'hiddenInset', trafficLightPosition: { x: 16, y: 21 } }
    : { titleBarStyle: 'hidden', titleBarOverlay: { color: '#16181d', symbolColor: '#eef0f3', height: 58 } };
  win = new BrowserWindow({
    width: 1240, height: 840, minWidth: 900, minHeight: 600, show: false, backgroundColor: '#16181d', autoHideMenuBar: true, ...frame,
    title: 'Roarverter',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.once('ready-to-show', () => win.show());
  win.loadFile(path.join(__dirname, 'index.html'));
}

if (!app.requestSingleInstanceLock()) app.quit();
app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });

/* As in RoarTwin: Roarverter can update itself only where it may replace itself, in Applications, not opened
   straight from the .dmg or from Downloads. Started from anywhere else, it offers to move itself there once per start. */
function offerApplications() {
  if (process.platform !== 'darwin' || !app.isPackaged || app.isInApplicationsFolder()) return false;
  const r = dialog.showMessageBoxSync({
    type: 'question', buttons: ['Move to Applications', 'Not now'], defaultId: 0, cancelId: 1,
    message: 'Move Roarverter to Applications?',
    detail: 'From there Roarverter updates itself, with nothing to download or install by hand. It opens again by itself.',
  });
  if (r !== 0) return false;
  try {
    return app.moveToApplicationsFolder({ conflictHandler: () => true });
  } catch (e) {
    dialog.showErrorBox('Roarverter could not move itself', `${e?.message || e}\n\nDrag Roarverter into the Applications folder yourself and open it from there.`);
    return false;
  }
}

app.whenReady().then(() => {
  if (offerApplications()) return;
  createWindow();
  updater.start(ipcMain, () => { quitting = true; });
});
app.on('before-quit', () => { quitting = true; });
app.on('window-all-closed', () => {
  conv.cancelAll();
  app.quit();
});

// ---------- IPC ----------

ipcMain.handle('pick-files', async (_e, lang) => {
  const el = lang === 'el';
  const r = await dialog.showOpenDialog(win, {
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: el ? 'Πολυμέσα' : 'Media', extensions: [...IMAGE_EXT, ...VIDEO_EXT, ...AUDIO_EXT] },
      { name: el ? 'Εικόνες' : 'Images', extensions: IMAGE_EXT },
      { name: el ? 'Βίντεο' : 'Videos', extensions: VIDEO_EXT },
      { name: el ? 'Ήχος' : 'Audio', extensions: AUDIO_EXT },
      { name: el ? 'Όλα' : 'All files', extensions: ['*'] },
    ],
  });
  return r.canceled ? [] : r.filePaths;
});

ipcMain.handle('pick-folder', async () => {
  const r = await dialog.showOpenDialog(win, { properties: ['openDirectory', 'createDirectory'] });
  return r.canceled ? null : r.filePaths[0];
});

// every file Roarverter can take, inside the folders too; what it cannot take is named, not dropped silently
function walk(p, acc, skipped, top) {
  const st = fs.statSync(p);
  if (st.isDirectory()) {
    for (const f of fs.readdirSync(p)) if (!f.startsWith('.')) walk(path.join(p, f), acc, skipped, false);
    return;
  }
  const ext = path.extname(p).slice(1).toLowerCase();
  if (kindOf(p) && !(process.platform !== 'darwin' && MAC_ONLY_EXT.includes(ext))) acc.push(p);
  else if (top || kindOf(p)) skipped.push({ name: path.basename(p), ext, macOnly: MAC_ONLY_EXT.includes(ext) });
}

ipcMain.handle('inspect', async (_e, paths) => {
  const files = [];
  const skipped = [];
  for (const p of paths) { try { walk(p, files, skipped, true); } catch {} }
  const list = await Promise.all(files.map(async (file) => {
    const kind = kindOf(file);
    const size = fs.statSync(file).size;
    let meta = {};
    if (kind === 'image') {
      try { const m = await sharp(file).metadata(); meta = { width: m.width, height: m.height }; } catch {}
    } else {
      const i = await probe(file);
      meta = { width: i.width, height: i.height, duration: i.duration, hasAudio: i.hasAudio, vcodec: i.vcodec };
    }
    return { file, name: path.basename(file), kind, size, ...meta };
  }));
  return { files: list, skipped };
});

ipcMain.handle('convert', async (_e, { id, file, kind, options }) => {
  const send = (p) => win?.webContents.send('progress', { id, progress: p });
  try {
    const out = kind === 'image'
      ? await conv.convertImage(id, file, options)
      : await conv.convertMedia(id, file, options, send);
    return { ok: true, out, size: fs.statSync(out).size };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('cancel', (_e, id) => conv.cancel(id));

ipcMain.handle('reveal', (_e, file) => shell.showItemInFolder(file));
ipcMain.handle('open', (_e, file) => shell.openPath(file));
ipcMain.handle('platform', () => process.platform);
ipcMain.handle('version', () => app.getVersion());
