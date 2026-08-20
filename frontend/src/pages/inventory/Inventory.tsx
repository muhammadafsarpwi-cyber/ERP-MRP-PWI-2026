import React, { useState, useEffect } from 'react';
import { Typography, Card, Row, Col, Statistic, Table, Tag } from 'antd';
import { InboxOutlined, AlertOutlined, SwapOutlined, BarChartOutlined } from '@ant-design/icons';
import apiService from '../../services/api';
import { formatDecimal } from '../../utils/numberFormat';

interface StockBalance {
  id: string;
  item?: { id: string; name: string; itemCode: string };
  warehouse?: { id: string; name: string };
  onHand: number;
  reserved: number;
  available: number;
  uom?: { id: string; code: string; name: string };
}

const Inventory: React.FC = () => {
  const [summary, setSummary] = useState<StockBalance[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchSummary();
  }, []);

  const fetchSummary = async () => {
    setLoading(true);
    try {
      const res = await apiService.get<{ data: StockBalance[]; total: number }>('/inventory/balances', { limit: 10 });
      setSummary(res.data);
    } catch (error) {
      // silently fail
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <Typography.Title level={2}>Inventory Management</Typography.Title>
      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={6}>
          <Card>
            <Statistic title="Total Balances" value={summary.length} prefix={<InboxOutlined />} />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic title="Stock Alerts" value={0} prefix={<AlertOutlined />} valueStyle={{ color: '#cf1322' }} />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic title="Pending Transfers" value={0} prefix={<SwapOutlined />} />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic title="Reports" value={0} prefix={<BarChartOutlined />} />
          </Card>
        </Col>
      </Row>
      <Card title="Current Stock Balances">
        <Table
          loading={loading}
          dataSource={summary}
          rowKey="id"
          pagination={false}
          columns={[
            { title: 'Item', dataIndex: ['item', 'name'], key: 'itemName' },
            { title: 'Warehouse', dataIndex: ['warehouse', 'name'], key: 'warehouseName' },
            { title: 'On Hand', dataIndex: 'onHand', key: 'onHand', render: (v: unknown) => formatDecimal(v) },
            { title: 'Reserved', dataIndex: 'reserved', key: 'reserved', render: (v: unknown) => formatDecimal(v) },
            { title: 'Available', dataIndex: 'available', key: 'available', render: (v: unknown) => formatDecimal(v) },
            { title: 'UOM', dataIndex: ['uom', 'code'], key: 'uomCode' },
          ]}
        />
      </Card>
    </div>
  );
};

export default Inventory;
