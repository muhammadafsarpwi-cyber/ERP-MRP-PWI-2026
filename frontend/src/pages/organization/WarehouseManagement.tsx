import React, { useState, useEffect, useCallback } from 'react';
import { App, Table, Button, Space, Tag, Modal, Form, Input, Select, Popconfirm, Card } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, CheckCircleOutlined, CloseCircleOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import apiService from '../../services/api';
import { formatApiError } from '../../utils/apiError';

interface Company {
  id: string;
  companyCode: string;
  legalName: string;
}

interface Warehouse {
  id: string;
  warehouseCode: string;
  name: string;
  companyId: string;
  company?: Company;
  warehouseType: string;
  city: string;
  country: string;
  status: string;
  createdAt: string;
}

const WarehouseManagement: React.FC = () => {
  const { message } = App.useApp();
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingWarehouse, setEditingWarehouse] = useState<Warehouse | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [form] = Form.useForm();

  const warehouseTypes = [
    { value: 'RAW_MATERIAL', label: 'Raw Material' },
    { value: 'WORK_IN_PROGRESS', label: 'Work In Progress' },
    { value: 'FINISHED_GOODS', label: 'Finished Goods' },
    { value: 'GENERAL', label: 'General' },
    { value: 'QUARANTINE', label: 'Quarantine' },
    { value: 'SCRAP', label: 'Scrap' },
  ];

  const fetchWarehouses = useCallback(async (pageNum: number = 1) => {
    setLoading(true);
    try {
      const response = await apiService.get<{ data: Warehouse[]; total: number }>('/warehouses', {
        page: pageNum,
        limit: 20,
      });
      setWarehouses(response.data);
      setTotal(response.total);
    } catch (error) {
      message.error(formatApiError(error, 'Failed to fetch warehouses'));
    } finally {
      setLoading(false);
    }
  }, [message]);

  const fetchCompanies = useCallback(async () => {
    try {
      const response = await apiService.get<{ data: Company[] }>('/companies', { limit: 100 });
      setCompanies(response.data);
    } catch (error) {
      message.error(formatApiError(error, 'Failed to fetch companies'));
    }
  }, [message]);

  useEffect(() => {
    fetchWarehouses(page);
    fetchCompanies();
  }, [page, fetchWarehouses, fetchCompanies]);

  const handleCreate = () => {
    setEditingWarehouse(null);
    form.resetFields();
    setModalVisible(true);
  };

  const handleEdit = (record: Warehouse) => {
    setEditingWarehouse(record);
    form.setFieldsValue(record);
    setModalVisible(true);
  };

  const handleDelete = async (id: string) => {
    try {
      await apiService.delete(`/warehouses/${id}`);
      message.success('Warehouse deleted successfully');
      fetchWarehouses(page);
    } catch (error) {
      message.error(formatApiError(error, 'Failed to delete warehouse'));
    }
  };

  const handleActivate = async (id: string) => {
    try {
      await apiService.patch(`/warehouses/${id}/activate`);
      message.success('Warehouse activated successfully');
      fetchWarehouses(page);
    } catch (error) {
      message.error(formatApiError(error, 'Failed to activate warehouse'));
    }
  };

  const handleDeactivate = async (id: string) => {
    try {
      await apiService.patch(`/warehouses/${id}/deactivate`);
      message.success('Warehouse deactivated successfully');
      fetchWarehouses(page);
    } catch (error) {
      message.error(formatApiError(error, 'Failed to deactivate warehouse'));
    }
  };

  const handleSubmit = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      const values = await form.validateFields();
      if (editingWarehouse) {
        const { companyId: _co, ...editable } = values;
        await apiService.patch(`/warehouses/${editingWarehouse.id}`, editable);
        message.success('Warehouse updated successfully');
      } else {
        await apiService.post('/warehouses', values);
        message.success('Warehouse created successfully');
      }
      setModalVisible(false);
      fetchWarehouses(page);
    } catch (error: any) {
      if (error?.errorFields) {
        message.error('Please complete all required fields.');
      } else {
        message.error(formatApiError(error, 'Operation failed'));
      }
    } finally {
      setSubmitting(false);
    }
  };

  const columns: ColumnsType<Warehouse> = [
    {
      title: 'Code',
      dataIndex: 'warehouseCode',
      key: 'warehouseCode',
      sorter: true,
    },
    {
      title: 'Name',
      dataIndex: 'name',
      key: 'name',
    },
    {
      title: 'Company',
      key: 'company',
      render: (_, record) => record.company?.legalName || '-',
    },
    {
      title: 'Type',
      dataIndex: 'warehouseType',
      key: 'warehouseType',
      render: (type: string) => {
        const typeObj = warehouseTypes.find((t) => t.value === type);
        return typeObj?.label || type;
      },
    },
    {
      title: 'City',
      dataIndex: 'city',
      key: 'city',
    },
    {
      title: 'Country',
      dataIndex: 'country',
      key: 'country',
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => (
        <Tag color={status === 'ACTIVE' ? 'green' : 'red'}>{status}</Tag>
      ),
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_, record) => (
        <Space size="small">
          <Button type="link" icon={<EditOutlined />} onClick={() => handleEdit(record)} />
          {record.status === 'ACTIVE' ? (
            <Popconfirm title="Deactivate this warehouse?" onConfirm={() => handleDeactivate(record.id)}>
              <Button type="link" danger icon={<CloseCircleOutlined />} />
            </Popconfirm>
          ) : (
            <Popconfirm title="Activate this warehouse?" onConfirm={() => handleActivate(record.id)}>
              <Button type="link" icon={<CheckCircleOutlined />} />
            </Popconfirm>
          )}
          <Popconfirm title="Delete this warehouse?" onConfirm={() => handleDelete(record.id)}>
            <Button type="link" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <Card title="Warehouse Management">
      <Space style={{ marginBottom: 16 }}>
        <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>
          Add Warehouse
        </Button>
      </Space>

      <Table
        columns={columns}
        dataSource={warehouses}
        rowKey="id"
        loading={loading}
        pagination={{
          current: page,
          total,
          pageSize: 20,
          onChange: setPage,
        }}
      />

      <Modal
        title={editingWarehouse ? 'Edit Warehouse' : 'Create Warehouse'}
        open={modalVisible}
        onOk={handleSubmit}
        confirmLoading={submitting}
        onCancel={() => {
          if (!submitting) setModalVisible(false);
        }}
        width={800}
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="companyId"
            label="Company"
            rules={[{ required: true, message: 'Please select company' }]}
          >
            <Select placeholder="Select company">
              {companies.map((company) => (
                <Select.Option key={company.id} value={company.id}>
                  {company.legalName}
                </Select.Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item
            name="warehouseCode"
            label="Warehouse Code"
            rules={[{ required: true, message: 'Please enter warehouse code' }]}
          >
            <Input disabled={!!editingWarehouse} />
          </Form.Item>
          <Form.Item
            name="name"
            label="Name"
            rules={[{ required: true, message: 'Please enter name' }]}
          >
            <Input />
          </Form.Item>
          <Form.Item name="warehouseType" label="Warehouse Type">
            <Select placeholder="Select warehouse type">
              {warehouseTypes.map((type) => (
                <Select.Option key={type.value} value={type.value}>
                  {type.label}
                </Select.Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item name="address" label="Address">
            <Input />
          </Form.Item>
          <Form.Item name="city" label="City">
            <Input />
          </Form.Item>
          <Form.Item name="country" label="Country">
            <Input />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
};

export default WarehouseManagement;
