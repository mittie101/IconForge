'use strict';

const { app, BrowserWindow } = require('electron');
const path = require('path');
const { registerIpcHandlers } = require('./src/ipc');

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width:           900,
    height:          680,
    minWidth:        700,
    minHeight:       540,
    autoHideMenuBar: true,
    title:           'IconForge',
    icon:            path.join(__dirname, 'icon.ico'),
    webPreferences: {
      preload:          path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration:  false,
      sandbox:          true,
      webSecurity:      true,
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

registerIpcHandlers(() => mainWindow);

app.whenReady().then(createWindow);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
