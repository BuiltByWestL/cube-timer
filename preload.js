const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('cubeShell', {
  titleBar: (symbolColor) => ipcRenderer.send('titlebar', symbolColor),
  toggleFullscreen: () => ipcRenderer.send('fullscreen'),
});
