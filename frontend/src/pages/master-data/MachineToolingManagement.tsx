import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  App, Button, Space, Select, Form, Input, InputNumber, Popconfirm, Tabs,
  Descriptions, Row, Col, Tag, Tooltip, DatePicker, TimePicker, Alert, Statistic, Spin,
  Checkbox, Dropdown,
} from 'antd';
import {
  PlusOutlined, EditOutlined, EyeOutlined, DeleteOutlined, ReloadOutlined,
  SwapRightOutlined, ToolOutlined, HistoryOutlined, BarChartOutlined,
  CheckCircleOutlined, UnorderedListOutlined, SwapOutlined, PlusCircleOutlined, DesktopOutlined,
  AppstoreOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import apiService from '../../services/api';
import { usePermission } from '../../hooks/usePermission';
import {
  PageHeader, StatusBadge, ERPTable, TableToolbar,
  DraggableResizableModal, SaveResultDialog,
  type SaveResultPhase, type SaveResultData,
} from '../../components/shared';
import { useHeaderActions } from '../../components/layout/headerActionsStore';

const COMPONENT_TYPES = ['DIE', 'MOULD', 'CHAIN', 'TOOL', 'FIXTURE', 'COMPONENT', 'OTHER'];
const CONDITION_STATUSES = ['NEW', 'USED', 'DAMAGED', 'REWORKED', 'OTHER'];

const COMPONENT_TYPE_COLORS: Record<string, string> = {
  DIE: 'volcano', MOULD: 'purple', CHAIN: 'cyan', TOOL: 'geekblue',
  FIXTURE: 'orange', COMPONENT: 'gold', OTHER: 'default',
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

interface MachineLk { id: string; machineCode?: string | null; machineNumber?: string | null; name?: string | null; }
interface ItemLk { id: string; itemCode: string; name?: string | null; baseUomId?: string | null; baseUom?: { id: string; code: string } | null; }
interface UomLk { id: string; code: string; name?: string | null; }
interface JobCardLk { id: string; jobCardNo?: string | null; code?: string | null; }

interface ComponentRec {
  id: string; companyId: string; machineId: string; itemId: string | null; uomId: string | null;
  componentType: string; componentName: string; componentCode: string;
  expectedLifeQuantity?: string | number | null; minThreshold?: string | number | null;
  maxThreshold?: string | number | null; description?: string | null; isActive: boolean;
  machine?: MachineLk | null; item?: ItemLk | null; uom?: UomLk | null;
  createdAt?: string | null; updatedAt?: string | null;
}

interface ChangeRec {
  id: string; companyId: string; machineId: string; componentId: string; jobCardId: string | null;
  oldToolCode: string | null; newToolCode: string; newToolDescription: string | null;
  changeDate: string; changeTime: string | null;
  productionCounterBefore?: string | number | null; productionCounterAfter?: string | number | null;
  productionSincePrevious?: string | number | null; reason: string | null;
  conditionStatus: string | null; remarks: string | null; changedAt?: string | null; isActive: boolean;
  machine?: MachineLk | null; component?: ComponentRec | null;
  jobCard?: { id: string; jobCardNo?: string | null; code?: string | null } | null;
  changedByUser?: { id: string; fullName?: string; name?: string } | null;
}

interface ComponentHistory {
  component: ComponentRec;
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
  machine: { id: string; machineCode: string; machineName: string | null } | null;
  component: { id: string; componentCode: string; componentName: string; componentType: string; uomCode: string | null } | null;
  changes: number; toolsInstalled: number; qtyUsed: number; productionCovered: number;
  avgLife: number | null; minLife: number | null; maxLife: number | null; lastChangeDate: string | null;
}
interface MonthlyReport {
  month: string; start: string; end: string;
  rows: ReportRow[];
  totals: { machines: number; components: number; changes: number; qtyUsed: number; productionCovered: number; };
}

/* TASK26 — lifecycle records */

interface ActiveToolRec {
  id: string; machineId: string;
  machine: { id: string; machineCode?: string | null; machineNumber?: string | null; name?: string | null } | null;
  componentId: string;
  component: {
    id: string; componentCode: string; componentName: string; componentType: string;
    expectedLifeQuantity?: string | number | null; uomCode?: string | null;
  } | null;
  installedToolCode: string; newToolDescription?: string | null;
  installDate: string; installTime?: string | null;
  installCounter?: number | null; derivedCounter?: number | null;
  usedByInstalled?: number | null; remainingByInstalled?: number | null;
  storeIssueId?: string | null; storeIssueNumber?: string | null;
  jobCardNo?: string | null; changeDate: string; closedAt?: string | null;
}

interface LifeRowRec {
  id: string; machineId: string;
  machine: { id: string; machineCode?: string | null; machineNumber?: string | null; name?: string | null } | null;
  componentId: string;
  component: {
    id: string; componentCode: string; componentName: string; componentType: string;
    expectedLifeQuantity?: string | number | null; uomCode?: string | null;
  } | null;
  toolCode: string; newToolDescription?: string | null; oldToolCode?: string | null;
  installDate: string; installTime?: string | null; removeDate?: string | null;
  installCounter?: number | null; removalCounter?: number | null; productionLife?: number | null;
  conditionStatus?: string | null; dispositionType?: string | null; dispositionNote?: string | null;
  reason?: string | null; remarks?: string | null; status: string; closedAt?: string | null;
  jobCardNo?: string | null; storeIssueNumber?: string | null; storeIssueId?: string | null;
  changedAt?: string | null; changedBy?: string | null; componentType?: string;
}

interface LifeReportData {
  data: LifeRowRec[]; total: number; page: number; limit: number;
  summary: {
    installs: number; active: number; closed: number; withDisposition: number;
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

const MachineToolingManagement: React.FC = () => {
  const { message } = App.useApp();
  const { can } = usePermission();

  const [activeTab, setActiveTab] = useState('setup');

  /* ── Shared lookups ───────────────────────────────────────────────────────── */
  const [machines, setMachines] = useState<MachineLk[]>([]);
  const [items, setItems] = useState<ItemLk[]>([]);
  const [uoms, setUoms] = useState<UomLk[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const [mRes, iRes, uRes] = await Promise.allSettled([
          apiService.get<{ data: MachineLk[] }>('/machines', { limit: 500, sortBy: 'machineCode' }),
          apiService.get<{ data: ItemLk[] }>('/master-data/items', { limit: 500, sortBy: 'itemCode' }),
          apiService.get<{ data: UomLk[] }>('/master-data/uom', { limit: 500, sortBy: 'code' }),
        ]);
        if (mRes.status === 'fulfilled') setMachines((mRes.value as any)?.data || (Array.isArray(mRes.value) ? mRes.value : []));
        if (iRes.status === 'fulfilled') setItems((iRes.value as any)?.data || (Array.isArray(iRes.value) ? iRes.value : []));
        if (uRes.status === 'fulfilled') setUoms((uRes.value as any)?.data || (Array.isArray(uRes.value) ? uRes.value : []));
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
    () => items.map((i) => ({ value: i.id, label: i.name ? `${i.itemCode} — ${i.name}` : i.itemCode })),
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
  const [saving, setSaving] = useState(false);
  const lastSubmit = useRef<{ kind: 'component' | 'change'; payload: any } | null>(null);

  const runSave = async (kind: 'component' | 'change', payload: any) => {
    lastSubmit.current = { kind, payload };
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
  const [components, setComponents] = useState<ComponentRec[]>([]);
  const [componentsTotal, setComponentsTotal] = useState(0);
  const [componentsLoading, setComponentsLoading] = useState(false);
  const [compPage, setCompPage] = useState(1);
  const [compPageSize, setCompPageSize] = useState(20);
  const [compSearch, setCompSearch] = useState('');
  const [fCompMachine, setFCompMachine] = useState<string | undefined>(undefined);
  const [fCompType, setFCompType] = useState<string | undefined>(undefined);
  const [compModalOpen, setCompModalOpen] = useState(false);
  const [editingComponent, setEditingComponent] = useState<ComponentRec | null>(null);
  const [compForm] = Form.useForm();
  const [, setCompFormTick] = useState(0);

  // Minimized Window Tabs State
  const [isCompMinimized, setIsCompMinimized] = useState(false);
  const [isChangeMinimized, setIsChangeMinimized] = useState(false);
  const [isInstallMinimized, setIsInstallMinimized] = useState(false);
  const [isDetailMinimized, setIsDetailMinimized] = useState(false);
  const [isHistoryMinimized, setIsHistoryMinimized] = useState(false);

  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyData, setHistoryData] = useState<ComponentHistory | null>(null);

  const fetchComponents = useCallback(
    async (pageNum: number = 1) => {
      setComponentsLoading(true);
      try {
        const params: any = { page: pageNum, limit: compPageSize };
        if (compSearch) params.search = compSearch;
        if (fCompMachine) params.machineId = fCompMachine;
        if (fCompType) params.componentType = fCompType;
        const res = await apiService.get<{ data: ComponentRec[]; total: number }>('/machine-tooling/components', params);
        setComponents(res.data || []);
        setComponentsTotal(res.total || 0);
      } catch (error: any) {
        message.error(extractApiError(error, 'Failed to fetch components'));
      } finally {
        setComponentsLoading(false);
      }
    },
    [compPageSize, compSearch, fCompMachine, fCompType, message],
  );

  useEffect(() => {
    if (activeTab === 'setup') fetchComponents(compPage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, compPage, fetchComponents]);

  const handleCreateComponent = () => {
    setIsCompMinimized(false);
    setEditingComponent(null);
    compForm.resetFields();
    compForm.setFieldsValue({ componentType: 'COMPONENT' });
    setCompModalOpen(true);
  };

  const handleItemSelectChange = (selectedItemId?: string) => {
    if (!selectedItemId) return;
    const item = items.find((i) => i.id === selectedItemId);
    if (item) {
      const uomId = item.baseUomId || item.baseUom?.id;
      const upperName = ((item.name || '') + ' ' + (item.itemCode || '')).toUpperCase();
      let inferredType: string | undefined = undefined;
      if (upperName.includes('DIE')) inferredType = 'DIE';
      else if (upperName.includes('MOULD') || upperName.includes('MOLD')) inferredType = 'MOULD';
      else if (upperName.includes('CHAIN')) inferredType = 'CHAIN';
      else if (upperName.includes('FIXTURE')) inferredType = 'FIXTURE';
      else if (upperName.includes('TOOL') || upperName.includes('BLADE') || upperName.includes('PUNCH') || upperName.includes('ROLLER')) inferredType = 'TOOL';

      compForm.setFieldsValue({
        componentName: item.name || item.itemCode,
        componentCode: item.itemCode,
        ...(uomId ? { uomId } : {}),
        ...(inferredType ? { componentType: inferredType } : {}),
      });
    }
  };

  const handleEditComponent = (record: ComponentRec) => {
    setIsCompMinimized(false);
    setEditingComponent(record);
    compForm.setFieldsValue({
      machineId: record.machineId,
      componentType: record.componentType,
      componentName: record.componentName,
      componentCode: record.componentCode,
      itemId: record.itemId || undefined,
      uomId: record.uomId || undefined,
      expectedLifeQuantity: num(record.expectedLifeQuantity) ?? undefined,
      minThreshold: num(record.minThreshold) ?? undefined,
      maxThreshold: num(record.maxThreshold) ?? undefined,
      description: record.description || undefined,
    });
    setCompModalOpen(true);
  };

  const buildComponentPayload = (values: any): any => ({
    ...values,
    expectedLifeQuantity: values.expectedLifeQuantity != null ? Number(values.expectedLifeQuantity) : undefined,
    minThreshold: values.minThreshold != null ? Number(values.minThreshold) : undefined,
    maxThreshold: values.maxThreshold != null ? Number(values.maxThreshold) : undefined,
  });

  const handleSaveComponent = async () => {
    if (saving) return;
    try {
      const values = await compForm.validateFields();
      await runSave('component', buildComponentPayload(values));
    } catch (err: any) {
      if (err?.errorFields) return;
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
      message.error(extractApiError(error, 'Failed to delete component'));
    }
  };

  const handleViewHistory = async (record: ComponentRec) => {
    setIsHistoryMinimized(false);
    setHistoryOpen(true);
    setHistoryLoading(true);
    setHistoryData(null);
    try {
      const res = await apiService.get<any>(
        `/machine-tooling/components/${record.id}/history`,
        { counter: 'derive' },
      );
      setHistoryData(res?.data ?? res);
    } catch (error: any) {
      message.error(extractApiError(error, 'Failed to load component history'));
      setHistoryOpen(false);
    } finally {
      setHistoryLoading(false);
    }
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

  const componentColumns: ColumnsType<ComponentRec> = [
    {
      title: 'Component', key: 'component', width: 240,
      sorter: (a, b) => a.componentName.localeCompare(b.componentName),
      render: (_, r) => (
        <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.3 }}>
          <span style={{ fontWeight: 600, color: 'var(--theme-text)' }}>{r.componentName}</span>
          <code style={{ fontSize: 11, color: 'var(--theme-text-muted)' }}>{r.componentCode}</code>
        </div>
      ),
    },
    {
      title: 'Machine', key: 'machine', width: 200, sorter: true,
      render: (_, r) => (
        <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.3 }}>
          <span style={{ fontWeight: 500, color: 'var(--theme-text)' }}>{r.machine?.machineCode ?? r.machine?.name ?? '—'}</span>
          {r.machine?.machineNumber && (
            <span style={{ fontSize: 11, color: 'var(--theme-text-muted)' }}>{r.machine.machineNumber}</span>
          )}
        </div>
      ),
    },
    {
      title: 'Type', dataIndex: 'componentType', key: 'componentType', width: 120,
      render: (t: string) => <Tag color={COMPONENT_TYPE_COLORS[t] ?? 'default'}>{t}</Tag>,
    },
    {
      title: 'Expected Life', key: 'expectedLife', width: 120,
      render: (_, r) => (
        <span>
          {fmtNum(r.expectedLifeQuantity)}
          {r.uom?.code ? ` ${r.uom.code}` : ''}
        </span>
      ),
    },
    {
      title: 'Life Window', key: 'thresholds', width: 130,
      render: (_, r) => {
        const lo = num(r.minThreshold);
        const hi = num(r.maxThreshold);
        if (lo === null && hi === null) return EMPTY;
        return <span>{lo !== null ? fmtNum(lo) : '—'} – {hi !== null ? fmtNum(hi) : '—'}</span>;
      },
    },
    {
      title: 'Item', key: 'item', width: 180,
      render: (_, r) =>
        r.item ? (
          <span>
            <code style={{ color: 'var(--theme-accent)' }}>{r.item.itemCode}</code>
            {r.item.name ? <div style={{ fontSize: 11, color: 'var(--theme-text-muted)' }}>{r.item.name}</div> : null}
          </span>
        ) : EMPTY,
    },
    {
      title: 'Status', dataIndex: 'isActive', key: 'status', width: 110,
      render: (v: boolean) => <StatusBadge status={v ? 'ACTIVE' : 'INACTIVE'} />,
    },
    {
      title: 'Actions', key: 'actions', fixed: 'right', width: 240,
      render: (_, r) => (
        <Space size={4}>
          <Tooltip title={`View component — ${r.componentCode}`}>
            <Button
              type="text" size="small" icon={<EyeOutlined />}
              onClick={() => handleViewHistory(r)}
              aria-label={`View component — ${r.componentCode}`}
            />
          </Tooltip>
          <Tooltip title={`Breakdown items — ${r.componentCode}`}>
            <Button
              type="text" size="small" icon={<UnorderedListOutlined />}
              onClick={() => openItems(r)}
              aria-label={`Breakdown items — ${r.componentCode}`}
            />
          </Tooltip>
          <Tooltip title={`Edit component — ${r.componentCode}`}>
            <Button
              type="text" size="small" icon={<EditOutlined />}
              onClick={() => handleEditComponent(r)}
              aria-label={`Edit component — ${r.componentCode}`}
            />
          </Tooltip>
          <Popconfirm
            title={r.isActive ? `Deactivate ${r.componentCode}?` : `Activate ${r.componentCode}?`}
            onConfirm={() => handleToggleComponentStatus(r)}
          >
            <Tooltip title={r.isActive ? 'Deactivate' : 'Activate'}>
              <Button type="text" size="small" danger={r.isActive} style={{ color: r.isActive ? undefined : 'var(--theme-success)' }}>
                {r.isActive ? 'Deactivate' : 'Activate'}
              </Button>
            </Tooltip>
          </Popconfirm>
          <Popconfirm
            title="Delete this component?"
            description="Components with change transactions are deactivated instead of deleted."
            onConfirm={() => handleDeleteComponent(r)}
            okButtonProps={{ danger: true }}
          >
            <Tooltip title={`Delete component — ${r.componentCode}`}>
              <Button type="text" size="small" danger icon={<DeleteOutlined />} aria-label={`Delete component — ${r.componentCode}`} />
            </Tooltip>
          </Popconfirm>
        </Space>
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
    () => (changePickMachine ? componentOptions.filter((c) => c.machineId === changePickMachine) : componentOptions),
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
      if (err?.errorFields) return;
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
      title: 'Date', key: 'date', width: 130, sorter: true,
      render: (_, r) => (
        <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.3 }}>
          <span>{r.changeDate}</span>
          {r.changeTime && <span style={{ fontSize: 11, color: 'var(--theme-text-muted)' }}>{r.changeTime}</span>}
        </div>
      ),
    },
    {
      title: 'Machine', key: 'machine', width: 170,
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
      title: 'Component', key: 'component', width: 200,
      render: (_, r) => (
        <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.3 }}>
          <span style={{ fontWeight: 500 }}>{r.component?.componentName ?? r.componentId}</span>
          <code style={{ fontSize: 11, color: 'var(--theme-text-muted)' }}>{r.component?.componentCode}</code>
        </div>
      ),
    },
    {
      title: 'Tool Change', key: 'toolChange', width: 240,
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
      title: 'Life', key: 'life', width: 110, sorter: true,
      render: (_, r) => fmtNum(r.productionSincePrevious),
    },
    {
      title: 'Condition', dataIndex: 'conditionStatus', key: 'conditionStatus', width: 120,
      render: (v: string | null) =>
        v ? <Tag color={CONDITION_COLORS[v] ?? 'default'}>{v}</Tag> : EMPTY,
    },
    {
      title: 'Job Card', key: 'jobCard', width: 130,
      render: (_, r) => (r.jobCard?.jobCardNo || r.jobCard?.code) ? <code>{r.jobCard?.jobCardNo || r.jobCard?.code}</code> : EMPTY,
    },
    {
      title: 'Actions', key: 'actions', fixed: 'right', width: 120,
      render: (_, r) => (
        <Space size={4}>
          <Tooltip title={`View change — ${r.changeDate} ${r.newToolCode}`}>
            <Button
              type="text" size="small" icon={<EyeOutlined />}
              onClick={() => handleViewChange(r)}
              aria-label={`View change — ${r.changeDate} ${r.newToolCode}`}
            />
          </Tooltip>
          <Tooltip title={`Edit change — ${r.changeDate} ${r.newToolCode}`}>
            <Button
              type="text" size="small" icon={<EditOutlined />}
              onClick={() => openRecordChange(r)}
              aria-label={`Edit change — ${r.changeDate} ${r.newToolCode}`}
            />
          </Tooltip>
          <Popconfirm title="Delete this change transaction?" onConfirm={() => handleDeleteChange(r)} okButtonProps={{ danger: true }}>
            <Tooltip title={`Delete change — ${r.changeDate} ${r.newToolCode}`}>
              <Button type="text" size="small" danger icon={<DeleteOutlined />} aria-label={`Delete change — ${r.changeDate} ${r.newToolCode}`} />
            </Tooltip>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const visibleChangeColumns = useMemo(() => {
    return changeColumns.filter((col) => {
      const k = String(col.key || (col as any).dataIndex || '');
      if (!k) return true;
      return chgVisibleCols[k] !== false;
    });
  }, [changeColumns, chgVisibleCols]);

  /* ── Tab 3: Monthly consumption ──────────────────────────────────────────── */
  const [reportMonth, setReportMonth] = useState<dayjs.Dayjs>(dayjs());
  const [fReportMachine, setFReportMachine] = useState<string | undefined>(undefined);
  const [report, setReport] = useState<MonthlyReport | null>(null);
  const [reportLoading, setReportLoading] = useState(false);

  const fetchReport = useCallback(async () => {
    setReportLoading(true);
    try {
      const params: any = { month: reportMonth.format('YYYY-MM') };
      if (fReportMachine) params.machineId = fReportMachine;
      const res = await apiService.get<{ data: MonthlyReport }>('/machine-tooling/changes/reports/monthly', params);
      setReport(res.data);
      setReportLoading(false);
    } catch (error: any) {
      setReport(null);
      setReportLoading(false);
      message.error(extractApiError(error, 'Failed to load monthly consumption report'));
    }
  }, [reportMonth, fReportMachine, message]);

  useEffect(() => {
    if (activeTab === 'report') fetchReport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, fetchReport]);

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
          new Set((actRes.value.data || []).flatMap((a) => (a.componentId ? [a.componentId] : []))),
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

  const installableComponents = useMemo(() => {
    const base = installPickMachine ? installComponents.filter((c) => c.machineId === installPickMachine) : installComponents;
    return base.filter((c) => !activeComponentIds.has(c.id));
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
      if (err?.errorFields) return;
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
      if (err?.errorFields) return;
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
      if (err?.errorFields) return;
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
      if (err?.errorFields) return;
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
      title: 'Machine', key: 'machine', width: 170,
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
      title: 'Component', key: 'component', width: 210,
      render: (_, r) => (
        <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.3 }}>
          <span style={{ fontWeight: 500 }}>{r.component?.componentName ?? r.componentId}</span>
          <code style={{ fontSize: 11, color: 'var(--theme-text-muted)' }}>{r.component?.componentCode} · {r.component?.componentType}</code>
        </div>
      ),
    },
    {
      title: 'Installed Tool', key: 'tool', width: 220,
      render: (_, r) => (
        <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.3 }}>
          <code style={{ fontWeight: 600, color: 'var(--theme-accent)' }}>{r.installedToolCode}</code>
          {r.newToolDescription && (
            <span style={{ fontSize: 11, color: 'var(--theme-text-muted)' }}>{r.newToolDescription}</span>
          )}
        </div>
      ),
    },
    {
      title: 'Install Date', key: 'installDate', width: 130,
      render: (_, r) => (
        <div style={{ lineHeight: 1.3 }}>
          <span>{r.installDate}</span>
          {r.installTime && <span style={{ fontSize: 11, color: 'var(--theme-text-muted)' }}> {r.installTime}</span>}
        </div>
      ),
    },
    { title: 'Install Counter', key: 'installCounter', width: 120, render: (_, r) => fmtNum(r.installCounter) },
    { title: 'Used', key: 'used', width: 110, render: (_, r) => fmtNum(r.usedByInstalled) },
    {
      title: 'Remaining', key: 'remaining', width: 130,
      render: (_, r) =>
        r.remainingByInstalled != null
          ? `${fmtNum(r.remainingByInstalled)}${r.component?.uomCode ? ` ${r.component.uomCode}` : ''}`
          : EMPTY,
    },
    {
      title: 'Store Issue', key: 'storeIssue', width: 130,
      render: (_, r) => (r.storeIssueNumber ? <code>{r.storeIssueNumber}</code> : EMPTY),
    },
    {
      title: 'Status', key: 'status', width: 100,
      render: () => <StatusBadge status="ACTIVE" />,
    },
    {
      title: 'Actions', key: 'actions', fixed: 'right', width: 110,
      render: (_, r) => (
        <Space size={4}>
          <Tooltip title={`Remove tool ${r.installedToolCode} — ${r.machine?.machineCode ?? ''}`}>
            <Button
              type="link" danger size="small" icon={<SwapRightOutlined />}
              onClick={() => openRemove(r)}
              aria-label={`Remove tool ${r.installedToolCode}`}
            >
              Remove
            </Button>
          </Tooltip>
        </Space>
      ),
    },
  ];

  const lifeColumns: ColumnsType<LifeRowRec> = [
    {
      title: 'Machine', key: 'machine', width: 150,
      render: (_, r) => (
        <div style={{ lineHeight: 1.3 }}>
          <span style={{ fontWeight: 500 }}>{r.machine?.machineCode ?? '—'}</span>
          {r.machine?.machineNumber && <div style={{ fontSize: 11, color: 'var(--theme-text-muted)' }}>{r.machine.machineNumber}</div>}
        </div>
      ),
    },
    {
      title: 'Component', key: 'component', width: 190,
      render: (_, r) => (
        <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.3 }}>
          <span style={{ fontWeight: 500 }}>{r.component?.componentName ?? r.componentId}</span>
          <code style={{ fontSize: 11, color: 'var(--theme-text-muted)' }}>{r.component?.componentCode}</code>
        </div>
      ),
    },
    {
      title: 'Tool', key: 'tool', width: 180,
      render: (_, r) => (
        <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.3 }}>
          <Space size={4}>
            {r.oldToolCode ? <code style={{ fontSize: 11 }}>{r.oldToolCode}</code> : <span style={{ color: 'var(--theme-text-muted)' }}>—</span>}
            <SwapRightOutlined style={{ color: 'var(--theme-text-muted)' }} />
            <code style={{ fontWeight: 600, color: 'var(--theme-accent)' }}>{r.toolCode}</code>
          </Space>
          {r.newToolDescription && <span style={{ fontSize: 11, color: 'var(--theme-text-muted)' }}>{r.newToolDescription}</span>}
        </div>
      ),
    },
    {
      title: 'Installed', key: 'installed', width: 120,
      render: (_, r) => `${r.installDate}${r.installTime ? ` ${r.installTime}` : ''}`,
    },
    {
      title: 'Removed', key: 'removed', width: 110,
      render: (_, r) => r.removeDate || EMPTY,
    },
    {
      title: 'Production Life', key: 'life', width: 130, sorter: true,
      render: (_, r) =>
        r.productionLife != null ? `${fmtNum(r.productionLife)}${r.component?.uomCode ? ` ${r.component.uomCode}` : ''}` : EMPTY,
    },
    {
      title: 'Condition', key: 'condition', width: 110,
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
      title: 'Store Issue', key: 'storeIssue', width: 120,
      render: (_, r) => (r.storeIssueNumber ? <code>{r.storeIssueNumber}</code> : EMPTY),
    },
    {
      title: 'Job Card', key: 'jobCard', width: 110,
      render: (_, r) => (r.jobCardNo ? <code>{r.jobCardNo}</code> : EMPTY),
    },
    {
      title: 'Status', key: 'status', width: 100,
      render: (_, r) => <StatusBadge status={r.status} />,
    },
    {
      title: 'Actions', key: 'actions', fixed: 'right', width: 110,
      render: (_, r) => (
        <Space size={4}>
          {r.status === 'CLOSED' ? (
            <Tooltip title={r.dispositionType ? 'Update disposition' : `Record disposition for ${r.toolCode}`}>
              <Button
                type="link" size="small" icon={<EditOutlined />}
                onClick={() => openDispose(r)}
                aria-label={`Dispose tool ${r.toolCode}`}
              >
                Dispose
              </Button>
            </Tooltip>
          ) : (
            <StatusBadge status="ACTIVE" />
          )}
        </Space>
      ),
    },
  ];

  const reportColumns: ColumnsType<ReportRow> = [
    {
      title: 'Machine', key: 'machine', width: 200,
      render: (_, r) => (
        <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.3 }}>
          <span style={{ fontWeight: 500 }}>{r.machine?.machineCode ?? '—'}</span>
          {r.machine?.machineName && (
            <span style={{ fontSize: 11, color: 'var(--theme-text-muted)' }}>{r.machine.machineName}</span>
          )}
        </div>
      ),
    },
    {
      title: 'Component', key: 'component', width: 240,
      render: (_, r) => (
        <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.3 }}>
          <span style={{ fontWeight: 500 }}>{r.component?.componentName}</span>
          <code style={{ fontSize: 11, color: 'var(--theme-text-muted)' }}>
            {r.component?.componentCode} · {r.component?.componentType} {r.component?.uomCode ? `· ${r.component.uomCode}` : ''}
          </code>
        </div>
      ),
    },
    { title: 'Changes', dataIndex: 'changes', key: 'changes', width: 90 },
    { title: 'Qty Used', dataIndex: 'qtyUsed', key: 'qtyUsed', width: 100 },
    { title: 'Production Covered', dataIndex: 'productionCovered', key: 'productionCovered', width: 150, render: fmtNum },
    { title: 'Avg Life', dataIndex: 'avgLife', key: 'avgLife', width: 110, render: fmtNum },
    {
      title: 'Life Range', key: 'lifeRange', width: 130,
      render: (_, r) => `${fmtNum(r.minLife)} – ${fmtNum(r.maxLife)}`,
    },
    { title: 'Last Change', dataIndex: 'lastChangeDate', key: 'lastChangeDate', width: 120, render: (v: string | null) => v || EMPTY },
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
          : null;

  useEffect(() => {
    const { setHeaderMeta, clearHeaderMeta } = useHeaderActions.getState();
    setHeaderMeta(
      <Space align="center" size={10}>
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
            fontSize: 12,
            fontWeight: 700,
          }}
        >
          Enterprise 2027
        </span>
      </Space>,
      `Track tool / die / mould life per machine, record changes, and review monthly consumption · ${componentsTotal} components`,
      <ToolOutlined />,
      <Space size={8}>
        <Button
          icon={<ReloadOutlined />}
          title="Refresh current tab data"
          onClick={() => {
            if (activeTab === 'setup') fetchComponents(compPage);
            else if (activeTab === 'changes') fetchChanges(chgPage);
            else if (activeTab === 'active') fetchActiveTools(atPage);
            else if (activeTab === 'life') fetchLifeReport(lifePage);
            else if (activeTab === 'report') fetchReport();
          }}
        />
        {primaryAdd?.show && (
          <Button
            type="primary"
            icon={primaryAdd.icon}
            onClick={primaryAdd.onClick}
            style={{
              borderRadius: 6,
              fontWeight: 600,
              background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
              borderColor: '#059669',
              boxShadow: '0 2px 8px rgba(16, 185, 129, 0.35)',
            }}
          >
            {primaryAdd.label}
          </Button>
        )}
      </Space>,
    );
    return () => clearHeaderMeta();
  }, [
    primaryAdd, activeTab, componentsTotal,
    compPage, chgPage, atPage, lifePage, fetchComponents, fetchChanges,
    fetchActiveTools, fetchLifeReport, fetchReport,
  ]);

  return (
    <div>
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
        subtitle={`Track tool / die / mould life per machine, record changes, and review monthly consumption · ${componentsTotal} components`}
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
            padding: '6px 6px 8px 6px',
            scrollbarWidth: 'thin',
            background: '#f8fafc',
            borderBottom: '1px solid #e2e8f0',
          }}
        >
          {[
            { key: 'setup', label: 'Tool & Component Setup', icon: <ToolOutlined />, color: '#334155', activeBg: '#1e293b', count: componentsTotal },
            { key: 'changes', label: 'Change History', icon: <HistoryOutlined />, color: '#16a34a', activeBg: '#15803d', count: changesTotal },
            ...(can('manufacturing.component_change.view') ? [{ key: 'active', label: 'Active Tools', icon: <CheckCircleOutlined />, color: '#0284c7', activeBg: '#0369a1', count: activeToolsTotal }] : []),
            ...(can('manufacturing.component_change.view') ? [{ key: 'life', label: 'Tool Life History', icon: <HistoryOutlined />, color: '#d97706', activeBg: '#b45309', count: lifeTotal }] : []),
            { key: 'report', label: 'Monthly Consumption', icon: <BarChartOutlined />, color: '#7c3aed', activeBg: '#6d28d9', count: null },
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
                  gap: 8,
                  padding: isFirst
                    ? '10px 22px 10px 16px'
                    : isLast
                    ? '10px 18px 10px 24px'
                    : '10px 20px 10px 24px',
                  marginLeft: isFirst ? 0 : -6,
                  zIndex: isSelected ? 12 : arr.length - idx,
                  fontSize: 12.5,
                  fontWeight: 700,
                  letterSpacing: '0.4px',
                  whiteSpace: 'nowrap',
                  border: 'none',
                  outline: 'none',
                  cursor: 'pointer',
                  clipPath,
                  transition: 'all 0.18s cubic-bezier(0.4, 0, 0.2, 1)',
                  background: isSelected
                    ? `linear-gradient(135deg, ${tab.activeBg} 0%, ${tab.color} 100%)`
                    : 'linear-gradient(135deg, #ffffff 0%, #f1f5f9 100%)',
                  color: isSelected ? '#ffffff' : '#334155',
                  boxShadow: isSelected
                    ? `0 4px 14px ${tab.color}55, inset 0 0 0 1.5px rgba(255,255,255,0.3)`
                    : 'inset 0 0 0 1px #e2e8f0',
                  transform: isSelected ? 'scale(1.025)' : 'scale(1)',
                }}
              >
                <span style={{ fontSize: 14, display: 'flex', alignItems: 'center' }}>{tab.icon}</span>
                <span>{tab.label}</span>
                {tab.count !== null && (
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      minWidth: 22,
                      height: 20,
                      padding: '0 6px',
                      borderRadius: 10,
                      fontSize: 11,
                      fontWeight: 800,
                      background: isSelected ? 'rgba(255, 255, 255, 0.28)' : '#e2e8f0',
                      color: isSelected ? '#ffffff' : '#475569',
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
          <>
            <div style={{ padding: '8px 10px', borderBottom: '1px solid var(--theme-border, rgba(148, 163, 184, 0.12))' }}>
              <TableToolbar
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
                    options: COMPONENT_TYPES.map((t) => ({ value: t, label: t })),
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
                onRefresh={() => fetchComponents(compPage)}
                primaryAction={
                  can('manufacturing.tool_component.create')
                    ? { label: 'Add Tool / Component', icon: <PlusOutlined />, onClick: handleCreateComponent }
                    : undefined
                }
              />
            </div>
            <div style={{ width: '100%', overflowX: 'auto' }}>
              <ERPTable
                columns={visibleComponentColumns}
                dataSource={components}
                rowKey="id"
                loading={componentsLoading}
                scroll={{ x: 1300 }}
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
          </>
        )}

        {activeTab === 'changes' && (
          <>
            <div style={{ padding: '8px 10px', borderBottom: '1px solid var(--theme-border, rgba(148, 163, 184, 0.12))' }}>
              <TableToolbar
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
                onRefresh={() => fetchChanges(chgPage)}
                primaryAction={
                  can('manufacturing.component_change.create')
                    ? { label: 'Record Change', icon: <PlusOutlined />, onClick: () => openRecordChange(null) }
                    : undefined
                }
              />
            </div>
            <div style={{ width: '100%', overflowX: 'auto' }}>
              <ERPTable
                columns={visibleChangeColumns}
                dataSource={changes}
                rowKey="id"
                loading={changesLoading}
                scroll={{ x: 1300 }}
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
                left={
                  <Space size={8}>
                    <DatePicker picker="month" value={reportMonth} onChange={(d) => d && setReportMonth(d)} allowClear={false} />
                    <Select
                      placeholder="All machines"
                      allowClear
                      value={fReportMachine}
                      onChange={(v) => setFReportMachine(v)}
                      style={{ width: 220 }}
                      options={machineOptions}
                    />
                  </Space>
                }
                right={
                  <Button icon={<ReloadOutlined />} onClick={fetchReport}>
                    Refresh
                  </Button>
                }
              />
            </div>
            <div style={{ padding: '12px 14px 0', display: 'flex', flexWrap: 'wrap', gap: 24 }}>
              <Statistic title="Month" value={reportMonth.format('MMMM YYYY')} />
              <Statistic title="Machines" value={report?.totals.machines ?? 0} />
              <Statistic title="Component Lines" value={report?.totals.components ?? 0} />
              <Statistic title="Changes" value={report?.totals.changes ?? 0} />
              <Statistic title="Tools Installed" value={report?.totals.qtyUsed ?? 0} />
              <Statistic title="Production Covered" value={fmtNum(report?.totals.productionCovered)} />
            </div>
            <Alert
              style={{ margin: '10px 14px' }}
              type="info"
              showIcon
              message="Derived production quantities"
              description="Machines have no native counter in the ERP; production-covered figures are computed from recorded counter snapshots between changes."
            />
            <div style={{ width: '100%', overflowX: 'auto' }}>
              <ERPTable
                columns={reportColumns}
                dataSource={report?.rows ?? []}
                rowKey={(r) => `${r.machine?.id ?? '?'}-${r.component?.id ?? '?'}`}
                loading={reportLoading}
                scroll={{ x: 1300 }}
                containerStyle={{ border: 'none', borderRadius: 0, boxShadow: 'none' }}
                pagination={false}
                emptyTitle="No consumption for this month"
                emptyDescription="Record component changes in the selected month to see the consumption report."
              />
            </div>
          </>
        )}

        {activeTab === 'active' && (
          <>
            <div style={{ padding: '8px 10px', borderBottom: '1px solid var(--theme-border, rgba(148, 163, 184, 0.12))' }}>
              <TableToolbar
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
                onRefresh={() => fetchActiveTools(atPage)}
                primaryAction={
                  can('manufacturing.component_change.create')
                    ? { label: 'Install Tool', icon: <PlusOutlined />, onClick: openInstall }
                    : undefined
                }
              />
            </div>
            <div style={{ padding: '12px 14px 0', display: 'flex', flexWrap: 'wrap', gap: 24 }}>
              <Statistic title="Active Tools" value={activeToolsTotal} />
              <Statistic title="Active Machines" value={new Set(activeTools.map((a) => a.machineId)).size} />
            </div>
            <Alert
              style={{ margin: '10px 14px' }}
              type="info"
              showIcon
              message="Derived production counters"
              description="Machines have no native counter in the ERP. Used / remaining production life per installed tool is DERIVED from SUM(production_entries.actual_quantity) up to the current date, compared against the install counter and the component's expected life."
            />
            <div style={{ width: '100%', overflowX: 'auto' }}>
              <ERPTable
                columns={activeToolColumns}
                dataSource={activeTools}
                rowKey="id"
                loading={activeToolsLoading}
                scroll={{ x: 1500 }}
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
                      { value: 'CLOSED', label: 'CLOSED' },
                    ],
                    onChange: (v) => { setFLifeStatus(v); setLifePage(1); },
                    width: 120,
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
                onRefresh={() => fetchLifeReport(lifePage)}
                primaryAction={
                  can('manufacturing.component_change.create')
                    ? { label: 'Record Disposition', icon: <EditOutlined />, onClick: () => setActiveTab('active') }
                    : undefined
                }
              />
            </div>
            <div style={{ padding: '12px 14px 0', display: 'flex', flexWrap: 'wrap', gap: 24 }}>
              <Statistic title="Installs" value={lifeSummary?.installs ?? 0} />
              <Statistic title="Active" value={lifeSummary?.active ?? 0} />
              <Statistic title="Closed" value={lifeSummary?.closed ?? 0} />
              <Statistic title="With Disposition" value={lifeSummary?.withDisposition ?? 0} />
              <Statistic title="Total Production Life" value={fmtNum(lifeSummary?.totalProductionLife)} />
              <Statistic title="Avg Life" value={fmtNum(lifeSummary?.avgLife)} />
            </div>
            <Alert
              style={{ margin: '10px 14px' }}
              type="info"
              showIcon
              message="Automatic production life"
              description="Production life = DERIVED counter at removal − counter at install (SUM of production_entries.actual_quantity up to each date). Manual snapshot counters override the derivation when provided. Record the disposition of closed tools to complete the lifecycle."
            />
            <div style={{ width: '100%', overflowX: 'auto' }}>
              <ERPTable
                columns={lifeColumns}
                dataSource={lifeRows}
                rowKey="id"
                loading={lifeLoading}
                scroll={{ x: 1600 }}
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
      {(() => {
        const liveCompValues = compForm.getFieldsValue();
        const liveCompMachine = machines.find((m) => m.id === liveCompValues.machineId);
        const liveCompStoreItem = items.find((i) => i.id === liveCompValues.itemId);
        const liveCompUom = uoms.find((u) => u.id === liveCompValues.uomId);

        return (
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
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <ToolOutlined style={{ color: 'var(--theme-accent, #10b981)' }} />
                {editingComponent ? `Edit Component — ${editingComponent.componentCode}` : 'Add Tool / Component'}
              </span>
            }
            subtitle="Track a tool, die, mould or component on a machine with its expected life"
            styles={{ body: { overflow: 'hidden', padding: '16px' } }}
          >
            <div style={{ display: 'flex', gap: 20, height: '100%', alignItems: 'stretch' }}>
              {/* Left Column: Form Inputs */}
              <div style={{ flex: '1 1 58%', minWidth: 0, overflowY: 'auto', paddingRight: 16, borderRight: '1px solid var(--theme-border, #e2e8f0)' }}>
                <Form
                  form={compForm}
                  layout="vertical"
                  style={{ paddingTop: 4 }}
                  onValuesChange={() => setCompFormTick((t) => t + 1)}
                >
                  <Row gutter={16}>
                    <Col span={24}>
                      <div
                        style={{
                          background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.08) 0%, rgba(59, 130, 246, 0.08) 100%)',
                          padding: '12px 14px',
                          borderRadius: 8,
                          marginBottom: 16,
                          border: '1px solid rgba(16, 185, 129, 0.25)',
                        }}
                      >
                        <Form.Item
                          name="itemId"
                          label={
                            <Space size={6}>
                              <span style={{ fontWeight: 600 }}>Store Item / Product Master</span>
                              <Tag color="success" style={{ fontSize: 11, lineHeight: '18px', padding: '0 6px', margin: 0 }}>
                                ⚡ Auto-fills Code, Name & UOM
                              </Tag>
                            </Space>
                          }
                          style={{ marginBottom: 0 }}
                          tooltip="Select an item from Store / Item Master to automatically populate the tooling code, name, and production unit"
                        >
                          <Select
                            showSearch
                            optionFilterProp="label"
                            allowClear
                            placeholder="Search & Select Store Item (e.g. Die, Mould, Punch, Spare Part)"
                            options={itemOptions}
                            onChange={handleItemSelectChange}
                            size="large"
                          />
                        </Form.Item>
                      </div>
                    </Col>
                    <Col span={12}>
                      <Form.Item name="machineId" label="Machine" rules={[{ required: true, message: 'Machine is required' }]}>
                        <Select showSearch optionFilterProp="label" placeholder="Select machine" options={machineOptions} />
                      </Form.Item>
                    </Col>
                    <Col span={12}>
                      <Form.Item name="componentType" label="Component Type" rules={[{ required: true }]}>
                        <Select options={COMPONENT_TYPES.map((t) => ({ value: t, label: t }))} />
                      </Form.Item>
                    </Col>
                    <Col span={12}>
                      <Form.Item name="componentName" label="Component Name" rules={[{ required: true, message: 'Name is required' }]}>
                        <Input placeholder="e.g. Thread Die 12 mm" />
                      </Form.Item>
                    </Col>
                    <Col span={12}>
                      <Form.Item name="componentCode" label="Component Code" rules={[{ required: true, message: 'Code is required' }]}>
                        <Input placeholder="e.g. TD-012" />
                      </Form.Item>
                    </Col>
                    <Col span={12}>
                      <Form.Item name="uomId" label="Production UOM (optional)">
                        <Select showSearch optionFilterProp="label" allowClear placeholder="Select UOM" options={uomOptions} />
                      </Form.Item>
                    </Col>
                    <Col span={12}>
                      <Form.Item name="expectedLifeQuantity" label="Expected Life (PCS / Output)" tooltip="Expected productive life in produced quantity">
                        <InputNumber min={0.0001} step={0.0001} style={{ width: '100%' }} placeholder="e.g. 50000" />
                      </Form.Item>
                    </Col>
                    <Col span={12}>
                      <Form.Item name="minThreshold" label="Min. Threshold">
                        <InputNumber min={0} style={{ width: '100%' }} placeholder="Replacement window lower bound" />
                      </Form.Item>
                    </Col>
                    <Col span={12}>
                      <Form.Item name="maxThreshold" label="Max. Threshold">
                        <InputNumber min={0} style={{ width: '100%' }} placeholder="Replacement window upper bound" />
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
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 10px', background: 'rgba(99, 102, 241, 0.1)', border: '1px solid rgba(99, 102, 241, 0.25)', borderRadius: 20, color: '#6366f1', fontSize: 11, fontWeight: 600, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 14, alignSelf: 'flex-start' }}>
                    <EyeOutlined /> Live Detail Sheet
                  </div>

                  <div style={{ marginBottom: 12, display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                    <Tag color="geekblue" style={{ fontSize: 13, padding: '3px 10px', borderRadius: 16, fontWeight: 700 }}>
                      {liveCompValues.componentCode || (editingComponent ? editingComponent.componentCode : 'TOOL-CODE')}
                    </Tag>
                    <Tag color={COMPONENT_TYPE_COLORS[liveCompValues.componentType || 'COMPONENT'] || 'default'} style={{ fontSize: 12, padding: '2px 8px', borderRadius: 12 }}>
                      {liveCompValues.componentType || 'COMPONENT'}
                    </Tag>
                  </div>

                  <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--theme-text, #1e293b)', marginBottom: 4 }}>
                    {liveCompValues.componentName || 'New Tool / Component Name'}
                  </div>

                  <div style={{ fontSize: 12, color: 'var(--theme-text-muted, #64748b)', marginBottom: 14 }}>
                    Machine: <strong>{liveCompMachine ? `${liveCompMachine.machineCode} — ${liveCompMachine.name}` : 'No Machine Assigned'}</strong>
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
            </div>
          </DraggableResizableModal>
        );
      })()}

      {/* Component history / stats modal */}
      <DraggableResizableModal
        open={historyOpen}
        onCancel={() => setHistoryOpen(false)}
        onMinimize={() => {
          setHistoryOpen(false);
          setIsHistoryMinimized(true);
        }}
        width={820}
        height={640}
        minWidth={640}
        minHeight={480}
        footer={<Button type="primary" onClick={() => setHistoryOpen(false)}>Close</Button>}
        title={
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <HistoryOutlined style={{ color: 'var(--theme-accent, #10b981)' }} />
            Component Replacement History
          </span>
        }
        subtitle={historyData ? `${historyData.component.componentName} — ${historyData.component.componentCode}` : 'Loading...'}
        styles={{ body: { overflow: 'auto' } }}
      >
        {historyLoading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
            <Spin tip="Loading history..." />
          </div>
        ) : historyData ? (
          <div>
            <Alert
              style={{ marginBottom: 14 }}
              type="info"
              showIcon
              message="Machines have no native counter in the ERP"
              description={`Current counter is DERIVED as the SUM of production entry actual quantities (${fmtNum(historyData.counter.value)}). Use recorded counter snapshots for exact life between changes.`}
            />
            <Row gutter={16}>
              <Col span={12}>
                <Descriptions column={1} size="small" bordered
                  items={[
                    { key: 'machine', label: 'Machine', children: `${historyData.machine.machineCode ?? '—'} ${historyData.machine.machineNumber ?? ''} ${historyData.machine.name ?? ''}`.trim() || '—' },
                    { key: 'life', label: 'Expected Life', children: fmtNum(historyData.summary.expectedLifeQuantity) },
                    { key: 'window', label: 'Window', children: `${fmtNum(historyData.summary.minThreshold)} – ${fmtNum(historyData.summary.maxThreshold)}` },
                    { key: 'changes', label: 'Total Changes', children: historyData.summary.totalChanges },
                    { key: 'first', label: 'First Change', children: historyData.summary.firstChangeDate || '—' },
                    { key: 'last', label: 'Last Change', children: historyData.summary.lastChangeDate || '—' },
                  ]}
                />
              </Col>
              <Col span={12}>
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
            <div style={{ padding: '14px 2px 6px', fontWeight: 600, color: 'var(--theme-text)' }}>
              Change History ({historyData.changes.length})
            </div>
            <ERPTable
              columns={[
                { title: 'Date', key: 'date', width: 110, render: (_, r) => `${r.changeDate}${r.changeTime ? ` ${r.changeTime}` : ''}` },
                { title: 'Tool', key: 'tool', width: 180, render: (_, r) => `${r.oldToolCode || '—'} → ${r.newToolCode}` },
                { title: 'Counter Before', key: 'cb', width: 130, render: (_, r) => fmtNum(r.productionCounterBefore) },
                { title: 'Counter After', key: 'ca', width: 130, render: (_, r) => fmtNum(r.productionCounterAfter) },
                { title: 'Life', key: 'life', width: 110, render: (_, r) => fmtNum(r.productionSincePrevious) },
                { title: 'Reason', key: 'reason', width: 160, render: (_, r) => r.reason || EMPTY },
              ]}
              dataSource={historyData.changes}
              rowKey="id"
              size="small"
              pagination={false}
              scroll={{ x: 900 }}
              containerStyle={{ border: 'none', boxShadow: 'none' }}
            />
          </div>
        ) : null}
      </DraggableResizableModal>

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
                    label: `${c.componentCode} — ${c.componentName} (${c.componentType})`,
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
            <Spin tip="Loading change details..." />
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
                  Pieces Produced (Life)
                </div>
                <div style={{ fontSize: 20, fontWeight: 700, color: '#4f46e5', marginTop: 2 }}>
                  {fmtNum(changeDetail.productionSincePrevious)} <span style={{ fontSize: 12, fontWeight: 500 }}>PCS</span>
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
              description={
                changeDetail.productionCounterBefore != null && changeDetail.productionCounterAfter != null
                  ? `This change closed ${fmtNum(changeDetail.productionSincePrevious)} of production for the previous tool (counter ${fmtNum(changeDetail.productionCounterBefore)} − previous install ${fmtNum(changeDetail.productionCounterAfter)}) — ${fmtNum(changeDetail.productionSincePrevious)} Pieces produced by this machine during this tool run.`
                  : `This change closed ${fmtNum(changeDetail.productionSincePrevious)} of production — Total machine output: ${fmtNum(changeDetail.productionSincePrevious)} Pieces.`
              }
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
                { key: 'life', label: 'Pieces Produced', children: <strong style={{ color: '#4f46e5' }}>{fmtNum(changeDetail.productionSincePrevious)} PCS</strong> },
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
                    label: `${c.componentCode} — ${c.componentName} (${c.componentType})`,
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
              <Form.Item name="storeIssueId" label="Store Issue (posted)" tooltip="Optional — links this install to the existing store issue that supplied the tool (reuses stock, no duplicate balances)">
                <Select showSearch optionFilterProp="label" allowClear placeholder="Select posted store issue" options={storeIssueOptions} />
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
              { key: 'storeIssue', label: 'Store Issue', children: removeTarget.storeIssueNumber || '—' },
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
          loading={itemsLoading}
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
    </div>
  );
};

export default MachineToolingManagement;