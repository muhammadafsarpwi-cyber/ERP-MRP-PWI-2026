import React, { useMemo, useState } from 'react';
import {
  ArrowRightOutlined,
  CheckCircleFilled,
  CloseCircleOutlined,
  DownOutlined,
  RightOutlined,
  SearchOutlined,
  ShoppingOutlined,
} from '@ant-design/icons';
import { Input, Progress, Tag, Tooltip, theme } from 'antd';
import type { SalesOrderSummary, SalesOrderSummaryOrder } from '../../services/dashboardService';
import {
  EmptyState,
  SectionCard,
  SkeletonRows,
  toShortDate,
} from './dashboardShared';

const statusCls = (status: string): string =>
  status ? String(status).toLowerCase().replace(/[^a-z0-9_]/g, '_') : 'unknown';

export interface SalesOrdersCardProps {
  data: SalesOrderSummary | null;
  loading: boolean;
  onViewAll: () => void;
}

type StatusFilter = 'ALL' | 'COMPLETED' | string;

const STATUS_TAG_COLOR: Record<string, string> = {
  DELIVERED: 'success',
  COMPLETED: 'success',
  CLOSED: 'success',
  PROCESSING: 'warning',
  IN_PROGRESS: 'warning',
  PENDING: 'warning',
  CONFIRMED: 'cyan',
  APPROVED: 'cyan',
  DRAFT: 'default',
  CANCELLED: 'error',
  REJECTED: 'error',
};

const formatGrs = (val: number) => {
  const n = Number(val || 0);
  if (Math.abs(n - Math.round(n)) < 0.01) {
    return Math.round(n).toLocaleString();
  }
  return n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
};

const SalesOrdersCard: React.FC<SalesOrdersCardProps> = ({ data, loading, onViewAll }) => {
  const { token } = theme.useToken();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const orders = useMemo(
    () =>
      (Array.isArray(data?.recentOrders) ? data.recentOrders : []).map(o => {
        const items = Array.isArray(o.items) ? o.items : [];
        return {
          ...o,
          orderNumber: o.orderNumber ?? '',
          customerName: o.customerName ?? '',
          status: o.status ?? 'Draft',
          items,
          partsCount: typeof o.partsCount === 'number' ? o.partsCount : items.length,
          orderedGrs: Number(o.orderedGrs ?? 0),
          dispatchedGrs: Number(o.dispatchedGrs ?? 0),
          balanceGrs: Number(o.balanceGrs ?? 0),
          completionPct: Number(o.completionPct ?? 0),
          isCompleted: Boolean(o.isCompleted),
        };
      }),
    [data],
  );
  const breakdown = useMemo(
    () => (Array.isArray(data?.statusBreakdown) ? data.statusBreakdown : []),
    [data],
  );
  const summary = data?.summary;

  const totalOrdersCount = useMemo(
    () => breakdown.reduce((acc, b) => acc + b.count, 0) || orders.length,
    [breakdown, orders.length],
  );

  const completedCount = useMemo(
    () => orders.filter(o => o.isCompleted).length,
    [orders],
  );

  const filteredOrders = useMemo(() => {
    const q = search.trim().toLowerCase();
    return orders.filter(o => {
      if (statusFilter === 'COMPLETED') {
        if (!o.isCompleted) return false;
      } else if (statusFilter !== 'ALL') {
        if ((o.status || '').toUpperCase() !== statusFilter.toUpperCase()) return false;
      }
      if (!q) return true;
      return (
        o.orderNumber.toLowerCase().includes(q) ||
        (o.customerName || '').toLowerCase().includes(q) ||
        o.items.some(
          it =>
            it.itemCode.toLowerCase().includes(q) ||
            it.itemName.toLowerCase().includes(q),
        )
      );
    });
  }, [orders, statusFilter, search]);

  const toggleFilter = (next: StatusFilter) => {
    setStatusFilter(prev => (prev === next ? 'ALL' : next));
  };

  const toggleExpand = (order: SalesOrderSummaryOrder) => {
    setExpandedId(prev => (prev === order.id ? null : order.id));
  };

  const barTotal = breakdown.reduce((s, b) => s + b.count, 0);

  return (
    <SectionCard
      className="erp-so-card"
      icon={<ShoppingOutlined />}
      title="Sales Orders (GRS)"
      subtitle={`${totalOrdersCount} orders · ${completedCount} completed`}
      extra={
        <button type="button" className="erp-link-btn" onClick={onViewAll}>
          View All <ArrowRightOutlined />
        </button>
      }
    >
      {loading && orders.length === 0 ? (
        <SkeletonRows rows={5} />
      ) : orders.length === 0 ? (
        <EmptyState
          title="No sales orders"
          desc="Open sales orders will appear here once created"
        />
      ) : (
        <div className="erp-so-body">
          {/* KPI Strip: Total Ordered, Dispatched, Balance, This Month, Last Month */}
          <div className="erp-so-kpi-grid">
            <div className="erp-so-kpi">
              <span className="erp-so-kpi__label">Total Ordered</span>
              <span className="erp-so-kpi__value">
                {formatGrs(summary?.totalOrderedGrs ?? 0)} <small>GRS</small>
              </span>
            </div>
            <div className="erp-so-kpi">
              <span className="erp-so-kpi__label">Dispatched</span>
              <span className="erp-so-kpi__value" style={{ color: token.colorSuccess }}>
                {formatGrs(summary?.totalDispatchedGrs ?? 0)} <small>GRS</small>
              </span>
            </div>
            <div className="erp-so-kpi">
              <span className="erp-so-kpi__label">Balance</span>
              <span
                className="erp-so-kpi__value"
                style={{
                  color:
                    (summary?.totalBalanceGrs ?? 0) > 0
                      ? token.colorWarning
                      : token.colorSuccess,
                }}
              >
                {formatGrs(summary?.totalBalanceGrs ?? 0)} <small>GRS</small>
              </span>
            </div>
            <div className="erp-so-kpi">
              <span className="erp-so-kpi__label">This Month</span>
              <span className="erp-so-kpi__value">
                {formatGrs(summary?.thisMonthGrs ?? 0)} <small>GRS</small>
              </span>
              <span className="erp-so-kpi__sub">
                {summary?.thisMonthCount ?? 0} orders
              </span>
            </div>
            <div className="erp-so-kpi">
              <span className="erp-so-kpi__label">Last Month</span>
              <span className="erp-so-kpi__value">
                {formatGrs(summary?.lastMonthGrs ?? 0)} <small>GRS</small>
              </span>
              <span className="erp-so-kpi__sub">
                {summary?.lastMonthCount ?? 0} orders
              </span>
            </div>
          </div>

          {/* Clickable Status Bar */}
          {barTotal > 0 && (
            <div className="erp-status-bar erp-so-status-bar">
              {breakdown.map(b => {
                const pct = Math.max((b.count / barTotal) * 100, 3);
                const active =
                  statusFilter !== 'ALL' &&
                  statusFilter.toUpperCase() === b.status.toUpperCase();
                return (
                  <Tooltip
                    key={b.status}
                    title={`Filter ${b.status}: ${b.count} orders`}
                  >
                    <button
                      type="button"
                      className={`erp-status-bar__segment erp-status-bar__segment--${statusCls(b.status)} ${active ? 'is-active' : ''}`}
                      style={{ width: `${pct}%`, border: 'none', cursor: 'pointer' }}
                      onClick={() => toggleFilter(b.status)}
                    >
                      {pct >= 9 ? b.count : ''}
                    </button>
                  </Tooltip>
                );
              })}
            </div>
          )}

          {/* Filter Pills + Quick Search */}
          <div className="erp-so-toolbar">
            <div className="erp-so-pills">
              <button
                type="button"
                className={`erp-so-pill ${statusFilter === 'ALL' ? 'is-active' : ''}`}
                onClick={() => setStatusFilter('ALL')}
              >
                All <span>{orders.length}</span>
              </button>
              <button
                type="button"
                className={`erp-so-pill erp-so-pill--success ${statusFilter === 'COMPLETED' ? 'is-active' : ''}`}
                onClick={() => toggleFilter('COMPLETED')}
              >
                <CheckCircleFilled /> Completed <span>{completedCount}</span>
              </button>
              {breakdown.map(b => {
                const active =
                  statusFilter !== 'ALL' &&
                  statusFilter !== 'COMPLETED' &&
                  statusFilter.toUpperCase() === b.status.toUpperCase();
                return (
                  <button
                    key={b.status}
                    type="button"
                    className={`erp-so-pill ${active ? 'is-active' : ''}`}
                    onClick={() => toggleFilter(b.status)}
                  >
                    {b.status} <span>{b.count}</span>
                  </button>
                );
              })}
            </div>

            <Input
              size="small"
              allowClear
              value={search}
              onChange={e => setSearch(e.target.value)}
              prefix={<SearchOutlined style={{ color: token.colorTextTertiary }} />}
              placeholder="Search SOC / customer / item..."
              className="erp-so-search"
            />
          </div>

          {/* SOC Table */}
          <div className="erp-so-table-wrap">
            {filteredOrders.length === 0 ? (
              <div className="erp-so-empty-filter">
                <span>No sales orders match this filter.</span>
                {statusFilter !== 'ALL' || search ? (
                  <button
                    type="button"
                    className="erp-link-btn"
                    onClick={() => {
                      setStatusFilter('ALL');
                      setSearch('');
                    }}
                  >
                    <CloseCircleOutlined /> Clear filter
                  </button>
                ) : null}
              </div>
            ) : (
              <table className="erp-so-table">
                <thead>
                  <tr>
                    <th style={{ width: 28 }} />
                    <th>SOC / Customer</th>
                    <th className="is-center">Parts</th>
                    <th className="is-num">Ordered (GRS)</th>
                    <th className="is-num">Dispatched</th>
                    <th className="is-num">Balance</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredOrders.map(order => {
                    const isOpen = expandedId === order.id;
                    const tagColor =
                      order.isCompleted
                        ? 'success'
                        : STATUS_TAG_COLOR[(order.status || '').toUpperCase()] ?? 'default';
                    return (
                      <React.Fragment key={order.id}>
                        <tr
                          className={`erp-so-row ${isOpen ? 'is-expanded' : ''}`}
                          onClick={() => toggleExpand(order)}
                          title="Click to view part-wise GRS breakdown"
                        >
                          <td className="erp-so-row__chevron">
                            {isOpen ? <DownOutlined /> : <RightOutlined />}
                          </td>
                          <td>
                            <div className="erp-so-row__ident">
                              <span className="erp-so-row__code">{order.orderNumber}</span>
                              <span className="erp-so-row__meta">
                                {order.customerName || '—'} · {toShortDate(order.orderDate)}
                              </span>
                            </div>
                          </td>
                          <td className="is-center">
                            <span className="erp-so-parts-badge">
                              {order.partsCount} {order.partsCount === 1 ? 'Part' : 'Parts'}
                            </span>
                          </td>
                          <td className="is-num erp-so-num">
                            {formatGrs(order.orderedGrs)}
                          </td>
                          <td
                            className="is-num erp-so-num"
                            style={{ color: token.colorSuccess }}
                          >
                            {formatGrs(order.dispatchedGrs)}
                          </td>
                          <td className="is-num erp-so-num">
                            {order.balanceGrs <= 0.01 && order.orderedGrs > 0 ? (
                              <span
                                className="erp-so-balance-done"
                                style={{ color: token.colorSuccess }}
                              >
                                0
                              </span>
                            ) : (
                              <span
                                style={{
                                  color:
                                    order.balanceGrs > 0
                                      ? token.colorWarning
                                      : token.colorTextSecondary,
                                }}
                              >
                                {formatGrs(order.balanceGrs)}
                              </span>
                            )}
                          </td>
                          <td>
                            <div className="erp-so-status-cell">
                              <Tag color={tagColor} style={{ marginInlineEnd: 0 }}>
                                {order.isCompleted && order.balanceGrs <= 0.01
                                  ? 'Completed'
                                  : order.status}
                              </Tag>
                              <Progress
                                percent={order.completionPct}
                                size="small"
                                showInfo={false}
                                strokeColor={
                                  order.completionPct >= 100
                                    ? token.colorSuccess
                                    : token.colorPrimary
                                }
                                style={{ width: 54, margin: 0 }}
                              />
                            </div>
                          </td>
                        </tr>

                        {isOpen && (
                          <tr className="erp-so-detail-row">
                            <td colSpan={7}>
                              <div className="erp-so-detail-panel">
                                <div className="erp-so-detail-panel__head">
                                  <span>
                                    <strong>{order.orderNumber}</strong> — Item-wise Dispatch &amp; Balance (GRS)
                                  </span>
                                  <span className="erp-so-detail-panel__stats">
                                    Ordered: <b>{formatGrs(order.orderedGrs)} GRS</b> · Dispatched:{' '}
                                    <b style={{ color: token.colorSuccess }}>
                                      {formatGrs(order.dispatchedGrs)} GRS
                                    </b>{' '}
                                    · Balance:{' '}
                                    <b
                                      style={{
                                        color:
                                          order.balanceGrs > 0
                                            ? token.colorWarning
                                            : token.colorSuccess,
                                      }}
                                    >
                                      {formatGrs(order.balanceGrs)} GRS
                                    </b>{' '}
                                    ({order.completionPct}%)
                                  </span>
                                </div>

                                {order.items.length === 0 ? (
                                  <div className="erp-so-detail-empty">
                                    No line items recorded on this order.
                                  </div>
                                ) : (
                                  <table className="erp-so-subtable">
                                    <thead>
                                      <tr>
                                        <th>#</th>
                                        <th>Item / Part</th>
                                        <th className="is-num">Ordered (GRS)</th>
                                        <th className="is-num">Dispatched (GRS)</th>
                                        <th className="is-num">Balance (GRS)</th>
                                        <th>Item Status</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {order.items.map((item, idx) => (
                                        <tr key={item.id}>
                                          <td>{item.lineNumber || idx + 1}</td>
                                          <td>
                                            <div className="erp-so-subtable__item">
                                              {item.itemCode ? (
                                                <span className="erp-so-subtable__code">
                                                  {item.itemCode}
                                                </span>
                                              ) : null}
                                              <span>{item.itemName}</span>
                                            </div>
                                          </td>
                                          <td className="is-num">
                                            {formatGrs(item.orderedGrs)}
                                          </td>
                                          <td
                                            className="is-num"
                                            style={{ color: token.colorSuccess }}
                                          >
                                            {formatGrs(item.dispatchedGrs)}
                                          </td>
                                          <td
                                            className="is-num"
                                            style={{
                                              color:
                                                item.balanceGrs > 0
                                                  ? token.colorWarning
                                                  : token.colorSuccess,
                                              fontWeight: 600,
                                            }}
                                          >
                                            {formatGrs(item.balanceGrs)}
                                          </td>
                                          <td>
                                            <Tag
                                              color={
                                                item.balanceGrs <= 0.01 && item.orderedGrs > 0
                                                  ? 'success'
                                                  : item.dispatchedGrs > 0
                                                  ? 'processing'
                                                  : 'default'
                                              }
                                              style={{ marginInlineEnd: 0 }}
                                            >
                                              {item.balanceGrs <= 0.01 && item.orderedGrs > 0
                                                ? 'Completed'
                                                : item.dispatchedGrs > 0
                                                ? `Partial (${item.completionPct}%)`
                                                : item.status}
                                            </Tag>
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </SectionCard>
  );
};

export default SalesOrdersCard;
