import apiService from './api';

export interface DashboardFilters {
  storeId?: string;
  divisionId?: string;
  sectionId?: string;
  departmentId?: string;
  dateFrom?: string;
  dateTo?: string;
}

export interface DashboardKpi {
  key: string;
  label: string;
  value: number;
  color: string;
}

export interface DashboardWorkflowStep {
  key: string;
  label: string;
  count: number;
  pending: number;
  completed: number;
  path: string;
}

export interface PendingApprovalRow {
  id: string;
  requestNumber: string;
  requestDate: string;
  priority: string;
  status: string;
  storeCode: string;
  storeName: string;
  divisionName: string;
  departmentName: string;
  sectionName: string;
  items: number;
  quantity: number;
  ageDays: number;
  submittedByName?: string;
  approvedByName?: string;
  approvedAt?: string;
}

export interface FunnelStep {
  key: string;
  label: string;
  qty: number;
  color: string;
}

export interface ProcurementFunnel {
  requested: number;
  received: number;
  pending: number;
  steps: FunnelStep[];
}

export interface LowStockRow {
  id: string;
  storeName: string;
  storeCode: string;
  storeType: string;
  itemCode: string;
  itemName: string;
  uomCode: string;
  onHand: number;
  reserved: number;
  available: number;
  minimumStock: number;
  reorderLevel: number;
  maximumStock: number;
  requiredQuantity: number;
  alreadyInProcurement: number;
  remainingRequirement: number;
  status: string;
  materialRequestNumber: string | null;
  prNumber: string | null;
  poNumber: string | null;
  expectedDeliveryDate: string | null;
  overdueSince: string | null;
  deferred: boolean;
  cancelled: boolean;
}

export interface StockSummaryRow {
  storeItemId: string;
  storeId: string;
  storeCode: string;
  storeName: string;
  itemId: string;
  itemCode: string;
  itemName: string;
  uomCode: string;
  onHand: number;
  reserved: number;
  available: number;
  minimumStock: number;
  reorderLevel: number;
  maximumStock: number;
  shortage: number;
  status: 'LOW' | 'REORDER' | 'OK';
}

export interface ActivityRow {
  type: string;
  id: string;
  document: string;
  status: string;
  date: string;
  store: string;
  org: string;
  summary: string;
}

export interface StoreDashboardSummary {
  generatedAt: string;
  filters: DashboardFilters;
  kpis: DashboardKpi[];
  workflow: DashboardWorkflowStep[];
  pendingApprovals: {
    manager: PendingApprovalRow[];
    gm: PendingApprovalRow[];
  };
  procurementFunnel: ProcurementFunnel;
  lowStock: {
    available: boolean;
    total: number;
    rows: LowStockRow[];
  };
  stockSummary: {
    rows: StockSummaryRow[];
    belowMinimum: number;
    total: number;
  };
  activity: ActivityRow[];
}

export interface StoreOption {
  id: string;
  storeCode: string;
  storeName: string;
  warehouseId: string | null;
}

export interface OrgOption {
  id: string;
  name: string;
}

export const fetchStoreDashboardSummary = (
  filters: DashboardFilters,
): Promise<StoreDashboardSummary> => apiService.get('/store/dashboard/summary', filters);

export const fetchStores = (): Promise<StoreOption[]> => apiService.get<StoreOption[]>('/store/stores');