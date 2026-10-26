import React, { useCallback, useMemo, useState } from 'react';
import { Dropdown, Button, Divider, Tag, Menu, Grid } from 'antd';
import type { MenuProps } from 'antd';
import {
  LockOutlined,
  LogoutOutlined,
  DownOutlined,
  SettingOutlined,
  IdcardOutlined,
  DownloadOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useUserStore } from '../../store/userStore';
import { usePwaInstall } from '../../context/PwaInstallContext';
import UserAvatar from './UserAvatar';

const ProfileMenu: React.FC = () => {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const user = useUserStore((s) => s.user);
  const clearUser = useUserStore((s) => s.clearUser);
  const { isInstalled, promptInstall } = usePwaInstall();
  const screens = Grid.useBreakpoint();
  const isMobile = !screens.md;

  const displayName = useMemo(
    () => user?.displayName || user?.firstName || user?.email || 'User',
    [user]
  );

  const roleName = useMemo(() => {
    const roles = user?.userRoles;
    if (Array.isArray(roles) && roles.length > 0) {
      const first = roles[0];
      return first?.role?.name || first?.role?.roleCode || undefined;
    }
    return undefined;
  }, [user]);

  const handleLogout = useCallback(() => {
    clearUser();
    localStorage.removeItem('token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('erp_user');
    navigate('/login');
  }, [clearUser, navigate]);

  const handleMenuClick: NonNullable<MenuProps['onClick']> = useCallback(
    (info) => {
      setOpen(false);
      if (info.key === 'profile') navigate('/profile');
      else if (info.key === 'change-password') navigate('/change-password');
      else if (info.key === 'theme') navigate('/settings');
      else if (info.key === 'install-app') void promptInstall();
      else if (info.key === 'logout') handleLogout();
    },
    [navigate, handleLogout, promptInstall]
  );

  const userMenuItems: MenuProps['items'] = [
    { key: 'profile', icon: <IdcardOutlined />, label: 'My Profile' },
    { key: 'change-password', icon: <LockOutlined />, label: 'Change Password' },
    { key: 'theme', icon: <SettingOutlined />, label: 'Theme Settings' },
    ...(!isInstalled
      ? [
          {
            key: 'install-app',
            icon: <DownloadOutlined style={{ color: '#0284c7' }} />,
            label: 'Install App on Device',
          },
        ]
      : []),
    { type: 'divider' },
    { key: 'logout', icon: <LogoutOutlined />, label: 'Sign Out', danger: true },
  ];

  const panel = (
    <div
      data-testid="profile-menu"
      style={{
        width: 285,
        maxWidth: 'calc(100vw - 20px)',
        background: 'var(--theme-surface)',
        border: '1px solid var(--theme-border)',
        borderRadius: 12,
        overflow: 'hidden',
        boxShadow: '0 12px 40px rgba(15, 23, 42, 0.25)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '16px 16px 14px',
          background: 'var(--theme-surface-alt)',
        }}
      >
        <UserAvatar avatarUrl={user?.avatarUrl} displayName={displayName} size={48} />
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontWeight: 600,
              fontSize: 15,
              color: 'var(--theme-text)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {displayName}
          </div>
          <div
            style={{
              fontSize: 12,
              color: 'var(--theme-text-muted)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {user?.email || '—'}
          </div>
          {roleName && (
            <Tag color="blue" style={{ marginTop: 6, fontSize: 11, lineHeight: '18px' }}>
              {roleName}
            </Tag>
          )}
        </div>
      </div>
      {!isInstalled && (
        <div style={{ padding: '8px 12px', background: 'var(--theme-surface-alt)', borderTop: '1px solid var(--theme-border)' }}>
          <Button
            type="primary"
            icon={<DownloadOutlined />}
            onClick={() => {
              setOpen(false);
              void promptInstall();
            }}
            style={{
              width: '100%',
              height: 36,
              borderRadius: 8,
              background: 'linear-gradient(135deg, #0284c7 0%, #2563eb 100%)',
              borderColor: '#38bdf8',
              fontWeight: 700,
              fontSize: 12.5,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              boxShadow: '0 2px 8px rgba(2, 132, 199, 0.35)',
            }}
          >
            Install PWI ERP App
          </Button>
        </div>
      )}
      <Divider style={{ margin: 0 }} />
      <Menu
        items={userMenuItems}
        onClick={handleMenuClick}
        style={{ border: 0, background: 'transparent', padding: 6 }}
      />
    </div>
  );

  return (
    <Dropdown
      trigger={['click']}
      open={open}
      onOpenChange={setOpen}
      popupRender={() => panel}
      placement="bottomRight"
      overlayStyle={{ maxWidth: 'calc(100vw - 16px)' }}
      arrow={false}
    >
      <Button
        type="text"
        data-testid="profile-trigger"
        aria-label={`Open profile menu for ${displayName}`}
        aria-expanded={open}
        aria-haspopup="menu"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: isMobile ? 4 : 8,
          height: 38,
          padding: isMobile ? '2px 6px' : '2px 10px 2px 4px',
          borderRadius: 20,
          background: 'var(--theme-surface-alt, rgba(255, 255, 255, 0.08))',
          border: '1.5px solid var(--theme-border-strong, rgba(148, 163, 184, 0.35))',
          color: 'var(--theme-text, #ffffff)',
          cursor: 'pointer',
          boxShadow: '0 1px 4px rgba(0, 0, 0, 0.12)',
          flexShrink: 0,
          transition: 'all 0.2s ease',
        }}
      >
        <UserAvatar
          avatarUrl={user?.avatarUrl}
          displayName={displayName}
          size={30}
          style={{
            border: '2px solid var(--theme-primary, #6366f1)',
            boxShadow: '0 0 4px rgba(99, 102, 241, 0.4)',
          }}
        />
        {!isMobile && (
          <span
            style={{
              fontSize: 13,
              fontWeight: 600,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              maxWidth: 130,
              letterSpacing: '0.2px',
            }}
          >
            {displayName}
          </span>
        )}
        <DownOutlined style={{ fontSize: 10, color: 'var(--theme-text-muted, #94a3b8)', marginLeft: 2 }} />
      </Button>
    </Dropdown>
  );
};

export default ProfileMenu;
