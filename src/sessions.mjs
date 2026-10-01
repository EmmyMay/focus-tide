// DOM-free log of completed focus sessions.
// A session record is { id: string, startedAt: epochMs, durationMinutes: number, label: string }.

export const MAX_LABEL_LENGTH = 120;

export function normalizeLabel(label) {
  if (typeof label !== 'string') return '';
  const oneLine = label.replace(/\s+/g, ' ').trim();
  return Array.from(oneLine).slice(0, MAX_LABEL_LENGTH).join('').trimEnd();
}

function isCancelled(record) {
  return record.cancelled === true || record.status === 'cancelled';
}

// Returns a fresh, normalized record, or null when the input is not a loggable session.
export function normalizeSession(record) {
  if (record === null || typeof record !== 'object' || Array.isArray(record)) return null;
  if (isCancelled(record)) return null;

  const { id, startedAt, durationMinutes } = record;
  if (typeof id !== 'string' || id.trim() === '') return null;
  if (!Number.isSafeInteger(startedAt) || startedAt < 0) return null;
  if (typeof durationMinutes !== 'number' || !Number.isFinite(durationMinutes) || durationMinutes <= 0) {
    return null;
  }

  return { id, startedAt, durationMinutes, label: normalizeLabel(record.label) };
}

// Validates, deduplicates by id (first occurrence wins) and orders by start time.
export function normalizeSessions(sessions) {
  if (!Array.isArray(sessions)) return [];
  const seen = new Set();
  const result = [];
  for (const candidate of sessions) {
    const session = normalizeSession(candidate);
    if (!session || seen.has(session.id)) continue;
    seen.add(session.id);
    result.push(session);
  }
  return result.sort((a, b) => a.startedAt - b.startedAt);
}

// Returns a new list; the input list and record are never mutated.
// Invalid, cancelled and already-logged records leave the list unchanged.
export function appendSession(sessions, record) {
  return normalizeSessions([...(Array.isArray(sessions) ? sessions : []), record]);
}
