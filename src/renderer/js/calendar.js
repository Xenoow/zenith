// ===== Calendar state =====
let calYear  = new Date().getFullYear();
let calMonth = new Date().getMonth(); // 0-indexed

async function renderCalendarView() {
  const yearMonth = `${calYear}-${String(calMonth + 1).padStart(2, '0')}`;
  const summaries = await window.api.getMonthSummary(yearMonth);

  // Build a map: date → { total, done }
  const dayMap = {};
  summaries.forEach(s => { dayMap[s.due_date] = s; });

  // Label
  const label = new Date(calYear, calMonth, 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
  document.getElementById('cal-month-label').textContent = label;

  const grid = document.getElementById('calendar-grid');
  grid.innerHTML = '';

  // Day labels (Mon → Sun)
  const dayLabels = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
  dayLabels.forEach(d => {
    const el = document.createElement('div');
    el.className = 'cal-day-label';
    el.textContent = d;
    grid.appendChild(el);
  });

  const firstDay = new Date(calYear, calMonth, 1);
  // Monday = 0, adjust from JS Sunday=0
  let startOffset = (firstDay.getDay() + 6) % 7;

  const totalDays = new Date(calYear, calMonth + 1, 0).getDate();
  const today = toISODate(new Date());
  const selectedDate = toISODate(window.state.currentDate);

  // Blank cells before first day
  for (let i = 0; i < startOffset; i++) {
    const blank = document.createElement('div');
    blank.className = 'cal-day other-month';
    grid.appendChild(blank);
  }

  for (let d = 1; d <= totalDays; d++) {
    const dateStr = `${calYear}-${String(calMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const cell = document.createElement('div');
    cell.className = 'cal-day';
    if (dateStr === today) cell.classList.add('today');
    if (dateStr === selectedDate) cell.classList.add('selected');

    const info = dayMap[dateStr];
    let indicators = '';
    if (info) {
      const remaining = info.total - info.done;
      if (info.done > 0)    indicators += `<div class="cal-dot done"></div>`;
      if (remaining > 0)    indicators += `<div class="cal-dot todo"></div>`;
    }

    cell.innerHTML = `<span>${d}</span><div class="cal-indicators">${indicators}</div>`;

    cell.addEventListener('click', () => {
      window.state.currentDate = new Date(calYear, calMonth, d);
      showView('day');
    });

    grid.appendChild(cell);
  }
}

// Navigation
document.getElementById('cal-prev').addEventListener('click', () => {
  calMonth--;
  if (calMonth < 0) { calMonth = 11; calYear--; }
  renderCalendarView();
});

document.getElementById('cal-next').addEventListener('click', () => {
  calMonth++;
  if (calMonth > 11) { calMonth = 0; calYear++; }
  renderCalendarView();
});

window.renderCalendarView = renderCalendarView;
