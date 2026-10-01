import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_DAILY_GOAL,
  STORAGE_KEY,
  createDefaultData,
  createStorage,
  normalizeTimer,
} from '../src/storage.mjs';

const T0 = Date.UTC(2026, 9, 1, 8, 0);

function memoryStore(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => {
      data.set(key, String(value));
    },
  };
}

function session(overrides = {}) {
  return { id: `s-${T0}`, startedAt: T0, durationMinutes: 25, label: 'Focus', ...overrides };
}

const runningTimer = {
  status: 'running',
  durationMs: 25 * 60_000,
  remainingMs: 25 * 60_000,
  startedAt: T0,
  endsAt: T0 + 25 * 60_000,
  label: 'Draft',
};

const pausedTimer = {
  status: 'paused',
  durationMs: 50 * 60_000,
  remainingMs: 20 * 60_000,
  startedAt: T0,
  endsAt: null,
  label: '',
};

const idleTimer = {
  status: 'idle',
  durationMs: 25 * 60_000,
  remainingMs: 25 * 60_000,
  startedAt: null,
  endsAt: null,
  label: '',
};

test('load returns defaults when nothing is stored', () => {
  assert.deepEqual(createStorage(memoryStore()).load(), {
    version: 1,
    timer: null,
    sessions: [],
    dailyGoal: DEFAULT_DAILY_GOAL,
  });
  assert.equal(DEFAULT_DAILY_GOAL, 120);
});

test('save then load round-trips a full snapshot under focus-tide:v1', () => {
  const store = memoryStore();
  const storage = createStorage(store);
  const data = { version: 1, timer: runningTimer, sessions: [session()], dailyGoal: 90 };

  assert.equal(storage.save(data), true);
  assert.equal(STORAGE_KEY, 'focus-tide:v1');
  assert.deepEqual([...store.data.keys()], ['focus-tide:v1']);
  assert.deepEqual(storage.load(), data);
});

test('a new storage instance reads what another one saved', () => {
  const store = memoryStore();
  createStorage(store).save({ timer: pausedTimer, sessions: [session()], dailyGoal: 150 });
  assert.deepEqual(createStorage(store).load(), {
    version: 1,
    timer: pausedTimer,
    sessions: [session()],
    dailyGoal: 150,
  });
});

test('completion persists the cleared timer and new session in a single save', () => {
  const store = memoryStore();
  let writes = 0;
  const counting = { ...store, setItem: (k, v) => { writes += 1; store.setItem(k, v); } };
  const storage = createStorage(counting);

  storage.save({ timer: runningTimer, sessions: [], dailyGoal: 120 });
  storage.save({ timer: idleTimer, sessions: [session()], dailyGoal: 120 });

  assert.equal(writes, 2);
  const loaded = storage.load();
  assert.deepEqual(loaded.timer, idleTimer);
  assert.deepEqual(loaded.sessions, [session()]);
});

test('running and paused timer JSON is preserved, including extra fields', () => {
  const storage = createStorage(memoryStore());
  const timer = { ...runningTimer, id: 'session-abc', meta: { preset: 25 } };
  storage.save({ timer, sessions: [], dailyGoal: 120 });
  assert.deepEqual(storage.load().timer, timer);

  storage.save({ timer: pausedTimer, sessions: [], dailyGoal: 120 });
  assert.deepEqual(storage.load().timer, pausedTimer);
});

test('an expired running timer is kept so the timer module can complete it', () => {
  const storage = createStorage(memoryStore());
  const expired = { ...runningTimer, startedAt: T0 - 3_600_000, endsAt: T0 - 1_000 };
  storage.save({ timer: expired, sessions: [], dailyGoal: 120 });
  assert.deepEqual(storage.load().timer, expired);
});

test('normalizeTimer rejects incoherent timer state', () => {
  const invalid = [
    'running',
    [],
    { ...runningTimer, status: 'finished' },
    { ...runningTimer, durationMs: 0 },
    { ...runningTimer, remainingMs: -1 },
    { ...runningTimer, remainingMs: runningTimer.durationMs + 1 },
    { ...runningTimer, endsAt: null },
    { ...runningTimer, endsAt: T0 - 1 },
    { ...runningTimer, startedAt: 'now' },
    { ...runningTimer, label: 5 },
    { ...pausedTimer, startedAt: null },
    { ...idleTimer, startedAt: T0 },
    { ...idleTimer, endsAt: T0 },
  ];
  for (const timer of invalid) {
    assert.equal(normalizeTimer(timer), null, `expected rejection of ${JSON.stringify(timer)}`);
  }
  assert.equal(normalizeTimer(null), null);
});

test('normalizeTimer returns a copy, not the original object', () => {
  const copy = normalizeTimer(runningTimer);
  assert.deepEqual(copy, runningTimer);
  assert.notEqual(copy, runningTimer);
});

test('load falls back to defaults for corrupt or foreign data', () => {
  const cases = ['{not json', 'null', '42', '"text"', '[]', JSON.stringify({ version: 2, sessions: [session()] })];
  for (const raw of cases) {
    assert.deepEqual(createStorage(memoryStore({ [STORAGE_KEY]: raw })).load(), createDefaultData(), raw);
  }
});

test('load keeps valid sessions and drops corrupt ones', () => {
  const raw = JSON.stringify({
    version: 1,
    timer: { status: 'running' },
    sessions: [session({ id: 'ok' }), { id: 'broken' }, session({ id: 'ok', label: 'dup' }), 'junk'],
    dailyGoal: -10,
  });
  assert.deepEqual(createStorage(memoryStore({ [STORAGE_KEY]: raw })).load(), {
    version: 1,
    timer: null,
    sessions: [session({ id: 'ok' })],
    dailyGoal: 120,
  });
});

test('load tolerates a missing sessions field', () => {
  const raw = JSON.stringify({ version: 1, dailyGoal: 60 });
  assert.deepEqual(createStorage(memoryStore({ [STORAGE_KEY]: raw })).load(), {
    version: 1,
    timer: null,
    sessions: [],
    dailyGoal: 60,
  });
});

test('daily goal must be a positive number', () => {
  const storage = createStorage(memoryStore());
  for (const goal of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, '90', null, 10_000]) {
    storage.save({ sessions: [], dailyGoal: goal });
    assert.equal(storage.load().dailyGoal, 120, `goal ${String(goal)}`);
  }
  storage.save({ sessions: [], dailyGoal: 45 });
  assert.equal(storage.load().dailyGoal, 45);
});

test('save normalizes labels and drops cancelled sessions', () => {
  const storage = createStorage(memoryStore());
  storage.save({
    sessions: [session({ label: ' two\nlines ' }), session({ id: 'gone', cancelled: true })],
    dailyGoal: 120,
  });
  assert.deepEqual(storage.load().sessions, [session({ label: 'two lines' })]);
});

test('save does not mutate its input', () => {
  const data = { timer: { ...runningTimer }, sessions: [session({ label: ' a\nb ' })], dailyGoal: 120 };
  const snapshot = structuredClone(data);
  createStorage(memoryStore()).save(data);
  assert.deepEqual(data, snapshot);
});

test('save rejects non-object input without writing', () => {
  const store = memoryStore();
  const storage = createStorage(store);
  for (const value of [null, undefined, 'data', [], 5]) {
    assert.equal(storage.save(value), false);
  }
  assert.equal(store.data.size, 0);
});

test('unavailable storage never throws', () => {
  const throwing = {
    getItem() {
      throw new Error('SecurityError');
    },
    setItem() {
      throw new Error('QuotaExceededError');
    },
  };
  for (const store of [throwing, null, undefined, {}]) {
    const storage = createStorage(store);
    assert.deepEqual(storage.load(), createDefaultData());
    assert.equal(storage.save({ sessions: [session()], dailyGoal: 120 }), false);
  }
});

test('loaded data is a fresh object each time', () => {
  const store = memoryStore();
  const storage = createStorage(store);
  storage.save({ sessions: [session()], dailyGoal: 120 });
  const first = storage.load();
  first.sessions.push(session({ id: 'mutated' }));
  first.dailyGoal = 1;
  assert.deepEqual(storage.load().sessions, [session()]);
  assert.equal(storage.load().dailyGoal, 120);
});

test('modules do not reference browser globals', async () => {
  const { readFile } = await import('node:fs/promises');
  for (const file of ['../src/storage.mjs', '../src/sessions.mjs']) {
    const source = await readFile(new URL(file, import.meta.url), 'utf8');
    const code = source.replace(/\/\/.*$/gm, '');
    assert.doesNotMatch(code, /\bwindow\b|\blocalStorage\b|\bdocument\b/, file);
  }
});
