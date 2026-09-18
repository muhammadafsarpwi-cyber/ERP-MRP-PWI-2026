import apiService from './api';

export interface CachedDivision {
  id: string;
  name: string;
  divisionCode: string;
  code?: string;
  status?: string;
}

export interface CachedSection {
  id: string;
  name: string;
  sectionCode: string;
  code?: string;
  divisionId: string;
  status?: string;
}

export interface CachedDepartment {
  id: string;
  name: string;
  departmentCode: string;
  code?: string;
  divisionId: string | null;
  sectionId: string | null;
  status?: string;
}

export interface CachedShift {
  id: string;
  name: string;
  shiftCode: string;
  code?: string;
  startTime: string | null;
  endTime: string | null;
  plannedHours: number;
}

export interface CachedMachine {
  id: string;
  name: string;
  machineCode: string;
  code?: string;
  departmentId: string | null;
  department?: { name: string } | null;
  status?: string;
}

export interface CachedUom {
  id: string;
  name: string;
  code: string;
  symbol: string;
  uomType: string;
}

export interface CachedUomConversion {
  id: string;
  fromUomId: string;
  toUomId: string;
  conversionFactor: string | number;
  status: string;
}

export interface CachedItem {
  id: string;
  name: string;
  itemCode: string;
  code?: string;
  baseUomId?: string;
  baseUom?: { code: string; symbol?: string };
  itemType?: string;
  materialRoleUsage?: string;
  isManufacturable?: boolean;
  status?: string;
  departmentId?: string | null;
  departmentName?: string | null;
  sectionId?: string | null;
  sectionName?: string | null;
  divisionId?: string | null;
  divisionName?: string | null;
  categoryId?: string | null;
  categoryName?: string | null;
  wireSizeMm?: number | null;
  weightPerPiece?: number | null;
  piecesPerKg?: number | null;
  weightPerMeter?: number | null;
  lengthPerPiece?: number | null;
  productionInItemId?: string | null;
  productionOutItemId?: string | null;
  productionInItem?: any;
  productionOutItem?: any;
}

export interface CachedEmployee {
  id: string;
  employeeCode: string;
  firstName: string;
  lastName: string | null;
  departmentId: string | null;
  departmentName?: string | null;
  jobTitle: string | null;
  status: string;
}

export interface CachedProductionOrder {
  id: string;
  orderNumber: string;
  productId: string;
  uomId: string;
  status: string;
  item?: { name?: string; itemCode?: string } | null;
  product?: { name?: string; itemCode?: string } | null;
}

export interface LookupsSnapshot {
  divisions: CachedDivision[];
  sections: CachedSection[];
  departments: CachedDepartment[];
  shifts: CachedShift[];
  machines: CachedMachine[];
  uoms: CachedUom[];
  uomConversions: CachedUomConversion[];
  items: CachedItem[];
  employees: CachedEmployee[];
  productionOrders: CachedProductionOrder[];
  downtimeReasons: Array<{ id: string; name: string; code: string }>;
  deptItemsMap: Record<string, CachedItem[]>;
  timestamp: number;
}

const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes TTL for in-memory cache
const STORAGE_KEY = 'erp_lookups_cache_v2027';

let memoryCache: LookupsSnapshot | null = null;
let activePrefetchPromise: Promise<LookupsSnapshot> | null = null;
const listeners = new Set<(snap: LookupsSnapshot) => void>();

function safeLoadStorage(): LookupsSnapshot | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && Array.isArray(parsed.divisions)) {
      return parsed;
    }
  } catch {}
  return null;
}

function safeSaveStorage(snap: LookupsSnapshot) {
  try {
    // Only store lightweight collections to avoid exceeding quota
    const lightweight = {
      ...snap,
      items: (snap.items || []).slice(0, 1000), // top 1000 items in local storage
      timestamp: Date.now(),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(lightweight));
  } catch {}
}

async function fetchList<T>(url: string, params?: Record<string, unknown>, config?: { silent?: boolean }): Promise<T[]> {
  try {
    const res = await apiService.get<any>(url, params, { silent: true, ...config });
    if (Array.isArray(res)) return res as T[];
    if (Array.isArray(res?.data)) return res.data as T[];
    return [];
  } catch {
    return [];
  }
}

/**
 * Returns instant synchronous snapshot from memory or localStorage.
 * Guaranteed 0ms response time.
 */
export function getLookupsSnapshot(): LookupsSnapshot {
  if (memoryCache) return memoryCache;
  const fromStorage = safeLoadStorage();
  if (fromStorage) {
    memoryCache = fromStorage;
    return fromStorage;
  }
  return {
    divisions: [],
    sections: [],
    departments: [],
    shifts: [],
    machines: [],
    uoms: [],
    uomConversions: [],
    items: [],
    employees: [],
    productionOrders: [],
    downtimeReasons: [],
    deptItemsMap: {},
    timestamp: 0,
  };
}

/**
 * Simultaneously prefetches all master lookup datasets in parallel using Promise.all.
 * Never blocks the UI. Updates memoryCache and notifies all subscribers.
 */
export async function prefetchAllLookups(forceRefresh = false): Promise<LookupsSnapshot> {
  const current = getLookupsSnapshot();
  const isFresh = current.timestamp > 0 && (Date.now() - current.timestamp < CACHE_TTL_MS);
  if (!forceRefresh && isFresh && current.divisions.length > 0) {
    return current;
  }

  if (activePrefetchPromise) {
    return activePrefetchPromise;
  }

  activePrefetchPromise = (async () => {
    try {
      // Parallel execution of all lookup calls with silent background requests
      const [
        divisions,
        sections,
        departments,
        shifts,
        machines,
        uoms,
        conversions,
        items,
        productionOrders,
        downtimeReasons,
      ] = await Promise.all([
        fetchList<CachedDivision>('/divisions', { limit: 200 }),
        fetchList<CachedSection>('/sections', { limit: 500 }),
        fetchList<CachedDepartment>('/departments', { limit: 500 }),
        fetchList<CachedShift>('/production/shifts'),
        fetchList<CachedMachine>('/production/machines', { limit: 500 }),
        fetchList<CachedUom>('/master-data/uom', { limit: 200 }),
        fetchList<CachedUomConversion>('/master-data/uom-conversions', { limit: 500 }),
        fetchList<CachedItem>('/master-data/items', { limit: 1000, status: 'ACTIVE' }),
        fetchList<CachedProductionOrder>('/production/orders', { limit: 200 }),
        fetchList<any>('/production/downtime-reasons', { limit: 100 }).catch(() => []),
      ]);

      // Employee lookup (directly query active employees)
      const employees = await fetchList<CachedEmployee>('/hr/employees', { limit: 500, status: 'ACTIVE' }).catch(() => []);

      const validDepartments = departments.filter((d) => d.divisionId && d.sectionId);
      const activeConversions = conversions.filter((c) => c.status === 'ACTIVE');

      const updatedSnapshot: LookupsSnapshot = {
        divisions: divisions.length > 0 ? divisions : current.divisions,
        sections: sections.length > 0 ? sections : current.sections,
        departments: validDepartments.length > 0 ? validDepartments : current.departments,
        shifts: shifts.length > 0 ? shifts : current.shifts,
        machines: machines.length > 0 ? machines : current.machines,
        uoms: uoms.length > 0 ? uoms : current.uoms,
        uomConversions: activeConversions.length > 0 ? activeConversions : current.uomConversions,
        items: items.length > 0 ? items : current.items,
        employees: employees.length > 0 ? employees : current.employees,
        productionOrders: productionOrders.length > 0 ? productionOrders : current.productionOrders,
        downtimeReasons: downtimeReasons.length > 0 ? downtimeReasons : current.downtimeReasons,
        deptItemsMap: current.deptItemsMap || {},
        timestamp: Date.now(),
      };

      memoryCache = updatedSnapshot;
      safeSaveStorage(updatedSnapshot);

      listeners.forEach((cb) => {
        try { cb(updatedSnapshot); } catch {}
      });

      return updatedSnapshot;
    } finally {
      activePrefetchPromise = null;
    }
  })();

  return activePrefetchPromise;
}

export function subscribeLookups(callback: (snap: LookupsSnapshot) => void): () => void {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

export function cacheDepartmentItems(deptId: string, items: CachedItem[]) {
  if (!deptId || !Array.isArray(items)) return;
  const current = getLookupsSnapshot();
  const nextMap = { ...current.deptItemsMap, [deptId]: items };
  memoryCache = { ...current, deptItemsMap: nextMap };
}

export function getCachedDepartmentItems(deptId: string): CachedItem[] | undefined {
  const current = getLookupsSnapshot();
  return current.deptItemsMap[deptId];
}
