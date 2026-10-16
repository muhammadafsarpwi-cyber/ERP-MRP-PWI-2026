import {
  entryOvertimeHours,
  sumOvertime,
  OT_FROM_REMARKS_REGEX,
  OvertimeSource,
  aggregateOperatorOvertime,
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

  describe('aggregateOperatorOvertime (multi-machine operator de-duplication)', () => {
    it('de-duplicates an operator working across multiple machines on the same date', () => {
      const entries = [
        {
          entryDate: '2026-10-14',
          operatorName: 'Arshad Ali',
          machineNo: 'M-01',
          overtimeHours: 4,
          department: { name: 'Wire Drawing' },
        },
        {
          entryDate: '2026-10-14',
          operatorName: 'Arshad Ali',
          machineNo: 'M-02',
          overtimeHours: 4,
          department: { name: 'Wire Drawing' },
        },
        {
          entryDate: '2026-10-14',
          operatorName: 'Arshad Ali',
          machineNo: 'M-03',
          overtimeHours: 4,
          department: { name: 'Wire Drawing' },
        },
      ];

      const result = aggregateOperatorOvertime(entries);

      // Total overtime should be 4h, NOT 12h
      expect(result.trueTotalOvertime).toBe(4);
      // Unique active operators should be 1, NOT 3
      expect(result.uniqueOperatorsCount).toBe(1);
      // Average OT per operator should be 4h
      expect(result.avgOtPerOperator).toBe(4);
      // Detailed breakdown has 1 record with 3 entries and all 3 machines
      expect(result.detailedBreakdown).toHaveLength(1);
      expect(result.detailedBreakdown[0].entriesCount).toBe(3);
      expect(result.detailedBreakdown[0].machines).toEqual(
        expect.arrayContaining(['M-01', 'M-02', 'M-03']),
      );
    });

    it('correctly aggregates multiple operators and dates with MAX daily overtime', () => {
      const entries = [
        // Arshad on 2026-10-14: 2 machines, 4h OT
        { entryDate: '2026-10-14', operatorName: 'Arshad Ali', machineNo: 'M-01', overtimeHours: 4 },
        { entryDate: '2026-10-14', operatorName: 'Arshad Ali', machineNo: 'M-02', overtimeHours: 4 },
        // Tariq on 2026-10-14: 1 machine, 2.5h OT
        { entryDate: '2026-10-14', operatorName: 'Tariq Mehmood', machineNo: 'M-03', overtimeHours: 2.5 },
        // Arshad on 2026-10-15: 1 machine, 3h OT
        { entryDate: '2026-10-15', operatorName: 'Arshad Ali', machineNo: 'M-01', overtimeHours: 3 },
      ];

      const result = aggregateOperatorOvertime(entries);

      // Total OT: (Arshad 10-14: 4) + (Tariq 10-14: 2.5) + (Arshad 10-15: 3) = 9.5h
      expect(result.trueTotalOvertime).toBe(9.5);
      // Unique operators: Arshad Ali, Tariq Mehmood = 2
      expect(result.uniqueOperatorsCount).toBe(2);
      // Average OT per operator: 9.5 / 2 = 4.75h rounded to 1 decimal place = 4.8h
      expect(result.avgOtPerOperator).toBe(4.8);
      // Breakdown should have 3 operator-date records
      expect(result.detailedBreakdown).toHaveLength(3);
    });

    it('handles empty entries gracefully', () => {
      const result = aggregateOperatorOvertime([]);
      expect(result.trueTotalOvertime).toBe(0);
      expect(result.uniqueOperatorsCount).toBe(0);
      expect(result.avgOtPerOperator).toBe(0);
      expect(result.detailedBreakdown).toEqual([]);
    });
  });
});
