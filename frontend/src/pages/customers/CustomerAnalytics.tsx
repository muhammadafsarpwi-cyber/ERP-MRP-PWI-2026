import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Table, Tag, Input, Select, Button, Spin, Empty, Tooltip,
  Progress, Row, Col, Statistic, Card, Tabs, Badge,
} from 'antd';
import {
  SearchOutlined, ReloadOutlined, AppstoreOutlined, UnorderedListOutlined,
  TrophyOutlined, ShoppingCartOutlined, RocketOutlined, BarChartOutlined,
  UserOutlined, TagOutlined, DollarOutlined, InboxOutlined,
} from '@ant-design/icons';
import apiService from '../../services/api';
import './CustomerAnalytics.css';

const { Option } = Select;

interface CustomerStat {
  id: string;
  customerCode: string;
  name: string;
  customerType?: string;
  totalOrders: number;
  totalOrderedGross: number;
  totalDispatchedGross: number;
  totalDispatchedCartons: number;
  totalOrderValue: number;
  pendingGross: number;
  fulfillmentPct: number;
  topItem?: string;
  orderNumbers?: string[];
  lastOrderDate?: string;
}

interface ItemStat {
  itemCode: string;
  itemName: string;
  totalGross: number;
  totalCartons: number;
  customerCount: number;
  customerNames: string[];
}

const COLORS = [
  '#6366f1', '#22d3ee', '#f59e0b', '#10b981', '#f43f5e',
  '#8b5cf6', '#0ea5e9', '#84cc16', '#fb923c', '#e879f9',
];

const fmtNum = (n: number, dec = 0) =>
  n === undefined || n === null || isNaN(n)
    ? '—'
    : n.toLocaleString('en-PK', { maximumFractionDigits: dec, minimumFractionDigits: dec });

const CustomerAnalytics: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [viewMode, setViewMode] = useState<'card' | 'table'>('card');
  const [searchText, setSearchText] = useState('');
  const [sortBy, setSortBy] = useState<'orders' | 'dispatched' | 'value' | 'pending'>('dispatched');
  const [customers, setCustomers] = useState<CustomerStat[]>([]);
  const [itemStats, setItemStats] = useState<ItemStat[]>([]);
  const [activeTab, setActiveTab] = useState<'customers' | 'items'>('customers');

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      // Load sales orders and deliveries in parallel
      const [ordersRes, deliveriesRes, customersRes] = await Promise.allSettled([
        apiService.get('/sales/orders?limit=500&status=all'),
        apiService.get('/sales/deliveries?limit=500&status=all'),
        apiService.get('/customers?limit=500&status=ACTIVE'),
      ]);

      const orders: any[] = ordersRes.status === 'fulfilled'
        ? ((ordersRes.value as any)?.data?.data || (ordersRes.value as any)?.data || [])
        : [];
      const deliveries: any[] = deliveriesRes.status === 'fulfilled'
        ? ((deliveriesRes.value as any)?.data?.data || (deliveriesRes.value as any)?.data || [])
        : [];
      const custList: any[] = customersRes.status === 'fulfilled'
        ? ((customersRes.value as any)?.data?.data || (customersRes.value as any)?.data || [])
        : [];

      // Build customer map from orders
      const custMap = new Map<string, CustomerStat>();

      for (const order of orders) {
        const custId = order.customerId || order.customer_id;
        const custName = order.customerName || order.customer_name || order.customer?.name || 'Unknown';
        const custCode = order.customerCode || order.customer_code || order.customer?.customerCode || '';
        const custType = order.customerType || order.customer_type || order.customer?.customerType || '';
        const orderNo = order.orderNumber || order.order_number || order.id;
        const orderDate = order.orderDate || order.order_date || order.createdAt;

        if (!custId) continue;

        if (!custMap.has(custId)) {
          custMap.set(custId, {
            id: custId,
            customerCode: custCode,
            name: custName,
            customerType: custType,
            totalOrders: 0,
            totalOrderedGross: 0,
            totalDispatchedGross: 0,
            totalDispatchedCartons: 0,
            totalOrderValue: 0,
            pendingGross: 0,
            fulfillmentPct: 0,
            topItem: '',
            orderNumbers: [],
            lastOrderDate: orderDate,
          });
        }

        const stat = custMap.get(custId)!;
        stat.totalOrders += 1;
        stat.orderNumbers?.push(orderNo);
        if (orderDate && (!stat.lastOrderDate || orderDate > stat.lastOrderDate)) {
          stat.lastOrderDate = orderDate;
        }

        // Sum order items
        const items = order.items || order.orderItems || order.lines || [];
        for (const item of items) {
          const qty = Number(item.quantity || item.qty || 0);
          const pkgSize = Number(item.packageQuantity || item.pkg_quantity || item.packagingSize || 10);
          stat.totalOrderedGross += qty;
          stat.totalOrderValue += Number(item.lineTotal || item.line_total || qty * Number(item.unitPrice || item.unit_price || 0));
          if (!stat.topItem && (item.itemName || item.item_name)) {
            stat.topItem = item.itemName || item.item_name;
          }
        }
      }

      // Add delivered/dispatched quantities
      for (const delivery of deliveries) {
        const custId = delivery.customerId || delivery.customer_id;
        if (!custId || !custMap.has(custId)) continue;

        const stat = custMap.get(custId)!;
        const lines = delivery.lines || delivery.items || [];
        for (const line of lines) {
          const qty = Number(line.quantity || line.qty || 0);
          const pkgSize = Number(line.packageQuantity || line.packagingSize || 10);
          stat.totalDispatchedGross += qty;
          stat.totalDispatchedCartons += qty > 0 && pkgSize > 0 ? Math.round(qty / pkgSize) : 0;
        }
      }

      // Calculate fulfillment %
      const result: CustomerStat[] = Array.from(custMap.values()).map((c) => ({
        ...c,
        pendingGross: Math.max(0, c.totalOrderedGross - c.totalDispatchedGross),
        fulfillmentPct:
          c.totalOrderedGross > 0
            ? Math.min(100, Math.round((c.totalDispatchedGross / c.totalOrderedGross) * 100))
            : 0,
      }));

      result.sort((a, b) => b.totalDispatchedGross - a.totalDispatchedGross);
      setCustomers(result);

      // Build item stats from orders
      const itemMap = new Map<string, ItemStat>();
      for (const order of orders) {
        const custName = order.customerName || order.customer_name || order.customer?.name || 'Unknown';
        const items = order.items || order.orderItems || order.lines || [];
        for (const item of items) {
          const code = item.itemCode || item.item_code || item.item?.itemCode || '';
          const name = item.itemName || item.item_name || item.item?.name || code;
          const qty = Number(item.quantity || item.qty || 0);
          const pkgSize = Number(item.packageQuantity || item.packagingSize || 10);

          if (!code) continue;
          if (!itemMap.has(code)) {
            itemMap.set(code, { itemCode: code, itemName: name, totalGross: 0, totalCartons: 0, customerCount: 0, customerNames: [] });
          }
          const s = itemMap.get(code)!;
          s.totalGross += qty;
          s.totalCartons += qty > 0 && pkgSize > 0 ? Math.round(qty / pkgSize) : 0;
          if (!s.customerNames.includes(custName)) {
            s.customerNames.push(custName);
            s.customerCount += 1;
          }
        }
      }
      const itemResult = Array.from(itemMap.values()).sort((a, b) => b.totalGross - a.totalGross);
      setItemStats(itemResult);
    } catch (err) {
      console.error('CustomerAnalytics load error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const filteredCustomers = useMemo(() => {
    let list = [...customers];
    if (searchText) {
      const q = searchText.toLowerCase();
      list = list.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.customerCode.toLowerCase().includes(q) ||
          (c.topItem || '').toLowerCase().includes(q),
      );
    }
    list.sort((a, b) => {
      if (sortBy === 'orders') return b.totalOrders - a.totalOrders;
      if (sortBy === 'dispatched') return b.totalDispatchedGross - a.totalDispatchedGross;
      if (sortBy === 'value') return b.totalOrderValue - a.totalOrderValue;
      if (sortBy === 'pending') return b.pendingGross - a.pendingGross;
      return 0;
    });
    return list;
  }, [customers, searchText, sortBy]);

  const totalDispatchedGross = useMemo(() => customers.reduce((s, c) => s + c.totalDispatchedGross, 0), [customers]);
  const totalOrderedGross = useMemo(() => customers.reduce((s, c) => s + c.totalOrderedGross, 0), [customers]);
  const totalOrders = useMemo(() => customers.reduce((s, c) => s + c.totalOrders, 0), [customers]);
  const overallFulfillment = totalOrderedGross > 0 ? Math.round((totalDispatchedGross / totalOrderedGross) * 100) : 0;
  const maxDispatch = customers.length > 0 ? Math.max(...customers.map((c) => c.totalDispatchedGross)) : 1;

  const tableColumns = [
    {
      title: '#',
      key: 'rank',
      width: 50,
      render: (_: any, __: any, i: number) => (
        <span style={{ fontWeight: 700, color: i < 3 ? COLORS[0] : 'var(--theme-text-muted, #64748b)', fontSize: 13 }}>
          {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`}
        </span>
      ),
    },
    {
      title: 'CUSTOMER',
      key: 'name',
      render: (_: any, c: CustomerStat) => (
        <div>
          <div style={{ fontWeight: 700, color: 'var(--theme-accent, #6366f1)', fontSize: 13 }}>{c.name}</div>
          <div style={{ fontSize: 11, color: 'var(--theme-text-muted, #64748b)' }}>{c.customerCode}</div>
        </div>
      ),
    },
    {
      title: 'ORDERS',
      key: 'orders',
      width: 80,
      align: 'center' as const,
      render: (_: any, c: CustomerStat) => (
        <Tag color="blue" style={{ fontWeight: 700 }}>{c.totalOrders}</Tag>
      ),
    },
    {
      title: 'ORDERED (GRS)',
      key: 'ordered',
      width: 130,
      align: 'right' as const,
      render: (_: any, c: CustomerStat) => (
        <span style={{ fontWeight: 700, color: 'var(--theme-text, #1e293b)' }}>{fmtNum(c.totalOrderedGross, 0)}</span>
      ),
    },
    {
      title: 'DISPATCHED (GRS)',
      key: 'dispatched',
      width: 140,
      align: 'right' as const,
      render: (_: any, c: CustomerStat) => (
        <span style={{ fontWeight: 700, color: '#10b981' }}>{fmtNum(c.totalDispatchedGross, 0)}</span>
      ),
    },
    {
      title: 'PENDING (GRS)',
      key: 'pending',
      width: 130,
      align: 'right' as const,
      render: (_: any, c: CustomerStat) => (
        <span style={{ fontWeight: 700, color: c.pendingGross > 0 ? '#f59e0b' : '#10b981' }}>
          {c.pendingGross > 0 ? fmtNum(c.pendingGross, 0) : '✅ 0'}
        </span>
      ),
    },
    {
      title: 'FULFILLMENT',
      key: 'fulfillment',
      width: 160,
      render: (_: any, c: CustomerStat) => (
        <div>
          <Progress
            percent={c.fulfillmentPct}
            size="small"
            strokeColor={c.fulfillmentPct >= 100 ? '#10b981' : c.fulfillmentPct > 50 ? '#6366f1' : '#f59e0b'}
            format={(p) => <span style={{ fontSize: 10, fontWeight: 700 }}>{p}%</span>}
          />
        </div>
      ),
    },
    {
      title: 'TOP ITEM',
      key: 'topItem',
      render: (_: any, c: CustomerStat) => (
        <span style={{ fontSize: 11, color: 'var(--theme-text-muted, #64748b)' }}>{c.topItem || '—'}</span>
      ),
    },
  ];

  const itemColumns = [
    {
      title: '#',
      key: 'rank',
      width: 50,
      render: (_: any, __: any, i: number) => (
        <span style={{ fontWeight: 700, color: i < 3 ? COLORS[0] : 'var(--theme-text-muted)', fontSize: 13 }}>
          {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`}
        </span>
      ),
    },
    {
      title: 'ITEM',
      key: 'item',
      render: (_: any, it: ItemStat) => (
        <div>
          <div style={{ fontWeight: 700, color: 'var(--theme-accent, #6366f1)', fontSize: 12 }}>{it.itemCode}</div>
          <div style={{ fontSize: 11, color: 'var(--theme-text, #1e293b)', fontWeight: 600 }}>{it.itemName}</div>
        </div>
      ),
    },
    {
      title: 'TOTAL GRS ORDERED',
      key: 'gross',
      align: 'right' as const,
      render: (_: any, it: ItemStat) => (
        <span style={{ fontWeight: 700, color: 'var(--theme-text, #1e293b)' }}>{fmtNum(it.totalGross, 0)} GRS</span>
      ),
    },
    {
      title: 'CARTONS',
      key: 'cartons',
      align: 'right' as const,
      render: (_: any, it: ItemStat) => (
        <span style={{ fontWeight: 700, color: '#6366f1' }}>{fmtNum(it.totalCartons, 0)} CTN</span>
      ),
    },
    {
      title: 'CUSTOMERS',
      key: 'customers',
      render: (_: any, it: ItemStat) => (
        <div>
          <Tag color="purple">{it.customerCount} Customers</Tag>
          <div style={{ fontSize: 10, color: 'var(--theme-text-muted, #64748b)', marginTop: 2 }}>
            {it.customerNames.slice(0, 2).join(', ')}{it.customerCount > 2 ? ` +${it.customerCount - 2}` : ''}
          </div>
        </div>
      ),
    },
  ];

  return (
    <div className="ca-root">
      {/* ── Header ── */}
      <div className="ca-header">
        <div className="ca-header-left">
          <div className="ca-title-icon">📊</div>
          <div>
            <h1 className="ca-title">Customer Analytics</h1>
            <p className="ca-subtitle">Dispatch history, order fulfillment & product analysis</p>
          </div>
        </div>
        <Button
          icon={<ReloadOutlined spin={loading} />}
          onClick={loadData}
          loading={loading}
          className="ca-refresh-btn"
        >
          Refresh
        </Button>
      </div>

      {/* ── KPI Strip ── */}
      <div className="ca-kpi-grid">
        <div className="ca-kpi-card ca-kpi-indigo">
          <div className="ca-kpi-icon"><UserOutlined /></div>
          <div className="ca-kpi-body">
            <div className="ca-kpi-label">Active Customers</div>
            <div className="ca-kpi-value">{customers.length}</div>
          </div>
        </div>
        <div className="ca-kpi-card ca-kpi-purple">
          <div className="ca-kpi-icon"><ShoppingCartOutlined /></div>
          <div className="ca-kpi-body">
            <div className="ca-kpi-label">Total Orders</div>
            <div className="ca-kpi-value">{totalOrders}</div>
          </div>
        </div>
        <div className="ca-kpi-card ca-kpi-emerald">
          <div className="ca-kpi-icon"><RocketOutlined /></div>
          <div className="ca-kpi-body">
            <div className="ca-kpi-label">Dispatched (GRS)</div>
            <div className="ca-kpi-value">{fmtNum(totalDispatchedGross, 0)}</div>
          </div>
        </div>
        <div className="ca-kpi-card ca-kpi-amber">
          <div className="ca-kpi-icon"><InboxOutlined /></div>
          <div className="ca-kpi-body">
            <div className="ca-kpi-label">Ordered (GRS)</div>
            <div className="ca-kpi-value">{fmtNum(totalOrderedGross, 0)}</div>
          </div>
        </div>
        <div className="ca-kpi-card ca-kpi-sky">
          <div className="ca-kpi-icon"><BarChartOutlined /></div>
          <div className="ca-kpi-body">
            <div className="ca-kpi-label">Overall Fulfillment</div>
            <div className="ca-kpi-value">{overallFulfillment}%</div>
            <Progress
              percent={overallFulfillment}
              showInfo={false}
              size="small"
              strokeColor={overallFulfillment >= 80 ? '#10b981' : '#f59e0b'}
              style={{ marginTop: 4 }}
            />
          </div>
        </div>
      </div>

      {/* ── Bar Chart: Top 10 Customers ── */}
      <div className="ca-chart-card">
        <div className="ca-chart-title">
          <TrophyOutlined style={{ color: '#f59e0b', marginRight: 8 }} />
          Top Customers by Dispatch Volume
        </div>
        <div className="ca-bar-chart">
          {customers.slice(0, 10).map((c, i) => (
            <div key={c.id} className="ca-bar-row">
              <div className="ca-bar-label">
                <span className="ca-bar-rank" style={{ color: COLORS[i % COLORS.length] }}>
                  {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`}
                </span>
                <Tooltip title={`${c.name} (${c.customerCode})`}>
                  <span className="ca-bar-name">{c.name}</span>
                </Tooltip>
              </div>
              <div className="ca-bar-track">
                <div
                  className="ca-bar-fill"
                  style={{
                    width: `${maxDispatch > 0 ? (c.totalDispatchedGross / maxDispatch) * 100 : 0}%`,
                    background: `linear-gradient(90deg, ${COLORS[i % COLORS.length]}cc, ${COLORS[i % COLORS.length]})`,
                  }}
                />
              </div>
              <div className="ca-bar-val">{fmtNum(c.totalDispatchedGross, 0)} GRS</div>
            </div>
          ))}
          {customers.length === 0 && !loading && (
            <Empty description="No dispatch data" style={{ padding: 40 }} />
          )}
        </div>
      </div>

      {/* ── Tabs: Customers | Items ── */}
      <div className="ca-section">
        <div className="ca-section-toolbar">
          <div className="ca-tabs">
            <button
              className={`ca-tab ${activeTab === 'customers' ? 'active' : ''}`}
              onClick={() => setActiveTab('customers')}
            >
              <UserOutlined /> Customers ({filteredCustomers.length})
            </button>
            <button
              className={`ca-tab ${activeTab === 'items' ? 'active' : ''}`}
              onClick={() => setActiveTab('items')}
            >
              <TagOutlined /> Items ({itemStats.length})
            </button>
          </div>

          <div className="ca-toolbar-right">
            {activeTab === 'customers' && (
              <>
                <Input
                  prefix={<SearchOutlined />}
                  placeholder="Search customer or item..."
                  value={searchText}
                  onChange={(e) => setSearchText(e.target.value)}
                  allowClear
                  className="ca-search"
                />
                <Select value={sortBy} onChange={setSortBy} className="ca-sort-select">
                  <Option value="dispatched">Sort: Dispatched ↓</Option>
                  <Option value="orders">Sort: Orders ↓</Option>
                  <Option value="value">Sort: Value ↓</Option>
                  <Option value="pending">Sort: Pending ↓</Option>
                </Select>
              </>
            )}
            <div className="ca-view-toggle">
              <button
                className={`ca-toggle-btn ${viewMode === 'card' ? 'active' : ''}`}
                onClick={() => setViewMode('card')}
                title="Card View"
              >
                <AppstoreOutlined />
              </button>
              <button
                className={`ca-toggle-btn ${viewMode === 'table' ? 'active' : ''}`}
                onClick={() => setViewMode('table')}
                title="Table View"
              >
                <UnorderedListOutlined />
              </button>
            </div>
          </div>
        </div>

        <Spin spinning={loading}>
          {activeTab === 'customers' ? (
            viewMode === 'card' ? (
              <div className="ca-card-grid">
                {filteredCustomers.map((c, i) => (
                  <div key={c.id} className="ca-customer-card" style={{ '--accent': COLORS[i % COLORS.length] } as any}>
                    <div className="ca-card-rank" style={{ color: COLORS[i % COLORS.length] }}>
                      {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`}
                    </div>
                    <div className="ca-card-header">
                      <div className="ca-card-avatar" style={{ background: `${COLORS[i % COLORS.length]}22`, color: COLORS[i % COLORS.length] }}>
                        {c.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="ca-card-info">
                        <div className="ca-card-name">{c.name}</div>
                        <div className="ca-card-code">{c.customerCode}</div>
                      </div>
                    </div>

                    <div className="ca-card-progress-row">
                      <span className="ca-card-pct-label">Fulfillment</span>
                      <span className="ca-card-pct" style={{ color: COLORS[i % COLORS.length] }}>{c.fulfillmentPct}%</span>
                    </div>
                    <Progress
                      percent={c.fulfillmentPct}
                      showInfo={false}
                      size="small"
                      strokeColor={c.fulfillmentPct >= 100 ? '#10b981' : COLORS[i % COLORS.length]}
                      style={{ marginBottom: 10 }}
                    />

                    <div className="ca-card-stats">
                      <div className="ca-stat">
                        <div className="ca-stat-label">Ordered</div>
                        <div className="ca-stat-val">{fmtNum(c.totalOrderedGross, 0)} GRS</div>
                      </div>
                      <div className="ca-stat">
                        <div className="ca-stat-label">Dispatched</div>
                        <div className="ca-stat-val" style={{ color: '#10b981' }}>{fmtNum(c.totalDispatchedGross, 0)} GRS</div>
                      </div>
                      <div className="ca-stat">
                        <div className="ca-stat-label">Pending</div>
                        <div className="ca-stat-val" style={{ color: c.pendingGross > 0 ? '#f59e0b' : '#10b981' }}>
                          {c.pendingGross > 0 ? fmtNum(c.pendingGross, 0) + ' GRS' : '✅ Done'}
                        </div>
                      </div>
                      <div className="ca-stat">
                        <div className="ca-stat-label">Orders</div>
                        <div className="ca-stat-val" style={{ color: COLORS[i % COLORS.length] }}>{c.totalOrders}</div>
                      </div>
                    </div>

                    {c.topItem && (
                      <div className="ca-card-item">
                        <TagOutlined style={{ marginRight: 4, color: COLORS[i % COLORS.length] }} />
                        <span style={{ fontSize: 11, color: 'var(--theme-text-muted, #64748b)' }}>{c.topItem}</span>
                      </div>
                    )}

                    {c.lastOrderDate && (
                      <div className="ca-card-date">
                        Last order: {c.lastOrderDate?.slice(0, 10) || ''}
                      </div>
                    )}
                  </div>
                ))}
                {filteredCustomers.length === 0 && !loading && (
                  <Empty description="No customers found" style={{ gridColumn: '1/-1', padding: 60 }} />
                )}
              </div>
            ) : (
              <Table
                size="small"
                dataSource={filteredCustomers}
                rowKey="id"
                columns={tableColumns}
                pagination={{ pageSize: 20, showSizeChanger: true }}
                className="ca-table"
              />
            )
          ) : (
            viewMode === 'card' ? (
              <div className="ca-card-grid">
                {itemStats.map((it, i) => (
                  <div key={it.itemCode} className="ca-customer-card" style={{ '--accent': COLORS[i % COLORS.length] } as any}>
                    <div className="ca-card-rank" style={{ color: COLORS[i % COLORS.length] }}>
                      {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`}
                    </div>
                    <div className="ca-card-header">
                      <div className="ca-card-avatar" style={{ background: `${COLORS[i % COLORS.length]}22`, color: COLORS[i % COLORS.length] }}>
                        <InboxOutlined />
                      </div>
                      <div className="ca-card-info">
                        <div className="ca-card-name" style={{ fontSize: 12 }}>{it.itemCode}</div>
                        <div className="ca-card-code">{it.itemName}</div>
                      </div>
                    </div>
                    <div className="ca-card-stats">
                      <div className="ca-stat">
                        <div className="ca-stat-label">Total GRS</div>
                        <div className="ca-stat-val" style={{ color: COLORS[i % COLORS.length] }}>{fmtNum(it.totalGross, 0)}</div>
                      </div>
                      <div className="ca-stat">
                        <div className="ca-stat-label">Cartons</div>
                        <div className="ca-stat-val">{fmtNum(it.totalCartons, 0)}</div>
                      </div>
                      <div className="ca-stat">
                        <div className="ca-stat-label">Customers</div>
                        <div className="ca-stat-val" style={{ color: '#6366f1' }}>{it.customerCount}</div>
                      </div>
                    </div>
                    <div className="ca-card-item" style={{ marginTop: 8 }}>
                      <UserOutlined style={{ marginRight: 4, color: COLORS[i % COLORS.length] }} />
                      <span style={{ fontSize: 11, color: 'var(--theme-text-muted, #64748b)' }}>
                        {it.customerNames.slice(0, 2).join(', ')}{it.customerCount > 2 ? ` +${it.customerCount - 2} more` : ''}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <Table
                size="small"
                dataSource={itemStats}
                rowKey="itemCode"
                columns={itemColumns}
                pagination={{ pageSize: 20 }}
                className="ca-table"
              />
            )
          )}
        </Spin>
      </div>
    </div>
  );
};

export default CustomerAnalytics;
