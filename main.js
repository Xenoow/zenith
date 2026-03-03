const { app, BrowserWindow, Notification, ipcMain } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 720,
    minWidth: 800,
    minHeight: 600,
    frame: false,
    backgroundColor: '#0f1117',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    icon: path.join(__dirname, 'assets', 'Zenith.png'),
  });

  mainWindow.loadFile(path.join(__dirname, 'src', 'renderer', 'index.html'));
}

app.whenReady().then(() => {
  // Register IPC handlers (requires app to be ready for userData path)
  const { registerHandlers } = require('./src/ipc/handlers');
  registerHandlers();

  createWindow();

  // Auto-updater (production only)
  if (app.isPackaged) {
    autoUpdater.checkForUpdatesAndNotify();

    autoUpdater.on('update-available', (info) => {
      mainWindow?.webContents.send('update:available', info.version);
    });
    autoUpdater.on('update-downloaded', (info) => {
      mainWindow?.webContents.send('update:downloaded', info.version);
    });
    autoUpdater.on('error', (err) => {
      mainWindow?.webContents.send('update:error', err.message);
    });
  }

  // Notification scheduler — check every 60 seconds
  setInterval(async () => {
    if (!mainWindow) return;
    try {
      const { queries } = require('./src/database/db');
      const tasks = queries.getUpcomingTasks.all();
      const now = new Date();

      for (const task of tasks) {
        const taskDateTime = new Date(`${task.due_date}T${task.due_time}`);
        const diffMs = taskDateTime - now;
        const diffMin = Math.round(diffMs / 60000);

        if (diffMin === 15 || diffMin === 0) {
          const label = diffMin === 0 ? "C'est l'heure !" : 'Dans 15 minutes';
          if (Notification.isSupported()) {
            new Notification({
              title: `\u23F0 ${label} — ${task.title}`,
              body: task.description || '',
            }).show();
          }
        }
      }
    } catch (_) {}
  }, 60_000);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// Window controls (frameless)
ipcMain.on('window:minimize', () => mainWindow?.minimize());
ipcMain.on('window:maximize', () => {
  if (mainWindow?.isMaximized()) mainWindow.unmaximize();
  else mainWindow?.maximize();
});
ipcMain.on('window:close', () => mainWindow?.close());
