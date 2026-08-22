import { useEffect, useState } from 'react';
import apiService from '../../../services/api';

export interface LookupItem { id: string; name: string; }
export interface Division extends LookupItem { divisionCode: string; }
export interface Section extends LookupItem { sectionCode: string; divisionId: string; }
export interface Department extends LookupItem { departmentCode: string; divisionId: string | null; sectionId: string | null; }
export interface ItemLk extends LookupItem { itemCode: string; baseUomId: string; baseUom?: { code: string }; itemType: string; isManufacturable: boolean; status: string; }
export interface UomLk extends LookupItem { code: string; symbol: string; uomType: string; }
export interface UomConversionLk { id: string; fromUomId: string; toUomId: string; conversionFactor: string | number; status: string; }
export interface ShiftLk extends LookupItem { shiftCode: string; startTime: string | null; endTime: string | null; plannedHours: number; }
export interface MachineLk extends LookupItem { machineCode: string; departmentId: string | null; department?: { name: string } | null; }
export interface DowntimeReasonLk extends LookupItem { code: string; }
export interface ProductionOrderLk { id: string; orderNumber: string; productId: string; uomId: string; status: string; }

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
  const [productionOrders, setProductionOrders] = useState<ProductionOrderLk[]>([]);

  useEffect(() => {
    void (async () => {
      const [div, sec, dep, itm, uom, conv, shf, po] = await Promise.all([
        fetchList<Division>('/divisions', { limit: 200 }),
        fetchList<Section>('/sections', { limit: 500 }),
        fetchList<Department>('/departments', { limit: 500 }),
        fetchList<ItemLk>('/master-data/items', { limit: 500 }),
        fetchList<UomLk>('/master-data/uom', { limit: 200 }),
        fetchList<UomConversionLk>('/master-data/uom-conversions', { limit: 500 }),
        fetchList<ShiftLk>('/production/shifts'),
        fetchList<ProductionOrderLk>('/production/orders', { limit: 200 }),
      ]);
      setDivisions(div);
      setSections(sec);
      setDepartments(dep.filter((d) => d.divisionId && d.sectionId));
      setItems(itm);
      setUoms(uom);
      setUomConversions(conv.filter((c) => c.status === 'ACTIVE'));
      setShifts(shf);
      setProductionOrders(po);
    })();
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
    shifts, machines, downtimeReasons, productionOrders,
    loadMachines, sectionsForDivision, departmentsForSection, validUomsForItem,
  };
}
