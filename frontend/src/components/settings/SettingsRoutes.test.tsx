import fs from 'fs';
import path from 'path';
import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import ProtectedRoute from '../auth/ProtectedRoute';
import { findNavEntry } from '../layout/navigationConfig';
import SettingsRoutes from './SettingsRoutes';
import {
  SETTINGS_CATEGORIES,
  SETTINGS_NAV_ENTRIES,
  SETTINGS_NAV_ITEMS,
  SETTINGS_NAV_KEYS,
  SETTINGS_PERMISSIONS,
  SETTINGS_ROUTE_PATHS,
  SETTINGS_OVERVIEW,
  SEEDED_SETTINGS_PERMISSIONS,
  findSettingsNavItem,
  requiredSettingsPermissions,
  settingsRelativePath,
} from './settingsNavigationConfig';

jest.mock('../../services/api');

beforeAll(() => {
  window.matchMedia = (query: string) =>
    ({
      matches: query.includes('992px'),
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList;
});

function seedPermissions(permissions: string[]) {
  localStorage.setItem('token', 'test-token');
  localStorage.setItem(
    'erp_user',
    JSON.stringify({ id: 'user-1', email: 'qa@example.test', displayName: 'QA', permissions }),
  );
  localStorage.setItem('erp_permissions_ts', Date.now().toString());
}

/**
 * Real permission codes the RPC migrations DO seed (see
 * `navigationConfig.test.tsx` → `SEEDED_VIEW_PERMISSIONS`).
 *
 * Deliberately contains NO `settings.*` code: the whole point of the
 * PROMPT #01-FIX suite is that Settings stays reachable for a user who holds
 * none of them, because they are not present in the backend catalog yet.
 */
const REAL_USER_PERMISSIONS = ['company.view', 'inventory.view', 'sales.orders.view'];

/**
 * Mirrors the real mounting in `App.tsx`:
 * outer `/*` → ProtectedRoute → app `<Routes>` → `/settings/*` → SettingsRoutes,
 * i.e. the same nesting depth (MainLayout is layout chrome, not routing).
 */
const renderSettingsAt = (
  pathName: string,
  permissions: string[] = REAL_USER_PERMISSIONS,
  options: { session?: boolean } = {},
) => {
  // `{ session: false }` ⇒ no token at all, which is how `ProtectedRoute`
  // decides between /login and the app.
  if (options.session === false) localStorage.clear();
  else seedPermissions(permissions);
  return render(
    <MemoryRouter initialEntries={[pathName]}>
      <Routes>
        <Route path="/login" element={<div data-testid="login-redirect" />} />
        <Route
          path="/*"
          element={
            <ProtectedRoute>
              <Routes>
                <Route path="/settings/*" element={<SettingsRoutes />} />
                <Route path="*" element={<div data-testid="route-unmatched" />} />
              </Routes>
            </ProtectedRoute>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
};

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe('Settings route architecture (/settings/*)', () => {
  it('4. resolves /settings to the shell + pre-existing overview page', () => {
    // No settings.* code is granted — access must not depend on one.
    renderSettingsAt('/settings');

    expect(screen.getByTestId('settings-shell')).toBeInTheDocument();
    expect(screen.getByTestId('settings-navigation')).toBeInTheDocument();
    // The Theme Studio + Audio page is preserved as the overview.
    expect(screen.getByText('Theme Studio & Appearance')).toBeInTheDocument();
    expect(screen.getByTestId('settings-nav-overview')).toHaveAttribute('aria-current', 'page');
    // No placeholder is mounted on the overview.
    expect(screen.queryByTestId('settings-placeholder-overview')).not.toBeInTheDocument();
  });

  it('5. resolves nested route (/settings/invoice) to InvoiceSettings module', () => {
    renderSettingsAt('/settings/invoice');

    const invoiceSettings = screen.getByTestId('invoice-settings');
    expect(invoiceSettings).toBeInTheDocument();
    expect(screen.getByTestId('settings-nav-invoice')).toHaveAttribute('aria-current', 'page');
    expect(screen.getByTestId('settings-nav-overview')).not.toHaveAttribute('aria-current');
  });

  it('5b. resolves EVERY registered settings route without crashing', () => {
    seedPermissions(REAL_USER_PERMISSIONS);
    expect(SETTINGS_ROUTE_PATHS.length).toBe(SETTINGS_CATEGORIES.length);

    for (const routePath of SETTINGS_ROUTE_PATHS) {
      cleanup();
      const slug = routePath.replace('/settings/', '');
      renderSettingsAt(routePath, REAL_USER_PERMISSIONS);

      expect(screen.getByTestId('settings-shell')).toBeInTheDocument();
      if (slug === 'company' || slug === 'profile-branding') {
        expect(screen.getByTestId('company-settings')).toBeInTheDocument();
      } else if (slug === 'invoice') {
        expect(screen.getByTestId('invoice-settings')).toBeInTheDocument();
      } else {
        expect(screen.getByTestId(`settings-placeholder-${slug}`)).toBeInTheDocument();
      }
      // Exactly one sidebar is mounted for the whole shell.
      expect(screen.getAllByTestId('settings-navigation')).toHaveLength(1);
    }
  });

  it('6. active navigation state follows the routed section', () => {
    renderSettingsAt('/settings/edit-lock', REAL_USER_PERMISSIONS);

    expect(screen.getByTestId('settings-nav-edit-lock')).toHaveAttribute('aria-current', 'page');
    expect(screen.getAllByTestId('settings-nav-edit-lock')).toHaveLength(1);
    expect(screen.getByTestId('settings-nav-tax')).not.toHaveAttribute('aria-current');
  });

  it('7a. keeps /settings accessible with NO settings.* code (pre-PROMPT #01 model)', () => {
    renderSettingsAt('/settings');

    expect(screen.queryByText('Access Denied')).not.toBeInTheDocument();
    expect(screen.getByTestId('settings-shell')).toBeInTheDocument();
    expect(screen.getByTestId('settings-navigation')).toBeInTheDocument();
    // The pre-existing Settings page still loads inside the new shell.
    expect(screen.getByText('Theme Studio & Appearance')).toBeInTheDocument();
  });

  it('7b. still enforces AUTHENTICATION — without a token the settings never open', () => {
    renderSettingsAt('/settings', [], { session: false });

    expect(screen.getByTestId('login-redirect')).toBeInTheDocument();
    expect(screen.queryByTestId('settings-shell')).not.toBeInTheDocument();
    expect(screen.queryByTestId('settings-navigation')).not.toBeInTheDocument();
  });

  it('7c. applies the same fallback to every nested settings category', () => {
    renderSettingsAt('/settings/payment-details');

    expect(screen.queryByText('Access Denied')).not.toBeInTheDocument();
    expect(screen.getByTestId('settings-placeholder-payment-details')).toBeInTheDocument();
    // Sensitive, organization and audit categories behave identically.
    renderSettingsAt('/settings/organization');
    expect(screen.getByTestId('settings-placeholder-organization')).toBeInTheDocument();
  });

  it('9. requires no unseeded settings.* code anywhere in the settings route tree', () => {
    // The top-level entry declares no permission at all — exactly as it did
    // before PROMPT #01, when it was never permission-gated.
    expect(findNavEntry('/settings')?.permissions ?? []).toHaveLength(0);

    // Every category resolves through the canonical registry but enforces only
    // codes the backend can actually grant — none yet, so `[]` = authentication
    // only, which is the application's existing fallback convention.
    for (const item of SETTINGS_NAV_ITEMS) {
      const route = item.overview ? '/settings' : item.path;
      const entry = findNavEntry(route);
      expect(entry?.key).toBe(route);
      expect(entry?.permissions ?? []).toEqual([]);
      expect(requiredSettingsPermissions(item)).toEqual([]);
    }

    // The FUTURE contract is fully preserved in the registry, untouched.
    expect(SEEDED_SETTINGS_PERMISSIONS.size).toBe(0);
    expect(findSettingsNavItem('/settings/invoice')?.viewPermissions).toEqual([
      SETTINGS_PERMISSIONS.view,
    ]);
    expect(findSettingsNavItem('/settings/payment-details')?.viewPermissions).toEqual([
      SETTINGS_PERMISSIONS.sensitive,
    ]);
    expect(findSettingsNavItem('/settings/organization')?.viewPermissions).toEqual([
      SETTINGS_PERMISSIONS.organization,
    ]);
    expect(findSettingsNavItem('/settings/audit')?.viewPermissions).toEqual([
      SETTINGS_PERMISSIONS.audit,
    ]);
  });

  it('8. every placeholder renders honestly — planned, no fake form or save action', () => {
    seedPermissions(REAL_USER_PERMISSIONS);

    // Tests remaining planned placeholders (excluding implemented real settings modules)
    const implementedIds = new Set([
      'company',
      'profile-branding',
      'invoice',
      'payment-details',
      'reminders-alerts',
      'whatsapp',
      'inventory',
      'document-options',
      'document-numbering',
    ]);
    const pendingCategories = SETTINGS_CATEGORIES.filter((item) => !implementedIds.has(item.id));
    for (const item of pendingCategories) {
      cleanup();
      renderSettingsAt(item.path, REAL_USER_PERMISSIONS);

      const placeholder = screen.getByTestId(`settings-placeholder-${item.id}`);
      expect(placeholder).toHaveAttribute('data-edit-permission', item.editPermission);
      expect(placeholder).toHaveTextContent('PLANNED');
      expect(placeholder).toHaveTextContent('under construction');
      expect(placeholder).toHaveTextContent('Nothing is stored or changed here.');
      // No editor affordance is faked for an unimplemented module.
      expect(screen.queryByRole('button', { name: /save/i })).not.toBeInTheDocument();
    }
  });

  it('8b. resolves /settings/company to the real CompanySettings module', () => {
    seedPermissions(REAL_USER_PERMISSIONS);
    renderSettingsAt('/settings/company', REAL_USER_PERMISSIONS);

    expect(screen.getByTestId('company-settings')).toBeInTheDocument();
    expect(screen.getByText('Business identity')).toBeInTheDocument();
    expect(screen.getAllByText('Currency').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Logo & preview')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /save changes/i })).toBeInTheDocument();
  });

  it('8c. resolves /settings/profile-branding to the real CompanySettings module with live invoice header preview', () => {
    seedPermissions(REAL_USER_PERMISSIONS);
    renderSettingsAt('/settings/profile-branding', REAL_USER_PERMISSIONS);

    expect(screen.getByTestId('company-settings')).toBeInTheDocument();
    expect(screen.getByText('Business identity')).toBeInTheDocument();
    expect(screen.getByText('Logo & preview')).toBeInTheDocument();
    expect(screen.getByText('Live preview of your invoice header.')).toBeInTheDocument();
  });

  it('8d. resolves /settings/invoice to the real InvoiceSettings module with 5 design patterns and live preview', () => {
    seedPermissions(REAL_USER_PERMISSIONS);
    renderSettingsAt('/settings/invoice', REAL_USER_PERMISSIONS);

    expect(screen.getByTestId('invoice-settings')).toBeInTheDocument();
    expect(screen.getByText('Terms & tax')).toBeInTheDocument();
    expect(screen.getByText('Default wording')).toBeInTheDocument();
    expect(screen.getByText('Invoice design')).toBeInTheDocument();
    expect(screen.getByTestId('invoice-pattern-modern')).toBeInTheDocument();
    expect(screen.getByTestId('invoice-pattern-classic')).toBeInTheDocument();
    expect(screen.getByTestId('invoice-pattern-corporate')).toBeInTheDocument();
    expect(screen.getByTestId('invoice-pattern-elegant')).toBeInTheDocument();
    expect(screen.getByTestId('invoice-pattern-bold')).toBeInTheDocument();
    expect(screen.getByText('Live Preview')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /save invoice settings/i })).toBeInTheDocument();
  });

  it('redirects an unknown settings slug back to the overview', () => {
    renderSettingsAt('/settings/definitely-not-a-category');

    expect(screen.queryByTestId('route-unmatched')).not.toBeInTheDocument();
    expect(screen.getByText('Theme Studio & Appearance')).toBeInTheDocument();
  });
});

describe('settingsNavigationConfig — canonical registry (Phase 5 / Phase 9)', () => {
  it('11. remains the single registry: 1 overview + 22 categories, unique ids and paths', () => {
    expect(SETTINGS_NAV_ITEMS[0]).toBe(SETTINGS_OVERVIEW);
    expect(SETTINGS_CATEGORIES).toHaveLength(22);
    expect(SETTINGS_NAV_ITEMS).toHaveLength(23);

    const ids = SETTINGS_NAV_ITEMS.map((item) => item.id);
    const paths = SETTINGS_NAV_ITEMS.map((item) => item.path);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(paths).size).toBe(paths.length);

    for (const item of SETTINGS_NAV_ITEMS) {
      expect(item.path).toBe('/settings' + (item.overview ? '' : `/${item.id}`));
      expect(item.label.length).toBeGreaterThan(0);
      expect(item.description.length).toBeGreaterThan(0);
      expect(item.viewPermissions.length).toBeGreaterThan(0);
      expect(item.editPermission.length).toBeGreaterThan(0);
    }
  });

  it('11b. generates the navigation and route metadata from itself, with no duplicate tree', () => {
    expect(SETTINGS_NAV_ENTRIES).toHaveLength(SETTINGS_CATEGORIES.length);
    expect(SETTINGS_NAV_KEYS.size).toBe(SETTINGS_CATEGORIES.length);
    expect(SETTINGS_ROUTE_PATHS).toEqual(SETTINGS_CATEGORIES.map((item) => item.path));

    // The nested <Routes> paths are derived, never restated.
    for (const item of SETTINGS_NAV_ITEMS.filter((entry) => !entry.overview)) {
      expect(settingsRelativePath(item)).toBe(item.id);
      expect(`/settings/${settingsRelativePath(item)}`).toBe(item.path);
    }
    expect(settingsRelativePath(SETTINGS_OVERVIEW)).toBe('');
    expect(findNavEntrySafe('/settings/profile-branding')).toBe(true);
  });
});

/** `findNavEntry` resolves settings categories through the canonical registry. */
function findNavEntrySafe(route: string): boolean {
  return SETTINGS_NAV_KEYS.has(findNavEntry(route)?.key ?? '');
}

describe('Settings source hygiene (no obsolete files or imports)', () => {
  const SRC_ROOT = path.resolve(__dirname, '..', '..');
  const SETTINGS_DIR = __dirname;

  function walk(dir: string, out: string[] = []): string[] {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full, out);
      else if (/\.tsx?$/.test(entry.name)) out.push(full);
    }
    return out;
  }

  it('10. contains no old `./SettingsNavigation` import anywhere in the frontend', () => {
    const offenders = walk(SRC_ROOT)
      .map((file) => ({ file, text: fs.readFileSync(file, 'utf8') }))
      .filter(({ text }) => /from\s+['"][^'"]*\/SettingsNavigation['"]/.test(text))
      .map(({ file }) => path.relative(SRC_ROOT, file));

    expect(offenders).toEqual([]);
  });

  it('10b. has no obsolete settingsNavigation.ts / SettingsNavigation.tsx file', () => {
    const basenames = fs.readdirSync(SETTINGS_DIR).map((name) => name.toLowerCase());
    expect(basenames).not.toContain('settingsnavigation.ts');
    expect(basenames).not.toContain('settingsnavigation.tsx');
    expect(basenames).toContain('settingsnavigationconfig.ts');
    expect(basenames).toContain('settingssidenavigation.tsx');
    expect(basenames).toContain('settingsroutes.tsx');
  });

  it('10c. declares exactly one settings route tree in App.tsx', () => {
    const appSource = fs.readFileSync(path.join(SRC_ROOT, 'App.tsx'), 'utf8');
    const settingsRoutes = appSource.match(/<Route\s+path="\/settings[^"]*"\s+element=/g) ?? [];
    expect(settingsRoutes).toHaveLength(1);
    expect(settingsRoutes[0]).toContain('/settings/*');
    // The old flat route is gone.
    expect(appSource).not.toContain('path="/settings" element=');
  });

  it('11c. has exactly one file that exports the canonical categories', () => {
    const exportsRegistry = walk(SRC_ROOT)
      .filter((file) => !/\.(test|spec)\.tsx?$/.test(file))
      .filter((file) => /export const SETTINGS_CATEGORIES/.test(fs.readFileSync(file, 'utf8')))
      .map((file) => path.relative(SRC_ROOT, file));
    expect(exportsRegistry).toEqual([
      path.join('components', 'settings', 'settingsNavigationConfig.ts'),
    ]);
  });
});
