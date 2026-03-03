// ===== Timer modes config =====
const MODES = {
  pomodoro:  { work: 25 * 60, break: 5 * 60, label: 'Pomodoro',     sessions: 4 },
  custom:    { work: 25 * 60, break: 5 * 60, label: 'Personnalisé',  sessions: 4 },
  stopwatch: { work: null,    break: null,    label: 'Chrono',        sessions: null },
};

// ===== State =====
let timerMode      = 'pomodoro';
let timerRunning   = false;
let timerInterval  = null;
let isBreak        = false;
let sessionCount   = 1;
let timeLeft       = MODES.pomodoro.work;
let stopwatchSecs  = 0;

// SVG circle setup
const RADIUS = 68;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

const ring           = document.getElementById('timer-ring');
const displayEl      = document.getElementById('timer-display');
const phaseEl        = document.getElementById('timer-phase');
const sessionsEl     = document.getElementById('timer-sessions');
const playBtn        = document.getElementById('timer-play');
const titlebarTimer  = document.getElementById('titlebar-timer');
const titlebarTimerDisplay = document.getElementById('titlebar-timer-display');

function updateTitlebarTimer() {
  if (!titlebarTimer || !titlebarTimerDisplay) return;
  if (timerRunning) {
    titlebarTimer.classList.remove('hidden');
    titlebarTimerDisplay.textContent =
      timerMode === 'stopwatch' ? fmtTime(stopwatchSecs) : fmtTime(timeLeft);
  } else {
    titlebarTimer.classList.add('hidden');
  }
}

ring.style.strokeDasharray  = CIRCUMFERENCE;
ring.style.strokeDashoffset = 0;

// ===== Helpers =====
function fmtTime(secs) {
  const m = Math.floor(Math.abs(secs) / 60);
  const s = Math.abs(secs) % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function setProgress(ratio) {
  // ratio 0 = full, 1 = empty
  ring.style.strokeDashoffset = CIRCUMFERENCE * ratio;
}

function updateDisplay() {
  const mode = MODES[timerMode];

  if (timerMode === 'stopwatch') {
    displayEl.textContent = fmtTime(stopwatchSecs);
    phaseEl.textContent   = 'En cours';
    setProgress(0);
    sessionsEl.textContent = '';
    updateTitlebarTimer();
    return;
  }

  displayEl.textContent = fmtTime(timeLeft);
  phaseEl.textContent   = isBreak ? 'Pause' : 'Travail';

  const total = isBreak ? mode.break : mode.work;
  const ratio = total > 0 ? 1 - timeLeft / total : 0;
  setProgress(ratio);

  sessionsEl.textContent = `Session ${sessionCount} sur ${mode.sessions}`;
  updateTitlebarTimer();
}

function setPlayIcon(running) {
  playBtn.innerHTML = running ? '&#9646;&#9646;' : '&#9654;';
}

// ===== Controls =====
function startTimer() {
  timerRunning = true;
  setPlayIcon(true);

  timerInterval = setInterval(() => {
    if (timerMode === 'stopwatch') {
      stopwatchSecs++;
      updateDisplay();
      return;
    }

    timeLeft--;
    updateDisplay();

    if (timeLeft <= 0) {
      clearInterval(timerInterval);
      timerRunning = false;
      setPlayIcon(false);

      const mode = MODES[timerMode];
      if (!isBreak) {
        // Work session done → notify + go to break
        window.notifMgr?.send(
          '🍅 Session de travail terminée !',
          `Session ${sessionCount} accomplie. Pause bien méritée !`
        );
        isBreak  = true;
        timeLeft = mode.break;
        // Auto-start break
        startTimer();
      } else {
        // Break done → notify + next work session
        window.notifMgr?.send(
          '⚡ Pause terminée !',
          "C'est reparti ! Lance une nouvelle session de travail."
        );
        isBreak = false;
        sessionCount = Math.min(sessionCount + 1, mode.sessions);
        timeLeft = mode.work;
        updateDisplay();
        // Don't auto-start, let user click
      }
    }
  }, 1000);
}

function pauseTimer() {
  timerRunning = false;
  clearInterval(timerInterval);
  setPlayIcon(false);
  updateTitlebarTimer();
}

function resetTimer() {
  clearInterval(timerInterval);
  timerRunning   = false;
  isBreak        = false;
  sessionCount   = 1;
  stopwatchSecs  = 0;
  const mode     = MODES[timerMode];
  timeLeft       = mode.work ?? 0;
  setPlayIcon(false);
  setProgress(0);
  updateDisplay();
  updateTitlebarTimer();
}

function skipSession() {
  if (timerMode === 'stopwatch') return;
  clearInterval(timerInterval);
  timerRunning = false;

  const mode = MODES[timerMode];
  if (!isBreak) {
    isBreak  = true;
    timeLeft = mode.break;
  } else {
    isBreak      = false;
    sessionCount = Math.min(sessionCount + 1, mode.sessions);
    timeLeft     = mode.work;
  }
  setPlayIcon(false);
  updateDisplay();
}

// ===== Event listeners =====
playBtn.addEventListener('click', () => {
  if (timerRunning) pauseTimer(); else startTimer();
});

document.getElementById('timer-reset').addEventListener('click', resetTimer);
document.getElementById('timer-skip').addEventListener('click', skipSession);

document.getElementById('timer-close').addEventListener('click', () => {
  document.getElementById('timer-backdrop').classList.add('hidden');
});

document.getElementById('timer-backdrop').addEventListener('click', (e) => {
  if (e.target === e.currentTarget) {
    document.getElementById('timer-backdrop').classList.add('hidden');
  }
});

// Mode tabs
document.querySelectorAll('.timer-mode-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    if (btn.dataset.mode === timerMode) return;

    clearInterval(timerInterval);
    timerRunning = false;

    document.querySelectorAll('.timer-mode-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    timerMode = btn.dataset.mode;
    resetTimer();

    // Hide/show skip for stopwatch
    document.getElementById('timer-skip').style.visibility =
      timerMode === 'stopwatch' ? 'hidden' : 'visible';

    // Show/hide custom config panel
    const customConfig = document.getElementById('timer-custom-config');
    if (customConfig) customConfig.classList.toggle('hidden', timerMode !== 'custom');
  });
});

// ===== Custom mode inputs =====
function applyCustomConfig() {
  const workVal     = parseInt(document.getElementById('tcc-work').value, 10);
  const breakVal    = parseInt(document.getElementById('tcc-break').value, 10);
  const sessionsVal = parseInt(document.getElementById('tcc-sessions').value, 10);

  if (!workVal || workVal < 1)     return;
  if (!breakVal || breakVal < 1)   return;
  if (!sessionsVal || sessionsVal < 1) return;

  MODES.custom.work     = workVal * 60;
  MODES.custom.break    = breakVal * 60;
  MODES.custom.sessions = sessionsVal;

  if (timerMode === 'custom') resetTimer();
}

['tcc-work', 'tcc-break', 'tcc-sessions'].forEach(id => {
  const el = document.getElementById(id);
  if (el) el.addEventListener('change', applyCustomConfig);
});

// ===== Init display =====
updateDisplay();
