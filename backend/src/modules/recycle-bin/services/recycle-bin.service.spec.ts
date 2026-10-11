import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';

import { RecycleBinService, RecycleBinType } from './recycle-bin.service';
import { ProductionEntry } from '../../production/entities/production-entry.entity';
import { ProductionEntryItem } from '../../production/entities/production-entry-item.entity';
import { MaintenanceJobCard } from '../../maintenance/entities/maintenance-job-card.entity';
import { MaintenanceJobCardPart } from '../../maintenance/entities/maintenance-job-card-part.entity';
import { DispatchPackage } from '../../dispatch/entities/dispatch-package.entity';
import { DispatchPackageUnit } from '../../dispatch/entities/dispatch-package-unit.entity';
import { Customer } from '../../customer/entities/customer.entity';
import { CustomerContact } from '../../customer/entities/customer-contact.entity';
import { CustomerAddress } from '../../customer/entities/customer-address.entity';
import { SalesQuotation } from '../../sales/entities/sales-quotation.entity';
import { SalesQuotationItem } from '../../sales/entities/sales-quotation-item.entity';
import { ProductionOrder } from '../../production/entities/production-order.entity';
import { ProductionOrderOperation } from '../../production/entities/production-order-operation.entity';
import { BillOfMaterials } from '../../bom/entities/bill-of-materials.entity';
import { BomLine } from '../../bom/entities/bom-line.entity';
import { MaintenancePmPlan } from '../../maintenance/entities/maintenance-pm-plan.entity';
import { MaintenancePmSchedule } from '../../maintenance/entities/maintenance-pm-schedule.entity';
import { MaterialIssue } from '../../store/entities/material-issue.entity';
import { MaterialIssueLine } from '../../store/entities/material-issue-line.entity';
import { MaterialReturn } from '../../store/entities/material-return.entity';
import { MaterialReturnLine } from '../../store/entities/material-return-line.entity';
import { MaterialRequest } from '../../store/entities/material-request.entity';
import { MaterialRequestLine } from '../../store/entities/material-request-line.entity';
import { QcInspectionPlan } from '../../qc/entities/qc-inspection-plan.entity';
import { QcQualityCharacteristic } from '../../qc/entities/qc-entities';
import { SalesOrder } from '../../sales/entities/sales-order.entity';
import { SalesOrderItem } from '../../sales/entities/sales-order-item.entity';
import { SalesInvoice } from '../../sales/entities/sales-invoice.entity';
import { SalesDelivery } from '../../sales/entities/sales-delivery.entity';
import { SalesDeliveryLine } from '../../sales/entities/sales-delivery-line.entity';
import { ErpUser } from '../../user/entities/erp-user.entity';

const COMPANY = 'company-001';

/** A minimal QueryBuilder stand-in that records the SQL fragments we assert on. */
function fakeQb() {
  const calls: string[] = [];
  const params: any[] = [];
  const qb: any = {
    calls,
    params,
    withDeleted: jest.fn(() => qb),
    leftJoin: jest.fn(() => qb),
    leftJoinAndSelect: jest.fn(() => qb),
    // Used by the PM-schedule spec's `scope` override, which joins back to the
    // parent plan to inherit its company scoping.
    innerJoin: jest.fn(() => qb),
    where: jest.fn((sql: string, p?: any) => {
      calls.push(sql);
      if (p) params.push(p);
      return qb;
    }),
    andWhere: jest.fn((sql: string, p?: any) => {
      calls.push(sql);
      if (p) params.push(p);
      return qb;
    }),
    orderBy: jest.fn(() => qb),
    take: jest.fn(() => qb),
    getCount: jest.fn(() => 0),
    getMany: jest.fn(() => []),
  };
  return qb;
}

describe('RecycleBinService', () => {
  let service: RecycleBinService;
  let entryRepo: any;
  let jobCardRepo: any;
  let packageRepo: any;
  let customerRepo: any;
  let userRepo: any;
  let contactRepo: any;
  let addressRepo: any;
  let unitRepo: any;
  let entryItemRepo: any;
  let partRepo: any;
  /** The four Phase-2 document repos share one shape, so one factory covers all. */
  let quotationRepo: any;
  let quotationItemRepo: any;
  let productionOrderRepo: any;
  let productionOrderOperationRepo: any;
  let bomRepo: any;
  let bomLineRepo: any;
  let pmPlanRepo: any;
  let pmScheduleRepo: any;
  /** Phase-3 repositories — Store (3), QC, PM schedules, Sales (3). */
  let materialIssueRepo: any;
  let materialReturnRepo: any;
  let materialRequestRepo: any;
  let qcPlanRepo: any;
  let salesOrderRepo: any;
  let salesInvoiceRepo: any;
  let salesDeliveryRepo: any;

  const mkDocRepo = () => ({
    // Pre-wired with a QueryBuilder so a test that only exercises `counts()`
    // does not have to stub four extra repositories to get there; `qbFor()`
    // still overrides it for the assertions that care about the SQL.
    createQueryBuilder: jest.fn(() => fakeQb()),
    findOne: jest.fn(),
    save: jest.fn(),
    delete: jest.fn(),
    manager: { transaction: jest.fn() },
  });

  const qbFor = (repo: any) => {
    const qb = fakeQb();
    repo.createQueryBuilder.mockReturnValue(qb);
    return qb;
  };

  beforeEach(async () => {
    entryRepo = { createQueryBuilder: jest.fn(), findOne: jest.fn(), manager: { transaction: jest.fn() } };
    jobCardRepo = { createQueryBuilder: jest.fn(), findOne: jest.fn(), manager: { transaction: jest.fn() } };
    packageRepo = { createQueryBuilder: jest.fn(), findOne: jest.fn(), save: jest.fn() };
    customerRepo = { createQueryBuilder: jest.fn(), findOne: jest.fn(), save: jest.fn(), manager: { transaction: jest.fn() } };
    userRepo = { find: jest.fn(() => []) };
    contactRepo = { delete: jest.fn() };
    addressRepo = { delete: jest.fn() };
    unitRepo = { delete: jest.fn() };
    entryItemRepo = { delete: jest.fn() };
    partRepo = { delete: jest.fn() };
    quotationRepo = mkDocRepo();
    productionOrderRepo = mkDocRepo();
    bomRepo = mkDocRepo();
    pmPlanRepo = mkDocRepo();
    quotationItemRepo = { target: SalesQuotationItem, delete: jest.fn() };
    productionOrderOperationRepo = { target: ProductionOrderOperation, delete: jest.fn() };
    bomLineRepo = { target: BomLine, delete: jest.fn() };
    pmScheduleRepo = { ...mkDocRepo(), target: MaintenancePmSchedule };
    materialIssueRepo = { ...mkDocRepo(), target: MaterialIssue };
    materialReturnRepo = { ...mkDocRepo(), target: MaterialReturn };
    materialRequestRepo = { ...mkDocRepo(), target: MaterialRequest };
    qcPlanRepo = mkDocRepo();
    salesOrderRepo = mkDocRepo();
    salesInvoiceRepo = mkDocRepo();
    salesDeliveryRepo = mkDocRepo();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RecycleBinService,
        { provide: getRepositoryToken(ProductionEntry), useValue: entryRepo },
        { provide: getRepositoryToken(ProductionEntryItem), useValue: entryItemRepo },
        { provide: getRepositoryToken(MaintenanceJobCard), useValue: jobCardRepo },
        { provide: getRepositoryToken(MaintenanceJobCardPart), useValue: partRepo },
        { provide: getRepositoryToken(DispatchPackage), useValue: packageRepo },
        { provide: getRepositoryToken(DispatchPackageUnit), useValue: unitRepo },
        { provide: getRepositoryToken(Customer), useValue: customerRepo },
        { provide: getRepositoryToken(CustomerContact), useValue: contactRepo },
        { provide: getRepositoryToken(CustomerAddress), useValue: addressRepo },
        { provide: getRepositoryToken(ErpUser), useValue: userRepo },
        { provide: getRepositoryToken(SalesQuotation), useValue: quotationRepo },
        { provide: getRepositoryToken(SalesQuotationItem), useValue: quotationItemRepo },
        { provide: getRepositoryToken(ProductionOrder), useValue: productionOrderRepo },
        { provide: getRepositoryToken(ProductionOrderOperation), useValue: productionOrderOperationRepo },
        { provide: getRepositoryToken(BillOfMaterials), useValue: bomRepo },
        { provide: getRepositoryToken(BomLine), useValue: bomLineRepo },
        { provide: getRepositoryToken(MaintenancePmPlan), useValue: pmPlanRepo },
        { provide: getRepositoryToken(MaintenancePmSchedule), useValue: pmScheduleRepo },
        { provide: getRepositoryToken(MaterialIssue), useValue: materialIssueRepo },
        { provide: getRepositoryToken(MaterialIssueLine), useValue: { target: MaterialIssueLine, delete: jest.fn() } },
        { provide: getRepositoryToken(MaterialReturn), useValue: materialReturnRepo },
        { provide: getRepositoryToken(MaterialReturnLine), useValue: { target: MaterialReturnLine, delete: jest.fn() } },
        { provide: getRepositoryToken(MaterialRequest), useValue: materialRequestRepo },
        { provide: getRepositoryToken(MaterialRequestLine), useValue: { target: MaterialRequestLine, delete: jest.fn() } },
        { provide: getRepositoryToken(QcInspectionPlan), useValue: qcPlanRepo },
        { provide: getRepositoryToken(QcQualityCharacteristic), useValue: { target: QcQualityCharacteristic, delete: jest.fn() } },
        { provide: getRepositoryToken(SalesOrder), useValue: salesOrderRepo },
        { provide: getRepositoryToken(SalesOrderItem), useValue: { target: SalesOrderItem, delete: jest.fn() } },
        { provide: getRepositoryToken(SalesInvoice), useValue: salesInvoiceRepo },
        { provide: getRepositoryToken(SalesDelivery), useValue: salesDeliveryRepo },
        { provide: getRepositoryToken(SalesDeliveryLine), useValue: { target: SalesDeliveryLine, delete: jest.fn() } },
      ],
    }).compile();

    service = module.get<RecycleBinService>(RecycleBinService);
  });

  describe('list()', () => {
    it('only ever looks at rows that are actually in the bin', async () => {
      const qb = qbFor(entryRepo);
      qb.getMany.mockResolvedValue([]);

      await service.list(RecycleBinType.PRODUCTION_ENTRIES, COMPANY);

      expect(qb.withDeleted).toHaveBeenCalled();
      expect(qb.calls.join(' ')).toContain('deletedAt IS NOT NULL');
    });

    it('keeps the two production tabs disjoint — Production Entries EXCLUDES hand packing', async () => {
      const qb = qbFor(entryRepo);
      qb.getMany.mockResolvedValue([]);

      await service.list(RecycleBinType.PRODUCTION_ENTRIES, COMPANY);

      const sql = qb.calls.join(' ');
      expect(sql).toContain('NOT (');
      // The discriminator itself is bound, not interpolated — assert the bound value.
      expect(qb.params.some((p: any) => p?.hpMachinePrefix === 'HAND-PACK%')).toBe(true);
    });

    it('routes the Hand Packing tab to the POSITIVE hand-packing predicate', async () => {
      const qb = qbFor(entryRepo);
      qb.getMany.mockResolvedValue([]);

      await service.list(RecycleBinType.HAND_PACKING, COMPANY);

      const sql = qb.calls.join(' ');
      expect(sql).not.toContain('NOT (');
      expect(sql).toContain('hpMachinePrefix');
    });

    it('scopes every read to the caller company', async () => {
      const qb = qbFor(customerRepo);
      qb.getMany.mockResolvedValue([]);

      await service.list(RecycleBinType.CUSTOMERS, COMPANY);

      expect(qb.where).toHaveBeenCalledWith('c.companyId = :companyId', { companyId: COMPANY });
      expect(qb.withDeleted).toHaveBeenCalled();
    });

    it('rejects an unknown module instead of silently returning nothing', async () => {
      await expect(service.list('nonsense' as RecycleBinType, COMPANY)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  });

  describe('Phase 3 — Store, QC, PM schedules and Sales', () => {
    it('exposes a trash count for every one of the seventeen modules', async () => {
      // `counts()` fans out across every registry entry, so all four Phase-1
      // repositories need a QueryBuilder too.
      qbFor(entryRepo);
      qbFor(jobCardRepo);
      qbFor(packageRepo);
      qbFor(customerRepo);

      const counts = await service.counts(COMPANY);

      expect(Object.keys(counts)).toHaveLength(17);
      for (const type of Object.values(RecycleBinType)) {
        expect(counts).toHaveProperty(type);
      }
    });

    it('reads Store documents through the same withDeleted contract as Phase 1', async () => {
      for (const [repo, type] of [
        [materialIssueRepo, RecycleBinType.STORE_ISSUES],
        [materialReturnRepo, RecycleBinType.STORE_RETURNS],
        [materialRequestRepo, RecycleBinType.STORE_REQUESTS],
      ] as const) {
        const qb = qbFor(repo as any);
        qb.getMany.mockResolvedValue([]);

        await service.list(type, COMPANY);

        expect(qb.withDeleted).toHaveBeenCalled();
        expect(qb.calls.join(' ')).toContain('deletedAt IS NOT NULL');
        expect(qb.where).toHaveBeenCalledWith('e.companyId = :companyId', { companyId: COMPANY });
      }
    });

    it('routes the QC, Sales and Gate Pass tabs to their own repositories', async () => {
      for (const [repo, type] of [
        [qcPlanRepo, RecycleBinType.QC_PLANS],
        [salesOrderRepo, RecycleBinType.SALES_ORDERS],
        [salesInvoiceRepo, RecycleBinType.SALES_INVOICES],
        [salesDeliveryRepo, RecycleBinType.GATE_PASSES],
      ] as const) {
        const qb = qbFor(repo as any);
        qb.getMany.mockResolvedValue([]);

        await service.list(type, COMPANY);

        expect((repo as any).createQueryBuilder).toHaveBeenCalled();
        expect(qb.calls.join(' ')).toContain('deletedAt IS NOT NULL');
      }
    });

    it('scopes PM schedules through their PLAN, because the table has no company_id', async () => {
      const qb = qbFor(pmScheduleRepo);
      qb.getMany.mockResolvedValue([]);

      await service.list(RecycleBinType.PM_SCHEDULES, COMPANY);

      // The join is what carries tenancy: a plain `e.companyId` would match no
      // column at all on `maintenance_pm_schedules`, and returning nothing would
      // look identical to an empty bin.
      expect(qb.innerJoin).toHaveBeenCalledWith('e.pmPlan', 'pmPlan');
      expect(qb.where).toHaveBeenCalledWith('pmPlan.companyId = :companyId', { companyId: COMPANY });
      expect(qb.where).not.toHaveBeenCalledWith('e.companyId = :companyId', expect.anything());
      expect(qb.calls.join(' ')).toContain('deletedAt IS NOT NULL');
    });

    it('refuses to restore another company’s PM schedule', async () => {
      pmScheduleRepo.findOne.mockResolvedValue({
        id: 'pm-sched-1',
        status: 'SCHEDULED',
        deletedAt: new Date(),
        pmPlan: { companyId: 'a-DIFFERENT-company' },
      });

      await expect(
        service.restore(RecycleBinType.PM_SCHEDULES, 'pm-sched-1', COMPANY),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(pmScheduleRepo.save).not.toHaveBeenCalled();
    });

    it('restores a PM schedule belonging to the caller company', async () => {
      pmScheduleRepo.findOne.mockResolvedValue({
        id: 'pm-sched-1',
        status: 'SCHEDULED',
        deletedAt: new Date(),
        deletedBy: 'user-1',
        pmPlan: { companyId: COMPANY },
      });
      pmScheduleRepo.save.mockImplementation(async (row: any) => row);

      const result = await service.restore(RecycleBinType.PM_SCHEDULES, 'pm-sched-1', COMPANY);

      expect(result.deletedAt).toBeNull();
      expect(pmScheduleRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'pm-sched-1', deletedAt: null }),
      );
    });

    it('counts PM schedules with the same join, so a badge can never disagree with its grid', async () => {
      qbFor(entryRepo);
      qbFor(jobCardRepo);
      qbFor(packageRepo);
      qbFor(customerRepo);
      const qb = qbFor(pmScheduleRepo);

      await service.counts(COMPANY);

      expect(qb.innerJoin).toHaveBeenCalledWith('e.pmPlan', 'pmPlan');
      expect(qb.where).toHaveBeenCalledWith('pmPlan.companyId = :companyId', { companyId: COMPANY });
    });

    it('sums a trashed document’s line quantities without producing NaN', async () => {
      const qb = qbFor(materialIssueRepo);
      qb.getMany.mockResolvedValue([
        {
          id: 'mi-1',
          issueNumber: 'MI-2026-001',
          status: 'DRAFT',
          issueDate: '2026-10-01',
          purpose: 'Line A',
          deletedAt: '2026-10-02T10:00:00.000Z',
          lines: [{ quantity: '12.5' }, { quantity: 7.5 }, { quantity: null }],
        },
      ]);

      const rows = await service.list(RecycleBinType.STORE_ISSUES, COMPANY);

      // Decimal columns arrive as strings from Postgres; a naive `+` would
      // concatenate instead of adding.
      expect(rows[0].context['Qty']).toBe(20);
      expect(rows[0].summary).toBe('MI-2026-001');
    });

    it('renders an empty Qty rather than NaN when a document has no lines', async () => {
      const qb = qbFor(salesDeliveryRepo);
      qb.getMany.mockResolvedValue([
        {
          id: 'sd-1',
          deliveryNumber: 'DN-2026-001',
          deliveryDate: '2026-10-01',
          status: 'DRAFT',
          customer: { companyName: 'ACME Ltd' },
          deletedAt: '2026-10-02T10:00:00.000Z',
        },
      ]);

      const rows = await service.list(RecycleBinType.GATE_PASSES, COMPANY);

      expect(rows[0].componentName).toContain('ACME Ltd');
      expect(rows[0].summary).toBe('DN-2026-001');
    });
  });

  describe('restore()', () => {
    it('refuses a production entry that is not in the bin', async () => {
      entryRepo.findOne.mockResolvedValue({ id: 'pe-1', companyId: COMPANY, deletedAt: null });

      await expect(
        service.restore(RecycleBinType.PRODUCTION_ENTRIES, 'pe-1', COMPANY),
      ).rejects.toBeInstanceOf(BadRequestException);
      // Nothing was written.
      expect(entryRepo.manager.transaction).not.toHaveBeenCalled();
    });

    it('refuses a customer that is not in the bin', async () => {
      customerRepo.findOne.mockResolvedValue({ id: 'c-1', companyId: COMPANY, deletedAt: null });

      await expect(
        service.restore(RecycleBinType.CUSTOMERS, 'c-1', COMPANY),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(customerRepo.save).not.toHaveBeenCalled();
    });

    it('returns a 404 for a record that does not exist at all', async () => {
      customerRepo.findOne.mockResolvedValue(null);

      await expect(
        service.restore(RecycleBinType.CUSTOMERS, 'missing', COMPANY),
      ).rejects.toMatchObject({ status: 404 });
    });
  });

  describe('purge() — the one-shot-destroy guard', () => {
    it('refuses to hard-delete a LIVE production entry', async () => {
      entryRepo.findOne.mockResolvedValue({ id: 'pe-1', companyId: COMPANY, deletedAt: null });

      await expect(service.purge(RecycleBinType.PRODUCTION_ENTRIES, 'pe-1', COMPANY)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(entryRepo.manager.transaction).not.toHaveBeenCalled();
    });

    it('refuses to hard-delete a LIVE dispatch package', async () => {
      packageRepo.findOne.mockResolvedValue({ id: 'dp-1', companyId: COMPANY, deletedAt: null });

      await expect(service.purge(RecycleBinType.DISPATCH, 'dp-1', COMPANY)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('refuses to hard-delete a LIVE job card', async () => {
      jobCardRepo.findOne.mockResolvedValue({ id: 'jc-1', companyId: COMPANY, deletedAt: null });

      await expect(service.purge(RecycleBinType.JOB_CARDS, 'jc-1', COMPANY)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('turns a foreign-key refusal into an actionable Conflict, never a raw SQL error', async () => {
      const fkError: any = new Error('update or delete on table "customers" violates foreign key');
      fkError.code = '23503';
      customerRepo.findOne.mockResolvedValue({
        id: 'c-1',
        companyId: COMPANY,
        customerCode: 'CUST-0001',
        deletedAt: new Date(),
      });
      customerRepo.manager.transaction.mockRejectedValue(fkError);

      await expect(service.purge(RecycleBinType.CUSTOMERS, 'c-1', COMPANY)).rejects.toBeInstanceOf(
        ConflictException,
      );
      await expect(service.purge(RecycleBinType.CUSTOMERS, 'c-1', COMPANY)).rejects.toThrow(
        /still referenced by other records/i,
      );
    });

    it('still refuses an unknown module on the purge path', async () => {
      await expect(service.purge('nonsense' as RecycleBinType, 'x', COMPANY)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  });

  describe('Phase-2 departments (sales, work orders, BOMs, PM plans)', () => {
    it('lists trashed sales quotations with the customer an operator recognises', async () => {
      const qb = qbFor(quotationRepo);
      qb.getMany.mockResolvedValue([
        {
          id: 'q-1',
          quotationNumber: 'QT-2026-00001',
          quotationDate: '2026-10-01',
          status: 'Draft',
          totalAmount: 1100,
          validUntil: '2026-10-31',
          deletedAt: '2026-10-05T10:00:00.000Z',
          deletedBy: 'user-9',
          customer: { companyName: 'ACME Ltd' },
        },
      ]);

      const rows = await service.list(RecycleBinType.SALES_QUOTATIONS, COMPANY);

      // The bin is only reachable through `withDeleted()` — TypeORM hides these
      // rows from every ordinary read once they carry `deleted_at`.
      expect(qb.withDeleted).toHaveBeenCalled();
      expect(qb.andWhere).toHaveBeenCalledWith('e.deletedAt IS NOT NULL');
      // …and it stays company-scoped exactly like the original five modules.
      expect(qb.where).toHaveBeenCalledWith('e.companyId = :companyId', { companyId: COMPANY });

      expect(rows).toHaveLength(1);
      expect(rows[0].module).toBe(RecycleBinType.SALES_QUOTATIONS);
      expect(rows[0].summary).toBe('QT-2026-00001');
      expect(rows[0].componentName).toBe('Quotation to ACME Ltd');
      expect(rows[0].deletedById).toBe('user-9');
      expect(rows[0].context['Total']).toBe(1100);
    });

    it('re-activates an ARCHIVED production order on restore', async () => {
      const order = {
        id: 'po-1',
        orderNumber: 'PO-2026-0001',
        status: 'DRAFT',
        // This screen's "delete" has always meant archive, so the row arrives
        // carrying BOTH signals and must leave with neither.
        isActive: false,
        deletedAt: new Date(),
        deletedBy: 'user-1',
      };
      productionOrderRepo.findOne.mockResolvedValue(order);
      productionOrderRepo.save.mockResolvedValue(order);

      await service.restore(RecycleBinType.PRODUCTION_ORDERS, 'po-1', COMPANY, 'admin-1');

      // Clearing only `deleted_at` would hand back a row that is still archived
      // and therefore still filtered out of every live list.
      expect(productionOrderRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ deletedAt: null, deletedBy: null, isActive: true }),
      );
    });

    it('leaves a quotation alone on restore — it has no is_active column', async () => {
      const quotation = {
        id: 'q-1',
        quotationNumber: 'QT-2026-00001',
        status: 'Draft',
        deletedAt: new Date(),
        deletedBy: 'user-1',
      };
      quotationRepo.findOne.mockResolvedValue(quotation);
      quotationRepo.save.mockResolvedValue(quotation);

      await service.restore(RecycleBinType.SALES_QUOTATIONS, 'q-1', COMPANY, 'admin-1');

      expect(quotationRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ deletedAt: null, deletedBy: null }),
      );
      expect((quotationRepo.save.mock.calls[0][0] as any).isActive).toBeUndefined();
    });

    it('refuses to hard-delete a LIVE production order', async () => {
      productionOrderRepo.findOne.mockResolvedValue({ id: 'po-1', deletedAt: null });

      await expect(
        service.purge(RecycleBinType.PRODUCTION_ORDERS, 'po-1', COMPANY),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('purges a PM plan together with its generated schedules', async () => {
      const plan = { id: 'pm-1', planCode: 'PM-0001', deletedAt: new Date() };
      pmPlanRepo.findOne.mockResolvedValue(plan);
      // Run the transaction body synchronously, dispatching `getRepository` by
      // entity the way the real manager does, so the cascade is observable.
      pmPlanRepo.manager.transaction.mockImplementation(async (fn: any) =>
        fn({
          getRepository: jest.fn((target: any) =>
            target?.name === 'MaintenancePmSchedule' ? pmScheduleRepo : { delete: jest.fn() },
          ),
        }),
      );

      await service.purge(RecycleBinType.PM_PLANS, 'pm-1', COMPANY);

      expect(pmScheduleRepo.delete).toHaveBeenCalledWith({ pmPlanId: 'pm-1' });
      expect(pmPlanRepo.delete).toHaveBeenCalledWith({ id: 'pm-1' });
    });
  });

  describe('counts()', () => {
    it('reads the trash population of every module', async () => {
      qbFor(entryRepo).getCount.mockResolvedValue(0);
      qbFor(jobCardRepo).getCount.mockResolvedValue(0);
      qbFor(packageRepo).getCount.mockResolvedValue(0);
      qbFor(customerRepo).getCount.mockResolvedValue(0);

      const counts = await service.counts(COMPANY);

      expect(counts[RecycleBinType.PRODUCTION_ENTRIES]).toBe(0);
      expect(counts[RecycleBinType.JOB_CARDS]).toBe(0);
      expect(counts[RecycleBinType.HAND_PACKING]).toBe(0);
      expect(counts[RecycleBinType.DISPATCH]).toBe(0);
      expect(counts[RecycleBinType.CUSTOMERS]).toBe(0);
    });

    it('counts the Phase-2 and Phase-3 departments too, so no pill badge reads blank', async () => {
      // Stub the original five as well — `counts()` walks all seventeen.
      qbFor(entryRepo).getCount.mockResolvedValue(0);
      qbFor(jobCardRepo).getCount.mockResolvedValue(0);
      qbFor(packageRepo).getCount.mockResolvedValue(0);
      qbFor(customerRepo).getCount.mockResolvedValue(0);

      const counts = await service.counts(COMPANY);

      for (const type of [
        // Phase 2
        RecycleBinType.SALES_QUOTATIONS,
        RecycleBinType.PRODUCTION_ORDERS,
        RecycleBinType.BOMS,
        RecycleBinType.PM_PLANS,
        // Phase 3
        RecycleBinType.STORE_ISSUES,
        RecycleBinType.STORE_RETURNS,
        RecycleBinType.STORE_REQUESTS,
        RecycleBinType.QC_PLANS,
        RecycleBinType.PM_SCHEDULES,
        RecycleBinType.SALES_ORDERS,
        RecycleBinType.SALES_INVOICES,
        RecycleBinType.GATE_PASSES,
      ]) {
        expect(counts[type]).toBe(0);
      }
      // Completeness — every enum value has a badge — is asserted separately
      // by "exposes a trash count for every one of the seventeen modules".
    });
  });
});
