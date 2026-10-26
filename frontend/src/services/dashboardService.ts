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
    try {
      return await apiService.get('/dashboard/department-ledger', params);
    } catch (err: any) {
      if (err?.response?.status === 404) {
        return this.buildFallbackDepartmentLedger(params);
      }
      throw err;
    }
  }

  private async buildFallbackDepartmentLedger(params?: {
    departmentId?: string;
    divisionId?: string;
    dateFrom?: string;
    dateTo?: string;
  }): Promise<{ success: boolean; data: DepartmentLedgerData }> {
    const SPOKE_STAGES = [
      { key: 'rm-store', code: 'RM-STORE', name: 'Raw Material Stores (RM Wire Coil)', stageOrder: 1, prevCode: 'SUPPLIER-IN', prevName: 'Vendor / Mill Wire Coil Receipt', nextCode: 'SPD-DEPT001', nextName: '2. Straightener' },
      { key: 'straightener', code: 'SPD-DEPT001', name: 'Straightener', stageOrder: 2, prevCode: 'RM-STORE', prevName: '1. Raw Material Stores (RM Wire Coil)', nextCode: 'SPD-DEPT002', nextName: 'Swaging / Spoke Heading (Dynamic Route)' },
      { key: 'swaging', code: 'SPD-DEPT002', name: 'Swagging', stageOrder: 3, prevCode: 'SPD-DEPT001', prevName: 'Straightener (Swaged Route Only)', nextCode: 'SPD-DEPT003', nextName: 'Spoke Heading' },
      { key: 'spoke', code: 'SPD-DEPT003', name: 'Spoke', stageOrder: 4, prevCode: 'SPD-DEPT002', prevName: 'Swaging + Direct Straightener Bypass', nextCode: 'SPD-DEPT006', nextName: 'Spoke Plating' },
      { key: 'plating', code: 'SPD-DEPT006', name: 'Spoke Plating', stageOrder: 5, prevCode: 'SPD-DEPT003', prevName: 'Spoke Heading', nextCode: 'SPD-DEPT008', nextName: 'Spoke Packing' },
      { key: 'packing', code: 'SPD-DEPT008', name: 'Spoke Packing', stageOrder: 6, prevCode: 'SPD-DEPT006', prevName: 'Spoke Plating', nextCode: 'FG-DISPATCH', nextName: 'Dispatch / FG Logistics' },
      { key: 'dispatch', code: 'FG-DISPATCH', name: 'Dispatch / FG Logistics', stageOrder: 7, prevCode: 'SPD-DEPT008', prevName: 'Spoke Packing', nextCode: 'CUSTOMER-GATE', nextName: 'Customer Gate / Sales Dispatch' },
    ];

    const CONTROL_CABLE_STAGES = [
      { key: 'rm-store-ccd', code: 'RM-STORE', name: 'Raw Material Stores (RM Wire Coil)', stageOrder: 1, prevCode: 'SUPPLIER-IN', prevName: 'Vendor / Wire Rod Receipt', nextCode: 'CCD-DEPT001', nextName: 'Flattening' },
      { key: 'flattening', code: 'CCD-DEPT001', name: 'Flattening', stageOrder: 2, prevCode: 'RM-STORE', prevName: 'Raw Material Stores (RM Wire Coil)', nextCode: 'CCD-DEPT002', nextName: 'Spiral' },
      { key: 'spiral', code: 'CCD-DEPT002', name: 'Spiral', stageOrder: 3, prevCode: 'CCD-DEPT001', prevName: 'Flattening', nextCode: 'CCD-DEPT003', nextName: 'PVC Coating' },
      { key: 'pvc', code: 'CCD-DEPT003', name: 'PVC Coating', stageOrder: 4, prevCode: 'CCD-DEPT002', prevName: 'Spiral', nextCode: 'CCD-DEPT004', nextName: 'Assembly' },
      { key: 'assembly', code: 'CCD-DEPT004', name: 'Assembly', stageOrder: 5, prevCode: 'CCD-DEPT003', prevName: 'PVC Coating', nextCode: 'CCD-DEPT005', nextName: 'Packing' },
      { key: 'packing', code: 'CCD-DEPT005', name: 'Packing', stageOrder: 6, prevCode: 'CCD-DEPT004', prevName: 'Assembly', nextCode: 'FG-DISPATCH', nextName: 'Dispatch / FG Logistics' },
      { key: 'dispatch-ccd', code: 'FG-DISPATCH', name: 'Dispatch / FG Logistics', stageOrder: 7, prevCode: 'CCD-DEPT005', prevName: 'Packing', nextCode: 'CUSTOMER-GATE', nextName: 'Customer Gate / Sales Dispatch' },
    ];

    const [deptsRes, entriesRes] = await Promise.allSettled([
      this.getFilterDepartments(params?.divisionId),
      apiService.get('/production/entries', {
        limit: '5000',
        ...(params?.divisionId ? { divisionId: params.divisionId } : {}),
      }),
    ]);

    const rawDepts: any[] =
      deptsRes.status === 'fulfilled' && Array.isArray(deptsRes.value?.data) ? deptsRes.value.data : [];
    const entries: any[] =
      entriesRes.status === 'fulfilled'
        ? Array.isArray((entriesRes.value as any)?.data)
          ? (entriesRes.value as any).data
          : Array.isArray((entriesRes.value as any)?.items)
            ? (entriesRes.value as any).items
            : []
        : [];

    const isControlCableDiv = params?.divisionId === 'd1000000-0000-0000-0000-000000000002';
    const activeStageCatalog = isControlCableDiv ? CONTROL_CABLE_STAGES : SPOKE_STAGES;

    const resolveDeptCode = (d: any): string => {
      const code = (d?.departmentCode || d?.code || '').trim();
      if (code) return code;
      const n = (d?.name || '').toLowerCase();
      if (n.includes('straight')) return 'SPD-DEPT001';
      if (n.includes('swag')) return 'SPD-DEPT002';
      if (n.includes('spoke plat') || n === 'plating') return 'SPD-DEPT006';
      if (n.includes('spoke pack') || n.includes('hand pack')) return 'SPD-DEPT008';
      if (n.includes('spoke')) return 'SPD-DEPT003';
      if (n.includes('flatten')) return 'CCD-DEPT001';
      if (n.includes('spiral')) return 'CCD-DEPT002';
      if (n.includes('pvc')) return 'CCD-DEPT003';
      if (n.includes('assembl')) return 'CCD-DEPT004';
      if (n.includes('pack')) return 'CCD-DEPT005';
      return d?.id || 'SPD-DEPT001';
    };

    const allDepts = rawDepts
      .filter((d) => (!d.status || String(d.status).toUpperCase() === 'ACTIVE') && d.isActive !== false && d.is_active !== false)
      .map((d) => ({
        id: d.id,
        code: resolveDeptCode(d),
        name: d.name,
        divisionId: d.divisionId || params?.divisionId || 'd1000000-0000-0000-0000-000000000001',
      }));

    const reqDept = params?.departmentId || 'SPD-DEPT001';
    const isAnchorCode = reqDept === 'RM-STORE' || reqDept === 'FG-DISPATCH';

    let targetDept: { id: string; code: string; name: string; divisionId?: string } | undefined;
    if (isAnchorCode) {
      const anchor = activeStageCatalog.find((s) => s.code === reqDept)!;
      targetDept = {
        id: anchor.code,
        code: anchor.code,
        name: anchor.name,
        divisionId: params?.divisionId || 'd1000000-0000-0000-0000-000000000001',
      };
    } else {
      targetDept = allDepts.find((d) => d.id === reqDept || d.code === reqDept);
      if (!targetDept) {
        const stageMatch = activeStageCatalog.find((s) => s.code === reqDept || s.key === reqDept);
        if (stageMatch) {
          const dbMatch = allDepts.find((d) => d.code === stageMatch.code);
          targetDept = dbMatch || {
            id: stageMatch.code,
            code: stageMatch.code,
            name: stageMatch.name,
            divisionId: params?.divisionId || 'd1000000-0000-0000-0000-000000000001',
          };
        } else {
          targetDept = allDepts[0] || {
            id: 'SPD-DEPT001',
            code: 'SPD-DEPT001',
            name: 'Straightener',
            divisionId: 'd1000000-0000-0000-0000-000000000001',
          };
        }
      }
    }

    const currentStageInfo = activeStageCatalog.find((s) => s.code === targetDept?.code);
    const sourceDeptName = currentStageInfo ? currentStageInfo.prevName : 'Preceding Process / Stores';
    const targetDeptName = currentStageInfo ? currentStageInfo.nextName : 'Next Sequential Process / Warehouse';

    const doesItemRequireSwaging = (item: any): boolean => {
      const p2 = String(item?.process2 || item?.process_2 || '').toLowerCase().trim();
      const p3 = String(item?.process3 || item?.process_3 || '').toLowerCase().trim();
      const nameAndCode = `${item?.itemCode || ''} ${item?.name || ''}`.toLowerCase();
      if (p3 === 'spoke' || p2 === 'spoke' || nameAndCode.includes('straight')) return false;
      if (p3.includes('swag') || p2.includes('swag') || nameAndCode.includes('butted') || nameAndCode.includes('swag')) return true;
      return false;
    };

    interface DayBucket {
      outQty: number;
      outWeightKg: number;
      toSwagingQty: number;
      toSwagingKg: number;
      directToSpokeQty: number;
      directToSpokeKg: number;
      scrapQty: number;
      scrapWeightKg: number;
      entryCount: number;
      otHours: number;
    }
    const emptyBucket = (): DayBucket => ({
      outQty: 0,
      outWeightKg: 0,
      toSwagingQty: 0,
      toSwagingKg: 0,
      directToSpokeQty: 0,
      directToSpokeKg: 0,
      scrapQty: 0,
      scrapWeightKg: 0,
      entryCount: 0,
      otHours: 0,
    });

    const dailyByDate: Record<string, Record<string, DayBucket>> = {};
    const ticketsByDate: Record<string, DepartmentLedgerTicket[]> = {};

    for (const e of entries) {
      const dt = String(e.entryDate || '').slice(0, 10);
      if (!dt) continue;
      const dCode = resolveDeptCode(e.department || { id: e.departmentId, name: e.departmentName });
      if (!dailyByDate[dt]) dailyByDate[dt] = {};
      if (!dailyByDate[dt][dCode]) dailyByDate[dt][dCode] = emptyBucket();

      const unitWt = e.item?.weightPerPiece
        ? Number(e.item.weightPerPiece)
        : e.item?.piecesPerKg && Number(e.item.piecesPerKg) > 0
          ? 1.0 / Number(e.item.piecesPerKg)
          : 0.008;
      const outQty = Number(e.actualQuantity) || 0;
      const outWeightKg = outQty * unitWt;
      const partRejectKg = Number(e.scrapQuantity) || 0;
      const procScrapKg = Number(e.processScrapKg) || 0;
      const calcScrapKg = partRejectKg + procScrapKg;
      const calcScrapPcs = unitWt > 0 ? Math.round(calcScrapKg / unitWt) : 0;

      const b = dailyByDate[dt][dCode];
      b.outQty += outQty;
      b.outWeightKg += outWeightKg;
      b.scrapQty += calcScrapPcs;
      b.scrapWeightKg += calcScrapKg;
      b.entryCount += 1;
      b.otHours += Number(e.overtimeHours) || 0;

      const reqSwag = doesItemRequireSwaging(e.item);
      if (dCode === 'SPD-DEPT001') {
        if (reqSwag) {
          b.toSwagingQty += outQty;
          b.toSwagingKg += outWeightKg;
        } else {
          b.directToSpokeQty += outQty;
          b.directToSpokeKg += outWeightKg;
        }
      }

      if (!isAnchorCode && dCode === targetDept?.code) {
        if (!ticketsByDate[dt]) ticketsByDate[dt] = [];
        ticketsByDate[dt].push({
          id: e.id,
          entryNumber: e.entryNumber || 'N/A',
          itemCode: e.item?.itemCode || 'N/A',
          itemName: e.item?.name || 'N/A',
          shiftName: e.shift?.name || 'General',
          machineNo: e.machineNo || e.machine?.machineCode || 'N/A',
          operatorName: e.operatorName || 'N/A',
          quantityPcs: outQty,
          quantityKg: Number(outWeightKg.toFixed(2)),
          scrapPcs: calcScrapPcs,
          scrapKg: Number(calcScrapKg.toFixed(3)),
          overtimeHours: Number(e.overtimeHours) || 0,
          remarks: e.remarks || '',
          nextProcess:
            dCode === 'SPD-DEPT001'
              ? reqSwag
                ? '3. Swaging (Butted Route)'
                : '4. Spoke (Header) [Direct]'
              : targetDeptName,
        });
      }
    }

    const allDates = Object.keys(dailyByDate).sort();
    let cumulativeFloorBalPcs = 0;
    let cumulativeFloorBalKg = 0;
    let openingBalancePcs = 0;
    let openingBalanceKg = 0;
    let totalInflowPcs = 0;
    let totalInflowKg = 0;
    let totalOutflowPcs = 0;
    let totalOutflowKg = 0;
    let totalScrapPcs = 0;
    let totalScrapKg = 0;

    const targetCode = targetDept?.code || 'SPD-DEPT001';
    const transactions: DepartmentLedgerTransaction[] = [];

    for (const dt of allDates) {
      const isBeforeDateFrom = params?.dateFrom && dt < params.dateFrom;
      const isAfterDateTo = params?.dateTo && dt > params.dateTo;

      const dayData = dailyByDate[dt] || {};
      const deptData = dayData[targetCode] || emptyBucket();

      let inflowPcs = 0;
      let inflowKg = 0;
      let outflowPcs = deptData.outQty;
      let outflowKg = deptData.outWeightKg;
      let scrapPcs = deptData.scrapQty;
      let scrapKg = deptData.scrapWeightKg;
      let rowSourceDept = sourceDeptName;
      let rowTargetDept = targetDeptName;

      const stData = dayData['SPD-DEPT001'];
      const swData = dayData['SPD-DEPT002'];
      const spData = dayData['SPD-DEPT003'];
      const plData = dayData['SPD-DEPT006'];
      const pkData = dayData['SPD-DEPT008'];

      if (targetCode === 'RM-STORE') {
        const firstStage = stData || dayData['CCD-DEPT001'];
        outflowPcs = firstStage ? firstStage.outQty + firstStage.scrapQty : 0;
        outflowKg = firstStage ? firstStage.outWeightKg + firstStage.scrapWeightKg : 0;
        inflowPcs = outflowPcs;
        inflowKg = outflowKg;
        scrapPcs = 0;
        scrapKg = 0;
        rowSourceDept = 'Vendor / Steel Wire Mill (GRN Receipt)';
        rowTargetDept = isControlCableDiv ? '2. Flattening' : '2. Straightener';
      } else if (targetCode === 'SPD-DEPT001') {
        inflowPcs = outflowPcs + scrapPcs;
        inflowKg = outflowKg + scrapKg;
        rowSourceDept = '1. Raw Material Stores (RM Wire Coil)';
        if (deptData.toSwagingQty > 0 && deptData.directToSpokeQty > 0) {
          rowTargetDept = '4. Spoke (Header) [Direct] + 3. Swaging [Butted]';
        } else if (deptData.directToSpokeQty > 0 && deptData.toSwagingQty === 0) {
          rowTargetDept = '4. Spoke (Header) [Direct — No Swaging]';
        } else if (deptData.toSwagingQty > 0) {
          rowTargetDept = '3. Swaging';
        }
      } else if (targetCode === 'SPD-DEPT002') {
        inflowPcs = stData ? stData.toSwagingQty : 0;
        inflowKg = stData ? stData.toSwagingKg : 0;
      } else if (targetCode === 'SPD-DEPT003') {
        const fromSwagPcs = swData ? swData.outQty : 0;
        const fromSwagKg = swData ? swData.outWeightKg : 0;
        const directPcs = stData ? stData.directToSpokeQty : 0;
        const directKg = stData ? stData.directToSpokeKg : 0;
        inflowPcs = fromSwagPcs + directPcs;
        inflowKg = fromSwagKg + directKg;
        if (fromSwagPcs > 0 && directPcs > 0) {
          rowSourceDept = 'Swaging + Straightener (Direct Bypass)';
        } else if (directPcs > 0) {
          rowSourceDept = 'Straightener (Direct Bypass)';
        } else if (fromSwagPcs > 0) {
          rowSourceDept = 'Swaging';
        }
      } else if (targetCode === 'SPD-DEPT006') {
        inflowPcs = spData ? spData.outQty : 0;
        inflowKg = spData ? spData.outWeightKg : 0;
      } else if (targetCode === 'SPD-DEPT008') {
        inflowPcs = plData ? plData.outQty : 0;
        inflowKg = plData ? plData.outWeightKg : 0;
      } else if (targetCode === 'FG-DISPATCH') {
        const packSource = pkData || dayData['CCD-DEPT005'];
        inflowPcs = packSource ? packSource.outQty : 0;
        inflowKg = packSource ? packSource.outWeightKg : 0;
        outflowPcs = 0;
        outflowKg = 0;
        scrapPcs = 0;
        scrapKg = 0;
      } else if (currentStageInfo?.prevCode && dayData[currentStageInfo.prevCode]) {
        const prev = dayData[currentStageInfo.prevCode];
        inflowPcs = prev.outQty;
        inflowKg = prev.outWeightKg;
      } else {
        inflowPcs = outflowPcs + scrapPcs;
        inflowKg = outflowKg + scrapKg;
      }

      cumulativeFloorBalPcs = (cumulativeFloorBalPcs + inflowPcs) - (outflowPcs + scrapPcs);
      cumulativeFloorBalKg = (cumulativeFloorBalKg + inflowKg) - (outflowKg + scrapKg);

      if (isBeforeDateFrom) {
        openingBalancePcs = cumulativeFloorBalPcs;
        openingBalanceKg = cumulativeFloorBalKg;
        continue;
      }
      if (isAfterDateTo) continue;

      if (inflowPcs > 0 || outflowPcs > 0 || scrapKg > 0 || (ticketsByDate[dt] && ticketsByDate[dt].length > 0)) {
        totalInflowPcs += inflowPcs;
        totalInflowKg += inflowKg;
        totalOutflowPcs += outflowPcs;
        totalOutflowKg += outflowKg;
        totalScrapPcs += scrapPcs;
        totalScrapKg += scrapKg;

        transactions.push({
          date: dt,
          sourceDepartment: rowSourceDept,
          targetDepartment: rowTargetDept,
          inflowPcs: Math.round(inflowPcs),
          inflowKg: Number(inflowKg.toFixed(2)),
          outflowPcs: Math.round(outflowPcs),
          outflowKg: Number(outflowKg.toFixed(2)),
          toSwagingPcs: Math.round(deptData.toSwagingQty),
          toSwagingKg: Number(deptData.toSwagingKg.toFixed(2)),
          directToSpokePcs: Math.round(deptData.directToSpokeQty),
          directToSpokeKg: Number(deptData.directToSpokeKg.toFixed(2)),
          scrapPcs: Math.round(scrapPcs),
          scrapKg: Number(scrapKg.toFixed(3)),
          runningFloorBalancePcs: Math.round(cumulativeFloorBalPcs),
          runningFloorBalanceKg: Number(cumulativeFloorBalKg.toFixed(2)),
          entryCount: deptData.entryCount,
          overtimeHours: deptData.otHours,
          tickets: ticketsByDate[dt] || [],
        });
      }
    }

    transactions.sort((a, b) => b.date.localeCompare(a.date));

    const stages: DepartmentLedgerStage[] = activeStageCatalog.map((s) => {
      const matched = allDepts.find((d) => d.code === s.code);
      return {
        key: s.key,
        code: s.code,
        name: s.name,
        departmentId: matched?.id || s.code,
        active: targetDept?.code === s.code || targetDept?.id === (matched?.id || s.code),
      };
    });

    const activeDivisionIdForAnchors = params?.divisionId || 'd1000000-0000-0000-0000-000000000001';
    const allDepartmentOptions = [
      { id: 'RM-STORE', code: 'RM-STORE', name: 'Raw Material Stores (RM Wire Coil)', divisionId: activeDivisionIdForAnchors },
      ...allDepts,
      { id: 'FG-DISPATCH', code: 'FG-DISPATCH', name: 'Dispatch / FG Logistics', divisionId: activeDivisionIdForAnchors },
    ];

    return {
      success: true,
      data: {
        department: {
          id: targetDept?.id || 'SPD-DEPT001',
          code: targetDept?.code || 'SPD-DEPT001',
          name: targetDept?.name || 'Straightener',
          sourceDepartment: sourceDeptName,
          targetDepartment: targetDeptName,
        },
        summary: {
          openingBalancePcs: Math.round(openingBalancePcs),
          openingBalanceKg: Number(openingBalanceKg.toFixed(2)),
          totalInflowPcs: Math.round(totalInflowPcs),
          totalInflowKg: Number(totalInflowKg.toFixed(2)),
          totalOutflowPcs: Math.round(totalOutflowPcs),
          totalOutflowKg: Number(totalOutflowKg.toFixed(2)),
          totalScrapPcs: Math.round(totalScrapPcs),
          totalScrapKg: Number(totalScrapKg.toFixed(2)),
          currentFloorBalancePcs: Math.round((openingBalancePcs + totalInflowPcs) - (totalOutflowPcs + totalScrapPcs)),
          currentFloorBalanceKg: Number(((openingBalanceKg + totalInflowKg) - (totalOutflowKg + totalScrapKg)).toFixed(2)),
          totalTransactions: transactions.length,
        },
        stages,
        allDepartments: allDepartmentOptions,
        transactions,
      },
    };
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

