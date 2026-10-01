const WEEKDAY_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function parseLocalDateKey(key) {
  if (typeof key !== 'string') {
    return null;
  }
  const parts = key.split('-');
  if (parts.length !== 3) {
    return null;
  }
  const [year, month, day] = parts.map(Number);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return null;
  }
  return new Date(year, month - 1, day);
}

function normalizeDays(days) {
  if (!Array.isArray(days)) {
    return [];
  }
  return days
    .filter((day) => day !== null && typeof day === 'object' && typeof day.date === 'string')
    .map((day) => ({
      date: day.date,
      minutes: typeof day.minutes === 'number' && Number.isFinite(day.minutes) && day.minutes > 0
        ? day.minutes
        : 0,
      isToday: day.isToday === true
    }));
}

function accessibleLabel(day) {
  const date = parseLocalDateKey(day.date);
  const weekday = date ? WEEKDAY_LONG[date.getDay()] : day.date;
  const unit = day.minutes === 1 ? 'minute' : 'minutes';
  return `${weekday}${day.isToday ? ' (today)' : ''}: ${day.minutes} ${unit}`;
}

export function createWeekView(container) {
  const doc = container && (container.ownerDocument || (typeof document !== 'undefined' ? document : null));
  if (!container || typeof container.appendChild !== 'function' || !doc) {
    return { update() {}, destroy() {} };
  }

  const root = doc.createElement('div');
  root.className = 'week-view';
  root.setAttribute('role', 'group');
  root.setAttribute('aria-label', 'Focused minutes over the last seven days');

  const list = doc.createElement('ul');
  list.className = 'week-view__days';
  root.appendChild(list);

  let destroyed = false;

  function update(days) {
    if (destroyed) {
      return;
    }
    const normalized = normalizeDays(days);
    const max = normalized.reduce((peak, day) => Math.max(peak, day.minutes), 0);

    while (list.firstChild) {
      list.removeChild(list.firstChild);
    }

    for (const day of normalized) {
      const date = parseLocalDateKey(day.date);
      const short = date ? WEEKDAY_SHORT[date.getDay()] : day.date;
      const percent = max > 0 ? Math.round((day.minutes / max) * 100) : 0;

      const item = doc.createElement('li');
      item.className = day.isToday ? 'week-view__day week-view__day--today' : 'week-view__day';
      item.setAttribute('aria-label', accessibleLabel(day));

      const bar = doc.createElement('div');
      bar.className = 'week-view__bar';
      bar.setAttribute('aria-hidden', 'true');

      const fill = doc.createElement('div');
      fill.className = 'week-view__fill';
      fill.style.height = `${percent}%`;
      bar.appendChild(fill);

      const value = doc.createElement('span');
      value.className = 'week-view__value';
      value.setAttribute('aria-hidden', 'true');
      value.textContent = String(day.minutes);

      const weekday = doc.createElement('span');
      weekday.className = 'week-view__weekday';
      weekday.setAttribute('aria-hidden', 'true');
      weekday.textContent = short;

      item.appendChild(bar);
      item.appendChild(value);
      item.appendChild(weekday);
      list.appendChild(item);
    }
  }

  function destroy() {
    if (destroyed) {
      return;
    }
    destroyed = true;
    while (list.firstChild) {
      list.removeChild(list.firstChild);
    }
    if (root.parentNode) {
      root.parentNode.removeChild(root);
    }
  }

  container.appendChild(root);
  update([]);

  return { update, destroy };
}
