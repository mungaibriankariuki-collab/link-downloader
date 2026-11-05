const { contextBridge, ipcRenderer } = require('electron');

// Protect against electionasar attacks, expose only what we need
contextBridge.exposeInMainWorld('electron, {
  downloadFile: (url, suggestedName, downloadDir) => {
    return window.electron.downloadFile(url, suggestedName, downloadDir);
  }
});