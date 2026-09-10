import React, { useState, useEffect, useCallback } from 'react';
import { Card, Table, Button, Modal, Form, Input, Select, Tag, message } from 'antd';
import { SettingOutlined, EditOutlined } from '@ant-design/icons';
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
  departmentId: string;
  warehouseId: string;
  isDefault: boolean;
  status: string;
  address: string;
  contactPerson: string;
  contactNumber: string;
  description: string;
}

const StoreSettings: React.FC = () => {
  const { can } = usePermission();
  const canEdit = can('store.update');
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
    } catch {
      message.error('Failed to load stores');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleEdit = (record: Store) => {
    setEditingRecord(record);
    form.setFieldsValue(record);
    setModalVisible(true);
  };

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      if (editingRecord) {
        await apiService.put(`/store/stores/${editingRecord.id}`, values);
        message.success('Store settings updated');
      }
      setModalVisible(false);
      form.resetFields();
      setEditingRecord(null);
      fetchData();
    } catch {
      message.error('Failed to save');
    }
  };

  const columns: ColumnsType<Store> = [
    { title: 'Store Code', dataIndex: 'storeCode', key: 'storeCode', width: 120 },
    { title: 'Store Name', dataIndex: 'storeName', key: 'storeName', width: 200 },
    { title: 'Type', dataIndex: 'storeType', key: 'storeType', width: 100, render: (v: string) => <Tag>{v}</Tag> },
    { title: 'Default', dataIndex: 'isDefault', key: 'isDefault', width: 80, align: 'center', render: (v: boolean) => v ? <Tag color="green">Yes</Tag> : <Tag>No</Tag> },
    { title: 'Status', dataIndex: 'status', key: 'status', width: 100, render: (v: string) => <Tag color={v === 'ACTIVE' ? 'green' : 'red'}>{v}</Tag> },
    {
      title: 'Actions',
      key: 'actions',
      width: 100,
      render: (_: any, record: Store) => (
        canEdit ? (
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => handleEdit(record)}>
            Edit
          </Button>
        ) : null
      ),
    },
  ];

  return (
    <div>
      <PageHeader icon={<SettingOutlined />} title="Store Settings" />
      <div style={{ padding: '0 24px' }}>
        <Card>
          <Table
            columns={columns}
            dataSource={data}
            rowKey="id"
            loading={loading}
            pagination={{ pageSize: 20 }}
            scroll={{ x: 800 }}
            size="middle"
          />
        </Card>

        <Modal
          title={`Edit Store Settings${editingRecord ? ` - ${editingRecord.storeName}` : ''}`}
          open={modalVisible}
          onOk={handleSave}
          onCancel={() => { setModalVisible(false); form.resetFields(); setEditingRecord(null); }}
          width={600}
        >
          <Form form={form} layout="vertical">
            <Form.Item name="storeName" label="Store Name" rules={[{ required: true }]}>
              <Input />
            </Form.Item>
            <Form.Item name="storeType" label="Store Type">
              <Select options={[{ value: 'GENERAL', label: 'General' }, { value: 'RAW_MATERIAL', label: 'Raw Material' }, { value: 'FINISHED_GOODS', label: 'Finished Goods' }, { value: 'SPARE_PARTS', label: 'Spare Parts' }, { value: 'CONSUMABLES', label: 'Consumables' }]} />
            </Form.Item>
            <Form.Item name="address" label="Address">
              <Input.TextArea rows={2} />
            </Form.Item>
            <Form.Item name="contactPerson" label="Contact Person">
              <Input />
            </Form.Item>
            <Form.Item name="contactNumber" label="Contact Number">
              <Input />
            </Form.Item>
            <Form.Item name="description" label="Description">
              <Input.TextArea rows={2} />
            </Form.Item>
          </Form>
        </Modal>
      </div>
    </div>
  );
};

export default StoreSettings;
