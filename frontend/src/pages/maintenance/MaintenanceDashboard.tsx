import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Button, Card, Col, Progress, Row, Space, Statistic, Table, Tag, Typography } from 'antd';
import {
  BuildOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  ExclamationCircleOutlined,
  ReloadOutlined,
  ToolOutlined,
  WarningOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import apiService from '../../services/api';
import { EmptyState, LoadingState, PageHeader, StatusBadge } from '../../components/shared';
import { usePermission } from '../../hooks/usePermission';
import { label } from './jobCards.types';

interface MaintenanceDashboardResponse {
  total: number;
  open: number;
  assigned: number;
  inProgress: number;
  onHold: number;
  waitingForParts: number;
  completed: number;
  pendingVerification: number;
  approved: number;
  critical: number;
  byMaintenanceType?: Array<{ type: string; count: string }>;
}

interface ChartData {
  typeBreakdown: Array<{ type: string; count: string }>;
  priorityBreakdown: Array<{ priority: string; count: string }>;
  monthlyTrend: Array<{ month: string; count: string; completed: string; breakdowns: string }>;
  statusBreakdown: Array<{ status: string; count: string }>;
  avgDowntimeMinutes: number;
  totalDowntimeMinutes: number;
}

const STATUS_ITEMS: Array<{ key: keyof MaintenanceDashboardResponse; label: string }> = [
  { key: 'open', label: 'OPEN' },
  { key: 'assigned', label: 'ASSIGNED' },
  { key: 'inProgress', label: 'IN_PROGRESS' },
  { key: 'onHold', label: 'ON_HOLD' },
  { key: 'waitingForParts', label: 'WAITING_FOR_PARTS' },
  { key: 'completed', label: 'COMPLETED' },
  { key: 'pendingVerification', label: 'PENDING_VERIFICATION' },
  { key: 'approved', label: 'APPROVED' },
];

const TYPE_COLORS: Record<string, string> = {
  BREAKDOWN: '#ff4d4f',
  PREVENTIVE: '#52c41a',
  CORRECTIVE: '#faad14',
  INSPECTION: '#1677ff',
  EMERGENCY: '#fa541c',
};

const PRIORITY_COLORS: Record<string, string> = {
  CRITICAL: '#ff4d4f',
  HIGH: '#fa8c16',
  MEDIUM: '#1677ff',
  LOW: '#52c41a',
};

function getApiError(error: unknown): string {
  const response = (error as { response?: { data?: { message?: string | string[] } } })?.response;
  const message = response?.data?.message;
  if (Array.isArray(message)) return message[0] || 'Unable to load the maintenance dashboard.';
  return message || 'Unable to load the maintenance dashboard. Please try again.';
}

const formatDuration = (minutes: number): string => {
  if (!minutes || minutes <= 0) return '—';
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
};

const MaintenanceDashboard: React.FC = () => {
  const { user } = usePermission();
  const companyId = user?.defaultCompanyId as string | undefined;
  const [data, setData] = useState<MaintenanceDashboardResponse | null>(null);
  const [chartData, setChartData] = useState<ChartData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadDashboard = useCallback(async () => {
    if (!companyId) {
      setError('No default company is assigned to your account. Select a company context before opening Maintenance.');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const [dashboardRes, chartRes] = await Promise.all([
        apiService.get<MaintenanceDashboardResponse>('/master-data/maintenance/job-cards/dashboard', { companyId }),
        apiService.get<ChartData>('/master-data/maintenance/job-cards/chart-data', { companyId }),
      ]);
      setData(dashboardRes);
      setChartData(chartRes);
    } catch (requestError) {
      setError(getApiError(requestError));
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => { void loadDashboard(); }, [loadDashboard]);

  const statusTotal = useMemo(
    () => STATUS_ITEMS.reduce((sum, item) => sum + Number(data?.[item.key] ?? 0), 0),
    [data],
  );

  return (
    <div>
      <PageHeader
        icon={<ToolOutlined />}
        title="Maintenance Dashboard"
        subtitle="Monitor maintenance operations, job cards, machines, technicians and pending actions."
        gradient="linear-gradient(135deg, #1f6f78 0%, #2e8b8b 100%)"
        showBreadcrumbs
        extra={<Button icon={<ReloadOutlined />} onClick={() => void loadDashboard()} loading={loading}>Refresh</Button>}
      />

      {loading && <LoadingState tip="Loading maintenance dashboard…" />}

      {!loading && error && (
        <Alert
          type="error"
          showIcon
          message="Maintenance dashboard unavailable"
          description={error}
          action={<Button size="small" onClick={() => void loadDashboard()}>Retry</Button>}
          style={{ marginBottom: 16 }}
        />
      )}

      {!loading && !error && data && (
        <>
          <Row gutter={[16, 16]}>
            <Col xs={24} sm={12} lg={6}><Card><Statistic title="Total Job Cards" value={data.total} prefix={<BuildOutlined />} /></Card></Col>
            <Col xs={24} sm={12} lg={6}><Card><Statistic title="Open" value={data.open} prefix={<ExclamationCircleOutlined />} valueStyle={{ color: '#1677ff' }} /></Card></Col>
            <Col xs={24} sm={12} lg={6}><Card><Statistic title="In Progress" value={data.inProgress} prefix={<ClockCircleOutlined />} valueStyle={{ color: '#13c2c2' }} /></Card></Col>
            <Col xs={24} sm={12} lg={6}><Card><Statistic title="Waiting for Parts" value={data.waitingForParts} prefix={<WarningOutlined />} valueStyle={{ color: '#fa8c16' }} /></Card></Col>
            <Col xs={24} sm={12} lg={6}><Card><Statistic title="Completed" value={data.completed} prefix={<CheckCircleOutlined />} valueStyle={{ color: '#52c41a' }} /></Card></Col>
            <Col xs={24} sm={12} lg={6}><Card><Statistic title="Pending Verification" value={data.pendingVerification} prefix={<ClockCircleOutlined />} valueStyle={{ color: '#722ed1' }} /></Card></Col>
            <Col xs={24} sm={12} lg={6}><Card><Statistic title="Approved" value={data.approved} prefix={<CheckCircleOutlined />} valueStyle={{ color: '#389e0d' }} /></Card></Col>
            <Col xs={24} sm={12} lg={6}><Card><Statistic title="Critical" value={data.critical} prefix={<WarningOutlined />} valueStyle={{ color: '#cf1322' }} /></Card></Col>
          </Row>

          <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
            <Col xs={24} lg={14}>
              <Card title="Job Card Status Overview">
                {data.total === 0 ? (
                  <EmptyState title="No maintenance job cards yet" description="Job card status metrics will appear here once work is raised." />
                ) : (
                  <Space direction="vertical" size="middle" style={{ width: '100%' }}>
                    {STATUS_ITEMS.map(item => {
                      const value = Number(data[item.key] ?? 0);
                      const percent = statusTotal > 0 ? Math.round((value / statusTotal) * 100) : 0;
                      return (
                        <div key={item.key} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                          <div style={{ width: 160, flexShrink: 0 }}><StatusBadge status={item.label} /></div>
                          <div style={{ flex: 1 }}>
                            <Progress
                              percent={percent}
                              size="small"
                              strokeColor={
                                item.key === 'open' ? '#1677ff' :
                                item.key === 'inProgress' ? '#13c2c2' :
                                item.key === 'completed' ? '#52c41a' :
                                item.key === 'approved' ? '#389e0d' :
                                item.key === 'onHold' ? '#faad14' :
                                item.key === 'waitingForParts' ? '#fa8c16' :
                                item.key === 'pendingVerification' ? '#722ed1' :
                                '#8c8c8c'
                              }
                              format={() => `${value} (${percent}%)`}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </Space>
                )}
              </Card>
            </Col>
            <Col xs={24} lg={10}>
              <Card title="Downtime Overview">
                {chartData ? (
                  <Space direction="vertical" size="middle" style={{ width: '100%' }}>
                    <Statistic
                      title="Average Downtime per Job"
                      value={formatDuration(chartData.avgDowntimeMinutes)}
                      prefix={<ClockCircleOutlined />}
                    />
                    <Statistic
                      title="Total Downtime"
                      value={formatDuration(chartData.totalDowntimeMinutes)}
                      prefix={<WarningOutlined />}
                      valueStyle={{ color: '#fa541c' }}
                    />
                  </Space>
                ) : (
                  <Typography.Text type="secondary">Loading chart data...</Typography.Text>
                )}
              </Card>
            </Col>
          </Row>

          {chartData && (
            <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
              <Col xs={24} lg={8}>
                <Card title="By Maintenance Type" size="small">
                  <Space direction="vertical" size="small" style={{ width: '100%' }}>
                    {chartData.typeBreakdown.map(item => {
                      const count = parseInt(item.count, 10);
                      const percent = data.total > 0 ? Math.round((count / data.total) * 100) : 0;
                      return (
                        <div key={item.type} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <Tag color={TYPE_COLORS[item.type] || 'default'} style={{ width: 100, textAlign: 'center' }}>{label(item.type)}</Tag>
                          <Progress percent={percent} size="small" style={{ flex: 1 }} format={() => `${count} (${percent}%)`} strokeColor={TYPE_COLORS[item.type] || '#8c8c8c'} />
                        </div>
                      );
                    })}
                  </Space>
                </Card>
              </Col>
              <Col xs={24} lg={8}>
                <Card title="By Priority" size="small">
                  <Space direction="vertical" size="small" style={{ width: '100%' }}>
                    {chartData.priorityBreakdown.map(item => {
                      const count = parseInt(item.count, 10);
                      const total = chartData.priorityBreakdown.reduce((s, i) => s + parseInt(i.count, 10), 0);
                      const percent = total > 0 ? Math.round((count / total) * 100) : 0;
                      return (
                        <div key={item.priority} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <Tag color={PRIORITY_COLORS[item.priority] || 'default'} style={{ width: 100, textAlign: 'center' }}>{label(item.priority)}</Tag>
                          <Progress percent={percent} size="small" style={{ flex: 1 }} format={() => `${count} (${percent}%)`} strokeColor={PRIORITY_COLORS[item.priority] || '#8c8c8c'} />
                        </div>
                      );
                    })}
                  </Space>
                </Card>
              </Col>
              <Col xs={24} lg={8}>
                <Card title="Monthly Trend (12 Months)" size="small">
                  {chartData.monthlyTrend.length === 0 ? (
                    <Typography.Text type="secondary">No data in the last 12 months</Typography.Text>
                  ) : (
                    <Table
                      rowKey="month"
                      size="small"
                      pagination={false}
                      dataSource={chartData.monthlyTrend}
                      columns={[
                        { title: 'Month', dataIndex: 'month', width: 90 },
                        { title: 'Total', dataIndex: 'count', render: (v: string) => <Tag>{v}</Tag> },
                        { title: 'Approved', dataIndex: 'completed', render: (v: string) => <Tag color="green">{v}</Tag> },
                        { title: 'Breakdowns', dataIndex: 'breakdowns', render: (v: string) => <Tag color="red">{v}</Tag> },
                      ]}
                    />
                  )}
                </Card>
              </Col>
            </Row>
          )}
        </>
      )}
    </div>
  );
};

export default MaintenanceDashboard;
