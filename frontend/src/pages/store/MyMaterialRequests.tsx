import React, { useState, useEffect, useCallback } from 'react';
import { Card, Table, Button, Space, Tag, Tabs, App, Popconfirm } from 'antd';
import { SendOutlined, CloseOutlined, FileAddOutlined, PlusOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { useNavigate } from 'react-router-dom';
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
  createdBy: string;
  createdAt: string;
}

const MyMaterialRequests: React.FC = () => {
  const { message } = App.useApp();
  const { can } = usePermission();
  const navigate = useNavigate();
  const canSubmit = can('store.request.submit');

  const [data, setData] = useState<MaterialRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('ALL');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const response = await apiService.get<MaterialRequest[]>('/store/material-requests', { mine: true });
      setData(response);
    } catch {
      message.error('Failed to load material requests');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const filteredData = activeTab === 'ALL' ? data : data.filter(d => d.status === activeTab);

  const handleStatusChange = async (id: string, action: string) => {
    try {
      await apiService.post(`/store/material-requests/${id}/${action}`);
      message.success(`Request ${action}d successfully`);
      fetchData();
    } catch {
      message.error(`Failed to ${action} request`);
    }
  };

  const columns: ColumnsType<MaterialRequest> = [
    { title: 'Request #', dataIndex: 'requestNumber', key: 'requestNumber', width: 140 },
    { title: 'Date', dataIndex: 'requestDate', key: 'requestDate', width: 110 },
    { title: 'Required Date', dataIndex: 'requiredDate', key: 'requiredDate', width: 110 },
    { title: 'Purpose', dataIndex: 'purpose', key: 'purpose', width: 200, ellipsis: true },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 120,
      render: (v: string) => {
        const colors: Record<string, string> = { DRAFT: 'default', SUBMITTED: 'processing', APPROVED: 'success', REJECTED: 'error', CANCELLED: 'warning' };
        return <Tag color={colors[v] || 'default'}>{v}</Tag>;
      },
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 180,
      render: (_: any, record: MaterialRequest) => (
        <Space size="small">
          {record.status === 'DRAFT' && canSubmit && (
            <Button type="link" size="small" icon={<SendOutlined />} onClick={() => handleStatusChange(record.id, 'submit')}>
              Submit
            </Button>
          )}
          {record.status === 'DRAFT' && (
            <Popconfirm title="Cancel this request?" onConfirm={() => handleStatusChange(record.id, 'cancel')}>
              <Button type="link" size="small" danger icon={<CloseOutlined />}>Cancel</Button>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  const tabItems = [
    { key: 'ALL', label: `All (${data.length})` },
    { key: 'DRAFT', label: `Draft (${data.filter(d => d.status === 'DRAFT').length})` },
    { key: 'SUBMITTED', label: `Submitted (${data.filter(d => d.status === 'SUBMITTED').length})` },
    { key: 'APPROVED', label: `Approved (${data.filter(d => d.status === 'APPROVED').length})` },
    { key: 'REJECTED', label: `Rejected (${data.filter(d => d.status === 'REJECTED').length})` },
    { key: 'CANCELLED', label: `Cancelled (${data.filter(d => d.status === 'CANCELLED').length})` },
  ];

  return (
    <div>
      <PageHeader
        icon={<FileAddOutlined />}
        title="My Material Requests"
        subtitle="Requests created by you and their approval status"
        extra={<Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/store/material-requests')}>New Request</Button>}
      />
      <div style={{ padding: '0 24px' }}>
        <Card>
          <Tabs activeKey={activeTab} onChange={setActiveTab} items={tabItems} />
          <Table
            columns={columns}
            dataSource={filteredData}
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

export default MyMaterialRequests;