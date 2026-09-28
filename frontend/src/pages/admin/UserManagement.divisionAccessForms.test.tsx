import React from 'react';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import { App } from 'antd';
import UserManagement from './UserManagement';
import apiService from '../../services/api';
import { useUserStore } from '../../store/userStore';
import { useHeaderActions } from '../../components/layout/headerActionsStore';
import { isDivisionRestriction, formatDivisionLabel } from '../../components/shared/DivisionAccessModal';

jest.mock('../../services/api');

const apiMock = apiService as jest.Mocked<typeof apiService>;

// Each case drives several real (mocked) API round-trips plus antd motion.
jest.setTimeout(30000);

/**
 * Prompt #16B — the same Division Access workflow must work from all three
 * entry points (Actions → Divisions, Add User, Edit User) against ONE
 * implementation and the existing organization-scope API.
 *
 * REAL ids from the live API (`GET /divisions`, `GET /companies`):
 *   DIV-CCD  id = d1000000-0000-0000-0000-000000000002
 *   DIV-SPD  id = d1000000-0000-0000-0000-000000000001
 *   COMP-001 id = 7725aa04-a270-4314-9e82-90949cbe7791
 */
const D_CCD = 'd1000000-0000-0000-0000-000000000002';
const D_SPD = 'd1000000-0000-0000-0000-000000000001';
const COMPANY_ID = '7725aa04-a270-4314-9e82-90949cbe7791';
const NEW_USER_ID = '3a7f9c15-6d02-4f8b-9a4e-5c1e2b7d90f4';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
  ],
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
const mockDivisions = [
  { id: D_CCD, divisionCode: 'DIV-CCD', name: 'Control Cable Division', status: 'ACTIVE' },
  { id: D_SPD, divisionCode: 'DIV-SPD', name: 'Spoke Division', status: 'ACTIVE' },
];

const listUser = {
  id: 'user-anas',
  authUserId: 'auth-anas',
  displayName: 'Anas Test',
  email: 'anas@pwi.test',
  status: 'ACTIVE',
  defaultCompanyId: COMPANY_ID,
  defaultCompany: { tradeName: 'Pakistan Wire Industries' },
  userRoles: [
    { id: 'ur-1', roleId: 'role-prod', role: { id: 'role-prod', roleCode: 'PRODUCTION', name: 'Production' } },
  ],
  createdAt: '2026-09-10T10:00:00Z',
};

function divisionScope(scopeId: string, divisionId: string) {
  const division =
    divisionId === D_CCD
      ? { id: D_CCD, divisionCode: 'DIV-CCD', name: 'Control Cable Division' }
      : { id: D_SPD, divisionCode: 'DIV-SPD', name: 'Spoke Division' };
  return {
    id: scopeId,
    companyId: COMPANY_ID,
    divisionId,
    scopeLevel: 'DIVISION',
    isFullScope: false,
    status: 'ACTIVE',
    company: { id: COMPANY_ID, legalName: 'Pakistan Wire Industries (Pvt) Ltd' },
    division,
  };
}

/**
 * The row every account is provisioned with (`scope_level = 'COMPANY'`).
 * It is the *absence* of a restriction, not one — see `isDivisionRestriction`.
 */
function companyScope() {
  return {
    id: 'scope-company',
    companyId: COMPANY_ID,
    divisionId: null,
    scopeLevel: 'COMPANY',
    isFullScope: true,
    status: 'ACTIVE',
    company: { id: COMPANY_ID, legalName: 'Pakistan Wire Industries (Pvt) Ltd' },
    division: null,
  };
}

/**
 * `user_organization_scopes` stand-in — the single source of truth every
 * entry point reads from and writes to, exactly like the real API.
 */
let scopesByUser: Record<string, any[]> = {};
let grantCalls: Array<{ url: string; body: any }> = [];
let deleteCalls: string[] = [];
let createdPayloads: any[] = [];
let rejectNextGrant: { status: number; message: string } | null = null;

function seedScopes(initial: Record<string, any[]>) {
  scopesByUser = JSON.parse(JSON.stringify(initial));
  grantCalls = [];
  deleteCalls = [];
  createdPayloads = [];
  rejectNextGrant = null;
}

function seedApi() {
  apiMock.get.mockImplementation((url: string) => {
    if (url === '/auth/me') return Promise.resolve({ data: currentUser } as any);
    if (url === '/admin/users') return Promise.resolve({ data: [listUser], total: 1 } as any);
    if (url.startsWith('/admin/users/')) {
      const id = url.split('/')[3];
      const record = id === listUser.id ? listUser : { id, displayName: 'Division Access Test User' };
      return Promise.resolve({
        data: { ...record, organizationScopes: scopesByUser[id] || [] },
      } as any);
    }
    if (url === '/admin/roles') return Promise.resolve({ data: mockRoles, total: 1 } as any);
    if (url === '/companies') return Promise.resolve({ data: mockCompanies } as any);
    if (url === '/divisions') return Promise.resolve({ data: mockDivisions } as any);
    return Promise.resolve({ data: [] } as any);
  });

  apiMock.post.mockImplementation((url: string, body: any) => {
    if (url === '/admin/users/create-full') {
      createdPayloads.push(body);
      scopesByUser[NEW_USER_ID] = scopesByUser[NEW_USER_ID] || [];
      return Promise.resolve({
        success: true,
        data: { id: NEW_USER_ID, displayName: body.displayName, email: body.email, defaultCompanyId: body.companyId },
        message: 'User created successfully',
      } as any);
    }
    const grant = url.match(/^\/admin\/users\/([^/]+)\/org-scopes$/);
    if (grant) {
      const userId = grant[1];
      if (rejectNextGrant) {
        const failure = rejectNextGrant;
        rejectNextGrant = null;
        return Promise.reject({ response: { status: failure.status, data: { message: failure.message } } });
      }
      // Backend duplicate protection: identical scope ⇒ 409.
      const existing = (scopesByUser[userId] || []).find(
        s => s.companyId === body.companyId && (s.divisionId ?? null) === (body.divisionId ?? null),
      );
      if (existing) {
        return Promise.reject({
          response: { status: 409, data: { message: 'This organizational scope already assigned to user' } },
        });
      }
      const scope = {
        ...divisionScope(`scope-${(scopesByUser[userId] || []).length + 1}`, body.divisionId),
        companyId: body.companyId,
        divisionId: body.divisionId,
        scopeLevel: body.scopeLevel,
        isFullScope: body.isFullScope,
      };
      scopesByUser[userId] = [...(scopesByUser[userId] || []), scope];
      grantCalls.push({ url, body });
      return Promise.resolve({ success: true, data: scope } as any);
    }
    return Promise.resolve({ success: true, data: {} } as any);
  });

  apiMock.delete.mockImplementation((url: string) => {
    const revoke = url.match(/^\/admin\/users\/([^/]+)\/org-scopes\/([^/]+)$/);
    if (revoke) {
      const [, userId, scopeId] = revoke;
      scopesByUser[userId] = (scopesByUser[userId] || []).filter(s => s.id !== scopeId);
      deleteCalls.push(url);
      return Promise.resolve({ success: true } as any);
    }
    return Promise.resolve({ success: true } as any);
  });

  apiMock.patch.mockResolvedValue({ success: true, data: listUser } as any);
}

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

/**
 * `PageHeader` renders null and only registers the action toolbar into the
 * shared header store — MainLayout is what paints it. Mirror that here so the
 * real "Add User" button (same node, same `openCreateModal` closure) is
 * clickable, instead of re-creating a fake trigger.
 */
async function clickAddUser() {
  await waitFor(() => expect(useHeaderActions.getState().extra).toBeTruthy());
  render(
    <MemoryRouter>
      <App>{useHeaderActions.getState().extra as React.ReactElement}</App>
    </MemoryRouter>,
  );
  fireEvent.click(await screen.findByText('Add User'));
}

/**
 * Tag queries are scoped to `.ant-tag`: the division *picker* renders the very
 * same `CODE · Name` label (as an always-present, sometimes hidden option), so
 * a document-wide query would be ambiguous between the option and the tag.
 */
const findTag = (label: string) => screen.findByText(label, { selector: '.ant-tag' });
const getTag = (label: string) => screen.getByText(label, { selector: '.ant-tag' });
const queryTag = (label: string) => screen.queryByText(label, { selector: '.ant-tag' });
const findAllTags = (label: string) => screen.findAllByText(label, { selector: '.ant-tag' });

/** Closes the shared SaveResultDialog (scoped to its success panel). */
function closeSaveDialog() {
  const dialog = screen.getByTestId('save-result-success');
  fireEvent.click(within(dialog).getByRole('button', { name: /^Close$/ }));
}

/** Closes the Division Access modal through its own (uniquely labelled) footer. */
function closeDivisionModal() {
  fireEvent.click(screen.getByRole('button', { name: 'Close Division Access' }));
}

/** Picks `label` in the modal's division picker (display = `CODE · Name`, value = id). */
async function pickDivision(label: string) {
  fireEvent.mouseDown(await screen.findByText('Select division'));
  // Scoped to the option node: a granted division renders a tag carrying the
  // very same label, so a document-wide query would be ambiguous.
  fireEvent.click(await screen.findByText(label, { selector: '.ant-select-item-option-content' }));
}

async function grantDivision(label: string) {
  const before = grantCalls.length;
  await pickDivision(label);
  fireEvent.click(screen.getByRole('button', { name: /Grant Division Access/i }));
  await waitFor(() => expect(grantCalls.length).toBeGreaterThan(before));
}

/** Opens the create form and guarantees the company field is filled. */
async function openCreateFormAndFill() {
  await clickAddUser();
  if (screen.queryByText('Select company')) {
    fireEvent.mouseDown(screen.getByText('Select company'));
    fireEvent.click(await screen.findByText('Pakistan Wire Industries (COMP-001)'));
  }
  fireEvent.change(await screen.findByPlaceholderText('user@company.com'), {
    target: { value: 'division.access.test@pwi.test' },
  });
  fireEvent.change(screen.getByPlaceholderText('John Doe'), {
    target: { value: 'Division Access Test User' },
  });
  fireEvent.change(screen.getByPlaceholderText('Min 8 chars, upper+lower+number'), {
    target: { value: 'Testuser123!' },
  });
  fireEvent.change(screen.getByPlaceholderText('Re-enter password'), {
    target: { value: 'Testuser123!' },
  });
}

describe('Prompt #16B — Division Access from New User, Edit User and Actions', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('erp_user', JSON.stringify(currentUser));
    localStorage.setItem('erp_permissions_ts', Date.now().toString());
    useUserStore.getState().setUser(currentUser);
    useHeaderActions.setState({ extra: undefined });
    apiMock.get.mockReset();
    apiMock.post.mockReset();
    apiMock.patch.mockReset();
    apiMock.delete.mockReset();
    seedScopes({});
    seedApi();
  });

  it('1. Actions → Divisions still opens, loads both scopes and revokes one', async () => {
    seedScopes({ [listUser.id]: [divisionScope('scope-1', D_CCD), divisionScope('scope-2', D_SPD)] });
    seedApi();

    renderComponent();

    fireEvent.click(await screen.findByTestId('user-division-access'));
    expect(await screen.findByText(/Division Access — Anas Test/)).toBeInTheDocument();

    expect(await findTag('DIV-CCD · Control Cable Division')).toBeInTheDocument();
    expect(getTag('DIV-SPD · Spoke Division')).toBeInTheDocument();
    // §5/§19 — exactly ONE implementation renders the grant form.
    expect(screen.getAllByText('Grant Division Access')).toHaveLength(1);

    // Revoke SPD
    const removeButtons = screen.getAllByRole('button', { name: 'Remove division access' });
    fireEvent.click(removeButtons[1]);
    fireEvent.click(await screen.findByRole('button', { name: 'Remove' }));

    await waitFor(() =>
      expect(deleteCalls).toContain(`/admin/users/${listUser.id}/org-scopes/scope-2`),
    );
    await waitFor(() => expect(queryTag('DIV-SPD · Spoke Division')).not.toBeInTheDocument());
    expect(getTag('DIV-CCD · Control Cable Division')).toBeInTheDocument();
    expect(scopesByUser[listUser.id]).toHaveLength(1);
  });

  it('2. Edit User loads existing scopes, saves the profile, and changes survive reopening', async () => {
    seedScopes({ [listUser.id]: [divisionScope('scope-1', D_CCD), divisionScope('scope-2', D_SPD)] });
    seedApi();

    renderComponent();

    fireEvent.click(await screen.findByRole('button', { name: /edit/i }));
    expect(await screen.findByText(/Edit User — Anas Test/)).toBeInTheDocument();

    // §3 — current access is shown inside the Edit form itself.
    expect(await screen.findByTestId('edit-division-access')).toBeInTheDocument();
    expect(await findTag('DIV-CCD · Control Cable Division')).toBeInTheDocument();
    expect(getTag('DIV-SPD · Spoke Division')).toBeInTheDocument();
    expect(screen.getByText('2 division scopes configured')).toBeInTheDocument();

    // Open the shared modal from the Edit form (§4 — not a second implementation).
    fireEvent.click(screen.getByTestId('edit-division-access-configure'));
    expect(await screen.findByText(/Division Access — Anas Test/)).toBeInTheDocument();
    expect(screen.getAllByText('Grant Division Access')).toHaveLength(1);

    // Remove SPD (§14)
    fireEvent.click(screen.getAllByRole('button', { name: 'Remove division access' })[1]);
    fireEvent.click(await screen.findByRole('button', { name: 'Remove' }));
    await waitFor(() => expect(scopesByUser[listUser.id]).toHaveLength(1));
    // the Edit summary reflects the change immediately (same single state)
    expect(await screen.findByText('1 division scope configured')).toBeInTheDocument();
    expect(queryTag('DIV-SPD · Spoke Division')).not.toBeInTheDocument();

    // Close the modal, then save the basic profile (§9 Pattern A — unchanged save).
    closeDivisionModal();
    fireEvent.click(await screen.findByRole('button', { name: 'Save Changes' }));
    await waitFor(() => expect(apiMock.patch).toHaveBeenCalledWith('/admin/users/user-anas', expect.any(Object)));
    await screen.findByText('User Updated Successfully');
    closeSaveDialog();

    // Reopen Edit (§14) — CCD present, SPD gone.
    fireEvent.click(await screen.findByRole('button', { name: /edit/i }));
    expect(await findTag('DIV-CCD · Control Cable Division')).toBeInTheDocument();
    expect(queryTag('DIV-SPD · Spoke Division')).not.toBeInTheDocument();

    // Restore SPD from the same modal (§14) and grant it again.
    fireEvent.click(await screen.findByTestId('edit-division-access-configure'));
    await screen.findByText(/Division Access — Anas Test/);
    await grantDivision('DIV-SPD · Spoke Division');

    const restored = grantCalls[grantCalls.length - 1];
    expect(restored.url).toBe('/admin/users/user-anas/org-scopes');
    expect(restored.body).toEqual({
      companyId: COMPANY_ID,
      divisionId: D_SPD,
      scopeLevel: 'DIVISION',
      isFullScope: false,
    });
    expect(restored.body.divisionId).toMatch(UUID_RE);
    expect(restored.body.divisionId).not.toBe('DIV-SPD');
    await waitFor(() => expect(scopesByUser[listUser.id]).toHaveLength(2));
  });

  it('3. New User — creates the account first, then grants CCD + SPD with real UUIDs and revokes SPD', async () => {
    seedScopes({});
    seedApi();

    renderComponent();

    await openCreateFormAndFill();
    fireEvent.click(screen.getByRole('button', { name: 'Create User' }));

    // §2 — the account must exist BEFORE any org-scope row can be written.
    expect(await screen.findByTestId('create-division-access')).toBeInTheDocument();
    expect(createdPayloads).toHaveLength(1);
    expect(grantCalls).toHaveLength(0);

    // Success dialog → close it, then use the in-form Division Access section.
    await screen.findByText('User Created Successfully');
    closeSaveDialog();
    expect(await screen.findByText('User created successfully.')).toBeInTheDocument();
    expect(screen.getByText('No division restriction — this user currently has full company access')).toBeInTheDocument();

    // §6 — the button opens the SAME modal, addressed to the new user's id.
    fireEvent.click(screen.getByTestId('create-division-access-configure'));
    expect(await screen.findByText(/Division Access — Division Access Test User/)).toBeInTheDocument();

    await grantDivision('DIV-CCD · Control Cable Division');
    await grantDivision('DIV-SPD · Spoke Division');

    expect(grantCalls.map(g => g.url)).toEqual([
      `/admin/users/${NEW_USER_ID}/org-scopes`,
      `/admin/users/${NEW_USER_ID}/org-scopes`,
    ]);
    expect(grantCalls[0].body).toEqual({
      companyId: COMPANY_ID,
      divisionId: D_CCD,
      scopeLevel: 'DIVISION',
      isFullScope: false,
    });
    expect(grantCalls[1].body).toEqual({
      companyId: COMPANY_ID,
      divisionId: D_SPD,
      scopeLevel: 'DIVISION',
      isFullScope: false,
    });
    // §11 — the persisted id is the divisions.id UUID, never the division code.
    grantCalls.forEach(g => {
      expect(g.body.divisionId).toMatch(UUID_RE);
      expect([D_CCD, D_SPD]).toContain(g.body.divisionId);
      expect(g.body.divisionId).not.toMatch(/^DIV-/);
      expect(g.body.companyId).toMatch(UUID_RE);
    });
    expect(scopesByUser[NEW_USER_ID]).toHaveLength(2);

    // Both tags visible while the modal is open (the summary behind it shows
    // the very same single state, hence "findAll").
    expect((await findAllTags('DIV-CCD · Control Cable Division')).length).toBeGreaterThan(0);
    expect((await findAllTags('DIV-SPD · Spoke Division')).length).toBeGreaterThan(0);

    // Revoke SPD — only CCD remains (§15).
    fireEvent.click(screen.getAllByRole('button', { name: 'Remove division access' })[1]);
    fireEvent.click(await screen.findByRole('button', { name: 'Remove' }));
    await waitFor(() => expect(scopesByUser[NEW_USER_ID]).toHaveLength(1));
    expect(scopesByUser[NEW_USER_ID][0].divisionId).toBe(D_CCD);
    expect(scopesByUser[NEW_USER_ID][0].scopeLevel).toBe('DIVISION');
    expect(scopesByUser[NEW_USER_ID][0].isFullScope).toBe(false);
    expect(scopesByUser[NEW_USER_ID][0].status).toBe('ACTIVE');
    await waitFor(() => expect(queryTag('DIV-SPD · Spoke Division')).not.toBeInTheDocument());
  });

  it('4. New User — a failed scope save is reported, and retry never duplicates the user', async () => {
    seedScopes({});
    seedApi();

    renderComponent();

    await openCreateFormAndFill();
    fireEvent.click(screen.getByRole('button', { name: 'Create User' }));
    await screen.findByTestId('create-division-access');
    await screen.findByText('User Created Successfully');
    closeSaveDialog();

    // §16 — the account is created once; the create button is no longer armed.
    expect(createdPayloads).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Create User' })).toBeDisabled();

    rejectNextGrant = { status: 500, message: 'Internal server error' };
    fireEvent.click(screen.getByTestId('create-division-access-configure'));
    await screen.findByText(/Division Access — Division Access Test User/);
    // A rejected grant never lands in `grantCalls`.
    await pickDivision('DIV-CCD · Control Cable Division');
    fireEvent.click(screen.getByRole('button', { name: /Grant Division Access/i }));

    // §16 — NOT reported as an overall success.
    expect(await screen.findByText('User created, but Division Access could not be saved.')).toBeInTheDocument();
    expect(scopesByUser[NEW_USER_ID]).toHaveLength(0);
    expect(grantCalls).toHaveLength(0);
    expect(createdPayloads).toHaveLength(1);

    // Retry (same user, no second create-full) now succeeds — the picker kept
    // the selected division, so only Grant has to be pressed again.
    fireEvent.click(screen.getByRole('button', { name: /Grant Division Access/i }));
    await waitFor(() => expect(scopesByUser[NEW_USER_ID]).toHaveLength(1));
    expect(createdPayloads).toHaveLength(1);
    expect(screen.getByText('User created successfully.')).toBeInTheDocument();
  });

  it('5. Duplicate scope protection stays active — the same division is stored once', async () => {
    seedScopes({});
    seedApi();

    renderComponent();

    await openCreateFormAndFill();
    fireEvent.click(screen.getByRole('button', { name: 'Create User' }));
    await screen.findByTestId('create-division-access');
    await screen.findByText('User Created Successfully');
    closeSaveDialog();
    fireEvent.click(await screen.findByTestId('create-division-access-configure'));
    await screen.findByText(/Division Access — Division Access Test User/);

    await grantDivision('DIV-CCD · Control Cable Division');
    expect(scopesByUser[NEW_USER_ID]).toHaveLength(1);

    // Selecting CCD again hits the existing unique/409 behaviour of the API.
    await pickDivision('DIV-CCD · Control Cable Division');
    fireEvent.click(screen.getByRole('button', { name: /Grant Division Access/i }));

    expect(
      (await screen.findAllByText('This organizational scope already assigned to user')).length,
    ).toBeGreaterThan(0);
    expect(scopesByUser[NEW_USER_ID]).toHaveLength(1);
    expect(grantCalls).toHaveLength(1);
    // A conflict is never swallowed silently (toast + in-form warning).
    expect(
      screen.getAllByText('User created, but Division Access could not be saved.').length,
    ).toBeGreaterThan(0);
  });

  /**
   * Prompt #16B §6/§8 — found live: the database audit showed 12 of 12
   * `user_organization_scopes` rows are the auto-provisioned COMPANY-wide row.
   * Listing it as a "division scope" made the Edit form claim
   * "1 division scope configured" for a user with zero restrictions and made
   * the required empty state unreachable for every real account.
   */
  it('6. The COMPANY-wide row is not a division restriction: exact empty state, honest count', async () => {
    seedScopes({ [listUser.id]: [companyScope()] });
    seedApi();

    renderComponent();

    // Edit form — §8 loads them through GET /admin/users/:id.
    fireEvent.click(await screen.findByRole('button', { name: /edit/i }));
    expect(await screen.findByText(/Edit User — Anas Test/)).toBeInTheDocument();
    expect(await screen.findByTestId('edit-division-access')).toBeInTheDocument();

    // §8 — the exact required wording, and no bogus counter / gold tag.
    expect(
      await screen.findByText('No division restriction — this user currently has full company access'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/division scope/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Full company access/)).not.toBeInTheDocument();
    // §17 — a non-restriction can never be revoked from this section.
    expect(screen.queryByRole('button', { name: 'Remove division access' })).not.toBeInTheDocument();
    expect(deleteCalls).toHaveLength(0);

    // Granting from the very same modal still works and keeps the COMPANY row.
    fireEvent.click(await screen.findByTestId('edit-division-access-configure'));
    expect(await screen.findByText(/Division Access — Anas Test/)).toBeInTheDocument();
    await grantDivision('DIV-CCD · Control Cable Division');

    expect(deleteCalls).toHaveLength(0);
    expect(scopesByUser[listUser.id]).toHaveLength(2);
    expect(scopesByUser[listUser.id].map(s => s.scopeLevel).sort()).toEqual(['COMPANY', 'DIVISION']);
    expect(scopesByUser[listUser.id].find(s => s.scopeLevel === 'COMPANY')).toBeTruthy();

    // §3 — the summary behind the modal counts only real restrictions.
    expect(await screen.findByText('1 division scope configured')).toBeInTheDocument();
    // The modal AND the summary render it (one shared state, hence findAll).
    expect((await findAllTags('DIV-CCD · Control Cable Division')).length).toBeGreaterThan(0);
    expect(screen.queryByText(/Full company access/)).not.toBeInTheDocument();

    // The two decisions live in ONE exported helper each, so the summaries
    // and the modal cannot drift apart (§5/§19).
    expect(isDivisionRestriction(companyScope())).toBe(false);
    expect(isDivisionRestriction(divisionScope('scope-1', D_CCD))).toBe(true);
    expect(isDivisionRestriction(divisionScope('scope-2', D_SPD))).toBe(true);
    expect(formatDivisionLabel(divisionScope('scope-1', D_CCD))).toBe('DIV-CCD · Control Cable Division');
    expect(formatDivisionLabel(divisionScope('scope-2', D_SPD))).toBe('DIV-SPD · Spoke Division');
  });

  /**
   * Prompt #16B §13 failure safety — if the account itself is never created
   * there is no real `user.id`, so no `user_organization_scopes` write may be
   * attempted at all (no temp/frontend id, no email-based fallback) and the
   * section must stay in its pending state so the admin can retry.
   */
  it('7. A failed create leaves the form pending — no scope write is ever attempted', async () => {
    seedScopes({});
    seedApi();
    // POST /admin/users/create-full fails (duplicate email ⇒ 409), like the
    // real backend's ConflictException.
    apiMock.post.mockImplementationOnce(() =>
      Promise.reject({
        response: { status: 409, data: { message: 'A user with this email already exists' } },
      }),
    );

    renderComponent();
    await openCreateFormAndFill();

    // §6 — nothing to configure until the account exists.
    expect(await screen.findByTestId('create-division-access-pending')).toBeInTheDocument();
    expect(screen.queryByTestId('create-division-access-configure')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Create User' }));

    // The failure is surfaced by the shared result dialog — never a success.
    const errorDialog = await screen.findByTestId('save-result-error');
    expect(within(errorDialog).getByText('A user with this email already exists')).toBeInTheDocument();
    expect(screen.queryByTestId('save-result-success')).not.toBeInTheDocument();

    // Exactly one create attempt, and NOT A SINGLE scope request: a failed
    // creation can therefore never leave orphan rows behind.
    const createCalls = apiMock.post.mock.calls.filter(c => c[0] === '/admin/users/create-full');
    expect(createCalls).toHaveLength(1);
    expect(createCalls[0][1]).toMatchObject({ email: 'division.access.test@pwi.test' });
    expect(apiMock.post.mock.calls.filter(c => String(c[0]).includes('org-scopes'))).toHaveLength(0);
    expect(grantCalls).toHaveLength(0);
    expect(scopesByUser[NEW_USER_ID]).toBeUndefined();

    // Still pending (no captured id) → the modal stays unreachable, and the
    // Create User button is offered again so the admin can retry the same form.
    expect(screen.queryByTestId('create-division-access-configure')).not.toBeInTheDocument();
    expect(screen.queryByTestId('create-division-access')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create User' })).toBeInTheDocument();
  });
});
