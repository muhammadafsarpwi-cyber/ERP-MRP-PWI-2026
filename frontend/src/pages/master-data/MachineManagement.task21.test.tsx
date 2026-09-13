import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import { App as AntApp } from 'antd';
import MachineManagement from './MachineManagement';
import apiService from '../../services/api';
import { useHeaderActions } from '../../components/layout/headerActionsStore';

jest.mock('../../services/api');

const apiMock = apiService as jest.Mocked<typeof apiService>;

jest.setTimeout(120000);

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

const machine = {
  id: 'm-task21-1',
  machineId: 'MCH-T21',
  machineCode: 'TEST-21',
  machineNumber: 'TN-21',
  name: 'TASK21 Regression Machine',
  machineType: 'Cold Forge',
  division: { id: 'd1', name: 'Production' },
  section: { id: 's1', name: 'Pressing' },
  department: { id: 'de1', name: 'Forge Shop' },
  location: 'Plant 2 / Bay 4',
  manufacturer: 'Acme',
  model: 'AF-9',
  serialNumber: 'SN-21',
  status: 'ACTIVE',
  criticality: 'HIGH',
  isActive: true,
  capacity: 120,
  powerRating: '15 kW',
  description: 'Primary line machine',
  installationDate: '2024-06-15',
  warrantyExpiryDate: '2027-06-15',
  qrPayload: 'PWI|MCH-T21|TEST-21',
  companyId: 'c1',
};

const setupMocks = () => {
  localStorage.clear();
  apiMock.get.mockReset();
  apiMock.post.mockReset();
  apiMock.patch.mockReset();
  apiMock.delete.mockReset();
  apiMock.get.mockImplementation((url: any) => {
    const u = String(url);
    if (u === '/machines') return Promise.resolve({ data: [machine], total: 1 });
    if (u === '/divisions' || u === '/sections' || u === '/departments') return Promise.resolve({ data: [] });
    if (u === `/machines/${machine.id}`) return Promise.resolve({ success: true, data: { ...machine } });
    return Promise.resolve({ data: [] });
  });
};

const renderPage = () =>
  render(
    <AntApp>
      <MemoryRouter>
        <MachineManagement />
      </MemoryRouter>
    </AntApp>,
  );

/** Render the header-registered toolbar actions (PageHeader renders through the header store). */
const renderToolbar = () => {
  const { extra } = useHeaderActions.getState();
  expect(extra).not.toBeUndefined();
  render(<AntApp>{extra}</AntApp>);
};

describe('MachineManagement — TASK21 View Modal (Part A)', () => {
  beforeEach(setupMocks);

  it('opens a centered Modal instead of the old drawer, with title once-at-top structured headings and full data', async () => {
    renderPage();
    await screen.findByText('TASK21 Regression Machine', undefined, { timeout: 30000 });

    fireEvent.click(screen.getByRole('button', { name: `View machine — ${machine.machineCode}` }));

    const modalEl = await waitFor(() => {
      const m = document.body.querySelector('.ant-modal-content');
      expect(m).not.toBeNull();
      return m as HTMLElement;
    }, { timeout: 30000 });

    // No drawer anywhere (TASK21 replaced the View drawer with the modal).
    expect(document.body.querySelector('.ant-drawer-content')).toBeNull();

    // Modal has the exact required title.
    expect(within(modalEl).getByText('Machine Details')).toBeInTheDocument();

    await waitFor(() => {
      // Section navigation (Segmented) offers all six detail sections (TASK22/24).
      expect(within(modalEl).getByText('Machine Identity')).toBeInTheDocument();
      expect(within(modalEl).getByText('Organization + Location')).toBeInTheDocument();
      expect(within(modalEl).getByText('Technical Information')).toBeInTheDocument();
      expect(within(modalEl).getByText('Production')).toBeInTheDocument();
      expect(within(modalEl).getByText('Job Cards')).toBeInTheDocument();
      expect(within(modalEl).getByText('Dates + Description')).toBeInTheDocument();
      // Identity section is selected by default and shows real (unwrapped) values.
      expect(within(modalEl).getAllByText(machine.machineId).length).toBeGreaterThanOrEqual(1);
      expect(within(modalEl).getAllByText('Active').length).toBeGreaterThanOrEqual(1);
      expect(within(modalEl).getAllByText('High').length).toBeGreaterThanOrEqual(1);
    }, { timeout: 30000 });

    // Tabs switch the active section instead of stacking all sections vertically.
    fireEvent.click(within(modalEl).getByText('Organization + Location'));
    await waitFor(() => {
      expect(within(modalEl).getByText('Plant 2 / Bay 4')).toBeInTheDocument();
    }, { timeout: 30000 });

    fireEvent.click(within(modalEl).getByText('Technical Information'));
    await waitFor(() => {
      expect(within(modalEl).getByText('SN-21')).toBeInTheDocument();
    }, { timeout: 30000 });

    fireEvent.click(within(modalEl).getByText('Dates + Description'));
    await waitFor(() => {
      expect(within(modalEl).getByText('Primary line machine')).toBeInTheDocument();
    }, { timeout: 30000 });

    // Table stays mounted (no unmount/shutdown).
    expect(screen.getAllByText('TASK21 Regression Machine').length).toBeGreaterThanOrEqual(1);
  });

  it('closes the modal via the footer Close button', async () => {
    renderPage();
    await screen.findByText('TASK21 Regression Machine', undefined, { timeout: 30000 });
    fireEvent.click(screen.getByRole('button', { name: `View machine — ${machine.machineCode}` }));

    await waitFor(() => {
      expect(document.body.querySelector('.ant-modal-content')).not.toBeNull();
    }, { timeout: 30000 });

    const modalEl = document.body.querySelector('.ant-modal-content') as HTMLElement;
    const footer = modalEl.querySelector('.ant-modal-footer') as HTMLElement;
    fireEvent.click(within(footer).getByRole('button', { name: /Close/ }));

    await waitFor(() => {
      expect(document.body.querySelector('.ant-modal-content')).toBeNull();
    }, { timeout: 30000 });
    expect(screen.getAllByText('TASK21 Regression Machine').length).toBeGreaterThanOrEqual(1);
  });
});

describe('MachineManagement — TASK21 Toolbar Actions (Part B)', () => {
  beforeEach(setupMocks);

  it('renders labeled Export, Import, PDF, Print, Refresh, Clear and Add Machine actions', async () => {
    renderPage();
    await screen.findByText('TASK21 Regression Machine', undefined, { timeout: 30000 });
    renderToolbar();

    expect(screen.getByRole('button', { name: /Export$/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Import$/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /PDF$/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Print$/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Refresh$/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Clear$/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Add Machine$/ })).toBeInTheDocument();
  });

  it('Clear resets the search field', async () => {
    renderPage();
    await screen.findByText('TASK21 Regression Machine', undefined, { timeout: 30000 });

    const searchInput = screen.getByPlaceholderText('Search by code, name, serial…');
    fireEvent.change(searchInput, { target: { value: 'ZEBRA' } });
    expect(searchInput).toHaveValue('ZEBRA');

    renderToolbar();
    fireEvent.click(screen.getByRole('button', { name: /Clear/ }));

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Search by code, name, serial…')).toHaveValue('');
    }, { timeout: 30000 });
  });

  it('Refresh reloads the machine list from the API', async () => {
    renderPage();
    await screen.findByText('TASK21 Regression Machine', undefined, { timeout: 30000 });
    await waitFor(() => {
      const calls = apiMock.get.mock.calls.filter(([u]) => String(u) === '/machines');
      expect(calls.length).toBeGreaterThanOrEqual(1);
    }, { timeout: 30000 });
    const before = apiMock.get.mock.calls.filter(([u]) => String(u) === '/machines').length;

    renderToolbar();
    fireEvent.click(screen.getByRole('button', { name: /Refresh/ }));

    await waitFor(() => {
      const after = apiMock.get.mock.calls.filter(([u]) => String(u) === '/machines').length;
      expect(after).toBeGreaterThan(before);
    }, { timeout: 30000 });
  });

  it('Import opens the CSV import modal with a template download', async () => {
    renderPage();
    await screen.findByText('TASK21 Regression Machine', undefined, { timeout: 30000 });
    renderToolbar();
    fireEvent.click(screen.getByRole('button', { name: /Import/ }));

    const importModal = await waitFor(() => {
      const el = document.querySelectorAll('.ant-modal-content');
      const target = Array.from(el).find((n) => n.textContent?.includes('Import Machines'));
      expect(target).not.toBeUndefined();
      return target as HTMLElement;
    }, { timeout: 30000 });

    expect(within(importModal).getByRole('button', { name: /Download Template/ })).toBeInTheDocument();
    expect(within(importModal).getByText('Click or drag a CSV file here')).toBeInTheDocument();
  });

  it('keeps the row-level action set (View/Edit/QR/Print/Status/Delete) using shared TableActions', async () => {
    renderPage();
    await screen.findByText('TASK21 Regression Machine', undefined, { timeout: 30000 });

    expect(screen.getByRole('button', { name: `View machine — ${machine.machineCode}` })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: `Edit machine — ${machine.machineCode}` })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: `QR code — ${machine.machineCode}` })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: `Print barcode — ${machine.machineCode}` })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: `Change status — ${machine.machineCode}` })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: `Delete machine — ${machine.machineCode}` })).toBeInTheDocument();
  });
});