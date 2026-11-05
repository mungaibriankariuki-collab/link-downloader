const { app, BrowserWindow, ipcMain, nativeShell, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

let mainWindow;

app.whenReady().then(() => {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      contextIsolation: true,
      enableRemoteModule: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  mainWindow.loadFile('index.html');
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    app.whenReady().then(() => {
      mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        webPreferences: {
          contextIsolation: true,
          enableRemoteModule: true,
          preload: path.join(__dirname, 'preload.js')
        }
      });
      mainWindow.loadFile('index.html');
    });
  }
});

// Handle download requests from renderer
ipcMain.handle('download-file', async (event, { url, suggestedName, downloadDir }) => {
  try {
    let savePath = downloadDir;

    // Let user choose save location if not specified
    if (!savePath) {
      const result = await dialog.showSaveDialog(mainWindow, {
        title: 'Save File',
        defaultPath: suggestedName,
        properties: ['createDirectory']
      });
      if (result.canceled) {
        return { cancelled: true, success: false };
      }
      savePath = result.filePath;
    }

    // Extract filename if path includes directory
    const fileName = path.basename(savePath);
    const finalPath = path.join(savePath, fileName);

    return new Promise((resolve) => {
      const https = require('https');
      const fs = require('fs');

      const file = fs.createWriteStream(finalPath);
      const request = https.get(url, (response) => {
        response.pipe(file);

        file.on('finish', () => {
          file.close();
          resolve({ success: true, path: finalPath, cancelled: false });
        });

        file.on('error', (err) => {
          try { fs.unlink(finalPath); } catch(e) {}
          resolve({ success: false, error: err.message, cancelled: false });
        });
      });

      request.on('error', (err) => {
        try { fs.unlink(finalPath); } catch(e) {}
        resolve({ success: false, error: err.message, cancelled: false });
      });

      // Auto-cancel after 30 seconds if not finished
      const timeout = setTimeout(() => {
        try { file.close(); } catch(e) {}
        try { fs.unlink(finalPath); } catch(e) {}
        resolve({ success: false, error: 'Download timed out after 30 seconds', cancelled: true });
      }, 30000);

      // Handle download cancellation - we'll listen for this from renderer
    });
  } catch (error) {
    return { success: false, error: error.message };
  }
});