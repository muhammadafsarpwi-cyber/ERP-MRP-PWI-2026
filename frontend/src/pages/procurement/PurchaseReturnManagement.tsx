import React, { useState, useEffect, useCallback } from 'react';
import {
  Table, Button, Space, Tag, Modal, Form, Input, Select, App, Card,
  Row, Col,
} from 'antd';
import { PlusOutlined, SearchOutlined, CheckOutlined, SendOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import apiService from '../../services/api';
import { ERPLineItems, ERPLine } from '../../components/shared';

interface PurchaseReturn {
  id: string;
  returnCode: string;
  poCode?: string;
  supplierName?: string;
  returnDate?: string;
  status: string;
}

const STATUS_OPTIONS = ['DRAFT', 'APPROVED', 'SHIPPED', 'RECEIVED_BY_SUPPLIER', 'COMPLETED', 'CANCELLED'];

const statusColorMap: Record<string, string> = {
  DRAFT: 'default', APPROVED: 'green', SHIPPED: 'blue',
  RECEIVED_BY_SUPPLIER: 'cyan', COMPLETED: 'purple', CANCELLED: 'red',
};

const PurchaseReturnManagement: React.FC = () => {
  const { message } = App.useApp();
  const [data, setData] = useState<PurchaseReturn[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [modalVisible, setModalVisible] = useState(false);
  const [form] = Form.useForm();
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<string | undefined>(undefined);
  const [pageSize] = useState(20);
  const [lineItems, setLineItems] = useState<ERPLine[]>([]);
  const [companyId, setCompanyId] = useState('');
  const [suppliers, setSuppliers] = useState<Array<{ id: string; name: string }>>([]);

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
    })();
  }, []);

  const fetchData = useCallback(async (pageNum: number = 1) => {
    setLoading(true);
    try {
      const params: any = { page: pageNum, limit: pageSize };
      if (search) params.search = search;
      if (filterStatus) params.status = filterStatus;
      const response = await apiService.get<{ data: PurchaseReturn[]; total: number }>('/procurement/returns', params);
      setData(response.data);
      setTotal(response.total);
    } catch (error) {
      message.error('Failed to fetch purchase returns');
    } finally {
      setLoading(false);
    }
  }, [search, filterStatus, pageSize, message]);

  useEffect(() => { fetchData(page); }, [page, fetchData]);

  const handleCreate = () => {
    form.resetFields();
    setModalVisible(true);
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      if (lineItems.length === 0) {
        message.warning('Add at least one line item');
        return;
      }
      const payload = {
        ...values,
        lines: lineItems.map((l) => ({
          itemId: l.itemId, uomId: l.uomId, quantity: l.quantity, unitPrice: l.rate,
          reason: l.itemName || l.itemCode,
        })),
      };
      await apiService.post('/procurement/returns', payload);
      message.success('Purchase return created');
      setModalVisible(false);
      fetchData(page);
    } catch (error) {
      const msg: any = (error as any)?.response?.data?.message;
      message.error(Array.isArray(msg) ? msg[0] : 'Failed to create purchase return');
    }
  };

  const handleAction = async (id: string, action: string) => {
    try {
      await apiService.patch(`/procurement/returns/${id}/${action}`);
      message.success(`Purchase return ${action}d successfully`);
      fetchData(page);
    } catch (error) {
      message.error(`Failed to ${action} purchase return`);
    }
  };

  const columns: ColumnsType<PurchaseReturn> = [
    { title: 'Code', dataIndex: 'returnCode', key: 'returnCode', width: 120 },
    { title: 'PO', dataIndex: 'poCode', key: 'poCode', width: 120 },
    { title: 'Supplier', dataIndex: 'supplierName', key: 'supplierName', width: 150 },
    { title: 'Date', dataIndex: 'returnDate', key: 'returnDate', width: 110 },
    {
      title: 'Status', dataIndex: 'status', key: 'status', width: 140,
      render: (status: string) => <Tag color={statusColorMap[status]}>{status}</Tag>,
    },
    {
      title: 'Actions', key: 'actions', width: 250,
      render: (_, record) => (
        <Space>
          {record.status === 'DRAFT' && <Button size="small" type="primary" icon={<CheckOutlined />} onClick={() => handleAction(record.id, 'approve')}>Approve</Button>}
          {record.status === 'APPROVED' && <Button size="small" type="primary" icon={<SendOutlined />} onClick={() => handleAction(record.id, 'ship')}>Ship</Button>}
          {record.status === 'SHIPPED' && <Button size="small" type="primary" onClick={() => handleAction(record.id, 'complete')}>Complete</Button>}
          {record.status !== 'COMPLETED' && record.status !== 'CANCELLED' && <Button size="small" danger onClick={() => handleAction(record.id, 'cancel')}>Cancel</Button>}
        </Space>
      ),
    },
  ];

  return (
    <Card title="Purchase Returns" extra={<Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>Create Return</Button>}>
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={8}>
          <Input placeholder="Search returns..." prefix={<SearchOutlined />} value={search} onChange={(e) => setSearch(e.target.value)} onPressEnter={() => fetchData(1)} />
        </Col>
        <Col span={6}>
          <Select placeholder="Filter by status" allowClear style={{ width: '100%' }} value={filterStatus} onChange={setFilterStatus}>
            {STATUS_OPTIONS.map(s => <Select.Option key={s} value={s}>{s}</Select.Option>)}
          </Select>
        </Col>
        <Col span={4}>
          <Button onClick={() => fetchData(1)}>Search</Button>
        </Col>
      </Row>
      <Table columns={columns} dataSource={data} rowKey="id" loading={loading}
        pagination={{ current: page, total, pageSize, onChange: setPage, showSizeChanger: false }} />
      <Modal title="Create Purchase Return" open={modalVisible}
        onOk={handleSubmit} onCancel={() => setModalVisible(false)} width={700}>
        <Form form={form} layout="vertical">
          <Form.Item name="companyId" hidden><Input /></Form.Item>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="returnCode" label="Return Code" rules={[{ required: true }]}>
                <Input />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="supplierId" label="Supplier" rules={[{ required: true }]}>
                <Select showSearch optionFilterProp="label"
                  options={suppliers.map((s) => ({ value: s.id, label: s.name }))} />
              </Form.Item>
            </Col>
          </Row>
          <ERPLineItems companyId={companyId} value={lineItems} onChange={setLineItems} showWarehouse={false} label="Return Items" />
          <Form.Item name="reason" label="Reason">
            <Input.TextArea rows={2} />
          </Form.Item>
          <Form.Item name="notes" label="Notes">
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
};

export default PurchaseReturnManagement;
