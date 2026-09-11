import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import {
  Alert, App, Badge, Button, Card, Col, Descriptions, Dropdown, Form, Grid, Input,
  InputNumber, Modal, Popconfirm, Row, Select, Space, Spin, Switch, Table, Tabs, Tag, Tooltip, Typography, Upload,
} from 'antd';
import {
  ApartmentOutlined, AppstoreOutlined, ArrowDownOutlined, ArrowUpOutlined, ClearOutlined, DeleteOutlined, DollarOutlined, DownloadOutlined, EditOutlined,
  EyeOutlined, FileAddOutlined, FilePdfOutlined, FilterOutlined, ImportOutlined, InboxOutlined,
  PauseCircleOutlined, PlayCircleOutlined, PlusOutlined, PrinterOutlined,
  ReloadOutlined, SearchOutlined, ScanOutlined, HistoryOutlined, DatabaseOutlined, ProjectOutlined, ArrowRightOutlined,
  BankOutlined, BuildOutlined, CheckCircleOutlined, CustomerServiceOutlined, FolderOutlined, SettingOutlined, ToolOutlined,
} from '@ant-design/icons';
import type { ColumnsType, TablePaginationConfig } from 'antd/es/table';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import apiService from '../../services/api';
import { formatDimension } from '../../utils/numberFormat';
import { PageHeader, StatusBadge, EmptyState, LoadingState, ERPTable, BarcodeScanner, BarcodePrint, DraggableResizableModal } from '../../components/shared';
import { usePermission } from '../../hooks/usePermission';
import JsBarcode from 'jsbarcode';
import {
  ITEM_TYPES, ROUTE_TYPES, STATUS_OPTIONS, statusColorMap, TRACKING_SWITCHES,
  routeColorMap, IMPORT_COLUMNS, REQUIRED_IMPORT_COLUMNS, TEMPLATE_CSV,
  deriveNextStageTitle, isEmptyValue,
  type Item, type DivisionOption, type SectionOption, type DepartmentOption,
  type UomOption, type SimpleOption, type CategoryOption, type ConversionInfo,
  type ImportRow, type ProductionFlowStage,
} from './items/itemTypes';
import InputMaterialSelect from './items/InputMaterialSelect';
import ProductionFlowCard, { StageBlock } from './items/ProductionFlowCard';

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

// Display only the human-readable business name (never expose codes/IDs in normal views).
const divisionName = (r: Item): string | null =>
  r.division ? r.division.name : (r.divisionName ?? null);
const sectionName = (r: Item): string | null =>
  r.section ? r.section.name : (r.sectionName ?? null);
const departmentName = (r: Item): string | null =>
  r.department ? r.department.name : (r.departmentName ?? null);
// Category name: the API returns the nested `category` relation object; the flat
// `categoryName` field does not exist on the backend and is kept only as a legacy fallback.
const categoryName = (r: Item): string | null =>
  (r.category && r.category.name) ? r.category.name : (r.categoryName ?? null);
const companyName = (r: Item): string | null =>
  (r.company && (r.company.legalName || r.company.tradeName)) || null;

type ItemTypeIconComponent =
  React.ForwardRefExoticComponent<
    { style?: React.CSSProperties; className?: string; spin?: boolean; 'aria-hidden'?: React.AriaAttributes['aria-hidden']; role?: string; title?: string }
    & React.RefAttributes<HTMLSpanElement>
  >;

// TASK 13 — presentation-only icon mapping. Every item type gets a meaningful
// primary icon (tab/card) and a matching background watermark icon. Nothing here
// hard-codes test data or counts; it is pure iconography for existing types.
export const ITEM_TYPE_ICONS: Record<string, ItemTypeIconComponent> = {
  RAW_MATERIAL: DatabaseOutlined,
  WORK_IN_PROGRESS: ToolOutlined,
  SEMI_FINISHED: BuildOutlined,
  FINISHED_GOOD: CheckCircleOutlined,
  PACKAGING_MATERIAL: InboxOutlined,
  CONSUMABLE: AppstoreOutlined,
  SPARE_PART: SettingOutlined,
  SERVICE: CustomerServiceOutlined,
  ASSET: BankOutlined,
  OTHER: FolderOutlined,
};

// Watermark icons reuse the same product-group glyph, rendered large & faint in
// the background of each item type card.
export const ITEM_TYPE_WATERMARK_ICONS: Record<string, ItemTypeIconComponent> = ITEM_TYPE_ICONS;

interface ItemTypeCardProps {
  label: string;
  icon: ItemTypeIconComponent;
  watermarkIcon: ItemTypeIconComponent;
  count?: number;
  active: boolean;
  testId: string;
  onClick: () => void;
}

const ItemTypeCard: React.FC<ItemTypeCardProps> = ({
  label, icon: Icon, watermarkIcon: WatermarkIcon, count, active, testId, onClick,
}) => (
  <button
    type="button"
    role="tab"
    aria-selected={active}
    aria-label={label}
    data-testid={testId}
    title={label}
    onClick={onClick}
    style={{
      position: 'relative',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      gap: 2,
      padding: '8px 10px',
      minHeight: 54,
      textAlign: 'left',
      overflow: 'hidden',
      borderRadius: 8,
      cursor: 'pointer',
      fontFamily: 'inherit',
      border: active
        ? `1.5px solid var(--theme-accent, var(--theme-primary, #4f46e5))`
        : '1px solid var(--theme-border, #e4e7f1)',
      background: active
        ? 'var(--theme-accent-soft, rgba(79, 70, 229, 0.1))'
        : 'var(--theme-surface, #ffffff)',
      transition: 'border-color 0.15s, background 0.15s',
    }}
  >
    <WatermarkIcon
      aria-hidden="true"
      data-watermark="true"
      style={{
        position: 'absolute', right: -4, bottom: -12, fontSize: 52, opacity: 0.1, zIndex: 0,
        color: 'var(--theme-accent, var(--theme-primary, #4f46e5))', pointerEvents: 'none',
      }}
    />
    <span
      style={{
        position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center', gap: 6, minWidth: 0,
        color: active ? 'var(--theme-accent, var(--theme-primary, #4f46e5))' : 'var(--theme-text)',
      }}
    >
      <Icon
        aria-hidden="true"
        data-primary-icon="true"
        style={{
          fontSize: 14,
          color: active ? 'var(--theme-accent, var(--theme-primary, #4f46e5))' : 'var(--theme-text-muted)',
        }}
      />
      <Text
        style={{
          fontSize: 12.5, lineHeight: 1.25,
          color: active ? 'var(--theme-accent, var(--theme-primary, #4f46e5))' : 'var(--theme-text)',
          fontWeight: active ? 700 : 500,
        }}
        ellipsis
      >
        {label}
      </Text>
    </span>
    {count !== undefined && (
      <Text type="secondary" style={{ position: 'relative', zIndex: 1, fontSize: 10.5, lineHeight: 1.2 }}>
        {count} items
      </Text>
    )}
  </button>
);

const ItemManagement: React.FC = () => {
  const { message } = App.useApp();
  const { can } = usePermission();
  const screens = Grid.useBreakpoint();
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
  const [stats, setStats] = useState<{
    total: number | null; active: number | null; inactive: number | null;
    stock: number | null; manufactured: number | null;
  }>({ total: null, active: null, inactive: null, stock: null, manufactured: null });
  // TASK 13 — real per-item-type counts fetched from the same items API
  // (limit 1, total only). A type whose count could not be fetched simply has no
  // badge; counts are never fabricated or hard-coded.
  const [typeCounts, setTypeCounts] = useState<Record<string, number>>({});

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Item | null>(null);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();
  // TASK #34B: live Item Code / Name so the read-only OUTPUT PRODUCT field on the
  // form reflects the current item while it is being typed.
  const watchedCode = Form.useWatch('itemCode', form);
  const watchedName = Form.useWatch('name', form);
  const watchedDivisionId = Form.useWatch('divisionId', form);
  const watchedDepartmentId = Form.useWatch('departmentId', form);
  const watchedItemType = Form.useWatch('itemType', form);
  const watchedWireSizeMm = Form.useWatch('wireSizeMm', form);
  const watchedDiameterMm = Form.useWatch('diameterMm', form);
  const watchedThicknessMm = Form.useWatch('thicknessMm', form);
  const watchedWidthMm = Form.useWatch('widthMm', form);
  const watchedLengthPerPiece = Form.useWatch('lengthPerPiece', form);
  const watchedRouteTypeId = Form.useWatch('routeTypeId', form);
  const watchedRouteType = Form.useWatch('routeType', form);
  const watchedFinalProduct = Form.useWatch('finalProduct', form);
  const watchedPackingNextStep = Form.useWatch('packingNextStep', form);
  const watchedProcess1 = Form.useWatch('process1', form);
  const watchedProcess2 = Form.useWatch('process2', form);
  const watchedProcess3 = Form.useWatch('process3', form);
  const watchedProcess4 = Form.useWatch('process4', form);
  const watchedProcess5 = Form.useWatch('process5', form);
  const watchedProcess6 = Form.useWatch('process6', form);
  const watchedProcesses = Form.useWatch('processes', form);
  const [selectedInputDetail, setSelectedInputDetail] = useState<Partial<Item> | null>(null);

  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailItem, setDetailItem] = useState<Item | null>(null);
  const [detailTab, setDetailTab] = useState('overview');
  const [conversions, setConversions] = useState<ConversionInfo | null>(null);
  const [registryBarcodes, setRegistryBarcodes] = useState<any[]>([]);

  const [exporting, setExporting] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [pdfing, setPdfing] = useState(false);

  const [importOpen, setImportOpen] = useState(false);
  const [importFileName, setImportFileName] = useState<string | null>(null);
  const [importRows, setImportRows] = useState<ImportRow[]>([]);
  const [importSummary, setImportSummary] = useState<{
    total: number; valid: number; invalid: number; duplicate: number;
    imported: number; failed: number; skipped: number; errors: string[];
  } | null>(null);
  const [importing, setImporting] = useState(false);

  // Barcode Scanner & Print state
  const [scannerOpen, setScannerOpen] = useState(false);
  const [printOpen, setPrintOpen] = useState(false);
  const [printItem, setPrintItem] = useState<Item | null>(null);

  // Barcode Detail Modal state
  const [barcodeModalOpen, setBarcodeModalOpen] = useState(false);
  const [barcodeModalItem, setBarcodeModalItem] = useState<Item | null>(null);
  const [barcodeModalBarcodes, setBarcodeModalBarcodes] = useState<any[]>([]);
  const barcodeModalSvgRef = useRef<SVGSVGElement>(null);
  const location = useLocation();

  // Item History state
  const [stockLedger, setStockLedger] = useState<any[]>([]);
  const [stockLedgerTotal, setStockLedgerTotal] = useState(0);
  const [inventoryBalances, setInventoryBalances] = useState<any[]>([]);
  const [productionHistory, setProductionHistory] = useState<any[]>([]);
  const [productionHistoryTotal, setProductionHistoryTotal] = useState(0);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyTab, setHistoryTab] = useState('inventory');
  const [historyErrors, setHistoryErrors] = useState<{ inventory?: string; stockLedger?: string; production?: string }>({});

  // Detail drawer barcode SVG ref
  const detailBarcodeSvgRef = useRef<SVGSVGElement>(null);
  const detailBarcodeAttempted = useRef(false);

  const renderDetailBarcode = useCallback(() => {
    const barcodeToRender = detailItem?.barcode || registryBarcodes[0]?.barcodeValue;
    const svg = detailBarcodeSvgRef.current;
    if (!barcodeToRender || !svg) return;
    try {
      JsBarcode(svg, barcodeToRender, {
        format: 'CODE128',
        width: 1.2,
        height: 30,
        displayValue: true,
        fontSize: 10,
        font: 'monospace',
        textMargin: 1,
        margin: 2,
        background: 'transparent',
        lineColor: '#000000',
      });
      detailBarcodeAttempted.current = true;
    } catch (err) {
      console.error('Detail barcode render error:', err);
      if (svg) {
        svg.innerHTML = `<text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-family="monospace" font-size="11" fill="#666">${barcodeToRender}</text>`;
      }
      detailBarcodeAttempted.current = true;
    }
  }, [detailItem?.barcode, registryBarcodes]);

  useEffect(() => {
    detailBarcodeAttempted.current = false;
    if (!detailOpen) return;
    const timers: NodeJS.Timeout[] = [];
    [0, 50, 150].forEach((delay) => {
      timers.push(setTimeout(() => {
        if (!detailBarcodeAttempted.current) renderDetailBarcode();
      }, delay));
    });
    return () => timers.forEach(clearTimeout);
  }, [detailOpen, renderDetailBarcode]);

  const detailBarcodeCallbackRef = useCallback((node: SVGSVGElement | null) => {
    (detailBarcodeSvgRef as React.MutableRefObject<SVGSVGElement | null>).current = node;
    if (node && detailOpen && !detailBarcodeAttempted.current) {
      requestAnimationFrame(() => renderDetailBarcode());
    }
  }, [detailOpen, renderDetailBarcode]);

  // Barcode modal SVG rendering
  const barcodeModalAttempted = useRef(false);

  const renderBarcodeModal = useCallback(() => {
    const barcodeToRender = barcodeModalItem?.barcode || barcodeModalBarcodes[0]?.barcodeValue;
    const svg = barcodeModalSvgRef.current;
    if (!barcodeToRender || !svg) return;
    try {
      JsBarcode(svg, barcodeToRender, {
        format: 'CODE128',
        width: 2,
        height: 60,
        displayValue: true,
        fontSize: 14,
        font: 'monospace',
        textMargin: 2,
        margin: 4,
        background: '#ffffff',
        lineColor: '#000000',
      });
      barcodeModalAttempted.current = true;
    } catch (err) {
      console.error('Barcode modal render error:', err);
      if (svg) {
        svg.innerHTML = `<text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-family="monospace" font-size="14" fill="#666">${barcodeToRender}</text>`;
      }
      barcodeModalAttempted.current = true;
    }
  }, [barcodeModalItem?.barcode, barcodeModalBarcodes]);

  useEffect(() => {
    barcodeModalAttempted.current = false;
    if (!barcodeModalOpen) return;
    const timers: NodeJS.Timeout[] = [];
    [0, 50, 150].forEach((delay) => {
      timers.push(setTimeout(() => {
        if (!barcodeModalAttempted.current) renderBarcodeModal();
      }, delay));
    });
    return () => timers.forEach(clearTimeout);
  }, [barcodeModalOpen, renderBarcodeModal]);

  const barcodeModalCallbackRef = useCallback((node: SVGSVGElement | null) => {
    (barcodeModalSvgRef as React.MutableRefObject<SVGSVGElement | null>).current = node;
    if (node && barcodeModalOpen && !barcodeModalAttempted.current) {
      requestAnimationFrame(() => renderBarcodeModal());
    }
  }, [barcodeModalOpen, renderBarcodeModal]);

  // Auto-open item detail from scan navigation
  useEffect(() => {
    const scanState = location.state as { entityId?: string; entityLabel?: string; openBarcode?: boolean } | null;
    if (scanState?.entityId && items.length > 0) {
      const item = items.find((i) => i.id === scanState.entityId);
      if (item) {
        if (scanState.openBarcode) {
          openBarcodeModal(item);
        } else {
          openDetail(item);
        }
        window.history.replaceState({}, document.title);
      }
    }
  }, [location.state, items]);

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
    const seen = new Set<string>();
    const out: SimpleOption[] = [];
    const walk = (nodes: CategoryOption[]) => {
      nodes?.forEach((n) => {
        if (n && n.id && !seen.has(n.id)) {
          seen.add(n.id);
          out.push({ id: n.id, name: n.name });
        }
        if (n?.children?.length) walk(n.children);
      });
    };
    walk(categories || []);
    return out;
  }, [categories]);

  const toUnique = useCallback(
    <T extends { id?: string }>(list: T[], getLabel: (item: T) => React.ReactNode, getValue?: (item: T) => string) => {
      const seen = new Set<string>();
      const result: Array<{ value: string; label: React.ReactNode }> = [];
      list?.forEach((item) => {
        const val = getValue ? getValue(item) : item?.id;
        if (val && !seen.has(val)) {
          seen.add(val);
          result.push({ value: val, label: getLabel(item) });
        }
      });
      return result;
    },
    [],
  );

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

  // Normalize relation data: derive display names from the nested relations the
  // backend actually returns (category, UOMs, company) so every screen (list,
  // detail view, history, exports) reads consistent values.
  const normalizeItem = useCallback((item: any): Item => {
    if (item) {
      if (item.baseUom && !item.baseUomName) {
        item.baseUomName = item.baseUom.name ?? item.baseUom.code ?? null;
      }
      if (item.category?.name && !item.categoryName) {
        item.categoryName = item.category.name;
      }
    }
    return item as Item;
  }, []);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await apiService.get<{ data: Item[]; total: number }>('/master-data/items', buildParams());
      setItems((response.data || []).map(normalizeItem));
      setTotal(response.total || 0);
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to load items. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [buildParams, normalizeItem]);

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
      const [uomSettled, catSettled, divSettled, secSettled, depSettled, rtSettled] = await Promise.allSettled([
        apiService.get<{ data: UomOption[] }>('/master-data/uom', { limit: 200 }),
        apiService.get<{ data: CategoryOption[] }>('/master-data/categories', { limit: 500 }),
        apiService.get<{ data: DivisionOption[] }>('/divisions', { limit: 200 }),
        apiService.get<{ data: SectionOption[] }>('/sections', { limit: 500 }),
        apiService.get<{ data: DepartmentOption[] }>('/departments', { limit: 500 }),
        apiService.get<{ data: Array<{ id: string; routeCode: string; name: string; status: string }> }>('/master-data/route-types', { limit: 200 }),
      ]);

      if (uomSettled.status === 'fulfilled') setUoms(uomSettled.value.data || []);
      if (catSettled.status === 'fulfilled') setCategories(catSettled.value.data || []);
      if (divSettled.status === 'fulfilled') setDivisions(divSettled.value.data || []);
      if (secSettled.status === 'fulfilled') setSections(secSettled.value.data || []);
      if (depSettled.status === 'fulfilled') setDepartments(depSettled.value.data || []);
      if (rtSettled.status === 'fulfilled') {
        setRouteTypes((rtSettled.value.data || []).filter((rt) => rt.status === 'ACTIVE'));
        setRouteTypesState('ready');
      } else {
        setRouteTypesState('error');
      }

      const allFailed = [uomSettled, catSettled, divSettled, secSettled, depSettled, rtSettled].every(s => s.status === 'rejected');
      if (allFailed) {
        message.warning('Could not connect to server to load master data. Please check your network or try again.');
      }
      setCompanyId(await resolveCompanyId());
      if (can('item.view')) {
        const mk = async (params: Record<string, unknown>) => {
          const res = await apiService.get<{ data: Item[]; total: number }>('/master-data/items', { page: 1, limit: 1, ...params });
          return res.total || 0;
        };
        try {
          const [totalCount, active, inactive, stock, manufactured] = await Promise.all([
            mk({}),
            mk({ status: 'ACTIVE' }),
            mk({ status: 'INACTIVE' }),
            mk({ isStockItem: true }),
            mk({ isManufacturable: true }),
          ]);
          setStats({ total: totalCount, active, inactive, stock, manufactured });
        } catch {
          // keep page-derived fallback values on failure
        }
        try {
          const settled = await Promise.allSettled(
            ITEM_TYPES.map((t) => mk({ itemType: t.value })),
          );
          const counts: Record<string, number> = {};
          ITEM_TYPES.forEach((t, i) => {
            if (settled[i].status === 'fulfilled') counts[t.value] = settled[i].value;
          });
          setTypeCounts(counts);
        } catch {
          // per-type counts stay absent; the All Items count badge remains.
        }
      }
    })();
  }, [resolveCompanyId, message, can]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  const handleTabChange = (key: string) => {
    setActiveTab(key);
    setFItemType(key === 'all' ? undefined : key);
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
    setSelectedInputDetail(null);
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
      processes: [],
      // TASK #34C: stock-level / lead-time numeric inputs start BLANK (no '0').
      // The database defaults to 0 when left unset on create.
    });
    setFormOpen(true);
  };

  const openEdit = (record: Item) => {
    setEditing(record);
    setSelectedInputDetail(record.productionInItem ?? null);

    const initialProcs = (record.processes && record.processes.length > 0)
      ? record.processes.map((p, idx) => ({ sequence: p.sequence ?? (idx + 1), name: p.name }))
      : [
          record.process1 ? { sequence: 1, name: record.process1 } : null,
          record.process2 ? { sequence: 2, name: record.process2 } : null,
          record.process3 ? { sequence: 3, name: record.process3 } : null,
          record.process4 ? { sequence: 4, name: record.process4 } : null,
          record.process5 ? { sequence: 5, name: record.process5 } : null,
          record.process6 ? { sequence: 6, name: record.process6 } : null,
        ].filter(Boolean) as { sequence: number; name: string }[];

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
      diameterMm: record.diameterMm ?? (record.division?.name?.toLowerCase().includes('spoke') || record.name?.toLowerCase().includes('spoke') ? record.wireSizeMm ?? undefined : undefined),
      thicknessMm: record.thicknessMm ?? undefined,
      widthMm: record.widthMm ?? undefined,
      routeType: record.routeType ?? undefined,
      routeTypeId: record.routeTypeId ?? (record.routeType ? routeTypes.find((rt) => rt.routeCode === record.routeType)?.id : undefined),
      process1: record.process1 ?? undefined,
      process2: record.process2 ?? undefined,
      process3: record.process3 ?? undefined,
      process4: record.process4 ?? undefined,
      process5: record.process5 ?? undefined,
      process6: record.process6 ?? undefined,
      processes: initialProcs,
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
      costPrice: record.costPrice ?? undefined,
      sellingPrice: record.sellingPrice ?? undefined,
      productionInItemId: record.productionInItemId ?? undefined,
    });
    setFormOpen(true);
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      const payload: Record<string, unknown> = {};

      const CLEARABLE_FIELDS = [
        'weightPerMeter',
        'weightPerPiece',
        'piecesPerKg',
        'lengthPerPiece',
        'wireSizeMm',
        'diameterMm',
        'thicknessMm',
        'widthMm',
        'purchaseUomId',
        'salesUomId',
        'categoryId',
        'divisionId',
        'sectionId',
        'departmentId',
        'routeTypeId',
        'routeType',
        'productionInItemId',
        'finalProduct',
        'packingNextStep',
        'sku',
        'shortName',
        'description',
        'notes',
        'barcode',
        'manufacturerPartNumber',
        'brand',
        'model',
        'minimumStockLevel',
        'maximumStockLevel',
        'reorderLevel',
        'safetyStockLevel',
        'leadTimeDays',
        'costPrice',
        'sellingPrice',
      ] as const;

      const NUMERIC_FIELDS = new Set([
        'weightPerMeter',
        'weightPerPiece',
        'piecesPerKg',
        'lengthPerPiece',
        'wireSizeMm',
        'diameterMm',
        'thicknessMm',
        'widthMm',
        'minimumStockLevel',
        'maximumStockLevel',
        'reorderLevel',
        'safetyStockLevel',
        'leadTimeDays',
        'costPrice',
        'sellingPrice',
      ]);

      Object.entries(values).forEach(([k, v]) => {
        if (v === undefined || v === null) return;
        if (typeof v === 'string') {
          const trimmed = v.trim();
          if (trimmed === '') return;
          if (NUMERIC_FIELDS.has(k)) {
            const num = Number(trimmed);
            payload[k] = isNaN(num) ? null : num;
          } else {
            payload[k] = trimmed;
          }
        } else {
          payload[k] = v;
        }
      });

      // When editing an existing item, any clearable field that is empty in the form
      // must be explicitly sent as null to persist the clearance in the database.
      if (editing) {
        for (const field of CLEARABLE_FIELDS) {
          const val = values[field];
          const isEmpty =
            val === undefined ||
            val === null ||
            (typeof val === 'string' && val.trim() === '');
          if (isEmpty) {
            payload[field] = null;
          }
        }
        // If routeTypeId was cleared to null, ensure routeType legacy code is also nullified
        if (payload.routeTypeId === null) {
          payload.routeType = null;
        }
      }

      // Defensive: strip any non-UUID display text from org fields (should never happen, but safe)
      const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      for (const field of ['divisionId', 'sectionId', 'departmentId', 'categoryId', 'baseUomId', 'purchaseUomId', 'salesUomId', 'routeTypeId'] as const) {
        if (payload[field] !== undefined && payload[field] !== null && typeof payload[field] === 'string') {
          const val = (payload[field] as string).trim();
          if (!UUID_RE.test(val)) {
            if (editing) {
              payload[field] = null;
            } else {
              delete payload[field];
            }
          }
        }
      }

      // Route type: submit the UUID (routeTypeId). Remove the legacy display-code field
      // so the backend authoritative route-types master decides the stored code.
      if (payload.routeTypeId && payload.routeType !== undefined) {
        delete payload.routeType;
      }

      // Sanitize and normalize process keys so no aliases with spaces or underscores reach the backend
      for (let i = 1; i <= 6; i++) {
        const canonical = `process${i}`;
        const aliases = [`process ${i}`, `Process ${i}`, `process_${i}`];
        for (const alias of aliases) {
          if (payload[alias] !== undefined) {
            if (!payload[canonical]) payload[canonical] = payload[alias];
            delete payload[alias];
          }
        }
      }

      // Handle repeatable processes array from Form.List
      if (Array.isArray(values.processes)) {
        const cleanProcs = values.processes
          .filter((p: any) => p && (typeof p === 'string' ? p.trim() : (p.name && String(p.name).trim())))
          .map((p: any, idx: number) => ({
            sequence: idx + 1,
            name: typeof p === 'string' ? p.trim() : String(p.name).trim(),
          }));
        payload.processes = cleanProcs;
        for (let i = 1; i <= 6; i++) {
          payload[`process${i}`] = cleanProcs[i - 1]?.name || null;
        }
      } else if (editing) {
        // If processes array wasn't provided, ensure any cleared individual process fields are nullified
        for (let i = 1; i <= 6; i++) {
          const canonical = `process${i}`;
          const val = values[canonical];
          if (val === undefined || val === null || (typeof val === 'string' && val.trim() === '')) {
            payload[canonical] = null;
          }
        }
      }

      if (editing) {
        if (editing.companyId) payload.companyId = editing.companyId;
        // TASK #45: If the user deliberately cleared the production input material,
        // send null so the backend clears productionInItemId and productionOutItemId.
        if (!values.productionInItemId) {
          payload.productionInItemId = null;
        }
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
    setDetailTab('overview');
    setConversions(null);
    setRegistryBarcodes([]);
    try {
      const [itemRes, convRes, barcodeRes] = await Promise.all([
        apiService.get<{ data: Item }>(`/master-data/items/${record.id}`),
        apiService
          .get<{ data: ConversionInfo }>(`/master-data/items/${record.id}/conversions`)
          .catch(() => null),
        apiService.get<{ success: boolean; data: any[]; total: number }>(`/barcode-management?entityType=ITEM&limit=1000`)
          .catch(() => null),
      ]);
      setDetailItem(normalizeItem(itemRes.data));
      setConversions(convRes?.data ?? null);
      const itemBarcodes = Array.isArray(barcodeRes?.data) ? barcodeRes.data.filter((b: any) => b.entityId === record.id) : [];
      setRegistryBarcodes(itemBarcodes);
    } catch (err: any) {
      message.error(err?.response?.data?.message || 'Failed to load item details');
      setDetailOpen(false);
    } finally {
      setDetailLoading(false);
    }
  };

  const openBarcodeModal = async (record: Item) => {
    setBarcodeModalOpen(true);
    setBarcodeModalItem(record);
    setBarcodeModalBarcodes([]);
    try {
      const res = await apiService.get<{ success: boolean; data: any[]; total: number }>(
        `/barcode-management?entityType=ITEM&limit=1000`
      ).catch(() => null);
      const allBarcodes = Array.isArray(res?.data) ? res.data : [];
      setBarcodeModalBarcodes(allBarcodes.filter((b: any) => b.entityId === record.id));
    } catch {
      // If barcode fetch fails, show the item's barcode column value
    }
  };

  const loadHistoryData = async (record: Item) => {
    setHistoryLoading(true);
    setHistoryTab('inventory');
    setHistoryErrors({});
    const errors: { inventory?: string; stockLedger?: string; production?: string } = {};

    const [invRes, ledgerRes, prodRes] = await Promise.allSettled([
      apiService.get<{ data: any[] }>(`/master-data/items/${record.id}/inventory`),
      apiService.get<{ data: any[]; total: number }>(`/master-data/items/${record.id}/stock-ledger`, { limit: 50 }),
      apiService.get<{ data: any[]; total: number }>(`/master-data/items/${record.id}/production-history`, { limit: 50 }),
    ]);

    if (invRes.status === 'fulfilled') {
      setInventoryBalances(invRes.value.data || []);
    } else {
      errors.inventory = invRes.reason?.response?.data?.message || 'Failed to load inventory';
    }

    if (ledgerRes.status === 'fulfilled') {
      setStockLedger(ledgerRes.value.data || []);
      setStockLedgerTotal(ledgerRes.value.total || 0);
    } else {
      errors.stockLedger = ledgerRes.reason?.response?.data?.message || 'Failed to load stock ledger';
    }

    if (prodRes.status === 'fulfilled') {
      setProductionHistory(prodRes.value.data || []);
      setProductionHistoryTotal(prodRes.value.total || 0);
    } else {
      errors.production = prodRes.reason?.response?.data?.message || 'Failed to load production history';
    }

    setHistoryErrors(errors);
    setHistoryLoading(false);
  };

  const handleDetailTabChange = (key: string) => {
    setDetailTab(key);
    if (key === 'history' && detailItem) {
      void loadHistoryData(detailItem);
    }
  };

  const openHistory = async (record: Item) => {
    setDetailOpen(true);
    setDetailLoading(true);
    setDetailItem(null);
    setDetailTab('history');
    setConversions(null);
    setRegistryBarcodes([]);
    setHistoryLoading(true);

    const [detailRes] = await Promise.allSettled([
      apiService.get<{ data: Item }>(`/master-data/items/${record.id}`),
    ]);

    const item = detailRes.status === 'fulfilled' ? normalizeItem(detailRes.value.data) : record;
    setDetailItem(item);
    setDetailLoading(false);
    await loadHistoryData(item);
  };

  const handleBarcodeScan = async (barcode: string) => {
    try {
      const stored = localStorage.getItem('erp_user');
      const user = stored ? JSON.parse(stored) : null;
      const cid = user?.defaultCompanyId;
      if (!cid) {
        message.error('No company context available');
        return;
      }
      const res = await apiService.get<{ data: Item }>(`/master-data/items/by-barcode/${cid}/${barcode}`);
      if (res.data) {
        message.success(`Item found: ${res.data.itemCode}`);
        openDetail(res.data);
      }
    } catch (err: any) {
      const msg = err?.response?.data?.message || 'Barcode not found';
      Modal.error({
        title: 'Barcode Not Found',
        content: (
          <div>
            <p>No item found for barcode: <strong>{barcode}</strong></p>
            <p style={{ color: '#666' }}>{typeof msg === 'string' ? msg : 'The scanned barcode does not match any item in the system.'}</p>
          </div>
        ),
      });
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
    'Department', 'Wire Size (mm)', 'Diameter (mm)', 'Thickness (mm)', 'Width (mm)', 'Route Type',
    'Process 1', 'Process 2', 'Process 3', 'Process 4', 'Process 5', 'Process 6',
    'Final Product', 'Packing / Next Step', 'Base UOM', 'Weight per Piece (KG)',
    'Pieces per KG', 'Weight per Meter (kg/m)', 'Length per Piece (m)', 'Barcode', 'Status', 'Remarks',
  ];

  const itemToExportRow = (r: Item): Array<string | number | null | undefined> => [
    r.itemCode, r.name, r.sku ?? '', r.shortName ?? '',
    ITEM_TYPES.find((t) => t.value === r.itemType)?.label || r.itemType,
    categoryName(r) ?? '',
    divisionName(r) ?? '',
    sectionName(r) ?? '',
    departmentName(r) ?? '',
    formatDimension(r.wireSizeMm),
    formatDimension(r.diameterMm),
    formatDimension(r.thicknessMm),
    formatDimension(r.widthMm),
    r.routeType ? routeTypeLabel({ routeType: r.routeType, routeTypeId: r.routeTypeId, routeTypeRef: r.routeTypeRef } as Item) : '',
    r.process1 ?? '', r.process2 ?? '', r.process3 ?? '', r.process4 ?? '', r.process5 ?? '', r.process6 ?? '',
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
    if (fRouteType) {
      const rt = routeTypes.find((t) => t.id === fRouteType);
      if (rt) parts.push(`Route: ${rt.name?.trim() ? rt.name : rt.routeCode}`);
    }
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
            <td><b>${r.itemCode}</b></td><td>${r.name}</td><td>${divisionName(r) ?? ''}</td>
            <td>${sectionName(r) ?? ''}</td>
            <td>${departmentName(r) ?? ''}</td>
            <td class="num">${formatDimension(r.wireSizeMm)}</td>
            <td class="num">${formatDimension(r.thicknessMm)}</td>
            <td class="num">${formatDimension(r.widthMm)}</td>
            <td>${ITEM_TYPES.find((t) => t.value === r.itemType)?.label || r.itemType}</td>
            <td>${r.routeType ? routeTypeLabel({ routeType: r.routeType, routeTypeId: r.routeTypeId, routeTypeRef: r.routeTypeRef } as Item) : ''}</td>
            <td>${r.baseUomName ?? ''}</td><td class="status ${(r.status ? String(r.status).toLowerCase() : '')}">${r.status ?? ''}</td>
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
    <thead><tr><th>Item Code</th><th>Name</th><th>Division</th><th>Section</th><th>Department</th><th class="num">Wire (mm)</th><th class="num">Thk (mm)</th><th class="num">Wid (mm)</th><th>Type</th><th>Route</th><th>UOM</th><th>Status</th></tr></thead>
    <tbody>${bodyRows || '<tr><td colspan="12" style="text-align:center;color:#999">No items found</td></tr>'}</tbody>
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

  const handlePdf = async () => {
    setPdfing(true);
    try {
      const rows = await collectFilteredItems();
      if (!rows.length) {
        message.info('No items to export to PDF');
        return;
      }
      const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
      doc.setFontSize(14);
      doc.setTextColor(33);
      doc.text('Products & Items Master Report', 40, 40);
      doc.setFontSize(9);
      doc.setTextColor(120);
      doc.text(`Generated ${new Date().toLocaleString()} \u00B7 ${rows.length} item(s)`, 40, 56);
      doc.text(`Filters: ${filterSummary()}`, 40, 70);
      const head = [['Item Code', 'Item Name', 'Division', 'Section', 'Department', 'Wire (mm)', 'Thk (mm)', 'Wid (mm)', 'Item Type', 'Route', 'UOM', 'Status']];
      const body = rows.map((r) => [
        r.itemCode,
        r.name,
        divisionName(r) ?? '',
        sectionName(r) ?? '',
        departmentName(r) ?? '',
        formatDimension(r.wireSizeMm),
        formatDimension(r.thicknessMm),
        formatDimension(r.widthMm),
        ITEM_TYPES.find((t) => t.value === r.itemType)?.label || r.itemType,
        routeTypeLabel(r),
        r.baseUomName ?? '',
        r.status,
      ]);
      autoTable(doc, {
        head,
        body,
        startY: 84,
        styles: { fontSize: 8, cellPadding: 4 },
        headStyles: { fillColor: [31, 41, 55], textColor: 255 },
        alternateRowStyles: { fillColor: [245, 245, 245] },
      });
      const pageCount = (doc as any).internal.getNumberOfPages();
      for (let i = 1; i <= pageCount; i += 1) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setTextColor(120);
        doc.text(`Page ${i} of ${pageCount}`, doc.internal.pageSize.getWidth() - 40, doc.internal.pageSize.getHeight() - 20, { align: 'right' });
      }
      doc.save(`item-master-${new Date().toISOString().slice(0, 10)}.pdf`);
      message.success(`Exported ${rows.length} items to PDF`);
    } catch (err: any) {
      message.error(err?.response?.data?.message || 'PDF export failed');
    } finally {
      setPdfing(false);
    }
  };

  const matchLookup = (
    value: string,
    options: Array<any>,
    codeKey?: string,
  ): string | undefined => {
    const v = value.trim().toLowerCase();
    if (!v) return undefined;
    const byId = options.find((o) => (o?.id ? String(o.id).toLowerCase() : '') === v);
    if (byId) return byId.id;
    if (codeKey) {
      const byCode = options.find((o) => String(o[codeKey] ?? '').toLowerCase() === v);
      if (byCode) return byCode.id;
    }
    const byName = options.find((o) => (o?.name ? String(o.name).toLowerCase() : '') === v);
    return byName?.id;
  };

  const validateImportRow = (
    data: Record<string, string>,
    seenCodes: Set<string>,
    existingCodes: Set<string>,
  ): { payload?: Record<string, unknown>; errors: string[]; duplicate: boolean } => {
    const errors: string[] = [];
    const get = (k: string) => {
      if (data[k] !== undefined && data[k] !== null && String(data[k]).trim() !== '') return String(data[k]).trim();
      const normK = k.toLowerCase().replace(/[\s_-]+/g, '');
      if (data[normK] !== undefined && data[normK] !== null && String(data[normK]).trim() !== '') return String(data[normK]).trim();
      return '';
    };

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
      ['wireSizeMm', 'Wire Size'], ['diameterMm', 'Diameter'], ['thicknessMm', 'Thickness'], ['widthMm', 'Width'],
      ['weightPerPiece', 'Weight per Piece'],
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
      ...(numbers.diameterMm !== undefined ? { diameterMm: numbers.diameterMm } : {}),
      ...(numbers.thicknessMm !== undefined ? { thicknessMm: numbers.thicknessMm } : {}),
      ...(numbers.widthMm !== undefined ? { widthMm: numbers.widthMm } : {}),
      ...(routeTypeId ? { routeTypeId } : {}),
      ...(get('process1') ? { process1: get('process1') } : {}),
      ...(get('process2') ? { process2: get('process2') } : {}),
      ...(get('process3') ? { process3: get('process3') } : {}),
      ...(get('process4') ? { process4: get('process4') } : {}),
      ...(get('process5') ? { process5: get('process5') } : {}),
      ...(get('process6') ? { process6: get('process6') } : {}),
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
    const normHeader = header.map((h) => h.toLowerCase().replace(/[\s_-]+/g, ''));
    const missing = REQUIRED_IMPORT_COLUMNS.filter(
      (c) => !normHeader.includes(c.toLowerCase().replace(/[\s_-]+/g, '')),
    );
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
      header.forEach((h, i) => {
        const val = cells[i] ?? '';
        data[h] = val;
        data[h.toLowerCase().replace(/[\s_-]+/g, '')] = val;
      });
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
  // Prioritize the clean business name; fall back to the route code only when no name exists.
  const routeTypeLabel = (r: Item): string => {
    const ref = r.routeTypeRef;
    if (ref) return ref.name?.trim() ? ref.name : ref.routeCode;
    if (r.routeTypeId) {
      const rt = routeTypes.find((x) => x.id === r.routeTypeId);
      if (rt) return rt.name?.trim() ? rt.name : rt.routeCode;
    }
    if (r.routeType) {
      const rt = routeTypes.find((x) => x.routeCode === r.routeType);
      if (rt) return rt.name?.trim() ? rt.name : rt.routeCode;
      return ROUTE_TYPES.find((x) => x.value === r.routeType)?.label || r.routeType;
    }
    return '';
  };

  const columns: ColumnsType<Item> = [
    {
      title: 'Item Code', dataIndex: 'itemCode', key: 'itemCode', width: 110, fixed: 'left',
      sorter: true,
      render: (v: string, r: Item) => (
        <Button
          type="link"
          size="small"
          style={{ padding: 0, height: 'auto', fontSize: 13, fontWeight: 700, color: 'var(--theme-accent, var(--theme-primary, #10b981))' }}
          onClick={() => openDetail(r)}
          aria-label={`View item ${v}`}
        >
          {v}
        </Button>
      ),
    },
    {
      title: 'Item Name', dataIndex: 'name', key: 'name', width: 210, ellipsis: { showTitle: true },
      sorter: true,
      render: (_: unknown, r: Item) => (
        <Tooltip title={r.name}>
          <div>
            <div style={{ fontSize: 13, lineHeight: 1.3 }}>{r.name}</div>
            {r.shortName && <Text type="secondary" style={{ fontSize: 11, lineHeight: 1.2 }}>{r.shortName}</Text>}
          </div>
        </Tooltip>
      ),
    },
    {
      title: 'Division / Section', key: 'divisionSection', width: 150,
      render: (_: unknown, r: Item) => {
        const d = divisionName(r);
        const s = sectionName(r);
        return (
          <div>
            <div style={{ fontSize: 13, lineHeight: 1.3 }}>
              {d ?? <Text type="secondary">—</Text>}
            </div>
            <Text type="secondary" style={{ fontSize: 11, lineHeight: 1.2 }}>
              {s ?? '—'}
            </Text>
          </div>
        );
      },
    },
    {
      title: 'Department', key: 'department', width: 130, ellipsis: true,
      render: (_: unknown, r: Item) => departmentName(r) ?? <Text type="secondary">—</Text>,
    },
    {
      title: 'Wire / Dia · Length', key: 'wireDiaLength', width: 120, align: 'right',
      sorter: (a: Item, b: Item) => (Number(a.diameterMm ?? a.wireSizeMm ?? 0) - Number(b.diameterMm ?? b.wireSizeMm ?? 0)),
      render: (_: unknown, r: Item) => {
        const dia = r.diameterMm != null ? r.diameterMm : r.wireSizeMm;
        const len = r.lengthPerPiece;
        const hasDia = dia !== null && dia !== undefined;
        const hasLen = len !== null && len !== undefined;
        if (!hasDia && !hasLen) return <Text type="secondary">—</Text>;
        return (
          <div>
            {hasDia && (
              <Text strong style={{ fontSize: 13, lineHeight: 1.3, color: 'var(--theme-accent, var(--theme-primary, #10b981))' }}>
                {formatDimension(dia)}
              </Text>
            )}
            {hasLen && (
              <Text type="secondary" style={{ fontSize: 11, lineHeight: 1.2, display: 'block' }}>
                Length: {formatDimension(len)}
              </Text>
            )}
          </div>
        );
      },
    },
    {
      title: 'Flat Spec (mm)', key: 'flatSpec', width: 110, align: 'right',
      render: (_: unknown, r: Item) => {
        const t = r.thicknessMm;
        const w = r.widthMm;
        if (t != null && w != null) return <Text style={{ fontSize: 13 }}>{formatDimension(t)} × {formatDimension(w)}</Text>;
        if (t != null) return <Text style={{ fontSize: 13 }}>{formatDimension(t)} (T)</Text>;
        if (w != null) return <Text style={{ fontSize: 13 }}>{formatDimension(w)} (W)</Text>;
        return <Text type="secondary">—</Text>;
      },
    },
    {
      title: 'Item Type', dataIndex: 'itemType', key: 'itemType', width: 120,
      render: (v: string) => {
        const label = ITEM_TYPES.find((t) => t.value === v)?.label || v;
        return <Tag style={{ marginInlineEnd: 0 }}>{label}</Tag>;
      },
    },
    {
      title: 'Route', dataIndex: 'routeType', key: 'routeType', width: 140,
      sorter: true,
      render: (v: string | null, r: Item) => {
        const label = routeTypeLabel(r);
        return label ? <span style={{ fontSize: 13 }}>{label}</span> : <Text type="secondary">—</Text>;
      },
    },
    {
      title: 'UOM / Conversion', key: 'uom', width: 130,
      render: (_: unknown, r: Item) => (
        <div>
          <div style={{ fontSize: 13, lineHeight: 1.3 }}>{r.baseUomName ?? '—'}</div>
          {convChips(r).length > 0 && (
            <Text type="secondary" style={{ fontSize: 11, lineHeight: 1.2 }}>{convChips(r).join(' · ')}</Text>
          )}
        </div>
      ),
    },
    {
      title: 'Status', dataIndex: 'status', key: 'status', width: 80,
      sorter: true,
      render: (s: string) => (
        <StatusBadge status={s} colorMap={statusColorMap} style={{ minWidth: 60, textAlign: 'center' }} />
      ),
    },
    {
      title: 'Actions', key: 'actions', width: 210, fixed: 'right',
      render: (_: unknown, record: Item) => (
        <Space size={6}>
          {can('item.view') && (
            <Tooltip title="View">
              <Button type="text" size="small" icon={<EyeOutlined />} onClick={() => openDetail(record)} className="erp-action-btn erp-action-btn--view" aria-label={`View ${record.itemCode}`} />
            </Tooltip>
          )}
          {can('item.view') && (
            <Tooltip title="History">
              <Button type="text" size="small" icon={<HistoryOutlined />} onClick={() => openHistory(record)} className="erp-action-btn" aria-label={`History for ${record.itemCode}`} />
            </Tooltip>
          )}
          {can('item_barcode.view') && (
            <Tooltip title="Barcode">
              <Button type="text" size="small" icon={<DatabaseOutlined />} onClick={() => openBarcodeModal(record)} className="erp-action-btn" aria-label={`Barcode for ${record.itemCode}`} />
            </Tooltip>
          )}
          {can('item.update') && (
            <Tooltip title="Edit">
              <Button type="text" size="small" icon={<EditOutlined />} onClick={() => openEdit(record)} className="erp-action-btn erp-action-btn--edit" aria-label={`Edit ${record.itemCode}`} />
            </Tooltip>
          )}
          <span style={{ display: 'inline-block', width: 1, height: 20, background: 'var(--theme-border, rgba(128,128,128,0.25))', margin: '0 4px' }} />
          {record.status === 'ACTIVE' ? (
            can('item.deactivate') && (
              <Popconfirm
                title={`Deactivate '${record.itemCode}'?`}
                description="Inactive items are hidden from most transaction screens."
                onConfirm={() => handleStatusChange(record, 'deactivate')}
              >
                <Tooltip title="Deactivate">
                  <Button type="text" size="small" icon={<PauseCircleOutlined />} className="erp-action-btn erp-action-btn--deactivate" aria-label={`Deactivate ${record.itemCode}`} />
                </Tooltip>
              </Popconfirm>
            )
          ) : (
            can('item.activate') && (
              <Popconfirm title={`Activate '${record.itemCode}'?`} onConfirm={() => handleStatusChange(record, 'activate')}>
                <Tooltip title="Activate">
                  <Button type="text" size="small" icon={<PlayCircleOutlined />} className="erp-action-btn erp-action-btn--activate" aria-label={`Activate ${record.itemCode}`} />
                </Tooltip>
              </Popconfirm>
            )
          )}
          {can('item.delete') && (
            <Popconfirm
              title={`Delete '${record.itemCode}'?`}
              description="Permanent. Blocked automatically if referenced by BOM, production, stock, routing or targets."
              okButtonProps={{ danger: true }}
              onConfirm={() => handleDelete(record)}
            >
              <Tooltip title="Delete">
                <Button
                  type="text"
                  size="small"
                  icon={<DeleteOutlined />}
                  aria-label={`Delete ${record.itemCode}`}
                  className="erp-action-btn erp-action-btn--delete"
                />
              </Tooltip>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  const detailDesc = (itemsSpec: Array<{ label: string; children: React.ReactNode }>) => (
    <Descriptions size="small" column={2} styles={{ label: { width: 150 } }}>
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
    showTotal: (t, range) => `Showing ${range[0]}–${range[1]} of ${t} entries`,
    onChange: (p, ps) => {
      setPage(ps !== pageSize ? 1 : p);
      setPageSize(ps);
    },
  };

  // TASK #34B / #34C: The current Item IS the output product. The INPUT MATERIAL
  // selector is rendered by <InputMaterialSelect/> — it loads the REAL Item Master
  // dataset server-side (search + pagination + optional Source/Store Department
  // filter), instead of the paginated page subset previously held in `items`.

  const outputProductDisplay = useMemo(() => {
    if (editing) {
      return `${editing.itemCode}${editing.name && editing.name !== editing.itemCode ? ` — ${editing.name}` : ''}`;
    }
    const code = (watchedCode as string | undefined)?.trim() ?? '';
    const name = (watchedName as string | undefined)?.trim() ?? '';
    return [code, name].filter(Boolean).join(' — ') || '(new item)';
  }, [editing, watchedCode, watchedName]);

  return (
    <div style={{ padding: '4px 6px', width: '100%' }}>
      <PageHeader
        icon={<AppstoreOutlined />}
        title="Products & Items"
        subtitle="Manage your item master data — raw materials, finished goods, and production items"
        showBreadcrumbs
        style={{ marginBottom: 8 }}
        extra={
          <>
            <Tooltip title="Refresh">
              <Button size="middle" icon={<ReloadOutlined />} onClick={() => fetchItems()} />
            </Tooltip>
            {can('item.view') && (
              <Button size="middle" icon={<ScanOutlined />} onClick={() => setScannerOpen(true)}>
                Scan Barcode
              </Button>
            )}
            {can('item.view') && (
              <Dropdown
                menu={{
                  items: [{ key: 'csv', icon: <DownloadOutlined />, label: 'Excel-compatible CSV' }],
                  onClick: handleExport,
                }}
              >
                <Button size="middle" icon={<DownloadOutlined />} loading={exporting}>Export</Button>
              </Dropdown>
            )}
            {can('item.view') && (
              <Button size="middle" icon={<FilePdfOutlined />} loading={pdfing} onClick={handlePdf}>PDF</Button>
            )}
            {can('item.view') && (
              <Button size="middle" icon={<PrinterOutlined />} loading={printing} onClick={handlePrint}>Print</Button>
            )}
            {can('item.create') && (
              <Button size="middle" icon={<ImportOutlined />} onClick={() => { setImportOpen(true); setImportRows([]); setImportSummary(null); setImportFileName(null); }}>
                Import
              </Button>
            )}
            {can('item.create') && (
              <Button size="middle" type="primary" icon={<PlusOutlined />} onClick={openCreate}>Add Item</Button>
            )}
          </>
        }
      />

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: screens.lg ? 'repeat(5, 1fr)' : screens.sm ? 'repeat(3, 1fr)' : 'repeat(2, 1fr)',
          gap: 8,
          marginBottom: 10,
        }}
      >
        <Card size="small" styles={{ body: { padding: '8px 12px' } }} style={{ borderRadius: 8, borderLeft: '3px solid var(--theme-accent, var(--theme-primary))' }}>
          <Text style={{ fontSize: 10, color: 'var(--theme-text-muted)' }}>Total Items</Text>
          <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--theme-accent, var(--theme-primary))', lineHeight: 1.2, marginTop: 1 }}>{stats.total ?? total}</div>
        </Card>
        <Card size="small" styles={{ body: { padding: '8px 12px' } }} style={{ borderRadius: 8, borderLeft: '3px solid var(--theme-success)' }}>
          <Text style={{ fontSize: 10, color: 'var(--theme-text-muted)' }}>Active</Text>
          <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--theme-success)', lineHeight: 1.2, marginTop: 1 }}>
            {stats.active ?? items.filter((i) => i.status === 'ACTIVE').length}
          </div>
        </Card>
        <Card size="small" styles={{ body: { padding: '8px 12px' } }} style={{ borderRadius: 8, borderLeft: '3px solid var(--theme-danger)' }}>
          <Text style={{ fontSize: 10, color: 'var(--theme-text-muted)' }}>Inactive</Text>
          <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--theme-danger)', lineHeight: 1.2, marginTop: 1 }}>
            {stats.inactive ?? items.filter((i) => i.status === 'INACTIVE').length}
          </div>
        </Card>
        <Card size="small" styles={{ body: { padding: '8px 12px' } }} style={{ borderRadius: 8, borderLeft: '3px solid var(--theme-accent)' }}>
          <Text style={{ fontSize: 10, color: 'var(--theme-text-muted)' }}>Stock Items</Text>
          <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--theme-accent)', lineHeight: 1.2, marginTop: 1 }}>
            {stats.stock ?? items.filter((i) => i.isStockItem).length}
          </div>
        </Card>
        <Card size="small" styles={{ body: { padding: '8px 12px' } }} style={{ borderRadius: 8, borderLeft: '3px solid var(--theme-warning)' }}>
          <Text style={{ fontSize: 10, color: 'var(--theme-text-muted)' }}>Manufactured</Text>
          <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--theme-warning)', lineHeight: 1.2, marginTop: 1 }}>
            {stats.manufactured ?? items.filter((i) => i.isManufacturable).length}
          </div>
        </Card>
      </div>

      <Card style={{ marginBottom: 12, borderRadius: 8 }} styles={{ body: { padding: 0 } }}>
        <div style={{ padding: '0 12px' }}>
          <div
            style={{
              display: 'grid',
              gap: 8,
              gridTemplateColumns: screens.xl ? 'repeat(6, 1fr)' : screens.lg ? 'repeat(4, 1fr)' : screens.md ? 'repeat(3, 1fr)' : 'repeat(2, 1fr)',
              padding: '10px 0 6px',
            }}
          >
            <ItemTypeCard
              testId="item-type-card-all"
              label="All Items"
              icon={AppstoreOutlined}
              watermarkIcon={AppstoreOutlined}
              count={total}
              active={activeTab === 'all'}
              onClick={() => handleTabChange('all')}
            />
            {ITEM_TYPES.map((t) => (
              <ItemTypeCard
                key={t.value}
                testId={`item-type-card-${t.value}`}
                label={t.label}
                icon={ITEM_TYPE_ICONS[t.value] ?? AppstoreOutlined}
                watermarkIcon={ITEM_TYPE_WATERMARK_ICONS[t.value] ?? AppstoreOutlined}
                count={typeCounts[t.value]}
                active={activeTab === t.value}
                onClick={() => handleTabChange(t.value)}
              />
            ))}
          </div>
        </div>
        <div
          style={{
            display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center',
            padding: '6px 10px', borderTop: '1px solid var(--theme-border)',
          }}
        >
          <Input
            allowClear
            prefix={<SearchOutlined style={{ color: 'var(--theme-text-muted)' }} />}
            placeholder="Search by code, name, SKU, barcode, wire size..."
            style={{ width: screens.md ? 300 : '100%' }}
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
          {screens.md && (
            <div style={{ flex: 1 }} />
          )}
          {(activeFilterCount > 0 || searchInput) && (
            <Button type="text" icon={<ClearOutlined />} onClick={resetFilters}>
              Clear
            </Button>
          )}
          <Badge count={activeFilterCount} size="small">
            <Button icon={<FilterOutlined />} onClick={() => setShowFilters((v) => !v)}>
              Filters
            </Button>
          </Badge>
          {screens.lg && (
            <Text type="secondary" style={{ fontSize: 12 }}>
              {total} items · Sorted by {sortField}
            </Text>
          )}
        </div>
        {showFilters && (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: screens.md ? 'repeat(auto-fit, minmax(160px, 1fr))' : '1fr',
              gap: 8, padding: '8px 10px 10px', borderTop: '1px solid var(--theme-border)',
              background: 'var(--theme-surface-alt)',
            }}
          >
            <Select
              allowClear showSearch optionFilterProp="label" placeholder="Division"
              value={fDivision}
              options={toUnique(divisions, (d) => d.name)}
              onChange={(v) => { setFDivision(v); setFSection(undefined); setFDepartment(undefined); setPage(1); }}
            />
            <Select
              allowClear showSearch optionFilterProp="label" placeholder="Section"
              value={fSection} disabled={!fDivision}
              options={toUnique(sectionsForDivision(fDivision), (s) => s.name)}
              onChange={(v) => { setFSection(v); setFDepartment(undefined); setPage(1); }}
            />
            <Select
              allowClear showSearch optionFilterProp="label" placeholder="Department"
              value={fDepartment}
              options={toUnique(departmentsForSection(fDivision, fSection), (d) => d.name)}
              onChange={(v) => { setFDepartment(v); setPage(1); }}
            />
            <Select
              allowClear showSearch optionFilterProp="label" placeholder="Item Category"
              value={fCategory}
              options={toUnique(flatCategories, (c) => c.name)}
              onChange={(v) => { setFCategory(v); setPage(1); }}
            />
            <Select
              allowClear showSearch optionFilterProp="label" placeholder="Route Type"
              value={fRouteType}
              loading={routeTypesState === 'loading'}
              options={toUnique(routeTypes, (rt) => rt.name?.trim() ? rt.name : rt.routeCode)}
              onChange={(v) => { setFRouteType(v); setPage(1); }}
            />
            <Select
              allowClear placeholder="Status" options={STATUS_OPTIONS.map((status) => ({ value: status, label: status }))}
              value={fStatus}
              onChange={(v) => { setFStatus(v); setPage(1); }}
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

      <ERPTable
        rowKey="id"
        columns={columns}
        dataSource={items}
        loading={loading}
        scroll={{ x: 1490 }}
        sticky
        size="small"
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
              actionLabel={can('item.create') ? 'Add Item' : undefined}
              onAction={openCreate}
            />
          ),
        }}
      />

      <DraggableResizableModal
        open={detailOpen}
        onCancel={() => setDetailOpen(false)}
        width={980}
        height={620}
        destroyOnHidden
        title={
          detailItem ? (
            <Space wrap size={8} align="center">
              <DatabaseOutlined style={{ fontSize: 22, color: 'var(--theme-accent, #10b981)' }} />
              <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.2 }}>
                <span style={{ fontWeight: 700, fontSize: 16, fontFamily: 'monospace' }}>{detailItem.itemCode}</span>
                <span style={{ fontSize: 12, color: 'var(--theme-text-muted)' }}>{detailItem.name}</span>
              </div>
              <StatusBadge status={detailItem.status} colorMap={statusColorMap} />
              <Tag style={{ marginInlineEnd: 0 }}>{ITEM_TYPES.find((t) => t.value === detailItem.itemType)?.label || detailItem.itemType}</Tag>
            </Space>
          ) : (
            'Item Details'
          )
        }
        extra={
          detailItem && (
            <Space wrap size={8}>
              {can('item.view') && (
                <Button icon={<HistoryOutlined />} onClick={() => { setDetailTab('history'); loadHistoryData(detailItem); }}>
                  History
                </Button>
              )}
              <Button icon={<PrinterOutlined />} onClick={() => { setPrintItem(detailItem); setPrintOpen(true); }}>
                Print Barcode
              </Button>
              <Button icon={<EditOutlined />} onClick={() => { setDetailOpen(false); openEdit(detailItem); }}>
                Edit
              </Button>
            </Space>
          )
        }
        footer={
          <Space>
            <Button onClick={() => setDetailOpen(false)}>Close</Button>
          </Space>
        }
      >
        {detailLoading || !detailItem ? (
          <LoadingState tip="Loading item details…" />
        ) : (
          <Tabs
            activeKey={detailTab}
            onChange={handleDetailTabChange}
            items={[
              {
                key: 'overview',
                label: <Space><EyeOutlined />Overview</Space>,
                children: (
                  <>
                    <Card size="small" title="Basic Information" style={{ borderRadius: 8 }}>
                      {detailDesc([
                        { label: 'Item Code', children: <Text strong>{detailItem.itemCode}</Text> },
                        { label: 'Item Name', children: txt(detailItem.name) },
                        { label: 'SKU', children: txt(detailItem.sku) },
                        { label: 'Short Name', children: txt(detailItem.shortName) },
                        { label: 'Item Type', children: txt(ITEM_TYPES.find((t) => t.value === detailItem.itemType)?.label || detailItem.itemType) },
                        { label: 'Category', children: txt(categoryName(detailItem)) },
                        {
                          label: 'Status',
                          children: <StatusBadge status={detailItem.status} colorMap={statusColorMap} />,
                        },
                        { label: 'Barcode', children: txt(detailItem.barcode || registryBarcodes[0]?.barcodeValue) },
                        ...(detailItem.description ? [{ label: 'Description', children: <Text style={{ fontSize: 13 }}>{detailItem.description}</Text> }] : []),
                      ])}
                    </Card>

                    <Card size="small" title="Identification & Tracking" style={{ borderRadius: 8, marginTop: 12 }}>
                      {detailDesc([
                        { label: 'Manufacturer', children: txt(detailItem.manufacturerPartNumber) },
                        { label: 'Brand', children: txt(detailItem.brand) },
                        { label: 'Model', children: txt(detailItem.model) },
                      ])}
                    </Card>

                    <Card size="small" title="Audit" style={{ borderRadius: 8, marginTop: 12 }}>
                      {detailDesc([
                        { label: 'Created At', children: txt(detailItem.createdAt ? new Date(detailItem.createdAt).toLocaleString() : null) },
                        { label: 'Updated At', children: txt(detailItem.updatedAt ? new Date(detailItem.updatedAt).toLocaleString() : null) },
                        { label: 'Remarks', children: txt(detailItem.notes) },
                      ])}
                    </Card>
                  </>
                ),
              },
              {
                key: 'organization',
                label: <Space><ApartmentOutlined />Organization</Space>,
                children: (
                  <Card size="small" title="Organization Hierarchy" style={{ borderRadius: 8 }}>
                    {detailDesc([
                      { label: 'Company', children: txt(companyName(detailItem)) },
                      { label: 'Division', children: txt(divisionName(detailItem)) },
                      { label: 'Section', children: txt(sectionName(detailItem)) },
                      { label: 'Department', children: txt(departmentName(detailItem)) },
                    ])}
                    <Alert
                      style={{ marginTop: 10 }}
                      type="info"
                      showIcon={false}
                      message={
                        <span style={{ fontSize: 12 }}>
                          Chain:{' '}
                          <Text code>{[
                            companyName(detailItem),
                            divisionName(detailItem),
                            sectionName(detailItem),
                            departmentName(detailItem),
                          ].filter(Boolean).join(' → ') || 'Not configured'}</Text>
                        </span>
                      }
                    />
                  </Card>
                ),
              },
              {
                key: 'specifications',
                label: <Space><ProjectOutlined />Specifications</Space>,
                children: (
                  <>
                    <Card size="small" title="Production Specifications" style={{ borderRadius: 8 }}>
                      {detailDesc([
                        { label: 'Wire Size (mm)', children: detailItem.wireSizeMm != null ? formatDimension(detailItem.wireSizeMm) : null },
                        { label: 'Diameter (mm)', children: detailItem.diameterMm != null ? formatDimension(detailItem.diameterMm) : null },
                        { label: 'Thickness (mm)', children: detailItem.thicknessMm != null ? formatDimension(detailItem.thicknessMm) : null },
                        { label: 'Width (mm)', children: detailItem.widthMm != null ? formatDimension(detailItem.widthMm) : null },
                        { label: 'Length', children: detailItem.lengthPerPiece != null ? `${formatDimension(detailItem.lengthPerPiece)} ${detailItem.baseUomName || ''}`.trim() : null },
                      ])}
                    </Card>

                    <Card size="small" title="Weight & UOM Conversion" style={{ borderRadius: 8, marginTop: 12 }}>
                      {detailDesc([
                        { label: 'Base UOM', children: txt(detailItem.baseUomName ?? detailItem.baseUom?.name ?? null) },
                        {
                          label: 'Purchase UOM',
                          children: (detailItem.purchaseUom?.name || detailItem.purchaseUomId)
                            ? txt(detailItem.purchaseUom?.name ?? uoms.find((u) => u.id === detailItem.purchaseUomId)?.name ?? null)
                            : null,
                        },
                        {
                          label: 'Sales UOM',
                          children: (detailItem.salesUom?.name || detailItem.salesUomId)
                            ? txt(detailItem.salesUom?.name ?? uoms.find((u) => u.id === detailItem.salesUomId)?.name ?? null)
                            : null,
                        },
                        { label: 'Weight / Piece', children: detailItem.weightPerPiece != null ? `${Number(detailItem.weightPerPiece)} kg` : null },
                        { label: 'Pieces / KG', children: detailItem.piecesPerKg != null ? String(Number(detailItem.piecesPerKg)) : null },
                        { label: 'Weight / Meter', children: detailItem.weightPerMeter != null ? `${Number(detailItem.weightPerMeter)} kg/m` : null },
                        { label: 'Length / Piece', children: detailItem.lengthPerPiece != null ? `${Number(detailItem.lengthPerPiece)} m` : null },
                        { label: 'Min Stock Level', children: detailItem.minimumStockLevel != null ? `${Number(detailItem.minimumStockLevel)} ${detailItem.baseUomName ?? ''}`.trim() : null },
                        { label: 'Max Stock Level', children: detailItem.maximumStockLevel != null ? `${Number(detailItem.maximumStockLevel)} ${detailItem.baseUomName ?? ''}`.trim() : null },
                        { label: 'Reorder Level', children: detailItem.reorderLevel != null ? `${Number(detailItem.reorderLevel)} ${detailItem.baseUomName ?? ''}`.trim() : null },
                        { label: 'Safety Stock Level', children: detailItem.safetyStockLevel != null ? `${Number(detailItem.safetyStockLevel)} ${detailItem.baseUomName ?? ''}`.trim() : null },
                        { label: 'Lead Time (Days)', children: detailItem.leadTimeDays != null ? String(Number(detailItem.leadTimeDays)) : null },
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
                          {detailItem.barcodes!.filter((b) => b.barcode).map((b) => (
                            <Tag key={b.id}>{b.barcode}</Tag>
                          ))}
                        </div>
                      )}
                    </Card>
                  </>
                ),
              },
              {
                key: 'inventory',
                label: <Space><DatabaseOutlined />Inventory & Control</Space>,
                children: (
                  <>
                    <Card size="small" title="Inventory & Control Flags" style={{ borderRadius: 8 }}>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                        {[
                          { label: 'Stock Item', value: detailItem.isStockItem },
                          { label: 'Purchasable', value: detailItem.isPurchasable },
                          { label: 'Sellable', value: detailItem.isSellable },
                          { label: 'Manufacturable', value: detailItem.isManufacturable },
                          { label: 'Track Inventory', value: detailItem.trackInventory },
                          { label: 'Batch Tracked', value: detailItem.batchTracked },
                          { label: 'Serial Tracked', value: detailItem.serialTracked },
                          { label: 'Expiry Tracked', value: detailItem.expiryTracked },
                        ].map((f) => (
                          <Tag
                            key={f.label}
                            color={f.value ? 'green' : 'default'}
                            style={{ fontSize: 12, padding: '2px 10px', borderRadius: 4 }}
                          >
                            {f.value ? '✓' : '✕'} {f.label}
                          </Tag>
                        ))}
                      </div>
                    </Card>

                    <Card size="small" title="Stock Levels" style={{ borderRadius: 8, marginTop: 12 }}>
                      {detailDesc([
                        { label: 'Min Stock Level', children: detailItem.minimumStockLevel != null ? `${Number(detailItem.minimumStockLevel)} ${detailItem.baseUomName ?? ''}`.trim() : null },
                        { label: 'Max Stock Level', children: detailItem.maximumStockLevel != null ? `${Number(detailItem.maximumStockLevel)} ${detailItem.baseUomName ?? ''}`.trim() : null },
                        { label: 'Reorder Level', children: detailItem.reorderLevel != null ? `${Number(detailItem.reorderLevel)} ${detailItem.baseUomName ?? ''}`.trim() : null },
                        { label: 'Safety Stock Level', children: detailItem.safetyStockLevel != null ? `${Number(detailItem.safetyStockLevel)} ${detailItem.baseUomName ?? ''}`.trim() : null },
                        { label: 'Lead Time (Days)', children: detailItem.leadTimeDays != null ? String(Number(detailItem.leadTimeDays)) : null },
                      ])}
                    </Card>
                  </>
                ),
              },
              {
                key: 'pricing',
                label: <Space><DollarOutlined />Pricing</Space>,
                children: (
                  <Card size="small" title="Item Pricing" style={{ borderRadius: 8 }}>
                    {detailDesc([
                      { label: 'Cost Price', children: detailItem.costPrice != null ? `${Number(detailItem.costPrice).toFixed(2)}` : null },
                      { label: 'Selling Price', children: detailItem.sellingPrice != null ? `${Number(detailItem.sellingPrice).toFixed(2)}` : null },
                    ])}
                    <Alert
                      style={{ marginTop: 10 }}
                      type="info"
                      showIcon
                      message="Prices are maintained on the Item Master (standard cost & default selling price). Transaction-level prices live on sales/procurement lines."
                    />
                  </Card>
                ),
              },
              {
                key: 'route',
                label: <Space><AppstoreOutlined />Production Route</Space>,
                children: (
                  <>
                    <Card size="small" title="Production Route / Process" style={{ borderRadius: 8 }}>
                      {detailDesc([
                        {
                          label: 'Route Type',
                          children: routeTypeLabel(detailItem) ? (
                            <Tag color={routeColorMap[detailItem.routeType ?? ''] ?? 'default'} style={{ marginInlineEnd: 0 }}>
                              {routeTypeLabel(detailItem)}
                            </Tag>
                          ) : null,
                        },
                        { label: 'Final Product', children: txt(detailItem.finalProduct) },
                        { label: 'Packing / Next Step', children: txt(detailItem.packingNextStep) },
                        {
                          label: 'Input Material',
                          children: detailItem.productionInItem
                            ? (() => {
                                const pi = detailItem.productionInItem;
                                const typeLabel = (pi.itemType && ITEM_TYPES.find((t) => t.value === pi.itemType)?.label) || pi.itemType || null;
                                const deptName = departments.find((d) => d.id === pi.departmentId)?.name ?? null;
                                const wire = pi.wireSizeMm != null ? `${formatDimension(pi.wireSizeMm)} mm` : null;
                                return `${pi.itemCode} — ${pi.name}${typeLabel ? ` · ${typeLabel}` : ''}${deptName ? ` · ${deptName}` : ''}${wire ? ` · ${wire}` : ''}`.trim();
                              })()
                            : null,
                        },
                        {
                          label: 'Output Product',
                          children: detailItem.productionOutItem
                            ? `${detailItem.productionOutItem.itemCode} — ${detailItem.productionOutItem.name}`
                            : detailItem.productionInItem
                              ? `${detailItem.itemCode} — ${detailItem.name} (self)` : null,
                        },
                      ])}

                      {/* Repeatable Process Sequence Display */}
                      {(() => {
                        const drawerProcs = (detailItem.processes && detailItem.processes.length > 0)
                          ? detailItem.processes
                          : [
                              detailItem.process1 ? { sequence: 1, name: detailItem.process1 } : null,
                              detailItem.process2 ? { sequence: 2, name: detailItem.process2 } : null,
                              detailItem.process3 ? { sequence: 3, name: detailItem.process3 } : null,
                              detailItem.process4 ? { sequence: 4, name: detailItem.process4 } : null,
                              detailItem.process5 ? { sequence: 5, name: detailItem.process5 } : null,
                              detailItem.process6 ? { sequence: 6, name: detailItem.process6 } : null,
                            ].filter(Boolean) as { sequence: number; name: string }[];

                        if (drawerProcs.length === 0) return null;

                        return (
                          <div style={{ marginTop: 10, marginBottom: 12 }}>
                            <Text strong style={{ fontSize: 11, textTransform: 'uppercase', color: 'var(--theme-text-muted)', display: 'block', marginBottom: 6 }}>
                              Configured Operations Sequence ({drawerProcs.length})
                            </Text>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                              {drawerProcs.map((proc, idx) => (
                                <div
                                  key={idx}
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 8,
                                    padding: '4px 8px',
                                    borderRadius: 4,
                                    background: 'var(--theme-surface-alt, rgba(255,255,255,0.03))',
                                    border: '1px solid var(--theme-border, rgba(255,255,255,0.08))',
                                  }}
                                >
                                  <span
                                    style={{
                                      fontFamily: 'monospace',
                                      fontSize: 11,
                                      fontWeight: 700,
                                      color: 'var(--theme-accent, #0284c7)',
                                      background: 'rgba(2, 132, 199, 0.1)',
                                      padding: '2px 6px',
                                      borderRadius: 3,
                                      border: '1px solid rgba(2, 132, 199, 0.25)',
                                      minWidth: 28,
                                      textAlign: 'center',
                                    }}
                                  >
                                    {String(proc.sequence ?? (idx + 1)).padStart(2, '0')}
                                  </span>
                                  <span style={{ fontSize: 12, fontWeight: 500 }}>{proc.name}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })()}

                      {/* Visual Production Flow Pipeline */}
                      <ProductionFlowCard itemId={detailItem.id} style={{ marginTop: 12 }} />
                    </Card>

                    <Card size="small" title="Barcode Identification" style={{ borderRadius: 8, marginTop: 12 }}>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 8 }}>
                        <div>
                          <Text type="secondary" style={{ fontSize: 11 }}>Item Code</Text>
                          <div style={{ fontWeight: 600, fontFamily: 'monospace' }}>{detailItem.itemCode}</div>
                        </div>
                        <div>
                          <Text type="secondary" style={{ fontSize: 11 }}>SKU</Text>
                          <div style={{ fontWeight: 600, fontFamily: 'monospace' }}>{detailItem.sku || '—'}</div>
                        </div>
                        <div>
                          <Text type="secondary" style={{ fontSize: 11 }}>Barcode</Text>
                          {(detailItem.barcode || registryBarcodes[0]?.barcodeValue) ? (
                            <div style={{ marginTop: 4, overflow: 'visible' }}>
                              <svg ref={detailBarcodeCallbackRef} style={{ maxWidth: '100%', overflow: 'visible' }} />
                            </div>
                          ) : (
                            <div style={{ fontWeight: 600, fontFamily: 'monospace', fontSize: 14, letterSpacing: 1 }}>—</div>
                          )}
                        </div>
                      </div>
                      {registryBarcodes.length > 0 && (
                        <div style={{ marginTop: 8 }}>
                          <Text type="secondary" style={{ fontSize: 11 }}>Registry Barcodes ({registryBarcodes.length})</Text>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
                            {registryBarcodes.map((b: any) => (
                              <Tag key={b.id} color={b.isPrimary ? 'green' : 'default'} style={{ fontFamily: 'monospace', fontSize: 11 }}>
                                {b.barcodeValue}{b.isPrimary ? ' (Primary)' : ''}
                              </Tag>
                            ))}
                          </div>
                        </div>
                      )}
                      <div style={{ marginTop: 8 }}>
                        <Button
                          size="small"
                          icon={<PrinterOutlined />}
                          onClick={() => { setPrintItem(detailItem); setPrintOpen(true); }}
                        >
                          Print Barcode Label
                        </Button>
                      </div>
                    </Card>
                  </>
                ),
              },
              {
                key: 'history',
                label: <Space><HistoryOutlined />History</Space>,
                children: historyLoading ? (
                  <LoadingState tip="Loading item history..." />
                ) : (
                  <Tabs
                    activeKey={historyTab}
                    onChange={setHistoryTab}
                    items={[
                      {
                        key: 'inventory',
                        label: <Space><DatabaseOutlined />Inventory by Warehouse</Space>,
                        children: (
                          <>
                            {historyErrors.inventory && <Alert type="warning" message={historyErrors.inventory} showIcon style={{ marginBottom: 8 }} />}
                            <Table
                              rowKey="id"
                              size="small"
                              dataSource={inventoryBalances}
                              pagination={false}
                              columns={[
                                { title: 'Warehouse', key: 'warehouse', render: (_: any, r: any) => r.warehouse?.name || r.warehouseId },
                                { title: 'UOM', key: 'uom', render: (_: any, r: any) => r.uom?.code || r.uomId },
                                { title: 'On Hand', dataIndex: 'onHand', align: 'right' as const, render: (v: number) => Number(v).toLocaleString() },
                                { title: 'Reserved', dataIndex: 'reserved', align: 'right' as const, render: (v: number) => Number(v).toLocaleString() },
                                { title: 'Available', dataIndex: 'available', align: 'right' as const, render: (v: number) => <Text strong style={{ color: Number(v) > 0 ? 'var(--theme-success)' : 'var(--theme-danger)' }}>{Number(v).toLocaleString()}</Text> },
                              ]}
                              locale={{ emptyText: 'No inventory balances found' }}
                            />
                          </>
                        ),
                      },
                      {
                        key: 'stock-ledger',
                        label: <Space><ProjectOutlined />Stock Ledger</Space>,
                        children: (
                          <>
                            {historyErrors.stockLedger && <Alert type="warning" message={historyErrors.stockLedger} showIcon style={{ marginBottom: 8 }} />}
                            <Table
                              rowKey="id"
                              size="small"
                              dataSource={stockLedger}
                              pagination={{ pageSize: 10, total: stockLedgerTotal, showSizeChanger: false }}
                              columns={[
                                { title: 'Date', dataIndex: 'transactionDate', width: 150, render: (v: string) => v ? new Date(v).toLocaleDateString() : '—' },
                                { title: 'Warehouse', key: 'warehouse', render: (_: any, r: any) => r.warehouse?.name || '—' },
                                { title: 'Location', key: 'location', render: (_: any, r: any) => r.location?.name || '—' },
                                { title: 'Type', dataIndex: 'transactionType', width: 140, render: (v: string) => <Tag>{v}</Tag> },
                                { title: 'Direction', dataIndex: 'direction', width: 80, render: (v: string) => <Tag color={v === 'IN' ? 'green' : 'red'}>{v}</Tag> },
                                { title: 'Qty', dataIndex: 'quantity', align: 'right' as const, render: (v: number) => Number(v).toLocaleString() },
                                { title: 'UOM', key: 'uom', render: (_: any, r: any) => r.uom?.code || '—' },
                                { title: 'Ref Type', dataIndex: 'referenceType', width: 110, render: (v: string) => v ? <Tag style={{ fontSize: 10 }}>{v}</Tag> : '—' },
                                { title: 'Reference', dataIndex: 'referenceNumber', render: (v: string) => v || '—' },
                              ]}
                              locale={{ emptyText: 'No stock ledger entries found' }}
                            />
                          </>
                        ),
                      },
                      {
                        key: 'production',
                        label: <Space><AppstoreOutlined />Production History</Space>,
                        children: (
                          <>
                            {historyErrors.production && <Alert type="warning" message={historyErrors.production} showIcon style={{ marginBottom: 8 }} />}
                            <Table
                              rowKey="id"
                              size="small"
                              dataSource={productionHistory}
                              pagination={{ pageSize: 10, total: productionHistoryTotal, showSizeChanger: false }}
                              columns={[
                                {
                                  title: 'Role',
                                  dataIndex: 'role',
                                  width: 90,
                                  render: (v: string) => (
                                    <Tag color={v === 'OUTPUT' ? 'blue' : v === 'INPUT' ? 'orange' : 'default'}>{v || '—'}</Tag>
                                  ),
                                },
                                {
                                  title: 'Description',
                                  dataIndex: 'roleDescription',
                                  width: 120,
                                },
                                {
                                  title: 'Date',
                                  dataIndex: 'entryDate',
                                  width: 110,
                                  render: (v: string) => v ? new Date(v).toLocaleDateString() : '—',
                                },
                                { title: 'Department', key: 'department', render: (_: any, r: any) => r.department?.name || '—' },
                                { title: 'Machine', dataIndex: 'machineNo', width: 100, render: (v: string) => v || '—' },
                                { title: 'Warehouse', key: 'warehouse', width: 120, render: (_: any, r: any) => r.warehouse?.name || '—' },
                                { title: 'Target', dataIndex: 'targetQuantity', align: 'right' as const, render: (v: number) => v != null ? Number(v).toLocaleString() : '—' },
                                { title: 'Actual', dataIndex: 'actualQuantity', align: 'right' as const, render: (v: number) => v != null ? Number(v).toLocaleString() : '—' },
                                { title: 'Scrap', dataIndex: 'scrapQuantity', align: 'right' as const, render: (v: number) => v != null && Number(v) > 0 ? Number(v).toLocaleString() : '—' },
                                { title: 'UOM', key: 'uom', render: (_: any, r: any) => r.uom?.code || '—' },
                                { title: 'Source', dataIndex: 'source', width: 100, render: (v: string) => <Tag style={{ fontSize: 10 }}>{v === 'PRODUCTION_ENTRY' ? 'PE' : 'SL'}</Tag> },
                              ]}
                              locale={{ emptyText: 'No production history found' }}
                            />
                          </>
                        ),
                      },
                    ]}
                  />
                ),
              },
            ]}
          />
        )}
      </DraggableResizableModal>

      <DraggableResizableModal
        open={formOpen}
        onCancel={() => setFormOpen(false)}
        onOk={handleSubmit}
        confirmLoading={saving}
        width={900}
        height={620}
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
                  options={toUnique(divisions, (d) => d.name)}
                  onChange={() => form.setFieldsValue({ sectionId: undefined, departmentId: undefined })}
                />
              </Form.Item>
              <Form.Item noStyle shouldUpdate={(p, c) => p.divisionId !== c.divisionId}>
                {({ getFieldValue }) => (
                  <Form.Item name="sectionId" label="Section">
                    <Select
                      allowClear showSearch optionFilterProp="label" placeholder="Select section"
                      disabled={!getFieldValue('divisionId')}
                      options={toUnique(sectionsForDivision(getFieldValue('divisionId')), (s) => s.name)}
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
                      options={toUnique(departmentsForSection(getFieldValue('divisionId'), getFieldValue('sectionId')), (d) => d.name)}
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
                <Select options={ITEM_TYPES} placeholder="Select item type" />
              </Form.Item>
              <Form.Item name="categoryId" label="Item Category">
                <Select
                  allowClear showSearch optionFilterProp="label"
                  options={toUnique(flatCategories, (c) => c.name)}
                  placeholder="Select category"
                />
              </Form.Item>
              <Form.Item name="routeTypeId" label="Route Type">
                <Select
                  allowClear showSearch optionFilterProp="label"
                  loading={routeTypesState === 'loading'}
                  status={routeTypesState === 'error' ? 'error' : undefined}
                  notFoundContent={routeTypesState === 'error' ? 'Route types could not be loaded' : 'No active route types'}
                  options={toUnique(routeTypes, (rt) => rt.name?.trim() ? rt.name : rt.routeCode)}
                  placeholder="Select route type"
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
                  options={toUnique(uoms, (u) => `${u.name} (${u.code})`)}
                />
              </Form.Item>
              <Form.Item name="purchaseUomId" label="Purchase UOM">
                <Select
                  allowClear showSearch optionFilterProp="label" placeholder="Optional"
                  options={toUnique(uoms, (u) => `${u.name} (${u.code})`)}
                />
              </Form.Item>
              <Form.Item name="salesUomId" label="Sales UOM">
                <Select
                  allowClear showSearch optionFilterProp="label" placeholder="Optional"
                  options={toUnique(uoms, (u) => `${u.name} (${u.code})`)}
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
            </div>
            <div style={{ marginTop: 4, fontSize: 11, color: '#64748b' }}>
              💡 Length is managed under <strong>Production Specifications</strong> below.
            </div>
          </Card>

          {/* SECTION 5 — PRODUCTION */}
          <Card
            size="small"
            title={
              <Space>
                <AppstoreOutlined style={{ color: '#10b981' }} />
                <span style={{ fontWeight: 600 }}>Production</span>
              </Space>
            }
            style={{ marginBottom: 12, borderRadius: 8 }}
          >
            {/* 5A: PRODUCTION SPECIFICATIONS */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, flexWrap: 'wrap', gap: 6 }}>
                <Text strong style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--theme-accent, #0284c7)' }}>
                  Production Specifications
                </Text>
                {(() => {
                  const div = divisions.find((d) => d.id === (watchedDivisionId || editing?.divisionId));
                  const divName = (div?.name || '').toLowerCase();
                  if (divName.includes('spoke')) {
                    return <Tag color="blue">Spoke Division: Primary specs are Diameter (mm) and Length</Tag>;
                  }
                  if (divName.includes('wire') || divName.includes('flatten')) {
                    return <Tag color="green">Wire Division: Primary specs are Wire Size (mm), Thickness, Width</Tag>;
                  }
                  if (divName.includes('pvc')) {
                    return <Tag color="cyan">PVC Division: Primary specs are Diameter (mm) and Length</Tag>;
                  }
                  return null;
                })()}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0 12px' }}>
                <Form.Item name="wireSizeMm" label="Wire Size (mm)" extra="Raw wire dimension">
                  <InputNumber min={0} step={0.001} style={{ width: '100%' }} placeholder="Optional (e.g. 1.20)" />
                </Form.Item>
                <Form.Item name="diameterMm" label="Diameter (mm)" extra="Authoritative diameter (Spoke/PVC/Wire)">
                  <InputNumber min={0} step={0.001} style={{ width: '100%' }} placeholder="e.g. 3.14" />
                </Form.Item>
                <Form.Item name="thicknessMm" label="Thickness (mm)" extra="Flattened / semi-finished wire">
                  <InputNumber min={0} step={0.001} style={{ width: '100%' }} placeholder="e.g. 0.90" />
                </Form.Item>
                <Form.Item name="widthMm" label="Width (mm)" extra="Flattened / semi-finished wire">
                  <InputNumber min={0} step={0.001} style={{ width: '100%' }} placeholder="e.g. 3.20" />
                </Form.Item>
                <Form.Item name="lengthPerPiece" label="Length" extra="Authoritative piece length">
                  <InputNumber min={0} step={0.01} style={{ width: '100%' }} placeholder="e.g. 250" />
                </Form.Item>
              </div>
            </div>

            <div style={{ height: 1, background: 'var(--theme-border, rgba(255, 255, 255, 0.08))', margin: '12px 0' }} />

            {/* 5B: PRODUCTION ROUTE / PROCESS */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, flexWrap: 'wrap', gap: 6 }}>
                <Text strong style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--theme-accent, #0284c7)' }}>
                  Production Route / Process
                </Text>
                <Text type="secondary" style={{ fontSize: 11 }}>
                  Sequential manufacturing operations (supports 6+ repeatable steps)
                </Text>
              </div>

              <Form.List name="processes">
                {(fields, { add, remove, move }) => (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {fields.map((field, index) => {
                      const seqNumber = String(index + 1).padStart(2, '0');
                      return (
                        <div
                          key={field.key}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                            padding: '6px 10px',
                            borderRadius: 6,
                            border: '1px solid var(--theme-border, rgba(255, 255, 255, 0.12))',
                            background: 'var(--theme-surface-alt, rgba(255, 255, 255, 0.02))',
                          }}
                        >
                          <span
                            style={{
                              fontFamily: 'monospace',
                              fontSize: 12,
                              fontWeight: 700,
                              color: 'var(--theme-accent, #0284c7)',
                              background: 'rgba(2, 132, 199, 0.12)',
                              padding: '2px 8px',
                              borderRadius: 4,
                              border: '1px solid rgba(2, 132, 199, 0.25)',
                              minWidth: 32,
                              textAlign: 'center',
                              flexShrink: 0,
                            }}
                          >
                            {seqNumber}
                          </span>

                          <Form.Item
                            {...field}
                            name={[field.name, 'sequence']}
                            initialValue={index + 1}
                            style={{ display: 'none' }}
                          >
                            <Input type="hidden" />
                          </Form.Item>

                          <Form.Item
                            {...field}
                            name={[field.name, 'name']}
                            rules={[{ required: true, message: 'Operation name is required' }]}
                            style={{ flex: 1, marginBottom: 0 }}
                          >
                            <Input
                              placeholder={`e.g. ${
                                index === 0 ? 'Straightener / Drawing / Flattening' :
                                index === 1 ? 'Swagging / Spiral Winding' :
                                index === 2 ? 'Spoke / PVC Extrusion' :
                                index === 3 ? 'Spoke Plating / Cable Packing' :
                                index === 4 ? 'Spoke Packing / Testing' :
                                index === 5 ? 'Final Inspection / Quality Signoff' : 'Next Operation'
                              }`}
                              maxLength={255}
                            />
                          </Form.Item>

                          <Tooltip title="Move Up">
                            <Button
                              type="text"
                              size="small"
                              icon={<ArrowUpOutlined />}
                              disabled={index === 0}
                              onClick={() => move(index, index - 1)}
                            />
                          </Tooltip>

                          <Tooltip title="Move Down">
                            <Button
                              type="text"
                              size="small"
                              icon={<ArrowDownOutlined />}
                              disabled={index === fields.length - 1}
                              onClick={() => move(index, index + 1)}
                            />
                          </Tooltip>

                          <Tooltip title="Remove Operation">
                            <Button
                              type="text"
                              danger
                              size="small"
                              icon={<DeleteOutlined />}
                              onClick={() => remove(field.name)}
                            />
                          </Tooltip>
                        </div>
                      );
                    })}

                    <Button
                      type="dashed"
                      onClick={() => add({ sequence: fields.length + 1, name: '' })}
                      icon={<PlusOutlined />}
                      style={{ width: '100%', marginTop: 4 }}
                    >
                      + Add Process
                    </Button>
                  </div>
                )}
              </Form.List>
            </div>

            <div style={{ height: 1, background: 'var(--theme-border, rgba(255, 255, 255, 0.08))', margin: '12px 0' }} />

            {/* 5C: OUTPUT / NEXT STEP */}
            <div>
              <Text strong style={{ display: 'block', fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--theme-accent, #0284c7)', marginBottom: 8 }}>
                Output / Next Step
              </Text>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0 12px' }}>
                <Form.Item name="finalProduct" label="Final Product" extra="Resulting product/output associated with this flow">
                  <Input maxLength={255} placeholder="e.g. 250 × 17 B or Finished Wire" />
                </Form.Item>
                <Form.Item name="packingNextStep" label="Packing / Next Step" extra="Next operation or destination stage">
                  <Input maxLength={255} placeholder="e.g. Straightener / Finished Store" />
                </Form.Item>
              </div>
            </div>
          </Card>

          {/* SECTION 5D — TASK #45: PRODUCTION FLOW
              The current Item IS the output of its own production stage. The user
              selects ONLY the INPUT MATERIAL; productionOutItemId is server-owned
              and auto-synced to this Item's ID. */}
          <Card
            size="small"
            title={
              <Space>
                <ApartmentOutlined style={{ color: '#1890ff' }} />
                <span>Production Flow</span>
              </Space>
            }
            style={{ marginBottom: 12, borderRadius: 8 }}
          >
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0 12px' }}>
              <Form.Item
                name="productionInItemId"
                label="INPUT MATERIAL"
                extra="The item consumed to produce this item — the current Item is ALWAYS the Output Product. Search the full Item Master by code, name, SKU or barcode, optionally narrowed to a Source / Store Department."
              >
                <InputMaterialSelect
                  excludeItemId={editing?.id ?? null}
                  departments={departments}
                  onSelectDetail={setSelectedInputDetail}
                />
              </Form.Item>
              <Form.Item label="OUTPUT PRODUCT" extra="Current Item is automatically the Production Output — this read-only value always equals the item being edited (auto-synchronized)">
                <Input readOnly value={outputProductDisplay} />
              </Form.Item>
            </div>

            {/* TASK #45: Live Flow Preview Card matching Authoritative Structure */}
            {(() => {
              const modalProcesses = (() => {
                if (Array.isArray(watchedProcesses) && watchedProcesses.length > 0) {
                  return watchedProcesses
                    .map((p: any) => (typeof p === 'string' ? p.trim() : (p?.name ? String(p.name).trim() : '')))
                    .filter(Boolean);
                }
                const editingProcs = (editing?.processes && editing.processes.length > 0)
                  ? editing.processes.map((p: any) => p.name).filter(Boolean)
                  : [];
                if (editingProcs.length > 0) return editingProcs;
                return [
                  watchedProcess1 ?? editing?.process1,
                  watchedProcess2 ?? editing?.process2,
                  watchedProcess3 ?? editing?.process3,
                  watchedProcess4 ?? editing?.process4,
                  watchedProcess5 ?? editing?.process5,
                  watchedProcess6 ?? editing?.process6,
                ].filter(Boolean) as string[];
              })();

              const hasProductionFlow = Boolean(
                selectedInputDetail ||
                modalProcesses.length > 0 ||
                watchedFinalProduct || editing?.finalProduct ||
                watchedDiameterMm != null || editing?.diameterMm != null ||
                watchedWireSizeMm != null || editing?.wireSizeMm != null
              );

              if (!hasProductionFlow) {
                return (
                  <div
                    style={{
                      marginTop: 6,
                      padding: '8px 12px',
                      borderRadius: 6,
                      border: '1px dashed #cbd5e1',
                      background: 'var(--ant-color-bg-container-disabled, #fcfcfc)',
                      fontSize: 11,
                      color: '#64748b',
                    }}
                  >
                    {(watchedItemType || editing?.itemType) === 'RAW_MATERIAL'
                      ? 'Root raw material — enter Diameter, Wire Size, Processes, or Final Product in Section 5 above to view the live production sequence.'
                      : 'Select an Input Material above, or enter Production Processes in Section 5 to configure the manufacturing route.'}
                  </div>
                );
              }

              const resolvedRouteName = (() => {
                const rId = watchedRouteTypeId || editing?.routeTypeId;
                if (rId) {
                  const rt = routeTypes.find((r) => r.id === rId);
                  if (rt) return rt.name?.trim() ? rt.name : rt.routeCode;
                }
                const rCode = watchedRouteType || editing?.routeType;
                if (rCode) {
                  const rt = routeTypes.find((r) => r.routeCode === rCode);
                  if (rt) return rt.name?.trim() ? rt.name : rt.routeCode;
                  return ROUTE_TYPES.find((x) => x.value === rCode)?.label || rCode;
                }
                return null;
              })();

              const operationName = (() => {
                const dept = departments.find((d) => d.id === (watchedDepartmentId || editing?.departmentId));
                if (dept?.name === 'PVC') return 'PVC Extrusion';
                if (dept?.name?.includes('Packing')) return 'Packing';
                return dept?.name || 'Manufacturing';
              })();

              const wireVal = watchedWireSizeMm ?? editing?.wireSizeMm;
              const diaVal = watchedDiameterMm ?? editing?.diameterMm;
              const thkVal = watchedThicknessMm ?? editing?.thicknessMm;
              const widVal = watchedWidthMm ?? editing?.widthMm;
              const lenVal = watchedLengthPerPiece ?? editing?.lengthPerPiece;
              const finalProdName = watchedFinalProduct || editing?.finalProduct;
              const nextStepName = watchedPackingNextStep || editing?.packingNextStep;

              // PROMPT-35: six-stage preview (01-06) mirroring the View card.
              // Reconstructed LIVE from the exact form + selected input values —
              // never invented; unknown stages render as "Not configured".
              type PreviewItem = {
                itemCode?: string | null; name?: string | null; itemType?: string | null;
                departmentId?: string | null; departmentName?: string | null;
                wireSizeMm?: number | null; diameterMm?: number | null;
                thicknessMm?: number | null; widthMm?: number | null;
                lengthPerPiece?: number | null; baseUomName?: string | null;
              };

              const currentPreviewCode = editing?.itemCode || watchedCode || null;
              const currentPreviewName = editing?.name || watchedName || null;
              const curDeptObject = departments.find((d) => d.id === (watchedDepartmentId || editing?.departmentId));
              const curDeptName = curDeptObject?.name || editing?.departmentName || null;
              const curOpName = operationName; // derived from department above

              const inputPreview = (selectedInputDetail ?? null) as PreviewItem | null;
              const inputDeptName =
                inputPreview?.departmentName ??
                (inputPreview?.departmentId ? departments.find((d) => d.id === inputPreview.departmentId)?.name ?? null : null) ??
                null;
              const inputOpName = (() => {
                const dn = (inputDeptName ?? '').toLowerCase();
                if (dn.includes('spiral')) return 'Spiral Winding';
                if (dn.includes('flatten') || dn.includes('flat')) return 'Wire Flattening';
                if (dn.includes('pvc')) return 'PVC Extrusion';
                if (dn.includes('pack')) return 'Packing';
                return inputDeptName || null;
              })();
              const isRawRoot =
                (watchedItemType || editing?.itemType) === 'RAW_MATERIAL' && !inputPreview && !editing?.productionInItemId;
              const rawPreview: PreviewItem | null = inputPreview
                ? { ...inputPreview }
                : isRawRoot
                  ? {
                      itemCode: currentPreviewCode,
                      name: currentPreviewName,
                      wireSizeMm: wireVal,
                      diameterMm: diaVal,
                      thicknessMm: thkVal,
                      widthMm: widVal,
                      lengthPerPiece: lenVal,
                      departmentName: curDeptName,
                      baseUomName: editing?.baseUomName ?? null,
                    }
                  : null;

              const inputIsFlatten =
                (inputDeptName ?? '').toLowerCase().includes('flatten') ||
                (inputDeptName ?? '').toLowerCase().includes('flat') ||
                (inputOpName ?? '').toLowerCase().includes('flatten');
              const currentIsFlatten =
                (curDeptName ?? '').toLowerCase().includes('flatten') ||
                (curDeptName ?? '').toLowerCase().includes('flat') ||
                (curOpName ?? '').toLowerCase().includes('flatten');
              const flattenPreview: PreviewItem | null = inputIsFlatten
                ? { ...(inputPreview ?? {}) }
                : currentIsFlatten
                  ? {
                      itemCode: currentPreviewCode,
                      name: currentPreviewName,
                      thicknessMm: thkVal,
                      widthMm: widVal,
                      departmentName: curDeptName,
                    }
                  : null;

              const currentIsSpiral =
                (curDeptName ?? '').toLowerCase().includes('spiral') ||
                (curOpName ?? '').toLowerCase().includes('spiral');
              const spiralPreview: PreviewItem | null = currentIsSpiral
                ? {
                    itemCode: currentPreviewCode,
                    name: currentPreviewName,
                    wireSizeMm: wireVal,
                    diameterMm: diaVal,
                    lengthPerPiece: lenVal,
                    departmentName: curDeptName,
                    baseUomName: editing?.baseUomName ?? null,
                  }
                : null;

              // TASK 12: when the current stage is NOT spiral-classified, the
              // explicit "Packing / Next Step" and "Final Product" fields drive
              // stages 05/06 instead of rendering "Not configured". Whitespace-only
              // values are treated as empty. Mirrors the backend buildSixStageFlow:
              // the explicit field value wins, otherwise the (spiral) stage item.
              const nextPreview = spiralPreview;
              const nextStepValid = !isEmptyValue(nextStepName) ? String(nextStepName).trim() : null;
              const finalProductValid = !isEmptyValue(finalProdName) ? String(finalProdName).trim() : null;
              // Operation label for a real next-stage (spiral) preview, derived from
              // its department name — never a hardcoded value. Mirrors the backend
              // deriveStageOperationName: department → performed operation.
              const nextPreviewOp = (() => {
                const dn = (nextPreview?.departmentName ?? '').toLowerCase();
                if (dn.includes('spiral')) return 'Spiral Winding';
                if (dn.includes('flatten') || dn.includes('flat')) return 'Wire Flattening';
                if (dn.includes('pvc')) return 'PVC Extrusion';
                if (dn.includes('pack')) return 'Packing';
                if (dn.includes('draw')) return 'Wire Drawing';
                return nextPreview?.departmentName || null;
              })();
              const nextOpLabel = nextStepValid ?? nextPreviewOp ?? '';
              const nextOutputLabel = finalProductValid;

              const mkStage = (
                sequence: number,
                stageKey: string,
                title: string,
                kind: 'process' | 'output',
                it: PreviewItem | null,
                op: { operationCode?: string | null; operationName?: string | null } | null,
                configuredOverride?: boolean,
              ): ProductionFlowStage => ({
                sequence,
                kind,
                stageKey,
                title,
                itemId: null,
                itemCode: it?.itemCode ?? null,
                itemName: it?.name ?? null,
                itemType: it?.itemType ?? null,
                wireSizeMm: it?.wireSizeMm ?? null,
                diameterMm: it?.diameterMm ?? null,
                thicknessMm: it?.thicknessMm ?? null,
                widthMm: it?.widthMm ?? null,
                lengthPerPiece: it?.lengthPerPiece ?? null,
                baseUomName: it?.baseUomName ?? null,
                departmentId: it?.departmentId ?? null,
                departmentName: it?.departmentName ?? null,
                operationCode: op?.operationCode ?? null,
                operationName: op?.operationName ?? null,
                isCurrent: false,
                configured: configuredOverride !== undefined ? configuredOverride : !!it,
              });

              const previewStages: ProductionFlowStage[] = [
                mkStage(1, 'RAW_MATERIAL', 'RAW MATERIAL', 'process', rawPreview, {
                  operationName: !isRawRoot ? inputOpName : null,
                }),
                mkStage(2, 'RAW_SPEC', 'RAW MATERIAL SPECIFICATION', 'output', rawPreview, null),
                mkStage(3, 'FLATTENING', 'FLATTENING', 'process', flattenPreview, {
                  operationName: flattenPreview ? 'Wire Flattening' : null,
                }),
                mkStage(4, 'FLATTENING_OUTPUT', 'FLATTENING OUTPUT', 'output', flattenPreview, null),
                // Stage 05 — NEXT PROCESS / NEXT STEP (driven by "Packing / Next Step")
                mkStage(
                  5,
                  'SPIRAL',
                  deriveNextStageTitle(nextOpLabel, 'process'),
                  'process',
                  nextPreview,
                  {
                    operationName: nextStepValid ?? nextPreviewOp,
                  },
                  !!(nextPreview || nextStepValid),
                ),
                // Stage 06 — NEXT OUTPUT / FINAL PRODUCT (driven by "Final Product")
                mkStage(
                  6,
                  'SPIRAL_OUTPUT',
                  deriveNextStageTitle(nextOpLabel, 'output'),
                  'output',
                  nextOutputLabel
                    ? { name: nextOutputLabel, itemType: null, baseUomName: null }
                    : nextPreview,
                  null,
                  !!(nextPreview || nextOutputLabel),
                ),
              ];

              return (
                <div
                  style={{
                    marginTop: 6,
                    border: '1px solid var(--theme-border, rgba(255, 255, 255, 0.12))',
                    borderRadius: 8,
                    padding: '10px 14px',
                    background: 'var(--theme-surface-alt, rgba(255, 255, 255, 0.04))',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: 8,
                      borderBottom: '1px solid var(--theme-border, rgba(255, 255, 255, 0.1))',
                      paddingBottom: 6,
                      flexWrap: 'wrap',
                      gap: 6,
                    }}
                  >
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        color: 'var(--theme-accent, #0284c7)',
                        letterSpacing: 0.5,
                      }}
                    >
                      Production Flow Preview
                    </span>
                    <Space size={6} wrap>
                      {resolvedRouteName && (
                        <Tag color="purple" style={{ margin: 0 }}>Route: {resolvedRouteName}</Tag>
                      )}
                      {diaVal != null && (
                        <Tag color="green" style={{ margin: 0 }}>Diameter: {formatDimension(diaVal)} mm</Tag>
                      )}
                      {wireVal != null && diaVal == null && (
                        <Tag color="gold" style={{ margin: 0 }}>Wire: {formatDimension(wireVal)} mm</Tag>
                      )}
                      {(thkVal != null || widVal != null) && (
                        <Tag color="blue" style={{ margin: 0 }}>
                          Flattened: {formatDimension(thkVal)} × {formatDimension(widVal)} mm
                        </Tag>
                      )}
                      {lenVal != null && (
                        <Tag color="cyan" style={{ margin: 0 }}>Length: {formatDimension(lenVal)}</Tag>
                      )}
                      <Tag color="geekblue" style={{ margin: 0 }}>Operation: {operationName}</Tag>
                    </Space>
                  </div>

                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      overflowX: 'auto',
                      padding: '6px 2px',
                      gap: 8,
                    }}
                  >
                    {/* Left: Input Node */}
                    <div
                      style={{
                        minWidth: 150,
                        maxWidth: 210,
                        flex: '0 0 auto',
                        background: 'var(--theme-surface, rgba(0, 0, 0, 0.25))',
                        padding: '8px 10px',
                        borderRadius: 6,
                        border: '1px solid var(--theme-border, rgba(255, 255, 255, 0.12))',
                      }}
                    >
                      <div
                        style={{
                          fontSize: 9,
                          fontWeight: 700,
                          color: 'var(--theme-text-muted)',
                          textTransform: 'uppercase',
                          letterSpacing: 0.5,
                        }}
                      >
                        {selectedInputDetail ? 'INPUT MATERIAL' : 'STARTING RAW MATERIAL'}
                      </div>
                      <div
                        style={{
                          fontWeight: 600,
                          fontSize: 12,
                          color: 'var(--theme-text)',
                          marginTop: 2,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {selectedInputDetail ? selectedInputDetail.name : (editing?.name || watchedName || '(Current Item)')}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--theme-text-muted)', marginTop: 2 }}>
                        <code
                          style={{
                            background: 'var(--theme-hover, rgba(255,255,255,0.08))',
                            color: 'var(--theme-accent, #38bdf8)',
                            padding: '1px 4px',
                            borderRadius: 3,
                            fontSize: 10,
                          }}
                        >
                          {selectedInputDetail ? selectedInputDetail.itemCode : (editing?.itemCode || watchedCode || 'RAW WIRE')}
                        </code>
                        {(selectedInputDetail?.wireSizeMm != null || (!selectedInputDetail && wireVal != null)) && (
                          <span style={{ marginLeft: 4 }}>
                            • {formatDimension(selectedInputDetail?.wireSizeMm ?? wireVal)} mm
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Middle: Processes Sequence */}
                    {modalProcesses.length > 0 ? (
                      modalProcesses.map((pName, pIdx) => (
                        <React.Fragment key={pIdx}>
                          <div style={{ color: 'var(--theme-accent, #0284c7)', fontSize: 14, flexShrink: 0 }}>➔</div>
                          <div
                            style={{
                              minWidth: 120,
                              maxWidth: 160,
                              flex: '0 0 auto',
                              background: 'var(--theme-hover, rgba(255, 255, 255, 0.05))',
                              padding: '6px 8px',
                              borderRadius: 6,
                              border: '1px solid rgba(2, 132, 199, 0.3)',
                              textAlign: 'center',
                            }}
                          >
                            <span
                              style={{
                                fontSize: 9,
                                fontWeight: 700,
                                background: '#0284c7',
                                color: '#fff',
                                borderRadius: 3,
                                padding: '1px 5px',
                                display: 'inline-block',
                                marginBottom: 2,
                              }}
                            >
                              STEP {pIdx + 1}
                            </span>
                            <div
                              style={{
                                fontSize: 11,
                                fontWeight: 600,
                                color: 'var(--theme-text)',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {pName}
                            </div>
                          </div>
                        </React.Fragment>
                      ))
                    ) : (
                      <>
                        <div style={{ color: 'var(--theme-accent, #0284c7)', fontSize: 14, flexShrink: 0 }}>➔</div>
                        <div
                          style={{
                            minWidth: 120,
                            flex: '0 0 auto',
                            background: 'var(--theme-hover, rgba(255, 255, 255, 0.05))',
                            padding: '6px 8px',
                            borderRadius: 6,
                            border: '1px solid rgba(2, 132, 199, 0.3)',
                            textAlign: 'center',
                          }}
                        >
                          <span
                            style={{
                              fontSize: 9,
                              fontWeight: 700,
                              background: '#0284c7',
                              color: '#fff',
                              borderRadius: 3,
                              padding: '1px 5px',
                              display: 'inline-block',
                              marginBottom: 2,
                            }}
                          >
                            MANUFACTURING
                          </span>
                          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--theme-text)' }}>
                            {operationName}
                          </div>
                        </div>
                      </>
                    )}

                    {/* Right: Output Node */}
                    <div style={{ color: 'var(--theme-accent, #0284c7)', fontSize: 14, flexShrink: 0 }}>➔</div>
                    <div
                      style={{
                        minWidth: 150,
                        maxWidth: 220,
                        flex: '0 0 auto',
                        background: 'var(--theme-success-soft, rgba(73, 170, 25, 0.12))',
                        padding: '8px 10px',
                        borderRadius: 6,
                        border: '1px solid var(--theme-success, rgba(73, 170, 25, 0.35))',
                      }}
                    >
                      <div
                        style={{
                          fontSize: 9,
                          fontWeight: 700,
                          color: 'var(--theme-success, #52c41a)',
                          textTransform: 'uppercase',
                          letterSpacing: 0.5,
                        }}
                      >
                        OUTPUT / FINAL PRODUCT
                      </div>
                      <div
                        style={{
                          fontWeight: 600,
                          fontSize: 12,
                          color: 'var(--theme-text)',
                          marginTop: 2,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {finalProdName || editing?.name || watchedName || '(Current Item)'}
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--theme-text-muted)', marginTop: 2 }}>
                        {(thkVal != null || widVal != null) && (
                          <div>T: {formatDimension(thkVal)} × W: {formatDimension(widVal)} mm</div>
                        )}
                        {nextStepName && (
                          <div style={{ color: 'var(--theme-accent, #0284c7)' }}>Next: {nextStepName}</div>
                        )}
                      </div>
                    </div>
                  </div>
                  {/* PROMPT-35: six-stage production flow (01-06) — same order as the View card */}
                  <div style={{ marginTop: 10, borderTop: '1px solid var(--theme-border, rgba(255,255,255,0.1))', paddingTop: 10 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--theme-accent, #0284c7)', letterSpacing: 0.5 }}>
                      Production Flow — Six Stages (01 → 06)
                    </span>
                    <div style={{ display: 'flex', alignItems: 'stretch', overflowX: 'auto', padding: '8px 0 4px', gap: 0 }}>
                      {previewStages.map((st, sidx) => (
                        <React.Fragment key={`${st.sequence}-${st.stageKey}`}>
                          <StageBlock stage={st} />
                          {sidx < previewStages.length - 1 && (
                            <div style={{ display: 'flex', alignItems: 'center', padding: '0 6px', flexShrink: 0 }}>
                              <ArrowRightOutlined style={{ color: 'var(--theme-accent, #0284c7)', fontSize: 16 }} />
                            </div>
                          )}
                        </React.Fragment>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })()}
          </Card>

          {/* SECTION 6 — ADDITIONAL */}
          <Card size="small" title="Additional" style={{ marginBottom: 12, borderRadius: 8 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0 12px' }}>
              <Form.Item name="sku" label="SKU" extra={editing ? 'SKU cannot be changed' : 'Auto-generated if left empty'}>
                <Input disabled={!!editing} placeholder={editing ? 'Auto-generated' : 'Auto-generated on create'} />
              </Form.Item>
              <Form.Item name="barcode" label="Barcode" extra={editing ? 'Barcode cannot be changed' : 'Auto-generated if left empty'}>
                <Input disabled={!!editing} placeholder={editing ? 'Auto-generated' : 'Auto-generated on create'} />
              </Form.Item>
              <Form.Item name="manufacturerPartNumber" label="Manufacturer Part No."><Input maxLength={255} placeholder="Optional" /></Form.Item>
              <Form.Item name="brand" label="Brand"><Input maxLength={255} placeholder="Optional" /></Form.Item>
              <Form.Item name="model" label="Model"><Input maxLength={255} placeholder="Optional" /></Form.Item>
              <Form.Item name="costPrice" label="Cost Price" extra="Standard cost (Item Master)">
                <InputNumber min={0} step={0.01} style={{ width: '100%' }} placeholder="Optional (e.g. 125.00)" />
              </Form.Item>
              <Form.Item name="sellingPrice" label="Selling Price" extra="Default selling price (Item Master)">
                <InputNumber min={0} step={0.01} style={{ width: '100%' }} placeholder="Optional (e.g. 180.00)" />
              </Form.Item>
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
      </DraggableResizableModal>

      <DraggableResizableModal
        open={importOpen}
        onCancel={closeImport}
        width={960}
        height={620}
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
            <Descriptions bordered size="small" column={1} styles={{ label: { width: 180 } }}>
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
      </DraggableResizableModal>

      {/* Barcode Scanner Modal */}
      <BarcodeScanner
        open={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onScan={handleBarcodeScan}
      />

      {/* Barcode Print Modal */}
      <BarcodePrint
        open={printOpen}
        onClose={() => { setPrintOpen(false); setPrintItem(null); }}
        itemCode={printItem?.itemCode || ''}
        itemName={printItem?.name || ''}
        sku={printItem?.sku}
        barcode={printItem?.barcode}
      />

{/* Barcode Detail Modal */}
      <DraggableResizableModal
        open={barcodeModalOpen}
        onCancel={() => { setBarcodeModalOpen(false); setBarcodeModalItem(null); setBarcodeModalBarcodes([]); }}
        footer={
          <Space>
            <Button onClick={() => { setBarcodeModalOpen(false); setBarcodeModalItem(null); setBarcodeModalBarcodes([]); }}>Close</Button>
            {barcodeModalItem && (
              <Button
                type="primary"
                icon={<PrinterOutlined />}
                onClick={() => { setPrintItem(barcodeModalItem); setPrintOpen(true); setBarcodeModalOpen(false); }}
              >
                Print Barcode
              </Button>
            )}
          </Space>
        }
        title={
          <Space>
            <DatabaseOutlined />
            {barcodeModalItem ? `Barcode — ${barcodeModalItem.itemCode}` : 'Barcode'}
          </Space>
        }
        width={520}
        destroyOnHidden
      >
        {barcodeModalItem && (
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            <Descriptions size="small" column={2} styles={{ label: { width: 140 } }}>
              <Descriptions.Item label="Item Code"><Text strong style={{ fontFamily: 'monospace' }}>{barcodeModalItem.itemCode}</Text></Descriptions.Item>
              <Descriptions.Item label="Item Name">{barcodeModalItem.name}</Descriptions.Item>
              {barcodeModalItem.sku && <Descriptions.Item label="SKU"><Text code>{barcodeModalItem.sku}</Text></Descriptions.Item>}
              <Descriptions.Item label="Item Type"><Tag>{ITEM_TYPES.find((t) => t.value === barcodeModalItem.itemType)?.label || barcodeModalItem.itemType}</Tag></Descriptions.Item>
              <Descriptions.Item label="Status"><StatusBadge status={barcodeModalItem.status} colorMap={statusColorMap} /></Descriptions.Item>
              {barcodeModalItem.baseUomName && <Descriptions.Item label="UOM">{barcodeModalItem.baseUomName}</Descriptions.Item>}
            </Descriptions>

            <div style={{
              padding: '16px 20px',
              background: '#fff',
              borderRadius: 8,
              border: '1px solid var(--theme-border, #e8e8e8)',
              textAlign: 'center',
            }}>
              {(barcodeModalItem.barcode || barcodeModalBarcodes[0]?.barcodeValue) ? (
                <>
                   <svg ref={barcodeModalCallbackRef} style={{ maxWidth: '100%', overflow: 'visible' }} />
                  <div style={{ marginTop: 8 }}>
                    <Tag color="green">Primary Barcode</Tag>
                  </div>
                </>
              ) : (
                <div style={{ padding: '20px 0' }}>
                  <Alert
                    type="info"
                    showIcon
                    message="No Barcode Assigned"
                    description="This item does not have a barcode in the registry. A barcode will be generated automatically when needed."
                  />
                </div>
              )}
            </div>

            {barcodeModalBarcodes.length > 1 && (
              <div>
                <Text type="secondary" style={{ fontSize: 12 }}>All Registered Barcodes ({barcodeModalBarcodes.length})</Text>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
                  {barcodeModalBarcodes.map((b: any) => (
                    <Tag key={b.id} color={b.isPrimary ? 'green' : 'default'} style={{ fontFamily: 'monospace', fontSize: 11 }}>
                      {b.barcodeValue}{b.isPrimary ? ' (Primary)' : ''}
                    </Tag>
                  ))}
                </div>
              </div>
            )}
          </Space>
        )}
      </DraggableResizableModal>
    </div>
  );
};

export default ItemManagement;
