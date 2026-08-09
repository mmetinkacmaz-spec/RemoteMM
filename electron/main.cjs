const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const { fork } = require('child_process');

let mainWindow = null;
let serverProcess = null;

function startGatewayServer() {
  const serverPath = path.join(__dirname, '..', 'server', 'index.js');
  console.log(`[Electron] Forking background Gateway Server: ${serverPath}`);
  
  try {
    serverProcess = fork(serverPath, [], {
      env: { ...process.env, PORT: '3001' },
      stdio: 'inherit'
    });

    serverProcess.on('error', (err) => {
      console.error('[Electron] Server Process Error:', err);
    });
  } catch (err) {
    console.error('[Electron] Failed to fork Gateway Server:', err);
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    frame: false, // Custom sleek titlebar
    titleBarStyle: 'hidden',
    backgroundColor: '#090d16',
    icon: path.join(__dirname, '..', 'public', 'favicon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false
    }
  });

  const isDev = process.env.NODE_ENV === 'development' || process.argv.includes('--dev');

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
  } else {
    const htmlPath = path.join(__dirname, '..', 'dist', 'index.html');
    console.log(`[Electron] Loading production UI file: ${htmlPath}`);
    mainWindow.loadFile(htmlPath).catch((err) => {
      console.error('[Electron] Error loading HTML file:', err);
    });
  }

  // Handle external links safely
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Window control IPC handlers
ipcMain.on('window:minimize', () => {
  if (mainWindow) mainWindow.minimize();
});

ipcMain.on('window:maximize', () => {
  if (mainWindow) {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  }
});

ipcMain.on('window:close', () => {
  if (mainWindow) mainWindow.close();
});

app.whenReady().then(() => {
  startGatewayServer();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (serverProcess) {
    try { serverProcess.kill(); } catch (e) {}
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
