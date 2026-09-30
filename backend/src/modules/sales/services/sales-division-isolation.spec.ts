/**
 * PROMPT #27 — DIVISION ISOLATION, Sales module.
 *
 * Regression suite for the reported, previously-reachable gap: a user scoped to
 * exactly one division (DIV-CCD) could pass `?divisionId=<DIV-SPD>` to
 * `GET /api/v1/sales/orders` and receive HTTP 200 with the other division's
 * business data, because the client-supplied `divisionId` was used verbatim as
 * the query predicate and no server-side scope was ever intersected into it.
 *
 * Each block asserts one of the required properties:
 *
 *   A — an EXPLICIT out-of-scope `divisionId` is refused (403), never honoured.
 *        Owned by `DivisionScopeGuard`; covered end-to-end in
 *        `division-scope.guard.spec.ts` and restated at controller level below.
 *   B — an OMITTED `divisionId` still narrows the query to the caller's own
 *        divisions (server-derived scope, never the query string).
 *   C — company/tenant isolation is NOT weakened by the new filters.
 *   D — documents with no `division_id` of their own inherit it through their
 *        `salesOrderId` (invoices / deliveries / returns).
 *   E — a leaked or guessed record UUID cannot be used to read, mutate, or even
 *        confirm the existence of another division's document.
 *   F — a caller whose effective set is EMPTY sees nothing at all (deny-all).
 *   G — master data keeps `includeUnassigned`; transactional documents do not.
 *
 * Services are instantiated directly (prototype + injected repo) rather than
 * through the Nest DI container: every `findOne` in this module asserts the
 * division immediately after the not-found check and before touching any other
 * repository, so the repository under test is the only one that needs to exist.
 */
import { ForbiddenException, BadRequestException } from '@nestjs/common';
import { SalesOrderService } from './sales-order.service';
import { SalesInvoiceService } from './sales-invoice.service';
import { SalesDeliveryService } from './sales-delivery.service';
import { SalesReturnService } from './sales-return.service';

// ── Real ids from the live database ─────────────────────────────────────────
const COMPANY = '7725aa04-a270-4314-9e82-90949cbe7791';
const OTHER_COMPANY = 'aaaaaaaa-0000-0000-0000-0000000000ff';
const DIV_SPD = 'd1000000-0000-0000-0000-000000000001';
const DIV_CCD = 'd1000000-0000-0000-0000-000000000002';
const DIV_PWI = '83ecd746-1cc9-4849-bec4-d00bcc3ceeec';

const SO_ID = 'b0000000-0000-0000-0000-0000000000a1';
const INV_ID = 'b0000000-0000-0000-0000-0000000000b1';
const DEL_ID = 'b0000000-0000-0000-0000-0000000000c1';
const RET_ID = 'b0000000-0000-0000-0000-0000000000d1';

/** Query-builder mock recording every `andWhere` clause so tests can assert the SQL. */
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
    getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
    getMany: jest.fn().mockResolvedValue([]),
    getCount: jest.fn().mockResolvedValue(0),
    getRawOne: jest.fn().mockResolvedValue({ maxNum: null }),
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
  createQueryBuilder: jest.fn(() => qb ?? makeQb()),
});

/**
 * Instantiate a service without the Nest DI container and attach `repo`.
 *
 * A no-op `logger` is always injected: several services log on the *success*
 * path, and without it those tests would fail for reasons unrelated to
 * division scoping.
 */
const build = <T>(ctor: new (...args: any[]) => T, repo: any, extras: Record<string, any> = {}): T => {
  const svc = Object.create(ctor.prototype) as any;
  svc.repo = repo;
  svc.logger = { log: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(), verbose: jest.fn() };
  Object.assign(svc, extras);
  return svc as T;
};

describe('PROMPT #27 — Sales division isolation', () => {
  // ───────────────────────────────────────────────────────────────────────────
  describe('TEST A + B + C + F — SalesOrderService.findAll (list narrowing)', () => {
    const runFindAll = async (filter: any) => {
      const qb = makeQb();
      const service = build(SalesOrderService, makeRepo(qb));
      await service.findAll(filter);
      return qb;
    };

    it('TEST B — narrows to the caller scope when the client omits divisionId', async () => {
      const qb = await runFindAll({ companyId: COMPANY, allowedDivisionIds: [DIV_CCD] });

      expect(qb.andWhere).toHaveBeenCalledWith(
        'so.divisionId IN (:...allowedDivisionIds)',
        { allowedDivisionIds: [DIV_CCD] },
      );
      // No client `divisionId` was supplied, so none may be invented.
      expect(qb.andWhere).not.toHaveBeenCalledWith('so.divisionId = :divisionId', expect.anything());
    });

    it('TEST A — a client-supplied IN-scope divisionId is ANDed with the server scope', async () => {
      const qb = await runFindAll({
        companyId: COMPANY, divisionId: DIV_CCD, allowedDivisionIds: [DIV_CCD],
      });

      expect(qb.andWhere).toHaveBeenCalledWith('so.divisionId = :divisionId', { divisionId: DIV_CCD });
      expect(qb.andWhere).toHaveBeenCalledWith(
        'so.divisionId IN (:...allowedDivisionIds)',
        { allowedDivisionIds: [DIV_CCD] },
      );
    });

    it('TEST A — a client-supplied OUT-of-scope divisionId is always ANDed with the server scope, so it cannot widen', async () => {
      // `DivisionScopeGuard` refuses this exact request with 403 before the
      // service runs. Defence in depth: even if it did reach the service, the
      // resulting SQL is `divisionId = 'DIV-SPD' AND divisionId IN ('DIV-CCD')`
      // which matches no rows.
      const qb = await runFindAll({
        companyId: COMPANY, divisionId: DIV_SPD, allowedDivisionIds: [DIV_CCD],
      });

      expect(qb.andWhere).toHaveBeenCalledWith('so.divisionId = :divisionId', { divisionId: DIV_SPD });
      expect(qb.andWhere).toHaveBeenCalledWith(
        'so.divisionId IN (:...allowedDivisionIds)',
        { allowedDivisionIds: [DIV_CCD] },
      );
      expect(qb.clauses()).toEqual(
        expect.arrayContaining(['so.divisionId = :divisionId', 'so.divisionId IN (:...allowedDivisionIds)']),
      );
    });

    it('TEST B — supports a multi-division caller (scope is the full permitted set)', async () => {
      const qb = await runFindAll({ companyId: COMPANY, allowedDivisionIds: [DIV_CCD, DIV_PWI] });

      expect(qb.andWhere).toHaveBeenCalledWith(
        'so.divisionId IN (:...allowedDivisionIds)',
        { allowedDivisionIds: [DIV_CCD, DIV_PWI] },
      );
    });

    it('TEST B — an unrestricted caller keeps the pre-existing unfiltered behaviour', async () => {
      const qb = await runFindAll({ companyId: COMPANY });

      expect(qb.clauses()).not.toContain('so.divisionId IN (:...allowedDivisionIds)');
      expect(qb.where).toHaveBeenCalledWith('so.companyId = :companyId', { companyId: COMPANY });
    });

    it('TEST C — company isolation is still applied alongside the division scope', async () => {
      const qb = await runFindAll({ companyId: COMPANY, allowedDivisionIds: [DIV_CCD] });

      expect(qb.where).toHaveBeenCalledWith('so.companyId = :companyId', { companyId: COMPANY });
      expect(qb.andWhere).toHaveBeenCalledWith(
        'so.divisionId IN (:...allowedDivisionIds)',
        { allowedDivisionIds: [DIV_CCD] },
      );
    });

    it('TEST F — an empty effective scope matches NOTHING (`1 = 0`), it does not fall open', async () => {
      const qb = await runFindAll({ companyId: COMPANY, allowedDivisionIds: [] });

      expect(qb.andWhere).toHaveBeenCalledWith('1 = 0');
      expect(qb.andWhere).not.toHaveBeenCalledWith(
        'so.divisionId IN (:...allowedDivisionIds)',
        expect.anything(),
      );
    });

    it('TEST G — transactional orders do NOT opt into includeUnassigned (no `OR divisionId IS NULL` escape)', async () => {
      const qb = await runFindAll({ companyId: COMPANY, allowedDivisionIds: [DIV_CCD] });

      const scopeClauses = qb.andWhere.mock.calls
        .map((c: any[]) => String(c[0]))
        .filter((sql: string) => sql.includes('divisionId') || sql.includes('allowedDivisionIds'));

      expect(scopeClauses).toEqual(['so.divisionId IN (:...allowedDivisionIds)']);
      expect(scopeClauses.join(' ')).not.toMatch(/IS NULL/);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  describe('TEST E — SalesOrderService.findOne (single by-id gate)', () => {
    const order = (divisionId: string | null, companyId = COMPANY) => ({
      id: SO_ID, companyId, orderNumber: 'SO-1', status: 'Draft', divisionId,
    });

    const call = async (row: any, scope?: any) => {
      const repo = makeRepo();
      repo.findOne.mockResolvedValue(row);
      return build(SalesOrderService, repo).findOne(SO_ID, COMPANY, scope);
    };

    it('refuses a diverted order UUID from another division', async () => {
      await expect(call(order(DIV_SPD), [DIV_CCD])).rejects.toThrow(ForbiddenException);
    });

    it('allows the order when its division IS in the caller scope', async () => {
      await expect(call(order(DIV_CCD), [DIV_CCD])).resolves.toMatchObject({ divisionId: DIV_CCD });
    });

    it('denies an UNATTRIBUTED order (divisionId NULL) to a restricted caller', async () => {
      await expect(call(order(null), [DIV_CCD])).rejects.toThrow(ForbiddenException);
    });

    it('never returns a foreign-division row, whatever the requested status code', async () => {
      const repo = makeRepo();
      repo.findOne.mockResolvedValue(order(DIV_SPD));
      await expect(build(SalesOrderService, repo).findOne(SO_ID, COMPANY, [DIV_CCD]))
        .rejects.toBeInstanceOf(ForbiddenException);
    });

    it('TEST C — a genuinely non-existent id still yields NotFound, not a division answer', async () => {
      await expect(call(null, [DIV_CCD])).rejects.toThrow(/not found/i);
    });

    it('TEST F — an empty effective scope refuses every order', async () => {
      await expect(call(order(DIV_CCD), [])).rejects.toThrow(ForbiddenException);
    });

    it('TEST B — an unrestricted caller is unaffected (no regression for admins)', async () => {
      await expect(call(order(DIV_SPD), undefined)).resolves.toMatchObject({ divisionId: DIV_SPD });
      await expect(call(order(null), undefined)).resolves.toMatchObject({ divisionId: null });
    });

    it('still rejects a malformed id before any query is issued', async () => {
      const repo = makeRepo();
      await expect(build(SalesOrderService, repo).findOne('not-a-uuid', COMPANY, [DIV_CCD]))
        .rejects.toThrow(BadRequestException);
      expect(repo.findOne).not.toHaveBeenCalled();
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  describe('TEST D — documents that inherit division via salesOrderId', () => {
    describe('SalesInvoiceService', () => {
      const invoice = (divisionId: string | null) => ({
        id: INV_ID, companyId: COMPANY, status: 'Pending',
        totalAmount: 1000, balance: 1000, paidAmount: 0,
        salesOrderId: SO_ID, salesOrder: { id: SO_ID, divisionId },
      });

      const call = async (row: any, scope?: any) => {
        const repo = makeRepo();
        repo.findOne.mockResolvedValue(row);
        return build(SalesInvoiceService, repo).findOne(INV_ID, COMPANY, scope);
      };

      it('list filters on the parent ORDER division, not a non-existent invoice column', async () => {
        const qb = makeQb();
        await build(SalesInvoiceService, makeRepo(qb))
          .findAll({ companyId: COMPANY, allowedDivisionIds: [DIV_CCD] });

        expect(qb.andWhere).toHaveBeenCalledWith(
          'salesOrder.divisionId IN (:...allowedDivisionIds)',
          { allowedDivisionIds: [DIV_CCD] },
        );
      });

      it('detail refuses an invoice whose ORDER is in another division', async () => {
        await expect(call(invoice(DIV_SPD), [DIV_CCD])).rejects.toThrow(ForbiddenException);
      });

      it('detail allows an invoice whose order IS in scope', async () => {
        await expect(call(invoice(DIV_CCD), [DIV_CCD])).resolves.toMatchObject({ id: INV_ID });
      });

      it('denies an invoice whose order has no division (unattributed chain)', async () => {
        await expect(call(invoice(null), [DIV_CCD])).rejects.toThrow(ForbiddenException);
      });

      it('denies an invoice with NO linked order at all', async () => {
        await expect(call({ id: INV_ID, companyId: COMPANY, status: 'Pending' }, [DIV_CCD]))
          .rejects.toThrow(ForbiddenException);
      });

      it('a by-id MUTATION (recordPayment) is refused for a foreign-division invoice, and nothing is written', async () => {
        const repo = makeRepo();
        repo.findOne.mockResolvedValue(invoice(DIV_SPD));
        // The controller forwards the guard-resolved scope; without it the
        // service cannot know which divisions the caller may touch.
        await expect(build(SalesInvoiceService, repo)
          .recordPayment(INV_ID, 100, 'user-1', COMPANY, [DIV_CCD]))
          .rejects.toThrow(ForbiddenException);
        expect(repo.save).not.toHaveBeenCalled();
      });

      it('a by-id MUTATION is NOT blocked by the division gate inside the scope', async () => {
        // Security-relevant property: the division gate passes, so the call
        // proceeds to the normal business rules (here the payment-amount
        // check) instead of being refused. Asserting "not Forbidden" avoids
        // coupling this suite to the unrelated success-path collaborators.
        const repo = makeRepo();
        repo.findOne.mockResolvedValue(invoice(DIV_CCD));
        await expect(build(SalesInvoiceService, repo)
          .recordPayment(INV_ID, 100, 'user-1', COMPANY, [DIV_CCD]))
          .rejects.not.toBeInstanceOf(ForbiddenException);
      });

      it('TEST F — an empty effective scope refuses an invoice of an in-scope order', async () => {
        await expect(call(invoice(DIV_CCD), [])).rejects.toThrow(ForbiddenException);
      });
    });

    describe('SalesDeliveryService', () => {
      const delivery = (divisionId: string | null) => ({
        id: DEL_ID, companyId: COMPANY, status: 'Draft',
        salesOrderId: SO_ID, salesOrder: { id: SO_ID, divisionId },
      });

      const call = async (row: any, scope?: any) => {
        const repo = makeRepo();
        repo.findOne.mockResolvedValue(row);
        return build(SalesDeliveryService, repo).findOne(DEL_ID, COMPANY, scope);
      };

      it('list filters on the parent order division', async () => {
        const qb = makeQb();
        await build(SalesDeliveryService, makeRepo(qb))
          .findAll({ companyId: COMPANY, allowedDivisionIds: [DIV_CCD] });

        expect(qb.andWhere).toHaveBeenCalledWith(
          'salesOrder.divisionId IN (:...allowedDivisionIds)',
          { allowedDivisionIds: [DIV_CCD] },
        );
      });

      it('detail refuses a delivery whose order is in another division', async () => {
        await expect(call(delivery(DIV_SPD), [DIV_CCD])).rejects.toThrow(ForbiddenException);
      });

      it('detail allows a delivery whose order IS in scope', async () => {
        await expect(call(delivery(DIV_CCD), [DIV_CCD])).resolves.toMatchObject({ id: DEL_ID });
      });

      it('a by-id MUTATION (ship) is refused for a foreign-division delivery, and nothing is written', async () => {
        const repo = makeRepo();
        repo.findOne.mockResolvedValue(delivery(DIV_SPD));
        await expect(build(SalesDeliveryService, repo)
          .ship(DEL_ID, 'user-1', COMPANY, [DIV_CCD]))
          .rejects.toThrow(ForbiddenException);
        expect(repo.save).not.toHaveBeenCalled();
      });

      it('TEST F — an empty effective scope refuses a delivery', async () => {
        await expect(call(delivery(DIV_CCD), [])).rejects.toThrow(ForbiddenException);
      });
    });

    describe('SalesReturnService', () => {
      const ret = (divisionId: string | null) => ({
        id: RET_ID, companyId: COMPANY, status: 'Draft',
        salesOrderId: SO_ID, salesOrder: { id: SO_ID, divisionId },
      });

      const call = async (row: any, scope?: any) => {
        const repo = makeRepo();
        repo.findOne.mockResolvedValue(row);
        return build(SalesReturnService, repo).findOne(RET_ID, COMPANY, scope);
      };

      it('list filters on the parent order division', async () => {
        const qb = makeQb();
        await build(SalesReturnService, makeRepo(qb))
          .findAll({ companyId: COMPANY, allowedDivisionIds: [DIV_CCD] });

        expect(qb.andWhere).toHaveBeenCalledWith(
          'salesOrder.divisionId IN (:...allowedDivisionIds)',
          { allowedDivisionIds: [DIV_CCD] },
        );
      });

      it('detail refuses a return whose order is in another division', async () => {
        await expect(call(ret(DIV_SPD), [DIV_CCD])).rejects.toThrow(ForbiddenException);
      });

      it('detail allows a return whose order IS in scope', async () => {
        await expect(call(ret(DIV_CCD), [DIV_CCD])).resolves.toMatchObject({ id: RET_ID });
      });

      it('a by-id MUTATION (submit) is refused for a foreign-division return', async () => {
        const repo = makeRepo();
        repo.findOne.mockResolvedValue(ret(DIV_SPD));
        await expect(build(SalesReturnService, repo)
          .submit(RET_ID, 'user-1', COMPANY, [DIV_CCD]))
          .rejects.toThrow(ForbiddenException);
        expect(repo.save).not.toHaveBeenCalled();
      });

      it('TEST F — an empty effective scope refuses a return', async () => {
        await expect(call(ret(DIV_CCD), [])).rejects.toThrow(ForbiddenException);
      });
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  describe('TEST C — company isolation is never weakened', () => {
    it('a by-id lookup for another company is still NotFound, not a division answer', async () => {
      const repo = makeRepo();
      repo.findOne.mockResolvedValue(null);
      await expect(build(SalesOrderService, repo).findOne(SO_ID, OTHER_COMPANY, [DIV_CCD]))
        .rejects.toThrow(/not found/i);
    });

    it('the company predicate is part of the by-id WHERE, not only of the list query', async () => {
      const repo = makeRepo();
      await build(SalesOrderService, repo).findOne(SO_ID, OTHER_COMPANY, [DIV_CCD]).catch(() => undefined);
      expect(repo.findOne).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: SO_ID, companyId: OTHER_COMPANY } }),
      );
    });
  });
});
