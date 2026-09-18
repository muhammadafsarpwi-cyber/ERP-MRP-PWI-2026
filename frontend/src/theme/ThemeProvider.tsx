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
      // In dark mode, primary brand/accent text & interactive elements should use accent (high-contrast, bright)
      // while primary represents the dark sider background
      '--theme-primary': accent,
      '--theme-primary-deep': darkenHex(accent, 0.28),
      '--theme-sider-bg': primary,
      '--theme-sider-trigger-bg': darkenHex(primary, 0.24),
      '--theme-link': accent,
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
      '--theme-table-sticky-bg': surface,
      '--theme-table-sticky-hover': mixHex(surface, accent, 0.18),
      '--theme-table-sticky-selected': mixHex(surface, accent, 0.26),
      '--theme-table-sticky-selected-hover': mixHex(surface, accent, 0.32),
      // 2027 Dynamic Enterprise Table tokens (adapts directly to current palette)
      '--theme-table-header-bg': darkenHex(primary, 0.18),
      '--theme-table-header-color': '#ffffff',
      '--theme-table-header-border': darkenHex(primary, 0.32),
      '--theme-table-row-odd': surface,
      '--theme-table-row-even': lightenHex(surface, 0.04),
      '--theme-table-row-hover': mixHex(surface, accent, 0.18),
      '--theme-table-row-selected': mixHex(surface, accent, 0.26),
      '--theme-table-text': 'rgba(241, 245, 249, 0.95)',
      '--theme-table-text-secondary': 'rgba(203, 213, 225, 0.65)',
      '--theme-table-border': mixHex(surface, '#ffffff', 0.10),
      '--theme-table-border-strong': mixHex(surface, '#ffffff', 0.18),
      '--theme-table-scrollbar-thumb': mixHex(surface, accent, 0.38),
      '--theme-table-scrollbar-track': darkenHex(surface, 0.12),
    };
  }
  return {
    '--theme-primary': primary,
    '--theme-primary-deep': darkenHex(primary, 0.22),
    '--theme-sider-bg': '#ffffff',
    '--theme-sider-trigger-bg': '#ffffff',
    '--theme-link': accent,
    '--theme-on-primary': '#ffffff',
    '--theme-surface': surface,
    '--theme-surface-alt': mixHex(surface, primary, 0.03),
    '--theme-accent': accent,
    '--theme-accent-hover': lightenHex(accent, 0.1),
    '--theme-accent-active': darkenHex(accent, 0.1),
    '--theme-accent-soft': rgbaFromHex(accent, 0.12),
    '--theme-on-accent': '#ffffff',
    '--theme-background': background,
    '--theme-text': 'rgba(15, 23, 42, 0.92)',
    '--theme-text-muted': 'rgba(15, 23, 42, 0.62)',
    '--theme-border': mixHex(surface, '#0f172a', 0.1),
    '--theme-border-strong': mixHex(surface, '#0f172a', 0.18),
    '--theme-hover': rgbaFromHex(primary, 0.05),
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
    '--theme-table-sticky-bg': '#ffffff',
    '--theme-table-sticky-hover': mixHex(surface, primary, 0.05),
    '--theme-table-sticky-selected': mixHex(surface, primary, 0.10),
    '--theme-table-sticky-selected-hover': mixHex(surface, primary, 0.14),
    // 2027 Dynamic Enterprise Table tokens (adapts directly to current palette)
    '--theme-table-header-bg': darkenHex(primary, 0.18),
    '--theme-table-header-color': '#ffffff',
    '--theme-table-header-border': darkenHex(primary, 0.32),
    '--theme-table-row-odd': '#ffffff',
    '--theme-table-row-even': mixHex(surface, primary, 0.035),
    '--theme-table-row-hover': mixHex('#ffffff', accent, 0.08),
    '--theme-table-row-selected': mixHex('#ffffff', accent, 0.16),
    '--theme-table-text': 'rgba(15, 23, 42, 0.92)',
    '--theme-table-text-secondary': 'rgba(100, 116, 139, 0.85)',
    '--theme-table-border': mixHex(surface, '#0f172a', 0.10),
    '--theme-table-border-strong': mixHex(surface, '#0f172a', 0.18),
    '--theme-table-scrollbar-thumb': mixHex(surface, '#0f172a', 0.25),
    '--theme-table-scrollbar-track': mixHex(surface, '#0f172a', 0.04),
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
    const computedHeaderBg = dark ? darkenHex(roles.primary, 0.22) : darkenHex(roles.primary, 0.18);
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
          headerBg: computedHeaderBg,
          headerColor: '#ffffff',
          headerSplitColor: 'rgba(255, 255, 255, 0.15)',
          headerSortActiveBg: dark ? darkenHex(roles.primary, 0.30) : darkenHex(roles.primary, 0.26),
          headerSortHoverBg: dark ? darkenHex(roles.primary, 0.14) : darkenHex(roles.primary, 0.12),
          fixedHeaderSortActiveBg: dark ? darkenHex(roles.primary, 0.30) : darkenHex(roles.primary, 0.26),
          borderColor: dark ? mixHex(roles.surface, '#ffffff', 0.10) : mixHex(roles.surface, '#0f172a', 0.10),
          rowHoverBg: dark ? mixHex(roles.surface, roles.accent, 0.18) : mixHex('#ffffff', roles.accent, 0.08),
          rowSelectedBg: dark ? mixHex(roles.surface, roles.accent, 0.26) : mixHex('#ffffff', roles.accent, 0.16),
          rowSelectedHoverBg: dark ? mixHex(roles.surface, roles.accent, 0.32) : mixHex('#ffffff', roles.accent, 0.20),
          cellPaddingBlock: 10,
          cellPaddingInline: 12,
          fontSize: 13,
          fontWeightStrong: 700,
        },
        Card: {
          headerBg: 'transparent',
          colorBorderSecondary: dark ? mixHex(roles.surface, '#ffffff', 0.09) : mixHex(roles.surface, '#0f172a', 0.08),
        },
        Modal: {
          contentBg: dark ? roles.surface : '#ffffff',
          headerBg: dark ? roles.surface : '#ffffff',
          footerBg: 'transparent',
          titleColor: dark ? 'rgba(226, 232, 255, 0.95)' : 'rgba(15, 23, 42, 0.95)',
        },
        Input: {
          colorBgContainer: dark ? lightenHex(roles.surface, 0.04) : '#ffffff',
          colorBorder: dark ? mixHex(roles.surface, '#ffffff', 0.14) : mixHex(roles.surface, '#0f172a', 0.15),
          activeBorderColor: roles.accent,
          hoverBorderColor: lightenHex(roles.accent, 0.1),
        },
        Select: {
          colorBgContainer: dark ? lightenHex(roles.surface, 0.04) : '#ffffff',
          colorBorder: dark ? mixHex(roles.surface, '#ffffff', 0.14) : mixHex(roles.surface, '#0f172a', 0.15),
          optionSelectedBg: dark ? rgbaFromHex(roles.accent, 0.22) : rgbaFromHex(roles.accent, 0.12),
        },
        InputNumber: {
          colorBgContainer: dark ? lightenHex(roles.surface, 0.04) : '#ffffff',
          colorBorder: dark ? mixHex(roles.surface, '#ffffff', 0.14) : mixHex(roles.surface, '#0f172a', 0.15),
        },
        DatePicker: {
          colorBgContainer: dark ? lightenHex(roles.surface, 0.04) : '#ffffff',
          colorBorder: dark ? mixHex(roles.surface, '#ffffff', 0.14) : mixHex(roles.surface, '#0f172a', 0.15),
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
