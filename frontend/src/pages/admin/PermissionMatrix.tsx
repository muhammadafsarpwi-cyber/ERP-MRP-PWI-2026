import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Card, Tag, Button, Space, Input, Select, App as AntApp, Spin,
  Tooltip, Popconfirm, Row, Col, Typography, Badge, Dropdown, Empty,
  message as staticMessage,
} from 'antd';
import type { MenuProps } from 'antd';
import {
  SaveOutlined, SearchOutlined, ReloadOutlined, DownOutlined,
  RightOutlined, CompressOutlined, ExpandOutlined, KeyOutlined,
  SafetyCertificateOutlined, ApartmentOutlined, EditOutlined,
  CheckCircleOutlined, CloseCircleOutlined, DownloadOutlined,
  FilePdfOutlined, FileExcelOutlined, UndoOutlined, CheckOutlined,
  CloseOutlined, CrownOutlined, LockOutlined, InfoCircleOutlined,
} from '@ant-design/icons';
import apiService from '../../services/api';
import { PageHeader, SaveResultDialog } from '../../components/shared';
import type { SaveResultData, SaveResultPhase } from '../../components/shared/SaveResultDialog';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import './permissionMatrix.css';

const { Text } = Typography;

interface PermissionCell {
  permissionId: string;
  permissionCode: string;
  roleGranted: Record<string, boolean>;
}

interface PermissionRow {
  module: string;
  resource: string;
  resourceName: string;
  permissions: Record<string, PermissionCell>;
}

interface RoleInfo {
  id: string;
  roleCode: string;
  name: string;
  isSystemRole: boolean;
  status: string;
}

interface PermissionMatrixData {
  roles: RoleInfo[];
  modules: string[];
  rows: PermissionRow[];
  moduleLabels: Record<string, string>;
  resourceLabels: Record<string, string>;
}

const MODULE_COLORS: Record<string, string> = {
  organization: '#818cf8',
  admin: '#f43f5e',
  item: '#0ea5e9',
  inventory: '#10b981',
  procurement: '#f59e0b',
  customer: '#14b8a6',
  sales: '#3b82f6',
  manufacturing: '#eab308',
  maintenance: '#06b6d4',
  finance: '#ec4899',
  hr: '#8b5cf6',
  qc: '#6366f1',
  notifications: '#a855f7',
  communication: '#d946ef',
  store: '#10b981',
};

const ACTION_CONFIG: Record<string, { label: string; full: string; color: string; classPrefix: string }> = {
  VIEW: { label: 'V', full: 'View / Access', color: '#2563eb', classPrefix: 'granted-view' },
  CREATE: { label: 'A', full: 'Add / Create', color: '#16a34a', classPrefix: 'granted-create' },
  UPDATE: { label: 'E', full: 'Edit / Update', color: '#d97706', classPrefix: 'granted-update' },
  DELETE: { label: 'D', full: 'Delete / Deactivate', color: '#e11d48', classPrefix: 'granted-delete' },
  APPROVE: { label: 'X', full: 'Approve / Verify', color: '#7c3aed', classPrefix: 'granted-special' },
  POST: { label: 'P', full: 'Post to Ledger', color: '#0d9488', classPrefix: 'granted-special' },
  SUBMIT: { label: 'S', full: 'Submit for Review', color: '#6366f1', classPrefix: 'granted-special' },
};

type ChangeMap = Map<string, boolean>;

const PermissionMatrix: React.FC = () => {
  const app = AntApp.useApp();
  const message = app?.message || staticMessage;
  const [matrix, setMatrix] = useState<PermissionMatrixData | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [filterModule, setFilterModule] = useState<string | undefined>();
  const [localChanges, setLocalChanges] = useState<ChangeMap>(new Map());
  const [collapsedModules, setCollapsedModules] = useState<Set<string>>(new Set());
  const [exportLoading, setExportLoading] = useState(false);

  // Animated SaveResultDialog state
  const [saveDialogVisible, setSaveDialogVisible] = useState(false);
  const [saveDialogPhase, setSaveDialogPhase] = useState<SaveResultPhase>('loading');
  const [saveDialogResult, setSaveDialogResult] = useState<SaveResultData | null>(null);
  const [saveDialogError, setSaveDialogError] = useState<string | undefined>(undefined);
  const [saveDialogSuccessTitle, setSaveDialogSuccessTitle] = useState<string>('Matrix Saved Successfully');
  const [saveDialogLoadingTitle, setSaveDialogLoadingTitle] = useState<string>('Saving Permissions Matrix...');
  const [saveDialogLoadingHint, setSaveDialogLoadingHint] = useState<string>('Updating role-permission authorization matrix across all ERP modules...');
  const [saveDialogRetry, setSaveDialogRetry] = useState<(() => void) | undefined>(undefined);

  const fetchMatrix = useCallback(async () => {
    setLoading(true);
    try {
      const response = await apiService.get<{ data: PermissionMatrixData }>('/admin/permissions-matrix');
      setMatrix(response.data);
      setLocalChanges(new Map());
    } catch (error) {
      message.error('Failed to load permission matrix');
    } finally {
      setLoading(false);
    }
  }, [message]);

  useEffect(() => { fetchMatrix(); }, [fetchMatrix]);

  const filteredRows = useMemo(() => {
    if (!matrix) return [];
    let rows = matrix.rows;
    if (filterModule) {
      rows = rows.filter(r => r.module === filterModule);
    }
    if (search) {
      const lower = search.toLowerCase();
      rows = rows.filter(r =>
        r.resourceName.toLowerCase().includes(lower) ||
        r.resource.toLowerCase().includes(lower) ||
        r.module.toLowerCase().includes(lower) ||
        Object.values(r.permissions).some(p => p.permissionCode.toLowerCase().includes(lower))
      );
    }
    return rows;
  }, [matrix, search, filterModule]);

  const changeKey = useCallback((roleId: string, permissionId: string) => `${roleId}:${permissionId}`, []);

  const isGranted = useCallback((roleId: string, permissionId: string, originalRoleGranted: boolean): boolean => {
    const key = changeKey(roleId, permissionId);
    if (localChanges.has(key)) {
      return localChanges.get(key)!;
    }
    return originalRoleGranted;
  }, [localChanges, changeKey]);

  const togglePermission = useCallback((roleId: string, permissionId: string, originalValue: boolean) => {
    const key = changeKey(roleId, permissionId);
    const currentlyGranted = localChanges.has(key) ? localChanges.get(key)! : originalValue;
    const nextVal = !currentlyGranted;

    setLocalChanges(prev => {
      const next = new Map(prev);
      if (nextVal === originalValue) {
        // Reverted back to initial state
        next.delete(key);
      } else {
        next.set(key, nextVal);
      }
      return next;
    });
  }, [changeKey, localChanges]);

  const hasChanges = localChanges.size > 0;

  const toggleModule = useCallback((module: string) => {
    setCollapsedModules(prev => {
      const next = new Set(prev);
      if (next.has(module)) next.delete(module);
      else next.add(module);
      return next;
    });
  }, []);

  const toggleAllModules = useCallback(() => {
    if (!matrix) return;
    setCollapsedModules(prev => {
      if (prev.size === matrix.modules.length) return new Set<string>();
      return new Set(matrix.modules);
    });
  }, [matrix]);

  // Save All Changes with Animated SaveResultDialog
  const handleSave = useCallback(async () => {
    if (!matrix || localChanges.size === 0) return;
    try {
      setSaving(true);
      setSaveDialogLoadingTitle('Saving Permissions Matrix...');
      setSaveDialogLoadingHint(`Applying ${localChanges.size} permission assignment update(s)...`);
      setSaveDialogPhase('loading');
      setSaveDialogVisible(true);
      setSaveDialogRetry(() => () => void handleSave());

      const rolePermMap = new Map<string, { permissionId: string; granted: boolean }[]>();

      for (const [key, granted] of localChanges.entries()) {
        const [roleId, permissionId] = key.split(':');
        if (!rolePermMap.has(roleId)) {
          rolePermMap.set(roleId, []);
        }
        rolePermMap.get(roleId)!.push({ permissionId, granted });
      }

      const roleUpdates = Array.from(rolePermMap.entries()).map(([roleId, permissions]) => ({
        roleId,
        permissions,
      }));

      await apiService.put('/admin/permissions-matrix', { roles: roleUpdates });

      const affectedRoles = matrix.roles.filter(r => rolePermMap.has(r.id));
      const totalToggles = localChanges.size;

      setSaveDialogSuccessTitle('Matrix Updated Successfully');
      setSaveDialogResult({
        title: 'Authorization Matrix Synchronized',
        message: `Successfully synchronized ${totalToggles} permission toggle(s) across ${affectedRoles.length} role(s).`,
        userName: `${affectedRoles.length} Roles Configured`,
        userEmail: `${totalToggles} Granular Rights Assigned`,
        tags: affectedRoles.map(r => ({ label: r.roleCode, color: r.isSystemRole ? 'gold' : 'blue' })),
      });
      setSaveDialogPhase('success');

      await fetchMatrix();
    } catch (error: any) {
      setSaveDialogError(error?.response?.data?.message || 'Failed to save permissions matrix');
      setSaveDialogPhase('error');
    } finally {
      setSaving(false);
    }
  }, [matrix, localChanges, fetchMatrix]);

  // Bulk column actions: Toggle all permissions for an action in a role column
  const handleToggleColumnAction = useCallback((roleId: string, action: string, value: boolean) => {
    if (!matrix) return;
    setLocalChanges(prev => {
      const next = new Map(prev);
      for (const row of matrix.rows) {
        const perm = resolveCellPermission(row, action);
        if (perm) {
          const original = perm.roleGranted[roleId] || false;
          const key = changeKey(roleId, perm.permissionId);
          if (value === original) {
            next.delete(key);
          } else {
            next.set(key, value);
          }
        }
      }
      return next;
    });
  }, [matrix, changeKey]);

  // Bulk Grant All in Column
  const handleGrantAllInRole = useCallback((roleId: string) => {
    if (!matrix) return;
    setLocalChanges(prev => {
      const next = new Map(prev);
      for (const row of matrix.rows) {
        for (const cell of Object.values(row.permissions)) {
          const original = cell.roleGranted[roleId] || false;
          const key = changeKey(roleId, cell.permissionId);
          if (true === original) {
            next.delete(key);
          } else {
            next.set(key, true);
          }
        }
      }
      return next;
    });
  }, [matrix, changeKey]);

  // Bulk Revoke All in Column
  const handleRevokeAllInRole = useCallback((roleId: string) => {
    if (!matrix) return;
    setLocalChanges(prev => {
      const next = new Map(prev);
      for (const row of matrix.rows) {
        for (const cell of Object.values(row.permissions)) {
          const original = cell.roleGranted[roleId] || false;
          const key = changeKey(roleId, cell.permissionId);
          if (false === original) {
            next.delete(key);
          } else {
            next.set(key, false);
          }
        }
      }
      return next;
    });
  }, [matrix, changeKey]);

  // Bulk Grant/Revoke all actions for a single resource row across a role
  const handleToggleRowForRole = useCallback((row: PermissionRow, roleId: string, value: boolean) => {
    setLocalChanges(prev => {
      const next = new Map(prev);
      for (const cell of Object.values(row.permissions)) {
        const original = cell.roleGranted[roleId] || false;
        const key = changeKey(roleId, cell.permissionId);
        if (value === original) {
          next.delete(key);
        } else {
          next.set(key, value);
        }
      }
      return next;
    });
  }, [changeKey]);

  // Discard all unsaved changes
  const handleDiscardChanges = useCallback(() => {
    setLocalChanges(new Map());
    message.info('All unsaved changes have been discarded.');
  }, [message]);

  // Export Matrix to PDF
  const handleExportPdf = async () => {
    if (!matrix) return;
    try {
      setExportLoading(true);
      const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
      doc.setFontSize(16);
      doc.setTextColor(30, 41, 59);
      doc.text('PWI ERP — Roles & Permissions Matrix (2027 Model)', 40, 42);

      doc.setFontSize(9);
      doc.setTextColor(100, 116, 139);
      doc.text(`Generated: ${new Date().toLocaleString()} | Modules: ${matrix.modules.length} | Protected Rows: ${filteredRows.length}`, 40, 58);

      const tableHead = [['Module', 'Page / Resource', ...matrix.roles.map(r => r.name)]];
      const tableBody = filteredRows.map(row => {
        const roleCells = matrix.roles.map(r => {
          const activeActions: string[] = [];
          for (const [actionName, cell] of Object.entries(row.permissions)) {
            if (isGranted(r.id, cell.permissionId, cell.roleGranted[r.id])) {
              activeActions.push(ACTION_CONFIG[actionName]?.label || actionName[0]);
            }
          }
          return activeActions.join(' ') || '-';
        });
        return [row.module.toUpperCase(), row.resourceName, ...roleCells];
      });

      autoTable(doc, {
        head: tableHead,
        body: tableBody,
        startY: 75,
        styles: { fontSize: 8, cellPadding: 4 },
        headStyles: { fillColor: [79, 70, 229], textColor: [255, 255, 255], fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [248, 250, 252] },
      });

      doc.save(`permissions-matrix-2027-${new Date().toISOString().slice(0, 10)}.pdf`);
      message.success('Permissions matrix exported to PDF successfully');
    } catch (err) {
      message.error('Failed to export PDF');
    } finally {
      setExportLoading(false);
    }
  };

  // Export Matrix to Excel / CSV
  const handleExportCsv = async () => {
    if (!matrix) return;
    try {
      setExportLoading(true);
      const headers = ['Module', 'Resource Name', 'Resource Code', ...matrix.roles.map(r => `"${r.name} (${r.roleCode})"`)];
      const rows = filteredRows.map(row => {
        const roleCols = matrix.roles.map(r => {
          const activeList: string[] = [];
          for (const [act, cell] of Object.entries(row.permissions)) {
            if (isGranted(r.id, cell.permissionId, cell.roleGranted[r.id])) {
              activeList.push(act);
            }
          }
          return `"${activeList.join(', ') || 'NONE'}"`;
        });
        return [`"${row.module}"`, `"${row.resourceName}"`, `"${row.resource}"`, ...roleCols];
      });

      const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\r\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `permissions-matrix-2027-${new Date().toISOString().slice(0, 10)}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      message.success('Permissions matrix CSV exported successfully');
    } catch (err) {
      message.error('Failed to export CSV');
    } finally {
      setExportLoading(false);
    }
  };

  // Resolves canonical CRUD permission or workflow action for a row
  function resolveCellPermission(row: PermissionRow, action: string): PermissionCell | undefined {
    if (row.permissions[action]) return row.permissions[action];
    // Fallback aliases
    if (action === 'DELETE' && row.permissions['DEACTIVATE']) return row.permissions['DEACTIVATE'];
    if (action === 'DELETE' && row.permissions['DISCONTINUE']) return row.permissions['DISCONTINUE'];
    if (action === 'UPDATE' && row.permissions['EDIT']) return row.permissions['EDIT'];
    if (action === 'UPDATE' && row.permissions['MANAGE']) return row.permissions['MANAGE'];
    if (action === 'CREATE' && row.permissions['SUBMIT']) return row.permissions['SUBMIT'];
    return undefined;
  }

  const standardActions = ['VIEW', 'CREATE', 'UPDATE', 'DELETE'];

  // Counts for 4 Crystal KPI Cards
  const totalMatrixPerms = useMemo(() => {
    if (!matrix) return 0;
    const set = new Set<string>();
    for (const r of matrix.rows) {
      for (const cell of Object.values(r.permissions)) {
        set.add(cell.permissionId);
      }
    }
    return set.size;
  }, [matrix]);

  const rolesCount = matrix?.roles?.length || 0;
  const protectedRowsCount = matrix?.rows?.length || 0;
  const pendingChangesCount = localChanges.size;

  const exportMenuItems: MenuProps['items'] = [
    {
      key: 'pdf',
      icon: <FilePdfOutlined style={{ color: '#ef4444', fontSize: 16 }} />,
      label: 'Export Matrix as PDF Document',
      onClick: handleExportPdf,
    },
    {
      key: 'csv',
      icon: <FileExcelOutlined style={{ color: '#10b981', fontSize: 16 }} />,
      label: 'Export Matrix as Excel / CSV',
      onClick: handleExportCsv,
    },
  ];

  // Header Extra Actions
  const headerExtra = (
    <Space size={8} wrap>
      <Popconfirm
        title="Save all permission changes?"
        description={`This will immediately apply ${localChanges.size} permission assignment update(s).`}
        onConfirm={handleSave}
        okButtonProps={{ loading: saving }}
        okText="Save Now"
        disabled={!hasChanges}
      >
        <Button
          type="primary"
          icon={<SaveOutlined />}
          disabled={!hasChanges}
          loading={saving}
          style={{
            background: hasChanges ? 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)' : undefined,
            border: 'none',
            boxShadow: hasChanges ? '0 4px 12px rgba(79, 70, 229, 0.4)' : undefined,
          }}
        >
          Save Changes {hasChanges && `(${localChanges.size})`}
        </Button>
      </Popconfirm>

      {hasChanges && (
        <Button icon={<UndoOutlined />} onClick={handleDiscardChanges} danger>
          Discard ({localChanges.size})
        </Button>
      )}

      <Dropdown menu={{ items: exportMenuItems }} placement="bottomRight">
        <Button icon={<DownloadOutlined />} loading={exportLoading}>
          Export Matrix
        </Button>
      </Dropdown>

      <Button
        icon={<ReloadOutlined />}
        onClick={fetchMatrix}
        loading={loading}
      >
        Refresh
      </Button>

      {matrix && (
        <Button
          icon={collapsedModules.size === matrix.modules.length ? <ExpandOutlined /> : <CompressOutlined />}
          onClick={toggleAllModules}
        >
          {collapsedModules.size === matrix.modules.length ? 'Expand All' : 'Collapse All'}
        </Button>
      )}
    </Space>
  );

  if (!matrix && loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 480 }}>
        <Spin size="large" />
        <Text style={{ marginTop: 16, color: '#6366f1', fontWeight: 600 }}>Loading 2027 RBAC Permissions Matrix...</Text>
      </div>
    );
  }

  return (
    <div className="permission-matrix-container">
      {/* Registers Page Title and Actions into Shared Application Main Header */}
      <PageHeader
        icon={<SafetyCertificateOutlined style={{ color: '#4f46e5' }} />}
        title="Roles & Permissions"
        subtitle="2027 Model • Granular Access Matrix & Multi-Role Authorization Control"
        extra={headerExtra}
      />

      {/* 4 Crystal KPI Cards */}
      <Row gutter={[16, 16]} className="matrix-kpi-row">
        <Col xs={24} sm={12} lg={6}>
          <div className="matrix-crystal-card">
            <div className="matrix-card-content">
              <div className="matrix-card-info">
                <span className="matrix-card-title">Matrix Controls</span>
                <span className="matrix-card-value">{totalMatrixPerms}</span>
                <span className="matrix-card-badge" style={{ color: '#7c3aed' }}>
                  <Badge status="processing" /> 2027 Model RBAC Matrix
                </span>
              </div>
              <div className="matrix-card-icon icon-gradient-purple">
                <KeyOutlined />
              </div>
            </div>
          </div>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <div className="matrix-crystal-card">
            <div className="matrix-card-content">
              <div className="matrix-card-info">
                <span className="matrix-card-title">Active Roles</span>
                <span className="matrix-card-value" style={{ color: '#4f46e5' }}>{rolesCount}</span>
                <span className="matrix-card-badge" style={{ color: '#4f46e5' }}>
                  <CrownOutlined /> Enterprise RBAC Matrix
                </span>
              </div>
              <div className="matrix-card-icon icon-gradient-primary">
                <SafetyCertificateOutlined />
              </div>
            </div>
          </div>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <div className="matrix-crystal-card">
            <div className="matrix-card-content">
              <div className="matrix-card-info">
                <span className="matrix-card-title">Pages & Resources</span>
                <span className="matrix-card-value" style={{ color: '#059669' }}>{protectedRowsCount}</span>
                <span className="matrix-card-badge" style={{ color: '#059669' }}>
                  <CheckCircleOutlined /> 100% Coverage Configured
                </span>
              </div>
              <div className="matrix-card-icon icon-gradient-success">
                <ApartmentOutlined />
              </div>
            </div>
          </div>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <div className="matrix-crystal-card">
            <div className="matrix-card-content">
              <div className="matrix-card-info">
                <span className="matrix-card-title">Unsaved Changes</span>
                <span className="matrix-card-value" style={{ color: pendingChangesCount > 0 ? '#d97706' : '#64748b' }}>
                  {pendingChangesCount}
                </span>
                <span className="matrix-card-badge" style={{ color: pendingChangesCount > 0 ? '#d97706' : '#64748b' }}>
                  {pendingChangesCount > 0 ? (
                    <>
                      <span className="matrix-save-dock-pulse" style={{ display: 'inline-block', marginRight: 4 }} />
                      Pending Save Action Required
                    </>
                  ) : (
                    <>
                      <CheckOutlined /> All Roles Synchronized
                    </>
                  )}
                </span>
              </div>
              <div className="matrix-card-icon icon-gradient-warning">
                <EditOutlined />
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
            <KeyOutlined style={{ color: '#4f46e5' }} />
            <span>Authorization Matrix & Granular Policy</span>
            <span className="matrix-model-badge">2027 Model</span>
          </Space>
        }
      >
        <Row style={{ marginBottom: 16 }} justify="space-between" align="middle" gutter={[12, 12]}>
          <Col xs={24} sm={16} md={12}>
            <Space style={{ width: '100%' }} wrap>
              <Input
                placeholder="Search modules, resources, permissions..."
                prefix={<SearchOutlined />}
                value={search}
                onChange={e => setSearch(e.target.value)}
                style={{ width: 300 }}
                allowClear
              />
              <Select
                placeholder="All Modules"
                value={filterModule}
                onChange={setFilterModule}
                allowClear
                style={{ width: 180 }}
              >
                {matrix?.modules?.map(mod => (
                  <Select.Option key={mod} value={mod}>
                    {matrix.moduleLabels[mod] || mod}
                  </Select.Option>
                ))}
              </Select>
            </Space>
          </Col>
          <Col xs={24} sm={8} md={12} style={{ textAlign: 'right' }}>
            <Text type="secondary" style={{ fontSize: 13 }}>
              Showing {filteredRows.length} of {matrix?.rows?.length || 0} protected system resources
            </Text>
          </Col>
        </Row>

        {/* STICKY Table Architecture (Fixed Headers on Vertical Scroll, Fixed Resource Column on Horizontal Scroll) */}
        <div className="matrix-scroll-wrapper" data-testid="matrix-scroll-wrapper">
          <table className="matrix-table">
            <thead>
              <tr>
                {/* Top-Left Corner: Permanently fixed at top:0 left:0 */}
                <th className="matrix-corner-th">
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Space size={6}>
                      <ApartmentOutlined style={{ color: '#4f46e5' }} />
                      <span style={{ fontWeight: 700, fontSize: 13, color: '#1e293b' }}>Module / Resource</span>
                    </Space>
                    <Tooltip title="Fixed sticky column on scroll">
                      <LockOutlined style={{ color: '#94a3b8', fontSize: 11 }} />
                    </Tooltip>
                  </div>
                </th>

                {/* Role Column Headers: Permanently sticky at top:0 */}
                {matrix?.roles?.map(role => (
                  <th key={role.id}>
                    <div className="matrix-th-role-card">
                      <div className="matrix-th-role-title">{role.name}</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Tag
                          color={role.isSystemRole ? 'gold' : 'blue'}
                          style={{ fontSize: 10, lineHeight: '14px', padding: '0 4px', margin: 0, fontWeight: 600 }}
                        >
                          {role.isSystemRole ? 'System' : 'Custom'}
                        </Tag>
                        <Dropdown
                          menu={{
                            items: [
                              {
                                key: 'grant-all',
                                label: 'Grant All Permissions in Column',
                                icon: <CheckCircleOutlined style={{ color: '#16a34a' }} />,
                                onClick: () => handleGrantAllInRole(role.id),
                              },
                              {
                                key: 'revoke-all',
                                label: 'Revoke All Permissions in Column',
                                icon: <CloseCircleOutlined style={{ color: '#e11d48' }} />,
                                onClick: () => handleRevokeAllInRole(role.id),
                              },
                            ],
                          }}
                          trigger={['click']}
                        >
                          <Button type="text" size="small" style={{ padding: '0 4px', height: 16, fontSize: 11 }}>
                            ▾
                          </Button>
                        </Dropdown>
                      </div>

                      {/* Quick action column batch toggles */}
                      <div className="matrix-th-batch-actions">
                        {standardActions.map(action => {
                          const config = ACTION_CONFIG[action];
                          return (
                            <Tooltip key={action} title={`Toggle all ${config.full} for ${role.name}`} placement="top">
                              <button
                                className="matrix-th-act-toggle"
                                onClick={() => {
                                  // Check state of first row permission
                                  const firstPerm = resolveCellPermission(matrix.rows[0], action);
                                  const curVal = firstPerm ? isGranted(role.id, firstPerm.permissionId, firstPerm.roleGranted[role.id]) : false;
                                  handleToggleColumnAction(role.id, action, !curVal);
                                }}
                              >
                                {config.label}
                              </button>
                            </Tooltip>
                          );
                        })}
                      </div>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {(() => {
                let lastModule: string | null = null;
                return filteredRows.map(row => {
                  const showModuleHeader = row.module !== lastModule;
                  lastModule = row.module;
                  const isCollapsed = collapsedModules.has(row.module) && !search;
                  if (isCollapsed && !showModuleHeader) return null;

                  return (
                    <React.Fragment key={`${row.module}-${row.resource}`}>
                      {showModuleHeader && (
                        <tr className="matrix-module-row">
                          <td
                            colSpan={(matrix?.roles?.length || 0) + 1}
                            onClick={() => toggleModule(row.module)}
                            style={{ cursor: 'pointer' }}
                          >
                            <Space size={8}>
                              <span style={{ display: 'inline-flex', alignItems: 'center' }}>
                                {collapsedModules.has(row.module)
                                  ? <RightOutlined style={{ fontSize: 10, color: '#6366f1' }} />
                                  : <DownOutlined style={{ fontSize: 10, color: '#6366f1' }} />}
                              </span>
                              <span
                                style={{
                                  display: 'inline-block',
                                  width: 10,
                                  height: 10,
                                  borderRadius: 3,
                                  background: MODULE_COLORS[row.module] || '#6366f1',
                                }}
                              />
                              <span style={{ color: MODULE_COLORS[row.module] || '#1e293b' }}>
                                {matrix?.moduleLabels[row.module] || row.module}
                              </span>
                              <Badge
                                count={filteredRows.filter(r => r.module === row.module).length}
                                style={{ backgroundColor: '#6366f1', fontSize: 11 }}
                              />
                            </Space>
                          </td>
                        </tr>
                      )}

                      {!isCollapsed && (
                        <tr>
                          {/* Sticky Left Resource Column */}
                          <td className="matrix-sticky-col">
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                              <span>{row.resourceName}</span>
                              <Tooltip title={`Resource code: ${row.resource} (${Object.keys(row.permissions).length} controls)`}>
                                <InfoCircleOutlined style={{ color: '#94a3b8', fontSize: 12 }} />
                              </Tooltip>
                            </div>
                          </td>

                          {/* Role Permission Matrix Cells */}
                          {matrix?.roles?.map(role => (
                            <td key={role.id} className="matrix-cell-td">
                              <div className="matrix-btn-group">
                                {standardActions.map(action => {
                                  const perm = resolveCellPermission(row, action);
                                  const config = ACTION_CONFIG[action];

                                  if (!perm) {
                                    return (
                                      <Tooltip key={action} title={`${config.full} not configured for this resource`}>
                                        <span
                                          style={{
                                            width: 27,
                                            height: 24,
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            fontSize: 11,
                                            color: '#cbd5e1',
                                          }}
                                        >
                                          -
                                        </span>
                                      </Tooltip>
                                    );
                                  }

                                  const originalVal = perm.roleGranted[role.id] || false;
                                  const currentVal = isGranted(role.id, perm.permissionId, originalVal);
                                  const key = changeKey(role.id, perm.permissionId);
                                  const hasPendingChange = localChanges.has(key);

                                  return (
                                    <Tooltip
                                      key={action}
                                      title={
                                        <div>
                                          <div style={{ fontWeight: 700 }}>
                                            {config.full}: {currentVal ? 'GRANTED' : 'REVOKED'}
                                          </div>
                                          <div style={{ fontSize: 11, color: '#e2e8f0' }}>{perm.permissionCode}</div>
                                          <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 2 }}>
                                            Role: {role.name} {hasPendingChange ? '(Unsaved Change)' : ''}
                                          </div>
                                        </div>
                                      }
                                      placement="top"
                                    >
                                      <button
                                        type="button"
                                        className={`matrix-act-btn ${
                                          currentVal ? config.classPrefix : 'ungranted'
                                        } ${hasPendingChange ? 'has-pending-change' : ''}`}
                                        onClick={() => togglePermission(role.id, perm.permissionId, originalVal)}
                                      >
                                        {config.label}
                                      </button>
                                    </Tooltip>
                                  );
                                })}

                                {/* Special Workflow Actions (Approve, Post, Submit) if present */}
                                {Object.entries(row.permissions)
                                  .filter(([act]) => !standardActions.includes(act) && !['DEACTIVATE', 'DISCONTINUE', 'EDIT', 'MANAGE'].includes(act))
                                  .map(([act, perm]) => {
                                    const config = ACTION_CONFIG[act] || {
                                      label: act[0],
                                      full: act,
                                      color: '#7c3aed',
                                      classPrefix: 'granted-special',
                                    };
                                    const originalVal = perm.roleGranted[role.id] || false;
                                    const currentVal = isGranted(role.id, perm.permissionId, originalVal);
                                    const key = changeKey(role.id, perm.permissionId);
                                    const hasPendingChange = localChanges.has(key);

                                    return (
                                      <Tooltip
                                        key={act}
                                        title={`${config.full}: ${currentVal ? 'GRANTED' : 'REVOKED'} (${perm.permissionCode})`}
                                      >
                                        <button
                                          type="button"
                                          className={`matrix-act-btn ${
                                            currentVal ? config.classPrefix : 'ungranted'
                                          } ${hasPendingChange ? 'has-pending-change' : ''}`}
                                          onClick={() => togglePermission(role.id, perm.permissionId, originalVal)}
                                        >
                                          {config.label}
                                        </button>
                                      </Tooltip>
                                    );
                                  })}
                              </div>
                            </td>
                          ))}
                        </tr>
                      )}
                    </React.Fragment>
                  );
                });
              })()}
            </tbody>
          </table>
        </div>

        {filteredRows.length === 0 && (
          <div style={{ padding: 40, textAlign: 'center' }}>
            <Empty description="No modules or resources match your filter criteria." />
          </div>
        )}
      </Card>

      {/* Legend Information Toolbar */}
      <div style={{ marginTop: 18, display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'center' }}>
        {Object.entries(ACTION_CONFIG).map(([act, config]) => (
          <Space key={act} size={6}>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 22,
                height: 20,
                fontSize: 10,
                fontWeight: 700,
                borderRadius: 4,
                color: '#ffffff',
                background: config.color,
                boxShadow: '0 2px 4px rgba(0, 0, 0, 0.15)',
              }}
            >
              {config.label}
            </span>
            <span style={{ fontSize: 12, color: 'var(--theme-text-muted, #64748b)', fontWeight: 500 }}>
              = {config.full}
            </span>
          </Space>
        ))}
        <Space size={6} style={{ marginLeft: 'auto' }}>
          <span className="matrix-act-btn ungranted" style={{ width: 22, height: 20, fontSize: 10 }}>-</span>
          <span style={{ fontSize: 12, color: 'var(--theme-text-muted, #64748b)' }}>= Revoked / Inactive</span>
        </Space>
      </div>

      {/* Floating Bottom Save Dock (Appears when user has unsaved changes) */}
      {hasChanges && (
        <div className="matrix-floating-save-dock" data-testid="matrix-floating-save-dock">
          <span className="matrix-save-dock-pulse" />
          <span className="matrix-save-dock-text">
            Unsaved Changes: {localChanges.size} permission toggle(s)
          </span>
          <Button
            type="primary"
            icon={<SaveOutlined />}
            loading={saving}
            onClick={handleSave}
            className="matrix-save-dock-btn"
          >
            Save Changes Now
          </Button>
          <Button
            type="text"
            icon={<UndoOutlined />}
            onClick={handleDiscardChanges}
            style={{ color: '#cbd5e1' }}
          >
            Discard
          </Button>
        </div>
      )}

      {/* Animated Save Result Dialog Feedback */}
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

export default PermissionMatrix;
