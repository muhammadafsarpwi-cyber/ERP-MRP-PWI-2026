import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Table, Button, Space, Tag, Modal, Form, Input, App, Popconfirm,
  Card, Checkbox, Row, Col, Typography, Badge, Tooltip, Empty,
  Dropdown, message as staticMessage,
} from 'antd';
import type { MenuProps } from 'antd';
import {
  PlusOutlined, EditOutlined, CloseCircleOutlined, CheckCircleOutlined,
  KeyOutlined, ReloadOutlined, DownloadOutlined, FilePdfOutlined,
  FileExcelOutlined, SafetyCertificateOutlined, CrownOutlined,
  TeamOutlined, TagOutlined, IdcardOutlined, FileTextOutlined,
  SettingOutlined, SearchOutlined, MinusOutlined, CloseOutlined,
  ApartmentOutlined, LockOutlined, UnlockOutlined, EyeOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import apiService from '../../services/api';
import { usePermission } from '../../hooks/usePermission';
import { handleValidationErrors } from '../../utils/formValidationHelper';
import { PageHeader, SaveResultDialog, DraggableResizableModal } from '../../components/shared';
import type { SaveResultData, SaveResultPhase } from '../../components/shared/SaveResultDialog';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import './roleManagement.css';

const { Text, Paragraph } = Typography;

export interface Role {
  id: string;
  roleCode: string;
  name: string;
  description?: string;
  isSystemRole: boolean;
  status: string;
  rolePermissions?: any[];
  createdAt?: string;
  updatedAt?: string;
}

export interface Permission {
  id: string;
  permissionCode: string;
  name: string;
  module: string;
  resource: string;
  action: string;
  description?: string;
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

const getRoleColor = (code?: string): string => {
  if (!code) return 'default';
  const upper = code.toUpperCase();
  if (ROLE_COLORS[upper]) return ROLE_COLORS[upper];
  const colors = ['blue', 'cyan', 'green', 'purple', 'magenta', 'geekblue', 'volcano', 'orange'];
  let hash = 0;
  for (let i = 0; i < upper.length; i++) {
    hash = upper.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
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
    case 409: return msg || 'A conflict occurred. This role code may already exist.';
    case 422: return msg || 'Validation failed. Please check your input.';
    case 500: return 'Internal server error. Please try again later.';
    default: return msg || fallback;
  }
}

const RoleManagement: React.FC = () => {
  const app = App.useApp();
  const message = app?.message || staticMessage;
  const [roles, setRoles] = useState<Role[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [scopeFilter, setScopeFilter] = useState<'ALL' | 'SYSTEM' | 'CUSTOM'>('ALL');
  const [exportLoading, setExportLoading] = useState(false);

  // Modals Visibility
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [permModalVisible, setPermModalVisible] = useState(false);

  // Minimized Window Tabs State
  const [isCreateMinimized, setIsCreateMinimized] = useState(false);
  const [isEditMinimized, setIsEditMinimized] = useState(false);
  const [isPermMinimized, setIsPermMinimized] = useState(false);

  // Loading States
  const [modalLoading, setModalLoading] = useState(false);
  const [permModalLoading, setPermModalLoading] = useState(false);

  // Active selections
  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const [selectedRole, setSelectedRole] = useState<Role | null>(null);
  const [permSearchQuery, setPermSearchQuery] = useState('');

  // Forms
  const [form] = Form.useForm();
  const [editForm] = Form.useForm();
  const [permForm] = Form.useForm();
  const { can } = usePermission();

  // Watch fields for live preview in split view
  const createCode = Form.useWatch('roleCode', form);
  const createName = Form.useWatch('name', form);
  const createDesc = Form.useWatch('description', form);

  const editName = Form.useWatch('name', editForm);
  const editDesc = Form.useWatch('description', editForm);

  // Save Result Animated Dialog State
  const [saveDialogVisible, setSaveDialogVisible] = useState(false);
  const [saveDialogPhase, setSaveDialogPhase] = useState<SaveResultPhase>('loading');
  const [saveDialogResult, setSaveDialogResult] = useState<SaveResultData | null>(null);
  const [saveDialogError, setSaveDialogError] = useState<string | undefined>(undefined);
  const [saveDialogErrorTitle, setSaveDialogErrorTitle] = useState<string | undefined>(undefined);
  const [saveDialogErrorLead, setSaveDialogErrorLead] = useState<string | undefined>(undefined);
  const [saveDialogSuccessTitle, setSaveDialogSuccessTitle] = useState<string>('Saved Successfully');
  const [saveDialogLoadingTitle, setSaveDialogLoadingTitle] = useState<string>('Saving Role...');
  const [saveDialogLoadingHint, setSaveDialogLoadingHint] = useState<string>('Processing security permissions...');
  const [saveDialogRetry, setSaveDialogRetry] = useState<(() => void) | undefined>(undefined);

  const fetchRoles = useCallback(async (pageNum: number = 1) => {
    setLoading(true);
    try {
      const response = await apiService.get<{ data: Role[]; total: number }>('/admin/roles', { page: pageNum, limit: 100 });
      setRoles(response.data || []);
      setTotal(response.total ?? response.data?.length ?? 0);
    } catch (error) {
      message.error(formatApiError(error, 'Failed to fetch roles'));
    } finally {
      setLoading(false);
    }
  }, [message]);

  const fetchPermissions = useCallback(async () => {
    try {
      const response = await apiService.get<{ data: Permission[] }>('/admin/permissions', { limit: 1000 });
      setPermissions(response.data || []);
    } catch (error) {
      message.error(formatApiError(error, 'Failed to fetch permissions'));
    }
  }, [message]);

  useEffect(() => {
    fetchRoles(page);
    fetchPermissions();
  }, [page, fetchRoles, fetchPermissions]);

  // Modal Open Handlers
  const handleOpenCreate = () => {
    form.resetFields();
    setIsCreateMinimized(false);
    setCreateModalVisible(true);
  };

  const handleOpenEdit = (record: Role) => {
    setEditingRole(record);
    editForm.setFieldsValue({
      roleCode: record.roleCode,
      name: record.name,
      description: record.description,
    });
    setIsEditMinimized(false);
    setEditModalVisible(true);
  };

  const handleOpenPermissions = (role: Role) => {
    setSelectedRole(role);
    setPermSearchQuery('');
    const assignedIds = role.rolePermissions?.map((rp: any) => rp.permissionId || rp.permission?.id || rp.id) || [];
    permForm.setFieldsValue({ permissionIds: assignedIds });
    setIsPermMinimized(false);
    setPermModalVisible(true);
  };

  // Create Role with Animated Save Feedback
  const handleCreateSubmit = async () => {
    try {
      const values = await form.validateFields();
      setModalLoading(true);
      setSaveDialogLoadingTitle('Creating Role...');
      setSaveDialogLoadingHint(`Configuring RBAC matrix for ${values.roleCode}...`);
      setSaveDialogPhase('loading');
      setSaveDialogVisible(true);
      setSaveDialogRetry(() => () => void handleCreateSubmit());

      const res = await apiService.post<Role>('/admin/roles', {
        roleCode: values.roleCode.toUpperCase().trim(),
        name: values.name.trim(),
        description: values.description?.trim(),
      });

      const newRole = res || { ...values, id: `role-${Date.now()}` };

      setCreateModalVisible(false);
      form.resetFields();

      setSaveDialogSuccessTitle('Role Created Successfully');
      setSaveDialogResult({
        title: 'New Role Configured',
        message: `Role "${values.name}" (${values.roleCode}) has been successfully created.`,
        userName: values.name,
        userEmail: `Code: ${values.roleCode}`,
        tags: [{ label: values.roleCode, color: getRoleColor(values.roleCode) }],
      });
      setSaveDialogPhase('success');

      fetchRoles(page);
    } catch (error: any) {
      const val = handleValidationErrors(error, form);
      if (val) {
        setSaveDialogError(`Please fill the required field(s):\n\n${val.bulletList}`);
        setSaveDialogPhase('error');
        setSaveDialogVisible(true);
        return;
      }
      setSaveDialogError(formatApiError(error, 'Failed to create role'));
      setSaveDialogPhase('error');
      setSaveDialogVisible(true);
    } finally {
      setModalLoading(false);
    }
  };

  // Edit Role with Animated Save Feedback
  const handleEditSubmit = async () => {
    if (!editingRole) return;
    try {
      const values = await editForm.validateFields();
      setModalLoading(true);
      setSaveDialogLoadingTitle('Updating Role...');
      setSaveDialogLoadingHint(`Applying changes to ${editingRole.roleCode}...`);
      setSaveDialogPhase('loading');
      setSaveDialogVisible(true);
      setSaveDialogRetry(() => () => void handleEditSubmit());

      await apiService.patch(`/admin/roles/${editingRole.id}`, {
        name: values.name.trim(),
        description: values.description?.trim(),
      });

      setRoles(prev => prev.map(r => r.id === editingRole.id ? { ...r, ...values } : r));

      setEditModalVisible(false);

      setSaveDialogSuccessTitle('Role Updated Successfully');
      setSaveDialogResult({
        title: 'Role Details Updated',
        message: `Role "${values.name}" has been updated.`,
        userName: values.name,
        userEmail: `Code: ${editingRole.roleCode}`,
        tags: [{ label: editingRole.roleCode, color: getRoleColor(editingRole.roleCode) }],
      });
      setSaveDialogPhase('success');

      fetchRoles(page);
    } catch (error: any) {
      const val = handleValidationErrors(error, editForm);
      if (val) {
        setSaveDialogError(`Please fill the required field(s):\n\n${val.bulletList}`);
        setSaveDialogPhase('error');
        setSaveDialogVisible(true);
        return;
      }
      setSaveDialogError(formatApiError(error, 'Failed to update role'));
      setSaveDialogPhase('error');
      setSaveDialogVisible(true);
    } finally {
      setModalLoading(false);
    }
  };

  // Assign Permissions with Animated Save Feedback
  const handleAssignPermissions = async () => {
    if (!selectedRole) return;
    try {
      const values = await permForm.validateFields();
      setPermModalLoading(true);
      setSaveDialogLoadingTitle('Assigning Permissions...');
      setSaveDialogLoadingHint(`Updating security matrix for ${selectedRole.name}...`);
      setSaveDialogPhase('loading');
      setSaveDialogVisible(true);
      setSaveDialogRetry(() => () => void handleAssignPermissions());

      await apiService.post(`/admin/roles/${selectedRole.id}/permissions`, {
        permissionIds: values.permissionIds || [],
      });

      const selectedCount = values.permissionIds?.length || 0;

      // Update local state permissions length
      setRoles(prev => prev.map(r => {
        if (r.id === selectedRole.id) {
          const fakePerms = (values.permissionIds || []).map((pid: string) => ({ permissionId: pid }));
          return { ...r, rolePermissions: fakePerms };
        }
        return r;
      }));

      setPermModalVisible(false);

      setSaveDialogSuccessTitle('Permissions Assigned');
      setSaveDialogResult({
        title: 'Permissions Synchronized',
        message: `${selectedCount} permission(s) assigned to "${selectedRole.name}".`,
        userName: selectedRole.name,
        userEmail: `Role Code: ${selectedRole.roleCode}`,
        tags: [{ label: `${selectedCount} Permissions Active`, color: 'purple' }],
      });
      setSaveDialogPhase('success');

      fetchRoles(page);
    } catch (error: any) {
      const val = handleValidationErrors(error, permForm);
      if (val) {
        setSaveDialogErrorTitle('Required Information Missing');
        setSaveDialogError(val.bulletList);
        setSaveDialogPhase('error');
        setSaveDialogVisible(true);
        return;
      }
      setSaveDialogError(formatApiError(error, 'Failed to assign permissions'));
      setSaveDialogPhase('error');
    } finally {
      setPermModalLoading(false);
    }
  };

  // Deactivate Role
  const handleDeactivate = async (role: Role) => {
    try {
      setSaveDialogLoadingTitle('Deactivating Role...');
      setSaveDialogLoadingHint(`Suspending ${role.name}...`);
      setSaveDialogPhase('loading');
      setSaveDialogVisible(true);
      setSaveDialogRetry(() => () => void handleDeactivate(role));

      await apiService.patch(`/admin/roles/${role.id}/deactivate`);
      setRoles(prev => prev.map(r => r.id === role.id ? { ...r, status: 'INACTIVE' } : r));

      setSaveDialogSuccessTitle('Role Deactivated');
      setSaveDialogResult({
        title: 'Role Suspended',
        message: `Role "${role.name}" (${role.roleCode}) has been deactivated.`,
        userName: role.name,
        userEmail: `Code: ${role.roleCode}`,
        tags: [{ label: 'INACTIVE', color: 'red' }],
      });
      setSaveDialogPhase('success');
      fetchRoles(page);
    } catch (error) {
      setSaveDialogError(formatApiError(error, 'Failed to deactivate role'));
      setSaveDialogPhase('error');
    }
  };

  // Activate Role
  const handleActivate = async (role: Role) => {
    try {
      setSaveDialogLoadingTitle('Activating Role...');
      setSaveDialogLoadingHint(`Re-enabling ${role.name}...`);
      setSaveDialogPhase('loading');
      setSaveDialogVisible(true);
      setSaveDialogRetry(() => () => void handleActivate(role));

      await apiService.patch(`/admin/roles/${role.id}/activate`);
      setRoles(prev => prev.map(r => r.id === role.id ? { ...r, status: 'ACTIVE' } : r));

      setSaveDialogSuccessTitle('Role Activated');
      setSaveDialogResult({
        title: 'Role Restored',
        message: `Role "${role.name}" (${role.roleCode}) is now active.`,
        userName: role.name,
        userEmail: `Code: ${role.roleCode}`,
        tags: [{ label: 'ACTIVE', color: 'green' }],
      });
      setSaveDialogPhase('success');
      fetchRoles(page);
    } catch (error) {
      setSaveDialogError(formatApiError(error, 'Failed to activate role'));
      setSaveDialogPhase('error');
    }
  };

  // PDF Export
  const handleExportPdf = async () => {
    try {
      setExportLoading(true);
      const exportList = filteredRoles;

      if (!exportList.length) {
        message.info('No role records found to export.');
        return;
      }

      const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
      doc.setFontSize(16);
      doc.setTextColor(30, 41, 59);
      doc.text('PWI ERP — Role Master Report (2027 Model)', 40, 42);

      doc.setFontSize(9);
      doc.setTextColor(100, 116, 139);
      doc.text(`Generated: ${new Date().toLocaleString()} | Total Roles: ${exportList.length}`, 40, 58);
      doc.text(`Filter Applied: Scope: ${scopeFilter} | Search Query: "${search || 'None'}"`, 40, 70);

      const tableHead = [['#', 'Role Code', 'Role Name', 'Description', 'System Role', 'Permissions', 'Status']];
      const tableBody = exportList.map((r, idx) => [
        String(idx + 1),
        r.roleCode,
        r.name,
        r.description || '-',
        r.isSystemRole ? 'Yes (System)' : 'No (Custom)',
        String(r.rolePermissions?.length || 0),
        r.status || 'ACTIVE',
      ]);

      autoTable(doc, {
        head: tableHead,
        body: tableBody,
        startY: 84,
        styles: { fontSize: 8.5, cellPadding: 6 },
        headStyles: { fillColor: [79, 70, 229], textColor: [255, 255, 255], fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [248, 250, 252] },
      });

      doc.save(`roles-report-2027-${new Date().toISOString().slice(0, 10)}.pdf`);
      message.success('PDF report exported successfully');
    } catch (err) {
      message.error(formatApiError(err, 'Failed to export PDF report'));
    } finally {
      setExportLoading(false);
    }
  };

  // Excel / CSV Export
  const handleExportCsv = async () => {
    try {
      setExportLoading(true);
      const exportList = filteredRoles;

      if (!exportList.length) {
        message.info('No role records found to export.');
        return;
      }

      const headers = ['#', 'Role Code', 'Role Name', 'Description', 'System Role', 'Permissions Count', 'Status'];
      const rows = exportList.map((r, idx) => [
        String(idx + 1),
        `"${(r.roleCode || '').replace(/"/g, '""')}"`,
        `"${(r.name || '').replace(/"/g, '""')}"`,
        `"${(r.description || '').replace(/"/g, '""')}"`,
        r.isSystemRole ? 'System' : 'Custom',
        String(r.rolePermissions?.length || 0),
        `"${r.status || 'ACTIVE'}"`,
      ]);

      const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\r\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `roles-export-2027-${new Date().toISOString().slice(0, 10)}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      message.success('Excel/CSV export downloaded successfully');
    } catch (err) {
      message.error(formatApiError(err, 'Failed to export CSV file'));
    } finally {
      setExportLoading(false);
    }
  };

  // Filtered roles list based on search and scope
  const filteredRoles = useMemo(() => {
    return roles.filter(r => {
      const matchesSearch = !search ||
        r.roleCode?.toLowerCase().includes(search.toLowerCase()) ||
        r.name?.toLowerCase().includes(search.toLowerCase()) ||
        r.description?.toLowerCase().includes(search.toLowerCase());

      const matchesScope =
        scopeFilter === 'ALL' ||
        (scopeFilter === 'SYSTEM' && r.isSystemRole) ||
        (scopeFilter === 'CUSTOM' && !r.isSystemRole);

      return matchesSearch && matchesScope;
    });
  }, [roles, search, scopeFilter]);

  // Grouped and filtered permissions for the permissions assignment modal
  const filteredPermissions = useMemo(() => {
    if (!permSearchQuery.trim()) return permissions;
    const q = permSearchQuery.toLowerCase();
    return permissions.filter(p =>
      p.name?.toLowerCase().includes(q) ||
      p.permissionCode?.toLowerCase().includes(q) ||
      p.module?.toLowerCase().includes(q) ||
      p.resource?.toLowerCase().includes(q)
    );
  }, [permissions, permSearchQuery]);

  const groupedPermissions = useMemo(() => {
    return filteredPermissions.reduce((acc, p) => {
      if (!acc[p.module]) acc[p.module] = [];
      acc[p.module].push(p);
      return acc;
    }, {} as Record<string, Permission[]>);
  }, [filteredPermissions]);

  // Counts for KPI Cards
  const totalRolesCount = roles.length;
  const systemRolesCount = roles.filter(r => r.isSystemRole).length;
  const customRolesCount = roles.filter(r => !r.isSystemRole).length;
  const totalPermissionsCount = permissions.length;

  const exportMenuItems: MenuProps['items'] = [
    {
      key: 'pdf',
      icon: <FilePdfOutlined style={{ color: '#ef4444', fontSize: 16 }} />,
      label: 'Export as PDF Document',
      onClick: handleExportPdf,
    },
    {
      key: 'csv',
      icon: <FileExcelOutlined style={{ color: '#10b981', fontSize: 16 }} />,
      label: 'Export as Excel / CSV',
      onClick: handleExportCsv,
    },
  ];

  // Header Extra Actions Toolbar
  const headerExtra = (
    <Space size={8} wrap>
      {can('admin.roles.create') && (
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={handleOpenCreate}
          className="erp-header-action-btn erp-btn-add-role"
          size="middle"
        >
          Add Role
        </Button>
      )}
      <Dropdown menu={{ items: exportMenuItems }} placement="bottomRight">
        <Button icon={<DownloadOutlined />} loading={exportLoading} className="erp-header-action-btn">
          Export
        </Button>
      </Dropdown>
      <Button
        icon={<ReloadOutlined />}
        onClick={() => { fetchRoles(page); fetchPermissions(); }}
        className="erp-header-action-btn"
      >
        Refresh
      </Button>
    </Space>
  );

  // Table Columns WITH ICONS ON ALL HEADINGS
  const columns: ColumnsType<Role> = [
    {
      title: (
        <Space size={6}>
          <TagOutlined style={{ color: '#4f46e5' }} />
          <span>Role Code</span>
        </Space>
      ),
      dataIndex: 'roleCode',
      key: 'roleCode',
      width: 170,
      sorter: (a, b) => (a.roleCode || '').localeCompare(b.roleCode || ''),
      render: (code: string) => (
        <Tag color={getRoleColor(code)} style={{ fontWeight: 600, fontSize: 12, padding: '2px 8px', borderRadius: 6 }}>
          {code}
        </Tag>
      ),
    },
    {
      title: (
        <Space size={6}>
          <IdcardOutlined style={{ color: '#0ea5e9' }} />
          <span>Role Name</span>
        </Space>
      ),
      dataIndex: 'name',
      key: 'name',
      width: 200,
      sorter: (a, b) => (a.name || '').localeCompare(b.name || ''),
      render: (name: string, record) => (
        <div>
          <div style={{ fontWeight: 600, color: '#1e293b' }}>{name}</div>
          {record.isSystemRole && (
            <span style={{ fontSize: 11, color: '#d97706', display: 'flex', alignItems: 'center', gap: 4 }}>
              <LockOutlined style={{ fontSize: 10 }} /> Core Protected
            </span>
          )}
        </div>
      ),
    },
    {
      title: (
        <Space size={6}>
          <FileTextOutlined style={{ color: '#64748b' }} />
          <span>Description</span>
        </Space>
      ),
      dataIndex: 'description',
      key: 'description',
      ellipsis: true,
      render: (desc: string) => desc ? (
        <Tooltip title={desc}>
          <Text type="secondary" style={{ fontSize: 13 }}>{desc}</Text>
        </Tooltip>
      ) : (
        <Text type="secondary" style={{ fontSize: 12 }}>-</Text>
      ),
    },
    {
      title: (
        <Space size={6}>
          <CrownOutlined style={{ color: '#f59e0b' }} />
          <span>System Role</span>
        </Space>
      ),
      key: 'isSystemRole',
      width: 140,
      filters: [
        { text: 'System Roles', value: true },
        { text: 'Custom Roles', value: false },
      ],
      onFilter: (value, record) => record.isSystemRole === value,
      render: (_, r) => r.isSystemRole ? (
        <Tag color="gold" icon={<LockOutlined />} style={{ fontWeight: 600 }}>System</Tag>
      ) : (
        <Tag color="default" icon={<ApartmentOutlined />}>Custom</Tag>
      ),
    },
    {
      title: (
        <Space size={6}>
          <KeyOutlined style={{ color: '#7c3aed' }} />
          <span>Permissions</span>
        </Space>
      ),
      key: 'perms',
      width: 130,
      sorter: (a, b) => (a.rolePermissions?.length || 0) - (b.rolePermissions?.length || 0),
      render: (_, r) => {
        const count = r.rolePermissions?.length || 0;
        return (
          <Tag color={count > 0 ? 'purple' : 'default'} style={{ fontWeight: 600, borderRadius: 10 }}>
            {count} perms
          </Tag>
        );
      },
    },
    {
      title: (
        <Space size={6}>
          <CheckCircleOutlined style={{ color: '#22c55e' }} />
          <span>Status</span>
        </Space>
      ),
      dataIndex: 'status',
      key: 'status',
      width: 120,
      filters: [
        { text: 'Active', value: 'ACTIVE' },
        { text: 'Inactive', value: 'INACTIVE' },
      ],
      onFilter: (value, record) => record.status === value,
      render: (s: string) => (
        <Badge
          status={s === 'ACTIVE' ? 'success' : 'error'}
          text={<Text style={{ fontSize: 12, fontWeight: 500 }}>{s || 'ACTIVE'}</Text>}
        />
      ),
    },
    {
      title: (
        <Space size={6}>
          <SettingOutlined style={{ color: '#64748b' }} />
          <span>Actions</span>
        </Space>
      ),
      key: 'actions',
      width: 210,
      fixed: 'right',
      render: (_, record) => (
        <Space size="small">
          {can('admin.roles.update') && (
            <Tooltip title="Edit Role Details">
              <Button
                type="text"
                size="small"
                icon={<EditOutlined style={{ color: '#6366f1' }} />}
                onClick={() => handleOpenEdit(record)}
              />
            </Tooltip>
          )}
          {can('admin.roles.assign_permissions') && (
            <Tooltip title="Manage Security Permissions">
              <Button
                type="link"
                size="small"
                icon={<KeyOutlined style={{ color: '#7c3aed' }} />}
                onClick={() => handleOpenPermissions(record)}
              >
                Permissions
              </Button>
            </Tooltip>
          )}
          {can('admin.roles.deactivate') && !record.isSystemRole && (
            record.status === 'ACTIVE' ? (
              <Popconfirm
                title="Deactivate Role"
                description={`Are you sure you want to deactivate "${record.name}"? Users with this role may lose permissions.`}
                onConfirm={() => handleDeactivate(record)}
                okText="Deactivate"
                okButtonProps={{ danger: true }}
              >
                <Tooltip title="Deactivate Role">
                  <Button type="text" danger size="small" icon={<CloseCircleOutlined />} />
                </Tooltip>
              </Popconfirm>
            ) : (
              <Tooltip title="Reactivate Role">
                <Button
                  type="text"
                  size="small"
                  icon={<CheckCircleOutlined style={{ color: '#16a34a' }} />}
                  onClick={() => handleActivate(record)}
                />
              </Tooltip>
            )
          )}
        </Space>
      ),
    },
  ];

  return (
    <div className="role-management-container">
      {/* Registers Page Title and Actions into Shared Application Main Header */}
      <PageHeader
        icon={<SafetyCertificateOutlined style={{ color: '#4f46e5' }} />}
        title="Roles"
        subtitle="2027 Model • Enterprise Role-Based Access Control & Permissions Matrix"
        extra={headerExtra}
      />

      {/* 4 Crystal KPI Cards */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={12} lg={6}>
          <div className="crystal-card">
            <div className="crystal-card-content">
              <div className="crystal-card-info">
                <span className="crystal-card-title">Total Roles</span>
                <span className="crystal-card-value">{totalRolesCount}</span>
                <span className="crystal-card-badge" style={{ color: '#4f46e5' }}>
                  <Badge status="processing" /> 2027 Model Registry
                </span>
              </div>
              <div className="crystal-card-icon crystal-icon-primary">
                <SafetyCertificateOutlined />
              </div>
            </div>
          </div>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <div className="crystal-card">
            <div className="crystal-card-content">
              <div className="crystal-card-info">
                <span className="crystal-card-title">System Roles</span>
                <span className="crystal-card-value" style={{ color: '#d97706' }}>{systemRolesCount}</span>
                <span className="crystal-card-badge" style={{ color: '#d97706' }}>
                  <LockOutlined /> Built-in Core Protected
                </span>
              </div>
              <div className="crystal-card-icon crystal-icon-warning">
                <CrownOutlined />
              </div>
            </div>
          </div>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <div className="crystal-card">
            <div className="crystal-card-content">
              <div className="crystal-card-info">
                <span className="crystal-card-title">Custom Roles</span>
                <span className="crystal-card-value" style={{ color: '#059669' }}>{customRolesCount}</span>
                <span className="crystal-card-badge" style={{ color: '#059669' }}>
                  <ApartmentOutlined /> Operational Department Roles
                </span>
              </div>
              <div className="crystal-card-icon crystal-icon-success">
                <TeamOutlined />
              </div>
            </div>
          </div>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <div className="crystal-card">
            <div className="crystal-card-content">
              <div className="crystal-card-info">
                <span className="crystal-card-title">Permissions Pool</span>
                <span className="crystal-card-value" style={{ color: '#7c3aed' }}>{totalPermissionsCount}</span>
                <span className="crystal-card-badge" style={{ color: '#7c3aed' }}>
                  <KeyOutlined /> RBAC Security Matrix Active
                </span>
              </div>
              <div className="crystal-card-icon crystal-icon-purple">
                <KeyOutlined />
              </div>
            </div>
          </div>
        </Col>
      </Row>

      {/* Main Table Card */}
      <Card
        style={{
          borderRadius: 16,
          border: '1px solid rgba(226, 232, 240, 0.8)',
          boxShadow: '0 4px 20px -2px rgba(15, 23, 42, 0.05)',
        }}
        title={
          <Space>
            <SafetyCertificateOutlined style={{ color: '#4f46e5' }} />
            <span>Role Management</span>
            <span className="role-model-badge">2027 Model</span>
          </Space>
        }
      >
        <Row style={{ marginBottom: 16 }} justify="space-between" align="middle" gutter={[12, 12]}>
          <Col xs={24} sm={16} md={12}>
            <Space style={{ width: '100%' }} wrap>
              <Input
                placeholder="Search roles by code, name, description..."
                prefix={<SearchOutlined />}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{ width: 300 }}
                allowClear
              />
              <Dropdown
                menu={{
                  items: [
                    { key: 'ALL', label: 'All Roles', onClick: () => setScopeFilter('ALL') },
                    { key: 'SYSTEM', label: 'System Roles Only', onClick: () => setScopeFilter('SYSTEM') },
                    { key: 'CUSTOM', label: 'Custom Roles Only', onClick: () => setScopeFilter('CUSTOM') },
                  ],
                }}
              >
                <Button>
                  Filter: {scopeFilter === 'ALL' ? 'All Roles' : scopeFilter === 'SYSTEM' ? 'System Roles' : 'Custom Roles'}
                </Button>
              </Dropdown>
            </Space>
          </Col>
          <Col xs={24} sm={8} md={12} style={{ textAlign: 'right' }}>
            <Text type="secondary" style={{ fontSize: 13 }}>
              Showing {filteredRoles.length} of {roles.length} registered roles
            </Text>
          </Col>
        </Row>

        <Table
          columns={columns}
          dataSource={filteredRoles}
          rowKey="id"
          loading={loading}
          scroll={{ x: 950 }}
          pagination={{
            current: page,
            total: filteredRoles.length,
            pageSize: 20,
            onChange: setPage,
            showSizeChanger: false,
            showTotal: (t) => `Total ${t} role(s)`,
          }}
          locale={{ emptyText: <Empty description="No roles found matching criteria" /> }}
        />
      </Card>

      {/* Create Role Modal (Draggable, Resizable & Split View: Form on Left, Live View on Right) */}
      <DraggableResizableModal
        title={
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
            <Space>
              <SafetyCertificateOutlined style={{ color: '#4f46e5', fontSize: 16 }} />
              <span style={{ fontWeight: 600 }}>Create New Role — Split View</span>
            </Space>
            <div className="modal-header-window-controls" style={{ display: 'flex', gap: 6 }}>
              <span
                style={{ cursor: 'pointer', padding: '2px 6px', borderRadius: 4 }}
                title="Minimize to Dock"
                onClick={(e) => {
                  e.stopPropagation();
                  setCreateModalVisible(false);
                  setIsCreateMinimized(true);
                }}
              >
                <MinusOutlined />
              </span>
            </div>
          </div>
        }
        open={createModalVisible}
        onOk={handleCreateSubmit}
        onCancel={() => {
          setCreateModalVisible(false);
          setIsCreateMinimized(false);
        }}
        okText="Create Role"
        confirmLoading={modalLoading}
        width={920}
        height={560}
        destroyOnHidden
      >
        <div className="role-modal-split-container">
          <div className="role-modal-form-col">
            <Form form={form} layout="vertical">
              <Form.Item
                name="roleCode"
                label="Role Code (Unique Identifier)"
                rules={[
                  { required: true, message: 'Role code is required' },
                  { pattern: /^[A-Z0-9_]+$/, message: 'Must be uppercase alphanumeric with underscores (e.g. OPERATIONS_LEAD)' },
                ]}
                tooltip="Unique uppercase machine identifier for this role"
              >
                <Input
                  placeholder="e.g. OPERATIONS_LEAD"
                  size="large"
                  onChange={(e) => {
                    form.setFieldsValue({ roleCode: e.target.value.toUpperCase() });
                  }}
                  prefix={<TagOutlined style={{ color: '#4f46e5' }} />}
                />
              </Form.Item>

              <Form.Item
                name="name"
                label="Role Name"
                rules={[{ required: true, message: 'Role name is required' }]}
              >
                <Input placeholder="e.g. Operations Lead" size="large" prefix={<IdcardOutlined style={{ color: '#0ea5e9' }} />} />
              </Form.Item>

              <Form.Item
                name="description"
                label="Role Description"
                rules={[{ required: true, message: 'Please provide a description of this role' }]}
              >
                <Input.TextArea
                  rows={4}
                  placeholder="Describe the responsibilities and scope of access for this role..."
                  showCount
                  maxLength={300}
                />
              </Form.Item>
            </Form>
          </div>

          <div className="role-modal-preview-col">
            <div className="role-live-preview-card" data-testid="create-role-live-preview">
              <div className="role-preview-header-badge">
                <EyeOutlined /> Live View Form
              </div>

              <div className="role-preview-badge-wrapper">
                <Tag
                  color={getRoleColor(createCode || 'ROLE_PREVIEW')}
                  style={{ fontSize: 13, padding: '4px 12px', borderRadius: 20, fontWeight: 700 }}
                >
                  {createCode || 'ROLE_CODE'}
                </Tag>
              </div>

              <div className="role-preview-name">{createName || 'New Role Name'}</div>
              <div className="role-preview-code">ID: {createCode ? createCode.toLowerCase() : 'custom_role'}</div>

              <div className="role-preview-desc">
                {createDesc || 'Provide a description on the left to preview the role summary here in real time.'}
              </div>

              <div className="role-preview-details-grid">
                <div className="role-preview-detail-row">
                  <span className="role-preview-detail-label">Scope:</span>
                  <span className="role-preview-detail-value">
                    <Tag color="cyan">Custom Operational</Tag>
                  </span>
                </div>
                <div className="role-preview-detail-row">
                  <span className="role-preview-detail-label">Status:</span>
                  <span className="role-preview-detail-value">
                    <Badge status="success" text="ACTIVE" />
                  </span>
                </div>
                <div className="role-preview-detail-row">
                  <span className="role-preview-detail-label">Permissions:</span>
                  <span className="role-preview-detail-value">0 configured</span>
                </div>
                <div className="role-preview-detail-row">
                  <span className="role-preview-detail-label">Architecture:</span>
                  <span className="role-preview-detail-value">2027 Model RBAC</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </DraggableResizableModal>

      {/* Edit Role Modal (Draggable, Resizable & Split View) */}
      <DraggableResizableModal
        title={
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
            <Space>
              <EditOutlined style={{ color: '#6366f1', fontSize: 16 }} />
              <span style={{ fontWeight: 600 }}>Edit Role — {editingRole?.name}</span>
            </Space>
            <div className="modal-header-window-controls" style={{ display: 'flex', gap: 6 }}>
              <span
                style={{ cursor: 'pointer', padding: '2px 6px', borderRadius: 4 }}
                title="Minimize to Dock"
                onClick={(e) => {
                  e.stopPropagation();
                  setEditModalVisible(false);
                  setIsEditMinimized(true);
                }}
              >
                <MinusOutlined />
              </span>
            </div>
          </div>
        }
        open={editModalVisible}
        onOk={handleEditSubmit}
        onCancel={() => {
          setEditModalVisible(false);
          setIsEditMinimized(false);
        }}
        okText="Save Changes"
        confirmLoading={modalLoading}
        width={920}
        height={560}
        destroyOnHidden
      >
        <div className="role-modal-split-container">
          <div className="role-modal-form-col">
            <Form form={editForm} layout="vertical">
              <Form.Item
                name="roleCode"
                label="Role Code (Immutable)"
                tooltip="Role code cannot be modified once created"
              >
                <Input disabled prefix={<TagOutlined />} size="large" />
              </Form.Item>

              <Form.Item
                name="name"
                label="Role Name"
                rules={[{ required: true, message: 'Role name is required' }]}
              >
                <Input size="large" prefix={<IdcardOutlined style={{ color: '#0ea5e9' }} />} />
              </Form.Item>

              <Form.Item
                name="description"
                label="Role Description"
                rules={[{ required: true, message: 'Please provide a description' }]}
              >
                <Input.TextArea rows={4} showCount maxLength={300} />
              </Form.Item>
            </Form>
          </div>

          <div className="role-modal-preview-col">
            <div className="role-live-preview-card" data-testid="edit-role-live-preview">
              <div className="role-preview-header-badge">
                <EyeOutlined /> Live View Form
              </div>

              <div className="role-preview-badge-wrapper">
                <Tag
                  color={getRoleColor(editingRole?.roleCode)}
                  style={{ fontSize: 13, padding: '4px 12px', borderRadius: 20, fontWeight: 700 }}
                >
                  {editingRole?.roleCode}
                </Tag>
              </div>

              <div className="role-preview-name">{editName || editingRole?.name}</div>
              <div className="role-preview-code">ID: {editingRole?.id}</div>

              <div className="role-preview-desc">
                {editDesc || editingRole?.description || 'No description provided'}
              </div>

              <div className="role-preview-details-grid">
                <div className="role-preview-detail-row">
                  <span className="role-preview-detail-label">System Role:</span>
                  <span className="role-preview-detail-value">
                    {editingRole?.isSystemRole ? <Tag color="gold">System Core</Tag> : <Tag color="blue">Custom</Tag>}
                  </span>
                </div>
                <div className="role-preview-detail-row">
                  <span className="role-preview-detail-label">Current Status:</span>
                  <span className="role-preview-detail-value">
                    <Badge status={editingRole?.status === 'ACTIVE' ? 'success' : 'error'} text={editingRole?.status || 'ACTIVE'} />
                  </span>
                </div>
                <div className="role-preview-detail-row">
                  <span className="role-preview-detail-label">Assigned Perms:</span>
                  <span className="role-preview-detail-value">
                    {editingRole?.rolePermissions?.length || 0} active
                  </span>
                </div>
                <div className="role-preview-detail-row">
                  <span className="role-preview-detail-label">Architecture:</span>
                  <span className="role-preview-detail-value">2027 Model RBAC</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </DraggableResizableModal>

      {/* Permissions Assignment Modal (Draggable, Search Filter & Select All support) */}
      <DraggableResizableModal
        title={
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
            <Space>
              <KeyOutlined style={{ color: '#7c3aed', fontSize: 16 }} />
              <span style={{ fontWeight: 600 }}>Assign Permissions — {selectedRole?.name}</span>
              <Tag color="purple">{selectedRole?.roleCode}</Tag>
            </Space>
            <div className="modal-header-window-controls" style={{ display: 'flex', gap: 6 }}>
              <span
                style={{ cursor: 'pointer', padding: '2px 6px', borderRadius: 4 }}
                title="Minimize to Dock"
                onClick={(e) => {
                  e.stopPropagation();
                  setPermModalVisible(false);
                  setIsPermMinimized(true);
                }}
              >
                <MinusOutlined />
              </span>
            </div>
          </div>
        }
        open={permModalVisible}
        onOk={handleAssignPermissions}
        onCancel={() => {
          setPermModalVisible(false);
          setIsPermMinimized(false);
        }}
        okText="Save Permissions"
        confirmLoading={permModalLoading}
        width={880}
        height={620}
        destroyOnHidden
      >
        <div style={{ marginBottom: 16, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <Input
            placeholder="Search permissions by name, code, or module..."
            prefix={<SearchOutlined />}
            value={permSearchQuery}
            onChange={(e) => setPermSearchQuery(e.target.value)}
            style={{ width: 320 }}
            allowClear
          />
          <Space>
            <Button
              size="small"
              onClick={() => {
                const allIds = permissions.map(p => p.id);
                permForm.setFieldsValue({ permissionIds: allIds });
              }}
            >
              Select All ({permissions.length})
            </Button>
            <Button
              size="small"
              onClick={() => {
                permForm.setFieldsValue({ permissionIds: [] });
              }}
            >
              Clear All
            </Button>
          </Space>
        </div>

        <Form form={permForm} layout="vertical">
          <Form.Item name="permissionIds">
            <Checkbox.Group style={{ width: '100%' }}>
              <div style={{ maxHeight: 420, overflowY: 'auto', paddingRight: 8 }}>
                {Object.keys(groupedPermissions).length === 0 ? (
                  <Empty description="No permissions match your search query" />
                ) : (
                  Object.entries(groupedPermissions).map(([module, perms]) => (
                    <div
                      key={module}
                      style={{
                        marginBottom: 16,
                        background: 'rgba(248, 250, 252, 0.7)',
                        border: '1px solid #e2e8f0',
                        borderRadius: 10,
                        padding: '12px 16px',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          marginBottom: 8,
                          borderBottom: '1px solid #e2e8f0',
                          paddingBottom: 6,
                        }}
                      >
                        <Space>
                          <strong style={{ textTransform: 'capitalize', color: '#1e293b', fontSize: 14 }}>
                            {module}
                          </strong>
                          <Badge count={perms.length} style={{ backgroundColor: '#6366f1' }} />
                        </Space>
                        <Button
                          type="link"
                          size="small"
                          onClick={() => {
                            const current = permForm.getFieldValue('permissionIds') || [];
                            const moduleIds = perms.map(p => p.id);
                            const allInModule = moduleIds.every(id => current.includes(id));
                            if (allInModule) {
                              permForm.setFieldsValue({
                                permissionIds: current.filter((id: string) => !moduleIds.includes(id)),
                              });
                            } else {
                              const merged = Array.from(new Set([...current, ...moduleIds]));
                              permForm.setFieldsValue({ permissionIds: merged });
                            }
                          }}
                        >
                          Toggle Module
                        </Button>
                      </div>
                      <Row gutter={[12, 8]}>
                        {perms.map(p => (
                          <Col xs={24} sm={12} key={p.id}>
                            <Checkbox value={p.id} style={{ fontSize: 13 }}>
                              <span style={{ fontWeight: 600, color: '#334155' }}>{p.permissionCode}</span>
                              <div style={{ fontSize: 11, color: '#64748b' }}>{p.name}</div>
                            </Checkbox>
                          </Col>
                        ))}
                      </Row>
                    </div>
                  ))
                )}
              </div>
            </Checkbox.Group>
          </Form.Item>
        </Form>
      </DraggableResizableModal>

      {/* Minimized Window Floating Dock */}
      {(isCreateMinimized || isEditMinimized || isPermMinimized) && (
        <div className="role-modal-minimized-dock" data-testid="role-minimized-dock">
          {isCreateMinimized && (
            <div
              className="minimized-role-tab"
              onClick={() => {
                setIsCreateMinimized(false);
                setCreateModalVisible(true);
              }}
              title="Click to restore Create Role form"
            >
              <span className="minimized-role-pulse" />
              <SafetyCertificateOutlined style={{ color: '#4f46e5' }} />
              <span>Add Role Form</span>
              <span
                className="minimized-role-close"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsCreateMinimized(false);
                }}
                title="Discard"
              >
                <CloseOutlined />
              </span>
            </div>
          )}
          {isEditMinimized && editingRole && (
            <div
              className="minimized-role-tab"
              onClick={() => {
                setIsEditMinimized(false);
                setEditModalVisible(true);
              }}
              title={`Click to restore Edit Role for ${editingRole.name}`}
            >
              <span className="minimized-role-pulse" />
              <EditOutlined style={{ color: '#6366f1' }} />
              <span>Edit: {editingRole.name}</span>
              <span
                className="minimized-role-close"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsEditMinimized(false);
                }}
                title="Discard"
              >
                <CloseOutlined />
              </span>
            </div>
          )}
          {isPermMinimized && selectedRole && (
            <div
              className="minimized-role-tab"
              onClick={() => {
                setIsPermMinimized(false);
                setPermModalVisible(true);
              }}
              title={`Click to restore Permissions for ${selectedRole.name}`}
            >
              <span className="minimized-role-pulse" />
              <KeyOutlined style={{ color: '#7c3aed' }} />
              <span>Perms: {selectedRole.name}</span>
              <span
                className="minimized-role-close"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsPermMinimized(false);
                }}
                title="Discard"
              >
                <CloseOutlined />
              </span>
            </div>
          )}
        </div>
      )}

      {/* Animated Save Result Feedback Dialog */}
      <SaveResultDialog
        open={saveDialogVisible}
        phase={saveDialogPhase}
        result={saveDialogResult}
        errorTitle={saveDialogErrorTitle}
        errorLead={saveDialogErrorLead}
        errorMessage={saveDialogError}
        successTitle={saveDialogSuccessTitle}
        loadingTitle={saveDialogLoadingTitle}
        loadingHint={saveDialogLoadingHint}
        onRetry={saveDialogRetry}
        onClose={() => setSaveDialogVisible(false)}
      />
    </div>
  );
};

export default RoleManagement;
