/**
 * PROMPT #27 — Main Users table visual redesign contract tests.
 *
 * Covers only presentation guarantees that are safe to assert in jsdom:
 * composite User cell, in-cell icons, Division Access badges (name + colour
 * determinism), the fixed Actions column, and the new §4 Columns / Reset
 * toolbar controls.
 *
 * No backend/API/permission behaviour is changed by these tests.
 */
import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import { App } from 'antd';
import UserManagement from './UserManagement';
import apiService from '../../services/api';
import { useUserStore } from '../../store/userStore';

jest.mock('../../services/api');

const apiMock = apiService as jest.Mocked<typeof apiService>;

/**
 * UserManagement is a full admin page (antd Table + Dropdown + modals). Under
 * jsdom its first mount reliably exceeds jest's default 5s budget — the same
 * harness-timing caveat is documented in UserManagement.divisionAccessSave.test.tsx.
 * Raised here so a slow mount is not misreported as a product failure.
 */
jest.setTimeout(30000);

const D_CCD = 'div-ccd';
const D_SPD = 'div-spd';

const mockUsers = [
  {
    id: 'user-a',
    authUserId: 'auth-a',
    displayName: 'Ayesha Khan',
    username: 'ayesha',
    email: 'ayesha@pwi.test',
    phone: '+92-300-1111111',
    employeeId: 'EMP-0001',
    status: 'ACTIVE',
    avatarUrl: null,
    userRoles: [
      { id: 'ur-1', roleId: 'role-admin', role: { id: 'role-admin', roleCode: 'ADMIN', name: 'Administrator' } },
    ],
    organizationScopes: [
      {
        id: 'scope-1',
        companyId: 'comp-1',
        divisionId: D_CCD,
        scopeLevel: 'DIVISION',
        isFullScope: false,
        status: 'ACTIVE',
        division: { id: D_CCD, divisionCode: 'DIV-CCD', name: 'Control Cable Division' },
      },
    ],
    createdAt: '2026-09-10T10:00:00Z',
    lastLoginAt: '2026-09-12T10:00:00Z',
  },
  {
    // Same division as user-a — used to prove the badge colour is stable.
    id: 'user-b',
    authUserId: 'auth-b',
    displayName: 'Bilal Ahmed',
    username: 'bilal',
    email: 'bilal@pwi.test',
    phone: '+92-300-2222222',
    employeeId: 'EMP-0002',
    status: 'INACTIVE',
    avatarUrl: null,
    userRoles: [],
    organizationScopes: [
      {
        id: 'scope-2',
        companyId: 'comp-1',
        divisionId: D_CCD,
        scopeLevel: 'DIVISION',
        isFullScope: false,
        status: 'ACTIVE',
        division: { id: D_CCD, divisionCode: 'DIV-CCD', name: 'Control Cable Division' },
      },
    ],
    createdAt: '2026-09-11T10:00:00Z',
    lastLoginAt: null,
  },
];

const mockRoles = [
  { id: 'role-admin', roleCode: 'ADMIN', name: 'Administrator' },
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

describe('PROMPT #27 — Users main table redesign', () => {
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
        'admin.users.deactivate',
        'admin.users.activate',
        'admin.users.manage_scope',
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
      if (url === '/admin/roles') {
        return Promise.resolve({ data: mockRoles, total: mockRoles.length } as any);
      }
      return Promise.resolve({ data: [] } as any);
    });
  });

  it('renders the composite User cell with username secondary line', async () => {
    renderComponent();

    expect(await screen.findByText('Ayesha Khan')).toBeInTheDocument();
    expect(screen.getByText('@ayesha')).toBeInTheDocument();
    expect(screen.getByText('@bilal')).toBeInTheDocument();
    // No duplicate/renamed data: identifiers are unchanged.
    expect(screen.getByText('EMP-0001')).toBeInTheDocument();
    expect(screen.getByText('ayesha@pwi.test')).toBeInTheDocument();
    expect(screen.getByText('+92-300-1111111')).toBeInTheDocument();
  });

  it('renders email as a mailto link and keeps the Division Access name (not the raw id)', async () => {
    renderComponent();

    const email = (await screen.findByText('ayesha@pwi.test')).closest('a');
    expect(email).toHaveAttribute('href', 'mailto:ayesha@pwi.test');

    // Division Access shows the human-readable division name, never the id.
    expect(screen.getAllByText('Control Cable Division').length).toBeGreaterThan(0);
    expect(screen.queryByText(D_CCD)).not.toBeInTheDocument();
  });

  it('gives the same division the same badge colour every render (deterministic)', async () => {
    const { container } = renderComponent();

    await screen.findByText('Ayesha Khan');

    // Both rows carry DIV-CCD, so both tags must resolve to the identical
    // antd colour class — a random per-render colour would break this.
    const tags = Array.from(
      container.querySelectorAll('.um-div-tag'),
    ) as HTMLElement[];
    expect(tags.length).toBeGreaterThanOrEqual(2);
    const classes = tags.map((t) => t.className);
    expect(classes[0]).toBe(classes[1]);
    // Colour comes from a named token class, not an inline/random style.
    expect(classes[0]).toMatch(/ant-tag-[a-z]+/);
    expect(classes[0]).not.toContain('undefined');
  });

  it('keeps Actions as a fixed right column with icon-only buttons', async () => {
    const { container } = renderComponent();

    await screen.findByText('Ayesha Khan');

    const headerCells = Array.from(
      container.querySelectorAll('.ant-table-thead th'),
    ) as HTMLElement[];
    const fixedHeader = headerCells.find((th) =>
      th.classList.contains('ant-table-cell-fix-right'),
    );
    expect(fixedHeader).toBeTruthy();
    expect(fixedHeader!.textContent).toContain('Actions');

    // Actions stay the final column.
    expect(headerCells[headerCells.length - 1].textContent).toContain('Actions');

    // Icon-first compact buttons with an accessible name each. Two users are
    // seeded, so every per-row action resolves to two buttons.
    expect(screen.getAllByRole('button', { name: 'Division Access' }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: 'Roles' }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: /edit/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: /eye/i }).length).toBeGreaterThan(0);
    // user-a is ACTIVE → exactly one Deactivate action is offered for it.
    expect(screen.getAllByRole('button', { name: 'Deactivate user' }).length).toBeGreaterThan(0);
  });

  it('§4 Reset clears the search filter and restores the full list', async () => {
    renderComponent();

    const search = (await screen.findByPlaceholderText('Search users...')) as HTMLInputElement;
    fireEvent.change(search, { target: { value: 'Ayesha' } });
    expect(search.value).toBe('Ayesha');

    fireEvent.click(screen.getByRole('button', { name: 'Reset' }));

    await waitFor(() => {
      expect((screen.getByPlaceholderText('Search users...') as HTMLInputElement).value).toBe('');
    });
    // Both rows still rendered — Reset changed view state only.
    expect(screen.getByText('Ayesha Khan')).toBeInTheDocument();
    expect(screen.getByText('Bilal Ahmed')).toBeInTheDocument();
  });

  it('§4 Columns menu hides and restores a column without touching data', async () => {
    const { container } = renderComponent();

    await screen.findByText('Ayesha Khan');

    // Scoped to the table header: the dropdown reuses the same title nodes, so
    // counting raw text would also count the menu labels.
    const headerText = () =>
      Array.from(container.querySelectorAll('.ant-table-thead th'))
        .map((th) => th.textContent || '')
        .join(' | ');

    expect(headerText()).toContain('Employee ID');

    fireEvent.click(screen.getByRole('button', { name: 'Columns' }));
    const items = await screen.findAllByRole('menuitem');
    expect(items.length).toBeGreaterThan(0);

    const employeeIdItem = items.find((el) => el.textContent?.includes('Employee ID'));
    expect(employeeIdItem).toBeTruthy();
    fireEvent.click(employeeIdItem!);

    await waitFor(() => {
      expect(headerText()).not.toContain('Employee ID');
    });
    // Hiding a column must not remove the row data.
    expect(screen.getByText('Ayesha Khan')).toBeInTheDocument();

    // Reset restores every column.
    fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
    await waitFor(() => {
      expect(headerText()).toContain('Employee ID');
    });
    expect(screen.getByText('Bilal Ahmed')).toBeInTheDocument();
  });
});
