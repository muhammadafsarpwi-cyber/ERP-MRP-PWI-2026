import React, { useState, useEffect, useCallback } from 'react';
import { App, Table, Button, Space, Tag, Modal, Form, Input, Select, Popconfirm, Card, Tree } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, CheckCircleOutlined, CloseCircleOutlined, ApartmentOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import apiService from '../../services/api';
import { formatApiError } from '../../utils/apiError';

interface Warehouse {
  id: string;
  warehouseCode: string;
  name: string;
}

interface WarehouseLocation {
  id: string;
  locationCode: string;
  name: string;
  warehouseId: string;
  warehouse?: Warehouse;
  parentLocationId?: string;
  parentLocation?: WarehouseLocation;
  children?: WarehouseLocation[];
  status: string;
  createdAt: string;
}

const LocationManagement: React.FC = () => {
  const { message } = App.useApp();
  const [locations, setLocations] = useState<WarehouseLocation[]>([]);
  const [hierarchy, setHierarchy] = useState<WarehouseLocation[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [selectedWarehouse, setSelectedWarehouse] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingLocation, setEditingLocation] = useState<WarehouseLocation | null>(null);
  const [viewMode, setViewMode] = useState<'table' | 'tree'>('table');
  const [submitting, setSubmitting] = useState(false);
  const [form] = Form.useForm();

  const fetchLocations = useCallback(async (pageNum: number = 1) => {
    setLoading(true);
    try {
      const params: any = { page: pageNum, limit: 20 };
      if (selectedWarehouse) {
        params.warehouseId = selectedWarehouse;
      }
      const response = await apiService.get<{ data: WarehouseLocation[]; total: number }>('/warehouse-locations', params);
      setLocations(response.data);
      setTotal(response.total);
    } catch (error) {
      message.error(formatApiError(error, 'Failed to fetch locations'));
    } finally {
      setLoading(false);
    }
  }, [selectedWarehouse, message]);

  const fetchHierarchy = useCallback(async () => {
    if (!selectedWarehouse) return;
    try {
      const response = await apiService.get<{ data: WarehouseLocation[] }>(`/warehouse-locations/hierarchy/${selectedWarehouse}`);
      setHierarchy(response.data);
    } catch (error) {
      message.error(formatApiError(error, 'Failed to fetch location hierarchy'));
    }
  }, [selectedWarehouse, message]);

  const fetchWarehouses = useCallback(async () => {
    try {
      const response = await apiService.get<{ data: Warehouse[] }>('/warehouses', { limit: 100 });
      setWarehouses(response.data);
    } catch (error) {
      message.error(formatApiError(error, 'Failed to fetch warehouses'));
    }
  }, [message]);

  useEffect(() => {
    fetchWarehouses();
  }, [fetchWarehouses]);

  useEffect(() => {
    fetchLocations(page);
    if (selectedWarehouse) {
      fetchHierarchy();
    }
  }, [page, selectedWarehouse, fetchLocations, fetchHierarchy]);

  const handleCreate = () => {
    setEditingLocation(null);
    form.resetFields();
    if (selectedWarehouse) {
      form.setFieldValue('warehouseId', selectedWarehouse);
    }
    setModalVisible(true);
  };

  const handleEdit = (record: WarehouseLocation) => {
    setEditingLocation(record);
    form.setFieldsValue(record);
    setModalVisible(true);
  };

  const handleDelete = async (id: string) => {
    try {
      await apiService.delete(`/warehouse-locations/${id}`);
      message.success('Location deleted successfully');
      fetchLocations(page);
      fetchHierarchy();
    } catch (error) {
      message.error(formatApiError(error, 'Failed to delete location'));
    }
  };

  const handleActivate = async (id: string) => {
    try {
      await apiService.patch(`/warehouse-locations/${id}/activate`);
      message.success('Location activated successfully');
      fetchLocations(page);
      fetchHierarchy();
    } catch (error) {
      message.error(formatApiError(error, 'Failed to activate location'));
    }
  };

  const handleDeactivate = async (id: string) => {
    try {
      await apiService.patch(`/warehouse-locations/${id}/deactivate`);
      message.success('Location deactivated successfully');
      fetchLocations(page);
      fetchHierarchy();
    } catch (error) {
      message.error(formatApiError(error, 'Failed to deactivate location'));
    }
  };

  const handleSubmit = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      const values = await form.validateFields();
      if (editingLocation) {
        await apiService.patch(`/warehouse-locations/${editingLocation.id}`, values);
        message.success('Location updated successfully');
      } else {
        await apiService.post('/warehouse-locations', values);
        message.success('Location created successfully');
      }
      setModalVisible(false);
      fetchLocations(page);
      fetchHierarchy();
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

  const convertToTreeData = (locations: WarehouseLocation[]): any[] => {
    return locations.map((loc) => ({
      key: loc.id,
      title: `${loc.locationCode} - ${loc.name}`,
      children: loc.children ? convertToTreeData(loc.children) : [],
    }));
  };

  const columns: ColumnsType<WarehouseLocation> = [
    {
      title: 'Code',
      dataIndex: 'locationCode',
      key: 'locationCode',
      sorter: true,
    },
    {
      title: 'Name',
      dataIndex: 'name',
      key: 'name',
    },
    {
      title: 'Warehouse',
      key: 'warehouse',
      render: (_, record) => record.warehouse?.name || '-',
    },
    {
      title: 'Parent Location',
      key: 'parentLocation',
      render: (_, record) => record.parentLocation?.name || '-',
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
            <Popconfirm title="Deactivate this location?" onConfirm={() => handleDeactivate(record.id)}>
              <Button type="link" danger icon={<CloseCircleOutlined />} />
            </Popconfirm>
          ) : (
            <Popconfirm title="Activate this location?" onConfirm={() => handleActivate(record.id)}>
              <Button type="link" icon={<CheckCircleOutlined />} />
            </Popconfirm>
          )}
          <Popconfirm title="Delete this location?" onConfirm={() => handleDelete(record.id)}>
            <Button type="link" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <Card
      title="Warehouse Location Management"
      extra={
        <Space>
          <Button
            type={viewMode === 'table' ? 'primary' : 'default'}
            onClick={() => setViewMode('table')}
          >
            Table View
          </Button>
          <Button
            type={viewMode === 'tree' ? 'primary' : 'default'}
            icon={<ApartmentOutlined />}
            onClick={() => setViewMode('tree')}
          >
            Tree View
          </Button>
        </Space>
      }
    >
      <Space style={{ marginBottom: 16 }}>
        <Select
          placeholder="Select Warehouse"
          style={{ width: 200 }}
          allowClear
          onChange={(value) => setSelectedWarehouse(value)}
        >
          {warehouses.map((wh) => (
            <Select.Option key={wh.id} value={wh.id}>
              {wh.warehouseCode} - {wh.name}
            </Select.Option>
          ))}
        </Select>
        <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate} disabled={!selectedWarehouse}>
          Add Location
        </Button>
      </Space>

      {viewMode === 'table' ? (
        <Table
          columns={columns}
          dataSource={locations}
          rowKey="id"
          loading={loading}
          pagination={{
            current: page,
            total,
            pageSize: 20,
            onChange: setPage,
          }}
        />
      ) : (
        <Tree
          treeData={convertToTreeData(hierarchy)}
          defaultExpandAll
          showLine
        />
      )}

      <Modal
        title={editingLocation ? 'Edit Location' : 'Create Location'}
        open={modalVisible}
        onOk={handleSubmit}
        confirmLoading={submitting}
        onCancel={() => {
          if (!submitting) setModalVisible(false);
        }}
        width={600}
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="warehouseId"
            label="Warehouse"
            rules={[{ required: true, message: 'Please select warehouse' }]}
          >
            <Select placeholder="Select warehouse" disabled={!!selectedWarehouse}>
              {warehouses.map((wh) => (
                <Select.Option key={wh.id} value={wh.id}>
                  {wh.warehouseCode} - {wh.name}
                </Select.Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item
            name="locationCode"
            label="Location Code"
            rules={[{ required: true, message: 'Please enter location code' }]}
          >
            <Input disabled={!!editingLocation} />
          </Form.Item>
          <Form.Item
            name="name"
            label="Name"
            rules={[{ required: true, message: 'Please enter name' }]}
          >
            <Input />
          </Form.Item>
          <Form.Item name="description" label="Description">
            <Input.TextArea />
          </Form.Item>
          <Form.Item name="parentLocationId" label="Parent Location">
            <Select placeholder="Select parent location (optional)" allowClear>
              {locations.map((loc) => (
                <Select.Option key={loc.id} value={loc.id}>
                  {loc.locationCode} - {loc.name}
                </Select.Option>
              ))}
            </Select>
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
};

export default LocationManagement;
