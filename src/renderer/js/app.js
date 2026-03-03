// ===== Global state =====
window.state = {
  currentView:   'day',
  currentDate:   new Date(),
  editingTaskId: null,
  darkMode:      false,
  theme:         'light',
};

// ===== Undo stack =====
const _undoStack = [];
const _MAX_UNDO  = 20;

window.pushUndo = function(op) {
  _undoStack.push(op);
  if (_undoStack.length > _MAX_UNDO) _undoStack.shift();
};

async function doUndo() {
  if (!_undoStack.length) { showToast('Rien à annuler'); return; }
  const op = _undoStack.pop();
  if (op.type === 'delete') {
    await window.api.restoreTask(op.task);
    showToast('Tâche restaurée ✓');
  } else if (op.type === 'complete') {
    await window.api.uncompleteTask(op.taskId);
    await refreshXpBar();
    showToast('Complétion annulée');
  } else if (op.type === 'reschedule') {
    await window.api.rescheduleTask(op.taskId, op.prevDate);
    showToast('Déplacement annulé');
  } else if (op.type === 'create') {
    await window.api.deleteTask(op.taskId);
    showToast('Création annulée');
  }
  refreshDaySummary();
  if (window.state.currentView === 'day') renderDayView();
  if (window.state.currentView === 'all') renderAllTasks();
}

// ===== Utilities =====
function toISODate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatDayTitle(date) {
  const today     = toISODate(new Date());
  const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
  const tomorrow  = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
  const d = toISODate(date);
  if (d === today)                return "Aujourd'hui";
  if (d === toISODate(yesterday)) return 'Hier';
  if (d === toISODate(tomorrow))  return 'Demain';
  return date.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
}

function getLevelTitle(level) {
  if (level <= 2)  return { title: 'Débutant',  icon: '🌱' };
  if (level <= 4)  return { title: 'Apprenti',  icon: '📝' };
  if (level <= 6)  return { title: 'Organisé',  icon: '📋' };
  if (level <= 9)  return { title: 'Expert',    icon: '⭐' };
  if (level <= 14) return { title: 'Maître',    icon: '🏆' };
  return             { title: 'Légende',         icon: '💎' };
}

window.toISODate      = toISODate;
window.formatDayTitle = formatDayTitle;
window.getLevelTitle  = getLevelTitle;

function calcXpToNext(level) { return 100 + (level - 1) * 50; }
window.calcXpToNext = calcXpToNext;

// ===== View routing =====
function showView(name) {
  document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.getElementById(`view-${name}`)?.classList.remove('hidden');
  document.querySelector(`[data-view="${name}"]`)?.classList.add('active');
  window.state.currentView = name;
  if (name === 'day')       renderDayView();
  if (name === 'week')      renderWeekView();
  if (name === 'calendar')  renderCalendarView();
  if (name === 'all')       renderAllTasks();
  if (name === 'profile')   renderProfileView();
  if (name === 'recurring') renderRecurringView();
}
window.showView = showView;

// ===== Avatar helper =====
function avatarInitial(name) {
  return (name || 'U').trim().charAt(0).toUpperCase();
}

function updateAvatarInitial(name) {
  const letter = avatarInitial(name);
  const el     = document.getElementById('profile-avatar-letter');
  if (el) el.textContent = letter;
}

function applyProfilePhoto(base64) {
  // Sidebar avatar
  const sbLetter = document.getElementById('profile-avatar-letter');
  const sbImg    = document.getElementById('profile-avatar-img');
  if (base64) {
    if (sbLetter) sbLetter.style.display = 'none';
    if (sbImg) { sbImg.src = base64; sbImg.style.display = 'block'; }
  } else {
    if (sbLetter) sbLetter.style.display = '';
    if (sbImg) { sbImg.src = ''; sbImg.style.display = 'none'; }
  }
  // Profile big avatar
  const pbLetter = document.getElementById('pb-badge-letter');
  const pbImg    = document.getElementById('pb-badge-img');
  if (base64) {
    if (pbLetter) pbLetter.style.display = 'none';
    if (pbImg) { pbImg.src = base64; pbImg.style.display = 'block'; }
  } else {
    if (pbLetter) pbLetter.style.display = '';
    if (pbImg) { pbImg.src = ''; pbImg.style.display = 'none'; }
  }
}
window.applyProfilePhoto = applyProfilePhoto;

// ===== XP bar =====
async function refreshXpBar() {
  const p        = await window.api.getProfile();
  const xpToNext = calcXpToNext(p.level);
  const pct      = Math.min(100, Math.round((p.current_xp / xpToNext) * 100));

  document.getElementById('xp-bar').style.transform = `scaleX(${pct / 100})`;
  document.getElementById('xp-current').textContent = p.current_xp;
  document.getElementById('xp-next').textContent    = xpToNext;
  document.getElementById('profile-level').textContent = p.level;

  const lt   = getLevelTitle(p.level);
  const ltSb = document.getElementById('profile-level-title-sb');
  if (ltSb) ltSb.textContent = `${lt.icon} ${lt.title}`;

  // Streak chip
  const streakEl = document.getElementById('sb-streak-chip');
  if (streakEl) {
    const s = p.streak || 0;
    streakEl.textContent = `🔥 ${s} jour${s !== 1 ? 's' : ''}`;
    streakEl.classList.toggle('zero', s === 0);
  }
}
window.refreshXpBar = refreshXpBar;

// ===== Username inline edit =====
function initUsernameEdit() {
  const el = document.getElementById('profile-username');
  if (!el) return;
  el.onclick = () => {
    const current = el.textContent;
    const input   = document.createElement('input');
    input.type      = 'text';
    input.value     = current;
    input.maxLength = 24;
    input.className = 'profile-username-input';
    el.replaceWith(input);
    input.focus(); input.select();

    async function save() {
      const newName = input.value.trim() || current;
      await window.api.setUsername(newName);
      const span    = document.createElement('span');
      span.id        = 'profile-username';
      span.className = 'profile-username';
      span.title     = 'Cliquer pour modifier';
      span.textContent = newName;
      input.replaceWith(span);
      initUsernameEdit();
      updateAvatarInitial(newName);
    }

    input.addEventListener('blur', save);
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter')  { e.preventDefault(); save(); }
      if (e.key === 'Escape') {
        const span = document.createElement('span');
        span.id = 'profile-username'; span.className = 'profile-username';
        span.title = 'Cliquer pour modifier'; span.textContent = current;
        input.replaceWith(span);
        initUsernameEdit();
      }
    });
  };
}

// ===== Notification Manager =====
const notifMgr = {
  enabled:    localStorage.getItem('notif_enabled') === '1',
  _sent:      new Set(),   // "taskId:type" — évite les doublons
  _todayStr:  '',

  init() {
    // Si déjà activé, re-demander la permission si nécessaire
    if (this.enabled && Notification.permission === 'default') {
      Notification.requestPermission().then(p => {
        if (p !== 'granted') { this.enabled = false; this._updateBtn(); }
      });
    }
    if (this.enabled && Notification.permission === 'denied') {
      this.enabled = false;
      localStorage.setItem('notif_enabled', '0');
    }
    // Vérification toutes les minutes
    setInterval(() => this.check(), 60_000);
    this._updateBtn();
  },

  async check() {
    if (!this.enabled || Notification.permission !== 'granted') return;

    const today = toISODate(new Date());
    // Réinitialiser les envois à minuit
    if (this._todayStr !== today) { this._sent.clear(); this._todayStr = today; }

    const now    = new Date();
    const nowMin = now.getHours() * 60 + now.getMinutes();
    const tasks  = await window.api.getTasksByDate(today);

    for (const task of tasks) {
      if (task.completed || !task.due_time) continue;

      const [sh, sm] = task.due_time.split(':').map(Number);
      const startMin = sh * 60 + sm;

      // Début de tâche
      if (nowMin === startMin)
        this._fire(task.id, 'start', `📌 ${task.title}`, "C'est l'heure de commencer !");

      if (!task.due_time_end) continue;
      const [eh, em] = task.due_time_end.split(':').map(Number);
      const endMin   = eh * 60 + em;

      // 10 min avant la fin
      if (nowMin === endMin - 10)
        this._fire(task.id, 'end10', `⏰ ${task.title}`, 'Se termine dans 10 minutes');

      // 5 min avant la fin
      if (nowMin === endMin - 5)
        this._fire(task.id, 'end5', `⏰ ${task.title}`, 'Se termine dans 5 minutes');

      // Heure de fin
      if (nowMin === endMin)
        this._fire(task.id, 'end', `✅ ${task.title}`, 'Heure de fin atteinte');
    }
  },

  _fire(taskId, type, title, body) {
    const key = `${taskId}:${type}`;
    if (this._sent.has(key)) return;
    this._sent.add(key);
    new Notification(title, { body, silent: false });
  },

  // Notification ponctuelle (utilisée par le timer)
  send(title, body) {
    if (!this.enabled || Notification.permission !== 'granted') return;
    new Notification(title, { body, silent: false });
  },

  async toggle() {
    if (this.enabled) {
      this.enabled = false;
      localStorage.setItem('notif_enabled', '0');
      this._updateBtn();
      showToast('Notifications désactivées');
      return false;
    }
    // Demander la permission si besoin
    if (Notification.permission === 'default') {
      const p = await Notification.requestPermission();
      if (p !== 'granted') {
        showToast('Permission refusée par le navigateur');
        this._updateBtn();
        return false;
      }
    }
    if (Notification.permission !== 'granted') {
      showToast('Autorisez les notifications dans les paramètres du système');
      this._updateBtn();
      return false;
    }
    this.enabled = true;
    localStorage.setItem('notif_enabled', '1');
    this._updateBtn();
    showToast('Notifications activées 🔔');
    // Test immédiat
    new Notification('Zenith — Notifications activées 🔔', {
      body: 'Tu seras averti au démarrage des tâches et avant leur fin.',
      silent: true,
    });
    return true;
  },

  _updateBtn() {
    const btn = document.getElementById('btn-notif');
    if (!btn) return;
    const on = this.enabled && Notification.permission === 'granted';
    btn.classList.toggle('active', on);
    btn.title = on ? 'Notifications activées — cliquer pour désactiver'
                   : 'Notifications désactivées — cliquer pour activer';
  },
};
window.notifMgr = notifMgr;

// ===== Daily summary (sidebar) =====
async function refreshDaySummary() {
  const date    = toISODate(window.state.currentDate);
  const stats   = await window.api.getDailyStats(date);
  const tasksEl = document.getElementById('sds-tasks');
  const xpEl    = document.getElementById('sds-xp');
  if (tasksEl) tasksEl.textContent = `✅ ${stats.completed} / ${stats.total}`;
  if (xpEl)    xpEl.textContent    = `⚡ ${stats.xp_earned} XP`;
}
window.refreshDaySummary = refreshDaySummary;

// ===== Generic toast =====
function showToast(message, duration = 3000) {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className   = 'app-toast';
  toast.textContent = message;
  container.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('visible'));
  setTimeout(() => {
    toast.classList.remove('visible');
    setTimeout(() => toast.remove(), 320);
  }, duration);
}
window.showToast = showToast;

// ===== Overdue briefing toast =====
async function checkOverdueTasks() {
  const today   = toISODate(new Date());
  const overdue = await window.api.getOverdueTasks(today);
  if (!overdue.length) return;

  const toastEl = document.getElementById('overdue-toast');
  const listEl  = document.getElementById('ot-list');
  if (!toastEl || !listEl) return;

  function esc(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  listEl.innerHTML = overdue.map(t => `
    <li class="ot-item" data-id="${t.id}">
      <span class="ot-task-title">${esc(t.title)}</span>
      <span class="ot-task-date">${t.due_date}</span>
      <button class="ot-del-btn" data-id="${t.id}" title="Supprimer">🗑️</button>
    </li>
  `).join('');

  toastEl.classList.remove('hidden');

  // Delete individual overdue task
  listEl.addEventListener('click', async e => {
    const btn = e.target.closest('.ot-del-btn');
    if (!btn) return;
    const taskId = parseInt(btn.dataset.id);
    await window.api.deleteTask(taskId);
    const idx = overdue.findIndex(t => t.id === taskId);
    if (idx !== -1) overdue.splice(idx, 1);
    btn.closest('.ot-item').remove();
    if (!overdue.length) toastEl.classList.add('hidden');
    refreshDaySummary();
    if (window.state.currentView === 'day') renderDayView();
    if (window.state.currentView === 'all') renderAllTasks();
  });

  document.getElementById('ot-close').onclick   = () => toastEl.classList.add('hidden');
  document.getElementById('ot-dismiss').onclick = () => toastEl.classList.add('hidden');

  document.getElementById('ot-reschedule-all').onclick = async () => {
    const tomorrow    = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = toISODate(tomorrow);
    for (const t of overdue) {
      window.pushUndo({ type: 'reschedule', taskId: t.id, prevDate: t.due_date });
      await window.api.rescheduleTask(t.id, tomorrowStr);
    }
    toastEl.classList.add('hidden');
    const n = overdue.length;
    showToast(`${n} tâche${n > 1 ? 's' : ''} reportée${n > 1 ? 's' : ''} à demain ✓`);
    refreshDaySummary();
    if (window.state.currentView === 'day') renderDayView();
    if (window.state.currentView === 'all') renderAllTasks();
  };
}

// ===== Profile view =====
async function renderProfileView() {
  const p      = await window.api.getProfile();
  const stats  = await window.api.getStats();
  const weekly = await window.api.getWeeklyStats();
  const xpToNext = calcXpToNext(p.level);
  const pct      = Math.min(100, Math.round((p.current_xp / xpToNext) * 100));

  document.getElementById('pb-badge-letter').textContent = p.level;
  document.getElementById('pb-level').textContent   = p.level;
  document.getElementById('pb-xp-bar').style.transform = `scaleX(${pct / 100})`;
  document.getElementById('pb-xp-cur').textContent  = p.current_xp;
  document.getElementById('pb-xp-next').textContent = xpToNext;
  document.getElementById('pb-total').textContent   = p.total_xp;

  const lt   = getLevelTitle(p.level);
  const ltEl = document.getElementById('pb-level-title');
  if (ltEl) ltEl.textContent = `${lt.icon} ${lt.title}`;

  const streakEl = document.getElementById('pb-streak');
  if (streakEl) {
    const s = p.streak || 0;
    streakEl.textContent = `🔥 ${s} jour${s !== 1 ? 's' : ''} de suite`;
  }

  document.getElementById('stat-total').textContent = stats.total_tasks     || 0;
  document.getElementById('stat-done').textContent  = stats.completed_tasks || 0;
  document.getElementById('stat-days').textContent  = stats.days_planned    || 0;

  // Weekly chart
  const chart = document.getElementById('weekly-chart');
  if (chart && weekly) {
    const maxXp = Math.max(...weekly.map(d => d.xp), 1);
    chart.innerHTML = weekly.map(d => {
      const heightPct = Math.round((d.xp / maxXp) * 100);
      const isToday   = d.date === toISODate(new Date());
      return `
        <div class="wc-col${isToday ? ' today' : ''}">
          <div class="wc-bar-wrap">
            <div class="wc-bar" style="height:${heightPct}%"></div>
          </div>
          <div class="wc-xp">${d.xp > 0 ? d.xp : ''}</div>
          <div class="wc-label">${d.label}</div>
        </div>
      `;
    }).join('');
  }

  // Badges
  const badgesEl = document.getElementById('badges-grid');
  if (badgesEl && p.badges) {
    badgesEl.innerHTML = p.badges.map(b => `
      <div class="badge-item${b.unlocked ? ' unlocked' : ' locked'}" title="${b.desc}">
        <div class="badge-icon">${b.icon}</div>
        <div class="badge-label">${b.label}</div>
      </div>
    `).join('');
  }

  // Recurring tasks list
  await renderRecurringsList();
}

// ===== Recurring tasks list (profile view) =====
async function renderRecurringsList() {
  const listEl = document.getElementById('recurrings-list');
  if (!listEl) return;
  const recs = await window.api.getRecurrings();
  if (!recs.length) {
    listEl.innerHTML = `<div class="empty-state" style="padding:12px 0"><span class="es-icon">🔄</span><p>Aucune tâche récurrente.</p></div>`;
    return;
  }
  const LABELS = { daily: 'Chaque jour', weekly: 'Chaque semaine', monthly: 'Chaque mois' };
  function esc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  listEl.innerHTML = recs.map(r => `
    <div class="recurring-item" data-id="${r.id}">
      <div class="ri-left">
        <span class="ri-title">${esc(r.title)}</span>
        <span class="ri-freq">${LABELS[r.recurrence] || r.recurrence}${r.due_time ? ' · ' + r.due_time : ''}</span>
      </div>
      <button class="ri-del" data-id="${r.id}" title="Supprimer">🗑️</button>
    </div>
  `).join('');
  listEl.querySelectorAll('.ri-del').forEach(btn => {
    btn.addEventListener('click', async () => {
      await window.api.deleteRecurring(parseInt(btn.dataset.id));
      showToast('Tâche récurrente supprimée');
      renderRecurringsList();
    });
  });
}

// ===== Dedicated Recurring view =====
async function renderRecurringView() {
  const container = document.getElementById('recurrings-list-view');
  if (!container) return;

  const recs = await window.api.getRecurrings();
  container.innerHTML = '';

  if (!recs.length) {
    container.innerHTML = `
      <div class="empty-state" style="margin-top:80px">
        <span class="es-icon">🔄</span>
        <p>Aucune tâche récurrente</p>
        <p class="es-sub">Cliquez sur "+ Nouvelle" pour créer une tâche qui se répète automatiquement chaque jour, chaque semaine ou selon un planning personnalisé.</p>
      </div>`;
    return;
  }

  const DAY_SHORT = ['D','L','M','M','J','V','S']; // 0=Dim,1=Lun,...
  const DAY_ORDER = [1,2,3,4,5,6,0];              // L M M J V S D
  const DAY_NAMES = ['Dimanche','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'];

  function freqLabel(r) {
    if (r.recurrence === 'daily')         return 'Chaque jour';
    if (r.recurrence === 'weekly')        return `Chaque ${DAY_NAMES[r.day_of_week ?? 1]}`;
    if (r.recurrence === 'monthly')       return `Chaque mois · J.${r.day_of_month ?? 1}`;
    if (r.recurrence === 'weekly_custom') return 'Jours personnalisés';
    return r.recurrence;
  }

  function parseDays(r) {
    if (!r.days_of_week) return [];
    if (Array.isArray(r.days_of_week)) return r.days_of_week;
    try { return JSON.parse(r.days_of_week); } catch { return []; }
  }

  function esc(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  recs.forEach(r => {
    const days     = parseDays(r);
    const isCustom = r.recurrence === 'weekly_custom';
    const timeStr  = r.due_time ? r.due_time + (r.due_time_end ? ' → ' + r.due_time_end : '') : '';

    const card = document.createElement('div');
    card.className = 'rec-view-card';
    card.dataset.priority = r.priority || 'medium';
    if (r.color) card.dataset.color = r.color;

    const daysHtml = isCustom ? `
      <div class="rec-view-days">
        ${DAY_ORDER.map(d =>
          `<span class="rec-view-day${days.includes(d) ? ' on' : ''}">${DAY_SHORT[d]}</span>`
        ).join('')}
      </div>` : '';

    card.innerHTML = `
      <div class="rec-view-card-icon">🔄</div>
      <div class="rec-view-body">
        <div class="rec-view-title">${esc(r.title)}</div>
        <div class="rec-view-meta">
          <span class="rec-view-badge">${freqLabel(r)}</span>
          ${timeStr ? `<span class="rec-view-time">⏰ ${timeStr}</span>` : ''}
        </div>
        ${daysHtml}
      </div>
      <button class="rec-view-del" title="Supprimer">🗑️</button>
    `;

    card.querySelector('.rec-view-del').addEventListener('click', e => {
      e.stopPropagation();
      const del = async () => {
        await window.api.deleteRecurring(r.id);
        showToast('Tâche récurrente supprimée');
        renderRecurringView();
        renderRecurringsList();
      };
      if (window.showDeleteConfirm) {
        window.showDeleteConfirm(e.currentTarget, del);
      } else {
        del();
      }
    });

    container.appendChild(card);
  });
}
window.renderRecurringView = renderRecurringView;

// ===== Recurring task creation modal =====
let _recPriority  = 'medium';
let _recFrequency = 'daily';

function initRecurringModal() {
  const backdrop = document.getElementById('recurring-modal-backdrop');
  const close    = () => backdrop?.classList.add('hidden');

  document.getElementById('recurring-modal-close')?.addEventListener('click', close);
  document.getElementById('recurring-modal-cancel')?.addEventListener('click', close);
  backdrop?.addEventListener('click', e => { if (e.target === e.currentTarget) close(); });

  // Priority buttons
  backdrop?.querySelectorAll('[data-rp]').forEach(btn => {
    btn.addEventListener('click', () => {
      _recPriority = btn.dataset.rp;
      backdrop.querySelectorAll('[data-rp]').forEach(b => b.classList.remove('sel'));
      btn.classList.add('sel');
    });
  });

  // Frequency buttons
  backdrop?.querySelectorAll('[data-rf]').forEach(btn => {
    btn.addEventListener('click', () => {
      _recFrequency = btn.dataset.rf;
      backdrop.querySelectorAll('[data-rf]').forEach(b => b.classList.remove('sel'));
      btn.classList.add('sel');
      document.getElementById('rec-weekly-group')?.classList.toggle('hidden', _recFrequency !== 'weekly');
      document.getElementById('rec-monthly-group')?.classList.toggle('hidden', _recFrequency !== 'monthly');
    });
  });

  document.getElementById('btn-add-recurring')?.addEventListener('click', () => {
    _recPriority  = 'medium';
    _recFrequency = 'daily';
    backdrop?.querySelectorAll('[data-rp]').forEach(b => b.classList.toggle('sel', b.dataset.rp === 'medium'));
    backdrop?.querySelectorAll('[data-rf]').forEach(b => b.classList.toggle('sel', b.dataset.rf === 'daily'));
    document.getElementById('rec-title').value         = '';
    document.getElementById('rec-time').value          = '';
    document.getElementById('rec-time-end').value      = '';
    document.getElementById('rec-weekly-group')?.classList.add('hidden');
    document.getElementById('rec-monthly-group')?.classList.add('hidden');
    backdrop?.classList.remove('hidden');
    document.getElementById('rec-title')?.focus();
  });

  document.getElementById('recurring-modal-save')?.addEventListener('click', async () => {
    const title = document.getElementById('rec-title')?.value.trim();
    if (!title) { document.getElementById('rec-title')?.focus(); return; }

    await window.api.createRecurring({
      title,
      priority:     _recPriority,
      due_time:     document.getElementById('rec-time')?.value     || null,
      due_time_end: document.getElementById('rec-time-end')?.value || null,
      recurrence:   _recFrequency,
      day_of_week:  _recFrequency === 'weekly'  ? parseInt(document.getElementById('rec-day-of-week')?.value  ?? 1) : null,
      day_of_month: _recFrequency === 'monthly' ? parseInt(document.getElementById('rec-day-of-month')?.value ?? 1) : null,
    });

    close();
    showToast('Tâche récurrente créée 🔄');
    renderRecurringsList();
    if (window.state.currentView === 'recurring') renderRecurringView();
    // Generate for the full current year + next year
    const _now = new Date();
    const _yearStart = `${_now.getFullYear()}-01-01`;
    const _yearEnd   = `${_now.getFullYear() + 1}-12-31`;
    await window.api.generateRecurringForRange(_yearStart, _yearEnd);
    if (window.state.currentView === 'day') renderDayView();
    if (window.state.currentView === 'week') renderWeekView();
  });
}

// ===== Auto-launch =====
const autoLaunchMgr = {
  enabled: false,

  async init() {
    this.enabled = await window.api.getAutoLaunch();
    this._updateBtn();
  },

  async toggle() {
    this.enabled = !this.enabled;
    await window.api.setAutoLaunch(this.enabled);
    this._updateBtn();
    showToast(this.enabled ? 'Lancement au démarrage activé' : 'Lancement au démarrage désactivé');
  },

  _updateBtn() {
    const btn = document.getElementById('btn-autolaunch');
    if (!btn) return;
    btn.classList.toggle('active', this.enabled);
    btn.title = this.enabled
      ? 'Lancement au démarrage activé — cliquer pour désactiver'
      : 'Lancement au démarrage désactivé — cliquer pour activer';
  },
};
window.autoLaunchMgr = autoLaunchMgr;

// ===== Theme =====
function applyTheme(theme) {
  // Accept legacy boolean for backward compat
  if (typeof theme === 'boolean') theme = theme ? 'dark' : 'light';
  document.documentElement.dataset.theme = theme === 'light' ? '' : theme;
  window.state.theme    = theme;
  window.state.darkMode = theme === 'dark';
  localStorage.setItem('theme', theme);
}

// ===== Edit Task Modal =====
let modalPriority = 'medium';
let modalColor    = '';

function setModalColor(color) {
  modalColor = color;
  document.querySelectorAll('.modal-color-swatch').forEach(b => {
    b.classList.toggle('sel', b.dataset.color === color);
  });
}

function openEditModal(task) {
  document.getElementById('task-id').value       = task.id;
  document.getElementById('task-title').value    = task.title;
  document.getElementById('task-desc').value     = task.description  || '';
  document.getElementById('task-date').value     = task.due_date;
  document.getElementById('task-time').value     = task.due_time     || '';
  document.getElementById('task-time-end').value = task.due_time_end || '';

  modalPriority = task.priority || 'medium';
  document.querySelectorAll('.prio-opt').forEach(b => {
    b.classList.toggle('sel', b.dataset.p === modalPriority);
  });
  setModalColor(task.color || '');
  document.getElementById('modal-title').textContent = 'Modifier la tâche';
  document.getElementById('modal-backdrop').classList.remove('hidden');
  document.getElementById('task-title').focus();
}
window.openEditModal = openEditModal;

function closeModal() { document.getElementById('modal-backdrop').classList.add('hidden'); }

document.getElementById('modal-close').addEventListener('click', closeModal);
document.getElementById('modal-cancel').addEventListener('click', closeModal);
document.getElementById('modal-backdrop').addEventListener('click', e => {
  if (e.target === e.currentTarget) closeModal();
});

document.querySelectorAll('.prio-opt').forEach(btn => {
  btn.addEventListener('click', () => {
    modalPriority = btn.dataset.p;
    document.querySelectorAll('.prio-opt').forEach(b => b.classList.remove('sel'));
    btn.classList.add('sel');
  });
});

document.querySelectorAll('.modal-color-swatch').forEach(btn => {
  btn.addEventListener('click', () => setModalColor(btn.dataset.color));
});

document.getElementById('modal-save').addEventListener('click', async () => {
  const title = document.getElementById('task-title').value.trim();
  if (!title) return document.getElementById('task-title').focus();
  await window.api.updateTask({
    id:           parseInt(document.getElementById('task-id').value),
    title,
    description:  document.getElementById('task-desc').value.trim(),
    priority:     modalPriority,
    due_date:     document.getElementById('task-date').value,
    due_time:     document.getElementById('task-time').value     || null,
    due_time_end: document.getElementById('task-time-end').value || null,
    color:        modalColor || null,
  });
  closeModal();
  if (window.state.currentView === 'day') renderDayView();
  if (window.state.currentView === 'all') renderAllTasks();
});

// ===== Fin de journée modal =====
// ===== Sleep Schedule Modal =====
let sleepScreenEnabled = false;

function calcSleepDuration(wake, bed) {
  const [wh, wm] = wake.split(':').map(Number);
  const [bh, bm] = bed.split(':').map(Number);
  let mins = (bh * 60 + bm) - (wh * 60 + wm);
  if (mins <= 0) mins += 24 * 60; // crosses midnight
  const sleepMins = 24 * 60 - mins;
  const h = Math.floor(sleepMins / 60);
  const m = sleepMins % 60;
  return `${h}h${m > 0 ? m + 'min' : ''} de sommeil`;
}

function subtractOneHour(time) {
  const [h, m] = time.split(':').map(Number);
  const total = h * 60 + m - 60;
  const nh = ((Math.floor(total / 60) % 24) + 24) % 24;
  const nm = ((total % 60) + 60) % 60;
  return `${String(nh).padStart(2,'0')}:${String(nm).padStart(2,'0')}`;
}

async function openSleepModal() {
  const sched = await window.api.getSleepSchedule();
  document.getElementById('sleep-wake').value = sched.wakeTime || '07:00';
  document.getElementById('sleep-bed').value  = sched.bedTime  || '23:00';
  sleepScreenEnabled = sched.screenDisconnect || false;
  document.getElementById('sleep-screen-toggle').classList.toggle('on', sleepScreenEnabled);
  updateSleepDuration();
  document.getElementById('sleep-backdrop').classList.remove('hidden');
}

function updateSleepDuration() {
  const wake = document.getElementById('sleep-wake').value;
  const bed  = document.getElementById('sleep-bed').value;
  if (wake && bed) {
    document.getElementById('sleep-duration-label').textContent = calcSleepDuration(wake, bed);
  }
}

document.getElementById('sleep-wake').addEventListener('input', updateSleepDuration);
document.getElementById('sleep-bed').addEventListener('input', updateSleepDuration);

document.getElementById('sleep-screen-toggle').addEventListener('click', () => {
  sleepScreenEnabled = !sleepScreenEnabled;
  document.getElementById('sleep-screen-toggle').classList.toggle('on', sleepScreenEnabled);
});

document.getElementById('sleep-save').addEventListener('click', async () => {
  const wake = document.getElementById('sleep-wake').value;
  const bed  = document.getElementById('sleep-bed').value;
  if (!wake || !bed) return;

  // Clean up any old screen disconnect recurring task (from previous system)
  const prev = await window.api.getSleepSchedule();
  if (prev.screenTaskId) await window.api.deleteRecurring(prev.screenTaskId);

  await window.api.setSleepSchedule({
    wakeTime:        wake,
    bedTime:         bed,
    screenDisconnect: sleepScreenEnabled,
    screenTaskId:    null,
  });

  document.getElementById('sleep-backdrop').classList.add('hidden');
  showToast('Horaires de sommeil enregistrés 🌙');
  if (window.state.currentView === 'day') renderDayView();
});

function closeSleepModal() { document.getElementById('sleep-backdrop').classList.add('hidden'); }
document.getElementById('sleep-close').addEventListener('click', closeSleepModal);
document.getElementById('sleep-cancel').addEventListener('click', closeSleepModal);
document.getElementById('sleep-backdrop').addEventListener('click', e => {
  if (e.target === e.currentTarget) closeSleepModal();
});

// ===== Timer button =====
document.getElementById('btn-timer').addEventListener('click', () => {
  document.getElementById('timer-backdrop').classList.remove('hidden');
});

// ===== Shortcuts panel =====
function openShortcuts() {
  document.getElementById('shortcuts-backdrop')?.classList.remove('hidden');
}
function closeShortcuts() {
  document.getElementById('shortcuts-backdrop')?.classList.add('hidden');
}

// ===== Keyboard shortcuts =====
function initKeyboardShortcuts() {
  document.addEventListener('keydown', e => {
    const tag = e.target.tagName;

    // Ctrl/Cmd+Z → undo (always, even in inputs)
    if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
      e.preventDefault();
      doUndo();
      return;
    }

    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag)) return;

    // ? → raccourcis
    if (e.key === '?') { openShortcuts(); return; }

    // D → journée / W → semaine / C → calendrier
    if (e.key === 'd' || e.key === 'D') { showView('day');      return; }
    if (e.key === 'w' || e.key === 'W') { showView('week');     return; }
    if (e.key === 'c' || e.key === 'C') { showView('calendar'); return; }

    // N → nouvelle tâche à l'heure courante
    if ((e.key === 'n' || e.key === 'N') && window.state.currentView === 'day') {
      const now  = new Date();
      const hour = now.getHours();
      const grid = document.getElementById('schedule-grid');
      const slot = grid?.querySelector(`.schedule-slot[data-hour="${hour}"] .slot-content`);
      if (slot && window.openInlineForm) {
        slot.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setTimeout(() => window.openInlineForm(slot, hour, toISODate(window.state.currentDate)), 300);
      }
      return;
    }

    // T → ouvrir/fermer le timer
    if (e.key === 't' || e.key === 'T') {
      document.getElementById('timer-backdrop')?.classList.toggle('hidden');
      return;
    }

    // ← / → → navigation entre les jours
    if (e.key === 'ArrowLeft' && window.state.currentView === 'day') {
      window.state.currentDate.setDate(window.state.currentDate.getDate() - 1);
      renderDayView();
      return;
    }
    if (e.key === 'ArrowRight' && window.state.currentView === 'day') {
      window.state.currentDate.setDate(window.state.currentDate.getDate() + 1);
      renderDayView();
      return;
    }

    // Escape → fermer les modales
    if (e.key === 'Escape') {
      if (!document.getElementById('shortcuts-backdrop').classList.contains('hidden'))
        { closeShortcuts(); return; }
      if (!document.getElementById('sleep-backdrop').classList.contains('hidden'))
        document.getElementById('sleep-backdrop').classList.add('hidden');
      if (!document.getElementById('timer-backdrop').classList.contains('hidden'))
        document.getElementById('timer-backdrop').classList.add('hidden');
      if (!document.getElementById('settings-backdrop').classList.contains('hidden'))
        closeSettings();
    }
  });
}

// ===== Settings panel =====
function switchSettingsTab(name) {
  document.querySelectorAll('.settings-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
  document.querySelectorAll('.settings-tab-content').forEach(c => c.classList.add('hidden'));
  document.getElementById(`settings-tab-${name}`)?.classList.remove('hidden');
}

function openSettings() {
  const currentTheme = window.state.theme || 'light';
  document.querySelectorAll('.theme-opt').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.themeVal === currentTheme);
  });
  document.getElementById('settings-notif-toggle')?.classList.toggle('on', notifMgr.enabled && Notification.permission === 'granted');
  document.getElementById('settings-autolaunch-toggle')?.classList.toggle('on', autoLaunchMgr.enabled);
  switchSettingsTab('general'); // always open on first tab
  document.getElementById('settings-backdrop')?.classList.remove('hidden');
}

function closeSettings() {
  document.getElementById('settings-backdrop')?.classList.add('hidden');
}

// ===== Init =====
async function init() {
  // Load saved theme (support legacy darkMode key)
  const savedTheme = localStorage.getItem('theme')
    || (localStorage.getItem('darkMode') === '1' ? 'dark' : 'light');
  applyTheme(savedTheme);

  // Remove splash overlay after animation completes (3s)
  setTimeout(() => document.getElementById('splash-overlay')?.remove(), 3100);

  // Version dynamique depuis app.getVersion()
  window.api.getAppVersion().then(v => {
    const sv = document.getElementById('sidebar-version');
    const stv = document.getElementById('settings-version');
    if (sv)  sv.textContent  = `v${v}`;
    if (stv) stv.textContent = `Version ${v}`;
  });

  // Pre-generate recurring task instances for current year + next year
  const _initNow = new Date();
  window.api.generateRecurringForRange(
    `${_initNow.getFullYear()}-01-01`,
    `${_initNow.getFullYear() + 1}-12-31`
  );

  document.getElementById('btn-minimize').addEventListener('click', () => window.api.minimize());
  document.getElementById('btn-maximize').addEventListener('click', () => window.api.maximize());
  document.getElementById('btn-close').addEventListener('click',    () => window.api.close());

  document.getElementById('btn-sleep').addEventListener('click', openSleepModal);
  document.getElementById('btn-settings')?.addEventListener('click', openSettings);
  document.getElementById('settings-close')?.addEventListener('click', closeSettings);
  document.getElementById('settings-backdrop')?.addEventListener('click', e => {
    if (e.target === e.currentTarget) closeSettings();
  });
  document.querySelectorAll('.settings-tab').forEach(btn => {
    btn.addEventListener('click', () => switchSettingsTab(btn.dataset.tab));
  });
  document.querySelectorAll('.theme-opt').forEach(btn => {
    btn.addEventListener('click', () => {
      applyTheme(btn.dataset.themeVal);
      document.querySelectorAll('.theme-opt').forEach(b => b.classList.toggle('active', b === btn));
    });
  });
  document.getElementById('settings-notif-toggle')?.addEventListener('click', async () => {
    await notifMgr.toggle();
    document.getElementById('settings-notif-toggle').classList.toggle('on', notifMgr.enabled && Notification.permission === 'granted');
  });
  document.getElementById('settings-autolaunch-toggle')?.addEventListener('click', async () => {
    await autoLaunchMgr.toggle();
    document.getElementById('settings-autolaunch-toggle').classList.toggle('on', autoLaunchMgr.enabled);
  });

  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => showView(btn.dataset.view));
  });

  document.getElementById('prev-day').addEventListener('click', () => {
    window.state.currentDate.setDate(window.state.currentDate.getDate() - 1);
    renderDayView();
  });
  document.getElementById('next-day').addEventListener('click', () => {
    window.state.currentDate.setDate(window.state.currentDate.getDate() + 1);
    renderDayView();
  });
  document.getElementById('btn-today').addEventListener('click', () => {
    window.state.currentDate = new Date();
    renderDayView();
  });

  document.getElementById('filter-priority').addEventListener('change', renderAllTasks);
  document.getElementById('filter-status').addEventListener('change', renderAllTasks);

  // Profile card → navigate to profile view
  document.getElementById('profile-card')?.addEventListener('click', e => {
    // Don't trigger when clicking the username edit input
    if (e.target.closest('.profile-username, .profile-username-input')) return;
    showView('profile');
  });

  // Quick new task button (A)
  document.getElementById('btn-quick-new-task')?.addEventListener('click', () => {
    if (window.state.currentView !== 'day') showView('day');
    const now  = new Date();
    const hour = now.getHours();
    const grid = document.getElementById('schedule-grid');
    const slot = grid?.querySelector(`.schedule-slot[data-hour="${hour}"] .slot-content`);
    if (slot && window.openInlineForm) {
      slot.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setTimeout(() => window.openInlineForm(slot, hour, toISODate(window.state.currentDate)), 300);
    }
  });

  // Sidebar collapse toggle (C)
  const sidebar = document.getElementById('sidebar');
  if (localStorage.getItem('sidebarCollapsed') === '1') sidebar?.classList.add('collapsed');
  document.getElementById('btn-sidebar-toggle')?.addEventListener('click', () => {
    const isCollapsed = sidebar?.classList.toggle('collapsed');
    localStorage.setItem('sidebarCollapsed', isCollapsed ? '1' : '0');
  });

  // Shortcuts panel
  document.getElementById('btn-shortcuts')?.addEventListener('click', openShortcuts);
  document.getElementById('shortcuts-close')?.addEventListener('click', closeShortcuts);
  document.getElementById('shortcuts-backdrop')?.addEventListener('click', e => {
    if (e.target === e.currentTarget) closeShortcuts();
  });

  // Avatar edit overlay → select photo
  document.getElementById('avatar-edit-overlay')?.addEventListener('click', async e => {
    e.stopPropagation();
    const base64 = await window.api.selectProfilePhoto();
    if (base64) { applyProfilePhoto(base64); showToast('Photo mise à jour ✓'); }
  });

  // Profile big photo button
  document.getElementById('pb-photo-btn')?.addEventListener('click', async e => {
    e.stopPropagation();
    const base64 = await window.api.selectProfilePhoto();
    if (base64) { applyProfilePhoto(base64); showToast('Photo mise à jour ✓'); }
  });

  initKeyboardShortcuts();
  initRecurringModal();

  // "Nouvelle tâche récurrente" button in the recurring view
  document.getElementById('btn-add-recurring-view')?.addEventListener('click', () => {
    // Re-use the same modal, resetting state
    document.getElementById('btn-add-recurring')?.click();
  });
  notifMgr.init();
  autoLaunchMgr.init();

  // Load username + photo
  const username = await window.api.getUsername();
  const usernameEl = document.getElementById('profile-username');
  if (usernameEl) usernameEl.textContent = username;
  updateAvatarInitial(username);
  initUsernameEdit();

  const photo = await window.api.getProfilePhoto();
  if (photo) applyProfilePhoto(photo);

  await refreshXpBar();
  showView('day');
  await refreshDaySummary();
  checkOverdueTasks();
}

// ── Auto-updater UI ────────────────────────────────────────────
function initUpdateManager() {
  const banner     = document.getElementById('update-banner');
  const bannerText = document.getElementById('update-banner-text');
  const bannerBtn  = document.getElementById('update-banner-btn');
  const bannerClose= document.getElementById('update-banner-close');
  const statusDesc = document.getElementById('update-status-desc');
  const checkBtn   = document.getElementById('btn-check-update');

  let updateReady = false;

  function showBanner(text, showInstall) {
    bannerText.textContent = text;
    bannerBtn.style.display = showInstall ? '' : 'none';
    banner.classList.remove('hidden');
  }

  // Listener: update available (téléchargement en cours)
  window.api.onUpdateAvailable((version) => {
    statusDesc.textContent = `Version ${version} disponible — téléchargement…`;
    showBanner(`Mise à jour ${version} disponible — téléchargement en cours…`, false);
  });

  // Listener: update downloaded (prêt à installer)
  window.api.onUpdateDownloaded((version) => {
    updateReady = true;
    statusDesc.textContent = `Version ${version} prête à installer`;
    showBanner(`Zenith ${version} prêt — redémarrez pour installer`, true);
    if (checkBtn) { checkBtn.textContent = 'Installer'; checkBtn.disabled = false; }
  });

  // Bouton dans la bannière
  bannerBtn?.addEventListener('click', () => {
    if (updateReady) window.api.installUpdate();
  });

  bannerClose?.addEventListener('click', () => {
    banner.classList.add('hidden');
  });

  // Bouton "Vérifier" dans les paramètres
  checkBtn?.addEventListener('click', async () => {
    if (updateReady) { window.api.installUpdate(); return; }
    checkBtn.disabled = true;
    checkBtn.textContent = '…';
    statusDesc.textContent = 'Vérification en cours…';
    const res = await window.api.checkForUpdates();
    if (res?.status === 'dev') {
      statusDesc.textContent = 'Mises à jour désactivées en mode dev';
      checkBtn.textContent = 'Vérifier';
      checkBtn.disabled = false;
    } else {
      // La réponse arrivera via onUpdateAvailable / onUpdateDownloaded
      setTimeout(() => {
        if (!updateReady) {
          statusDesc.textContent = 'Déjà à jour';
          checkBtn.textContent = 'Vérifier';
          checkBtn.disabled = false;
        }
      }, 8000);
    }
  });
}

document.addEventListener('DOMContentLoaded', init);
document.addEventListener('DOMContentLoaded', initUpdateManager);
