import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

export interface MaterialLifecycleFilters {
  storeId?: string;
  dateFrom?: string;
  dateTo?: string;
}

const DAY_MS = 1000 * 60 * 60 * 24;

const dayDiff = (from?: string | Date | null, to?: string | Date | null): number | null => {
  if (!from || !to) return null;
  const a = new Date(from);
  const b = new Date(to);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return null;
  return Math.max(0, Math.round((b.getTime() - a.getTime()) / DAY_MS));
};

const normalize = (v: unknown): number => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

@Injectable()
export class StoreMaterialTraceService {
  constructor(private readonly dataSource: DataSource) {}

  async getItemLifecycle(companyId: string, itemId: string, rawFilters: MaterialLifecycleFilters = {}) {
    const filters: MaterialLifecycleFilters = {
      storeId: rawFilters.storeId || undefined,
      dateFrom: rawFilters.dateFrom || undefined,
      dateTo: rawFilters.dateTo || undefined,
    };

    let warehouseId: string | undefined;
    if (filters.storeId) {
      const storeRows = await this.dataSource.query(
        `SELECT warehouse_id FROM stores WHERE id = $1 AND company_id = $2`,
        [filters.storeId, companyId],
      );
      warehouseId = storeRows[0]?.warehouse_id || undefined;
    }

    const [
      itemRows,
      storeConfigs,
      balances,
      reconciliationMr,
      reconciliationIssueReturn,
      reconciliationPoGrn,
      reconciliationLedger,
      reservations,
      requests,
      prs,
      orders,
      grns,
      issues,
      returns,
      ledgerRows,
      storeMap,
    ] = await Promise.all([
      this.fetchItem(companyId, itemId),
      this.fetchStoreConfigs(companyId, itemId),
      this.fetchBalances(companyId, itemId, warehouseId),
      this.fetchReconciliationMr(companyId, itemId),
      this.fetchReconciliationIssueReturn(companyId, itemId),
      this.fetchReconciliationPoGrn(companyId, itemId),
      this.fetchReconciliationLedger(companyId, itemId),
      this.fetchReservations(companyId, itemId),
      this.fetchRequests(companyId, itemId, filters.storeId),
      this.fetchPrs(companyId, itemId),
      this.fetchOrders(companyId, itemId),
      this.fetchGrns(companyId, itemId),
      this.fetchIssues(companyId, itemId, filters.storeId),
      this.fetchReturns(companyId, itemId, filters.storeId),
      this.fetchLedger(companyId, itemId, warehouseId),
      this.fetchStoreMap(companyId, itemId),
    ]);

    const item = itemRows[0] || null;
    if (!item) {
      return null;
    }

    const actives = storeConfigs.length ? storeConfigs : null;
    const balanceRows = this.decorateBalances(balances, actives);
    const totalStock = balanceRows.reduce(
      (acc, row: any) => {
        acc.onHand += row.onHand;
        acc.reserved += row.reserved;
        acc.available += row.available;
        acc.belowMinimum += row.shortage > 0 ? 1 : 0;
        return acc;
      },
      { onHand: 0, reserved: 0, available: 0, belowMinimum: 0 },
    );

    const reconciliation = {
      requested: normalize(reconciliationMr.requested),
      approved: normalize(reconciliationMr.approved),
      gmApproved: normalize(reconciliationMr.gm_approved),
      supplierConfirmed: normalize(reconciliationMr.supplier_confirmed),
      prQty: normalize(reconciliationMr.pr_created),
      orderedQty: normalize(reconciliationPoGrn.ordered),
      receivedQty: normalize(reconciliationPoGrn.received),
      acceptedQty: normalize(reconciliationPoGrn.accepted),
      rejectedQty: normalize(reconciliationPoGrn.rejected),
      pendingReceiptQty: Math.max(0, normalize(reconciliationPoGrn.ordered) - normalize(reconciliationPoGrn.received)),
      issuedQty: normalize(reconciliationIssueReturn.issued),
      returnedQty: normalize(reconciliationIssueReturn.returned),
      transferredInQty: normalize(reconciliationLedger.transfer_in),
      transferredOutQty: normalize(reconciliationLedger.transfer_out),
      adjustedInQty: normalize(reconciliationLedger.adjustment_in),
      adjustedOutQty: normalize(reconciliationLedger.adjustment_out),
      reservedQty: normalize(reservations[0]?.reserved || 0),
      availableQty: totalStock.available,
    };

    const eta = this.buildEtaRows(requests);
    const timeline = this.buildTimeline(companyId, itemId, filters, {
      requests,
      orders,
      grns,
      ledgerRows,
      balances: balanceRows,
      hasReceived: normalize(reconciliationPoGrn.received) > 0,
    });
    const audit = this.buildAudit(requests, ledgerRows, storeMap, { prs, orders, grns });

    const ledger: any = this.buildLedger(ledgerRows);
    ledger.reservations = normalize(reservations[0]?.reserved || 0);

    return {
      generatedAt: new Date().toISOString(),
      filters,
      item,
      storeConfigs,
      storeMap: storeMap.map((s: any) => ({ warehouseId: s.warehouse_id, storeCode: s.store_code, storeName: s.store_name })),
      currentStock: { rows: balanceRows, total: totalStock },
      minMax: {
        global: {
          minimumStockLevel: item.minimum_stock_level,
          maximumStockLevel: item.maximum_stock_level,
          reorderLevel: item.reorder_level,
          safetyStockLevel: item.safety_stock_level,
          leadTimeDays: item.lead_time_days,
        },
        perStore: storeConfigs.map((cfg: any) => ({
          storeItemId: cfg.store_item_id,
          storeId: cfg.store_id,
          storeCode: cfg.store_code,
          storeName: cfg.store_name,
          minimumStock: normalize(cfg.minimum_stock),
          reorderLevel: normalize(cfg.reorder_level),
          maximumStock: normalize(cfg.maximum_stock),
          preferredIssueMethod: cfg.preferred_issue_method,
          batchTracked: cfg.batch_tracked,
          serialTracked: cfg.serial_tracked,
        })),
      },
      reconciliation,
      eta,
      timeline,
      audit,
      requests,
      prs,
      orders,
      grns,
      issues,
      returns,
      transfers: ledgerRows.filter((r: any) => r.reference_type === 'STOCK_TRANSFER'),
      adjustments: ledgerRows.filter((r: any) => r.reference_type === 'STOCK_ADJUSTMENT'),
      reservations: reservations[0]?.list || [],
      ledger,
    };
  }

  // ==================== ITEM ====================

  private async fetchItem(companyId: string, itemId: string) {
    return this.dataSource.query(
      `SELECT i.id, i.item_code, i.sku, i.name, i.short_name, i.description, i.notes, i.item_type, i.status,
              i.barcode, i.brand, i.model, i.manufacturer_part_number, i.category_id,
              c.name AS category_name,
              i.base_uom_id, u.code AS base_uom_code,
              i.minimum_stock_level, i.maximum_stock_level, i.reorder_level, i.safety_stock_level,
              i.lead_time_days, i.track_inventory, i.batch_tracked, i.serial_tracked,
              i.is_purchasable, i.is_sellable, i.is_manufacturable, i.is_stock_item,
              i.cost_price, i.selling_price, i.created_at, i.updated_at
       FROM items i
       LEFT JOIN item_categories c ON c.id = i.category_id
       LEFT JOIN uoms u ON u.id = i.base_uom_id
       WHERE i.id = $1 AND i.company_id = $2`,
      [itemId, companyId],
    );
  }

  // ==================== STORE CONFIGURATION ====================

  private async fetchStoreConfigs(companyId: string, itemId: string) {
    return this.dataSource.query(
      `SELECT si.id AS store_item_id, si.store_id, si.bin, si.rack, si.shelf, si.location_detail,
              si.minimum_stock, si.reorder_level, si.maximum_stock, si.preferred_issue_method,
              si.batch_tracked, si.serial_tracked, si.status AS store_item_status,
              s.store_code, s.store_name, s.warehouse_id, s.store_type,
              s.division_id, s.section_id, s.department_id,
              d.name AS division_name, sec.name AS section_name, dep.name AS department_name
       FROM store_items si
       JOIN stores s ON s.id = si.store_id
       LEFT JOIN divisions d ON d.id = s.division_id
       LEFT JOIN sections sec ON sec.id = s.section_id
       LEFT JOIN departments dep ON dep.id = s.department_id
       WHERE si.item_id = $1 AND s.company_id = $2 AND s.status = 'ACTIVE'
       ORDER BY s.store_name`,
      [itemId, companyId],
    );
  }

  // ==================== STOCK ====================

  private async fetchBalances(companyId: string, itemId: string, warehouseId?: string) {
    const params: any[] = [itemId, companyId];
    const where = `ib.item_id = $1 AND ib.company_id = $2 AND ib.status = 'ACTIVE'${warehouseId ? ` AND ib.warehouse_id = $3` : ''}`;
    if (warehouseId) params.push(warehouseId);
    return this.dataSource.query(
      `SELECT ib.warehouse_id, w.warehouse_code, w.name AS warehouse_name,
              COALESCE(SUM(ib.on_hand), 0)::float AS on_hand,
              COALESCE(SUM(ib.reserved), 0)::float AS reserved,
              COALESCE(SUM(ib.available), 0)::float AS available
       FROM inventory_balances ib
       JOIN warehouses w ON w.id = ib.warehouse_id
       WHERE ${where}
       GROUP BY ib.warehouse_id, w.warehouse_code, w.name
       ORDER BY w.name`,
      params,
    );
  }

  private decorateBalances(balances: any[], actives: any[] | null) {
    return balances.map((row) => {
      const matching = actives?.filter((cfg: any) => cfg.warehouse_id === row.warehouse_id) || [];
      const minimumStock = matching.reduce((acc: number, cfg: any) => acc + normalize(cfg.minimum_stock), 0);
      const reorderLevel = matching.reduce((acc: number, cfg: any) => acc + normalize(cfg.reorder_level), 0);
      const maximumStock = matching.reduce((acc: number, cfg: any) => acc + normalize(cfg.maximum_stock), 0);
      return {
        warehouseId: row.warehouse_id,
        warehouseCode: row.warehouse_code,
        warehouseName: row.warehouse_name,
        onHand: normalize(row.on_hand),
        reserved: normalize(row.reserved),
        available: normalize(row.available),
        minimumStock,
        reorderLevel,
        maximumStock,
        shortage: Math.max(0, minimumStock - normalize(row.available)),
        status:
          normalize(row.available) <= 0 ? 'OUT_OF_STOCK' : normalize(row.available) < minimumStock ? 'LOW' : normalize(row.available) <= reorderLevel ? 'REORDER' : 'OK',
      };
    });
  }

  // ==================== RECONCILIATION ====================

  private async fetchReconciliationMr(companyId: string, itemId: string) {
    const rows = await this.dataSource.query(
      `SELECT
        COALESCE(SUM(mrl.requested_quantity), 0)::float AS requested,
        COALESCE(SUM(CASE WHEN m.approved_at IS NOT NULL THEN mrl.requested_quantity ELSE 0 END), 0)::float AS approved,
        COALESCE(SUM(CASE WHEN m.gm_approved_at IS NOT NULL THEN mrl.requested_quantity ELSE 0 END), 0)::float AS gm_approved,
        COALESCE(SUM(CASE WHEN m.supplier_confirmed_date IS NOT NULL THEN mrl.requested_quantity ELSE 0 END), 0)::float AS supplier_confirmed,
        COALESCE(SUM(mrl.pr_created_qty), 0)::float AS pr_created
       FROM material_request_lines mrl
       JOIN material_requests m ON m.id = mrl.request_id
       WHERE mrl.item_id = $1 AND m.company_id = $2 AND m.status <> 'CANCELLED' AND m.rejected_at IS NULL`,
      [itemId, companyId],
    );
    return rows[0] || {};
  }

  private async fetchReconciliationIssueReturn(companyId: string, itemId: string) {
    const rows = await this.dataSource.query(
      `SELECT
        (SELECT COALESCE(SUM(mil.quantity), 0)::float
           FROM material_issue_lines mil JOIN material_issues mi ON mi.id = mil.issue_id
          WHERE mil.item_id = $1 AND mi.company_id = $2 AND mi.status = 'POSTED') AS issued,
        (SELECT COALESCE(SUM(mrl.quantity), 0)::float
           FROM material_return_lines mrl JOIN material_returns mr ON mr.id = mrl.return_id
          WHERE mrl.item_id = $1 AND mr.company_id = $2 AND mr.status = 'POSTED') AS returned`,
      [itemId, companyId],
    );
    return rows[0] || {};
  }

  private async fetchReconciliationPoGrn(companyId: string, itemId: string) {
    const rows = await this.dataSource.query(
      `SELECT
        (SELECT COALESCE(SUM(pol.quantity), 0)::float
           FROM purchase_order_lines pol JOIN purchase_orders po ON po.id = pol.po_id
          WHERE pol.item_id = $1 AND po.company_id = $2 AND po.status <> 'CANCELLED') AS ordered,
        (SELECT COALESCE(SUM(grl.quantity_received), 0)::float
           FROM goods_receipt_lines grl JOIN goods_receipts gr ON gr.id = grl.receipt_id
          WHERE grl.item_id = $1 AND gr.company_id = $2 AND gr.status <> 'CANCELLED') AS received,
        (SELECT COALESCE(SUM(grl.quantity_accepted), 0)::float
           FROM goods_receipt_lines grl JOIN goods_receipts gr ON gr.id = grl.receipt_id
          WHERE grl.item_id = $1 AND gr.company_id = $2 AND gr.status <> 'CANCELLED') AS accepted,
        (SELECT COALESCE(SUM(grl.quantity_rejected), 0)::float
           FROM goods_receipt_lines grl JOIN goods_receipts gr ON gr.id = grl.receipt_id
          WHERE grl.item_id = $1 AND gr.company_id = $2 AND gr.status <> 'CANCELLED') AS rejected`,
      [itemId, companyId],
    );
    return rows[0] || {};
  }

  private async fetchReconciliationLedger(companyId: string, itemId: string) {
    const rows = await this.dataSource.query(
      `SELECT
        (SELECT COALESCE(SUM(CASE WHEN sl.direction = 'IN' THEN sl.quantity ELSE 0 END), 0)::float
           FROM stock_ledger sl WHERE sl.item_id = $1 AND sl.company_id = $2 AND sl.reference_type = 'STOCK_TRANSFER') AS transfer_in,
        (SELECT COALESCE(SUM(CASE WHEN sl.direction = 'OUT' THEN sl.quantity ELSE 0 END), 0)::float
           FROM stock_ledger sl WHERE sl.item_id = $1 AND sl.company_id = $2 AND sl.reference_type = 'STOCK_TRANSFER') AS transfer_out,
        (SELECT COALESCE(SUM(CASE WHEN sl.direction = 'IN' THEN sl.quantity ELSE 0 END), 0)::float
           FROM stock_ledger sl WHERE sl.item_id = $1 AND sl.company_id = $2 AND sl.reference_type = 'STOCK_ADJUSTMENT') AS adjustment_in,
        (SELECT COALESCE(SUM(CASE WHEN sl.direction = 'OUT' THEN sl.quantity ELSE 0 END), 0)::float
           FROM stock_ledger sl WHERE sl.item_id = $1 AND sl.company_id = $2 AND sl.reference_type = 'STOCK_ADJUSTMENT') AS adjustment_out,
        (SELECT COALESCE(SUM(sl.quantity), 0)::float
           FROM stock_ledger sl WHERE sl.item_id = $1 AND sl.company_id = $2 AND sl.reference_type = 'GOODS_RECEIPT' AND sl.direction = 'IN') AS grns_in,
        (SELECT COALESCE(SUM(CASE WHEN sl.direction = 'OUT' THEN sl.quantity ELSE 0 END), 0)::float
           FROM stock_ledger sl WHERE sl.item_id = $1 AND sl.company_id = $2 AND sl.transaction_type IN ('PRODUCTION_ISSUE','MANUFACTURING_ISSUE')) AS production_consumption`,
      [itemId, companyId],
    );
    return rows[0] || {};
  }

  private async fetchReservations(companyId: string, itemId: string) {
    const rows = await this.dataSource.query(
      `SELECT
        COALESCE(SUM(quantity), 0)::float AS reserved,
        (SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.created_at DESC), '[]'::jsonb)
           FROM (
             SELECT ir.id, ir.quantity::float AS quantity, ir.reservation_type, ir.reference_type, ir.reference_id,
                    ir.status, ir.expires_at, ir.reserved_by, ir.created_at,
w.warehouse_code, w.name AS warehouse_name, u.display_name AS user_name
             FROM inventory_reservations ir
             LEFT JOIN warehouses w ON w.id = ir.warehouse_id
             LEFT JOIN erp_users u ON u.id = ir.reserved_by
             WHERE ir.item_id = $1 AND ir.company_id = $2 AND ir.status = 'ACTIVE'
           ) t) AS list
       FROM inventory_reservations ir
       WHERE ir.item_id = $1 AND ir.company_id = $2 AND ir.status = 'ACTIVE'`,
      [itemId, companyId],
    );
    return rows;
  }

  // ==================== DOCUMENTS ====================

  private async fetchRequests(companyId: string, itemId: string, storeId?: string) {
    const params: any[] = [itemId, companyId];
    const sco = storeId ? ` AND m.store_id = $${params.length + 1}` : '';
    if (storeId) params.push(storeId);
    return this.dataSource.query(
      `SELECT m.id, m.request_number, m.request_date::text AS request_date, m.required_date::text AS required_date,
              m.status, m.priority, m.purpose, m.remarks, m.store_id, m.supplier_id,
              s.store_code, s.store_name, s.warehouse_id,
              d.name AS division_name, sec.name AS section_name, dep.name AS department_name,
              m.created_by, m.created_at, m.submitted_by, m.submitted_at,
              m.approved_by, m.approved_at, m.gm_approved_by, m.gm_approved_at,
              m.converted_by, m.converted_at, m.pr_id, m.pr_number,
              m.po_id, m.po_number, m.supplier_confirmed_date::text AS supplier_confirmed_date,
              m.expected_delivery_date::text AS expected_delivery_date,
              m.actual_delivery_date::text AS actual_delivery_date, m.eta_pending,
              po.order_date::text AS po_order_date,
              mrl.id AS line_id, mrl.line_number, mrl.requested_quantity, mrl.issued_quantity,
              mrl.pr_created_qty, mrl.pr_remaining_qty, mrl.pr_status, mrl.available_stock,
              u.code AS uom_code
       FROM material_request_lines mrl
       JOIN material_requests m ON m.id = mrl.request_id
       JOIN stores s ON s.id = m.store_id
       LEFT JOIN purchase_orders po ON po.id = m.po_id
       LEFT JOIN uoms u ON u.id = mrl.uom_id
       LEFT JOIN divisions d ON d.id = m.division_id
       LEFT JOIN sections sec ON sec.id = m.section_id
       LEFT JOIN departments dep ON dep.id = m.department_id
       WHERE mrl.item_id = $1 AND m.company_id = $2${sco}
       ORDER BY m.request_date DESC, m.request_number DESC`,
      params,
    );
  }

  private async fetchPrs(companyId: string, itemId: string) {
    return this.dataSource.query(
      `SELECT pr.id, pr.requisition_code, pr.title, pr.status, pr.request_type,
              pr.requested_delivery_date::text AS requested_delivery_date,
              pr.approved_by, pr.approved_at, pr.created_by, pr.created_at,
              SUP.name AS supplier_name,
              prl.id AS line_id, prl.line_number, prl.quantity, prl.converted_quantity,
              prl.estimated_unit_price, prl.required_date::text AS required_date, prl.status AS line_status,
              u.code AS uom_code
       FROM purchase_requisition_lines prl
       JOIN purchase_requisitions pr ON pr.id = prl.requisition_id
       LEFT JOIN suppliers SUP ON SUP.id = prl.supplier_id
       LEFT JOIN uoms u ON u.id = prl.uom_id
       WHERE prl.item_id = $1 AND pr.company_id = $2
       ORDER BY pr.created_at DESC`,
      [itemId, companyId],
    );
  }

  private async fetchOrders(companyId: string, itemId: string) {
    return this.dataSource.query(
      `SELECT po.id, po.po_code, po.order_date::text AS order_date,
              po.expected_delivery_date::text AS expected_delivery_date,
              po.status, po.currency_code, po.requisition_id, po.received_at,
              po.approved_by, po.approved_at, po.cancelled_at, po.created_by, po.created_at,
              SUP.name AS supplier_name,
              pol.id AS line_id, pol.line_number, pol.quantity, pol.received_quantity,
              pol.invoiced_quantity, pol.unit_price, pol.warehouse_id,
              u.code AS uom_code
       FROM purchase_order_lines pol
       JOIN purchase_orders po ON po.id = pol.po_id
       JOIN suppliers SUP ON SUP.id = po.supplier_id
       LEFT JOIN uoms u ON u.id = pol.uom_id
       WHERE pol.item_id = $1 AND po.company_id = $2
       ORDER BY po.order_date DESC NULLS LAST, po.created_at DESC`,
      [itemId, companyId],
    );
  }

  private async fetchGrns(companyId: string, itemId: string) {
    return this.dataSource.query(
      `SELECT gr.id, gr.receipt_code, gr.grn_number, gr.receipt_date, gr.status, gr.po_id,
              gr.warehouse_id, gr.delivery_note_number,
              gr.posted_by, gr.posted_at, gr.notes,
SUP.name AS supplier_name, w.name AS warehouse_name,
               grl.id AS line_id, pol.line_number, grl.quantity_ordered, grl.quantity_received,
               grl.quantity_accepted, grl.quantity_rejected, grl.unit_price, grl.condition_notes,
               u.code AS uom_code
        FROM goods_receipt_lines grl
        JOIN goods_receipts gr ON gr.id = grl.receipt_id
        LEFT JOIN purchase_order_lines pol ON pol.id = grl.po_line_id
        JOIN suppliers SUP ON SUP.id = gr.supplier_id
       LEFT JOIN warehouses w ON w.id = gr.warehouse_id
       LEFT JOIN uoms u ON u.id = grl.uom_id
       WHERE grl.item_id = $1 AND gr.company_id = $2
       ORDER BY gr.receipt_date DESC NULLS LAST, gr.created_at DESC`,
      [itemId, companyId],
    );
  }

  private async fetchIssues(companyId: string, itemId: string, storeId?: string) {
    const params: any[] = [itemId, companyId];
    if (storeId) params.push(storeId);
    return this.dataSource.query(
      `SELECT mi.id, mi.issue_number, mi.issue_date::text AS issue_date, mi.status, mi.purpose,
              mi.remarks, mi.posted_by, mi.posted_at, mi.cancelled_at, mi.request_id,
              s.store_code, s.store_name, dep.name AS issued_to_department_name,
              mil.id AS line_id, mil.line_number, mil.quantity, mil.serial_number, mil.bin, mil.rack,
              u.code AS uom_code
       FROM material_issue_lines mil
       JOIN material_issues mi ON mi.id = mil.issue_id
       JOIN stores s ON s.id = mi.store_id
       LEFT JOIN uoms u ON u.id = mil.uom_id
       LEFT JOIN departments dep ON dep.id = mi.issued_to_department_id
       WHERE mil.item_id = $1 AND mi.company_id = $2${storeId ? ' AND mi.store_id = $3' : ''}
       ORDER BY mi.issue_date DESC, mi.issue_number DESC`,
      params,
    );
  }

  private async fetchReturns(companyId: string, itemId: string, storeId?: string) {
    const params: any[] = [itemId, companyId];
    if (storeId) params.push(storeId);
    return this.dataSource.query(
      `SELECT mr.id, mr.return_number, mr.return_date::text AS return_date, mr.status, mr.reason,
              mr.remarks, mr.posted_by, mr.posted_at, mr.cancelled_at, mr.issue_id, mr.condition_code,
              s.store_code, s.store_name, dep.name AS from_department_name,
              mrl.id AS line_id, mrl.line_number, mrl.quantity, mrl.serial_number, mrl.condition_code AS line_condition_code,
              u.code AS uom_code
       FROM material_return_lines mrl
       JOIN material_returns mr ON mr.id = mrl.return_id
       JOIN stores s ON s.id = mr.store_id
       LEFT JOIN uoms u ON u.id = mrl.uom_id
       LEFT JOIN departments dep ON dep.id = mr.from_department_id
       WHERE mrl.item_id = $1 AND mr.company_id = $2${storeId ? ' AND mr.store_id = $3' : ''}
       ORDER BY mr.return_date DESC, mr.return_number DESC`,
      params,
    );
  }

  // ==================== LEDGER ====================

  private async fetchLedger(companyId: string, itemId: string, warehouseId?: string) {
    const params: any[] = [itemId, companyId];
    const where = `sl.item_id = $1 AND sl.company_id = $2${warehouseId ? ` AND sl.warehouse_id = $3` : ''}`;
    if (warehouseId) params.push(warehouseId);
    return this.dataSource.query(
      `SELECT sl.id, sl.transaction_type, sl.transaction_date, sl.quantity, sl.direction,
              sl.reference_type, sl.reference_id, sl.reference_number, sl.notes,
              sl.created_by, sl.warehouse_id,
              w.warehouse_code, w.name AS warehouse_name, u.display_name AS user_name
       FROM stock_ledger sl
       LEFT JOIN warehouses w ON w.id = sl.warehouse_id
       LEFT JOIN erp_users u ON u.id = sl.created_by
       WHERE ${where}
       ORDER BY sl.transaction_date ASC, sl.id ASC`,
      params,
    );
  }

  private buildLedger(ledgerRows: any[]) {
    let runningBalance = 0;
    const rows = ledgerRows.map((row, index) => {
      const delta = row.direction === 'IN' ? normalize(row.quantity) : -normalize(row.quantity);
      runningBalance += delta;
      return {
        ...row,
        key: row.id ?? `${row.transaction_type}-${index}`,
        quantity: normalize(row.quantity),
        balance: runningBalance,
        isOpening: row.transaction_type?.toUpperCase() === 'OPENING',
      };
    });

    const opening = normalize(rows[0]?.balance || 0) - (normalize(rows[0]?.quantity || 0) * (rows[0]?.direction === 'IN' ? 1 : -1));

    const sumType = (type: string, dir?: string) =>
      rows
        .filter((r: any) => r.transaction_type?.toUpperCase() === type && (!dir || String(r.direction).toUpperCase() === dir))
        .reduce((acc: number, r: any) => acc + r.quantity, 0);

    return {
      opening,
      closing: rows.length ? rows[rows.length - 1].balance : 0,
      movement: rows.reduce((acc, r) => acc + (r.direction === 'IN' ? r.quantity : -r.quantity), 0),
      totals: {
        opening: sumType('OPENING'),
        receiptsIn: sumType('GOODS_RECEIPT', 'IN'),
        grnsIn: sumType('GOODS_RECEIPT', 'IN'),
        materialReceiptsIn: sumType('MATERIAL_RECEIPT', 'IN'),
        productionConsumption: sumType('PRODUCTION_ISSUE', 'OUT') + sumType('MANUFACTURING_ISSUE', 'OUT'),
        issuesOut: sumType('MATERIAL_ISSUE', 'OUT'),
        returnsIn: sumType('MATERIAL_RETURN', 'IN'),
        transfersIn: sumType('TRANSFER_IN', 'IN') || sumType('STOCK_TRANSFER', 'IN'),
        transfersOut: sumType('TRANSFER_OUT', 'OUT') || sumType('STOCK_TRANSFER', 'OUT'),
        adjustments: rows.filter((r) => r.transaction_type?.toUpperCase() === 'ADJUSTMENT' || r.reference_type?.toUpperCase() === 'STOCK_ADJUSTMENT').reduce((acc, r) => acc + r.quantity, 0),
      },
      rows,
    };
  }

  // ==================== ETA ====================

  private buildEtaRows(requests: any[]) {
    const now = new Date();
    const byRequest = new Map<string, any>();
    for (const row of requests) {
      if (!byRequest.has(row.id)) {
        byRequest.set(row.id, { ...row });
      }
    }
    const etaRows: any[] = [];
    for (const r of byRequest.values()) {
      const requestDate = r.request_date ? new Date(`${r.request_date}T00:00:00`) : null;
      const convertedAt = r.converted_at ? new Date(r.converted_at) : null;
      const approvedAt = r.approved_at ? new Date(r.approved_at) : null;
      const submittedAt = r.submitted_at ? new Date(r.submitted_at) : null;
      const gmApprovedAt = r.gm_approved_at ? new Date(r.gm_approved_at) : null;
      const poOrderDate = r.po_order_date ? new Date(`${r.po_order_date}T00:00:00`) : null;
      const supplierConfirmedDate = r.supplier_confirmed_date ? new Date(`${r.supplier_confirmed_date}T00:00:00`) : null;
      const expectedDeliveryDate = r.expected_delivery_date ? new Date(`${r.expected_delivery_date}T00:00:00`) : null;
      const actualDeliveryDate = r.actual_delivery_date ? new Date(`${r.actual_delivery_date}T00:00:00`) : null;

      const diff = (a?: Date | null, b?: Date | null) =>
        a && b ? Math.round((b.getTime() - a.getTime()) / DAY_MS) : null;

      let deliveryStatus = 'PENDING';
      let overdueByDays: number | null = null;
      let expectedInDays: number | null = null;
      if (actualDeliveryDate) {
        deliveryStatus = 'DELIVERED';
      } else if (expectedDeliveryDate) {
        expectedDeliveryDate.setHours(23, 59, 59, 999);
        if (now.getTime() > expectedDeliveryDate.getTime()) {
          deliveryStatus = 'OVERDUE';
          overdueByDays = Math.round((now.getTime() - expectedDeliveryDate.getTime()) / DAY_MS);
        } else {
          deliveryStatus = 'UPCOMING';
          expectedInDays = Math.max(0, Math.ceil((expectedDeliveryDate.getTime() - now.getTime()) / DAY_MS));
        }
      }

      const totalEnd = actualDeliveryDate || expectedDeliveryDate || now;
      const totalStart = submittedAt || requestDate;

      etaRows.push({
        requestId: r.id,
        requestNumber: r.request_number,
        requestDate: r.request_date,
        storeName: r.store_name,
        storeCode: r.store_code,
        status: r.status,
        priority: r.priority,
        prNumber: r.pr_number,
        prId: r.pr_id,
        poNumber: r.po_number,
        poId: r.po_id,
        dates: {
          request: r.request_date,
          submitted: r.submitted_at ? r.submitted_at.toISOString?.() || r.submitted_at : null,
          submittedRaw: r.submitted_at,
          approval: r.approved_at,
          gmApproval: r.gm_approved_at,
          conversion: r.converted_at && r.converted_at.toISOString ? r.converted_at.toISOString() : r.converted_at,
          order: r.po_order_date,
          supplierConfirmed: r.supplier_confirmed_date,
          expected: r.expected_delivery_date,
          actual: r.actual_delivery_date,
        },
        leadTimes: {
          requestToPr: diff(requestDate, convertedAt),
          requestToManagerApproval: diff(submittedAt, approvedAt),
          managerToGmApproval: diff(approvedAt, gmApprovedAt),
          gmApprovalToConversion: diff(gmApprovedAt, convertedAt),
          conversionToOrder: diff(convertedAt, poOrderDate),
          requestToOrder: diff(requestDate, poOrderDate),
          orderToSupplierConfirmation: diff(poOrderDate, supplierConfirmedDate),
          supplierConfirmationToDelivery: diff(supplierConfirmedDate, expectedDeliveryDate),
          totalLeadTime: diff(totalStart, totalEnd),
        },
        deliveryStatus,
        overdueByDays,
        expectedInDays,
        etaPending: r.eta_pending,
        actualDeliveryDate: r.actual_delivery_date,
        expectedDeliveryDate: r.expected_delivery_date,
      });
    }
    return etaRows.sort((a, b) => String(b.requestDate || '').localeCompare(String(a.requestDate || '')));
  }

  // ==================== TIMELINE ====================

  private buildTimeline(
    companyId: string,
    itemId: string,
    filters: MaterialLifecycleFilters,
    ctx: { requests: any[]; orders: any[]; grns: any[]; ledgerRows: any[]; balances: any[]; hasReceived: boolean },
  ) {
    const reqs = ctx.requests;
    const anyReached = (fn: (r: any) => boolean) => reqs.some(fn);
    const firstDate = (fn: (r: any) => string | Date | null) => {
      const found = reqs.filter(fn).sort((a, b) => new Date(fn(a) || 0).getTime() - new Date(fn(b) || 0).getTime());
      return found[0] ? fn(found[0]) : null;
    };
    const anyOrder = ctx.orders.some((o) => o.status && o.status.toUpperCase() !== 'CANCELLED');
    const anyGrn = ctx.grns.length > 0;
    const hasLedger = ctx.ledgerRows.length > 0;
    const hasStockBalance = ctx.balances.some((b) => b.onHand > 0 || b.available > 0);
    const pendingSubmission = reqs.some((r) => r.status === 'DRAFT');
    const managerPending = reqs.some((r) => r.status === 'SUBMITTED');
    const gmPending = reqs.some((r) => r.status === 'APPROVED');

    const stages = [
      { key: 'materialRequestCreated', label: 'Material Request Created', reached: reqs.length > 0, date: firstDate((r) => r.created_at), note: `${reqs.length} request(s)` },
      { key: 'requestSubmitted', label: 'Request Submitted', reached: anyReached((r) => !!r.submitted_at), date: firstDate((r) => r.submitted_at), note: pendingSubmission ? 'some still in draft' : '' },
      { key: 'prCreated', label: 'PR Created', reached: anyReached((r) => !!r.pr_id), date: firstDate((r) => r.converted_at), note: anyReached((r) => r.status === 'PARTIALLY_CONVERTED') ? 'partially converted' : '' },
      { key: 'managerApprovalPending', label: 'Manager Approval Pending', reached: managerPending, date: null, note: managerPending ? 'waiting on manager' : '' },
      { key: 'managerApproved', label: 'Manager Approved', reached: anyReached((r) => !!r.approved_at), date: firstDate((r) => r.approved_at), note: '' },
      { key: 'gmApprovalPending', label: 'GM Approval Pending', reached: gmPending, date: null, note: gmPending ? 'waiting on GM' : '' },
      { key: 'gmApproved', label: 'GM Approved', reached: anyReached((r) => !!r.gm_approved_at), date: firstDate((r) => r.gm_approved_at), note: '' },
      { key: 'supplierAssigned', label: 'Supplier Assigned', reached: anyReached((r) => !!r.supplier_id), date: null, note: '' },
      { key: 'orderCreated', label: 'Supplier Order Created', reached: anyOrder, date: null, note: `${ctx.orders.length} order(s)` },
      { key: 'supplierConfirmed', label: 'Supplier Confirmed', reached: anyReached((r) => !!r.supplier_confirmed_date), date: firstDate((r) => r.supplier_confirmed_date), note: '' },
      { key: 'etaReceived', label: 'ETA Received', reached: anyReached((r) => !!r.expected_delivery_date), date: firstDate((r) => r.expected_delivery_date), note: '' },
      { key: 'grnCreated', label: 'GRN Created', reached: anyGrn, date: null, note: `${ctx.grns.length} GRN(s)` },
      { key: 'materialReceived', label: 'Material Received', reached: ctx.hasReceived || anyReached((r) => !!r.actual_delivery_date), date: firstDate((r) => r.actual_delivery_date), note: '' },
      { key: 'storeStockUpdated', label: 'Store Stock Updated', reached: hasLedger || hasStockBalance, date: null, note: hasLedger ? `${ctx.ledgerRows.length} ledger movement(s)` : '' },
    ];

    return {
      itemId,
      companyId,
      filters,
      stages,
      counts: {
        requests: reqs.length,
        cancelled: reqs.filter((r) => r.status === 'CANCELLED').length,
        rejected: reqs.filter((r) => r.status === 'REJECTED').length,
        fullyConverted: reqs.filter((r) => r.status === 'FULLY_CONVERTED').length,
      },
    };
  }

  // ==================== AUDIT ====================

  private async fetchStoreMap(companyId: string, itemId: string) {
    return this.dataSource.query(
      `SELECT s.warehouse_id, s.store_code, s.store_name
       FROM store_items si
       JOIN stores s ON s.id = si.store_id
       WHERE si.item_id = $1 AND s.company_id = $2 AND s.warehouse_id IS NOT NULL
       GROUP BY s.warehouse_id, s.store_code, s.store_name`,
      [itemId, companyId],
    );
  }

  private async buildAudit(
    requests: any[],
    ledgerRows: any[],
    storeMap: any[],
    ctx: { prs?: any[]; orders?: any[]; grns?: any[] } = {},
  ) {
    const prs = ctx.prs || [];
    const orders = ctx.orders || [];
    const grns = ctx.grns || [];

    const userIds = new Set<string>();
    const collect = (id: any) => {
      if (id) userIds.add(String(id));
    };
    for (const r of requests) {
      collect(r.created_by);
      collect(r.submitted_by);
      collect(r.approved_by);
      collect(r.gm_approved_by);
      collect(r.converted_by);
    }
    for (const l of ledgerRows) collect(l.created_by);
    for (const p of prs) {
      collect(p.created_by);
      collect(p.approved_by);
    }
    for (const o of orders) {
      collect(o.created_by);
      collect(o.approved_by);
    }
    for (const g of grns) collect(g.posted_by);

    let userMap: Record<string, string> = {};
    if (userIds.size) {
      const ids = Array.from(userIds);
      const users = await this.dataSource.query(
        `SELECT id, display_name FROM erp_users WHERE id = ANY($1::uuid[])`,
        [ids],
      );
      userMap = Object.fromEntries(users.map((u: any) => [String(u.id), u.display_name]));
    }

    const storeByWarehouse = new Map<string, string>();
    for (const s of storeMap) {
      if (s.warehouse_id) storeByWarehouse.set(String(s.warehouse_id), s.store_name);
    }

    const events: any[] = [];

    const pushMrEvent = (r: any, action: string, date: any, userKey: string, quantity: number, remarks: string | null, status: string) => {
      if (!date) return;
      events.push({
        timestamp: date,
        action,
        documentType: 'MR',
        document: r.request_number,
        referenceId: r.id,
        user: userKey ? userMap[String(userKey)] || null : null,
        department: [r.division_name, r.section_name, r.department_name].filter(Boolean).join(' · '),
        store: r.store_name,
        quantity: normalize(quantity),
        status,
        remarks,
      });
    };

    const pushDocEvent = (args: {
      date: any;
      action: string;
      docType: string;
      document: string | null;
      referenceId: any;
      userKey: any;
      store?: string | null;
      department?: string | null;
      quantity: number;
      status: string | null;
      remarks: string | null;
    }) => {
      if (!args.date) return;
      events.push({
        timestamp: args.date,
        action: args.action,
        documentType: args.docType,
        document: args.document,
        referenceId: args.referenceId,
        user: args.userKey ? userMap[String(args.userKey)] || null : null,
        department: args.department ?? null,
        store: args.store ?? null,
        quantity: normalize(args.quantity),
        status: args.status,
        remarks: args.remarks,
      });
    };

    for (const r of requests) {
      const qty = normalize(r.requested_quantity);
      pushMrEvent(r, 'Material Request Created', r.created_at, r.created_by, qty, r.purpose, r.status);
      pushMrEvent(r, 'Request Submitted', r.submitted_at, r.submitted_by, qty, 'Request submitted for approval', r.status);
      pushMrEvent(r, 'Manager Approved', r.approved_at, r.approved_by, qty, 'Approved by manager', r.status);
      pushMrEvent(r, 'GM Approved', r.gm_approved_at, r.gm_approved_by, qty, 'Approved by GM', r.status);
      pushMrEvent(r, 'PR Created', r.converted_at, r.converted_by, qty, `Converted to PR ${r.pr_number || ''}`.trim(), r.status);
    }

    const seenPr = new Set<string>();
    for (const p of prs) {
      if (seenPr.has(String(p.id))) continue;
      seenPr.add(String(p.id));
      const prQty = normalize(p.converted_quantity ?? p.quantity);
      pushDocEvent({
        date: p.created_at,
        action: 'PR Created',
        docType: 'PR',
        document: p.requisition_code,
        referenceId: p.id,
        userKey: p.created_by,
        quantity: prQty,
        status: p.status,
        remarks: p.title || null,
      });
      pushDocEvent({
        date: p.approved_at,
        action: 'PR Approved',
        docType: 'PR',
        document: p.requisition_code,
        referenceId: p.id,
        userKey: p.approved_by,
        quantity: prQty,
        status: p.status,
        remarks: 'Purchase requisition approved',
      });
    }

    const seenPo = new Set<string>();
    for (const o of orders) {
      if (seenPo.has(String(o.id))) continue;
      seenPo.add(String(o.id));
      const poQty = normalize(o.quantity);
      const supplierLabel = o.supplier_name ? `Supplier: ${o.supplier_name}` : null;
      pushDocEvent({
        date: o.created_at,
        action: 'Supplier Order (PO) Created',
        docType: 'PO',
        document: o.po_code,
        referenceId: o.id,
        userKey: o.created_by,
        quantity: poQty,
        status: o.status,
        remarks: supplierLabel,
      });
      pushDocEvent({
        date: o.approved_at,
        action: 'Supplier Order (PO) Approved',
        docType: 'PO',
        document: o.po_code,
        referenceId: o.id,
        userKey: o.approved_by,
        quantity: poQty,
        status: o.status,
        remarks: supplierLabel,
      });
    }

    const seenGrn = new Set<string>();
    for (const g of grns) {
      if (seenGrn.has(String(g.id))) continue;
      seenGrn.add(String(g.id));
      const grnQty = normalize(g.quantity_received);
      const grnStore = storeByWarehouse.get(String(g.warehouse_id)) || null;
      pushDocEvent({
        date: g.receipt_date,
        action: 'GRN Received',
        docType: 'GRN',
        document: g.receipt_code,
        referenceId: g.id,
        userKey: g.posted_by,
        store: grnStore,
        quantity: grnQty,
        status: g.status,
        remarks: g.delivery_note_number ? `Delivery note ${g.delivery_note_number}` : null,
      });
      pushDocEvent({
        date: g.posted_at,
        action: 'GRN Posted',
        docType: 'GRN',
        document: g.receipt_code,
        referenceId: g.id,
        userKey: g.posted_by,
        store: grnStore,
        quantity: grnQty,
        status: g.status,
        remarks: 'Goods receipt posted to store stock',
      });
    }

    for (const l of ledgerRows) {
      events.push({
        timestamp: l.transaction_date,
        action: l.reference_type ? `${String(l.reference_type).replace(/_/g, ' ')} (${l.transaction_type})` : l.transaction_type,
        documentType: l.reference_type || 'LEDGER',
        document: l.reference_number,
        referenceId: l.reference_id,
        user: l.user_name || null,
        department: null,
        store: storeByWarehouse.get(String(l.warehouse_id)) || null,
        quantity: normalize(l.quantity),
        status: `${l.direction === 'IN' ? 'IN' : 'OUT'} ${String(l.transaction_type).replace(/_/g, ' ')}`,
        remarks: l.notes || null,
      });
    }

    return events.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  }
}