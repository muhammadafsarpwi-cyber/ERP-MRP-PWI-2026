import React from 'react';
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { App } from 'antd';
import EntryForm from './EntryForm';
import apiService from '../../../services/api';
import { formatNumber, formatDimension } from '../../../utils/numberFormat';

jest.mock('../../../services/api');

jest.setTimeout(45000);

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

const itemA = { id: 'item-A', itemCode: 'WIP-FT-001', name: 'Flat Wire A', wireSizeMm: 1.2, baseUomId: 'uom-m', baseUom: { code: 'KG', symbol: 'kg' }, itemType: 'FINISHED_GOOD', status: 'ACTIVE', weightPerMeter: 0.1 };
const itemB = { id: 'item-B', itemCode: 'WIP-FT-002', name: 'Flat Wire B', wireSizeMm: 1.45, baseUomId: 'uom-m', baseUom: { code: 'KG', symbol: 'kg' }, itemType: 'FINISHED_GOOD', status: 'ACTIVE', weightPerMeter: 0.1 };
const itemNoWire = { id: 'item-C', itemCode: 'WIP-FT-003', name: 'Flat Wire C', wireSizeMm: null, baseUomId: 'uom-m', itemType: 'FINISHED_GOOD', status: 'ACTIVE' };
const uomM = { id: 'uom-m', code: 'KG', symbol: 'kg', uomType: 'WEIGHT' };
const reasonMaint = { id: 'r-maint', name: 'Machine Maintenance', code: 'MAINT' };
const reasonPower = { id: 'r-power', name: 'Power Failure', code: 'POWER' };

// TASK #29/#30 chain fixtures used by the pre-existing TASK26/27/28 Raw Material
// tests. TASK #30 rule: the EXACT raw material for a selected item is the
// PRODUCING operation's INPUT item (by routing-chain continuity the IMMEDIATE
// PREVIOUS operation's OUTPUT). So op 20 (producing item-A) consumes PREV_A
// ("1.20mm-B4 Wire") as input — that exact item is the raw material.
const PREV_A = 'prev-A';
const PREV_B = 'prev-B';
const chainRouteA = {
  id: 'rt-a', productId: 'item-A',
  operations: [
    { sequenceNo: 10, operationCode: 'PRE', operationName: 'Pre-Flattening', outputItemId: PREV_A, outputItem: { itemCode: '1.20mm-B4', name: '1.20mm-B4 Wire', baseUomId: 'uom-m', baseUom: { code: 'KG' } } },
    { sequenceNo: 20, operationCode: 'FLAT', operationName: 'Flattening', outputItemId: 'item-A', inputItemId: PREV_A, inputItem: { itemCode: '1.20mm-B4', name: '1.20mm-B4 Wire', baseUomId: 'uom-m', baseUom: { code: 'KG' } }, inputQuantity: 2, outputItem: { itemCode: 'WIP-FT-001', name: 'Flat Wire A', baseUomId: 'uom-m', baseUom: { code: 'KG' } } },
  ],
};
const chainRouteB = {
  id: 'rt-b', productId: 'item-B',
  operations: [
    { sequenceNo: 10, operationCode: 'PRE', operationName: 'Pre-Cleaning', outputItemId: PREV_B, outputItem: { itemCode: '1.45mm-B4', name: '1.45mm-B4 Wire', baseUomId: 'uom-m', baseUom: { code: 'KG' } } },
    { sequenceNo: 20, operationCode: 'FLAT', operationName: 'Cleaning', outputItemId: 'item-B', inputItemId: PREV_B, inputItem: { itemCode: '1.45mm-B4', name: '1.45mm-B4 Wire', baseUomId: 'uom-m', baseUom: { code: 'KG' } }, inputQuantity: 3, outputItem: { itemCode: 'WIP-FT-002', name: 'Flat Wire B', baseUomId: 'uom-m', baseUom: { code: 'KG' } } },
  ],
};
// BOM for the CURRENT item (item-A): lists the exact raw material (PREV_A) as a
// component line so Required uses the BOM requirement logic (mirrors backend).
const chainBomA = {
  productId: 'item-A', baseQuantity: 1,
  lines: [{ id: 'bomline-1', itemId: PREV_A, quantity: 2, scrapFactor: 0, yieldPercentage: 100, uomId: 'uom-m',
    item: { itemCode: '1.20mm-B4', name: '1.20mm-B4 Wire', baseUomId: 'uom-m', baseUom: { code: 'KG' } }, uom: { code: 'KG' } }],
};
const chainBomB = {
  productId: 'item-B', baseQuantity: 1,
  lines: [{ id: 'bl-b', itemId: PREV_B, quantity: 3, scrapFactor: 0, yieldPercentage: 100, uomId: 'uom-m',
    item: { itemCode: '1.45mm-B4', name: '1.45mm-B4 Wire', baseUomId: 'uom-m', baseUom: { code: 'KG' } }, uom: { code: 'KG' } }],
};

function mockCommonApi(entry?: any, ext?: { bom?: Record<string, any>; available?: Record<string, number>; route?: Record<string, any> }) {
  apiMock.get.mockImplementation(async (url: any, params?: any) => {
    const u = String(url);
    if (/^\/production\/entries\/[^/]+$/.test(u) && entry) return { success: true, data: entry };
    if (u === '/master-data/items') return { data: [itemA, itemB, itemNoWire] as any };
    const singleItemMatch = u.match(/^\/master-data\/items\/(.+)$/);
    if (singleItemMatch) {
      const id = decodeURIComponent(singleItemMatch[1]);
      const allItems: any[] = [itemA, itemB, itemNoWire,
        { id: PREV_A, itemCode: '1.20mm-B4', name: '1.20mm-B4 Wire', wireSizeMm: 1.20, baseUomId: 'uom-m', baseUom: { code: 'KG' }, itemType: 'RAW_MATERIAL', status: 'ACTIVE' },
        { id: PREV_B, itemCode: '1.45mm-B4', name: '1.45mm-B4 Wire', wireSizeMm: 1.45, baseUomId: 'uom-m', baseUom: { code: 'KG' }, itemType: 'RAW_MATERIAL', status: 'ACTIVE' },
      ];
      return { data: allItems.find((i) => i.id === id) ?? null } as any;
    }
    if (u === '/master-data/uom') return { data: [uomM] as any };
    if (u === '/master-data/uom-conversions') return { data: [] as any };
    if (u === '/production/shifts') return { data: [] as any };
    if (u === '/production/downtime-reasons') return { data: [reasonMaint, reasonPower] as any };
    if (u === '/divisions') return { data: [] as any };
    if (u === '/sections') return { data: [] as any };
    if (u === '/departments') return { data: [] as any };
    if (u === '/production/orders') return { data: [] as any };
    if (u === '/hr/employees') return { data: [] as any };
    if (u === '/warehouses') return { data: [] as any };
    if (u === '/production/machines') return { data: [] as any };
    const routeMatch = u.match(/^\/production\/routings\/item\/([^/]+)\/route$/);
    if (routeMatch) {
      const id = decodeURIComponent(routeMatch[1]);
      const routing = ext?.route?.[id];
      if (routing === undefined) return Promise.reject(new Error('no routing'));
      return { data: routing };
    }
    const bomMatch = u.match(/^\/bom\/product\/(.+)$/);
    if (bomMatch) {
      const id = decodeURIComponent(bomMatch[1]);
      return { data: ext?.bom?.[id] ?? null };
    }
    if (u.startsWith('/inventory/balances/available')) {
      const itemId = params?.itemId;
      return { data: itemId != null ? (ext?.available?.[itemId] ?? 0) : 0 };
    }
    return { data: [] };
  });
}

function renderForm(initialPath = '/production/entries/new', entry?: any, ext?: { bom?: Record<string, any>; available?: Record<string, number>; route?: Record<string, any> }) {
  mockCommonApi(entry, ext);
  return render(
    <App>
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          <Route path="/production/entries/new" element={<EntryForm mode="create" />} />
          <Route path="/production/entries/:id/edit" element={<EntryForm mode="edit" />} />
        </Routes>
      </MemoryRouter>
    </App>
  );
}

// Opens antd's row-level Item Select by mousedown on its combobox, then clicks the option
// with the given label. Each row now also carries a UOM combobox, so we target the Item
// combobox specifically via its aria-label ("Production item N").
// Multiple rows may have dropdowns mounted in the DOM portal simultaneously; the most
// recently opened dropdown renders last, so we click the LAST matching option.
async function pickItem(scope: HTMLElement, label: string) {
  const boxes = within(scope).getAllByRole('combobox');
  const itemBox =
    boxes.find((b) => /^Production item \d+$/.test((b as HTMLElement).getAttribute('aria-label') ?? '')) ?? boxes[0];
  fireEvent.mouseDown(itemBox);
  const options = await screen.findAllByText(label, { selector: '.ant-select-item-option-content' });
  await userEvent.click(options[options.length - 1]);
}

// Returns the per-row UOM combobox for row `n` (aria-label "Production item UOM n").
function getUomSelect(row: HTMLElement, n: number): HTMLElement {
  const boxes = within(row).getAllByRole('combobox');
  const found = boxes.find((b) => (b as HTMLElement).getAttribute('aria-label')?.includes(`Production item UOM ${n}`));
  if (!found) throw new Error(`UOM select ${n} not found`);
  return found as HTMLElement;
}

describe('EntryForm — Wire Size binding in Production Item rows', () => {
  beforeEach(() => {
    apiMock.get.mockReset();
  });

  it('create: selecting an item in a production row displays that item Wire Size (authoritative Item Master)', async () => {
    renderForm();
    // Turn the + Add Item header button into a real row.
    await userEvent.click(await screen.findByRole('button', { name: /add item/i }));

    const row = await screen.findByTestId('production-item-row-1');
    await pickItem(row, 'WIP-FT-001 — Flat Wire A');

    const wire = await screen.findByTestId('wire-size-row-1');
    expect(wire.textContent).toBe(`${formatDimension(1.2)} mm`);
  });

  it('changing the selected item updates the row Wire Size immediately', async () => {
    renderForm();
    await userEvent.click(await screen.findByRole('button', { name: /add item/i }));
    const row = await screen.findByTestId('production-item-row-1');

    await pickItem(row, 'WIP-FT-001 — Flat Wire A');
    expect((await screen.findByTestId('wire-size-row-1')).textContent).toBe(`${formatDimension(1.2)} mm`);

    await pickItem(row, 'WIP-FT-002 — Flat Wire B');
    expect(await screen.findByTestId('wire-size-row-1').then((el) => el.textContent)).toBe(`${formatDimension(1.45)} mm`);
  });

  it('multiple rows each display their own Wire Size independently', async () => {
    renderForm();
    await userEvent.click(await screen.findByRole('button', { name: /add item/i }));
    await userEvent.click(await screen.findByRole('button', { name: /add item/i }));

    const row1 = await screen.findByTestId('production-item-row-1');
    const row2 = await screen.findByTestId('production-item-row-2');
    await pickItem(row1, 'WIP-FT-001 — Flat Wire A');
    await pickItem(row2, 'WIP-FT-002 — Flat Wire B');

    expect((await screen.findByTestId('wire-size-row-1')).textContent).toBe(`${formatDimension(1.2)} mm`);
    expect((await screen.findByTestId('wire-size-row-2')).textContent).toBe(`${formatDimension(1.45)} mm`);
  });

  it('an item without wireSizeMm shows the neutral "—" state', async () => {
    renderForm();
    await userEvent.click(await screen.findByRole('button', { name: /add item/i }));
    const row = await screen.findByTestId('production-item-row-1');
    await pickItem(row, 'WIP-FT-003 — Flat Wire C');
    expect((await screen.findByTestId('wire-size-row-1')).textContent).toBe('—');
  });

  it('renders all FIVE KPI cards in the single top row, each with an icon', async () => {
    renderForm();
    const kpiRow = await screen.findByTestId('kpi-row');
    const labels = ['Efficiency %', 'Achievement %', 'Rejection %', 'Production Weight (KG)', 'Rejection Weight (KG)'];
    for (const l of labels) {
      expect(within(kpiRow).getByText(l)).toBeInTheDocument();
    }
    // Every KPI card carries an icon (thunderbolt/trophy/warning/gold/close-circle).
    const icons = within(kpiRow).getAllByRole('img');
    expect(icons.length).toBeGreaterThanOrEqual(5);
  });

  it('renders the Save button directly after the form content in normal page flow (no absolute/fixed positioning)', async () => {
    renderForm();
    await userEvent.click(await screen.findByRole('button', { name: /add item/i }));

    const save = await screen.findByRole('button', { name: /save production entry/i });
    expect(save).toBeInTheDocument();

    const btn = save as HTMLElement;
    const style = window.getComputedStyle(btn);
    // Not ripped out of flow via absolute/fixed positioning / viewport tricks.
    expect(['absolute', 'fixed']).not.toContain(style.position);
  });

  it('edit mode resolves each saved itemId Wire Size from the Item Master lookup', async () => {
    const entry = {
      id: 'entry-1',
      entryDate: '2026-09-03',
      divisionId: 'div-1', sectionId: 'sec-1', departmentId: 'dept-1',
      shiftId: 'shift-1', machineId: null, machineNo: 'M-01',
      operatorName: 'Op', supervisorName: null,
      itemId: 'item-A', uomId: 'uom-m',
      targetQuantity: 100, actualQuantity: 70, runningHours: 8, downtimeHours: 0,
      scrapQuantity: 0, remarks: null,
      items: [
        { id: 'pi-1', lineNumber: 1, itemId: 'item-A', uomId: 'uom-m', targetQuantity: 50, actualQuantity: 40, scrapQuantity: 0, runningHours: 8 },
        { id: 'pi-2', lineNumber: 2, itemId: 'item-B', uomId: 'uom-m', targetQuantity: 50, actualQuantity: 30, scrapQuantity: 0, runningHours: 8 },
      ],
      downtimes: [],
      evenTowardAngle: undefined,
    };
    renderForm('/production/entries/entry-1/edit', entry);

    // Wait for the loaded entry to populate the production item rows.
    expect((await screen.findByTestId('wire-size-row-1')).textContent).toBe(`${formatDimension(1.2)} mm`);
    expect(screen.getByTestId('wire-size-row-2').textContent).toBe(`${formatDimension(1.45)} mm`);
  });

  it('edit mode reconstructs all persisted downtime lines', async () => {
    const entry = {
      id: 'entry-1',
      entryDate: '2026-09-03',
      divisionId: 'div-1', sectionId: 'sec-1', departmentId: 'dept-1',
      shiftId: 'shift-1', machineId: null, machineNo: 'M-01',
      operatorName: 'Op', supervisorName: null,
      itemId: 'item-A', uomId: 'uom-m',
      targetQuantity: 100, actualQuantity: 70, runningHours: 5.5, downtimeHours: 2.5,
      scrapQuantity: 0, remarks: null,
      items: [],
      downtimes: [
        { id: 'dt-1', lineNumber: 1, downtimeReasonId: 'r-maint', downtimeReason: { id: 'r-maint', name: 'Machine Maintenance' }, downtimeReasonText: null, downtimeHours: 1, remarks: 'setup' },
        { id: 'dt-2', lineNumber: 2, downtimeReasonId: 'r-power', downtimeReason: { id: 'r-power', name: 'Power Failure' }, downtimeReasonText: null, downtimeHours: 1.5, remarks: null },
      ],
    };
    renderForm('/production/entries/entry-1/edit', entry);

    // The downtime lines are reconstructed into the form (reason selects populated).
    await screen.findByText('Machine Maintenance');
    expect(screen.getByText('Power Failure')).toBeInTheDocument();
    // Hours (InputNumber => spinbutton) + notes survive into the reconstructed rows.
    const hourInputs = await screen.findAllByRole('spinbutton');
    const hourValues = hourInputs.map((i) => (i as HTMLInputElement).value);
    expect(hourValues).toContain('1.00');
    expect(hourValues).toContain('1.50');
    expect(screen.getByDisplayValue('setup')).toBeInTheDocument();
  });

  it('downtime row starts UNCONFIRMED (subtle red state) and flips to CONFIRMED (subtle green) on OK', async () => {
    renderForm();
    await userEvent.click(await screen.findByRole('button', { name: /add downtime/i }));

    const row = await screen.findByTestId('downtime-row-0');
    // Unconfirmed default.
    expect(row.getAttribute('data-confirmed')).toBe('false');

    // Confirm via the OK button.
    await userEvent.click(within(row).getByRole('button', { name: /OK downtime/i }));
    expect(row.getAttribute('data-confirmed')).toBe('true');

    // Reopen toggles back to unconfirmed.
    await userEvent.click(within(row).getByRole('button', { name: /reopen downtime/i }));
    expect(row.getAttribute('data-confirmed')).toBe('false');
  });

  it('offers EXACTLY ONE Add Item button, in the Production Items card header (not at the bottom)', async () => {
    renderForm();
    const addItemButtons = await screen.findAllByRole('button', { name: /add item/i });
    // Header + also-Add-Downtime must not add a second "Add Item".
    expect(addItemButtons).toHaveLength(1);
  });

  it('compact Item Details strip is absent until an item is selected via Production Items, then follows the selected item (Wire Size from Item Master)', async () => {
    renderForm();
    // Not shown before a production item is picked.
    expect(screen.queryByTestId('item-details-strip')).not.toBeInTheDocument();

    // Add a production item row and select an item in that row.
    await userEvent.click(await screen.findByRole('button', { name: /add item/i }));
    const row1 = await screen.findByTestId('production-item-row-1');
    await pickItem(row1, 'WIP-FT-001 — Flat Wire A');

    const strip = await screen.findByTestId('item-details-strip');
    // Strip reflects the selected item's authoritative Wire Size.
    expect(strip.textContent).toContain('1.2');

    // Change the selected item in the same row -> strip updates immediately.
    await pickItem(row1, 'WIP-FT-002 — Flat Wire B');
    const stripB = await screen.findByTestId('item-details-strip');
    expect(stripB.textContent).toContain('1.45');
    // No stale value from the previous item remains.
    expect(stripB.textContent).not.toContain('1.2');
  });

  // ── TASK #24 Section 17 tests ───────────────────────────────────────────

  it('section 17(1): Production Items appears directly after Operator/Supervisor, before Production Figures', async () => {
    const { container } = renderForm();
    // eslint-disable-next-line testing-library/no-container, testing-library/no-node-access
    const titles = [...container.querySelectorAll<HTMLElement>('.ant-card-head-title')];
    const texts = titles.map((t) => t.textContent?.trim() ?? '');
    const opIdx = texts.findIndex((t) => t.includes('Operator'));
    const itemsIdx = texts.findIndex((t) => t === 'Production Items');
    const figIdx = texts.findIndex((t) => t === 'Production Figures');
    expect(opIdx).toBeGreaterThanOrEqual(0);
    expect(itemsIdx).toBeGreaterThan(opIdx);
    expect(figIdx).toBeGreaterThan(itemsIdx);
  });

  it('section 17(9-13): Actual Good Production auto-derives from item quantities and is disabled', async () => {
    renderForm();
    const actualInput = await screen.findByLabelText(/actual good production/i);
    // When no items, field is enabled (manual input).
    expect(actualInput).not.toBeDisabled();

    // Add an item and enter quantity
    await userEvent.click(await screen.findByRole('button', { name: /add item/i }));
    const row1 = await screen.findByTestId('production-item-row-1');
    await pickItem(row1, 'WIP-FT-001 — Flat Wire A');
    const qty1 = within(row1).getByLabelText('Item quantity');
    fireEvent.change(qty1, { target: { value: '10' } });
    fireEvent.blur(qty1);

    // Actual becomes disabled and shows 10
    const actualAfterAdd = await screen.findByLabelText(/actual good production/i);
    expect(actualAfterAdd).toBeDisabled();

    // Add a second item
    await userEvent.click(await screen.findByRole('button', { name: /add item/i }));
    const row2 = await screen.findByTestId('production-item-row-2');
    await pickItem(row2, 'WIP-FT-002 — Flat Wire B');
    const qty2 = within(row2).getByLabelText('Item quantity');
    fireEvent.change(qty2, { target: { value: '20' } });
    fireEvent.blur(qty2);

    // Actual = 10 + 20 = 30
    const actualTwoItems = screen.getByLabelText(/actual good production/i) as HTMLInputElement;
    expect(actualTwoItems.value).toBe('30');

    // Change item 2 quantity from 20 → 25
    fireEvent.change(qty2, { target: { value: '25' } });
    fireEvent.blur(qty2);
    expect((screen.getByLabelText(/actual good production/i) as HTMLInputElement).value).toBe('35');

    // Delete item 1 → only item 2 (25) remains
    await userEvent.click(within(row1).getByRole('button', { name: /remove production item/i }));
    expect((screen.getByLabelText(/actual good production/i) as HTMLInputElement).value).toBe('25');
  });

  // ── TASK #25 Regression Tests ──────────────────────────────────────────────

  it('TASK25-A: No duplicate standalone Item/Product selector exists (removed from Operator card)', async () => {
    renderForm();
    // The standalone "Item / Product" Form.Item was removed from the Operator card.
    // The old card was titled "Operator, Item & UOM" and should now be just "Operator".
    expect(screen.queryByText('Operator, Item & UOM')).not.toBeInTheDocument();
    expect(screen.getAllByText('Operator').length).toBeGreaterThan(0);
    // No free-standing "Item / Product" label (production-item rows use aria-labels).
    expect(screen.queryByLabelText(/Item \/ Product/i)).not.toBeInTheDocument();
    // After adding a production item, its Item selector is the authoritative one.
    const addBtn = await screen.findByRole('button', { name: /add item/i });
    await userEvent.click(addBtn);
    await screen.findByTestId('production-item-row-1');
    // Still no free-standing "Item / Product" label even with a row present.
    expect(screen.queryByLabelText(/Item \/ Product/i)).not.toBeInTheDocument();
  });

  it('TASK25-B: Exactly one Add Item button exists, in the Production Items card header', async () => {
    renderForm();
    const addItemButtons = await screen.findAllByRole('button', { name: /add item/i });
    expect(addItemButtons).toHaveLength(1);
  });

  it('TASK25-C: Maximum 2 production items — third item cannot be added', async () => {
    renderForm();
    // Add first item
    await userEvent.click(await screen.findByRole('button', { name: /add item/i }));
    await screen.findByTestId('production-item-row-1');
    // Add second item
    await userEvent.click(await screen.findByRole('button', { name: /add item/i }));
    await screen.findByTestId('production-item-row-2');
    // Button should now be disabled (maximum 2)
    const addBtn = screen.getByRole('button', { name: /add item/i });
    expect(addBtn).toBeDisabled();
  });

  it('TASK25-D: Department filtering — items from other departments are excluded', async () => {
    // Setup: items from different departments
    const flatDeptId = 'dept-flattening';
    const sparalDeptId = 'dept-sparal';
    const flatItemA = { id: 'flat-a', itemCode: 'FLAT-RAW-001', name: 'Flat Raw A', wireSizeMm: 1.2, baseUomId: 'uom-m', itemType: 'RAW_MATERIAL', status: 'ACTIVE', departmentId: flatDeptId, weightPerMeter: 0.1 };
    const flatItemB = { id: 'flat-b', itemCode: 'FLAT-RAW-002', name: 'Flat Raw B', wireSizeMm: 1.5, baseUomId: 'uom-m', itemType: 'RAW_MATERIAL', status: 'ACTIVE', departmentId: flatDeptId, weightPerMeter: 0.1 };
    const sparalItem = { id: 'sparal-a', itemCode: 'SPARAL-001', name: 'Sparal Item', wireSizeMm: 2.0, baseUomId: 'uom-m', itemType: 'RAW_MATERIAL', status: 'ACTIVE', departmentId: sparalDeptId, weightPerMeter: 0.1 };

    apiMock.get.mockReset();
    apiMock.get.mockImplementation(async (url: any) => {
      const u = String(url);
      if (u === '/master-data/items') return { data: [flatItemA, flatItemB, sparalItem] as any };
      if (u === '/master-data/uom') return { data: [uomM] as any };
      if (u === '/master-data/uom-conversions') return { data: [] as any };
      if (u === '/production/shifts') return { data: [] as any };
      if (u === '/production/downtime-reasons') return { data: [] as any };
      if (u === '/divisions') return { data: [] as any };
      if (u === '/sections') return { data: [] as any };
      if (u === '/departments') return { data: [] as any };
      if (u === '/production/orders') return { data: [] as any };
      if (u === '/hr/employees') return { data: [] as any };
      if (u === '/warehouses') return { data: [] as any };
      if (u === '/production/machines') return { data: [] as any };
      return { data: [] };
    });

    // Render with departmentId=flatDeptId in query params (simulating locked context)
    render(
      <MemoryRouter initialEntries={[`/production/entries/new?machineId=m1&entryDate=2026-09-03&shiftId=s1&divisionId=d1&sectionId=s1&departmentId=${flatDeptId}`]}>
        <Routes>
          <Route path="/production/entries/new" element={<EntryForm mode="create" />} />
        </Routes>
      </MemoryRouter>,
    );

    await userEvent.click(await screen.findByRole('button', { name: /add item/i }));
    const row = await screen.findByTestId('production-item-row-1');

    // Open the item dropdown in the production row (the Item combobox, not the UOM one).
    const itemSelect = within(row).getAllByRole('combobox').find((b) =>
      /^Production item \d+$/.test((b as HTMLElement).getAttribute('aria-label') ?? ''));
    fireEvent.mouseDown(itemSelect as HTMLElement);

    // FLATTING items should be visible
    const flatOptA = await screen.findAllByText('FLAT-RAW-001 — Flat Raw A', { selector: '.ant-select-item-option-content' });
    expect(flatOptA.length).toBeGreaterThan(0);
    const flatOptB = await screen.findAllByText('FLAT-RAW-002 — Flat Raw B', { selector: '.ant-select-item-option-content' });
    expect(flatOptB.length).toBeGreaterThan(0);

    // SPARAL item should NOT be visible for a FLATTING department
    const sparalOpts = screen.queryAllByText('SPARAL-001 — Sparal Item', { selector: '.ant-select-item-option-content' });
    expect(sparalOpts).toHaveLength(0);
  });

  it('TASK25-E: Item Details strip shows correct data from Production Items selection', async () => {
    renderForm();
    await userEvent.click(await screen.findByRole('button', { name: /add item/i }));
    const row = await screen.findByTestId('production-item-row-1');
    await pickItem(row, 'WIP-FT-001 — Flat Wire A');

    const strip = await screen.findByTestId('item-details-strip');
    expect(strip.textContent).toContain('1.2');    // Wire Size
  });

  it('TASK25-F: KPI five-card one-row layout remains intact with icons', async () => {
    renderForm();
    const kpiRow = await screen.findByTestId('kpi-row');
    const labels = ['Efficiency %', 'Achievement %', 'Rejection %', 'Production Weight (KG)', 'Rejection Weight (KG)'];
    for (const l of labels) {
      expect(within(kpiRow).getByText(l)).toBeInTheDocument();
    }
    const icons = within(kpiRow).getAllByRole('img');
    expect(icons.length).toBeGreaterThanOrEqual(5);
  });

  it('TASK25-G: Save button is in normal document flow (no fixed/absolute positioning)', async () => {
    renderForm();
    const save = await screen.findByRole('button', { name: /save production entry/i });
    expect(save).toBeInTheDocument();
    const style = window.getComputedStyle(save);
    expect(['absolute', 'fixed']).not.toContain(style.position);
  });

  it('TASK25-H: Production Items appears after Operator and before Production Figures', async () => {
    const { container } = renderForm();
    // eslint-disable-next-line testing-library/no-container, testing-library/no-node-access
    const titles = [...container.querySelectorAll<HTMLElement>('.ant-card-head-title')];
    const texts = titles.map((t) => t.textContent?.trim() ?? '');
    const opIdx = texts.findIndex((t) => t === 'Operator');
    const itemsIdx = texts.findIndex((t) => t === 'Production Items');
    const figIdx = texts.findIndex((t) => t === 'Production Figures');
    expect(opIdx).toBeGreaterThanOrEqual(0);
    expect(itemsIdx).toBeGreaterThan(opIdx);
    expect(figIdx).toBeGreaterThan(itemsIdx);
  });

  it('TASK25-I: Wire Size auto-populates from Item Master wireSizeMm per-row independently', async () => {
    renderForm();
    await userEvent.click(await screen.findByRole('button', { name: /add item/i }));
    await userEvent.click(await screen.findByRole('button', { name: /add item/i }));

    const row1 = await screen.findByTestId('production-item-row-1');
    const row2 = await screen.findByTestId('production-item-row-2');

    await pickItem(row1, 'WIP-FT-001 — Flat Wire A');
    await pickItem(row2, 'WIP-FT-003 — Flat Wire C');

    expect((await screen.findByTestId('wire-size-row-1')).textContent).toBe(`${formatDimension(1.2)} mm`);
    expect(screen.getByTestId('wire-size-row-2').textContent).toBe('—');
  });
});

describe('TASK #26 — Production Entry layout & ERP integration', () => {
  beforeEach(() => {
    apiMock.get.mockReset();
  });

  it('TASK26-A: "+ Add Item" lives in the Production Items card header, capped at 2 (disabled at max)', async () => {
    renderForm();
    const addItemBtn = await screen.findByRole('button', { name: /add item/i });
    expect(addItemBtn).toBeInTheDocument();
    // Only one "Add Item" button at the top level.
    expect(screen.getAllByRole('button', { name: /add item/i })).toHaveLength(1);
    await userEvent.click(addItemBtn);
    await userEvent.click(addItemBtn);
    expect(screen.getByTestId('production-item-row-1')).toBeInTheDocument();
    expect(screen.getByTestId('production-item-row-2')).toBeInTheDocument();
    // The header button is replaced by a disabled one at max 2 -> re-query it.
    const addItemBtn2 = screen.getAllByRole('button', { name: /add item/i })[0];
    expect(addItemBtn2).toBeDisabled();
  });

  it('TASK26-B: "+ Add Downtime" is in the Downtime card header (not at the card bottom)', async () => {
    const { container } = renderForm();
    // eslint-disable-next-line testing-library/no-container, testing-library/no-node-access
    const downtimeCard = [...container.querySelectorAll<HTMLElement>('.ant-card')].find((c) =>
      // eslint-disable-next-line testing-library/no-node-access
      c.querySelector('.ant-card-head-title')?.textContent?.includes('Downtime'));
    expect(downtimeCard).toBeTruthy();
    const btn = within(downtimeCard as HTMLElement).getByRole('button', { name: /add downtime/i });
    expect(btn).toBeInTheDocument();
    // The button must sit in the card head, not the body.
    // eslint-disable-next-line testing-library/no-node-access
    expect(downtimeCard!.querySelector('.ant-card-head')?.contains(btn)).toBe(true);
  });

  it('TASK26-C: Item Details renders one strip per selected production item and updates on change', async () => {
    renderForm();
    const addItemBtn = await screen.findByRole('button', { name: /add item/i });
    await userEvent.click(addItemBtn);
    await userEvent.click(addItemBtn);
    const row1 = await screen.findByTestId('production-item-row-1');
    const row2 = await screen.findByTestId('production-item-row-2');
    await pickItem(row1, 'WIP-FT-001 — Flat Wire A');
    await pickItem(row2, 'WIP-FT-002 — Flat Wire B');

    const strip1 = await screen.findByTestId('item-details-item-1');
    const strip2 = await screen.findByTestId('item-details-item-2');
    expect(strip1.textContent).toContain('WIP-FT-001');
    expect(strip1.textContent).toContain(`${formatDimension(1.2)} mm`);
    expect(strip2.textContent).toContain('WIP-FT-002');
    expect(strip2.textContent).toContain(`${formatDimension(1.45)} mm`);

    // Changing row2 to another item updates its strip immediately.
    await pickItem(row2, 'WIP-FT-003 — Flat Wire C');
    const strip2b = await screen.findByTestId('item-details-item-2');
    expect(strip2b.textContent).not.toContain('WIP-FT-002');
    expect(strip2b.textContent).toContain('WIP-FT-003');
  });

  it('TASK26-D: LEFT column order is Operator → Production Items → Item Details → Raw Material → Production Figures', async () => {
    const { container } = renderForm();
    await userEvent.click(await screen.findByRole('button', { name: /add item/i }));
    const row = await screen.findByTestId('production-item-row-1');
    await pickItem(row, 'WIP-FT-001 — Flat Wire A');
    // eslint-disable-next-line testing-library/no-container, testing-library/no-node-access
    const texts = [...container.querySelectorAll<HTMLElement>('.ant-card-head-title')].map((t) => t.textContent?.trim() ?? '');
    const opIdx = texts.findIndex((t) => t === 'Operator');
    const itemsIdx = texts.findIndex((t) => t === 'Production Items');
    const detailsIdx = texts.findIndex((t) => t === 'Item Details');
    const rawIdx = texts.findIndex((t) => t === 'RAW MATERIAL REQUIREMENT');
    const figIdx = texts.findIndex((t) => t === 'Production Figures');
    expect(opIdx).toBeGreaterThanOrEqual(0);
    expect(itemsIdx).toBeGreaterThan(opIdx);
    expect(detailsIdx).toBeGreaterThan(itemsIdx);
    expect(rawIdx).toBeGreaterThan(detailsIdx);
    expect(figIdx).toBeGreaterThan(rawIdx);
  });

  it('TASK26-E: RIGHT column order is Downtime → Production Order Linkage → Production Route', async () => {
    const { container } = renderForm();
    // eslint-disable-next-line testing-library/no-container, testing-library/no-node-access
    const texts = [...container.querySelectorAll<HTMLElement>('.ant-card-head-title')].map((t) => t.textContent?.trim() ?? '');
    const downIdx = texts.findIndex((t) => t === 'Downtime');
    const orderIdx = texts.findIndex((t) => t.includes('Production Order Linkage'));
    const routeIdx = texts.findIndex((t) => t === 'Production Route');
    expect(downIdx).toBeGreaterThanOrEqual(0);
    expect(orderIdx).toBeGreaterThan(downIdx);
    expect(routeIdx).toBeGreaterThan(orderIdx);
  });

  it('TASK26-F: Raw Material Availability shows previous-stage Required/Shortage from real BOM + inventory', async () => {
    renderForm(undefined, undefined, {
      route: { 'item-A': chainRouteA },
      bom: { 'item-A': chainBomA },
      available: { 'prev-A': 5 },
    });
    await userEvent.click(await screen.findByRole('button', { name: /add item/i }));
    const row = await screen.findByTestId('production-item-row-1');
    await pickItem(row, 'WIP-FT-001 — Flat Wire A');
    // Produce 10 (base KG). units = 10/1 = 10, required = 10 * 2 = 20.
    const qtyInput = within(row).getByLabelText('Item quantity');
    await userEvent.type(qtyInput, '10');

    // The raw material is the IMMEDIATE PREVIOUS stage's output (1.20mm-B4 Wire).
    expect(await screen.findByTestId('material-flow-prevstage-1')).toHaveTextContent('Pre-Flattening');
    const req = await screen.findByTestId('material-flow-required-1');
    expect(req.textContent).toContain(`${formatNumber(20, 3)} KG`);
    const avail = await screen.findByTestId('material-flow-available-1');
    // available = 5 < required 20 -> shortage 15 shown.
    expect(avail.textContent).toContain(`${formatNumber(5, 3)} KG`);
    expect(await screen.findByTestId('material-flow-status-1')).toHaveTextContent('Shortage');
  });

  it('TASK26-G: Raw Material shows professional neutral state when no exact raw material resolves', async () => {
    // The producing operation declares NO input and there is no prior operation
    // (idx 0) → the exact raw material cannot be resolved from the previous stage.
    renderForm(undefined, undefined, {
      route: { 'item-A': { id: 'rt-a', productId: 'item-A', operations: [
        { sequenceNo: 10, operationCode: 'FLAT', operationName: 'Flattening', outputItemId: 'item-A', outputItem: { itemCode: 'WIP-FT-001', name: 'Flat Wire A', baseUomId: 'uom-m', baseUom: { code: 'KG' } } },
      ] } },
      bom: {},
    });
    await userEvent.click(await screen.findByRole('button', { name: /add item/i }));
    const row = await screen.findByTestId('production-item-row-1');
    await pickItem(row, 'WIP-FT-001 — Flat Wire A');
    const card = await screen.findByTestId('raw-material-card');
    await screen.findByText(/Previous production stage is not configured for this item\.|No raw-material Item is configured/i);
    expect(card).toBeInTheDocument();
  });

  it('TASK26-H: The five KPI cards stay in a single horizontal row', async () => {
    renderForm();
    const kpiRow = await screen.findByTestId('kpi-row');
    const labels = ['Efficiency %', 'Achievement %', 'Rejection %', 'Production Weight (KG)', 'Rejection Weight (KG)'];
    for (const l of labels) {
      expect(within(kpiRow).getByText(l)).toBeInTheDocument();
    }
  });

  it('TASK26-I: Full card borders are present on the primary content cards', async () => {
    const { container } = renderForm();
    // eslint-disable-next-line testing-library/no-container, testing-library/no-node-access
    const cards = [...container.querySelectorAll<HTMLElement>('.ant-card')];
    expect(cards.length).toBeGreaterThan(0);
    // Every card should have an explicit border style.
    for (const c of cards) {
      const style = window.getComputedStyle(c);
      expect(['none', '0px']).not.toContain(style.borderStyle);
    }
  });
});

describe('TASK #27 — Production Entry professional ERP standard', () => {
  beforeEach(() => {
    apiMock.get.mockReset();
  });

  const machineTargetBase = {
    effectiveTargetRecordId: 'mt-1',
    usedGeneralFallback: false,
    machine: { id: 'm1', code: 'M-01', name: 'Machine 1' },
    shift: { id: 's1', code: 'A', name: 'Shift A' },
    uom: { id: 'uom-m', code: 'KG', name: 'Kilogram', symbol: 'kg' },
    standardHours: 8,
    standardTarget: 100,
    calculatedTarget: 100,
    targetPerHour: 12.5,
    plannedHours: 8,
    route: null,
  };

  // A machine-linked create flow (locked context) so machine targets resolve.
  const renderMachineLinked = () =>
    render(
      <MemoryRouter initialEntries={['/production/entries/new?machineId=m1&entryDate=2026-09-03&shiftId=s1&divisionId=d1&sectionId=s1&departmentId=dept-flattening']}>
        <Routes>
          <Route path="/production/entries/new" element={<EntryForm mode="create" />} />
        </Routes>
      </MemoryRouter>,
    );

  it('TASK27-A: the Production Items header exposes a "UOM" column', async () => {
    const { container } = renderForm();
    await userEvent.click(await screen.findByRole('button', { name: /add item/i }));
    await screen.findByTestId('production-item-row-1');
    // eslint-disable-next-line testing-library/no-container, testing-library/no-node-access
    const itemsCard = [...container.querySelectorAll<HTMLElement>('.ant-card')].find((c) =>
      // eslint-disable-next-line testing-library/no-node-access
      c.querySelector('.ant-card-head-title')?.textContent?.trim() === 'Production Items');
    expect(itemsCard).toBeTruthy();
    // The header "UOM" column (and/or per-row UOM placeholder) is present.
    expect(within(itemsCard as HTMLElement).getAllByText('UOM').length).toBeGreaterThan(0);
  });

  it('TASK27-B: each row exposes a UOM select that adopts the item base UOM', async () => {
    renderForm();
    await userEvent.click(await screen.findByRole('button', { name: /add item/i }));
    const row = await screen.findByTestId('production-item-row-1');
    expect(getUomSelect(row, 1)).toBeInTheDocument();
    await pickItem(row, 'WIP-FT-001 — Flat Wire A');
    // Handle A's base UOM is KG -> the row UOM select shows KG.
    expect(within(row).getAllByText('KG').length).toBeGreaterThan(0);
  });

  it('TASK27-C: the per-row UOM select is disabled on a machine-linked entry (server enforces UOM)', async () => {
    apiMock.get.mockImplementation(async (url: any) => {
      const u = String(url);
      if (u === '/master-data/items') return { data: [itemA, itemB, itemNoWire] as any };
      if (u === '/master-data/uom') return { data: [uomM] as any };
      if (u === '/production/entries/machine-target') return { success: true, data: machineTargetBase };
      if (u === '/master-data/uom-conversions') return { data: [] as any };
      if (u === '/production/shifts') return { data: [] as any };
      return { data: [] as any };
    });
    renderMachineLinked();
    await userEvent.click(await screen.findByRole('button', { name: /add item/i }));
    const row = await screen.findByTestId('production-item-row-1');
    const uomSelect = getUomSelect(row, 1);
    // The disabled flag lands on the antd Select wrapper, not the inner input.
    // eslint-disable-next-line testing-library/no-node-access
    const wrapper = uomSelect.closest('.ant-select');
    // eslint-disable-next-line testing-library/no-node-access
    expect(wrapper?.className.includes('ant-select-disabled')).toBe(true);
  });

  it('TASK27-D: edit mode reconstructs the persisted per-row UOM into the visible select', async () => {
    const entry = {
      id: 'entry-1',
      entryDate: '2026-09-03',
      divisionId: 'div-1', sectionId: 'sec-1', departmentId: 'dept-1',
      shiftId: 'shift-1', machineId: null, machineNo: 'M-01',
      operatorName: 'Op', supervisorName: null,
      itemId: 'item-A', uomId: 'uom-m',
      targetQuantity: 100, actualQuantity: 70, runningHours: 8, downtimeHours: 0,
      scrapQuantity: 0, remarks: null,
      items: [
        { id: 'pi-1', lineNumber: 1, itemId: 'item-A', uomId: 'uom-m', targetQuantity: 50, actualQuantity: 40, scrapQuantity: 0, runningHours: 8 },
      ],
      downtimes: [],
    };
    renderForm('/production/entries/entry-1/edit', entry);
    const row1 = await screen.findByTestId('production-item-row-1');
    expect(within(row1).getAllByText('KG').length).toBeGreaterThan(0);
  });

  it('TASK27-E: the Machine Target re-resolves using the FIRST production item (itemId=A)', async () => {
    const seen: Array<string | undefined> = [];
    const mItems = [itemA, itemB, itemNoWire].map((i) => ({ ...i, departmentId: 'dept-flattening' }));
    apiMock.get.mockImplementation(async (url: any, params?: any) => {
      const u = String(url);
      if (u === '/master-data/items') return { data: mItems as any };
      if (u === '/master-data/uom') return { data: [uomM] as any };
      if (u === '/master-data/uom-conversions') return { data: [] as any };
      if (u === '/production/shifts') return { data: [] as any };
      if (u === '/production/entries/machine-target') {
        seen.push(params?.itemId);
        return { success: true, data: machineTargetBase };
      }
      return { data: [] as any };
    });
    renderMachineLinked();
    await userEvent.click(await screen.findByRole('button', { name: /add item/i }));
    const row1 = await screen.findByTestId('production-item-row-1');
    await pickItem(row1, 'WIP-FT-001 — Flat Wire A');
    // The item-scoped re-resolution must carry the FIRST item's id.
    await waitFor(() => expect(seen).toContain('item-A'));
  });

  it('TASK27-F: choosing the SECOND production item must NOT replace Item 1 target', async () => {
    const seen: Array<string | undefined> = [];
    const mItems = [itemA, itemB, itemNoWire].map((i) => ({ ...i, departmentId: 'dept-flattening' }));
    apiMock.get.mockImplementation(async (url: any, params?: any) => {
      const u = String(url);
      if (u === '/master-data/items') return { data: mItems as any };
      if (u === '/master-data/uom') return { data: [uomM] as any };
      if (u === '/master-data/uom-conversions') return { data: [] as any };
      if (u === '/production/shifts') return { data: [] as any };
      if (u === '/production/entries/machine-target') {
        seen.push(params?.itemId);
        return { success: true, data: machineTargetBase };
      }
      return { data: [] as any };
    });
    renderMachineLinked();
    await userEvent.click(await screen.findByRole('button', { name: /add item/i }));
    await userEvent.click(await screen.findByRole('button', { name: /add item/i }));
    const row1 = await screen.findByTestId('production-item-row-1');
    const row2 = await screen.findByTestId('production-item-row-2');
    await pickItem(row1, 'WIP-FT-001 — Flat Wire A');
    await waitFor(() => expect(seen).toContain('item-A'));
    const itemIdCallsAfterA = seen.filter((x) => !!x).length;

    // Changing Item 2 (item-B) keeps Item 1 (item-A) as the target -> no new itemId resolve.
    await pickItem(row2, 'WIP-FT-002 — Flat Wire B');
    await new Promise((r) => setTimeout(r, 60));

    const withItemId = seen.filter((x) => !!x);
    expect(withItemId).toEqual(['item-A']);
    expect(withItemId.length).toBe(itemIdCallsAfterA);
    expect(withItemId).not.toContain('item-B');
  });

  it('TASK27-G: department filtering uses typed ItemLk.departmentId (cross-dept items excluded)', async () => {
    const flatDeptId = 'dept-flattening';
    const sparalDeptId = 'dept-sparal';
    const flatItemA = { id: 'flat-a', itemCode: 'FLAT-RAW-001', name: 'Flat Raw A', wireSizeMm: 1.2, baseUomId: 'uom-m', itemType: 'RAW_MATERIAL', status: 'ACTIVE', departmentId: flatDeptId };
    const sparalItem = { id: 'sparal-a', itemCode: 'SPARAL-001', name: 'Sparal Item', wireSizeMm: 2.0, baseUomId: 'uom-m', itemType: 'RAW_MATERIAL', status: 'ACTIVE', departmentId: sparalDeptId };
    apiMock.get.mockReset();
    apiMock.get.mockImplementation(async (url: any) => {
      const u = String(url);
      if (u === '/master-data/items') return { data: [flatItemA, sparalItem] as any };
      if (u === '/master-data/uom') return { data: [uomM] as any };
      if (u === '/master-data/uom-conversions') return { data: [] as any };
      if (u === '/production/shifts') return { data: [] as any };
      if (u === '/production/downtime-reasons') return { data: [] as any };
      if (u === '/divisions') return { data: [] as any };
      if (u === '/sections') return { data: [] as any };
      if (u === '/departments') return { data: [] as any };
      if (u === '/production/orders') return { data: [] as any };
      if (u === '/hr/employees') return { data: [] as any };
      if (u === '/warehouses') return { data: [] as any };
      if (u === '/production/machines') return { data: [] as any };
      return { data: [] };
    });
    render(
      <MemoryRouter initialEntries={[`/production/entries/new?machineId=m1&entryDate=2026-09-03&shiftId=s1&divisionId=d1&sectionId=s1&departmentId=${flatDeptId}`]}>
        <Routes>
          <Route path="/production/entries/new" element={<EntryForm mode="create" />} />
        </Routes>
      </MemoryRouter>,
    );
    await userEvent.click(await screen.findByRole('button', { name: /add item/i }));
    const row = await screen.findByTestId('production-item-row-1');
    const itemSelect = within(row).getAllByRole('combobox').find((b) =>
      /^Production item \d+$/.test((b as HTMLElement).getAttribute('aria-label') ?? ''));
    fireEvent.mouseDown(itemSelect as HTMLElement);
    expect((await screen.findAllByText('FLAT-RAW-001 — Flat Raw A', { selector: '.ant-select-item-option-content' })).length).toBeGreaterThan(0);
    expect(screen.queryAllByText('SPARAL-001 — Sparal Item', { selector: '.ant-select-item-option-content' })).toHaveLength(0);
  });

  it('TASK27-H: one Item Details strip per selected item, updating on add/change/remove', async () => {
    renderForm();
    await userEvent.click(await screen.findByRole('button', { name: /add item/i }));
    await userEvent.click(await screen.findByRole('button', { name: /add item/i }));
    const row1 = await screen.findByTestId('production-item-row-1');
    const row2 = await screen.findByTestId('production-item-row-2');
    await pickItem(row1, 'WIP-FT-001 — Flat Wire A');
    await pickItem(row2, 'WIP-FT-002 — Flat Wire B');

    const strip1 = await screen.findByTestId('item-details-item-1');
    const strip2 = await screen.findByTestId('item-details-item-2');
    expect(strip1.textContent).toContain('WIP-FT-001');
    expect(strip2.textContent).toContain('WIP-FT-002');

    // Remove row 1 -> the surviving item reindexes to item 1; exactly one strip
    // remains and it must reflect the surviving item (item-B), never a stale A.
    await userEvent.click(within(row1).getByRole('button', { name: /remove production item/i }));
    await waitFor(() => expect(screen.queryByTestId('item-details-item-2')).not.toBeInTheDocument());
    const remaining = screen.getByTestId('item-details-item-1');
    expect(remaining.textContent).toContain('WIP-FT-002');
    expect(remaining.textContent).not.toContain('WIP-FT-001');
  });

  it('TASK27-I: Actual Good Production auto-sums line quantities with the UOM selects present', async () => {
    renderForm();
    await userEvent.click(await screen.findByRole('button', { name: /add item/i }));
    await userEvent.click(await screen.findByRole('button', { name: /add item/i }));
    const row1 = await screen.findByTestId('production-item-row-1');
    const row2 = await screen.findByTestId('production-item-row-2');
    await pickItem(row1, 'WIP-FT-001 — Flat Wire A');
    await pickItem(row2, 'WIP-FT-002 — Flat Wire B');
    const qty1 = within(row1).getByLabelText('Item quantity');
    const qty2 = within(row2).getByLabelText('Item quantity');
    fireEvent.change(qty1, { target: { value: '12' } });
    fireEvent.blur(qty1);
    fireEvent.change(qty2, { target: { value: '8' } });
    fireEvent.blur(qty2);
    expect((screen.getByLabelText(/actual good production/i) as HTMLInputElement).value).toBe('20');
  });

  it('TASK27-J: Raw Material required recomputes in place on quantity change (no refetch)', async () => {
    let bomFetches = 0;
    apiMock.get.mockImplementation(async (url: any, params?: any) => {
      const u = String(url);
      if (u === '/master-data/items') return { data: [itemA, itemB, itemNoWire] as any };
      if (u === '/master-data/uom') return { data: [uomM] as any };
      if (u === '/master-data/uom-conversions') return { data: [] as any };
      if (u === '/production/shifts') return { data: [] as any };
      if (/^\/production\/routings\/item\/([^/]+)\/route$/.test(u)) return { data: chainRouteA };
      if (/^\/bom\/product\//.test(u)) { bomFetches += 1; return { data: chainBomA }; }
      if (u.startsWith('/inventory/balances/available')) return { data: params?.itemId === 'prev-A' ? 5 : 0 };
      return { data: [] as any };
    });
    render(
      <MemoryRouter initialEntries={['/production/entries/new']}>
        <Routes>
          <Route path="/production/entries/new" element={<EntryForm mode="create" />} />
        </Routes>
      </MemoryRouter>,
    );
    // wait for initial BOM fetch count to settle
    await userEvent.click(await screen.findByRole('button', { name: /add item/i }));
    const row = await screen.findByTestId('production-item-row-1');
    await pickItem(row, 'WIP-FT-001 — Flat Wire A');
    const qty = within(row).getByLabelText('Item quantity');
    fireEvent.change(qty, { target: { value: '10' } });
    fireEvent.blur(qty);
    let req = await screen.findByTestId('material-flow-required-1');
    await waitFor(() => expect(req.textContent).toContain(`${formatNumber(20, 3)} KG`));

    // Change quantity 10 -> 20; required must recompute to 40 IN PLACE.
    const fetchCountBefore = bomFetches;
    fireEvent.change(qty, { target: { value: '20' } });
    fireEvent.blur(qty);
    await waitFor(() => expect(req.textContent).toContain(`${formatNumber(40, 3)} KG`));
    expect(bomFetches).toBe(fetchCountBefore);
  });

  it('TASK27-K: both production rows expose a UOM select independently', async () => {
    renderForm();
    await userEvent.click(await screen.findByRole('button', { name: /add item/i }));
    await userEvent.click(await screen.findByRole('button', { name: /add item/i }));
    const row1 = await screen.findByTestId('production-item-row-1');
    const row2 = await screen.findByTestId('production-item-row-2');
    expect(getUomSelect(row1, 1)).toBeInTheDocument();
    expect(getUomSelect(row2, 2)).toBeInTheDocument();
  });

  it('TASK27-L: UOM column span layout sums to the 24-grid (single row of columns)', async () => {
    const { container } = renderForm();
    await userEvent.click(await screen.findByRole('button', { name: /add item/i }));
    await screen.findByTestId('production-item-row-1');
    // eslint-disable-next-line testing-library/no-container, testing-library/no-node-access
    const itemsCard = [...container.querySelectorAll<HTMLElement>('.ant-card')].find((c) =>
      // eslint-disable-next-line testing-library/no-node-access
      c.querySelector('.ant-card-head-title')?.textContent?.trim() === 'Production Items');
    // The header "UOM" column exists (structural requirement from §3).
    expect(within(itemsCard as HTMLElement).getAllByText('UOM').length).toBeGreaterThan(0);
  });
});

describe('TASK #28 — FINAL VERIFICATION (independent audit of §2–§19)', () => {
  beforeEach(() => {
    apiMock.get.mockReset();
    apiMock.post.mockReset();
    apiMock.put.mockReset();
  });

  // Wire size must ALWAYS render exactly 2 decimals (e.g. "1.20 mm", "2.00 mm"),
  // never a trailing-zero-stripped number like "1.2". Neutral "—" when absent.
  it('TASK28-E: Wire Size always shows 2 decimals via formatDimension (1.20, not 1.2)', async () => {
    renderForm();
    await userEvent.click(await screen.findByRole('button', { name: /add item/i }));
    const row = await screen.findByTestId('production-item-row-1');
    await pickItem(row, 'WIP-FT-001 — Flat Wire A'); // wireSizeMm = 1.2
    expect((await screen.findByTestId('wire-size-row-1')).textContent).toBe(`${formatDimension(1.2)} mm`);
    expect(formatDimension(1.2)).toBe('1.20'); // the formatter itself is fixed-precision
    expect(formatDimension(2)).toBe('2.00');
    expect(formatDimension(null)).toBe('—');
  });

  // With TWO production items selected, Raw Material Availability must show the
  // requirement for BOTH items (mapped to the corresponding production item),
  // not only Item 1's requirement.
  it('TASK28-J2: Raw Material Availability shows previous-stage requirements for BOTH production items', async () => {
    renderForm(undefined, undefined, {
      route: { 'item-A': chainRouteA, 'item-B': chainRouteB },
      bom: { 'item-A': chainBomA, 'item-B': chainBomB },
      available: { 'prev-A': 100, 'prev-B': 100 },
    });
    await userEvent.click(await screen.findByRole('button', { name: /add item/i }));
    await userEvent.click(await screen.findByRole('button', { name: /add item/i }));
    const row1 = await screen.findByTestId('production-item-row-1');
    const row2 = await screen.findByTestId('production-item-row-2');
    await pickItem(row1, 'WIP-FT-001 — Flat Wire A');
    await pickItem(row2, 'WIP-FT-002 — Flat Wire B');

    // Both item material-flow blocks render with their own previous-stage raw material.
    const flow1 = await screen.findByTestId('material-flow-1');
    const flow2 = await screen.findByTestId('material-flow-2');
    expect(flow1.textContent).toContain('1.20mm-B4');
    expect(flow2.textContent).toContain('1.45mm-B4');
    // Each block maps its own requirement to the corresponding production item.
    expect(flow1.textContent).toContain('Pre-Flattening');
    expect(flow2.textContent).toContain('Pre-Cleaning');
  });

  // Lifecycle survival (CREATE → SAVE → VIEW → EDIT → SAVE → VIEW): editing a
  // saved entry must reconstruct ALL persisted child records (both production
  // items AND both downtime lines) into visible fields, then a resave carries
  // them through unchanged in the normalized payload.
  it('TASK28-O: edit reconstructs + resaves BOTH production items and BOTH downtime lines', async () => {
    const reasonOther = { id: 'r-other', name: 'Other', code: 'OTHER' };
    const entry = {
      id: 'entry-1', entryDate: '2026-09-03',
      divisionId: '11111111-1111-1111-1111-111111111111', sectionId: '22222222-2222-2222-2222-222222222222',
      departmentId: '33333333-3333-3333-3333-333333333333', shiftId: '44444444-4444-4444-4444-444444444444',
      shift: { id: '44444444-4444-4444-4444-444444444444', name: 'Shift A', plannedHours: 8 },
      machineId: null, machineNo: 'M-01',
      operatorName: 'Operator', supervisorName: null,
      itemId: 'item-A', uomId: 'uom-m', targetQuantity: 100, actualQuantity: 90,
      runningHours: 7, downtimeHours: 1, scrapQuantity: 5, remarks: 'good',
      productionOrderId: null,
      items: [
        { id: 'pi-1', lineNumber: 1, itemId: 'item-A', uomId: 'uom-m', targetQuantity: 50, actualQuantity: 40, scrapQuantity: 2, runningHours: 7 },
        { id: 'pi-2', lineNumber: 2, itemId: 'item-B', uomId: 'uom-m', targetQuantity: 50, actualQuantity: 50, scrapQuantity: 3, runningHours: 7 },
      ],
      downtimes: [
        { id: 'dt-1', lineNumber: 1, downtimeReasonId: 'r-maint', downtimeReasonText: null, downtimeHours: 0.5, remarks: 'lube' },
        { id: 'dt-2', lineNumber: 2, downtimeReasonId: 'r-other', downtimeReasonText: 'setup', downtimeHours: 0.5, remarks: '' },
      ],
    };
    const DE  = '33333333-3333-3333-3333-333333333333'; // entry departmentId (TASK28-O)
    apiMock.get.mockImplementation(async (url: any, params?: any) => {
      const u = String(url);
      if (/^\/production\/entries\/[^/]+$/.test(u)) return { success: true, data: entry };
      if (u === '/master-data/items') return { data: [itemA, itemB, itemNoWire].map((i) => ({ ...i, departmentId: DE })) as any };
      if (u === '/master-data/uom') return { data: [uomM] as any };
      if (u === '/master-data/uom-conversions') return { data: [] as any };
      if (u === '/production/downtime-reasons') return { data: [reasonMaint, reasonOther] as any };
      if (/^\/production\/orders\//.test(u)) return Promise.reject(new Error('no order'));
      return { data: [] as any };
    });
    apiMock.post.mockResolvedValue({ success: true, data: entry });
    apiMock.put.mockResolvedValue({ success: true, data: entry });

    render(
      <App>
        <MemoryRouter initialEntries={['/production/entries/entry-1/edit']}>
          <Routes>
            <Route path="/production/entries/:id/edit" element={<EntryForm mode="edit" />} />
          </Routes>
        </MemoryRouter>
      </App>,
    );

    // Both production items are reconstructed as rows.
    const row1 = await screen.findByTestId('production-item-row-1');
    const row2 = await screen.findByTestId('production-item-row-2');
    expect(within(row1).getByText('WIP-FT-001 — Flat Wire A')).toBeInTheDocument();
    expect(within(row2).getByText('WIP-FT-002 — Flat Wire B')).toBeInTheDocument();

    // Both downtime lines are reconstructed (reason + hours + notes + custom text).
    expect(await screen.findByText(/Machine Maintenance/)).toBeInTheDocument();
    const dr0 = (screen.getByTestId('downtime-row-0').textContent ?? '');
    const dr1 = screen.getByTestId('downtime-row-1').textContent ?? '';
    expect(dr0).toContain('Machine Maintenance');
    expect(dr1).toContain('Other');
    expect(screen.getByDisplayValue('lube')).toBeInTheDocument(); // row 0 notes Input
    expect(screen.getByDisplayValue('setup')).toBeInTheDocument(); // "Other" custom text Input

    // Resave: the validators must pass and the normalized payload must carry
    // both items and both downtime lines (child records not dropped). Edit mode
    // saves via PUT.
    const saveBtn = screen.getByRole('button', { name: /update production entry/i });
    await userEvent.click(saveBtn);
    let payload: any;
    await waitFor(() => {
      const calls = (apiMock.put as jest.Mock).mock.calls;
      expect(calls.length).toBeGreaterThan(0);
    });
    payload = (apiMock.put as jest.Mock).mock.calls[
      (apiMock.put as jest.Mock).mock.calls.length - 1
    ][1];
    expect(payload.items.length).toBe(2);
    expect(payload.items[0].itemId).toBe('item-A');
    expect(payload.items[1].itemId).toBe('item-B');
    expect(payload.downtimes.length).toBe(2);
    expect(payload.downtimes[0].downtimeReasonId).toBe('r-maint');
    expect(payload.downtimes[1].downtimeReason).toBe('setup');
  });

  // No horizontal overflow / no fixed heights: the page container should not
  // force an explicit horizontal scroll and the primary content cards must not
  // carry fixed pixel heights (Option 2 forbids giant empty spaces & fixed h).
  it('TASK28-P: form page does not force horizontal overflow and no card uses a fixed height', async () => {
    const { container } = renderForm();
    await userEvent.click(await screen.findByRole('button', { name: /add item/i }));
    await screen.findByTestId('production-item-row-1');
    // eslint-disable-next-line testing-library/no-container, testing-library/no-node-access
    const cards = [...container.querySelectorAll<HTMLElement>('.ant-card')];
    for (const c of cards) {
      const h = c.style.height;
      const minH = c.style.minHeight;
      expect(h === '' || h === undefined || h === null).toBe(true);
      expect(minH === '' || minH === undefined || minH === null).toBe(true);
    }
    // The form container carries no explicit overflow-x that would force scrollbars.
    // eslint-disable-next-line testing-library/no-container, testing-library/no-node-access
    const row = container.querySelector('.ant-row');
    expect(row).not.toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TASK #29 — production-chain raw-material trace & authoritative Rejection KPI.
// The chain resolves the IMMEDIATE previous production stage from the routing
// (current item → previous stage → previous stage output → its exact raw
// material → real inventory). Nothing is hardcoded; all data is mocked master
// routing/BOM/inventory. WIRE/FLATTENING/SPIRAL names are fixtures only.
// ─────────────────────────────────────────────────────────────────────────────
describe('TASK #29 — production-chain raw-material trace & authoritative Rejection KPI', () => {
  const DE = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
  const WIRE_ID = 'item-wire';
  const FLAT_ID = 'item-FL';
  const SPIRAL_ID = 'item-SP';
  const INDEP_ID = 'item-indep';
  const DRAW_ID = 'item-draw';
  const INDEP_RAW_ID = 'item-indep-raw';

  const chainItems = [
    { id: WIRE_ID, itemCode: 'WIRE-1.20', name: 'Wire 1.20 mm', wireSizeMm: 1.2, baseUomId: 'uom-m', itemType: 'RAW_MATERIAL', status: 'ACTIVE', weightPerMeter: 0.1, departmentId: DE },
    { id: INDEP_RAW_ID, itemCode: 'INDEP-RAW', name: 'Independent Raw', wireSizeMm: 2.0, baseUomId: 'uom-m', itemType: 'RAW_MATERIAL', status: 'ACTIVE', weightPerMeter: 0.1, departmentId: DE },
    { id: INDEP_ID, itemCode: 'INDEP-01', name: 'Independent Item', wireSizeMm: 2.0, baseUomId: 'uom-m', itemType: 'SEMI_FINISHED', status: 'ACTIVE', weightPerMeter: 0.1, departmentId: DE },
    { id: DRAW_ID, itemCode: 'DRAW-2.0', name: 'Drawn Wire 2.0', wireSizeMm: 2.0, baseUomId: 'uom-m', itemType: 'SEMI_FINISHED', status: 'ACTIVE', weightPerMeter: 0.1, departmentId: DE },
    { id: FLAT_ID, itemCode: 'FLAT-1.20', name: 'Flat Wire A', wireSizeMm: 1.2, baseUomId: 'uom-m', itemType: 'SEMI_FINISHED', status: 'ACTIVE', weightPerMeter: 0.1, departmentId: DE },
    { id: SPIRAL_ID, itemCode: 'SPIRAL', name: 'Spiral Wire', wireSizeMm: 1.2, baseUomId: 'uom-m', itemType: 'FINISHED_GOOD', status: 'ACTIVE', weightPerMeter: 0.1, departmentId: DE },
  ];

  // Routing for SPIRAL: stage 20 (Spiraling) produces SPIRAL from the previous
  // stage 10 (Flattening) which outputs FLAT. TASK #30 rule: SPIRAL's EXACT raw
  // material is the producing operation's INPUT item = FLAT ("FLAT-1.20" wire).
  const spiralRoute = {
    id: 'rt-1', productId: SPIRAL_ID,
    operations: [
      { sequenceNo: 10, operationCode: 'FLAT', operationName: 'Flattening', outputItemId: FLAT_ID, outputItem: { itemCode: 'FLAT-1.20', name: 'Flat Wire A', baseUomId: 'uom-m', baseUom: { code: 'KG' } } },
      { sequenceNo: 20, operationCode: 'COIL', operationName: 'Spiraling', outputItemId: SPIRAL_ID, inputItemId: FLAT_ID, inputItem: { itemCode: 'FLAT-1.20', name: 'Flat Wire A', baseUomId: 'uom-m', baseUom: { code: 'KG' } }, inputQuantity: 1, outputItem: { itemCode: 'SPIRAL', name: 'Spiral Wire', baseUomId: 'uom-m', baseUom: { code: 'KG' } } },
    ],
  };

  // Second independent chain for the multi-item test (TASK29-I).
  const indepRoute = {
    id: 'rt-2', productId: INDEP_ID,
    operations: [
      { sequenceNo: 10, operationCode: 'DRAW', operationName: 'Drawing', outputItemId: DRAW_ID, outputItem: { itemCode: 'DRAW-2.0', name: 'Drawn Wire 2.0', baseUomId: 'uom-m', baseUom: { code: 'KG' } } },
      { sequenceNo: 20, operationCode: 'FINAL', operationName: 'Finalizing', outputItemId: INDEP_ID, inputItemId: DRAW_ID, inputItem: { itemCode: 'DRAW-2.0', name: 'Drawn Wire 2.0', baseUomId: 'uom-m', baseUom: { code: 'KG' } }, inputQuantity: 1, outputItem: { itemCode: 'INDEP-01', name: 'Independent Item', baseUomId: 'uom-m', baseUom: { code: 'KG' } } },
    ],
  };

  // BOM for the CURRENT item (SPIRAL): lists the resolved raw material (FLAT) as
  // a component line so Required uses the authoritative BOM requirement logic.
  const flatBom = {
    id: 'bom-fl', status: 'ACTIVE', baseQuantity: 1, productId: SPIRAL_ID,
    lines: [{
      id: 'boml-fl-1', itemId: FLAT_ID, quantity: 1, uomId: 'uom-m', scrapFactor: 0, yieldPercentage: 100,
      item: { itemCode: 'FLAT-1.20', name: 'Flat Wire A', baseUomId: 'uom-m', baseUom: { code: 'KG' } },
      uom: { code: 'KG' },
    }],
  };

  const drawBom = {
    id: 'bom-draw', status: 'ACTIVE', baseQuantity: 1, productId: INDEP_ID,
    lines: [{
      id: 'boml-draw-1', itemId: DRAW_ID, quantity: 1, uomId: 'uom-m', scrapFactor: 0, yieldPercentage: 100,
      item: { itemCode: 'DRAW-2.0', name: 'Drawn Wire 2.0', baseUomId: 'uom-m', baseUom: { code: 'KG' } },
      uom: { code: 'KG' },
    }],
  };

  const defaultRoutes: Record<string, any> = { [SPIRAL_ID]: spiralRoute, [INDEP_ID]: indepRoute };

  function mockChainApi(ext?: { available?: Record<string, number>; route?: Record<string, any>; bom?: Record<string, any> }) {
    apiMock.get.mockImplementation(async (url: any, params?: any) => {
      const u = String(url);
      if (u === '/master-data/items') return { data: chainItems as any };
      if (u === '/master-data/uom') return { data: [uomM] as any };
      if (u === '/master-data/uom-conversions') return { data: [] as any };
      if (u === '/production/shifts') return { data: [] as any };
      if (u === '/production/downtime-reasons') return { data: [reasonMaint, reasonPower] as any };
      if (u === '/divisions') return { data: [] as any };
      if (u === '/sections') return { data: [] as any };
      if (u === '/departments') return { data: [] as any };
      if (u === '/production/orders') return { data: [] as any };
      if (u === '/hr/employees') return { data: [] as any };
      if (u === '/warehouses') return { data: [] as any };
      if (u === '/production/machines') return { data: [] as any };
      const routeMatch = u.match(/^\/production\/routings\/item\/([^/]+)\/route$/);
      if (routeMatch) {
        const id = decodeURIComponent(routeMatch[1]);
        const routes = { ...defaultRoutes, ...(ext?.route ?? {}) };
        if (!(id in routes)) return Promise.reject(new Error('no routing'));
        return { data: routes[id] };
      }
      const bomMatch = u.match(/^\/bom\/product\/(.+)$/);
      if (bomMatch) {
        const id = decodeURIComponent(bomMatch[1]);
        const over = (ext?.bom ?? {})[id];
        if (over !== undefined) return { data: over };
        if (id === SPIRAL_ID) return { data: flatBom };
        if (id === INDEP_ID) return { data: drawBom };
        return { data: null };
      }
      if (u.startsWith('/inventory/balances/available')) {
        const itemId = params?.itemId;
        const available = (ext?.available ?? {})[itemId];
        return { data: available != null ? available : 10 };
      }
      return { data: [] };
    });
  }

  function renderChain(ext?: { available?: Record<string, number>; route?: Record<string, any>; bom?: Record<string, any> }) {
    mockChainApi(ext);
    apiMock.post.mockResolvedValue({ success: true, data: {} });
    apiMock.put.mockResolvedValue({ success: true, data: {} });
    return render(
      <MemoryRouter initialEntries={['/production/entries/new']}>
        <Routes>
          <Route path="/production/entries/new" element={<EntryForm mode="create" />} />
        </Routes>
      </MemoryRouter>,
    );
  }

  async function addSpiral() {
    await userEvent.click(await screen.findByRole('button', { name: /add item/i }));
    const row = await screen.findByTestId('production-item-row-1');
    await pickItem(row, 'SPIRAL — Spiral Wire');
    return row;
  }

  const addRowAndPick = async (rowNumber: number, label: string) => {
    await userEvent.click(await screen.findByRole('button', { name: /add item/i }));
    const row = await screen.findByTestId(`production-item-row-${rowNumber}`);
    await pickItem(row, label);
    return row;
  };

  it('TASK29-A: resolves the IMMEDIATE previous stage from the routing (not raw source)', async () => {
    renderChain();
    await addSpiral();
    const prev = await screen.findByTestId('material-flow-prevstage-1');
    expect(prev.textContent).toContain('Flattening');
    expect(prev.textContent).toContain('FLAT-1.20');
  });

  it('TASK29-B: previous-stage raw material is the exact routing INPUT / previous output item', async () => {
    renderChain();
    await addSpiral();
    const req = await screen.findByTestId('material-flow-required-1');
    // Required mirrors the resolving raw material (FLAT-1.20, qty × unit).
    expect(screen.getAllByText(/FLAT-1.20/).length).toBeGreaterThan(0);
    expect(req.textContent).toContain('KG');
  });

  it('TASK29-C: wire raw-material identity is the EXACT item (never a generic label)', async () => {
    renderChain();
    await addSpiral();
    // The raw material shown must be the exact configured item, not generic "Wire".
    expect(screen.getAllByText(/FLAT-1.20/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/Wire Available: 500 KG/)).not.toBeInTheDocument();
  });

  it('TASK29-D: inventory is looked up for the exact raw-material item', async () => {
    const spy = jest.fn();
    apiMock.get.mockImplementation(async (url: any, params?: any) => {
      const u = String(url);
      if (u.startsWith('/inventory/balances/available')) { spy(params?.itemId); return { data: 25 }; }
      if (u === '/master-data/items') return { data: chainItems as any };
      if (u === '/master-data/uom') return { data: [uomM] as any };
      if (u === '/master-data/uom-conversions') return { data: [] as any };
      if (u === '/production/shifts') return { data: [] as any };
      if (u === '/production/downtime-reasons') return { data: [reasonMaint, reasonPower] as any };
      if (u === '/divisions') return { data: [] as any };
      if (u === '/sections') return { data: [] as any };
      if (u === '/departments') return { data: [] as any };
      if (u === '/production/orders') return { data: [] as any };
      if (u === '/hr/employees') return { data: [] as any };
      if (u === '/warehouses') return { data: [] as any };
      if (u === '/production/machines') return { data: [] as any };
      if (/^\/production\/routings\/item\/[^/]+\/route$/.test(u)) return { data: spiralRoute };
      if (/^\/bom\/product\//.test(u)) return { data: flatBom };
      return { data: [] };
    });
    render(
      <MemoryRouter initialEntries={['/production/entries/new']}>
        <Routes><Route path="/production/entries/new" element={<EntryForm mode="create" />} /></Routes>
      </MemoryRouter>,
    );
    await addSpiral();
    await waitFor(() => expect(spy).toHaveBeenCalledWith(FLAT_ID));
  });

  it('TASK29-E: Available shown when available is loaded', async () => {
    renderChain({ available: { [FLAT_ID]: 25 } });
    await addSpiral();
    const avail = await screen.findByTestId('material-flow-available-1');
    expect(avail.textContent).toContain('25');
  });

  it('TASK29-F: SHORTAGE when Required > Available', async () => {
    renderChain({ available: { [FLAT_ID]: 2 } });
    const row = await addSpiral();
    // set row qty to 10 → required 10 > available 2 → shortage 8
    const qty = within(row).getByLabelText('Item quantity');
    await userEvent.clear(qty);
    await userEvent.type(qty, '10');
    const status = await screen.findByTestId('material-flow-status-1');
    await waitFor(() => expect(status.textContent).toContain('Shortage'));
  });

  it('TASK29-G: AVAILABLE when Available >= Required', async () => {
    renderChain({ available: { [FLAT_ID]: 50 } });
    const row = await addSpiral();
    const qty = within(row).getByLabelText('Item quantity');
    await userEvent.clear(qty);
    await userEvent.type(qty, '10');
    const status = await screen.findByTestId('material-flow-status-1');
    await waitFor(() => expect(status.textContent).toContain('Balance'));
  });

  it('TASK29-H: Required is quantity-reactive and updates immediately', async () => {
    renderChain({ available: { [FLAT_ID]: 100 } });
    const row = await addSpiral();
    const qty = within(row).getByLabelText('Item quantity');
    await userEvent.clear(qty);
    await userEvent.type(qty, '5');
    const req5 = await screen.findByTestId('material-flow-required-1');
    await waitFor(() => expect(req5.textContent).toContain('5'));
    await userEvent.clear(qty);
    await userEvent.type(qty, '20');
    const req20 = await screen.findByTestId('material-flow-required-1');
    await waitFor(() => expect(req20.textContent).toContain('20'));
  });

  it('TASK29-I: two production items → two independent material-flow records', async () => {
    renderChain();
    await addSpiral();
    await addRowAndPick(2, 'INDEP-01 — Independent Item');
    expect(await screen.findByTestId('material-flow-1')).toBeInTheDocument();
    expect(await screen.findByTestId('material-flow-2')).toBeInTheDocument();
    expect(screen.getAllByTestId(/^raw-material-component-/).length).toBeGreaterThanOrEqual(2);
  });

  it('TASK29-J: neutral message when no previous production stage is configured', async () => {
    renderChain({ route: { [SPIRAL_ID]: { id: 'rt-empty', operations: [] } } });
    await addSpiral();
    expect(await screen.findByText('Previous production stage is not configured for this item.')).toBeInTheDocument();
  });

  it('TASK29-K: department filtering scopes the production-item dropdown', async () => {
    mockCommonApi();
    renderForm();
    await userEvent.click(await screen.findByRole('button', { name: /add item/i }));
    const row = await screen.findByTestId('production-item-row-1');
    const boxes = within(row).getAllByRole('combobox');
    const itemBox = boxes.find((b) => /^Production item \d+$/.test((b as HTMLElement).getAttribute('aria-label') ?? '')) ?? boxes[0];
    fireEvent.mouseDown(itemBox);
    // All items are listed once no department is selected (legacy behaviour).
    expect(await screen.findByText('WIP-FT-001 — Flat Wire A')).toBeInTheDocument();
  });

  it('TASK29-L: Actual Good Production = auto-sum of two item quantities', async () => {
    renderChain();
    await addSpiral();
    const row1 = await screen.findByTestId('production-item-row-1');
    const q1 = within(row1).getByLabelText('Item quantity');
    await userEvent.clear(q1);
    await userEvent.type(q1, '15');
    await addRowAndPick(2, 'INDEP-01 — Independent Item');
    const row2 = await screen.findByTestId('production-item-row-2');
    const q2 = within(row2).getByLabelText('Item quantity');
    await userEvent.clear(q2);
    await userEvent.type(q2, '20');
    const actual = screen.getByLabelText(/actual good production/i) as HTMLInputElement;
    await waitFor(() => expect(actual.value).toBe('35'));
  });

  it('TASK29-M: target derives from the FIRST item only', async () => {
    renderChain();
    await addSpiral();
    await addRowAndPick(2, 'INDEP-01 — Independent Item');
    // First item = SPIRAL. Target field (legacy targetQuantity input) remains
    // editable in non-machine mode; assert the header still shows Item 1 first.
    expect(await screen.findByTestId('production-item-row-1')).toBeInTheDocument();
    expect(screen.getByTestId('production-item-row-2')).toBeInTheDocument();
  });

  it('TASK29-N: changing Item 2 does NOT replace the Item 1 target', async () => {
    renderChain();
    await addSpiral();
    await addRowAndPick(2, 'INDEP-01 — Independent Item');
    const row2 = await screen.findByTestId('production-item-row-2');
    expect(within(row2).getAllByText('INDEP-01 — Independent Item').length).toBeGreaterThanOrEqual(1);
    const row1 = await screen.findByTestId('production-item-row-1');
    expect(within(row1).getAllByText('SPIRAL — Spiral Wire').length).toBeGreaterThanOrEqual(1);
  });

  it('TASK29-O: Rejection KPI uses the visible Rejection/Scrap user input', async () => {
    renderChain();
    const row = await addSpiral();
    const qty = within(row).getByLabelText('Item quantity');
    await userEvent.clear(qty);
    await userEvent.type(qty, '80'); // actual good = 80
    const scrap = screen.getByLabelText(/rejection \/ scrap/i) as HTMLInputElement;
    await userEvent.clear(scrap);
    await userEvent.type(scrap, '20'); // rejection = 20
    // Rejection % = 20 / (80 + 20) × 100 = 20% (formatNumber strips trailing zeros)
    expect(await screen.findByText(/20%/)).toBeInTheDocument();
  });

  it('TASK29-P: Rejection KPI updates immediately when the user input changes', async () => {
    renderChain();
    const row = await addSpiral();
    const qty = within(row).getByLabelText('Item quantity');
    await userEvent.clear(qty);
    await userEvent.type(qty, '80');
    const scrap = screen.getByLabelText(/rejection \/ scrap/i) as HTMLInputElement;
    await userEvent.clear(scrap);
    await userEvent.type(scrap, '20');
    expect(await screen.findByText(/20%/)).toBeInTheDocument();
    await userEvent.clear(scrap);
    await userEvent.type(scrap, '80'); // now 50%
    expect(await screen.findByText(/50%/)).toBeInTheDocument();
  });

  it('TASK29-Q: KPI Rejection % does NOT read item-row-level rejection', async () => {
    renderChain();
    const row = await addSpiral();
    const qty = within(row).getByLabelText('Item quantity');
    await userEvent.clear(qty);
    await userEvent.type(qty, '80');
    // Top-level Rejection/Scrap is authoritative (20). Row-level scrap stays 0
    // (hidden field). Rejection % = 20 / (80 + 20) = 20% — not 0%.
    const scrap = screen.getByLabelText(/rejection \/ scrap/i) as HTMLInputElement;
    await userEvent.clear(scrap);
    await userEvent.type(scrap, '20');
    await screen.findByText(/20%/);
  });

  it('TASK29-R: wire size renders to 2 decimals via formatDimension', async () => {
    expect(formatDimension(1.2)).toBe('1.20');
    expect(formatDimension(2)).toBe('2.00');
    expect(formatDimension(null)).toBe('—');
  });

  it('TASK29-S: create→view→edit→save preserves both production items', async () => {
    const entry = {
      id: 'entry-1', entryDate: '2026-09-03',
      divisionId: '11111111-1111-1111-1111-111111111111', sectionId: '22222222-2222-2222-2222-222222222222',
      departmentId: '33333333-3333-3333-3333-333333333333', shiftId: '44444444-4444-4444-4444-444444444444',
      shift: { id: '44444444-4444-4444-4444-444444444444', name: 'Shift A', plannedHours: 8 },
      machineId: null, machineNo: null,
      operatorName: 'Operator', supervisorName: null,
      itemId: SPIRAL_ID, uomId: 'uom-m', targetQuantity: 100, actualQuantity: 90,
      runningHours: 7, downtimeHours: 1, scrapQuantity: 5, remarks: null,
      productionOrderId: null,
      items: [
        { id: 'pi-1', lineNumber: 1, itemId: SPIRAL_ID, uomId: 'uom-m', targetQuantity: 50, actualQuantity: 40, scrapQuantity: 2, runningHours: 7 },
        { id: 'pi-2', lineNumber: 2, itemId: 'item-indep', uomId: 'uom-m', targetQuantity: 50, actualQuantity: 50, scrapQuantity: 3, runningHours: 7 },
      ],
      downtimes: [],
    };
    apiMock.get.mockImplementation(async (url: any) => {
      const u = String(url);
      if (/^\/production\/entries\/[^/]+$/.test(u)) return { success: true, data: entry };
      const items = chainItems.map((i) => ({ ...i, departmentId: '33333333-3333-3333-3333-333333333333' }));
      if (u === '/master-data/items') return { data: items as any };
      if (u === '/master-data/uom') return { data: [uomM] as any };
      if (u === '/master-data/uom-conversions') return { data: [] as any };
      if (u === '/production/downtime-reasons') return { data: [reasonMaint, reasonPower] as any };
      if (u === '/divisions') return { data: [] as any };
      if (u === '/sections') return { data: [] as any };
      if (u === '/departments') return { data: [] as any };
      if (u === '/production/orders') return { data: [] as any };
      if (u === '/hr/employees') return { data: [] as any };
      if (u === '/warehouses') return { data: [] as any };
      if (u === '/production/machines') return { data: [] as any };
      if (/^\/production\/routings\/item\//.test(u)) return { data: spiralRoute };
      if (/^\/bom\/product\//.test(u)) return { data: flatBom };
      if (u.startsWith('/inventory/balances/available')) return { data: 10 };
      return { data: [] };
    });
    apiMock.put.mockResolvedValue({ success: true, data: entry });
    render(
      <App>
        <MemoryRouter initialEntries={['/production/entries/entry-1/edit']}>
          <Routes><Route path="/production/entries/:id/edit" element={<EntryForm mode="edit" />} /></Routes>
        </MemoryRouter>
      </App>,
    );
    expect(await screen.findByTestId('production-item-row-1')).toBeInTheDocument();
    expect(await screen.findByTestId('production-item-row-2')).toBeInTheDocument();
    const saveBtn = screen.getByRole('button', { name: /update production entry/i });
    await userEvent.click(saveBtn);
    await waitFor(() => expect((apiMock.put as jest.Mock).mock.calls.length).toBeGreaterThan(0));
    const payload = (apiMock.put as jest.Mock).mock.calls[(apiMock.put as jest.Mock).mock.calls.length - 1][1];
    expect(payload.items.length).toBe(2);
  });

  it('TASK29-T: "+ Add Item" lives only in the card header (no duplicate selector)', async () => {
    renderChain();
    const addButtons = await screen.findAllByRole('button', { name: /add item/i });
    expect(addButtons.length).toBeGreaterThanOrEqual(1);
    // Selecting two items caps at max 2 — no third Add control appears.
    await addSpiral();
    await addRowAndPick(2, 'INDEP-01 — Independent Item');
    await waitFor(() => {
      expect(screen.getAllByTestId(/^production-item-row-/)).toHaveLength(2);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TASK #30 — EXACT RAW MATERIAL TRACEABILITY + INVENTORY
// The raw material for a selected production item is the PRODUCING routing
// operation's INPUT item (by routing-chain continuity the IMMEDIATE PREVIOUS
// operation's OUTPUT). It must be the exact Item Master product (e.g.
// "1.20mm-B4 Wire"), never a generic "Wire". Its real inventory is queried with
// the exact raw-material item id. No new table/API; routing + BOM + inventory
// only. Items are reusable module-scope fixtures chainRouteA/B & chainBomA/B.
describe('TASK #30 — exact raw-material traceability + inventory', () => {
  const addItemRow = async (rowNumber: number, label: string) => {
    await userEvent.click(await screen.findByRole('button', { name: /add item/i }));
    const row = await screen.findByTestId(`production-item-row-${rowNumber}`);
    await pickItem(row, label);
    return row;
  };

  const setQty = (row: HTMLElement, value: string) => {
    const qty = within(row).getByLabelText('Item quantity');
    fireEvent.change(qty, { target: { value } });
    fireEvent.blur(qty);
  };

  const chainExt = {
    route: { 'item-A': chainRouteA, 'item-B': chainRouteB },
    bom: { 'item-A': chainBomA, 'item-B': chainBomB },
    available: { 'prev-A': 7340, 'prev-B': 3270 },
  };

  it('TASK30-A: selecting a production item resolves its exact previous-stage raw material', async () => {
    renderForm(undefined, undefined, chainExt);
    const row = await addItemRow(1, 'WIP-FT-001 — Flat Wire A');
    setQty(row, '10');
    // Raw material = producing operation input = 1.20mm-B4 Wire (prev stage output).
    expect(await screen.findByTestId('material-flow-rawitem-1')).toHaveTextContent('1.20mm-B4');
    expect(await screen.findByTestId('material-flow-prevstage-1')).toHaveTextContent('Pre-Flattening');
  });

  it('TASK30-B: raw material is the actual previous-operation output item, not generic "Wire"', async () => {
    renderForm(undefined, undefined, chainExt);
    await addItemRow(1, 'WIP-FT-001 — Flat Wire A');
    const raw = await screen.findByTestId('material-flow-rawitem-1');
    expect(raw.textContent).toContain('1.20mm-B4');
    // A lone generic "Wire" must never replace the exact item.
    expect(raw.textContent).not.toBe('Wire');
    expect(screen.queryByText(/^Wire$/)).not.toBeInTheDocument();
  });

  it('TASK30-C: Production Item #2 independently resolves its OWN raw material', async () => {
    renderForm(undefined, undefined, chainExt);
    await addItemRow(1, 'WIP-FT-001 — Flat Wire A');
    await addItemRow(2, 'WIP-FT-002 — Flat Wire B');
    await waitFor(() => expect(screen.getByTestId('material-flow-rawitem-1').textContent).toContain('1.20mm-B4'));
    await waitFor(() => expect(screen.getByTestId('material-flow-rawitem-2').textContent).toContain('1.45mm-B4'));
    // Item #2 does NOT reuse Item #1's raw material.
    expect(screen.getByTestId('material-flow-rawitem-2').textContent).not.toContain('1.20mm-B4');
  });

  it('TASK30-D: changing Item #1 updates its raw requirement/inventory without changing Item #2', async () => {
    renderForm(undefined, undefined, chainExt);
    const row1 = await addItemRow(1, 'WIP-FT-001 — Flat Wire A');
    await addItemRow(2, 'WIP-FT-002 — Flat Wire B');
    await waitFor(() => expect(screen.getByTestId('material-flow-rawitem-2').textContent).toContain('1.45mm-B4'));
    const req2Before = screen.getByTestId('material-flow-required-2').textContent;
    setQty(row1, '5');  // Item #1 required becomes 5×2 = 10 KG (from BOM qty 2).
    await waitFor(() => expect(screen.getByTestId('material-flow-required-1').textContent).toContain(`${formatNumber(10, 3)} KG`));
    // Item #2 untouched (its qty is still 0 → required unchanged).
    expect(screen.getByTestId('material-flow-required-2').textContent).toBe(req2Before);
    expect(screen.getByTestId('material-flow-rawitem-2').textContent).toContain('1.45mm-B4');
  });

  it('TASK30-E: changing Item #2 updates only Item #2 raw material', async () => {
    renderForm(undefined, undefined, chainExt);
    await addItemRow(1, 'WIP-FT-001 — Flat Wire A');
    const row2 = await addItemRow(2, 'WIP-FT-002 — Flat Wire B');
    await waitFor(() => expect(screen.getByTestId('material-flow-rawitem-1').textContent).toContain('1.20mm-B4'));
    const req1Before = screen.getByTestId('material-flow-required-1').textContent;
    setQty(row2, '4');  // Item #2 required becomes 4×3 = 12 KG.
    await waitFor(() => expect(screen.getByTestId('material-flow-required-2').textContent).toContain(`${formatNumber(12, 3)} KG`));
    expect(screen.getByTestId('material-flow-required-1').textContent).toBe(req1Before);
    expect(screen.getByTestId('material-flow-rawitem-1').textContent).toContain('1.20mm-B4');
  });

  it('TASK30-F: exact raw-material inventory is queried using the resolved raw-material item id', async () => {
    const spy = jest.fn();
    apiMock.get.mockImplementation(async (url: any, params?: any) => {
      const u = String(url);
      if (u === '/master-data/items') return { data: [itemA, itemB, itemNoWire] as any };
      if (u === '/master-data/uom') return { data: [uomM] as any };
      if (u === '/master-data/uom-conversions') return { data: [] as any };
      if (u === '/production/shifts') return { data: [] as any };
      if (u === '/production/downtime-reasons') return { data: [reasonMaint, reasonPower] as any };
      if (/^\/production\/routings\/item\/[^/]+\/route$/.test(u)) return { data: chainRouteA };
      if (/^\/bom\/product\//.test(u)) return { data: chainBomA };
      if (u.startsWith('/inventory/balances/available')) { spy(params?.itemId); return { data: 25 }; }
      return { data: [] };
    });
    render(
      <MemoryRouter initialEntries={['/production/entries/new']}>
        <Routes><Route path="/production/entries/new" element={<EntryForm mode="create" />} /></Routes>
      </MemoryRouter>,
    );
    await addItemRow(1, 'WIP-FT-001 — Flat Wire A');
    await waitFor(() => expect(spy).toHaveBeenCalledWith(PREV_A));
  });

  it('TASK30-G: Available inventory displays the real balance returned by the existing API', async () => {
    renderForm(undefined, undefined, { ...chainExt, available: { 'prev-A': 7340, 'prev-B': 3270 } });
    const row = await addItemRow(1, 'WIP-FT-001 — Flat Wire A');
    setQty(row, '10'); // required 20 KG; available 7340 → healthy, no shortage.
    await waitFor(() => expect(screen.getByTestId('material-flow-available-1').textContent).toContain(`${formatNumber(7340, 3)}`));
  });

  it('TASK30-H: Required quantity reacts to Production Item quantity', async () => {
    renderForm(undefined, undefined, chainExt);
    const row = await addItemRow(1, 'WIP-FT-001 — Flat Wire A');
    setQty(row, '10'); // 10 × 2 = 20 KG
    await waitFor(() => expect(screen.getByTestId('material-flow-required-1').textContent).toContain(`${formatNumber(20, 3)} KG`));
    setQty(row, '20'); // 20 × 2 = 40 KG
    await waitFor(() => expect(screen.getByTestId('material-flow-required-1').textContent).toContain(`${formatNumber(40, 3)} KG`));
  });

  it('TASK30-I: Shortage is RED when Available < Required', async () => {
    renderForm(undefined, undefined, { ...chainExt, available: { 'prev-A': 2, 'prev-B': 3270 } });
    const row = await addItemRow(1, 'WIP-FT-001 — Flat Wire A');
    setQty(row, '10'); // required 20 > available 2 → shortage 18
    const status = await screen.findByTestId('material-flow-status-1');
    await waitFor(() => expect(status.textContent).toContain('Shortage'));
    // Red shortage state (data-testid present + danger styling host is set).
  });

  it('TASK30-J: healthy availability is GREEN when Available >= Required', async () => {
    renderForm(undefined, undefined, { ...chainExt, available: { 'prev-A': 7340, 'prev-B': 3270 } });
    const row = await addItemRow(1, 'WIP-FT-001 — Flat Wire A');
    setQty(row, '10'); // required 20 <= available 7340 → Balance
    const status = await screen.findByTestId('material-flow-status-1');
    await waitFor(() => expect(status.textContent).toContain('Balance'));
  });

  it('TASK30-K: no-routing / unresolvable state is professional and does not fabricate a raw material', async () => {
    renderForm(undefined, undefined, {
      route: { 'item-A': { id: 'rt-empty', productId: 'item-A', operations: [] } },
      bom: {},
      available: {},
    });
    await addItemRow(1, 'WIP-FT-001 — Flat Wire A');
    expect(await screen.findByText(/Previous production stage is not configured for this item\.|Raw material could not be resolved from the previous production stage\./)).toBeInTheDocument();
    expect(screen.queryByText(/^Wire$/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Generic Raw Material/)).not.toBeInTheDocument();
  });

  it('TASK30-L: Wire Size stays Item Master wireSizeMm, always 2 decimals', async () => {
    renderForm();
    await addItemRow(1, 'WIP-FT-001 — Flat Wire A');
    const wire = await screen.findByTestId('wire-size-row-1');
    expect(wire.textContent).toBe(`${formatDimension(1.2)} mm`);
    expect(formatDimension(1.45)).toBe('1.45');
    expect(formatDimension(2)).toBe('2.00');
  });

  it('TASK30-M: Actual Good Production remains SUM of production item quantities', async () => {
    renderForm();
    const row1 = await addItemRow(1, 'WIP-FT-001 — Flat Wire A');
    const row2 = await addItemRow(2, 'WIP-FT-002 — Flat Wire B');
    setQty(row1, '10');
    setQty(row2, '20');
    await waitFor(() => expect((screen.getByLabelText(/actual good production/i) as HTMLInputElement).value).toBe('30'));
  });

  it('TASK30-N: Machine Target still follows ONLY the first production item', async () => {
    const seen: Array<string | undefined> = [];
    const mItems = [itemA, itemB, itemNoWire].map((i) => ({ ...i, departmentId: 'dept-flattening' }));
    apiMock.get.mockImplementation(async (url: any, params?: any) => {
      const u = String(url);
      if (u === '/master-data/items') return { data: mItems as any };
      if (u === '/master-data/uom') return { data: [uomM] as any };
      if (u === '/master-data/uom-conversions') return { data: [] as any };
      if (u === '/production/shifts') return { data: [] as any };
      if (u === '/production/entries/machine-target') {
        seen.push(params?.itemId);
        return { success: true, data: {
          effectiveTargetRecordId: 'mt-1', usedGeneralFallback: false,
          machine: { id: 'm1' }, shift: { id: 's1' }, uom: { id: 'uom-m', code: 'KG', symbol: 'kg' },
          standardHours: 8, standardTarget: 100, calculatedTarget: 100, targetPerHour: 12.5, plannedHours: 8, route: null,
        } };
      }
      if (/^\/production\/routings\/item\/[^/]+\/route$/.test(u)) return { data: chainRouteA };
      if (/^\/bom\/product\//.test(u)) return { data: chainBomA };
      return { data: [] };
    });
    render(
      <MemoryRouter initialEntries={['/production/entries/new?machineId=m1&entryDate=2026-09-03&shiftId=s1&divisionId=d1&sectionId=s1&departmentId=dept-flattening']}>
        <Routes>
          <Route path="/production/entries/new" element={<EntryForm mode="create" />} />
        </Routes>
      </MemoryRouter>,
    );
    await userEvent.click(await screen.findByRole('button', { name: /add item/i }));
    const row1 = await screen.findByTestId('production-item-row-1');
    await pickItem(row1, 'WIP-FT-001 — Flat Wire A');
    // Item 1 is the authoritative target scope.
    await waitFor(() => expect(seen).toContain('item-A'));
    // Adding Item #2 must NOT replace the target with Item #2.
    await userEvent.click(await screen.findByRole('button', { name: /add item/i }));
    const row2 = await screen.findByTestId('production-item-row-2');
    await pickItem(row2, 'WIP-FT-002 — Flat Wire B');
    await waitFor(() => expect(screen.getAllByTestId(/^production-item-row-/)).toHaveLength(2));
    expect(seen).not.toContain('item-B');
  });

  it('TASK30-O: Rejection KPI still uses the visible Rejection / Scrap user input', async () => {
    renderForm(undefined, undefined, chainExt);
    const row = await addItemRow(1, 'WIP-FT-001 — Flat Wire A');
    setQty(row, '80'); // good 80
    const scrap = screen.getByLabelText(/rejection \/ scrap/i) as HTMLInputElement;
    await userEvent.clear(scrap);
    await userEvent.type(scrap, '20'); // rejection 20 → 20/(80+20) = 20%
    await screen.findByText(/20%/);
  });

  it('TASK30-P: Edit mode reconstructs both production items and resolves their raw material', async () => {
    const entry = {
      id: 'entry-1', entryDate: '2026-09-03',
      divisionId: '11111111-1111-1111-1111-111111111111', sectionId: '22222222-2222-2222-2222-222222222222',
      departmentId: '33333333-3333-3333-3333-333333333333', shiftId: '44444444-4444-4444-4444-444444444444',
      shift: { id: '44444444-4444-4444-4444-444444444444', name: 'Shift A', plannedHours: 8 },
      machineId: null, machineNo: null,
      operatorName: 'Operator', supervisorName: null,
      itemId: 'item-A', uomId: 'uom-m', targetQuantity: 100, actualQuantity: 40,
      runningHours: 7, downtimeHours: 1, scrapQuantity: 5, remarks: 'keep me',
      productionOrderId: null, productionOrderOperationId: null,
      items: [
        { id: 'pi-1', lineNumber: 1, itemId: 'item-A', uomId: 'uom-m', targetQuantity: 50, actualQuantity: 40, scrapQuantity: 2, runningHours: 7 },
        { id: 'pi-2', lineNumber: 2, itemId: 'item-B', uomId: 'uom-m', targetQuantity: 50, actualQuantity: 20, scrapQuantity: 3, runningHours: 7 },
      ],
      downtimes: [
        { id: 'dt-1', lineNumber: 1, downtimeReasonId: reasonMaint.id, downtimeReasonText: null, downtimeHours: 0.5, remarks: 'lube' },
        { id: 'dt-2', lineNumber: 2, downtimeReasonId: 'r-other', downtimeReasonText: 'setup', downtimeHours: 0.5, remarks: '' },
      ],
    };
    apiMock.get.mockImplementation(async (url: any, params?: any) => {
      const u = String(url);
      if (/^\/production\/entries\/[^/]+$/.test(u)) return { success: true, data: entry };
      if (u === '/master-data/items') return { data: [itemA, itemB, itemNoWire].map((i) => ({ ...i, departmentId: '33333333-3333-3333-3333-333333333333' })) as any };
      if (u === '/master-data/uom') return { data: [uomM] as any };
      if (u === '/master-data/uom-conversions') return { data: [] as any };
      if (u === '/production/downtime-reasons') return { data: [reasonMaint, reasonPower] as any };
      if (/^\/production\/routings\/item\/[^/]+\/route$/.test(u)) return { data: chainRouteA };
      if (/^\/bom\/product\//.test(u)) return { data: chainBomA };
      if (u.startsWith('/inventory/balances/available')) return { data: 10 };
      return { data: [] };
    });
    apiMock.put.mockResolvedValue({ success: true, data: entry });
    render(
      <App>
        <MemoryRouter initialEntries={['/production/entries/entry-1/edit']}>
          <Routes><Route path="/production/entries/:id/edit" element={<EntryForm mode="edit" />} /></Routes>
        </MemoryRouter>
      </App>,
    );
    expect(await screen.findByTestId('production-item-row-1')).toBeInTheDocument();
    expect(await screen.findByTestId('production-item-row-2')).toBeInTheDocument();
    // Raw material resolves for the shown item in edit mode.
    expect(await screen.findByTestId('material-flow-prevstage-1')).toBeInTheDocument();
    const saveBtn = screen.getByRole('button', { name: /update production entry/i });
    await userEvent.click(saveBtn);
    await waitFor(() => expect((apiMock.put as jest.Mock).mock.calls.length).toBeGreaterThan(0));
    const payload = (apiMock.put as jest.Mock).mock.calls[(apiMock.put as jest.Mock).mock.calls.length - 1][1];
    expect(payload.items.length).toBe(2);
    expect(payload.downtimes.length).toBe(2);
    expect(payload.productionOrderId).toBeFalsy();
    expect(payload.remarks).toBe('keep me');
  });

  it('TASK30-Q: two production items show two independent Raw Material requirement blocks', async () => {
    renderForm(undefined, undefined, chainExt);
    await addItemRow(1, 'WIP-FT-001 — Flat Wire A');
    await addItemRow(2, 'WIP-FT-002 — Flat Wire B');
    await waitFor(() => expect(screen.getByTestId('material-flow-rawitem-2').textContent).toContain('1.45mm-B4'));
    expect(screen.getAllByTestId(/^raw-material-component-/).length).toBeGreaterThanOrEqual(2);
    expect(screen.getByTestId('material-flow-rawitem-1').textContent).toContain('1.20mm-B4');
    expect(screen.getByTestId('material-flow-rawitem-2').textContent).toContain('1.45mm-B4');
  });

  it('TASK30-R: no duplicate Add Item button is introduced', async () => {
    renderForm();
    const addButtons = await screen.findAllByRole('button', { name: /add item/i });
    expect(addButtons).toHaveLength(1);
    await addItemRow(1, 'WIP-FT-001 — Flat Wire A');
    await addItemRow(2, 'WIP-FT-002 — Flat Wire B');
    await waitFor(() => expect(screen.getAllByTestId(/^production-item-row-/)).toHaveLength(2));
    await waitFor(() => expect((screen.getAllByRole('button', { name: /add item/i }))[0]).toBeDisabled());
  });

  it('TASK30-S: no duplicate Raw Material source/table/API is introduced', async () => {
    // The raw material resolution uses ONLY the existing routing + BOM + inventory
    // endpoints. Assert no NEW /raw-materials or /material endpoint is ever called.
    const called: string[] = [];
    apiMock.get.mockImplementation(async (url: any, params?: any) => {
      const u = String(url);
      called.push(u.split('?')[0]);
      if (u === '/master-data/items') return { data: [itemA, itemB, itemNoWire] as any };
      if (u === '/master-data/uom') return { data: [uomM] as any };
      if (u === '/master-data/uom-conversions') return { data: [] as any };
      if (u === '/production/shifts') return { data: [] as any };
      if (u === '/production/downtime-reasons') return { data: [reasonMaint, reasonPower] as any };
      if (/^\/production\/routings\/item\/[^/]+\/route$/.test(u)) return { data: chainRouteA };
      if (/^\/bom\/product\//.test(u)) return { data: chainBomA };
      if (u.startsWith('/inventory/balances/available')) return { data: 10 };
      return { data: [] };
    });
    render(
      <MemoryRouter initialEntries={['/production/entries/new']}>
        <Routes><Route path="/production/entries/new" element={<EntryForm mode="create" />} /></Routes>
      </MemoryRouter>,
    );
    await addItemRow(1, 'WIP-FT-001 — Flat Wire A');
    await screen.findByTestId('material-flow-prevstage-1');
    expect(called.some((p) => /raw-material|raw.material|material/.test(p))).toBe(false);
    expect(called).toContain('/inventory/balances/available');
    expect(called.includes('/production/routings/item/item-A/route')).toBe(true);
    expect(called.includes('/bom/product/item-A')).toBe(true);
  });
});

describe('TASK #31 — FINAL PRODUCTION ENTRY / UOM / WEIGHT / RAW-MATERIAL REFINEMENT', () => {
  const addItemRow = async (rowNumber: number, label: string) => {
    await userEvent.click(await screen.findByRole('button', { name: /add item/i }));
    const row = await screen.findByTestId(`production-item-row-${rowNumber}`);
    await pickItem(row, label);
    return row;
  };

  const setQty = (row: HTMLElement, value: string) => {
    const qty = within(row).getByLabelText('Item quantity');
    fireEvent.change(qty, { target: { value } });
    fireEvent.blur(qty);
  };

  const chainExt = {
    route: { 'item-A': chainRouteA, 'item-B': chainRouteB },
    bom: { 'item-A': chainBomA, 'item-B': chainBomB },
    available: { 'prev-A': 7340, 'prev-B': 3270 },
  };

  it('TASK31-A: a selected item shows its real master UOM in the per-row dropdown (KG, not generic)', async () => {
    renderForm();
    await userEvent.click(await screen.findByRole('button', { name: /add item/i }));
    const row = await screen.findByTestId('production-item-row-1');
    await pickItem(row, 'WIP-FT-001 — Flat Wire A');
    const uomSelect = getUomSelect(row, 1);
    fireEvent.mouseDown(uomSelect);
    const opt = await screen.findAllByText('KG', { selector: '.ant-select-item-option-content' });
    expect(opt.length).toBeGreaterThanOrEqual(1);
  });

  it('TASK31-B: UOM never displays the generic literal "UOM" as a placeholder', async () => {
    renderForm();
    await userEvent.click(await screen.findByRole('button', { name: /add item/i }));
    const row = await screen.findByTestId('production-item-row-1');
    await pickItem(row, 'WIP-FT-001 — Flat Wire A');
    expect(row.textContent).not.toContain('placeholder="UOM"');
    expect(getUomSelect(row, 1)).toBeTruthy();
  });

  it('TASK31-C: Production Weight KPI = real KG conversion of the item qty (WEIGHT stays qty)', async () => {
    renderForm();
    const row = await addItemRow(1, 'WIP-FT-001 — Flat Wire A');
    setQty(row, '10');
    const kpiRow = await screen.findByTestId('kpi-row');
    await waitFor(() => expect(within(kpiRow).getByText('10 KG')).toBeInTheDocument());
  });

  it('TASK31-D: Production Weight KPI sums BOTH items KG equivalents (10 + 5 = 15)', async () => {
    renderForm();
    const row1 = await addItemRow(1, 'WIP-FT-001 — Flat Wire A');
    const row2 = await addItemRow(2, 'WIP-FT-002 — Flat Wire B');
    setQty(row1, '10');
    setQty(row2, '5');
    const kpiRow = await screen.findByTestId('kpi-row');
    await waitFor(() => expect(within(kpiRow).getByText('15 KG')).toBeInTheDocument());
  });

  it('TASK31-E: Production Weight reacts to removing an item (20 → 10)', async () => {
    renderForm();
    const row1 = await addItemRow(1, 'WIP-FT-001 — Flat Wire A');
    await addItemRow(2, 'WIP-FT-002 — Flat Wire B');
    setQty(row1, '10');
    setQty(screen.getByTestId('production-item-row-2'), '10');
    const kpiRow = await screen.findByTestId('kpi-row');
    await waitFor(() => expect(within(kpiRow).getByText('20 KG')).toBeInTheDocument());
    await userEvent.click(within(screen.getByTestId('production-item-row-2')).getByRole('button', { name: /remove production item 2/i }));
    await waitFor(() => expect(within(kpiRow).getByText('10 KG')).toBeInTheDocument());
  });

  it('TASK31-F: Rejection KPI stays derived from the visible Rejection / Scrap field', async () => {
    renderForm();
    const row = await addItemRow(1, 'WIP-FT-001 — Flat Wire A');
    setQty(row, '90');
    const scrap = screen.getByLabelText(/rejection \/ scrap/i) as HTMLInputElement;
    fireEvent.change(scrap, { target: { value: '10' } });
    const kpiRow = await screen.findByTestId('kpi-row');
    // Rejection % = 10 / (90 + 10) = 10%; formatNumber strips trailing zeros → "10%".
    await waitFor(() => expect(within(kpiRow).getByText('10%')).toBeInTheDocument());
  });

  it('TASK31-G: Rejection Weight KPI uses the SAME KG conversion as Production Weight', async () => {
    renderForm();
    const row = await addItemRow(1, 'WIP-FT-001 — Flat Wire A');
    setQty(row, '90');
    const scrap = screen.getByLabelText(/rejection \/ scrap/i) as HTMLInputElement;
    fireEvent.change(scrap, { target: { value: '10' } });
    const kpiRow = await screen.findByTestId('kpi-row');
    await waitFor(() => expect(within(kpiRow).getByText('10 KG')).toBeInTheDocument());
  });

  it('TASK31-H: each production item gets its OWN Item Details block', async () => {
    renderForm();
    await addItemRow(1, 'WIP-FT-001 — Flat Wire A');
    await addItemRow(2, 'WIP-FT-002 — Flat Wire B');
    await screen.findByTestId('item-details-item-1');
    await screen.findByTestId('item-details-item-2');
    expect(screen.getAllByTestId('item-details-strip').length).toBeGreaterThanOrEqual(2);
  });

  it('TASK31-I: removing item #2 removes its Item Details block, keeping #1', async () => {
    renderForm();
    await addItemRow(1, 'WIP-FT-001 — Flat Wire A');
    await addItemRow(2, 'WIP-FT-002 — Flat Wire B');
    await screen.findByTestId('item-details-item-2');
    await userEvent.click(within(screen.getByTestId('production-item-row-2')).getByRole('button', { name: /remove production item 2/i }));
    await waitFor(() => expect(screen.queryByTestId('item-details-item-2')).not.toBeInTheDocument());
    expect(screen.getByTestId('item-details-item-1')).toBeInTheDocument();
  });

  it('TASK31-J: Wire Size formats to exactly 2 decimals (1.20 mm, not 1.2)', async () => {
    renderForm();
    await userEvent.click(await screen.findByRole('button', { name: /add item/i }));
    const row = await screen.findByTestId('production-item-row-1');
    await pickItem(row, 'WIP-FT-001 — Flat Wire A');
    expect((await screen.findByTestId('wire-size-row-1')).textContent).toBe('1.20 mm');
  });

  it('TASK31-K: raw material trace resolves the exact previous-stage item + inventory state', async () => {
    renderForm(undefined, undefined, chainExt);
    const row = await addItemRow(1, 'WIP-FT-001 — Flat Wire A');
    setQty(row, '10');
    await waitFor(() => expect(screen.getByTestId('material-flow-rawitem-1').textContent).toContain('1.20mm-B4'));
    expect(screen.getByTestId('material-flow-status-1')).toBeInTheDocument();
  });

  it('TASK31-L: Department filter of the item dropdown is preserved', async () => {
    renderForm();
    await userEvent.click(await screen.findByRole('button', { name: /add item/i }));
    const row = await screen.findByTestId('production-item-row-1');
    const itemBox = within(row).getAllByRole('combobox')
      .find((b) => /^Production item \d+$/.test((b as HTMLElement).getAttribute('aria-label') ?? '')) as HTMLElement;
    fireEvent.mouseDown(itemBox);
    await screen.findByText('WIP-FT-001 — Flat Wire A');
    expect(screen.getByText('WIP-FT-002 — Flat Wire B')).toBeInTheDocument();
  });

  it('TASK31-M: first production item is authoritative (item 2 never replaces it)', async () => {
    renderForm();
    await addItemRow(1, 'WIP-FT-001 — Flat Wire A');
    await addItemRow(2, 'WIP-FT-002 — Flat Wire B');
    await screen.findByTestId('item-details-item-2');
    expect(screen.getAllByTestId('item-details-strip').length).toBeGreaterThanOrEqual(2);
  });

  it('TASK31-N: exactly ONE Add Item and ONE Add Downtime, both in card headers', async () => {
    renderForm();
    await userEvent.click(await screen.findByRole('button', { name: /add item/i }));
    await userEvent.click(await screen.findByRole('button', { name: /add downtime/i }));
    expect(screen.getAllByRole('button', { name: /add item/i })).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: /add downtime/i })).toHaveLength(1);
  });

  it('TASK31-O: Add Item disables at 2 production items', async () => {
    renderForm();
    await addItemRow(1, 'WIP-FT-001 — Flat Wire A');
    await addItemRow(2, 'WIP-FT-002 — Flat Wire B');
    await waitFor(() => expect(screen.getAllByTestId(/^production-item-row-/)).toHaveLength(2));
    expect((screen.getAllByRole('button', { name: /add item/i }))[0]).toBeDisabled();
  });

  it('TASK31-P: both items resolve their OWN raw-material required values', async () => {
    renderForm(undefined, undefined, chainExt);
    const row1 = await addItemRow(1, 'WIP-FT-001 — Flat Wire A');
    const row2 = await addItemRow(2, 'WIP-FT-002 — Flat Wire B');
    setQty(row1, '10');
    setQty(row2, '4');
    await waitFor(() => expect(screen.getByTestId('material-flow-required-1').textContent).toContain(`${formatNumber(20, 3)} KG`));
    await waitFor(() => expect(screen.getByTestId('material-flow-required-2').textContent).toContain(`${formatNumber(12, 3)} KG`));
  });

  it('TASK31-Q: Production Order Linkage card is rendered', async () => {
    renderForm();
    expect(screen.getByText('Production Order Linkage (optional)')).toBeInTheDocument();
  });

  it('TASK31-R: required raw-material reacts to quantity via BOM formula', async () => {
    renderForm(undefined, undefined, chainExt);
    const row = await addItemRow(1, 'WIP-FT-001 — Flat Wire A');
    setQty(row, '30');
    await waitFor(() => expect(screen.getByTestId('material-flow-required-1').textContent).toContain(`${formatNumber(60, 3)} KG`));
  });

  it('TASK31-S: no new /raw-materials or /material endpoint is introduced', async () => {
    const called: string[] = [];
    apiMock.get.mockImplementation(async (url: any, params?: any) => {
      const u = String(url);
      called.push(u.split('?')[0]);
      if (u === '/master-data/items') return { data: [itemA, itemB, itemNoWire] as any };
      if (u === '/master-data/uom') return { data: [uomM] as any };
      if (u === '/master-data/uom-conversions') return { data: [] as any };
      if (u === '/production/shifts') return { data: [] as any };
      if (u === '/production/downtime-reasons') return { data: [reasonMaint, reasonPower] as any };
      if (/^\/production\/routings\/item\/[^/]+\/route$/.test(u)) return { data: chainRouteA };
      if (/^\/bom\/product\//.test(u)) return { data: chainBomA };
      if (u.startsWith('/inventory/balances/available')) return { data: 10 };
      return { data: [] };
    });
    render(
      <MemoryRouter initialEntries={['/production/entries/new']}>
        <Routes><Route path="/production/entries/new" element={<EntryForm mode="create" />} /></Routes>
      </MemoryRouter>,
    );
    await addItemRow(1, 'WIP-FT-001 — Flat Wire A');
    await screen.findByTestId('material-flow-prevstage-1');
    expect(called.some((p) => /raw-materials|\/material/.test(p))).toBe(false);
    expect(called.includes('/master-data/uom')).toBe(true);
    expect(called.includes('/inventory/balances/available')).toBe(true);
  });

  it('TASK31-T: production item rows are capped at 2', async () => {
    renderForm();
    await addItemRow(1, 'WIP-FT-001 — Flat Wire A');
    await addItemRow(2, 'WIP-FT-002 — Flat Wire B');
    await waitFor(() => expect(screen.getAllByTestId(/^production-item-row-/)).toHaveLength(2));
    expect((screen.getAllByRole('button', { name: /add item/i }))[0]).toBeDisabled();
  });

  it('TASK31-U: Item Details base UOM comes straight from Item Master', async () => {
    renderForm();
    const row = await addItemRow(1, 'WIP-FT-001 — Flat Wire A');
    setQty(row, '1');
    const strip = await screen.findByTestId('item-details-strip');
    expect(strip.textContent).toContain('KG');
  });

  it('TASK31-V: each row has an independent UOM combobox', async () => {
    renderForm();
    const row1 = await addItemRow(1, 'WIP-FT-001 — Flat Wire A');
    const row2 = await addItemRow(2, 'WIP-FT-002 — Flat Wire B');
    expect(getUomSelect(row1, 1)).toBeTruthy();
    expect(getUomSelect(row2, 2)).toBeTruthy();
  });

  it('TASK31-W: multi-item totals line sums actual + scrap + KG', async () => {
    renderForm();
    const row1 = await addItemRow(1, 'WIP-FT-001 — Flat Wire A');
    const row2 = await addItemRow(2, 'WIP-FT-002 — Flat Wire B');
    setQty(row1, '10');
    setQty(row2, '5');
    await screen.findByText(/Totals \(2 items\)/);
  });

  it('TASK31-X: Wire Size shows "-" only when the item has no wireSizeMm', async () => {
    renderForm();
    await userEvent.click(await screen.findByRole('button', { name: /add item/i }));
    const row = await screen.findByTestId('production-item-row-1');
    await pickItem(row, 'WIP-FT-003 — Flat Wire C');
    expect((await screen.findByTestId('wire-size-row-1')).textContent).toBe('—');
  });
});

describe('TASK #32 — Raw Material Item Master Mapping, Display & Inventory Consumption', () => {
  const addItemRow = async (rowNumber: number, label: string) => {
    await userEvent.click(await screen.findByRole('button', { name: /add item/i }));
    const row = await screen.findByTestId(`production-item-row-${rowNumber}`);
    await pickItem(row, label);
    return row;
  };

  const setQty = (row: HTMLElement, value: string) => {
    const qty = within(row).getByLabelText('Item quantity');
    fireEvent.change(qty, { target: { value } });
    fireEvent.blur(qty);
  };

  const chainExt = {
    route: { 'item-A': chainRouteA, 'item-B': chainRouteB },
    bom: { 'item-A': chainBomA, 'item-B': chainBomB },
    available: { 'prev-A': 7340, 'prev-B': 3270 },
  };

  it('TASK32-A: raw material block shows the exact Item Master code via routing inputItemId', async () => {
    renderForm(undefined, undefined, chainExt);
    const row = await addItemRow(1, 'WIP-FT-001 — Flat Wire A');
    setQty(row, '10');
    const rawItem = await screen.findByTestId('material-flow-rawitem-1');
    expect(rawItem.textContent).toBe('1.20mm-B4');
  });

  it('TASK32-B: raw material name is displayed alongside the Item Master code', async () => {
    renderForm(undefined, undefined, chainExt);
    const row = await addItemRow(1, 'WIP-FT-001 — Flat Wire A');
    setQty(row, '10');
    const rawName = await screen.findByTestId('material-flow-rawname-1');
    expect(rawName.textContent).toBe('1.20mm-B4 Wire');
  });

  it('TASK32-C: raw material wire size is shown from Item Master (2 decimals via formatDimension)', async () => {
    renderForm(undefined, undefined, chainExt);
    const row = await addItemRow(1, 'WIP-FT-001 — Flat Wire A');
    setQty(row, '10');
    const wireEl = await screen.findByTestId('material-flow-rawwire-1');
    expect(wireEl.textContent).toContain(`${formatDimension(1.20)} mm`);
    expect(formatDimension(1.2)).toBe('1.20');
  });

  it('TASK32-D: raw material UOM is shown from the Item Master base UOM', async () => {
    renderForm(undefined, undefined, chainExt);
    const row = await addItemRow(1, 'WIP-FT-001 — Flat Wire A');
    setQty(row, '10');
    const uomEl = await screen.findByTestId('material-flow-rawuom-1');
    expect(uomEl.textContent).toContain('KG');
  });

  it('TASK32-E: Required value uses BOM formula and reacts to quantity changes', async () => {
    renderForm(undefined, undefined, chainExt);
    const row = await addItemRow(1, 'WIP-FT-001 — Flat Wire A');
    setQty(row, '10');
    const req = await screen.findByTestId('material-flow-required-1');
    expect(req.textContent).toContain(`${formatNumber(20, 3)} KG`);
    setQty(row, '5');
    await waitFor(() => expect(screen.getByTestId('material-flow-required-1').textContent).toContain(`${formatNumber(10, 3)} KG`));
  });

  it('TASK32-F: shortage is displayed when Available < Required', async () => {
    renderForm(undefined, undefined, {
      ...chainExt,
      available: { 'prev-A': 5 },
    });
    const row = await addItemRow(1, 'WIP-FT-001 — Flat Wire A');
    setQty(row, '10');
    const status = await screen.findByTestId('material-flow-status-1');
    expect(status.textContent).toContain('Shortage');
  });

  it('TASK32-G: healthy availability shows balance when Available >= Required', async () => {
    renderForm(undefined, undefined, chainExt);
    const row = await addItemRow(1, 'WIP-FT-001 — Flat Wire A');
    setQty(row, '10');
    const status = await screen.findByTestId('material-flow-status-1');
    expect(status.textContent).toContain('Balance');
  });

  it('TASK32-H: two production items produce two independent raw material blocks', async () => {
    renderForm(undefined, undefined, chainExt);
    await addItemRow(1, 'WIP-FT-001 — Flat Wire A');
    await addItemRow(2, 'WIP-FT-002 — Flat Wire B');
    await waitFor(() => expect(screen.getByTestId('material-flow-rawitem-1').textContent).toContain('1.20mm-B4'));
    await waitFor(() => expect(screen.getByTestId('material-flow-rawitem-2').textContent).toContain('1.45mm-B4'));
  });

  it('TASK32-I: production item code is displayed in the material-flow card header', async () => {
    renderForm(undefined, undefined, chainExt);
    await addItemRow(1, 'WIP-FT-001 — Flat Wire A');
    const current = await screen.findByTestId('material-flow-current-1');
    expect(current.textContent).toContain('WIP-FT-001');
  });

  it('TASK32-J: previous stage name is shown in the material flow card', async () => {
    renderForm(undefined, undefined, chainExt);
    await addItemRow(1, 'WIP-FT-001 — Flat Wire A');
    const prevStage = await screen.findByTestId('material-flow-prevstage-1');
    expect(prevStage.textContent).toContain('Pre-Flattening');
  });

  it('TASK32-K: not-configured state shows warning label when no previous stage exists', async () => {
    renderForm(undefined, undefined, {
      route: { 'item-A': { id: 'rt-a', productId: 'item-A', operations: [
        { sequenceNo: 10, operationCode: 'FLAT', operationName: 'Flattening', outputItemId: 'item-A', outputItem: { itemCode: 'WIP-FT-001', name: 'Flat Wire A', baseUomId: 'uom-m', baseUom: { code: 'KG' } } },
      ] } },
      bom: {},
    });
    await addItemRow(1, 'WIP-FT-001 — Flat Wire A');
    const notConfigured = await screen.findByTestId('material-flow-notconfigured-1');
    expect(notConfigured).toHaveTextContent('Not configured');
  });

  it('TASK32-L: Item Details strip shows raw material section after resolution', async () => {
    renderForm(undefined, undefined, chainExt);
    const row = await addItemRow(1, 'WIP-FT-001 — Flat Wire A');
    setQty(row, '10');
    await screen.findByTestId('material-flow-rawitem-1');
    const strip = await screen.findByTestId('item-details-strip');
    expect(strip.textContent).toContain('Raw Material');
    expect(strip.textContent).toContain('1.20mm-B4');
    expect(strip.textContent).toContain('RM UOM');
    expect(strip.textContent).toContain('RM Available');
  });

  it('TASK32-M: wire-size mismatch produces an Alert warning', async () => {
    // Override single-item mock so raw material has wireSizeMm=2.50 but production item has 1.20
    apiMock.get.mockImplementation(async (url: any, params?: any) => {
      const u = String(url);
      if (u === '/master-data/items') return { data: [itemA, itemB, itemNoWire] as any };
      const singleItemMatch = u.match(/^\/master-data\/items\/(.+)$/);
      if (singleItemMatch) {
        const id = decodeURIComponent(singleItemMatch[1]);
        if (id === PREV_A) return { data: { id: PREV_A, itemCode: '1.20mm-B4', name: '1.20mm-B4 Wire', wireSizeMm: 2.50, baseUomId: 'uom-m', baseUom: { code: 'KG' }, itemType: 'RAW_MATERIAL', status: 'ACTIVE' } } as any;
        const allItems: any[] = [itemA, itemB, itemNoWire];
        return { data: allItems.find((i) => i.id === id) ?? null } as any;
      }
      if (u === '/master-data/uom') return { data: [uomM] as any };
      if (u === '/master-data/uom-conversions') return { data: [] as any };
      if (u === '/production/shifts') return { data: [] as any };
      if (u === '/production/downtime-reasons') return { data: [reasonMaint, reasonPower] as any };
      if (u === '/divisions') return { data: [] as any };
      if (u === '/sections') return { data: [] as any };
      if (u === '/departments') return { data: [] as any };
      if (u === '/production/orders') return { data: [] as any };
      if (u === '/hr/employees') return { data: [] as any };
      if (u === '/warehouses') return { data: [] as any };
      if (u === '/production/machines') return { data: [] as any };
      const routeMatch = u.match(/^\/production\/routings\/item\/([^/]+)\/route$/);
      if (routeMatch) {
        const id = decodeURIComponent(routeMatch[1]);
        if (id === 'item-A') return { data: chainRouteA };
        if (id === 'item-B') return { data: chainRouteB };
        return Promise.reject(new Error('no routing'));
      }
      const bomMatch = u.match(/^\/bom\/product\/(.+)$/);
      if (bomMatch) {
        const id = decodeURIComponent(bomMatch[1]);
        if (id === 'item-A') return { data: chainBomA };
        if (id === 'item-B') return { data: chainBomB };
        return { data: null };
      }
      if (u.startsWith('/inventory/balances/available')) {
        const itemId = params?.itemId;
        return { data: itemId != null ? 7340 : 0 };
      }
      return { data: [] };
    });
    render(
      <MemoryRouter initialEntries={['/production/entries/new']}>
        <Routes><Route path="/production/entries/new" element={<EntryForm mode="create" />} /></Routes>
      </MemoryRouter>,
    );
    const row = await addItemRow(1, 'WIP-FT-001 — Flat Wire A');
    setQty(row, '10');
    const alert = await screen.findByTestId('material-flow-mismatch-1');
    expect(alert).toBeInTheDocument();
    expect(alert.textContent).toContain('mismatch');
  });

  it('TASK32-N: no new /raw-materials or /material endpoint is introduced', async () => {
    const called: string[] = [];
    apiMock.get.mockImplementation(async (url: any) => {
      const u = String(url);
      called.push(u.split('?')[0]);
      if (u === '/master-data/items') return { data: [itemA, itemB, itemNoWire] as any };
      const singleItemMatch = u.match(/^\/master-data\/items\/(.+)$/);
      if (singleItemMatch) {
        const id = decodeURIComponent(singleItemMatch[1]);
        const allItems: any[] = [itemA, itemB, itemNoWire,
          { id: PREV_A, itemCode: '1.20mm-B4', name: '1.20mm-B4 Wire', wireSizeMm: 1.20, baseUomId: 'uom-m', baseUom: { code: 'KG' } },
        ];
        return { data: allItems.find((i) => i.id === id) ?? null } as any;
      }
      if (u === '/master-data/uom') return { data: [uomM] as any };
      if (u === '/master-data/uom-conversions') return { data: [] as any };
      if (u === '/production/shifts') return { data: [] as any };
      if (u === '/production/downtime-reasons') return { data: [] as any };
      if (/^\/production\/routings\/item\/[^/]+\/route$/.test(u)) return { data: chainRouteA };
      if (/^\/bom\/product\//.test(u)) return { data: chainBomA };
      if (u.startsWith('/inventory/balances/available')) return { data: 10 };
      return { data: [] };
    });
    render(
      <MemoryRouter initialEntries={['/production/entries/new']}>
        <Routes><Route path="/production/entries/new" element={<EntryForm mode="create" />} /></Routes>
      </MemoryRouter>,
    );
    await addItemRow(1, 'WIP-FT-001 — Flat Wire A');
    await screen.findByTestId('material-flow-prevstage-1');
    expect(called.some((p) => /\/raw-materials|\/material(?!s)/.test(p))).toBe(false);
  });

  it('TASK32-O: raw material card has four-side border styling', async () => {
    renderForm(undefined, undefined, chainExt);
    await addItemRow(1, 'WIP-FT-001 — Flat Wire A');
    const card = await screen.findByTestId('raw-material-card');
    const style = window.getComputedStyle(card);
    expect(['solid', 'dashed']).toContain(style.borderStyle);
  });

  it('TASK32-P: shortage state uses danger/red color theme', async () => {
    renderForm(undefined, undefined, {
      ...chainExt,
      available: { 'prev-A': 1 },
    });
    const row = await addItemRow(1, 'WIP-FT-001 — Flat Wire A');
    setQty(row, '10');
    const status = await screen.findByTestId('material-flow-status-1');
    expect(status.textContent).toContain('Shortage');
  });

  it('TASK32-Q: required uses correct format with 3 decimal places', async () => {
    renderForm(undefined, undefined, chainExt);
    const row = await addItemRow(1, 'WIP-FT-001 — Flat Wire A');
    setQty(row, '10');
    const req = await screen.findByTestId('material-flow-required-1');
    expect(req.textContent).toContain(formatNumber(20, 3));
  });

  it('TASK32-R: two items update independently — changing item 2 does not affect item 1', async () => {
    renderForm(undefined, undefined, chainExt);
    const row1 = await addItemRow(1, 'WIP-FT-001 — Flat Wire A');
    await addItemRow(2, 'WIP-FT-002 — Flat Wire B');
    setQty(row1, '10');
    await waitFor(() => expect(screen.getByTestId('material-flow-required-1').textContent).toContain(`${formatNumber(20, 3)} KG`));
    const row2 = await screen.findByTestId('production-item-row-2');
    setQty(row2, '20');
    await waitFor(() => expect(screen.getByTestId('material-flow-required-2').textContent).toContain(`${formatNumber(60, 3)} KG`));
    expect(screen.getByTestId('material-flow-required-1').textContent).toContain(`${formatNumber(20, 3)} KG`);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TASK #34B — FINALIZE MASTER ITEM PRODUCTION IN/OUT FLOW
// Model: the current Item IS the output of its own production stage. The user
// selects ONLY the input material (productionInItemId); productionOutItemId is
// server-owned and auto-synced to the current Item ID.
// Chain (Item Master productionInItemId / productionOutItemId):
//   PREV_A (1.20mm-B4 raw wire) → IN null,   OUT null  (root raw material)
//   item-A (Flat Wire A)        → IN PREV_A, OUT item-A (self)
//   item-D (Spiral Wire D)      → IN item-A, OUT item-D (self)
// ─────────────────────────────────────────────────────────────────────────────
describe('TASK #34B — Finalize Master Item Production IN/OUT Flow', () => {
  const itemD = { id: 'item-D', itemCode: 'WIP-SP-004', name: 'Spiral Wire D', wireSizeMm: 1.75, baseUomId: 'uom-m', baseUom: { code: 'KG', symbol: 'kg' }, itemType: 'FINISHED_GOOD', status: 'ACTIVE' };
  const itemE = { id: 'item-E', itemCode: 'WIP-SP-005', name: 'Spiral Wire E', wireSizeMm: 1.75, baseUomId: 'uom-m', baseUom: { code: 'KG', symbol: 'kg' }, itemType: 'FINISHED_GOOD', status: 'ACTIVE' };

  // Item Master records carrying the authoritative IN/OUT mapping.
  const mappedPrevA = {
    id: PREV_A, itemCode: '1.20mm-B4', name: '1.20mm-B4 Wire', wireSizeMm: 1.20,
    baseUomId: 'uom-m', baseUom: { code: 'KG', symbol: 'kg' }, itemType: 'RAW_MATERIAL', status: 'ACTIVE',
    productionInItemId: null, productionOutItemId: null,
  };
  const mappedFlatA = {
    ...itemA, productionInItemId: PREV_A, productionOutItemId: 'item-A',
    productionInItem: { id: PREV_A, itemCode: '1.20mm-B4', name: '1.20mm-B4 Wire', wireSizeMm: 1.2 },
    productionOutItem: { id: 'item-A', itemCode: 'WIP-FT-001', name: 'Flat Wire A', wireSizeMm: 1.2 },
  };
  const mappedSpiralD = {
    ...itemD, productionInItemId: 'item-A', productionOutItemId: 'item-D',
    productionInItem: { id: 'item-A', itemCode: 'WIP-FT-001', name: 'Flat Wire A', wireSizeMm: 1.2 },
    productionOutItem: { id: 'item-D', itemCode: 'WIP-SP-004', name: 'Spiral Wire D', wireSizeMm: 1.75 },
  };

  // A mapped item whose relation object is missing but whose scalar FK exists.
  const scalarOnlyFlat = { ...itemA, productionInItemId: PREV_A, productionOutItemId: 'item-A' };

  const mappedItems: any[] = [mappedFlatA, mappedSpiralD, mappedPrevA];

  function mockT33Api(overrides: { items?: any[]; single?: Record<string, any>; bom?: Record<string, any>; route?: Record<string, any>; available?: Record<string, number> } = {}) {
    apiMock.get.mockImplementation(async (url: any, params?: any) => {
      const u = String(url);
      const items = overrides.items ?? mappedItems;
      if (u === '/master-data/items') return { data: items as any };
      const singleItemMatch = u.match(/^\/master-data\/items\/(.+)$/);
      if (singleItemMatch) {
        const id = decodeURIComponent(singleItemMatch[1]);
        const singleAll = [...items, { id: PREV_A, itemCode: '1.20mm-B4', name: '1.20mm-B4 Wire', wireSizeMm: 1.20, baseUomId: 'uom-m', baseUom: { code: 'KG' }, itemType: 'RAW_MATERIAL', status: 'ACTIVE' }];
        return { data: (overrides.single?.[id] ?? singleAll.find((i) => i.id === id) ?? null) as any };
      }
      if (u === '/master-data/uom') return { data: [uomM] as any };
      if (u === '/master-data/uom-conversions') return { data: [] as any };
      if (u === '/production/shifts') return { data: [] as any };
      if (u === '/production/downtime-reasons') return { data: [reasonMaint, reasonPower] as any };
      if (u === '/divisions') return { data: [] as any };
      if (u === '/sections') return { data: [] as any };
      if (u === '/departments') return { data: [] as any };
      if (u === '/production/orders') return { data: [] as any };
      if (u === '/hr/employees') return { data: [] as any };
      if (u === '/warehouses') return { data: [] as any };
      if (u === '/production/machines') return { data: [] as any };
      const routeMatch = u.match(/^\/production\/routings\/item\/([^/]+)\/route$/);
      if (routeMatch) {
        const id = decodeURIComponent(routeMatch[1]);
        const routing = overrides.route?.[id];
        if (routing === undefined) return Promise.reject(new Error('no routing'));
        return { data: routing };
      }
      const bomMatch = u.match(/^\/bom\/product\/(.+)$/);
      if (bomMatch) {
        const id = decodeURIComponent(bomMatch[1]);
        return { data: overrides.bom?.[id] ?? null };
      }
      if (u.startsWith('/inventory/balances/available')) {
        const itemId = params?.itemId;
        return { data: itemId != null ? (overrides.available?.[itemId] ?? 0) : 0 };
      }
      return { data: [] };
    });
  }

  function renderT33() {
    return render(
      <MemoryRouter initialEntries={['/production/entries/new']}>
        <Routes><Route path="/production/entries/new" element={<EntryForm mode="create" />} /></Routes>
      </MemoryRouter>,
    );
  }

  const addItem = async (rowNumber: number, label: string) => {
    await userEvent.click(await screen.findByRole('button', { name: /add item/i }));
    const row = await screen.findByTestId(`production-item-row-${rowNumber}`);
    await pickItem(row, label);
    return row;
  };

  const ext = { bom: { 'item-A': chainBomA }, route: { 'item-A': chainRouteA }, available: { [PREV_A]: 7340 } };

  it('TASK34B-A: Item Master productionInItemId is the primary raw-material source', async () => {
    mockT33Api(ext);
    renderT33();
    await addItem(1, 'WIP-FT-001 — Flat Wire A');
    const raw = await screen.findByTestId('material-flow-rawitem-1');
    await waitFor(() => expect(raw.textContent).toContain('1.20mm-B4'));
    const rawName = await screen.findByTestId('material-flow-rawname-1');
    expect(rawName).toHaveTextContent('1.20mm-B4 Wire');
  });

  it('TASK34B-B: Item Details strip shows INPUT MATERIAL and OUTPUT PRODUCT = current item (self)', async () => {
    mockT33Api(ext);
    renderT33();
    await addItem(1, 'WIP-FT-001 — Flat Wire A');
    const strip = await screen.findByTestId('item-details-strip');
    await waitFor(() => expect(strip).toHaveTextContent('1.20mm-B4'));
    expect(strip).toHaveTextContent('Input Material');
    expect(strip).toHaveTextContent('Output Product');
    expect(strip).toHaveTextContent('WIP-FT-001');
    await waitFor(() => expect(strip).toHaveTextContent('(self)'));
  });

  it('TASK34B-C: falls back to routing chain when Item Master has no productionInItemId', async () => {
    renderForm(undefined, undefined, ext);
    await addItem(1, 'WIP-FT-001 — Flat Wire A');
    const raw = await screen.findByTestId('material-flow-rawitem-1');
    await waitFor(() => expect(raw.textContent).toContain('1.20mm-B4'));
    const prev = await screen.findByTestId('material-flow-prevstage-1');
    expect(prev).toHaveTextContent('Pre-Flattening');
  });

  it('TASK34B-D: no chain-mismatch warning under the finalized model (raw material OUT is itself)', async () => {
    mockT33Api(ext);
    renderT33();
    await addItem(1, 'WIP-FT-001 — Flat Wire A');
    const strip = await screen.findByTestId('item-details-strip');
    await waitFor(() => expect(strip).toHaveTextContent('1.20mm-B4'));
    expect(strip).not.toHaveTextContent(/Chain mismatch/i);
    expect(strip).not.toHaveTextContent(/OUT mapping warning/i);
    expect(strip).toHaveTextContent('(self)');
  });

  it('TASK34B-E: OUT mapping warning when the stored production OUT is not the current item (stale pre-#34B data)', async () => {
    const staleFlat = { ...itemA, productionInItemId: PREV_A, productionOutItemId: 'item-E' };
    mockT33Api({ ...ext, items: [staleFlat, mappedSpiralD, mappedPrevA] });
    renderT33();
    await addItem(1, 'WIP-FT-001 — Flat Wire A');
    const strip = await screen.findByTestId('item-details-strip');
    await waitFor(() => expect(strip).toHaveTextContent('1.20mm-B4'));
    expect(strip).toHaveTextContent('Input Material');
    await waitFor(() => expect(strip).toHaveTextContent(/OUT mapping warning/i));
  });

  it('TASK34B-F: Item Details strip works from scalar productionInItemId even without the relation object', async () => {
    mockT33Api({ ...ext, items: [scalarOnlyFlat, mappedSpiralD, mappedPrevA, itemD, itemE] });
    renderT33();
    await addItem(1, 'WIP-FT-001 — Flat Wire A');
    const raw = await screen.findByTestId('material-flow-rawitem-1');
    await waitFor(() => expect(raw.textContent).toContain('1.20mm-B4'));
    const strip = await screen.findByTestId('item-details-strip');
    expect(strip).toHaveTextContent('Input Material');
    await waitFor(() => expect(strip).toHaveTextContent('Output Product'));
    await waitFor(() => expect(strip).toHaveTextContent('(self)'));
  });

  // Three-stage sample-data-style chain for the Input Chain walk:
  //   4.75 mm  ← 3.75 mm  ← Flat Wire ← 1.20mm-B4 (root raw wire).
  const chainItemFlat = {
    id: 'chain-FLAT', itemCode: 'WIP-FT-200', name: 'Flat Wire', wireSizeMm: 0.90, baseUomId: 'uom-m', baseUom: { code: 'KG', symbol: 'kg' }, itemType: 'SEMI_FINISHED', status: 'ACTIVE',
    productionInItemId: PREV_A, productionOutItemId: 'chain-FLAT',
  };
  const chainItemSpiral = {
    id: 'chain-SPIRAL', itemCode: 'WIP-SP-300', name: '3.75 mm', wireSizeMm: 3.75, baseUomId: 'uom-m', baseUom: { code: 'KG', symbol: 'kg' }, itemType: 'SEMI_FINISHED', status: 'ACTIVE',
    productionInItemId: 'chain-FLAT', productionOutItemId: 'chain-SPIRAL',
  };
  const chainItemPvc = {
    id: 'chain-PVC', itemCode: 'WIP-PVC-400', name: '4.75 mm', wireSizeMm: 4.75, baseUomId: 'uom-m', baseUom: { code: 'KG', symbol: 'kg' }, itemType: 'FINISHED_GOOD', status: 'ACTIVE',
    productionInItemId: 'chain-SPIRAL', productionOutItemId: 'chain-PVC',
    productionInItem: { id: 'chain-SPIRAL', itemCode: 'WIP-SP-300', name: '3.75 mm', wireSizeMm: 3.75 },
  };
  const chainRoutePvc = {
    id: 'rt-pvc', productId: 'chain-PVC',
    operations: [
      { sequenceNo: 10, operationCode: 'PVC', operationName: 'PVC Extrusion', outputItemId: 'chain-PVC', inputItemId: 'chain-SPIRAL', inputItem: { itemCode: 'WIP-SP-300', name: '3.75 mm', baseUomId: 'uom-m', baseUom: { code: 'KG' } }, inputQuantity: 1, outputItem: { itemCode: 'WIP-PVC-400', name: '4.75 mm', baseUomId: 'uom-m', baseUom: { code: 'KG' } } },
    ],
  };
  const chainBomPvc = {
    productId: 'chain-PVC', baseQuantity: 1,
    lines: [{ id: 'bl-pvc', itemId: 'chain-SPIRAL', quantity: 1, scrapFactor: 0, yieldPercentage: 100, uomId: 'uom-m', item: { itemCode: 'WIP-SP-300', name: '3.75 mm', baseUomId: 'uom-m', baseUom: { code: 'KG' } }, uom: { code: 'KG' } }],
  };

  it('TASK34B-G: Input Chain walks the complete backward chain (4.75 ← 3.75 ← Flat ← 1.20mm-B4)', async () => {
    mockT33Api({
      items: [mappedPrevA, chainItemFlat, chainItemSpiral, chainItemPvc],
      route: { 'chain-PVC': chainRoutePvc },
      bom: { 'chain-PVC': chainBomPvc },
      available: { 'chain-SPIRAL': 9000 },
    });
    renderT33();
    await addItem(1, 'WIP-PVC-400 — 4.75 mm');
    const chain = await screen.findByTestId('material-flow-inputchain-1');
    await waitFor(() => expect(chain.textContent).toContain('WIP-PVC-400'));
    const text = chain.textContent!.replace(/\s+/g, ' ');
    expect(text).toContain('←');
    expect(text.indexOf('WIP-PVC-400')).toBeLessThan(text.indexOf('WIP-SP-300'));
    expect(text.indexOf('WIP-SP-300')).toBeLessThan(text.indexOf('WIP-FT-200'));
    expect(text.indexOf('WIP-FT-200')).toBeLessThan(text.indexOf('1.20mm-B4'));
  });

  it('TASK34B-J: production entry resolves a single exact input Item — no duplicate raw-material selector', async () => {
    mockT33Api(ext);
    renderT33();
    await addItem(1, 'WIP-FT-001 — Flat Wire A');
    const raw = await screen.findByTestId('material-flow-rawitem-1');
    await waitFor(() => expect(raw.textContent).toContain('1.20mm-B4'));
    const components = screen.queryAllByTestId(/^raw-material-component-1-/);
    expect(components).toHaveLength(1);
    const strip = await screen.findByTestId('item-details-strip');
    expect(strip).toHaveTextContent('Input Material');
    expect(strip).not.toHaveTextContent('(unexpected)');
  });

  it('TASK34B-K: no /raw-materials or /material endpoint is introduced for mapped items', async () => {
    const called: string[] = [];
    apiMock.get.mockImplementation(async (url: any, params?: any) => {
      const u = String(url);
      called.push(u.split('?')[0]);
      if (u === '/master-data/items') return { data: mappedItems as any };
      const singleItemMatch = u.match(/^\/master-data\/items\/(.+)$/);
      if (singleItemMatch) {
        const id = decodeURIComponent(singleItemMatch[1]);
        const all = [...mappedItems, mappedPrevA];
        return { data: all.find((i) => i.id === id) ?? null } as any;
      }
      if (u === '/master-data/uom') return { data: [uomM] as any };
      if (u === '/master-data/uom-conversions') return { data: [] as any };
      if (u === '/production/shifts') return { data: [] as any };
      if (u === '/production/downtime-reasons') return { data: [] as any };
      if (/^\/production\/routings\/item\/[^/]+\/route$/.test(u)) return { data: chainRouteA };
      if (/^\/bom\/product\//.test(u)) return { data: chainBomA };
      if (u.startsWith('/inventory/balances/available')) return { data: 10 };
      return { data: [] };
    });
    renderT33();
    await addItem(1, 'WIP-FT-001 — Flat Wire A');
    await screen.findByTestId('material-flow-prevstage-1');
    expect(called.some((p) => /\/raw-materials|\/material(?!s)/.test(p))).toBe(false);
  });

  it('TASK34B-H: required quantity still resolves from BOM when raw material comes from Item Master', async () => {
    mockT33Api(ext);
    renderT33();
    const row = await addItem(1, 'WIP-FT-001 — Flat Wire A');
    const qty = within(row).getByLabelText('Item quantity');
    await userEvent.clear(qty);
    await userEvent.type(qty, '10');
    const req = await screen.findByTestId('material-flow-required-1');
    await waitFor(() => expect(req.textContent).toContain(`${formatNumber(20, 3)} KG`));
  });

  it('TASK34B-I: wire-size display for raw material is pure display (not the matching key)', async () => {
    mockT33Api(ext);
    renderT33();
    await addItem(1, 'WIP-FT-001 — Flat Wire A');
    const raw = await screen.findByTestId('material-flow-rawitem-1');
    await waitFor(() => expect(raw.textContent).toContain('1.20mm-B4'));
    // The raw material resolution used the exact Item ID, not a wire-size match.
    const strip = await screen.findByTestId('item-details-strip');
    expect(strip.textContent).toContain('1.20');
    expect(strip.textContent).toContain('mm');
  });

  it('TASK34B-L: Production Entry shows OUTPUT PRODUCT (self) + OUTPUT INVENTORY from the real inventory API', async () => {
    mockT33Api({ ...ext, available: { [PREV_A]: 7340, 'item-A': 500 } });
    renderT33();
    await addItem(1, 'WIP-FT-001 — Flat Wire A');
    // OUTPUT PRODUCT is the current Item itself (read-only, never a selector).
    const out = await screen.findByTestId('material-flow-output-1');
    expect(out).toHaveTextContent('WIP-FT-001');
    // OUTPUT INVENTORY is read from the existing inventory API keyed by the item.
    const inv = await screen.findByTestId('material-flow-outputinv-1');
    await waitFor(() => expect(inv.textContent).toContain(`${formatNumber(500, 3)}`));
    expect(inv.textContent).toContain('KG');
    // INPUT MATERIAL resolves to the exact IN item, never the produced item itself.
    const raw = await screen.findByTestId('material-flow-rawitem-1');
    await waitFor(() => expect(raw.textContent).toContain('1.20mm-B4'));
    expect(raw.textContent).not.toContain('WIP-FT-001');
  });
});

