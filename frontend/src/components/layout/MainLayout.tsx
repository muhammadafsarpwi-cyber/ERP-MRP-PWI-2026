import React, { useState } from 'react';
import { Layout, Menu, Avatar, Dropdown, Space } from 'antd';
import {
  DashboardOutlined,
  UserOutlined,
  ShoppingCartOutlined,
  InboxOutlined,
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
  EditOutlined,
  BarChartOutlined,
  BugOutlined,
  LockOutlined,
  BuildOutlined,
  ClusterOutlined,
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
      {
        key: '/master-data/machines',
        icon: <BuildOutlined />,
        label: 'Machine Master',
      },
    ],
  },
  {
    key: 'customers',
    icon: <TeamOutlined />,
    label: 'Customers',
    children: [
      { key: '/customers', icon: <TeamOutlined />, label: 'Customer List' },
    ],
  },
  {
    key: 'sales',
    icon: <ShoppingCartOutlined />,
    label: 'Sales',
    children: [
      { key: '/sales/quotations', icon: <AppstoreOutlined />, label: 'Quotations' },
      { key: '/sales/orders', icon: <ShoppingCartOutlined />, label: 'Sales Orders' },
      { key: '/sales/deliveries', icon: <InboxOutlined />, label: 'Deliveries' },
      { key: '/sales/invoices', icon: <CalculatorOutlined />, label: 'Invoices' },
      { key: '/sales/returns', icon: <SwapOutlined />, label: 'Sales Returns' },
    ],
  },
  {
    key: 'procurement',
    icon: <ShoppingCartOutlined />,
    label: 'Procurement',
    children: [
      { key: '/procurement/suppliers', icon: <BankOutlined />, label: 'Suppliers' },
      { key: '/procurement/requisitions', icon: <EditOutlined />, label: 'Purchase Requisitions' },
      { key: '/procurement/rfqs', icon: <SwapOutlined />, label: 'Request for Quotations' },
      { key: '/procurement/quotations', icon: <AppstoreOutlined />, label: 'Quotations' },
      { key: '/procurement/orders', icon: <ShoppingCartOutlined />, label: 'Purchase Orders' },
      { key: '/procurement/receipts', icon: <InboxOutlined />, label: 'Goods Receipts' },
      { key: '/procurement/returns', icon: <SwapOutlined />, label: 'Purchase Returns' },
      { key: '/procurement/invoices', icon: <CalculatorOutlined />, label: 'Invoices' },
    ],
  },
  {
    key: 'inventory',
    icon: <InboxOutlined />,
    label: 'Inventory',
    children: [
      { key: '/inventory', icon: <InboxOutlined />, label: 'Overview' },
      { key: '/inventory/policies', icon: <SafetyOutlined />, label: 'Inventory Policies' },
      { key: '/inventory/batches', icon: <AppstoreOutlined />, label: 'Batch Tracking' },
      { key: '/inventory/adjustments', icon: <EditOutlined />, label: 'Stock Adjustments' },
      { key: '/inventory/transfers', icon: <SwapOutlined />, label: 'Stock Transfers' },
      { key: '/inventory/reservations', icon: <SafetyCertificateOutlined />, label: 'Reservations' },
      { key: '/inventory/ledger', icon: <DatabaseOutlined />, label: 'Stock Ledger' },
      { key: '/inventory/reports', icon: <BarChartOutlined />, label: 'Reports' },
    ],
  },
  {
    key: 'production',
    icon: <BuildOutlined />,
    label: 'Production',
    children: [
      { key: '/production/entries', icon: <EditOutlined />, label: 'Daily Production Entry' },
      { key: '/production/bom', icon: <ClusterOutlined />, label: 'Bill of Materials' },
      { key: '/production/routings', icon: <ApartmentOutlined />, label: 'Routing' },
    ],
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
    key: 'change-password',
    icon: <LockOutlined />,
    label: 'Change Password',
  },
  {
    type: 'divider',
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
  const [userName, setUserName] = useState('Admin User');
  const navigate = useNavigate();
  const location = useLocation();

  React.useEffect(() => {
    try {
      const stored = localStorage.getItem('erp_user');
      if (stored) {
        const user = JSON.parse(stored);
        setUserName(user.firstName || user.displayName || user.email || 'Admin User');
      }
    } catch {}
  }, []);

  const handleMenuClick = (info: { key: string }) => {
    navigate(info.key);
  };

  const handleUserMenuClick: MenuProps['onClick'] = (info) => {
    if (info.key === 'logout') {
      localStorage.removeItem('token');
      localStorage.removeItem('refresh_token');
      localStorage.removeItem('erp_user');
      navigate('/login');
    } else if (info.key === 'change-password') {
      navigate('/change-password');
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
              <span>{userName}</span>
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
