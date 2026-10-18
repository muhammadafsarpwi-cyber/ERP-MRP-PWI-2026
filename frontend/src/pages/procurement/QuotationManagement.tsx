import React, { useState, useEffect, useCallback } from 'react';
import {
  Table, Button, Space, Tag, Form, Input, Select, App, Card,
  InputNumber, Row, Col, DatePicker, Segmented,
} from 'antd';
import {
  PlusOutlined, EditOutlined, SearchOutlined, CheckOutlined, CloseOutlined,
  ReloadOutlined, ApartmentOutlined, ShopOutlined, GlobalOutlined,
  DollarCircleOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import apiService from '../../services/api';
import { formatDecimal } from '../../utils/numberFormat';
import { ERPLineItems, ERPLine, DraggableResizableModal } from '../../components/shared';

interface Quotation {
  id: string;
  quotationCode: string;
  supplierId?: string;
  supplierName?: string;
  rfqCode?: string;
  divisionId?: string;
  divisionName?: string;
  warehouseId?: string;
  warehouseName?: string;
  purchaseType?: string;
  quotationDate?: string;
  validUntil?: string;
  totalAmount: number;
  status: string;
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

const STATUS_OPTIONS = ['DRAFT', 'RECEIVED', 'EVALUATED', 'SELECTED', 'REJECTED', 'EXPIRED'];

const statusColorMap: Record<string, string> = {
  DRAFT: 'default', RECEIVED: 'blue', EVALUATED: 'purple',
  SELECTED: 'green', REJECTED: 'red', EXPIRED: 'orange',
};

const QuotationManagement: React.FC = () => {
  const { message } = App.useApp();
  const [data, setData] = useState<Quotation[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [modalVisible, setModalVisible] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [editingItem, setEditingItem] = useState<Quotation | null>(null);
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
        let items: any[] = [];
        try {
          const w = await apiService.get<any>('/warehouses', { limit: 100 });
          items = Array.isArray(w) ? w : w?.data?.items || w?.items || w?.data || [];
        } catch {
          const w2 = await apiService.get<any>('/organization/warehouses', { limit: 100 });
          items = Array.isArray(w2) ? w2 : w2?.data?.items || w2?.items || w2?.data || [];
        }
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
      const response = await apiService.get<{ data: Quotation[]; total: number }>('/procurement/quotations', params);
      setData(response.data || []);
      setTotal(response.total || 0);
    } catch {
      message.error('Failed to fetch quotations');
    } finally {
      setLoading(false);
    }
  }, [search, filterStatus, pageSize, message]);

  useEffect(() => { fetchData(page); }, [page, fetchData]);

  const generateQuotationCode = useCallback(() => {
    const currentYear = new Date().getFullYear();
    const nextSeq = (total || data.length || 0) + 1;
    return `QT-${currentYear}-${String(nextSeq).padStart(4, '0')}`;
  }, [total, data.length]);

  const handleCreate = () => {
    setEditingItem(null);
    form.resetFields();
    form.setFieldsValue({
      quotationCode: generateQuotationCode(),
      purchaseType: 'LOCAL',
      quotationDate: dayjs(),
      validUntil: dayjs().add(30, 'day'),
    });
    setLineItems([]);
    setModalVisible(true);
  };

  const handleEdit = (record: Quotation) => {
    setEditingItem(record);
    form.setFieldsValue({
      ...record,
      quotationDate: record.quotationDate ? dayjs(record.quotationDate) : undefined,
      validUntil: record.validUntil ? dayjs(record.validUntil) : undefined,
      purchaseType: record.purchaseType || 'LOCAL',
    });
    setModalVisible(true);
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      if (lineItems.length === 0) {
        message.warning('Add at least one line item');
        return;
      }
      setSubmitting(true);
      const payload = {
        ...values,
        companyId: companyId || values.companyId,
        quotationDate: values.quotationDate ? dayjs(values.quotationDate).format('YYYY-MM-DD') : undefined,
        validUntil: values.validUntil ? dayjs(values.validUntil).format('YYYY-MM-DD') : undefined,
        lines: lineItems.map((l, i) => ({
          lineNumber: i + 1,
          itemId: l.itemId,
          uomId: l.uomId,
          quantity: Number(l.quantity || 0),
          unitPrice: Number(l.rate || 0),
          discountPercent: Number(l.discountPercent || 0),
          taxPercent: Number(l.taxPercent || 18),
          lineTotal: Number(l.lineTotal || 0),
        })),
      };
      if (editingItem) {
        await apiService.patch(`/procurement/quotations/${editingItem.id}`, payload);
        message.success('Quotation updated');
      } else {
        await apiService.post('/procurement/quotations', payload);
        message.success(`Quotation ${values.quotationCode} created`);
      }
      setModalVisible(false);
      fetchData(page);
    } catch (error: any) {
      const msg = error?.response?.data?.message;
      message.error(Array.isArray(msg) ? msg[0] : 'Failed to save quotation');
    } finally {
      setSubmitting(false);
    }
  };

  const handleAction = async (id: string, action: string) => {
    try {
      await apiService.patch(`/procurement/quotations/${id}/${action}`);
      message.success(`Quotation ${action}ed successfully`);
      fetchData(page);
    } catch {
      message.error(`Failed to ${action} quotation`);
    }
  };

  const columns: ColumnsType<Quotation> = [
    {
      title: 'Quotation Code',
      dataIndex: 'quotationCode',
      key: 'quotationCode',
      width: 140,
      render: (code) => <span style={{ fontWeight: 700, fontFamily: 'monospace', color: '#38bdf8' }}>{code}</span>,
    },
    { title: 'Supplier', dataIndex: 'supplierName', key: 'supplierName', width: 180 },
    { title: 'RFQ', dataIndex: 'rfqCode', key: 'rfqCode', width: 130 },
    {
      title: 'Quotation Date',
      dataIndex: 'quotationDate',
      key: 'quotationDate',
      width: 120,
      render: (d) => d ? dayjs(d).format('DD/MM/YYYY') : '—',
    },
    {
      title: 'Valid Until',
      dataIndex: 'validUntil',
      key: 'validUntil',
      width: 120,
      render: (d) => d ? dayjs(d).format('DD/MM/YYYY') : '—',
    },
    {
      title: 'Total Amount',
      dataIndex: 'totalAmount',
      key: 'totalAmount',
      width: 130,
      render: (amount: number) => `PKR ${formatDecimal(amount || 0)}`,
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 140,
      render: (status: string) => <Tag color={statusColorMap[status] || 'default'} style={{ fontWeight: 700 }}>{status}</Tag>,
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 200,
      render: (_, record) => (
        <Space size="small">
          <Button size="small" icon={<EditOutlined />} onClick={() => handleEdit(record)} disabled={record.status !== 'DRAFT'} />
          {record.status === 'EVALUATED' && <Button size="small" type="primary" icon={<CheckOutlined />} onClick={() => handleAction(record.id, 'select')}>Select</Button>}
          {record.status !== 'REJECTED' && record.status !== 'SELECTED' && <Button size="small" danger icon={<CloseOutlined />} onClick={() => handleAction(record.id, 'reject')}>Reject</Button>}
        </Space>
      ),
    },
  ];

  return (
    <Card
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <DollarCircleOutlined style={{ fontSize: 20, color: '#38bdf8' }} />
          <span>Vendor Quotations</span>
        </div>
      }
      extra={
        <Space>
          <Button icon={<ReloadOutlined />} onClick={() => fetchData(page)}>Refresh</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate} style={{ fontWeight: 600 }}>Create Quotation</Button>
        </Space>
      }
    >
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={8}>
          <Input placeholder="Search quotations, RFQ..." prefix={<SearchOutlined />} value={search} onChange={(e) => setSearch(e.target.value)} onPressEnter={() => fetchData(1)} allowClear />
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
        title={editingItem ? `Edit Quotation (${editingItem.quotationCode})` : 'Create Vendor Quotation'}
        subtitle="💰 Manage supplier quotes with positive stock replenishment view, division routing and full pricing evaluation"
        open={modalVisible}
        onCancel={() => setModalVisible(false)}
        width={1120}
        height={760}
        footer={[
          <Button key="cancel" onClick={() => setModalVisible(false)}>Cancel</Button>,
          <Button key="submit" type="primary" loading={submitting} onClick={handleSubmit} style={{ fontWeight: 600 }}>
            {editingItem ? 'Update Quotation' : 'Create & Save Quotation'}
          </Button>,
        ]}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="companyId" hidden><Input /></Form.Item>

          <Card size="small" style={{ marginBottom: 14, background: 'rgba(255, 255, 255, 0.02)', borderColor: 'rgba(255, 255, 255, 0.1)' }}>
            <Row gutter={16}>
              <Col span={6}>
                <Form.Item name="quotationCode" label={<span style={{ fontWeight: 600 }}>Quotation Code <Tag color="blue">Auto QT</Tag></span>} rules={[{ required: true }]}>
                  <Input style={{ fontWeight: 700, fontFamily: 'monospace' }} />
                </Form.Item>
              </Col>
              <Col span={6}>
                <Form.Item name="supplierId" label={<span style={{ fontWeight: 600 }}>Supplier</span>} rules={[{ required: true }]}>
                  <Select showSearch optionFilterProp="label" placeholder="Select supplier..." options={suppliers.map((s) => ({ value: s.id, label: s.name }))} />
                </Form.Item>
              </Col>
              <Col span={6}>
                <Form.Item name="rfqId" label={<span style={{ fontWeight: 600 }}>RFQ Reference</span>}>
                  <Input placeholder="e.g. RFQ-2026-0001" />
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
                <Form.Item name="warehouseId" label={<span style={{ fontWeight: 600 }}><ShopOutlined style={{ marginRight: 4, color: '#f59e0b' }} />Target Warehouse / Store</span>}>
                  <Select placeholder="Select warehouse..." allowClear options={warehouses.map((w) => ({ value: w.id, label: `${w.warehouseCode} — ${w.name}` }))} />
                </Form.Item>
              </Col>
              <Col span={6}>
                <Form.Item name="quotationDate" label={<span style={{ fontWeight: 600 }}>Quotation Date</span>}>
                  <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
                </Form.Item>
              </Col>
              <Col span={6}>
                <Form.Item name="validUntil" label={<span style={{ fontWeight: 600 }}>Valid Until</span>}>
                  <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
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
            label="Quotation Items"
            showAvailability={true}
          />

          <Row gutter={16} style={{ marginTop: 12 }}>
            <Col span={24}>
              <Form.Item name="notes" label={<span style={{ fontWeight: 600 }}>Vendor Notes & Terms</span>}>
                <Input.TextArea rows={2} placeholder="Payment terms, delivery timeline, warranty, or validity notes..." />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </DraggableResizableModal>
    </Card>
  );
};

export default QuotationManagement;
