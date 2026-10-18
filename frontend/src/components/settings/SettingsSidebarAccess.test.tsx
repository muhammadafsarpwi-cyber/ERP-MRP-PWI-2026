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
const settingsEntry = findNavEntry('/settings');

afterEach(() => {
  localStorage.clear();
});

describe('Sidebar — Company Settings pinned footer placement', () => {
  it('1. the middle menu does not duplicate Settings (anchored in pinned footer)', () => {
    const keys = sidebarKeys(() => true);
    // Removed from middle menu so it sits cleanly in the pinned footer
    expect(keys).not.toContain('/settings');
  });

  it('2. findNavEntry resolves Company Settings without permission gating', () => {
    expect(settingsEntry).toBeDefined();
    expect(settingsEntry?.label).toBe('Company Settings');
    expect(settingsEntry?.icon).toBe(SettingOutlined);
    expect(settingsEntry?.color).toBe('neutral');
    expect(settingsEntry?.permissions).toBeUndefined();
    expect(findNavEntry('/settings')?.permissions ?? []).toHaveLength(0);
  });

  it('3. navPathForKey resolves /settings correctly', () => {
    expect(navPathForKey('/settings')).toBe('/settings');
  });

  it('4. stays highlighted for every /settings/* route (one flat Settings item)', () => {
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

  it('9. no duplicate settings entries leaked into the main menu', () => {
    const keys = allMainSidebarKeys();
    expect(keys.filter((key) => key.startsWith('/settings/'))).toEqual([]);

    const labels = NAV_ENTRIES.flatMap((entry) =>
      isNavGroup(entry) ? entry.children.map((child) => child.label) : [entry.label],
    );
    expect(labels.filter((label) => label === 'Company Settings')).toHaveLength(0);

    // The 24 settings nav items (overview + 23 categories) live only in the
    // settings registry, which is never merged into NAV_ENTRIES, so the main
    // sidebar cannot grow copies.
    expect(SETTINGS_NAV_ITEMS).toHaveLength(24);
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
