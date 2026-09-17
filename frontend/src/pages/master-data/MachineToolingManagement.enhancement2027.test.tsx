import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import { App as AntApp } from 'antd';
import MachineToolingManagement from './MachineToolingManagement';
import apiService from '../../services/api';
import { useHeaderActions } from '../../components/layout/headerActionsStore';

jest.mock('../../services/api');

const apiMock = apiService as jest.Mocked<typeof apiService>;

beforeAll(() => {
  window.matchMedia = (q: string) =>
    ({
      matches: false,
      media: q,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList;
});

const PERMISSIONS = [
  'manufacturing.tool_component.view',
  'manufacturing.tool_component.create',
  'manufacturing.tool_component.update',
  'manufacturing.tool_component.delete',
  'manufacturing.component_change.view',
  'manufacturing.component_change.create',
  'manufacturing.component_change.update',
  'manufacturing.component_change.delete',
  'manufacturing.tool_consumption.report',
];

const mockMachines = [
  { id: 'mc-ft', machineId: 'MCH035', machineCode: 'FT-01', machineNumber: 'FT # 01', name: 'Flattening Machine FT-01' },
];

const mockItems = [
  { id: 'it-die-9g', itemCode: 'SPI-1002', name: 'SPOKE HEADING FORGING DIE (9G 3.5)', baseUomId: 'u-pcs' },
];

const mockUoms = [
  { id: 'u-pcs', code: 'PCS', name: 'Pieces' },
];

const mockComponent = {
  id: 'c-1',
  companyId: 'comp-1',
  machineId: 'mc-ft',
  itemId: 'it-die-9g',
  uomId: 'u-pcs',
  componentType: 'DIE',
  componentName: 'SPOKE HEADING FORGING DIE (9G 3.5)',
  componentCode: 'SPI-1002',
  expectedLifeQuantity: '150000.0000',
  minThreshold: '10000.0000',
  maxThreshold: '200000.0000',
  description: 'Forging die',
  isActive: true,
  machine: mockMachines[0],
};

const mockChangeRecord = {
  id: 'ch-99',
  companyId: 'comp-1',
  machineId: 'mc-ft',
  componentId: 'c-1',
  jobCardId: null,
  oldToolCode: 'SPI-1002-OLD',
  newToolCode: 'SPI-1002-NEW',
  newToolDescription: 'Forging Die (New)',
  changeDate: '2026-09-04',
  changeTime: '08:30',
  productionCounterBefore: 675500,
  productionCounterAfter: 622000,
  productionSincePrevious: 53500,
  reason: 'Broken at limit',
  conditionStatus: 'DAMAGED',
  remarks: 'Replaced during morning shift',
  changedAt: '2026-09-04T08:30:00Z',
  machine: mockMachines[0],
  component: mockComponent,
};

function setupMocks() {
  localStorage.setItem(
    'erp_user',
    JSON.stringify({
      id: 'u-1',
      fullName: 'Foreman Tooling',
      permissions: PERMISSIONS,
    }),
  );

  apiMock.get.mockImplementation((url: string) => {
    if (url === '/machines') return Promise.resolve({ data: mockMachines } as any);
    if (url === '/master-data/items') return Promise.resolve({ data: mockItems } as any);
    if (url === '/master-data/uom') return Promise.resolve({ data: mockUoms } as any);
    if (url === '/machine-tooling/components') return Promise.resolve({ data: [mockComponent], total: 1 } as any);
    if (url === '/machine-tooling/changes') return Promise.resolve({ data: [mockChangeRecord], total: 1 } as any);
    if (url.startsWith('/machine-tooling/changes/ch-99')) return Promise.resolve(mockChangeRecord as any);
    if (url === '/machine-tooling/active-tools') return Promise.resolve({ data: [], total: 0 } as any);
    return Promise.resolve({ data: [] } as any);
  });
}

const renderPage = () =>
  render(
    <MemoryRouter>
      <AntApp>
        <MachineToolingManagement />
      </AntApp>
    </MemoryRouter>,
  );

describe('Machine Tooling Management — Store Item Auto-Fill & Enhanced Modal Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setupMocks();
  });

  it('1. Header actions store is populated with Enterprise 2027 title and primary action', async () => {
    renderPage();
    await screen.findByText('SPOKE HEADING FORGING DIE (9G 3.5)');

    const headerState = useHeaderActions.getState();
    expect(headerState.title).toBeTruthy();
    expect(headerState.extra).toBeTruthy();
  });

  it('2. Opening Add Tool modal displays Store Item select at top with auto-fill badge', async () => {
    renderPage();
    await screen.findByText('SPOKE HEADING FORGING DIE (9G 3.5)');

    // Trigger open create modal via action button
    const extra = useHeaderActions.getState().extra;
    const { getAllByRole } = render(<div>{extra}</div>);
    const addButton = getAllByRole('button', { name: /Add Tool \/ Component/i })[0];
    fireEvent.click(addButton);

    await waitFor(() => {
      expect(screen.getByText('Store Item / Product Master')).toBeInTheDocument();
      expect(screen.getByText(/Auto-fills Code, Name & UOM/)).toBeInTheDocument();
    });
  });

  it('3. Change Transaction Detail modal displays KPI cards, production output derivation and descriptions', async () => {
    renderPage();
    await screen.findByText('SPOKE HEADING FORGING DIE (9G 3.5)');

    // Switch to Change History tab
    const changeTab = screen.getByRole('tab', { name: /Change History/i });
    fireEvent.click(changeTab);

    await screen.findByText('SPI-1002-NEW');

    // Click view detail button
    const viewButton = screen.getByRole('button', { name: /View change — 2026-09-04 SPI-1002-NEW/i });
    fireEvent.click(viewButton);

    await waitFor(() => {
      expect(screen.getByText('Change Transaction Detail')).toBeInTheDocument();
      expect(screen.getByText('Pieces Produced (Life)')).toBeInTheDocument();
      expect(screen.getAllByText('53,500').length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText('Installed Tool Code')).toBeInTheDocument();
      expect(screen.getByText('Tool Condition')).toBeInTheDocument();
      expect(screen.getByText('Production Output Derivation')).toBeInTheDocument();
      expect(screen.getByText(/Pieces produced by this machine during this tool run/)).toBeInTheDocument();
    });
  });
});
