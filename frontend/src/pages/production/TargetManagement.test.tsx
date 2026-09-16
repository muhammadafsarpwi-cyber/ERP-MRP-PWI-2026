import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import TargetManagement from './TargetManagement';
import apiService from '../../services/api';
import { useHeaderActions } from '../../components/layout/headerActionsStore';

const TestLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const extra = useHeaderActions((s) => s.extra);
  return (
    <div>
      <div data-testid="header-actions">{extra}</div>
      {children}
    </div>
  );
};

jest.mock('../../services/api');

const apiMock = apiService as jest.Mocked<typeof apiService>;

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

describe('TargetManagement - 2027 UX & Item Code Resolution', () => {
  const mockMachine = {
    id: 'mch-1',
    machineCode: 'FT-02',
    name: 'Flattening Machine FT-02',
    status: 'ACTIVE',
    division: { id: 'div-1', name: 'Control Cable Division' },
    section: { id: 'sec-1', name: 'Spiral' },
    department: { id: 'dep-1', name: 'Flattening' },
  };

  const mockShift = {
    id: 'shift-1',
    shiftCode: 'SHIFT-A',
    name: 'Shift A (Morning)',
    plannedHours: 8,
  };

  const mockUom = {
    id: 'uom-kg',
    code: 'KG',
    name: 'Kilogram',
  };

  const mockItem = {
    id: '8fea1057-ed7b-4150-8cd9-89ca986fec20',
    itemCode: 'FLAT-WIRE-003',
    name: 'Flat Wire T 0.55 × W 3.40 mm',
    status: 'ACTIVE',
    isActive: true,
    baseUomId: 'uom-kg',
  };

  const mockTarget = {
    id: 'target-1',
    companyId: 'comp-1',
    machineId: 'mch-1',
    shiftId: 'shift-1',
    itemId: '8fea1057-ed7b-4150-8cd9-89ca986fec20',
    uomId: 'uom-kg',
    standardHours: '8',
    targetQuantity: '140',
    effectiveFrom: '2026-09-01',
    status: 'ACTIVE',
    machine: mockMachine,
    shift: mockShift,
    uom: mockUom,
    item: mockItem,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    apiMock.get.mockImplementation((url: string, params?: any) => {
      if (url === '/production/machine-targets') {
        return Promise.resolve({ data: [mockTarget], total: 1, page: 1, limit: 10 }) as any;
      }
      if (url === '/machines') {
        return Promise.resolve({ data: [mockMachine] }) as any;
      }
      if (url === '/production/shifts') {
        return Promise.resolve({ data: [mockShift] }) as any;
      }
      if (url === '/divisions') return Promise.resolve({ data: [] }) as any;
      if (url === '/sections') return Promise.resolve({ data: [] }) as any;
      if (url === '/departments') return Promise.resolve({ data: [] }) as any;
      if (url === '/master-data/uom') {
        return Promise.resolve({ data: [mockUom] }) as any;
      }
      if (url === '/master-data/items') {
        return Promise.resolve({ data: [mockItem] }) as any;
      }
      return Promise.resolve({ data: [] }) as any;
    });
  });

  it('fetches items with high limit (10000) so all items in master data load', async () => {
    render(
      <MemoryRouter>
        <TargetManagement />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(apiMock.get).toHaveBeenCalledWith('/master-data/items', { limit: 10000, status: 'ACTIVE' });
    });
  });

  it('renders the Item column with Item Code and Item Name instead of raw UUID in table', async () => {
    render(
      <MemoryRouter>
        <TargetManagement />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('FLAT-WIRE-003')).toBeInTheDocument();
      expect(screen.getByText('Flat Wire T 0.55 × W 3.40 mm')).toBeInTheDocument();
    });
  });

  it('displays 2027 UX badge and modern features in Import Modal', async () => {
    render(
      <MemoryRouter>
        <TestLayout>
          <TargetManagement />
        </TestLayout>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('FLAT-WIRE-003')).toBeInTheDocument();
    });

    // Find and click the Import button in header actions
    const importBtn = await screen.findByRole('button', { name: /import/i });
    fireEvent.click(importBtn);

    // Modal title and 2027 UX badge should be visible
    expect(await screen.findByText('Import Machine Targets')).toBeInTheDocument();
    expect(screen.getByText(/2027 UX/i)).toBeInTheDocument();
  });

  it('displays Item Code and Name in Edit Target modal and Live Preview instead of raw UUID', async () => {
    render(
      <MemoryRouter>
        <TargetManagement />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('FLAT-WIRE-003')).toBeInTheDocument();
    });

    // Find the edit button in the row
    const editBtn = screen.getByRole('button', { name: /edit target/i });
    fireEvent.click(editBtn);

    // Modal title should appear
    expect(await screen.findByText('Edit Machine Target')).toBeInTheDocument();

    // The Item select should show the label with itemCode and name, NOT bare UUID
    await waitFor(() => {
      const selectLabel = screen.getAllByText(/FLAT-WIRE-003/i);
      expect(selectLabel.length).toBeGreaterThanOrEqual(1);
      // Raw UUID string should not be shown as the primary item select text
      expect(screen.queryByText('8fea1057-ed7b-4150-8cd9-89ca986fec20')).not.toBeInTheDocument();
    });
  });

  it('fetches all active targets with high limit (10000) for complete overlap validation', async () => {
    render(
      <MemoryRouter>
        <TargetManagement />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(apiMock.get).toHaveBeenCalledWith('/production/machine-targets', { limit: 10000, status: 'ACTIVE' });
    });
  });
});
