import React, { useEffect, useState, useCallback, useRef } from 'react';
import { Alert, Button, Card, Col, DatePicker, Descriptions, Form, Input, InputNumber, Modal, Popconfirm, Row, Select, Space, Table, Tag, Tooltip, Typography, message } from 'antd';
import { EyeOutlined, EditOutlined, DeleteOutlined, InboxOutlined, ReloadOutlined, PlusOutlined, RollbackOutlined, LoadingOutlined, SwapOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import apiService from '../../services/api';
import { formatNumber } from '../../utils/numberFormat';

const { Text, Title } = Typography;

interface OrgOption { id: string; name?: string; divisionCode?: string; sectionCode?: string; departmentCode?: string; status?: string; }
interface WarehousingOption { id: string; name?: string; warehouseCode?: string; status?: string; }
interface ItemOption { id: string; name?: string; itemCode?: string; itemType?: string; }
interface UomOption { id: string; code?: string; name?: string; symbol?: string; status?: string; }

interface LedgerEntry {
  id: string; transactionDate: string;
  item?: { id: string; name: string; itemCode: string };
  warehouse?: { id: string; name: string; warehouseCode: string };
  uom?: { id: string; code: string; name: string; symbol: string };
  division?: { id: string; name: string; divisionCode: string } | null;
  section?: { id: string; name: string; sectionCode: string } | null;
  department?: { id: string; name: string; departmentCode: string } | null;
  transactionType: string; direction: string; quantity: number;
  referenceType: string; referenceNumber: string; notes: string;
  createdBy?: string; createdAt?: string;
}

type LoadState = 'loading' | 'error' | 'ready';

const TX_TYPE_OPTIONS = [
  { value: '', label: 'All Transactions' },
  { value: 'RECEIPT', label: 'Receipts' },
  { value: 'RETURN_OUT', label: 'Returns' },
];

const TX_COLORS: Record<string, string> = { RECEIPT: 'green', RETURN_OUT: 'volcano', OPENING: 'default', PRODUCTION_ISSUE: 'orange', PRODUCTION_RECEIPT: 'cyan', PRODUCTION_SCRAP: 'red' };

const orgFields = (
  divs: OrgOption[], divsState: LoadState, secs: OrgOption[], secsState: LoadState,
  depts: OrgOption[], deptsState: LoadState, watchDiv: string | undefined, watchSec: string | undefined,
  form: any,
) => (
  <Row gutter={16}>
    <Col xs={24} md={8}>
      <Form.Item name="divisionId" label={<span>Division <Text type="danger">*</Text></span>} rules={[{ required: true, message: 'Select Division' }]}>
        <Select allowClear showSearch optionFilterProp="label" placeholder="Select Division"
          loading={divsState === 'loading'} status={divsState === 'error' ? 'error' : undefined}
          notFoundContent={divsState === 'error' ? 'Divisions could not be loaded' : divsState === 'loading' ? <Space><LoadingOutlined /> Loading...</Space> : 'No active divisions'}
          options={divs.map((d) => ({ value: d.id, label: d.divisionCode ? `${d.divisionCode} — ${d.name}` : d.name }))} />
      </Form.Item>
    </Col>
    <Col xs={24} md={8}>
      <Form.Item name="sectionId" label={<span>Section <Text type="danger">*</Text></span>} rules={[{ required: true, message: 'Select Section' }]}>
        <Select allowClear showSearch optionFilterProp="label"
          placeholder={watchDiv ? 'Select Section' : 'Select Division first'} disabled={!watchDiv}
          loading={!!watchDiv && secsState === 'loading'} status={!!watchDiv && secsState === 'error' ? 'error' : undefined}
          notFoundContent={watchDiv ? (secsState === 'loading' ? <Space><LoadingOutlined /> Loading...</Space> : 'No sections') : 'Select Division first'}
          options={secs.map((s) => ({ value: s.id, label: s.sectionCode ? `${s.sectionCode} — ${s.name}` : s.name }))} />
      </Form.Item>
    </Col>
    <Col xs={24} md={8}>
      <Form.Item name="departmentId" label={<span>Department <Text type="danger">*</Text></span>} rules={[{ required: true, message: 'Select Department' }]}>
        <Select allowClear showSearch optionFilterProp="label"
          placeholder={watchSec ? 'Select Department' : 'Select Section first'} disabled={!watchSec}
          loading={!!watchSec && deptsState === 'loading'} status={!!watchSec && deptsState === 'error' ? 'error' : undefined}
          notFoundContent={watchSec ? (deptsState === 'loading' ? <Space><LoadingOutlined /> Loading...</Space> : 'No departments') : 'Select Section first'}
          options={depts.map((d) => ({ value: d.id, label: d.departmentCode ? `${d.departmentCode} — ${d.name}` : d.name }))} />
      </Form.Item>
    </Col>
  </Row>
);

const InventoryReceiving: React.FC = () => {
  const [recvForm] = Form.useForm();
  const [retForm] = Form.useForm();

  const [divisions, setDivisions] = useState<OrgOption[]>([]);
  const [divisionsState, setDivisionsState] = useState<LoadState>('loading');
  const [items, setItems] = useState<ItemOption[]>([]);
  const [itemsState, setItemsState] = useState<LoadState>('loading');
  const [uoms, setUoms] = useState<UomOption[]>([]);
  const [uomsState, setUomsState] = useState<LoadState>('loading');
  const [warehouses, setWarehouses] = useState<WarehousingOption[]>([]);
  const [warehousesState, setWarehousesState] = useState<LoadState>('loading');

  const [history, setHistory] = useState<LedgerEntry[]>([]);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyState, setHistoryState] = useState<LoadState>('loading');
  const [txTypeFilter, setTxTypeFilter] = useState<string>('');

  const [recvModalOpen, setRecvModalOpen] = useState(false);
  const [retModalOpen, setRetModalOpen] = useState(false);
  const [recvSubmitting, setRecvSubmitting] = useState(false);
  const [retSubmitting, setRetSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [viewTx, setViewTx] = useState<LedgerEntry | null>(null);
  const [viewTxOpen, setViewTxOpen] = useState(false);

  const watchRecvDiv = Form.useWatch('divisionId', recvForm);
  const watchRecvSec = Form.useWatch('sectionId', recvForm);
  const watchRetDiv = Form.useWatch('divisionId', retForm);
  const watchRetSec = Form.useWatch('sectionId', retForm);

  const loadReferenceData = useCallback(async () => {
    setDivisionsState('loading'); setUomsState('loading'); setWarehousesState('loading');
    try {
      const [dv, ref] = await Promise.all([
        apiService.get<{ data: OrgOption[] }>('/inventory/receipts/organization/divisions'),
        apiService.get<{ data: { warehouses: WarehousingOption[]; items: ItemOption[]; uoms: UomOption[] } }>('/inventory/receipts/reference-data'),
      ]);
      setDivisions(dv.data || []); setDivisionsState('ready');
      setWarehouses((ref.data?.warehouses || []).filter((w) => w.status === 'ACTIVE')); setWarehousesState('ready');
      setUoms(ref.data?.uoms || []); setUomsState('ready');
    } catch { setDivisionsState('error'); setWarehousesState('error'); setUomsState('error'); }
  }, []);

  const loadRawMaterials = useCallback(async (divId?: string, secId?: string, depId?: string) => {
    setItemsState('loading');
    try {
      const params: Record<string, any> = { limit: 200 };
      if (divId) params.divisionId = divId;
      if (secId) params.sectionId = secId;
      if (depId) params.departmentId = depId;
      const res = await apiService.get<{ data: ItemOption[] }>('/inventory/receipts/raw-materials', params);
      setItems(res.data || []); setItemsState('ready');
    } catch { setItems([]); setItemsState('error'); }
  }, []);

  const loadHistory = useCallback(async (pageNum: number = 1, txType?: string) => {
    setHistoryLoading(true);
    try {
      const params: any = { page: pageNum, limit: 20 };
      if (txType) params.transactionType = txType;
      const res = await apiService.get<{ data: LedgerEntry[]; total: number }>('/inventory/receipts', params);
      setHistory(res.data || []); setHistoryTotal(res.total || 0); setHistoryState('ready');
    } catch { setHistory([]); setHistoryTotal(0); setHistoryState('error'); }
    finally { setHistoryLoading(false); }
  }, []);

  useEffect(() => { void loadReferenceData(); void loadHistory(1); }, [loadReferenceData, loadHistory]);

  // Cascading for receive form
  const [recvSections, setRecvSections] = useState<OrgOption[]>([]);
  const [recvSectionsState, setRecvSectionsState] = useState<LoadState>('ready');
  const [recvDepts, setRecvDepts] = useState<OrgOption[]>([]);
  const [recvDeptsState, setRecvDeptsState] = useState<LoadState>('ready');
  const watchRecvDep = Form.useWatch('departmentId', recvForm);
  const prefillRecvRef = useRef<{ divisionId?: string | null; sectionId?: string | null; departmentId?: string | null; itemId?: string | null } | null>(null);

  useEffect(() => {
    if (!watchRecvDiv) { setRecvSections([]); setRecvDepts([]); recvForm.setFieldValue('sectionId', undefined); recvForm.setFieldValue('departmentId', undefined); recvForm.setFieldValue('itemId', undefined); setRecvSectionsState('ready'); return; }
    setRecvSectionsState('loading'); setRecvSections([]); setRecvDepts([]); recvForm.setFieldValue('sectionId', undefined); recvForm.setFieldValue('departmentId', undefined); recvForm.setFieldValue('itemId', undefined);
    void apiService.get<{ data: OrgOption[] }>('/inventory/receipts/organization/sections', { divisionId: watchRecvDiv })
      .then((r) => { setRecvSections(r.data || []); setRecvSectionsState('ready'); const p = prefillRecvRef.current; if (p && p.divisionId === watchRecvDiv) recvForm.setFieldValue('sectionId', p.sectionId ?? undefined); })
      .catch(() => { setRecvSections([]); setRecvSectionsState('error'); });
  }, [watchRecvDiv, recvForm]);

  useEffect(() => {
    if (!watchRecvDiv || !watchRecvSec) { setRecvDepts([]); recvForm.setFieldValue('departmentId', undefined); recvForm.setFieldValue('itemId', undefined); setRecvDeptsState('ready'); return; }
    setRecvDeptsState('loading'); setRecvDepts([]); recvForm.setFieldValue('departmentId', undefined); recvForm.setFieldValue('itemId', undefined);
    void apiService.get<{ data: OrgOption[] }>('/inventory/receipts/organization/departments', { divisionId: watchRecvDiv, sectionId: watchRecvSec })
      .then((r) => { setRecvDepts(r.data || []); setRecvDeptsState('ready'); const p = prefillRecvRef.current; if (p && p.sectionId === watchRecvSec) recvForm.setFieldValue('departmentId', p.departmentId ?? undefined); })
      .catch(() => { setRecvDepts([]); setRecvDeptsState('error'); });
  }, [watchRecvDiv, watchRecvSec, recvForm]);

  useEffect(() => {
    recvForm.setFieldValue('itemId', undefined);
    void loadRawMaterials(watchRecvDiv, watchRecvSec, watchRecvDep).then(() => {
      const p = prefillRecvRef.current; if (p && p.departmentId === watchRecvDep) recvForm.setFieldValue('itemId', p.itemId ?? undefined);
    });
  }, [watchRecvDiv, watchRecvSec, watchRecvDep, recvForm, loadRawMaterials]);

  // Cascading for return form
  const [retSections, setRetSections] = useState<OrgOption[]>([]);
  const [retSectionsState, setRetSectionsState] = useState<LoadState>('ready');
  const [retDepts, setRetDepts] = useState<OrgOption[]>([]);
  const [retDeptsState, setRetDeptsState] = useState<LoadState>('ready');
  const watchRetDep = Form.useWatch('departmentId', retForm);
  const prefillRetRef = useRef<{ divisionId?: string | null; sectionId?: string | null; departmentId?: string | null; itemId?: string | null } | null>(null);

  useEffect(() => {
    if (!watchRetDiv) { setRetSections([]); setRetDepts([]); retForm.setFieldValue('sectionId', undefined); retForm.setFieldValue('departmentId', undefined); retForm.setFieldValue('itemId', undefined); setRetSectionsState('ready'); return; }
    setRetSectionsState('loading'); setRetSections([]); setRetDepts([]); retForm.setFieldValue('sectionId', undefined); retForm.setFieldValue('departmentId', undefined); retForm.setFieldValue('itemId', undefined);
    void apiService.get<{ data: OrgOption[] }>('/inventory/receipts/organization/sections', { divisionId: watchRetDiv })
      .then((r) => { setRetSections(r.data || []); setRetSectionsState('ready'); const p = prefillRetRef.current; if (p && p.divisionId === watchRetDiv) retForm.setFieldValue('sectionId', p.sectionId ?? undefined); })
      .catch(() => { setRetSections([]); setRetSectionsState('error'); });
  }, [watchRetDiv, retForm]);

  useEffect(() => {
    if (!watchRetDiv || !watchRetSec) { setRetDepts([]); retForm.setFieldValue('departmentId', undefined); retForm.setFieldValue('itemId', undefined); setRetDeptsState('ready'); return; }
    setRetDeptsState('loading'); setRetDepts([]); retForm.setFieldValue('departmentId', undefined); retForm.setFieldValue('itemId', undefined);
    void apiService.get<{ data: OrgOption[] }>('/inventory/receipts/organization/departments', { divisionId: watchRetDiv, sectionId: watchRetSec })
      .then((r) => { setRetDepts(r.data || []); setRetDeptsState('ready'); const p = prefillRetRef.current; if (p && p.sectionId === watchRetSec) retForm.setFieldValue('departmentId', p.departmentId ?? undefined); })
      .catch(() => { setRetDepts([]); setRetDeptsState('error'); });
  }, [watchRetDiv, watchRetSec, retForm]);

  useEffect(() => {
    retForm.setFieldValue('itemId', undefined);
    void loadRawMaterials(watchRetDiv, watchRetSec, watchRetDep).then(() => {
      const p = prefillRetRef.current; if (p && p.departmentId === watchRetDep) retForm.setFieldValue('itemId', p.itemId ?? undefined);
    });
  }, [watchRetDiv, watchRetSec, watchRetDep, retForm, loadRawMaterials]);

  const clearRecvModal = () => {
    setRecvModalOpen(false); recvForm.resetFields(); setEditingId(null); prefillRecvRef.current = null;
  };
  const clearRetModal = () => {
    setRetModalOpen(false); retForm.resetFields(); setEditingId(null); prefillRetRef.current = null;
  };

  const openEditRecv = (tx: LedgerEntry) => {
    prefillRecvRef.current = { divisionId: tx.division?.id, sectionId: tx.section?.id, departmentId: tx.department?.id, itemId: tx.item?.id };
    setEditingId(tx.id);
    recvForm.setFieldsValue({
      divisionId: tx.division?.id, quantity: tx.quantity, uomId: tx.uom?.id,
      warehouseId: tx.warehouse?.id, reference: tx.referenceNumber || undefined,
      notes: tx.notes || undefined,
      receiptDate: tx.transactionDate ? dayjs(tx.transactionDate) : undefined,
    });
    setRecvModalOpen(true);
  };

  const openEditRet = (tx: LedgerEntry) => {
    prefillRetRef.current = { divisionId: tx.division?.id, sectionId: tx.section?.id, departmentId: tx.department?.id, itemId: tx.item?.id };
    setEditingId(tx.id);
    retForm.setFieldsValue({
      divisionId: tx.division?.id, quantity: tx.quantity, uomId: tx.uom?.id,
      warehouseId: tx.warehouse?.id, reference: tx.referenceNumber || undefined,
      reason: tx.notes || undefined,
      returnDate: tx.transactionDate ? dayjs(tx.transactionDate) : undefined,
    });
    setRetModalOpen(true);
  };

  const onReceiveFinish = async (values: any) => {
    setRecvSubmitting(true);
    const payload = {
      itemId: values.itemId, quantity: Number(values.quantity), uomId: values.uomId,
      divisionId: values.divisionId, sectionId: values.sectionId, departmentId: values.departmentId,
      warehouseId: values.warehouseId,
      receiptDate: values.receiptDate ? values.receiptDate.format('YYYY-MM-DD') : undefined,
      reference: values.reference || undefined, notes: values.notes || undefined,
    };
    try {
      if (editingId) {
        const d = { ...payload, transactionDate: payload.receiptDate } as any; delete d.receiptDate;
        await apiService.patch<{ success: boolean }>(`/inventory/receipts/${editingId}`, d);
        message.success('Receiving transaction updated.');
      } else {
        await apiService.post<{ success: boolean }>('/inventory/receipts', payload);
        message.success(`Received ${Number(values.quantity)} into inventory. Stock increased.`);
      }
      clearRecvModal();
      setHistoryPage(1); void loadHistory(1, txTypeFilter || undefined);
    } catch (err: any) {
      const msg = err?.response?.data?.message;
      message.error(Array.isArray(msg) ? msg[0] : String(msg ?? 'Operation failed'));
    } finally { setRecvSubmitting(false); }
  };

  const onReturnFinish = async (values: any) => {
    setRetSubmitting(true);
    const payload = {
      itemId: values.itemId, quantity: Number(values.quantity), uomId: values.uomId,
      divisionId: values.divisionId, sectionId: values.sectionId, departmentId: values.departmentId,
      warehouseId: values.warehouseId,
      returnDate: values.returnDate ? values.returnDate.format('YYYY-MM-DD') : undefined,
      reference: values.reference || undefined, reason: values.reason || undefined,
    };
    try {
      if (editingId) {
        const d = { ...payload, transactionDate: payload.returnDate, notes: payload.reason } as any; delete d.returnDate; delete d.reason;
        await apiService.patch<{ success: boolean }>(`/inventory/receipts/${editingId}`, d);
        message.success('Return transaction updated.');
      } else {
        await apiService.post<{ success: boolean }>('/inventory/receipts/return', payload);
        message.success(`Returned ${Number(values.quantity)} from inventory. Stock decreased.`);
      }
      clearRetModal();
      setHistoryPage(1); void loadHistory(1, txTypeFilter || undefined);
    } catch (err: any) {
      const msg = err?.response?.data?.message;
      message.error(Array.isArray(msg) ? msg[0] : String(msg ?? 'Operation failed'));
    } finally { setRetSubmitting(false); }
  };

  const handleDelete = async (tx: LedgerEntry) => {
    try {
      await apiService.delete<{ success: boolean }>(`/inventory/receipts/${tx.id}`);
      message.success('Transaction deleted and inventory balance reversed.');
      setHistoryPage(1); void loadHistory(1, txTypeFilter || undefined);
    } catch (err: any) {
      const msg = err?.response?.data?.message;
      message.error(Array.isArray(msg) ? msg[0] : String(msg ?? 'Failed to delete transaction'));
    }
  };

  const handleTxTypeFilter = (val: string) => {
    setTxTypeFilter(val); setHistoryPage(1); void loadHistory(1, val || undefined);
  };

  const columns: ColumnsType<LedgerEntry> = [
    { title: 'Date', key: 'txDate', width: 120, render: (_, r) => (r.transactionDate ? new Date(r.transactionDate).toLocaleDateString() : '-') },
    { title: 'Division', key: 'division', width: 150, ellipsis: true, render: (_, r) => (r.division ? `${r.division.divisionCode} - ${r.division.name}` : '-') },
    { title: 'Section', key: 'section', width: 130, ellipsis: true, render: (_, r) => (r.section ? `${r.section.sectionCode} - ${r.section.name}` : '-') },
    { title: 'Department', key: 'department', width: 150, ellipsis: true, render: (_, r) => (r.department ? `${r.department.departmentCode} - ${r.department.name}` : '-') },
    { title: 'Raw Material / Item', key: 'item', width: 190, ellipsis: true, render: (_, r) => (r.item ? `${r.item.itemCode} - ${r.item.name}` : '-') },
    { title: 'Quantity', dataIndex: 'quantity', key: 'quantity', width: 100, align: 'right' as const, render: (v: unknown) => formatNumber(v, 4) },
    { title: 'UOM', key: 'uom', width: 70, render: (_, r) => r.uom?.code || '-' },
    { title: 'Warehouse', key: 'warehouse', width: 140, ellipsis: true, render: (_, r) => r.warehouse?.name || '-' },
    { title: 'Reference', dataIndex: 'referenceNumber', key: 'referenceNumber', width: 140, render: (v: string) => v || '-' },
    {
      title: 'Transaction Type', dataIndex: 'transactionType', key: 'transactionType', width: 140,
      render: (v: string) => <Tag color={TX_COLORS[v] || 'default'}>{v === 'RETURN_OUT' ? 'RAW MATERIAL RETURN' : v}</Tag>,
    },
    {
      title: 'Direction', dataIndex: 'direction', key: 'direction', width: 85,
      render: (v: string) => <span style={{ color: v === 'IN' ? 'var(--theme-success, #52c41a)' : 'var(--theme-danger, #ff4d4f)', fontWeight: 600 }}>{v}</span>,
    },
    { title: 'Created By', key: 'createdBy', width: 130, ellipsis: true, render: (_, r) => (r.createdBy ? String(r.createdBy).slice(0, 8) : '-') },
    {
      title: 'Actions', key: 'actions', width: 120, fixed: 'right',
      render: (_, r) => (
        <Space size={0}>
          <Tooltip title="View">
            <Button type="text" size="small" icon={<EyeOutlined />} onClick={() => { setViewTx(r); setViewTxOpen(true); }} style={{ color: 'var(--theme-primary)' }} />
          </Tooltip>
          <Tooltip title="Edit">
            <Button type="text" size="small" icon={<EditOutlined />} onClick={() => r.transactionType === 'RECEIPT' ? openEditRecv(r) : openEditRet(r)} />
          </Tooltip>
          <Popconfirm
            title="Delete this inventory transaction?"
            description="The inventory balance will be reversed. This action cannot be undone."
            onConfirm={() => handleDelete(r)}
            okText="Delete"
            okButtonProps={{ danger: true }}
            cancelText="Cancel"
          >
            <Tooltip title="Delete">
              <Button type="text" size="small" danger icon={<DeleteOutlined />} />
            </Tooltip>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const recvFormContent = (
    <Form form={recvForm} layout="vertical" onFinish={onReceiveFinish} initialValues={{ receiptDate: undefined }}>
      {orgFields(divisions, divisionsState, recvSections, recvSectionsState, recvDepts, recvDeptsState, watchRecvDiv, watchRecvSec, recvForm)}
      <div style={{ margin: '4px 0 12px', fontWeight: 600, color: 'var(--theme-primary, #1668dc)' }}>Material Details</div>
      <Row gutter={16}>
        <Col xs={24} md={12}>
          <Form.Item name="itemId" label={<span>Raw Material / Item <Text type="danger">*</Text></span>} rules={[{ required: true, message: 'Select the raw material item' }]}>
            <Select allowClear showSearch optionFilterProp="label"
              placeholder={watchRecvDep ? 'Select raw material' : 'Select Department first'}
              disabled={!watchRecvDep}
              loading={!!watchRecvDep && itemsState === 'loading'} status={itemsState === 'error' ? 'error' : undefined}
              notFoundContent={itemsState === 'error' ? 'Items could not be loaded' : itemsState === 'loading' ? <Space><LoadingOutlined /> Loading...</Space> : 'No RAW MATERIAL items for this organization'}
              options={items.map((i) => ({ value: i.id, label: i.itemCode ? `${i.itemCode} — ${i.name}` : (i.name || i.id) }))} />
          </Form.Item>
        </Col>
        <Col xs={24} md={6}>
          <Form.Item name="quantity" label={<span>Quantity <Text type="danger">*</Text></span>} rules={[{ required: true, message: 'Enter quantity' }]}>
            <InputNumber min={0.0001} precision={4} style={{ width: '100%' }} placeholder="e.g. 1000" />
          </Form.Item>
        </Col>
        <Col xs={24} md={6}>
          <Form.Item name="uomId" label={<span>UOM <Text type="danger">*</Text></span>} rules={[{ required: true, message: 'Select UOM' }]}>
            <Select allowClear showSearch optionFilterProp="label" placeholder="Select UOM"
              loading={uomsState === 'loading'} status={uomsState === 'error' ? 'error' : undefined}
              notFoundContent={uomsState === 'error' ? 'UOMs could not be loaded' : uomsState === 'loading' ? <Space><LoadingOutlined /> Loading...</Space> : 'No active UOMs'}
              options={uoms.map((u) => ({ value: u.id, label: u.code || u.symbol || u.name }))} />
          </Form.Item>
        </Col>
      </Row>
      <div style={{ margin: '4px 0 12px', fontWeight: 600, color: 'var(--theme-primary, #1668dc)' }}>Receiving Details</div>
      <Row gutter={16}>
        <Col xs={24} md={8}>
          <Form.Item name="warehouseId" label={<span>Receiving Warehouse <Text type="danger">*</Text></span>} rules={[{ required: true, message: 'Select warehouse' }]}>
            <Select allowClear showSearch optionFilterProp="label"
              placeholder={warehousesState === 'loading' ? 'Loading...' : warehousesState === 'error' ? 'Failed to load' : warehouses.length === 0 ? 'No warehouses' : 'Select warehouse'}
              loading={warehousesState === 'loading'} status={warehousesState === 'error' ? 'error' : undefined}
              notFoundContent={warehousesState === 'error' ? 'Warehouses could not be loaded' : 'No warehouses'}
              options={warehouses.map((w) => ({ value: w.id, label: w.warehouseCode ? `${w.warehouseCode} — ${w.name}` : (w.name || w.id) }))} />
          </Form.Item>
        </Col>
        <Col xs={24} md={8}>
          <Form.Item name="receiptDate" label="Receiving Date">
            <DatePicker style={{ width: '100%' }} placeholder="Defaults to today" />
          </Form.Item>
        </Col>
        <Col xs={24} md={8}>
          <Form.Item name="reference" label="Reference / Source">
            <Input placeholder="e.g. GRN-1001" maxLength={50} />
          </Form.Item>
        </Col>
      </Row>
      <Form.Item name="notes" label="Remarks">
        <Input.TextArea rows={2} maxLength={1000} placeholder="Optional note" />
      </Form.Item>
    </Form>
  );

  const retFormContent = (
    <Form form={retForm} layout="vertical" onFinish={onReturnFinish} initialValues={{ returnDate: undefined }}>
      {orgFields(divisions, divisionsState, retSections, retSectionsState, retDepts, retDeptsState, watchRetDiv, watchRetSec, retForm)}
      <div style={{ margin: '4px 0 12px', fontWeight: 600, color: 'var(--theme-primary, #1668dc)' }}>Return Details</div>
      <Row gutter={16}>
        <Col xs={24} md={12}>
          <Form.Item name="itemId" label={<span>Raw Material / Item <Text type="danger">*</Text></span>} rules={[{ required: true, message: 'Select the raw material item' }]}>
            <Select allowClear showSearch optionFilterProp="label"
              placeholder={watchRetDep ? 'Select raw material' : 'Select Department first'}
              disabled={!watchRetDep}
              loading={!!watchRetDep && itemsState === 'loading'} status={itemsState === 'error' ? 'error' : undefined}
              notFoundContent={itemsState === 'error' ? 'Items could not be loaded' : itemsState === 'loading' ? <Space><LoadingOutlined /> Loading...</Space> : 'No RAW MATERIAL items for this organization'}
              options={items.map((i) => ({ value: i.id, label: i.itemCode ? `${i.itemCode} — ${i.name}` : (i.name || i.id) }))} />
          </Form.Item>
        </Col>
        <Col xs={24} md={6}>
          <Form.Item name="quantity" label={<span>Return Quantity <Text type="danger">*</Text></span>} rules={[{ required: true, message: 'Enter quantity' }]}>
            <InputNumber min={0.0001} precision={4} style={{ width: '100%' }} placeholder="e.g. 100" />
          </Form.Item>
        </Col>
        <Col xs={24} md={6}>
          <Form.Item name="uomId" label={<span>UOM <Text type="danger">*</Text></span>} rules={[{ required: true, message: 'Select UOM' }]}>
            <Select allowClear showSearch optionFilterProp="label" placeholder="Select UOM"
              loading={uomsState === 'loading'} status={uomsState === 'error' ? 'error' : undefined}
              notFoundContent={uomsState === 'error' ? 'UOMs could not be loaded' : uomsState === 'loading' ? <Space><LoadingOutlined /> Loading...</Space> : 'No active UOMs'}
              options={uoms.map((u) => ({ value: u.id, label: u.code || u.symbol || u.name }))} />
          </Form.Item>
        </Col>
      </Row>
      <Row gutter={16}>
        <Col xs={24} md={8}>
          <Form.Item name="warehouseId" label={<span>Return From Warehouse <Text type="danger">*</Text></span>} rules={[{ required: true, message: 'Select warehouse' }]}>
            <Select allowClear showSearch optionFilterProp="label"
              placeholder={warehousesState === 'loading' ? 'Loading...' : warehousesState === 'error' ? 'Failed to load' : warehouses.length === 0 ? 'No warehouses' : 'Select warehouse'}
              loading={warehousesState === 'loading'} status={warehousesState === 'error' ? 'error' : undefined}
              notFoundContent={warehousesState === 'error' ? 'Warehouses could not be loaded' : 'No warehouses'}
              options={warehouses.map((w) => ({ value: w.id, label: w.warehouseCode ? `${w.warehouseCode} — ${w.name}` : (w.name || w.id) }))} />
          </Form.Item>
        </Col>
        <Col xs={24} md={8}>
          <Form.Item name="returnDate" label="Return Date">
            <DatePicker style={{ width: '100%' }} placeholder="Defaults to today" />
          </Form.Item>
        </Col>
        <Col xs={24} md={8}>
          <Form.Item name="reference" label="Reference">
            <Input placeholder="e.g. RET-001" maxLength={50} />
          </Form.Item>
        </Col>
      </Row>
      <Form.Item name="reason" label={<span>Reason / Remarks <Text type="danger">*</Text></span>} rules={[{ required: true, message: 'Enter reason for return' }]}>
        <Input.TextArea rows={2} maxLength={1000} placeholder="Reason for returning this raw material" />
      </Form.Item>
    </Form>
  );

  return (
    <div className="erp-dashboard">
      <Card className="erp-section-card" style={{ marginBottom: 16 }}>
        <Row justify="space-between" align="middle">
          <Col><Title level={4} style={{ margin: 0 }}><InboxOutlined /> Raw Material Receiving</Title></Col>
          <Col>
            <Space>
              <Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditingId(null); prefillRecvRef.current = null; recvForm.resetFields(); setRecvModalOpen(true); }}>Receive Raw Material</Button>
              <Button icon={<RollbackOutlined />} onClick={() => { setEditingId(null); prefillRetRef.current = null; retForm.resetFields(); setRetModalOpen(true); }}>Raw Material Return</Button>
            </Space>
          </Col>
        </Row>
      </Card>

      <Modal
        title={<Space><InboxOutlined /> {editingId ? 'Edit Receive Raw Material' : 'Receive Raw Material'}</Space>}
        open={recvModalOpen} onCancel={clearRecvModal}
        footer={null} width={800} destroyOnClose maskClosable={!recvSubmitting}
      >
        {recvFormContent}
        <Space style={{ marginTop: 12 }}>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => recvForm.submit()} loading={recvSubmitting}>{editingId ? 'Save Changes' : 'Receive Raw Material'}</Button>
          <Button onClick={clearRecvModal} disabled={recvSubmitting}>Cancel</Button>
        </Space>
      </Modal>

      <Modal
        title={<Space><SwapOutlined /> {editingId ? 'Edit Return' : 'Raw Material Return'}</Space>}
        open={retModalOpen} onCancel={clearRetModal}
        footer={null} width={800} destroyOnClose maskClosable={!retSubmitting}
      >
        {retFormContent}
        <Space style={{ marginTop: 12 }}>
          <Button type="primary" danger icon={<RollbackOutlined />} onClick={() => retForm.submit()} loading={retSubmitting}>{editingId ? 'Save Changes' : 'Submit Return'}</Button>
          <Button onClick={clearRetModal} disabled={retSubmitting}>Cancel</Button>
        </Space>
      </Modal>

      <Modal
        title={<Space><EyeOutlined /> Transaction Details</Space>}
        open={viewTxOpen} onCancel={() => setViewTxOpen(false)}
        footer={null} width={640} destroyOnClose
      >
        {viewTx && (
          <Descriptions column={1} bordered size="small" labelStyle={{ width: 160 }}>
            <Descriptions.Item label="Date">{viewTx.transactionDate ? new Date(viewTx.transactionDate).toLocaleDateString() : '-'}</Descriptions.Item>
            <Descriptions.Item label="Transaction Type"><Tag color={TX_COLORS[viewTx.transactionType] || 'default'}>{viewTx.transactionType === 'RETURN_OUT' ? 'RAW MATERIAL RETURN' : viewTx.transactionType}</Tag></Descriptions.Item>
            <Descriptions.Item label="Direction"><span style={{ color: viewTx.direction === 'IN' ? 'var(--theme-success, #52c41a)' : 'var(--theme-danger, #ff4d4f)', fontWeight: 600 }}>{viewTx.direction}</span></Descriptions.Item>
            <Descriptions.Item label="Division">{viewTx.division ? `${viewTx.division.divisionCode} - ${viewTx.division.name}` : '-'}</Descriptions.Item>
            <Descriptions.Item label="Section">{viewTx.section ? `${viewTx.section.sectionCode} - ${viewTx.section.name}` : '-'}</Descriptions.Item>
            <Descriptions.Item label="Department">{viewTx.department ? `${viewTx.department.departmentCode} - ${viewTx.department.name}` : '-'}</Descriptions.Item>
            <Descriptions.Item label="Raw Material / Item">{viewTx.item ? `${viewTx.item.itemCode} - ${viewTx.item.name}` : '-'}</Descriptions.Item>
            <Descriptions.Item label="Quantity">{formatNumber(viewTx.quantity, 4)}</Descriptions.Item>
            <Descriptions.Item label="UOM">{viewTx.uom?.code || '-'}</Descriptions.Item>
            <Descriptions.Item label="Warehouse">{viewTx.warehouse?.name || '-'}</Descriptions.Item>
            <Descriptions.Item label="Reference">{viewTx.referenceNumber || '-'}</Descriptions.Item>
            <Descriptions.Item label="Remarks / Reason">{viewTx.notes || '-'}</Descriptions.Item>
            <Descriptions.Item label="Created By">{viewTx.createdBy ? String(viewTx.createdBy).slice(0, 8) : '-'}</Descriptions.Item>
          </Descriptions>
        )}
      </Modal>

      <Card className="erp-section-card" title={<Space><InboxOutlined /> Receiving / Return History <Button size="small" icon={<ReloadOutlined />} onClick={() => loadHistory(historyPage, txTypeFilter || undefined)}>Refresh</Button></Space>}>
        <Space style={{ marginBottom: 12 }}>
          <Select placeholder="Filter by type" value={txTypeFilter} onChange={handleTxTypeFilter} style={{ width: 200 }} allowClear options={TX_TYPE_OPTIONS} />
        </Space>
        {historyState === 'error' ? (
          <Alert type="error" showIcon message="History could not be loaded. Refresh or contact an administrator." />
        ) : (
          <Table columns={columns} dataSource={history} rowKey="id" loading={historyLoading} scroll={{ x: 1650 }}
            locale={{ emptyText: historyLoading ? 'Loading history...' : 'No records found.' }}
            pagination={{ current: historyPage, total: historyTotal, pageSize: 20, onChange: (p) => { setHistoryPage(p); void loadHistory(p, txTypeFilter || undefined); }, showSizeChanger: false }} />
        )}
      </Card>
    </div>
  );
};

export default InventoryReceiving;