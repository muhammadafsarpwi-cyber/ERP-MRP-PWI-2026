/**
 * ITEM-FILTER-01 — focused filter tests for Products & Items (`/master-data/items`).
 *
 * The API mock acts as a MINI SERVER implementing the same contract as the real
 * backend (`ItemService.findAll`): every supplied parameter is AND-combined and
 * `total` is the FILTERED row count (server-side, never client-side slicing).
 * Each test therefore asserts both sides of the contract:
 *   - the exact query parameters the page sends, and
 *   - the rows / total the table actually renders afterwards.
 */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { App } from 'antd';
import { MemoryRouter } from 'react-router-dom';
import ItemManagement from './ItemManagement';
import apiService from '../../services/api';
import { tabSessionCache } from '../../services/tabSessionCache';

jest.mock('../../services/api');
jest.setTimeout(120000);

const apiMock = apiService as jest.Mocked<typeof apiService>;

/* ── Organization lookups (fetched from the real org endpoints, never hard-coded in the page) ── */
const DIVISIONS = [
  { id: 'div-ccd', name: 'Control Cable Division' },
  { id: 'div-wd', name: 'Wire Drawing Division' },
];
const SECTIONS = [
  { id: 'sec-pvc', name: 'PVC & Packing Section', divisionId: 'div-ccd' },
  { id: 'sec-store', name: 'CCD Store Section', divisionId: 'div-ccd' },
  { id: 'sec-wire', name: 'Wire Section', divisionId: 'div-wd' },
];
const DEPARTMENTS = [
  { id: 'dep-pvc', name: 'PVC Department', sectionId: 'sec-pvc', divisionId: 'div-ccd' },
  { id: 'dep-pack', name: 'Packing Department', sectionId: 'sec-pvc', divisionId: 'div-ccd' },
  { id: 'dep-store', name: 'Store Department', sectionId: 'sec-store', divisionId: 'div-ccd' },
  { id: 'dep-wire', name: 'Wire Department', sectionId: 'sec-wire', divisionId: 'div-wd' },
];

/* ── 45-item mini item master ──
 *  PVC-01..12 → div-ccd / sec-pvc (01–08 dep-pvc, 09–12 dep-pack), PVC-03 INACTIVE,
 *               cat-cable on 01–10, rt-extrude on 01–06
 *  CU-01..13  → div-ccd / sec-store / dep-store, role on 01–05
 *  WD-01..20  → div-wd / sec-wire / dep-wire
 * Totals: all 45 · div-ccd 25 · div-wd 20 · sec-pvc 12 · sec-store 13 ·
 *         dep-pvc 8 · cat-cable 10 · rt-extrude 6 · role 5 · ACTIVE 44
 */
const pad = (n: number) => String(n).padStart(2, '0');
const CCD = { id: 'div-ccd', name: 'Control Cable Division' };
const WD = { id: 'div-wd', name: 'Wire Drawing Division' };

const ITEMS: Array<Record<string, any>> = [
  ...Array.from({ length: 12 }, (_, i) => {
    const n = i + 1;
    return {
      id: `pvc-${n}`,
      itemCode: `PVC-${pad(n)}`,
      name: `PVC Cable Grade ${pad(n)}`,
      sku: `SKU-PVC-${pad(n)}`,
      itemType: 'RAW_MATERIAL',
      status: n === 3 ? 'INACTIVE' : 'ACTIVE',
      baseUomName: 'KG',
      divisionId: 'div-ccd',
      sectionId: 'sec-pvc',
      departmentId: n <= 8 ? 'dep-pvc' : 'dep-pack',
      categoryId: n <= 10 ? 'cat-cable' : undefined,
      routeTypeId: n <= 6 ? 'rt-extrude' : undefined,
      division: CCD,
      section: { id: 'sec-pvc', name: 'PVC & Packing Section' },
      department: { id: n <= 8 ? 'dep-pvc' : 'dep-pack', name: n <= 8 ? 'PVC Department' : 'Packing Department' },
    };
  }),
  ...Array.from({ length: 13 }, (_, i) => {
    const n = i + 1;
    return {
      id: `cu-${n}`,
      itemCode: `CU-${pad(n)}`,
      name: `Copper Wire ${pad(n)}.00 mm`,
      itemType: 'FINISHED_GOOD',
      status: 'ACTIVE',
      baseUomName: 'M',
      divisionId: 'div-ccd',
      sectionId: 'sec-store',
      departmentId: 'dep-store',
      materialRoleUsage: n <= 5 ? 'Process Component Materials' : undefined,
      division: CCD,
      section: { id: 'sec-store', name: 'CCD Store Section' },
      department: { id: 'dep-store', name: 'Store Department' },
    };
  }),
  ...Array.from({ length: 20 }, (_, i) => {
    const n = i + 1;
    return {
      id: `wd-${n}`,
      itemCode: `WD-${pad(n)}`,
      name: `Wire Drawing Output ${pad(n)}`,
      itemType: 'FINISHED_GOOD',
      status: 'ACTIVE',
      baseUomName: 'M',
      divisionId: 'div-wd',
      sectionId: 'sec-wire',
      departmentId: 'dep-wire',
      division: WD,
      section: { id: 'sec-wire', name: 'Wire Section' },
      department: { id: 'dep-wire', name: 'Wire Department' },
    };
  }),
];

/* ── Mini server: same AND-semantics + filtered total as the real backend ── */
function queryItems(params: Record<string, any> = {}) {
  let rows = ITEMS.slice();
  if (params.search) {
    const kw = String(params.search).toLowerCase();
    rows = rows.filter((r) =>
      `${r.itemCode} ${r.name} ${r.sku ?? ''}`.toLowerCase().includes(kw),
    );
  }
  if (params.divisionId) rows = rows.filter((r) => r.divisionId === params.divisionId);
  if (params.sectionId) rows = rows.filter((r) => r.sectionId === params.sectionId);
  if (params.departmentId) rows = rows.filter((r) => r.departmentId === params.departmentId);
  if (params.categoryId) rows = rows.filter((r) => r.categoryId === params.categoryId);
  if (params.routeTypeId) rows = rows.filter((r) => r.routeTypeId === params.routeTypeId);
  if (params.materialRoleUsage) rows = rows.filter((r) => r.materialRoleUsage === params.materialRoleUsage);
  if (params.status) rows = rows.filter((r) => r.status === params.status);
  if (params.itemType) rows = rows.filter((r) => r.itemType === params.itemType);
  rows.sort((a, b) => (a.itemCode < b.itemCode ? -1 : 1));
  const total = rows.length;
  const page = Number(params.page) || 1;
  const limit = Number(params.limit) || 20;
  return { data: rows.slice((page - 1) * limit, page * limit), total };
}

/* ── Request introspection: the real table queries only (KPI count probes use limit=1) ── */
const listCalls = (): Array<[string, Record<string, any>]> =>
  (apiMock.get.mock.calls as unknown as Array<[string, Record<string, any>?]>).filter(
    ([url, p]) => url === '/master-data/items' && p && p.limit !== 1,
  ) as Array<[string, Record<string, any>]>;
const listCount = () => listCalls().length;
const lastList = (): Record<string, any> => listCalls()[listCount() - 1]?.[1] ?? {};

beforeAll(() => {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
  (global as any).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

beforeEach(() => {
  window.sessionStorage.clear();
  localStorage.clear();
  localStorage.setItem(
    'erp_user',
    JSON.stringify({
      id: 'u1',
      email: 'filter.test@erp.com',
      displayName: 'Filter Tester',
      defaultCompanyId: 'co-1',
      permissions: ['item.view'],
    }),
  );
  localStorage.setItem('erp_permissions_ts', String(Date.now()));
  tabSessionCache.clear();

  apiMock.get.mockReset();
  apiMock.get.mockImplementation(async (url: string, params?: any) => {
    if (url === '/master-data/items') {
      if (params?.search === 'boom') throw new Error('Network down');
      if (params?.limit === 1) return { data: [], total: queryItems(params).total };
      return queryItems(params);
    }
    if (url === '/master-data/items/pipeline-stats') {
      return { data: { total: 45, active: 44, inactive: 1, types: [] } };
    }
    if (url === '/divisions') return { data: DIVISIONS, total: DIVISIONS.length };
    if (url === '/sections') return { data: SECTIONS, total: SECTIONS.length };
    if (url === '/departments') return { data: DEPARTMENTS, total: DEPARTMENTS.length };
    if (url === '/master-data/categories') {
      return { data: [{ id: 'cat-cable', name: 'Cable Products', children: [] }], total: 1 };
    }
    if (url === '/master-data/route-types') {
      return {
        data: [{ id: 'rt-extrude', routeCode: 'RT-EXT', name: 'Extrusion Route', status: 'ACTIVE' }],
        total: 1,
      };
    }
    if (url === '/companies') return { data: [{ id: 'co-1' }], total: 1 };
    return { data: [], total: 0 };
  });
});

/* ── Render + UI helpers ── */
async function renderPage() {
  render(
    <App>
      <MemoryRouter initialEntries={['/master-data/items']}>
        <ItemManagement />
      </MemoryRouter>
    </App>,
  );
  await expectTotal(45);
}

const PH = '.ant-select-selection-placeholder';

function getSelect(placeholder: string): HTMLElement {
  const ph = screen.getByText(placeholder, { selector: PH });
  const sel = ph.closest('.ant-select') as HTMLElement;
  if (!sel) throw new Error(`Select not found for placeholder: ${placeholder}`);
  return sel;
}

/**
 * Opens a select and picks an option. `select` may be the placeholder (empty
 * select) or an element captured earlier (rc-select unmounts the placeholder
 * once a value is selected).
 */
async function chooseOption(select: string | HTMLElement, optionLabel: string): Promise<HTMLElement> {
  const sel = typeof select === 'string' ? getSelect(select) : select;
  fireEvent.mouseDown(sel.querySelector('.ant-select-selector') as HTMLElement);
  const option = await screen.findByText(
    optionLabel,
    { selector: '.ant-select-item-option-content' },
    { timeout: 8000 },
  );
  fireEvent.click(option);
  await waitFor(
    () => {
      expect(sel.querySelector('.ant-select-selection-item')?.textContent ?? '').toContain(optionLabel);
    },
    { timeout: 4000 },
  );
  return sel;
}

const selectValue = (sel: HTMLElement) =>
  sel.querySelector('.ant-select-selection-item')?.textContent ?? '';

async function openMoreFilters(): Promise<void> {
  fireEvent.click(screen.getByRole('button', { name: /More Filters/ }));
  await screen.findByText('Section', { selector: PH });
}

/** The pagination `showTotal` line — proves which total the table renders. */
const expectTotal = (n: number, timeout = 8000) =>
  screen.findByText(new RegExp(`of ${n} entries`), undefined, { timeout });

const tbodyText = () => document.querySelector('.ant-table-tbody')?.textContent ?? '';
const inTable = (needle: string) => tbodyText().includes(needle);

const searchInput = () =>
  screen.getByPlaceholderText('Search Item Register (code, name, SKU, barcode)...');

/** Chevron ribbon button identified by its letters only (icon + count stripped). */
const chevronButton = (letters: 'ALLITEMS' | 'ACTIVE' | 'INACTIVE') => {
  const btn = Array.from(document.querySelectorAll('button')).find(
    (b) => (b.textContent ?? '').replace(/[^A-Z]/g, '') === letters,
  );
  expect(btn).toBeTruthy();
  return btn as HTMLElement;
};

/* ═══════════════════════════ the 18 required filter tests ═══════════════════════════ */

describe('ITEM-FILTER-01 — Products & Items filters drive the server query', () => {
  it('1. search: debounced text reaches the API and filters rows + total', async () => {
    await renderPage();
    const input = searchInput();
    fireEvent.change(input, { target: { value: 'pvc' } });
    expect(listCount()).toBe(1); // not sent before the 400 ms debounce
    await waitFor(() => expect(lastList().search).toBe('pvc'), { timeout: 5000 });
    expect(lastList()).toMatchObject({ page: 1, limit: 20, sortField: 'itemCode', sortOrder: 'ASC' });
    expect(lastList().search).toBe('pvc');
    await expectTotal(12);
    expect(inTable('PVC-12')).toBe(true);
    expect(inTable('CU-01')).toBe(false);
    expect((input as HTMLInputElement).value).toBe('pvc'); // control ↔ query agree
  });

  it('2. division: selecting a Division filters rows + total server-side', async () => {
    await renderPage();
    const divSel = await chooseOption('All Divisions', 'Wire Drawing Division');
    expect(selectValue(divSel)).toBe('Wire Drawing Division');
    await waitFor(() => expect(lastList().divisionId).toBe('div-wd'));
    await expectTotal(20);
    expect(inTable('WD-01')).toBe(true);
    expect(inTable('CU-01')).toBe(false);
  });

  it('3. section: Section filter (standalone) reaches the API and filters', async () => {
    await renderPage();
    await openMoreFilters();
    const secSel = await chooseOption('Section', 'PVC & Packing Section');
    expect(selectValue(secSel)).toBe('PVC & Packing Section');
    await waitFor(() => expect(lastList().sectionId).toBe('sec-pvc'));
    expect(lastList()).not.toHaveProperty('divisionId'); // section alone is a valid query
    await expectTotal(12);
    expect(inTable('PVC-12')).toBe(true);
    expect(inTable('CU-01')).toBe(false);
  });

  it('4. department: Department filter (standalone) reaches the API and filters', async () => {
    await renderPage();
    await openMoreFilters();
    const depSel = await chooseOption('Department', 'PVC Department');
    expect(selectValue(depSel)).toBe('PVC Department');
    await waitFor(() => expect(lastList().departmentId).toBe('dep-pvc'));
    expect(lastList()).not.toHaveProperty('sectionId');
    await expectTotal(8);
    expect(inTable('PVC-08')).toBe(true);
    expect(inTable('PVC-09')).toBe(false); // packing department belongs to the same section only
  });

  it('5. category: Category filter reaches the API and filters', async () => {
    await renderPage();
    const catSel = await chooseOption('All Categories', 'Cable Products');
    expect(selectValue(catSel)).toBe('Cable Products');
    await waitFor(() => expect(lastList().categoryId).toBe('cat-cable'));
    await expectTotal(10);
    expect(inTable('PVC-10')).toBe(true);
    expect(inTable('PVC-11')).toBe(false);
  });

  it('6. route type: Route Type filter reaches the API and filters', async () => {
    await renderPage();
    await openMoreFilters();
    const rtSel = await chooseOption('Route Type', 'Extrusion Route');
    expect(selectValue(rtSel)).toBe('Extrusion Route');
    await waitFor(() => expect(lastList().routeTypeId).toBe('rt-extrude'));
    await expectTotal(6);
    expect(inTable('PVC-06')).toBe(true);
    expect(inTable('PVC-07')).toBe(false);
  });

  it('7. material role / usage: role filter reaches the API and filters', async () => {
    await renderPage();
    await openMoreFilters();
    const roleSel = await chooseOption('Material Role / Usage', 'Process Component Materials');
    expect(selectValue(roleSel)).toBe('Process Component Materials');
    await waitFor(() => expect(lastList().materialRoleUsage).toBe('Process Component Materials'));
    await expectTotal(5);
    expect(inTable('CU-05')).toBe(true);
    expect(inTable('CU-06')).toBe(false);
  });

  it('8. status: Status filter reaches the API and filters', async () => {
    await renderPage();
    await openMoreFilters();
    const stSel = await chooseOption('Status', 'ACTIVE');
    expect(selectValue(stSel)).toBe('ACTIVE');
    await waitFor(() => expect(lastList().status).toBe('ACTIVE'));
    await expectTotal(44);
    expect(inTable('PVC-03')).toBe(false); // the only INACTIVE fixture row
  });

  it('9. combined: search + division + status are AND-combined in one query', async () => {
    await renderPage();
    fireEvent.change(searchInput(), { target: { value: 'pvc' } });
    await waitFor(() => expect(lastList().search).toBe('pvc'), { timeout: 5000 });
    await expectTotal(12);
    await chooseOption('All Divisions', 'Control Cable Division');
    await waitFor(() => expect(lastList().divisionId).toBe('div-ccd'));
    await openMoreFilters();
    await chooseOption('Status', 'ACTIVE');
    await waitFor(() =>
      expect(lastList()).toMatchObject({
        page: 1,
        limit: 20,
        search: 'pvc',
        divisionId: 'div-ccd',
        status: 'ACTIVE',
      }),
    );
    await expectTotal(11); // 12 PVC rows minus INACTIVE PVC-03
    expect(inTable('PVC-12')).toBe(true);
    expect(inTable('PVC-03')).toBe(false);
    expect(inTable('CU-01')).toBe(false);
  });

  it('10. Division → Section cascade drops a stale Section selection', async () => {
    await renderPage();
    await openMoreFilters();
    const secSel = await chooseOption('Section', 'PVC & Packing Section');
    await waitFor(() => expect(lastList().sectionId).toBe('sec-pvc'));
    await expectTotal(12);

    await chooseOption('All Divisions', 'Wire Drawing Division'); // a division without that section
    await waitFor(() => {
      const p = lastList();
      expect(p).toMatchObject({ divisionId: 'div-wd' });
      expect(p).not.toHaveProperty('sectionId'); // stale child never rides along
    });
    expect(selectValue(secSel)).toBe(''); // visible control agrees: Section was dropped
    await expectTotal(20);
    expect(inTable('WD-01')).toBe(true);
    expect(
      listCalls().some(([, p]) => p.divisionId === 'div-wd' && p.sectionId),
    ).toBe(false); // no request ever combined the new division with the old section
  });

  it('11. Section → Department cascade drops a stale Department selection', async () => {
    await renderPage();
    await openMoreFilters();
    const secSel = await chooseOption('Section', 'PVC & Packing Section');
    await expectTotal(12);
    const depSel = await chooseOption('Department', 'PVC Department');
    await waitFor(() =>
      expect(lastList()).toMatchObject({ sectionId: 'sec-pvc', departmentId: 'dep-pvc' }),
    );
    await expectTotal(8);

    await chooseOption(secSel, 'CCD Store Section'); // section without that department
    await waitFor(() => {
      const p = lastList();
      expect(p).toMatchObject({ sectionId: 'sec-store' });
      expect(p).not.toHaveProperty('departmentId');
    });
    expect(selectValue(depSel)).toBe(''); // visible control agrees: Department was dropped
    await expectTotal(13);
    expect(inTable('CU-01')).toBe(true);
    expect(
      listCalls().some(([, p]) => p.sectionId === 'sec-store' && p.departmentId),
    ).toBe(false);
  });

  it('12. Apply Filters commits pending search and refreshes rows + total', async () => {
    await renderPage();
    fireEvent.change(searchInput(), { target: { value: 'pvc' } }); // debounce still pending
    fireEvent.click(screen.getByTestId('apply-filters'));
    await waitFor(() => expect(lastList().search).toBe('pvc'), { timeout: 5000 });
    expect(lastList()).toMatchObject({ page: 1, search: 'pvc' });
    await expectTotal(12);
    expect(inTable('PVC-12')).toBe(true);
    expect(inTable('CU-01')).toBe(false);
    expect((searchInput() as HTMLInputElement).value).toBe('pvc');
    // the commit must not double-fire once the debounce catches up
    await new Promise((r) => setTimeout(r, 650));
    expect(listCalls().filter(([, p]) => p.search === 'pvc').length).toBe(1);
  });

  it('13. Clear Filters resets the API query (not just the controls) back to defaults', async () => {
    await renderPage();
    const divSel = await chooseOption('All Divisions', 'Wire Drawing Division');
    await waitFor(() => expect(lastList().divisionId).toBe('div-wd'));
    await expectTotal(20);

    fireEvent.click(screen.getByTestId('clear-filters'));
    await waitFor(() => {
      const p = lastList();
      expect(p).toMatchObject({ page: 1, limit: 20, sortField: 'itemCode', sortOrder: 'ASC' });
      expect(p).not.toHaveProperty('divisionId');
    });
    expect(selectValue(divSel)).toBe(''); // control reset
    await expectTotal(45); // default dataset restored
    expect(inTable('CU-01')).toBe(true);
    expect(inTable('WD-01')).toBe(false); // back on default page 1
  });

  it('14. filter + pagination: page 2 of a filtered set, and a new filter resets to page 1', async () => {
    await renderPage();
    await chooseOption('All Divisions', 'Control Cable Division');
    await expectTotal(25);
    const page2 = document.querySelector('.ant-pagination-item-2 a') as HTMLElement | null;
    expect(page2).toBeTruthy();
    fireEvent.click(page2!);
    await waitFor(() => expect(lastList()).toMatchObject({ page: 2, divisionId: 'div-ccd' }));
    await screen.findByText(/Showing 21.25 of 25 entries/, undefined, { timeout: 8000 });
    expect(inTable('PVC-12')).toBe(true);
    expect(inTable('CU-01')).toBe(false);

    // changing a filter while on page 2 must jump back to page 1 of the new result
    await openMoreFilters();
    await chooseOption('Status', 'ACTIVE');
    await waitFor(() =>
      expect(lastList()).toMatchObject({ page: 1, divisionId: 'div-ccd', status: 'ACTIVE' }),
    );
    await expectTotal(24);
    expect(inTable('CU-01')).toBe(true);
  });

  it('15. reset while paginated returns to page 1 of the default dataset', async () => {
    await renderPage();
    await chooseOption('All Divisions', 'Control Cable Division');
    await expectTotal(25);
    const page2 = document.querySelector('.ant-pagination-item-2 a') as HTMLElement | null;
    expect(page2).toBeTruthy();
    fireEvent.click(page2!);
    await screen.findByText(/Showing 21.25 of 25 entries/, undefined, { timeout: 8000 });
    expect(inTable('PVC-12')).toBe(true);

    fireEvent.click(screen.getByTestId('clear-filters'));
    await waitFor(() => {
      const p = lastList();
      expect(p.page).toBe(1);
      expect(p).not.toHaveProperty('divisionId');
    });
    await expectTotal(45);
    expect(inTable('CU-01')).toBe(true);
    expect(inTable('PVC-12')).toBe(false); // default page 1 ends at PVC-07
  });

  it('16. empty result: filtered zero-row response shows the filtered empty state', async () => {
    await renderPage();
    fireEvent.change(searchInput(), { target: { value: 'zzz-no-such-item' } });
    await waitFor(() => expect(lastList().search).toBe('zzz-no-such-item'), { timeout: 5000 });
    await screen.findByText('No items match your filters', undefined, { timeout: 8000 });
    expect(tbodyText()).not.toContain('CU-01'); // no stale rows kept on screen
    expect(screen.queryByRole('alert')).not.toBeInTheDocument(); // zero rows ≠ error
  });

  it('17. API error: popup + alert surface the failure and stale rows are cleared', async () => {
    await renderPage();
    expect(inTable('CU-01')).toBe(true);
    fireEvent.change(searchInput(), { target: { value: 'boom' } });
    const alert = await screen.findByRole('alert', undefined, { timeout: 8000 });
    expect(alert).toHaveTextContent('Could not load items');
    await screen.findByText(/Could not load items —/, undefined, { timeout: 8000 }); // ERP message popup
    expect(inTable('CU-01')).toBe(false); // never silently keep the unfiltered dataset
    expect(lastList().search).toBe('boom');
  });

  it('18. no duplicate requests: one list request per query change, none on idle', async () => {
    await renderPage();
    expect(listCount()).toBe(1);
    await new Promise((r) => setTimeout(r, 700)); // debounce/KPI/serialize churn window
    expect(listCount()).toBe(1);

    await openMoreFilters();
    await chooseOption('Status', 'ACTIVE');
    await waitFor(() => expect(lastList().status).toBe('ACTIVE'));
    await expectTotal(44);
    expect(listCount()).toBe(2); // exactly one new request for the new query

    await new Promise((r) => setTimeout(r, 500));
    expect(listCount()).toBe(2); // still none after settling
  });
});

/* ── Bonus: the chevron category/status tabs are filters too ── */
describe('ITEM-FILTER-01 — chevron ribbon tabs drive the same query', () => {
  it('19. ACTIVE / ALL ITEMS chevrons set and clear the status query', async () => {
    await renderPage();
    fireEvent.click(chevronButton('ACTIVE'));
    await waitFor(() => expect(lastList().status).toBe('ACTIVE'));
    await expectTotal(44);
    expect(inTable('PVC-03')).toBe(false);

    fireEvent.click(chevronButton('ALLITEMS'));
    await waitFor(() => expect(lastList()).not.toHaveProperty('status'));
    await expectTotal(45);
    expect(inTable('CU-01')).toBe(true);
  });
});
