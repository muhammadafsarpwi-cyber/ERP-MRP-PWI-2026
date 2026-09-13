import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import { App as AntApp } from 'antd';
import MachineManagement from './MachineManagement';
import apiService from '../../services/api';

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
  id: 'm-task20a-1',
  machineId: 'MCH-T20A',
  machineCode: 'TEST-01',
  machineNumber: 'TN-01',
  name: 'Regression Machine',
  machineType: null,
  division: null,
  section: null,
  department: null,
  location: 'Plant 1',
  manufacturer: null,
  model: null,
  serialNumber: 'SN-1',
  status: 'ACTIVE',
  criticality: 'HIGH',
  isActive: true,
  capacity: null,
  powerRating: null,
  description: null,
  installationDate: null,
  warrantyExpiryDate: null,
  qrPayload: null,
  companyId: 'c1',
};

describe('MachineManagement detail modal — TASK20-A charAt regression', () => {
  beforeEach(() => {
    localStorage.clear();
    apiMock.get.mockReset();
    apiMock.post.mockReset();
    apiMock.patch.mockReset();
    apiMock.delete.mockReset();
    // The real backend returns the machine detail wrapped: { success, data }.
    apiMock.get.mockImplementation((url: any) => {
      const u = String(url);
      if (u === '/machines') return Promise.resolve({ data: [machine], total: 1 });
      if (u === '/divisions' || u === '/sections' || u === '/departments') return Promise.resolve({ data: [] });
      if (u === `/machines/${machine.id}`) return Promise.resolve({ success: true, data: { ...machine } });
      return Promise.resolve({ data: [] });
    });
  });

  it('View opens the detail modal (not a drawer) using the unwrapped detail (data), rendering status/criticality badges without a charAt crash', async () => {
    render(
      <AntApp>
        <MemoryRouter>
          <MachineManagement />
        </MemoryRouter>
      </AntApp>,
    );

    await screen.findByText('Regression Machine', undefined, { timeout: 30000 });

    fireEvent.click(screen.getByRole('button', { name: `View machine — ${machine.machineCode}` }));

    // antd Modal renders through a portal into document.body (not the RTL container).
    const modalEl = await waitFor(() => {
      const m = document.body.querySelector('.ant-modal-content');
      expect(m).not.toBeNull();
      return m as HTMLElement;
    }, { timeout: 30000 });

    // The old View UI was a drawer — TASK21 replaced it with a centered modal.
    expect(document.body.querySelector('.ant-drawer-content')).toBeNull();

    await waitFor(() => {
      // The modal must be fed the unwrapped machine: machineId/status/criticality
      // resolve to real values instead of being undefined.
      expect(within(modalEl).getByText('MCH-T20A')).toBeInTheDocument();
      expect(within(modalEl).getAllByText('Active').length).toBeGreaterThanOrEqual(1);
      expect(within(modalEl).getAllByText('High').length).toBeGreaterThanOrEqual(1);
    }, { timeout: 30000 });

    // The page (table) must still be mounted — no full-tree unmount caused by the crash.
    expect(screen.getAllByText('Regression Machine').length).toBeGreaterThanOrEqual(1);

    // Detail endpoint really was hit with the machine id.
    expect(apiMock.get.mock.calls.some(([u]) => String(u) === `/machines/${machine.id}`)).toBe(true);
  });
});