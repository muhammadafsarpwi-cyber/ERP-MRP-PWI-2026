import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Badge, Button, Dropdown, Empty, List, Spin, Tooltip, Tag, Dropdown as AntDropdown, MenuProps } from 'antd';
import {
  BellOutlined,
  CheckOutlined,
  UndoOutlined,
  EyeOutlined,
  ToolOutlined,
  ShoppingCartOutlined,
  ShoppingOutlined,
  ProfileOutlined,
  ExperimentOutlined,
  TeamOutlined,
  DollarOutlined,
  CarryOutOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import { apiService } from '../../services/api';
import { useNavigate } from 'react-router-dom';

interface NotificationItem {
  id: string;
  type: string;
  title: string;
  message: string | null;
  entityType: string | null;
  entityId: string | null;
  isRead: boolean;
  createdAt: string;
  updatedAt?: string;
}

interface UnreadCountResponse {
  success: boolean;
  data: { count: number };
}

interface ListResponse {
  success: boolean;
  data: NotificationItem[];
}

const POLL_INTERVAL_MS = 30000;

/** Map a notification event code to a module label + icon. */
function moduleMeta(type: string): { label: string; icon: React.ReactNode } {
  const t = (type || '').toUpperCase();
  if (t.startsWith('MAINT') || t.startsWith('MAINT_JOB') || t.startsWith('MAINT_BREAKDOWN') || t.startsWith('MAINT_PM')) return { label: 'Maintenance', icon: <ToolOutlined /> };
  if (t.startsWith('PROC')) return { label: 'Procurement', icon: <ShoppingCartOutlined /> };
  if (t.startsWith('SALES')) return { label: 'Sales', icon: <ShoppingOutlined /> };
  if (t.startsWith('INV')) return { label: 'Inventory', icon: <CarryOutOutlined /> };
  if (t.startsWith('MFG') || t.startsWith('PRODUCTION')) return { label: 'Manufacturing', icon: <ProfileOutlined /> };
  if (t.startsWith('QC')) return { label: 'Quality', icon: <ExperimentOutlined /> };
  if (t.startsWith('HR')) return { label: 'HR', icon: <TeamOutlined /> };
  if (t.startsWith('FIN')) return { label: 'Finance', icon: <DollarOutlined /> };
  return { label: 'System', icon: <WarningOutlined /> };
}

/** Map an entityType to the deep-link route base. */
function entityRoute(entityType: string | null, entityId: string | null): string | null {
  if (!entityId) return null;
  const t = (entityType || '').toLowerCase();
  if (t.includes('job_card') || t.includes('jobcard') || t === 'maintenance') return `/maintenance/job-cards/${entityId}`;
  if (t.includes('purchase_order') || t.includes('po')) return `/procurement/orders/${entityId}`;
  if (t.includes('sales_order') || t.includes('so')) return `/sales/orders/${entityId}`;
  if (t.includes('production_order') || t.includes('production')) return `/production/orders/${entityId}`;
  if (t.includes('invoice')) return `/finance/journals/${entityId}`;
  return null;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

const NotificationBell: React.FC = () => {
  const [unreadCount, setUnreadCount] = useState(0);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const mountedRef = useRef(true);
  const countReqRef = useRef(0);
  const navigate = useNavigate();

  const refresh = useCallback(async () => {
    const seq = ++countReqRef.current;
    try {
      const countRes = await apiService.get<UnreadCountResponse>('/notifications/unread-count');
      if (mountedRef.current && seq === countReqRef.current) {
        setUnreadCount(countRes.data?.count ?? 0);
      }
    } catch {
      /* polling failure is non-fatal */
    }
  }, []);

  const loadList = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiService.get<ListResponse>('/notifications', { limit: 20 });
      if (mountedRef.current) setItems(res.data ?? []);
    } catch {
      /* ignore */
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    refresh();
    const timer = setInterval(refresh, POLL_INTERVAL_MS);
    return () => {
      mountedRef.current = false;
      clearInterval(timer);
    };
  }, [refresh]);

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (next) {
      loadList();
      refresh();
    }
  };

  const markRead = async (id: string) => {
    try {
      const res = await apiService.post<{ success: boolean; data: { count: number } }>(`/notifications/${id}/read`);
      setItems((prev) => prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)));
      if (res?.data && typeof res.data.count === 'number') {
        setUnreadCount(res.data.count);
      }
      refresh();
    } catch {
      /* ignore */
    }
  };

  const markUnread = async (id: string) => {
    try {
      const res = await apiService.post<{ success: boolean; data: { count: number } }>(`/notifications/${id}/unread`);
      setItems((prev) => prev.map((n) => (n.id === id ? { ...n, isRead: false } : n)));
      if (res?.data && typeof res.data.count === 'number') {
        setUnreadCount(res.data.count);
      }
      refresh();
    } catch {
      /* ignore */
    }
  };

  const markAllRead = async () => {
    try {
      await apiService.post('/notifications/read-all');
      setItems((prev) => prev.map((n) => ({ ...n, isRead: true })));
      setUnreadCount(0);
      refresh();
    } catch {
      /* ignore */
    }
  };

  const openItem = (item: NotificationItem) => {
    if (!item.isRead) markRead(item.id);
    const route = entityRoute(item.entityType, item.entityId);
    if (route) {
      setOpen(false);
      navigate(route);
    }
  };

  const actionMenu = (item: NotificationItem): MenuProps => ({
    items: [
      item.isRead
        ? { key: 'unread', icon: <UndoOutlined />, label: 'Mark as unread' }
        : { key: 'read', icon: <CheckOutlined />, label: 'Mark as read' },
      { key: 'open', icon: <EyeOutlined />, label: 'Open related record', disabled: !entityRoute(item.entityType, item.entityId) },
    ],
    onClick: (info) => {
      if (info.key === 'read') markRead(item.id);
      if (info.key === 'unread') markUnread(item.id);
      if (info.key === 'open') openItem(item);
    },
  });

  const panel = (
    <div
      data-testid="notification-panel"
      style={{
        width: 380,
        background: 'var(--theme-surface)',
        border: '1px solid var(--theme-border)',
        borderRadius: 8,
        overflow: 'hidden',
        boxShadow: '0 6px 24px rgba(0, 0, 0, 0.18)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 14px',
          borderBottom: '1px solid var(--theme-border)',
        }}
      >
        <span style={{ fontWeight: 600, color: 'var(--theme-text)' }}>Notifications</span>
        <Button
          type="link"
          size="small"
          disabled={unreadCount === 0}
          onClick={markAllRead}
          data-testid="mark-all-read"
        >
          Mark all as read
        </Button>
      </div>
      <div style={{ maxHeight: 420, overflowY: 'auto' }}>
        {loading && items.length === 0 ? (
          <div style={{ padding: 28, textAlign: 'center' }}>
            <Spin />
          </div>
        ) : items.length === 0 ? (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No notifications" style={{ padding: 20 }} />
        ) : (
          <List
            size="small"
            dataSource={items}
            renderItem={(item) => {
              const meta = moduleMeta(item.type);
              const route = entityRoute(item.entityType, item.entityId);
              return (
                <List.Item
                  onClick={() => openItem(item)}
                  data-testid="notification-item"
                  data-read={String(item.isRead)}
                  style={{
                    cursor: 'pointer',
                    padding: '10px 14px',
                    background: item.isRead ? 'transparent' : 'var(--theme-accent-soft)',
                    borderBottom: `1px solid var(--theme-border)`,
                  }}
                  actions={[
                    <AntDropdown key="actions" menu={actionMenu(item)} trigger={['click']}>
                      <Button size="small" type="text" icon={<EyeOutlined />} onClick={(e) => e.stopPropagation()} aria-label="Notification actions" data-testid="notification-actions" />
                    </AntDropdown>,
                  ]}
                >
                  <div style={{ display: 'flex', gap: 8, width: '100%' }}>
                    <span
                      style={{
                        flexShrink: 0,
                        marginTop: 6,
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        background: item.isRead ? 'var(--theme-border-strong)' : 'var(--theme-danger)',
                      }}
                    />
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <span style={{ color: 'var(--theme-text-muted)' }}>{meta.icon}</span>
                        <div
                          style={{
                            fontWeight: item.isRead ? 400 : 600,
                            color: 'var(--theme-text)',
                            fontSize: 13,
                          }}
                        >
                          {item.title}
                        </div>
                      </div>
                      {item.message && (
                        <div style={{ color: 'var(--theme-text-muted)', fontSize: 12 }}>{item.message}</div>
                      )}
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 2, flexWrap: 'wrap' }}>
                        <span style={{ color: 'var(--theme-text-muted)', fontSize: 11 }}>{formatTime(item.createdAt)}</span>
                        <Tag style={{ fontSize: 10, lineHeight: '14px' }}>{meta.label}</Tag>
                        {item.entityId && route && (
                          <Tag color="blue" style={{ fontSize: 10, lineHeight: '14px' }}>#{item.entityId.slice(0, 8)}</Tag>
                        )}
                      </div>
                    </div>
                  </div>
                </List.Item>
              );
            }}
          />
        )}
      </div>
    </div>
  );

  return (
    <Dropdown
      trigger={['click']}
      open={open}
      onOpenChange={handleOpenChange}
      popupRender={() => panel}
    >
      <Tooltip title="Notifications">
        <span
          data-testid="notification-bell"
          role="button"
          aria-label="Notifications"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setOpen(!open); }}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 34,
            height: 34,
            borderRadius: 8,
            cursor: 'pointer',
            color: 'var(--theme-text)',
            fontSize: 17,
          }}
        >
          <Badge count={unreadCount} overflowCount={99} showZero={false} size="small">
            <BellOutlined />
          </Badge>
        </span>
      </Tooltip>
    </Dropdown>
  );
};

export default NotificationBell;