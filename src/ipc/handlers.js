const { ipcMain, app, dialog, BrowserWindow } = require('electron');
const fs   = require('fs');
const path = require('path');
const db = require('../database/db');

function registerHandlers() {
  ipcMain.handle('tasks:getByDate',      (_, date) => db.queries.getTasksByDate(date));
  ipcMain.handle('tasks:getAll',         ()        => db.queries.getAllTasks());
  ipcMain.handle('tasks:getMonthSummary',(_, ym)   => db.queries.getTasksForMonth(ym));
  ipcMain.handle('tasks:getUpcoming',    ()        => db.queries.getUpcomingTasks());
  ipcMain.handle('tasks:getDailyStats',  (_, date) => db.queries.getDailyStats(date));
  ipcMain.handle('tasks:getOverdue',     (_, date) => db.queries.getOverdueTasks(date));

  ipcMain.handle('tasks:create', (_, data) => {
    const id = db.insertTask(data);
    return { id };
  });

  ipcMain.handle('tasks:update',    (_, data)           => { db.updateTask(data);              return { success: true }; });
  ipcMain.handle('tasks:delete',    (_, id)             => { db.deleteTask(id);                return { success: true }; });
  ipcMain.handle('tasks:restore',   (_, task)           => { db.restoreTask(task);             return { success: true }; });
  ipcMain.handle('tasks:reschedule',(_, id, newDate)    => { db.rescheduleTask(id, newDate);   return { success: true }; });
  ipcMain.handle('tasks:complete',   (_, id) => db.completeTask(id));
  ipcMain.handle('tasks:uncomplete', (_, id) => db.uncompleteTask(id));

  ipcMain.handle('profile:get',  () => db.queries.getProfile());
  ipcMain.handle('stats:get',    () => db.queries.getStats());
  ipcMain.handle('stats:weekly', () => db.queries.getWeeklyStats());

  ipcMain.handle('notes:get',  (_, date)          => db.getNote(date));
  ipcMain.handle('notes:save', (_, date, content)  => { db.saveNote(date, content); return { success: true }; });

  ipcMain.handle('profile:getUsername', () => db.getUsername());
  ipcMain.handle('profile:setUsername', (_, name) => { db.setUsername(name); return { success: true }; });

  // Profile photo
  ipcMain.handle('profile:getPhoto', () => db.getProfilePhoto());
  ipcMain.handle('profile:setPhoto', (_, base64) => { db.setProfilePhoto(base64); return { success: true }; });
  ipcMain.handle('profile:selectPhoto', async (event) => {
    const win    = BrowserWindow.fromWebContents(event.sender);
    const result = await dialog.showOpenDialog(win, {
      title:      'Choisir une photo de profil',
      filters:    [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp'] }],
      properties: ['openFile'],
    });
    if (result.canceled || !result.filePaths.length) return null;
    const filePath = result.filePaths[0];
    const data     = fs.readFileSync(filePath);
    const ext      = path.extname(filePath).toLowerCase().replace('.', '');
    const mime     = ext === 'png' ? 'image/png' : ext === 'gif' ? 'image/gif' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
    const base64   = `data:${mime};base64,${data.toString('base64')}`;
    db.setProfilePhoto(base64);
    return base64;
  });

  // Week
  ipcMain.handle('tasks:getForWeek', (_, startDate) => db.queries.getTasksForWeek(startDate));

  // Recurring templates
  ipcMain.handle('recurring:getAll',           ()           => db.getRecurrings());
  ipcMain.handle('recurring:create',           (_, data)    => { const id = db.insertRecurring(data); return { id }; });
  ipcMain.handle('recurring:delete',           (_, id)      => { db.deleteRecurring(id); return { success: true }; });
  ipcMain.handle('recurring:generateForDate',  (_, date)            => { db.generateRecurringInstances(date);              return { success: true }; });
  ipcMain.handle('recurring:generateForRange', (_, startDate, endDate) => { db.generateRecurringForRange(startDate, endDate); return { success: true }; });

  // Sleep schedule
  ipcMain.handle('sleep:get', () => db.getSleepSchedule());
  ipcMain.handle('sleep:set', (_, data) => { db.setSleepSchedule(data); return { success: true }; });

  // Version
  ipcMain.handle('app:getVersion', () => app.getVersion());

  // Updates
  ipcMain.handle('app:checkForUpdates', () => {
    if (!app.isPackaged) return { status: 'dev' };
    const { autoUpdater } = require('electron-updater');
    autoUpdater.checkForUpdates();
    return { status: 'checking' };
  });
  ipcMain.handle('app:installUpdate', () => {
    if (!app.isPackaged) return;
    const { autoUpdater } = require('electron-updater');
    autoUpdater.quitAndInstall();
  });

  ipcMain.handle('app:getAutoLaunch', () => {
    if (!app.isPackaged) return false; // désactivé en dev
    return app.getLoginItemSettings().openAtLogin;
  });
  ipcMain.handle('app:setAutoLaunch', (_, enable) => {
    if (!app.isPackaged) return { success: false, reason: 'dev' };
    app.setLoginItemSettings({ openAtLogin: enable });
    return { success: true };
  });
}

module.exports = { registerHandlers };
