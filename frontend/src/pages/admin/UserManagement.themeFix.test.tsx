/**
 * USERS-UI-THEME-FIX-03 — Light-theme contrast + hover-line regression tests.
 *
 * Part 1 (rendered DOM, jsdom): user identity lines, persisted division
 * names, icon-only actions, working More Filters panel.
 * Part 2 (static stylesheet audit): pins the root-cause fixes so they
 * cannot silently regress — header title inherits the strong-header
 * color, no fixed-column separator lines/shadows, no hover inset bar,
 * no hard-coded black table text. (Cascade behavior itself is verified
 * in a real browser by scratch/p27-verify.cjs + the hover sweep; jsdom
 * does not compute the CSS cascade.)
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import { App } from 'antd';
import * as fs from 'fs';
import * as path from 'path';
import UserManagement from './UserManagement';
import apiService from '../../services/api';
import { useUserStore } from '../../store/userStore';

jest.mock('../../services/api');
jest.setTimeout(30000);

const apiMock = apiService as jest.Mocked<typeof apiService>;

const mockUsers = [
  {
    id: 'user-theme-1',
    authUserId: 'auth-theme-1',
    displayName: 'Theme Fix User',
    username: 'themefix',
    email: 'themefix@pwi.test',
    phone: '+92-300-9999999',
    employeeId: 'EMP-0909',
    status: 'ACTIVE',
    avatarUrl: null,
    defaultCompany: { id: 'comp-1', tradeName: 'PakWiz Industries' },
    userRoles: [
      { id: 'ur-1', roleId: 'role-admin', role: { id: 'role-admin', roleCode: 'ADMIN', name: 'Administrator' } },
    ],
    organizationScopes: [
      {
        id: 'scope-1',
        companyId: 'comp-1',
        divisionId: 'div-ccd',
        scopeLevel: 'DIVISION',
        isFullScope: false,
        status: 'ACTIVE',
        division: { id: 'div-ccd', divisionCode: 'DIV-CCD', name: 'Control Cable Division' },
      },
    ],
    createdAt: '2026-09-29T10:30:00Z',
    lastLoginAt: '2026-09-30T14:45:00Z',
  },
];

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

const renderComponent = () =>
  render(
    <MemoryRouter>
      <App>
        <UserManagement />
      </App>
    </MemoryRouter>,
  );

describe('USERS-UI-THEME-FIX-03 — rendered identity and controls', () => {
  beforeEach(() => {
    localStorage.clear();
    const currentUser = {
      id: 'admin-1',
      displayName: 'Muhammad Afsar',
      email: 'afsar@pwi.test',
      permissions: [
        'admin.users.view',
        'admin.users.create',
        'admin.users.update',
        'admin.users.assign_roles',
        'admin.users.manage_scope',
        'admin.users.deactivate',
        'admin.users.activate',
      ],
    };
    localStorage.setItem('erp_user', JSON.stringify(currentUser));
    localStorage.setItem('erp_permissions_ts', Date.now().toString());
    useUserStore.getState().setUser(currentUser);
    apiMock.get.mockReset();
    apiMock.get.mockImplementation((url: string) => {
      if (url === '/auth/me') return Promise.resolve({ data: currentUser } as any);
      if (url === '/admin/users') {
        return Promise.resolve({ data: mockUsers, total: mockUsers.length } as any);
      }
      if (url === '/admin/roles') return Promise.resolve({ data: [], total: 0 } as any);
      return Promise.resolve({ data: [] } as any);
    });
  });

  it('renders every user identity line from real data', async () => {
    renderComponent();
    expect(await screen.findByText('Theme Fix User')).toBeInTheDocument();
    expect(screen.getByText('@themefix')).toBeInTheDocument();
    expect(screen.getByText('EMP-0909')).toBeInTheDocument();
    expect(screen.getByText('themefix@pwi.test')).toBeInTheDocument();
    expect(screen.getByText('+92-300-9999999')).toBeInTheDocument();
  });

  it('renders the persisted division name (never a hard-coded one)', async () => {
    renderComponent();
    await screen.findByText('Theme Fix User');
    expect(screen.getByText('Control Cable Division')).toBeInTheDocument();
  });

  it('keeps Actions icon-only with accessible names', async () => {
    renderComponent();
    await screen.findByText('Theme Fix User');
    const row = screen.getByText('Theme Fix User').closest('tr')!;
    const buttons = Array.from(row.querySelectorAll('td:last-child button'));
    expect(buttons.length).toBeGreaterThan(0);
    // Icon-only: no visible text content inside the buttons.
    buttons.forEach((b) => expect(b.textContent?.trim() ?? '').toBe(''));
    // ...but every icon-only action staysAccessible.
    expect(screen.getByRole('button', { name: 'Division Access' })).toBeInTheDocument();
  });

  it('opens More Filters and exposes the existing Status filter', async () => {
    renderComponent();
    await screen.findByText('Theme Fix User');
    fireEvent.click(screen.getByRole('button', { name: /More Filters/ }));
    expect(await screen.findByText('Filters')).toBeInTheDocument();
    // Scoped to the panel via its unique placeholder (the table also has a
    // "Status" column header, so a bare getByText would be ambiguous).
    expect(screen.getByText('All statuses')).toBeInTheDocument();
  });
});

describe('USERS-UI-THEME-FIX-03 — static stylesheet audit', () => {
  const cssPath = path.join(__dirname, 'userManagement.css');
  const css = fs.readFileSync(cssPath, 'utf8');

  it('header title inherits the strong-header color (no dark-on-dark)', () => {
    expect(css).toMatch(/\.ant-table-column-title[\s\S]{0,200}color:\s*inherit/);
  });

  it('uses one unified row pattern for plain and fixed cells', () => {
    // Base + odd + even + hover all share the high-specificity
    // `.ant-table-wrapper ... tr.ant-table-row` pattern, so global
    // erp-table.css parity rules cannot split plain vs fixed cells.
    expect(css).toMatch(/\.ant-table-wrapper \.ant-table-tbody > tr\.ant-table-row:nth-child\(odd\)/);
    expect(css).toMatch(/\.ant-table-wrapper \.ant-table-tbody > tr\.ant-table-row:nth-child\(even\)/);
    expect(css).toMatch(/\.ant-table-wrapper \.ant-table-tbody > tr\.ant-table-row:hover/);
  });

  it('has no fixed-column separator lines or ping shadows', () => {
    expect(css).toMatch(/tr\.ant-table-row > td \{[\s\S]{0,500}box-shadow:\s*none/);
    expect(css).toMatch(/tr\.ant-table-row > td \{[\s\S]{0,500}border-left:\s*none/);
    expect(css).toMatch(/\.ant-table-cell-fix-right-first::after[\s\S]{0,500}content:\s*none/);
  });

  it('has no hover inset bar (background tint is the hover cue)', () => {
    expect(css).not.toMatch(/inset 3px 0 0/);
  });

  it('has no hard-coded black table text', () => {
    expect(css).not.toMatch(/color:\s*#(?:000|000000|111|111111|1f1f1f|212121)\b/);
    expect(css).not.toMatch(/color:\s*black\b/);
  });

  it('status pills use theme tokens, not fixed hexes', () => {
    expect(css).toMatch(/\.um-status-tag\.ant-tag-success[\s\S]{0,200}var\(--theme-success/);
    expect(css).toMatch(/\.um-status-tag\.ant-tag-error[\s\S]{0,200}var\(--theme-danger/);
  });
});
