import React, { useState, useEffect, useCallback } from 'react';
import {
  Card, Table, Button, Space, Tag, Modal, Form, Input, Select, DatePicker,
  App, Row, Col, Tabs, Typography,
} from 'antd';
import {
  PlusOutlined, SwapOutlined, PrinterOutlined, CheckCircleOutlined, SearchOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import apiService from '../../services/api';
import usePermission from '../../hooks/usePermission';
import { PageHeader } from '../../components/shared';
import StoreLineItemsEditor, { StoreLineItem } from './components/StoreLineItemsEditor';
import StoreVoucherPrintModal, { StoreVoucherData } from './components/StoreVoucherPrintModal';

const { Text } = Typography;

interface TransferLine {
  id: string;
  itemId: string;
  uomId: string;
  quantity: number;
  remarks?: string | null;
}

interface TransferNote {
  id: string;
  mtnNumber: string;
  fromStoreId: string;
  toStoreId: string;
  fromDivisionId?: string | null;
  toDivisionId?: string | null;
  transferDate: string;
  purpose?: string | null;
  status: string;
  lines?: TransferLine[];
}

interface StoreOption {
  id: string;
  storeCode: string;
  storeName: string;
  divisionId?: string | null;
}

const statusColors: Record<string, string> = {
  DRAFT: 'default',
  POSTED: 'success',
  CANCELLED: 'error',
};

const MaterialTransfers: React.FC = () => {
  const { message } = App.useApp();
  const { can } = usePermission();

  const [data, setData] = useState<TransferNote[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'ALL' | 'DRAFT' | 'POSTED'>('ALL');
  const [search, setSearch] = useState('');

  const [stores, setStores] = useState<StoreOption[]>([]);
  const [itemsMap, setItemsMap] = useState<Record<string, { itemCode: string; itemName: string }>>({});
  const [uomsMap, setUomsMap] = useState<Record<string, string>>({});

  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();
  const fromStoreWatch = Form.useWatch('fromStoreId', form);
  const [lineItems, setLineItems] = useState<StoreLineItem[]>([]);

  const [printVoucher, setPrintVoucher] = useState<StoreVoucherData | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiService.get<any>('/store/transfers', {});
      setData(Array.isArray(res) ? res : (res?.data || []));
    } catch {
      message.error('Failed to load material transfer notes');
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
      const storeList = Array.isArray(storeRes) ? storeRes : (storeRes?.data || []);
      const itemList = Array.isArray(itemRes) ? itemRes : (itemRes?.data || []);
      const uomList = Array.isArray(uomRes) ? uomRes : (uomRes?.data || []);
      setStores(storeList);
      const im: Record<string, { itemCode: string; itemName: string }> = {};
      itemList.forEach((i: any) => { im[i.id] = { itemCode: i.itemCode, itemName: i.itemName }; });
      setItemsMap(im);
      const um: Record<string, string> = {};
      uomList.forEach((u: any) => { um[u.id] = u.code; });
      setUomsMap(um);
    });
  }, [fetchData]);

  const storeLabel = (id?: string) => {
    if (!id) return '—';
    const s = stores.find((st) => st.id === id);
    return s ? `${s.storeCode} — ${s.storeName}` : id;
  };

  const openCreateModal = () => {
    form.resetFields();
    form.setFieldsValue({
      mtnNumber: `MTN-${dayjs().format('YYYYMMDD-HHmm')}`,
      transferDate: dayjs(),
    });
    setLineItems([]);
    setModalOpen(true);
  };

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      if (values.fromStoreId === values.toStoreId) {
        message.error('Source and destination stores must be different');
        return;
      }
      if (lineItems.length === 0) {
        message.warning('Add at least one item to transfer');
        return;
      }
      setSaving(true);
      const fromStore = stores.find((s) => s.id === values.fromStoreId);
      const toStore = stores.find((s) => s.id === values.toStoreId);
      await apiService.post('/store/transfers', {
        mtnNumber: values.mtnNumber,
        fromStoreId: values.fromStoreId,
        toStoreId: values.toStoreId,
        fromDivisionId: fromStore?.divisionId || undefined,
        toDivisionId: toStore?.divisionId || undefined,
        transferDate: values.transferDate.format('YYYY-MM-DD'),
        purpose: values.purpose || undefined,
        lines: lineItems.map((l) => ({
          itemId: l.itemId,
          uomId: l.uomId,
          quantity: Number(l.requestedQuantity),
          remarks: l.remarks || undefined,
        })),
      });
      message.success('Material transfer note created');
      setModalOpen(false);
      fetchData();
    } catch (err: any) {
      if (err?.errorFields) return;
      const msg = err?.response?.data?.message;
      message.error(Array.isArray(msg) ? msg[0] : (msg || 'Failed to create material transfer note'));
    } finally {
      setSaving(false);
    }
  };

  const handlePost = async (id: string) => {
    try {
      await apiService.patch(`/store/transfers/${id}/post`, {});
      message.success('Transfer posted — stock moved across stores');
      fetchData();
    } catch (err: any) {
      message.error(err?.response?.data?.message || 'Failed to post transfer');
    }
  };

  const openPrint = (record: TransferNote) => {
    setPrintVoucher({
      type: 'MTN',
      documentNumber: record.mtnNumber,
      date: record.transferDate,
      status: record.status,
      storeName: storeLabel(record.fromStoreId),
      destinationStoreName: storeLabel(record.toStoreId),
      purpose: record.purpose || undefined,
      lines: (record.lines || []).map((l, idx) => ({
        key: l.id || idx,
        lineNumber: idx + 1,
        itemCode: itemsMap[l.itemId]?.itemCode,
        itemName: itemsMap[l.itemId]?.itemName || l.itemId,
        uomCode: uomsMap[l.uomId],
        quantity: Number(l.quantity),
        remarks: l.remarks || undefined,
      })),
    });
  };

  const filteredData = data.filter((mtn) => {
    if (activeTab !== 'ALL' && mtn.status !== activeTab) return false;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      return (
        mtn.mtnNumber?.toLowerCase().includes(q) ||
        storeLabel(mtn.fromStoreId).toLowerCase().includes(q) ||
        storeLabel(mtn.toStoreId).toLowerCase().includes(q)
      );
    }
    return true;
  });

  const columns: ColumnsType<TransferNote> = [
    { title: 'MTN #', dataIndex: 'mtnNumber', key: 'mtnNumber', width: 160, render: (v) => <Text strong>{v}</Text> },
    { title: 'Date', dataIndex: 'transferDate', key: 'transferDate', width: 115 },
    { title: 'From Store', dataIndex: 'fromStoreId', key: 'fromStoreId', width: 220, render: (v) => storeLabel(v) },
    { title: 'To Store', dataIndex: 'toStoreId', key: 'toStoreId', width: 220, render: (v) => storeLabel(v) },
    { title: 'Purpose', dataIndex: 'purpose', key: 'purpose', width: 180, ellipsis: true, render: (v) => v || '—' },
    { title: 'Lines', key: 'lines', width: 80, align: 'center', render: (_: any, r) => r.lines?.length || 0 },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 110,
      render: (v: string) => <Tag color={statusColors[v] || 'default'}>{v}</Tag>,
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 190,
      render: (_: any, r) => (
        <Space size="small">
          <Button size="small" icon={<PrinterOutlined />} onClick={() => openPrint(r)}>
            Print Slip
          </Button>
          {r.status === 'DRAFT' && can('store.issue.post') && (
            <Button size="small" type="primary" icon={<CheckCircleOutlined />} onClick={() => handlePost(r.id)}>
              Post
            </Button>
          )}
        </Space>
      ),
    },
  ];

  const selectedFromStore = stores.find((s) => s.id === fromStoreWatch);

  return (
    <div>
      <PageHeader
        icon={<SwapOutlined />}
        title="Material Transfer Notes (MTN)"
        subtitle="Inter-store and inter-division stock transfers with atomic ledger posting"
        extra={
          can('store.issue.create') ? (
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreateModal}>
              New Transfer
            </Button>
          ) : null
        }
      />
      <div style={{ padding: '0 16px' }}>
        <Card>
          <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
            <Col xs={24} sm={12} md={8}>
              <Input
                placeholder="Search MTN # or store..."
                prefix={<SearchOutlined />}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                allowClear
              />
            </Col>
          </Row>
          <Tabs
            activeKey={activeTab}
            onChange={(k) => setActiveTab(k as any)}
            items={[
              { key: 'ALL', label: `All (${data.length})` },
              { key: 'DRAFT', label: `Draft (${data.filter((d) => d.status === 'DRAFT').length})` },
              { key: 'POSTED', label: `Posted (${data.filter((d) => d.status === 'POSTED').length})` },
            ]}
          />
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
        title="Create Material Transfer Note (MTN)"
        open={modalOpen}
        onOk={handleSave}
        onCancel={() => setModalOpen(false)}
        confirmLoading={saving}
        width={1050}
        destroyOnHidden
      >
        <Form form={form} layout="vertical">
          <Row gutter={[16, 8]}>
            <Col xs={24} sm={12} md={6}>
              <Form.Item name="mtnNumber" label="MTN Number" rules={[{ required: true }]}>
                <Input />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12} md={6}>
              <Form.Item name="transferDate" label="Transfer Date" rules={[{ required: true }]}>
                <DatePicker style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12} md={6}>
              <Form.Item name="fromStoreId" label="From Store" rules={[{ required: true }]}>
                <Select
                  showSearch
                  optionFilterProp="label"
                  placeholder="Source store"
                  options={stores.map((s) => ({ value: s.id, label: `${s.storeCode} — ${s.storeName}` }))}
                />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12} md={6}>
              <Form.Item name="toStoreId" label="To Store" rules={[{ required: true }]}>
                <Select
                  showSearch
                  optionFilterProp="label"
                  placeholder="Destination store"
                  options={stores.map((s) => ({ value: s.id, label: `${s.storeCode} — ${s.storeName}` }))}
                />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="purpose" label="Transfer Purpose / Reference">
            <Input placeholder="e.g. Inter-division material balancing" />
          </Form.Item>
        </Form>

        <StoreLineItemsEditor
          value={lineItems}
          onChange={setLineItems}
          mode="issue"
          divisionId={selectedFromStore?.divisionId || undefined}
          storeId={fromStoreWatch}
        />
      </Modal>

      <StoreVoucherPrintModal
        open={!!printVoucher}
        onClose={() => setPrintVoucher(null)}
        voucher={printVoucher}
      />
    </div>
  );
};

export default MaterialTransfers;
