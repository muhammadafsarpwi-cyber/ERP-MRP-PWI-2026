import {
  buildXlsx,
  CHAIN_REGISTRY,
  buildChainGrid,
  bucketDailyProduction,
  crc32,
  fmtKg,
  fmtQty,
} from './ItemWiseProductionLedger';

/** Minimal stand-in for the `GET /production/inventory-report` row payload. */
const reportRow = (
  itemCode: string,
  uomCode: string,
  openingBalance: number,
  totalIn: number,
  totalOut = 0,
) => ({
  itemId: itemCode,
  itemCode,
  itemName: `name-${itemCode}`,
  itemType: 'WORK_IN_PROGRESS',
  uomCode,
  openingBalance,
  totalIn,
  totalOut,
  scrapOut: 0,
  closingBalance: 0,
  onHand: 0,
});

const butted = CHAIN_REGISTRY.find((c) => c.fgItemCode === 'SPI-FG-SPK-002' || c.key.includes('250x17-butted'))!;
const straight = CHAIN_REGISTRY.find((c) => c.fgItemCode === 'SPI-FG-SPK-006' || c.key.includes('300x17-straight'))!;

describe('ItemWiseProductionLedger — smart decimal formatting (§1)', () => {
  it('renders PCS / GRS as whole integers', () => {
    expect(fmtQty(62779, 'PCS')).toBe('62779');
    expect(fmtQty(62779.0, 'PCS')).toBe('62779');
    expect(fmtQty(62779.4, 'PCS')).toBe('62779');
    expect(fmtQty(62779.6, 'GRS')).toBe('62780');
    expect(fmtQty(0, 'PCS')).toBe('0');
    expect(fmtQty(null, 'PCS')).toBe('—');
  });

  it('drops trailing zeros on KG / weight columns but keeps real fractions', () => {
    expect(fmtKg(607.0)).toBe('607');
    expect(fmtKg(607)).toBe('607');
    expect(fmtKg(442.92)).toBe('442.92');
    expect(fmtKg(442.9)).toBe('442.9');
    expect(fmtQty(607.0, 'KG')).toBe('607');
    expect(fmtQty(442.92, 'KG')).toBe('442.92');
    // The integer part must never be trimmed: `100` stays `100`.
    expect(fmtKg(100)).toBe('100');
    expect(fmtKg(0)).toBe('0');
    expect(fmtKg(undefined)).toBe('—');
  });
});

describe('ItemWiseProductionLedger — butted chain pipeline (§2, §3)', () => {
  const rows = [
    reportRow('RM-WIRE-009', 'KG', 1000, 0),
    reportRow('WIP-ST-001', 'PCS', 0, 40000),
    reportRow('WIP-SW-001', 'PCS', 0, 40000),
    reportRow('WIP-SP-001', 'PCS', 0, 16560),
    reportRow('WIP-SP-002', 'PCS', 0, 16560),
    reportRow('WIP-SPL-001', 'PCS', 20626, 16560),
    reportRow('WIP-SPL-002', 'PCS', 12497, 16560),
    reportRow('SPI-FG-SPK-002', 'GRS', 0, 16560),
  ];
  const weights: Record<string, number | null> = {
    'WIP-ST-001': 0.00967,
    'WIP-SPL-001': 0.00929,
    'WIP-SPL-002': 0.00925,
  };
  const grid = buildChainGrid(butted, rows as any, {}, weights);
  const at = (code: string) => grid.rows.find((r) => r.itemCode === code)!;

  it('declares the full 9-row sequence', () => {
    expect(grid.rows).toHaveLength(9);
    expect(grid.summary.found).toBe(8);
    expect(grid.summary.missingCodes).toEqual(['SPI-FG-SPK-002-DISP']);
  });

  it('forces FG ÷ 2 into BOTH PL rows and depletes their closing', () => {
    expect(at('SPI-FG-SPK-002').production).toBe(16560);
    expect(at('WIP-SPL-001').issuance).toBe(8280);
    expect(at('WIP-SPL-002').issuance).toBe(8280);
    expect(at('WIP-SPL-001').closingPieces).toBe(20626 + 16560 - 8280);
    expect(at('WIP-SPL-002').closingPieces).toBe(12497 + 16560 - 8280);
    expect(at('WIP-SPL-001').totalWeight).toBeCloseTo((20626 + 16560 - 8280) * 0.00929, 4);
  });

  it('drives every non-terminal stage from its successor', () => {
    expect(at('WIP-SP-001').issuance).toBe(16560); // = PL Inner production
    expect(at('WIP-SP-002').issuance).toBe(16560);
    expect(at('WIP-SW-001').issuance).toBe(33120); // = SP Inner + SP Outer
    expect(at('WIP-ST-001').issuance).toBe(40000); // = SW production
    expect(at('RM-WIRE-009').issuance).toBeCloseTo(40000 * 0.00967, 4); // KG conversion
    expect(grid.summary.undriven).toEqual([]);
    expect(grid.summary.balanced).toBe(true);
  });
});

describe('ItemWiseProductionLedger — SW bypass on straight-spoke chains (§6)', () => {
  const rows = [
    reportRow('RM-WIRE-012', 'KG', 500, 0),
    reportRow('WIP-ST-003', 'PCS', 0, 20000),
    reportRow('WIP-ST-004', 'PCS', 0, 20000),
    reportRow('WIP-SP-013', 'PCS', 0, 9000),
    reportRow('WIP-SP-014', 'PCS', 0, 9000),
    reportRow('WIP-SPL-013', 'PCS', 0, 9000),
    reportRow('WIP-SPL-014', 'PCS', 0, 9000),
    reportRow('SPI-FG-SPK-006', 'PCS', 0, 18000),
  ];
  const weights: Record<string, number | null> = {
    'WIP-ST-003': 0.01261,
    'WIP-ST-004': 0.0125,
  };
  const grid = buildChainGrid(straight, rows as any, {}, weights);
  const at = (code: string) => grid.rows.find((r) => r.itemCode === code)!;

  it('skips the absent SW row without breaking the pipeline', () => {
    expect(grid.rows).toHaveLength(9);
    expect(grid.rows.some((r) => r.stage === 'SW')).toBe(false);
    expect(grid.summary.undriven).toEqual([]);
    expect(grid.summary.balanced).toBe(true);
  });

  it('routes ST straight through to SP', () => {
    expect(at('WIP-ST-003').issuance).toBe(9000); // SP Inner production
    expect(at('WIP-ST-004').issuance).toBe(9000); // SP Outer production
    expect(at('WIP-SP-013').issuance).toBe(9000); // PL Inner production
    expect(at('WIP-SPL-013').issuance).toBe(9000); // FG ÷ 2
    expect(at('WIP-SPL-014').issuance).toBe(9000);
    expect(at('RM-WIRE-012').issuance).toBeCloseTo(20000 * 0.01261 + 20000 * 0.0125, 4);
  });
});

/** Adds the automated-consumption figure the backend reports (drives `nonProdOut`). */
const consumedRow = (
  itemCode: string,
  uomCode: string,
  openingBalance: number,
  totalIn: number,
  totalOut: number,
  consumed: number,
) => ({ ...reportRow(itemCode, uomCode, openingBalance, totalIn, totalOut), consumed });

/**
 * §GHOST — live report, 2026-10-01..2026-10-09. PL Outer carried a legacy
 * stock-ledger OUT of 102,691 KG (119,251 out − 16,560 automated
 * consumption) while the Hand Packing / Dispatch rows downstream of it held
 * no material at all. That number was painted into the ISSUANCE tray with a
 * red "Return Out" tag even though nothing had been received downstream.
 */
describe('ItemWiseProductionLedger — ghost issuance suppression (§GHOST)', () => {
  const weights: Record<string, number | null> = {
    'WIP-ST-001': 0.00967,
    'WIP-SPL-001': 0.00929,
    'WIP-SPL-002': 0.00925,
  };

  it('withholds both PL issuances when the successor stage holds no material', () => {
    const grid = buildChainGrid(
      butted,
      [
        reportRow('RM-WIRE-009', 'KG', 1000, 0),
        reportRow('WIP-ST-001', 'PCS', 0, 40000),
        reportRow('WIP-SW-001', 'PCS', 0, 40000),
        reportRow('WIP-SP-001', 'PCS', 0, 16560),
        reportRow('WIP-SP-002', 'PCS', 0, 16560),
        consumedRow('WIP-SPL-001', 'PCS', 20626, 16560, 189271, 16560), // 172,711 non-production OUT
        consumedRow('WIP-SPL-002', 'PCS', 12497, 16560, 119251, 16560), // 102,691 non-production OUT
        reportRow('SPI-FG-SPK-002', 'GRS', 0, 0), // FG / Hand Packing — completely inert
      ] as any,
      {},
      weights,
    );
    const at = (code: string) => grid.rows.find((r) => r.itemCode === code)!;

    for (const code of ['WIP-SPL-001', 'WIP-SPL-002']) {
      const pl = at(code);
      expect(pl.suppressed).toBe(true);
      expect(pl.issuance).toBe(0);
      expect(pl.prodValue).toBe(0);
      expect(pl.returnOutValue).toBe(0); // no "Return Out" tag either
      expect(pl.remarks).toBe('—');
      expect(pl.issuanceRule).toContain('holds no material');
    }

    // Withholding the ghost keeps the row's own balance intact.
    expect(at('WIP-SPL-001').closingPieces).toBe(20626 + 16560);
    expect(at('WIP-SPL-002').closingPieces).toBe(12497 + 16560);
    expect(grid.summary.balanced).toBe(true);
    // A deliberate suppression is not a "driver unavailable" condition.
    expect(grid.summary.undriven).toEqual([]);
  });

  it('stops the "driver unavailable" fallback from publishing the raw OUT figure', () => {
    // Same chain, but the FG item is absent from the report altogether —
    // the path that used to fall back to `recordedOut` (189,271).
    const grid = buildChainGrid(
      butted,
      [
        reportRow('RM-WIRE-009', 'KG', 1000, 0),
        reportRow('WIP-ST-001', 'PCS', 0, 40000),
        reportRow('WIP-SW-001', 'PCS', 0, 40000),
        reportRow('WIP-SP-001', 'PCS', 0, 16560),
        reportRow('WIP-SP-002', 'PCS', 0, 16560),
        consumedRow('WIP-SPL-001', 'PCS', 20626, 16560, 189271, 16560),
        consumedRow('WIP-SPL-002', 'PCS', 12497, 16560, 119251, 16560),
      ] as any,
      {},
      weights,
    );
    const at = (code: string) => grid.rows.find((r) => r.itemCode === code)!;

    expect(at('WIP-SPL-001').suppressed).toBe(true);
    expect(at('WIP-SPL-001').issuance).toBe(0); // was 189271
    expect(at('WIP-SPL-002').suppressed).toBe(true);
    expect(at('WIP-SPL-002').issuance).toBe(0); // was 119251
    expect(grid.summary.missingCodes).toContain('SPI-FG-SPK-002');
    expect(grid.summary.balanced).toBe(true);
  });

  it('still surfaces a real outflow when the successor stage is live', () => {
    const grid = buildChainGrid(
      butted,
      [
        reportRow('RM-WIRE-009', 'KG', 1000, 0),
        reportRow('WIP-ST-001', 'PCS', 0, 40000),
        reportRow('WIP-SW-001', 'PCS', 0, 40000),
        reportRow('WIP-SP-001', 'PCS', 0, 16560),
        reportRow('WIP-SP-002', 'PCS', 0, 16560),
        consumedRow('WIP-SPL-001', 'PCS', 20626, 16560, 25000, 16560), // 8,440 outflow
        consumedRow('WIP-SPL-002', 'PCS', 12497, 16560, 0, 0),
        reportRow('SPI-FG-SPK-002', 'GRS', 0, 16560), // live downstream
      ] as any,
      {},
      weights,
    );
    const at = (code: string) => grid.rows.find((r) => r.itemCode === code)!;

    const inner = at('WIP-SPL-001');
    expect(inner.suppressed).toBe(false);
    expect(inner.prodValue).toBe(8280); // FG ÷ 2
    expect(inner.returnOutValue).toBe(8440);
    expect(inner.issuance).toBe(8280 + 8440);
    expect(inner.remarks).not.toBe('—');
    expect(at('WIP-SPL-002').issuance).toBe(8280);
    expect(grid.summary.balanced).toBe(true);
  });

  it('judges each split side against its OWN successor row', () => {
    const grid = buildChainGrid(
      butted,
      [
        reportRow('RM-WIRE-009', 'KG', 1000, 0),
        reportRow('WIP-ST-001', 'PCS', 0, 40000),
        reportRow('WIP-SW-001', 'PCS', 0, 40000),
        reportRow('WIP-SP-001', 'PCS', 0, 5000),
        reportRow('WIP-SP-002', 'PCS', 0, 5000),
        reportRow('WIP-SPL-001', 'PCS', 0, 0), // PL Inner — inert
        reportRow('WIP-SPL-002', 'PCS', 0, 9000), // PL Outer — live
        reportRow('SPI-FG-SPK-002', 'GRS', 0, 18000),
      ] as any,
      {},
      weights,
    );
    const at = (code: string) => grid.rows.find((r) => r.itemCode === code)!;

    expect(at('WIP-SP-001').suppressed).toBe(true); // feeds PL Inner, which is inert
    expect(at('WIP-SP-001').issuance).toBe(0);
    expect(at('WIP-SP-002').suppressed).toBe(false); // feeds PL Outer, which is live
    expect(at('WIP-SP-002').issuance).toBe(9000);
    expect(grid.summary.balanced).toBe(true);
  });
});

describe('ItemWiseProductionLedger — Excel export writer (§4)', () => {
  it('produces the standard CRC32 check value', () => {
    expect(crc32(new Uint8Array(Buffer.from('123456789', 'ascii')))).toBe(0xcbf43926);
  });

  it('writes a structurally valid .xlsx package', () => {
    const bytes = new Uint8Array(
      buildXlsx(
        [
          ['Item-Wise Production Ledger'],
          ['As-On (End Date)', '2026-10-06', 'Month window', '2026-10-01 to 2026-10-06'],
          [],
          ['Stage', 'Item Code', 'Item Name', 'Op Balance', 'Production', 'Closing Pieces'],
          ['RM — RM Stage', 'RM-WIRE-009', 'Steel Wire Coil 3.14 mm R & Coated', 607, 12.5, 594.5],
          ['PL (Inner) — PL Stage', 'WIP-SPL-001', 'CD-250*17 Inner', 20626, 0, 12345],
        ],
        'Item-Wise Ledger',
      ),
    );
    // Local file header + end-of-central-directory signatures.
    expect(Buffer.from(bytes).readUInt32LE(0)).toBe(0x04034b50);
    expect(Buffer.from(bytes).readUInt32LE(bytes.length - 22)).toBe(0x06054b50);
    expect(bytes.length).toBeGreaterThan(500);
  });
});

describe('ItemWiseProductionLedger — registry contract', () => {
  it('every registered chain renders valid rows with no blank item codes', () => {
    CHAIN_REGISTRY.forEach((def) => {
      expect(def.rows.length).toBeGreaterThanOrEqual(9);
      def.rows.forEach((r) => expect(r.itemCode.trim()).not.toBe(''));
      const grid = buildChainGrid(def, [], {}, {});
      expect(grid.rows).toHaveLength(def.rows.length);
      expect(grid.summary.balanced).toBe(true);
    });
  });
});

/**
 * Stand-in for a `GET /production/entries` row: ONE parent record whose
 * `actualQuantity` is the document total, plus its per-part OUTPUT children.
 * The reported corruption: the 113,500 total was attributed to the lead part
 * alone while its sibling was left at 0.
 */
const entryRow = (over: Record<string, any> = {}) => ({
  id: 'PE-2026-TEST',
  entryDate: '2026-10-09T12:00:00.000Z',
  isActive: true,
  item: { itemCode: 'WIP-SP-002' },
  actualQuantity: 113500,
  nestedItems: [] as Array<{ itemCode: string; actualQuantity: number }>,
  ...over,
});

const onlyBucket = (map: Map<string, Map<string, number>>): Map<string, number> =>
  map.get([...map.keys()][0])!;

describe('ItemWiseProductionLedger — multi-item row isolation (§item-lots)', () => {
  it('splits a 2-item document across its children instead of the pooled parent total', () => {
    const bucket = onlyBucket(
      bucketDailyProduction([
        entryRow({
          nestedItems: [
            { itemCode: 'WIP-SP-002', actualQuantity: 83500 },
            { itemCode: 'WIP-SP-001', actualQuantity: 30000 },
          ],
        }),
      ]),
    );

    // Each part keeps its own baseline; the lead part is NOT inflated to the
    // document total and its sibling is NOT left at 0.
    expect(bucket.get('WIP-SP-002')).toBe(83500);
    expect(bucket.get('WIP-SP-001')).toBe(30000);
    expect([...bucket.values()].some((v) => v === 113500)).toBe(false);
    expect([...bucket.values()].reduce((s, v) => s + v, 0)).toBe(113500);
  });

  it('gives a 3-item document three independent contributions', () => {
    const bucket = onlyBucket(
      bucketDailyProduction([
        entryRow({
          item: { itemCode: 'WIP-SPL-013' },
          actualQuantity: 31168,
          nestedItems: [
            { itemCode: 'WIP-SPL-013', actualQuantity: 18388 },
            { itemCode: 'WIP-SPL-014', actualQuantity: 10500 },
            { itemCode: 'WIP-SPL-001', actualQuantity: 2280 },
          ],
        }),
      ]),
    );

    expect([...bucket.keys()].sort()).toEqual(['WIP-SPL-001', 'WIP-SPL-013', 'WIP-SPL-014']);
    expect(bucket.get('WIP-SPL-014')).toBe(10500);
    expect([...bucket.values()].reduce((s, v) => s + v, 0)).toBe(31168);
  });

  it('accumulates same-day entries per part without letting parts merge', () => {
    const map = bucketDailyProduction([
      entryRow({ nestedItems: [{ itemCode: 'WIP-SP-002', actualQuantity: 10000 }, { itemCode: 'WIP-SP-001', actualQuantity: 30000 }] }),
      entryRow({ nestedItems: [{ itemCode: 'WIP-SP-002', actualQuantity: 5000 }, { itemCode: 'WIP-SP-001', actualQuantity: 2000 }] }),
    ]);
    const bucket = onlyBucket(map);

    expect(bucket.get('WIP-SP-002')).toBe(15000);
    expect(bucket.get('WIP-SP-001')).toBe(32000);
  });

  it('keeps separate business days in separate buckets', () => {
    const map = bucketDailyProduction([
      entryRow({ entryDate: '2026-10-09T12:00:00.000Z', nestedItems: [{ itemCode: 'WIP-SP-002', actualQuantity: 100 }] }),
      entryRow({ entryDate: '2026-10-10T12:00:00.000Z', nestedItems: [{ itemCode: 'WIP-SP-002', actualQuantity: 250 }] }),
    ]);

    expect([...map.keys()].sort()).toEqual(['2026-10-09', '2026-10-10']);
    expect(map.get('2026-10-09')!.get('WIP-SP-002')).toBe(100);
    expect(map.get('2026-10-10')!.get('WIP-SP-002')).toBe(250);
  });

  it('never pools a child with no item code onto the parent', () => {
    const bucket = onlyBucket(
      bucketDailyProduction([
        entryRow({
          nestedItems: [
            { itemCode: 'WIP-SP-002', actualQuantity: 83500 },
            { itemCode: '   ', actualQuantity: 30000 },
          ],
        }),
      ]),
    );

    expect(bucket.get('WIP-SP-002')).toBe(83500);
    expect(bucket.has('WIP-SP-001')).toBe(false);
    expect([...bucket.values()].reduce((s, v) => s + v, 0)).toBe(83500);
  });

  it('falls back to the entry total only when no child lines are hydrated', () => {
    const bucket = onlyBucket(bucketDailyProduction([entryRow({ actualQuantity: 4000, nestedItems: undefined })]));

    expect(bucket.get('WIP-SP-002')).toBe(4000);
  });

  it('skips inactive entries and non-positive child quantities', () => {
    const map = bucketDailyProduction([
      entryRow({ isActive: false, nestedItems: [{ itemCode: 'WIP-SP-002', actualQuantity: 999 }] }),
      entryRow({ nestedItems: [{ itemCode: 'WIP-SP-002', actualQuantity: 0 }, { itemCode: 'WIP-SP-001', actualQuantity: -5 }] }),
    ]);

    // The first entry is inactive; the second has children but produced nothing,
    // so the entry total must NOT be pooled in as a fallback.
    expect(map.size).toBe(0);
  });

  it('still buckets the healthy sibling when one child line is empty', () => {
    const bucket = onlyBucket(
      bucketDailyProduction([
        entryRow({ nestedItems: [{ itemCode: 'WIP-SP-002', actualQuantity: 0 }, { itemCode: 'WIP-SP-001', actualQuantity: 750 }] }),
      ]),
    );

    expect(bucket.get('WIP-SP-001')).toBe(750);
    expect(bucket.has('WIP-SP-002')).toBe(false);
  });

  it('rounds per-part contributions to 4 decimals', () => {
    const bucket = onlyBucket(
      bucketDailyProduction([
        entryRow({
          nestedItems: [
            { itemCode: 'WIP-SP-002', actualQuantity: 64.455000001 },
            { itemCode: 'WIP-SP-001', actualQuantity: 1.00006 },
          ],
        }),
      ]),
    );

    expect(bucket.get('WIP-SP-002')).toBe(64.455);
    expect(bucket.get('WIP-SP-001')).toBe(1.0001);
  });
});
