import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import DashboardFilters from './DashboardFilters';
import TopCustomersRow, { clearTopCustomersCache } from './TopCustomersRow';
import {
  DATE_RANGE_PRESET_OPTIONS,
  dateRangePresetToFilters,
} from './dashboardShared';
import dashboardService from '../../services/dashboardService';

jest.mock('../../services/dashboardService', () => ({
  __esModule: true,
  default: {
    getSalesTopCustomers: jest.fn(),
  },
}));

const mockedGetSalesTopCustomers = dashboardService.getSalesTopCustomers as jest.Mock;

beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });
});

describe('Dashboard DATE_RANGE_PRESET_OPTIONS & DashboardFilters', () => {
  it('excludes L.E / lastEntry and supports This Month, Last Month, This Quarter, This Year, Custom', () => {
    const values = DATE_RANGE_PRESET_OPTIONS.map((o) => o.value);
    const labels = DATE_RANGE_PRESET_OPTIONS.map((o) => o.label);

    expect(values).not.toContain('lastEntry');
    expect(labels.some((l) => /L\.E|Last Entry/i.test(l))).toBe(false);
    expect(values).toEqual(
      expect.arrayContaining(['thisMonth', 'lastMonth', 'thisQuarter', 'thisYear', 'custom']),
    );

    const thisYear = dateRangePresetToFilters('thisYear');
    const now = new Date();
    const fyStartYear = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
    expect(thisYear.dateFrom).toBe(`${fyStartYear}-07-01`);
    expect(thisYear.dateTo).toBe(`${fyStartYear + 1}-06-30`);

    const thisQuarter = dateRangePresetToFilters('thisQuarter');
    expect(thisQuarter.dateFrom).toBeTruthy();
    expect(thisQuarter.dateTo).toBeTruthy();
  });

  it('does not render L.E button in top bar or filter drawer', () => {
    render(
      <DashboardFilters
        divisions={[{ id: 'div-spi', divisionCode: 'DIV-001-SPI', name: 'Spoke Division' }]}
        sections={[]}
        departments={[]}
        shifts={[]}
        machines={[]}
        filters={{}}
        appliedFilters={{}}
        optionsLoading={false}
        dateRangePreset="thisMonth"
        lastEntryDate="2026-11-21"
        onChange={jest.fn()}
        onDateRangeChange={jest.fn()}
        onApply={jest.fn()}
        onReset={jest.fn()}
        onRemove={jest.fn()}
      />,
    );

    expect(screen.queryByText(/L\.E/i)).not.toBeInTheDocument();

    // Open filter drawer and confirm no L.E shortcut inside drawer either
    fireEvent.click(screen.getByRole('button', { name: /Filters/i }));
    expect(screen.queryByText(/L\.E/i)).not.toBeInTheDocument();
    expect(screen.getByText('Division')).toBeInTheDocument();
  });
});

describe('TopCustomersRow', () => {
  beforeEach(() => {
    clearTopCustomersCache();
    jest.clearAllMocks();
  });

  it('displays Total Order Load (prior open pending + new orders), Sold, Bal, and Remaining % inside ring', async () => {
    mockedGetSalesTopCustomers.mockResolvedValue({
      success: true,
      data: {
        summary: {
          priorOpenPendingGross: 40050,
          priorOpenOrdersCount: 9,
          periodNewOrdersGross: 21271,
          periodNewOrdersCount: 12,
          totalOrderLoadGross: 61321,
          totalSoldGross: 16420,
          totalSoldCartons: 1642,
          remainingBalanceGross: 44901,
          remainingPct: 73,
          fulfillmentPct: 27,
          committedOrdersCount: 21,
          dateFrom: '2026-11-01',
          dateTo: '2026-11-22',
          divisionId: 'div-spi',
        },
        topCustomers: [
          {
            id: 'c1',
            code: 'CUS-CFP-001',
            name: 'CROWN FIT PAKISTAN',
            salesGross: 7700,
            cartons: 770,
            sharePct: 50,
            rank: 1,
            deliveryCount: 3,
          },
          {
            id: 'c2',
            code: 'CUS-ASA-005',
            name: 'ALI SHAH AUTOS',
            salesGross: 7060,
            cartons: 706,
            sharePct: 46,
            rank: 2,
            deliveryCount: 10,
          },
          {
            id: 'c3',
            code: 'CUS-AUF-021',
            name: 'Auto Fit',
            salesGross: 700,
            cartons: 70,
            sharePct: 4,
            rank: 3,
            deliveryCount: 1,
          },
        ],
      },
    });

    render(
      <MemoryRouter>
        <TopCustomersRow
          dateRangePreset="thisMonth"
          appliedFilters={{
            divisionId: 'div-spi',
            dateFrom: '2026-11-01',
            dateTo: '2026-11-22',
          }}
          divisionLabel="Spoke Division"
        />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(mockedGetSalesTopCustomers).toHaveBeenCalledWith({
        dateFrom: '2026-11-01',
        dateTo: '2026-11-22',
        divisionId: 'div-spi',
      });
    });

    expect(await screen.findByText('Total Order Load')).toBeInTheDocument();
    expect(screen.getByText(/Prior: 40,050 \+ New: 21,271 GRS/)).toBeInTheDocument();
    expect(screen.getByText(/Ord: 61,321 GRS/)).toBeInTheDocument();
    expect(screen.getByText(/Sold: 16,420 GRS/)).toBeInTheDocument();
    expect(screen.getByText(/Bal: 44,901 GRS/)).toBeInTheDocument();
    expect(screen.getByText('73%')).toBeInTheDocument();
    expect(screen.getByText('Remaining')).toBeInTheDocument();

    expect(screen.getByTestId('top-customers-period-badge')).toHaveTextContent(
      'November 2026 Sales & Orders',
    );
    expect(screen.getByTestId('top-customers-division-badge')).toHaveTextContent('Spoke Division');
    expect(screen.getByText('CROWN FIT PAKISTAN')).toBeInTheDocument();
    expect(screen.getByText('ALI SHAH AUTOS')).toBeInTheDocument();
    expect(screen.getByText('Auto Fit')).toBeInTheDocument();
  });

  it('updates period badge & customer list dynamically when switching DATE RANGE & division and shows honest empty state when zero', async () => {
    mockedGetSalesTopCustomers.mockResolvedValue({
      success: true,
      data: {
        summary: {
          priorOpenPendingGross: 48597,
          priorOpenOrdersCount: 9,
          periodNewOrdersGross: 26737,
          periodNewOrdersCount: 5,
          totalOrderLoadGross: 75334,
          totalSoldGross: 35283,
          totalSoldCartons: 3528,
          remainingBalanceGross: 40051,
          remainingPct: 53,
          fulfillmentPct: 47,
          committedOrdersCount: 14,
          dateFrom: '2026-10-01',
          dateTo: '2026-10-31',
          divisionId: 'div-spi',
        },
        topCustomers: [
          {
            id: 'c1',
            code: 'CUS-CFP-001',
            name: 'CROWN FIT PAKISTAN',
            salesGross: 19500,
            cartons: 1950,
            sharePct: 56,
            rank: 1,
            deliveryCount: 6,
          },
          {
            id: 'c3-oct',
            code: 'CUS-PTL-002',
            name: 'Panther Tyres Ltd',
            salesGross: 4500,
            cartons: 450,
            sharePct: 13,
            rank: 2,
            deliveryCount: 1,
          },
        ],
      },
    });

    const { rerender } = render(
      <MemoryRouter>
        <TopCustomersRow
          dateRangePreset="lastMonth"
          appliedFilters={{
            divisionId: 'div-spi',
            dateFrom: '2026-10-01',
            dateTo: '2026-10-31',
          }}
          divisionLabel="Spoke Division"
        />
      </MemoryRouter>,
    );

    expect(await screen.findByText('Panther Tyres Ltd')).toBeInTheDocument();
    expect(screen.getByTestId('top-customers-period-badge')).toHaveTextContent(
      'Last Month Sales & Orders (Oct 2026)',
    );

    // Switch to Control Cable Division with zero dispatches
    mockedGetSalesTopCustomers.mockResolvedValueOnce({
      success: true,
      data: {
        summary: {
          priorOpenPendingGross: 0,
          priorOpenOrdersCount: 0,
          periodNewOrdersGross: 0,
          periodNewOrdersCount: 0,
          totalOrderLoadGross: 0,
          totalSoldGross: 0,
          totalSoldCartons: 0,
          remainingBalanceGross: 0,
          remainingPct: 0,
          fulfillmentPct: 0,
          committedOrdersCount: 0,
          dateFrom: '2026-10-01',
          dateTo: '2026-12-31',
          divisionId: 'div-ccd',
        },
        topCustomers: [],
      },
    });

    rerender(
      <MemoryRouter>
        <TopCustomersRow
          dateRangePreset="thisQuarter"
          appliedFilters={{
            divisionId: 'div-ccd',
            dateFrom: '2026-10-01',
            dateTo: '2026-12-31',
          }}
          divisionLabel="Control Cable Division"
        />
      </MemoryRouter>,
    );

    expect(await screen.findByTestId('top-customers-empty-card')).toBeInTheDocument();
    expect(screen.getByTestId('top-customers-period-badge')).toHaveTextContent(
      'This Quarter Sales & Orders (Q2 FY 2026–27 · Oct – Dec 2026)',
    );
    expect(screen.getByTestId('top-customers-division-badge')).toHaveTextContent(
      'Control Cable Division',
    );
    expect(screen.queryByText('CROWN FIT PAKISTAN')).not.toBeInTheDocument();
  });
});
