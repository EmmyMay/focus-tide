const MS_DEFAULT_DAILY_GOAL = 120;

function pad(value) {
  return String(value).padStart(2, '0');
}

function isValidNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function startOfDay(epochMs) {
  const date = new Date(epochMs);
  date.setHours(0, 0, 0, 0);
  return date;
}

function addCalendarDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function normalizeGoal(dailyGoal) {
  return isValidNumber(dailyGoal) && dailyGoal > 0 ? dailyGoal : MS_DEFAULT_DAILY_GOAL;
}

function totalsByDay(sessions) {
  const totals = new Map();
  if (!Array.isArray(sessions)) {
    return totals;
  }
  for (const session of sessions) {
    if (!session || typeof session !== 'object') {
      continue;
    }
    if (!isValidNumber(session.startedAt) || !isValidNumber(session.durationMinutes)) {
      continue;
    }
    const key = getDayKey(session.startedAt);
    totals.set(key, (totals.get(key) || 0) + session.durationMinutes);
  }
  return totals;
}

export function getDayKey(epochMs) {
  const date = new Date(epochMs);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function getTodayMinutes(sessions, now) {
  return totalsByDay(sessions).get(getDayKey(now)) || 0;
}

export function getWeek(sessions, now) {
  const totals = totalsByDay(sessions);
  const todayKey = getDayKey(now);
  const anchor = startOfDay(now);
  const week = [];
  for (let offset = 6; offset >= 0; offset -= 1) {
    const key = getDayKey(addCalendarDays(anchor, -offset));
    week.push({
      date: key,
      minutes: totals.get(key) || 0,
      isToday: key === todayKey
    });
  }
  return week;
}

export function getStreak(sessions, dailyGoal = MS_DEFAULT_DAILY_GOAL, now = Date.now()) {
  const goal = normalizeGoal(dailyGoal);
  const totals = totalsByDay(sessions);
  const today = startOfDay(now);

  let cursor = today;
  if ((totals.get(getDayKey(today)) || 0) < goal) {
    cursor = addCalendarDays(today, -1);
  }

  let streak = 0;
  while ((totals.get(getDayKey(cursor)) || 0) >= goal) {
    streak += 1;
    cursor = addCalendarDays(cursor, -1);
  }
  return streak;
}
