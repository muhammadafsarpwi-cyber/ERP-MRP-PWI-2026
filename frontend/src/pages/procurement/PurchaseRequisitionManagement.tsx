import React, { useState, useEffect, useCallback } from 'react';
import {
  Table, Button, Space, Tag, Form, Input, Select, App, Card,
  Row, Col, DatePicker, Segmented, Tooltip,
} from 'antd';
import {
  PlusOutlined, EditOutlined, SearchOutlined, SendOutlined, CheckOutlined,
  CloseOutlined, ReloadOutlined, ApartmentOutlined, ShopOutlined, GlobalOutlined,
  FileDoneOutlined, InfoCircleOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import apiService from '../../services/api';
import { ERPLineItems, ERPLine, DraggableResizableModal } from '../../components/shared';

interface PurchaseRequisition {
  id: string;
  requisitionCode: string;
  title?: string;
  description?: string;
  requestType: string;
  requestedDeliveryDate?: string;
  department?: string;
  divisionId?: string;
  divisionName?: string;
  warehouseId?: string;
  warehouseName?: string;
  purchaseType?: string;
  status: string;
  projectCode?: string;
  notes?: string;
}

interface DivisionOption {
  id: string;
  code?: string;
  name: string;
}

const DEFAULT_DIVISIONS: DivisionOption[] = [
  { id: 'div-wd', code: 'WD', name: 'Wire Drawing Division' },
  { id: 'div-galv', code: 'GALV', name: 'Galvanizing Division' },
  { id: 'div-spk', code: 'SPK', name: 'Spoke Plant Division' },
  { id: 'div-ccd', code: 'CCD', name: 'Control Cable Division' },
  { id: 'div-nail', code: 'NAIL', name: 'Nail & Fastener Division' },
  { id: 'div-corp', code: 'CORP', name: 'Corporate & Master Store' },
];

const STATUS_OPTIONS = ['DRAFT', 'SUBMITTED', 'APPROVED', 'CANCELLED'];
const REQUEST_TYPES = ['STANDARD', 'URGENT', 'BLANKET', 'RECURRING'];

const statusColorMap: Record<string, string> = {
  DRAFT: 'default',
  SUBMITTED: 'blue',
  APPROVED: 'green',
  CANCELLED: 'red',
};

const PurchaseRequisitionManagement: React.FC = () => {
  const { message } = App.useApp();
  const [data, setData] = useState<PurchaseRequisition[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [modalVisible, setModalVisible] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [editingItem, setEditingItem] = useState<PurchaseRequisition | null>(null);
  const [form] = Form.useForm();
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<string | undefined>(undefined);
  const [pageSize] = useState(20);
  const [lineItems, setLineItems] = useState<ERPLine[]>([]);
  const [companyId, setCompanyId] = useState('');

  // Master lists
  const [divisions, setDivisions] = useState<DivisionOption[]>(DEFAULT_DIVISIONS);
  const [warehouses, setWarehouses] = useState<Array<{ id: string; warehouseCode: string; name: string; warehouseType?: string }>>([]);

  const watchedDivisionId = Form.useWatch('divisionId', form);
  const watchedWarehouseId = Form.useWatch('warehouseId', form);
  const selectedWarehouse = warehouses.find((w) => w.id === watchedWarehouseId);

  useEffect(() => {
    const erpUser = localStorage.getItem('erp_user');
    if (erpUser) {
      try {
        const p = JSON.parse(erpUser);
        if (p?.defaultCompanyId) setCompanyId(p.defaultCompanyId);
      } catch { /* ignore */ }
    }

    (async () => {
      // 1. Warehouses
      try {
        const w = await apiService.get<any>('/organization/warehouses', { limit: 100 });
        const items = Array.isArray(w) ? w : w?.data?.items || w?.items || w?.data || [];
        setWarehouses(items);
      } catch { /* ignore */ }

      // 2. Divisions
      try {
        const d = await apiService.get<any>('/divisions', { limit: 50 });
        const divItems = Array.isArray(d) ? d : d?.data?.items || d?.data || [];
        if (divItems.length > 0) {
          setDivisions(divItems.map((x: any) => ({ id: x.id, code: x.divisionCode, name: x.name })));
        }
      } catch { /* keep DEFAULT_DIVISIONS */ }
    })();
  }, []);

  const fetchData = useCallback(async (pageNum: number = 1) => {
    setLoading(true);
    try {
      const params: any = { page: pageNum, limit: pageSize };
      if (search) params.search = search;
      if (filterStatus) params.status = filterStatus;
      const response = await apiService.get<{ data: PurchaseRequisition[]; total: number }>('/procurement/requisitions', params);
      setData(response.data || []);
      setTotal(response.total || 0);
    } catch {
      message.error('Failed to fetch purchase requisitions');
    } finally {
      setLoading(false);
    }
  }, [search, filterStatus, pageSize, message]);

  useEffect(() => { fetchData(page); }, [page, fetchData]);

  const generateRequisitionCode = useCallback(() => {
    const currentYear = new Date().getFullYear();
    const nextSeq = (total || data.length || 0) + 1;
    return `PR-${currentYear}-${String(nextSeq).padStart(4, '0')}`;
  }, [total, data.length]);

  const handleCreate = () => {
    setEditingItem(null);
    form.resetFields();
    const autoCode = generateRequisitionCode();
    form.setFieldsValue({
      requisitionCode: autoCode,
      requestType: 'STANDARD',
      purchaseType: 'LOCAL',
      requestedDeliveryDate: dayjs().add(7, 'day'),
    });
    setLineItems([]);
    setModalVisible(true);
  };

  const handleEdit = async (record: PurchaseRequisition) => {
    setEditingItem(record);
    try {
      const res = await apiService.get<any>(`/procurement/requisitions/${record.id}`);
      const pr = res?.data || record;
      form.setFieldsValue({
        ...pr,
        requestedDeliveryDate: pr.requestedDeliveryDate ? dayjs(pr.requestedDeliveryDate) : undefined,
        purchaseType: pr.purchaseType || 'LOCAL',
      });
      if (pr.lines) {
        setLineItems(pr.lines.map((l: any, idx: number) => ({
          id: `line-${idx + 1}`,
          itemId: l.itemId,
          itemName: l.description || l.itemName,
          quantity: Number(l.quantity || 1),
          uomId: l.uomId,
          uomCode: l.uom?.code || 'PCS',
          rate: Number(l.unitPrice || 0),
          lineTotal: Number(l.estimatedAmount || 0),
        })));
      }
    } catch {
      form.setFieldsValue(record);
    }
    setModalVisible(true);
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      if (lineItems.length === 0) {
        message.warning('Add at least one requisition line item');
        return;
      }
      setSubmitting(true);

      const payload = {
        ...values,
        companyId: companyId || values.companyId,
        requestedDeliveryDate: values.requestedDeliveryDate ? dayjs(values.requestedDeliveryDate).format('YYYY-MM-DD') : undefined,
        lines: lineItems.map((l) => ({
          itemId: l.itemId,
          description: l.itemName || l.itemCode,
          quantity: Number(l.quantity || 0),
          uomId: l.uomId,
          unitPrice: Number(l.rate || 0),
          estimatedAmount: Number(l.lineTotal || (l.quantity * (l.rate || 0))),
        })),
      };

      if (editingItem) {
        await apiService.patch(`/procurement/requisitions/${editingItem.id}`, payload);
        message.success('Purchase requisition updated');
      } else {
        await apiService.post('/procurement/requisitions', payload);
        message.success(`Purchase requisition ${values.requisitionCode} created`);
      }
      setModalVisible(false);
      fetchData(page);
    } catch (error: any) {
      const msg = error?.response?.data?.message;
      message.error(Array.isArray(msg) ? msg[0] : 'Failed to save purchase requisition');
    } finally {
      setSubmitting(false);
    }
  };

  const handleAction = async (id: string, action: string) => {
    try {
      await apiService.patch(`/procurement/requisitions/${id}/${action}`);
      message.success(`Purchase requisition marked as ${action}ed`);
      fetchData(page);
    } catch {
      message.error(`Failed to ${action} purchase requisition`);
    }
  };

  const columns: ColumnsType<PurchaseRequisition> = [
    {
      title: 'PR Code',
      dataIndex: 'requisitionCode',
      key: 'requisitionCode',
      width: 140,
      render: (code) => <span style={{ fontWeight: 700, fontFamily: 'monospace', color: '#38bdf8' }}>{code}</span>,
    },
    {
      title: 'Title',
      dataIndex: 'title',
      key: 'title',
      width: 230,
      render: (t) => <span style={{ fontWeight: 600 }}>{t || '—'}</span>,
    },
    {
      title: 'Type',
      dataIndex: 'requestType',
      key: 'requestType',
      width: 110,
      render: (t) => <Tag color={t === 'URGENT' ? 'red' : 'blue'}>{t}</Tag>,
    },
    {
      title: 'Department',
      dataIndex: 'department',
      key: 'department',
      width: 130,
      render: (dept) => dept || '—',
    },
    {
      title: 'Delivery Date',
      dataIndex: 'requestedDeliveryDate',
      key: 'requestedDeliveryDate',
      width: 120,
      render: (d) => d ? dayjs(d).format('DD/MM/YYYY') : '—',
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 120,
      render: (status: string) => (
        <Tag color={statusColorMap[status] || 'default'} style={{ fontWeight: 700 }}>
          {status}
        </Tag>
      ),
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 220,
      render: (_, record) => (
        <Space size="small">
          <Button
            size="small"
            icon={<EditOutlined />}
            onClick={() => handleEdit(record)}
            disabled={record.status !== 'DRAFT'}
          />
          {record.status === 'DRAFT' && (
            <Button size="small" type="primary" icon={<SendOutlined />} onClick={() => handleAction(record.id, 'submit')}>
              Submit
            </Button>
          )}
          {record.status === 'SUBMITTED' && (
            <Button size="small" type="primary" icon={<CheckOutlined />} style={{ background: '#10b981', borderColor: '#10b981' }} onClick={() => handleAction(record.id, 'approve')}>
              Approve
            </Button>
          )}
          {(record.status === 'DRAFT' || record.status === 'SUBMITTED') && (
            <Button size="small" danger icon={<CloseOutlined />} onClick={() => handleAction(record.id, 'cancel')}>
              Cancel
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
          <FileDoneOutlined style={{ fontSize: 20, color: '#10b981' }} />
          <span>Purchase Requisitions (PR)</span>
        </div>
      }
      extra={
        <Space>
          <Button icon={<ReloadOutlined />} onClick={() => fetchData(page)}>
            Refresh
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate} style={{ fontWeight: 600 }}>
            Create PR
          </Button>
        </Space>
      }
    >
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={8}>
          <Input
            placeholder="Search requisitions, titles, departments..."
            prefix={<SearchOutlined />}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onPressEnter={() => fetchData(1)}
            allowClear
          />
        </Col>
        <Col span={6}>
          <Select
            placeholder="Filter by status"
            allowClear
            style={{ width: '100%' }}
            value={filterStatus}
            onChange={setFilterStatus}
          >
            {STATUS_OPTIONS.map((s) => (
              <Select.Option key={s} value={s}>{s}</Select.Option>
            ))}
          </Select>
        </Col>
        <Col span={4}>
          <Button type="primary" onClick={() => fetchData(1)}>Search</Button>
        </Col>
      </Row>

      <Table
        columns={columns}
        dataSource={data}
        rowKey="id"
        loading={loading}
        pagination={{ current: page, total, pageSize, onChange: setPage, showSizeChanger: false }}
      />

      {/* Upgraded Desktop Draggable & Resizable Modal */}
      <DraggableResizableModal
        title={editingItem ? `Edit Purchase Requisition (${editingItem.requisitionCode})` : 'Create Purchase Requisition (PR)'}
        subtitle="📋 Raise material or item requisitions with live warehouse stock inspection, positive order addition & division store routing"
        open={modalVisible}
        onCancel={() => setModalVisible(false)}
        width={1120}
        height={760}
        footer={[
          <Button key="cancel" onClick={() => setModalVisible(false)}>
            Cancel
          </Button>,
          <Button
            key="submit"
            type="primary"
            loading={submitting}
            onClick={handleSubmit}
            style={{ fontWeight: 600 }}
          >
            {editingItem ? 'Update Requisition' : 'Create & Save PR'}
          </Button>,
        ]}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="companyId" hidden><Input /></Form.Item>

          <Card size="small" style={{ marginBottom: 14, background: 'rgba(255, 255, 255, 0.02)', borderColor: 'rgba(255, 255, 255, 0.1)' }}>
            <Row gutter={16}>
              <Col span={6}>
                <Form.Item
                  name="requisitionCode"
                  label={<span style={{ fontWeight: 600 }}>Requisition Code <Tag color="blue">Auto PR</Tag></span>}
                  rules={[{ required: true, message: 'Requisition code is required' }]}
                >
                  <Input placeholder="e.g. PR-2026-0001" style={{ fontWeight: 700, fontFamily: 'monospace' }} />
                </Form.Item>
              </Col>

              <Col span={8}>
                <Form.Item name="title" label={<span style={{ fontWeight: 600 }}>Title / Subject</span>}>
                  <Input placeholder="e.g. Monthly Wire Drawing Lubricants & Nipple Supply" />
                </Form.Item>
              </Col>

              <Col span={6}>
                <Form.Item
                  name="divisionId"
                  label={
                    <span style={{ fontWeight: 600 }}>
                      <ApartmentOutlined style={{ marginRight: 4, color: '#10b981' }} />
                      Division
                    </span>
                  }
                >
                  <Select
                    placeholder="Select requesting division..."
                    allowClear
                    options={divisions.map((d) => ({
                      value: d.id,
                      label: `${d.code ? `[${d.code}] ` : ''}${d.name}`,
                    }))}
                  />
                </Form.Item>
              </Col>

              <Col span={4}>
                <Form.Item
                  name="purchaseType"
                  label={<span style={{ fontWeight: 600 }}><GlobalOutlined style={{ marginRight: 4 }} />Origin</span>}
                  initialValue="LOCAL"
                >
                  <Segmented
                    block
                    options={[
                      { label: 'Local', value: 'LOCAL' },
                      { label: 'Import', value: 'IMPORT' },
                    ]}
                  />
                </Form.Item>
              </Col>
            </Row>

            <Row gutter={16}>
              <Col span={6}>
                <Form.Item
                  name="warehouseId"
                  label={
                    <span style={{ fontWeight: 600 }}>
                      <ShopOutlined style={{ marginRight: 4, color: '#f59e0b' }} />
                      Target Warehouse / Store
                    </span>
                  }
                >
                  <Select
                    placeholder="Select store..."
                    allowClear
                    options={warehouses.map((w) => ({
                      value: w.id,
                      label: `${w.warehouseCode} — ${w.name}`,
                    }))}
                  />
                </Form.Item>
              </Col>

              <Col span={6}>
                <Form.Item name="requestType" label={<span style={{ fontWeight: 600 }}>Request Type</span>}>
                  <Select>
                    {REQUEST_TYPES.map((t) => (
                      <Select.Option key={t} value={t}>{t}</Select.Option>
                    ))}
                  </Select>
                </Form.Item>
              </Col>

              <Col span={6}>
                <Form.Item name="department" label={<span style={{ fontWeight: 600 }}>Department</span>}>
                  <Input placeholder="e.g. Production / Quality / Spoke Plant" />
                </Form.Item>
              </Col>

              <Col span={6}>
                <Form.Item name="requestedDeliveryDate" label={<span style={{ fontWeight: 600 }}>Delivery Date</span>}>
                  <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
                </Form.Item>
              </Col>
            </Row>
          </Card>

          <Form.Item name="description" label={<span style={{ fontWeight: 600 }}>Purpose / Requirement Description</span>}>
            <Input.TextArea rows={2} placeholder="Explain purpose of request or special instructions..." />
          </Form.Item>

          {/* Requisition Line Items Table with Live Positive Inbound Stock Calculation */}
          <ERPLineItems
            companyId={companyId}
            value={lineItems}
            onChange={setLineItems}
            context="purchase"
            isPurchasable={true}
            divisionId={watchedDivisionId}
            warehouseId={watchedWarehouseId}
            warehouseType={selectedWarehouse?.warehouseType}
            label="Requisition Items"
            showAvailability={true}
          />

          <Row gutter={16} style={{ marginTop: 12 }}>
            <Col span={24}>
              <Form.Item name="notes" label={<span style={{ fontWeight: 600 }}>Internal Notes</span>}>
                <Input.TextArea rows={2} placeholder="Internal procurement/management notes..." />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </DraggableResizableModal>
    </Card>
  );
};

export default PurchaseRequisitionManagement;
