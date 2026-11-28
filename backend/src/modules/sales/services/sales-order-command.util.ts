export interface OrderCommandRawOrderRow {
  order_id: string;
  order_number: string;
  customer_id: string;
  customer_po: string | null;
  division_id: string | null;
  section_id: string | null;
  order_date: string | Date | null;
  delivery_date: string | Date | null;
  currency: string | null;
  order_subtotal: number;
  order_discount: number;
  order_tax: number;
  order_freight: number;
  order_total: number;
  order_status: string;
  order_notes: string | null;
  order_created_at: string | Date | null;
  customer_code: string | null;
  customer_name: string | null;
  contact_person: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  customer_mobile: string | null;
  credit_days: number;
  payment_terms: string | null;
  division_code: string | null;
  division_name: string | null;
  order_item_id: string | null;
  line_number: number | null;
  item_id: string | null;
  item_code: string | null;
  item_name: string | null;
  packaging_size: number | null;
  packaging_unit: string | null;
  base_uom_code: string | null;
  uom_code: string | null;
  ordered_qty: number;
  soi_shipped_qty: number;
  unit_price: number;
  discount_percent: number;
  line_tax_amount: number;
  line_total: number;
}

export interface OrderCommandRawDeliveryRow {
  delivery_id: string;
  delivery_number: string;
  gate_pass_number: string | null;
  sales_order_id: string | null;
  header_soc_number: string | null;
  delivery_date: string | Date | null;
  carrier: string | null;
  tracking_number: string | null;
  status: string;
  delivery_total_amount: number;
  item_id: string | null;
  line_description: string | null;
  line_qty: number;
}

export interface OrderCommandRawPackingRow {
  id: string;
  entry_number: string | null;
  entry_date: string | Date | null;
  item_id: string | null;
  actual_quantity: number;
  remarks: string | null;
  effective_packing_mode: string | null;
}

export interface OrderCommandRawPackingLogRow {
  production_entry_id: string | null;
  source_entry_id?: string | null;
  entry_number?: string | null;
  soc_no: string | null;
  item_id: string | null;
  activity_type: string | null;
  status?: string | null;
  activity_date: string | null;
  original_packed_date: string | null;
  gross: number;
  pcs: number;
}

export interface OrderCommandRawOpeningStockRow {
  id: string;
  item_id: string | null;
  transaction_date: string | Date | null;
  quantity: number;
  reference_number: string | null;
  notes: string | null;
  base_uom_code: string | null;
}

export interface OrderCommandItem {
  id: string;
  itemId: string | null;
  itemCode: string;
  itemName: string;
  uomCode: string;
  packagingSize?: number | null;
  packagingUnit?: string | null;
  ordered: number;
  dispatched: number;
  pending: number;
  readyPacked: number;
  pendingNippleQty: number;
  readySinceDate: string | null;
  readyAgeDays: number | null;
  remainingToPack: number;
  unitPrice: number;
  discountPercent: number;
  taxPercent: number;
  taxAmount: number;
  lineTotal: number;
}

export interface OrderCommandLinkedDelivery {
  deliveryId: string;
  deliveryNumber: string;
  gatePassNumber: string | null;
  deliveryDate: string | null;
  status: string;
  carrier: string | null;
  trackingNumber: string | null;
  dispatchedQty: number;
  totalAmount: number;
}

export interface OrderCommandOrder {
  id: string;
  orderNumber: string;
  customerId: string;
  customerCode: string;
  customerName: string;
  customerPo: string | null;
  divisionId: string | null;
  divisionCode: string | null;
  divisionName: string | null;
  orderDate: string | null;
  orderAgeDays: number | null;
  deliveryDate: string | null;
  currency: string;
  status: string;
  category: 'PENDING' | 'COMPLETED' | 'CANCELLED';
  paymentTerms: string;
  orderedQty: number;
  dispatchedQty: number;
  pendingQty: number;
  readyPackedQty: number;
  pendingNippleQty: number;
  readySinceDate: string | null;
  readyAgeDays: number | null;
  remainingToPackQty: number;
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
  uomCode: string;
  items: OrderCommandItem[];
  linkedDeliveries: OrderCommandLinkedDelivery[];
}

export interface OrderCommandCustomerSummary {
  customerId: string;
  customerCode: string;
  customerName: string;
  uomCode?: string;
  contactPerson: string | null;
  email: string | null;
  phone: string | null;
  mobile: string | null;
  paymentTerms: string;
  creditDays: number;
  openOrderCount: number;
  completedOrderCount: number;
  cancelledOrderCount: number;
  totalOrderedQty: number;
  totalDispatchedQty: number;
  totalPendingQty: number;
  totalReadyPackedQty: number;
  oldestReadyAgeDays: number | null;
  totalRemainingToPackQty: number;
  totalOpenValue: number;
  totalDispatchedValue: number;
  totalOrderValue: number;
}

export interface OrderCommandOverviewResponse {
  kpis: {
    totalOrdered: number;
    dispatched: number;
    pendingOrderBalance: number;
    readyPacked: number;
    oldestReadyAgeDays: number | null;
    readyOrderCount: number;
    remainingToPack: number;
    activeOrderCount: number;
    primaryUom: string;
  };
  sections: {
    pending: { count: number; totalQty: number; pendingQty: number; readyQty: number; totalAmount: number };
    completed: { count: number; totalQty: number; dispatchedQty: number; totalAmount: number };
    cancelled: { count: number; totalQty: number; totalAmount: number };
  };
  orders: OrderCommandOrder[];
  customers: OrderCommandCustomerSummary[];
  divisions: Array<{ id: string; divisionCode: string; name: string }>;
  generatedAt: string;
}

const round2 = (n: number): number => Math.round((Number(n) || 0) * 100) / 100;

function toIsoDate(val: string | Date | null | undefined): string | null {
  if (!val) return null;
  if (val instanceof Date) {
    return Number.isNaN(val.getTime()) ? null : val.toISOString().slice(0, 10);
  }
  const s = String(val).trim();
  const match = s.match(/^(\d{4}-\d{2}-\d{2})/);
  if (match) return match[1];
  const dt = new Date(s);
  return Number.isNaN(dt.getTime()) ? null : dt.toISOString().slice(0, 10);
}

export function convertBaseToOrderUom(
  actualBaseQty: number,
  baseUomCode?: string | null,
  targetUomCode?: string | null,
  packagingSize?: number | null,
): number {
  const qty = Number(actualBaseQty) || 0;
  if (qty <= 0) return 0;
  const base = String(baseUomCode || 'PCS').toUpperCase().trim();
  const target = String(targetUomCode || base).toUpperCase().trim();
  if (base === target) return qty;
  if (base === 'PCS' && target === 'GRS') return qty / 144;
  if (base === 'PCS' && target === 'CTN') {
    const grsPerCtn = Number(packagingSize) > 0 ? Number(packagingSize) : 10;
    const rawPcsPerCtn = grsPerCtn * 144;
    const exactPcsPerCtn =
      Math.abs(rawPcsPerCtn - Math.round(rawPcsPerCtn)) <= 0.15
        ? Math.round(rawPcsPerCtn)
        : rawPcsPerCtn;
    return qty / exactPcsPerCtn;
  }
  if (base === 'GRS' && target === 'PCS') return qty * 144;
  if (base === 'GRS' && target === 'CTN') {
    const grsPerCtn = Number(packagingSize) > 0 ? Number(packagingSize) : 10;
    return qty / grsPerCtn;
  }
  return qty;
}

export function extractSocTokens(text?: string | null): string[] {
  if (!text) return [];
  const raw = String(text);
  // Prefer explicit `[SHIFTED ... to ... (SOC-...)]` or `SOC: SOC-...` allocation tag before generic text
  const primaryMatches: string[] = [];
  const explicitShiftMatch = raw.match(/SHIFTED FROM SAFETY STOCK[^|]*\((SOC-[A-Za-z0-9-]+|SO-[A-Za-z0-9-]+)\)/i);
  if (explicitShiftMatch?.[1]) primaryMatches.push(explicitShiftMatch[1].trim().toUpperCase());
  const explicitSocField = raw.match(/\bSOC:\s*(SOC-[A-Za-z0-9-]+|SO-[A-Za-z0-9-]+)/i);
  if (explicitSocField?.[1]) primaryMatches.push(explicitSocField[1].trim().toUpperCase());
  const bracketSoc = raw.match(/\[SOC:\s*(SOC-[A-Za-z0-9-]+|SO-[A-Za-z0-9-]+)\]/i);
  if (bracketSoc?.[1]) primaryMatches.push(bracketSoc[1].trim().toUpperCase());

  const allMatches = raw.match(/SOC-[A-Za-z0-9-]+/gi) || [];
  return Array.from(new Set([...primaryMatches, ...allMatches.map((m) => m.trim().toUpperCase())]));
}

function extractShiftedDateFromText(text?: string | null): string | null {
  if (!text) return null;
  const m = String(text).match(/SHIFTED FROM SAFETY STOCK\s+(?:on\s+)?(\d{4}-\d{2}-\d{2})/i);
  return m?.[1] || null;
}

function isUncompletedWithoutNippleText(text?: string | null): boolean {
  if (!text) return false;
  const s = String(text);
  const hasWithoutNipple = /WITHOUT[_\s-]*NIPPLE/i.test(s) || /Pending Nipple:/i.test(s);
  if (!hasWithoutNipple) return false;
  const isCompleted =
    /Status:\s*COMPLETED/i.test(s) ||
    /Nipple Stock Deducted:/i.test(s) ||
    /Nipple Added:/i.test(s) ||
    /SpokePackingMode:\s*(FULL_SET|COMPLETE_SET)/i.test(s);
  return !isCompleted;
}

function resolveCanonicalSocKey(
  tokens: string[],
  itemId: string,
  itemMetaBySocAndItem: Map<string, any>,
  orderIdBySocUpper: Map<string, string>,
): string | null {
  if (tokens.length === 0) return null;
  const candidates = new Set(tokens);
  // Support 4-digit vs 5-digit legacy SOC notation (e.g., SOC-2026-5810 <-> SOC-2026-05810)
  for (const t of tokens) {
    const m = t.match(/^(SOC-\d{4}-)0*(\d+)$/i);
    if (m) {
      candidates.add(`${m[1]}${m[2].padStart(5, '0')}`.toUpperCase());
      candidates.add(`${m[1]}${m[2]}`.toUpperCase());
    }
  }
  for (const c of candidates) {
    if (itemMetaBySocAndItem.has(`${c}__${itemId}`)) return c;
  }
  for (const c of candidates) {
    if (orderIdBySocUpper.has(c)) return c;
  }
  return tokens[0];
}

export function buildOrderCommandOverview(params: {
  orderRows: OrderCommandRawOrderRow[];
  deliveryRows: OrderCommandRawDeliveryRow[];
  packingRows: OrderCommandRawPackingRow[];
  packingLogRows: OrderCommandRawPackingLogRow[];
  openingStockRows?: OrderCommandRawOpeningStockRow[];
  divisions: Array<{ id: string; divisionCode: string; name: string }>;
  todayIso?: string;
}): OrderCommandOverviewResponse {
  const todayIso = params.todayIso || new Date().toISOString().slice(0, 10);
  const todayMs = Date.parse(`${todayIso}T00:00:00Z`);

  // 1. Group Order Rows by Order ID
  const ordersMap = new Map<
    string,
    {
      header: OrderCommandRawOrderRow;
      items: OrderCommandRawOrderRow[];
    }
  >();
  const orderIdBySocUpper = new Map<string, string>();
  const itemMetaBySocAndItem = new Map<
    string,
    { baseUomCode: string; uomCode: string; packagingSize: number | null }
  >();

  for (const row of params.orderRows) {
    let bucket = ordersMap.get(row.order_id);
    if (!bucket) {
      bucket = { header: row, items: [] };
      ordersMap.set(row.order_id, bucket);
      const socUpper = String(row.order_number || '').trim().toUpperCase();
      if (socUpper) orderIdBySocUpper.set(socUpper, row.order_id);
    }
    if (row.order_item_id) {
      bucket.items.push(row);
      const socUpper = String(row.order_number || '').trim().toUpperCase();
      if (socUpper && row.item_id) {
        itemMetaBySocAndItem.set(`${socUpper}__${row.item_id}`, {
          baseUomCode: row.base_uom_code || 'PCS',
          uomCode: row.uom_code || 'GRS',
          packagingSize: row.packaging_size,
        });
      }
    }
  }

  // 2. Index Delivery Lines & Header Deliveries per SOC and per (SOC, Item)
  const shippedStatuses = new Set(['CONFIRMED', 'DELIVERED', 'SHIPPED']);
  const dnDispatchedBySocItem = new Map<string, number>();
  const dnValueByOrder = new Map<string, number>();
  const deliveriesByOrder = new Map<string, Map<string, OrderCommandLinkedDelivery>>();

  for (const d of params.deliveryRows) {
    const descSocs = extractSocTokens(d.line_description);
    const headerSoc = d.header_soc_number ? String(d.header_soc_number).trim().toUpperCase() : null;
    const effectiveLineSoc = descSocs[0] || headerSoc;
    const lineOrderId =
      (effectiveLineSoc ? orderIdBySocUpper.get(effectiveLineSoc) : undefined) || d.sales_order_id;

    if (effectiveLineSoc && d.item_id && shippedStatuses.has(String(d.status || '').toUpperCase())) {
      const k = `${effectiveLineSoc}__${d.item_id}`;
      dnDispatchedBySocItem.set(k, (dnDispatchedBySocItem.get(k) || 0) + (Number(d.line_qty) || 0));
    }

    if (lineOrderId) {
      let delMap = deliveriesByOrder.get(lineOrderId);
      if (!delMap) {
        delMap = new Map<string, OrderCommandLinkedDelivery>();
        deliveriesByOrder.set(lineOrderId, delMap);
      }
      let linked = delMap.get(d.delivery_id);
      if (!linked) {
        linked = {
          deliveryId: d.delivery_id,
          deliveryNumber: d.delivery_number,
          gatePassNumber: d.gate_pass_number || null,
          deliveryDate: toIsoDate(d.delivery_date),
          status: d.status,
          carrier: d.carrier || null,
          trackingNumber: d.tracking_number || null,
          dispatchedQty: 0,
          totalAmount: round2(Number(d.delivery_total_amount) || 0),
        };
        delMap.set(d.delivery_id, linked);
        if (shippedStatuses.has(String(d.status || '').toUpperCase())) {
          dnValueByOrder.set(
            lineOrderId,
            (dnValueByOrder.get(lineOrderId) || 0) + (Number(d.delivery_total_amount) || 0),
          );
        }
      }
      if (d.line_qty) {
        linked.dispatchedQty = round2(linked.dispatchedQty + Number(d.line_qty));
      }
    }
  }

  // 3. Index latest packing activity date (SHIFTED_TO_SOC / NIPPLE_COMPLETED) by production_entry_id
  const activityDateByEntryId = new Map<string, string>();
  const activityDateByEntryNumber = new Map<string, string>();

  for (const log of params.packingLogRows) {
    const actDate = toIsoDate(log.activity_date);
    if (!actDate) continue;
    if (log.production_entry_id) {
      const prev = activityDateByEntryId.get(log.production_entry_id);
      if (!prev || actDate > prev) {
        activityDateByEntryId.set(log.production_entry_id, actDate);
      }
    }
    if (log.entry_number) {
      const numKey = String(log.entry_number).trim().toUpperCase();
      const prev = activityDateByEntryNumber.get(numKey);
      if (!prev || actDate > prev) {
        activityDateByEntryNumber.set(numKey, actDate);
      }
    }
  }

  // Build chronological packed batches per (SOC, Item) + separate pending-nipple (WITHOUT_NIPPLE) pool
  interface PackedBatch {
    date: string;
    qtySalesUom: number;
  }
  const packedBatchesBySocItem = new Map<string, PackedBatch[]>();
  const pendingNippleBySocItem = new Map<string, number>();
  const includedProductionEntryIds = new Set<string>();
  const includedProductionEntryNumbers = new Set<string>();
  const pendingNippleEntryIds = new Set<string>();
  const pendingNippleEntryNumbers = new Set<string>();

  const isPackingRowWithoutNipple = (pe: OrderCommandRawPackingRow): boolean => {
    const mode = String(pe.effective_packing_mode || '').toUpperCase().trim();
    if (mode === 'WITHOUT_NIPPLE') return true;
    if (mode === 'FULL_SET' || mode === 'COMPLETE_SET') return false;
    return isUncompletedWithoutNippleText(pe.remarks);
  };

  for (const pe of params.packingRows) {
    if (!pe.item_id) continue;
    const rawQty = Number(pe.actual_quantity) || 0;
    if (rawQty <= 0) continue;
    const tokens = extractSocTokens(pe.remarks);
    const targetSoc = resolveCanonicalSocKey(tokens, pe.item_id, itemMetaBySocAndItem, orderIdBySocUpper);
    if (!targetSoc) continue;

    const meta = itemMetaBySocAndItem.get(`${targetSoc}__${pe.item_id}`);
    const qtySales = convertBaseToOrderUom(
      rawQty,
      meta?.baseUomCode || 'PCS',
      meta?.uomCode || 'GRS',
      meta?.packagingSize,
    );
    const key = `${targetSoc}__${pe.item_id}`;
    const entryNumUpper = pe.entry_number ? String(pe.entry_number).trim().toUpperCase() : '';

    if (isPackingRowWithoutNipple(pe)) {
      if (pe.id) pendingNippleEntryIds.add(pe.id);
      if (entryNumUpper) pendingNippleEntryNumbers.add(entryNumUpper);
      pendingNippleBySocItem.set(key, (pendingNippleBySocItem.get(key) || 0) + qtySales);
      continue;
    }

    if (pe.id) includedProductionEntryIds.add(pe.id);
    if (entryNumUpper) includedProductionEntryNumbers.add(entryNumUpper);

    const shiftedDate = extractShiftedDateFromText(pe.remarks);
    const packDate =
      activityDateByEntryId.get(pe.id) ||
      (entryNumUpper ? activityDateByEntryNumber.get(entryNumUpper) : undefined) ||
      shiftedDate ||
      toIsoDate(pe.entry_date) ||
      todayIso;

    const list = packedBatchesBySocItem.get(key) || [];
    list.push({ date: packDate, qtySalesUom: qtySales });
    packedBatchesBySocItem.set(key, list);
  }

  // Include Safety-Stock-shifted & customer-dedicated opening stock ledger entries (PRODUCTION_ITEM_OPEN_STOCK)
  const includedOpeningRefs = new Set<string>();
  for (const osl of params.openingStockRows || []) {
    if (!osl.item_id) continue;
    if (isUncompletedWithoutNippleText(osl.notes)) continue;
    const rawQty = Number(osl.quantity) || 0;
    if (rawQty <= 0) continue;
    const tokens = extractSocTokens(osl.notes);
    const targetSoc = resolveCanonicalSocKey(tokens, osl.item_id, itemMetaBySocAndItem, orderIdBySocUpper);
    if (!targetSoc) continue;

    const meta = itemMetaBySocAndItem.get(`${targetSoc}__${osl.item_id}`);
    const qtySales = convertBaseToOrderUom(
      rawQty,
      meta?.baseUomCode || osl.base_uom_code || 'PCS',
      meta?.uomCode || 'GRS',
      meta?.packagingSize,
    );
    const readyDate =
      extractShiftedDateFromText(osl.notes) || toIsoDate(osl.transaction_date) || todayIso;

    const key = `${targetSoc}__${osl.item_id}`;
    const list = packedBatchesBySocItem.get(key) || [];
    list.push({ date: readyDate, qtySalesUom: qtySales });
    packedBatchesBySocItem.set(key, list);
    if (osl.reference_number) {
      includedOpeningRefs.add(String(osl.reference_number).trim().toUpperCase());
    }
  }

  // Capture any SHIFTED_TO_SOC / NIPPLE_COMPLETED activity log batches whose underlying production_entry
  // was NOT already accounted for in packingRows (e.g., remarks missing SOC token or unlinked legacy log),
  // deduplicating by entry ID / entry number so a single batch with multiple events is never double-counted.
  const seenUnlinkedActivityKeys = new Set<string>();
  for (const log of params.packingLogRows) {
    const actDate = toIsoDate(log.activity_date);
    if (!actDate || !log.soc_no || !log.item_id) continue;
    const actType = String(log.activity_type || '').toUpperCase().trim();
    if (actType && actType !== 'SHIFTED_TO_SOC' && actType !== 'NIPPLE_COMPLETED') continue;
    const statusUpper = String(log.status || '').toUpperCase().trim();
    if (statusUpper === 'WITHOUT_NIPPLE' || statusUpper === 'PENDING_NIPPLE') continue;

    const entryId = log.production_entry_id ? String(log.production_entry_id).trim() : '';
    const entryNumUpper = log.entry_number ? String(log.entry_number).trim().toUpperCase() : '';

    // Skip if already counted as FULL_SET or tracked as WITHOUT_NIPPLE from production_entries / opening_stock
    if (entryId && (includedProductionEntryIds.has(entryId) || pendingNippleEntryIds.has(entryId))) continue;
    if (entryNumUpper && (includedProductionEntryNumbers.has(entryNumUpper) || pendingNippleEntryNumbers.has(entryNumUpper) || includedOpeningRefs.has(entryNumUpper))) continue;

    const socTokens = extractSocTokens(log.soc_no);
    const targetSoc = resolveCanonicalSocKey(
      socTokens.length > 0 ? socTokens : [String(log.soc_no).trim().toUpperCase()],
      log.item_id,
      itemMetaBySocAndItem,
      orderIdBySocUpper,
    );
    if (!targetSoc || targetSoc === 'SAFETY_STOCK') continue;

    const dedupKey = entryId
      ? `pe:${entryId}`
      : entryNumUpper
      ? `num:${entryNumUpper}:${targetSoc}:${log.item_id}`
      : `anon:${targetSoc}:${log.item_id}:${actDate}:${Number(log.pcs) || 0}:${Number(log.gross) || 0}`;
    if (seenUnlinkedActivityKeys.has(dedupKey)) continue;
    seenUnlinkedActivityKeys.add(dedupKey);

    const meta = itemMetaBySocAndItem.get(`${targetSoc}__${log.item_id}`);
    const qtySales =
      Number(log.gross) > 0 && (!meta?.uomCode || meta.uomCode.toUpperCase() === 'GRS')
        ? Number(log.gross)
        : convertBaseToOrderUom(
            Number(log.pcs) || 0,
            meta?.baseUomCode || 'PCS',
            meta?.uomCode || 'GRS',
            meta?.packagingSize,
          );
    if (qtySales <= 0) continue;
    const key = `${targetSoc}__${log.item_id}`;
    const list = packedBatchesBySocItem.get(key) || [];
    list.push({ date: actDate, qtySalesUom: qtySales });
    packedBatchesBySocItem.set(key, list);
  }

  // Sort chronological batches oldest first for FIFO ready aging
  for (const batches of packedBatchesBySocItem.values()) {
    batches.sort((a, b) => a.date.localeCompare(b.date));
  }

  // 4. Assemble Enriched Orders & Item Breakdown
  const orders: OrderCommandOrder[] = [];
  const customersMap = new Map<string, OrderCommandCustomerSummary>();

  for (const [orderId, bucket] of ordersMap.entries()) {
    const h = bucket.header;
    const socUpper = String(h.order_number || '').trim().toUpperCase();
    const statusUpper = String(h.order_status || 'Draft').trim().toUpperCase();
    const isCancelled = statusUpper === 'CANCELLED' || statusUpper === 'VOID';
    const isExplicitlyCompleted = statusUpper === 'COMPLETED' || statusUpper === 'CLOSED';

    let orderOrderedQty = 0;
    let orderDispatchedQty = 0;
    let orderPendingQty = 0;
    let orderReadyPackedQty = 0;
    let orderPendingNippleQty = 0;
    let orderRemainingToPackQty = 0;
    let orderOldestReadyDate: string | null = null;
    let orderMaxReadyAgeDays: number | null = null;
    let orderSubtotal = 0;
    let orderTaxSum = 0;
    let orderLineTotalSum = 0;

    const items: OrderCommandItem[] = bucket.items.map((it) => {
      const ordered = round2(Number(it.ordered_qty) || 0);
      const itemId = it.item_id;
      const dnDisp = itemId ? dnDispatchedBySocItem.get(`${socUpper}__${itemId}`) || 0 : 0;
      const soiDisp = Number(it.soi_shipped_qty) || 0;
      const rawDispatched = round2(Math.max(dnDisp, soiDisp));
      const dispatched = isExplicitlyCompleted ? Math.max(ordered, rawDispatched) : rawDispatched;
      const pending = isCancelled || isExplicitlyCompleted ? 0 : Math.max(0, round2(ordered - dispatched));

      // FIFO un-dispatched Ready Packed calculation (strictly FULL_SET)
      let readyPacked = 0;
      let readySinceDate: string | null = null;
      let readyAgeDays: number | null = null;
      const pendingNippleQty =
        pending > 0 && itemId && !isCancelled
          ? round2(pendingNippleBySocItem.get(`${socUpper}__${itemId}`) || 0)
          : 0;

      if (pending > 0 && itemId && !isCancelled) {
        const batches = packedBatchesBySocItem.get(`${socUpper}__${itemId}`) || [];
        let consume = dispatched;
        let unshippedTotal = 0;
        for (const b of batches) {
          if (consume >= b.qtySalesUom) {
            consume -= b.qtySalesUom;
          } else {
            const rem = b.qtySalesUom - consume;
            consume = 0;
            if (!readySinceDate && rem > 0.001) {
              readySinceDate = b.date;
            }
            unshippedTotal += rem;
          }
        }
        readyPacked = Math.min(pending, round2(unshippedTotal));
        if (readyPacked > 0.001 && readySinceDate) {
          const batchMs = Date.parse(`${readySinceDate}T00:00:00Z`);
          if (!Number.isNaN(batchMs)) {
            readyAgeDays = Math.max(0, Math.floor((todayMs - batchMs) / 86_400_000));
          }
        } else {
          readyPacked = 0;
          readySinceDate = null;
        }
      }

      const remainingToPack = Math.max(0, round2(pending - readyPacked));
      const unitPrice = Number(it.unit_price) || 0;
      const discountPercent = Number(it.discount_percent) || 0;
      const netBase = round2(ordered * unitPrice * (1 - discountPercent / 100));
      const taxAmount = round2(Number(it.line_tax_amount) || 0);
      const taxPercent = netBase > 0 ? Math.round((taxAmount / netBase) * 10000) / 100 : (taxAmount > 0 ? 18 : 0);
      const lineTotal = round2(Number(it.line_total) > 0 ? Number(it.line_total) : netBase + taxAmount);

      orderOrderedQty += ordered;
      orderDispatchedQty += Math.min(ordered, dispatched);
      orderPendingQty += pending;
      orderReadyPackedQty += readyPacked;
      orderPendingNippleQty += pendingNippleQty;
      orderRemainingToPackQty += remainingToPack;
      orderSubtotal += netBase;
      orderTaxSum += taxAmount;
      orderLineTotalSum += lineTotal;

      if (readyAgeDays !== null && (orderMaxReadyAgeDays === null || readyAgeDays > orderMaxReadyAgeDays)) {
        orderMaxReadyAgeDays = readyAgeDays;
        orderOldestReadyDate = readySinceDate;
      }

      return {
        id: it.order_item_id || `${orderId}-${it.item_id || 'line'}`,
        itemId: it.item_id,
        itemCode: it.item_code || 'ITEM',
        itemName: it.item_name || 'Item',
        uomCode:
          it.uom_code ||
          (String(h.division_code || '').toUpperCase().includes('CCD')
            ? 'M'
            : String(h.division_code || '').toUpperCase().includes('WRD')
              ? 'KG'
              : 'GRS'),
        packagingSize: Number(it.packaging_size) > 0 ? Number(it.packaging_size) : null,
        packagingUnit: it.packaging_unit || null,
        ordered,
        dispatched: round2(dispatched),
        pending,
        readyPacked,
        pendingNippleQty,
        readySinceDate,
        readyAgeDays,
        remainingToPack,
        unitPrice,
        discountPercent,
        taxPercent,
        taxAmount,
        lineTotal,
      };
    });

    const totalOrderedRound = round2(orderOrderedQty);
    const totalPendingRound = round2(orderPendingQty);
    const totalDispatchedRound = round2(orderDispatchedQty);
    const totalReadyRound = round2(orderReadyPackedQty);
    const totalPendingNippleRound = round2(orderPendingNippleQty);
    const totalToPackRound = round2(orderRemainingToPackQty);

    let category: 'PENDING' | 'COMPLETED' | 'CANCELLED' = 'PENDING';
    if (isCancelled) {
      category = 'CANCELLED';
    } else if (isExplicitlyCompleted || (totalOrderedRound > 0 && totalPendingRound <= 0.001)) {
      category = 'COMPLETED';
    } else {
      category = 'PENDING';
    }

    const totalAmount = round2(
      Number(h.order_total) > 0 ? Number(h.order_total) : orderLineTotalSum - (Number(h.order_discount) || 0) + (Number(h.order_freight) || 0),
    );
    const subtotal = round2(Number(h.order_subtotal) > 0 ? Number(h.order_subtotal) : orderSubtotal);
    const taxAmount = round2(Number(h.order_tax) > 0 ? Number(h.order_tax) : orderTaxSum);
    const primaryUom =
      items[0]?.uomCode ||
      (String(h.division_code || '').toUpperCase().includes('CCD')
        ? 'M'
        : String(h.division_code || '').toUpperCase().includes('WRD')
          ? 'KG'
          : 'GRS');

    const linkedDeliveries = Array.from((deliveriesByOrder.get(orderId) || new Map()).values()).sort((a, b) =>
      String(b.deliveryDate || '').localeCompare(String(a.deliveryDate || '')),
    );

    const orderDateStr = toIsoDate(h.order_date);
    let orderAgeDays: number | null = null;
    if (orderDateStr) {
      const orderMs = Date.parse(`${orderDateStr}T00:00:00Z`);
      if (!Number.isNaN(orderMs)) {
        orderAgeDays = Math.max(0, Math.floor((todayMs - orderMs) / 86_400_000));
      }
    }

    const orderObj: OrderCommandOrder = {
      id: orderId,
      orderNumber: h.order_number,
      customerId: h.customer_id,
      customerCode: h.customer_code || 'CUST',
      customerName: h.customer_name || 'Customer',
      customerPo: h.customer_po || null,
      divisionId: h.division_id || null,
      divisionCode: h.division_code || null,
      divisionName: h.division_name || null,
      orderDate: orderDateStr,
      orderAgeDays,
      deliveryDate: toIsoDate(h.delivery_date),
      currency: h.currency || 'PKR',
      status: h.order_status || 'Draft',
      category,
      paymentTerms: h.payment_terms || 'Standard',
      orderedQty: totalOrderedRound,
      dispatchedQty: totalDispatchedRound,
      pendingQty: totalPendingRound,
      readyPackedQty: totalReadyRound,
      pendingNippleQty: totalPendingNippleRound,
      readySinceDate: orderOldestReadyDate,
      readyAgeDays: orderMaxReadyAgeDays,
      remainingToPackQty: totalToPackRound,
      subtotal,
      taxAmount,
      totalAmount,
      uomCode: primaryUom,
      items,
      linkedDeliveries,
    };

    orders.push(orderObj);

    // Roll into Customer 360° Portfolio
    const custId = h.customer_id || 'unknown';
    let cust = customersMap.get(custId);
    if (!cust) {
      cust = {
        customerId: custId,
        customerCode: h.customer_code || 'CUST',
        customerName: h.customer_name || 'Customer',
        uomCode: primaryUom,
        contactPerson: h.contact_person || null,
        email: h.customer_email || null,
        phone: h.customer_phone || null,
        mobile: h.customer_mobile || null,
        paymentTerms: h.payment_terms || 'Standard',
        creditDays: Number(h.credit_days) || 0,
        openOrderCount: 0,
        completedOrderCount: 0,
        cancelledOrderCount: 0,
        totalOrderedQty: 0,
        totalDispatchedQty: 0,
        totalPendingQty: 0,
        totalReadyPackedQty: 0,
        oldestReadyAgeDays: null,
        totalRemainingToPackQty: 0,
        totalOpenValue: 0,
        totalDispatchedValue: 0,
        totalOrderValue: 0,
      };
      customersMap.set(custId, cust);
    }

    if (category === 'PENDING') {
      cust.openOrderCount += 1;
      cust.totalOrderedQty = round2(cust.totalOrderedQty + totalOrderedRound);
      cust.totalPendingQty = round2(cust.totalPendingQty + totalPendingRound);
      cust.totalReadyPackedQty = round2(cust.totalReadyPackedQty + totalReadyRound);
      cust.totalRemainingToPackQty = round2(cust.totalRemainingToPackQty + totalToPackRound);
      cust.totalOpenValue = round2(cust.totalOpenValue + totalAmount);
      if (orderMaxReadyAgeDays !== null && (cust.oldestReadyAgeDays === null || orderMaxReadyAgeDays > cust.oldestReadyAgeDays)) {
        cust.oldestReadyAgeDays = orderMaxReadyAgeDays;
      }
    } else if (category === 'COMPLETED') {
      cust.completedOrderCount += 1;
    } else {
      cust.cancelledOrderCount += 1;
    }

    if (category !== 'CANCELLED') {
      cust.totalDispatchedQty = round2(cust.totalDispatchedQty + totalDispatchedRound);
      cust.totalOrderValue = round2(cust.totalOrderValue + totalAmount);
      const dnVal = dnValueByOrder.get(orderId) || 0;
      const estimatedDispVal =
        dnVal > 0
          ? dnVal
          : (totalOrderedRound > 0 ? round2((totalDispatchedRound / totalOrderedRound) * totalAmount) : 0);
      cust.totalDispatchedValue = round2(cust.totalDispatchedValue + estimatedDispVal);
    }
  }

  // Sort orders: Pending ready/newest first, then Completed newest first, then Cancelled newest first
  orders.sort((a, b) => {
    const rank = (c: string) => (c === 'PENDING' ? 0 : c === 'COMPLETED' ? 1 : 2);
    const rd = rank(a.category) - rank(b.category);
    if (rd !== 0) return rd;
    if (a.category === 'PENDING') {
      const aHasReady = a.readyPackedQty > 0 ? 1 : 0;
      const bHasReady = b.readyPackedQty > 0 ? 1 : 0;
      if (aHasReady !== bHasReady) return bHasReady - aHasReady;
      const ageDiff = (b.readyAgeDays ?? -1) - (a.readyAgeDays ?? -1);
      if (ageDiff !== 0) return ageDiff;
    }
    return String(b.orderDate || '').localeCompare(String(a.orderDate || '')) || b.orderNumber.localeCompare(a.orderNumber);
  });

  // Compute global KPIs & section summaries across the returned orders
  const pendingOrders = orders.filter((o) => o.category === 'PENDING');
  const completedOrders = orders.filter((o) => o.category === 'COMPLETED');
  const cancelledOrders = orders.filter((o) => o.category === 'CANCELLED');

  let totalOrdered = 0;
  let dispatched = 0;
  let pendingOrderBalance = 0;
  let readyPacked = 0;
  let remainingToPack = 0;
  let oldestReadyAgeDays: number | null = null;
  let readyOrderCount = 0;

  for (const o of pendingOrders) {
    totalOrdered += o.orderedQty;
    dispatched += o.dispatchedQty;
    pendingOrderBalance += o.pendingQty;
    readyPacked += o.readyPackedQty;
    remainingToPack += o.remainingToPackQty;
    if (o.readyPackedQty > 0) {
      readyOrderCount += 1;
      if (o.readyAgeDays !== null && (oldestReadyAgeDays === null || o.readyAgeDays > oldestReadyAgeDays)) {
        oldestReadyAgeDays = o.readyAgeDays;
      }
    }
  }

  return {
    kpis: {
      totalOrdered: round2(totalOrdered),
      dispatched: round2(dispatched),
      pendingOrderBalance: round2(pendingOrderBalance),
      readyPacked: round2(readyPacked),
      oldestReadyAgeDays,
      readyOrderCount,
      remainingToPack: round2(remainingToPack),
      activeOrderCount: pendingOrders.length,
      primaryUom: pendingOrders[0]?.uomCode || completedOrders[0]?.uomCode || 'GRS',
    },
    sections: {
      pending: {
        count: pendingOrders.length,
        totalQty: round2(pendingOrders.reduce((s, o) => s + o.orderedQty, 0)),
        pendingQty: round2(pendingOrderBalance),
        readyQty: round2(readyPacked),
        totalAmount: round2(pendingOrders.reduce((s, o) => s + o.totalAmount, 0)),
      },
      completed: {
        count: completedOrders.length,
        totalQty: round2(completedOrders.reduce((s, o) => s + o.orderedQty, 0)),
        dispatchedQty: round2(completedOrders.reduce((s, o) => s + o.dispatchedQty, 0)),
        totalAmount: round2(completedOrders.reduce((s, o) => s + o.totalAmount, 0)),
      },
      cancelled: {
        count: cancelledOrders.length,
        totalQty: round2(cancelledOrders.reduce((s, o) => s + o.orderedQty, 0)),
        totalAmount: round2(cancelledOrders.reduce((s, o) => s + o.totalAmount, 0)),
      },
    },
    orders,
    customers: Array.from(customersMap.values()).sort(
      (a, b) => b.totalPendingQty - a.totalPendingQty || a.customerName.localeCompare(b.customerName),
    ),
    divisions: params.divisions,
    generatedAt: new Date().toISOString(),
  };
}
