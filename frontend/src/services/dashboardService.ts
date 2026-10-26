import apiService from './api';

export interface DashboardFilters {
  divisionId?: string;
  sectionId?: string;
  departmentId?: string;
  shiftId?: string;
  machineId?: string;
  itemId?: string;
  dateFrom?: string;
  dateTo?: string;
}

export interface DashboardSummary {
  items: { total: number; active: number };
  machines: { total: number; active: number; statusBreakdown: Record<string, number> };
  productionEntries: { total: number; today: number; lastEntryDate?: string | null };
  machineTargets: { total: number; active: number };
  warehouses: { total: number };
  purchaseOrders: { total: number; active: number };
  salesOrders: { total: number; active: number };
  bomLines: { total: number };
  inventory: { totalStockValue: number; lowStockItems: number };
}

export interface ProductionSummary {
  dateRange: { dateFrom: string | null; dateTo: string | null };
  totalEntries: number;
  summary: {
    totalTarget: number;
    totalActual: number;
    totalScrap: number;
    productRejection?: number;
    processCuttingScrap?: number;
    totalRunningHours: number;
    totalDowntimeHours: number;
    totalOvertimeHours?: number;
    achievementPercentage: number;
    efficiencyPercentage: number;
  };
  departments: Array<{
    departmentId: string;
    departmentName: string;
    targetQuantity: number;
    actualQuantity: number;
    scrapQuantity: number;
    processScrapKg?: number;
    productRejection?: number;
    processCuttingScrap?: number;
    runningHours: number;
    downtimeHours: number;
    overtimeHours?: number;
    divisionId?: string | null;
    reportingUom?: 'PCS' | 'GRS' | 'KG' | 'METER' | string;
    secondaryUom?: 'PCS' | 'GRS' | 'KG' | 'METER' | 'NONE' | string;
    enableConversionBridge?: boolean;
    avgWeightPerMeter?: number;
    avgWeightPerPiece?: number;
    entryCount: number;
    achievementPercentage: number;
  }>;
}

export interface ProductionTrendDay {
  date: string;
  entryCount: number;
  targetQuantity: number;
  actualQuantity: number;
  scrapQuantity: number;
  runningHours: number;
  downtimeHours: number;
  achievementPercentage: number;
}

export interface MachinePerformanceItem {
  id: string;
  machineCode: string;
  machineName: string;
  machineNumber?: string;
  departmentName: string | null;
  status: string;
  criticality: string;
  entryCount: number;
  targetQuantity: number;
  actualQuantity: number;
  scrapQuantity: number;
  processScrapKg?: number;
  runningHours: number;
  downtimeHours: number;
  avgAchievement: number;
}

export interface InventorySummary {
  warehouses: Array<{
    warehouseId: string;
    warehouseCode: string;
    warehouseName: string;
    totalItems: number;
    totalOnHand: number;
    totalReserved: number;
    totalAvailable: number;
  }>;
  lowStockItems: Array<{
    itemId: string;
    itemCode: string;
    name: string;
    minimumStockLevel: number;
    onHand: number;
  }>;
  recentTransactions: Array<{
    id: string;
    transactionType: string;
    itemCode: string;
    itemName: string;
    warehouseCode: string;
    quantity: number;
    direction: string;
    createdAt: string;
  }>;
}

export interface AlertItem {
  type: string;
  severity: 'warning' | 'error' | 'info';
  title: string;
  description: string;
  link?: string;
  count?: number;
}

export interface ActivityItem {
  id: string;
  actorEmail: string;
  action: string;
  targetType: string;
  targetId: string | null;
  targetName: string | null;
  details: string | null;
  createdAt: string;
}

export interface PurchaseOrderSummary {
  recentOrders: Array<{
    id: string;
    poCode: string;
    supplierName: string;
    orderDate: string | null;
    expectedDeliveryDate: string | null;
    totalAmount: number;
    status: string;
    currencyCode: string;
  }>;
  statusBreakdown: Array<{
    status: string;
    count: number;
    totalValue: number;
  }>;
}

export interface SalesOrderSummary {
  recentOrders: Array<{
    id: string;
    orderNumber: string;
    customerName: string;
    orderDate: string | null;
    deliveryDate: string | null;
    totalAmount: number;
    status: string;
    currency: string;
  }>;
  statusBreakdown: Array<{
    status: string;
    count: number;
    totalValue: number;
  }>;
}

export interface ItemOverview {
  id: string;
  itemCode: string;
  name: string;
  departmentName?: string | null;
  wireSizeMm?: number | null;
  itemType: string;
  status: string;
  isManufacturable: boolean;
  isPurchasable: boolean;
  isSellable: boolean;
  costPrice: number | null;
  sellingPrice: number | null;
  minimumStockLevel: number | null;
  maximumStockLevel: number | null;
  reorderLevel: number | null;
  warehouseName?: string | null;
  warehouseCode?: string | null;
  stock: { onHand: number; reserved: number; available: number; warehouseName?: string | null; warehouseCode?: string | null };
  production: { entryCount: number; totalActual: number };
}

export interface ProductionChainStage {
  stageOrder: number;
  stageName: string;
  itemId: string;
  itemCode: string;
  itemName: string;
  itemType: string;
  departmentName: string | null;
  wireSizeMm?: number | null;
  uom?: string | null;
  isCurrent: boolean;
}

export interface ProductionFlowInfo {
  isRawMaterial: boolean;
  hasConfiguredRoute: boolean;
  statusMessage: string;
  operationName: string | null;
  departmentName: string | null;
  inputItem: {
    id: string;
    itemCode: string;
    name: string;
    itemType: string;
    wireSizeMm?: number | null;
    uom?: string | null;
    departmentName?: string | null;
    storeWarehouseName?: string | null;
  } | null;
  outputItem: {
    id: string;
    itemCode: string;
    name: string;
    itemType: string;
    wireSizeMm?: number | null;
    uom?: string | null;
    departmentName?: string | null;
  };
  routeTypeName?: string | null;
  wireSizeMm?: number | null;
  thicknessMm?: number | null;
  widthMm?: number | null;
  finalProduct?: string | null;
  packingNextStep?: string | null;
  processes?: Array<{ step: number; name: string }>;
  chain: ProductionChainStage[];
}

export interface ItemRoute {
  routing: {
    id: string;
    routingCode: string;
    name: string;
    description: string | null;
    estimatedTotalTime: number;
    isDefault: boolean;
    baseQuantity: number;
  } | null;
  operations: Array<{
    sequenceNo: number;
    operationCode: string;
    operationName: string;
    description: string | null;
    departmentId: string | null;
    setupTimeMinutes: number;
    runTimeMinutes: number;
    queueTimeMinutes: number;
    machineRequired: boolean;
    inputQuantity: number;
    outputQuantity: number;
    scrapPercentage: number;
    status: string;
  }>;
  productionFlow?: ProductionFlowInfo | null;
}

export interface DashboardScheduleItem {
  id: string;
  type: string;
  title: string;
  subtitle: string;
  time: string;
  deliveryDate?: string | null;
  status: string;
}

export interface CalendarActivityDay {
  date: string;
  count: number;
  totalActual: number;
}

export interface FilterOption {
  id: string;
  name: string;
  divisionCode?: string;
  sectionCode?: string;
  startTime?: string;
  endTime?: string;
}

class DashboardService {
  private buildParams(filters?: DashboardFilters): Record<string, string> {
    const params: Record<string, string> = {};
    if (filters) {
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
          params[key] = String(value);
        }
      });
    }
    return params;
  }

  async getSummary(filters?: DashboardFilters): Promise<{ success: boolean; data: DashboardSummary }> {
    return apiService.get('/dashboard/summary', this.buildParams(filters));
  }

  async getLastEntryDate(filters?: DashboardFilters): Promise<{ success: boolean; data: { lastEntryDate: string | null } }> {
    return apiService.get('/dashboard/last-entry-date', this.buildParams(filters));
  }

  async getProduction(filters?: DashboardFilters): Promise<{ success: boolean; data: ProductionSummary }> {
    return apiService.get('/dashboard/production', this.buildParams(filters));
  }

  async getProductionTrend(days: number = 31, filters?: DashboardFilters): Promise<{ success: boolean; data: ProductionTrendDay[] }> {
    return apiService.get('/dashboard/production/trend', { days: String(days), ...this.buildParams(filters) });
  }

  async getMachinePerformance(filters?: DashboardFilters): Promise<{ success: boolean; data: MachinePerformanceItem[] }> {
    return apiService.get('/dashboard/machines/performance', this.buildParams(filters));
  }

  async getItemOverview(filters?: DashboardFilters & { itemType?: string; status?: string; search?: string }): Promise<{ success: boolean; data: ItemOverview[] }> {
    return apiService.get('/dashboard/items/overview', this.buildParams(filters));
  }

  async getItemRoute(itemId: string): Promise<{ success: boolean; data: ItemRoute }> {
    return apiService.get(`/dashboard/items/${itemId}/route`);
  }

  async getInventory(filters?: DashboardFilters & { warehouseId?: string }): Promise<{ success: boolean; data: InventorySummary }> {
    return apiService.get('/dashboard/inventory', this.buildParams(filters));
  }

  async getProcurement(): Promise<{ success: boolean; data: PurchaseOrderSummary }> {
    return apiService.get('/dashboard/procurement/summary');
  }

  async getSales(): Promise<{ success: boolean; data: SalesOrderSummary }> {
    return apiService.get('/dashboard/sales/summary');
  }

  async getSchedule(): Promise<{ success: boolean; data: DashboardScheduleItem[] }> {
    return apiService.get('/dashboard/schedule');
  }

  async getCalendarActivity(year?: number, month?: number, divisionId?: string): Promise<{ success: boolean; data: CalendarActivityDay[] }> {
    const params: Record<string, string> = {};
    if (year) params.year = String(year);
    if (month) params.month = String(month);
    if (divisionId) params.divisionId = divisionId;
    return apiService.get('/dashboard/calendar-activity', params);
  }

  async getAlerts(filters?: DashboardFilters): Promise<{ success: boolean; data: AlertItem[] }> {
    return apiService.get('/dashboard/alerts', this.buildParams(filters));
  }

  async getActivity(limit: number = 15): Promise<{ success: boolean; data: ActivityItem[] }> {
    return apiService.get('/dashboard/activity', { limit: String(limit) });
  }

  async getFilterDivisions(): Promise<{ success: boolean; data: FilterOption[] }> {
    return apiService.get('/dashboard/divisions');
  }

  async getFilterSections(divisionId?: string): Promise<{ success: boolean; data: FilterOption[] }> {
    return apiService.get('/dashboard/sections', divisionId ? { divisionId } : {});
  }

  async getFilterDepartments(divisionId?: string, sectionId?: string): Promise<{ success: boolean; data: FilterOption[] }> {
    const params: Record<string, string> = {};
    if (divisionId) params.divisionId = divisionId;
    if (sectionId) params.sectionId = sectionId;
    return apiService.get('/dashboard/departments', params);
  }

  async getFilterShifts(): Promise<{ success: boolean; data: FilterOption[] }> {
    return apiService.get('/dashboard/shifts');
  }

  async getDepartmentProductionLedger(params?: {
    departmentId?: string;
    divisionId?: string;
    dateFrom?: string;
    dateTo?: string;
  }): Promise<{ success: boolean; data: DepartmentLedgerData }> {
    return apiService.get('/dashboard/department-ledger', params);
  }
}

export interface DepartmentLedgerTicket {
  id: string;
  entryNumber: string;
  itemCode: string;
  itemName: string;
  shiftName: string;
  machineNo: string;
  operatorName: string;
  quantityPcs: number;
  quantityKg: number;
  scrapPcs: number;
  scrapKg: number;
  overtimeHours: number;
  remarks: string;
  nextProcess?: string;
}

export interface DepartmentLedgerTransaction {
  date: string;
  sourceDepartment: string;
  targetDepartment: string;
  inflowPcs: number;
  inflowKg: number;
  outflowPcs: number;
  outflowKg: number;
  toSwagingPcs?: number;
  toSwagingKg?: number;
  directToSpokePcs?: number;
  directToSpokeKg?: number;
  scrapPcs: number;
  scrapKg: number;
  runningFloorBalancePcs: number;
  runningFloorBalanceKg: number;
  entryCount: number;
  overtimeHours: number;
  tickets: DepartmentLedgerTicket[];
}

export interface DepartmentLedgerStage {
  key: string;
  code: string;
  name: string;
  departmentId: string;
  active: boolean;
}

export interface DepartmentLedgerData {
  department: {
    id: string;
    code: string;
    name: string;
    sourceDepartment: string;
    targetDepartment: string;
  };
  summary: {
    openingBalancePcs: number;
    openingBalanceKg: number;
    totalInflowPcs: number;
    totalInflowKg: number;
    totalOutflowPcs: number;
    totalOutflowKg: number;
    totalScrapPcs: number;
    totalScrapKg: number;
    currentFloorBalancePcs: number;
    currentFloorBalanceKg: number;
    totalTransactions: number;
  };
  stages: DepartmentLedgerStage[];
  allDepartments: Array<{
    id: string;
    code: string;
    name: string;
    divisionId?: string;
  }>;
  transactions: DepartmentLedgerTransaction[];
}

export const dashboardService = new DashboardService();
export default dashboardService;

