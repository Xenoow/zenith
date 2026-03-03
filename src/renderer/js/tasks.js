// ===== Natural language input parser =====
// Plage :  "réunion 10h a 23h"   → { time:"10:00", timeEnd:"23:00" }
// Durée :  "réunion 14h 1h30"    → { time:"14:00", timeEnd:"15:30" }
// Keyword: "appel demain 9h30"   → { time:"09:30", tomorrow:true   }
function parseNaturalInput(text) {
  let title    = text;
  let time     = null;
  let timeEnd  = null;
  let tomorrow = false;

  // 1. Plage horaire explicite : Xh[mm] (à|a|-|→|jusqu'à) Yh[mm]
  const rangeRe = /\b(\d{1,2})h(\d{2})?\s*(?:à|a|-|→|jusqu['']?à|jusqu['']?a)\s*(\d{1,2})h(\d{2})?\b/i;
  const rangeMatch = title.match(rangeRe);
  if (rangeMatch) {
    time    = `${String(rangeMatch[1]).padStart(2,'0')}:${rangeMatch[2] || '00'}`;
    timeEnd = `${String(rangeMatch[3]).padStart(2,'0')}:${rangeMatch[4] || '00'}`;
    title   = title.replace(rangeMatch[0], '').trim();
  } else {
    // 2. Heure seule : 14h30, 14h, 9h
    const timeMatch = title.match(/\b(\d{1,2})h(\d{2})?\b/i);
    if (timeMatch) {
      time  = `${String(timeMatch[1]).padStart(2,'0')}:${timeMatch[2] || '00'}`;
      title = title.replace(timeMatch[0], '').trim();

      // 3. Durée (seulement si heure trouvée) : 1h30, 1h, 30min, 45min
      const durMatch = title.match(/\b(\d+)h(\d{2})?\b/i) || title.match(/\b(\d+)\s*min\b/i);
      if (durMatch) {
        let durationMin = 0;
        if (/min/i.test(durMatch[0])) {
          durationMin = parseInt(durMatch[1], 10);
        } else {
          durationMin = parseInt(durMatch[1], 10) * 60 + (durMatch[2] ? parseInt(durMatch[2], 10) : 0);
        }
        if (durationMin > 0) {
          const [hh, mm] = time.split(':').map(Number);
          const endMin   = hh * 60 + mm + durationMin;
          timeEnd = `${String(Math.floor(endMin / 60) % 24).padStart(2,'0')}:${String(endMin % 60).padStart(2,'0')}`;
          title   = title.replace(durMatch[0], '').trim();
        }
      }
    }
  }

  // 4. Mot-clé : demain
  if (/\bdemain\b/i.test(title)) {
    tomorrow = true;
    title    = title.replace(/\bdemain\b/i, '').trim();
  }

  // Nettoyage
  title = title.replace(/\s+/g, ' ').replace(/^[\s,]+|[\s,]+$/g, '').trim();
  return { title: title || text.trim(), time, timeEnd, tomorrow };
}

// ===== Schedule hours =====
const HOURS = Array.from({ length: 24 }, (_, i) => i);

const PERIODS = [
  { hour: 0,  label: 'Nuit',        icon: '🌙' },
  { hour: 6,  label: 'Matin',       icon: '🌅' },
  { hour: 12, label: 'Après-midi',  icon: '☀️' },
  { hour: 18, label: 'Soir',        icon: '🌆' },
];

// ===== DOM-based time indicator positioning =====
function getIndicatorTop() {
  const now  = new Date();
  const grid = document.getElementById('schedule-grid');
  if (!grid) return null;
  const slot = grid.querySelector(`.schedule-slot[data-hour="${now.getHours()}"]`);
  if (!slot) return null;
  return slot.offsetTop + (now.getMinutes() / 60) * slot.offsetHeight;
}

// ===== Live clock =====
function updateLiveClock() {
  const now = new Date();
  const el  = document.getElementById('live-clock');
  if (el) el.textContent =
    `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
}

function updateTimeIndicator() {
  const bar = document.getElementById('time-indicator-bar');
  if (!bar) return;
  const top = getIndicatorTop();
  if (top !== null) bar.style.transform = `translateY(${top}px)`;
}

// Clock updates every second (HH:MM only changes each minute — guard avoids DOM writes)
let _lastClockText = '';
setInterval(() => {
  const now  = new Date();
  const text = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
  if (text !== _lastClockText) {
    _lastClockText = text;
    updateLiveClock();
    if (toISODate(window.state.currentDate) === toISODate(now)) updateTimeIndicator();
  }
}, 1000);

// ===== Helpers =====
function esc(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function getDurationLabel(start, end) {
  if (!start || !end) return '';
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  const totalMin = (eh * 60 + em) - (sh * 60 + sm);
  if (totalMin <= 0) return '';
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h > 0 ? (m > 0 ? `${h}h${m}` : `${h}h`) : `${m}min`;
}

// ===== Delete confirmation popover =====
function showDeleteConfirm(anchor, onConfirm) {
  document.querySelector('.delete-confirm-pop')?.remove();

  const pop = document.createElement('div');
  pop.className = 'delete-confirm-pop';
  pop.innerHTML = `<span>Supprimer ?</span><button class="dcp-yes">Oui</button><button class="dcp-no">Non</button>`;
  document.body.appendChild(pop);

  const rect     = anchor.getBoundingClientRect();
  pop.style.top  = `${rect.bottom + 6}px`;
  pop.style.left = `${Math.max(4, rect.left - pop.offsetWidth / 2 + rect.width / 2)}px`;

  pop.querySelector('.dcp-yes').addEventListener('click', e => {
    e.stopPropagation(); pop.remove(); onConfirm();
  });
  pop.querySelector('.dcp-no').addEventListener('click', e => {
    e.stopPropagation(); pop.remove();
  });

  setTimeout(() => {
    document.addEventListener('click', function handler() {
      pop.remove();
      document.removeEventListener('click', handler);
    });
  }, 10);
}

// ===== Sleep zone confirmation popover =====
function showSleepZoneConfirm(anchor, zoneMsg, onConfirm) {
  document.querySelector('.delete-confirm-pop')?.remove();

  const pop = document.createElement('div');
  pop.className = 'delete-confirm-pop sleep-confirm-pop';
  pop.innerHTML = `<span>${zoneMsg}</span><button class="dcp-yes">Ajouter</button><button class="dcp-no">Annuler</button>`;
  document.body.appendChild(pop);

  const rect     = anchor.getBoundingClientRect();
  pop.style.top  = `${rect.bottom + 6}px`;
  pop.style.left = `${Math.max(4, rect.left - pop.offsetWidth / 2 + rect.width / 2)}px`;

  pop.querySelector('.dcp-yes').addEventListener('click', e => {
    e.stopPropagation(); pop.remove(); onConfirm();
  });
  pop.querySelector('.dcp-no').addEventListener('click', e => {
    e.stopPropagation(); pop.remove();
  });

  setTimeout(() => {
    document.addEventListener('click', function handler() {
      pop.remove();
      document.removeEventListener('click', handler);
    });
  }, 10);
}

// Shared drag state (module-level so dragstart on pills can write, dragover on grid can read)
let _sharedSlotCache = null;

// ===== Day View =====
async function renderDayView() {
  const date  = toISODate(window.state.currentDate);
  // Generate recurring instances for this day before fetching
  await window.api.generateRecurringForDate(date);
  const [tasks, sleep] = await Promise.all([
    window.api.getTasksByDate(date),
    window.api.getSleepSchedule(),
  ]);

  document.getElementById('day-title').textContent    = formatDayTitle(window.state.currentDate);
  document.getElementById('day-subtitle').textContent = window.state.currentDate.toLocaleDateString('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });

  const total = tasks.length;
  const done  = tasks.filter(t => t.completed).length;
  const pct   = total > 0 ? Math.round((done / total) * 100) : 0;
  document.getElementById('day-prog-bar').style.transform = `scaleX(${pct / 100})`;
  document.getElementById('day-prog-label').textContent = `${done} / ${total}`;

  if (typeof window.updateNotesDate === 'function') window.updateNotesDate(date);

  const withTime    = tasks.filter(t => t.due_time);
  const withoutTime = tasks.filter(t => !t.due_time);

  const alldayWrap = document.getElementById('schedule-allday');
  const alldayList = document.getElementById('allday-tasks');
  if (withoutTime.length > 0) {
    alldayWrap.style.display = 'block';
    alldayList.innerHTML = '';
    withoutTime.forEach(t => alldayList.appendChild(createTaskPill(t)));
  } else {
    alldayWrap.style.display = 'none';
  }

  const byHour = {};
  withTime.forEach(t => {
    const h = parseInt(t.due_time.split(':')[0], 10);
    if (!byHour[h]) byHour[h] = [];
    byHour[h].push(t);
  });

  const grid        = document.getElementById('schedule-grid');
  grid.innerHTML    = '';
  const now         = new Date();
  const isToday     = toISODate(window.state.currentDate) === toISODate(now);
  const currentHour = now.getHours();

  // Pre-compute sleep zone config
  const sleepConfig = (() => {
    if (!sleep?.wakeTime || !sleep?.bedTime) return null;
    const wakeH = parseInt(sleep.wakeTime.split(':')[0], 10);
    const bedH  = parseInt(sleep.bedTime.split(':')[0],  10);
    if (wakeH === bedH) return null;
    const screenH = sleep.screenDisconnect ? ((bedH - 1 + 24) % 24) : -1;
    return { wakeH, bedH, screenH, crossesMidnight: bedH > wakeH, bedTime: sleep.bedTime };
  })();

  // Build all slots in a DocumentFragment → single DOM write
  const gridFrag = document.createDocumentFragment();
  HOURS.forEach(hour => {
    const period = PERIODS.find(p => p.hour === hour);
    if (period) {
      const sep = document.createElement('div');
      sep.className = 'period-sep';
      sep.innerHTML = `<span>${period.icon} ${period.label}</span><div class="period-sep-line"></div>`;
      gridFrag.appendChild(sep);
    }

    const hourTasks = byHour[hour] || [];
    const slot = document.createElement('div');
    slot.className    = 'schedule-slot';
    slot.dataset.hour = hour;
    if (isToday && hour === currentHour) slot.classList.add('current-hour');
    if (hourTasks.length > 0)            slot.classList.add('has-tasks');

    const label = document.createElement('div');
    label.className   = 'slot-label';
    label.textContent = `${String(hour).padStart(2, '0')}:00`;

    const content = document.createElement('div');
    content.className = 'slot-content';

    const addIcon = document.createElement('div');
    addIcon.className   = 'slot-add-icon';
    addIcon.textContent = '+';
    content.appendChild(addIcon);

    // Pre-compute zone info for this hour (reused by click handlers AND CSS class below)
    const zoneInfo = (() => {
      if (!sleepConfig) return null;
      const { wakeH, bedH, screenH, crossesMidnight } = sleepConfig;
      const isSleep  = crossesMidnight
        ? (hour >= bedH || hour < wakeH)
        : (hour >= bedH && hour < wakeH);
      const isScreen = screenH >= 0 && hour === screenH && !isSleep;
      if (!isSleep && !isScreen) return null;
      return {
        isSleep, isScreen,
        msg: isScreen ? '📵 Zone déconnexion — ajouter quand même ?' : '🌙 Zone sommeil — ajouter quand même ?',
      };
    })();

    const addBtn = document.createElement('button');
    addBtn.className   = 'slot-add-btn';
    addBtn.textContent = '+ Ajouter';
    addBtn.addEventListener('click', e => {
      e.stopPropagation();
      if (zoneInfo) showSleepZoneConfirm(addBtn, zoneInfo.msg, () => openInlineForm(content, hour, date));
      else          openInlineForm(content, hour, date);
    });
    content.appendChild(addBtn);

    content.addEventListener('click', e => {
      if (e.target !== content) return;
      if (content.querySelector('.inline-form')) return;
      if (zoneInfo) showSleepZoneConfirm(content, zoneInfo.msg, () => openInlineForm(content, hour, date));
      else          openInlineForm(content, hour, date);
    });

    const halfLine = document.createElement('div');
    halfLine.className = 'slot-half-line';

    slot.appendChild(label);
    slot.appendChild(content);
    slot.appendChild(halfLine);

    // ── Sleep / screen zone (uses zoneInfo pre-computed above) ──
    if (zoneInfo) {
      if (zoneInfo.isScreen) {
        slot.classList.add('screen-hour');
        const badge = document.createElement('div');
        badge.className = 'screen-zone-badge';
        badge.textContent = '📵 Fin des écrans';
        slot.appendChild(badge);
      } else {
        slot.classList.add('sleep-hour');
        // Label only on the first slot of the night-sleep period
        if (sleepConfig && hour === sleepConfig.bedH) {
          const badge = document.createElement('div');
          badge.className = 'sleep-zone-badge';
          badge.textContent = `🌙 Coucher — ${sleepConfig.bedTime}`;
          slot.appendChild(badge);
        }
      }
    }

    gridFrag.appendChild(slot);
  });
  grid.appendChild(gridFrag); // single DOM write for all 24h slots

  // ── Place task pills absolutely on the grid (column layout for overlapping tasks) ──
  if (withTime.length > 0) {
    requestAnimationFrame(() => {
      const LABEL_W = 78;
      const EDGE_R  = 6;
      const GAP     = 2;

      const colItems = computeTaskColumns(withTime);

      // BATCH READ — read all slot offsets in one pass to avoid layout thrashing
      const slotMeasurements = {};
      for (const s of grid.querySelectorAll('.schedule-slot')) {
        slotMeasurements[s.dataset.hour] = { top: s.offsetTop, h: s.offsetHeight };
      }

      // BUILD in a fragment — zero DOM reads inside loop
      const pillFrag = document.createDocumentFragment();
      colItems.forEach(({ task: t, col, totalCols }) => {
        const h  = parseInt(t.due_time.split(':')[0], 10);
        const m  = parseInt(t.due_time.split(':')[1], 10);
        const sm = slotMeasurements[h];
        if (!sm) return;

        const top  = sm.top + (m / 60) * sm.h;
        const pill = createTaskPill(t);
        pill.classList.add('on-grid');
        pill.style.top = `${top}px`;

        const usable = `(100% - ${LABEL_W + EDGE_R}px)`;
        pill.style.left  = `calc(${LABEL_W}px + ${col} * ${usable} / ${totalCols} + ${GAP}px)`;
        pill.style.width = `calc(${usable} / ${totalCols} - ${GAP * 2}px)`;
        pill.style.right = 'auto';

        if (t.due_time_end) {
          const endH = parseInt(t.due_time_end.split(':')[0], 10);
          const endM = parseInt(t.due_time_end.split(':')[1], 10);
          const esm  = slotMeasurements[endH];
          if (esm && (endH > h || (endH === h && endM > m))) {
            const endTop = esm.top + (endM / 60) * esm.h;
            pill.style.height = `${Math.max(44, endTop - top - 4)}px`;
          } else {
            pill.style.height = `${sm.h - 8}px`;
          }
        } else {
          pill.style.height = `${sm.h - 8}px`;
        }

        pillFrag.appendChild(pill);
      });

      grid.appendChild(pillFrag); // single DOM write for all pills
    });
  }

  // ── Drag & drop ──
  let _dragRaf = null;

  grid.addEventListener('dragover', e => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (_dragRaf) return; // throttle to one update per frame
    const clientY = e.clientY;
    _dragRaf = requestAnimationFrame(() => {
      _dragRaf = null;
      // WRITE: clear previous indicators
      document.querySelector('.drop-indicator')?.remove();
      document.querySelectorAll('.schedule-slot.drag-over').forEach(s => s.classList.remove('drag-over'));
      // READ: grid position (unavoidable) + use cached slot data
      if (!_sharedSlotCache) return;
      const gridRect = grid.getBoundingClientRect();
      const relY     = clientY - gridRect.top;
      let target = null;
      for (const s of _sharedSlotCache) {
        if (relY >= s.top && relY < s.top + s.h) { target = s; break; }
      }
      if (target) {
        target.el.classList.add('drag-over');
        const frac    = (relY - target.top) / target.h;
        const snapped = Math.min(Math.round(frac * 60 / 15) * 15, 45);
        const ind     = document.createElement('div');
        ind.className       = 'drop-indicator';
        ind.dataset.hour    = target.el.dataset.hour;
        ind.dataset.minutes = snapped;
        ind.style.top       = (target.top + (snapped / 60) * target.h) + 'px';
        grid.appendChild(ind);
      }
    });
  });

  grid.addEventListener('dragleave', e => {
    if (!grid.contains(e.relatedTarget)) {
      document.querySelector('.drop-indicator')?.remove();
      document.querySelectorAll('.schedule-slot.drag-over').forEach(s => s.classList.remove('drag-over'));
    }
  });

  grid.addEventListener('drop', async e => {
    e.preventDefault();
    const taskId = parseInt(e.dataTransfer.getData('text/plain'), 10);
    const ind    = document.querySelector('.drop-indicator');
    if (!ind || !taskId) { document.querySelector('.drop-indicator')?.remove(); return; }

    const hour    = parseInt(ind.dataset.hour, 10);
    const minutes = parseInt(ind.dataset.minutes, 10);
    const newTime = `${String(hour).padStart(2,'0')}:${String(minutes).padStart(2,'0')}`;

    document.querySelector('.drop-indicator')?.remove();
    document.querySelectorAll('.schedule-slot.drag-over').forEach(s => s.classList.remove('drag-over'));

    const dayTasks = await window.api.getTasksByDate(toISODate(window.state.currentDate));
    const task     = dayTasks.find(t => t.id === taskId);
    if (task) {
      await window.api.updateTask({ ...task, due_time: newTime, due_time_end: task.due_time_end });
      renderDayView();
    }
  });

  // ── Time indicator bar ──
  const existingBar = document.getElementById('time-indicator-bar');
  if (existingBar) existingBar.remove();
  if (isToday) {
    const bar = document.createElement('div');
    bar.className = 'time-indicator';
    bar.id        = 'time-indicator-bar';
    grid.appendChild(bar);
    requestAnimationFrame(() => {
      const top = getIndicatorTop();
      if (top !== null) bar.style.transform = `translateY(${top}px)`;
    });
  }

  updateLiveClock();

  if (isToday) {
    const targetHour = Math.max(0, currentHour - 1);
    setTimeout(() => {
      const s = grid.querySelector(`.schedule-slot[data-hour="${targetHour}"]`);
      if (s) s.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  } else {
    setTimeout(() => {
      const s = grid.querySelector('.schedule-slot[data-hour="8"]');
      if (s) s.scrollIntoView({ behavior: 'instant', block: 'start' });
    }, 50);
  }
}

window.renderDayView = renderDayView;

// ===== Inline task creation form =====
let activeInlineForm = null;

function openInlineForm(slotContent, hour, date) {
  if (activeInlineForm) activeInlineForm.remove();

  const form = document.createElement('div');
  form.className   = 'inline-form';
  activeInlineForm = form;

  let inlinePriority = 'medium';

  form.innerHTML = `
    <input class="itf-title" type="text" placeholder="Ex: réunion 14h 1h30 …" autocomplete="off" />
    <div class="itf-parsed-hint" id="itf-hint" style="display:none"></div>
    <textarea class="itf-desc" placeholder="Description (optionnel)..." rows="2"></textarea>
    <div class="itf-times">
      <span class="itf-time-start">${String(hour).padStart(2, '0')}:00</span>
      <span class="itf-time-arrow">→</span>
      <input class="itf-end-time" type="time" title="Heure de fin (optionnel)" />
    </div>
    <div class="itf-rec-row">
      <button class="itf-rec-toggle" type="button">🔄 Tâche Récurrente</button>
      <div class="itf-rec-panel hidden">
        <div class="itf-rec-modes">
          <button class="itf-rec-mode active" data-mode="weekdays">Lun → Ven</button>
          <button class="itf-rec-mode" data-mode="allweek">Toute la semaine</button>
          <button class="itf-rec-mode" data-mode="custom">Personnalisé</button>
        </div>
        <div class="itf-rec-days hidden">
          <button class="itf-day active" data-day="1">L</button>
          <button class="itf-day active" data-day="2">M</button>
          <button class="itf-day active" data-day="3">M</button>
          <button class="itf-day active" data-day="4">J</button>
          <button class="itf-day active" data-day="5">V</button>
          <button class="itf-day" data-day="6">S</button>
          <button class="itf-day" data-day="0">D</button>
        </div>
      </div>
    </div>
    <div class="itf-color-row">
      <button class="itf-color-swatch sel" data-color="" style="background:var(--bg3);border:2px solid var(--border)" title="Aucune couleur"></button>
      <button class="itf-color-swatch" data-color="c1" title="Rouge"></button>
      <button class="itf-color-swatch" data-color="c2" title="Vert"></button>
      <button class="itf-color-swatch" data-color="c3" title="Bleu"></button>
      <button class="itf-color-swatch" data-color="c4" title="Violet"></button>
      <button class="itf-color-swatch" data-color="c5" title="Orange"></button>
    </div>
    <div class="itf-sep"></div>
    <div class="itf-bottom">
      <div class="itf-priority">
        <button class="itf-prio-btn" data-p="high">Haute</button>
        <button class="itf-prio-btn active" data-p="medium">Moyenne</button>
        <button class="itf-prio-btn" data-p="low">Basse</button>
      </div>
      <div class="itf-actions">
        <button class="btn-secondary itf-cancel" style="padding:4px 10px;font-size:11px">Annuler</button>
        <button class="btn-primary itf-save" style="padding:4px 10px;font-size:11px">Ajouter</button>
      </div>
    </div>
  `;

  form.querySelectorAll('.itf-prio-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      inlinePriority = btn.dataset.p;
      form.querySelectorAll('.itf-prio-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  // ── Recurring toggle ──
  let recurringEnabled = false;
  let recurringMode    = 'weekdays'; // 'weekdays' | 'allweek' | 'custom'

  const recToggle = form.querySelector('.itf-rec-toggle');
  const recPanel  = form.querySelector('.itf-rec-panel');
  const recDays   = form.querySelector('.itf-rec-days');

  recToggle.addEventListener('click', () => {
    recurringEnabled = !recurringEnabled;
    recToggle.classList.toggle('active', recurringEnabled);
    recPanel.classList.toggle('hidden', !recurringEnabled);
  });

  form.querySelectorAll('.itf-rec-mode').forEach(btn => {
    btn.addEventListener('click', () => {
      recurringMode = btn.dataset.mode;
      form.querySelectorAll('.itf-rec-mode').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      // Affiche les cases jours seulement en mode custom
      recDays.classList.toggle('hidden', recurringMode !== 'custom');
      // Pré-sélection automatique selon le mode
      if (recurringMode === 'weekdays') {
        form.querySelectorAll('.itf-day').forEach(d => {
          const day = parseInt(d.dataset.day);
          d.classList.toggle('active', day >= 1 && day <= 5);
        });
      } else if (recurringMode === 'allweek') {
        form.querySelectorAll('.itf-day').forEach(d => d.classList.add('active'));
      }
    });
  });

  form.querySelectorAll('.itf-day').forEach(btn => {
    btn.addEventListener('click', () => btn.classList.toggle('active'));
  });

  function getSelectedDays() {
    if (recurringMode === 'weekdays') return [1, 2, 3, 4, 5];
    if (recurringMode === 'allweek')  return [0, 1, 2, 3, 4, 5, 6];
    return [...form.querySelectorAll('.itf-day.active')].map(b => parseInt(b.dataset.day));
  }

  // ── Color swatches ──
  let inlineColor = '';
  form.querySelectorAll('.itf-color-swatch').forEach(btn => {
    btn.addEventListener('click', () => {
      inlineColor = btn.dataset.color;
      form.querySelectorAll('.itf-color-swatch').forEach(b => b.classList.remove('sel'));
      btn.classList.add('sel');
    });
  });

  // ── Live parsing hint ──
  const titleInput = form.querySelector('.itf-title');
  const hintEl     = form.querySelector('#itf-hint');
  titleInput.addEventListener('input', () => {
    const p = parseNaturalInput(titleInput.value);
    const hints = [];
    if (p.time) hints.push(`⏰ ${p.time}${p.timeEnd ? ' → ' + p.timeEnd : ''}`);
    if (p.tomorrow) hints.push('📅 Demain');
    if (hints.length) {
      hintEl.textContent  = hints.join('  ');
      hintEl.style.display = 'block';
    } else {
      hintEl.style.display = 'none';
    }
  });

  form.querySelector('.itf-cancel').addEventListener('click', () => {
    form.remove(); activeInlineForm = null;
  });

  async function save() {
    const rawTitle = form.querySelector('.itf-title').value.trim();
    if (!rawTitle) { form.querySelector('.itf-title').focus(); return; }

    const parsed       = parseNaturalInput(rawTitle);
    const finalTitle   = parsed.title || rawTitle;

    let finalDate = date;
    if (parsed.tomorrow) {
      const d = new Date(date); d.setDate(d.getDate() + 1);
      finalDate = toISODate(d);
    }

    const finalTime    = parsed.time    || `${String(hour).padStart(2, '0')}:00`;
    const finalTimeEnd = parsed.timeEnd || form.querySelector('.itf-end-time').value || null;

    if (recurringEnabled) {
      const days = getSelectedDays();
      if (!days.length) { recToggle.style.outline = '1px solid red'; return; }
      await window.api.createRecurring({
        title:        finalTitle,
        description:  form.querySelector('.itf-desc').value.trim(),
        priority:     inlinePriority,
        due_time:     finalTime,
        due_time_end: finalTimeEnd,
        recurrence:   'weekly_custom',
        days_of_week: days,
        color:        inlineColor || null,
      });
      await window.api.generateRecurringForDate(finalDate);
    } else {
      const result = await window.api.createTask({
        title:        finalTitle,
        description:  form.querySelector('.itf-desc').value.trim(),
        priority:     inlinePriority,
        due_date:     finalDate,
        due_time:     finalTime,
        due_time_end: finalTimeEnd,
        color:        inlineColor || null,
      });
      if (result?.id) window.pushUndo({ type: 'create', taskId: result.id });
    }
    activeInlineForm = null;
    window.refreshDaySummary?.();
    renderDayView();
  }

  form.querySelector('.itf-save').addEventListener('click', save);
  form.querySelector('.itf-title').addEventListener('keydown', e => {
    if (e.key === 'Enter')  save();
    if (e.key === 'Escape') { form.remove(); activeInlineForm = null; }
  });

  const addBtn = slotContent.querySelector('.slot-add-btn');
  slotContent.insertBefore(form, addBtn);
  form.querySelector('.itf-title').focus();
}

window.openInlineForm = openInlineForm;

// ===== Overlap column layout =====
// Returns array of { task, col, totalCols } — sorted by startMin
function computeTaskColumns(tasks) {
  if (!tasks.length) return [];

  // 1. Convert tasks to time intervals (minutes from midnight)
  const items = tasks.map(t => {
    const [sh, sm] = t.due_time.split(':').map(Number);
    const startMin = sh * 60 + sm;
    let endMin = startMin + 60; // default 1 h if no end time
    if (t.due_time_end) {
      const [eh, em] = t.due_time_end.split(':').map(Number);
      const e = eh * 60 + em;
      if (e > startMin) endMin = e;
    }
    return { task: t, startMin, endMin, col: 0, totalCols: 1, group: -1 };
  }).sort((a, b) => a.startMin - b.startMin);

  // 2. Group connected overlapping tasks (transitive closure)
  let nextGroup = 0;
  for (let i = 0; i < items.length; i++) {
    if (items[i].group === -1) items[i].group = nextGroup++;
    for (let j = i + 1; j < items.length; j++) {
      if (items[j].startMin >= items[i].endMin) break; // array sorted → no more overlap with i
      if (items[j].group === -1) items[j].group = items[i].group;
    }
  }

  // 3. Assign columns within each group (greedy sweep)
  const groups = {};
  for (const item of items) {
    if (!groups[item.group]) groups[item.group] = [];
    groups[item.group].push(item);
  }
  for (const g of Object.values(groups)) {
    const colEnds = [];
    for (const item of g) {
      let placed = false;
      for (let c = 0; c < colEnds.length; c++) {
        if (colEnds[c] <= item.startMin) {
          item.col = c; colEnds[c] = item.endMin; placed = true; break;
        }
      }
      if (!placed) { item.col = colEnds.length; colEnds.push(item.endMin); }
    }
    const total = colEnds.length;
    for (const item of g) item.totalCols = total;
  }

  return items;
}

// ===== Task pill resize =====
function addResizeHandles(pill) {
  const topHandle = document.createElement('div');
  topHandle.className = 'task-pill-resize-top';
  const botHandle = document.createElement('div');
  botHandle.className = 'task-pill-resize-bottom';
  pill.appendChild(topHandle);
  pill.appendChild(botHandle);

  botHandle.addEventListener('mousedown', e => {
    e.preventDefault(); e.stopPropagation();
    const startY = e.clientY;
    const startH = pill.offsetHeight;
    let _rf = null;
    function onMove(e) {
      if (_rf) return;
      const cy = e.clientY;
      _rf = requestAnimationFrame(() => {
        _rf = null;
        pill.style.height = Math.max(44, startH + (cy - startY)) + 'px';
      });
    }
    function onUp() { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup',   onUp);
  });

  topHandle.addEventListener('mousedown', e => {
    e.preventDefault(); e.stopPropagation();
    const startY = e.clientY;
    const startH = pill.offsetHeight;
    let _rf = null;
    function onMove(e) {
      if (_rf) return;
      const cy = e.clientY;
      _rf = requestAnimationFrame(() => {
        _rf = null;
        pill.style.height = Math.max(44, startH + (startY - cy)) + 'px';
      });
    }
    function onUp() { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup',   onUp);
  });
}

// ===== Task pill =====
function createTaskPill(task) {
  const pill = document.createElement('div');
  pill.className        = `task-pill${task.completed ? ' completed' : ''}`;
  pill.dataset.priority = task.priority;
  if (task.color) pill.dataset.color = task.color;

  const timeStr     = task.due_time || '';
  const durationStr = getDurationLabel(task.due_time, task.due_time_end);

  pill.innerHTML = `
    <div class="task-pill-check${task.completed ? ' checked' : ''}"></div>
    <div class="task-pill-body">
      <span class="task-pill-title" title="Cliquer pour compléter">${esc(task.title)}</span>
      ${durationStr ? `<span class="task-pill-duration">${durationStr}</span>` : ''}
      ${task.recurring_id ? `<span class="task-pill-rec" title="Tâche récurrente">🔄</span>` : ''}
    </div>
    ${timeStr ? `<span class="task-pill-time">${timeStr}</span>` : ''}
    <span class="task-pill-xp">+${task.xp_reward} XP</span>
    <div class="task-pill-actions">
      <button class="ta-postpone" title="Reporter au lendemain">→</button>
      <button class="ta-edit" title="Modifier">✏️</button>
      <button class="ta-del"  title="Supprimer">🗑️</button>
    </div>
  `;

  // Drag & drop
  if (task.due_time) {
    pill.draggable = true;
    pill.addEventListener('dragstart', e => {
      e.dataTransfer.setData('text/plain', String(task.id));
      e.dataTransfer.effectAllowed = 'move';
      // Pre-cache slot positions so dragover reads zero offsetTop during drag
      const g = document.getElementById('schedule-grid');
      if (g) {
        _sharedSlotCache = [...g.querySelectorAll('.schedule-slot')].map(s => ({
          el: s, top: s.offsetTop, h: s.offsetHeight,
        }));
      }
      setTimeout(() => pill.classList.add('dragging'), 0);
    });
    pill.addEventListener('dragend', () => {
      pill.classList.remove('dragging');
      _sharedSlotCache = null; // clear cache
      document.querySelector('.drop-indicator')?.remove();
      document.querySelectorAll('.schedule-slot.drag-over').forEach(s => s.classList.remove('drag-over'));
    });
  }

  // Complete / uncomplete via checkbox
  pill.querySelector('.task-pill-check').addEventListener('click', async e => {
    e.stopPropagation();
    let result;
    if (!task.completed) {
      window.pushUndo?.({ type: 'complete', taskId: task.id });
      result = await window.api.completeTask(task.id);
    } else {
      await window.api.uncompleteTask(task.id);
    }
    if (result) showXpPopup(result);
    await refreshXpBar();
    window.refreshDaySummary?.();
    renderDayView();
  });

  // Complete / uncomplete via title click
  pill.querySelector('.task-pill-title').addEventListener('click', async e => {
    e.stopPropagation();
    let result;
    if (!task.completed) {
      window.pushUndo?.({ type: 'complete', taskId: task.id });
      result = await window.api.completeTask(task.id);
    } else {
      await window.api.uncompleteTask(task.id);
    }
    if (result) showXpPopup(result);
    await refreshXpBar();
    window.refreshDaySummary?.();
    renderDayView();
  });

  // Postpone to tomorrow
  pill.querySelector('.ta-postpone').addEventListener('click', async e => {
    e.stopPropagation();
    const tomorrow = new Date(task.due_date);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = toISODate(tomorrow);
    window.pushUndo?.({ type: 'reschedule', taskId: task.id, prevDate: task.due_date });
    await window.api.rescheduleTask(task.id, tomorrowStr);
    window.refreshDaySummary?.();
    window.showToast?.(`"${task.title}" → ${tomorrowStr} ✓`);
    renderDayView();
  });

  // Edit
  pill.querySelector('.ta-edit').addEventListener('click', e => {
    e.stopPropagation();
    openEditModal(task);
  });

  pill.addEventListener('dblclick', e => {
    e.stopPropagation();
    openEditModal(task);
  });

  // Delete with confirmation
  pill.querySelector('.ta-del').addEventListener('click', e => {
    e.stopPropagation();
    showDeleteConfirm(e.currentTarget, async () => {
      window.pushUndo?.({ type: 'delete', task: { ...task } });
      await window.api.deleteTask(task.id);
      window.refreshDaySummary?.();
      renderDayView();
    });
  });

  addResizeHandles(pill);
  return pill;
}

// ===== All tasks view =====
async function renderAllTasks() {
  const tasks    = await window.api.getAllTasks();

  // Deduplicate recurring tasks: keep only the best representative per recurring_id
  // (next upcoming incomplete occurrence, or most recent past one)
  const today = new Date().toISOString().slice(0, 10);
  const recMap = new Map(); // recurring_id -> chosen task
  const deduped = [];
  for (const task of tasks) {
    if (!task.recurring_id) { deduped.push(task); continue; }
    const cur = recMap.get(task.recurring_id);
    if (!cur) { recMap.set(task.recurring_id, task); deduped.push(task); continue; }
    const curFuture = !cur.completed  && cur.due_date  >= today;
    const newFuture = !task.completed && task.due_date >= today;
    let replace = false;
    if      (newFuture && !curFuture)                                        replace = true;
    else if (newFuture &&  curFuture && task.due_date < cur.due_date)        replace = true;
    else if (!newFuture && !curFuture && task.due_date > cur.due_date)       replace = true;
    if (replace) { deduped[deduped.indexOf(cur)] = task; recMap.set(task.recurring_id, task); }
  }

  const priority = document.getElementById('filter-priority').value;
  const status   = document.getElementById('filter-status').value;

  let filtered = deduped;
  if (priority)      filtered = filtered.filter(t => t.priority === priority);
  if (status !== '') filtered = filtered.filter(t => String(t.completed ? 1 : 0) === status);

  const container = document.getElementById('task-list-all');
  container.innerHTML = '';

  if (!filtered.length) {
    container.innerHTML = `<div class="empty-state"><span class="es-icon">🔍</span><p>Aucune tâche trouvée.</p></div>`;
    return;
  }

  filtered.forEach(task => {
    const card = document.createElement('div');
    card.className        = `task-card-full${task.completed ? ' completed' : ''}`;
    card.dataset.priority = task.priority;
    const durationStr = getDurationLabel(task.due_time, task.due_time_end);

    card.innerHTML = `
      <div class="tf-check${task.completed ? ' checked' : ''}"></div>
      <div class="tf-body">
        <div class="tf-title" title="Cliquer pour compléter">${esc(task.title)}</div>
        ${task.description ? `<div class="tf-desc">${esc(task.description)}</div>` : ''}
        <div class="tf-meta">
          <span>${task.due_date}${task.due_time ? ' · ' + task.due_time : ''}${durationStr ? ' · ' + durationStr : ''}</span>
          <span>+${task.xp_reward} XP</span>
        </div>
      </div>
      <div class="tf-actions">
        <button class="tf-postpone" title="Reporter au lendemain">→</button>
        <button class="tf-edit">✏️</button>
        <button class="tf-del">🗑️</button>
      </div>
    `;

    // Complete / uncomplete via checkbox
    card.querySelector('.tf-check').addEventListener('click', async () => {
      let result;
      if (!task.completed) {
        window.pushUndo?.({ type: 'complete', taskId: task.id });
        result = await window.api.completeTask(task.id);
      } else {
        await window.api.uncompleteTask(task.id);
      }
      if (result) showXpPopup(result);
      await refreshXpBar();
      renderAllTasks();
    });

    // Complete / uncomplete via title click
    card.querySelector('.tf-title').addEventListener('click', async () => {
      let result;
      if (!task.completed) {
        window.pushUndo?.({ type: 'complete', taskId: task.id });
        result = await window.api.completeTask(task.id);
      } else {
        await window.api.uncompleteTask(task.id);
      }
      if (result) showXpPopup(result);
      await refreshXpBar();
      renderAllTasks();
    });

    // Postpone to tomorrow
    card.querySelector('.tf-postpone').addEventListener('click', async () => {
      const tomorrow = new Date(task.due_date);
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowStr = toISODate(tomorrow);
      window.pushUndo?.({ type: 'reschedule', taskId: task.id, prevDate: task.due_date });
      await window.api.rescheduleTask(task.id, tomorrowStr);
      window.showToast?.(`"${task.title}" → ${tomorrowStr} ✓`);
      renderAllTasks();
    });

    card.querySelector('.tf-edit').addEventListener('click', () => openEditModal(task));
    card.querySelector('.tf-del').addEventListener('click', e => {
      showDeleteConfirm(e.currentTarget, async () => {
        window.pushUndo?.({ type: 'delete', task: { ...task } });
        await window.api.deleteTask(task.id);
        renderAllTasks();
      });
    });

    container.appendChild(card);
  });
}

window.renderAllTasks = renderAllTasks;

window.showDeleteConfirm = showDeleteConfirm;

// Close inline form on Escape
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && activeInlineForm) {
    activeInlineForm.remove();
    activeInlineForm = null;
  }
});
