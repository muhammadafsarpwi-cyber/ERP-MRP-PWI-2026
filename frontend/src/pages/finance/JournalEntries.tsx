import React, { useState, useEffect, useCallback } from 'react';
import { Card, Table, Button, Space, Modal, Form, Input, Select, App, Row, Col, Tag } from 'antd';
import { PlusOutlined, SearchOutlined, CheckOutlined, CloseOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import apiService from '../../services/api';
import { PageHeader, FinanceJournalLineEditor, JournalLine } from '../../components/shared';

interface Journal {
  id: string;
  journalNumber: string;
  journalType: string;
  entryDate: string;
  description: string;
  totalDebit: number;
  totalCredit: number;
  status: string;
}

const JournalEntries: React.FC = () => {
  const { message } = App.useApp();
  const [data, setData] = useState<Journal[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [companyId, setCompanyId] = useState('');
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<string | undefined>(undefined);
  const [modalVisible, setModalVisible] = useState(false);
  const [form] = Form.useForm();
  const [journalLines, setJournalLines] = useState<JournalLine[]>([]);

  const fetchData = useCallback(async (pageNum = 1) => {
    if (!companyId) return;
    setLoading(true);
    try {
      const res = await apiService.get<{ data: Journal[]; total: number }>('/finance/journals', {
        companyId, page: pageNum, limit: 20, search: search || undefined, status: filterStatus || undefined,
      });
      setData(res.data);
      setTotal(res.total);
    } catch {
      message.error('Failed to fetch journals');
    } finally {
      setLoading(false);
    }
  }, [companyId, search, filterStatus, message]);

  useEffect(() => {
    const erpUser = localStorage.getItem('erp_user');
    if (erpUser) {
      try { const p = JSON.parse(erpUser); if (p?.defaultCompanyId) setCompanyId(p.defaultCompanyId); } catch { /* ignore */ }
    }
  }, []);

  useEffect(() => { fetchData(page); }, [page, fetchData]);

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      if (journalLines.length < 2) {
        message.warning('Add at least two journal lines');
        return;
      }
      const totalDebit = journalLines.reduce((s, l) => s + Number(l.debit || 0), 0);
      const totalCredit = journalLines.reduce((s, l) => s + Number(l.credit || 0), 0);
      if (Math.abs(totalDebit - totalCredit) > 0.0001) {
        message.error(`Journal is unbalanced: debit ${totalDebit} <> credit ${totalCredit}`);
        return;
      }
      const lines = journalLines.map((l) => ({
        accountId: l.accountId,
        debit: l.debit,
        credit: l.credit,
        description: l.description,
      }));
      await apiService.post('/finance/journals', { ...values, companyId, lines });
      message.success('Journal created');
      setModalVisible(false);
      form.resetFields();
      setJournalLines([]);
      fetchData(page);
    } catch (error) {
      const msg: any = (error as any)?.response?.data?.message;
      message.error(Array.isArray(msg) ? msg[0] : 'Failed to create journal');
    }
  };

  const handleAction = async (id: string, action: string) => {
    try {
      await apiService.post(`/finance/journals/${id}/${action}`).catch((e) => { throw e; });
      message.success(`Journal ${action}ed`);
      fetchData(page);
    } catch (error) {
      const msg: any = (error as any)?.response?.data?.message;
      message.error(typeof msg === 'string' ? msg : `Failed to ${action} journal`);
    }
  };

  const columns: ColumnsType<Journal> = [
    { title: 'Journal #', dataIndex: 'journalNumber', key: 'number', width: 120 },
    { title: 'Date', dataIndex: 'entryDate', key: 'date', width: 110 },
    { title: 'Type', dataIndex: 'journalType', key: 'type', width: 120 },
    { title: 'Description', dataIndex: 'description', key: 'desc', ellipsis: true },
    { title: 'Debit', dataIndex: 'totalDebit', key: 'debit', width: 110, align: 'right', render: (v: number) => v?.toLocaleString() },
    { title: 'Credit', dataIndex: 'totalCredit', key: 'credit', width: 110, align: 'right', render: (v: number) => v?.toLocaleString() },
    {
      title: 'Status', dataIndex: 'status', key: 'status', width: 100,
      render: (s: string) => <Tag color={s === 'POSTED' ? 'green' : s === 'DRAFT' ? 'blue' : 'red'}>{s}</Tag>,
    },
    {
      title: 'Actions', key: 'actions', width: 180,
      render: (_, r) => (
        <Space>
          {r.status === 'DRAFT' && <Button size="small" type="primary" icon={<CheckOutlined />} onClick={() => handleAction(r.id, 'post')}>Post</Button>}
          {r.status === 'POSTED' && <Button size="small" icon={<CloseOutlined />} onClick={() => handleAction(r.id, 'reverse')}>Reverse</Button>}
        </Space>
      ),
    },
  ];

  return (
    <div>
      <PageHeader icon={<PlusOutlined />} title="Journal Entries" showBreadcrumbs
        subtitle="Record and post financial journals"
        extra={<Button type="primary" icon={<PlusOutlined />} onClick={() => { form.resetFields(); setJournalLines([]); setModalVisible(true); }}>New Journal</Button>} />
      <Card style={{ marginTop: 12 }}>
        <Row gutter={16} style={{ marginBottom: 16 }}>
          <Col span={8}><Input placeholder="Search journals..." prefix={<SearchOutlined />} value={search} onChange={(e) => setSearch(e.target.value)} onPressEnter={() => fetchData(1)} /></Col>
          <Col span={6}>
            <Select placeholder="Status" allowClear style={{ width: '100%' }} value={filterStatus} onChange={setFilterStatus}>
              <Select.Option value="DRAFT">DRAFT</Select.Option>
              <Select.Option value="POSTED">POSTED</Select.Option>
              <Select.Option value="REVERSED">REVERSED</Select.Option>
            </Select>
          </Col>
          <Col span={4}><Button onClick={() => fetchData(1)}>Search</Button></Col>
        </Row>
        <Table columns={columns} dataSource={data} rowKey="id" loading={loading}
          pagination={{ current: page, total, pageSize: 20, onChange: setPage, showSizeChanger: false }} />
      </Card>
      <Modal title="New Journal Entry" open={modalVisible} onOk={handleSubmit} onCancel={() => setModalVisible(false)} width={600}>
        <Form form={form} layout="vertical">
          <Form.Item name="entryDate" label="Entry Date" rules={[{ required: true }]}><Input type="date" /></Form.Item>
          <Form.Item name="journalType" label="Type" rules={[{ required: true }]}>
            <Select options={['GENERAL', 'RECEIPT', 'PAYMENT', 'EXPENSE', 'SALES_INVOICE', 'PURCHASE_INVOICE'].map((v) => ({ value: v, label: v }))} />
          </Form.Item>
          <Form.Item name="description" label="Description"><Input.TextArea rows={2} /></Form.Item>
          <FinanceJournalLineEditor companyId={companyId} value={journalLines} onChange={setJournalLines} />
        </Form>
      </Modal>
    </div>
  );
};

export default JournalEntries;