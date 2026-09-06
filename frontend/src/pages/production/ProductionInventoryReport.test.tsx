import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import ProductionInventoryReport from './ProductionInventoryReport';
import apiService from '../../services/api';
import dashboardService from '../../services/dashboardService';

jest.mock('../../services/api');

const apiMock = apiService as jest.Mocked<typeof apiService>;

const ITEM_ID = 'c1000000-0000-4000-8000-000000000005';

const reportRow = {
  itemId: ITEM_ID,
  itemCode: 'RM-WIRE-120',
  itemName: '1.20mm Wire [SAMPLE]',
  itemType: 'RAW_MATERIAL',
  uomCode: 'M',
  wireSizeMm: 1.2,
  thicknessMm: null,
  widthMm: null,
  divisionId: 'div-1',
  divisionName: 'Wire Division',
  sectionName: null,
  departmentId: 'dept-1',
  departmentName: 'Wire Drawing',
  openingBalance: 40,
  totalIn: 10,
  totalOut: 60,
  scrapOut: 2,
  consumed: 60,
  produced: 10,
  required: 15,
  closingBalance: -10,
  onHand: 5,
  reserved: 2,
  available: 3,
  lastMovementDate: '2026-09-01T08:00:00.000Z',
  movementType: 'PRODUCTION_ISSUE',
  shortage: 10,
  status: 'SHORT',
  reconciled: true,
  flow: {
    source: null,
    consumers: [{ itemId: 'c2', itemCode: 'FLAT-WIRE-001', itemName: 'Flat Wire', inScope: true }],
    flowStatus: 'SOURCE',
  },
};

const reportResponse = {
  data: {
    filters: { movementTypes: [{ value: 'PRODUCTION_ISSUE', label: 'Issue to Production' }, { value: 'PRODUCTION_RECEIPT', label: 'Receipt from Production' }] },
    summary: {
      itemCount: 1, onHand: 5, reserved: 2, available: 3,
      totalIn: 10, totalOut: 60, scrapOut: 2, consumed: 60, produced: 10, required: 15,
      shortItems: 1, wipItems: 0, reconciledItems: 1, flowSourceItems: 1, flowChainItems: 0, flowConsumersPresent: 1,
      movementTypes: [{ value: 'PRODUCTION_ISSUE', label: 'Issue to Production' }],
    },
    items: [reportRow],
  },
};

const ledgerResponse = {
  data: {
    item: {
      id: ITEM_ID, itemCode: 'RM-WIRE-120', name: '1.20mm Wire [SAMPLE]', itemType: 'RAW_MATERIAL',
      wireSizeMm: 1.2, thicknessMm: null, widthMm: null,
      uom: { id: 'uom-1', code: 'M', name: 'Meter' },
      department: { id: 'dept-1', name: 'Wire Drawing' },
      division: { id: 'div-1', name: 'Wire Division' },
      section: null,
    },
    openingBalance: 40,
    rows: [
      { id: 'row-1', transactionDate: '2026-09-01T08:00:00.000Z', transactionType: 'PRODUCTION_RECEIPT', direction: 'IN', quantity: 10, item: { id: ITEM_ID, itemCode: 'RM-WIRE-120', name: '1.20mm Wire [SAMPLE]' }, warehouse: { id: 'wh-1', warehouseCode: 'WIP-CCD', name: 'WIP CCD' }, uom: { id: 'uom-1', code: 'M' }, batch: null, division: { id: 'div-1', name: 'Wire Division' }, section: null, department: { id: 'dept-1', name: 'Wire Drawing' }, referenceType: 'production_entry', referenceId: 'pe-1', referenceNumber: 'PE-2026-00001', notes: null, runningBalance: 50 },
      { id: 'row-2', transactionDate: '2026-09-02T08:00:00.000Z', transactionType: 'PRODUCTION_ISSUE', direction: 'OUT', quantity: 60, item: { id: ITEM_ID, itemCode: 'RM-WIRE-120', name: '1.20mm Wire [SAMPLE]' }, warehouse: { id: 'wh-1', warehouseCode: 'WIP-CCD', name: 'WIP CCD' }, uom: { id: 'uom-1', code: 'M' }, batch: null, division: { id: 'div-1', name: 'Wire Division' }, section: null, department: { id: 'dept-1', name: 'Wire Drawing' }, referenceType: 'production_entry', referenceId: 'pe-2', referenceNumber: 'PE-2026-00002', notes: null, runningBalance: -10 },
    ],
    closingBalance: -10,
    totalIn: 10,
    totalOut: 60,
    truncated: false,
    totalLedgerRows: 2,
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

describe('Production Inventory Report', () => {
  beforeEach(() => {
    jest.spyOn(dashboardService, 'getFilterDivisions').mockResolvedValue({ success: true, data: [{ id: 'div-1', name: 'Wire Division' }] });
    jest.spyOn(dashboardService, 'getFilterDepartments').mockResolvedValue({ success: true, data: [{ id: 'dept-1', name: 'Wire Drawing' }] });
    apiMock.get.mockReset();
    apiMock.get.mockImplementation((url: any) => {
      const u = String(url);
      if (u === '/production/inventory-report/movement-types') return Promise.resolve({ data: [{ value: 'PRODUCTION_ISSUE', label: 'Issue to Production' }] });
      if (u === `/production/inventory-report/${ITEM_ID}/ledger`) return Promise.resolve(ledgerResponse);
      if (u === '/production/inventory-report') return Promise.resolve(reportResponse);
      return Promise.resolve({ data: [] });
    });
  });

  it('loads the real report endpoint on mount with no broken lookup paths', async () => {
    render(
      <MemoryRouter>
        <ProductionInventoryReport />
      </MemoryRouter>
    );
    await waitFor(() => expect(apiMock.get).toHaveBeenCalledWith(expect.stringContaining('/production/inventory-report'), expect.anything()));
    const urls = (apiMock.get as jest.Mock).mock.calls.map((c: any[]) => String(c[0]));
    expect(urls).toContain('/production/inventory-report/movement-types');
    expect(urls.filter((u) => u === '/production/inventory-report').length).toBeGreaterThanOrEqual(1);
    expect(urls).not.toContain('/items');
  });

  it('renders the item row with real balance figures and a SHORT shortage', async () => {
    render(
      <MemoryRouter>
        <ProductionInventoryReport />
      </MemoryRouter>
    );
    expect(await screen.findByText('RM-WIRE-120')).toBeInTheDocument();
    expect(screen.getByText('1.20mm Wire [SAMPLE]')).toBeInTheDocument();
    expect(screen.getByText('Wire Drawing')).toBeInTheDocument();
    expect(screen.getAllByText('SHORT').length).toBeGreaterThan(0);
  });

  it('loads recognized movement types from the real movement-types endpoint into the filter', async () => {
    render(
      <MemoryRouter>
        <ProductionInventoryReport />
      </MemoryRouter>
    );
    const movementSelect = await screen.findByText('All Movements');
    fireEvent.mouseDown(movementSelect);
    await waitFor(() => expect(screen.getAllByText('Issue to Production').length).toBeGreaterThan(0));
  });

  it('opens the stock-ledger drill-down on row click and shows running balances', async () => {
    render(
      <MemoryRouter>
        <ProductionInventoryReport />
      </MemoryRouter>
    );
    await screen.findByText('RM-WIRE-120');
    fireEvent.click(screen.getByText('RM-WIRE-120'));
    await waitFor(() => expect(apiMock.get).toHaveBeenCalledWith(`/production/inventory-report/${ITEM_ID}/ledger`, expect.anything()));
    const wips = await screen.findAllByText(/WIP CCD/i);
    expect(wips.length).toBeGreaterThan(0);
    expect(await screen.findByText('RM-WIRE-120 — 1.20mm Wire [SAMPLE]')).toBeInTheDocument();
    expect(await screen.findByText('PE-2026-00002')).toBeInTheDocument();
  });

  it('TASK39-G/I: shows the flow chain and reconciled balance badge, and exposes the chain in the ledger drill-down', async () => {
    render(
      <MemoryRouter>
        <ProductionInventoryReport />
      </MemoryRouter>
    );
    await screen.findByText('RM-WIRE-120');
    // Flow column: raw source item feeds FLAT-WIRE-001; Balance column: OK badge.
    expect(screen.getAllByText('FLAT-WIRE-001').length).toBeGreaterThan(0);
    expect(screen.getAllByText('OK').length).toBeGreaterThan(0);
    // Chain Items summary card reflects the mocked flow.
    expect(screen.getByText('Chain Items')).toBeInTheDocument();

    fireEvent.click(screen.getByText('RM-WIRE-120'));
    await screen.findByText('RM-WIRE-120 — 1.20mm Wire [SAMPLE]');
    // The drill-down modal surfaces the flow chain (SOURCE + downstream consumer).
    expect(screen.getAllByText('SOURCE').length).toBeGreaterThan(0);
    expect(screen.getAllByText('FLAT-WIRE-001').length).toBeGreaterThan(0);
  });

  it('shows empty state when the filter matches no items', async () => {
    apiMock.get.mockImplementation((url: any) => {
      const u = String(url);
      if (u === '/production/inventory-report/movement-types') return Promise.resolve({ data: [] });
      if (u === '/production/inventory-report') return Promise.resolve({ data: { filters: { movementTypes: [] }, summary: { itemCount: 0, onHand: 0, reserved: 0, available: 0, totalIn: 0, totalOut: 0, scrapOut: 0, consumed: 0, produced: 0, required: 0, shortItems: 0, wipItems: 0, movementTypes: [] }, items: [] } });
      return Promise.resolve({ data: [] });
    });
    render(
      <MemoryRouter>
        <ProductionInventoryReport />
      </MemoryRouter>
    );
    expect(await screen.findByText(/No inventory data for this selection/i)).toBeInTheDocument();
  });
});