import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Table, Button, Space, Tag, Modal, Form, Input, Select, App, Card,
  InputNumber, Row, Col, Popconfirm, Tooltip, Typography, Descriptions, Segmented,
} from 'antd';
import {
  PlusOutlined, EditOutlined, DeleteOutlined, EyeOutlined, ReloadOutlined, ArrowLeftOutlined,
  ArrowUpOutlined, ArrowDownOutlined, CopyOutlined, UnorderedListOutlined, ApartmentOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import OperationEditor, {
  Routing, RoutingOperation, LookupItem, Item, Division, Section, Department, Uom, Machine, Warehouse,
} from './OperationEditor';
import RoutingProcessFlow from './RoutingProcessFlow';
import dayjs from 'dayjs';
import apiService, { describeRequestError } from '../../services/api';
import SaveResultDialog, { SaveResultData, SaveResultPhase } from '../../components/shared/SaveResultDialog';
import { TabKeepAlive, GlobalLoading } from '../../components/shared';
import { formatDecimal, toNum } from '../../utils/numberFormat';
import { handleValidationErrors } from '../../utils/formValidationHelper';

import { getLookupsSnapshot, subscribeLookups } from '../../services/lookupsCache';
import { tabSessionCache, TAB_REFRESH_EVENT } from '../../services/tabSessionCache';

const ROUTING_TAB_ID = '/production/routings';

interface RoutingTabCache {
  routings: Routing[];
  search: string;
  filterStatus?: string;
}

const { Title } = Typography;

const formatDateTime = (val?: string | Date | null) => val ? dayjs(val).format('DD-MMM-YYYY HH:mm') : '-';

interface RouteType { id: string; routeCode: string; name: string; status?: string; }
interface Bom extends LookupItem { bomCode: string; productId?: string; }

const STATUS_COLORS: Record<string, string> = { DRAFT: 'default', ACTIVE: 'green', OBSOLETE: 'red' };

/** Fields accepted by CreateRoutingDto / UpdateRoutingDto. companyId is derived
 *  server-side from the org scope and is intentionally never sent by the client. */
const ROUTING_PAYLOAD_FIELDS = [
  'name',
  'description',
  'productId',
  'bomId',
  'routeTypeId',
  'baseQuantity',
  'isDefault',
  'effectiveFrom',
  'effectiveTo',
] as const;

const RoutingManagement: React.FC = () => {
  const { message, modal } = App.useApp();
  const initialSnap = getLookupsSnapshot();
  const cachedTab = useMemo(() => tabSessionCache.get<RoutingTabCache>(ROUTING_TAB_ID), []);

  const [routings, setRoutings] = useState<Routing[]>(() => cachedTab?.routings ?? []);
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<Item[]>(() => initialSnap.items as Item[]);
  const [itemSearching, setItemSearching] = useState(false);
  const [boms, setBoms] = useState<Bom[]>([]);
  const [divisions, setDivisions] = useState<Division[]>(() => initialSnap.divisions as Division[]);
  const [sections, setSections] = useState<Section[]>(() => initialSnap.sections as Section[]);
  const [departments, setDepartments] = useState<Department[]>(() => initialSnap.departments as Department[]);
  const [uoms, setUoms] = useState<Uom[]>(() => initialSnap.uoms as Uom[]);
  const [machines, setMachines] = useState<Machine[]>(() => initialSnap.machines as Machine[]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [routeTypes, setRouteTypes] = useState<RouteType[]>([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [detailVisible, setDetailVisible] = useState(false);
  const [opEditor, setOpEditor] = useState<{ open: boolean; operation: RoutingOperation | null }>({ open: false, operation: null });
  const [editingRouting, setEditingRouting] = useState<Routing | null>(null);
  const [selectedRouting, setSelectedRouting] = useState<Routing | null>(null);
  const [form] = Form.useForm();
  const selectedProductId = Form.useWatch('productId', form);
  const [routingSaving, setRoutingSaving] = useState(false);
  const [routingResultOpen, setRoutingResultOpen] = useState(false);
  const [routingResultPhase, setRoutingResultPhase] = useState<SaveResultPhase>('loading');
  const [routingResult, setRoutingResult] = useState<SaveResultData | null>(null);
  const [routingResultError, setRoutingResultError] = useState<string>('');
  const [routingResultErrorTitle, setRoutingResultErrorTitle] = useState<string | undefined>(undefined);
  const [routingResultErrorLead, setRoutingResultErrorLead] = useState<string | undefined>(undefined);
  const [search, setSearch] = useState<string>(() => cachedTab?.search ?? '');
  const [filterStatus, setFilterStatus] = useState<string | undefined>(() => cachedTab?.filterStatus ?? undefined);
  const [viewMode, setViewMode] = useState<'table' | 'flow'>('table');

  const searchItems = useCallback(async (query: string) => {
    if (!query || query.trim().length < 2) return;
    setItemSearching(true);
    try {
      const res = await apiService.get<any>('/master-data/items', { search: query.trim(), limit: 50 });
      const found = res?.data || [];
      if (Array.isArray(found) && found.length > 0) {
        setItems((prev) => {
          const map = new Map(prev.map((i) => [i.id, i]));
          found.forEach((item: Item) => map.set(item.id, item));
          return Array.from(map.values());
        });
      }
    } catch {}
    finally { setItemSearching(false); }
  }, []);

  const fetchRoutings = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiService.get<any>('/production/routings');
      const raw = res?.data;
      const list = Array.isArray(raw)
        ? raw
        : (Array.isArray(raw?.data) ? raw.data : (Array.isArray(res) ? res : []));
      setRoutings(list);
      // Persist to session cache so switching back restores rows + filters
      tabSessionCache.set<RoutingTabCache>(ROUTING_TAB_ID, {
        routings: list,
        search,
        filterStatus,
      });
    } catch {
      message.error('Failed to fetch routings');
    }
    finally { setLoading(false); }
  }, [message, search, filterStatus]);

  const fetchLookupData = useCallback(async () => {
    try {
      const [itemsRes, bomRes, divRes, secRes, deptRes, uomRes, rtRes, machineRes, whRes] = await Promise.all([
        apiService.get<{ data: Item[] }>('/master-data/items', { limit: 500 }),
        apiService.get<{ data: Bom[] }>('/bom'),
        apiService.get<{ data: Division[] }>('/divisions', { limit: 200 }),
        apiService.get<{ data: Section[] }>('/sections', { limit: 200 }),
        apiService.get<{ data: Department[] }>('/departments', { limit: 200 }),
        apiService.get<{ data: Uom[] }>('/master-data/uom', { limit: 200 }),
        apiService.get<{ data: RouteType[] }>('/master-data/route-types', { limit: 200 }),
        apiService.get<{ data: Machine[] }>('/production/machines'),
        apiService.get<{ data: Warehouse[] }>('/warehouses'),
      ]);
      setItems(itemsRes.data || []);
      setBoms(bomRes.data || []);
      setDivisions(divRes.data || []);
      setSections(secRes.data || []);
      setDepartments(deptRes.data || []);
      setUoms(uomRes.data || []);
      setRouteTypes(rtRes.data || []);
      setMachines(machineRes.data || []);
      setWarehouses(whRes.data || []);
    } catch {}
  }, []);

  useEffect(() => {
    // If the tab was already loaded in this session, DO NOT re-fetch when
    // returning to it — the cached rows are already seeded into state.
    if (!tabSessionCache.has(ROUTING_TAB_ID)) {
      fetchRoutings();
    }
    fetchLookupData();
    const unsubscribe = subscribeLookups((snap) => {
      if (snap.items.length > 0) setItems(snap.items as Item[]);
      if (snap.divisions.length > 0) setDivisions(snap.divisions as Division[]);
      if (snap.sections.length > 0) setSections(snap.sections as Section[]);
      if (snap.departments.length > 0) setDepartments(snap.departments as Department[]);
      if (snap.uoms.length > 0) setUoms(snap.uoms as Uom[]);
      if (snap.machines.length > 0) setMachines(snap.machines as Machine[]);
    });
    return () => unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Global header/tab refresh event listener
  useEffect(() => {
    const handleGlobalRefresh = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!detail?.tabId || String(detail.tabId).startsWith(ROUTING_TAB_ID)) {
        tabSessionCache.remove(ROUTING_TAB_ID);
        void fetchRoutings();
      }
    };
    window.addEventListener(TAB_REFRESH_EVENT, handleGlobalRefresh);
    return () => window.removeEventListener(TAB_REFRESH_EVENT, handleGlobalRefresh);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchRoutings]);

  const filteredRoutings = (routings || []).filter(r => {
    const matchSearch = !search || r.routingCode.toLowerCase().includes(search.toLowerCase()) || r.name.toLowerCase().includes(search.toLowerCase());
    const matchStatus = !filterStatus || r.status === filterStatus;
    return matchSearch && matchStatus;
  });

  const refreshDetail = useCallback(async (id: string) => {
    try {
      const res = await apiService.get<any>(`/production/routings/${id}`);
      const raw = res?.data;
      const rtg = (raw && raw.id) ? raw : (raw?.data || res);
      setSelectedRouting(rtg);
    } catch {}
  }, []);

  const handleCreate = () => {
    setEditingRouting(null);
    form.resetFields();
    setModalVisible(true);
  };

  const handleEdit = (routing: Routing) => {
    setEditingRouting(routing);
    if (routing.product && routing.productId) {
      const prodObj: Item = {
        id: routing.productId,
        itemCode: routing.product.itemCode,
        name: routing.product.name,
      } as Item;
      setItems((prev) => prev.some((i) => i.id === routing.productId) ? prev : [prodObj, ...prev]);
    }
    if (routing.routeType && routing.routeTypeId) {
      const rtObj: RouteType = {
        id: routing.routeTypeId,
        routeCode: routing.routeType.routeCode,
        name: routing.routeType.name,
      } as RouteType;
      setRouteTypes((prev) => prev.some((r) => r.id === routing.routeTypeId) ? prev : [rtObj, ...prev]);
    }
    form.setFieldsValue({
      name: routing.name,
      description: routing.description,
      productId: routing.productId,
      bomId: routing.bomId || undefined,
      routeTypeId: routing.routeTypeId || undefined,
      baseQuantity: routing.baseQuantity,
      isDefault: routing.isDefault,
      effectiveFrom: routing.effectiveFrom,
      effectiveTo: routing.effectiveTo,
    });
    setModalVisible(true);
  };

  const handleViewDetail = (routing: Routing) => {
    setSelectedRouting(routing);
    setDetailVisible(true);
  };

  const handleSave = async () => {
    if (routingSaving) return;
    let raw: any;
    try {
      raw = await form.validateFields();
    } catch (err: any) {
      const val = handleValidationErrors(err, form);
      if (val) {
        setRoutingResultErrorTitle('Required Information Missing');
        setRoutingResultErrorLead('Please complete all required fields before saving:');
        setRoutingResultError(val.bulletList);
        setRoutingResultPhase('error');
        setRoutingResultOpen(true);
        return;
      }
      message.error(describeRequestError(err));
      return;
    }
    const payload: Record<string, unknown> = {};
    for (const key of ROUTING_PAYLOAD_FIELDS) {
      if (raw[key] !== undefined) payload[key] = raw[key];
    }

    setRoutingResultErrorTitle(undefined);
    setRoutingResultErrorLead(undefined);
    setRoutingSaving(true);
    setRoutingResultPhase('loading');
    setRoutingResultOpen(true);
    try {
      let saved: { routingCode?: string; name?: string } | undefined;
      if (editingRouting) {
        const res = (await apiService.put(`/production/routings/${editingRouting.id}`, payload)) as {
          data?: { routingCode?: string; name?: string };
        };
        saved = res?.data;
      } else {
        const res = (await apiService.post('/production/routings', payload)) as {
          data?: { routingCode?: string; name?: string };
        };
        saved = res?.data;
      }
      setRoutingResult({
        title: editingRouting ? 'Routing Updated Successfully' : 'Routing Saved Successfully',
        recordType: 'Routing Code',
        recordCode: saved?.routingCode != null ? String(saved.routingCode) : undefined,
        recordName: saved?.name != null ? String(saved.name) : undefined,
      });
      setRoutingResultPhase('success');
      setModalVisible(false);
      fetchRoutings();
      if (editingRouting && selectedRouting?.id === editingRouting.id) await refreshDetail(editingRouting.id);
    } catch (err: any) {
      setRoutingResultError(describeRequestError(err));
      setRoutingResultPhase('error');
    } finally {
      setRoutingSaving(false);
    }
  };

  const handleDelete = (id: string, code?: string) => {
    modal.confirm({
      centered: true,
      title: 'Delete Routing',
      content: `Are you sure you want to delete routing ${code || ''}? This action cannot be undone.`,
      okText: 'Delete',
      okType: 'danger',
      cancelText: 'Cancel',
      onOk: async () => {
        try {
          await apiService.delete(`/production/routings/${id}`);
          message.success('Routing deleted successfully');
          fetchRoutings();
          if (selectedRouting?.id === id) setDetailVisible(false);
        } catch (err: any) {
          modal.error({
            centered: true,
            title: 'Delete Failed',
            content: describeRequestError(err),
          });
        }
      },
    });
  };

  const handleStatusChange = async (id: string, status: string) => {
    try {
      await apiService.put(`/production/routings/${id}/status`, { status });
      message.success(`Routing status changed to ${status}`);
      fetchRoutings();
      if (selectedRouting?.id === id) await refreshDetail(id);
    } catch (err: any) {
      message.error(err?.response?.data?.message || 'Failed to change status');
    }
  };

  const handleAddOp = () => {
    setOpEditor({ open: true, operation: null });
  };

  const handleEditOp = (op: RoutingOperation) => {
    setOpEditor({ open: true, operation: op });
  };

  const handleOpSaved = async () => {
    setOpEditor(e => ({ ...e, open: false }));
    if (selectedRouting) await refreshDetail(selectedRouting.id);
    fetchRoutings();
  };

  const confirmDeleteOp = (op: RoutingOperation) => {
    modal.confirm({
      centered: true,
      title: 'Remove Operation',
      content: (
        <div>
          <p style={{ fontSize: 14, margin: '8px 0 4px 0' }}>
            Are you sure you want to remove operation <strong>{op.operationCode}</strong> ({op.operationName})?
          </p>
          <p style={{ color: '#dc2626', fontSize: 12, margin: 0 }}>
            This will permanently remove this operation from the routing sequence.
          </p>
        </div>
      ),
      okText: 'Remove Operation',
      okType: 'danger',
      cancelText: 'Cancel',
      onOk: async () => {
        setRoutingResultPhase('loading');
        setRoutingResult({
          title: 'Removing Operation...',
          recordType: 'Operation Code',
          recordCode: op.operationCode,
          recordName: op.operationName,
        });
        setRoutingResultError('');
        setRoutingResultOpen(true);
        try {
          await apiService.delete(`/production/routings/operations/${op.id}`);
          setRoutingResult({
            title: 'Operation Removed Successfully',
            recordType: 'Operation Code',
            recordCode: op.operationCode,
            recordName: op.operationName,
          });
          setRoutingResultPhase('success');
          await refreshDetail(selectedRouting!.id);
          fetchRoutings();
        } catch (err: any) {
          setRoutingResultError(describeRequestError(err) || 'Failed to remove operation');
          setRoutingResultPhase('error');
        }
      },
    });
  };

  const handleReorderOp = async (op: RoutingOperation, dir: number) => {
    try {
      const ops = [...(selectedRouting?.operations || [])].sort((a, b) => a.sequenceNo - b.sequenceNo);
      const idx = ops.findIndex(o => o.id === op.id);
      const target = ops[idx + dir];
      if (!target) return;
      await apiService.post(
        `/production/routings/${selectedRouting!.id}/operations/${op.id}/reorder`,
        { newSequenceNo: target.sequenceNo },
      );
      message.success('Operation reordered');
      await refreshDetail(selectedRouting!.id);
      fetchRoutings();
    } catch (err: any) {
      message.error(err?.response?.data?.message || 'Failed to reorder operation');
    }
  };

  const handleDuplicateOp = async (op: RoutingOperation) => {
    try {
      await apiService.post(
        `/production/routings/${selectedRouting!.id}/operations/${op.id}/duplicate`,
        {},
      );
      message.success('Operation duplicated');
      await refreshDetail(selectedRouting!.id);
      fetchRoutings();
    } catch (err: any) {
      message.error(err?.response?.data?.message || 'Failed to duplicate operation');
    }
  };

  const renderInputs = (r: RoutingOperation) => {
    if (r.inputs && r.inputs.length) {
      return (
        <Space direction="vertical" size={0} style={{ width: '100%' }}>
          {r.inputs.map((i, idx) => (
            <div key={idx}>
              {i.item ? `${i.item.itemCode} - ${i.item.name}` : i.itemId || '-'}
              {i.quantity != null ? <Typography.Text type="secondary" style={{ fontSize: 12 }}> × {formatDecimal(toNum(i.quantity))}</Typography.Text> : null}
              {i.isPrimary ? <Tag color="blue" style={{ marginLeft: 4, fontSize: 11 }}>Primary</Tag> : null}
            </div>
          ))}
        </Space>
      );
    }
    return (
      <span>
        <div>{r.inputItem ? `${r.inputItem.itemCode} - ${r.inputItem.name}` : '-'}</div>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>{formatDecimal(toNum(r.inputQuantity))} {r.uom?.code || ''}</Typography.Text>
      </span>
    );
  };

  const renderOutputs = (r: RoutingOperation) => {
    if (r.outputs && r.outputs.length) {
      return (
        <Space direction="vertical" size={0} style={{ width: '100%' }}>
          {r.outputs.map((o, idx) => (
            <div key={idx}>
              {o.item ? `${o.item.itemCode} - ${o.item.name}` : o.itemId || '-'}
              {o.quantity != null ? <Typography.Text type="secondary" style={{ fontSize: 12 }}> × {formatDecimal(toNum(o.quantity))}</Typography.Text> : null}
              {o.outputType && o.outputType !== 'MAIN' ? <Tag color="purple" style={{ marginLeft: 4, fontSize: 11 }}>{o.outputType}</Tag> : null}
            </div>
          ))}
        </Space>
      );
    }
    return (
      <span>
        <div>{r.outputItem ? `${r.outputItem.itemCode} - ${r.outputItem.name}` : '-'}</div>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>{formatDecimal(toNum(r.outputQuantity))} {r.uom?.code || ''}</Typography.Text>
      </span>
    );
  };

  const columns: ColumnsType<Routing> = [
    { title: 'Code', dataIndex: 'routingCode', key: 'routingCode', width: 130, fixed: 'left' },
    { title: 'Name', dataIndex: 'name', key: 'name', width: 220 },
    { title: 'Product', key: 'product', width: 220, render: (_, r) => r.product ? `${r.product.itemCode} - ${r.product.name}` : (r.productId || '-') },
    { title: 'Route Type', key: 'routeType', width: 150, render: (_, r) => r.routeType ? `${r.routeType.routeCode} - ${r.routeType.name}` : (r.routeTypeId ? (routeTypes.find(rt => rt.id === r.routeTypeId)?.name || '-') : '-') },
    { title: 'BOM', key: 'bom', width: 130, render: (_, r) => r.bom ? `${r.bom.bomCode}` : '-' },
    { title: 'Status', dataIndex: 'status', key: 'status', width: 100, render: (s: string) => <Tag color={STATUS_COLORS[s]}>{s}</Tag> },
    { title: 'Ops', key: 'ops', width: 60, align: 'center', render: (_, r) => r.operations?.length || 0 },
    { title: 'Default', dataIndex: 'isDefault', key: 'isDefault', width: 80, align: 'center', render: (v: boolean) => v ? <Tag color="blue">Yes</Tag> : 'No' },
    { title: 'Created By', key: 'createdBy', width: 140, render: (_, r) => r.createdByName || (r.createdBy ? 'Admin' : '-') },
    { title: 'Created Date', key: 'createdAt', width: 150, render: (_, r) => formatDateTime(r.createdAt) },
    { title: 'Updated By', key: 'updatedBy', width: 140, render: (_, r) => r.updatedByName || (r.updatedBy ? 'Admin' : '-') },
    { title: 'Updated Date', key: 'updatedAt', width: 150, render: (_, r) => formatDateTime(r.updatedAt) },
    {
      title: 'Actions', key: 'actions', width: 130, fixed: 'right', render: (_, r) => (
        <Space size="small">
          <Tooltip title="View Details"><Button size="small" icon={<EyeOutlined />} onClick={() => handleViewDetail(r)} /></Tooltip>
          <Tooltip title="Edit Routing"><Button size="small" icon={<EditOutlined />} onClick={() => handleEdit(r)} /></Tooltip>
          <Tooltip title="Delete Routing"><Button size="small" danger icon={<DeleteOutlined />} onClick={() => handleDelete(r.id, r.routingCode)} /></Tooltip>
        </Space>
      ),
    },
  ];

  const opColumns: ColumnsType<RoutingOperation> = [
    { title: '#', dataIndex: 'sequenceNo', key: 'sequenceNo', width: 50 },
    { title: 'Code', dataIndex: 'operationCode', key: 'operationCode', width: 100 },
    { title: 'Operation', dataIndex: 'operationName', key: 'operationName', width: 150 },
    {
      title: 'Input Materials', key: 'inputs', width: 220, render: (_, r) => renderInputs(r),
    },
    {
      title: 'Output Products', key: 'outputs', width: 220, render: (_, r) => renderOutputs(r),
    },
    { title: 'Division', key: 'division', width: 90, render: (_, r) => r.division?.name || '-' },
    { title: 'Section', key: 'section', width: 90, render: (_, r) => r.section?.name || '-' },
    { title: 'Department', key: 'department', width: 100, render: (_, r) => r.department?.name || '-' },
    { title: 'Machine', key: 'machine', width: 100, render: (_, r) => r.machine ? r.machine.machineCode : '-' },
    { title: 'Setup', key: 'setup', width: 65, render: (_, r) => formatDecimal(toNum(r.setupTimeMinutes)) },
    { title: 'Run', key: 'run', width: 65, render: (_, r) => formatDecimal(toNum(r.runTimeMinutes)) },
    { title: 'Total', key: 'total', width: 65, render: (_, r) => formatDecimal(toNum(r.setupTimeMinutes) + toNum(r.runTimeMinutes) + toNum(r.queueTimeMinutes) + toNum(r.waitTimeMinutes)) },
    { title: 'Status', dataIndex: 'status', key: 'status', width: 85, render: (s: string) => <Tag color={s === 'ACTIVE' ? 'green' : 'default'}>{s}</Tag> },
    {
      title: 'Actions', key: 'actions', width: 150, render: (_, r) => (
        <Space size="small" wrap>
          <Tooltip title="Edit"><Button size="small" icon={<EditOutlined />} disabled={selectedRouting?.status !== 'DRAFT'} onClick={() => handleEditOp(r)} /></Tooltip>
          {selectedRouting?.status === 'DRAFT' && (
            <>
              <Tooltip title="Move up"><Button size="small" icon={<ArrowUpOutlined />} onClick={() => handleReorderOp(r, -1)} /></Tooltip>
              <Tooltip title="Move down"><Button size="small" icon={<ArrowDownOutlined />} onClick={() => handleReorderOp(r, 1)} /></Tooltip>
              <Tooltip title="Duplicate"><Button size="small" icon={<CopyOutlined />} onClick={() => handleDuplicateOp(r)} /></Tooltip>
              <Tooltip title="Remove"><Button size="small" danger icon={<DeleteOutlined />} onClick={() => confirmDeleteOp(r)} /></Tooltip>
            </>
          )}
        </Space>
      ),
    },
  ];

  if (detailVisible && selectedRouting) {
    return (
      <div style={{ padding: '4px 6px', width: '100%' }}>
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          <Space>
            <Button icon={<ArrowLeftOutlined />} onClick={() => { setDetailVisible(false); setSelectedRouting(null); }}>Back to List</Button>
            <Title level={4} style={{ margin: 0 }}>{selectedRouting.routingCode} - {selectedRouting.name}</Title>
            <Tag color={STATUS_COLORS[selectedRouting.status]}>{selectedRouting.status}</Tag>
          </Space>
          <Descriptions bordered size="small" column={4}>
            <Descriptions.Item label="Routing Code">{selectedRouting.routingCode}</Descriptions.Item>
            <Descriptions.Item label="Name">{selectedRouting.name}</Descriptions.Item>
            <Descriptions.Item label="Product">{selectedRouting.product ? `${selectedRouting.product.itemCode} - ${selectedRouting.product.name}` : '-'}</Descriptions.Item>
            <Descriptions.Item label="BOM">{selectedRouting.bom?.bomCode || '-'}</Descriptions.Item>
            <Descriptions.Item label="Route Type">{selectedRouting.routeType ? `${selectedRouting.routeType.routeCode} - ${selectedRouting.routeType.name}` : '-'}</Descriptions.Item>
            <Descriptions.Item label="Base Qty">{formatDecimal(toNum(selectedRouting.baseQuantity))}</Descriptions.Item>
            <Descriptions.Item label="Total Time">{formatDecimal(toNum(selectedRouting.estimatedTotalTime))} min</Descriptions.Item>
            <Descriptions.Item label="Default">{selectedRouting.isDefault ? 'Yes' : 'No'}</Descriptions.Item>
            <Descriptions.Item label="Description" span={4}>{selectedRouting.description || '-'}</Descriptions.Item>
          </Descriptions>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
            <Segmented
              size="middle"
              value={viewMode}
              onChange={(val) => setViewMode(val as 'table' | 'flow')}
              options={[
                { label: 'Operations List', value: 'table', icon: <UnorderedListOutlined /> },
                { label: 'Process Flow', value: 'flow', icon: <ApartmentOutlined /> },
              ]}
            />
            {viewMode === 'table' && selectedRouting.status === 'DRAFT' && (
              <Button type="primary" size="small" icon={<PlusOutlined />} onClick={handleAddOp}>
                Add Operation
              </Button>
            )}
          </div>

          {viewMode === 'table' ? (
            <Card title="Routing Operations" extra={
              selectedRouting.status === 'DRAFT' ? <Button type="primary" size="small" icon={<PlusOutlined />} onClick={handleAddOp}>Add Operation</Button> : null
            }>
              <Table dataSource={selectedRouting.operations || []} columns={opColumns} rowKey="id" size="small" pagination={false} />
            </Card>
          ) : (
            <RoutingProcessFlow
              routing={selectedRouting}
              onRefreshRouting={() => refreshDetail(selectedRouting.id)}
              onEditOperation={handleEditOp}
            />
          )}
          <Space>
            {selectedRouting.status === 'DRAFT' && (
              <Popconfirm title="Activate this routing?" onConfirm={() => handleStatusChange(selectedRouting.id, 'ACTIVE')}>
                <Button type="primary" disabled={(selectedRouting.operations?.length || 0) === 0}>Activate</Button>
              </Popconfirm>
            )}
            {selectedRouting.status === 'ACTIVE' && (
              <>
                <Popconfirm title="Mark as Obsolete?" onConfirm={() => handleStatusChange(selectedRouting.id, 'OBSOLETE')}>
                  <Button danger>Mark Obsolete</Button>
                </Popconfirm>
                <Popconfirm title="Revert to Draft for revisions?" onConfirm={() => handleStatusChange(selectedRouting.id, 'DRAFT')}>
                  <Button>Revert to Draft</Button>
                </Popconfirm>
              </>
            )}
            {selectedRouting.status === 'OBSOLETE' && (
              <Popconfirm title="Restore back to Draft?" onConfirm={() => handleStatusChange(selectedRouting.id, 'DRAFT')}>
                <Button type="primary">Restore to Draft</Button>
              </Popconfirm>
            )}
          </Space>
        </Space>

        <OperationEditor
          open={opEditor.open}
          routing={selectedRouting}
          operation={opEditor.operation}
          lookups={{ items, divisions, sections, departments, uoms, machines, warehouses }}
          onClose={() => setOpEditor(e => ({ ...e, open: false }))}
          onSaved={handleOpSaved}
        />

        <SaveResultDialog
          open={routingResultOpen}
          phase={routingResultPhase}
          result={routingResult}
          errorMessage={routingResultError}
          onRetry={handleSave}
          onClose={() => setRoutingResultOpen(false)}
        />
      </div>
    );
  }

  return (
    <TabKeepAlive
      tabId={ROUTING_TAB_ID}
      load={async () => { await fetchRoutings(); await fetchLookupData(); }}
      serialize={() => ({ routings, search, filterStatus })}
    >
      <div style={{ padding: '4px 6px', width: '100%' }}>
        <Card title="Production Routings" extra={
          <Space>
            <Input.Search placeholder="Search routings..." value={search} onChange={e => setSearch(e.target.value)} style={{ width: 250 }} />
            <Select placeholder="Status" allowClear value={filterStatus} onChange={setFilterStatus} style={{ width: 130 }}>
              <Select.Option value="DRAFT">Draft</Select.Option>
              <Select.Option value="ACTIVE">Active</Select.Option>
              <Select.Option value="OBSOLETE">Obsolete</Select.Option>
            </Select>
            <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate} style={{ fontWeight: 600 }}>New Routing</Button>
            <Button icon={<ReloadOutlined />} onClick={fetchRoutings}>Refresh</Button>
          </Space>
        }>
          <div style={{ position: 'relative', minHeight: 340 }}>
            {loading && filteredRoutings.length === 0 ? (
              <GlobalLoading
                title="Loading Production Routings..."
                subtitle="Retrieving all configured routings directly from database..."
                badgeText="LIVE DATABASE QUERY"
                minHeight={360}
              />
            ) : (
              <>
                {loading && (
                  <GlobalLoading
                    overlay
                    title="Refreshing Production Routings..."
                    subtitle="Updating routing operations and cost estimates..."
                    badgeText="Instant Sync"
                  />
                )}
                <Table
                  dataSource={filteredRoutings}
                  columns={columns}
                  rowKey="id"
                  loading={false}
                  scroll={{ x: 1800 }}
                  pagination={{ pageSize: 20, showSizeChanger: true, showTotal: (t) => `Total ${t} routings` }}
                />
              </>
            )}
          </div>
        </Card>

      <Modal
        title={editingRouting ? 'Edit Routing' : 'New Routing'}
        open={modalVisible}
        onCancel={() => setModalVisible(false)}
        width={720}
        destroyOnHidden
        footer={[
          <Button key="cancel" onClick={() => setModalVisible(false)} disabled={routingSaving}>Cancel</Button>,
          <Button key="save" type="primary" onClick={handleSave} loading={routingSaving} disabled={routingSaving}>Save</Button>,
        ]}
      >
        <Form form={form} layout="vertical">
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="name" label="Routing Name" rules={[{ required: true, message: 'Routing Name is required' }]}>
                <Input maxLength={255} placeholder="e.g. Spoke Assembly Routing" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="productId" label="Product" rules={[{ required: true, message: 'Product is required' }]}>
                <Select
                  showSearch
                  placeholder="Type code or name to search product..."
                  filterOption={(input, option: any) => {
                    const text = Array.isArray(option?.children)
                      ? option.children.join('')
                      : String(option?.children ?? option?.label ?? '');
                    return text.toLowerCase().includes((input || '').toLowerCase());
                  }}
                  onSearch={searchItems}
                  loading={itemSearching}
                  onChange={() => form.setFieldValue('bomId', undefined)}
                >
                  {items.map(i => <Select.Option key={i.id} value={i.id}>{i.itemCode} - {i.name}</Select.Option>)}
                </Select>
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="bomId"
                label="BOM (Optional)"
                extra={selectedProductId ? undefined : 'Select product first to filter matching BOMs'}
              >
                <Select
                  allowClear
                  showSearch
                  optionFilterProp="children"
                  placeholder={
                    selectedProductId
                      ? (boms.filter(b => b.productId === selectedProductId).length > 0
                          ? "Select matching BOM (optional)"
                          : "No BOM for this product (optional)")
                      : "Select product first (optional)"
                  }
                >
                  {(selectedProductId
                    ? boms.filter(b => b.productId === selectedProductId || (editingRouting && editingRouting.bomId === b.id))
                    : boms
                  ).map(b => (
                    <Select.Option key={b.id} value={b.id}>
                      {b.bomCode} - {b.name}
                    </Select.Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="routeTypeId" label="Route Type (Classification)">
                <Select allowClear showSearch optionFilterProp="children" placeholder="Select route type (optional)">
                  {routeTypes.map(rt => <Select.Option key={rt.id} value={rt.id}>{rt.routeCode} - {rt.name}</Select.Option>)}
                </Select>
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={6}><Form.Item name="baseQuantity" label="Base Quantity" initialValue={1}><InputNumber min={0.0001} style={{ width: '100%' }} /></Form.Item></Col>
            <Col span={6}><Form.Item name="isDefault" label="Default" valuePropName="checked"><Input type="checkbox" /></Form.Item></Col>
          </Row>
          <Form.Item name="description" label="Description"><Input.TextArea rows={2} placeholder="Optional notes or description" /></Form.Item>
        </Form>
      </Modal>

      <SaveResultDialog
        open={routingResultOpen}
        phase={routingResultPhase}
        result={routingResult}
        errorTitle={routingResultErrorTitle}
        errorLead={routingResultErrorLead}
        errorMessage={routingResultError}
        onRetry={handleSave}
        onClose={() => setRoutingResultOpen(false)}
      />
    </div>
  </TabKeepAlive>
  );
};

export default RoutingManagement;