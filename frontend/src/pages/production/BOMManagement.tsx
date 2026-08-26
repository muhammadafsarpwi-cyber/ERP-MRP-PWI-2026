import React, { useState, useEffect, useCallback } from 'react';
import {
  Table, Button, Space, Tag, Modal, Form, Input, Select, message, Card,
  InputNumber, Row, Col, Popconfirm, Tooltip, Typography, Divider,
} from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, EyeOutlined, ReloadOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import apiService from '../../services/api';
import { formatDecimal, toNum } from '../../utils/numberFormat';

interface BomLine {
  id: string;
  lineNumber: number;
  itemId: string;
  item?: { name: string; itemCode: string };
  itemName?: string;
  itemCode?: string;
  quantity: number;
  uomId: string;
  uom?: { code: string };
  uomCode?: string;
  scrapFactor: number;
  yieldPercentage: number;
  remarks?: string;
}

interface Bom {
  id: string;
  bomCode: string;
  name: string;
  description?: string;
  status: string;
  baseQuantity: number;
  productId: string;
  product?: { name: string; itemCode: string };
  productName?: string;
  productCode?: string;
  effectiveFrom?: string;
  effectiveTo?: string;
  estimatedCost: number;
  lines: BomLine[];
  createdAt: string;
  updatedAt: string;
}

interface Item {
  id: string;
  itemCode: string;
  name: string;
  itemType: string;
}

interface Uom {
  id: string;
  code: string;
  name: string;
}

const STATUS_COLORS: Record<string, string> = {
  DRAFT: 'default',
  ACTIVE: 'green',
  OBSOLETE: 'red',
};

const BomManagement: React.FC = () => {
  const [boms, setBoms] = useState<Bom[]>([]);
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<Item[]>([]);
  const [uoms, setUoms] = useState<Uom[]>([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [detailVisible, setDetailVisible] = useState(false);
  const [editingBom, setEditingBom] = useState<Bom | null>(null);
  const [selectedBom, setSelectedBom] = useState<Bom | null>(null);
  const [form] = Form.useForm();
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<string | undefined>(undefined);

  const fetchBoms = useCallback(async () => {
    setLoading(true);
    try {
      const response = await apiService.get<{ data: Bom[]; total: number }>('/bom');
      setBoms(response.data);
    } catch (error) {
      message.error('Failed to fetch BOMs');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchItems = useCallback(async () => {
    try {
      const response = await apiService.get<{ data: Item[]; total: number }>('/items', { limit: 200 });
      setItems(response.data || []);
    } catch {}
  }, []);

  const fetchUoms = useCallback(async () => {
    try {
      const response = await apiService.get<{ data: Uom[]; total: number }>('/uoms', { limit: 200 });
      setUoms(response.data || []);
    } catch {}
  }, []);

  useEffect(() => { fetchBoms(); fetchItems(); fetchUoms(); }, [fetchBoms, fetchItems, fetchUoms]);

  const handleCreate = () => {
    setEditingBom(null);
    form.resetFields();
    form.setFieldsValue({ baseQuantity: 1, lines: [{}] });
    setModalVisible(true);
  };

  const handleEdit = (record: Bom) => {
    if (record.status !== 'DRAFT') {
      message.warning('Only DRAFT BOMs can be edited');
      return;
    }
    setEditingBom(record);
    form.setFieldsValue({
      name: record.name,
      description: record.description,
      baseQuantity: record.baseQuantity,
      productId: record.productId,
      effectiveFrom: record.effectiveFrom,
      effectiveTo: record.effectiveTo,
      lines: record.lines?.map((l) => ({
        itemId: l.itemId,
        quantity: toNum(l.quantity),
        uomId: l.uomId,
        scrapFactor: toNum(l.scrapFactor),
        yieldPercentage: toNum(l.yieldPercentage),
        remarks: l.remarks,
      })) || [],
    });
    setModalVisible(true);
  };

  const handleView = (record: Bom) => {
    setSelectedBom(record);
    setDetailVisible(true);
  };

  const handleDelete = async (id: string) => {
    try {
      await apiService.delete(`/bom/${id}`);
      message.success('BOM deleted');
      fetchBoms();
    } catch (error: any) {
      message.error(error?.response?.data?.message || 'Failed to delete BOM');
    }
  };

  const handleStatusChange = async (id: string, status: string) => {
    try {
      await apiService.put(`/bom/${id}/status`, { status });
      message.success(`BOM status changed to ${status}`);
      fetchBoms();
    } catch (error: any) {
      message.error(error?.response?.data?.message || 'Failed to change status');
    }
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      const payload: any = {
        name: values.name,
        description: values.description,
        baseQuantity: values.baseQuantity || 1,
        productId: values.productId,
        effectiveFrom: values.effectiveFrom || undefined,
        effectiveTo: values.effectiveTo || undefined,
        lines: (values.lines || []).map((l: any, i: number) => ({
          itemId: l.itemId,
          quantity: l.quantity,
          uomId: l.uomId,
          scrapFactor: l.scrapFactor || 0,
          yieldPercentage: l.yieldPercentage ?? 100,
          remarks: l.remarks || undefined,
        })),
      };

      if (editingBom) {
        await apiService.put(`/bom/${editingBom.id}`, payload);
        message.success('BOM updated');
      } else {
        await apiService.post('/bom', payload);
        message.success('BOM created');
      }
      setModalVisible(false);
      form.resetFields();
      fetchBoms();
    } catch (error: any) {
      if (error?.response?.data?.message) {
        message.error(error.response.data.message);
      }
    }
  };

  const filteredBoms = boms.filter((b) => {
    const matchSearch = !search || b.bomCode.toLowerCase().includes(search.toLowerCase()) || b.name.toLowerCase().includes(search.toLowerCase());
    const matchStatus = !filterStatus || b.status === filterStatus;
    return matchSearch && matchStatus;
  });

  const columns: ColumnsType<Bom> = [
    {
      title: 'BOM Code',
      dataIndex: 'bomCode',
      key: 'bomCode',
      width: 120,
    },
    {
      title: 'Name',
      dataIndex: 'name',
      key: 'name',
      ellipsis: true,
    },
    {
      title: 'Product',
      key: 'product',
      render: (_, r) => r.product?.name || r.productCode || '-',
    },
    {
      title: 'Lines',
      key: 'lines',
      width: 70,
      align: 'center',
      render: (_, r) => r.lines?.length || 0,
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status: string) => <Tag color={STATUS_COLORS[status]}>{status}</Tag>,
    },
    {
      title: 'Est. Cost',
      dataIndex: 'estimatedCost',
      key: 'estimatedCost',
      width: 120,
      align: 'right',
      render: (val: any) => formatDecimal(val, 2),
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 200,
      render: (_, record) => (
        <Space size="small">
          <Tooltip title="View"><Button type="link" size="small" icon={<EyeOutlined />} onClick={() => handleView(record)} /></Tooltip>
          {record.status === 'DRAFT' && (
            <>
              <Tooltip title="Edit"><Button type="link" size="small" icon={<EditOutlined />} onClick={() => handleEdit(record)} /></Tooltip>
              <Popconfirm title="Delete this BOM?" onConfirm={() => handleDelete(record.id)}>
                <Button type="link" size="small" danger icon={<DeleteOutlined />} />
              </Popconfirm>
            </>
          )}
          {record.status === 'DRAFT' && (
            <Button type="link" size="small" onClick={() => handleStatusChange(record.id, 'ACTIVE')}>Activate</Button>
          )}
          {record.status === 'ACTIVE' && (
            <Button type="link" size="small" danger onClick={() => handleStatusChange(record.id, 'OBSOLETE')}>Obsolete</Button>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div>
      <Card title="Bill of Materials" extra={
        <Space>
          <Input.Search placeholder="Search BOMs..." allowClear onSearch={setSearch} style={{ width: 200 }} />
          <Select placeholder="Status" allowClear style={{ width: 120 }} value={filterStatus} onChange={setFilterStatus}>
            <Select.Option value="DRAFT">Draft</Select.Option>
            <Select.Option value="ACTIVE">Active</Select.Option>
            <Select.Option value="OBSOLETE">Obsolete</Select.Option>
          </Select>
          <Button icon={<ReloadOutlined />} onClick={fetchBoms}>Refresh</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>New BOM</Button>
        </Space>
      }>
        <Table
          columns={columns}
          dataSource={filteredBoms}
          rowKey="id"
          loading={loading}
          pagination={{ pageSize: 20 }}
        />
      </Card>

      {/* Create/Edit Modal */}
      <Modal
        title={editingBom ? `Edit BOM ${editingBom.bomCode}` : 'Create New BOM'}
        open={modalVisible}
        onOk={handleSubmit}
        onCancel={() => { setModalVisible(false); form.resetFields(); }}
        width={900}
        destroyOnHidden
      >
        <Form form={form} layout="vertical">
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="name" label="BOM Name" rules={[{ required: true, message: 'Required' }]}>
                <Input placeholder="e.g. Widget Assembly BOM" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="productId" label="Product (Finished Good)" rules={[{ required: true, message: 'Required' }]}>
                <Select placeholder="Select product" showSearch optionFilterProp="label"
                  options={items.map((i) => ({ value: i.id, label: `${i.itemCode} - ${i.name}` }))} />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="description" label="Description">
                <Input.TextArea rows={2} placeholder="Optional description" />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="baseQuantity" label="Base Quantity" initialValue={1}>
                <InputNumber min={0.0001} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>

          <Divider orientation="left">Component Lines</Divider>
          <Form.List name="lines">
            {(fields, { add, remove }) => (
              <>
                {fields.map(({ key, name, ...rest }) => (
                  <Row key={key} gutter={8} style={{ marginBottom: 8 }} align="middle">
                    <Col span={8}>
                      <Form.Item {...rest} name={[name, 'itemId']} rules={[{ required: true, message: 'Item required' }]} style={{ marginBottom: 0 }}>
                        <Select placeholder="Component item" showSearch optionFilterProp="label"
                          options={items.map((i) => ({ value: i.id, label: `${i.itemCode} - ${i.name}` }))} />
                      </Form.Item>
                    </Col>
                    <Col span={3}>
                      <Form.Item {...rest} name={[name, 'quantity']} rules={[{ required: true }]} initialValue={1} style={{ marginBottom: 0 }}>
                        <InputNumber min={0.0001} style={{ width: '100%' }} placeholder="Qty" />
                      </Form.Item>
                    </Col>
                    <Col span={4}>
                      <Form.Item {...rest} name={[name, 'uomId']} rules={[{ required: true }]} style={{ marginBottom: 0 }}>
                        <Select placeholder="UOM"
                          options={uoms.map((u) => ({ value: u.id, label: u.code }))} />
                      </Form.Item>
                    </Col>
                    <Col span={3}>
                      <Form.Item {...rest} name={[name, 'scrapFactor']} initialValue={0} style={{ marginBottom: 0 }}>
                        <InputNumber min={0} max={1} step={0.01} style={{ width: '100%' }} placeholder="Scrap %" />
                      </Form.Item>
                    </Col>
                    <Col span={3}>
                      <Form.Item {...rest} name={[name, 'yieldPercentage']} initialValue={100} style={{ marginBottom: 0 }}>
                        <InputNumber min={0} max={100} style={{ width: '100%' }} placeholder="Yield %" />
                      </Form.Item>
                    </Col>
                    <Col span={2}>
                      <Form.Item {...rest} name={[name, 'remarks']} style={{ marginBottom: 0 }}>
                        <Input placeholder="Remarks" />
                      </Form.Item>
                    </Col>
                    <Col span={1}>
                      {fields.length > 1 && (
                        <Button type="link" danger icon={<DeleteOutlined />} onClick={() => remove(name)} />
                      )}
                    </Col>
                  </Row>
                ))}
                <Button type="dashed" onClick={() => add()} icon={<PlusOutlined />} block>
                  Add Component Line
                </Button>
              </>
            )}
          </Form.List>
        </Form>
      </Modal>

      {/* Detail Modal */}
      <Modal
        title={selectedBom ? `BOM ${selectedBom.bomCode} - ${selectedBom.name}` : 'BOM Details'}
        open={detailVisible}
        onCancel={() => setDetailVisible(false)}
        footer={null}
        width={800}
      >
        {selectedBom && (
          <div>
            <Row gutter={16}>
              <Col span={12}>
                <Typography.Text type="secondary">Status</Typography.Text><br />
                <Tag color={STATUS_COLORS[selectedBom.status]}>{selectedBom.status}</Tag>
              </Col>
              <Col span={12}>
                <Typography.Text type="secondary">Product</Typography.Text><br />
                <Typography.Text>{selectedBom.product?.name || selectedBom.productCode || '-'}</Typography.Text>
              </Col>
            </Row>
            <Row gutter={16} style={{ marginTop: 16 }}>
              <Col span={8}>
                <Typography.Text type="secondary">Base Quantity</Typography.Text><br />
                <Typography.Text>{formatDecimal(selectedBom.baseQuantity, 0)}</Typography.Text>
              </Col>
              <Col span={8}>
                <Typography.Text type="secondary">Estimated Cost</Typography.Text><br />
                <Typography.Text strong>{formatDecimal(selectedBom.estimatedCost, 2)}</Typography.Text>
              </Col>
              <Col span={8}>
                <Typography.Text type="secondary">Lines</Typography.Text><br />
                <Typography.Text>{selectedBom.lines?.length || 0}</Typography.Text>
              </Col>
            </Row>
            {selectedBom.description && (
              <div style={{ marginTop: 16 }}>
                <Typography.Text type="secondary">Description</Typography.Text><br />
                <Typography.Text>{selectedBom.description}</Typography.Text>
              </div>
            )}
            <Divider orientation="left">Component Lines</Divider>
            <Table
              dataSource={selectedBom.lines || []}
              rowKey="id"
              pagination={false}
              size="small"
              columns={[
                { title: '#', dataIndex: 'lineNumber', width: 50 },
                { title: 'Item', key: 'item', render: (_, r) => r.item?.name || r.itemCode || r.itemId },
                { title: 'Qty', dataIndex: 'quantity', width: 80, render: (v: any) => formatDecimal(v, 2) },
                { title: 'UOM', key: 'uom', width: 70, render: (_, r) => r.uom?.code || r.uomCode || '-' },
                { title: 'Scrap %', dataIndex: 'scrapFactor', width: 80, render: (v: any) => `${toNum(v) * 100}%` },
                { title: 'Yield %', dataIndex: 'yieldPercentage', width: 80, render: (v: any) => `${toNum(v)}%` },
                { title: 'Remarks', dataIndex: 'remarks', ellipsis: true },
              ]}
            />
          </div>
        )}
      </Modal>
    </div>
  );
};

export default BomManagement;
