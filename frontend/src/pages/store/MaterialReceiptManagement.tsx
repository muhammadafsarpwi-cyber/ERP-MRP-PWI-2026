import React, { useState, useEffect, useCallback } from 'react';
import {
  Card, Table, Button, Space, Modal, Form, Input, Select, Tag, App, DatePicker, Row, Col, Drawer, Descriptions, Spin,
} from 'antd';
import { PlusOutlined, ArrowDownOutlined, SearchOutlined, CheckOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import apiService from '../../services/api';
import { usePermission } from '../../hooks/usePermission';
import PageHeader from '../../components/shared/PageHeader';
import StoreLineItemsEditor, { StoreLineItem } from './components/StoreLineItemsEditor';

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
      await apiService.post('/store/receipts', payload);
      message.success('Material receipt created');
      setModalVisible(false);
      fetchData(page);
    } catch (err: any) {
      const msg: any = err?.response?.data?.message;
      message.error(Array.isArray(msg) ? msg[0] : 'Failed to create material receipt');
    }
  };

  const handleAction = (id: string, action: string) => {
    const confirmMap: Record<string, string> = {
      accept: 'Accepting this receipt approves the received quantities for stock posting.',
      post: 'Posting this receipt will add the accepted quantities into store/inventory stock. Continue?',
      reject: 'Rejecting this receipt cancels the received quantities.',
    };
    modal.confirm({
      title: `Confirm ${action[0].toUpperCase()}${action.slice(1)}`,
      content: confirmMap[action] || 'Continue with this action?',
      okText: action[0].toUpperCase() + action.slice(1),
      okButtonProps: { danger: action === 'reject' },
      onOk: async () => {
        try {
          await apiService.patch(`/store/receipts/${id}/${action}`);
          message.success(`Material receipt ${action}ed successfully`);
          fetchData(page);
          setDetailOpen(false);
        } catch (err: any) {
          message.error(err?.response?.data?.message || `Failed to ${action} receipt`);
        }
      },
    });
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
      title: 'Actions', key: 'actions', width: 300, fixed: 'right',
      render: (_, record) => (
        <Space wrap size={4}>
          <Button size="small" onClick={() => openDetail(record)}>View</Button>
          {record.status === 'RECEIVED' && canInspect && <Button size="small" type="primary" onClick={() => handleAction(record.id, 'inspect')}>Inspect</Button>}
          {record.status === 'INSPECTION' && canInspect && <Button size="small" type="primary" icon={<CheckOutlined />} onClick={() => handleAction(record.id, 'accept')}>Accept</Button>}
          {record.status === 'INSPECTION' && canInspect && <Button size="small" danger onClick={() => handleAction(record.id, 'reject')}>Reject</Button>}
          {record.status === 'ACCEPTED' && canPost && <Button size="small" type="primary" onClick={() => handleAction(record.id, 'post')}>Post to Stock</Button>}
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
      <div style={{ padding: '0 24px' }}>
        <Card>
          <Row gutter={16} style={{ marginBottom: 16 }}>
            <Col span={8}>
              <Input placeholder="Search receipts..." prefix={<SearchOutlined />} value={search} onChange={(e) => setSearch(e.target.value)} onPressEnter={() => fetchData(1)} />
            </Col>
            <Col span={6}>
              <Select placeholder="Filter by status" allowClear style={{ width: '100%' }} value={filterStatus} onChange={setFilterStatus}>
                {STATUS_OPTIONS.map((s) => <Select.Option key={s} value={s}>{s}</Select.Option>)}
              </Select>
            </Col>
            <Col span={4}>
              <Button onClick={() => fetchData(1)}>Search</Button>
            </Col>
          </Row>
          <Table columns={columns} dataSource={data} rowKey="id" loading={loading} scroll={{ x: 1100 }}
            pagination={{ current: page, total, pageSize, showSizeChanger: false, onChange: setPage }} />
        </Card>
      </div>

      <Modal title="New Material Receipt" open={modalVisible}
        onOk={handleSubmit} onCancel={() => setModalVisible(false)} width={900} destroyOnHidden>
        <Form form={form} layout="vertical">
          <Form.Item name="companyId" hidden><Input /></Form.Item>
          <Row gutter={16}>
            <Col span={8}>
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
            <StoreLineItemsEditor mode="issue" value={lineItems} onChange={setLineItems} label="Receipt Items" />
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
    </div>
  );
};

export default MaterialReceiptManagement;