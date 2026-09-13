import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Table, Button, Space, Tag, Modal, Form, Input, Select, App,
  Popconfirm, Card, Row, Col, Divider, Typography, Badge, Tooltip,
  Empty, Dropdown, message as staticMessage,
} from 'antd';
import type { MenuProps } from 'antd';
import {
  PlusOutlined, EditOutlined, CheckCircleOutlined, CloseCircleOutlined,
  KeyOutlined, EyeInvisibleOutlined, EyeTwoTone, UserOutlined,
  SearchOutlined, ReloadOutlined, TeamOutlined,
  SafetyCertificateOutlined, ExclamationCircleOutlined,
  MailOutlined, PhoneOutlined, IdcardOutlined, FormOutlined,
  CameraOutlined, DeleteOutlined, DownloadOutlined,
  FilePdfOutlined, FileExcelOutlined, UploadOutlined,
  MinusOutlined, EyeOutlined, CloseOutlined, UserAddOutlined,
  ClockCircleOutlined, SettingOutlined, TagOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import apiService from '../../services/api';
import { usePermission } from '../../hooks/usePermission';
import { PageHeader, SaveResultDialog, DraggableResizableModal } from '../../components/shared';
import type { SaveResultData, SaveResultPhase } from '../../components/shared/SaveResultDialog';
import UserAvatar, { resolveSrc } from '../../components/layout/UserAvatar';
import { useUserStore } from '../../store/userStore';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import './userManagement.css';

const { Text } = Typography;

export interface ErpUser {
  id: string;
  authUserId: string;
  displayName: string;
  email: string;
  phone: string;
  avatarUrl?: string | null;
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
  const app = App.useApp();
  const message = app?.message || staticMessage;
  const [users, setUsers] = useState<ErpUser[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string | undefined>(undefined);
  const [exportLoading, setExportLoading] = useState(false);

  // Modals visibility
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [viewModalVisible, setViewModalVisible] = useState(false);
  const [roleModalVisible, setRoleModalVisible] = useState(false);
  const [resetModalVisible, setResetModalVisible] = useState(false);
  const [avatarModalVisible, setAvatarModalVisible] = useState(false);

  // Minimized Window Tabs Dock state (Multi-tasking like browser tabs)
  const [isCreateMinimized, setIsCreateMinimized] = useState(false);
  const [isEditMinimized, setIsEditMinimized] = useState(false);
  const [isViewMinimized, setIsViewMinimized] = useState(false);

  // Loading states
  const [createLoading, setCreateLoading] = useState(false);
  const [editLoading, setEditLoading] = useState(false);
  const [roleLoading, setRoleLoading] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [avatarLoading, setAvatarLoading] = useState(false);

  // Selected records
  const [selectedUser, setSelectedUser] = useState<ErpUser | null>(null);
  const [viewUser, setViewUser] = useState<ErpUser | null>(null);
  const [resetUser, setResetUser] = useState<ErpUser | null>(null);
  const [avatarUser, setAvatarUser] = useState<ErpUser | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Save feedback dialog state (Spinner -> Animated Green Checkmark -> Details -> Error)
  const [saveDialogVisible, setSaveDialogVisible] = useState(false);
  const [saveDialogPhase, setSaveDialogPhase] = useState<SaveResultPhase>('loading');
  const [saveDialogResult, setSaveDialogResult] = useState<SaveResultData | null>(null);
  const [saveDialogError, setSaveDialogError] = useState<string | undefined>(undefined);
  const [saveDialogSuccessTitle, setSaveDialogSuccessTitle] = useState<string>('Saved Successfully');
  const [saveDialogLoadingTitle, setSaveDialogLoadingTitle] = useState<string>('Saving...');
  const [saveDialogLoadingHint, setSaveDialogLoadingHint] = useState<string>('Processing request...');
  const [saveDialogRetry, setSaveDialogRetry] = useState<(() => void) | undefined>(undefined);

  // Forms
  const [createForm] = Form.useForm();
  const [editForm] = Form.useForm();
  const [roleForm] = Form.useForm();
  const [resetForm] = Form.useForm();
  const { can } = usePermission();

  // Real-time live form watchers for Add User preview card
  const createDisplayName = Form.useWatch('displayName', createForm);
  const createUsername = Form.useWatch('username', createForm);
  const createEmail = Form.useWatch('email', createForm);
  const createPhone = Form.useWatch('phone', createForm);
  const createEmployeeId = Form.useWatch('employeeId', createForm);
  const createRoleIds = Form.useWatch('roleIds', createForm);

  // Real-time live form watchers for Edit User preview card
  const editDisplayName = Form.useWatch('displayName', editForm);
  const editUsername = Form.useWatch('username', editForm);
  const editFirstName = Form.useWatch('firstName', editForm);
  const editLastName = Form.useWatch('lastName', editForm);
  const editPhone = Form.useWatch('phone', editForm);
  const editEmployeeId = Form.useWatch('employeeId', editForm);

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
  }, [message]);

  const fetchRoles = useCallback(async () => {
    try {
      const response = await apiService.get<{ data: Role[] }>('/admin/roles', { limit: 100 });
      setRoles(response.data);
    } catch (error) {
      message.error(formatApiError(error, 'Failed to fetch roles'));
    }
  }, [message]);

  useEffect(() => {
    fetchUsers(page, search || undefined, statusFilter);
    fetchRoles();
  }, [page, search, fetchUsers, fetchRoles, statusFilter]);

  const handleSearch = (value: string) => {
    setSearch(value);
    setPage(1);
  };

  const openCreateModal = () => {
    createForm.resetFields();
    setIsCreateMinimized(false);
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
    setIsEditMinimized(false);
    setEditModalVisible(true);
  };

  const openViewModal = (record: ErpUser) => {
    setViewUser(record);
    setIsViewMinimized(false);
    setViewModalVisible(true);
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

  const openAvatarModal = (user: ErpUser) => {
    setAvatarUser(user);
    setAvatarPreview(user.avatarUrl ? resolveSrc(user.avatarUrl) || user.avatarUrl : null);
    setAvatarFile(null);
    setAvatarModalVisible(true);
  };

  const handleAvatarFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      message.error('Invalid image type. Please choose a JPG, PNG, or WebP file.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      message.error('File size exceeds 5MB limit.');
      return;
    }

    try {
      const reader = new FileReader();
      reader.onload = () => {
        setAvatarPreview(String(reader.result));
        setAvatarFile(file);
      };
      reader.readAsDataURL(file);
    } catch {
      message.error('Could not load image file.');
    }
  };

  const handleSaveAvatar = async () => {
    if (!avatarUser) return;
    if (!avatarFile || !avatarPreview) {
      message.info('Please select an image first.');
      return;
    }

    try {
      setAvatarLoading(true);
      setSaveDialogLoadingTitle('Saving Photo...');
      setSaveDialogLoadingHint(`Uploading and optimizing avatar for ${avatarUser.displayName}...`);
      setSaveDialogPhase('loading');
      setSaveDialogVisible(true);
      setSaveDialogRetry(() => () => void handleSaveAvatar());

      const base64 = avatarPreview.replace(/^data:image\/[^;]+;base64,/, '');
      const response = await apiService.post<{ data: ErpUser; message?: string }>(`/admin/users/${avatarUser.id}/avatar`, {
        data: base64,
        mime: avatarFile.type,
      });

      const updatedAvatarUrl = response.data?.avatarUrl || avatarPreview;
      setUsers(prev => prev.map(u => u.id === avatarUser.id ? { ...u, avatarUrl: updatedAvatarUrl } : u));

      // If updating the active logged-in user, sync userStore
      const currentUser = useUserStore.getState().user;
      if (currentUser && currentUser.id === avatarUser.id) {
        useUserStore.getState().updateUser({ avatarUrl: updatedAvatarUrl });
      }

      setAvatarModalVisible(false);
      setAvatarFile(null);

      setSaveDialogSuccessTitle('Photo Saved Successfully');
      setSaveDialogResult({
        title: 'Avatar Photo Updated',
        message: `Profile picture updated for ${avatarUser.displayName}.`,
        userName: avatarUser.displayName,
        userEmail: avatarUser.email,
        avatarUrl: updatedAvatarUrl,
      });
      setSaveDialogPhase('success');
    } catch (error: any) {
      setSaveDialogError(formatApiError(error, 'Failed to update photo'));
      setSaveDialogPhase('error');
    } finally {
      setAvatarLoading(false);
    }
  };

  const handleRemoveAvatar = async () => {
    if (!avatarUser) return;
    try {
      setAvatarLoading(true);
      setSaveDialogLoadingTitle('Removing Photo...');
      setSaveDialogLoadingHint(`Removing avatar photo for ${avatarUser.displayName}...`);
      setSaveDialogPhase('loading');
      setSaveDialogVisible(true);
      setSaveDialogRetry(() => () => void handleRemoveAvatar());

      await apiService.delete(`/admin/users/${avatarUser.id}/avatar`);

      setUsers(prev => prev.map(u => u.id === avatarUser.id ? { ...u, avatarUrl: null } : u));
      const currentUser = useUserStore.getState().user;
      if (currentUser && currentUser.id === avatarUser.id) {
        useUserStore.getState().updateUser({ avatarUrl: null });
      }

      setAvatarPreview(null);
      setAvatarFile(null);
      setAvatarModalVisible(false);

      setSaveDialogSuccessTitle('Photo Removed Successfully');
      setSaveDialogResult({
        title: 'Avatar Photo Removed',
        message: `Profile picture removed for ${avatarUser.displayName}. Default initials will now be displayed.`,
        userName: avatarUser.displayName,
        userEmail: avatarUser.email,
        avatarUrl: null,
      });
      setSaveDialogPhase('success');
    } catch (error: any) {
      setSaveDialogError(formatApiError(error, 'Failed to remove photo'));
      setSaveDialogPhase('error');
    } finally {
      setAvatarLoading(false);
    }
  };

  const handleCreate = async () => {
    try {
      const values = await createForm.validateFields();
      setCreateLoading(true);
      setSaveDialogLoadingTitle('Creating User...');
      setSaveDialogLoadingHint(`Provisioning account and permissions for ${values.displayName}...`);
      setSaveDialogPhase('loading');
      setSaveDialogVisible(true);
      setSaveDialogRetry(() => () => void handleCreate());

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

      const assignedRoles = roles.filter(r => (values.roleIds || []).includes(r.id));

      setCreateModalVisible(false);
      createForm.resetFields();

      setSaveDialogSuccessTitle('User Created Successfully');
      setSaveDialogResult({
        title: 'New Account Provisioned',
        message: `User ${values.displayName} (${values.email}) has been created successfully.`,
        userName: values.displayName,
        userEmail: values.email,
        tags: assignedRoles.map(r => ({ label: r.roleCode, color: ROLE_COLORS[r.roleCode] || 'blue' })),
      });
      setSaveDialogPhase('success');

      fetchUsers(page, search || undefined, statusFilter);
    } catch (error: any) {
      if (error.errorFields) return;
      setSaveDialogError(formatApiError(error, 'Failed to create user'));
      setSaveDialogPhase('error');
    } finally {
      setCreateLoading(false);
    }
  };

  const handleEdit = async () => {
    try {
      const values = await editForm.validateFields();
      if (selectedUser) {
        setEditLoading(true);
        setSaveDialogLoadingTitle('Saving Profile...');
        setSaveDialogLoadingHint(`Saving profile updates for ${selectedUser.displayName}...`);
        setSaveDialogPhase('loading');
        setSaveDialogVisible(true);
        setSaveDialogRetry(() => () => void handleEdit());

        await apiService.patch(`/admin/users/${selectedUser.id}`, values);

        const updatedName = values.displayName || selectedUser.displayName;
        setUsers(prev => prev.map(u => u.id === selectedUser.id ? { ...u, ...values, displayName: updatedName } : u));

        setEditModalVisible(false);

        setSaveDialogSuccessTitle('User Updated Successfully');
        setSaveDialogResult({
          title: 'Profile Saved',
          message: `Profile details for ${updatedName} have been updated.`,
          userName: updatedName,
          userEmail: selectedUser.email,
          avatarUrl: selectedUser.avatarUrl,
          tags: selectedUser.userRoles?.map(ur => ur.role?.roleCode).filter(Boolean) as string[],
        });
        setSaveDialogPhase('success');

        fetchUsers(page, search || undefined, statusFilter);
      }
    } catch (error: any) {
      if (error.errorFields) return;
      setSaveDialogError(formatApiError(error, 'Failed to update user'));
      setSaveDialogPhase('error');
    } finally {
      setEditLoading(false);
    }
  };

  const handleAssignRoles = async () => {
    try {
      const values = await roleForm.validateFields();
      if (selectedUser) {
        setRoleLoading(true);
        setSaveDialogLoadingTitle('Saving Roles...');
        setSaveDialogLoadingHint(`Synchronizing role permissions for ${selectedUser.displayName}...`);
        setSaveDialogPhase('loading');
        setSaveDialogVisible(true);
        setSaveDialogRetry(() => () => void handleAssignRoles());

        await apiService.post(`/admin/users/${selectedUser.id}/roles`, { roleIds: values.roleIds || [] });

        // Immediately reflect role changes in UI state
        const targetRoles = roles.filter(r => (values.roleIds || []).includes(r.id));
        setUsers(prev => prev.map(u => {
          if (u.id === selectedUser.id) {
            return {
              ...u,
              userRoles: targetRoles.map(r => ({
                id: `ur-${r.id}`,
                roleId: r.id,
                role: r,
              })),
            };
          }
          return u;
        }));

        setRoleModalVisible(false);

        setSaveDialogSuccessTitle('Roles Updated Successfully');
        setSaveDialogResult({
          title: 'Roles Synchronized',
          message: `Updated permissions for ${selectedUser.displayName} (${selectedUser.email})`,
          userName: selectedUser.displayName,
          userEmail: selectedUser.email,
          avatarUrl: selectedUser.avatarUrl,
          tags: targetRoles.map(r => ({ label: r.roleCode, color: ROLE_COLORS[r.roleCode] || 'blue' })),
        });
        setSaveDialogPhase('success');

        fetchUsers(page, search || undefined, statusFilter);
      }
    } catch (error: any) {
      if (error.errorFields) return;
      setSaveDialogError(formatApiError(error, 'Failed to update roles'));
      setSaveDialogPhase('error');
    } finally {
      setRoleLoading(false);
    }
  };

  const handleResetPassword = async () => {
    try {
      const values = await resetForm.validateFields();
      if (resetUser) {
        setResetLoading(true);
        setSaveDialogLoadingTitle('Resetting Password...');
        setSaveDialogLoadingHint(`Applying new security credentials for ${resetUser.email}...`);
        setSaveDialogPhase('loading');
        setSaveDialogVisible(true);
        setSaveDialogRetry(() => () => void handleResetPassword());

        await apiService.post(`/admin/users/${resetUser.id}/reset-password`, {
          newPassword: values.newPassword,
        });

        setResetModalVisible(false);
        resetForm.resetFields();

        setSaveDialogSuccessTitle('Password Reset Successfully');
        setSaveDialogResult({
          title: 'Security Credentials Updated',
          message: `New password has been assigned for ${resetUser.displayName || resetUser.email}.`,
          userName: resetUser.displayName,
          userEmail: resetUser.email,
          avatarUrl: resetUser.avatarUrl,
        });
        setSaveDialogPhase('success');
      }
    } catch (error: any) {
      if (error.errorFields) return;
      setSaveDialogError(formatApiError(error, 'Failed to reset password'));
      setSaveDialogPhase('error');
    } finally {
      setResetLoading(false);
    }
  };

  const handleDeactivate = async (id: string) => {
    const target = users.find(u => u.id === id);
    try {
      setSaveDialogLoadingTitle('Deactivating User...');
      setSaveDialogLoadingHint(`Suspending access for ${target?.displayName || 'user'}...`);
      setSaveDialogPhase('loading');
      setSaveDialogVisible(true);
      setSaveDialogRetry(() => () => void handleDeactivate(id));

      await apiService.patch(`/admin/users/${id}/deactivate`);
      setUsers(prev => prev.map(u => u.id === id ? { ...u, status: 'INACTIVE' } : u));

      setSaveDialogSuccessTitle('Status Updated');
      setSaveDialogResult({
        title: 'User Deactivated',
        message: `${target?.displayName || 'User'} has been deactivated.`,
        userName: target?.displayName,
        userEmail: target?.email,
        avatarUrl: target?.avatarUrl,
        tags: [{ label: 'INACTIVE', color: 'red' }],
      });
      setSaveDialogPhase('success');
      fetchUsers(page, search || undefined, statusFilter);
    } catch (error) {
      setSaveDialogError(formatApiError(error, 'Failed to deactivate user'));
      setSaveDialogPhase('error');
    }
  };

  const handleActivate = async (id: string) => {
    const target = users.find(u => u.id === id);
    try {
      setSaveDialogLoadingTitle('Activating User...');
      setSaveDialogLoadingHint(`Restoring access for ${target?.displayName || 'user'}...`);
      setSaveDialogPhase('loading');
      setSaveDialogVisible(true);
      setSaveDialogRetry(() => () => void handleActivate(id));

      await apiService.patch(`/admin/users/${id}/activate`);
      setUsers(prev => prev.map(u => u.id === id ? { ...u, status: 'ACTIVE' } : u));

      setSaveDialogSuccessTitle('Status Updated');
      setSaveDialogResult({
        title: 'User Activated',
        message: `${target?.displayName || 'User'} has been restored to active status.`,
        userName: target?.displayName,
        userEmail: target?.email,
        avatarUrl: target?.avatarUrl,
        tags: [{ label: 'ACTIVE', color: 'green' }],
      });
      setSaveDialogPhase('success');
      fetchUsers(page, search || undefined, statusFilter);
    } catch (error) {
      setSaveDialogError(formatApiError(error, 'Failed to activate user'));
      setSaveDialogPhase('error');
    }
  };

  // PDF Export Functionality
  const handleExportPdf = async () => {
    try {
      setExportLoading(true);
      const params: any = { page: 1, limit: 1000 };
      if (search) params.search = search;
      if (statusFilter) params.status = statusFilter;
      const response = await apiService.get<{ data: ErpUser[]; total: number }>('/admin/users', params);
      const exportList = response.data || users;

      if (!exportList.length) {
        message.info('No user records found to export.');
        return;
      }

      const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
      doc.setFontSize(16);
      doc.setTextColor(30, 41, 59);
      doc.text('PWI ERP — User Master Report (2027 Model)', 40, 42);

      doc.setFontSize(9);
      doc.setTextColor(100, 116, 139);
      doc.text(`Generated: ${new Date().toLocaleString()} | Total Users: ${exportList.length}`, 40, 58);
      doc.text(`Filter Applied: Status: ${statusFilter || 'All'} | Search Query: "${search || 'None'}"`, 40, 70);

      const tableHead = [['#', 'Name', 'Email', 'Employee ID', 'Phone', 'Assigned Roles', 'Status', 'Last Login']];
      const tableBody = exportList.map((u, idx) => [
        String(idx + 1),
        u.displayName || '-',
        u.email || '-',
        u.employeeId || '-',
        u.phone || '-',
        u.userRoles?.map(ur => ur.role?.roleCode || '').filter(Boolean).join(', ') || 'No roles',
        u.status || 'ACTIVE',
        u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleDateString() : 'Never',
      ]);

      autoTable(doc, {
        head: tableHead,
        body: tableBody,
        startY: 84,
        styles: { fontSize: 8.5, cellPadding: 6 },
        headStyles: { fillColor: [79, 70, 229], textColor: [255, 255, 255], fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [248, 250, 252] },
      });

      doc.save(`users-report-2027-${new Date().toISOString().slice(0, 10)}.pdf`);
      message.success('PDF report exported successfully');
    } catch (err) {
      message.error(formatApiError(err, 'Failed to export PDF report'));
    } finally {
      setExportLoading(false);
    }
  };

  // Excel / CSV Export Functionality
  const handleExportCsv = async () => {
    try {
      setExportLoading(true);
      const params: any = { page: 1, limit: 1000 };
      if (search) params.search = search;
      if (statusFilter) params.status = statusFilter;
      const response = await apiService.get<{ data: ErpUser[]; total: number }>('/admin/users', params);
      const exportList = response.data || users;

      if (!exportList.length) {
        message.info('No user records found to export.');
        return;
      }

      const headers = ['#', 'Display Name', 'Email', 'Employee ID', 'Phone', 'Assigned Roles', 'Status', 'Last Login', 'Created At'];
      const rows = exportList.map((u, idx) => [
        String(idx + 1),
        `"${(u.displayName || '').replace(/"/g, '""')}"`,
        `"${(u.email || '').replace(/"/g, '""')}"`,
        `"${(u.employeeId || '').replace(/"/g, '""')}"`,
        `"${(u.phone || '').replace(/"/g, '""')}"`,
        `"${(u.userRoles?.map(ur => ur.role?.roleCode || '').filter(Boolean).join(', ') || '').replace(/"/g, '""')}"`,
        `"${u.status || 'ACTIVE'}"`,
        `"${u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString() : 'Never'}"`,
        `"${u.createdAt ? new Date(u.createdAt).toLocaleString() : ''}"`,
      ]);

      const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\r\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `users-export-2027-${new Date().toISOString().slice(0, 10)}.csv`);
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

  const activeCount = users.filter(u => u.status === 'ACTIVE').length;
  const inactiveCount = users.filter(u => u.status !== 'ACTIVE').length;

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

  // Header Actions Toolbar (Renders in Main Application Header)
  const headerExtra = (
    <Space size={8} wrap>
      {can('admin.users.create') && (
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={openCreateModal}
          className="erp-header-action-btn erp-btn-add-user"
          size="middle"
        >
          Add User
        </Button>
      )}
      <Dropdown menu={{ items: exportMenuItems }} placement="bottomRight">
        <Button icon={<DownloadOutlined />} loading={exportLoading} className="erp-header-action-btn">
          Export
        </Button>
      </Dropdown>
      <Button
        icon={<ReloadOutlined />}
        onClick={() => fetchUsers(page, search || undefined, statusFilter)}
        className="erp-header-action-btn"
      >
        Refresh
      </Button>
    </Space>
  );

  const columns: ColumnsType<ErpUser> = [
    {
      title: (
        <Space size={6}>
          <UserOutlined style={{ color: '#4f46e5' }} />
          <span>User</span>
        </Space>
      ),
      key: 'user',
      width: 280,
      sorter: (a, b) => (a.displayName || '').localeCompare(b.displayName || ''),
      render: (_, record) => (
        <div className="user-cell-meta">
          <Tooltip title="Click to view or change photo">
            <div
              className="user-avatar-trigger"
              onClick={() => openAvatarModal(record)}
            >
              <UserAvatar
                avatarUrl={record.avatarUrl}
                displayName={record.displayName}
                size={40}
              />
              <div className="avatar-hover-overlay">
                <CameraOutlined />
              </div>
            </div>
          </Tooltip>
          <div style={{ minWidth: 0 }}>
            <div className="user-cell-name">{record.displayName}</div>
            <div className="user-cell-email">{record.email}</div>
          </div>
        </div>
      ),
    },
    {
      title: (
        <Space size={6}>
          <IdcardOutlined style={{ color: '#0ea5e9' }} />
          <span>Employee ID</span>
        </Space>
      ),
      dataIndex: 'employeeId',
      key: 'employeeId',
      width: 140,
      render: (v: string) => v || <Text type="secondary">-</Text>,
    },
    {
      title: (
        <Space size={6}>
          <PhoneOutlined style={{ color: '#10b981' }} />
          <span>Phone</span>
        </Space>
      ),
      dataIndex: 'phone',
      key: 'phone',
      width: 130,
      render: (v: string) => v || <Text type="secondary">-</Text>,
    },
    {
      title: (
        <Space size={6}>
          <SafetyCertificateOutlined style={{ color: '#f59e0b' }} />
          <span>Roles</span>
        </Space>
      ),
      key: 'roles',
      width: 260,
      render: (_, record) => (
        <Space size={[4, 4]} wrap>
          {record.userRoles?.length ? (
            record.userRoles.map(ur => (
              <Tag
                key={ur.id}
                color={ROLE_COLORS[ur.role?.roleCode || ''] || 'default'}
                className="role-pill"
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
      title: (
        <Space size={6}>
          <ClockCircleOutlined style={{ color: '#8b5cf6' }} />
          <span>Last Login</span>
        </Space>
      ),
      key: 'lastLogin',
      width: 130,
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
      title: (
        <Space size={6}>
          <CheckCircleOutlined style={{ color: '#22c55e' }} />
          <span>Status</span>
        </Space>
      ),
      dataIndex: 'status',
      key: 'status',
      width: 110,
      filters: [
        { text: 'Active', value: 'ACTIVE' },
        { text: 'Inactive', value: 'INACTIVE' },
      ],
      onFilter: (value, record) => record.status === value,
      render: (s: string) => (
        <Badge
          status={s === 'ACTIVE' ? 'success' : 'error'}
          text={<Text style={{ fontSize: 12, fontWeight: 500 }}>{s}</Text>}
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
        <Space size={4}>
          <Tooltip title="View Profile">
            <Button
              type="text"
              size="small"
              icon={<EyeOutlined style={{ color: '#0ea5e9' }} />}
              onClick={() => openViewModal(record)}
            />
          </Tooltip>
          <Tooltip title="Change Photo">
            <Button
              type="text"
              size="small"
              icon={<CameraOutlined style={{ color: '#6366f1' }} />}
              onClick={() => openAvatarModal(record)}
            />
          </Tooltip>
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
    <div className="user-management-container">
      {/* Registers Page Title and Actions into Shared Application Main Header */}
      <PageHeader
        icon={<TeamOutlined style={{ color: '#4f46e5' }} />}
        title="Users"
        subtitle="2027 Model • Enterprise User Management & Role Access Control"
        extra={headerExtra}
      />

      {/* Hidden file input for quick photo selection */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        style={{ display: 'none' }}
        onChange={handleAvatarFileSelect}
      />

      {/* Crystal Cards Section */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={12} lg={6}>
          <div className="crystal-card">
            <div className="crystal-card-content">
              <div className="crystal-card-info">
                <span className="crystal-card-title">Total Users</span>
                <span className="crystal-card-value">{total}</span>
                <span className="crystal-card-subtitle">
                  <Badge status="processing" /> 2027 Model Registry
                </span>
              </div>
              <div className="crystal-icon-badge badge-users">
                <TeamOutlined />
              </div>
            </div>
          </div>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <div className="crystal-card">
            <div className="crystal-card-content">
              <div className="crystal-card-info">
                <span className="crystal-card-title">Active Users</span>
                <span className="crystal-card-value" style={{ color: '#16a34a' }}>{activeCount}</span>
                <span className="crystal-card-subtitle">
                  <CheckCircleOutlined style={{ color: '#16a34a' }} /> Operational Access
                </span>
              </div>
              <div className="crystal-icon-badge badge-active">
                <CheckCircleOutlined />
              </div>
            </div>
          </div>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <div className="crystal-card">
            <div className="crystal-card-content">
              <div className="crystal-card-info">
                <span className="crystal-card-title">Inactive Users</span>
                <span className="crystal-card-value" style={{ color: '#dc2626' }}>{inactiveCount}</span>
                <span className="crystal-card-subtitle">
                  <CloseCircleOutlined style={{ color: '#dc2626' }} /> Suspended / Blocked
                </span>
              </div>
              <div className="crystal-icon-badge badge-inactive">
                <CloseCircleOutlined />
              </div>
            </div>
          </div>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <div className="crystal-card">
            <div className="crystal-card-content">
              <div className="crystal-card-info">
                <span className="crystal-card-title">Roles Available</span>
                <span className="crystal-card-value" style={{ color: '#7c3aed' }}>{roles.length}</span>
                <span className="crystal-card-subtitle">
                  <SafetyCertificateOutlined style={{ color: '#7c3aed' }} /> RBAC Matrix Active
                </span>
              </div>
              <div className="crystal-icon-badge badge-roles">
                <SafetyCertificateOutlined />
              </div>
            </div>
          </div>
        </Col>
      </Row>

      {/* Crystal Table Card */}
      <Card
        className="crystal-table-card"
        title={
          <Space>
            <TeamOutlined style={{ color: '#4f46e5' }} />
            <span>User Management</span>
            <span className="user-model-badge">2027 Model</span>
          </Space>
        }
      >
        <Row style={{ marginBottom: 16 }} justify="space-between" align="middle" gutter={[12, 12]}>
          <Col xs={24} sm={16} md={12}>
            <Space style={{ width: '100%' }} wrap>
              <Input
                placeholder="Search users..."
                prefix={<SearchOutlined />}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onPressEnter={(e) => handleSearch((e.target as HTMLInputElement).value)}
                style={{ width: 260 }}
                allowClear
              />
              <Select
                placeholder="Filter by Status"
                value={statusFilter}
                onChange={(v) => { setStatusFilter(v); setPage(1); }}
                allowClear
                style={{ width: 150 }}
              >
                <Select.Option value="ACTIVE">Active Users</Select.Option>
                <Select.Option value="INACTIVE">Inactive Users</Select.Option>
              </Select>
            </Space>
          </Col>
          <Col xs={24} sm={8} md={12} style={{ textAlign: 'right' }}>
            <Text type="secondary" style={{ fontSize: 13 }}>
              Showing {users.length} of {total} registered users
            </Text>
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

      {/* Quick Change User Photo Modal */}
      <Modal
        title={
          <Space>
            <CameraOutlined style={{ color: '#6366f1' }} />
            <span>Change Photo — {avatarUser?.displayName}</span>
          </Space>
        }
        open={avatarModalVisible}
        onOk={handleSaveAvatar}
        onCancel={() => { setAvatarModalVisible(false); setAvatarFile(null); }}
        okText="Save Photo"
        confirmLoading={avatarLoading}
        width={420}
        destroyOnHidden
      >
        <div style={{ textAlign: 'center', padding: '20px 0' }}>
          <div style={{ marginBottom: 16 }}>
            {avatarPreview ? (
              <img
                src={avatarPreview}
                alt="Preview"
                style={{ width: 100, height: 100, borderRadius: '50%', objectFit: 'cover', border: '3px solid #6366f1' }}
              />
            ) : (
              <UserAvatar
                avatarUrl={avatarUser?.avatarUrl}
                displayName={avatarUser?.displayName}
                size={100}
              />
            )}
          </div>
          <Space size={12} wrap>
            <Button
              icon={<UploadOutlined />}
              onClick={() => fileInputRef.current?.click()}
            >
              Choose Photo
            </Button>
            {avatarUser?.avatarUrl && (
              <Popconfirm
                title="Remove current photo?"
                onConfirm={handleRemoveAvatar}
                okText="Remove"
                okButtonProps={{ danger: true }}
              >
                <Button danger icon={<DeleteOutlined />}>
                  Remove
                </Button>
              </Popconfirm>
            )}
          </Space>
          <div style={{ marginTop: 12 }}>
            <Text type="secondary" style={{ fontSize: 12 }}>
              Supports JPG, PNG, or WebP up to 5MB
            </Text>
          </div>
        </div>
      </Modal>

      {/* Create New User Modal (Draggable, Resizable & Split View: Form on Left, Live View on Right) */}
      <DraggableResizableModal
        title={
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
            <Space>
              <UserAddOutlined style={{ color: '#4f46e5', fontSize: 16 }} />
              <span style={{ fontWeight: 600 }}>Create New User — Split View</span>
            </Space>
            <div className="modal-header-window-controls">
              <span
                className="modal-header-ctrl-btn"
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
        onOk={handleCreate}
        onCancel={() => {
          setCreateModalVisible(false);
          setIsCreateMinimized(false);
        }}
        okText="Create User"
        confirmLoading={createLoading}
        width={980}
        height={650}
        destroyOnHidden
      >
        <div className="user-modal-split-container">
          <div className="user-modal-form-col">
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

              <Divider orientation="left" style={{ fontSize: 13, margin: '12px 0' }}>Personal Information</Divider>

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

              <Divider orientation="left" style={{ fontSize: 13, margin: '12px 0' }}>Role Assignment</Divider>

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
          </div>

          <div className="user-modal-preview-col">
            <div className="user-live-preview-card" data-testid="add-user-live-preview">
              <div className="user-preview-header-badge">
                <EyeOutlined />
                <span>Live View Form</span>
              </div>
              <div className="user-preview-avatar-wrapper">
                <UserAvatar
                  displayName={createDisplayName || createUsername || 'New User'}
                  size={76}
                  className="user-preview-avatar"
                />
              </div>
              <div className="user-preview-name">{createDisplayName || 'User Display Name'}</div>
              <div className="user-preview-username">{createUsername ? `@${createUsername}` : '@username'}</div>
              <div className="user-preview-email">{createEmail || 'email@company.com'}</div>

              <div className="user-preview-details-grid">
                <div className="user-preview-detail-row">
                  <span className="user-preview-detail-label">Status</span>
                  <Tag color="green" style={{ margin: 0 }}>ACTIVE</Tag>
                </div>
                <div className="user-preview-detail-row">
                  <span className="user-preview-detail-label">Employee ID</span>
                  <span className="user-preview-detail-value">{createEmployeeId || '—'}</span>
                </div>
                <div className="user-preview-detail-row">
                  <span className="user-preview-detail-label">Phone</span>
                  <span className="user-preview-detail-value">{createPhone || '—'}</span>
                </div>
              </div>

              <div className="user-preview-roles-container">
                <span className="user-preview-roles-label">Assigned Roles ({createRoleIds?.length || 0})</span>
                <div className="user-preview-roles-tags">
                  {createRoleIds && createRoleIds.length > 0 ? (
                    createRoleIds.map((rid: string) => {
                      const roleObj = roles.find(r => r.id === rid);
                      return (
                        <Tag key={rid} color={roleObj ? (ROLE_COLORS[roleObj.roleCode] || 'blue') : 'default'}>
                          {roleObj?.roleCode || rid}
                        </Tag>
                      );
                    })
                  ) : (
                    <Text type="secondary" style={{ fontSize: 12 }}>No roles assigned yet</Text>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </DraggableResizableModal>

      {/* Edit User Modal (Draggable, Resizable & Split View: Form on Left, Live View on Right) */}
      <DraggableResizableModal
        title={
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
            <Space>
              <EditOutlined style={{ color: '#f59e0b', fontSize: 16 }} />
              <span style={{ fontWeight: 600 }}>Edit User — {selectedUser?.displayName}</span>
            </Space>
            <div className="modal-header-window-controls">
              <span
                className="modal-header-ctrl-btn"
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
        onOk={handleEdit}
        onCancel={() => {
          setEditModalVisible(false);
          setIsEditMinimized(false);
        }}
        okText="Save Changes"
        confirmLoading={editLoading}
        width={980}
        height={650}
        destroyOnHidden
      >
        <div className="user-modal-split-container">
          <div className="user-modal-form-col">
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
              <div style={{ marginTop: 14 }}>
                <Button
                  icon={<CameraOutlined />}
                  onClick={() => {
                    if (selectedUser) openAvatarModal(selectedUser);
                  }}
                  style={{ marginRight: 8 }}
                >
                  Change Photo
                </Button>
                <Button
                  icon={<SafetyCertificateOutlined />}
                  onClick={() => {
                    if (selectedUser) openRoleModal(selectedUser);
                  }}
                >
                  Configure Roles
                </Button>
              </div>
            </Form>
          </div>

          <div className="user-modal-preview-col">
            <div className="user-live-preview-card" data-testid="edit-user-live-preview">
              <div className="user-preview-header-badge">
                <EyeOutlined />
                <span>Live View Form</span>
              </div>
              <div className="user-preview-avatar-wrapper user-avatar-trigger" onClick={() => selectedUser && openAvatarModal(selectedUser)}>
                <UserAvatar
                  avatarUrl={selectedUser?.avatarUrl}
                  displayName={editDisplayName || selectedUser?.displayName}
                  size={76}
                  className="user-preview-avatar"
                />
                <div className="avatar-hover-overlay">
                  <CameraOutlined />
                </div>
              </div>
              <div className="user-preview-name">{editDisplayName || selectedUser?.displayName}</div>
              <div className="user-preview-username">
                {editUsername ? `@${editUsername}` : (selectedUser?.username ? `@${selectedUser.username}` : '@user')}
              </div>
              <div className="user-preview-email">{selectedUser?.email}</div>

              <div className="user-preview-details-grid">
                <div className="user-preview-detail-row">
                  <span className="user-preview-detail-label">Status</span>
                  <Tag color={selectedUser?.status === 'ACTIVE' ? 'green' : 'red'} style={{ margin: 0 }}>
                    {selectedUser?.status || 'ACTIVE'}
                  </Tag>
                </div>
                <div className="user-preview-detail-row">
                  <span className="user-preview-detail-label">Full Name</span>
                  <span className="user-preview-detail-value">
                    {`${editFirstName || selectedUser?.firstName || ''} ${editLastName || selectedUser?.lastName || ''}`.trim() || '—'}
                  </span>
                </div>
                <div className="user-preview-detail-row">
                  <span className="user-preview-detail-label">Employee ID</span>
                  <span className="user-preview-detail-value">{editEmployeeId || selectedUser?.employeeId || '—'}</span>
                </div>
                <div className="user-preview-detail-row">
                  <span className="user-preview-detail-label">Phone</span>
                  <span className="user-preview-detail-value">{editPhone || selectedUser?.phone || '—'}</span>
                </div>
                <div className="user-preview-detail-row">
                  <span className="user-preview-detail-label">Created</span>
                  <span className="user-preview-detail-value">
                    {selectedUser?.createdAt ? new Date(selectedUser.createdAt).toLocaleDateString() : '—'}
                  </span>
                </div>
                <div className="user-preview-detail-row">
                  <span className="user-preview-detail-label">Last Login</span>
                  <span className="user-preview-detail-value">
                    {selectedUser?.lastLoginAt ? new Date(selectedUser.lastLoginAt).toLocaleDateString() : 'Never'}
                  </span>
                </div>
              </div>

              <div className="user-preview-roles-container">
                <span className="user-preview-roles-label">Assigned Roles</span>
                <div className="user-preview-roles-tags">
                  {selectedUser?.userRoles && selectedUser.userRoles.length > 0 ? (
                    selectedUser.userRoles.map(ur => (
                      <Tag key={ur.id} color={ROLE_COLORS[ur.role?.roleCode || ''] || 'blue'}>
                        {ur.role?.roleCode || 'ROLE'}
                      </Tag>
                    ))
                  ) : (
                    <Text type="secondary" style={{ fontSize: 12 }}>No roles assigned</Text>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </DraggableResizableModal>

      {/* View User Profile Modal (Draggable & Resizable) */}
      <DraggableResizableModal
        title={
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
            <Space>
              <EyeOutlined style={{ color: '#0ea5e9', fontSize: 16 }} />
              <span style={{ fontWeight: 600 }}>User Profile View — {viewUser?.displayName}</span>
            </Space>
            <div className="modal-header-window-controls">
              <span
                className="modal-header-ctrl-btn"
                title="Minimize to Dock"
                onClick={(e) => {
                  e.stopPropagation();
                  setViewModalVisible(false);
                  setIsViewMinimized(true);
                }}
              >
                <MinusOutlined />
              </span>
            </div>
          </div>
        }
        open={viewModalVisible}
        onCancel={() => {
          setViewModalVisible(false);
          setIsViewMinimized(false);
        }}
        footer={[
          can('admin.users.update') && (
            <Button
              key="edit"
              type="primary"
              icon={<EditOutlined />}
              onClick={() => {
                if (viewUser) {
                  setViewModalVisible(false);
                  openEditModal(viewUser);
                }
              }}
            >
              Edit User
            </Button>
          ),
          <Button key="close" onClick={() => setViewModalVisible(false)}>
            Close
          </Button>,
        ]}
        width={680}
        height={580}
        destroyOnHidden
      >
        {viewUser && (
          <div className="user-live-preview-card" style={{ height: 'auto', minHeight: '100%' }} data-testid="user-full-view-card">
            <div className="user-preview-header-badge">
              <IdcardOutlined />
              <span>User Master Record (2027 Model)</span>
            </div>
            <div className="user-preview-avatar-wrapper">
              <UserAvatar
                avatarUrl={viewUser.avatarUrl}
                displayName={viewUser.displayName}
                size={84}
                className="user-preview-avatar"
              />
            </div>
            <div className="user-preview-name">{viewUser.displayName}</div>
            <div className="user-preview-username">{viewUser.username ? `@${viewUser.username}` : '@user'}</div>
            <div className="user-preview-email">{viewUser.email}</div>

            <div className="user-preview-details-grid" style={{ width: '100%' }}>
              <div className="user-preview-detail-row">
                <span className="user-preview-detail-label">Status</span>
                <Tag color={viewUser.status === 'ACTIVE' ? 'green' : 'red'} style={{ margin: 0 }}>
                  {viewUser.status || 'ACTIVE'}
                </Tag>
              </div>
              <div className="user-preview-detail-row">
                <span className="user-preview-detail-label">Full Name</span>
                <span className="user-preview-detail-value">
                  {`${viewUser.firstName || ''} ${viewUser.lastName || ''}`.trim() || '—'}
                </span>
              </div>
              <div className="user-preview-detail-row">
                <span className="user-preview-detail-label">Employee ID</span>
                <span className="user-preview-detail-value">{viewUser.employeeId || '—'}</span>
              </div>
              <div className="user-preview-detail-row">
                <span className="user-preview-detail-label">Phone</span>
                <span className="user-preview-detail-value">{viewUser.phone || '—'}</span>
              </div>
              <div className="user-preview-detail-row">
                <span className="user-preview-detail-label">System User ID</span>
                <span className="user-preview-detail-value" style={{ fontFamily: 'monospace', fontSize: 11 }}>
                  {viewUser.id}
                </span>
              </div>
              <div className="user-preview-detail-row">
                <span className="user-preview-detail-label">Account Created</span>
                <span className="user-preview-detail-value">
                  {viewUser.createdAt ? new Date(viewUser.createdAt).toLocaleString() : '—'}
                </span>
              </div>
              <div className="user-preview-detail-row">
                <span className="user-preview-detail-label">Last Login</span>
                <span className="user-preview-detail-value">
                  {viewUser.lastLoginAt ? new Date(viewUser.lastLoginAt).toLocaleString() : 'Never logged in'}
                </span>
              </div>
            </div>

            <div className="user-preview-roles-container">
              <span className="user-preview-roles-label">Assigned Roles ({viewUser.userRoles?.length || 0})</span>
              <div className="user-preview-roles-tags">
                {viewUser.userRoles && viewUser.userRoles.length > 0 ? (
                  viewUser.userRoles.map(ur => (
                    <Tag key={ur.id} color={ROLE_COLORS[ur.role?.roleCode || ''] || 'blue'}>
                      {ur.role?.roleCode || 'ROLE'}
                    </Tag>
                  ))
                ) : (
                  <Text type="secondary" style={{ fontSize: 12 }}>No roles assigned</Text>
                )}
              </div>
            </div>
          </div>
        )}
      </DraggableResizableModal>

      {/* Assign Roles Modal */}
      <Modal
        title={
          <Space>
            <SafetyCertificateOutlined style={{ color: '#6366f1' }} />
            <span>Manage Roles — {selectedUser?.displayName}</span>
          </Space>
        }
        open={roleModalVisible}
        onOk={handleAssignRoles}
        onCancel={() => setRoleModalVisible(false)}
        okText="Save Roles"
        confirmLoading={roleLoading}
        width={500}
        destroyOnHidden
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
            <span>Reset Password — {resetUser?.displayName}</span>
          </Space>
        }
        open={resetModalVisible}
        onOk={handleResetPassword}
        onCancel={() => setResetModalVisible(false)}
        okText="Reset Password"
        okButtonProps={{ danger: true }}
        confirmLoading={resetLoading}
        width={480}
        destroyOnHidden
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

      {/* Minimized Windows Dock (Chrome-style Multi-window Tabs) */}
      {(isCreateMinimized || isEditMinimized || isViewMinimized) && (
        <div className="user-modal-minimized-dock" data-testid="user-minimized-dock">
          {isCreateMinimized && (
            <div
              className="minimized-window-tab"
              onClick={() => {
                setIsCreateMinimized(false);
                setCreateModalVisible(true);
              }}
              title="Click to restore Add User form"
            >
              <span className="minimized-window-pulse" />
              <UserAddOutlined style={{ color: '#4f46e5' }} />
              <span>Add User Form</span>
              <span
                className="minimized-window-close"
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
          {isEditMinimized && selectedUser && (
            <div
              className="minimized-window-tab"
              onClick={() => {
                setIsEditMinimized(false);
                setEditModalVisible(true);
              }}
              title={`Click to restore Edit Form for ${selectedUser.displayName}`}
            >
              <span className="minimized-window-pulse" />
              <EditOutlined style={{ color: '#f59e0b' }} />
              <span>Edit: {selectedUser.displayName}</span>
              <span
                className="minimized-window-close"
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
          {isViewMinimized && viewUser && (
            <div
              className="minimized-window-tab"
              onClick={() => {
                setIsViewMinimized(false);
                setViewModalVisible(true);
              }}
              title={`Click to restore Profile View for ${viewUser.displayName}`}
            >
              <span className="minimized-window-pulse" />
              <EyeOutlined style={{ color: '#0ea5e9' }} />
              <span>View: {viewUser.displayName}</span>
              <span
                className="minimized-window-close"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsViewMinimized(false);
                }}
                title="Close"
              >
                <CloseOutlined />
              </span>
            </div>
          )}
        </div>
      )}

      {/* Save / Processing / Success / Error Feedback Dialog */}
      <SaveResultDialog
        open={saveDialogVisible}
        phase={saveDialogPhase}
        result={saveDialogResult}
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

export default UserManagement;
