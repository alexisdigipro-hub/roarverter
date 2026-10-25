const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('api', {
  pickFiles: (lang) => ipcRenderer.invoke('pick-files', lang),
  pickFolder: () => ipcRenderer.invoke('pick-folder'),
  inspect: (paths) => ipcRenderer.invoke('inspect', paths),
  convert: (job) => ipcRenderer.invoke('convert', job),
  cancel: (id) => ipcRenderer.invoke('cancel', id),
  reveal: (file) => ipcRenderer.invoke('reveal', file),
  open: (file) => ipcRenderer.invoke('open', file),
  platform: () => ipcRenderer.invoke('platform'),
  version: () => ipcRenderer.invoke('version'),
  pathForFile: (f) => webUtils.getPathForFile(f),
  onProgress: (cb) => ipcRenderer.on('progress', (_e, d) => cb(d)),
  update: {
    state: () => ipcRenderer.invoke('rv:update-state'),
    check: () => ipcRenderer.invoke('rv:update-check'),
    install: () => ipcRenderer.invoke('rv:update-install'),
    on: (cb) => ipcRenderer.on('rv:update', (_e, s) => cb(s)),
  },
});
