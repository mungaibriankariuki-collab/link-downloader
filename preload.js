const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  startDownload: (payload) => ipcRenderer.invoke('download:start', payload),
  chooseFolder: () => ipcRenderer.invoke('dialog:chooseFolder'),
  cancelDownload: (id) => ipcRenderer.invoke('download:cancel', id),
  onProgress: (callback) => {
    const listener = (_event, data) => callback(data);
    ipcRenderer.on('download:progress', listener);
    return () => ipcRenderer.removeListener('download:progress', listener);
  },
  onComplete: (callback) => {
    const listener = (_event, data) => callback(data);
    ipcRenderer.on('download:complete', listener);
    return () => ipcRenderer.removeListener('download:complete', listener);
  },
  openPath: (targetPath) => ipcRenderer.invoke('shell:openPath', targetPath)
});
