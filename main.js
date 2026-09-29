const { app, BrowserWindow, dialog } = require('electron');
const path = require('path');
const { spawn, spawnSync } = require('child_process');
const fs = require('fs');

let mainWindow;
let backendProcess;
let shuttingDown = false;

// Prevent two application process trees from competing for the same backend port and
// blocking an installer upgrade. A second launch focuses the existing window.
const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) app.quit();

function stopBackend() {
  if (!backendProcess || backendProcess.killed) return;
  const pid = backendProcess.pid;
  backendProcess = null;
  try {
    if (process.platform === 'win32' && pid) {
      // The backend can own ffmpeg/ffprobe children. Stop the exact child tree so no
      // hidden Avatar Editor executable remains after the window is closed.
      spawnSync('taskkill.exe', ['/PID', String(pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
    } else {
      process.kill(pid, 'SIGTERM');
    }
  } catch { /* process already exited */ }
}

function createWindow(url) {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    },
    autoHideMenuBar: true
  });

  mainWindow.loadURL(url);

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
      PORT: '0',
      APP_ROOT: userDataPath,
      FRONTEND_PATH: frontendPath,
      FRONTEND_URL: '*'
    }
  });

  let windowCreated = false;
  const startupTimeout = setTimeout(() => {
    if (windowCreated || shuttingDown) return;
    dialog.showErrorBox('Avatar Editor could not start', `The local backend did not become ready. See ${path.join(userDataPath, 'backend.log')}`);
    app.quit();
  }, 20000);

  backendProcess.stdout.on('data', (data) => {
    const output = data.toString();
    logStream.write(`[STDOUT] ${output}`);
    console.log(`Backend: ${output}`);

    const ready = output.match(/running on (http:\/\/localhost:\d+)/i);
    if (!windowCreated && ready) {
      windowCreated = true;
      clearTimeout(startupTimeout);
      createWindow(ready[1]);
    }
  });

  backendProcess.stderr.on('data', (data) => {
    logStream.write(`[STDERR] ${data}`);
    console.error(`Backend Error: ${data}`);
  });
  backendProcess.on('exit', (code) => {
    backendProcess = null;
    if (!windowCreated && !shuttingDown) {
      clearTimeout(startupTimeout);
      dialog.showErrorBox('Avatar Editor backend stopped', `The local backend exited with code ${code}. See ${path.join(userDataPath, 'backend.log')}`);
      app.quit();
    }
  });
}

app.on('second-instance', () => {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
});

if (hasSingleInstanceLock) app.whenReady().then(() => {
  startBackend();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      app.relaunch();
      app.quit();
    }
  });
});

app.on('before-quit', () => {
  shuttingDown = true;
  stopBackend();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    if (!shuttingDown) stopBackend();
    app.quit();
  }
});
