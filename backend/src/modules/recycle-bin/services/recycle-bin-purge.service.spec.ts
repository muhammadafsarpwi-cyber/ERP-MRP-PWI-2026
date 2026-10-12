import { RecycleBinPurgeService } from './recycle-bin-purge.service';

/**
 * A DataSource stand-in that records every statement it is handed, so the
 * suite can assert on the SQL without a database.
 *
 * `stockLedgerRows` is what the reversal SELECT returns — the purge reads the
 * journal before it destroys anything, and the fake has to offer something to
 * read or the reversal path silently no-ops in every test.
 */
function fakeDataSource(stockLedgerRows: Record<string, any>[] = []) {
  const queries: { sql: string; params?: any[] }[] = [];
  const transactionQueries: { sql: string; params?: any[] }[] = [];
  const ds: any = {
    queries,
    transactionQueries,
    stockLedgerRows,
    query: jest.fn(async (sql: string, params?: any[]) => {
      queries.push({ sql, params });
      if (/^SELECT id FROM/i.test(sql)) return [{ id: 'row-1' }, { id: 'row-2' }];
      if (/COUNT\(\*\)/i.test(sql)) return [{ n: 3 }];
      if (/FROM stock_ledger/i.test(sql)) return stockLedgerRows;
      return { affected: 2 };
    }),
    transaction: jest.fn(async (fn: any) => {
      const manager = {
        query: jest.fn(async (sql: string, params?: any[]) => {
          transactionQueries.push({ sql, params });
          if (/FROM stock_ledger/i.test(sql)) return stockLedgerRows;
          return { affected: 2 };
        }),
      };
      return fn(manager);
    }),
  };
  return ds;
}

/** Balance-service stand-in that records the corrections it is asked to make. */
function fakeBalanceService() {
  const calls: any[][] = [];
  return {
    calls,
    updateBalance: jest.fn(async (...args: any[]) => {
      calls.push(args);
      return { onHand: 0 };
    }),
    findByItemWarehouse: jest.fn().mockResolvedValue(null),
  };
}

/** Ledger-service stand-in that records the reversal rows it is asked to write. */
function fakeLedgerService() {
  const calls: any[] = [];
  return {
    calls,
    create: jest.fn(async (data: any) => {
      calls.push(data);
      return { id: `rev-${calls.length}`, ...data };
    }),
  };
}

const COMPANY = '7725aa04-a270-4314-9e82-90949cbe7791';
const ITEM = '11111111-1111-1111-1111-111111111111';
const WH = '22222222-2222-2222-2222-222222222222';
const UOM = '33333333-3333-3333-3333-333333333333';

const ledgerRow = (over: Record<string, any> = {}) => ({
  id: 'led-1',
  company_id: COMPANY,
  item_id: ITEM,
  warehouse_id: WH,
  location_id: null,
  batch_id: null,
  uom_id: UOM,
  transaction_type: 'PRODUCTION_RECEIPT',
  direction: 'IN',
  quantity: 100,
  notes: null,
  ...over,
});

describe('RecycleBinPurgeService (30-day rolling auto-purge)', () => {
  const env = process.env;
  let ds: any;
  let balance: ReturnType<typeof fakeBalanceService>;
  let ledger: ReturnType<typeof fakeLedgerService>;
  let service: RecycleBinPurgeService;

  const build = (rows: Record<string, any>[] = []) => {
    ds = fakeDataSource(rows);
    balance = fakeBalanceService();
    ledger = fakeLedgerService();
    service = new RecycleBinPurgeService(ds, balance as any, ledger as any);
  };

  beforeEach(() => {
    process.env = { ...env };
    delete process.env.RECYCLE_BIN_AUTO_PURGE;
    delete process.env.RECYCLE_BIN_PURGE_DRY_RUN;
    delete process.env.RECYCLE_BIN_PURGE_RETENTION_DAYS;
    build();
  });

  afterEach(() => {
    service.onModuleDestroy();
    process.env = env;
  });

  describe('arming', () => {
    it('is DRY-RUN by default — a fresh install reports but never destroys', () => {
      expect(service.live).toBe(false);
      expect(service.dryRun).toBe(true);
      expect(() => service.onModuleInit()).not.toThrow();
      // Booting must not touch the database: the first sweep waits for the
      // next 03:00 trigger, so a deploy is inert by construction.
      expect(ds.query).not.toHaveBeenCalled();
    });

    it('arms LIVE destruction only on the exact string "true"', () => {
      for (const truthy of ['1', 'TRUE', 'yes', '']) {
        process.env.RECYCLE_BIN_AUTO_PURGE = truthy;
        expect(service.live).toBe(false);
        expect(service.dryRun).toBe(true);
      }

      process.env.RECYCLE_BIN_AUTO_PURGE = 'true';
      expect(service.live).toBe(true);
      expect(service.dryRun).toBe(false);
    });

    it('defaults to a 30-day retention window', () => {
      expect(service.retentionDays).toBe(30);
    });

    it('honours a configured retention window and rejects nonsense values', () => {
      process.env.RECYCLE_BIN_PURGE_RETENTION_DAYS = '90';
      expect(service.retentionDays).toBe(90);

      process.env.RECYCLE_BIN_PURGE_RETENTION_DAYS = '-5';
      expect(service.retentionDays).toBe(30);

      process.env.RECYCLE_BIN_PURGE_RETENTION_DAYS = 'abc';
      expect(service.retentionDays).toBe(30);
    });
  });

  describe('runSweep()', () => {
    it('in DRY RUN mode only counts — it never issues a DELETE', async () => {
      const report = await service.runSweep(true);

      expect(ds.transaction).not.toHaveBeenCalled();
      expect(ds.queries.every((q: { sql: string }) => !/^DELETE/i.test(q.sql))).toBe(true);
      expect(report.dryRun).toBe(true);
      // It still reports the blast radius so an operator can review it.
      expect(report.totalPurged).toBeGreaterThan(0);
    });

    it('applies the cutoff as now MINUS the retention window', async () => {
      const before = Date.now();
      await service.runSweep(true);
      const after = Date.now();

      const cutoffParam = ds.queries.find(
        (q: { sql: string }) => /^SELECT id FROM/i.test(q.sql),
      )?.params?.[0];
      expect(cutoffParam).toBeInstanceOf(Date);

      const thirtyDays = 30 * 24 * 60 * 60 * 1000;
      expect(cutoffParam.getTime()).toBeGreaterThanOrEqual(before - thirtyDays - 1000);
      expect(cutoffParam.getTime()).toBeLessThanOrEqual(after - thirtyDays + 1000);
    });

    it('destroys children BEFORE parents, inside one transaction per table', async () => {
      await service.runSweep(false);

      expect(ds.transaction).toHaveBeenCalled();

      const statements = ds.transactionQueries.map((q: { sql: string }) => q.sql);
      const childIdx = statements.findIndex((s: string) =>
        s.startsWith('DELETE FROM "production_entry_items"'),
      );
      const parentIdx = statements.findIndex((s: string) =>
        s.startsWith('DELETE FROM "production_entries"'),
      );

      expect(childIdx).toBeGreaterThanOrEqual(0);
      expect(parentIdx).toBeGreaterThanOrEqual(0);
      // FK direction: a parent cannot be removed while rows still point at it.
      expect(childIdx).toBeLessThan(parentIdx);
    });

    it('keeps sweeping when one table has not been migrated yet', async () => {
      // Simulate the migration not having been applied: the first target's
      // column does not exist. One unmigrated table must never stop the sweep.
      let calls = 0;
      ds.query.mockImplementation(async (sql: string) => {
        calls += 1;
        if (/production_entries/.test(sql)) {
          const err: any = new Error('column "deleted_at" does not exist');
          err.code = '42703';
          throw err;
        }
        if (/^SELECT id FROM/i.test(sql)) return [{ id: 'row-1' }];
        return { affected: 1 };
      });

      await expect(service.runSweep(false)).resolves.toBeTruthy();
      expect(calls).toBeGreaterThan(1);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  describe('deletion sync — purging a document must not strand its stock', () => {
    // The defect: a purge destroyed `production_entries` while the
    // `stock_ledger` rows they had posted stayed behind, so quantities kept
    // showing on `inventory_balances` with no document left to explain them.
    // Those rows are now reversed BEFORE the destroy, in the same transaction.

    it('a receipt still on the books is unwound from the balance before the destroy', async () => {
      build([ledgerRow()]); // IN 100, never reversed
      await service.runSweep(false);

      expect(balance.updateBalance).toHaveBeenCalledWith(
        COMPANY, ITEM, WH, null, null, UOM, 100, 'OUT', expect.anything(), true,
      );
    });

    it('an OUT consumption is put BACK on the balance', async () => {
      build([ledgerRow({ transaction_type: 'PRODUCTION_CONSUMPTION', direction: 'OUT', quantity: 40 })]);
      await service.runSweep(false);

      expect(balance.updateBalance).toHaveBeenCalledWith(
        COMPANY, ITEM, WH, null, null, UOM, 40, 'IN', expect.anything(), true,
      );
    });

    it('a document whose stock nets to zero moves NO balance, but is still unwound on the journal', async () => {
      // Receipt 100 in, consumption 100 out: the balance is already square, so
      // correcting it would be a no-op at best and a double-reversal at worst.
      // But the DOCUMENT is going away, so both of its journal rows must still
      // be cancelled — otherwise the ledger keeps movements attributed to an
      // entry that no longer exists. Balance and ledger are netted separately,
      // and this is the case that proves it.
      build([
        ledgerRow({ id: 'a', transaction_type: 'PRODUCTION_RECEIPT', direction: 'IN', quantity: 100 }),
        ledgerRow({ id: 'b', transaction_type: 'PRODUCTION_CONSUMPTION', direction: 'OUT', quantity: 100 }),
      ]);
      await service.runSweep(false);

      expect(balance.updateBalance).not.toHaveBeenCalled();
      expect(ledger.create).toHaveBeenCalledTimes(2);
      expect(ledger.create).toHaveBeenCalledWith(
        expect.objectContaining({ transactionType: 'PRODUCTION_REVERSAL', quantity: 100 }),
        expect.anything(),
      );
    });

    it('a HALF-reversed document tops up to exactly zero rather than overshooting', async () => {
      // Receipt 100, then a partial reversal of 40 → 60 still on the books.
      // Netting the family (100 − 40) emits ONE reversal of 60, not a second
      // full 100. Overshooting here is what originally drove balances negative
      // and made the matrix unexplainable.
      build([
        ledgerRow({ id: 'a', transaction_type: 'PRODUCTION_RECEIPT', direction: 'IN', quantity: 100 }),
        ledgerRow({
          id: 'b',
          transaction_type: 'PRODUCTION_REVERSAL',
          direction: 'OUT',
          quantity: 40,
          notes: 'Reversal of PRODUCTION_RECEIPT for production entry (M-04, 2026-09-01)',
        }),
      ]);
      await service.runSweep(false);

      expect(ledger.create).toHaveBeenCalledTimes(1);
      expect(ledger.create).toHaveBeenCalledWith(
        expect.objectContaining({ transactionType: 'PRODUCTION_REVERSAL', quantity: 60 }),
        expect.anything(),
      );
      expect(balance.updateBalance).toHaveBeenCalledWith(
        COMPANY, ITEM, WH, null, null, UOM, 60, 'OUT', expect.anything(), true,
      );
    });

    it('PRODUCTION_SCRAP is an audit row and is never counted as stock', async () => {
      build([ledgerRow({ transaction_type: 'PRODUCTION_SCRAP', direction: 'OUT', quantity: 12 })]);
      await service.runSweep(false);

      expect(balance.updateBalance).not.toHaveBeenCalled();
      expect(ledger.create).not.toHaveBeenCalled();
    });

    it('writes a PRODUCTION_REVERSAL row rather than deleting the journal', async () => {
      build([ledgerRow()]);
      await service.runSweep(false);

      expect(ledger.create).toHaveBeenCalledTimes(1);
      expect(ledger.create).toHaveBeenCalledWith(
        expect.objectContaining({
          transactionType: 'PRODUCTION_REVERSAL',
          direction: 'OUT',
          quantity: 100,
          referenceType: 'PRODUCTION_ENTRY',
        }),
        expect.anything(),
      );
    });

    it('the reversal happens INSIDE the transaction, before the deletes', async () => {
      build([ledgerRow()]);
      await service.runSweep(false);

      const statements = ds.transactionQueries.map((q: { sql: string }) => q.sql);
      const ledgerRead = statements.findIndex((s: string) => /FROM stock_ledger/i.test(s));
      const childIdx = statements.findIndex((s: string) =>
        s.startsWith('DELETE FROM "production_entry_items"'),
      );
      const parentIdx = statements.findIndex((s: string) =>
        s.startsWith('DELETE FROM "production_entries"'),
      );

      expect(ledgerRead).toBeGreaterThanOrEqual(0);
      expect(ledgerRead).toBeLessThan(childIdx);
      expect(childIdx).toBeLessThan(parentIdx);
    });

    it('DRY RUN reports the outstanding stock but writes nothing', async () => {
      build([ledgerRow()]);
      const report = await service.runSweep(true);

      expect(ds.transaction).not.toHaveBeenCalled();
      expect(balance.updateBalance).not.toHaveBeenCalled();
      expect(ledger.create).not.toHaveBeenCalled();

      const target = report.targets.find((t: any) => t.table === 'production_entries');
      expect(target?.ledgerRowsOutstanding).toBe(1);
      expect(target?.ledgerNetOutstanding).toBe(100);
    });

    it('the dry-run estimate and the live correction agree on the same rows', async () => {
      const rows = [
        ledgerRow({ id: 'a', transaction_type: 'PRODUCTION_RECEIPT', direction: 'IN', quantity: 100 }),
        ledgerRow({ id: 'b', transaction_type: 'PRODUCTION_CONSUMPTION', direction: 'OUT', quantity: 60 }),
      ];

      build(rows);
      const dry = await service.runSweep(true);
      const dryTarget = dry.targets.find((t: any) => t.table === 'production_entries');

      build(rows);
      await service.runSweep(false);

      expect(dryTarget?.ledgerNetOutstanding).toBe(40);
      expect(balance.updateBalance).toHaveBeenCalledWith(
        COMPANY, ITEM, WH, null, null, UOM, 40, 'OUT', expect.anything(), true,
      );
    });

    it('a target with no stock postings is untouched by the reversal path', async () => {
      build([ledgerRow()]);
      const report = await service.runSweep(true);

      // `customers` has no `stockLedgerReferenceType`, so it carries no
      // ledger keys at all rather than a misleading zero.
      const customerTarget = report.targets.find((t: any) => t.table === 'customers');
      expect(customerTarget).not.toHaveProperty('ledgerRowsOutstanding');
      expect(customerTarget).not.toHaveProperty('ledgerNetOutstanding');
    });
  });
});
