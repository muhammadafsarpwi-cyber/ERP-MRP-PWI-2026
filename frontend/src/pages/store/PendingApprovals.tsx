import React, { useState, useEffect, useCallback } from 'react';
import { Card, Table, Button, Space, Tag, App, Popconfirm, Tabs, Badge } from 'antd';
import { CheckOutlined, CloseOutlined, ClockCircleOutlined, EyeOutlined, ReloadOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import apiService from '../../services/api';
import { usePermission } from '../../hooks/usePermission';
import PageHeader from '../../components/shared/PageHeader';
import RequestDetailDrawer from './components/RequestDetailDrawer';
import './storeResponsive.css';

interface MaterialRequest {
  id: string;
  requestNumber: string;
  requestDate: string;
  requiredDate: string;
  storeId: string;
  departmentId: string;
  purpose: string;
  status: string;
  gmApprovedAt?: string | null;
  createdAt: string;
}

const PendingApprovals: React.FC = () => {
  const { message } = App.useApp();
  const { can } = usePermission();
  const canApprove = can('store.request.approve');
  const canGmApprove = can('store.request.gm_approve');
  const canReject = can('store.request.reject');

  const [activeTab, setActiveTab] = useState<'manager' | 'gm'>('manager');
  const [managerQueue, setManagerQueue] = useState<MaterialRequest[]>([]);
  const [gmQueue, setGmQueue] = useState<MaterialRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);

  const extractList = (res: any): MaterialRequest[] => {
    if (Array.isArray(res)) return res;
    if (Array.isArray(res?.data?.data)) return res.data.data;
    if (Array.isArray(res?.data)) return res.data;
    return [];
  };

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [subRes, appRes] = await Promise.all([
        apiService.get<any>('/store/material-requests', { status: 'SUBMITTED', limit: 200 }),
        apiService.get<any>('/store/material-requests', { status: 'APPROVED', limit: 200 }),
      ]);
      setManagerQueue(extractList(subRes));
      setGmQueue(extractList(appRes).filter((r) => !r.gmApprovedAt));
    } catch {
      message.error('Failed to load pending approvals');
    } finally {
      setLoading(false);
    }
  }, [message]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleManagerApprove = async (id: string) => {
    try {
      await apiService.post(`/store/material-requests/${id}/approve`);
      message.success('Manager approval recorded');
      fetchData();
    } catch (err: any) {
      message.error(err?.response?.data?.message || 'Failed to approve request');
    }
  };

  const handleGmApprove = async (id: string) => {
    try {
      await apiService.post(`/store/material-requests/${id}/gm-approve`);
      message.success('GM approval recorded');
      fetchData();
    } catch (err: any) {
      message.error(err?.response?.data?.message || 'Failed to record GM approval');
    }
  };

  const handleReject = async (id: string) => {
    try {
      await apiService.post(`/store/material-requests/${id}/reject`);
      message.success('Request rejected');
      fetchData();
    } catch (err: any) {
      message.error(err?.response?.data?.message || 'Failed to reject request');
    }
  };

  const buildColumns = (mode: 'manager' | 'gm'): ColumnsType<MaterialRequest> => [
    {
      title: 'Request #',
      dataIndex: 'requestNumber',
      key: 'requestNumber',
      width: 150,
      render: (v: string) => <span style={{ fontWeight: 700, fontFamily: 'monospace' }}>{v}</span>,
    },
    {
      title: 'Request Date',
      dataIndex: 'requestDate',
      key: 'requestDate',
      width: 120,
      render: (d: string) => (d ? dayjs(d).format('DD/MM/YYYY') : '—'),
    },
    {
      title: 'Required Date',
      dataIndex: 'requiredDate',
      key: 'requiredDate',
      width: 120,
      render: (d: string) => (d ? dayjs(d).format('DD/MM/YYYY') : '—'),
    },
    { title: 'Purpose', dataIndex: 'purpose', key: 'purpose', width: 260, ellipsis: true },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 140,
      render: (v: string) => (
        <Tag color={mode === 'gm' ? 'cyan' : 'processing'}>
          {mode === 'gm' ? 'AWAITING GM' : v}
        </Tag>
      ),
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 240,
      render: (_: any, record: MaterialRequest) => (
        <Space size="small" wrap>
          <Button
            size="small"
            icon={<EyeOutlined />}
            onClick={() => {
              setSelectedRequestId(record.id);
              setDrawerOpen(true);
            }}
          >
            Inspect
          </Button>
          {mode === 'manager' && canApprove && (
            <Popconfirm title="Approve this request (Manager)?" onConfirm={() => handleManagerApprove(record.id)}>
              <Button type="primary" size="small" icon={<CheckOutlined />}>Approve</Button>
            </Popconfirm>
          )}
          {mode === 'gm' && canGmApprove && (
            <Popconfirm title="Grant GM approval for this request?" onConfirm={() => handleGmApprove(record.id)}>
              <Button type="primary" size="small" icon={<CheckOutlined />}>GM Approve</Button>
            </Popconfirm>
          )}
          {mode === 'manager' && canReject && (
            <Popconfirm title="Reject this request?" onConfirm={() => handleReject(record.id)}>
              <Button danger size="small" icon={<CloseOutlined />}>Reject</Button>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        icon={<ClockCircleOutlined />}
        title="Pending Approvals"
        extra={
          <Button icon={<ReloadOutlined />} onClick={fetchData} loading={loading}>
            Refresh
          </Button>
        }
      />
      <div style={{ padding: '0 16px' }}>
        <Card>
          <Tabs
            activeKey={activeTab}
            onChange={(k) => setActiveTab(k as 'manager' | 'gm')}
            items={[
              {
                key: 'manager',
                label: (
                  <Space size={6}>
                    <span>Manager Approvals</span>
                    <Badge count={managerQueue.length} showZero color="#f59e0b" />
                  </Space>
                ),
                children: (
                  <Table
                    columns={buildColumns('manager')}
                    dataSource={managerQueue}
                    rowKey="id"
                    loading={loading}
                    pagination={{ pageSize: 15 }}
                    scroll={{ x: 'max-content' }}
                    size="middle"
                  />
                ),
              },
              {
                key: 'gm',
                label: (
                  <Space size={6}>
                    <span>GM Approvals</span>
                    <Badge count={gmQueue.length} showZero color="#06b6d4" />
                  </Space>
                ),
                children: (
                  <Table
                    columns={buildColumns('gm')}
                    dataSource={gmQueue}
                    rowKey="id"
                    loading={loading}
                    pagination={{ pageSize: 15 }}
                    scroll={{ x: 'max-content' }}
                    size="middle"
                  />
                ),
              },
            ]}
          />
        </Card>
      </div>

      <RequestDetailDrawer
        requestId={selectedRequestId}
        open={drawerOpen}
        onClose={() => {
          setDrawerOpen(false);
          setSelectedRequestId(null);
        }}
        onRefresh={fetchData}
      />
    </div>
  );
};

export default PendingApprovals;
