import {
  createTimer,
  setDuration,
  startTimer,
  pauseTimer,
  resumeTimer,
  cancelTimer,
  advanceTimer,
  getRemainingMs,
  formatRemaining
} from './timer.mjs';
import { getTodayMinutes, getWeek, getStreak } from './stats.mjs';
import { createWeekView } from './week-view.mjs';
import { createStorage, DEFAULT_DAILY_GOAL, MAX_DAILY_GOAL } from './storage.mjs';
import { appendSession, MAX_LABEL_LENGTH } from './sessions.mjs';
import { bindKeyboard } from './accessibility.mjs';
import { createTide } from './tide.mjs';

const TICK_MS = 250;
const HEARTBEAT_MS = 30000;

const elements = {
  remaining: document.getElementById('remaining-display'),
  status: document.getElementById('timer-status'),
  presets: document.querySelector('.presets'),
  custom: document.getElementById('custom-minutes'),
  label: document.getElementById('session-label'),
  start: document.getElementById('start-button'),
  pause: document.getElementById('pause-button'),
  resume: document.getElementById('resume-button'),
  cancel: document.getElementById('cancel-button'),
  goal: document.getElementById('daily-goal'),
  today: document.getElementById('today-minutes'),
  streak: document.getElementById('streak-count'),
  tide: document.getElementById('tide'),
  week: document.getElementById('week'),
  sessionList: document.getElementById('session-list'),
  sessionsEmpty: document.getElementById('sessions-empty')
};

const injectedStorage = (() => {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
})();

const storage = createStorage(injectedStorage);

let timer = createTimer(25);
let sessions = [];
let dailyGoal = DEFAULT_DAILY_GOAL;
let tickHandle = null;
let lastAnnouncedMinute = null;

const weekView = createWeekView(elements.week);
const tide = createTide(elements.tide);

if (elements.label) {
  elements.label.maxLength = MAX_LABEL_LENGTH;
}
if (elements.goal) {
  elements.goal.max = String(MAX_DAILY_GOAL);
}

function isFinitePositive(value) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function normalizeGoal(value) {
  return isFinitePositive(value) ? Math.min(value, MAX_DAILY_GOAL) : DEFAULT_DAILY_GOAL;
}

function currentSnapshot() {
  return { version: 1, timer, sessions, dailyGoal };
}

function loadSnapshot() {
  const data = storage.load();
  if (data.timer) {
    timer = data.timer;
  }
  if (Array.isArray(data.sessions)) {
    sessions = data.sessions;
  }
  dailyGoal = normalizeGoal(data.dailyGoal);
}

function saveSnapshot() {
  storage.save(currentSnapshot());
}

function announce(message) {
  elements.status.textContent = message;
}

function appendCompleted(record) {
  sessions = appendSession(sessions, record);
}

function renderRemaining() {
  const now = Date.now();
  const ms = getRemainingMs(timer, now);
  const text = formatRemaining(ms);
  elements.remaining.textContent = text;
  document.title = timer.status === 'running' ? `${text} · Focus Tide` : 'Focus Tide';

  if (timer.status === 'running') {
    const minutesLeft = Math.max(1, Math.ceil(ms / 60000));
    if (minutesLeft !== lastAnnouncedMinute) {
      lastAnnouncedMinute = minutesLeft;
      announce(`${minutesLeft} minute${minutesLeft === 1 ? '' : 's'} remaining.`);
    }
  } else {
    lastAnnouncedMinute = null;
  }
}

function renderStats() {
  const now = Date.now();
  const todayMinutes = getTodayMinutes(sessions, now);
  elements.today.textContent = String(todayMinutes);
  elements.streak.textContent = String(getStreak(sessions, dailyGoal, now));
  weekView.update(getWeek(sessions, now));
  tide.update({ minutes: todayMinutes, goal: dailyGoal });
}

function renderGoalInput() {
  if (document.activeElement !== elements.goal) {
    elements.goal.value = String(dailyGoal);
  }
}

function renderSessions() {
  elements.sessionList.textContent = '';
  elements.sessionsEmpty.hidden = sessions.length > 0;
  const ordered = [...sessions].sort((a, b) => b.startedAt - a.startedAt);
  for (const session of ordered) {
    const item = document.createElement('li');
    const when = new Date(session.startedAt).toLocaleString();
    item.textContent = session.label
      ? `${when} · ${session.durationMinutes} min · ${session.label}`
      : `${when} · ${session.durationMinutes} min`;
    elements.sessionList.appendChild(item);
  }
}

function renderControls() {
  const idle = timer.status === 'idle';
  const running = timer.status === 'running';
  const paused = timer.status === 'paused';
  elements.start.disabled = !idle;
  elements.pause.disabled = !running;
  elements.resume.disabled = !paused;
  elements.cancel.disabled = idle;
}

function render() {
  renderRemaining();
  renderStats();
  renderSessions();
  renderControls();
  renderGoalInput();
}

function stopTicking() {
  if (tickHandle !== null) {
    clearInterval(tickHandle);
    tickHandle = null;
  }
}

function handleCompletion(completed) {
  appendCompleted(completed);
  saveSnapshot();
  stopTicking();
  announce('Session complete.');
}

function tick() {
  const result = advanceTimer(timer, Date.now());
  timer = result.state;
  if (result.completed) {
    handleCompletion(result.completed);
  }
  render();
}

function ensureTicking() {
  stopTicking();
  tickHandle = setInterval(tick, TICK_MS);
}

function start() {
  if (timer.status !== 'idle') {
    return;
  }
  timer = startTimer(timer, Date.now(), elements.label.value);
  saveSnapshot();
  announce('Timer started.');
  ensureTicking();
  render();
}

function pause() {
  if (timer.status !== 'running') {
    return;
  }
  const now = Date.now();
  const result = advanceTimer(timer, now);
  timer = result.state;
  if (result.completed) {
    handleCompletion(result.completed);
    render();
    return;
  }
  timer = pauseTimer(timer, now);
  saveSnapshot();
  stopTicking();
  announce('Timer paused.');
  render();
}

function resume() {
  if (timer.status !== 'paused') {
    return;
  }
  timer = resumeTimer(timer, Date.now());
  saveSnapshot();
  announce('Timer resumed.');
  ensureTicking();
  render();
}

function cancel() {
  if (timer.status === 'idle') {
    return;
  }
  timer = cancelTimer(timer);
  saveSnapshot();
  stopTicking();
  announce('Timer cancelled.');
  render();
}

function applyPreset(minutes) {
  if (timer.status !== 'idle') {
    return;
  }
  try {
    timer = setDuration(timer, minutes);
    elements.custom.value = '';
    announce(`${minutes} minute preset selected.`);
    render();
  } catch {
    announce('That preset is not available.');
  }
}

function applyCustom() {
  if (timer.status !== 'idle') {
    return;
  }
  const value = elements.custom.valueAsNumber;
  if (!Number.isInteger(value) || value < 1 || value > 180) {
    announce('Choose a whole number between 1 and 180.');
    return;
  }
  try {
    timer = setDuration(timer, value);
    elements.custom.value = '';
    announce(`${value} minute timer selected.`);
    render();
  } catch {
    announce('Choose a whole number between 1 and 180.');
  }
}

function applyGoal() {
  const value = elements.goal.valueAsNumber;
  if (!Number.isInteger(value) || value < 1) {
    elements.goal.value = String(dailyGoal);
    return;
  }
  dailyGoal = Math.min(value, MAX_DAILY_GOAL);
  elements.goal.value = String(dailyGoal);
  saveSnapshot();
  renderStats();
}

elements.start.addEventListener('click', start);
elements.pause.addEventListener('click', pause);
elements.resume.addEventListener('click', resume);
elements.cancel.addEventListener('click', cancel);
elements.custom.addEventListener('change', applyCustom);
elements.goal.addEventListener('change', applyGoal);
elements.presets.addEventListener('click', (event) => {
  const button = event.target.closest('[data-preset]');
  if (button) {
    applyPreset(Number.parseInt(button.dataset.preset, 10));
  }
});

bindKeyboard(document, {
  onToggle: () => {
    if (timer.status === 'idle') {
      start();
    } else if (timer.status === 'running') {
      pause();
    } else if (timer.status === 'paused') {
      resume();
    }
  },
  onCancel: cancel,
  onPreset: applyPreset
});

function recoverExpired() {
  const result = advanceTimer(timer, Date.now());
  timer = result.state;
  if (result.completed) {
    appendCompleted(result.completed);
    saveSnapshot();
    announce('Session complete.');
  }
}

loadSnapshot();
recoverExpired();
if (timer.status === 'running') {
  ensureTicking();
}
render();

function reconcile() {
  const now = Date.now();
  if (timer.status === 'running') {
    const result = advanceTimer(timer, now);
    timer = result.state;
    if (result.completed) {
      handleCompletion(result.completed);
    }
  }
  render();
}

setInterval(reconcile, HEARTBEAT_MS);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    reconcile();
  }
});
