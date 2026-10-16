import React, { useState, useEffect, useCallback } from 'react';
import {
  Table, Button, Space, Tag, Form, Input, Select, App, Card,
  Row, Col, DatePicker, Segmented,
} from 'antd';
import {
  PlusOutlined, EditOutlined, SearchOutlined, SendOutlined, StopOutlined,
  ReloadOutlined, ApartmentOutlined, ShopOutlined, GlobalOutlined,
  FileSearchOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import apiService from '../../services/api';
import { ERPLineItems, ERPLine, DraggableResizableModal } from '../../components/shared';

interface Rfq {
  id: string;
  rfqCode: string;
  title?: string;
  supplierName?: string;
  issueDate?: string;
  dueDate?: string;
  divisionId?: string;
  divisionName?: string;
  warehouseId?: string;
  warehouseName?: string;
  purchaseType?: string;
  status: string;
}

interface DropdownOption { id: string; name: string; }
interface DivisionOption { id: string; code?: string; name: string; }

const DEFAULT_DIVISIONS: DivisionOption[] = [
  { id: 'div-wd', code: 'WD', name: 'Wire Drawing Division' },
  { id: 'div-galv', code: 'GALV', name: 'Galvanizing Division' },
  { id: 'div-spk', code: 'SPK', name: 'Spoke Plant Division' },
  { id: 'div-ccd', code: 'CCD', name: 'Control Cable Division' },
  { id: 'div-nail', code: 'NAIL', name: 'Nail & Fastener Division' },
  { id: 'div-corp', code: 'CORP', name: 'Corporate & Master Store' },
];

const STATUS_OPTIONS = ['DRAFT', 'SENT', 'PARTIAL_RESPONSE', 'RESPONSE_RECEIVED', 'EVALUATED', 'CANCELLED'];

const statusColorMap: Record<string, string> = {
  DRAFT: 'default', SENT: 'blue', PARTIAL_RESPONSE: 'orange',
  RESPONSE_RECEIVED: 'cyan', EVALUATED: 'green', CANCELLED: 'red',
};

const RfqManagement: React.FC = () => {
  const { message } = App.useApp();
  const [data, setData] = useState<Rfq[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [modalVisible, setModalVisible] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [editingItem, setEditingItem] = useState<Rfq | null>(null);
  const [form] = Form.useForm();
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<string | undefined>(undefined);
  const [pageSize] = useState(20);
  const [suppliers, setSuppliers] = useState<DropdownOption[]>([]);
  const [divisions, setDivisions] = useState<DivisionOption[]>(DEFAULT_DIVISIONS);
  const [warehouses, setWarehouses] = useState<Array<{ id: string; warehouseCode: string; name: string; warehouseType?: string }>>([]);
  const [lineItems, setLineItems] = useState<ERPLine[]>([]);
  const [companyId, setCompanyId] = useState('');

  const watchedDivisionId = Form.useWatch('divisionId', form);
  const watchedWarehouseId = Form.useWatch('warehouseId', form);
  const selectedWarehouse = warehouses.find((w) => w.id === watchedWarehouseId);

  useEffect(() => {
    const erpUser = localStorage.getItem('erp_user');
    if (erpUser) {
      try { const p = JSON.parse(erpUser); if (p?.defaultCompanyId) setCompanyId(p.defaultCompanyId); } catch { /* ignore */ }
    }
  }, []);

  const fetchData = useCallback(async (pageNum: number = 1) => {
    setLoading(true);
    try {
      const params: any = { page: pageNum, limit: pageSize };
      if (search) params.search = search;
      if (filterStatus) params.status = filterStatus;
      const response = await apiService.get<{ data: Rfq[]; total: number }>('/procurement/rfqs', params);
      setData(response.data || []);
      setTotal(response.total || 0);
    } catch {
      message.error('Failed to fetch RFQs');
    } finally {
      setLoading(false);
    }
  }, [search, filterStatus, pageSize, message]);

  const fetchMasters = useCallback(async () => {
    try {
      const res = await apiService.get<{ data: DropdownOption[] }>('/procurement/suppliers', { limit: 200 });
      setSuppliers(res.data || []);
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
  }, []);

  useEffect(() => { fetchMasters(); }, [fetchMasters]);
  useEffect(() => { fetchData(page); }, [page, fetchData]);

  const generateRfqCode = useCallback(() => {
    const currentYear = new Date().getFullYear();
    const nextSeq = (total || data.length || 0) + 1;
    return `RFQ-${currentYear}-${String(nextSeq).padStart(4, '0')}`;
  }, [total, data.length]);

  const handleCreate = () => {
    setEditingItem(null);
    form.resetFields();
    form.setFieldsValue({
      rfqCode: generateRfqCode(),
      purchaseType: 'LOCAL',
      issueDate: dayjs(),
      dueDate: dayjs().add(14, 'day'),
    });
    setLineItems([]);
    setModalVisible(true);
  };

  const handleEdit = (record: Rfq) => {
    setEditingItem(record);
    form.setFieldsValue({
      ...record,
      issueDate: record.issueDate ? dayjs(record.issueDate) : undefined,
      dueDate: record.dueDate ? dayjs(record.dueDate) : undefined,
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
        issueDate: values.issueDate ? dayjs(values.issueDate).format('YYYY-MM-DD') : undefined,
        dueDate: values.dueDate ? dayjs(values.dueDate).format('YYYY-MM-DD') : undefined,
        lines: lineItems.map((l, i) => ({
          lineNumber: i + 1,
          itemId: l.itemId,
          uomId: l.uomId,
          quantity: Number(l.quantity || 0),
          notes: l.itemName || l.itemCode,
        })),
      };
      if (editingItem) {
        await apiService.patch(`/procurement/rfqs/${editingItem.id}`, payload);
        message.success('RFQ updated');
      } else {
        await apiService.post('/procurement/rfqs', payload);
        message.success(`RFQ ${values.rfqCode} created`);
      }
      setModalVisible(false);
      fetchData(page);
    } catch (error: any) {
      const msg = error?.response?.data?.message;
      message.error(Array.isArray(msg) ? msg[0] : 'Failed to save RFQ');
    } finally {
      setSubmitting(false);
    }
  };

  const handleAction = async (id: string, action: string) => {
    try {
      await apiService.patch(`/procurement/rfqs/${id}/${action}`);
      message.success(`RFQ ${action}ed successfully`);
      fetchData(page);
    } catch {
      message.error(`Failed to ${action} RFQ`);
    }
  };

  const columns: ColumnsType<Rfq> = [
    {
      title: 'RFQ Code',
      dataIndex: 'rfqCode',
      key: 'rfqCode',
      width: 140,
      render: (code) => <span style={{ fontWeight: 700, fontFamily: 'monospace', color: '#38bdf8' }}>{code}</span>,
    },
    {
      title: 'Title',
      dataIndex: 'title',
      key: 'title',
      width: 240,
      render: (t) => <span style={{ fontWeight: 600 }}>{t || '—'}</span>,
    },
    { title: 'Supplier', dataIndex: 'supplierName', key: 'supplierName', width: 170 },
    {
      title: 'Issue Date',
      dataIndex: 'issueDate',
      key: 'issueDate',
      width: 110,
      render: (d) => d ? dayjs(d).format('DD/MM/YYYY') : '—',
    },
    {
      title: 'Due Date',
      dataIndex: 'dueDate',
      key: 'dueDate',
      width: 110,
      render: (d) => d ? dayjs(d).format('DD/MM/YYYY') : '—',
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
          {record.status === 'DRAFT' && <Button size="small" type="primary" icon={<SendOutlined />} onClick={() => handleAction(record.id, 'send')}>Send</Button>}
          {record.status !== 'CANCELLED' && record.status !== 'SENT' && <Button size="small" danger icon={<StopOutlined />} onClick={() => handleAction(record.id, 'cancel')}>Cancel</Button>}
        </Space>
      ),
    },
  ];

  return (
    <Card
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <FileSearchOutlined style={{ fontSize: 20, color: '#f59e0b' }} />
          <span>Request for Quotations (RFQ)</span>
        </div>
      }
      extra={
        <Space>
          <Button icon={<ReloadOutlined />} onClick={() => fetchData(page)}>Refresh</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate} style={{ fontWeight: 600 }}>Create RFQ</Button>
        </Space>
      }
    >
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={8}>
          <Input placeholder="Search RFQs..." prefix={<SearchOutlined />} value={search} onChange={(e) => setSearch(e.target.value)} onPressEnter={() => fetchData(1)} allowClear />
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
        title={editingItem ? `Edit RFQ (${editingItem.rfqCode})` : 'Create Request for Quotation (RFQ)'}
        subtitle="📑 Solicit competitive quotations from vendors with division routing, live stock inspection & delivery dates"
        open={modalVisible}
        onCancel={() => setModalVisible(false)}
        width={1120}
        height={760}
        footer={[
          <Button key="cancel" onClick={() => setModalVisible(false)}>Cancel</Button>,
          <Button key="submit" type="primary" loading={submitting} onClick={handleSubmit} style={{ fontWeight: 600 }}>
            {editingItem ? 'Update RFQ' : 'Create & Save RFQ'}
          </Button>,
        ]}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="companyId" hidden><Input /></Form.Item>

          <Card size="small" style={{ marginBottom: 14, background: 'rgba(255, 255, 255, 0.02)', borderColor: 'rgba(255, 255, 255, 0.1)' }}>
            <Row gutter={16}>
              <Col span={6}>
                <Form.Item name="rfqCode" label={<span style={{ fontWeight: 600 }}>RFQ Code <Tag color="blue">Auto RFQ</Tag></span>} rules={[{ required: true }]}>
                  <Input style={{ fontWeight: 700, fontFamily: 'monospace' }} />
                </Form.Item>
              </Col>
              <Col span={8}>
                <Form.Item name="title" label={<span style={{ fontWeight: 600 }}>Title / Subject</span>}>
                  <Input placeholder="e.g. Inquiries for Nipple & Spoke Galvanized Wire" />
                </Form.Item>
              </Col>
              <Col span={6}>
                <Form.Item name="supplierId" label={<span style={{ fontWeight: 600 }}>Supplier</span>} rules={[{ required: true }]}>
                  <Select showSearch optionFilterProp="label" placeholder="Select supplier..." options={suppliers.map((s) => ({ value: s.id, label: s.name }))} />
                </Form.Item>
              </Col>
              <Col span={4}>
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
                <Form.Item name="issueDate" label={<span style={{ fontWeight: 600 }}>Issue Date</span>}>
                  <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
                </Form.Item>
              </Col>
              <Col span={6}>
                <Form.Item name="dueDate" label={<span style={{ fontWeight: 600 }}>Due Date</span>}>
                  <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
                </Form.Item>
              </Col>
            </Row>
          </Card>

          <Form.Item name="description" label={<span style={{ fontWeight: 600 }}>Description / RFQ Scope</span>}>
            <Input.TextArea rows={2} placeholder="Scope, technical specs, or bidding requirements..." />
          </Form.Item>

          <ERPLineItems
            companyId={companyId}
            value={lineItems}
            onChange={setLineItems}
            context="purchase"
            isPurchasable={true}
            divisionId={watchedDivisionId}
            warehouseId={watchedWarehouseId}
            warehouseType={selectedWarehouse?.warehouseType}
            label="RFQ Items"
            showDiscount={false}
            showTax={false}
            showAvailability={true}
          />
        </Form>
      </DraggableResizableModal>
    </Card>
  );
};

export default RfqManagement;
