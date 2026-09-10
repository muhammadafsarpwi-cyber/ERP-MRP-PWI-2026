import apiService from './api';

export interface MaterialLifecycleFilters {
  storeId?: string;
  dateFrom?: string;
  dateTo?: string;
}

export interface TraceItem {
  id: string;
  item_code: string;
  sku: string | null;
  name: string;
  short_name: string | null;
  description: string | null;
  notes: string | null;
  item_type: string;
  status: string;
  barcode: string | null;
  brand: string | null;
  model: string | null;
  manufacturer_part_number: string | null;
  category_id: string | null;
  category_name: string | null;
  base_uom_id: string;
  base_uom_code: string;
  minimum_stock_level: number | null;
  maximum_stock_level: number | null;
  reorder_level: number | null;
  safety_stock_level: number | null;
  lead_time_days: number | null;
  track_inventory: boolean;
  batch_tracked: boolean;
  serial_tracked: boolean;
  is_purchasable: boolean;
  is_sellable: boolean;
  is_manufacturable: boolean;
  is_stock_item: boolean;
  cost_price: number | null;
  selling_price: number | null;
  created_at: string;
  updated_at: string;
}

export interface StoreConfigRow {
  store_item_id: string;
  store_id: string;
  bin: string | null;
  rack: string | null;
  shelf: string | null;
  location_detail: string | null;
  minimum_stock: number;
  reorder_level: number;
  maximum_stock: number;
  preferred_issue_method: string;
  batch_tracked: boolean;
  serial_tracked: boolean;
  store_item_status: string;
  store_code: string;
  store_name: string;
  warehouse_id: string | null;
  store_type: string;
  division_id: string | null;
  section_id: string | null;
  department_id: string | null;
  division_name: string | null;
  section_name: string | null;
  department_name: string | null;
}

export interface BalanceRow {
  warehouseId: string;
  warehouseCode: string;
  warehouseName: string;
  onHand: number;
  reserved: number;
  available: number;
  minimumStock: number;
  reorderLevel: number;
  maximumStock: number;
  shortage: number;
  status: 'OK' | 'LOW' | 'REORDER' | 'OUT_OF_STOCK';
}

export interface Reconciliation {
  requested: number;
  approved: number;
  gmApproved: number;
  supplierConfirmed: number;
  prQty: number;
  orderedQty: number;
  receivedQty: number;
  acceptedQty: number;
  rejectedQty: number;
  pendingReceiptQty: number;
  issuedQty: number;
  returnedQty: number;
  transferredInQty: number;
  transferredOutQty: number;
  adjustedInQty: number;
  adjustedOutQty: number;
  reservedQty: number;
  availableQty: number;
}

export interface EtaRow {
  requestId: string;
  requestNumber: string;
  requestDate: string;
  storeName: string;
  storeCode: string;
  status: string;
  priority: string;
  prNumber: string | null;
  prId: string | null;
  poNumber: string | null;
  poId: string | null;
  dates: {
    request: string | null;
    submitted: string | null;
    submittedRaw: string | null;
    approval: string | null;
    gmApproval: string | null;
    conversion: string | null;
    order: string | null;
    supplierConfirmed: string | null;
    expected: string | null;
    actual: string | null;
  };
  leadTimes: {
    requestToPr: number | null;
    requestToManagerApproval: number | null;
    managerToGmApproval: number | null;
    gmApprovalToConversion: number | null;
    conversionToOrder: number | null;
    requestToOrder: number | null;
    orderToSupplierConfirmation: number | null;
    supplierConfirmationToDelivery: number | null;
    totalLeadTime: number | null;
  };
  deliveryStatus: 'PENDING' | 'UPCOMING' | 'OVERDUE' | 'DELIVERED';
  overdueByDays: number | null;
  expectedInDays: number | null;
  etaPending: boolean;
  actualDeliveryDate: string | null;
  expectedDeliveryDate: string | null;
}

export interface RequestRow {
  id: string;
  request_number: string;
  request_date: string;
  required_date: string | null;
  status: string;
  priority: string;
  purpose: string | null;
  remarks: string | null;
  store_id: string;
  supplier_id: string | null;
  store_code: string;
  store_name: string;
  warehouse_id: string | null;
  division_name: string | null;
  section_name: string | null;
  department_name: string | null;
  created_by: string | null;
  created_at: string;
  submitted_by: string | null;
  submitted_at: string | null;
  approved_by: string | null;
  approved_at: string | null;
  gm_approved_by: string | null;
  gm_approved_at: string | null;
  converted_by: string | null;
  converted_at: string | null;
  pr_id: string | null;
  pr_number: string | null;
  po_id: string | null;
  po_number: string | null;
  supplier_confirmed_date: string | null;
  expected_delivery_date: string | null;
  actual_delivery_date: string | null;
  eta_pending: boolean;
  po_order_date: string | null;
  line_id: string;
  line_number: number;
  requested_quantity: number;
  issued_quantity: number;
  pr_created_qty: number;
  pr_remaining_qty: number;
  pr_status: string;
  available_stock: number;
  uom_code: string;
}

export interface PrRow {
  id: string;
  requisition_code: string;
  title: string | null;
  status: string;
  request_type: string;
  requested_delivery_date: string | null;
  approved_by: string | null;
  approved_at: string | null;
  created_by: string | null;
  created_at: string;
  supplier_name: string | null;
  line_id: string;
  line_number: number;
  quantity: number;
  converted_quantity: number;
  estimated_unit_price: number | null;
  required_date: string | null;
  line_status: string;
  uom_code: string;
}

export interface OrderRow {
  id: string;
  po_code: string;
  order_date: string | null;
  expected_delivery_date: string | null;
  status: string;
  currency_code: string;
  requisition_id: string | null;
  received_at: string | null;
  approved_by: string | null;
  approved_at: string | null;
  cancelled_at: string | null;
  created_by: string | null;
  created_at: string;
  supplier_name: string;
  line_id: string;
  line_number: number;
  quantity: number;
  received_quantity: number;
  invoiced_quantity: number;
  unit_price: number;
  warehouse_id: string | null;
  uom_code: string;
}

export interface GrnRow {
  id: string;
  receipt_code: string;
  grn_number: string | null;
  receipt_date: string | null;
  status: string;
  po_id: string;
  warehouse_id: string;
  delivery_note_number: string | null;
  posted_by: string | null;
  posted_at: string | null;
  notes: string | null;
  supplier_name: string;
  warehouse_name: string | null;
  line_id: string;
  line_number: number;
  quantity_ordered: number;
  quantity_received: number;
  quantity_accepted: number;
  quantity_rejected: number;
  unit_price: number;
  condition_notes: string | null;
  uom_code: string;
}

export interface IssueRow {
  id: string;
  issue_number: string;
  issue_date: string;
  status: string;
  purpose: string | null;
  remarks: string | null;
  posted_by: string | null;
  posted_at: string | null;
  cancelled_at: string | null;
  request_id: string | null;
  store_code: string;
  store_name: string;
  issued_to_department_name: string | null;
  line_id: string;
  line_number: number;
  quantity: number;
  serial_number: string | null;
  bin: string | null;
  rack: string | null;
  uom_code: string;
}

export interface ReturnRow {
  id: string;
  return_number: string;
  return_date: string;
  status: string;
  reason: string | null;
  remarks: string | null;
  posted_by: string | null;
  posted_at: string | null;
  cancelled_at: string | null;
  issue_id: string | null;
  condition_code: string;
  store_code: string;
  store_name: string;
  from_department_name: string | null;
  line_id: string;
  line_number: number;
  quantity: number;
  serial_number: string | null;
  line_condition_code: string;
  uom_code: string;
}

export interface TransferRow {
  id: string;
  transaction_type: string;
  transaction_date: string;
  quantity: number;
  direction: string;
  reference_type: string;
  reference_id: string | null;
  reference_number: string | null;
  notes: string | null;
  created_by: string | null;
  warehouse_id: string;
  warehouse_code: string | null;
  warehouse_name: string | null;
  user_name: string | null;
}

export interface AdjustmentRow extends TransferRow {}

export interface ReservationRow {
  id: string;
  quantity: number;
  reservation_type: string;
  reference_type: string | null;
  reference_id: string | null;
  status: string;
  expires_at: string | null;
  reserved_by: string | null;
  created_at: string;
  warehouse_code: string | null;
  warehouse_name: string | null;
  user_name: string | null;
}

export interface LedgerRow extends TransferRow {
  key: string;
  balance: number;
  isOpening: boolean;
}

export interface TimelineStage {
  key: string;
  label: string;
  reached: boolean;
  date: string | null;
  note: string;
}

export interface TimelineData {
  itemId: string;
  companyId: string;
  filters: MaterialLifecycleFilters;
  stages: TimelineStage[];
  counts: {
    requests: number;
    cancelled: number;
    rejected: number;
    fullyConverted: number;
  };
}

export interface AuditEvent {
  timestamp: string;
  action: string;
  documentType: string | null;
  document: string | null;
  referenceId: string | null;
  user: string | null;
  department: string | null;
  store: string | null;
  quantity: number;
  status: string | null;
  remarks: string | null;
}

export interface MaterialLifecycle {
  generatedAt: string;
  filters: MaterialLifecycleFilters;
  item: TraceItem;
  storeConfigs: StoreConfigRow[];
  storeMap: Array<{ warehouseId: string; storeCode: string; storeName: string }>;
  currentStock: { rows: BalanceRow[]; total: { onHand: number; reserved: number; available: number; belowMinimum: number } };
  minMax: {
    global: {
      minimumStockLevel: number | null;
      maximumStockLevel: number | null;
      reorderLevel: number | null;
      safetyStockLevel: number | null;
      leadTimeDays: number | null;
    };
    perStore: Array<{
      storeItemId: string;
      storeId: string;
      storeCode: string;
      storeName: string;
      minimumStock: number;
      reorderLevel: number;
      maximumStock: number;
      preferredIssueMethod: string;
      batchTracked: boolean;
      serialTracked: boolean;
    }>;
  };
  reconciliation: Reconciliation;
  eta: EtaRow[];
  timeline: TimelineData;
  audit: AuditEvent[];
  requests: RequestRow[];
  prs: PrRow[];
  orders: OrderRow[];
  grns: GrnRow[];
  issues: IssueRow[];
  returns: ReturnRow[];
  transfers: TransferRow[];
  adjustments: AdjustmentRow[];
  reservations: ReservationRow[];
  ledger: {
    opening: number;
    closing: number;
    movement: number;
    reservations: number;
    totals: {
      opening: number;
      receiptsIn: number;
      grnsIn: number;
      materialReceiptsIn: number;
      productionConsumption: number;
      issuesOut: number;
      returnsIn: number;
      transfersIn: number;
      transfersOut: number;
      adjustments: number;
    };
    rows: LedgerRow[];
  };
}

export const fetchItemLifecycle = (
  itemId: string,
  filters: MaterialLifecycleFilters = {},
): Promise<MaterialLifecycle> => {
  const params: Record<string, string> = {};
  if (filters.storeId) params.storeId = filters.storeId;
  if (filters.dateFrom) params.dateFrom = filters.dateFrom;
  if (filters.dateTo) params.dateTo = filters.dateTo;
  return apiService.get<MaterialLifecycle>(`/store/lifecycle/items/${itemId}`, params);
};