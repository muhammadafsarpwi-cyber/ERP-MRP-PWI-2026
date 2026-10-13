import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  App,
  Button,
  Card,
  Empty,
  Input,
  Popconfirm,
  Space,
  Table,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import {
  AppstoreOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  DeleteOutlined,
  InfoCircleOutlined,
  ReloadOutlined,
  RollbackOutlined,
  SafetyCertificateOutlined,
  SearchOutlined,
  UserOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';

import apiService from '../../services/api';
import { usePermission } from '../../hooks/usePermission';
import { PageHeader } from '../../components/shared';
import './recycleBin.css';

const { Text, Paragraph } = Typography;

// ─── Module contract (mirrors backend `modules/recycle-bin`) ────────────────

export type RecycleBinType =
  | 'production-entries'
  | 'job-cards'
  | 'hand-packing'
  | 'dispatch'
  | 'customers'
  | 'sales-quotations'
  | 'production-orders'
  | 'boms'
  | 'pm-plans'
  | 'store-issues'
  | 'store-returns'
  | 'store-requests'
  | 'qc-plans'
  | 'pm-schedules'
  | 'sales-orders'
  | 'sales-invoices'
  | 'gate-passes';

export interface RecycleBinRow {
  id: string;
  module: RecycleBinType;
  deletedAt: string | null;
  componentName: string;
  summary: string;
  detail: string | null;
  deletedBy: string | null;
  deletedById: string | null;
  context: Record<string, string | number | null>;
}

interface TabSpec {
  key: RecycleBinType;
  emoji: string;
  label: string;
  shortLabel: string;
  dept: string;
  blurb: string;
}

export const TABS: TabSpec[] = [
  // ── Production ─────────────────────────────────────────────────────────
  {
    key: 'production-entries',
    emoji: '🏭',
    label: 'Production Entries',
    shortLabel: 'Prod Entries',
    dept: 'Production',
    blurb: 'Daily production documents and their child item lines',
  },
  {
    key: 'hand-packing',
    emoji: '📦',
    label: 'Hand Packing Rows',
    shortLabel: 'Hand Pack',
    dept: 'Production',
    blurb: 'Hand Packing entries (production entries tagged HAND-PACK)',
  },
  {
    key: 'production-orders',
    emoji: '🏭',
    label: 'Production Orders',
    shortLabel: 'Work Orders',
    dept: 'Production',
    blurb: 'Manufacturing work orders and their routing operations',
  },
  {
    key: 'boms',
    emoji: '📐',
    label: 'Bill of Materials',
    shortLabel: 'BOMs',
    dept: 'Production',
    blurb: 'Bill-of-materials definitions and their component lines',
  },
  // ── Maintenance ────────────────────────────────────────────────────────
  {
    key: 'job-cards',
    emoji: '🔧',
    label: 'Maintenance Job Cards',
    shortLabel: 'Job Cards',
    dept: 'Maintenance',
    blurb: 'Maintenance job cards and their spare-part lines',
  },
  {
    key: 'pm-plans',
    emoji: '🔧',
    label: 'PM Plans',
    shortLabel: 'PM Plans',
    dept: 'Maintenance',
    blurb: 'Preventive-maintenance plan definitions',
  },
  {
    key: 'pm-schedules',
    emoji: '🗓️',
    label: 'PM Schedules',
    shortLabel: 'PM Scheds',
    dept: 'Maintenance',
    blurb: 'Generated preventative-maintenance schedule instances',
  },
  // ── Store ──────────────────────────────────────────────────────────────
  {
    key: 'store-issues',
    emoji: '🏬',
    label: 'Goods Outward Notes',
    shortLabel: 'Outward',
    dept: 'Store',
    blurb: 'Material issues — stock leaving the store',
  },
  {
    key: 'store-returns',
    emoji: '📥',
    label: 'Goods Inward Notes',
    shortLabel: 'Inward',
    dept: 'Store',
    blurb: 'Material returns — stock coming back into the store',
  },
  {
    key: 'store-requests',
    emoji: '📝',
    label: 'Store Requisitions',
    shortLabel: 'Requests',
    dept: 'Store',
    blurb: 'Material requests raised by departments',
  },
  // ── Quality Control ────────────────────────────────────────────────────
  {
    key: 'qc-plans',
    emoji: '🔬',
    label: 'QC Inspection Plans',
    shortLabel: 'QC Plans',
    dept: 'Quality',
    blurb: 'Inspection templates and their parameter tolerance matrices',
  },
  // ── Sales ──────────────────────────────────────────────────────────────
  {
    key: 'sales-quotations',
    emoji: '💰',
    label: 'Sales Quotations',
    shortLabel: 'Quotes',
    dept: 'Sales',
    blurb: 'Draft sales quotations and their quoted item lines',
  },
  {
    key: 'sales-orders',
    emoji: '🧾',
    label: 'Customer Purchase Orders',
    shortLabel: 'Cust POs',
    dept: 'Sales',
    blurb: 'Customer purchase orders and their ordered item lines',
  },
  {
    key: 'sales-invoices',
    emoji: '💳',
    label: 'Sales Invoices',
    shortLabel: 'Invoices',
    dept: 'Sales',
    blurb: 'Sales invoices raised against customer orders',
  },
  {
    key: 'customers',
    emoji: '👥',
    label: 'Customer Directory',
    shortLabel: 'Customers',
    dept: 'Sales',
    blurb: 'Customer accounts, contacts and addresses',
  },
  // ── Logistics ──────────────────────────────────────────────────────────
  {
    key: 'gate-passes',
    emoji: '🎫',
    label: 'Gate Passes',
    shortLabel: 'Gate Pass',
    dept: 'Logistics',
    blurb: 'Outbound gate passes (sales deliveries) and their packed lines',
  },
  {
    key: 'dispatch',
    emoji: '🚚',
    label: 'Dispatch Packages',
    shortLabel: 'Dispatch',
    dept: 'Logistics',
    blurb: 'Dispatch packages and their packed production units',
  },
];

export const numCellStyle: React.CSSProperties = {
  fontVariantNumeric: 'tabular-nums',
  fontSize: 12,
  fontWeight: 600,
  whiteSpace: 'nowrap',
  padding: '6px 8px',
  lineHeight: '18px',
};

const denseTextCellStyle: React.CSSProperties = {
  ...numCellStyle,
  fontWeight: 500,
  whiteSpace: 'normal',
  maxWidth: 260,
};

const DenseCell: React.FC<any> = ({ children, ...rest }) => (
  <td {...rest} style={{ ...numCellStyle, ...(rest.style || {}) }}>
    {children}
  </td>
);

const denseTableComponents = {
  body: { cell: DenseCell },
};

// ─── Main Page Component ────────────────────────────────────────────────────

const RecycleBinPage: React.FC = () => {
  const { message } = App.useApp();
  const { canAny } = usePermission();

  const [activeTab, setActiveTab] = useState<RecycleBinType>('production-entries');
  const [rows, setRows] = useState<Partial<Record<RecycleBinType, RecycleBinRow[]>>>({});
  const [counts, setCounts] = useState<Partial<Record<RecycleBinType, number>>>({});
  const [loadingKey, setLoadingKey] = useState<RecycleBinType | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');

  const messageRef = useRef(message);
  useEffect(() => {
    messageRef.current = message;
  }, [message]);

  const canRestore = useMemo(
    () =>
      canAny(
        'admin.recycle_bin.restore',
        'admin.users.view',
        'admin.roles.view',
        'admin.permissions.view',
      ),
    [canAny],
  );

  const canPurge = useMemo(
    () =>
      canAny(
        'admin.recycle_bin.purge',
        'admin.users.view',
        'admin.roles.view',
        'admin.permissions.view',
      ),
    [canAny],
  );

  const loadTab = useCallback(async (type: RecycleBinType) => {
    setLoadingKey(type);
    try {
      const res: any = await apiService.get(`/admin/recycle-bin/${type}?limit=500`);
      setRows((prev) => ({ ...prev, [type]: (res?.data as RecycleBinRow[]) || [] }));
    } catch (err: any) {
      messageRef.current?.error(err?.response?.data?.message || 'Could not load the Recycle Bin');
      setRows((prev) => ({ ...prev, [type]: [] }));
    } finally {
      setLoadingKey(null);
    }
  }, []);

  const loadCounts = useCallback(async () => {
    try {
      const res: any = await apiService.get('/admin/recycle-bin');
      setCounts((res?.data as Record<RecycleBinType, number>) || {});
    } catch {
      // Badge counts are decorative — a failure here must never block the grid.
    }
  }, []);

  const refresh = useCallback(
    (type?: RecycleBinType) => {
      void loadCounts();
      void loadTab(type ?? activeTab);
    },
    [activeTab, loadCounts, loadTab],
  );

  useEffect(() => {
    void loadCounts();
  }, [loadCounts]);

  useEffect(() => {
    void loadTab(activeTab);
  }, [activeTab, loadTab]);

  const handleRestore = useCallback(
    async (type: RecycleBinType, row: RecycleBinRow) => {
      setBusyId(row.id);
      try {
        const res: any = await apiService.post(`/admin/recycle-bin/${type}/${row.id}/restore`);
        messageRef.current?.success(res?.message || `${row.summary} restored`);
        setRows((prev) => ({
          ...prev,
          [type]: (prev[type] || []).filter((r) => r.id !== row.id),
        }));
        refresh(type);
      } catch (err: any) {
        messageRef.current?.error(err?.response?.data?.message || 'Could not restore this record');
      } finally {
        setBusyId(null);
      }
    },
    [refresh],
  );

  const handlePurge = useCallback(
    async (type: RecycleBinType, row: RecycleBinRow) => {
      setBusyId(row.id);
      try {
        await apiService.delete(`/admin/recycle-bin/${type}/${row.id}`);
        messageRef.current?.success(`${row.summary} permanently deleted`);
        setRows((prev) => ({
          ...prev,
          [type]: (prev[type] || []).filter((r) => r.id !== row.id),
        }));
        refresh(type);
      } catch (err: any) {
        messageRef.current?.error(
          err?.response?.data?.message ||
            'Could not permanently delete this record — it may still be referenced',
        );
      } finally {
        setBusyId(null);
      }
    },
    [refresh],
  );

  // ── KPI Metrics Calculations ──────────────────────────────────────────────
  const totalTrashed = useMemo(
    () => Object.values(counts).reduce((acc: number, val) => acc + (val || 0), 0),
    [counts],
  );

  const activeModulesCount = useMemo(
    () => Object.values(counts).filter((val) => (val || 0) > 0).length,
    [counts],
  );

  const activeSpec = useMemo(
    () => TABS.find((t) => t.key === activeTab) ?? TABS[0],
    [activeTab],
  );
  const activeRows = rows[activeSpec.key] ?? [];
  const activeIsLoading = loadingKey === activeSpec.key;
  const activeCount = counts[activeSpec.key] ?? activeRows.length ?? 0;

  // Search filter
  const filteredRows = useMemo(() => {
    if (!searchQuery.trim()) return activeRows;
    const q = searchQuery.toLowerCase().trim();
    return activeRows.filter((r) => {
      const summaryMatch = (r.summary || '').toLowerCase().includes(q);
      const detailMatch = (r.detail || '').toLowerCase().includes(q);
      const compMatch = (r.componentName || '').toLowerCase().includes(q);
      const byMatch = (r.deletedBy || '').toLowerCase().includes(q);
      const ctxMatch = Object.values(r.context || {}).some((v) =>
        String(v || '').toLowerCase().includes(q),
      );
      return summaryMatch || detailMatch || compMatch || byMatch || ctxMatch;
    });
  }, [activeRows, searchQuery]);

  // ── High-Standard Enterprise Table Columns ─────────────────────────────────
  const buildColumns = useCallback(
    (type: RecycleBinType): ColumnsType<RecycleBinRow> => [
      {
        title: 'Date Deleted',
        key: 'deletedAt',
        width: 160,
        sorter: (a, b) =>
          new Date(a.deletedAt || 0).getTime() - new Date(b.deletedAt || 0).getTime(),
        defaultSortOrder: 'descend',
        render: (_, row) => {
          if (!row.deletedAt) return <Text type="secondary">—</Text>;
          const when = new Date(row.deletedAt);
          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600 }}>
                <ClockCircleOutlined style={{ fontSize: 12, color: 'var(--theme-text-secondary, #64748b)' }} />
                <span>{when.toLocaleDateString()}</span>
              </div>
              <Text type="secondary" style={{ fontSize: 11, paddingLeft: 18 }}>
                {when.toLocaleTimeString()}
              </Text>
            </div>
          );
        },
      },
      {
        title: 'Source Component / Item',
        key: 'componentName',
        width: 230,
        render: (_, row) => (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span
              style={{
                fontWeight: 600,
                fontSize: 12.5,
                color: 'var(--theme-text, #f8fafc)',
              }}
              title={row.componentName}
            >
              {row.componentName || '—'}
            </span>
            {row.detail && row.detail !== row.componentName ? (
              <span
                style={{
                  fontSize: 11,
                  color: 'var(--theme-text-secondary, #64748b)',
                }}
                title={row.detail}
              >
                {row.detail}
              </span>
            ) : null}
          </div>
        ),
      },
      {
        title: 'Record Summary & Parameters',
        key: 'summary',
        width: 320,
        render: (_, row) => (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <span
                style={{
                  background: 'rgba(99, 102, 241, 0.15)',
                  border: '1px solid rgba(99, 102, 241, 0.35)',
                  color: '#818cf8',
                  padding: '2px 8px',
                  borderRadius: 5,
                  fontFamily: 'monospace',
                  fontSize: 11.5,
                  fontWeight: 700,
                }}
              >
                {row.summary}
              </span>
              {row.context?.machine ? (
                <span
                  style={{
                    background: 'rgba(15, 23, 42, 0.6)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    padding: '2px 7px',
                    borderRadius: 4,
                    fontSize: 11,
                    color: 'var(--theme-text-secondary, #94a3b8)',
                  }}
                >
                  Machine: <strong>{String(row.context.machine)}</strong>
                </span>
              ) : null}
              {row.context?.operator ? (
                <span
                  style={{
                    background: 'rgba(15, 23, 42, 0.6)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    padding: '2px 7px',
                    borderRadius: 4,
                    fontSize: 11,
                    color: 'var(--theme-text-secondary, #94a3b8)',
                  }}
                >
                  Op: {String(row.context.operator)}
                </span>
              ) : null}
              {row.context?.goodQty !== null && row.context?.goodQty !== undefined ? (
                <span
                  style={{
                    background: 'rgba(16, 185, 129, 0.12)',
                    border: '1px solid rgba(16, 185, 129, 0.25)',
                    padding: '2px 7px',
                    borderRadius: 4,
                    fontSize: 11,
                    color: '#34d399',
                    fontWeight: 600,
                  }}
                >
                  Good Qty: {Number(row.context.goodQty).toLocaleString()}
                </span>
              ) : null}
            </div>
            {/* Context chips */}
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {Object.entries(row.context || {})
                .filter(([k]) => !['machine', 'operator', 'goodQty', 'source'].includes(k))
                .slice(0, 3)
                .map(([k, v]) => (
                  <Tag
                    key={k}
                    style={{
                      fontSize: 10.5,
                      margin: 0,
                      background: 'rgba(255, 255, 255, 0.04)',
                      borderColor: 'rgba(255, 255, 255, 0.08)',
                      color: 'var(--theme-text-muted, #94a3b8)',
                    }}
                  >
                    {k}: {v === null || v === '' ? '—' : String(v)}
                  </Tag>
                ))}
            </div>
          </div>
        ),
      },
      {
        title: 'Deleted By',
        key: 'deletedBy',
        width: 180,
        render: (_, row) =>
          row.deletedBy ? (
            <Tooltip title={row.deletedById || 'User ID'}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: '50%',
                    background: 'rgba(99, 102, 241, 0.2)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 11,
                    color: '#818cf8',
                  }}
                >
                  <UserOutlined />
                </div>
                <span style={{ fontSize: 12, fontWeight: 500 }}>{row.deletedBy}</span>
              </div>
            </Tooltip>
          ) : (
            <Text type="secondary">—</Text>
          ),
      },
      {
        title: 'Actions',
        key: 'actions',
        width: 160,
        fixed: 'right',
        render: (_, row) => (
          <Space size={8}>
            {canRestore ? (
              <Tooltip title="Restore this record back into active live operations">
                <Button
                  size="small"
                  className="rb-restore-btn"
                  icon={<RollbackOutlined />}
                  loading={busyId === row.id}
                  onClick={() => handleRestore(type, row)}
                >
                  Restore
                </Button>
              </Tooltip>
            ) : (
              <Text type="secondary" style={{ fontSize: 11 }}>
                View only
              </Text>
            )}
            {canPurge ? (
              <Popconfirm
                title="Permanently Delete Record?"
                description={
                  <Paragraph style={{ maxWidth: 280, margin: 0 }}>
                    This is an irreversible database purge. Records still referenced by other
                    documents will be safely refused by the server.
                  </Paragraph>
                }
                okText="Yes, delete forever"
                okType="danger"
                cancelText="Cancel"
                onConfirm={() => handlePurge(type, row)}
              >
                <Button
                  size="small"
                  danger
                  className="rb-purge-btn"
                  title="Permanent purge"
                  icon={<DeleteOutlined />}
                  loading={busyId === row.id}
                />
              </Popconfirm>
            ) : null}
          </Space>
        ),
      },
    ],
    [busyId, canPurge, canRestore, handlePurge, handleRestore],
  );

  return (
    <div className="recycle-bin-container">
      {/* ── Top Header Section ─────────────────────────────────────────── */}
      <div className="rb-header-wrap">
        <div className="rb-title-section">
          <div className="rb-title-heading">
            <div className="rb-title-icon-badge">
              <DeleteOutlined />
            </div>
            <div>
              <h2
                style={{
                  margin: 0,
                  fontSize: 22,
                  fontWeight: 700,
                  color: 'var(--theme-text, #f8fafc)',
                  letterSpacing: '-0.02em',
                }}
              >
                Universal Recycle Bin
              </h2>
              <p
                style={{
                  margin: '2px 0 0',
                  fontSize: 12.5,
                  color: 'var(--theme-text-secondary, #94a3b8)',
                }}
              >
                Universal soft-delete recovery engine & audit trail — nothing is ever destroyed by mistake
              </p>
            </div>
          </div>
          <Button
            type="primary"
            icon={<ReloadOutlined />}
            onClick={() => refresh()}
            style={{
              background: '#4f46e5',
              borderColor: '#4338ca',
              borderRadius: 8,
              height: 36,
              fontWeight: 600,
              boxShadow: '0 2px 8px rgba(79, 70, 229, 0.3)',
            }}
          >
            Refresh Data
          </Button>
        </div>

        {/* ── 4 KPI Summary Cards ─────────────────────────────────────── */}
        <div className="rb-kpi-grid">
          <div className="rb-kpi-card" style={{ '--kpi-accent': '#ef4444', '--kpi-bg': 'rgba(239, 68, 68, 0.12)' } as any}>
            <div className="rb-kpi-content">
              <span className="rb-kpi-title">Total Trashed</span>
              <span className="rb-kpi-value">{totalTrashed}</span>
              <span className="rb-kpi-subtext">Across all enterprise modules</span>
            </div>
            <div className="rb-kpi-icon">
              <DeleteOutlined />
            </div>
          </div>

          <div className="rb-kpi-card" style={{ '--kpi-accent': '#3b82f6', '--kpi-bg': 'rgba(59, 130, 246, 0.12)' } as any}>
            <div className="rb-kpi-content">
              <span className="rb-kpi-title">Active Trays</span>
              <span className="rb-kpi-value">{activeModulesCount}</span>
              <span className="rb-kpi-subtext">Modules containing deleted items</span>
            </div>
            <div className="rb-kpi-icon">
              <AppstoreOutlined />
            </div>
          </div>

          <div className="rb-kpi-card" style={{ '--kpi-accent': '#10b981', '--kpi-bg': 'rgba(16, 185, 129, 0.12)' } as any}>
            <div className="rb-kpi-content">
              <span className="rb-kpi-title">Retention Policy</span>
              <span className="rb-kpi-value">30 Days</span>
              <span className="rb-kpi-subtext">Automated safety backup window</span>
            </div>
            <div className="rb-kpi-icon">
              <ClockCircleOutlined />
            </div>
          </div>

          <div className="rb-kpi-card" style={{ '--kpi-accent': '#f59e0b', '--kpi-bg': 'rgba(245, 158, 11, 0.12)' } as any}>
            <div className="rb-kpi-content">
              <span className="rb-kpi-title">Security Status</span>
              <span className="rb-kpi-value" style={{ fontSize: 18, paddingTop: 3 }}>
                Role Guarded
              </span>
              <span className="rb-kpi-subtext">Admin-only permanent purge</span>
            </div>
            <div className="rb-kpi-icon">
              <SafetyCertificateOutlined />
            </div>
          </div>
        </div>

        {/* ── Enterprise Security / Audit Banner ──────────────────────── */}
        <div className="rb-security-banner">
          <SafetyCertificateOutlined className="rb-security-icon" />
          <div className="rb-security-text">
            <strong>Universal Data Protection:</strong> Deleting a record hides it from live operations while preserving its child lines and complete audit history.
            <span className="rb-security-highlight"> 1-Click Restore</span> returns records back to their original workspace. Permanent database purge is restricted to system administrators.
          </div>
        </div>

        {/* ── Controls Bar: Search & Quick Filter ─────────────────────── */}
        <div className="rb-controls-bar">
          <Input
            placeholder="Search deleted records by slip, item code, machine, operator, or user..."
            prefix={<SearchOutlined style={{ color: 'var(--theme-text-secondary, #94a3b8)' }} />}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            allowClear
            className="rb-search-input"
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 12, color: 'var(--theme-text-secondary, #94a3b8)' }}>
              Showing: <strong style={{ color: 'var(--theme-text, #f8fafc)' }}>{activeSpec.label}</strong>
            </span>
            <Tag
              color={activeCount > 0 ? 'volcano' : 'default'}
              style={{ margin: 0, fontWeight: 700, borderRadius: 999 }}
            >
              {activeCount} {activeCount === 1 ? 'record' : 'records'}
            </Tag>
          </div>
        </div>
      </div>

      {/* ── Department Switchboard Tabs with High-Contrast Badges ──────── */}
      <div className="erp-module-tabs" role="tablist" aria-label="Recycle Bin departments">
        {TABS.map((tab) => {
          const selected = tab.key === activeSpec.key;
          const n = counts[tab.key] ?? rows[tab.key]?.length ?? 0;
          const isLoading = loadingKey === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              role="tab"
              id={`rb-tab-${tab.key}`}
              aria-selected={selected}
              aria-controls="rb-panel"
              onClick={() => setActiveTab(tab.key)}
              className="rb-tab-btn"
              title={`${tab.label} — ${tab.dept}`}
            >
              <div className="rb-tab-header">
                <div className="rb-tab-title">
                  <span aria-hidden="true">{tab.emoji}</span>
                  <span>{tab.shortLabel}</span>
                </div>
                <span className={`rb-tab-badge ${n > 0 ? 'rb-tab-badge--active' : 'rb-tab-badge--zero'}`}>
                  {n}
                </span>
              </div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  width: '100%',
                }}
              >
                <span className="rb-tab-dept">{tab.dept}</span>
                {isLoading ? <ReloadOutlined spin style={{ fontSize: 10, color: '#6366f1' }} /> : null}
              </div>
            </button>
          );
        })}
      </div>

      {/* ── Active Department Data Table ───────────────────────────────── */}
      <div id="rb-panel" role="tabpanel" aria-labelledby={`rb-tab-${activeSpec.key}`}>
        <div className="rb-table-card">
          <div className="rb-table-banner">
            <div>
              <Text strong style={{ fontSize: 13, color: 'var(--theme-text, #f8fafc)' }}>
                {activeSpec.label}
              </Text>
              <Text
                type="secondary"
                style={{ fontSize: 12, marginLeft: 8, color: 'var(--theme-text-secondary, #94a3b8)' }}
              >
                — {activeSpec.blurb}
              </Text>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {canRestore ? (
                <span style={{ fontSize: 11.5, color: '#10b981', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <CheckCircleOutlined /> 1-Click Instant Restore Enabled
                </span>
              ) : (
                <span style={{ fontSize: 11.5, color: '#94a3b8' }}>Read-only audit view</span>
              )}
            </div>
          </div>

          <Table<RecycleBinRow>
            rowKey="id"
            size="small"
            components={denseTableComponents}
            loading={activeIsLoading}
            columns={buildColumns(activeSpec.key)}
            dataSource={filteredRows}
            pagination={
              filteredRows.length > 50
                ? { pageSize: 50, showSizeChanger: false, showTotal: (t) => `${t} records` }
                : false
            }
            scroll={{ x: 1060 }}
            locale={{
              emptyText: (
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description={
                    searchQuery
                      ? `No deleted records match "${searchQuery}" in ${activeSpec.label}`
                      : `No deleted records in ${activeSpec.label}`
                  }
                />
              ),
            }}
          />
        </div>
      </div>
    </div>
  );
};

export default RecycleBinPage;
