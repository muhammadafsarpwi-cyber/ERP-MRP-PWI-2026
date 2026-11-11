import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import StoreIssues from './StoreIssues';
import apiService from '../../services/api';

const renderWithRouter = (ui: React.ReactElement) => {
  return render(<MemoryRouter initialEntries={['/store/material-issues']}>{ui}</MemoryRouter>);
};

jest.mock('../../services/api');
const mockedApi = apiService as jest.Mocked<typeof apiService>;

jest.mock('../../hooks/usePermission', () => ({
  usePermission: () => ({
    can: () => true,
    hasRole: () => true,
  }),
}));

beforeAll(() => {
  window.matchMedia =
    window.matchMedia ||
    function (query: string) {
      return {
        matches: false,
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      };
    };
});

describe('StoreIssues Component', () => {
  const mockStores = [
    {
      id: 'd0000000-0000-0000-0000-000000000001',
      storeCode: 'SPI-GS-STORE',
      storeName: 'SPI General Store',
      storeType: 'GENERAL',
      divisionId: 'div-1',
      sectionId: 'sec-1',
      departmentId: 'dept-1',
    },
    {
      id: 'd0000000-0000-0000-0000-000000000002',
      storeCode: 'CCD-GS-STORE',
      storeName: 'CCD General Store',
      storeType: 'GENERAL',
      divisionId: 'div-2',
      sectionId: 'sec-2',
      departmentId: 'dept-2',
    },
  ];

  const mockDivisions = [
    { id: 'div-1', divisionCode: 'SPD', name: 'Spoke Division' },
  ];

  const mockSections = [
    { id: 'sec-1', sectionCode: 'SEC-01', name: 'Spoke Production Section', divisionId: 'div-1' },
  ];

  const mockDepartments = [
    { id: 'dept-1', departmentCode: 'DEPT-01', name: 'Heading & Threading', divisionId: 'div-1', sectionId: 'sec-1' },
  ];

  const mockIssues = [
    {
      id: 'issue-1',
      issueNumber: 'MI-2026-0001',
      issueDate: '2026-11-10',
      storeId: 'd0000000-0000-0000-0000-000000000001',
      storeName: 'SPI General Store',
      purpose: 'Tooling replacement for Heading machine',
      referenceDocument: 'Machine: SPK-01 — Spoke Machine 01',
      remarks: 'Replaced worn bearing and punch tool',
      status: 'DRAFT',
    },
    {
      id: 'issue-2',
      issueNumber: 'MI-2026-0002',
      issueDate: '2026-11-10',
      storeId: 'd0000000-0000-0000-0000-000000000001',
      storeName: 'SPI General Store',
      purpose: 'Monthly lubrication',
      referenceDocument: 'General / Non-Machine Allocation',
      remarks: 'Hydraulic oil 68',
      status: 'POSTED',
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();

    mockedApi.get.mockImplementation((url: string, params?: any) => {
      if (url.includes('/store/stores')) {
        return Promise.resolve(mockStores as any);
      }
      if (url.includes('/divisions')) {
        return Promise.resolve({ data: mockDivisions } as any);
      }
      if (url.includes('/sections')) {
        return Promise.resolve({ data: mockSections } as any);
      }
      if (url.includes('/departments')) {
        return Promise.resolve({ data: mockDepartments } as any);
      }
      if (url.includes('/store/material-issues')) {
        return Promise.resolve(mockIssues as any);
      }
      if (url.includes('/machines')) {
        return Promise.resolve([
          { id: 'mch-1', machineCode: 'SPK-01', machineName: 'Spoke Machine 01', machineType: 'Heading' },
        ] as any);
      }
      if (url.includes('/master-data/items')) {
        return Promise.resolve({ data: [] } as any);
      }
      if (url.includes('/master-data/uom')) {
        return Promise.resolve({ data: [] } as any);
      }
      return Promise.resolve([] as any);
    });
  });

  it('renders Material Issues table with issues, stores, and machine allocation', async () => {
    renderWithRouter(<StoreIssues />);

    await waitFor(() => {
      expect(screen.getByText('MI-2026-0001')).toBeInTheDocument();
      expect(screen.getByText('MI-2026-0002')).toBeInTheDocument();
    });

    // Check store names and purpose
    expect(screen.getByText('Tooling replacement for Heading machine')).toBeInTheDocument();
    expect(screen.getByText('SPK-01 — Spoke Machine 01')).toBeInTheDocument();
    expect(screen.getByText('DRAFT')).toBeInTheDocument();
    expect(screen.getByText('POSTED')).toBeInTheDocument();
  });

  it('allows opening New Material Issue modal with destination hierarchy and machine', async () => {
    renderWithRouter(<StoreIssues />);

    await waitFor(() => {
      expect(screen.getByText('New Material Issue')).toBeInTheDocument();
    });

    const newBtn = screen.getByText('New Material Issue').closest('button')!;
    fireEvent.click(newBtn);

    await waitFor(() => {
      expect(screen.getByText('1. Division & Source Store Header')).toBeInTheDocument();
      expect(screen.getByText('2. Destination Department & Machine Allocation')).toBeInTheDocument();
      expect(screen.getByText(/Machine \/ Equipment Selection/i)).toBeInTheDocument();
    });
  });

  it('provides delete action for DRAFT and CANCELLED material issues', async () => {
    renderWithRouter(<StoreIssues />);

    await waitFor(() => {
      expect(screen.getByText('MI-2026-0001')).toBeInTheDocument();
    });

    const deleteButtons = screen.getAllByRole('button', { name: /delete/i });
    expect(deleteButtons.length).toBeGreaterThan(0);
  });
});
