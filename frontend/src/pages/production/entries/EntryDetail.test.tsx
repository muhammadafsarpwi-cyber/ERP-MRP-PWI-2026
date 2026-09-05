import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import EntryDetail from './EntryDetail';
import apiService from '../../../services/api';

jest.mock('../../../services/api');

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

const entry = {
  id: 'entry-1',
  entryDate: '2026-09-03',
  division: { divisionCode: 'D1', name: 'Division One' },
  section: { name: 'Section A' },
  department: { departmentCode: 'DEP-1', name: 'Dept One' },
  shift: { id: 's1', name: 'Shift A', startTime: '06:00', endTime: '14:00', plannedHours: 8 },
  machineNo: 'M-01',
  operatorName: 'John Doe',
  supervisorName: 'Jane Smith',
  itemId: 'item-1',
  item: { itemCode: 'ITM-1', name: 'Wire Coil 2.5', wireSizeMm: 2.5 },
  uom: { code: 'M', symbol: 'm' },
  targetQuantity: 1000,
  actualQuantity: 900,
  achievementPercentage: 90,
  efficiencyPercentage: 87.5,
  runningHours: 7,
  downtimeHours: 1,
  scrapQuantity: 20,
  remarks: 'Good shift',
  productionOrder: { id: 'po-1', orderNumber: 'PO-100' },
  productionOrderOperationId: null,
  inventoryReferenceId: null,
  createdByUser: { fullName: 'Admin User' },
  downtime: { plannedHours: 8 },
  downtimes: [
    {
      id: 'dt-1', lineNumber: 1, downtimeReasonId: 'r-maint', downtimeReason: { id: 'r-maint', name: 'Machine Maintenance' },
      downtimeReasonText: null, downtimeHours: 0.5, remarks: 'Lubrication',
    },
    {
      id: 'dt-2', lineNumber: 2, downtimeReasonId: 'r-other', downtimeReason: { id: 'r-other', name: 'Other' },
      downtimeReasonText: 'Material shortage', downtimeHours: 0.5, remarks: '',
    },
  ],
  items: [
    { id: 'pi-1', lineNumber: 1, itemId: 'item-1', item: { itemCode: 'ITM-1', name: 'Wire Coil 2.5', wireSizeMm: 2.5, weightPerMeter: 2 }, uom: { code: 'M', symbol: 'm' }, targetQuantity: 1000, actualQuantity: 900, scrapQuantity: 20, runningHours: 7, remarks: null },
  ],
  route: { routingCode: 'RT-1', name: 'Coil Route', operations: [{ sequenceNo: 10, operationName: 'Draw', department: { name: 'Drawing' } }] },
};

function getCalls(): Array<{ url: string; params?: any }> {
  return (apiMock.get as jest.Mock).mock.calls.map((c: any[]) => ({ url: String(c[0]), params: c[1] }));
}

describe('EntryDetail (TASK #19 professional View)', () => {
  beforeEach(() => {
    apiMock.get.mockReset();
    apiMock.get.mockImplementation((url: any, params?: any) => {
      const u = String(url);
      if (u === '/production/entries/entry-1') {
        return Promise.resolve({ success: true, data: entry });
      }
      if (u === '/inventory/balances') {
        if (params?.itemId === 'item-1') {
          return Promise.resolve({
            data: [
              { id: 'b-1', item: { id: 'item-1', name: 'Wire', itemCode: 'ITM-1' }, warehouse: { id: 'w-1', name: 'Main WH' }, onHand: 500, reserved: 100, available: 400, uom: { id: 'u1', code: 'M', name: 'Meter' } },
            ],
          });
        }
        return Promise.resolve({ data: [] });
      }
      return Promise.resolve({ data: [] });
    });
  });

  it('renders hierarchical A–I section headers', async () => {
    render(
      <MemoryRouter initialEntries={['/production/entries/entry-1']}>
        <Routes>
          <Route path="/production/entries/:id" element={<EntryDetail />} />
        </Routes>
      </MemoryRouter>
    );
    await screen.findByText(/Production Entry/);
    for (const label of ['Production Context', 'Item & Wire Size', 'Production Figures', 'Downtime Breakdown', 'Production Output Lines', 'Production Route', 'Stock & Posting', 'Linkages', 'Remarks & Entry Metadata']) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it('shows the authoritative Wire Size and does NOT show a manual Coil Size field', async () => {
    render(
      <MemoryRouter initialEntries={['/production/entries/entry-1']}>
        <Routes>
          <Route path="/production/entries/:id" element={<EntryDetail />} />
        </Routes>
      </MemoryRouter>
    );
    await screen.findByText(/Production Entry/);
    expect(screen.getAllByText(/2\.5/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/Coil Size/i)).not.toBeInTheDocument();
  });

  it('renders every downtime line with reason, hours and notes', async () => {
    render(
      <MemoryRouter initialEntries={['/production/entries/entry-1']}>
        <Routes>
          <Route path="/production/entries/:id" element={<EntryDetail />} />
        </Routes>
      </MemoryRouter>
    );
    await screen.findByText(/Production Entry/);
    expect(screen.getByText(/Machine Maintenance/)).toBeInTheDocument();
    expect(screen.getByText(/Lubrication/)).toBeInTheDocument();
    expect(screen.getByText(/Material shortage/)).toBeInTheDocument();
  });

  it('shows the downtime summary with Planned / Running / Total / Remaining', async () => {
    render(
      <MemoryRouter initialEntries={['/production/entries/entry-1']}>
        <Routes>
          <Route path="/production/entries/:id" element={<EntryDetail />} />
        </Routes>
      </MemoryRouter>
    );
    await screen.findByText(/Production Entry/);
    for (const label of ['Planned', 'Running', 'Total Downtime', 'Remaining']) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it('fetches real inventory balances scoped to the entry item (no fabricated quantities)', async () => {
    render(
      <MemoryRouter initialEntries={['/production/entries/entry-1']}>
        <Routes>
          <Route path="/production/entries/:id" element={<EntryDetail />} />
        </Routes>
      </MemoryRouter>
    );
    await screen.findByText(/Production Entry/);
    await screen.findByText('Main WH');
    expect(screen.getByText('Main WH')).toBeInTheDocument();
    const balanceCalls = getCalls().filter((c) => c.url === '/inventory/balances');
    expect(balanceCalls.length).toBeGreaterThan(0);
    expect(balanceCalls[0].params.itemId).toBe('item-1');
  });

  it('downtime renders as a professional table with # | Reason | Hours | Other/Custom Text | Notes', async () => {
    render(
      <MemoryRouter initialEntries={['/production/entries/entry-1']}>
        <Routes>
          <Route path="/production/entries/:id" element={<EntryDetail />} />
        </Routes>
      </MemoryRouter>
    );
    await screen.findByText(/Production Entry/);
    // Table headers (professional downtime table).
    expect(screen.getByText('Reason')).toBeInTheDocument();
    expect(screen.getByText('Hours')).toBeInTheDocument();
    expect(screen.getByText('Other / Custom Text')).toBeInTheDocument();
    expect(screen.getByText('Notes')).toBeInTheDocument();
    // Persisted rows + "Other" custom text + per-row notes all appear.
    expect(screen.getByText(/Machine Maintenance/)).toBeInTheDocument();
    expect(screen.getByText(/Lubrication/)).toBeInTheDocument();
    expect(screen.getByText(/Material shortage/)).toBeInTheDocument();
  });

  it('shows the professional empty state when NO downtime rows exist', async () => {
    const emptyEntry = { ...entry, downtimes: [] };
    apiMock.get.mockImplementation((url: any, params?: any) => {
      const u = String(url);
      if (u === '/production/entries/entry-1') return Promise.resolve({ success: true, data: emptyEntry });
      if (u === '/inventory/balances') return Promise.resolve({ data: [] });
      return Promise.resolve({ data: [] });
    });
    render(
      <MemoryRouter initialEntries={['/production/entries/entry-1']}>
        <Routes>
          <Route path="/production/entries/:id" element={<EntryDetail />} />
        </Routes>
      </MemoryRouter>
    );
    await screen.findByText(/Production Entry/);
    expect(screen.queryByText(/Machine Maintenance/)).not.toBeInTheDocument();
    expect(screen.getByText(/No downtime entries were recorded for this production entry\./)).toBeInTheDocument();
  });
});
