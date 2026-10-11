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
  productionInItemId2?: string | null;
  productionOutItemId?: string | null;
  productionInItem?: any;
  productionInItem2?: any;
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

export interface CachedWarehouse {
  id: string;
  name: string;
  warehouseCode: string;
  warehouseType?: string;
  divisionId?: string | null;
  departmentId?: string | null;
  department?: { id: string; name: string; departmentCode?: string } | null;
  status?: string;
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
  warehouses: CachedWarehouse[];
  deptItemsMap: Record<string, CachedItem[]>;
  timestamp: number;
}

export const CANONICAL_PRODUCTION_DIVISIONS: CachedDivision[] = [
  { id: 'd1000000-0000-0000-0000-000000000001', name: 'Spoke Division (DIV-SPD)', divisionCode: 'DIV-SPD' },
  { id: 'd1000000-0000-0000-0000-000000000002', name: 'Control Cable Division (DIV-CCD)', divisionCode: 'DIV-CCD' },
  { id: '83ecd746-1cc9-4849-bec4-d00bcc3ceeec', name: 'Main Division E-51 (DIV-PWI)', divisionCode: 'DIV-PWI' },
  { id: '0653339b-94d0-4cc5-b880-e07908b2015f', name: 'NB Division (DIV-NB)', divisionCode: 'DIV-NB' },
];

export const FALLBACK_WAREHOUSES: CachedWarehouse[] = [
  // Spoke Division Warehouses
  { id: '2ec20775-616c-4c6e-818e-1f76912d6dfa', warehouseCode: 'SPI-ST-001', name: 'ST Production Department', warehouseType: 'WORK_IN_PROGRESS', divisionId: 'd1000000-0000-0000-0000-000000000001', departmentId: 'd3000000-0000-0000-0000-000000000001' },
  { id: 'd5685ddf-923a-4f7c-ba19-a5715cafa02e', warehouseCode: 'SPI-SW-002', name: 'SW Production Department', warehouseType: 'WORK_IN_PROGRESS', divisionId: 'd1000000-0000-0000-0000-000000000001', departmentId: 'd3000000-0000-0000-0000-000000000002' },
  { id: 'a70e0a7e-2ffa-47e4-83a9-c894d9dff41b', warehouseCode: 'SPI-PL-004', name: 'PL Production Department', warehouseType: 'WORK_IN_PROGRESS', divisionId: 'd1000000-0000-0000-0000-000000000001', departmentId: 'd3000000-0000-0000-0000-000000000006' },
  { id: 'a4c9ee6c-938f-4c34-b293-6686cfc3add3', warehouseCode: 'SPI002ST', name: 'SPI Warehouse', warehouseType: 'RAW_MATERIAL', divisionId: 'd1000000-0000-0000-0000-000000000001' },
  { id: 'cf5c9db8-5e84-41d5-a4b4-988b8dfd122d', warehouseCode: 'WH-002', name: 'SPI Main Warehouse', warehouseType: 'FINISHED_GOODS', divisionId: 'd1000000-0000-0000-0000-000000000001' },
  { id: '29e71f41-713e-45dc-bd69-4a3ce05a3801', warehouseCode: 'SPI-SP-003', name: 'SPK Production Department', warehouseType: 'WORK_IN_PROGRESS', divisionId: 'd1000000-0000-0000-0000-000000000001', departmentId: 'd3000000-0000-0000-0000-000000000003' },
  { id: '2f6aabde-69c1-4068-a0ea-b0fe1b8fb0b5', warehouseCode: 'SPI-FGDW-001', name: 'SPI FG Dispatch Warehouse', warehouseType: 'FINISHED_GOODS', divisionId: 'd1000000-0000-0000-0000-000000000001', departmentId: 'd3000000-0000-0000-0000-000000000008' },
  // Control Cable Division Warehouses
  { id: '64a9a1b1-dee5-4da4-ab3e-ae68d04999a7', warehouseCode: 'CCD-FT-001', name: 'FT Production Department', warehouseType: 'WORK_IN_PROGRESS', divisionId: 'd1000000-0000-0000-0000-000000000002', departmentId: 'd3000000-0000-0000-0000-000000000010' },
  { id: 'dc212cb0-364c-47ba-88db-1bde18f842de', warehouseCode: 'CCD-SP-002', name: 'SP Production Department', warehouseType: 'WORK_IN_PROGRESS', divisionId: 'd1000000-0000-0000-0000-000000000002', departmentId: 'd3000000-0000-0000-0000-000000000011' },
  { id: '37dac1e5-a0b9-479a-b63e-3849a0dd0dd8', warehouseCode: 'CCD-PVC-003', name: 'PVC Production Department', warehouseType: 'WORK_IN_PROGRESS', divisionId: 'd1000000-0000-0000-0000-000000000002', departmentId: 'd3000000-0000-0000-0000-000000000012' },
  { id: '45de05e2-d7d0-45d1-936f-425e317362db', warehouseCode: 'CCD002ST', name: 'CCD Warehouse', warehouseType: 'RAW_MATERIAL', divisionId: 'd1000000-0000-0000-0000-000000000002' },
  { id: 'c7735271-bc28-48ce-8f17-bf6241eb6b5a', warehouseCode: 'WH-001', name: 'CCD Main Warehouse', warehouseType: 'FINISHED_GOODS', divisionId: 'd1000000-0000-0000-0000-000000000002' },
  // Main Division
  { id: 'aa9fedcb-27ac-47d2-a963-40d01c2594bc', warehouseCode: 'WH-MAIN-001', name: 'Main Warehouse', warehouseType: 'GENERAL', divisionId: '83ecd746-1cc9-4849-bec4-d00bcc3ceeec' },
];

/** Strict filter for the 4 manufacturing divisions (Spoke, Control Cable, Main E-51, NB) */
export function isProductionDivision(div: { name?: string; divisionCode?: string; code?: string; id?: string }): boolean {
  if (!div) return false;
  const code = (div.divisionCode || div.code || '').toUpperCase().trim();
  const name = (div.name || '').toUpperCase().trim();

  if (code === 'DIV-SPD' || code === 'DIV-CCD' || code === 'DIV-PWI' || code === 'DIV-NB') return true;
  if (div.id === 'd1000000-0000-0000-0000-000000000001' || div.id === 'd1000000-0000-0000-0000-000000000002') return true;
  if (name.includes('SPOKE') || name.includes('CONTROL CABLE') || name.includes('MAIN DIVISION') || name.includes('NB DIVISION')) {
    if (name.includes('FINANCE') || name.includes('QUALITY') || name.includes('SALES') || name.includes('SUPPLY') || name.includes('ADMIN') || name.includes('MANUFACTURING DIVISION')) {
      return false;
    }
    return true;
  }
  return false;
}

const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes TTL for in-memory cache
const STORAGE_KEY = 'erp_lookups_cache_v2027_p4';

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
    if (Array.isArray(res?.items)) return res.items as T[];
    if (Array.isArray(res?.data?.items)) return res.data.items as T[];
    if (Array.isArray(res?.warehouses)) return res.warehouses as T[];
    if (Array.isArray(res?.data?.data)) return res.data.data as T[];
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
    // Ensure divisions are filtered to 4 production divisions
    fromStorage.divisions = fromStorage.divisions.filter(isProductionDivision);
    if (fromStorage.divisions.length === 0) fromStorage.divisions = CANONICAL_PRODUCTION_DIVISIONS;
    if (!fromStorage.warehouses || fromStorage.warehouses.length === 0) fromStorage.warehouses = FALLBACK_WAREHOUSES;
    memoryCache = fromStorage;
    return fromStorage;
  }
  return {
    divisions: CANONICAL_PRODUCTION_DIVISIONS,
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
    warehouses: FALLBACK_WAREHOUSES,
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
        rawDivisions,
        sections,
        departments,
        shifts,
        machines,
        uoms,
        conversions,
        items,
        productionOrders,
        downtimeReasons,
        rawWarehouses,
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
        fetchList<CachedWarehouse>('/warehouses', { limit: 100 }).catch(() => []),
      ]);

      // Employee lookup (directly query active employees)
      const employees = await fetchList<CachedEmployee>('/hr/employees', { limit: 500, status: 'ACTIVE' }).catch(() => []);

      // Strictly filter divisions to the 4 manufacturing divisions
      const prodDivisions = rawDivisions.filter(isProductionDivision);
      const divisions = prodDivisions.length > 0 ? prodDivisions : CANONICAL_PRODUCTION_DIVISIONS;

      const validDepartments = departments.filter((d) => d.divisionId && d.sectionId);
      const activeConversions = conversions.filter((c) => c.status === 'ACTIVE');
      const warehouses = rawWarehouses.length > 0 ? rawWarehouses : FALLBACK_WAREHOUSES;

      const updatedSnapshot: LookupsSnapshot = {
        divisions,
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
        warehouses,
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

/**
 * Evict EVERY cached lookup (memory tier + localStorage tier) and re-seed from
 * the canonical/division-agnostic defaults.
 *
 * Called by the division context selector. The lookups snapshot is global and
 * division-unscoped: it holds warehouses, sections and departments from ALL
 * divisions. Leaving it in place when the user switches scope is exactly how a
 * Spoke (SPD) view kept resolving Control Cable (CCD) warehouses such as
 * CCD-SP-002 — the ids were still sitting in the previous snapshot.
 */
export function invalidateLookupsCache(): void {
  memoryCache = null;
  activePrefetchPromise = null;
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    /* private mode / disabled storage — memory tier already cleared */
  }
  // Drop the department→items sub-map too: it is keyed by department id and
  // carries the previous scope's item lists.
  const seeded = getLookupsSnapshot();
  memoryCache = { ...seeded, deptItemsMap: {} };
  listeners.forEach((cb) => {
    try { cb(memoryCache!); } catch {}
  });
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
