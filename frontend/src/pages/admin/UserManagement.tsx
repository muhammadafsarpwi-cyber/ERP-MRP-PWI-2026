import React, { useState, useEffect, useCallback } from 'react';
import {
  Table, Button, Space, Tag, Modal, Form, Input, Select, message,
  Popconfirm, Card, Avatar, Row, Col, Divider, Typography, Badge, Tooltip,
  Statistic, Empty,
} from 'antd';
import {
  PlusOutlined, EditOutlined, CheckCircleOutlined, CloseCircleOutlined,
  KeyOutlined, EyeInvisibleOutlined, EyeTwoTone, UserOutlined,
  DeleteOutlined, SearchOutlined, ReloadOutlined, TeamOutlined,
  SafetyCertificateOutlined, ClockCircleOutlined, ExclamationCircleOutlined,
  MailOutlined, PhoneOutlined, IdcardOutlined, FormOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import apiService from '../../services/api';
import { usePermission } from '../../hooks/usePermission';

const { Text, Title } = Typography;

interface ErpUser {
  id: string;
  authUserId: string;
  displayName: string;
  email: string;
  phone: string;
  firstName?: string;
  lastName?: string;
  username?: string;
  employeeId?: string;
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
  description?: string;
}

interface UserRole {
  id: string;
  roleId: string;
  role?: Role;
}

const ROLE_COLORS: Record<string, string> = {
  SUPER_ADMIN: 'red',
  ADMIN: 'orange',
  MANAGEMENT: 'gold',
  PRODUCTION: 'blue',
  INVENTORY: 'cyan',
  SALES: 'green',
  PROCUREMENT: 'lime',
  QUALITY_CONTROL: 'purple',
  FINANCE: 'magenta',
  HR: 'geekblue',
  REPORT_VIEWER: 'default',
};

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

const UserManagement: React.FC = () => {
  const [users, setUsers] = useState<ErpUser[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string | undefined>(undefined);

  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [roleModalVisible, setRoleModalVisible] = useState(false);
  const [resetModalVisible, setResetModalVisible] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);
  const [editLoading, setEditLoading] = useState(false);
  const [roleLoading, setRoleLoading] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);

  const [selectedUser, setSelectedUser] = useState<ErpUser | null>(null);
  const [resetUser, setResetUser] = useState<ErpUser | null>(null);

  const [createForm] = Form.useForm();
  const [editForm] = Form.useForm();
  const [roleForm] = Form.useForm();
  const [resetForm] = Form.useForm();
  const { can } = usePermission();

  const fetchUsers = useCallback(async (pageNum: number = 1, searchTerm?: string, status?: string) => {
    setLoading(true);
    try {
      const params: any = { page: pageNum, limit: 20 };
      if (searchTerm) params.search = searchTerm;
      if (status) params.status = status;
      const response = await apiService.get<{ data: ErpUser[]; total: number }>('/admin/users', params);
      setUsers(response.data);
      setTotal(response.total);
    } catch (error) {
      message.error(formatApiError(error, 'Failed to fetch users'));
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchRoles = useCallback(async () => {
    try {
      const response = await apiService.get<{ data: Role[] }>('/admin/roles', { limit: 100 });
      setRoles(response.data);
    } catch (error) {
      message.error(formatApiError(error, 'Failed to fetch roles'));
    }
  }, []);

  useEffect(() => {
    fetchUsers(page, search || undefined, statusFilter);
    fetchRoles();
  }, [page, fetchUsers, fetchRoles, statusFilter]);

  const handleSearch = (value: string) => {
    setSearch(value);
    setPage(1);
    fetchUsers(1, value || undefined, statusFilter);
  };

  const openCreateModal = () => {
    createForm.resetFields();
    setCreateModalVisible(true);
  };

  const openEditModal = (record: ErpUser) => {
    setSelectedUser(record);
    editForm.setFieldsValue({
      displayName: record.displayName,
      firstName: record.firstName,
      lastName: record.lastName,
      phone: record.phone,
      employeeId: record.employeeId,
      username: record.username,
    });
    setEditModalVisible(true);
  };

  const openRoleModal = (user: ErpUser) => {
    setSelectedUser(user);
    roleForm.setFieldsValue({ roleIds: user.userRoles?.map(ur => ur.roleId) || [] });
    setRoleModalVisible(true);
  };

  const openResetModal = (user: ErpUser) => {
    setResetUser(user);
    resetForm.resetFields();
    setResetModalVisible(true);
  };

  const handleCreate = async () => {
    try {
      const values = await createForm.validateFields();
      setCreateLoading(true);
      await apiService.post('/admin/users/create-full', {
        email: values.email,
        password: values.password,
        displayName: values.displayName,
        firstName: values.firstName,
        lastName: values.lastName,
        phone: values.phone,
        employeeId: values.employeeId,
        username: values.username,
        roleIds: values.roleIds || [],
      });
      message.success(`User "${values.displayName}" created successfully`);
      setCreateModalVisible(false);
      fetchUsers(page, search || undefined, statusFilter);
    } catch (error: any) {
      if (error.errorFields) return;
      message.error(formatApiError(error, 'Failed to create user'));
    } finally {
      setCreateLoading(false);
    }
  };

  const handleEdit = async () => {
    try {
      const values = await editForm.validateFields();
      if (selectedUser) {
        setEditLoading(true);
        await apiService.patch(`/admin/users/${selectedUser.id}`, values);
        message.success('User updated successfully');
        setEditModalVisible(false);
        fetchUsers(page, search || undefined, statusFilter);
      }
    } catch (error: any) {
      if (error.errorFields) return;
      message.error(formatApiError(error, 'Failed to update user'));
    } finally {
      setEditLoading(false);
    }
  };

  const handleAssignRoles = async () => {
    try {
      const values = await roleForm.validateFields();
      if (selectedUser) {
        setRoleLoading(true);
        await apiService.post(`/admin/users/${selectedUser.id}/roles`, { roleIds: values.roleIds });
        message.success('Roles updated successfully');
        setRoleModalVisible(false);
        fetchUsers(page, search || undefined, statusFilter);
      }
    } catch (error: any) {
      if (error.errorFields) return;
      message.error(formatApiError(error, 'Failed to update roles'));
    } finally {
      setRoleLoading(false);
    }
  };

  const handleResetPassword = async () => {
    try {
      const values = await resetForm.validateFields();
      if (resetUser) {
        setResetLoading(true);
        await apiService.post(`/admin/users/${resetUser.id}/reset-password`, {
          newPassword: values.newPassword,
        });
        message.success(`Password reset for ${resetUser.email}`);
        setResetModalVisible(false);
        resetForm.resetFields();
      }
    } catch (error: any) {
      if (error.errorFields) return;
      message.error(formatApiError(error, 'Failed to reset password'));
    } finally {
      setResetLoading(false);
    }
  };

  const handleDeactivate = async (id: string) => {
    try {
      await apiService.patch(`/admin/users/${id}/deactivate`);
      message.success('User deactivated');
      fetchUsers(page, search || undefined, statusFilter);
    } catch (error) {
      message.error(formatApiError(error, 'Failed to deactivate user'));
    }
  };

  const handleActivate = async (id: string) => {
    try {
      await apiService.patch(`/admin/users/${id}/activate`);
      message.success('User activated');
      fetchUsers(page, search || undefined, statusFilter);
    } catch (error) {
      message.error(formatApiError(error, 'Failed to activate user'));
    }
  };

  const activeCount = users.filter(u => u.status === 'ACTIVE').length;
  const inactiveCount = users.filter(u => u.status !== 'ACTIVE').length;

  const columns: ColumnsType<ErpUser> = [
    {
      title: 'User',
      key: 'user',
      width: 280,
      sorter: (a, b) => (a.displayName || '').localeCompare(b.displayName || ''),
      render: (_, record) => (
        <Space>
          <Avatar
            size={36}
            icon={<UserOutlined />}
            style={{
              backgroundColor: record.status === 'ACTIVE' ? '#1890ff' : '#d9d9d9',
            }}
          />
          <div>
            <div style={{ fontWeight: 500, lineHeight: '20px' }}>{record.displayName}</div>
            <Text type="secondary" style={{ fontSize: 12 }}>{record.email}</Text>
          </div>
        </Space>
      ),
    },
    {
      title: 'Employee ID',
      dataIndex: 'employeeId',
      key: 'employeeId',
      width: 130,
      render: (v: string) => v || <Text type="secondary">-</Text>,
    },
    {
      title: 'Phone',
      dataIndex: 'phone',
      key: 'phone',
      width: 130,
      render: (v: string) => v || <Text type="secondary">-</Text>,
    },
    {
      title: 'Roles',
      key: 'roles',
      width: 260,
      render: (_, record) => (
        <Space size={[4, 4]} wrap>
          {record.userRoles?.length ? (
            record.userRoles.map(ur => (
              <Tag
                key={ur.id}
                color={ROLE_COLORS[ur.role?.roleCode || ''] || 'default'}
                style={{ margin: '1px' }}
              >
                {ur.role?.roleCode || 'Unknown'}
              </Tag>
            ))
          ) : (
            <Text type="secondary" style={{ fontSize: 12 }}>No roles</Text>
          )}
        </Space>
      ),
    },
    {
      title: 'Last Login',
      key: 'lastLogin',
      width: 120,
      sorter: (a, b) => {
        const da = a.lastLoginAt ? new Date(a.lastLoginAt).getTime() : 0;
        const db = b.lastLoginAt ? new Date(b.lastLoginAt).getTime() : 0;
        return da - db;
      },
      render: (_, record) => {
        if (!record.lastLoginAt) return <Text type="secondary">Never</Text>;
        const d = new Date(record.lastLoginAt);
        return (
          <Tooltip title={d.toLocaleString()}>
            <Text style={{ fontSize: 13 }}>{d.toLocaleDateString()}</Text>
          </Tooltip>
        );
      },
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      filters: [
        { text: 'Active', value: 'ACTIVE' },
        { text: 'Inactive', value: 'INACTIVE' },
      ],
      onFilter: (value, record) => record.status === value,
      render: (s: string) => (
        <Badge
          status={s === 'ACTIVE' ? 'success' : 'error'}
          text={<Text style={{ fontSize: 12 }}>{s}</Text>}
        />
      ),
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 180,
      fixed: 'right',
      render: (_, record) => (
        <Space size={4}>
          {can('admin.users.update') && (
            <Tooltip title="Edit User">
              <Button type="text" size="small" icon={<EditOutlined />} onClick={() => openEditModal(record)} />
            </Tooltip>
          )}
          {can('admin.users.assign_roles') && (
            <Tooltip title="Manage Roles">
              <Button type="text" size="small" onClick={() => openRoleModal(record)}>Roles</Button>
            </Tooltip>
          )}
          {can('admin.users.update') && (
            <Tooltip title="Reset Password">
              <Popconfirm
                title="Reset this user's password?"
                onConfirm={() => openResetModal(record)}
                okText="Reset"
              >
                <Button type="text" size="small" icon={<KeyOutlined />} />
              </Popconfirm>
            </Tooltip>
          )}
          {can('admin.users.deactivate') && record.status === 'ACTIVE' && (
            <Tooltip title="Deactivate">
              <Popconfirm
                title="Deactivate this user?"
                onConfirm={() => handleDeactivate(record.id)}
                okText="Deactivate"
                okButtonProps={{ danger: true }}
              >
                <Button type="text" size="small" danger icon={<CloseCircleOutlined />} />
              </Popconfirm>
            </Tooltip>
          )}
          {can('admin.users.activate') && record.status !== 'ACTIVE' && (
            <Tooltip title="Activate">
              <Popconfirm
                title="Activate this user?"
                onConfirm={() => handleActivate(record.id)}
                okText="Activate"
              >
                <Button type="text" size="small" icon={<CheckCircleOutlined />} style={{ color: '#52c41a' }} />
              </Popconfirm>
            </Tooltip>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div style={{ padding: 0 }}>
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={12} md={6}>
          <Card size="small" bordered>
            <Statistic title="Total Users" value={total} prefix={<TeamOutlined />} />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card size="small" bordered>
            <Statistic title="Active" value={activeCount} valueStyle={{ color: '#3f8600' }} prefix={<CheckCircleOutlined />} />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card size="small" bordered>
            <Statistic title="Inactive" value={inactiveCount} valueStyle={{ color: '#cf1322' }} prefix={<CloseCircleOutlined />} />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card size="small" bordered>
            <Statistic title="Roles Available" value={roles.length} prefix={<SafetyCertificateOutlined />} />
          </Card>
        </Col>
      </Row>

      <Card
        title={
          <Space>
            <TeamOutlined />
            <span>User Management</span>
          </Space>
        }
        extra={
          can('admin.users.create') && (
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreateModal}>
              Add User
            </Button>
          )
        }
      >
        <Row style={{ marginBottom: 16 }} justify="space-between">
          <Col>
            <Space>
              <Input
                placeholder="Search users..."
                prefix={<SearchOutlined />}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onPressEnter={(e) => handleSearch((e.target as HTMLInputElement).value)}
                style={{ width: 280 }}
                allowClear
              />
              <Select
                placeholder="Status"
                value={statusFilter}
                onChange={(v) => { setStatusFilter(v); setPage(1); }}
                allowClear
                style={{ width: 130 }}
              >
                <Select.Option value="ACTIVE">Active</Select.Option>
                <Select.Option value="INACTIVE">Inactive</Select.Option>
              </Select>
            </Space>
          </Col>
          <Col>
            <Button icon={<ReloadOutlined />} onClick={() => fetchUsers(page, search || undefined, statusFilter)}>
              Refresh
            </Button>
          </Col>
        </Row>

        <Table
          columns={columns}
          dataSource={users}
          rowKey="id"
          loading={loading}
          scroll={{ x: 1100 }}
          pagination={{
            current: page,
            total,
            pageSize: 20,
            onChange: setPage,
            showSizeChanger: false,
            showTotal: (t) => `Total ${t} user(s)`,
          }}
          locale={{ emptyText: <Empty description="No users found" /> }}
        />
      </Card>

      {/* Create User Modal */}
      <Modal
        title={
          <Space>
            <PlusOutlined />
            <span>Create New User</span>
          </Space>
        }
        open={createModalVisible}
        onOk={handleCreate}
        onCancel={() => setCreateModalVisible(false)}
        okText="Create User"
        confirmLoading={createLoading}
        width={640}
        destroyOnClose
      >
        <Divider style={{ margin: '12px 0' }} />
        <Form form={createForm} layout="vertical" initialValues={{ roleIds: [] }}>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="email"
                label="Email Address"
                rules={[
                  { required: true, message: 'Email is required' },
                  { type: 'email', message: 'Enter a valid email' },
                ]}
              >
                <Input prefix={<MailOutlined />} placeholder="user@company.com" size="large" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="displayName"
                label="Display Name"
                rules={[{ required: true, message: 'Display name is required' }]}
              >
                <Input prefix={<UserOutlined />} placeholder="John Doe" size="large" />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="password"
                label="Password"
                rules={[
                  { required: true, message: 'Password is required' },
                  { min: 8, message: 'Minimum 8 characters' },
                  { pattern: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/, message: 'Must include uppercase, lowercase, and a number' },
                ]}
              >
                <Input.Password placeholder="Min 8 chars, upper+lower+number" size="large"
                  iconRender={(visible) => visible ? <EyeTwoTone /> : <EyeInvisibleOutlined />} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="confirmPassword"
                label="Confirm Password"
                dependencies={['password']}
                rules={[
                  { required: true, message: 'Please confirm the password' },
                  ({ getFieldValue }) => ({
                    validator(_, value) {
                      if (!value || getFieldValue('password') === value) return Promise.resolve();
                      return Promise.reject(new Error('Passwords do not match'));
                    },
                  }),
                ]}
              >
                <Input.Password placeholder="Re-enter password" size="large"
                  iconRender={(visible) => visible ? <EyeTwoTone /> : <EyeInvisibleOutlined />} />
              </Form.Item>
            </Col>
          </Row>

          <Divider orientation="left" style={{ fontSize: 13 }}>Personal Information</Divider>

          <Row gutter={16}>
            <Col span={8}>
              <Form.Item name="firstName" label="First Name">
                <Input prefix={<FormOutlined />} placeholder="John" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="lastName" label="Last Name">
                <Input prefix={<FormOutlined />} placeholder="Doe" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="phone" label="Phone">
                <Input prefix={<PhoneOutlined />} placeholder="+1 234 567 890" />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="username" label="Username">
                <Input prefix={<UserOutlined />} placeholder="johndoe" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="employeeId" label="Employee ID">
                <Input prefix={<IdcardOutlined />} placeholder="EMP-001" />
              </Form.Item>
            </Col>
          </Row>

          <Divider orientation="left" style={{ fontSize: 13 }}>Role Assignment</Divider>

          <Form.Item name="roleIds" label="Roles">
            <Select
              mode="multiple"
              placeholder="Select roles (optional)"
              allowClear
              maxTagCount={3}
            >
              {roles.map(r => (
                <Select.Option key={r.id} value={r.id}>
                  <Tag color={ROLE_COLORS[r.roleCode] || 'default'} style={{ marginRight: 8 }}>{r.roleCode}</Tag>
                  {r.name}
                </Select.Option>
              ))}
            </Select>
          </Form.Item>
        </Form>
      </Modal>

      {/* Edit User Modal */}
      <Modal
        title={
          <Space>
            <EditOutlined />
            <span>Edit User - {selectedUser?.displayName}</span>
          </Space>
        }
        open={editModalVisible}
        onOk={handleEdit}
        onCancel={() => setEditModalVisible(false)}
        okText="Save Changes"
        confirmLoading={editLoading}
        width={640}
        destroyOnClose
      >
        <Form form={editForm} layout="vertical">
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="displayName" label="Display Name" rules={[{ required: true }]}>
                <Input size="large" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="username" label="Username">
                <Input />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="firstName" label="First Name">
                <Input />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="lastName" label="Last Name">
                <Input />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="phone" label="Phone">
                <Input />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="employeeId" label="Employee ID">
                <Input />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>

      {/* Assign Roles Modal */}
      <Modal
        title={
          <Space>
            <SafetyCertificateOutlined />
            <span>Manage Roles - {selectedUser?.displayName}</span>
          </Space>
        }
        open={roleModalVisible}
        onOk={handleAssignRoles}
        onCancel={() => setRoleModalVisible(false)}
        okText="Save Roles"
        confirmLoading={roleLoading}
        width={500}
        destroyOnClose
      >
        <Form form={roleForm} layout="vertical">
          <Form.Item name="roleIds" label="Assigned Roles">
            <Select
              mode="multiple"
              placeholder="Select roles"
              allowClear
              maxTagCount={5}
              style={{ width: '100%' }}
            >
              {roles.map(r => (
                <Select.Option key={r.id} value={r.id}>
                  <Tag color={ROLE_COLORS[r.roleCode] || 'default'} style={{ marginRight: 8 }}>{r.roleCode}</Tag>
                  {r.name}
                </Select.Option>
              ))}
            </Select>
          </Form.Item>
        </Form>
      </Modal>

      {/* Reset Password Modal */}
      <Modal
        title={
          <Space>
            <KeyOutlined />
            <span>Reset Password - {resetUser?.displayName}</span>
          </Space>
        }
        open={resetModalVisible}
        onOk={handleResetPassword}
        onCancel={() => setResetModalVisible(false)}
        okText="Reset Password"
        okButtonProps={{ danger: true }}
        confirmLoading={resetLoading}
        width={480}
        destroyOnClose
      >
        <div style={{ marginBottom: 16, padding: 12, background: '#fff7e6', border: '1px solid #ffd591', borderRadius: 6 }}>
          <Space align="start">
            <ExclamationCircleOutlined style={{ color: '#fa8c16', fontSize: 16, marginTop: 2 }} />
            <Text type="warning">This will set a new password for <strong>{resetUser?.email}</strong>. The old password will no longer work.</Text>
          </Space>
        </div>
        <Form form={resetForm} layout="vertical">
          <Form.Item
            name="newPassword"
            label="New Password"
            rules={[
              { required: true, message: 'Please enter a new password' },
              { min: 8, message: 'Password must be at least 8 characters' },
              { pattern: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/, message: 'Must contain uppercase, lowercase, and a number' },
            ]}
          >
            <Input.Password
              placeholder="Enter new password"
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
                  if (!value || getFieldValue('newPassword') === value) return Promise.resolve();
                  return Promise.reject(new Error('Passwords do not match'));
                },
              }),
            ]}
          >
            <Input.Password
              placeholder="Re-enter new password"
              size="large"
              iconRender={(visible) => visible ? <EyeTwoTone /> : <EyeInvisibleOutlined />}
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default UserManagement;
