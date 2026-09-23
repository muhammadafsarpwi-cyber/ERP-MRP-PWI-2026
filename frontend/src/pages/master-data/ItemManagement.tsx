import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import {
  Alert, App, Badge, Button, Card, Checkbox, Col, Descriptions, Dropdown, Form, Grid, Input,
  InputNumber, Modal, Popconfirm, Progress, Row, Segmented, Select, Space, Switch, Table, Tabs, Tag, Tooltip, Typography, Upload,
} from 'antd';
import type { MenuProps } from 'antd';
import {
  ApartmentOutlined, AppstoreOutlined, ArrowDownOutlined, ArrowUpOutlined, ClearOutlined, DeleteOutlined, DollarOutlined, DownloadOutlined, EditOutlined,
  EyeOutlined, FileAddOutlined, FilePdfOutlined, FilterOutlined, ImportOutlined, InboxOutlined, MoreOutlined,
  PauseCircleOutlined, PlayCircleOutlined, PlusOutlined, PrinterOutlined, CloseCircleOutlined,
  ReloadOutlined, SearchOutlined, ScanOutlined, HistoryOutlined, DatabaseOutlined, ProjectOutlined, ArrowRightOutlined,
  BankOutlined, BuildOutlined, CheckCircleOutlined, CustomerServiceOutlined, FolderOutlined, SettingOutlined, ToolOutlined,
  MinusOutlined, WarningOutlined, TagOutlined, TagsOutlined, SyncOutlined, UploadOutlined, FileTextOutlined,
  BulbOutlined, ThunderboltOutlined, CheckOutlined, CloseOutlined, ClockCircleOutlined,
} from '@ant-design/icons';
import type { ColumnsType, TablePaginationConfig } from 'antd/es/table';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import apiService from '../../services/api';
import { formatDimension } from '../../utils/numberFormat';
import { handleValidationErrors } from '../../utils/formValidationHelper';
import { usePermission } from '../../hooks/usePermission';
import {
  PageHeader, StatusBadge, EmptyState, ERPTable, TabKeepAlive, GlobalLoading,
  BarcodeScanner, BarcodePrint, DraggableResizableModal, HeaderCell,
  SaveResultDialog, DeleteConfirmModal, type SaveResultPhase, type SaveResultData,
} from '../../components/shared';
import JsBarcode from 'jsbarcode';
import {
  ITEM_TYPES, ROUTE_TYPES, STATUS_OPTIONS, statusColorMap, TRACKING_SWITCHES,
  routeColorMap, IMPORT_COLUMNS, REQUIRED_IMPORT_COLUMNS, TEMPLATE_CSV,
  stageTitleForOperation, isEmptyValue, getDivisionPrefix, formatItemCodeWithDivisionPrefix,
  type Item, type DivisionOption, type SectionOption, type DepartmentOption,
  type UomOption, type SimpleOption, type CategoryOption, type ConversionInfo,
  type ImportRow, type ProductionFlowStage, type ProcessStep,
} from './items/itemTypes';
import InputMaterialSelect from './items/InputMaterialSelect';
import ProductionFlowCard, { StageBlock } from './items/ProductionFlowCard';
import { buildRouteFlow, findRouteCycles, normalizeRouteRows, type RouteRow, type RouteStageSource } from './items/productionRoute';
import { tabSessionCache, TAB_REFRESH_EVENT } from '../../services/tabSessionCache';
import './itemManagement.css';

const { Text } = Typography;

const MASTER_PRODUCTS_ITEMS_TAB_ID = '/master-data/products-items';

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

interface MasterItemType {
  id: string;
  code: string;
  name: string;
  status: string;
  usageCount?: number;
}

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
      <span
        style={{
          fontSize: 12.5,
          lineHeight: 1.25,
          color: active ? 'var(--theme-accent, var(--theme-primary, #4f46e5))' : 'var(--theme-text)',
          fontWeight: active ? 700 : 500,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          display: 'block',
        }}
        title={label}
      >
        {label}
      </span>
    </span>
    {count !== undefined && (
      <Text type="secondary" style={{ position: 'relative', zIndex: 1, fontSize: 10.5, lineHeight: 1.2 }}>
        {count} items
      </Text>
    )}
  </button>
);

interface KpiCardProps {
  testId: string;
  label: string;
  value: React.ReactNode;
  icon: ItemTypeIconComponent;
  tone: string;
  toneSoft: string;
}

// KPI summary card with a foreground icon chip, a large decorative watermark
// (same semantic glyph, rendered faint behind the content) and a prominent
// value. Uses only ERP theme tokens so it adapts to light and dark themes.
const KpiCard: React.FC<KpiCardProps> = ({
  testId, label, value, icon: Icon, tone, toneSoft,
}) => (
  <Card
    size="small"
    className="item-crystal-kpi-card"
    data-testid={testId}
    styles={{ body: { padding: '12px 14px' } }}
    style={{ position: 'relative', overflow: 'hidden', borderLeft: `3.5px solid ${tone}` }}
  >
    <Icon
      aria-hidden="true"
      data-kpi-watermark="true"
      style={{
        position: 'absolute',
        right: -10,
        bottom: -16,
        fontSize: 68,
        opacity: 0.12,
        pointerEvents: 'none',
        zIndex: 0,
        color: tone,
      }}
    />
    <div style={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, minWidth: 0 }}>
      <span
        style={{
          fontSize: 11,
          lineHeight: 1.2,
          fontWeight: 600,
          letterSpacing: '0.03em',
          color: 'var(--theme-text-muted)',
          textTransform: 'uppercase',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          display: 'block',
        }}
        title={label}
      >
        {label}
      </span>
      <span
        data-kpi-icon="true"
        aria-hidden="true"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 28,
          height: 28,
          flex: '0 0 auto',
          borderRadius: 7,
          fontSize: 15,
          background: toneSoft,
          color: tone,
        }}
      >
        <Icon />
      </span>
    </div>
    <div
      data-kpi-value="true"
      style={{
        position: 'relative',
        zIndex: 1,
        marginTop: 8,
        fontSize: 28,
        fontWeight: 700,
        lineHeight: 1.1,
        fontVariantNumeric: 'tabular-nums',
        color: 'var(--theme-text)',
      }}
    >
      {value}
    </div>
  </Card>
);

// ─── Item Master Column Visibility Constants ──────────────────────────────
const DEFAULT_ITEM_VISIBLE_COLUMNS: Record<string, boolean> = {
  itemCode: true,
  name: true,
  divisionSection: true,
  department: true,
  wireDiaLength: true,
  flatSpec: true,
  itemType: true,
  materialRoleUsage: true,
  routeType: true,
  uom: true,
  status: true,
  actions: true,
};

const ITEM_COLUMN_LABELS: Record<string, string> = {
  itemCode: 'Item Code',
  name: 'Item Name & SKU',
  divisionSection: 'Division / Section',
  department: 'Department',
  wireDiaLength: 'Wire / Dia · Length',
  flatSpec: 'Flat Spec (mm)',
  itemType: 'Item Type',
  materialRoleUsage: 'Material Role / Usage',
  routeType: 'Route Type',
  uom: 'UOM / Conversion',
  status: 'Status',
  actions: 'Actions',
};

/* ─── 2027 Item Status & Type Chevron Pipeline Ribbon ─────────────────────── */
export interface ItemChevronItem {
  key: string;
  label: string;
  count: number;
  color: string;
  activeBg: string;
  icon: React.ReactNode;
}

const CHEVRON_PALETTE = [
  { color: '#d97706', activeBg: '#b45309', icon: <ToolOutlined /> },
  { color: '#0891b2', activeBg: '#0e7490', icon: <ProjectOutlined /> },
  { color: '#4f46e5', activeBg: '#3730a3', icon: <DatabaseOutlined /> },
  { color: '#0284c7', activeBg: '#0369a1', icon: <TagOutlined /> },
  { color: '#059669', activeBg: '#047857', icon: <BuildOutlined /> },
  { color: '#ea580c', activeBg: '#c2410c', icon: <SettingOutlined /> },
  { color: '#7c3aed', activeBg: '#6d28d9', icon: <ApartmentOutlined /> },
  { color: '#db2777', activeBg: '#be185d', icon: <InboxOutlined /> },
  { color: '#475569', activeBg: '#334155', icon: <AppstoreOutlined /> },
];

const KNOWN_TYPE_STYLES: Record<string, { color: string; activeBg: string; icon: React.ReactNode }> = {
  RAW_MATERIAL: { color: '#d97706', activeBg: '#b45309', icon: <ToolOutlined /> },
  SEMI_FINISHED: { color: '#7c3aed', activeBg: '#6d28d9', icon: <ApartmentOutlined /> },
  WORK_IN_PROGRESS: { color: '#0891b2', activeBg: '#0e7490', icon: <ProjectOutlined /> },
  FINISHED_GOOD: { color: '#4f46e5', activeBg: '#3730a3', icon: <DatabaseOutlined /> },
  FINISHED_GOODS: { color: '#4f46e5', activeBg: '#3730a3', icon: <DatabaseOutlined /> },
  TOOLS: { color: '#059669', activeBg: '#047857', icon: <BuildOutlined /> },
  SPARE_PART: { color: '#ea580c', activeBg: '#c2410c', icon: <SettingOutlined /> },
  SPARE_PARTS: { color: '#ea580c', activeBg: '#c2410c', icon: <SettingOutlined /> },
  CONSUMABLE: { color: '#0284c7', activeBg: '#0369a1', icon: <TagOutlined /> },
  CONSUMABLES: { color: '#0284c7', activeBg: '#0369a1', icon: <TagOutlined /> },
  PACKAGING_MATERIAL: { color: '#db2777', activeBg: '#be185d', icon: <InboxOutlined /> },
  OTHER: { color: '#475569', activeBg: '#334155', icon: <AppstoreOutlined /> },
};

const ItemStatusChevronRibbon: React.FC<{
  chevrons: ItemChevronItem[];
  activeKey: string;
  onSelect: (key: string) => void;
}> = ({ chevrons, activeKey, onSelect }) => {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'stretch',
        width: '100%',
        overflowX: 'auto',
        padding: '2px 2px 8px 2px',
        marginBottom: 10,
        scrollbarWidth: 'thin',
        filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.08))',
      }}
    >
      {chevrons.map((ch, idx) => {
        const isSelected = activeKey === ch.key;
        const isFirst = idx === 0;
        const isLast = idx === chevrons.length - 1;
        const count = ch.count ?? 0;

        const clipPath = isFirst
          ? 'polygon(0 0, calc(100% - 14px) 0, 100% 50%, calc(100% - 14px) 100%, 0 100%)'
          : isLast
          ? 'polygon(0 0, 100% 0, 100% 100%, 0 100%, 14px 50%)'
          : 'polygon(0 0, calc(100% - 14px) 0, 100% 50%, calc(100% - 14px) 100%, 0 100%, 14px 50%)';

        return (
          <button
            key={ch.key}
            type="button"
            onClick={() => onSelect(ch.key)}
            style={{
              position: 'relative',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              padding: isFirst
                ? '10px 22px 10px 16px'
                : isLast
                ? '10px 18px 10px 24px'
                : '10px 20px 10px 24px',
              marginLeft: isFirst ? 0 : -6,
              zIndex: isSelected ? 12 : chevrons.length - idx,
              fontSize: 12.5,
              fontWeight: 700,
              letterSpacing: '0.4px',
              color: '#ffffff',
              background: isSelected ? ch.activeBg : ch.color,
              border: 'none',
              clipPath,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              flex: '1 0 auto',
              transition: 'all 0.18s cubic-bezier(0.4, 0, 0.2, 1)',
              boxShadow: isSelected ? '0 0 0 2px #ffffff, 0 4px 14px rgba(0,0,0,0.35)' : undefined,
              transform: isSelected ? 'scale(1.025) translateY(-1px)' : 'none',
              opacity: isSelected ? 1 : 0.93,
            }}
            onMouseEnter={(e) => {
              if (!isSelected) {
                e.currentTarget.style.opacity = '1';
                e.currentTarget.style.transform = 'translateY(-1px)';
              }
            }}
            onMouseLeave={(e) => {
              if (!isSelected) {
                e.currentTarget.style.opacity = '0.93';
                e.currentTarget.style.transform = 'none';
              }
            }}
          >
            <span style={{ fontSize: 13, display: 'flex', alignItems: 'center' }}>{ch.icon}</span>
            <span>{ch.label}</span>
            <span
              style={{
                display: 'inline-block',
                background: 'rgba(255, 255, 255, 0.25)',
                borderRadius: 10,
                padding: '1px 7px',
                fontSize: 11.5,
                fontWeight: 800,
                letterSpacing: 0,
                marginLeft: 2,
              }}
            >
              {count}
            </span>
          </button>
        );
      })}
    </div>
  );
};

/* ─── 2027 Item Details Modal Process Chevron Navigation ─────────────────── */
const ITEM_DETAIL_TABS: Array<{ key: string; label: string; icon: React.ReactNode }> = [
  { key: 'overview', label: 'Basic Info & Overview', icon: <EyeOutlined /> },
  { key: 'inventory', label: 'Inventory & Warehousing', icon: <DatabaseOutlined /> },
  { key: 'pricing', label: 'Pricing, Cost & Valuation', icon: <DollarOutlined /> },
  { key: 'history', label: 'Audit Log & History', icon: <HistoryOutlined /> },
];

const ItemModalProcessChevronNav: React.FC<{
  active: string;
  onChange: (key: string) => void;
}> = ({ active, onChange }) => {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'stretch',
        width: '100%',
        overflowX: 'auto',
        padding: '4px 2px 10px 2px',
        scrollbarWidth: 'thin',
        filter: 'drop-shadow(0 2px 5px rgba(0,0,0,0.06))',
      }}
    >
      {ITEM_DETAIL_TABS.map((s, idx) => {
        const isActive = s.key === active;
        const isFirst = idx === 0;
        const isLast = idx === ITEM_DETAIL_TABS.length - 1;

        const clipPath = isFirst
          ? 'polygon(0 0, calc(100% - 14px) 0, 100% 50%, calc(100% - 14px) 100%, 0 100%)'
          : isLast
          ? 'polygon(0 0, 100% 0, 100% 100%, 0 100%, 14px 50%)'
          : 'polygon(0 0, calc(100% - 14px) 0, 100% 50%, calc(100% - 14px) 100%, 0 100%, 14px 50%)';

        return (
          <button
            key={s.key}
            type="button"
            onClick={() => onChange(s.key)}
            style={{
              position: 'relative',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              padding: isFirst
                ? '10px 22px 10px 16px'
                : isLast
                ? '10px 18px 10px 24px'
                : '10px 20px 10px 24px',
              marginLeft: isFirst ? 0 : -6,
              zIndex: isActive ? 10 : ITEM_DETAIL_TABS.length - idx,
              fontSize: 12.5,
              fontWeight: isActive ? 700 : 600,
              letterSpacing: '0.2px',
              color: isActive ? '#ffffff' : '#334155',
              background: isActive
                ? 'linear-gradient(135deg, #1d4ed8 0%, #2563eb 50%, #3b82f6 100%)'
                : '#f8fafc',
              border: 'none',
              clipPath,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              flex: '1 0 auto',
              transition: 'all 0.18s cubic-bezier(0.4, 0, 0.2, 1)',
              boxShadow: isActive
                ? '0 4px 14px rgba(37, 99, 235, 0.4)'
                : 'inset 0 1px 0 rgba(255,255,255,0.8)',
              transform: isActive ? 'scale(1.02)' : 'none',
            }}
            onMouseEnter={(e) => {
              if (!isActive) {
                e.currentTarget.style.background = '#e2e8f0';
                e.currentTarget.style.color = '#0f172a';
              }
            }}
            onMouseLeave={(e) => {
              if (!isActive) {
                e.currentTarget.style.background = '#f8fafc';
                e.currentTarget.style.color = '#334155';
              }
            }}
          >
            <span
              style={{
                fontSize: 14,
                display: 'flex',
                alignItems: 'center',
                color: isActive ? '#ffffff' : '#3b82f6',
              }}
            >
              {s.icon}
            </span>
            <span>{s.label}</span>
          </button>
        );
      })}
    </div>
  );
};

const ItemManagement: React.FC = () => {
  const { message } = App.useApp();
  const { can } = usePermission();
  const screens = Grid.useBreakpoint();
  // ── Filter State Persistence via tabSessionCache ──────────────────────────
  // Saves filter/sort/pagination state on every change so it can be restored
  // when the user navigates back to this tab from another.
  const ITEM_CACHE_KEY = MASTER_PRODUCTS_ITEMS_TAB_ID;

  interface ItemFilterState {
    fDivision?: string; fSection?: string; fDepartment?: string;
    fCategory?: string; fItemType?: string; fRoleUsage?: string;
    fRouteType?: string; fStatus?: string;
    search: string; searchInput: string;
    page: number; pageSize: number;
    sortField: string; sortOrder: string;
    activeTab: string; showFilters: boolean;
  }

  interface ItemMasterCache {
    items: Item[];
    total: number;
    stats: { total: number | null; active: number | null; inactive: number | null; stock: number | null; manufactured: number | null };
    typeCounts: Record<string, number>;
    uoms: UomOption[];
    categories: CategoryOption[];
    divisions: DivisionOption[];
    sections: SectionOption[];
    departments: DepartmentOption[];
    routeTypes: Array<{ id: string; routeCode: string; name: string; status: string }>;
    masterItemTypes: MasterItemType[];
    filterState: ItemFilterState;
  }

  const savedFilters = tabSessionCache.get<ItemFilterState>(ITEM_CACHE_KEY);
  const savedMaster = tabSessionCache.get<ItemMasterCache>(ITEM_CACHE_KEY);

  const [items, setItems] = useState<Item[]>(() => savedMaster?.items ?? []);
  const [loading, setLoading] = useState(!savedMaster);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState<number>(() => savedMaster?.total ?? 0);
  const [page, setPage] = useState(savedFilters?.page ?? 1);
  const [pageSize, setPageSize] = useState(savedFilters?.pageSize ?? 20);
  const [sortField, setSortField] = useState<string>(savedFilters?.sortField ?? 'itemCode');
  const [sortOrder, setSortOrder] = useState<'ASC' | 'DESC'>((savedFilters?.sortOrder as 'ASC' | 'DESC') ?? 'ASC');

  const [searchInput, setSearchInput] = useState(savedFilters?.searchInput ?? '');
  const [search, setSearch] = useState(savedFilters?.search ?? '');
  const [showFilters, setShowFilters] = useState(savedFilters?.showFilters ?? false);
  const [deleteTargetItem, setDeleteTargetItem] = useState<Item | null>(null);
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);

  const [fDivision, setFDivision] = useState<string | undefined>(savedFilters?.fDivision);
  const [fSection, setFSection] = useState<string | undefined>(savedFilters?.fSection);
  const [fDepartment, setFDepartment] = useState<string | undefined>(savedFilters?.fDepartment);
  const [fCategory, setFCategory] = useState<string | undefined>(savedFilters?.fCategory);
  const [fItemType, setFItemType] = useState<string | undefined>(savedFilters?.fItemType);
  const [fRoleUsage, setFRoleUsage] = useState<string | undefined>(savedFilters?.fRoleUsage);
  const [fRouteType, setFRouteType] = useState<string | undefined>(savedFilters?.fRouteType);
  const [fStatus, setFStatus] = useState<string | undefined>(savedFilters?.fStatus);
  const [activeTab, setActiveTab] = useState<string>(savedFilters?.activeTab ?? 'all');

  const [visibleCols, setVisibleCols] = useState<Record<string, boolean>>(() => {
    try {
      const saved = localStorage.getItem('pwi_item_table_columns_v2') || localStorage.getItem('pwi_item_table_columns_v1');
      if (saved) {
        const parsed = JSON.parse(saved);
        return {
          ...DEFAULT_ITEM_VISIBLE_COLUMNS,
          ...parsed,
          materialRoleUsage: parsed.materialRoleUsage !== false,
        };
      }
    } catch {}
    return DEFAULT_ITEM_VISIBLE_COLUMNS;
  });

  const [uoms, setUoms] = useState<UomOption[]>(() => savedMaster?.uoms ?? []);
  const [categories, setCategories] = useState<CategoryOption[]>(() => savedMaster?.categories ?? []);
  const [divisions, setDivisions] = useState<DivisionOption[]>(() => savedMaster?.divisions ?? []);
  const [sections, setSections] = useState<SectionOption[]>(() => savedMaster?.sections ?? []);
  const [departments, setDepartments] = useState<DepartmentOption[]>(() => savedMaster?.departments ?? []);
  const [routeTypes, setRouteTypes] = useState<Array<{ id: string; routeCode: string; name: string; status: string }>>(() => savedMaster?.routeTypes ?? []);
  const [routeTypesState, setRouteTypesState] = useState<'loading' | 'error' | 'ready'>(() => savedMaster ? 'ready' : 'loading');
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [stats, setStats] = useState<{
    total: number | null; active: number | null; inactive: number | null;
    stock: number | null; manufactured: number | null;
  }>(() => savedMaster?.stats ?? { total: null, active: null, inactive: null, stock: null, manufactured: null });
  // TASK 13 — real per-item-type counts fetched from the same items API
  // (limit 1, total only). A type whose count could not be fetched simply has no
  // badge; counts are never fabricated or hard-coded.
  const [typeCounts, setTypeCounts] = useState<Record<string, number>>(() => savedMaster?.typeCounts ?? {});
  // Database-backed Item Type master. When the master loads successfully the
  // registry becomes the single source of truth for the type cards, the form
  // Select and every label; when it is unavailable/empty the static ITEM_TYPES
  // list is used as a graceful fallback (keeps all existing screens working).
  const [masterItemTypes, setMasterItemTypes] = useState<MasterItemType[]>(() => savedMaster?.masterItemTypes ?? []);
  const [masterTypesState, setMasterTypesState] = useState<'loading' | 'error' | 'ready'>(() => savedMaster ? 'ready' : 'loading');

  const displayTypes = useMemo(() => (
    masterItemTypes.length > 0
      ? masterItemTypes.map((t) => ({ value: t.code, label: t.name || t.code, status: t.status, itemTypeId: t.id }))
      : ITEM_TYPES.map((t) => ({ value: t.value, label: t.label, status: 'ACTIVE', itemTypeId: undefined }))
  ), [masterItemTypes]);

  const typeLabelMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const t of masterItemTypes) m.set(t.code, t.name || t.code);
    for (const t of ITEM_TYPES) if (!m.has(t.value)) m.set(t.value, t.label);
    return m;
  }, [masterItemTypes]);
  const typeName = useCallback((code?: string | null) => (code ? typeLabelMap.get(code) ?? code : '—'), [typeLabelMap]);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Item | null>(null);
  const [saving, setSaving] = useState(false);
  const [autoFillMaterialRole, setAutoFillMaterialRole] = useState(true);

  // SaveResultDialog states matching Machine Master
  const [resultOpen, setResultOpen] = useState(false);
  const [resultPhase, setResultPhase] = useState<SaveResultPhase>('loading');
  const [resultData, setResultData] = useState<SaveResultData | null>(null);
  const [resultError, setResultError] = useState<string>('');
  const lastItemPayload = useRef<Record<string, unknown> | null>(null);

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
  const watchedSectionId = Form.useWatch('sectionId', form);
  const watchedCategoryId = Form.useWatch('categoryId', form);
  const watchedBaseUomId = Form.useWatch('baseUomId', form);
  const watchedCostPrice = Form.useWatch('costPrice', form);
  const watchedSellingPrice = Form.useWatch('sellingPrice', form);
  const watchedSku = Form.useWatch('sku', form);
  const watchedBarcode = Form.useWatch('barcode', form);
  const watchedWeightPerPiece = Form.useWatch('weightPerPiece', form);
  const watchedWeightPerMeter = Form.useWatch('weightPerMeter', form);
  const watchedPiecesPerKg = Form.useWatch('piecesPerKg', form);
  const watchedMinStock = Form.useWatch('minimumStockLevel', form);
  const watchedMaxStock = Form.useWatch('maximumStockLevel', form);
  const watchedReorder = Form.useWatch('reorderLevel', form);
  const watchedSafety = Form.useWatch('safetyStockLevel', form);
  const [selectedInputDetail, setSelectedInputDetail] = useState<Partial<Item> | null>(null);

  // TASK 15: resolve output items referenced by route rows so the preview can
  // build stage info (dims, base UOM, department) without re-fetching each item.
  // Key = outputItemId, value = resolved Item (or null once fetch finished).
  const [routeItemDetails, setRouteItemDetails] = useState<Record<string, RouteStageSource | null>>({});
  const handleRouteItemDetail = useCallback((itemId: string | undefined, detail: Item | null) => {
    if (!itemId) return;
    setRouteItemDetails((prev) => prev[itemId] === detail ? prev : { ...prev, [itemId]: detail });
  }, []);

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
  const [rawImportData, setRawImportData] = useState<Array<Record<string, string>>>([]);
  const [importFilter, setImportFilter] = useState<'ALL' | 'INVALID' | 'DUPLICATE' | 'VALID'>('ALL');
  const [importPage, setImportPage] = useState<number>(1);
  const [importPageSize, setImportPageSize] = useState<number>(20);
  const [showErrorsFirst, setShowErrorsFirst] = useState<boolean>(true);
  const [isImportMinimized, setIsImportMinimized] = useState<boolean>(false);
  const [isFormMinimized, setIsFormMinimized] = useState<boolean>(false);
  const [isDetailMinimized, setIsDetailMinimized] = useState<boolean>(false);
  const [isBarcodeMinimized, setIsBarcodeMinimized] = useState<boolean>(false);
  const reuploadInputRef = useRef<HTMLInputElement>(null);
  const [importSummary, setImportSummary] = useState<{
    total: number; valid: number; invalid: number; duplicate: number;
    imported: number; failed: number; skipped: number; errors: string[];
  } | null>(null);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState<{
    current: number;
    total: number;
    percent: number;
    currentCode: string;
    successCount: number;
    failCount: number;
    speed: number;
    estimatedSecondsRemaining: number;
  } | null>(null);

  // Live Import Activity Console states (PROMPT-2027 UX)
  const [liveImportedItems, setLiveImportedItems] = useState<
    Array<{ rowNumber: number; itemCode: string; name: string; itemType?: string; division?: string }>
  >([]);
  const [liveFailedItems, setLiveFailedItems] = useState<
    Array<{ rowNumber: number; itemCode: string; reason: string }>
  >([]);

  // Barcode Scanner & Print state
  const [scannerOpen, setScannerOpen] = useState(false);
  const [printOpen, setPrintOpen] = useState(false);
  const [printItem, setPrintItem] = useState<Item | null>(null);
  const [showLivePreview, setShowLivePreview] = useState<boolean>(false);

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

  // Persist filter state to sessionStorage so it survives tab navigation
  useEffect(() => {
    tabSessionCache.set<ItemFilterState>(ITEM_CACHE_KEY, {
      fDivision, fSection, fDepartment, fCategory, fItemType, fRoleUsage, fRouteType, fStatus,
      search, searchInput, page, pageSize, sortField, sortOrder, activeTab, showFilters,
    });
  }, [fDivision, fSection, fDepartment, fCategory, fItemType, fRoleUsage, fRouteType, fStatus,
      search, searchInput, page, pageSize, sortField, sortOrder, activeTab, showFilters]); // eslint-disable-line react-hooks/exhaustive-deps

  const activeFilterCount = useMemo(
    () => [fDivision, fSection, fDepartment, fCategory, fItemType, fRoleUsage, fRouteType, fStatus].filter(Boolean).length,
    [fDivision, fSection, fDepartment, fCategory, fItemType, fRoleUsage, fRouteType, fStatus],
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
      if (fRoleUsage) params.materialRoleUsage = fRoleUsage;
      if (fRouteType) params.routeTypeId = fRouteType;
      if (fStatus) params.status = fStatus;
      return params;
    },
    [page, pageSize, sortField, sortOrder, search, fDivision, fSection, fDepartment, fCategory, fItemType, fRoleUsage, fRouteType, fStatus],
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
      const list = (response.data || []).map(normalizeItem);
      setItems(list);
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
      const [uomSettled, catSettled, divSettled, secSettled, depSettled, rtSettled, itSettled] = await Promise.allSettled([
        apiService.get<{ data: UomOption[] }>('/master-data/uom', { limit: 200 }),
        apiService.get<{ data: CategoryOption[] }>('/master-data/categories', { limit: 500 }),
        apiService.get<{ data: DivisionOption[] }>('/divisions', { limit: 200 }),
        apiService.get<{ data: SectionOption[] }>('/sections', { limit: 500 }),
        apiService.get<{ data: DepartmentOption[] }>('/departments', { limit: 500 }),
        apiService.get<{ data: Array<{ id: string; routeCode: string; name: string; status: string }> }>('/master-data/route-types', { limit: 200 }),
        apiService.get<{ data: MasterItemType[] }>('/master-data/item-types', { limit: 500 }),
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
      let masterReady: MasterItemType[] = [];
      if (itSettled.status === 'fulfilled' && Array.isArray(itSettled.value.data) && itSettled.value.data.length > 0) {
        masterReady = itSettled.value.data;
        setMasterItemTypes(masterReady);
        setMasterTypesState('ready');
      } else {
        setMasterItemTypes([]);
        setMasterTypesState(itSettled.status === 'rejected' ? 'error' : 'ready');
      }

      const allFailed = [uomSettled, catSettled, divSettled, secSettled, depSettled, rtSettled, itSettled].every(s => s.status === 'rejected');
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
          const typeList = masterReady.length > 0 ? masterReady.map((t) => ({ value: t.code })) : ITEM_TYPES;
          const settled = await Promise.allSettled(
            typeList.map((t) => mk({ itemType: t.value })),
          );
          const counts: Record<string, number> = {};
          typeList.forEach((t, i) => {
            if (settled[i].status === 'fulfilled') counts[t.value] = settled[i].value;
          });
          setTypeCounts(counts);
        } catch {
          // per-type counts stay absent; the All Items count badge remains.
        }
      }
    })();
  }, [resolveCompanyId, message, can]);

  // Persist the full dataset + labels to the session cache after every load so
  // switching back restores 3,833 items and their dropdown labels instantly.
  const persistMaster = () => {
    tabSessionCache.set<ItemMasterCache>(ITEM_CACHE_KEY, {
      items,
      total,
      stats,
      typeCounts,
      uoms, categories, divisions, sections, departments, routeTypes, masterItemTypes,
      filterState: {
        fDivision, fSection, fDepartment, fCategory, fItemType, fRoleUsage, fRouteType, fStatus,
        search, searchInput, page, pageSize, sortField, sortOrder, activeTab, showFilters,
      },
    });
  };
  const persistMasterRef = useRef(persistMaster);
  persistMasterRef.current = persistMaster;

  useEffect(() => {
    // If the tab was already loaded in this session, DO NOT re-fetch when
    // returning to it — the cached items/labels are already seeded into state.
    if (!tabSessionCache.has(ITEM_CACHE_KEY)) {
      fetchItems();
    } else {
      persistMasterRef.current();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchItems]);

  // Global header/tab refresh event listener
  useEffect(() => {
    const handleGlobalRefresh = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!detail?.tabId || String(detail.tabId).startsWith(ITEM_CACHE_KEY)) {
        tabSessionCache.remove(ITEM_CACHE_KEY);
        void fetchItems();
      }
    };
    window.addEventListener(TAB_REFRESH_EVENT, handleGlobalRefresh);
    return () => window.removeEventListener(TAB_REFRESH_EVENT, handleGlobalRefresh);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchItems]);

  const handleTabChange = (key: string) => {
    setActiveTab(key);
    setFItemType(key === 'all' ? undefined : key);
    setPage(1);
  };

  const [pipelineStats, setPipelineStats] = useState<{
    total: number;
    active: number;
    inactive: number;
    types: Array<{ key: string; label: string; count: number }>;
  }>({ total: 0, active: 0, inactive: 0, types: [] });

  const fetchPipelineStats = useCallback(async () => {
    try {
      const params: Record<string, string> = {};
      if (fDivision) params.divisionId = fDivision;
      if (fSection) params.sectionId = fSection;
      if (fDepartment) params.departmentId = fDepartment;
      const res = await apiService.get<{ data: any }>('/master-data/items/pipeline-stats', params, { silent: true });
      if (res?.data) {
        setPipelineStats(res.data);
      }
    } catch (err) {
      console.warn('Pipeline stats temporarily unavailable:', (err as any)?.message || err);
    }
  }, [fDivision, fSection, fDepartment]);

  useEffect(() => {
    fetchPipelineStats();
  }, [fetchPipelineStats]);

  const dynamicChevrons = useMemo(() => {
    const list: ItemChevronItem[] = [
      {
        key: 'all',
        label: 'ALL ITEMS',
        count: pipelineStats.total || total,
        color: '#1e293b',
        activeBg: '#0f172a',
        icon: <AppstoreOutlined />,
      },
      {
        key: 'ACTIVE',
        label: 'ACTIVE',
        count: pipelineStats.active,
        color: '#16a34a',
        activeBg: '#15803d',
        icon: <CheckCircleOutlined />,
      },
      {
        key: 'INACTIVE',
        label: 'INACTIVE',
        count: pipelineStats.inactive,
        color: '#64748b',
        activeBg: '#475569',
        icon: <MinusOutlined />,
      },
    ];

    (pipelineStats.types || []).forEach((t, idx) => {
      if (t.count <= 0) return; // ZERO figures will NEVER appear!
      const preset = KNOWN_TYPE_STYLES[t.key] || CHEVRON_PALETTE[idx % CHEVRON_PALETTE.length];
      list.push({
        key: t.key,
        label: t.label.toUpperCase(),
        count: t.count,
        color: preset.color,
        activeBg: preset.activeBg,
        icon: preset.icon,
      });
    });

    return list;
  }, [pipelineStats, total]);

  const activeChevronKey = useMemo(() => {
    if (fStatus === 'ACTIVE') return 'ACTIVE';
    if (fStatus === 'INACTIVE') return 'INACTIVE';
    if (fItemType) return fItemType;
    if (activeTab && activeTab !== 'all') return activeTab;
    return 'all';
  }, [fStatus, fItemType, activeTab]);

  const handleItemChevronSelect = (key: string) => {
    if (key === 'all') {
      setFStatus(undefined);
      setFItemType(undefined);
      handleTabChange('all');
    } else if (key === 'ACTIVE') {
      setFStatus('ACTIVE');
      setFItemType(undefined);
      handleTabChange('all');
    } else if (key === 'INACTIVE') {
      setFStatus('INACTIVE');
      setFItemType(undefined);
      handleTabChange('all');
    } else {
      setFStatus(undefined);
      setFItemType(key);
      handleTabChange(key);
    }
  };

  const resetFilters = () => {
    setSearchInput('');
    setSearch('');
    setFDivision(undefined);
    setFSection(undefined);
    setFDepartment(undefined);
    setFCategory(undefined);
    setFItemType(undefined);
    setFRoleUsage(undefined);
    setFRouteType(undefined);
    setFStatus(undefined);
    setActiveTab('all');
    setPage(1);
    setSortField('itemCode');
    setSortOrder('ASC');
  };

  const handleDivisionChange = (val?: string) => {
    form.setFieldsValue({ sectionId: undefined, departmentId: undefined });
    if (val) {
      const sel = divisions.find((d) => d.id === val);
      const prefix = getDivisionPrefix(sel?.name || sel?.divisionCode);
      if (prefix && !editing) {
        const cur = form.getFieldValue('itemCode');
        if (cur && cur.trim()) {
          form.setFieldValue('itemCode', formatItemCodeWithDivisionPrefix(cur, prefix));
        } else {
          form.setFieldValue('itemCode', `${prefix}-`);
        }
      }
      const availSections = sectionsForDivision(val);
      if (availSections.length === 1) {
        const singleSec = availSections[0];
        form.setFieldValue('sectionId', singleSec.id);
        const availDepts = departmentsForSection(val, singleSec.id);
        if (availDepts.length === 1) {
          form.setFieldValue('departmentId', availDepts[0].id);
        }
      }
    }
  };

  const handleSectionChange = (val?: string) => {
    form.setFieldsValue({ departmentId: undefined });
    if (val) {
      const divId = form.getFieldValue('divisionId');
      const availDepts = departmentsForSection(divId, val);
      if (availDepts.length === 1) {
        form.setFieldValue('departmentId', availDepts[0].id);
      }
    }
  };

  const handleDepartmentChange = (val?: string) => {
    if (val) {
      const dept = departments.find((d) => d.id === val);
      if (dept) {
        if (dept.divisionId && !form.getFieldValue('divisionId')) {
          handleDivisionChange(dept.divisionId);
        }
        if (dept.sectionId && !form.getFieldValue('sectionId')) {
          form.setFieldValue('sectionId', dept.sectionId);
        }
      }
    }
  };

  const openCreate = () => {
    setIsFormMinimized(false);
    setShowLivePreview(false);
    setEditing(null);
    setSelectedInputDetail(null);
    setRouteItemDetails({});
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
      // TASK 15: no forced Raw Material row — the first stage the user adds IS
      // the starting stage (e.g. Store + RM item). Empty route falls back to the
      // TASK 14 legacy preview until stages are configured.
      processes: [],
      // TASK #34C: stock-level / lead-time numeric inputs start BLANK (no '0').
      // The database defaults to 0 when left unset on create.
    });
    setAutoFillMaterialRole(true);
    setFormOpen(true);
  };

  const openEdit = (record: Item) => {
    setIsFormMinimized(false);
    setShowLivePreview(false);
    setEditing(record);
    setSelectedInputDetail(record.productionInItem ?? null);
    // TASK 15: populate route-item-details for any output items already referenced
    // by the stored processes rows, so the preview resolves dims/UOM immediately.
    if (record.processes && record.processes.length > 0) {
      const detailsMap: Record<string, RouteStageSource | null> = {};
      for (const p of record.processes) {
        if (p.outputItemId && !detailsMap[p.outputItemId]) {
          detailsMap[p.outputItemId] = null; // will be resolved by InputMaterialSelect in each row
        }
      }
      setRouteItemDetails(detailsMap);
    } else {
      setRouteItemDetails({});
    }

    const initialProcs = (record.processes && Array.isArray(record.processes) && record.processes.length > 0)
      ? record.processes.map((p, idx) => ({
          sequence: Number(p.sequence ?? (idx + 1)),
          name: typeof p.name === 'string' ? p.name : '',
          departmentId: typeof (p as any).departmentId === 'string' ? (p as any).departmentId : undefined,
          departmentName: typeof (p as any).departmentName === 'string' ? (p as any).departmentName : undefined,
          divisionId: typeof (p as any).divisionId === 'string' ? (p as any).divisionId : undefined,
          divisionName: typeof (p as any).divisionName === 'string' ? (p as any).divisionName : undefined,
          sectionId: typeof (p as any).sectionId === 'string' ? (p as any).sectionId : undefined,
          sectionName: typeof (p as any).sectionName === 'string' ? (p as any).sectionName : undefined,
          outputItemId: typeof (p as any).outputItemId === 'string' ? (p as any).outputItemId : undefined,
        }))
      : [];

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
      materialRoleUsage: record.materialRoleUsage ?? (((record.itemType === 'RAW_MATERIAL' || (record.itemType || '').toUpperCase().includes('RAW'))) ? 'Process Component Materials' : undefined),
    });
    const isRaw = record.itemType === 'RAW_MATERIAL' || String(record.itemType || '').toUpperCase().includes('RAW');
    const isAutoRole = isRaw ? (!record.materialRoleUsage || record.materialRoleUsage === 'Process Component Materials') : false;
    setAutoFillMaterialRole(isAutoRole);
    setFormOpen(true);
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      const payload: Record<string, unknown> = {};

      const CLEARABLE_FIELDS = [
        'materialRoleUsage',
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

      // Item type: attach the master UUID (itemTypeId) when the selected code is a
      // registered item type; the backend item-types master is authoritative for the
      // stored code. Unknown/static codes keep working via the legacy item_type column.
      if (payload.itemType) {
        const typeOpt = displayTypes.find((t) => t.value === payload.itemType);
        if (typeOpt?.itemTypeId) payload.itemTypeId = typeOpt.itemTypeId;
        const isRaw = payload.itemType === 'RAW_MATERIAL' || String(payload.itemType || '').toUpperCase().includes('RAW');
        if (isRaw && autoFillMaterialRole) {
          payload.materialRoleUsage = 'Process Component Materials';
        }
      }

      if (!editing && payload.divisionId && payload.itemCode) {
        const selDiv = divisions.find((d) => d.id === payload.divisionId);
        const prefix = getDivisionPrefix(selDiv?.name || selDiv?.divisionCode);
        if (prefix) {
          payload.itemCode = formatItemCodeWithDivisionPrefix(String(payload.itemCode), prefix);
        }
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
        // TASK 15: each row is a PROCESS/DEPARTMENT + OUTPUT ITEM pair. Serialize
        // through normalizeRouteRows (re-indexes 1..N, drops empty rows, preserves
        // relationship fields) so the JSONB `processes` column is the authoritative
        // configured Production Route.
        const cleanProcs = normalizeRouteRows(values.processes);
        payload.processes = cleanProcs.map((r) => ({
          sequence: r.sequence,
          name: r.name,
          departmentId: r.departmentId,
          departmentName: r.departmentName,
          divisionId: r.divisionId,
          divisionName: r.divisionName,
          sectionId: r.sectionId,
          sectionName: r.sectionName,
          outputItemId: r.outputItemId,
        }));
        // Legacy process1..process6 columns mirror the configured route names. For
        // un-migrated TASK 14 items (no configured rows) preserve the typed names
        // in the form store so saving a legacy record never destroys its flow.
        const hadConfiguredRoute = Boolean(
          editing && Array.isArray(editing.processes) && editing.processes.length > 0,
        );
        const legacyNames = !hadConfiguredRoute
          ? [1, 2, 3, 4, 5, 6].map((i) => {
              const v = form.getFieldValue(`process${i}`) as unknown;
              return typeof v === 'string' && v.trim() ? v.trim() : null;
            })
          : [null, null, null, null, null, null];
        for (let i = 1; i <= 6; i++) {
          payload[`process${i}`] = cleanProcs[i - 1]?.name || legacyNames[i - 1];
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
      lastItemPayload.current = payload;
      setSaving(true);
      setResultOpen(true);
      setResultPhase('loading');
      setResultData(null);
      setResultError('');

      let savedItemCode = String(payload.itemCode || editing?.itemCode || '');
      let savedItemName = String(payload.name || editing?.name || '');

      if (editing) {
        const res = await apiService.patch<any>(`/master-data/items/${editing.id}`, payload);
        const data = res?.data?.data || res?.data || {};
        savedItemCode = data.itemCode || savedItemCode;
        savedItemName = data.name || savedItemName;
      } else {
        const res = await apiService.post<any>('/master-data/items', payload);
        const data = res?.data?.data || res?.data || {};
        savedItemCode = data.itemCode || savedItemCode;
        savedItemName = data.name || savedItemName;
      }

      setResultData({
        title: editing ? 'Item Updated Successfully' : 'Item Saved Successfully',
        message: editing
          ? 'The item master record has been successfully updated.'
          : 'New item master record has been successfully recorded.',
        recordType: 'Item Code',
        recordCode: savedItemCode,
        recordName: savedItemName,
        tags: [
          typeName(String(payload.itemType || editing?.itemType || '')),
          String(payload.status || editing?.status || 'ACTIVE'),
        ].filter(Boolean),
      });
      setResultPhase('success');
    } catch (err: any) {
      const valSummary = handleValidationErrors(err, form);
      if (valSummary) {
        setResultData(null);
        setResultError(`Please fill the following required field(s):\n\n${valSummary.bulletList}\n\nScroll to the highlighted section to complete the details.`);
        setResultPhase('error');
        setResultOpen(true);
        return;
      }
      const msg = err?.response?.data?.message;
      const text = Array.isArray(msg) ? msg.join('; ') : (msg || err?.message || 'Operation failed');
      setResultError(text);
      setResultPhase('error');
    } finally {
      setSaving(false);
    }
  };

  const handleResultClose = () => {
    setResultOpen(false);
    if (resultPhase === 'success') {
      setFormOpen(false);
      form.resetFields();
      fetchItems();
    }
  };

  const handleResultRetry = () => {
    handleSubmit();
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
    setIsDetailMinimized(false);
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
    setIsBarcodeMinimized(false);
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
    'Item Code', 'Name', 'SKU', 'Short Name', 'Item Type', 'Material Role / Usage', 'Category', 'Division', 'Section',
    'Department', 'Wire Size (mm)', 'Diameter (mm)', 'Thickness (mm)', 'Width (mm)', 'Route Type',
    'Process 1', 'Process 2', 'Process 3', 'Process 4', 'Process 5', 'Process 6',
    'Final Product', 'Packing / Next Step', 'Base UOM', 'Weight per Piece (KG)',
    'Pieces per KG', 'Weight per Meter (kg/m)', 'Length per Piece (m)', 'Barcode', 'Status', 'Remarks',
  ];

  const itemToExportRow = (r: Item): Array<string | number | null | undefined> => [
    r.itemCode, r.name, r.sku ?? '', r.shortName ?? '',
    typeName(r.itemType),
    r.materialRoleUsage || ((r.itemType === 'RAW_MATERIAL' || (r.itemType || '').toUpperCase().includes('RAW')) ? 'Process Component Materials' : ''),
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
    if (fItemType) parts.push(`Type: ${typeName(fItemType)}`);
    if (fRoleUsage) parts.push(`Role / Usage: ${fRoleUsage}`);
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
            <td>${typeName(r.itemType)}</td>
            <td>${r.materialRoleUsage || ((r.itemType === 'RAW_MATERIAL' || (r.itemType || '').toUpperCase().includes('RAW')) ? 'Process Component Materials' : '')}</td>
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
    <thead><tr><th>Item Code</th><th>Name</th><th>Division</th><th>Section</th><th>Department</th><th class="num">Wire (mm)</th><th class="num">Thk (mm)</th><th class="num">Wid (mm)</th><th>Type</th><th>Role / Usage</th><th>Route</th><th>UOM</th><th>Status</th></tr></thead>
    <tbody>${bodyRows || '<tr><td colspan="13" style="text-align:center;color:#999">No items found</td></tr>'}</tbody>
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
      const head = [['Item Code', 'Item Name', 'Division', 'Section', 'Department', 'Wire (mm)', 'Thk (mm)', 'Wid (mm)', 'Item Type', 'Role / Usage', 'Route', 'UOM', 'Status']];
      const body = rows.map((r) => [
        r.itemCode,
        r.name,
        divisionName(r) ?? '',
        sectionName(r) ?? '',
        departmentName(r) ?? '',
        formatDimension(r.wireSizeMm),
        formatDimension(r.thicknessMm),
        formatDimension(r.widthMm),
        typeName(r.itemType),
        r.materialRoleUsage || ((r.itemType === 'RAW_MATERIAL' || (r.itemType || '').toUpperCase().includes('RAW')) ? 'Process Component Materials' : ''),
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

    const rawDiv = get('divisionCodeOrName');
    let divisionId = matchLookup(rawDiv, divisions as any, 'divisionCode');
    if (rawDiv && !divisionId) errors.push(`Unknown Division '${rawDiv}'`);

    const selectedDiv = divisionId ? divisions.find((d) => d.id === divisionId) : undefined;
    const divPrefix = getDivisionPrefix(selectedDiv?.name || selectedDiv?.divisionCode || rawDiv);

    const itemCode = formatItemCodeWithDivisionPrefix(get('itemCode'), divPrefix);
    if (!itemCode) errors.push('Item Code is required');
    else if (!/^[A-Z0-9_-]{1,50}$/.test(itemCode)) errors.push('Item Code must be uppercase letters, numbers, hyphens or underscores');

    const name = get('name');
    if (!name) errors.push('Name is required');
    else if (name.length > 255) errors.push('Name exceeds 255 characters');

    const duplicate = itemCode !== '' && existingCodes.has(itemCode);
    if (duplicate) return { duplicate: true, errors: [`Item code '${itemCode}' already exists`], };
    if (seenCodes.has(itemCode)) return { duplicate: true, errors: [`Duplicate item code '${itemCode}' within the file`] };

    const itemTypeRaw = get('itemType').toUpperCase().replace(/[\s-]+/g, '_');
    const normTypeName = (s: string) => String(s).toUpperCase().replace(/[\s-]+/g, '_');
    // Resolve against the DB-backed master first (accepts code or display name),
    // then fall back to the static canonical list for backward compatibility.
    const masterType = displayTypes.find(
      (t) => t.value === itemTypeRaw || normTypeName(t.label) === itemTypeRaw,
    );
    const itemType = masterType?.value || ITEM_TYPES.find((t) => t.value === itemTypeRaw || normTypeName(t.label) === itemTypeRaw)?.value;
    if (!itemType) errors.push(`Invalid Item Type '${get('itemType')}'`);

    const uom = matchLookup(get('uomCode'), uoms, 'code');
    if (!get('uomCode')) errors.push('UOM is required');
    else if (!uom) errors.push(`Unknown UOM '${get('uomCode')}'`);

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

    let materialRole = get('materialRoleUsage');
    const isRaw = itemType === 'RAW_MATERIAL' || (itemType || '').includes('RAW');
    if (isRaw && !materialRole) {
      materialRole = 'Process Component Materials';
    }

    const payload: Record<string, unknown> = {
      companyId,
      itemCode,
      name,
      itemType,
      ...(materialRole ? { materialRoleUsage: materialRole } : {}),
      ...(masterType?.itemTypeId ? { itemTypeId: masterType.itemTypeId } : {}),
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

  const validateRowsList = async (rawRows: Array<Record<string, string>>, fileName?: string) => {
    let existingCodes = new Set<string>();
    try {
      const res = await apiService.get<{ data: Array<{ itemCode: string }> }>('/master-data/items', { page: 1, limit: 10000 });
      existingCodes = new Set((res.data || []).map((i) => i.itemCode.toUpperCase()));
    } catch {
      message.warning('Could not verify existing item codes before import.');
    }

    const seenCodes = new Set<string>();
    const validated: ImportRow[] = rawRows.map((data, idx) => {
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

    if (fileName) setImportFileName(fileName);
    setRawImportData(rawRows);
    setImportRows(validated);
    setImportSummary(null);
    setImportPage(1);

    const invalidCount = validated.filter((r) => r.status === 'INVALID').length;
    if (invalidCount > 0) {
      setShowErrorsFirst(true);
    }
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

    const rawRows = parsed.slice(1).map((cells) => {
      const data: Record<string, string> = {};
      header.forEach((h, i) => {
        const val = cells[i] ?? '';
        data[h] = val;
        data[h.toLowerCase().replace(/[\s_-]+/g, '')] = val;
      });
      return data;
    });

    await validateRowsList(rawRows, file.name);
    return false;
  };

  const revalidateImportRows = async () => {
    if (rawImportData.length === 0) {
      message.info('No import data to re-validate.');
      return;
    }
    message.loading({ content: 'Re-validating items against master data…', key: 'revalidate' });
    await validateRowsList(rawImportData);
    message.success({ content: 'Re-validation complete!', key: 'revalidate' });
  };

  const handleReuploadSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await handleImportFile(file);
    if (reuploadInputRef.current) {
      reuploadInputRef.current.value = '';
    }
  };

  const downloadErrorReport = () => {
    const problematic = importRows.filter((r) => r.status !== 'VALID');
    if (problematic.length === 0) {
      message.info('No errors or duplicates found!');
      return;
    }
    const headers = ['Row Number', 'Item Code', 'Item Name', 'Item Type', 'UOM Code', 'Status', 'Errors / Issues'];
    const rows = problematic.map((r) => [
      r.rowNumber,
      r.data['itemCode'] || '',
      r.data['name'] || '',
      r.data['itemType'] || '',
      r.data['uomCode'] || '',
      r.status,
      r.errors.join('; '),
    ]);
    const csvContent = toCsv(headers, rows);
    const baseName = importFileName ? importFileName.replace(/\.[^/.]+$/, '') : 'item-import';
    downloadText(`${baseName}-error-report.csv`, csvContent);
    message.success(`Downloaded error report for ${problematic.length} row(s)`);
  };

  const filteredImportRows = useMemo(() => {
    let list = [...importRows];
    if (importFilter === 'INVALID') {
      list = list.filter((r) => r.status === 'INVALID');
    } else if (importFilter === 'DUPLICATE') {
      list = list.filter((r) => r.status === 'DUPLICATE');
    } else if (importFilter === 'VALID') {
      list = list.filter((r) => r.status === 'VALID');
    }

    if (showErrorsFirst && importFilter === 'ALL') {
      list.sort((a, b) => {
        const order = { INVALID: 0, DUPLICATE: 1, VALID: 2 };
        const diff = (order[a.status] ?? 2) - (order[b.status] ?? 2);
        if (diff !== 0) return diff;
        return a.rowNumber - b.rowNumber;
      });
    }
    return list;
  }, [importRows, importFilter, showErrorsFirst]);

  const formatRemainingTime = (secs: number): string => {
    if (secs <= 0 || !isFinite(secs)) return 'Almost done…';
    if (secs < 60) return `${secs}s`;
    const mins = Math.floor(secs / 60);
    const remSecs = secs % 60;
    return `${mins}m ${remSecs}s`;
  };

  const runImport = async () => {
    const validRows = importRows.filter((r) => r.status === 'VALID');
    if (validRows.length === 0) return;
    setImporting(true);
    setLiveImportedItems([]);
    setLiveFailedItems([]);

    let imported = 0;
    let failed = 0;
    const errors: string[] = [];
    const totalCount = validRows.length;
    const startTime = Date.now();

    // Set initial 0% progress
    setImportProgress({
      current: 0,
      total: totalCount,
      percent: 0,
      currentCode: (validRows[0]?.payload?.itemCode as string) || (validRows[0]?.data?.['itemCode'] as string) || '',
      successCount: 0,
      failCount: 0,
      speed: 0,
      estimatedSecondsRemaining: 0,
    });

    const BATCH_SIZE = 50;

    for (let i = 0; i < validRows.length; i += BATCH_SIZE) {
      const chunk = validRows.slice(i, i + BATCH_SIZE);
      const chunkPayloads = chunk.map((r) => r.payload).filter(Boolean);

      try {
        const res = await apiService.post<any>('/master-data/items/bulk', { items: chunkPayloads, companyId });
        const batchData = res?.data?.data || res?.data || {};
        const batchResults: any[] = Array.isArray(batchData?.results) ? batchData.results : [];

        const newImported: Array<{ rowNumber: number; itemCode: string; name: string; itemType?: string; division?: string }> = [];
        const newFailed: Array<{ rowNumber: number; itemCode: string; reason: string }> = [];

        chunk.forEach((row, idxInChunk) => {
          const resItem = batchResults[idxInChunk] || batchResults.find((b: any) => b.itemCode === (row.payload?.itemCode || row.data['itemCode']));
          if (!resItem || resItem.status === 'SUCCESS') {
            imported += 1;
            newImported.push({
              rowNumber: row.rowNumber,
              itemCode: (row.payload?.itemCode as string) || row.data['itemCode'] || '',
              name: (row.payload?.name as string) || row.data['name'] || '',
              itemType: (row.payload?.itemType as string) || row.data['itemType'] || '',
              division: (row.data['divisionCodeOrName'] as string) || '',
            });
          } else {
            failed += 1;
            const errMsg = resItem.message || 'Import failed';
            errors.push(`Row ${row.rowNumber} (${resItem.itemCode}): ${errMsg}`);
            newFailed.push({
              rowNumber: row.rowNumber,
              itemCode: resItem.itemCode || row.data['itemCode'] || '',
              reason: errMsg,
            });
          }
        });

        if (newImported.length > 0) {
          setLiveImportedItems((prev) => [...newImported, ...prev].slice(0, 150));
        }
        if (newFailed.length > 0) {
          setLiveFailedItems((prev) => [...newFailed, ...prev]);
        }
      } catch (err: any) {
        // Fallback: if bulk endpoint errors, try individual requests for this batch
        for (const row of chunk) {
          try {
            await apiService.post('/master-data/items', row.payload);
            imported += 1;
            setLiveImportedItems((prev) => [
              {
                rowNumber: row.rowNumber,
                itemCode: (row.payload?.itemCode as string) || row.data['itemCode'] || '',
                name: (row.payload?.name as string) || row.data['name'] || '',
                itemType: (row.payload?.itemType as string) || row.data['itemType'] || '',
                division: (row.data['divisionCodeOrName'] as string) || '',
              },
              ...prev,
            ].slice(0, 150));
          } catch (singleErr: any) {
            failed += 1;
            const errMsg = singleErr?.response?.data?.message || 'failed';
            errors.push(`Row ${row.rowNumber} (${row.data['itemCode']}): ${errMsg}`);
            setLiveFailedItems((prev) => [
              {
                rowNumber: row.rowNumber,
                itemCode: (row.payload?.itemCode as string) || row.data['itemCode'] || '',
                reason: errMsg,
              },
              ...prev,
            ]);
          }
        }
      }

      const processed = Math.min(i + BATCH_SIZE, totalCount);
      const elapsedSec = Math.max((Date.now() - startTime) / 1000, 0.05);
      const currentSpeed = Math.max(1, Math.round(processed / elapsedSec));
      const remainingItems = totalCount - processed;
      const estSec = Math.max(0, Math.round(remainingItems / currentSpeed));
      const percent = Math.min(100, Math.floor((processed / totalCount) * 100));

      const lastRow = chunk[chunk.length - 1];
      setImportProgress({
        current: processed,
        total: totalCount,
        percent,
        currentCode: (lastRow?.payload?.itemCode as string) || (lastRow?.data?.['itemCode'] as string) || '',
        successCount: imported,
        failCount: failed,
        speed: currentSpeed,
        estimatedSecondsRemaining: estSec,
      });
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
    setIsImportMinimized(false);
    setImportRows([]);
    setRawImportData([]);
    setImportSummary(null);
    setImportProgress(null);
    setImportFileName(null);
    setImportFilter('ALL');
    setImportPage(1);
    setLiveImportedItems([]);
    setLiveFailedItems([]);
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
      title: <HeaderCell icon={<TagOutlined />} first="Item" second="Code" />,
      dataIndex: 'itemCode',
      key: 'itemCode',
      width: 85,
      fixed: screens.md ? 'left' : undefined,
      sorter: true,
      render: (v: string, r: Item) => (
        <Button
          type="link"
          size="small"
          style={{ padding: 0, height: 'auto', fontSize: 12, fontWeight: 700, color: 'var(--theme-accent, var(--theme-primary, #10b981))' }}
          onClick={() => openDetail(r)}
          aria-label={`View item ${v}`}
        >
          {v}
        </Button>
      ),
    },
    {
      title: <HeaderCell icon={<AppstoreOutlined />} first="Item" second="Name" />,
      dataIndex: 'name',
      key: 'name',
      width: 140,
      sorter: true,
      render: (_: unknown, r: Item) => (
        <Tooltip title={r.name}>
          <div style={{ lineHeight: 1.25 }}>
            <div style={{ fontSize: 12, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 135 }}>
              {r.name}
            </div>
            {r.shortName && (
              <Text type="secondary" style={{ fontSize: 10.5, lineHeight: 1.1, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 135 }}>
                {r.shortName}
              </Text>
            )}
          </div>
        </Tooltip>
      ),
    },
    {
      title: <HeaderCell icon={<ApartmentOutlined />} first="Division /" second="Section" />,
      key: 'divisionSection',
      width: 105,
      render: (_: unknown, r: Item) => {
        const d = divisionName(r);
        const s = sectionName(r);
        return (
          <div style={{ lineHeight: 1.25 }}>
            <div style={{ fontSize: 12, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 100 }}>
              {d ?? <Text type="secondary">—</Text>}
            </div>
            <Text type="secondary" style={{ fontSize: 10.5, lineHeight: 1.1, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 100 }}>
              {s ?? '—'}
            </Text>
          </div>
        );
      },
    },
    {
      title: <HeaderCell icon={<FolderOutlined />} first="Dept" second="Name" />,
      key: 'department',
      width: 90,
      render: (_: unknown, r: Item) => {
        const d = departmentName(r);
        return d ? (
          <span style={{ fontSize: 11.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block', maxWidth: 85 }}>{d}</span>
        ) : <Text type="secondary">—</Text>;
      },
    },
    {
      title: <HeaderCell icon={<ToolOutlined />} first="Wire / Dia" second="Length" />,
      key: 'wireDiaLength',
      width: 85,
      align: 'right',
      sorter: (a: Item, b: Item) => (Number(a.diameterMm ?? a.wireSizeMm ?? 0) - Number(b.diameterMm ?? b.wireSizeMm ?? 0)),
      render: (_: unknown, r: Item) => {
        const dia = r.diameterMm != null ? r.diameterMm : r.wireSizeMm;
        const len = r.lengthPerPiece;
        const hasDia = dia !== null && dia !== undefined;
        const hasLen = len !== null && len !== undefined;
        if (!hasDia && !hasLen) return <Text type="secondary">—</Text>;
        return (
          <div style={{ lineHeight: 1.25, textAlign: 'right' }}>
            {hasDia && (
              <Text strong style={{ fontSize: 11.5, display: 'block', color: 'var(--theme-accent, var(--theme-primary, #10b981))' }}>
                {formatDimension(dia)}
              </Text>
            )}
            {hasLen && (
              <Text type="secondary" style={{ fontSize: 10, lineHeight: 1.1, display: 'block' }}>
                L: {formatDimension(len)}
              </Text>
            )}
          </div>
        );
      },
    },
    {
      title: <HeaderCell icon={<BuildOutlined />} first="Flat Spec" second="(mm)" />,
      key: 'flatSpec',
      width: 80,
      align: 'right',
      render: (_: unknown, r: Item) => {
        const t = r.thicknessMm;
        const w = r.widthMm;
        if (t != null && w != null) {
          return (
            <div style={{ lineHeight: 1.2, textAlign: 'right' }}>
              <div style={{ fontSize: 11 }}>T: {formatDimension(t)}</div>
              <Text type="secondary" style={{ fontSize: 10 }}>W: {formatDimension(w)}</Text>
            </div>
          );
        }
        if (t != null) return <Text style={{ fontSize: 11 }}>T: {formatDimension(t)}</Text>;
        if (w != null) return <Text style={{ fontSize: 11 }}>W: {formatDimension(w)}</Text>;
        return <Text type="secondary">—</Text>;
      },
    },
    {
      title: <HeaderCell icon={<ProjectOutlined />} first="Item" second="Type" />,
      dataIndex: 'itemType',
      key: 'itemType',
      width: 85,
      render: (v: string) => {
        const label = typeName(v);
        const parts = label.split(' ');
        if (parts.length === 2) {
          return (
            <Tag style={{ marginInlineEnd: 0, padding: '1px 4px', fontSize: 10, lineHeight: 1.2, textAlign: 'center' }}>
              <div>{parts[0]}</div>
              <div>{parts[1]}</div>
            </Tag>
          );
        }
        return <Tag style={{ marginInlineEnd: 0, padding: '1px 5px', fontSize: 10.5 }}>{label}</Tag>;
      },
    },
    {
      title: <HeaderCell icon={<TagsOutlined />} first="Material" second="Role / Use" />,
      dataIndex: 'materialRoleUsage',
      key: 'materialRoleUsage',
      width: 105,
      sorter: true,
      render: (v: string | null | undefined, r: Item) => {
        const isRaw = (r.itemType || '').toUpperCase().includes('RAW') || (typeName(r.itemType) || '').toUpperCase().includes('RAW');
        const role = v || (isRaw ? 'Process Component Materials' : null);
        if (role) {
          if (role === 'Process Component Materials') {
            return (
              <Tag color="cyan" style={{ marginInlineEnd: 0, padding: '1px 4px', fontSize: 10, lineHeight: 1.2, fontWeight: 600, borderRadius: 4, textAlign: 'center' }}>
                <div>Process Comp.</div>
                <div>Materials</div>
              </Tag>
            );
          }
          return (
            <Tag color="cyan" style={{ marginInlineEnd: 0, padding: '1px 5px', fontSize: 10.5, fontWeight: 600, borderRadius: 4 }}>
              {role}
            </Tag>
          );
        }
        return <Text type="secondary">—</Text>;
      },
    },
    {
      title: <HeaderCell icon={<ArrowRightOutlined />} first="Route" second="Type" />,
      dataIndex: 'routeType',
      key: 'routeType',
      width: 85,
      sorter: true,
      render: (v: string | null, r: Item) => {
        const label = routeTypeLabel(r);
        if (!label) return <Text type="secondary">—</Text>;
        const parts = label.split(' ');
        if (parts.length >= 2) {
          return (
            <div style={{ fontSize: 11, lineHeight: 1.2 }}>
              <div style={{ fontWeight: 600 }}>{parts[0]}</div>
              <div style={{ color: 'var(--theme-text-secondary)', fontSize: 10 }}>{parts.slice(1).join(' ')}</div>
            </div>
          );
        }
        return <span style={{ fontSize: 11.5 }}>{label}</span>;
      },
    },
    {
      title: <HeaderCell icon={<DatabaseOutlined />} first="UOM /" second="Conv" />,
      key: 'uom',
      width: 80,
      render: (_: unknown, r: Item) => (
        <div style={{ lineHeight: 1.25 }}>
          <div style={{ fontSize: 11.5, fontWeight: 600 }}>{r.baseUomName ?? '—'}</div>
          {convChips(r).length > 0 && (
            <Text type="secondary" style={{ fontSize: 10, lineHeight: 1.1, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {convChips(r)[0]}
            </Text>
          )}
        </div>
      ),
    },
    {
      title: <HeaderCell icon={<CheckCircleOutlined />} first="Item" second="Status" />,
      dataIndex: 'status',
      key: 'status',
      width: 75,
      sorter: true,
      render: (s: string) => (
        <StatusBadge status={s} colorMap={statusColorMap} style={{ minWidth: 55, fontSize: 10.5, padding: '1px 4px', textAlign: 'center' }} />
      ),
    },
    {
      title: <HeaderCell first="Row" second="Actions" />,
      key: 'actions',
      width: 90,
      fixed: screens.md ? 'right' : undefined,
      align: 'center',
      render: (_: unknown, record: Item) => {
        const moreItems: MenuProps['items'] = [
          ...(can('item.view') ? [{
            key: 'history',
            icon: <HistoryOutlined />,
            label: 'View History',
            onClick: () => openHistory(record),
          }] : []),
          ...(can('item_barcode.view') ? [{
            key: 'barcode',
            icon: <DatabaseOutlined />,
            label: 'Barcode & QR',
            onClick: () => openBarcodeModal(record),
          }] : []),
          ...(record.status === 'ACTIVE'
            ? (can('item.deactivate') ? [{
                key: 'deactivate',
                icon: <PauseCircleOutlined />,
                label: 'Deactivate',
                onClick: () => handleStatusChange(record, 'deactivate'),
              }] : [])
            : (can('item.activate') ? [{
                key: 'activate',
                icon: <PlayCircleOutlined />,
                label: 'Activate',
                onClick: () => handleStatusChange(record, 'activate'),
              }] : [])
          ),
          ...(can('item.delete') ? [
            { type: 'divider' as const },
            {
              key: 'delete',
              icon: <DeleteOutlined />,
              danger: true,
              label: 'Delete Item',
              onClick: () => {
                setDeleteTargetItem(record);
                setDeleteModalVisible(true);
              },
            }
          ] : []),
        ];

        return (
          <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 3 }}>
            {can('item.view') && (
              <Tooltip title="View">
                <span style={{ display: 'inline-flex' }}>
                  <Button
                    type="text"
                    size="small"
                    icon={<EyeOutlined />}
                    onClick={() => openDetail(record)}
                    className="erp-action-btn erp-action-btn--view"
                    aria-label={`View ${record.itemCode}`}
                  />
                </span>
              </Tooltip>
            )}
            {can('item.update') && (
              <Tooltip title="Edit">
                <span style={{ display: 'inline-flex' }}>
                  <Button
                    type="text"
                    size="small"
                    icon={<EditOutlined />}
                    onClick={() => openEdit(record)}
                    className="erp-action-btn erp-action-btn--edit"
                    aria-label={`Edit ${record.itemCode}`}
                  />
                </span>
              </Tooltip>
            )}
            {moreItems.length > 0 && (
              <Tooltip title="More Actions">
                <span style={{ display: 'inline-flex' }}>
                  <Dropdown menu={{ items: moreItems }} trigger={['click']}>
                    <Button
                      type="text"
                      size="small"
                      icon={<MoreOutlined />}
                      className="erp-action-btn"
                      aria-label={`More actions for ${record.itemCode}`}
                    />
                  </Dropdown>
                </span>
              </Tooltip>
            )}
          </div>
        );
      },
    },
  ];

  const filteredColumns = useMemo(() => {
    return columns.filter((col) => {
      const key = String(col.key || '');
      if (key === 'actions' || key === 'itemCode') return true;
      return visibleCols[key] !== false;
    });
  }, [columns, visibleCols]);

  const detailDesc = (itemsSpec: Array<{ label: string; children: React.ReactNode }>) => (
    <Descriptions
      size="small"
      column={{ xs: 1, sm: 1, md: 2, lg: 2, xl: 2 }}
      layout={!screens.md ? 'vertical' : 'horizontal'}
      styles={{
        label: { width: !screens.md ? '100%' : 140, fontWeight: 600, paddingBottom: !screens.md ? 2 : undefined },
        content: { width: '100%', wordBreak: 'break-word', whiteSpace: 'normal' },
      }}
    >
      {itemsSpec.map((s) => (
        <Descriptions.Item key={s.label} label={s.label}>
          <div style={{ wordBreak: 'break-word', whiteSpace: 'normal', minWidth: 0, width: '100%' }}>
            {s.children ?? <Text type="secondary">—</Text>}
          </div>
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
    <TabKeepAlive
      tabId={MASTER_PRODUCTS_ITEMS_TAB_ID}
      load={async () => { await fetchItems(); }}
      serialize={() => ({ items, total, stats, typeCounts, uoms, categories, divisions, sections, departments, routeTypes, masterItemTypes, filterState: { fDivision, fSection, fDepartment, fCategory, fItemType, fRoleUsage, fRouteType, fStatus, search, searchInput, page, pageSize, sortField, sortOrder, activeTab, showFilters } })}
    >
      <div style={{ padding: '4px 6px', width: '100%' }}>
      <PageHeader
        icon={<AppstoreOutlined />}
        title={
          <Space align="center" size={10}>
            <span>Products & Items</span>
            <span className="item-model-badge">Enterprise 2027</span>
          </Space>
        }
        subtitle="Manage your item master data — raw materials, finished goods, and production items"
        showBreadcrumbs
        style={{ marginBottom: 8 }}
        extra={
          <>
            {can('item.create') && (
              <Button
                size="middle"
                className="erp-toolbar-action-btn"
                icon={<PlusOutlined />}
                onClick={openCreate}
                style={{ fontWeight: 600, flexShrink: 0, whiteSpace: 'nowrap' }}
              >
                Add Item
              </Button>
            )}
            <Tooltip title="Refresh">
              <Button size="middle" className="erp-toolbar-action-btn" icon={<ReloadOutlined />} onClick={() => fetchItems()} />
            </Tooltip>
            {can('item.view') && (
              <Button size="middle" className="erp-toolbar-action-btn" icon={<ScanOutlined />} onClick={() => setScannerOpen(true)}>
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
                <Button size="middle" className="erp-toolbar-action-btn" icon={<DownloadOutlined />} loading={exporting}>Export</Button>
              </Dropdown>
            )}
            {can('item.view') && (
              <Button size="middle" className="erp-toolbar-action-btn" icon={<FilePdfOutlined />} loading={pdfing} onClick={handlePdf}>PDF</Button>
            )}
            {can('item.view') && (
              <Button size="middle" className="erp-toolbar-action-btn" icon={<PrinterOutlined />} loading={printing} onClick={handlePrint}>Print</Button>
            )}
            {can('item.create') && (
              <Button size="middle" className="erp-toolbar-action-btn" icon={<ImportOutlined />} onClick={() => { setImportOpen(true); setImportRows([]); setImportSummary(null); setImportFileName(null); }}>
                Import
              </Button>
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
        <KpiCard
          testId="kpi-total"
          label="Total Items"
          value={stats.total ?? total}
          icon={AppstoreOutlined}
          tone="var(--theme-accent, var(--theme-primary))"
          toneSoft="var(--theme-accent-soft)"
        />
        <KpiCard
          testId="kpi-active"
          label="Active"
          value={stats.active ?? items.filter((i) => i.status === 'ACTIVE').length}
          icon={CheckCircleOutlined}
          tone="var(--theme-success)"
          toneSoft="var(--theme-success-soft)"
        />
        <KpiCard
          testId="kpi-inactive"
          label="Inactive"
          value={stats.inactive ?? items.filter((i) => i.status === 'INACTIVE').length}
          icon={CloseCircleOutlined}
          tone="var(--theme-danger)"
          toneSoft="var(--theme-danger-soft)"
        />
        <KpiCard
          testId="kpi-stock"
          label="Stock Items"
          value={stats.stock ?? items.filter((i) => i.isStockItem).length}
          icon={InboxOutlined}
          tone="var(--theme-accent, var(--theme-primary))"
          toneSoft="var(--theme-accent-soft)"
        />
        <KpiCard
          testId="kpi-manufactured"
          label="Manufactured"
          value={stats.manufactured ?? items.filter((i) => i.isManufacturable).length}
          icon={BuildOutlined}
          tone="var(--theme-warning)"
          toneSoft="var(--theme-warning-soft)"
        />
      </div>

      <Card style={{ marginBottom: 12, borderRadius: 8 }} styles={{ body: { padding: '10px 12px 12px' } }}>
        {/* 2027 Status & Type Chevron Pipeline Ribbon (Dynamic per Division/Department) */}
        <ItemStatusChevronRibbon
          chevrons={dynamicChevrons}
          activeKey={activeChevronKey}
          onSelect={handleItemChevronSelect}
        />

        {/* Main Filter Toolbar matching Machine Master */}
        <div
          style={{
            display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center',
            paddingTop: 8, borderTop: '1px solid var(--theme-border)',
          }}
        >
          <Input
            allowClear
            prefix={<SearchOutlined style={{ color: 'var(--theme-text-muted)' }} />}
            placeholder="Search Item Register (code, name, SKU, barcode)..."
            style={{
              flex: screens.md ? '1 1 280px' : '1 1 100%',
              flexBasis: screens.md ? '280px' : '100%',
              maxWidth: screens.md ? 450 : '100%',
            }}
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />

          <Select
            allowClear showSearch optionFilterProp="label" placeholder="All Divisions"
            style={{ width: 160 }}
            value={fDivision}
            options={toUnique(divisions, (d) => d.name)}
            onChange={(v) => { setFDivision(v); setFSection(undefined); setFDepartment(undefined); setPage(1); }}
          />

          <Select
            allowClear showSearch optionFilterProp="label" placeholder="All Categories"
            style={{ width: 160 }}
            value={fCategory}
            options={toUnique(flatCategories, (c) => c.name)}
            onChange={(v) => { setFCategory(v); setPage(1); }}
          />

          <Badge count={activeFilterCount} size="small">
            <Button
              icon={<FilterOutlined />}
              onClick={() => setShowFilters((v) => !v)}
              style={{
                background: showFilters ? '#eff6ff' : undefined,
                borderColor: showFilters ? '#3b82f6' : undefined,
                color: showFilters ? '#1d4ed8' : undefined,
                fontWeight: 600,
              }}
            >
              More Filters
            </Button>
          </Badge>

          <div style={{ flex: 1 }} />

          {/* Columns Toggle Dropdown (Machine Master 2027 style) */}
          <Dropdown
            trigger={['click']}
            placement="bottomRight"
            popupRender={() => (
              <div
                style={{
                  background: '#ffffff',
                  padding: '12px 16px',
                  borderRadius: 8,
                  boxShadow: '0 10px 30px rgba(0, 0, 0, 0.15)',
                  minWidth: 200,
                  border: '1px solid #e2e8f0',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: 10,
                    paddingBottom: 8,
                    borderBottom: '1px solid #f1f5f9',
                  }}
                >
                  <span style={{ fontWeight: 700, fontSize: 13, color: '#1e293b' }}>
                    Table Columns
                  </span>
                  <Button
                    type="link"
                    size="small"
                    style={{ padding: 0, height: 'auto', fontSize: 11 }}
                    onClick={() => {
                      setVisibleCols(DEFAULT_ITEM_VISIBLE_COLUMNS);
                      try {
                        localStorage.removeItem('pwi_item_table_columns_v2');
                        localStorage.removeItem('pwi_item_table_columns_v1');
                      } catch {}
                    }}
                  >
                    Reset All
                  </Button>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {Object.entries(ITEM_COLUMN_LABELS).map(([key, label]) => (
                    <Checkbox
                      key={key}
                      checked={visibleCols[key] !== false}
                      disabled={key === 'itemCode' || key === 'actions'}
                      onChange={(e) => {
                        const next = { ...visibleCols, [key]: e.target.checked };
                        setVisibleCols(next);
                        try {
                          localStorage.setItem('pwi_item_table_columns_v2', JSON.stringify(next));
                        } catch {}
                      }}
                      style={{ fontSize: 13, color: '#334155' }}
                    >
                      {label}
                    </Checkbox>
                  ))}
                </div>
              </div>
            )}
          >
            <Button icon={<AppstoreOutlined />} style={{ fontWeight: 600 }}>
              Columns
            </Button>
          </Dropdown>

          <Button icon={<ClearOutlined />} onClick={resetFilters}>
            Reset
          </Button>

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
              gap: 8, padding: '10px 0 2px', borderTop: '1px solid var(--theme-border)',
              marginTop: 10,
            }}
          >
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
              allowClear showSearch optionFilterProp="label" placeholder="Route Type"
              value={fRouteType}
              loading={routeTypesState === 'loading'}
              options={toUnique(routeTypes, (rt) => rt.name?.trim() ? rt.name : rt.routeCode)}
              onChange={(v) => { setFRouteType(v); setPage(1); }}
            />
            <Select
              allowClear showSearch optionFilterProp="label" placeholder="Material Role / Usage"
              value={fRoleUsage}
              options={[
                { value: 'Process Component Materials', label: 'Process Component Materials' },
              ]}
              onChange={(v) => { setFRoleUsage(v); setPage(1); }}
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

      {loading && items.length === 0 ? (
        <GlobalLoading
          title="Loading Item Registry..."
          subtitle="Fetching 3,833 wire products and master items..."
          badgeText="LIVE DATABASE QUERY"
          minHeight={450}
        />
      ) : (
        <ERPTable
          rowKey="id"
          columns={filteredColumns}
          dataSource={items}
          loading={false}
          scroll={{ x: 1045, y: 'calc(100vh - 350px)' }}
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
      )}

      <DraggableResizableModal
        open={detailOpen && !isDetailMinimized}
        onCancel={() => { setDetailOpen(false); setIsDetailMinimized(false); }}
        onMinimize={() => setIsDetailMinimized(true)}
        width={screens.md ? 980 : '96vw'}
        height={screens.md ? 620 : 'auto'}
        wrapClassName="erp-mobile-modal erp-detail-mobile-modal"
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
              <Tag style={{ marginInlineEnd: 0 }}>{typeName(detailItem.itemType)}</Tag>
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
          <GlobalLoading title="Loading Item Details…" subtitle="Retrieving item master, stock and production route…" badgeText="LIVE DATABASE QUERY" minHeight={260} />
        ) : (
          <Tabs
            activeKey={detailTab}
            onChange={handleDetailTabChange}
            renderTabBar={() => (
              <ItemModalProcessChevronNav
                active={detailTab}
                onChange={handleDetailTabChange}
              />
            )}
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
                        { label: 'Item Type', children: txt(typeName(detailItem.itemType)) },
                        {
                          label: 'Material Role / Usage',
                          children: (
                            detailItem.materialRoleUsage || ((detailItem.itemType || '').toUpperCase().includes('RAW')) ? (
                              <Tag color="cyan" style={{ fontWeight: 600, borderRadius: 4 }}>
                                {detailItem.materialRoleUsage || 'Process Component Materials'}
                              </Tag>
                            ) : <Text type="secondary">—</Text>
                          ),
                        },
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
                            {f.value ? <CheckOutlined style={{ marginRight: 4 }} /> : <CloseOutlined style={{ marginRight: 4 }} />}
                            {f.label}
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
                                const typeLabel = (pi.itemType && typeName(pi.itemType)) || null;
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
                  <GlobalLoading title="Loading Item History…" subtitle="Retrieving item change history and audit trail…" badgeText="LIVE DATABASE QUERY" minHeight={220} />
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
        open={formOpen && !isFormMinimized}
        onCancel={() => { setFormOpen(false); setIsFormMinimized(false); }}
        onMinimize={() => setIsFormMinimized(true)}
        onOk={handleSubmit}
        confirmLoading={saving}
        width={screens.md ? (showLivePreview && screens.lg ? 1240 : 880) : '96vw'}
        height={screens.md ? 720 : 640}
        wrapClassName="erp-mobile-modal"
        okText={editing ? 'Save Changes' : 'Create Item'}
        title={
          <Space>
            {editing ? <EditOutlined /> : <FileAddOutlined />}
            {editing ? `Edit Item — ${editing.itemCode}` : 'Add New Item'}
          </Space>
        }
        extra={
          screens.lg && (
            <Button
              size="small"
              icon={<EyeOutlined />}
              onClick={() => setShowLivePreview((v) => !v)}
              style={{ fontSize: 12, marginRight: 8 }}
            >
              {showLivePreview ? 'Hide Live Preview' : 'Show Live Preview'}
            </Button>
          )
        }
        styles={{
          body: {
            maxHeight: screens.md ? 'calc(100vh - 180px)' : 'calc(100vh - 130px)',
            overflowY: 'auto',
            padding: screens.xs ? '8px 10px 80px' : '16px 20px',
          },
        }}
      >
        <Form form={form} layout="vertical" requiredMark="optional">
          <div className={`erp-item-split-layout ${showLivePreview && screens.lg ? 'with-preview' : 'form-only'}`}>
            <div className="erp-item-form-pane">
              {/* SECTION 1 — ORGANIZATION (TOP) */}
              <Card
                size="small"
                title={
                  <Space>
                    <ApartmentOutlined style={{ color: '#0284c7' }} />
                    <span style={{ fontWeight: 600 }}>Section 1 — Organization</span>
                  </Space>
                }
                style={{ marginBottom: 12, borderRadius: 8 }}
              >
                <div className="erp-form-responsive-grid">
                  <Form.Item
                    name="divisionId"
                    label={<span style={{ fontWeight: 600 }}>Division</span>}
                    extra="Selecting a division automatically sets the Item Code prefix (e.g. CCD-, MD-, SPI-, NB-)"
                  >
                    <Select
                      size={screens.xs ? 'large' : 'middle'}
                      allowClear
                      showSearch
                      optionFilterProp="label"
                      placeholder="Select division (e.g. Control Cable Division)"
                      options={toUnique(divisions, (d) => d.name)}
                      onChange={handleDivisionChange}
                    />
                  </Form.Item>

                  <Form.Item noStyle shouldUpdate={(p, c) => p.divisionId !== c.divisionId}>
                    {({ getFieldValue }) => (
                      <Form.Item
                        name="sectionId"
                        label={<span style={{ fontWeight: 600 }}>Section</span>}
                      >
                        <Select
                          size={screens.xs ? 'large' : 'middle'}
                          allowClear
                          showSearch
                          optionFilterProp="label"
                          placeholder="Select section"
                          disabled={!getFieldValue('divisionId')}
                          options={toUnique(sectionsForDivision(getFieldValue('divisionId')), (s) => s.name)}
                          onChange={handleSectionChange}
                        />
                      </Form.Item>
                    )}
                  </Form.Item>

                  <Form.Item noStyle shouldUpdate={(p, c) => p.sectionId !== c.sectionId || p.divisionId !== c.divisionId}>
                    {({ getFieldValue }) => (
                      <Form.Item
                        name="departmentId"
                        label={<span style={{ fontWeight: 600 }}>Department</span>}
                      >
                        <Select
                          size={screens.xs ? 'large' : 'middle'}
                          allowClear
                          showSearch
                          optionFilterProp="label"
                          placeholder="Select department"
                          disabled={!getFieldValue('sectionId')}
                          options={toUnique(departmentsForSection(getFieldValue('divisionId'), getFieldValue('sectionId')), (d) => d.name)}
                          onChange={handleDepartmentChange}
                        />
                      </Form.Item>
                    )}
                  </Form.Item>
                </div>
              </Card>

              {/* SECTION 2 — BASIC INFORMATION */}
              <Card
                size="small"
                title={
                  <Space>
                    <FileTextOutlined style={{ color: '#10b981' }} />
                    <span style={{ fontWeight: 600 }}>Section 2 — Basic Information</span>
                  </Space>
                }
                style={{ marginBottom: 12, borderRadius: 8 }}
              >
                <div className="erp-form-responsive-grid">
                  <Form.Item noStyle shouldUpdate={(p, c) => p.divisionId !== c.divisionId}>
                    {({ getFieldValue }) => {
                      const divId = getFieldValue('divisionId');
                      const selDiv = divisions.find((d) => d.id === divId);
                      const prefix = getDivisionPrefix(selDiv?.name || selDiv?.divisionCode);
                      return (
                        <Form.Item
                          name="itemCode"
                          label={
                            <Space>
                              <span style={{ fontWeight: 600 }}>Item Code</span>
                              {prefix ? (
                                <Tag color="blue" style={{ fontWeight: 700, borderRadius: 4 }}>
                                  Prefix: {prefix}-
                                </Tag>
                              ) : null}
                            </Space>
                          }
                          rules={[
                            { required: true, message: 'Item Code is required' },
                            { pattern: /^[A-Z0-9_-]+$/, message: 'Uppercase letters, numbers, hyphens and underscores only' },
                          ]}
                          extra={
                            editing
                              ? 'Item Code cannot be changed'
                              : prefix
                              ? `Division selected: Code prefix "${prefix}-" will be applied automatically (e.g. typing 114011 becomes ${prefix}-114011)`
                              : 'e.g. CCD-114011, MD-114011, SPI-114011, NB-175198 (select Division above to auto-prefix)'
                          }
                        >
                          <Input
                            size={screens.xs ? 'large' : 'middle'}
                            disabled={!!editing}
                            placeholder={prefix ? `e.g. ${prefix}-114011` : 'e.g. CCD-114011'}
                            maxLength={50}
                            style={{ fontWeight: 600 }}
                            onBlur={(e) => {
                              if (editing) return;
                              if (prefix && e.target.value) {
                                form.setFieldValue('itemCode', formatItemCodeWithDivisionPrefix(e.target.value, prefix));
                              }
                            }}
                          />
                        </Form.Item>
                      );
                    }}
                  </Form.Item>

                  <Form.Item
                    name="name"
                    label={<span style={{ fontWeight: 600 }}>Item Name</span>}
                    rules={[{ required: true, message: 'Item Name is required' }]}
                  >
                    <Input size={screens.xs ? 'large' : 'middle'} placeholder="e.g. Copper Wire 2.00 mm" maxLength={255} />
                  </Form.Item>

                  <Form.Item
                    name="shortName"
                    label={<span style={{ fontWeight: 600 }}>Short Name</span>}
                  >
                    <Input size={screens.xs ? 'large' : 'middle'} maxLength={100} placeholder="e.g. Cu Wire 2mm" />
                  </Form.Item>

                  <Form.Item
                    name="description"
                    label={<span style={{ fontWeight: 600 }}>Description</span>}
                    style={{ gridColumn: '1 / -1' }}
                  >
                    <Input.TextArea
                      rows={2}
                      maxLength={1000}
                      placeholder="e.g. Demo raw material received from another manufacturing unit"
                    />
                  </Form.Item>
                </div>
              </Card>

              {/* SECTION 3 — CLASSIFICATION */}
              <Card
                size="small"
                title={
                  <Space>
                    <AppstoreOutlined style={{ color: '#8b5cf6' }} />
                    <span style={{ fontWeight: 600 }}>Section 3 — Classification</span>
                  </Space>
                }
                style={{ marginBottom: 12, borderRadius: 8 }}
              >
                <div className="erp-form-responsive-grid">
                  <Form.Item
                    name="itemType"
                    label={<span style={{ fontWeight: 600 }}>Item Type</span>}
                    rules={[{ required: true, message: 'Item Type is required' }]}
                  >
                    <Select
                      size={screens.xs ? 'large' : 'middle'}
                      showSearch optionFilterProp="label"
                      loading={masterTypesState === 'loading'}
                      status={masterTypesState === 'error' ? 'error' : undefined}
                      notFoundContent={masterTypesState === 'error' ? 'Item types could not be loaded' : 'No item types'}
                      options={displayTypes.map((o) => ({
                        ...o,
                        disabled: o.status === 'INACTIVE' && o.value !== (editing?.itemType ?? null),
                      }))}
                      placeholder="Select item type"
                      onChange={(val) => {
                        const isRaw = val === 'RAW_MATERIAL' || String(val || '').toUpperCase().includes('RAW');
                        if (isRaw && autoFillMaterialRole) {
                          form.setFieldValue('materialRoleUsage', 'Process Component Materials');
                        }
                      }}
                    />
                  </Form.Item>
                  <Form.Item noStyle shouldUpdate={(prev, cur) => prev.itemType !== cur.itemType}>
                    {({ getFieldValue }) => {
                      const currentType = getFieldValue('itemType');
                      const isRaw = currentType === 'RAW_MATERIAL' || String(currentType || '').toUpperCase().includes('RAW');
                      return (
                        <Form.Item
                          name="materialRoleUsage"
                          label={
                            <Space size={6}>
                              <span style={{ fontWeight: 600 }}>Material Role / Usage</span>
                              <span style={{ color: '#94a3b8', fontSize: 12, fontWeight: 400 }}>(optional)</span>
                            </Space>
                          }
                          extra={
                            <div style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                              <Checkbox
                                checked={autoFillMaterialRole}
                                onChange={(e) => {
                                  const checked = e.target.checked;
                                  setAutoFillMaterialRole(checked);
                                  if (checked) {
                                    form.setFieldValue('materialRoleUsage', 'Process Component Materials');
                                  }
                                }}
                                style={{ fontSize: 12 }}
                              >
                                <span style={{ color: autoFillMaterialRole ? '#2563eb' : '#64748b', fontWeight: autoFillMaterialRole ? 600 : 400 }}>
                                  Auto-fill for Raw Materials
                                </span>
                              </Checkbox>
                              {!autoFillMaterialRole && (
                                <Tag color="blue" style={{ fontSize: 10.5, margin: 0, padding: '0 6px', borderRadius: 4 }}>
                                  Manual Mode
                                </Tag>
                              )}
                            </div>
                          }
                        >
                          <Input
                            size={screens.xs ? 'large' : 'middle'}
                            placeholder={autoFillMaterialRole ? 'Auto-filled: Process Component Materials' : 'Enter manual material role / usage'}
                            maxLength={150}
                            disabled={autoFillMaterialRole}
                          />
                        </Form.Item>
                      );
                    }}
                  </Form.Item>
                  <Form.Item
                    name="categoryId"
                    label={<span style={{ fontWeight: 600 }}>Item Category</span>}
                  >
                    <Select
                      size={screens.xs ? 'large' : 'middle'}
                      allowClear showSearch optionFilterProp="label"
                      options={toUnique(flatCategories, (c) => c.name)}
                      placeholder="Select category"
                    />
                  </Form.Item>
                  <Form.Item
                    name="routeTypeId"
                    label={<span style={{ fontWeight: 600 }}>Route Type</span>}
                  >
                    <Select
                      size={screens.xs ? 'large' : 'middle'}
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

              {/* SECTION 4 — UOM & INVENTORY */}
              <Card
                size="small"
                title={
                  <Space>
                    <DatabaseOutlined style={{ color: '#d97706' }} />
                    <span style={{ fontWeight: 600 }}>Section 4 — UOM & Inventory</span>
                  </Space>
                }
                style={{ marginBottom: 12, borderRadius: 8 }}
              >
                <div className="erp-form-responsive-grid">
                  <Form.Item
                    name="baseUomId"
                    label={<span style={{ fontWeight: 600 }}>Base UOM</span>}
                    rules={[{ required: true, message: 'Base UOM is required' }]}
                  >
                    <Select
                      size={screens.xs ? 'large' : 'middle'}
                      showSearch optionFilterProp="label" placeholder="e.g. KG"
                      options={toUnique(uoms, (u) => `${u.name} (${u.code})`)}
                    />
                  </Form.Item>
                  <Form.Item
                    name="purchaseUomId"
                    label={<span style={{ fontWeight: 600 }}>Purchase UOM</span>}
                  >
                    <Select
                      size={screens.xs ? 'large' : 'middle'}
                      allowClear showSearch optionFilterProp="label" placeholder="Optional"
                      options={toUnique(uoms, (u) => `${u.name} (${u.code})`)}
                    />
                  </Form.Item>
                  <Form.Item
                    name="salesUomId"
                    label={<span style={{ fontWeight: 600 }}>Sales UOM</span>}
                  >
                    <Select
                      size={screens.xs ? 'large' : 'middle'}
                      allowClear showSearch optionFilterProp="label" placeholder="Optional"
                      options={toUnique(uoms, (u) => `${u.name} (${u.code})`)}
                    />
                  </Form.Item>
                  <Form.Item
                    name="weightPerPiece"
                    label={<span style={{ fontWeight: 600 }}>Weight per Piece (kg)</span>}
                    extra="Enables KG ↔ PCS"
                  >
                    <InputNumber size={screens.xs ? 'large' : 'middle'} min={0} step={0.000001} style={{ width: '100%' }} placeholder="e.g. 0.0555" />
                  </Form.Item>
                  <Form.Item
                    name="piecesPerKg"
                    label={<span style={{ fontWeight: 600 }}>Pieces per KG</span>}
                    extra="Manually maintained"
                  >
                    <InputNumber size={screens.xs ? 'large' : 'middle'} min={0} step={0.000001} style={{ width: '100%' }} placeholder="e.g. 18.02" />
                  </Form.Item>
                  <Form.Item
                    name="weightPerMeter"
                    label={<span style={{ fontWeight: 600 }}>Weight per Meter (kg/m)</span>}
                    extra="Enables KG ↔ METER"
                  >
                    <InputNumber size={screens.xs ? 'large' : 'middle'} min={0} step={0.000001} style={{ width: '100%' }} placeholder="Optional" />
                  </Form.Item>
                </div>
                <div style={{ marginTop: 4, fontSize: 11, color: '#64748b', display: 'flex', alignItems: 'center' }}>
                  <BulbOutlined style={{ color: '#eab308', marginRight: 6 }} /> Length is managed under&nbsp;<strong>Production Specifications</strong>&nbsp;below.
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

              <div className="erp-form-responsive-grid">
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
                {(fields, { add, remove, move }) => {
                  // TASK 15: route-row departments are the FULL org department list
                  // (no current-item section/division restriction). Item selector is
                  // scoped to the row's chosen Department via departmentId prop.
                  const setRowDept = (rowIdx: number, deptId: string | undefined) => {
                    const deptObj = departments.find((d) => d.id === deptId);
                    const divName = deptObj?.divisionId
                      ? divisions.find((d) => d.id === deptObj.divisionId)?.name ?? null
                      : null;
                    const secName = deptObj?.sectionId
                      ? sections.find((s) => s.id === deptObj.sectionId)?.name ?? null
                      : null;
                    const cur = form.getFieldValue('processes') || [];
                    const updated = Array.isArray(cur) ? [...cur] : [];
                    updated[rowIdx] = {
                      ...(updated[rowIdx] || {}),
                      departmentId: deptId ?? null,
                      departmentName: deptObj?.name ?? null,
                      divisionId: deptObj?.divisionId ?? null,
                      divisionName: divName,
                      sectionId: deptObj?.sectionId ?? null,
                      sectionName: secName,
                      name: deptObj?.name ?? null,
                    };
                    form.setFieldValue('processes', updated);
                  };
                  return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {fields.map((field, index) => {
                        const seqNumber = String(index + 1).padStart(2, '0');
                        const rowDeptId = form.getFieldValue(['processes', index, 'departmentId']) as string | undefined;
                        return (
                          <div
                            key={field.key}
                            className="erp-route-process-row"
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

                            {/* Operation name: hidden — auto-derived from Department,
                                backend also writes it on save so the preview resolves
                                the stage title immediately. */}
                            <Form.Item
                              {...field}
                              name={[field.name, 'name']}
                              style={{ display: 'none' }}
                            >
                              <Input type="hidden" />
                            </Form.Item>

                            {/* Hidden descriptive fields synced from the Department select */}
                            <Form.Item {...field} name={[field.name, 'departmentName']} style={{ display: 'none' }}>
                              <Input type="hidden" />
                            </Form.Item>
                            <Form.Item {...field} name={[field.name, 'divisionId']} style={{ display: 'none' }}>
                              <Input type="hidden" />
                            </Form.Item>
                            <Form.Item {...field} name={[field.name, 'divisionName']} style={{ display: 'none' }}>
                              <Input type="hidden" />
                            </Form.Item>
                            <Form.Item {...field} name={[field.name, 'sectionId']} style={{ display: 'none' }}>
                              <Input type="hidden" />
                            </Form.Item>
                            <Form.Item {...field} name={[field.name, 'sectionName']} style={{ display: 'none' }}>
                              <Input type="hidden" />
                            </Form.Item>

                            <Form.Item
                              {...field}
                              name={[field.name, 'departmentId']}
                              className="erp-route-dept-item"
                              style={{ marginBottom: 0, minWidth: 170, maxWidth: 190 }}
                            >
                              <Select
                                allowClear
                                showSearch
                                optionFilterProp="label"
                                placeholder="Department / Process"
                                options={departments.map((d) => ({ value: d.id, label: d.name }))}
                                onChange={(v?: string) => setRowDept(index, v ?? undefined)}
                              />
                            </Form.Item>

                            <Form.Item
                              {...field}
                              name={[field.name, 'outputItemId']}
                              className="erp-route-output-item"
                              rules={[{ required: true, message: 'Output Item is required' }]}
                              style={{ flex: 1, marginBottom: 0, minWidth: 180 }}
                            >
                              <InputMaterialSelect
                                compact
                                departmentId={rowDeptId ?? null}
                                excludeItemId={null}
                                placeholder={`Output Item of ${seqNumber}`}
                                ariaLabel={`Output Item of Step ${seqNumber}`}
                                testId={`route-output-${index}`}
                                onSelectDetail={(detail) => {
                                  const curId = form.getFieldValue(['processes', index, 'outputItemId']) as string | undefined;
                                  handleRouteItemDetail(curId, detail);
                                }}
                              />
                            </Form.Item>

                            <div className="erp-route-actions">
                              <Tooltip title="Move Up">
                                <Button
                                  type="text"
                                  size="small"
                                  icon={<ArrowUpOutlined />}
                                  disabled={index <= 0}
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

                              <Tooltip title="Remove Stage">
                                <Button
                                  type="text"
                                  danger
                                  size="small"
                                  icon={<DeleteOutlined />}
                                  onClick={() => remove(field.name)}
                                />
                              </Tooltip>
                            </div>
                          </div>
                        );
                      })}

                      <Button
                        type="dashed"
                        onClick={() => add({ sequence: fields.length + 1, name: '' })}
                        icon={<PlusOutlined />}
                        style={{ width: '100%', marginTop: 4 }}
                      >
                        + Add Stage
                      </Button>
                    </div>
                  );
                }}
              </Form.List>
            </div>

            <div style={{ height: 1, background: 'var(--theme-border, rgba(255, 255, 255, 0.08))', margin: '12px 0' }} />

            {/* 5C: OUTPUT / NEXT STEP */}
            <div>
              <Text strong style={{ display: 'block', fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--theme-accent, #0284c7)', marginBottom: 8 }}>
                Output / Next Step
              </Text>
              <div className="erp-form-responsive-grid">
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
            <div className="erp-form-responsive-grid">
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
                  const names = watchedProcesses
                    .map((p: any) => (typeof p === 'string' ? p.trim() : (p?.name ? String(p.name).trim() : '')))
                    .filter(Boolean);
                  // TASK 15: every configured stage IS a real operation — the
                  // top preview chips show all of them in sequence.
                  return names;
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
                if (dept?.name && dept.name.trim()) return dept.name.trim();
                return null;
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
                const dn = inputDeptName;
                if (dn && dn.trim()) return dn.trim();
                return null;
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

              const nextStepValid = !isEmptyValue(nextStepName) ? String(nextStepName).trim() : null;
              const finalProductValid = !isEmptyValue(finalProdName) ? String(finalProdName).trim() : null;

              // TASK 14: fully dynamic production flow preview — generates stages from the
              // SAME form data as the horizontal strip above (input item + processes + current
              // item). No hardcoded FLATTENING / SPIRAL — stage titles are resolved from the
              // actual operation texts verbatim via stageTitleForOperation().
              const currentPreviewItem: PreviewItem = {
                itemCode: currentPreviewCode,
                name: currentPreviewName,
                itemType: watchedItemType || editing?.itemType || null,
                departmentId: watchedDepartmentId || editing?.departmentId || null,
                departmentName: curDeptName,
                wireSizeMm: wireVal,
                diameterMm: diaVal,
                thicknessMm: thkVal,
                widthMm: widVal,
                lengthPerPiece: lenVal,
                baseUomName: editing?.baseUomName ?? null,
              };

              // TASK 15: configured Production Route rows (each = PROCESS/DEPARTMENT
              // + OUTPUT ITEM) are AUTHORITATIVE — ONE stage per row via
              // buildRouteFlow (mirrors the backend buildConfiguredRouteStages).
              // Fallback: TASK 14 dynamic chain (RAW_MATERIAL + process/output pairs
              // + tail steps) when the form has no configured route rows yet.
              const routeRows = normalizeRouteRows(watchedProcesses);
              const hasConfiguredRoute = routeRows.length > 0;
              const cycleIds = findRouteCycles(routeRows);

              const currentItemLookup: RouteStageSource = {
                id: editing?.id ?? null,
                itemCode: currentPreviewCode,
                itemName: currentPreviewName,
                name: currentPreviewName,
                itemType: watchedItemType || editing?.itemType || null,
                wireSizeMm: wireVal,
                diameterMm: diaVal,
                thicknessMm: thkVal,
                widthMm: widVal,
                lengthPerPiece: lenVal,
                baseUomName: editing?.baseUomName ?? null,
                departmentId: watchedDepartmentId || editing?.departmentId || null,
                departmentName: curDeptName,
              };
              const itemLookup = new Map<string, RouteStageSource | null>();
              for (const [k, v] of Object.entries(routeItemDetails)) {
                if (k && k !== editing?.id) itemLookup.set(k, v ?? null);
              }
              if (editing?.id) itemLookup.set(editing.id, currentItemLookup);

              let previewStages: ProductionFlowStage[] = [];

              if (hasConfiguredRoute) {
                previewStages = buildRouteFlow(routeRows, editing?.id ?? null, itemLookup).stages;
              } else {
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
                  itemNumber: sequence,
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
                  divisionId: null,
                  divisionName: null,
                  sectionId: null,
                  sectionName: null,
                  operationCode: op?.operationCode ?? null,
                  operationName: op?.operationName ?? null,
                  isCurrent: false,
                  configured: configuredOverride !== undefined ? configuredOverride : !!it,
                });

                // Legacy fallback: one RAW MATERIAL stage + a PROCESS + OUTPUT pair
                // per typed process; last output references the current item being
                // edited. No fixed six stages, no hardcoded op names.
                const legacyStages: ProductionFlowStage[] = [];
                let stepNo = 0;

                const pushStage = (
                  kind: 'process' | 'output',
                  stageKey: string,
                  title: string,
                  it: PreviewItem | null,
                  op?: { operationCode?: string | null; operationName?: string | null } | null,
                  configured?: boolean,
                ): void => {
                  stepNo += 1;
                  legacyStages.push(mkStage(stepNo, stageKey, title, kind, it, op ?? null, configured));
                };

                // Stage 1: RAW MATERIAL (input item or raw root)
                pushStage('process', 'RAW_MATERIAL', 'RAW MATERIAL', rawPreview, {
                  operationName: !isRawRoot ? inputOpName : null,
                });

                // Process + Output stages from typed processes
                if (modalProcesses.length > 0) {
                  modalProcesses.forEach((pName: string, pIdx: number) => {
                    const isLast = pIdx === modalProcesses.length - 1;
                    pushStage(
                      'process',
                      `OP_${pIdx + 1}`,
                      stageTitleForOperation(pName, 'process') ?? 'PRODUCTION STAGE',
                      null,
                      { operationName: pName },
                    );
                    pushStage(
                      'output',
                      `OUTPUT_${pIdx + 1}`,
                      stageTitleForOperation(pName, 'output') ?? 'OUTPUT',
                      isLast ? currentPreviewItem : null,
                    );
                  });
                } else {
                  // No typed processes — single current-operation stage
                  const opLabel = curOpName || curDeptName || null;
                  pushStage(
                    'process',
                    'OP_1',
                    stageTitleForOperation(opLabel, 'process') ?? 'PRODUCTION STAGE',
                    currentPreviewItem,
                    { operationName: opLabel },
                  );
                  pushStage('output', 'OUTPUT_1', stageTitleForOperation(opLabel, 'output') ?? 'OUTPUT', currentPreviewItem);
                }

                // Explicit Tail: Packing / Next Step + Final Product (real configured data)
                if (nextStepValid) {
                  pushStage('process', 'NEXT_STEP', stageTitleForOperation(nextStepValid, 'process') ?? nextStepValid.toUpperCase(), currentPreviewItem, { operationName: nextStepValid });
                }
                if (finalProductValid) {
                  pushStage('output', 'FINAL_PRODUCT', 'FINAL PRODUCT', { name: finalProductValid, itemType: null, baseUomName: null } as PreviewItem, null);
                }
                previewStages = legacyStages;
              }

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
                      <Tag color="geekblue" style={{ margin: 0 }}>Operation: {operationName || '—'}</Tag>
                    </Space>
                  </div>

                  {cycleIds.length > 0 && (
                    <Alert
                      type="warning"
                      showIcon
                      style={{ marginBottom: 8 }}
                      message={
                        <>
                          <strong>Circular route detected:</strong> the same Output Item appears
                          at multiple stages (
                          {cycleIds.slice(0, 3).map((id) => itemLookup.get(id)?.itemCode ?? 'Unavailable').join(', ')}
                          {cycleIds.length > 3 ? ' …' : ''}). The backend will reject this on
                          save.
                        </>
                      }
                    />
                  )}

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
                          <div style={{ color: 'var(--theme-accent, #0284c7)', fontSize: 14, flexShrink: 0, display: 'flex', alignItems: 'center' }}><ArrowRightOutlined /></div>
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
                        <div style={{ color: 'var(--theme-accent, #0284c7)', fontSize: 14, flexShrink: 0, display: 'flex', alignItems: 'center' }}><ArrowRightOutlined /></div>
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
                    <div style={{ color: 'var(--theme-accent, #0284c7)', fontSize: 14, flexShrink: 0, display: 'flex', alignItems: 'center' }}><ArrowRightOutlined /></div>
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
                  {/* TASK 14: dynamic production flow — N stages generated from the SAME
                      form data as the strip above (no hardcoded six-stage template) */}
                  <div style={{ marginTop: 10, borderTop: '1px solid var(--theme-border, rgba(255,255,255,0.1))', paddingTop: 10 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--theme-accent, #0284c7)', letterSpacing: 0.5 }}>
                      Production Flow — {previewStages.length} Stage{previewStages.length === 1 ? '' : 's'}
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
            <div className="erp-form-responsive-grid">
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
            <div className="erp-form-responsive-grid" style={{ marginTop: 8 }}>
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
        </div>

        {/* RIGHT SIDE: LIVE ITEM DETAIL SHEET (ONLY ON DESKTOP WHEN ENABLED) */}
        {showLivePreview && screens.lg && (
          <div className="erp-item-live-pane" data-testid="item-live-detail-sheet">
            <div className="erp-item-live-header">
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span className="erp-item-live-code">
                    {watchedCode || editing?.itemCode || (editing ? 'EDIT ITEM' : 'ADD ITEM')}
                  </span>
                  <StatusBadge
                    status={editing?.status || 'ACTIVE'}
                    colorMap={statusColorMap}
                  />
                </div>
                <div className="erp-item-live-title">
                  {watchedName || editing?.name || 'New Item'}
                </div>
              </div>
              <Tag color="cyan" style={{ margin: 0, fontSize: 11 }}>
                <SyncOutlined spin style={{ marginRight: 4 }} />
                Live Form Preview
              </Tag>
            </div>

            {/* Classification & Organization */}
            <div className="erp-item-live-section">
              <div className="erp-item-live-section-title">
                <ApartmentOutlined /> Organization & Classification
              </div>
              <Descriptions size="small" column={1} styles={{ label: { width: 110, fontSize: 11 }, content: { fontSize: 12 } }}>
                <Descriptions.Item label="Item Type">
                  <Tag color="blue">{typeName(watchedItemType || editing?.itemType || 'FINISHED_GOOD')}</Tag>
                </Descriptions.Item>
                <Descriptions.Item label="Category">
                  {flatCategories.find((c) => c.id === (watchedCategoryId || editing?.categoryId))?.name || (editing ? categoryName(editing) : null) || '—'}
                </Descriptions.Item>
                <Descriptions.Item label="Organization">
                  {[
                    divisions.find((d) => d.id === (watchedDivisionId || editing?.divisionId))?.name || (editing ? divisionName(editing) : null),
                    sections.find((s) => s.id === (watchedSectionId || editing?.sectionId))?.name || (editing ? sectionName(editing) : null),
                    departments.find((d) => d.id === (watchedDepartmentId || editing?.departmentId))?.name || (editing ? departmentName(editing) : null),
                  ].filter(Boolean).join(' → ') || 'Not configured'}
                </Descriptions.Item>
              </Descriptions>
            </div>

            {/* Technical Specifications */}
            <div className="erp-item-live-section">
              <div className="erp-item-live-section-title">
                <ToolOutlined /> Technical Specifications
              </div>
              <Descriptions size="small" column={2} styles={{ label: { width: 100, fontSize: 11 }, content: { fontSize: 12 } }}>
                <Descriptions.Item label="Wire Size">
                  {(watchedWireSizeMm != null || editing?.wireSizeMm != null)
                    ? `${formatDimension(watchedWireSizeMm ?? editing?.wireSizeMm)} mm`
                    : '—'}
                </Descriptions.Item>
                <Descriptions.Item label="Diameter">
                  {(watchedDiameterMm != null || editing?.diameterMm != null)
                    ? `${formatDimension(watchedDiameterMm ?? editing?.diameterMm)} mm`
                    : '—'}
                </Descriptions.Item>
                <Descriptions.Item label="Thickness">
                  {(watchedThicknessMm != null || editing?.thicknessMm != null)
                    ? `${formatDimension(watchedThicknessMm ?? editing?.thicknessMm)} mm`
                    : '—'}
                </Descriptions.Item>
                <Descriptions.Item label="Width">
                  {(watchedWidthMm != null || editing?.widthMm != null)
                    ? `${formatDimension(watchedWidthMm ?? editing?.widthMm)} mm`
                    : '—'}
                </Descriptions.Item>
                <Descriptions.Item label="Length / Piece" span={2}>
                  {(watchedLengthPerPiece != null || editing?.lengthPerPiece != null)
                    ? `${formatDimension(watchedLengthPerPiece ?? editing?.lengthPerPiece)} m`
                    : '—'}
                </Descriptions.Item>
              </Descriptions>
            </div>

            {/* UOM, Weights & Commercial */}
            <div className="erp-item-live-section">
              <div className="erp-item-live-section-title">
                <DatabaseOutlined /> UOM, Weights & Commercial
              </div>
              <Descriptions size="small" column={2} styles={{ label: { width: 100, fontSize: 11 }, content: { fontSize: 12 } }}>
                <Descriptions.Item label="Base UOM">
                  <Tag color="geekblue">{uoms.find((u) => u.id === (watchedBaseUomId || editing?.baseUomId))?.name || editing?.baseUomName || '—'}</Tag>
                </Descriptions.Item>
                <Descriptions.Item label="Cost Price">
                  {(watchedCostPrice != null || editing?.costPrice != null)
                    ? `$${Number(watchedCostPrice ?? editing?.costPrice).toFixed(2)}`
                    : '—'}
                </Descriptions.Item>
                <Descriptions.Item label="Selling Price">
                  {(watchedSellingPrice != null || editing?.sellingPrice != null)
                    ? `$${Number(watchedSellingPrice ?? editing?.sellingPrice).toFixed(2)}`
                    : '—'}
                </Descriptions.Item>
                <Descriptions.Item label="Weight/Pc">
                  {(watchedWeightPerPiece != null || editing?.weightPerPiece != null)
                    ? `${Number(watchedWeightPerPiece ?? editing?.weightPerPiece)} kg`
                    : '—'}
                </Descriptions.Item>
                <Descriptions.Item label="Weight/Mtr">
                  {(watchedWeightPerMeter != null || editing?.weightPerMeter != null)
                    ? `${Number(watchedWeightPerMeter ?? editing?.weightPerMeter)} kg/m`
                    : '—'}
                </Descriptions.Item>
                <Descriptions.Item label="Pieces/KG">
                  {(watchedPiecesPerKg != null || editing?.piecesPerKg != null)
                    ? `${Number(watchedPiecesPerKg ?? editing?.piecesPerKg)}`
                    : '—'}
                </Descriptions.Item>
                <Descriptions.Item label="SKU">
                  <Text code>{watchedSku || editing?.sku || 'Auto'}</Text>
                </Descriptions.Item>
                <Descriptions.Item label="Barcode">
                  <Text code>{watchedBarcode || editing?.barcode || 'Auto'}</Text>
                </Descriptions.Item>
              </Descriptions>
            </div>

            {/* Stock Levels & Route */}
            <div className="erp-item-live-section" style={{ marginBottom: 0 }}>
              <div className="erp-item-live-section-title">
                <BuildOutlined /> Inventory Levels & Flow
              </div>
              <Descriptions size="small" column={2} styles={{ label: { width: 100, fontSize: 11 }, content: { fontSize: 12 } }}>
                <Descriptions.Item label="Min Stock">
                  {watchedMinStock ?? editing?.minimumStockLevel ?? '0'}
                </Descriptions.Item>
                <Descriptions.Item label="Max Stock">
                  {watchedMaxStock ?? editing?.maximumStockLevel ?? '0'}
                </Descriptions.Item>
                <Descriptions.Item label="Reorder">
                  {watchedReorder ?? editing?.reorderLevel ?? '0'}
                </Descriptions.Item>
                <Descriptions.Item label="Safety">
                  {watchedSafety ?? editing?.safetyStockLevel ?? '0'}
                </Descriptions.Item>
                <Descriptions.Item label="Input Mat." span={2}>
                  {selectedInputDetail ? `${selectedInputDetail.itemCode} — ${selectedInputDetail.name}` : (editing?.productionInItem ? `${editing.productionInItem.itemCode} — ${editing.productionInItem.name}` : 'None')}
                </Descriptions.Item>
                <Descriptions.Item label="Output Prod." span={2}>
                  {outputProductDisplay}
                </Descriptions.Item>
              </Descriptions>
            </div>
          </div>
        )}
      </div>
    </Form>
  </DraggableResizableModal>

      <DraggableResizableModal
        open={importOpen && !isImportMinimized}
        onCancel={closeImport}
        onMinimize={() => setIsImportMinimized(true)}
        width={1020}
        height={660}
        footer={
          importSummary ? (
            <Button type="primary" onClick={closeImport}>Done</Button>
          ) : importing ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', flexWrap: 'wrap', gap: 8 }}>
              <span style={{ fontSize: 13, color: 'var(--theme-text-muted, #64748b)' }}>
                Import in progress… please do not close the browser tab.
              </span>
              <Button onClick={() => setIsImportMinimized(true)}>
                Minimize to Dock
              </Button>
            </div>
          ) : importRows.length > 0 ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', flexWrap: 'wrap', gap: 8 }}>
              <Space size={8}>
                <Button key="back" onClick={() => { setImportRows([]); setRawImportData([]); setImportFileName(null); setImportFilter('ALL'); }}>
                  Choose another file
                </Button>
                {importRows.some((r) => r.status !== 'VALID') && (
                  <Button icon={<DownloadOutlined />} onClick={downloadErrorReport}>
                    Download Errors ({importRows.filter((r) => r.status !== 'VALID').length})
                  </Button>
                )}
              </Space>
              <Space size={8}>
                <Button onClick={closeImport}>Cancel</Button>
                <Button
                  key="import"
                  type="primary"
                  disabled={importRows.every((r) => r.status !== 'VALID')}
                  loading={importing}
                  onClick={runImport}
                >
                  Import {importRows.filter((r) => r.status === 'VALID').length} valid row(s)
                </Button>
              </Space>
            </div>
          ) : (
            <Button type="primary" onClick={closeImport}>Close</Button>
          )
        }
        title={
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', paddingRight: 28 }}>
            <Space size={8}>
              <ImportOutlined style={{ color: 'var(--theme-accent, #4f46e5)' }} />
              <span style={{ fontWeight: 700, fontSize: 16 }}>Import Items Master</span>
              <span className="item-model-badge">2027 UX</span>
            </Space>
            <Space size={6}>
              <Tooltip title="Minimize to dock (keeps file open in background)">
                <Button
                  type="text"
                  size="small"
                  icon={<MinusOutlined />}
                  title="Minimize to dock (keeps file open in background)"
                  aria-label="Minimize to dock"
                  onClick={() => setIsImportMinimized(true)}
                  style={{ borderRadius: 6 }}
                />
              </Tooltip>
            </Space>
          </div>
        }
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

        {importRows.length > 0 && !importSummary && !importing && (
          <div>
            {(() => {
              const validCount = importRows.filter((r) => r.status === 'VALID').length;
              const dupCount = importRows.filter((r) => r.status === 'DUPLICATE').length;
              const invalidCount = importRows.filter((r) => r.status === 'INVALID').length;

              return (
                <>
                  <Alert
                    type={invalidCount > 0 ? 'warning' : 'info'}
                    showIcon
                    message={
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                        <span>
                          Preview: <strong>{importFileName}</strong>
                        </span>
                        {invalidCount > 0 && importFilter !== 'INVALID' && (
                          <Button
                            size="small"
                            danger
                            type="primary"
                            onClick={() => { setImportFilter('INVALID'); setImportPage(1); }}
                          >
                            Focus on {invalidCount} Invalid Row{invalidCount > 1 ? 's' : ''}
                          </Button>
                        )}
                      </div>
                    }
                    description={
                      <span>
                        Total rows: <b>{importRows.length}</b> ·{' '}
                        Valid: <b style={{ color: '#1a7f37' }}>{validCount}</b> ·{' '}
                        Duplicates: <b style={{ color: '#b9770e' }}>{dupCount}</b> ·{' '}
                        Invalid: <b style={{ color: '#c0392b' }}>{invalidCount}</b>
                        {invalidCount > 0 && (
                          <span style={{ marginLeft: 8, color: '#c0392b', fontWeight: 500 }}>
                            — Errors highlighted below. Select "Failed / Invalid" to isolate them.
                          </span>
                        )}
                      </span>
                    }
                    style={{ marginBottom: 12 }}
                  />

                  {/* Filter & Triage Bar */}
                  <div className="import-filter-bar">
                    <Space wrap size={10}>
                      <Segmented
                        value={importFilter}
                        onChange={(val) => {
                          setImportFilter(val as any);
                          setImportPage(1);
                        }}
                        options={[
                          {
                            label: (
                              <Space size={4}>
                                <AppstoreOutlined />
                                <span>All ({importRows.length})</span>
                              </Space>
                            ),
                            value: 'ALL',
                          },
                          {
                            label: (
                              <Space size={4}>
                                <CloseCircleOutlined style={{ color: '#ef4444' }} />
                                <span style={{ color: invalidCount > 0 ? '#ef4444' : undefined, fontWeight: invalidCount > 0 ? 700 : undefined }}>
                                  Failed / Invalid ({invalidCount})
                                </span>
                              </Space>
                            ),
                            value: 'INVALID',
                          },
                          {
                            label: (
                              <Space size={4}>
                                <WarningOutlined style={{ color: '#f59e0b' }} />
                                <span>Duplicates ({dupCount})</span>
                              </Space>
                            ),
                            value: 'DUPLICATE',
                          },
                          {
                            label: (
                              <Space size={4}>
                                <CheckCircleOutlined style={{ color: '#10b981' }} />
                                <span>Valid ({validCount})</span>
                              </Space>
                            ),
                            value: 'VALID',
                          },
                        ]}
                      />
                      {importFilter === 'ALL' && (
                        <Tooltip title="When enabled, faulty rows are pinned to page 1 so you don't have to scroll hundreds of pages">
                          <Switch
                            checked={showErrorsFirst}
                            onChange={setShowErrorsFirst}
                            checkedChildren="Errors First"
                            unCheckedChildren="File Order"
                            size="small"
                          />
                        </Tooltip>
                      )}
                    </Space>
                    <Space wrap size={8}>
                      {invalidCount > 0 && (
                        <Button
                          danger
                          size="small"
                          icon={<DownloadOutlined />}
                          onClick={downloadErrorReport}
                        >
                          Download Errors ({invalidCount})
                        </Button>
                      )}
                      <Tooltip title="Re-run validation against master data">
                        <Button
                          size="small"
                          icon={<SyncOutlined />}
                          onClick={revalidateImportRows}
                        >
                          Re-validate
                        </Button>
                      </Tooltip>
                      <Tooltip title="Upload an updated or corrected CSV file">
                        <Button
                          size="small"
                          icon={<UploadOutlined />}
                          onClick={() => reuploadInputRef.current?.click()}
                        >
                          Replace File
                        </Button>
                      </Tooltip>
                    </Space>
                  </div>

                  <Table
                    rowKey="rowNumber"
                    size="small"
                    dataSource={filteredImportRows}
                    rowClassName={(r) => {
                      if (r.status === 'INVALID') return 'import-table-row-invalid';
                      if (r.status === 'DUPLICATE') return 'import-table-row-duplicate';
                      return '';
                    }}
                    pagination={{
                      current: importPage,
                      pageSize: importPageSize,
                      pageSizeOptions: ['10', '20', '50', '100', '250', '500'],
                      showSizeChanger: true,
                      showQuickJumper: true,
                      className: 'import-preview-pagination',
                      onChange: (p, ps) => {
                        setImportPage(p);
                        setImportPageSize(ps);
                      },
                      showTotal: (totalCount, range) => (
                        <span style={{ fontSize: 13, fontWeight: 500 }}>
                          Showing {range[0]}–{range[1]} of <b>{totalCount}</b> {importFilter !== 'ALL' ? `${importFilter.toLowerCase()} ` : ''}rows
                        </span>
                      ),
                    }}
                    columns={[
                      {
                        title: <Space size={4}><FileTextOutlined /><span>Row</span></Space>,
                        dataIndex: 'rowNumber',
                        width: 75,
                        render: (n: number, r: ImportRow) => (
                          <span style={{ fontWeight: r.status !== 'VALID' ? 700 : 400, color: r.status === 'INVALID' ? '#dc2626' : undefined }}>
                            #{n}
                          </span>
                        ),
                      },
                      {
                        title: <Space size={4}><TagOutlined /><span>Item Code</span></Space>,
                        width: 150,
                        render: (_: unknown, r: ImportRow) => (
                          <b style={{ color: r.status === 'INVALID' ? '#dc2626' : undefined }}>
                            {r.data['itemCode'] || <Text type="danger">(empty)</Text>}
                          </b>
                        ),
                      },
                      {
                        title: <Space size={4}><AppstoreOutlined /><span>Name</span></Space>,
                        width: 180,
                        ellipsis: true,
                        render: (_: unknown, r: ImportRow) => r.data['name'] || <Text type="danger">(empty)</Text>,
                      },
                      {
                        title: <Space size={4}><ProjectOutlined /><span>Type</span></Space>,
                        width: 130,
                        render: (_: unknown, r: ImportRow) => r.data['itemType'] || '—',
                      },
                      {
                        title: <Space size={4}><DatabaseOutlined /><span>UOM</span></Space>,
                        width: 80,
                        render: (_: unknown, r: ImportRow) => r.data['uomCode'] || '—',
                      },
                      {
                        title: <Space size={4}><CheckCircleOutlined /><span>Result</span></Space>,
                        width: 110,
                        render: (_: unknown, r: ImportRow) => {
                          if (r.status === 'VALID') return <Tag color="success">Valid</Tag>;
                          if (r.status === 'DUPLICATE') return <Tag color="warning">Duplicate</Tag>;
                          return <Tag color="error">Invalid</Tag>;
                        },
                      },
                      {
                        title: <Space size={4}><WarningOutlined /><span>Details / Error Description</span></Space>,
                        render: (_: unknown, r: ImportRow) =>
                          r.errors.length > 0 ? (
                            <div style={{ color: '#dc2626', fontSize: 12.5, fontWeight: 500 }}>
                              {r.errors.map((err, i) => (
                                <div key={i}>• {err}</div>
                              ))}
                            </div>
                          ) : (
                            <Text type="secondary" style={{ fontSize: 12 }}>Ready to import</Text>
                          ),
                      },
                    ]}
                  />
                </>
              );
            })()}
          </div>
        )}

        {importing && (
          <>
            <div className="import-live-progress-card">
            <div className="import-progress-header">
              <div className="import-progress-title-wrap">
                <div className="import-progress-pulse-dot" />
                <div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--theme-text, #1e293b)' }}>
                    Uploading & Importing Items Master…
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--theme-text-muted, #64748b)', marginTop: 2 }}>
                    Processing row <b>{importProgress?.current ?? 0}</b> of <b>{importProgress?.total ?? importRows.filter((r) => r.status === 'VALID').length}</b>
                    {importProgress?.currentCode && (
                      <span style={{ marginLeft: 8, fontFamily: 'monospace', color: '#4f46e5' }}>
                        [{importProgress.currentCode}]
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="import-progress-large-percent">
                {importProgress?.percent ?? 0}<span>%</span>
              </div>
            </div>

            {/* Ant Design Live Active Progress Bar with Gradient */}
            <div style={{ marginTop: 16 }}>
              <Progress
                percent={importProgress?.percent ?? 0}
                status="active"
                strokeColor={{
                  '0%': '#4f46e5',
                  '50%': '#3b82f6',
                  '100%': '#10b981',
                }}
                size={['100%', 14]}
                showInfo={false}
              />
            </div>

            {/* Continuous Ambient Flowing Shimmer Line */}
            <div className="import-progress-ambient-track" title="Continuous Real-time Flow Indicator">
              <div
                className="import-progress-ambient-glow"
                style={{ width: `${Math.max(importProgress?.percent ?? 3, 3)}%` }}
              />
            </div>

            {/* Metrics Row: Time Remaining, Speed, Success, Failed */}
            <div className="import-progress-metrics-row">
              <div className="import-metric-chip">
                <span className="metric-icon"><ClockCircleOutlined style={{ color: '#4f46e5' }} /></span>
                <div>
                  <div className="metric-label">Estimated Time</div>
                  <div className="metric-val" style={{ color: '#4f46e5' }}>
                    {formatRemainingTime(importProgress?.estimatedSecondsRemaining ?? 0)}
                  </div>
                </div>
              </div>

              <div className="import-metric-chip">
                <span className="metric-icon"><ThunderboltOutlined style={{ color: '#0284c7' }} /></span>
                <div>
                  <div className="metric-label">Import Speed</div>
                  <div className="metric-val" style={{ color: '#0284c7' }}>
                    ~{importProgress?.speed ?? 0} items/sec
                  </div>
                </div>
              </div>

              <div className="import-metric-chip">
                <span className="metric-icon"><CheckCircleOutlined style={{ color: '#16a34a' }} /></span>
                <div>
                  <div className="metric-label">Imported</div>
                  <div className="metric-val" style={{ color: '#16a34a' }}>
                    {importProgress?.successCount ?? 0}
                  </div>
                </div>
              </div>

              <div className="import-metric-chip">
                <span className="metric-icon"><CloseCircleOutlined style={{ color: (importProgress?.failCount ?? 0) > 0 ? '#dc2626' : '#94a3b8' }} /></span>
                <div>
                  <div className="metric-label">Failed</div>
                  <div className="metric-val" style={{ color: (importProgress?.failCount ?? 0) > 0 ? '#dc2626' : '#94a3b8' }}>
                    {importProgress?.failCount ?? 0}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Live Activity Console: Dual Panels (Imported Feed on Left, Faulty Console on Right) */}
          <div className="import-live-console-container">
            <Row gutter={[16, 16]}>
              {/* Left Panel: Successfully Imported Live Feed */}
              <Col xs={24} md={14}>
                <Card
                  size="small"
                  className="import-console-panel import-console-success"
                  title={
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <Space size={6}>
                        <CheckCircleOutlined style={{ color: '#10b981' }} />
                        <span style={{ fontWeight: 700, fontSize: 13 }}>Live Imported Feed</span>
                      </Space>
                      <Tag color="success" style={{ fontWeight: 700, borderRadius: 10, marginInlineEnd: 0 }}>
                        {importProgress?.successCount ?? 0} imported
                      </Tag>
                    </div>
                  }
                  styles={{ body: { padding: '8px 12px', height: 260, overflowY: 'auto' } }}
                >
                  {liveImportedItems.length === 0 ? (
                    <div className="import-console-empty">
                      <GlobalLoading spinnerOnly size="small" style={{ marginBottom: 8 }} />
                      <Text type="secondary" style={{ fontSize: 12 }}>Streaming items as they are saved to database…</Text>
                    </div>
                  ) : (
                    <div className="import-console-stream">
                      {liveImportedItems.map((item, idx) => (
                        <div key={`${item.itemCode}-${idx}`} className="import-stream-row">
                          <div className="import-stream-left">
                            <span className="import-row-badge">#{item.rowNumber}</span>
                            <Tag color="blue" style={{ fontWeight: 700, marginInlineEnd: 4, fontFamily: 'monospace' }}>
                              {item.itemCode}
                            </Tag>
                            <span className="import-stream-name" title={item.name}>
                              {item.name}
                            </span>
                          </div>
                          <div className="import-stream-right">
                            {item.division && <Tag style={{ fontSize: 10, marginInlineEnd: 4 }}>{item.division}</Tag>}
                            <Tag color="success" style={{ fontSize: 10, marginInlineEnd: 0 }}>IMPORTED</Tag>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </Card>
              </Col>

              {/* Right Panel: Faulty / Failed Rows Console */}
              <Col xs={24} md={10}>
                <Card
                  size="small"
                  className="import-console-panel import-console-fault"
                  title={
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <Space size={6}>
                        <CloseCircleOutlined style={{ color: (importProgress?.failCount ?? 0) > 0 ? '#ef4444' : '#94a3b8' }} />
                        <span style={{ fontWeight: 700, fontSize: 13, color: (importProgress?.failCount ?? 0) > 0 ? '#ef4444' : undefined }}>
                          Faulty / Failed Items
                        </span>
                      </Space>
                      <Tag color={(importProgress?.failCount ?? 0) > 0 ? 'error' : 'default'} style={{ fontWeight: 700, borderRadius: 10, marginInlineEnd: 0 }}>
                        {importProgress?.failCount ?? 0} faulty
                      </Tag>
                    </div>
                  }
                  styles={{ body: { padding: '8px 12px', height: 260, overflowY: 'auto' } }}
                >
                  {liveFailedItems.length === 0 ? (
                    <div className="import-console-empty" style={{ color: '#10b981' }}>
                      <CheckCircleOutlined style={{ fontSize: 26, marginBottom: 8, color: '#10b981' }} />
                      <div style={{ fontWeight: 600 }}>Zero Faults Detected</div>
                      <Text type="secondary" style={{ fontSize: 11, marginTop: 2 }}>All processed rows are importing cleanly.</Text>
                    </div>
                  ) : (
                    <div className="import-fault-stream">
                      {liveFailedItems.map((fail, idx) => (
                        <div key={`${fail.itemCode}-${idx}`} className="import-fault-row">
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
                            <Space size={4}>
                              <span className="import-fault-badge">Row #{fail.rowNumber}</span>
                              <strong style={{ color: '#dc2626', fontFamily: 'monospace' }}>{fail.itemCode}</strong>
                            </Space>
                            <Tag color="error" style={{ fontSize: 10, marginInlineEnd: 0 }}>FAILED</Tag>
                          </div>
                          <div className="import-fault-msg">{fail.reason}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </Card>
              </Col>
            </Row>
          </div>
          </>
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

      {/* Hidden file input for file replacement / re-upload */}
      <input
        type="file"
        ref={reuploadInputRef}
        style={{ display: 'none' }}
        accept=".csv,.txt"
        onChange={handleReuploadSelect}
      />

      {/* Universal Minimized Modals Dock */}
      {(isImportMinimized || isFormMinimized || isDetailMinimized || isBarcodeMinimized) && (
        <div className="erp-minimized-dock" data-testid="item-minimized-dock">
          {/* Minimized Add / Edit Item Tab */}
          {isFormMinimized && (
            <div
              className="erp-minimized-tab"
              onClick={() => setIsFormMinimized(false)}
              role="button"
              tabIndex={0}
              title="Click to restore Item Form"
            >
              <div className="erp-minimized-pulse" />
              <Space size={8}>
                {editing ? <EditOutlined style={{ color: '#10b981', fontSize: 15 }} /> : <FileAddOutlined style={{ color: '#10b981', fontSize: 15 }} />}
                <span><strong>{editing ? `Edit: ${editing.itemCode}` : 'New Item Form'}</strong></span>
                <Tag color="cyan">{editing ? (watchedCode || editing.itemCode) : (watchedCode || 'Draft')}</Tag>
              </Space>
              <span
                className="erp-minimized-close"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsFormMinimized(false);
                  setFormOpen(false);
                }}
                title="Discard and close form"
              >
                ×
              </span>
            </div>
          )}

          {/* Minimized Item Detail Tab */}
          {isDetailMinimized && (
            <div
              className="erp-minimized-tab"
              onClick={() => setIsDetailMinimized(false)}
              role="button"
              tabIndex={0}
              title="Click to restore Item Details"
            >
              <div className="erp-minimized-pulse" />
              <Space size={8}>
                <DatabaseOutlined style={{ color: '#06b6d4', fontSize: 15 }} />
                <span>Details: <strong>{detailItem?.itemCode || 'Item'}</strong></span>
                {detailItem?.status && <StatusBadge status={detailItem.status} colorMap={statusColorMap} />}
              </Space>
              <span
                className="erp-minimized-close"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsDetailMinimized(false);
                  setDetailOpen(false);
                }}
                title="Close details"
              >
                ×
              </span>
            </div>
          )}

          {/* Minimized Barcode Modal Tab */}
          {isBarcodeMinimized && (
            <div
              className="erp-minimized-tab"
              onClick={() => setIsBarcodeMinimized(false)}
              role="button"
              tabIndex={0}
              title="Click to restore Barcode modal"
            >
              <div className="erp-minimized-pulse" />
              <Space size={8}>
                <ScanOutlined style={{ color: '#f59e0b', fontSize: 15 }} />
                <span>Barcode: <strong>{barcodeModalItem?.itemCode || 'Barcode'}</strong></span>
              </Space>
              <span
                className="erp-minimized-close"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsBarcodeMinimized(false);
                  setBarcodeModalOpen(false);
                  setBarcodeModalItem(null);
                  setBarcodeModalBarcodes([]);
                }}
                title="Close barcode"
              >
                ×
              </span>
            </div>
          )}

          {/* Minimized Import Modal Tab */}
          {isImportMinimized && (
            <div
              className="erp-minimized-tab minimized-import-dock"
              onClick={() => setIsImportMinimized(false)}
              role="button"
              tabIndex={0}
              title="Click to restore Import Items modal"
            >
              <div className="erp-minimized-pulse minimized-import-pulse" />
              <Space size={8}>
                <ImportOutlined style={{ color: '#4f46e5', fontSize: 16 }} />
                <span>Import: <strong>{importFileName || 'Items CSV'}</strong></span>
                {importing && importProgress ? (
                  <>
                    <Tag color="processing" style={{ fontWeight: 700, borderRadius: 6 }}>
                      {importProgress.percent}% ({importProgress.current}/{importProgress.total})
                    </Tag>
                    <div style={{ width: 80, display: 'inline-block' }}>
                      <Progress percent={importProgress.percent} size="small" showInfo={false} status="active" />
                    </div>
                  </>
                ) : (
                  <>
                    <Tag color="blue">{importRows.length} rows</Tag>
                    {importRows.some((r) => r.status === 'INVALID') && (
                      <Tag color="error">{importRows.filter((r) => r.status === 'INVALID').length} failed</Tag>
                    )}
                  </>
                )}
              </Space>
              <span
                className="erp-minimized-close minimized-import-close"
                onClick={(e) => {
                  e.stopPropagation();
                  closeImport();
                }}
                title="Discard and close import"
              >
                ×
              </span>
            </div>
          )}
        </div>
      )}

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
        open={barcodeModalOpen && !isBarcodeMinimized}
        onCancel={() => { setBarcodeModalOpen(false); setIsBarcodeMinimized(false); setBarcodeModalItem(null); setBarcodeModalBarcodes([]); }}
        onMinimize={() => setIsBarcodeMinimized(true)}
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
              <Descriptions.Item label="Item Type"><Tag>{typeName(barcodeModalItem.itemType)}</Tag></Descriptions.Item>
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

      <SaveResultDialog
        open={resultOpen}
        phase={resultPhase}
        result={resultData}
        errorMessage={resultError}
        errorTitle={resultError?.includes('required field(s)') ? 'Required Information Missing' : 'Save Failed'}
        errorLead={resultError?.includes('required field(s)') ? 'Form submission cannot proceed with empty required fields.' : 'The request was not persisted.'}
        onRetry={resultError?.includes('required field(s)') ? undefined : handleResultRetry}
        onClose={handleResultClose}
        successTitle="Successful Save"
        okLabel="OK"
      />

      <DeleteConfirmModal
        open={deleteModalVisible}
        itemType="Item"
        itemCode={deleteTargetItem?.itemCode}
        itemName={deleteTargetItem?.name}
        description="Permanent deletion is blocked automatically if this item is referenced by BOM, production transactions, stock balances, routing, or inspection logs."
        onConfirm={async () => {
          if (!deleteTargetItem) return;
          await apiService.delete(`/master-data/items/${deleteTargetItem.id}`);
          message.success(`Item '${deleteTargetItem.itemCode}' deleted successfully`);
          setDeleteModalVisible(false);
          setDeleteTargetItem(null);
          fetchItems();
        }}
        onCancel={() => {
          setDeleteModalVisible(false);
          setDeleteTargetItem(null);
        }}
        onDeactivateInstead={
          deleteTargetItem && deleteTargetItem.status === 'ACTIVE'
            ? async () => {
                await apiService.patch(`/master-data/items/${deleteTargetItem.id}/deactivate`);
                message.success(`Item '${deleteTargetItem.itemCode}' deactivated`);
                setDeleteModalVisible(false);
                setDeleteTargetItem(null);
                fetchItems();
              }
            : undefined
        }
        deactivateLabel="Deactivate Instead"
      />
    </div>
  </TabKeepAlive>
  );
};

export default ItemManagement;
