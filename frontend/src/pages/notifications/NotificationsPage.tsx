import React, { useState, useEffect } from 'react';
import { Card, List,  Typography, Badge, Button, Space, Tabs } from 'antd';
import { BellOutlined } from '@ant-design/icons';
import apiService from '../../services/api';
import { PageHeader } from '../../components/shared';

const NotificationsPage: React.FC = () => {
  const [notifications, setNotifications] = useState<any[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [tabKey, setTabKey] = useState('all');

  const load = async () => {
    setLoading(true);
    try {
      const n = await apiService.get<any>('/notifications', { limit: 50 });
      const u = await apiService.get<any>('/notifications/unread-count');
      setNotifications(n.data || []);
      setUnreadCount(u.data?.count || 0);
    } catch { /* ignore */ }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const markRead = async (id: string) => {
    try { await apiService.post(`/notifications/${id}/read`); load(); } catch { /* ignore */ }
  };
  const markAllRead = async () => {
    try { await apiService.post('/notifications/read-all'); load(); } catch { /* ignore */ }
  };

  const filtered = tabKey === 'unread' ? notifications.filter(n => !n.isRead) : notifications;

  return (
    <div>
      <PageHeader icon={<BellOutlined />} title="Notifications" showBreadcrumbs
        subtitle="View and manage your ERP notifications"
        extra={<Badge count={unreadCount}><Button type="primary" onClick={markAllRead}>Mark All Read</Button></Badge>} />
      <Card style={{ marginTop: 12 }}>
        <Tabs activeKey={tabKey} onChange={setTabKey} items={[
          { key: 'all', label: `All (${notifications.length})` },
          { key: 'unread', label: `Unread (${unreadCount})` },
        ]} />
        <List
          loading={loading}
          dataSource={filtered}
          locale={{ emptyText: 'No notifications' }}
          renderItem={(item: any) => (
            <List.Item
              actions={!item.isRead ? [<Button size="small" onClick={() => markRead(item.id)}>Mark Read</Button>] : []}
              style={{ background: item.isRead ? 'transparent' : '#f0f5ff', padding: '12px 16px', borderRadius: 6, marginBottom: 4 }}
            >
              <List.Item.Meta
                title={<Space>{!item.isRead && <Badge status="processing" />}<Typography.Text strong>{item.title}</Typography.Text></Space>}
                description={<div><Typography.Text type="secondary">{item.message || ''}</Typography.Text><br /><Typography.Text type="secondary" style={{ fontSize: 12 }}>{item.entityType} · {new Date(item.createdAt).toLocaleString()}</Typography.Text></div>}
              />
            </List.Item>
          )}
        />
      </Card>
    </div>
  );
};

export default NotificationsPage;