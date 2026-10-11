import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  App,
  Button,
  Card,
  Empty,
  Popconfirm,
  Space,
  Table,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import {
  DeleteOutlined,
  ReloadOutlined,
  RollbackOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';

import apiService from '../../services/api';
import { usePermission } from '../../hooks/usePermission';
import { PageHeader } from '../../components/shared';

const { Text, Paragraph } = Typography;

// ─── Module contract (mirrors backend `modules/recycle-bin`) ────────────────

/**
 * The trash matrices. `hand-packing` is a VIEW over production entries,
 * not a separate table — the Hand Packing screen writes ordinary production
 * entries tagged with a `HAND-PACK-*` machine number or a `[HAND PACKING]`
 * remark. The two production tabs are kept disjoint so the floor never counts
 * the same trashed lot twice.
 *
 * The Phase-2 entries exist because those screens already had a delete action
 * somewhere in the ERP (quotations were a hard delete; work orders, BOMs and
 * PM plans archived via `is_active = false`). The backend refuses any value
 * outside this union, so both sides must stay in step.
 */
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
  /** Full name — used in the grid heading and the empty-state sentence. */
  label: string;
  /**
   * Compact name for the pill bar. Deliberately short: the bar is a uniform
   * grid of fixed-width blocks, and a long label would either wrap inside its
   * block or force the whole row to reflow, which is exactly the distortion
   * this field exists to prevent.
   */
  shortLabel: string;
  /** Owning department, rendered as a micro-label inside the pill. */
  dept: string;
  blurb: string;
}

/**
 * Ordered by department so the bar reads as a departmental switchboard.
 *
 * EVERY `shortLabel` is prefixed with its department's manufacturing glyph.
 * The bar renders as a SINGLE horizontal row (see `.erp-module-tabs` in
 * `styles/erp-redesign.css`), so a label
 * that had to wrap or shrink would break the block rhythm across all seventeen
 * buttons at once. The prefixes do double duty: they make the department
 * legible at a glance even when the micro-label line below is too small to
 * read, and they keep two similarly-named documents (a PM Plan vs a PM
 * Schedule, a Sales Order vs a Quotation) instantly distinguishable.
 */
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

// ─── High-density compact tracking layout ───────────────────────────────────

/**
 * Our `numCellStyle` tracking geometry, applied to EVERY body cell so the
 * recovery grids keep the same thin, dense row rhythm as the production
 * matrices. Tabular numerals keep counts aligned column-to-column even while
 * the list is being refilled.
 */
export const numCellStyle: React.CSSProperties = {
  fontVariantNumeric: 'tabular-nums',
  fontSize: 12,
  fontWeight: 600,
  whiteSpace: 'nowrap',
  padding: '3px 6px',
  lineHeight: '18px',
};

/** Long-form text may wrap, but never adds a second line to a dense row. */
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

/**
 * Secondary restore action — deliberately not `primary`, never `danger`.
 *
 * Reads from the semantic `success` tokens rather than the old hard-coded
 * teal (`#00897b` / `#4db6ac` / `#e0f2f1`). The intent is identical — a
 * positive, reversible, non-destructive affordance — but the tokens now follow
 * the active palette and flip correctly in dark mode, where the previous
 * `#e0f2f1` fill was a light-teal block that glared against a dark surface.
 * Restore is the primary verb of this screen, so it has to stay legible in
 * both themes.
 */
const restoreButtonStyle: React.CSSProperties = {
  color: 'var(--theme-success)',
  borderColor: 'var(--theme-success)',
  backgroundColor: 'var(--theme-success-soft)',
  fontSize: 12,
  fontWeight: 600,
  padding: '0 8px',
};

// ─── Industrial pill-button switchboard ─────────────────────────────────────

/**
 * The department bar is a grid of uniform industrial BLOCKS, not antd's text
 * tabs — and it is a SINGLE HORIZONTAL ROW of seventeen of them.
 *
 * `gridAutoFlow: 'column'` is what enforces the single row: every button is
 * placed into the NEXT COLUMN rather than the next row, so the bar can never
 * wrap no matter how narrow the viewport gets. `gridAutoColumns` with a
 * `minmax()` floor keeps the blocks uniform — they grow together to fill the
 * available width, and when seventeen buttons can no longer share that width
 * without going below the floor they stop shrinking and the row scrolls
 * horizontally instead. Either way the block rhythm stays intact and the grid
 * never develops a ragged edge or an orphan button on a second line, which is
 * exactly the distortion a wrapping row of differently-sized text tabs
 * produces once a department name runs long.
 */
/*
 * The switchboard's visual treatment now lives in `styles/erp-redesign.css`
 * under `.erp-module-tabs` / `.erp-module-tab*`.
 *
 * These used to be inline styles with hard-coded hex values (`#fafafa`,
 * `#595959`, `#00897b`). That had two real defects: none of them followed the
 * 34-palette theme system, and none of them followed dark mode — the light
 * teal active block and near-white idle blocks were unreadable on a dark
 * surface. Inline styles also could not be restyled by any stylesheet without
 * `!important` on every declaration.
 *
 * The active state is now keyed off `aria-selected` in CSS, so the styling
 * hook is the accessibility contract and the two cannot drift apart.
 */

// ─── Page ───────────────────────────────────────────────────────────────────

const RecycleBinPage: React.FC = () => {
  const { message } = App.useApp();
  const { canAny } = usePermission();

  const [activeTab, setActiveTab] = useState<RecycleBinType>('production-entries');
  const [rows, setRows] = useState<Partial<Record<RecycleBinType, RecycleBinRow[]>>>({});
  const [counts, setCounts] = useState<Partial<Record<RecycleBinType, number>>>({});
  const [loadingKey, setLoadingKey] = useState<RecycleBinType | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  /**
   * `App.useApp()` hands back a FRESH `message` instance on every render, so
   * any `useCallback` that closes over it changes identity each time and the
   * fetch effects below would re-fire in a loop. It is read through a ref so
   * the loaders stay referentially stable and a tab is fetched exactly once
   * per activation.
   */
  const messageRef = useRef(message);
  useEffect(() => {
    messageRef.current = message;
  }, [message]);

  /**
   * READ-ONLY BY DEFAULT. A floor operator may open the Recycle Bin and audit
   * exactly what they and their colleagues deleted — that visibility is the
   * point — but the 🔄 Restore control is not rendered at all without the
   * `admin.recycle_bin.restore` guard. Hiding it rather than disabling it
   * keeps the grid from filling up with greyed-out buttons an operator can
   * never use.
   *
   * The trailing `admin.*.view` codes mirror the backend `PermissionGuard`'s
   * admin-role bypass, so anyone the server would already treat as an admin
   * sees the same controls the server would already allow them to press. This
   * only decides RENDERING: the API remains the authority and refuses a
   * non-admin restore regardless of what the DOM contains.
   */
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

  /**
   * Permanent deletion is server-enforced (`admin.recycle_bin.purge` + the
   * backend's admin-role bypass). This only decides whether the red tray button
   * is even rendered — the API remains the authority and refuses anyone who is
   * not an admin regardless of what the UI shows.
   */
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
        // Drop the row locally for an instant paint, then re-sync the server
        // truth so a document that restored into the OTHER production tab
        // (machine ⇄ hand packing) is reported accurately.
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

  const buildColumns = useCallback(
    (type: RecycleBinType): ColumnsType<RecycleBinRow> => [
      {
        title: 'Date Deleted',
        key: 'deletedAt',
        width: 168,
        sorter: (a, b) =>
          new Date(a.deletedAt || 0).getTime() - new Date(b.deletedAt || 0).getTime(),
        defaultSortOrder: 'descend',
        render: (_, row) => {
          if (!row.deletedAt) return <Text type="secondary">—</Text>;
          const when = new Date(row.deletedAt);
          return (
            <Space size={0} direction="vertical">
              <Text style={numCellStyle}>{when.toLocaleDateString()}</Text>
              <Text type="secondary" style={{ ...numCellStyle, fontWeight: 400 }}>
                {when.toLocaleTimeString()}
              </Text>
            </Space>
          );
        },
      },
      {
        title: 'Source Component/Module',
        key: 'componentName',
        width: 240,
        render: (_, row) => (
          <Text style={denseTextCellStyle} title={row.componentName}>
            {row.componentName || '—'}
          </Text>
        ),
      },
      {
        title: 'Unique Record Summary (IDs/Codes)',
        key: 'summary',
        width: 260,
        render: (_, row) => (
          <Space size={0} direction="vertical">
            <Text code style={numCellStyle}>
              {row.summary}
            </Text>
            {row.detail ? (
              <Text type="secondary" style={{ ...numCellStyle, fontWeight: 400 }} title={row.detail}>
                {row.detail}
              </Text>
            ) : null}
            <Space size={4} wrap>
              {Object.entries(row.context || {})
                .slice(0, 3)
                .map(([k, v]) => (
                  <Tag key={k} style={{ ...numCellStyle, marginRight: 0 }}>
                    {k}: {v === null || v === '' ? '—' : String(v)}
                  </Tag>
                ))}
            </Space>
          </Space>
        ),
      },
      {
        title: 'Deleted By',
        key: 'deletedBy',
        width: 200,
        render: (_, row) =>
          row.deletedBy ? (
            <Tooltip title={row.deletedById}>
              <Text style={numCellStyle}>{row.deletedBy}</Text>
            </Tooltip>
          ) : (
            <Text type="secondary">—</Text>
          ),
      },
      {
        title: 'Actions Bar',
        key: 'actions',
        width: 170,
        fixed: 'right',
        render: (_, row) => (
          <Space size={6}>
            {canRestore ? (
              <Tooltip title="Push this record back into its live functional grid">
                <Button
                  size="small"
                  type="default"
                  icon={<RollbackOutlined />}
                  style={restoreButtonStyle}
                  loading={busyId === row.id}
                  onClick={() => handleRestore(type, row)}
                >
                  Restore
                </Button>
              </Tooltip>
            ) : (
              // READ-ONLY SESSION. Operators without `admin.recycle_bin.restore`
              // get the audit trail but no controls. Rendered as a muted hint
              // rather than an empty cell so the Actions Bar still reads as a
              // column and the grid does not visually collapse.
              <Text type="secondary" style={{ ...numCellStyle, fontWeight: 400 }}>
                View only
              </Text>
            )}
            {canPurge ? (
              // NOTE: no <Tooltip> here. In antd v5 a Tooltip wrapped AROUND a
              // Popconfirm steals the trigger's ref/handlers, so the confirm
              // popover can fail to open. The Popconfirm's own title plus the
              // button's aria-label already name the action.
              <Popconfirm
                title="Permanently delete this record?"
                description={
                  <Paragraph style={{ maxWidth: 280, margin: 0 }}>
                    This is a hard database purge and cannot be undone. The record must
                    already be in the Recycle Bin. Records still referenced by other
                    documents will be refused.
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
                  aria-label={`Permanently delete ${row.summary}`}
                  title="ADMIN ONLY — hard purge"
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

  /** The department currently on screen, plus its rows, count and load state. */
  const activeSpec = useMemo(
    () => TABS.find((t) => t.key === activeTab) ?? TABS[0],
    [activeTab],
  );
  const activeRows = rows[activeSpec.key] ?? [];
  const activeIsLoading = loadingKey === activeSpec.key;
  const activeCount = counts[activeSpec.key] ?? activeRows.length ?? 0;

  return (
    <div style={{ padding: 16 }}>
      <PageHeader
        icon={<DeleteOutlined />}
        title="Recycle Bin"
        subtitle="Universal soft-delete recovery — nothing is ever destroyed by mistake"
        extra={
          <Button icon={<ReloadOutlined />} onClick={() => refresh()}>
            Refresh
          </Button>
        }
      />

      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 8,
          background: '#fffbe6',
          border: '1px solid #ffe58f',
          borderRadius: 6,
          padding: '8px 12px',
          margin: '0 0 12px',
        }}
      >
        <WarningOutlined style={{ color: '#d48806', marginTop: 2 }} />
        <Text style={{ fontSize: 12, color: '#613400' }}>
          Deleting a record marks it inactive and hides it from every live grid — the row,
          its child lines and its audit trail all survive untouched. Restore is instant and
          reversible. <strong>Permanently Delete is admin-only</strong> and refuses any record
          that is still referenced by another document.
        </Text>
      </div>

      {/* ── Department switchboard ─────────────────────────────────────── */}
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
              // The active treatment is driven by `aria-selected` in CSS, not by
              // a conditional class — see the note where the old inline style
              // objects used to live.
              className="erp-module-tab"
              title={`${tab.label} — ${tab.dept}`}
            >
              <span className="erp-module-tab__label">
                <span className="erp-module-tab__emoji" aria-hidden="true">
                  {tab.emoji}
                </span>
                <span>{tab.shortLabel}</span>
                {n > 0 ? (
                  <Tag className="erp-module-tab__count">{n}</Tag>
                ) : null}
                {isLoading ? <ReloadOutlined spin style={{ fontSize: 11 }} /> : null}
              </span>
              <span className="erp-module-tab__dept">{tab.dept}</span>
            </button>
          );
        })}
      </div>

      {/* ── Active department grid ─────────────────────────────────────── */}
      {/*
        Only the ACTIVE department is ever mounted. antd's Tabs keeps every
        visited pane in the document unless it is told to destroy it, which
        would leave a Production Entries row sitting in the DOM (invisible, but
        present and queryable) while the operator reads Hand Packing Rows. One
        panel keyed off `activeSpec` makes the two production tabs mutually
        exclusive in the document, not merely on screen — the isolation rule
        the bin exists to enforce.
      */}
      <div id="rb-panel" role="tabpanel" aria-labelledby={`rb-tab-${activeSpec.key}`}>
        <Card
          size="small"
          bordered={false}
          style={{ padding: 0 }}
          styles={{ body: { padding: 0 } }}
        >
          <Paragraph type="secondary" style={{ margin: '0 0 10px', fontSize: 12 }}>
            <Text strong>{activeSpec.label}</Text> — {activeSpec.blurb}. Records here have left
            every live grid but are fully intact
            {canRestore
              ? ' — Restore returns them to exactly the context they were deleted from.'
              : '. You have read-only access to this tray.'}
          </Paragraph>
          <Table<RecycleBinRow>
            rowKey="id"
            size="small"
            components={denseTableComponents}
            loading={activeIsLoading}
            columns={buildColumns(activeSpec.key)}
            dataSource={activeRows}
            pagination={
              activeRows.length > 50
                ? { pageSize: 50, showSizeChanger: false, showTotal: (t) => `${t} records` }
                : false
            }
            scroll={{ x: 1040 }}
            locale={{
              emptyText: (
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description={`No records in the ${activeSpec.label} recycle bin`}
                />
              ),
            }}
          />
          <Text type="secondary" style={{ fontSize: 11 }}>
            {activeCount} record{activeCount === 1 ? '' : 's'} in this tray
          </Text>
        </Card>
      </div>
    </div>
  );
};

export default RecycleBinPage;
