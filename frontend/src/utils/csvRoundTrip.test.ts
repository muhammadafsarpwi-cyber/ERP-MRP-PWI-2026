import { rawNum, isoDate } from './csvRoundTrip';

describe('csvRoundTrip — raw cell writers for the pre-filled template export', () => {
  describe('rawNum (never locale-format, never emit NaN)', () => {
    it('keeps small decimals exact so weights survive the round trip', () => {
      expect(rawNum(0.0097)).toBe('0.0097');
      expect(rawNum(0.115)).toBe('0.115');
      expect(Number(rawNum(0.0097))).toBe(0.0097);
    });

    it('strips DB DECIMAL padding without a thousands separator', () => {
      expect(rawNum('120.0000')).toBe('120');
      expect(rawNum(5000)).toBe('5000');
      expect(rawNum('3000')).toBe('3000');
    });

    it('preserves a real zero instead of blanking the cell', () => {
      expect(rawNum(0)).toBe('0');
      expect(rawNum('0')).toBe('0');
    });

    it('writes blank for absent values so the importer retains the stored value', () => {
      expect(rawNum(null)).toBe('');
      expect(rawNum(undefined)).toBe('');
      expect(rawNum('')).toBe('');
    });

    it('never writes the literal NaN back into the sheet', () => {
      expect(rawNum('not-a-number')).toBe('');
      expect(rawNum(Number.NaN)).toBe('');
    });

    it('rejects a locale-formatted value rather than silently importing NaN', () => {
      // `Number('1,234.50')` is NaN — the writer must not pretend it parsed.
      expect(rawNum('1,234.50')).toBe('');
      expect(rawNum('1,234.50')).not.toContain(',');
    });

    it('always produces text the import parser reads back as a finite number', () => {
      [0.0097, 1.15, 8, 120.5, 0].forEach((v) => {
        expect(Number.isFinite(Number(rawNum(v)))).toBe(true);
      });
      expect(['', null, undefined].map((v) => rawNum(v as never))).toEqual(['', '', '']);
    });
  });

  describe('isoDate (normalise stored dates to YYYY-MM-DD)', () => {
    it('truncates an ISO timestamp to its date part', () => {
      expect(isoDate('2024-06-15T00:00:00.000Z')).toBe('2024-06-15');
    });

    it('passes an already-plain date through untouched', () => {
      expect(isoDate('2024-06-15')).toBe('2024-06-15');
      expect(isoDate('  2027-12-31  ')).toBe('2027-12-31');
    });

    it('writes blank for absent values so the importer retains the stored value', () => {
      expect(isoDate(null)).toBe('');
      expect(isoDate(undefined)).toBe('');
      expect(isoDate('')).toBe('');
    });
  });
});
