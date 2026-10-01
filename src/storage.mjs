// DOM-free persistence for the whole app snapshot behind an injected
// getItem/setItem-compatible store. Never touches window or localStorage itself.
import { normalizeSessions } from './sessions.mjs';

export const STORAGE_KEY = 'focus-tide:v1';
export const STORAGE_VERSION = 1;
export const DEFAULT_DAILY_GOAL = 120;
export const MAX_DAILY_GOAL = 24 * 60;

const TIMER_STATUSES = new Set(['idle', 'running', 'paused']);

export function createDefaultData() {
  return { version: STORAGE_VERSION, timer: null, sessions: [], dailyGoal: DEFAULT_DAILY_GOAL };
}

export function normalizeDailyGoal(goal) {
  return typeof goal === 'number' && Number.isFinite(goal) && goal > 0 && goal <= MAX_DAILY_GOAL
    ? goal
    : DEFAULT_DAILY_GOAL;
}

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

// Accepts timer JSON that the timer module can resume from; anything else becomes null.
// A coherent timer is returned as a deep copy so unknown fields survive untouched.
export function normalizeTimer(timer) {
  if (timer === null || typeof timer !== 'object' || Array.isArray(timer)) return null;
  const { status, durationMs, remainingMs, startedAt, endsAt, label } = timer;

  if (!TIMER_STATUSES.has(status)) return null;
  if (!isFiniteNumber(durationMs) || durationMs <= 0) return null;
  if (!isFiniteNumber(remainingMs) || remainingMs < 0 || remainingMs > durationMs) return null;
  if (label !== undefined && typeof label !== 'string') return null;

  if (status === 'idle' && (startedAt != null || endsAt != null)) return null;
  if (status === 'running' && !(isFiniteNumber(startedAt) && isFiniteNumber(endsAt) && endsAt >= startedAt)) {
    return null;
  }
  if (status === 'paused' && !(isFiniteNumber(startedAt) && (endsAt == null || isFiniteNumber(endsAt)))) {
    return null;
  }

  try {
    return JSON.parse(JSON.stringify(timer));
  } catch {
    return null;
  }
}

function normalizeData(data) {
  return {
    version: STORAGE_VERSION,
    timer: normalizeTimer(data.timer),
    sessions: normalizeSessions(data.sessions),
    dailyGoal: normalizeDailyGoal(data.dailyGoal),
  };
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function createStorage(storage, key = STORAGE_KEY) {
  function load() {
    let raw;
    try {
      raw = storage.getItem(key);
    } catch {
      return createDefaultData();
    }
    if (typeof raw !== 'string') return createDefaultData();

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return createDefaultData();
    }
    if (!isPlainObject(parsed) || parsed.version !== STORAGE_VERSION) return createDefaultData();
    return normalizeData(parsed);
  }

  // Writes sessions, timer and goal as one snapshot. Returns false if nothing was stored.
  function save(data) {
    if (!isPlainObject(data)) return false;
    try {
      storage.setItem(key, JSON.stringify(normalizeData(data)));
      return true;
    } catch {
      return false;
    }
  }

  return { load, save };
}
