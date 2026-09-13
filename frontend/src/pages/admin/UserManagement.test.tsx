import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import { App } from 'antd';
import UserManagement from './UserManagement';
import apiService from '../../services/api';
import { useUserStore } from '../../store/userStore';
import { useHeaderActions } from '../../components/layout/headerActionsStore';

jest.mock('../../services/api');

const apiMock = apiService as jest.Mocked<typeof apiService>;

const mockUsers = [
  {
    id: 'user-junaid',
    authUserId: 'auth-junaid',
    displayName: 'junaid',
    email: 'pwijunaid@gmail.com',
    phone: '+92-300-1111111',
    employeeId: 'EMP-002',
    status: 'ACTIVE',
    avatarUrl: '/uploads/avatars/auth-junaid/avatar.png',
    userRoles: [
      { id: 'ur-1', roleId: 'role-admin', role: { id: 'role-admin', roleCode: 'ADMIN', name: 'Administrator' } },
      { id: 'ur-2', roleId: 'role-super', role: { id: 'role-super', roleCode: 'SUPER_ADMIN', name: 'Super Administrator' } },
      { id: 'ur-3', roleId: 'role-prod', role: { id: 'role-prod', roleCode: 'PRODUCTION', name: 'Production' } },
    ],
    createdAt: '2026-09-10T10:00:00Z',
    lastLoginAt: '2026-09-12T10:00:00Z',
  },
];

const mockRoles = [
  { id: 'role-admin', roleCode: 'ADMIN', name: 'Administrator' },
  { id: 'role-super', roleCode: 'SUPER_ADMIN', name: 'Super Administrator' },
  { id: 'role-prod', roleCode: 'PRODUCTION', name: 'Production' },
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
    </MemoryRouter>
  );

describe('UserManagement', () => {
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
      if (url === '/auth/me') {
        return Promise.resolve({ data: currentUser } as any);
      }
      if (url === '/admin/users') {
        return Promise.resolve({ data: mockUsers, total: mockUsers.length } as any);
      }
      if (url === '/admin/roles') {
        return Promise.resolve({ data: mockRoles, total: mockRoles.length } as any);
      }
      return Promise.resolve({ data: [] } as any);
    });
  });

  it('renders Crystal Cards and 2027 Model badges', async () => {
    renderComponent();

    expect(await screen.findByText('Total Users')).toBeInTheDocument();
    expect(screen.getByText('Active Users')).toBeInTheDocument();
    expect(screen.getByText('Inactive Users')).toBeInTheDocument();
    expect(screen.getByText('Roles Available')).toBeInTheDocument();
    expect(screen.getByText('2027 Model')).toBeInTheDocument();
  });

  it('registers Add User and Export buttons in header store', async () => {
    renderComponent();

    await waitFor(() => {
      const extraNode = useHeaderActions.getState().extra;
      expect(extraNode).toBeTruthy();
    });

    const headerTitle = useHeaderActions.getState().title;
    expect(headerTitle).toBe('Users');
  });

  it('renders user row with name, email, avatar, and assigned roles', async () => {
    renderComponent();

    expect(await screen.findByText('junaid')).toBeInTheDocument();
    expect(screen.getByText('pwijunaid@gmail.com')).toBeInTheDocument();
    expect(screen.getByText('ADMIN')).toBeInTheDocument();
    expect(screen.getByText('SUPER_ADMIN')).toBeInTheDocument();
    expect(screen.getByText('PRODUCTION')).toBeInTheDocument();
  });

  it('opens role assignment modal and calls assign/sync roles endpoint', async () => {
    apiMock.post.mockResolvedValue({ success: true, data: mockUsers[0], message: 'Roles updated successfully' } as any);

    renderComponent();

    expect(await screen.findByText('junaid')).toBeInTheDocument();
    const rolesBtn = screen.getByRole('button', { name: 'Roles' });
    fireEvent.click(rolesBtn);

    expect(await screen.findByText(/Manage Roles — junaid/i)).toBeInTheDocument();

    const saveBtn = screen.getByText('Save Roles');
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(apiMock.post).toHaveBeenCalledWith(
        '/admin/users/user-junaid/roles',
        expect.objectContaining({
          roleIds: expect.arrayContaining(['role-admin', 'role-super', 'role-prod']),
        })
      );
    });

    // SaveResultDialog should display with animated checkmark and user info
    expect(await screen.findByText('Roles Updated Successfully')).toBeInTheDocument();
    expect(screen.getByTestId('save-result-check-ring')).toBeInTheDocument();
    expect(screen.getByTestId('save-result-user-card')).toBeInTheDocument();
    expect(screen.getByText(/Updated permissions for junaid/i)).toBeInTheDocument();

    // Close button dismisses the dialog
    const closeBtn = screen.getByRole('button', { name: 'Close' });
    fireEvent.click(closeBtn);
    await waitFor(() => {
      expect(screen.queryByTestId('save-result-check-ring')).not.toBeInTheDocument();
    });
  });

  it('displays SaveResultDialog error phase when role saving fails', async () => {
    apiMock.post.mockRejectedValue({
      response: { status: 400, data: { message: 'Database constraint violation during role update' } },
    });

    renderComponent();

    expect(await screen.findByText('junaid')).toBeInTheDocument();
    const rolesBtn = screen.getByRole('button', { name: 'Roles' });
    fireEvent.click(rolesBtn);

    expect(await screen.findByText(/Manage Roles — junaid/i)).toBeInTheDocument();

    const saveBtn = screen.getByText('Save Roles');
    fireEvent.click(saveBtn);

    // SaveResultDialog should display error state
    expect(await screen.findByTestId('save-result-error')).toBeInTheDocument();
    expect(screen.getByText('Save Failed')).toBeInTheDocument();
    expect(screen.getByText(/Database constraint violation during role update/i)).toBeInTheDocument();
  });

  it('opens photo modal when clicking change photo button or avatar', async () => {
    renderComponent();

    expect(await screen.findByText('junaid')).toBeInTheDocument();
    const photoBtns = screen.getAllByRole('button', { name: /camera/i });
    fireEvent.click(photoBtns[0]);

    expect(await screen.findByText(/Change Photo — junaid/i)).toBeInTheDocument();
    expect(screen.getByText('Choose Photo')).toBeInTheDocument();
  });

  it('opens Edit User modal in split-view with live view form, minimizes to dock, and restores', async () => {
    renderComponent();

    expect(await screen.findByText('junaid')).toBeInTheDocument();
    const editBtn = screen.getByRole('button', { name: /edit/i });
    fireEvent.click(editBtn);

    // Modal title and split-view preview should be rendered
    expect(await screen.findByText(/Edit User — junaid/i)).toBeInTheDocument();
    expect(screen.getByTestId('edit-user-live-preview')).toBeInTheDocument();
    expect(screen.getByText('Live View Form')).toBeInTheDocument();

    // Click minimize to dock
    const minBtn = screen.getByTitle('Minimize to Dock');
    fireEvent.click(minBtn);

    // Minimized dock should appear with tab
    expect(await screen.findByTestId('user-minimized-dock')).toBeInTheDocument();
    expect(screen.getByText('Edit: junaid')).toBeInTheDocument();

    // Click tab to restore modal
    const dockTab = screen.getByTitle(/Click to restore Edit Form for junaid/i);
    fireEvent.click(dockTab);

    // Modal should be restored
    expect(await screen.findByText(/Edit User — junaid/i)).toBeInTheDocument();
    expect(screen.getByTestId('edit-user-live-preview')).toBeInTheDocument();
  });

  it('opens direct View User Profile modal from table actions', async () => {
    renderComponent();

    expect(await screen.findByText('junaid')).toBeInTheDocument();
    const viewBtn = screen.getByRole('button', { name: /eye/i });
    fireEvent.click(viewBtn);

    // View Profile modal should display full record
    expect(await screen.findByText(/User Profile View — junaid/i)).toBeInTheDocument();
    expect(screen.getByTestId('user-full-view-card')).toBeInTheDocument();
    expect(screen.getByText('User Master Record (2027 Model)')).toBeInTheDocument();
  });
});
