import { BadRequestException } from '@nestjs/common';
import {
  businessDayStartUtc,
  businessDayWindow,
  nextBusinessDate,
  parseBusinessDate,
} from './business-day';

describe('business-day date semantics (TASK #39)', () => {
  describe('production entry business date interpretation', () => {
    it('the SAME calendar date begins at a different instant per company timezone', () => {
      // Business day 2026-09-06 in the company timezone (Asia/Karachi) starts
      // at 2026-09-05T19:00:00.000Z (midnight PKT); under the legacy UTC
      // convention it starts at 2026-09-06T00:00:00.000Z.
      expect(businessDayStartUtc('2026-09-06', 'Asia/Karachi').toISOString()).toBe('2026-09-05T19:00:00.000Z');
      expect(businessDayStartUtc('2026-09-06', 'UTC').toISOString()).toBe('2026-09-06T00:00:00.000Z');
    });

    it('parses a strict YYYY-MM-DD business date', () => {
      expect(parseBusinessDate('2026-09-06')).toEqual({ year: 2026, month: 9, day: 6 });
    });

    it('rejects non-YYYY-MM-DD and impossible calendar values', () => {
      expect(() => parseBusinessDate('06-09-2026')).toThrow(BadRequestException);
      expect(() => parseBusinessDate('2026-13-01')).toThrow(BadRequestException);
      expect(() => parseBusinessDate('2026-09-32')).toThrow(BadRequestException);
    });

    it('nextBusinessDate rolls over month/year', () => {
      expect(nextBusinessDate('2026-09-06')).toBe('2026-09-07');
      expect(nextBusinessDate('2026-09-30')).toBe('2026-10-01');
      expect(nextBusinessDate('2026-12-31')).toBe('2027-01-01');
    });
  });

  describe('Pakistan timezone UTC-boundary window', () => {
    it('business day 2026-09-06 in Asia/Karachi spans [2026-09-05T19:00Z, 2026-09-06T19:00Z)', () => {
      const w = businessDayWindow('2026-09-06', '2026-09-06', 'Asia/Karachi');
      expect(w.start!.toISOString()).toBe('2026-09-05T19:00:00.000Z');
      expect(w.end!.toISOString()).toBe('2026-09-06T19:00:00.000Z');
    });
  });

  describe('dateFrom / dateTo mapping', () => {
    it('dateFrom alone yields only an inclusive start', () => {
      const w = businessDayWindow('2026-09-08', undefined, 'Asia/Karachi');
      expect(w.start!.toISOString()).toBe('2026-09-07T19:00:00.000Z');
      expect(w.end).toBeNull();
    });

    it('dateTo alone yields only an exclusive (next-day start) end', () => {
      const w = businessDayWindow(undefined, '2026-09-08', 'Asia/Karachi');
      expect(w.start).toBeNull();
      expect(w.end!.toISOString()).toBe('2026-09-08T19:00:00.000Z');
    });

    it('no dates yields an empty window', () => {
      expect(businessDayWindow()).toEqual({ start: null, end: null });
    });

    it('a multi-day window ends at the day after dateTo', () => {
      const w = businessDayWindow('2026-09-06', '2026-09-08', 'Asia/Karachi');
      expect(w.start!.toISOString()).toBe('2026-09-05T19:00:00.000Z');
      expect(w.end!.toISOString()).toBe('2026-09-08T19:00:00.000Z');
    });
  });

  describe('inclusive/exclusive boundary behavior', () => {
    it('start instant is INSIDE the window, end instant is OUTSIDE', () => {
      const w = businessDayWindow('2026-09-06', '2026-09-06', 'Asia/Karachi') as { start: Date; end: Date };
      const includes = (iso: string) => {
        const t = Date.parse(iso);
        return t >= w.start.getTime() && t < w.end.getTime();
      };
      // 2026-09-06 00:00:00.000 PKT — the instant a posting at midnight PKT lands.
      expect(includes('2026-09-05T19:00:00.000Z')).toBe(true);
      // 2026-09-06 01:00:00.000 PKT (just after midnight in Pakistan).
      expect(includes('2026-09-05T20:00:00.000Z')).toBe(true);
      // Next business-day start — must be excluded, never double-counted.
      expect(includes('2026-09-06T19:00:00.000Z')).toBe(false);
      expect(includes('2026-09-06T19:00:00.000001Z'.slice(0, -3) + 'Z')).toBe(false);
      // Previous business day — excluded.
      expect(includes('2026-09-05T18:59:59.999Z')).toBe(false);
    });

    it('an instant one microsecond before midnight is not lost (no .999 truncation)', () => {
      const w = businessDayWindow('2026-09-06', '2026-09-06', 'Asia/Karachi') as { start: Date; end: Date };
      // timestamptz(6) at 2026-09-06 23:59:59.999999 PKT is inside the window
      // because the upper bound is the NEXT day's start (exclusive), not 23:59:59.999.
      expect(Date.parse('2026-09-06T18:59:59.999999Z') >= w.start.getTime()).toBe(true);
      expect(Date.parse('2026-09-06T18:59:59.999999Z') < w.end.getTime()).toBe(true);
    });
  });
});