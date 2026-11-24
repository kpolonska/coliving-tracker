import { describe, it, expect, beforeEach } from 'vitest';
import { state } from '../public/js/state.js';
import {
  buildCleaningScheduleMap,
  toLocalDateKey,
  escapeHtml,
  formatDate,
} from '../public/js/utils.js';

const G1 = { id: 1, name: 'Group A', members: [1] };
const G2 = { id: 2, name: 'Group B', members: [2] };
const G3 = { id: 3, name: 'Group C', members: [3] };

function resetState() {
  state.cleaningGroups = [];
  state.cleaningSettings = { start_date: null, start_group_id: null, interval_days: 7 };
  state.cleaningPostponements = [];
  state.people = [];
}

// ── buildCleaningScheduleMap ──────────────────────────────────────────────────

describe('buildCleaningScheduleMap — early exits', () => {
  beforeEach(resetState);

  it('returns empty maps when start_date is null', () => {
    state.cleaningGroups = [G1];
    state.cleaningSettings.start_group_id = 1;
    const { byActual, byOriginal } = buildCleaningScheduleMap();
    expect(byActual).toEqual({});
    expect(byOriginal).toEqual({});
  });

  it('returns empty maps when start_group_id is null', () => {
    state.cleaningGroups = [G1];
    state.cleaningSettings.start_date = '2024-01-01';
    const { byActual } = buildCleaningScheduleMap();
    expect(byActual).toEqual({});
  });

  it('returns empty maps when cleaningGroups is empty', () => {
    state.cleaningSettings = { start_date: '2024-01-01', start_group_id: 1, interval_days: 7 };
    const { byActual } = buildCleaningScheduleMap();
    expect(byActual).toEqual({});
  });

  it('returns empty maps when start_group_id is not found in groups', () => {
    state.cleaningGroups = [G1, G2];
    state.cleaningSettings = { start_date: '2024-01-01', start_group_id: 999, interval_days: 7 };
    const { byActual } = buildCleaningScheduleMap();
    expect(byActual).toEqual({});
  });
});

describe('buildCleaningScheduleMap — interval_days', () => {
  beforeEach(resetState);

  it('places the first slot on start_date', () => {
    state.cleaningGroups = [G1];
    state.cleaningSettings = { start_date: '2024-01-01', start_group_id: 1, interval_days: 7 };
    const { byActual } = buildCleaningScheduleMap();
    expect(byActual['2024-01-01']).toBeDefined();
    expect(byActual['2024-01-01'].group).toBe(G1);
  });

  it('advances exactly 7 days between slots by default', () => {
    state.cleaningGroups = [G1];
    state.cleaningSettings = { start_date: '2024-01-01', start_group_id: 1, interval_days: 7 };
    const { byActual } = buildCleaningScheduleMap();
    expect(byActual['2024-01-01']).toBeDefined();
    expect(byActual['2024-01-08']).toBeDefined();
    expect(byActual['2024-01-15']).toBeDefined();
    expect(byActual['2024-01-05']).toBeUndefined(); // not 4-day
  });

  it('advances exactly 3 days with interval_days = 3', () => {
    state.cleaningGroups = [G1];
    state.cleaningSettings = { start_date: '2024-01-01', start_group_id: 1, interval_days: 3 };
    const { byActual } = buildCleaningScheduleMap();
    expect(byActual['2024-01-01']).toBeDefined();
    expect(byActual['2024-01-04']).toBeDefined();
    expect(byActual['2024-01-07']).toBeDefined();
    expect(byActual['2024-01-08']).toBeUndefined(); // not 7-day
  });

  it('advances exactly 14 days with interval_days = 14', () => {
    state.cleaningGroups = [G1];
    state.cleaningSettings = { start_date: '2024-01-01', start_group_id: 1, interval_days: 14 };
    const { byActual } = buildCleaningScheduleMap();
    expect(byActual['2024-01-01']).toBeDefined();
    expect(byActual['2024-01-15']).toBeDefined();
    expect(byActual['2024-01-29']).toBeDefined();
    expect(byActual['2024-01-08']).toBeUndefined(); // not 7-day
  });

  it('falls back to 7 days when interval_days is 0', () => {
    state.cleaningGroups = [G1];
    state.cleaningSettings = { start_date: '2024-01-01', start_group_id: 1, interval_days: 0 };
    const { byActual } = buildCleaningScheduleMap();
    expect(byActual['2024-01-08']).toBeDefined();
  });

  it('handles month-end crossings correctly', () => {
    state.cleaningGroups = [G1];
    state.cleaningSettings = { start_date: '2024-01-28', start_group_id: 1, interval_days: 7 };
    const { byActual } = buildCleaningScheduleMap();
    expect(byActual['2024-01-28']).toBeDefined();
    expect(byActual['2024-02-04']).toBeDefined();
    expect(byActual['2024-02-11']).toBeDefined();
  });

  it('generates exactly 500 slots', () => {
    state.cleaningGroups = [G1];
    state.cleaningSettings = { start_date: '2024-01-01', start_group_id: 1, interval_days: 7 };
    const { byActual } = buildCleaningScheduleMap();
    expect(Object.keys(byActual)).toHaveLength(500);
  });
});

describe('buildCleaningScheduleMap — group rotation', () => {
  beforeEach(resetState);

  it('rotates through all groups in order', () => {
    state.cleaningGroups = [G1, G2, G3];
    state.cleaningSettings = { start_date: '2024-01-01', start_group_id: 1, interval_days: 7 };
    const { byActual } = buildCleaningScheduleMap();
    expect(byActual['2024-01-01'].group).toBe(G1);
    expect(byActual['2024-01-08'].group).toBe(G2);
    expect(byActual['2024-01-15'].group).toBe(G3);
    expect(byActual['2024-01-22'].group).toBe(G1); // wraps back
  });

  it('starts rotation from start_group_id when it is not the first group', () => {
    state.cleaningGroups = [G1, G2, G3];
    state.cleaningSettings = { start_date: '2024-01-01', start_group_id: 2, interval_days: 7 };
    const { byActual } = buildCleaningScheduleMap();
    expect(byActual['2024-01-01'].group).toBe(G2);
    expect(byActual['2024-01-08'].group).toBe(G3);
    expect(byActual['2024-01-15'].group).toBe(G1); // wraps back to G1
    expect(byActual['2024-01-22'].group).toBe(G2);
  });

  it('assigns the same group every slot when there is only one group', () => {
    state.cleaningGroups = [G1];
    state.cleaningSettings = { start_date: '2024-01-01', start_group_id: 1, interval_days: 7 };
    const { byActual } = buildCleaningScheduleMap();
    for (const entry of Object.values(byActual)) {
      expect(entry.group).toBe(G1);
    }
  });
});

describe('buildCleaningScheduleMap — postponements', () => {
  beforeEach(resetState);

  it('moves a postponed slot to new_date in byActual', () => {
    state.cleaningGroups = [G1];
    state.cleaningSettings = { start_date: '2024-01-01', start_group_id: 1, interval_days: 7 };
    state.cleaningPostponements = [
      { id: 10, group_id: 1, original_date: '2024-01-01', new_date: '2024-01-03' },
    ];
    const { byActual } = buildCleaningScheduleMap();
    expect(byActual['2024-01-01']).toBeUndefined();
    expect(byActual['2024-01-03']).toBeDefined();
    expect(byActual['2024-01-03'].postponed).toBe(true);
  });

  it('records the original date in byOriginal', () => {
    state.cleaningGroups = [G1];
    state.cleaningSettings = { start_date: '2024-01-01', start_group_id: 1, interval_days: 7 };
    state.cleaningPostponements = [
      { id: 10, group_id: 1, original_date: '2024-01-01', new_date: '2024-01-03' },
    ];
    const { byOriginal } = buildCleaningScheduleMap();
    expect(byOriginal['2024-01-01']).toBeDefined();
  });

  it('advances cursor from actual date after a postponement', () => {
    state.cleaningGroups = [G1];
    state.cleaningSettings = { start_date: '2024-01-01', start_group_id: 1, interval_days: 7 };
    // Postponed from Jan 1 → Jan 3; next slot should be Jan 3 + 7 = Jan 10
    state.cleaningPostponements = [
      { id: 10, group_id: 1, original_date: '2024-01-01', new_date: '2024-01-03' },
    ];
    const { byActual } = buildCleaningScheduleMap();
    expect(byActual['2024-01-10']).toBeDefined(); // Jan 3 + 7
    expect(byActual['2024-01-08']).toBeUndefined(); // Jan 1 + 7 (wrong)
  });

  it('stores the postponement id on the entry', () => {
    state.cleaningGroups = [G1];
    state.cleaningSettings = { start_date: '2024-01-01', start_group_id: 1, interval_days: 7 };
    state.cleaningPostponements = [
      { id: 42, group_id: 1, original_date: '2024-01-01', new_date: '2024-01-03' },
    ];
    const { byActual } = buildCleaningScheduleMap();
    expect(byActual['2024-01-03'].postponementId).toBe(42);
  });

  it('only postpones the matching group, not others', () => {
    state.cleaningGroups = [G1, G2];
    state.cleaningSettings = { start_date: '2024-01-01', start_group_id: 1, interval_days: 7 };
    state.cleaningPostponements = [
      { id: 10, group_id: 1, original_date: '2024-01-01', new_date: '2024-01-03' },
    ];
    const { byActual } = buildCleaningScheduleMap();
    // cursor cascades from actual (Jan 3), so G2's slot is Jan 3 + 7 = Jan 10
    expect(byActual['2024-01-10']).toBeDefined();
    expect(byActual['2024-01-10'].postponed).toBe(false);
    expect(byActual['2024-01-10'].group).toBe(G2);
    expect(byActual['2024-01-08']).toBeUndefined(); // Jan 1 + 7 never appears
  });
});

// ── toLocalDateKey ────────────────────────────────────────────────────────────

describe('toLocalDateKey', () => {
  it('formats dates as YYYY-MM-DD', () => {
    expect(toLocalDateKey(new Date(2024, 0, 1))).toBe('2024-01-01');
    expect(toLocalDateKey(new Date(2024, 11, 31))).toBe('2024-12-31');
  });

  it('zero-pads single-digit month and day', () => {
    expect(toLocalDateKey(new Date(2024, 2, 5))).toBe('2024-03-05');
  });

  it('handles arithmetic that crosses month boundaries', () => {
    // new Date(2024, 0, 28 + 7) = Feb 4
    expect(toLocalDateKey(new Date(2024, 0, 35))).toBe('2024-02-04');
  });
});

// ── escapeHtml ────────────────────────────────────────────────────────────────

describe('escapeHtml', () => {
  it('escapes < and >', () => {
    expect(escapeHtml('<script>')).toBe('&lt;script&gt;');
  });

  it('escapes &', () => {
    expect(escapeHtml('a & b')).toBe('a &amp; b');
  });

  it('escapes double quotes', () => {
    expect(escapeHtml('"hello"')).toBe('&quot;hello&quot;');
  });

  it('leaves safe strings unchanged', () => {
    expect(escapeHtml('hello world')).toBe('hello world');
  });

  it('coerces non-strings to string first', () => {
    expect(escapeHtml(123)).toBe('123');
    expect(escapeHtml(null)).toBe('null');
  });
});

// ── formatDate ────────────────────────────────────────────────────────────────

describe('formatDate', () => {
  it('returns a readable date string', () => {
    // Just check it includes the day number and doesn't throw
    const result = formatDate('2024-03-15');
    expect(result).toContain('15');
  });

  it('handles first and last day of year', () => {
    expect(formatDate('2024-01-01')).toContain('1');
    expect(formatDate('2024-12-31')).toContain('31');
  });
});
