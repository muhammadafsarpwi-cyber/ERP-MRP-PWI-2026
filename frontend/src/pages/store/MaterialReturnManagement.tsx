import React, { useState, useEffect, useCallback } from 'react';
import {
  Card, Table, Button, Space, Modal, Form, Input, Select, Tag, App, DatePicker, Row, Col, Tabs, Drawer, Descriptions, Typography,
} from 'antd';
import { PlusOutlined, UndoOutlined, EyeOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import apiService from '../../services/api';
import { usePermission } from '../../hooks/usePermission';
import PageHeader from '../../components/shared/PageHeader';
import StoreLineItemsEditor, { StoreLineItem } from './components/StoreLineItemsEditor';

interface MaterialReturnLine {
  id: string;
  lineNumber: number;
  itemId: string;
  itemName?: string;
  itemCode?: string;
  quantity: number;
  uomId: string;
  uomCode?: string;
  conditionCode?: string;
  remarks?: string;
}

interface MaterialReturn {
  id: string;
  returnNumber: string;
  returnDate: string;
  storeId: string;
  storeName?: string;
  fromDepartmentId?: string;
  conditionCode?: string;
  reason?: string;
  remarks?: string;
  status: string;
  lineCount?: number;
  createdAt: string;
}

const STATUS_OPTIONS = ['ALL', 'DRAFT', 'POSTED', 'CANCELLED'];

const detailLineColumns: ColumnsType<MaterialReturnLine> = [
  { title: '#', dataIndex: 'lineNumber', width: 40 },
  { title: 'Item', key: 'item', render: (_, r) => r.itemCode ? `${r.itemCode}${r.itemName ? ` — ${r.itemName}` : ''}` : r.itemId },
  { title: 'Quantity', dataIndex: 'quantity', width: 100, align: 'right' },
  { title: 'UOM', dataIndex: 'uomCode', width: 90 },
  { title: 'Condition', dataIndex: 'conditionCode', width: 110 },
  { title: 'Remarks', dataIndex: 'remarks', width: 140 },
];

const MaterialReturnManagement: React.FC = () => {
  const { message, modal } = App.useApp();
  const { can } = usePermission();
  const canCreate = can('store.return.create');
  const canPost = can('store.return.post');

  const [data, setData] = useState<MaterialReturn[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState('ALL');
  const [pageSize] = useState(20);

  const [modalState, setModalState] = useState<{ open: boolean; edit: MaterialReturn | null }>({ open: false, edit: null });
  const [form] = Form.useForm();
  const [lineItems, setLineItems] = useState<StoreLineItem[]>([]);
  const [stores, setStores] = useState<Array<{ id: string; code: string; name: string }>>([]);
  const [storeMap, setStoreMap] = useState<Record<string, string>>({});
  const [departments, setDepartments] = useState<Array<{ id: string; name: string }>>([]);

  const [detail, setDetail] = useState<MaterialReturn | null>(null);
  const [detailLines, setDetailLines] = useState<MaterialReturnLine[]>([]);
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
      const response = await apiService.get<{ data: MaterialReturn[]; total: number }>('/store/material-returns', params);
      setData(response.data);
      setTotal(response.total);
    } catch (error) {
      message.error('Failed to load material returns');
    } finally {
      setLoading(false);
    }
  }, [search, tab, pageSize, message]);

  useEffect(() => { fetchData(page); }, [page, fetchData]);

  const handleCreate = () => {
    form.resetFields();
    form.setFieldsValue({ returnDate: dayjs(), conditionCode: 'GOOD' });
    setLineItems([]);
    setModalState({ open: true, edit: null });
  };

  const handleEdit = async (record: MaterialReturn) => {
    form.resetFields();
    form.setFieldsValue({
      ...record,
      returnDate: record.returnDate ? dayjs(record.returnDate) : undefined,
    });
    setLineItems([]);
    setModalState({ open: true, edit: record });
    try {
      const d = await apiService.get<any>(`/store/material-returns/${record.id}`);
      setLineItems((d.lines || []).map((l: any) => ({
        key: `line-${l.id}`,
        itemId: l.itemId,
        itemCode: l.itemCode,
        itemName: l.itemName,
        uomId: l.uomId,
        quantity: l.quantity,
        conditionCode: l.conditionCode,
        remarks: l.remarks,
      })));
    } catch {
      message.error('Failed to load return lines');
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
        returnNumber: values.returnNumber,
        returnDate: values.returnDate ? values.returnDate.format('YYYY-MM-DD') : undefined,
        storeId: values.storeId,
        fromDepartmentId: values.fromDepartmentId,
        conditionCode: values.conditionCode,
        reason: values.reason,
        remarks: values.remarks,
        lines: lineItems.map((l) => ({
          itemId: l.itemId,
          quantity: l.quantity,
          uomId: l.uomId,
          conditionCode: l.conditionCode,
          remarks: l.remarks,
        })),
      };
      if (modalState.edit?.id) {
        await apiService.put(`/store/material-returns/${modalState.edit.id}`, payload);
        message.success('Material return updated');
      } else {
        await apiService.post('/store/material-returns', payload);
        message.success('Material return created');
      }
      setModalState({ open: false, edit: null });
      fetchData(page);
    } catch (err: any) {
      const msg: any = err?.response?.data?.message;
      message.error(Array.isArray(msg) ? msg[0] : 'Failed to save material return');
    }
  };

  const handlePost = (id: string) => {
    modal.confirm({
      title: 'Post Material Return',
      content: 'Posting will add the returned stock back into the store inventory and record the return in the store ledger. Continue?',
      okText: 'Post',
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await apiService.post(`/store/material-returns/${id}/post`);
          message.success('Material return posted successfully');
          fetchData(page);
          setDetailOpen(false);
        } catch (err: any) {
          message.error(err?.response?.data?.message || 'Failed to post material return');
        }
      },
    });
  };

  const handleCancel = async (id: string) => {
    try {
      await apiService.post(`/store/material-returns/${id}/cancel`);
      message.success('Material return cancelled');
      fetchData(page);
      setDetailOpen(false);
    } catch (err: any) {
      message.error(err?.response?.data?.message || 'Failed to cancel material return');
    }
  };

  const openDetail = async (record: MaterialReturn) => {
    setDetail(record);
    setDetailLines([]);
    setDetailOpen(true);
    setDetailLoading(true);
    try {
      const d = await apiService.get<any>(`/store/material-returns/${record.id}`);
      setDetail(d);
      setDetailLines((d.lines || []).map((l: any, i: number) => ({
        ...l,
        lineNumber: l.lineNumber ?? i + 1,
        itemId: l.itemId,
        itemName: l.itemName,
        itemCode: l.itemCode,
        uomCode: l.uomCode,
        quantity: l.quantity,
        conditionCode: l.conditionCode,
        remarks: l.remarks,
      })));
    } catch {
      message.error('Failed to load return detail');
    } finally {
      setDetailLoading(false);
    }
  };

  const columns: ColumnsType<MaterialReturn> = [
    { title: 'Return Number', dataIndex: 'returnNumber', key: 'returnNumber', width: 150 },
    { title: 'Return Date', dataIndex: 'returnDate', key: 'returnDate', width: 110, render: (v) => String(v || '').slice(0, 10) },
    { title: 'Store', dataIndex: 'storeName', key: 'storeName', width: 150, render: (v, r) => storeMap[r.storeId] || v || r.storeId },
    { title: 'Department', dataIndex: 'fromDepartmentId', key: 'fromDepartmentId', width: 130 },
    { title: 'Lines', dataIndex: 'lineCount', key: 'lineCount', width: 70, align: 'right' },
    { title: 'Condition', dataIndex: 'conditionCode', key: 'conditionCode', width: 110 },
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
        icon={<UndoOutlined />}
        title="Material Returns"
        subtitle="Return material from departments back to store (stock added on posting)"
        extra={canCreate ? <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>New Return</Button> : undefined}
      />
      <div style={{ padding: '0 24px' }}>
        <Card>
          <Row gutter={16} style={{ marginBottom: 16 }}>
            <Col span={8}>
              <Input placeholder="Search by return number..." value={search} onChange={(e) => setSearch(e.target.value)} onPressEnter={() => fetchData(1)} />
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
        title={modalState.edit ? `Edit Return ${modalState.edit.returnNumber}` : 'New Material Return'}
        open={modalState.open}
        onOk={handleSave}
        onCancel={() => setModalState({ open: false, edit: null })}
        width={1050}
        destroyOnHidden
      >
        <Form form={form} layout="vertical">
          <Row gutter={16}>
            <Col span={6}>
              <Form.Item name="returnNumber" label="Return Number" rules={[{ required: true }]}>
                <Input placeholder="MRTN-2026-0001" disabled={!!modalState.edit} />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="returnDate" label="Return Date" rules={[{ required: true }]}>
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
              <Form.Item name="fromDepartmentId" label="Return From Department">
                <Select showSearch optionFilterProp="label" allowClear
                  options={departments.map((d) => ({ value: d.id, label: d.name }))} />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item name="conditionCode" label="Condition">
                <Select options={['GOOD', 'DAMAGED', 'DEFECTIVE', 'EXPIRED'].map((c) => ({ value: c, label: c }))} />
              </Form.Item>
            </Col>
            <Col span={16}>
              <Form.Item name="reason" label="Reason">
                <Input placeholder="Reason for return" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="remarks" label="Remarks">
            <Input.TextArea rows={2} />
          </Form.Item>
          <StoreLineItemsEditor mode="return" value={lineItems} onChange={setLineItems} label="Returned Items" />
        </Form>
      </Modal>

      <Drawer
        title={detail ? `Material Return ${detail.returnNumber}` : 'Material Return'}
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
              <Descriptions.Item label="Return Date">{String(detail.returnDate || '').slice(0, 10)}</Descriptions.Item>
              <Descriptions.Item label="Department">{detail.fromDepartmentId || '—'}</Descriptions.Item>
              <Descriptions.Item label="Condition">{detail.conditionCode || '—'}</Descriptions.Item>
              <Descriptions.Item label="Reason">{detail.reason || '—'}</Descriptions.Item>
              <Descriptions.Item label="Remarks" span={2}>{detail.remarks || '—'}</Descriptions.Item>
            </Descriptions>
            <Typography.Title level={5} style={{ marginTop: 24 }}>Lines</Typography.Title>
            <Table size="small" columns={detailLineColumns} dataSource={detailLines} rowKey="id" pagination={false} loading={detailLoading} />
            {detail.status === 'DRAFT' && (
              <Space style={{ marginTop: 16 }}>
                {canPost && <Button type="primary" danger onClick={() => handlePost(detail.id)}>Post (Add Stock)</Button>}
                {canCreate && <Button onClick={() => handleCancel(detail.id)}>Cancel Return</Button>}
              </Space>
            )}
          </>
        )}
      </Drawer>
    </div>
  );
};

export default MaterialReturnManagement;