import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import { Menu } from 'antd';
import { SettingOutlined } from '@ant-design/icons';
import { buildMenuItems } from '../layout/MainLayout';
import {
  NAV_ENTRIES,
  findNavEntry,
  isNavGroup,
  navPathForKey,
  resolveNavActiveKeys,
  type NavItem,
} from '../layout/navigationConfig';
import {
  SETTINGS_NAV_KEYS,
  SETTINGS_NAV_ITEMS,
  SEEDED_SETTINGS_PERMISSIONS,
  SETTINGS_PERMISSIONS,
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

/** Reads the `key` of an antd menu item without widening to `any`. */
function itemKey(item: unknown): string | null {
  if (typeof item === 'object' && item !== null && 'key' in item) {
    return String((item as { key: unknown }).key);
  }
  return null;
}

/** Top-level keys the MAIN ERP SIDEBAR renders for a given permission check. */
const sidebarKeys = (hasPermission: (code: string) => boolean): string[] =>
  (buildMenuItems(hasPermission) ?? [])
    .map(itemKey)
    .filter((key): key is string => key !== null);

/** Every route key the main sidebar config declares, groups flattened. */
const allMainSidebarKeys = (): string[] =>
  NAV_ENTRIES.flatMap((entry) =>
    isNavGroup(entry) ? entry.children.map((child) => child.key) : [entry.key],
  );

/** The top-level Settings nav entry — the button that regressed. */
const settingsEntry = NAV_ENTRIES.find(
  (entry): entry is NavItem => entry.key === '/settings' && !isNavGroup(entry),
);

afterEach(() => {
  localStorage.clear();
});

describe('Main sidebar — existing Settings entry (PROMPT #01-FIX)', () => {
  it('1. the main sidebar contains Settings as a normal top-level item', () => {
    // `buildMenuItems` is the exact function MainLayout feeds to <Menu />.
    const keys = sidebarKeys(() => true);

    expect(keys).toContain('/settings');
    // Still a leaf entry, sitting before the trailing "development" entry.
    expect(keys.indexOf('/settings')).toBeLessThan(keys.indexOf('development'));
  });

  it('2. shows Settings to a user who holds no permission at all', () => {
    // Harshest possible caller: every permission check refuses. Settings still
    // renders because the entry declares no permission — the rule that applied
    // before PROMPT #01, which `buildMenuItems` implements as
    // `if (!required || required.length === 0) return true`.
    expect(sidebarKeys(() => false)).toContain('/settings');
    expect(sidebarKeys((code) => code !== SETTINGS_PERMISSIONS.view)).toContain('/settings');
    expect(sidebarKeys((code) => code.indexOf('settings.') !== 0)).toContain('/settings');
  });

  it('3. clicking Settings navigates to /settings', () => {
    const navigate = jest.fn();
    // Mirrors `MainLayout.handleMenuClick`, which calls navPathForKey(info.key).
    const onClick = (info: { key: string }) => navigate(navPathForKey(info.key));

    render(
      <MemoryRouter>
        <Menu items={buildMenuItems(() => false) ?? []} onClick={onClick} />
      </MemoryRouter>,
    );

    // The antd icon contributes its own accessible name ("setting"), so the
    // item's computed name is "setting Settings".
    const settingsItem = screen.getByRole('menuitem', { name: /settings$/i });
    expect(settingsItem).toBeInTheDocument();

    fireEvent.click(settingsItem);
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith('/settings');
    // The route target and the menu key are one and the same.
    expect(navPathForKey('/settings')).toBe('/settings');
  });

  it('4. keeps its original label, icon, colour and permission model', () => {
    expect(settingsEntry).toBeDefined();
    expect(settingsEntry?.label).toBe('Company Settings');
    expect(settingsEntry?.icon).toBe(SettingOutlined);
    expect(settingsEntry?.color).toBe('neutral');

    // Exact restoration of the pre-PROMPT #01 entry: NO `permissions` field.
    expect(settingsEntry?.permissions).toBeUndefined();
    expect(findNavEntry('/settings')?.permissions ?? []).toHaveLength(0);

    // The code that caused the regression is genuinely not grantable today, so
    // it can never be what hides the button.
    expect(SEEDED_SETTINGS_PERMISSIONS.size).toBe(0);
    expect(SEEDED_SETTINGS_PERMISSIONS.has(SETTINGS_PERMISSIONS.view)).toBe(false);
  });

  it('5. stays highlighted for every /settings/* route (one flat Settings item)', () => {
    for (const path of [
      '/settings',
      '/settings/profile-branding',
      '/settings/invoice',
      '/settings/payment-details',
      '/settings/whatsapp',
      '/settings/audit',
    ]) {
      expect(resolveNavActiveKeys(path).selectedKey).toBe('/settings');
    }
  });

  it('9. has exactly one Settings entry — no duplicates in the main sidebar', () => {
    const keys = allMainSidebarKeys();

    // Exactly one `/settings`, and no category route leaked into the main menu.
    expect(keys.filter((key) => key === '/settings')).toHaveLength(1);
    expect(keys.filter((key) => key.startsWith('/settings/'))).toEqual([]);

    // Exactly one item literally labelled "Company Settings".
    const labels = NAV_ENTRIES.flatMap((entry) =>
      isNavGroup(entry) ? entry.children.map((child) => child.label) : [entry.label],
    );
    expect(labels.filter((label) => label === 'Company Settings')).toHaveLength(1);

    // The 23 settings categories live only in the settings registry, which is
    // never merged into NAV_ENTRIES, so the main sidebar cannot grow copies.
    expect(SETTINGS_NAV_ITEMS).toHaveLength(23);
    expect(keys.filter((key) => SETTINGS_NAV_KEYS.has(key))).toEqual([]);
  });

  it('10. leaves Maintenance / Job Card navigation untouched', () => {
    const maintenanceKeys = allMainSidebarKeys().filter((key) => key.startsWith('/maintenance/'));

    // The settings fix is additive: maintenance is still there, still with its
    // own keys, and nothing was re-pointed at /settings.
    expect(maintenanceKeys).toContain('/maintenance/job-cards');
    expect(maintenanceKeys.length).toBeGreaterThan(0);
    expect(maintenanceKeys.some((key) => key.startsWith('/settings'))).toBe(false);
    expect(sidebarKeys(() => true)).toContain('maintenance');
  });
});
