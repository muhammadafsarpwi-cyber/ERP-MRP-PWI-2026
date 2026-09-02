import {
  deriveFromRunning, deriveFromDowntime, rebalancePair,
  effectiveRunning, effectiveDowntime, sumDowntimeLines,
  sumProductionLines, productionTotalsByUom, lineToKg, aggregateProductionTotals,
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

describe('downtimeHours — multi-line downtime total', () => {
  it('sums all downtime line hours (1 + 1 + 1 = 3)', () => {
    const total = sumDowntimeLines([
      { downtimeHours: 1 },
      { downtimeHours: 1 },
      { downtimeHours: 1 },
    ]);
    expect(total).toBe(3);
  });

  it('returns 0 for empty/missing lines', () => {
    expect(sumDowntimeLines([])).toBe(0);
    expect(sumDowntimeLines(null)).toBe(0);
    expect(sumDowntimeLines(undefined)).toBe(0);
  });

  it('treats missing hours on a line as 0', () => {
    expect(sumDowntimeLines([{ downtimeHours: 2 }, {}, { downtimeHours: 0.5 }])).toBe(2.5);
  });

  it('rounds the total to 2 decimals', () => {
    expect(sumDowntimeLines([{ downtimeHours: 0.333 }, { downtimeHours: 0.333 }])).toBe(0.67);
  });

  it('SCENARIO A: Maintenance 1h + Power Failure 1h + Material Shortage 1h = 3h downtime', () => {
    const total = sumDowntimeLines([{ downtimeHours: 1 }, { downtimeHours: 1 }, { downtimeHours: 1 }]);
    expect(total).toBe(3);
  });

  it('SCENARIO A: Planned 8h − total downtime 3h → running 5h (MANUAL)', () => {
    const pair = deriveFromDowntime(3, 8);
    expect(pair.downtimeHours).toBe(3);
    expect(pair.runningHours).toBe(5);
  });

  it('SCENARIO A: fractional lines 1 + 0.5 + 1.5 = 3h downtime', () => {
    const total = sumDowntimeLines([{ downtimeHours: 1 }, { downtimeHours: 0.5 }, { downtimeHours: 1.5 }]);
    expect(total).toBe(3);
  });

  it('total downtime can never exceed planned hours', () => {
    const pair = deriveFromDowntime(12, 8);
    expect(pair.downtimeHours).toBe(8);
    expect(pair.runningHours).toBe(0);
  });

  it('running hours can never become negative', () => {
    expect(deriveFromDowntime(8, 8).runningHours).toBe(0);
    expect(deriveFromDowntime(20, 8).runningHours).toBe(0);
  });
});

describe('downtimeHours — production line totals', () => {
  it('sums production quantities across lines', () => {
    expect(sumProductionLines([{ quantity: 100 }, { quantity: 200 }, { quantity: 50 }])).toBe(350);
  });

  it('falls back to actualQuantity when quantity is absent', () => {
    expect(sumProductionLines([{ actualQuantity: 10 }, { actualQuantity: 20 }])).toBe(30);
  });

  it('returns 0 for empty lines', () => {
    expect(sumProductionLines([])).toBe(0);
  });
});

describe('downtimeHours — production totals grouped by UOM (never mix units)', () => {
  it('groups quantities by uomId so M and KG are never added', () => {
    const grouped = productionTotalsByUom([
      { quantity: 25, uomId: 'uom-m' },
      { quantity: 10, uomId: 'uom-m' },
      { quantity: 5, uomId: 'uom-kg' },
    ]);
    expect(grouped).toEqual([
      { uomId: 'uom-m', total: 35, count: 2 },
      { uomId: 'uom-kg', total: 5, count: 1 },
    ]);
  });
});

describe('downtimeHours — lineToKg (family-aware KG conversion)', () => {
  const meterItem = { uomType: 'LENGTH', weightPerMeter: 2 };
  it('LENGTH → kg = qty × weightPerMeter (25 M × 2 = 50 KG)', () => {
    expect(lineToKg(25, meterItem)).toBe(50);
  });

  it('WEIGHT stays as-is (already KG, no conversion)', () => {
    expect(lineToKg(25, { uomType: 'WEIGHT', weightPerMeter: 2 })).toBe(25);
  });

  it('COUNT → kg via weightPerPiece', () => {
    expect(lineToKg(10, { uomType: 'COUNT', weightPerPiece: 0.5 })).toBe(5);
  });

  it('COUNT → kg via piecesPerKg (100 pcs ÷ 10 pcs/kg = 10 kg)', () => {
    expect(lineToKg(100, { uomType: 'COUNT', piecesPerKg: 10 })).toBe(10);
  });

  it('never mixes M and KG: no fabricated conversion when data is missing', () => {
    expect(lineToKg(5, { uomType: 'COUNT' })).toBeNull();
    expect(lineToKg(5, { uomType: 'LENGTH' })).toBeNull();
    expect(lineToKg(5, { uomType: 'VOLUME' })).toBeNull();
  });

  it('returns null when there is no item family context', () => {
    expect(lineToKg(5, null)).toBeNull();
  });
});

describe('downtimeHours — aggregateProductionTotals (comparable-unit rejection %)', () => {
  it('Item A 20 KG + Item B 30 KG, rejection 1 KG → 50 KG total, 1.96% rejection', () => {
    const agg = aggregateProductionTotals([
      { actualQuantity: 20, scrapQuantity: 0, item: { uomType: 'WEIGHT' } },
      { actualQuantity: 30, scrapQuantity: 1, item: { uomType: 'WEIGHT' } },
    ]);
    expect(agg.totalKg).toBe(50);
    expect(agg.totalRejectionKg).toBe(1);
    expect(agg.rejectionPct).toBeCloseTo(1.96, 2);
  });

  it('mixes KG and METER lines WITHOUT summing raw units for rejection %', () => {
    // 20 KG (WEIGHT) + 30 METER (@2 kg/m = 60 KG); 0.5 METER scrap (@2 = 1 KG)
    const agg = aggregateProductionTotals([
      { actualQuantity: 20, scrapQuantity: 0, item: { uomType: 'WEIGHT' } },
      { actualQuantity: 30, scrapQuantity: 0.5, item: { uomType: 'LENGTH', weightPerMeter: 2 } },
    ]);
    expect(agg.totalKg).toBe(60 + 20); // 80 KG comparable production
    expect(agg.totalRejectionKg).toBe(1);
    // Comparable total = 80 + 1 = 81 KG → 1/81 ≈ 1.23% (NOT raw-unit 1/50 mixed)
    expect(agg.rejectionPct).toBeCloseTo(1.23, 2);
  });

  it('rejects at 0% when nothing is produced', () => {
    const agg = aggregateProductionTotals([
      { actualQuantity: 0, scrapQuantity: 0, item: { uomType: 'WEIGHT' } },
    ]);
    expect(agg.totalKg).toBe(0);
    expect(agg.rejectionPct).toBe(0);
  });

  it('includes only KG-comparable lines in the rejection % subset', () => {
    // A length line with no weight-per-meter conversion is excluded from the KG
    // subset, so numerator and denominator stay comparable.
    const agg = aggregateProductionTotals([
      { actualQuantity: 10, scrapQuantity: 2, item: { uomType: 'WEIGHT' } },
      { actualQuantity: 50, scrapQuantity: 5, item: { uomType: 'LENGTH' } }, // no weightPerMeter → null
    ]);
    expect(agg.totalKg).toBe(10);
    expect(agg.totalRejectionKg).toBe(2);
    expect(agg.rejectionPct).toBeCloseTo(2 / 12 * 100, 2); // ≈ 16.67% (comparable subset only)
  });
});
