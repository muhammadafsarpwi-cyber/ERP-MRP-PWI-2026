import React, { useState, useEffect, useCallback } from 'react';
import {
  Card,
  Table,
  Tag,
  Button,
  Space,
  Select,
  Input,
  Row,
  Col,
  Statistic,
  Modal,
  Form,
  DatePicker,
  InputNumber,
  Dropdown,
  App,
} from 'antd';
import {
  StockOutlined,
  ReloadOutlined,
  FileAddOutlined,
  SwapOutlined,
  EditOutlined,
  ClockCircleOutlined,
  StopOutlined,
  UndoOutlined,
  MoreOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import apiService from '../../services/api';
import { usePermission } from '../../hooks/usePermission';
import PageHeader from '../../components/shared/PageHeader';

interface Kpi {
  key: string;
  label: string;
  value: number;
  color: string;
}

interface ReplenishmentRow {
  id: string;
  companyId: string;
  storeId: string;
  storeItemId: string | null;
  itemId: string;
  warehouseId: string | null;
  divisionId: string | null;
  sectionId: string | null;
  departmentId: string | null;
  uomId: string | null;
  onHand: number;
  reserved: number;
  available: number;
  minimumStock: number;
  reorderLevel: number;
  maximumStock: number;
  reorderQuantity: number | null;
  requiredQuantity: number;
  alreadyInProcurement: number;
  pendingReceipt: number;
  remainingRequirement: number;
  status: string;
  source: string;
  autoCreateMr: boolean;
  materialRequestId: string | null;
  materialRequestNumber: string | null;
  prId: string | null;
  prNumber: string | null;
  poId: string | null;
  poNumber: string | null;
  expectedDeliveryDate: string | null;
  overdueSince: string | null;
  deferred: boolean;
  deferredUntil: string | null;
  deferredReason: string | null;
  cancelled: boolean;
  cancelReason: string | null;
  adjustedQuantity: number | null;
  adjustedReason: string | null;
  itemCode: string;
  itemName: string;
  storeCode: string;
  storeName: string;
  uomCode: string | null;
  divisionName: string | null;
  sectionName: string | null;
  departmentName: string | null;
  warehouseName: string | null;
  lastCheckedAt: string | null;
}

interface StoreOption {
  id: string;
  storeCode: string;
  storeName: string;
}

const STATUS_META: Record<string, { color: string; label: string }> = {
  NORMAL: { color: 'default', label: 'NORMAL' },
  LOW_STOCK: { color: 'red', label: 'LOW STOCK' },
  REORDER_REQUIRED: { color: 'orange', label: 'REORDER REQUIRED' },
  PR_PENDING: { color: 'purple', label: 'PR PENDING' },
  MANAGER_APPROVAL: { color: 'gold', label: 'MANAGER APPROVAL' },
  GM_APPROVAL: { color: 'cyan', label: 'GM APPROVAL' },
  ORDERED: { color: 'geekblue', label: 'ORDERED' },
  PARTIALLY_RECEIVED: { color: 'blue', label: 'PARTIALLY RECEIVED' },
  RECEIVED: { color: 'green', label: 'RECEIVED' },
  OVERDUE: { color: 'volcano', label: 'OVERDUE' },
  DEFERRED: { color: 'default', label: 'DEFERRED' },
  CANCELLED: { color: 'default', label: 'CANCELLED' },
};

const KPI_STATUS_MAP: Record<string, string> = {
  lowStock: 'LOW_STOCK',
  reorderRequired: 'REORDER_REQUIRED',
  prPending: 'PR_PENDING',
  pendingManagerApproval: 'MANAGER_APPROVAL',
  pendingGmApproval: 'GM_APPROVAL',
  ordered: 'ORDERED',
  pendingReceipt: 'PARTIALLY_RECEIVED',
  overdue: 'OVERDUE',
};

const fmt = (v: number | null | undefined): string => {
  const n = Number(v || 0);
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
};

const LowStockQueue: React.FC = () => {
  const { can } = usePermission();
  const { message } = App.useApp();

  const [rows, setRows] = useState<ReplenishmentRow[]>([]);
  const [total, setTotal] = useState(0);
  const [kpis, setKpis] = useState<Kpi[]>([]);
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<string | undefined>();
  const [storeId, setStoreId] = useState<string | undefined>();
  const [divisionId, setDivisionId] = useState<string | undefined>();
  const [stores, setStores] = useState<StoreOption[]>([]);
  const [divisions, setDivisions] = useState<Array<{ id: string; name: string }>>([]);

  const [adjustRow, setAdjustRow] = useState<ReplenishmentRow | null>(null);
  const [deferRow, setDeferRow] = useState<ReplenishmentRow | null>(null);
  const [cancelRow, setCancelRow] = useState<ReplenishmentRow | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const [form] = Form.useForm();

  const loadFilters = useCallback(async () => {
    try {
      const storeRes = await apiService.get<StoreOption[]>('/store/stores');
      setStores(Array.isArray(storeRes) ? storeRes : []);
    } catch {
      setStores([]);
    }
    try {
      const divRes = await apiService.get<{ data: Array<{ id: string; name: string }>; total: number }>('/divisions', { limit: 100 });
      setDivisions(divRes.data || []);
    } catch {
      setDivisions([]);
    }
  }, []);

  const loadKpis = useCallback(async () => {
    try {
      const res = await apiService.get<{ kpis: Kpi[] }>('/store/replenishment/kpis');
      setKpis(res.kpis || []);
    } catch {
      setKpis([]);
    }
  }, []);

  const fetchQueue = useCallback(
    async (pageNum: number = 1) => {
      setLoading(true);
      try {
        const params: Record<string, any> = { page: pageNum, limit: pageSize };
        if (search) params.search = search;
        if (status) {
          if (['LOW_STOCK', 'REORDER_REQUIRED', 'OVERDUE', 'PARTIALLY_RECEIVED'].includes(status)) {
            params.statuses = status === 'PARTIALLY_RECEIVED' ? 'PARTIALLY_RECEIVED,RECEIVED' : status;
          } else {
            params.status = status;
          }
        }
        if (storeId) params.storeId = storeId;
        if (divisionId) params.divisionId = divisionId;
        const res = await apiService.get<{ data: ReplenishmentRow[]; total: number; page: number }>('/store/replenishment', params);
        setRows(res.data || []);
        setTotal(res.total || 0);
      } catch (err: any) {
        message.error(err?.response?.data?.message || 'Failed to load replenishment queue');
        setRows([]);
      } finally {
        setLoading(false);
      }
    },
    [search, status, storeId, divisionId, pageSize, message],
  );

  useEffect(() => {
    loadFilters();
  }, [loadFilters]);

  useEffect(() => {
    loadKpis();
  }, [loadKpis]);

  useEffect(() => {
    fetchQueue(1);
    setPage(1);
  }, [fetchQueue]);

  const runCheck = async () => {
    setRunning(true);
    try {
      const res = await apiService.post<{ rowsChecked: number; requestsAutoCreated: number }>('/store/replenishment/run');
      message.success(
        `Replenishment check complete: ${res.rowsChecked} rows checked, ${res.requestsAutoCreated} requests auto-created`,
      );
      loadKpis();
      fetchQueue(page);
    } catch (err: any) {
      message.error(err?.response?.data?.message || 'Failed to run replenishment check');
    } finally {
      setRunning(false);
    }
  };

  const postAction = async (url: string, body?: any, successMsg?: string) => {
    setActionLoading(true);
    try {
      await apiService.post(url, body);
      message.success(successMsg || 'Action completed');
      loadKpis();
      fetchQueue(page);
      return true;
    } catch (err: any) {
      message.error(err?.response?.data?.message || 'Action failed');
      return false;
    } finally {
      setActionLoading(false);
    }
  };

  const openAdjust = (row: ReplenishmentRow) => {
    setAdjustRow(row);
    form.resetFields();
    form.setFieldsValue({ quantity: Number(row.adjustedQuantity ?? row.remainingRequirement), reason: '' });
  };

  const submitAdjust = async () => {
    const values = await form.validateFields();
    const ok = await postAction(`/store/replenishment/${adjustRow?.id}/adjust`, values, 'Quantity adjusted');
    if (ok) setAdjustRow(null);
  };

  const openDefer = (row: ReplenishmentRow) => {
    setDeferRow(row);
    form.resetFields();
    form.setFieldsValue({ until: undefined, reason: '' });
  };

  const submitDefer = async () => {
    const values = await form.validateFields();
    const ok = await postAction(
      `/store/replenishment/${deferRow?.id}/defer`,
      { until: values.until ? values.until.format('YYYY-MM-DD') : undefined, reason: values.reason },
      'Requirement deferred',
    );
    if (ok) setDeferRow(null);
  };

  const openCancel = (row: ReplenishmentRow) => {
    setCancelRow(row);
    form.resetFields();
    form.setFieldsValue({ reason: '' });
  };

  const submitCancel = async () => {
    const values = await form.validateFields();
    const ok = await postAction(`/store/replenishment/${cancelRow?.id}/cancel`, values, 'Requirement cancelled');
    if (ok) setCancelRow(null);
  };

  const createMr = async (row: ReplenishmentRow) => {
    await postAction(`/store/replenishment/${row.id}/create-mr`, {}, 'Material request created');
  };

  const convertPr = async (row: ReplenishmentRow) => {
    await postAction(`/store/replenishment/${row.id}/convert-pr`, {}, 'Converted to purchase requisition');
  };

  const unreview = async (row: ReplenishmentRow) => {
    await postAction(`/store/replenishment/${row.id}/unreview`, {}, 'Replenishment re-activated');
  };

  const renderStatus = (statusValue: string) => {
    const meta = STATUS_META[statusValue] || { color: 'default', label: statusValue };
    return <Tag color={meta.color}>{meta.label}</Tag>;
  };

  const renderActions = (row: ReplenishmentRow) => {
    const items: Array<{ key: string; label: React.ReactNode; disabled?: boolean }> = [];
    if (can('store.replenishment.create') && !row.cancelled && !row.deferred && !row.materialRequestId) {
      items.push({ key: 'create-mr', label: <span><FileAddOutlined /> Create Material Request</span> });
    }
    if (can('store.replenishment.convert') && !row.cancelled && row.materialRequestId && !row.prId) {
      items.push({ key: 'convert', label: <span><SwapOutlined /> Convert to PR</span> });
    }
    if (can('store.replenishment.override') && !row.cancelled) {
      items.push({ key: 'adjust', label: <span><EditOutlined /> Adjust Quantity</span> });
    }
    if (can('store.replenishment.override') && !row.cancelled && !row.deferred) {
      items.push({ key: 'defer', label: <span><ClockCircleOutlined /> Defer</span> });
    }
    if (can('store.replenishment.override') && !row.cancelled) {
      items.push({ key: 'cancel', label: <span><StopOutlined /> Cancel</span> });
    }
    if (can('store.replenishment.override') && (row.deferred || row.cancelled)) {
      items.push({ key: 'unreview', label: <span><UndoOutlined /> Re-activate</span> });
    }
    if (items.length === 0) return null;

    return (
      <Dropdown
        menu={{
          items,
          onClick: ({ key }) => {
            if (key === 'create-mr') createMr(row);
            else if (key === 'convert') convertPr(row);
            else if (key === 'adjust') openAdjust(row);
            else if (key === 'defer') openDefer(row);
            else if (key === 'cancel') openCancel(row);
            else if (key === 'unreview') unreview(row);
          },
        }}
      >
        <Button type="link" size="small" icon={<MoreOutlined />} />
      </Dropdown>
    );
  };

  const columns: ColumnsType<ReplenishmentRow> = [
    {
      title: 'Store',
      key: 'store',
      width: 150,
      render: (_: any, r) => (
        <span>{r.storeCode} - {r.storeName}</span>
      ),
    },
    {
      title: 'Item',
      key: 'item',
      width: 200,
      render: (_: any, r) => (
        <div>
          <div style={{ fontWeight: 500 }}>{r.itemName}</div>
          <div style={{ color: '#888', fontSize: 12 }}>{r.itemCode}</div>
        </div>
      ),
    },
    { title: 'UOM', dataIndex: 'uomCode', key: 'uomCode', width: 60 },
    {
      title: 'Division / Section / Department',
      key: 'org',
      width: 180,
      render: (_: any, r) => (
        <span>
          {r.divisionName || '-'}
          {r.sectionName ? ` / ${r.sectionName}` : ''}
          {r.departmentName ? ` / ${r.departmentName}` : ''}
        </span>
      ),
    },
    { title: 'On Hand', dataIndex: 'onHand', key: 'onHand', width: 90, align: 'right', render: fmt },
    { title: 'Reserved', dataIndex: 'reserved', key: 'reserved', width: 90, align: 'right', render: fmt },
    {
      title: 'Available',
      dataIndex: 'available',
      key: 'available',
      width: 100,
      align: 'right',
      render: (v: number, r) => (
        <span style={Number(v) <= Number(r.reorderLevel) ? { color: '#ff4d4f', fontWeight: 600 } : undefined}>{fmt(v)}</span>
      ),
      sorter: (a, b) => a.available - b.available,
      defaultSortOrder: 'ascend',
    },
    { title: 'Reorder', dataIndex: 'reorderLevel', key: 'reorderLevel', width: 85, align: 'right', render: fmt },
    { title: 'Minimum', dataIndex: 'minimumStock', key: 'minimumStock', width: 85, align: 'right', render: fmt },
    { title: 'Maximum', dataIndex: 'maximumStock', key: 'maximumStock', width: 85, align: 'right', render: fmt },
    {
      title: 'Required',
      dataIndex: 'requiredQuantity',
      key: 'requiredQuantity',
      width: 95,
      align: 'right',
      render: (v: number) => (v > 0 ? <b>{fmt(v)}</b> : '-'),
      sorter: (a, b) => a.requiredQuantity - b.requiredQuantity,
    },
    {
      title: 'In Procurement',
      dataIndex: 'alreadyInProcurement',
      key: 'alreadyInProcurement',
      width: 115,
      align: 'right',
      render: (v: number) => (v > 0 ? fmt(v) : '-'),
    },
    {
      title: 'Pending Receipt',
      dataIndex: 'pendingReceipt',
      key: 'pendingReceipt',
      width: 115,
      align: 'right',
      render: (v: number) => (v > 0 ? fmt(v) : '-'),
    },
    {
      title: 'Remaining',
      dataIndex: 'remainingRequirement',
      key: 'remainingRequirement',
      width: 105,
      align: 'right',
      render: (v: number) => (v > 0 ? <b>{fmt(v)}</b> : '-'),
      sorter: (a, b) => a.remainingRequirement - b.remainingRequirement,
    },
    {
      title: 'References',
      key: 'refs',
      width: 150,
      render: (_: any, r) => (
        <Space direction="vertical" size={0}>
          {r.materialRequestNumber && <Tag>MR {r.materialRequestNumber}</Tag>}
          {r.prNumber && <Tag color="purple">PR {r.prNumber}</Tag>}
          {r.poNumber && <Tag color="geekblue">PO {r.poNumber}</Tag>}
          {!r.materialRequestNumber && !r.prNumber && !r.poNumber && '-'}
        </Space>
      ),
    },
    {
      title: 'Delivery',
      key: 'delivery',
      width: 120,
      render: (_: any, r) => {
        if (r.expectedDeliveryDate) {
          const overdue = r.overdueSince && dayjs(r.overdueSince).isBefore(dayjs(), 'day');
          return (
            <span>
              {r.expectedDeliveryDate}
              {overdue && <Tag color="volcano" style={{ marginLeft: 6 }}>OVERDUE</Tag>}
            </span>
          );
        }
        return r.deferred && r.deferredUntil ? `Deferred to ${r.deferredUntil}` : '-';
      },
    },
    { title: 'Status', dataIndex: 'status', key: 'status', width: 160, render: renderStatus },
    {
      title: 'Action',
      key: 'action',
      width: 90,
      fixed: 'right',
      render: (_: any, r) => renderActions(r),
    },
  ];

  const renderKpi = (kpi: Kpi) => {
    const statusFilter = KPI_STATUS_MAP[kpi.key];
    const clickable = !!statusFilter;
    return (
      <Col xs={12} sm={8} md={8} lg={6} xl={4} key={kpi.key}>
        <Card
          size="small"
          hoverable={clickable}
          onClick={clickable ? () => setStatus(statusFilter) : undefined}
          style={{ cursor: clickable ? 'pointer' : 'default', marginBottom: 16 }}
        >
          <Statistic
            title={kpi.label}
            value={kpi.value}
            valueStyle={{ color: { lowStock: '#ff4d4f', reorderRequired: '#fa8c16', overdue: '#d4380d' }[kpi.key] || undefined }}
          />
        </Card>
      </Col>
    );
  };

  return (
    <div>
      <PageHeader icon={<StockOutlined />} title="Store Replenishment Queue" />
      <div style={{ padding: '0 24px' }}>
        <Row gutter={16} style={{ marginBottom: 4 }}>
          {kpis.map(renderKpi)}
        </Row>

        <Card style={{ marginBottom: 16 }}>
          <Space wrap>
            <Input.Search
              placeholder="Search item / store"
              allowClear
              style={{ width: 240 }}
              onSearch={(v) => { setSearch(v); }}
            />
            <Select
              placeholder="Status"
              allowClear
              style={{ width: 200 }}
              value={status}
              onChange={setStatus}
              options={Object.entries(STATUS_META).map(([value, meta]) => ({ value, label: meta.label }))}
            />
            <Select
              placeholder="Store"
              allowClear
              showSearch
              optionFilterProp="label"
              style={{ width: 200 }}
              value={storeId}
              onChange={setStoreId}
              options={stores.map((s) => ({ value: s.id, label: `${s.storeCode} - ${s.storeName}` }))}
            />
            <Select
              placeholder="Division"
              allowClear
              showSearch
              optionFilterProp="label"
              style={{ width: 200 }}
              value={divisionId}
              onChange={setDivisionId}
              options={divisions.map((d) => ({ value: d.id, label: d.name }))}
            />
            <Button type="primary" icon={<ReloadOutlined />} loading={running} onClick={runCheck}>
              Run Replenishment Check
            </Button>
          </Space>
        </Card>

        <Card>
          <Table
            columns={columns}
            dataSource={rows}
            rowKey="id"
            loading={loading}
            size="middle"
            scroll={{ x: 2100 }}
            pagination={{
              current: page,
              pageSize,
              total,
              showSizeChanger: false,
              showTotal: (t) => `${t} replenishment rows`,
              onChange: (p) => {
                setPage(p);
                fetchQueue(p);
              },
            }}
            locale={{ emptyText: 'No replenishment requirements. Click "Run Replenishment Check" to evaluate stock against min / reorder / max.' }}
          />
        </Card>
      </div>

      <Modal title={`Adjust Quantity - ${adjustRow?.itemName || ''}`} open={!!adjustRow} onOk={submitAdjust} confirmLoading={actionLoading} onCancel={() => setAdjustRow(null)}>
        <Form form={form} layout="vertical">
          <Form.Item name="quantity" label="Adjusted Required Quantity" rules={[{ required: true, message: 'Enter quantity' }]}>
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="reason" label="Reason" rules={[{ required: true, message: 'Reason is required (audited)' }]}>
            <Input.TextArea rows={3} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal title={`Defer - ${deferRow?.itemName || ''}`} open={!!deferRow} onOk={submitDefer} confirmLoading={actionLoading} onCancel={() => setDeferRow(null)}>
        <Form form={form} layout="vertical">
          <Form.Item name="until" label="Defer Until" tooltip="Leave empty to defer indefinitely">
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="reason" label="Reason" rules={[{ required: true, message: 'Reason is required (audited)' }]}>
            <Input.TextArea rows={3} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal title={`Cancel - ${cancelRow?.itemName || ''}`} open={!!cancelRow} onOk={submitCancel} confirmLoading={actionLoading} onCancel={() => setCancelRow(null)}>
        <Form form={form} layout="vertical">
          <Form.Item name="reason" label="Reason" rules={[{ required: true, message: 'Reason is required (audited)' }]}>
            <Input.TextArea rows={3} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default LowStockQueue;