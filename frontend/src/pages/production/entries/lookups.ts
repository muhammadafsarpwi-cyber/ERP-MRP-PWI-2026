import { useEffect, useState, useCallback } from 'react';
import apiService from '../../../services/api';
import {
  getLookupsSnapshot,
  prefetchAllLookups,
  subscribeLookups,
  cacheDepartmentItems,
  getCachedDepartmentItems,
} from '../../../services/lookupsCache';

export interface LookupItem { id: string; name: string; }
export interface Division extends LookupItem { divisionCode: string; }
export interface Section extends LookupItem { sectionCode: string; divisionId: string; }
export interface Department extends LookupItem { departmentCode: string; divisionId: string | null; sectionId: string | null; }
export interface ItemLk extends LookupItem {
  itemCode: string;
  baseUomId: string;
  baseUom?: { code: string; symbol?: string };
  itemType: string;
  isManufacturable: boolean;
  status: string;
  departmentId?: string | null;
  departmentName?: string | null;
  sectionId?: string | null;
  sectionName?: string | null;
  divisionId?: string | null;
  divisionName?: string | null;
  categoryId?: string | null;
  categoryName?: string | null;
  wireSizeMm?: number | null;
  routeType?: string | null;
  routeTypeId?: string | null;
  weightPerPiece?: number | null;
  piecesPerKg?: number | null;
  weightPerMeter?: number | null;
  lengthPerPiece?: number | null;
  // TASK #33: Production Flow Mapping
  productionInItemId?: string | null;
  productionOutItemId?: string | null;
  productionInItem?: { id: string; itemCode: string; name: string; wireSizeMm?: number | null; baseUomId?: string; baseUom?: { code: string } } | null;
  productionOutItem?: { id: string; itemCode: string; name: string; wireSizeMm?: number | null; baseUomId?: string; baseUom?: { code: string } } | null;
}
export interface UomLk extends LookupItem { code: string; symbol: string; uomType: string; }
export interface UomConversionLk { id: string; fromUomId: string; toUomId: string; conversionFactor: string | number; status: string; }
export interface ShiftLk extends LookupItem { shiftCode: string; startTime: string | null; endTime: string | null; plannedHours: number; }
export interface MachineLk extends LookupItem { machineCode: string; departmentId: string | null; department?: { name: string } | null; }
export interface DowntimeReasonLk extends LookupItem { code: string; }
export interface ProductionOrderLk {
  id: string;
  orderNumber: string;
  productId: string;
  uomId: string;
  status: string;
  item?: { name?: string; itemCode?: string } | null;
  product?: { name?: string; itemCode?: string } | null;
}
export interface HrEmployeeLk {
  id: string;
  employeeCode: string;
  firstName: string;
  lastName: string | null;
  departmentId: string | null;
  jobTitle: string | null;
  status: string;
}

interface ListResponse<T> { success?: boolean; data?: T[]; total?: number; }

async function fetchList<T>(url: string, params?: Record<string, unknown>): Promise<T[]> {
  try {
    const res = await apiService.get<any>(url, params);
    if (Array.isArray(res)) return res as T[];
    if (Array.isArray(res?.data)) return res.data as T[];
    return [];
  } catch {
    return [];
  }
}

export function useLookups() {
  const initialSnap = getLookupsSnapshot();

  const [divisions, setDivisions] = useState<Division[]>(() => initialSnap.divisions as Division[]);
  const [sections, setSections] = useState<Section[]>(() => initialSnap.sections as Section[]);
  const [departments, setDepartments] = useState<Department[]>(() => initialSnap.departments as Department[]);
  const [items, setItems] = useState<ItemLk[]>(() => initialSnap.items as ItemLk[]);
  const [deptItemsMap, setDeptItemsMap] = useState<Record<string, ItemLk[]>>(() => initialSnap.deptItemsMap as Record<string, ItemLk[]>);
  const [deptItemsLoading, setDeptItemsLoading] = useState<Record<string, boolean>>({});
  const [uoms, setUoms] = useState<UomLk[]>(() => initialSnap.uoms as UomLk[]);
  const [uomConversions, setUomConversions] = useState<UomConversionLk[]>(() => initialSnap.uomConversions as UomConversionLk[]);
  const [shifts, setShifts] = useState<ShiftLk[]>(() => initialSnap.shifts as ShiftLk[]);
  const [machines, setMachines] = useState<MachineLk[]>(() => initialSnap.machines as MachineLk[]);
  const [downtimeReasons, setDowntimeReasons] = useState<DowntimeReasonLk[]>(() => initialSnap.downtimeReasons as DowntimeReasonLk[]);
  const [downtimeReasonsLoading, setDowntimeReasonsLoading] = useState(initialSnap.downtimeReasons.length === 0);
  const [downtimeReasonsFailed, setDowntimeReasonsFailed] = useState(false);
  const [productionOrders, setProductionOrders] = useState<ProductionOrderLk[]>(() => initialSnap.productionOrders as ProductionOrderLk[]);
  const [hrEmployees, setHrEmployees] = useState<HrEmployeeLk[]>(() => initialSnap.employees as HrEmployeeLk[]);
  const [hrEmployeesLoading, setHrEmployeesLoading] = useState(initialSnap.employees.length === 0);

  useEffect(() => {
    // 1. Subscribe to any background cache updates
    const unsubscribe = subscribeLookups((snap) => {
      if (snap.divisions.length > 0) setDivisions(snap.divisions as Division[]);
      if (snap.sections.length > 0) setSections(snap.sections as Section[]);
      if (snap.departments.length > 0) setDepartments(snap.departments as Department[]);
      if (snap.items.length > 0) setItems(snap.items as ItemLk[]);
      if (snap.uoms.length > 0) setUoms(snap.uoms as UomLk[]);
      if (snap.uomConversions.length > 0) setUomConversions(snap.uomConversions as UomConversionLk[]);
      if (snap.shifts.length > 0) setShifts(snap.shifts as ShiftLk[]);
      if (snap.machines.length > 0) setMachines(snap.machines as MachineLk[]);
      if (snap.productionOrders.length > 0) setProductionOrders(snap.productionOrders as ProductionOrderLk[]);
      if (snap.employees.length > 0) {
        setHrEmployees(snap.employees as HrEmployeeLk[]);
        setHrEmployeesLoading(false);
      }
      if (snap.downtimeReasons.length > 0) {
        setDowntimeReasons(snap.downtimeReasons as DowntimeReasonLk[]);
        setDowntimeReasonsLoading(false);
      }
    });

    // 2. Parallel prefetch (asynchronous, non-blocking)
    prefetchAllLookups().catch(() => {});

    return () => {
      unsubscribe();
    };
  }, []);

  /** Dynamically loads employees for a specific department to ensure department-level operators are available */
  const loadEmployeesForDepartment = useCallback(async (deptId?: string) => {
    if (!deptId) return;
    try {
      let fetched = await fetchList<HrEmployeeLk>('/hr/employees/lookup', { departmentId: deptId });
      if (!fetched || fetched.length === 0) {
        let companyId: string | undefined;
        try {
          const raw = localStorage.getItem('erp_user');
          if (raw) companyId = JSON.parse(raw)?.defaultCompanyId;
        } catch {}
        const effectiveCompanyId = companyId || '7725aa04-a270-4314-9e82-90949cbe7791';

        try {
          const res = await apiService.get<any>('/hr/employees', {
            companyId: effectiveCompanyId,
            departmentId: deptId,
            limit: 500,
            status: 'ACTIVE',
          });
          const list = Array.isArray(res) ? res : (Array.isArray(res?.data) ? res.data : []);
          if (list.length > 0) {
            fetched = list.map((e: any) => ({
              id: e.id,
              employeeCode: e.employeeCode,
              firstName: e.firstName,
              lastName: e.lastName ?? null,
              departmentId: e.departmentId ?? null,
              departmentName: e.department?.name ?? null,
              jobTitle: e.jobTitle || e.designation?.designationName || null,
              status: e.status,
            }));
          }
        } catch {}
      }
      if (fetched && fetched.length > 0) {
        setHrEmployees((prev) => {
          const existingIds = new Set(prev.map((e) => e.id));
          const toAdd = fetched.filter((e) => !existingIds.has(e.id));
          return toAdd.length > 0 ? [...prev, ...toAdd] : prev;
        });
      }
    } catch {}
  }, []);

  /** Dynamically loads items for a specific department and caches them */
  const loadDepartmentItems = useCallback(async (departmentId: string): Promise<ItemLk[]> => {
    if (!departmentId) return [];
    const cached = getCachedDepartmentItems(departmentId) || deptItemsMap[departmentId];
    if (cached && cached.length > 0) return cached as ItemLk[];
    setDeptItemsLoading((prev) => ({ ...prev, [departmentId]: true }));
    try {
      const fetched = await fetchList<ItemLk>('/master-data/items', {
        departmentId,
        limit: 1000,
        status: 'ACTIVE',
      });
      if (fetched && fetched.length > 0) {
        cacheDepartmentItems(departmentId, fetched);
        setDeptItemsMap((prev) => ({ ...prev, [departmentId]: fetched }));
        setItems((prevItems) => {
          const existingIds = new Set(prevItems.map((i) => i.id));
          const toAdd = fetched.filter((i) => !existingIds.has(i.id));
          return toAdd.length > 0 ? [...prevItems, ...toAdd] : prevItems;
        });
        return fetched;
      }
    } finally {
      setDeptItemsLoading((prev) => ({ ...prev, [departmentId]: false }));
    }
    return [];
  }, [deptItemsMap]);

  /** HR operators filtered to the selected department (Phase 12 org filtering).
   * If department has no directly assigned employees, fall back to all company active employees
   * so the operator dropdown is never empty.
   */
  const employeesForDepartment = (departmentId?: string): HrEmployeeLk[] => {
    if (!departmentId) return hrEmployees;
    const deptEmployees = hrEmployees.filter((e) => e.departmentId === departmentId);
    return deptEmployees.length > 0 ? deptEmployees : hrEmployees;
  };

  /** Full display name of an HR employee. */
  const employeeFullName = (e?: HrEmployeeLk): string =>
    e ? `${e.firstName}${e.lastName ? ` ${e.lastName}` : ''}`.trim() : '';

  /** Active downtime reasons from the downtime_reasons table (single source of truth). */
  const loadDowntimeReasons = async (): Promise<DowntimeReasonLk[]> => {
    setDowntimeReasonsLoading(true);
    try {
      const res = await apiService.get<ListResponse<DowntimeReasonLk>>('/production/downtime-reasons');
      setDowntimeReasons((res.data || []) as DowntimeReasonLk[]);
      setDowntimeReasonsFailed(false);
      return (res.data || []) as DowntimeReasonLk[];
    } catch {
      setDowntimeReasonsFailed(true);
      return [];
    } finally {
      setDowntimeReasonsLoading(false);
    }
  };

  useEffect(() => {
    void loadDowntimeReasons();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadMachines = async (departmentId?: string) => {
    const list = await fetchList<MachineLk>('/production/machines', departmentId ? { departmentId } : {});
    setMachines(list);
    return list;
  };

  const sectionsForDivision = (divisionId?: string) =>
    divisionId ? sections.filter((s) => s.divisionId === divisionId) : sections;

  const departmentsForSection = (sectionId?: string) =>
    sectionId ? departments.filter((d) => d.sectionId === sectionId) : departments;

  /** UOM options valid for an item: base UOM + any UOM with a defined conversion path. */
  const validUomsForItem = (itemId?: string): UomLk[] => {
    const item = items.find((i) => i.id === itemId);
    if (!item) return uoms;
    const valid = new Set<string>([item.baseUomId]);
    for (const c of uomConversions) {
      if (c.fromUomId === item.baseUomId) valid.add(c.toUomId);
      if (c.toUomId === item.baseUomId) valid.add(c.fromUomId);
    }
    return uoms.filter((u) => valid.has(u.id));
  };

  return {
    divisions, sections, departments, items, uoms, uomConversions,
    shifts, machines, downtimeReasons, productionOrders, hrEmployees, hrEmployeesLoading,
    deptItemsMap, deptItemsLoading, loadDepartmentItems,
    downtimeReasonsLoading, downtimeReasonsFailed, loadDowntimeReasons,
    loadMachines, sectionsForDivision, departmentsForSection, validUomsForItem,
    employeesForDepartment, employeeFullName, loadEmployeesForDepartment,
  };
}
