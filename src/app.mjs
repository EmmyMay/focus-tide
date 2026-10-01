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

const STORAGE_KEY = 'focus-tide:v1';
const DEFAULT_DAILY_GOAL = 120;
const MAX_DAILY_GOAL = 1440;
const TICK_MS = 250;

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

async function loadOptional(path) {
  try {
    return await import(path);
  } catch {
    return null;
  }
}

const continuation = window;
const storageApi = await loadOptional('./storage.mjs');
const sessionsApi = await loadOptional('./sessions.mjs');
const tideApi = await loadOptional('./tide.mjs');
const a11yApi = await loadOptional('./accessibility.mjs');

const injectedStorage = (() => {
  try {
    if (continuation.localStorage) {
      return continuation.localStorage;
    }
  } catch {
    return null;
  }
  return null;
})();

const storage = storageApi && injectedStorage ? storageApi.createStorage(injectedStorage) : null;

let timer = createTimer(25);
let sessions = [];
let dailyGoal = DEFAULT_DAILY_GOAL;
let tickHandle = null;

const weekView = createWeekView(elements.week);
const tide = tideApi ? tideApi.createTide(elements.tide) : null;

function isFinitePositive(value) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function normalizeGoal(value) {
  return isFinitePositive(value) ? Math.min(value, MAX_DAILY_GOAL) : DEFAULT_DAILY_GOAL;
}

function fallbackLoad() {
  if (!injectedStorage) {
    return null;
  }
  try {
    const raw = injectedStorage.getItem(STORAGE_KEY);
    if (typeof raw !== 'string') {
      return null;
    }
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.version !== 1) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function fallbackSave(snapshot) {
  if (!injectedStorage) {
    return false;
  }
  try {
    injectedStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
    return true;
  } catch {
    return false;
  }
}

function currentSnapshot() {
  return { version: 1, timer, sessions, dailyGoal };
}

function loadSnapshot() {
  const data = storage ? storage.load() : fallbackLoad();
  if (!data) {
    return;
  }
  if (data.timer) {
    timer = data.timer;
  }
  if (Array.isArray(data.sessions)) {
    sessions = data.sessions;
  }
  dailyGoal = normalizeGoal(data.dailyGoal);
}

function saveSnapshot() {
  const snapshot = currentSnapshot();
  if (storage) {
    storage.save(snapshot);
  } else {
    fallbackSave(snapshot);
  }
}

function announce(message) {
  elements.status.textContent = message;
}

function appendCompleted(record) {
  sessions = sessionsApi ? sessionsApi.appendSession(sessions, record) : [...sessions, record];
}

function renderRemaining() {
  const now = Date.now();
  const ms = getRemainingMs(timer, now);
  const text = formatRemaining(ms);
  elements.remaining.textContent = text;
  document.title = timer.status === 'running' ? `${text} · Focus Tide` : 'Focus Tide';
}

function renderStats() {
  const now = Date.now();
  elements.today.textContent = String(getTodayMinutes(sessions, now));
  elements.streak.textContent = String(getStreak(sessions, dailyGoal, now));
  elements.goal.value = String(dailyGoal);
  weekView.update(getWeek(sessions, now));
  if (tide) {
    tide.update({ minutes: getTodayMinutes(sessions, now), goal: dailyGoal });
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
  timer = pauseTimer(timer, Date.now());
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
  const value = Number.parseInt(elements.custom.value, 10);
  if (!Number.isInteger(value)) {
    return;
  }
  try {
    timer = setDuration(timer, value);
    announce(`${value} minute timer selected.`);
    render();
  } catch {
    announce('Choose a whole number between 1 and 180.');
  }
}

function applyGoal() {
  const value = Number.parseInt(elements.goal.value, 10);
  if (!isFinitePositive(value)) {
    elements.goal.value = String(dailyGoal);
    return;
  }
  dailyGoal = Math.min(value, MAX_DAILY_GOAL);
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

if (a11yApi) {
  a11yApi.bindKeyboard(document, {
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
}

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
