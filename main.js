const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { downloadToFolder, sanitizeFilename, filenameFromUrl } = require('./download-engine');

let mainWindow;
const activeDownloads = new Map();

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 760,
    minWidth: 640,
    minHeight: 560,
    backgroundColor: '#0a0a0f',
    title: 'Link Downloader',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  mainWindow.setMenuBarVisibility(false);
  mainWindow.loadFile('index.html');
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  activeDownloads.forEach((state) => {
    state.cancelled = true;
    try { state.request.destroy(); } catch (e) {}
    try { state.fileStream.destroy(); } catch (e) {}
  });
  if (process.platform !== 'darwin') app.quit();
});

ipcMain.handle('dialog:chooseFolder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Choose download folder',
    properties: ['openDirectory', 'createDirectory']
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0];
});

ipcMain.handle('download:start', async (_event, { id, url, filename, directory }) => {
  let dir = directory;

  if (!dir) {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Choose download folder',
      properties: ['openDirectory', 'createDirectory']
    });
    if (result.canceled || result.filePaths.length === 0) {
      return { success: false, cancelled: true };
    }
    dir = result.filePaths[0];
  }

  const state = { id, cancelled: false, request: null, fileStream: null };
  activeDownloads.set(id, state);

  try {
    const safeName = sanitizeFilename(filename || filenameFromUrl(url, ''));
    const result = await downloadToFolder({
      url,
      filename: safeName,
      directory: dir,
      id,
      state,
      onProgress: (data) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('download:progress', { id, ...data });
        }
      }
    });
    return result;
  } catch (err) {
    return { success: false, error: err.message };
  } finally {
    activeDownloads.delete(id);
  }
});

ipcMain.handle('download:cancel', async (_event, id) => {
  const state = activeDownloads.get(id);
  if (!state) return { cancelled: false };
  state.cancelled = true;
  try { state.request.destroy(); } catch (e) {}
  try { state.fileStream.destroy(); } catch (e) {}
  activeDownloads.delete(id);
  return { cancelled: true };
});

ipcMain.handle('shell:openPath', async (_event, targetPath) => {
  if (!targetPath) return { success: false };
  try {
    shell.showItemInFolder(targetPath);
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
});
