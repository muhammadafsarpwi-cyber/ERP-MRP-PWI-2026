import React from 'react';
import { App as AntApp, ConfigProvider, Spin, theme as antdTheme } from 'antd';
import {
  findPalette,
  getOsPrefersDark,
  resolveRoles,
  resolveThemeMode,
  CORNER_RADIUS_SCALE,
  ThemePrefs,
} from './palettes';
import { useThemeStore } from './themeStore';
import {
  darkenHex,
  deriveRolesFromAccent,
  ensureMinContrast,
  getContrastText,
  lightenHex,
  mixHex,
  rgbaFromHex,
} from './colorUtils';
import { OrbitalDualRingLoader } from '../components/shared/LoadingState';
import './theme.css';
import './theme-glass.css';

// Configure canonical neon orbital dual-ring spinner for all antd Spin instances globally
Spin.setDefaultIndicator(<OrbitalDualRingLoader size="default" />);

interface ThemeProviderProps {
  children: React.ReactNode;
}

const DARK_ON_ACCENT = '#0f1526';

/**
 * Green used by the System Settings shell (`--settings-accent*`).
 * Mirrors the theme's `success` green in each mode so the settings accent
 * always matches the ERP's own semantic green instead of a hardcoded colour
 * that would only work in one theme.
 */
/**
 * Semantic tokens of the System Settings shell.
 * Dynamically re-derived per palette + mode using the active theme's accent and surface
 * so settings immediately reflect theme changes (Cyan, Blue, Emerald, Amber, etc.).
 */
const buildSettingsCssVars = (
  mode: 'light' | 'dark',
  roles: { primary: string; surface: string; accent: string; background: string }
): Record<string, string> => {
  const dark = mode === 'dark';
  const { surface, accent } = roles;
  if (dark) {
    return {
      '--settings-accent': accent,
      '--settings-accent-soft': rgbaFromHex(accent, 0.16),
      '--settings-accent-border': rgbaFromHex(accent, 0.40),
      '--settings-on-accent': getContrastText(accent),
      '--settings-surface': surface,
      '--settings-surface-elevated': lightenHex(surface, 0.08),
      '--settings-border': mixHex(surface, '#ffffff', 0.11),
      '--settings-text-primary': 'rgba(226, 232, 255, 0.95)',
      '--settings-text-secondary': 'rgba(214, 221, 244, 0.80)',
      '--settings-text-muted': 'rgba(199, 204, 235, 0.55)',
    };
  }
  return {
    '--settings-accent': accent,
    '--settings-accent-soft': rgbaFromHex(accent, 0.14),
    '--settings-accent-border': rgbaFromHex(accent, 0.35),
    '--settings-on-accent': getContrastText(accent),
    '--settings-surface': '#ffffff',
    '--settings-surface-elevated': '#ffffff',
    '--settings-border': mixHex(surface, '#0f172a', 0.10),
    '--settings-text-primary': 'rgba(15, 23, 42, 0.92)',
    '--settings-text-secondary': 'rgba(15, 23, 42, 0.68)',
    '--settings-text-muted': 'rgba(15, 23, 42, 0.45)',
  };
};

/**
 * Explicit dark table-header base hexes for featured corporate presets so
 * Navy Corporate, Emerald Sovereign, Classic Blue, Indigo Night, Mineral Teal,
 * and Obsidian & Mint match executive table chrome with crisp white text.
 */
const PRESET_TABLE_HEADER_HEX: Record<string, string> = {
  navy: '#1e293b',
  'emerald-sovereign': '#064e3b',
  blue: '#1e3a8a',
  indigo: '#312e81',
  'mineral-teal': '#134e4a',
  'obsidian-mint': '#0f2922',
};

/**
 * Resolves the active table <thead> background & border tokens from the selected
 * palette + mode + customAccent, guaranteeing WCAG contrast (>= 7:1 against #f8fafc).
 */
export const resolveTableHeaderBg = (
  mode: 'light' | 'dark',
  paletteId: string,
  roles: { primary: string; surface: string; accent: string; background: string },
  hasCustomAccent = false
): string => {
  const presetBase = !hasCustomAccent ? PRESET_TABLE_HEADER_HEX[paletteId] : undefined;
  const seed = presetBase ?? roles.primary;

  if (mode === 'dark') {
    const blended = mixHex(seed, roles.surface, presetBase ? 0.22 : 0.18);
    return ensureMinContrast(darkenHex(blended, 0.14), '#f8fafc', 7.0);
  }
  return ensureMinContrast(seed, '#ffffff', 7.0);
};

/** Exported for tests — the exact token map applied to `document.documentElement`. */
export const buildCssVars = (
  mode: 'light' | 'dark',
  roles: { primary: string; surface: string; accent: string; background: string },
  paletteId = 'indigo',
  hasCustomAccent = false
): Record<string, string> => {
  const dark = mode === 'dark';
  const { primary, surface, accent, background } = roles;
  const tableHeaderBg = resolveTableHeaderBg(mode, paletteId, roles, hasCustomAccent);
  const tableHeaderAccent = dark ? lightenHex(accent, 0.08) : accent;
  const tableBorder = dark
    ? mixHex(surface, accent, 0.22)
    : mixHex(surface, tableHeaderBg, 0.16);
  const tableRowBg = dark ? surface : '#ffffff';
  const tableRowHover = dark
    ? mixHex(surface, accent, 0.24)
    : mixHex('#ffffff', accent, 0.12);
  const tableRowHoverBorder = dark
    ? rgbaFromHex(accent, 0.42)
    : rgbaFromHex(accent, 0.35);
  const tableRowSelected = dark
    ? mixHex(surface, accent, 0.32)
    : mixHex('#ffffff', accent, 0.20);

  const tableTokens: Record<string, string> = {
    '--erp-table-header-bg': tableHeaderBg,
    '--erp-table-header-text': '#f8fafc',
    '--erp-table-header-accent': tableHeaderAccent,
    '--erp-table-header-divider': 'rgba(255, 255, 255, 0.14)',
    '--erp-table-border': tableBorder,
    '--erp-table-row-bg': tableRowBg,
    '--erp-table-row-hover': tableRowHover,
    '--erp-table-row-hover-border': tableRowHoverBorder,
    '--erp-table-row-hover-indicator': accent,
    '--erp-table-row-selected': tableRowSelected,
    '--theme-table-header-bg': tableHeaderBg,
    '--theme-table-header-color': '#f8fafc',
    '--theme-table-header-border': tableHeaderAccent,
    '--theme-table-row-odd': tableRowBg,
    '--theme-table-row-even': tableRowBg,
    '--theme-table-row-hover': tableRowHover,
    '--theme-table-row-selected': tableRowSelected,
    '--theme-table-text': dark ? 'rgba(241, 245, 249, 0.95)' : 'rgba(15, 23, 42, 0.92)',
    '--theme-table-text-secondary': dark ? 'rgba(203, 213, 225, 0.72)' : 'rgba(100, 116, 139, 0.88)',
    '--theme-table-border': tableBorder,
    '--theme-table-border-strong': dark ? mixHex(surface, '#ffffff', 0.20) : mixHex(surface, tableHeaderBg, 0.26),
    '--theme-table-scrollbar-thumb': dark ? mixHex(surface, accent, 0.38) : mixHex(surface, tableHeaderBg, 0.28),
    '--theme-table-scrollbar-track': dark ? darkenHex(surface, 0.12) : mixHex(surface, '#0f172a', 0.04),
    '--theme-table-sticky-bg': tableRowBg,
    '--theme-table-sticky-hover': tableRowHover,
    '--theme-table-sticky-selected': tableRowSelected,
    '--theme-table-sticky-selected-hover': dark ? mixHex(surface, accent, 0.36) : mixHex('#ffffff', accent, 0.24),
  };

  if (dark) {
    return {
      // In dark mode, primary brand/accent text & interactive elements should use accent (high-contrast, bright)
      // while primary represents the dark sider background
      '--theme-primary': accent,
      '--theme-primary-deep': darkenHex(primary, 0.22),
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
      '--theme-on-accent': getContrastText(accent),
      '--theme-background': background,
      '--theme-text': 'rgba(226, 232, 255, 0.92)',
      '--theme-heading': '#f8fafc',
      '--theme-text-secondary': 'rgba(214, 221, 244, 0.78)',
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
      '--theme-bg-card': surface,
      '--theme-card-bg': surface,
      '--theme-bg-secondary': surface,
      '--theme-bg-subtle': darkenHex(surface, 0.15),
      '--theme-surface-subtle': mixHex(surface, '#ffffff', 0.04),
      '--theme-chart-grid': 'rgba(226, 232, 255, 0.09)',
      '--theme-chart-axis': 'rgba(199, 204, 235, 0.5)',
      ...tableTokens,
      // System Settings shell tokens (dark)
      ...buildSettingsCssVars('dark', roles),
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
    '--theme-on-accent': getContrastText(accent),
    '--theme-background': background,
    '--theme-text': 'rgba(15, 23, 42, 0.92)',
    '--theme-heading': '#0f172a',
    '--theme-text-secondary': 'rgba(15, 23, 42, 0.72)',
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
    '--theme-bg-card': '#ffffff',
    '--theme-card-bg': '#ffffff',
    '--theme-bg-secondary': surface,
    '--theme-bg-subtle': mixHex(surface, '#0f172a', 0.05),
    '--theme-surface-subtle': mixHex(surface, '#0f172a', 0.035),
    '--theme-chart-grid': 'rgba(15, 23, 42, 0.08)',
    '--theme-chart-axis': 'rgba(15, 23, 42, 0.5)',
    ...tableTokens,
    // System Settings shell tokens (light)
    ...buildSettingsCssVars('light', roles),
  };
};

const applyCssVars = (vars: Record<string, string>): void => {
  const root = document.documentElement;
  Object.entries(vars).forEach(([name, value]) => {
    root.style.setProperty(name, value);
  });
};

/**
 * Appearance tokens: corner radius + glassmorphism.
 *
 * These ride on top of `buildCssVars` (colour) so the two concerns stay
 * separate. Everything here is a plain CSS custom property, which means the
 * dozens of existing `var(--ui-radius-*)` call sites in styles/erp-redesign.css
 * and the dashboard sheets pick up the new corner style WITHOUT being edited —
 * we simply re-declare the same custom properties on <html> with tighter or
 * looser values.
 *
 * `prefs.glassBlur` (0–24px) drives `backdrop-filter` and `prefs.glassOpacity`
 * (0.1–0.9) becomes the alpha channel of `--glass-tint`, so the two sliders in
 * the customizer map 1:1 onto tokens without touching a stylesheet. The glass
 * values are deliberately mode-aware: in light mode glass is a near-white
 * wash, in dark mode a deep translucent panel, so blur always reads as
 * "frosted glass" rather than "washed out grey".
 */
export const buildAppearanceCssVars = (
  mode: 'light' | 'dark',
  roles: { surface: string; accent: string; background: string },
  prefs: Pick<ThemePrefs, 'cornerStyle' | 'glass' | 'glassBlur' | 'glassOpacity'>
): Record<string, string> => {
  const dark = mode === 'dark';
  const scale = CORNER_RADIUS_SCALE[prefs.cornerStyle];

  // Glass tuning. `--glass-blur`/`--glass-tint`/`--glass-edge` are consumed
  // exclusively by theme-glass.css (scoped under html[data-glass='on']), so
  // they are inert when glass is off.
  const tintBase = dark ? lightenHex(roles.surface, 0.06) : '#ffffff';
  const glassEdge = dark
    ? 'rgba(255, 255, 255, 0.10)'
    : 'rgba(255, 255, 255, 0.75)';
  const glassHighlight = dark
    ? 'rgba(255, 255, 255, 0.06)'
    : 'rgba(255, 255, 255, 0.95)';

  return {
    // ── Radius scale (overrides the :root defaults in erp-redesign.css) ──
    '--ui-radius-xs': scale.xs,
    '--ui-radius-sm': scale.sm,
    '--ui-radius-md': scale.md,
    '--ui-radius-lg': scale.lg,
    '--ui-radius-xl': scale.xl,
    // Single "current corner style" token for any component that wants to
    // branch (e.g. a circle that must stay round regardless).
    '--ui-corner-style': prefs.cornerStyle,

    // ── Glass tokens (only read when html[data-glass='on']) ──
    '--glass-blur': `${prefs.glassBlur}px`,
    '--glass-saturate': dark ? '140%' : '180%',
    '--glass-tint': rgbaFromHex(tintBase, prefs.glassOpacity),
    '--glass-edge': glassEdge,
    '--glass-highlight': glassHighlight,
    '--glass-accent-ring': rgbaFromHex(roles.accent, dark ? 0.35 : 0.25),
    // Shadow is softened on glass so the blur does the depth work instead.
    '--glass-shadow': dark
      ? '0 8px 32px rgba(0, 0, 0, 0.35)'
      : '0 8px 32px rgba(15, 23, 42, 0.10)',
    // Effective flag for CSS + tests. Written as a plain string so the
    // selector `html[data-glass='on']` can key off it.
    '--glass-enabled': prefs.glass ? '1' : '0',
  };
};

const ThemeProvider: React.FC<ThemeProviderProps> = ({ children }) => {
  const draft = useThemeStore((state) => state.draft);
  const initializeForUser = useThemeStore((state) => state.initializeForUser);
  const [osPrefersDark, setOsPrefersDark] = React.useState<boolean>(() => getOsPrefersDark());

  React.useEffect(() => {
    initializeForUser();
  }, [initializeForUser]);

  React.useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    setOsPrefersDark(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setOsPrefersDark(e.matches);
    if (typeof mq.addEventListener === 'function') {
      mq.addEventListener('change', onChange);
      return () => mq.removeEventListener('change', onChange);
    }
    mq.addListener(onChange);
    return () => mq.removeListener(onChange);
  }, []);

  const resolvedMode = resolveThemeMode(draft.mode, osPrefersDark);

  // A custom hex (from the Theme Color picker) overrides the palette wholesale:
  // the four roles are derived from that one colour, WCAG-guarded, so the whole
  // ERP re-tints around the pick instead of only swapping the accent chip.
  const roles = React.useMemo(() => {
    const palette = findPalette(draft.paletteId);
    return draft.customAccent
      ? deriveRolesFromAccent(draft.customAccent, resolvedMode)
      : resolveRoles(palette, resolvedMode, osPrefersDark);
  }, [draft.paletteId, resolvedMode, osPrefersDark, draft.customAccent]);

  React.useEffect(() => {
    const root = document.documentElement;
    root.setAttribute('data-theme', resolvedMode);
    root.setAttribute('data-palette', draft.paletteId);
    // Drives the glassmorphism layer in theme-glass.css. Kept as an
    // attribute (not a class) so it is available before first paint and
    // trivially inspectable in devtools.
    root.setAttribute('data-glass', draft.glass ? 'on' : 'off');
    root.setAttribute('data-corner-style', draft.cornerStyle);
    applyCssVars(buildCssVars(resolvedMode, roles, draft.paletteId, Boolean(draft.customAccent)));
    applyCssVars(
      buildAppearanceCssVars(resolvedMode, roles, {
        cornerStyle: draft.cornerStyle,
        glass: draft.glass,
        glassBlur: draft.glassBlur,
        glassOpacity: draft.glassOpacity,
      })
    );
  }, [
    resolvedMode,
    draft.paletteId,
    draft.customAccent,
    draft.cornerStyle,
    draft.glass,
    draft.glassBlur,
    draft.glassOpacity,
    roles,
  ]);

  const themeConfig = React.useMemo(() => {
    const dark = resolvedMode === 'dark';
    const computedHeaderBg = resolveTableHeaderBg(
      resolvedMode,
      draft.paletteId,
      roles,
      Boolean(draft.customAccent)
    );
    const tableBorderColor = dark
      ? mixHex(roles.surface, roles.accent, 0.22)
      : mixHex(roles.surface, computedHeaderBg, 0.16);
    const tableHoverBg = dark
      ? mixHex(roles.surface, roles.accent, 0.24)
      : mixHex('#ffffff', roles.accent, 0.12);
    const tableSelectedBg = dark
      ? mixHex(roles.surface, roles.accent, 0.32)
      : mixHex('#ffffff', roles.accent, 0.20);
    return {
      algorithm: dark ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
      token: {
        colorPrimary: roles.accent,
        colorInfo: roles.accent,
        colorLink: roles.accent,
        colorBgContainer: roles.surface,
        colorBgElevated: roles.surface,
        colorTextLightSolid: dark ? DARK_ON_ACCENT : '#ffffff',
        // Driven by the Corner Style matrix. antd rounds every control
        // (Button, Input, Select, Modal, Tag…) from this one token, so
        // Squared / Compact / Standard / Super Rounded reaches ~90% of the UI
        // here; the rest is covered by the --ui-radius-* overrides in
        // buildAppearanceCssVars.
        borderRadius: CORNER_RADIUS_SCALE[draft.cornerStyle].antd,
        // Inter, with the same system fallback stack that erp-font.css defines
        // as `--ui-font-family`. Inlined rather than `var(...)` on purpose: a
        // stylesheet that fails to load must not cost the app its fallback
        // stack and leave antd rendering in a browser default.
        fontFamily:
          "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, " +
          "'Helvetica Neue', Arial, sans-serif",
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
          itemBorderRadius: CORNER_RADIUS_SCALE[draft.cornerStyle].antd,
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
          headerColor: '#f8fafc',
          headerSplitColor: 'rgba(255, 255, 255, 0.14)',
          headerSortActiveBg: lightenHex(computedHeaderBg, 0.08),
          headerSortHoverBg: lightenHex(computedHeaderBg, 0.05),
          fixedHeaderSortActiveBg: lightenHex(computedHeaderBg, 0.08),
          borderColor: tableBorderColor,
          rowHoverBg: tableHoverBg,
          rowSelectedBg: tableSelectedBg,
          rowSelectedHoverBg: mixHex(tableSelectedBg, roles.accent, 0.15),
          cellPaddingBlock: 13,
          cellPaddingInline: 20,
          fontSize: 13,
          fontWeightStrong: 600,
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
  }, [resolvedMode, draft.paletteId, draft.customAccent, draft.cornerStyle, roles]);

  return (
    <ConfigProvider theme={themeConfig}>
      <AntApp>{children}</AntApp>
    </ConfigProvider>
  );
};

export default ThemeProvider;
