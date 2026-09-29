import React from 'react';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import { App } from 'antd';

import UserManagement from './UserManagement';
import apiService from '../../services/api';
import { useUserStore } from '../../store/userStore';

jest.mock('../../services/api');

const apiMock = apiService as jest.Mocked<typeof apiService>;

/**
 * PROMPT #26 — the Division Access popup had no real save/update workflow.
 *
 * It could only append ONE row (`POST /org-scopes`) or delete one row
 * (`DELETE /org-scopes/:id`). Neither could express a desired SET, and neither
 * removed the auto-provisioned company-wide row, so:
 *
 *   • the popup displayed "DIV-CCD only" while the API served every division,
 *   • two admins editing the same user interleaved writes and produced
 *     contradictory rows,
 *   • revoking the last division left the account in a state the next read
 *     silently "healed" back to full access.
 *
 * These tests pin the replacement: `PUT /admin/users/:id/division-access`
 * reconciles the exact set in one call, the modal shows the server's own
 * effective access (never a client-derived guess), and the contradiction is
 * surfaced loudly instead of being hidden.
 */

const D_CCD = 'd1000000-0000-0000-0000-000000000002';
const D_SPD = 'd1000000-0000-0000-0000-000000000001';
const COMPANY_ID = '7725aa04-a270-4314-9e82-90949cbe7791';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const baseUser = {
  id: 'user-anus',
  authUserId: 'auth-anus',
  displayName: 'Anus',
  email: 'Anasccd71@gmail.com',
  status: 'ACTIVE',
  defaultCompanyId: COMPANY_ID,
  userRoles: [{ id: 'ur-1', roleId: 'role-prod', role: { id: 'role-prod', roleCode: 'PRODUCTION', name: 'Production' } }],
  createdAt: '2026-09-10T10:00:00Z',
  lastLoginAt: '2026-09-12T10:00:00Z',
};

const companyWideScope = {
  id: 'facbee53-ff02-49f2-bf01-9ba51dec1055',
  companyId: COMPANY_ID,
  divisionId: null,
  scopeLevel: 'COMPANY',
  isFullScope: true,
  status: 'ACTIVE',
  company: { id: COMPANY_ID, legalName: 'Pakistan Wire Industries (Pvt) Ltd' },
  division: null,
};

const ccdScope = {
  id: '14df543b-d5e3-4867-bb69-d50dfec7a621',
  companyId: COMPANY_ID,
  divisionId: D_CCD,
  scopeLevel: 'DIVISION',
  isFullScope: false,
  status: 'ACTIVE',
  company: { id: COMPANY_ID, legalName: 'Pakistan Wire Industries (Pvt) Ltd' },
  division: { id: D_CCD, divisionCode: 'DIV-CCD', name: 'Control Cable Division' },
};

const mockRoles = [{ id: 'role-prod', roleCode: 'PRODUCTION', name: 'Production' }];
const mockCompanies = [
  { id: COMPANY_ID, companyCode: 'COMP-001', tradeName: 'Pakistan Wire Industries', legalName: 'Pakistan Wire Industries (Pvt) Ltd' },
];
const mockDivisions = [
  { id: D_CCD, divisionCode: 'DIV-CCD', name: 'Control Cable Division', status: 'ACTIVE' },
  { id: D_SPD, divisionCode: 'DIV-SPD', name: 'Spoke Division', status: 'ACTIVE' },
];

const currentUser = {
  id: 'admin-1',
  displayName: 'Muhammad Afsar',
  email: 'afsar@pwi.test',
  permissions: ['admin.users.view', 'admin.users.update', 'admin.users.manage_scope'],
};

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

interface SeedOptions {
  /** Scope rows the user endpoint returns (the raw `user_organization_scopes`). */
  scopes?: any[];
  /** What `GET /admin/users/:id/division-access` reports. */
  effective?: { unrestricted: boolean; divisionIds: string[] };
}

function seedUsers({ scopes = [], effective }: SeedOptions = {}) {
  apiMock.get.mockImplementation((url: string) => {
    if (url === '/auth/me') return Promise.resolve({ data: currentUser } as any);
    if (url === '/admin/users') return Promise.resolve({ data: [{ ...baseUser }], total: 1 } as any);
    if (url.endsWith('/division-access')) {
      return Promise.resolve({
        data: {
          effective: {
            unrestricted: effective?.unrestricted ?? true,
            divisionIds: effective?.divisionIds ?? [],
            accessibleDivisions: mockDivisions,
          },
        },
      } as any);
    }
    if (url.startsWith('/admin/users/')) {
      return Promise.resolve({ data: { ...baseUser, organizationScopes: scopes } } as any);
    }
    if (url === '/admin/roles') return Promise.resolve({ data: mockRoles, total: mockRoles.length } as any);
    if (url === '/companies') return Promise.resolve({ data: mockCompanies } as any);
    if (url === '/divisions') return Promise.resolve({ data: mockDivisions } as any);
    return Promise.resolve({ data: [] } as any);
  });
  apiMock.put.mockResolvedValue({ data: { success: true } } as any);
}

async function openModal() {
  fireEvent.click(await screen.findByTestId('user-division-access'));
  await screen.findByText(/Division Access — Anus/);
}

describe('UserManagement — Division Access save workflow (PROMPT #26)', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('erp_user', JSON.stringify(currentUser));
    localStorage.setItem('erp_permissions_ts', Date.now().toString());
    useUserStore.getState().setUser(currentUser);
    apiMock.get.mockReset();
    apiMock.post.mockReset();
    apiMock.patch.mockReset();
    apiMock.put.mockReset();
    apiMock.delete.mockReset();
  });

  it('loads the server-authoritative effective access instead of deriving it on the client', async () => {
    seedUsers({ scopes: [ccdScope], effective: { unrestricted: false, divisionIds: [D_CCD] } });

    renderComponent();
    await openModal();

    await waitFor(() => expect(apiMock.get).toHaveBeenCalledWith(`/admin/users/${baseUser.id}/division-access`));
    expect(await screen.findByTestId('division-access-effective')).toBeInTheDocument();
    expect(await screen.findByTestId('division-access-effective-item')).toHaveTextContent('DIV-CCD');
    // The server said restricted, so the client must not claim unrestricted.
    expect(screen.queryByTestId('division-access-effective-unrestricted')).not.toBeInTheDocument();
  });

  it('reports an unrestricted account honestly when the server says so', async () => {
    seedUsers({ scopes: [companyWideScope], effective: { unrestricted: true, divisionIds: [] } });

    renderComponent();
    await openModal();

    expect(await screen.findByTestId('division-access-effective-unrestricted')).toHaveTextContent(
      /Unrestricted — every active division/,
    );
  });

  it('reports a deliberately denied account instead of claiming full access', async () => {
    seedUsers({ scopes: [], effective: { unrestricted: false, divisionIds: [] } });

    renderComponent();
    await openModal();

    expect(await screen.findByTestId('division-access-effective-none')).toBeInTheDocument();
    // The "no division restriction ⇒ full access" wording would be a lie here.
    expect(screen.queryByText(/this user currently has full company access/i)).not.toBeInTheDocument();

    // The Save form must be seeded from the SERVER answer, not from the empty
    // row list. Seeding `companyWide` from the row count is exactly the
    // "no rows ⇒ no restriction" reading that caused the original incident, and
    // re-saving this account would have handed it every division.
    fireEvent.click(screen.getByTestId('division-access-save'));
    await waitFor(() => expect(apiMock.put).toHaveBeenCalledTimes(1));
    expect(apiMock.put.mock.calls[0][1]).toEqual({
      companyId: COMPANY_ID,
      divisionIds: [],
      companyWide: false,
    });
  });

  it('surfaces the contradictory company-wide + division rows instead of hiding them', async () => {
    seedUsers({
      scopes: [companyWideScope, ccdScope],
      effective: { unrestricted: false, divisionIds: [D_CCD] },
    });

    renderComponent();
    await openModal();

    expect(await screen.findByTestId('division-access-conflict')).toBeInTheDocument();
    expect(screen.getByTestId('division-access-conflict')).toHaveTextContent(/Conflicting scope rows/);
  });

  it('does NOT claim a conflict when only the company-wide default exists', async () => {
    seedUsers({ scopes: [companyWideScope], effective: { unrestricted: true, divisionIds: [] } });

    renderComponent();
    await openModal();

    await screen.findByTestId('division-access-effective-unrestricted');
    expect(screen.queryByTestId('division-access-conflict')).not.toBeInTheDocument();
  });

  it('does NOT claim a conflict for a section-only / non-division account', async () => {
    const sectionScope = {
      id: 'section-row',
      companyId: COMPANY_ID,
      divisionId: null,
      sectionId: 'section-1',
      scopeLevel: 'SECTION',
      isFullScope: false,
      status: 'ACTIVE',
      company: { id: COMPANY_ID, legalName: 'Pakistan Wire Industries (Pvt) Ltd' },
      division: null,
    };
    seedUsers({ scopes: [sectionScope], effective: { unrestricted: true, divisionIds: [] } });

    renderComponent();
    await openModal();

    await screen.findByTestId('division-access-effective-unrestricted');
    expect(screen.queryByTestId('division-access-conflict')).not.toBeInTheDocument();
  });

  it('saves the exact desired division set through one transactional PUT', async () => {
    seedUsers({ scopes: [companyWideScope, ccdScope], effective: { unrestricted: false, divisionIds: [D_CCD] } });

    renderComponent();
    await openModal();
    await screen.findByTestId('division-access-save');

    // The form is SEEDED from the server rows, so the picker already shows
    // DIV-CCD. Open it by role rather than by placeholder (the placeholder is
    // only rendered while the value is empty) and add DIV-SPD.
    // The save form has two comboboxes — company first, divisions second — and
    // the "Unrestricted" control is a switch, not a combobox.
    const saveForm = screen.getByTestId('division-access-save-form');
    const comboboxes = within(saveForm).getAllByRole('combobox');
    expect(comboboxes).toHaveLength(2);
    fireEvent.mouseDown(comboboxes[1]);
    fireEvent.click(await screen.findByText('DIV-SPD · Spoke Division'));
    fireEvent.click(screen.getByTestId('division-access-save'));

    await waitFor(() => expect(apiMock.put).toHaveBeenCalledTimes(1));
    const [url, payload] = apiMock.put.mock.calls[0];
    expect(url).toBe(`/admin/users/${baseUser.id}/division-access`);
    expect(payload).toEqual({
      companyId: COMPANY_ID,
      divisionIds: [D_CCD, D_SPD],
      companyWide: false,
    });
    // Values are UUIDs, never codes.
    for (const id of payload.divisionIds as string[]) expect(id).toMatch(UUID_RE);
    expect(payload.companyId).toMatch(UUID_RE);
  });

  it('seeds the desired set from the server rows, so Save cannot silently wipe it', async () => {
    // Regression guard for the async-load race: `GET /admin/users/:id` resolves
    // AFTER the modal opens. Seeding only on open produced an empty set, and
    // "Save Changes" would then have revoked every division the user had.
    seedUsers({ scopes: [ccdScope], effective: { unrestricted: false, divisionIds: [D_CCD] } });

    renderComponent();
    await openModal();
    await screen.findByTestId('division-access-save');

    fireEvent.click(screen.getByTestId('division-access-save'));

    await waitFor(() => expect(apiMock.put).toHaveBeenCalledTimes(1));
    expect(apiMock.put.mock.calls[0][1]).toEqual({
      companyId: COMPANY_ID,
      divisionIds: [D_CCD],
      companyWide: false,
    });
  });

  it('sends companyWide=true and clears the division list when unrestricted is switched on', async () => {
    seedUsers({ scopes: [ccdScope], effective: { unrestricted: false, divisionIds: [D_CCD] } });

    renderComponent();
    await openModal();
    await screen.findByTestId('division-access-save');

    fireEvent.click(screen.getByTestId('division-access-company-wide'));
    fireEvent.click(screen.getByTestId('division-access-save'));

    await waitFor(() => expect(apiMock.put).toHaveBeenCalledTimes(1));
    const [, payload] = apiMock.put.mock.calls[0];
    expect(payload.companyWide).toBe(true);
    expect(payload.divisionIds).toEqual([]);
  });

  it('sends an explicit empty set (deny all) when the last division is revoked', async () => {
    // Stateful mock: the server's row list actually shrinks on DELETE, exactly
    // like the real endpoint, so the subsequent Save carries the truth.
    let rows: any[] = [{ ...ccdScope }];
    apiMock.get.mockImplementation((url: string) => {
      if (url === '/auth/me') return Promise.resolve({ data: currentUser } as any);
      if (url === '/admin/users') return Promise.resolve({ data: [{ ...baseUser }], total: 1 } as any);
      if (url.endsWith('/division-access')) {
        return Promise.resolve({
          data: {
            effective: {
              unrestricted: false,
              divisionIds: rows.filter(r => r.divisionId).map(r => r.divisionId),
              accessibleDivisions: mockDivisions,
            },
          },
        } as any);
      }
      if (url.startsWith('/admin/users/')) {
        return Promise.resolve({ data: { ...baseUser, organizationScopes: rows } } as any);
      }
      if (url === '/admin/roles') return Promise.resolve({ data: mockRoles, total: 1 } as any);
      if (url === '/companies') return Promise.resolve({ data: mockCompanies } as any);
      if (url === '/divisions') return Promise.resolve({ data: mockDivisions } as any);
      return Promise.resolve({ data: [] } as any);
    });
    apiMock.delete.mockImplementation(async () => {
      rows = [];
      return { data: { success: true } } as any;
    });

    renderComponent();
    await openModal();
    await screen.findByTestId('division-access-save');

    // Revoke the last division with the pre-existing per-row control.
    fireEvent.click(screen.getByRole('button', { name: 'Remove division access' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Remove' }));
    await waitFor(() => expect(apiMock.delete).toHaveBeenCalledTimes(1));

    // Wait for the post-revoke re-read to land: the Save button is disabled
    // while it refreshes, and the server now reports an explicit deny.
    expect(await screen.findByTestId('division-access-effective-none')).toBeInTheDocument();

    // Then persist the (now empty) desired set explicitly, so the deny is
    // durable instead of being re-healed back to full access.
    await waitFor(() => expect(screen.getByTestId('division-access-save')).not.toBeDisabled());
    fireEvent.click(screen.getByTestId('division-access-save'));
    await waitFor(() => expect(apiMock.put).toHaveBeenCalledTimes(1));
    // `companyWide: false` is the whole point: the naive "no rows ⇒ no
    // restriction" reading would have persisted a grant of EVERY division.
    expect(apiMock.put.mock.calls[0][1]).toEqual({
      companyId: COMPANY_ID,
      divisionIds: [],
      companyWide: false,
    });
  });

  it('keeps the pre-existing quick-grant endpoint working alongside the new save', async () => {
    seedUsers({ scopes: [companyWideScope], effective: { unrestricted: true, divisionIds: [] } });

    renderComponent();
    await openModal();

    fireEvent.mouseDown(await screen.findByText('Select division'));
    fireEvent.click(await screen.findByText('DIV-CCD · Control Cable Division'));
    fireEvent.click(screen.getByRole('button', { name: /Grant Division Access/i }));

    await waitFor(() => expect(apiMock.post).toHaveBeenCalledTimes(1));
    const [url, payload] = apiMock.post.mock.calls[0];
    expect(url).toBe(`/admin/users/${baseUser.id}/org-scopes`);
    expect(payload).toEqual({
      companyId: COMPANY_ID,
      divisionId: D_CCD,
      scopeLevel: 'DIVISION',
      isFullScope: false,
    });
    // Backward compatibility: the one-off append must not be silently replaced.
    expect(apiMock.put).not.toHaveBeenCalled();
  });

  it('re-reads the effective access after a save so the popup matches the API', async () => {
    // The server keeps contradicting itself on purpose: the PUT is what removes
    // the company-wide row, and the re-read must show that it is gone.
    let rows: any[] = [{ ...companyWideScope }, { ...ccdScope }];
    let effective: SeedOptions['effective'] = { unrestricted: false, divisionIds: [D_CCD] };
    apiMock.get.mockImplementation((url: string) => {
      if (url.endsWith('/division-access')) {
        return Promise.resolve({
          data: { effective: { ...effective, accessibleDivisions: mockDivisions } },
        } as any);
      }
      if (url === '/auth/me') return Promise.resolve({ data: currentUser } as any);
      if (url === '/admin/users') return Promise.resolve({ data: [{ ...baseUser }], total: 1 } as any);
      if (url.startsWith('/admin/users/')) {
        return Promise.resolve({ data: { ...baseUser, organizationScopes: rows } } as any);
      }
      if (url === '/admin/roles') return Promise.resolve({ data: mockRoles, total: 1 } as any);
      if (url === '/companies') return Promise.resolve({ data: mockCompanies } as any);
      if (url === '/divisions') return Promise.resolve({ data: mockDivisions } as any);
      return Promise.resolve({ data: [] } as any);
    });
    apiMock.put.mockImplementation(async () => {
      rows = [{ ...companyWideScope }];
      effective = { unrestricted: true, divisionIds: [] };
      return { data: { success: true } } as any;
    });

    renderComponent();
    await openModal();
    await screen.findByTestId('division-access-effective-item');
    expect(screen.getByTestId('division-access-conflict')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('division-access-company-wide'));
    fireEvent.click(screen.getByTestId('division-access-save'));

    expect(await screen.findByTestId('division-access-effective-unrestricted')).toBeInTheDocument();
  });

  it('surfaces a failed save without pretending it persisted', async () => {
    seedUsers({ scopes: [ccdScope], effective: { unrestricted: false, divisionIds: [D_CCD] } });
    apiMock.put.mockRejectedValue(
      Object.assign(new Error('boom'), { response: { status: 503, data: {} } }),
    );

    renderComponent();
    await openModal();
    await screen.findByTestId('division-access-save');

    fireEvent.click(screen.getByTestId('division-access-save'));

    expect(await screen.findByText(/Failed to save division access/i)).toBeInTheDocument();
    // The previous, server-reported state is left on screen rather than
    // optimistically rewritten to what the admin clicked.
    expect(screen.getByTestId('division-access-effective-item')).toBeInTheDocument();
  });
});
