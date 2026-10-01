import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_LABEL_LENGTH,
  appendSession,
  normalizeLabel,
  normalizeSession,
  normalizeSessions,
} from '../src/sessions.mjs';

const T0 = Date.UTC(2026, 9, 1, 8, 0);

function session(overrides = {}) {
  return { id: `s-${T0}`, startedAt: T0, durationMinutes: 25, label: 'Write report', ...overrides };
}

test('appendSession adds a completed session to an empty log', () => {
  assert.deepEqual(appendSession([], session()), [session()]);
});

test('appendSession tolerates a missing list', () => {
  assert.deepEqual(appendSession(undefined, session()), [session()]);
  assert.deepEqual(appendSession(null, session()), [session()]);
});

test('appendSession does not mutate the input list or record', () => {
  const existing = [session({ id: 'a', startedAt: T0 - 60_000 })];
  const snapshot = structuredClone(existing);
  const record = session({ id: 'b', label: '  Deep\nwork  ' });
  const recordSnapshot = structuredClone(record);

  const next = appendSession(existing, record);

  assert.notEqual(next, existing);
  assert.deepEqual(existing, snapshot);
  assert.deepEqual(record, recordSnapshot);
  assert.equal(next.length, 2);
  assert.notEqual(next[1], record);
  assert.equal(next[1].label, 'Deep work');
});

test('appendSession deduplicates by id and keeps the first record', () => {
  const first = appendSession([], session({ label: 'first' }));
  const again = appendSession(first, session({ label: 'second' }));
  assert.deepEqual(again, first);
  assert.equal(again[0].label, 'first');
  assert.notEqual(again, first);
});

test('appendSession never logs cancelled sessions', () => {
  const existing = [session({ id: 'kept' })];
  assert.deepEqual(appendSession(existing, session({ id: 'x', cancelled: true })), existing);
  assert.deepEqual(appendSession(existing, session({ id: 'y', status: 'cancelled' })), existing);
  assert.deepEqual(appendSession(existing, null), existing);
  assert.deepEqual(appendSession(existing, undefined), existing);
});

test('appendSession rejects invalid records', () => {
  const invalid = [
    session({ id: '' }),
    session({ id: '   ' }),
    session({ id: 42 }),
    session({ startedAt: 'yesterday' }),
    session({ startedAt: -1 }),
    session({ startedAt: 1.5 }),
    session({ startedAt: Number.NaN }),
    session({ durationMinutes: 0 }),
    session({ durationMinutes: -5 }),
    session({ durationMinutes: Number.POSITIVE_INFINITY }),
    session({ durationMinutes: '25' }),
    [],
    'session',
  ];
  for (const record of invalid) {
    assert.deepEqual(appendSession([], record), [], `expected rejection of ${JSON.stringify(record)}`);
  }
});

test('appendSession keeps the log in start-time order', () => {
  const later = session({ id: 'later', startedAt: T0 + 3_600_000 });
  const earlier = session({ id: 'earlier', startedAt: T0 });
  const log = appendSession(appendSession([], later), earlier);
  assert.deepEqual(log.map((s) => s.id), ['earlier', 'later']);
});

test('normalizeSession keeps only the record fields', () => {
  assert.deepEqual(normalizeSession({ ...session(), extra: true }), session());
});

test('normalizeSession defaults a missing or non-string label to empty', () => {
  assert.equal(normalizeSession(session({ label: undefined })).label, '');
  assert.equal(normalizeSession(session({ label: 7 })).label, '');
});

test('normalizeLabel collapses whitespace onto one trimmed line', () => {
  assert.equal(normalizeLabel('  plan\r\n the\tweek \u2028 ahead '), 'plan the week ahead');
  assert.equal(normalizeLabel('\n\n'), '');
  assert.equal(normalizeLabel(null), '');
});

test('normalizeLabel caps length without splitting characters', () => {
  const long = '🌊'.repeat(MAX_LABEL_LENGTH + 10);
  const result = normalizeLabel(long);
  assert.equal(Array.from(result).length, MAX_LABEL_LENGTH);
  assert.ok(result.endsWith('🌊'));
});

test('normalizeLabel leaves markup as plain text for the view to escape', () => {
  assert.equal(normalizeLabel('<b>bold</b>'), '<b>bold</b>');
});

test('normalizeSessions drops invalid entries and duplicates', () => {
  const list = [session({ id: 'a' }), { nope: true }, session({ id: 'a', label: 'dup' }), session({ id: 'b', startedAt: T0 - 1 })];
  assert.deepEqual(normalizeSessions(list).map((s) => s.id), ['b', 'a']);
  assert.deepEqual(normalizeSessions('not a list'), []);
});
