import React, { useState, useEffect, useCallback } from 'react';
import {
  Table, Button, Space, Tag, Form, Input, Select, App, Card,
  Row, Col, DatePicker, Segmented,
} from 'antd';
import {
  PlusOutlined, SearchOutlined, CheckOutlined, SendOutlined,
  ReloadOutlined, ApartmentOutlined, ShopOutlined, GlobalOutlined,
  RollbackOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import apiService from '../../services/api';
import { ERPLineItems, ERPLine, DraggableResizableModal } from '../../components/shared';

interface PurchaseReturn {
  id: string;
  returnCode: string;
  poCode?: string;
  supplierId?: string;
  supplierName?: string;
  divisionId?: string;
  divisionName?: string;
  warehouseId?: string;
  warehouseName?: string;
  purchaseType?: string;
  returnDate?: string;
  status: string;
  reason?: string;
  notes?: string;
}

interface DivisionOption { id: string; code?: string; name: string; }

const DEFAULT_DIVISIONS: DivisionOption[] = [
  { id: 'div-wd', code: 'WD', name: 'Wire Drawing Division' },
  { id: 'div-galv', code: 'GALV', name: 'Galvanizing Division' },
  { id: 'div-spk', code: 'SPK', name: 'Spoke Plant Division' },
  { id: 'div-ccd', code: 'CCD', name: 'Control Cable Division' },
  { id: 'div-nail', code: 'NAIL', name: 'Nail & Fastener Division' },
  { id: 'div-corp', code: 'CORP', name: 'Corporate & Master Store' },
];

const STATUS_OPTIONS = ['DRAFT', 'APPROVED', 'SHIPPED', 'RECEIVED_BY_SUPPLIER', 'COMPLETED', 'CANCELLED'];

const statusColorMap: Record<string, string> = {
  DRAFT: 'default', APPROVED: 'green', SHIPPED: 'blue',
  RECEIVED_BY_SUPPLIER: 'cyan', COMPLETED: 'purple', CANCELLED: 'red',
};

const PurchaseReturnManagement: React.FC = () => {
  const { message } = App.useApp();
  const [data, setData] = useState<PurchaseReturn[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [modalVisible, setModalVisible] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form] = Form.useForm();
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<string | undefined>(undefined);
  const [pageSize] = useState(20);
  const [lineItems, setLineItems] = useState<ERPLine[]>([]);
  const [companyId, setCompanyId] = useState('');
  const [suppliers, setSuppliers] = useState<Array<{ id: string; name: string }>>([]);
  const [divisions, setDivisions] = useState<DivisionOption[]>(DEFAULT_DIVISIONS);
  const [warehouses, setWarehouses] = useState<Array<{ id: string; warehouseCode: string; name: string; warehouseType?: string }>>([]);

  const watchedDivisionId = Form.useWatch('divisionId', form);
  const watchedWarehouseId = Form.useWatch('warehouseId', form);
  const selectedWarehouse = warehouses.find((w) => w.id === watchedWarehouseId);

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
        const w = await apiService.get<any>('/organization/warehouses', { limit: 100 });
        const items = Array.isArray(w) ? w : w?.data?.items || w?.items || w?.data || [];
        setWarehouses(items);
      } catch { /* ignore */ }
      try {
        const d = await apiService.get<any>('/divisions', { limit: 50 });
        const divItems = Array.isArray(d) ? d : d?.data?.items || d?.data || [];
        if (divItems.length > 0) {
          setDivisions(divItems.map((x: any) => ({ id: x.id, code: x.divisionCode, name: x.name })));
        }
      } catch { /* keep defaults */ }
    })();
  }, []);

  const fetchData = useCallback(async (pageNum: number = 1) => {
    setLoading(true);
    try {
      const params: any = { page: pageNum, limit: pageSize };
      if (search) params.search = search;
      if (filterStatus) params.status = filterStatus;
      const response = await apiService.get<{ data: PurchaseReturn[]; total: number }>('/procurement/returns', params);
      setData(response.data || []);
      setTotal(response.total || 0);
    } catch {
      message.error('Failed to fetch purchase returns');
    } finally {
      setLoading(false);
    }
  }, [search, filterStatus, pageSize, message]);

  useEffect(() => { fetchData(page); }, [page, fetchData]);

  const generateReturnCode = useCallback(() => {
    const currentYear = new Date().getFullYear();
    const nextSeq = (total || data.length || 0) + 1;
    return `PRT-${currentYear}-${String(nextSeq).padStart(4, '0')}`;
  }, [total, data.length]);

  const handleCreate = () => {
    form.resetFields();
    form.setFieldsValue({
      returnCode: generateReturnCode(),
      purchaseType: 'LOCAL',
      returnDate: dayjs(),
    });
    setLineItems([]);
    setModalVisible(true);
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      if (lineItems.length === 0) {
        message.warning('Add at least one line item to return');
        return;
      }
      setSubmitting(true);
      const payload = {
        ...values,
        companyId: companyId || values.companyId,
        returnDate: values.returnDate ? dayjs(values.returnDate).format('YYYY-MM-DD') : undefined,
        lines: lineItems.map((l) => ({
          itemId: l.itemId,
          uomId: l.uomId,
          quantity: Number(l.quantity || 0),
          unitPrice: Number(l.rate || 0),
          reason: l.itemName || l.itemCode,
        })),
      };
      await apiService.post('/procurement/returns', payload);
      message.success(`Purchase Return ${values.returnCode} created`);
      setModalVisible(false);
      fetchData(page);
    } catch (error: any) {
      const msg = error?.response?.data?.message;
      message.error(Array.isArray(msg) ? msg[0] : 'Failed to create purchase return');
    } finally {
      setSubmitting(false);
    }
  };

  const handleAction = async (id: string, action: string) => {
    try {
      await apiService.patch(`/procurement/returns/${id}/${action}`);
      message.success(`Purchase return marked as ${action}ed`);
      fetchData(page);
    } catch {
      message.error(`Failed to ${action} purchase return`);
    }
  };

  const columns: ColumnsType<PurchaseReturn> = [
    {
      title: 'Return Code',
      dataIndex: 'returnCode',
      key: 'returnCode',
      width: 140,
      render: (code) => <span style={{ fontWeight: 700, fontFamily: 'monospace', color: '#ef4444' }}>{code}</span>,
    },
    { title: 'PO', dataIndex: 'poCode', key: 'poCode', width: 130 },
    { title: 'Supplier', dataIndex: 'supplierName', key: 'supplierName', width: 180 },
    {
      title: 'Return Date',
      dataIndex: 'returnDate',
      key: 'returnDate',
      width: 120,
      render: (d) => d ? dayjs(d).format('DD/MM/YYYY') : '—',
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 150,
      render: (status: string) => <Tag color={statusColorMap[status] || 'default'} style={{ fontWeight: 700 }}>{status}</Tag>,
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 220,
      render: (_, record) => (
        <Space size="small">
          {record.status === 'DRAFT' && <Button size="small" type="primary" icon={<CheckOutlined />} onClick={() => handleAction(record.id, 'approve')}>Approve</Button>}
          {record.status === 'APPROVED' && <Button size="small" type="primary" icon={<SendOutlined />} onClick={() => handleAction(record.id, 'ship')}>Ship</Button>}
        </Space>
      ),
    },
  ];

  return (
    <Card
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <RollbackOutlined style={{ fontSize: 20, color: '#ef4444' }} />
          <span>Purchase Returns</span>
        </div>
      }
      extra={
        <Space>
          <Button icon={<ReloadOutlined />} onClick={() => fetchData(page)}>Refresh</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate} style={{ fontWeight: 600 }}>Create Return</Button>
        </Space>
      }
    >
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={8}>
          <Input placeholder="Search returns, PO..." prefix={<SearchOutlined />} value={search} onChange={(e) => setSearch(e.target.value)} onPressEnter={() => fetchData(1)} allowClear />
        </Col>
        <Col span={6}>
          <Select placeholder="Filter by status" allowClear style={{ width: '100%' }} value={filterStatus} onChange={setFilterStatus}>
            {STATUS_OPTIONS.map(s => <Select.Option key={s} value={s}>{s}</Select.Option>)}
          </Select>
        </Col>
        <Col span={4}>
          <Button type="primary" onClick={() => fetchData(1)}>Search</Button>
        </Col>
      </Row>

      <Table columns={columns} dataSource={data} rowKey="id" loading={loading}
        pagination={{ current: page, total, pageSize, onChange: setPage, showSizeChanger: false }} />

      <DraggableResizableModal
        title="Create Purchase Return"
        subtitle="↩️ Process vendor material returns with store inventory tracking, division scoping and supplier debit adjustments"
        open={modalVisible}
        onCancel={() => setModalVisible(false)}
        width={1120}
        height={760}
        footer={[
          <Button key="cancel" onClick={() => setModalVisible(false)}>Cancel</Button>,
          <Button key="submit" type="primary" loading={submitting} onClick={handleSubmit} style={{ fontWeight: 600 }}>
            Create & Save Return
          </Button>,
        ]}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="companyId" hidden><Input /></Form.Item>

          <Card size="small" style={{ marginBottom: 14, background: 'rgba(255, 255, 255, 0.02)', borderColor: 'rgba(255, 255, 255, 0.1)' }}>
            <Row gutter={16}>
              <Col span={6}>
                <Form.Item name="returnCode" label={<span style={{ fontWeight: 600 }}>Return Code <Tag color="blue">Auto PRT</Tag></span>} rules={[{ required: true }]}>
                  <Input style={{ fontWeight: 700, fontFamily: 'monospace' }} />
                </Form.Item>
              </Col>
              <Col span={6}>
                <Form.Item name="supplierId" label={<span style={{ fontWeight: 600 }}>Supplier</span>} rules={[{ required: true }]}>
                  <Select showSearch optionFilterProp="label" placeholder="Select supplier..." options={suppliers.map((s) => ({ value: s.id, label: s.name }))} />
                </Form.Item>
              </Col>
              <Col span={6}>
                <Form.Item name="poId" label={<span style={{ fontWeight: 600 }}>PO Reference</span>}>
                  <Input placeholder="e.g. PO-2026-0001" />
                </Form.Item>
              </Col>
              <Col span={6}>
                <Form.Item name="purchaseType" label={<span style={{ fontWeight: 600 }}><GlobalOutlined style={{ marginRight: 4 }} />Origin</span>} initialValue="LOCAL">
                  <Segmented block options={[{ label: 'Local', value: 'LOCAL' }, { label: 'Import', value: 'IMPORT' }]} />
                </Form.Item>
              </Col>
            </Row>

            <Row gutter={16}>
              <Col span={6}>
                <Form.Item name="divisionId" label={<span style={{ fontWeight: 600 }}><ApartmentOutlined style={{ marginRight: 4, color: '#10b981' }} />Division</span>}>
                  <Select placeholder="Select division..." allowClear options={divisions.map((d) => ({ value: d.id, label: `${d.code ? `[${d.code}] ` : ''}${d.name}` }))} />
                </Form.Item>
              </Col>
              <Col span={6}>
                <Form.Item name="warehouseId" label={<span style={{ fontWeight: 600 }}><ShopOutlined style={{ marginRight: 4, color: '#f59e0b' }} />Dispatch Store</span>}>
                  <Select placeholder="Select warehouse..." allowClear options={warehouses.map((w) => ({ value: w.id, label: `${w.warehouseCode} — ${w.name}` }))} />
                </Form.Item>
              </Col>
              <Col span={6}>
                <Form.Item name="returnDate" label={<span style={{ fontWeight: 600 }}>Return Date</span>}>
                  <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
                </Form.Item>
              </Col>
              <Col span={6}>
                <Form.Item name="reason" label={<span style={{ fontWeight: 600 }}>Return Reason</span>}>
                  <Input placeholder="e.g. Quality defect, wrong specification" />
                </Form.Item>
              </Col>
            </Row>
          </Card>

          <ERPLineItems
            companyId={companyId}
            value={lineItems}
            onChange={setLineItems}
            context="purchase"
            isPurchasable={true}
            divisionId={watchedDivisionId}
            warehouseId={watchedWarehouseId}
            warehouseType={selectedWarehouse?.warehouseType}
            label="Return Items"
            showAvailability={true}
          />

          <Row gutter={16} style={{ marginTop: 12 }}>
            <Col span={24}>
              <Form.Item name="notes" label={<span style={{ fontWeight: 600 }}>Return Notes</span>}>
                <Input.TextArea rows={2} placeholder="Gate pass ref, return authorization number, carrier details..." />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </DraggableResizableModal>
    </Card>
  );
};

export default PurchaseReturnManagement;
