/* Electron shell: one frameless window with native caption buttons floating over the page. */
const { app, BrowserWindow, Menu, ipcMain } = require('electron');
const path = require('path');

app.setName('Cube Timer');

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  let win = null;
  const OVERLAY_HEIGHT = 52;

  app.on('second-instance', () => {
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.focus();
  });

  function createWindow() {
    win = new BrowserWindow({
      width: 1280,
      height: 800,
      minWidth: 380,
      minHeight: 520,
      show: false,
      title: 'Cube Timer',
      backgroundColor: '#0c0a13',
      autoHideMenuBar: true,
      titleBarStyle: 'hidden',
      titleBarOverlay: { color: 'rgba(0,0,0,0)', symbolColor: '#f3effa', height: OVERLAY_HEIGHT },
      icon: path.join(__dirname, 'build', 'icon.png'),
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        spellcheck: false,
      },
    });
    Menu.setApplicationMenu(null);
    win.once('ready-to-show', () => win.show());
    win.loadFile(path.join(__dirname, 'index.html'));
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    win.webContents.on('will-navigate', (e) => e.preventDefault());
    win.on('closed', () => { win = null; });
  }

  // keep the caption-button glyphs readable against whichever colour scheme is active
  ipcMain.on('titlebar', (_e, symbolColor) => {
    if (!win || typeof symbolColor !== 'string' || !/^#[0-9a-f]{6}$/i.test(symbolColor)) return;
    win.setTitleBarOverlay({ color: 'rgba(0,0,0,0)', symbolColor, height: OVERLAY_HEIGHT });
  });
  ipcMain.on('fullscreen', () => { if (win) win.setFullScreen(!win.isFullScreen()); });

  app.whenReady().then(createWindow);
  app.on('window-all-closed', () => app.quit());
}
