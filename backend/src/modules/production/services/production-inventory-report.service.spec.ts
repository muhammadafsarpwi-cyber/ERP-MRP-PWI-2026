import { NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { Item, ItemType } from '../../item/entities';
import { InventoryBalance, StockLedger } from '../../inventory/entities';
import { ProductionEntry, ProductionEntryItem, ProductionEntryItemKind, ProductionOrder } from '../entities';
import { BillOfMaterials, BomLine } from '../../bom/entities';
import { ProductionInventoryReportService } from './production-inventory-report.service';

const COMPANY_ID = 'a0000000-0000-4000-8000-000000000001';
const ITEM_ID = 'c1000000-0000-4000-8000-000000000005';
const OTHER_ITEM_ID = 'c1000000-0000-4000-8000-000000000006';

const makeItem = (over: Partial<Item> = {}): Item =>
  ({
    id: ITEM_ID,
    itemCode: 'RM-WIRE-120',
    name: '1.20mm Wire [SAMPLE]',
    itemType: 'RAW_MATERIAL',
    companyId: COMPANY_ID,
    productionInItemId: null,
    wireSizeMm: '1.2',
    thicknessMm: null,
    widthMm: null,
    divisionId: 'div-1',
    division: { id: 'div-1', name: 'Wire Division' },
    section: null,
    departmentId: 'dept-1',
    department: { id: 'dept-1', name: 'Wire Drawing' },
    baseUom: { id: 'uom-1', code: 'M', name: 'Meter' },
    ...over,
  }) as Item;

type QbBehavior = {
  getMany?: any[];
  getRawMany?: any[];
  getRawOne?: any;
};

function makeQb(behavior: QbBehavior = {}): any {
  const qb: any = {};
  qb.__setParameters = [];
  qb.__andWhere = [];
  qb.__addSelect = [];
  const chain = () => qb;
  ['select', 'where', 'groupBy', 'orderBy', 'addOrderBy', 'innerJoin', 'leftJoinAndSelect', 'skip', 'take']
    .forEach((m) => { qb[m] = jest.fn(chain); });
  qb.addSelect = jest.fn((sql: string) => { qb.__addSelect.push(String(sql)); return qb; });
  qb.andWhere = jest.fn((sql: string, params?: any) => { qb.__andWhere.push({ sql, params }); return qb; });
  qb.setParameters = jest.fn((params: any) => { qb.__setParameters.push(params); return qb; });
  qb.getMany = jest.fn().mockResolvedValue(behavior.getMany ?? []);
  qb.getRawMany = jest.fn().mockResolvedValue(behavior.getRawMany ?? []);
  qb.getRawOne = jest.fn().mockResolvedValue(behavior.getRawOne ?? {});
  return qb;
}

function repoWithQbs(qbs: any[]): Repository<any> {
  const queue = [...qbs];
  const repo: any = { createQueryBuilder: jest.fn(() => queue.shift() ?? makeQb()) };
  return repo;
}

const ONE_ITEM = [makeItem()];

const aggregateRow = (over: any = {}) => ({
  itemId: ITEM_ID,
  openingIn: '40',
  openingOut: '0',
  rangeIn: '10',
  rangeOut: '60',
  movIn: '0',
  movOut: '60',
  consumed: '60',
  scrapOut: '2',
  lastMovementDate: '2026-09-05T08:00:00.000Z',
  ...over,
});

const balanceRow = (over: any = {}) => ({ itemId: ITEM_ID, onHand: '5', reserved: '2', available: '3', ...over });

const serviceWith = (opts: { items?: Item[]; aggregate?: any[]; balance?: any[]; produced?: any[]; required?: any[]; masterItems?: any[]; item?: Item | null; ledgerRows?: any[]; openingRow?: any; aggRow?: any; company?: { timezone: string } | null }) => {
  const itemQb = makeQb({ getMany: opts.items ?? ONE_ITEM });
  const masterQb = makeQb({ getMany: opts.masterItems ?? [] });
  // itemRepo serves only the item scope (1st call) and the flow-chain master
  // snapshot (2nd call) — REQUIRED no longer queries the item master.
  const itemRepo = repoWithQbs([itemQb, masterQb]);
  (itemRepo as any).findOne = jest.fn().mockResolvedValue(opts.item === undefined ? makeItem() : opts.item);

  const { ledgerRepo, openingQb, detailQb, rangeAggQb } = (() => {
    if (opts.ledgerRows !== undefined || opts.openingRow !== undefined || opts.aggRow !== undefined) {
      const qbs = [];
      const oQb = opts.openingRow !== undefined ? makeQb({ getRawOne: opts.openingRow }) : makeQb();
      if (opts.openingRow !== undefined) qbs.push(oQb);
      const dQb = makeQb({ getMany: opts.ledgerRows ?? [] });
      qbs.push(dQb);
      const aQb = opts.aggRow !== undefined ? makeQb({ getRawOne: opts.aggRow }) : makeQb();
      if (opts.aggRow !== undefined) qbs.push(aQb);
      return { ledgerRepo: repoWithQbs(qbs), openingQb: oQb, detailQb: dQb, rangeAggQb: aQb };
    }
    return { ledgerRepo: repoWithQbs([makeQb({ getRawMany: opts.aggregate ?? [aggregateRow()] })]), openingQb: null, detailQb: null, rangeAggQb: null };
  })();

  const balanceQb = makeQb({ getRawMany: opts.balance ?? [balanceRow()] });
  const balanceRepo = repoWithQbs([balanceQb]);
  const producedQb = makeQb({ getRawMany: opts.produced ?? [{ itemId: ITEM_ID, produced: '10', entryCount: 1 }] });
  // Option A: REQUIRED is built from production_orders × bom_lines through the
  // entry repo's EntityManager (no constructor/DI change).
  const requiredQb = makeQb({ getRawMany: opts.required ?? [{ itemId: ITEM_ID, required: '15', entryCount: 2 }] });
  const entryRepo = repoWithQbs([producedQb]);
  (entryRepo as any).manager = { createQueryBuilder: jest.fn(() => requiredQb) };

  const companyRepo = { findOne: jest.fn().mockResolvedValue(opts.company === undefined ? { timezone: 'Asia/Karachi' } : opts.company) };

  const service = new ProductionInventoryReportService(
    itemRepo as unknown as Repository<Item>,
    ledgerRepo as unknown as Repository<StockLedger>,
    balanceRepo as unknown as Repository<InventoryBalance>,
    entryRepo as unknown as Repository<ProductionEntry>,
    companyRepo as unknown as Repository<any>,
  ) as any;
  service.__qbs = { itemQb, requiredQb, masterQb, balanceQb, producedQb, openingQb, detailQb, rangeAggQb, ledgerRepo, entryRepo, companyRepo };
  return service;
};

describe('ProductionInventoryReportService.getReport', () => {
  it('mirrors real aggregate math: opening, closing, shortage, produced, required, consumed', async () => {
    const service = serviceWith({});
    const report = await service.getReport(COMPANY_ID);

    expect(report.items).toHaveLength(1);
    const row = report.items[0];
    expect(row.itemCode).toBe('RM-WIRE-120');
    expect(row.openingBalance).toBe(40);
    expect(row.totalIn).toBe(10);
    expect(row.totalOut).toBe(60);
    expect(row.closingBalance).toBe(-10);
    expect(row.shortage).toBe(10);
    expect(row.status).toBe('SHORT');
    expect(row.scrapOut).toBe(2);
    expect(row.consumed).toBe(60);
    expect(row.produced).toBe(10);
    expect(row.required).toBe(15);
    expect(row.onHand).toBe(5);
    expect(row.reserved).toBe(2);
    expect(row.available).toBe(3);
    expect(row.departmentName).toBe('Wire Drawing');
    expect(row.uomCode).toBe('M');
  });

  it('returns OK with zero shortage when the closing balance is positive', async () => {
    const service = serviceWith({
      aggregate: [aggregateRow({ rangeOut: '10' })],
    });
    const report = await service.getReport(COMPANY_ID);
    expect(report.items[0].closingBalance).toBe(40);
    expect(report.items[0].shortage).toBe(0);
    expect(report.items[0].status).toBe('OK');
  });

  it('narrows only the IN/OUT columns when a movementType filter is applied', async () => {
    const service = serviceWith({});
    const report = await service.getReport(COMPANY_ID, { movementType: 'PRODUCTION_ISSUE' });
    const row = report.items[0];
    expect(row.totalIn).toBe(0);
    expect(row.totalOut).toBe(60);
    expect(row.closingBalance).toBe(-10);
    expect(row.movementType).toBe('PRODUCTION_ISSUE');
  });

  it('returns an empty summary when no real inventory presence exists', async () => {
    const service = serviceWith({ items: [] });
    const report = await service.getReport(COMPANY_ID);
    expect(report.items).toHaveLength(0);
    expect(report.summary.itemCount).toBe(0);
    expect(report.summary.shortItems).toBe(0);
    expect(report.summary.available).toBe(0);
  });

  it('aggregates the summary across multiple items', async () => {
    const second = makeItem({ id: OTHER_ITEM_ID, itemCode: 'RM-PVC-400', name: 'PVC 4mm', itemType: ItemType.RAW_MATERIAL, wireSizeMm: null });
    const service = serviceWith({
      items: [makeItem(), second],
      aggregate: [
        aggregateRow(),
        { itemId: OTHER_ITEM_ID, openingIn: '20', openingOut: '0', rangeIn: '0', rangeOut: '5', movIn: '0', movOut: '0', consumed: '0', scrapOut: '0', lastMovementDate: '2026-09-04T08:00:00.000Z' },
      ],
      balance: [balanceRow(), { itemId: OTHER_ITEM_ID, onHand: '7', reserved: '1', available: '6' }],
      required: [{ itemId: ITEM_ID, required: '15', entryCount: 2 }],
    });
    const report = await service.getReport(COMPANY_ID);
    expect(report.items).toHaveLength(2);
    expect(report.summary.itemCount).toBe(2);
    expect(report.summary.onHand).toBe(12);
    expect(report.summary.available).toBe(9);
    expect(report.summary.totalOut).toBe(65);
  });

  it('TASK37-P: report reflects a real production posting — input store OUT + output IN (demo)', async () => {
    const rmWire = makeItem({
      id: ITEM_ID,
      itemCode: 'RM-WIRE-001',
      name: '1.20mm Wire 1200m',
      itemType: ItemType.RAW_MATERIAL,
      departmentId: 'dept-raw',
      department: { id: 'dept-raw', name: 'Raw Material Store' } as any,
    });
    const flatWire = makeItem({
      id: OTHER_ITEM_ID,
      itemCode: 'FLAT-WIRE-001',
      name: 'Flat Wire 2.0x1.2',
      itemType: ItemType.FINISHED_GOOD,
      productionInItemId: ITEM_ID,
      departmentId: 'dept-ccd',
      department: { id: 'dept-ccd', name: 'CCD Flattening' } as any,
    });
    const service = serviceWith({
      items: [rmWire, flatWire],
      aggregate: [
        // RM-WIRE-001: 100 KG opening → 50 KG consumed OUT for the run.
        { itemId: ITEM_ID, openingIn: '100', openingOut: '0', rangeIn: '0', rangeOut: '50', movIn: '0', movOut: '50', consumed: '50', scrapOut: '0', lastMovementDate: '2026-09-06T06:00:00.000Z' },
        // FLAT-WIRE-001: 0 opening → 48 KG received IN (good output; 2 KG scrap audit).
        { itemId: OTHER_ITEM_ID, openingIn: '0', openingOut: '0', rangeIn: '48', rangeOut: '0', movIn: '48', movOut: '0', consumed: '0', scrapOut: '2', lastMovementDate: '2026-09-06T06:05:00.000Z' },
      ],
      balance: [
        balanceRow({ onHand: '50', reserved: '0', available: '50' }),
        balanceRow({ itemId: OTHER_ITEM_ID, onHand: '48', reserved: '0', available: '48' }),
      ],
      required: [
        { itemId: ITEM_ID, required: '50', entryCount: 1 },
      ],
      produced: [
        { itemId: OTHER_ITEM_ID, produced: '48', entryCount: 1 },
      ],
    });
    const report = await service.getReport(COMPANY_ID);
    const rm = report.items.find((r: any) => r.itemCode === 'RM-WIRE-001')!;
    const flat = report.items.find((r: any) => r.itemCode === 'FLAT-WIRE-001')!;

    expect(rm.openingBalance).toBe(100);
    expect(rm.totalOut).toBe(50);
    expect(rm.closingBalance).toBe(50);
    expect(rm.consumed).toBe(50);
    expect(rm.status).toBe('OK');
    expect(rm.departmentName).toBe('Raw Material Store');

    expect(flat.openingBalance).toBe(0);
    expect(flat.totalIn).toBe(48);
    expect(flat.closingBalance).toBe(48);
    expect(flat.scrapOut).toBe(2);
    expect(flat.produced).toBe(48);
    expect(flat.status).toBe('OK');
  });
});

describe('ProductionInventoryReportService report date semantics (TASK #39)', () => {
  const aggregateQbOf = (service: any) =>
    (service.__qbs.ledgerRepo.createQueryBuilder as jest.Mock).mock.results[0].value;

  it('window is the company business day: Asia/Karachi 2026-09-06 → [2026-09-05T19:00Z, 2026-09-06T19:00Z)', async () => {
    const service = serviceWith({});
    await service.getReport(COMPANY_ID, { dateFrom: '2026-09-06', dateTo: '2026-09-06' });
    const qb = aggregateQbOf(service);
    const params = qb.__setParameters[0];
    expect(params.dateFrom).toBeInstanceOf(Date);
    expect(params.dateTo).toBeInstanceOf(Date);
    expect(params.dateFrom.toISOString()).toBe('2026-09-05T19:00:00.000Z');
    expect(params.dateTo.toISOString()).toBe('2026-09-06T19:00:00.000Z');
    expect(qb.__addSelect.some((s: string) => s.includes('transactionDate >= :dateFrom'))).toBe(true);
    expect(qb.__addSelect.some((s: string) => s.includes('transactionDate < :dateTo'))).toBe(true);
    expect(qb.__addSelect.some((s: string) => s.includes('transactionDate <= :dateTo'))).toBe(false);
    expect(qb.__addSelect.some((s: string) => s.includes('transactionDate <= :dateFrom'))).toBe(false);
  });

  it('dateFrom maps to local-midnight start; dateTo maps to the EXCLUSIVE next-day start', async () => {
    const service = serviceWith({});
    await service.getReport(COMPANY_ID, { dateFrom: '2026-09-08' });
    const startOnly = aggregateQbOf(service).__setParameters[0];
    expect(startOnly.dateFrom.toISOString()).toBe('2026-09-07T19:00:00.000Z');
    expect(startOnly.dateTo).toBeNull();

    const svc2 = serviceWith({});
    await svc2.getReport(COMPANY_ID, { dateTo: '2026-09-08' });
    const endOnly = aggregateQbOf(svc2).__setParameters[0];
    expect(endOnly.dateFrom).toBeNull();
    expect(endOnly.dateTo.toISOString()).toBe('2026-09-08T19:00:00.000Z');
  });

  it('produced keeps the raw entry_date strings; REQUIRED binds the shared business-day window', async () => {
    const service = serviceWith({});
    await service.getReport(COMPANY_ID, { dateFrom: '2026-09-06', dateTo: '2026-09-10' });
    const producedCalls = service.__qbs.producedQb.__andWhere.filter((x: any) => x.sql.includes('pe.entryDate'));
    expect(producedCalls).toEqual([
      { sql: 'pe.entryDate >= :dateFrom', params: { dateFrom: '2026-09-06' } },
      { sql: 'pe.entryDate <= :dateTo', params: { dateTo: '2026-09-10' } },
    ]);

    // Task #2 — REQUIRED no longer binds raw date strings against entry_date:
    // it now binds the SAME [start, end) business-day instants as the CONSUMED
    // ledger aggregate (dateFrom → local midnight of 2026-09-06 in the company
    // timezone Asia/Karachi; dateTo → exclusive local midnight of 2026-09-11).
    const requiredFrom = service.__qbs.requiredQb.__andWhere.find((x: any) => String(x.sql).includes('>= :dateFrom'));
    const requiredTo = service.__qbs.requiredQb.__andWhere.find((x: any) => String(x.sql).includes('< :dateTo'));
    expect(requiredFrom).toEqual({
      sql: 'COALESCE(po.plannedStartDate, po.plannedEndDate) >= :dateFrom',
      params: { dateFrom: new Date('2026-09-05T19:00:00.000Z') },
    });
    expect(requiredTo).toEqual({
      sql: 'COALESCE(po.plannedStartDate, po.plannedEndDate) < :dateTo',
      params: { dateTo: new Date('2026-09-10T19:00:00.000Z') },
    });
    expect(service.__qbs.requiredQb.__andWhere.some((x: any) => String(x.sql).includes('pe.entryDate'))).toBe(false);
  });

  it('falls back to legacy UTC when the company timezone is unset', async () => {
    const service = serviceWith({ company: null });
    await service.getReport(COMPANY_ID, { dateFrom: '2026-09-06', dateTo: '2026-09-06' });
    const params = aggregateQbOf(service).__setParameters[0];
    expect(params.dateFrom.toISOString()).toBe('2026-09-06T00:00:00.000Z');
    expect(params.dateTo.toISOString()).toBe('2026-09-07T00:00:00.000Z');
  });

  it('rejects a malformed business-date filter with a clear error', async () => {
    const service = serviceWith({});
    await expect(service.getReport(COMPANY_ID, { dateFrom: '06-09-2026' })).rejects.toThrow(
      /YYYY-MM-DD/,
    );
  });
});

describe('ProductionInventoryReportService — REQUIRED is Option A planning demand (Production Orders × BOM)', () => {
  it('aggregates open production orders × their BOM lines per input item', async () => {
    const service = serviceWith({});
    await service.getReport(COMPANY_ID);

    // Root entity is the production order; demand flows order → pinned BOM → component line.
    expect(service.__qbs.entryRepo.manager.createQueryBuilder).toHaveBeenCalledWith(ProductionOrder, 'po');

    const qb = service.__qbs.requiredQb;
    expect(qb.select).toHaveBeenCalledWith('bl.itemId', 'itemId');
    expect(qb.groupBy).toHaveBeenCalledWith('bl.itemId');

    const joins = qb.innerJoin.mock.calls.map((c: any[]) => [c[0], c[1], String(c[2])]);
    expect(joins).toEqual([
      [BillOfMaterials, 'bom', expect.stringContaining('bom.id = po.bomId')],
      [BomLine, 'bl', expect.stringContaining('bl.bomId = bom.id')],
    ]);

    // planned_quantity × bom_lines.quantity — never the old retrospective SUM(pe.actualQuantity).
    const selects = qb.__addSelect.join(' | ');
    expect(selects).toContain('SUM(po.plannedQuantity * bl.quantity)');
    expect(selects).not.toContain('SUM(pe.actualQuantity)');

    const clauses = qb.__andWhere.map((c: any) => ({ sql: String(c.sql), params: c.params }));
    expect(String(qb.where.mock.calls[0]?.[0] ?? '')).toContain('po.companyId = :companyId');
    expect(clauses.some((c: any) => c.sql.includes('bl.itemId IN (:...itemIds)'))).toBe(true);
    // A recycled BOM must never leak demand back in (Recycle-Bin contract).
    expect(clauses.some((c: any) => c.sql.includes('bom.deletedAt IS NULL'))).toBe(true);

    // Active demand = every status except the terminal ones.
    const statusClause = clauses.find((c: any) => c.sql.includes('po.status'));
    expect(statusClause.params.closedStatuses).toEqual(['COMPLETED', 'CANCELLED']);

    // The retrospective production-entry source is gone from REQUIRED.
    expect(clauses.some((c: any) => c.sql.includes('pe.entryDate'))).toBe(false);
    expect(qb.innerJoin).not.toHaveBeenCalledWith(ProductionEntry, expect.anything(), expect.anything());
  });

  it('binds the exact same [start, end) business-day window as the CONSUMED ledger side', async () => {
    const service = serviceWith({});
    await service.getReport(COMPANY_ID, { dateFrom: '2026-09-06', dateTo: '2026-09-06' });

    const reqFrom = service.__qbs.requiredQb.__andWhere.find((c: any) => String(c.sql).includes('>= :dateFrom'));
    const reqTo = service.__qbs.requiredQb.__andWhere.find((c: any) => String(c.sql).includes('< :dateTo'));
    expect(reqFrom.params.dateFrom.toISOString()).toBe('2026-09-05T19:00:00.000Z');
    expect(reqTo.params.dateTo.toISOString()).toBe('2026-09-06T19:00:00.000Z');

    // The CONSUMED aggregate binds the identical instants: [start, end).
    const ledger = (service.__qbs.ledgerRepo.createQueryBuilder as jest.Mock).mock.results[0].value;
    const ledgerParams = ledger.__setParameters[0];
    expect(ledgerParams.dateFrom).toEqual(reqFrom.params.dateFrom);
    expect(ledgerParams.dateTo).toEqual(reqTo.params.dateTo);

    // CONSUMED is the OUT (PRODUCTION_CONSUMPTION + PRODUCTION_ISSUE) sum inside that window.
    const consumedSelect = ledger.__addSelect.find((s: string) =>
      s.includes("transactionType IN ('PRODUCTION_CONSUMPTION', 'PRODUCTION_ISSUE')"),
    );
    expect(consumedSelect).toBeDefined();
    expect(consumedSelect).toContain('transactionDate >= :dateFrom');
    expect(consumedSelect).toContain('transactionDate < :dateTo');
    expect(consumedSelect).not.toContain('transactionDate <= :dateTo');
  });
});

describe('ProductionInventoryReportService.getItemLedger date semantics (TASK #39)', () => {
  it('opening is strictly before the business-day start; rows span [start, end)', async () => {
    const service = serviceWith({ ledgerRows: [], openingRow: { openingIn: '40', openingOut: '0' }, aggRow: { aggIn: '0', aggOut: '0' } });
    await service.getItemLedger(COMPANY_ID, ITEM_ID, { dateFrom: '2026-09-06', dateTo: '2026-09-06' });

    const openQb = service.__qbs.openingQb;
    const openingCond = openQb.__andWhere.find((x: any) => x.sql.includes('transactionDate < :dateFrom'));
    expect(openingCond.params.dateFrom.toISOString()).toBe('2026-09-05T19:00:00.000Z');

    const detail = service.__qbs.detailQb;
    const from = detail.__andWhere.find((x: any) => x.sql.includes('transactionDate >= :dateFrom'));
    const to = detail.__andWhere.find((x: any) => x.sql.includes('transactionDate < :dateTo'));
    expect(from.params.dateFrom.toISOString()).toBe('2026-09-05T19:00:00.000Z');
    expect(to.params.dateTo.toISOString()).toBe('2026-09-06T19:00:00.000Z');
    expect(detail.__andWhere.some((x: any) => x.sql.includes('transactionDate <= :dateTo'))).toBe(false);
  });
});

describe('ProductionInventoryReportService.getItemLedger', () => {
  const ledgerRow = (id: string, quantity: string, direction: string, date = '2026-09-01T08:00:00.000Z') => ({
    id,
    transactionDate: date,
    transactionType: direction === 'IN' ? 'PRODUCTION_RECEIPT' : 'PRODUCTION_ISSUE',
    direction,
    quantity,
    item: { id: ITEM_ID, itemCode: 'RM-WIRE-120', name: '1.20mm Wire' },
    warehouse: { id: 'wh-1', warehouseCode: 'WIP-CCD', name: 'WIP CCD' },
    uom: { id: 'uom-1', code: 'M' },
    batch: null,
    division: { id: 'div-1', name: 'Wire Division' },
    section: null,
    department: { id: 'dept-1', name: 'Wire Drawing' },
    referenceType: 'production_entry',
    referenceId: 'pe-1',
    referenceNumber: 'PE-2026-00001',
    notes: null,
  });

  it('computes opening balance, running balance and closing balance from real rows', async () => {
    const rows = [
      ledgerRow('r1', '10', 'IN'),
      ledgerRow('r2', '60', 'OUT'),
    ];
    const service = serviceWith({ ledgerRows: rows, openingRow: { openingIn: '40', openingOut: '0' }, aggRow: { aggIn: '10', aggOut: '60' } });
    const detail = await service.getItemLedger(COMPANY_ID, ITEM_ID);

    expect(detail.openingBalance).toBe(40);
    expect(detail.rows).toHaveLength(2);
    expect(detail.rows[0].runningBalance).toBe(50);
    expect(detail.rows[1].runningBalance).toBe(-10);
    expect(detail.totalIn).toBe(10);
    expect(detail.totalOut).toBe(60);
    expect(detail.closingBalance).toBe(-10);
    expect(detail.truncated).toBe(false);
    expect(detail.totalLedgerRows).toBe(2);
    expect(detail.item.itemCode).toBe('RM-WIRE-120');
  });

  it('caps the visible rows at 500 and flags truncation while keeping full count', async () => {
    const rows = Array.from({ length: 510 }, (_, i) => ledgerRow(`r${i}`, '1', 'OUT'));
    const service = serviceWith({ ledgerRows: rows, openingRow: { openingIn: '510', openingOut: '0' }, aggRow: { aggIn: '0', aggOut: '510' } });
    const detail = await service.getItemLedger(COMPANY_ID, ITEM_ID);

    expect(detail.rows).toHaveLength(500);
    expect(detail.truncated).toBe(true);
    expect(detail.totalLedgerRows).toBe(510);
    expect(detail.closingBalance).toBe(0);
    expect(detail.totalOut).toBe(510);
  });

  it('rejects an item that does not belong to the company', async () => {
    const service = serviceWith({ item: null });
    await expect(service.getItemLedger(COMPANY_ID, ITEM_ID)).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('ProductionInventoryReportService flow chain + reconciliation (TASK #39 Part G)', () => {
  const rmWire = makeItem({ id: ITEM_ID, itemCode: 'RM-WIRE-001', name: '1.20mm Wire', itemType: ItemType.RAW_MATERIAL });
  const flatWire = makeItem({ id: OTHER_ITEM_ID, itemCode: 'FLAT-WIRE-001', name: 'Flat Wire', itemType: ItemType.SEMI_FINISHED, productionInItemId: ITEM_ID });
  const pvc475 = makeItem({ id: 'c1000000-0000-4000-8000-000000000007', itemCode: 'PVC-475', name: 'PVC 4.75mm', itemType: ItemType.FINISHED_GOOD, productionInItemId: OTHER_ITEM_ID });

  const basicRows = (itemId: string) => ({ itemId, openingIn: '0', openingOut: '0', rangeIn: '10', rangeOut: '0', movIn: '10', movOut: '0', consumed: '0', scrapOut: '0', lastMovementDate: '2026-09-06T06:00:00.000Z' });

  it('TASK39-G1: builds the source → item → consumers chain from productionInItemId links', async () => {
    const service = serviceWith({
      items: [rmWire, flatWire, pvc475],
      aggregate: [basicRows(ITEM_ID), basicRows(OTHER_ITEM_ID), basicRows(pvc475.id)],
      balance: [{ itemId: ITEM_ID }, { itemId: OTHER_ITEM_ID }, { itemId: pvc475.id }],
      produced: [{ itemId: OTHER_ITEM_ID, produced: '48', entryCount: 1 }],
      required: [{ itemId: ITEM_ID, required: '50', entryCount: 1 }, { itemId: OTHER_ITEM_ID, required: '48', entryCount: 1 }],
      masterItems: [rmWire, flatWire, pvc475],
    });
    const report = await service.getReport(COMPANY_ID);

    const rm = report.items.find((r: any) => r.itemCode === 'RM-WIRE-001')!;
    const flat = report.items.find((r: any) => r.itemCode === 'FLAT-WIRE-001')!;
    const pvc = report.items.find((r: any) => r.itemCode === 'PVC-475')!;

    // RM-WIRE-001 is a raw source: no production input, feeds FLAT-WIRE-001.
    expect(rm.flow.flowStatus).toBe('SOURCE');
    expect(rm.flow.source).toBeNull();
    expect(rm.flow.consumers).toHaveLength(1);
    expect(rm.flow.consumers[0]).toMatchObject({ itemId: OTHER_ITEM_ID, itemCode: 'FLAT-WIRE-001', inScope: true });

    // FLAT-WIRE-001 consumes RM-WIRE-001 and feeds PVC-475.
    expect(flat.flow.flowStatus).toBe('CHAIN');
    expect(flat.flow.source).toMatchObject({ itemId: ITEM_ID, itemCode: 'RM-WIRE-001', inScope: true });
    expect(flat.flow.consumers).toHaveLength(1);
    expect(flat.flow.consumers[0]).toMatchObject({ itemCode: 'PVC-475', inScope: true });

    // PVC-475 is the chain tail: consumes FLAT, has no consumers.
    expect(pvc.flow.flowStatus).toBe('CHAIN');
    expect(pvc.flow.source).toMatchObject({ itemId: OTHER_ITEM_ID, itemCode: 'FLAT-WIRE-001', inScope: true });
    expect(pvc.flow.consumers).toHaveLength(0);

    expect(report.summary.flowSourceItems).toBe(1);
    expect(report.summary.flowChainItems).toBe(2);
    expect(report.summary.flowConsumersPresent).toBe(2);
  });

  it('TASK39-G2: every row is reconciled — Closing === Opening + IN − OUT from the real ledger', async () => {
    const service = serviceWith({
      aggregate: [aggregateRow()],
      masterItems: [makeItem()],
    });
    const report = await service.getReport(COMPANY_ID);
    const row = report.items[0];
    // 40 opening → 10 IN → 60 OUT ⇒ -10 closing, integral everywhere.
    expect(row.closingBalance).toBe(-10);
    expect(row.reconciled).toBe(true);
    expect(report.summary.reconciledItems).toBe(1);
  });

  it('TASK39-G3: scope filters never hide the chain — out-of-scope sources/consumers stay mapped with inScope=false', async () => {
    const service = serviceWith({
      items: [flatWire],
      aggregate: [basicRows(OTHER_ITEM_ID)],
      balance: [{ itemId: OTHER_ITEM_ID }],
      produced: [{ itemId: OTHER_ITEM_ID, produced: '48', entryCount: 1 }],
      required: [{ itemId: ITEM_ID, required: '48', entryCount: 1 }],
      masterItems: [rmWire, flatWire, pvc475],
    });
    const report = await service.getReport(COMPANY_ID);
    const flat = report.items.find((r: any) => r.itemCode === 'FLAT-WIRE-001')!;

    expect(flat.flow.flowStatus).toBe('CHAIN');
    expect(flat.flow.source).toMatchObject({ itemId: ITEM_ID, itemCode: 'RM-WIRE-001', inScope: false });
    expect(flat.flow.consumers).toHaveLength(1);
    expect(flat.flow.consumers[0]).toMatchObject({ itemCode: 'PVC-475', inScope: false });
    expect(report.summary.flowChainItems).toBe(1);
    expect(report.summary.flowSourceItems).toBe(0);
  });
});

/**
 * A daily production entry is ONE parent record whose `actual_quantity` is the
 * DOCUMENT TOTAL (live proof: 83,500 + 30,000 = 113,500, and the total never
 * equals the parent line's own quantity). Aggregating it by `pe.itemId` credited
 * the whole document to the parent part and left every sibling at 0 — merging
 * separate item lots into a single stage line and inflating that line's
 * Opening / Sub-Total / Closing. Produced must therefore be read strictly from
 * `production_entry_items`.
 */
describe('ProductionInventoryReportService — child-level Produced isolation (item-wise ledger)', () => {
  it('inner-joins production_entry_items and aggregates the CHILD quantity, never the parent total', async () => {
    const service = serviceWith({ produced: [{ itemId: ITEM_ID, produced: '83500', entryCount: 1 }] });
    await service.getReport(COMPANY_ID);

    const qb = service.__qbs.producedQb;

    // Strict inner join: a production figure must always be attributable to a
    // real child row, never to a bare parent total.
    expect(qb.innerJoin).toHaveBeenCalledTimes(1);
    const [entity, alias, condition] = qb.innerJoin.mock.calls[0];
    expect(entity).toBe(ProductionEntryItem);
    expect(alias).toBe('pei');
    expect(String(condition)).toContain('pei.productionEntryId = pe.id');

    // Grouping key is the child item, so each part lands in its own row.
    expect(qb.select).toHaveBeenCalledWith('pei.itemId', 'itemId');
    expect(qb.groupBy).toHaveBeenCalledWith('pei.itemId');

    const selects = qb.__addSelect.join(' | ');
    expect(selects).toContain('SUM(pei.actualQuantity)');
    expect(selects).not.toContain('SUM(pe.actualQuantity)');
    // An entry that holds several child rows is still ONE entry.
    expect(selects).toContain('COUNT(DISTINCT pe.id)');
  });

  it('restricts the child join to OUTPUT lines so consumed raw material never counts as production', async () => {
    const service = serviceWith({});
    await service.getReport(COMPANY_ID);

    const qb = service.__qbs.producedQb;
    const sqls = qb.__andWhere.map((c: any) => String(c.sql));

    const kindClause = qb.__andWhere.find((c: any) => String(c.sql).includes('pei.entryKind'));
    expect(kindClause).toBeDefined();
    expect(kindClause.params.entryKind).toBe(ProductionEntryItemKind.OUTPUT);

    // INPUT lines carry no good production, and an orphan child (no item) must
    // not surface as a phantom row.
    expect(sqls.some((s: string) => s.includes('pei.itemId IS NOT NULL'))).toBe(true);
    // The parent document total is never the aggregation source any more.
    expect(sqls.some((s: string) => s.includes('pe.itemId IN'))).toBe(false);
    expect(sqls.some((s: string) => s.includes('SUM(pe.actualQuantity)'))).toBe(false);
  });

  it('keeps the produced aggregate scoped to the company, active entries and the date window', async () => {
    const service = serviceWith({});
    await service.getReport(COMPANY_ID, { dateFrom: '2026-10-01', dateTo: '2026-10-09' });

    const qb = service.__qbs.producedQb;
    const clauses = qb.__andWhere.map((c: any) => ({
      sql: String(c.sql),
      params: c.params,
    }));

    expect(clauses.some((c: any) => c.sql === 'pe.isActive = true')).toBe(true);
    expect(clauses.some((c: any) => c.sql === 'pe.entryDate >= :dateFrom' && c.params.dateFrom === '2026-10-01')).toBe(true);
    expect(clauses.some((c: any) => c.sql === 'pe.entryDate <= :dateTo' && c.params.dateTo === '2026-10-09')).toBe(true);
    expect(clauses.some((c: any) => c.sql.includes('pei.itemId IN (:...itemIds)'))).toBe(true);
    // Both sides of the join carry the company scope: the parent entry is
    // scoped in `.where()` and the child line in its own `.andWhere()`.
    expect(String(qb.where.mock.calls[0]?.[0] ?? '')).toContain('pe.companyId = :companyId');
    expect(clauses.some((c: any) => c.sql.includes('pei.companyId = :companyId'))).toBe(true);
  });

  it('maps the child aggregate onto the report row as Produced', async () => {
    const service = serviceWith({ produced: [{ itemId: ITEM_ID, produced: '83500', entryCount: 1 }] });
    const report = await service.getReport(COMPANY_ID);
    expect(report.items[0].produced).toBe(83500);
  });
});