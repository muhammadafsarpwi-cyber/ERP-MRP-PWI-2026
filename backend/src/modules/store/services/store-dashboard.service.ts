import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ReplenishmentService } from './replenishment.service';

const ACTIVE_MR_STATUSES = ['DRAFT', 'SUBMITTED', 'APPROVED', 'PARTIALLY_CONVERTED', 'FULLY_CONVERTED'];
const PENDING_MR_STATUSES = ['SUBMITTED', 'APPROVED', 'PARTIALLY_CONVERTED', 'FULLY_CONVERTED'];
const ACTIVE_PR_STATUSES = ['SUBMITTED', 'APPROVED'];
const OPEN_PO_STATUSES = ['APPROVED', 'PARTIALLY_RECEIVED', 'FULLY_RECEIVED'];
const PENDING_RECEIPT_GRN_STATUSES = ['RECEIVED', 'INSPECTION', 'ACCEPTED', 'PARTIALLY_ACCEPTED'];
const NON_ACTIVE_PR_STATUSES = ['CANCELLED', 'REJECTED'];

export interface StoreDashboardFilters {
  storeId?: string;
  divisionId?: string;
  sectionId?: string;
  departmentId?: string;
  dateFrom?: string;
  dateTo?: string;
}

@Injectable()
export class StoreDashboardService {
  private readonly logger = new Logger(StoreDashboardService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly replenishmentService: ReplenishmentService,
  ) {}

  async getSummary(companyId: string, rawFilters: StoreDashboardFilters = {}) {
    const filters: StoreDashboardFilters = {
      storeId: rawFilters.storeId || undefined,
      divisionId: rawFilters.divisionId || undefined,
      sectionId: rawFilters.sectionId || undefined,
      departmentId: rawFilters.departmentId || undefined,
      dateFrom: rawFilters.dateFrom || undefined,
      dateTo: rawFilters.dateTo || undefined,
    };

    const [kpis, workflow, pendingApprovals, procurementFunnel, lowStock, stockSummary, activity] = await Promise.all([
      this.buildKpis(companyId, filters),
      this.buildWorkflow(companyId, filters),
      this.buildPendingApprovals(companyId, filters),
      this.buildProcurementFunnel(companyId, filters),
      this.buildLowStock(companyId, filters),
      this.buildStockSummary(companyId, filters),
      this.buildActivity(companyId, filters),
    ]);

    return {
      generatedAt: new Date().toISOString(),
      filters,
      kpis,
      workflow,
      pendingApprovals,
      procurementFunnel,
      lowStock,
      stockSummary,
      activity,
    };
  }

  // ==================== KPIs ====================

  private async buildKpis(companyId: string, filters: StoreDashboardFilters) {
    const mrParams: any[] = [companyId];
    const mrConds = this.scopeConds('m', filters, mrParams, { dateColumn: 'request_date' }).join(' AND ');
    mrParams.push(PENDING_MR_STATUSES);
    const mrPendingWhere = `${mrConds} AND m.status = ANY($${mrParams.length}) AND m.rejected_at IS NULL AND m.cancelled_at IS NULL`;

    const mrParams2: any[] = [companyId];
    const mrConds2 = this.scopeConds('m', filters, mrParams2, { dateColumn: 'request_date' }).join(' AND ');
    mrParams2.push(ACTIVE_MR_STATUSES);
    const mrActiveWhere = `${mrConds2} AND m.status = ANY($${mrParams2.length}) AND m.rejected_at IS NULL AND m.cancelled_at IS NULL`;

    const [totalStores, totalStoreItems, pendingRequests, lowStockItems, pendingPrs, pendingManager, pendingGm, pendingReceipts, overdue] = await Promise.all([
      this.countStores(companyId, filters),
      this.countStoreItems(companyId, filters),
      this.scalar(
        `SELECT COUNT(*)::int AS v FROM material_requests m WHERE ${mrPendingWhere}`,
        mrParams,
      ),
      this.countInsufficientItems(companyId, filters),
      this.countPendingPrs(companyId, filters),
      this.scalar(
        `SELECT COUNT(*)::int AS v FROM material_requests m WHERE ${mrActiveWhere} AND m.status = 'SUBMITTED'`,
        mrParams2,
      ),
      this.scalar(
        `SELECT COUNT(*)::int AS v FROM material_requests m WHERE ${mrActiveWhere} AND m.status = 'APPROVED' AND m.gm_approved_at IS NULL`,
        mrParams2,
      ),
      this.countPendingReceipts(companyId, filters),
      this.scalar(
        `SELECT COUNT(*)::int AS v FROM material_requests m WHERE ${mrActiveWhere} AND m.expected_delivery_date IS NOT NULL AND m.actual_delivery_date IS NULL AND m.pr_id IS NOT NULL AND m.expected_delivery_date < CURRENT_DATE`,
        mrParams2,
      ),
    ]);

    return [
      { key: 'totalStores', label: 'Total Stores', value: totalStores, color: 'blue' },
      { key: 'totalStoreItems', label: 'Total Store Items', value: totalStoreItems, color: 'geekblue' },
      { key: 'lowStockItems', label: 'Low / Shortage Items', value: lowStockItems, color: 'volcano' },
      { key: 'pendingRequests', label: 'Pending Material Requests', value: pendingRequests, color: 'cyan' },
      { key: 'pendingPrs', label: 'Pending Purchase Requisitions', value: pendingPrs, color: 'purple' },
      { key: 'pendingManagerApprovals', label: 'Pending Manager Approvals', value: pendingManager, color: 'gold' },
      { key: 'pendingGmApprovals', label: 'Pending GM Approvals', value: pendingGm, color: 'orange' },
      { key: 'pendingReceipts', label: 'Pending Receipts / GRNs', value: pendingReceipts, color: 'green' },
      { key: 'overdueDeliveries', label: 'Overdue Deliveries', value: overdue, color: 'red' },
    ];
  }

  // ==================== Workflow ====================

  private async buildWorkflow(companyId: string, filters: StoreDashboardFilters) {
    const params: any[] = [companyId];
    const conds = this.scopeConds('m', filters, params, { dateColumn: 'request_date' }).join(' AND ');
    params.push(ACTIVE_MR_STATUSES);
    const activeWhere = `${conds} AND m.status = ANY($${params.length}) AND m.rejected_at IS NULL AND m.cancelled_at IS NULL`;

    const f = await this.dataSource.query<any[]>(
      `SELECT
         COUNT(*)::int AS "allActive",
         COUNT(*) FILTER (WHERE m.status = 'DRAFT')::int AS "draft",
         COUNT(*) FILTER (WHERE m.status = 'SUBMITTED')::int AS "submitted",
         COUNT(*) FILTER (WHERE m.submitted_at IS NOT NULL)::int AS "submittedTotal",
         COUNT(*) FILTER (WHERE m.status = 'APPROVED' AND m.gm_approved_at IS NULL)::int AS "gmPending",
         COUNT(*) FILTER (WHERE m.status = 'APPROVED')::int AS "approvedStage",
         COUNT(*) FILTER (WHERE m.approved_at IS NOT NULL)::int AS "managerApproved",
         COUNT(*) FILTER (WHERE m.gm_approved_at IS NOT NULL)::int AS "gmApproved",
         COUNT(*) FILTER (WHERE m.pr_id IS NOT NULL)::int AS "prCreated",
         COUNT(*) FILTER (WHERE m.po_id IS NOT NULL)::int AS "poCreated",
         COUNT(*) FILTER (WHERE m.expected_delivery_date IS NOT NULL)::int AS "etaTotal",
         COUNT(*) FILTER (WHERE m.expected_delivery_date IS NOT NULL AND m.eta_pending = true)::int AS "etaPending",
         COUNT(*) FILTER (WHERE m.expected_delivery_date IS NOT NULL AND m.eta_pending = false)::int AS "etaSet"
        FROM material_requests m
        WHERE ${activeWhere}`,
      params,
    );
    const r = f[0] || {};

    const [pendingPrs, grnTotal, grnPending, grnPosted, totalStoreItems, insufficientItems, movementCount] =
      await Promise.all([
        this.countPendingPrs(companyId, filters),
        this.countReceipts(companyId, filters, 'TOTAL'),
        this.countReceipts(companyId, filters, 'PENDING'),
        this.countReceipts(companyId, filters, 'POSTED'),
        this.countStoreItems(companyId, filters),
        this.countInsufficientItems(companyId, filters),
        this.countIssueReturnTransfer(companyId, filters),
      ]);

    const n = (key: string) => Number(r[key] || 0);

    return [
      {
        key: 'materialRequirement',
        label: 'Material Requirement',
        count: n('allActive'),
        pending: n('draft'),
        completed: n('allActive') - n('draft'),
        path: '/store/material-requests',
      },
      {
        key: 'materialRequest',
        label: 'Material Request',
        count: n('submittedTotal'),
        pending: n('submitted'),
        completed: n('managerApproved'),
        path: '/store/material-requests',
      },
      {
        key: 'managerApproval',
        label: 'Manager Approval',
        count: n('managerApproved'),
        pending: n('submitted'),
        completed: n('managerApproved') - n('submitted'),
        path: '/store/pending-approvals',
      },
      {
        key: 'gmApproval',
        label: 'GM Approval',
        count: n('managerApproved'),
        pending: n('gmPending'),
        completed: n('gmApproved'),
        path: '/store/pending-approvals',
      },
      {
        key: 'approved',
        label: 'Approved',
        count: n('gmApproved'),
        pending: n('gmPending'),
        completed: n('prCreated'),
        path: '/store/pending-approvals',
      },
      {
        key: 'prCreated',
        label: 'PR Created',
        count: n('prCreated'),
        pending: pendingPrs,
        completed: n('poCreated'),
        path: '/procurement/requisitions',
      },
      {
        key: 'procurement',
        label: 'Procurement / Supplier',
        count: n('prCreated'),
        pending: pendingPrs,
        completed: n('poCreated'),
        path: '/procurement/orders',
      },
      {
        key: 'eta',
        label: 'ETA Confirmed',
        count: n('etaTotal'),
        pending: n('etaPending'),
        completed: n('etaSet'),
        path: '/store/material-requests',
      },
      {
        key: 'grn',
        label: 'GRN / Receive',
        count: grnTotal,
        pending: grnPending,
        completed: grnPosted,
        path: '/procurement/receipts',
      },
      {
        key: 'storeStock',
        label: 'Store Stock',
        count: totalStoreItems,
        pending: insufficientItems,
        completed: Math.max(0, totalStoreItems - insufficientItems),
        path: '/store/stock-balance',
      },
      {
        key: 'movement',
        label: 'Issue / Return / Transfer',
        count: movementCount,
        pending: movementCount,
        completed: movementCount,
        path: '/store/material-issues',
      },
    ];
  }

  // ==================== Pending Approvals ====================

  private async buildPendingApprovals(companyId: string, filters: StoreDashboardFilters) {
    const runQueue = async (statusSql: string, extraSelect: string, extraGroupBy: string) => {
      const params: any[] = [companyId];
      const conds = this.scopeConds('m', filters, params, { dateColumn: 'request_date' }).join(' AND ');
      const rows = await this.dataSource.query<any[]>(
        `SELECT m.id, m.request_number AS "requestNumber",
                m.request_date AS "requestDate", m.priority, m.status,
                COALESCE(s.store_code, '') AS "storeCode", COALESCE(s.store_name, '') AS "storeName",
                COALESCE(d.name, '') AS "divisionName", COALESCE(dep.name, '') AS "departmentName",
                COALESCE(sec.name, '') AS "sectionName",
                COUNT(ml.id)::int AS "items",
                COALESCE(SUM(ml.requested_quantity), 0)::float8 AS "quantity",
                COALESCE(EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - m.created_at)) / 86400, 0)::float8 AS "ageDays"
                ${extraSelect}
           FROM material_requests m
           JOIN material_request_lines ml ON ml.request_id = m.id
           LEFT JOIN stores s ON s.id = m.store_id
           LEFT JOIN divisions d ON d.id = m.division_id
           LEFT JOIN departments dep ON dep.id = m.department_id
           LEFT JOIN sections sec ON sec.id = m.section_id
           LEFT JOIN erp_users u ON u.id = m.submitted_by
           LEFT JOIN erp_users au ON au.id = m.approved_by
          WHERE ${conds} AND ${statusSql}
          GROUP BY m.id, s.store_code, s.store_name, d.name, dep.name, sec.name ${extraGroupBy}
          ORDER BY m.request_date ASC, m.created_at ASC
          LIMIT 8`,
        params,
      );
      return rows.map((row: any) => ({
        ...row,
        items: Number(row.items || 0),
        quantity: Number(row.quantity || 0),
        ageDays: Math.round(Number(row.ageDays || 0)),
      }));
    };

    const manager = await runQueue(
      `m.status = 'SUBMITTED' AND m.rejected_at IS NULL AND m.cancelled_at IS NULL`,
      `, COALESCE(u.display_name, '') AS "submittedByName"`,
      `, u.display_name`,
    );

    const gm = await runQueue(
      `m.status = 'APPROVED' AND m.gm_approved_at IS NULL AND m.rejected_at IS NULL AND m.cancelled_at IS NULL`,
      `, COALESCE(au.display_name, '') AS "approvedByName",
        m.approved_at AS "approvedAt"`,
      `, au.display_name, m.approved_at`,
    );

    return { manager, gm };
  }

  // ==================== Procurement Tracking Funnel ====================

  private async buildProcurementFunnel(companyId: string, filters: StoreDashboardFilters) {
    const baseMr = async (extraWhere: string) => {
      const params: any[] = [companyId];
      const conds = this.scopeConds('m', filters, params, { dateColumn: 'request_date' }).join(' AND ');
      params.push(ACTIVE_MR_STATUSES);
      return this.scalar(
        `SELECT COALESCE(SUM(ml.requested_quantity), 0)::float8 AS v
           FROM material_requests m
           JOIN material_request_lines ml ON ml.request_id = m.id
          WHERE ${conds} AND m.status = ANY($${params.length}) AND m.rejected_at IS NULL AND m.cancelled_at IS NULL ${extraWhere}`,
        params,
      );
    };

    const prParams = (): [string, any[]] => {
      const params: any[] = [companyId];
      const conds = this.scopeConds('m', filters, params, { dateColumn: 'request_date' }).join(' AND ');
      params.push(ACTIVE_MR_STATUSES);
      const existsSql = `${conds} AND m.status = ANY($${params.length}) AND m.rejected_at IS NULL AND m.cancelled_at IS NULL`;
      return [
        `EXISTS (
           SELECT 1 FROM material_requests m
            WHERE m.pr_id = pr.id AND m.company_id = $1 AND ${existsSql}
         )`,
        params,
      ];
    };

    const prQtyQ = async () => {
      const [existsSql, params] = prParams();
      return this.scalar(
        `SELECT COALESCE(SUM(prl.quantity), 0)::float8 AS v
           FROM purchase_requisitions pr
           JOIN purchase_requisition_lines prl ON prl.requisition_id = pr.id
          WHERE pr.company_id = $1
            AND pr.status NOT IN ('DRAFT') AND pr.is_active = true
            AND ${existsSql}
            AND pr.status NOT IN ('CANCELLED', 'REJECTED')`,
        params,
      );
    };

    const poQtyQ = async () => {
      const params: any[] = [companyId];
      const conds = this.scopeConds('m', filters, params, { dateColumn: 'request_date' }).join(' AND ');
      params.push(ACTIVE_MR_STATUSES);
      const mrStatusIdx = params.length;
      params.push(ACTIVE_PR_STATUSES);
      const prStatusIdx = params.length;
      params.push(OPEN_PO_STATUSES);
      const poStatusIdx = params.length;
      return this.scalar(
        `SELECT COALESCE(SUM(pol.quantity), 0)::float8 AS v
           FROM purchase_order_lines pol
           JOIN purchase_orders po ON po.id = pol.po_id
           LEFT JOIN purchase_requisitions pr ON pr.id = po.requisition_id
          WHERE po.company_id = $1 AND po.status = ANY($${poStatusIdx})
            AND po.is_active = true AND po.cancelled_at IS NULL
            AND pr.company_id = $1 AND pr.status = ANY($${prStatusIdx})
            AND EXISTS (
              SELECT 1 FROM material_requests m
               WHERE m.pr_id = pr.id AND m.company_id = $1
                 AND ${conds}
                 AND m.status = ANY($${mrStatusIdx})
                 AND m.rejected_at IS NULL AND m.cancelled_at IS NULL
            )`,
        params,
      );
    };

    const grnReceivedQ = async () => {
      const params: any[] = [companyId];
      const scope = await this.warehouseScope('gr', filters, params);
      return this.scalar(
        `SELECT COALESCE(SUM(grl.quantity_accepted), 0)::float8 AS v
           FROM goods_receipt_lines grl
           JOIN goods_receipts gr ON gr.id = grl.receipt_id
          WHERE gr.company_id = $1 AND gr.status = 'POSTED' ${scope}`,
        params,
      );
    };

    const [requested, prQty, managerApproved, gmApproved, supplierConfirmed, etaQty, ordered, received] =
      await Promise.all([
        baseMr(''),
        prQtyQ(),
        baseMr('AND m.approved_at IS NOT NULL'),
        baseMr('AND m.gm_approved_at IS NOT NULL'),
        baseMr('AND m.supplier_confirmed_date IS NOT NULL'),
        baseMr(`AND m.expected_delivery_date IS NOT NULL AND m.eta_pending = false`),
        poQtyQ(),
        grnReceivedQ(),
      ]);

    const pending = Math.max(0, requested - received);
    const steps = [
      { key: 'requested', label: 'Requested (MR)', qty: requested, color: 'blue' },
      { key: 'prCreated', label: 'PR Created', qty: prQty, color: 'purple' },
      { key: 'managerApproved', label: 'Manager Approved', qty: managerApproved, color: 'gold' },
      { key: 'gmApproved', label: 'GM Approved', qty: gmApproved, color: 'orange' },
      { key: 'ordered', label: 'Purchase Order', qty: ordered, color: 'geekblue' },
      { key: 'supplierConfirmed', label: 'Supplier Confirmed', qty: supplierConfirmed, color: 'volcano' },
      { key: 'etaConfirmed', label: 'ETA Confirmed', qty: etaQty, color: 'cyan' },
      { key: 'received', label: 'Received (GRN)', qty: received, color: 'green' },
    ];

    return { requested, received, pending, steps };
  }

  // ==================== Low Stock Queue ====================

  private async buildLowStock(companyId: string, filters: StoreDashboardFilters) {
    try {
      const queue = await this.replenishmentService.getQueue(companyId, {
        statuses: 'LOW_STOCK,REORDER_REQUIRED,OVERDUE',
        storeId: filters.storeId || undefined,
        divisionId: filters.divisionId || undefined,
        limit: 50,
      });
      let rows = queue.data || [];
      if (filters.sectionId || filters.departmentId) {
        rows = rows.filter(
          (r) =>
            (!filters.sectionId || r.sectionId === filters.sectionId) &&
            (!filters.departmentId || r.departmentId === filters.departmentId),
        );
      }
      return { available: true, total: rows.length, rows: rows.slice(0, 25) };
    } catch (error) {
      this.logger.error(`Low stock queue unavailable: ${(error as Error).message}`);
      return { available: false, total: 0, rows: [] };
    }
  }

  // ==================== Store Stock Summary ====================

  private async buildStockSummary(companyId: string, filters: StoreDashboardFilters) {
    const params: any[] = [companyId];
    const rows = await this.dataSource.query<any[]>(
      `SELECT si.id AS "storeItemId", si.store_id AS "storeId", si.item_id AS "itemId",
              s.store_code AS "storeCode", s.store_name AS "storeName",
              i.item_code AS "itemCode", i.name AS "itemName",
              COALESCE(u.code, '') AS "uomCode",
              COALESCE(SUM(ib.on_hand), 0)::float8 AS "onHand",
              COALESCE(SUM(ib.reserved), 0)::float8 AS "reserved",
              COALESCE(SUM(ib.available), 0)::float8 AS "available",
              COALESCE(MAX(si.minimum_stock), 0)::float8 AS "minimumStock",
              COALESCE(MAX(si.reorder_level), 0)::float8 AS "reorderLevel",
              COALESCE(MAX(si.maximum_stock), 0)::float8 AS "maximumStock"
         FROM store_items si
         JOIN stores s ON s.id = si.store_id
         JOIN items i ON i.id = si.item_id
         LEFT JOIN uoms u ON u.id = i.base_uom_id
         LEFT JOIN inventory_balances ib
                ON ib.item_id = si.item_id
               AND ib.company_id = s.company_id
               AND ib.status = 'ACTIVE'
               AND (s.warehouse_id IS NULL OR ib.warehouse_id = s.warehouse_id)
        WHERE ${this.appendConds(`s.company_id = $1 AND si.status = 'ACTIVE'`, this.storeScopeConds(filters, params))}
        GROUP BY si.id, s.store_code, s.store_name, i.item_code, i.name, u.code
        ORDER BY (COALESCE(MAX(si.minimum_stock), 0) - COALESCE(SUM(ib.available), 0)) DESC, i.name ASC
        LIMIT 100`,
      params,
    );

    const mapped = rows.map((row: any) => {
      const available = Number(row.available || 0);
      const minimumStock = Number(row.minimumStock || 0);
      const reorderLevel = Number(row.reorderLevel || 0);
      const shortage = Math.max(0, minimumStock - available);
      let status = 'OK';
      if (available <= minimumStock) status = 'LOW';
      else if (reorderLevel > 0 && available <= reorderLevel) status = 'REORDER';
      return {
        ...row,
        onHand: Number(row.onHand || 0),
        reserved: Number(row.reserved || 0),
        available,
        minimumStock,
        reorderLevel,
        maximumStock: Number(row.maximumStock || 0),
        shortage,
        status,
      };
    });

    const belowMinimum = mapped.filter((r) => r.status === 'LOW').length;
    return { rows: mapped, belowMinimum, total: mapped.length };
  }

  // ==================== Recent Activity ====================

  private async buildActivity(companyId: string, filters: StoreDashboardFilters) {
    const params: any[] = [];

    const mrScope = this.scopeCondsShared('m', companyId, filters, params);
    const issueScope = this.scopeCondsShared('mi', companyId, filters, params);
    const retScope = this.scopeCondsShared('mr', companyId, filters, params);

    const grnScope = this.warehouseScopeColShared('warehouse_id', 'gr', companyId, filters, params);
    const trfScope = this.warehouseScopeColShared('from_warehouse_id', 'st', companyId, filters, params);
    const adjScope = this.warehouseScopeColShared('warehouse_id', 'sa', companyId, filters, params);

    const prConds: string[] = [`pr.company_id = $${
      this.pushParam(params, () => companyId)
    }`];
    if (filters.dateFrom) {
      prConds.push(`pr.created_at >= $${this.pushParam(params, () => filters.dateFrom)}`);
    }
    if (filters.dateTo) {
      prConds.push(`pr.created_at <= $${this.pushParam(params, () => filters.dateTo)}`);
    }

    const mrConds = mrScope.join(' AND ');
    const issueConds = issueScope.join(' AND ');
    const retConds = retScope.join(' AND ');

    const sql = `
      SELECT "type", id, document, status, "date", store, org, summary FROM (
        SELECT 'MR' AS "type", m.id, m.request_number AS document, m.status,
               m.created_at AS "date",
               COALESCE(s.store_name, '') AS store,
               TRIM(BOTH '/' FROM (COALESCE(dep.name,'') || '/' || COALESCE(sec.name,''))) AS org,
               (SELECT COUNT(*)::text FROM material_request_lines ml WHERE ml.request_id = m.id) || ' items' AS summary
          FROM material_requests m
          LEFT JOIN stores s ON s.id = m.store_id
          LEFT JOIN departments dep ON dep.id = m.department_id
          LEFT JOIN sections sec ON sec.id = m.section_id
         WHERE ${mrConds}

        UNION ALL
        SELECT 'ISSUE' AS "type", mi.id, mi.issue_number AS document, mi.status,
               mi.created_at AS "date",
               COALESCE(s.store_name, '') AS store,
               TRIM(BOTH '/' FROM (COALESCE(dep.name,'') || '/' || COALESCE(sec.name,''))) AS org,
               (SELECT COUNT(*)::text FROM material_issue_lines ml WHERE ml.issue_id = mi.id) || ' items' AS summary
          FROM material_issues mi
          LEFT JOIN stores s ON s.id = mi.store_id
          LEFT JOIN departments dep ON dep.id = mi.issued_to_department_id
          LEFT JOIN sections sec ON sec.id = mi.section_id
         WHERE ${issueConds}

        UNION ALL
        SELECT 'RETURN' AS "type", mr.id, mr.return_number AS document, mr.status,
               mr.created_at AS "date",
               COALESCE(s.store_name, '') AS store,
               TRIM(BOTH '/' FROM (COALESCE(dep.name,'') || '/' || COALESCE(sec.name,''))) AS org,
               (SELECT COUNT(*)::text FROM material_return_lines ml WHERE ml.return_id = mr.id) || ' items' AS summary
          FROM material_returns mr
          LEFT JOIN stores s ON s.id = mr.store_id
          LEFT JOIN departments dep ON dep.id = mr.from_department_id
          LEFT JOIN sections sec ON sec.id = mr.section_id
         WHERE ${retConds}

        UNION ALL
        SELECT 'GRN' AS "type", gr.id, COALESCE(gr.grn_number, gr.receipt_code) AS document, gr.status,
               gr.created_at AS "date",
               COALESCE(w.name, '') AS store,
               '' AS org,
               (SELECT COUNT(*)::text FROM goods_receipt_lines gl WHERE gl.receipt_id = gr.id) || ' lines' AS summary
          FROM goods_receipts gr
          LEFT JOIN warehouses w ON w.id = gr.warehouse_id
         WHERE gr.company_id = $1 ${grnScope}

        UNION ALL
        SELECT 'PR' AS "type", pr.id, pr.requisition_code AS document, pr.status,
               pr.created_at AS "date",
               '' AS store, '' AS org, '' AS summary
          FROM purchase_requisitions pr
         WHERE ${prConds.join(' AND ')}

        UNION ALL
        SELECT 'TRANSFER' AS "type", st.id, st.transfer_code AS document, st.status,
               st.created_at AS "date",
               COALESCE(wf.name, '') || CASE WHEN COALESCE(wt.name,'') <> '' THEN ' → ' ELSE '' END || COALESCE(wt.name, '') AS store,
               '' AS org,
               (SELECT COUNT(*)::text FROM stock_transfer_lines tl WHERE tl.transfer_id = st.id) || ' lines' AS summary
          FROM stock_transfers st
          LEFT JOIN warehouses wf ON wf.id = st.from_warehouse_id
          LEFT JOIN warehouses wt ON wt.id = st.to_warehouse_id
         WHERE st.company_id = $1 AND st.is_active = true ${trfScope}

        UNION ALL
        SELECT 'ADJUSTMENT' AS "type", sa.id, sa.adjustment_code AS document, sa.status,
               sa.created_at AS "date",
               COALESCE(w.name, '') AS store,
               '' AS org,
               (SELECT COUNT(*)::text FROM stock_adjustment_lines sl WHERE sl.adjustment_id = sa.id) || ' lines' AS summary
          FROM stock_adjustments sa
          LEFT JOIN warehouses w ON w.id = sa.warehouse_id
         WHERE sa.company_id = $1 AND sa.is_active = true ${adjScope}
      ) AS act
      ORDER BY "date" DESC
      LIMIT 15
    `;

    const rows = await this.dataSource.query<any[]>(sql, params);

    return rows.map((row: any) => ({
      ...row,
      summary: row.summary || '',
    }));
  }

  private pushParam(params: any[], getValue: () => any): number {
    params.push(getValue());
    return params.length;
  }

  // ==================== Count helpers ====================

  private async scalar(sql: string, params: any[]): Promise<number> {
    const rows = await this.dataSource.query(sql, params);
    return Number(rows[0]?.v ?? 0) || 0;
  }

  private appendConds(base: string, conds: string[]): string {
    return conds.length ? `${base} AND ${conds.join(' AND ')}` : base;
  }

  private async countStores(companyId: string, filters: StoreDashboardFilters) {
    const params: any[] = [companyId];
    return this.scalar(
      `SELECT COUNT(*)::int AS v FROM stores s WHERE ${this.appendConds(`s.company_id = $1 AND s.status = 'ACTIVE'`, this.storeScopeConds(filters, params))}`,
      params,
    );
  }

  private async countStoreItems(companyId: string, filters: StoreDashboardFilters) {
    const params: any[] = [companyId];
    return this.scalar(
      `SELECT COUNT(*)::int AS v
         FROM store_items si
         JOIN stores s ON s.id = si.store_id
        WHERE ${this.appendConds(`s.company_id = $1 AND si.status = 'ACTIVE' AND s.status = 'ACTIVE'`, this.storeScopeConds(filters, params))}`,
      params,
    );
  }

  private async countInsufficientItems(companyId: string, filters: StoreDashboardFilters) {
    const params: any[] = [companyId];
    return this.scalar(
      `SELECT COUNT(*)::int AS v FROM (
         SELECT si.id,
                COALESCE(SUM(ib.available), 0)::float8 AS "availableSum",
                COALESCE(MAX(si.minimum_stock), 0)::float8 AS "minimumStock",
                COALESCE(MAX(si.reorder_level), 0)::float8 AS "reorderLevel"
           FROM store_items si
           JOIN stores s ON s.id = si.store_id
           LEFT JOIN inventory_balances ib
                  ON ib.item_id = si.item_id
                 AND ib.company_id = s.company_id
                 AND ib.status = 'ACTIVE'
                 AND (s.warehouse_id IS NULL OR ib.warehouse_id = s.warehouse_id)
          WHERE ${this.appendConds(`s.company_id = $1 AND si.status = 'ACTIVE' AND s.status = 'ACTIVE'`, this.storeScopeConds(filters, params))}
          GROUP BY si.id
       ) t
       WHERE t."availableSum" <= t."minimumStock" OR t."availableSum" <= t."reorderLevel"`,
      params,
    );
  }

  private async countPendingPrs(companyId: string, filters: StoreDashboardFilters) {
const params: any[] = [companyId];
    const conds = this.scopeConds('m', filters, params, { dateColumn: 'request_date' }).join(' AND ');
    params.push(ACTIVE_MR_STATUSES);
    params.push(ACTIVE_PR_STATUSES);
    return this.scalar(
      `SELECT COUNT(DISTINCT pr.id)::int AS v
         FROM purchase_requisitions pr
        WHERE pr.company_id = $1 AND pr.status = ANY($${params.length}) AND pr.is_active = true
          AND EXISTS (
            SELECT 1 FROM material_requests m
             WHERE m.pr_id = pr.id AND m.company_id = $1
               AND ${conds}
               AND m.status = ANY($${params.length - 1})
               AND m.rejected_at IS NULL AND m.cancelled_at IS NULL
          )`,
      params,
    );
  }

  private async countReceipts(companyId: string, filters: StoreDashboardFilters, kind: 'TOTAL' | 'PENDING' | 'POSTED') {
    const params: any[] = [companyId];
    const scope = await this.warehouseScope('gr', filters, params);
    let statusSql = '';
    if (kind === 'PENDING') {
      params.push(PENDING_RECEIPT_GRN_STATUSES);
      statusSql = `AND gr.status = ANY($${params.length}) AND gr.posted_at IS NULL`;
    } else if (kind === 'POSTED') {
      statusSql = `AND gr.status = 'POSTED'`;
    }
    return this.scalar(
      `SELECT COUNT(*)::int AS v
         FROM goods_receipts gr
        WHERE gr.company_id = $1 ${scope} ${statusSql}`,
      params,
    );
  }

  private async countPendingReceipts(companyId: string, filters: StoreDashboardFilters) {
    return this.countReceipts(companyId, filters, 'PENDING');
  }

  private async countIssueReturnTransfer(companyId: string, filters: StoreDashboardFilters) {
    const issueParams: any[] = [companyId];
    const issueConds = this.scopeConds('mi', filters, issueParams, { storeIdColumn: 'store_id' }).join(' AND ');
    const retParams: any[] = [companyId];
    const retConds = this.scopeConds('mr', filters, retParams, { storeIdColumn: 'store_id' }).join(' AND ');
    const trfParams: any[] = [companyId];
    const trfScope = this.warehouseScopeCol('from_warehouse_id', 'st', filters, trfParams);

    const issues = await this.scalar(
      `SELECT COUNT(*)::int AS v FROM material_issues mi WHERE ${issueConds} AND mi.status = 'POSTED'`,
      issueParams,
    );
    const returns = await this.scalar(
      `SELECT COUNT(*)::int AS v FROM material_returns mr WHERE ${retConds} AND mr.status = 'POSTED'`,
      retParams,
    );
    const transfers = await this.scalar(
      `SELECT COUNT(*)::int AS v FROM stock_transfers st WHERE st.company_id = $1 AND st.is_active = true AND st.status = 'POSTED' ${trfScope}`,
      trfParams,
    );
    return issues + returns + transfers;
  }

  // ==================== Scope builders ====================

  private scopeConds(
    alias: string,
    filters: StoreDashboardFilters,
    params: any[],
    opts?: { dateColumn?: string; storeIdColumn?: string },
  ): string[] {
    const conds: string[] = [`${alias}.company_id = $1`];
    const dateColumn = opts?.dateColumn || 'created_at';
    const storeIdColumn = opts?.storeIdColumn || 'store_id';
    const add = (column: string, op: string, value: any) => {
      params.push(value);
      conds.push(`${alias}.${column} ${op} $${params.length}`);
    };
    if (filters.storeId) add(storeIdColumn, '=', filters.storeId);
    if (filters.divisionId) add('division_id', '=', filters.divisionId);
    if (filters.sectionId) add('section_id', '=', filters.sectionId);
    if (filters.departmentId) add('department_id', '=', filters.departmentId);
    if (filters.dateFrom) add(dateColumn, '>=', filters.dateFrom);
    if (filters.dateTo) add(dateColumn, '<=', filters.dateTo);
    return conds;
  }

  private scopeCondsShared(
    alias: string,
    companyId: string,
    filters: StoreDashboardFilters,
    params: any[],
    opts?: { dateColumn?: string; storeIdColumn?: string },
  ): string[] {
    const conds: string[] = [`${alias}.company_id = $${this.pushParam(params, () => companyId)}`];
    const dateColumn = opts?.dateColumn || 'created_at';
    const storeIdColumn = opts?.storeIdColumn || 'store_id';
    const add = (column: string, op: string, value: any) => {
      params.push(value);
      conds.push(`${alias}.${column} ${op} $${params.length}`);
    };
    if (filters.storeId) add(storeIdColumn, '=', filters.storeId);
    if (filters.divisionId) add('division_id', '=', filters.divisionId);
    if (filters.sectionId) add('section_id', '=', filters.sectionId);
    if (filters.departmentId) add('department_id', '=', filters.departmentId);
    if (filters.dateFrom) add(dateColumn, '>=', filters.dateFrom);
    if (filters.dateTo) add(dateColumn, '<=', filters.dateTo);
    return conds;
  }

  private warehouseScopeColShared(
    column: string,
    alias: string,
    companyId: string,
    filters: StoreDashboardFilters,
    params: any[],
  ): string {
    const storeConditions: string[] = [];
    const add = (column: string, value: any) => {
      params.push(value);
      storeConditions.push(`sto.${column} = $${params.length}`);
    };
    if (filters.storeId) add('id', filters.storeId);
    if (filters.divisionId) add('division_id', filters.divisionId);
    if (filters.sectionId) add('section_id', filters.sectionId);
    if (filters.departmentId) add('department_id', filters.departmentId);
    if (!storeConditions.length) return '';
    return ` AND EXISTS (
      SELECT 1 FROM stores sto
       WHERE sto.company_id = $1 AND sto.status = 'ACTIVE'
         AND sto.warehouse_id = ${alias}.${column}
         AND ${storeConditions.join(' AND ')}
    )`;
  }

  private storeScopeConds(filters: StoreDashboardFilters, params: any[]): string[] {
    const conds: string[] = [];
    const add = (column: string, value: any) => {
      params.push(value);
      conds.push(`s.${column} = $${params.length}`);
    };
    if (filters.storeId) add('id', filters.storeId);
    if (filters.divisionId) add('division_id', filters.divisionId);
    if (filters.sectionId) add('section_id', filters.sectionId);
    if (filters.departmentId) add('department_id', filters.departmentId);
    return conds;
  }

  private async warehouseScope(alias: string, filters: StoreDashboardFilters, params: any[]): Promise<string> {
    return this.warehouseScopeCol('warehouse_id', alias, filters, params);
  }

  private warehouseScopeCol(column: string, alias: string, filters: StoreDashboardFilters, params: any[]): string {
    const storeConditions = this.storeScopeOn('sto', filters, params);
    if (!storeConditions.length) return '';
    return ` AND EXISTS (
      SELECT 1 FROM stores sto
       WHERE sto.company_id = $1 AND sto.status = 'ACTIVE'
         AND sto.warehouse_id = ${alias}.${column}
         AND ${storeConditions.join(' AND ')}
    )`;
  }

  private storeScopeOn(alias: string, filters: StoreDashboardFilters, params: any[]): string[] {
    const conds: string[] = [];
    const add = (column: string, value: any) => {
      params.push(value);
      conds.push(`${alias}.${column} = $${params.length}`);
    };
    if (filters.storeId) add('id', filters.storeId);
    if (filters.divisionId) add('division_id', filters.divisionId);
    if (filters.sectionId) add('section_id', filters.sectionId);
    if (filters.departmentId) add('department_id', filters.departmentId);
    return conds;
  }
}