import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { App } from 'antd';
import EntryDetail from './EntryDetail';
import apiService from '../../../services/api';

jest.mock('../../../services/api');

const apiMock: jest.Mocked<typeof apiService> = apiService as unknown as jest.Mocked<typeof apiService>;

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

const OUT_ITEM_ID = 'item-FLAT';
const RM_ITEM_ID = 'rm-WIRE';
const SOURCE_STORE = 'wh-ccd';
const OUT_WH = 'wh-main';

const entry = {
  id: 'entry-1',
  entryDate: '2026-09-11',
  division: { divisionCode: 'DIV1', name: 'Cables Division' },
  section: { name: 'Production Section' },
  department: { departmentCode: 'CCD-DEPT001', name: 'Flattening' },
  shiftId: 'shift-1',
  shift: { id: 'shift-1', name: 'A', startTime: '07:00', endTime: '15:00', plannedHours: 8 },
  machineNo: 'FT-04',
  operatorName: 'Asif',
  supervisorName: 'Supervisor One',
  itemId: OUT_ITEM_ID,
  item: {
    itemCode: 'FLAT-001',
    name: 'Flat Wire 1.20mm',
    wireSizeMm: 1.2,
    baseUom: { code: 'KG', symbol: 'kg' },
    productionInItem: { id: RM_ITEM_ID, itemCode: 'RM-WIRE-001', name: '1.20mm Wire', wireSizeMm: 1.2, itemType: 'RAW_MATERIAL' },
  },
  uom: { code: 'KG', symbol: 'kg' },
  targetQuantity: 50,
  actualQuantity: 48,
  achievementPercentage: 96,
  efficiencyPercentage: 87.5,
  runningHours: 7,
  downtimeHours: 0.5,
  downtimeReasonText: null,
  scrapQuantity: 2,
  coilSize: null,
  remarks: 'Demo entry',
  productionOrder: null,
  productionOrderOperationId: null,
  inventoryReferenceId: null,
  createdByUser: { fullName: 'Tester' },
  downtime: { plannedHours: 8 },
  downtimes: [{ id: 'dt-1', lineNumber: 1, downtimeReasonId: null, downtimeReasonText: 'Setup', downtimeReason: null, downtimeHours: 0.5, remarks: 'roll change' }],
  items: [
    { id: 'il-1', lineNumber: 1, itemId: OUT_ITEM_ID, item: { itemCode: 'FLAT-001', name: 'Flat Wire 1.20mm', wireSizeMm: 1.2, weightPerMeter: 0.1 }, uom: { code: 'KG', symbol: 'kg' }, targetQuantity: 50, actualQuantity: 48, scrapQuantity: 2, runningHours: 7, remarks: null },
  ],
  warehouseId: OUT_WH,
  rawMaterialWarehouseId: SOURCE_STORE,
  route: null,
};

const outBalances = [
  { id: 'bal-out', item: { id: OUT_ITEM_ID, name: 'Flat Wire 1.20mm', itemCode: 'FLAT-001' }, warehouse: { id: OUT_WH, name: 'Main Warehouse' }, onHand: 288, reserved: 0, available: 288, uom: { id: 'uom-kg', code: 'KG', name: 'Kilogram' } },
];

const inBalances = [
  { id: 'bal-in', item: { id: RM_ITEM_ID, name: '1.20mm Wire', itemCode: 'RM-WIRE-001' }, warehouse: { id: SOURCE_STORE, name: 'CCD Production Department Stores' }, onHand: 5000, reserved: 0, available: 5000, uom: { id: 'uom-kg', code: 'KG', name: 'Kilogram' } },
  { id: 'bal-in-other', item: { id: RM_ITEM_ID, name: '1.20mm Wire', itemCode: 'RM-WIRE-001' }, warehouse: { id: 'wh-other', name: 'Other Store' }, onHand: 90, reserved: 0, available: 90, uom: { id: 'uom-kg', code: 'KG', name: 'Kilogram' } },
];

function mockEntryApi(e: any, opts: { outBalances?: any[]; inBalances?: any[]; movements?: any[] } = {}) {
  apiMock.get.mockImplementation(async (url: any, params?: any) => {
    const u = String(url);
    if (u === '/production/entries/entry-1') return { success: true, data: e };
    if (u === '/inventory/reports/ledger') return { data: opts.movements ?? [] };
    if (u === '/inventory/balances') {
      if (params?.itemId === OUT_ITEM_ID) return { data: opts.outBalances ?? [] };
      if (params?.itemId === RM_ITEM_ID) return { data: opts.inBalances ?? [] };
      return { data: [] };
    }
    return { data: [] };
  });
}

function renderDetail(e: any, opts?: { outBalances?: any[]; inBalances?: any[]; movements?: any[] }) {
  mockEntryApi(e, opts);
  return render(
    <App>
      <MemoryRouter initialEntries={['/production/entries/entry-1']}>
        <Routes>
          <Route path="/production/entries/:id" element={<EntryDetail />} />
        </Routes>
      </MemoryRouter>
    </App>,
  );
}

describe('EntryDetail redesign (TASK #39 Part A)', () => {
  it('A1: renders the global header, KPI strip and all hierarchy sections in one screen', async () => {
    renderDetail(entry, { outBalances, inBalances });
    expect((await screen.findAllByText(/FLAT-001/)).length).toBeGreaterThan(0);

    // Global header identity: department + machine + date.
    expect(screen.getAllByText(/Flattening/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/FT-04/).length).toBeGreaterThan(0);

    // Compact KPI strip labels are present.
    for (const label of ['Target', 'Actual Good', 'Scrap', 'Achievement', 'Efficiency', 'Running']) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    }

    // Lettered hierarchy sections render.
    expect(screen.getByText('Production Context')).toBeInTheDocument();
    expect(screen.getByText('Production Summary')).toBeInTheDocument();
    expect(screen.getByText('Input Material & Raw Material Availability')).toBeInTheDocument();
    expect(screen.getByText('Material Flow')).toBeInTheDocument();
    expect(screen.getByText('Downtime Breakdown')).toBeInTheDocument();
    expect(screen.getByText('Production Route')).toBeInTheDocument();
    expect(screen.getByText('Linkages')).toBeInTheDocument();
    expect(screen.getByText('Remarks & Entry Metadata')).toBeInTheDocument();
    expect(screen.getByText('Inventory Posting Summary')).toBeInTheDocument();
    expect(screen.getByText('Inventory Movements & Reconciliation')).toBeInTheDocument();
  });

  it('A2: production summary shows target/actual/scrap + input material with the exact item', async () => {
    renderDetail(entry, { outBalances, inBalances });
    expect((await screen.findAllByText(/RM-WIRE-001/)).length).toBeGreaterThan(0);
    // Actual good + scrap: formatted without trailing zeros (48, 2), and they
    // appear in the KPI strip / summary / flow.
    expect(screen.getAllByText('48').length).toBeGreaterThan(0);
    expect(screen.getAllByText('2').length).toBeGreaterThan(0);
  });

  it('A3: input material renders "Input Material: Not configured" when the item has no production IN mapping', async () => {
    const noInput = {
      ...entry,
      item: { ...entry.item, productionInItem: null },
    };
    renderDetail(noInput);
    expect((await screen.findAllByText(/Input Material: Not configured/)).length).toBeGreaterThan(0);
    // No availability query fires for the missing input item (nothing to fetch).
    const balanceCalls = apiMock.get.mock.calls.filter((c) => c[0] === '/inventory/balances');
    expect(balanceCalls.map((c) => c[1]?.itemId)).not.toContain(RM_ITEM_ID);
  });

  it('A4: "Not posted to stock" and "Posted to stock" tags reflect the entry reference', async () => {
    renderDetail(entry, { outBalances, inBalances });
    expect(await screen.findByText(/Not posted to stock/)).toBeInTheDocument();

    const posted = { ...entry, inventoryReferenceId: 'ledger-abcdef123456' };
    renderDetail(posted, { outBalances, inBalances });
    expect(await screen.findByText(/Posted to stock/)).toBeInTheDocument();
  });
});

describe('EntryDetail — raw material availability at the exact source store (TASK #39 Part C)', () => {
  it('C1: reads the raw material balance from the productionInItem id and the entry source store', async () => {
    renderDetail(entry, { outBalances, inBalances });
    expect((await screen.findAllByText(/RM-WIRE-001/)).length).toBeGreaterThan(0);

    await waitFor(() => {
      // The output-item balances and the input-item balances are both fetched
      // scoped by the exact item ids (never by name/sku/wire-size/department).
      const calls = apiMock.get.mock.calls.filter((c) => c[0] === '/inventory/balances');
      expect(calls.map((c) => c[1] === undefined ? undefined : (c[1] as any)?.itemId)).toContain(OUT_ITEM_ID);
      expect(calls.map((c) => c[1] === undefined ? undefined : (c[1] as any)?.itemId)).toContain(RM_ITEM_ID);
    });

    // The real source-store availability (5000 KG — never fabricated and never
    // the 0 caused by querying a store where the item does not live).
    expect((await screen.findAllByText('5,000')).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/CCD Production Department Stores/).length).toBeGreaterThan(0);
  });

  it('C2: when the source store has a real balance the UI shows that number — never a fabricated zero', async () => {
    renderDetail(entry, { outBalances, inBalances });
    await waitFor(async () => expect((await screen.findAllByText('5,000')).length).toBeGreaterThan(0));
    // Stock parked in a different store (90) must NOT be reported as the source
    // store's availability — the exact store row wins.
    expect(screen.queryByText('90')).not.toBeInTheDocument();
  });

  it('C3: an entry with no inventory posting exposes the availability without crashes (no balances rows)', async () => {
    renderDetail({ ...entry, inventoryReferenceId: null }, { outBalances: [], inBalances: [inBalances[0]] });
    expect(await screen.findByText(/Not posted to stock/)).toBeInTheDocument();
    await waitFor(async () => expect((await screen.findAllByText('5,000')).length).toBeGreaterThan(0));
  });
});

describe('EntryDetail — coil size + real inventory reconciliation (TASK #41 Parts E/F/H)', () => {
  const postedEntry = { ...entry, inventoryReferenceId: 'ledger-abcdef123456' };
  const movements = [
    { id: 'l1', transactionDate: '2026-09-11T08:00:00', transactionType: 'PRODUCTION_RECEIPT', direction: 'IN', quantity: 48, notes: 'Output retrieved', item: { itemCode: 'FLAT-001', name: 'Flat Wire 1.20mm' }, warehouse: { name: 'Main Warehouse' }, uom: { code: 'KG' } },
    { id: 'l2', transactionDate: '2026-09-11T08:05:00', transactionType: 'PRODUCTION_SCRAP', direction: 'OUT', quantity: 2, notes: null, item: { itemCode: 'FLAT-001', name: 'Flat Wire 1.20mm' }, warehouse: { name: 'Main Warehouse' }, uom: { code: 'KG' } },
    { id: 'l3', transactionDate: '2026-09-11T08:10:00', transactionType: 'PRODUCTION_CONSUMPTION', direction: 'OUT', quantity: 50, notes: 'RM consumed', item: { itemCode: 'RM-WIRE-001', name: '1.20mm Wire' }, warehouse: { name: 'CCD Production Department Stores' }, uom: { code: 'KG' } },
  ];

  it('E1: fetches the entry stock-ledger rows scoped by referenceId (never the whole ledger)', async () => {
    renderDetail(postedEntry, { inBalances, movements });
    await screen.findByTestId('movements-section');
    await waitFor(() => {
      const calls = apiMock.get.mock.calls.filter((c) => c[0] === '/inventory/reports/ledger');
      expect(calls).toHaveLength(1);
      expect((calls[0][1] as any).referenceId).toBe('entry-1');
      expect((calls[0][1] as any).limit).toBe(200);
      expect((calls[0][1] as any).referenceType).toBe('PRODUCTION_ENTRY');
    });
  });

  it('E2: green "Inventory Reconciled" tag when every ledger IN/OUT matches the entry quantities', async () => {
    renderDetail(postedEntry, { inBalances, movements });
    const status = await screen.findByTestId('reconciliation-status');
    expect(status).toHaveTextContent('Inventory Reconciled');
    // The demand figure (48 good + 2 scrap) is reported as the expected consumption.
    expect(screen.getAllByText('50').length).toBeGreaterThan(0);
  });

  it('E3: red "Reconciliation Mismatch" when the ledger receipt does not equal actual good output', async () => {
    const mismatched = movements.map((m) => (m.transactionType === 'PRODUCTION_RECEIPT' ? { ...m, quantity: 47 } : m));
    renderDetail(postedEntry, { inBalances, movements: mismatched });
    const status = await screen.findByTestId('reconciliation-status');
    expect(status).toHaveTextContent('Reconciliation Mismatch');
  });

  it('E4: coil size renders on the production summary when set, without breaking the rest', async () => {
    renderDetail({ ...entry, coilSize: '1.20' }, { inBalances });
    expect(await screen.findByText('1.20')).toBeInTheDocument();
    expect(screen.getByText(/Coil Size/)).toBeInTheDocument();
  });

  it('E5: aggregate availability sums every ACTIVE store (source + other), independent of the source store row', async () => {
    renderDetail(entry, { inBalances });
    await screen.findByTestId('movements-section');
    await waitFor(() => expect(screen.getByText('5,090')).toBeInTheDocument());
    // The source-store number is still shown on its own row too.
    expect(screen.getAllByText('5,000').length).toBeGreaterThan(0);
  });

  it('E6: red aggregate-shortage alert when the whole company is below the consumption demand', async () => {
    const scarce = [
      { ...inBalances[0], onHand: 40, reserved: 0, available: 40 },
      { ...inBalances[1], onHand: 5, reserved: 0, available: 5 },
    ];
    renderDetail(postedEntry, { inBalances: scarce });
    const alert = await screen.findByTestId('aggregate-shortage-alert');
    expect(alert).toHaveTextContent('45');
    expect(alert).toHaveTextContent('50');
    expect(screen.queryByTestId('source-shortage-alert')).not.toBeInTheDocument();
  });

  it('E7: source-store shortage warns while other stores still cover the demand (warning, not error)', async () => {
    const storeScarce = [
      { ...inBalances[0], onHand: 20, reserved: 0, available: 20 },
      inBalances[1],
    ];
    renderDetail(postedEntry, { inBalances: storeScarce });
    const alert = await screen.findByTestId('source-shortage-alert');
    expect(alert).toHaveTextContent('20');
    expect(alert).toHaveTextContent('110');
    expect(screen.queryByTestId('aggregate-shortage-alert')).not.toBeInTheDocument();
  });

  it('E8: an entry that was never posted explains that no movements are expected (never a mismatch)', async () => {
    renderDetail(entry, { inBalances });
    expect(await screen.findByText(/not posted to inventory/)).toBeInTheDocument();
    const status = screen.getByTestId('reconciliation-status');
    expect(status).toHaveTextContent('No movements expected');
    expect(screen.queryByText(/Reconciliation Mismatch/)).not.toBeInTheDocument();
  });
});