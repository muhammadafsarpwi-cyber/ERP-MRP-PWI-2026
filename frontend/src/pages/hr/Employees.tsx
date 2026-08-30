import React, { useState, useEffect, useCallback } from 'react';
import { Card, Table, Button, Space, Modal, Form, Input, Select, message, Row, Col, Tag, DatePicker } from 'antd';
import { PlusOutlined, SearchOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import apiService from '../../services/api';
import { PageHeader } from '../../components/shared';

interface Employee {
  id: string;
  employeeCode: string;
  firstName: string;
  lastName?: string;
  email?: string;
  designationName?: string;
  status: string;
}

const EmployeesPage: React.FC = () => {
  const [data, setData] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [companyId, setCompanyId] = useState('');
  const [search, setSearch] = useState('');
  const [designations, setDesignations] = useState<Array<{ id: string; designationCode: string; designationName: string }>>([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [form] = Form.useForm();

  const fetchData = useCallback(async (pageNum = 1) => {
    if (!companyId) return;
    setLoading(true);
    try {
      const res = await apiService.get<{ data: Employee[]; total: number }>('/hr/employees', { companyId, page: pageNum, limit: 20, search: search || undefined });
      setData(res.data);
      setTotal(res.total);
    } catch {
      message.error('Failed to fetch employees');
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

  useEffect(() => {
    if (!companyId) return;
    fetchData(page);
    (async () => {
      try {
        const d = await apiService.get<{ data: Array<{ id: string; designationCode: string; designationName: string }> }>('/hr/designations', { companyId });
        setDesignations(d.data || []);
      } catch { /* ignore */ }
    })();
  }, [companyId, fetchData, page]);

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      await apiService.post('/hr/employees', { ...values, companyId, joinDate: values.joinDate?.format?.('YYYY-MM-DD') ?? values.joinDate });
      message.success('Employee created');
      setModalVisible(false);
      form.resetFields();
      fetchData(page);
    } catch (error) {
      const msg: any = (error as any)?.response?.data?.message;
      message.error(Array.isArray(msg) ? msg[0] : 'Failed to create employee');
    }
  };

  const columns: ColumnsType<Employee> = [
    { title: 'Code', dataIndex: 'employeeCode', key: 'code', width: 100 },
    { title: 'Name', key: 'name', render: (_, r) => `${r.firstName} ${r.lastName ?? ''}` },
    { title: 'Email', dataIndex: 'email', key: 'email' },
    { title: 'Designation', dataIndex: 'designationName', key: 'desig' },
    { title: 'Status', dataIndex: 'status', key: 'status', width: 90, render: (s: string) => <Tag color={s === 'ACTIVE' ? 'green' : 'red'}>{s}</Tag> },
  ];

  return (
    <div>
      <PageHeader icon={<PlusOutlined />} title="Employees" showBreadcrumbs
        subtitle="Manage employee master data"
        extra={<Button type="primary" icon={<PlusOutlined />} onClick={() => { form.resetFields(); setModalVisible(true); }}>New Employee</Button>} />
      <Card style={{ marginTop: 12 }}>
        <Row gutter={16} style={{ marginBottom: 16 }}>
          <Col span={10}><Input placeholder="Search employees..." prefix={<SearchOutlined />} value={search} onChange={(e) => setSearch(e.target.value)} onPressEnter={() => fetchData(1)} /></Col>
          <Col span={4}><Button onClick={() => fetchData(1)}>Search</Button></Col>
        </Row>
        <Table columns={columns} dataSource={data} rowKey="id" loading={loading}
          pagination={{ current: page, total, pageSize: 20, onChange: setPage, showSizeChanger: false }} />
      </Card>
      <Modal title="New Employee" open={modalVisible} onOk={handleSubmit} onCancel={() => setModalVisible(false)} width={640}>
        <Form form={form} layout="vertical">
          <Row gutter={12}>
            <Col span={12}><Form.Item name="employeeCode" label="Employee Code" rules={[{ required: true }]}><Input /></Form.Item></Col>
            <Col span={12}><Form.Item name="firstName" label="First Name" rules={[{ required: true }]}><Input /></Form.Item></Col>
          </Row>
          <Row gutter={12}>
            <Col span={12}><Form.Item name="lastName" label="Last Name"><Input /></Form.Item></Col>
            <Col span={12}><Form.Item name="email" label="Email"><Input /></Form.Item></Col>
          </Row>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="designationId" label="Designation">
                <Select showSearch optionFilterProp="label" options={designations.map((d) => ({ value: d.id, label: `${d.designationCode} — ${d.designationName}` }))} />
              </Form.Item>
            </Col>
            <Col span={12}><Form.Item name="joinDate" label="Join Date"><DatePicker style={{ width: '100%' }} /></Form.Item></Col>
          </Row>
          <Form.Item name="jobTitle" label="Job Title"><Input /></Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default EmployeesPage;