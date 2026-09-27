import React, { useState, useEffect } from 'react';
import { Row, Col, Typography, Spin, Alert, Button, Space, message, Tooltip, Tag, theme } from 'antd';
import {
  BarcodeOutlined,
  DatabaseOutlined,
  TeamOutlined,
  ToolOutlined,
  HomeOutlined,
  UserOutlined,
  BuildOutlined,
  ScanOutlined,
  ReloadOutlined,
  SyncOutlined,
  InfoCircleOutlined,
  ArrowRightOutlined,
  QrcodeOutlined,
  CheckCircleOutlined,
  CarOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { apiService } from '../../services/api';
import { useThemeStore } from '../../theme/themeStore';
import { BarcodeStats } from './types';

const { Text, Title } = Typography;

interface KpiConfig {
  key: string;
  label: string;
  subLabel?: string;
  icon: React.ComponentType<any>;
  route: string;
  accentColor: string;
  bgColor: string;
  badgeText?: string;
}

const KPI_CARDS: KpiConfig[] = [
  {
    key: 'ITEM',
    label: 'ITEM BARCODES',
    icon: DatabaseOutlined,
    route: '/barcode-management/items',
    accentColor: '#1890ff',
    bgColor: '#e6f4ff',
    badgeText: 'Items Master',
  },
  {
    key: 'CUSTOMER',
    label: 'CUSTOMER BARCODES',
    icon: TeamOutlined,
    route: '/barcode-management/customers',
    accentColor: '#52c41a',
    bgColor: '#f6ffed',
    badgeText: 'Client Directory',
  },
  {
    key: 'MACHINE',
    label: 'MACHINE BARCODES',
    icon: ToolOutlined,
    route: '/barcode-management/machines',
    accentColor: '#fa8c16',
    bgColor: '#fff7e6',
    badgeText: 'Plant & Equipment',
  },
  {
    key: 'WAREHOUSE',
    label: 'WAREHOUSE BARCODES',
    icon: HomeOutlined,
    route: '/barcode-management/warehouses',
    accentColor: '#722ed1',
    bgColor: '#f9f0ff',
    badgeText: 'Storage Locations',
  },
  {
    key: 'EMPLOYEE',
    label: 'EMPLOYEE BARCODES',
    icon: UserOutlined,
    route: '/barcode-management/employees',
    accentColor: '#eb2f96',
    bgColor: '#fff0f6',
    badgeText: 'Staff & Operators',
  },
  {
    key: 'PRODUCTION_ENTRY',
    label: 'PRODUCTION BARCODES',
    icon: BuildOutlined,
    route: '/barcode-management/production',
    accentColor: '#13c2c2',
    bgColor: '#e6fffb',
    badgeText: 'Daily Production',
  },
  {
    key: 'JOB_CARD',
    label: 'JOB CARD BARCODES',
    icon: ToolOutlined,
    route: '/barcode-management/job-cards',
    accentColor: '#fa541c',
    bgColor: '#fff2e8',
    badgeText: 'Maintenance Work',
  },
  {
    key: 'GATE_PASS',
    label: 'GATE PASS BARCODES',
    icon: CarOutlined,
    route: '/barcode-management/gate-passes',
    accentColor: '#b45309',
    bgColor: '#fef3c7',
    badgeText: 'Security Permits',
  },
];

const BarcodeDashboard: React.FC = () => {
  const navigate = useNavigate();
  const { token } = theme.useToken();
  const draft = useThemeStore((state) => state.draft);
  const isDark = draft.mode === 'dark';

  const [stats, setStats] = useState<BarcodeStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await apiService.get<{ success: boolean; data: BarcodeStats }>('/barcode-management/stats');
      if (res && (res.success || res.data)) {
        setStats(res.data || (res as any));
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

  const handleSyncBackfill = async () => {
    try {
      setSyncing(true);
      const res = await apiService.post<{ success: boolean; data: any }>('/barcode-management/backfill');
      if (res?.success) {
        message.success(
          `Barcode Sync Complete! Created: ${res.data?.created ?? 0}, Existing: ${res.data?.alreadyExisting ?? 0}`,
          4
        );
      } else {
        message.info('Barcode sync process triggered successfully.');
      }
      await loadStats();
    } catch (err: any) {
      console.error('Backfill error:', err);
      message.error(err?.response?.data?.message || 'Failed to sync barcodes');
    } finally {
      setSyncing(false);
    }
  };

  const cardBg = isDark ? 'var(--theme-surface, #181c33)' : '#ffffff';
  const labelColor = isDark ? 'rgba(255, 255, 255, 0.65)' : '#64748b';
  const numberColor = isDark ? '#ffffff' : token.colorTextHeading;
  const cardBorder = `1px solid ${token.colorBorderSecondary}`;
  const cardShadow = isDark ? '0 4px 14px rgba(0, 0, 0, 0.35)' : '0 1px 3px rgba(0, 0, 0, 0.04)';

  return (
    <div style={{ maxWidth: 1400, margin: '0 auto', paddingBottom: 24 }}>
      {/* Top Header Banner */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 12,
          marginBottom: 20,
          background: cardBg,
          padding: '16px 20px',
          borderRadius: 10,
          border: cardBorder,
          boxShadow: cardShadow,
        }}
      >
        <div>
          <Title level={4} style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8, color: numberColor }}>
            <BarcodeOutlined style={{ color: token.colorPrimary }} />
            <span style={{ color: numberColor }}>Barcode & QR Code Management</span>
            <Tag color="purple" style={{ fontSize: 11, fontWeight: 600 }}>ENTERPRISE 2027</Tag>
          </Title>
          <Text style={{ fontSize: 13, color: isDark ? 'rgba(255, 255, 255, 0.6)' : token.colorTextSecondary }}>
            Unified QR Code & Code-128 Barcode generation, real-time scanning, and full machine lifecycle tracking
          </Text>
        </div>

        <Space wrap>
          <Button
            type="primary"
            icon={<ScanOutlined />}
            size="large"
            style={{ fontWeight: 600 }}
            onClick={() => navigate('/barcode-management/scan')}
          >
            Scan Barcode / QR
          </Button>

          <Button
            icon={<SyncOutlined spin={syncing} />}
            loading={syncing}
            size="large"
            onClick={handleSyncBackfill}
            style={{ fontWeight: 600 }}
          >
            Sync / Backfill Barcodes
          </Button>

          <Tooltip title="Refresh Stats">
            <Button
              icon={<ReloadOutlined />}
              size="large"
              onClick={loadStats}
              loading={loading}
            />
          </Tooltip>
        </Space>
      </div>

      {error && (
        <Alert
          type="error"
          showIcon
          message="Statistics Notice"
          description={error}
          style={{ marginBottom: 16 }}
          closable
          onClose={() => setError(null)}
        />
      )}

      <Spin spinning={loading}>
        {/* Top 2 Featured Highlight Cards */}
        <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
          {/* Card 1: Camera Scanner Launcher */}
          <Col xs={24} sm={12}>
            <div
              onClick={() => navigate('/barcode-management/scan')}
              style={{
                background: cardBg,
                border: cardBorder,
                borderTop: `3px solid ${token.colorPrimary}`,
                borderRadius: 8,
                padding: '16px 18px',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                boxShadow: cardShadow,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow = `0 6px 16px ${token.colorPrimary}33`;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'none';
                e.currentTarget.style.boxShadow = cardShadow;
              }}
            >
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: labelColor, letterSpacing: '0.05em' }}>
                  CENTRAL SCANNER
                </div>
                <div style={{ fontSize: 26, fontWeight: 700, color: token.colorPrimary, margin: '4px 0' }}>
                  Live Camera & QR
                </div>
                <div style={{ fontSize: 12, color: token.colorPrimary, display: 'flex', alignItems: 'center', gap: 4, fontWeight: 600 }}>
                  <InfoCircleOutlined /> Scan item, machine or job card <ArrowRightOutlined />
                </div>
              </div>
              <div
                style={{
                  width: 52,
                  height: 52,
                  borderRadius: '50%',
                  background: isDark ? 'rgba(79, 70, 229, 0.22)' : '#eef2ff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 26,
                  color: isDark ? '#a5b4fc' : '#4f46e5',
                }}
              >
                <ScanOutlined />
              </div>
            </div>
          </Col>

          {/* Card 2: Total Active Barcodes */}
          <Col xs={24} sm={12}>
            <div
              style={{
                background: cardBg,
                border: cardBorder,
                borderTop: '3px solid #16a34a',
                borderRadius: 8,
                padding: '16px 18px',
                transition: 'all 0.2s ease',
                boxShadow: cardShadow,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: labelColor, letterSpacing: '0.05em' }}>
                  TOTAL ACTIVE BARCODES & QR
                </div>
                <div style={{ fontSize: 28, fontWeight: 700, color: isDark ? '#4ade80' : '#16a34a', margin: '4px 0' }}>
                  {(stats?.total ?? 0).toLocaleString()}
                </div>
                <div style={{ fontSize: 12, color: isDark ? '#4ade80' : '#16a34a', display: 'flex', alignItems: 'center', gap: 4, fontWeight: 500 }}>
                  <CheckCircleOutlined /> 100% Barcode & QR Active across ERP
                </div>
              </div>
              <div
                style={{
                  width: 52,
                  height: 52,
                  borderRadius: '50%',
                  background: isDark ? 'rgba(22, 163, 74, 0.22)' : '#f0fdf4',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 26,
                  color: isDark ? '#4ade80' : '#16a34a',
                }}
              >
                <QrcodeOutlined />
              </div>
            </div>
          </Col>
        </Row>

        {/* HR Dashboard-style KPI Cards */}
        <Row gutter={[16, 16]}>
          {KPI_CARDS.map((kpi) => {
            const Icon = kpi.icon;
            const count = stats?.[kpi.key as keyof BarcodeStats] ?? 0;

            return (
              <Col xs={24} sm={12} md={8} lg={6} key={kpi.key}>
                <div
                  onClick={() => navigate(kpi.route)}
                  style={{
                    background: cardBg,
                    border: cardBorder,
                    borderTop: `3px solid ${kpi.accentColor}`,
                    borderRadius: 8,
                    padding: '14px 16px',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    boxShadow: cardShadow,
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    minHeight: 124,
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'translateY(-2px)';
                    e.currentTarget.style.boxShadow = `0 6px 14px ${kpi.accentColor}33`;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'none';
                    e.currentTarget.style.boxShadow = cardShadow;
                  }}
                >
                  {/* Upper Row: Title & Circular Badge */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        color: labelColor,
                        letterSpacing: '0.04em',
                        textTransform: 'uppercase',
                      }}
                    >
                      {kpi.label}
                    </div>
                    <div
                      style={{
                        width: 34,
                        height: 34,
                        borderRadius: '50%',
                        background: isDark ? `${kpi.accentColor}25` : kpi.bgColor,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 16,
                        color: kpi.accentColor,
                      }}
                    >
                      <Icon />
                    </div>
                  </div>

                  {/* Middle: Big Metric Number */}
                  <div
                    style={{
                      fontSize: 30,
                      fontWeight: 700,
                      color: numberColor,
                      lineHeight: 1.1,
                      margin: '6px 0',
                    }}
                  >
                    {count.toLocaleString()}
                  </div>

                  {/* Bottom: "ⓘ More info" Link in exact HR Dashboard style */}
                  <div
                    style={{
                      fontSize: 12,
                      color: kpi.accentColor,
                      fontWeight: 500,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                      paddingTop: 4,
                      borderTop: `1px dashed ${token.colorBorderSecondary}`,
                    }}
                  >
                    <InfoCircleOutlined style={{ fontSize: 13 }} />
                    <span>More info</span>
                    <ArrowRightOutlined style={{ fontSize: 10, marginLeft: 'auto' }} />
                  </div>
                </div>
              </Col>
            );
          })}
        </Row>
      </Spin>
    </div>
  );
};

export default BarcodeDashboard;
