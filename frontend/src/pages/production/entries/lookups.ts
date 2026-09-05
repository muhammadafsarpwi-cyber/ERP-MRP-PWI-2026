import { useEffect, useState } from 'react';
import apiService from '../../../services/api';

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
export interface ProductionOrderLk { id: string; orderNumber: string; productId: string; uomId: string; status: string; }
export interface HrEmployeeLk {
  id: string;
  employeeCode: string;
  firstName: string;
  lastName: string | null;
  departmentId: string | null;
  jobTitle: string | null;
  status: string;
}

interface ListResponse<T> { success: boolean; data: T[]; total?: number; }

async function fetchList<T>(url: string, params?: Record<string, unknown>): Promise<T[]> {
  try {
    const res = await apiService.get<ListResponse<T>>(url, params);
    return (res.data || []) as T[];
  } catch {
    return [];
  }
}

export function useLookups() {
  const [divisions, setDivisions] = useState<Division[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [items, setItems] = useState<ItemLk[]>([]);
  const [uoms, setUoms] = useState<UomLk[]>([]);
  const [uomConversions, setUomConversions] = useState<UomConversionLk[]>([]);
  const [shifts, setShifts] = useState<ShiftLk[]>([]);
  const [machines, setMachines] = useState<MachineLk[]>([]);
  const [downtimeReasons, setDowntimeReasons] = useState<DowntimeReasonLk[]>([]);
  const [downtimeReasonsLoading, setDowntimeReasonsLoading] = useState(true);
  const [downtimeReasonsFailed, setDowntimeReasonsFailed] = useState(false);
  const [productionOrders, setProductionOrders] = useState<ProductionOrderLk[]>([]);
  const [hrEmployees, setHrEmployees] = useState<HrEmployeeLk[]>([]);

  useEffect(() => {
    void (async () => {
      const [div, sec, dep, itm, uom, conv, shf, po, emp] = await Promise.all([
        fetchList<Division>('/divisions', { limit: 200 }),
        fetchList<Section>('/sections', { limit: 500 }),
        fetchList<Department>('/departments', { limit: 500 }),
        fetchList<ItemLk>('/master-data/items', { limit: 500 }),
        fetchList<UomLk>('/master-data/uom', { limit: 200 }),
        fetchList<UomConversionLk>('/master-data/uom-conversions', { limit: 500 }),
        fetchList<ShiftLk>('/production/shifts'),
        fetchList<ProductionOrderLk>('/production/orders', { limit: 200 }),
        fetchList<HrEmployeeLk>('/hr/employees', { limit: 500, status: 'ACTIVE' }),
      ]);
      setDivisions(div);
      setSections(sec);
      setDepartments(dep.filter((d) => d.divisionId && d.sectionId));
      setItems(itm);
      setUoms(uom);
      setUomConversions(conv.filter((c) => c.status === 'ACTIVE'));
      setShifts(shf);
      setProductionOrders(po);
      setHrEmployees(emp);
    })();
  }, []);

  /** HR operators filtered to the selected department (Phase 12 org filtering). */
  const employeesForDepartment = (departmentId?: string): HrEmployeeLk[] =>
    departmentId
      ? hrEmployees.filter((e) => e.departmentId === departmentId)
      : hrEmployees;

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
    shifts, machines, downtimeReasons, productionOrders, hrEmployees,
    downtimeReasonsLoading, downtimeReasonsFailed, loadDowntimeReasons,
    loadMachines, sectionsForDivision, departmentsForSection, validUomsForItem,
    employeesForDepartment, employeeFullName,
  };
}
