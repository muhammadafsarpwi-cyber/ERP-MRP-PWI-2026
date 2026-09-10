import React, { useState, useEffect, useCallback } from 'react';
import { Card, Table, Button, Space, Modal, Form, Input, Select, Tag, App, Row, Col } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, ShopOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import apiService from '../../services/api';
import { usePermission } from '../../hooks/usePermission';
import PageHeader from '../../components/shared/PageHeader';

interface Store {
  id: string;
  storeCode: string;
  storeName: string;
  storeType: string;
  divisionId: string;
  sectionId: string;
  departmentId: string;
  warehouseId: string;
  address: string;
  contactPerson: string;
  contactNumber: string;
  description: string;
  isDefault: boolean;
  status: string;
  createdAt: string;
}

const StoreManagement: React.FC = () => {
  const { message } = App.useApp();
  const { can } = usePermission();
  const canCreate = can('store.create');
  const canUpdate = can('store.update');
  const canDelete = can('store.delete');

  const [data, setData] = useState<Store[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingRecord, setEditingRecord] = useState<Store | null>(null);
  const [form] = Form.useForm();

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const response = await apiService.get<Store[]>('/store/stores');
      setData(response);
    } catch (error) {
      message.error('Failed to load stores');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleCreate = () => {
    setEditingRecord(null);
    form.resetFields();
    setModalVisible(true);
  };

  const handleEdit = (record: Store) => {
    setEditingRecord(record);
    form.setFieldsValue(record);
    setModalVisible(true);
  };

  const handleDelete = async (id: string) => {
    Modal.confirm({
      title: 'Confirm Delete',
      content: 'Are you sure you want to deactivate this store?',
      onOk: async () => {
        try {
          await apiService.delete(`/store/stores/${id}`);
          message.success('Store deactivated');
          fetchData();
        } catch (error) {
          message.error('Failed to delete store');
        }
      },
    });
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      if (editingRecord) {
        await apiService.put(`/store/stores/${editingRecord.id}`, values);
        message.success('Store updated');
      } else {
        await apiService.post('/store/stores', values);
        message.success('Store created');
      }
      setModalVisible(false);
      fetchData();
    } catch (error) {
      message.error('Operation failed');
    }
  };

  const columns: ColumnsType<Store> = [
    { title: 'Store Code', dataIndex: 'storeCode', key: 'storeCode', width: 120 },
    { title: 'Store Name', dataIndex: 'storeName', key: 'storeName', width: 200 },
    {
      title: 'Type', dataIndex: 'storeType', key: 'storeType', width: 120,
      render: (type: string) => <Tag color={type === 'RAW_MATERIAL' ? 'blue' : type === 'FINISHED_GOODS' ? 'green' : 'default'}>{type}</Tag>,
    },
    { title: 'Contact Person', dataIndex: 'contactPerson', key: 'contactPerson', width: 150 },
    { title: 'Contact Number', dataIndex: 'contactNumber', key: 'contactNumber', width: 120 },
    {
      title: 'Status', dataIndex: 'status', key: 'status', width: 100,
      render: (status: string) => <Tag color={status === 'ACTIVE' ? 'green' : 'red'}>{status}</Tag>,
    },
    {
      title: 'Actions', key: 'actions', width: 120,
      render: (_, record) => (
        <Space>
          {canUpdate && <Button type="text" icon={<EditOutlined />} onClick={() => handleEdit(record)} />}
          {canDelete && <Button type="text" danger icon={<DeleteOutlined />} onClick={() => handleDelete(record.id)} />}
        </Space>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        icon={<ShopOutlined />}
        title="Store Master"
        extra={canCreate ? <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>New Store</Button> : undefined}
      />
      <div style={{ padding: '0 24px' }}>
        <Card>
          <Table
            columns={columns}
            dataSource={data}
            loading={loading}
            rowKey="id"
            pagination={{ pageSize: 20 }}
          />
        </Card>
      </div>

      <Modal
        title={editingRecord ? 'Edit Store' : 'New Store'}
        open={modalVisible}
        onOk={handleSubmit}
        onCancel={() => setModalVisible(false)}
        width={600}
      >
        <Form form={form} layout="vertical">
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="storeCode" label="Store Code" rules={[{ required: true }]}>
                <Input disabled={!!editingRecord} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="storeName" label="Store Name" rules={[{ required: true }]}>
                <Input />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="storeType" label="Store Type" initialValue="GENERAL">
                <Select>
                  <Select.Option value="RAW_MATERIAL">Raw Material</Select.Option>
                  <Select.Option value="FINISHED_GOODS">Finished Goods</Select.Option>
                  <Select.Option value="WORK_IN_PROGRESS">Work In Progress</Select.Option>
                  <Select.Option value="GENERAL">General</Select.Option>
                  <Select.Option value="QUARANTINE">Quarantine</Select.Option>
                </Select>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="isDefault" label="Default Store" valuePropName="checked">
                <input type="checkbox" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="address" label="Address">
            <Input.TextArea rows={2} />
          </Form.Item>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="contactPerson" label="Contact Person">
                <Input />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="contactNumber" label="Contact Number">
                <Input />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="description" label="Description">
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default StoreManagement;
