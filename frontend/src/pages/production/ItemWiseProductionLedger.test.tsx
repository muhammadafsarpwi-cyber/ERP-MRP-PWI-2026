import { buildXlsx, CHAIN_REGISTRY, buildChainGrid, crc32, fmtKg, fmtQty } from './ItemWiseProductionLedger';

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
