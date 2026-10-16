/**
 * Advanced Theme engine — verification suite.
 *
 * Covers the three layers the customizer introduced:
 *   Part 1 — colour math: HSL round-trip, WCAG contrast, and the derivation
 *            that expands one custom hex into the four ERP roles.
 *   Part 2 — preference model + persistence: the 4-step corner matrix, the
 *            glass blur/opacity clamps, and the v1/v2 → v3 localStorage
 *            migration.
 *   Part 3 — the live engine: AdvancedThemeModal wired to ThemeProvider, i.e.
 *            that a control really rewrites `--ui-radius-*` / `--glass-*` /
 *            antd tokens on <html>, that "Apply & Save" is what persists, and
 *            that cancelling reverts an unsaved draft.
 *   Part 4 — static audit of theme-glass.css (jsdom does not compute the
 *            cascade): glass stays out of tables and out of print.
 */
import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import * as fs from 'fs';
import * as path from 'path';
import {
  contrastGrade,
  contrastRatio,
  deriveRolesFromAccent,
  ensureMinContrast,
  hexToHsl,
  hslToHex,
} from './colorUtils';
import {
  clampGlassBlur,
  clampGlassOpacity,
  DEFAULT_THEME_PREFS,
  GLASS_BLUR,
  GLASS_OPACITY,
  migrateCornerStyle,
} from './palettes';
import { useThemeStore } from './themeStore';
import ThemeProvider from './ThemeProvider';
import { AdvancedThemeModal } from './AdvancedThemeModal';

jest.setTimeout(30000);

beforeAll(() => {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList;
});

beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute('style');
  useThemeStore.setState({
    scopeKey: 'guest',
    saved: DEFAULT_THEME_PREFS,
    draft: DEFAULT_THEME_PREFS,
  });
});

afterEach(cleanup);

const root = () => document.documentElement;
const cssVar = (name: string) => root().style.getPropertyValue(name);

/* ═══════════════════════════════════════════════════════════════════════
   Part 1 — colour math + WCAG role derivation
   ═══════════════════════════════════════════════════════════════════════ */

describe('colour math', () => {
  it('round-trips hex → hsl → hex', () => {
    ['#4f46e5', '#0ea5e9', '#facc15', '#052e16'].forEach((hex) => {
      expect(hslToHex(hexToHsl(hex))).toBe(hex);
    });
  });

  it('scores black/white at the WCAG maximum of 21:1', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 0);
    expect(contrastGrade(21)).toBe('AAA');
    expect(contrastGrade(4.5)).toBe('AA');
    expect(contrastGrade(3)).toBe('AA Large');
    expect(contrastGrade(2.9)).toBe('Fail');
  });

  it('leaves an already-passing colour untouched', () => {
    expect(ensureMinContrast('#1e3a8a', '#ffffff')).toBe('#1e3a8a');
  });

  it('darkens a pale pick until it clears AA on white', () => {
    const fixed = ensureMinContrast('#fde68a', '#ffffff');
    expect(fixed).not.toBe('#fde68a');
    expect(contrastRatio(fixed, '#ffffff')).toBeGreaterThanOrEqual(4.5);
    // Hue is preserved — only lightness moves.
    expect(hexToHsl(fixed).h).toBeCloseTo(hexToHsl('#fde68a').h, 0);
  });

  it.each(['#0ea5e9', '#facc15', '#22c55e', '#f43f5e', '#1e293b'])(
    'derives WCAG-safe roles from a custom accent (%s, light)',
    (accent) => {
      const roles = deriveRolesFromAccent(accent, 'light');
      expect(contrastRatio(roles.accent, roles.surface)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(roles.primary, '#ffffff')).toBeGreaterThanOrEqual(4.5);
      // Light mode: surfaces are lighter than the interactive accent.
      const accentL = hexToHsl(roles.accent).l;
      expect(hexToHsl(roles.surface).l).toBeGreaterThanOrEqual(accentL);
      expect(hexToHsl(roles.background).l).toBeGreaterThanOrEqual(accentL);
    }
  );

  it.each(['#0ea5e9', '#facc15', '#22c55e', '#f43f5e', '#1e293b'])(
    'derives WCAG-safe roles from a custom accent (%s, dark)',
    (accent) => {
      const roles = deriveRolesFromAccent(accent, 'dark');
      expect(contrastRatio(roles.accent, roles.surface)).toBeGreaterThanOrEqual(4.5);
      // Dark mode: the sider slab carries white menu labels.
      expect(contrastRatio(roles.primary, '#ffffff')).toBeGreaterThanOrEqual(4.5);
      const accentL = hexToHsl(roles.accent).l;
      expect(hexToHsl(roles.surface).l).toBeLessThanOrEqual(accentL);
      expect(hexToHsl(roles.background).l).toBeLessThanOrEqual(accentL);
    }
  );

  it('degrades gracefully on an unparseable accent', () => {
    const roles = deriveRolesFromAccent('not-a-colour', 'light');
    expect(roles.accent).toMatch(/^#[0-9a-f]{6}$/);
    expect(roles.surface).toMatch(/^#[0-9a-f]{6}$/);
  });
});

/* ═══════════════════════════════════════════════════════════════════════
   Part 2 — preference model
   ═══════════════════════════════════════════════════════════════════════ */

describe('preference model', () => {
  it('migrates legacy corner styles onto the 4-step matrix', () => {
    expect(migrateCornerStyle('rounded')).toBe('standard');
    expect(migrateCornerStyle('squared')).toBe('squared');
    expect(migrateCornerStyle('compact')).toBe('compact');
    expect(migrateCornerStyle('super-rounded')).toBe('super-rounded');
    expect(migrateCornerStyle('glass')).toBe('standard');
    expect(migrateCornerStyle(undefined)).toBe('standard');
  });

  it('clamps the glass sliders into their published ranges', () => {
    expect(clampGlassBlur(undefined)).toBe(GLASS_BLUR.default);
    expect(clampGlassBlur(99)).toBe(GLASS_BLUR.max);
    expect(clampGlassBlur(-5)).toBe(GLASS_BLUR.min);
    expect(clampGlassBlur(12.6)).toBe(13);

    expect(clampGlassOpacity(undefined)).toBe(GLASS_OPACITY.default);
    expect(clampGlassOpacity(0.05)).toBe(GLASS_OPACITY.min);
    expect(clampGlassOpacity(0.95)).toBe(GLASS_OPACITY.max);
    expect(clampGlassOpacity(0.333)).toBeCloseTo(0.33, 2);
  });
});

describe('persistence + migration', () => {
  const seedScope = () => {
    localStorage.setItem(
      'erp_user',
      JSON.stringify({ id: 'user-1', email: 'qa@example.test' })
    );
  };

  const readV3 = (): Record<string, any> =>
    JSON.parse(localStorage.getItem('erp_theme_prefs_v3') ?? '{}');

  it('migrates a v1 blob forward, defaulting the new fields', () => {
    seedScope();
    localStorage.setItem(
      'erp_theme_prefs_v1',
      JSON.stringify({ 'user:user-1': { mode: 'dark', paletteId: 'indigo' } })
    );

    useThemeStore.getState().initializeForUser();
    const { draft } = useThemeStore.getState();

    expect(draft.mode).toBe('dark');
    expect(draft.paletteId).toBe('indigo');
    expect(draft.cornerStyle).toBe('standard');
    expect(draft.glass).toBe(false);
    expect(draft.glassBlur).toBe(GLASS_BLUR.default);
    expect(draft.glassOpacity).toBe(GLASS_OPACITY.default);
    expect(draft.customAccent).toBeNull();
    // The migration is written back once, under the v3 key.
    expect(readV3()['user:user-1'].mode).toBe('dark');
  });

  it('keeps a v2 squared pick while filling in the glass tuning defaults', () => {
    seedScope();
    localStorage.setItem(
      'erp_theme_prefs_v2',
      JSON.stringify({
        'user:user-1': { mode: 'light', paletteId: 'navy', cornerStyle: 'squared', glass: true },
      })
    );

    useThemeStore.getState().initializeForUser();
    const { draft } = useThemeStore.getState();

    expect(draft.cornerStyle).toBe('squared');
    expect(draft.glass).toBe(true);
    expect(draft.glassBlur).toBe(GLASS_BLUR.default);
  });

  it('persists only on applyDraft, and reverts on revertDraft', () => {
    const store = useThemeStore.getState();
    store.setGlassBlur(21);
    store.setGlassOpacity(0.85);
    expect(readV3()['guest']).toBeUndefined();

    useThemeStore.getState().applyDraft();
    expect(readV3()['guest']).toMatchObject({ glassBlur: 21, glassOpacity: 0.85 });

    useThemeStore.getState().setGlassBlur(4);
    expect(useThemeStore.getState().draft.glassBlur).toBe(4);
    useThemeStore.getState().revertDraft();
    expect(useThemeStore.getState().draft.glassBlur).toBe(21);
  });
});

/* ═══════════════════════════════════════════════════════════════════════
   Part 3 — the live engine (modal ↔ ThemeProvider ↔ <html> tokens)
   ═══════════════════════════════════════════════════════════════════════ */

describe('AdvancedThemeModal ↔ ThemeProvider', () => {
  const renderModal = (onClose = () => {}) =>
    render(
      <ThemeProvider>
        <AdvancedThemeModal open onClose={onClose} />
      </ThemeProvider>
    );

  it('re-rounds the whole radius ladder from the Corner Style matrix', () => {
    renderModal();

    fireEvent.click(screen.getByRole('radio', { name: /super rounded/i }));

    expect(root().getAttribute('data-corner-style')).toBe('super-rounded');
    expect(cssVar('--ui-radius-lg')).toBe('18px');
    expect(cssVar('--ui-radius-xs')).toBe('8px');

    fireEvent.click(screen.getByRole('radio', { name: /^squared/i }));
    expect(cssVar('--ui-radius-lg')).toBe('4px');
    expect(cssVar('--ui-radius-sm')).toBe('2px');
  });

  it('exposes the glass blur + opacity controls and writes them as tokens', () => {
    renderModal();

    const toggle = screen.getByRole('switch', { name: /toggle glassmorphism/i });
    fireEvent.click(toggle);

    expect(root().getAttribute('data-glass')).toBe('on');
    expect(screen.getByText('Blur intensity')).toBeInTheDocument();
    expect(screen.getByText('Surface opacity')).toBeInTheDocument();

    act(() => {
      useThemeStore.setState({
        draft: { ...useThemeStore.getState().draft, glassBlur: 21, glassOpacity: 0.85 },
      });
    });

    expect(cssVar('--glass-blur')).toBe('21px');
    expect(cssVar('--glass-tint')).toContain('0.85');
  });

  it('re-tints the ERP when a custom accent is set', () => {
    renderModal();

    const accent = deriveRolesFromAccent('#22c55e', 'light').accent;
    act(() => {
      useThemeStore.setState({
        draft: { ...useThemeStore.getState().draft, customAccent: '#22c55e' },
      });
    });

    expect(cssVar('--theme-accent')).toBe(accent);
    expect(cssVar('--theme-surface')).toBe(
      deriveRolesFromAccent('#22c55e', 'light').surface
    );
  });

  it('persists on Apply & Save and reverts on Cancel', () => {
    const onClose = jest.fn();
    renderModal(onClose);

    fireEvent.click(screen.getByText('Dark'));
    expect(root().getAttribute('data-theme')).toBe('dark');

    fireEvent.click(screen.getByRole('button', { name: /apply & save/i }));

    expect(JSON.parse(localStorage.getItem('erp_theme_prefs_v3') ?? '{}').guest).toMatchObject(
      { mode: 'dark' }
    );
    expect(onClose).toHaveBeenCalled();

    // A fresh session: change, then cancel → the draft is rolled back.
    cleanup();
    useThemeStore.setState({
      saved: { ...DEFAULT_THEME_PREFS, mode: 'dark' },
      draft: { ...DEFAULT_THEME_PREFS, mode: 'dark' },
    });
    const closeAgain = jest.fn();
    renderModal(closeAgain);

    fireEvent.click(screen.getByText('Light'));
    expect(useThemeStore.getState().draft.mode).toBe('light');

    fireEvent.click(screen.getByRole('button', { name: /^cancel$/i }));
    expect(useThemeStore.getState().draft.mode).toBe('dark');
    expect(closeAgain).toHaveBeenCalled();
  });
});

/* ═══════════════════════════════════════════════════════════════════════
   Part 4 — static audit: glass stays out of tables and off the paper
   ═══════════════════════════════════════════════════════════════════════ */

describe('theme-glass.css scope guards', () => {
  const glassCss = fs.readFileSync(path.join(__dirname, 'theme-glass.css'), 'utf8');
  const printBlock =
    glassCss.slice(glassCss.indexOf('@media print')) || '';

  it('never blurs a data grid', () => {
    expect(glassCss).toContain('html[data-glass=\'on\'] .ant-card .ant-table');
    expect(printBlock).not.toMatch(/\.ant-table[^-]/);
  });

  it('forces opaque surfaces when printing', () => {
    expect(printBlock).toContain('backdrop-filter: none');
    expect(printBlock).toContain('background: var(--theme-surface)');
    expect(printBlock).toContain('box-shadow: none');
  });

  it('keeps an opt-out for reduced transparency and for browsers without blur', () => {
    expect(glassCss).toContain('@supports not ((backdrop-filter: blur(1px))');
    expect(glassCss).toContain('prefers-reduced-transparency: reduce');
  });
});
