import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Alert, App, Badge, Button, Card, Col, Descriptions, Drawer, Dropdown, Form, Input,
  InputNumber, Modal, Popconfirm, Row, Select, Space, Spin, Switch, Table, Tabs, Tag, Tooltip, Typography, Upload,
} from 'antd';
import {
  AppstoreOutlined, ClearOutlined, DeleteOutlined, DownloadOutlined, EditOutlined,
  EyeOutlined, FileAddOutlined, FilterOutlined, ImportOutlined, InboxOutlined,
  PlusOutlined, PrinterOutlined, ReloadOutlined, SearchOutlined,
} from '@ant-design/icons';
import type { ColumnsType, TablePaginationConfig } from 'antd/es/table';
import apiService from '../../services/api';
import { PageHeader, StatusBadge, EmptyState, LoadingState } from '../../components/shared';
import {
  ITEM_TYPES, ROUTE_TYPES, statusColorMap, TRACKING_SWITCHES,
  routeColorMap, IMPORT_COLUMNS, TEMPLATE_CSV,
  type Item, type DivisionOption, type SectionOption, type DepartmentOption,
  type UomOption, type SimpleOption, type CategoryOption, type ConversionInfo,
  type ImportRow,
} from './items/itemTypes';

const { Text } = Typography;

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let cur: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else { inQuotes = false; }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      cur.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      cur.push(field);
      field = '';
      if (cur.some((c) => c.trim() !== '')) rows.push(cur);
      cur = [];
    } else {
      field += ch;
    }
  }
  cur.push(field);
  if (cur.some((c) => c.trim() !== '')) rows.push(cur);
  return rows;
}

function toCsv(headers: string[], rows: Array<Array<string | number | null | undefined>>): string {
  const esc = (v: string | number | null | undefined) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [headers.map(esc).join(',')];
  for (const row of rows) lines.push(row.map(esc).join(','));
  return '\ufeff' + lines.join('\r\n');
}

function downloadText(filename: string, text: string, mime = 'text/csv;charset=utf-8'): void {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

const num = (v: number | null | undefined): string =>
  v === null || v === undefined ? '' : String(Number(v));

const ItemManagement: React.FC = () => {
  const { message } = App.useApp();
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [sortField, setSortField] = useState<string>('itemCode');
  const [sortOrder, setSortOrder] = useState<'ASC' | 'DESC'>('ASC');

  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  const [fDivision, setFDivision] = useState<string | undefined>();
  const [fSection, setFSection] = useState<string | undefined>();
  const [fDepartment, setFDepartment] = useState<string | undefined>();
  const [fCategory, setFCategory] = useState<string | undefined>();
  const [fItemType, setFItemType] = useState<string | undefined>();
  const [fRouteType, setFRouteType] = useState<string | undefined>();
  const [fStatus, setFStatus] = useState<string | undefined>();
  const [activeTab, setActiveTab] = useState<string>('all');

  const [uoms, setUoms] = useState<UomOption[]>([]);
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [divisions, setDivisions] = useState<DivisionOption[]>([]);
  const [sections, setSections] = useState<SectionOption[]>([]);
  const [departments, setDepartments] = useState<DepartmentOption[]>([]);
  const [routeTypes, setRouteTypes] = useState<Array<{ id: string; routeCode: string; name: string; status: string }>>([]);
  const [routeTypesState, setRouteTypesState] = useState<'loading' | 'error' | 'ready'>('loading');
  const [companyId, setCompanyId] = useState<string | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Item | null>(null);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();

  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailItem, setDetailItem] = useState<Item | null>(null);
  const [conversions, setConversions] = useState<ConversionInfo | null>(null);

  const [exporting, setExporting] = useState(false);
  const [printing, setPrinting] = useState(false);

  const [importOpen, setImportOpen] = useState(false);
  const [importFileName, setImportFileName] = useState<string | null>(null);
  const [importRows, setImportRows] = useState<ImportRow[]>([]);
  const [importSummary, setImportSummary] = useState<{
    total: number; valid: number; invalid: number; duplicate: number;
    imported: number; failed: number; skipped: number; errors: string[];
  } | null>(null);
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 400);
    return () => clearTimeout(t);
  }, [searchInput]);

  const activeFilterCount = useMemo(
    () => [fDivision, fSection, fDepartment, fCategory, fItemType, fRouteType, fStatus].filter(Boolean).length,
    [fDivision, fSection, fDepartment, fCategory, fItemType, fRouteType, fStatus],
  );

  const flatCategories = useMemo(() => {
    const out: SimpleOption[] = [];
    const walk = (nodes: CategoryOption[]) => {
      nodes?.forEach((n) => {
        out.push({ id: n.id, name: n.name });
        if (n.children?.length) walk(n.children);
      });
    };
    walk(categories || []);
    return out;
  }, [categories]);

  const sectionsForDivision = useCallback(
    (divisionId?: string) =>
      divisionId ? sections.filter((s) => s.divisionId === divisionId) : sections,
    [sections],
  );

  const departmentsForSection = useCallback(
    (divisionId: string | undefined, sectionId: string | undefined) => {
      if (sectionId) return departments.filter((d) => d.sectionId === sectionId);
      if (divisionId) return departments.filter((d) => d.divisionId === divisionId);
      return departments;
    },
    [departments],
  );

  const buildParams = useCallback(
    (extra: Record<string, unknown> = {}) => {
      const params: Record<string, unknown> = {
        page,
        limit: pageSize,
        sortField,
        sortOrder,
        ...extra,
      };
      if (search) params.search = search;
      if (fDivision) params.divisionId = fDivision;
      if (fSection) params.sectionId = fSection;
      if (fDepartment) params.departmentId = fDepartment;
      if (fCategory) params.categoryId = fCategory;
      if (fItemType) params.itemType = fItemType;
      if (fRouteType) params.routeTypeId = fRouteType;
      if (fStatus) params.status = fStatus;
      return params;
    },
    [page, pageSize, sortField, sortOrder, search, fDivision, fSection, fDepartment, fCategory, fItemType, fRouteType, fStatus],
  );

  const fetchItems = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await apiService.get<{ data: Item[]; total: number }>('/master-data/items', buildParams());
      setItems(response.data || []);
      setTotal(response.total || 0);
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to load items. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [buildParams]);

  const resolveCompanyId = useCallback(async (): Promise<string | null> => {
    try {
      const stored = localStorage.getItem('erp_user');
      const user = stored ? JSON.parse(stored) : null;
      if (user?.defaultCompanyId) return user.defaultCompanyId as string;
    } catch { /* ignore */ }
    try {
      const res = await apiService.get<{ data: Array<{ id: string }> }>('/companies', { limit: 1 });
      return res.data?.[0]?.id ?? null;
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const [uomRes, catRes, divRes, secRes, depRes, rtRes] = await Promise.all([
          apiService.get<{ data: UomOption[] }>('/master-data/uom', { limit: 200 }),
          apiService.get<{ data: CategoryOption[] }>('/master-data/categories', { limit: 500 }),
          apiService.get<{ data: DivisionOption[] }>('/divisions', { limit: 200 }),
          apiService.get<{ data: SectionOption[] }>('/sections', { limit: 500 }),
          apiService.get<{ data: DepartmentOption[] }>('/departments', { limit: 500 }),
          apiService.get<{ data: Array<{ id: string; routeCode: string; name: string; status: string }> }>('/master-data/route-types', { limit: 200 }),
        ]);
        setUoms(uomRes.data || []);
        setCategories(catRes.data || []);
        setDivisions(divRes.data || []);
        setSections(secRes.data || []);
        setDepartments(depRes.data || []);
        setRouteTypes((rtRes.data || []).filter((rt) => rt.status === 'ACTIVE'));
        setRouteTypesState('ready');
      } catch {
        message.warning('Could not load lookup data (UOM / categories / organization / route types)');
        setRouteTypesState('error');
      }
      setCompanyId(await resolveCompanyId());
    })();
  }, [resolveCompanyId, message]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  const handleTabChange = (key: string) => {
    setActiveTab(key);
    setFStatus(key === 'all' ? undefined : key);
    setPage(1);
  };

  const resetFilters = () => {
    setSearchInput('');
    setSearch('');
    setFDivision(undefined);
    setFSection(undefined);
    setFDepartment(undefined);
    setFCategory(undefined);
    setFItemType(undefined);
    setFRouteType(undefined);
    setFStatus(undefined);
    setActiveTab('all');
    setPage(1);
    setSortField('itemCode');
    setSortOrder('ASC');
  };

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({
      itemType: 'FINISHED_GOOD',
      trackInventory: false,
      batchTracked: false,
      serialTracked: false,
      expiryTracked: false,
      isPurchasable: true,
      isSellable: true,
      isManufacturable: false,
      isStockItem: true,
      minimumStockLevel: 0,
      maximumStockLevel: 0,
      reorderLevel: 0,
      safetyStockLevel: 0,
      leadTimeDays: 0,
    });
    setFormOpen(true);
  };

  const openEdit = (record: Item) => {
    setEditing(record);
    form.setFieldsValue({
      itemCode: record.itemCode,
      sku: record.sku ?? undefined,
      name: record.name,
      shortName: record.shortName ?? undefined,
      description: record.description ?? undefined,
      notes: record.notes ?? undefined,
      itemType: record.itemType,
      categoryId: record.categoryId ?? undefined,
      barcode: record.barcode ?? undefined,
      manufacturerPartNumber: record.manufacturerPartNumber ?? undefined,
      brand: record.brand ?? undefined,
      model: record.model ?? undefined,
      baseUomId: record.baseUomId ?? undefined,
      purchaseUomId: record.purchaseUomId ?? undefined,
      salesUomId: record.salesUomId ?? undefined,
      divisionId: record.divisionId ?? undefined,
      sectionId: record.sectionId ?? undefined,
      departmentId: record.departmentId ?? undefined,
      wireSizeMm: record.wireSizeMm ?? undefined,
      routeType: record.routeType ?? undefined,
      routeTypeId: record.routeTypeId ?? (record.routeType ? routeTypes.find((rt) => rt.routeCode === record.routeType)?.id : undefined),
      process1: record.process1 ?? undefined,
      process2: record.process2 ?? undefined,
      process3: record.process3 ?? undefined,
      process4: record.process4 ?? undefined,
      finalProduct: record.finalProduct ?? undefined,
      packingNextStep: record.packingNextStep ?? undefined,
      weightPerPiece: record.weightPerPiece ?? undefined,
      piecesPerKg: record.piecesPerKg ?? undefined,
      weightPerMeter: record.weightPerMeter ?? undefined,
      lengthPerPiece: record.lengthPerPiece ?? undefined,
      trackInventory: record.trackInventory ?? false,
      batchTracked: record.batchTracked ?? false,
      serialTracked: record.serialTracked ?? false,
      expiryTracked: record.expiryTracked ?? false,
      isPurchasable: record.isPurchasable ?? true,
      isSellable: record.isSellable ?? true,
      isManufacturable: record.isManufacturable ?? false,
      isStockItem: record.isStockItem ?? true,
      minimumStockLevel: record.minimumStockLevel ?? undefined,
      maximumStockLevel: record.maximumStockLevel ?? undefined,
      reorderLevel: record.reorderLevel ?? undefined,
      safetyStockLevel: record.safetyStockLevel ?? undefined,
      leadTimeDays: record.leadTimeDays ?? undefined,
    });
    setFormOpen(true);
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      const payload: Record<string, unknown> = {};
      Object.entries(values).forEach(([k, v]) => {
        if (v === undefined || v === null) return;
        if (typeof v === 'string') {
          const trimmed = v.trim();
          if (trimmed === '') return;
          payload[k] = trimmed;
        } else {
          payload[k] = v;
        }
      });
      // Defensive: strip any non-UUID display text from org fields (should never happen, but safe)
      const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      for (const field of ['divisionId', 'sectionId', 'departmentId', 'categoryId', 'baseUomId', 'purchaseUomId', 'salesUomId', 'routeTypeId'] as const) {
        if (payload[field] !== undefined && typeof payload[field] === 'string') {
          const val = (payload[field] as string).trim();
          if (!UUID_RE.test(val)) {
            delete payload[field];
          }
        }
      }
      // Route type: submit the UUID (routeTypeId). Remove the legacy display-code field
      // so the backend authoritative route-types master decides the stored code.
      if (payload.routeType !== undefined && payload.routeTypeId !== undefined) {
        delete payload.routeType;
      }
      if (editing) {
        if (editing.companyId) payload.companyId = editing.companyId;
      } else if (companyId) {
        payload.companyId = companyId;
      }
      setSaving(true);
      if (editing) {
        await apiService.patch(`/master-data/items/${editing.id}`, payload);
        message.success(`Item ${editing.itemCode} updated`);
      } else {
        await apiService.post('/master-data/items', payload);
        message.success('Item created');
      }
      setFormOpen(false);
      fetchItems();
    } catch (err: any) {
      if (err?.errorFields) return;
      const msg = err?.response?.data?.message;
      const text = Array.isArray(msg) ? msg.join('; ') : (msg || 'Operation failed');
      message.error(text);
    } finally {
      setSaving(false);
    }
  };

  const handleStatusChange = async (record: Item, action: 'activate' | 'deactivate') => {
    try {
      await apiService.patch(`/master-data/items/${record.id}/${action}`);
      message.success(`Item ${record.itemCode} ${action}d`);
      fetchItems();
    } catch (err: any) {
      message.error(err?.response?.data?.message || `Failed to ${action} item`);
    }
  };

  const handleDelete = async (record: Item) => {
    try {
      await apiService.delete(`/master-data/items/${record.id}`);
      message.success(`Item ${record.itemCode} deleted`);
      fetchItems();
    } catch (err: any) {
      message.error(err?.response?.data?.message || 'Failed to delete item');
    }
  };

  const openDetail = async (record: Item) => {
    setDetailOpen(true);
    setDetailLoading(true);
    setDetailItem(null);
    setConversions(null);
    try {
      const [itemRes, convRes] = await Promise.all([
        apiService.get<{ data: Item }>(`/master-data/items/${record.id}`),
        apiService
          .get<{ data: ConversionInfo }>(`/master-data/items/${record.id}/conversions`)
          .catch(() => null),
      ]);
      setDetailItem(itemRes.data);
      setConversions(convRes?.data ?? null);
    } catch (err: any) {
      message.error(err?.response?.data?.message || 'Failed to load item details');
      setDetailOpen(false);
    } finally {
      setDetailLoading(false);
    }
  };

  const collectFilteredItems = async (): Promise<Item[]> => {
    const collected: Item[] = [];
    let current = 1;
    const limitSize = 500;
    let totalCount = Infinity;
    do {
      const response = await apiService.get<{ data: Item[]; total: number }>(
        '/master-data/items',
        buildParams({ page: current, limit: limitSize }),
      );
      totalCount = response.total || 0;
      collected.push(...(response.data || []));
      current += 1;
    } while (collected.length < Math.min(totalCount, 10000));
    return collected.slice(0, 10000);
  };

  const EXPORT_HEADERS = [
    'Item Code', 'Name', 'SKU', 'Short Name', 'Item Type', 'Category', 'Division', 'Section',
    'Department', 'Wire Size (mm)', 'Route Type', 'Process 1', 'Process 2', 'Process 3',
    'Process 4', 'Final Product', 'Packing / Next Step', 'Base UOM', 'Weight per Piece (KG)',
    'Pieces per KG', 'Weight per Meter (kg/m)', 'Length per Piece (m)', 'Barcode', 'Status', 'Remarks',
  ];

  const itemToExportRow = (r: Item): Array<string | number | null | undefined> => [
    r.itemCode, r.name, r.sku ?? '', r.shortName ?? '',
    ITEM_TYPES.find((t) => t.value === r.itemType)?.label || r.itemType,
    r.categoryName ?? '',
    r.division ? `${r.division.divisionCode} - ${r.division.name}` : (r.divisionName ?? ''),
    r.section ? `${r.section.sectionCode} - ${r.section.name}` : (r.sectionName ?? ''),
    r.department ? `${r.department.departmentCode} - ${r.department.name}` : (r.departmentName ?? ''),
    num(r.wireSizeMm),
    r.routeType ? routeTypeLabel({ routeType: r.routeType, routeTypeId: r.routeTypeId, routeTypeRef: r.routeTypeRef } as Item) : '',
    r.process1 ?? '', r.process2 ?? '', r.process3 ?? '', r.process4 ?? '',
    r.finalProduct ?? '', r.packingNextStep ?? '', r.baseUomName ?? '',
    num(r.weightPerPiece), num(r.piecesPerKg), num(r.weightPerMeter), num(r.lengthPerPiece),
    r.barcode ?? '', r.status, r.notes ?? '',
  ];

  const handleExport = async () => {
    setExporting(true);
    try {
      const rows = await collectFilteredItems();
      downloadText(
        `item-master-${new Date().toISOString().slice(0, 10)}.csv`,
        toCsv(EXPORT_HEADERS, rows.map(itemToExportRow)),
      );
      message.success(`Exported ${rows.length} items`);
    } catch (err: any) {
      message.error(err?.response?.data?.message || 'Export failed');
    } finally {
      setExporting(false);
    }
  };

  const filterSummary = () => {
    const parts: string[] = [];
    if (search) parts.push(`Search: "${search}"`);
    const div = divisions.find((d) => d.id === fDivision)?.name;
    const sec = sections.find((s) => s.id === fSection)?.name;
    const dep = departments.find((d) => d.id === fDepartment)?.name;
    if (div) parts.push(`Division: ${div}`);
    if (sec) parts.push(`Section: ${sec}`);
    if (dep) parts.push(`Department: ${dep}`);
    if (fCategory) parts.push(`Category: ${flatCategories.find((c) => c.id === fCategory)?.name ?? fCategory}`);
    if (fItemType) parts.push(`Type: ${ITEM_TYPES.find((t) => t.value === fItemType)?.label ?? fItemType}`);
    if (fRouteType) parts.push(`Route: ${routeTypes.find((t) => t.id === fRouteType)?.routeCode ?? fRouteType}`);
    if (fStatus) parts.push(`Status: ${fStatus}`);
    return parts.length ? parts.join('   |   ') : 'All items';
  };

  const handlePrint = async () => {
    setPrinting(true);
    try {
      const rows = await collectFilteredItems();
      const w = window.open('', '_blank', 'width=1100,height=760');
      if (!w) {
        message.error('Popup blocked. Allow popups to print.');
        return;
      }
      const bodyRows = rows
        .map(
          (r) => `<tr>
            <td><b>${r.itemCode}</b></td><td>${r.name}</td><td>${r.division ? `${r.division.divisionCode} - ${r.division.name}` : (r.divisionName ?? '')}</td>
            <td>${r.section ? `${r.section.sectionCode} - ${r.section.name}` : (r.sectionName ?? '')}</td>
            <td>${r.department ? `${r.department.departmentCode} - ${r.department.name}` : (r.departmentName ?? '')}</td>
            <td class="num">${num(r.wireSizeMm)}</td>
            <td>${ITEM_TYPES.find((t) => t.value === r.itemType)?.label || r.itemType}</td>
            <td>${r.routeType ? routeTypeLabel({ routeType: r.routeType, routeTypeId: r.routeTypeId, routeTypeRef: r.routeTypeRef } as Item) : ''}</td>
            <td>${r.baseUomName ?? ''}</td><td class="status ${r.status.toLowerCase()}">${r.status}</td>
          </tr>`,
        )
        .join('');
      w.document.write(`<!DOCTYPE html>
<html><head><title>Item Master Report</title>
<style>
  body { font-family: 'Segoe UI', Arial, sans-serif; padding: 24px; color: #222; }
  h1 { font-size: 18px; margin: 0; }
  .meta { font-size: 11px; color: #666; margin-top: 4px; }
  .filters { font-size: 12px; margin: 12px 0 16px; background: #f5f6f8; border-radius: 6px; padding: 8px 12px; }
  table { width: 100%; border-collapse: collapse; font-size: 11px; }
  th { background: #f0f1f3; text-align: left; padding: 6px 8px; border-bottom: 2px solid #ddd; }
  td { padding: 5px 8px; border-bottom: 1px solid #eee; }
  .num { text-align: right; }
  .status.active { color: #1a7f37; font-weight: 600; }
  .status.inactive { color: #c0392b; font-weight: 600; }
  .status.discontinued { color: #b9770e; font-weight: 600; }
  @page { size: A4 landscape; margin: 12mm; @bottom-right { content: "Page " counter(page) " of " counter(pages); font-size: 10px; color: #888; } }
</style></head><body>
  <h1>Item Master Report</h1>
  <div class="meta">Generated ${new Date().toLocaleString()} &nbsp;&middot;&nbsp; ${rows.length} items</div>
  <div class="filters"><b>Filters:</b> ${filterSummary()}</div>
  <table>
    <thead><tr><th>Item Code</th><th>Name</th><th>Division</th><th>Section</th><th>Department</th><th class="num">Wire (mm)</th><th>Type</th><th>Route</th><th>UOM</th><th>Status</th></tr></thead>
    <tbody>${bodyRows || '<tr><td colspan="10" style="text-align:center;color:#999">No items found</td></tr>'}</tbody>
  </table>
<script>window.onload = function () { window.print(); };</script>
</body></html>`);
      w.document.close();
    } catch (err: any) {
      message.error(err?.response?.data?.message || 'Print failed');
    } finally {
      setPrinting(false);
    }
  };

  const matchLookup = (
    value: string,
    options: Array<any>,
    codeKey?: string,
  ): string | undefined => {
    const v = value.trim().toLowerCase();
    if (!v) return undefined;
    const byId = options.find((o) => o.id.toLowerCase() === v);
    if (byId) return byId.id;
    if (codeKey) {
      const byCode = options.find((o) => String(o[codeKey] ?? '').toLowerCase() === v);
      if (byCode) return byCode.id;
    }
    const byName = options.find((o) => o.name.toLowerCase() === v);
    return byName?.id;
  };

  const validateImportRow = (
    data: Record<string, string>,
    seenCodes: Set<string>,
    existingCodes: Set<string>,
  ): { payload?: Record<string, unknown>; errors: string[]; duplicate: boolean } => {
    const errors: string[] = [];
    const get = (k: string) => (data[k] ?? '').trim();

    const itemCode = get('itemCode').toUpperCase();
    if (!itemCode) errors.push('Item Code is required');
    else if (!/^[A-Z0-9_-]{1,50}$/.test(itemCode)) errors.push('Item Code must be uppercase letters, numbers, hyphens or underscores');

    const name = get('name');
    if (!name) errors.push('Name is required');
    else if (name.length > 255) errors.push('Name exceeds 255 characters');

    const duplicate = itemCode !== '' && existingCodes.has(itemCode);
    if (duplicate) return { duplicate: true, errors: [`Item code '${itemCode}' already exists`], };
    if (seenCodes.has(itemCode)) return { duplicate: true, errors: [`Duplicate item code '${itemCode}' within the file`] };

    const itemTypeRaw = get('itemType').toUpperCase().replace(/[\s-]+/g, '_');
    const itemType = ITEM_TYPES.find((t) => t.value === itemTypeRaw || t.label.toUpperCase().replace(/\s+/g, '_') === itemTypeRaw)?.value;
    if (!itemType) errors.push(`Invalid Item Type '${get('itemType')}'`);

    const uom = matchLookup(get('uomCode'), uoms, 'code');
    if (!get('uomCode')) errors.push('UOM is required');
    else if (!uom) errors.push(`Unknown UOM '${get('uomCode')}'`);

    let divisionId = matchLookup(get('divisionCodeOrName'), divisions as any, 'divisionCode');
    if (get('divisionCodeOrName') && !divisionId) errors.push(`Unknown Division '${get('divisionCodeOrName')}'`);

    let sectionId: string | undefined;
    let departmentId: string | undefined;
    const sectionRaw = get('sectionCodeOrName');
    if (sectionRaw) {
      const candidates = divisionId ? sections.filter((s) => s.divisionId === divisionId) : sections;
      sectionId = matchLookup(sectionRaw, candidates as any, 'sectionCode');
      if (!sectionId) errors.push(`Unknown Section '${sectionRaw}'${divisionId ? ' under the selected division' : ''}`);
      else if (!divisionId && sectionId) {
        divisionId = sections.find((s) => s.id === sectionId)?.divisionId ?? undefined;
      }
    }
    const deptRaw = get('departmentCodeOrName');
    if (deptRaw) {
      const candidates = sectionId
        ? departments.filter((d) => d.sectionId === sectionId)
        : divisionId
          ? departments.filter((d) => d.divisionId === divisionId)
          : departments;
      departmentId = matchLookup(deptRaw, candidates as any, 'departmentCode');
      if (!departmentId) errors.push(`Unknown Department '${deptRaw}'${sectionId || divisionId ? ' under the selected section/division' : ''}`);
    }

    const numericFields: Array<[string, string]> = [
      ['wireSizeMm', 'Wire Size'], ['weightPerPiece', 'Weight per Piece'],
      ['piecesPerKg', 'Pieces per KG'], ['weightPerMeter', 'Weight per Meter'],
      ['lengthPerPiece', 'Length per Piece'],
    ];
    const numbers: Record<string, number> = {};
    numericFields.forEach(([key, label]) => {
      const raw = get(key);
      if (raw === '') return;
      const parsed = Number(raw);
      if (!Number.isFinite(parsed) || parsed < 0) errors.push(`${label} must be a non-negative number`);
      else numbers[key] = parsed;
    });

    let routeTypeId: string | undefined;
    const routeRaw = get('routeType').toUpperCase().replace(/[\s-]+/g, '_');
    if (routeRaw) {
      const rt = routeTypes.find(
        (x) => x.routeCode.toUpperCase() === routeRaw || x.name.toUpperCase().replace(/[\s-]+/g, '_') === routeRaw,
      );
      if (rt) routeTypeId = rt.id;
      else {
        const legacy = ROUTE_TYPES.find((t) => t.value === routeRaw || t.label.toUpperCase().replace(/\s+/g, '_') === routeRaw)?.value;
        if (legacy) routeTypeId = routeTypes.find((x) => x.routeCode === legacy)?.id;
        if (!routeTypeId) errors.push(`Invalid Route Type '${get('routeType')}'`);
      }
    }

    const categoryName = get('categoryName');
    const categoryId = categoryName ? matchLookup(categoryName, flatCategories) : undefined;
    if (categoryName && !categoryId) errors.push(`Unknown Category '${categoryName}'`);

    if (errors.length > 0) return { duplicate: false, errors };

    const payload: Record<string, unknown> = {
      companyId,
      itemCode,
      name,
      itemType,
      baseUomId: uom,
      ...(get('sku') ? { sku: get('sku') } : {}),
      ...(get('shortName') ? { shortName: get('shortName') } : {}),
      ...(categoryId ? { categoryId } : {}),
      ...(divisionId ? { divisionId } : {}),
      ...(sectionId ? { sectionId } : {}),
      ...(departmentId ? { departmentId } : {}),
      ...(numbers.wireSizeMm !== undefined ? { wireSizeMm: numbers.wireSizeMm } : {}),
      ...(routeTypeId ? { routeTypeId } : {}),
      ...(get('process1') ? { process1: get('process1') } : {}),
      ...(get('process2') ? { process2: get('process2') } : {}),
      ...(get('process3') ? { process3: get('process3') } : {}),
      ...(get('process4') ? { process4: get('process4') } : {}),
      ...(get('finalProduct') ? { finalProduct: get('finalProduct') } : {}),
      ...(get('packingNextStep') ? { packingNextStep: get('packingNextStep') } : {}),
      ...(numbers.weightPerPiece !== undefined ? { weightPerPiece: numbers.weightPerPiece } : {}),
      ...(numbers.piecesPerKg !== undefined ? { piecesPerKg: numbers.piecesPerKg } : {}),
      ...(numbers.weightPerMeter !== undefined ? { weightPerMeter: numbers.weightPerMeter } : {}),
      ...(numbers.lengthPerPiece !== undefined ? { lengthPerPiece: numbers.lengthPerPiece } : {}),
      ...(get('barcode') ? { barcode: get('barcode') } : {}),
      ...(get('remarks') ? { notes: get('remarks') } : {}),
    };

    return { payload, errors: [], duplicate: false };
  };

  const handleImportFile = async (file: File) => {
    if (!companyId) {
      message.error('No company context available. Cannot import.');
      return false;
    }
    const text = await file.text();
    const parsed = parseCsv(text);
    if (parsed.length < 2) {
      message.error('The file appears to be empty or has no data rows.');
      return false;
    }
    const header = parsed[0].map((h) => h.trim());
    const missing = IMPORT_COLUMNS.filter((c) => !header.includes(c));
    if (missing.length > 0) {
      message.error(`Missing required column(s): ${missing.join(', ')}. Download the template for the expected format.`);
      return false;
    }

    let existingCodes = new Set<string>();
    try {
      const res = await apiService.get<{ data: Array<{ itemCode: string }> }>('/master-data/items', { page: 1, limit: 10000 });
      existingCodes = new Set((res.data || []).map((i) => i.itemCode.toUpperCase()));
    } catch {
      message.warning('Could not verify existing item codes before import.');
    }

    const seenCodes = new Set<string>();
    const validated: ImportRow[] = parsed.slice(1).map((cells, idx) => {
      const data: Record<string, string> = {};
      header.forEach((h, i) => { data[h] = cells[i] ?? ''; });
      const result = validateImportRow(data, seenCodes, existingCodes);
      if (result.payload) seenCodes.add((data['itemCode'] ?? '').toUpperCase());
      return {
        rowNumber: idx + 2,
        data,
        payload: result.payload,
        status: result.errors.length > 0 ? (result.duplicate ? 'DUPLICATE' : 'INVALID') : 'VALID',
        errors: result.errors,
      };
    });

    setImportFileName(file.name);
    setImportRows(validated);
    setImportSummary(null);
    return false;
  };

  const runImport = async () => {
    const validRows = importRows.filter((r) => r.status === 'VALID');
    if (validRows.length === 0) return;
    setImporting(true);
    let imported = 0;
    let failed = 0;
    const errors: string[] = [];
    for (const row of validRows) {
      try {
        await apiService.post('/master-data/items', row.payload);
        imported += 1;
      } catch (err: any) {
        failed += 1;
        errors.push(`Row ${row.rowNumber} (${row.data['itemCode']}): ${err?.response?.data?.message || 'failed'}`);
      }
    }
    setImporting(false);
    setImportSummary({
      total: importRows.length,
      valid: validRows.length,
      invalid: importRows.filter((r) => r.status === 'INVALID').length,
      duplicate: importRows.filter((r) => r.status === 'DUPLICATE').length,
      imported,
      failed,
      skipped: importRows.length - imported - failed,
      errors,
    });
    fetchItems();
  };

  const closeImport = () => {
    setImportOpen(false);
    setImportRows([]);
    setImportSummary(null);
    setImportFileName(null);
  };

  const convChips = (r: Item): string[] => {
    const chips: string[] = [];
    if ((r.weightPerPiece ?? 0) > 0 || (r.piecesPerKg ?? 0) > 0) chips.push('KG↔PCS');
    if ((r.weightPerMeter ?? 0) > 0) chips.push('KG↔M');
    if ((r.lengthPerPiece ?? 0) > 0) chips.push('PCS↔M');
    return chips;
  };

  // Resolve a human-readable route label from the DB-backed master (or legacy code).
  const routeTypeLabel = (r: Item): string => {
    const ref = r.routeTypeRef;
    if (ref) return `${ref.routeCode} — ${ref.name}`;
    if (r.routeTypeId) {
      const rt = routeTypes.find((x) => x.id === r.routeTypeId);
      if (rt) return `${rt.routeCode} — ${rt.name}`;
    }
    if (r.routeType) {
      const rt = routeTypes.find((x) => x.routeCode === r.routeType);
      if (rt) return `${rt.routeCode} — ${rt.name}`;
      return ROUTE_TYPES.find((x) => x.value === r.routeType)?.label || r.routeType;
    }
    return '';
  };

  const columns: ColumnsType<Item> = [
    {
      title: 'Item Code', dataIndex: 'itemCode', key: 'itemCode', width: 150, fixed: 'left',
      sorter: true,
      render: (v: string) => <Text strong style={{ fontSize: 13 }}>{v}</Text>,
    },
    {
      title: 'Item Name', dataIndex: 'name', key: 'name', width: 220, ellipsis: true,
      sorter: true,
      render: (_: unknown, r: Item) => (
        <div>
          <div style={{ fontSize: 13 }}>{r.name}</div>
          {r.shortName && <Text type="secondary" style={{ fontSize: 12 }}>{r.shortName}</Text>}
        </div>
      ),
    },
    {
      title: 'Division', key: 'division', width: 120, ellipsis: true,
      render: (_: unknown, r: Item) => r.division ? `${r.division.divisionCode} - ${r.division.name}` : (r.divisionName ?? <Text type="secondary">—</Text>),
    },
    {
      title: 'Section', key: 'section', width: 120, ellipsis: true,
      render: (_: unknown, r: Item) => r.section ? `${r.section.sectionCode} - ${r.section.name}` : (r.sectionName ?? <Text type="secondary">—</Text>),
    },
    {
      title: 'Department', key: 'department', width: 140, ellipsis: true,
      render: (_: unknown, r: Item) => r.department ? `${r.department.departmentCode} - ${r.department.name}` : (r.departmentName ?? <Text type="secondary">—</Text>),
    },
    {
      title: 'Wire Size', dataIndex: 'wireSizeMm', key: 'wireSizeMm', width: 100, align: 'right',
      sorter: true,
      render: (v: number | null) => (v !== null && v !== undefined ? `${Number(v)}` : <Text type="secondary">—</Text>),
    },
    {
      title: 'Item Type', dataIndex: 'itemType', key: 'itemType', width: 130,
      render: (v: string) => {
        const label = ITEM_TYPES.find((t) => t.value === v)?.label || v;
        return <Tag style={{ marginInlineEnd: 0 }}>{label}</Tag>;
      },
    },
    {
      title: 'Route', dataIndex: 'routeType', key: 'routeType', width: 120,
      sorter: true,
      render: (v: string | null, r: Item) => {
        const label = routeTypeLabel(r);
        return label ? <Tag color={routeColorMap[r.routeType ?? ''] ?? 'default'} style={{ marginInlineEnd: 0 }}>{label}</Tag> : <Text type="secondary">—</Text>;
      },
    },
    {
      title: 'UOM / Conversion', key: 'uom', width: 170,
      render: (_: unknown, r: Item) => (
        <div>
          <div style={{ fontSize: 13 }}>{r.baseUomName ?? '—'}</div>
          {convChips(r).length > 0 && (
            <Text type="secondary" style={{ fontSize: 11 }}>{convChips(r).join(' · ')}</Text>
          )}
        </div>
      ),
    },
    {
      title: 'Status', dataIndex: 'status', key: 'status', width: 110,
      sorter: true,
      render: (s: string) => (
        <StatusBadge status={s} colorMap={statusColorMap} style={{ minWidth: 74, textAlign: 'center' }} />
      ),
    },
    {
      title: 'Actions', key: 'actions', width: 190, fixed: 'right',
      render: (_: unknown, record: Item) => (
        <Space size={2}>
          <Tooltip title="View details">
            <Button type="text" size="small" icon={<EyeOutlined />} onClick={() => openDetail(record)} style={{ color: 'var(--theme-primary)' }} />
          </Tooltip>
          <Tooltip title="Edit">
            <Button type="text" size="small" icon={<EditOutlined />} onClick={() => openEdit(record)} />
          </Tooltip>
          {record.status === 'ACTIVE' ? (
            <Popconfirm
              title={`Deactivate '${record.itemCode}'?`}
              description="Inactive items are hidden from most transaction screens."
              onConfirm={() => handleStatusChange(record, 'deactivate')}
            >
              <Tooltip title="Deactivate">
                <Button type="text" size="small" danger style={{ color: 'var(--theme-danger)' }}>Deact</Button>
              </Tooltip>
            </Popconfirm>
          ) : (
            <Popconfirm title={`Activate '${record.itemCode}'?`} onConfirm={() => handleStatusChange(record, 'activate')}>
              <Tooltip title="Activate">
                <Button type="text" size="small" style={{ color: 'var(--theme-success)' }}>Act</Button>
              </Tooltip>
            </Popconfirm>
          )}
          <Popconfirm
            title={`Delete '${record.itemCode}'?`}
            description="Permanent. Blocked automatically if referenced by BOM, production, stock, routing or targets."
            okButtonProps={{ danger: true }}
            onConfirm={() => handleDelete(record)}
          >
            <Tooltip title="Delete">
              <Button type="text" size="small" danger icon={<DeleteOutlined />} />
            </Tooltip>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const detailDesc = (itemsSpec: Array<{ label: string; children: React.ReactNode }>) => (
    <Descriptions size="small" column={2} labelStyle={{ width: 150 }}>
      {itemsSpec.map((s) => (
        <Descriptions.Item key={s.label} label={s.label}>
          {s.children ?? <Text type="secondary">—</Text>}
        </Descriptions.Item>
      ))}
    </Descriptions>
  );

  const txt = (v?: string | null) =>
    v ? <span style={{ fontSize: 13 }}>{v}</span> : <Text type="secondary">—</Text>;

  const pagination: TablePaginationConfig = {
    current: page,
    pageSize,
    total,
    showSizeChanger: true,
    pageSizeOptions: [10, 20, 50, 100],
    showTotal: (t, range) => `${range[0]}-${range[1]} of ${t} items`,
    onChange: (p, ps) => {
      setPage(ps !== pageSize ? 1 : p);
      setPageSize(ps);
    },
  };

  return (
    <div style={{ padding: 24, maxWidth: 1440, margin: '0 auto' }}>
      <PageHeader
        icon={<AppstoreOutlined />}
        title="Products & Items"
        subtitle="Manage your item master data — raw materials, finished goods, and production items"
        showBreadcrumbs
        extra={
          <>
            <Tooltip title="Refresh">
              <Button icon={<ReloadOutlined />} onClick={() => fetchItems()} />
            </Tooltip>
            <Dropdown
              menu={{
                items: [{ key: 'csv', icon: <DownloadOutlined />, label: 'Excel-compatible CSV' }],
                onClick: handleExport,
              }}
            >
              <Button icon={<DownloadOutlined />} loading={exporting}>Export</Button>
            </Dropdown>
            <Button icon={<PrinterOutlined />} loading={printing} onClick={handlePrint}>Print</Button>
            <Button icon={<ImportOutlined />} onClick={() => { setImportOpen(true); setImportRows([]); setImportSummary(null); setImportFileName(null); }}>
              Import
            </Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>Add Item</Button>
          </>
        }
      />

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={12} sm={6}>
          <Card size="small" styles={{ body: { padding: '16px 20px' } }} style={{ borderRadius: 8, borderLeft: '3px solid var(--theme-primary)' }}>
            <Text style={{ fontSize: 12, color: 'var(--theme-text-muted)' }}>Total Items</Text>
            <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--theme-primary)', lineHeight: 1.2, marginTop: 4 }}>{total}</div>
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small" styles={{ body: { padding: '16px 20px' } }} style={{ borderRadius: 8, borderLeft: '3px solid var(--theme-success)' }}>
            <Text style={{ fontSize: 12, color: 'var(--theme-text-muted)' }}>Active</Text>
            <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--theme-success)', lineHeight: 1.2, marginTop: 4 }}>
              {items.filter((i) => i.status === 'ACTIVE').length}
            </div>
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small" styles={{ body: { padding: '16px 20px' } }} style={{ borderRadius: 8, borderLeft: '3px solid var(--theme-accent)' }}>
            <Text style={{ fontSize: 12, color: 'var(--theme-text-muted)' }}>Stock Items</Text>
            <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--theme-accent)', lineHeight: 1.2, marginTop: 4 }}>
              {items.filter((i) => i.isStockItem).length}
            </div>
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small" styles={{ body: { padding: '16px 20px' } }} style={{ borderRadius: 8, borderLeft: '3px solid var(--theme-warning)' }}>
            <Text style={{ fontSize: 12, color: 'var(--theme-text-muted)' }}>Manufactured</Text>
            <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--theme-warning)', lineHeight: 1.2, marginTop: 4 }}>
              {items.filter((i) => i.isManufacturable).length}
            </div>
          </Card>
        </Col>
      </Row>

      <Card style={{ marginBottom: 16, borderRadius: 8 }} styles={{ body: { padding: 0 } }}>
        <div style={{ padding: '0 16px' }}>
          <Tabs
            activeKey={activeTab}
            onChange={handleTabChange}
            items={[
              { key: 'all', label: <span>All <Badge count={total} showZero style={{ backgroundColor: 'var(--theme-primary)', marginLeft: 4 }} /></span> },
              { key: 'ACTIVE', label: 'Active' },
              { key: 'INACTIVE', label: 'Inactive' },
            ]}
            style={{ marginBottom: 0 }}
          />
        </div>
        <div
          style={{
            display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center',
            padding: '10px 16px', borderTop: '1px solid var(--theme-border)',
          }}
        >
          <Input
            allowClear
            prefix={<SearchOutlined style={{ color: 'var(--theme-text-muted)' }} />}
            placeholder="Search by code, name, SKU, barcode, wire size..."
            style={{ width: 320, maxWidth: '100%' }}
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
          <Badge count={activeFilterCount} size="small">
            <Button icon={<FilterOutlined />} onClick={() => setShowFilters((v) => !v)}>
              Filters
            </Button>
          </Badge>
          {(activeFilterCount > 0 || searchInput) && (
            <Button type="text" icon={<ClearOutlined />} onClick={resetFilters}>
              Clear
            </Button>
          )}
          <div style={{ flex: 1 }} />
          <Text type="secondary" style={{ fontSize: 12 }}>
            {total} items · Sorted by {sortField} ({sortOrder === 'ASC' ? 'ascending' : 'descending'})
          </Text>
        </div>
        {showFilters && (
          <div
            style={{
              display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: 12, padding: '12px 16px 16px', borderTop: '1px solid var(--theme-border)',
              background: 'var(--theme-surface-alt)',
            }}
          >
            <Select
              allowClear showSearch optionFilterProp="label" placeholder="Division"
              value={fDivision}
              options={divisions.map((d) => ({ value: d.id, label: `${d.divisionCode} - ${d.name}` }))}
              onChange={(v) => { setFDivision(v); setFSection(undefined); setFDepartment(undefined); setPage(1); }}
            />
            <Select
              allowClear showSearch optionFilterProp="label" placeholder="Section"
              value={fSection} disabled={!fDivision}
              options={sectionsForDivision(fDivision).map((s) => ({ value: s.id, label: `${s.sectionCode} - ${s.name}` }))}
              onChange={(v) => { setFSection(v); setFDepartment(undefined); setPage(1); }}
            />
            <Select
              allowClear showSearch optionFilterProp="label" placeholder="Department"
              value={fDepartment}
              options={departmentsForSection(fDivision, fSection).map((d) => ({ value: d.id, label: `${d.departmentCode} - ${d.name}` }))}
              onChange={(v) => { setFDepartment(v); setPage(1); }}
            />
            <Select
              allowClear showSearch optionFilterProp="label" placeholder="Item Category"
              value={fCategory}
              options={flatCategories.map((c) => ({ value: c.id, label: c.name }))}
              onChange={(v) => { setFCategory(v); setPage(1); }}
            />
            <Select
              allowClear placeholder="Item Type" options={ITEM_TYPES}
              value={fItemType}
              onChange={(v) => { setFItemType(v); setPage(1); }}
            />
            <Select
              allowClear showSearch optionFilterProp="label" placeholder="Route Type"
              value={fRouteType}
              loading={routeTypesState === 'loading'}
              options={routeTypes.map((rt) => ({ value: rt.id, label: `${rt.routeCode} — ${rt.name}` }))}
              onChange={(v) => { setFRouteType(v); setPage(1); }}
            />
          </div>
        )}
      </Card>

      {error && (
        <Alert
          type="error"
          showIcon
          message="Could not load items"
          description={error}
          action={<Button size="small" danger onClick={() => fetchItems()}>Retry</Button>}
          style={{ marginBottom: 16 }}
          closable
        />
      )}

      <Card style={{ borderRadius: 8 }} styles={{ body: { padding: '8px 0 0' } }}>
        <Table
          rowKey="id"
          columns={columns}
          dataSource={items}
          loading={loading}
          scroll={{ x: 1600 }}
          sticky
          size="middle"
          pagination={pagination}
          onChange={(_p, _f, sorter: any) => {
            if (sorter?.field && !Array.isArray(sorter.field)) {
              const order = sorter.order === 'descend' ? 'DESC' : 'ASC';
              setSortField(sorter.field as string);
              setSortOrder(order);
            }
          }}
          locale={{
            emptyText: (
              <EmptyState
                title={search || activeFilterCount > 0 ? 'No items match your filters' : 'No items found'}
                description={search || activeFilterCount > 0 ? 'Try adjusting your search or filter criteria.' : 'Get started by creating your first item.'}
                actionLabel="Add Item"
                onAction={openCreate}
              />
            ),
          }}
        />
      </Card>

      <Drawer
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        width={Math.min(720, typeof window !== 'undefined' ? window.innerWidth - 40 : 680)}
        styles={{ header: { borderBottom: '1px solid var(--theme-border)' } }}
        title={
          detailItem ? (
            <Space wrap>
              <span style={{ fontWeight: 600, fontSize: 16 }}>{detailItem.itemCode}</span>
              <StatusBadge status={detailItem.status} colorMap={statusColorMap} />
              <Tag style={{ marginInlineEnd: 0 }}>{ITEM_TYPES.find((t) => t.value === detailItem.itemType)?.label || detailItem.itemType}</Tag>
            </Space>
          ) : (
            'Item Details'
          )
        }
        extra={
          detailItem && (
            <Space>
              <Button icon={<EditOutlined />} onClick={() => { setDetailOpen(false); openEdit(detailItem); }}>
                Edit
              </Button>
            </Space>
          )
        }
      >
        {detailLoading || !detailItem ? (
          <LoadingState tip="Loading item details…" />
        ) : (
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            <Card size="small" title="Basic Information" style={{ borderRadius: 8 }}>
              {detailDesc([
                { label: 'Item Code', children: <Text strong>{detailItem.itemCode}</Text> },
                { label: 'Item Name', children: txt(detailItem.name) },
                { label: 'SKU', children: txt(detailItem.sku) },
                { label: 'Short Name', children: txt(detailItem.shortName) },
                { label: 'Item Type', children: txt(ITEM_TYPES.find((t) => t.value === detailItem.itemType)?.label || detailItem.itemType) },
                { label: 'Category', children: txt(detailItem.categoryName) },
                {
                  label: 'Status',
                  children: <StatusBadge status={detailItem.status} colorMap={statusColorMap} />,
                },
                { label: 'Barcode', children: txt(detailItem.barcode) },
                ...(detailItem.description ? [{ label: 'Description', children: <Text style={{ fontSize: 13 }}>{detailItem.description}</Text> }] : []),
              ])}
            </Card>

            <Card size="small" title="Organization" style={{ borderRadius: 8 }}>
              {detailDesc([
                { label: 'Division', children: txt(detailItem.division ? `${detailItem.division.divisionCode} — ${detailItem.division.name}` : (detailItem.divisionName ?? null)) },
                { label: 'Section', children: txt(detailItem.section ? `${detailItem.section.sectionCode} — ${detailItem.section.name}` : (detailItem.sectionName ?? null)) },
                { label: 'Department', children: txt(detailItem.department ? `${detailItem.department.departmentCode} — ${detailItem.department.name}` : (detailItem.departmentName ?? null)) },
              ])}
            </Card>

            <Card size="small" title="Production / Routing" style={{ borderRadius: 8 }}>
              {detailDesc([
                { label: 'Wire Size (mm)', children: detailItem.wireSizeMm != null ? String(Number(detailItem.wireSizeMm)) : null },
                {
                  label: 'Route Type',
                  children: routeTypeLabel(detailItem) ? (
                    <Tag color={routeColorMap[detailItem.routeType ?? ''] ?? 'default'} style={{ marginInlineEnd: 0 }}>
                      {routeTypeLabel(detailItem)}
                    </Tag>
                  ) : null,
                },
                { label: 'Process 1', children: txt(detailItem.process1) },
                { label: 'Process 2', children: txt(detailItem.process2) },
                { label: 'Process 3', children: txt(detailItem.process3) },
                { label: 'Process 4', children: txt(detailItem.process4) },
                { label: 'Final Product', children: txt(detailItem.finalProduct) },
                { label: 'Packing / Next Step', children: txt(detailItem.packingNextStep) },
              ])}
            </Card>

            <Card size="small" title="Weight & UOM Conversion" style={{ borderRadius: 8 }}>
              {detailDesc([
                { label: 'Base UOM', children: txt(detailItem.baseUomName) },
                { label: 'Purchase UOM', children: txt(detailItem.purchaseUomId) },
                { label: 'Sales UOM', children: txt(detailItem.salesUomId) },
                { label: 'Weight / Piece', children: detailItem.weightPerPiece != null ? `${Number(detailItem.weightPerPiece)} kg` : null },
                { label: 'Pieces / KG', children: detailItem.piecesPerKg != null ? String(Number(detailItem.piecesPerKg)) : null },
                { label: 'Weight / Meter', children: detailItem.weightPerMeter != null ? `${Number(detailItem.weightPerMeter)} kg/m` : null },
                { label: 'Length / Piece', children: detailItem.lengthPerPiece != null ? `${Number(detailItem.lengthPerPiece)} m` : null },
              ])}
              {conversions && conversions.supportedConversions.filter((c) => c.available).length > 0 && (
                <div style={{ marginTop: 10 }}>
                  <Text type="secondary" style={{ fontSize: 12 }}>Available conversions:</Text>{' '}
                  {conversions.supportedConversions
                    .filter((c) => c.available)
                    .map((c) => (
                      <Tag key={`${c.from}-${c.to}`} color="blue" style={{ marginInlineEnd: 4 }}>
                        {c.from} → {c.to}
                      </Tag>
                    ))
                  }
                </div>
              )}
              {(detailItem.barcodes?.length ?? 0) > 0 && (
                <div style={{ marginTop: 10 }}>
                  <Text type="secondary" style={{ fontSize: 12 }}>Registered barcodes:</Text>{' '}
                  {detailItem.barcodes!.map((b) => (
                    <Tag key={b.id}>{b.barcodeValue ?? b.id}</Tag>
                  ))}
                </div>
              )}
            </Card>

            <Card size="small" title="Identification & Tracking" style={{ borderRadius: 8 }}>
              {detailDesc([
                { label: 'Manufacturer', children: txt(detailItem.manufacturerPartNumber) },
                { label: 'Brand', children: txt(detailItem.brand) },
                { label: 'Model', children: txt(detailItem.model) },
              ])}
            </Card>

            <Card size="small" title="Audit" style={{ borderRadius: 8 }}>
              {detailDesc([
                { label: 'Created At', children: txt(detailItem.createdAt ? new Date(detailItem.createdAt).toLocaleString() : null) },
                { label: 'Updated At', children: txt(detailItem.updatedAt ? new Date(detailItem.updatedAt).toLocaleString() : null) },
                { label: 'Remarks', children: txt(detailItem.notes) },
              ])}
            </Card>
          </Space>
        )}
      </Drawer>

      <Modal
        open={formOpen}
        onCancel={() => setFormOpen(false)}
        onOk={handleSubmit}
        confirmLoading={saving}
        width={900}
        okText={editing ? 'Save Changes' : 'Create Item'}
        title={
          <Space>
            {editing ? <EditOutlined /> : <FileAddOutlined />}
            {editing ? `Edit Item — ${editing.itemCode}` : 'Add New Item'}
          </Space>
        }
        styles={{ body: { maxHeight: 'calc(100vh - 220px)', overflowY: 'auto' } }}
      >
        <Form form={form} layout="vertical" requiredMark="optional">
          {/* SECTION 1 — BASIC INFORMATION */}
          <Card size="small" title="Basic Information" style={{ marginBottom: 12, borderRadius: 8 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0 12px' }}>
              <Form.Item
                name="itemCode" label="Item Code" rules={[
                  { required: true, message: 'Item Code is required' },
                  { pattern: /^[A-Z0-9_-]+$/, message: 'Uppercase letters, numbers, hyphens and underscores only' },
                ]}
                extra={editing ? 'Item Code cannot be changed' : 'e.g. DEMO-RM-CU-001'}
              >
                <Input disabled={!!editing} placeholder="e.g. DEMO-RM-CU-001" maxLength={50} />
              </Form.Item>
              <Form.Item name="name" label="Item Name" rules={[{ required: true, message: 'Item Name is required' }]}>
                <Input placeholder="e.g. Copper Wire 2.00 mm" maxLength={255} />
              </Form.Item>
              <Form.Item name="shortName" label="Short Name">
                <Input maxLength={100} placeholder="e.g. Cu Wire 2mm" />
              </Form.Item>
              <Form.Item name="description" label="Description" style={{ gridColumn: '1 / -1' }}>
                <Input.TextArea rows={2} maxLength={1000} placeholder="e.g. Demo raw material received from another manufacturing unit" />
              </Form.Item>
            </div>
          </Card>

          {/* SECTION 2 — ORGANIZATION */}
          <Card size="small" title="Organization" style={{ marginBottom: 12, borderRadius: 8 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0 12px' }}>
              <Form.Item name="divisionId" label="Division">
                <Select
                  allowClear showSearch optionFilterProp="label" placeholder="Select division"
                  options={divisions.map((d) => ({ value: d.id, label: `${d.divisionCode} - ${d.name}` }))}
                  onChange={() => form.setFieldsValue({ sectionId: undefined, departmentId: undefined })}
                />
              </Form.Item>
              <Form.Item noStyle shouldUpdate={(p, c) => p.divisionId !== c.divisionId}>
                {({ getFieldValue }) => (
                  <Form.Item name="sectionId" label="Section">
                    <Select
                      allowClear showSearch optionFilterProp="label" placeholder="Select section"
                      disabled={!getFieldValue('divisionId')}
                      options={sectionsForDivision(getFieldValue('divisionId')).map((s) => ({ value: s.id, label: `${s.sectionCode} - ${s.name}` }))}
                      onChange={() => form.setFieldsValue({ departmentId: undefined })}
                    />
                  </Form.Item>
                )}
              </Form.Item>
              <Form.Item noStyle shouldUpdate={(p, c) => p.sectionId !== c.sectionId || p.divisionId !== c.divisionId}>
                {({ getFieldValue }) => (
                  <Form.Item name="departmentId" label="Department">
                    <Select
                      allowClear showSearch optionFilterProp="label" placeholder="Select department"
                      disabled={!getFieldValue('sectionId')}
                      options={departmentsForSection(getFieldValue('divisionId'), getFieldValue('sectionId')).map((d) => ({ value: d.id, label: `${d.departmentCode} - ${d.name}` }))}
                    />
                  </Form.Item>
                )}
              </Form.Item>
            </div>
          </Card>

          {/* SECTION 3 — CLASSIFICATION */}
          <Card size="small" title="Classification" style={{ marginBottom: 12, borderRadius: 8 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0 12px' }}>
              <Form.Item name="itemType" label="Item Type" rules={[{ required: true, message: 'Item Type is required' }]}>
                <Select options={ITEM_TYPES} placeholder="e.g. RAW_MATERIAL" />
              </Form.Item>
              <Form.Item name="categoryId" label="Item Category">
                <Select
                  allowClear showSearch optionFilterProp="label"
                  options={flatCategories.map((c) => ({ value: c.id, label: c.name }))}
                  placeholder="e.g. Copper / Metal"
                />
              </Form.Item>
              <Form.Item name="routeTypeId" label="Route Type">
                <Select
                  allowClear showSearch optionFilterProp="label"
                  loading={routeTypesState === 'loading'}
                  status={routeTypesState === 'error' ? 'error' : undefined}
                  notFoundContent={routeTypesState === 'error' ? 'Route types could not be loaded' : 'No active route types'}
                  options={routeTypes.map((rt) => ({ value: rt.id, label: `${rt.routeCode} — ${rt.name}` }))}
                  placeholder="e.g. CONTROL_CABLE — Control Cable"
                />
              </Form.Item>
            </div>
          </Card>

          {/* SECTION 4 — UOM / INVENTORY */}
          <Card size="small" title="UOM & Inventory" style={{ marginBottom: 12, borderRadius: 8 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0 12px' }}>
              <Form.Item name="baseUomId" label="Base UOM" rules={[{ required: true, message: 'Base UOM is required' }]}>
                <Select
                  showSearch optionFilterProp="label" placeholder="e.g. KG"
                  options={uoms.map((u) => ({ value: u.id, label: `${u.name} (${u.code})` }))}
                />
              </Form.Item>
              <Form.Item name="purchaseUomId" label="Purchase UOM">
                <Select
                  allowClear showSearch optionFilterProp="label" placeholder="Optional"
                  options={uoms.map((u) => ({ value: u.id, label: `${u.name} (${u.code})` }))}
                />
              </Form.Item>
              <Form.Item name="salesUomId" label="Sales UOM">
                <Select
                  allowClear showSearch optionFilterProp="label" placeholder="Optional"
                  options={uoms.map((u) => ({ value: u.id, label: `${u.name} (${u.code})` }))}
                />
              </Form.Item>
              <Form.Item name="weightPerPiece" label="Weight per Piece (kg)" extra="Enables KG ↔ PCS">
                <InputNumber min={0} step={0.000001} style={{ width: '100%' }} placeholder="e.g. 0.0555" />
              </Form.Item>
              <Form.Item name="piecesPerKg" label="Pieces per KG" extra="Manually maintained">
                <InputNumber min={0} step={0.000001} style={{ width: '100%' }} placeholder="e.g. 18.02" />
              </Form.Item>
              <Form.Item name="weightPerMeter" label="Weight per Meter (kg/m)" extra="Enables KG ↔ METER">
                <InputNumber min={0} step={0.000001} style={{ width: '100%' }} placeholder="Optional" />
              </Form.Item>
              <Form.Item name="lengthPerPiece" label="Length per Piece (m)" extra="Enables PCS ↔ METER">
                <InputNumber min={0} step={0.000001} style={{ width: '100%' }} placeholder="Optional" />
              </Form.Item>
            </div>
          </Card>

          {/* SECTION 5 — PRODUCTION */}
          <Card size="small" title="Production" style={{ marginBottom: 12, borderRadius: 8 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0 12px' }}>
              <Form.Item name="wireSizeMm" label="Wire Size (mm)">
                <InputNumber min={0} step={0.01} style={{ width: '100%' }} placeholder="Optional" />
              </Form.Item>
              <Form.Item name="finalProduct" label="Final Product"><Input maxLength={255} placeholder="Optional" /></Form.Item>
              <Form.Item name="packingNextStep" label="Packing / Next Step"><Input maxLength={255} placeholder="Optional" /></Form.Item>
              <Form.Item name="process1" label="Process 1"><Input maxLength={255} placeholder="Optional" /></Form.Item>
              <Form.Item name="process2" label="Process 2"><Input maxLength={255} placeholder="Optional" /></Form.Item>
              <Form.Item name="process3" label="Process 3"><Input maxLength={255} placeholder="Optional" /></Form.Item>
              <Form.Item name="process4" label="Process 4"><Input maxLength={255} placeholder="Optional" /></Form.Item>
            </div>
          </Card>

          {/* SECTION 6 — ADDITIONAL */}
          <Card size="small" title="Additional" style={{ marginBottom: 12, borderRadius: 8 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0 12px' }}>
              <Form.Item name="sku" label="SKU"><Input maxLength={100} placeholder="Optional" /></Form.Item>
              <Form.Item name="barcode" label="Barcode"><Input maxLength={255} placeholder="Optional" /></Form.Item>
              <Form.Item name="manufacturerPartNumber" label="Manufacturer Part No."><Input maxLength={255} placeholder="Optional" /></Form.Item>
              <Form.Item name="brand" label="Brand"><Input maxLength={255} placeholder="Optional" /></Form.Item>
              <Form.Item name="model" label="Model"><Input maxLength={255} placeholder="Optional" /></Form.Item>
            </div>
            <Row gutter={[12, 8]} style={{ marginTop: 8 }}>
              {TRACKING_SWITCHES.map((s) => (
                <Col key={s.name} xs={12} sm={8} md={6}>
                  <Form.Item name={s.name} label={s.label} valuePropName="checked" style={{ marginBottom: 4 }}>
                    <Switch size="small" />
                  </Form.Item>
                </Col>
              ))}
            </Row>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0 12px', marginTop: 8 }}>
              <Form.Item name="minimumStockLevel" label="Min Stock Level"><InputNumber min={0} style={{ width: '100%' }} placeholder="0" /></Form.Item>
              <Form.Item name="maximumStockLevel" label="Max Stock Level"><InputNumber min={0} style={{ width: '100%' }} placeholder="0" /></Form.Item>
              <Form.Item name="reorderLevel" label="Reorder Level"><InputNumber min={0} style={{ width: '100%' }} placeholder="0" /></Form.Item>
              <Form.Item name="safetyStockLevel" label="Safety Stock Level"><InputNumber min={0} style={{ width: '100%' }} placeholder="0" /></Form.Item>
              <Form.Item name="leadTimeDays" label="Lead Time (Days)"><InputNumber min={0} precision={0} style={{ width: '100%' }} placeholder="0" /></Form.Item>
            </div>
            {editing && (
              <Form.Item label="Status" style={{ marginBottom: 8, marginTop: 8 }}>
                <StatusBadge status={editing.status} colorMap={statusColorMap} style={{ marginRight: 8 }} />
                <Text type="secondary" style={{ fontSize: 12 }}>Manage via Activate / Deactivate row actions</Text>
              </Form.Item>
            )}
            <Form.Item name="notes" label="Remarks" style={{ marginBottom: 8 }}>
              <Input.TextArea rows={2} maxLength={2000} placeholder="Optional note" />
            </Form.Item>
          </Card>
        </Form>
      </Modal>

      <Modal
        open={importOpen}
        onCancel={closeImport}
        width={960}
        footer={
          importSummary ? (
            <Button type="primary" onClick={closeImport}>Done</Button>
          ) : importRows.length > 0 ? (
            [
              <Button key="back" onClick={() => { setImportRows([]); setImportFileName(null); }}>Choose another file</Button>,
              <Button
                key="import"
                type="primary"
                disabled={importRows.every((r) => r.status !== 'VALID')}
                loading={importing}
                onClick={runImport}
              >
                Import {importRows.filter((r) => r.status === 'VALID').length} valid row(s)
              </Button>,
            ]
          ) : (
            <Button type="primary" onClick={closeImport}>Close</Button>
          )
        }
        title={<Space><ImportOutlined /> Import Items</Space>}
      >
        {importRows.length === 0 && !importSummary && (
          <div style={{ padding: '8px 0' }}>
            <Alert
              type="info"
              showIcon
              message="CSV import with validation and preview"
              description="Existing items are never overwritten: rows whose Item Code already exists are reported as duplicates and skipped."
              style={{ marginBottom: 16 }}
            />
            <Space style={{ marginBottom: 16 }}>
              <Button
                icon={<DownloadOutlined />}
                onClick={() => downloadText('item-import-template.csv', TEMPLATE_CSV)}
              >
                Download Template
              </Button>
            </Space>
            <Upload.Dragger
              name="file"
              accept=".csv,.txt"
              maxCount={1}
              showUploadList={false}
              beforeUpload={handleImportFile}
            >
              <p className="ant-upload-drag-icon"><InboxOutlined /></p>
              <p className="ant-upload-text">Click or drag a CSV file here</p>
              <p className="ant-upload-hint">
                Columns: {IMPORT_COLUMNS.join(', ')}. Required per row: itemCode, name, itemType, uomCode.
              </p>
            </Upload.Dragger>
          </div>
        )}

        {importRows.length > 0 && !importSummary && (
          <div>
            <Alert
              type="info"
              showIcon
              message={`Preview: ${importFileName}`}
              description={
                <span>
                  Total rows: <b>{importRows.length}</b> ·{' '}
                  Valid: <b style={{ color: '#1a7f37' }}>{importRows.filter((r) => r.status === 'VALID').length}</b> ·{' '}
                  Duplicates: <b style={{ color: '#b9770e' }}>{importRows.filter((r) => r.status === 'DUPLICATE').length}</b> ·{' '}
                  Invalid: <b style={{ color: '#c0392b' }}>{importRows.filter((r) => r.status === 'INVALID').length}</b>
                </span>
              }
              style={{ marginBottom: 12 }}
            />
            <Table
              rowKey="rowNumber"
              size="small"
              dataSource={importRows}
              pagination={{ pageSize: 8, showSizeChanger: false }}
              columns={[
                { title: 'Row', dataIndex: 'rowNumber', width: 60 },
                {
                  title: 'Item Code', width: 150,
                  render: (_: unknown, r: ImportRow) => <b>{r.data['itemCode']}</b>,
                },
                { title: 'Name', width: 180, ellipsis: true, render: (_: unknown, r: ImportRow) => r.data['name'] },
                { title: 'Type', width: 120, render: (_: unknown, r: ImportRow) => r.data['itemType'] },
                { title: 'UOM', width: 70, render: (_: unknown, r: ImportRow) => r.data['uomCode'] },
                {
                  title: 'Result', width: 110,
                  render: (_: unknown, r: ImportRow) => {
                    if (r.status === 'VALID') return <Tag color="success">Valid</Tag>;
                    if (r.status === 'DUPLICATE') return <Tag color="warning">Duplicate</Tag>;
                    return <Tag color="error">Invalid</Tag>;
                  },
                },
                {
                  title: 'Details',
                  render: (_: unknown, r: ImportRow) =>
                    r.errors.length > 0 ? (
                      <Text type="danger" style={{ fontSize: 12 }}>{r.errors.join('; ')}</Text>
                    ) : (
                      <Text type="secondary" style={{ fontSize: 12 }}>Ready to import</Text>
                    ),
                },
              ]}
            />
          </div>
        )}

        {importing && (
          <div style={{ textAlign: 'center', padding: 32 }}>
            <Spin size="large" />
            <div style={{ marginTop: 12 }}>Importing items… this may take a moment.</div>
          </div>
        )}

        {importSummary && !importing && (
          <div>
            <Alert
              type={importSummary.failed > 0 ? 'warning' : 'success'}
              showIcon
              message="Import finished"
              style={{ marginBottom: 16 }}
            />
            <Descriptions bordered size="small" column={1} labelStyle={{ width: 180 }}>
              <Descriptions.Item label="Total rows">{importSummary.total}</Descriptions.Item>
              <Descriptions.Item label="Valid rows">{importSummary.valid}</Descriptions.Item>
              <Descriptions.Item label="Invalid rows">{importSummary.invalid}</Descriptions.Item>
              <Descriptions.Item label="Duplicate rows (skipped)">{importSummary.duplicate}</Descriptions.Item>
              <Descriptions.Item label="Imported rows"><b style={{ color: '#1a7f37' }}>{importSummary.imported}</b></Descriptions.Item>
              <Descriptions.Item label="Failed rows">{importSummary.failed}</Descriptions.Item>
              <Descriptions.Item label="Skipped rows">{importSummary.skipped}</Descriptions.Item>
            </Descriptions>
            {importSummary.errors.length > 0 && (
              <Alert
                type="error"
                style={{ marginTop: 12 }}
                message="Row errors"
                description={
                  <ul style={{ margin: 0, paddingLeft: 20, maxHeight: 160, overflowY: 'auto' }}>
                    {importSummary.errors.map((e, i) => <li key={i} style={{ fontSize: 12 }}>{e}</li>)}
                  </ul>
                }
              />
            )}
          </div>
        )}
      </Modal>
    </div>
  );
};

export default ItemManagement;
