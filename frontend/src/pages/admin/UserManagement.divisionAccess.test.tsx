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
 * Prompt #16A — these are the REAL ids returned by the live API
 * (`GET /divisions`, `GET /companies`), so the payload assertions below are
 * anchored to production data rather than invented fixtures.
 *
 *   DIV-CCD  id = d1000000-0000-0000-0000-000000000002
 *   DIV-SPD  id = d1000000-0000-0000-0000-000000000001
 *   COMP-001 id = 7725aa04-a270-4314-9e82-90949cbe7791
 */
const D_CCD = 'd1000000-0000-0000-0000-000000000002';
const D_SPD = 'd1000000-0000-0000-0000-000000000001';
const COMPANY_ID = '7725aa04-a270-4314-9e82-90949cbe7791';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const baseUser = {
  id: 'user-junaid',
  authUserId: 'auth-junaid',
  displayName: 'junaid',
  email: 'pwijunaid@gmail.com',
  status: 'ACTIVE',
  defaultCompanyId: COMPANY_ID,
  userRoles: [
    { id: 'ur-1', roleId: 'role-prod', role: { id: 'role-prod', roleCode: 'PRODUCTION', name: 'Production' } },
  ],
  createdAt: '2026-09-10T10:00:00Z',
  lastLoginAt: '2026-09-12T10:00:00Z',
};

const mockRoles = [{ id: 'role-prod', roleCode: 'PRODUCTION', name: 'Production' }];

const mockCompanies = [
  {
    id: COMPANY_ID,
    companyCode: 'COMP-001',
    tradeName: 'Pakistan Wire Industries',
    legalName: 'Pakistan Wire Industries (Pvt) Ltd',
  },
];

/** The auto-provisioned row every account starts with (`scope_level = 'COMPANY'`). */
const companyWideScope = {
  id: 'scope-1',
  companyId: COMPANY_ID,
  divisionId: null,
  scopeLevel: 'COMPANY',
  isFullScope: true,
  status: 'ACTIVE',
  company: { id: COMPANY_ID, legalName: 'Pakistan Wire Industries (Pvt) Ltd' },
  division: null,
};

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

function seedUsers(users: any[]) {
  apiMock.get.mockImplementation((url: string) => {
    if (url === '/auth/me') return Promise.resolve({ data: currentUser } as any);
    if (url === '/admin/users') return Promise.resolve({ data: users, total: users.length } as any);
    if (url.startsWith('/admin/users/')) return Promise.resolve({ data: users[0] } as any);
    if (url === '/admin/roles') return Promise.resolve({ data: mockRoles, total: mockRoles.length } as any);
    if (url === '/companies') return Promise.resolve({ data: mockCompanies } as any);
    if (url === '/divisions') return Promise.resolve({ data: mockDivisions } as any);
    return Promise.resolve({ data: [] } as any);
  });
}

describe('UserManagement — Division Access (Prompt #16 §25/§26)', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('erp_user', JSON.stringify(currentUser));
    localStorage.setItem('erp_permissions_ts', Date.now().toString());
    useUserStore.getState().setUser(currentUser);
    apiMock.get.mockReset();
    apiMock.post.mockReset();
    apiMock.patch.mockReset();
    apiMock.delete.mockReset();
    seedUsers([{ ...baseUser }]);
  });

  it('renders Divisions column with company-wide access showing All Divisions', async () => {
    seedUsers([{ ...baseUser, organizationScopes: [companyWideScope] }]);

    renderComponent();

    await screen.findByText('junaid');
    expect(screen.getByText('All Divisions')).toBeInTheDocument();
  });

  it('only offers Division Access when the caller holds admin.users.manage_scope', async () => {
    localStorage.setItem(
      'erp_user',
      JSON.stringify({ ...currentUser, permissions: ['admin.users.view'] }),
    );

    renderComponent();
    expect(await screen.findByText('junaid')).toBeInTheDocument();
    expect(screen.queryByTestId('user-division-access')).not.toBeInTheDocument();
  });

  it('opens a modal that explains the intersection rule and shows no-restriction state', async () => {
    renderComponent();

    fireEvent.click(await screen.findByTestId('user-division-access'));

    expect(await screen.findByText(/Division Access — junaid/)).toBeInTheDocument();
    // §26 — the user must be able to tell the two scopes apart.
    expect(screen.getByText(/intersection/)).toBeInTheDocument();
    expect(
      screen.getByText(/this user currently has full company access/i),
    ).toBeInTheDocument();
    expect(screen.getByText('Grant Division Access')).toBeInTheDocument();
  });

  /**
   * Prompt #16A — the bug being guarded against: the dropdown *displays*
   * `DIV-SPD · Spoke Division` but the value it submits must be
   * `divisions.id`, never `division_code`.
   */
  async function selectDivisionFromOpenModal(label: string) {
    // Company is pre-seeded from the user's default company (UUID).
    // Only open the company picker when it is actually empty.
    const companyPlaceholder = screen.queryByText('Select company');
    if (companyPlaceholder) {
      fireEvent.mouseDown(companyPlaceholder);
      fireEvent.click(await screen.findByText('Pakistan Wire Industries'));
    }

    // Division picker — driven by GET /divisions (already server-scoped).
    fireEvent.mouseDown(await screen.findByText('Select division'));
    // The visible option is `CODE · Name`; the stored value is `id`.
    fireEvent.click(await screen.findByText(label));

    fireEvent.click(screen.getByRole('button', { name: /Grant Division Access/i }));

    await waitFor(() => expect(apiMock.post).toHaveBeenCalledTimes(1));
    const [url, payload] = apiMock.post.mock.calls[0];
    return { url, payload };
  }

  it('Test 1 — grants DIV-CCD using the division UUID (not the code)', async () => {
    renderComponent();

    fireEvent.click(await screen.findByTestId('user-division-access'));
    await screen.findByText(/Division Access — junaid/);

    const { url, payload } = await selectDivisionFromOpenModal('DIV-CCD · Control Cable Division');

    expect(url).toBe('/admin/users/user-junaid/org-scopes');
    expect(payload).toEqual({
      companyId: COMPANY_ID,
      divisionId: D_CCD,
      scopeLevel: 'DIVISION',
      isFullScope: false,
    });
    // Regression guard for `divisionId must be a UUID`.
    expect(payload.divisionId).toMatch(UUID_RE);
    expect(payload.divisionId).not.toBe('DIV-CCD');
    expect(payload.companyId).toMatch(UUID_RE);
    expect(payload.companyId).not.toBe('COMP-001');
  });

  it('Test 2 — grants DIV-SPD using the division UUID (not the code)', async () => {
    renderComponent();

    fireEvent.click(await screen.findByTestId('user-division-access'));
    await screen.findByText(/Division Access — junaid/);

    const { payload } = await selectDivisionFromOpenModal('DIV-SPD · Spoke Division');

    expect(payload).toEqual({
      companyId: COMPANY_ID,
      divisionId: D_SPD,
      scopeLevel: 'DIVISION',
      isFullScope: false,
    });
    expect(payload.divisionId).toMatch(UUID_RE);
    expect(payload.divisionId).not.toBe('DIV-SPD');
  });

  /**
   * Prompt #16B §6 — the live DB audit showed that 12 of 12
   * `user_organization_scopes` rows are the auto-provisioned COMPANY-wide one.
   * That row is the *absence* of a restriction, so the section must render the
   * required "No division restriction …" state for it instead of a labelled
   * tag carrying a Remove button (which offered a one-click revoke of full
   * access from a screen called "Division Access", and which made the Edit
   * form claim "1 division scope configured" for an unrestricted user).
   */
  it('treats the auto-provisioned company-wide row as "no restriction", not as a removable tag', async () => {
    seedUsers([{ ...baseUser, organizationScopes: [companyWideScope] }]);

    renderComponent();

    fireEvent.click(await screen.findByTestId('user-division-access'));
    await screen.findByText(/Division Access — junaid/);

    expect(
      await screen.findByText('No division restriction — this user currently has full company access'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Full company access/)).not.toBeInTheDocument();
    expect(await screen.findByText('No division restriction — this user currently has full company access')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Remove division access' })).not.toBeInTheDocument();
    expect(screen.getByText('Grant Division Access')).toBeInTheDocument();

    // Read-only so far — the COMPANY row is neither deleted nor re-posted.
    expect(apiMock.delete).not.toHaveBeenCalled();
    expect(apiMock.post).not.toHaveBeenCalled();

    // ...and a real division can still be granted on top of it (UUID payload).
    const { url, payload } = await selectDivisionFromOpenModal('DIV-CCD · Control Cable Division');
    expect(url).toBe('/admin/users/user-junaid/org-scopes');
    expect(payload.divisionId).toBe(D_CCD);
    expect(payload.scopeLevel).toBe('DIVISION');
  });
});
