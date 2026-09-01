const { app, BrowserWindow } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');

let mainWindow;
let backendProcess;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    },
    autoHideMenuBar: true
  });

  mainWindow.loadURL('http://localhost:3001');

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function startBackend() {
  const userDataPath = app.getPath('userData');
  const serverPath = path.join(__dirname, 'backend', 'src', 'server.js');
  const frontendPath = path.join(__dirname, 'frontend', 'dist');

  const logStream = fs.createWriteStream(path.join(userDataPath, 'backend.log'), { flags: 'a' });
  
  backendProcess = spawn(process.execPath, [serverPath], {
    cwd: userDataPath, 
    env: { 
      ...process.env, 
      ELECTRON_RUN_AS_NODE: '1', 
      NODE_ENV: 'production', 
      PORT: '3001',
      APP_ROOT: userDataPath,
      FRONTEND_PATH: frontendPath
    }
  });

  let windowCreated = false;

  backendProcess.stdout.on('data', (data) => {
    const output = data.toString();
    logStream.write(`[STDOUT] ${output}`);
    console.log(`Backend: ${output}`);

    if (!windowCreated && output.includes('running on http://localhost:3001')) {
      windowCreated = true;
      createWindow();
      if (mainWindow) {
        mainWindow.webContents.openDevTools();
      }
    }
  });

  backendProcess.stderr.on('data', (data) => {
    logStream.write(`[STDERR] ${data}`);
    console.error(`Backend Error: ${data}`);
  });
}

app.whenReady().then(() => {
  startBackend();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
