import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import StoreIssues from './StoreIssues';
import { formatPartHistorySummary } from './components/StoreLineItemsEditor';
import { storeIssuesCache } from './storeIssuesCache';
import { buildStoreIssuesCsv, buildStoreIssuesXlsxBlob } from '../../utils/storeIssueExport';
import { useHeaderActions } from '../../components/layout/headerActionsStore';
import apiService from '../../services/api';

const HeaderExtraHost: React.FC = () => {
  const extra = useHeaderActions(
    (s) => s.tabMetaMap['/store/material-issues']?.extra ?? s.extra,
  );
  return <div data-testid="main-header-extra">{extra}</div>;
};

const renderWithRouter = (ui: React.ReactElement) => {
  return render(
    <MemoryRouter initialEntries={['/store/material-issues']}>
      <HeaderExtraHost />
      {ui}
    </MemoryRouter>,
  );
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
    storeIssuesCache.invalidateAll();

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

  it('allows opening Create Store Issue Note modal with destination hierarchy and machine', async () => {
    renderWithRouter(<StoreIssues />);

    await waitFor(() => {
      expect(screen.getByText('Create Store Issue Note')).toBeInTheDocument();
    });

    const newBtn = screen.getByText('Create Store Issue Note').closest('button')!;
    fireEvent.click(newBtn);

    await waitFor(() => {
      expect(screen.getByText('1. Division & Source Store Header')).toBeInTheDocument();
      expect(screen.getByText('2. Destination Department, Machine & Receiving Personnel')).toBeInTheDocument();
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

  it('renders Print View, Export Excel, Refresh, Columns, and compact row icon actions', async () => {
    renderWithRouter(<StoreIssues />);

    await waitFor(() => {
      expect(screen.getByText('MI-2026-0001')).toBeInTheDocument();
    });

    expect(screen.getByRole('button', { name: /Print View/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Export Excel/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Refresh/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Columns/i })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /Create Store Issue Note/i })).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: /View Details/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: /Edit SIN/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: /Print SIN Slip/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: /Download PDF/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: /Share via WhatsApp/i }).length).toBeGreaterThan(0);
  });

  it('includes WhatsApp sharing button inside Create Store Issue Note modal', async () => {
    renderWithRouter(<StoreIssues />);

    await waitFor(() => {
      expect(screen.getByText('Create Store Issue Note')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Create Store Issue Note').closest('button')!);

    await waitFor(() => {
      expect(screen.getByText('1. Division & Source Store Header')).toBeInTheDocument();
    });

    const waButtons = screen.getAllByRole('button', { name: /WhatsApp/i });
    expect(waButtons.length).toBeGreaterThanOrEqual(1);
  });

  it('formats part-machine lifecycle history summary cleanly with GRS & PCS equivalents', () => {
    expect(
      formatPartHistorySummary({ hasPreviousIssue: false }),
    ).toBe('First time issuing this part to this machine');

    expect(
      formatPartHistorySummary({ hasPreviousIssue: false, lookupError: true }),
    ).toBe('Unable to verify previous issue history for this machine');

    expect(
      formatPartHistorySummary({
        hasPreviousIssue: true,
        lastIssueVoucherNo: 'SIN-2026-00412',
        lastIssueDate: '2026-11-18',
        lastIssueQty: 1,
        lastIssueUom: 'SET',
        totalIssuesToMachine: 3,
        pcsPerGross: 144,
        productionSinceLastIssue: {
          entryCount: 12,
          totalQty: 208800,
          uomCode: 'PCS',
          totalPcsQty: 208800,
          totalGrossQty: 1450,
          totalWeightKg: 1044,
        },
      }),
    ).toBe(
      'Last Issued: 18-Nov-2026 (SIN-2026-00412 · 1 SET) · Production Since Last Issue: 1,450 GRS (208,800 PCS) · Total Issues: 3',
    );
  });

  it('builds valid Excel (.xlsx) and CSV export files for filtered SIN records', () => {
    const sampleRows = [
      {
        issueNumber: 'SIN-20261016-65057',
        issueDate: '2026-10-16',
        status: 'POSTED',
        divisionName: 'Spoke Division',
        storeName: 'SPI General Store',
        sectionName: 'Spoke Production Section',
        departmentName: 'Heading & Threading',
        machineAllocation: 'SPK-01 — Spoke Machine SPK-01',
        operatorName: 'H.M.Sajeel',
        shiftInchargeName: 'Muhammad Junaid',
        storeInchargeName: 'Store Keeper',
        totalOldReturnedQty: 1,
        purpose: 'Die Replacement',
        lines: [
          {
            lineNumber: 1,
            itemCode: 'SP-216021',
            itemName: 'SPOKE THREADING ROLLING DIE (10G 3.2) 40G',
            quantity: 1,
            uomCode: 'SET',
            oldItemReturnedQty: 1,
          },
        ],
      },
    ];
    const xlsxBlob = buildStoreIssuesXlsxBlob(sampleRows);
    expect(xlsxBlob.size).toBeGreaterThan(200);
    expect(xlsxBlob.type).toContain('spreadsheetml.sheet');

    const csv = buildStoreIssuesCsv(sampleRows);
    expect(csv).toContain('SIN-20261016-65057');
    expect(csv).toContain('H.M.Sajeel');
  });
});
