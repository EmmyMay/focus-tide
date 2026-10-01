import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

import { getDayKey, getTodayMinutes, getWeek, getStreak } from '../src/stats.mjs';

function at(year, month, day, hours = 0, minutes = 0) {
  return new Date(year, month - 1, day, hours, minutes, 0, 0).getTime();
}

function session(startedAt, durationMinutes, id = `s-${startedAt}`) {
  return { id, startedAt, durationMinutes, label: '' };
}

test('getDayKey renders a zero-padded local YYYY-MM-DD', () => {
  assert.equal(getDayKey(at(2026, 1, 5, 9)), '2026-01-05');
  assert.equal(getDayKey(at(2026, 12, 31, 23, 59)), '2026-12-31');
  assert.equal(getDayKey(at(2026, 3, 9, 0, 0)), '2026-03-09');
});

test('getDayKey follows local midnight, not UTC', () => {
  const late = at(2026, 6, 15, 23, 59);
  const early = at(2026, 6, 16, 0, 1);
  assert.equal(getDayKey(late), '2026-06-15');
  assert.equal(getDayKey(early), '2026-06-16');
});

test('getTodayMinutes sums only sessions attributed to the local start date', () => {
  const now = at(2026, 5, 20, 15);
  const sessions = [
    session(at(2026, 5, 20, 8), 25),
    session(at(2026, 5, 20, 13), 35),
    session(at(2026, 5, 19, 23, 59), 90),
    session(at(2026, 5, 21, 0, 1), 50),
    session(at(2026, 5, 20, 9), Number.NaN),
    { id: 'broken' },
    null
  ];
  assert.equal(getTodayMinutes(sessions, now), 60);
});

test('getTodayMinutes returns 0 for an empty or invalid list', () => {
  assert.equal(getTodayMinutes([], at(2026, 5, 20)), 0);
  assert.equal(getTodayMinutes(undefined, at(2026, 5, 20)), 0);
  assert.equal(getTodayMinutes(null, at(2026, 5, 20)), 0);
});

test('getWeek returns seven chronological zero-filled days ending today', () => {
  const week = getWeek([], at(2026, 5, 20, 12));
  assert.deepEqual(week.map((entry) => entry.date), [
    '2026-05-14',
    '2026-05-15',
    '2026-05-16',
    '2026-05-17',
    '2026-05-18',
    '2026-05-19',
    '2026-05-20'
  ]);
  assert.ok(week.every((entry) => entry.minutes === 0));
  assert.deepEqual(week.map((entry) => entry.isToday), [false, false, false, false, false, false, true]);
});

test('getWeek sums minutes per calendar day and ignores sessions outside the window', () => {
  const now = at(2026, 5, 20, 12);
  const sessions = [
    session(at(2026, 5, 14, 10), 25, 'a'),
    session(at(2026, 5, 14, 11), 35, 'b'),
    session(at(2026, 5, 18, 22), 50, 'c'),
    session(at(2026, 5, 20, 7), 15, 'd'),
    session(at(2026, 5, 13, 10), 999, 'before'),
    session(at(2026, 5, 21, 10), 999, 'after')
  ];
  const week = getWeek(sessions, now);
  assert.deepEqual(week, [
    { date: '2026-05-14', minutes: 60, isToday: false },
    { date: '2026-05-15', minutes: 0, isToday: false },
    { date: '2026-05-16', minutes: 0, isToday: false },
    { date: '2026-05-17', minutes: 0, isToday: false },
    { date: '2026-05-18', minutes: 50, isToday: false },
    { date: '2026-05-19', minutes: 0, isToday: false },
    { date: '2026-05-20', minutes: 15, isToday: true }
  ]);
});

test('getWeek crosses month and year boundaries with calendar arithmetic', () => {
  const newYear = getWeek([], at(2026, 1, 2, 12));
  assert.deepEqual(newYear.map((entry) => entry.date), [
    '2025-12-27',
    '2025-12-28',
    '2025-12-29',
    '2025-12-30',
    '2025-12-31',
    '2026-01-01',
    '2026-01-02'
  ]);

  const march = getWeek([], at(2026, 3, 2, 12));
  assert.deepEqual(march.map((entry) => entry.date), [
    '2026-02-24',
    '2026-02-25',
    '2026-02-26',
    '2026-02-27',
    '2026-02-28',
    '2026-03-01',
    '2026-03-02'
  ]);
});

test('getStreak is zero with no goal-reaching days', () => {
  assert.equal(getStreak([], 120, at(2026, 5, 20)), 0);
  assert.equal(getStreak([session(at(2026, 5, 20, 9), 119)], 120, at(2026, 5, 20, 20)), 0);
});

test('getStreak counts today and consecutive earlier goal days', () => {
  const now = at(2026, 5, 20, 20);
  const sessions = [
    session(at(2026, 5, 20, 9), 120, 'today'),
    session(at(2026, 5, 19, 9), 150, 'yesterday'),
    session(at(2026, 5, 18, 9), 200, 'two-days'),
    session(at(2026, 5, 17, 9), 60, 'gap')
  ];
  assert.equal(getStreak(sessions, 120, now), 3);
});

test('getStreak anchors on yesterday when today has not met the goal', () => {
  const now = at(2026, 5, 20, 8);
  const sessions = [
    session(at(2026, 5, 20, 7), 30, 'today-partial'),
    session(at(2026, 5, 19, 9), 120, 'yesterday'),
    session(at(2026, 5, 18, 9), 100, 'two-days')
  ];
  assert.equal(getStreak(sessions, 120, now), 1);
});

test('getStreak counts an exact goal and multiplies same-day sessions', () => {
  const now = at(2026, 5, 20, 20);
  const sessions = [
    session(at(2026, 5, 20, 9), 60, 'a'),
    session(at(2026, 5, 20, 14), 60, 'b'),
    session(at(2026, 5, 19, 9), 120, 'c')
  ];
  assert.equal(getStreak(sessions, 120, now), 2);
});

test('getStreak ignores future dates', () => {
  const now = at(2026, 5, 20, 12);
  const sessions = [
    session(at(2026, 5, 20, 9), 120, 'today'),
    session(at(2026, 5, 22, 9), 500, 'future')
  ];
  assert.equal(getStreak(sessions, 120, now), 1);
});

test('getStreak defaults the goal to 120 and rejects invalid goals', () => {
  const now = at(2026, 5, 20, 20);
  const sessions = [session(at(2026, 5, 20, 9), 120, 'today')];
  assert.equal(getStreak(sessions, undefined, now), 1);
  assert.equal(getStreak(sessions, 0, now), 1);
  assert.equal(getStreak(sessions, -5, now), 1);
  assert.equal(getStreak(sessions, Number.NaN, now), 1);
  assert.equal(getStreak(sessions, '120', now), 1);
});

test('getStreak uses the current editable goal for all historical days', () => {
  const now = at(2026, 5, 20, 20);
  const sessions = [
    session(at(2026, 5, 20, 9), 90, 'today'),
    session(at(2026, 5, 19, 9), 90, 'yesterday')
  ];
  assert.equal(getStreak(sessions, 120, now), 0);
  assert.equal(getStreak(sessions, 90, now), 2);
  assert.equal(getStreak(sessions, 60, now), 2);
});

test('does not mutate the provided sessions or their records', () => {
  const now = at(2026, 5, 20, 12);
  const sessions = [session(at(2026, 5, 20, 9), 120, 'today')];
  const snapshot = structuredClone(sessions);
  getTodayMinutes(sessions, now);
  getWeek(sessions, now);
  getStreak(sessions, 120, now);
  assert.deepEqual(sessions, snapshot);
});

test('calendar arithmetic survives DST in a controlled TZ', () => {
  const moduleUrl = new URL('../src/stats.mjs', import.meta.url).href;
  const script = `
    import { getWeek, getStreak } from ${JSON.stringify(moduleUrl)};
    const at = (y, m, d, h = 0, min = 0) => new Date(y, m - 1, d, h, min, 0, 0).getTime();

    const springNow = at(2026, 3, 8, 12);
    const spring = getWeek([], springNow).map((entry) => entry.date);
    const springExpected = ['2026-03-02', '2026-03-03', '2026-03-04', '2026-03-05', '2026-03-06', '2026-03-07', '2026-03-08'];
    if (JSON.stringify(spring) !== JSON.stringify(springExpected)) {
      throw new Error('spring week ' + JSON.stringify(spring));
    }

    const fallNow = at(2026, 11, 1, 12);
    const fall = getWeek([], fallNow).map((entry) => entry.date);
    const fallExpected = ['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01'];
    if (JSON.stringify(fall) !== JSON.stringify(fallExpected)) {
      throw new Error('fall week ' + JSON.stringify(fall));
    }

    const sessions = [
      { id: 'a', startedAt: at(2026, 3, 7, 23, 0), durationMinutes: 130, label: '' },
      { id: 'b', startedAt: at(2026, 3, 8, 1, 0), durationMinutes: 130, label: '' }
    ];
    const streak = getStreak(sessions, 120, springNow);
    if (streak !== 2) {
      throw new Error('dst streak ' + streak);
    }
    console.log('ok');
  `;

  const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
    env: { ...process.env, TZ: 'America/New_York' },
    encoding: 'utf8'
  });
  assert.equal(result.status, 0, result.stderr || 'child process failed');
  assert.match(result.stdout, /ok/);
});
