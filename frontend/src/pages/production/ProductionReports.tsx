import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert, App, Button, Card, Dropdown, Row, Col, Select, DatePicker,
  Space, Statistic, Tabs, Tag, Tooltip, Typography,
} from 'antd';
import type { MenuProps } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  ReloadOutlined, DownloadOutlined, FilePdfOutlined, FileExcelOutlined,
  PrinterOutlined, BarChartOutlined, AlertOutlined, AimOutlined, CarryOutOutlined,
  ClusterOutlined, AppstoreOutlined, InfoCircleOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import apiService from '../../services/api';
import dashboardService, { FilterOption } from '../../services/dashboardService';
import { PageHeader, PageToolbar, ERPTable } from '../../components/shared';
import { ITEM_TYPES } from '../master-data/items/itemTypes';
import { calcActualKg, perUnitWeightLabel } from '../../utils/productionWeight';
import './productionReports.css';

/* Shared Per Unit Weight / Actual KG helpers live in utils/productionWeight.ts
   and mirror the backend calcActualKg logic exactly. */
export { perUnitWeightLabel };

const { Text } = Typography;
const { RangePicker } = DatePicker;

/* ── Types (mirror backend responses) ─────────────────────────────────── */

interface GrandTotalRow {
  uomCode: string;
  targetQuantity: number;
  actualQuantity: number;
  scrapQuantity: number;
  runningHours: number;
  downtimeHours: number;
  plannedHours: number;
  achievementPercentage: number | null;
  efficiencyPercentage: number | null;
  entryCount: number;
}
interface ReportItem {
  itemId: string; itemCode: string; itemName: string; itemType?: string;
  materialRoleUsage?: string | null;
  itemDivisionName?: string | null; itemSectionName?: string | null; itemDepartmentName?: string | null;
  uomCode: string;
  baseWeight?: number | null; weightPerPiece?: number | null; weightPerMeter?: number | null; weightUomCode?: string | null;
  actualKg?: number | null; scrapPct?: number | null;
  targetQuantity: number; actualQuantity: number; scrapQuantity: number;
  runningHours: number; downtimeHours: number; plannedHours: number; entryCount: number;
  achievementPercentage: number | null; efficiencyPercentage: number | null;
}
interface ReportDept {
  departmentId: string; departmentCode: string; departmentName: string;
  divisionName: string; sectionName: string; items: ReportItem[];
}
interface EntryReportResponse {
  filters: Record<string, string>;
  entryCount: number;
  departments: ReportDept[];
  grandTotalsByUom: GrandTotalRow[];
}
interface ProdEntryRow {
  id: string; entryDate: string | null; machineNo?: string; operatorName?: string;
  targetQuantity: number; actualQuantity: number; scrapQuantity: number;
  runningHours: number; downtimeHours: number; remarks?: string | null;
  item?: { itemCode?: string; name?: string; weightPerPiece?: number | null; weightPerMeter?: number | null } | null;
  uom?: { code?: string } | null; shift?: { name?: string } | null;
  department?: { name?: string } | null;
}
interface ProdOrderRow {
  id: string; orderNumber: string; status: string; priority: string;
  plannedQuantity: number; completedQuantity?: number; producedQuantity?: number; scrappedQuantity?: number;
  dueDate?: string | null; createdAt?: string;
  product?: { name?: string; weightPerPiece?: number | null; weightPerMeter?: number | null } | null;
  uom?: { code?: string } | null;
}
interface MachineTargetRow {
  id: string; targetQuantity: number | string; standardHours?: number | string | null;
  effectiveFrom?: string | null; effectiveTo?: string | null; status: string;
  machine?: { machineCode?: string; name?: string; machineId?: string | null } | null;
  shift?: { shiftCode?: string; name?: string } | null;
  item?: { itemCode?: string; name?: string } | null;
  uom?: { code?: string } | null;
}
interface SalesDeliveryRow {
  id: string; deliveryNumber: string; deliveryDate: string; status: string;
  subtotal: number; taxAmount: number; totalAmount: number; carrier: string | null;
  trackingNumber: string | null;
  customer?: { customerCode?: string; companyName?: string } | null;
  salesOrder?: { orderNumber?: string } | null;
}
interface ShiftLk { id: string; shiftCode: string; name: string; plannedHours?: string | number | null; }
interface UomLk { id: string; code: string; name: string; uomType?: string | null; }
interface Filters { divisionId?: string; departmentId?: string; shiftId?: string; status?: string; }

interface DeptRow {
  key: string; departmentId: string; departmentName: string; divisionName: string; sectionName: string;
  itemCode: string; itemName: string; uomCode: string; family: string | null;
  weightPerPiece?: number | null; weightPerMeter?: number | null;
  target: number; actual: number; scrap: number; running: number;
  actualKg: number | null; scrapPct: number | null;
  achievement: number | null; efficiency: number | null;
}
/** Genuine department-level summary: exactly ONE row per department. */
interface DeptSummaryRow {
  key: string; departmentId: string; departmentName: string; divisionName: string; sectionName: string;
  uomCodes: string[];
  /** Only populated when every item shares the same UOM + per-unit weight; never fabricated. */
  perUnitWeight: string | null;
  target: number; actual: number; scrap: number;
  actualKg: number; scrapPct: number | null;
  achievement: number | null; efficiency: number | null;
}
interface ScrapRow {
  key: string;
  itemType: string; materialRole: string;
  itemDivision: string; itemSection: string; itemDepartment: string;
  itemCode: string; itemName: string;
  uomCode: string; family: string | null;
  weightPerPiece?: number | null; weightPerMeter?: number | null;
  target: number; actual: number; scrap: number;
  actualKg: number | null; scrapRate: number | null;
}
interface FamilyRow {
  key: string; family: string; uomCodes: string; target: number; actual: number; actualKg: number; scrap: number;
  entryCount: number; achievement: number | null;
}

/* ── Helpers ───────────────────────────────────────────────────────────── */

const fmt = (n: number | string | null | undefined) =>
  n == null || n === '' ? '–' : Math.round(Number(n)).toLocaleString('en-US');
/* Fixed 2-decimal format for fragile KG quantities — zero rows render as 0. */
const fmt2 = (n: number | string | null | undefined) =>
  n == null || n === '' ? '–' : (Math.round(Number(n) * 100) / 100).toLocaleString('en-US', { maximumFractionDigits: 2 });
const n = (v: number | string | null | undefined): number => (v == null || v === '' ? 0 : Number(v));
const pct = (v: number | null | undefined): string => {
  if (v == null) return '–';
  const r = Math.round(Number(v) * 100) / 100;
  return `${r.toLocaleString('en-US', { maximumFractionDigits: 2 })}%`;
};
const dt = (v?: string | null) =>
  v ? dayjs(v).format('DD MMM YYYY') : '–';

const FAMILY_LABELS: Record<string, string> = { WEIGHT: 'Weight', COUNT: 'Count', LENGTH: 'Length', OTHER: 'Other' };

/* ── Item Master mapping (Scrap & Rejection tab) ─────────────────────────
   The mapping pattern is: Item Type + Material Role / Use + Item + Organization.
   All labels come from the existing Item Master / itemTypes terminology. */
const ITEM_TYPE_LABEL: Record<string, string> = Object.fromEntries(ITEM_TYPES.map((t: { value: string; label: string }) => [t.value, t.label]));
const itemTypeLabel = (code?: string) => (code && ITEM_TYPE_LABEL[code] ? ITEM_TYPE_LABEL[code] : code ?? '–');
// Production mapping categories: Raw Material, Work in Progress, Semi-Finished, Finished Good.
const MAPPED_ITEM_TYPES = new Set(['RAW_MATERIAL', 'WORK_IN_PROGRESS', 'SEMI_FINISHED', 'FINISHED_GOOD']);
const MAPPED_TYPE_ORDER: Record<string, number> = { RAW_MATERIAL: 0, WORK_IN_PROGRESS: 1, SEMI_FINISHED: 2, FINISHED_GOOD: 3 };
const mappedTypeRank = (t: string) => (t in MAPPED_TYPE_ORDER ? MAPPED_TYPE_ORDER[t] : 99);

const ACHIEVEMENT_META: Record<string, { label: string; cls: string }> = {
  good: { label: 'good', cls: 'erp-achv--good' },
  bad: { label: 'bad', cls: 'erp-achv--bad' },
  neutral: { label: 'neutral', cls: 'erp-achv--neutral' },
};

const AchievementBadge: React.FC<{ value: number | null | undefined }> = ({ value }) => {
  if (value == null) return <Text type="secondary" style={{ fontVariantNumeric: 'tabular-nums' }}>–</Text>;
  const v = Number(value);
  const meta = v > 70 ? ACHIEVEMENT_META.good : v < 70 ? ACHIEVEMENT_META.bad : ACHIEVEMENT_META.neutral;
  return <span className={`erp-achv ${meta.cls}`}>{v.toFixed(1)}%</span>;
};

/* Scrap rate is INVERSE to achievement: high scrap rate = red, low = green.
   Calculated as Scrap KG ÷ Actual KG (Actual KG comes from the backend). */
const ScrapRateBadge: React.FC<{ value: number | null | undefined }> = ({ value }) => {
  if (value == null) return <Text type="secondary" style={{ fontVariantNumeric: 'tabular-nums' }}>–</Text>;
  const meta = value > 10 ? ACHIEVEMENT_META.bad : value < 3 ? ACHIEVEMENT_META.good : ACHIEVEMENT_META.neutral;
  return <span className={`erp-achv ${meta.cls}`}>{value.toFixed(2)}%</span>;
};

const FamilyChip: React.FC<{ family: string | null }> = ({ family }) => {
  const key = family && family in FAMILY_LABELS ? family : 'OTHER';
  const cls = `erp-family-chip erp-family-chip--${key.toLowerCase()}`;
  return <span className={cls}>{FAMILY_LABELS[key] ?? 'Other'}</span>;
};

const STATUS_COLORS: Record<string, string> = {
  DRAFT: 'default', RELEASED: 'geekblue', IN_PROGRESS: 'processing',
  COMPLETED: 'green', CANCELLED: 'red', CONFIRMED: 'cyan', SHIPPED: 'blue',
  DELIVERED: 'green', RETURNED: 'volcano',
};
const statusColor = (s?: string | null) => STATUS_COLORS[String(s || '').toUpperCase()] ?? 'default';

const ORDER_STATUSES = ['DRAFT', 'RELEASED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'];
const DELIVERY_STATUSES = ['DRAFT', 'CONFIRMED', 'SHIPPED', 'DELIVERED', 'CANCELLED'];

function downloadCsv(filename: string, header: string[], rows: (string | number)[][]) {
  const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  const csv = [header.map(esc).join(','), ...rows.map((r) => r.map(esc).join(','))].join('\n');
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `${filename}.csv`; a.click();
  URL.revokeObjectURL(url);
}

interface PdfTable { head: string[]; body: (string | number)[][]; }
function exportPdf(filename: string, title: string, subtitle: string, tables: PdfTable | PdfTable[]) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  doc.setFontSize(15); doc.setTextColor(30, 41, 59);
  doc.text(title, 28, 32);
  doc.setFontSize(9); doc.setTextColor(100, 116, 139);
  doc.text(subtitle, 28, 48);
  const list = Array.isArray(tables) ? tables : [tables];
  let startY = 62;
  list.forEach((t) => {
    autoTable(doc, {
      head: [t.head],
      body: t.body,
      startY,
      margin: { left: 28, right: 28 },
      styles: { fontSize: 7.5, cellPadding: 3.5 },
      headStyles: { fillColor: [79, 70, 229], textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [248, 250, 252] },
    });
    const last = (doc as any).lastAutoTable as { finalY?: number } | undefined;
    startY = last?.finalY ? last.finalY + 14 : startY + 300;
  });
  doc.save(`${filename}.pdf`);
}

/* ── Page ──────────────────────────────────────────────────────────────── */

const ProductionReports: React.FC = () => {
  const { message } = App.useApp();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState<Filters>({});
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs | null, dayjs.Dayjs | null] | null>(null);
  const [activeTab, setActiveTab] = useState('dept');

  const [divisions, setDivisions] = useState<FilterOption[]>([]);
  const [departments, setDepartments] = useState<FilterOption[]>([]);
  const [shifts, setShifts] = useState<ShiftLk[]>([]);
  const [uoms, setUoms] = useState<UomLk[]>([]);

  const [report, setReport] = useState<EntryReportResponse | null>(null);
  const [deptPage, setDeptPage] = useState(1);
  const [deptPageSize, setDeptPageSize] = useState(10);
  const [entries, setEntries] = useState<ProdEntryRow[]>([]);
  const [entriesTotal, setEntriesTotal] = useState(0);
  const [entriesPage, setEntriesPage] = useState(1);
  const [orders, setOrders] = useState<ProdOrderRow[]>([]);
  const [ordersTotal, setOrdersTotal] = useState(0);
  const [ordersPage, setOrdersPage] = useState(1);
  const [targets, setTargets] = useState<MachineTargetRow[]>([]);
  const [targetsTotal, setTargetsTotal] = useState(0);
  const [targetsPage, setTargetsPage] = useState(1);
  const [shipments, setShipments] = useState<SalesDeliveryRow[]>([]);
  const [shipmentsTotal, setShipmentsTotal] = useState(0);
  const [shipmentsPage, setShipmentsPage] = useState(1);

  /* ── Filter metadata ── */
  useEffect(() => {
    Promise.allSettled([
      dashboardService.getFilterDivisions(),
      apiService.get<{ success: boolean; data: ShiftLk[] }>('/production/shifts'),
      apiService.get<{ success?: boolean; data: UomLk[]; total?: number }>('/master-data/uom', { limit: 500 }),
    ]).then(([d, s, u]) => {
      if (d.status === 'fulfilled' && d.value.success) setDivisions(d.value.data);
      if (s.status === 'fulfilled' && s.value.success) setShifts(s.value.data || []);
      if (u.status === 'fulfilled') setUoms(u.value.data || []);
    });
  }, []);

  useEffect(() => {
    if (!filters.divisionId) { setDepartments([]); return; }
    dashboardService.getFilterDepartments(filters.divisionId).then((res) => {
      if (res.success) setDepartments(res.data);
    });
  }, [filters.divisionId]);

  /* ── UOM family map (Production Family = UOM family from uom_type) ── */
  const uomFamilyMap = useMemo(() => {
    const m = new Map<string, string>();
    uoms.forEach((u) => m.set(String(u.code || '').toUpperCase(), u.uomType || ''));
    return m;
  }, [uoms]);
  const familyOf = useCallback(
    (code?: string) => {
      const f = code ? uomFamilyMap.get(code.toUpperCase()) : undefined;
      return f || null;
    },
    [uomFamilyMap],
  );

  /* ── Build query params from filters ── */
  const reportParams = useMemo(() => {
    const p: Record<string, string> = {};
    if (dateRange?.[0]) p.dateFrom = dateRange[0].format('YYYY-MM-DD');
    if (dateRange?.[1]) p.dateTo = dateRange[1].format('YYYY-MM-DD');
    if (filters.divisionId) p.divisionId = filters.divisionId;
    if (filters.departmentId) p.departmentId = filters.departmentId;
    if (filters.shiftId) p.shiftId = filters.shiftId;
    return p;
  }, [dateRange, filters]);

  /* ── Loaders ── */
  const loadReport = useCallback(async () => {
    // NOTE: /production/entries/report returns {success, entryCount, departments,
    // grandTotalsByUom} at top level (NO `data` wrapper) — read the object directly.
    const r = await apiService.get<{ success: boolean } & EntryReportResponse>('/production/entries/report', reportParams);
    setReport(r.success ? r : null);
  }, [reportParams]);

  const loadEntries = useCallback(async (page = entriesPage) => {
    const params: Record<string, string | number> = { page, limit: 20, ...reportParams };
    if (search) params.search = search;
    const r = await apiService.get<{ success: boolean; data: ProdEntryRow[]; total: number }>('/production/entries', params);
    if (r.success) { setEntries(r.data); setEntriesTotal(n(r.total)); setEntriesPage(page); }
  }, [reportParams, search, entriesPage]);

  const loadOrders = useCallback(async (page = ordersPage) => {
    const params: Record<string, string | number> = { page, limit: 20, ...reportParams };
    if (filters.status && ORDER_STATUSES.includes(filters.status)) params.status = filters.status;
    const r = await apiService.get<{ success: boolean; data: ProdOrderRow[]; total: number }>('/production/orders', params);
    if (r.success) { setOrders(r.data); setOrdersTotal(n(r.total)); setOrdersPage(page); }
  }, [reportParams, filters.status, ordersPage]);

  const loadTargets = useCallback(async (page = targetsPage) => {
    const params: Record<string, string | number> = { page, limit: 50, ...reportParams };
    params.status = 'ACTIVE';
    if (search) params.search = search;
    const r = await apiService.get<{ data: MachineTargetRow[]; total: number }>('/production/machine-targets', params);
    setTargets(r.data || []); setTargetsTotal(n(r.total)); setTargetsPage(page);
  }, [reportParams, search, targetsPage]);

  const loadShipments = useCallback(async (page = shipmentsPage) => {
    const params: Record<string, string | number> = { page, limit: 20 };
    if (filters.status && DELIVERY_STATUSES.includes(filters.status)) params.status = filters.status;
    if (search) params.search = search;
    const r = await apiService.get<{ success: boolean; data: SalesDeliveryRow[]; total: number }>('/sales/deliveries', params);
    if (r.success) { setShipments(r.data); setShipmentsTotal(n(r.total)); setShipmentsPage(page); }
  }, [filters.status, search, shipmentsPage]);

  const loadAll = useCallback(async () => {
    setLoading(true); setError(null);
    const results = await Promise.allSettled([
      loadReport(), loadEntries(1), loadOrders(1), loadTargets(1), loadShipments(1),
    ]);
    const failed = results.filter((r) => r.status === 'rejected').length;
    if (failed > 0) setError(`Some report sections failed to load (${failed} of ${results.length}).`);
    setLoading(false);
  }, [loadReport, loadEntries, loadOrders, loadTargets, loadShipments]);

  useEffect(() => { void loadAll(); }, [loadAll]);

  useEffect(() => { void loadEntries(1); }, [search]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Derived rows ── */
  const deptRows = useMemo<DeptRow[]>(() => {
    const rows: DeptRow[] = [];
    (report?.departments ?? []).forEach((d) =>
      d.items.forEach((i) =>
        rows.push({
          key: `${d.departmentId}-${i.itemId}-${i.uomCode}`,
          departmentId: d.departmentId, departmentName: d.departmentName,
          divisionName: d.divisionName || '–', sectionName: d.sectionName || '–',
          itemCode: i.itemCode, itemName: i.itemName, uomCode: i.uomCode,
          family: familyOf(i.uomCode),
          weightPerPiece: i.weightPerPiece, weightPerMeter: i.weightPerMeter,
          target: i.targetQuantity, actual: i.actualQuantity, scrap: i.scrapQuantity,
          running: i.runningHours,
          actualKg: i.actualKg ?? null, scrapPct: i.scrapPct ?? null,
          achievement: i.achievementPercentage, efficiency: i.efficiencyPercentage,
        }),
      ),
    );
    return rows;
  }, [report, familyOf]);

  const scrapRows = useMemo<ScrapRow[]>(() => {
    const rows: ScrapRow[] = [];
    (report?.departments ?? []).forEach((d) =>
      d.items.forEach((i) => {
        // Item Master mapping: include only production categories (Raw Material,
        // Work in Progress, Semi-Finished, Finished Good). Oils / consumables and
        // generic items are NOT part of the mapping.
        if (!i.itemType || !MAPPED_ITEM_TYPES.has(i.itemType)) return;
        const actual = i.actualQuantity;
        const scrap = i.scrapQuantity;
        rows.push({
          key: `${i.itemType}-${i.itemId}-${i.uomCode}`,
          itemType: i.itemType,
          materialRole: i.materialRoleUsage ?? '',
          itemDivision: i.itemDivisionName ?? '',
          itemSection: i.itemSectionName ?? '',
          itemDepartment: i.itemDepartmentName ?? '',
          itemCode: i.itemCode, itemName: i.itemName,
          uomCode: i.uomCode,
          family: familyOf(i.uomCode),
          weightPerPiece: i.weightPerPiece, weightPerMeter: i.weightPerMeter,
          target: i.targetQuantity, actual, scrap,
          // Rejection % comes from the backend (Rejection KG ÷ Actual KG) — never
          // computed against Actual PCS; null when Actual KG is 0.
          actualKg: i.actualKg ?? null, scrapRate: i.scrapPct ?? null,
        });
      }),
    );
    // Keep every matched Item Master item (zero-scrap rows still show 0.00).
    return rows.sort(
      (a, b) => mappedTypeRank(a.itemType) - mappedTypeRank(b.itemType)
        || a.itemDepartment.localeCompare(b.itemDepartment)
        || a.itemCode.localeCompare(b.itemCode),
    );
  }, [report, familyOf]);

  const familyRows = useMemo<FamilyRow[]>(() => {
    const map = new Map<string, FamilyRow>();
    // Actual KG is summed per family from the SAME backend-derived Actual KG
    // (PCS×weight_per_piece / M×weight_per_meter / KG unchanged) that the
    // Department and Scrap & Rejection tabs display.
    (report?.departments ?? []).forEach((d) =>
      d.items.forEach((i) => {
        const f = familyOf(i.uomCode) ?? 'OTHER';
        const cur = map.get(f) || {
          key: f, family: f, uomCodes: '', target: 0, actual: 0, actualKg: 0, scrap: 0, entryCount: 0, achievement: null,
        };
        cur.target += i.targetQuantity; cur.actual += i.actualQuantity;
        cur.actualKg += n(i.actualKg ?? null); cur.scrap += i.scrapQuantity;
        cur.entryCount += i.entryCount;
        cur.uomCodes = cur.uomCodes ? `${cur.uomCodes}, ${i.uomCode}` : i.uomCode;
        map.set(f, cur);
      }),
    );
    return [...map.values()].map((r) => ({
      ...r,
      achievement: r.target > 0 ? (r.actual / r.target) * 100 : null,
    }));
  }, [report, familyOf]);

  /* ── Department-wise summary (ONE row per department) ──
     Aggregated from the authoritative report.departments payload, which is
     already scoped server-side by Division (and Department when chosen).
     Item-level UI filters/search never remove departments from this view.
     Per Unit Weight is shown ONLY when a single department-level value is
     semantically valid (one UOM, consistent Item Master weight) — otherwise '—'. */
  const deptSummaryRows = useMemo<DeptSummaryRow[]>(() => {
    return (report?.departments ?? []).map((d) => {
      let target = 0, actual = 0, scrap = 0, actualKg = 0;
      const uomSet = new Set<string>();
      const labels: Array<string | null> = [];
      const effVals: number[] = [];
      d.items.forEach((i) => {
        target += i.targetQuantity;
        actual += i.actualQuantity;
        scrap += i.scrapQuantity;
        actualKg += n(i.actualKg);
        if (i.uomCode) uomSet.add(i.uomCode);
        labels.push(perUnitWeightLabel(i.uomCode, i.weightPerPiece, i.weightPerMeter));
        if (i.efficiencyPercentage != null && Number.isFinite(i.efficiencyPercentage)) effVals.push(i.efficiencyPercentage);
      });
      const nonNullLabels = labels.filter((l): l is string => !!l);
      const singleWeight = uomSet.size === 1
        && nonNullLabels.length === d.items.length
        && new Set(nonNullLabels).size === 1;
      const efficiency = effVals.length > 0 ? effVals.reduce((s, v) => s + v, 0) / effVals.length : null;
      return {
        key: d.departmentId,
        departmentId: d.departmentId,
        departmentName: d.departmentName,
        divisionName: d.divisionName || '–',
        sectionName: d.sectionName || '–',
        uomCodes: [...uomSet],
        perUnitWeight: singleWeight ? nonNullLabels[0] : null,
        target, actual, scrap, actualKg,
        scrapPct: actualKg > 0 ? (scrap / actualKg) * 100 : null,
        achievement: target > 0 ? (actual / target) * 100 : null,
        efficiency,
      };
    }).sort((a, b) => a.departmentName.localeCompare(b.departmentName));
  }, [report]);

  // Keep the department-wise pagination valid when the scoped department set changes.
  useEffect(() => { setDeptPage(1); }, [deptSummaryRows.length]);

  const targetRows = useMemo(() =>
    deptRows
      .filter((r) => search.toLowerCase() === '' || `${r.departmentName} ${r.itemName} ${r.itemCode}`.toLowerCase().includes(search.toLowerCase()))
      .map((r) => ({ ...r, variance: r.target - r.actual })),
  [deptRows, search]);

  /* Client-side search for the report-derived tabs (entries/orders/targets/shipments search server-side). */
  const q = search.trim().toLowerCase();
  const matches = useCallback((vals: Array<string | null | undefined>) =>
    q === '' || vals.some((v) => (v || '').toLowerCase().includes(q)), [q]);
  const filteredDeptRows = useMemo(() =>
    deptRows.filter((r) => matches([r.departmentName, r.itemName, r.itemCode, r.uomCode])), [deptRows, matches]);
  const filteredScrapRows = useMemo(() =>
    scrapRows.filter((r) => matches([r.itemName, r.itemCode, r.itemDivision, r.itemSection, r.itemDepartment, r.uomCode, itemTypeLabel(r.itemType), r.materialRole])), [scrapRows, matches]);
  const filteredFamilyRows = useMemo(() =>
    familyRows.filter((r) => matches([FAMILY_LABELS[r.family] ?? r.family, r.uomCodes])), [familyRows, matches]);

  /* ── KPIs ── */
  const kpi = useMemo(() => {
    const totals = report?.grandTotalsByUom ?? [];
    const target = totals.reduce((s, g) => s + n(g.targetQuantity), 0);
    const actual = totals.reduce((s, g) => s + n(g.actualQuantity), 0);
    const scrap = totals.reduce((s, g) => s + n(g.scrapQuantity), 0);
    const achievement = target > 0 ? (actual / target) * 100 : null;
    const scrapRate = actual > 0 ? (scrap / actual) * 100 : null;
    const topScrapDept = scrapRows[0]?.itemDepartment ?? '–';
    const workingDepts = new Set(deptRows.map((r) => r.departmentId)).size;
    const effVals = deptRows.map((r) => r.efficiency).filter((v): v is number => v != null && Number.isFinite(v));
  const efficiency = effVals.length > 0 ? effVals.reduce((s, v) => s + v, 0) / effVals.length : null;
  return { target, actual, scrap, achievement, scrapRate, topScrapDept, workingDepts, efficiency, entryCount: report?.entryCount ?? 0 };
  }, [report, deptRows, scrapRows]);

  /* Sum of per-row Actual KG (authoritative: deptRows carry backend-calculated
     actualKg per item). KG-based Rejection % = Total Scrap (KG) ÷ Total Actual (KG) × 100. */
  const deptKpiKg = useMemo(() => {
    const actualKg = deptRows.reduce((s, r) => s + n(r.actualKg), 0);
    const scrapKg = deptRows.reduce((s, r) => s + n(r.scrap), 0);
    return {
      actualKg,
      rejectionPct: actualKg > 0 ? (scrapKg / actualKg) * 100 : null,
    };
  }, [deptRows]);

  /* Shipment KPI — Delivered/Shipped/Draft counts + value from /sales/deliveries. */
  const shipmentKpi = useMemo(() => {
    const all = shipments;
    const delivered = all.filter((d) => String(d.status).toUpperCase() === 'DELIVERED');
    const shipped = all.filter((d) => String(d.status).toUpperCase() === 'SHIPPED');
    const draft = all.filter((d) => String(d.status).toUpperCase() === 'DRAFT');
    const value = delivered.concat(shipped).reduce((s, d) => s + n(d.totalAmount), 0);
    return { total: shipmentsTotal, delivered: delivered.length, shipped: shipped.length, draft: draft.length, value };
  }, [shipments, shipmentsTotal]);

  /* KPIs scoped to the Scrap & Rejection mapping rows (already Item-Master-filtered). */
  const scrapKpi = useMemo(() => {
    const target = scrapRows.reduce((s, r) => s + n(r.target), 0);
    const actual = scrapRows.reduce((s, r) => s + n(r.actual), 0);
    const scrap = scrapRows.reduce((s, r) => s + n(r.scrap), 0);
    const actualKg = scrapRows.reduce((s, r) => s + n(r.actualKg), 0);
    return {
      items: scrapRows.length,
      target, actual, scrap,
      scrapRate: actualKg > 0 ? (scrap / actualKg) * 100 : scrap > 0 ? 100 : 0,
      topDept: scrapRows[0]?.itemDepartment ?? '–',
    };
  }, [scrapRows]);

  const dateLabel = dateRange?.[0] && dateRange?.[1]
    ? `${dateRange[0].format('DD MMM YYYY')} — ${dateRange[1].format('DD MMM YYYY')}`
    : 'All time';

  /* ── Columns ─────────────────────────────────────────────────────────── */

  const deptColumns: ColumnsType<DeptRow> = [
    { title: 'Department', dataIndex: 'departmentName', key: 'dept', width: 170, fixed: 'left', sorter: (a, b) => a.departmentName.localeCompare(b.departmentName), render: (v: string, r) => (
      <div>
        <Text strong style={{ fontSize: 12.5 }}>{v}</Text>
        <div><Text type="secondary" style={{ fontSize: 11 }}>{r.divisionName} · {r.sectionName}</Text></div>
      </div>
    ) },
    { title: 'Item Code', dataIndex: 'itemCode', key: 'code', width: 120, sorter: (a, b) => a.itemCode.localeCompare(b.itemCode) },
    { title: 'Family', key: 'family', width: 90, render: (_, r) => <FamilyChip family={r.family} /> },
    { title: 'Product Name', dataIndex: 'itemName', key: 'item', width: 200, sorter: (a, b) => a.itemName.localeCompare(b.itemName) },
    { title: 'Target', dataIndex: 'target', key: 'target', align: 'right', width: 95, sorter: (a, b) => a.target - b.target,
      onHeaderCell: () => ({ className: 'erp-pr-target-header' }),
      onCell: () => ({ className: 'erp-pr-target-cell' }),
      render: (v: number) => <span className="erp-pr-target-value">{fmt(v)}</span> },
    { title: 'Per Unit Weight', key: 'perUnitWeight', width: 115, render: (_, r) => (
      <Text type="secondary" style={{ fontVariantNumeric: 'tabular-nums', fontSize: 12 }}>{perUnitWeightLabel(r.uomCode, r.weightPerPiece, r.weightPerMeter) ?? '—'}</Text>
    ) },
    { title: 'Actual PCS', dataIndex: 'actual', key: 'actual', align: 'right', width: 100, sorter: (a, b) => a.actual - b.actual, render: (v: number) => fmt(v) },
    { title: 'UOM', dataIndex: 'uomCode', key: 'uom', width: 70 },
    { title: 'Achievement', dataIndex: 'achievement', key: 'ach', align: 'center', width: 110, sorter: (a, b) => n(a.achievement) - n(b.achievement), render: (v: number | null) => <AchievementBadge value={v} /> },
    { title: 'Efficiency %', dataIndex: 'efficiency', key: 'eff', align: 'right', width: 100, sorter: (a, b) => n(a.efficiency) - n(b.efficiency), render: (v: number | null) => (v == null ? <Text type="secondary">–</Text> : <span style={{ fontVariantNumeric: 'tabular-nums' }}>{pct(v)}</span>) },
    { title: 'Actual KG', key: 'actualKg', align: 'right', width: 100, sorter: (a, b) => n(a.actualKg) - n(b.actualKg), render: (_, r) => <Text style={{ fontVariantNumeric: 'tabular-nums' }}>{fmt2(r.actualKg)}</Text> },
    { title: 'Rejection (KG)', dataIndex: 'scrap', key: 'scrap', align: 'right', width: 100, sorter: (a, b) => a.scrap - b.scrap, render: (v: number) => <Text strong style={{ color: '#dc2626', fontVariantNumeric: 'tabular-nums' }}>{fmt2(v)}</Text> },
    { title: 'Rejection %', dataIndex: 'scrapPct', key: 'scrapPct', align: 'center', width: 100, sorter: (a, b) => n(a.scrapPct) - n(b.scrapPct), render: (v: number | null) => <ScrapRateBadge value={v} /> },
  ];

  const deptSummaryColumns: ColumnsType<DeptSummaryRow> = [
    { title: 'Department', dataIndex: 'departmentName', key: 'dept', width: 200, fixed: 'left', sorter: (a, b) => a.departmentName.localeCompare(b.departmentName), render: (v: string, r) => (
      <div>
        <Text strong style={{ fontSize: 12.5 }}>{v}</Text>
        <div><Text type="secondary" style={{ fontSize: 11 }}>{r.divisionName} · {r.sectionName}</Text></div>
      </div>
    ) },
    { title: 'Target', dataIndex: 'target', key: 'target', align: 'right', width: 100, sorter: (a, b) => a.target - b.target,
      onHeaderCell: () => ({ className: 'erp-pr-target-header' }),
      onCell: () => ({ className: 'erp-pr-target-cell' }),
      render: (v: number) => <span className="erp-pr-target-value">{fmt(v)}</span> },
    { title: 'Per Unit Weight', key: 'perUnitWeight', width: 120, render: (_, r) => (
      r.perUnitWeight
        ? <Text type="secondary" style={{ fontVariantNumeric: 'tabular-nums', fontSize: 12 }}>{r.perUnitWeight}</Text>
        : <Tooltip title="Mixed / not applicable at department level"><Text type="secondary">—</Text></Tooltip>
    ) },
    { title: 'Actual PCS', dataIndex: 'actual', key: 'actual', align: 'right', width: 100, sorter: (a, b) => a.actual - b.actual, render: (v: number) => fmt(v) },
    { title: 'UOM', key: 'uom', width: 95, render: (_, r) => (
      r.uomCodes.length === 1
        ? r.uomCodes[0]
        : <Tooltip title={r.uomCodes.join(', ')}><Tag color="orange" style={{ marginInlineEnd: 0 }}>Mixed</Tag></Tooltip>
    ) },
    { title: 'Achievement', dataIndex: 'achievement', key: 'ach', align: 'center', width: 110, sorter: (a, b) => n(a.achievement) - n(b.achievement), render: (v: number | null) => <AchievementBadge value={v} /> },
    { title: 'Efficiency %', dataIndex: 'efficiency', key: 'eff', align: 'right', width: 105, sorter: (a, b) => n(a.efficiency) - n(b.efficiency), render: (v: number | null) => (v == null ? <Text type="secondary">–</Text> : <span style={{ fontVariantNumeric: 'tabular-nums' }}>{pct(v)}</span>) },
    { title: 'Actual KG', key: 'actualKg', align: 'right', width: 110, sorter: (a, b) => a.actualKg - b.actualKg, render: (_, r) => <Text style={{ fontVariantNumeric: 'tabular-nums' }}>{fmt2(r.actualKg)}</Text> },
    { title: 'Rejection (KG)', dataIndex: 'scrap', key: 'scrap', align: 'right', width: 105, sorter: (a, b) => a.scrap - b.scrap, render: (v: number) => <Text strong style={{ color: '#dc2626', fontVariantNumeric: 'tabular-nums' }}>{fmt2(v)}</Text> },
    { title: 'Rejection %', dataIndex: 'scrapPct', key: 'rej', align: 'center', width: 105, sorter: (a, b) => n(a.scrapPct) - n(b.scrapPct), render: (v: number | null) => <ScrapRateBadge value={v} /> },
  ];

  const scrapColumns: ColumnsType<ScrapRow> = [
    {
      title: 'Division', key: 'division', width: 150, fixed: 'left',
      sorter: (a, b) => a.itemDivision.localeCompare(b.itemDivision),
      render: (_, r) => (
        <div>
          <Text strong style={{ fontSize: 12 }}>{r.itemDivision || <Text type="secondary">—</Text>}</Text>
          <div style={{ display: 'flex', gap: 4, fontSize: 11, color: 'var(--theme-text-secondary)' }}>
            <span>{r.itemSection || '—'}</span>
            {r.itemSection && r.itemDepartment && <span>·</span>}
            <span>{r.itemDepartment || '—'}</span>
          </div>
        </div>
      ),
    },
    { title: 'Item Type', key: 'itemType', width: 115, sorter: (a, b) => itemTypeLabel(a.itemType).localeCompare(itemTypeLabel(b.itemType)), render: (_, r) => (
      <Tag color="geekblue" style={{ marginInlineEnd: 0, padding: '1px 5px', fontSize: 10.5, fontWeight: 600, borderRadius: 4 }}>{itemTypeLabel(r.itemType)}</Tag>
    ) },
    { title: 'Material Role / Use', key: 'role', width: 130, sorter: (a, b) => a.materialRole.localeCompare(b.materialRole), render: (_, r) => (
      r.materialRole
        ? <Tag color="cyan" style={{ marginInlineEnd: 0, padding: '1px 5px', fontSize: 10.5, fontWeight: 600, borderRadius: 4 }}>{r.materialRole}</Tag>
        : <Text type="secondary">—</Text>
    ) },
    { title: 'Family', key: 'family', width: 85, render: (_, r) => <FamilyChip family={r.family} /> },
    { title: 'Target', dataIndex: 'target', key: 'target', align: 'right', width: 85, sorter: (a, b) => a.target - b.target, render: (v: number) => fmt(v) },
    { title: 'Item Name', key: 'itemName', width: 200, sorter: (a, b) => a.itemName.localeCompare(b.itemName), render: (_, r) => (
      <Tooltip title={r.itemName}>
        <div style={{ lineHeight: 1.25 }}>
          <div style={{ fontSize: 12, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 195 }}>{r.itemName}</div>
          <Text type="secondary" style={{ fontSize: 10.5, lineHeight: 1.1, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 195 }}>{r.itemCode}</Text>
        </div>
      </Tooltip>
    ) },
    { title: 'UOM', dataIndex: 'uomCode', key: 'uom', width: 60 },
    { title: 'Per Unit Weight', key: 'perUnitWeight', width: 110, render: (_, r) => (
      <Text type="secondary" style={{ fontVariantNumeric: 'tabular-nums', fontSize: 12 }}>{perUnitWeightLabel(r.uomCode, r.weightPerPiece, r.weightPerMeter) ?? '—'}</Text>
    ) },
    { title: 'Actual PCS', dataIndex: 'actual', key: 'actual', align: 'right', width: 85, sorter: (a, b) => a.actual - b.actual, render: (v: number) => fmt(v) },
    { title: 'Actual KG', key: 'actualKg', align: 'right', width: 100, sorter: (a, b) => n(a.actualKg) - n(b.actualKg), render: (_, r) => <Text style={{ fontVariantNumeric: 'tabular-nums' }}>{fmt2(r.actualKg)}</Text> },
    { title: 'Rejection (KG)', dataIndex: 'scrap', key: 'scrap', align: 'right', width: 95, sorter: (a, b) => a.scrap - b.scrap, render: (v: number) => <Text strong style={{ color: '#dc2626', fontVariantNumeric: 'tabular-nums' }}>{fmt2(v)}</Text> },
    { title: 'Rejection %', dataIndex: 'scrapRate', key: 'rate', align: 'right', width: 95, sorter: (a, b) => n(a.scrapRate) - n(b.scrapRate), render: (v: number | null) => <ScrapRateBadge value={v} /> },
  ];

  const familyColumns: ColumnsType<FamilyRow> = [
    { title: 'Production Family', dataIndex: 'family', key: 'family', width: 160, fixed: 'left', sorter: (a, b) => a.family.localeCompare(b.family), render: (v: string) => <FamilyChip family={v} /> },
    { title: 'UOMs', dataIndex: 'uomCodes', key: 'uoms', width: 220, render: (v: string) => <Tag>{v}</Tag> },
    { title: 'Target', dataIndex: 'target', key: 'target', align: 'right', width: 100, render: (v: number) => fmt(v) },
    { title: 'Actual', dataIndex: 'actual', key: 'actual', align: 'right', width: 100, render: (v: number) => fmt(v) },
    { title: 'Actual KG', dataIndex: 'actualKg', key: 'actualKg', align: 'right', width: 100, render: (v: number) => fmt2(v) },
    { title: 'Rejection (KG)', dataIndex: 'scrap', key: 'scrap', align: 'right', width: 100, render: (v: number) => fmt(v) },
    { title: 'Achievement', dataIndex: 'achievement', key: 'ach', align: 'center', width: 110, render: (v: number | null) => <AchievementBadge value={v} /> },
    { title: 'Entries', dataIndex: 'entryCount', key: 'entries', align: 'right', width: 80, render: (v: number) => fmt(v) },
  ];

  const targetColumns: ColumnsType<(DeptRow & { variance: number })> = [
    { title: 'Department', dataIndex: 'departmentName', key: 'dept', width: 170, fixed: 'left', sorter: (a, b) => a.departmentName.localeCompare(b.departmentName), render: (v: string, r) => (
      <div>
        <Text strong style={{ fontSize: 12.5 }}>{v}</Text>
        <div><Text type="secondary" style={{ fontSize: 11 }}>{r.divisionName}</Text></div>
      </div>
    ) },
    { title: 'Item Code', dataIndex: 'itemCode', key: 'code', width: 120, sorter: (a, b) => a.itemCode.localeCompare(b.itemCode) },
    { title: 'Item', dataIndex: 'itemName', key: 'item', width: 200, sorter: (a, b) => a.itemName.localeCompare(b.itemName) },
    { title: 'UOM', dataIndex: 'uomCode', key: 'uom', width: 70 },
    { title: 'Per Unit Weight', key: 'perUnitWeight', width: 110, render: (_, r) => (
      <Text type="secondary" style={{ fontVariantNumeric: 'tabular-nums', fontSize: 12 }}>{perUnitWeightLabel(r.uomCode, r.weightPerPiece, r.weightPerMeter) ?? '—'}</Text>
    ) },
    { title: 'Target', dataIndex: 'target', key: 'target', align: 'right', width: 95, sorter: (a, b) => a.target - b.target, render: (v: number) => fmt(v) },
    { title: 'Actual', dataIndex: 'actual', key: 'actual', align: 'right', width: 95, sorter: (a, b) => a.actual - b.actual, render: (v: number) => fmt(v) },
    { title: 'Actual KG', key: 'actualKg', align: 'right', width: 100, sorter: (a, b) => n(a.actualKg) - n(b.actualKg), render: (_, r) => <Text style={{ fontVariantNumeric: 'tabular-nums' }}>{r.actualKg == null ? '—' : fmt2(r.actualKg)}</Text> },
    { title: 'Variance', dataIndex: 'variance', key: 'var', align: 'right', width: 95, sorter: (a, b) => a.variance - b.variance, render: (v: number) => (
      <span style={{ fontVariantNumeric: 'tabular-nums', color: v >= 0 ? '#16a34a' : '#dc2626', fontWeight: 600 }}>{v >= 0 ? '+' : ''}{fmt(v)}</span>
    ) },
    { title: 'Achievement', dataIndex: 'achievement', key: 'ach', align: 'center', width: 110, sorter: (a, b) => n(a.achievement) - n(b.achievement), render: (v: number | null) => <AchievementBadge value={v} /> },
  ];

  const machineTargetColumns: ColumnsType<MachineTargetRow> = [
    { title: 'Machine', key: 'machine', width: 190, fixed: 'left', render: (_, r) => (
      <div>
        <Text strong style={{ fontSize: 12.5 }}>{r.machine?.name || r.machine?.machineCode || '–'}</Text>
        {r.machine?.machineCode && <div><Text type="secondary" style={{ fontSize: 11 }}>{r.machine.machineCode}{r.machine.machineId ? ` · ${r.machine.machineId}` : ''}</Text></div>}
      </div>
    ) },
    { title: 'Shift', key: 'shift', width: 150, render: (_, r) => r.shift?.name || r.shift?.shiftCode || '–' },
    { title: 'Item', key: 'item', width: 200, render: (_, r) => r.item?.name || r.item?.itemCode || '–' },
    { title: 'UOM', key: 'uom', width: 80, render: (_, r) => r.uom?.code || '–' },
    { title: 'Target Qty', dataIndex: 'targetQuantity', key: 'target', align: 'right', width: 100, render: (v) => fmt(v) },
    { title: 'Std Hrs', dataIndex: 'standardHours', key: 'std', align: 'right', width: 80, render: (v) => fmt2(v) },
    { title: 'Effective From', dataIndex: 'effectiveFrom', key: 'from', width: 110, render: (v?: string | null) => dt(v) },
    { title: 'Status', dataIndex: 'status', key: 'status', width: 90, render: (v: string) => <Tag color={statusColor(v)}>{v}</Tag> },
  ];

  const entryColumns: ColumnsType<ProdEntryRow> = [
    { title: 'Date', dataIndex: 'entryDate', key: 'date', width: 105, fixed: 'left', render: (v) => dt(v) },
    { title: 'Shift', key: 'shift', width: 130, render: (_, r) => r.shift?.name ?? '–' },
    { title: 'Machine', dataIndex: 'machineNo', key: 'machine', width: 100, render: (v) => v || '–' },
    { title: 'Item', key: 'item', width: 210, render: (_, r) => r.item?.name ?? r.item?.itemCode ?? '–' },
    { title: 'UOM', key: 'uom', width: 70, render: (_, r) => r.uom?.code ?? '–' },
    { title: 'Per Unit Weight', key: 'perUnitWeight', width: 110, render: (_, r) => (
      <Text type="secondary" style={{ fontVariantNumeric: 'tabular-nums', fontSize: 12 }}>{perUnitWeightLabel(r.uom?.code ?? '', r.item?.weightPerPiece, r.item?.weightPerMeter) ?? '—'}</Text>
    ) },
    { title: 'Target', dataIndex: 'targetQuantity', key: 'target', align: 'right', width: 90, render: (v: number) => fmt(v) },
    { title: 'Actual', dataIndex: 'actualQuantity', key: 'actual', align: 'right', width: 90, render: (v: number) => fmt(v) },
    { title: 'Actual KG', key: 'actualKg', align: 'right', width: 100, render: (_, r) => {
      const kg = calcActualKg(r.uom?.code ?? '', n(r.actualQuantity), r.item?.weightPerPiece, r.item?.weightPerMeter);
      return <Text style={{ fontVariantNumeric: 'tabular-nums' }}>{kg == null ? '—' : fmt2(kg)}</Text>;
    } },
    { title: 'Rejection (KG)', dataIndex: 'scrapQuantity', key: 'scrap', align: 'right', width: 85, render: (v: number) => (v > 0 ? <Text style={{ color: '#dc2626' }}>{fmt2(v)}</Text> : fmt(v)) },
    { title: 'Run Hrs', dataIndex: 'runningHours', key: 'run', align: 'right', width: 80, render: (v: number) => fmt2(v) },
    { title: 'Operator', dataIndex: 'operatorName', key: 'op', width: 120, render: (v) => v || '–' },
  ];

  const orderColumns: ColumnsType<ProdOrderRow> = [
    { title: 'Order #', dataIndex: 'orderNumber', key: 'no', width: 150, fixed: 'left' },
    { title: 'Product', key: 'product', width: 190, render: (_, r) => r.product?.name ?? '–' },
    { title: 'UOM', key: 'uom', width: 70, render: (_, r) => r.uom?.code ?? '–' },
    { title: 'Per Unit Weight', key: 'perUnitWeight', width: 110, render: (_, r) => (
      <Text type="secondary" style={{ fontVariantNumeric: 'tabular-nums', fontSize: 12 }}>{perUnitWeightLabel(r.uom?.code ?? '', r.product?.weightPerPiece, r.product?.weightPerMeter) ?? '—'}</Text>
    ) },
    { title: 'Planned', dataIndex: 'plannedQuantity', key: 'planned', align: 'right', width: 90, render: (v: number) => fmt(v) },
    { title: 'Produced', key: 'produced', align: 'right', width: 90, render: (_, r) => fmt(n((r as any).completedQuantity ?? (r as any).producedQuantity)) },
    { title: 'Actual KG', key: 'actualKg', align: 'right', width: 100, render: (_, r) => {
      const produced = n((r as any).completedQuantity ?? (r as any).producedQuantity);
      const kg = calcActualKg(r.uom?.code ?? '', produced, r.product?.weightPerPiece, r.product?.weightPerMeter);
      return <Text style={{ fontVariantNumeric: 'tabular-nums' }}>{kg == null ? '—' : fmt2(kg)}</Text>;
    } },
    { title: 'Scrap', key: 'scrap', align: 'right', width: 80, render: (_, r) => fmt(n((r as any).scrappedQuantity)) },
    { title: 'Status', dataIndex: 'status', key: 'status', width: 110, render: (v: string) => <Tag color={statusColor(v)}>{v}</Tag> },
    { title: 'Priority', dataIndex: 'priority', key: 'priority', width: 100 },
    { title: 'Due', dataIndex: 'dueDate', key: 'due', width: 105, render: (v) => dt(v) },
  ];

  const shipmentColumns: ColumnsType<SalesDeliveryRow> = [
    { title: 'Delivery #', dataIndex: 'deliveryNumber', key: 'no', width: 150, fixed: 'left', sorter: (a, b) => a.deliveryNumber.localeCompare(b.deliveryNumber) },
    { title: 'Date', dataIndex: 'deliveryDate', key: 'date', width: 105, sorter: (a, b) => dayjs(a.deliveryDate).valueOf() - dayjs(b.deliveryDate).valueOf(), render: (v) => dt(v) },
    { title: 'Customer', key: 'customer', width: 190, render: (_, r) => (
      <div>
        <Text strong style={{ fontSize: 12.5 }}>{r.customer?.companyName || '–'}</Text>
        {r.customer?.customerCode && <div><Text type="secondary" style={{ fontSize: 11 }}>{r.customer.customerCode}</Text></div>}
      </div>
    ) },
    { title: 'Order', key: 'order', width: 140, render: (_, r) => r.salesOrder?.orderNumber || '–' },
    { title: 'Subtotal', dataIndex: 'subtotal', key: 'subtotal', align: 'right', width: 100, render: (v: number) => fmt2(v) },
    { title: 'Tax', dataIndex: 'taxAmount', key: 'tax', align: 'right', width: 90, render: (v: number) => fmt2(v) },
    { title: 'Total', dataIndex: 'totalAmount', key: 'total', align: 'right', width: 110, sorter: (a, b) => n(a.totalAmount) - n(b.totalAmount), render: (v: number) => <Text strong style={{ fontVariantNumeric: 'tabular-nums' }}>{fmt2(v)}</Text> },
    { title: 'Status', dataIndex: 'status', key: 'status', width: 110, render: (v: string) => <Tag color={statusColor(v)}>{v}</Tag> },
    { title: 'Carrier', dataIndex: 'carrier', key: 'carrier', width: 120, render: (v) => v || '–' },
    { title: 'Tracking', dataIndex: 'trackingNumber', key: 'tracking', width: 130, render: (v) => v || '–' },
  ];

  /* ── Exports ── */
  const exportCsv = (tab: string) => {
    switch (tab) {
      case 'dept':
        downloadCsv('item-wise-production', ['Department', 'Division', 'Section', 'Item Code', 'Family', 'Product Name', 'Target', 'Per Unit Weight', 'Actual PCS', 'UOM', 'Achievement %', 'Efficiency %', 'Actual KG', 'Rejection (KG)', 'Rejection %'],
          deptRows.map((r) => [r.departmentName, r.divisionName, r.sectionName, r.itemCode, r.family || 'Other', r.itemName, r.target, perUnitWeightLabel(r.uomCode, r.weightPerPiece, r.weightPerMeter) ?? '—', r.actual, r.uomCode, r.achievement ?? '', r.efficiency ?? '', r.actualKg ?? '', r.scrap, r.scrapPct == null ? '' : r.scrapPct.toFixed(2)]));
        break;
      case 'scrap':
        downloadCsv('item-master-mapping-scrap-rejection', ['Division', 'Section', 'Department', 'Item Type', 'Material Role / Use', 'Family', 'Target', 'Item Name', 'Item Code', 'UOM', 'Per Unit Weight', 'Actual PCS', 'Actual KG', 'Rejection (KG)', 'Rejection %'],
          scrapRows.map((r) => [r.itemDivision, r.itemSection, r.itemDepartment, itemTypeLabel(r.itemType), r.materialRole || '—', r.family || 'Other', r.target, r.itemName, r.itemCode, r.uomCode, perUnitWeightLabel(r.uomCode, r.weightPerPiece, r.weightPerMeter) ?? '—', r.actual, r.actualKg ?? '', r.scrap, r.scrapRate == null ? '' : r.scrapRate.toFixed(2)]));
        break;
      case 'target':
        downloadCsv('target-vs-actual', ['Department', 'Division', 'Item Code', 'Item', 'UOM', 'Per Unit Weight', 'Target', 'Actual', 'Actual KG', 'Variance', 'Achievement %'],
          targetRows.map((r) => [r.departmentName, r.divisionName, r.itemCode, r.itemName, r.uomCode, perUnitWeightLabel(r.uomCode, r.weightPerPiece, r.weightPerMeter) ?? '—', r.target, r.actual, r.actualKg ?? '', r.variance, r.achievement ?? '']));
        break;
      case 'family':
        downloadCsv('production-family', ['Production Family', 'UOMs', 'Target', 'Actual', 'Actual KG', 'Rejection (KG)', 'Achievement %', 'Entries'],
          familyRows.map((r) => [FAMILY_LABELS[r.family] ?? r.family, r.uomCodes, r.target, r.actual, r.actualKg, r.scrap, r.achievement ?? '', r.entryCount]));
        break;
      case 'entries':
        downloadCsv('production-entries', ['Date', 'Shift', 'Machine', 'Item', 'UOM', 'Per Unit Weight', 'Target', 'Actual', 'Actual KG', 'Rejection (KG)', 'Run Hrs', 'Operator'],
          entries.map((r) => [dt(r.entryDate), r.shift?.name ?? '', r.machineNo ?? '', r.item?.name ?? '', r.uom?.code ?? '', perUnitWeightLabel(r.uom?.code ?? '', r.item?.weightPerPiece, r.item?.weightPerMeter) ?? '—', r.targetQuantity, r.actualQuantity, calcActualKg(r.uom?.code ?? '', n(r.actualQuantity), r.item?.weightPerPiece, r.item?.weightPerMeter) ?? '', r.scrapQuantity, r.runningHours, r.operatorName ?? '']));
        break;
      case 'orders':
        downloadCsv('production-orders', ['Order #', 'Product', 'UOM', 'Per Unit Weight', 'Planned', 'Produced', 'Actual KG', 'Scrap', 'Status', 'Priority', 'Due'],
          orders.map((r) => {
            const produced = n((r as any).completedQuantity ?? (r as any).producedQuantity);
            return [r.orderNumber, r.product?.name ?? '', r.uom?.code ?? '', perUnitWeightLabel(r.uom?.code ?? '', r.product?.weightPerPiece, r.product?.weightPerMeter) ?? '—', r.plannedQuantity, produced, calcActualKg(r.uom?.code ?? '', produced, r.product?.weightPerPiece, r.product?.weightPerMeter) ?? '', n((r as any).scrappedQuantity), r.status, r.priority, dt(r.dueDate)];
          }));
        break;
      case 'shipments':
        downloadCsv('shipment-report', ['Delivery #', 'Date', 'Customer', 'Order', 'Subtotal', 'Tax', 'Total', 'Status', 'Carrier', 'Tracking'],
          shipments.map((r) => [r.deliveryNumber, dt(r.deliveryDate), r.customer?.companyName ?? '', r.salesOrder?.orderNumber ?? '', r.subtotal, r.taxAmount, r.totalAmount, r.status, r.carrier ?? '', r.trackingNumber ?? '']));
        break;
      default: break;
    }
    message.success('CSV exported');
  };

  const exportPdfTab = (tab: string) => {
    const sub = `Generated ${dayjs().format('DD MMM YYYY HH:mm')} · ${dateLabel}${filters.divisionId || filters.departmentId ? ' · Filtered' : ''}`;
    let tables: PdfTable[] = [];
    switch (tab) {
      case 'dept':
        tables = [{ head: ['Department', 'Division', 'Item Code', 'Family', 'Product Name', 'Target', 'Per Unit Weight', 'Actual PCS', 'UOM', 'Achievement %', 'Efficiency %', 'Actual KG', 'Rejection (KG)', 'Rejection %'], body: deptRows.map((r) => [r.departmentName, r.divisionName, r.itemCode, r.family || 'Other', r.itemName, r.target, perUnitWeightLabel(r.uomCode, r.weightPerPiece, r.weightPerMeter) ?? '—', r.actual, r.uomCode, r.achievement == null ? '' : r.achievement.toFixed(1), r.efficiency == null ? '' : r.efficiency.toFixed(1), r.actualKg ?? '', r.scrap, r.scrapPct == null ? '' : r.scrapPct.toFixed(2)]) }];
        break;
      case 'scrap':
        tables = [{ head: ['Division', 'Section', 'Department', 'Item Type', 'Material Role / Use', 'Family', 'Target', 'Item Name', 'Item Code', 'UOM', 'Per Unit Weight', 'Actual PCS', 'Actual KG', 'Rejection (KG)', 'Rejection %'], body: scrapRows.map((r) => [r.itemDivision, r.itemSection, r.itemDepartment, itemTypeLabel(r.itemType), r.materialRole || '—', r.family || 'Other', r.target, r.itemName, r.itemCode, r.uomCode, perUnitWeightLabel(r.uomCode, r.weightPerPiece, r.weightPerMeter) ?? '—', r.actual, r.actualKg ?? '', r.scrap, r.scrapRate == null ? '' : r.scrapRate.toFixed(2)]) }];
        break;
      case 'target':
        tables = [{ head: ['Department', 'Item Code', 'Item', 'UOM', 'Per Unit Weight', 'Target', 'Actual', 'Actual KG', 'Variance', 'Achievement %'], body: targetRows.map((r) => [r.departmentName, r.itemCode, r.itemName, r.uomCode, perUnitWeightLabel(r.uomCode, r.weightPerPiece, r.weightPerMeter) ?? '—', r.target, r.actual, r.actualKg ?? '', r.variance, r.achievement == null ? '' : r.achievement.toFixed(1)]) }];
        break;
      case 'family':
        tables = [{ head: ['Production Family', 'UOMs', 'Target', 'Actual', 'Actual KG', 'Rejection (KG)', 'Achievement %'], body: familyRows.map((r) => [FAMILY_LABELS[r.family] ?? r.family, r.uomCodes, r.target, r.actual, r.actualKg, r.scrap, r.achievement == null ? '' : r.achievement.toFixed(1)]) }];
        break;
      case 'entries':
        tables = [{ head: ['Date', 'Shift', 'Machine', 'Item', 'UOM', 'Per Unit Weight', 'Target', 'Actual', 'Actual KG', 'Rejection (KG)'], body: entries.map((r) => [dt(r.entryDate), r.shift?.name ?? '', r.machineNo ?? '', r.item?.name ?? '', r.uom?.code ?? '', perUnitWeightLabel(r.uom?.code ?? '', r.item?.weightPerPiece, r.item?.weightPerMeter) ?? '—', r.targetQuantity, r.actualQuantity, calcActualKg(r.uom?.code ?? '', n(r.actualQuantity), r.item?.weightPerPiece, r.item?.weightPerMeter) ?? '', r.scrapQuantity]) }];
        break;
      case 'orders':
        tables = [{ head: ['Order #', 'Product', 'UOM', 'Per Unit Weight', 'Planned', 'Produced', 'Actual KG', 'Scrap', 'Status', 'Priority'], body: orders.map((r) => {
          const produced = n((r as any).completedQuantity ?? (r as any).producedQuantity);
          return [r.orderNumber, r.product?.name ?? '', r.uom?.code ?? '', perUnitWeightLabel(r.uom?.code ?? '', r.product?.weightPerPiece, r.product?.weightPerMeter) ?? '—', r.plannedQuantity, produced, calcActualKg(r.uom?.code ?? '', produced, r.product?.weightPerPiece, r.product?.weightPerMeter) ?? '', n((r as any).scrappedQuantity), r.status, r.priority];
        }) }];
        break;
      case 'shipments':
        tables = [{ head: ['Delivery #', 'Date', 'Customer', 'Order', 'Subtotal', 'Tax', 'Total', 'Status', 'Carrier'], body: shipments.map((r) => [r.deliveryNumber, dt(r.deliveryDate), r.customer?.companyName ?? '', r.salesOrder?.orderNumber ?? '', r.subtotal, r.taxAmount, r.totalAmount, r.status, r.carrier ?? '']) }];
        break;
      default: return;
    }
    exportPdf(`production-${tab}`, `Production Report — ${TAB_LABELS[tab]}`, sub, tables);
    message.success('PDF exported');
  };

  const TAB_LABELS: Record<string, string> = {
    dept: 'Item-wise Production', scrap: 'Scrap & Rejection — Item Master Mapping', target: 'Target vs Actual',
    family: 'Production Family', entries: 'Daily Production', orders: 'Production Orders', shipments: 'Shipment',
  };

  const exportMenu: MenuProps['items'] = [
    { key: 'csv', label: 'Export CSV', icon: <FileExcelOutlined /> },
    { key: 'pdf', label: 'Export PDF', icon: <FilePdfOutlined /> },
    { type: 'divider' },
    { key: 'print', label: 'Print', icon: <PrinterOutlined /> },
  ];
  const onExportMenu: MenuProps['onClick'] = ({ key }) => {
    if (key === 'csv') exportCsv(activeTab);
    if (key === 'pdf') exportPdfTab(activeTab);
    if (key === 'print') window.print();
  };

  const resetFilters = () => {
    setFilters({}); setDateRange(null);
  };

  const activeFilterCount =
    Number(!!dateRange) + Number(!!filters.divisionId) + Number(!!filters.departmentId) + Number(!!filters.shiftId) + Number(!!filters.status);

  const kpiCards = (activeTab === 'dept' && (
    <>
      <Col xs={12} sm={8} md={6}><Card className="erp-pr-kpi-card erp-pr-kpi-card--tone-danger erp-pr-kpi-card--target"><Statistic title="Target" value={Math.round(kpi.target)} /></Card></Col>
      <Col xs={12} sm={8} md={6}><Card className="erp-pr-kpi-card erp-pr-kpi-card--tone-success"><Statistic title="Total Actual / Production" value={Math.round(kpi.actual)} /></Card></Col>
      <Col xs={12} sm={8} md={6}><Card className="erp-pr-kpi-card erp-pr-kpi-card--tone-warning"><Statistic title="Achievement %" value={kpi.achievement ?? 0} precision={1} suffix="%" /></Card></Col>
      <Col xs={12} sm={8} md={6}><Card className="erp-pr-kpi-card erp-pr-kpi-card--tone-purple"><Statistic title="Actual KG" value={deptKpiKg.actualKg == null ? 0 : Math.round(deptKpiKg.actualKg * 100) / 100} /></Card></Col>
      <Col xs={12} sm={8} md={6}><Card className="erp-pr-kpi-card erp-pr-kpi-card--tone-danger"><Statistic title="Total Scrap / Rejection (KG)" value={Math.round(kpi.scrap * 100) / 100} /></Card></Col>
      <Col xs={12} sm={8} md={6}><Card className="erp-pr-kpi-card erp-pr-kpi-card--tone-primary"><Statistic title="Rejection %" value={deptKpiKg.rejectionPct ?? 0} precision={1} suffix="%" /></Card></Col>
      <Col xs={12} sm={8} md={6}><Card className="erp-pr-kpi-card erp-pr-kpi-card--tone-cyan"><Statistic title="Efficiency %" value={kpi.efficiency ?? 0} precision={1} suffix="%" /></Card></Col>
    </>
  )) || (activeTab === 'scrap' && (
    <>
      <Col xs={12} sm={8} md={6}><Card className="erp-pr-kpi-card erp-pr-kpi-card--tone-danger"><Statistic title="Total Scrap" value={scrapKpi.scrap} /></Card></Col>
      <Col xs={12} sm={8} md={6}><Card className="erp-pr-kpi-card erp-pr-kpi-card--tone-primary"><Statistic title="Items Mapped" value={scrapKpi.items} /></Card></Col>
      <Col xs={12} sm={8} md={6}><Card className="erp-pr-kpi-card erp-pr-kpi-card--tone-warning"><Statistic title="Scrap Rate" value={scrapKpi.scrapRate} precision={2} suffix="%" /></Card></Col>
      <Col xs={12} sm={8} md={6}><Card className="erp-pr-kpi-card erp-pr-kpi-card--tone-cyan"><Statistic title="Top Department" value={scrapKpi.topDept} /></Card></Col>
    </>
  )) || (activeTab === 'target' && (
    <>
      <Col xs={12} sm={8} md={6}><Card className="erp-pr-kpi-card erp-pr-kpi-card--tone-primary"><Statistic title="Total Target" value={kpi.target} /></Card></Col>
      <Col xs={12} sm={8} md={6}><Card className="erp-pr-kpi-card erp-pr-kpi-card--tone-success"><Statistic title="Total Actual" value={kpi.actual} /></Card></Col>
      <Col xs={12} sm={8} md={6}><Card className="erp-pr-kpi-card erp-pr-kpi-card--tone-warning"><Statistic title="Achievement" value={kpi.achievement ?? 0} precision={1} suffix="%" /></Card></Col>
      <Col xs={12} sm={8} md={6}><Card className="erp-pr-kpi-card erp-pr-kpi-card--tone-cyan"><Statistic title="Machine Targets" value={targetsTotal} /></Card></Col>
    </>
  )) || (activeTab === 'shipments' && (
    <>
      <Col xs={12} sm={8} md={4}><Card className="erp-pr-kpi-card erp-pr-kpi-card--tone-primary"><Statistic title="Total Deliveries" value={shipmentKpi.total} /></Card></Col>
      <Col xs={12} sm={8} md={4}><Card className="erp-pr-kpi-card erp-pr-kpi-card--tone-success"><Statistic title="Delivered" value={shipmentKpi.delivered} /></Card></Col>
      <Col xs={12} sm={8} md={4}><Card className="erp-pr-kpi-card erp-pr-kpi-card--tone-cyan"><Statistic title="Shipped" value={shipmentKpi.shipped} /></Card></Col>
      <Col xs={12} sm={8} md={4}><Card className="erp-pr-kpi-card erp-pr-kpi-card--tone-warning"><Statistic title="Draft" value={shipmentKpi.draft} /></Card></Col>
      <Col xs={12} sm={8} md={4}><Card className="erp-pr-kpi-card erp-pr-kpi-card--tone-purple"><Statistic title="Shipment Value" value={shipmentKpi.value} /></Card></Col>
    </>
  )) || null;

  return (
    <div className="erp-pr">
      <PageHeader
        icon={<BarChartOutlined />}
        title="Production Reports"
        subtitle="Department production, scrap & rejection, target vs actual, shipments, UOM family and order performance"
        extra={
          <Space wrap size={8}>
            <Dropdown menu={{ items: exportMenu, onClick: onExportMenu }}>
              <Button size="middle" icon={<DownloadOutlined />}>Export</Button>
            </Dropdown>
            <Tooltip title="Refresh all reports">
              <Button size="middle" icon={<ReloadOutlined />} loading={loading} onClick={() => loadAll()} />
            </Tooltip>
          </Space>
        }
      />

      <div className="erp-pr__no-print">
        <PageToolbar
          searchValue={search}
          onSearchChange={(v) => { setSearch(v); }}
          searchPlaceholder="Search items, machines, customers…"
          filterCount={activeFilterCount}
          showFilters={showFilters}
          onToggleFilters={() => setShowFilters((f) => !f)}
          onClearFilters={resetFilters}
          hasActiveFilters={activeFilterCount > 0}
          sortInfo={dateLabel}
        />

        {showFilters && (
          <Card className="erp-pr-filter-card" style={{ marginBottom: 10 }} styles={{ body: { padding: '10px 14px 12px' } }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 8, alignItems: 'center', width: '100%', maxWidth: 1440, margin: '0 auto' }}>
              <RangePicker
                allowClear
                value={dateRange}
                onChange={(v) => setDateRange(v as [dayjs.Dayjs | null, dayjs.Dayjs | null] | null)}
                style={{ width: '100%' }}
              />
              <Select
                allowClear showSearch optionFilterProp="label"
                placeholder="Division" value={filters.divisionId} style={{ width: '100%' }}
                options={divisions.map((d) => ({ value: d.id, label: d.name }))}
                onChange={(v) => setFilters((p) => ({ ...p, divisionId: v, departmentId: undefined }))}
              />
              <Select
                allowClear showSearch optionFilterProp="label"
                placeholder="Department" value={filters.departmentId} style={{ width: '100%' }}
                disabled={!filters.divisionId}
                options={departments.map((d) => ({ value: d.id, label: d.name }))}
                onChange={(v) => setFilters((p) => ({ ...p, departmentId: v }))}
              />
              <Select
                allowClear showSearch optionFilterProp="label"
                placeholder="Shift" value={filters.shiftId} style={{ width: '100%' }}
                options={shifts.map((s) => ({ value: s.id, label: `${s.shiftCode} · ${s.name.trim()}` }))}
                onChange={(v) => setFilters((p) => ({ ...p, shiftId: v }))}
              />
              <Select
                allowClear placeholder="Status" value={filters.status} style={{ width: '100%' }}
                options={ORDER_STATUSES.concat(DELIVERY_STATUSES).filter((v, i, a) => a.indexOf(v) === i).map((s) => ({ value: s, label: s }))}
                onChange={(v) => setFilters((p) => ({ ...p, status: v }))}
              />
            </div>
          </Card>
        )}
      </div>

      {error && (
        <Alert message={error} type="warning" showIcon closable onClose={() => setError(null)}
          style={{ marginBottom: 6 }} className="erp-pr__no-print" />
      )}

      <Alert
        type="info"
        showIcon
        icon={<InfoCircleOutlined />}
        className="erp-pr__no-print"
        style={{ marginBottom: 2 }}
        message={
          <span style={{ fontSize: 12.5 }}>
            Reporting scope: <b>{dateLabel}</b> ·{' '}
            {filters.divisionId ? `Division filter applied` : 'All divisions'} ·{' '}
            {filters.departmentId ? `Department filter applied` : 'All departments'}.
            <Text type="secondary" style={{ marginLeft: 8 }}>
              Note: Production Assembly module is not configured in this system — assembly output is not included.
            </Text>
          </span>
        }
      />

      <Row gutter={[12, 12]} style={{ marginBottom: 6 }}>
        {kpiCards}
      </Row>

      <Tabs
        size="small"
        activeKey={activeTab}
        onChange={setActiveTab}
        items={[
          {
            key: 'dept',
            label: <span><BarChartOutlined /> Item-wise Production</span>,
            children: (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <Card size="small" className="erp-section-card"
                  title={`ITEM-WISE PRODUCTION REPORT — Target vs Actual · Scrap · Performance (${fmt(kpi.entryCount)} entries)`}
                  extra={<Space size={6}><Tooltip title="Scrap & rejection detail in the next tab"><Tag icon={<AlertOutlined />} color="red">Scrap {fmt(kpi.scrap)}</Tag></Tooltip></Space>}>
                  <ERPTable<DeptRow>
                    rowKey="key"
                    dense
                    columns={deptColumns}
                    dataSource={filteredDeptRows}
                    loading={loading}
                    scroll={{ x: 1280 }}
                    pagination={{ pageSize: 20, showSizeChanger: true, showTotal: (t) => `${fmt(t)} rows` }}
                    emptyTitle="No item production data"
                    emptyDescription="No production entries match the current filters."
                  />
                </Card>

                <Card size="small" className="erp-section-card"
                  title={`DEPARTMENT-WISE PRODUCTION REPORT — ${fmt(deptSummaryRows.length)} departments`}
                  extra={<Tag color="blue">One row per department</Tag>}>
                  <ERPTable<DeptSummaryRow>
                    rowKey="key"
                    dense
                    columns={deptSummaryColumns}
                    dataSource={deptSummaryRows}
                    loading={loading}
                    scroll={{ x: 1180 }}
                    pagination={{
                      current: deptPage,
                      pageSize: deptPageSize,
                      pageSizeOptions: ['10', '15', '20', '50', '100'],
                      showSizeChanger: true,
                      showTotal: (t) => `${fmt(t)} departments`,
                      position: ['topRight', 'bottomRight'],
                      onChange: (p) => setDeptPage(p),
                      onShowSizeChange: (_, size) => { setDeptPageSize(size); setDeptPage(1); },
                    }}
                    emptyTitle="No department data"
                    emptyDescription="No departments match the selected division."
                  />
                </Card>
              </div>
            ),
          },
          {
            key: 'scrap',
            label: <span><AlertOutlined /> Scrap & Rejection</span>,
            children: (
              <Card size="small" className="erp-section-card"
                title={`Scrap & Rejection — Item Master Mapping (${fmt(scrapKpi.items)} items, total scrap ${fmt(scrapKpi.scrap)})`}>
                <ERPTable<ScrapRow>
                  rowKey="key"
                  dense
                  columns={scrapColumns}
                  dataSource={filteredScrapRows}
                  loading={loading}
                  scroll={{ x: 1180 }}
                  pagination={{ pageSize: 20, showSizeChanger: true, showTotal: (t) => `${fmt(t)} rows` }}
                  emptyTitle="No mapped items"
                  emptyDescription="Item Master items of type Raw Material, Work in Progress, Semi-Finished or Finished Good with production entries will appear here."
                />
              </Card>
            ),
          },
          {
            key: 'target',
            label: <span><AimOutlined /> Target vs Actual</span>,
            children: (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <Card size="small" className="erp-section-card"
                  title={`Target vs Actual Performance — ${fmt(targetRows.length)} department/item lines`}>
                  <ERPTable<(DeptRow & { variance: number })>
                    rowKey="key"
                    dense
                    columns={targetColumns}
                    dataSource={targetRows}
                    loading={loading}
                    scroll={{ x: 1120 }}
                    pagination={{ pageSize: 20, showSizeChanger: true, showTotal: (t) => `${fmt(t)} lines` }}
                    emptyTitle="No target vs actual data"
                    emptyDescription="Production entries matching the current filters will appear here."
                  />
                </Card>
                <Card size="small" className="erp-section-card"
                  title={`Configured Machine Targets in scope — ${fmt(targetsTotal)}`}>
                  <ERPTable<MachineTargetRow>
                    rowKey="id"
                    dense
                    columns={machineTargetColumns}
                    dataSource={targets}
                    loading={loading}
                    scroll={{ x: 1080 }}
                    pagination={{ current: targetsPage, pageSize: 20, showSizeChanger: true, total: targetsTotal, showTotal: (t) => `${fmt(t)} targets`, onChange: (p) => loadTargets(p) }}
                    emptyTitle="No machine targets found"
                    emptyDescription="Configured machine targets for the current filters will appear here."
                  />
                </Card>
              </div>
            ),
          },
          {
            key: 'family',
            label: <span><ClusterOutlined /> Production Family</span>,
            children: (
              <Card size="small" className="erp-section-card"
                title={`Production Family — UOM family aggregation (WEIGHT · COUNT · LENGTH)`}
                extra={<Tag icon={<AppstoreOutlined />} color="purple">{fmt(familyRows.length)} families</Tag>}>
                <ERPTable<FamilyRow>
                  rowKey="key"
                  dense
                  columns={familyColumns}
                  dataSource={filteredFamilyRows}
                  loading={loading}
                  scroll={{ x: 800 }}
                  pagination={{ pageSize: 10, hideOnSinglePage: true }}
                  emptyTitle="No family aggregation"
                  emptyDescription="Production entries will be grouped by their UOM family."
                />
              </Card>
            ),
          },
          {
            key: 'entries',
            label: <span><CarryOutOutlined /> Daily Production</span>,
            children: (
              <Card size="small" className="erp-section-card"
                title={`Daily Production Entries — ${fmt(entriesTotal)} records`}>
                <ERPTable<ProdEntryRow>
                  rowKey="id"
                  dense
                  columns={entryColumns}
                  dataSource={entries}
                  loading={loading}
                  scroll={{ x: 1120 }}
                  pagination={{ current: entriesPage, pageSize: 20, showSizeChanger: true, total: entriesTotal, showTotal: (t) => `${fmt(t)} entries`, onChange: (p) => loadEntries(p) }}
                  emptyTitle="No production entries"
                  emptyDescription="No daily production entries match the current filters."
                />
              </Card>
            ),
          },
          {
            key: 'orders',
            label: <span><CarryOutOutlined /> Production Orders</span>,
            children: (
              <Card size="small" className="erp-section-card"
                title={`Production Orders — ${fmt(ordersTotal)} orders`}>
                <ERPTable<ProdOrderRow>
                  rowKey="id"
                  dense
                  columns={orderColumns}
                  dataSource={orders}
                  loading={loading}
                  scroll={{ x: 980 }}
                  pagination={{ current: ordersPage, pageSize: 20, showSizeChanger: true, total: ordersTotal, showTotal: (t) => `${fmt(t)} orders`, onChange: (p) => loadOrders(p) }}
                  emptyTitle="No production orders"
                  emptyDescription="No production orders match the current filters."
                />
              </Card>
            ),
          },
          {
            key: 'shipments',
            label: <span><CarryOutOutlined /> Shipment</span>,
            children: (
              <Card size="small" className="erp-section-card"
                title={`Shipment Report — ${fmt(shipmentsTotal)} sales deliveries`}>
                <ERPTable<SalesDeliveryRow>
                  rowKey="id"
                  dense
                  columns={shipmentColumns}
                  dataSource={shipments}
                  loading={loading}
                  scroll={{ x: 1320 }}
                  pagination={{ current: shipmentsPage, pageSize: 20, showSizeChanger: true, total: shipmentsTotal, showTotal: (t) => `${fmt(t)} deliveries`, onChange: (p) => loadShipments(p) }}
                  emptyTitle="No shipment data"
                  emptyDescription="No sales deliveries match the current filters."
                />
              </Card>
            ),
          },
        ]}
      />
    </div>
  );
};

export default ProductionReports;