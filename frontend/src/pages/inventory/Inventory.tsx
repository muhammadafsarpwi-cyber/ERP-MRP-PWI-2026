import React, { useState, useEffect, useCallback } from 'react';
import { Typography, Card, Row, Col, Statistic, Alert, Button, Empty } from 'antd';
import { InboxOutlined, AlertOutlined, SwapOutlined, BarChartOutlined, ReloadOutlined } from '@ant-design/icons';
import apiService from '../../services/api';
import { formatNumber } from '../../utils/numberFormat';
import { ERPTable } from '../../components/shared';

interface StockBalance {
  id: string;
  item?: { id: string; name: string; itemCode: string; uom?: { code: string } };
  warehouse?: { id: string; name: string };
  onHand: number;
  reserved: number;
  available: number;
  uom?: { id: string; code: string; name: string };
  uomCode?: string;
}

const Inventory: React.FC = () => {
  const [summary, setSummary] = useState<StockBalance[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchSummary = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiService.get<{ data: StockBalance[]; total: number }>('/inventory/balances', { limit: 20 });
      const records = Array.isArray(res?.data) ? res.data : (Array.isArray(res) ? res : []);
      setSummary(records);
    } catch (err: any) {
      const msg = err?.response?.data?.message || err?.message || 'Failed to fetch inventory balances';
      setError(Array.isArray(msg) ? msg[0] : String(msg));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSummary();
  }, [fetchSummary]);

  const stockAlerts = summary.filter((s) => Number(s.available || 0) <= 0).length;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <Typography.Title level={2} style={{ margin: 0 }}>Inventory Management</Typography.Title>
          <span style={{ fontSize: 13, color: 'var(--theme-text-muted)' }}>
            Overview of stock balances, low inventory alerts, and warehouse levels
          </span>
        </div>
        <Button icon={<ReloadOutlined />} onClick={fetchSummary} loading={loading}>
          Refresh
        </Button>
      </div>

      {error && (
        <Alert
          type="error"
          showIcon
          message="Failed to Load Inventory"
          description={error}
          action={
            <Button size="small" danger onClick={fetchSummary}>
              Retry
            </Button>
          }
          style={{ marginBottom: 24 }}
        />
      )}

      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={6}>
          <Card>
            <Statistic title="Total Balances" value={summary.length} prefix={<InboxOutlined />} />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="Stock Alerts"
              value={stockAlerts}
              prefix={<AlertOutlined />}
              valueStyle={{ color: stockAlerts > 0 ? 'var(--theme-danger)' : undefined }}
            />
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

      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h3 style={{ fontSize: 16, fontWeight: 600, margin: 0, color: 'var(--theme-text)' }}>Current Stock Balances</h3>
          <span style={{ fontSize: 12, color: 'var(--theme-text-muted)' }}>Real-time on-hand, reserved, and available quantities by warehouse</span>
        </div>
        <Button size="small" icon={<ReloadOutlined />} onClick={fetchSummary} loading={loading}>
          Reload
        </Button>
      </div>

      <ERPTable
        loading={loading}
        dataSource={summary}
        rowKey="id"
        pagination={false}
        locale={{
          emptyText: (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description={error ? 'Unable to load data' : 'No inventory balances found in database'}
            />
          ),
        }}
        columns={[
          {
            title: 'Item',
            key: 'itemName',
            render: (_, r) => (
              <div>
                <span style={{ fontWeight: 600, color: 'var(--theme-text)' }}>
                  {r.item?.itemCode || (r as any).itemCode || '—'}
                </span>
                {(r.item?.name || (r as any).itemName) && (
                  <span style={{ color: 'var(--theme-text-muted)', fontSize: 12, marginLeft: 8 }}>
                    {r.item?.name || (r as any).itemName}
                  </span>
                )}
              </div>
            ),
          },
          {
            title: 'Warehouse',
            key: 'warehouseName',
            render: (_, r) => <span>{r.warehouse?.name || (r as any).warehouseName || '—'}</span>,
          },
          {
            title: 'On Hand',
            dataIndex: 'onHand',
            key: 'onHand',
            align: 'right' as const,
            render: (v: unknown) => (
              <span style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                {formatNumber(v, 4)}
              </span>
            ),
          },
          {
            title: 'Reserved',
            dataIndex: 'reserved',
            key: 'reserved',
            align: 'right' as const,
            render: (v: unknown) => (
              <span style={{ fontVariantNumeric: 'tabular-nums', color: Number(v) > 0 ? 'var(--theme-warning)' : undefined }}>
                {formatNumber(v, 4)}
              </span>
            ),
          },
          {
            title: 'Available',
            dataIndex: 'available',
            key: 'available',
            align: 'right' as const,
            render: (v: unknown) => {
              const num = Number(v || 0);
              return (
                <span
                  style={{
                    fontWeight: 600,
                    fontVariantNumeric: 'tabular-nums',
                    color: num <= 0 ? 'var(--theme-danger)' : 'var(--theme-success)',
                  }}
                >
                  {formatNumber(v, 4)}
                </span>
              );
            },
          },
          {
            title: 'UOM',
            key: 'uomCode',
            width: 80,
            render: (_, r) => (
              <span style={{ color: 'var(--theme-text-muted)', fontSize: 12 }}>
                {r.uom?.code || r.uomCode || r.item?.uom?.code || '—'}
              </span>
            ),
          },
        ]}
      />
    </div>
  );
};

export default Inventory;
