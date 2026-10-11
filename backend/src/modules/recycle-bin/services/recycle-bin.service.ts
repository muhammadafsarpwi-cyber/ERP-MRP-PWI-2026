import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder, In, ObjectLiteral } from 'typeorm';

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

/**
 * The trash matrices exposed on the Recycle Bin dashboard.
 *
 * `HAND_PACKING` is a VIEW over `production_entries`, not a table: the Hand
 * Packing screen writes ordinary production entries tagged either by a
 * `HAND-PACK-*` machine number or a `[HAND PACKING]` marker in the remarks.
 * The two production tabs are therefore kept DISJOINT — a trashed hand-packing
 * document shows on the Hand Packing tab and never also on Production Entries,
 * so the floor never counts the same lot twice.
 *
 * Phase 3 adds the departments that had NO delete endpoint anywhere in the ERP
 * until now: the three store material documents, the QC inspection plan, the
 * generated PM schedule, and the three sales documents. Every tab in the
 * switchboard therefore maps to a real, reachable delete path — a tab that
 * nothing can ever populate would be a lie about the system's coverage.
 */
export enum RecycleBinType {
  // ── Phase 1 — production, maintenance, dispatch, customers ──────────────
  PRODUCTION_ENTRIES = 'production-entries',
  JOB_CARDS = 'job-cards',
  HAND_PACKING = 'hand-packing',
  DISPATCH = 'dispatch',
  CUSTOMERS = 'customers',
  // ── Phase 2 — departments whose delete path already existed ─────────────
  SALES_QUOTATIONS = 'sales-quotations',
  PRODUCTION_ORDERS = 'production-orders',
  BOMS = 'boms',
  PM_PLANS = 'pm-plans',
  // ── Phase 3 — departments that had no delete endpoint at all ────────────
  STORE_ISSUES = 'store-issues',
  STORE_RETURNS = 'store-returns',
  STORE_REQUESTS = 'store-requests',
  QC_PLANS = 'qc-plans',
  PM_SCHEDULES = 'pm-schedules',
  SALES_ORDERS = 'sales-orders',
  SALES_INVOICES = 'sales-invoices',
  GATE_PASSES = 'gate-passes',
}

const RECYCLE_BIN_TYPES: string[] = Object.values(RecycleBinType);

/** Hand Packing discriminator — mirrors `buildProductionOutputs()` + HandPackingEntry.tsx. */
const HAND_PACKING_CLAUSE =
  `(pe.remarks LIKE :hpMarker OR UPPER(COALESCE(pe.machineNo, '')) LIKE :hpMachinePrefix OR pe.machineNo = :hpMachineLegacy)`;
const HAND_PACKING_PARAMS = {
  hpMarker: '%[HAND PACKING]%',
  hpMachinePrefix: 'HAND-PACK%',
  hpMachineLegacy: 'N/A (Hand Packing)',
};

/**
 * Total a document's line quantities for the grid's `Qty` cell.
 *
 * Deliberately tolerant of a missing relation (`lines` is left-joined, so it
 * can be undefined on a row with no children) and of decimal columns that
 * arrive as strings — an operator reading the bin must never see `NaN`.
 */
function sumQty(
  lines: { quantity?: number | string; requestedQuantity?: number | string }[] | undefined,
  field: 'quantity' | 'requestedQuantity',
): number | null {
  if (!lines || lines.length === 0) return null;
  const total = lines.reduce((acc, line) => {
    const n = Number(line?.[field]);
    return acc + (Number.isFinite(n) ? n : 0);
  }, 0);
  return Math.round(total * 10000) / 10000;
}

/** One row of the recovery grid. */
export interface RecycleBinRow {
  id: string;
  module: RecycleBinType;
  deletedAt: string | null;
  /** "Source Component Name" — the thing the document acts on. */
  componentName: string;
  /** "Unique Record Summary" — the human-recognisable document code. */
  summary: string;
  /** Secondary line under the summary (date / quantity / status). */
  detail: string | null;
  /** "Deleted By (User Profile)" — display label, or a readable UUID fallback. */
  deletedBy: string | null;
  deletedById: string | null;
  /** Extra per-module facts, rendered as a compact key/value strip. */
  context: Record<string, string | number | null>;
}

/**
 * A Phase-2 document type, described declaratively.
 *
 * The four new departments differ from the original five only in SHAPE — a
 * single parent table, a code column, a couple of display fields and one or
 * more child tables that travel with it. Encoding that once here means list,
 * count, restore and purge are written a single time and every new department
 * is a ~20-line entry rather than four more hand-rolled methods that can drift
 * out of step with each other.
 *
 * `restoresActiveFlag` exists because three of the four screens implemented
 * "delete" as an ARCHIVE (`is_active = false`) long before the bin existed.
 * Restoring must undo exactly what the delete did, so those types flip the
 * flag back to true; a quotation has no `is_active` column at all and leaves it
 * undefined.
 */
interface TrashDocSpec<T extends ObjectLiteral = any> {
  type: RecycleBinType;
  repo: Repository<T>;
  /** Human label used in error messages: "Production order". */
  label: string;
  /** The child tables destroyed WITH the parent on permanent purge. */
  children: { repo: Repository<any>; fk: string }[];
  /**
   * Relations to eager-load for the grid. Only Sales Quotations have one (the
   * customer name); joining a relation an entity does not declare makes
   * TypeORM throw, so this is opt-in per type rather than assumed.
   */
  relations?: string[];
  /**
   * Company scoping, when the table cannot use the default `e.companyId`.
   *
   * `maintenance_pm_schedules` has NO `company_id` of its own — a schedule
   * inherits its tenancy from the PM plan it was generated from — so it joins
   * back to `maintenance_pm_plans` instead. Anything that skipped this would
   * render one tenant's deleted rows to another.
   */
  scope?: (qb: SelectQueryBuilder<any>, companyId: string) => SelectQueryBuilder<any>;
  /**
   * Fetch one trashed row by id, tenancy-checked. Used by restore and purge.
   *
   * The default asks the repository for `{ id, companyId }`. That only works
   * for a table that HAS a `company_id`; on `maintenance_pm_schedules` the
   * unknown key would either throw or silently match, letting one company
   * restore or permanently destroy another's schedule. A type that inherits
   * its tenancy from a parent must resolve through the parent instead.
   */
  findTrashed?: (repo: Repository<any>, id: string, companyId: string) => Promise<any | null>;
  /** "Unique Record Summary" — the document number an operator recognises. */
  code: (row: T) => string | null;
  /** "Source Component/Module" — what the document acts on. */
  component: (row: T) => string;
  detail: (row: T) => string | null;
  context: (row: T) => Record<string, string | number | null>;
  restoresActiveFlag?: boolean;
}

@Injectable()
export class RecycleBinService {
  private readonly logger = new Logger(RecycleBinService.name);

  constructor(
    @InjectRepository(ProductionEntry)
    private readonly entryRepo: Repository<ProductionEntry>,
    @InjectRepository(ProductionEntryItem)
    private readonly entryItemRepo: Repository<ProductionEntryItem>,
    @InjectRepository(MaintenanceJobCard)
    private readonly jobCardRepo: Repository<MaintenanceJobCard>,
    @InjectRepository(MaintenanceJobCardPart)
    private readonly jobCardPartRepo: Repository<MaintenanceJobCardPart>,
    @InjectRepository(DispatchPackage)
    private readonly packageRepo: Repository<DispatchPackage>,
    @InjectRepository(DispatchPackageUnit)
    private readonly unitRepo: Repository<DispatchPackageUnit>,
    @InjectRepository(Customer)
    private readonly customerRepo: Repository<Customer>,
    @InjectRepository(CustomerContact)
    private readonly customerContactRepo: Repository<CustomerContact>,
    @InjectRepository(CustomerAddress)
    private readonly customerAddressRepo: Repository<CustomerAddress>,
    @InjectRepository(ErpUser)
    private readonly userRepo: Repository<ErpUser>,
    @InjectRepository(SalesQuotation)
    private readonly quotationRepo: Repository<SalesQuotation>,
    @InjectRepository(SalesQuotationItem)
    private readonly quotationItemRepo: Repository<SalesQuotationItem>,
    @InjectRepository(ProductionOrder)
    private readonly productionOrderRepo: Repository<ProductionOrder>,
    @InjectRepository(ProductionOrderOperation)
    private readonly productionOrderOperationRepo: Repository<ProductionOrderOperation>,
    @InjectRepository(BillOfMaterials)
    private readonly bomRepo: Repository<BillOfMaterials>,
    @InjectRepository(BomLine)
    private readonly bomLineRepo: Repository<BomLine>,
    @InjectRepository(MaintenancePmPlan)
    private readonly pmPlanRepo: Repository<MaintenancePmPlan>,
    @InjectRepository(MaintenancePmSchedule)
    private readonly pmScheduleRepo: Repository<MaintenancePmSchedule>,
    @InjectRepository(MaterialIssue)
    private readonly materialIssueRepo: Repository<MaterialIssue>,
    @InjectRepository(MaterialIssueLine)
    private readonly materialIssueLineRepo: Repository<MaterialIssueLine>,
    @InjectRepository(MaterialReturn)
    private readonly materialReturnRepo: Repository<MaterialReturn>,
    @InjectRepository(MaterialReturnLine)
    private readonly materialReturnLineRepo: Repository<MaterialReturnLine>,
    @InjectRepository(MaterialRequest)
    private readonly materialRequestRepo: Repository<MaterialRequest>,
    @InjectRepository(MaterialRequestLine)
    private readonly materialRequestLineRepo: Repository<MaterialRequestLine>,
    @InjectRepository(QcInspectionPlan)
    private readonly qcPlanRepo: Repository<QcInspectionPlan>,
    @InjectRepository(QcQualityCharacteristic)
    private readonly qcCharacteristicRepo: Repository<QcQualityCharacteristic>,
    @InjectRepository(SalesOrder)
    private readonly salesOrderRepo: Repository<SalesOrder>,
    @InjectRepository(SalesOrderItem)
    private readonly salesOrderItemRepo: Repository<SalesOrderItem>,
    @InjectRepository(SalesInvoice)
    private readonly salesInvoiceRepo: Repository<SalesInvoice>,
    @InjectRepository(SalesDelivery)
    private readonly salesDeliveryRepo: Repository<SalesDelivery>,
    @InjectRepository(SalesDeliveryLine)
    private readonly salesDeliveryLineRepo: Repository<SalesDeliveryLine>,
  ) {}

  /**
   * The Phase-2 document types, keyed by their route value.
   *
   * Built lazily in a getter because it closes over the injected repositories,
   * which do not exist until after the constructor has run.
   */
  private get docs(): Record<string, TrashDocSpec> {
    return {
      [RecycleBinType.SALES_QUOTATIONS]: {
        type: RecycleBinType.SALES_QUOTATIONS,
        repo: this.quotationRepo,
        label: 'Sales quotation',
        relations: ['customer'],
        children: [{ repo: this.quotationItemRepo, fk: 'quotationId' }],
        code: (q: SalesQuotation) => q.quotationNumber,
        component: (q: SalesQuotation) => `Quotation to ${q.customer?.companyName ?? 'unknown customer'}`,
        detail: (q: SalesQuotation) => q.quotationDate || null,
        context: (q: SalesQuotation) => ({
          'Status': q.status,
          'Total': Number(q.totalAmount ?? 0),
          'Valid Until': q.validUntil,
        }),
      },
      [RecycleBinType.PRODUCTION_ORDERS]: {
        type: RecycleBinType.PRODUCTION_ORDERS,
        repo: this.productionOrderRepo,
        label: 'Production order',
        relations: ['product'],
        children: [{ repo: this.productionOrderOperationRepo, fk: 'productionOrderId' }],
        restoresActiveFlag: true,
        code: (o: ProductionOrder) => o.orderNumber,
        component: (o: ProductionOrder) =>
          o.product ? `${o.product.name} (${o.product.itemCode})` : 'Unknown product',
        detail: (o: ProductionOrder) => o.dueDate || null,
        context: (o: ProductionOrder) => ({
          'Status': o.status,
          'Priority': o.priority,
          'Planned Qty': Number(o.plannedQuantity ?? 0),
          'Completed': Number(o.completedQuantity ?? 0),
        }),
      },
      [RecycleBinType.BOMS]: {
        type: RecycleBinType.BOMS,
        repo: this.bomRepo,
        label: 'Bill of materials',
        relations: ['product'],
        children: [{ repo: this.bomLineRepo, fk: 'bomId' }],
        restoresActiveFlag: true,
        code: (b: BillOfMaterials) => b.bomCode,
        component: (b: BillOfMaterials) =>
          b.product ? `${b.product.name} (${b.product.itemCode})` : (b.name || 'Unknown product'),
        detail: (b: BillOfMaterials) => b.name || null,
        context: (b: BillOfMaterials) => ({
          'Status': b.status,
          'Base Qty': Number(b.baseQuantity ?? 0),
          'Est. Cost': Number(b.estimatedCost ?? 0),
          'Effective From': b.effectiveFrom ? String(b.effectiveFrom).slice(0, 10) : null,
        }),
      },
      [RecycleBinType.PM_PLANS]: {
        type: RecycleBinType.PM_PLANS,
        repo: this.pmPlanRepo,
        label: 'PM plan',
        relations: ['machine'],
        children: [{ repo: this.pmScheduleRepo, fk: 'pmPlanId' }],
        restoresActiveFlag: true,
        code: (p: MaintenancePmPlan) => p.planCode,
        component: (p: MaintenancePmPlan) =>
          p.machine ? `Machine ${p.machine.machineCode}` : 'Unassigned machine',
        detail: (p: MaintenancePmPlan) => p.planName || null,
        context: (p: MaintenancePmPlan) => ({
          'Frequency': p.frequencyType || null,
          'Every': p.frequencyValue ?? null,
          'Start': p.startDate || null,
          'Next Due': p.nextDueDate || null,
        }),
      },

      // ── Phase 3 — Store: the three material documents ───────────────────
      [RecycleBinType.STORE_ISSUES]: {
        type: RecycleBinType.STORE_ISSUES,
        repo: this.materialIssueRepo,
        label: 'Material issue',
        relations: ['lines'],
        children: [{ repo: this.materialIssueLineRepo, fk: 'issueId' }],
        code: (i: MaterialIssue) => i.issueNumber,
        component: () => 'Goods Outward Note',
        detail: (i: MaterialIssue) => i.issueDate || null,
        context: (i: MaterialIssue) => ({
          'Status': i.status,
          'Lines': i.lines?.length ?? null,
          'Qty': sumQty(i.lines, 'quantity'),
          'Purpose': i.purpose || i.referenceDocument || null,
        }),
      },
      [RecycleBinType.STORE_RETURNS]: {
        type: RecycleBinType.STORE_RETURNS,
        repo: this.materialReturnRepo,
        label: 'Material return',
        relations: ['lines'],
        children: [{ repo: this.materialReturnLineRepo, fk: 'returnId' }],
        code: (r: MaterialReturn) => r.returnNumber,
        component: () => 'Goods Inward Note',
        detail: (r: MaterialReturn) => r.returnDate || null,
        context: (r: MaterialReturn) => ({
          'Status': r.status,
          'Lines': r.lines?.length ?? null,
          'Qty': sumQty(r.lines, 'quantity'),
          'Condition': r.conditionCode || null,
        }),
      },
      [RecycleBinType.STORE_REQUESTS]: {
        type: RecycleBinType.STORE_REQUESTS,
        repo: this.materialRequestRepo,
        label: 'Material request',
        relations: ['lines'],
        children: [{ repo: this.materialRequestLineRepo, fk: 'requestId' }],
        code: (r: MaterialRequest) => r.requestNumber,
        component: () => 'Store Requisition',
        detail: (r: MaterialRequest) => r.requestDate || null,
        context: (r: MaterialRequest) => ({
          'Status': r.status,
          'Priority': r.priority,
          'Required': r.requiredDate,
          'Qty': sumQty(r.lines, 'requestedQuantity'),
        }),
      },

      // ── Phase 3 — Quality Control ───────────────────────────────────────
      [RecycleBinType.QC_PLANS]: {
        type: RecycleBinType.QC_PLANS,
        repo: this.qcPlanRepo,
        label: 'Inspection plan',
        // NO `relations` entry: `QcInspectionPlan` declares no OneToMany back to
        // its characteristics, and asking TypeORM to join a relation the entity
        // does not have makes it throw. The characteristic ROWS are still
        // destroyed with the plan on purge — that goes through a raw delete on
        // the child repo, which needs no relation to exist.
        children: [{ repo: this.qcCharacteristicRepo, fk: 'planId' }],
        code: (p: QcInspectionPlan) => p.planCode,
        component: (p: QcInspectionPlan) => p.planName,
        detail: (p: QcInspectionPlan) => p.inspectionType,
        context: (p: QcInspectionPlan) => ({
          'Status': p.status,
          'Sampling': p.samplingPlan,
          'Acceptance': p.acceptanceCriteria ? String(p.acceptanceCriteria).slice(0, 80) : null,
        }),
      },

      // ── Phase 3 — Maintenance: generated PM log instances ───────────────
      [RecycleBinType.PM_SCHEDULES]: {
        type: RecycleBinType.PM_SCHEDULES,
        repo: this.pmScheduleRepo,
        label: 'PM schedule',
        relations: ['machine'],
        children: [],
        // `maintenance_pm_schedules` carries no `company_id`; tenancy is
        // inherited from the plan it was generated from.
        scope: (qb, companyId) =>
          qb.innerJoin('e.pmPlan', 'pmPlan').where('pmPlan.companyId = :companyId', { companyId }),
        findTrashed: async (repo, id, companyId) => {
          const row = await repo.findOne({
            where: { id },
            withDeleted: true,
            relations: ['pmPlan'],
          });
          // A schedule belonging to another company must read as NOT FOUND,
          // never as a failed restore that leaks its existence.
          return row?.pmPlan?.companyId === companyId ? row : null;
        },
        code: () => null,
        component: (s: MaintenancePmSchedule) =>
          s.machine ? `Machine ${s.machine.machineCode}` : 'Unassigned machine',
        detail: (s: MaintenancePmSchedule) => s.scheduledDate || null,
        context: (s: MaintenancePmSchedule) => ({
          'Status': s.status,
          'Completed': s.completedAt ? new Date(s.completedAt).toISOString().slice(0, 10) : null,
          'Job Card': s.generatedJobCardId ? 'Raised' : 'None',
        }),
      },

      // ── Phase 3 — Sales: purchase order, invoice, gate pass ─────────────
      [RecycleBinType.SALES_ORDERS]: {
        type: RecycleBinType.SALES_ORDERS,
        repo: this.salesOrderRepo,
        label: 'Sales order',
        relations: ['customer'],
        children: [{ repo: this.salesOrderItemRepo, fk: 'salesOrderId' }],
        code: (o: SalesOrder) => o.orderNumber,
        component: (o: SalesOrder) =>
          o.customer ? `PO ${o.customerPo ?? '—'} — ${o.customer.companyName}` : 'Unknown customer',
        detail: (o: SalesOrder) => o.orderDate || null,
        context: (o: SalesOrder) => ({
          'Status': o.status,
          'Customer PO': o.customerPo,
          'Total': Number(o.totalAmount ?? 0),
          'Currency': o.currency,
        }),
      },
      [RecycleBinType.SALES_INVOICES]: {
        type: RecycleBinType.SALES_INVOICES,
        repo: this.salesInvoiceRepo,
        label: 'Sales invoice',
        relations: ['customer'],
        // Invoices have no line table in this schema; payments are a column.
        children: [],
        code: (i: SalesInvoice) => i.invoiceNo,
        component: (i: SalesInvoice) => i.customer ? i.customer.companyName : 'Unknown customer',
        detail: (i: SalesInvoice) => i.invoiceDate || null,
        context: (i: SalesInvoice) => ({
          'Status': i.status,
          'Total': Number(i.totalAmount ?? 0),
          'Paid': Number(i.paidAmount ?? 0),
          'Due': i.dueDate,
        }),
      },
      [RecycleBinType.GATE_PASSES]: {
        type: RecycleBinType.GATE_PASSES,
        repo: this.salesDeliveryRepo,
        label: 'Gate pass',
        relations: ['customer'],
        children: [{ repo: this.salesDeliveryLineRepo, fk: 'deliveryId' }],
        code: (d: SalesDelivery) => d.deliveryNumber,
        component: (d: SalesDelivery) =>
          d.customer ? `Gate Pass — ${d.customer.companyName}` : 'Unknown customer',
        detail: (d: SalesDelivery) => d.deliveryDate || null,
        context: (d: SalesDelivery) => ({
          'Status': d.status,
          'Customer PO': d.customerPo,
          'Carrier': d.carrier,
          'Total': Number(d.totalAmount ?? 0),
        }),
      },
    };
  }

  // ─── Reads ────────────────────────────────────────────────────────────────

  async list(
    type: RecycleBinType,
    companyId: string,
    limit = 200,
  ): Promise<RecycleBinRow[]> {
    const take = Math.min(Math.max(Number(limit) || 200, 1), 500);
    let rows: RecycleBinRow[] = [];

    switch (type) {
      case RecycleBinType.PRODUCTION_ENTRIES:
        rows = await this.listProductionEntries(companyId, take, false);
        break;
      case RecycleBinType.HAND_PACKING:
        rows = await this.listProductionEntries(companyId, take, true);
        break;
      case RecycleBinType.JOB_CARDS:
        rows = await this.listJobCards(companyId, take);
        break;
      case RecycleBinType.DISPATCH:
        rows = await this.listDispatch(companyId, take);
        break;
      case RecycleBinType.CUSTOMERS:
        rows = await this.listCustomers(companyId, take);
        break;
      default: {
        const doc = this.docs[type];
        if (!doc) throw this.unknownType(type);
        rows = await this.listDocuments(doc, companyId, take);
        break;
      }
    }

    return this.decorateDeletedBy(rows);
  }

  /** Per-module trash counts for the tab badges. */
  async counts(companyId: string): Promise<Record<RecycleBinType, number>> {
    const docSpecs = Object.values(this.docs);

    const [production, handPacking, jobCards, dispatch, customers, ...docCounts] =
      await Promise.all([
        this.countProductionEntries(companyId, false),
        this.countProductionEntries(companyId, true),
        this.countTrashed(this.jobCardRepo, companyId),
        this.countTrashed(this.packageRepo, companyId),
        this.countTrashed(this.customerRepo, companyId),
        ...docSpecs.map((spec) => this.countTrashedDoc(spec, companyId)),
      ]);

    // Built as a plain string-keyed bag because a `Record<RecycleBinType, ...>`
    // literal would force every one of the nine keys to be spelled out here AND
    // in the loop below, which is exactly the drift a registry exists to avoid.
    const result: Record<string, number> = {
      [RecycleBinType.PRODUCTION_ENTRIES]: production,
      [RecycleBinType.JOB_CARDS]: jobCards,
      [RecycleBinType.HAND_PACKING]: handPacking,
      [RecycleBinType.DISPATCH]: dispatch,
      [RecycleBinType.CUSTOMERS]: customers,
    };
    docSpecs.forEach((spec, i) => {
      result[spec.type] = docCounts[i];
    });

    return result as Record<RecycleBinType, number>;
  }

  /** Trash count for one company-scoped table. */
  private async countTrashed(repo: Repository<any>, companyId: string): Promise<number> {
    return repo
      .createQueryBuilder('e')
      .withDeleted()
      .where('e.companyId = :companyId', { companyId })
      .andWhere('e.deletedAt IS NOT NULL')
      .getCount();
  }

  /**
   * Trash count for a registry type, honouring its `scope` override.
   *
   * Must stay in lockstep with `listDocuments`: a badge that reads a raw
   * `companyId` while the grid joins through a parent would show a count that
   * never matches the rows an operator then opens.
   */
  private async countTrashedDoc(spec: TrashDocSpec, companyId: string): Promise<number> {
    const base = spec.repo.createQueryBuilder('e').withDeleted();
    const qb = spec.scope
      ? spec.scope(base, companyId)
      : base.where('e.companyId = :companyId', { companyId });
    return qb.andWhere('e.deletedAt IS NOT NULL').getCount();
  }

  /**
   * Resolve one trashed row for restore/purge, with the type's own tenancy rule.
   *
   * Delegating rather than inlining the `findOne` means the restore path, the
   * purge path and the grid can never disagree about what "this company's row"
   * means for a type whose table has no `company_id` of its own.
   */
  private async findTrashedRow(
    spec: TrashDocSpec,
    id: string,
    companyId: string,
  ): Promise<any | null> {
    if (spec.findTrashed) return spec.findTrashed(spec.repo, id, companyId);
    return spec.repo.findOne({ where: { id, companyId }, withDeleted: true } as any);
  }

  private unknownType(type: string): BadRequestException {
    return new BadRequestException(
      `Unknown Recycle Bin module '${type}'. Expected one of: ${RECYCLE_BIN_TYPES.join(', ')}`,
    );
  }

  private productionQb(companyId: string, handPackingOnly: boolean): SelectQueryBuilder<ProductionEntry> {
    const qb = this.entryRepo.createQueryBuilder('pe').withDeleted()
      .leftJoin('pe.item', 'item')
      .where('pe.companyId = :companyId', { companyId })
      .andWhere('pe.deletedAt IS NOT NULL');

    // The two production tabs must never show the same document twice.
    qb.andWhere(
      handPackingOnly ? HAND_PACKING_CLAUSE : `NOT (${HAND_PACKING_CLAUSE})`,
      HAND_PACKING_PARAMS,
    );
    return qb;
  }

  private async countProductionEntries(companyId: string, handPackingOnly: boolean): Promise<number> {
    return this.productionQb(companyId, handPackingOnly).getCount();
  }

  private async listProductionEntries(
    companyId: string,
    take: number,
    handPackingOnly: boolean,
  ): Promise<RecycleBinRow[]> {
    const rows = await this.productionQb(companyId, handPackingOnly)
      .orderBy('pe.deletedAt', 'DESC')
      .take(take)
      .getMany();

    return rows.map((pe) => ({
      id: pe.id,
      module: handPackingOnly ? RecycleBinType.HAND_PACKING : RecycleBinType.PRODUCTION_ENTRIES,
      deletedAt: pe.deletedAt ? new Date(pe.deletedAt).toISOString() : null,
      componentName: pe.item ? `${pe.item.name} (${pe.item.itemCode})` : 'Unknown item',
      summary: pe.entryNumber || pe.id,
      detail: pe.entryDate ? String(pe.entryDate).slice(0, 10) : null,
      deletedBy: null,
      deletedById: pe.deletedBy,
      context: {
        'Machine': pe.machineNo || null,
        'Operator': pe.operatorName || null,
        'Good Qty': Number(pe.actualQuantity ?? 0),
        'Scrap': Number(pe.scrapQuantity ?? 0),
        'Target': Number(pe.targetQuantity ?? 0),
        'Mode': handPackingOnly ? 'Hand Packing' : 'Machine',
      },
    }));
  }

  private async listJobCards(companyId: string, take: number): Promise<RecycleBinRow[]> {
    const rows = await this.jobCardRepo.createQueryBuilder('jc').withDeleted()
      .leftJoin('jc.machine', 'machine')
      .where('jc.companyId = :companyId', { companyId })
      .andWhere('jc.deletedAt IS NOT NULL')
      .orderBy('jc.deletedAt', 'DESC')
      .take(take)
      .getMany();

    return rows.map((jc) => ({
      id: jc.id,
      module: RecycleBinType.JOB_CARDS,
      deletedAt: jc.deletedAt ? new Date(jc.deletedAt).toISOString() : null,
      componentName: jc.machine ? `Machine ${jc.machine.machineCode}` : 'Unassigned machine',
      summary: jc.jobCardNo || jc.id,
      detail: jc.complaint ? String(jc.complaint).slice(0, 120) : null,
      deletedBy: null,
      deletedById: jc.deletedBy,
      context: {
        'Status': jc.currentStatus || null,
        'Priority': jc.priority || null,
        'Requested': jc.requestedAt ? new Date(jc.requestedAt).toISOString() : null,
      },
    }));
  }

  private async listDispatch(companyId: string, take: number): Promise<RecycleBinRow[]> {
    const rows = await this.packageRepo.createQueryBuilder('dp').withDeleted()
      .where('dp.companyId = :companyId', { companyId })
      .andWhere('dp.deletedAt IS NOT NULL')
      .orderBy('dp.deletedAt', 'DESC')
      .take(take)
      .getMany();

    return rows.map((dp) => ({
      id: dp.id,
      module: RecycleBinType.DISPATCH,
      deletedAt: dp.deletedAt ? new Date(dp.deletedAt).toISOString() : null,
      componentName: dp.customerName || 'Walk-in / unassigned customer',
      summary: dp.packageNo || dp.id,
      detail: dp.packageDate ? new Date(dp.packageDate).toISOString().slice(0, 10) : null,
      deletedBy: null,
      deletedById: dp.deletedBy,
      context: {
        'Status': dp.status || null,
        'Units': Number(dp.totalUnits ?? 0),
        'Vehicle': dp.vehicleNo || null,
        'Gate Pass': dp.gatePassNo || null,
      },
    }));
  }

  private async listCustomers(companyId: string, take: number): Promise<RecycleBinRow[]> {
    const rows = await this.customerRepo.createQueryBuilder('c').withDeleted()
      .where('c.companyId = :companyId', { companyId })
      .andWhere('c.deletedAt IS NOT NULL')
      .orderBy('c.deletedAt', 'DESC')
      .take(take)
      .getMany();

    return rows.map((c) => ({
      id: c.id,
      module: RecycleBinType.CUSTOMERS,
      deletedAt: c.deletedAt ? new Date(c.deletedAt).toISOString() : null,
      componentName: c.contactPerson || c.legalName || c.name,
      summary: c.customerCode || c.id,
      detail: c.name,
      deletedBy: null,
      deletedById: c.deletedBy,
      context: {
        'Type': c.customerType || null,
        'Phone': c.phone || null,
        'Email': c.email || null,
        'Status': c.status || null,
      },
    }));
  }

  /**
   * List the trashed rows of any Phase-2 document type.
   *
   * The `withDeleted()` call is what makes the bin reachable at all: once an
   * entity carries `@DeleteDateColumn`, TypeORM appends `deleted_at IS NULL` to
   * every find/count/QueryBuilder for it, so the trash is invisible to ordinary
   * reads by default. The customer relation is eager-loaded because the grid's
   * "Source Component" column names the counterparty an operator recognises.
   */
  private async listDocuments(spec: TrashDocSpec, companyId: string, take: number): Promise<RecycleBinRow[]> {
    // Tenancy first: the default scopes on the table's own `companyId`, but a
    // type that inherits its tenancy from a parent (PM schedules) swaps in a
    // join instead. Skipping this for such a type would leak one company's
    // deleted rows into another's bin.
    const base = spec.repo.createQueryBuilder('e').withDeleted();
    const qb = spec.scope
      ? spec.scope(base, companyId)
      : base.where('e.companyId = :companyId', { companyId });

    qb.andWhere('e.deletedAt IS NOT NULL')
      .orderBy('e.deletedAt', 'DESC')
      .take(take);

    for (const relation of spec.relations ?? []) {
      qb.leftJoinAndSelect(`e.${relation}`, relation);
    }

    const rows = await qb.getMany();

    return rows.map((row: any) => ({
      id: row.id,
      module: spec.type,
      deletedAt: row.deletedAt ? new Date(row.deletedAt).toISOString() : null,
      componentName: spec.component(row),
      summary: spec.code(row) || row.id,
      detail: spec.detail(row),
      deletedBy: null,
      deletedById: row.deletedBy,
      context: spec.context(row),
    }));
  }

  /**
   * Resolve the operator profile behind every `deleted_by` in ONE query.
   *
   * The label is best-effort by design: `deleted_by` is a bare uuid so the audit
   * fact survives the user row it points at. When the profile is gone the raw
   * uuid is still shown — an auditor must never be handed a blank cell.
   */
  private async decorateDeletedBy(rows: RecycleBinRow[]): Promise<RecycleBinRow[]> {
    const ids = [...new Set(rows.map((r) => r.deletedById).filter((v): v is string => !!v))];
    if (ids.length === 0) return rows;

    const users = await this.userRepo.find({ where: { id: In(ids) } });
    const label = new Map<string, string>();
    for (const u of users) {
      label.set(u.id, u.displayName || u.email || u.id);
    }

    return rows.map((r) => ({
      ...r,
      deletedBy: r.deletedById ? label.get(r.deletedById) ?? r.deletedById : null,
    }));
  }

  // ─── Restore ──────────────────────────────────────────────────────────────

  /**
   * Clear `deleted_at` and push the record back into its live functional grid.
   *
   * INVENTORY NOTE (production entries): the delete path reversed the entry's
   * stock postings and cleared `inventoryReferenceId`, so a restored document
   * comes back explicitly UNPOSTED rather than silently double-counted. The
   * receipt warehouse that posting used is a client-selected value that is not
   * persisted on the entry row (its only warehouse column is the raw-material
   * SOURCE store), so re-deriving it would book finished goods into the
   * raw-material store. A single edit of the restored entry re-posts it exactly
   * once through the existing idempotent reconcile path.
   */
  async restore(type: RecycleBinType, id: string, companyId: string, userId?: string): Promise<RecycleBinRow> {
    switch (type) {
      case RecycleBinType.PRODUCTION_ENTRIES:
      case RecycleBinType.HAND_PACKING:
        return this.restoreProductionEntry(id, companyId, userId);
      case RecycleBinType.JOB_CARDS:
        return this.restoreJobCard(id, companyId, userId);
      case RecycleBinType.DISPATCH:
        return this.restoreDispatch(id, companyId, userId);
      case RecycleBinType.CUSTOMERS:
        return this.restoreCustomer(id, companyId, userId);
      default: {
        const doc = this.docs[type];
        if (!doc) throw this.unknownType(type);
        return this.restoreDocument(doc, id, companyId, userId);
      }
    }
  }

  /**
   * Clear `deleted_at` on a Phase-2 document.
   *
   * Production orders, BOMs and PM plans reach the bin through screens whose
   * "delete" has always meant ARCHIVE (`is_active = false`), so restoring has
   * to undo both halves of that action — clearing only `deleted_at` would
   * return a row that is still archived and therefore still filtered out of
   * every `isActive: true` list, which would look like a restore that silently
   * failed. A quotation has no `is_active` column and leaves the flag alone.
   *
   * Child lines are NOT touched: unlike production entries and job cards, none
   * of these tables soft-deletes its children, so there is nothing to bring
   * back — the lines were never hidden in the first place.
   */
  private async restoreDocument(
    spec: TrashDocSpec,
    id: string,
    companyId: string,
    userId?: string,
  ): Promise<RecycleBinRow> {
    const row = await this.findTrashedRow(spec, id, companyId);
    if (!row) throw new NotFoundException(`${spec.label} not found in the Recycle Bin`);
    if (!row.deletedAt) throw new BadRequestException(`${spec.label} is not in the Recycle Bin`);

    row.deletedAt = null;
    row.deletedBy = null;
    if (spec.restoresActiveFlag) row.isActive = true;
    if ('updatedBy' in row) row.updatedBy = userId ?? null;
    await spec.repo.save(row);

    return {
      id: row.id,
      module: spec.type,
      deletedAt: null,
      componentName: spec.label,
      summary: spec.code(row) || row.id,
      detail: 'Restored',
      deletedBy: null,
      deletedById: null,
      context: spec.context(row),
    };
  }

  private async restoreProductionEntry(id: string, companyId: string, userId?: string): Promise<RecycleBinRow> {
    const entry = await this.entryRepo.findOne({ where: { id, companyId }, withDeleted: true });
    if (!entry) throw new NotFoundException('Production entry not found in the Recycle Bin');
    if (!entry.deletedAt) throw new BadRequestException('Production entry is not in the Recycle Bin');

    await this.entryRepo.manager.transaction(async (manager) => {
      entry.deletedAt = null;
      entry.deletedBy = null;
      entry.isActive = true;
      entry.updatedBy = userId ?? null;
      await manager.getRepository(ProductionEntry).save(entry);
      // Children travel with the parent so the document can never come back
      // half-populated.
      await manager.getRepository(ProductionEntryItem).createQueryBuilder()
        .update(ProductionEntryItem)
        .set({ deletedAt: null, deletedBy: null })
        .where('production_entry_id = :id', { id: entry.id })
        .execute();
    });

    const isHandPacking =
      !!entry.remarks?.includes('[HAND PACKING]') ||
      (entry.machineNo || '').toUpperCase().startsWith('HAND-PACK');

    return {
      id: entry.id,
      module: isHandPacking ? RecycleBinType.HAND_PACKING : RecycleBinType.PRODUCTION_ENTRIES,
      deletedAt: null,
      componentName: 'Production entry',
      summary: entry.entryNumber || entry.id,
      detail: 'Restored',
      deletedBy: null,
      deletedById: null,
      context: {
        'Mode': isHandPacking ? 'Hand Packing' : 'Machine',
        'Good Qty': Number(entry.actualQuantity ?? 0),
        'Stock Posted': entry.inventoryReferenceId ? 'Yes' : 'Re-post on next edit',
      },
    };
  }

  private async restoreJobCard(id: string, companyId: string, userId?: string): Promise<RecycleBinRow> {
    const card = await this.jobCardRepo.findOne({ where: { id, companyId }, withDeleted: true });
    if (!card) throw new NotFoundException('Job card not found in the Recycle Bin');
    if (!card.deletedAt) throw new BadRequestException('Job card is not in the Recycle Bin');

    await this.jobCardRepo.manager.transaction(async (manager) => {
      card.deletedAt = null;
      card.deletedBy = null;
      card.isActive = true;
      card.updatedBy = userId ?? null;
      await manager.getRepository(MaintenanceJobCard).save(card);
      await manager.getRepository(MaintenanceJobCardPart).createQueryBuilder()
        .update(MaintenanceJobCardPart)
        .set({ deletedAt: null, deletedBy: null })
        .where('job_card_id = :id', { id: card.id })
        .execute();
    });

    return {
      id: card.id,
      module: RecycleBinType.JOB_CARDS,
      deletedAt: null,
      componentName: 'Maintenance job card',
      summary: card.jobCardNo || card.id,
      detail: 'Restored',
      deletedBy: null,
      deletedById: null,
      context: { 'Status': card.currentStatus || null, 'Priority': card.priority || null },
    };
  }

  private async restoreDispatch(id: string, companyId: string, userId?: string): Promise<RecycleBinRow> {
    const pkg = await this.packageRepo.findOne({ where: { id, companyId }, withDeleted: true });
    if (!pkg) throw new NotFoundException('Dispatch package not found in the Recycle Bin');
    if (!pkg.deletedAt) throw new BadRequestException('Dispatch package is not in the Recycle Bin');

    pkg.deletedAt = null;
    pkg.deletedBy = null;
    pkg.updatedBy = userId ?? null;
    await this.packageRepo.save(pkg);

    return {
      id: pkg.id,
      module: RecycleBinType.DISPATCH,
      deletedAt: null,
      componentName: 'Dispatch package',
      summary: pkg.packageNo || pkg.id,
      detail: 'Restored',
      deletedBy: null,
      deletedById: null,
      context: { 'Status': pkg.status || null, 'Units': Number(pkg.totalUnits ?? 0) },
    };
  }

  private async restoreCustomer(id: string, companyId: string, userId?: string): Promise<RecycleBinRow> {
    const customer = await this.customerRepo.findOne({ where: { id, companyId }, withDeleted: true });
    if (!customer) throw new NotFoundException('Customer not found in the Recycle Bin');
    if (!customer.deletedAt) throw new BadRequestException('Customer is not in the Recycle Bin');

    // Only `deleted_at` is cleared. `status` and `isActive` are business state
    // owned by the Customer screen's Activate/Deactivate actions and are NOT
    // rewritten here — restoring an account must return it to exactly the state
    // it was deleted in, never promote it to ACTIVE behind the user's back.
    customer.deletedAt = null;
    customer.deletedBy = null;
    customer.updatedBy = userId ?? null;
    await this.customerRepo.save(customer);

    return {
      id: customer.id,
      module: RecycleBinType.CUSTOMERS,
      deletedAt: null,
      componentName: 'Customer account',
      summary: customer.customerCode || customer.id,
      detail: 'Restored',
      deletedBy: null,
      deletedById: null,
      context: { 'Name': customer.name, 'Status': customer.status || null },
    };
  }

  // ─── Permanent purge ──────────────────────────────────────────────────────

  /**
   * Hard, unrecoverable delete. Admin-tray only, and only for a record that is
   * ALREADY in the bin — a live row can never be destroyed in one step, which
   * is the single invariant this whole module exists to protect.
   *
   * Referential integrity is enforced by the database: if the record still has
   * dependents that must not be destroyed (a customer with ledger history, a
   * card with work logs), the FK rejects the delete and the operator gets a
   * clear refusal instead of a silently orphaned ledger.
   */
  async purge(type: RecycleBinType, id: string, companyId: string): Promise<void> {
    switch (type) {
      case RecycleBinType.PRODUCTION_ENTRIES:
      case RecycleBinType.HAND_PACKING:
        return this.purgeProductionEntry(id, companyId);
      case RecycleBinType.JOB_CARDS:
        return this.purgeJobCard(id, companyId);
      case RecycleBinType.DISPATCH:
        return this.purgeDispatch(id, companyId);
      case RecycleBinType.CUSTOMERS:
        return this.purgeCustomer(id, companyId);
      default: {
        const doc = this.docs[type];
        if (!doc) throw this.unknownType(type);
        return this.purgeDocument(doc, id, companyId);
      }
    }
  }

  /**
   * Hard-delete a Phase-2 document and the child lines that belong to it.
   *
   * The children go first, inside the same transaction as the parent: FK
   * direction means the parent cannot be removed while rows still point at it,
   * and doing it in one transaction guarantees a failure leaves the whole
   * document intact rather than a parentless pile of orphan lines.
   */
  private async purgeDocument(spec: TrashDocSpec, id: string, companyId: string): Promise<void> {
    const row = await this.findTrashedRow(spec, id, companyId);
    if (!row) throw new NotFoundException(`${spec.label} not found in the Recycle Bin`);
    this.assertInBin(row.deletedAt, spec.label);

    try {
      await spec.repo.manager.transaction(async (manager) => {
        for (const child of spec.children) {
          await manager.getRepository(child.repo.target as any).delete({ [child.fk]: row.id });
        }
        await spec.repo.delete({ id: row.id });
      });
    } catch (err) {
      throw this.refusePurge(spec.label, err);
    }
  }

  private async purgeProductionEntry(id: string, companyId: string): Promise<void> {
    const entry = await this.entryRepo.findOne({ where: { id, companyId }, withDeleted: true });
    if (!entry) throw new NotFoundException('Production entry not found in the Recycle Bin');
    this.assertInBin(entry.deletedAt, 'Production entry');

    try {
      await this.entryRepo.manager.transaction(async (manager) => {
        await manager.getRepository(ProductionEntryItem).delete({ productionEntryId: entry.id });
        await manager.getRepository(ProductionEntry).delete({ id: entry.id });
      });
    } catch (err) {
      throw this.refusePurge('production entry', err);
    }
  }

  private async purgeJobCard(id: string, companyId: string): Promise<void> {
    const card = await this.jobCardRepo.findOne({ where: { id, companyId }, withDeleted: true });
    if (!card) throw new NotFoundException('Job card not found in the Recycle Bin');
    this.assertInBin(card.deletedAt, 'Job card');

    try {
      await this.jobCardRepo.manager.transaction(async (manager) => {
        await manager.getRepository(MaintenanceJobCardPart).delete({ jobCardId: card.id });
        await manager.getRepository(MaintenanceJobCard).delete({ id: card.id });
      });
    } catch (err) {
      throw this.refusePurge('job card', err);
    }
  }

  private async purgeDispatch(id: string, companyId: string): Promise<void> {
    const pkg = await this.packageRepo.findOne({ where: { id, companyId }, withDeleted: true });
    if (!pkg) throw new NotFoundException('Dispatch package not found in the Recycle Bin');
    this.assertInBin(pkg.deletedAt, 'Dispatch package');

    try {
      await this.packageRepo.manager.transaction(async (manager) => {
        await manager.getRepository(DispatchPackageUnit).delete({ packageId: pkg.id });
        await manager.getRepository(DispatchPackage).delete({ id: pkg.id });
      });
    } catch (err) {
      throw this.refusePurge('dispatch package', err);
    }
  }

  private async purgeCustomer(id: string, companyId: string): Promise<void> {
    const customer = await this.customerRepo.findOne({ where: { id, companyId }, withDeleted: true });
    if (!customer) throw new NotFoundException('Customer not found in the Recycle Bin');
    this.assertInBin(customer.deletedAt, 'Customer');

    try {
      await this.customerRepo.manager.transaction(async (manager) => {
        await manager.getRepository(CustomerContact).delete({ customerId: customer.id });
        await manager.getRepository(CustomerAddress).delete({ customerId: customer.id });
        await manager.getRepository(Customer).delete({ id: customer.id });
      });
    } catch (err) {
      throw this.refusePurge('customer', err);
    }
  }

  private assertInBin(deletedAt: Date | null | undefined, label: string): void {
    if (!deletedAt) {
      throw new BadRequestException(
        `${label} is still live. Move it to the Recycle Bin before permanently deleting it.`,
      );
    }
  }

  /**
   * Turn a raw FK/integrity failure into an actionable refusal. Never let a
   * constraint name or a SQL string reach the operator — and never let a
   * partially-applied cascade through, because the transaction already rolled
   * back.
   */
  private refusePurge(subject: string, err: unknown): Error {
    this.logger.warn(`Refused permanent delete of a ${subject}: ${(err as Error)?.message}`);
    const code = (err as { code?: string })?.code;
    const isIntegrity = code === '23503' || code === '23502' || code === '23514';
    if (isIntegrity) {
      return new ConflictException(
        `This ${subject} is still referenced by other records, so it cannot be permanently deleted. ` +
          'Keep it in the Recycle Bin, or remove the dependent records first.',
      );
    }
    return err instanceof Error ? err : new ConflictException(`Could not permanently delete this ${subject}`);
  }
}
