const MIN_MINUTES = 1;
const MAX_MINUTES = 180;
const MS_PER_MINUTE = 60000;

function validateMinutes(minutes) {
  if (
    typeof minutes !== 'number' ||
    !Number.isInteger(minutes) ||
    minutes < MIN_MINUTES ||
    minutes > MAX_MINUTES
  ) {
    throw new RangeError(
      `Duration must be an integer between ${MIN_MINUTES} and ${MAX_MINUTES} minutes`
    );
  }
  return minutes;
}

function durationMinutes(durationMs) {
  return Math.round(durationMs / MS_PER_MINUTE);
}

function sessionId(startedAt, durationMs) {
  return `session-${startedAt}-${durationMinutes(durationMs)}`;
}

function idleState(durationMs) {
  return {
    status: 'idle',
    durationMs,
    remainingMs: durationMs,
    startedAt: null,
    endsAt: null,
    label: ''
  };
}

export function createTimer(minutes = 25) {
  validateMinutes(minutes);
  return idleState(minutes * MS_PER_MINUTE);
}

export function setDuration(state, minutes) {
  validateMinutes(minutes);
  if (state.status !== 'idle') {
    return state;
  }
  return idleState(minutes * MS_PER_MINUTE);
}

export function startTimer(state, now, label = '') {
  if (state.status !== 'idle') {
    return state;
  }
  return {
    status: 'running',
    durationMs: state.durationMs,
    remainingMs: state.durationMs,
    startedAt: now,
    endsAt: now + state.durationMs,
    label: typeof label === 'string' ? label : ''
  };
}

export function pauseTimer(state, now) {
  if (state.status !== 'running') {
    return state;
  }
  return {
    status: 'paused',
    durationMs: state.durationMs,
    remainingMs: Math.max(0, state.endsAt - now),
    startedAt: state.startedAt,
    endsAt: null,
    label: state.label
  };
}

export function resumeTimer(state, now) {
  if (state.status !== 'paused') {
    return state;
  }
  return {
    status: 'running',
    durationMs: state.durationMs,
    remainingMs: state.remainingMs,
    startedAt: state.startedAt,
    endsAt: now + state.remainingMs,
    label: state.label
  };
}

export function cancelTimer(state) {
  if (state.status === 'idle') {
    return state;
  }
  return idleState(state.durationMs);
}

export function advanceTimer(state, now) {
  if (state.status !== 'running') {
    return { state, completed: null };
  }
  if (now >= state.endsAt) {
    return {
      state: idleState(state.durationMs),
      completed: {
        id: sessionId(state.startedAt, state.durationMs),
        startedAt: state.startedAt,
        durationMinutes: durationMinutes(state.durationMs),
        label: state.label
      }
    };
  }
  return {
    state: {
      status: 'running',
      durationMs: state.durationMs,
      remainingMs: state.endsAt - now,
      startedAt: state.startedAt,
      endsAt: state.endsAt,
      label: state.label
    },
    completed: null
  };
}

export function getRemainingMs(state, now) {
  if (state.status === 'running') {
    return Math.max(0, state.endsAt - now);
  }
  return state.remainingMs;
}

export function formatRemaining(ms) {
  const numeric = Number(ms);
  const totalSeconds = Math.max(
    0,
    Math.ceil((Number.isFinite(numeric) ? numeric : 0) / 1000)
  );
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}
