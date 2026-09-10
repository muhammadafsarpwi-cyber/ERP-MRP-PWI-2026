import React, { useState, useEffect, useCallback } from 'react';
import { Card, Table, Button, Tag, Tabs, App, Popconfirm, Modal, Form, Input, Select, DatePicker, Row, Col } from 'antd';
import { PlusOutlined, CheckOutlined, RollbackOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import apiService from '../../services/api';
import { isValidUUID } from '../../utils/uuid';
import { usePermission } from '../../hooks/usePermission';
import PageHeader from '../../components/shared/PageHeader';
import StoreLineItemsEditor, { StoreLineItem } from './components/StoreLineItemsEditor';

interface MaterialReturn {
  id: string;
  returnNumber: string;
  returnDate: string;
  storeId: string;
  storeName?: string;
  issueNumber: string;
  conditionCode: string;
  reason: string;
  status: string;
  createdAt: string;
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

const StoreReturns: React.FC = () => {
  const { message } = App.useApp();
  const { can } = usePermission();
  const canCreate = can('store.return.create');
  const canPost = can('store.return.post');

  const [data, setData] = useState<MaterialReturn[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('ALL');

  const [modalOpen, setModalOpen] = useState(false);
  const [form] = Form.useForm();
  const [lineItems, setLineItems] = useState<StoreLineItem[]>([]);
  const [stores, setStores] = useState<StoreOption[]>([]);
  const [storeMap, setStoreMap] = useState<Record<string, string>>({});
  const [departments, setDepartments] = useState<Array<{ id: string; name: string }>>([]);

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
        console.warn('[StoreReturns] Failed to load departments');
      }
    })();
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const response = await apiService.get<MaterialReturn[]>('/store/material-returns');
      setData(response);
    } catch {
      message.error('Failed to load material returns');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const filteredData = activeTab === 'ALL' ? data : data.filter(d => d.status === activeTab);

  const handleCreate = () => {
    form.resetFields();
    form.setFieldsValue({ returnDate: dayjs(), conditionCode: 'GOOD' });
    setLineItems([]);
    setModalOpen(true);
  };

  const handleStoreChange = (storeId?: string) => {
    const selected = stores.find((s) => s.id === storeId);
    if (selected?.departmentId && isValidUUID(selected.departmentId)) {
      form.setFieldsValue({ departmentId: selected.departmentId });
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
        returnNumber: values.returnNumber,
        returnDate: values.returnDate ? values.returnDate.format('YYYY-MM-DD') : undefined,
        storeId: values.storeId,
        departmentId: values.departmentId || undefined,
        conditionCode: values.conditionCode,
        reason: values.reason,
        remarks: values.remarks,
        lines: lineItems.map((l) => ({
          itemId: l.itemId,
          quantity: Number(l.quantity || 0),
          uomId: l.uomId,
          conditionCode: l.conditionCode,
          remarks: l.remarks,
        })),
      };
      await apiService.post('/store/material-returns', payload);
      message.success('Material return created');
      setModalOpen(false);
      fetchData();
    } catch (err: any) {
      const msg: any = err?.response?.data?.message;
      message.error(Array.isArray(msg) ? msg[0] : 'Failed to create material return');
    }
  };

  const handlePost = async (id: string) => {
    try {
      await apiService.post(`/store/material-returns/${id}/post`);
      message.success('Return posted successfully');
      fetchData();
    } catch {
      message.error('Failed to post return');
    }
  };

  const columns: ColumnsType<MaterialReturn> = [
    { title: 'Return #', dataIndex: 'returnNumber', key: 'returnNumber', width: 140 },
    { title: 'Date', dataIndex: 'returnDate', key: 'returnDate', width: 110 },
    { title: 'Store', dataIndex: 'storeName', key: 'storeName', width: 160, render: (v, r) => storeMap[r.storeId] || v || '—' },
    { title: 'Issue #', dataIndex: 'issueNumber', key: 'issueNumber', width: 140 },
    { title: 'Condition', dataIndex: 'conditionCode', key: 'conditionCode', width: 100, render: (v: string) => <Tag>{v}</Tag> },
    { title: 'Reason', dataIndex: 'reason', key: 'reason', width: 200, ellipsis: true },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 120,
      render: (v: string) => {
        const colors: Record<string, string> = { DRAFT: 'default', POSTED: 'success' };
        return <Tag color={colors[v] || 'default'}>{v}</Tag>;
      },
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 150,
      render: (_: any, record: MaterialReturn) => (
        record.status === 'DRAFT' && canPost ? (
          <Popconfirm title="Post this return? This will add stock back." onConfirm={() => handlePost(record.id)}>
            <Button type="primary" size="small" icon={<CheckOutlined />}>Post</Button>
          </Popconfirm>
        ) : null
      ),
    },
  ];

  const tabItems = [
    { key: 'ALL', label: `All (${data.length})` },
    { key: 'DRAFT', label: `Draft (${data.filter(d => d.status === 'DRAFT').length})` },
    { key: 'POSTED', label: `Posted (${data.filter(d => d.status === 'POSTED').length})` },
  ];

  return (
    <div>
      <PageHeader
        icon={<RollbackOutlined />}
        title="Material Returns"
        subtitle="Return unused or damaged material back into store stock"
        extra={canCreate ? <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>New Return</Button> : undefined}
      />
      <div style={{ padding: '0 24px' }}>
        <Card>
          <Tabs activeKey={activeTab} onChange={setActiveTab} items={tabItems} />
          <Table
            columns={columns}
            dataSource={filteredData}
            rowKey="id"
            loading={loading}
            pagination={{ pageSize: 15 }}
            scroll={{ x: 1100 }}
            size="middle"
          />
        </Card>
      </div>

      <Modal
        title="Create Material Return"
        open={modalOpen}
        onOk={handleSave}
        onCancel={() => setModalOpen(false)}
        width={900}
        destroyOnHidden
      >
        <Form form={form} layout="vertical">
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item name="returnNumber" label="Return Number" rules={[{ required: true }]}>
                <Input placeholder="MRT-2026-0001" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="returnDate" label="Return Date" rules={[{ required: true }]}>
                <DatePicker style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={8}>
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
              <Form.Item name="conditionCode" label="Condition">
                <Select
                  options={['GOOD', 'DAMAGED', 'DEFECTIVE', 'EXPIRED'].map((c) => ({ value: c, label: c }))}
                />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="departmentId" label="From Department">
                <Select
                  showSearch
                  optionFilterProp="label"
                  allowClear
                  placeholder="Select department"
                  options={departments.map((d) => ({ value: d.id, label: d.name }))}
                />
              </Form.Item>
            </Col>
            <Col span={8}>
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
    </div>
  );
};

export default StoreReturns;