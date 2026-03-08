'use strict';

const { ipcMain, dialog, clipboard } = require('electron');
const fs       = require('fs');
const os       = require('os');
const path     = require('path');
const archiver = require('archiver');
const { SIZES, state, processImageFile } = require('./processing');

// Prevent concurrent icon:process calls from the main process side
let processingLock = false;

function registerIpcHandlers(getWindow) {

  ipcMain.handle('icon:process', async (_e, { filePath, filename }) => {
    if (processingLock) return { error: 'Already processing an image. Please wait.' };
    processingLock = true;
    try {
      return await processImageFile(filePath, filename);
    } catch (err) {
      return { error: err.message || 'Could not read image. Try a different file.' };
    } finally {
      processingLock = false;
    }
  });

  ipcMain.handle('icon:paste', async () => {
    try {
      const img = clipboard.readImage();
      if (img.isEmpty()) return { error: 'No image found on clipboard.' };
      const tmpPath = path.join(os.tmpdir(), `iconforge-clip-${Date.now()}.png`);
      await fs.promises.writeFile(tmpPath, img.toPNG());
      return { filePath: tmpPath, filename: 'clipboard.png' };
    } catch {
      return { error: 'No image found on clipboard.' };
    }
  });

  ipcMain.handle('icon:save-bundle', async (_e, { basename }) => {
    if (!state.bundledIcoBuf) return { success: false, error: 'No image processed.' };
    const { filePath, canceled } = await dialog.showSaveDialog(getWindow(), {
      defaultPath: `${basename}.ico`,
      filters: [{ name: 'Icon File', extensions: ['ico'] }],
    });
    if (canceled || !filePath) return { success: false };
    try {
      await fs.promises.writeFile(filePath, state.bundledIcoBuf);
      return { success: true, savedPath: filePath };
    } catch {
      return { success: false, error: 'Failed to generate .ico file.' };
    }
  });

  ipcMain.handle('icon:save-individual', async (_e, { basename, size }) => {
    const idx = SIZES.indexOf(size);
    if (idx === -1 || !state.icoBuffers) return { success: false, error: 'No image processed.' };
    const { filePath, canceled } = await dialog.showSaveDialog(getWindow(), {
      defaultPath: `${basename}-${size}.ico`,
      filters: [{ name: 'Icon File', extensions: ['ico'] }],
    });
    if (canceled || !filePath) return { success: false };
    try {
      await fs.promises.writeFile(filePath, state.icoBuffers[idx]);
      return { success: true, savedPath: filePath };
    } catch {
      return { success: false, error: 'Failed to generate .ico file.' };
    }
  });

  ipcMain.handle('icon:save-zip', async (_e, { basename }) => {
    if (!state.icoBuffers) return { success: false, error: 'No image processed.' };
    const { filePath, canceled } = await dialog.showSaveDialog(getWindow(), {
      defaultPath: `${basename}-icons.zip`,
      filters: [{ name: 'ZIP Archive', extensions: ['zip'] }],
    });
    if (canceled || !filePath) return { success: false };

    return new Promise((resolve) => {
      const output  = fs.createWriteStream(filePath);
      const archive = archiver('zip', { zlib: { level: 9 } });
      const fail    = () => resolve({ success: false, error: 'Export failed. Try saving individually.' });

      output.on('close', ()  => resolve({ success: true, savedPath: filePath }));
      output.on('error',     fail);
      archive.on('error',    fail);

      archive.pipe(output);
      SIZES.forEach((size, i) => {
        archive.append(state.icoBuffers[i], { name: `${basename}-${size}.ico` });
      });
      archive.finalize();
    });
  });
}

module.exports = { registerIpcHandlers };
