import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Card, Space, Table, Tag, Typography } from 'antd';
import { BarChartOutlined } from '@ant-design/icons';
import apiService from '../../services/api';
import { EmptyState, LoadingState, PageHeader } from '../../components/shared';
import { errorText } from './jobCards.types';

const JOB_CARDS_BASE = '/master-data/maintenance/job-cards';
type Any = Record<string, any>;

export const MaintenanceReports: React.FC = () => {
  const [data, setData] = useState<Any>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const res = await apiService.get<Any>(JOB_CARDS_BASE + '/reports');
      setData(res?.data || res || {});
    } catch (e) { setError(errorText(e)); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const topProblemColumns = [
    { title: 'Machine', render: (_: Any, r: Any) => <Space><Typography.Text strong>{r.machineCode || '—'}</Typography.Text><Typography.Text type="secondary">{r.machineName || ''}</Typography.Text></Space> },
    { title: 'Total Jobs', dataIndex: 'jobCount', sorter: (a: Any, b: Any) => Number(a.jobCount) - Number(b.jobCount), defaultSortOrder: 'descend' as const },
    { title: 'Approved', dataIndex: 'approvedCount', render: (v: string) => Number(v) || 0 },
    { title: 'Total Downtime (min)', dataIndex: 'totalDowntime', render: (v: string) => <Typography.Text type={Number(v) > 480 ? 'danger' : undefined}>{Number(v) || 0}</Typography.Text> },
  ];

  const downtimeByTypeColumns = [
    { title: 'Maintenance Type', dataIndex: 'type', render: (v: string) => <Tag color={v === 'BREAKDOWN' ? 'red' : v === 'PREVENTIVE' ? 'green' : 'blue'}>{v}</Tag> },
    { title: 'Count', dataIndex: 'count' },
    { title: 'Avg Downtime (min)', dataIndex: 'avgDowntime', render: (v: string) => Math.round(Number(v) || 0) },
    { title: 'Total Downtime (min)', dataIndex: 'totalDowntime', render: (v: string) => Number(v) || 0 },
  ];

  const mtbfColumns = [
    { title: 'Machine', render: (_: Any, r: Any) => <Typography.Text strong>{r.machineName || '—'}</Typography.Text> },
    { title: 'Total Jobs', dataIndex: 'totalJobs' },
    { title: 'MTBF (hours)', render: (_: Any, r: Any) => {
      const count = Number(r.totalJobs);
      return count > 1 ? 'Calculating...' : '—';
    }},
  ];

  if (loading) return <><PageHeader icon={<BarChartOutlined />} title="Maintenance Reports" gradient="linear-gradient(135deg, #1f6f78 0%, #2e8b8b 100%)" showBreadcrumbs /><LoadingState /></>;
  if (error) return <><PageHeader icon={<BarChartOutlined />} title="Maintenance Reports" gradient="linear-gradient(135deg, #1f6f78 0%, #2e8b8b 100%)" showBreadcrumbs /><Alert type="error" showIcon message="Unable to load reports" description={error} /></>;

  const hasData = (data.topProblemMachines?.length > 0) || (data.downtimeByType?.length > 0);

  return (
    <div>
      <PageHeader icon={<BarChartOutlined />} title="Maintenance Reports" subtitle="Downtime analysis, MTBF, and top problem machines" gradient="linear-gradient(135deg, #1f6f78 0%, #2e8b8b 100%)" showBreadcrumbs />

      {!hasData && !loading ? (
        <EmptyState title="No report data available" description="Create and complete job cards to generate maintenance reports." />
      ) : (
        <Space direction="vertical" size="large" style={{ width: '100%' }}>
          <Card title="Top Problem Machines" size="small">
            <Table rowKey="machineId" columns={topProblemColumns} dataSource={data.topProblemMachines || []} pagination={false} size="small" />
          </Card>

          <Card title="Downtime by Maintenance Type" size="small">
            <Table rowKey="type" columns={downtimeByTypeColumns} dataSource={data.downtimeByType || []} pagination={false} size="small" />
          </Card>

          <Card title="MTBF by Machine" size="small">
            <Table rowKey="machineId" columns={mtbfColumns} dataSource={data.mtbfByMachine || []} pagination={false} size="small" />
          </Card>
        </Space>
      )}
    </div>
  );
};

export default MaintenanceReports;
