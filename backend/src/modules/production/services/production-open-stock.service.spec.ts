import { ProductionOpenStockService } from './production-open-stock.service';

/**
 * Production Item Open Stock — the two paths that decide whether the "SYSTEM
 * BOOK STOCK" column means anything.
 *
 * `getDepartmentStockMatrix` reads `inventory_balances` and presents it as
 * fact. That is only safe if nothing can desynchronise the balance from the
 * journal that is supposed to justify it, and three separate code paths could.
 * These tests pin the two repairs: the reconciliation report that DETECTS
 * drift, and the reversal that no longer CAUSES it.
 */

const COMPANY = '7725aa04-a270-4314-9e82-90949cbe7791';
const ITEM = '11111111-1111-1111-1111-111111111111';
const WH = '22222222-2222-2222-2222-222222222222';
const UOM = '33333333-3333-3333-3333-333333333333';

/** Builds the service with only the collaborators each test actually drives. */
function build(overrides: Record<string, any> = {}) {
  const rawQb = {
    select: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    getRawMany: jest.fn().mockResolvedValue([]),
  };
  const svc: any = Object.create(ProductionOpenStockService.prototype);
  Object.assign(svc, {
    logger: { log: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(), verbose: jest.fn() },
    itemRepo: { createQueryBuilder: jest.fn(() => rawQb) },
    warehouseRepo: { createQueryBuilder: jest.fn(() => rawQb) },
    ledgerRepo: { findOne: jest.fn() },
    balanceRepo: {},
    stockLedgerService: { create: jest.fn().mockResolvedValue({ id: 'rev-1' }) },
    inventoryBalanceService: { updateBalance: jest.fn() },
    dataSource: { query: jest.fn(), transaction: jest.fn() },
    ...overrides,
  });
  return svc;
}

/** Two dataSource.query calls in order: the ledger net, then the balances. */
const twoQueries = (ledgerRows: any[], balanceRows: any[]) =>
  jest.fn().mockResolvedValueOnce(ledgerRows).mockResolvedValueOnce(balanceRows);

describe('ProductionOpenStockService.reconcileBalances — drift detection', () => {
  it('reports a balance that is ahead of the journal as BALANCE_OVERSTATED', async () => {
    const svc = build({
      dataSource: {
        query: twoQueries(
          [{ warehouse_id: WH, item_id: ITEM, ledger_net: 100, ledger_rows: 2 }],
          [{ warehouse_id: WH, item_id: ITEM, on_hand: 250, status: 'ACTIVE', uom_id: UOM, balance_rows: 1 }],
        ),
      },
    });

    const res = await svc.reconcileBalances(COMPANY);

    expect(res.applied).toBe(false);
    expect(res.driftPairs).toBe(1);
    expect(res.rows[0]).toMatchObject({ drift: 150, direction: 'BALANCE_OVERSTATED' });
  });

  it('reports a journal that is ahead of the balance as LEDGER_OVERSTATED', async () => {
    const svc = build({
      dataSource: {
        query: twoQueries(
          [{ warehouse_id: WH, item_id: ITEM, ledger_net: 400, ledger_rows: 3 }],
          [{ warehouse_id: WH, item_id: ITEM, on_hand: 250, status: 'ACTIVE', uom_id: UOM, balance_rows: 1 }],
        ),
      },
    });

    const res = await svc.reconcileBalances(COMPANY);

    expect(res.rows[0]).toMatchObject({ drift: -150, direction: 'LEDGER_OVERSTATED' });
  });

  it('WRITES NOTHING by default — report-only is the safe mode', async () => {
    const updateBalance = jest.fn();
    const svc = build({
      inventoryBalanceService: { updateBalance },
      dataSource: {
        query: twoQueries(
          [{ warehouse_id: WH, item_id: ITEM, ledger_net: 100, ledger_rows: 2 }],
          [{ warehouse_id: WH, item_id: ITEM, on_hand: 250, status: 'ACTIVE', uom_id: UOM, balance_rows: 1 }],
        ),
      },
    });

    await svc.reconcileBalances(COMPANY);

    // The whole point: no scheduled job, no retry and no stray query param can
    // move a balance. The two sides are currently wrong by DIFFERENT amounts,
    // so forcing one to match the other would push stock negative.
    expect(updateBalance).not.toHaveBeenCalled();
  });

  it('a boolean-ish apply flag does NOT arm the write path', async () => {
    const updateBalance = jest.fn();
    // Alternates ledger → balance so the four-iteration loop never runs the
    // mock dry; a `mockResolvedValueOnce` queue would empty after the first.
    let n = 0;
    const query = jest.fn(async () => {
      n += 1;
      return n % 2 === 1
        ? [{ warehouse_id: WH, item_id: ITEM, ledger_net: 100, ledger_rows: 2 }]
        : [{ warehouse_id: WH, item_id: ITEM, on_hand: 250, status: 'ACTIVE', uom_id: UOM, balance_rows: 1 }];
    });
    const svc = build({
      inventoryBalanceService: { updateBalance },
      dataSource: { query },
    });

    for (const apply of ['true', '1', 'yes', 'TRUE']) {
      const res = await svc.reconcileBalances(COMPANY, { apply });
      expect(res.applied).toBe(false);
      expect(updateBalance).not.toHaveBeenCalled();
    }
  });

  it('writes only for the literal confirmation string, in the direction that closes the gap', async () => {
    const updateBalance = jest.fn();
    const svc = build({
      inventoryBalanceService: { updateBalance },
      dataSource: {
        query: twoQueries(
          [{ warehouse_id: WH, item_id: ITEM, ledger_net: 100, ledger_rows: 2 }],
          [{ warehouse_id: WH, item_id: ITEM, on_hand: 250, status: 'ACTIVE', uom_id: UOM, balance_rows: 1 }],
        ),
      },
    });

    const res = await svc.reconcileBalances(COMPANY, { apply: 'APPLY' });

    expect(res.applied).toBe(true);
    // Balance is 150 AHEAD → take 150 back OUT.
    expect(updateBalance).toHaveBeenCalledWith(
      COMPANY, ITEM, WH, null, null, UOM, 150, 'OUT', undefined, true,
    );
  });

  it('a shortfall is written as IN, not a negative OUT', async () => {
    const updateBalance = jest.fn();
    const svc = build({
      inventoryBalanceService: { updateBalance },
      dataSource: {
        query: twoQueries(
          [{ warehouse_id: WH, item_id: ITEM, ledger_net: 250, ledger_rows: 3 }],
          [{ warehouse_id: WH, item_id: ITEM, on_hand: 100, status: 'ACTIVE', uom_id: UOM, balance_rows: 1 }],
        ),
      },
    });

    await svc.reconcileBalances(COMPANY, { apply: 'APPLY' });

    expect(updateBalance).toHaveBeenCalledWith(
      COMPANY, ITEM, WH, null, null, UOM, 150, 'IN', undefined, true,
    );
  });

  it('never writes to a pair with MORE THAN ONE balance row — the target is ambiguous', async () => {
    // A duplicated balance row is its own defect. Picking one to correct would
    // fix a number while leaving the duplicate still wrong.
    const updateBalance = jest.fn();
    const svc = build({
      inventoryBalanceService: { updateBalance },
      dataSource: {
        query: twoQueries(
          [{ warehouse_id: WH, item_id: ITEM, ledger_net: 100, ledger_rows: 2 }],
          [{ warehouse_id: WH, item_id: ITEM, on_hand: 250, status: 'ACTIVE', uom_id: UOM, balance_rows: 2 }],
        ),
      },
    });

    const res = await svc.reconcileBalances(COMPANY, { apply: 'APPLY' });

    expect(res.driftPairs).toBe(1);
    expect(updateBalance).not.toHaveBeenCalled();
  });

  it('a balance with NO ledger behind it is reported — that is the tell-tale', async () => {
    // Stock on the books that no movement can justify: exactly the phantom
    // "SYSTEM BOOK STOCK" that started this investigation.
    const svc = build({
      dataSource: {
        query: twoQueries(
          [],
          [{ warehouse_id: WH, item_id: ITEM, on_hand: 77651, status: 'ACTIVE', uom_id: UOM, balance_rows: 1 }],
        ),
      },
    });

    const res = await svc.reconcileBalances(COMPANY);

    expect(res.rows[0]).toMatchObject({ ledgerRows: 0, ledgerNet: 0, drift: 77651 });
    expect(res.rows[0].direction).toBe('BALANCE_OVERSTATED');
  });

  it('ignores drift below the threshold so float noise cannot bury real findings', async () => {
    const svc = build({
      dataSource: {
        query: twoQueries(
          [{ warehouse_id: WH, item_id: ITEM, ledger_net: 100, ledger_rows: 2 }],
          [{ warehouse_id: WH, item_id: ITEM, on_hand: 100.00001, status: 'ACTIVE', uom_id: UOM, balance_rows: 1 }],
        ),
      },
    });

    const res = await svc.reconcileBalances(COMPANY, { minAbsDrift: 0.0001 });

    expect(res.driftPairs).toBe(0);
    expect(res.rows).toHaveLength(0);
  });

  it('an EMPTY division scope denies all instead of widening to every division', async () => {
    const query = jest.fn().mockResolvedValue([]);
    const svc = build({ dataSource: { query } });

    await svc.reconcileBalances(COMPANY, { allowedDivisionIds: [] });

    const sql = query.mock.calls.map((c: any[]) => String(c[0])).join('\n');
    expect(sql).toContain('AND 1 = 0');
    // Never an empty `= ANY(…)`, which would be a silent no-op filter.
    expect(sql).not.toContain('ANY($2::uuid[])');
  });

  it('a restricted division scope narrows BOTH the ledger and the balance query', async () => {
    const query = jest.fn().mockResolvedValue([]);
    const svc = build({ dataSource: { query } });

    await svc.reconcileBalances(COMPANY, { allowedDivisionIds: ['div-ccd'] });

    const calls = query.mock.calls;
    expect(calls).toHaveLength(2);
    for (const c of calls) {
      expect(String(c[0])).toContain('division_id = ANY(');
      // The scope is bound as a parameter array, never interpolated.
      expect(c[1]).toEqual(expect.arrayContaining([expect.arrayContaining(['div-ccd'])]));
    }
  });
});

describe('ProductionOpenStockService.reverseTransaction — append-only reversal', () => {
  const ledgerRow = (over: Record<string, any> = {}) => ({
    id: 'led-1',
    companyId: COMPANY,
    itemId: ITEM,
    warehouseId: WH,
    uomId: UOM,
    transactionType: 'PRODUCTION_OPENING',
    direction: 'IN',
    quantity: 500,
    notes: null,
    referenceType: 'PRODUCTION_ITEM_OPEN_STOCK',
    referenceId: null,
    referenceNumber: 'POS-001',
    locationId: null,
    batchId: null,
    divisionId: null,
    ...over,
  });

  const withTx = (balance: any) => {
    const manager = {
      findOne: jest.fn().mockResolvedValue(balance),
      save: jest.fn(async (_e: any, b: any) => b),
    };
    return manager;
  };

  it('writes a REVERSAL row instead of deleting the journal row', async () => {
    const stockLedgerService = { create: jest.fn().mockResolvedValue({ id: 'rev-1' }) };
    const manager = withTx({ onHand: 1000, available: 1000 });
    const svc = build({
      ledgerRepo: { findOne: jest.fn().mockResolvedValue(ledgerRow()) },
      stockLedgerService,
      dataSource: {
        query: jest.fn(),
        transaction: jest.fn(async (cb: any) => cb(manager)),
      },
    });

    await svc.reverseTransaction(COMPANY, 'led-1', 'u1');

    expect(stockLedgerService.create).toHaveBeenCalledTimes(1);
    expect(stockLedgerService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        transactionType: 'PRODUCTION_REVERSAL',
        direction: 'OUT',
        quantity: 500,
      }),
      expect.anything(),
    );
  });

  it('an IN is undone as OUT, and an OUT is undone as IN', async () => {
    const stockLedgerService = { create: jest.fn().mockResolvedValue({ id: 'rev-1' }) };
    const svc = build({
      ledgerRepo: { findOne: jest.fn().mockResolvedValue(ledgerRow({ direction: 'OUT' })) },
      stockLedgerService,
      dataSource: { query: jest.fn(), transaction: jest.fn(async (cb: any) => cb(withTx({ onHand: 100, available: 100 }))) },
    });

    await svc.reverseTransaction(COMPANY, 'led-1');

    expect(stockLedgerService.create).toHaveBeenCalledWith(
      expect.objectContaining({ direction: 'IN' }),
      expect.anything(),
    );
  });

  it('does NOT clamp the balance at zero — a real negative is preserved', async () => {
    // The old code did `Math.max(0, onHand - qty)`, which silently discarded
    // the shortfall. The number looked tidy and the ledger drifted ahead of
    // the books with nothing to show for it.
    const manager = withTx({ onHand: 100, available: 100 });
    const svc = build({
      ledgerRepo: { findOne: jest.fn().mockResolvedValue(ledgerRow({ quantity: 500, direction: 'IN' })) },
      dataSource: { query: jest.fn(), transaction: jest.fn(async (cb: any) => cb(manager)) },
    });

    await svc.reverseTransaction(COMPANY, 'led-1');

    // 100 − 500 = −400. Reported honestly, not floored to 0.
    expect(manager.save).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ onHand: -400, available: -400 }),
    );
  });

  it('the reversal note names the family, so it stays parseable', async () => {
    const stockLedgerService = { create: jest.fn().mockResolvedValue({ id: 'rev-1' }) };
    const svc = build({
      ledgerRepo: {
        findOne: jest.fn().mockResolvedValue(
          ledgerRow({ transactionType: 'PRODUCTION_OPENING', notes: 'Opening stock posted' }),
        ),
      },
      stockLedgerService,
      dataSource: { query: jest.fn(), transaction: jest.fn(async (cb: any) => cb(withTx({ onHand: 10, available: 10 }))) },
    });

    await svc.reverseTransaction(COMPANY, 'led-1');

    expect(stockLedgerService.create).toHaveBeenCalledWith(
      expect.objectContaining({ notes: expect.stringMatching(/^Reversal of PRODUCTION_OPENING\b/) }),
      expect.anything(),
    );
  });

  it('a reversal of a reversal resolves back to the ORIGINAL family', async () => {
    const stockLedgerService = { create: jest.fn().mockResolvedValue({ id: 'rev-1' }) };
    const svc = build({
      ledgerRepo: {
        findOne: jest.fn().mockResolvedValue(
          ledgerRow({
            transactionType: 'PRODUCTION_REVERSAL',
            direction: 'OUT',
            notes: 'Reversal of PRODUCTION_OPENING for transaction POS-001',
          }),
        ),
      },
      stockLedgerService,
      dataSource: { query: jest.fn(), transaction: jest.fn(async (cb: any) => cb(withTx({ onHand: 10, available: 10 }))) },
    });

    await svc.reverseTransaction(COMPANY, 'led-1');

    // Names PRODUCTION_OPENING, not PRODUCTION_REVERSAL — otherwise the pair
    // would never net to zero for anything reading the journal.
    expect(stockLedgerService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        notes: expect.stringMatching(/^Reversal of PRODUCTION_OPENING\b/),
        direction: 'IN',
      }),
      expect.anything(),
    );
  });

  it('a missing transaction is still a clean error, not a silent no-op', async () => {
    const svc = build({ ledgerRepo: { findOne: jest.fn().mockResolvedValue(null) } });
    await expect(svc.reverseTransaction(COMPANY, 'nope')).rejects.toThrow('Transaction record not found.');
  });
});
