import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Button, Card, Col, Row, Space, Statistic, Typography } from 'antd';
import {
  BuildOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  ExclamationCircleOutlined,
  ReloadOutlined,
  ToolOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import apiService from '../../services/api';
import { EmptyState, LoadingState, PageHeader, StatusBadge } from '../../components/shared';
import { usePermission } from '../../hooks/usePermission';

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

function getApiError(error: unknown): string {
  const response = (error as { response?: { data?: { message?: string | string[] } } })?.response;
  const message = response?.data?.message;
  if (Array.isArray(message)) return message[0] || 'Unable to load the maintenance dashboard.';
  return message || 'Unable to load the maintenance dashboard. Please try again.';
}

const MaintenanceDashboard: React.FC = () => {
  const { user } = usePermission();
  const companyId = user?.defaultCompanyId as string | undefined;
  const [data, setData] = useState<MaintenanceDashboardResponse | null>(null);
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
      const response = await apiService.get<MaintenanceDashboardResponse>(
        '/master-data/maintenance/job-cards/dashboard',
        { companyId },
      );
      setData(response);
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
                    {STATUS_ITEMS.map(item => (
                      <div key={item.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                        <StatusBadge status={item.label} />
                        <Typography.Text strong>{data[item.key]}</Typography.Text>
                      </div>
                    ))}
                    <Typography.Text type="secondary">Tracked workflow statuses: {statusTotal}</Typography.Text>
                  </Space>
                )}
              </Card>
            </Col>
            <Col xs={24} lg={10}>
              <Card title="Dashboard Coverage">
                <Typography.Paragraph type="secondary">
                  This view displays the aggregate metrics currently exposed by the Maintenance API.
                </Typography.Paragraph>
                <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
                  Machine-level summaries, recent activity, priority breakdowns, and active job-card rows will be connected when backend dashboard support is exposed.
                </Typography.Paragraph>
              </Card>
            </Col>
          </Row>
        </>
      )}
    </div>
  );
};

export default MaintenanceDashboard;
