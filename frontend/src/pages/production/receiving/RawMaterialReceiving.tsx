import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert, Button, Card, Col, DatePicker, Descriptions, Divider, Drawer, Form, Input, InputNumber,
  Popconfirm, Row, Select, Space, Table, Tag, Tooltip, Typography, App as AntApp,
} from 'antd';
import {
  CloseOutlined, DeleteOutlined, EditOutlined, EyeOutlined, InboxOutlined,
  PlusOutlined, ReloadOutlined, SaveOutlined, WarningOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import apiService from '../../../services/api';
import { formatNumber } from '../../../utils/numberFormat';
import { formatApiError } from '../../../utils/apiError';
import { DraggableResizableModal, SaveResultDialog } from '../../../components/shared';
import type { SaveResultData, SaveResultPhase } from '../../../components/shared/SaveResultDialog';
import './rawMaterialForms.css';

const { Text, Title } = Typography;

interface OrgOption { id: string; name: string; divisionCode?: string; sectionCode?: string; departmentCode?: string; }
interface WarehouseOption { id: string; name: string; warehouseCode?: string; status: string; warehouseType?: string; }
interface ItemOption {
  id: string;
  name: string;
  itemCode?: string;
  baseUomId?: string;
  divisionId?: string | null;
  sectionId?: string | null;
  departmentId?: string | null;
  itemType?: string;
}
interface UomOption { id: string; code?: string; name?: string; symbol?: string; status: string; }
interface ProductionOrderOption { id: string; order_number: string; status?: string; }

interface FormRefData {
  warehouses: WarehouseOption[];
  items: ItemOption[];
  uoms: UomOption[];
  divisions: OrgOption[];
  productionOrders: ProductionOrderOption[];
}

interface ReceiptLine {
  id?: string;
  lineNumber: number;
  item?: { id: string; name: string; itemCode: string } | null;
  uom?: { id: string; code: string; name?: string; symbol?: string } | null;
  gatePassQuantity: number;
  receivedQuantity: number;
  difference: number;
  remarks?: string | null;
}

interface ReceiptHeader {
  id: string;
  receiptCode: string;
  gatePassNo?: string | null;
  sourceNo?: string | null;
  receiptDate: string;
  status: string;
  reference?: string | null;
  remarks?: string | null;
  division?: OrgOption | null;
  section?: OrgOption | null;
  department?: OrgOption | null;
  warehouse?: WarehouseOption | null;
  productionOrderId?: string | null;
  lineCount?: number;
  gatePassTotal?: number;
  receivedTotal?: number;
  differenceTotal?: number;
  lines?: ReceiptLine[];
  ledgerEntries?: Array<{ id: string; transactionType: string; direction: string; quantity: number; transactionDate: string; referenceNumber?: string | null }>;
  createdAt?: string;
}

interface LineRow {
  key: string;
  itemId?: string;
  uomId?: string;
  gatePassQuantity?: number;
  receivedQuantity?: number;
}

const emptyLine = (): LineRow => ({
  key: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
  gatePassQuantity: undefined,
  receivedQuantity: undefined,
});

const RawMaterialReceiving: React.FC = () => {
  const { message } = AntApp.useApp();
  const [form] = Form.useForm();
  const [refData, setRefData] = useState<FormRefData | null>(null);
  const [refState, setRefState] = useState<'loading' | 'error' | 'ready'>('loading');
  const [sections, setSections] = useState<OrgOption[]>([]);
  const [departments, setDepartments] = useState<OrgOption[]>([]);
  const [departmentsState, setDepartmentsState] = useState<'loading' | 'error' | 'ready'>('ready');

  const [rows, setRows] = useState<LineRow[]>([emptyLine()]);

  const [list, setList] = useState<ReceiptHeader[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [listLoading, setListLoading] = useState(false);
  const [listState, setListState] = useState<'loading' | 'error' | 'ready'>('loading');

  const [filters, setFilters] = useState<{ status?: string; warehouseId?: string; gatePassNo?: string; dateFrom?: string; dateTo?: string }>({});

  const [modalOpen, setModalOpen] = useState(false);
  const [isModalMinimized, setIsModalMinimized] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [detail, setDetail] = useState<ReceiptHeader | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);

  // SaveResultDialog states
  const [saveDialogVisible, setSaveDialogVisible] = useState(false);
  const [saveDialogPhase, setSaveDialogPhase] = useState<SaveResultPhase>('loading');
  const [saveDialogResult, setSaveDialogResult] = useState<SaveResultData | null>(null);
  const [saveDialogError, setSaveDialogError] = useState<string | undefined>(undefined);
  const [saveDialogSuccessTitle, setSaveDialogSuccessTitle] = useState<string>('Receipt Confirmed Successfully');
  const [saveDialogRetry, setSaveDialogRetry] = useState<(() => void) | undefined>(undefined);

  // Form watchers for real-time live verification preview
  const watchDivision = Form.useWatch('divisionId', form);
  const watchSection = Form.useWatch('sectionId', form);
  const watchDepartment = Form.useWatch('departmentId', form);
  const watchWarehouse = Form.useWatch('warehouseId', form);
  const watchReceiptDate = Form.useWatch('receiptDate', form);
  const watchGatePassNo = Form.useWatch('gatePassNo', form);
  const watchSourceNo = Form.useWatch('sourceNo', form);

  // Filter raw materials strictly by selected Division (plus shared items without division)
  const filteredItems = useMemo(() => {
    if (!refData?.items) return [];
    const rawMaterials = refData.items.filter((i) => !i.itemType || i.itemType === 'RAW_MATERIAL');
    if (!watchDivision) return rawMaterials;
    return rawMaterials.filter((i) => !i.divisionId || i.divisionId === watchDivision);
  }, [refData?.items, watchDivision]);

  const loadRef = useCallback(async () => {
    setRefState('loading');
    try {
      const res = await apiService.get<{ data: FormRefData }>('/inventory/receipts/gate-pass/form-data');
      setRefData(res.data);
      setRefState('ready');
    } catch {
      setRefState('error');
    }
  }, []);

  const loadSections = useCallback(async (divisionId: string) => {
    try {
      const res = await apiService.get<{ data: OrgOption[] }>('/inventory/receipts/organization/sections', { divisionId });
      setSections(res.data || []);
    } catch {
      setSections([]);
    }
  }, []);

  const loadDepartments = useCallback(async (divisionId: string, sectionId: string) => {
    setDepartmentsState('loading');
    try {
      const res = await apiService.get<{ data: OrgOption[] }>('/inventory/receipts/organization/departments', { divisionId, sectionId });
      setDepartments(res.data || []);
      setDepartmentsState('ready');
    } catch {
      setDepartments([]);
      setDepartmentsState('error');
    }
  }, []);

  const loadList = useCallback(async (p: number = page, f: typeof filters = filters) => {
    setListLoading(true);
    try {
      const res = await apiService.get<{ data: ReceiptHeader[]; total: number }>('/inventory/receipts/gate-pass', { page: p, limit: pageSize, ...f });
      setList(res.data || []);
      setTotal(res.total || 0);
      setListState('ready');
    } catch {
      setList([]);
      setTotal(0);
      setListState('error');
    } finally {
      setListLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pageSize, filters]);

  useEffect(() => { void loadRef(); }, [loadRef]);
  useEffect(() => { void loadList(1); }, [loadList]);

  useEffect(() => {
    form.setFieldValue('sectionId', undefined);
    form.setFieldValue('departmentId', undefined);
    setSections([]);
    setDepartments([]);
    if (watchDivision) void loadSections(watchDivision);
  }, [watchDivision, form, loadSections]);

  useEffect(() => {
    form.setFieldValue('departmentId', undefined);
    setDepartments([]);
    if (watchDivision && watchSection) void loadDepartments(watchDivision, watchSection);
  }, [watchDivision, watchSection, form, loadDepartments]);

  // When division changes, auto-clear rows with items that do not belong to the selected division
  useEffect(() => {
    if (watchDivision && refData?.items) {
      setRows((prev) =>
        prev.map((r) => {
          if (!r.itemId) return r;
          const item = refData.items.find((i) => i.id === r.itemId);
          if (item?.divisionId && item.divisionId !== watchDivision) {
            return { ...r, itemId: undefined, uomId: undefined };
          }
          return r;
        })
      );
    }
  }, [watchDivision, refData?.items]);

  const totals = useMemo(() => {
    let gatePassTotal = 0; let receivedTotal = 0;
    for (const r of rows) {
      gatePassTotal += Number(r.gatePassQuantity || 0);
      receivedTotal += Number(r.receivedQuantity || 0);
    }
    return { gatePassTotal, receivedTotal, differenceTotal: gatePassTotal - receivedTotal };
  }, [rows]);

  const openCreate = () => {
    setEditingId(null);
    form.resetFields();
    form.setFieldValue('receiptDate', dayjs());
    setRows([emptyLine()]);
    setIsModalMinimized(false);
    setModalOpen(true);
  };

  const openEdit = async (rec: ReceiptHeader) => {
    setEditingId(rec.id);
    try {
      const res = await apiService.get<{ data: ReceiptHeader }>(`/inventory/receipts/gate-pass/${rec.id}`);
      const d = res.data;
      form.setFieldsValue({
        divisionId: d.division?.id,
        sectionId: d.section?.id,
        departmentId: d.department?.id,
        warehouseId: d.warehouse?.id,
        receiptDate: d.receiptDate ? dayjs(d.receiptDate) : dayjs(),
        gatePassNo: d.gatePassNo || undefined,
        sourceNo: d.sourceNo || undefined,
        productionOrderId: d.productionOrderId || undefined,
        reference: d.reference || undefined,
        remarks: d.remarks || undefined,
      });
      if (d.division?.id) void loadSections(d.division.id);
      if (d.division?.id && d.section?.id) void loadDepartments(d.division.id, d.section.id);
      setRows((d.lines || []).map((l) => ({
        key: l.id || `${Date.now()}-${l.lineNumber}`,
        itemId: l.item?.id,
        uomId: l.uom?.id,
        gatePassQuantity: l.gatePassQuantity !== undefined && l.gatePassQuantity !== null ? Number(l.gatePassQuantity) : undefined,
        receivedQuantity: l.receivedQuantity !== undefined && l.receivedQuantity !== null ? Number(l.receivedQuantity) : undefined,
      })));
      setIsModalMinimized(false);
      setModalOpen(true);
    } catch (err: any) {
      message.error(formatApiError(err, 'Failed to load the receipt for editing.'));
    }
  };

  const onItemSelect = (rowKey: string, itemId: string | undefined) => {
    setRows((prev) => prev.map((r) => {
      if (r.key !== rowKey) return r;
      const item = refData?.items.find((i) => i.id === itemId);
      return { ...r, itemId, uomId: item?.baseUomId || r.uomId };
    }));
  };

  const setRow = (rowKey: string, patch: Partial<LineRow>) => {
    setRows((prev) => prev.map((r) => (r.key === rowKey ? { ...r, ...patch } : r)));
  };

  const onFinish = async (values: any) => {
    if (!rows.length) { message.error('Add at least one raw material line.'); return; }
    const invalid = rows.find((r) => !r.itemId || !r.uomId);
    if (invalid) { message.error('Every line needs an item and a UOM.'); return; }
    const hasReceived = rows.some((r) => Number(r.receivedQuantity || 0) > 0);
    if (!hasReceived) { message.error('At least one line must have a received quantity greater than zero.'); return; }
    const duplicates = rows.filter((r) => rows.filter((o) => o.itemId === r.itemId && o.itemId).length > 1);
    if (duplicates.length) { message.error('An item can only appear once per receipt.'); return; }

    setSubmitting(true);
    setSaveDialogVisible(true);
    setSaveDialogPhase('loading');
    setSaveDialogSuccessTitle(editingId ? 'Receipt Updated Successfully' : 'Receipt Confirmed Successfully');
    setSaveDialogError(undefined);

    const payload = {
      divisionId: values.divisionId,
      sectionId: values.sectionId,
      departmentId: values.departmentId,
      warehouseId: values.warehouseId,
      receiptDate: values.receiptDate ? values.receiptDate.format('YYYY-MM-DD') : undefined,
      gatePassNo: values.gatePassNo || undefined,
      sourceNo: values.sourceNo || undefined,
      productionOrderId: values.productionOrderId || undefined,
      reference: values.reference || undefined,
      remarks: values.remarks || undefined,
      items: rows.map((r) => ({
        itemId: r.itemId,
        uomId: r.uomId,
        gatePassQuantity: Number(r.gatePassQuantity || 0),
        receivedQuantity: Number(r.receivedQuantity || 0),
      })),
    };

    try {
      let resultReceiptCode = editingId ? (list.find((x) => x.id === editingId)?.receiptCode || editingId) : '';
      if (editingId) {
        await apiService.patch<{ success: boolean }>(`/inventory/receipts/gate-pass/${editingId}`, payload);
      } else {
        const res = await apiService.post<{ success: boolean; data?: any }>('/inventory/receipts/gate-pass', payload);
        resultReceiptCode = res.data?.receiptCode || 'Confirmed';
      }

      setSaveDialogResult({
        title: editingId ? 'Receipt Updated' : 'Receipt Confirmed',
        recordType: 'Receipt Code',
        recordCode: resultReceiptCode,
        recordName: values.gatePassNo ? `Gate Pass #${values.gatePassNo}` : undefined,
        message: `${rows.filter((r) => r.itemId).length} raw material line(s) processed. Received Qty: ${formatNumber(totals.receivedTotal, 2)}`,
      });
      setSaveDialogPhase('success');

      setModalOpen(false);
      setIsModalMinimized(false);
      form.resetFields();
      setRows([emptyLine()]);
      setEditingId(null);
      setPage(1);
      void loadList(1);
    } catch (err: any) {
      const errMsg = formatApiError(err, 'Failed to save the receipt.');
      setSaveDialogError(errMsg);
      setSaveDialogRetry(() => () => onFinish(values));
      setSaveDialogPhase('error');
    } finally {
      setSubmitting(false);
    }
  };

  const openDetail = async (rec: ReceiptHeader) => {
    setDetailOpen(true);
    setDetailLoading(true);
    try {
      const res = await apiService.get<{ data: ReceiptHeader }>(`/inventory/receipts/gate-pass/${rec.id}`);
      setDetail(res.data);
    } catch (err: any) {
      message.error(formatApiError(err, 'Failed to load the receipt detail.'));
    } finally {
      setDetailLoading(false);
    }
  };

  const handleDelete = async (rec: ReceiptHeader) => {
    try {
      await apiService.delete<{ success: boolean }>(`/inventory/receipts/gate-pass/${rec.id}`);
      message.success('Receipt deleted and inventory balance reversed.');
      void loadList(page);
    } catch (err: any) {
      message.error(formatApiError(err, 'Failed to delete the receipt.'));
    }
  };

  const applyFilter = (patch: typeof filters) => {
    const next = { ...filters, ...patch };
    setFilters(next);
    setPage(1);
    void loadList(1, next);
  };

  const columns: ColumnsType<ReceiptHeader> = [
    { title: 'Receipt Code', dataIndex: 'receiptCode', key: 'receiptCode', width: 130, render: (v: string) => <Text strong>{v}</Text> },
    { title: 'Date', dataIndex: 'receiptDate', key: 'receiptDate', width: 110, render: (v: string) => (v ? dayjs(v).format('DD-MMM-YYYY') : '-') },
    { title: 'Gate Pass No', dataIndex: 'gatePassNo', key: 'gatePassNo', width: 130, render: (v?: string) => v || '-' },
    { title: 'Division', key: 'division', width: 160, ellipsis: true, render: (_, r) => (r.division ? `${r.division.divisionCode ?? ''} ${r.division.name}`.trim() : '-') },
    { title: 'Section', key: 'section', width: 140, ellipsis: true, render: (_, r) => (r.section?.name || '-') },
    { title: 'Department', key: 'department', width: 160, ellipsis: true, render: (_, r) => (r.department?.name || '-') },
    { title: 'Warehouse', key: 'warehouse', width: 160, ellipsis: true, render: (_, r) => (r.warehouse?.name || '-') },
    { title: 'Lines', dataIndex: 'lineCount', key: 'lineCount', width: 60, align: 'center' as const, render: (v?: number) => v ?? 0 },
    { title: 'Gate Pass Qty', dataIndex: 'gatePassTotal', key: 'gatePassTotal', width: 110, align: 'right' as const, render: (v?: number) => formatNumber(v, 2) },
    { title: 'Received Qty', dataIndex: 'receivedTotal', key: 'receivedTotal', width: 110, align: 'right' as const, render: (v?: number) => formatNumber(v, 2) },
    {
      title: 'Difference', dataIndex: 'differenceTotal', key: 'differenceTotal', width: 110, align: 'right' as const,
      render: (v?: number) => (
        <span style={{ color: Number(v || 0) === 0 ? undefined : 'var(--theme-warning, #d48806)' }}>
          {formatNumber(v, 2)}
        </span>
      ),
    },
    { title: 'Status', dataIndex: 'status', key: 'status', width: 105, render: (v: string) => <Tag color={v === 'CONFIRMED' ? 'green' : v === 'DRAFT' ? 'gold' : 'red'}>{v}</Tag> },
    {
      title: 'Actions', key: 'actions', width: 150, fixed: 'right' as const,
      render: (_, r) => (
        <Space size={0}>
          <Tooltip title="View">
            <Button type="text" size="small" icon={<EyeOutlined />} onClick={() => openDetail(r)} style={{ color: 'var(--theme-primary)' }} />
          </Tooltip>
          <Tooltip title="Edit">
            <Button type="text" size="small" icon={<EditOutlined />} onClick={() => openEdit(r)} style={{ color: 'var(--theme-warning, #d48806)' }} />
          </Tooltip>
          <Popconfirm
            title="Delete this receipt?"
            description="Posted stock for this receipt will be reversed. This cannot be undone."
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

  const lineColumns: ColumnsType<LineRow> = [
    {
      title: 'Raw Material', key: 'itemId', width: 280,
      render: (_, r) => (
        <Select showSearch optionFilterProp="label" placeholder="Select raw material" value={r.itemId}
          onChange={(v) => onItemSelect(r.key, v)} style={{ width: '100%' }}
          options={filteredItems.map((i) => ({ value: i.id, label: i.itemCode ? `${i.itemCode} — ${i.name}` : i.name }))}
          disabled={refState === 'error'} />
      ),
    },
    {
      title: 'UOM', key: 'uomId', width: 100,
      render: (_, r) => (
        <Select showSearch optionFilterProp="label" placeholder="UOM" value={r.uomId} onChange={(v) => setRow(r.key, { uomId: v })} style={{ width: '100%' }}
          options={(refData?.uoms || []).map((u) => ({ value: u.id, label: u.code || u.symbol || u.name || u.id }))} />
      ),
    },
    {
      title: <span>Gate Pass Qty</span>, key: 'gatePassQuantity', width: 140,
      render: (_, r) => (
        <InputNumber
          min={0}
          precision={2}
          value={r.gatePassQuantity}
          onChange={(v) => setRow(r.key, { gatePassQuantity: v !== null && v !== undefined ? Number(v) : undefined })}
          style={{ width: '100%' }}
          placeholder="0.00"
        />
      ),
    },
    {
      title: <span>Received Qty <Text type="danger">*</Text></span>, key: 'receivedQuantity', width: 140,
      render: (_, r) => (
        <InputNumber
          min={0}
          precision={2}
          value={r.receivedQuantity}
          onChange={(v) => setRow(r.key, { receivedQuantity: v !== null && v !== undefined ? Number(v) : undefined })}
          style={{ width: '100%' }}
          placeholder="0.00"
        />
      ),
    },
    {
      title: 'Difference', key: 'difference', width: 110, align: 'right' as const,
      render: (_, r) => {
        const diff = Number(r.gatePassQuantity || 0) - Number(r.receivedQuantity || 0);
        return (
          <span style={{ fontWeight: 600, color: diff === 0 ? undefined : 'var(--theme-warning, #d48806)' }}>
            {formatNumber(diff, 2)}
          </span>
        );
      },
    },
    {
      title: '', key: 'actions', width: 50,
      render: (_, r) => (
        <Tooltip title="Remove line">
          <Button type="text" size="small" icon={<DeleteOutlined />} disabled={rows.length === 1} onClick={() => setRows((prev) => prev.filter((o) => o.key !== r.key))} />
        </Tooltip>
      ),
    },
  ];

  return (
    <div className="erp-dashboard">
      <Card className="erp-section-card" style={{ marginBottom: 16 }}>
        <Row justify="space-between" align="middle">
          <Col>
            <Title level={4} style={{ margin: 0 }}><InboxOutlined style={{ color: 'var(--theme-success, #52c41a)' }} /> Raw Material Receiving</Title>
            <Text type="secondary">Multi-item Gate Pass receiving. Inventory increases by Received quantity only.</Text>
          </Col>
          <Col>
            <Space>
              <Button icon={<PlusOutlined />} type="primary" onClick={openCreate}>New Receipt (Gate Pass)</Button>
              <Button icon={<ReloadOutlined />} onClick={() => loadList(page)}>Refresh</Button>
            </Space>
          </Col>
        </Row>
      </Card>

      <Card className="erp-section-card" title={<Space><InboxOutlined /> Receiving History</Space>}>
        <Space wrap style={{ marginBottom: 12 }}>
          <Select placeholder="Status" allowClear style={{ width: 140 }} value={filters.status}
            onChange={(v) => applyFilter({ status: v })}
            options={[{ value: 'CONFIRMED', label: 'Confirmed' }, { value: 'DRAFT', label: 'Draft' }, { value: 'CANCELLED', label: 'Cancelled' }]} />
          <Select placeholder="Warehouse" allowClear showSearch optionFilterProp="label" style={{ width: 200 }} value={filters.warehouseId}
            onChange={(v) => applyFilter({ warehouseId: v })}
            options={(refData?.warehouses || []).map((w) => ({ value: w.id, label: w.warehouseCode ? `${w.warehouseCode} — ${w.name}` : w.name }))} />
          <Input placeholder="Gate Pass No" allowClear style={{ width: 160 }} value={filters.gatePassNo}
            onChange={(e) => applyFilter({ gatePassNo: e.target.value || undefined })} />
          <DatePicker.RangePicker
            value={filters.dateFrom && filters.dateTo ? [dayjs(filters.dateFrom), dayjs(filters.dateTo)] : undefined}
            onChange={(v) => applyFilter({ dateFrom: v?.[0] ? v[0].format('YYYY-MM-DD') : undefined, dateTo: v?.[1] ? v[1].format('YYYY-MM-DD') : undefined })}
          />
        </Space>
        {listState === 'error' ? (
          <Alert
            type="error"
            showIcon
            message="Receipts could not be loaded"
            description={
              <Space direction="vertical" size={8} style={{ marginTop: 4 }}>
                <span>Receipts could not be loaded. Please ensure your user has an assigned company and required manufacturing permissions, or try refreshing.</span>
                <Button size="small" type="primary" ghost icon={<ReloadOutlined />} onClick={() => loadList(page)}>
                  Retry Loading
                </Button>
              </Space>
            }
          />
        ) : (
          <Table columns={columns} dataSource={list} rowKey="id" loading={listLoading} scroll={{ x: 1500 }}
            locale={{ emptyText: listLoading ? 'Loading receipts...' : 'No receipts found.' }}
            pagination={{ current: page, total, pageSize, showSizeChanger: false, onChange: (p) => { setPage(p); void loadList(p); } }} />
        )}
      </Card>

      {/* Enterprise Draggable, Resizable Split-View Modal */}
      <DraggableResizableModal
        title={<Space><InboxOutlined /> {editingId ? 'Edit Receipt' : 'New Receipt (Gate Pass)'}</Space>}
        subtitle="Real-time multi-item Gate Pass entry with live calculation and division-matched inventory"
        open={modalOpen}
        onCancel={() => { if (!submitting) { setModalOpen(false); setEditingId(null); setIsModalMinimized(false); } }}
        onMinimize={() => {
          setModalOpen(false);
          setIsModalMinimized(true);
        }}
        width={1180}
        height={760}
        minWidth={920}
        minHeight={580}
        footer={null}
        destroyOnHidden
        maskClosable={!submitting}
      >
        <div className="raw-material-modal-split-container">
          {/* Left Column: Form Controls */}
          <div className="raw-material-modal-form-col">
            <Form form={form} layout="vertical" onFinish={onFinish}>
              <Card size="small" title="Organization & Warehouse" className="erp-section-card-inner" style={{ marginBottom: 12 }}>
                <Row gutter={12}>
                  <Col xs={24} md={8}>
                    <Form.Item name="divisionId" label={<span>Division <Text type="danger">*</Text></span>} rules={[{ required: true, message: 'Select Division' }]}>
                      <Select showSearch optionFilterProp="label" placeholder="Select Division"
                        loading={refState === 'loading'} status={refState === 'error' ? 'error' : undefined}
                        options={(refData?.divisions || []).map((d) => ({ value: d.id, label: d.divisionCode ? `${d.divisionCode} — ${d.name}` : d.name }))} />
                    </Form.Item>
                  </Col>
                  <Col xs={24} md={8}>
                    <Form.Item name="sectionId" label={<span>Section <Text type="danger">*</Text></span>} rules={[{ required: true, message: 'Select Section' }]}>
                      <Select showSearch optionFilterProp="label" placeholder={watchDivision ? 'Select Section' : 'Select Division first'} disabled={!watchDivision} options={sections.map((s) => ({ value: s.id, label: s.sectionCode ? `${s.sectionCode} — ${s.name}` : s.name }))} />
                    </Form.Item>
                  </Col>
                  <Col xs={24} md={8}>
                    <Form.Item name="departmentId" label={<span>Department <Text type="danger">*</Text></span>} rules={[{ required: true, message: 'Select Department' }]}>
                      <Select showSearch optionFilterProp="label" placeholder={watchSection ? 'Select Department' : 'Select Section first'} disabled={!watchSection}
                        loading={departmentsState === 'loading'} status={departmentsState === 'error' ? 'error' : undefined}
                        options={departments.map((d) => ({ value: d.id, label: d.departmentCode ? `${d.departmentCode} — ${d.name}` : d.name }))} />
                    </Form.Item>
                  </Col>
                  <Col xs={24} md={8}>
                    <Form.Item name="warehouseId" label={<span>Receiving Warehouse <Text type="danger">*</Text></span>} rules={[{ required: true, message: 'Select warehouse' }]}>
                      <Select showSearch optionFilterProp="label" placeholder="Select warehouse"
                        status={refState === 'error' ? 'error' : undefined}
                        options={(refData?.warehouses || []).map((w) => ({ value: w.id, label: w.warehouseCode ? `${w.warehouseCode} — ${w.name}` : w.name }))} />
                    </Form.Item>
                  </Col>
                  <Col xs={24} md={8}>
                    <Form.Item name="receiptDate" label="Receipt Date">
                      <DatePicker style={{ width: '100%' }} placeholder="Defaults to today" />
                    </Form.Item>
                  </Col>
                  <Col xs={24} md={8}>
                    <Form.Item name="gatePassNo" label="Gate Pass No">
                      <Input placeholder="e.g. GP-10250" maxLength={50} />
                    </Form.Item>
                  </Col>
                  <Col xs={24} md={8}>
                    <Form.Item name="sourceNo" label="Source / DC No">
                      <Input placeholder="Optional" maxLength={50} />
                    </Form.Item>
                  </Col>
                  <Col xs={24} md={8}>
                    <Form.Item name="productionOrderId" label="Production Order">
                      <Select allowClear showSearch optionFilterProp="label" placeholder="Optional"
                        options={(refData?.productionOrders || []).map((o) => ({ value: o.id, label: o.order_number }))} />
                    </Form.Item>
                  </Col>
                </Row>
              </Card>

              <Card
                size="small" title="Gate Pass Items"
                className="erp-section-card-inner"
                style={{ marginBottom: 12 }}
                extra={<Button size="small" type="dashed" icon={<PlusOutlined />} onClick={() => setRows((prev) => [...prev, emptyLine()])}>Add Item</Button>}
              >
                {refState === 'error' ? (
                  <Alert type="error" showIcon message="Reference data could not be loaded. Please refresh the page." />
                ) : (
                  <Table columns={lineColumns} dataSource={rows} rowKey="key" pagination={false} size="small" scroll={{ x: 800 }}
                    locale={{ emptyText: 'No lines added yet.' }} />
                )}
                <Row gutter={12} style={{ marginTop: 12 }}>
                  <Col span={8} style={{ textAlign: 'right' }}>
                    <Text strong>Gate Pass Total:</Text> <Text>{formatNumber(totals.gatePassTotal, 2)}</Text>
                  </Col>
                  <Col span={8} style={{ textAlign: 'right' }}>
                    <Text strong>Received Total:</Text> <Text style={{ color: 'var(--theme-success, #52c41a)' }}>{formatNumber(totals.receivedTotal, 2)}</Text>
                  </Col>
                  <Col span={8} style={{ textAlign: 'right' }}>
                    <Text strong>Difference:</Text> <Text style={{ color: totals.differenceTotal !== 0 ? 'var(--theme-warning, #d48806)' : undefined }}>{formatNumber(totals.differenceTotal, 2)}</Text>
                  </Col>
                </Row>
              </Card>

              <Form.Item name="remarks" label="Remarks">
                <Input.TextArea rows={2} maxLength={1000} placeholder="Optional note for this receipt" />
              </Form.Item>

              <Space style={{ marginTop: 8 }}>
                <Button type="primary" icon={<SaveOutlined />} htmlType="submit" loading={submitting}>{editingId ? 'Save Changes' : 'Confirm Receipt'}</Button>
                <Button onClick={() => setModalOpen(false)} disabled={submitting}>Cancel</Button>
              </Space>
            </Form>
          </div>

          {/* Right Column: Live Verification Card */}
          <div className="raw-material-modal-preview-col">
            <div className="raw-material-live-preview-card">
              <div className="rm-preview-header-badge">
                <span className="rm-minimized-window-pulse" style={{ width: 6, height: 6 }} />
                LIVE VERIFICATION (2027)
              </div>
              <div className="rm-preview-doc-title">
                {editingId ? 'Updating Receipt' : 'New Raw Material Receipt'}
              </div>
              <div className="rm-preview-doc-subtitle">
                Receipt Code: <Text strong style={{ color: 'var(--theme-primary, #4f46e5)' }}>{editingId ? (list.find((x) => x.id === editingId)?.receiptCode || 'Editing') : 'Auto-Assigned on Confirm'}</Text>
              </div>

              <div className="rm-preview-meta-grid">
                <div className="rm-preview-meta-row">
                  <span className="rm-preview-meta-label">Division</span>
                  <span className="rm-preview-meta-value" title={refData?.divisions.find((d) => d.id === watchDivision)?.name}>
                    {refData?.divisions.find((d) => d.id === watchDivision)?.name || <Text type="secondary">Not Selected</Text>}
                  </span>
                </div>
                <div className="rm-preview-meta-row">
                  <span className="rm-preview-meta-label">Section</span>
                  <span className="rm-preview-meta-value" title={sections.find((s) => s.id === watchSection)?.name}>
                    {sections.find((s) => s.id === watchSection)?.name || <Text type="secondary">Not Selected</Text>}
                  </span>
                </div>
                <div className="rm-preview-meta-row">
                  <span className="rm-preview-meta-label">Department</span>
                  <span className="rm-preview-meta-value" title={departments.find((dp) => dp.id === watchDepartment)?.name}>
                    {departments.find((dp) => dp.id === watchDepartment)?.name || <Text type="secondary">Not Selected</Text>}
                  </span>
                </div>
                <div className="rm-preview-meta-row">
                  <span className="rm-preview-meta-label">Warehouse</span>
                  <span className="rm-preview-meta-value" title={refData?.warehouses.find((w) => w.id === watchWarehouse)?.name}>
                    {refData?.warehouses.find((w) => w.id === watchWarehouse)?.name || <Text type="secondary">Not Selected</Text>}
                  </span>
                </div>
                <div className="rm-preview-meta-row">
                  <span className="rm-preview-meta-label">Gate Pass No</span>
                  <span className="rm-preview-meta-value">{watchGatePassNo || <Text type="secondary">-</Text>}</span>
                </div>
                <div className="rm-preview-meta-row">
                  <span className="rm-preview-meta-label">Receipt Date</span>
                  <span className="rm-preview-meta-value">{watchReceiptDate ? watchReceiptDate.format('DD-MMM-YYYY') : dayjs().format('DD-MMM-YYYY')}</span>
                </div>
                {watchSourceNo && (
                  <div className="rm-preview-meta-row">
                    <span className="rm-preview-meta-label">Source / DC No</span>
                    <span className="rm-preview-meta-value">{watchSourceNo}</span>
                  </div>
                )}
              </div>

              <div className="rm-preview-kpi-grid">
                <div className="rm-preview-kpi-card">
                  <div className="rm-preview-kpi-num">{rows.filter((r) => r.itemId).length}</div>
                  <div className="rm-preview-kpi-label">Active Lines</div>
                </div>
                <div className="rm-preview-kpi-card">
                  <div className="rm-preview-kpi-num" style={{ color: '#0284c7' }}>{formatNumber(totals.gatePassTotal, 2)}</div>
                  <div className="rm-preview-kpi-label">Gate Pass Total</div>
                </div>
                <div className="rm-preview-kpi-card" style={{ borderColor: 'rgba(34, 197, 94, 0.4)' }}>
                  <div className="rm-preview-kpi-num" style={{ color: '#16a34a' }}>{formatNumber(totals.receivedTotal, 2)}</div>
                  <div className="rm-preview-kpi-label">Received Total</div>
                </div>
                <div className="rm-preview-kpi-card" style={{ borderColor: totals.differenceTotal !== 0 ? 'rgba(234, 88, 12, 0.4)' : undefined }}>
                  <div className="rm-preview-kpi-num" style={{ color: totals.differenceTotal !== 0 ? '#ea580c' : '#64748b' }}>
                    {formatNumber(totals.differenceTotal, 2)}
                  </div>
                  <div className="rm-preview-kpi-label">
                    Net Diff {totals.differenceTotal === 0 ? (
                      <Tag color="success" style={{ margin: 0, fontSize: 10, lineHeight: '14px', padding: '0 4px' }}>MATCH</Tag>
                    ) : totals.differenceTotal > 0 ? (
                      <Tag color="warning" style={{ margin: 0, fontSize: 10, lineHeight: '14px', padding: '0 4px' }}>SHORT</Tag>
                    ) : (
                      <Tag color="error" style={{ margin: 0, fontSize: 10, lineHeight: '14px', padding: '0 4px' }}>SURPLUS</Tag>
                    )}
                  </div>
                </div>
              </div>

              <div style={{ fontWeight: 600, fontSize: 12, color: '#475569', marginBottom: 6, display: 'flex', justifyContent: 'space-between' }}>
                <span>Material Lines Verification</span>
                <span style={{ fontSize: 11, color: '#64748b' }}>{filteredItems.length} items in division</span>
              </div>

              <div className="rm-preview-lines-container">
                {rows.filter((r) => r.itemId).length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '24px 0', color: '#94a3b8', fontSize: 12 }}>
                    Select raw materials on the left to verify lines in real-time.
                  </div>
                ) : (
                  rows.filter((r) => r.itemId).map((r, idx) => {
                    const item = refData?.items.find((i) => i.id === r.itemId);
                    const uom = refData?.uoms.find((u) => u.id === r.uomId);
                    const diff = Number(r.gatePassQuantity || 0) - Number(r.receivedQuantity || 0);
                    return (
                      <div key={r.key || idx} className="rm-preview-line-row">
                        <div className="rm-preview-line-header">
                          <span className="rm-preview-line-title">
                            #{idx + 1} {item?.itemCode || ''} — {item?.name || 'Unknown Item'}
                          </span>
                          <span className="rm-preview-line-badge">
                            {diff === 0 ? (
                              <Tag color="green" style={{ margin: 0, fontSize: 11 }}>Matched</Tag>
                            ) : diff > 0 ? (
                              <Tag color="orange" style={{ margin: 0, fontSize: 11 }}>Diff: {formatNumber(diff, 2)}</Tag>
                            ) : (
                              <Tag color="volcano" style={{ margin: 0, fontSize: 11 }}>Excess: {formatNumber(Math.abs(diff), 2)}</Tag>
                            )}
                          </span>
                        </div>
                        <div className="rm-preview-line-meta">
                          <span>GP: <strong style={{ color: '#0f172a' }}>{formatNumber(r.gatePassQuantity, 2)}</strong></span>
                          <span>Recv: <strong style={{ color: '#16a34a' }}>{formatNumber(r.receivedQuantity, 2)}</strong> {uom?.code || uom?.symbol || ''}</span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </div>
      </DraggableResizableModal>

      {/* Minimized Window Tab Dock */}
      {isModalMinimized && (
        <div className="rm-modal-minimized-dock">
          <div
            className="rm-minimized-window-tab"
            onClick={() => {
              setIsModalMinimized(false);
              setModalOpen(true);
            }}
            title="Click to restore Receipt Window"
          >
            <span className="rm-minimized-window-pulse" />
            <InboxOutlined style={{ color: '#0ea5e9' }} />
            <span>{editingId ? 'Edit Receipt' : 'New Receipt (Gate Pass)'} ({rows.filter((r) => r.itemId).length} lines)</span>
            <span
              className="rm-minimized-window-close"
              onClick={(e) => {
                e.stopPropagation();
                setIsModalMinimized(false);
              }}
              title="Close"
            >
              <CloseOutlined />
            </span>
          </div>
        </div>
      )}

      {/* Save / Feedback Dialog */}
      <SaveResultDialog
        open={saveDialogVisible}
        phase={saveDialogPhase}
        result={saveDialogResult}
        errorMessage={saveDialogError}
        successTitle={saveDialogSuccessTitle}
        loadingTitle="Posting Raw Material Receipt..."
        loadingHint="Validating division scopes and posting real-time inventory ledger movements..."
        onRetry={saveDialogRetry}
        onClose={() => setSaveDialogVisible(false)}
      />

      <Drawer
        title={<Space><EyeOutlined /> Receipt Detail</Space>}
        open={detailOpen} onClose={() => setDetailOpen(false)} width={780}
      >
        {detailLoading ? (
          <Alert type="info" showIcon message="Loading receipt detail..." />
        ) : detail ? (
          <>
            <Descriptions column={2} bordered size="small" labelStyle={{ width: 130 }}>
              <Descriptions.Item label="Receipt Code"><Text strong>{detail.receiptCode}</Text></Descriptions.Item>
              <Descriptions.Item label="Status"><Tag color="green">{detail.status}</Tag></Descriptions.Item>
              <Descriptions.Item label="Date">{detail.receiptDate || '-'}</Descriptions.Item>
              <Descriptions.Item label="Gate Pass No">{detail.gatePassNo || '-'}</Descriptions.Item>
              <Descriptions.Item label="Source / DC No">{detail.sourceNo || '-'}</Descriptions.Item>
              <Descriptions.Item label="Division">{detail.division?.name || '-'}</Descriptions.Item>
              <Descriptions.Item label="Section">{detail.section?.name || '-'}</Descriptions.Item>
              <Descriptions.Item label="Department">{detail.department?.name || '-'}</Descriptions.Item>
              <Descriptions.Item label="Warehouse">{detail.warehouse?.name || '-'}</Descriptions.Item>
              <Descriptions.Item label="Remarks">{detail.remarks || '-'}</Descriptions.Item>
            </Descriptions>

            <Divider orientation="left" plain>Items</Divider>
            <Table
              rowKey={(l) => l.id || `${l.lineNumber}-${l.item?.id}`}
              size="small" pagination={false} scroll={{ x: 640 }}
              dataSource={detail.lines || []}
              columns={[
                { title: '#', dataIndex: 'lineNumber', key: 'lineNumber', width: 40 },
                { title: 'Item', key: 'item', render: (_, l) => (l.item ? `${l.item.itemCode} — ${l.item.name}` : '-') },
                { title: 'UOM', key: 'uom', width: 70, render: (_, l) => l.uom?.code || '-' },
                { title: 'Gate Pass Qty', dataIndex: 'gatePassQuantity', key: 'g', align: 'right' as const, render: (v: unknown) => formatNumber(v, 2) },
                { title: 'Received Qty', dataIndex: 'receivedQuantity', key: 'r', align: 'right' as const, render: (v: unknown) => formatNumber(v, 2) },
                { title: 'Difference', dataIndex: 'difference', key: 'd', align: 'right' as const, render: (v: unknown) => (<span style={{ color: Number(v || 0) !== 0 ? 'var(--theme-warning, #d48806)' : undefined }}>{formatNumber(v, 2)}</span>) },
              ]}
            />
            <Row gutter={12} style={{ marginTop: 12 }}>
              <Col span={8} style={{ textAlign: 'right' }}><Text strong>Gate Pass:</Text> <Text>{formatNumber(detail.gatePassTotal, 2)}</Text></Col>
              <Col span={8} style={{ textAlign: 'right' }}><Text strong>Received:</Text> <Text style={{ color: 'var(--theme-success, #52c41a)' }}>{formatNumber(detail.receivedTotal, 2)}</Text></Col>
              <Col span={8} style={{ textAlign: 'right' }}><Text strong>Difference:</Text> <Text style={{ color: Number(detail.differenceTotal) !== 0 ? 'var(--theme-warning, #d48806)' : undefined }}>{formatNumber(detail.differenceTotal, 2)}</Text></Col>
            </Row>

            {(detail.ledgerEntries || []).length > 0 && (
              <>
                <Divider orientation="left" plain>Stock Ledger Postings</Divider>
                <Table
                  rowKey="id" size="small" pagination={false}
                  dataSource={detail.ledgerEntries || []}
                  columns={[
                    { title: 'Date', dataIndex: 'transactionDate', key: 'd', render: (v: string) => (v ? dayjs(v).format('DD-MMM-YYYY') : '-') },
                    { title: 'Type', dataIndex: 'transactionType', key: 't', render: (v: string) => <Tag color="blue">{v}</Tag> },
                    { title: 'Direction', dataIndex: 'direction', key: 'dir', render: (v: string) => <span style={{ color: v === 'IN' ? 'var(--theme-success, #52c41a)' : 'var(--theme-danger, #ff4d4f)', fontWeight: 600 }}>{v}</span> },
                    { title: 'Quantity', dataIndex: 'quantity', key: 'q', align: 'right' as const, render: (v: unknown) => formatNumber(v, 2) },
                  ]}
                />
              </>
            )}

            {detail.ledgerEntries && detail.ledgerEntries.length === 0 && (
              <div style={{ marginTop: 12 }}>
                <Alert type="warning" showIcon icon={<WarningOutlined />} message="No stock was posted — all lines have zero received quantity." />
              </div>
            )}
          </>
        ) : null}
      </Drawer>
    </div>
  );
};

export default RawMaterialReceiving;