import React, { useState, useEffect, useCallback } from 'react';
import {
  Card, Table, Button, Space, Tag, Modal, Form, Input, Select, DatePicker,
  App, Row, Col, Tabs, InputNumber, Divider, Typography, theme,
} from 'antd';
import {
  PlusOutlined, SwapOutlined, PrinterOutlined, SendOutlined, RollbackOutlined,
  SearchOutlined, DeleteOutlined, WarningOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import apiService from '../../services/api';
import usePermission from '../../hooks/usePermission';
import { PageHeader } from '../../components/shared';
import StoreVoucherPrintModal, { StoreVoucherData } from './components/StoreVoucherPrintModal';

const { Text } = Typography;

interface GatePassLine {
  id: string;
  itemId?: string | null;
  itemDescription: string;
  uomId?: string | null;
  quantity: number;
  returnedQty?: number;
  remarks?: string | null;
}

interface GatePassRecord {
  id: string;
  gatePassNumber: string;
  passType: 'RGP' | 'NRGP';
  divisionId?: string | null;
  storeId?: string | null;
  partyName: string;
  partyAddress?: string | null;
  vehicleNumber?: string | null;
  driverName?: string | null;
  issueDate: string;
  expectedReturnDate?: string | null;
  purpose?: string | null;
  authorizedBy?: string | null;
  status: string;
  lines?: GatePassLine[];
  createdAt?: string;
}

interface StoreOption {
  id: string;
  storeCode: string;
  storeName: string;
  divisionId?: string | null;
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

const statusColors: Record<string, string> = {
  DRAFT: 'default',
  DISPATCHED: 'processing',
  PARTIALLY_RETURNED: 'warning',
  RETURNED: 'success',
  CLOSED: 'success',
  OVERDUE: 'error',
};

const GatePasses: React.FC = () => {
  const { message } = App.useApp();
  const { token } = theme.useToken();
  const { can } = usePermission();

  const [data, setData] = useState<GatePassRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'ALL' | 'RGP' | 'NRGP' | 'OVERDUE'>('ALL');
  const [search, setSearch] = useState('');

  const [stores, setStores] = useState<StoreOption[]>([]);
  const [items, setItems] = useState<ItemOption[]>([]);
  const [uoms, setUoms] = useState<UomOption[]>([]);

  const [createOpen, setCreateOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();
  const passTypeWatch = Form.useWatch('passType', form);
  const [draftLines, setDraftLines] = useState<Array<{
    key: string;
    itemId?: string;
    itemDescription: string;
    uomId?: string;
    quantity: number;
    remarks?: string;
  }>>([]);

  const [returnModal, setReturnModal] = useState<{ open: boolean; record: GatePassRecord | null }>({
    open: false,
    record: null,
  });
  const [returnQtys, setReturnQtys] = useState<Record<string, number>>({});
  const [returnRemarks, setReturnRemarks] = useState('');
  const [returning, setReturning] = useState(false);

  const [printVoucher, setPrintVoucher] = useState<StoreVoucherData | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiService.get<any>('/store/gate-passes', {});
      const list: GatePassRecord[] = Array.isArray(res) ? res : (res?.data || []);
      setData(list);
    } catch {
      message.error('Failed to load gate passes');
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
      setItems(itemList);
      setUoms(uomList);
    });
  }, [fetchData]);

  const openCreateModal = () => {
    form.resetFields();
    form.setFieldsValue({
      gatePassNumber: `GP-${dayjs().format('YYYYMMDD-HHmm')}`,
      passType: 'RGP',
      issueDate: dayjs(),
      expectedReturnDate: dayjs().add(7, 'day'),
    });
    setDraftLines([{ key: `line-${Date.now()}`, itemDescription: '', quantity: 1 }]);
    setCreateOpen(true);
  };

  const handleCreateSubmit = async () => {
    try {
      const values = await form.validateFields();
      const validLines = draftLines.filter((l) => l.itemDescription?.trim() && Number(l.quantity) > 0);
      if (validLines.length === 0) {
        message.warning('Add at least one valid line item with description and quantity');
        return;
      }
      setSaving(true);
      const selectedStore = stores.find((s) => s.id === values.storeId);
      await apiService.post('/store/gate-passes', {
        gatePassNumber: values.gatePassNumber,
        passType: values.passType,
        storeId: values.storeId || undefined,
        divisionId: selectedStore?.divisionId || undefined,
        partyName: values.partyName,
        partyAddress: values.partyAddress || undefined,
        vehicleNumber: values.vehicleNumber || undefined,
        driverName: values.driverName || undefined,
        issueDate: values.issueDate.format('YYYY-MM-DD'),
        expectedReturnDate: values.passType === 'RGP' && values.expectedReturnDate
          ? values.expectedReturnDate.format('YYYY-MM-DD')
          : undefined,
        purpose: values.purpose || undefined,
        authorizedBy: values.authorizedBy || undefined,
        lines: validLines.map((l) => ({
          itemId: l.itemId || undefined,
          itemDescription: l.itemDescription.trim(),
          uomId: l.uomId || undefined,
          quantity: Number(l.quantity),
          remarks: l.remarks || undefined,
        })),
      });
      message.success('Gate pass created');
      setCreateOpen(false);
      fetchData();
    } catch (err: any) {
      if (err?.errorFields) return;
      const msg = err?.response?.data?.message;
      message.error(Array.isArray(msg) ? msg[0] : (msg || 'Failed to create gate pass'));
    } finally {
      setSaving(false);
    }
  };

  const handleDispatch = async (id: string) => {
    try {
      await apiService.patch(`/store/gate-passes/${id}/dispatch`, {});
      message.success('Gate pass dispatched');
      fetchData();
    } catch (err: any) {
      message.error(err?.response?.data?.message || 'Failed to dispatch gate pass');
    }
  };

  const openReturnModal = (record: GatePassRecord) => {
    const initial: Record<string, number> = {};
    (record.lines || []).forEach((l) => {
      const remaining = Math.max(0, Number(l.quantity) - Number(l.returnedQty || 0));
      if (remaining > 0) initial[l.id] = remaining;
    });
    setReturnQtys(initial);
    setReturnRemarks('');
    setReturnModal({ open: true, record });
  };

  const handleReceiveReturn = async () => {
    if (!returnModal.record) return;
    const lines = Object.entries(returnQtys)
      .filter(([, qty]) => Number(qty) > 0)
      .map(([lineId, returnedQty]) => ({ lineId, returnedQty: Number(returnedQty) }));

    if (lines.length === 0) {
      message.warning('Enter return quantity for at least one line');
      return;
    }
    setReturning(true);
    try {
      await apiService.post(`/store/gate-passes/${returnModal.record.id}/receive-return`, {
        lines,
        remarks: returnRemarks || undefined,
      });
      message.success('Gate pass return recorded');
      setReturnModal({ open: false, record: null });
      fetchData();
    } catch (err: any) {
      message.error(err?.response?.data?.message || 'Failed to record return');
    } finally {
      setReturning(false);
    }
  };

  const openPrintModal = (record: GatePassRecord) => {
    const store = stores.find((s) => s.id === record.storeId);
    const uomMap = new Map(uoms.map((u) => [u.id, u.code]));
    const itemMap = new Map(items.map((i) => [i.id, i]));
    setPrintVoucher({
      type: record.passType,
      documentNumber: record.gatePassNumber,
      date: record.issueDate,
      status: record.status,
      storeName: store ? `${store.storeCode} — ${store.storeName}` : undefined,
      partyName: record.partyName,
      vehicleNumber: record.vehicleNumber || undefined,
      expectedReturnDate: record.expectedReturnDate || undefined,
      purpose: record.purpose || undefined,
      lines: (record.lines || []).map((l, idx) => {
        const item = l.itemId ? itemMap.get(l.itemId) : undefined;
        return {
          key: l.id || idx,
          lineNumber: idx + 1,
          itemCode: item?.itemCode,
          itemName: l.itemDescription || item?.itemName || 'Item',
          uomCode: l.uomId ? uomMap.get(l.uomId) : item?.uomCode,
          quantity: Number(l.quantity),
          returnedQty: Number(l.returnedQty || 0),
          remarks: l.remarks || undefined,
        };
      }),
    });
  };

  const filteredData = data.filter((gp) => {
    if (activeTab === 'RGP' && gp.passType !== 'RGP') return false;
    if (activeTab === 'NRGP' && gp.passType !== 'NRGP') return false;
    if (activeTab === 'OVERDUE' && gp.status !== 'OVERDUE') return false;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      return (
        gp.gatePassNumber?.toLowerCase().includes(q) ||
        gp.partyName?.toLowerCase().includes(q) ||
        (gp.vehicleNumber || '').toLowerCase().includes(q)
      );
    }
    return true;
  });

  const columns: ColumnsType<GatePassRecord> = [
    {
      title: 'Gate Pass #',
      dataIndex: 'gatePassNumber',
      key: 'gatePassNumber',
      width: 160,
      render: (v: string, r) => (
        <Space>
          <Text strong>{v}</Text>
          {r.status === 'OVERDUE' && <WarningOutlined style={{ color: token.colorError }} />}
        </Space>
      ),
    },
    {
      title: 'Type',
      dataIndex: 'passType',
      key: 'passType',
      width: 90,
      render: (v: string) => <Tag color={v === 'RGP' ? 'blue' : 'purple'}>{v}</Tag>,
    },
    { title: 'Party / Vendor', dataIndex: 'partyName', key: 'partyName', width: 200 },
    { title: 'Vehicle #', dataIndex: 'vehicleNumber', key: 'vehicleNumber', width: 120, render: (v) => v || '—' },
    { title: 'Issue Date', dataIndex: 'issueDate', key: 'issueDate', width: 115 },
    {
      title: 'Expected Return',
      dataIndex: 'expectedReturnDate',
      key: 'expectedReturnDate',
      width: 130,
      render: (v: string, r) =>
        r.passType === 'RGP' ? (
          <Text type={r.status === 'OVERDUE' ? 'danger' : undefined}>{v || '—'}</Text>
        ) : 'N/A',
    },
    {
      title: 'Lines',
      key: 'lines',
      width: 80,
      align: 'center',
      render: (_: any, r) => r.lines?.length || 0,
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 150,
      render: (v: string) => <Tag color={statusColors[v] || 'default'}>{v.replace(/_/g, ' ')}</Tag>,
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 240,
      render: (_: any, r) => (
        <Space size="small" wrap>
          <Button size="small" icon={<PrinterOutlined />} onClick={() => openPrintModal(r)}>
            Print Slip
          </Button>
          {r.status === 'DRAFT' && can('store.issue.post') && (
            <Button size="small" type="primary" icon={<SendOutlined />} onClick={() => handleDispatch(r.id)}>
              Dispatch
            </Button>
          )}
          {r.passType === 'RGP' &&
            ['DISPATCHED', 'PARTIALLY_RETURNED', 'OVERDUE'].includes(r.status) &&
            can('store.return.create') && (
              <Button size="small" icon={<RollbackOutlined />} onClick={() => openReturnModal(r)}>
                Receive Return
              </Button>
            )}
        </Space>
      ),
    },
  ];

  const overdueCount = data.filter((d) => d.status === 'OVERDUE').length;

  return (
    <div>
      <PageHeader
        icon={<SwapOutlined />}
        title="Gate Passes (RGP / NRGP)"
        subtitle="Track Returnable & Non-Returnable outward gate passes and overdue returns"
        extra={
          can('store.issue.create') ? (
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreateModal}>
              New Gate Pass
            </Button>
          ) : null
        }
      />
      <div style={{ padding: '0 16px' }}>
        <Card>
          <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
            <Col xs={24} sm={12} md={8}>
              <Input
                placeholder="Search gate pass #, party, vehicle..."
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
              { key: 'RGP', label: `Returnable (RGP) (${data.filter((d) => d.passType === 'RGP').length})` },
              { key: 'NRGP', label: `Non-Returnable (NRGP) (${data.filter((d) => d.passType === 'NRGP').length})` },
              {
                key: 'OVERDUE',
                label: (
                  <span style={overdueCount > 0 ? { color: token.colorError, fontWeight: 600 } : undefined}>
                    Overdue ({overdueCount})
                  </span>
                ),
              },
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

      {/* Create Gate Pass Modal */}
      <Modal
        title="Create Outward Gate Pass (RGP / NRGP)"
        open={createOpen}
        onOk={handleCreateSubmit}
        onCancel={() => setCreateOpen(false)}
        confirmLoading={saving}
        width={960}
        destroyOnHidden
      >
        <Form form={form} layout="vertical">
          <Row gutter={[16, 8]}>
            <Col xs={24} sm={12} md={6}>
              <Form.Item name="gatePassNumber" label="Gate Pass #" rules={[{ required: true }]}>
                <Input />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12} md={6}>
              <Form.Item name="passType" label="Pass Type" rules={[{ required: true }]}>
                <Select
                  options={[
                    { value: 'RGP', label: 'RGP (Returnable)' },
                    { value: 'NRGP', label: 'NRGP (Non-Returnable)' },
                  ]}
                />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12} md={6}>
              <Form.Item name="issueDate" label="Issue Date" rules={[{ required: true }]}>
                <DatePicker style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12} md={6}>
              <Form.Item
                name="expectedReturnDate"
                label="Expected Return Date"
                rules={passTypeWatch === 'RGP' ? [{ required: true, message: 'Required for RGP' }] : []}
              >
                <DatePicker style={{ width: '100%' }} disabled={passTypeWatch === 'NRGP'} />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={[16, 8]}>
            <Col xs={24} sm={12} md={8}>
              <Form.Item name="storeId" label="Source Store">
                <Select
                  showSearch
                  allowClear
                  optionFilterProp="label"
                  placeholder="Optional source store"
                  options={stores.map((s) => ({ value: s.id, label: `${s.storeCode} — ${s.storeName}` }))}
                />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12} md={8}>
              <Form.Item name="partyName" label="Party / Contractor / Vendor" rules={[{ required: true }]}>
                <Input placeholder="e.g. Precision Machining Works" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12} md={4}>
              <Form.Item name="vehicleNumber" label="Vehicle #">
                <Input placeholder="LEA-1234" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12} md={4}>
              <Form.Item name="driverName" label="Driver Name">
                <Input />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={[16, 8]}>
            <Col xs={24} sm={12}>
              <Form.Item name="purpose" label="Purpose / Work Order">
                <Input placeholder="e.g. Die repair / Calibration / Scrap dispatch" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="authorizedBy" label="Authorized By">
                <Input placeholder="Store / Plant Manager" />
              </Form.Item>
            </Col>
          </Row>
        </Form>

        <Divider orientation="left" style={{ margin: '12px 0' }}>
          Gate Pass Items
        </Divider>
        {draftLines.map((line, idx) => (
          <Row gutter={[8, 8]} key={line.key} style={{ marginBottom: 8 }} align="middle">
            <Col xs={24} md={7}>
              <Select
                showSearch
                allowClear
                placeholder="Link Store Item (optional)"
                optionFilterProp="label"
                style={{ width: '100%' }}
                value={line.itemId}
                onChange={(val) => {
                  const found = items.find((i) => i.id === val);
                  setDraftLines((prev) =>
                    prev.map((l, i) =>
                      i === idx
                        ? {
                            ...l,
                            itemId: val,
                            itemDescription: found ? `${found.itemCode} — ${found.itemName}` : l.itemDescription,
                            uomId: found?.uomId || l.uomId,
                          }
                        : l,
                    ),
                  );
                }}
                options={items.map((i) => ({ value: i.id, label: `${i.itemCode} — ${i.itemName}` }))}
              />
            </Col>
            <Col xs={24} md={7}>
              <Input
                placeholder="Item description *"
                value={line.itemDescription}
                onChange={(e) =>
                  setDraftLines((prev) =>
                    prev.map((l, i) => (i === idx ? { ...l, itemDescription: e.target.value } : l)),
                  )
                }
              />
            </Col>
            <Col xs={12} md={4}>
              <Select
                showSearch
                allowClear
                placeholder="UOM"
                optionFilterProp="label"
                style={{ width: '100%' }}
                value={line.uomId}
                onChange={(val) =>
                  setDraftLines((prev) => prev.map((l, i) => (i === idx ? { ...l, uomId: val } : l)))
                }
                options={uoms.map((u) => ({ value: u.id, label: u.code }))}
              />
            </Col>
            <Col xs={9} md={4}>
              <InputNumber
                min={0.0001}
                step={1}
                placeholder="Qty"
                style={{ width: '100%' }}
                value={line.quantity}
                onChange={(val) =>
                  setDraftLines((prev) =>
                    prev.map((l, i) => (i === idx ? { ...l, quantity: Number(val || 0) } : l)),
                  )
                }
              />
            </Col>
            <Col xs={3} md={2}>
              <Button
                danger
                icon={<DeleteOutlined />}
                disabled={draftLines.length === 1}
                onClick={() => setDraftLines((prev) => prev.filter((_, i) => i !== idx))}
              />
            </Col>
          </Row>
        ))}
        <Button
          type="dashed"
          icon={<PlusOutlined />}
          onClick={() =>
            setDraftLines((prev) => [...prev, { key: `line-${Date.now()}`, itemDescription: '', quantity: 1 }])
          }
        >
          Add Line
        </Button>
      </Modal>

      {/* Receive RGP Return Modal */}
      <Modal
        title={`Receive Return — ${returnModal.record?.gatePassNumber || ''}`}
        open={returnModal.open}
        onOk={handleReceiveReturn}
        onCancel={() => setReturnModal({ open: false, record: null })}
        confirmLoading={returning}
        width={680}
        destroyOnHidden
      >
        {(returnModal.record?.lines || []).map((l) => {
          const remaining = Math.max(0, Number(l.quantity) - Number(l.returnedQty || 0));
          return (
            <Row key={l.id} gutter={[12, 8]} align="middle" style={{ marginBottom: 10 }}>
              <Col xs={24} sm={14}>
                <Text strong>{l.itemDescription}</Text>
                <div>
                  <Text type="secondary">
                    Issued: {l.quantity} | Returned: {l.returnedQty || 0} | Pending: {remaining}
                  </Text>
                </div>
              </Col>
              <Col xs={24} sm={10}>
                <InputNumber
                  min={0}
                  max={remaining}
                  step={1}
                  style={{ width: '100%' }}
                  disabled={remaining <= 0}
                  value={returnQtys[l.id] ?? 0}
                  onChange={(v) => setReturnQtys((prev) => ({ ...prev, [l.id]: Number(v || 0) }))}
                  addonAfter="Return Qty"
                />
              </Col>
            </Row>
          );
        })}
        <Input.TextArea
          rows={2}
          placeholder="Return inspection remarks..."
          value={returnRemarks}
          onChange={(e) => setReturnRemarks(e.target.value)}
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

export default GatePasses;
