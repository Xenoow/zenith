const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // Tasks
  getTasksByDate:    (date)   => ipcRenderer.invoke('tasks:getByDate', date),
  getAllTasks:       ()       => ipcRenderer.invoke('tasks:getAll'),
  getMonthSummary:  (ym)     => ipcRenderer.invoke('tasks:getMonthSummary', ym),
  getUpcomingTasks: ()       => ipcRenderer.invoke('tasks:getUpcoming'),
  getDailyStats:    (date)          => ipcRenderer.invoke('tasks:getDailyStats', date),
  getOverdueTasks:  (date)          => ipcRenderer.invoke('tasks:getOverdue', date),
  createTask:       (data)          => ipcRenderer.invoke('tasks:create', data),
  updateTask:       (data)          => ipcRenderer.invoke('tasks:update', data),
  deleteTask:       (id)            => ipcRenderer.invoke('tasks:delete', id),
  restoreTask:      (task)          => ipcRenderer.invoke('tasks:restore', task),
  rescheduleTask:   (id, newDate)   => ipcRenderer.invoke('tasks:reschedule', id, newDate),
  completeTask:     (id)            => ipcRenderer.invoke('tasks:complete', id),
  uncompleteTask:   (id)            => ipcRenderer.invoke('tasks:uncomplete', id),

  // Profile & Stats
  getProfile:     () => ipcRenderer.invoke('profile:get'),
  getStats:       () => ipcRenderer.invoke('stats:get'),
  getWeeklyStats: () => ipcRenderer.invoke('stats:weekly'),

  // Notes
  getNote:  (date)          => ipcRenderer.invoke('notes:get', date),
  saveNote: (date, content) => ipcRenderer.invoke('notes:save', date, content),

  // Window controls
  minimize: () => ipcRenderer.send('window:minimize'),
  maximize: () => ipcRenderer.send('window:maximize'),
  close:    () => ipcRenderer.send('window:close'),

  // Username
  getUsername: ()     => ipcRenderer.invoke('profile:getUsername'),
  setUsername: (name) => ipcRenderer.invoke('profile:setUsername', name),

  // Profile photo
  getProfilePhoto:    ()       => ipcRenderer.invoke('profile:getPhoto'),
  selectProfilePhoto: ()       => ipcRenderer.invoke('profile:selectPhoto'),

  // Week
  getTasksForWeek: (startDate) => ipcRenderer.invoke('tasks:getForWeek', startDate),

  // Recurring templates
  getRecurrings:            ()     => ipcRenderer.invoke('recurring:getAll'),
  createRecurring:          (data) => ipcRenderer.invoke('recurring:create', data),
  deleteRecurring:          (id)   => ipcRenderer.invoke('recurring:delete', id),
  generateRecurringForDate:  (date)             => ipcRenderer.invoke('recurring:generateForDate', date),
  generateRecurringForRange: (startDate, endDate) => ipcRenderer.invoke('recurring:generateForRange', startDate, endDate),

  // Sleep schedule
  getSleepSchedule: ()     => ipcRenderer.invoke('sleep:get'),
  setSleepSchedule: (data) => ipcRenderer.invoke('sleep:set', data),

  // Auto-launch
  getAutoLaunch: ()       => ipcRenderer.invoke('app:getAutoLaunch'),
  setAutoLaunch: (enable) => ipcRenderer.invoke('app:setAutoLaunch', enable),

  // Updates
  checkForUpdates: () => ipcRenderer.invoke('app:checkForUpdates'),
  installUpdate:   () => ipcRenderer.invoke('app:installUpdate'),
  onUpdateAvailable: (cb) => ipcRenderer.on('update:available', (_, v) => cb(v)),
  onUpdateDownloaded: (cb) => ipcRenderer.on('update:downloaded', (_, v) => cb(v)),
});
