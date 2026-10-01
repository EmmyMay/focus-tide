import test from 'node:test';
import assert from 'node:assert/strict';

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
} from '../src/timer.mjs';

const MINUTE = 60000;
const T0 = 1700000000000;

const idleSnapshot = {
  status: 'idle',
  durationMs: 25 * MINUTE,
  remainingMs: 25 * MINUTE,
  startedAt: null,
  endsAt: null,
  label: ''
};

test('createTimer defaults to a 25 minute idle state', () => {
  assert.deepEqual(createTimer(), idleSnapshot);
});

test('createTimer accepts preset and custom integer durations', () => {
  for (const minutes of [25, 50, 90, 1, 180, 7]) {
    const state = createTimer(minutes);
    assert.equal(state.status, 'idle');
    assert.equal(state.durationMs, minutes * MINUTE);
    assert.equal(state.remainingMs, minutes * MINUTE);
    assert.equal(state.startedAt, null);
    assert.equal(state.endsAt, null);
    assert.equal(state.label, '');
  }
});

test('createTimer rejects invalid durations', () => {
  for (const bad of [0, -1, 181, 1000, 1.5, 24.999, NaN, Infinity, '25', null]) {
    assert.throws(() => createTimer(bad), RangeError, `expected ${String(bad)} to throw`);
  }
});

test('setDuration replaces an idle duration and rejects invalid values', () => {
  const state = createTimer(25);
  const updated = setDuration(state, 50);
  assert.equal(updated.durationMs, 50 * MINUTE);
  assert.equal(updated.remainingMs, 50 * MINUTE);
  assert.deepEqual(state, idleSnapshot);

  assert.throws(() => setDuration(state, 0), RangeError);
  assert.throws(() => setDuration(state, 181), RangeError);
  assert.throws(() => setDuration(state, 2.5), RangeError);
});

test('setDuration is a no-op while running or paused', () => {
  const running = startTimer(createTimer(25), T0);
  assert.equal(setDuration(running, 50), running);

  const paused = pauseTimer(running, T0 + 10 * 1000);
  assert.equal(setDuration(paused, 50), paused);
});

test('startTimer transitions idle to running with wall-clock timestamps', () => {
  const state = startTimer(createTimer(25), T0, 'Deep work');
  assert.deepEqual(state, {
    status: 'running',
    durationMs: 25 * MINUTE,
    remainingMs: 25 * MINUTE,
    startedAt: T0,
    endsAt: T0 + 25 * MINUTE,
    label: 'Deep work'
  });
});

test('startTimer defaults label to empty string and ignores re-start', () => {
  const running = startTimer(createTimer(25), T0);
  assert.equal(running.label, '');
  assert.equal(startTimer(running, T0 + 5000), running);

  const labelled = startTimer(createTimer(25), T0, 'x');
  assert.equal(startTimer(labelled, T0, 'y'), labelled);
  assert.equal(labelled.label, 'x');
});

test('getRemainingMs tracks elapsed wall time without ticks', () => {
  const state = startTimer(createTimer(25), T0);
  assert.equal(getRemainingMs(state, T0), 25 * MINUTE);
  assert.equal(getRemainingMs(state, T0 + 12500), 25 * MINUTE - 12500);
  assert.equal(getRemainingMs(state, T0 + 25 * MINUTE - 1), 1);
  assert.equal(getRemainingMs(state, T0 + 25 * MINUTE), 0);
  assert.equal(getRemainingMs(state, T0 + 30 * MINUTE), 0);
});

test('pause stores remaining and paused elapsed time never counts', () => {
  const started = startTimer(createTimer(25), T0);
  const paused = pauseTimer(started, T0 + 10 * 1000);
  assert.deepEqual(paused, {
    status: 'paused',
    durationMs: 25 * MINUTE,
    remainingMs: 25 * MINUTE - 10 * 1000,
    startedAt: T0,
    endsAt: null,
    label: ''
  });

  assert.equal(getRemainingMs(paused, T0 + 1000 * 1000), 25 * MINUTE - 10 * 1000);

  const resumedAt = T0 + 1000 * 1000;
  const resumed = resumeTimer(paused, resumedAt);
  assert.equal(resumed.status, 'running');
  assert.equal(resumed.startedAt, T0);
  assert.equal(resumed.endsAt, resumedAt + (25 * MINUTE - 10 * 1000));
  assert.equal(getRemainingMs(resumed, resumedAt + 5 * 1000), 25 * MINUTE - 15 * 1000);
});

test('resume and pause outside their states are safe no-ops', () => {
  const idle = createTimer(25);
  const running = startTimer(idle, T0);
  const paused = pauseTimer(running, T0 + 1000);

  assert.equal(pauseTimer(idle, T0), idle);
  assert.equal(pauseTimer(paused, T0), paused);
  assert.equal(resumeTimer(idle, T0), idle);
  assert.equal(resumeTimer(running, T0), running);
  assert.equal(startTimer(paused, T0), paused);
});

test('advanceTimer before the deadline reports no completion and updates remaining', () => {
  const running = startTimer(createTimer(25), T0, 'Focus');
  const result = advanceTimer(running, T0 + 12500);
  assert.equal(result.completed, null);
  assert.equal(result.state.status, 'running');
  assert.equal(result.state.remainingMs, 25 * MINUTE - 12500);
  assert.equal(result.state.startedAt, T0);
  assert.equal(result.state.endsAt, T0 + 25 * MINUTE);
  assert.equal(result.state.label, 'Focus');
  assert.deepEqual(running, startTimer(createTimer(25), T0, 'Focus'));
});

test('advanceTimer completes an expired session exactly once', () => {
  const running = startTimer(createTimer(25), T0, 'Focus');
  const first = advanceTimer(running, T0 + 25 * MINUTE);
  assert.deepEqual(first.completed, {
    id: `session-${T0}-25`,
    startedAt: T0,
    durationMinutes: 25,
    label: 'Focus'
  });
  assert.equal(first.state.status, 'idle');
  assert.equal(first.state.startedAt, null);
  assert.equal(first.state.endsAt, null);
  assert.equal(first.state.durationMs, 25 * MINUTE);

  const second = advanceTimer(first.state, T0 + 26 * MINUTE);
  assert.equal(second.completed, null);
  assert.equal(second.state, first.state);
});

test('rehydrated running state completes when its deadline has already passed', () => {
  const running = startTimer(createTimer(50), T0, 'Refresh');
  const rehydrated = JSON.parse(JSON.stringify(running));
  const result = advanceTimer(rehydrated, T0 + 51 * MINUTE);
  assert.equal(result.completed.id, `session-${T0}-50`);
  assert.equal(result.completed.durationMinutes, 50);
  assert.equal(result.completed.label, 'Refresh');
  assert.equal(result.state.status, 'idle');
});

test('advanceTimer keeps the session id stable across pause and resume', () => {
  const started = startTimer(createTimer(25), T0, 'Stable');
  const paused = pauseTimer(started, T0 + 30 * 1000);
  const resumed = resumeTimer(paused, T0 + 60 * 1000);
  const result = advanceTimer(resumed, T0 + 60 * 1000 + 25 * MINUTE);
  assert.equal(result.completed.id, `session-${T0}-25`);
  assert.equal(result.completed.startedAt, T0);
});

test('cancelTimer returns an idle timer and never produces a session', () => {
  const running = startTimer(createTimer(25), T0, 'Cancel me');
  const cancelled = cancelTimer(running);
  assert.deepEqual(cancelled, { ...idleSnapshot });
  assert.equal(cancelled.label, '');

  const paused = pauseTimer(running, T0 + 1000);
  const cancelledPaused = cancelTimer(paused);
  assert.equal(cancelledPaused.status, 'idle');
  assert.equal(cancelledPaused.durationMs, 25 * MINUTE);

  const idle = createTimer(25);
  assert.equal(cancelTimer(idle), idle);
});

test('cancelled duration is preserved for the next session', () => {
  const state = setDuration(createTimer(25), 90);
  const running = startTimer(state, T0);
  const cancelled = cancelTimer(running);
  assert.equal(cancelled.durationMs, 90 * MINUTE);
  const restarted = startTimer(cancelled, T0 + 1000);
  assert.equal(restarted.endsAt, T0 + 1000 + 90 * MINUTE);
});

test('formatRemaining renders mm:ss and never goes negative', () => {
  assert.equal(formatRemaining(0), '00:00');
  assert.equal(formatRemaining(-5000), '00:00');
  assert.equal(formatRemaining(1), '00:01');
  assert.equal(formatRemaining(999), '00:01');
  assert.equal(formatRemaining(1000), '00:01');
  assert.equal(formatRemaining(59000), '00:59');
  assert.equal(formatRemaining(60000), '01:00');
  assert.equal(formatRemaining(90000), '01:30');
  assert.equal(formatRemaining(25 * MINUTE), '25:00');
  assert.equal(formatRemaining(90 * MINUTE), '90:00');
  assert.equal(formatRemaining(180 * MINUTE), '180:00');
});

test('paused timer keeps counting down correctly through getRemainingMs after many resumes', () => {
  let state = startTimer(createTimer(25), T0);
  state = pauseTimer(state, T0 + 5 * MINUTE);
  state = resumeTimer(state, T0 + 60 * MINUTE);
  state = pauseTimer(state, T0 + 65 * MINUTE);
  assert.equal(getRemainingMs(state, T0 + 1e9), 25 * MINUTE - 10 * MINUTE);
  const result = advanceTimer(state, T0 + 1e9);
  assert.equal(result.completed, null);
});

test('actions outside relevant state never mutate the provided state object', () => {
  const states = [
    createTimer(25),
    startTimer(createTimer(25), T0),
    pauseTimer(startTimer(createTimer(25), T0), T0 + 1000)
  ];
  const clones = states.map((state) => JSON.parse(JSON.stringify(state)));
  states.forEach((state, index) => {
    startTimer(state, T0);
    pauseTimer(state, T0);
    resumeTimer(state, T0);
    cancelTimer(state);
    advanceTimer(state, T0 + 1e9);
    setDuration(state, 50);
    assert.deepEqual(state, clones[index]);
  });
});
