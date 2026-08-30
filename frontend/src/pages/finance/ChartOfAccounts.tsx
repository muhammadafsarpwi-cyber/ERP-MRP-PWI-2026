import React, { useState, useEffect, useCallback } from 'react';
import { Card, Table, Button, Space, Modal, Form, Input, Select, message, Row, Col, InputNumber, Tag, Statistic } from 'antd';
import { PlusOutlined, SearchOutlined, DeleteOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import apiService from '../../services/api';
import { PageHeader } from '../../components/shared';

interface Account {
  id: string;
  accountCode: string;
  accountName: string;
  accountType: string;
  normalBalance: string;
  status: string;
}

const ChartOfAccounts: React.FC = () => {
  const [data, setData] = useState<Account[]>([]);
  const [loading, setLoading] = useState(false);
  const [companyId, setCompanyId] = useState('');
  const [search, setSearch] = useState('');
  const [modalVisible, setModalVisible] = useState(false);
  const [form] = Form.useForm();

  const fetchData = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      const res = await apiService.get<{ data: Account[] }>('/finance/accounts', { companyId, search: search || undefined });
      setData(res.data || []);
    } catch {
      message.error('Failed to fetch accounts');
    } finally {
      setLoading(false);
    }
  }, [companyId, search]);

  useEffect(() => {
    const erpUser = localStorage.getItem('erp_user');
    if (erpUser) {
      try { const p = JSON.parse(erpUser); if (p?.defaultCompanyId) setCompanyId(p.defaultCompanyId); } catch { /* ignore */ }
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      await apiService.post('/finance/accounts', { ...values, companyId });
      message.success('Account created');
      setModalVisible(false);
      form.resetFields();
      fetchData();
    } catch (error) {
      const msg: any = (error as any)?.response?.data?.message;
      message.error(Array.isArray(msg) ? msg[0] : 'Failed to create account');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await apiService.delete(`/finance/accounts/${id}`);
      message.success('Account deleted');
      fetchData();
    } catch (error) {
      const msg: any = (error as any)?.response?.data?.message;
      message.error(Array.isArray(msg) ? msg[0] : 'Cannot delete account');
    }
  };

  const columns: ColumnsType<Account> = [
    { title: 'Code', dataIndex: 'accountCode', key: 'code', width: 90 },
    { title: 'Name', dataIndex: 'accountName', key: 'name' },
    { title: 'Type', dataIndex: 'accountType', key: 'type', width: 100, render: (t: string) => <Tag>{t}</Tag> },
    { title: 'Normal Balance', dataIndex: 'normalBalance', key: 'nb', width: 120 },
    {
      title: 'Actions', key: 'actions', width: 60,
      render: (_, r) => <Button type="text" danger icon={<DeleteOutlined />} aria-label="Delete account" onClick={() => handleDelete(r.id)} />,
    },
  ];

  return (
    <div>
      <PageHeader icon={<PlusOutlined />} title="Chart of Accounts" showBreadcrumbs
        subtitle="Manage the company chart of accounts"
        extra={<Button type="primary" icon={<PlusOutlined />} onClick={() => { form.resetFields(); setModalVisible(true); }}>New Account</Button>} />
      <Card style={{ marginTop: 12 }}>
        <Row gutter={16} style={{ marginBottom: 16 }}>
          <Col span={10}>
            <Input placeholder="Search accounts..." prefix={<SearchOutlined />} value={search} onChange={(e) => setSearch(e.target.value)} onPressEnter={fetchData} />
          </Col>
          <Col span={4}><Button onClick={fetchData}>Search</Button></Col>
        </Row>
        <Table columns={columns} dataSource={data} rowKey="id" loading={loading} pagination={{ pageSize: 20 }} />
      </Card>
      <Modal title="New Account" open={modalVisible} onOk={handleSubmit} onCancel={() => setModalVisible(false)}>
        <Form form={form} layout="vertical">
          <Form.Item name="accountCode" label="Account Code" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="accountName" label="Account Name" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="accountType" label="Type" rules={[{ required: true }]}>
            <Select options={['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE'].map((v) => ({ value: v, label: v }))} />
          </Form.Item>
          <Form.Item name="normalBalance" label="Normal Balance" rules={[{ required: true }]}>
            <Select options={['DEBIT', 'CREDIT'].map((v) => ({ value: v, label: v }))} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default ChartOfAccounts;