import React, { useEffect, useState } from 'react';
import { Typography, Card, Row, Col, Space } from 'antd';
import {
  BankOutlined,
  ShoppingCartOutlined,
  InboxOutlined,
  TeamOutlined,
  TagsOutlined,
  SafetyOutlined,
} from '@ant-design/icons';
import apiService from '../../services/api';

const { Title, Text } = Typography;

interface UserProfile {
  id: string;
  email: string;
  displayName: string;
  firstName?: string;
  lastName?: string;
  defaultCompanyId?: string;
  status: string;
}

const Dashboard: React.FC = () => {
  const [user, setUser] = useState<UserProfile | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem('erp_user');
    if (stored) {
      try { setUser(JSON.parse(stored)); } catch {}
    }
    apiService.get<{ success: boolean; data: any }>('/auth/me').then((res) => {
      if (res.success && res.data) {
        setUser(res.data);
        localStorage.setItem('erp_user', JSON.stringify(res.data));
      }
    }).catch(() => {});
  }, []);

  const greeting = user?.firstName
    ? `Welcome, ${user.firstName}`
    : user?.displayName
      ? `Welcome, ${user.displayName}`
      : 'Welcome';

  const modules = [
    { title: 'Organization', icon: <BankOutlined style={{ fontSize: 24 }} />, color: '#1677ff', desc: 'Companies, branches, divisions, warehouses' },
    { title: 'Master Data', icon: <TagsOutlined style={{ fontSize: 24 }} />, color: '#52c41a', desc: 'Items, categories, units of measure' },
    { title: 'Procurement', icon: <ShoppingCartOutlined style={{ fontSize: 24 }} />, color: '#faad14', desc: 'Requisitions, orders, goods receipts' },
    { title: 'Inventory', icon: <InboxOutlined style={{ fontSize: 24 }} />, color: '#722ed1', desc: 'Stock, transfers, adjustments, ledger' },
    { title: 'Administration', icon: <SafetyOutlined style={{ fontSize: 24 }} />, color: '#13c2c2', desc: 'Users, roles, permissions' },
    { title: 'Team', icon: <TeamOutlined style={{ fontSize: 24 }} />, color: '#f5222d', desc: 'User management and access control' },
  ];

  return (
    <div>
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <div>
          <Title level={3} style={{ marginBottom: 4 }}>{greeting}</Title>
          <Text type="secondary">
            {user?.email || 'ERP System'} | ERP-MRP-PWI-2026
          </Text>
        </div>

        <Row gutter={[16, 16]}>
          {modules.map((m) => (
            <Col xs={24} sm={12} lg={8} key={m.title}>
              <Card hoverable size="small">
                <Space>
                  <div style={{ color: m.color }}>{m.icon}</div>
                  <div>
                    <Typography.Text strong>{m.title}</Typography.Text>
                    <br />
                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>{m.desc}</Typography.Text>
                  </div>
                </Space>
              </Card>
            </Col>
          ))}
        </Row>
      </Space>
    </div>
  );
};

export default Dashboard;
