import React, { useState, useEffect, useCallback } from 'react';
import {
  Card, Table, Button, Space, Modal, Form, Input, Select, Tag, App, DatePicker, Row, Col, Tabs, Drawer, Descriptions, Typography,
} from 'antd';
import { PlusOutlined, ExportOutlined, EyeOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import apiService from '../../services/api';
import { usePermission } from '../../hooks/usePermission';
import PageHeader from '../../components/shared/PageHeader';
import StoreLineItemsEditor, { StoreLineItem } from './components/StoreLineItemsEditor';

interface MaterialIssueLine {
  id: string;
  lineNumber: number;
  itemId: string;
  itemName?: string;
  itemCode?: string;
  quantity: number;
  uomId: string;
  uomCode?: string;
  remarks?: string;
}

interface MaterialIssue {
  id: string;
  issueNumber: string;
  issueDate: string;
  storeId: string;
  storeName?: string;
  issuedToDepartmentId: string;
  purpose?: string;
  remarks?: string;
  status: string;
  lineCount?: number;
  createdAt: string;
}

const STATUS_OPTIONS = ['ALL', 'DRAFT', 'POSTED', 'CANCELLED'];

const detailLineColumns: ColumnsType<MaterialIssueLine> = [
  { title: '#', dataIndex: 'lineNumber', width: 40 },
  { title: 'Item', key: 'item', render: (_, r) => r.itemCode ? `${r.itemCode}${r.itemName ? ` — ${r.itemName}` : ''}` : r.itemId },
  { title: 'Quantity', dataIndex: 'quantity', width: 100, align: 'right' },
  { title: 'UOM', dataIndex: 'uomCode', width: 90 },
  { title: 'Remarks', dataIndex: 'remarks', width: 160 },
];

const MaterialIssueManagement: React.FC = () => {
  const { message, modal } = App.useApp();
  const { can } = usePermission();
  const canCreate = can('store.issue.create');
  const canPost = can('store.issue.post');

  const [data, setData] = useState<MaterialIssue[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState('ALL');
  const [pageSize] = useState(20);

  const [modalState, setModalState] = useState<{ open: boolean; edit: MaterialIssue | null }>({ open: false, edit: null });
  const [form] = Form.useForm();
  const [lineItems, setLineItems] = useState<StoreLineItem[]>([]);
  const [stores, setStores] = useState<Array<{ id: string; code: string; name: string }>>([]);
  const [storeMap, setStoreMap] = useState<Record<string, string>>({});
  const [departments, setDepartments] = useState<Array<{ id: string; name: string }>>([]);

  const [detail, setDetail] = useState<MaterialIssue | null>(null);
  const [detailLines, setDetailLines] = useState<MaterialIssueLine[]>([]);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const s = await apiService.get<Array<{ id: string; code: string; name: string }>>('/store/stores');
        const arr = Array.isArray(s) ? s : [];
        setStores(arr);
        setStoreMap(Object.fromEntries(arr.map((st) => [st.id, `${st.code} — ${st.name}`])));
      } catch { /* ignore */ }
      try {
        const d = await apiService.get<{ data: Array<{ id: string; name: string }> }>('/departments', { limit: 500 });
        setDepartments(d.data || []);
      } catch { /* ignore */ }
    })();
  }, []);

  const fetchData = useCallback(async (pageNum: number = 1) => {
    setLoading(true);
    try {
      const params: any = { page: pageNum, limit: pageSize };
      if (search) params.search = search;
      if (tab !== 'ALL') params.status = tab;
      const response = await apiService.get<{ data: MaterialIssue[]; total: number }>('/store/material-issues', params);
      setData(response.data);
      setTotal(response.total);
    } catch (error) {
      message.error('Failed to load material issues');
    } finally {
      setLoading(false);
    }
  }, [search, tab, pageSize, message]);

  useEffect(() => { fetchData(page); }, [page, fetchData]);

  const handleCreate = () => {
    form.resetFields();
    form.setFieldsValue({ issueDate: dayjs() });
    setLineItems([]);
    setModalState({ open: true, edit: null });
  };

  const handleEdit = async (record: MaterialIssue) => {
    form.resetFields();
    form.setFieldsValue({
      ...record,
      issueDate: record.issueDate ? dayjs(record.issueDate) : undefined,
    });
    setLineItems([]);
    setModalState({ open: true, edit: record });
    try {
      const d = await apiService.get<any>(`/store/material-issues/${record.id}`);
      setLineItems((d.lines || []).map((l: any) => ({
        key: `line-${l.id}`,
        itemId: l.itemId,
        itemCode: l.itemCode,
        itemName: l.itemName,
        uomId: l.uomId,
        quantity: l.quantity,
        remarks: l.remarks,
      })));
    } catch {
      message.error('Failed to load issue lines');
    }
  };

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      if (lineItems.length === 0) {
        message.warning('Add at least one line item');
        return;
      }
      const payload = {
        issueNumber: values.issueNumber,
        issueDate: values.issueDate ? values.issueDate.format('YYYY-MM-DD') : undefined,
        storeId: values.storeId,
        issuedToDepartmentId: values.issuedToDepartmentId,
        purpose: values.purpose,
        remarks: values.remarks,
        lines: lineItems.map((l) => ({
          itemId: l.itemId,
          quantity: l.quantity,
          uomId: l.uomId,
          remarks: l.remarks,
        })),
      };
      if (modalState.edit?.id) {
        await apiService.put(`/store/material-issues/${modalState.edit.id}`, payload);
        message.success('Material issue updated');
      } else {
        await apiService.post('/store/material-issues', payload);
        message.success('Material issue created');
      }
      setModalState({ open: false, edit: null });
      fetchData(page);
    } catch (err: any) {
      const msg: any = err?.response?.data?.message;
      message.error(Array.isArray(msg) ? msg[0] : 'Failed to save material issue');
    }
  };

  const handlePost = (id: string) => {
    modal.confirm({
      title: 'Post Material Issue',
      content: 'Posting will deduct stock from the store (GRN/inventory) and record the issue in the store ledger. This cannot be undone. Continue?',
      okText: 'Post',
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await apiService.post(`/store/material-issues/${id}/post`);
          message.success('Material issue posted successfully');
          fetchData(page);
          setDetailOpen(false);
        } catch (err: any) {
          message.error(err?.response?.data?.message || 'Failed to post material issue');
        }
      },
    });
  };

  const handleCancel = async (id: string) => {
    try {
      await apiService.post(`/store/material-issues/${id}/cancel`);
      message.success('Material issue cancelled');
      fetchData(page);
      setDetailOpen(false);
    } catch (err: any) {
      message.error(err?.response?.data?.message || 'Failed to cancel material issue');
    }
  };

  const openDetail = async (record: MaterialIssue) => {
    setDetail(record);
    setDetailLines([]);
    setDetailOpen(true);
    setDetailLoading(true);
    try {
      const d = await apiService.get<any>(`/store/material-issues/${record.id}`);
      setDetail(d);
      setDetailLines((d.lines || []).map((l: any, i: number) => ({
        ...l,
        lineNumber: l.lineNumber ?? i + 1,
        itemId: l.itemId,
        itemName: l.itemName,
        itemCode: l.itemCode,
        uomCode: l.uomCode,
        quantity: l.quantity,
        remarks: l.remarks,
      })));
    } catch {
      message.error('Failed to load issue detail');
    } finally {
      setDetailLoading(false);
    }
  };

  const columns: ColumnsType<MaterialIssue> = [
    { title: 'Issue Number', dataIndex: 'issueNumber', key: 'issueNumber', width: 150 },
    { title: 'Issue Date', dataIndex: 'issueDate', key: 'issueDate', width: 110, render: (v) => String(v || '').slice(0, 10) },
    { title: 'Store', dataIndex: 'storeName', key: 'storeName', width: 150, render: (v, r) => storeMap[r.storeId] || v || r.storeId },
    { title: 'Department', dataIndex: 'issuedToDepartmentId', key: 'issuedToDepartmentId', width: 130 },
    { title: 'Lines', dataIndex: 'lineCount', key: 'lineCount', width: 70, align: 'right' },
    { title: 'Purpose', dataIndex: 'purpose', key: 'purpose', width: 180, ellipsis: true },
    {
      title: 'Status', dataIndex: 'status', key: 'status', width: 110,
      render: (status: string) => {
        const colors: Record<string, string> = { DRAFT: 'default', POSTED: 'success', CANCELLED: 'error' };
        return <Tag color={colors[status] || 'default'}>{status}</Tag>;
      },
    },
    {
      title: 'Actions', key: 'actions', width: 220, fixed: 'right',
      render: (_, record) => (
        <Space wrap size={4}>
          <Button size="small" icon={<EyeOutlined />} onClick={() => openDetail(record)}>View</Button>
          {record.status === 'DRAFT' && canCreate && (
            <Button size="small" onClick={() => handleEdit(record)}>Edit</Button>
          )}
          {record.status === 'DRAFT' && canPost && (
            <Button size="small" type="primary" onClick={() => handlePost(record.id)}>Post</Button>
          )}
          {record.status === 'DRAFT' && canCreate && (
            <Button size="small" type="text" danger onClick={() => handleCancel(record.id)}>Cancel</Button>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        icon={<ExportOutlined />}
        title="Material Issues"
        subtitle="Issue material from stores to departments (stock deducted on posting)"
        extra={canCreate ? <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>New Issue</Button> : undefined}
      />
      <div style={{ padding: '0 24px' }}>
        <Card>
          <Row gutter={16} style={{ marginBottom: 16 }}>
            <Col span={8}>
              <Input placeholder="Search by issue number..." value={search} onChange={(e) => setSearch(e.target.value)} onPressEnter={() => fetchData(1)} />
            </Col>
            <Col span={4}>
              <Button onClick={() => fetchData(1)}>Search</Button>
            </Col>
          </Row>
          <Tabs activeKey={tab} onChange={(k) => { setTab(k); setPage(1); }}
            items={STATUS_OPTIONS.map((s) => ({ key: s, label: s === 'ALL' ? 'All' : s[0] + s.slice(1).toLowerCase() }))} />
          <Table columns={columns} dataSource={data} loading={loading} rowKey="id" scroll={{ x: 1100 }}
            pagination={{ current: page, total, pageSize, showSizeChanger: false, onChange: setPage }} />
        </Card>
      </div>

      <Modal
        title={modalState.edit ? `Edit Issue ${modalState.edit.issueNumber}` : 'New Material Issue'}
        open={modalState.open}
        onOk={handleSave}
        onCancel={() => setModalState({ open: false, edit: null })}
        width={1050}
        destroyOnHidden
      >
        <Form form={form} layout="vertical">
          <Row gutter={16}>
            <Col span={6}>
              <Form.Item name="issueNumber" label="Issue Number" rules={[{ required: true }]}>
                <Input placeholder="MI-2026-0001" disabled={!!modalState.edit} />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="issueDate" label="Issue Date" rules={[{ required: true }]}>
                <DatePicker style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="storeId" label="Store" rules={[{ required: true }]}>
                <Select showSearch optionFilterProp="label"
                  options={stores.map((s) => ({ value: s.id, label: `${s.code} — ${s.name}` }))} />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="issuedToDepartmentId" label="Issue To Department">
                <Select showSearch optionFilterProp="label" allowClear
                  options={departments.map((d) => ({ value: d.id, label: d.name }))} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="purpose" label="Purpose">
            <Input.TextArea rows={2} />
          </Form.Item>
          <Form.Item name="remarks" label="Remarks">
            <Input.TextArea rows={2} />
          </Form.Item>
          <StoreLineItemsEditor mode="issue" value={lineItems} onChange={setLineItems} label="Issued Items" />
        </Form>
      </Modal>

      <Drawer
        title={detail ? `Material Issue ${detail.issueNumber}` : 'Material Issue'}
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        width={900}
      >
        {detail && (
          <>
            <Descriptions bordered size="small" column={2}>
              <Descriptions.Item label="Status">
                <Tag color={{ DRAFT: 'default', POSTED: 'success', CANCELLED: 'error' }[detail.status] || 'default'}>{detail.status}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Store">{detail.storeName || detail.storeId}</Descriptions.Item>
              <Descriptions.Item label="Issue Date">{String(detail.issueDate || '').slice(0, 10)}</Descriptions.Item>
              <Descriptions.Item label="Department">{detail.issuedToDepartmentId}</Descriptions.Item>
              <Descriptions.Item label="Purpose" span={2}>{detail.purpose || '—'}</Descriptions.Item>
              <Descriptions.Item label="Remarks" span={2}>{detail.remarks || '—'}</Descriptions.Item>
            </Descriptions>
            <Typography.Title level={5} style={{ marginTop: 24 }}>Lines</Typography.Title>
            <Table size="small" columns={detailLineColumns} dataSource={detailLines} rowKey="id" pagination={false} loading={detailLoading} />
            {detail.status === 'DRAFT' && (
              <Space style={{ marginTop: 16 }}>
                {canPost && <Button type="primary" danger onClick={() => handlePost(detail.id)}>Post (Deduct Stock)</Button>}
                {canCreate && <Button onClick={() => handleCancel(detail.id)}>Cancel Issue</Button>}
              </Space>
            )}
          </>
        )}
      </Drawer>
    </div>
  );
};

export default MaterialIssueManagement;