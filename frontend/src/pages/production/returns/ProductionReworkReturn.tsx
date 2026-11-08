import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Table, Card, Row, Col, Select, Input, InputNumber, Button, Tag, Space,
  App, Modal, Form, DatePicker, Tooltip, Badge, theme, Tabs, Typography, Divider, Alert,
} from 'antd';
import {
  RollbackOutlined, ReloadOutlined, FileExcelOutlined, SearchOutlined,
  PlusOutlined, CheckCircleOutlined, ClockCircleOutlined, SyncOutlined,
  CloseCircleOutlined, ArrowRightOutlined, ToolOutlined,
  ExclamationCircleOutlined, ThunderboltOutlined, CopyOutlined, PrinterOutlined, EyeOutlined,
} from '@ant-design/icons';
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

  // Modals
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [statusModalOpen, setStatusModalOpen] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState<ReworkReturnRecord | null>(null);
  const [detailModalOpen, setDetailModalOpen] = useState(false);

  const [createForm] = Form.useForm();
  const [statusForm] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);

  // Form watches for cascading filters in create modal
  const modalDivisionId = Form.useWatch('divisionId', createForm);
  const modalFromDeptId = Form.useWatch('fromDepartmentId', createForm);
  const modalToDeptId = Form.useWatch('toDepartmentId', createForm);
  const modalItemId = Form.useWatch('itemId', createForm);

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
    stageItems.forEach(i => map.set(i.id, i));
    items.forEach(i => {
      if (!map.has(i.id)) map.set(i.id, i);
    });
    return Array.from(map.values());
  }, [stageItems, items]);

  // Grouped Item Options for Modal Select
  const groupedModalItemOptions = useMemo(() => {
    const pool = allItemPool;
    const fromDept = modalDepartments.find(d => d.id === modalFromDeptId);
    const toDept = modalDepartments.find(d => d.id === modalToDeptId);
    const fromName = (fromDept?.name || '').toLowerCase();
    const toName = (toDept?.name || '').toLowerCase();

    // Recommendation logic
    const isRecommended = (item: any) => {
      if (item.isRecommended) return true;
      const code = item.itemCode || '';
      if ((fromName.includes('packing') || fromDept?.departmentCode === 'SPD-DEPT008') &&
          (toName.includes('plating') || toDept?.departmentCode === 'SPD-DEPT006')) {
        return code.startsWith('WIP-SPL') || code.startsWith('FG-NP') || code.startsWith('WIP-NPL');
      }
      if ((fromName.includes('plating') || fromDept?.departmentCode === 'SPD-DEPT006') &&
          (toName.includes('spoke') || toName.includes('header') || toDept?.departmentCode === 'SPD-DEPT003')) {
        return code.startsWith('WIP-SPK');
      }
      if ((fromName.includes('spoke') || fromName.includes('header')) &&
          (toName.includes('swag') || toName.includes('straight'))) {
        return code.startsWith('WIP-SW') || code.startsWith('WIP-ST');
      }
      return false;
    };

    const recommendedList: any[] = [];
    const platedList: any[] = [];
    const headingList: any[] = [];
    const wireList: any[] = [];
    const cartonList: any[] = [];
    const otherList: any[] = [];

    pool.forEach(item => {
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
        } else if (code.startsWith('SPI-FG-SPK')) {
          stageLabel = 'Packed Carton (FG)';
        }
      }

      const formattedOption = {
        label: `[${code}] ${name} ${stageLabel ? `(${stageLabel})` : ''}`,
        value: item.id,
        itemCode: code,
        name: name,
        stageLabel: stageLabel,
        raw: item,
      };

      if (isRecommended(item)) {
        recommendedList.push(formattedOption);
      } else if (code.startsWith('WIP-SPL') || code.startsWith('FG-NP') || code.startsWith('WIP-NPL')) {
        platedList.push(formattedOption);
      } else if (code.startsWith('WIP-SPK')) {
        headingList.push(formattedOption);
      } else if (code.startsWith('WIP-SW') || code.startsWith('WIP-ST')) {
        wireList.push(formattedOption);
      } else if (code.startsWith('SPI-FG')) {
        cartonList.push(formattedOption);
      } else {
        otherList.push(formattedOption);
      }
    });

    // Prioritize WIP-SPL (Inner & Outer Spokes) at the top of recommendations & plated groups
    const sortByWipSpl = (a: any, b: any) => {
      const aIsSpl = (a.itemCode || '').startsWith('WIP-SPL');
      const bIsSpl = (b.itemCode || '').startsWith('WIP-SPL');
      if (aIsSpl && !bIsSpl) return -1;
      if (!aIsSpl && bIsSpl) return 1;
      return (a.itemCode || '').localeCompare(b.itemCode || '');
    };
    recommendedList.sort(sortByWipSpl);
    platedList.sort(sortByWipSpl);

    const groups: any[] = [];
    if (recommendedList.length > 0) {
      groups.push({
        label: `⭐ RECOMMENDED FOR THIS HANDOVER (${recommendedList.length})`,
        options: recommendedList,
      });
    }
    if (platedList.length > 0) {
      groups.push({
        label: `✨ PLATED COMPONENTS (SPOKES & NIPPLES) (${platedList.length})`,
        options: platedList,
      });
    }
    if (headingList.length > 0) {
      groups.push({
        label: `⚙️ UNPLATED HEADING COMPONENTS (${headingList.length})`,
        options: headingList,
      });
    }
    if (wireList.length > 0) {
      groups.push({
        label: `⛓️ WIRE PROCESSING WIP (STRAIGHT & SWAGGED) (${wireList.length})`,
        options: wireList,
      });
    }
    if (cartonList.length > 0) {
      groups.push({
        label: `📦 PACKED FINISHED GOODS (FULL CARTONS) (${cartonList.length})`,
        options: cartonList,
      });
    }
    if (otherList.length > 0 && groups.length === 0) {
      groups.push({
        label: `OTHER SHOPFLOOR ITEMS (${otherList.length})`,
        options: otherList.slice(0, 100),
      });
    }

    return groups;
  }, [allItemPool, modalDepartments, modalFromDeptId, modalToDeptId]);

  // Selected item object in modal
  const modalItemObj = useMemo(() => {
    return allItemPool.find(i => i.id === modalItemId);
  }, [allItemPool, modalItemId]);

  // Fetch Lookups (Divisions, Departments, Items, UOMs)
  useEffect(() => {
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
    });
    setCreateModalOpen(true);
  };

  // Header Actions
  const headerExtra = useMemo(() => (
    <Space>
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

  // Open Status Update Modal
  const handleOpenStatusModal = (record: ReworkReturnRecord) => {
    setSelectedRecord(record);
    statusForm.resetFields();
    statusForm.setFieldsValue({
      status: record.status === 'DISPATCHED' ? 'ACKNOWLEDGED' : record.status === 'ACKNOWLEDGED' ? 'IN_REWORK' : 'RECTIFIED',
      receivedBy: record.receivedBy || 'Plating Supervisor',
      rectifiedQuantity: record.rectifiedQuantity || record.quantity,
      scrappedQuantity: record.scrappedQuantity || 0,
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
      width: 140,
      align: 'center',
      render: (_, r) => (
        <Space size={4}>
          <Tooltip title="Update Rework / Receipt Status">
            <Button
              size="small"
              type="primary"
              icon={<ToolOutlined />}
              onClick={() => handleOpenStatusModal(r)}
            >
              Update
            </Button>
          </Tooltip>
          <Tooltip title="View Details">
            <Button
              size="small"
              icon={<EyeOutlined />}
              onClick={() => {
                setSelectedRecord(r);
                setDetailModalOpen(true);
              }}
            />
          </Tooltip>
        </Space>
      ),
    },
  ];

  return (
    <div style={{ padding: '16px 24px', minHeight: '100vh', background: 'var(--theme-surface)' }}>
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
        width={720}
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
                label="Defective Item (WIP Stage Component or FG)" 
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
                <InputNumber style={{ width: '100%' }} min={0.01} precision={2} placeholder="e.g. 500" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="returnedBy" label="Dispatched By (Inspector / Supervisor)">
                <Input placeholder="e.g. Muhammad Aslam (Packing Supervisor)" />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="defectReason" label="Defect Reason" rules={[{ required: true }]}>
                <Select
                  options={Object.entries(DEFECT_REASONS).map(([key, info]) => ({
                    label: info.label,
                    value: key,
                  }))}
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="correctiveAction" label="Required Corrective Action" rules={[{ required: true }]}>
                <Select
                  options={Object.entries(CORRECTIVE_ACTIONS).map(([key, label]) => ({
                    label,
                    value: key,
                  }))}
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
              <Col span={12}>
                <Form.Item name="rectifiedQuantity" label="Rectified Quantity Passed">
                  <InputNumber style={{ width: '100%' }} min={0} precision={2} />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item name="scrappedQuantity" label="Scrapped Quantity">
                  <InputNumber style={{ width: '100%' }} min={0} precision={2} />
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
        width={650}
      >
        {selectedRecord && (
          <div style={{ fontSize: 13, lineHeight: '24px' }}>
            <Row gutter={[16, 8]}>
              <Col span={12}>
                <Text type="secondary">Return Number:</Text>
                <div><Tag color="orange" style={{ fontWeight: 800 }}>{selectedRecord.returnNumber}</Tag></div>
              </Col>
              <Col span={12}>
                <Text type="secondary">Return Date:</Text>
                <div><strong>{dayjs(selectedRecord.returnDate).format('DD-MMM-YYYY')}</strong></div>
              </Col>
              <Col span={12}>
                <Text type="secondary">Originating Department:</Text>
                <div><Tag color="volcano">{selectedRecord.fromDepartment?.name}</Tag></div>
              </Col>
              <Col span={12}>
                <Text type="secondary">Target Rework Department:</Text>
                <div><Tag color="green">{selectedRecord.toDepartment?.name}</Tag></div>
              </Col>
              <Col span={24}>
                <Divider style={{ margin: '8px 0' }} />
                <Text type="secondary">Item Description:</Text>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{selectedRecord.item?.name}</div>
                <div style={{ color: token.colorTextSecondary }}>Code: {selectedRecord.item?.itemCode}</div>
              </Col>
              <Col span={12}>
                <Text type="secondary">Quantity Returned:</Text>
                <div style={{ fontSize: 16, fontWeight: 800, color: '#e11d48' }}>
                  {formatDecimal(selectedRecord.quantity)} {selectedRecord.uom?.code}
                </div>
              </Col>
              <Col span={12}>
                <Text type="secondary">Status:</Text>
                <div>{renderStatusTag(selectedRecord.status)}</div>
              </Col>
              <Col span={12}>
                <Text type="secondary">Defect Reason:</Text>
                <div><strong>{DEFECT_REASONS[selectedRecord.defectReason]?.label || selectedRecord.defectReason}</strong></div>
              </Col>
              <Col span={12}>
                <Text type="secondary">Corrective Action:</Text>
                <div><strong>{CORRECTIVE_ACTIONS[selectedRecord.correctiveAction] || selectedRecord.correctiveAction}</strong></div>
              </Col>
              <Col span={12}>
                <Text type="secondary">Dispatched By:</Text>
                <div>{selectedRecord.returnedBy || '-'}</div>
              </Col>
              <Col span={12}>
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
