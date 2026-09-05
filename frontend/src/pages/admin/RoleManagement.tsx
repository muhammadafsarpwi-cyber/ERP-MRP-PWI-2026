import React, { useState, useEffect, useCallback } from 'react';
import { Table, Button, Space, Tag, Modal, Form, Input, App, Popconfirm, Card, Checkbox } from 'antd';
import { PlusOutlined, EditOutlined, CloseCircleOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import apiService from '../../services/api';
import { usePermission } from '../../hooks/usePermission';

function formatApiError(error: any, fallback: string): string {
  if (!error?.response) return 'Network error. Please check your connection.';
  const { status, data } = error.response;
  const backendMsg = data?.message;
  const msg = Array.isArray(backendMsg) ? backendMsg[0] : backendMsg;
  switch (status) {
    case 400: return msg || 'Invalid request. Please check your input.';
    case 401: return 'Session expired. Please log in again.';
    case 403: return 'You do not have permission to perform this action.';
    case 404: return msg || 'Resource not found.';
    case 409: return msg || 'A conflict occurred. This may already exist.';
    case 422: return msg || 'Validation failed. Please check your input.';
    case 500: return 'Internal server error. Please try again later.';
    default: return msg || fallback;
  }
}

interface Role {
  id: string;
  roleCode: string;
  name: string;
  description: string;
  isSystemRole: boolean;
  status: string;
  rolePermissions?: any[];
}

interface Permission {
  id: string;
  permissionCode: string;
  name: string;
  module: string;
  resource: string;
  action: string;
}

const RoleManagement: React.FC = () => {
  const { message } = App.useApp();
  const [roles, setRoles] = useState<Role[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [modalVisible, setModalVisible] = useState(false);
  const [permModalVisible, setPermModalVisible] = useState(false);
  const [modalLoading, setModalLoading] = useState(false);
  const [permModalLoading, setPermModalLoading] = useState(false);
  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const [selectedRole, setSelectedRole] = useState<Role | null>(null);
  const [form] = Form.useForm();
  const [permForm] = Form.useForm();
  const { can } = usePermission();

  const fetchRoles = useCallback(async (pageNum: number = 1) => {
    setLoading(true);
    try {
      const response = await apiService.get<{ data: Role[]; total: number }>('/admin/roles', { page: pageNum, limit: 20 });
      setRoles(response.data);
      setTotal(response.total);
    } catch (error) {
      message.error(formatApiError(error, 'Failed to fetch roles'));
    } finally {
      setLoading(false);
    }
  }, [message]);

  const fetchPermissions = useCallback(async () => {
    try {
      const response = await apiService.get<{ data: Permission[] }>('/admin/permissions', { limit: 500 });
      setPermissions(response.data);
    } catch (error) {
      message.error(formatApiError(error, 'Failed to fetch permissions'));
    }
  }, [message]);

  useEffect(() => { fetchRoles(page); fetchPermissions(); }, [page, fetchRoles, fetchPermissions]);

  const handleCreate = () => {
    setEditingRole(null);
    form.resetFields();
    setModalVisible(true);
  };

  const handleEdit = (record: Role) => {
    setEditingRole(record);
    form.setFieldsValue(record);
    setModalVisible(true);
  };

  const handleDeactivate = async (id: string) => {
    try {
      await apiService.patch(`/admin/roles/${id}/deactivate`);
      message.success('Role deactivated');
      fetchRoles(page);
    } catch (error) {
      message.error(formatApiError(error, 'Failed to deactivate role'));
    }
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      setModalLoading(true);
      if (editingRole) {
        await apiService.patch(`/admin/roles/${editingRole.id}`, values);
        message.success('Role updated');
      } else {
        await apiService.post('/admin/roles', values);
        message.success('Role created');
      }
      setModalVisible(false);
      fetchRoles(page);
    } catch (error: any) {
      if (error.errorFields) return;
      message.error(formatApiError(error, 'Operation failed'));
    } finally {
      setModalLoading(false);
    }
  };

  const openPermModal = async (role: Role) => {
    setSelectedRole(role);
    const assignedIds = role.rolePermissions?.map((rp: any) => rp.permissionId) || [];
    permForm.setFieldsValue({ permissionIds: assignedIds });
    setPermModalVisible(true);
  };

  const handleAssignPermissions = async () => {
    try {
      const values = await permForm.validateFields();
      if (selectedRole) {
        setPermModalLoading(true);
        await apiService.post(`/admin/roles/${selectedRole.id}/permissions`, { permissionIds: values.permissionIds });
        message.success('Permissions assigned');
        setPermModalVisible(false);
        fetchRoles(page);
      }
    } catch (error: any) {
      if (error.errorFields) return;
      message.error(formatApiError(error, 'Failed to assign permissions'));
    } finally {
      setPermModalLoading(false);
    }
  };

  const columns: ColumnsType<Role> = [
    { title: 'Code', dataIndex: 'roleCode', key: 'roleCode' },
    { title: 'Name', dataIndex: 'name', key: 'name' },
    { title: 'Description', dataIndex: 'description', key: 'description', ellipsis: true },
    { title: 'System', key: 'isSystemRole', render: (_, r) => r.isSystemRole ? <Tag color="gold">System</Tag> : '-' },
    { title: 'Permissions', key: 'perms', render: (_, r) => r.rolePermissions?.length || 0 },
    { title: 'Status', dataIndex: 'status', key: 'status', render: (s: string) => <Tag color={s === 'ACTIVE' ? 'green' : 'red'}>{s}</Tag> },
    {
      title: 'Actions', key: 'actions',
      render: (_, record) => (
        <Space size="small">
          {can('admin.roles.update') && (
            <Button type="link" icon={<EditOutlined />} onClick={() => handleEdit(record)} />
          )}
          {can('admin.roles.assign_permissions') && (
            <Button type="link" onClick={() => openPermModal(record)}>Permissions</Button>
          )}
          {can('admin.roles.deactivate') && !record.isSystemRole && record.status === 'ACTIVE' && (
            <Popconfirm title="Deactivate?" onConfirm={() => handleDeactivate(record.id)}>
              <Button type="link" danger icon={<CloseCircleOutlined />} />
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  const groupedPermissions = permissions.reduce((acc, p) => {
    if (!acc[p.module]) acc[p.module] = [];
    acc[p.module].push(p);
    return acc;
  }, {} as Record<string, Permission[]>);

  return (
    <Card title="Role Management">
      <Space style={{ marginBottom: 16 }}>
        {can('admin.roles.create') && (
          <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>Add Role</Button>
        )}
      </Space>
      <Table columns={columns} dataSource={roles} rowKey="id" loading={loading}
        pagination={{ current: page, total, pageSize: 20, onChange: setPage }} />

      <Modal title={editingRole ? 'Edit Role' : 'Create Role'} open={modalVisible} onOk={handleSubmit} onCancel={() => setModalVisible(false)} confirmLoading={modalLoading} width={600}>
        <Form form={form} layout="vertical">
          {!editingRole && <Form.Item name="roleCode" label="Role Code" rules={[{ required: true }]}><Input disabled={!!editingRole} /></Form.Item>}
          <Form.Item name="name" label="Name" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="description" label="Description"><Input.TextArea /></Form.Item>
        </Form>
      </Modal>

      <Modal title={`Assign Permissions - ${selectedRole?.name}`} open={permModalVisible} onOk={handleAssignPermissions} onCancel={() => setPermModalVisible(false)} confirmLoading={permModalLoading} width={800}>
        <Form form={permForm} layout="vertical">
          <Form.Item name="permissionIds">
            <Checkbox.Group style={{ width: '100%' }}>
              {Object.entries(groupedPermissions).map(([module, perms]) => (
                <div key={module} style={{ marginBottom: 16 }}>
                  <strong style={{ textTransform: 'capitalize' }}>{module}</strong>
                  <div style={{ paddingLeft: 16 }}>
                    {perms.map(p => (
                      <Checkbox key={p.id} value={p.id} style={{ display: 'block', margin: '4px 0' }}>
                        {p.permissionCode} - {p.name}
                      </Checkbox>
                    ))}
                  </div>
                </div>
              ))}
            </Checkbox.Group>
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
};

export default RoleManagement;
