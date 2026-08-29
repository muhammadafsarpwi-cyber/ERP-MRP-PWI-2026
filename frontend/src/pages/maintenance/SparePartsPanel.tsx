import React, { useEffect, useState, useCallback } from 'react';
import { App as AntApp, Button, Card, Descriptions, Empty, Form, Input, InputNumber, Modal, Popconfirm, Space, Table, Tag, Typography } from 'antd';
import { PlusOutlined, DeleteOutlined, ShoppingCartOutlined } from '@ant-design/icons';
import apiService from '../../services/api';
import { usePermission } from '../../hooks/usePermission';
import { errorText } from './jobCards.types';

type SparePart = Record<string, any>;
type StockInfo = { balances: any[]; totalOnHand: number; totalReserved: number; totalAvailable: number };

const BASE = '/master-data/maintenance/job-cards';

export const SparePartsPanel: React.FC<{
  jobCardId: string;
  companyId: string;
  isEditable: boolean;
  onUpdate: () => void;
}> = ({ jobCardId, companyId, isEditable, onUpdate }) => {
  const { message } = AntApp.useApp();
  const { can } = usePermission();
  const [parts, setParts] = useState<SparePart[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [form] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);
  const [stockInfo, setStockInfo] = useState<StockInfo | null>(null);

  const loadParts = useCallback(async () => {
    setLoading(true);
    try {
      const result = await apiService.get<any[]>(`${BASE}/${jobCardId}/parts`);
      setParts(result || []);
    } catch {
      setParts([]);
    } finally {
      setLoading(false);
    }
  }, [jobCardId]);

  useEffect(() => { loadParts(); }, [loadParts]);

  const checkStock = async (itemId: string) => {
    if (!itemId || !companyId) { setStockInfo(null); return; }
    try {
      const result = await apiService.get<any>(`${BASE}/stock-check`, { companyId, itemId });
      setStockInfo(result);
    } catch {
      setStockInfo(null);
    }
  };

  const addPart = async (values: any) => {
    setSubmitting(true);
    try {
      await apiService.post(`${BASE}/${jobCardId}/parts`, {
        itemId: values.itemId,
        quantity: values.quantity,
        uomId: values.uomId,
        unitCost: values.unitCost || undefined,
        issuedFrom: values.issuedFrom || undefined,
        remarks: values.remarks || undefined,
      });
      message.success('Spare part added');
      setAddOpen(false);
      form.resetFields();
      setStockInfo(null);
      loadParts();
      onUpdate();
    } catch (e) {
      message.error(errorText(e));
    } finally {
      setSubmitting(false);
    }
  };

  const removePart = async (partId: string) => {
    try {
      await apiService.delete(`${BASE}/${jobCardId}/parts/${partId}`);
      message.success('Spare part removed');
      loadParts();
      onUpdate();
    } catch (e) {
      message.error(errorText(e));
    }
  };

  const columns = [
    {
      title: 'Item',
      render: (_: any, r: SparePart) => (
        <Space direction="vertical" size={0}>
          <Typography.Text strong>{r.item?.name || r.itemId}</Typography.Text>
          {r.item?.itemCode && <Typography.Text type="secondary" style={{ fontSize: 12 }}>{r.item.itemCode}</Typography.Text>}
        </Space>
      ),
    },
    { title: 'Quantity', dataIndex: 'quantity', render: (v: number) => <Tag>{v}</Tag> },
    {
      title: 'UOM',
      render: (_: any, r: SparePart) => r.uom?.code || r.uomId || '—',
    },
    {
      title: 'Unit Cost',
      dataIndex: 'unitCost',
      render: (v: number) => v ? `₹${v.toFixed(2)}` : '—',
    },
    {
      title: 'Total Cost',
      dataIndex: 'totalCost',
      render: (v: number) => v ? <Typography.Text type="success">₹{v.toFixed(2)}</Typography.Text> : '—',
    },
    {
      title: 'Warehouse',
      render: (_: any, r: SparePart) => r.issuedFromWarehouse?.name || r.issuedFrom || '—',
    },
    {
      title: 'Issued At',
      dataIndex: 'issuedAt',
      render: (v: string) => v ? new Date(v).toLocaleString() : '—',
    },
    {
      title: 'Remarks',
      dataIndex: 'remarks',
      ellipsis: true,
    },
    ...(isEditable && can('maintenance.job_card.update')
      ? [{
          title: '',
          key: 'actions',
          width: 50,
          render: (_: any, r: SparePart) => (
            <Popconfirm title="Remove this part?" onConfirm={() => removePart(r.id)}>
              <Button type="text" danger icon={<DeleteOutlined />} size="small" />
            </Popconfirm>
          ),
        }]
      : []),
  ];

  const totalCost = parts.reduce((sum, p) => sum + (p.totalCost || 0), 0);

  return (
    <Card
      title={<Space><ShoppingCartOutlined /> Spare Parts</Space>}
      extra={
        isEditable && can('maintenance.job_card.update') ? (
          <Button type="primary" size="small" icon={<PlusOutlined />} onClick={() => { form.resetFields(); setStockInfo(null); setAddOpen(true); }}>
            Add Part
          </Button>
        ) : undefined
      }
    >
      <Table
        rowKey="id"
        columns={columns}
        dataSource={parts}
        loading={loading}
        pagination={false}
        size="small"
        locale={{ emptyText: <Empty description="No spare parts recorded" /> }}
        summary={() => parts.length > 0 ? (
          <Table.Summary.Row>
            <Table.Summary.Cell index={0} colSpan={3}>
              <Typography.Text strong>Total ({parts.length} items)</Typography.Text>
            </Table.Summary.Cell>
            <Table.Summary.Cell index={3} colSpan={2}>
              <Typography.Text type="success" strong>₹{totalCost.toFixed(2)}</Typography.Text>
            </Table.Summary.Cell>
          </Table.Summary.Row>
        ) : null}
      />

      <Modal
        title="Add Spare Part"
        open={addOpen}
        confirmLoading={submitting}
        onCancel={() => { setAddOpen(false); setStockInfo(null); }}
        onOk={() => form.submit()}
        width={600}
      >
        <Form form={form} layout="vertical" onFinish={addPart}>
          <Form.Item
            name="itemId"
            label="Item"
            rules={[{ required: true, message: 'Item is required' }]}
          >
            <Input
              placeholder="Enter Item ID (must be SPARE_PART type)"
              onChange={(e) => checkStock(e.target.value)}
            />
          </Form.Item>

          {stockInfo && (
            <Descriptions size="small" bordered column={3} style={{ marginBottom: 16 }}>
              <Descriptions.Item label="On Hand">{stockInfo.totalOnHand}</Descriptions.Item>
              <Descriptions.Item label="Reserved">{stockInfo.totalReserved}</Descriptions.Item>
              <Descriptions.Item label="Available">
                <Typography.Text type={stockInfo.totalAvailable > 0 ? 'success' : 'danger'}>
                  {stockInfo.totalAvailable}
                </Typography.Text>
              </Descriptions.Item>
            </Descriptions>
          )}

          <Space size={16}>
            <Form.Item name="quantity" label="Quantity" rules={[{ required: true, message: 'Quantity is required' }]} style={{ width: 120 }}>
              <InputNumber min={0.0001} step={1} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="uomId" label="UOM ID" rules={[{ required: true, message: 'UOM is required' }]} style={{ width: 150 }}>
              <Input placeholder="UOM UUID" />
            </Form.Item>
            <Form.Item name="unitCost" label="Unit Cost" style={{ width: 150 }}>
              <InputNumber min={0} step={0.01} style={{ width: '100%' }} />
            </Form.Item>
          </Space>

          <Form.Item name="issuedFrom" label="Issued From Warehouse ID">
            <Input placeholder="Warehouse UUID (optional)" />
          </Form.Item>

          <Form.Item name="remarks" label="Remarks">
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
};

export default SparePartsPanel;
