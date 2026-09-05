import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import Traceability from './Traceability';
import apiService from '../../services/api';

jest.mock('../../services/api');

const apiMock = apiService as jest.Mocked<typeof apiService>;

const ITEM_ID = 'c1000000-0000-4000-8000-000000000005';

const itemOption = {
  id: ITEM_ID,
  itemCode: 'RM-WIRE-120',
  name: '1.20mm Wire [SAMPLE]',
  itemType: 'RAW_MATERIAL',
  baseUomName: 'Meter',
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

function getCalls(): string[] {
  return (apiMock.get as jest.Mock).mock.calls.map((c: any[]) => String(c[0]));
}

const emptyOverview = {
  data: {
    item: { ...itemOption, uom: { code: 'M' }, division: { name: 'D1' }, section: { name: 'S1' }, department: { name: 'Dept1' } },
    currentBalance: { onHand: 0, reserved: 0, available: 0 },
  },
};

describe('Production Traceability report', () => {
  beforeEach(() => {
    apiMock.get.mockReset();
    apiMock.get.mockImplementation((url: any) => {
      const u = String(url);
      if (u === '/master-data/items') return Promise.resolve({ data: [itemOption] });
      if (u === `/production/traceability/item/${ITEM_ID}`) return Promise.resolve(emptyOverview);
      if (u === `/production/traceability/${ITEM_ID}/statement`) return Promise.resolve({ data: { openingBalance: 0, categories: {}, closingBalance: 0, currentBalance: { onHand: 0, reserved: 0, available: 0 }, reconciliation: { status: 'RECONCILED', inventoryBalance: 0, ledgerBalance: 0, difference: 0 } } });
      if (u === `/production/traceability/${ITEM_ID}/ledger`) return Promise.resolve({ data: [], total: 0 });
      if (u === `/production/traceability/${ITEM_ID}/history`) return Promise.resolve({ data: [], total: 0 });
      if (u === `/production/traceability/${ITEM_ID}/chain`) return Promise.resolve({ data: { hasRouting: false, nodes: [] } });
      if (u === '/production/traceability/wip') return Promise.resolve({ data: [], summary: { totalWipQuantity: 0, wipItemCount: 0, wipWarehouseCount: 0, departmentCount: 0, activeRecordCount: 0 }, context: { wipWarehousesFound: 0, wipWarehouses: [] } });
      if (u === '/production/traceability/department-wise') return Promise.resolve({ data: [] });
      return Promise.resolve({ data: [] });
    });
  });

  it('loads items on mount from the real master-data endpoint', async () => {
    render(
      <MemoryRouter>
        <Traceability />
      </MemoryRouter>
    );
    await waitFor(() => expect(getCalls()).toContain('/master-data/items'));
    expect(getCalls()).not.toContain('/items');
  });

  it('renders empty state before an item is selected', async () => {
    render(
      <MemoryRouter>
        <Traceability />
      </MemoryRouter>
    );
    expect(await screen.findByText(/No item selected/i)).toBeInTheDocument();
  });

  it('hits the real traceability endpoints (not broken lookups) when an item is selected', async () => {
    render(
      <MemoryRouter>
        <Traceability />
      </MemoryRouter>
    );
    await screen.findByText(/No item selected/i);

    const combobox = screen.getByRole('combobox');
    fireEvent.mouseDown(combobox);
    fireEvent.click(await screen.findByText(/RM-WIRE-120/i));

    await waitFor(() => expect(getCalls()).toContain(`/production/traceability/item/${ITEM_ID}`));
    expect(getCalls()).toContain(`/production/traceability/${ITEM_ID}/statement`);
    expect(getCalls()).toContain(`/production/traceability/${ITEM_ID}/ledger`);
    expect(getCalls()).toContain(`/production/traceability/${ITEM_ID}/history`);
    expect(getCalls()).toContain(`/production/traceability/${ITEM_ID}/chain`);
    expect(getCalls()).toContain('/production/traceability/wip');
    expect(getCalls()).toContain('/production/traceability/department-wise');

    expect(getCalls()).not.toContain('/items');
    expect(getCalls()).not.toContain('/admin/divisions');
    expect(getCalls()).not.toContain('/admin/sections');
    expect(getCalls()).not.toContain('/admin/departments');
  });
});
