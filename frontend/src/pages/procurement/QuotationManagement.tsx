import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Table, Button, Space, Tag, Form, Input, Select, App, Card,
  InputNumber, Row, Col, DatePicker, Segmented, Badge,
} from 'antd';
import {
  PlusOutlined, EditOutlined, SearchOutlined, CheckOutlined, CloseOutlined,
  ReloadOutlined, ApartmentOutlined, ShopOutlined, GlobalOutlined,
  DollarCircleOutlined, ShoppingCartOutlined, FileDoneOutlined,
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
  supplier?: { id: string; name: string };
  rfqId?: string;
  rfqCode?: string;
  rfq?: { id: string; rfqCode: string; title?: string };
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
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
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
  const [activeTab, setActiveTab] = useState<'ALL' | 'RECEIVED' | 'EVALUATED' | 'SELECTED'>('ALL');
  const [pageSize] = useState(20);
  const [lineItems, setLineItems] = useState<ERPLine[]>([]);
  const [companyId, setCompanyId] = useState('');
  const [suppliers, setSuppliers] = useState<Array<{ id: string; name: string }>>([]);
  const [divisions, setDivisions] = useState<DivisionOption[]>(DEFAULT_DIVISIONS);
  const [warehouses, setWarehouses] = useState<Array<{ id: string; warehouseCode: string; name: string; warehouseType?: string }>>([]);
  const [rfqs, setRfqs] = useState<Array<{ id: string; rfqCode: string; title?: string; status: string }>>([]);

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
        const rRes = await apiService.get<any>('/procurement/rfqs', { limit: 200 });
        const rList = Array.isArray(rRes) ? rRes : rRes?.data || [];
        setRfqs(rList);
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
      if (activeTab === 'RECEIVED') {
        params.status = 'RECEIVED';
      } else if (activeTab === 'EVALUATED') {
        params.status = 'EVALUATED';
      } else if (activeTab === 'SELECTED') {
        params.status = 'SELECTED';
      } else if (filterStatus) {
        params.status = filterStatus;
      }
      const response = await apiService.get<{ data: Quotation[]; total: number }>('/procurement/quotations', params);
      setData(response.data || []);
      setTotal(response.total || 0);
    } catch {
      message.error('Failed to fetch quotations');
    } finally {
      setLoading(false);
    }
  }, [search, activeTab, filterStatus, pageSize, message]);

  // Stage counts for badges
  const [allQuotesForCounts, setAllQuotesForCounts] = useState<Quotation[]>([]);
  const fetchCounts = useCallback(async () => {
    try {
      const res = await apiService.get<{ data: Quotation[] }>('/procurement/quotations', { limit: 100 });
      setAllQuotesForCounts(res.data || []);
    } catch { /* ignore */ }
  }, []);

  const statusCounts = useMemo(() => {
    const list = allQuotesForCounts.length > 0 ? allQuotesForCounts : data;
    return {
      ALL: list.length,
      RECEIVED: list.filter(q => q.status === 'RECEIVED').length,
      EVALUATED: list.filter(q => q.status === 'EVALUATED').length,
      SELECTED: list.filter(q => q.status === 'SELECTED').length,
    };
  }, [allQuotesForCounts, data]);

  useEffect(() => { fetchCounts(); }, [fetchCounts]);
  useEffect(() => { fetchData(page); }, [page, fetchData]);

  const generateQuotationCode = useCallback(() => {
    const currentYear = new Date().getFullYear();
    const nextSeq = (total || data.length || 0) + 1;
    return `QT-${currentYear}-${String(nextSeq).padStart(4, '0')}`;
  }, [total, data.length]);

  const handleRfqChange = async (rfqId: string | null) => {
    if (!rfqId) return;
    try {
      const res = await apiService.get<any>(`/procurement/rfqs/${rfqId}`);
      const rfq = res?.data || res;
      if (!rfq) return;

      form.setFieldsValue({
        supplierId: rfq.supplierId,
        divisionId: rfq.divisionId,
        warehouseId: rfq.warehouseId,
        purchaseType: rfq.purchaseType || 'LOCAL',
        notes: `Quotation against RFQ: ${rfq.rfqCode}${rfq.title ? ` (${rfq.title})` : ''}`,
      });

      if (rfq.lines && Array.isArray(rfq.lines) && rfq.lines.length > 0) {
        const mappedLines: ERPLine[] = rfq.lines.map((l: any, i: number) => {
          const qty = Number(l.quantity || 0);
          return {
            id: `quote_line_${i}_${Date.now()}`,
            itemId: l.itemId,
            itemCode: l.item?.itemCode || l.itemCode || '',
            itemName: l.item?.name || l.notes || l.itemName || 'Raw Material',
            uomId: l.uomId,
            uomCode: l.uom?.code || l.uomCode || 'KG',
            quantity: qty,
            rate: 0,
            unitPrice: 0,
            discountPercent: 0,
            taxPercent: 18,
            lineTotal: 0,
            totalPrice: 0,
          };
        });
        setLineItems(mappedLines);
        message.success(`RFQ ${rfq.rfqCode} linked! ${mappedLines.length} item(s) loaded. Please enter supplier quoted rates.`);
      }
    } catch {
      message.error('Failed to load RFQ items');
    }
  };

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
          unitPrice: Number(l.rate || (l as any).unitPrice || 0),
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
      fetchCounts();
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
      fetchCounts();
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
    {
      title: 'Supplier',
      key: 'supplier',
      width: 200,
      render: (_, record: any) => {
        const name = record.supplier?.name || record.supplierName || suppliers.find(s => s.id === record.supplierId)?.name || '—';
        return <span style={{ fontWeight: 600 }}>{name}</span>;
      },
    },
    {
      title: 'RFQ',
      dataIndex: 'rfqCode',
      key: 'rfqCode',
      width: 130,
      render: (r, record: any) => <span style={{ fontFamily: 'monospace', color: '#94a3b8' }}>{r || record.rfq?.rfqCode || '—'}</span>,
    },
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
      width: 140,
      render: (amount: number) => (
        <span style={{ fontWeight: 700, color: '#10b981' }}>
          PKR {formatDecimal(amount || 0)}
        </span>
      ),
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 130,
      render: (status: string) => <Tag color={statusColorMap[status] || 'default'} style={{ fontWeight: 700 }}>{status}</Tag>,
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 250,
      render: (_, record) => (
        <Space size="small" wrap>
          <Button size="small" icon={<EditOutlined />} onClick={() => handleEdit(record)} disabled={record.status !== 'DRAFT'} />
          
          {(record.status === 'RECEIVED' || record.status === 'EVALUATED') && (
            <Button
              size="small"
              type="primary"
              icon={<CheckOutlined />}
              onClick={() => handleAction(record.id, 'select')}
              style={{ background: '#0284c7', borderColor: '#0284c7', fontWeight: 600 }}
            >
              Select Winner
            </Button>
          )}

          {record.status === 'SELECTED' && (
            <Button
              size="small"
              type="primary"
              style={{ background: '#10b981', borderColor: '#10b981', fontWeight: 700 }}
              icon={<ShoppingCartOutlined />}
              onClick={() => navigate(`/procurement/orders?quotationId=${record.id}`)}
            >
              Generate PO
            </Button>
          )}

          {record.status !== 'REJECTED' && record.status !== 'SELECTED' && (
            <Button size="small" danger icon={<CloseOutlined />} onClick={() => handleAction(record.id, 'reject')}>
              Reject
            </Button>
          )}
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
          <Button icon={<ReloadOutlined />} onClick={() => { fetchData(page); fetchCounts(); }}>Refresh</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate} style={{ fontWeight: 600 }}>Create Quotation</Button>
        </Space>
      }
    >
      {/* Workflow Tabs / Chevrons */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 18, flexWrap: 'wrap' }}>
        <Button
          type={activeTab === 'ALL' ? 'primary' : 'default'}
          onClick={() => { setActiveTab('ALL'); setPage(1); }}
          style={{ borderRadius: 6, fontWeight: 600 }}
        >
          All Quotations <Badge count={statusCounts.ALL} style={{ marginLeft: 6, backgroundColor: activeTab === 'ALL' ? '#ffffff' : '#64748b', color: activeTab === 'ALL' ? '#0f172a' : '#ffffff' }} />
        </Button>
        <Button
          type={activeTab === 'RECEIVED' ? 'primary' : 'default'}
          onClick={() => { setActiveTab('RECEIVED'); setPage(1); }}
          style={{
            borderRadius: 6,
            fontWeight: 600,
            borderColor: activeTab === 'RECEIVED' ? '#38bdf8' : undefined,
            backgroundColor: activeTab === 'RECEIVED' ? '#0284c7' : undefined,
            color: activeTab === 'RECEIVED' ? '#ffffff' : undefined,
          }}
        >
          Received <Badge count={statusCounts.RECEIVED} style={{ marginLeft: 6, backgroundColor: '#38bdf8' }} />
        </Button>
        <Button
          type={activeTab === 'EVALUATED' ? 'primary' : 'default'}
          onClick={() => { setActiveTab('EVALUATED'); setPage(1); }}
          style={{
            borderRadius: 6,
            fontWeight: 600,
            borderColor: activeTab === 'EVALUATED' ? '#a855f7' : undefined,
            backgroundColor: activeTab === 'EVALUATED' ? '#7e22ce' : undefined,
            color: activeTab === 'EVALUATED' ? '#ffffff' : undefined,
          }}
        >
          Evaluated <Badge count={statusCounts.EVALUATED} style={{ marginLeft: 6, backgroundColor: '#a855f7' }} />
        </Button>
        <Button
          type={activeTab === 'SELECTED' ? 'primary' : 'default'}
          onClick={() => { setActiveTab('SELECTED'); setPage(1); }}
          style={{
            borderRadius: 6,
            fontWeight: 600,
            borderColor: activeTab === 'SELECTED' ? '#10b981' : undefined,
            backgroundColor: activeTab === 'SELECTED' ? '#059669' : undefined,
            color: activeTab === 'SELECTED' ? '#ffffff' : undefined,
          }}
        >
          Selected / Ready for PO <Badge count={statusCounts.SELECTED} style={{ marginLeft: 6, backgroundColor: '#10b981' }} />
        </Button>
      </div>

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
            {/* RFQ Reference Link Row */}
            <Row gutter={16} style={{ marginBottom: 12, paddingBottom: 10, borderBottom: '1px dashed rgba(255, 255, 255, 0.1)' }}>
              <Col span={14}>
                <Form.Item
                  name="rfqId"
                  label={
                    <span style={{ fontWeight: 700, color: '#38bdf8' }}>
                      <FileDoneOutlined style={{ marginRight: 6 }} />
                      Link RFQ Reference (Auto-fill Items & Quantities)
                    </span>
                  }
                  style={{ marginBottom: 0 }}
                >
                  <Select
                    showSearch
                    allowClear
                    placeholder="Select RFQ (e.g. RFQ-2026-0004) to load supplier & items..."
                    optionFilterProp="label"
                    onChange={handleRfqChange}
                    options={rfqs.map((r) => ({
                      value: r.id,
                      label: `${r.rfqCode}${r.title ? ` — ${r.title}` : ''} [${r.status}]`,
                    }))}
                  />
                </Form.Item>
              </Col>
              <Col span={10}>
                <div style={{ marginTop: 28, fontSize: 12, color: '#94a3b8', lineHeight: '1.4' }}>
                  ⚡ Selecting an RFQ auto-populates supplier, division, target store & all line items.
                </div>
              </Col>
            </Row>

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

            <Row gutter={16}>
              <Col span={8}>
                <Form.Item name="divisionId" label={<span style={{ fontWeight: 600 }}><ApartmentOutlined style={{ marginRight: 4, color: '#10b981' }} />Division</span>}>
                  <Select placeholder="Select division..." allowClear options={divisions.map((d) => ({ value: d.id, label: `${d.code ? `[${d.code}] ` : ''}${d.name}` }))} />
                </Form.Item>
              </Col>
              <Col span={8}>
                <Form.Item name="warehouseId" label={<span style={{ fontWeight: 600 }}><ShopOutlined style={{ marginRight: 4, color: '#f59e0b' }} />Target Warehouse / Store</span>}>
                  <Select placeholder="Select warehouse..." allowClear options={warehouses.map((w) => ({ value: w.id, label: `${w.warehouseCode} — ${w.name}` }))} />
                </Form.Item>
              </Col>
              <Col span={8}>
                <Form.Item name="purchaseType" label={<span style={{ fontWeight: 600 }}><GlobalOutlined style={{ marginRight: 4 }} />Origin</span>} initialValue="LOCAL">
                  <Segmented block options={[{ label: 'Local', value: 'LOCAL' }, { label: 'Import', value: 'IMPORT' }]} />
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
