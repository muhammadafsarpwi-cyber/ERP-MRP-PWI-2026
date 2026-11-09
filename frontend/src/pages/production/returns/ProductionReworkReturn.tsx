import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Table, Card, Row, Col, Select, Input, InputNumber, Button, Tag, Space,
  App, Modal, Form, DatePicker, Tooltip, Badge, theme, Tabs, Typography, Divider, Alert, Popconfirm, Segmented,
} from 'antd';
import {
  RollbackOutlined, ReloadOutlined, FileExcelOutlined, SearchOutlined,
  PlusOutlined, CheckCircleOutlined, ClockCircleOutlined, SyncOutlined,
  CloseCircleOutlined, ArrowRightOutlined, ToolOutlined,
  ExclamationCircleOutlined, ThunderboltOutlined, CopyOutlined, PrinterOutlined, EyeOutlined,
  EditOutlined, DeleteOutlined,
  RiseOutlined, BarChartOutlined, DashboardOutlined,
} from '@ant-design/icons';
import {
  ResponsiveContainer, BarChart, Bar, LineChart, Line, XAxis, YAxis,
  CartesianGrid, Tooltip as RechartsTooltip, Legend,
} from 'recharts';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import apiService from '../../../services/api';
import { formatNumber, formatDecimal } from '../../../utils/numberFormat';
import GlobalLoading from '../../../components/shared/GlobalLoading';
import PageHeader from '../../../components/shared/PageHeader';
import { CANONICAL_STAGE_ITEMS } from './spokeStageItems';

const { Text } = Typography;

export interface ReworkReturnRecord {
  id: string;
  companyId: string;
  returnNumber: string;
  returnDate: string;
  divisionId: string;
  division?: { id: string; name: string; divisionCode: string };
  fromDepartmentId: string;
  fromDepartment?: { id: string; name: string; departmentCode: string };
  toDepartmentId: string;
  toDepartment?: { id: string; name: string; departmentCode: string };
  fromMachineId?: string | null;
  fromMachine?: { id: string; name: string; code: string } | null;
  toMachineId?: string | null;
  toMachine?: { id: string; name: string; code: string } | null;
  itemId: string;
  item?: { id: string; name: string; itemCode: string };
  uomId: string;
  uom?: { id: string; name: string; code: string };
  quantity: number;
  quantityPcs?: number | null;
  quantityGrs?: number | null;
  defectReason: string;
  defectDescription?: string | null;
  correctiveAction: string;
  priority: 'NORMAL' | 'HIGH' | 'URGENT';
  status: 'DISPATCHED' | 'ACKNOWLEDGED' | 'IN_REWORK' | 'RECTIFIED' | 'SCRAPPED' | 'CLOSED';
  returnedBy?: string | null;
  receivedBy?: string | null;
  rectifiedQuantity: number;
  scrappedQuantity: number;
  isRework: boolean;
  remarks?: string | null;
  createdAt: string;
  updatedAt: string;
}

const DEFECT_REASONS: Record<string, { label: string; color: string }> = {
  PLATING_PEELING: { label: 'Plating Peeling / Blistering', color: 'volcano' },
  DULL_PLATING: { label: 'Dull / Uneven Plating', color: 'gold' },
  RUST_OXIDATION: { label: 'Surface Rust / Oxidation', color: 'red' },
  BENT_WIRE: { label: 'Bent Wire / Curvature Issue', color: 'orange' },
  HEAD_BURR: { label: 'Head Off-center / Burr', color: 'purple' },
  THREAD_DEFECT: { label: 'Thread Stripped / Damaged', color: 'magenta' },
  DIMENSION_MISMATCH: { label: 'Dimension / Length Variation', color: 'blue' },
  MIXED_ITEMS: { label: 'Wrong Item / Size Mix-up', color: 'cyan' },
  OTHER: { label: 'Other Shopfloor Defect', color: 'default' },
};

const CORRECTIVE_ACTIONS: Record<string, string> = {
  REPLATE: 'Chemical Strip & Re-Plate',
  RE_STRAIGHTEN: 'Re-Straighten Wire',
  RE_THREAD: 'Re-Thread Spoke / Nipple',
  RE_INSPECT: '100% Sorting & Re-Inspection',
  SCRAP: 'Declare Scrap / Non-reworkable',
  REWORK: 'General Rework',
};

const ProductionReworkReturn: React.FC = () => {
  const { token } = theme.useToken();
  const { message } = App.useApp();

  // State
  const [loading, setLoading] = useState(false);
  const [records, setRecords] = useState<ReworkReturnRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [summary, setSummary] = useState<any>(null);

  // Filters
  const [selectedDivision, setSelectedDivision] = useState<string | undefined>(undefined);
  const [selectedFromDept, setSelectedFromDept] = useState<string | undefined>(undefined);
  const [selectedToDept, setSelectedToDept] = useState<string | undefined>(undefined);
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

const CANONICAL_DIVISIONS = [
  { id: 'd1000000-0000-0000-0000-000000000001', divisionCode: 'DIV-SPD', name: 'Spoke Division' },
  { id: 'd1000000-0000-0000-0000-000000000002', divisionCode: 'DIV-CCD', name: 'Control Cable Division' },
  { id: '83ecd746-1cc9-4849-bec4-d00bcc3ceeec', divisionCode: 'DIV-PWI', name: 'Main Division E-51' },
  { id: '0653339b-94d0-4cc5-b880-e07908b2015f', divisionCode: 'DIV-NB', name: 'NB Division' },
];

const CANONICAL_DEPARTMENTS = [
  { id: 'd3000000-0000-0000-0000-000000000008', name: 'Spoke Packing', departmentCode: 'SPD-DEPT008', divisionId: 'd1000000-0000-0000-0000-000000000001' },
  { id: 'd3000000-0000-0000-0000-000000000006', name: 'Spoke Plating', departmentCode: 'SPD-DEPT006', divisionId: 'd1000000-0000-0000-0000-000000000001' },
  { id: 'd3000000-0000-0000-0000-000000000003', name: 'Spoke', departmentCode: 'SPD-DEPT003', divisionId: 'd1000000-0000-0000-0000-000000000001' },
  { id: 'd3000000-0000-0000-0000-000000000004', name: 'Header', departmentCode: 'SPD-DEPT004', divisionId: 'd1000000-0000-0000-0000-000000000001' },
  { id: 'd3000000-0000-0000-0000-000000000002', name: 'Swagging', departmentCode: 'SPD-DEPT002', divisionId: 'd1000000-0000-0000-0000-000000000001' },
  { id: 'd3000000-0000-0000-0000-000000000001', name: 'Straightener', departmentCode: 'SPD-DEPT001', divisionId: 'd1000000-0000-0000-0000-000000000001' },
  { id: 'd3000000-0000-0000-0000-000000000007', name: 'Nipple Plating', departmentCode: 'SPD-DEPT007', divisionId: 'd1000000-0000-0000-0000-000000000001' },
  { id: 'd3000000-0000-0000-0000-000000000005', name: 'Nipple', departmentCode: 'SPD-DEPT005', divisionId: 'd1000000-0000-0000-0000-000000000001' },
  { id: 'fd474329-e796-4343-831b-f95a9add41f0', name: 'Nipple Packing', departmentCode: 'SPI-NP-002', divisionId: 'd1000000-0000-0000-0000-000000000001' },
  { id: 'f8312f0c-ba1e-401a-80cd-43d6b5cc8c05', name: 'Raw Material (RM)', departmentCode: 'SPI-DEPT112', divisionId: 'd1000000-0000-0000-0000-000000000001' },
];

const DEFAULT_UOMS = [
  { id: 'b932052f-141f-4d78-9baf-7025e5302442', code: 'PCS', name: 'Pieces' },
  { id: 'c3f9c90e-1e97-4564-8e4e-36a676bdc57e', code: 'GRS', name: 'Gross' },
  { id: '044b1a9c-1230-450e-a38b-a8a7493c6c48', code: 'KG', name: 'Kilograms' },
];

  // Dropdown reference options
  const [divisions, setDivisions] = useState<any[]>(CANONICAL_DIVISIONS);
  const [departments, setDepartments] = useState<any[]>(CANONICAL_DEPARTMENTS);
  const [items, setItems] = useState<any[]>([]);
  const [stageItems, setStageItems] = useState<any[]>(CANONICAL_STAGE_ITEMS);
  const [uoms, setUoms] = useState<any[]>(DEFAULT_UOMS);

  // Dynamic Lookup Options (with user Add New support)
  const [defectReasonOptions, setDefectReasonOptions] = useState<any[]>(
    Object.entries(DEFECT_REASONS).map(([k, v]) => ({ value: k, label: v.label, color: v.color }))
  );
  const [correctiveActionOptions, setCorrectiveActionOptions] = useState<any[]>(
    Object.entries(CORRECTIVE_ACTIONS).map(([k, v]) => ({ value: k, label: v }))
  );
  const [newReasonInput, setNewReasonInput] = useState('');
  const [newActionInput, setNewActionInput] = useState('');
  const [addingReason, setAddingReason] = useState(false);
  const [addingAction, setAddingAction] = useState(false);
  const [activeTrendTab, setActiveTrendTab] = useState<'daily' | 'monthly' | 'plating'>('daily');

  // Modals
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [statusModalOpen, setStatusModalOpen] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState<ReworkReturnRecord | null>(null);
  const [detailModalOpen, setDetailModalOpen] = useState(false);

  const [createForm] = Form.useForm();
  const [editForm] = Form.useForm();
  const [statusForm] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);

  // Form watches for cascading filters in create modal
  const modalDivisionId = Form.useWatch('divisionId', createForm);
  const modalFromDeptId = Form.useWatch('fromDepartmentId', createForm);
  const modalToDeptId = Form.useWatch('toDepartmentId', createForm);
  const modalItemId = Form.useWatch('itemId', createForm);

  // Form watches for cascading filters in edit modal
  const modalEditToDeptId = Form.useWatch('toDepartmentId', editForm);
  const modalEditItemId = Form.useWatch('itemId', editForm);

  // Fetch Stage Components & WIP Items tailored to Division & Routing
  const fetchStageItems = useCallback(async (divId?: string, fromId?: string, toId?: string) => {
    try {
      const res = await apiService.get<any>('/production/rework-returns/stage-items', {
        divisionId: divId,
        fromDepartmentId: fromId,
        toDepartmentId: toId,
      });
      if (res && res.success && Array.isArray(res.data) && res.data.length > 0) {
        setStageItems(res.data);
      }
    } catch (err) {
      console.warn('Failed to load stage items from API:', err);
    }
  }, []);

  // Trigger stage items fetch when modal routing changes
  useEffect(() => {
    if (createModalOpen) {
      fetchStageItems(modalDivisionId, modalFromDeptId, modalToDeptId);
    }
  }, [createModalOpen, modalDivisionId, modalFromDeptId, modalToDeptId, fetchStageItems]);

  // Departments for modal (strictly filtered to selected Division, shopfloor only)
  const modalDepartments = useMemo(() => {
    if (!modalDivisionId) {
      return departments.filter(d => !d.departmentCode?.startsWith('CENT-'));
    }
    const filtered = departments.filter(d =>
      d.divisionId === modalDivisionId &&
      !d.departmentCode?.startsWith('CENT-')
    );
    return filtered.length > 0 ? filtered : departments.filter(d => !d.departmentCode?.startsWith('CENT-'));
  }, [departments, modalDivisionId]);

  // Departments for Main Filter Bar (filtered if selectedDivision is chosen, shopfloor only)
  const filterDepartments = useMemo(() => {
    if (!selectedDivision) {
      return departments.filter(d => !d.departmentCode?.startsWith('CENT-'));
    }
    const filtered = departments.filter(d =>
      d.divisionId === selectedDivision &&
      !d.departmentCode?.startsWith('CENT-')
    );
    return filtered.length > 0 ? filtered : departments.filter(d => !d.departmentCode?.startsWith('CENT-'));
  }, [departments, selectedDivision]);

  // All combined item pool for modal
  const allItemPool = useMemo(() => {
    const map = new Map<string, any>();
    // 1. Guaranteed baseline: always seed canonical stage items first so WIP components are NEVER empty
    CANONICAL_STAGE_ITEMS.forEach(i => {
      map.set(i.id, i);
      if (i.itemCode) map.set(i.itemCode, i);
    });
    // 2. Overlay live stage items from API
    stageItems.forEach(i => {
      if (i.id) map.set(i.id, i);
      if (i.itemCode) map.set(i.itemCode, i);
    });
    // 3. Overlay general inventory items
    items.forEach(i => {
      if (i.id && !map.has(i.id)) map.set(i.id, i);
    });
    // Deduplicate by itemCode to ensure unique entries
    const deduped = new Map<string, any>();
    for (const item of map.values()) {
      const key = item.itemCode || item.id;
      if (!deduped.has(key)) {
        deduped.set(key, item);
      }
    }
    return Array.from(deduped.values());
  }, [stageItems, items]);

  // Grouped Item Options for Modal Select (Strictly filtered by target "To Department")
  const groupedModalItemOptions = useMemo(() => {
    const toDept = modalDepartments.find(d => d.id === modalToDeptId) || departments.find(d => d.id === modalToDeptId);
    const toCode = toDept?.departmentCode || '';
    const toName = (toDept?.name || '').toLowerCase();

    // Determine strict target department component prefix & category
    let targetCategoryTitle = 'REWORK WIP COMPONENTS';
    let filteredItems: any[] = [];

    // 1. Target is SPOKE PLATING (SPD-DEPT006) -> Strictly Plated Inner & Outer Spokes (WIP-SPL)
    if (toCode === 'SPD-DEPT006' || (toName.includes('plating') && toName.includes('spoke')) || (toName.includes('plating') && !toName.includes('nipple'))) {
      targetCategoryTitle = '🎯 SPOKE PLATING REWORK ITEMS — PLATED INNER & OUTER SPOKES';
      filteredItems = allItemPool.filter(i => (i.itemCode || '').startsWith('WIP-SPL'));
      if (filteredItems.length === 0) {
        filteredItems = CANONICAL_STAGE_ITEMS.filter(i => i.itemCode.startsWith('WIP-SPL'));
      }
    }
    // 2. Target is NIPPLE PLATING (SPD-DEPT007) -> Strictly Plated Nipples (FG-NP & WIP-NPL)
    else if (toCode === 'SPD-DEPT007' || (toName.includes('plating') && toName.includes('nipple'))) {
      targetCategoryTitle = '🎯 NIPPLE PLATING REWORK ITEMS — PLATED NIPPLES';
      filteredItems = allItemPool.filter(i => {
        const c = i.itemCode || '';
        return c.startsWith('FG-NP') || c.startsWith('WIP-NPL');
      });
      if (filteredItems.length === 0) {
        filteredItems = CANONICAL_STAGE_ITEMS.filter(i => i.itemCode.startsWith('FG-NP') || i.itemCode.startsWith('WIP-NPL'));
      }
    }
    // 3. Target is SPOKE / HEADER (SPD-DEPT003 / SPD-DEPT004) -> Strictly Unplated Heading Spokes (WIP-SPK)
    else if (toCode === 'SPD-DEPT003' || toCode === 'SPD-DEPT004' || toName.includes('spoke') || toName.includes('header')) {
      targetCategoryTitle = '🎯 HEADER & SPOKE REWORK ITEMS — UNPLATED HEADING SPOKES';
      filteredItems = allItemPool.filter(i => (i.itemCode || '').startsWith('WIP-SPK'));
      if (filteredItems.length === 0) {
        filteredItems = CANONICAL_STAGE_ITEMS.filter(i => i.itemCode.startsWith('WIP-SPK'));
      }
    }
    // 4. Target is SWAGGING (SPD-DEPT002) -> Strictly Swagged Wires (WIP-SW)
    else if (toCode === 'SPD-DEPT002' || toName.includes('swag')) {
      targetCategoryTitle = '🎯 SWAGGING REWORK ITEMS — SWAGGED WIRES';
      filteredItems = allItemPool.filter(i => (i.itemCode || '').startsWith('WIP-SW'));
      if (filteredItems.length === 0) {
        filteredItems = CANONICAL_STAGE_ITEMS.filter(i => i.itemCode.startsWith('WIP-SW'));
      }
    }
    // 5. Target is STRAIGHTENER (SPD-DEPT001) -> Strictly Straightened Cut Wires (WIP-ST)
    else if (toCode === 'SPD-DEPT001' || toName.includes('straight')) {
      targetCategoryTitle = '🎯 STRAIGHTENER REWORK ITEMS — STRAIGHT WIRES';
      filteredItems = allItemPool.filter(i => (i.itemCode || '').startsWith('WIP-ST'));
      if (filteredItems.length === 0) {
        filteredItems = CANONICAL_STAGE_ITEMS.filter(i => i.itemCode.startsWith('WIP-ST'));
      }
    }
    // 6. Target is NIPPLE (SPD-DEPT005) -> Unplated Nipples
    else if (toCode === 'SPD-DEPT005' || toName.includes('nipple')) {
      targetCategoryTitle = '🎯 NIPPLE SHOP REWORK ITEMS — NIPPLES';
      filteredItems = allItemPool.filter(i => {
        const c = i.itemCode || '';
        return c.startsWith('WIP-NPL') || c.startsWith('FG-NP');
      });
      if (filteredItems.length === 0) {
        filteredItems = CANONICAL_STAGE_ITEMS.filter(i => i.itemCode.startsWith('WIP-NPL') || i.itemCode.startsWith('FG-NP'));
      }
    }
    // 7. Target is PACKING (SPD-DEPT008) -> Finished Good Cartons (SPI-FG)
    else if (toCode === 'SPD-DEPT008' || toName.includes('packing')) {
      targetCategoryTitle = '📦 PACKING DEPARTMENT — FINISHED CARTONS (FG)';
      filteredItems = allItemPool.filter(i => (i.itemCode || '').startsWith('SPI-FG'));
      if (filteredItems.length === 0) {
        filteredItems = CANONICAL_STAGE_ITEMS.filter(i => i.itemCode.startsWith('SPI-FG'));
      }
    }
    // Default fallback: intermediate WIP components only (NEVER Finished Goods cartons)
    else {
      targetCategoryTitle = `🎯 ${toDept?.name?.toUpperCase() || 'SHOPFLOOR'} REWORK ITEMS`;
      filteredItems = allItemPool.filter(i => (i.itemCode || '').startsWith('WIP-'));
      if (filteredItems.length === 0) {
        filteredItems = CANONICAL_STAGE_ITEMS.filter(i => i.itemCode.startsWith('WIP-'));
      }
    }

    // Format options with clear Inner / Outer / Stage labels
    const formattedOptions = filteredItems.map(item => {
      const code = item.itemCode || '';
      const name = item.name || '';
      const nameLower = name.toLowerCase();

      let stageLabel = item.stageLabel || '';
      if (!stageLabel) {
        if (code.startsWith('WIP-SPL')) {
          stageLabel = nameLower.includes('inner') ? 'Plated Inner Spoke' : nameLower.includes('outer') ? 'Plated Outer Spoke' : 'Plated Spoke';
        } else if (code.startsWith('FG-NP') || code.startsWith('WIP-NPL')) {
          stageLabel = 'Plated Nipple';
        } else if (code.startsWith('WIP-SPK')) {
          stageLabel = nameLower.includes('inner') ? 'Heading Inner Spoke' : nameLower.includes('outer') ? 'Heading Outer Spoke' : 'Heading Spoke';
        } else if (code.startsWith('WIP-SW')) {
          stageLabel = 'Swagged Wire';
        } else if (code.startsWith('WIP-ST')) {
          stageLabel = 'Straightened Wire';
        }
      }

      return {
        label: `[${code}] ${name} ${stageLabel ? `(${stageLabel})` : ''}`,
        value: item.id,
        itemCode: code,
        name: name,
        stageLabel: stageLabel,
        raw: item,
      };
    });

    // Sort so WIP-SPL-001 (Inner) and WIP-SPL-002 (Outer) appear in clean sequential order
    formattedOptions.sort((a, b) => (a.itemCode || '').localeCompare(b.itemCode || ''));

    return formattedOptions;
  }, [allItemPool, modalDepartments, modalToDeptId]);

  // Options strictly filtered by Edit Modal's target To Department
  const editModalItemOptions = useMemo(() => {
    const toDept = modalDepartments.find(d => d.id === modalEditToDeptId);
    const toCode = toDept?.departmentCode || '';
    const toName = (toDept?.name || '').toLowerCase();

    let filteredItems: any[] = [];
    if (toCode === 'SPD-DEPT006' || (toName.includes('plating') && toName.includes('spoke')) || (toName.includes('plating') && !toName.includes('nipple'))) {
      filteredItems = allItemPool.filter(i => (i.itemCode || '').startsWith('WIP-SPL'));
    } else if (toCode === 'SPD-DEPT007' || (toName.includes('plating') && toName.includes('nipple'))) {
      filteredItems = allItemPool.filter(i => (i.itemCode || '').startsWith('FG-NP') || (i.itemCode || '').startsWith('WIP-NPL'));
    } else if (toCode === 'SPD-DEPT003' || toCode === 'SPD-DEPT004' || toName.includes('spoke') || toName.includes('header')) {
      filteredItems = allItemPool.filter(i => (i.itemCode || '').startsWith('WIP-SPK'));
    } else if (toCode === 'SPD-DEPT002' || toName.includes('swag')) {
      filteredItems = allItemPool.filter(i => (i.itemCode || '').startsWith('WIP-SW'));
    } else if (toCode === 'SPD-DEPT001' || toName.includes('straight')) {
      filteredItems = allItemPool.filter(i => (i.itemCode || '').startsWith('WIP-ST'));
    } else if (toCode === 'SPD-DEPT005' || toName.includes('nipple')) {
      filteredItems = allItemPool.filter(i => (i.itemCode || '').startsWith('WIP-NPL') || (i.itemCode || '').startsWith('FG-NP'));
    } else if (toCode === 'SPD-DEPT008' || toName.includes('packing')) {
      filteredItems = allItemPool.filter(i => (i.itemCode || '').startsWith('SPI-FG'));
    } else {
      filteredItems = allItemPool.filter(i => (i.itemCode || '').startsWith('WIP-'));
    }

    if (filteredItems.length === 0) {
      if (toCode === 'SPD-DEPT006' || toName.includes('plating')) {
        filteredItems = CANONICAL_STAGE_ITEMS.filter(i => i.itemCode.startsWith('WIP-SPL'));
      } else if (toCode === 'SPD-DEPT007' || toName.includes('nipple')) {
        filteredItems = CANONICAL_STAGE_ITEMS.filter(i => i.itemCode.startsWith('FG-NP') || i.itemCode.startsWith('WIP-NPL'));
      } else {
        filteredItems = CANONICAL_STAGE_ITEMS;
      }
    }

    const opts = filteredItems.map(item => {
      const code = item.itemCode || '';
      const name = item.name || '';
      const nameLower = name.toLowerCase();
      let stageLabel = item.stageLabel || '';
      if (!stageLabel) {
        if (code.startsWith('WIP-SPL')) {
          stageLabel = nameLower.includes('inner') ? 'Plated Inner Spoke' : nameLower.includes('outer') ? 'Plated Outer Spoke' : 'Plated Spoke';
        } else if (code.startsWith('FG-NP') || code.startsWith('WIP-NPL')) {
          stageLabel = 'Plated Nipple';
        } else if (code.startsWith('WIP-SPK')) {
          stageLabel = nameLower.includes('inner') ? 'Heading Inner Spoke' : nameLower.includes('outer') ? 'Heading Outer Spoke' : 'Heading Spoke';
        } else if (code.startsWith('WIP-SW')) {
          stageLabel = 'Swagged Wire';
        } else if (code.startsWith('WIP-ST')) {
          stageLabel = 'Straightened Wire';
        }
      }
      return {
        label: `[${code}] ${name} ${stageLabel ? `(${stageLabel})` : ''}`,
        value: item.id,
        itemCode: code,
        name: name,
        stageLabel: stageLabel,
        raw: item,
      };
    });
    opts.sort((a, b) => (a.itemCode || '').localeCompare(b.itemCode || ''));
    return opts;
  }, [allItemPool, modalDepartments, modalEditToDeptId]);

  // Selected item object in edit modal
  const modalEditItemObj = useMemo(() => {
    return allItemPool.find(i => i.id === modalEditItemId);
  }, [allItemPool, modalEditItemId]);

  // Selected item object in modal
  const modalItemObj = useMemo(() => {
    return allItemPool.find(i => i.id === modalItemId);
  }, [allItemPool, modalItemId]);

  // Fetch Dynamic Lookup Options (Defect Reasons & Corrective Actions)
  const fetchLookupOptions = useCallback(async () => {
    try {
      const res = await apiService.get<any>('/production/rework-returns/lookup-options');
      if (res && res.success && res.data) {
        if (Array.isArray(res.data.defectReasons) && res.data.defectReasons.length > 0) {
          const merged = Object.entries(DEFECT_REASONS).map(([k, v]) => ({ value: k, label: v.label, color: v.color }));
          res.data.defectReasons.forEach((r: any) => {
            if (!merged.some(m => m.value === r.value)) {
              merged.push({ value: r.value, label: r.label, color: 'blue' });
            }
          });
          setDefectReasonOptions(merged);
        }
        if (Array.isArray(res.data.correctiveActions) && res.data.correctiveActions.length > 0) {
          const merged = Object.entries(CORRECTIVE_ACTIONS).map(([k, v]) => ({ value: k, label: v }));
          res.data.correctiveActions.forEach((a: any) => {
            if (!merged.some(m => m.value === a.value)) {
              merged.push({ value: a.value, label: a.label });
            }
          });
          setCorrectiveActionOptions(merged);
        }
      }
    } catch (e) {
      console.warn('Could not load dynamic lookups', e);
    }
  }, []);

  // Handler to add custom Defect Reason
  const handleAddNewReason = async (targetForm: any) => {
    const trimmed = newReasonInput.trim();
    if (!trimmed) {
      message.warning('Please enter defect reason text');
      return;
    }
    const val = trimmed.toUpperCase().replace(/[^A-Z0-9]/g, '_');
    const newOpt = { value: val, label: trimmed, color: 'blue' };
    setDefectReasonOptions(prev => [...prev.filter(p => p.value !== val), newOpt]);
    targetForm.setFieldsValue({ defectReason: val });
    setNewReasonInput('');
    try {
      setAddingReason(true);
      await apiService.post('/production/rework-returns/lookup-options', {
        category: 'DEFECT_REASON',
        label: trimmed,
        value: val,
      });
      message.success(`Defect reason "${trimmed}" saved permanently`);
    } catch (e: any) {
      console.warn('Saved locally, background sync notice:', e);
    } finally {
      setAddingReason(false);
    }
  };

  // Handler to add custom Corrective Action
  const handleAddNewAction = async (targetForm: any) => {
    const trimmed = newActionInput.trim();
    if (!trimmed) {
      message.warning('Please enter corrective action text');
      return;
    }
    const val = trimmed.toUpperCase().replace(/[^A-Z0-9]/g, '_');
    const newOpt = { value: val, label: trimmed };
    setCorrectiveActionOptions(prev => [...prev.filter(p => p.value !== val), newOpt]);
    targetForm.setFieldsValue({ correctiveAction: val });
    setNewActionInput('');
    try {
      setAddingAction(true);
      await apiService.post('/production/rework-returns/lookup-options', {
        category: 'CORRECTIVE_ACTION',
        label: trimmed,
        value: val,
      });
      message.success(`Corrective action "${trimmed}" saved permanently`);
    } catch (e: any) {
      console.warn('Saved locally, background sync notice:', e);
    } finally {
      setAddingAction(false);
    }
  };

  // Fetch Lookups (Divisions, Departments, Items, UOMs)
  useEffect(() => {
    fetchLookupOptions();
    (async () => {
      try {
        const [divRes, deptRes, itemRes, uomRes] = await Promise.all([
          apiService.get<any>('/divisions', { limit: 50 }).catch(() => null),
          apiService.get<any>('/departments', { limit: 100 }).catch(() => null),
          apiService.get<any>('/master-data/items', { limit: 1000 }).catch(() => null),
          apiService.get<any>('/master-data/uom', { limit: 100 }).catch(() => null),
        ]);

        const divList = divRes?.data || (Array.isArray(divRes) ? divRes : []);
        if (divList.length > 0) setDivisions(divList);

        const deptList = deptRes?.data || (Array.isArray(deptRes) ? deptRes : []);
        if (deptList.length > 0) setDepartments(deptList);

        const itemList = itemRes?.data || itemRes?.items || (Array.isArray(itemRes) ? itemRes : []);
        if (itemList.length > 0) setItems(itemList);

        const uomList = uomRes?.data || (Array.isArray(uomRes) ? uomRes : []);
        if (uomList.length > 0) setUoms(uomList);
      } catch (err) {
        console.error('Failed to load reference lookups:', err);
      }
    })();
  }, []);

  // Fetch Data
  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const params: any = {
        page,
        limit: pageSize,
      };
      if (selectedDivision) params.divisionId = selectedDivision;
      if (selectedFromDept) params.fromDepartmentId = selectedFromDept;
      if (selectedToDept) params.toDepartmentId = selectedToDept;
      if (selectedStatus && selectedStatus !== 'ALL') params.status = selectedStatus;
      if (searchQuery.trim()) params.search = searchQuery.trim();

      const [res, sumRes] = await Promise.all([
        apiService.get<any>('/production/rework-returns', params),
        apiService.get<any>('/production/rework-returns/summary', { divisionId: selectedDivision }),
      ]);

      if (res && res.success) {
        setRecords(res.data || []);
        setTotal(res.total || 0);
      }
      if (sumRes && sumRes.success) {
        setSummary(sumRes.data);
      }
    } catch (err: any) {
      message.error(err?.message || 'Failed to load production rework returns');
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, selectedDivision, selectedFromDept, selectedToDept, selectedStatus, searchQuery, message]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Handle Export CSV
  const handleExportCsv = useCallback(() => {
    if (records.length === 0) {
      message.warning('No records to export');
      return;
    }
    const headers = [
      'Return #', 'Date', 'Division', 'From Dept', 'To Dept',
      'Item Code', 'Item Name', 'Quantity', 'Defect Reason', 'Corrective Action',
      'Priority', 'Status', 'Returned By', 'Received By', 'Rectified Qty', 'Scrapped Qty'
    ];
    const rows = records.map(r => [
      r.returnNumber,
      r.returnDate,
      r.division?.name || r.division?.divisionCode || '',
      r.fromDepartment?.name || '',
      r.toDepartment?.name || '',
      r.item?.itemCode || '',
      r.item?.name || '',
      r.quantity,
      r.defectReason,
      r.correctiveAction,
      r.priority,
      r.status,
      r.returnedBy || '',
      r.receivedBy || '',
      r.rectifiedQuantity || 0,
      r.scrappedQuantity || 0,
    ]);
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers, ...rows].map(e => e.join(',')).join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Production_Rework_Returns_${dayjs().format('YYYYMMDD')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, [records, message]);

  // Division change in modal -> cascade departments & reset item
  const handleModalDivisionChange = (divId: string) => {
    const divDepts = departments.filter(d =>
      d.divisionId === divId ||
      d.divisionScopes?.some((s: any) => s.divisionId === divId)
    );
    const packing = divDepts.find(d => d.name.toLowerCase().includes('packing')) || divDepts[0];
    const plating = divDepts.find(d => d.name.toLowerCase().includes('plating')) || divDepts[1];
    createForm.setFieldsValue({
      divisionId: divId,
      fromDepartmentId: packing?.id,
      toDepartmentId: plating?.id,
      itemId: undefined,
      uomId: undefined,
    });
  };

  // Item select in modal -> auto populate UOM
  const handleItemSelect = (itemId: string) => {
    const sel = allItemPool.find(i => i.id === itemId);
    if (sel) {
      const uomId = sel.uomId || sel.baseUomId || sel.baseUom?.id || uoms.find(u => u.code === 'PCS')?.id || uoms[0]?.id;
      createForm.setFieldsValue({
        itemId,
        uomId,
      });
    }
  };

  // Open Create Modal
  const handleOpenCreateModal = () => {
    const spokeDiv = divisions.find(d => d.divisionCode === 'DIV-SPD') || divisions[0];
    const targetDivId = spokeDiv?.id || 'd1000000-0000-0000-0000-000000000001';
    const divDepts = departments.filter(d =>
      d.divisionId === targetDivId ||
      d.divisionScopes?.some((s: any) => s.divisionId === targetDivId)
    );
    const packingDept = divDepts.find(d => d.departmentCode === 'SPD-DEPT008' || d.name.toLowerCase().includes('packing')) || divDepts[0];
    const platingDept = divDepts.find(d => d.departmentCode === 'SPD-DEPT006' || d.name.toLowerCase().includes('plating')) || divDepts[1];
    const defaultUom = uoms.find(u => u.code === 'PCS' || u.code === 'GRS')?.id || uoms[0]?.id;

    createForm.resetFields();
    createForm.setFieldsValue({
      returnDate: dayjs(),
      divisionId: targetDivId,
      fromDepartmentId: packingDept?.id,
      toDepartmentId: platingDept?.id,
      uomId: defaultUom,
      defectReason: 'PLATING_PEELING',
      correctiveAction: 'REPLATE',
      priority: 'HIGH',
      returnedBy: 'Packing Floor Supervisor',
      quantity: undefined,
    });
    setCreateModalOpen(true);
  };

  // Header Actions
  const headerExtra = useMemo(() => (
    <Space wrap>
      <Button icon={<ReloadOutlined />} onClick={() => fetchData()}>
        Refresh
      </Button>
      <Button icon={<FileExcelOutlined />} onClick={handleExportCsv}>
        Export CSV
      </Button>
      <Button type="primary" icon={<PlusOutlined />} onClick={() => handleOpenCreateModal()}>
        New Production Return
      </Button>
    </Space>
  ), [fetchData, handleExportCsv, divisions, departments]);

  // Submit Create
  const handleCreateSubmit = async () => {
    try {
      const values = await createForm.validateFields();
      setSubmitting(true);
      const payload = {
        ...values,
        returnDate: values.returnDate ? values.returnDate.format('YYYY-MM-DD') : dayjs().format('YYYY-MM-DD'),
        quantity: Number(values.quantity),
      };

      // Auto compute PCS / GRS if spoke
      if (values.quantity) {
        const itemObj = items.find(i => i.id === values.itemId);
        if (itemObj?.itemCode?.includes('SPK')) {
          payload.quantityPcs = Number(values.quantity);
          payload.quantityGrs = Number((Number(values.quantity) / 144).toFixed(2));
        }
      }

      const res = await apiService.post<any>('/production/rework-returns', payload);
      if (res && res.success) {
        message.success(res.message || 'Production rework return created successfully');
        setCreateModalOpen(false);
        fetchData();
      } else {
        message.error('Failed to create rework return');
      }
    } catch (err: any) {
      if (!err?.errorFields) {
        message.error(err?.message || 'Error saving rework return');
      }
    } finally {
      setSubmitting(false);
    }
  };

  // Open Edit Modal
  const handleOpenEditModal = (record: ReworkReturnRecord) => {
    setSelectedRecord(record);
    editForm.resetFields();
    editForm.setFieldsValue({
      returnDate: dayjs(record.returnDate),
      divisionId: record.divisionId,
      fromDepartmentId: record.fromDepartmentId,
      toDepartmentId: record.toDepartmentId,
      itemId: record.itemId,
      uomId: record.uomId,
      quantity: record.quantity !== undefined && record.quantity !== null ? Number(record.quantity) : undefined,
      defectReason: record.defectReason,
      correctiveAction: record.correctiveAction,
      priority: record.priority,
      returnedBy: record.returnedBy,
      defectDescription: record.defectDescription,
      remarks: record.remarks,
    });
    setEditModalOpen(true);
  };

  // Submit Edit
  const handleEditSubmit = async () => {
    if (!selectedRecord) return;
    try {
      const values = await editForm.validateFields();
      setSubmitting(true);
      const payload = {
        ...values,
        returnDate: values.returnDate ? values.returnDate.format('YYYY-MM-DD') : dayjs().format('YYYY-MM-DD'),
        quantity: Number(values.quantity),
      };

      const res = await apiService.patch<any>(`/production/rework-returns/${selectedRecord.id}`, payload);
      if (res && res.success) {
        message.success(res.message || 'Production return updated successfully');
        setEditModalOpen(false);
        fetchData();
      } else {
        message.error('Failed to update return');
      }
    } catch (err: any) {
      if (!err?.errorFields) {
        message.error(err?.message || 'Error updating rework return');
      }
    } finally {
      setSubmitting(false);
    }
  };

  // Delete Record
  const handleDelete = async (id: string) => {
    try {
      setLoading(true);
      const res = await apiService.delete<any>(`/production/rework-returns/${id}`);
      if (res && res.success) {
        message.success('Rework return record deleted successfully');
        fetchData();
      } else {
        message.error('Failed to delete return record');
      }
    } catch (err: any) {
      message.error(err?.message || 'Error deleting return record');
    } finally {
      setLoading(false);
    }
  };

  // Open Status Update Modal
  const handleOpenStatusModal = (record: ReworkReturnRecord) => {
    setSelectedRecord(record);
    statusForm.resetFields();
    
    // Parse numeric quantities cleanly without trailing decimal zeros
    const totalQty = record.quantity !== undefined && record.quantity !== null ? Number(record.quantity) : undefined;
    const existingRect = record.rectifiedQuantity !== undefined && record.rectifiedQuantity !== null ? Number(record.rectifiedQuantity) : 0;
    const rectifiedQty = existingRect > 0 ? existingRect : totalQty;
    const scrappedQty = record.scrappedQuantity !== undefined && record.scrappedQuantity !== null && Number(record.scrappedQuantity) > 0 ? Number(record.scrappedQuantity) : undefined;

    statusForm.setFieldsValue({
      status: record.status === 'DISPATCHED' ? 'ACKNOWLEDGED' : record.status === 'ACKNOWLEDGED' ? 'IN_REWORK' : 'RECTIFIED',
      receivedBy: record.receivedBy || 'Plating Supervisor',
      rectifiedQuantity: rectifiedQty,
      scrappedQuantity: scrappedQty,
      remarks: '',
    });
    setStatusModalOpen(true);
  };

  // Submit Status Update
  const handleStatusSubmit = async () => {
    if (!selectedRecord) return;
    try {
      const values = await statusForm.validateFields();
      setSubmitting(true);
      const res = await apiService.patch<any>(`/production/rework-returns/${selectedRecord.id}/status`, values);
      if (res && res.success) {
        message.success(res.message || 'Status updated successfully');
        setStatusModalOpen(false);
        fetchData();
      } else {
        message.error('Failed to update status');
      }
    } catch (err: any) {
      if (!err?.errorFields) {
        message.error(err?.message || 'Error updating status');
      }
    } finally {
      setSubmitting(false);
    }
  };


  // Render Status Badge
  const renderStatusTag = (status: string) => {
    switch (status) {
      case 'DISPATCHED':
        return <Tag color="blue" icon={<SyncOutlined spin />}>Dispatched</Tag>;
      case 'ACKNOWLEDGED':
        return <Tag color="cyan" icon={<ClockCircleOutlined />}>Acknowledged</Tag>;
      case 'IN_REWORK':
        return <Tag color="processing" icon={<ToolOutlined spin />}>In Rework</Tag>;
      case 'RECTIFIED':
        return <Tag color="success" icon={<CheckCircleOutlined />}>Rectified</Tag>;
      case 'CLOSED':
        return <Tag color="purple" icon={<CheckCircleOutlined />}>Returned / Closed</Tag>;
      case 'SCRAPPED':
        return <Tag color="error" icon={<CloseCircleOutlined />}>Scrapped</Tag>;
      default:
        return <Tag>{status}</Tag>;
    }
  };

  // Table Columns
  const columns: ColumnsType<ReworkReturnRecord> = [
    {
      title: 'RETURN #',
      dataIndex: 'returnNumber',
      key: 'returnNumber',
      width: 145,
      render: (num, r) => (
        <Space direction="vertical" size={2}>
          <Tag
            color="orange"
            style={{ fontWeight: 800, cursor: 'pointer' }}
            onClick={() => {
              setSelectedRecord(r);
              setDetailModalOpen(true);
            }}
          >
            {num}
          </Tag>
          <span style={{ fontSize: 11, color: token.colorTextSecondary }}>
            {dayjs(r.returnDate).format('DD-MMM-YYYY')}
          </span>
        </Space>
      ),
    },
    {
      title: 'DEPARTMENT FLOW',
      key: 'deptFlow',
      width: 220,
      render: (_, r) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Tag color="volcano" style={{ fontWeight: 600, margin: 0, fontSize: 11 }}>
            {r.fromDepartment?.name || 'From Dept'}
          </Tag>
          <ArrowRightOutlined style={{ fontSize: 11, color: token.colorTextTertiary }} />
          <Tag color="green" style={{ fontWeight: 600, margin: 0, fontSize: 11 }}>
            {r.toDepartment?.name || 'To Dept'}
          </Tag>
        </div>
      ),
    },
    {
      title: 'ITEM (WIP / FG)',
      key: 'item',
      render: (_, r) => {
        const code = r.item?.itemCode || '';
        const name = r.item?.name || 'Unknown Item';
        const nameLower = name.toLowerCase();

        let stageTag = <Tag color="default" style={{ fontSize: 10, margin: 0 }}>WIP STAGE</Tag>;
        if (code.startsWith('WIP-SPL')) {
          if (nameLower.includes('inner')) {
            stageTag = <Tag color="blue" style={{ fontSize: 10, margin: 0, fontWeight: 700 }}>INNER SPOKE (PLATED)</Tag>;
          } else if (nameLower.includes('outer')) {
            stageTag = <Tag color="cyan" style={{ fontSize: 10, margin: 0, fontWeight: 700 }}>OUTER SPOKE (PLATED)</Tag>;
          } else {
            stageTag = <Tag color="blue" style={{ fontSize: 10, margin: 0, fontWeight: 700 }}>PLATED SPOKE</Tag>;
          }
        } else if (code.startsWith('FG-NP') || code.startsWith('WIP-NPL')) {
          stageTag = <Tag color="purple" style={{ fontSize: 10, margin: 0, fontWeight: 700 }}>PLATED NIPPLE</Tag>;
        } else if (code.startsWith('WIP-SPK')) {
          if (nameLower.includes('inner')) {
            stageTag = <Tag color="geekblue" style={{ fontSize: 10, margin: 0 }}>INNER HEADING SPOKE</Tag>;
          } else if (nameLower.includes('outer')) {
            stageTag = <Tag color="geekblue" style={{ fontSize: 10, margin: 0 }}>OUTER HEADING SPOKE</Tag>;
          } else {
            stageTag = <Tag color="geekblue" style={{ fontSize: 10, margin: 0 }}>HEADING SPOKE</Tag>;
          }
        } else if (code.startsWith('WIP-SW') || code.startsWith('WIP-ST')) {
          stageTag = <Tag color="orange" style={{ fontSize: 10, margin: 0 }}>WIRE WIP</Tag>;
        } else if (code.startsWith('SPI-FG')) {
          stageTag = <Tag color="green" style={{ fontSize: 10, margin: 0, fontWeight: 700 }}>PACKED CARTON (FG)</Tag>;
        }

        return (
          <div>
            <div style={{ fontWeight: 700, fontSize: 13, color: token.colorText }}>
              {name}
            </div>
            <div style={{ display: 'flex', gap: 6, marginTop: 3, flexWrap: 'wrap', alignItems: 'center' }}>
              <Tag style={{ fontSize: 10.5, margin: 0 }}>{code}</Tag>
              {stageTag}
              <Tag color="volcano" style={{ fontSize: 10, margin: 0 }}>REWORK (NON-COUNT)</Tag>
            </div>
          </div>
        );
      },
    },
    {
      title: 'RETURN QTY',
      key: 'quantity',
      width: 140,
      align: 'right',
      render: (_, r) => (
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontWeight: 800, fontSize: 14, color: '#e11d48' }}>
            {formatDecimal(r.quantity)} <span style={{ fontSize: 11 }}>{r.uom?.code || 'PCS'}</span>
          </div>
          {r.quantityGrs && (
            <div style={{ fontSize: 10.5, color: token.colorTextSecondary }}>
              ({formatDecimal(r.quantityGrs)} GRS)
            </div>
          )}
        </div>
      ),
    },
    {
      title: 'DEFECT & ACTION',
      key: 'defect',
      width: 220,
      render: (_, r) => {
        const defectInfo = DEFECT_REASONS[r.defectReason] || { label: r.defectReason, color: 'default' };
        const actionLabel = CORRECTIVE_ACTIONS[r.correctiveAction] || r.correctiveAction;
        return (
          <Space direction="vertical" size={2}>
            <Tag color={defectInfo.color} style={{ fontWeight: 700, margin: 0 }}>
              {defectInfo.label}
            </Tag>
            <span style={{ fontSize: 11, color: token.colorTextSecondary }}>
              Action: <strong>{actionLabel}</strong>
            </span>
          </Space>
        );
      },
    },
    {
      title: 'PRIORITY',
      dataIndex: 'priority',
      key: 'priority',
      width: 100,
      align: 'center',
      render: (p) => {
        const color = p === 'URGENT' ? 'red' : p === 'HIGH' ? 'volcano' : 'blue';
        return <Tag color={color} style={{ fontWeight: 700 }}>{p}</Tag>;
      },
    },
    {
      title: 'STATUS',
      dataIndex: 'status',
      key: 'status',
      width: 135,
      align: 'center',
      render: (status) => renderStatusTag(status),
    },
    {
      title: 'ACTIONS',
      key: 'actions',
      width: 270,
      align: 'center',
      render: (_, r) => (
        <Space size={4}>
          <Tooltip title="View Details">
            <Button
              size="small"
              icon={<EyeOutlined />}
              onClick={() => {
                setSelectedRecord(r);
                setDetailModalOpen(true);
              }}
            >
              View
            </Button>
          </Tooltip>
          <Tooltip title="Edit Rework Return">
            <Button
              size="small"
              icon={<EditOutlined />}
              onClick={() => handleOpenEditModal(r)}
            >
              Edit
            </Button>
          </Tooltip>
          <Tooltip title="Update Status / Rework Progress">
            <Button
              size="small"
              type="primary"
              icon={<ToolOutlined />}
              onClick={() => handleOpenStatusModal(r)}
            >
              Status
            </Button>
          </Tooltip>
          <Popconfirm
            title="Delete Return Record"
            description={`Are you sure you want to delete return ${r.returnNumber}?`}
            onConfirm={() => handleDelete(r.id)}
            okText="Yes, Delete"
            cancelText="Cancel"
            okButtonProps={{ danger: true }}
          >
            <Tooltip title="Delete Return">
              <Button size="small" danger icon={<DeleteOutlined />}>
                Delete
              </Button>
            </Tooltip>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div style={{ padding: '16px clamp(12px, 3vw, 24px)', minHeight: '100vh', background: 'var(--theme-surface)' }}>
      {/* Page Header */}
      <PageHeader
        icon={<RollbackOutlined />}
        title="Production Rework & Department Returns"
        subtitle="Inter-department defect return tracking, rework loop, and scrap accountability without inflating primary production."
        extra={headerExtra}
      />

      {/* KPI Stats Cards */}
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} sm={12} lg={6}>
          <Card
            bordered={false}
            style={{
              background: token.colorBgContainer,
              borderRadius: 8,
              border: `1px solid ${token.colorBorderSecondary}`,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: 11, color: token.colorTextSecondary, fontWeight: 700, textTransform: 'uppercase' }}>
                  Total Returns Dispatched
                </div>
                <div style={{ fontSize: 22, fontWeight: 800, color: token.colorText, marginTop: 4 }}>
                  {summary?.totalRecords || records.length} <span style={{ fontSize: 13, fontWeight: 500 }}>Batches</span>
                </div>
                <div style={{ fontSize: 11, color: '#e11d48', marginTop: 2 }}>
                  {formatDecimal(summary?.totalReturnedQuantity || 0)} Total PCS
                </div>
              </div>
              <div style={{ padding: 10, background: 'rgba(225, 29, 72, 0.1)', borderRadius: 8 }}>
                <RollbackOutlined style={{ fontSize: 24, color: '#e11d48' }} />
              </div>
            </div>
          </Card>
        </Col>

        <Col xs={24} sm={12} lg={6}>
          <Card
            bordered={false}
            style={{
              background: token.colorBgContainer,
              borderRadius: 8,
              border: `1px solid ${token.colorBorderSecondary}`,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: 11, color: token.colorTextSecondary, fontWeight: 700, textTransform: 'uppercase' }}>
                  Active In Rework / Plating
                </div>
                <div style={{ fontSize: 22, fontWeight: 800, color: '#d97706', marginTop: 4 }}>
                  {(summary?.dispatched || 0) + (summary?.inRework || 0) + (summary?.acknowledged || 0)} <span style={{ fontSize: 13, fontWeight: 500 }}>Batches</span>
                </div>
                <div style={{ fontSize: 11, color: token.colorTextSecondary, marginTop: 2 }}>
                  Awaiting or currently re-working
                </div>
              </div>
              <div style={{ padding: 10, background: 'rgba(217, 119, 6, 0.1)', borderRadius: 8 }}>
                <SyncOutlined spin style={{ fontSize: 24, color: '#d97706' }} />
              </div>
            </div>
          </Card>
        </Col>

        <Col xs={24} sm={12} lg={6}>
          <Card
            bordered={false}
            style={{
              background: token.colorBgContainer,
              borderRadius: 8,
              border: `1px solid ${token.colorBorderSecondary}`,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: 11, color: token.colorTextSecondary, fontWeight: 700, textTransform: 'uppercase' }}>
                  Rectified &amp; Restored
                </div>
                <div style={{ fontSize: 22, fontWeight: 800, color: '#16a34a', marginTop: 4 }}>
                  {formatDecimal(summary?.totalRectifiedQuantity || 0)} <span style={{ fontSize: 13, fontWeight: 500 }}>PCS</span>
                </div>
                <div style={{ fontSize: 11, color: '#16a34a', marginTop: 2 }}>
                  Successfully repaired &amp; sent back
                </div>
              </div>
              <div style={{ padding: 10, background: 'rgba(22, 163, 74, 0.1)', borderRadius: 8 }}>
                <CheckCircleOutlined style={{ fontSize: 24, color: '#16a34a' }} />
              </div>
            </div>
          </Card>
        </Col>

        <Col xs={24} sm={12} lg={6}>
          <Card
            bordered={false}
            style={{
              background: token.colorBgContainer,
              borderRadius: 8,
              border: `1px solid ${token.colorBorderSecondary}`,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: 11, color: token.colorTextSecondary, fontWeight: 700, textTransform: 'uppercase' }}>
                  Scrapped from Rework
                </div>
                <div style={{ fontSize: 22, fontWeight: 800, color: '#dc2626', marginTop: 4 }}>
                  {formatDecimal(summary?.totalScrappedQuantity || 0)} <span style={{ fontSize: 13, fontWeight: 500 }}>PCS</span>
                </div>
                <div style={{ fontSize: 11, color: token.colorTextSecondary, marginTop: 2 }}>
                  Non-salvageable scrap booked
                </div>
              </div>
              <div style={{ padding: 10, background: 'rgba(220, 38, 38, 0.1)', borderRadius: 8 }}>
                <CloseCircleOutlined style={{ fontSize: 24, color: '#dc2626' }} />
              </div>
            </div>
          </Card>
        </Col>
      </Row>

            {/* Rework Trends & Quality Intelligence Analytics */}
      <Card
        bordered={false}
        style={{
          background: token.colorBgContainer,
          borderRadius: 8,
          border: `1px solid ${token.colorBorderSecondary}`,
          marginBottom: 16,
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 12,
            marginBottom: 16,
            paddingBottom: 12,
            borderBottom: `1px solid ${token.colorBorderSecondary}`,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: 38,
                height: 38,
                borderRadius: 8,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'rgba(5, 150, 105, 0.1)',
                color: '#059669',
              }}
            >
              <RiseOutlined style={{ fontSize: 20 }} />
            </div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: token.colorText }}>
                Rework Trends &amp; Plating Quality Intelligence
              </div>
              <div style={{ fontSize: 12, color: token.colorTextSecondary }}>
                Real-time defect tracking, monthly scrap reduction trajectory, and plating rework defect rate (%)
              </div>
            </div>
          </div>
          <Segmented
            value={activeTrendTab}
            onChange={(val: any) => setActiveTrendTab(val)}
            options={[
              { label: 'Daily Rework (Day-by-Day)', value: 'daily', icon: <BarChartOutlined /> },
              { label: 'Monthly Trajectory', value: 'monthly', icon: <RiseOutlined /> },
              { label: 'Plating Output vs Rework (%)', value: 'plating', icon: <DashboardOutlined /> },
            ]}
          />
        </div>

        {activeTrendTab === 'daily' && (
          <div>
            <div style={{ width: '100%', height: 260 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={
                    summary?.dailyTrend && summary.dailyTrend.length > 0
                      ? summary.dailyTrend
                      : [
                          {
                            dateLabel: dayjs().format('DD-MMM'),
                            returnedQty: summary?.totalDispatchedReturns || 0,
                            rectifiedQty: summary?.totalRectifiedQuantity || 0,
                            scrappedQty: summary?.totalScrappedQuantity || 0,
                          },
                        ]
                  }
                  margin={{ top: 10, right: 20, left: 0, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke={token.colorBorderSecondary} opacity={0.5} />
                  <XAxis dataKey="dateLabel" stroke={token.colorTextSecondary} fontSize={12} />
                  <YAxis
                    stroke={token.colorTextSecondary}
                    fontSize={12}
                    tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v)}
                  />
                  <RechartsTooltip
                    contentStyle={{
                      backgroundColor: token.colorBgElevated,
                      borderColor: token.colorBorderSecondary,
                      borderRadius: 8,
                      color: token.colorText,
                      boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                    }}
                  />
                  <Legend />
                  <Bar dataKey="returnedQty" name="Rework Returned (PCS)" fill="#ea580c" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="rectifiedQty" name="Rectified &amp; Passed (PCS)" fill="#16a34a" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="scrappedQty" name="Scrapped from Rework (PCS)" fill="#dc2626" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div style={{ fontSize: 11, color: token.colorTextSecondary, marginTop: 8, textAlign: 'center' }}>
              Day-by-day rework returns dispatched from downstream shops vs rectified pieces restored back to line.
            </div>
          </div>
        )}

        {activeTrendTab === 'monthly' && (
          <div>
            <div style={{ width: '100%', height: 260 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={
                    summary?.monthlyTrend && summary.monthlyTrend.length > 0
                      ? summary.monthlyTrend
                      : [
                          {
                            monthLabel: dayjs().format('MMM YYYY'),
                            returnedQty: summary?.totalDispatchedReturns || 0,
                            rectifiedQty: summary?.totalRectifiedQuantity || 0,
                            scrappedQty: summary?.totalScrappedQuantity || 0,
                          },
                        ]
                  }
                  margin={{ top: 10, right: 20, left: 0, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke={token.colorBorderSecondary} opacity={0.5} />
                  <XAxis dataKey="monthLabel" stroke={token.colorTextSecondary} fontSize={12} />
                  <YAxis
                    stroke={token.colorTextSecondary}
                    fontSize={12}
                    tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v)}
                  />
                  <RechartsTooltip
                    contentStyle={{
                      backgroundColor: token.colorBgElevated,
                      borderColor: token.colorBorderSecondary,
                      borderRadius: 8,
                      color: token.colorText,
                      boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                    }}
                  />
                  <Legend />
                  <Bar dataKey="returnedQty" name="Monthly Returns (PCS)" fill="#ea580c" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="rectifiedQty" name="Monthly Rectified (PCS)" fill="#16a34a" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="scrappedQty" name="Monthly Scrapped (PCS)" fill="#dc2626" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div style={{ fontSize: 11, color: token.colorTextSecondary, marginTop: 8, textAlign: 'center' }}>
              Month-over-month trajectory of rework resolution and scrap prevention across manufacturing periods.
            </div>
          </div>
        )}

        {activeTrendTab === 'plating' && (
          <div>
            <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
              <Col xs={24} sm={12} md={6}>
                <div
                  style={{
                    background: token.colorFillAlter,
                    padding: '12px 14px',
                    borderRadius: 8,
                    border: `1px solid ${token.colorBorderSecondary}`,
                  }}
                >
                  <div style={{ fontSize: 11, color: token.colorTextSecondary, fontWeight: 700, textTransform: 'uppercase' }}>
                    Latest Plating Output
                  </div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: token.colorText, marginTop: 4 }}>
                    {formatDecimal(summary?.platingAnalytics?.latestProduction || 0)} <span style={{ fontSize: 12, fontWeight: 500 }}>PCS</span>
                  </div>
                  <div style={{ fontSize: 11, color: token.colorTextTertiary, marginTop: 2 }}>
                    Primary Shift Output ({summary?.platingAnalytics?.latestDate || 'Recent'})
                  </div>
                </div>
              </Col>
              <Col xs={24} sm={12} md={6}>
                <div
                  style={{
                    background: token.colorFillAlter,
                    padding: '12px 14px',
                    borderRadius: 8,
                    border: `1px solid ${token.colorBorderSecondary}`,
                  }}
                >
                  <div style={{ fontSize: 11, color: token.colorTextSecondary, fontWeight: 700, textTransform: 'uppercase' }}>
                    Plating Rework Volume
                  </div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: '#ea580c', marginTop: 4 }}>
                    {formatDecimal(summary?.platingAnalytics?.latestRework || 0)} <span style={{ fontSize: 12, fontWeight: 500 }}>PCS</span>
                  </div>
                  <div style={{ fontSize: 11, color: token.colorTextTertiary, marginTop: 2 }}>
                    Peeling, dull, or spotting returns
                  </div>
                </div>
              </Col>
              <Col xs={24} sm={12} md={6}>
                <div
                  style={{
                    background: token.colorFillAlter,
                    padding: '12px 14px',
                    borderRadius: 8,
                    border: `1px solid ${token.colorBorderSecondary}`,
                  }}
                >
                  <div style={{ fontSize: 11, color: token.colorTextSecondary, fontWeight: 700, textTransform: 'uppercase' }}>
                    Plating Defect Rate (%)
                  </div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 4 }}>
                    <span
                      style={{
                        fontSize: 20,
                        fontWeight: 800,
                        color: (summary?.platingAnalytics?.latestReworkRate || 0) <= 0.5 ? '#16a34a' : '#ea580c',
                      }}
                    >
                      {summary?.platingAnalytics?.latestReworkRate ?? 0}%
                    </span>
                    <Tag
                      color={(summary?.platingAnalytics?.latestReworkRate || 0) <= 0.5 ? 'success' : 'warning'}
                      style={{ fontSize: 10, margin: 0, padding: '0 4px', lineHeight: '16px' }}
                    >
                      {(summary?.platingAnalytics?.latestReworkRate || 0) <= 0.5 ? 'EXCELLENT (<0.5%)' : 'ATTENTION'}
                    </Tag>
                  </div>
                  <div style={{ fontSize: 11, color: token.colorTextTertiary, marginTop: 2 }}>
                    Overall Rate: {summary?.platingAnalytics?.overallReworkRate ?? 0}%
                  </div>
                </div>
              </Col>
              <Col xs={24} sm={12} md={6}>
                <div
                  style={{
                    background: token.colorFillAlter,
                    padding: '12px 14px',
                    borderRadius: 8,
                    border: `1px solid ${token.colorBorderSecondary}`,
                  }}
                >
                  <div style={{ fontSize: 11, color: token.colorTextSecondary, fontWeight: 700, textTransform: 'uppercase' }}>
                    Cumulative Plating Output
                  </div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: token.colorText, marginTop: 4 }}>
                    {formatDecimal(summary?.platingAnalytics?.totalProduction || 0)} <span style={{ fontSize: 12, fontWeight: 500 }}>PCS</span>
                  </div>
                  <div style={{ fontSize: 11, color: token.colorTextTertiary, marginTop: 2 }}>
                    Spoke Plating (SPD-DEPT006)
                  </div>
                </div>
              </Col>
            </Row>

            <div style={{ width: '100%', height: 260 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={summary?.platingAnalytics?.dailyComparison || []}
                  margin={{ top: 10, right: 20, left: 0, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke={token.colorBorderSecondary} opacity={0.5} />
                  <XAxis dataKey="dateLabel" stroke={token.colorTextSecondary} fontSize={12} />
                  <YAxis
                    stroke={token.colorTextSecondary}
                    fontSize={12}
                    tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v)}
                  />
                  <RechartsTooltip
                    contentStyle={{
                      backgroundColor: token.colorBgElevated,
                      borderColor: token.colorBorderSecondary,
                      borderRadius: 8,
                      color: token.colorText,
                      boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                    }}
                  />
                  <Legend />
                  <Bar
                    dataKey="producedQty"
                    name="Daily Plating Output (PCS)"
                    fill="#3b82f6"
                    radius={[4, 4, 0, 0]}
                    opacity={0.85}
                  />
                  <Bar
                    dataKey="reworkQty"
                    name="Rework Returned (PCS)"
                    fill="#ea580c"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div style={{ fontSize: 11, color: token.colorTextSecondary, marginTop: 8, textAlign: 'center' }}>
              Spoke Plating is the primary production hub (~222k PCS daily). Rework loops are strictly isolated from new production output.
            </div>
          </div>
        )}
      </Card>

{/* Filter Toolbar */}
      <Card
        bordered={false}
        style={{
          background: token.colorBgContainer,
          borderRadius: 8,
          border: `1px solid ${token.colorBorderSecondary}`,
          marginBottom: 16,
        }}
      >
        <Row gutter={[12, 12]} align="middle">
          <Col xs={24} sm={12} md={5}>
            <Select
              allowClear
              placeholder="All Divisions"
              style={{ width: '100%' }}
              value={selectedDivision}
              onChange={(val) => {
                setSelectedDivision(val);
                setPage(1);
              }}
              options={divisions.map(d => ({ label: d.name, value: d.id }))}
            />
          </Col>
          <Col xs={24} sm={12} md={5}>
            <Select
              allowClear
              placeholder="From Department (Sender)"
              style={{ width: '100%' }}
              value={selectedFromDept}
              onChange={(val) => {
                setSelectedFromDept(val);
                setPage(1);
              }}
              options={filterDepartments.map(d => ({ label: d.name, value: d.id }))}
            />
          </Col>
          <Col xs={24} sm={12} md={5}>
            <Select
              allowClear
              placeholder="To Department (Reworker)"
              style={{ width: '100%' }}
              value={selectedToDept}
              onChange={(val) => {
                setSelectedToDept(val);
                setPage(1);
              }}
              options={filterDepartments.map(d => ({ label: d.name, value: d.id }))}
            />
          </Col>
          <Col xs={24} sm={12} md={4}>
            <Select
              style={{ width: '100%' }}
              value={selectedStatus}
              onChange={(val) => {
                setSelectedStatus(val);
                setPage(1);
              }}
              options={[
                { label: 'All Statuses', value: 'ALL' },
                { label: 'Dispatched', value: 'DISPATCHED' },
                { label: 'Acknowledged', value: 'ACKNOWLEDGED' },
                { label: 'In Rework', value: 'IN_REWORK' },
                { label: 'Rectified', value: 'RECTIFIED' },
                { label: 'Closed / Returned', value: 'CLOSED' },
                { label: 'Scrapped', value: 'SCRAPPED' },
              ]}
            />
          </Col>
          <Col xs={24} sm={12} md={5}>
            <Input
              placeholder="Search Return #, Item, Person..."
              prefix={<SearchOutlined style={{ color: token.colorTextTertiary }} />}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onPressEnter={() => {
                setPage(1);
                fetchData();
              }}
              allowClear
            />
          </Col>
        </Row>
      </Card>

      {/* Main Table */}
      <Card
        bordered={false}
        style={{
          background: token.colorBgContainer,
          borderRadius: 8,
          border: `1px solid ${token.colorBorderSecondary}`,
        }}
      >
        <Table
          columns={columns}
          dataSource={records}
          rowKey="id"
          loading={loading}
          pagination={{
            current: page,
            pageSize,
            total,
            showSizeChanger: true,
            pageSizeOptions: ['10', '25', '50', '100'],
            onChange: (p, s) => {
              setPage(p);
              setPageSize(s);
            },
          }}
          scroll={{ x: 1200 }}
        />
      </Card>

      {/* Modal: New Production Rework Return */}
      <Modal
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <RollbackOutlined style={{ color: '#e11d48' }} />
            <span>New Inter-Department Production Return &amp; Rework Request</span>
          </div>
        }
        open={createModalOpen}
        onCancel={() => setCreateModalOpen(false)}
        onOk={handleCreateSubmit}
        confirmLoading={submitting}
        okText="Dispatch Rework Return"
        width="min(760px, 96vw)"
        style={{ maxWidth: '96vw', top: 20 }}
      >
        <Alert
          type="info"
          showIcon
          message="Zero-Double-Count Guarantee"
          description="Material returned for rework is tracked separately from primary production. When re-plated or rectified, this quantity will NOT be counted as new production output."
          style={{ marginBottom: 16 }}
        />

        <Form form={createForm} layout="vertical">
          {/* Row 1: Division, Return Date, Priority */}
          <Row gutter={16}>
            <Col xs={24} sm={8}>
              <Form.Item name="divisionId" label="Manufacturing Division" rules={[{ required: true, message: 'Please select division' }]}>
                <Select
                  placeholder="Select Division"
                  onChange={handleModalDivisionChange}
                  options={divisions.map(d => ({ label: `${d.name} (${d.divisionCode || ''})`, value: d.id }))}
                />
              </Form.Item>
            </Col>
            <Col xs={24} sm={8}>
              <Form.Item name="returnDate" label="Return Date" rules={[{ required: true }]}>
                <DatePicker style={{ width: '100%' }} format="YYYY-MM-DD" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={8}>
              <Form.Item name="priority" label="Priority" rules={[{ required: true }]}>
                <Select
                  options={[
                    { label: 'Normal Priority', value: 'NORMAL' },
                    { label: 'High Priority', value: 'HIGH' },
                    { label: 'Urgent / Line Stop', value: 'URGENT' },
                  ]}
                />
              </Form.Item>
            </Col>
          </Row>

          {/* Row 2: Department Flow (From Sender ➔ To Rework) */}
          <Row gutter={16}>
            <Col xs={24} sm={12}>
              <Form.Item 
                name="fromDepartmentId" 
                label="From Department (Defective Material Sender)" 
                rules={[{ required: true, message: 'Select sender department' }]}
              >
                <Select
                  placeholder="Select Sending Department"
                  showSearch
                  optionFilterProp="label"
                  options={modalDepartments.map(d => ({ 
                    label: `${d.name} (${d.departmentCode || ''})`, 
                    value: d.id 
                  }))}
                />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item 
                name="toDepartmentId" 
                label="To Department (Target Rework / Rectification)" 
                rules={[{ required: true, message: 'Select rework department' }]}
              >
                <Select
                  placeholder="Select Rework Department"
                  showSearch
                  optionFilterProp="label"
                  onChange={(val) => {
                    createForm.setFieldsValue({
                      toDepartmentId: val,
                      itemId: undefined,
                      uomId: undefined,
                    });
                  }}
                  options={modalDepartments.map(d => ({ 
                    label: `${d.name} (${d.departmentCode || ''})`, 
                    value: d.id 
                  }))}
                />
              </Form.Item>
            </Col>
          </Row>

          {/* Visual Transfer Pathway Banner */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '8px 14px',
            background: 'var(--theme-surface-alt, rgba(0,0,0,0.03))',
            borderRadius: 6,
            marginBottom: 16,
            border: `1px dashed ${token.colorBorderSecondary}`,
          }}>
            <Space>
              <Tag color="volcano" style={{ fontWeight: 700 }}>FROM (SENDER)</Tag>
              <span style={{ fontWeight: 600, color: token.colorText }}>
                {modalDepartments.find(d => d.id === modalFromDeptId)?.name || 'Select Sender'}
              </span>
            </Space>
            <ArrowRightOutlined style={{ fontSize: 16, color: token.colorPrimary }} />
            <Space>
              <Tag color="green" style={{ fontWeight: 700 }}>TO (REWORK DESTINATION)</Tag>
              <span style={{ fontWeight: 600, color: token.colorText }}>
                {modalDepartments.find(d => d.id === modalToDeptId)?.name || 'Select Destination'}
              </span>
            </Space>
          </div>

          {/* Row 3: Defective Item & UOM */}
          <Row gutter={16}>
            <Col xs={24} sm={16}>
              <Form.Item 
                name="itemId" 
                label={`Defective Component for Target Department (${modalDepartments.find(d => d.id === modalToDeptId)?.name || 'Destination'})`}
                rules={[{ required: true, message: 'Please select defective item' }]}
                extra={
                  modalItemObj ? (
                    <div style={{
                      marginTop: 6,
                      padding: '8px 12px',
                      borderRadius: 6,
                      background: 'var(--theme-surface-alt, rgba(0,0,0,0.02))',
                      border: `1px solid ${token.colorBorderSecondary}`,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 4,
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
                        <Space size={6}>
                          <Tag color={
                            modalItemObj.itemCode?.startsWith('WIP-SPL') ? (modalItemObj.name?.toLowerCase().includes('inner') ? 'blue' : 'cyan') :
                            modalItemObj.itemCode?.startsWith('FG-NP') || modalItemObj.itemCode?.startsWith('WIP-NPL') ? 'purple' :
                            modalItemObj.itemCode?.startsWith('WIP-SPK') ? 'geekblue' :
                            modalItemObj.itemCode?.startsWith('SPI-FG') ? 'green' : 'default'
                          } style={{ fontWeight: 700, margin: 0 }}>
                            {modalItemObj.stageLabel || (
                              modalItemObj.itemCode?.startsWith('WIP-SPL') ? (modalItemObj.name?.toLowerCase().includes('inner') ? 'Plated Inner Spoke' : 'Plated Outer Spoke') :
                              modalItemObj.itemCode?.startsWith('FG-NP') ? 'Plated Nipple' :
                              modalItemObj.itemCode?.startsWith('WIP-SPK') ? 'Heading Spoke' :
                              modalItemObj.itemCode?.startsWith('SPI-FG') ? 'Packed Carton FG' : 'WIP Component'
                            )}
                          </Tag>
                          <strong style={{ color: token.colorText }}>{modalItemObj.name}</strong>
                        </Space>
                        <Tag color="volcano" style={{ fontWeight: 700, margin: 0 }}>REWORK (NON-COUNT)</Tag>
                      </div>
                      <div style={{ fontSize: 11, color: token.colorTextSecondary }}>
                        {modalItemObj.itemCode?.startsWith('WIP-SPL') ? (
                          'Inter-department component returned to Spoke Plating for chemical strip & re-plating. Carton packaging happens only after plating is verified.'
                        ) : modalItemObj.itemCode?.startsWith('FG-NP') ? (
                          'Plated nipple returned to Nipple Plating for rework. Does not affect carton finished goods assembly until rectified.'
                        ) : modalItemObj.itemCode?.startsWith('WIP-SPK') ? (
                          'Unplated heading spoke returned to Header shop for burr / thread rectification.'
                        ) : modalItemObj.itemCode?.startsWith('SPI-FG') ? (
                          'Fully packed finished carton returned for disassembly / rework.'
                        ) : (
                          'Shopfloor material tracked independently with zero double counting.'
                        )}
                      </div>
                    </div>
                  ) : null
                }
              >
                <Select
                  showSearch
                  placeholder="Select defective WIP component (e.g. WIP-SPL Inner/Outer, FG-NP Nipple)..."
                  optionFilterProp="label"
                  filterOption={(input, option) =>
                    (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
                  }
                  options={groupedModalItemOptions}
                  onChange={handleItemSelect}
                />
              </Form.Item>
            </Col>
            <Col xs={24} sm={8}>
              <Form.Item name="uomId" label="Unit of Measure (UOM)" rules={[{ required: true, message: 'Select UOM' }]}>
                <Select
                  showSearch
                  placeholder="Select UOM"
                  optionFilterProp="label"
                  options={uoms.map(u => ({ label: `${u.code} (${u.name})`, value: u.id }))}
                />
              </Form.Item>
            </Col>
          </Row>

          {/* Row 4: Quantity & Dispatched By */}
          <Row gutter={16}>
            <Col xs={24} sm={12}>
              <Form.Item 
                name="quantity" 
                label="Return Quantity" 
                rules={[{ required: true, message: 'Please enter return quantity' }]}
                extra={
                  modalItemObj?.itemCode?.includes('SPK') || modalItemObj?.itemCode?.includes('NP') ? (
                    <span style={{ fontSize: 11, color: token.colorTextSecondary }}>
                      Standard: 144 Pieces = 1 Gross (GRS). Enter in Pieces (PCS).
                    </span>
                  ) : null
                }
              >
                <InputNumber
                  style={{ width: '100%' }}
                  min={0.01}
                  placeholder="e.g. 500"
                  onFocus={(e) => e.target.select()}
                />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="returnedBy" label="Dispatched By (Inspector / Supervisor)">
                <Input placeholder="e.g. Muhammad Aslam (Packing Supervisor)" />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col xs={24} sm={12}>
              <Form.Item name="defectReason" label="Defect Reason" rules={[{ required: true, message: 'Select or add defect reason' }]}>
                <Select
                  showSearch
                  placeholder="Select defect reason"
                  optionFilterProp="label"
                  options={defectReasonOptions}
                  dropdownRender={(menu) => (
                    <>
                      {menu}
                      <Divider style={{ margin: '8px 0' }} />
                      <Space style={{ padding: '0 8px 4px', display: 'flex', width: '100%' }}>
                        <Input
                          placeholder="Add new defect reason..."
                          value={newReasonInput}
                          onChange={(e) => setNewReasonInput(e.target.value)}
                          onKeyDown={(e) => e.stopPropagation()}
                          onPressEnter={() => handleAddNewReason(createForm)}
                          style={{ flex: 1 }}
                        />
                        <Button
                          type="primary"
                          icon={<PlusOutlined />}
                          loading={addingReason}
                          onClick={() => handleAddNewReason(createForm)}
                          style={{ background: '#059669', borderColor: '#059669' }}
                        >
                          Add
                        </Button>
                      </Space>
                    </>
                  )}
                />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="correctiveAction" label="Required Corrective Action" rules={[{ required: true, message: 'Select or add corrective action' }]}>
                <Select
                  showSearch
                  placeholder="Select corrective action"
                  optionFilterProp="label"
                  options={correctiveActionOptions}
                  dropdownRender={(menu) => (
                    <>
                      {menu}
                      <Divider style={{ margin: '8px 0' }} />
                      <Space style={{ padding: '0 8px 4px', display: 'flex', width: '100%' }}>
                        <Input
                          placeholder="Add new corrective action..."
                          value={newActionInput}
                          onChange={(e) => setNewActionInput(e.target.value)}
                          onKeyDown={(e) => e.stopPropagation()}
                          onPressEnter={() => handleAddNewAction(createForm)}
                          style={{ flex: 1 }}
                        />
                        <Button
                          type="primary"
                          icon={<PlusOutlined />}
                          loading={addingAction}
                          onClick={() => handleAddNewAction(createForm)}
                          style={{ background: '#059669', borderColor: '#059669' }}
                        >
                          Add
                        </Button>
                      </Space>
                    </>
                  )}
                />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item name="defectDescription" label="Defect Details / Observations">
            <Input.TextArea rows={2} placeholder="Specify defect details (e.g. Plating peeling off on 20% of spoke heads, requires chemical strip and re-plating)" />
          </Form.Item>

          <Form.Item name="remarks" label="Supervisor Notes / Batch Reference">
            <Input placeholder="Optional reference notes" />
          </Form.Item>
        </Form>
      </Modal>

      {/* Modal: Edit Rework Return */}
      <Modal
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <EditOutlined style={{ color: token.colorPrimary }} />
            <span>Edit Rework Return: {selectedRecord?.returnNumber}</span>
          </div>
        }
        open={editModalOpen}
        onCancel={() => setEditModalOpen(false)}
        onOk={handleEditSubmit}
        confirmLoading={submitting}
        width="min(760px, 96vw)"
        style={{ maxWidth: '96vw', top: 20 }}
        okText="Save Changes"
        destroyOnClose
      >
        <Form form={editForm} layout="vertical">
          <Row gutter={16}>
            <Col xs={24} sm={8}>
              <Form.Item name="divisionId" label="Manufacturing Division" rules={[{ required: true }]}>
                <Select
                  options={divisions.map(d => ({ label: `${d.name} (${d.divisionCode || ''})`, value: d.id }))}
                />
              </Form.Item>
            </Col>
            <Col xs={24} sm={8}>
              <Form.Item name="returnDate" label="Return Date" rules={[{ required: true }]}>
                <DatePicker style={{ width: '100%' }} format="YYYY-MM-DD" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={8}>
              <Form.Item name="priority" label="Priority" rules={[{ required: true }]}>
                <Select
                  options={[
                    { label: 'Normal Priority', value: 'NORMAL' },
                    { label: 'High Priority', value: 'HIGH' },
                    { label: 'Urgent / Line Stop', value: 'URGENT' },
                  ]}
                />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col xs={24} sm={12}>
              <Form.Item 
                name="fromDepartmentId" 
                label="From Department (Sender)" 
                rules={[{ required: true }]}
              >
                <Select
                  showSearch
                  optionFilterProp="label"
                  options={modalDepartments.map(d => ({ 
                    label: `${d.name} (${d.departmentCode || ''})`, 
                    value: d.id 
                  }))}
                />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item 
                name="toDepartmentId" 
                label="To Department (Target Rework)" 
                rules={[{ required: true }]}
              >
                <Select
                  showSearch
                  optionFilterProp="label"
                  onChange={(val) => {
                    editForm.setFieldsValue({
                      toDepartmentId: val,
                      itemId: undefined,
                      uomId: undefined,
                    });
                  }}
                  options={modalDepartments.map(d => ({ 
                    label: `${d.name} (${d.departmentCode || ''})`, 
                    value: d.id 
                  }))}
                />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col xs={24} sm={16}>
              <Form.Item 
                name="itemId" 
                label={`Defective Component for (${modalDepartments.find(d => d.id === modalEditToDeptId)?.name || 'Destination'})`}
                rules={[{ required: true, message: 'Please select defective item' }]}
              >
                <Select
                  showSearch
                  placeholder="Select defective WIP component..."
                  optionFilterProp="label"
                  filterOption={(input, option) =>
                    (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
                  }
                  options={editModalItemOptions}
                  onChange={(itemId) => {
                    const sel = allItemPool.find(i => i.id === itemId);
                    if (sel) {
                      const uomId = sel.uomId || sel.baseUomId || sel.baseUom?.id || uoms[0]?.id;
                      editForm.setFieldsValue({ itemId, uomId });
                    }
                  }}
                />
              </Form.Item>
            </Col>
            <Col xs={24} sm={8}>
              <Form.Item name="uomId" label="Unit of Measure (UOM)" rules={[{ required: true }]}>
                <Select
                  options={uoms.map(u => ({ label: `${u.code} (${u.name})`, value: u.id }))}
                />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col xs={24} sm={12}>
              <Form.Item 
                name="quantity" 
                label="Return Quantity" 
                rules={[{ required: true, message: 'Please enter return quantity' }]}
              >
                <InputNumber
                  style={{ width: '100%' }}
                  min={0.01}
                  placeholder="e.g. 500"
                  onFocus={(e) => e.target.select()}
                />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="returnedBy" label="Dispatched By">
                <Input placeholder="Supervisor name" />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col xs={24} sm={12}>
              <Form.Item name="defectReason" label="Defect Reason" rules={[{ required: true, message: 'Select or add defect reason' }]}>
                <Select
                  showSearch
                  placeholder="Select defect reason"
                  optionFilterProp="label"
                  options={defectReasonOptions}
                  dropdownRender={(menu) => (
                    <>
                      {menu}
                      <Divider style={{ margin: '8px 0' }} />
                      <Space style={{ padding: '0 8px 4px', display: 'flex', width: '100%' }}>
                        <Input
                          placeholder="Add new defect reason..."
                          value={newReasonInput}
                          onChange={(e) => setNewReasonInput(e.target.value)}
                          onKeyDown={(e) => e.stopPropagation()}
                          onPressEnter={() => handleAddNewReason(editForm)}
                          style={{ flex: 1 }}
                        />
                        <Button
                          type="primary"
                          icon={<PlusOutlined />}
                          loading={addingReason}
                          onClick={() => handleAddNewReason(editForm)}
                          style={{ background: '#059669', borderColor: '#059669' }}
                        >
                          Add
                        </Button>
                      </Space>
                    </>
                  )}
                />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="correctiveAction" label="Required Corrective Action" rules={[{ required: true, message: 'Select or add corrective action' }]}>
                <Select
                  showSearch
                  placeholder="Select corrective action"
                  optionFilterProp="label"
                  options={correctiveActionOptions}
                  dropdownRender={(menu) => (
                    <>
                      {menu}
                      <Divider style={{ margin: '8px 0' }} />
                      <Space style={{ padding: '0 8px 4px', display: 'flex', width: '100%' }}>
                        <Input
                          placeholder="Add new corrective action..."
                          value={newActionInput}
                          onChange={(e) => setNewActionInput(e.target.value)}
                          onKeyDown={(e) => e.stopPropagation()}
                          onPressEnter={() => handleAddNewAction(editForm)}
                          style={{ flex: 1 }}
                        />
                        <Button
                          type="primary"
                          icon={<PlusOutlined />}
                          loading={addingAction}
                          onClick={() => handleAddNewAction(editForm)}
                          style={{ background: '#059669', borderColor: '#059669' }}
                        >
                          Add
                        </Button>
                      </Space>
                    </>
                  )}
                />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item name="defectDescription" label="Defect Details / Observations">
            <Input.TextArea rows={2} />
          </Form.Item>

          <Form.Item name="remarks" label="Supervisor Notes / Batch Reference">
            <Input />
          </Form.Item>
        </Form>
      </Modal>

      {/* Modal: Process / Update Status */}
      <Modal
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <ToolOutlined style={{ color: token.colorPrimary }} />
            <span>Process Rework Return: {selectedRecord?.returnNumber}</span>
          </div>
        }
        open={statusModalOpen}
        onCancel={() => setStatusModalOpen(false)}
        onOk={handleStatusSubmit}
        confirmLoading={submitting}
        okText="Update Status"
        width="min(600px, 96vw)"
        style={{ maxWidth: '96vw', top: 20 }}
      >
        {selectedRecord && (
          <Form form={statusForm} layout="vertical">
            <div style={{ padding: 12, background: 'var(--theme-surface-alt, rgba(148, 163, 184, 0.08))', borderRadius: 8, marginBottom: 16 }}>
              <div><strong>Item:</strong> {selectedRecord.item?.name} ({selectedRecord.item?.itemCode})</div>
              <div><strong>Return Qty:</strong> {formatDecimal(selectedRecord.quantity)} {selectedRecord.uom?.code}</div>
              <div><strong>Route:</strong> {selectedRecord.fromDepartment?.name} ➔ {selectedRecord.toDepartment?.name}</div>
              <div><strong>Defect:</strong> {DEFECT_REASONS[selectedRecord.defectReason]?.label || selectedRecord.defectReason}</div>
            </div>

            <Form.Item name="status" label="New Rework Status" rules={[{ required: true }]}>
              <Select
                options={[
                  { label: 'ACKNOWLEDGED - Received by target department', value: 'ACKNOWLEDGED' },
                  { label: 'IN_REWORK - Currently under rework / re-plating', value: 'IN_REWORK' },
                  { label: 'RECTIFIED - Rework completed and passed inspection', value: 'RECTIFIED' },
                  { label: 'CLOSED - Material returned back to originating department', value: 'CLOSED' },
                  { label: 'SCRAPPED - Cannot be reworked (Declare Scrap)', value: 'SCRAPPED' },
                ]}
              />
            </Form.Item>

            <Form.Item name="receivedBy" label="Rework Handler / Supervisor">
              <Input placeholder="e.g. Tariq Mehmood (Plating Supervisor)" />
            </Form.Item>

            <Row gutter={16}>
              <Col xs={24} sm={12}>
                <Form.Item name="rectifiedQuantity" label="Rectified Quantity Passed">
                  <InputNumber
                    style={{ width: '100%' }}
                    min={0}
                    placeholder="Passed quantity"
                    onFocus={(e) => e.target.select()}
                  />
                </Form.Item>
              </Col>
              <Col xs={24} sm={12}>
                <Form.Item name="scrappedQuantity" label="Scrapped Quantity">
                  <InputNumber
                    style={{ width: '100%' }}
                    min={0}
                    placeholder="0"
                    onFocus={(e) => e.target.select()}
                  />
                </Form.Item>
              </Col>
            </Row>

            <Form.Item name="remarks" label="Process Notes">
              <Input.TextArea rows={2} placeholder="Rework details, chemical bath numbers, or reasons for any scrap" />
            </Form.Item>
          </Form>
        )}
      </Modal>

      {/* Modal: View Details */}
      <Modal
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <RollbackOutlined style={{ color: '#e11d48' }} />
            <span>Rework Return Details: {selectedRecord?.returnNumber}</span>
          </div>
        }
        open={detailModalOpen}
        onCancel={() => setDetailModalOpen(false)}
        footer={[
          <Button key="close" onClick={() => setDetailModalOpen(false)}>
            Close
          </Button>,
          <Button
            key="print"
            type="primary"
            icon={<PrinterOutlined />}
            onClick={() => window.print()}
          >
            Print Gate Pass / Slip
          </Button>,
        ]}
        width="min(680px, 96vw)"
        style={{ maxWidth: '96vw', top: 20 }}
      >
        {selectedRecord && (
          <div style={{ fontSize: 13, lineHeight: '24px' }}>
            <Row gutter={[16, 8]}>
              <Col xs={24} sm={12}>
                <Text type="secondary">Return Number:</Text>
                <div><Tag color="orange" style={{ fontWeight: 800 }}>{selectedRecord.returnNumber}</Tag></div>
              </Col>
              <Col xs={24} sm={12}>
                <Text type="secondary">Return Date:</Text>
                <div><strong>{dayjs(selectedRecord.returnDate).format('DD-MMM-YYYY')}</strong></div>
              </Col>
              <Col xs={24} sm={12}>
                <Text type="secondary">Originating Department:</Text>
                <div><Tag color="volcano">{selectedRecord.fromDepartment?.name}</Tag></div>
              </Col>
              <Col xs={24} sm={12}>
                <Text type="secondary">Target Rework Department:</Text>
                <div><Tag color="green">{selectedRecord.toDepartment?.name}</Tag></div>
              </Col>
              <Col span={24}>
                <Divider style={{ margin: '8px 0' }} />
                <Text type="secondary">Item Description:</Text>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{selectedRecord.item?.name}</div>
                <div style={{ color: token.colorTextSecondary }}>Code: {selectedRecord.item?.itemCode}</div>
              </Col>
              <Col xs={24} sm={12}>
                <Text type="secondary">Quantity Returned:</Text>
                <div style={{ fontSize: 16, fontWeight: 800, color: '#e11d48' }}>
                  {formatDecimal(selectedRecord.quantity)} {selectedRecord.uom?.code}
                </div>
              </Col>
              <Col xs={24} sm={12}>
                <Text type="secondary">Status:</Text>
                <div>{renderStatusTag(selectedRecord.status)}</div>
              </Col>
              <Col xs={24} sm={12}>
                <Text type="secondary">Defect Reason:</Text>
                <div><strong>{DEFECT_REASONS[selectedRecord.defectReason]?.label || selectedRecord.defectReason}</strong></div>
              </Col>
              <Col xs={24} sm={12}>
                <Text type="secondary">Corrective Action:</Text>
                <div><strong>{CORRECTIVE_ACTIONS[selectedRecord.correctiveAction] || selectedRecord.correctiveAction}</strong></div>
              </Col>
              <Col xs={24} sm={12}>
                <Text type="secondary">Dispatched By:</Text>
                <div>{selectedRecord.returnedBy || '-'}</div>
              </Col>
              <Col xs={24} sm={12}>
                <Text type="secondary">Received / Handled By:</Text>
                <div>{selectedRecord.receivedBy || '-'}</div>
              </Col>
              {selectedRecord.defectDescription && (
                <Col span={24}>
                  <Text type="secondary">Defect Notes:</Text>
                  <div style={{ padding: 8, background: 'var(--theme-surface-alt, rgba(148, 163, 184, 0.08))', borderRadius: 6 }}>
                    {selectedRecord.defectDescription}
                  </div>
                </Col>
              )}
              {selectedRecord.remarks && (
                <Col span={24}>
                  <Text type="secondary">Audit / Process Remarks:</Text>
                  <div style={{ padding: 8, background: 'var(--theme-surface-alt, rgba(148, 163, 184, 0.08))', borderRadius: 6 }}>
                    {selectedRecord.remarks}
                  </div>
                </Col>
              )}
            </Row>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default ProductionReworkReturn;
