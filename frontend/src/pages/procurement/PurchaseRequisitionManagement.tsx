import React, { useState, useEffect, useCallback } from 'react';
import {
  Table, Button, Space, Tag, Form, Input, Select, App, Card,
  Row, Col, DatePicker, Segmented, Tooltip, Popconfirm, Divider, Spin, Steps,
} from 'antd';
import {
  PlusOutlined, EditOutlined, SearchOutlined, SendOutlined, CheckOutlined,
  CloseOutlined, ReloadOutlined, ApartmentOutlined, ShopOutlined, GlobalOutlined,
  FileDoneOutlined, InfoCircleOutlined, PartitionOutlined, DeleteOutlined, EyeOutlined,
  PrinterOutlined, CalendarOutlined, CheckCircleOutlined, ClockCircleOutlined,
  FileTextOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import apiService from '../../services/api';
import { useUserStore } from '../../store/userStore';
import { ERPLineItems, ERPLine, DraggableResizableModal } from '../../components/shared';
import { printHtmlContent } from '../../utils/printTemplates';

interface PurchaseRequisition {
  id: string;
  requisitionCode: string;
  title?: string;
  description?: string;
  requestType: string;
  requestedDeliveryDate?: string;
  department?: string;
  divisionId?: string;
  divisionName?: string;
  warehouseId?: string;
  warehouseName?: string;
  purchaseType?: string;
  status: string;
  projectCode?: string;
  notes?: string;
}

interface DivisionOption {
  id: string;
  code?: string;
  name: string;
}

interface DepartmentOption {
  id: string;
  code?: string;
  name: string;
  divisionId?: string;
}

const DEFAULT_DIVISIONS: DivisionOption[] = [
  { id: 'd1000000-0000-0000-0000-000000000001', code: 'DIV-SPD', name: 'Spoke Division' },
  { id: 'd1000000-0000-0000-0000-000000000002', code: 'DIV-CCD', name: 'Control Cable Division' },
  { id: '83ecd746-1cc9-4849-bec4-d00bcc3ceeec', code: 'DIV-PWI', name: 'Main Division E-51' },
  { id: '50824516-9c24-4122-86e7-c8e6fa1c5869', code: 'DIV-001', name: 'Manufacturing Division' },
  { id: '3f222d46-6f96-44f6-9ead-27467c7e93a1', code: 'DIV-003', name: 'Supply Chain Division' },
  { id: 'b28f9d4f-53f3-4883-afb4-2af73c4dcca7', code: 'DIV-002', name: 'Sales & Marketing Division' },
];

const DEFAULT_DEPARTMENTS: DepartmentOption[] = [
  // Spoke Plant (DIV-SPD)
  { id: 'd3000000-0000-0000-0000-000000000001', code: 'SPD-DEPT001', name: 'Straightener Department', divisionId: 'd1000000-0000-0000-0000-000000000001' },
  { id: 'd3000000-0000-0000-0000-000000000002', code: 'SPD-DEPT002', name: 'Swagging Department', divisionId: 'd1000000-0000-0000-0000-000000000001' },
  { id: 'd3000000-0000-0000-0000-000000000003', code: 'SPD-DEPT003', name: 'Spoke Production Department', divisionId: 'd1000000-0000-0000-0000-000000000001' },
  { id: 'd3000000-0000-0000-0000-000000000004', code: 'SPD-DEPT004', name: 'Header Department', divisionId: 'd1000000-0000-0000-0000-000000000001' },
  { id: 'd3000000-0000-0000-0000-000000000005', code: 'SPD-DEPT005', name: 'Nipple Department', divisionId: 'd1000000-0000-0000-0000-000000000001' },
  { id: 'd3000000-0000-0000-0000-000000000006', code: 'SPD-DEPT006', name: 'Spoke Plating Department', divisionId: 'd1000000-0000-0000-0000-000000000001' },
  { id: 'd3000000-0000-0000-0000-000000000007', code: 'SPD-DEPT007', name: 'Nipple Plating Department', divisionId: 'd1000000-0000-0000-0000-000000000001' },
  { id: 'd3000000-0000-0000-0000-000000000008', code: 'SPD-DEPT008', name: 'Spoke Packing Department', divisionId: 'd1000000-0000-0000-0000-000000000001' },
  { id: 'd3000000-0000-0000-0000-000000000009', code: 'SPD-DEPT009', name: 'Facility Maintenance (SPD)', divisionId: 'd1000000-0000-0000-0000-000000000001' },

  // Control Cable Plant (DIV-CCD)
  { id: 'd3000000-0000-0000-0000-000000000010', code: 'CCD-DEPT001', name: 'Flattening Department', divisionId: 'd1000000-0000-0000-0000-000000000002' },
  { id: 'd3000000-0000-0000-0000-000000000011', code: 'CCD-DEPT002', name: 'Spiral Department', divisionId: 'd1000000-0000-0000-0000-000000000002' },
  { id: 'd3000000-0000-0000-0000-000000000012', code: 'CCD-DEPT003', name: 'PVC Extrusion Department', divisionId: 'd1000000-0000-0000-0000-000000000002' },
  { id: 'd3000000-0000-0000-0000-000000000013', code: 'CCD-DEPT004', name: 'CCD Packing Department', divisionId: 'd1000000-0000-0000-0000-000000000002' },
  { id: 'd8cf64a6-ebfc-4a94-a807-4960d3166752', code: 'CCD-DEPT111', name: 'CCD Stores', divisionId: 'd1000000-0000-0000-0000-000000000002' },

  // Central Departments
  { id: '959c34f7-b712-473f-975a-330535f0229d', code: 'CENT-SC', name: 'Supply Chain & Procurement', divisionId: '3f222d46-6f96-44f6-9ead-27467c7e93a1' },
  { id: '89e75347-5f07-400e-81b4-da06faaec104', code: 'CENT-MAINT', name: 'Central Engineering & Maintenance', divisionId: '83ecd746-1cc9-4849-bec4-d00bcc3ceeec' },
  { id: '29915792-70af-4bb0-be28-17bc77226c77', code: 'CENT-QE', name: 'Quality Assurance & Engineering', divisionId: 'a6b0f919-fcfc-4e31-85e0-ebd35766f9c2' },
  { id: 'fe0d5e8b-7cd2-428b-815b-5e32638ffd0a', code: 'CENT-IT', name: 'IT & Systems', divisionId: '83ecd746-1cc9-4849-bec4-d00bcc3ceeec' },
  { id: 'c50825a6-5ff0-49cf-9e6a-db832a4eb576', code: 'CENT-FIN', name: 'Accounts & Finance', divisionId: '9efc527e-811d-4b45-92ea-4a562ab212cc' },
  { id: 'cd29a8bb-6564-412c-92f4-89876d6a4368', code: 'CENT-HR', name: 'Human Resources', divisionId: '9efc527e-811d-4b45-92ea-4a562ab212cc' },
  { id: '02a79d88-033b-4401-979b-ff0ee7b4f756', code: 'CENT-ADM', name: 'Administration & Security', divisionId: '9efc527e-811d-4b45-92ea-4a562ab212cc' },
];

const DEFAULT_WAREHOUSES: Array<{ id: string; warehouseCode: string; name: string; warehouseType?: string; divisionId?: string }> = [
  // Spoke Division Stores & Warehouses
  { id: '2ec20775-616c-4c6e-818e-1f76912d6dfa', warehouseCode: 'SPI-ST-001', name: 'ST Straightener Department', warehouseType: 'WORK_IN_PROGRESS', divisionId: 'd1000000-0000-0000-0000-000000000001' },
  { id: 'd5685ddf-923a-4f7c-ba19-a5715cafa02e', warehouseCode: 'SPI-SW-002', name: 'SW Swagging Department', warehouseType: 'WORK_IN_PROGRESS', divisionId: 'd1000000-0000-0000-0000-000000000001' },
  { id: 'a70e0a7e-2ffa-47e4-83a9-c894d9dff41b', warehouseCode: 'SPI-PL-004', name: 'SPL Spoke Plating Department', warehouseType: 'WORK_IN_PROGRESS', divisionId: 'd1000000-0000-0000-0000-000000000001' },
  { id: 'a4c9ee6c-938f-4c34-b293-6686cfc3add3', warehouseCode: 'RM-002-SPI', name: 'SPI Raw Material Warehouse', warehouseType: 'RAW_MATERIAL', divisionId: 'd1000000-0000-0000-0000-000000000001' },
  { id: 'cf5c9db8-5e84-41d5-a4b4-988b8dfd122d', warehouseCode: 'WH-002', name: 'SPI Nipple Packing Warehouse', warehouseType: 'FINISHED_GOODS', divisionId: 'd1000000-0000-0000-0000-000000000001' },
  { id: '2f6aabde-69c1-4068-a0ea-b0fe1b8fb0b5', warehouseCode: 'SPI-FGDW-001', name: 'SPI FG Dispatch Warehouse', warehouseType: 'FINISHED_GOODS', divisionId: 'd1000000-0000-0000-0000-000000000001' },

  // Control Cable Division Stores
  { id: '64a9a1b1-dee5-4da4-ab3e-ae68d04999a7', warehouseCode: 'CCD-FT-001', name: 'FT Production Department', warehouseType: 'WORK_IN_PROGRESS', divisionId: 'd1000000-0000-0000-0000-000000000002' },
  { id: 'dc212cb0-364c-47ba-88db-1bde18f842de', warehouseCode: 'CCD-SP-002', name: 'SP Production Department', warehouseType: 'WORK_IN_PROGRESS', divisionId: 'd1000000-0000-0000-0000-000000000002' },
  { id: '37dac1e5-a0b9-479a-b63e-3849a0dd0dd8', warehouseCode: 'CCD-PVC-003', name: 'PVC Production Department', warehouseType: 'WORK_IN_PROGRESS', divisionId: 'd1000000-0000-0000-0000-000000000002' },
  { id: '45de05e2-d7d0-45d1-936f-425e317362db', warehouseCode: 'RM-001-CCD', name: 'CCD Raw Material Warehouse', warehouseType: 'RAW_MATERIAL', divisionId: 'd1000000-0000-0000-0000-000000000002' },
  { id: 'c7735271-bc28-48ce-8f17-bf6241eb6b5a', warehouseCode: 'WH-001', name: 'CCD Main Warehouse', warehouseType: 'FINISHED_GOODS', divisionId: 'd1000000-0000-0000-0000-000000000002' },

  // Central Store
  { id: 'aa9fedcb-27ac-47d2-a963-40d01c2594bc', warehouseCode: 'WH-MAIN-001', name: 'Main Warehouse (PWI-E51)', warehouseType: 'GENERAL', divisionId: '83ecd746-1cc9-4849-bec4-d00bcc3ceeec' },
];

const STATUS_OPTIONS = ['DRAFT', 'SUBMITTED', 'APPROVED', 'CANCELLED'];
const REQUEST_TYPES = ['STANDARD', 'URGENT', 'BLANKET', 'RECURRING'];

const statusColorMap: Record<string, string> = {
  DRAFT: 'default',
  SUBMITTED: 'blue',
  APPROVED: 'green',
  CANCELLED: 'red',
};

const PurchaseRequisitionManagement: React.FC = () => {
  const { message } = App.useApp();
  const [data, setData] = useState<PurchaseRequisition[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [modalVisible, setModalVisible] = useState(false);
  const [viewModalVisible, setViewModalVisible] = useState(false);
  const [viewingItem, setViewingItem] = useState<any>(null);
  const [viewLoading, setViewLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [editingItem, setEditingItem] = useState<PurchaseRequisition | null>(null);
  const [form] = Form.useForm();
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<string | undefined>(undefined);
  const [pageSize] = useState(20);
  const [lineItems, setLineItems] = useState<ERPLine[]>([]);
  const [companyId, setCompanyId] = useState('');

  // Master lists
  const [divisions, setDivisions] = useState<DivisionOption[]>(DEFAULT_DIVISIONS);
  const [departments, setDepartments] = useState<DepartmentOption[]>(DEFAULT_DEPARTMENTS);
  const [warehouses, setWarehouses] = useState<Array<{ id: string; warehouseCode: string; name: string; warehouseType?: string; divisionId?: string }>>(DEFAULT_WAREHOUSES);

  const watchedDivisionId = Form.useWatch('divisionId', form);
  const watchedWarehouseId = Form.useWatch('warehouseId', form);
  const selectedWarehouse = warehouses.find((w) => w.id === watchedWarehouseId);

  // Filtered/prioritized options based on selected division
  const departmentOptions = React.useMemo(() => {
    const selectedDiv = divisions.find((d) => d.id === watchedDivisionId);
    const divCode = (selectedDiv?.code || '').toUpperCase();

    const list = departments.map((d) => {
      const isMatch = Boolean(
        watchedDivisionId && (
          d.divisionId === watchedDivisionId ||
          (divCode && d.code && d.code.toUpperCase().includes(divCode)) ||
          (divCode && d.name.toUpperCase().includes(divCode))
        )
      );
      return {
        value: d.name,
        label: d.code ? `[${d.code}] ${d.name}` : d.name,
        isMatch,
      };
    });

    if (watchedDivisionId) {
      return [...list].sort((a, b) => {
        if (a.isMatch && !b.isMatch) return -1;
        if (!a.isMatch && b.isMatch) return 1;
        return a.label.localeCompare(b.label);
      });
    }

    return list;
  }, [departments, divisions, watchedDivisionId]);

  const warehouseOptions = React.useMemo(() => {
    const selectedDiv = divisions.find((d) => d.id === watchedDivisionId);
    const divCode = (selectedDiv?.code || '').toUpperCase();

    const list = warehouses.map((w) => {
      const code = w.warehouseCode || 'WH';
      const isMatch = Boolean(
        watchedDivisionId && (
          w.divisionId === watchedDivisionId ||
          (divCode && code.toUpperCase().includes(divCode)) ||
          (divCode && w.name.toUpperCase().includes(divCode))
        )
      );
      return {
        value: w.id,
        label: `${code} — ${w.name}`,
        isMatch,
      };
    });

    if (watchedDivisionId) {
      return [...list].sort((a, b) => {
        if (a.isMatch && !b.isMatch) return -1;
        if (!a.isMatch && b.isMatch) return 1;
        return a.label.localeCompare(b.label);
      });
    }

    return list;
  }, [warehouses, divisions, watchedDivisionId]);

  useEffect(() => {
    const user = useUserStore.getState().user;
    if (user?.defaultCompanyId) {
      setCompanyId(user.defaultCompanyId);
    } else {
      const erpUser = localStorage.getItem('erp_user');
      if (erpUser) {
        try {
          const p = JSON.parse(erpUser);
          if (p?.defaultCompanyId) setCompanyId(p.defaultCompanyId);
        } catch { /* ignore */ }
      }
    }

    (async () => {
      // 1. Warehouses: try /warehouses then fallback to /organization/warehouses
      try {
        let items: any[] = [];
        try {
          const w = await apiService.get<any>('/warehouses', { limit: 100 });
          items = Array.isArray(w) ? w : w?.data?.items || w?.items || w?.data || [];
        } catch {
          const w2 = await apiService.get<any>('/organization/warehouses', { limit: 100 });
          items = Array.isArray(w2) ? w2 : w2?.data?.items || w2?.items || w2?.data || [];
        }
        if (items.length > 0) {
          const existingIds = new Set(items.map((x: any) => x.id));
          const merged = [...items, ...DEFAULT_WAREHOUSES.filter((d) => !existingIds.has(d.id))];
          setWarehouses(merged.filter((w) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(w.id)));
        }
      } catch { /* keep DEFAULT_WAREHOUSES */ }

      // 2. Divisions
      try {
        const d = await apiService.get<any>('/divisions', { limit: 50 });
        const divItems = Array.isArray(d) ? d : d?.data?.items || d?.data || [];
        if (divItems.length > 0) {
          const apiDivs = divItems.map((x: any) => ({ id: x.id, code: x.divisionCode, name: x.name }));
          const existingIds = new Set(apiDivs.map((x: any) => x.id));
          setDivisions([...apiDivs, ...DEFAULT_DIVISIONS.filter((def) => !existingIds.has(def.id))]);
        }
      } catch { /* keep DEFAULT_DIVISIONS */ }

      // 3. Departments: fetch live directory from backend
      try {
        let deptItems: any[] = [];
        try {
          const deptRes = await apiService.get<any>('/departments', { limit: 100 });
          deptItems = Array.isArray(deptRes) ? deptRes : deptRes?.data?.items || deptRes?.items || deptRes?.data || [];
        } catch {
          const deptRes2 = await apiService.get<any>('/organization/departments', { limit: 100 });
          deptItems = Array.isArray(deptRes2) ? deptRes2 : deptRes2?.data?.items || deptRes2?.items || deptRes2?.data || [];
        }
        if (deptItems.length > 0) {
          const apiDepts: DepartmentOption[] = deptItems.map((x: any) => ({
            id: x.id,
            code: x.departmentCode,
            name: x.name,
            divisionId: x.divisionId,
          }));
          const existingNames = new Set(apiDepts.map((x) => x.name.toLowerCase()));
          const merged = [...apiDepts, ...DEFAULT_DEPARTMENTS.filter((d) => !existingNames.has(d.name.toLowerCase()))];
          setDepartments(merged);
        }
      } catch { /* keep DEFAULT_DEPARTMENTS */ }
    })();
  }, []);

  const fetchData = useCallback(async (pageNum: number = 1) => {
    setLoading(true);
    try {
      const params: any = { page: pageNum, limit: pageSize };
      if (search) params.search = search;
      if (filterStatus) params.status = filterStatus;
      const response = await apiService.get<{ data: PurchaseRequisition[]; total: number }>('/procurement/requisitions', params);
      setData(response.data || []);
      setTotal(response.total || 0);
    } catch {
      message.error('Failed to fetch purchase requisitions');
    } finally {
      setLoading(false);
    }
  }, [search, filterStatus, pageSize, message]);

  useEffect(() => { fetchData(page); }, [page, fetchData]);

  const generateRequisitionCode = useCallback(() => {
    const currentYear = new Date().getFullYear();
    const nextSeq = (total || data.length || 0) + 1;
    return `PR-${currentYear}-${String(nextSeq).padStart(4, '0')}`;
  }, [total, data.length]);

  const handleCreate = () => {
    setEditingItem(null);
    form.resetFields();
    const autoCode = generateRequisitionCode();
    const userCompanyId = companyId || useUserStore.getState().user?.defaultCompanyId || '';
    form.setFieldsValue({
      companyId: userCompanyId,
      requisitionCode: autoCode,
      requestType: 'STANDARD',
      purchaseType: 'LOCAL',
      requestedDeliveryDate: dayjs().add(7, 'day'),
    });
    setLineItems([]);
    setModalVisible(true);
  };

  const handleEdit = async (record: PurchaseRequisition) => {
    setEditingItem(record);
    try {
      const res = await apiService.get<any>(`/procurement/requisitions/${record.id}`);
      const pr = res?.data || record;
      form.setFieldsValue({
        ...pr,
        requestedDeliveryDate: pr.requestedDeliveryDate ? dayjs(pr.requestedDeliveryDate) : undefined,
        purchaseType: pr.purchaseType || 'LOCAL',
      });
      if (pr.lines) {
        setLineItems(pr.lines.map((l: any, idx: number) => ({
          id: `line-${idx + 1}`,
          itemId: l.itemId,
          itemName: l.justification || l.description || l.itemName || l.item?.name,
          quantity: Number(l.quantity || 1),
          uomId: l.uomId,
          uomCode: l.uom?.code || 'PCS',
          rate: Number(l.estimatedUnitPrice || l.unitPrice || 0),
          lineTotal: Number(l.estimatedTotalPrice || l.estimatedAmount || 0),
        })));
      }
    } catch {
      form.setFieldsValue(record);
    }
    setModalVisible(true);
  };

  const isUuid = (val?: string) => Boolean(val && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val));

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();

      // Check if user entered quantity/rate on a row without selecting an item
      const incompleteLines = lineItems.filter((l) => !l.itemId && ((l.quantity && Number(l.quantity) > 1) || (l.rate && Number(l.rate) > 0)));
      if (incompleteLines.length > 0) {
        message.error('Please select an item for all entered rows or remove the unfinished line.');
        return;
      }

      // Filter lines that have an item selected (cleanly ignoring accidental empty rows at bottom)
      const validLines = lineItems.filter((l) => Boolean(l.itemId));
      if (validLines.length === 0) {
        message.warning('Please add at least one requisition line item with an item selected');
        return;
      }

      // Validate each selected line has a valid UUID itemId and positive quantity
      for (let i = 0; i < validLines.length; i++) {
        const l = validLines[i];
        if (!l.itemId || !isUuid(l.itemId)) {
          message.error(`Line #${i + 1} does not have a valid item selected. Please choose an item from the item list or delete the row.`);
          return;
        }
        if (!l.quantity || Number(l.quantity) <= 0) {
          message.error(`Line #${i + 1} (${l.itemCode || 'Item'}) must have a quantity greater than 0.`);
          return;
        }
        if (!l.uomId || !isUuid(l.uomId)) {
          message.error(`Line #${i + 1} (${l.itemCode || 'Item'}) is missing a valid Unit of Measure (UOM).`);
          return;
        }
      }

      setSubmitting(true);

      const targetCompanyId = companyId || values.companyId || useUserStore.getState().user?.defaultCompanyId;

      const selectedDiv = divisions.find((d) => d.id === values.divisionId);
      const selectedWh = warehouses.find((w) => w.id === values.warehouseId);
      const metaParts: string[] = [];
      if (selectedDiv) metaParts.push(`[Division: ${selectedDiv.name}]`);
      if (selectedWh) metaParts.push(`[Store: ${selectedWh.warehouseCode} - ${selectedWh.name}]`);
      if (values.purchaseType) metaParts.push(`[Origin: ${values.purchaseType}]`);

      const prefix = metaParts.join(' ');
      const combinedNotes = [prefix, values.notes].filter(Boolean).join('\n');

      const targetWarehouseId = isUuid(values.warehouseId) ? values.warehouseId : undefined;

      const payload: any = {
        companyId: targetCompanyId,
        requisitionCode: values.requisitionCode,
        title: values.title || undefined,
        description: values.description || undefined,
        requestType: values.requestType || 'STANDARD',
        department: values.department || undefined,
        requestedDeliveryDate: values.requestedDeliveryDate ? dayjs(values.requestedDeliveryDate).format('YYYY-MM-DD') : undefined,
        projectCode: values.projectCode || undefined,
        notes: combinedNotes || undefined,
        divisionId: isUuid(values.divisionId) ? values.divisionId : undefined,
        warehouseId: targetWarehouseId,
        purchaseType: values.purchaseType || undefined,
        lines: validLines.map((l, idx) => ({
          lineNumber: idx + 1,
          itemId: l.itemId,
          uomId: l.uomId,
          quantity: Number(l.quantity || 0),
          estimatedUnitPrice: Number(l.rate || 0),
          warehouseId: targetWarehouseId,
          justification: l.itemName || l.itemCode || undefined,
          requiredDate: values.requestedDeliveryDate ? dayjs(values.requestedDeliveryDate).format('YYYY-MM-DD') : undefined,
        })),
      };

      if (editingItem) {
        await apiService.patch(`/procurement/requisitions/${editingItem.id}`, payload);
        message.success('Purchase requisition updated');
      } else {
        await apiService.post('/procurement/requisitions', payload);
        message.success(`Purchase requisition ${values.requisitionCode} created`);
      }
      setModalVisible(false);
      fetchData(page);
    } catch (error: any) {
      const msg = error?.response?.data?.message;
      const displayMsg = Array.isArray(msg)
        ? msg.join(', ')
        : (typeof msg === 'string' ? msg : (error?.message || 'Failed to save purchase requisition'));
      message.error(displayMsg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleView = async (record: PurchaseRequisition) => {
    setViewLoading(true);
    setViewModalVisible(true);
    try {
      const res = await apiService.get<any>(`/procurement/requisitions/${record.id}`);
      setViewingItem(res?.data || record);
    } catch {
      setViewingItem(record);
    } finally {
      setViewLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await apiService.delete(`/procurement/requisitions/${id}`);
      message.success('Purchase requisition deleted successfully');
      fetchData(page);
    } catch (error: any) {
      const errMsg = error?.response?.data?.message || 'Failed to delete purchase requisition';
      message.error(typeof errMsg === 'string' ? errMsg : 'Failed to delete');
    }
  };

  const handleAction = async (id: string, action: string) => {
    try {
      await apiService.patch(`/procurement/requisitions/${id}/${action}`);
      message.success(`Purchase requisition marked as ${action}ed`);
      fetchData(page);
    } catch {
      message.error(`Failed to ${action} purchase requisition`);
    }
  };

  const parsePrMeta = useCallback((item: any) => {
    if (!item) return { division: '—', store: '—', origin: 'LOCAL', cleanNotes: '' };
    const rawNotes = item.notes || '';
    const divMatch = rawNotes.match(/\[Division:\s*([^\]]+)\]/i);
    const storeMatch = rawNotes.match(/\[Store:\s*([^\]]+)\]/i);
    const originMatch = rawNotes.match(/\[Origin:\s*([^\]]+)\]/i);

    const division = divMatch ? divMatch[1] : (divisions.find((d) => d.id === item.divisionId)?.name || item.divisionName || '—');
    const store = storeMatch ? storeMatch[1] : (warehouses.find((w) => w.id === item.warehouseId)?.name || item.warehouseName || '—');
    const origin = item.purchaseType || (originMatch ? originMatch[1] : 'LOCAL');

    const cleanNotes = rawNotes
      .replace(/\[Division:\s*[^\]]+\]/gi, '')
      .replace(/\[Store:\s*[^\]]+\]/gi, '')
      .replace(/\[Origin:\s*[^\]]+\]/gi, '')
      .trim();

    return { division, store, origin, cleanNotes };
  }, [divisions, warehouses]);

  const handlePrintRequisition = (pr: any) => {
    if (!pr) return;
    const meta = parsePrMeta(pr);
    const linesHtml = (pr.lines || []).map((l: any, idx: number) => {
      const qty = Number(l.quantity || 0).toLocaleString();
      const rate = Number(l.estimatedUnitPrice || 0).toLocaleString(undefined, { minimumFractionDigits: 2 });
      const total = Number(l.estimatedTotalPrice || (Number(l.quantity || 0) * Number(l.estimatedUnitPrice || 0))).toLocaleString(undefined, { minimumFractionDigits: 2 });
      const desc = l.justification || l.description || l.itemName || l.item?.name || '—';
      const uom = l.uom?.code || l.uomCode || 'PCS';
      return `
        <tr>
          <td style="text-align: center; border: 1px solid #cbd5e1; padding: 6px;">${idx + 1}</td>
          <td style="border: 1px solid #cbd5e1; padding: 6px; font-weight: 600;">${desc}</td>
          <td style="text-align: right; border: 1px solid #cbd5e1; padding: 6px; font-weight: bold;">${qty}</td>
          <td style="text-align: center; border: 1px solid #cbd5e1; padding: 6px;">${uom}</td>
          <td style="text-align: right; border: 1px solid #cbd5e1; padding: 6px;">${rate}</td>
          <td style="text-align: right; border: 1px solid #cbd5e1; padding: 6px; font-weight: bold;">${total}</td>
        </tr>
      `;
    }).join('');

    let totalAmount = 0;
    (pr.lines || []).forEach((r: any) => {
      totalAmount += Number(r.estimatedTotalPrice || (Number(r.quantity || 0) * Number(r.estimatedUnitPrice || 0)));
    });

    const html = `
      <div style="font-family: Arial, sans-serif; color: #0f172a; padding: 12px;">
        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #0284c7; padding-bottom: 8px; margin-bottom: 14px;">
          <div>
            <div style="font-size: 18px; font-weight: 800; color: #0284c7;">PAKISTAN WIRE INDUSTRIES (PVT) LTD</div>
            <div style="font-size: 13px; font-weight: 700; color: #334155; margin-top: 2px;">PURCHASE REQUISITION VOUCHER</div>
          </div>
          <div style="text-align: right;">
            <div style="font-size: 17px; font-weight: 800; font-family: monospace; color: #0f172a;">${pr.requisitionCode}</div>
            <div style="font-size: 11px; font-weight: bold; display: inline-block; padding: 2px 8px; border-radius: 4px; background: #e0f2fe; color: #0369a1; margin-top: 4px;">
              STATUS: ${pr.status}
            </div>
          </div>
        </div>

        <table style="width: 100%; font-size: 11px; margin-bottom: 16px; border-collapse: collapse;">
          <tr>
            <td style="width: 16%; font-weight: bold; color: #475569; padding: 5px 0;">Requisition Title:</td>
            <td style="width: 34%; font-weight: bold; color: #0f172a; padding: 5px 0;">${pr.title || '—'}</td>
            <td style="width: 16%; font-weight: bold; color: #475569; padding: 5px 0;">Request Type:</td>
            <td style="width: 34%; color: #0f172a; padding: 5px 0;">${pr.requestType || 'STANDARD'} (${meta.origin})</td>
          </tr>
          <tr>
            <td style="font-weight: bold; color: #475569; padding: 5px 0;">Department:</td>
            <td style="color: #0f172a; padding: 5px 0;">${pr.department || '—'}</td>
            <td style="font-weight: bold; color: #475569; padding: 5px 0;">Required Delivery Date:</td>
            <td style="color: #0f172a; padding: 5px 0;">${pr.requestedDeliveryDate ? dayjs(pr.requestedDeliveryDate).format('DD/MM/YYYY') : '—'}</td>
          </tr>
          <tr>
            <td style="font-weight: bold; color: #475569; padding: 5px 0;">Division:</td>
            <td style="color: #0f172a; padding: 5px 0;">${meta.division}</td>
            <td style="font-weight: bold; color: #475569; padding: 5px 0;">Target Store:</td>
            <td style="color: #0f172a; padding: 5px 0;">${meta.store}</td>
          </tr>
          ${pr.description ? `
          <tr>
            <td style="font-weight: bold; color: #475569; padding: 5px 0;">Requirement Purpose:</td>
            <td colspan="3" style="color: #0f172a; padding: 5px 0;">${pr.description}</td>
          </tr>
          ` : ''}
        </table>

        <table style="width: 100%; border-collapse: collapse; font-size: 11px; margin-bottom: 16px;">
          <thead>
            <tr style="background: #f1f5f9; color: #0f172a;">
              <th style="border: 1px solid #cbd5e1; padding: 6px; width: 35px;">#</th>
              <th style="border: 1px solid #cbd5e1; padding: 6px; text-align: left;">Item Description / Specifications</th>
              <th style="border: 1px solid #cbd5e1; padding: 6px; text-align: right; width: 85px;">Quantity</th>
              <th style="border: 1px solid #cbd5e1; padding: 6px; text-align: center; width: 60px;">UOM</th>
              <th style="border: 1px solid #cbd5e1; padding: 6px; text-align: right; width: 110px;">Est. Rate (PKR)</th>
              <th style="border: 1px solid #cbd5e1; padding: 6px; text-align: right; width: 120px;">Total (PKR)</th>
            </tr>
          </thead>
          <tbody>
            ${linesHtml}
            <tr style="background: #f8fafc; font-weight: bold;">
              <td colspan="4" style="border: 1px solid #cbd5e1; padding: 8px; text-align: right;">Grand Total Estimated Amount:</td>
              <td colspan="2" style="border: 1px solid #cbd5e1; padding: 8px; text-align: right; font-size: 12px; color: #0284c7;">
                PKR ${totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </td>
            </tr>
          </tbody>
        </table>

        ${meta.cleanNotes ? `
          <div style="margin-top: 10px; font-size: 10.5px; border-left: 3px solid #cbd5e1; padding-left: 8px;">
            <strong>Notes:</strong> ${meta.cleanNotes}
          </div>
        ` : ''}

        <div style="display: flex; justify-content: space-between; margin-top: 50px; padding-top: 12px; font-size: 10px; border-top: 1px solid #e2e8f0;">
          <div style="text-align: center; width: 150px; border-top: 1px dashed #94a3b8; padding-top: 4px;">Prepared By (Requester)</div>
          <div style="text-align: center; width: 150px; border-top: 1px dashed #94a3b8; padding-top: 4px;">Department Head</div>
          <div style="text-align: center; width: 150px; border-top: 1px dashed #94a3b8; padding-top: 4px;">Procurement Manager</div>
          <div style="text-align: center; width: 150px; border-top: 1px dashed #94a3b8; padding-top: 4px;">Authorized Signatory</div>
        </div>
      </div>
    `;

    printHtmlContent(`PR-${pr.requisitionCode}`, html);
  };

  const columns: ColumnsType<PurchaseRequisition> = [
    {
      title: 'PR Code',
      dataIndex: 'requisitionCode',
      key: 'requisitionCode',
      width: 140,
      render: (code, record) => (
        <a
          onClick={() => handleView(record)}
          style={{ fontWeight: 700, fontFamily: 'monospace', color: '#38bdf8', textDecoration: 'underline' }}
        >
          {code}
        </a>
      ),
    },
    {
      title: 'Title',
      dataIndex: 'title',
      key: 'title',
      width: 230,
      render: (t) => <span style={{ fontWeight: 600 }}>{t || '—'}</span>,
    },
    {
      title: 'Type',
      dataIndex: 'requestType',
      key: 'requestType',
      width: 110,
      render: (t) => <Tag color={t === 'URGENT' ? 'red' : 'blue'}>{t}</Tag>,
    },
    {
      title: 'Department',
      dataIndex: 'department',
      key: 'department',
      width: 130,
      render: (dept) => dept || '—',
    },
    {
      title: 'Delivery Date',
      dataIndex: 'requestedDeliveryDate',
      key: 'requestedDeliveryDate',
      width: 120,
      render: (d) => d ? dayjs(d).format('DD/MM/YYYY') : '—',
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 120,
      render: (status: string) => (
        <Tag color={statusColorMap[status] || 'default'} style={{ fontWeight: 700 }}>
          {status}
        </Tag>
      ),
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 260,
      render: (_, record) => (
        <Space size={4}>
          <Tooltip title="View Details">
            <Button
              size="small"
              icon={<EyeOutlined />}
              onClick={() => handleView(record)}
            />
          </Tooltip>

          <Tooltip title={record.status === 'DRAFT' ? 'Edit Requisition' : 'Only DRAFT can be edited'}>
            <Button
              size="small"
              icon={<EditOutlined />}
              onClick={() => handleEdit(record)}
              disabled={record.status !== 'DRAFT'}
            />
          </Tooltip>

          {record.status === 'DRAFT' && (
            <Tooltip title="Submit to Procurement">
              <Button size="small" type="primary" icon={<SendOutlined />} onClick={() => handleAction(record.id, 'submit')}>
                Submit
              </Button>
            </Tooltip>
          )}

          {record.status === 'SUBMITTED' && (
            <Tooltip title="Approve Requisition">
              <Button size="small" type="primary" icon={<CheckOutlined />} style={{ background: '#10b981', borderColor: '#10b981' }} onClick={() => handleAction(record.id, 'approve')}>
                Approve
              </Button>
            </Tooltip>
          )}

          {(record.status === 'DRAFT' || record.status === 'SUBMITTED') && (
            <Tooltip title="Cancel Requisition">
              <Button size="small" danger icon={<CloseOutlined />} onClick={() => handleAction(record.id, 'cancel')}>
                Cancel
              </Button>
            </Tooltip>
          )}

          <Popconfirm
            title="Delete Requisition"
            description="Are you sure you want to permanently delete this requisition?"
            okText="Yes, Delete"
            cancelText="No"
            okButtonProps={{ danger: true }}
            onConfirm={() => handleDelete(record.id)}
          >
            <Tooltip title="Delete Requisition">
              <Button size="small" danger icon={<DeleteOutlined />} />
            </Tooltip>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <Card
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <FileDoneOutlined style={{ fontSize: 20, color: '#10b981' }} />
          <span>Purchase Requisitions (PR)</span>
        </div>
      }
      extra={
        <Space>
          <Button icon={<ReloadOutlined />} onClick={() => fetchData(page)}>
            Refresh
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate} style={{ fontWeight: 600 }}>
            Create PR
          </Button>
        </Space>
      }
    >
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={8}>
          <Input
            placeholder="Search requisitions, titles, departments..."
            prefix={<SearchOutlined />}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onPressEnter={() => fetchData(1)}
            allowClear
          />
        </Col>
        <Col span={6}>
          <Select
            placeholder="Filter by status"
            allowClear
            style={{ width: '100%' }}
            value={filterStatus}
            onChange={setFilterStatus}
          >
            {STATUS_OPTIONS.map((s) => (
              <Select.Option key={s} value={s}>{s}</Select.Option>
            ))}
          </Select>
        </Col>
        <Col span={4}>
          <Button type="primary" onClick={() => fetchData(1)}>Search</Button>
        </Col>
      </Row>

      <Table
        columns={columns}
        dataSource={data}
        rowKey="id"
        loading={loading}
        pagination={{ current: page, total, pageSize, onChange: setPage, showSizeChanger: false }}
      />

      {/* Upgraded Desktop Draggable & Resizable Modal */}
      <DraggableResizableModal
        title={editingItem ? `Edit Purchase Requisition (${editingItem.requisitionCode})` : 'Create Purchase Requisition (PR)'}
        subtitle="📋 Raise material or item requisitions with live warehouse stock inspection, positive order addition & division store routing"
        open={modalVisible}
        onCancel={() => setModalVisible(false)}
        width={1120}
        height={760}
        footer={[
          <Button key="cancel" onClick={() => setModalVisible(false)}>
            Cancel
          </Button>,
          <Button
            key="submit"
            type="primary"
            loading={submitting}
            onClick={handleSubmit}
            style={{ fontWeight: 600 }}
          >
            {editingItem ? 'Update Requisition' : 'Create & Save PR'}
          </Button>,
        ]}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="companyId" hidden><Input /></Form.Item>

          <Card size="small" style={{ marginBottom: 14, background: 'rgba(255, 255, 255, 0.02)', borderColor: 'rgba(255, 255, 255, 0.1)' }}>
            <Row gutter={16}>
              <Col span={6}>
                <Form.Item
                  name="requisitionCode"
                  label={<span style={{ fontWeight: 600 }}>Requisition Code <Tag color="blue">Auto PR</Tag></span>}
                  rules={[{ required: true, message: 'Requisition code is required' }]}
                >
                  <Input placeholder="e.g. PR-2026-0001" style={{ fontWeight: 700, fontFamily: 'monospace' }} />
                </Form.Item>
              </Col>

              <Col span={8}>
                <Form.Item name="title" label={<span style={{ fontWeight: 600 }}>Title / Subject</span>}>
                  <Input placeholder="e.g. Monthly Wire Drawing Lubricants & Nipple Supply" />
                </Form.Item>
              </Col>

              <Col span={6}>
                <Form.Item
                  name="divisionId"
                  label={
                    <span style={{ fontWeight: 600 }}>
                      <ApartmentOutlined style={{ marginRight: 4, color: '#10b981' }} />
                      Division
                    </span>
                  }
                >
                  <Select
                    placeholder="Select requesting division..."
                    allowClear
                    options={divisions.map((d) => ({
                      value: d.id,
                      label: `${d.code ? `[${d.code}] ` : ''}${d.name}`,
                    }))}
                  />
                </Form.Item>
              </Col>

              <Col span={4}>
                <Form.Item
                  name="purchaseType"
                  label={<span style={{ fontWeight: 600 }}><GlobalOutlined style={{ marginRight: 4 }} />Origin</span>}
                  initialValue="LOCAL"
                >
                  <Segmented
                    block
                    options={[
                      { label: 'Local', value: 'LOCAL' },
                      { label: 'Import', value: 'IMPORT' },
                    ]}
                  />
                </Form.Item>
              </Col>
            </Row>

            <Row gutter={16}>
              <Col span={6}>
                <Form.Item
                  name="warehouseId"
                  label={
                    <span style={{ fontWeight: 600 }}>
                      <ShopOutlined style={{ marginRight: 4, color: '#f59e0b' }} />
                      Target Warehouse / Store
                    </span>
                  }
                >
                  <Select
                    placeholder="Select store / warehouse..."
                    allowClear
                    showSearch
                    optionFilterProp="label"
                    options={warehouseOptions}
                  />
                </Form.Item>
              </Col>

              <Col span={6}>
                <Form.Item name="requestType" label={<span style={{ fontWeight: 600 }}>Request Type</span>}>
                  <Select>
                    {REQUEST_TYPES.map((t) => (
                      <Select.Option key={t} value={t}>{t}</Select.Option>
                    ))}
                  </Select>
                </Form.Item>
              </Col>

              <Col span={6}>
                <Form.Item
                  name="department"
                  label={
                    <span style={{ fontWeight: 600 }}>
                      <PartitionOutlined style={{ marginRight: 4, color: '#38bdf8' }} />
                      Department
                    </span>
                  }
                >
                  <Select
                    placeholder="Select requesting department..."
                    allowClear
                    showSearch
                    optionFilterProp="label"
                    options={departmentOptions}
                  />
                </Form.Item>
              </Col>

              <Col span={6}>
                <Form.Item name="requestedDeliveryDate" label={<span style={{ fontWeight: 600 }}>Delivery Date</span>}>
                  <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
                </Form.Item>
              </Col>
            </Row>
          </Card>

          <Form.Item name="description" label={<span style={{ fontWeight: 600 }}>Purpose / Requirement Description</span>}>
            <Input.TextArea rows={2} placeholder="Explain purpose of request or special instructions..." />
          </Form.Item>

          {/* Requisition Line Items Table with Live Positive Inbound Stock Calculation */}
          <ERPLineItems
            companyId={companyId}
            value={lineItems}
            onChange={setLineItems}
            context="purchase"
            isPurchasable={true}
            divisionId={watchedDivisionId}
            warehouseId={watchedWarehouseId}
            warehouseType={selectedWarehouse?.warehouseType}
            label="Requisition Items"
            showAvailability={true}
          />

          <Row gutter={16} style={{ marginTop: 12 }}>
            <Col span={24}>
              <Form.Item name="notes" label={<span style={{ fontWeight: 600 }}>Internal Notes</span>}>
                <Input.TextArea rows={2} placeholder="Internal procurement/management notes..." />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </DraggableResizableModal>

      {/* Executive Purchase Requisition Voucher Details Modal */}
      <DraggableResizableModal
        title={
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', paddingRight: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <FileTextOutlined style={{ color: '#38bdf8', fontSize: 20 }} />
              <div>
                <span style={{ fontSize: 16, fontWeight: 700, color: '#f8fafc' }}>
                  Purchase Requisition Voucher
                </span>
                <span style={{ marginLeft: 10, fontFamily: 'monospace', color: '#38bdf8', fontWeight: 700 }}>
                  {viewingItem?.requisitionCode}
                </span>
              </div>
            </div>
            {viewingItem?.status && (
              <Tag
                color={statusColorMap[viewingItem.status] || 'default'}
                style={{
                  fontWeight: 800,
                  padding: '3px 12px',
                  fontSize: 12,
                  letterSpacing: 0.5,
                  borderRadius: 4,
                  margin: 0,
                }}
              >
                {viewingItem.status}
              </Tag>
            )}
          </div>
        }
        open={viewModalVisible}
        onCancel={() => { setViewModalVisible(false); setViewingItem(null); }}
        width={950}
        footer={[
          <Button
            key="print"
            icon={<PrinterOutlined />}
            onClick={() => handlePrintRequisition(viewingItem)}
            style={{ fontWeight: 600 }}
          >
            Print Requisition Voucher
          </Button>,
          viewingItem?.status === 'DRAFT' && (
            <Button
              key="edit"
              icon={<EditOutlined />}
              onClick={() => {
                const item = viewingItem;
                setViewModalVisible(false);
                handleEdit(item);
              }}
            >
              Edit
            </Button>
          ),
          viewingItem?.status === 'DRAFT' && (
            <Button
              key="submit"
              type="primary"
              icon={<SendOutlined />}
              onClick={async () => {
                const id = viewingItem.id;
                setViewModalVisible(false);
                await handleAction(id, 'submit');
              }}
            >
              Submit to Procurement
            </Button>
          ),
          viewingItem?.status === 'SUBMITTED' && (
            <Button
              key="approve"
              type="primary"
              icon={<CheckOutlined />}
              style={{ background: '#10b981', borderColor: '#10b981' }}
              onClick={async () => {
                const id = viewingItem.id;
                setViewModalVisible(false);
                await handleAction(id, 'approve');
              }}
            >
              Approve Requisition
            </Button>
          ),
          (viewingItem?.status === 'DRAFT' || viewingItem?.status === 'SUBMITTED') && (
            <Button
              key="cancel"
              danger
              icon={<CloseOutlined />}
              onClick={async () => {
                const id = viewingItem.id;
                setViewModalVisible(false);
                await handleAction(id, 'cancel');
              }}
            >
              Cancel Requisition
            </Button>
          ),
          <Button key="close" onClick={() => { setViewModalVisible(false); setViewingItem(null); }}>
            Close
          </Button>,
        ].filter(Boolean)}
      >
        <Spin spinning={viewLoading}>
          {viewingItem && (() => {
            const meta = parsePrMeta(viewingItem);
            const stepIndex =
              viewingItem.status === 'APPROVED' ? 2 :
              viewingItem.status === 'SUBMITTED' ? 1 :
              viewingItem.status === 'CANCELLED' ? 1 : 0;

            return (
              <div style={{ padding: '4px 0' }}>
                {/* 1. Executive Banner */}
                <div
                  style={{
                    background: 'linear-gradient(135deg, rgba(15,23,42,0.85) 0%, rgba(30,41,59,0.85) 100%)',
                    borderRadius: 8,
                    padding: '16px 20px',
                    border: '1px solid rgba(148,163,184,0.2)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: 16,
                  }}
                >
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#38bdf8', letterSpacing: 1, textTransform: 'uppercase' }}>
                      PAKISTAN WIRE INDUSTRIES (PVT) LTD • PROCUREMENT
                    </div>
                    <div style={{ fontSize: 17, fontWeight: 700, color: '#f8fafc', marginTop: 3 }}>
                      {viewingItem.title || 'Purchase Requisition'}
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div
                      style={{
                        background: 'rgba(56,189,248,0.12)',
                        border: '1px solid rgba(56,189,248,0.3)',
                        borderRadius: 6,
                        padding: '4px 12px',
                        fontFamily: 'monospace',
                        fontSize: 16,
                        fontWeight: 800,
                        color: '#38bdf8',
                      }}
                    >
                      {viewingItem.requisitionCode}
                    </div>
                    <Tag color={viewingItem.requestType === 'URGENT' ? 'red' : 'blue'} style={{ fontWeight: 700, padding: '4px 10px', fontSize: 12 }}>
                      {viewingItem.requestType || 'STANDARD'}
                    </Tag>
                    <Tag color={meta.origin === 'IMPORT' ? 'purple' : 'cyan'} style={{ fontWeight: 700, padding: '4px 10px', fontSize: 12 }}>
                      {meta.origin}
                    </Tag>
                  </div>
                </div>

                {/* 2. Visual Workflow Stepper */}
                <div
                  style={{
                    background: 'rgba(15,23,42,0.4)',
                    padding: '12px 20px',
                    borderRadius: 8,
                    border: '1px solid rgba(148,163,184,0.12)',
                    marginBottom: 16,
                  }}
                >
                  <Steps
                    size="small"
                    current={stepIndex}
                    status={viewingItem.status === 'CANCELLED' ? 'error' : 'process'}
                    items={[
                      { title: 'Draft Created', description: 'Department Initiated' },
                      {
                        title: viewingItem.status === 'CANCELLED' ? 'Cancelled' : 'Submitted',
                        description: viewingItem.status === 'CANCELLED' ? 'Requisition Void' : 'Procurement Review',
                      },
                      { title: 'Approved', description: 'Authorized for PO' },
                      { title: 'PO / Store GRN', description: 'Goods Receipt' },
                    ]}
                  />
                </div>

                {/* 3. Structured Key-Value Grid (Clean 2 Columns, No Text Wrap) */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: 14 }}>
                  {/* Left Column: Organization & Plant */}
                  <div
                    style={{
                      background: 'rgba(30,41,59,0.35)',
                      borderRadius: 8,
                      padding: '14px 18px',
                      border: '1px solid rgba(148,163,184,0.15)',
                    }}
                  >
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#38bdf8', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <ApartmentOutlined /> Organization & Plant
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      <div style={{ display: 'flex', alignItems: 'center' }}>
                        <span style={{ width: 150, color: '#94a3b8', fontSize: 12.5, fontWeight: 600, flexShrink: 0 }}>Requesting Dept:</span>
                        <span style={{ color: '#f8fafc', fontSize: 13, fontWeight: 700 }}>{viewingItem.department || '—'}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center' }}>
                        <span style={{ width: 150, color: '#94a3b8', fontSize: 12.5, fontWeight: 600, flexShrink: 0 }}>Plant / Division:</span>
                        <span style={{ color: '#f8fafc', fontSize: 13, fontWeight: 500 }}>{meta.division}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center' }}>
                        <span style={{ width: 150, color: '#94a3b8', fontSize: 12.5, fontWeight: 600, flexShrink: 0 }}>Target Store / WH:</span>
                        <span style={{ color: '#f8fafc', fontSize: 13, fontWeight: 500 }}>{meta.store}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center' }}>
                        <span style={{ width: 150, color: '#94a3b8', fontSize: 12.5, fontWeight: 600, flexShrink: 0 }}>Project Code:</span>
                        <span style={{ color: '#cbd5e1', fontSize: 13, fontFamily: 'monospace' }}>{viewingItem.projectCode || '—'}</span>
                      </div>
                    </div>
                  </div>

                  {/* Right Column: Procurement & Delivery */}
                  <div
                    style={{
                      background: 'rgba(30,41,59,0.35)',
                      borderRadius: 8,
                      padding: '14px 18px',
                      border: '1px solid rgba(148,163,184,0.15)',
                    }}
                  >
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#38bdf8', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <ShopOutlined /> Procurement Timeline
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      <div style={{ display: 'flex', alignItems: 'center' }}>
                        <span style={{ width: 150, color: '#94a3b8', fontSize: 12.5, fontWeight: 600, flexShrink: 0 }}>Priority Level:</span>
                        <Tag color={viewingItem.requestType === 'URGENT' ? 'red' : 'blue'} style={{ fontWeight: 700, margin: 0 }}>
                          {viewingItem.requestType || 'STANDARD'}
                        </Tag>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center' }}>
                        <span style={{ width: 150, color: '#94a3b8', fontSize: 12.5, fontWeight: 600, flexShrink: 0 }}>Sourcing Origin:</span>
                        <Tag color={meta.origin === 'IMPORT' ? 'purple' : 'cyan'} style={{ fontWeight: 700, margin: 0 }}>
                          {meta.origin}
                        </Tag>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center' }}>
                        <span style={{ width: 150, color: '#94a3b8', fontSize: 12.5, fontWeight: 600, flexShrink: 0 }}>Required Delivery:</span>
                        <span style={{ color: '#f8fafc', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                          <CalendarOutlined style={{ color: '#38bdf8' }} />
                          {viewingItem.requestedDeliveryDate ? dayjs(viewingItem.requestedDeliveryDate).format('DD/MM/YYYY') : '—'}
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center' }}>
                        <span style={{ width: 150, color: '#94a3b8', fontSize: 12.5, fontWeight: 600, flexShrink: 0 }}>Date Created:</span>
                        <span style={{ color: '#cbd5e1', fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 6 }}>
                          <ClockCircleOutlined style={{ color: '#94a3b8' }} />
                          {viewingItem.createdAt ? dayjs(viewingItem.createdAt).format('DD/MM/YYYY HH:mm') : '—'}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 4. Purpose & Remarks Callout Boxes */}
                {viewingItem.description && (
                  <div
                    style={{
                      marginBottom: 10,
                      background: 'rgba(56,189,248,0.06)',
                      border: '1px solid rgba(56,189,248,0.25)',
                      borderLeft: '4px solid #38bdf8',
                      borderRadius: '0 8px 8px 0',
                      padding: '10px 16px',
                    }}
                  >
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#38bdf8', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>
                      Purpose / Justification of Requirement
                    </div>
                    <div style={{ color: '#f8fafc', fontSize: 13.5, fontWeight: 500 }}>
                      {viewingItem.description}
                    </div>
                  </div>
                )}

                {meta.cleanNotes && (
                  <div
                    style={{
                      marginBottom: 14,
                      background: 'rgba(245,158,11,0.06)',
                      border: '1px solid rgba(245,158,11,0.25)',
                      borderLeft: '4px solid #f59e0b',
                      borderRadius: '0 8px 8px 0',
                      padding: '10px 16px',
                    }}
                  >
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#f59e0b', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>
                      Internal Procurement & Store Instructions
                    </div>
                    <div style={{ color: '#e2e8f0', fontSize: 13, whiteSpace: 'pre-wrap' }}>
                      {meta.cleanNotes}
                    </div>
                  </div>
                )}

                {/* 5. Requisition Items Table */}
                <div style={{ marginTop: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <span style={{ fontSize: 13.5, fontWeight: 700, color: '#f8fafc', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <FileTextOutlined style={{ color: '#38bdf8' }} />
                      Requisition Items ({viewingItem.lines?.length || 0})
                    </span>
                    <span style={{ fontSize: 12, color: '#94a3b8' }}>
                      Currency: <strong style={{ color: '#f8fafc' }}>PKR (Pakistani Rupee)</strong>
                    </span>
                  </div>

                  <Table
                    size="middle"
                    bordered
                    pagination={false}
                    rowKey={(r: any) => r.id || r.lineNumber || Math.random()}
                    dataSource={viewingItem.lines || []}
                    columns={[
                      {
                        title: '#',
                        width: 45,
                        align: 'center',
                        render: (_, __, idx) => <span style={{ color: '#94a3b8', fontWeight: 600 }}>{idx + 1}</span>,
                      },
                      {
                        title: 'Item Description & Technical Specifications',
                        dataIndex: 'justification',
                        key: 'justification',
                        render: (t, r: any) => (
                          <div>
                            <div style={{ fontWeight: 600, fontSize: 13.5, color: '#f8fafc' }}>
                              {t || r.description || r.item?.name || r.item?.itemCode || '—'}
                            </div>
                            {r.item?.itemCode && (
                              <div style={{ fontSize: 11, color: '#38bdf8', fontFamily: 'monospace' }}>
                                Code: {r.item.itemCode}
                              </div>
                            )}
                          </div>
                        ),
                      },
                      {
                        title: 'Quantity',
                        dataIndex: 'quantity',
                        key: 'quantity',
                        width: 120,
                        align: 'right',
                        render: (q) => (
                          <span style={{ fontWeight: 700, fontSize: 14, color: '#38bdf8' }}>
                            {Number(q || 0).toLocaleString()}
                          </span>
                        ),
                      },
                      {
                        title: 'UOM',
                        dataIndex: 'uomId',
                        key: 'uomId',
                        width: 90,
                        align: 'center',
                        render: (_, r: any) => (
                          <Tag style={{ fontWeight: 700, fontFamily: 'monospace', margin: 0 }}>
                            {r.uom?.code || r.uomCode || 'PCS'}
                          </Tag>
                        ),
                      },
                      {
                        title: 'Estimated Unit Rate',
                        dataIndex: 'estimatedUnitPrice',
                        key: 'estimatedUnitPrice',
                        width: 160,
                        align: 'right',
                        render: (v) => (
                          <span style={{ fontFamily: 'monospace', fontSize: 13 }}>
                            Rs {Number(v || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </span>
                        ),
                      },
                      {
                        title: 'Line Total (PKR)',
                        key: 'lineTotal',
                        width: 170,
                        align: 'right',
                        render: (_, r: any) => {
                          const total = Number(r.estimatedTotalPrice || (Number(r.quantity || 0) * Number(r.estimatedUnitPrice || 0)));
                          return (
                            <span style={{ fontWeight: 700, fontFamily: 'monospace', fontSize: 13.5, color: '#10b981' }}>
                              Rs {total.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </span>
                          );
                        },
                      },
                    ]}
                    summary={(pageData) => {
                      let totalAmount = 0;
                      let totalQty = 0;
                      pageData.forEach((r: any) => {
                        const rowTotal = Number(r.estimatedTotalPrice || (Number(r.quantity || 0) * Number(r.estimatedUnitPrice || 0)));
                        totalAmount += rowTotal;
                        totalQty += Number(r.quantity || 0);
                      });
                      return (
                        <Table.Summary.Row style={{ background: 'rgba(15, 23, 42, 0.6)', fontWeight: 700 }}>
                          <Table.Summary.Cell index={0} colSpan={2} align="right">
                            <span style={{ color: '#94a3b8', fontSize: 13 }}>Summary ({pageData.length} item{pageData.length === 1 ? '' : 's'}):</span>
                          </Table.Summary.Cell>
                          <Table.Summary.Cell index={1} align="right">
                            <span style={{ color: '#38bdf8', fontSize: 14 }}>
                              {totalQty.toLocaleString()}
                            </span>
                          </Table.Summary.Cell>
                          <Table.Summary.Cell index={2} colSpan={2} align="right">
                            <span style={{ color: '#94a3b8', fontSize: 13 }}>Grand Total Estimated:</span>
                          </Table.Summary.Cell>
                          <Table.Summary.Cell index={3} align="right">
                            <div style={{ background: 'rgba(16, 185, 129, 0.15)', border: '1px solid rgba(16, 185, 129, 0.3)', borderRadius: 6, padding: '4px 10px', display: 'inline-block' }}>
                              <span style={{ color: '#10b981', fontSize: 15, fontWeight: 800 }}>
                                PKR {totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                              </span>
                            </div>
                          </Table.Summary.Cell>
                        </Table.Summary.Row>
                      );
                    }}
                  />
                </div>
              </div>
            );
          })()}
        </Spin>
      </DraggableResizableModal>
    </Card>
  );
};

export default PurchaseRequisitionManagement;
