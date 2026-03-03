// ===== Week View =====

let _weekStart = null; // Date object (Monday of displayed week)

function getWeekStart(date) {
  const d   = new Date(date);
  const day = d.getDay(); // 0=Sun … 6=Sat
  const diff = day === 0 ? -6 : 1 - day; // shift to Monday
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function esc(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

async function renderWeekView() {
  if (!_weekStart) _weekStart = getWeekStart(new Date());

  // Generate recurring instances for each day of the week
  for (let i = 0; i < 7; i++) {
    const d = new Date(_weekStart);
    d.setDate(d.getDate() + i);
    await window.api.generateRecurringForDate(toISODate(d));
  }

  const startStr   = toISODate(_weekStart);
  const endDate    = new Date(_weekStart);
  endDate.setDate(endDate.getDate() + 6);

  const tasksByDate = await window.api.getTasksForWeek(startStr);

  // Update range label
  const rangeEl = document.getElementById('week-range-label');
  if (rangeEl) {
    const fmt = { day: 'numeric', month: 'long' };
    rangeEl.textContent =
      `${_weekStart.toLocaleDateString('fr-FR', fmt)} — ${endDate.toLocaleDateString('fr-FR', { ...fmt, year: 'numeric' })}`;
  }

  const grid  = document.getElementById('week-grid');
  if (!grid) return;
  grid.innerHTML = '';

  const today = toISODate(new Date());

  for (let i = 0; i < 7; i++) {
    const d       = new Date(_weekStart);
    d.setDate(d.getDate() + i);
    const dateStr = toISODate(d);
    const isToday = dateStr === today;

    const dayTasks = tasksByDate[dateStr] || [];
    const done     = dayTasks.filter(t => t.completed).length;

    const col = document.createElement('div');
    col.className = `week-col${isToday ? ' today' : ''}`;

    const dayName = d.toLocaleDateString('fr-FR', { weekday: 'short' });
    const dayNum  = d.getDate();

    // Header
    const header = document.createElement('div');
    header.className = 'week-col-header';
    header.innerHTML = `
      <span class="week-col-dayname">${dayName}</span>
      <span class="week-col-daynum${isToday ? ' today' : ''}">${dayNum}</span>
      ${dayTasks.length ? `<span class="week-col-count">${done}/${dayTasks.length}</span>` : ''}
    `;
    header.addEventListener('click', () => {
      window.state.currentDate = new Date(dateStr + 'T00:00:00');
      window.showView('day');
    });

    // Tasks container
    const tasksWrap = document.createElement('div');
    tasksWrap.className = 'week-col-tasks';

    if (dayTasks.length === 0) {
      const empty = document.createElement('div');
      empty.className   = 'week-col-empty';
      empty.textContent = '—';
      tasksWrap.appendChild(empty);
    } else {
      dayTasks.forEach(task => {
        const chip = document.createElement('div');
        chip.className        = `week-task-chip${task.completed ? ' done' : ''}`;
        chip.dataset.priority = task.priority;

        const check = document.createElement('div');
        check.className = `wtc-check${task.completed ? ' checked' : ''}`;

        const title = document.createElement('span');
        title.className   = 'wtc-title';
        title.textContent = task.title;

        chip.appendChild(check);
        chip.appendChild(title);

        if (task.due_time) {
          const timeEl       = document.createElement('span');
          timeEl.className   = 'wtc-time';
          timeEl.textContent = task.due_time.substring(0, 5);
          chip.appendChild(timeEl);
        }
        if (task.recurring_id) {
          const rec       = document.createElement('span');
          rec.className   = 'wtc-rec';
          rec.textContent = '🔄';
          chip.appendChild(rec);
        }

        // Checkbox toggle
        check.addEventListener('click', async e => {
          e.stopPropagation();
          if (!task.completed) {
            window.pushUndo?.({ type: 'complete', taskId: task.id });
            const result = await window.api.completeTask(task.id);
            if (result && window.showXpPopup) window.showXpPopup(result);
            await window.refreshXpBar?.();
          } else {
            await window.api.uncompleteTask(task.id);
            await window.refreshXpBar?.();
          }
          window.refreshDaySummary?.();
          renderWeekView();
        });

        // Click chip → go to day view
        chip.addEventListener('click', () => {
          window.state.currentDate = new Date(dateStr + 'T00:00:00');
          window.showView('day');
        });

        tasksWrap.appendChild(chip);
      });
    }

    // Add task button
    const addBtn = document.createElement('button');
    addBtn.className = 'week-col-add';
    addBtn.textContent = '+';
    addBtn.title = 'Ajouter une tâche';
    addBtn.addEventListener('click', e => {
      e.stopPropagation();
      window.state.currentDate = new Date(dateStr + 'T00:00:00');
      window.showView('day');
      const hour = new Date().getHours();
      setTimeout(() => {
        const schedGrid = document.getElementById('schedule-grid');
        const slot = schedGrid?.querySelector(`.schedule-slot[data-hour="${hour}"] .slot-content`);
        if (slot && window.openInlineForm) {
          slot.scrollIntoView({ behavior: 'smooth', block: 'center' });
          setTimeout(() => window.openInlineForm(slot, hour, dateStr), 300);
        }
      }, 150);
    });

    col.appendChild(header);
    col.appendChild(tasksWrap);
    col.appendChild(addBtn);
    grid.appendChild(col);
  }
}

window.renderWeekView = renderWeekView;

// ===== Navigation =====
function initWeekNav() {
  document.getElementById('week-prev')?.addEventListener('click', () => {
    if (!_weekStart) _weekStart = getWeekStart(new Date());
    _weekStart.setDate(_weekStart.getDate() - 7);
    renderWeekView();
  });
  document.getElementById('week-next')?.addEventListener('click', () => {
    if (!_weekStart) _weekStart = getWeekStart(new Date());
    _weekStart.setDate(_weekStart.getDate() + 7);
    renderWeekView();
  });
  document.getElementById('week-today')?.addEventListener('click', () => {
    _weekStart = getWeekStart(new Date());
    renderWeekView();
  });
}

document.addEventListener('DOMContentLoaded', initWeekNav);
