import React, { useState, useEffect, useCallback } from 'react';
import { Table, Tag, Card, Input, Select, Space, message } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import apiService from '../../services/api';

function formatApiError(error: any, fallback: string): string {
  if (!error?.response) return 'Network error. Please check your connection.';
  const { status, data } = error.response;
  const backendMsg = data?.message;
  const msg = Array.isArray(backendMsg) ? backendMsg[0] : backendMsg;
  switch (status) {
    case 400: return msg || 'Invalid request.';
    case 401: return 'Session expired. Please log in again.';
    case 403: return 'You do not have permission to perform this action.';
    case 404: return msg || 'Resource not found.';
    case 500: return 'Internal server error. Please try again later.';
    default: return msg || fallback;
  }
}

interface Permission {
  id: string;
  permissionCode: string;
  name: string;
  module: string;
  resource: string;
  action: string;
  description: string;
  status: string;
}

const PermissionManagement: React.FC = () => {
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [modules, setModules] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [filterModule, setFilterModule] = useState<string | undefined>();
  const [search, setSearch] = useState('');

  const fetchPermissions = useCallback(async (pageNum: number = 1) => {
    setLoading(true);
    try {
      const params: any = { page: pageNum, limit: 50 };
      if (filterModule) params.module = filterModule;
      if (search) params.search = search;
      const response = await apiService.get<{ data: Permission[]; total: number }>('/admin/permissions', params);
      setPermissions(response.data);
      setTotal(response.total);
    } catch (error) {
      message.error(formatApiError(error, 'Failed to fetch permissions'));
    } finally {
      setLoading(false);
    }
  }, [filterModule, search]);

  const fetchModules = useCallback(async () => {
    try {
      const response = await apiService.get<{ data: string[] }>('/admin/permissions/modules');
      setModules(response.data);
    } catch (error) {
      message.error(formatApiError(error, 'Failed to fetch modules'));
    }
  }, []);

  useEffect(() => { fetchPermissions(page); fetchModules(); }, [page, fetchPermissions, fetchModules]);

  const actionColors: Record<string, string> = {
    VIEW: 'blue',
    CREATE: 'green',
    UPDATE: 'orange',
    DELETE: 'red',
    ACTIVATE: 'lime',
    DEACTIVATE: 'volcano',
    ASSIGN_ROLES: 'purple',
    REMOVE_ROLES: 'magenta',
    MANAGE_SCOPE: 'cyan',
    SET_DEFAULT_CONTEXT: 'geekblue',
    ASSIGN_PERMISSIONS: 'purple',
    REMOVE_PERMISSIONS: 'magenta',
  };

  const columns: ColumnsType<Permission> = [
    { title: 'Code', dataIndex: 'permissionCode', key: 'permissionCode', width: 250 },
    { title: 'Name', dataIndex: 'name', key: 'name' },
    { title: 'Module', dataIndex: 'module', key: 'module', render: (m: string) => <Tag>{m}</Tag> },
    { title: 'Resource', dataIndex: 'resource', key: 'resource' },
    { title: 'Action', dataIndex: 'action', key: 'action', render: (a: string) => <Tag color={actionColors[a] || 'default'}>{a}</Tag> },
    { title: 'Description', dataIndex: 'description', key: 'description', ellipsis: true },
    { title: 'Status', dataIndex: 'status', key: 'status', render: (s: string) => <Tag color={s === 'ACTIVE' ? 'green' : 'red'}>{s}</Tag> },
  ];

  return (
    <Card title="Permission Management">
      <Space style={{ marginBottom: 16 }}>
        <Input.Search placeholder="Search permissions" onSearch={setSearch} style={{ width: 300 }} />
        <Select placeholder="Filter by module" allowClear style={{ width: 200 }} onChange={setFilterModule}>
          {modules.map(m => <Select.Option key={m} value={m}>{m}</Select.Option>)}
        </Select>
      </Space>
      <Table columns={columns} dataSource={permissions} rowKey="id" loading={loading}
        pagination={{ current: page, total, pageSize: 50, onChange: setPage }} />
    </Card>
  );
};

export default PermissionManagement;
