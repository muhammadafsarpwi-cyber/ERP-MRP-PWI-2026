import React from 'react';
import { MoonOutlined, SunOutlined } from '@ant-design/icons';
import { useThemeStore } from '../../theme/themeStore';

/**
 * Light/dark mode toggle for the Welcome and Login screens.
 * Uses the existing theme store so auth screens respect the active palette.
 */
const ThemeToggle: React.FC = () => {
  const mode = useThemeStore((state) => state.draft.mode);

  const handleToggle = () => {
    const next = mode === 'dark' ? 'light' : 'dark';
    useThemeStore.getState().setMode(next);
    useThemeStore.getState().applyDraft();
  };

  const label =
    mode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';

  return (
    <button
      type="button"
      className="erp-auth-theme-btn"
      aria-label={label}
      title={label}
      onClick={handleToggle}
    >
      {mode === 'dark' ? <SunOutlined /> : <MoonOutlined />}
      <span>{mode === 'dark' ? 'Light' : 'Dark'}</span>
    </button>
  );
};

export default ThemeToggle;