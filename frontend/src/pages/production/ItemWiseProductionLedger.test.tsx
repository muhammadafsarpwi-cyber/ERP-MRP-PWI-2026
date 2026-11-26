import dayjs from 'dayjs';
import {
  buildXlsx,
  CHAIN_REGISTRY,
  buildChainGrid,
  bucketDailyProduction,
  bucketDailyPackingSplit,
  bucketDailyPartRejection,
  mergeChainsByGroups,
  DEFAULT_MERGED_FG_GROUPS,
  resolveLedgerWindow,
  clearBulkLedgerClientCache,
  crc32,
  fmtKg,
  fmtQty,
  getUnitBreakdownSubtext,
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

describe('ItemWiseProductionLedger — butted chain pipeline (stock_ledger unified)', () => {
  const rows = [
    reportRow('RM-WIRE-009', 'KG', 1000, 0, 386.8),
    reportRow('WIP-ST-001', 'PCS', 0, 40000, 40000),
    reportRow('WIP-SW-001', 'PCS', 0, 40000, 33120),
    reportRow('WIP-SP-001', 'PCS', 0, 16560, 16560),
    reportRow('WIP-SP-002', 'PCS', 0, 16560, 16560),
    reportRow('WIP-SPL-001', 'PCS', 20626, 16560, 8280),
    reportRow('WIP-SPL-002', 'PCS', 12497, 16560, 8280),
    reportRow('SPI-FG-SPK-002', 'GRS', 0, 16560, 0),
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

  it('derives both PL rows issuance & closing directly from stock_ledger OUT without synthetic splits', () => {
    expect(at('SPI-FG-SPK-002').production).toBe(16560);
    expect(at('WIP-SPL-001').issuance).toBe(8280);
    expect(at('WIP-SPL-002').issuance).toBe(8280);
    expect(at('WIP-SPL-001').closingPieces).toBe(20626 + 16560 - 8280);
    expect(at('WIP-SPL-002').closingPieces).toBe(12497 + 16560 - 8280);
    expect(at('WIP-SPL-001').totalWeight).toBeCloseTo((20626 + 16560 - 8280) * 0.00929, 4);
  });

  it('derives every non-terminal stage strictly from its stock_ledger IN/OUT', () => {
    expect(at('WIP-SP-001').issuance).toBe(16560);
    expect(at('WIP-SP-002').issuance).toBe(16560);
    expect(at('WIP-SW-001').issuance).toBe(33120);
    expect(at('WIP-ST-001').issuance).toBe(40000);
    expect(at('RM-WIRE-009').issuance).toBeCloseTo(386.8, 4);
    expect(grid.summary.undriven).toEqual([]);
    expect(grid.summary.balanced).toBe(true);
  });
});

describe('ItemWiseProductionLedger — straight-spoke chains (stock_ledger unified)', () => {
  const rows = [
    reportRow('RM-WIRE-012', 'KG', 500, 0, 502.2),
    reportRow('WIP-ST-003', 'PCS', 0, 20000, 9000),
    reportRow('WIP-ST-004', 'PCS', 0, 20000, 9000),
    reportRow('WIP-SP-013', 'PCS', 0, 9000, 9000),
    reportRow('WIP-SP-014', 'PCS', 0, 9000, 9000),
    reportRow('WIP-SPL-013', 'PCS', 0, 9000, 9000),
    reportRow('WIP-SPL-014', 'PCS', 0, 9000, 9000),
    reportRow('SPI-FG-SPK-006', 'PCS', 0, 18000, 0),
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

  it('preserves recorded stock_ledger OUT across every stage of the straight chain', () => {
    expect(at('WIP-ST-003').issuance).toBe(9000);
    expect(at('WIP-ST-004').issuance).toBe(9000);
    expect(at('WIP-SP-013').issuance).toBe(9000);
    expect(at('WIP-SPL-013').issuance).toBe(9000);
    expect(at('WIP-SPL-014').issuance).toBe(9000);
    expect(at('RM-WIRE-012').issuance).toBeCloseTo(502.2, 4);
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

describe('ItemWiseProductionLedger — Direct Stock Ledger Consistency (No Downstream Override)', () => {
  const weights: Record<string, number | null> = {
    'WIP-ST-001': 0.00967,
    'WIP-SPL-001': 0.00929,
    'WIP-SPL-002': 0.00925,
  };

  it('does not override stock_ledger OUT when downstream stage has 0 movement', () => {
    const grid = buildChainGrid(
      butted,
      [
        reportRow('RM-WIRE-009', 'KG', 1000, 0, 0),
        reportRow('WIP-ST-001', 'PCS', 0, 40000, 40000),
        reportRow('WIP-SW-001', 'PCS', 0, 40000, 33120),
        reportRow('WIP-SP-001', 'PCS', 0, 16560, 16560),
        reportRow('WIP-SP-002', 'PCS', 0, 16560, 16560),
        consumedRow('WIP-SPL-001', 'PCS', 20626, 16560, 8280, 8280),
        consumedRow('WIP-SPL-002', 'PCS', 12497, 16560, 0, 0),
        reportRow('SPI-FG-SPK-002', 'GRS', 0, 0, 0),
      ] as any,
      {},
      weights,
    );
    const at = (code: string) => grid.rows.find((r) => r.itemCode === code)!;

    expect(at('WIP-SPL-001').issuance).toBe(8280);
    expect(at('WIP-SPL-001').closingPieces).toBe(20626 + 16560 - 8280);
    expect(at('WIP-SPL-002').issuance).toBe(0);
    expect(at('WIP-SPL-002').closingPieces).toBe(12497 + 16560);
    expect(grid.summary.balanced).toBe(true);
    expect(grid.summary.undriven).toEqual([]);
  });

  it('uses stock_ledger OUT reliably even when a downstream FG item is absent from the payload', () => {
    const grid = buildChainGrid(
      butted,
      [
        reportRow('RM-WIRE-009', 'KG', 1000, 0, 0),
        reportRow('WIP-ST-001', 'PCS', 0, 40000, 0),
        reportRow('WIP-SW-001', 'PCS', 0, 40000, 0),
        reportRow('WIP-SP-001', 'PCS', 0, 16560, 0),
        reportRow('WIP-SP-002', 'PCS', 0, 16560, 0),
        consumedRow('WIP-SPL-001', 'PCS', 20626, 16560, 12000, 12000),
        consumedRow('WIP-SPL-002', 'PCS', 12497, 16560, 5000, 5000),
      ] as any,
      {},
      weights,
    );
    const at = (code: string) => grid.rows.find((r) => r.itemCode === code)!;

    expect(at('WIP-SPL-001').issuance).toBe(12000);
    expect(at('WIP-SPL-001').closingPieces).toBe(20626 + 16560 - 12000);
    expect(at('WIP-SPL-002').issuance).toBe(5000);
    expect(at('WIP-SPL-002').closingPieces).toBe(12497 + 16560 - 5000);
    expect(grid.summary.missingCodes).toContain('SPI-FG-SPK-002');
    expect(grid.summary.balanced).toBe(true);
  });

  it('splits production consumption vs non-production return out in Remarks when totalOut exceeds consumed', () => {
    const grid = buildChainGrid(
      butted,
      [
        reportRow('RM-WIRE-009', 'KG', 1000, 0, 0),
        reportRow('WIP-ST-001', 'PCS', 0, 40000, 0),
        reportRow('WIP-SW-001', 'PCS', 0, 40000, 0),
        reportRow('WIP-SP-001', 'PCS', 0, 16560, 0),
        reportRow('WIP-SP-002', 'PCS', 0, 16560, 0),
        consumedRow('WIP-SPL-001', 'PCS', 20626, 16560, 25000, 16560), // 16,560 prod cons + 8,440 other OUT
        consumedRow('WIP-SPL-002', 'PCS', 12497, 16560, 0, 0),
        reportRow('SPI-FG-SPK-002', 'GRS', 0, 16560, 0),
      ] as any,
      {},
      weights,
    );
    const at = (code: string) => grid.rows.find((r) => r.itemCode === code)!;

    const inner = at('WIP-SPL-001');
    expect(inner.prodValue).toBe(16560);
    expect(inner.returnOutValue).toBe(25000 - 16560);
    expect(inner.issuance).toBe(25000);
    expect(inner.closingPieces).toBe(20626 + 16560 - 25000);
    expect(inner.remarks).not.toBe('—');
    expect(at('WIP-SPL-002').issuance).toBe(0);
    expect(grid.summary.balanced).toBe(true);
  });

  it('keeps independent closing balances on split sides strictly tied to each item stock_ledger rows', () => {
    const grid = buildChainGrid(
      butted,
      [
        reportRow('RM-WIRE-009', 'KG', 1000, 0, 0),
        reportRow('WIP-ST-001', 'PCS', 0, 40000, 0),
        reportRow('WIP-SW-001', 'PCS', 0, 40000, 0),
        reportRow('WIP-SP-001', 'PCS', 5000, 0, 0),
        reportRow('WIP-SP-002', 'PCS', 5000, 0, 9000),
        reportRow('WIP-SPL-001', 'PCS', 0, 0, 0),
        reportRow('WIP-SPL-002', 'PCS', 0, 9000, 0),
        reportRow('SPI-FG-SPK-002', 'GRS', 0, 18000, 0),
      ] as any,
      {},
      weights,
    );
    const at = (code: string) => grid.rows.find((r) => r.itemCode === code)!;

    expect(at('WIP-SP-001').issuance).toBe(0);
    expect(at('WIP-SP-001').closingPieces).toBe(5000);
    expect(at('WIP-SP-002').issuance).toBe(9000);
    expect(at('WIP-SP-002').closingPieces).toBe(-4000);
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

describe('ItemWiseProductionLedger — Inner-Only / Outer-Only Packing Split & Merged FG Chains', () => {
  const weights: Record<string, number | null> = {
    'WIP-ST-001': 0.00967,
    'WIP-SPL-001': 0.00929,
    'WIP-SPL-002': 0.00925,
    'SPI-FG-SPK-001': 0.0111,
    'SPI-FG-SPK-002': 0.0118,
  };

  it('uses stock_ledger totalOut directly for PL Inner & PL Outer and keeps packing mode in Remarks when INNER_ONLY is packed', () => {
    const splitMap = bucketDailyPackingSplit([
      {
        isActive: true,
        entryDate: '2026-10-31',
        packingMode: 'INNER_ONLY',
        remarks: 'SpokePackingMode: INNER_ONLY | ONLY_INNER',
        nestedItems: [{ itemCode: 'SPI-FG-SPK-002', actualQuantity: 3000 }],
      },
    ]);
    const split = splitMap.get('2026-10-31')?.get('SPI-FG-SPK-002');
    expect(split).toBeDefined();
    expect(split?.innerPacked).toBe(3000);
    expect(split?.outerPacked).toBe(0);
    expect(split?.hasExplicitSplit).toBe(true);

    const grid = buildChainGrid(
      butted,
      [
        reportRow('RM-WIRE-009', 'KG', 1000, 0, 0),
        reportRow('WIP-ST-001', 'PCS', 10000, 0, 0),
        reportRow('WIP-SW-001', 'PCS', 10000, 0, 0),
        reportRow('WIP-SP-001', 'PCS', 10000, 0, 0),
        reportRow('WIP-SP-002', 'PCS', 10000, 0, 0),
        reportRow('WIP-SPL-001', 'PCS', 20000, 0, 3000),
        reportRow('WIP-SPL-002', 'PCS', 15000, 0, 0),
        {
          ...reportRow('SPI-FG-SPK-002', 'PCS', 0, 3000, 0),
          innerPacked: split!.innerPacked,
          outerPacked: split!.outerPacked,
          hasExplicitSplit: split!.hasExplicitSplit,
          packingModeSummary: split!.modeLabels.join(', '),
        },
      ] as any,
      {},
      weights,
    );

    const at = (code: string) => grid.rows.find((r) => r.itemCode === code)!;
    expect(at('WIP-SPL-001').issuance).toBe(3000);
    expect(at('WIP-SPL-001').closingPieces).toBe(20000 - 3000);
    expect(at('WIP-SPL-002').issuance).toBe(0);
    expect(at('WIP-SPL-002').closingPieces).toBe(15000);
    expect(at('SPI-FG-SPK-002').remarks).toContain('Inner Only');
    expect(grid.summary.balanced).toBe(true);
  });

  it('uses stock_ledger totalOut directly for PL Outer and keeps packing mode in Remarks when OUTER_ONLY is packed', () => {
    const splitMap = bucketDailyPackingSplit([
      {
        isActive: true,
        entryDate: '2026-10-31',
        packingMode: 'OUTER_ONLY',
        remarks: 'SpokePackingMode: OUTER_ONLY | ONLY_OUTER',
        nestedItems: [{ itemCode: 'SPI-FG-SPK-002', actualQuantity: 3000 }],
      },
    ]);
    const split = splitMap.get('2026-10-31')?.get('SPI-FG-SPK-002')!;
    expect(split.innerPacked).toBe(0);
    expect(split.outerPacked).toBe(3000);

    const grid = buildChainGrid(
      butted,
      [
        reportRow('RM-WIRE-009', 'KG', 1000, 0, 0),
        reportRow('WIP-ST-001', 'PCS', 10000, 0, 0),
        reportRow('WIP-SW-001', 'PCS', 10000, 0, 0),
        reportRow('WIP-SP-001', 'PCS', 10000, 0, 0),
        reportRow('WIP-SP-002', 'PCS', 10000, 0, 0),
        reportRow('WIP-SPL-001', 'PCS', 20000, 0, 0),
        reportRow('WIP-SPL-002', 'PCS', 15000, 0, 3000),
        {
          ...reportRow('SPI-FG-SPK-002', 'PCS', 0, 3000, 0),
          innerPacked: split.innerPacked,
          outerPacked: split.outerPacked,
          hasExplicitSplit: split.hasExplicitSplit,
          packingModeSummary: split.modeLabels.join(', '),
        },
      ] as any,
      {},
      weights,
    );

    const at = (code: string) => grid.rows.find((r) => r.itemCode === code)!;
    expect(at('WIP-SPL-001').issuance).toBe(0);
    expect(at('WIP-SPL-001').closingPieces).toBe(20000);
    expect(at('WIP-SPL-002').issuance).toBe(3000);
    expect(at('WIP-SPL-002').closingPieces).toBe(15000 - 3000);
    expect(at('SPI-FG-SPK-002').remarks).toContain('Outer Only');
    expect(grid.summary.balanced).toBe(true);
  });

  it('merges SPI-FG-SPK-001 and SPI-FG-SPK-002 into one unified ledger anchored on stock_ledger while each DP row stays separate', () => {
    const mergedList = mergeChainsByGroups(CHAIN_REGISTRY, DEFAULT_MERGED_FG_GROUPS);
    const mergedChain = mergedList.find((c) => c.key === 'SPI-FG-SPK-001')!;
    expect(mergedChain).toBeDefined();
    expect(mergedList.some((c) => c.key === 'SPI-FG-SPK-002')).toBe(false);
    // 7 shared upstream stages + 2 FG rows + 2 DP rows = 11 rows
    expect(mergedChain.rows).toHaveLength(11);

    const grid = buildChainGrid(
      mergedChain,
      [
        reportRow('RM-WIRE-009', 'KG', 16645.62, 0, 0),
        reportRow('WIP-ST-001', 'PCS', 39004, 50000, 34874),
        reportRow('WIP-SW-001', 'PCS', 99584, 34874, 28000),
        reportRow('WIP-SP-001', 'PCS', 203245, 28000, 0),
        reportRow('WIP-SP-002', 'PCS', 110582, 0, 0),
        reportRow('WIP-SPL-001', 'PCS', 189862, 0, 5000),
        reportRow('WIP-SPL-002', 'PCS', 163053, 0, 2000),
        // FG 001 packs 4,000 Full Set and dispatches 10,000
        {
          ...reportRow('SPI-FG-SPK-001', 'PCS', 86400, 4000, 10000),
          innerPacked: 2000,
          outerPacked: 2000,
          hasExplicitSplit: true,
        },
        // FG 002 packs 3,000 Inner Only and dispatches 5,000
        {
          ...reportRow('SPI-FG-SPK-002', 'PCS', 31680, 3000, 5000),
          innerPacked: 3000,
          outerPacked: 0,
          hasExplicitSplit: true,
        },
        reportRow('SPI-FG-SPK-001-DISP', 'PCS', 1224000, 0),
        reportRow('SPI-FG-SPK-002-DISP', 'PCS', 396000, 0),
      ] as any,
      {},
      weights,
    );

    const at = (code: string) => grid.rows.find((r) => r.itemCode === code)!;
    // PL Inner & Outer reflect actual stock_ledger OUT
    expect(at('WIP-SPL-001').issuance).toBe(5000);
    expect(at('WIP-SPL-001').closingPieces).toBe(189862 - 5000);
    expect(at('WIP-SPL-002').issuance).toBe(2000);
    expect(at('WIP-SPL-002').closingPieces).toBe(163053 - 2000);

    // FG 001 & 002 keep separate rows and balances
    expect(at('SPI-FG-SPK-001').production).toBe(4000);
    expect(at('SPI-FG-SPK-001').issuance).toBe(10000);
    expect(at('SPI-FG-SPK-001').closingPieces).toBe(86400 + 4000 - 10000);

    expect(at('SPI-FG-SPK-002').production).toBe(3000);
    expect(at('SPI-FG-SPK-002').issuance).toBe(5000);
    expect(at('SPI-FG-SPK-002').closingPieces).toBe(31680 + 3000 - 5000);

    // DP 001 & 002 keep separate dispatch rows
    expect(at('SPI-FG-SPK-001-DISP').opBalance).toBe(1224000);
    expect(at('SPI-FG-SPK-001-DISP').production).toBe(10000);
    expect(at('SPI-FG-SPK-001-DISP').closingPieces).toBe(1234000);

    expect(at('SPI-FG-SPK-002-DISP').opBalance).toBe(396000);
    expect(at('SPI-FG-SPK-002-DISP').production).toBe(5000);
    expect(at('SPI-FG-SPK-002-DISP').closingPieces).toBe(401000);

    // Total packed is 4,000 + 3,000 = 7,000
    expect(grid.summary.totalPacked).toBe(7000);
    expect(grid.summary.balanced).toBe(true);
  });

  it('merges SPI-FG-SPK-006 and SPI-FG-SPK-011 into one unified ledger (11 rows)', () => {
    const mergedList = mergeChainsByGroups(CHAIN_REGISTRY, DEFAULT_MERGED_FG_GROUPS);
    const merged006 = mergedList.find((c) => c.key === 'SPI-FG-SPK-006')!;
    expect(merged006).toBeDefined();
    expect(mergedList.some((c) => c.key === 'SPI-FG-SPK-011')).toBe(false);
    expect(merged006.mergedFgCodes).toEqual(['SPI-FG-SPK-006', 'SPI-FG-SPK-011']);
    expect(merged006.rows).toHaveLength(11);
  });

  it('merges SPI-FG-SPK-004 and SPI-FG-SPK-012 into one unified ledger (11 rows)', () => {
    const mergedList = mergeChainsByGroups(CHAIN_REGISTRY, DEFAULT_MERGED_FG_GROUPS);
    const merged004 = mergedList.find((c) => c.key === 'SPI-FG-SPK-004')!;
    expect(merged004).toBeDefined();
    expect(mergedList.some((c) => c.key === 'SPI-FG-SPK-012')).toBe(false);
    expect(merged004.mergedFgCodes).toEqual(['SPI-FG-SPK-004', 'SPI-FG-SPK-012']);
    expect(merged004.rows).toHaveLength(11);
  });

  describe('Nipple Chains & Direct Inward / Import Handling (§NIPPLE)', () => {
    const nippleDef = {
      key: 'FG-NP-001',
      label: '225X17 Front Wheel Nipple — FG-NP-001',
      fgItemCode: 'FG-NP-001',
      rows: [
        { order: 1, stage: 'FG', stageLabel: 'FG / Packing', itemCode: 'FG-NP-001', itemLabel: '225X17 Front Wheel Nipple' },
        { order: 2, stage: 'DP', stageLabel: 'DP Dispatch', itemCode: 'FG-NP-001-DISP', itemLabel: '225X17 Front Wheel Nipple Dispatch' },
      ],
    };

    it('credits goods receipts / inward import into production column when item has inward stock', () => {
      const grid = buildChainGrid(
        nippleDef as any,
        [
          {
            itemId: 'FG-NP-001',
            itemCode: 'FG-NP-001',
            itemName: '225X17 Front Wheel Nipple',
            uomCode: 'PCS',
            openingBalance: 72000,
            totalIn: 720000, // Goods receipt
            totalOut: 144000, // Issued / consumed
            produced: 0, // No daily production entry
          },
          {
            itemId: 'FG-NP-001-DISP',
            itemCode: 'FG-NP-001-DISP',
            itemName: '225X17 Front Wheel Nipple Dispatch',
            uomCode: 'PCS',
            openingBalance: 0,
            totalIn: 144000,
            totalOut: 0,
            produced: 144000,
          },
        ] as any,
        {},
        weights,
      );

      const fgRow = grid.rows.find((r) => r.itemCode === 'FG-NP-001')!;
      expect(fgRow.opBalance).toBe(72000);
      expect(fgRow.production).toBe(720000);
      expect(fgRow.subTotal).toBe(792000);
      expect(fgRow.issuance).toBe(144000);
      expect(fgRow.closingPieces).toBe(648000); // Positive and mathematically balanced
      expect(grid.summary.balanced).toBe(true);
      expect(fgRow.remarks).toContain('Inward / Import: +720,000');
    });

    it('accurately breaks down carton and gross units for nipple balances', () => {
      // FG-NP-001 with verified balance of 92,120 PCS
      const b1 = getUnitBreakdownSubtext(92120, 'FG', 'PCS', 'FG-NP-001');
      expect(b1).not.toBeNull();
      expect(b1?.text).toBe('(64 CTN • 639.7 GRS)');
      expect(b1?.gross).toBeCloseTo(639.72, 1);
      expect(b1?.cartons).toBeCloseTo(63.97, 1);

      // FG-NP-002 with verified balance of 1,043,838 PCS
      const b2 = getUnitBreakdownSubtext(1043838, 'FG', 'PCS', 'FG-NP-002');
      expect(b2).not.toBeNull();
      expect(b2?.text).toBe('(724.9 CTN • 7,248.9 GRS)');

      // FG-NP-003 with verified balance of 2,018,880 PCS
      const b3 = getUnitBreakdownSubtext(2018880, 'FG', 'PCS', 'FG-NP-003');
      expect(b3).not.toBeNull();
      expect(b3?.text).toBe('(1,402 CTN • 14,020 GRS)');

      // FG-NP-004 with verified balance of 1,258,708 PCS
      const b4 = getUnitBreakdownSubtext(1258708, 'FG', 'PCS', 'FG-NP-004');
      expect(b4).not.toBeNull();
      expect(b4?.text).toBe('(874.1 CTN • 8,741 GRS)');

      // FG-NP-005 with verified balance of 328,081 PCS
      const b5 = getUnitBreakdownSubtext(328081, 'FG', 'PCS', 'FG-NP-005');
      expect(b5).not.toBeNull();
      expect(b5?.text).toBe('(227.8 CTN • 2,278.3 GRS)');
    });
  });

  describe('ItemWiseProductionLedger — Part Rejection in Pieces and KG', () => {
    it('buckets part rejections by PKT day and item code from child output lines', () => {
      const entries = [
        {
          entryDate: '2026-11-10T19:00:00.000Z', // 2026-11-11 in PKT (+5h)
          isActive: true,
          nestedItems: [
            { itemCode: 'WIP-SPK-002', entryKind: 'OUTPUT', actualQuantity: 43000, scrapQuantity: 10 },
            { itemCode: 'RM-WIRE-009', entryKind: 'INPUT', actualQuantity: 250, scrapQuantity: 5 },
          ],
        },
      ];
      const buckets = bucketDailyPartRejection(entries);
      const day11 = buckets.get('2026-11-11');
      expect(day11).toBeDefined();
      expect(day11?.get('WIP-SPK-002')).toBe(10);
      // INPUT lines must never be bucketed as product part rejection
      expect(day11?.get('RM-WIRE-009')).toBeUndefined();
    });

    it('falls back to parent entry scrapQuantity when children have no scrap or entry is flat', () => {
      const entries = [
        {
          entryDate: '2026-11-10T19:00:00.000Z',
          isActive: true,
          itemCode: 'WIP-SPK-002',
          actualQuantity: 43000,
          scrapQuantity: 10,
          nestedItems: [],
        },
      ];
      const buckets = bucketDailyPartRejection(entries);
      const day11 = buckets.get('2026-11-11');
      expect(day11?.get('WIP-SPK-002')).toBe(10);
    });

    it('calculates dual-unit scrap (PCS and KG) accurately in buildChainGrid', () => {
      const rows = [
        reportRow('RM-WIRE-009', 'KG', 2428.59, 0),
        reportRow('WIP-ST-001', 'PCS', 13462, 26000),
        reportRow('WIP-SW-001', 'PCS', 133678, 29024),
        reportRow('WIP-SP-001', 'PCS', 125914, 0),
        { ...reportRow('WIP-SP-002', 'PCS', 158602, 43000), scrapOut: 10 },
        reportRow('WIP-SPL-001', 'PCS', 49693, 0),
        reportRow('WIP-SPL-002', 'PCS', 51657, 0),
        reportRow('SPI-FG-SPK-001', 'PCS', 0, 0),
        reportRow('SPI-FG-SPK-002', 'PCS', 0, 0),
      ];

      const monthScrap = {
        'WIP-ST-001': 294,
        'WIP-SW-001': 56,
        'WIP-SP-001': 327,
        'WIP-SP-002': 289,
      };

      const weights = {
        'RM-WIRE-009': 1,
        'WIP-ST-001': 0.0097,
        'WIP-SW-001': 0.0097,
        'WIP-SP-001': 0.00929,
        'WIP-SP-002': 0.00925,
      };

      const grid = buildChainGrid(butted, rows, monthScrap, weights);
      const sp2 = grid.rows.find((r) => r.itemCode === 'WIP-SP-002')!;
      expect(sp2).toBeDefined();

      // Today: 10 PCS, and 10 * 0.00925 = 0.0925 KG
      expect(sp2.scrapTodayPcs).toBe(10);
      expect(sp2.scrapTodayKg).toBeCloseTo(0.0925, 4);

      // Total: 289 PCS, and 289 * 0.00925 = 2.67325 KG
      expect(sp2.scrapMonthPcs).toBe(289);
      expect(sp2.scrapMonthKg).toBeCloseTo(2.6733, 4);
    });

    it('derives every stage issuance strictly from stock_ledger OUT and prevents phantom downstream drift on WIP-SW-001', () => {
      // Even when downstream WIP-SP-002 produced 40,200 + 45 scrap while WIP-SW-001's actual
      // stock_ledger consumption (e.g. from multi-source / alternate stage) was 27,029 PCS,
      // WIP-SW-001 MUST deduct exact stock_ledger totalOut (27,029) so Closing matches Stock Movement History 100%.
      const rows = [
        reportRow('RM-WIRE-009', 'KG', 2932.03, 0, 503.62),
        { ...reportRow('WIP-ST-001', 'PCS', 16023, 52062, 54641), scrapOut: 19 },
        { ...reportRow('WIP-SW-001', 'PCS', 7985, 50513, 27029), scrapOut: 18 },
        reportRow('WIP-SP-001', 'PCS', 125914, 0, 0),
        { ...reportRow('WIP-SP-002', 'PCS', 118402, 40200, 0), scrapOut: 45 },
        reportRow('WIP-SPL-001', 'PCS', 49693, 0, 0),
        reportRow('WIP-SPL-002', 'PCS', 49693, 0, 0),
        reportRow('SPI-FG-SPK-001', 'PCS', 0, 0, 0),
        reportRow('SPI-FG-SPK-002', 'PCS', 0, 0, 0),
      ];

      const weights = {
        'RM-WIRE-009': 1,
        'WIP-ST-001': 0.00967,
        'WIP-SW-001': 0.00967,
        'WIP-SP-001': 0.00929,
        'WIP-SP-002': 0.00925,
      };

      const grid = buildChainGrid(butted, rows, {}, weights);
      const at = (code: string) => grid.rows.find((r) => r.itemCode === code)!;

      // 1. RM Issuance = recorded stock_ledger OUT = 503.62 KG
      expect(at('RM-WIRE-009').issuance).toBeCloseTo(503.62, 2);
      expect(at('RM-WIRE-009').closingPieces).toBeCloseTo(2932.03 - 503.62, 2);

      // 2. ST Issuance = recorded stock_ledger OUT = 54,641 PCS
      expect(at('WIP-ST-001').issuance).toBe(54641);
      expect(at('WIP-ST-001').closingPieces).toBe(16023 + 52062 - 54641);

      // 3. SW Issuance = recorded stock_ledger OUT = 27,029 PCS (matches Stock Movement History 31,469!)
      expect(at('WIP-SW-001').issuance).toBe(27029);
      expect(at('WIP-SW-001').closingPieces).toBe(7985 + 50513 - 27029);

      // 4. Reconciliation check: every row is mathematically balanced
      expect(grid.summary.balanced).toBe(true);
    });
  });

  describe('Control Cable Division (Meter UOM & kg/m conversion)', () => {
    it('resolves kg/m for M items, uses stock_ledger KG OUT for FL stage, and preserves 100% weight calculation', () => {
      const ccdChain = {
        key: 'CCD-FGR-001',
        label: '5 MM PVC 2P Outer Casing — CCD-FGR-001',
        fgItemCode: 'CCD-FGR-001',
        rows: [
          { order: 1, stage: 'RM', stageLabel: 'RM Stage', itemCode: 'RM-WIRE-001' },
          { order: 2, stage: 'FL', stageLabel: 'Flattening Stage', itemCode: 'FLAT-STRIP-001' },
          { order: 3, stage: 'SP', stageLabel: 'Spiral Stage', itemCode: 'WIP-CS-001' },
          { order: 4, stage: 'PV', stageLabel: 'PVC Stage', itemCode: 'WIP-PVC-001' },
          { order: 5, stage: 'FG', stageLabel: 'FG / Packing', itemCode: 'CCD-FGR-001' },
        ],
      };

      const rows = [
        reportRow('RM-WIRE-001', 'KG', 1000, 0, 0),
        reportRow('FLAT-STRIP-001', 'KG', 429, 0, 26.4122),
        { ...reportRow('WIP-CS-001', 'M', 30171 - 800.37, 800.37, 0), scrapOut: 0 },
        reportRow('WIP-PVC-001', 'M', 5000, 0, 0),
        reportRow('CCD-FGR-001', 'M', 0, 0, 0),
      ];

      const weights = {
        'WIP-CS-001': 0.033,
        'WIP-PVC-001': 0.0344,
        'CCD-FGR-001': 0.0445,
      };

      const grid = buildChainGrid(ccdChain, rows as any, {}, weights);
      const at = (code: string) => grid.rows.find((r) => r.itemCode === code)!;

      // 1. FL (KG) uses exact stock_ledger consumption (26.4122 KG)
      expect(at('FLAT-STRIP-001').issuance).toBeCloseTo(26.4122, 4);
      expect(at('FLAT-STRIP-001').closingPieces).toBeCloseTo(429 - 26.4122, 4);

      // 2. WIP-CS-001 (M) Total Weight uses 0.0330 kg/m (30,171 * 0.033 = 995.643 KG), NOT 1.0000!
      expect(at('WIP-CS-001').perPieceWeight).toBeCloseTo(0.033, 6);
      expect(at('WIP-CS-001').closingPieces).toBeCloseTo(30171, 4);
      expect(at('WIP-CS-001').totalWeight).toBeCloseTo(30171 * 0.033, 2);
      expect(grid.summary.packedUom).toBe('M');
      expect(grid.summary.balanced).toBe(true);
    });
  });

  describe('resolveLedgerWindow & client-side cache key resolution', () => {
    it('anchors daily cutoff scrapFrom to 2026-10-01 without putting chainKey in the cache key', () => {
      clearBulkLedgerClientCache();
      const d = dayjs('2026-11-23');
      const win = resolveLedgerWindow('daily', d, d);
      expect(win).toEqual({
        isRange: false,
        periodFrom: '2026-11-23',
        endDate: '2026-11-23',
        scrapFrom: '2026-10-01',
        cacheKey: '2026-11-23__2026-11-23__2026-10-01',
      });

      const early = dayjs('2026-09-18');
      const earlyWin = resolveLedgerWindow('daily', early, early);
      expect(earlyWin.scrapFrom).toBe('2026-09-01');
      expect(earlyWin.cacheKey).toBe('2026-09-18__2026-09-18__2026-09-01');
    });

    it('uses the full selected period in range mode', () => {
      const s = dayjs('2026-11-10');
      const e = dayjs('2026-11-23');
      const win = resolveLedgerWindow('range', s, e);
      expect(win).toEqual({
        isRange: true,
        periodFrom: '2026-11-10',
        endDate: '2026-11-23',
        scrapFrom: '2026-11-10',
        cacheKey: '2026-11-10__2026-11-23__2026-11-10',
      });
    });
  });

  describe('CCD-FGR-011 multi-strip Spiral Core (WIP-CS-006 + FLAT-STRIP-005 / 006)', () => {
    it('preserves Closing KG totalWeight while populating @ 0.0370 kg/m and @ 0.0450 kg/m perMeterWeight specs on FLAT-STRIP rows', () => {
      const ccdChain = {
        key: 'CCD-FGR-011',
        fgItemCode: 'CCD-FGR-011',
        label: 'Control Cable Outer 5.75mm DS — CCD-FGR-011',
        rows: [
          { order: 1, stage: 'RM', stageLabel: 'RM Stage', itemCode: 'RM-WIRE-002', itemLabel: 'Steel Wire Rod' },
          { order: 2, stage: 'FT', stageLabel: 'Flattening Stage', itemCode: 'FLAT-STRIP-005', itemLabel: 'Flat Strip T 0.80 × W 1.85 mm' },
          { order: 3, stage: 'FT', stageLabel: 'Flattening Stage', itemCode: 'FLAT-STRIP-006', itemLabel: 'Flat Strip T 0.95 × W 2.10 mm' },
          { order: 4, stage: 'CS', stageLabel: 'Spiral Stage', itemCode: 'WIP-CS-006', itemLabel: 'Spiral Core 5.75 mm DS' },
          { order: 5, stage: 'FG', stageLabel: 'FG Stage', itemCode: 'CCD-FGR-011', itemLabel: 'Finished Outer Casing' },
        ],
      } as any;

      const dayRows = [
        { ...reportRow('RM-WIRE-002', 'KG', 500, 0, 200), itemType: 'RAW_MATERIAL' },
        { ...reportRow('FLAT-STRIP-005', 'KG', 100, 50, 74.37), weightPerMeter: 0.037 },
        { ...reportRow('FLAT-STRIP-006', 'KG', 120, 60, 90.45), weightPerMeter: 0.045 },
        { ...reportRow('WIP-CS-006', 'M', 0, 2010, 0), weightPerMeter: 0.082 },
        { ...reportRow('CCD-FGR-011', 'M', 0, 0, 0), itemType: 'FINISHED_GOOD', finishedWeightPerMeter: 0.11 },
      ];

      const grid = buildChainGrid(ccdChain, dayRows as any, {}, {
        'FLAT-STRIP-005': 0.037,
        'FLAT-STRIP-006': 0.045,
        'WIP-CS-006': 0.082,
        'CCD-FGR-011': 0.11,
      });

      const rm = grid.rows.find((r) => r.itemCode === 'RM-WIRE-002')!;
      const s5 = grid.rows.find((r) => r.itemCode === 'FLAT-STRIP-005')!;
      const s6 = grid.rows.find((r) => r.itemCode === 'FLAT-STRIP-006')!;
      const cs = grid.rows.find((r) => r.itemCode === 'WIP-CS-006')!;

      // Raw material coil has no per-meter strip spec (stays 1.0000)
      expect(rm.perMeterWeight).toBeNull();

      // FLAT-STRIP-005: 100 + 50 - 74.37 = 75.63 KG closing (× 1 = 75.63 KG totalWeight), perMeterWeight = 0.0370 kg/m
      expect(s5.issuance).toBe(74.37);
      expect(s5.closingPieces).toBe(75.63);
      expect(s5.totalWeight).toBe(75.63);
      expect(s5.perMeterWeight).toBe(0.037);

      // FLAT-STRIP-006: 120 + 60 - 90.45 = 89.55 KG closing (× 1 = 89.55 KG totalWeight), perMeterWeight = 0.0450 kg/m
      expect(s6.issuance).toBe(90.45);
      expect(s6.closingPieces).toBe(89.55);
      expect(s6.totalWeight).toBe(89.55);
      expect(s6.perMeterWeight).toBe(0.045);

      // WIP-CS-006: 2,010 M × 0.0820 kg/m = 164.82 KG (= 74.37 + 90.45 KG!)
      expect(cs.production).toBe(2010);
      expect(cs.perPieceWeight).toBe(0.082);
      expect(cs.totalWeight).toBe(164.82);
    });
  });
});
