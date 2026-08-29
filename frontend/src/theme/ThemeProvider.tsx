import React from 'react';
import { App as AntApp, ConfigProvider, theme as antdTheme } from 'antd';
import { findPalette, resolveRoles } from './palettes';
import { useThemeStore } from './themeStore';
import { darkenHex, lightenHex, mixHex, rgbaFromHex } from './colorUtils';
import './theme.css';

interface ThemeProviderProps {
  children: React.ReactNode;
}

const DARK_ON_ACCENT = '#0f1526';

const buildCssVars = (
  mode: 'light' | 'dark',
  roles: { primary: string; surface: string; accent: string; background: string }
): Record<string, string> => {
  const dark = mode === 'dark';
  const { primary, surface, accent, background } = roles;
  if (dark) {
    return {
      '--theme-primary': primary,
      '--theme-primary-deep': darkenHex(primary, 0.28),
      '--theme-on-primary': '#ffffff',
      '--theme-surface': surface,
      '--theme-surface-alt': lightenHex(surface, 0.05),
      '--theme-accent': accent,
      '--theme-accent-hover': lightenHex(accent, 0.14),
      '--theme-accent-active': darkenHex(accent, 0.12),
      '--theme-accent-soft': rgbaFromHex(accent, 0.16),
      '--theme-on-accent': DARK_ON_ACCENT,
      '--theme-background': background,
      '--theme-text': 'rgba(226, 232, 255, 0.92)',
      '--theme-text-muted': 'rgba(199, 204, 235, 0.55)',
      '--theme-border': mixHex(surface, '#ffffff', 0.09),
      '--theme-border-strong': mixHex(surface, '#ffffff', 0.18),
      '--theme-hover': rgbaFromHex(accent, 0.12),
      '--theme-active': rgbaFromHex(accent, 0.22),
      '--theme-focus': rgbaFromHex(accent, 0.5),
      '--theme-success': '#49aa19',
      '--theme-warning': '#d89614',
      '--theme-danger': '#e5484d',
      '--theme-info': accent,
      '--theme-success-soft': 'rgba(73, 170, 25, 0.16)',
      '--theme-warning-soft': 'rgba(216, 150, 20, 0.16)',
      '--theme-danger-soft': 'rgba(229, 72, 77, 0.16)',
      '--theme-info-soft': rgbaFromHex(accent, 0.16),
      '--theme-surface-elevated': lightenHex(surface, 0.09),
      '--theme-chart-grid': 'rgba(226, 232, 255, 0.09)',
      '--theme-chart-axis': 'rgba(199, 204, 235, 0.5)',
    };
  }
  return {
    '--theme-primary': primary,
    '--theme-primary-deep': darkenHex(primary, 0.22),
    '--theme-on-primary': '#ffffff',
    '--theme-surface': surface,
    '--theme-surface-alt': mixHex(surface, primary, 0.06),
    '--theme-accent': accent,
    '--theme-accent-hover': lightenHex(accent, 0.1),
    '--theme-accent-active': darkenHex(accent, 0.14),
    '--theme-accent-soft': mixHex(accent, '#ffffff', 0.88),
    '--theme-on-accent': '#ffffff',
    '--theme-background': background,
    '--theme-text': 'rgba(15, 23, 42, 0.88)',
    '--theme-text-muted': 'rgba(15, 23, 42, 0.55)',
    '--theme-border': mixHex(surface, '#0f172a', 0.1),
    '--theme-border-strong': mixHex(surface, '#0f172a', 0.2),
    '--theme-hover': rgbaFromHex(primary, 0.07),
    '--theme-active': rgbaFromHex(primary, 0.14),
    '--theme-focus': rgbaFromHex(accent, 0.35),
'--theme-success': '#52c41a',
      '--theme-warning': '#faad14',
      '--theme-danger': '#ff4d4f',
      '--theme-info': accent,
      '--theme-success-soft': mixHex('#52c41a', '#ffffff', 0.88),
      '--theme-warning-soft': mixHex('#faad14', '#ffffff', 0.85),
      '--theme-danger-soft': mixHex('#ff4d4f', '#ffffff', 0.88),
      '--theme-info-soft': mixHex(accent, '#ffffff', 0.88),
      '--theme-surface-elevated': '#ffffff',
      '--theme-chart-grid': 'rgba(15, 23, 42, 0.08)',
      '--theme-chart-axis': 'rgba(15, 23, 42, 0.5)',
    };
};

const applyCssVars = (vars: Record<string, string>): void => {
  const root = document.documentElement;
  Object.entries(vars).forEach(([name, value]) => {
    root.style.setProperty(name, value);
  });
};

const ThemeProvider: React.FC<ThemeProviderProps> = ({ children }) => {
  const draft = useThemeStore((state) => state.draft);
  const initializeForUser = useThemeStore((state) => state.initializeForUser);

  React.useEffect(() => {
    initializeForUser();
  }, [initializeForUser]);

  const palette = findPalette(draft.paletteId);
  const roles = resolveRoles(palette, draft.mode);

  React.useEffect(() => {
    document.documentElement.setAttribute('data-theme', draft.mode);
    applyCssVars(buildCssVars(draft.mode, roles));
  }, [draft.mode, roles]);

  const themeConfig = React.useMemo(() => {
    const dark = draft.mode === 'dark';
    return {
      algorithm: dark ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
      token: {
        colorPrimary: roles.accent,
        colorInfo: roles.accent,
        colorLink: roles.accent,
        colorBgContainer: roles.surface,
        colorBgElevated: roles.surface,
        colorTextLightSolid: dark ? DARK_ON_ACCENT : '#ffffff',
        borderRadius: 6,
      },
      components: {
        Layout: {
          bodyBg: roles.background,
          headerBg: roles.surface,
          siderBg: roles.primary,
          siderTriggerBg: darkenHex(roles.primary, 0.24),
        },
        Menu: {
          itemBg: 'transparent',
          itemMarginInline: 10,
          itemBorderRadius: 8,
          activeBarBorderWidth: 0,
          popupBg: darkenHex(roles.primary, 0.2),
          darkItemBg: 'transparent',
          darkPopupBg: darkenHex(roles.primary, 0.2),
          darkItemColor: 'rgba(255, 255, 255, 0.72)',
          darkItemHoverColor: '#ffffff',
          darkItemHoverBg: 'rgba(255, 255, 255, 0.1)',
          darkItemSelectedColor: '#ffffff',
          darkItemSelectedBg: 'rgba(255, 255, 255, 0.18)',
        },
        Table: {
          headerBg: mixHex(roles.surface, roles.primary, 0.08),
          headerColor: dark ? 'rgba(226, 232, 255, 0.85)' : 'rgba(15, 23, 42, 0.75)',
        },
      },
    };
  }, [draft.mode, roles]);

  return (
    <ConfigProvider theme={themeConfig}>
      <AntApp>{children}</AntApp>
    </ConfigProvider>
  );
};

export default ThemeProvider;
