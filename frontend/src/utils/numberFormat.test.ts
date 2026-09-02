import { formatNumber, formatDecimal, formatDimension, toNum } from './numberFormat';

describe('formatNumber — trailing-zero stripping (display only)', () => {
  it('strips unnecessary trailing zeros and decimal points', () => {
    expect(formatNumber(20.5, 3)).toBe('20.5');
    expect(formatNumber(20.0, 2)).toBe('20');
    expect(formatNumber(1.65, 3)).toBe('1.65');
    expect(formatNumber(0.5, 3)).toBe('0.5');
    expect(formatNumber(1.25, 2)).toBe('1.25');
    expect(formatNumber(100, 2)).toBe('100');
  });

  it('handles PG string decimals (no fixed-precision padding)', () => {
    expect(formatNumber('20.000', 3)).toBe('20');
    expect(formatNumber('50.000000', 6)).toBe('50');
    expect(formatNumber('0.500', 3)).toBe('0.5');
    expect(formatNumber('1.650000', 6)).toBe('1.65');
  });

  it('renders a real zero as 0 (never 0.000)', () => {
    expect(formatNumber(0, 3)).toBe('0');
    expect(formatNumber(0.0, 6)).toBe('0');
  });

  it('preserves locale thousand separators', () => {
    expect(formatNumber(1234567.89, 2)).toBe('1,234,567.89');
  });

  it('supports integer precision via decimals=0 (rounds)', () => {
    expect(formatNumber(99.99, 0)).toBe('100');
  });
});

describe('formatNumber — explicit zero vs empty', () => {
  it('empty/undefined fails to a 0 display value via toNum default', () => {
    expect(toNum(undefined)).toBe(0);
    expect(toNum(null)).toBe(0);
    expect(formatNumber('bad', 2)).toBe('0');
  });

  it('distinguishes explicit zero (0) from empty — both render 0 for safety', () => {
    expect(formatNumber(0, 2)).toBe('0');
  });
});

describe('formatDecimal — fixed precision still available for specific needs', () => {
  it('keeps fixed decimals when explicitly required', () => {
    expect(formatDecimal(20.5, 2)).toBe('20.50');
    expect(formatDecimal(20.0, 2)).toBe('20.00');
  });
});

describe('formatDimension — wire size / dimensions', () => {
  it('formats dimensions to 2 decimals', () => {
    expect(formatDimension(2)).toBe('2.00');
    expect(formatDimension(1.2)).toBe('1.20');
  });

  it('renders a dash for missing dimension', () => {
    expect(formatDimension(null)).toBe('\u2014');
    expect(formatDimension(undefined)).toBe('\u2014');
  });
});
