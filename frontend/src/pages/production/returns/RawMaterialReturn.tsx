import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert, Button, Card, Col, DatePicker, Descriptions, Divider, Drawer, Form, Input, InputNumber,
  Popconfirm, Row, Select, Space, Table, Tag, Tooltip, Typography, App,
} from 'antd';
import {
  CloseOutlined, DeleteOutlined, EditOutlined, EyeOutlined, PlusOutlined,
  ReloadOutlined, RollbackOutlined, SaveOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import apiService from '../../../services/api';
import { formatNumber } from '../../../utils/numberFormat';
import { formatApiError } from '../../../utils/apiError';
import { DraggableResizableModal, SaveResultDialog } from '../../../components/shared';
import type { SaveResultData, SaveResultPhase } from '../../../components/shared/SaveResultDialog';
import '../receiving/rawMaterialForms.css';

const { Text, Title } = Typography;

interface OrgOption { id: string; name: string; divisionCode?: string; sectionCode?: string; departmentCode?: string; }
interface WarehouseOption { id: string; name: string; warehouseCode?: string; status: string; }
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

interface FormRefData {
  warehouses: WarehouseOption[];
  items: ItemOption[];
  uoms: UomOption[];
  divisions: OrgOption[];
}

interface ReceiptRefOption { id: string; receiptCode: string; }

interface ReturnLine {
  id?: string;
  lineNumber: number;
  item?: { id: string; name: string; itemCode: string } | null;
  uom?: { id: string; code: string; name?: string; symbol?: string } | null;
  quantity: number;
  remarks?: string | null;
}

interface ReturnHeader {
  id: string;
  returnCode: string;
  sourceNo?: string | null;
  returnDate: string;
  status: string;
  reason?: string | null;
  reference?: string | null;
  division?: OrgOption | null;
  section?: OrgOption | null;
  department?: OrgOption | null;
  warehouse?: WarehouseOption | null;
  referenceReceiptId?: string | null;
  lineCount?: number;
  quantityTotal?: number;
  lines?: ReturnLine[];
  ledgerEntries?: Array<{ id: string; transactionType: string; direction: string; quantity: number; transactionDate: string }>;
}

interface LineRow {
  key: string;
  itemId?: string;
  uomId?: string;
  quantity?: number;
}

const emptyLine = (): LineRow => ({
  key: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
  quantity: undefined,
});

const RawMaterialReturn: React.FC = () => {
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [refData, setRefData] = useState<FormRefData | null>(null);
  const [refState, setRefState] = useState<'loading' | 'error' | 'ready'>('loading');
  const [sections, setSections] = useState<OrgOption[]>([]);
  const [departments, setDepartments] = useState<OrgOption[]>([]);
  const [departmentsState, setDepartmentsState] = useState<'loading' | 'error' | 'ready'>('ready');
  const [receiptRefs, setReceiptRefs] = useState<ReceiptRefOption[]>([]);

  const [rows, setRows] = useState<LineRow[]>([emptyLine()]);

  const [list, setList] = useState<ReturnHeader[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [listLoading, setListLoading] = useState(false);
  const [listState, setListState] = useState<'loading' | 'error' | 'ready'>('loading');

  const [filters, setFilters] = useState<{ status?: string; warehouseId?: string; sourceNo?: string; dateFrom?: string; dateTo?: string }>({});

  const [modalOpen, setModalOpen] = useState(false);
  const [isModalMinimized, setIsModalMinimized] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [detail, setDetail] = useState<ReturnHeader | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);

  // Save feedback dialog states
  const [saveDialogVisible, setSaveDialogVisible] = useState(false);
  const [saveDialogPhase, setSaveDialogPhase] = useState<SaveResultPhase>('loading');
  const [saveDialogResult, setSaveDialogResult] = useState<SaveResultData | null>(null);
  const [saveDialogError, setSaveDialogError] = useState<string | undefined>(undefined);
  const [saveDialogSuccessTitle, setSaveDialogSuccessTitle] = useState<string>('Return Submitted Successfully');
  const [saveDialogRetry, setSaveDialogRetry] = useState<(() => void) | undefined>(undefined);

  // Form watchers for real-time live preview
  const watchDivision = Form.useWatch('divisionId', form);
  const watchSection = Form.useWatch('sectionId', form);
  const watchDepartment = Form.useWatch('departmentId', form);
  const watchWarehouse = Form.useWatch('warehouseId', form);
  const watchReturnDate = Form.useWatch('returnDate', form);
  const watchSourceNo = Form.useWatch('sourceNo', form);
  const watchReferenceReceiptId = Form.useWatch('referenceReceiptId', form);
  const watchReason = Form.useWatch('reason', form);

  // Filter raw materials strictly by selected Division
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

  const loadReceiptRefs = useCallback(async () => {
    try {
      const res = await apiService.get<{ data: ReceiptRefOption[]; total: number }>('/inventory/receipts/gate-pass', { page: 1, limit: 50 });
      setReceiptRefs((res.data || []).map((r) => ({ id: r.id, receiptCode: r.receiptCode })));
    } catch {
      setReceiptRefs([]);
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
      const res = await apiService.get<{ data: ReturnHeader[]; total: number }>('/inventory/receipts/returns', { page: p, limit: pageSize, ...f });
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

  useEffect(() => { void loadRef(); void loadReceiptRefs(); }, [loadRef, loadReceiptRefs]);
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

  const totalQty = useMemo(() => rows.reduce((s, r) => s + Number(r.quantity || 0), 0), [rows]);

  const openCreate = () => {
    setEditingId(null);
    form.resetFields();
    form.setFieldValue('returnDate', dayjs());
    setRows([emptyLine()]);
    setIsModalMinimized(false);
    setModalOpen(true);
  };

  const openEdit = async (rec: ReturnHeader) => {
    setEditingId(rec.id);
    try {
      const res = await apiService.get<{ data: ReturnHeader }>(`/inventory/receipts/returns/${rec.id}`);
      const d = res.data;
      form.setFieldsValue({
        divisionId: d.division?.id,
        sectionId: d.section?.id,
        departmentId: d.department?.id,
        warehouseId: d.warehouse?.id,
        returnDate: d.returnDate ? dayjs(d.returnDate) : dayjs(),
        sourceNo: d.sourceNo || undefined,
        referenceReceiptId: d.referenceReceiptId || undefined,
        reference: d.reference || undefined,
        reason: d.reason || undefined,
        remarks: undefined,
      });
      if (d.division?.id) void loadSections(d.division.id);
      if (d.division?.id && d.section?.id) void loadDepartments(d.division.id, d.section.id);
      setRows((d.lines || []).map((l) => ({
        key: l.id || `${Date.now()}-${l.lineNumber}`,
        itemId: l.item?.id,
        uomId: l.uom?.id,
        quantity: l.quantity !== undefined && l.quantity !== null ? Number(l.quantity) : undefined,
      })));
      setIsModalMinimized(false);
      setModalOpen(true);
    } catch (err: any) {
      message.error(formatApiError(err, 'Failed to load the return for editing.'));
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
    const hasQty = rows.some((r) => Number(r.quantity || 0) > 0);
    if (!hasQty) { message.error('At least one line must have a quantity greater than zero.'); return; }
    const duplicates = rows.filter((r) => rows.filter((o) => o.itemId === r.itemId && o.itemId).length > 1);
    if (duplicates.length) { message.error('An item can only appear once per return.'); return; }

    setSubmitting(true);
    setSaveDialogVisible(true);
    setSaveDialogPhase('loading');
    setSaveDialogSuccessTitle(editingId ? 'Return Updated Successfully' : 'Return Submitted Successfully');
    setSaveDialogError(undefined);

    const payload = {
      divisionId: values.divisionId,
      sectionId: values.sectionId,
      departmentId: values.departmentId,
      warehouseId: values.warehouseId,
      returnDate: values.returnDate ? values.returnDate.format('YYYY-MM-DD') : undefined,
      sourceNo: values.sourceNo || undefined,
      referenceReceiptId: values.referenceReceiptId || undefined,
      reference: values.reference || undefined,
      reason: values.reason || undefined,
      items: rows.map((r) => ({
        itemId: r.itemId,
        uomId: r.uomId,
        quantity: Number(r.quantity || 0),
      })),
    };

    try {
      let resultReturnCode = editingId ? (list.find((x) => x.id === editingId)?.returnCode || editingId) : '';
      if (editingId) {
        await apiService.patch<{ success: boolean }>(`/inventory/receipts/returns/${editingId}`, payload);
      } else {
        const res = await apiService.post<{ success: boolean; data?: any }>('/inventory/receipts/return-multi', payload);
        resultReturnCode = res.data?.returnCode || 'Submitted';
      }

      setSaveDialogResult({
        title: editingId ? 'Return Updated' : 'Return Submitted',
        recordType: 'Return Code',
        recordCode: resultReturnCode,
        recordName: values.sourceNo ? `DC #${values.sourceNo}` : undefined,
        message: `${rows.filter((r) => r.itemId).length} raw material line(s) returned. Total Returned Qty: ${formatNumber(totalQty, 2)}`,
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
      const errMsg = formatApiError(err, 'Failed to save the return.');
      setSaveDialogError(errMsg);
      setSaveDialogRetry(() => () => onFinish(values));
      setSaveDialogPhase('error');
    } finally {
      setSubmitting(false);
    }
  };

  const openDetail = async (rec: ReturnHeader) => {
    setDetailOpen(true);
    setDetailLoading(true);
    try {
      const res = await apiService.get<{ data: ReturnHeader }>(`/inventory/receipts/returns/${rec.id}`);
      setDetail(res.data);
    } catch (err: any) {
      message.error(formatApiError(err, 'Failed to load the return detail.'));
    } finally {
      setDetailLoading(false);
    }
  };

  const handleDelete = async (rec: ReturnHeader) => {
    try {
      await apiService.delete<{ success: boolean }>(`/inventory/receipts/returns/${rec.id}`);
      message.success('Return deleted and inventory balance reversed.');
      void loadList(page);
    } catch (err: any) {
      message.error(formatApiError(err, 'Failed to delete the return.'));
    }
  };

  const applyFilter = (patch: typeof filters) => {
    const next = { ...filters, ...patch };
    setFilters(next);
    setPage(1);
    void loadList(1, next);
  };

  const columns: ColumnsType<ReturnHeader> = [
    { title: 'Return Code', dataIndex: 'returnCode', key: 'returnCode', width: 130, render: (v: string) => <Text strong>{v}</Text> },
    { title: 'Date', dataIndex: 'returnDate', key: 'returnDate', width: 110, render: (v: string) => (v ? dayjs(v).format('DD-MMM-YYYY') : '-') },
    { title: 'Source / DC No', dataIndex: 'sourceNo', key: 'sourceNo', width: 130, render: (v?: string) => v || '-' },
    { title: 'Division', key: 'division', width: 160, ellipsis: true, render: (_, r) => (r.division ? `${r.division.divisionCode ?? ''} ${r.division.name}`.trim() : '-') },
    { title: 'Section', key: 'section', width: 140, ellipsis: true, render: (_, r) => (r.section?.name || '-') },
    { title: 'Department', key: 'department', width: 160, ellipsis: true, render: (_, r) => (r.department?.name || '-') },
    { title: 'Warehouse', key: 'warehouse', width: 160, ellipsis: true, render: (_, r) => (r.warehouse?.name || '-') },
    { title: 'Lines', dataIndex: 'lineCount', key: 'lineCount', width: 60, align: 'center' as const, render: (v?: number) => v ?? 0 },
    { title: 'Quantity', dataIndex: 'quantityTotal', key: 'quantityTotal', width: 110, align: 'right' as const, render: (v?: number) => formatNumber(v, 2) },
    { title: 'Status', dataIndex: 'status', key: 'status', width: 105, render: (v: string) => <Tag color={v === 'CONFIRMED' ? 'green' : v === 'DRAFT' ? 'gold' : 'red'}>{v}</Tag> },
    {
      title: 'Actions', key: 'actions', width: 150,
      render: (_, r) => (
        <Space size={0}>
          <Tooltip title="View">
            <Button type="text" size="small" icon={<EyeOutlined />} onClick={() => openDetail(r)} style={{ color: 'var(--theme-primary)' }} />
          </Tooltip>
          <Tooltip title="Edit">
            <Button type="text" size="small" icon={<EditOutlined />} onClick={() => openEdit(r)} style={{ color: 'var(--theme-warning, #d48806)' }} />
          </Tooltip>
          <Popconfirm
            title="Delete this return?"
            description="Posted stock for this return will be reversed. This cannot be undone."
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
      title: 'Raw Material', key: 'itemId', width: 300,
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
      title: <span>Quantity <Text type="danger">*</Text></span>, key: 'quantity', width: 150,
      render: (_, r) => (
        <InputNumber
          min={0.01}
          precision={2}
          value={r.quantity}
          onChange={(v) => setRow(r.key, { quantity: v !== null && v !== undefined ? Number(v) : undefined })}
          style={{ width: '100%' }}
          placeholder="0.00"
        />
      ),
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
            <Title level={4} style={{ margin: 0 }}><RollbackOutlined style={{ color: 'var(--theme-warning, #d48806)' }} /> Raw Material Return</Title>
            <Text type="secondary">Return raw material to supplier/stock. Inventory decreases by the returned quantity.</Text>
          </Col>
          <Col>
            <Space>
              <Button icon={<PlusOutlined />} type="primary" onClick={openCreate}>New Return</Button>
              <Button icon={<ReloadOutlined />} onClick={() => loadList(page)}>Refresh</Button>
            </Space>
          </Col>
        </Row>
      </Card>

      <Card className="erp-section-card" title={<Space><RollbackOutlined /> Return History</Space>}>
        <Space wrap style={{ marginBottom: 12 }}>
          <Select placeholder="Status" allowClear style={{ width: 140 }} value={filters.status}
            onChange={(v) => applyFilter({ status: v })}
            options={[{ value: 'CONFIRMED', label: 'Confirmed' }, { value: 'DRAFT', label: 'Draft' }, { value: 'CANCELLED', label: 'Cancelled' }]} />
          <Select placeholder="Warehouse" allowClear showSearch optionFilterProp="label" style={{ width: 200 }} value={filters.warehouseId}
            onChange={(v) => applyFilter({ warehouseId: v })}
            options={(refData?.warehouses || []).map((w) => ({ value: w.id, label: w.warehouseCode ? `${w.warehouseCode} — ${w.name}` : w.name }))} />
          <Input placeholder="Source / DC No" allowClear style={{ width: 160 }} value={filters.sourceNo}
            onChange={(e) => applyFilter({ sourceNo: e.target.value || undefined })} />
          <DatePicker.RangePicker
            value={filters.dateFrom && filters.dateTo ? [dayjs(filters.dateFrom), dayjs(filters.dateTo)] : undefined}
            onChange={(v) => applyFilter({ dateFrom: v?.[0] ? v[0].format('YYYY-MM-DD') : undefined, dateTo: v?.[1] ? v[1].format('YYYY-MM-DD') : undefined })}
          />
        </Space>
        {listState === 'error' ? (
          <Alert type="error" showIcon message="Returns could not be loaded. Refresh or contact an administrator." />
        ) : (
          <Table columns={columns} dataSource={list} rowKey="id" loading={listLoading} scroll={{ x: 1300 }}
            locale={{ emptyText: listLoading ? 'Loading returns...' : 'No returns found.' }}
            pagination={{ current: page, total, pageSize, showSizeChanger: false, onChange: (p) => { setPage(p); void loadList(p); } }} />
        )}
      </Card>

      {/* Enterprise Draggable, Resizable Split-View Modal */}
      <DraggableResizableModal
        title={<Space><RollbackOutlined /> {editingId ? 'Edit Return' : 'New Raw Material Return'}</Space>}
        subtitle="Return raw material stock with division validation and real-time inventory adjustments"
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
                    <Form.Item name="warehouseId" label={<span>Return From Warehouse <Text type="danger">*</Text></span>} rules={[{ required: true, message: 'Select warehouse' }]}>
                      <Select showSearch optionFilterProp="label" placeholder="Select warehouse"
                        status={refState === 'error' ? 'error' : undefined}
                        options={(refData?.warehouses || []).map((w) => ({ value: w.id, label: w.warehouseCode ? `${w.warehouseCode} — ${w.name}` : w.name }))} />
                    </Form.Item>
                  </Col>
                  <Col xs={24} md={8}>
                    <Form.Item name="returnDate" label="Return Date">
                      <DatePicker style={{ width: '100%' }} placeholder="Defaults to today" />
                    </Form.Item>
                  </Col>
                  <Col xs={24} md={8}>
                    <Form.Item name="sourceNo" label="Source / DC No">
                      <Input placeholder="Optional" maxLength={50} />
                    </Form.Item>
                  </Col>
                  <Col xs={24} md={16}>
                    <Form.Item name="referenceReceiptId" label="Reference Receipt (Gate Pass)">
                      <Select allowClear showSearch optionFilterProp="label" placeholder="Optional"
                        options={receiptRefs.map((r) => ({ value: r.id, label: r.receiptCode }))} />
                    </Form.Item>
                  </Col>
                </Row>
              </Card>

              <Card
                size="small" title="Return Items"
                className="erp-section-card-inner"
                style={{ marginBottom: 12 }}
                extra={<Button size="small" type="dashed" icon={<PlusOutlined />} onClick={() => setRows((prev) => [...prev, emptyLine()])}>Add Item</Button>}
              >
                {refState === 'error' ? (
                  <Alert type="error" showIcon message="Reference data could not be loaded. Please refresh the page." />
                ) : (
                  <Table columns={lineColumns} dataSource={rows} rowKey="key" pagination={false} size="small" scroll={{ x: 620 }}
                    locale={{ emptyText: 'No lines added yet.' }} />
                )}
                <div style={{ marginTop: 12, textAlign: 'right' }}>
                  <Text strong>Total Return Quantity:</Text> <Text style={{ color: 'var(--theme-danger, #ff4d4f)', fontSize: 16 }}>{formatNumber(totalQty, 2)}</Text>
                </div>
              </Card>

              <Form.Item name="reason" label={<span>Reason <Text type="danger">*</Text></span>} rules={[{ required: true, message: 'Enter the reason for the return' }]}>
                <Input.TextArea rows={2} maxLength={1000} placeholder="Reason for returning this raw material" />
              </Form.Item>
              <Form.Item name="reference" label="Reference">
                <Input placeholder="e.g. RET-001" maxLength={50} />
              </Form.Item>

              <Space style={{ marginTop: 8 }}>
                <Button type="primary" icon={<SaveOutlined />} htmlType="submit" loading={submitting}>{editingId ? 'Save Changes' : 'Submit Return'}</Button>
                <Button onClick={() => setModalOpen(false)} disabled={submitting}>Cancel</Button>
              </Space>
            </Form>
          </div>

          {/* Right Column: Live Verification Card */}
          <div className="raw-material-modal-preview-col">
            <div className="raw-material-live-preview-card">
              <div className="rm-preview-header-badge" style={{ background: 'rgba(245, 158, 11, 0.15)', borderColor: 'rgba(245, 158, 11, 0.35)', color: '#d97706' }}>
                <span className="rm-minimized-window-pulse" style={{ width: 6, height: 6, background: '#f59e0b' }} />
                RETURN VERIFICATION (2027)
              </div>
              <div className="rm-preview-doc-title">
                {editingId ? 'Updating Return' : 'New Raw Material Return'}
              </div>
              <div className="rm-preview-doc-subtitle">
                Return Code: <Text strong style={{ color: 'var(--theme-warning, #d48806)' }}>{editingId ? (list.find((x) => x.id === editingId)?.returnCode || 'Editing') : 'Auto-Assigned on Submit'}</Text>
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
                  <span className="rm-preview-meta-label">Return Warehouse</span>
                  <span className="rm-preview-meta-value" title={refData?.warehouses.find((w) => w.id === watchWarehouse)?.name}>
                    {refData?.warehouses.find((w) => w.id === watchWarehouse)?.name || <Text type="secondary">Not Selected</Text>}
                  </span>
                </div>
                <div className="rm-preview-meta-row">
                  <span className="rm-preview-meta-label">Return Date</span>
                  <span className="rm-preview-meta-value">{watchReturnDate ? watchReturnDate.format('DD-MMM-YYYY') : dayjs().format('DD-MMM-YYYY')}</span>
                </div>
                {watchSourceNo && (
                  <div className="rm-preview-meta-row">
                    <span className="rm-preview-meta-label">Source / DC No</span>
                    <span className="rm-preview-meta-value">{watchSourceNo}</span>
                  </div>
                )}
                {watchReferenceReceiptId && (
                  <div className="rm-preview-meta-row">
                    <span className="rm-preview-meta-label">Ref Receipt</span>
                    <span className="rm-preview-meta-value">{receiptRefs.find((r) => r.id === watchReferenceReceiptId)?.receiptCode || watchReferenceReceiptId}</span>
                  </div>
                )}
                {watchReason && (
                  <div className="rm-preview-meta-row">
                    <span className="rm-preview-meta-label">Reason</span>
                    <span className="rm-preview-meta-value" title={watchReason}>{watchReason}</span>
                  </div>
                )}
              </div>

              <div className="rm-preview-kpi-grid">
                <div className="rm-preview-kpi-card">
                  <div className="rm-preview-kpi-num">{rows.filter((r) => r.itemId).length}</div>
                  <div className="rm-preview-kpi-label">Active Lines</div>
                </div>
                <div className="rm-preview-kpi-card" style={{ borderColor: 'rgba(239, 68, 68, 0.4)' }}>
                  <div className="rm-preview-kpi-num" style={{ color: '#ef4444' }}>{formatNumber(totalQty, 2)}</div>
                  <div className="rm-preview-kpi-label">Total Return Qty</div>
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
                    return (
                      <div key={r.key || idx} className="rm-preview-line-row">
                        <div className="rm-preview-line-header">
                          <span className="rm-preview-line-title">
                            #{idx + 1} {item?.itemCode || ''} — {item?.name || 'Unknown Item'}
                          </span>
                          <span className="rm-preview-line-badge">
                            <Tag color="volcano" style={{ margin: 0, fontSize: 11 }}>OUT</Tag>
                          </span>
                        </div>
                        <div className="rm-preview-line-meta">
                          <span>Return Qty: <strong style={{ color: '#ef4444' }}>{formatNumber(r.quantity, 2)}</strong> {uom?.code || uom?.symbol || ''}</span>
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
            title="Click to restore Return Window"
          >
            <span className="rm-minimized-window-pulse" style={{ background: '#f59e0b' }} />
            <RollbackOutlined style={{ color: '#d97706' }} />
            <span>{editingId ? 'Edit Return' : 'New Raw Material Return'} ({rows.filter((r) => r.itemId).length} lines)</span>
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
        loadingTitle="Posting Raw Material Return..."
        loadingHint="Checking available stock in warehouse and posting inventory OUT ledger entries..."
        onRetry={saveDialogRetry}
        onClose={() => setSaveDialogVisible(false)}
      />

      <Drawer
        title={<Space><EyeOutlined /> Return Detail</Space>}
        open={detailOpen} onClose={() => setDetailOpen(false)} width={760}
      >
        {detailLoading ? (
          <Alert type="info" showIcon message="Loading return detail..." />
        ) : detail ? (
          <>
            <Descriptions column={2} bordered size="small" labelStyle={{ width: 130 }}>
              <Descriptions.Item label="Return Code"><Text strong>{detail.returnCode}</Text></Descriptions.Item>
              <Descriptions.Item label="Status"><Tag color="green">{detail.status}</Tag></Descriptions.Item>
              <Descriptions.Item label="Date">{detail.returnDate || '-'}</Descriptions.Item>
              <Descriptions.Item label="Source / DC No">{detail.sourceNo || '-'}</Descriptions.Item>
              <Descriptions.Item label="Division">{detail.division?.name || '-'}</Descriptions.Item>
              <Descriptions.Item label="Section">{detail.section?.name || '-'}</Descriptions.Item>
              <Descriptions.Item label="Department">{detail.department?.name || '-'}</Descriptions.Item>
              <Descriptions.Item label="Warehouse">{detail.warehouse?.name || '-'}</Descriptions.Item>
              <Descriptions.Item label="Reason">{detail.reason || '-'}</Descriptions.Item>
            </Descriptions>

            <Divider orientation="left" plain>Items</Divider>
            <Table
              rowKey={(l) => l.id || `${l.lineNumber}-${l.item?.id}`}
              size="small" pagination={false} scroll={{ x: 520 }}
              dataSource={detail.lines || []}
              columns={[
                { title: '#', dataIndex: 'lineNumber', key: 'lineNumber', width: 40 },
                { title: 'Item', key: 'item', render: (_, l) => (l.item ? `${l.item.itemCode} — ${l.item.name}` : '-') },
                { title: 'UOM', key: 'uom', width: 70, render: (_, l) => l.uom?.code || '-' },
                { title: 'Quantity', dataIndex: 'quantity', key: 'q', align: 'right' as const, render: (v: unknown) => formatNumber(v, 2) },
              ]}
            />
            <div style={{ marginTop: 12, textAlign: 'right' }}>
              <Text strong>Total Return Quantity:</Text> <Text style={{ color: 'var(--theme-danger, #ff4d4f)' }}>{formatNumber(detail.quantityTotal, 2)}</Text>
            </div>

            {(detail.ledgerEntries || []).length > 0 && (
              <>
                <Divider orientation="left" plain>Stock Ledger Postings</Divider>
                <Table
                  rowKey="id" size="small" pagination={false}
                  dataSource={detail.ledgerEntries || []}
                  columns={[
                    { title: 'Date', dataIndex: 'transactionDate', key: 'd', render: (v: string) => (v ? dayjs(v).format('DD-MMM-YYYY') : '-') },
                    { title: 'Type', dataIndex: 'transactionType', key: 't', render: (v: string) => <Tag color="volcano">{v}</Tag> },
                    { title: 'Direction', dataIndex: 'direction', key: 'dir', render: (v: string) => <span style={{ color: v === 'IN' ? 'var(--theme-success, #52c41a)' : 'var(--theme-danger, #ff4d4f)', fontWeight: 600 }}>{v}</span> },
                    { title: 'Quantity', dataIndex: 'quantity', key: 'q', align: 'right' as const, render: (v: unknown) => formatNumber(v, 2) },
                  ]}
                />
              </>
            )}
          </>
        ) : null}
      </Drawer>
    </div>
  );
};

export default RawMaterialReturn;