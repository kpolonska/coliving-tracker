import { state } from './state.js';

export function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Always use Europe/Kiev so every browser and the server agree on "today".
export function todayLocalDateKey() {
  return new Date().toLocaleDateString('sv', { timeZone: 'Europe/Kiev' });
}

export function toLocalDateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function formatDate(dateStr) {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day)
    .toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

export function getPersonName(id) {
  return state.people.find(p => p.id === id)?.name || 'Unknown';
}

// Builds a full date→entry map for the cleaning schedule, cascading postponements
// so each slot's next date is exactly 4 days after its actual (possibly postponed) date.
export function buildCleaningScheduleMap() {
  const { start_date, start_group_id } = state.cleaningSettings;
  if (!start_date || !start_group_id || state.cleaningGroups.length === 0) {
    return { byActual: {}, byOriginal: {} };
  }
  const startIdx = state.cleaningGroups.findIndex(g => g.id === start_group_id);
  if (startIdx === -1) return { byActual: {}, byOriginal: {} };

  const order = [
    ...state.cleaningGroups.slice(startIdx),
    ...state.cleaningGroups.slice(0, startIdx),
  ];
  const byActual = {};
  const byOriginal = {};
  let cursor = start_date;

  for (let slot = 0; slot < 500; slot++) {
    const group = order[slot % order.length];
    const postponement = state.cleaningPostponements.find(
      p => p.group_id === group.id && p.original_date === cursor
    );
    const actual = postponement ? postponement.new_date : cursor;
    const entry = { originalDateStr: cursor, actualDateStr: actual, group, postponed: !!postponement, postponementId: postponement?.id };
    byActual[actual] = entry;
    if (postponement) byOriginal[cursor] = entry;

    const [y, m, d] = actual.split('-').map(Number);
    cursor = toLocalDateKey(new Date(y, m - 1, d + 4));
  }
  return { byActual, byOriginal };
}

export function getDisplayInfoForDate(date) {
  const dateKey = toLocalDateKey(date);
  const { byActual, byOriginal } = state.scheduleMap || { byActual: {}, byOriginal: {} };

  const entry = byActual[dateKey];
  if (entry) {
    return entry.postponed
      ? { type: 'postponed-to', group: entry.group, originalDate: entry.originalDateStr, dateKey }
      : { type: 'scheduled', group: entry.group, dateKey };
  }

  const moved = byOriginal[dateKey];
  if (moved) {
    return { type: 'postponed-from', originalGroup: moved.group, newDate: moved.actualDateStr, dateKey, postponementId: moved.postponementId };
  }
  return null;
}

export function getUpcomingBirthdays() {
  const todayKey = todayLocalDateKey();
  const [ty, tm, td] = todayKey.split('-').map(Number);
  const todayMidnight = new Date(ty, tm - 1, td);

  return state.birthdays
    .map(b => {
      const [, month, day] = b.birth_date.split('-').map(Number);
      const bday = new Date(ty, month - 1, day);
      if (bday < todayMidnight) bday.setFullYear(ty + 1);
      const daysUntil = Math.round((bday - todayMidnight) / 86400000);
      return { ...b, name: getPersonName(b.person_id), daysUntil };
    })
    .filter(b => b.daysUntil <= 30)
    .sort((a, b) => a.daysUntil - b.daysUntil);
}
