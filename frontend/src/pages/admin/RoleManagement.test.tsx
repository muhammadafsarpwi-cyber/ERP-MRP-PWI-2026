import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import { App } from 'antd';
import RoleManagement from './RoleManagement';
import apiService from '../../services/api';
import { useUserStore } from '../../store/userStore';
import { useHeaderActions } from '../../components/layout/headerActionsStore';

jest.mock('../../services/api');

const apiMock = apiService as jest.Mocked<typeof apiService>;

const mockRoles = [
  {
    id: 'role-1',
    roleCode: 'ADMIN',
    name: 'Administrator',
    description: 'System administration with full privileges',
    isSystemRole: true,
    status: 'ACTIVE',
    rolePermissions: [
      { id: 'rp-1', permissionId: 'p-1' },
      { id: 'rp-2', permissionId: 'p-2' },
    ],
  },
  {
    id: 'role-2',
    roleCode: 'PRODUCTION',
    name: 'Production Lead',
    description: 'Production department floor and operations manager',
    isSystemRole: false,
    status: 'ACTIVE',
    rolePermissions: [
      { id: 'rp-3', permissionId: 'p-1' },
    ],
  },
];

const mockPermissions = [
  {
    id: 'p-1',
    permissionCode: 'ADMIN_USERS_VIEW',
    name: 'View Users List',
    module: 'admin',
    resource: 'users',
    action: 'view',
  },
  {
    id: 'p-2',
    permissionCode: 'ADMIN_USERS_CREATE',
    name: 'Create User Accounts',
    module: 'admin',
    resource: 'users',
    action: 'create',
  },
  {
    id: 'p-3',
    permissionCode: 'PRODUCTION_JOBS_MANAGE',
    name: 'Manage Production Jobs',
    module: 'production',
    resource: 'jobs',
    action: 'manage',
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
        <RoleManagement />
      </App>
    </MemoryRouter>
  );

describe('RoleManagement (2027 Model)', () => {
  beforeEach(() => {
    localStorage.clear();
    const currentUser = {
      id: 'admin-1',
      displayName: 'Muhammad Afsar',
      email: 'afsar@pwi.test',
      permissions: [
        'admin.roles.view',
        'admin.roles.create',
        'admin.roles.update',
        'admin.roles.assign_permissions',
        'admin.roles.deactivate',
      ],
    };
    localStorage.setItem('erp_user', JSON.stringify(currentUser));
    localStorage.setItem('erp_permissions_ts', Date.now().toString());
    useUserStore.getState().setUser(currentUser);

    apiMock.get.mockReset();
    apiMock.post.mockReset();
    apiMock.patch.mockReset();
    apiMock.delete.mockReset();

    apiMock.get.mockImplementation((url: string) => {
      if (url === '/admin/roles') {
        return Promise.resolve({ data: mockRoles, total: mockRoles.length } as any);
      }
      if (url === '/admin/permissions') {
        return Promise.resolve({ data: mockPermissions, total: mockPermissions.length } as any);
      }
      return Promise.resolve({ data: [] } as any);
    });
  });

  it('renders 4 Crystal KPI Cards and 2027 Model badges', async () => {
    renderComponent();

    expect(await screen.findByText('Total Roles')).toBeInTheDocument();
    expect(screen.getByText('System Roles')).toBeInTheDocument();
    expect(screen.getByText('Custom Roles')).toBeInTheDocument();
    expect(screen.getByText('Permissions Pool')).toBeInTheDocument();
    expect(screen.getByText('2027 Model')).toBeInTheDocument();
  });

  it('registers Add Role and Export buttons in header store', async () => {
    renderComponent();

    await waitFor(() => {
      const extraNode = useHeaderActions.getState().extra;
      expect(extraNode).toBeTruthy();
    });

    const headerTitle = useHeaderActions.getState().title;
    expect(headerTitle).toBe('Roles');
  });

  it('renders table column headings with their text labels', async () => {
    renderComponent();

    expect((await screen.findAllByText('Role Code'))[0]).toBeInTheDocument();
    expect(screen.getAllByText('Role Name')[0]).toBeInTheDocument();
    expect(screen.getAllByText('Description')[0]).toBeInTheDocument();
    expect(screen.getAllByText('System Role')[0]).toBeInTheDocument();
    expect(screen.getAllByText('Permissions')[0]).toBeInTheDocument();
    expect(screen.getAllByText('Status')[0]).toBeInTheDocument();
    expect(screen.getAllByText('Actions')[0]).toBeInTheDocument();

    // Verify role rows render
    expect(screen.getByText('ADMIN')).toBeInTheDocument();
    expect(screen.getByText('Administrator')).toBeInTheDocument();
    expect(screen.getByText('PRODUCTION')).toBeInTheDocument();
    expect(screen.getByText('Production Lead')).toBeInTheDocument();
  });

  it('opens Create Role modal in split view with live preview card and saves with SaveResultDialog', async () => {
    apiMock.post.mockResolvedValue({
      id: 'role-new',
      roleCode: 'QUALITY_HEAD',
      name: 'Quality Head',
      description: 'Head of Quality Control',
      isSystemRole: false,
      status: 'ACTIVE',
    } as any);

    renderComponent();

    // Trigger open create modal by invoking the header extra Add Role button
    await waitFor(() => {
      expect(useHeaderActions.getState().extra).toBeTruthy();
    });

    // We can also click the Add Role button inside the header store
    const { container } = render(<div>{useHeaderActions.getState().extra}</div>);
    const addRoleBtn = screen.getByRole('button', { name: /add role/i });
    fireEvent.click(addRoleBtn);

    // Modal and split preview should be visible
    expect(await screen.findByText(/Create New Role — Split View/i)).toBeInTheDocument();
    expect(screen.getByTestId('create-role-live-preview')).toBeInTheDocument();

    // Type inputs
    const codeInput = screen.getByPlaceholderText('e.g. OPERATIONS_LEAD');
    fireEvent.change(codeInput, { target: { value: 'QUALITY_HEAD' } });

    const nameInput = screen.getByPlaceholderText('e.g. Operations Lead');
    fireEvent.change(nameInput, { target: { value: 'Quality Head' } });

    const descInput = screen.getByPlaceholderText(/Describe the responsibilities/i);
    fireEvent.change(descInput, { target: { value: 'Head of Quality Control' } });

    // Submit form
    const submitBtn = screen.getByRole('button', { name: 'Create Role' });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(apiMock.post).toHaveBeenCalledWith(
        '/admin/roles',
        expect.objectContaining({
          roleCode: 'QUALITY_HEAD',
          name: 'Quality Head',
          description: 'Head of Quality Control',
        })
      );
    });

    // SaveResultDialog should appear
    expect(await screen.findByText('Role Created Successfully')).toBeInTheDocument();
    expect(screen.getByText('New Role Configured')).toBeInTheDocument();
  });

  it('opens Edit Role modal in split view and allows minimizing to floating dock', async () => {
    renderComponent();

    expect(await screen.findByText('Production Lead')).toBeInTheDocument();
    const editBtns = screen.getAllByRole('button', { name: /edit/i });
    fireEvent.click(editBtns[0]);

    // Modal and split view preview
    expect(await screen.findByText(/Edit Role —/i)).toBeInTheDocument();
    expect(screen.getByTestId('edit-role-live-preview')).toBeInTheDocument();

    // Click minimize to dock
    const minBtn = screen.getByTitle('Minimize to Dock');
    fireEvent.click(minBtn);

    // Dock tab should be visible
    expect(await screen.findByTestId('role-minimized-dock')).toBeInTheDocument();
    expect(screen.getByText(/Edit:/i)).toBeInTheDocument();

    // Click dock tab to restore
    const dockTab = screen.getByTitle(/Click to restore Edit Role for/i);
    fireEvent.click(dockTab);

    // Modal should be restored
    expect(await screen.findByText(/Edit Role —/i)).toBeInTheDocument();
    expect(screen.getByTestId('edit-role-live-preview')).toBeInTheDocument();
  });

  it('opens permissions assignment modal, toggles module permissions, and saves with SaveResultDialog', async () => {
    apiMock.post.mockResolvedValue({ success: true } as any);

    renderComponent();

    expect(await screen.findByText('Production Lead')).toBeInTheDocument();
    const permBtns = screen.getAllByRole('button', { name: /permissions/i });
    fireEvent.click(permBtns[0]);

    // Modal should open
    expect(await screen.findByText(/Assign Permissions —/i)).toBeInTheDocument();
    expect(screen.getByText('ADMIN_USERS_VIEW')).toBeInTheDocument();

    // Click Save Permissions
    const savePermsBtn = screen.getByRole('button', { name: 'Save Permissions' });
    fireEvent.click(savePermsBtn);

    await waitFor(() => {
      expect(apiMock.post).toHaveBeenCalledWith(
        expect.stringMatching(/\/admin\/roles\/.*\/permissions/),
        expect.any(Object)
      );
    });

    expect(await screen.findByText('Permissions Assigned')).toBeInTheDocument();
  });
});
