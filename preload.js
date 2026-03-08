'use strict';

const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('iconAPI', {
  getFilePath:    (file)               => webUtils.getPathForFile(file),
  process:        (filePath, filename) => ipcRenderer.invoke('icon:process',         { filePath, filename }),
  paste:          ()                   => ipcRenderer.invoke('icon:paste',            {}),
  saveBundle:     (basename)           => ipcRenderer.invoke('icon:save-bundle',      { basename }),
  saveIndividual: (basename, size)     => ipcRenderer.invoke('icon:save-individual',  { basename, size }),
  saveZip:        (basename)           => ipcRenderer.invoke('icon:save-zip',         { basename }),
});
