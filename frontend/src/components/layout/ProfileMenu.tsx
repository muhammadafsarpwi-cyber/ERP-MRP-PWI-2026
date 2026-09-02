import React, { useCallback, useMemo, useState } from 'react';
import { Dropdown, Button, Divider, Tag, Menu } from 'antd';
import type { MenuProps } from 'antd';
import {
  LockOutlined,
  LogoutOutlined,
  DownOutlined,
  SettingOutlined,
  IdcardOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useUserStore } from '../../store/userStore';
import UserAvatar from './UserAvatar';

const ProfileMenu: React.FC = () => {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const user = useUserStore((s) => s.user);
  const clearUser = useUserStore((s) => s.clearUser);

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
      else if (info.key === 'logout') handleLogout();
    },
    [navigate, handleLogout]
  );

  const userMenuItems: MenuProps['items'] = [
    { key: 'profile', icon: <IdcardOutlined />, label: 'My Profile' },
    { key: 'change-password', icon: <LockOutlined />, label: 'Change Password' },
    { key: 'theme', icon: <SettingOutlined />, label: 'Theme Settings' },
    { type: 'divider' },
    { key: 'logout', icon: <LogoutOutlined />, label: 'Sign Out', danger: true },
  ];

  const panel = (
    <div
      data-testid="profile-menu"
      style={{
        width: 300,
        background: 'var(--theme-surface)',
        border: '1px solid var(--theme-border)',
        borderRadius: 12,
        overflow: 'hidden',
        boxShadow: '0 12px 40px rgba(15, 23, 42, 0.16)',
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
          gap: 8,
          height: 'auto',
          padding: '4px 6px',
          borderRadius: 8,
          color: 'var(--theme-text)',
          maxWidth: 220,
        }}
      >
        <UserAvatar avatarUrl={user?.avatarUrl} displayName={displayName} size={32} />
        <span
          style={{
            fontSize: 13,
            fontWeight: 500,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {displayName}
        </span>
        <DownOutlined style={{ fontSize: 10, color: 'var(--theme-text-muted)' }} />
      </Button>
    </Dropdown>
  );
};

export default ProfileMenu;
