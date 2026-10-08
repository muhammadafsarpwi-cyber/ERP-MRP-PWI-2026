import {
  entryOvertimeHours,
  sumOvertime,
  OT_FROM_REMARKS_REGEX,
  OvertimeSource,
} from './overtimeHours';

/**
 * PHASE 3 — OVERTIME KPI / TABLE PARITY TESTS
 *
 * Canonical rule under test (see ./overtimeHours.ts):
 *   persisted overtime_hours → legacy remarks `OT: X h` → 0.
 *   Running hours NEVER create overtime on read.
 */

/** Any production-entry-ish row (extra fields such as runningHours are allowed). */
interface Row extends OvertimeSource {
  runningHours?: number | string | null;
}

/** The regex the backend applies before persisting overtime (create/update). */
const BACKEND_SAVE_REGEX = /OT:\s*(\d+(?:\.\d+)?)\s*h/i;

describe('Phase 3 — canonical overtime definition', () => {
  describe('entryOvertimeHours (single entry)', () => {
    it('reads the persisted overtime_hours value', () => {
      const row: Row = { overtimeHours: 2, runningHours: 10, remarks: null };
      expect(entryOvertimeHours(row)).toBe(2);
    });

    it('an entry with overtime_hours = 2 contributes exactly 2h (never 4h, never 2+8-derived)', () => {
      // The real hand-packing row: running 10h on an 8h shift, OT 2h recorded.
      const row: Row = {
        overtimeHours: 2,
        runningHours: 10,
        remarks: '[HAND PACKING] Batch: PKG-2026-0240 | OT: 2h | Cartons: 1',
      };
      expect(entryOvertimeHours(row)).toBe(2);
    });

    it('a normal 8-hour entry contributes 0h', () => {
      const row: Row = { overtimeHours: 0, runningHours: 8, remarks: null };
      expect(entryOvertimeHours(row)).toBe(0);
    });

    it('a >8-hour running entry does NOT automatically become overtime', () => {
      // Pre-fix the table showed runningHours - 8 = 4h here while the KPI
      // (SUM of overtime_hours) showed 0h.
      const row: Row = { overtimeHours: 0, runningHours: 12, remarks: null };
      expect(entryOvertimeHours(row)).toBe(0);
    });

    it('does not assume an 8h shift: 11h running on a 12h planned shift is 0h', () => {
      const row: Row = { overtimeHours: 0, runningHours: 11, remarks: 'General Shift (Night)' };
      expect(entryOvertimeHours(row)).toBe(0);
    });

    it('reads legacy remarks `OT: X h` only when the persisted column is empty', () => {
      expect(entryOvertimeHours({ overtimeHours: 0, remarks: 'Batch done | OT: 3h | Cartons: 9' })).toBe(3);
      expect(entryOvertimeHours({ overtimeHours: 0, remarks: 'OT: 2.5 h' })).toBe(2.5);
      expect(entryOvertimeHours({ overtimeHours: null, remarks: 'OT: 4H' })).toBe(4);
    });

    it('prefers the persisted column over a contradicting remark', () => {
      expect(entryOvertimeHours({ overtimeHours: 2, remarks: 'OT: 9h' })).toBe(2);
    });

    it('treats `OT: 0h` remarks and missing remarks as 0h', () => {
      expect(entryOvertimeHours({ overtimeHours: 0, remarks: 'Line stopped | OT: 0h' })).toBe(0);
      expect(entryOvertimeHours({ overtimeHours: 0, remarks: null })).toBe(0);
      expect(entryOvertimeHours({ overtimeHours: 0, remarks: 'No overtime recorded' })).toBe(0);
      expect(entryOvertimeHours(null)).toBe(0);
      expect(entryOvertimeHours(undefined)).toBe(0);
    });

    it('never returns a negative or non-finite number', () => {
      expect(entryOvertimeHours({ overtimeHours: -3, remarks: null })).toBe(0);
      expect(entryOvertimeHours({ overtimeHours: 'garbage', remarks: null })).toBe(0);
      expect(entryOvertimeHours({ overtimeHours: undefined, remarks: undefined })).toBe(0);
    });
  });

  describe('sumOvertime (KPI total = sum of table column)', () => {
    const rows: Row[] = [
      { overtimeHours: 2, runningHours: 10, remarks: 'OT: 2h' },
      { overtimeHours: 0, runningHours: 8, remarks: null },
      { overtimeHours: 0, runningHours: 12, remarks: null },
      { overtimeHours: 0, runningHours: 11, remarks: 'Batch | OT: 3h' },
      { overtimeHours: 0, runningHours: 11, remarks: null },
    ];

    it('aggregates multiple entries', () => {
      expect(sumOvertime(rows)).toBe(5);
    });

    it('KPI total === sum of the per-row table contributions (same definition)', () => {
      const perRow = rows.map((r) => entryOvertimeHours(r));
      expect(perRow).toEqual([2, 0, 0, 3, 0]);
      expect(sumOvertime(rows)).toBe(perRow.reduce((s, v) => s + v, 0));
      // The pre-fix display rule (column → remarks → runningHours - 8) totalled 12h
      // for these same rows while the KPI summed 5h.
      const legacyDisplayTotal = rows.reduce((s, r) => {
        const direct = Number(r.overtimeHours || 0);
        if (direct > 0) return s + direct;
        const m = (r.remarks || '').match(OT_FROM_REMARKS_REGEX);
        if (m) return s + Number(m[1]);
        return s + (Number(r.runningHours) > 8 ? Number(r.runningHours) - 8 : 0);
      }, 0);
      expect(legacyDisplayTotal).toBe(12);
      expect(sumOvertime(rows)).not.toBe(legacyDisplayTotal);
    });

    it('handles an empty / missing row set', () => {
      expect(sumOvertime([])).toBe(0);
      expect(sumOvertime(null)).toBe(0);
      expect(sumOvertime(undefined)).toBe(0);
    });
  });

  describe('parity with the backend save rule and KPI SQL', () => {
    const remarkForms = [
      'OT: 2h',
      'OT: 0h',
      'OT: 7.5 h',
      'ot: 4h',
      'OT:10H',
      'Batch X | OT: 3h | Cartons: 4',
      'no overtime here',
      '',
    ];

    it('the frontend rule parses exactly what the backend parses into overtime_hours', () => {
      for (const remarks of remarkForms) {
        const backend = remarks.match(BACKEND_SAVE_REGEX);
        const expected = backend ? Number(backend[1]) : 0;
        expect(entryOvertimeHours({ overtimeHours: 0, remarks })).toBe(expected);
      }
    });

    it('never derives overtime from running hours (the KPI sums the column, so neither may the table)', () => {
      const runningOnly: Row = { overtimeHours: 0, runningHours: 19, remarks: null };
      expect(entryOvertimeHours(runningOnly)).toBe(0);
      // Guard against anyone reintroducing `running - 8` in this helper.
      expect(entryOvertimeHours(runningOnly)).not.toBe(Number(runningOnly.runningHours) - 8);
    });
  });
});
