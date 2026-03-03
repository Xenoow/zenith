// ===== Notes panel =====
// Handles the per-day notes side panel:
//   - Toggle open / close via the book icon in the day header
//   - Loads the note for the current date from the backend
//   - Auto-saves with a 500 ms debounce on every keystroke
//   - Exposes window.updateNotesDate(date) so tasks.js can
//     push the current date whenever the user navigates days

let notesCurrentDate = null;  // ISO string "YYYY-MM-DD"
let notesSaveTimer   = null;

// ── Called by tasks.js on every day navigation ──
window.updateNotesDate = function updateNotesDate(date) {
  notesCurrentDate = date;

  // Update the human-readable date label inside the panel
  const label = document.getElementById('notes-date-label');
  if (label) {
    const d = new Date(date + 'T00:00:00');
    label.textContent = d.toLocaleDateString('fr-FR', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    });
  }

  // If the panel is already open, reload the note for the new date
  const panel = document.getElementById('notes-panel');
  if (panel && panel.classList.contains('open')) {
    loadNote();
  }
};

// ── Load note from backend ──
async function loadNote() {
  if (!notesCurrentDate) return;
  const content  = await window.api.getNote(notesCurrentDate);
  const textarea = document.getElementById('notes-textarea');
  if (textarea) textarea.value = content || '';
  markSaved();
}

// ── Save note to backend ──
async function saveNote() {
  if (!notesCurrentDate) return;
  const textarea = document.getElementById('notes-textarea');
  if (!textarea) return;
  await window.api.saveNote(notesCurrentDate, textarea.value);
  markSaved();
}

// ── UI helpers ──
function markSaved() {
  const dot = document.getElementById('notes-saved-dot');
  const txt = document.getElementById('notes-status');
  if (dot) dot.classList.remove('saving');
  if (txt) txt.textContent = 'Sauvegardé';
}

function markSaving() {
  const dot = document.getElementById('notes-saved-dot');
  const txt = document.getElementById('notes-status');
  if (dot) dot.classList.add('saving');
  if (txt) txt.textContent = 'Modification…';
}

function openNotesPanel() {
  const panel  = document.getElementById('notes-panel');
  const toggle = document.getElementById('btn-notes');
  if (!panel) return;
  panel.classList.add('open');
  if (toggle) toggle.classList.add('active');
  loadNote();
}

function closeNotesPanel() {
  const panel  = document.getElementById('notes-panel');
  const toggle = document.getElementById('btn-notes');
  if (!panel) return;
  panel.classList.remove('open');
  if (toggle) toggle.classList.remove('active');
  // Flush any pending save immediately on close
  if (notesSaveTimer) {
    clearTimeout(notesSaveTimer);
    notesSaveTimer = null;
    saveNote();
  }
}

// ── Init (runs on DOMContentLoaded) ──
function initNotes() {
  const btnNotes  = document.getElementById('btn-notes');
  const btnClose  = document.getElementById('notes-close');
  const textarea  = document.getElementById('notes-textarea');

  if (btnNotes) {
    btnNotes.addEventListener('click', () => {
      const panel = document.getElementById('notes-panel');
      if (panel && panel.classList.contains('open')) {
        closeNotesPanel();
      } else {
        openNotesPanel();
      }
    });
  }

  if (btnClose) {
    btnClose.addEventListener('click', closeNotesPanel);
  }

  if (textarea) {
    textarea.addEventListener('input', () => {
      markSaving();
      clearTimeout(notesSaveTimer);
      notesSaveTimer = setTimeout(saveNote, 500);
    });
  }

  initNotesResize();
}

// ── Resize handle ──
function initNotesResize() {
  const handle  = document.getElementById('notes-resize-handle');
  const panel   = document.getElementById('notes-panel');
  const dayBody = document.getElementById('day-body');
  if (!handle || !panel || !dayBody) return;

  let startX, startWidth, _notesRaf = null;
  // Pre-read maxWidth once at drag start (dayBody width doesn't change during resize)
  let _maxWidth = 600;

  handle.addEventListener('mousedown', e => {
    if (!panel.classList.contains('open')) return;
    e.preventDefault();
    startX     = e.clientX;
    startWidth = panel.offsetWidth;
    _maxWidth  = Math.floor(dayBody.offsetWidth / 2); // read once
    panel.classList.add('resizing');
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup',   onUp);
  });

  function onMove(e) {
    if (_notesRaf) return;
    const cx = e.clientX;
    _notesRaf = requestAnimationFrame(() => {
      _notesRaf = null;
      const delta    = startX - cx;
      const newWidth = Math.min(_maxWidth, Math.max(200, startWidth + delta));
      panel.style.width = newWidth + 'px';
    });
  }

  function onUp() {
    panel.classList.remove('resizing');
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup',   onUp);
  }
}

document.addEventListener('DOMContentLoaded', initNotes);
