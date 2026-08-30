import React, { useState } from 'react';
import { Layout, Menu, Avatar, Dropdown, Space } from 'antd';
import {
  UserOutlined,
  LogoutOutlined,
  LockOutlined,
} from '@ant-design/icons';
import { useNavigate, useLocation } from 'react-router-dom';
import type { MenuProps } from 'antd';
import ThemeSettingsButton from './ThemeCustomizer';
import NotificationBell from './NotificationBell';
import EmailCommunicationIcon from './EmailCommunicationIcon';
import WhatsAppCommunicationIcon from './WhatsAppCommunicationIcon';
import './sidebar-nav.css';
import { useThemeStore } from '../../theme/themeStore';
import { usePermission } from '../../hooks/usePermission';
import { useHeaderActions } from './headerActionsStore';
import { useNavBadgeStore } from './navBadgeStore';
import {
  NAV_ENTRIES,
  NAV_ICON_COLOR,
  isNavGroup,
  resolveNavMeta,
  resolveNavActiveKeys,
} from './navigationConfig';
import type { NavColorToken } from './navigationConfig';

const { Header, Sider, Content } = Layout;

/**
 * Desktop sidebar width — wide enough for the full Maintenance queue labels
 * ("Started Job Cards", "Pending Review", "Returned Job Cards",
 * "Complete Job Cards", "All Job Cards") to render un-truncated, even with
 * their live-count badge chips. ~260px keeps the "label + badge" pair on one
 * line without pushing the layout past a professional, compact footprint.
 */
const SIDER_WIDTH = 260; // px

const NavIcon: React.FC<{ color: string; size?: 'lg' | 'sm'; icon: React.ComponentType }> = ({ color, size = 'lg', icon: Icon }) => (
  <span className={`erp-nav-icon erp-nav-icon--${size}`} style={{ color }}>
    <Icon />
  </span>
);

// Maintenance module hero titles. Icons for these pages come from the
// canonical navigation config so the header always matches the Sidebar.
const MAINTENANCE_HEADER_META: Record<string, { title: string }> = {
  '/maintenance': { title: 'Maintenance Dashboard' },
  '/maintenance/job-cards': { title: 'Maintenance Job Cards' },
  '/maintenance/teams': { title: 'Maintenance Teams' },
  '/maintenance/categories': { title: 'Maintenance Categories' },
  '/maintenance/pm-plans': { title: 'Maintenance PM Plans' },
  '/maintenance/pm-schedules': { title: 'Maintenance PM Schedules' },
  '/maintenance/reports': { title: 'Maintenance Reports' },
};

function buildMenuItems(
  hasPermission: (code: string) => boolean,
  navBadges: Record<string, number> = {},
): MenuProps['items'] {
  const can = (child: { permissions?: string[] }) => {
    const required = child.permissions;
    if (!required || required.length === 0) return true;
    return required.some(p => hasPermission(p));
  };

  const toNavIcon = (Item: { icon: React.ComponentType; color: NavColorToken }, size: 'lg' | 'sm') => (
    <NavIcon color={NAV_ICON_COLOR[Item.color]} icon={Item.icon} size={size} />
  );

  const withBadge = (key: string, label: React.ReactNode): React.ReactNode => {
    if (!(key in navBadges)) return label;
    const count = navBadges[key];
    return (
      <span className="erp-nav-label">
        <span className="erp-nav-label-text">{label}</span>
        <span className={`erp-nav-chip${count > 0 ? ' erp-nav-chip--hot' : ''}`}>{count}</span>
      </span>
    );
  };

  const items: MenuProps['items'] = [];

  for (const entry of NAV_ENTRIES) {
    if (entry.key === 'development' && process.env.NODE_ENV === 'production') continue;

    if (isNavGroup(entry)) {
      const children = entry.children
        .filter(child => can(child))
        .map(child => ({
          key: child.key,
          icon: toNavIcon(child, 'sm'),
          label: withBadge(child.key, child.label),
        }));
      if (children.length > 0) {
        items.push({
          key: entry.key,
          icon: toNavIcon(entry, 'lg'),
          label: entry.label,
          children,
        });
      }
    } else if (can(entry)) {
      items.push({
        key: entry.key,
        icon: toNavIcon(entry, 'lg'),
        label: withBadge(entry.key, entry.label),
      });
    }
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
  const [openKeys, setOpenKeys] = useState<string[]>([]);
  const closeTimerRef = React.useRef<number | null>(null);
  const [userName, setUserName] = useState('Admin User');
  const navigate = useNavigate();
  const location = useLocation();
  const { can, isLoaded } = usePermission();
  const { actions: headerActions, title: headerTitle, icon: headerIcon } = useHeaderActions();
  const navBadges = useNavBadgeStore((s) => s.badges);

  const effectiveCan = React.useCallback((key: string) => {
    if (!isLoaded) return true;
    return can(key);
  }, [isLoaded, can]);

  const menuItems = React.useMemo(() => buildMenuItems(effectiveCan, navBadges), [effectiveCan, navBadges]);

  const activeKeys = React.useMemo(
    () => resolveNavActiveKeys(location.pathname, location.search),
    [location.pathname, location.search]
  );

  React.useEffect(() => {
    setOpenKeys((prev) => {
      if (activeKeys.openKeys.length === 0) return prev;
      return Array.from(new Set([...prev, ...activeKeys.openKeys]));
    });
  }, [activeKeys.openKeys]);

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

  const hasStatusParam = React.useMemo(
    () => {
      const q = new URLSearchParams(location.search);
      return Boolean(q.get('status') || q.get('statuses'));
    },
    [location.search]
  );
  const maintenanceHeader = !hasStatusParam ? MAINTENANCE_HEADER_META[location.pathname] : undefined;
  const headerNavMeta = React.useMemo(
    () => resolveNavMeta(location.pathname, location.search),
    [location.pathname, location.search]
  );

  const pageTitle = React.useMemo(() => {
    if (/^\/production\/entries\/new\b/.test(location.pathname)) return 'New Production Entry';
    if (/^\/production\/entries\/select\b/.test(location.pathname)) return 'New Production Entry';
    if (/^\/production\/entries\/[^/]+\/edit$/.test(location.pathname)) return 'Edit Production Entry';
    if (/^\/production\/entries\/[^/]+$/.test(location.pathname)) return 'Production Entry Details';
    if (headerNavMeta) return headerNavMeta.label;
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
  }, [location.pathname, headerNavMeta, menuItems]);

  const headerTitleText = headerTitle ?? maintenanceHeader?.title ?? pageTitle;

  let headerIconNode: React.ReactNode = null;
  let headerIconColor: string | undefined;
  if (headerIcon) {
    headerIconNode = headerIcon;
    headerIconColor = headerNavMeta?.colorVar ?? 'var(--theme-text-muted)';
  } else if (headerNavMeta) {
    headerIconNode = React.createElement(headerNavMeta.icon);
    headerIconColor = headerNavMeta.colorVar;
  }

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

  /**
   * Parent expansion behavior: opening a new top-level group closes the
   * previously open one (accordion), while the active parent automatically
   * stays/becomes open on URL navigation or refresh.
   */
  const handleOpenChange = (nextOpenKeys: string[]) => {
    const latestOpenKey = nextOpenKeys.find((key) => !openKeys.includes(key));
    setOpenKeys(latestOpenKey ? [latestOpenKey] : []);
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
        breakpoint="lg"
        collapsedWidth={80}
        width={SIDER_WIDTH}
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
          selectedKeys={[activeKeys.selectedKey]}
          {...(effectivelyCollapsed ? {} : { openKeys })}
          items={menuItems}
          onClick={handleMenuClick}
          onOpenChange={handleOpenChange}
        />
      </Sider>
      <Layout
        style={{
          marginLeft: effectivelyCollapsed ? 80 : SIDER_WIDTH,
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
            left: effectivelyCollapsed ? 80 : SIDER_WIDTH,
            right: 0,
            zIndex: 10,
            transition: 'left 0.2s',
          }}
        >
          <span
            style={{
              marginRight: 'auto',
              minWidth: 0,
              display: 'flex',
              alignItems: 'center',
              overflow: 'hidden',
              fontSize: 16,
              fontWeight: 600,
              color: 'var(--theme-text)',
            }}
          >
            {headerIconNode && (
              <span
                className="erp-app-header-icon"
                style={{
                  color: headerIconColor,
                }}
              >
                {headerIconNode}
              </span>
            )}
            <span
              style={{
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {headerTitleText}
            </span>
          </span>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              overflowX: 'auto',
              minWidth: 0,
              scrollbarWidth: 'thin',
            }}
          >
            {headerActions.map((a) => (
              <div key={a.key} style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
                {a.node}
              </div>
            ))}
          </div>
          <NotificationBell />
          <EmailCommunicationIcon />
          <WhatsAppCommunicationIcon />
          <ThemeSettingsButton />
          <Dropdown menu={{ items: userMenuItems, onClick: handleUserMenuClick }}>
            <Space style={{ cursor: 'pointer', flexShrink: 0 }}>
              <Avatar icon={<UserOutlined />} />
              <span>{userName}</span>
            </Space>
          </Dropdown>
        </Header>
        <Content
          className="erp-app-content"
          style={{
            margin: '72px 8px 8px',
            padding: 12,
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
