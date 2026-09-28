import React from 'react';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import { App } from 'antd';
import PermissionMatrix from './PermissionMatrix';
import apiService from '../../services/api';

jest.mock('../../services/api');

const apiMock = apiService as jest.Mocked<typeof apiService>;

const D_CCD = '11111111-1111-1111-1111-111111111111';
const D_SPD = '22222222-2222-2222-2222-222222222222';

/** Matrix payload WITH the Prompt #16 §23/§24 division fields. */
const mockMatrix = {
  roles: [
    { id: 'role-1', roleCode: 'ADMIN', name: 'Administrator', isSystemRole: true, status: 'ACTIVE' },
    { id: 'role-2', roleCode: 'SALES', name: 'Sales', isSystemRole: false, status: 'ACTIVE' },
  ],
  modules: ['production'],
  rows: [
    {
      module: 'production',
      resource: 'entry',
      resourceName: 'Production Entries',
      permissions: {
        VIEW: {
          permissionId: 'p-1',
          permissionCode: 'production.entry.view',
          roleGranted: { 'role-1': true, 'role-2': false },
          roleDivisionScopes: { 'role-1': [D_CCD], 'role-2': null },
        },
        CREATE: {
          permissionId: 'p-2',
          permissionCode: 'production.entry.create',
          roleGranted: { 'role-1': true, 'role-2': true },
          roleDivisionScopes: {},
        },
      },
    },
  ],
  moduleLabels: { production: 'Production' },
  resourceLabels: { entry: 'Production Entries' },
  divisions: [
    { id: D_CCD, divisionCode: 'DIV-CCD', name: 'CCD', status: 'ACTIVE' },
    { id: D_SPD, divisionCode: 'DIV-SPD', name: 'SPD', status: 'ACTIVE' },
  ],
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
    </MemoryRouter>,
  );

describe('PermissionMatrix — Division Access panel (Prompt #16 §24)', () => {
  beforeEach(() => {
    apiMock.get.mockReset();
    apiMock.put.mockReset();
    apiMock.get.mockResolvedValue({ data: mockMatrix } as any);
  });

  it('offers a Division Access toggle on every resource row', async () => {
    renderComponent();

    expect(await screen.findByTestId('division-access-toggle-production-entry')).toBeInTheDocument();
    expect(
      screen.queryByTestId('division-access-row-production-entry'),
    ).not.toBeInTheDocument();
  });

  it('reveals one picker per role × permission and explains the intersection rule', async () => {
    renderComponent();

    fireEvent.click(await screen.findByTestId('division-access-toggle-production-entry'));

    const row = await screen.findByTestId('division-access-row-production-entry');
    expect(row).toBeInTheDocument();
    expect(row.textContent).toContain('intersection');
    expect(row.textContent).toContain('ADMIN');
    expect(row.textContent).toContain('SALES');
    expect(row.textContent).toContain('production.entry.view');
    expect(row.textContent).toContain('production.entry.create');

    // Two roles × two permissions = four division pickers, each pre-populated
    // from the role's stored restriction (or empty = unrestricted).
    expect(within(row).getAllByRole('combobox')).toHaveLength(4);
  });

  it('collapses again when the toggle is clicked a second time', async () => {
    renderComponent();

    const toggle = await screen.findByTestId('division-access-toggle-production-entry');
    fireEvent.click(toggle);
    await screen.findByTestId('division-access-row-production-entry');

    fireEvent.click(toggle);
    await waitFor(() =>
      expect(screen.queryByTestId('division-access-row-production-entry')).not.toBeInTheDocument(),
    );
  });

  it('counts a division-scope edit as a pending change and sends divisionIds on save', async () => {
    apiMock.put.mockResolvedValue({ success: true } as any);
    renderComponent();

    fireEvent.click(await screen.findByTestId('division-access-toggle-production-entry'));
    const row = await screen.findByTestId('division-access-row-production-entry');

    // Only the panel's own pickers — never the toolbar's.
    // Order: role-1 × p-1, role-1 × p-2, role-2 × p-1, role-2 × p-2.
    const pickers = within(row).getAllByRole('combobox');
    expect(pickers).toHaveLength(4);

    // Pick the ADMIN × production.entry.create cell, which has NO stored
    // restriction (unrestricted) — restricting it must send `divisionIds`.
    fireEvent.mouseDown(pickers[1]);
    const options = await screen.findAllByText('DIV-SPD · SPD');
    fireEvent.click(options[0]);

    // The dock must acknowledge the division change, not only toggles.
    expect(await screen.findByTestId('matrix-floating-save-dock')).toBeInTheDocument();
    expect(screen.getByText(/division scope\(s\)/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Save Changes Now/i }));

    await waitFor(() => {
      expect(apiMock.put).toHaveBeenCalledWith('/admin/permissions-matrix', {
        roles: [
          {
            roleId: 'role-1',
            permissions: [
              // No toggle happened — `granted` reflects the current state and
              // the field that changed is the division scope.
              { permissionId: 'p-2', granted: true, divisionIds: [D_SPD] },
            ],
          },
        ],
      });
    });

    expect(await screen.findByText('Matrix Updated Successfully')).toBeInTheDocument();
  });
});
