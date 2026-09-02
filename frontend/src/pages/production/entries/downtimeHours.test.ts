import {
  deriveFromRunning, deriveFromDowntime, rebalancePair,
  effectiveRunning, effectiveDowntime,
} from './downtimeHours';

describe('downtimeHours — AUTO mode', () => {
  it('derives downtime = planned − running (8h plan, 6h running → 2h downtime)', () => {
    const pair = deriveFromRunning(6, 8, 0);
    expect(pair.runningHours).toBe(6);
    expect(pair.downtimeHours).toBe(2);
  });

  it('running + downtime always equals planned in AUTO', () => {
    for (const r of [0, 2.5, 4, 7.25, 8]) {
      const pair = deriveFromRunning(r, 8, 0);
      expect(pair.runningHours + pair.downtimeHours).toBeCloseTo(8, 5);
    }
  });

  it('clamps running to planned (never exceeds)', () => {
    const pair = deriveFromRunning(9, 8, 0);
    expect(pair.runningHours).toBe(8);
    expect(pair.downtimeHours).toBe(0);
  });

  it('rejects negative running → clamps to zero, downtime = planned', () => {
    const pair = deriveFromRunning(-2, 8, 0);
    expect(pair.runningHours).toBe(0);
    expect(pair.downtimeHours).toBe(8);
  });

  it('leaves downtime untouched when no shift plan exists (legacy)', () => {
    const pair = deriveFromRunning(4, 0, 3);
    expect(pair.runningHours).toBe(4);
    expect(pair.downtimeHours).toBe(3);
  });
});

describe('downtimeHours — MANUAL mode', () => {
  it('derives running = planned − downtime (8h plan, 3h downtime → 5h running)', () => {
    const pair = deriveFromDowntime(3, 8);
    expect(pair.downtimeHours).toBe(3);
    expect(pair.runningHours).toBe(5);
  });

  it('running + downtime always equals planned in MANUAL', () => {
    for (const d of [0, 1, 4, 6.5, 8]) {
      const pair = deriveFromDowntime(d, 8);
      expect(pair.runningHours + pair.downtimeHours).toBeCloseTo(8, 5);
    }
  });

  it('clamps downtime to planned (never exceeds)', () => {
    const pair = deriveFromDowntime(10, 8);
    expect(pair.downtimeHours).toBe(8);
    expect(pair.runningHours).toBe(0);
  });

  it('rejects negative downtime → clamps to zero, running = planned', () => {
    const pair = deriveFromDowntime(-1, 8);
    expect(pair.downtimeHours).toBe(0);
    expect(pair.runningHours).toBe(8);
  });
});

describe('downtimeHours — switching AUTO ↔ MANUAL', () => {
  it('rebalance to MANUAL keeps downtime and derives running', () => {
    const pair = rebalancePair(5, 3, 8, 'manual');
    expect(pair.downtimeHours).toBe(3);
    expect(pair.runningHours).toBe(5);
  });

  it('rebalance to AUTO keeps running and derives downtime', () => {
    const pair = rebalancePair(5, 3, 8, 'auto');
    expect(pair.runningHours).toBe(5);
    expect(pair.downtimeHours).toBe(3);
  });

  it('rebalance without a plan preserves both fields', () => {
    const pair = rebalancePair(4, 2, 0, 'manual');
    expect(pair.runningHours).toBe(4);
    expect(pair.downtimeHours).toBe(2);
  });
});

describe('downtimeHours — KPIs', () => {
  it('effectiveRunning respects the plan', () => {
    expect(effectiveRunning(5, 3, 8)).toBe(5);
    expect(effectiveDowntime(5, 3, 8)).toBe(3);
  });

  it('effective values fall back to stored values without a plan', () => {
    expect(effectiveRunning(5, 3, 0)).toBe(5);
    expect(effectiveDowntime(5, 3, 0)).toBe(3);
  });
});
