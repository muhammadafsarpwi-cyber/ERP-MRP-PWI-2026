import React, { useState, useEffect } from 'react';
import {
  Table, Button, Space, Tag, Modal, Form, Input, Select, InputNumber, message, Popconfirm, Card,
} from 'antd';
import { PlusOutlined, EditOutlined, SearchOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import apiService from '../../services/api';

const UOM_TYPES = ['COUNT', 'WEIGHT', 'LENGTH', 'AREA', 'VOLUME', 'TIME', 'OTHER'];

interface Uom {
  id: string;
  code: string;
  name: string;
  symbol: string;
  uomType: string;
  decimalPrecision: number;
  status: string;
}

const statusColorMap: Record<string, string> = {
  ACTIVE: 'green',
  INACTIVE: 'red',
};

const UomManagement: React.FC = () => {
  const [uoms, setUoms] = useState<Uom[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingUom, setEditingUom] = useState<Uom | null>(null);
  const [form] = Form.useForm();
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<string | undefined>(undefined);
  const [pageSize] = useState(20);

  const fetchUoms = async (pageNum: number = 1) => {
    setLoading(true);
    try {
      const params: any = { page: pageNum, limit: pageSize };
      if (search) params.search = search;
      if (filterType) params.uomType = filterType;
      const response = await apiService.get<{ data: Uom[]; total: number }>('/master-data/uom', params);
      setUoms(response.data);
      setTotal(response.total);
    } catch (error) {
      message.error('Failed to fetch UOMs');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUoms(page);
  }, [page, search, filterType]);

  const handleCreate = () => {
    setEditingUom(null);
    form.resetFields();
    form.setFieldsValue({ decimalPrecision: 2 });
    setModalVisible(true);
  };

  const handleEdit = (record: Uom) => {
    setEditingUom(record);
    form.setFieldsValue(record);
    setModalVisible(true);
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      if (editingUom) {
        await apiService.patch(`/master-data/uom/${editingUom.id}`, values);
        message.success('UOM updated');
      } else {
        await apiService.post('/master-data/uom', values);
        message.success('UOM created');
      }
      setModalVisible(false);
      fetchUoms(page);
    } catch (error) {
      message.error('Operation failed');
    }
  };

  const handleActivate = async (id: string) => {
    try {
      await apiService.patch(`/master-data/uom/${id}/activate`);
      message.success('UOM activated');
      fetchUoms(page);
    } catch (error) {
      message.error('Failed to activate UOM');
    }
  };

  const handleDeactivate = async (id: string) => {
    try {
      await apiService.patch(`/master-data/uom/${id}/deactivate`);
      message.success('UOM deactivated');
      fetchUoms(page);
    } catch (error) {
      message.error('Failed to deactivate UOM');
    }
  };

  const columns: ColumnsType<Uom> = [
    { title: 'Code', dataIndex: 'code', key: 'code', width: 120 },
    { title: 'Name', dataIndex: 'name', key: 'name', width: 180 },
    { title: 'Symbol', dataIndex: 'symbol', key: 'symbol', width: 100 },
    { title: 'UOM Type', dataIndex: 'uomType', key: 'uomType', width: 130 },
    { title: 'Decimal Precision', dataIndex: 'decimalPrecision', key: 'decimalPrecision', width: 150 },
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
            <Popconfirm title="Activate this UOM?" onConfirm={() => handleActivate(record.id)}>
              <Button type="link">Activate</Button>
            </Popconfirm>
          ) : (
            <Popconfirm title="Deactivate this UOM?" onConfirm={() => handleDeactivate(record.id)}>
              <Button type="link" danger>Deactivate</Button>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  return (
    <Card title="UOM Management">
      <Space style={{ marginBottom: 16 }} wrap>
        <Input
          placeholder="Search UOMs..."
          prefix={<SearchOutlined />}
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          style={{ width: 250 }}
          allowClear
        />
        <Select
          placeholder="UOM Type"
          value={filterType}
          onChange={(v) => { setFilterType(v); setPage(1); }}
          style={{ width: 150 }}
          allowClear
        >
          {UOM_TYPES.map(t => <Select.Option key={t} value={t}>{t}</Select.Option>)}
        </Select>
        <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>Add UOM</Button>
      </Space>

      <Table
        columns={columns}
        dataSource={uoms}
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
        title={editingUom ? 'Edit UOM' : 'Create UOM'}
        open={modalVisible}
        onOk={handleSubmit}
        onCancel={() => setModalVisible(false)}
        width={500}
        destroyOnClose
      >
        <Form form={form} layout="vertical">
          <Form.Item name="code" label="Code" rules={[{ required: true }]}>
            <Input disabled={!!editingUom} />
          </Form.Item>
          <Form.Item name="name" label="Name" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="symbol" label="Symbol" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="uomType" label="UOM Type" rules={[{ required: true }]}>
            <Select>
              {UOM_TYPES.map(t => <Select.Option key={t} value={t}>{t}</Select.Option>)}
            </Select>
          </Form.Item>
          <Form.Item name="decimalPrecision" label="Decimal Precision" rules={[{ required: true }]}>
            <InputNumber min={0} max={10} style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
};

export default UomManagement;
