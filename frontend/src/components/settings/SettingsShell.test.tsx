import React from 'react';
import { render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import SettingsShell from './SettingsShell';
import {
  SETTINGS_CATEGORIES,
  SETTINGS_NAV_ITEMS,
  SETTINGS_PERMISSIONS,
  canAccessSettingsItem,
  requiredSettingsPermissions,
} from './settingsNavigationConfig';

jest.mock('../../services/api');

/**
 * jsdom has no viewport, and `useSettingsResponsive` is built on
 * `window.matchMedia`, so the breakpoint has to be answered deterministically.
 * `desktopViewport` toggles between the two states under test.
 */
let desktopViewport = true;

beforeAll(() => {
  window.matchMedia = (query: string) =>
    ({
      matches: query.includes('992px') ? desktopViewport : false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList;
});

/**
 * Real permission codes that the RPC migrations DO seed (see
 * `navigationConfig.test.tsx` → `SEEDED_VIEW_PERMISSIONS`).
 *
 * Deliberately contains NO `settings.*` code: the regression under test is the
 * settings area disappearing because of codes nobody can hold, so every test
 * here has to pass for a user who has none of them.
 */
const REAL_USER_PERMISSIONS = ['company.view', 'inventory.view', 'sales.orders.view'];

/**
 * `usePermission` reads the persisted identity synchronously on first render,
 * so a fresh timestamp keeps the hook loaded and stops it from ever reaching
 * for `/auth/me`. A non-empty permission list is required for that.
 */
function seedPermissions(permissions: string[]) {
  localStorage.setItem('token', 'test-token');
  localStorage.setItem(
    'erp_user',
    JSON.stringify({ id: 'user-1', email: 'qa@example.test', displayName: 'QA', permissions }),
  );
  localStorage.setItem('erp_permissions_ts', Date.now().toString());
}

const renderShellAt = (path: string, permissions: string[] = REAL_USER_PERMISSIONS) => {
  seedPermissions(permissions);
  return render(
    <MemoryRouter initialEntries={[path]}>
      <SettingsShell>
        <div data-testid="settings-shell-content" />
      </SettingsShell>
    </MemoryRouter>,
  );
};

/** The settings sidebar only — the shared Breadcrumbs also renders list items. */
const sideNav = () => within(screen.getByTestId('settings-navigation'));

const renderedCategoryIds = () =>
  sideNav()
    .getAllByRole('listitem')
    .map((li) => (within(li).getByRole('link').getAttribute('data-testid') ?? '').replace('settings-nav-', ''));

beforeEach(() => {
  desktopViewport = true;
});

afterEach(() => {
  localStorage.clear();
});

describe('SettingsShell (Settings foundation)', () => {
  it('1. renders the shell chrome: breadcrumbs, scope selector and content outlet', () => {
    renderShellAt('/settings');

    expect(screen.getByTestId('settings-shell')).toBeInTheDocument();
    // Shared breadcrumb component — the Home crumb only exists in the shell.
    expect(screen.getByRole('link', { name: /home/i })).toBeInTheDocument();
    // Organization/company scope selector already implemented by the shell.
    expect(screen.getByTestId('settings-scope-selector')).toBeInTheDocument();
    expect(screen.getByTestId('settings-shell-content')).toBeInTheDocument();
  });

  it('2. renders SettingsSideNavigation with its preserved test id', () => {
    renderShellAt('/settings');

    const nav = screen.getByTestId('settings-navigation');
    expect(nav).toHaveAttribute('aria-label', 'Settings sections');
    expect(nav).toHaveTextContent('Settings');
    expect(sideNav().getAllByRole('listitem').length).toBeGreaterThan(0);
  });

  it('3. renders navigation items straight from the canonical registry, in order', () => {
    renderShellAt('/settings');

    const renderedLabels = sideNav()
      .getAllByRole('listitem')
      .map((li) => li.textContent ?? '');

    // Every canonical entry, in the canonical order, nothing extra.
    expect(sideNav().getAllByRole('listitem')).toHaveLength(SETTINGS_NAV_ITEMS.length);
    SETTINGS_NAV_ITEMS.forEach((item, index) => {
      expect(screen.getByTestId(`settings-nav-${item.id}`)).toBeInTheDocument();
      expect(renderedLabels[index]).toContain(item.label);
    });
  });

  it('4. shows every foundation category without any settings.* grant (PROMPT #01-FIX)', () => {
    // A user holding none of the five settings codes — the real world until a
    // seed migration lands — must still see the complete settings navigation.
    renderShellAt('/settings', REAL_USER_PERMISSIONS);

    expect(renderedCategoryIds()).toEqual(SETTINGS_NAV_ITEMS.map((item) => item.id));
    expect(screen.getByTestId('settings-nav-profile-branding')).toBeInTheDocument();
    expect(screen.getByTestId('settings-nav-payment-details')).toBeInTheDocument();
    expect(screen.getByTestId('settings-nav-organization')).toBeInTheDocument();
    expect(screen.getByTestId('settings-nav-audit')).toBeInTheDocument();
    expect(
      screen.queryByText(/No settings categories are available for your role\./),
    ).not.toBeInTheDocument();

    // The registry metadata itself is untouched — the future contract stands.
    for (const item of SETTINGS_NAV_ITEMS) {
      expect(item.viewPermissions.length).toBeGreaterThan(0);
    }
  });

  it('5. gates a category only once its permission code is really seeded', () => {
    const payment = SETTINGS_CATEGORIES.find((item) => item.id === 'payment-details')!;
    const seeded = new Set([SETTINGS_PERMISSIONS.sensitive]);

    // Today: no code is seeded, so nothing is enforced — even a `can` that
    // always refuses still gets access (the existing authentication-only model).
    expect(requiredSettingsPermissions(payment)).toEqual([]);
    expect(canAccessSettingsItem(() => false, payment)).toBe(true);

    // The day the code is seeded, the very same helpers start enforcing it,
    // so the fallback can never silently become an "allow everything" bypass.
    expect(requiredSettingsPermissions(payment, seeded)).toEqual([
      SETTINGS_PERMISSIONS.sensitive,
    ]);
    expect(canAccessSettingsItem(() => false, payment, seeded)).toBe(false);
    expect(canAccessSettingsItem(() => true, payment, seeded)).toBe(true);

    // The fallback never applies outside the settings registry: a standard
    // category is gated by its own declared code once that code is seeded.
    const invoice = SETTINGS_CATEGORIES.find((item) => item.id === 'invoice')!;
    expect(invoice.viewPermissions).toEqual([SETTINGS_PERMISSIONS.view]);
    expect(
      canAccessSettingsItem(() => false, invoice, new Set([SETTINGS_PERMISSIONS.view])),
    ).toBe(false);
  });

  it('6. highlights Overview when the route is /settings', () => {
    renderShellAt('/settings');

    expect(screen.getByTestId('settings-nav-overview')).toHaveAttribute('aria-current', 'page');
    expect(screen.getByTestId('settings-nav-profile-branding')).not.toHaveAttribute('aria-current');
    expect(screen.getByTestId('settings-nav-invoice')).not.toHaveAttribute('aria-current');
  });

  it('7. moves the active section to /settings/profile-branding', () => {
    renderShellAt('/settings/profile-branding');

    expect(screen.getByTestId('settings-nav-profile-branding')).toHaveAttribute('aria-current', 'page');
    expect(screen.getByTestId('settings-nav-overview')).not.toHaveAttribute('aria-current');
    expect(screen.getByTestId('settings-nav-invoice')).not.toHaveAttribute('aria-current');
  });

  it('8. keeps the parent section active on a nested child route', () => {
    renderShellAt('/settings/profile-branding/123');

    expect(screen.getByTestId('settings-nav-profile-branding')).toHaveAttribute('aria-current', 'page');
    expect(screen.getByTestId('settings-nav-overview')).not.toHaveAttribute('aria-current');
  });

  it('9. renders exactly one sidebar — child sections never duplicate it', () => {
    renderShellAt('/settings/inventory');

    expect(screen.getAllByTestId('settings-navigation')).toHaveLength(1);
    expect(screen.getByTestId('settings-nav-inventory')).toHaveAttribute('aria-current', 'page');
    expect(screen.getByTestId('settings-shell-content')).toBeInTheDocument();
  });

  it('10. collapses the same sidebar behind the mobile toggle below 768px', () => {
    desktopViewport = false;
    renderShellAt('/settings/profile-branding');

    const toggle = screen.getByTestId('settings-nav-toggle');
    expect(toggle).toHaveAttribute('aria-controls', 'settings-navigation');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    // Still one sidebar in the DOM — only hidden, never unmounted or duplicated.
    expect(screen.getAllByTestId('settings-navigation')).toHaveLength(1);
    expect(screen.getByTestId('settings-navigation').className).toContain(
      'erp-settings-nav--collapsed',
    );
  });
});
