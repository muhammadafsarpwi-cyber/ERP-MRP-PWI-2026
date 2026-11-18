import React, { useState, useEffect, useCallback } from 'react';
import {
  Card, Table, Button, Space, Modal, Form, Input, Select, Tag, App, DatePicker, Row, Col, Drawer, Descriptions, Spin, Popconfirm,
} from 'antd';
import { PlusOutlined, ArrowDownOutlined, SearchOutlined, CheckOutlined, EyeOutlined, DeleteOutlined, PrinterOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import apiService from '../../services/api';
import { usePermission } from '../../hooks/usePermission';
import PageHeader from '../../components/shared/PageHeader';
import { ConfirmAndSuccessModal, type ConfirmAndSuccessPhase } from '../../components/shared';
import StoreLineItemsEditor, { StoreLineItem } from './components/StoreLineItemsEditor';
import StoreVoucherPrintModal, { StoreVoucherData } from './components/StoreVoucherPrintModal';

interface GoodsReceipt {
  id: string;
  receiptCode: string;
  poCode?: string;
  supplierName?: string;
  receiptDate?: string;
  grnNumber?: string;
  status: string;
}

const STATUS_OPTIONS = ['DRAFT', 'RECEIVED', 'INSPECTION', 'ACCEPTED', 'REJECTED', 'POSTED'];

const statusColorMap: Record<string, string> = {
  DRAFT: 'default', RECEIVED: 'blue', INSPECTION: 'orange',
  ACCEPTED: 'green', REJECTED: 'red', POSTED: 'purple',
};

const MaterialReceiptManagement: React.FC = () => {
  const { message, modal } = App.useApp();
  const { can } = usePermission();
  const canCreate = can('store.receive.create');
  const canPost = can('store.receive.post');
  const canInspect = can('store.receive.create');
  const canDelete = can('store.receive.delete');
  const [printVoucher, setPrintVoucher] = useState<StoreVoucherData | null>(null);

  const openPrintModal = async (record: GoodsReceipt) => {
    try {
      const res = await apiService.get<any>(`/store/receipts/${record.id}`);
      const d = res?.data || res || record;
      const lines = Array.isArray(d.lines) ? d.lines : (Array.isArray(d.items) ? d.items : []);
      setPrintVoucher({
        type: 'GRN',
        documentNumber: record.grnNumber || record.receiptCode,
        date: record.receiptDate ? String(record.receiptDate).slice(0, 10) : undefined,
        status: record.status,
        partyName: record.supplierName || d.supplierName,
        purpose: record.poCode ? `Against PO: ${record.poCode}` : undefined,
        remarks: d.notes || undefined,
        lines: lines.map((l: any, idx: number) => ({
          key: l.id || idx,
          lineNumber: idx + 1,
          itemCode: l.itemCode || l.item?.code,
          itemName: l.itemName || l.item?.name || l.description || 'Item',
          uomCode: l.uomCode || l.uom?.code,
          quantity: Number(l.receivedQty ?? l.acceptedQty ?? l.quantity ?? 0),
          remarks: l.remarks || undefined,
        })),
      });
    } catch {
      message.error('Failed to load receipt details for printing');
    }
  };

  const [data, setData] = useState<GoodsReceipt[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [modalVisible, setModalVisible] = useState(false);
  const [form] = Form.useForm();
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<string | undefined>(undefined);
  const [pageSize] = useState(20);
  const [lineItems, setLineItems] = useState<StoreLineItem[]>([]);
  const [companyId, setCompanyId] = useState('');
  const [suppliers, setSuppliers] = useState<Array<{ id: string; name: string }>>([]);
  const [warehouses, setWarehouses] = useState<Array<{ id: string; warehouseCode: string; name: string }>>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<Array<{ id: string; poCode: string; supplierName?: string }>>([]);
  const [poLinesLoading, setPoLinesLoading] = useState(false);
  const [detail, setDetail] = useState<GoodsReceipt | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  useEffect(() => {
    const erpUser = localStorage.getItem('erp_user');
    if (erpUser) {
      try { const p = JSON.parse(erpUser); if (p?.defaultCompanyId) setCompanyId(p.defaultCompanyId); } catch { /* ignore */ }
    }
    (async () => {
      try {
        const s = await apiService.get<{ data: Array<{ id: string; name: string }> }>('/procurement/suppliers', { limit: 200 });
        setSuppliers(s.data || []);
      } catch { /* ignore */ }
      try {
        const w = await apiService.get<{ data: Array<{ id: string; warehouseCode: string; name: string }> }>('/warehouses', { limit: 100 });
        setWarehouses(w.data || []);
      } catch { /* ignore */ }
      try {
        const o = await apiService.get<{ data: Array<{ id: string; poCode: string; supplier?: { name: string } }> }>('/procurement/orders', { limit: 200 });
        setPurchaseOrders((o.data || []).map((po) => ({
          id: po.id,
          poCode: po.poCode,
          supplierName: po.supplier?.name,
        })));
      } catch { /* ignore */ }
    })();
  }, []);

  const fetchData = useCallback(async (pageNum: number = 1) => {
    setLoading(true);
    try {
      const params: any = { page: pageNum, limit: pageSize };
      if (search) params.search = search;
      if (filterStatus) params.status = filterStatus;
      const response = await apiService.get<{ data: GoodsReceipt[]; total: number }>('/store/receipts', params);
      setData(response.data);
      setTotal(response.total);
    } catch (error) {
      message.error('Failed to fetch material receipts');
    } finally {
      setLoading(false);
    }
  }, [search, filterStatus, pageSize, message]);

  useEffect(() => { fetchData(page); }, [page, fetchData]);

  const handleCreate = () => {
    form.resetFields();
    form.setFieldsValue({
      companyId,
      receiptDate: dayjs(),
    });
    setLineItems([]);
    setModalVisible(true);
  };

  const handlePoChange = async (poId?: string) => {
    setLineItems([]);
    if (!poId) return;
    setPoLinesLoading(true);
    try {
      const po = await apiService.get<any>(`/procurement/orders/${poId}`);
      const lines: any[] = po?.lines || [];
      if (lines.length === 0) {
        message.warning('Selected PO has no lines');
        return;
      }
      const poLines = lines.map((l, i) => ({
        key: `po-${l.id}-${i}`,
        poLineId: l.id,
        itemId: l.itemId,
        itemCode: l.item?.itemCode,
        itemName: l.item?.name,
        uomId: l.uomId,
        uomCode: l.uom?.code,
        quantity: Number(l.quantity ?? 1),
        unitPrice: Number(l.unitPrice ?? 0),
        remarks: undefined,
      }));
      setLineItems(poLines);
      const poDetail = purchaseOrders.find((o) => o.id === poId);
      if (poDetail?.supplierName) {
        const supplier = suppliers.find((s) => s.name === poDetail.supplierName);
        if (supplier) form.setFieldsValue({ supplierId: supplier.id });
      }
    } catch {
      message.error('Failed to load PO lines');
    } finally {
      setPoLinesLoading(false);
    }
  };

  const [receiptConfirmPhase, setReceiptConfirmPhase] = useState<ConfirmAndSuccessPhase>('idle');
  const [pendingReceiptPayload, setPendingReceiptPayload] = useState<any>(null);
  const [receiptFeedbackMeta, setReceiptFeedbackMeta] = useState<{
    refNum: string;
    lineCount: number;
    grnNumber?: string;
    errorMessage?: string;
  }>({ refNum: '', lineCount: 0 });

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      if (lineItems.length === 0) {
        message.warning('Add at least one line item');
        return;
      }
      const payload = {
        ...values,
        receiptDate: values.receiptDate ? values.receiptDate.format('YYYY-MM-DD') : undefined,
        lines: lineItems.map((l) => ({
          poLineId: l.poLineId,
          itemId: l.itemId,
          uomId: l.uomId,
          quantityOrdered: l.quantity,
          quantityReceived: l.quantity,
          quantityAccepted: l.quantity,
          quantityRejected: 0,
          unitPrice: l.unitPrice ?? 0,
          conditionNotes: l.itemCode || l.itemName || undefined,
        })),
      };
      setPendingReceiptPayload(payload);
      setReceiptFeedbackMeta({
        refNum: String(values.grnNumber || 'Auto-Generated'),
        lineCount: lineItems.length,
        grnNumber: values.grnNumber,
      });
      setReceiptConfirmPhase('confirm');
    } catch {
      // form.validateFields handles field errors
    }
  };

  const executeReceiptSave = async () => {
    if (!pendingReceiptPayload) return;
    setReceiptConfirmPhase('saving');
    try {
      const res = await apiService.post<any>('/store/receipts', pendingReceiptPayload);
      const savedRef = res?.receiptCode || res?.data?.receiptCode || receiptFeedbackMeta.grnNumber || receiptFeedbackMeta.refNum;
      setReceiptFeedbackMeta((prev) => ({ ...prev, refNum: savedRef }));
      setReceiptConfirmPhase('success');
      setModalVisible(false);
      setPendingReceiptPayload(null);
      fetchData(page);
    } catch (err: any) {
      const msg: any = err?.response?.data?.message || err?.message || 'Failed to create material receipt';
      setReceiptFeedbackMeta((prev) => ({
        ...prev,
        errorMessage: Array.isArray(msg) ? msg[0] : String(msg),
      }));
      setReceiptConfirmPhase('error');
    }
  };

  const [rowActionState, setRowActionState] = useState<{
    phase: ConfirmAndSuccessPhase;
    action: 'accept' | 'post' | 'reject' | 'inspect' | 'delete';
    record: GoodsReceipt | null;
    errorMessage?: string;
  }>({ phase: 'idle', action: 'post', record: null });

  const openRowAction = (action: 'accept' | 'post' | 'reject' | 'inspect' | 'delete', record: GoodsReceipt) => {
    setRowActionState({ phase: 'confirm', action, record });
  };

  const executeRowAction = async () => {
    const { action, record } = rowActionState;
    if (!record) return;
    setRowActionState((prev) => ({ ...prev, phase: 'saving', errorMessage: undefined }));
    try {
      if (action === 'delete') {
        await apiService.delete(`/store/receipts/${record.id}`);
      } else {
        await apiService.patch(`/store/receipts/${record.id}/${action}`);
      }
      setRowActionState((prev) => ({ ...prev, phase: 'success' }));
      setDetailOpen(false);
      fetchData(page);
    } catch (err: any) {
      const msg: any = err?.response?.data?.message || err?.message || `Failed to ${action} receipt`;
      setRowActionState((prev) => ({
        ...prev,
        phase: 'error',
        errorMessage: Array.isArray(msg) ? msg.join(', ') : String(msg),
      }));
    }
  };

  const openDetail = (record: GoodsReceipt) => {
    setDetail(record);
    setDetailOpen(true);
  };

  const columns: ColumnsType<GoodsReceipt> = [
    { title: 'Receipt Code', dataIndex: 'receiptCode', key: 'receiptCode', width: 140 },
    { title: 'PO', dataIndex: 'poCode', key: 'poCode', width: 110 },
    { title: 'Supplier', dataIndex: 'supplierName', key: 'supplierName', width: 150 },
    { title: 'Date', dataIndex: 'receiptDate', key: 'receiptDate', width: 110, render: (v) => String(v || '').slice(0, 10) },
    { title: 'GRN', dataIndex: 'grnNumber', key: 'grnNumber', width: 110 },
    {
      title: 'Status', dataIndex: 'status', key: 'status', width: 170,
      render: (status: string) => (
        <Space>
          <Tag color={statusColorMap[status]}>{status}</Tag>
          {status === 'POSTED' && <Tag color="geekblue">Stock posted</Tag>}
        </Space>
      ),
    },
    {
      title: 'Actions', key: 'actions', width: 320,
      render: (_, record) => (
        <Space wrap size={6}>
          <Button size="small" className="erp-action-btn act-view" icon={<EyeOutlined />} aria-label="View" onClick={() => openDetail(record)} />
          <Button size="small" icon={<PrinterOutlined />} onClick={() => openPrintModal(record)}>Print Slip</Button>
          {record.status === 'RECEIVED' && canInspect && <Button size="small" type="primary" onClick={() => openRowAction('inspect', record)}>Inspect</Button>}
          {record.status === 'INSPECTION' && canInspect && <Button size="small" type="primary" icon={<CheckOutlined />} onClick={() => openRowAction('accept', record)}>Accept</Button>}
          {record.status === 'INSPECTION' && canInspect && <Button size="small" danger onClick={() => openRowAction('reject', record)}>Reject</Button>}
          {record.status === 'ACCEPTED' && canPost && <Button size="small" type="primary" onClick={() => openRowAction('post', record)}>Post to Stock</Button>}
          {record.status !== 'POSTED' && canDelete && (
            <Button size="small" danger icon={<DeleteOutlined />} onClick={() => openRowAction('delete', record)}>Delete</Button>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        icon={<ArrowDownOutlined />}
        title="Material Receipts"
        subtitle="GRN receiving into store stock (uses procurement goods receipt engine)"
        extra={canCreate ? <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>New Receipt</Button> : undefined}
      />
      <div style={{ padding: '0 16px' }}>
        <Card>
          <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
            <Col xs={24} sm={12} md={8}>
              <Input placeholder="Search receipts..." prefix={<SearchOutlined />} value={search} onChange={(e) => setSearch(e.target.value)} onPressEnter={() => fetchData(1)} />
            </Col>
            <Col xs={24} sm={8} md={6}>
              <Select placeholder="Filter by status" allowClear style={{ width: '100%' }} value={filterStatus} onChange={setFilterStatus}>
                {STATUS_OPTIONS.map((s) => <Select.Option key={s} value={s}>{s}</Select.Option>)}
              </Select>
            </Col>
            <Col xs={24} sm={4} md={4}>
              <Button onClick={() => fetchData(1)}>Search</Button>
            </Col>
          </Row>
          <Table columns={columns} dataSource={data} rowKey="id" loading={loading} scroll={{ x: 'max-content' }}
            pagination={{ current: page, total, pageSize, showSizeChanger: false, onChange: setPage }} />
        </Card>
      </div>

      <Modal title="New Material Receipt" open={modalVisible}
        onOk={handleSubmit} onCancel={() => setModalVisible(false)} width={900} destroyOnHidden>
        <Form form={form} layout="vertical">
          <Form.Item name="companyId" hidden><Input /></Form.Item>
          <Row gutter={[16, 8]}>
            <Col xs={24} sm={8}>
              <Form.Item name="receiptCode" label="Receipt Code" rules={[{ required: true }]}>
                <Input />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="receiptDate" label="Receipt Date" rules={[{ required: true }]}>
                <DatePicker style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="supplierId" label="Supplier" rules={[{ required: true }]}>
                <Select showSearch optionFilterProp="label"
                  options={suppliers.map((s) => ({ value: s.id, label: s.name }))} />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item name="poId" label="Purchase Order (GRN reference)" rules={[{ required: true }]}>
                <Select
                  showSearch
                  optionFilterProp="label"
                  placeholder="Select PO to load its lines"
                  onChange={handlePoChange}
                  options={purchaseOrders.map((o) => ({
                    value: o.id,
                    label: `${o.poCode}${o.supplierName ? ` — ${o.supplierName}` : ''}`,
                  }))}
                />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="warehouseId" label="Warehouse" rules={[{ required: true }]}>
                <Select options={warehouses.map((w) => ({ value: w.id, label: `${w.warehouseCode} — ${w.name}` }))} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="grnNumber" label="GRN Number">
                <Input />
              </Form.Item>
            </Col>
          </Row>
          {poLinesLoading ? (
            <Spin tip="Loading PO lines..." style={{ display: 'block', padding: 24, textAlign: 'center' }} />
          ) : (
            <StoreLineItemsEditor mode="receipt" value={lineItems} onChange={setLineItems} label="Receipt Items" />
          )}
          <Form.Item name="notes" label="Notes">
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>

      <Drawer title={detail?.receiptCode || 'Receipt Detail'} open={detailOpen} onClose={() => setDetailOpen(false)} width={700}>
        {detail && (
          <Descriptions bordered size="small" column={1}>
            <Descriptions.Item label="Status"><Tag color={statusColorMap[detail.status]}>{detail.status}</Tag></Descriptions.Item>
            <Descriptions.Item label="PO Number">{detail.poCode || '—'}</Descriptions.Item>
            <Descriptions.Item label="Supplier">{detail.supplierName || '—'}</Descriptions.Item>
            <Descriptions.Item label="Receipt Date">{detail.receiptDate ? String(detail.receiptDate).slice(0, 10) : '—'}</Descriptions.Item>
            <Descriptions.Item label="GRN Number">{detail.grnNumber || '—'}</Descriptions.Item>
          </Descriptions>
        )}
      </Drawer>

      <StoreVoucherPrintModal
        open={!!printVoucher}
        onClose={() => setPrintVoucher(null)}
        voucher={printVoucher}
      />

      <ConfirmAndSuccessModal
        open={receiptConfirmPhase !== 'idle'}
        phase={receiptConfirmPhase}
        confirmTitle="Confirm Material Receipt"
        confirmDescription="Please review the receipt items before saving."
        confirmText="Confirm & Save"
        savingText="Saving..."
        savingSubtext="Recording material receipt"
        referenceNumber={receiptFeedbackMeta.refNum}
        successMessage={`Material receipt created (${receiptFeedbackMeta.lineCount} ${receiptFeedbackMeta.lineCount === 1 ? 'item' : 'items'}).`}
        errorMessage={receiptFeedbackMeta.errorMessage}
        summaryRows={[
          { label: 'GRN / Ref #', value: receiptFeedbackMeta.grnNumber || 'Auto' },
          { label: 'Line Items', value: receiptFeedbackMeta.lineCount, highlight: true },
        ]}
        onConfirm={executeReceiptSave}
        onCancel={() => setReceiptConfirmPhase('idle')}
        onOk={() => setReceiptConfirmPhase('idle')}
      />

      <ConfirmAndSuccessModal
        open={rowActionState.phase !== 'idle'}
        phase={rowActionState.phase}
        confirmTitle={
          rowActionState.action === 'post'
            ? 'Confirm Post Material Receipt'
            : rowActionState.action === 'accept'
            ? 'Confirm Accept Material Receipt'
            : rowActionState.action === 'reject'
            ? 'Confirm Reject Material Receipt'
            : rowActionState.action === 'inspect'
            ? 'Confirm Start Inspection'
            : 'Confirm Delete Material Receipt'
        }
        confirmDescription={
          rowActionState.action === 'post'
            ? 'Posting will add accepted quantities into store inventory stock.'
            : rowActionState.action === 'accept'
            ? 'Accepting approves the received quantities for stock posting.'
            : rowActionState.action === 'reject'
            ? 'Rejecting cancels the received quantities.'
            : rowActionState.action === 'inspect'
            ? 'Mark this receipt as inspected?'
            : 'This will permanently delete the selected material receipt record.'
        }
        confirmText={
          rowActionState.action === 'post'
            ? 'Confirm & Post'
            : rowActionState.action === 'delete'
            ? 'Confirm Delete'
            : `Confirm ${rowActionState.action[0].toUpperCase()}${rowActionState.action.slice(1)}`
        }
        savingText="Processing..."
        savingSubtext="Updating material receipt & stock"
        referenceNumber={rowActionState.record?.receiptCode}
        successMessage={
          rowActionState.action === 'delete'
            ? 'Material receipt deleted successfully.'
            : `Material receipt ${rowActionState.action}ed successfully.`
        }
        errorMessage={rowActionState.errorMessage}
        summaryRows={
          rowActionState.record
            ? [
                { label: 'Receipt Code', value: rowActionState.record.receiptCode },
                { label: 'Supplier', value: rowActionState.record.supplierName || '—' },
                { label: 'Current Status', value: rowActionState.record.status, highlight: true },
              ]
            : []
        }
        onConfirm={executeRowAction}
        onCancel={() => setRowActionState((prev) => ({ ...prev, phase: 'idle' }))}
        onOk={() => setRowActionState((prev) => ({ ...prev, phase: 'idle' }))}
      />
    </div>
  );
};

export default MaterialReceiptManagement;