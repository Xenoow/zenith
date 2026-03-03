const Store = require('electron-store');

// ===== Badge definitions =====
const BADGE_DEFS = [
  { id: 'first_task',  label: 'Première tâche',    desc: 'Compléter votre première tâche',            icon: '🌱' },
  { id: 'five_in_day', label: 'Journée productive', desc: '5 tâches accomplies en une journée',        icon: '⚡' },
  { id: 'perfect_day', label: 'Journée parfaite',   desc: 'Toutes les tâches du jour accomplies',      icon: '✨' },
  { id: 'early_bird',  label: 'En avance',           desc: "Compléter une tâche avant l'heure prévue", icon: '🕐' },
  { id: 'streak_3',    label: 'Sur la lancée',       desc: '3 jours consécutifs actifs',               icon: '🔥' },
  { id: 'streak_7',    label: 'Semaine impeccable',  desc: '7 jours consécutifs actifs',               icon: '🏆' },
  { id: 'level_5',     label: 'Expérimenté',         desc: 'Atteindre le niveau 5',                    icon: '⭐' },
  { id: 'level_10',    label: 'Maître',              desc: 'Atteindre le niveau 10',                   icon: '💎' },
];

const store = new Store({
  name: 'planning-data',
  defaults: {
    tasks:            [],
    notes:            {},
    profile:          { level: 1, total_xp: 0, current_xp: 0, badges: [], streak: 0, last_active_date: null },
    username:         'Utilisateur',
    profilePhoto:     null,
    recurrings:       [],
    sleepSchedule:    { wakeTime: '07:00', bedTime: '23:00', screenDisconnect: false, screenTaskId: null },
    _nextTaskId:      1,
    _nextRecurringId: 1,
  },
});

function nextId(key) {
  const id = store.get(key, 1);
  store.set(key, id + 1);
  return id;
}

function xpToNextLevel(level) {
  return 100 + (level - 1) * 50;
}

function toISODate(d) {
  return d.toISOString().split('T')[0];
}

// Active tasks only (excludes soft-deleted recurring instances)
function activeTasks() {
  return store.get('tasks', []).filter(t => !t.deleted);
}

const queries = {
  getTasksByDate(date) {
    return activeTasks()
      .filter(t => t.due_date === date)
      .sort((a, b) => {
        if (a.due_time && b.due_time) return a.due_time.localeCompare(b.due_time);
        if (a.due_time) return -1;
        if (b.due_time) return 1;
        const pOrder = { high: 0, medium: 1, low: 2 };
        return pOrder[a.priority] - pOrder[b.priority];
      });
  },

  getAllTasks() {
    return activeTasks()
      .sort((a, b) => b.due_date.localeCompare(a.due_date) || b.id - a.id);
  },

  getTasksForMonth(yearMonth) {
    const map = {};
    activeTasks()
      .filter(t => t.due_date.startsWith(yearMonth))
      .forEach(t => {
        if (!map[t.due_date]) map[t.due_date] = { due_date: t.due_date, total: 0, done: 0 };
        map[t.due_date].total++;
        if (t.completed) map[t.due_date].done++;
      });
    return Object.values(map);
  },

  getUpcomingTasks() {
    const today = toISODate(new Date());
    return activeTasks()
      .filter(t => !t.completed && t.due_date >= today && t.due_time)
      .sort((a, b) => a.due_date.localeCompare(b.due_date) || a.due_time.localeCompare(b.due_time));
  },

  getTaskById(id) {
    return activeTasks().find(t => t.id === id) || null;
  },

  getOverdueTasks(today) {
    return activeTasks()
      .filter(t => !t.completed && t.due_date < today)
      .sort((a, b) => a.due_date.localeCompare(b.due_date));
  },

  getProfile() {
    const raw = store.get('profile', { level: 1, total_xp: 0, current_xp: 0, badges: [], streak: 0, last_active_date: null });
    const unlockedIds = raw.badges || [];
    const badges = BADGE_DEFS.map(b => ({ ...b, unlocked: unlockedIds.includes(b.id) }));
    return { ...raw, badges, streak: raw.streak || 0 };
  },

  getStats() {
    const tasks = activeTasks();
    return {
      total_tasks:     tasks.length,
      completed_tasks: tasks.filter(t => t.completed).length,
      days_planned:    new Set(tasks.map(t => t.due_date)).size,
    };
  },

  getTasksForWeek(startDate) {
    const tasks  = activeTasks();
    const result = {};
    for (let i = 0; i < 7; i++) {
      const d    = new Date(startDate + 'T00:00:00');
      d.setDate(d.getDate() + i);
      const date = toISODate(d);
      result[date] = tasks
        .filter(t => t.due_date === date)
        .sort((a, b) => {
          if (a.due_time && b.due_time) return a.due_time.localeCompare(b.due_time);
          if (a.due_time) return -1;
          if (b.due_time) return 1;
          return 0;
        });
    }
    return result;
  },

  getDailyStats(date) {
    const tasks    = activeTasks().filter(t => t.due_date === date);
    const done     = tasks.filter(t => t.completed);
    const xpEarned = done.reduce((s, t) => s + (t.xp_reward || 0), 0);
    const profile  = store.get('profile', {});
    return {
      total:     tasks.length,
      completed: done.length,
      xp_earned: xpEarned,
      streak:    profile.streak || 0,
    };
  },

  getWeeklyStats() {
    const tasks  = activeTasks();
    const result = [];
    for (let i = 6; i >= 0; i--) {
      const d        = new Date();
      d.setDate(d.getDate() - i);
      const date     = toISODate(d);
      const dayTasks = tasks.filter(t => t.due_date === date);
      result.push({
        date,
        label:     d.toLocaleDateString('fr-FR', { weekday: 'short' }),
        total:     dayTasks.length,
        completed: dayTasks.filter(t => t.completed).length,
        xp:        dayTasks.filter(t => t.completed).reduce((s, t) => s + (t.xp_reward || 0), 0),
      });
    }
    return result;
  },
};

function insertTask(data) {
  const id  = nextId('_nextTaskId');
  const XP  = { low: 10, medium: 25, high: 50 };
  const task = {
    id,
    title:        data.title,
    description:  data.description  || '',
    priority:     data.priority     || 'medium',
    due_date:     data.due_date,
    due_time:     data.due_time     || null,
    due_time_end: data.due_time_end || null,
    color:        data.color        || null,
    completed:    false,
    xp_reward:    XP[data.priority] || 25,
    created_at:   new Date().toISOString(),
  };
  const tasks = store.get('tasks', []);
  tasks.push(task);
  store.set('tasks', tasks);
  return id;
}

function updateTask(data) {
  const XP   = { low: 10, medium: 25, high: 50 };
  const tasks = store.get('tasks', []);
  const idx   = tasks.findIndex(t => t.id === data.id);
  if (idx === -1) return;
  tasks[idx] = {
    ...tasks[idx],
    title:        data.title,
    description:  data.description  || '',
    priority:     data.priority     || 'medium',
    due_date:     data.due_date,
    due_time:     data.due_time     || null,
    due_time_end: data.due_time_end !== undefined ? (data.due_time_end || null) : tasks[idx].due_time_end,
    color:        data.color !== undefined ? (data.color || null) : tasks[idx].color,
    xp_reward:    XP[data.priority] || 25,
  };
  store.set('tasks', tasks);
}

function deleteTask(id) {
  const tasks = store.get('tasks', []);
  const task  = tasks.find(t => t.id === id);
  if (task?.recurring_id) {
    // Soft-delete: keep as tombstone so generateRecurringInstances won't recreate it
    const idx = tasks.findIndex(t => t.id === id);
    tasks[idx] = { ...tasks[idx], deleted: true };
    store.set('tasks', tasks);
  } else {
    store.set('tasks', tasks.filter(t => t.id !== id));
  }
}

// Restore a previously deleted task (undo support) — preserves original id
function restoreTask(task) {
  const tasks = store.get('tasks', []).filter(t => t.id !== task.id);
  tasks.push(task);
  store.set('tasks', tasks);
  const currentNext = store.get('_nextTaskId', 1);
  if (task.id >= currentNext) store.set('_nextTaskId', task.id + 1);
  return task.id;
}

// Move task to a new date (reschedule / postpone)
function rescheduleTask(id, newDate) {
  const tasks = store.get('tasks', []);
  const idx   = tasks.findIndex(t => t.id === id);
  if (idx === -1) return;
  tasks[idx] = { ...tasks[idx], due_date: newDate };
  store.set('tasks', tasks);
}

function getNote(date) {
  return store.get('notes', {})[date] || '';
}

function saveNote(date, content) {
  const notes = store.get('notes', {});
  notes[date] = content;
  store.set('notes', notes);
}

function completeTask(taskId) {
  const task = queries.getTaskById(taskId);
  if (!task || task.completed) return null;

  const tasks = store.get('tasks', []);
  tasks[tasks.findIndex(t => t.id === taskId)].completed = true;
  store.set('tasks', tasks);

  // Early completion bonus (+50% XP if completed before due time)
  let bonusXp = 0;
  let isEarly = false;
  if (task.due_time && task.due_date) {
    const now         = new Date();
    const dueDateTime = new Date(`${task.due_date}T${task.due_time}:00`);
    if (now < dueDateTime) {
      bonusXp = Math.round(task.xp_reward * 0.5);
      isEarly = true;
    }
  }

  const xpEarned   = task.xp_reward + bonusXp;
  const rawProfile = store.get('profile', { level: 1, total_xp: 0, current_xp: 0, badges: [], streak: 0, last_active_date: null });

  let newTotal   = rawProfile.total_xp + xpEarned;
  let newCurrent = rawProfile.current_xp + xpEarned;
  let newLevel   = rawProfile.level;
  let leveledUp  = false;

  while (newCurrent >= xpToNextLevel(newLevel)) {
    newCurrent -= xpToNextLevel(newLevel);
    newLevel++;
    leveledUp = true;
  }

  // Streak update
  const today      = toISODate(new Date());
  const lastActive = rawProfile.last_active_date;
  let streak       = rawProfile.streak || 0;
  if (lastActive !== today) {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    streak = lastActive === toISODate(yesterday) ? streak + 1 : 1;
  }

  // Badge checks
  let unlockedIds      = [...(rawProfile.badges || [])];
  let newBadges        = [];
  const allCompleted   = store.get('tasks', []).filter(t => t.completed);
  const todayCompleted = allCompleted.filter(t => t.due_date === today);
  const todayAll       = store.get('tasks', []).filter(t => t.due_date === today);

  const tryUnlock = (id) => {
    if (!unlockedIds.includes(id)) {
      unlockedIds.push(id);
      const def = BADGE_DEFS.find(b => b.id === id);
      if (def) newBadges.push(def);
    }
  };

  if (allCompleted.length === 1)                                tryUnlock('first_task');
  if (todayCompleted.length >= 5)                              tryUnlock('five_in_day');
  if (isEarly)                                                  tryUnlock('early_bird');
  if (streak >= 3)                                              tryUnlock('streak_3');
  if (streak >= 7)                                              tryUnlock('streak_7');
  if (newLevel >= 5)                                            tryUnlock('level_5');
  if (newLevel >= 10)                                           tryUnlock('level_10');
  if (todayAll.length > 0 && todayAll.every(t => t.completed)) tryUnlock('perfect_day');

  store.set('profile', {
    level:            newLevel,
    total_xp:         newTotal,
    current_xp:       newCurrent,
    badges:           unlockedIds,
    streak,
    last_active_date: today,
  });

  return {
    xpEarned,
    baseXp:      task.xp_reward,
    bonusXp,
    isEarly,
    newLevel,
    newCurrentXp: newCurrent,
    xpToNext:     xpToNextLevel(newLevel),
    leveledUp,
    streak,
    newBadges,
  };
}

function uncompleteTask(taskId) {
  const task = queries.getTaskById(taskId);
  if (!task || !task.completed) return null;

  const tasks = store.get('tasks', []);
  tasks[tasks.findIndex(t => t.id === taskId)].completed = false;
  store.set('tasks', tasks);

  const rawProfile = store.get('profile', {});
  const newTotal   = Math.max(0, rawProfile.total_xp - task.xp_reward);
  let level = 1, accumulated = 0;
  while (accumulated + xpToNextLevel(level) <= newTotal) {
    accumulated += xpToNextLevel(level);
    level++;
  }

  store.set('profile', { ...rawProfile, level, total_xp: newTotal, current_xp: newTotal - accumulated });
  return { level, newCurrentXp: newTotal - accumulated, xpToNext: xpToNextLevel(level) };
}

function getUsername() {
  return store.get('username', 'Utilisateur');
}

function setUsername(name) {
  store.set('username', (name || '').trim() || 'Utilisateur');
}

// ===== Profile photo =====
function getProfilePhoto() {
  return store.get('profilePhoto', null);
}

function setProfilePhoto(base64) {
  store.set('profilePhoto', base64 || null);
}

// ===== Recurring task templates =====
function nextRecurringId() {
  const id = store.get('_nextRecurringId', 1);
  store.set('_nextRecurringId', id + 1);
  return id;
}

function insertRecurring(data) {
  const id = nextRecurringId();
  const XP = { low: 10, medium: 25, high: 50 };
  const template = {
    id,
    title:        data.title,
    description:  data.description  || '',
    priority:     data.priority     || 'medium',
    due_time:     data.due_time     || null,
    due_time_end: data.due_time_end || null,
    recurrence:   data.recurrence,                    // 'daily' | 'weekly' | 'monthly' | 'weekly_custom'
    day_of_week:  data.day_of_week  ?? null,          // 0-6 for weekly
    days_of_week: data.days_of_week ?? null,          // [0-6,...] for weekly_custom
    day_of_month: data.day_of_month ?? null, // 1-31 for monthly
    xp_reward:    XP[data.priority] || 25,
    created_at:   new Date().toISOString(),
  };
  const recurrings = store.get('recurrings', []);
  recurrings.push(template);
  store.set('recurrings', recurrings);
  return id;
}

function getRecurrings() {
  return store.get('recurrings', []);
}

function deleteRecurring(id) {
  store.set('recurrings', store.get('recurrings', []).filter(r => r.id !== id));
  // Remove future non-completed instances
  const today = toISODate(new Date());
  store.set('tasks', store.get('tasks', []).filter(
    t => !(t.recurring_id === id && !t.completed && t.due_date >= today)
  ));
}

function generateRecurringInstances(date) {
  const d          = new Date(date + 'T00:00:00');
  const recurrings = store.get('recurrings', []);
  if (!recurrings.length) return;

  const tasks   = store.get('tasks', []);
  const existed = new Set(
    tasks.filter(t => t.due_date === date && t.recurring_id != null).map(t => t.recurring_id)
  );

  const XP      = { low: 10, medium: 25, high: 50 };
  let changed   = false;

  for (const r of recurrings) {
    if (existed.has(r.id)) continue;

    let ok = false;
    if (r.recurrence === 'daily') {
      ok = true;
    } else if (r.recurrence === 'weekly') {
      ok = d.getDay() === (r.day_of_week ?? 1);
    } else if (r.recurrence === 'weekly_custom') {
      ok = Array.isArray(r.days_of_week) && r.days_of_week.includes(d.getDay());
    } else if (r.recurrence === 'monthly') {
      ok = d.getDate() === (r.day_of_month ?? 1);
    }

    if (ok) {
      const id = nextId('_nextTaskId');
      tasks.push({
        id,
        title:        r.title,
        description:  r.description  || '',
        priority:     r.priority,
        due_date:     date,
        due_time:     r.due_time     || null,
        due_time_end: r.due_time_end || null,
        completed:    false,
        xp_reward:    XP[r.priority] || 25,
        recurring_id: r.id,
        created_at:   new Date().toISOString(),
      });
      changed = true;
    }
  }

  if (changed) store.set('tasks', tasks);
}

function generateRecurringForRange(startDate, endDate) {
  const end = new Date(endDate + 'T00:00:00');
  const cur = new Date(startDate + 'T00:00:00');
  while (cur <= end) {
    generateRecurringInstances(toISODate(cur));
    cur.setDate(cur.getDate() + 1);
  }
}

function getSleepSchedule() {
  return store.get('sleepSchedule', { wakeTime: '07:00', bedTime: '23:00', screenDisconnect: false, screenTaskId: null });
}
function setSleepSchedule(data) {
  store.set('sleepSchedule', { ...getSleepSchedule(), ...data });
}

module.exports = {
  queries, insertTask, updateTask, deleteTask,
  restoreTask, rescheduleTask,
  completeTask, uncompleteTask, xpToNextLevel,
  getNote, saveNote,
  getUsername, setUsername,
  getProfilePhoto, setProfilePhoto,
  insertRecurring, getRecurrings, deleteRecurring, generateRecurringInstances, generateRecurringForRange,
  getSleepSchedule, setSleepSchedule,
};
