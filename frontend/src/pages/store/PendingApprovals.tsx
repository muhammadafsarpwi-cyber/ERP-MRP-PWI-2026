import React, { useState, useEffect, useCallback } from 'react';
import { Card, Table, Button, Space, Tag, App, Popconfirm } from 'antd';
import { CheckOutlined, CloseOutlined, ClockCircleOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import apiService from '../../services/api';
import { usePermission } from '../../hooks/usePermission';
import PageHeader from '../../components/shared/PageHeader';

interface MaterialRequest {
  id: string;
  requestNumber: string;
  requestDate: string;
  requiredDate: string;
  storeId: string;
  departmentId: string;
  purpose: string;
  status: string;
  createdAt: string;
}

const PendingApprovals: React.FC = () => {
  const { message } = App.useApp();
  const { can } = usePermission();
  const canApprove = can('store.request.approve');
  const canReject = can('store.request.reject');

  const [data, setData] = useState<MaterialRequest[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const response = await apiService.get<MaterialRequest[]>('/store/material-requests?status=SUBMITTED');
      setData(response);
    } catch {
      message.error('Failed to load pending approvals');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleApprove = async (id: string) => {
    try {
      await apiService.post(`/store/material-requests/${id}/approve`);
      message.success('Request approved');
      fetchData();
    } catch {
      message.error('Failed to approve');
    }
  };

  const handleReject = async (id: string) => {
    try {
      await apiService.post(`/store/material-requests/${id}/reject`);
      message.success('Request rejected');
      fetchData();
    } catch {
      message.error('Failed to reject');
    }
  };

  const columns: ColumnsType<MaterialRequest> = [
    { title: 'Request #', dataIndex: 'requestNumber', key: 'requestNumber', width: 140 },
    { title: 'Date', dataIndex: 'requestDate', key: 'requestDate', width: 110 },
    { title: 'Required Date', dataIndex: 'requiredDate', key: 'requiredDate', width: 110 },
    { title: 'Purpose', dataIndex: 'purpose', key: 'purpose', width: 250, ellipsis: true },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 120,
      render: (v: string) => <Tag color="processing">{v}</Tag>,
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 180,
      render: (_: any, record: MaterialRequest) => (
        canApprove || canReject ? (
          <Space size="small">
            {canApprove ? (
              <Popconfirm title="Approve this request?" onConfirm={() => handleApprove(record.id)}>
                <Button type="primary" size="small" icon={<CheckOutlined />}>Approve</Button>
              </Popconfirm>
            ) : null}
            {canReject ? (
              <Popconfirm title="Reject this request?" onConfirm={() => handleReject(record.id)}>
                <Button danger size="small" icon={<CloseOutlined />}>Reject</Button>
              </Popconfirm>
            ) : null}
          </Space>
        ) : null
      ),
    },
  ];

  return (
    <div>
      <PageHeader icon={<ClockCircleOutlined />} title="Pending Approvals" />
      <div style={{ padding: '0 24px' }}>
        <Card>
          <Table
            columns={columns}
            dataSource={data}
            rowKey="id"
            loading={loading}
            pagination={{ pageSize: 15 }}
            scroll={{ x: 1000 }}
            size="middle"
          />
        </Card>
      </div>
    </div>
  );
};

export default PendingApprovals;
