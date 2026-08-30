import React, { useEffect, useState } from 'react';
import { Card, Table, Switch, message, Space, Tag, Typography, Button } from 'antd';
import { BellOutlined, ReloadOutlined } from '@ant-design/icons';
import apiService from '../../services/api';

const { Text } = Typography;

const MODULES = ['maintenance','procurement','sales','inventory','manufacturing','qc','hr','finance','approvals','system'];

const NotificationPreferencesPage: React.FC = () => {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      // Use existing preferences from DB if any, else create defaults
      const res = await apiService.get<any>('/notifications/preferences');
      const existing = res.data || [];
      const merged = MODULES.map(m => {
        const found = existing.find((p: any) => p.module === m);
        return { module: m, inApp: found ? found.inApp : true, email: found ? found.email : true, whatsapp: found ? found.whatsapp : false, id: found?.id };
      });
      setRows(merged);
    } catch { message.error('Unable to load preferences'); }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const toggle = async (module: string, field: string, value: boolean) => {
    setRows(prev => prev.map(r => r.module === module ? { ...r, [field]: value } : r));
    try {
      await apiService.post('/notifications/preferences', { module, [field]: value });
    } catch { message.error('Failed to update preference'); load(); }
  };

  const columns: any[] = [
    { title: 'Module', dataIndex: 'module', width: 200, render: (v: string) => <Tag color="blue">{v}</Tag> },
    { title: 'In-App', dataIndex: 'inApp', width: 120, render: (v: boolean, r: any) => <Switch checked={v} onChange={(val) => toggle(r.module, 'inApp', val)} /> },
    { title: 'Email', dataIndex: 'email', width: 120, render: (v: boolean, r: any) => <Switch checked={v} onChange={(val) => toggle(r.module, 'email', val)} /> },
    { title: 'WhatsApp', dataIndex: 'whatsapp', width: 120, render: (v: boolean, r: any) => <Switch checked={v} onChange={(val) => toggle(r.module, 'whatsapp', val)} /> },
  ];

  return (
    <Card
      title={<Space><BellOutlined />My Notification Preferences</Space>}
      extra={<Button icon={<ReloadOutlined />} onClick={load}>Refresh</Button>}
    >
      <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
        Control which channels you receive for each module. Disabling all channels for a module means you will not receive notifications for that module.
      </Text>
      <Table rowKey="module" columns={columns} dataSource={rows} loading={loading} size="middle" pagination={false} />
    </Card>
  );
};

export default NotificationPreferencesPage;