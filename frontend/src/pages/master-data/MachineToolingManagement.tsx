import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  App, Button, Space, Select, Form, Input, InputNumber, Popconfirm, Tabs,
  Descriptions, Row, Col, Tag, Tooltip, DatePicker, TimePicker, Alert, Statistic,
  Checkbox, Dropdown, Modal, theme, Grid,
} from 'antd';
import {
  PlusOutlined, EditOutlined, EyeOutlined, DeleteOutlined, ReloadOutlined,
  SwapRightOutlined, ToolOutlined, HistoryOutlined, BarChartOutlined,
  CheckCircleOutlined, UnorderedListOutlined, SwapOutlined, PlusCircleOutlined, DesktopOutlined,
  AppstoreOutlined, ThunderboltOutlined, EyeInvisibleOutlined, CloseOutlined,
  ClusterOutlined, LinkOutlined, PlayCircleOutlined, PauseCircleOutlined,
  InfoCircleOutlined, ExportOutlined, DownOutlined, FileExcelOutlined,
  FilePdfOutlined, PrinterOutlined, RiseOutlined, TagOutlined, PoweroffOutlined,
  CheckOutlined, DollarOutlined, ArrowsAltOutlined, ShrinkOutlined,
} from '@ant-design/icons';
import './machineTooling.css';
import {
  ToolChangeoverModal,
  RemountStandbyToolModal,
  type StandbyToolOption,
} from './components/ToolChangeoverModals';
import {
  loadCompanyLogoDataUrl,
  exportToolReportCSV,
  exportToolReportPDF,
  printToolReport,
  type ToolExportPayload,
} from './components/toolLifecycleExport';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import apiService from '../../services/api';
import { usePermission } from '../../hooks/usePermission';
import { useUserStore } from '../../store/userStore';
import {
  PageHeader, StatusBadge, ERPTable, TableToolbar, TabKeepAlive, GlobalLoading,
  DraggableResizableModal, SaveResultDialog,
  type SaveResultPhase, type SaveResultData,
} from '../../components/shared';
import { tabSessionCache, TAB_REFRESH_EVENT } from '../../services/tabSessionCache';
import { useHeaderActions } from '../../components/layout/headerActionsStore';
import { handleValidationErrors } from '../../utils/formValidationHelper';

const COMPONENT_TYPES = ['TOOLING', 'SPARE_CONSUMABLE'] as const;
const COMPONENT_TYPE_LABELS: Record<string, string> = {
  TOOLING: 'Tooling',
  TOOL: 'Tooling',
  DIE: 'Tooling',
  MOULD: 'Tooling',
  FIXTURE: 'Tooling',
  SPARE_CONSUMABLE: 'Spare / Consumable',
  COMPONENT: 'Spare / Consumable',
  CHAIN: 'Spare / Consumable',
  OTHER: 'Spare / Consumable',
};
const normalizeComponentTypeClient = (raw?: string | null): 'TOOLING' | 'SPARE_CONSUMABLE' => {
  const upper = String(raw || '').trim().toUpperCase();
  if (
    upper === 'SPARE_CONSUMABLE' ||
    upper === 'COMPONENT' ||
    upper === 'CHAIN' ||
    upper === 'OTHER' ||
    upper === 'SPARE_PART' ||
    upper === 'CONSUMABLE'
  ) {
    return 'SPARE_CONSUMABLE';
  }
  return 'TOOLING';
};
const formatComponentTypeLabel = (raw?: string | null): string => {
  const upper = String(raw || '').trim().toUpperCase();
  return COMPONENT_TYPE_LABELS[upper] || (raw ? raw : 'Tooling');
};
const COMPONENT_TYPE_OPTIONS = [
  { value: 'TOOLING', label: 'Tooling' },
  { value: 'SPARE_CONSUMABLE', label: 'Spare / Consumable' },
];
const CONDITION_STATUSES = ['NEW', 'USED', 'DAMAGED', 'REWORKED', 'OTHER'];

const COMPONENT_TYPE_COLORS: Record<string, string> = {
  TOOLING: 'geekblue',
  SPARE_CONSUMABLE: 'cyan',
  DIE: 'geekblue',
  MOULD: 'geekblue',
  CHAIN: 'cyan',
  TOOL: 'geekblue',
  FIXTURE: 'geekblue',
  COMPONENT: 'cyan',
  OTHER: 'cyan',
};
const CONDITION_COLORS: Record<string, string> = {
  NEW: 'green', USED: 'blue', DAMAGED: 'red', REWORKED: 'orange', OTHER: 'default',
};

/* TASK26 — tool lifecycle dispositions (destination of a removed tool). */
const DISPOSITION_TYPES = ['RETURN_TO_STORE', 'SENT_FOR_REWORK', 'SCRAPPED', 'LOST', 'RETAINED', 'OTHER'];
const DISPOSITION_LABELS: Record<string, string> = {
  RETURN_TO_STORE: 'Return to Store',
  SENT_FOR_REWORK: 'Sent for Rework',
  SCRAPPED: 'Scrapped',
  LOST: 'Lost',
  RETAINED: 'Retained',
  OTHER: 'Other',
};
const DISPOSITION_COLORS: Record<string, string> = {
  RETURN_TO_STORE: 'geekblue', SENT_FOR_REWORK: 'orange', SCRAPPED: 'red', LOST: 'magenta', RETAINED: 'gold', OTHER: 'default',
};

function extractApiError(err: any, fallback: string): string {
  const raw = err?.response?.data?.message ?? err?.message;
  if (raw == null || raw === '') return fallback;
  if (Array.isArray(raw)) return raw.join('; ');
  return String(raw);
}

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const fmtNum = (v: unknown): string => {
  const n = num(v);
  if (n === null) return '—';
  return Number(n.toFixed(4)).toLocaleString('en-US', { maximumFractionDigits: 4 });
};

/** Machine production output unit across all 5 tabs, KPIs, drawers, and exports. */
const PRODUCTION_UOM = 'PCS';

const fmtPkr = (v: unknown, decimals: number = 0): string => {
  const n = num(v);
  if (n === null) return '—';
  return `Rs. ${Number(n).toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`;
};

interface MachineLk { id: string; machineCode?: string | null; machineNumber?: string | null; name?: string | null; divisionId?: string | null; sectionId?: string | null; departmentId?: string | null; }
interface ItemLk {
  id: string;
  itemCode: string;
  name?: string | null;
  baseUomId?: string | null;
  baseUom?: { id: string; code: string; name?: string } | null;
  itemType?: string | null;
  divisionId?: string | null;
  sectionId?: string | null;
  departmentId?: string | null;
  division?: { id: string; name: string; divisionCode?: string } | null;
  section?: { id: string; name: string; sectionCode?: string } | null;
  department?: { id: string; name: string; departmentCode?: string } | null;
}
interface UomLk { id: string; code: string; name?: string | null; }
interface DivisionLk { id: string; divisionCode?: string; name: string; }
interface SectionLk { id: string; sectionCode?: string; name: string; divisionId?: string | null; }
interface DepartmentLk { id: string; departmentCode?: string; name: string; divisionId?: string | null; sectionId?: string | null; }
interface MasterItemTypeLk { id: string; code: string; name: string; status?: string; }
interface JobCardLk { id: string; jobCardNo?: string | null; code?: string | null; }

interface ComponentRec {
  id: string; companyId: string; machineId: string; machineIds?: string[]; itemId: string | null; uomId: string | null;
  componentType: string; componentName: string; componentCode: string;
  expectedLifeQuantity?: string | number | null; minThreshold?: string | number | null;
  maxThreshold?: string | number | null; description?: string | null; isActive: boolean;
  machine?: MachineLk | null; machines?: MachineLk[]; item?: ItemLk | null; uom?: UomLk | null;
  createdAt?: string | null; updatedAt?: string | null;
}

interface ChangeRec {
  id: string; companyId: string; machineId: string; componentId: string; jobCardId: string | null;
  oldToolCode: string | null; newToolCode: string; newToolDescription: string | null;
  changeDate: string; changeTime: string | null;
  productionCounterBefore?: string | number | null; productionCounterAfter?: string | number | null;
  productionSincePrevious?: string | number | null;
  currentLifeQty?: number | null;
  uomCode?: string | null;
  isLiveActive?: boolean;
  closedAt?: string | null;
  lifecycleStatus?: string | null;
  reason: string | null;
  conditionStatus: string | null; remarks: string | null; changedAt?: string | null; isActive: boolean;
  machine?: MachineLk | null; component?: ComponentRec | null;
  jobCard?: { id: string; jobCardNo?: string | null; code?: string | null } | null;
  changedByUser?: { id: string; fullName?: string; name?: string } | null;
}

interface ComponentHistory {
  component: ComponentRec;
  selectedMachineId?: string;
  assignedMachines?: Array<{
    id: string;
    machineCode?: string | null;
    machineNumber?: string | null;
    name?: string | null;
    derivedCounter?: number;
  }>;
  machine: { id: string; machineId?: string | null; machineCode?: string | null; machineNumber?: string | null; name?: string | null };
  counter: { value: number | null; base: string };
  summary: {
    expectedLifeQuantity: number | null; minThreshold: number | null; maxThreshold: number | null;
    totalChanges: number; firstChangeDate: string | null; lastChangeDate: string | null;
    installedToolCode: string | null; counterAtInstall: number | null;
    avgLife: number | null; minLife: number | null; maxLife: number | null;
    usedByInstalled: number | null; remainingByInstalled: number | null;
  };
  changes: ChangeRec[];
}

interface ReportRow {
  machine: {
    id: string;
    machineCode: string;
    machineName: string | null;
    divisionId?: string | null;
    divisionName?: string | null;
  } | null;
  component: {
    id: string;
    itemId?: string | null;
    componentCode: string;
    componentName: string;
    componentType: string;
    uomCode: string | null;
  } | null;
  changes: number;
  toolsInstalled: number;
  qtyUsed: number;
  unitCost: number;
  costSource?: 'SNAPSHOT' | 'COMPONENT' | 'INVENTORY_AVG' | 'ITEM_MASTER' | 'LATEST_GRN' | 'NONE';
  totalCost: number;
  productionCovered: number;
  costPerGross: number | null;
  avgLife: number | null;
  minLife: number | null;
  maxLife: number | null;
  lastChangeDate: string | null;
}
interface ReportMachineSummary {
  machine: ReportRow['machine'];
  toolCount: number;
  changes: number;
  qtyUsed: number;
  totalCost: number;
  productionCovered: number;
  costPerGross: number | null;
  lastChangeDate: string | null;
  components: ReportRow[];
}
interface MonthlyReport {
  month: string;
  start: string;
  end: string;
  rows: ReportRow[];
  machines?: ReportMachineSummary[];
  totals: {
    machines: number;
    components: number;
    changes: number;
    qtyUsed: number;
    productionCovered: number;
    totalCost?: number;
    avgCostPerGross?: number | null;
  };
}

interface LiveCostToolRow {
  changeId: string;
  installedToolCode: string;
  installDate: string;
  runningDays: number;
  storeIssueNumber?: string | null;
  machine: ReportRow['machine'];
  component: ReportRow['component'];
  qtyUsed: number;
  unitCost: number;
  costSource?: ReportRow['costSource'];
  totalCost: number;
  productionCovered: number;
  costPerGross: number | null;
}
interface LiveCostMachineSummary {
  machine: ReportRow['machine'];
  activeToolsCount: number;
  qtyUsed: number;
  totalCost: number;
  productionCovered: number;
  combinedCostPerGross: number | null;
  earliestInstallDate: string | null;
  latestInstallDate: string | null;
  components: LiveCostToolRow[];
}
interface LiveCostingReport {
  rows: LiveCostToolRow[];
  machines: LiveCostMachineSummary[];
  totals: {
    machines: number;
    activeTools: number;
    qtyUsed: number;
    productionCovered: number;
    totalCost: number;
    avgCombinedCostPerGross: number | null;
  };
}

/* TASK26 — lifecycle records */

interface ActiveToolRec {
  id: string; machineId: string;
  machine: { id: string; machineCode?: string | null; machineNumber?: string | null; name?: string | null } | null;
  componentId: string;
  component: {
    id: string; componentCode: string; componentName: string; componentType: string;
    expectedLifeQuantity?: string | number | null; minThreshold?: string | number | null; maxThreshold?: string | number | null;
    uomCode?: string | null;
  } | null;
  installedToolCode: string; newToolDescription?: string | null;
  installDate: string; installTime?: string | null;
  installCounter?: number | null; derivedCounter?: number | null;
  usedByInstalled?: number | null; liveWeightKg?: number | null; remainingByInstalled?: number | null;
  lifeProgressPct?: number | null;
  accumulatedLifeBeforeCurrentSession?: number | null; currentSessionProduction?: number | null;
  sessionCount?: number;
  mountingSessions?: Array<{
    sessionNo: number; machineId: string; machineCode?: string | null; mountedAt: string;
    unmountedAt?: string | null; startCounter: number; endCounter?: number | null;
    sessionProduction: number; action: string; operatorName?: string | null;
    shiftInchargeName?: string | null; reason?: string | null; remarks?: string | null;
  }>;
  storeIssueId?: string | null; storeIssueNumber?: string | null;
  operatorName?: string | null; shiftInchargeName?: string | null; issuedByName?: string | null;
  jobCardNo?: string | null; changeDate: string; closedAt?: string | null;
}

interface LifeRowRec {
  id: string; machineId: string;
  machine: { id: string; machineCode?: string | null; machineNumber?: string | null; name?: string | null } | null;
  componentId: string;
  component: {
    id: string; componentCode: string; componentName: string; componentType: string;
    expectedLifeQuantity?: string | number | null; minThreshold?: string | number | null; maxThreshold?: string | number | null;
    uomCode?: string | null;
  } | null;
  toolCode: string; newToolDescription?: string | null; oldToolCode?: string | null;
  installDate: string; installTime?: string | null; removeDate?: string | null;
  installCounter?: number | null; removalCounter?: number | null; productionLife?: number | null;
  lifeProgressPct?: number | null;
  accumulatedLifeBeforeCurrentSession?: number | null; sessionCount?: number;
  mountingSessions?: ActiveToolRec['mountingSessions'];
  conditionStatus?: string | null; dispositionType?: string | null; dispositionNote?: string | null;
  reason?: string | null; remarks?: string | null; status: string; closedAt?: string | null;
  jobCardNo?: string | null; storeIssueNumber?: string | null; storeIssueId?: string | null;
  operatorName?: string | null; shiftInchargeName?: string | null; issuedByName?: string | null;
  changedAt?: string | null; changedBy?: string | null; componentType?: string;
}

interface LifeReportData {
  data: LifeRowRec[]; total: number; page: number; limit: number;
  summary: {
    installs: number; active: number; standby?: number; closed: number; withDisposition: number;
    totalProductionLife: number; avgLife: number | null; minLife: number | null; maxLife: number | null;
  };
}

interface ComponentItemLine {
  id: string; componentId: string; itemId: string;
  quantity: string | number | null; uomId?: string | null; notes?: string | null;
  item?: { id: string; itemCode: string; itemName?: string | null } | null;
  uom?: UomLk | null;
}

interface StoreIssueLk {
  id: string; issueNumber?: string | null; issueDate?: string | null; status?: string | null;
}

const EMPTY = <span style={{ color: 'var(--theme-text-muted)' }}>—</span>;

const MASTER_MACHINE_TOOLS_TAB_ID = '/master-data/machine-tools';

interface MachineToolsTabCache {
  components: ComponentRec[];
  componentsTotal: number;
  compPage: number;
  compPageSize: number;
  compSearch: string;
  activeTab: string;
  lookups: {
    machines: MachineLk[];
    items: ItemLk[];
    uoms: UomLk[];
    divisions: DivisionLk[];
    sections: SectionLk[];
    departments: DepartmentLk[];
    masterItemTypes: MasterItemTypeLk[];
  };
}

const MachineToolingManagement: React.FC = () => {
  const { message } = App.useApp();
  const { can } = usePermission();
  const { token } = theme.useToken();
  const screens = Grid.useBreakpoint();
  const isMobile = !screens.md;
  const currentUser = useUserStore((s) => s.user);
  const printedByName = useMemo(() => {
    const full = [currentUser?.firstName, currentUser?.lastName].filter(Boolean).join(' ').trim();
    return full || currentUser?.displayName || currentUser?.username || currentUser?.email || 'Muhammad Afsar';
  }, [currentUser]);
  const [logoDataUrl, setLogoDataUrl] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    let active = true;
    void loadCompanyLogoDataUrl().then((url) => {
      if (active && url) setLogoDataUrl(url);
    });
    return () => {
      active = false;
    };
  }, []);

  const [activeTab, setActiveTab] = useState(() => {
    try {
      return sessionStorage.getItem('pwi_tooling_active_tab') || 'setup';
    } catch {
      return 'setup';
    }
  });

  useEffect(() => {
    try {
      sessionStorage.setItem('pwi_tooling_active_tab', activeTab);
    } catch {}
  }, [activeTab]);

  /* ── Shared lookups ───────────────────────────────────────────────────────── */
  const [machines, setMachines] = useState<MachineLk[]>([]);
  const [items, setItems] = useState<ItemLk[]>([]);
  const [uoms, setUoms] = useState<UomLk[]>([]);
  const [divisions, setDivisions] = useState<DivisionLk[]>([]);
  const [sections, setSections] = useState<SectionLk[]>([]);
  const [departments, setDepartments] = useState<DepartmentLk[]>([]);
  const [masterItemTypes, setMasterItemTypes] = useState<MasterItemTypeLk[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const [mRes, iRes, uRes, divRes, secRes, depRes, itRes] = await Promise.allSettled([
          apiService.get<{ data: MachineLk[] }>('/machines', { limit: 500, sortBy: 'machineCode' }),
          apiService.get<{ data: ItemLk[] }>('/master-data/items', { limit: 200, sortBy: 'itemCode' }),
          apiService.get<{ data: UomLk[] }>('/master-data/uom', { limit: 500, sortBy: 'code' }),
          apiService.get<{ data: DivisionLk[] }>('/divisions', { limit: 200, status: 'ACTIVE' }),
          apiService.get<{ data: SectionLk[] }>('/sections', { limit: 500 }),
          apiService.get<{ data: DepartmentLk[] }>('/departments', { limit: 500, status: 'ACTIVE', departmentType: 'PRODUCTION' }),
          apiService.get<{ data: MasterItemTypeLk[] }>('/master-data/item-types', { limit: 500 }),
        ]);
        const unpack = (res: PromiseSettledResult<any>) =>
          res.status === 'fulfilled' ? (res.value?.data || (Array.isArray(res.value) ? res.value : [])) : [];

        setMachines(unpack(mRes));
        setItems(unpack(iRes));
        setUoms(unpack(uRes));
        setDivisions(unpack(divRes));
        setSections(unpack(secRes));
        setDepartments(unpack(depRes));
        setMasterItemTypes(unpack(itRes));
      } catch {
        message.warning('Could not load machine / item / UOM lookups');
      }
    })();
  }, [message]);

  const machineOptions = useMemo(
    () =>
      machines.map((m) => ({
        value: m.id,
        label: `${m.machineCode ?? m.id}${m.machineNumber ? ` ${m.machineNumber}` : ''}${m.name ? ` — ${m.name}` : ''}`,
      })),
    [machines],
  );
  const itemOptions = useMemo(
    () =>
      items.map((i) => ({
        value: i.id,
        label: i.name ? `${i.itemCode} — ${i.name}` : i.itemCode,
        // searchText is used by filterOption to search both code and name
        searchText: `${i.itemCode} ${i.name || ''}`.toLowerCase(),
      })),
    [items],
  );
  const uomOptions = useMemo(
    () => uoms.map((u) => ({ value: u.id, label: u.code })),
    [uoms],
  );

  /* ── Save result dialog (shared by component + change saves) ─────────────── */
  const [resultOpen, setResultOpen] = useState(false);
  const [resultPhase, setResultPhase] = useState<SaveResultPhase>('loading');
  const [resultData, setResultData] = useState<SaveResultData | null>(null);
  const [resultError, setResultError] = useState('');
  const [resultErrorTitle, setResultErrorTitle] = useState<string | undefined>(undefined);
  const [resultErrorLead, setResultErrorLead] = useState<string | undefined>(undefined);
  const [saving, setSaving] = useState(false);
  const lastSubmit = useRef<{ kind: 'component' | 'change'; payload: any } | null>(null);

  const runSave = async (kind: 'component' | 'change', payload: any) => {
    lastSubmit.current = { kind, payload };
    setResultErrorTitle(undefined);
    setResultErrorLead(undefined);
    setSaving(true);
    setResultOpen(true);
    setResultPhase('loading');
    setResultData(null);
    setResultError('');
    try {
      if (kind === 'component') {
        if (editingComponent) {
          await apiService.put(`/machine-tooling/components/${editingComponent.id}`, payload);
        } else {
          await apiService.post('/machine-tooling/components', payload);
        }
      } else {
        if (editingChange) {
          await apiService.put(`/machine-tooling/changes/${editingChange.id}`, payload);
        } else {
          await apiService.post('/machine-tooling/changes', payload);
        }
      }
      const code = payload.componentCode || payload.newToolCode || null;
      const name = payload.componentName || payload.newToolDescription || null;
      setResultData({
        title: (code ? code : '') + (code && name ? ' — ' : '') + (name ? name : ''),
        recordType: kind === 'component' ? 'Component' : 'Change',
        recordCode: code || undefined,
        recordName: name || undefined,
      });
      setResultPhase('success');
    } catch (err: any) {
      setResultError(extractApiError(err, kind === 'component' ? 'Failed to save component' : 'Failed to record change'));
      setResultPhase('error');
    } finally {
      setSaving(false);
    }
  };

  const handleResultClose = () => {
    setResultOpen(false);
    if (resultPhase === 'success') {
      if (lastSubmit.current?.kind === 'component') {
        setCompModalOpen(false);
        compForm.resetFields();
        fetchComponents(editingComponent ? compPage : 1);
        if (!editingComponent) setCompPage(1);
      } else {
        setChangeModalOpen(false);
        changeForm.resetFields();
        fetchChanges(editingChange ? chgPage : 1);
        if (!editingChange) setChgPage(1);
      }
    }
  };
  const handleResultRetry = () => {
    if (lastSubmit.current) runSave(lastSubmit.current.kind, lastSubmit.current.payload);
  };

  /* ── Tab 1: Component setup ──────────────────────────────────────────────── */
  const cachedMaster = tabSessionCache.get<MachineToolsTabCache>(MASTER_MACHINE_TOOLS_TAB_ID);
  const [components, setComponents] = useState<ComponentRec[]>(() => cachedMaster?.components ?? []);
  const [componentsTotal, setComponentsTotal] = useState<number>(() => cachedMaster?.componentsTotal ?? 0);
  const [componentsLoading, setComponentsLoading] = useState<boolean>(() => !cachedMaster || !Array.isArray(cachedMaster.components) || cachedMaster.components.length === 0);
  const [compPage, setCompPage] = useState<number>(() => {
    try {
      const p = sessionStorage.getItem('pwi_tooling_comp_page');
      return p ? parseInt(p, 10) : 1;
    } catch { return 1; }
  });
  const [compPageSize, setCompPageSize] = useState(20);
  const [compSearch, setCompSearch] = useState<string>(() => {
    try { return sessionStorage.getItem('pwi_tooling_comp_search') || ''; } catch { return ''; }
  });
  const [fCompMachine, setFCompMachine] = useState<string | undefined>(() => {
    try { return sessionStorage.getItem('pwi_tooling_comp_machine') || undefined; } catch { return undefined; }
  });
  const [fCompType, setFCompType] = useState<string | undefined>(() => {
    try { return sessionStorage.getItem('pwi_tooling_comp_type') || undefined; } catch { return undefined; }
  });
  const [compModalOpen, setCompModalOpen] = useState(false);
  const [editingComponent, setEditingComponent] = useState<ComponentRec | null>(null);
  const [compForm] = Form.useForm();
  const [liveCompValues, setLiveCompValues] = useState<Record<string, any>>({ componentType: 'TOOLING', machineIds: [] });

  useEffect(() => {
    try {
      if (compSearch) sessionStorage.setItem('pwi_tooling_comp_search', compSearch);
      else sessionStorage.removeItem('pwi_tooling_comp_search');
      if (fCompMachine) sessionStorage.setItem('pwi_tooling_comp_machine', fCompMachine);
      else sessionStorage.removeItem('pwi_tooling_comp_machine');
      if (fCompType) sessionStorage.setItem('pwi_tooling_comp_type', fCompType);
      else sessionStorage.removeItem('pwi_tooling_comp_type');
      sessionStorage.setItem('pwi_tooling_comp_page', String(compPage));
    } catch {}
  }, [compSearch, fCompMachine, fCompType, compPage]);

  // Modal store item search & filters (1. Division, 2. Section, 3. Department, 4. Item Type)
  const [itemFilterDivision, setItemFilterDivision] = useState<string | undefined>(undefined);
  const [itemFilterSection, setItemFilterSection] = useState<string | undefined>(undefined);
  const [itemFilterDepartment, setItemFilterDepartment] = useState<string | undefined>(undefined);
  const [itemFilterType, setItemFilterType] = useState<string | undefined>('Tooling');
  const [itemSearchText, setItemSearchText] = useState<string>('');
  const [modalItems, setModalItems] = useState<ItemLk[]>([]);
  const [modalItemsLoading, setModalItemsLoading] = useState(false);
  const [showLiveSheet, setShowLiveSheet] = useState(true);

  const searchStoreItems = useCallback(async (
    query?: string,
    divId?: string,
    secId?: string,
    depId?: string,
    typeVal?: string,
  ) => {
    setModalItemsLoading(true);
    try {
      const params: any = {
        limit: 300,
        sortBy: 'itemCode',
        sortOrder: 'ASC',
      };
      if (query && query.trim()) params.search = query.trim();
      if (divId) params.divisionId = divId;
      if (secId) params.sectionId = secId;
      if (depId) params.departmentId = depId;
      if (typeVal) params.itemType = typeVal;

      const res = await apiService.get<{ data: ItemLk[] }>('/master-data/items', params, { silent: true });
      const data = (res as any)?.data || (Array.isArray(res) ? res : []);
      setModalItems(data);
    } catch (err) {
      console.error('Failed to query store items', err);
    } finally {
      setModalItemsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!compModalOpen) return;
    const timer = setTimeout(() => {
      searchStoreItems(
        itemSearchText,
        itemFilterDivision,
        itemFilterSection,
        itemFilterDepartment,
        itemFilterType,
      );
    }, 280);
    return () => clearTimeout(timer);
  }, [compModalOpen, itemSearchText, itemFilterDivision, itemFilterSection, itemFilterDepartment, itemFilterType, searchStoreItems]);

  const availableSections = useMemo(() => {
    if (!itemFilterDivision) return sections;
    return sections.filter((s) => s.divisionId === itemFilterDivision);
  }, [sections, itemFilterDivision]);

  const availableDepartments = useMemo(() => {
    if (itemFilterSection) {
      const secObj = sections.find((s) => s.id === itemFilterSection);
      const secDeptIds = new Set<string>();
      if (secObj && (secObj as any).departments && Array.isArray((secObj as any).departments)) {
        (secObj as any).departments.forEach((sd: any) => secDeptIds.add(sd.id));
      }
      return departments.filter((d) => {
        const sid = d.sectionId || (d as any).section?.id || (d as any).section_id;
        return (sid && sid === itemFilterSection) || secDeptIds.has(d.id);
      });
    }
    if (itemFilterDivision) {
      return departments.filter((d) => {
        const did = d.divisionId || (d as any).division?.id || (d as any).division_id;
        return did && did === itemFilterDivision;
      });
    }
    return departments;
  }, [departments, sections, itemFilterDivision, itemFilterSection]);

  const [scopeItemTypes, setScopeItemTypes] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const params: any = {};
        if (itemFilterDepartment) params.departmentId = itemFilterDepartment;
        else if (itemFilterSection) params.sectionId = itemFilterSection;
        else if (itemFilterDivision) params.divisionId = itemFilterDivision;

        const res: any = await apiService.get('/master-data/items/distinct-types', params, { silent: true });
        const types: string[] = res?.data || (Array.isArray(res) ? res : []);
        if (!cancelled) {
          setScopeItemTypes(types);
        }
      } catch (err) {
        console.error('Failed to load distinct item types', err);
      }
    })();
    return () => { cancelled = true; };
  }, [itemFilterDivision, itemFilterSection, itemFilterDepartment]);

  const itemTypeOptions = useMemo(() => {
    const formatType = (raw: string) => {
      const upper = raw.toUpperCase().replace(/[-\s]/g, '_');
      if (upper === 'TOOLS' || upper === 'TOOLING') return 'Tooling';
      if (upper === 'SPARE_PART') return 'Spare Part';
      if (upper === 'SEMI_FINISHED') return 'Semi-Finished';
      if (upper === 'FINISHED_GOOD') return 'Finished Good';
      if (upper === 'RAW_MATERIAL') return 'Raw Material';
      if (upper === 'CONSUMABLE') return 'Consumable';
      if (upper === 'PACKAGING_MATERIAL') return 'Packaging Material';
      if (upper === 'WORK_IN_PROGRESS') return 'Work In Progress';
      if (upper === 'ASSET') return 'Asset';
      if (upper === 'OTHER') return 'Other';
      return raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase().replace(/_/g, ' ');
    };

    if (itemFilterDepartment || itemFilterSection || itemFilterDivision) {
      if (scopeItemTypes.length > 0) {
        const unique = new Map<string, string>();
        scopeItemTypes.forEach((t) => {
          const label = formatType(t);
          if (!unique.has(label.toLowerCase())) {
            unique.set(label.toLowerCase(), label);
          }
        });
        return Array.from(unique.values()).map((val) => ({ value: val, label: val }));
      }
      return [];
    }

    const standard = ['Tooling', 'Spare Part', 'Consumable', 'Raw Material', 'Semi-Finished', 'Finished Good', 'Asset', 'Other'];
    return standard.map((s) => ({ value: s, label: s }));
  }, [scopeItemTypes, itemFilterDivision, itemFilterSection, itemFilterDepartment]);

  useEffect(() => {
    if (itemTypeOptions.length > 0 && itemFilterType) {
      const exists = itemTypeOptions.some((o) => o.value.toLowerCase() === itemFilterType.toLowerCase());
      if (!exists) {
        const hasTooling = itemTypeOptions.some((o) => o.value.toLowerCase() === 'tooling');
        setItemFilterType(hasTooling ? 'Tooling' : undefined);
      }
    }
  }, [itemTypeOptions, itemFilterType]);

  const displayedItems = useMemo(() => {
    const list = [...modalItems];
    const currentId = liveCompValues.itemId;
    if (currentId && !list.some((i) => i.id === currentId)) {
      const foundInMain = items.find((i) => i.id === currentId);
      if (foundInMain) {
        list.unshift(foundInMain);
      } else if (editingComponent?.item && editingComponent.item.id === currentId) {
        list.unshift(editingComponent.item);
      }
    }
    return list;
  }, [modalItems, items, liveCompValues.itemId, editingComponent]);

  const modalItemOptions = useMemo(() => {
    return displayedItems.map((i) => {
      const divName = i.division?.name || divisions.find((d) => d.id === i.divisionId)?.name;
      const secName = i.section?.name || sections.find((s) => s.id === i.sectionId)?.name;
      const depName = i.department?.name || departments.find((d) => d.id === i.departmentId)?.name;
      const locStr = [divName, secName, depName].filter(Boolean).join(' › ');
      const typeStr = i.itemType ? ` [${i.itemType}]` : '';
      const locSuffix = locStr ? ` (${locStr})` : '';

      return {
        value: i.id,
        label: `${i.itemCode} — ${i.name || i.itemCode}${typeStr}${locSuffix}`,
        searchText: `${i.itemCode} ${i.name || ''} ${i.itemType || ''} ${locStr}`.toLowerCase(),
      };
    });
  }, [displayedItems, divisions, sections, departments]);

  // Optional machine-department sub-filter inside Machine(s) picker (independent of Store Item department e.g. SPI General Store)
  const [modalMachineDeptFilter, setModalMachineDeptFilter] = useState<string | undefined>(undefined);

  const modalDivisionMachines = useMemo(() => {
    if (!itemFilterDivision) return machines;
    return machines.filter((m) => m.divisionId === itemFilterDivision);
  }, [machines, itemFilterDivision]);

  const modalMachineDeptChips = useMemo(() => {
    const counts = new Map<string, { id: string; name: string; count: number }>();
    for (const m of modalDivisionMachines) {
      if (!m.departmentId) continue;
      const depName = departments.find((d) => d.id === m.departmentId)?.name;
      if (!depName || /store/i.test(depName)) continue;
      const cur = counts.get(m.departmentId) || { id: m.departmentId, name: depName, count: 0 };
      cur.count += 1;
      counts.set(m.departmentId, cur);
    }
    return Array.from(counts.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [modalDivisionMachines, departments]);

  const modalMachineOptions = useMemo(() => {
    let list = modalDivisionMachines;
    if (modalMachineDeptFilter) {
      list = list.filter((m) => m.departmentId === modalMachineDeptFilter);
    }

    const selectedIds: string[] = Array.isArray(liveCompValues.machineIds)
      ? liveCompValues.machineIds
      : liveCompValues.machineId
        ? [liveCompValues.machineId]
        : [];
    for (const id of selectedIds) {
      if (id && !list.some((m) => m.id === id)) {
        const activeMach = machines.find((m) => m.id === id);
        if (activeMach) list = [activeMach, ...list];
      }
    }

    return list.map((m) => {
      const depName = departments.find((d) => d.id === m.departmentId)?.name;
      const secName = sections.find((s) => s.id === m.sectionId)?.name;
      const deptTag = depName || secName ? ` [${depName || secName}]` : '';
      return {
        value: m.id,
        label: `${m.machineCode ?? m.id}${m.machineNumber ? ` (${m.machineNumber})` : ''} — ${m.name || 'Machine'}${deptTag}`,
        searchText: `${m.machineCode || ''} ${m.machineNumber || ''} ${m.name || ''} ${depName || ''}`.toLowerCase(),
      };
    });
  }, [modalDivisionMachines, modalMachineDeptFilter, machines, departments, sections, liveCompValues.machineIds, liveCompValues.machineId]);

  const liveCompMachines = useMemo(() => {
    const selectedIds: string[] = Array.isArray(liveCompValues.machineIds)
      ? liveCompValues.machineIds
      : liveCompValues.machineId
        ? [liveCompValues.machineId]
        : [];
    return selectedIds
      .map((id) => machines.find((m) => m.id === id))
      .filter((m): m is MachineLk => Boolean(m));
  }, [machines, liveCompValues.machineIds, liveCompValues.machineId]);
  const liveCompStoreItem = useMemo(
    () => displayedItems.find((i) => i.id === liveCompValues.itemId) || items.find((i) => i.id === liveCompValues.itemId),
    [displayedItems, items, liveCompValues.itemId],
  );
  const liveCompUom = useMemo(
    () => uoms.find((u) => u.id === liveCompValues.uomId),
    [uoms, liveCompValues.uomId],
  );

  // Minimized Window Tabs State
  const [isCompMinimized, setIsCompMinimized] = useState(false);
  const [isChangeMinimized, setIsChangeMinimized] = useState(false);
  const [isInstallMinimized, setIsInstallMinimized] = useState(false);
  const [isDetailMinimized, setIsDetailMinimized] = useState(false);
  const [isHistoryMinimized, setIsHistoryMinimized] = useState(false);

  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyData, setHistoryData] = useState<ComponentHistory | null>(null);
  const [historyComponentId, setHistoryComponentId] = useState<string | null>(null);
  const [historyMachineFilter, setHistoryMachineFilter] = useState<string>('ALL');

  const fetchComponents = async (pageNum: number = 1) => {
    setComponentsLoading(true);
    try {
      const params: any = { page: pageNum, limit: compPageSize };
      if (compSearch) params.search = compSearch;
      if (fCompMachine) params.machineId = fCompMachine;
      if (fCompType) params.componentType = fCompType;
      const res = await apiService.get<{ data: ComponentRec[]; total: number }>('/machine-tooling/components', params);
      setComponents(res.data || []);
      setComponentsTotal(res.total || 0);
      // Persist to session cache so switching back restores the tool registry instantly
      tabSessionCache.set<MachineToolsTabCache>(MASTER_MACHINE_TOOLS_TAB_ID, {
        components: res.data || [],
        componentsTotal: res.total || 0,
        compPage: pageNum,
        compPageSize,
        compSearch,
        activeTab,
        lookups: { machines, items, uoms, divisions, sections, departments, masterItemTypes },
      });
    } catch (error: any) {
      message.error(extractApiError(error, 'Failed to fetch components'));
    } finally {
      setComponentsLoading(false);
    }
  };

  const fetchComponentsRef = useRef(fetchComponents);
  fetchComponentsRef.current = fetchComponents;

  // Only skip the fetch when the cache actually holds populated components.
  // A cache entry with an empty `components` array (e.g. from a prior failed
  // load) must still trigger a fresh fetch on mount so the page is never blank.
  const cachedHasPopulatedComponents = (() => {
    const c = tabSessionCache.get<MachineToolsTabCache>(MASTER_MACHINE_TOOLS_TAB_ID);
    return !!c && Array.isArray(c.components) && c.components.length > 0;
  })();

  useEffect(() => {
    if (activeTab === 'setup' && !cachedHasPopulatedComponents) {
      void fetchComponentsRef.current(compPage);
    }
    // `fetchComponents` is intentionally NOT a dependency: it is a plain async
    // function, so its identity changed every render and re-ran this effect
    // after every `setComponentsLoading` — an unbounded request loop whenever
    // the endpoint errored or returned an empty list (the cache guard is only
    // written on success). The ref always holds the latest closure.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, compPage, cachedHasPopulatedComponents]);

  // Global header/tab refresh event listener
  useEffect(() => {
    const handleGlobalRefresh = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!detail?.tabId || String(detail.tabId).startsWith(MASTER_MACHINE_TOOLS_TAB_ID)) {
        tabSessionCache.remove(MASTER_MACHINE_TOOLS_TAB_ID);
        if (activeTab === 'setup') void fetchComponentsRef.current(compPage);
      }
    };
    window.addEventListener(TAB_REFRESH_EVENT, handleGlobalRefresh);
    return () => window.removeEventListener(TAB_REFRESH_EVENT, handleGlobalRefresh);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, compPage]);

  const handleCreateComponent = () => {
    setIsCompMinimized(false);
    setEditingComponent(null);
    compForm.resetFields();
    const initialDefaults = {
      componentType: 'TOOLING',
      machineIds: [],
      expectedLifeQuantity: 600000,
      minThreshold: 300000,
      maxThreshold: 600000,
    };
    compForm.setFieldsValue(initialDefaults);
    setLiveCompValues(initialDefaults);
    setItemFilterDivision(undefined);
    setItemFilterDepartment(undefined);
    setItemFilterSection(undefined);
    setModalMachineDeptFilter(undefined);
    setItemFilterType('Tooling');
    setItemSearchText('');
    setCompModalOpen(true);
  };

  const handleItemSelectChange = (selectedItemId?: string) => {
    if (!selectedItemId) {
      // Clear auto-filled fields when item is cleared
      compForm.setFieldsValue({
        componentName: undefined,
        componentCode: undefined,
        uomId: undefined,
      });
      setLiveCompValues((prev) => ({
        ...prev,
        itemId: undefined,
        componentName: undefined,
        componentCode: undefined,
        uomId: undefined,
      }));
      return;
    }
    const item = displayedItems.find((i) => i.id === selectedItemId) || items.find((i) => i.id === selectedItemId);
    if (item) {
      const uomId = item.baseUomId || item.baseUom?.id;
      const upperName = ((item.name || '') + ' ' + (item.itemCode || '')).toUpperCase();
      let inferredType: 'TOOLING' | 'SPARE_CONSUMABLE' = 'TOOLING';
      if (
        upperName.includes('CHAIN') ||
        upperName.includes('BEARING') ||
        upperName.includes('BELT') ||
        upperName.includes('SENSOR') ||
        upperName.includes('SPARE') ||
        upperName.includes('CONSUMABLE')
      ) {
        inferredType = 'SPARE_CONSUMABLE';
      }

      const updates: any = {
        itemId: selectedItemId,
        componentName: item.name || item.itemCode,
        componentCode: item.itemCode,
        ...(uomId ? { uomId } : {}),
        componentType: inferredType,
      };

      compForm.setFieldsValue(updates);
      setLiveCompValues((prev) => ({
        ...prev,
        ...updates,
      }));
    }
  };

  const handleEditComponent = (record: ComponentRec) => {
    setIsCompMinimized(false);
    setEditingComponent(record);
    const assignedIds = Array.isArray(record.machineIds) && record.machineIds.length > 0
      ? record.machineIds
      : record.machineId
        ? [record.machineId]
        : [];
    const initialVals = {
      machineIds: assignedIds,
      machineId: assignedIds[0] || record.machineId,
      componentType: normalizeComponentTypeClient(record.componentType),
      componentName: record.componentName,
      componentCode: record.componentCode,
      itemId: record.itemId || undefined,
      uomId: record.uomId || undefined,
      expectedLifeQuantity: num(record.expectedLifeQuantity) ?? 600000,
      minThreshold: num(record.minThreshold) ?? 300000,
      maxThreshold: num(record.maxThreshold) ?? 600000,
      description: record.description || undefined,
    };
    compForm.setFieldsValue(initialVals);
    setLiveCompValues(initialVals);

    const itemRec = record.item || items.find((i) => i.id === record.itemId);
    if (itemRec) {
      if (itemRec.divisionId) setItemFilterDivision(itemRec.divisionId);
      if (itemRec.sectionId) setItemFilterSection(itemRec.sectionId);
      if (itemRec.departmentId) setItemFilterDepartment(itemRec.departmentId);
      if (itemRec.itemType) setItemFilterType(/tool/i.test(itemRec.itemType) ? 'Tooling' : itemRec.itemType);
      setModalItems((prev) => (prev.some((x) => x.id === itemRec.id) ? prev : [itemRec, ...prev]));
    } else {
      setItemFilterDivision(undefined);
      setItemFilterSection(undefined);
      setItemFilterDepartment(undefined);
      setItemFilterType('Tooling');
    }
    setModalMachineDeptFilter(undefined);
    setItemSearchText('');
    setCompModalOpen(true);
  };

  const buildComponentPayload = (values: any): any => {
    const machineIds: string[] = Array.isArray(values.machineIds)
      ? values.machineIds.filter(Boolean)
      : values.machineId
        ? [values.machineId]
        : [];
    return {
      ...values,
      machineIds,
      machineId: machineIds[0] || values.machineId,
      componentType: normalizeComponentTypeClient(values.componentType),
      expectedLifeQuantity: values.expectedLifeQuantity != null ? Number(values.expectedLifeQuantity) : undefined,
      minThreshold: values.minThreshold != null ? Number(values.minThreshold) : undefined,
      maxThreshold: values.maxThreshold != null ? Number(values.maxThreshold) : undefined,
    };
  };

  const handleSaveComponent = async () => {
    if (saving) return;
    try {
      const values = await compForm.validateFields();
      await runSave('component', buildComponentPayload(values));
    } catch (err: any) {
      const val = handleValidationErrors(err, compForm);
      if (val) {
        setResultErrorTitle('Required Information Missing');
        setResultErrorLead('Please complete all required fields before saving:');
        setResultError(val.bulletList);
        setResultPhase('error');
        setResultOpen(true);
        return;
      }
      message.error(extractApiError(err, 'Failed to save component'));
    }
  };

  const handleToggleComponentStatus = async (record: ComponentRec) => {
    try {
      const status = record.isActive ? 'INACTIVE' : 'ACTIVE';
      await apiService.patch(`/machine-tooling/components/${record.id}/status`, { status });
      message.success(`Component ${record.componentCode} ${status === 'ACTIVE' ? 'activated' : 'deactivated'}`);
      fetchComponents(compPage);
    } catch (error: any) {
      message.error(extractApiError(error, 'Failed to change status'));
    }
  };

  const handleDeleteComponent = async (record: ComponentRec) => {
    try {
      await apiService.delete(`/machine-tooling/components/${record.id}`);
      message.success(`Component ${record.componentCode} deleted`);
      fetchComponents(compPage);
    } catch (error: any) {
      const errMsg = extractApiError(error, 'Failed to delete component');
      if (errMsg.toLowerCase().includes('deactivate it instead')) {
        try {
          await apiService.patch(`/machine-tooling/components/${record.id}/status`, { status: 'INACTIVE' });
          message.warning(`Component '${record.componentCode}' has change history, so it was deactivated instead of deleted.`);
          fetchComponents(compPage);
          return;
        } catch (deactErr: any) {
          message.error(extractApiError(deactErr, 'Failed to deactivate component'));
          return;
        }
      }
      message.error(errMsg);
    }
  };

  const loadHistoryForComponent = useCallback(async (componentId: string, machineIdFilter: string = 'ALL') => {
    setHistoryLoading(true);
    try {
      const params: Record<string, string> = { counter: 'derive' };
      if (machineIdFilter && machineIdFilter !== 'ALL') {
        params.machineId = machineIdFilter;
      }
      const res = await apiService.get<any>(
        `/machine-tooling/components/${componentId}/history`,
        params,
      );
      setHistoryData(res?.data ?? res);
    } catch (error: any) {
      message.error(extractApiError(error, 'Failed to load component history'));
      setHistoryOpen(false);
    } finally {
      setHistoryLoading(false);
    }
  }, [message]);

  const handleViewHistory = async (record: ComponentRec) => {
    setIsHistoryMinimized(false);
    setHistoryOpen(true);
    setHistoryData(null);
    setHistoryComponentId(record.id);
    setHistoryMachineFilter('ALL');
    await loadHistoryForComponent(record.id, 'ALL');
  };

  // Tooling Component Setup Column Visibility
  const DEFAULT_TOOLING_COMP_COLUMNS: Record<string, boolean> = {
    component: true,
    machine: true,
    componentType: true,
    expectedLife: true,
    thresholds: true,
    item: true,
    status: true,
    actions: true,
  };
  const TOOLING_COMP_COLUMN_LABELS: Record<string, string> = {
    component: 'Component',
    machine: 'Machine',
    componentType: 'Type',
    expectedLife: 'Expected Life',
    thresholds: 'Life Window',
    item: 'Item Code',
    status: 'Status',
    actions: 'Actions',
  };
  const [compVisibleCols, setCompVisibleCols] = useState<Record<string, boolean>>(() => {
    try {
      const stored = localStorage.getItem('erp_tooling_comp_cols');
      return stored ? { ...DEFAULT_TOOLING_COMP_COLUMNS, ...JSON.parse(stored) } : DEFAULT_TOOLING_COMP_COLUMNS;
    } catch {
      return DEFAULT_TOOLING_COMP_COLUMNS;
    }
  });

  const renderToolItemStack = useCallback(
    (
      code?: string | null,
      name?: string | null,
      opts?: {
        linkedItemCode?: string | null;
        extraMeta?: string | null;
        withIcon?: boolean;
      },
    ) => {
      const codeStr = String(code || '').trim();
      const rawName = String(name || codeStr || '—').trim();
      const parenIdx = rawName.indexOf('(');
      const mainName = parenIdx > 0 ? rawName.slice(0, parenIdx).trim() : rawName;
      const specPart = parenIdx > 0 ? rawName.slice(parenIdx).trim() : '';
      const linkedDifferent =
        opts?.linkedItemCode &&
        opts.linkedItemCode.toUpperCase() !== codeStr.toUpperCase();

      const content = (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
          {/* Line 1 (Top): Bold Orange Item Code pill */}
          {(codeStr || linkedDifferent) && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
              {codeStr && (
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    color: '#EA580C',
                    background: '#FFF7ED',
                    border: '1px solid #FED7AA',
                    fontWeight: 700,
                    fontSize: 12,
                    lineHeight: '18px',
                    padding: '0 7px',
                    borderRadius: 5,
                    letterSpacing: '0.02em',
                    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                  }}
                >
                  {opts?.linkedItemCode &&
                    opts.linkedItemCode.toUpperCase() === codeStr.toUpperCase() && (
                      <LinkOutlined style={{ fontSize: 10.5 }} />
                    )}
                  {codeStr}
                </span>
              )}
              {linkedDifferent && (
                <Tag color="cyan" style={{ fontSize: 10.5, padding: '0 5px', borderRadius: 4, margin: 0 }}>
                  <LinkOutlined style={{ marginRight: 2 }} />
                  {opts?.linkedItemCode}
                </Tag>
              )}
              {opts?.extraMeta && (
                <span style={{ fontSize: 10.5, fontWeight: 600, color: token.colorTextTertiary }}>
                  {opts.extraMeta}
                </span>
              )}
            </div>
          )}

          {/* Line 2 (Middle): Main Item Name before '(' */}
          <span
            style={{
              fontWeight: 700,
              fontSize: 13,
              lineHeight: 1.3,
              color: token.colorText,
              whiteSpace: 'normal',
              wordBreak: 'break-word',
            }}
          >
            {mainName}
          </span>

          {/* Line 3 (Bottom): Bracket specification starting at '(' without truncation */}
          {specPart && (
            <span
              style={{
                fontSize: 11.5,
                fontWeight: 600,
                lineHeight: 1.3,
                color: token.colorTextSecondary,
                whiteSpace: 'normal',
                wordBreak: 'break-word',
              }}
            >
              {specPart}
            </span>
          )}
        </div>
      );

      if (!opts?.withIcon) return content;

      return (
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <div
            style={{
              width: 34,
              height: 34,
              borderRadius: 9,
              background: 'linear-gradient(135deg, rgba(234, 88, 12, 0.12) 0%, rgba(249, 115, 22, 0.14) 100%)',
              border: '1px solid rgba(234, 88, 12, 0.25)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#EA580C',
              fontSize: 15,
              flexShrink: 0,
              marginTop: 2,
            }}
          >
            <ToolOutlined />
          </div>
          {content}
        </div>
      );
    },
    [token.colorText, token.colorTextSecondary, token.colorTextTertiary],
  );

  const renderDateValue = useCallback(
    (date?: string | null, time?: string | null) => {
      if (!date) return EMPTY;
      if (!time) {
        return <span className="pwi-date-navy">{date}</span>;
      }
      return (
        <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.3 }}>
          <span className="pwi-date-navy">{date}</span>
          <span
            style={{
              fontSize: 11,
              fontWeight: 500,
              color: token.colorTextTertiary,
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {time}
          </span>
        </div>
      );
    },
    [token.colorTextTertiary],
  );

  type ActionPillVariant = 'blue' | 'green' | 'amber' | 'orange' | 'red';
  const ACTION_PILL_STYLES: Record<ActionPillVariant, React.CSSProperties> = {
    blue: { color: '#1D4ED8', background: '#DBEAFE', border: '1px solid #93C5FD' },
    green: { color: '#15803D', background: '#DCFCE7', border: '1px solid #86EFAC' },
    amber: { color: '#B45309', background: '#FEF3C7', border: '1px solid #FCD34D' },
    orange: { color: '#C2410C', background: '#FFEDD5', border: '1px solid #FDBA74' },
    red: { color: '#B91C1C', background: '#FEE2E2', border: '1px solid #FCA5A5' },
  };

  const renderActionPill = (
    variant: ActionPillVariant,
    icon: React.ReactNode,
    title: string,
    ariaLabel: string,
    onClick?: () => void,
  ) => (
    <Tooltip title={title}>
      <button
        type="button"
        className={`pwi-action-pill pwi-action-pill--${variant}`}
        aria-label={ariaLabel}
        {...(onClick ? { onClick } : {})}
        style={{
          width: 28,
          height: 28,
          minWidth: 28,
          padding: 0,
          borderRadius: 7,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          fontSize: 13.5,
          lineHeight: 1,
          transition: 'transform 0.14s ease, box-shadow 0.14s ease, filter 0.14s ease',
          ...ACTION_PILL_STYLES[variant],
        }}
      >
        {icon}
      </button>
    </Tooltip>
  );

  const renderLiveBadge = (label: string = 'Live') => (
    <span
      className="pwi-live-pill"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        padding: '1px 8px 1px 6px',
        borderRadius: 999,
        background: '#DCFCE7',
        color: '#15803D',
        border: '1px solid #86EFAC',
        fontSize: 10.5,
        fontWeight: 700,
        lineHeight: '16px',
        whiteSpace: 'nowrap',
      }}
    >
      <span className="pwi-live-dot" aria-hidden="true" />
      <span>{label}</span>
    </span>
  );

  const componentColumns: ColumnsType<ComponentRec> = [
    {
      title: 'Component', key: 'component', width: 295,
      sorter: (a, b) => a.componentName.localeCompare(b.componentName),
      render: (_, r) =>
        renderToolItemStack(r.componentCode, r.componentName, {
          linkedItemCode: r.item?.itemCode,
          withIcon: true,
        }),
    },
    {
      title: 'Machine(s)', key: 'machine', width: 270, sorter: true,
      render: (_, r) => {
        const list =
          Array.isArray(r.machines) && r.machines.length > 0
            ? r.machines
            : r.machine
              ? [r.machine]
              : [];
        if (list.length === 0) {
          return <Tag color="default" style={{ borderRadius: 6, color: '#94a3b8' }}>Unassigned</Tag>;
        }
        return (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, alignItems: 'center' }}>
            {list.map((m) => (
              <Tooltip
                key={m.id}
                title={m.name && m.name !== m.machineCode ? `${m.machineCode} — ${m.name}` : (m.machineCode ?? m.name)}
              >
                <Tag
                  color="geekblue"
                  icon={<ClusterOutlined />}
                  style={{
                    margin: 0,
                    borderRadius: 6,
                    fontWeight: 600,
                    fontSize: 11.5,
                    padding: '1px 7px',
                  }}
                >
                  {m.machineCode ?? m.name ?? m.id}
                </Tag>
              </Tooltip>
            ))}
          </div>
        );
      },
    },
    {
      title: 'Type', dataIndex: 'componentType', key: 'componentType', width: 155,
      render: (t: string) => {
        const norm = normalizeComponentTypeClient(t);
        const s =
          norm === 'SPARE_CONSUMABLE'
            ? { bg: 'rgba(14, 165, 233, 0.1)', color: '#0284c7', border: 'rgba(14, 165, 233, 0.3)' }
            : { bg: 'rgba(99, 102, 241, 0.1)', color: '#4f46e5', border: 'rgba(99, 102, 241, 0.3)' };
        return (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              padding: '3px 10px',
              borderRadius: 20,
              fontSize: 11.5,
              fontWeight: 700,
              letterSpacing: 0.2,
              background: s.bg,
              color: s.color,
              border: `1px solid ${s.border}`,
              whiteSpace: 'nowrap',
            }}
          >
            {formatComponentTypeLabel(t)}
          </span>
        );
      },
    },
    {
      title: 'Expected Life', key: 'expectedLife', width: 140,
      render: (_, r) => {
        const val = r.expectedLifeQuantity;
        if (val == null) return <span style={{ color: '#94a3b8' }}>—</span>;
        return (
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(99, 102, 241, 0.06)', padding: '3px 10px', borderRadius: 8, border: '1px solid rgba(99, 102, 241, 0.2)' }}>
            <span style={{ fontWeight: 700, fontSize: 13, color: '#4338ca' }}>
              {fmtNum(val)}
            </span>
            <Tag color="purple" style={{ fontSize: 10, lineHeight: '16px', padding: '0 4px', margin: 0, borderRadius: 4, fontWeight: 700 }}>
              {PRODUCTION_UOM}
            </Tag>
          </div>
        );
      },
    },
    {
      title: 'Life Window', key: 'thresholds', width: 140,
      render: (_, r) => {
        const lo = num(r.minThreshold);
        const hi = num(r.maxThreshold);
        if (lo === null && hi === null) return <span style={{ color: '#94a3b8' }}>—</span>;
        return (
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: '#f8fafc', padding: '3px 8px', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: 11 }}>
            <span style={{ color: '#059669', fontWeight: 600 }}>{lo !== null ? fmtNum(lo) : '0'}</span>
            <span style={{ color: '#94a3b8' }}>→</span>
            <span style={{ color: '#dc2626', fontWeight: 600 }}>{hi !== null ? fmtNum(hi) : '∞'}</span>
          </div>
        );
      },
    },
    {
      title: 'Store Item', key: 'item', width: 220,
      render: (_, r) =>
        r.item ? (
          <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.25 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Tag color="cyan" style={{ fontSize: 11, fontWeight: 700, borderRadius: 4, margin: 0 }}>
                {r.item.itemCode}
              </Tag>
              {r.item.itemType && (
                <span style={{ fontSize: 10, color: '#64748b', background: '#f1f5f9', padding: '1px 5px', borderRadius: 4 }}>
                  {r.item.itemType}
                </span>
              )}
            </div>
            {r.item.name && (
              <span style={{ fontSize: 11, color: '#475569', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 190 }}>
                {r.item.name}
              </span>
            )}
          </div>
        ) : (
          <span style={{ color: '#94a3b8', fontStyle: 'italic', fontSize: 12 }}>Not linked</span>
        ),
    },
    {
      title: 'Status', dataIndex: 'isActive', key: 'status', width: 120,
      render: (v: boolean) =>
        v ? (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              padding: '3px 10px',
              borderRadius: 20,
              fontSize: 11.5,
              fontWeight: 700,
              background: 'rgba(16, 185, 129, 0.12)',
              color: '#059669',
              border: '1px solid rgba(16, 185, 129, 0.35)',
            }}
          >
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#10b981', display: 'inline-block' }} />
            Active
          </span>
        ) : (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              padding: '3px 10px',
              borderRadius: 20,
              fontSize: 11.5,
              fontWeight: 700,
              background: 'rgba(239, 68, 68, 0.1)',
              color: '#dc2626',
              border: '1px solid rgba(239, 68, 68, 0.3)',
            }}
          >
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#ef4444', display: 'inline-block' }} />
            Inactive
          </span>
        ),
    },
    {
      title: 'Actions', key: 'actions', fixed: 'right', width: 178,
      render: (_, r) => (
        <div className="pwi-setup-actions" style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          {renderActionPill(
            'blue',
            <EyeOutlined />,
            `View Replacement History — ${r.componentCode}`,
            `View replacement history — ${r.componentCode}`,
            () => handleViewHistory(r),
          )}
          {renderActionPill(
            'green',
            <SwapOutlined />,
            `Install / Change Tool — ${r.componentCode}`,
            `Install or change tool — ${r.componentCode}`,
            () => openInstallForComponent(r),
          )}
          {renderActionPill(
            'amber',
            <EditOutlined />,
            `Edit Setup — ${r.componentCode}`,
            `Edit setup — ${r.componentCode}`,
            () => handleEditComponent(r),
          )}
          <Popconfirm
            title={r.isActive ? `Deactivate ${r.componentCode}?` : `Activate ${r.componentCode}?`}
            okText={r.isActive ? 'Deactivate' : 'Activate'}
            okButtonProps={{ danger: r.isActive }}
            onConfirm={() => handleToggleComponentStatus(r)}
          >
            {renderActionPill(
              r.isActive ? 'orange' : 'green',
              <PoweroffOutlined />,
              r.isActive ? `Deactivate — ${r.componentCode}` : `Activate — ${r.componentCode}`,
              r.isActive ? `Deactivate — ${r.componentCode}` : `Activate — ${r.componentCode}`,
            )}
          </Popconfirm>
          <Popconfirm
            title="Delete this tool setup?"
            description="Components with change transactions are deactivated instead of deleted."
            onConfirm={() => handleDeleteComponent(r)}
            okButtonProps={{ danger: true }}
          >
            {renderActionPill(
              'red',
              <DeleteOutlined />,
              `Delete — ${r.componentCode}`,
              `Delete — ${r.componentCode}`,
            )}
          </Popconfirm>
        </div>
      ),
    },
  ];

  const visibleComponentColumns = useMemo(() => {
    return componentColumns.filter((col) => {
      const k = String(col.key || (col as any).dataIndex || '');
      if (!k) return true;
      return compVisibleCols[k] !== false;
    });
  }, [componentColumns, compVisibleCols]);

  /* ── Tab 2: Change history ───────────────────────────────────────────────── */
  const [changes, setChanges] = useState<ChangeRec[]>([]);
  const [changesTotal, setChangesTotal] = useState(0);
  const [changesLoading, setChangesLoading] = useState(false);
  const [chgPage, setChgPage] = useState(1);
  const [chgPageSize, setChgPageSize] = useState(20);
  const [chgSearch, setChgSearch] = useState('');
  const [fChgMachine, setFChgMachine] = useState<string | undefined>(undefined);
  const [fChgComponent, setFChgComponent] = useState<string | undefined>(undefined);
  const [fChgCondition, setFChgCondition] = useState<string | undefined>(undefined);
  const [fChgFrom, setFChgFrom] = useState<string | undefined>(undefined);
  const [fChgTo, setFChgTo] = useState<string | undefined>(undefined);
  const [showChgFilters, setShowChgFilters] = useState(false);

  const [changeModalOpen, setChangeModalOpen] = useState(false);
  const [editingChange, setEditingChange] = useState<ChangeRec | null>(null);
  const [changeForm] = Form.useForm();
  const [componentOptions, setComponentOptions] = useState<ComponentRec[]>([]);
  const [changePickMachine, setChangePickMachine] = useState<string | undefined>(undefined);
  const [jobCardOptions, setJobCardOptions] = useState<Array<{ value: string; label: string }>>([]);
  const [changeDetailOpen, setChangeDetailOpen] = useState(false);
  const [changeDetail, setChangeDetail] = useState<ChangeRec | null>(null);
  const [changeDetailLoading, setChangeDetailLoading] = useState(false);

  const chgFilterCount = useMemo(
    () => [fChgMachine, fChgComponent, fChgCondition, fChgFrom, fChgTo].filter(Boolean).length,
    [fChgMachine, fChgComponent, fChgCondition, fChgFrom, fChgTo],
  );

  const fetchChanges = useCallback(
    async (pageNum: number = 1) => {
      setChangesLoading(true);
      try {
        const params: any = { page: pageNum, limit: chgPageSize };
        if (chgSearch) params.search = chgSearch;
        if (fChgMachine) params.machineId = fChgMachine;
        if (fChgComponent) params.componentId = fChgComponent;
        if (fChgCondition) params.conditionStatus = fChgCondition;
        if (fChgFrom) params.from = fChgFrom;
        if (fChgTo) params.to = fChgTo;
        const res = await apiService.get<{ data: ChangeRec[]; total: number }>('/machine-tooling/changes', params);
        setChanges(res.data || []);
        setChangesTotal(res.total || 0);
      } catch (error: any) {
        message.error(extractApiError(error, 'Failed to fetch changes'));
      } finally {
        setChangesLoading(false);
      }
    },
    [chgPageSize, chgSearch, fChgMachine, fChgComponent, fChgCondition, fChgFrom, fChgTo, message],
  );

  useEffect(() => {
    if (activeTab === 'changes') fetchChanges(chgPage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, chgPage, fetchChanges]);

  const openRecordChange = async (record: ChangeRec | null) => {
    setIsChangeMinimized(false);
    setEditingChange(record);
    setComponentOptions([]);
    setJobCardOptions([]);
    try {
      const [compRes, jcRes] = await Promise.allSettled([
        apiService.get<{ data: ComponentRec[] }>('/machine-tooling/components', { limit: 500 }),
        apiService.get<{ data: JobCardLk[] }>('/maintenance/job-cards', { limit: 200 }),
      ]);
      if (compRes.status === 'fulfilled') setComponentOptions(compRes.value.data || []);
      if (jcRes.status === 'fulfilled') {
        setJobCardOptions(
          (jcRes.value.data || []).map((j) => ({
            value: j.id,
            label: j.jobCardNo || j.code || j.id,
          })),
        );
      }
    } catch {
      /* pickers stay empty; save will fail with a clear message */
    }
    changeForm.resetFields();
    if (record) {
      setChangePickMachine(record.machineId);
      changeForm.setFieldsValue({
        machineId: record.machineId,
        componentId: record.componentId,
        jobCardId: record.jobCardId || undefined,
        oldToolCode: record.oldToolCode || undefined,
        newToolCode: record.newToolCode,
        newToolDescription: record.newToolDescription || undefined,
        changeDate: record.changeDate ? dayjs(record.changeDate) : dayjs(),
        changeTime: record.changeTime ? dayjs(`1970-01-01T${record.changeTime}`) : undefined,
        productionCounterBefore: num(record.productionCounterBefore) ?? undefined,
        productionCounterAfter: num(record.productionCounterAfter) ?? undefined,
        reason: record.reason || undefined,
        conditionStatus: record.conditionStatus || undefined,
        remarks: record.remarks || undefined,
      });
    } else {
      changeForm.setFieldsValue({
        machineId: fChgMachine,
        changeDate: dayjs(),
        changeTime: dayjs(),
        conditionStatus: 'DAMAGED',
      });
      setChangePickMachine(fChgMachine);
    }
    setChangeModalOpen(true);
  };

  const componentOptionsForMachine = useMemo(
    () =>
      changePickMachine
        ? componentOptions.filter(
            (c) =>
              c.machineId === changePickMachine ||
              (Array.isArray(c.machineIds) && c.machineIds.includes(changePickMachine)),
          )
        : componentOptions,
    [componentOptions, changePickMachine],
  );

  const buildChangePayload = (values: any): any => ({
    ...values,
    changeDate: values.changeDate ? values.changeDate.format('YYYY-MM-DD') : undefined,
    changeTime: values.changeTime ? values.changeTime.format('HH:mm') : null,
    productionCounterBefore: values.productionCounterBefore != null ? Number(values.productionCounterBefore) : undefined,
    productionCounterAfter: values.productionCounterAfter != null ? Number(values.productionCounterAfter) : undefined,
  });

  const handleSaveChange = async () => {
    if (saving) return;
    try {
      const values = await changeForm.validateFields();
      await runSave('change', buildChangePayload(values));
    } catch (err: any) {
      const val = handleValidationErrors(err, changeForm);
      if (val) {
        setResultErrorTitle('Required Information Missing');
        setResultErrorLead('Please complete all required fields before saving:');
        setResultError(val.bulletList);
        setResultPhase('error');
        setResultOpen(true);
        return;
      }
      message.error(extractApiError(err, 'Failed to record change'));
    }
  };

  const handleDeleteChange = async (record: ChangeRec) => {
    try {
      await apiService.delete(`/machine-tooling/changes/${record.id}`);
      message.success(`Change on ${record.changeDate} deleted`);
      fetchChanges(chgPage);
    } catch (error: any) {
      message.error(extractApiError(error, 'Failed to delete change'));
    }
  };

  const handleViewChange = async (record: ChangeRec) => {
    setIsDetailMinimized(false);
    setChangeDetailOpen(true);
    setChangeDetailLoading(true);
    setChangeDetail(null);
    try {
      const res = await apiService.get<any>(`/machine-tooling/changes/${record.id}`);
      setChangeDetail(res?.data ?? res);
    } catch (error: any) {
      message.error(extractApiError(error, 'Failed to load change'));
      setChangeDetailOpen(false);
    } finally {
      setChangeDetailLoading(false);
    }
  };

  // Tooling Change History Column Visibility
  const DEFAULT_TOOLING_CHG_COLUMNS: Record<string, boolean> = {
    date: true,
    machine: true,
    component: true,
    toolChange: true,
    life: true,
    conditionStatus: true,
    jobCard: true,
    actions: true,
  };
  const TOOLING_CHG_COLUMN_LABELS: Record<string, string> = {
    date: 'Date & Time',
    machine: 'Machine',
    component: 'Component',
    toolChange: 'Tool Change',
    life: 'Production Life',
    conditionStatus: 'Condition',
    jobCard: 'Job Card',
    actions: 'Actions',
  };
  const [chgVisibleCols, setChgVisibleCols] = useState<Record<string, boolean>>(() => {
    try {
      const stored = localStorage.getItem('erp_tooling_chg_cols');
      return stored ? { ...DEFAULT_TOOLING_CHG_COLUMNS, ...JSON.parse(stored) } : DEFAULT_TOOLING_CHG_COLUMNS;
    } catch {
      return DEFAULT_TOOLING_CHG_COLUMNS;
    }
  });

  const changeColumns: ColumnsType<ChangeRec> = [
    {
      title: 'Date', key: 'date', width: 112, sorter: true,
      render: (_, r) => renderDateValue(r.changeDate, r.changeTime),
    },
    {
      title: 'Machine', key: 'machine', width: 138,
      render: (_, r) => (
        <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.3 }}>
          <span style={{ fontWeight: 500 }}>{r.machine?.machineCode ?? '—'}</span>
          {r.machine?.machineNumber && (
            <span style={{ fontSize: 11, color: 'var(--theme-text-muted)' }}>{r.machine.machineNumber}</span>
          )}
        </div>
      ),
    },
    {
      title: 'Component', key: 'component', width: 245,
      render: (_, r) =>
        renderToolItemStack(
          r.component?.componentCode,
          r.component?.componentName ?? r.componentId,
        ),
    },
    {
      title: 'Tool Change', key: 'toolChange', width: 210,
      render: (_, r) => (
        <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.3 }}>
          <Space size={4}>
            <code>{r.oldToolCode || '—'}</code>
            <SwapRightOutlined style={{ color: 'var(--theme-text-muted)' }} />
            <code style={{ fontWeight: 600, color: 'var(--theme-accent)' }}>{r.newToolCode}</code>
          </Space>
          {r.newToolDescription && (
            <span style={{ fontSize: 11, color: 'var(--theme-text-muted)' }}>{r.newToolDescription}</span>
          )}
        </div>
      ),
    },
    {
      title: 'Life', key: 'life', width: 150, sorter: true,
      render: (_, r) => {
        const lifeVal = r.currentLifeQty ?? r.productionSincePrevious;
        if (lifeVal === null || lifeVal === undefined || lifeVal === '') return EMPTY;
        const isLive =
          r.isLiveActive ??
          (!r.closedAt && r.lifecycleStatus !== 'STANDBY' && r.lifecycleStatus !== 'CLOSED');
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span
              style={{
                fontWeight: 700,
                color: isLive ? 'var(--theme-primary)' : 'var(--theme-text)',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {fmtNum(lifeVal)} {PRODUCTION_UOM}
            </span>
            {isLive && renderLiveBadge()}
          </div>
        );
      },
    },
    {
      title: 'Condition', dataIndex: 'conditionStatus', key: 'conditionStatus', width: 108,
      render: (v: string | null) =>
        v ? <Tag color={CONDITION_COLORS[v] ?? 'default'}>{v}</Tag> : EMPTY,
    },
    {
      title: 'Job Card', key: 'jobCard', width: 112,
      render: (_, r) => (r.jobCard?.jobCardNo || r.jobCard?.code) ? <code>{r.jobCard?.jobCardNo || r.jobCard?.code}</code> : EMPTY,
    },
    {
      title: 'Actions', key: 'actions', fixed: 'right', width: 142,
      render: (_, r) => {
        const isLive =
          r.isLiveActive ??
          (!r.closedAt && r.lifecycleStatus !== 'STANDBY' && r.lifecycleStatus !== 'CLOSED');
        return (
          <div className="pwi-setup-actions" style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            {renderActionPill(
              'blue',
              <EyeOutlined />,
              `View Details — ${r.changeDate} ${r.newToolCode}`,
              `View change — ${r.changeDate} ${r.newToolCode}`,
              () => handleViewChange(r),
            )}
            {renderActionPill(
              'green',
              <SwapOutlined />,
              isLive ? `Unmount / Changeover — ${r.newToolCode}` : `Edit / Install — ${r.newToolCode}`,
              `Unmount or changeover tool — ${r.newToolCode}`,
              () => {
                if (isLive) {
                  const mapped: ActiveToolRec = {
                    id: r.id,
                    machineId: r.machineId,
                    machine: r.machine || null,
                    componentId: r.componentId,
                    component: r.component
                      ? {
                          id: r.component.id,
                          componentCode: r.component.componentCode,
                          componentName: r.component.componentName,
                          componentType: r.component.componentType,
                          expectedLifeQuantity: r.component.expectedLifeQuantity,
                          uomCode: r.uomCode || r.component.uom?.code || null,
                        }
                      : null,
                    installedToolCode: r.newToolCode,
                    newToolDescription: r.newToolDescription,
                    installDate: r.changeDate,
                    installTime: r.changeTime,
                    installCounter: num(r.productionCounterAfter),
                    usedByInstalled: num(r.currentLifeQty ?? r.productionSincePrevious) ?? 0,
                    changeDate: r.changeDate,
                    closedAt: r.closedAt,
                  };
                  openChangeover(mapped);
                } else {
                  openRecordChange(r);
                }
              },
            )}
            {renderActionPill(
              'amber',
              <EditOutlined />,
              `Edit Change — ${r.changeDate} ${r.newToolCode}`,
              `Edit change — ${r.changeDate} ${r.newToolCode}`,
              () => openRecordChange(r),
            )}
            <Popconfirm title="Delete this change transaction?" onConfirm={() => handleDeleteChange(r)} okButtonProps={{ danger: true }}>
              {renderActionPill(
                'red',
                <DeleteOutlined />,
                `Delete — ${r.changeDate} ${r.newToolCode}`,
                `Delete change — ${r.changeDate} ${r.newToolCode}`,
              )}
            </Popconfirm>
          </div>
        );
      },
    },
  ];

  const visibleChangeColumns = useMemo(() => {
    return changeColumns.filter((col) => {
      const k = String(col.key || (col as any).dataIndex || '');
      if (!k) return true;
      return chgVisibleCols[k] !== false;
    });
  }, [changeColumns, chgVisibleCols]);

  /* ── Tab 5: Monthly consumption ──────────────────────────────────────────── */
  const [reportMonth, setReportMonth] = useState<dayjs.Dayjs>(dayjs());
  const [fReportDivision, setFReportDivision] = useState<string | undefined>(undefined);
  const [fReportMachine, setFReportMachine] = useState<string | undefined>(undefined);
  const [report, setReport] = useState<MonthlyReport | null>(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [expandedMachineKeys, setExpandedMachineKeys] = useState<React.Key[]>([]);
  const [editingRateCompId, setEditingRateCompId] = useState<string | null>(null);
  const [editingRateValue, setEditingRateValue] = useState<number>(0);
  const [savingRate, setSavingRate] = useState(false);

  const reportDivisionOptions = useMemo(() => {
    const activeDivIds = new Set(machines.map((m) => m.divisionId).filter(Boolean));
    const list = divisions.filter((d) => activeDivIds.size === 0 || activeDivIds.has(d.id));
    return list
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((d) => ({ value: d.id, label: d.name }));
  }, [divisions, machines]);

  const reportMachineOptions = useMemo(() => {
    const list = fReportDivision
      ? machines.filter((m) => m.divisionId === fReportDivision)
      : machines;
    return list.map((m) => ({
      value: m.id,
      label: `${m.machineCode ?? m.name ?? m.id}${m.name && m.name !== m.machineCode ? ` — ${m.name}` : ''}`,
    }));
  }, [machines, fReportDivision]);

  const fetchReport = useCallback(async () => {
    setReportLoading(true);
    try {
      const params: any = { month: reportMonth.format('YYYY-MM') };
      if (fReportDivision) params.divisionId = fReportDivision;
      if (fReportMachine) params.machineId = fReportMachine;
      const res = await apiService.get<any>('/machine-tooling/changes/reports/monthly', params);
      setReport(res?.data ?? res ?? null);
      setReportLoading(false);
    } catch (error: any) {
      setReport(null);
      setReportLoading(false);
      message.error(extractApiError(error, 'Failed to load monthly consumption report'));
    }
  }, [reportMonth, fReportDivision, fReportMachine, message]);

  /* ── Tab 6: Live Machine Costing (all active tools, no month filter) ────── */
  const [fLiveCostDivision, setFLiveCostDivision] = useState<string | undefined>(undefined);
  const [fLiveCostMachine, setFLiveCostMachine] = useState<string | undefined>(undefined);
  const [liveCosting, setLiveCosting] = useState<LiveCostingReport | null>(null);
  const [liveCostingLoading, setLiveCostingLoading] = useState(false);
  const [expandedLiveCostKeys, setExpandedLiveCostKeys] = useState<React.Key[]>([]);

  const liveCostMachineOptions = useMemo(() => {
    const list = fLiveCostDivision
      ? machines.filter((m) => m.divisionId === fLiveCostDivision)
      : machines;
    return list.map((m) => ({
      value: m.id,
      label: `${m.machineCode ?? m.name ?? m.id}${m.name && m.name !== m.machineCode ? ` — ${m.name}` : ''}`,
    }));
  }, [machines, fLiveCostDivision]);

  const fetchLiveCosting = useCallback(async () => {
    setLiveCostingLoading(true);
    try {
      const params: any = {};
      if (fLiveCostDivision) params.divisionId = fLiveCostDivision;
      if (fLiveCostMachine) params.machineId = fLiveCostMachine;
      const res = await apiService.get<any>('/machine-tooling/changes/reports/live-costing', params);
      setLiveCosting(res?.data ?? res ?? null);
      setLiveCostingLoading(false);
    } catch (error: any) {
      setLiveCosting(null);
      setLiveCostingLoading(false);
      message.error(extractApiError(error, 'Failed to load live machine costing report'));
    }
  }, [fLiveCostDivision, fLiveCostMachine, message]);

  const handleSaveComponentRate = useCallback(
    async (componentId: string, unitCost: number) => {
      setSavingRate(true);
      try {
        await apiService.patch(`/machine-tooling/components/${componentId}/unit-cost`, {
          unitCost: Math.max(0, Number(unitCost) || 0),
        });
        message.success('Tool unit rate updated');
        setEditingRateCompId(null);
        await Promise.all([
          activeTab === 'liveCosting' ? fetchLiveCosting() : fetchReport(),
          activeTab === 'liveCosting' && report ? fetchReport() : Promise.resolve(),
          activeTab === 'report' && liveCosting ? fetchLiveCosting() : Promise.resolve(),
        ]);
      } catch (error: any) {
        message.error(extractApiError(error, 'Failed to update unit rate'));
      } finally {
        setSavingRate(false);
      }
    },
    [activeTab, fetchReport, fetchLiveCosting, report, liveCosting, message],
  );

  useEffect(() => {
    if (activeTab === 'report') fetchReport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, fetchReport]);

  useEffect(() => {
    if (activeTab === 'liveCosting') fetchLiveCosting();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, fetchLiveCosting]);

  /* ── Tab 4: Active tools (currently installed, lifecycle) ────────────────── */
  const [activeTools, setActiveTools] = useState<ActiveToolRec[]>([]);
  const [activeToolsTotal, setActiveToolsTotal] = useState(0);
  const [activeToolsLoading, setActiveToolsLoading] = useState(false);
  const [atPage, setAtPage] = useState(1);
  const [atPageSize, setAtPageSize] = useState(20);
  const [atSearch, setAtSearch] = useState('');
  const [fAtMachine, setFAtMachine] = useState<string | undefined>(undefined);

  const fetchActiveTools = useCallback(
    async (pageNum: number = 1) => {
      setActiveToolsLoading(true);
      try {
        const params: any = { page: pageNum, limit: atPageSize };
        if (atSearch) params.search = atSearch;
        if (fAtMachine) params.machineId = fAtMachine;
        const res = await apiService.get<{ data: ActiveToolRec[]; total: number }>('/machine-tooling/active-tools', params);
        setActiveTools(res.data || []);
        setActiveToolsTotal(res.total || 0);
      } catch (error: any) {
        message.error(extractApiError(error, 'Failed to fetch active tools'));
      } finally {
        setActiveToolsLoading(false);
      }
    },
    [atPageSize, atSearch, fAtMachine, message],
  );

  useEffect(() => {
    if (activeTab === 'active') fetchActiveTools(atPage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, atPage, fetchActiveTools]);

  /* ── Standby (Reusable) Tool Pool + Changeover & Re-Mount Modals ────────── */
  const [standbyTools, setStandbyTools] = useState<StandbyToolOption[]>([]);
  const [standbyLoading, setStandbyLoading] = useState(false);
  const [changeoverOpen, setChangeoverOpen] = useState(false);
  const [changeoverTarget, setChangeoverTarget] = useState<ActiveToolRec | null>(null);
  const [remountOpen, setRemountOpen] = useState(false);

  const fetchStandbyTools = useCallback(async () => {
    setStandbyLoading(true);
    try {
      const res = await apiService.get<{ data: StandbyToolOption[]; total: number }>(
        '/machine-tooling/standby-tools',
        { limit: 200 },
        { silent: true },
      );
      setStandbyTools(res?.data || []);
    } catch {
      setStandbyTools([]);
    } finally {
      setStandbyLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'active' || activeTab === 'life') {
      void fetchStandbyTools();
    }
  }, [activeTab, fetchStandbyTools]);

  const [sessionDetailOpen, setSessionDetailOpen] = useState(false);
  const [sessionDetailRow, setSessionDetailRow] = useState<LifeRowRec | null>(null);

  const openChangeover = (tool: ActiveToolRec) => {
    setChangeoverTarget(tool);
    setChangeoverOpen(true);
  };

  const openChangeoverFromLifeRow = (row: LifeRowRec) => {
    const mapped: ActiveToolRec = {
      id: row.id,
      machineId: row.machineId,
      machine: row.machine,
      componentId: row.componentId,
      component: row.component,
      installedToolCode: row.toolCode,
      newToolDescription: row.newToolDescription,
      installDate: row.installDate,
      installTime: row.installTime,
      installCounter: row.installCounter,
      usedByInstalled: row.productionLife ?? 0,
      accumulatedLifeBeforeCurrentSession: row.accumulatedLifeBeforeCurrentSession ?? 0,
      sessionCount: row.sessionCount ?? 1,
      mountingSessions: row.mountingSessions,
      storeIssueId: row.storeIssueId,
      storeIssueNumber: row.storeIssueNumber,
      operatorName: row.operatorName,
      shiftInchargeName: row.shiftInchargeName,
      issuedByName: row.issuedByName,
      jobCardNo: row.jobCardNo,
      changeDate: row.installDate,
      closedAt: row.closedAt,
    };
    openChangeover(mapped);
  };

  const openSessionDetails = (row: LifeRowRec) => {
    setSessionDetailRow(row);
    setSessionDetailOpen(true);
  };

  const openRemountModal = () => {
    void fetchStandbyTools();
    setRemountOpen(true);
  };

  const [installOpen, setInstallOpen] = useState(false);
  const [installSaving, setInstallSaving] = useState(false);
  const [installForm] = Form.useForm();
  const [installComponents, setInstallComponents] = useState<ComponentRec[]>([]);
  const [installPickMachine, setInstallPickMachine] = useState<string | undefined>(undefined);
  const [activeComponentIds, setActiveComponentIds] = useState<Set<string>>(new Set());
  const [storeIssueOptions, setStoreIssueOptions] = useState<Array<{ value: string; label: string }>>([]);
  const [installJobCardOptions, setInstallJobCardOptions] = useState<Array<{ value: string; label: string }>>([]);

  const openInstall = async () => {
    setIsInstallMinimized(false);
    setInstallOpen(true);
    setInstallPickMachine(undefined);
    setInstallComponents([]);
    setActiveComponentIds(new Set());
    installForm.resetFields();
    try {
      const [compRes, actRes, siRes, jcRes] = await Promise.allSettled([
        apiService.get<{ data: ComponentRec[] }>('/machine-tooling/components', { limit: 500 }),
        apiService.get<{ data: ActiveToolRec[] }>('/machine-tooling/active-tools', { limit: 500 }),
        apiService.get<{ data: StoreIssueLk[] }>('/store/material-issues', { status: 'POSTED', limit: 200 }),
        apiService.get<{ data: JobCardLk[] }>('/maintenance/job-cards', { limit: 200 }),
      ]);
      if (compRes.status === 'fulfilled') setInstallComponents(compRes.value.data || []);
      if (actRes.status === 'fulfilled') {
        setActiveComponentIds(
          new Set(
            (actRes.value.data || []).flatMap((a) =>
              a.componentId && a.machineId ? [`${a.machineId}::${a.componentId}`] : [],
            ),
          ),
        );
      }
      if (siRes.status === 'fulfilled') {
        setStoreIssueOptions(
          (siRes.value.data || []).map((s) => ({
            value: s.id,
            label: `${s.issueNumber || s.id}${s.issueDate ? ` · ${s.issueDate}` : ''}`,
          })),
        );
      }
      if (jcRes.status === 'fulfilled') {
        setInstallJobCardOptions(
          (jcRes.value.data || []).map((j) => ({ value: j.id, label: j.jobCardNo || j.code || j.id })),
        );
      }
    } catch {
      /* pickers stay empty; install will surface a clear API error */
    }
  };

  const openInstallForComponent = async (comp: ComponentRec) => {
    const primaryMachineId =
      (Array.isArray(comp.machineIds) && comp.machineIds.length > 0 ? comp.machineIds[0] : comp.machineId) || undefined;
    await openInstall();
    setInstallPickMachine(primaryMachineId);
    installForm.setFieldsValue({
      machineId: primaryMachineId,
      componentId: comp.id,
      newToolCode: comp.componentCode,
      newToolDescription: comp.componentName,
    });
  };

  const installableComponents = useMemo(() => {
    const base = installPickMachine
      ? installComponents.filter(
          (c) =>
            c.machineId === installPickMachine ||
            (Array.isArray(c.machineIds) && c.machineIds.includes(installPickMachine)),
        )
      : installComponents;
    return base.filter((c) =>
      installPickMachine ? !activeComponentIds.has(`${installPickMachine}::${c.id}`) : true,
    );
  }, [installComponents, installPickMachine, activeComponentIds]);

  const handleInstallSubmit = async () => {
    if (installSaving) return;
    try {
      const values = await installForm.validateFields();
      setInstallSaving(true);
      const payload = {
        machineId: values.machineId,
        componentId: values.componentId,
        newToolCode: String(values.newToolCode).trim(),
        newToolDescription: values.newToolDescription?.trim() || null,
        changeDate: values.changeDate ? values.changeDate.format('YYYY-MM-DD') : undefined,
        changeTime: values.changeTime ? values.changeTime.format('HH:mm') : null,
        productionCounterAfter: values.productionCounterAfter != null ? Number(values.productionCounterAfter) : undefined,
        storeIssueId: values.storeIssueId || null,
        jobCardId: values.jobCardId || null,
        remarks: values.remarks?.trim() || null,
      };
      await apiService.post('/machine-tooling/install', payload);
      message.success(`Tool ${payload.newToolCode} installed`);
      setInstallOpen(false);
      installForm.resetFields();
      fetchActiveTools(atPage);
      await fetchLifeReport(lifePage);
    } catch (err: any) {
      if (err?.errorFields) {
        handleValidationErrors(err, installForm);
        return;
      }
      message.error(extractApiError(err, 'Failed to install tool'));
    } finally {
      setInstallSaving(false);
    }
  };

  const [removeOpen, setRemoveOpen] = useState(false);
  const [removeSaving, setRemoveSaving] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<ActiveToolRec | null>(null);
  const [removeForm] = Form.useForm();

  const openRemove = (tool: ActiveToolRec) => {
    setRemoveTarget(tool);
    removeForm.resetFields();
    removeForm.setFieldsValue({
      changeDate: dayjs(),
      changeTime: dayjs(),
      conditionStatus: 'USED',
      dispositionType: 'RETURN_TO_STORE',
    });
    setRemoveOpen(true);
  };

  const handleRemoveSubmit = async () => {
    if (removeSaving) return;
    try {
      const values = await removeForm.validateFields();
      if (!removeTarget) return;
      setRemoveSaving(true);
      const payload = {
        changeDate: values.changeDate ? values.changeDate.format('YYYY-MM-DD') : undefined,
        changeTime: values.changeTime ? values.changeTime.format('HH:mm') : null,
        productionCounterBefore: values.productionCounterBefore != null ? Number(values.productionCounterBefore) : undefined,
        conditionStatus: values.conditionStatus,
        dispositionType: values.dispositionType,
        dispositionNote: values.dispositionNote?.trim() || null,
        reason: values.reason?.trim() || null,
        remarks: values.remarks?.trim() || null,
      };
      await apiService.post(`/machine-tooling/changes/${removeTarget.id}/remove`, payload);
      message.success(`Tool ${removeTarget.installedToolCode} removed — production life recorded`);
      setRemoveOpen(false);
      removeForm.resetFields();
      fetchActiveTools(atPage);
      fetchChanges(chgPage);
      await fetchLifeReport(lifePage);
    } catch (err: any) {
      if (err?.errorFields) {
        handleValidationErrors(err, removeForm);
        return;
      }
      message.error(extractApiError(err, 'Failed to remove tool'));
    } finally {
      setRemoveSaving(false);
    }
  };

  /* ── Tab 5: Tool Life History report ─────────────────────────────────────── */
  const [lifeRows, setLifeRows] = useState<LifeRowRec[]>([]);
  const [lifeTotal, setLifeTotal] = useState(0);
  const [lifeLoading, setLifeLoading] = useState(false);
  const [lifePage, setLifePage] = useState(1);
  const [lifePageSize, setLifePageSize] = useState(20);
  const [lifeSearch, setLifeSearch] = useState('');
  const [fLifeMachine, setFLifeMachine] = useState<string | undefined>(undefined);
  const [fLifeComponent, setFLifeComponent] = useState<string | undefined>(undefined);
  const [fLifeDisposition, setFLifeDisposition] = useState<string | undefined>(undefined);
  const [fLifeStatus, setFLifeStatus] = useState<string | undefined>(undefined);
  const [fLifeFrom, setFLifeFrom] = useState<string | undefined>(undefined);
  const [fLifeTo, setFLifeTo] = useState<string | undefined>(undefined);
  const [lifeSummary, setLifeSummary] = useState<LifeReportData['summary'] | null>(null);

  const lifeFilterCount = useMemo(
    () => [fLifeMachine, fLifeComponent, fLifeDisposition, fLifeStatus, fLifeFrom, fLifeTo].filter(Boolean).length,
    [fLifeMachine, fLifeComponent, fLifeDisposition, fLifeStatus, fLifeFrom, fLifeTo],
  );

  const fetchLifeReport = useCallback(
    async (pageNum: number = 1) => {
      setLifeLoading(true);
      try {
        const params: any = { page: pageNum, limit: lifePageSize };
        if (lifeSearch) params.search = lifeSearch;
        if (fLifeMachine) params.machineId = fLifeMachine;
        if (fLifeComponent) params.componentId = fLifeComponent;
        if (fLifeDisposition) params.dispositionType = fLifeDisposition;
        if (fLifeStatus) params.status = fLifeStatus;
        if (fLifeFrom) params.from = fLifeFrom;
        if (fLifeTo) params.to = fLifeTo;
        const res = await apiService.get<LifeReportData>('/machine-tooling/life-report', params);
        setLifeRows(res.data || []);
        setLifeTotal(res.total || 0);
        setLifeSummary(res.summary || null);
      } catch (error: any) {
        message.error(extractApiError(error, 'Failed to load tool life history'));
      } finally {
        setLifeLoading(false);
      }
    },
    [lifePageSize, lifeSearch, fLifeMachine, fLifeComponent, fLifeDisposition, fLifeStatus, fLifeFrom, fLifeTo, message],
  );

  useEffect(() => {
    if (activeTab === 'life') fetchLifeReport(lifePage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, lifePage, fetchLifeReport]);

  // Hydrate all tab count badges (Change History, Active Tools, Tool Life History, Standby) once on mount
  useEffect(() => {
    if (!can('manufacturing.component_change.view')) return;
    let cancelled = false;
    (async () => {
      try {
        const [chgRes, actRes, lifeRes, stRes] = await Promise.allSettled([
          apiService.get<{ data: ChangeRec[]; total: number }>('/machine-tooling/changes', { page: 1, limit: chgPageSize }, { silent: true }),
          apiService.get<{ data: ActiveToolRec[]; total: number }>('/machine-tooling/active-tools', { page: 1, limit: atPageSize }, { silent: true }),
          apiService.get<LifeReportData>('/machine-tooling/life-report', { page: 1, limit: lifePageSize }, { silent: true }),
          apiService.get<{ data: StandbyToolOption[]; total: number }>('/machine-tooling/standby-tools', { limit: 200 }, { silent: true }),
        ]);
        if (cancelled) return;
        if (chgRes.status === 'fulfilled' && chgRes.value) {
          setChanges(chgRes.value.data || []);
          setChangesTotal(chgRes.value.total || 0);
        }
        if (actRes.status === 'fulfilled' && actRes.value) {
          setActiveTools(actRes.value.data || []);
          setActiveToolsTotal(actRes.value.total || 0);
        }
        if (lifeRes.status === 'fulfilled' && lifeRes.value) {
          setLifeRows(lifeRes.value.data || []);
          setLifeTotal(lifeRes.value.total || 0);
          setLifeSummary(lifeRes.value.summary || null);
        }
        if (stRes.status === 'fulfilled' && stRes.value) {
          setStandbyTools(stRes.value.data || []);
        }
      } catch {}
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [disposeOpen, setDisposeOpen] = useState(false);
  const [disposeSaving, setDisposeSaving] = useState(false);
  const [disposeTarget, setDisposeTarget] = useState<LifeRowRec | null>(null);
  const [disposeForm] = Form.useForm();

  const openDispose = (row: LifeRowRec) => {
    setDisposeTarget(row);
    disposeForm.resetFields();
    disposeForm.setFieldsValue({
      dispositionType: row.dispositionType || undefined,
      dispositionNote: row.dispositionNote || undefined,
      reason: row.reason || undefined,
    });
    setDisposeOpen(true);
  };

  const handleDisposeSubmit = async () => {
    if (disposeSaving) return;
    try {
      const values = await disposeForm.validateFields();
      if (!disposeTarget) return;
      setDisposeSaving(true);
      await apiService.post(`/machine-tooling/changes/${disposeTarget.id}/dispose`, {
        dispositionType: values.dispositionType,
        dispositionNote: values.dispositionNote?.trim() || null,
        reason: values.reason?.trim() || null,
      });
      message.success(`Disposition recorded for tool ${disposeTarget.toolCode}`);
      setDisposeOpen(false);
      disposeForm.resetFields();
      await fetchLifeReport(lifePage);
    } catch (err: any) {
      if (err?.errorFields) {
        handleValidationErrors(err, disposeForm);
        return;
      }
      message.error(extractApiError(err, 'Failed to record disposition'));
    } finally {
      setDisposeSaving(false);
    }
  };

  /* ── Multi-item breakdown of a tool / component (Item Master lines) ──────── */
  const [itemsOpen, setItemsOpen] = useState(false);
  const [itemsTarget, setItemsTarget] = useState<ComponentRec | null>(null);
  const [componentItems, setComponentItems] = useState<ComponentItemLine[]>([]);
  const [itemsLoading, setItemsLoading] = useState(false);
  const [itemsSaving, setItemsSaving] = useState(false);
  const [editingItemLine, setEditingItemLine] = useState<ComponentItemLine | null>(null);
  const [itemForm] = Form.useForm();

  const loadItems = useCallback(
    async (componentId: string) => {
      setItemsLoading(true);
      try {
        const res = await apiService.get<{ data: ComponentItemLine[] }>(`/machine-tooling/components/${componentId}/items`);
        setComponentItems(res.data || []);
      } catch (error: any) {
        message.error(extractApiError(error, 'Failed to load component breakdown'));
      } finally {
        setItemsLoading(false);
      }
    },
    [message],
  );

  const openItems = async (record: ComponentRec) => {
    setItemsTarget(record);
    setEditingItemLine(null);
    itemForm.resetFields();
    setItemsOpen(true);
    await loadItems(record.id);
  };

  const openEditItem = (line: ComponentItemLine) => {
    setEditingItemLine(line);
    itemForm.setFieldsValue({
      itemId: line.itemId,
      quantity: num(line.quantity) ?? undefined,
      uomId: line.uomId || undefined,
      notes: line.notes || undefined,
    });
  };

  const handleSaveItem = async () => {
    if (itemsSaving) return;
    try {
      const values = await itemForm.validateFields();
      if (!itemsTarget) return;
      setItemsSaving(true);
      const payload = {
        itemId: values.itemId,
        quantity: num(values.quantity) ?? undefined,
        uomId: values.uomId || null,
        notes: values.notes?.trim() || null,
      };
      if (editingItemLine) {
        await apiService.put(`/machine-tooling/components/${itemsTarget.id}/items/${editingItemLine.id}`, payload);
      } else {
        await apiService.post(`/machine-tooling/components/${itemsTarget.id}/items`, payload);
      }
      message.success(editingItemLine ? 'Breakdown line updated' : 'Breakdown line added');
      setEditingItemLine(null);
      itemForm.resetFields();
      await loadItems(itemsTarget.id);
    } catch (err: any) {
      if (err?.errorFields) {
        handleValidationErrors(err, itemForm);
        return;
      }
      message.error(extractApiError(err, 'Failed to save breakdown line'));
    } finally {
      setItemsSaving(false);
    }
  };

  const handleDeleteItem = async (line: ComponentItemLine) => {
    if (!itemsTarget) return;
    try {
      await apiService.delete(`/machine-tooling/components/${itemsTarget.id}/items/${line.id}`);
      message.success('Breakdown line removed');
      await loadItems(itemsTarget.id);
    } catch (error: any) {
      message.error(extractApiError(error, 'Failed to delete breakdown line'));
    }
  };

  /* ── Lifecycle table columns ─────────────────────────────────────────────── */
  const lifeComponentOptions = useMemo(() => {
    const map = new Map<string, { value: string; label: string }>();
    for (const r of lifeRows) {
      if (r.component) {
        map.set(r.component.id, {
          value: r.component.id,
          label: `${r.component.componentCode} — ${r.component.componentName}`,
        });
      }
    }
    return Array.from(map.values());
  }, [lifeRows]);

  const activeToolColumns: ColumnsType<ActiveToolRec> = [
    {
      title: 'Machine', key: 'machine', width: 165,
      render: (_, r) => (
        <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.3 }}>
          <span style={{ fontWeight: 600 }}>{r.machine?.machineCode ?? '—'}</span>
          {r.machine?.name && (
            <span style={{ fontSize: 11, color: 'var(--theme-text-muted)' }}>{r.machine.name}</span>
          )}
        </div>
      ),
    },
    {
      title: 'Component', key: 'component', width: 265,
      render: (_, r) =>
        renderToolItemStack(
          r.component?.componentCode,
          r.component?.componentName ?? r.componentId,
          { extraMeta: formatComponentTypeLabel(r.component?.componentType) },
        ),
    },
    {
      title: 'Active Tool / Run #', key: 'tool', width: 230,
      render: (_, r) => (
        <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.3 }}>
          <Space size={6} wrap>
            <code style={{ fontWeight: 700, color: 'var(--theme-accent)' }}>{r.installedToolCode}</code>
            {(r.sessionCount ?? 1) > 1 && (
              <Tag color="cyan" style={{ margin: 0, fontSize: 10, lineHeight: '16px', padding: '0 5px' }}>
                Session #{r.sessionCount}
              </Tag>
            )}
          </Space>
          {r.newToolDescription && (
            <span style={{ fontSize: 11, color: 'var(--theme-text-muted)' }}>{r.newToolDescription}</span>
          )}
        </div>
      ),
    },
    {
      title: 'Issued / Mounted Date', key: 'installDate', width: 175,
      render: (_, r) => renderDateValue(r.installDate, r.installTime),
    },
    {
      title: 'Current Life (Production Qty)', key: 'used', width: 235,
      render: (_, r) => {
        const expected = num(r.component?.expectedLifeQuantity);
        const pct =
          r.lifeProgressPct ??
          (expected && expected > 0 && r.usedByInstalled != null
            ? Number(((r.usedByInstalled / expected) * 100).toFixed(1))
            : null);
        return (
          <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.35 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontWeight: 700, fontSize: 13.5, color: 'var(--theme-primary)', fontVariantNumeric: 'tabular-nums' }}>
                {fmtNum(r.usedByInstalled)} {PRODUCTION_UOM}
              </span>
              {renderLiveBadge()}
            </div>
            {pct != null && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                <Tag
                  color={pct >= 100 ? 'error' : pct >= 80 ? 'warning' : 'success'}
                  style={{ margin: 0, fontSize: 10, lineHeight: '16px', padding: '0 5px', fontWeight: 700 }}
                >
                  {pct}% of {fmtNum(expected)} {PRODUCTION_UOM}
                </Tag>
              </div>
            )}
            {r.liveWeightKg != null && r.liveWeightKg > 0 && (
              <span style={{ fontSize: 11, color: 'var(--theme-text-muted)', marginTop: 2 }}>
                {fmtNum(r.liveWeightKg)} Kg produced
              </span>
            )}
          </div>
        );
      },
    },
    {
      title: 'Expected / Remaining', key: 'remaining', width: 175,
      render: (_, r) => {
        const expected = num(r.component?.expectedLifeQuantity);
        if (expected != null && r.remainingByInstalled != null) {
          return (
            <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.35 }}>
              <span style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                {fmtNum(r.remainingByInstalled)} {PRODUCTION_UOM} left
              </span>
              <span style={{ fontSize: 11, color: 'var(--theme-text-muted)' }}>
                Target: {fmtNum(expected)} {PRODUCTION_UOM}
              </span>
            </div>
          );
        }
        return renderLiveBadge('Live Tracking');
      },
    },
    {
      title: 'Voucher # & Operator', key: 'storeIssue', width: 190,
      render: (_, r) => (
        <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.3 }}>
          {r.storeIssueNumber ? <code style={{ fontWeight: 600 }}>{r.storeIssueNumber}</code> : EMPTY}
          {r.operatorName && (
            <span style={{ fontSize: 11, color: 'var(--theme-text-muted)' }}>Op: {r.operatorName}</span>
          )}
        </div>
      ),
    },
    {
      title: 'Status', key: 'status', width: 120,
      render: () => <StatusBadge status="ACTIVE" />,
    },
    {
      title: 'Actions', key: 'actions', fixed: 'right', width: 76, align: 'center',
      render: (_, r) => (
        <div className="pwi-setup-actions" style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          {renderActionPill(
            'green',
            <SwapOutlined />,
            `Unmount / Changeover (pause to Standby or close) — ${r.installedToolCode}`,
            `Unmount or changeover tool ${r.installedToolCode}`,
            () => openChangeover(r),
          )}
        </div>
      ),
    },
  ];

  const lifeColumns: ColumnsType<LifeRowRec> = [
    {
      title: 'Machine', key: 'machine', width: 145,
      render: (_, r) => (
        <div style={{ lineHeight: 1.3 }}>
          <span style={{ fontWeight: 600 }}>{r.machine?.machineCode ?? '—'}</span>
          {r.machine?.name && <div style={{ fontSize: 11, color: 'var(--theme-text-muted)' }}>{r.machine.name}</div>}
        </div>
      ),
    },
    {
      title: 'Component', key: 'component', width: 265,
      render: (_, r) =>
        renderToolItemStack(
          r.component?.componentCode,
          r.component?.componentName ?? r.componentId,
        ),
    },
    {
      title: 'Tool Run', key: 'tool', width: 190,
      render: (_, r) => (
        <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.3 }}>
          <code style={{ fontWeight: 700, color: 'var(--theme-accent)' }}>{r.toolCode}</code>
          {r.oldToolCode && (
            <span style={{ fontSize: 11, color: 'var(--theme-text-muted)' }}>Prev: {r.oldToolCode}</span>
          )}
        </div>
      ),
    },
    {
      title: 'Issued Date', key: 'installed', width: 130,
      render: (_, r) => renderDateValue(r.installDate, r.installTime),
    },
    {
      title: 'Closed Date', key: 'removed', width: 125,
      render: (_, r) => renderDateValue(r.removeDate),
    },
    {
      title: 'Production Life', key: 'life', width: 205, sorter: true,
      render: (_, r) => {
        if (r.productionLife == null) return EMPTY;
        const expected = num(r.component?.expectedLifeQuantity);
        const pct =
          r.lifeProgressPct ??
          (expected && expected > 0 ? Number(((r.productionLife / expected) * 100).toFixed(1)) : null);
        return (
          <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.35 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontWeight: 700, color: r.status === 'ACTIVE' ? 'var(--theme-primary)' : 'var(--theme-text)', fontVariantNumeric: 'tabular-nums' }}>
                {fmtNum(r.productionLife)} {PRODUCTION_UOM}
              </span>
              {r.status === 'ACTIVE' && renderLiveBadge()}
            </div>
            {pct != null && expected != null && (
              <span style={{ fontSize: 11, color: pct >= 100 ? '#dc2626' : pct >= 80 ? '#d97706' : '#059669', fontWeight: 600 }}>
                {pct}% of {fmtNum(expected)} {PRODUCTION_UOM}
              </span>
            )}
          </div>
        );
      },
    },
    {
      title: 'End Reason', key: 'reason', width: 205, ellipsis: true,
      render: (_, r) => {
        if (r.status === 'ACTIVE') {
          return (
            <span style={{ color: '#059669', fontWeight: 600, fontSize: 12.5 }}>
              In Service (Running)
            </span>
          );
        }
        return r.reason ? (
          <Tooltip title={r.reason}>
            <span>{r.reason}</span>
          </Tooltip>
        ) : EMPTY;
      },
    },
    {
      title: 'Condition', key: 'condition', width: 120,
      render: (_, r) => (r.conditionStatus ? <Tag color={CONDITION_COLORS[r.conditionStatus] ?? 'default'}>{r.conditionStatus}</Tag> : EMPTY),
    },
    {
      title: 'Disposition', key: 'disposition', width: 150,
      render: (_, r) =>
        r.dispositionType ? (
          <Tooltip title={r.dispositionNote || `Disposition of tool ${r.toolCode}`}>
            <Tag color={DISPOSITION_COLORS[r.dispositionType] ?? 'default'}>{DISPOSITION_LABELS[r.dispositionType] ?? r.dispositionType}</Tag>
          </Tooltip>
        ) : EMPTY,
    },
    {
      title: 'Voucher #', key: 'storeIssue', width: 150,
      render: (_, r) => (r.storeIssueNumber ? <code>{r.storeIssueNumber}</code> : EMPTY),
    },
    {
      title: 'Status', key: 'status', width: 125,
      render: (_, r) =>
        r.status === 'STANDBY' ? (
          <Tag color="gold" icon={<PauseCircleOutlined />} style={{ fontWeight: 700, margin: 0 }}>
            STANDBY
          </Tag>
        ) : (
          <StatusBadge status={r.status} />
        ),
    },
    {
      title: 'Actions', key: 'actions', width: 92, fixed: 'right', align: 'center',
      render: (_, r) => (
        <div className="pwi-setup-actions" style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          {renderActionPill(
            'blue',
            <EyeOutlined />,
            `View Session Details — ${r.toolCode}`,
            `View session details for ${r.toolCode}`,
            () => openSessionDetails(r),
          )}
          {r.status === 'ACTIVE' && can('manufacturing.component_change.create') && renderActionPill(
            'green',
            <SwapOutlined />,
            `Unmount / Changeover — ${r.toolCode}`,
            `Unmount or changeover tool ${r.toolCode}`,
            () => openChangeoverFromLifeRow(r),
          )}
          {r.status === 'STANDBY' && can('manufacturing.component_change.create') && renderActionPill(
            'green',
            <PlayCircleOutlined />,
            `Re-Mount Standby Tool — ${r.toolCode}`,
            `Re-mount standby tool ${r.toolCode}`,
            openRemountModal,
          )}
          {r.status === 'CLOSED' && renderActionPill(
            'amber',
            <EditOutlined />,
            r.dispositionType ? `Edit Disposition — ${r.toolCode}` : `Record Disposition — ${r.toolCode}`,
            `Dispose tool ${r.toolCode}`,
            () => openDispose(r),
          )}
        </div>
      ),
    },
  ];

  const reportMachines = useMemo<ReportMachineSummary[]>(() => {
    if (Array.isArray(report?.machines) && report.machines.length > 0) {
      return report.machines;
    }
    const rows = report?.rows ?? [];
    const map = new Map<string, ReportMachineSummary>();
    for (const r of rows) {
      const mId = r.machine?.id ?? 'unknown';
      const cur = map.get(mId) ?? {
        machine: r.machine,
        toolCount: 0,
        changes: 0,
        qtyUsed: 0,
        totalCost: 0,
        productionCovered: 0,
        costPerGross: null,
        lastChangeDate: null,
        components: [],
      };
      cur.toolCount += 1;
      cur.changes += r.changes;
      cur.qtyUsed += r.qtyUsed;
      cur.totalCost = Number((cur.totalCost + (r.totalCost || 0)).toFixed(2));
      if ((r.productionCovered || 0) > cur.productionCovered) {
        cur.productionCovered = r.productionCovered || 0;
      }
      if (r.lastChangeDate && (!cur.lastChangeDate || r.lastChangeDate > cur.lastChangeDate)) {
        cur.lastChangeDate = r.lastChangeDate;
      }
      cur.components.push(r);
      map.set(mId, cur);
    }
    return Array.from(map.values()).map((mg) => ({
      ...mg,
      costPerGross:
        mg.productionCovered > 0
          ? Number(((mg.totalCost / mg.productionCovered) * 144).toFixed(2))
          : null,
    }));
  }, [report]);

  const reportMachineColumns: ColumnsType<ReportMachineSummary> = [
    {
      title: 'Machine',
      key: 'machine',
      width: 240,
      render: (_, m) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, lineHeight: 1.3 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <Tag color="geekblue" icon={<ClusterOutlined />} style={{ margin: 0, fontWeight: 700, borderRadius: 6 }}>
              {m.machine?.machineCode ?? '—'}
            </Tag>
            {m.machine?.divisionName && (
              <Tag color="cyan" style={{ margin: 0, fontSize: 10.5, borderRadius: 5, fontWeight: 600 }}>
                {m.machine.divisionName}
              </Tag>
            )}
          </div>
          {m.machine?.machineName && (
            <span style={{ fontSize: 12, fontWeight: 600, color: token.colorText }}>
              {m.machine.machineName}
            </span>
          )}
        </div>
      ),
    },
    {
      title: 'Tools Used',
      key: 'toolsUsed',
      width: 175,
      render: (_, m) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, lineHeight: 1.3 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Tag color="blue" style={{ margin: 0, fontWeight: 700, borderRadius: 12 }}>
              {m.toolCount} {m.toolCount === 1 ? 'Tool Type' : 'Tool Types'}
            </Tag>
            <span style={{ fontWeight: 700, color: token.colorText, fontVariantNumeric: 'tabular-nums' }}>
              {fmtNum(m.qtyUsed)} Qty
            </span>
          </div>
          <span style={{ fontSize: 11, color: token.colorTextTertiary }}>
            {m.changes} {m.changes === 1 ? 'changeover' : 'changeovers'}
          </span>
        </div>
      ),
    },
    {
      title: 'Total Tooling Cost',
      dataIndex: 'totalCost',
      key: 'totalCost',
      width: 170,
      align: 'right',
      render: (v: number, m) => {
        const missingRates = (m.components || []).filter((c) => !(c.unitCost > 0)).length;
        return (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
            <span style={{ fontWeight: 700, fontSize: 13.5, color: token.colorText, fontVariantNumeric: 'tabular-nums' }}>
              {fmtPkr(v)}
            </span>
            {missingRates > 0 && (
              <Tag color="warning" style={{ margin: 0, fontSize: 10, lineHeight: '15px', fontWeight: 600 }}>
                {missingRates} rate{missingRates === 1 ? '' : 's'} needed (expand)
              </Tag>
            )}
          </div>
        );
      },
    },
    {
      title: 'Production Covered',
      dataIndex: 'productionCovered',
      key: 'productionCovered',
      width: 185,
      align: 'right',
      render: (v: number) => (
        <span style={{ fontWeight: 700, fontSize: 13.5, color: 'var(--theme-primary)', fontVariantNumeric: 'tabular-nums' }}>
          {fmtNum(v)} {PRODUCTION_UOM}
        </span>
      ),
    },
    {
      title: 'Cost / Gross (144 PCS)',
      dataIndex: 'costPerGross',
      key: 'costPerGross',
      width: 185,
      align: 'right',
      render: (v: number | null) =>
        v != null ? (
          <Tag
            color={v > 0 ? 'purple' : 'default'}
            style={{ margin: 0, fontWeight: 700, fontSize: 12, padding: '2px 9px', borderRadius: 6, fontVariantNumeric: 'tabular-nums' }}
          >
            {fmtPkr(v, 2)} / Gross
          </Tag>
        ) : (
          EMPTY
        ),
    },
    {
      title: 'Last Change',
      dataIndex: 'lastChangeDate',
      key: 'lastChangeDate',
      width: 125,
      render: (v: string | null) => renderDateValue(v),
    },
  ];

  const renderInlineUnitRateCell = (r: {
    component?: { id: string; componentCode?: string } | null;
    unitCost: number;
    costSource?: ReportRow['costSource'];
  }) => {
    const compId = r.component?.id;
    const isEditing = compId && editingRateCompId === compId;
    if (isEditing) {
      return (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 4, justifyContent: 'flex-end' }}
        >
          <InputNumber
            size="small"
            min={0}
            step={100}
            value={editingRateValue}
            onChange={(val) => setEditingRateValue(Number(val) || 0)}
            onPressEnter={() => handleSaveComponentRate(compId, editingRateValue)}
            style={{ width: 105 }}
            autoFocus
          />
          <Button
            size="small"
            type="primary"
            icon={<CheckOutlined />}
            loading={savingRate}
            onClick={() => handleSaveComponentRate(compId, editingRateValue)}
            aria-label="Save unit rate"
          />
          <Button
            size="small"
            icon={<CloseOutlined />}
            onClick={() => setEditingRateCompId(null)}
            aria-label="Cancel edit rate"
          />
        </div>
      );
    }
    const hasRate = (r.unitCost ?? 0) > 0;
    const srcLabel =
      r.costSource === 'SNAPSHOT'
        ? 'Issued'
        : r.costSource === 'INVENTORY_AVG'
          ? 'Avg Cost'
          : r.costSource === 'LATEST_GRN'
            ? 'GRN'
            : r.costSource === 'ITEM_MASTER'
              ? 'Item Master'
              : r.costSource === 'COMPONENT'
                ? 'Saved'
                : null;
    return (
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end' }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', lineHeight: 1.2 }}>
          <span
            style={{
              fontWeight: 700,
              color: hasRate ? token.colorText : '#d97706',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {hasRate ? fmtPkr(r.unitCost) : 'Rs. 0'}
          </span>
          {srcLabel && (
            <span style={{ fontSize: 10, color: token.colorTextTertiary }}>{srcLabel}</span>
          )}
        </div>
        {compId && can('manufacturing.tool_component.update') && (
          <Tooltip title={hasRate ? 'Edit tool unit rate (PKR)' : 'Enter missing unit rate (PKR)'}>
            <button
              type="button"
              className="pwi-action-pill pwi-action-pill--amber"
              aria-label={`Edit unit rate for ${r.component?.componentCode}`}
              onClick={() => {
                setEditingRateCompId(compId);
                setEditingRateValue(r.unitCost || 0);
              }}
              style={{
                width: 24,
                height: 24,
                minWidth: 24,
                padding: 0,
                borderRadius: 6,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                color: '#B45309',
                background: '#FEF3C7',
                border: '1px solid #FCD34D',
              }}
            >
              <EditOutlined style={{ fontSize: 12 }} />
            </button>
          </Tooltip>
        )}
      </div>
    );
  };

  const reportDetailColumns: ColumnsType<ReportRow> = [
    {
      title: 'Component / Tooling',
      key: 'component',
      width: 265,
      render: (_, r) =>
        renderToolItemStack(r.component?.componentCode, r.component?.componentName, {
          extraMeta: formatComponentTypeLabel(r.component?.componentType),
        }),
    },
    { title: 'Changes', dataIndex: 'changes', key: 'changes', width: 78, align: 'right' },
    {
      title: 'Qty Used',
      key: 'qtyUsed',
      width: 105,
      align: 'right',
      render: (_, r) => (
        <span style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
          {fmtNum(r.qtyUsed)}
          {r.component?.uomCode ? ` ${r.component.uomCode}` : ''}
        </span>
      ),
    },
    {
      title: 'Unit Rate (PKR)',
      key: 'unitCost',
      width: 195,
      align: 'right',
      render: (_, r) => renderInlineUnitRateCell(r),
    },
    {
      title: 'Total Cost',
      dataIndex: 'totalCost',
      key: 'totalCost',
      width: 130,
      align: 'right',
      render: (v: number) => (
        <span style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
          {fmtPkr(v)}
        </span>
      ),
    },
    {
      title: 'Production Covered',
      dataIndex: 'productionCovered',
      key: 'productionCovered',
      width: 165,
      align: 'right',
      render: (v: number, r) => (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', lineHeight: 1.25 }}>
          <span style={{ fontWeight: 700, color: 'var(--theme-primary)', fontVariantNumeric: 'tabular-nums' }}>
            {fmtNum(v)} {PRODUCTION_UOM}
          </span>
          {r.avgLife != null && r.changes > 1 && (
            <span style={{ fontSize: 10.5, color: token.colorTextTertiary }}>
              Avg: {fmtNum(r.avgLife)} {PRODUCTION_UOM}
            </span>
          )}
        </div>
      ),
    },
    {
      title: 'Cost / Gross (144 PCS)',
      dataIndex: 'costPerGross',
      key: 'costPerGross',
      width: 155,
      align: 'right',
      render: (v: number | null) =>
        v != null ? (
          <span style={{ fontWeight: 700, color: '#7c3aed', fontVariantNumeric: 'tabular-nums' }}>
            {fmtPkr(v, 2)} / Gross
          </span>
        ) : (
          EMPTY
        ),
    },
    {
      title: 'Last Change',
      dataIndex: 'lastChangeDate',
      key: 'lastChangeDate',
      width: 112,
      render: (v: string | null) => renderDateValue(v),
    },
  ];

  const liveCostMachines = useMemo<LiveCostMachineSummary[]>(() => {
    return Array.isArray(liveCosting?.machines) ? liveCosting.machines : [];
  }, [liveCosting]);

  const liveCostMachineColumns: ColumnsType<LiveCostMachineSummary> = [
    {
      title: 'Machine',
      key: 'machine',
      width: 245,
      render: (_, m) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, lineHeight: 1.3 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <Tag color="geekblue" icon={<ClusterOutlined />} style={{ margin: 0, fontWeight: 700, borderRadius: 6 }}>
              {m.machine?.machineCode ?? '—'}
            </Tag>
            {m.machine?.divisionName && (
              <Tag color="cyan" style={{ margin: 0, fontSize: 10.5, borderRadius: 5, fontWeight: 600 }}>
                {m.machine.divisionName}
              </Tag>
            )}
          </div>
          {m.machine?.machineName && (
            <span style={{ fontSize: 12, fontWeight: 600, color: token.colorText }}>
              {m.machine.machineName}
            </span>
          )}
        </div>
      ),
    },
    {
      title: 'Active Tools Count',
      key: 'activeToolsCount',
      width: 185,
      render: (_, m) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3, lineHeight: 1.3 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Tag color="cyan" style={{ margin: 0, fontWeight: 700, borderRadius: 12 }}>
              {m.activeToolsCount} {m.activeToolsCount === 1 ? 'Active Tool' : 'Active Tools'}
            </Tag>
            <span style={{ fontWeight: 700, color: token.colorText, fontVariantNumeric: 'tabular-nums' }}>
              {fmtNum(m.qtyUsed)} Qty
            </span>
          </div>
          {m.earliestInstallDate && (
            <span style={{ fontSize: 11, color: token.colorTextTertiary }}>
              Earliest mounted: {m.earliestInstallDate}
            </span>
          )}
        </div>
      ),
    },
    {
      title: 'Total Setup Tooling Cost (PKR)',
      dataIndex: 'totalCost',
      key: 'totalCost',
      width: 205,
      align: 'right',
      render: (v: number, m) => {
        const missingRates = (m.components || []).filter((c) => !(c.unitCost > 0)).length;
        return (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
            <span style={{ fontWeight: 700, fontSize: 13.5, color: token.colorText, fontVariantNumeric: 'tabular-nums' }}>
              {fmtPkr(v)}
            </span>
            {missingRates > 0 && (
              <Tag color="warning" style={{ margin: 0, fontSize: 10, lineHeight: '15px', fontWeight: 600 }}>
                {missingRates} rate{missingRates === 1 ? '' : 's'} needed (expand)
              </Tag>
            )}
          </div>
        );
      },
    },
    {
      title: `Total Production Covered (${PRODUCTION_UOM})`,
      dataIndex: 'productionCovered',
      key: 'productionCovered',
      width: 215,
      align: 'right',
      render: (v: number) => (
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end' }}>
          <span style={{ fontWeight: 700, fontSize: 13.5, color: 'var(--theme-primary)', fontVariantNumeric: 'tabular-nums' }}>
            {fmtNum(v)} {PRODUCTION_UOM}
          </span>
          {renderLiveBadge()}
        </div>
      ),
    },
    {
      title: 'Combined Cost / Gross (144 PCS)',
      dataIndex: 'combinedCostPerGross',
      key: 'combinedCostPerGross',
      width: 215,
      align: 'right',
      render: (v: number | null) =>
        v != null ? (
          <Tag
            color={v > 0 ? 'purple' : 'default'}
            style={{ margin: 0, fontWeight: 700, fontSize: 12.5, padding: '3px 10px', borderRadius: 6, fontVariantNumeric: 'tabular-nums' }}
          >
            {fmtPkr(v, 2)} / Gross
          </Tag>
        ) : (
          EMPTY
        ),
    },
  ];

  const liveCostDetailColumns: ColumnsType<LiveCostToolRow> = [
    {
      title: 'Component / Tooling',
      key: 'component',
      width: 270,
      render: (_, r) =>
        renderToolItemStack(r.component?.componentCode, r.component?.componentName, {
          extraMeta: [
            formatComponentTypeLabel(r.component?.componentType),
            r.storeIssueNumber || null,
          ]
            .filter(Boolean)
            .join(' · '),
        }),
    },
    {
      title: 'Installed / Issued Date & Running Days',
      key: 'installDate',
      width: 195,
      render: (_, r) => {
        const days = r.runningDays ?? 0;
        const dayLabel = days === 0 ? 'Today (0d)' : `${days} ${days === 1 ? 'day' : 'days'}`;
        const isCarryover = Boolean(
          r.installDate && r.installDate < dayjs().startOf('month').format('YYYY-MM-DD'),
        );
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {renderDateValue(r.installDate)}
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
              <Tag
                color={isCarryover ? 'orange' : 'cyan'}
                style={{ margin: 0, fontSize: 10.5, fontWeight: 700, borderRadius: 5, lineHeight: '16px' }}
              >
                {dayLabel}
              </Tag>
              {isCarryover && (
                <Tag
                  color="gold"
                  style={{ margin: 0, fontSize: 10, fontWeight: 600, borderRadius: 4, lineHeight: '15px' }}
                >
                  Prior Month
                </Tag>
              )}
            </div>
          </div>
        );
      },
    },
    {
      title: 'Qty Used',
      key: 'qtyUsed',
      width: 100,
      align: 'right',
      render: (_, r) => (
        <span style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
          {fmtNum(r.qtyUsed)}
          {r.component?.uomCode ? ` ${r.component.uomCode}` : ''}
        </span>
      ),
    },
    {
      title: 'Unit Rate (PKR)',
      key: 'unitCost',
      width: 195,
      align: 'right',
      render: (_, r) => renderInlineUnitRateCell(r),
    },
    {
      title: 'Total Cost',
      dataIndex: 'totalCost',
      key: 'totalCost',
      width: 130,
      align: 'right',
      render: (v: number) => (
        <span style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
          {fmtPkr(v)}
        </span>
      ),
    },
    {
      title: `Production Covered (${PRODUCTION_UOM})`,
      dataIndex: 'productionCovered',
      key: 'productionCovered',
      width: 185,
      align: 'right',
      render: (v: number) => (
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end' }}>
          <span style={{ fontWeight: 700, color: 'var(--theme-primary)', fontVariantNumeric: 'tabular-nums' }}>
            {fmtNum(v)} {PRODUCTION_UOM}
          </span>
          {renderLiveBadge()}
        </div>
      ),
    },
    {
      title: 'Cost / Gross (144 PCS)',
      dataIndex: 'costPerGross',
      key: 'costPerGross',
      width: 165,
      align: 'right',
      render: (v: number | null) =>
        v != null ? (
          <span style={{ fontWeight: 700, color: '#7c3aed', fontVariantNumeric: 'tabular-nums' }}>
            {fmtPkr(v, 2)} / Gross
          </span>
        ) : (
          EMPTY
        ),
    },
  ];

  const primaryAdd =
    activeTab === 'setup'
      ? {
          label: 'Add Tool / Component',
          icon: <PlusOutlined />,
          onClick: handleCreateComponent,
          show: can('manufacturing.tool_component.create'),
        }
      : activeTab === 'changes'
        ? {
            label: 'Record Change',
            icon: <PlusOutlined />,
            onClick: () => openRecordChange(null),
            show: can('manufacturing.component_change.create'),
          }
        : activeTab === 'active'
          ? {
              label: 'Install Tool',
              icon: <PlusOutlined />,
              onClick: openInstall,
              show: can('manufacturing.component_change.create'),
            }
          : activeTab === 'life'
            ? {
                label: 'Record Disposition',
                icon: <EditOutlined />,
                onClick: () => {
                  const target =
                    lifeRows.find((r) => r.status === 'CLOSED' && !r.dispositionType) ||
                    lifeRows.find((r) => r.status === 'CLOSED');
                  if (target) {
                    openDispose(target);
                  } else {
                    setActiveTab('active');
                    message.info('Select a tool from Active Tools to remove and record disposition');
                  }
                },
                show: can('manufacturing.component_change.create'),
              }
            : null;

  const handleRefreshActiveTab = useCallback(() => {
    if (activeTab === 'setup') fetchComponents(compPage);
    else if (activeTab === 'changes') fetchChanges(chgPage);
    else if (activeTab === 'active') {
      fetchActiveTools(atPage);
      fetchStandbyTools();
    } else if (activeTab === 'life') {
      fetchLifeReport(lifePage);
      fetchStandbyTools();
    } else if (activeTab === 'report') fetchReport();
    else if (activeTab === 'liveCosting') fetchLiveCosting();
  }, [
    activeTab, compPage, chgPage, atPage, lifePage,
    fetchComponents, fetchChanges, fetchActiveTools, fetchLifeReport, fetchReport, fetchLiveCosting, fetchStandbyTools,
  ]);

  const buildActiveTabExportPayload = useCallback(async (): Promise<ToolExportPayload> => {
    const fmtMachine = (m?: { machineCode?: string | null; machineNumber?: string | null; name?: string | null } | null) => {
      if (!m) return '—';
      const code = m.machineCode || m.machineNumber || '';
      const nm = m.name || '';
      if (code && nm) return `${code} — ${nm}`;
      return code || nm || '—';
    };
    const lookupMachineLabel = (machineId?: string) => {
      if (!machineId) return undefined;
      const m = machines.find((x) => x.id === machineId);
      return m ? fmtMachine(m) : machineId;
    };
    const fmtDate = (d?: string | null) => (d ? dayjs(d).format('DD MMM YYYY') : '—');
    const fmtQty = (v?: number | string | null, uom?: string | null) => {
      const n = num(v);
      if (n === null) return '—';
      return `${Number(n.toFixed(2)).toLocaleString('en-US')}${uom ? ` ${uom}` : ''}`;
    };

    if (activeTab === 'life') {
      const params: Record<string, any> = { page: 1, limit: 2000 };
      if (lifeSearch) params.search = lifeSearch;
      if (fLifeMachine) params.machineId = fLifeMachine;
      if (fLifeComponent) params.componentId = fLifeComponent;
      if (fLifeDisposition) params.dispositionType = fLifeDisposition;
      if (fLifeStatus) params.status = fLifeStatus;
      if (fLifeFrom) params.from = fLifeFrom;
      if (fLifeTo) params.to = fLifeTo;

      let rows = lifeRows;
      let summary = lifeSummary;
      try {
        const res = await apiService.get<LifeReportData>('/machine-tooling/life-report', params, { silent: true });
        if (res?.data) {
          rows = res.data;
          summary = res.summary || lifeSummary;
        }
      } catch {}

      const filterParts: string[] = [];
      if (fLifeStatus) filterParts.push(`Status: ${fLifeStatus}`);
      if (fLifeMachine) filterParts.push(`Machine: ${lookupMachineLabel(fLifeMachine)}`);
      if (fLifeDisposition) filterParts.push(`Disposition: ${DISPOSITION_LABELS[fLifeDisposition] || fLifeDisposition}`);
      if (fLifeFrom || fLifeTo) filterParts.push(`Period: ${fLifeFrom || '...'} to ${fLifeTo || '...'}`);
      if (lifeSearch) filterParts.push(`Search: "${lifeSearch}"`);

      return {
        reportTitle: 'Machine Tools & Component Life History Report',
        subtitle: 'Machine Tools & Components · Engineering & Store Control',
        fileBaseName: 'PWI-Tool-Life-Report',
        printedBy: printedByName,
        filterSummary: filterParts.length > 0 ? filterParts.join(' · ') : 'All Tool Runs (No Active Filters)',
        kpis: [
          { label: 'Total Runs', value: String(summary?.installs ?? rows.length), tone: 'neutral' },
          { label: 'Active', value: String(summary?.active ?? rows.filter((r) => r.status === 'ACTIVE').length), tone: 'success' },
          { label: 'Standby', value: String(summary?.standby ?? rows.filter((r) => r.status === 'STANDBY').length), tone: 'warning' },
          { label: 'Closed', value: String(summary?.closed ?? rows.filter((r) => r.status === 'CLOSED').length), tone: 'neutral' },
          { label: 'With Disposition', value: String(summary?.withDisposition ?? rows.filter((r) => !!r.dispositionType).length), tone: 'primary' },
          {
            label: 'Total Production Life',
            value: `${fmtNum(summary?.totalProductionLife ?? rows.reduce((s, r) => s + (num(r.productionLife) || 0), 0))} ${PRODUCTION_UOM}`,
            tone: 'primary',
          },
          {
            label: 'Avg Life',
            value: summary?.avgLife != null ? `${fmtNum(summary.avgLife)} ${PRODUCTION_UOM}` : '—',
            tone: 'neutral',
          },
        ],
        columns: [
          { header: '#', key: 'seq', align: 'center', widthWeight: 0.45 },
          { header: 'Machine', key: 'machine', widthWeight: 1.45 },
          { header: 'Component', key: 'component', widthWeight: 1.45 },
          { header: 'Tool Run', key: 'toolRun', widthWeight: 1.05 },
          { header: 'Issued Date', key: 'issuedDate', widthWeight: 0.85 },
          { header: 'Closed Date', key: 'closedDate', widthWeight: 0.85 },
          { header: 'Production Life', key: 'productionLife', align: 'right', widthWeight: 0.95 },
          { header: 'End Reason', key: 'endReason', widthWeight: 1.1 },
          { header: 'Condition', key: 'condition', align: 'center', widthWeight: 0.7 },
          { header: 'Disposition', key: 'disposition', widthWeight: 0.95 },
          { header: 'Voucher #', key: 'voucher', widthWeight: 0.9 },
          { header: 'Status', key: 'status', align: 'center', widthWeight: 0.68 },
        ],
        rows: rows.map((r, idx) => ({
          seq: idx + 1,
          machine: fmtMachine(r.machine),
          component: r.component ? `${r.component.componentCode} — ${r.component.componentName}` : '—',
          toolRun: `${r.toolCode}${(r.sessionCount ?? 1) > 1 ? ` (S${r.sessionCount})` : ''}`,
          issuedDate: fmtDate(r.installDate),
          closedDate: fmtDate(r.removeDate || r.closedAt),
          productionLife: fmtQty(r.productionLife, PRODUCTION_UOM),
          endReason: r.status === 'ACTIVE' ? 'In Service (Running)' : (r.reason || r.remarks || '—'),
          condition: r.conditionStatus || '—',
          disposition: r.dispositionType ? DISPOSITION_LABELS[r.dispositionType] || r.dispositionType : 'Pending',
          voucher: r.storeIssueNumber || r.jobCardNo || '—',
          status: r.status || '—',
        })),
      };
    }

    if (activeTab === 'active') {
      const params: Record<string, any> = { page: 1, limit: 2000 };
      if (atSearch) params.search = atSearch;
      if (fAtMachine) params.machineId = fAtMachine;

      let rows = activeTools;
      try {
        const res = await apiService.get<{ data: ActiveToolRec[] }>('/machine-tooling/active-tools', params, { silent: true });
        if (res?.data) rows = res.data;
      } catch {}

      const filterParts: string[] = [];
      if (fAtMachine) filterParts.push(`Machine: ${lookupMachineLabel(fAtMachine)}`);
      if (atSearch) filterParts.push(`Search: "${atSearch}"`);

      const totalLive = rows.reduce((s, r) => s + (num(r.usedByInstalled) || 0), 0);
      return {
        reportTitle: 'Active Mounted Machine Tools Report',
        subtitle: 'Machine Tools & Components · Live Production Run Status',
        fileBaseName: 'PWI-Active-Tools-Report',
        printedBy: printedByName,
        filterSummary: filterParts.length > 0 ? filterParts.join(' · ') : 'All Currently Mounted Tools',
        kpis: [
          { label: 'Active Mounted Tools', value: String(rows.length), tone: 'success' },
          { label: 'Reusable Standby Pool', value: String(standbyTools.length), tone: 'warning' },
          { label: 'Multi-Session Runs', value: String(rows.filter((r) => (r.sessionCount ?? 1) > 1).length), tone: 'primary' },
          { label: 'Combined Live Output', value: `${fmtNum(totalLive)} ${PRODUCTION_UOM}`, tone: 'primary' },
        ],
        columns: [
          { header: '#', key: 'seq', align: 'center', widthWeight: 0.45 },
          { header: 'Machine', key: 'machine', widthWeight: 1.45 },
          { header: 'Component', key: 'component', widthWeight: 1.45 },
          { header: 'Tool Code', key: 'toolCode', widthWeight: 1.05 },
          { header: 'Issued Date', key: 'installDate', widthWeight: 0.9 },
          { header: 'Prior Sessions', key: 'priorLife', align: 'right', widthWeight: 0.9 },
          { header: 'Current Session', key: 'currentSession', align: 'right', widthWeight: 0.95 },
          { header: 'Total Life', key: 'totalLife', align: 'right', widthWeight: 0.95 },
          { header: 'Remaining', key: 'remaining', align: 'right', widthWeight: 0.9 },
          { header: 'Voucher #', key: 'voucher', widthWeight: 0.9 },
          { header: 'Operator / Issuer', key: 'operator', widthWeight: 1.0 },
        ],
        rows: rows.map((r, idx) => ({
          seq: idx + 1,
          machine: fmtMachine(r.machine),
          component: r.component ? `${r.component.componentCode} — ${r.component.componentName}` : '—',
          toolCode: `${r.installedToolCode}${(r.sessionCount ?? 1) > 1 ? ` (S${r.sessionCount})` : ''}`,
          installDate: fmtDate(r.installDate),
          priorLife: fmtQty(r.accumulatedLifeBeforeCurrentSession ?? 0, PRODUCTION_UOM),
          currentSession: fmtQty(r.currentSessionProduction ?? r.usedByInstalled, PRODUCTION_UOM),
          totalLife: fmtQty(r.usedByInstalled, PRODUCTION_UOM),
          remaining: r.remainingByInstalled != null ? fmtQty(r.remainingByInstalled, PRODUCTION_UOM) : '—',
          voucher: r.storeIssueNumber || r.jobCardNo || '—',
          operator: r.operatorName || r.issuedByName || '—',
        })),
      };
    }

    if (activeTab === 'changes') {
      const params: Record<string, any> = { page: 1, limit: 2000 };
      if (chgSearch) params.search = chgSearch;
      if (fChgMachine) params.machineId = fChgMachine;
      if (fChgComponent) params.componentId = fChgComponent;
      if (fChgCondition) params.conditionStatus = fChgCondition;
      if (fChgFrom) params.from = fChgFrom;
      if (fChgTo) params.to = fChgTo;

      let rows = changes;
      try {
        const res = await apiService.get<{ data: ChangeRec[] }>('/machine-tooling/changes', params, { silent: true });
        if (res?.data) rows = res.data;
      } catch {}

      const filterParts: string[] = [];
      if (fChgMachine) filterParts.push(`Machine: ${lookupMachineLabel(fChgMachine)}`);
      if (fChgCondition) filterParts.push(`Condition: ${fChgCondition}`);
      if (fChgFrom || fChgTo) filterParts.push(`Period: ${fChgFrom || '...'} to ${fChgTo || '...'}`);
      if (chgSearch) filterParts.push(`Search: "${chgSearch}"`);

      return {
        reportTitle: 'Machine Tool Changeover & Replacement Log',
        subtitle: 'Machine Tools & Components · Historical Tool Changeover Audit',
        fileBaseName: 'PWI-Tool-Change-History',
        printedBy: printedByName,
        filterSummary: filterParts.length > 0 ? filterParts.join(' · ') : 'All Tool Change Events',
        kpis: [
          { label: 'Total Changes', value: String(rows.length), tone: 'primary' },
          { label: 'New Tools Installed', value: String(rows.filter((r) => r.conditionStatus === 'NEW').length), tone: 'success' },
          {
            label: 'Damaged / Reworked',
            value: String(rows.filter((r) => r.conditionStatus === 'DAMAGED' || r.conditionStatus === 'REWORKED').length),
            tone: 'warning',
          },
          {
            label: 'Total Production Covered',
            value: `${fmtNum(rows.reduce((s, r) => s + (num(r.currentLifeQty ?? r.productionSincePrevious) || 0), 0))} ${PRODUCTION_UOM}`,
            tone: 'neutral',
          },
        ],
        columns: [
          { header: '#', key: 'seq', align: 'center', widthWeight: 0.45 },
          { header: 'Change Date', key: 'changeDate', widthWeight: 0.85 },
          { header: 'Machine', key: 'machine', widthWeight: 1.4 },
          { header: 'Component', key: 'component', widthWeight: 1.4 },
          { header: 'Old Tool', key: 'oldTool', widthWeight: 0.95 },
          { header: 'New Tool', key: 'newTool', widthWeight: 0.95 },
          { header: 'Production Life', key: 'prodPrev', align: 'right', widthWeight: 0.95 },
          { header: 'Condition', key: 'condition', align: 'center', widthWeight: 0.75 },
          { header: 'Reason / Remarks', key: 'reason', widthWeight: 1.25 },
          { header: 'Changed By', key: 'changedBy', widthWeight: 0.9 },
        ],
        rows: rows.map((r, idx) => ({
          seq: idx + 1,
          changeDate: fmtDate(r.changeDate),
          machine: fmtMachine(r.machine),
          component: r.component ? `${r.component.componentCode} — ${r.component.componentName}` : '—',
          oldTool: r.oldToolCode || '—',
          newTool: r.newToolCode || '—',
          prodPrev: fmtQty(r.currentLifeQty ?? r.productionSincePrevious, PRODUCTION_UOM),
          condition: r.conditionStatus || '—',
          reason: r.reason || r.remarks || '—',
          changedBy: r.changedByUser?.fullName || r.changedByUser?.name || '—',
        })),
      };
    }

    if (activeTab === 'report') {
      const rows = report?.rows || [];
      const filterParts = [`Month: ${reportMonth.format('MMMM YYYY')}`];
      if (fReportDivision) {
        const divName = divisions.find((d) => d.id === fReportDivision)?.name || fReportDivision;
        filterParts.push(`Division: ${divName}`);
      }
      if (fReportMachine) filterParts.push(`Machine: ${lookupMachineLabel(fReportMachine)}`);

      return {
        reportTitle: `Monthly Tool Consumption & Cost Report — ${reportMonth.format('MMMM YYYY')}`,
        subtitle: 'Machine Tools & Components · Cost per Gross (144 PCS) & Output Analysis',
        fileBaseName: `PWI-Monthly-Tool-Consumption-${reportMonth.format('YYYY-MM')}`,
        printedBy: printedByName,
        filterSummary: filterParts.join(' · '),
        kpis: [
          { label: 'Report Period', value: reportMonth.format('MMM YYYY'), tone: 'primary' },
          { label: 'Machines', value: String(report?.totals?.machines ?? 0), tone: 'neutral' },
          { label: 'Tools Installed', value: fmtNum(report?.totals?.qtyUsed ?? 0), tone: 'neutral' },
          { label: 'Production Covered', value: `${fmtNum(report?.totals?.productionCovered ?? 0)} ${PRODUCTION_UOM}`, tone: 'success' },
          { label: 'Total Tooling Cost', value: fmtPkr(report?.totals?.totalCost ?? 0), tone: 'warning' },
          {
            label: 'Avg Cost / Gross (144 PCS)',
            value: report?.totals?.avgCostPerGross != null ? `${fmtPkr(report.totals.avgCostPerGross, 2)} / Gross` : '—',
            tone: 'danger',
          },
        ],
        columns: [
          { header: '#', key: 'seq', align: 'center', widthWeight: 0.4 },
          { header: 'Machine', key: 'machine', widthWeight: 1.35 },
          { header: 'Division', key: 'division', widthWeight: 0.9 },
          { header: 'Component', key: 'component', widthWeight: 1.45 },
          { header: 'Changes', key: 'changes', align: 'right', widthWeight: 0.55 },
          { header: 'Qty Used', key: 'qtyUsed', align: 'right', widthWeight: 0.7 },
          { header: 'Unit Rate (PKR)', key: 'unitCost', align: 'right', widthWeight: 0.85 },
          { header: 'Total Cost (PKR)', key: 'totalCost', align: 'right', widthWeight: 0.9 },
          { header: 'Production Covered', key: 'productionCovered', align: 'right', widthWeight: 1.0 },
          { header: 'Cost / Gross', key: 'costPerGross', align: 'right', widthWeight: 0.85 },
          { header: 'Last Change', key: 'lastChange', widthWeight: 0.8 },
        ],
        rows: rows.map((r, idx) => ({
          seq: idx + 1,
          machine: fmtMachine(r.machine ? { machineCode: r.machine.machineCode, name: r.machine.machineName } : null),
          division: r.machine?.divisionName || '—',
          component: r.component ? `${r.component.componentCode} — ${r.component.componentName}` : '—',
          changes: r.changes,
          qtyUsed: fmtQty(r.qtyUsed, r.component?.uomCode),
          unitCost: fmtPkr(r.unitCost ?? 0),
          totalCost: fmtPkr(r.totalCost ?? 0),
          productionCovered: fmtQty(r.productionCovered, PRODUCTION_UOM),
          costPerGross: r.costPerGross != null ? `${fmtPkr(r.costPerGross, 2)} / Gross` : '—',
          lastChange: fmtDate(r.lastChangeDate),
        })),
      };
    }

    if (activeTab === 'liveCosting') {
      const rows = liveCosting?.rows || [];
      const filterParts: string[] = ['All Currently Active Tooling (All Months)'];
      if (fLiveCostDivision) {
        const divName = divisions.find((d) => d.id === fLiveCostDivision)?.name || fLiveCostDivision;
        filterParts.push(`Division: ${divName}`);
      }
      if (fLiveCostMachine) filterParts.push(`Machine: ${lookupMachineLabel(fLiveCostMachine)}`);

      return {
        reportTitle: 'Live Machine Tooling Costing Report',
        subtitle: 'Active Running Setups Across All Install Months · Combined Cost / Gross (144 PCS)',
        fileBaseName: 'PWI-Live-Machine-Tooling-Costing',
        printedBy: printedByName,
        filterSummary: filterParts.join(' · '),
        kpis: [
          { label: 'Active Machines', value: String(liveCosting?.totals?.machines ?? 0), tone: 'neutral' },
          { label: 'Active Tools Mounted', value: fmtNum(liveCosting?.totals?.activeTools ?? 0), tone: 'neutral' },
          { label: 'Combined Production', value: `${fmtNum(liveCosting?.totals?.productionCovered ?? 0)} ${PRODUCTION_UOM}`, tone: 'success' },
          { label: 'Active Setup Cost', value: fmtPkr(liveCosting?.totals?.totalCost ?? 0), tone: 'warning' },
          {
            label: 'Avg Combined Cost / Gross (144 PCS)',
            value:
              liveCosting?.totals?.avgCombinedCostPerGross != null
                ? `${fmtPkr(liveCosting.totals.avgCombinedCostPerGross, 2)} / Gross`
                : '—',
            tone: 'danger',
          },
        ],
        columns: [
          { header: '#', key: 'seq', align: 'center', widthWeight: 0.4 },
          { header: 'Machine', key: 'machine', widthWeight: 1.35 },
          { header: 'Division', key: 'division', widthWeight: 0.9 },
          { header: 'Component', key: 'component', widthWeight: 1.45 },
          { header: 'Installed Date', key: 'installDate', widthWeight: 0.85 },
          { header: 'Running Days', key: 'runningDays', align: 'right', widthWeight: 0.7 },
          { header: 'Qty Used', key: 'qtyUsed', align: 'right', widthWeight: 0.7 },
          { header: 'Unit Rate (PKR)', key: 'unitCost', align: 'right', widthWeight: 0.85 },
          { header: 'Total Cost (PKR)', key: 'totalCost', align: 'right', widthWeight: 0.9 },
          { header: 'Production Covered', key: 'productionCovered', align: 'right', widthWeight: 1.0 },
          { header: 'Cost / Gross', key: 'costPerGross', align: 'right', widthWeight: 0.85 },
        ],
        rows: rows.map((r, idx) => ({
          seq: idx + 1,
          machine: fmtMachine(r.machine ? { machineCode: r.machine.machineCode, name: r.machine.machineName } : null),
          division: r.machine?.divisionName || '—',
          component: r.component ? `${r.component.componentCode} — ${r.component.componentName}` : '—',
          installDate: fmtDate(r.installDate),
          runningDays: r.runningDays === 0 ? 'Today (0d)' : `${r.runningDays} d`,
          qtyUsed: fmtQty(r.qtyUsed, r.component?.uomCode),
          unitCost: fmtPkr(r.unitCost ?? 0),
          totalCost: fmtPkr(r.totalCost ?? 0),
          productionCovered: fmtQty(r.productionCovered, PRODUCTION_UOM),
          costPerGross: r.costPerGross != null ? `${fmtPkr(r.costPerGross, 2)} / Gross` : '—',
        })),
      };
    }

    // Default: Tool & Component Setup ('setup')
    const params: Record<string, any> = { page: 1, limit: 2000 };
    if (compSearch) params.search = compSearch;
    if (fCompMachine) params.machineId = fCompMachine;
    if (fCompType) params.componentType = fCompType;

    let rows = components;
    try {
      const res = await apiService.get<{ data: ComponentRec[] }>('/machine-tooling/components', params, { silent: true });
      if (res?.data) rows = res.data;
    } catch {}

    const filterParts: string[] = [];
    if (fCompMachine) filterParts.push(`Machine: ${lookupMachineLabel(fCompMachine)}`);
    if (fCompType) filterParts.push(`Type: ${fCompType}`);
    if (compSearch) filterParts.push(`Search: "${compSearch}"`);

    return {
      reportTitle: 'Machine Tools & Components Master Registry',
      subtitle: 'Machine Tools & Components · Engineering Master Setup',
      fileBaseName: 'PWI-Tool-Component-Setup',
      printedBy: printedByName,
      filterSummary: filterParts.length > 0 ? filterParts.join(' · ') : 'All Registered Machine Tools & Components',
      kpis: [
        { label: 'Total Components', value: String(rows.length), tone: 'primary' },
        { label: 'Store-Linked Items', value: String(rows.filter((r) => !!r.itemId || !!r.item).length), tone: 'success' },
        { label: 'Active Definitions', value: String(rows.filter((r) => r.isActive).length), tone: 'neutral' },
      ],
      columns: [
        { header: '#', key: 'seq', align: 'center', widthWeight: 0.45 },
        { header: 'Component Code', key: 'code', widthWeight: 0.95 },
        { header: 'Component Name', key: 'name', widthWeight: 1.45 },
        { header: 'Type', key: 'type', align: 'center', widthWeight: 0.7 },
        { header: 'Machine', key: 'machine', widthWeight: 1.4 },
        { header: 'Linked Store Item', key: 'storeItem', widthWeight: 1.45 },
        { header: 'Expected Life', key: 'expectedLife', align: 'right', widthWeight: 0.85 },
        { header: 'Status', key: 'status', align: 'center', widthWeight: 0.65 },
      ],
      rows: rows.map((r, idx) => {
        const machineList =
          Array.isArray(r.machines) && r.machines.length > 0
            ? r.machines.map((m) => m.machineCode || m.name || '').filter(Boolean).join(', ')
            : fmtMachine(r.machine);
        return {
          seq: idx + 1,
          code: r.componentCode || '—',
          name: r.componentName || '—',
          type: formatComponentTypeLabel(r.componentType),
          machine: machineList || '—',
          storeItem: r.item ? `${r.item.itemCode} — ${r.item.name || ''}` : '—',
          expectedLife: fmtQty(r.expectedLifeQuantity, PRODUCTION_UOM),
          status: r.isActive ? 'ACTIVE' : 'CLOSED',
        };
      }),
    };
  }, [
    activeTab, printedByName, machines, divisions,
    lifeSearch, fLifeMachine, fLifeComponent, fLifeDisposition, fLifeStatus, fLifeFrom, fLifeTo, lifeRows, lifeSummary,
    atSearch, fAtMachine, activeTools, standbyTools.length,
    chgSearch, fChgMachine, fChgComponent, fChgCondition, fChgFrom, fChgTo, changes,
    report, reportMonth, fReportDivision, fReportMachine,
    compSearch, fCompMachine, fCompType, components,
  ]);

  const handleHeaderExportCSV = useCallback(async () => {
    setExporting(true);
    try {
      const payload = await buildActiveTabExportPayload();
      if (payload.rows.length === 0) {
        message.info('No records available to export');
        return;
      }
      exportToolReportCSV(payload);
      message.success(`Exported ${payload.rows.length} record(s) to CSV`);
    } catch (err: any) {
      message.error(extractApiError(err, 'Failed to export CSV report'));
    } finally {
      setExporting(false);
    }
  }, [buildActiveTabExportPayload, message]);

  const handleHeaderExportPDF = useCallback(async () => {
    setExporting(true);
    try {
      const [payload, logo] = await Promise.all([
        buildActiveTabExportPayload(),
        logoDataUrl ? Promise.resolve(logoDataUrl) : loadCompanyLogoDataUrl(),
      ]);
      if (payload.rows.length === 0) {
        message.info('No records available to export as PDF');
        return;
      }
      exportToolReportPDF(payload, logo);
      message.success(`Downloaded PDF report (${payload.rows.length} record(s))`);
    } catch (err: any) {
      message.error(extractApiError(err, 'Failed to generate PDF report'));
    } finally {
      setExporting(false);
    }
  }, [buildActiveTabExportPayload, logoDataUrl, message]);

  const handleHeaderPrint = useCallback(async () => {
    // Open the print window synchronously within the user click gesture so popup blockers do not block it
    const printWin = window.open('', '_blank', 'width=1240,height=840');
    if (!printWin) {
      message.warning('Pop-up blocked by browser. Please allow pop-ups for this site to print the executive report.');
      return;
    }
    printWin.document.write(
      '<!DOCTYPE html><html><head><title>Preparing Executive Report...</title></head><body style="font-family:Segoe UI,Arial,sans-serif;padding:32px;color:#334155;">Preparing Executive Report...</body></html>',
    );
    setExporting(true);
    try {
      const [payload, logo] = await Promise.all([
        buildActiveTabExportPayload(),
        logoDataUrl ? Promise.resolve(logoDataUrl) : loadCompanyLogoDataUrl(),
      ]);
      printToolReport(payload, logo, printWin);
    } catch (err: any) {
      try {
        printWin.close();
      } catch {}
      message.error(extractApiError(err, 'Failed to prepare printable report'));
    } finally {
      setExporting(false);
    }
  }, [buildActiveTabExportPayload, logoDataUrl, message]);

  const headerActionButtons = useMemo(
    () => (
      <div
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          gap: 6,
          flexWrap: 'wrap',
          maxWidth: '100%',
        }}
      >
        <Dropdown
          trigger={['click']}
          placement="bottomRight"
          menu={{
            items: [
              {
                key: 'csv',
                icon: <FileExcelOutlined style={{ color: '#059669' }} />,
                label: 'Export Excel / CSV',
                onClick: () => { void handleHeaderExportCSV(); },
              },
              {
                key: 'pdf',
                icon: <FilePdfOutlined style={{ color: '#dc2626' }} />,
                label: 'Download PDF',
                onClick: () => { void handleHeaderExportPDF(); },
              },
              { type: 'divider' },
              {
                key: 'print',
                icon: <PrinterOutlined style={{ color: token.colorPrimary }} />,
                label: 'Print Report',
                onClick: () => { void handleHeaderPrint(); },
              },
            ],
          }}
        >
          <Button
            icon={<ExportOutlined />}
            loading={exporting}
            style={{
              height: 34,
              borderRadius: 8,
              fontWeight: 600,
              fontSize: 12.5,
              paddingInline: 10,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
            }}
          >
            <span>Export</span>
            <DownOutlined style={{ fontSize: 10, opacity: 0.75 }} />
          </Button>
        </Dropdown>

        {(activeTab === 'active' || activeTab === 'life') && can('manufacturing.component_change.create') && (
          <Button
            icon={<PlayCircleOutlined />}
            onClick={openRemountModal}
            style={{
              height: 34,
              borderRadius: 8,
              fontWeight: 600,
              fontSize: 12.5,
              paddingInline: 10,
              borderColor: '#f59e0b',
              color: '#d97706',
            }}
          >
            Re-Mount Standby{standbyTools.length > 0 ? ` (${standbyTools.length})` : ''}
          </Button>
        )}

        {primaryAdd?.show && (
          <Button
            type="primary"
            icon={primaryAdd.icon}
            onClick={primaryAdd.onClick}
            style={{
              height: 34,
              borderRadius: 8,
              fontWeight: 600,
              fontSize: 12.5,
              paddingInline: 11,
              background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
              borderColor: '#059669',
              boxShadow: '0 2px 6px rgba(16, 185, 129, 0.28)',
            }}
          >
            {primaryAdd.label}
          </Button>
        )}

        <Button
          icon={<ReloadOutlined />}
          title="Refresh current tab data"
          onClick={handleRefreshActiveTab}
          style={{
            height: 34,
            borderRadius: 8,
            fontWeight: 600,
            fontSize: 12.5,
            paddingInline: 10,
            flexShrink: 0,
          }}
        >
          {!isMobile && 'Refresh'}
        </Button>
      </div>
    ),
    [
      activeTab, can, standbyTools.length, primaryAdd, isMobile, token.colorPrimary, exporting,
      handleHeaderExportCSV, handleHeaderExportPDF, handleHeaderPrint, handleRefreshActiveTab,
    ],
  );

  useEffect(() => {
    const { setHeaderMeta } = useHeaderActions.getState();
    setHeaderMeta(
      <Space align="center" size={8}>
        <ToolOutlined style={{ color: 'var(--theme-accent, #10b981)' }} />
        <span>Machine Tools & Components</span>
        <span
          className="item-model-badge"
          style={{
            background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.15) 0%, rgba(59, 130, 246, 0.15) 100%)',
            border: '1px solid rgba(16, 185, 129, 0.3)',
            color: '#10b981',
            borderRadius: 6,
            padding: '2px 8px',
            fontSize: 11.5,
            fontWeight: 700,
          }}
        >
          Enterprise 2027
        </span>
      </Space>,
      `Tool life tracking, changeovers & monthly consumption · ${componentsTotal} components`,
      <ToolOutlined />,
      headerActionButtons,
      MASTER_MACHINE_TOOLS_TAB_ID,
    );
  }, [componentsTotal, headerActionButtons]);

  useEffect(() => {
    return () => {
      useHeaderActions.getState().clearHeaderMeta(MASTER_MACHINE_TOOLS_TAB_ID);
    };
  }, []);

  return (
    <TabKeepAlive
      tabId={MASTER_MACHINE_TOOLS_TAB_ID}
      load={async () => {
        if (activeTab === 'setup') await fetchComponentsRef.current(compPage);
      }}
      serialize={() => ({ components, componentsTotal, compPage, compPageSize, compSearch, activeTab, lookups: { machines, items, uoms, divisions, sections, departments, masterItemTypes } })}
    >
      <div
        className="pwi-tooling-executive-page"
        style={{
          ['--pwi-accent-primary' as any]: token.colorPrimary,
          ['--theme-table-header-color' as any]: '#FFFFFF',
          ['--ui-table-header-text' as any]: '#FFFFFF',
          ['--theme-table-header-border' as any]: 'rgba(255, 255, 255, 0.14)',
          ['--ui-table-header-rule' as any]: 'rgba(255, 255, 255, 0.14)',
          ['--theme-table-row-odd' as any]: token.colorBgContainer,
          ['--theme-table-row-even' as any]: token.colorBgContainer,
          ['--theme-table-row-hover' as any]: token.colorFillTertiary,
        }}
      >
      <PageHeader
        icon={<ToolOutlined />}
        title={
          <Space align="center" size={10}>
            <span>Machine Tools & Components</span>
            <span
              className="item-model-badge"
              style={{
                background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.15) 0%, rgba(59, 130, 246, 0.15) 100%)',
                border: '1px solid rgba(16, 185, 129, 0.3)',
                color: '#10b981',
                borderRadius: 6,
                padding: '2px 8px',
                fontSize: 12,
                fontWeight: 700,
              }}
            >
              Enterprise 2027
            </span>
          </Space>
        }
        subtitle={`Tool life tracking, changeovers & monthly consumption · ${componentsTotal} components`}
        extra={headerActionButtons}
        showBreadcrumbs
      />

      <div
        style={{
          border: '1px solid var(--theme-border, rgba(148, 163, 184, 0.2))',
          background: 'var(--theme-card-bg, rgba(255, 255, 255, 0.02))',
          borderRadius: 6,
          overflow: 'hidden',
          width: '100%',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'stretch',
            width: '100%',
            overflowX: 'auto',
            padding: '8px 10px 10px 10px',
            scrollbarWidth: 'thin',
            background: token.colorFillAlter,
            borderBottom: `1px solid ${token.colorBorderSecondary}`,
          }}
        >
          {[
            { key: 'setup', label: 'Tool & Component Setup', icon: <ToolOutlined />, color: '#334155', activeBg: '#1e293b', count: componentsTotal },
            { key: 'changes', label: 'Change History', icon: <HistoryOutlined />, color: '#16a34a', activeBg: '#15803d', count: changesTotal },
            ...(can('manufacturing.component_change.view') ? [{ key: 'active', label: 'Active Tools', icon: <CheckCircleOutlined />, color: '#0284c7', activeBg: '#0369a1', count: activeToolsTotal }] : []),
            ...(can('manufacturing.component_change.view') ? [{ key: 'life', label: 'Tool Life History', icon: <HistoryOutlined />, color: '#d97706', activeBg: '#b45309', count: lifeTotal }] : []),
            { key: 'report', label: 'Monthly Consumption', icon: <BarChartOutlined />, color: '#7c3aed', activeBg: '#6d28d9', count: null },
            { key: 'liveCosting', label: 'Live Machine Costing', icon: <DollarOutlined />, color: '#0d9488', activeBg: '#0f766e', count: null },
          ].map((tab, idx, arr) => {
            const isSelected = activeTab === tab.key;
            const isFirst = idx === 0;
            const isLast = idx === arr.length - 1;

            const clipPath = isFirst
              ? 'polygon(0 0, calc(100% - 14px) 0, 100% 50%, calc(100% - 14px) 100%, 0 100%)'
              : isLast
              ? 'polygon(0 0, 100% 0, 100% 100%, 0 100%, 14px 50%)'
              : 'polygon(0 0, calc(100% - 14px) 0, 100% 50%, calc(100% - 14px) 100%, 0 100%, 14px 50%)';

            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                style={{
                  position: 'relative',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 9,
                  padding: isFirst
                    ? '12px 26px 12px 20px'
                    : isLast
                    ? '12px 22px 12px 28px'
                    : '12px 24px 12px 28px',
                  marginLeft: isFirst ? 0 : -6,
                  zIndex: isSelected ? 12 : arr.length - idx,
                  fontSize: 13.5,
                  fontWeight: 700,
                  letterSpacing: '0.3px',
                  whiteSpace: 'nowrap',
                  border: 'none',
                  outline: 'none',
                  cursor: 'pointer',
                  clipPath,
                  transition: 'all 0.18s cubic-bezier(0.4, 0, 0.2, 1)',
                  background: isSelected
                    ? `linear-gradient(135deg, ${tab.activeBg} 0%, ${tab.color} 100%)`
                    : token.colorBgContainer,
                  color: isSelected ? '#ffffff' : token.colorText,
                  boxShadow: isSelected
                    ? `0 4px 14px ${tab.color}55, inset 0 0 0 1.5px rgba(255,255,255,0.3)`
                    : `inset 0 0 0 1px ${token.colorBorderSecondary}`,
                  transform: isSelected ? 'scale(1.02)' : 'scale(1)',
                }}
              >
                <span style={{ fontSize: 15, display: 'flex', alignItems: 'center' }}>{tab.icon}</span>
                <span>{tab.label}</span>
                {tab.count !== null && (
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      minWidth: 24,
                      height: 22,
                      padding: '0 7px',
                      borderRadius: 11,
                      fontSize: 11.5,
                      fontWeight: 800,
                      background: isSelected ? 'rgba(255, 255, 255, 0.26)' : token.colorFillSecondary,
                      color: isSelected ? '#ffffff' : token.colorTextSecondary,
                      boxShadow: isSelected ? '0 1px 3px rgba(0,0,0,0.2)' : 'none',
                    }}
                  >
                    {tab.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {activeTab === 'setup' && (
          componentsLoading && components.length === 0 ? (
            <GlobalLoading
              title="Loading Tool Registry..."
              subtitle="Fetching tool lists, dies, and lifespans..."
              badgeText="LIVE DATABASE QUERY"
              minHeight={450}
            />
          ) : (
            <div style={{ width: '100%' }}>
              <div style={{ padding: '8px 10px', borderBottom: '1px solid var(--theme-border, rgba(148, 163, 184, 0.12))' }}>
                <TableToolbar
                showExportButtons={false}
                searchPlaceholder="Search component name, code, machine..."
                searchValue={compSearch}
                onSearchChange={(v) => { setCompSearch(v); setCompPage(1); }}
                filters={[
                  {
                    key: 'machine',
                    placeholder: 'Machine',
                    value: fCompMachine,
                    options: machineOptions,
                    onChange: (v) => { setFCompMachine(v); setCompPage(1); },
                    width: 180,
                  },
                  {
                    key: 'type',
                    placeholder: 'Type',
                    value: fCompType,
                    options: COMPONENT_TYPE_OPTIONS,
                    onChange: (v) => { setFCompType(v); setCompPage(1); },
                  },
                ]}
                actions={
                  <Dropdown
                    trigger={['click']}
                    placement="bottomRight"
                    menu={{
                      items: [
                        {
                          key: 'col_header',
                          label: (
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', minWidth: 160 }}>
                              <span style={{ fontWeight: 700, fontSize: 12 }}>Visible Columns</span>
                              <Button
                                type="link"
                                size="small"
                                style={{ fontSize: 11, padding: 0, height: 'auto' }}
                                onClick={() => {
                                  const reset = { ...DEFAULT_TOOLING_COMP_COLUMNS };
                                  setCompVisibleCols(reset);
                                  localStorage.setItem('erp_tooling_comp_cols', JSON.stringify(reset));
                                }}
                              >
                                Reset
                              </Button>
                            </div>
                          ),
                        },
                        { type: 'divider' },
                        ...Object.entries(TOOLING_COMP_COLUMN_LABELS).map(([colKey, label]) => ({
                          key: colKey,
                          label: (
                            <Checkbox
                              checked={compVisibleCols[colKey] !== false}
                              disabled={colKey === 'component'}
                              onChange={(e) => {
                                const updated = { ...compVisibleCols, [colKey]: e.target.checked };
                                setCompVisibleCols(updated);
                                localStorage.setItem('erp_tooling_comp_cols', JSON.stringify(updated));
                              }}
                            >
                              {label}
                            </Checkbox>
                          ),
                        })),
                      ],
                    }}
                  >
                    <Button icon={<AppstoreOutlined />} style={{ borderRadius: 6, fontWeight: 600 }}>
                      Columns ⊞
                    </Button>
                  </Dropdown>
                }
              />
            </div>
            <div style={{ width: '100%', overflowX: 'auto' }}>
              <ERPTable
                columns={visibleComponentColumns}
                dataSource={components}
                rowKey="id"
                loading={false}
                scroll={{ x: 'max-content' }}
                containerStyle={{ border: 'none', borderRadius: 0, boxShadow: 'none' }}
                emptyTitle="No components found"
                emptyDescription="Add a tool, die, mould or component to start tracking its life."
                emptyActionLabel={can('manufacturing.tool_component.create') ? 'Add Tool / Component' : undefined}
                onEmptyAction={can('manufacturing.tool_component.create') ? handleCreateComponent : undefined}
                pagination={{
                  current: compPage,
                  total: componentsTotal,
                  pageSize: compPageSize,
                  onChange: (p, ps) => { setCompPage(ps !== compPageSize ? 1 : p); setCompPageSize(ps); },
                }}
              />
            </div>
          </div>
        ))}

        {activeTab === 'changes' && (
          <>
            <div style={{ padding: '8px 10px', borderBottom: '1px solid var(--theme-border, rgba(148, 163, 184, 0.12))' }}>
              <TableToolbar
                showExportButtons={false}
                searchPlaceholder="Search change, tool code, machine..."
                searchValue={chgSearch}
                onSearchChange={(v) => { setChgSearch(v); setChgPage(1); }}
                filters={[
                  {
                    key: 'machine',
                    placeholder: 'Machine',
                    value: fChgMachine,
                    options: machineOptions,
                    onChange: (v) => { setFChgMachine(v); setChgPage(1); },
                    width: 180,
                  },
                  {
                    key: 'component',
                    placeholder: 'Component',
                    value: fChgComponent,
                    options: components.map((c) => ({ value: c.id, label: `${c.componentCode} — ${c.componentName}` })),
                    onChange: (v) => { setFChgComponent(v); setChgPage(1); },
                    width: 180,
                  },
                  {
                    key: 'condition',
                    placeholder: 'Condition',
                    value: fChgCondition,
                    options: CONDITION_STATUSES.map((s) => ({ value: s, label: s })),
                    onChange: (v) => { setFChgCondition(v); setChgPage(1); },
                  },
                ]}
                actions={
                  <>
                    <DatePicker
                      placeholder="From"
                      allowClear
                      value={fChgFrom ? dayjs(fChgFrom) : undefined}
                      onChange={(d) => { setFChgFrom(d ? d.format('YYYY-MM-DD') : undefined); setChgPage(1); }}
                      style={{ width: 130 }}
                    />
                    <DatePicker
                      placeholder="To"
                      allowClear
                      value={fChgTo ? dayjs(fChgTo) : undefined}
                      onChange={(d) => { setFChgTo(d ? d.format('YYYY-MM-DD') : undefined); setChgPage(1); }}
                      style={{ width: 130 }}
                    />
                    <Dropdown
                      trigger={['click']}
                      placement="bottomRight"
                      menu={{
                        items: [
                          {
                            key: 'col_header',
                            label: (
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', minWidth: 160 }}>
                                <span style={{ fontWeight: 700, fontSize: 12 }}>Visible Columns</span>
                                <Button
                                  type="link"
                                  size="small"
                                  style={{ fontSize: 11, padding: 0, height: 'auto' }}
                                  onClick={() => {
                                    const reset = { ...DEFAULT_TOOLING_CHG_COLUMNS };
                                    setChgVisibleCols(reset);
                                    localStorage.setItem('erp_tooling_chg_cols', JSON.stringify(reset));
                                  }}
                                >
                                  Reset
                                </Button>
                              </div>
                            ),
                          },
                          { type: 'divider' },
                          ...Object.entries(TOOLING_CHG_COLUMN_LABELS).map(([colKey, label]) => ({
                            key: colKey,
                            label: (
                              <Checkbox
                                checked={chgVisibleCols[colKey] !== false}
                                disabled={colKey === 'date' || colKey === 'toolChange'}
                                onChange={(e) => {
                                  const updated = { ...chgVisibleCols, [colKey]: e.target.checked };
                                  setChgVisibleCols(updated);
                                  localStorage.setItem('erp_tooling_chg_cols', JSON.stringify(updated));
                                }}
                              >
                                {label}
                              </Checkbox>
                            ),
                          })),
                        ],
                      }}
                    >
                      <Button icon={<AppstoreOutlined />} style={{ borderRadius: 6, fontWeight: 600 }}>
                        Columns ⊞
                      </Button>
                    </Dropdown>
                    <Button
                      type="link" danger
                      disabled={chgFilterCount === 0}
                      onClick={() => {
                        setFChgMachine(undefined); setFChgComponent(undefined);
                        setFChgCondition(undefined); setFChgFrom(undefined); setFChgTo(undefined);
                        setChgPage(1);
                      }}
                    >
                      Clear
                    </Button>
                  </>
                }
              />
            </div>
            <div style={{ width: '100%', overflowX: 'auto' }}>
              <ERPTable
                columns={visibleChangeColumns}
                dataSource={changes}
                rowKey="id"
                loading={false}
                scroll={{ x: 'max-content' }}
                containerStyle={{ border: 'none', borderRadius: 0, boxShadow: 'none' }}
                emptyTitle="No changes recorded"
                emptyDescription="Record a tool / component change to build the life history."
                emptyActionLabel={can('manufacturing.component_change.create') ? 'Record Change' : undefined}
                onEmptyAction={can('manufacturing.component_change.create') ? () => openRecordChange(null) : undefined}
                pagination={{
                  current: chgPage,
                  total: changesTotal,
                  pageSize: chgPageSize,
                  onChange: (p, ps) => { setChgPage(ps !== chgPageSize ? 1 : p); setChgPageSize(ps); },
                }}
              />
            </div>
          </>
        )}

        {activeTab === 'report' && (
          <>
            <div style={{ padding: '8px 10px', borderBottom: '1px solid var(--theme-border, rgba(148, 163, 184, 0.12))' }}>
              <TableToolbar
                showExportButtons={false}
                left={
                  <Space size={8} wrap>
                    <DatePicker picker="month" value={reportMonth} onChange={(d) => d && setReportMonth(d)} allowClear={false} />
                    <Select
                      placeholder="All Divisions"
                      allowClear
                      showSearch
                      optionFilterProp="label"
                      value={fReportDivision}
                      onChange={(divId) => {
                        setFReportDivision(divId);
                        if (divId && fReportMachine) {
                          const mach = machines.find((m) => m.id === fReportMachine);
                          if (mach && mach.divisionId !== divId) {
                            setFReportMachine(undefined);
                          }
                        }
                      }}
                      style={{ width: 200 }}
                      options={reportDivisionOptions}
                    />
                    <Select
                      placeholder="All machines"
                      allowClear
                      showSearch
                      optionFilterProp="label"
                      value={fReportMachine}
                      onChange={(v) => setFReportMachine(v)}
                      style={{ width: 220 }}
                      options={reportMachineOptions}
                    />
                    {(fReportDivision || fReportMachine) && (
                      <Button
                        type="link"
                        danger
                        onClick={() => {
                          setFReportDivision(undefined);
                          setFReportMachine(undefined);
                        }}
                      >
                        Clear
                      </Button>
                    )}
                  </Space>
                }
                actions={
                  reportMachines.length > 0 ? (
                    <Button
                      size="small"
                      style={{ borderRadius: 6, fontWeight: 600 }}
                      onClick={() => {
                        if (expandedMachineKeys.length >= reportMachines.length) {
                          setExpandedMachineKeys([]);
                        } else {
                          setExpandedMachineKeys(reportMachines.map((m) => m.machine?.id ?? 'unknown'));
                        }
                      }}
                    >
                      {expandedMachineKeys.length >= reportMachines.length ? 'Collapse All' : 'Expand All Breakdown'}
                    </Button>
                  ) : null
                }
              />
            </div>
            <div
              style={{
                padding: '14px 16px 6px',
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(175px, 1fr))',
                gap: 12,
              }}
            >
              {[
                { label: 'Month', value: reportMonth.format('MMMM YYYY'), accent: '#7c3aed', bgTint: 'rgba(124, 58, 237, 0.12)', icon: <BarChartOutlined /> },
                { label: 'Machines', value: report?.totals.machines ?? 0, accent: '#3b82f6', bgTint: 'rgba(59, 130, 246, 0.12)', icon: <DesktopOutlined /> },
                { label: 'Tools Installed', value: fmtNum(report?.totals.qtyUsed ?? 0), accent: '#0284c7', bgTint: 'rgba(2, 132, 199, 0.12)', icon: <ToolOutlined /> },
                { label: 'Production Covered', value: `${fmtNum(report?.totals.productionCovered ?? 0)} ${PRODUCTION_UOM}`, accent: '#10b981', bgTint: 'rgba(16, 185, 129, 0.12)', icon: <RiseOutlined /> },
                { label: 'Total Tooling Cost', value: fmtPkr(report?.totals.totalCost ?? 0), accent: '#d97706', bgTint: 'rgba(217, 119, 6, 0.12)', icon: <DollarOutlined /> },
                {
                  label: 'Avg Cost / Gross (144 PCS)',
                  value: report?.totals.avgCostPerGross != null ? `${fmtPkr(report.totals.avgCostPerGross, 2)} / Gross` : '—',
                  accent: '#dc2626',
                  bgTint: 'rgba(220, 38, 38, 0.12)',
                  icon: <ThunderboltOutlined />,
                },
              ].map((kpi) => (
                <div
                  key={kpi.label}
                  className="pwi-kpi-card"
                  style={{
                    ['--kpi-accent' as any]: kpi.accent,
                    background: token.colorBgContainer,
                    border: `1px solid ${token.colorBorderSecondary}`,
                    borderTop: `3px solid ${kpi.accent}`,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: token.colorTextSecondary }}>
                      {kpi.label}
                    </span>
                    <span
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: 9,
                        background: kpi.bgTint,
                        color: kpi.accent,
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 15,
                        flexShrink: 0,
                      }}
                    >
                      {kpi.icon}
                    </span>
                  </div>
                  <div style={{ fontSize: 21, fontWeight: 800, color: token.colorText, lineHeight: 1.2, fontVariantNumeric: 'tabular-nums' }}>
                    {kpi.value}
                  </div>
                </div>
              ))}
            </div>
            <div
              style={{
                margin: '10px 16px 12px',
                padding: '10px 14px',
                borderRadius: 8,
                background: token.colorFillAlter,
                border: `1px solid ${token.colorBorderSecondary}`,
                borderLeft: '3px solid #7c3aed',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                fontSize: 13,
                color: token.colorTextSecondary,
              }}
            >
              <InfoCircleOutlined style={{ color: '#7c3aed', fontSize: 15, flexShrink: 0 }} />
              <div>
                <strong style={{ color: token.colorText }}>Machine Cost per Gross (144 PCS)</strong> —{' '}
                <span>Click any machine row to expand its punch & die breakdown and edit missing tool unit rates inline. Cost / Gross = (Total Tooling Cost / Production Covered PCS) × 144.</span>
              </div>
            </div>
            <div style={{ width: '100%', overflowX: 'auto' }}>
              <ERPTable
                columns={reportMachineColumns}
                dataSource={reportMachines}
                rowKey={(m) => m.machine?.id ?? 'unknown'}
                loading={reportLoading}
                scroll={{ x: 'max-content' }}
                containerStyle={{ border: 'none', borderRadius: 0, boxShadow: 'none' }}
                pagination={false}
                expandable={{
                  columnWidth: 46,
                  expandedRowKeys: expandedMachineKeys,
                  onExpandedRowsChange: (keys) => setExpandedMachineKeys([...keys]),
                  expandRowByClick: true,
                  rowExpandable: (m) => Array.isArray(m.components) && m.components.length > 0,
                  expandIcon: ({ expanded, onExpand, record }) =>
                    Array.isArray(record.components) && record.components.length > 0 ? (
                      <Tooltip title={expanded ? 'Collapse tool breakdown' : 'Expand tool breakdown'}>
                        <button
                          type="button"
                          className={`pwi-expand-pill ${expanded ? 'pwi-expand-pill--active' : ''}`}
                          aria-label={
                            expanded
                              ? `Collapse ${record.machine?.machineCode || 'machine'} tool breakdown`
                              : `Expand ${record.machine?.machineCode || 'machine'} tool breakdown`
                          }
                          onClick={(e) => {
                            e.stopPropagation();
                            onExpand(record, e);
                          }}
                          style={{
                            width: 26,
                            height: 26,
                            minWidth: 26,
                            padding: 0,
                            borderRadius: 6,
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: 'pointer',
                            color: expanded ? '#FFFFFF' : '#EA580C',
                            background: expanded ? '#EA580C' : '#FFF7ED',
                            border: `1px solid ${expanded ? '#EA580C' : '#FDBA74'}`,
                            fontSize: 13.5,
                            lineHeight: 1,
                            transition: 'transform 0.14s ease, box-shadow 0.14s ease, background-color 0.14s ease, color 0.14s ease',
                          }}
                        >
                          {expanded ? <ShrinkOutlined /> : <ArrowsAltOutlined />}
                        </button>
                      </Tooltip>
                    ) : null,
                  expandedRowRender: (m) => (
                    <div
                      style={{
                        padding: '8px 10px',
                        background: token.colorFillAlter,
                        borderRadius: 8,
                        border: `1px solid ${token.colorBorderSecondary}`,
                      }}
                    >
                      <ERPTable
                        columns={reportDetailColumns}
                        dataSource={m.components ?? []}
                        rowKey={(r) => `${r.machine?.id ?? '?'}-${r.component?.id ?? '?'}`}
                        size="small"
                        pagination={false}
                        scroll={{ x: 'max-content' }}
                        containerStyle={{ border: `1px solid ${token.colorBorderSecondary}`, borderRadius: 6, boxShadow: 'none' }}
                      />
                    </div>
                  ),
                }}
                emptyTitle="No consumption for this month"
                emptyDescription="Record component changes in the selected month to see the consumption report."
              />
            </div>
          </>
        )}

        {activeTab === 'liveCosting' && (
          <>
            <div style={{ padding: '8px 10px', borderBottom: '1px solid var(--theme-border, rgba(148, 163, 184, 0.12))' }}>
              <TableToolbar
                showExportButtons={false}
                left={
                  <Space size={8} wrap>
                    <Select
                      placeholder="All Divisions"
                      allowClear
                      showSearch
                      optionFilterProp="label"
                      value={fLiveCostDivision}
                      onChange={(divId) => {
                        setFLiveCostDivision(divId);
                        if (divId && fLiveCostMachine) {
                          const mach = machines.find((m) => m.id === fLiveCostMachine);
                          if (mach && mach.divisionId !== divId) {
                            setFLiveCostMachine(undefined);
                          }
                        }
                      }}
                      style={{ width: 200 }}
                      options={reportDivisionOptions}
                    />
                    <Select
                      placeholder="All Machines"
                      allowClear
                      showSearch
                      optionFilterProp="label"
                      value={fLiveCostMachine}
                      onChange={(v) => setFLiveCostMachine(v)}
                      style={{ width: 220 }}
                      options={liveCostMachineOptions}
                    />
                    {(fLiveCostDivision || fLiveCostMachine) && (
                      <Button
                        type="link"
                        danger
                        onClick={() => {
                          setFLiveCostDivision(undefined);
                          setFLiveCostMachine(undefined);
                        }}
                      >
                        Clear
                      </Button>
                    )}
                  </Space>
                }
                actions={
                  liveCostMachines.length > 0 ? (
                    <Button
                      size="small"
                      style={{ borderRadius: 6, fontWeight: 600 }}
                      onClick={() => {
                        if (expandedLiveCostKeys.length >= liveCostMachines.length) {
                          setExpandedLiveCostKeys([]);
                        } else {
                          setExpandedLiveCostKeys(liveCostMachines.map((m) => m.machine?.id ?? 'unknown'));
                        }
                      }}
                    >
                      {expandedLiveCostKeys.length >= liveCostMachines.length ? 'Collapse All' : 'Expand All Breakdown'}
                    </Button>
                  ) : null
                }
              />
            </div>
            <div
              style={{
                padding: '14px 16px 6px',
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(175px, 1fr))',
                gap: 12,
              }}
            >
              {[
                { label: 'Active Machines', value: liveCosting?.totals.machines ?? 0, accent: '#0d9488', bgTint: 'rgba(13, 148, 136, 0.12)', icon: <DesktopOutlined /> },
                { label: 'Active Tools Mounted', value: fmtNum(liveCosting?.totals.activeTools ?? 0), accent: '#0284c7', bgTint: 'rgba(2, 132, 199, 0.12)', icon: <ToolOutlined /> },
                { label: `Combined Production (${PRODUCTION_UOM})`, value: `${fmtNum(liveCosting?.totals.productionCovered ?? 0)} ${PRODUCTION_UOM}`, accent: '#10b981', bgTint: 'rgba(16, 185, 129, 0.12)', icon: <RiseOutlined /> },
                { label: 'Active Setup Cost (PKR)', value: fmtPkr(liveCosting?.totals.totalCost ?? 0), accent: '#d97706', bgTint: 'rgba(217, 119, 6, 0.12)', icon: <DollarOutlined /> },
                {
                  label: 'Avg Combined Cost / Gross (144 PCS)',
                  value: liveCosting?.totals.avgCombinedCostPerGross != null ? `${fmtPkr(liveCosting.totals.avgCombinedCostPerGross, 2)} / Gross` : '—',
                  accent: '#dc2626',
                  bgTint: 'rgba(220, 38, 38, 0.12)',
                  icon: <ThunderboltOutlined />,
                },
              ].map((kpi) => (
                <div
                  key={kpi.label}
                  className="pwi-kpi-card"
                  style={{
                    ['--kpi-accent' as any]: kpi.accent,
                    background: token.colorBgContainer,
                    border: `1px solid ${token.colorBorderSecondary}`,
                    borderTop: `3px solid ${kpi.accent}`,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: token.colorTextSecondary }}>
                      {kpi.label}
                    </span>
                    <span
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: 9,
                        background: kpi.bgTint,
                        color: kpi.accent,
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 15,
                        flexShrink: 0,
                      }}
                    >
                      {kpi.icon}
                    </span>
                  </div>
                  <div style={{ fontSize: 21, fontWeight: 800, color: token.colorText, lineHeight: 1.2, fontVariantNumeric: 'tabular-nums' }}>
                    {kpi.value}
                  </div>
                </div>
              ))}
            </div>
            <div
              style={{
                margin: '10px 16px 12px',
                padding: '10px 14px',
                borderRadius: 8,
                background: token.colorFillAlter,
                border: `1px solid ${token.colorBorderSecondary}`,
                borderLeft: '3px solid #0d9488',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                fontSize: 13,
                color: token.colorTextSecondary,
              }}
            >
              <InfoCircleOutlined style={{ color: '#0d9488', fontSize: 15, flexShrink: 0 }} />
              <div>
                <strong style={{ color: token.colorText }}>Live Machine Cost per Gross (144 PCS)</strong> —{' '}
                <span>Includes all currently ACTIVE punches and dies running on each machine across all install months (including prior-month carryovers). Combined Cost / Gross = sum of each active tool&apos;s Cost / Gross on that machine.</span>
              </div>
            </div>
            <div style={{ width: '100%', overflowX: 'auto' }}>
              <ERPTable
                columns={liveCostMachineColumns}
                dataSource={liveCostMachines}
                rowKey={(m) => m.machine?.id ?? 'unknown'}
                loading={liveCostingLoading}
                scroll={{ x: 'max-content' }}
                containerStyle={{ border: 'none', borderRadius: 0, boxShadow: 'none' }}
                pagination={false}
                expandable={{
                  columnWidth: 46,
                  expandedRowKeys: expandedLiveCostKeys,
                  onExpandedRowsChange: (keys) => setExpandedLiveCostKeys([...keys]),
                  expandRowByClick: true,
                  rowExpandable: (m) => Array.isArray(m.components) && m.components.length > 0,
                  expandIcon: ({ expanded, onExpand, record }) =>
                    Array.isArray(record.components) && record.components.length > 0 ? (
                      <Tooltip title={expanded ? 'Collapse active tools breakdown' : 'Expand active tools breakdown'}>
                        <button
                          type="button"
                          className={`pwi-expand-pill ${expanded ? 'pwi-expand-pill--active' : ''}`}
                          aria-label={
                            expanded
                              ? `Collapse ${record.machine?.machineCode || 'machine'} active tools breakdown`
                              : `Expand ${record.machine?.machineCode || 'machine'} active tools breakdown`
                          }
                          onClick={(e) => {
                            e.stopPropagation();
                            onExpand(record, e);
                          }}
                          style={{
                            width: 26,
                            height: 26,
                            minWidth: 26,
                            padding: 0,
                            borderRadius: 6,
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: 'pointer',
                            color: expanded ? '#FFFFFF' : '#EA580C',
                            background: expanded ? '#EA580C' : '#FFF7ED',
                            border: `1px solid ${expanded ? '#EA580C' : '#FDBA74'}`,
                            fontSize: 13.5,
                            lineHeight: 1,
                            transition: 'transform 0.14s ease, box-shadow 0.14s ease, background-color 0.14s ease, color 0.14s ease',
                          }}
                        >
                          {expanded ? <ShrinkOutlined /> : <ArrowsAltOutlined />}
                        </button>
                      </Tooltip>
                    ) : null,
                  expandedRowRender: (m) => (
                    <div
                      style={{
                        padding: '8px 10px',
                        background: token.colorFillAlter,
                        borderRadius: 8,
                        border: `1px solid ${token.colorBorderSecondary}`,
                      }}
                    >
                      <ERPTable
                        columns={liveCostDetailColumns}
                        dataSource={m.components ?? []}
                        rowKey={(r) => r.changeId}
                        size="small"
                        pagination={false}
                        scroll={{ x: 'max-content' }}
                        containerStyle={{ border: `1px solid ${token.colorBorderSecondary}`, borderRadius: 6, boxShadow: 'none' }}
                      />
                    </div>
                  ),
                }}
                emptyTitle="No active tooling currently mounted"
                emptyDescription="Install or issue tools to machines to view live combined tooling costs per Gross."
              />
            </div>
          </>
        )}

        {activeTab === 'active' && (
          <>
            <div style={{ padding: '8px 10px', borderBottom: '1px solid var(--theme-border, rgba(148, 163, 184, 0.12))' }}>
              <TableToolbar
                showExportButtons={false}
                searchPlaceholder="Search active tool, component, machine..."
                searchValue={atSearch}
                onSearchChange={(v) => { setAtSearch(v); setAtPage(1); }}
                filters={[
                  {
                    key: 'machine',
                    placeholder: 'Machine',
                    value: fAtMachine,
                    options: machineOptions,
                    onChange: (v) => { setFAtMachine(v); setAtPage(1); },
                    width: 180,
                  },
                ]}
              />
            </div>
            <div
              style={{
                padding: '14px 16px 6px',
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(175px, 1fr))',
                gap: 12,
              }}
            >
              {[
                { label: 'Active Tools', value: activeToolsTotal, accent: '#0284c7', bgTint: 'rgba(2, 132, 199, 0.12)', icon: <ToolOutlined />, color: token.colorText },
                { label: 'Active Machines', value: new Set(activeTools.map((a) => a.machineId)).size, accent: '#10b981', bgTint: 'rgba(16, 185, 129, 0.12)', icon: <DesktopOutlined />, color: token.colorText },
                { label: 'Standby (Reusable)', value: standbyTools.length, accent: '#d97706', bgTint: 'rgba(217, 119, 6, 0.12)', icon: <PauseCircleOutlined />, color: '#d97706' },
              ].map((kpi) => (
                <div
                  key={kpi.label}
                  className="pwi-kpi-card"
                  style={{
                    ['--kpi-accent' as any]: kpi.accent,
                    background: token.colorBgContainer,
                    border: `1px solid ${token.colorBorderSecondary}`,
                    borderTop: `3px solid ${kpi.accent}`,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: token.colorTextSecondary }}>
                      {kpi.label}
                    </span>
                    <span
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: 9,
                        background: kpi.bgTint,
                        color: kpi.accent,
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 15,
                        flexShrink: 0,
                      }}
                    >
                      {kpi.icon}
                    </span>
                  </div>
                  <div style={{ fontSize: 25, fontWeight: 800, color: kpi.color, lineHeight: 1.15, fontVariantNumeric: 'tabular-nums' }}>
                    {kpi.value}
                  </div>
                </div>
              ))}
            </div>
            <div
              style={{
                margin: '10px 16px 12px',
                padding: '10px 14px',
                borderRadius: 8,
                background: token.colorFillAlter,
                border: `1px solid ${token.colorBorderSecondary}`,
                borderLeft: '3px solid #0284c7',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                fontSize: 13,
                color: token.colorTextSecondary,
              }}
            >
              <InfoCircleOutlined style={{ color: '#0284c7', fontSize: 15, flexShrink: 0 }} />
              <div>
                <strong style={{ color: token.colorText }}>Automatic Production Life</strong> —{' '}
                <span>Live production counter accumulated from Daily Production Entries between tool mount and unmount/close dates.</span>
              </div>
            </div>
            <div style={{ width: '100%', overflowX: 'auto' }}>
              <ERPTable
                columns={activeToolColumns}
                dataSource={activeTools}
                rowKey="id"
                loading={false}
                scroll={{ x: 'max-content' }}
                containerStyle={{ border: 'none', borderRadius: 0, boxShadow: 'none' }}
                emptyTitle="No active tools"
                emptyDescription="Install a tool on a machine to start its lifecycle tracking, or use Record Change in Change History for snapshot-style changes."
                emptyActionLabel={can('manufacturing.component_change.create') ? 'Install Tool' : undefined}
                onEmptyAction={can('manufacturing.component_change.create') ? openInstall : undefined}
                pagination={{
                  current: atPage,
                  total: activeToolsTotal,
                  pageSize: atPageSize,
                  onChange: (p, ps) => { setAtPage(ps !== atPageSize ? 1 : p); setAtPageSize(ps); },
                }}
              />
            </div>
          </>
        )}

        {activeTab === 'life' && (
          <>
            <div style={{ padding: '8px 10px', borderBottom: '1px solid var(--theme-border, rgba(148, 163, 184, 0.12))' }}>
              <TableToolbar
                showExportButtons={false}
                searchPlaceholder="Search tool, component, machine, disposition..."
                searchValue={lifeSearch}
                onSearchChange={(v) => { setLifeSearch(v); setLifePage(1); }}
                filters={[
                  {
                    key: 'machine',
                    placeholder: 'Machine',
                    value: fLifeMachine,
                    options: machineOptions,
                    onChange: (v) => { setFLifeMachine(v); setLifePage(1); },
                    width: 180,
                  },
                  {
                    key: 'component',
                    placeholder: 'Component',
                    value: fLifeComponent,
                    options: lifeComponentOptions,
                    onChange: (v) => { setFLifeComponent(v); setLifePage(1); },
                    width: 180,
                  },
                  {
                    key: 'disposition',
                    placeholder: 'Disposition',
                    value: fLifeDisposition,
                    options: DISPOSITION_TYPES.map((d) => ({ value: d, label: DISPOSITION_LABELS[d] ?? d })),
                    onChange: (v) => { setFLifeDisposition(v); setLifePage(1); },
                    width: 170,
                  },
                  {
                    key: 'status',
                    placeholder: 'Status',
                    value: fLifeStatus,
                    options: [
                      { value: 'ACTIVE', label: 'ACTIVE' },
                      { value: 'STANDBY', label: 'STANDBY (REUSABLE)' },
                      { value: 'CLOSED', label: 'CLOSED' },
                    ],
                    onChange: (v) => { setFLifeStatus(v); setLifePage(1); },
                    width: 170,
                  },
                ]}
                actions={
                  <>
                    <DatePicker
                      placeholder="From"
                      allowClear
                      value={fLifeFrom ? dayjs(fLifeFrom) : undefined}
                      onChange={(d) => { setFLifeFrom(d ? d.format('YYYY-MM-DD') : undefined); setLifePage(1); }}
                      style={{ width: 130 }}
                    />
                    <DatePicker
                      placeholder="To"
                      allowClear
                      value={fLifeTo ? dayjs(fLifeTo) : undefined}
                      onChange={(d) => { setFLifeTo(d ? d.format('YYYY-MM-DD') : undefined); setLifePage(1); }}
                      style={{ width: 130 }}
                    />
                    <Button
                      type="link" danger
                      disabled={lifeFilterCount === 0}
                      onClick={() => {
                        setFLifeMachine(undefined); setFLifeComponent(undefined);
                        setFLifeDisposition(undefined); setFLifeStatus(undefined);
                        setFLifeFrom(undefined); setFLifeTo(undefined);
                        setLifePage(1);
                      }}
                    >
                      Clear
                    </Button>
                  </>
                }
              />
            </div>
            {/* 7 Interactive Executive KPI Summary Cards */}
            <div
              style={{
                padding: '14px 16px 6px',
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
                gap: 12,
              }}
            >
              {[
                {
                  label: 'Total Runs',
                  value: lifeSummary?.installs ?? 0,
                  accent: '#3b82f6',
                  bgTint: 'rgba(59, 130, 246, 0.12)',
                  icon: <ToolOutlined />,
                  color: token.colorText,
                  filterStatus: undefined as string | undefined,
                  clickable: true,
                  isSelected: fLifeStatus === undefined,
                },
                {
                  label: 'Active',
                  value: lifeSummary?.active ?? 0,
                  accent: '#10b981',
                  bgTint: 'rgba(16, 185, 129, 0.12)',
                  icon: <CheckCircleOutlined />,
                  color: '#059669',
                  filterStatus: 'ACTIVE',
                  clickable: true,
                  isSelected: fLifeStatus === 'ACTIVE',
                },
                {
                  label: 'Standby (Reusable)',
                  value: lifeSummary?.standby ?? standbyTools.length,
                  accent: '#d97706',
                  bgTint: 'rgba(217, 119, 6, 0.12)',
                  icon: <PauseCircleOutlined />,
                  color: '#d97706',
                  filterStatus: 'STANDBY',
                  clickable: true,
                  isSelected: fLifeStatus === 'STANDBY',
                },
                {
                  label: 'Closed',
                  value: lifeSummary?.closed ?? 0,
                  accent: '#64748b',
                  bgTint: 'rgba(100, 116, 139, 0.12)',
                  icon: <HistoryOutlined />,
                  color: token.colorText,
                  filterStatus: 'CLOSED',
                  clickable: true,
                  isSelected: fLifeStatus === 'CLOSED',
                },
                {
                  label: 'With Disposition',
                  value: lifeSummary?.withDisposition ?? 0,
                  accent: '#8b5cf6',
                  bgTint: 'rgba(139, 92, 246, 0.12)',
                  icon: <TagOutlined />,
                  color: token.colorText,
                  clickable: false,
                  isSelected: false,
                },
                {
                  label: 'Total Production Life',
                  value: `${fmtNum(lifeSummary?.totalProductionLife)} ${PRODUCTION_UOM}`,
                  accent: '#0284c7',
                  bgTint: 'rgba(2, 132, 199, 0.12)',
                  icon: <ThunderboltOutlined />,
                  color: token.colorText,
                  clickable: false,
                  isSelected: false,
                },
                {
                  label: 'Avg Life',
                  value: `${fmtNum(lifeSummary?.avgLife)} ${PRODUCTION_UOM}`,
                  accent: '#059669',
                  bgTint: 'rgba(5, 150, 105, 0.12)',
                  icon: <RiseOutlined />,
                  color: token.colorText,
                  clickable: false,
                  isSelected: false,
                },
              ].map((kpi) => {
                const card = (
                  <div
                    key={kpi.label}
                    className={`pwi-kpi-card ${kpi.clickable ? 'pwi-kpi-card--clickable' : ''} ${kpi.isSelected && fLifeStatus ? 'pwi-kpi-card--active' : ''}`}
                    onClick={
                      kpi.clickable
                        ? () => {
                            setFLifeStatus(kpi.filterStatus);
                            setLifePage(1);
                          }
                        : undefined
                    }
                    style={{
                      ['--kpi-accent' as any]: kpi.accent,
                      background: token.colorBgContainer,
                      border: `1px solid ${token.colorBorderSecondary}`,
                      borderTop: `3px solid ${kpi.accent}`,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: token.colorTextSecondary }}>
                        {kpi.label}
                      </span>
                      <span
                        style={{
                          width: 32,
                          height: 32,
                          borderRadius: 9,
                          background: kpi.bgTint,
                          color: kpi.accent,
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: 15,
                          flexShrink: 0,
                        }}
                      >
                        {kpi.icon}
                      </span>
                    </div>
                    <div style={{ fontSize: 25, fontWeight: 800, color: kpi.color, lineHeight: 1.15, fontVariantNumeric: 'tabular-nums' }}>
                      {kpi.value}
                    </div>
                  </div>
                );
                return kpi.clickable ? (
                  <Tooltip key={kpi.label} title={`Click to filter by ${kpi.label}`}>
                    {card}
                  </Tooltip>
                ) : (
                  card
                );
              })}
            </div>

            {/* Segmented Status Filter Pills */}
            <div style={{ padding: '12px 16px 4px', display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
              <Button
                className="pwi-status-pill-btn"
                type={!fLifeStatus ? 'primary' : 'default'}
                onClick={() => { setFLifeStatus(undefined); setLifePage(1); }}
              >
                All Runs ({lifeSummary?.installs ?? lifeTotal})
              </Button>
              <Button
                className="pwi-status-pill-btn"
                type={fLifeStatus === 'ACTIVE' ? 'primary' : 'default'}
                icon={<CheckCircleOutlined />}
                onClick={() => { setFLifeStatus('ACTIVE'); setLifePage(1); }}
              >
                Active ({lifeSummary?.active ?? 0})
              </Button>
              <Button
                className="pwi-status-pill-btn"
                type={fLifeStatus === 'STANDBY' ? 'primary' : 'default'}
                icon={<PauseCircleOutlined />}
                onClick={() => { setFLifeStatus('STANDBY'); setLifePage(1); }}
                style={
                  fLifeStatus === 'STANDBY'
                    ? { background: '#d97706', borderColor: '#d97706' }
                    : { borderColor: '#f59e0b', color: '#d97706' }
                }
              >
                Standby (Reusable) ({lifeSummary?.standby ?? standbyTools.length})
              </Button>
              <Button
                className="pwi-status-pill-btn"
                type={fLifeStatus === 'CLOSED' ? 'primary' : 'default'}
                icon={<HistoryOutlined />}
                onClick={() => { setFLifeStatus('CLOSED'); setLifePage(1); }}
              >
                Closed ({lifeSummary?.closed ?? 0})
              </Button>
            </div>

            {/* Sleek Minimal Callout Bar */}
            <div
              style={{
                margin: '10px 16px 12px',
                padding: '10px 14px',
                borderRadius: 8,
                background: token.colorFillAlter,
                border: `1px solid ${token.colorBorderSecondary}`,
                borderLeft: '3px solid #0284c7',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                fontSize: 13,
                color: token.colorTextSecondary,
              }}
            >
              <InfoCircleOutlined style={{ color: '#0284c7', fontSize: 15, flexShrink: 0 }} />
              <div>
                <strong style={{ color: token.colorText }}>Automatic Production Life</strong> —{' '}
                <span>Live production counter accumulated from Daily Production Entries between tool mount and unmount/close dates.</span>
              </div>
            </div>
            <div style={{ width: '100%', overflowX: 'auto' }}>
              <ERPTable
                columns={lifeColumns}
                dataSource={lifeRows}
                rowKey="id"
                loading={false}
                scroll={{ x: 'max-content' }}
                containerStyle={{ border: 'none', borderRadius: 0, boxShadow: 'none' }}
                emptyTitle="No lifecycle history"
                emptyDescription="Install tools (Active Tools tab) and remove them to build the tool life history report."
                emptyActionLabel={can('manufacturing.component_change.create') ? 'Live Snapshot' : undefined}
                onEmptyAction={can('manufacturing.component_change.create') ? () => { setActiveTab('active'); openInstall(); } : undefined}
                pagination={{
                  current: lifePage,
                  total: lifeTotal,
                  pageSize: lifePageSize,
                  onChange: (p, ps) => { setLifePage(ps !== lifePageSize ? 1 : p); setLifePageSize(ps); },
                }}
              />
            </div>
          </>
        )}
      </div>

      {/* Component create / edit modal */}
      <DraggableResizableModal
        open={compModalOpen}
            onCancel={() => setCompModalOpen(false)}
            onMinimize={() => {
              setCompModalOpen(false);
              setIsCompMinimized(true);
            }}
            width={980}
            height={640}
            minWidth={640}
            minHeight={480}
            footer={[
              <Button key="cancel" onClick={() => setCompModalOpen(false)}>Cancel</Button>,
              <Button key="save" type="primary" loading={saving} onClick={handleSaveComponent}>
                {editingComponent ? 'Save Changes' : 'Create Component'}
              </Button>,
            ]}
            title={
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', paddingRight: 36 }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  <ToolOutlined style={{ color: 'var(--theme-accent, #10b981)' }} />
                  {editingComponent ? `Edit Component — ${editingComponent.componentCode}` : 'Add Tool / Component'}
                </span>
                <Button
                  size="small"
                  icon={showLiveSheet ? <EyeInvisibleOutlined /> : <EyeOutlined />}
                  onClick={() => setShowLiveSheet((v) => !v)}
                  style={{
                    borderRadius: 6,
                    fontSize: 12,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 5,
                    border: '1px solid #cbd5e1',
                    background: showLiveSheet ? '#f1f5f9' : '#ffffff',
                    fontWeight: 600,
                  }}
                >
                  {showLiveSheet ? 'Hide Detail Sheet' : 'Show Detail Sheet'}
                </Button>
              </div>
            }
            subtitle="Track a tool, die, mould or component on a machine with its expected life"
            styles={{ body: { overflow: 'hidden', padding: '16px' } }}
          >
            <div style={{ display: 'flex', gap: 20, height: '100%', alignItems: 'stretch' }}>
              {/* Left Column: Form Inputs */}
              <div
                style={{
                  flex: showLiveSheet ? '1 1 58%' : '1 1 100%',
                  minWidth: 0,
                  overflowY: 'auto',
                  paddingRight: showLiveSheet ? 16 : 0,
                  borderRight: showLiveSheet ? '1px solid var(--theme-border, #e2e8f0)' : 'none',
                  transition: 'all 0.25s ease',
                }}
              >
                <Form
                  form={compForm}
                  layout="vertical"
                  style={{ paddingTop: 4 }}
                  onValuesChange={(_, allValues) => setLiveCompValues(allValues)}
                >
                  <Row gutter={16}>
                    <Col span={24}>
                      <div
                        style={{
                          background: liveCompValues.itemId
                            ? 'linear-gradient(135deg, rgba(16, 185, 129, 0.08) 0%, rgba(59, 130, 246, 0.06) 100%)'
                            : 'linear-gradient(135deg, rgba(239, 68, 68, 0.04) 0%, rgba(248, 250, 252, 0.95) 100%)',
                          padding: '14px',
                          borderRadius: 12,
                          marginBottom: 16,
                          border: liveCompValues.itemId
                            ? '1.5px solid #10b981'
                            : '1.5px solid rgba(239, 68, 68, 0.45)',
                          boxShadow: liveCompValues.itemId
                            ? '0 0 0 1px rgba(16, 185, 129, 0.15)'
                            : '0 0 0 1px rgba(239, 68, 68, 0.08)',
                          transition: 'all 0.25s ease',
                        }}
                      >
                        {/* Header & Quick Filter Chips (100% English) */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, flexWrap: 'wrap', gap: 6 }}>
                          <Space size={6}>
                            <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--theme-text, #0f172a)' }}>
                              Store Item / Product Master
                            </span>
                            <Tag color="success" style={{ fontSize: 11, lineHeight: '18px', padding: '0 6px', margin: 0, display: 'inline-flex', alignItems: 'center' }}>
                              <ThunderboltOutlined style={{ marginRight: 4 }} />Auto-fills Code, Name & UOM
                            </Tag>
                          </Space>
                          <Space size={4}>
                            <Tag.CheckableTag
                              checked={itemFilterType === 'Tooling'}
                              onChange={(checked) => setItemFilterType(checked ? 'Tooling' : undefined)}
                              style={{
                                border: itemFilterType === 'Tooling' ? '1px solid #10b981' : '1px solid rgba(79, 70, 229, 0.3)',
                                borderRadius: 12,
                                fontSize: 11,
                                padding: '2px 10px',
                                cursor: 'pointer',
                              }}
                            >
                              <ToolOutlined style={{ marginRight: 4 }} /> Tooling Only
                            </Tag.CheckableTag>
                            <Tag.CheckableTag
                              checked={!itemFilterType}
                              onChange={() => setItemFilterType(undefined)}
                              style={{
                                border: !itemFilterType ? '1px solid #10b981' : '1px solid rgba(100, 116, 139, 0.3)',
                                borderRadius: 12,
                                fontSize: 11,
                                padding: '2px 10px',
                                cursor: 'pointer',
                              }}
                            >
                              All Types
                            </Tag.CheckableTag>
                            {(itemFilterDivision || itemFilterDepartment || itemFilterSection || (itemFilterType && itemFilterType !== 'Tooling')) && (
                              <Button
                                type="link"
                                size="small"
                                style={{ fontSize: 11, padding: '0 4px', height: 'auto', color: '#ef4444' }}
                                onClick={() => {
                                  setItemFilterDivision(undefined);
                                  setItemFilterDepartment(undefined);
                                  setItemFilterSection(undefined);
                                  setItemFilterType('Tooling');
                                }}
                              >
                                Reset Filters
                              </Button>
                            )}
                          </Space>
                        </div>

                        {/* 4 Filters Grid: 1. Division, 2. Section, 3. Department, 4. Item Type */}
                        <div
                          style={{
                            background: 'rgba(255, 255, 255, 0.85)',
                            padding: '12px',
                            borderRadius: 10,
                            marginBottom: 12,
                            border: '1px solid rgba(226, 232, 240, 0.9)',
                          }}
                        >
                          <Row gutter={[10, 10]}>
                            <Col xs={24} sm={12}>
                              <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600, marginBottom: 4 }}>
                                1. Division
                              </div>
                              <Select
                                size="middle"
                                style={{ width: '100%' }}
                                placeholder="All Divisions"
                                allowClear
                                value={itemFilterDivision}
                                onChange={(val) => {
                                  setItemFilterDivision(val);
                                  setItemFilterSection(undefined);
                                  setItemFilterDepartment(undefined);
                                }}
                                options={divisions.map((d) => ({ value: d.id, label: d.name }))}
                                showSearch
                                optionFilterProp="label"
                              />
                            </Col>
                            <Col xs={24} sm={12}>
                              <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600, marginBottom: 4 }}>
                                2. Section
                              </div>
                              <Select
                                size="middle"
                                style={{ width: '100%' }}
                                placeholder="All Sections"
                                allowClear
                                value={itemFilterSection}
                                onChange={(val) => {
                                  setItemFilterSection(val);
                                  setItemFilterDepartment(undefined);
                                  if (val) {
                                    const sec = sections.find((s) => s.id === val);
                                    if (sec?.divisionId && !itemFilterDivision) {
                                      setItemFilterDivision(sec.divisionId);
                                    }
                                  }
                                }}
                                options={availableSections.map((s) => ({ value: s.id, label: s.name }))}
                                showSearch
                                optionFilterProp="label"
                              />
                            </Col>
                            <Col xs={24} sm={12}>
                              <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600, marginBottom: 4 }}>
                                3. Department
                              </div>
                              <Select
                                size="middle"
                                style={{ width: '100%' }}
                                placeholder="All Departments"
                                allowClear
                                value={itemFilterDepartment}
                                onChange={(val) => {
                                  setItemFilterDepartment(val);
                                  if (val) {
                                    const dept = departments.find((d) => d.id === val);
                                    if (dept?.sectionId && !itemFilterSection) {
                                      setItemFilterSection(dept.sectionId);
                                    }
                                    if (dept?.divisionId && !itemFilterDivision) {
                                      setItemFilterDivision(dept.divisionId);
                                    }
                                    // Do NOT filter or clear Machine(s) by Store Department (e.g. SPI General Store);
                                    // production machines live across departments within the selected Division.
                                  }
                                }}
                                options={availableDepartments.map((d) => ({ value: d.id, label: d.name }))}
                                showSearch
                                optionFilterProp="label"
                              />
                            </Col>
                            <Col xs={24} sm={12}>
                              <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600, marginBottom: 4 }}>
                                4. Item Type
                              </div>
                              <Select
                                size="middle"
                                style={{ width: '100%' }}
                                placeholder="All Types"
                                allowClear
                                value={itemFilterType}
                                onChange={(val) => setItemFilterType(val)}
                                options={itemTypeOptions}
                                showSearch
                                optionFilterProp="label"
                              />
                            </Col>
                          </Row>
                        </div>

                        {/* Store Item Select with Search & Autocomplete */}
                        <Form.Item
                          name="itemId"
                          style={{ marginBottom: 0 }}
                          tooltip="Select an item from Store / Item Master to automatically populate tooling code, name, and production unit"
                        >
                          <Select
                            showSearch
                            allowClear
                            size="large"
                            loading={modalItemsLoading}
                            placeholder="🔍 Search item code or tool name (e.g. SP-216021, ROLLING DIE)..."
                            searchValue={itemSearchText}
                            onSearch={(v) => setItemSearchText(v)}
                            filterOption={(input, option: any) => {
                              if (!input) return true;
                              const search = input.toLowerCase();
                              const searchText = option?.searchText || '';
                              const label = String(option?.label || '').toLowerCase();
                              return searchText.includes(search) || label.includes(search);
                            }}
                            options={modalItemOptions}
                            onChange={(val) => {
                              handleItemSelectChange(val);
                              setItemSearchText('');
                            }}
                            onClear={() => {
                              handleItemSelectChange(undefined);
                              setItemSearchText('');
                            }}
                            notFoundContent={
                              modalItemsLoading ? (
                                <div style={{ padding: '10px 14px', textAlign: 'center' }}>
                                  <GlobalLoading spinnerOnly size="small" /> <span style={{ marginLeft: 8, color: '#64748b' }}>Searching database items...</span>
                                </div>
                              ) : (
                                <div style={{ padding: '10px 14px', textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
                                  {displayedItems.length === 0 ? 'No items found matching the selected filters. Try changing Division, Section, Department or clear filters.' : 'No matching item found.'}
                                </div>
                              )
                            }
                          />
                        </Form.Item>
                      </div>
                    </Col>
                    <Col span={24}>
                      {(() => {
                        const selectedIds: string[] = Array.isArray(liveCompValues.machineIds)
                          ? liveCompValues.machineIds
                          : [];
                        const divName = itemFilterDivision
                          ? divisions.find((d) => d.id === itemFilterDivision)?.name
                          : undefined;
                        const activeDeptName = modalMachineDeptFilter
                          ? departments.find((d) => d.id === modalMachineDeptFilter)?.name
                          : undefined;
                        const scopeLabel = activeDeptName || divName;
                        const filteredIds = modalMachineOptions.map((o) => o.value);
                        const allFilteredSelected =
                          filteredIds.length > 0 && filteredIds.every((id) => selectedIds.includes(id));

                        return (
                          <Form.Item
                            name="machineIds"
                            label={
                              <div style={{ display: 'flex', flexDirection: 'column', width: '100%', gap: 6 }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', gap: 12, flexWrap: 'wrap' }}>
                                  <span>
                                    Machine(s) <span style={{ fontSize: 11.5, fontWeight: 500, color: '#64748b' }}>({selectedIds.length} selected)</span>
                                  </span>
                                  <Space size={8}>
                                    <Checkbox
                                      checked={allFilteredSelected}
                                      indeterminate={
                                        !allFilteredSelected &&
                                        filteredIds.some((id) => selectedIds.includes(id))
                                      }
                                      disabled={filteredIds.length === 0}
                                      onChange={(e) => {
                                        const nextIds = e.target.checked
                                          ? Array.from(new Set([...selectedIds, ...filteredIds]))
                                          : selectedIds.filter((id) => !filteredIds.includes(id));
                                        compForm.setFieldValue('machineIds', nextIds);
                                        setLiveCompValues((prev) => ({ ...prev, machineIds: nextIds }));
                                      }}
                                    >
                                      <span style={{ fontSize: 12, fontWeight: 600, color: '#2563eb' }}>
                                        {scopeLabel
                                          ? `Select All Machines in ${scopeLabel} (${filteredIds.length})`
                                          : `Select All Machines (${filteredIds.length})`}
                                      </span>
                                    </Checkbox>
                                    {selectedIds.length > 0 && (
                                      <Button
                                        type="link"
                                        size="small"
                                        danger
                                        style={{ padding: 0, height: 'auto', fontSize: 12 }}
                                        onClick={() => {
                                          compForm.setFieldValue('machineIds', []);
                                          setLiveCompValues((prev) => ({ ...prev, machineIds: [] }));
                                        }}
                                      >
                                        Clear
                                      </Button>
                                    )}
                                  </Space>
                                </div>
                                {modalMachineDeptChips.length > 1 && (
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
                                    <span style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>Quick Dept:</span>
                                    <Tag
                                      onClick={() => setModalMachineDeptFilter(undefined)}
                                      color={!modalMachineDeptFilter ? 'blue' : 'default'}
                                      style={{ cursor: 'pointer', margin: 0, fontSize: 11, borderRadius: 10 }}
                                    >
                                      All ({modalDivisionMachines.length})
                                    </Tag>
                                    {modalMachineDeptChips.map((chip) => (
                                      <Tag
                                        key={chip.id}
                                        onClick={() =>
                                          setModalMachineDeptFilter((prev) => (prev === chip.id ? undefined : chip.id))
                                        }
                                        color={modalMachineDeptFilter === chip.id ? 'blue' : 'default'}
                                        style={{ cursor: 'pointer', margin: 0, fontSize: 11, borderRadius: 10 }}
                                      >
                                        {chip.name} ({chip.count})
                                      </Tag>
                                    ))}
                                  </div>
                                )}
                              </div>
                            }
                            rules={[{ required: true, type: 'array', min: 1, message: 'Select at least one machine' }]}
                          >
                            <Select
                              mode="multiple"
                              showSearch
                              allowClear
                              optionFilterProp="label"
                              maxTagCount="responsive"
                              placeholder={
                                scopeLabel
                                  ? `Select machines in ${scopeLabel}...`
                                  : 'Select one or more machines (or use Select All above)'
                              }
                              options={modalMachineOptions}
                              size="middle"
                              style={{
                                width: '100%',
                                border:
                                  selectedIds.length > 0
                                    ? '1.5px solid #10b981'
                                    : '1.5px solid rgba(239, 68, 68, 0.45)',
                                borderRadius: 6,
                              }}
                              onChange={(vals: string[]) => {
                                compForm.setFieldValue('machineIds', vals);
                                setLiveCompValues((prev) => ({ ...prev, machineIds: vals }));
                                if (vals?.length === 1) {
                                  const selMach = machines.find((m) => m.id === vals[0]);
                                  if (selMach?.divisionId && !itemFilterDivision) {
                                    setItemFilterDivision(selMach.divisionId);
                                  }
                                }
                              }}
                              notFoundContent={
                                <div style={{ padding: '8px 12px', textAlign: 'center', color: '#94a3b8', fontSize: 12 }}>
                                  {scopeLabel
                                    ? `No machines found in ${scopeLabel}`
                                    : 'No machines found'}
                                </div>
                              }
                            />
                          </Form.Item>
                        );
                      })()}
                    </Col>
                    <Col xs={24} sm={12}>
                      <Form.Item name="componentType" label="Tool / Component Type" rules={[{ required: true }]}>
                        <Select options={COMPONENT_TYPE_OPTIONS} size="middle" />
                      </Form.Item>
                    </Col>
                    <Col xs={24} sm={12}>
                      <Form.Item name="componentName" label="Component Name" rules={[{ required: true, message: 'Name is required' }]}>
                        <Input
                          placeholder="e.g. Thread Die 12 mm"
                          size="middle"
                          style={{
                            borderColor: liveCompValues.componentName ? '#10b981' : 'rgba(239, 68, 68, 0.45)',
                            borderWidth: 1.5,
                          }}
                        />
                      </Form.Item>
                    </Col>
                    <Col xs={24} sm={12}>
                      <Form.Item name="componentCode" label="Component Code" rules={[{ required: true, message: 'Code is required' }]}>
                        <Input
                          placeholder="e.g. TD-012"
                          size="middle"
                          style={{
                            borderColor: liveCompValues.componentCode ? '#10b981' : 'rgba(239, 68, 68, 0.45)',
                            borderWidth: 1.5,
                          }}
                        />
                      </Form.Item>
                    </Col>
                    <Col xs={24} sm={12}>
                      <Form.Item name="uomId" label="Production UOM (optional)">
                        <Select showSearch optionFilterProp="label" allowClear placeholder="Select UOM" options={uomOptions} size="middle" />
                      </Form.Item>
                    </Col>
                    <Col xs={24} sm={12}>
                      <Form.Item name="expectedLifeQuantity" label="Expected Life (PCS / Output)" tooltip="Expected productive life in produced quantity">
                        <InputNumber min={0.0001} step={0.0001} style={{ width: '100%' }} placeholder="e.g. 50000" size="middle" />
                      </Form.Item>
                    </Col>
                    <Col xs={24} sm={12}>
                      <Form.Item name="minThreshold" label="Min. Threshold">
                        <InputNumber min={0} style={{ width: '100%' }} placeholder="Replacement window lower bound" size="middle" />
                      </Form.Item>
                    </Col>
                    <Col xs={24} sm={12}>
                      <Form.Item name="maxThreshold" label="Max. Threshold">
                        <InputNumber min={0} style={{ width: '100%' }} placeholder="Replacement window upper bound" size="middle" />
                      </Form.Item>
                    </Col>
                    <Col span={24}>
                      <Form.Item name="description" label="Description">
                        <Input.TextArea rows={3} placeholder="Notes for maintenance and planning" />
                      </Form.Item>
                    </Col>
                  </Row>
                </Form>
              </div>

              {/* Right Column: Live Detail Sheet */}
              {showLiveSheet && (
                <div style={{ flex: '1 1 42%', minWidth: 280, display: 'flex', flexDirection: 'column' }}>
                  <div
                    style={{
                      background: 'linear-gradient(145deg, rgba(248, 250, 252, 0.95) 0%, rgba(241, 245, 249, 0.85) 100%)',
                      border: '1px solid rgba(226, 232, 240, 0.9)',
                      borderRadius: 14,
                      padding: '18px 16px',
                      boxShadow: '0 4px 16px -2px rgba(15, 23, 42, 0.05)',
                      display: 'flex',
                      flexDirection: 'column',
                      height: '100%',
                      overflowY: 'auto',
                    }}
                    data-testid="comp-live-detail-sheet"
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 10px', background: 'rgba(99, 102, 241, 0.1)', border: '1px solid rgba(99, 102, 241, 0.25)', borderRadius: 20, color: '#6366f1', fontSize: 11, fontWeight: 600, letterSpacing: 0.5, textTransform: 'uppercase' }}>
                        <EyeOutlined /> Live Detail Sheet
                      </div>
                      <Button
                        type="text"
                        size="small"
                        icon={<CloseOutlined />}
                        onClick={() => setShowLiveSheet(false)}
                        title="Close detail sheet"
                      />
                    </div>

                    <div style={{ marginBottom: 12, display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                      <Tag color="geekblue" style={{ fontSize: 13, padding: '3px 10px', borderRadius: 16, fontWeight: 700 }}>
                        {liveCompValues.componentCode || (editingComponent ? editingComponent.componentCode : 'TOOL-CODE')}
                      </Tag>
                      <Tag color={COMPONENT_TYPE_COLORS[liveCompValues.componentType || 'TOOLING'] || 'geekblue'} style={{ fontSize: 12, padding: '2px 8px', borderRadius: 12 }}>
                        {formatComponentTypeLabel(liveCompValues.componentType)}
                      </Tag>
                    </div>

                    <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--theme-text, #1e293b)', marginBottom: 4 }}>
                      {liveCompValues.componentName || 'New Tool / Component Name'}
                    </div>

                    <div style={{ fontSize: 12, color: 'var(--theme-text-muted, #64748b)', marginBottom: 14 }}>
                      <div style={{ marginBottom: 4 }}>Assigned Machine(s) ({liveCompMachines.length}):</div>
                      {liveCompMachines.length > 0 ? (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                          {liveCompMachines.map((m) => (
                            <Tag key={m.id} color="geekblue" style={{ margin: 0, fontWeight: 600 }}>
                              {m.machineCode || m.name}
                            </Tag>
                          ))}
                        </div>
                      ) : (
                        <strong>No Machine Assigned</strong>
                      )}
                    </div>

                    {liveCompStoreItem && (
                      <Alert
                        type="success"
                        showIcon
                        message="Linked Store Item"
                        description={`${liveCompStoreItem.itemCode} · ${liveCompStoreItem.name}`}
                        style={{ marginBottom: 14, fontSize: 12, borderRadius: 8 }}
                      />
                    )}

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
                      <div style={{ background: 'rgba(255, 255, 255, 0.8)', padding: '10px 12px', borderRadius: 8, border: '1px solid rgba(226, 232, 240, 0.8)' }}>
                        <div style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>Expected Life</div>
                        <div style={{ fontSize: 16, fontWeight: 700, color: '#4f46e5', marginTop: 2 }}>
                          {liveCompValues.expectedLifeQuantity != null ? `${Number(liveCompValues.expectedLifeQuantity).toLocaleString()} ${liveCompUom?.code || 'PCS'}` : '—'}
                        </div>
                      </div>
                      <div style={{ background: 'rgba(255, 255, 255, 0.8)', padding: '10px 12px', borderRadius: 8, border: '1px solid rgba(226, 232, 240, 0.8)' }}>
                        <div style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>Production UOM</div>
                        <div style={{ fontSize: 15, fontWeight: 700, color: '#0ea5e9', marginTop: 2 }}>
                          {liveCompUom ? `${liveCompUom.code} (${liveCompUom.name})` : 'PCS'}
                        </div>
                      </div>
                    </div>

                    <div style={{ background: 'rgba(255, 255, 255, 0.8)', padding: '10px 12px', borderRadius: 8, border: '1px solid rgba(226, 232, 240, 0.8)', marginBottom: 14 }}>
                      <div style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', fontWeight: 600, marginBottom: 4 }}>Replacement Window Thresholds</div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                        <span>Min: <strong>{liveCompValues.minThreshold != null ? Number(liveCompValues.minThreshold).toLocaleString() : '0'}</strong></span>
                        <span>Max: <strong>{liveCompValues.maxThreshold != null ? Number(liveCompValues.maxThreshold).toLocaleString() : 'Unlimited'}</strong></span>
                      </div>
                    </div>

                    {liveCompValues.description && (
                      <div style={{ marginTop: 'auto', background: 'rgba(241, 245, 249, 0.7)', padding: '8px 10px', borderRadius: 6, fontSize: 12, color: '#475569' }}>
                        <strong>Notes:</strong> {liveCompValues.description}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </DraggableResizableModal>

      {/* Component Replacement History Modal — Signature Double-Border Executive Frame */}
      <Modal
        open={historyOpen}
        onCancel={() => setHistoryOpen(false)}
        footer={null}
        closable={false}
        centered
        width={900}
        destroyOnHidden
        styles={{
          content: {
            padding: 7,
            borderRadius: 20,
            background: token.colorFillSecondary,
            border: `1px solid ${token.colorBorder}`,
            boxShadow: '0 24px 64px rgba(0, 0, 0, 0.28)',
          },
          body: { padding: 0 },
        }}
      >
        <div
          style={{
            borderRadius: 14,
            background: token.colorBgContainer,
            border: `1px solid ${token.colorBorderSecondary}`,
            overflow: 'hidden',
          }}
        >
          {/* Header Strip */}
          <div
            style={{
              padding: '14px 20px',
              background: `linear-gradient(135deg, ${token.colorFillAlter} 0%, ${token.colorBgContainer} 100%)`,
              borderBottom: `1px solid ${token.colorBorderSecondary}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 12,
                  background: `linear-gradient(135deg, ${token.colorPrimary} 0%, #f97316 100%)`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#fff',
                  fontSize: 18,
                  boxShadow: '0 4px 12px rgba(249, 115, 22, 0.25)',
                  flexShrink: 0,
                }}
              >
                <HistoryOutlined />
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: token.colorPrimary }}>
                  Tool Lifecycle & Replacement Analytics
                </div>
                <div style={{ fontSize: 16.5, fontWeight: 800, color: token.colorText }}>
                  Component Replacement History
                </div>
                <div style={{ fontSize: 12, color: token.colorTextSecondary }}>
                  {historyData ? `${historyData.component.componentName} — ${historyData.component.componentCode}` : 'Loading tool runs...'}
                </div>
              </div>
            </div>

            <Space size={6}>
              <Tooltip title="Minimize">
                <Button
                  type="text"
                  size="small"
                  onClick={() => {
                    setHistoryOpen(false);
                    setIsHistoryMinimized(true);
                  }}
                  style={{ color: token.colorTextSecondary, fontWeight: 700 }}
                >
                  —
                </Button>
              </Tooltip>
              <Button
                type="text"
                size="small"
                icon={<CloseOutlined />}
                onClick={() => setHistoryOpen(false)}
                style={{ color: token.colorTextSecondary }}
              />
            </Space>
          </div>

          {/* Modal Body */}
          <div style={{ padding: '16px 20px', maxHeight: '72vh', overflowY: 'auto' }}>
            {historyLoading ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
                <GlobalLoading title="Loading History..." subtitle="Retrieving component replacement history across assigned machines..." badgeText="LIVE DATABASE QUERY" minHeight={200} />
              </div>
            ) : historyData ? (
              <div>
                {/* Machine Filter Pill Bar */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: 8,
                    padding: '10px 12px',
                    borderRadius: 10,
                    background: token.colorFillAlter,
                    border: `1px solid ${token.colorBorderSecondary}`,
                    marginBottom: 14,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: token.colorTextSecondary, marginRight: 4 }}>
                      <ClusterOutlined style={{ marginRight: 5 }} />
                      Machine Scope:
                    </span>
                    <Button
                      size="small"
                      type={historyMachineFilter === 'ALL' ? 'primary' : 'default'}
                      onClick={() => {
                        setHistoryMachineFilter('ALL');
                        if (historyComponentId) void loadHistoryForComponent(historyComponentId, 'ALL');
                      }}
                      style={{ borderRadius: 16, fontWeight: 600 }}
                    >
                      All Assigned Machines ({historyData.assignedMachines?.length ?? 1})
                    </Button>
                    {(historyData.assignedMachines || []).map((m) => (
                      <Button
                        key={m.id}
                        size="small"
                        type={historyMachineFilter === m.id ? 'primary' : 'default'}
                        onClick={() => {
                          setHistoryMachineFilter(m.id);
                          if (historyComponentId) void loadHistoryForComponent(historyComponentId, m.id);
                        }}
                        style={{ borderRadius: 16, fontWeight: 600 }}
                      >
                        {m.machineCode || m.name}
                      </Button>
                    ))}
                  </div>
                </div>

                {/* Summary KPI Strip */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
                    gap: 10,
                    marginBottom: 14,
                  }}
                >
                  {[
                    {
                      label: 'Expected Life',
                      value: `${fmtNum(historyData.summary.expectedLifeQuantity)} ${PRODUCTION_UOM}`,
                      color: token.colorPrimary,
                    },
                    {
                      label: 'Total Changes / Runs',
                      value: String(historyData.summary.totalChanges),
                      color: '#0284c7',
                    },
                    {
                      label: 'Used by Installed',
                      value: `${fmtNum(historyData.summary.usedByInstalled)} ${PRODUCTION_UOM}`,
                      color: '#10b981',
                    },
                    {
                      label: 'Avg Life',
                      value: `${fmtNum(historyData.summary.avgLife)} ${PRODUCTION_UOM}`,
                      color: '#d97706',
                    },
                  ].map((tile) => (
                    <div
                      key={tile.label}
                      style={{
                        padding: '10px 12px',
                        borderRadius: 10,
                        background: token.colorFillAlter,
                        border: `1px solid ${token.colorBorderSecondary}`,
                        borderTop: `3px solid ${tile.color}`,
                      }}
                    >
                      <div style={{ fontSize: 11, fontWeight: 600, color: token.colorTextSecondary, textTransform: 'uppercase' }}>
                        {tile.label}
                      </div>
                      <div style={{ fontSize: 16, fontWeight: 800, color: token.colorText, marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>
                        {tile.value}
                      </div>
                    </div>
                  ))}
                </div>

                <Alert
                  style={{ marginBottom: 14 }}
                  type="info"
                  showIcon
                  message="Derived Production Counter"
                  description={`Cumulative output counter across ${historyData.machine.machineCode || 'scope'}: ${fmtNum(historyData.counter.value)}.`}
                />

                <Row gutter={14}>
                  <Col xs={24} md={12}>
                    <Descriptions column={1} size="small" bordered
                      items={[
                        { key: 'machine', label: 'Machine', children: `${historyData.machine.machineCode ?? '—'}${historyData.machine.name ? ` (${historyData.machine.name})` : ''}` },
                        { key: 'life', label: 'Expected Life', children: fmtNum(historyData.summary.expectedLifeQuantity) },
                        { key: 'window', label: 'Life Window', children: `${fmtNum(historyData.summary.minThreshold)} – ${fmtNum(historyData.summary.maxThreshold)}` },
                        { key: 'changes', label: 'Total Changes', children: historyData.summary.totalChanges },
                        { key: 'first', label: 'First Change', children: renderDateValue(historyData.summary.firstChangeDate) },
                        { key: 'last', label: 'Last Change', children: renderDateValue(historyData.summary.lastChangeDate) },
                      ]}
                    />
                  </Col>
                  <Col xs={24} md={12}>
                    <Descriptions column={1} size="small" bordered
                      items={[
                        { key: 'installed', label: 'Installed Tool', children: historyData.summary.installedToolCode || '—' },
                        { key: 'atInstall', label: 'Counter at Install', children: fmtNum(historyData.summary.counterAtInstall) },
                        { key: 'current', label: 'Current Counter (derived)', children: fmtNum(historyData.counter.value) },
                        { key: 'used', label: 'Used by Installed', children: fmtNum(historyData.summary.usedByInstalled) },
                        { key: 'remaining', label: 'Remaining', children: fmtNum(historyData.summary.remainingByInstalled) },
                        { key: 'avg', label: 'Avg Life', children: fmtNum(historyData.summary.avgLife) },
                        { key: 'range', label: 'Life Min / Max', children: `${fmtNum(historyData.summary.minLife)} / ${fmtNum(historyData.summary.maxLife)}` },
                      ]}
                    />
                  </Col>
                </Row>

                <div style={{ padding: '14px 2px 6px', fontWeight: 700, color: token.colorText }}>
                  Change History ({historyData.changes.length})
                </div>
                <ERPTable
                  columns={[
                    { title: 'Date', key: 'date', width: 120, render: (_, r) => renderDateValue(r.changeDate, r.changeTime) },
                    { title: 'Machine', key: 'machine', width: 110, render: (_, r) => <Tag color="geekblue" style={{ margin: 0, fontWeight: 600 }}>{r.machine?.machineCode ?? '—'}</Tag> },
                    { title: 'Tool', key: 'tool', width: 185, render: (_, r) => `${r.oldToolCode || '—'} → ${r.newToolCode}` },
                    { title: 'Counter Before', key: 'cb', width: 120, align: 'right', render: (_, r) => fmtNum(r.productionCounterBefore) },
                    { title: 'Counter After', key: 'ca', width: 120, align: 'right', render: (_, r) => fmtNum(r.productionCounterAfter) },
                    {
                      title: 'Life',
                      key: 'life',
                      width: 140,
                      align: 'right',
                      render: (_, r) => {
                        const lifeVal = r.currentLifeQty ?? r.productionSincePrevious;
                        const isLive =
                          r.isLiveActive ??
                          (!r.closedAt && r.lifecycleStatus !== 'STANDBY' && r.lifecycleStatus !== 'CLOSED');
                        return lifeVal != null ? (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                            <strong>{`${fmtNum(lifeVal)} ${PRODUCTION_UOM}`}</strong>
                            {isLive && renderLiveBadge()}
                          </span>
                        ) : EMPTY;
                      },
                    },
                    { title: 'Reason', key: 'reason', width: 165, render: (_, r) => r.reason || EMPTY },
                  ]}
                  dataSource={historyData.changes}
                  rowKey="id"
                  size="small"
                  pagination={false}
                  scroll={{ x: 960 }}
                  containerStyle={{ border: `1px solid ${token.colorBorderSecondary}`, borderRadius: 8, boxShadow: 'none' }}
                />
              </div>
            ) : null}
          </div>

          {/* Footer Bar */}
          <div
            style={{
              padding: '12px 20px',
              background: token.colorFillAlter,
              borderTop: `1px solid ${token.colorBorderSecondary}`,
              display: 'flex',
              justifyContent: 'flex-end',
            }}
          >
            <Button type="primary" onClick={() => setHistoryOpen(false)}>Close</Button>
          </div>
        </div>
      </Modal>

      {/* Change create / edit modal */}
      <DraggableResizableModal
        open={changeModalOpen}
        onCancel={() => setChangeModalOpen(false)}
        onMinimize={() => {
          setChangeModalOpen(false);
          setIsChangeMinimized(true);
        }}
        width={760}
        height={640}
        minWidth={580}
        minHeight={520}
        footer={[
          <Button key="cancel" onClick={() => setChangeModalOpen(false)}>Cancel</Button>,
          <Button key="save" type="primary" loading={saving} onClick={handleSaveChange}>
            {editingChange ? 'Save Changes' : 'Record Change'}
          </Button>,
        ]}
        title={
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <HistoryOutlined style={{ color: 'var(--theme-accent, #10b981)' }} />
            {editingChange ? `Edit Change — ${editingChange.changeDate} ${editingChange.newToolCode}` : 'Record Component Change'}
          </span>
        }
        subtitle="Snapshot the tool change with machine counter readings; the ERP computes the life covered since the previous change"
        styles={{ body: { overflow: 'auto' } }}
      >
        <Form form={changeForm} layout="vertical" style={{ paddingTop: 4 }}>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="machineId" label="Machine" rules={[{ required: true, message: 'Machine is required' }]}>
                <Select
                  showSearch
                  optionFilterProp="label"
                  placeholder="Select machine"
                  options={machineOptions}
                  onChange={(v) => {
                    setChangePickMachine(v);
                    changeForm.setFieldsValue({ componentId: undefined });
                  }}
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="componentId"
                label="Component / Tool"
                rules={[{ required: true, message: 'Component is required' }]}
              >
                <Select
                  showSearch
                  optionFilterProp="label"
                  placeholder="Select component tracked on this machine"
                  options={componentOptionsForMachine.map((c) => ({
                    value: c.id,
                    label: `${c.componentCode} — ${c.componentName} (${formatComponentTypeLabel(c.componentType)})`,
                  }))}
                  loading={componentOptions.length === 0}
                  onChange={(compId) => {
                    const comp = componentOptions.find((c) => c.id === compId);
                    if (comp) {
                      const cur = changeForm.getFieldValue('newToolCode');
                      if (!cur) {
                        changeForm.setFieldsValue({
                          newToolCode: comp.componentCode,
                          newToolDescription: comp.componentName,
                        });
                      }
                    }
                  }}
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="oldToolCode" label="Removed Tool Code" tooltip="Code of the tool being taken out (snapshot)">
                <Input placeholder="e.g. TD-011 (left empty on first install)" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="newToolCode" label="Installed Tool Code" rules={[{ required: true, message: 'Installed tool code is required' }]}>
                <Input placeholder="e.g. TD-012" />
              </Form.Item>
            </Col>
            <Col span={24}>
              <Form.Item name="newToolDescription" label="Installed Tool Description">
                <Input placeholder="e.g. Thread Die 12 mm, resharpened" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="changeDate" label="Change Date" rules={[{ required: true, message: 'Change date is required' }]}>
                <DatePicker style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="changeTime" label="Change Time">
                <TimePicker format="HH:mm" style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="productionCounterBefore" label="Counter Before" tooltip="Machine production counter read at removal">
                <InputNumber min={0} style={{ width: '100%' }} placeholder="0.0000" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="productionCounterAfter" label="Counter After" tooltip="Machine production counter read after installing the new tool">
                <InputNumber min={0} style={{ width: '100%' }} placeholder="0.0000" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="conditionStatus" label="Removed Tool Condition">
                <Select allowClear placeholder="Condition of the removed tool" options={CONDITION_STATUSES.map((s) => ({ value: s, label: s }))} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="reason" label="Reason">
                <Input placeholder="e.g. worn, broken, planned" />
              </Form.Item>
            </Col>
            <Col span={24}>
              <Form.Item name="remarks" label="Remarks">
                <Input.TextArea rows={2} placeholder="Additional context for maintenance records" />
              </Form.Item>
            </Col>
            <Col span={24}>
              <Form.Item name="jobCardId" label="Linked Job Card (optional)" tooltip="Optional — routine tool changes do not require a job card">
                <Select
                  showSearch
                  optionFilterProp="label"
                  allowClear
                  placeholder="No job card (routine change)"
                  options={jobCardOptions}
                />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </DraggableResizableModal>

      {/* Change detail modal */}
      <DraggableResizableModal
        open={changeDetailOpen}
        onCancel={() => setChangeDetailOpen(false)}
        onMinimize={() => {
          setChangeDetailOpen(false);
          setIsDetailMinimized(true);
        }}
        width={720}
        height={600}
        minWidth={540}
        minHeight={440}
        footer={<Button type="primary" onClick={() => setChangeDetailOpen(false)}>Close</Button>}
        title={
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <HistoryOutlined style={{ color: 'var(--theme-accent, #10b981)' }} />
            Change Transaction Detail
          </span>
        }
        subtitle={changeDetail ? `${changeDetail.changeDate}${changeDetail.changeTime ? ` ${changeDetail.changeTime}` : ''} · ${changeDetail.newToolCode}` : (changeDetailLoading ? 'Loading details...' : 'Transaction Detail')}
        styles={{ body: { overflow: 'auto' } }}
      >
        {changeDetailLoading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
            <GlobalLoading title="Loading Change Details..." subtitle="Retrieving transaction detail and replacement history..." badgeText="LIVE DATABASE QUERY" minHeight={200} />
          </div>
        ) : changeDetail ? (
          <>
            {/* KPI metric chips */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
                gap: 12,
                marginBottom: 16,
              }}
            >
              <div
                style={{
                  background: 'linear-gradient(135deg, rgba(79, 70, 229, 0.08) 0%, rgba(99, 102, 241, 0.04) 100%)',
                  border: '1px solid rgba(79, 70, 229, 0.2)',
                  borderRadius: 8,
                  padding: '10px 14px',
                }}
              >
                <div style={{ fontSize: 11, color: 'var(--theme-text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
                  Production Output (Life)
                </div>
                <div style={{ fontSize: 20, fontWeight: 700, color: '#4f46e5', marginTop: 2 }}>
                  {fmtNum(changeDetail.currentLifeQty ?? changeDetail.productionSincePrevious)}{' '}
                  <span style={{ fontSize: 12, fontWeight: 500 }}>
                    {PRODUCTION_UOM}
                  </span>
                </div>
              </div>

              <div
                style={{
                  background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.08) 0%, rgba(5, 150, 105, 0.04) 100%)',
                  border: '1px solid rgba(16, 185, 129, 0.2)',
                  borderRadius: 8,
                  padding: '10px 14px',
                }}
              >
                <div style={{ fontSize: 11, color: 'var(--theme-text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
                  Installed Tool Code
                </div>
                <div style={{ fontSize: 18, fontWeight: 700, color: '#10b981', marginTop: 2 }}>
                  <code>{changeDetail.newToolCode}</code>
                </div>
              </div>

              <div
                style={{
                  background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.08) 0%, rgba(217, 119, 6, 0.04) 100%)',
                  border: '1px solid rgba(245, 158, 11, 0.2)',
                  borderRadius: 8,
                  padding: '10px 14px',
                }}
              >
                <div style={{ fontSize: 11, color: 'var(--theme-text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
                  Tool Condition
                </div>
                <div style={{ marginTop: 4 }}>
                  <Tag color={CONDITION_COLORS[changeDetail.conditionStatus || ''] || 'default'} style={{ fontWeight: 600, fontSize: 12 }}>
                    {changeDetail.conditionStatus ? `${changeDetail.conditionStatus} Condition` : 'N/A'}
                  </Tag>
                </div>
              </div>
            </div>

            <Alert
              style={{ marginBottom: 14 }}
              type="info"
              showIcon
              message="Production Output Derivation"
              description={(() => {
                const lifeTxt = fmtNum(changeDetail.currentLifeQty ?? changeDetail.productionSincePrevious);
                return changeDetail.productionCounterBefore != null && changeDetail.productionCounterAfter != null
                  ? `Accumulated output: ${lifeTxt} ${PRODUCTION_UOM} (counter ${fmtNum(changeDetail.productionCounterBefore)} − install ${fmtNum(changeDetail.productionCounterAfter)}).`
                  : `Accumulated production output during this tool run: ${lifeTxt} ${PRODUCTION_UOM}.`;
              })()}
            />

            <Descriptions column={2} size="small" bordered
              items={[
                { key: 'machine', label: 'Machine', children: `${changeDetail.machine?.machineCode ?? '—'}${changeDetail.machine?.machineNumber ? ` ${changeDetail.machine.machineNumber}` : ''}` },
                { key: 'component', label: 'Component', children: `${changeDetail.component?.componentCode ?? changeDetail.componentId}${changeDetail.component?.componentName ? ` — ${changeDetail.component.componentName}` : ''}` },
                { key: 'old', label: 'Removed Tool', children: changeDetail.oldToolCode || '—' },
                { key: 'new', label: 'Installed Tool', children: changeDetail.newToolCode },
                { key: 'desc', label: 'Tool Description', children: changeDetail.newToolDescription || '—' },
                { key: 'condition', label: 'Condition', children: changeDetail.conditionStatus || '—' },
                { key: 'cb', label: 'Counter Before (Removal)', children: fmtNum(changeDetail.productionCounterBefore) },
                { key: 'ca', label: 'Counter After (Install)', children: fmtNum(changeDetail.productionCounterAfter) },
                {
                  key: 'life',
                  label: 'Production Output',
                  children: (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                      <strong style={{ color: '#4f46e5' }}>
                        {fmtNum(changeDetail.currentLifeQty ?? changeDetail.productionSincePrevious)}{' '}
                        {PRODUCTION_UOM}
                      </strong>
                      {(changeDetail.isLiveActive ??
                        (!changeDetail.closedAt && changeDetail.lifecycleStatus !== 'STANDBY' && changeDetail.lifecycleStatus !== 'CLOSED')) &&
                        renderLiveBadge()}
                    </span>
                  ),
                },
                { key: 'jobcard', label: 'Job Card', children: changeDetail.jobCard?.jobCardNo || changeDetail.jobCard?.code || '—' },
                { key: 'reason', label: 'Reason for Change', children: changeDetail.reason || '—' },
                { key: 'changedBy', label: 'Recorded At', children: changeDetail.changedAt ? dayjs(changeDetail.changedAt).format('YYYY-MM-DD HH:mm') : (changeDetail.changeDate || '—') },
                { key: 'remarks', label: 'Remarks / Notes', children: changeDetail.remarks || '—', span: 2 },
              ]}
            />
          </>
        ) : (
          <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--theme-text-muted)' }}>
            No details found for this change transaction.
          </div>
        )}
      </DraggableResizableModal>

      {/* Install tool modal (TASK26) */}
      <DraggableResizableModal
        open={installOpen}
        onCancel={() => setInstallOpen(false)}
        onMinimize={() => {
          setInstallOpen(false);
          setIsInstallMinimized(true);
        }}
        width={760}
        height={700}
        minWidth={600}
        minHeight={560}
        footer={[
          <Button key="cancel" onClick={() => setInstallOpen(false)}>Cancel</Button>,
          <Button key="save" type="primary" loading={installSaving} onClick={handleInstallSubmit}>
            Install Tool
          </Button>,
        ]}
        title={
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <CheckCircleOutlined style={{ color: 'var(--theme-accent, #10b981)' }} />
            Install Tool
          </span>
        }
        subtitle="Opens the lifecycle transaction — the installed tool becomes ACTIVE with an automatic derived counter"
        styles={{ body: { overflow: 'auto' } }}
      >
        <Alert
          style={{ marginBottom: 12 }}
          type="info"
          showIcon
          message="Automatic derived counter"
          description="Machines have no native counter: leave 'Counter After Install' empty and the ERP derives it as SUM(production_entries.actual_quantity) up to the install date."
        />
        <Form form={installForm} layout="vertical" style={{ paddingTop: 4 }}>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="machineId" label="Machine" rules={[{ required: true, message: 'Machine is required' }]}>
                <Select
                  showSearch optionFilterProp="label" placeholder="Select machine" options={machineOptions}
                  onChange={(v) => {
                    setInstallPickMachine(v);
                    installForm.setFieldsValue({ componentId: undefined });
                  }}
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="componentId"
                label="Component / Tool"
                tooltip="Only components without a currently ACTIVE tool are listed"
                rules={[{ required: true, message: 'Component is required' }]}
              >
                <Select
                  showSearch optionFilterProp="label" placeholder="Select component"
                  options={installableComponents.map((c) => ({
                    value: c.id,
                    label: `${c.componentCode} — ${c.componentName} (${formatComponentTypeLabel(c.componentType)})`,
                  }))}
                  onChange={(compId) => {
                    const comp = installableComponents.find((c) => c.id === compId);
                    if (comp) {
                      const cur = installForm.getFieldValue('newToolCode');
                      if (!cur) {
                        installForm.setFieldsValue({
                          newToolCode: comp.componentCode,
                          newToolDescription: comp.componentName,
                        });
                      }
                    }
                  }}
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="newToolCode" label="Installed Tool Code" rules={[{ required: true, message: 'Installed tool code is required' }]}>
                <Input placeholder="e.g. TD-013" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="newToolDescription" label="Installed Tool Description">
                <Input placeholder="e.g. Thread Die 14 mm, newly reworked" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="changeDate" label="Install Date" initialValue={dayjs()} rules={[{ required: true, message: 'Install date is required' }]}>
                <DatePicker style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="changeTime" label="Install Time" initialValue={dayjs()}>
                <TimePicker format="HH:mm" style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="productionCounterAfter" label="Counter After Install" tooltip="Leave empty to auto-derive from production entries up to the install date">
                <InputNumber min={0} style={{ width: '100%' }} placeholder="Auto-derived" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="storeIssueId" label="Store Issue Note (SIN)" tooltip="Optional — links this install to the posted Store Issue Note (SIN) that supplied the tool (reuses stock, no duplicate balances)">
                <Select showSearch optionFilterProp="label" allowClear placeholder="Select posted Store Issue Note (SIN)" options={storeIssueOptions} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="jobCardId" label="Linked Job Card (optional)">
                <Select showSearch optionFilterProp="label" allowClear placeholder="No job card (routine install)" options={installJobCardOptions} />
              </Form.Item>
            </Col>
            <Col span={24}>
              <Form.Item name="remarks" label="Remarks">
                <Input.TextArea rows={2} placeholder="Notes for the install transaction" />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </DraggableResizableModal>

      {/* Remove tool modal (TASK26) */}
      <DraggableResizableModal
        open={removeOpen}
        onCancel={() => setRemoveOpen(false)}
        width={760}
        height={680}
        minWidth={600}
        minHeight={540}
        footer={[
          <Button key="cancel" onClick={() => setRemoveOpen(false)}>Cancel</Button>,
          <Button key="save" type="primary" danger loading={removeSaving} onClick={handleRemoveSubmit}>
            Remove Tool
          </Button>,
        ]}
        title={
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <SwapRightOutlined style={{ color: 'var(--theme-accent, #10b981)' }} />
            Remove Installed Tool
          </span>
        }
        subtitle={removeTarget ? `${removeTarget.machine?.machineCode ?? 'Machine'} · ${removeTarget.component?.componentCode ?? 'Component'} · ${removeTarget.installedToolCode}` : 'Removing the active tool'}
        styles={{ body: { overflow: 'auto' } }}
      >
        {removeTarget && (
          <Descriptions column={2} size="small" bordered style={{ marginBottom: 14 }}
            items={[
              { key: 'machine', label: 'Machine', children: `${removeTarget.machine?.machineCode ?? '—'}${removeTarget.machine?.machineNumber ? ` ${removeTarget.machine.machineNumber}` : ''}` },
              { key: 'component', label: 'Component', children: `${removeTarget.component?.componentCode ?? '—'} — ${removeTarget.component?.componentName ?? ''}` },
              { key: 'tool', label: 'Installed Tool', children: removeTarget.installedToolCode },
              { key: 'installed', label: 'Installed', children: `${removeTarget.installDate}${removeTarget.installTime ? ` ${removeTarget.installTime}` : ''}` },
              { key: 'counter', label: 'Counter at Install (derived)', children: fmtNum(removeTarget.installCounter) },
              { key: 'used', label: 'Used so far (derived)', children: fmtNum(removeTarget.usedByInstalled) },
              { key: 'storeIssue', label: 'Store Issue Note (SIN)', children: removeTarget.storeIssueNumber || '—' },
              { key: 'jobCard', label: 'Job Card', children: removeTarget.jobCardNo || '—' },
            ]}
          />
        )}
        <Alert
          style={{ marginBottom: 12 }}
          type="info"
          showIcon
          message="Automatic production life"
          description="Production life = derived counter at removal − proportion covered since install. Leave 'Counter Before' empty to auto-derive from production entries up to the removal date; a manual read can be entered instead."
        />
        <Form form={removeForm} layout="vertical" style={{ paddingTop: 4 }}>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="changeDate" label="Removal Date" rules={[{ required: true, message: 'Removal date is required' }]}>
                <DatePicker style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="changeTime" label="Removal Time">
                <TimePicker format="HH:mm" style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="productionCounterBefore" label="Counter Before (optional)" tooltip="Authoritative read at removal — leave empty to auto-derive">
                <InputNumber min={0} style={{ width: '100%' }} placeholder="Auto-derived" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="conditionStatus" label="Removed Tool Condition" rules={[{ required: true, message: 'Condition is required' }]}>
                <Select options={CONDITION_STATUSES.map((s) => ({ value: s, label: s }))} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="dispositionType" label="Disposition" tooltip="Where the removed tool goes" rules={[{ required: true, message: 'Disposition is required' }]}>
                <Select options={DISPOSITION_TYPES.map((d) => ({ value: d, label: DISPOSITION_LABELS[d] ?? d }))} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="dispositionNote" label="Disposition Note">
                <Input placeholder="e.g. returned to tool store for rework" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="reason" label="Reason">
                <Input placeholder="e.g. worn, broken, expected life reached" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="remarks" label="Remarks">
                <Input placeholder="Additional context" />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </DraggableResizableModal>

      {/* Dispose modal (TASK26) */}
      <DraggableResizableModal
        open={disposeOpen}
        onCancel={() => setDisposeOpen(false)}
        width={560}
        height={520}
        minWidth={480}
        minHeight={420}
        footer={[
          <Button key="cancel" onClick={() => setDisposeOpen(false)}>Cancel</Button>,
          <Button key="save" type="primary" loading={disposeSaving} onClick={handleDisposeSubmit}>
            Save Disposition
          </Button>,
        ]}
        title={
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <EditOutlined style={{ color: 'var(--theme-accent, #10b981)' }} />
            Tool Disposition
          </span>
        }
        subtitle={disposeTarget ? `Tool ${disposeTarget.toolCode} · ${disposeTarget.component?.componentCode ?? 'Component'} · removed ${disposeTarget.removeDate ?? '—'}` : 'Disposition of a removed tool'}
        styles={{ body: { overflow: 'auto' } }}
      >
        <Form form={disposeForm} layout="vertical" style={{ paddingTop: 4 }}>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="dispositionType" label="Disposition" rules={[{ required: true, message: 'Disposition is required' }]}>
                <Select options={DISPOSITION_TYPES.map((d) => ({ value: d, label: DISPOSITION_LABELS[d] ?? d }))} />
              </Form.Item>
            </Col>
            <Col span={24}>
              <Form.Item name="dispositionNote" label="Disposition Note">
                <Input placeholder="e.g. scrapped due to cracking across the die face" />
              </Form.Item>
            </Col>
            <Col span={24}>
              <Form.Item name="reason" label="Reason">
                <Input placeholder="Reason for the disposition decision" />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </DraggableResizableModal>

      {/* Component breakdown items modal (TASK26) */}
      <DraggableResizableModal
        open={itemsOpen}
        onCancel={() => setItemsOpen(false)}
        width={840}
        height={640}
        minWidth={680}
        minHeight={520}
        footer={<Button type="primary" onClick={() => setItemsOpen(false)}>Close</Button>}
        title={
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <UnorderedListOutlined style={{ color: 'var(--theme-accent, #10b981)' }} />
            Tool / Component Breakdown (Item Master)
          </span>
        }
        subtitle={itemsTarget ? `${itemsTarget.componentCode} — ${itemsTarget.componentName}` : 'Item Master lines composing the tool'}
        styles={{ body: { overflow: 'auto' } }}
      >
        <Alert
          style={{ marginBottom: 12 }}
          type="info"
          showIcon
          message="Per-line quantity + UOM"
          description="Each item line keeps its own quantity and UOM — quantities are never summed across incompatible UOMs."
        />
        <Form form={itemForm} layout="inline" style={{ marginBottom: 12, rowGap: 8 }}>
          <Form.Item name="itemId" label="Item" rules={[{ required: true, message: 'Item is required' }]} style={{ minWidth: 220 }}>
            <Select showSearch optionFilterProp="label" placeholder="Select Item Master" options={itemOptions} />
          </Form.Item>
          <Form.Item name="quantity" label="Qty" rules={[{ required: true, message: 'Qty is required' }]}>
            <InputNumber min={0.0001} step={0.0001} style={{ width: 120 }} placeholder="0.0000" />
          </Form.Item>
          <Form.Item name="uomId" label="UOM">
            <Select showSearch optionFilterProp="label" allowClear placeholder="UOM" style={{ width: 110 }} options={uomOptions} />
          </Form.Item>
          <Form.Item name="notes" label="Notes" style={{ minWidth: 160 }}>
            <Input placeholder="Optional notes" />
          </Form.Item>
          <Form.Item>
            <Button type="primary" loading={itemsSaving} onClick={handleSaveItem} icon={editingItemLine ? <EditOutlined /> : <PlusOutlined />}>
              {editingItemLine ? 'Update Line' : 'Add Line'}
            </Button>
          </Form.Item>
          {editingItemLine && (
            <Form.Item>
              <Button onClick={() => { setEditingItemLine(null); itemForm.resetFields(); }}>Cancel Edit</Button>
            </Form.Item>
          )}
        </Form>
        <ERPTable
          columns={[
            { title: 'Item Code', key: 'code', width: 130, render: (_: any, r: ComponentItemLine) => <code style={{ color: 'var(--theme-accent)' }}>{r.item?.itemCode ?? r.itemId}</code> },
            { title: 'Item Name', key: 'name', width: 200, render: (_: any, r: ComponentItemLine) => r.item?.itemName ?? '—' },
            { title: 'Quantity', key: 'qty', width: 110, render: (_: any, r: ComponentItemLine) => fmtNum(r.quantity) },
            { title: 'UOM', key: 'uom', width: 90, render: (_: any, r: ComponentItemLine) => r.uom?.code ?? '—' },
            { title: 'Notes', key: 'notes', render: (_: any, r: ComponentItemLine) => r.notes || EMPTY },
            {
              title: 'Actions', key: 'actions', width: 90,
              render: (_: any, r: ComponentItemLine) => (
                <Space size={4}>
                  <Tooltip title="Edit breakdown line">
                    <Button type="text" size="small" icon={<EditOutlined />} onClick={() => openEditItem(r)} aria-label={`Edit breakdown line ${r.item?.itemCode ?? r.itemId}`} />
                  </Tooltip>
                  <Popconfirm title="Remove this breakdown line?" onConfirm={() => handleDeleteItem(r)} okButtonProps={{ danger: true }}>
                    <Tooltip title="Delete breakdown line">
                      <Button type="text" size="small" danger icon={<DeleteOutlined />} aria-label={`Delete breakdown line ${r.item?.itemCode ?? r.itemId}`} />
                    </Tooltip>
                  </Popconfirm>
                </Space>
              ),
            },
          ] as ColumnsType<ComponentItemLine>}
          dataSource={componentItems}
          rowKey="id"
          loading={false}
          size="small"
          pagination={false}
          scroll={{ x: 800 }}
          containerStyle={{ border: 'none', boxShadow: 'none' }}
          emptyTitle="No breakdown lines"
          emptyDescription="Add Item Master lines that make up this tool / component."
        />
      </DraggableResizableModal>

      <SaveResultDialog
        open={resultOpen}
        phase={resultPhase}
        result={resultData}
        errorTitle={resultErrorTitle}
        errorLead={resultErrorLead}
        errorMessage={resultError}
        onRetry={handleResultRetry}
        onClose={handleResultClose}
        successTitle="Successful Save"
        okLabel="OK"
      />

      {/* Universal Floating Minimized Dock for Machine Tooling */}
      {(isCompMinimized || isChangeMinimized || isInstallMinimized || isDetailMinimized || isHistoryMinimized) && (
        <div className="erp-minimized-dock" data-testid="tooling-minimized-dock">
          {isCompMinimized && (
            <div
              className="erp-minimized-tab"
              onClick={() => {
                setIsCompMinimized(false);
                setCompModalOpen(true);
              }}
            >
              <span className="erp-minimized-pulse" />
              <ToolOutlined style={{ color: '#4f46e5' }} />
              <span>{editingComponent ? `Edit: ${editingComponent.componentCode}` : 'Add Tool / Component'}</span>
              <span
                className="erp-minimized-close"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsCompMinimized(false);
                }}
              >
                ×
              </span>
            </div>
          )}
          {isChangeMinimized && (
            <div
              className="erp-minimized-tab"
              onClick={() => {
                setIsChangeMinimized(false);
                setChangeModalOpen(true);
              }}
            >
              <span className="erp-minimized-pulse" />
              <SwapOutlined style={{ color: '#0ea5e9' }} />
              <span>{editingChange ? `Edit Change: ${editingChange.componentId}` : 'Record Change'}</span>
              <span
                className="erp-minimized-close"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsChangeMinimized(false);
                }}
              >
                ×
              </span>
            </div>
          )}
          {isInstallMinimized && (
            <div
              className="erp-minimized-tab"
              onClick={() => {
                setIsInstallMinimized(false);
                setInstallOpen(true);
              }}
            >
              <span className="erp-minimized-pulse" />
              <PlusCircleOutlined style={{ color: '#10b981' }} />
              <span>Install Tool</span>
              <span
                className="erp-minimized-close"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsInstallMinimized(false);
                }}
              >
                ×
              </span>
            </div>
          )}
          {isDetailMinimized && (
            <div
              className="erp-minimized-tab"
              onClick={() => {
                setIsDetailMinimized(false);
                setChangeDetailOpen(true);
              }}
            >
              <span className="erp-minimized-pulse" />
              <EyeOutlined style={{ color: '#f59e0b' }} />
              <span>Change Detail</span>
              <span
                className="erp-minimized-close"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsDetailMinimized(false);
                }}
              >
                ×
              </span>
            </div>
          )}
          {isHistoryMinimized && (
            <div
              className="erp-minimized-tab"
              onClick={() => {
                setIsHistoryMinimized(false);
                setHistoryOpen(true);
              }}
            >
              <span className="erp-minimized-pulse" />
              <HistoryOutlined style={{ color: '#8b5cf6' }} />
              <span>Tool Life History</span>
              <span
                className="erp-minimized-close"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsHistoryMinimized(false);
                }}
              >
                ×
              </span>
            </div>
          )}
        </div>
      )}
      <ToolChangeoverModal
        open={changeoverOpen}
        tool={changeoverTarget}
        onClose={() => {
          setChangeoverOpen(false);
          setChangeoverTarget(null);
        }}
        onSuccess={() => {
          void fetchActiveTools(atPage);
          void fetchStandbyTools();
          void fetchLifeReport(lifePage);
          void fetchChanges(chgPage);
        }}
      />

      <RemountStandbyToolModal
        open={remountOpen}
        machines={machineOptions}
        standbyTools={standbyTools}
        loadingStandby={standbyLoading}
        onClose={() => setRemountOpen(false)}
        onSuccess={() => {
          void fetchActiveTools(atPage);
          void fetchStandbyTools();
          void fetchLifeReport(lifePage);
          void fetchChanges(chgPage);
        }}
      />

      {/* View Tool Run & Session Details Modal */}
      <DraggableResizableModal
        open={sessionDetailOpen}
        onCancel={() => {
          setSessionDetailOpen(false);
          setSessionDetailRow(null);
        }}
        width={780}
        height={640}
        minWidth={560}
        minHeight={460}
        footer={[
          <Button
            key="close"
            type="primary"
            onClick={() => {
              setSessionDetailOpen(false);
              setSessionDetailRow(null);
            }}
          >
            Close
          </Button>,
        ]}
        title={
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <HistoryOutlined style={{ color: 'var(--theme-primary)' }} />
            <span>Tool Run & Session Details</span>
          </span>
        }
        subtitle={
          sessionDetailRow
            ? `${sessionDetailRow.machine?.machineCode ?? 'Machine'} · ${sessionDetailRow.toolCode}`
            : 'Session history and cumulative life details'
        }
        styles={{ body: { overflow: 'auto' } }}
      >
        {sessionDetailRow && (() => {
          const uom = ` ${PRODUCTION_UOM}`;
          const expected = num(sessionDetailRow.component?.expectedLifeQuantity);
          const pct =
            sessionDetailRow.lifeProgressPct ??
            (expected && expected > 0 && sessionDetailRow.productionLife != null
              ? Number(((sessionDetailRow.productionLife / expected) * 100).toFixed(1))
              : null);
          const sessions = Array.isArray(sessionDetailRow.mountingSessions)
            ? sessionDetailRow.mountingSessions
            : [];
          return (
            <div>
              <Descriptions
                column={2}
                size="small"
                bordered
                style={{ marginBottom: 16 }}
                items={[
                  {
                    key: 'machine',
                    label: 'Machine',
                    children: `${sessionDetailRow.machine?.machineCode ?? '—'}${sessionDetailRow.machine?.name ? ` — ${sessionDetailRow.machine.name}` : ''}`,
                  },
                  {
                    key: 'component',
                    label: 'Component',
                    children: `${sessionDetailRow.component?.componentCode ?? '—'} — ${sessionDetailRow.component?.componentName ?? ''}`,
                  },
                  { key: 'tool', label: 'Tool Run', children: <code>{sessionDetailRow.toolCode}</code> },
                  { key: 'status', label: 'Status', children: <StatusBadge status={sessionDetailRow.status} /> },
                  {
                    key: 'life',
                    label: 'Production Life',
                    children: (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                        <strong style={{ color: 'var(--theme-primary)' }}>
                          {fmtNum(sessionDetailRow.productionLife)}{uom}
                        </strong>
                        {sessionDetailRow.status === 'ACTIVE' && renderLiveBadge()}
                      </span>
                    ),
                  },
                  {
                    key: 'expected',
                    label: 'Expected Life / Progress',
                    children: expected != null
                      ? `${fmtNum(expected)}${uom}${pct != null ? ` (${pct}% used)` : ''}`
                      : 'Not configured',
                  },
                  { key: 'issued', label: 'Issued Date', children: renderDateValue(sessionDetailRow.installDate) },
                  { key: 'closed', label: 'Closed Date', children: sessionDetailRow.removeDate ? renderDateValue(sessionDetailRow.removeDate) : 'Running' },
                  { key: 'voucher', label: 'Store Issue Note (SIN)', children: sessionDetailRow.storeIssueNumber || '—' },
                  { key: 'operator', label: 'Operator / Incharge', children: [sessionDetailRow.operatorName, sessionDetailRow.shiftInchargeName].filter(Boolean).join(' · ') || '—' },
                  {
                    key: 'endReason',
                    label: 'End / Unmount Reason',
                    children: sessionDetailRow.status === 'ACTIVE' ? 'In Service (Running)' : (sessionDetailRow.reason || '—'),
                    span: 2,
                  },
                ]}
              />

              <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8, color: token.colorText }}>
                Mounting Sessions ({sessions.length || 1})
              </div>
              {sessions.length > 0 ? (
                <ERPTable
                  size="small"
                  rowKey={(s) => String(s.sessionNo)}
                  pagination={false}
                  containerStyle={{ border: `1px solid ${token.colorBorderSecondary}`, borderRadius: 6, boxShadow: 'none' }}
                  dataSource={sessions}
                  columns={[
                    { title: 'Session #', dataIndex: 'sessionNo', key: 'sessionNo', width: 85, align: 'center' },
                    { title: 'Machine', dataIndex: 'machineCode', key: 'machineCode', width: 100 },
                    { title: 'Action', dataIndex: 'action', key: 'action', width: 105 },
                    { title: 'Mounted At', dataIndex: 'mountedAt', key: 'mountedAt', width: 150 },
                    { title: 'Unmounted At', key: 'unmountedAt', width: 150, render: (_, s) => s.unmountedAt || 'Active' },
                    { title: 'Session Output', key: 'sessionProduction', width: 130, align: 'right', render: (_, s) => `${fmtNum(s.sessionProduction)}${uom}` },
                    { title: 'Reason / Operator', key: 'reason', render: (_, s) => [s.reason, s.operatorName].filter(Boolean).join(' · ') || '—' },
                  ]}
                />
              ) : (
                <Alert
                  type="info"
                  showIcon
                  message="Single active mounting session"
                  description={`Mounted on ${sessionDetailRow.installDate} with starting counter ${fmtNum(sessionDetailRow.installCounter)}.`}
                />
              )}
            </div>
          );
        })()}
      </DraggableResizableModal>
    </div>
    </TabKeepAlive>
  );
};

export default MachineToolingManagement;
