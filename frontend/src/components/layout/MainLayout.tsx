import React, { useState } from 'react';
import { Layout, Menu, Avatar, Dropdown, Space } from 'antd';
import {
  DashboardOutlined,
  ShopOutlined,
  UserOutlined,
  ShoppingCartOutlined,
  InboxOutlined,
  SettingOutlined,
  LogoutOutlined,
  BankOutlined,
  BranchesOutlined,
  ApartmentOutlined,
  HomeOutlined,
  DatabaseOutlined,
  EnvironmentOutlined,
  SafetyOutlined,
  TeamOutlined,
  KeyOutlined,
  SafetyCertificateOutlined,
  AppstoreOutlined,
  TagsOutlined,
  CalculatorOutlined,
  SwapOutlined,
  BugOutlined,
} from '@ant-design/icons';
import { useNavigate, useLocation } from 'react-router-dom';
import type { MenuProps } from 'antd';

const { Header, Sider, Content } = Layout;

const menuItems: MenuProps['items'] = [
  {
    key: '/dashboard',
    icon: <DashboardOutlined />,
    label: 'Dashboard',
  },
  {
    key: 'organization',
    icon: <BankOutlined />,
    label: 'Organization',
    children: [
      {
        key: '/organization/companies',
        icon: <BankOutlined />,
        label: 'Companies',
      },
      {
        key: '/organization/branches',
        icon: <BranchesOutlined />,
        label: 'Branches',
      },
      {
        key: '/organization/divisions',
        icon: <ApartmentOutlined />,
        label: 'Divisions',
      },
      {
        key: '/organization/sections',
        icon: <ApartmentOutlined />,
        label: 'Sections',
      },
      {
        key: '/organization/departments',
        icon: <ApartmentOutlined />,
        label: 'Departments',
      },
      {
        key: '/organization/warehouses',
        icon: <HomeOutlined />,
        label: 'Warehouses',
      },
      {
        key: '/organization/locations',
        icon: <EnvironmentOutlined />,
        label: 'Warehouse Locations',
      },
    ],
  },
  {
    key: 'admin',
    icon: <SafetyOutlined />,
    label: 'Administration',
    children: [
      {
        key: '/admin/users',
        icon: <TeamOutlined />,
        label: 'Users',
      },
      {
        key: '/admin/roles',
        icon: <SafetyCertificateOutlined />,
        label: 'Roles',
      },
      {
        key: '/admin/permissions',
        icon: <KeyOutlined />,
        label: 'Permissions',
      },
    ],
  },
  {
    key: 'master-data',
    icon: <DatabaseOutlined />,
    label: 'Master Data',
    children: [
      {
        key: '/master-data/items',
        icon: <TagsOutlined />,
        label: 'Products & Items',
      },
      {
        key: '/master-data/categories',
        icon: <AppstoreOutlined />,
        label: 'Item Categories',
      },
      {
        key: '/master-data/uom',
        icon: <CalculatorOutlined />,
        label: 'Units of Measure',
      },
      {
        key: '/master-data/uom-conversions',
        icon: <SwapOutlined />,
        label: 'UOM Conversions',
      },
    ],
  },
  {
    key: '/products',
    icon: <ShopOutlined />,
    label: 'Products',
  },
  {
    key: '/customers',
    icon: <UserOutlined />,
    label: 'Customers',
  },
  {
    key: '/sales',
    icon: <ShoppingCartOutlined />,
    label: 'Sales',
  },
  {
    key: '/inventory',
    icon: <InboxOutlined />,
    label: 'Inventory',
  },
  {
    key: '/production',
    icon: <SettingOutlined />,
    label: 'Production',
  },
  {
    key: '/settings',
    icon: <SettingOutlined />,
    label: 'Settings',
  },
  ...(process.env.NODE_ENV !== 'production'
    ? [
        {
          key: 'development',
          icon: <BugOutlined />,
          label: 'Development',
          children: [
            {
              key: '/development/status',
              icon: <BugOutlined />,
              label: 'Development Status',
            },
          ],
        },
      ]
    : []),
];

const userMenuItems: MenuProps['items'] = [
  {
    key: 'profile',
    icon: <UserOutlined />,
    label: 'Profile',
  },
  {
    key: 'logout',
    icon: <LogoutOutlined />,
    label: 'Logout',
  },
];

interface MainLayoutProps {
  children: React.ReactNode;
}

const MainLayout: React.FC<MainLayoutProps> = ({ children }) => {
  const [collapsed, setCollapsed] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  const handleMenuClick = (info: { key: string }) => {
    navigate(info.key);
  };

  const handleUserMenuClick: MenuProps['onClick'] = (info) => {
    if (info.key === 'logout') {
      localStorage.removeItem('token');
      navigate('/login');
    }
  };

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider
        collapsible
        collapsed={collapsed}
        onCollapse={setCollapsed}
        style={{ overflow: 'auto', height: '100vh', position: 'fixed', left: 0, top: 0, bottom: 0 }}
      >
        <div style={{ height: 32, margin: 16, background: 'rgba(255, 255, 255, 0.2)', borderRadius: 6 }}>
          <h2 style={{ color: 'white', textAlign: 'center', lineHeight: '32px', margin: 0 }}>
            {collapsed ? 'ERP' : 'ERP System'}
          </h2>
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[location.pathname]}
          items={menuItems}
          onClick={handleMenuClick}
        />
      </Sider>
      <Layout style={{ marginLeft: collapsed ? 80 : 200, transition: 'margin-left 0.2s' }}>
        <Header style={{ padding: '0 24px', background: '#fff', display: 'flex', justifyContent: 'flex-end', alignItems: 'center' }}>
          <Dropdown menu={{ items: userMenuItems, onClick: handleUserMenuClick }}>
            <Space style={{ cursor: 'pointer' }}>
              <Avatar icon={<UserOutlined />} />
              <span>Admin User</span>
            </Space>
          </Dropdown>
        </Header>
        <Content style={{ margin: '24px 16px', padding: 24, background: '#fff', minHeight: 280 }}>
          {children}
        </Content>
      </Layout>
    </Layout>
  );
};

export default MainLayout;
