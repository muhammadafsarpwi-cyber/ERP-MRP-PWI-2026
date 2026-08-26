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
  AimOutlined,
  SettingOutlined,
} from '@ant-design/icons';
import { useNavigate, useLocation } from 'react-router-dom';
import type { MenuProps } from 'antd';
import ThemeSettingsButton from './ThemeCustomizer';
import NotificationBell from './NotificationBell';
import './sidebar-nav.css';
import { useThemeStore } from '../../theme/themeStore';
import { usePermission } from '../../hooks/usePermission';

const { Header, Sider, Content } = Layout;

const NavIcon: React.FC<{ color: string; children: React.ReactNode }> = ({ color, children }) => (
  <span
    className="erp-nav-icon"
    style={{
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      lineHeight: 0,
      color,
      background: 'transparent',
      flex: 'none',
    }}
  >
    {children}
  </span>
);

const ICON_COLORS = {
  dashboard: '#93A6FF',
  organization: '#C3A9FF',
  adminGroup: '#FF8F8A',
  users: '#7BDC9E',
  roles: '#84BCFF',
  permissions: '#F6C86B',
  masterData: '#79D5EC',
  customers: '#7BDC9E',
  sales: '#82CBF0',
  procurement: '#FFAE7E',
  inventory: '#74DECF',
  analytics: '#79D5EC',
  production: '#F6CE7A',
  development: '#F09BE3',
  settings: '#BFC9D6',
};

const SIDEBAR_PERMISSION_MAP: Record<string, string[]> = {
  '/dashboard': [],
  '/organization/companies': ['organization.company.view'],
  '/organization/branches': ['organization.branch.view'],
  '/organization/divisions': ['organization.division.view'],
  '/organization/sections': ['organization.section.view'],
  '/organization/departments': ['organization.department.view'],
  '/organization/warehouses': ['organization.warehouse.view'],
  '/organization/locations': ['organization.warehouse.view'],
  '/admin/users': ['admin.users.view'],
  '/admin/roles': ['admin.roles.view'],
  '/admin/permissions': ['admin.permissions.view'],
  '/admin/permissions-matrix': ['admin.roles.view'],
  '/master-data/items': ['item.item.view'],
  '/master-data/categories': ['item.item_category.view'],
  '/master-data/uom': ['item.uom.view'],
  '/master-data/uom-conversions': ['item.uom_conversion.view'],
  '/master-data/machines': ['manufacturing.machine.view'],
  '/customers': ['customer.customer.view'],
  '/sales/quotations': ['sales.quotations.view'],
  '/sales/orders': ['sales.orders.view'],
  '/sales/deliveries': ['sales.deliveries.view'],
  '/sales/invoices': ['sales.invoices.view'],
  '/sales/returns': ['sales.returns.view'],
  '/procurement/suppliers': ['procurement.supplier.view'],
  '/procurement/requisitions': ['procurement.requisition.view'],
  '/procurement/rfqs': ['procurement.rfq.view'],
  '/procurement/quotations': ['procurement.quotation.view'],
  '/procurement/orders': ['procurement.order.view'],
  '/procurement/receipts': ['procurement.receipt.view'],
  '/procurement/returns': ['procurement.return.view'],
  '/procurement/invoices': ['procurement.invoice.view'],
  '/inventory': ['inventory.inventory.view'],
  '/inventory/policies': ['inventory.policy.view'],
  '/inventory/batches': ['inventory.batch.view'],
  '/inventory/adjustments': ['inventory.adjustment.view'],
  '/inventory/transfers': ['inventory.transfer.view'],
  '/inventory/reservations': ['inventory.reservation.view'],
  '/inventory/ledger': ['inventory.inventory.view'],
  '/inventory/reports': ['inventory.inventory.view'],
  '/production/entries': ['manufacturing.production.entries.view'],
  '/production/bom': ['manufacturing.bom.view'],
  '/production/routings': ['manufacturing.routing.view'],
  '/production/targets': ['manufacturing.machine_target.view'],
  '/settings': [],
};

function buildMenuItems(hasPermission: (code: string) => boolean): MenuProps['items'] {
  const can = (key: string) => {
    const required = SIDEBAR_PERMISSION_MAP[key];
    if (!required || required.length === 0) return true;
    return required.some(p => hasPermission(p));
  };

  const orgChildren = [
    { key: '/organization/companies', icon: <NavIcon color={ICON_COLORS.organization}><BankOutlined /></NavIcon>, label: 'Companies' },
    { key: '/organization/branches', icon: <NavIcon color={ICON_COLORS.organization}><BranchesOutlined /></NavIcon>, label: 'Branches' },
    { key: '/organization/divisions', icon: <NavIcon color={ICON_COLORS.organization}><ApartmentOutlined /></NavIcon>, label: 'Divisions' },
    { key: '/organization/sections', icon: <NavIcon color={ICON_COLORS.organization}><ApartmentOutlined /></NavIcon>, label: 'Sections' },
    { key: '/organization/departments', icon: <NavIcon color={ICON_COLORS.organization}><ApartmentOutlined /></NavIcon>, label: 'Departments' },
    { key: '/organization/warehouses', icon: <NavIcon color={ICON_COLORS.organization}><HomeOutlined /></NavIcon>, label: 'Warehouses' },
    { key: '/organization/locations', icon: <NavIcon color={ICON_COLORS.organization}><EnvironmentOutlined /></NavIcon>, label: 'Warehouse Locations' },
  ].filter(item => can(item.key));

  const adminChildren = [
    { key: '/admin/users', icon: <NavIcon color={ICON_COLORS.users}><TeamOutlined /></NavIcon>, label: 'Users' },
    { key: '/admin/roles', icon: <NavIcon color={ICON_COLORS.roles}><SafetyCertificateOutlined /></NavIcon>, label: 'Roles' },
    { key: '/admin/permissions', icon: <NavIcon color={ICON_COLORS.permissions}><KeyOutlined /></NavIcon>, label: 'Permissions' },
    { key: '/admin/permissions-matrix', icon: <NavIcon color="#93A6FF"><SafetyCertificateOutlined /></NavIcon>, label: 'Roles & Permissions' },
  ].filter(item => can(item.key));

  const masterDataChildren = [
    { key: '/master-data/items', icon: <NavIcon color={ICON_COLORS.masterData}><TagsOutlined /></NavIcon>, label: 'Products & Items' },
    { key: '/master-data/categories', icon: <NavIcon color={ICON_COLORS.masterData}><AppstoreOutlined /></NavIcon>, label: 'Item Categories' },
    { key: '/master-data/uom', icon: <NavIcon color={ICON_COLORS.masterData}><CalculatorOutlined /></NavIcon>, label: 'Units of Measure' },
    { key: '/master-data/uom-conversions', icon: <NavIcon color={ICON_COLORS.masterData}><SwapOutlined /></NavIcon>, label: 'UOM Conversions' },
    { key: '/master-data/machines', icon: <NavIcon color={ICON_COLORS.masterData}><BuildOutlined /></NavIcon>, label: 'Machine Master' },
  ].filter(item => can(item.key));

  const salesChildren = [
    { key: '/sales/quotations', icon: <NavIcon color={ICON_COLORS.sales}><AppstoreOutlined /></NavIcon>, label: 'Quotations' },
    { key: '/sales/orders', icon: <NavIcon color={ICON_COLORS.sales}><ShoppingCartOutlined /></NavIcon>, label: 'Sales Orders' },
    { key: '/sales/deliveries', icon: <NavIcon color={ICON_COLORS.sales}><InboxOutlined /></NavIcon>, label: 'Deliveries' },
    { key: '/sales/invoices', icon: <NavIcon color={ICON_COLORS.sales}><CalculatorOutlined /></NavIcon>, label: 'Invoices' },
    { key: '/sales/returns', icon: <NavIcon color={ICON_COLORS.sales}><SwapOutlined /></NavIcon>, label: 'Sales Returns' },
  ].filter(item => can(item.key));

  const procurementChildren = [
    { key: '/procurement/suppliers', icon: <NavIcon color={ICON_COLORS.procurement}><BankOutlined /></NavIcon>, label: 'Suppliers' },
    { key: '/procurement/requisitions', icon: <NavIcon color={ICON_COLORS.procurement}><EditOutlined /></NavIcon>, label: 'Purchase Requisitions' },
    { key: '/procurement/rfqs', icon: <NavIcon color={ICON_COLORS.procurement}><SwapOutlined /></NavIcon>, label: 'Request for Quotations' },
    { key: '/procurement/quotations', icon: <NavIcon color={ICON_COLORS.procurement}><AppstoreOutlined /></NavIcon>, label: 'Quotations' },
    { key: '/procurement/orders', icon: <NavIcon color={ICON_COLORS.procurement}><ShoppingCartOutlined /></NavIcon>, label: 'Purchase Orders' },
    { key: '/procurement/receipts', icon: <NavIcon color={ICON_COLORS.procurement}><InboxOutlined /></NavIcon>, label: 'Goods Receipts' },
    { key: '/procurement/returns', icon: <NavIcon color={ICON_COLORS.procurement}><SwapOutlined /></NavIcon>, label: 'Purchase Returns' },
    { key: '/procurement/invoices', icon: <NavIcon color={ICON_COLORS.procurement}><CalculatorOutlined /></NavIcon>, label: 'Invoices' },
  ].filter(item => can(item.key));

  const inventoryChildren = [
    { key: '/inventory', icon: <NavIcon color={ICON_COLORS.inventory}><InboxOutlined /></NavIcon>, label: 'Overview' },
    { key: '/inventory/policies', icon: <NavIcon color={ICON_COLORS.inventory}><SafetyOutlined /></NavIcon>, label: 'Inventory Policies' },
    { key: '/inventory/batches', icon: <NavIcon color={ICON_COLORS.inventory}><AppstoreOutlined /></NavIcon>, label: 'Batch Tracking' },
    { key: '/inventory/adjustments', icon: <NavIcon color={ICON_COLORS.inventory}><EditOutlined /></NavIcon>, label: 'Stock Adjustments' },
    { key: '/inventory/transfers', icon: <NavIcon color={ICON_COLORS.inventory}><SwapOutlined /></NavIcon>, label: 'Stock Transfers' },
    { key: '/inventory/reservations', icon: <NavIcon color={ICON_COLORS.inventory}><SafetyCertificateOutlined /></NavIcon>, label: 'Reservations' },
    { key: '/inventory/ledger', icon: <NavIcon color={ICON_COLORS.inventory}><DatabaseOutlined /></NavIcon>, label: 'Stock Ledger' },
    { key: '/inventory/reports', icon: <NavIcon color={ICON_COLORS.analytics}><BarChartOutlined /></NavIcon>, label: 'Reports' },
  ].filter(item => can(item.key));

  const productionChildren = [
    { key: '/production/entries', icon: <NavIcon color={ICON_COLORS.production}><EditOutlined /></NavIcon>, label: 'Daily Production Entry' },
    { key: '/production/bom', icon: <NavIcon color={ICON_COLORS.production}><ClusterOutlined /></NavIcon>, label: 'Bill of Materials' },
    { key: '/production/routings', icon: <NavIcon color={ICON_COLORS.production}><ApartmentOutlined /></NavIcon>, label: 'Routing' },
    { key: '/production/targets', icon: <NavIcon color={ICON_COLORS.production}><AimOutlined /></NavIcon>, label: 'Machine Targets' },
  ].filter(item => can(item.key));

  const items: MenuProps['items'] = [];

  if (can('/dashboard')) {
    items.push({
      key: '/dashboard',
      icon: <NavIcon color={ICON_COLORS.dashboard}><DashboardOutlined /></NavIcon>,
      label: 'Dashboard',
    });
  }

  if (orgChildren.length > 0) {
    items.push({
      key: 'organization',
      icon: <NavIcon color={ICON_COLORS.organization}><BankOutlined /></NavIcon>,
      label: 'Organization',
      children: orgChildren,
    });
  }

  if (adminChildren.length > 0) {
    items.push({
      key: 'admin',
      icon: <NavIcon color={ICON_COLORS.adminGroup}><SafetyOutlined /></NavIcon>,
      label: 'Administration',
      children: adminChildren,
    });
  }

  if (masterDataChildren.length > 0) {
    items.push({
      key: 'master-data',
      icon: <NavIcon color={ICON_COLORS.masterData}><DatabaseOutlined /></NavIcon>,
      label: 'Master Data',
      children: masterDataChildren,
    });
  }

  if (can('/customers')) {
    items.push({
      key: 'customers',
      icon: <NavIcon color={ICON_COLORS.customers}><TeamOutlined /></NavIcon>,
      label: 'Customers',
      children: [
        { key: '/customers', icon: <NavIcon color={ICON_COLORS.customers}><TeamOutlined /></NavIcon>, label: 'Customer List' },
      ],
    });
  }

  if (salesChildren.length > 0) {
    items.push({
      key: 'sales',
      icon: <NavIcon color={ICON_COLORS.sales}><ShoppingCartOutlined /></NavIcon>,
      label: 'Sales',
      children: salesChildren,
    });
  }

  if (procurementChildren.length > 0) {
    items.push({
      key: 'procurement',
      icon: <NavIcon color={ICON_COLORS.procurement}><ShoppingCartOutlined /></NavIcon>,
      label: 'Procurement',
      children: procurementChildren,
    });
  }

  if (inventoryChildren.length > 0) {
    items.push({
      key: 'inventory',
      icon: <NavIcon color={ICON_COLORS.inventory}><InboxOutlined /></NavIcon>,
      label: 'Inventory',
      children: inventoryChildren,
    });
  }

  if (productionChildren.length > 0) {
    items.push({
      key: 'production',
      icon: <NavIcon color={ICON_COLORS.production}><BuildOutlined /></NavIcon>,
      label: 'Production',
      children: productionChildren,
    });
  }

  items.push({
    key: '/settings',
    icon: <NavIcon color={ICON_COLORS.settings}><SettingOutlined /></NavIcon>,
    label: 'Settings',
  });

  if (process.env.NODE_ENV !== 'production') {
    items.push({
      key: 'development',
      icon: <NavIcon color={ICON_COLORS.development}><BugOutlined /></NavIcon>,
      label: 'Development',
      children: [
        { key: '/development/status', icon: <NavIcon color={ICON_COLORS.development}><BugOutlined /></NavIcon>, label: 'Development Status' },
      ],
    });
  }

  return items;
}

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
  const [hoverOpen, setHoverOpen] = useState(false);
  const closeTimerRef = React.useRef<number | null>(null);
  const [userName, setUserName] = useState('Admin User');
  const navigate = useNavigate();
  const location = useLocation();
  const { can, isLoaded } = usePermission();

  const effectiveCan = React.useCallback((key: string) => {
    if (!isLoaded) return true;
    return can(key);
  }, [isLoaded, can]);

  const menuItems = React.useMemo(() => buildMenuItems(effectiveCan), [effectiveCan]);

  const canHover = React.useMemo(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return true;
    return (
      window.matchMedia('(any-hover: hover)').matches ||
      window.matchMedia('(hover: hover)').matches
    );
  }, []);

  const effectivelyCollapsed = collapsed && !hoverOpen;

  const handleManualCollapse = (value: boolean, type?: 'clickTrigger' | 'responsive') => {
    if (type === 'clickTrigger') {
      if (closeTimerRef.current !== null) {
        window.clearTimeout(closeTimerRef.current);
        closeTimerRef.current = null;
      }
      setHoverOpen(false);
    }
    setCollapsed(value);
  };

  const openHoverSidebar = () => {
    if (!canHover) return;
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    setHoverOpen(true);
  };

  const scheduleCloseHoverSidebar = () => {
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
    }
    closeTimerRef.current = window.setTimeout(() => {
      closeTimerRef.current = null;
      setHoverOpen(false);
    }, 250);
  };

  React.useEffect(
    () => () => {
      if (closeTimerRef.current !== null) {
        window.clearTimeout(closeTimerRef.current);
      }
    },
    []
  );

  const pageTitle = React.useMemo(() => {
    if (/^\/production\/entries\/new\b/.test(location.pathname)) return 'New Production Entry';
    if (/^\/production\/entries\/select\b/.test(location.pathname)) return 'New Production Entry';
    if (/^\/production\/entries\/[^/]+\/edit$/.test(location.pathname)) return 'Edit Production Entry';
    if (/^\/production\/entries\/[^/]+$/.test(location.pathname)) return 'Production Entry Details';
    const findLabel = (items: MenuProps['items']): string | undefined => {
      for (const item of items ?? []) {
        if (!item) continue;
        const candidate = item as {
          key?: React.Key;
          label?: React.ReactNode;
          children?: MenuProps['items'];
        };
        if (candidate.children) {
          const nested = findLabel(candidate.children);
          if (nested) return nested;
        }
        if (candidate.key === location.pathname) {
          return typeof candidate.label === 'string' ? candidate.label : undefined;
        }
      }
      return undefined;
    };
    const fromMenu = findLabel(menuItems);
    if (fromMenu) return fromMenu;
    const segment = location.pathname.split('/').filter(Boolean).pop();
    if (!segment) return 'Dashboard';
    return segment
      .replace(/[-_]+/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase());
  }, [location.pathname, menuItems]);

  React.useEffect(() => {
    useThemeStore.getState().initializeForUser();
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
        collapsed={effectivelyCollapsed}
        onCollapse={handleManualCollapse}
        onMouseEnter={openHoverSidebar}
        onMouseLeave={scheduleCloseHoverSidebar}
        style={{ overflow: 'auto', height: '100vh', position: 'fixed', left: 0, top: 0, bottom: 0 }}
      >
        <div
          style={{
            minHeight: 32,
            margin: 16,
            padding: '4px 8px',
            background: 'rgba(255, 255, 255, 0.2)',
            borderRadius: 6,
            display: 'flex',
            alignItems: 'center',
            justifyContent: effectivelyCollapsed ? 'center' : 'flex-start',
            flexWrap: 'nowrap',
            gap: 14,
            overflow: 'hidden',
          }}
        >
          <img
            src={`${process.env.PUBLIC_URL}/logo.png`}
            alt="Company logo"
            style={{
              display: 'block',
              flex: 'none',
              height: effectivelyCollapsed ? 24 : 30,
              width: effectivelyCollapsed ? 24 : 30,
              objectFit: 'contain',
            }}
          />
          {!effectivelyCollapsed && (
            <span
              style={{
                color: '#fff',
                fontSize: 15,
                fontWeight: 600,
                whiteSpace: 'nowrap',
                marginLeft: 4,
                minWidth: 0,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              ERP System
            </span>
          )}
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[location.pathname]}
          items={menuItems}
          onClick={handleMenuClick}
        />
      </Sider>
      <Layout
        style={{
          marginLeft: effectivelyCollapsed ? 80 : 200,
          transition: 'margin-left 0.2s',
        }}
      >
        <Header
          className="erp-app-header"
          style={{
            padding: '0 24px',
            display: 'flex',
            justifyContent: 'flex-end',
            alignItems: 'center',
            gap: 12,
            position: 'fixed',
            top: 0,
            left: effectivelyCollapsed ? 80 : 200,
            right: 0,
            zIndex: 10,
            transition: 'left 0.2s',
          }}
        >
          <span
            style={{
              marginRight: 'auto',
              minWidth: 0,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              fontSize: 16,
              fontWeight: 600,
              color: 'var(--theme-text)',
            }}
          >
            {pageTitle}
          </span>
          <NotificationBell />
          <ThemeSettingsButton />
          <Dropdown menu={{ items: userMenuItems, onClick: handleUserMenuClick }}>
            <Space style={{ cursor: 'pointer' }}>
              <Avatar icon={<UserOutlined />} />
              <span>{userName}</span>
            </Space>
          </Dropdown>
        </Header>
        <Content
          className="erp-app-content"
          style={{
            margin: '88px 16px 24px',
            padding: 24,
            borderRadius: 8,
            minHeight: 280,
            overflowX: 'auto',
          }}
        >
          {children}
        </Content>
      </Layout>
    </Layout>
  );
};

export default MainLayout;
