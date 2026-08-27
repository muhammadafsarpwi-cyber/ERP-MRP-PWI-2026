import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Card, Tag, Button, Space, Input, Select, message, Spin, Tooltip, Popconfirm } from 'antd';
import { SaveOutlined, SearchOutlined, ReloadOutlined, DownOutlined, RightOutlined, CompressOutlined, ExpandOutlined } from '@ant-design/icons';
import apiService from '../../services/api';

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
  organization: '#C3A9FF',
  admin: '#FF8F8A',
  item: '#79D5EC',
  inventory: '#74DECF',
  procurement: '#FFAE7E',
  customer: '#7BDC9E',
  sales: '#82CBF0',
  manufacturing: '#F6CE7A',
  maintenance: '#2E8B8B',
};

const ACTION_LABELS: Record<string, string> = {
  VIEW: 'V',
  CREATE: 'A',
  UPDATE: 'E',
  DELETE: 'D',
};

const ACTION_FULL_LABELS: Record<string, string> = {
  VIEW: 'View',
  CREATE: 'Add/Create',
  UPDATE: 'Edit/Update',
  DELETE: 'Delete',
};

const ACTION_COLORS: Record<string, string> = {
  VIEW: '#1890ff',
  CREATE: '#52c41a',
  UPDATE: '#faad14',
  DELETE: '#ff4d4f',
};

type ChangeMap = Map<string, boolean>;

const PermissionMatrix: React.FC = () => {
  const [matrix, setMatrix] = useState<PermissionMatrixData | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [filterModule, setFilterModule] = useState<string | undefined>();
  const [localChanges, setLocalChanges] = useState<ChangeMap>(new Map());
  const [collapsedModules, setCollapsedModules] = useState<Set<string>>(new Set());

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
  }, []);

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
        r.module.toLowerCase().includes(lower)
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
    setLocalChanges(prev => {
      const next = new Map(prev);
      next.set(key, !originalValue);
      return next;
    });
  }, [changeKey]);

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

  const handleSave = useCallback(async () => {
    if (!matrix || localChanges.size === 0) return;
    setSaving(true);
    try {
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
      message.success('Permissions saved successfully');
      await fetchMatrix();
    } catch (error) {
      message.error('Failed to save permissions. Please try again.');
    } finally {
      setSaving(false);
    }
  }, [matrix, localChanges, fetchMatrix]);

  const handleToggleAll = useCallback((roleId: string, action: string, value: boolean) => {
    if (!matrix) return;
    setLocalChanges(prev => {
      const next = new Map(prev);
      for (const row of matrix.rows) {
        const perm = row.permissions[action];
        if (perm) {
          const key = changeKey(roleId, perm.permissionId);
          next.set(key, value);
        }
      }
      return next;
    });
  }, [matrix, changeKey]);

  const allActions = ['VIEW', 'CREATE', 'UPDATE', 'DELETE'];

  if (!matrix) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
        <Spin size="large" />
      </div>
    );
  }

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>Roles & Permissions</h2>
        <p style={{ margin: '4px 0 0', color: 'var(--theme-text-muted)', fontSize: 14 }}>
          Manage access to ERP modules and actions for each role.
        </p>
      </div>

      <Card
        styles={{ body: { padding: 0, overflow: 'visible' } }}
        style={{ overflow: 'visible' }}
        extra={
          <Space>
            <Input
              placeholder="Search modules..."
              prefix={<SearchOutlined />}
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ width: 220 }}
              allowClear
            />
            <Select
              placeholder="All Modules"
              value={filterModule}
              onChange={setFilterModule}
              allowClear
              style={{ width: 160 }}
            >
              {matrix.modules.map(mod => (
                <Select.Option key={mod} value={mod}>
                  {matrix.moduleLabels[mod] || mod}
                </Select.Option>
              ))}
            </Select>
            <Button icon={<ReloadOutlined />} onClick={fetchMatrix} loading={loading}>
              Refresh
            </Button>
            <Button
              icon={collapsedModules.size === matrix.modules.length ? <ExpandOutlined /> : <CompressOutlined />}
              onClick={toggleAllModules}
            >
              {collapsedModules.size === matrix.modules.length ? 'Expand All' : 'Collapse All'}
            </Button>
            <Popconfirm
              title="Save permission changes?"
              description="This will update role permissions immediately."
              onConfirm={handleSave}
              okButtonProps={{ loading: saving }}
              okText="Save"
              cancelText="Cancel"
            >
              <Button
                type="primary"
                icon={<SaveOutlined />}
                disabled={!hasChanges}
                loading={saving}
              >
                Save Changes {hasChanges && `(${localChanges.size})`}
              </Button>
            </Popconfirm>
          </Space>
        }
      >
        <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
          <table
            style={{
              borderCollapse: 'collapse',
              fontSize: 13,
              minWidth: 'max-content',
            }}
          >
            <thead>
              <tr style={{ borderBottom: '2px solid var(--theme-border)' }}>
                <th
                  style={{
                    padding: '12px 16px',
                    textAlign: 'left',
                    fontWeight: 600,
                    fontSize: 13,
                    color: 'var(--theme-text)',
                    position: 'sticky',
                    left: 0,
                    background: 'var(--theme-surface)',
                    zIndex: 2,
                    minWidth: 200,
                    borderBottom: '2px solid var(--theme-border)',
                  }}
                >
                  Module / Page
                </th>
                {matrix.roles.map(role => (
                  <th
                    key={role.id}
                    style={{
                      padding: '8px 4px',
                      textAlign: 'center',
                      fontWeight: 600,
                      fontSize: 12,
                      color: 'var(--theme-text)',
                      borderBottom: '2px solid var(--theme-border)',
                      minWidth: 120,
                    }}
                  >
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                      <span style={{ fontWeight: 600 }}>{role.name}</span>
                      {role.isSystemRole && (
                        <Tag color="gold" style={{ fontSize: 10, lineHeight: '14px', padding: '0 4px', margin: 0 }}>
                          System
                        </Tag>
                      )}
                      <div style={{ display: 'flex', gap: 2, marginTop: 2 }}>
                        {allActions.map(action => (
                          <Tooltip key={action} title={`Toggle all ${ACTION_FULL_LABELS[action]}`} placement="top">
                            <button
                              onClick={() => {
                                const firstPerm = matrix.rows[0]?.permissions[action];
                                if (firstPerm) {
                                  const currentVal = isGranted(role.id, firstPerm.permissionId, firstPerm.roleGranted[role.id]);
                                  handleToggleAll(role.id, action, !currentVal);
                                }
                              }}
                              style={{
                                width: 20,
                                height: 16,
                                fontSize: 9,
                                fontWeight: 700,
                                border: `1px solid ${ACTION_COLORS[action]}40`,
                                borderRadius: 3,
                                cursor: 'pointer',
                                background: 'transparent',
                                color: ACTION_COLORS[action],
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                padding: 0,
                              }}
                            >
                              {ACTION_LABELS[action]}
                            </button>
                          </Tooltip>
                        ))}
                      </div>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(() => {
                let lastModule: string | null = null;
                return filteredRows.map((row) => {
                  const showModuleHeader = row.module !== lastModule;
                  lastModule = row.module;
                  const isCollapsed = collapsedModules.has(row.module) && !search;
                  if (isCollapsed && !showModuleHeader) return null;
                  return (
                    <React.Fragment key={`${row.module}-${row.resource}`}>
                      {showModuleHeader && (
                        <tr>
                          <td
                            colSpan={matrix.roles.length + 1}
                            style={{
                              padding: '10px 16px 4px',
                              fontWeight: 700,
                              fontSize: 11,
                              textTransform: 'uppercase',
                              letterSpacing: '0.5px',
                              color: MODULE_COLORS[row.module] || 'var(--theme-text)',
                              background: 'var(--theme-surface-alt)',
                              borderBottom: '1px solid var(--theme-border)',
                              cursor: 'pointer',
                              userSelect: 'none',
                            }}
                            onClick={() => toggleModule(row.module)}
                          >
                            <span
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                width: 16,
                                height: 16,
                                marginRight: 6,
                                verticalAlign: 'middle',
                              }}
                            >
                              {collapsedModules.has(row.module)
                                ? <RightOutlined style={{ fontSize: 9 }} />
                                : <DownOutlined style={{ fontSize: 9 }} />}
                            </span>
                            <span
                              style={{
                                display: 'inline-block',
                                width: 8,
                                height: 8,
                                borderRadius: 2,
                                background: MODULE_COLORS[row.module] || '#999',
                                marginRight: 8,
                                verticalAlign: 'middle',
                              }}
                            />
                            {matrix.moduleLabels[row.module] || row.module}
                            <span style={{ fontWeight: 400, marginLeft: 8, opacity: 0.6 }}>
                              ({filteredRows.filter(r => r.module === row.module).length})
                            </span>
                          </td>
                        </tr>
                      )}
                      {!isCollapsed && (
                      <tr style={{ borderBottom: '1px solid var(--theme-border)' }}>
                        <td
                          style={{
                            padding: '10px 16px',
                            fontWeight: 500,
                            fontSize: 13,
                            color: 'var(--theme-text)',
                            position: 'sticky',
                            left: 0,
                            background: 'var(--theme-background, #fff)',
                            zIndex: 1,
                            borderRight: '1px solid var(--theme-border)',
                            minWidth: 200,
                          }}
                        >
                          {row.resourceName}
                        </td>
                        {matrix.roles.map(role => (
                          <td
                            key={role.id}
                            style={{
                              padding: '6px 4px',
                              textAlign: 'center',
                              borderBottom: '1px solid var(--theme-border)',
                              minWidth: 120,
                            }}
                          >
                            <div style={{ display: 'flex', gap: 2, justifyContent: 'center' }}>
                              {allActions.map(action => {
                                const perm = row.permissions[action];
                                if (!perm) {
                                  return (
                                    <span
                                      key={action}
                                      style={{
                                        width: 26,
                                        height: 22,
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        fontSize: 10,
                                        color: '#ccc',
                                      }}
                                    >
                                      -
                                    </span>
                                  );
                                }
                                const originalVal = perm.roleGranted[role.id] || false;
                                const currentVal = isGranted(role.id, perm.permissionId, originalVal);
                                return (
                                  <Tooltip key={action} title={`${ACTION_FULL_LABELS[action]}: ${perm.permissionCode}`} placement="top">
                                    <button
                                      onClick={() => togglePermission(role.id, perm.permissionId, originalVal)}
                                      style={{
                                        width: 26,
                                        height: 22,
                                        fontSize: 10,
                                        fontWeight: 700,
                                        border: `1.5px solid ${currentVal ? ACTION_COLORS[action] : '#d9d9d9'}`,
                                        borderRadius: 4,
                                        cursor: 'pointer',
                                        background: currentVal ? `${ACTION_COLORS[action]}18` : 'transparent',
                                        color: currentVal ? ACTION_COLORS[action] : '#bbb',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        padding: 0,
                                        transition: 'all 0.15s ease',
                                      }}
                                    >
                                      {ACTION_LABELS[action]}
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
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--theme-text-muted)' }}>
            No modules found matching your search.
          </div>
        )}
      </Card>

      <div style={{ marginTop: 16, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        {allActions.map(action => (
          <Space key={action} size={4}>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 22,
                height: 18,
                fontSize: 10,
                fontWeight: 700,
                border: `1.5px solid ${ACTION_COLORS[action]}`,
                borderRadius: 3,
                color: ACTION_COLORS[action],
                background: `${ACTION_COLORS[action]}18`,
              }}
            >
              {ACTION_LABELS[action]}
            </span>
            <span style={{ fontSize: 12, color: 'var(--theme-text-muted)' }}>
              = {ACTION_FULL_LABELS[action]}
            </span>
          </Space>
        ))}
      </div>
    </div>
  );
};

export default PermissionMatrix;
