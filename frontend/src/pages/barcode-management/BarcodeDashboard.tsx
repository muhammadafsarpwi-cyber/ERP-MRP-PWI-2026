import React from 'react';
import { Row, Col, Card, Statistic, Typography, Spin, Alert } from 'antd';
import {
  BarcodeOutlined,
  DatabaseOutlined,
  TeamOutlined,
  ToolOutlined,
  HomeOutlined,
  UserOutlined,
  BuildOutlined,
  ScanOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { apiService } from '../../services/api';
import { BarcodeStats } from './types';

const { Text } = Typography;

const KPI_CARDS = [
  { key: 'ITEM', label: 'Item Barcodes', icon: DatabaseOutlined, route: '/barcode-management/items', colorToken: 'var(--erp-color-primary, #1890ff)' },
  { key: 'CUSTOMER', label: 'Customer Barcodes', icon: TeamOutlined, route: '/barcode-management/customers', colorToken: 'var(--erp-color-success, #52c41a)' },
  { key: 'MACHINE', label: 'Machine Barcodes', icon: ToolOutlined, route: '/barcode-management/machines', colorToken: 'var(--erp-color-warning, #faad14)' },
  { key: 'WAREHOUSE', label: 'Warehouse Barcodes', icon: HomeOutlined, route: '/barcode-management/warehouses', colorToken: 'var(--erp-color-purple, #722ed1)' },
  { key: 'EMPLOYEE', label: 'Employee Barcodes', icon: UserOutlined, route: '/barcode-management/employees', colorToken: 'var(--erp-color-magenta, #eb2f96)' },
  { key: 'PRODUCTION_ENTRY', label: 'Production Barcodes', icon: BuildOutlined, route: '/barcode-management/production', colorToken: 'var(--erp-color-cyan, #13c2c2)' },
  { key: 'JOB_CARD', label: 'Job Card Barcodes', icon: ToolOutlined, route: '/barcode-management/job-cards', colorToken: 'var(--erp-color-orange, #fa541c)' },
];

const BarcodeDashboard: React.FC = () => {
  const navigate = useNavigate();
  const [stats, setStats] = React.useState<BarcodeStats | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await apiService.get<{ success: boolean; data: BarcodeStats }>('/barcode-management/stats');
      if (res.success) {
        setStats(res.data);
      } else {
        setError('Failed to load barcode statistics');
      }
    } catch (err: any) {
      const msg = err?.response?.data?.message || 'Failed to load barcode statistics';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <Text strong style={{ fontSize: 16 }}>
          <BarcodeOutlined style={{ marginRight: 8 }} />
          Barcode Management Dashboard
        </Text>
        <div>
          <Text type="secondary">Central hub for managing all ERP barcodes</Text>
        </div>
      </div>

      {error && (
        <Alert
          type="error"
          showIcon
          message="Error Loading Statistics"
          description={error}
          style={{ marginBottom: 16 }}
          closable
          onClose={() => setError(null)}
        />
      )}

      <Spin spinning={loading}>
        <Row gutter={[16, 16]}>
          <Col xs={24} sm={12} lg={8}>
            <Card
              hoverable
              onClick={() => navigate('/barcode-management/scan')}
              style={{ borderTop: '3px solid var(--erp-color-primary, #1890ff)' }}
            >
              <Statistic
                title="Scan Barcode"
                value="Scan"
                prefix={<ScanOutlined style={{ color: 'var(--erp-color-primary, #1890ff)' }} />}
                valueStyle={{ color: 'var(--erp-color-primary, #1890ff)', fontSize: 20 }}
              />
              <Text type="secondary" style={{ fontSize: 12 }}>Open central barcode scanner</Text>
            </Card>
          </Col>
          <Col xs={24} sm={12} lg={8}>
            <Card style={{ borderTop: '3px solid var(--erp-color-success, #52c41a)' }}>
              <Statistic
                title="Total Barcodes"
                value={stats?.total ?? 0}
                prefix={<BarcodeOutlined style={{ color: 'var(--erp-color-success, #52c41a)' }} />}
                valueStyle={{ color: 'var(--erp-color-success, #52c41a)' }}
              />
            </Card>
          </Col>
        </Row>

        <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
          {KPI_CARDS.map((kpi) => {
            const Icon = kpi.icon;
            return (
              <Col xs={24} sm={12} lg={8} xl={6} key={kpi.key}>
                <Card
                  hoverable
                  onClick={() => navigate(kpi.route)}
                  style={{ borderTop: `3px solid ${kpi.colorToken}` }}
                >
                  <Statistic
                    title={kpi.label}
                    value={stats?.[kpi.key as keyof BarcodeStats] ?? 0}
                    prefix={<Icon style={{ color: kpi.colorToken }} />}
                    valueStyle={{ color: kpi.colorToken }}
                  />
                </Card>
              </Col>
            );
          })}
        </Row>
      </Spin>
    </div>
  );
};

export default BarcodeDashboard;
