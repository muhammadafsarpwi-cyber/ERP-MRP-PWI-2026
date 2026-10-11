import { RecycleBinPurgeService } from './recycle-bin-purge.service';

/**
 * A DataSource stand-in that records every statement it is handed, so the
 * suite can assert on the SQL without a database.
 */
function fakeDataSource() {
  const queries: { sql: string; params?: any[] }[] = [];
  const transactionQueries: { sql: string; params?: any[] }[] = [];
  const ds: any = {
    queries,
    transactionQueries,
    query: jest.fn(async (sql: string, params?: any[]) => {
      queries.push({ sql, params });
      if (/^SELECT id FROM/i.test(sql)) return [{ id: 'row-1' }, { id: 'row-2' }];
      if (/COUNT\(\*\)/i.test(sql)) return [{ n: 3 }];
      return { affected: 2 };
    }),
    transaction: jest.fn(async (fn: any) => {
      const manager = {
        query: jest.fn(async (sql: string, params?: any[]) => {
          transactionQueries.push({ sql, params });
          return { affected: 2 };
        }),
      };
      return fn(manager);
    }),
  };
  return ds;
}

describe('RecycleBinPurgeService (30-day rolling auto-purge)', () => {
  const env = process.env;
  let ds: any;
  let service: RecycleBinPurgeService;

  beforeEach(() => {
    process.env = { ...env };
    delete process.env.RECYCLE_BIN_AUTO_PURGE;
    delete process.env.RECYCLE_BIN_PURGE_DRY_RUN;
    delete process.env.RECYCLE_BIN_PURGE_RETENTION_DAYS;
    ds = fakeDataSource();
    service = new RecycleBinPurgeService(ds);
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
});
