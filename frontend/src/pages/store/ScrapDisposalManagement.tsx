import React, { useState, useEffect, useCallback } from 'react';
import {
  Card, Table, Button, Space, Tag, Modal, Form, Input, Select, DatePicker,
  App, Row, Col, InputNumber, Statistic, Typography,
} from 'antd';
import {
  PlusOutlined, DeleteOutlined, CheckCircleOutlined, SearchOutlined, RestOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import apiService from '../../services/api';
import usePermission from '../../hooks/usePermission';
import { PageHeader } from '../../components/shared';

const { Text } = Typography;

interface ScrapDisposalRecord {
  id: string;
  disposalCode: string;
  disposalDate: string;
  divisionId?: string | null;
  storeId?: string | null;
  warehouseId?: string | null;
  itemId?: string | null;
  uomId?: string | null;
  buyerName: string;
  quantity: number;
  auctionRate: number;
  totalValue: number;
  gatePassRef?: string | null;
  remarks?: string | null;
  status: string;
}

interface StoreOption {
  id: string;
  storeCode: string;
  storeName: string;
  storeType?: string;
  divisionId?: string | null;
  warehouseId?: string | null;
}

interface ItemOption {
  id: string;
  itemCode: string;
  itemName: string;
  uomId?: string;
  uomCode?: string;
}

interface UomOption {
  id: string;
  code: string;
  name: string;
}

const ScrapDisposalManagement: React.FC = () => {
  const { message } = App.useApp();
  const { can } = usePermission();

  const [data, setData] = useState<ScrapDisposalRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');

  const [stores, setStores] = useState<StoreOption[]>([]);
  const [items, setItems] = useState<ItemOption[]>([]);
  const [uoms, setUoms] = useState<UomOption[]>([]);

  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiService.get<any>('/store/scrap-disposals', {});
      setData(Array.isArray(res) ? res : (res?.data || []));
    } catch {
      message.error('Failed to load scrap disposals');
    } finally {
      setLoading(false);
    }
  }, [message]);

  useEffect(() => {
    fetchData();
    Promise.all([
      apiService.get<any>('/store/stores', { limit: 200 }).catch(() => []),
      apiService.get<any>('/store/items', { limit: 500 }).catch(() => ({ data: [] })),
      apiService.get<any>('/uoms', { limit: 200 }).catch(() => []),
    ]).then(([storeRes, itemRes, uomRes]) => {
      setStores(Array.isArray(storeRes) ? storeRes : (storeRes?.data || []));
      setItems(Array.isArray(itemRes) ? itemRes : (itemRes?.data || []));
      setUoms(Array.isArray(uomRes) ? uomRes : (uomRes?.data || []));
    });
  }, [fetchData]);

  const openCreateModal = () => {
    form.resetFields();
    form.setFieldsValue({
      disposalCode: `SCR-${dayjs().format('YYYYMMDD-HHmm')}`,
      disposalDate: dayjs(),
      quantity: 1,
      auctionRate: 0,
    });
    setModalOpen(true);
  };

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      setSaving(true);
      const selectedStore = stores.find((s) => s.id === values.storeId);
      const qty = Number(values.quantity);
      const rate = Number(values.auctionRate || 0);
      await apiService.post('/store/scrap-disposals', {
        disposalCode: values.disposalCode,
        disposalDate: values.disposalDate.format('YYYY-MM-DD'),
        storeId: values.storeId || undefined,
        divisionId: selectedStore?.divisionId || undefined,
        warehouseId: selectedStore?.warehouseId || undefined,
        itemId: values.itemId || undefined,
        uomId: values.uomId || undefined,
        buyerName: values.buyerName,
        quantity: qty,
        auctionRate: rate,
        totalValue: Number((qty * rate).toFixed(2)),
        gatePassRef: values.gatePassRef || undefined,
        remarks: values.remarks || undefined,
      });
      message.success('Scrap disposal recorded');
      setModalOpen(false);
      fetchData();
    } catch (err: any) {
      if (err?.errorFields) return;
      const msg = err?.response?.data?.message;
      message.error(Array.isArray(msg) ? msg[0] : (msg || 'Failed to record scrap disposal'));
    } finally {
      setSaving(false);
    }
  };

  const handleComplete = async (id: string) => {
    try {
      await apiService.patch(`/store/scrap-disposals/${id}/complete`, {});
      message.success('Scrap disposal completed and stock deducted');
      fetchData();
    } catch (err: any) {
      message.error(err?.response?.data?.message || 'Failed to complete scrap disposal');
    }
  };

  const itemMap = new Map(items.map((i) => [i.id, `${i.itemCode} — ${i.itemName}`]));
  const storeMap = new Map(stores.map((s) => [s.id, `${s.storeCode} — ${s.storeName}`]));
  const uomMap = new Map(uoms.map((u) => [u.id, u.code]));

  const filteredData = data.filter((r) => {
    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    return (
      r.disposalCode?.toLowerCase().includes(q) ||
      r.buyerName?.toLowerCase().includes(q) ||
      (r.gatePassRef || '').toLowerCase().includes(q)
    );
  });

  const totalCompletedValue = data
    .filter((d) => d.status === 'COMPLETED')
    .reduce((sum, d) => sum + Number(d.totalValue || 0), 0);

  const totalCompletedQty = data
    .filter((d) => d.status === 'COMPLETED')
    .reduce((sum, d) => sum + Number(d.quantity || 0), 0);

  const columns: ColumnsType<ScrapDisposalRecord> = [
    { title: 'Disposal #', dataIndex: 'disposalCode', key: 'disposalCode', width: 150, render: (v) => <Text strong>{v}</Text> },
    { title: 'Date', dataIndex: 'disposalDate', key: 'disposalDate', width: 115 },
    { title: 'Store', dataIndex: 'storeId', key: 'storeId', width: 190, render: (v) => (v ? storeMap.get(v) || v : '—') },
    { title: 'Item', dataIndex: 'itemId', key: 'itemId', width: 200, render: (v) => (v ? itemMap.get(v) || v : 'General Scrap') },
    { title: 'Buyer / Recycler', dataIndex: 'buyerName', key: 'buyerName', width: 180 },
    {
      title: 'Qty',
      key: 'quantity',
      width: 110,
      align: 'right',
      render: (_: any, r) => `${Number(r.quantity)} ${r.uomId ? (uomMap.get(r.uomId) || '') : ''}`,
    },
    { title: 'Rate', dataIndex: 'auctionRate', key: 'auctionRate', width: 100, align: 'right', render: (v) => Number(v || 0).toLocaleString() },
    { title: 'Total Value', dataIndex: 'totalValue', key: 'totalValue', width: 120, align: 'right', render: (v) => Number(v || 0).toLocaleString() },
    { title: 'Gate Pass Ref', dataIndex: 'gatePassRef', key: 'gatePassRef', width: 130, render: (v) => v || '—' },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 115,
      render: (v: string) => <Tag color={v === 'COMPLETED' ? 'success' : 'default'}>{v}</Tag>,
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 130,
      render: (_: any, r) => (
        <Space size="small">
          {r.status === 'DRAFT' && can('store.return.post') && (
            <Button size="small" type="primary" icon={<CheckCircleOutlined />} onClick={() => handleComplete(r.id)}>
              Complete
            </Button>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        icon={<RestOutlined />}
        title="Scrap & Quarantine Disposals"
        subtitle="Manage old consumable scrap returns, auctions, and write-offs"
        extra={
          can('store.return.create') ? (
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreateModal}>
              Record Scrap Disposal
            </Button>
          ) : null
        }
      />
      <div style={{ padding: '0 16px' }}>
        <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
          <Col xs={24} sm={8}>
            <Card size="small">
              <Statistic title="Total Disposals" value={data.length} />
            </Card>
          </Col>
          <Col xs={24} sm={8}>
            <Card size="small">
              <Statistic title="Disposed Qty (Completed)" value={totalCompletedQty} />
            </Card>
          </Col>
          <Col xs={24} sm={8}>
            <Card size="small">
              <Statistic title="Auction / Recovery Value" value={totalCompletedValue} precision={2} prefix="PKR" />
            </Card>
          </Col>
        </Row>

        <Card>
          <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
            <Col xs={24} sm={12} md={8}>
              <Input
                placeholder="Search disposal #, buyer, gate pass..."
                prefix={<SearchOutlined />}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                allowClear
              />
            </Col>
          </Row>
          <Table
            columns={columns}
            dataSource={filteredData}
            rowKey="id"
            loading={loading}
            scroll={{ x: 'max-content' }}
            pagination={{ pageSize: 15 }}
          />
        </Card>
      </div>

      <Modal
        title="Record Scrap Disposal / Auction"
        open={modalOpen}
        onOk={handleSave}
        onCancel={() => setModalOpen(false)}
        confirmLoading={saving}
        width={780}
        destroyOnHidden
      >
        <Form form={form} layout="vertical">
          <Row gutter={[16, 8]}>
            <Col xs={24} sm={12}>
              <Form.Item name="disposalCode" label="Disposal Code" rules={[{ required: true }]}>
                <Input />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="disposalDate" label="Disposal Date" rules={[{ required: true }]}>
                <DatePicker style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={[16, 8]}>
            <Col xs={24} sm={12}>
              <Form.Item name="storeId" label="Source Store / Quarantine Store">
                <Select
                  showSearch
                  allowClear
                  optionFilterProp="label"
                  options={stores.map((s) => ({ value: s.id, label: `${s.storeCode} — ${s.storeName}` }))}
                />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="itemId" label="Scrap Item (Optional)">
                <Select
                  showSearch
                  allowClear
                  optionFilterProp="label"
                  onChange={(val) => {
                    const found = items.find((i) => i.id === val);
                    if (found?.uomId) form.setFieldsValue({ uomId: found.uomId });
                  }}
                  options={items.map((i) => ({ value: i.id, label: `${i.itemCode} — ${i.itemName}` }))}
                />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={[16, 8]}>
            <Col xs={24} sm={12}>
              <Form.Item name="buyerName" label="Scrap Buyer / Recycler Name" rules={[{ required: true }]}>
                <Input placeholder="e.g. Al-Madina Scrap Traders" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="gatePassRef" label="NRGP / Gate Pass Reference">
                <Input placeholder="e.g. GP-20261114-001" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={[16, 8]}>
            <Col xs={24} sm={8}>
              <Form.Item name="quantity" label="Quantity" rules={[{ required: true }]}>
                <InputNumber min={0.0001} step={1} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col xs={24} sm={8}>
              <Form.Item name="uomId" label="UOM">
                <Select
                  showSearch
                  allowClear
                  optionFilterProp="label"
                  options={uoms.map((u) => ({ value: u.id, label: u.code }))}
                />
              </Form.Item>
            </Col>
            <Col xs={24} sm={8}>
              <Form.Item name="auctionRate" label="Auction Rate (PKR)">
                <InputNumber min={0} step={10} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="remarks" label="Remarks">
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default ScrapDisposalManagement;
