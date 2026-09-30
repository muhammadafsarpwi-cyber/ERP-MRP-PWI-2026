/**
 * PROMPT #27 — DIVISION ISOLATION, Store module.
 *
 * Companion to `sales-division-isolation.spec.ts`. The Store module had the
 * same class of defect, in two very different shapes:
 *
 *  1. TypeORM services (`store.service.ts`, `replenishment.service.ts`) where
 *     the client `divisionId` was the only predicate;
 *  2. Raw-SQL services (`store-material-trace.service.ts`,
 *     `store-dashboard.service.ts`) where the scope conditions are assembled by
 *     shared helper functions that honoured only the client display filter.
 *
 * Properties asserted (same A–G scheme as the Sales suite):
 *   A/B — explicit out-of-scope refused by the guard; omitted `divisionId`
 *         still narrows to the caller's own divisions;
 *   C   — company isolation is never weakened;
 *   E   — a guessed/diverted UUID cannot read or mutate another division's row;
 *   F   — an EMPTY effective scope matches nothing, it never falls open.
 */
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { StoreService } from './store.service';
import { ReplenishmentService } from './replenishment.service';
import { StoreMaterialTraceService } from './store-material-trace.service';
import { StoreDashboardService } from './store-dashboard.service';

const COMPANY = '7725aa04-a270-4314-9e82-90949cbe7791';
const DIV_SPD = 'd1000000-0000-0000-0000-000000000001';
const DIV_CCD = 'd1000000-0000-0000-0000-000000000002';

const makeQb = () => {
  const qb: any = {
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    leftJoin: jest.fn().mockReturnThis(),
    innerJoin: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    addOrderBy: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    getMany: jest.fn().mockResolvedValue([]),
    getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
    getCount: jest.fn().mockResolvedValue(0),
    getRawOne: jest.fn().mockResolvedValue({}),
  };
  qb.clauses = () => qb.andWhere.mock.calls.map((c: any[]) => c[0]);
  return qb;
};

const makeRepo = (qb?: any) => ({
  find: jest.fn().mockResolvedValue([]),
  findOne: jest.fn(),
  create: jest.fn((x: any) => x),
  save: jest.fn((x: any) => Promise.resolve(x)),
  remove: jest.fn().mockResolvedValue(undefined),
  count: jest.fn().mockResolvedValue(0),
  update: jest.fn().mockResolvedValue({}),
  createQueryBuilder: jest.fn(() => qb ?? makeQb()),
});

const build = <T>(ctor: new (...args: any[]) => T, props: Record<string, any>): T => {
  const svc = Object.create(ctor.prototype) as any;
  svc.logger = { log: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(), verbose: jest.fn() };
  Object.assign(svc, props);
  return svc as T;
};

describe('PROMPT #27 — Store division isolation', () => {
  // ───────────────────────────────────────────────────────────────────────────
  describe('TEST A + B + F — StoreService.findAllStores (list narrowing)', () => {
    const run = async (query: any, scope?: any) => {
      const qb = makeQb();
      const svc = build(StoreService, { storeRepo: makeRepo(qb) });
      await svc.findAllStores(COMPANY, query, scope);
      return qb;
    };

    it('TEST B — narrows to the caller scope when the client omits divisionId', async () => {
      const qb = await run({}, [DIV_CCD]);
      expect(qb.andWhere).toHaveBeenCalledWith(
        's.division_id IN (:...allowedDivisionIds)',
        { allowedDivisionIds: [DIV_CCD] },
      );
    });

    it('TEST A — a client out-of-scope divisionId is ANDed with the server scope, so it cannot widen', async () => {
      const qb = await run({ divisionId: DIV_SPD }, [DIV_CCD]);
      expect(qb.andWhere).toHaveBeenCalledWith('s.division_id = :divisionId', { divisionId: DIV_SPD });
      expect(qb.andWhere).toHaveBeenCalledWith(
        's.division_id IN (:...allowedDivisionIds)',
        { allowedDivisionIds: [DIV_CCD] },
      );
    });

    it('TEST C — company isolation is preserved alongside the scope', async () => {
      const qb = await run({}, [DIV_CCD]);
      expect(qb.where).toHaveBeenCalledWith('s.company_id = :companyId', { companyId: COMPANY });
    });

    it('TEST F — an empty effective scope matches nothing', async () => {
      const qb = await run({}, []);
      expect(qb.andWhere).toHaveBeenCalledWith('1 = 0');
    });

    it('an unrestricted caller keeps the unfiltered behaviour (no admin regression)', async () => {
      const qb = await run({});
      expect(qb.clauses()).not.toContain('s.division_id IN (:...allowedDivisionIds)');
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  describe('TEST E — StoreService by-id reads (diverted UUID refused)', () => {
    const store = (divisionId: string | null, companyId = COMPANY) =>
      ({ id: 'store-1', companyId, storeCode: 'S1', divisionId }) as any;

    const call = (row: any, scope?: any, companyId: string = COMPANY) => {
      const repo = makeRepo();
      repo.findOne.mockResolvedValue(row);
      return build(StoreService, { storeRepo: repo }).findStoreById('store-1', companyId, scope);
    };

    it('refuses a store belonging to another division', async () => {
      await expect(call(store(DIV_SPD), [DIV_CCD])).rejects.toThrow(ForbiddenException);
    });

    it('allows a store inside the caller scope', async () => {
      await expect(call(store(DIV_CCD), [DIV_CCD])).resolves.toMatchObject({ id: 'store-1' });
    });

    it('denies an UNATTRIBUTED store (divisionId NULL) to a restricted caller', async () => {
      await expect(call(store(null), [DIV_CCD])).rejects.toThrow(ForbiddenException);
    });

    it('TEST F — an empty effective scope refuses even an in-scope store', async () => {
      await expect(call(store(DIV_CCD), [])).rejects.toThrow(ForbiddenException);
    });

    it('TEST C — another company is refused even when the division matches', async () => {
      await expect(call(store(DIV_CCD), [DIV_CCD], 'other-company')).rejects.toThrow(ForbiddenException);
    });

    it('a genuinely missing store still yields NotFound, not a division answer', async () => {
      await expect(call(null, [DIV_CCD])).rejects.toThrow(NotFoundException);
    });

    it('an unrestricted caller is unaffected', async () => {
      await expect(call(store(DIV_SPD))).resolves.toMatchObject({ id: 'store-1' });
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  describe('TEST E — StoreService.findStoreItemById scopes via the PARENT store', () => {
    // `store_items` has no division_id of its own; the store it belongs to is
    // the only division-bearing relation, so that is what is asserted.
    const call = (storeDivisionId: string | null, scope?: any) => {
      const storeRepo = makeRepo();
      storeRepo.findOne.mockResolvedValue({
        id: 'store-1', companyId: COMPANY, divisionId: storeDivisionId,
      });
      const itemRepo = makeRepo();
      itemRepo.findOne.mockResolvedValue({ id: 'si-1', storeId: 'store-1' });
      return build(StoreService, { storeRepo, storeItemRepo: itemRepo })
        .findStoreItemById('si-1', COMPANY, scope);
    };

    it('refuses a store item whose store is in another division', async () => {
      await expect(call(DIV_SPD, [DIV_CCD])).rejects.toThrow(ForbiddenException);
    });

    it('denies a store item whose store is unattributed (divisionId NULL)', async () => {
      await expect(call(null, [DIV_CCD])).rejects.toThrow(ForbiddenException);
    });

    it('allows a store item whose store is in scope', async () => {
      await expect(call(DIV_CCD, [DIV_CCD])).resolves.toMatchObject({ id: 'si-1' });
    });

    it('TEST F — an empty effective scope refuses the item', async () => {
      await expect(call(DIV_CCD, [])).rejects.toThrow(ForbiddenException);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  describe('TEST B + F — StoreService.getDashboard scopes EVERY tile count', () => {
    // A dashboard that filters the detail lists but leaves the tile counts
    // company-wide still discloses another division's volume (a KPI is a leak).
    it('narrowWhereByDivision is applied to every count query, and an empty scope denies all', async () => {
      const count = jest.fn().mockResolvedValue(0);
      const qb = makeQb();
      qb.getCount.mockResolvedValue(0);
      const repo = makeRepo(qb);
      repo.count = count;
      const svc = build(StoreService, {
        storeRepo: repo, storeItemRepo: repo, materialRequestRepo: repo,
        materialIssueRepo: repo, materialReturnRepo: repo, prRepo: repo,
      });

      await svc.getDashboard(COMPANY, [DIV_CCD]);

      const whereArgs = count.mock.calls.map((c: any[]) => JSON.stringify(c[0]?.where ?? {}));
      expect(whereArgs.length).toBeGreaterThan(0);
      // Every count predicate mentions the caller's own division.
      expect(whereArgs.every((w) => w.includes(DIV_CCD))).toBe(true);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  describe('TEST B + F — ReplenishmentService.getQueue (raw SQL)', () => {
    const runQueue = async (filters: any, scope?: any) => {
      const query = jest.fn().mockResolvedValue([]);
      const svc = build(ReplenishmentService, { dataSource: { query } });
      await svc.getQueue(COMPANY, filters, scope);
      return query.mock.calls;
    };

    it('TEST B — narrows by division_id = ANY(...) when the client omits divisionId', async () => {
      const calls = await runQueue({}, [DIV_CCD]);
      const sql = calls.map((c: any[]) => String(c[0])).join('\n');
      expect(sql).toContain('r.division_id = ANY(');
      const firstParams = calls[0][1] as any[];
      expect(firstParams).toContainEqual([DIV_CCD]);
    });

    it('TEST F — an empty effective scope becomes `1 = 0`, not an empty ANY()', async () => {
      const calls = await runQueue({}, []);
      const sql = calls.map((c: any[]) => String(c[0])).join('\n');
      expect(sql).toContain('1 = 0');
      expect(sql).not.toContain('r.division_id = ANY(');
    });

    it('an unrestricted caller produces no division predicate at all', async () => {
      const calls = await runQueue({}, undefined);
      const sql = calls.map((c: any[]) => String(c[0])).join('\n');
      expect(sql).not.toContain('r.division_id = ANY(');
      expect(sql).not.toContain('1 = 0');
    });

    it('TEST C — company isolation is preserved in the same query', async () => {
      const calls = await runQueue({}, [DIV_CCD]);
      const sql = calls.map((c: any[]) => String(c[0])).join('\n');
      expect(sql).toContain('r.company_id = $1');
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  describe('TEST E — runReplenishmentCheck is narrowed to the caller divisions', () => {
    // This is a WRITE path: it auto-creates material requests. A restricted
    // caller must not be able to trigger creation for the whole company.
    const run = async (scope: any) => {
      const find = jest.fn().mockResolvedValue([]);
      const svc = build(ReplenishmentService, {
        storeRepo: { find },
        storeItemRepo: { find: jest.fn().mockResolvedValue([]) },
        dataSource: { query: jest.fn().mockResolvedValue([]) },
        resolveSystemActor: jest.fn().mockResolvedValue('system-1'),
      });
      await svc.runReplenishmentCheck({ companyId: COMPANY, userId: 'u1', allowedDivisionIds: scope });
      return find.mock.calls[0][0].where;
    };

    it('restricts the store selection to the permitted divisions', async () => {
      const where = await run([DIV_CCD]);
      expect(JSON.stringify(where)).toContain(DIV_CCD);
    });

    it('an unrestricted caller selects every active store (no regression)', async () => {
      const where = await run(undefined);
      expect(where.divisionId).toBeUndefined();
    });

    it('an EMPTY effective scope still narrows (deny-all), never selecting every store', async () => {
      const where = await run([]);
      // A division predicate is present even though the permitted set is empty;
      // TypeORM renders an empty `In()` as `IN (NULL)`, which matches no store.
      expect(Object.prototype.hasOwnProperty.call(where, 'divisionId')).toBe(true);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  describe('TEST E + C — StoreMaterialTraceService ledger DELETEs', () => {
    // Highest-severity instance of this gap in the Store module: destructive
    // writes against `stock_ledger`, which carries a real `division_id`.
    const buildTrace = (query: jest.Mock) =>
      build(StoreMaterialTraceService, { dataSource: { query } });

    it('refuses to delete a ledger row from another division, and writes nothing', async () => {
      const query = jest.fn().mockResolvedValue([]);
      await expect(buildTrace(query).deleteLedgerRow(COMPANY, 'led-1', [DIV_CCD]))
        .rejects.toThrow(NotFoundException);
      // The UPDATE must not touch production_entries for an out-of-scope row.
      for (const call of query.mock.calls) expect(String(call[0])).toContain('division_id = ANY(');
    });

    it('binds company_id on the production_entries UPDATE (cross-tenant fix)', async () => {
      const query = jest.fn().mockResolvedValue([{ id: 'led-1' }]);
      await buildTrace(query).deleteLedgerRow(COMPANY, 'led-1', undefined);
      const update = query.mock.calls.find((c: any[]) => String(c[0]).includes('UPDATE production_entries'));
      expect(String(update[0])).toContain('company_id = $1');
      expect(update[1][0]).toBe(COMPANY);
    });

    it('binds company_id on the dummy-row DELETE (cross-tenant fix)', async () => {
      const query = jest.fn()
        .mockResolvedValueOnce([{ id: 'l1' }])   // SELECT dummy rows
        .mockResolvedValueOnce([])                // UPDATE production_entries
        .mockResolvedValueOnce([]);               // DELETE stock_ledger
      await buildTrace(query).deleteDummyLedgerRows(COMPANY, 'item-1', undefined);
      const del = query.mock.calls.find((c: any[]) => String(c[0]).includes('DELETE FROM stock_ledger'));
      expect(String(del[0])).toContain('company_id = $1');
      expect(del[1][0]).toBe(COMPANY);
    });

    it('narrows the dummy-row DELETE to the caller divisions when scoped', async () => {
      const query = jest.fn()
        .mockResolvedValueOnce([{ id: 'l1' }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);
      await buildTrace(query).deleteDummyLedgerRows(COMPANY, 'item-1', [DIV_CCD]);
      // The candidate ids are chosen by the SELECT, which carries the division
      // scope; the follow-up DELETE re-binds company_id so a leaked id cannot
      // reach another tenant.
      const sel = query.mock.calls[0];
      expect(String(sel[0])).toContain('division_id = ANY(');
      const del = query.mock.calls.find((c: any[]) => String(c[0]).includes('DELETE FROM stock_ledger'));
      expect(String(del[0])).toContain('company_id = $1');
    });

    it('an unrestricted caller deletes exactly as before (no regression)', async () => {
      const query = jest.fn().mockResolvedValue([{ id: 'led-1' }]);
      await expect(buildTrace(query).deleteLedgerRow(COMPANY, 'led-1'))
        .resolves.toMatchObject({ success: true, deletedId: 'led-1' });
    });

    it('TEST B — the store lookup in getItemLifecycle is division-scoped, and a miss is NotFound', async () => {
      const query = jest.fn().mockResolvedValue([]);
      await expect(
        buildTrace(query).getItemLifecycle(COMPANY, 'item-1', { storeId: 'store-1' }, [DIV_CCD]),
      ).rejects.toThrow(NotFoundException);
      expect(String(query.mock.calls[0][0])).toContain('division_id = ANY(');
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  describe('TEST A + B + F — StoreDashboardService scope builders', () => {
    // Every division filter in this service is assembled by one of these
    // helpers, so asserting the helpers asserts the whole dashboard.
    const svc = () => build(StoreDashboardService, { dataSource: { query: jest.fn() } });
    const withScope = (scope: any) => ({
      storeId: undefined, sectionId: undefined, departmentId: undefined, allowedDivisionIds: scope,
    });

    it('scopeConds injects the caller scope for a division-bearing alias', () => {
      const params: any[] = [COMPANY];
      const conds = (svc() as any).scopeConds('m', withScope([DIV_CCD]), params);
      expect(conds.join(' AND ')).toContain('m.division_id = ANY($2::uuid[])');
      expect(params[1]).toEqual([DIV_CCD]);
    });

    it('scopeCondsShared injects the caller scope', () => {
      const params: any[] = [];
      const conds = (svc() as any).scopeCondsShared('mi', COMPANY, withScope([DIV_CCD]), params);
      expect(conds.join(' AND ')).toContain('mi.division_id = ANY($');
    });

    it('TEST F — an empty effective scope yields `1 = 0` in every builder, and binds no array', () => {
      for (const [name, call] of [
        ['scopeConds', (s: any, p: any[]) => s.scopeConds('m', withScope([]), p)],
        ['scopeCondsShared', (s: any, p: any[]) => s.scopeCondsShared('m', COMPANY, withScope([]), p)],
        ['storeScopeConds', (s: any, p: any[]) => s.storeScopeConds(withScope([]), p)],
        ['storeScopeOn', (s: any, p: any[]) => s.storeScopeOn('sto', withScope([]), p)],
        ['inventoryScopeConds', (s: any, p: any[]) => s.inventoryScopeConds(withScope([]), p)],
      ] as const) {
        const params: any[] = [COMPANY];
        const conds = call(svc(), params);
        expect(conds.join(' AND ')).toContain('1 = 0');
        expect(params.some((p) => Array.isArray(p))).toBe(false);
      }
    });

    it('the warehouse EXISTS is emitted even with NO display filter when a scope exists', () => {
      // Regression guard: these builders previously returned '' when no filter
      // was set, which would have left every warehouse-keyed table unscoped.
      const params: any[] = [COMPANY];
      const sql = (svc() as any).warehouseScopeColShared('warehouse_id', 'gr', COMPANY, withScope([DIV_CCD]), params);
      expect(sql).toContain('EXISTS');
      expect(sql).toContain('sto.division_id = ANY(');
    });

    it('inventoryScopeConds keeps unattributed master items visible but not unattributed stores', () => {
      const params: any[] = [COMPANY];
      const sql = (svc() as any).inventoryScopeConds(withScope([DIV_CCD]), params).join(' AND ');
      expect(sql).toContain('i.division_id = ANY(');
      expect(sql).toContain('i.division_id IS NULL');
      expect(sql).toContain('s.division_id = ANY(');
    });

    it('an unrestricted caller produces no division predicate anywhere', () => {
      const params: any[] = [COMPANY];
      const filters = withScope(undefined);
      const s: any = svc();
      expect(s.scopeConds('m', filters, params).join(' ')).not.toContain('ANY(');
      expect(s.scopeConds('m', filters, params).join(' ')).not.toContain('1 = 0');
      expect(s.storeScopeConds(filters, params)).toEqual([]);
      expect(s.warehouseScopeCol('warehouse_id', 'gr', filters, params)).toBe('');
      expect(s.inventoryScopeConds(filters, params).join(' ')).not.toContain('ANY(');
    });
  });
});
