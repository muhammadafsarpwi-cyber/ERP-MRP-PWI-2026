import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import { App } from 'antd';
import PermissionMatrix from './PermissionMatrix';
import apiService from '../../services/api';
import { useHeaderActions } from '../../components/layout/headerActionsStore';

jest.mock('../../services/api');

const apiMock = apiService as jest.Mocked<typeof apiService>;

const mockMatrixData = {
  roles: [
    { id: 'role-1', roleCode: 'ADMIN', name: 'Administrator', isSystemRole: true, status: 'ACTIVE' },
    { id: 'role-2', roleCode: 'SALES', name: 'Sales', isSystemRole: false, status: 'ACTIVE' },
  ],
  modules: ['admin', 'organization'],
  rows: [
    {
      module: 'admin',
      resource: 'user',
      resourceName: 'Users',
      permissions: {
        VIEW: {
          permissionId: 'p-1',
          permissionCode: 'admin.user.view',
          roleGranted: { 'role-1': true, 'role-2': false },
        },
        CREATE: {
          permissionId: 'p-2',
          permissionCode: 'admin.user.create',
          roleGranted: { 'role-1': true, 'role-2': false },
        },
        UPDATE: {
          permissionId: 'p-3',
          permissionCode: 'admin.user.update',
          roleGranted: { 'role-1': true, 'role-2': false },
        },
        DELETE: {
          permissionId: 'p-4',
          permissionCode: 'admin.user.delete',
          roleGranted: { 'role-1': true, 'role-2': false },
        },
      },
    },
    {
      module: 'organization',
      resource: 'company',
      resourceName: 'Companies',
      permissions: {
        VIEW: {
          permissionId: 'p-5',
          permissionCode: 'organization.company.view',
          roleGranted: { 'role-1': true, 'role-2': true },
        },
        CREATE: {
          permissionId: 'p-6',
          permissionCode: 'organization.company.create',
          roleGranted: { 'role-1': true, 'role-2': false },
        },
      },
    },
  ],
  moduleLabels: {
    admin: 'Administration',
    organization: 'Organization',
  },
  resourceLabels: {
    user: 'Users',
    company: 'Companies',
  },
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
        <PermissionMatrix />
      </App>
    </MemoryRouter>
  );

describe('PermissionMatrix (2027 Model)', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem(
      'erp_user',
      JSON.stringify({
        id: 'admin-1',
        email: 'admin@pwi.com',
        permissions: ['admin.matrix.view', 'admin.matrix.update', 'admin.matrix.export'],
      }),
    );
    localStorage.setItem('erp_permissions_ts', Date.now().toString());
    apiMock.get.mockReset();
    apiMock.put.mockReset();
    apiMock.get.mockResolvedValue({ data: mockMatrixData } as any);
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('renders 4 Crystal KPI Cards and 2027 Model badges', async () => {
    renderComponent();

    expect(await screen.findByText('Matrix Controls')).toBeInTheDocument();
    expect(screen.getByText('Active Roles')).toBeInTheDocument();
    expect(screen.getByText('Pages & Resources')).toBeInTheDocument();
    expect(screen.getByText('Unsaved Changes')).toBeInTheDocument();
    expect(screen.getByText('2027 Model')).toBeInTheDocument();
  });

  it('registers header title and actions in useHeaderActions store', async () => {
    renderComponent();

    await waitFor(() => {
      expect(useHeaderActions.getState().title).toBe('Roles & Permissions');
      expect(useHeaderActions.getState().extra).toBeTruthy();
    });
  });

  it('renders sticky table with module sections and resource rows', async () => {
    renderComponent();

    // Verify sticky wrapper is present
    expect(await screen.findByTestId('matrix-scroll-wrapper')).toBeInTheDocument();

    // Roles should be rendered in table header
    expect(screen.getByText('Administrator')).toBeInTheDocument();
    expect(screen.getByText('Sales')).toBeInTheDocument();

    // Modules and resources
    expect(screen.getByText('Administration')).toBeInTheDocument();
    expect(screen.getByText('Users')).toBeInTheDocument();
    expect(screen.getByText('Companies')).toBeInTheDocument();
  });

  it('toggles permission cell, shows floating save dock with unsaved changes, and saves with SaveResultDialog', async () => {
    apiMock.put.mockResolvedValue({ success: true, message: 'Matrix updated' } as any);

    renderComponent();

    expect(await screen.findByText('Users')).toBeInTheDocument();

    // Find all 'V' buttons
    const vButtons = screen.getAllByRole('button', { name: 'V' });
    // Click on ungranted button to grant
    fireEvent.click(vButtons[1]); // Sales user view

    // Floating save dock should appear
    expect(await screen.findByTestId('matrix-floating-save-dock')).toBeInTheDocument();
    expect(screen.getByText(/Unsaved Changes: 1 permission toggle/i)).toBeInTheDocument();

    // Click Save Changes Now in the floating dock
    const saveBtn = screen.getByRole('button', { name: /Save Changes Now/i });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(apiMock.put).toHaveBeenCalledWith(
        '/admin/permissions-matrix',
        expect.objectContaining({
          roles: expect.arrayContaining([
            expect.objectContaining({
              roleId: 'role-2',
            }),
          ]),
        })
      );
    });

    // SaveResultDialog should be displayed
    expect(await screen.findByText('Matrix Updated Successfully')).toBeInTheDocument();
    expect(screen.getByText('Authorization Matrix Synchronized')).toBeInTheDocument();
  });

  it('discards unsaved changes when clicking Discard button', async () => {
    renderComponent();

    expect(await screen.findByText('Users')).toBeInTheDocument();

    const vButtons = screen.getAllByRole('button', { name: 'V' });
    fireEvent.click(vButtons[1]);

    // Floating dock should appear
    expect(await screen.findByTestId('matrix-floating-save-dock')).toBeInTheDocument();

    // Click Discard
    const discardBtn = screen.getByRole('button', { name: /Discard/i });
    fireEvent.click(discardBtn);

    // Floating dock should disappear
    await waitFor(() => {
      expect(screen.queryByTestId('matrix-floating-save-dock')).not.toBeInTheDocument();
    });
  });

  it('renders disambiguated V/A/E/D/P/X/R and un-shadowed DEACTIVATE/MANAGE badges cleanly', async () => {
    const richMatrix = {
      roles: [
        { id: 'role-2', roleCode: 'MGR', name: 'Manager', isSystemRole: false, status: 'ACTIVE' },
      ],
      modules: ['finance', 'item'],
      rows: [
        {
          module: 'finance',
          resource: 'journal',
          resourceName: 'Vouchers & Journals',
          permissions: {
            VIEW: { permissionId: 'f-1', permissionCode: 'finance.journal.view', roleGranted: { 'role-2': true } },
            CREATE: { permissionId: 'f-2', permissionCode: 'finance.journal.create', roleGranted: { 'role-2': false } },
            UPDATE: { permissionId: 'f-3', permissionCode: 'finance.journal.update', roleGranted: { 'role-2': false } },
            DELETE: { permissionId: 'f-4', permissionCode: 'finance.journal.delete', roleGranted: { 'role-2': false } },
            POST: { permissionId: 'f-5', permissionCode: 'finance.journal.post', roleGranted: { 'role-2': true } },
            APPROVE: { permissionId: 'f-6', permissionCode: 'finance.journal.approve', roleGranted: { 'role-2': false } },
            EXPORT: { permissionId: 'f-7', permissionCode: 'finance.journal.export', roleGranted: { 'role-2': true } },
            PRINT: { permissionId: 'f-8', permissionCode: 'finance.journal.print', roleGranted: { 'role-2': false } },
            REVERSE: { permissionId: 'f-9', permissionCode: 'finance.journal.reverse', roleGranted: { 'role-2': false } },
            RESTORE: { permissionId: 'f-10', permissionCode: 'finance.journal.restore', roleGranted: { 'role-2': false } },
            MANAGE: { permissionId: 'f-11', permissionCode: 'finance.journal.manage', roleGranted: { 'role-2': false } },
          },
        },
        {
          module: 'item',
          resource: 'item',
          resourceName: 'Items Master',
          permissions: {
            VIEW: { permissionId: 'i-1', permissionCode: 'item.view', roleGranted: { 'role-2': true } },
            DELETE: { permissionId: 'i-2', permissionCode: 'item.delete', roleGranted: { 'role-2': false } },
            DEACTIVATE: { permissionId: 'i-3', permissionCode: 'item.deactivate', roleGranted: { 'role-2': false } },
          },
        },
      ],
      moduleLabels: { finance: 'Finance', item: 'Item Master' },
      resourceLabels: {},
    };
    apiMock.get.mockResolvedValue({ data: richMatrix } as any);
    renderComponent();

    expect(await screen.findByText('Vouchers & Journals')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'P' }).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Ap' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'X' }).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Pr' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'R' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Rs' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'M' })).toBeInTheDocument();
    // DEACTIVATE must not be shadowed when DELETE is also present
    expect(screen.getByRole('button', { name: 'Dx' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Dx' }));
    expect(await screen.findByTestId('matrix-floating-save-dock')).toBeInTheDocument();
  });

  it('disables matrix editing controls when user only holds admin.matrix.view', async () => {
    localStorage.setItem(
      'erp_user',
      JSON.stringify({
        id: 'viewer-1',
        email: 'viewer@pwi.com',
        permissions: ['admin.matrix.view'],
      }),
    );
    localStorage.setItem('erp_permissions_ts', Date.now().toString());
    renderComponent();

    expect(await screen.findByText('Users')).toBeInTheDocument();
    const vButtons = screen.getAllByRole('button', { name: 'V' });
    expect(vButtons[0]).toBeDisabled();
    fireEvent.click(vButtons[0]);
    expect(screen.queryByTestId('matrix-floating-save-dock')).not.toBeInTheDocument();
  });
});
