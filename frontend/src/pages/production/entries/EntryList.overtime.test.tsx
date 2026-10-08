import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { BrowserRouter } from 'react-router-dom';
import { App } from 'antd';
import EntryList from './EntryList';
import apiService from '../../../services/api';

/**
 * PHASE 3 — KPI ⇄ TABLE OVERTIME PARITY
 *
 * The mocked dataset mirrors the Phase-1 audit:
 *   row 1  persisted overtime_hours = 2 (hand packing, remarks echo `OT: 2h`) → 2h
 *   row 2  plain 8h shift entry, no OT                                  →  0h
 *   row 3  running 12h, NO overtime recorded                            →  0h  (pre-fix display: 4h)
 *   row 4  legacy row whose OT exists only in remarks (`OT: 3h`)        →  3h
 *   row 5  running 11h on a 12h planned shift                           →  0h  (pre-fix display: 3h)
 *
 * Expected KPI total = expected sum of the OT column = 5h.
 * The pre-fix display rule (column → remarks → runningHours - 8) totalled 12h,
 * which is exactly the reported KPI-vs-table disagreement.
 */

beforeAll(() => {
  window.matchMedia = () =>
    ({
      matches: true,
      media: '',
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList;
});

// CRA runs jest with resetMocks:true, so factory implementations are wiped
// before every test — the API stub must be (re)installed inside each test.
jest.mock('../../../services/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), delete: jest.fn() },
}));

const apiMock = apiService as unknown as { get: jest.Mock; delete: jest.Mock };

const row = (over: Record<string, unknown>) => ({
  id: 'row-x',
  entryDate: '2026-10-04',
  divisionId: 'div-1',
  sectionId: 'sec-1',
  departmentId: 'dept-1',
  division: { id: 'div-1', name: 'Control Cable Division', divisionCode: 'DIV-CCD' },
  section: { id: 'sec-1', name: 'Spiral', sectionCode: 'SEC-015' },
  department: { id: 'dept-1', name: 'Flattening', departmentCode: 'CCD-DEPT001' },
  shift: { id: 'shift-1', name: 'General Shift', shiftCode: 'GENERAL' },
  machineNo: 'FT-04',
  machine: { id: 'm-1', machineCode: 'FT-04', name: 'Flattening Machine FT-04' },
  operatorName: 'Muhammad Ali',
  itemId: 'item-1',
  item: { id: 'item-1', name: 'Flat Wire', itemCode: 'FLAT-WIRE-001' },
  uomId: 'uom-1',
  uom: { id: 'uom-1', code: 'KG', symbol: 'kg' },
  targetQuantity: 60,
  actualQuantity: 48,
  achievementPercentage: 80,
  efficiencyPercentage: 75,
  downtimeHours: 0,
  downtimeReasonText: null,
  scrapQuantity: 0,
  isActive: true,
  inventoryReferenceId: 'inv-1',
  ...over,
});

const OT_ROWS = [
  row({ id: 'ot-1', overtimeHours: 2, runningHours: 10, remarks: '[HAND PACKING] Batch: PKG-2026-0240 | OT: 2h | Cartons: 1' }),
  row({ id: 'ot-2', overtimeHours: 0, runningHours: 8, remarks: null }),
  row({ id: 'ot-3', overtimeHours: 0, runningHours: 12, remarks: null }),
  row({ id: 'ot-4', overtimeHours: 0, runningHours: 11, remarks: 'Batch B | OT: 3h | Cartons: 9' }),
  row({ id: 'ot-5', overtimeHours: 0, runningHours: 11, remarks: 'Night run, within 12h planned shift' }),
];

const mockApi = () => {
  apiMock.get.mockImplementation(async (url: string) => {
    if (url === '/production/entries') {
      // NO `summary` → the KPI falls back to the client-side aggregate, which
      // must apply the identical rule as the OT column.
      return { success: true, total: OT_ROWS.length, data: OT_ROWS };
    }
    if (url === '/production/entries/report') {
      return { success: true, entryCount: OT_ROWS.length, departments: [], grandTotalsByUom: [] };
    }
    return { success: true, data: [] };
  });
  apiMock.delete.mockResolvedValue({ success: true });
  sessionStorage.clear();
};

jest.mock('./lookups', () => ({
  useLookups: () => ({
    divisions: [{ id: 'div-1', name: 'Control Cable Division', divisionCode: 'DIV-CCD' }],
    sections: [{ id: 'sec-1', name: 'Spiral', sectionCode: 'SEC-015', divisionId: 'div-1' }],
    departments: [{ id: 'dept-1', name: 'Flattening', departmentCode: 'CCD-DEPT001', divisionId: 'div-1', sectionId: 'sec-1' }],
    shifts: [{ id: 'shift-1', name: 'General Shift', shiftCode: 'GENERAL' }],
    items: [],
    uoms: [],
    uomConversions: [],
    hrEmployees: [],
    employeeFullName: (emp: any) => emp.name || emp.employeeCode,
    sectionsForDivision: () => [],
    departmentsForSection: () => [],
    employeesForDepartment: () => [],
  }),
}));

const renderList = () =>
  render(
    <App>
      <BrowserRouter>
        <EntryList />
      </BrowserRouter>
    </App>,
  );

/** Column headers render before the fetch settles — wait for the 5 body rows. */
const waitForRows = async () =>
  waitFor(
    () => expect(document.querySelectorAll('.ant-table-tbody tr.ant-table-row').length).toBe(OT_ROWS.length),
    { timeout: 5000 },
  );

/** Column index of the OT column, resolved from its header text. */
const otColumnIndex = () => {
  const headers = screen.getAllByRole('columnheader');
  const idx = headers.findIndex((h) => (h.textContent || '').includes('OT (h)'));
  expect(idx).toBeGreaterThanOrEqual(0);
  return idx;
};

/** OT cell text of every body row, in display order. */
const otCells = () => {
  const idx = otColumnIndex();
  return screen
    .getAllByRole('row')
    .map((r) => r.querySelectorAll('td')[idx])
    .filter(Boolean)
    .map((td) => (td.textContent || '').trim());
};

const otCellValue = (text: string) => (text === '—' || text === '' ? 0 : parseFloat(text));

const kpiOvertime = () => {
  const card = document.querySelector('[data-testid="kpi-total-overtime"]');
  expect(card).toBeTruthy();
  const match = ((card as HTMLElement).textContent || '').match(/(-?\d+(?:\.\d+)?)\s*h/);
  expect(match).toBeTruthy();
  return parseFloat((match as RegExpMatchArray)[1]);
};

describe('Phase 3 — Production Entries overtime: KPI and table use one definition', () => {
  it('renders the canonical OT for every row (no runningHours - 8 derivation)', async () => {
    mockApi();
    renderList();
    await waitForRows();
    expect(otCells()).toEqual(['2h', '—', '—', '3h', '—']);
  });

  it('totals match: KPI overtime === sum of the OT column', async () => {
    mockApi();
    renderList();
    await waitForRows();

    const columnTotal = otCells().map(otCellValue).reduce((s, v) => s + v, 0);
    expect(columnTotal).toBe(5);
    expect(kpiOvertime()).toBe(columnTotal);

    // A >8h running entry contributes 0h to BOTH the column and the KPI, so the
    // total can no longer reach the pre-fix 12h.
    expect(kpiOvertime()).toBeLessThan(12);
  });

  it('sorts the OT column by the same canonical value', async () => {
    mockApi();
    renderList();
    await waitForRows();

    const header = screen
      .getAllByRole('columnheader')
      .find((h) => (h.textContent || '').includes('OT (h)')) as HTMLElement;
    fireEvent.click(header);

    // Ascending: 0h, 0h, 0h, 2h, 3h — the legacy remarks row wins over the
    // "running > 8" rows, which are now correctly 0h.
    expect(otCells().map(otCellValue)).toEqual([0, 0, 0, 2, 3]);
  });
});
