import React, { useState, useEffect, useCallback } from 'react';
import { Table, Button, Space, Tag, Modal, Form, Input, Select, message, Popconfirm, Card, Alert } from 'antd';
import { PlusOutlined, EditOutlined, CheckCircleOutlined, CloseCircleOutlined, KeyOutlined, EyeInvisibleOutlined, EyeTwoTone } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import apiService from '../../services/api';

interface ErpUser {
  id: string;
  authUserId: string;
  displayName: string;
  email: string;
  phone: string;
  status: string;
  defaultCompanyId?: string;
  defaultCompany?: any;
  userRoles?: UserRole[];
  organizationScopes?: any[];
  lastLoginAt?: string;
  createdAt: string;
}

interface Role {
  id: string;
  roleCode: string;
  name: string;
}

interface UserRole {
  id: string;
  roleId: string;
  role?: Role;
}

const UserManagement: React.FC = () => {
  const [users, setUsers] = useState<ErpUser[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [modalVisible, setModalVisible] = useState(false);
  const [roleModalVisible, setRoleModalVisible] = useState(false);
  const [resetModalVisible, setResetModalVisible] = useState(false);
  const [editingUser, setEditingUser] = useState<ErpUser | null>(null);
  const [selectedUser, setSelectedUser] = useState<ErpUser | null>(null);
  const [resetUser, setResetUser] = useState<ErpUser | null>(null);
  const [form] = Form.useForm();
  const [roleForm] = Form.useForm();
  const [resetForm] = Form.useForm();

  const fetchUsers = useCallback(async (pageNum: number = 1) => {
    setLoading(true);
    try {
      const response = await apiService.get<{ data: ErpUser[]; total: number }>('/admin/users', { page: pageNum, limit: 20 });
      setUsers(response.data);
      setTotal(response.total);
    } catch (error) {
      message.error('Failed to fetch users');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchRoles = useCallback(async () => {
    try {
      const response = await apiService.get<{ data: Role[] }>('/admin/roles', { limit: 100 });
      setRoles(response.data);
    } catch (error) {
      message.error('Failed to fetch roles');
    }
  }, []);

  useEffect(() => { fetchUsers(page); fetchRoles(); }, [page, fetchUsers, fetchRoles]);

  const handleCreate = () => {
    setEditingUser(null);
    form.resetFields();
    setModalVisible(true);
  };

  const handleEdit = (record: ErpUser) => {
    setEditingUser(record);
    form.setFieldsValue(record);
    setModalVisible(true);
  };

  const handleDeactivate = async (id: string) => {
    try {
      await apiService.patch(`/admin/users/${id}/deactivate`);
      message.success('User deactivated');
      fetchUsers(page);
    } catch (error) {
      message.error('Failed to deactivate user');
    }
  };

  const handleActivate = async (id: string) => {
    try {
      await apiService.patch(`/admin/users/${id}/activate`);
      message.success('User activated');
      fetchUsers(page);
    } catch (error) {
      message.error('Failed to activate user');
    }
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      if (editingUser) {
        await apiService.patch(`/admin/users/${editingUser.id}`, values);
        message.success('User updated');
      } else {
        await apiService.post('/admin/users', values);
        message.success('User created');
      }
      setModalVisible(false);
      fetchUsers(page);
    } catch (error) {
      message.error('Operation failed');
    }
  };

  const handleAssignRoles = async () => {
    try {
      const values = await roleForm.validateFields();
      if (selectedUser) {
        await apiService.post(`/admin/users/${selectedUser.id}/roles`, { roleIds: values.roleIds });
        message.success('Roles assigned');
        setRoleModalVisible(false);
        fetchUsers(page);
      }
    } catch (error) {
      message.error('Failed to assign roles');
    }
  };

  const handleResetPassword = async () => {
    try {
      const values = await resetForm.validateFields();
      if (resetUser) {
        await apiService.post(`/admin/users/${resetUser.id}/reset-password`, {
          newPassword: values.newPassword,
        });
        message.success(`Password reset for ${resetUser.email}`);
        setResetModalVisible(false);
        resetForm.resetFields();
      }
    } catch (error) {
      message.error('Failed to reset password');
    }
  };

  const openResetPasswordModal = (user: ErpUser) => {
    setResetUser(user);
    resetForm.resetFields();
    setResetModalVisible(true);
  };

  const openRoleModal = (user: ErpUser) => {
    setSelectedUser(user);
    roleForm.setFieldsValue({ roleIds: user.userRoles?.map(ur => ur.roleId) || [] });
    setRoleModalVisible(true);
  };

  const columns: ColumnsType<ErpUser> = [
    { title: 'Display Name', dataIndex: 'displayName', key: 'displayName' },
    { title: 'Email', dataIndex: 'email', key: 'email' },
    { title: 'Phone', dataIndex: 'phone', key: 'phone' },
    { title: 'Company', key: 'company', render: (_, r) => r.defaultCompany?.legalName || '-' },
    { title: 'Roles', key: 'roles', render: (_, r) => r.userRoles?.map(ur => <Tag key={ur.id} color="blue">{ur.role?.roleCode}</Tag>) || '-' },
    { title: 'Last Login', key: 'lastLogin', render: (_, r) => r.lastLoginAt ? new Date(r.lastLoginAt).toLocaleDateString() : 'Never' },
    { title: 'Status', dataIndex: 'status', key: 'status', render: (s: string) => <Tag color={s === 'ACTIVE' ? 'green' : 'red'}>{s}</Tag> },
    {
      title: 'Actions', key: 'actions',
      render: (_, record) => (
        <Space size="small">
          <Button type="link" icon={<EditOutlined />} onClick={() => handleEdit(record)} />
          <Button type="link" onClick={() => openRoleModal(record)}>Roles</Button>
          <Popconfirm title="Reset this user's password?" onConfirm={() => openResetPasswordModal(record)}>
            <Button type="link" icon={<KeyOutlined />} />
          </Popconfirm>
          {record.status === 'ACTIVE' ? (
            <Popconfirm title="Deactivate?" onConfirm={() => handleDeactivate(record.id)}>
              <Button type="link" danger icon={<CloseCircleOutlined />} />
            </Popconfirm>
          ) : (
            <Popconfirm title="Activate?" onConfirm={() => handleActivate(record.id)}>
              <Button type="link" icon={<CheckCircleOutlined />} />
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  return (
    <Card title="User Management">
      <Space style={{ marginBottom: 16 }}>
        <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>Add User</Button>
      </Space>
      <Table columns={columns} dataSource={users} rowKey="id" loading={loading}
        pagination={{ current: page, total, pageSize: 20, onChange: setPage }} />

      <Modal title={editingUser ? 'Edit User' : 'Create User'} open={modalVisible} onOk={handleSubmit} onCancel={() => setModalVisible(false)} width={600}>
        <Form form={form} layout="vertical">
          {!editingUser && <Form.Item name="authUserId" label="Auth User ID" rules={[{ required: true }]}><Input /></Form.Item>}
          <Form.Item name="displayName" label="Display Name" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="email" label="Email" rules={[{ required: true, type: 'email' }]}><Input /></Form.Item>
          <Form.Item name="firstName" label="First Name"><Input /></Form.Item>
          <Form.Item name="lastName" label="Last Name"><Input /></Form.Item>
          <Form.Item name="phone" label="Phone"><Input /></Form.Item>
          <Form.Item name="username" label="Username"><Input /></Form.Item>
          <Form.Item name="employeeId" label="Employee ID"><Input /></Form.Item>
        </Form>
      </Modal>

      <Modal title={`Assign Roles - ${selectedUser?.displayName}`} open={roleModalVisible} onOk={handleAssignRoles} onCancel={() => setRoleModalVisible(false)} width={600}>
        <Form form={roleForm} layout="vertical">
          <Form.Item name="roleIds" label="Roles">
            <Select mode="multiple" placeholder="Select roles">
              {roles.map(r => <Select.Option key={r.id} value={r.id}>{r.roleCode} - {r.name}</Select.Option>)}
            </Select>
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={`Reset Password - ${resetUser?.displayName}`}
        open={resetModalVisible}
        onOk={handleResetPassword}
        onCancel={() => setResetModalVisible(false)}
        okText="Reset Password"
        okButtonProps={{ danger: true }}
        width={480}
      >
        <Alert
          message="This will set a new password for the user. The old password will no longer work."
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
        />
        <Form form={resetForm} layout="vertical">
          <Form.Item
            name="newPassword"
            label="New Password"
            rules={[
              { required: true, message: 'Please enter a new password' },
              { min: 8, message: 'Password must be at least 8 characters' },
              {
                pattern: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/,
                message: 'Must contain uppercase, lowercase, and a number',
              },
            ]}
          >
            <Input.Password
              placeholder="New password"
              size="large"
              iconRender={(visible) => visible ? <EyeTwoTone /> : <EyeInvisibleOutlined />}
            />
          </Form.Item>
          <Form.Item
            name="confirmPassword"
            label="Confirm Password"
            dependencies={['newPassword']}
            rules={[
              { required: true, message: 'Please confirm the password' },
              ({ getFieldValue }) => ({
                validator(_, value) {
                  if (!value || getFieldValue('newPassword') === value) {
                    return Promise.resolve();
                  }
                  return Promise.reject(new Error('Passwords do not match'));
                },
              }),
            ]}
          >
            <Input.Password
              placeholder="Confirm new password"
              size="large"
              iconRender={(visible) => visible ? <EyeTwoTone /> : <EyeInvisibleOutlined />}
            />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
};

export default UserManagement;
