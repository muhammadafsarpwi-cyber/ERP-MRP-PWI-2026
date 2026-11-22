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

const ALERTS_TTL_MS = 60_000;
let cachedAlerts: NippleImportAlert[] | null = null;
let cachedAlertsAt = 0;
let inFlightAlertsPromise: Promise<NippleImportAlert[]> | null = null;

export async function fetchNippleImportAlerts(force = false): Promise<NippleImportAlert[]> {
  const now = Date.now();
  if (!force && cachedAlerts && now - cachedAlertsAt < ALERTS_TTL_MS) {
    return cachedAlerts;
  }
  if (inFlightAlertsPromise) {
    return inFlightAlertsPromise;
  }

  inFlightAlertsPromise = (async () => {
    try {
      const res = await apiService.get<{ success?: boolean; data?: NippleImportAlert[] }>(
        '/sales/analytics/nipple-import-alerts',
        undefined,
        { silent: true, useEtag: true },
      );
      const list = Array.isArray(res?.data) ? res.data : [];
      cachedAlerts = list;
      cachedAlertsAt = Date.now();
      return list;
    } catch {
      return cachedAlerts || [];
    } finally {
      inFlightAlertsPromise = null;
    }
  })();

  return inFlightAlertsPromise;
}

export function invalidateNippleAlertsCache(): void {
  cachedAlertsAt = 0;
}

export async function updateNipplePlanningConfig(
  itemId: string,
  payload: NipplePlanningConfigPayload,
): Promise<any> {
  const res = await apiService.patch<{ success?: boolean; data?: any }>(
    `/sales/analytics/nipple-planning-config/${itemId}`,
    payload,
  );
  cachedAlertsAt = 0;
  return res?.data;
}
