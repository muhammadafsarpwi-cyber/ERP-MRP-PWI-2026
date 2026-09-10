import React, { useState, useEffect, useCallback } from 'react';
import {
  Table, Button, Space, Tag, Modal, Form, Input, Select, DatePicker, App, Card,
  Row, Col, Tabs,
} from 'antd';
import {
  PlusOutlined, SearchOutlined, EyeOutlined, FileSearchOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import type { Dayjs } from 'dayjs';
import dayjs from 'dayjs';
import apiService from '../../services/api';
import usePermission from '../../hooks/usePermission';
import { isValidUUID } from '../../utils/uuid';
import { PageHeader } from '../../components/shared';
import StoreLineItemsEditor, { StoreLineItem } from './components/StoreLineItemsEditor';
import RequestDetailDrawer from './components/RequestDetailDrawer';

interface MaterialRequest {
  id: string;
  requestNumber: string;
  requestDate: string;
  requiredDate?: string | null;
  storeId: string;
  storeName?: string;
  divisionId?: string | null;
  departmentId?: string | null;
  sectionId?: string | null;
  purpose?: string | null;
  reason?: string | null;
  priority?: string;
  status: string;
  createdBy?: string | null;
  submittedAt?: string | null;
  approvedAt?: string | null;
  gmApprovedAt?: string | null;
  prNumber?: string | null;
  poNumber?: string | null;
  lineCount?: number;
  createdAt?: string;
}

interface StoreOption {
  id: string;
  storeCode: string;
  storeName: string;
  companyId?: string;
  divisionId?: string | null;
  departmentId?: string | null;
  sectionId?: string | null;
}

const STATUS_OPTIONS = ['ALL', 'MINE', 'DRAFT', 'SUBMITTED', 'APPROVED', 'PARTIALLY_CONVERTED', 'FULLY_CONVERTED', 'REJECTED', 'CANCELLED'];

const statusColors: Record<string, string> = {
  DRAFT: 'default', SUBMITTED: 'processing', APPROVED: 'success',
  PARTIALLY_CONVERTED: 'orange', FULLY_CONVERTED: 'geekblue', REJECTED: 'error', CANCELLED: 'error',
};

const toLinePayload = (lines: StoreLineItem[]) =>
  lines.map((l) => ({
    itemId: l.itemId,
    requestedQuantity: l.requestedQuantity,
    uomId: l.uomId,
    availableStock: l.availableStock,
    minimumStock: l.minimumStock,
    maximumStock: l.maximumStock,
    currentShortage: l.currentShortage,
    requiredDate: l.requiredDate || undefined,
    remarks: l.remarks,
  }));

const MaterialRequestManagement: React.FC = () => {
  const { message } = App.useApp();
  const { can } = usePermission();
  const [data, setData] = useState<MaterialRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState('ALL');
  const [pageSize] = useState(20);

  const [modalState, setModalState] = useState<{ open: boolean; edit: MaterialRequest | null }>({ open: false, edit: null });
  const [form] = Form.useForm();
  const [lineItems, setLineItems] = useState<StoreLineItem[]>([]);
  const [stores, setStores] = useState<StoreOption[]>([]);
  const [storeMap, setStoreMap] = useState<Record<string, string>>({});
  const [departments, setDepartments] = useState<Array<{ id: string; name: string }>>([]);
  const [storeOrg, setStoreOrg] = useState<{ divisionId?: string | null; sectionId?: string | null }>({});
  const [detailRequestId, setDetailRequestId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const [editLinesLoading, setEditLinesLoading] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const s = await apiService.get<StoreOption[]>('/store/stores');
        const arr: StoreOption[] = Array.isArray(s) ? s : [];
        setStores(arr);
        setStoreMap(Object.fromEntries(arr.map((st) => [st.id, `${st.storeCode} — ${st.storeName}`])));
      } catch { /* ignore */ }
      try {
        const d = await apiService.get<{ data: Array<{ id: string; name: string }> }>('/departments', { limit: 500 });
        setDepartments(d.data || []);
      } catch {
        console.warn('[MaterialRequestManagement] Failed to load departments');
      }
    })();
  }, []);

  const fetchData = useCallback(async (pageNum: number = 1) => {
    setLoading(true);
    try {
      const params: any = { page: pageNum, limit: pageSize };
      if (search) params.search = search;
      if (tab === 'MINE') params.mine = true;
      else if (tab !== 'ALL') params.status = tab;
      const response = await apiService.get<{ data: MaterialRequest[]; total: number }>('/store/material-requests', params);
      setData(response.data);
      setTotal(response.total);
    } catch {
      message.error('Failed to fetch material requests');
    } finally {
      setLoading(false);
    }
  }, [search, tab, pageSize, message]);

  useEffect(() => { fetchData(page); }, [page, fetchData]);

  const handleCreate = () => {
    form.resetFields();
    setStoreOrg({});
    form.setFieldsValue({ requestDate: dayjs(), priority: 'NORMAL' });
    setLineItems([]);
    setModalState({ open: true, edit: null });
  };

  const handleStoreChange = (storeId?: string) => {
    const selected = stores.find((s) => s.id === storeId);
    if (selected) {
      setStoreOrg({ divisionId: selected.divisionId || undefined, sectionId: selected.sectionId || undefined });
      if (selected.departmentId && isValidUUID(selected.departmentId)) {
        form.setFieldsValue({ departmentId: selected.departmentId });
      }
    } else {
      setStoreOrg({});
    }
  };

  const handleEdit = async (record: MaterialRequest) => {
    form.resetFields();
    setStoreOrg({});
    const sanitized = { ...record };
    if (sanitized.departmentId && !isValidUUID(sanitized.departmentId)) {
      sanitized.departmentId = null;
    }
    if (sanitized.divisionId && !isValidUUID(sanitized.divisionId)) {
      sanitized.divisionId = null;
    }
    if (sanitized.sectionId && !isValidUUID(sanitized.sectionId)) {
      sanitized.sectionId = null;
    }
    form.setFieldsValue({
      ...sanitized,
      requestDate: record.requestDate ? dayjs(record.requestDate) : undefined,
      requiredDate: record.requiredDate ? dayjs(record.requiredDate) : undefined,
    });
    setLineItems([]);
    setModalState({ open: true, edit: record });
    if (record.id) {
      setEditLinesLoading(true);
      try {
        const d = await apiService.get<any>(`/store/material-requests/${record.id}`);
        setLineItems((d.lines || []).map((l: any) => ({
          key: `line-${l.id}`,
          itemId: l.itemId,
          itemCode: l.itemCode,
          itemName: l.itemName,
          uomId: l.uomId,
          uomCode: l.uomCode,
          requestedQuantity: l.requestedQuantity,
          availableStock: l.availableStock,
          minimumStock: l.minimumStock,
          maximumStock: l.maximumStock,
          currentShortage: l.currentShortage,
          requiredDate: l.requiredDate,
          remarks: l.remarks,
        })));
      } catch {
        message.error('Failed to load request lines');
      } finally {
        setEditLinesLoading(false);
      }
    }
  };

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      if (lineItems.length === 0) {
        message.warning('Add at least one line item');
        return;
      }
      if (values.storeId && !isValidUUID(values.storeId)) {
        message.error('Invalid store selection. Please re-select the store.');
        return;
      }
      if (values.departmentId && !isValidUUID(values.departmentId)) {
        message.error('Invalid department selection. Please re-select from the dropdown.');
        return;
      }
      for (const line of lineItems) {
        if (!isValidUUID(line.itemId)) {
          message.error(`Invalid item in line "${line.itemName || 'unknown'}"`);
          return;
        }
        if (!isValidUUID(line.uomId)) {
          message.error(`Invalid UOM in line "${line.itemName || 'unknown'}"`);
          return;
        }
      }
      const payload = {
        requestNumber: values.requestNumber,
        requestDate: values.requestDate ? values.requestDate.format('YYYY-MM-DD') : undefined,
        requiredDate: values.requiredDate ? values.requiredDate.format('YYYY-MM-DD') : undefined,
        storeId: values.storeId,
        departmentId: values.departmentId || undefined,
        divisionId: storeOrg.divisionId || undefined,
        sectionId: storeOrg.sectionId || undefined,
        purpose: values.purpose,
        reason: values.reason,
        priority: values.priority,
        remarks: values.remarks,
        lines: toLinePayload(lineItems),
      };
      if (modalState.edit?.id) {
        await apiService.put(`/store/material-requests/${modalState.edit.id}`, payload);
        message.success('Material request updated');
      } else {
        await apiService.post('/store/material-requests', payload);
        message.success('Material request created');
      }
      setModalState({ open: false, edit: null });
      fetchData(page);
    } catch (err: any) {
      const msg: any = err?.response?.data?.message;
      message.error(Array.isArray(msg) ? msg[0] : 'Failed to save material request');
    }
  };

  const handleAction = async (id: string, action: string) => {
    try {
      await apiService.post(`/store/material-requests/${id}/${action}`, {});
      message.success(`Request ${action.replace('-', ' ')}d`);
      fetchData(page);
      if (detailRequestId === id) setDetailRequestId(null);
    } catch (err: any) {
      message.error(err?.response?.data?.message || `Failed to ${action} request`);
    }
  };

  const openDetail = (id: string) => {
    setDetailRequestId(id);
    setDetailOpen(true);
  };

  const columns: ColumnsType<MaterialRequest> = [
    { title: 'Request No', dataIndex: 'requestNumber', key: 'requestNumber', width: 140 },
    { title: 'Date', dataIndex: 'requestDate', key: 'requestDate', width: 110, render: (v) => String(v || '').slice(0, 10) },
    { title: 'Required Date', dataIndex: 'requiredDate', key: 'requiredDate', width: 110, render: (v) => v ? String(v).slice(0, 10) : '—' },
    { title: 'Store', dataIndex: 'storeName', key: 'storeName', width: 130, render: (v, r) => storeMap[r.storeId] || v || r.storeId },
    { title: 'Priority', dataIndex: 'priority', key: 'priority', width: 90, render: (v) => <Tag color={v === 'URGENT' ? 'red' : v === 'HIGH' ? 'volcano' : 'blue'}>{v || 'NORMAL'}</Tag> },
    { title: 'Items', dataIndex: 'lineCount', key: 'lineCount', width: 70, align: 'right' },
    { title: 'PR No', dataIndex: 'prNumber', key: 'prNumber', width: 120, render: (v) => v ? <Tag color="geekblue">{v}</Tag> : '—' },
    {
      title: 'Status', dataIndex: 'status', key: 'status', width: 150,
      render: (status: string) => (
        <Space direction="vertical" size={0}>
          <Tag color={statusColors[status] || 'default'}>{status}</Tag>
          {(status === 'PARTIALLY_CONVERTED' || status === 'FULLY_CONVERTED') && <Tag color="geekblue">PR created</Tag>}
        </Space>
      ),
    },
    { title: 'Requested By', dataIndex: 'createdBy', key: 'createdBy', width: 130, render: (v) => v || '—' },
    {
      title: 'Actions', key: 'actions', width: 320, fixed: 'right',
      render: (_, record) => (
        <Space wrap size={4}>
          <Button size="small" icon={<EyeOutlined />} onClick={() => openDetail(record.id)}>View</Button>
          {record.status === 'DRAFT' && can('store.request.create') && (
            <Button size="small" onClick={() => handleEdit(record)}>Edit</Button>
          )}
          {record.status === 'DRAFT' && can('store.request.submit') && (
            <Button size="small" type="primary" onClick={() => handleAction(record.id, 'submit')}>Submit</Button>
          )}
          {record.status === 'SUBMITTED' && can('store.request.approve') && (
            <Button size="small" onClick={() => handleAction(record.id, 'approve')}>Manager Approve</Button>
          )}
          {record.status === 'APPROVED' && !record.gmApprovedAt && can('store.request.gm_approve') && (
            <Button size="small" onClick={() => handleAction(record.id, 'gm-approve')}>GM Approve</Button>
          )}
          {record.status === 'APPROVED' && record.gmApprovedAt && can('store.request.convert') && (
            <Button size="small" type="primary" onClick={() => handleAction(record.id, 'convert-pr')}>Convert to PR</Button>
          )}
          {(record.status === 'SUBMITTED' || record.status === 'APPROVED') && can('store.request.reject') && (
            <Button size="small" danger onClick={() => handleAction(record.id, 'reject')}>Reject</Button>
          )}
          {(record.status === 'DRAFT' || record.status === 'SUBMITTED' || record.status === 'APPROVED') && can('store.request.create') && (
            <Button size="small" type="text" danger onClick={() => handleAction(record.id, 'cancel')}>Cancel</Button>
          )}
        </Space>
      ),
    },
  ];

  return (
    <Card>
      <PageHeader icon={<FileSearchOutlined />} title="Material Requests" subtitle="Request materials from stores through the approval workflow" />
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={8}>
          <Input placeholder="Search by request number..." prefix={<SearchOutlined />} value={search} onChange={(e) => setSearch(e.target.value)} onPressEnter={() => fetchData(1)} />
        </Col>
        <Col span={4}>
          <Button type="default" onClick={() => fetchData(1)}>Search</Button>
        </Col>
        <Col span={4} style={{ textAlign: 'right' }}>
          {can('store.request.create') ? (
            <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>New Request</Button>
          ) : null}
        </Col>
      </Row>
      <Tabs
        activeKey={tab}
        onChange={(key) => { setTab(key); setPage(1); }}
        items={STATUS_OPTIONS.map((s) => ({
          key: s,
          label: s === 'ALL' ? 'All' : s === 'MINE' ? 'My Requests' : s.split('_').map((w) => w[0] + w.slice(1).toLowerCase()).join(' '),
        }))}
      />
      <Table columns={columns} dataSource={data} rowKey="id" loading={loading} scroll={{ x: 1200 }}
        pagination={{ current: page, total, pageSize, showSizeChanger: false, onChange: setPage }} />

      <Modal
        title={modalState.edit ? `Edit Request ${modalState.edit.requestNumber}` : 'Create Material Request'}
        open={modalState.open}
        onOk={handleSave}
        onCancel={() => setModalState({ open: false, edit: null })}
        width={1100}
        destroyOnHidden
      >
        <Form form={form} layout="vertical">
          <Row gutter={16}>
            <Col span={6}>
              <Form.Item name="requestNumber" label="Request Number" rules={[{ required: true }]}>
                <Input placeholder="MR-2026-0001" disabled={!!modalState.edit} />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="requestDate" label="Request Date" rules={[{ required: true }]}>
                <DatePicker style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="requiredDate" label="Required Date">
                <DatePicker style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="storeId" label="Store" rules={[{ required: true }]}>
                <Select
                  showSearch
                  optionFilterProp="label"
                  placeholder="Select store"
                  onChange={handleStoreChange}
                  options={stores.map((s) => ({ value: s.id, label: `${s.storeCode} — ${s.storeName}` }))}
                />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item name="departmentId" label="Department">
                <Select
                  showSearch
                  optionFilterProp="label"
                  allowClear
                  options={departments.map((d) => ({ value: d.id, label: d.name }))}
                />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="priority" label="Priority">
                <Select options={[{ value: 'NORMAL', label: 'NORMAL' }, { value: 'HIGH', label: 'HIGH' }, { value: 'URGENT', label: 'URGENT' }]} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="reason" label="Reason">
                <Input placeholder="Reason for request" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="purpose" label="Purpose">
            <Input.TextArea rows={2} placeholder="Describe the purpose of the request" />
          </Form.Item>
          <Form.Item name="remarks" label="Remarks">
            <Input.TextArea rows={2} />
          </Form.Item>
          <StoreLineItemsEditor mode="request" value={lineItems} onChange={setLineItems} label="Requested Items" />
        </Form>
      </Modal>

      <RequestDetailDrawer
        requestId={detailRequestId}
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        onRefresh={() => fetchData(page)}
      />
    </Card>
  );
};

export default MaterialRequestManagement;