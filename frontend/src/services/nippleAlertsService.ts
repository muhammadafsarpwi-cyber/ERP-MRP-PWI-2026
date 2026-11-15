import apiService from './api';

export interface NippleImportAlert {
  itemId: string;
  itemCode: string;
  itemName: string;
  coverageMonths: number;
  projectedStockoutDate: string | null;
  orderTodayQty: number;
  openPoQty: number;
  currentUnpackedNippleStock: number;
  remainingToPack: number;
  effectiveMonthlyUsage: number;
  importLeadTimeMonths: number;
  safetyBufferMonths: number;
  usageSource: 'AUTO' | 'MANUAL';
  reorderAlertStatus: 'ORDER_TODAY' | 'COVERED';
}

export interface NipplePlanningConfigPayload {
  manualMonthlyUsageGrs?: number | null;
  importLeadTimeMonths?: number;
  safetyBufferMonths?: number;
}

export async function fetchNippleImportAlerts(): Promise<NippleImportAlert[]> {
  try {
    const res = await apiService.get<{ success?: boolean; data?: NippleImportAlert[] }>(
      '/sales/analytics/nipple-import-alerts',
      undefined,
      { silent: true },
    );
    return Array.isArray(res?.data) ? res.data : [];
  } catch {
    return [];
  }
}

export async function updateNipplePlanningConfig(
  itemId: string,
  payload: NipplePlanningConfigPayload,
): Promise<any> {
  const res = await apiService.patch<{ success?: boolean; data?: any }>(
    `/sales/analytics/nipple-planning-config/${itemId}`,
    payload,
  );
  return res?.data;
}
