import React from 'react';
import { Avatar } from 'antd';
import { UserOutlined } from '@ant-design/icons';
import { API_BASE_URL } from '../../services/api';

interface UserAvatarProps {
  avatarUrl?: string | null;
  displayName?: string | null;
  size?: number;
  style?: React.CSSProperties;
  className?: string;
  alt?: string;
}

function getInitials(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return '?';
  const parts = trimmed.split(/\s+/);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

function resolveSrc(avatarUrl: string | null | undefined): string | undefined {
  if (!avatarUrl) return undefined;
  if (avatarUrl.startsWith('http://') || avatarUrl.startsWith('https://')) return avatarUrl;
  try {
    const origin = new URL(API_BASE_URL).origin;
    return `${origin}${avatarUrl}`;
  } catch {
    return avatarUrl;
  }
}

const UserAvatar: React.FC<UserAvatarProps> = ({
  avatarUrl,
  displayName,
  size = 32,
  style,
  className,
  alt,
}) => {
  const src = resolveSrc(avatarUrl);
  const initials = displayName ? getInitials(displayName) : undefined;

  if (src) {
    return (
      <Avatar
        src={src}
        size={size}
        style={{ flexShrink: 0, ...style }}
        className={className}
        alt={alt || (displayName ? `${displayName} avatar` : 'User avatar')}
        draggable={false}
        onError={() => false}
      />
    );
  }

  if (initials) {
    return (
      <Avatar
        size={size}
        style={{
          backgroundColor: 'var(--theme-accent)',
          color: 'var(--theme-on-accent)',
          flexShrink: 0,
          fontWeight: 600,
          fontSize: Math.max(size * 0.38, 11),
          lineHeight: `${size}px`,
          ...style,
        }}
        className={className}
        alt={alt || (displayName ? `${displayName} avatar` : 'User avatar')}
        draggable={false}
      >
        {initials}
      </Avatar>
    );
  }

  return (
    <Avatar
      icon={<UserOutlined />}
      size={size}
      style={{
        backgroundColor: 'var(--theme-accent)',
        color: 'var(--theme-on-accent)',
        flexShrink: 0,
        ...style,
      }}
      className={className}
      alt="User avatar"
      draggable={false}
    />
  );
};

export { resolveSrc, getInitials };
export default UserAvatar;