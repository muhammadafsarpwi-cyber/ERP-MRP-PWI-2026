import React, { useState, useEffect, useCallback } from 'react';
import {
  Table, Button, Space, Tag, Modal, Form, Select, InputNumber, message, Popconfirm, Card,
} from 'antd';
import { PlusOutlined, EditOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import apiService from '../../services/api';

interface UomConversion {
  id: string;
  fromUomId: string;
  fromUomCode: string;
  toUomId: string;
  toUomCode: string;
  conversionFactor: number;
  status: string;
}

interface UomOption {
  id: string;
  code: string;
  name: string;
}

const statusColorMap: Record<string, string> = {
  ACTIVE: 'green',
  INACTIVE: 'red',
};

const UomConversionManagement: React.FC = () => {
  const [conversions, setConversions] = useState<UomConversion[]>([]);
  const [uoms, setUoms] = useState<UomOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingConversion, setEditingConversion] = useState<UomConversion | null>(null);
  const [form] = Form.useForm();
  const [pageSize] = useState(20);

  const fetchConversions = useCallback(async (pageNum: number = 1) => {
    setLoading(true);
    try {
      const response = await apiService.get<{ data: UomConversion[]; total: number }>('/master-data/uom-conversions', {
        page: pageNum,
        limit: pageSize,
      });
      setConversions(response.data);
      setTotal(response.total);
    } catch (error) {
      message.error('Failed to fetch UOM conversions');
    } finally {
      setLoading(false);
    }
  }, [pageSize]);

  const fetchUoms = useCallback(async () => {
    try {
      const response = await apiService.get<{ data: UomOption[] }>('/master-data/uom', { limit: 200 });
      setUoms(response.data);
    } catch (error) {
      message.error('Failed to fetch UOMs');
    }
  }, []);

  useEffect(() => {
    fetchUoms();
  }, [fetchUoms]);

  useEffect(() => {
    fetchConversions(page);
  }, [page, fetchConversions]);

  const handleCreate = () => {
    setEditingConversion(null);
    form.resetFields();
    form.setFieldsValue({ conversionFactor: 1 });
    setModalVisible(true);
  };

  const handleEdit = (record: UomConversion) => {
    setEditingConversion(record);
    form.setFieldsValue({
      fromUomId: record.fromUomId,
      toUomId: record.toUomId,
      conversionFactor: record.conversionFactor,
    });
    setModalVisible(true);
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      if (values.fromUomId === values.toUomId) {
        message.error('From UOM and To UOM must be different');
        return;
      }
      if (editingConversion) {
        await apiService.patch(`/master-data/uom-conversions/${editingConversion.id}`, values);
        message.success('UOM conversion updated');
      } else {
        await apiService.post('/master-data/uom-conversions', values);
        message.success('UOM conversion created');
      }
      setModalVisible(false);
      fetchConversions(page);
    } catch (error) {
      message.error('Operation failed');
    }
  };

  const handleActivate = async (id: string) => {
    try {
      await apiService.patch(`/master-data/uom-conversions/${id}/activate`);
      message.success('UOM conversion activated');
      fetchConversions(page);
    } catch (error) {
      message.error('Failed to activate UOM conversion');
    }
  };

  const handleDeactivate = async (id: string) => {
    try {
      await apiService.patch(`/master-data/uom-conversions/${id}/deactivate`);
      message.success('UOM conversion deactivated');
      fetchConversions(page);
    } catch (error) {
      message.error('Failed to deactivate UOM conversion');
    }
  };

  const getUomLabel = (uomId: string) => {
    const uom = uoms.find(u => u.id === uomId);
    return uom ? `${uom.name} (${uom.code})` : uomId;
  };

  const columns: ColumnsType<UomConversion> = [
    {
      title: 'From UOM', dataIndex: 'fromUomId', key: 'fromUomId', width: 180,
      render: (v: string) => getUomLabel(v),
    },
    {
      title: 'To UOM', dataIndex: 'toUomId', key: 'toUomId', width: 180,
      render: (v: string) => getUomLabel(v),
    },
    { title: 'Conversion Factor', dataIndex: 'conversionFactor', key: 'conversionFactor', width: 160 },
    {
      title: 'Status', dataIndex: 'status', key: 'status', width: 110,
      render: (s: string) => <Tag color={statusColorMap[s] || 'default'}>{s}</Tag>,
    },
    {
      title: 'Actions', key: 'actions', width: 140,
      render: (_, record) => (
        <Space size="small">
          <Button type="link" icon={<EditOutlined />} onClick={() => handleEdit(record)} />
          {record.status === 'INACTIVE' ? (
            <Popconfirm title="Activate this conversion?" onConfirm={() => handleActivate(record.id)}>
              <Button type="link">Activate</Button>
            </Popconfirm>
          ) : (
            <Popconfirm title="Deactivate this conversion?" onConfirm={() => handleDeactivate(record.id)}>
              <Button type="link" danger>Deactivate</Button>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  return (
    <Card title="UOM Conversion Management">
      <Space style={{ marginBottom: 16 }}>
        <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>Add Conversion</Button>
      </Space>

      <Table
        columns={columns}
        dataSource={conversions}
        rowKey="id"
        loading={loading}
        pagination={{
          current: page,
          total,
          pageSize,
          onChange: setPage,
          showSizeChanger: false,
        }}
      />

      <Modal
        title={editingConversion ? 'Edit UOM Conversion' : 'Create UOM Conversion'}
        open={modalVisible}
        onOk={handleSubmit}
        onCancel={() => setModalVisible(false)}
        width={500}
        destroyOnClose
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="fromUomId"
            label="From UOM"
            rules={[{ required: true, message: 'Please select a From UOM' }]}
          >
            <Select
              showSearch
              optionFilterProp="label"
              options={uoms.map(u => ({ value: u.id, label: `${u.name} (${u.code})` }))}
            />
          </Form.Item>
          <Form.Item
            name="toUomId"
            label="To UOM"
            rules={[{ required: true, message: 'Please select a To UOM' }]}
          >
            <Select
              showSearch
              optionFilterProp="label"
              options={uoms.map(u => ({ value: u.id, label: `${u.name} (${u.code})` }))}
            />
          </Form.Item>
          <Form.Item
            name="conversionFactor"
            label="Conversion Factor"
            rules={[{ required: true, message: 'Please enter a conversion factor' }]}
          >
            <InputNumber min={0.000001} step={0.001} style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
};

export default UomConversionManagement;
