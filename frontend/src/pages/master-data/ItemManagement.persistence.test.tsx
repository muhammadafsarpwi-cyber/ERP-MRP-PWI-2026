/**
 * PRODUCTS-ITEMS-LOADING-02 — loaded-state persistence tests for Products & Items.
 *
 * Architecture contract under test (the workspace remounts this page on every
 * route change, so persistence is owned by the page + TabKeepAlive/tabSessionCache):
 *
 *   • first load  (no cache)       → exactly 1 list request + the page-level
 *                                    "Loading Products & Items..." card.
 *   • SPA return  (cache present)  → 0 list requests, no loading overlay, rows /
 *                                    search / filters / pagination / sort restored
 *                                    from the session snapshot.
 *   • explicit Refresh             → 1 forced request, loading stays at the
 *                                    TABLE level (rows remain in the DOM).
 *   • search / filter change       → 1 request, table-level loading only.
 *   • mutation (edit → save)       → 1 targeted refresh, page stays mounted.
 *   • StrictMode                   → still exactly 1 initial request (the
 *                                    mount-key guard is idempotent).
 *   • cache isolation              → only `/master-data/products-items` is
 *                                    written; other module tabs miss the cache.
 *
 * The API mock is a MINI SERVER (same AND-combination contract as
 * `ItemService.findAll`, `total` = filtered count) but every list request can be
 * captured behind a held promise (`holdListRequests` / `releaseList()`), so all
 * "while pending" assertions are deterministic. `releaseList()` answers from the
 * CURRENT `dataset`, which lets the refresh test prove that fresh data really
 * replaces the cached rows.
 */
import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import { App } from 'antd';
import { MemoryRouter } from 'react-router-dom';
import ItemManagement from './ItemManagement';
import { TabKeepAlive } from '../../components/shared';
import { useHeaderActions } from '../../components/layout/headerActionsStore';
import apiService from '../../services/api';
import { tabSessionCache } from '../../services/tabSessionCache';

jest.mock('../../services/api');
jest.setTimeout(120000);

const apiMock = apiService as jest.Mocked<typeof apiService>;

/* ── Fixture: item master (same shape the page normalizes) ── */
const buildItems = (): Array<Record<string, any>> => {
  const items: Array<Record<string, any>> = [];
  for (let i = 1; i <= 20; i++) {
    items.push({
      id: `pvc-${i}`,
      itemCode: `PVC-${String(i).padStart(2, '0')}`,
      name: `PVC Cable Grade ${String(i).padStart(2, '0')}`,
      sku: `SKU-PVC-${String(i).padStart(2, '0')}`,
      itemType: 'RAW_MATERIAL',
      status: i === 3 ? 'INACTIVE' : 'ACTIVE',
      categoryName: 'Copper',
      divisionName: 'Control Cable Division',
      sectionName: 'PVC & Packing Section',
      departmentName: 'PVC Department',
      baseUomName: 'Kilogram',
      baseUomId: 'uom-kg',
      division: { id: 'div-ccd', name: 'Control Cable Division' },
      section: { id: 'sec-pvc', name: 'PVC & Packing Section', divisionId: 'div-ccd' },
      department: { id: 'dep-pvc', name: 'PVC Department', sectionId: 'sec-pvc', divisionId: 'div-ccd' },
      category: { id: 'cat-copper', name: 'Copper' },
    });
  }
  for (let i = 1; i <= 13; i++) {
    items.push({
      id: `cu-${i}`,
      itemCode: `CU-${String(i).padStart(2, '0')}`,
      name: `Copper Wire ${String(i).padStart(2, '0')}`,
      sku: `SKU-CU-${String(i).padStart(2, '0')}`,
      itemType: 'RAW_MATERIAL',
      status: 'ACTIVE',
      categoryName: 'Copper',
      divisionName: 'Control Cable Division',
      sectionName: 'PVC & Packing Section',
      departmentName: 'PVC Department',
      baseUomName: 'Meter',
      baseUomId: 'uom-m',
      division: { id: 'div-ccd', name: 'Control Cable Division' },
      section: { id: 'sec-pvc', name: 'PVC & Packing Section', divisionId: 'div-ccd' },
      department: { id: 'dep-pvc', name: 'PVC Department', sectionId: 'sec-pvc', divisionId: 'div-ccd' },
      category: { id: 'cat-copper', name: 'Copper' },
    });
  }
  for (let i = 1; i <= 12; i++) {
    items.push({
      id: `hdpe-${i}`,
      itemCode: `HDPE-${String(i).padStart(2, '0')}`,
      name: `HDPE Granule ${String(i).padStart(2, '0')}`,
      sku: `SKU-HDPE-${String(i).padStart(2, '0')}`,
      itemType: 'RAW_MATERIAL',
      status: 'ACTIVE',
      categoryName: 'Polymer',
      divisionName: 'Control Cable Division',
      sectionName: 'PVC & Packing Section',
      departmentName: 'PVC Department',
      baseUomName: 'Kilogram',
      baseUomId: 'uom-kg',
      division: { id: 'div-ccd', name: 'Control Cable Division' },
      section: { id: 'sec-pvc', name: 'PVC & Packing Section', divisionId: 'div-ccd' },
      department: { id: 'dep-pvc', name: 'PVC Department', sectionId: 'sec-pvc', divisionId: 'div-ccd' },
      category: { id: 'cat-polymer', name: 'Polymer' },
    });
  }
  for (let i = 1; i <= 20; i++) {
    items.push({
      id: `fg-${i}`,
      itemCode: `FG-${String(i).padStart(2, '0')}`,
      name: `Panel Fan Set ${String(i).padStart(2, '0')}`,
      sku: `SKU-FG-${String(i).padStart(2, '0')}`,
      itemType: 'FINISHED_GOOD',
      status: 'ACTIVE',
      categoryName: 'Finished Goods',
      divisionName: 'Wire Drawing Division',
      sectionName: 'Wire Section',
      departmentName: 'Wire Drawing Department',
      baseUomName: 'Pieces',
      baseUomId: 'uom-pcs',
      division: { id: 'div-wd', name: 'Wire Drawing Division' },
      section: { id: 'sec-wire', name: 'Wire Section', divisionId: 'div-wd' },
      department: { id: 'dep-wire', name: 'Wire Drawing Department', sectionId: 'sec-wire', divisionId: 'div-wd' },
      category: { id: 'cat-fg', name: 'Finished Goods' },
    });
  }
  return items;
};

let dataset = buildItems();

/* Rows returned AFTER an explicit refresh proves fresh data replaced the cache. */
const FRESH_ITEMS: Array<Record<string, any>> = [
  {
    id: 'fresh-1',
    itemCode: 'FRESH-01',
    name: 'Freshly Refreshed Row',
    sku: 'SKU-FRESH-01',
    itemType: 'RAW_MATERIAL',
    status: 'ACTIVE',
    categoryName: 'Copper',
    divisionName: 'Control Cable Division',
    sectionName: 'PVC & Packing Section',
    departmentName: 'PVC Department',
    baseUomName: 'Kilogram',
    baseUomId: 'uom-kg',
    division: { id: 'div-ccd', name: 'Control Cable Division' },
    section: { id: 'sec-pvc', name: 'PVC & Packing Section', divisionId: 'div-ccd' },
    department: { id: 'dep-pvc', name: 'PVC Department', sectionId: 'sec-pvc', divisionId: 'div-ccd' },
    category: { id: 'cat-copper', name: 'Copper' },
  },
];

/* ── Mini server: every supplied parameter is AND-combined, `total` = filtered count ── */
function queryItems(params: Record<string, any> = {}, rows: Array<Record<string, any>> = dataset) {
  let filtered = [...rows];
  if (params.search) {
    const kw = String(params.search).toLowerCase();
    filtered = filtered.filter((r) =>
      [r.itemCode, r.name, r.sku].some((s) => String(s ?? '').toLowerCase().includes(kw)),
    );
  }
  ['divisionId', 'sectionId', 'departmentId', 'categoryId', 'itemType', 'materialRoleUsage', 'routeTypeId', 'status'].forEach((key) => {
    if (params[key] !== undefined) filtered = filtered.filter((r) => r[key] === params[key]);
  });
  if (params.sortField) {
    const dir = params.sortOrder === 'DESC' ? -1 : 1;
    filtered.sort((a, b) => String(a[params.sortField] ?? '').localeCompare(String(b[params.sortField] ?? '')) * dir);
  }
  const page = Number(params.page || 1);
  const limit = Number(params.limit || 20);
  return { data: filtered.slice((page - 1) * limit, (page - 1) * limit + limit), total: filtered.length };
}

/* ── Request bookkeeping ───────────────────────────────────────────────────
 *  - `listCalls()` only counts the REAL table query (`/master-data/items`
 *    with `limit !== 1`; the page's invisible stats/KPI probes use limit 1).
 *  - the gate defers every list response until `releaseList()` so "while
 *    pending" states are deterministic.
 */
let holdListRequests = false;
let heldRequests: Array<{ resolve: (v: any) => void; params: Record<string, any> }> = [];

const listCalls = (): Array<[string, Record<string, any>]> =>
  (apiMock.get.mock.calls as Array<[string, Record<string, any>]>)
    .filter(([url, params]) => url === '/master-data/items' && params?.limit !== 1);
const listCount = () => listCalls().length;
const lastList = (): Record<string, any> => listCalls()[listCount() - 1]?.[1] ?? {};

async function releaseList() {
  const held = heldRequests;
  heldRequests = [];
  await act(async () => {
    held.forEach((g) => g.resolve(queryItems(g.params ?? {})));
  });
}

async function settle(ms = 650) {
  await act(async () => {
    await new Promise((r) => setTimeout(r, ms));
  });
}

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
  (window as any).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  window.HTMLElement.prototype.scrollIntoView = () => {};
  window.HTMLElement.prototype.setPointerCapture = () => {};
});

beforeEach(() => {
  window.sessionStorage.clear();
  window.localStorage.clear();
  // item.update → the row Edit action exists (used by the mutation test).
  window.localStorage.setItem('erp_user', JSON.stringify({ id: 'usr-1', permissions: ['item.view', 'item.update'] }));
  window.localStorage.setItem('erp_permissions_ts', String(Date.now()));
  tabSessionCache.clear();
  dataset = buildItems();
  holdListRequests = false;
  heldRequests = [];
  apiMock.get.mockReset();
  apiMock.patch.mockReset();
  apiMock.patch.mockResolvedValue({ data: { data: { itemCode: 'PVC-01', name: 'PVC Cable Grade 01' } } } as any);
  apiMock.get.mockImplementation(async (url: string, params?: any) => {
    if (url === '/master-data/items') {
      if (params?.limit === 1) return { data: [], total: queryItems(params ?? {}).total } as any;
      if (holdListRequests) {
        return new Promise((resolve, reject) => {
          heldRequests.push({ resolve, params: params ?? {} });
        });
      }
      return queryItems(params ?? {}) as any;
    }
    if (url === '/master-data/items/pipeline-stats') {
      return { data: { total: dataset.length, active: dataset.length - 1, inactive: 1, types: [] } } as any;
    }
    if (url === '/divisions') return { data: [{ id: 'div-ccd', name: 'Control Cable Division' }, { id: 'div-wd', name: 'Wire Drawing Division' }], total: 2 } as any;
    if (url === '/sections') return { data: [{ id: 'sec-pvc', name: 'PVC & Packing Section', divisionId: 'div-ccd' }, { id: 'sec-wire', name: 'Wire Section', divisionId: 'div-wd' }], total: 2 } as any;
    if (url === '/departments') return { data: [{ id: 'dep-pvc', name: 'PVC Department', sectionId: 'sec-pvc', divisionId: 'div-ccd' }, { id: 'dep-wire', name: 'Wire Drawing Department', sectionId: 'sec-wire', divisionId: 'div-wd' }], total: 2 } as any;
    if (url === '/master-data/uom' || url === '/uoms') return { data: [{ id: 'uom-kg', name: 'Kilogram', code: 'KG' }, { id: 'uom-m', name: 'Meter', code: 'M' }, { id: 'uom-pcs', name: 'Pieces', code: 'PCS' }], total: 3 } as any;
    if (url === '/master-data/categories' || url === '/categories') return { data: [{ id: 'cat-copper', name: 'Copper' }, { id: 'cat-polymer', name: 'Polymer' }, { id: 'cat-fg', name: 'Finished Goods' }], total: 3 } as any;
    return { data: [], total: 0 } as any;
  });
});

afterEach(() => {
  holdListRequests = false;
  heldRequests = [];
});

/* ── Page header actions host ───────────────────────────────────────────────
 * `PageHeader` returns null and pushes its `extra` (Refresh button, Add Item…)
 * into the header-actions store; the real layout renders it through a host
 * component. Mirror that so the Refresh button exists in this suite's tree.
 */
function HeaderActionsHost() {
  const extra = useHeaderActions((s) => s.extra);
  const title = useHeaderActions((s) => s.title);
  return (
    <div data-testid="header-actions">
      <div>{title}</div>
      <div>{extra}</div>
    </div>
  );
}

function renderPage(opts: { strict?: boolean } = {}) {
  const tree = (
    <App>
      <MemoryRouter initialEntries={['/master-data/items']}>
        <HeaderActionsHost />
        <ItemManagement />
      </MemoryRouter>
    </App>
  );
  return render(opts.strict ? <React.StrictMode>{tree}</React.StrictMode> : tree);
}

/* ── Query helpers ──────────────────────────────────────────────────────── */
const loadingCard = () => screen.queryByTestId('global-loading');
const hasTable = () => document.querySelector('.erp-table-container') !== null;
const searchInput = () => screen.getByPlaceholderText('Search Item Register (code, name, SKU, barcode)...') as HTMLInputElement;
const bodyText = () =>
  (document.querySelector('.ant-table-tbody') as HTMLElement | null)?.textContent ?? '';
const inTable = (text: string) => bodyText().includes(text);
async function expectTotal(n: number) {
  await waitFor(() => expect(document.body.textContent).toContain(`of ${n} entries`));
}
/** Ribbon chevron: ALLITEMS / ACTIVE / INACTIVE / … (label + count text). */
function chevronButton(letters: string) {
  const btn = Array.from(document.querySelectorAll('.item-quick-filter-btn, button')).find(
    (b) => (b.textContent ?? '').replace(/[^A-Z]/g, '') === letters,
  ) as HTMLElement | undefined;
  if (!btn) throw new Error(`chevron button not found: ${letters}`);
  return btn;
}
/** PageHeader Refresh action (the only `.erp-toolbar-action-btn` with a reload icon). */
function refreshButton() {
  const icons = document.querySelectorAll('.erp-toolbar-action-btn .anticon-reload');
  expect(icons.length).toBe(1);
  return icons[0].closest('button') as HTMLElement;
}

describe('PRODUCTS-ITEMS-LOADING-02 — loaded-state persistence', () => {
  it('1. first load: exactly one list request + the page-level loading card, then rows', async () => {
    holdListRequests = true;
    renderPage();

    await waitFor(() => expect(listCount()).toBe(1));
    expect(heldRequests).toHaveLength(1);

    // Page-level branch (no rows yet): shared card with the standard copy, no table shell.
    expect(screen.getByTestId('global-loading')).toBeInTheDocument();
    expect(screen.getByText('Loading Products & Items...')).toBeInTheDocument();
    expect(screen.getByText('Fetching products and item records...')).toBeInTheDocument();
    expect(hasTable()).toBe(false);

    await releaseList();

    await screen.findByText('PVC-01');
    await expectTotal(45);
    expect(loadingCard()).toBeNull();
    expect(hasTable()).toBe(true);
    expect(listCount()).toBe(1);
  });

  it('2. SPA return: restores rows + search with zero list requests and no loading overlay', async () => {
    // First visit: load, then search — both responses land in the session snapshot.
    const first = renderPage();
    await screen.findByText('PVC-01');
    await expectTotal(45);

    fireEvent.change(searchInput(), { target: { value: 'pvc' } });
    await waitFor(() => expect(listCount()).toBe(2));
    await expectTotal(12);

    first.unmount();

    // SPA return under StrictMode (the hardest double-invoked-effects case).
    renderPage({ strict: true });

    // Rows, search box and total come straight from the cache — synchronously.
    expect(inTable('PVC-01')).toBe(true);
    expect(loadingCard()).toBeNull();
    expect(hasTable()).toBe(true);
    expect(searchInput().value).toBe('pvc');
    await expectTotal(12);

    // Stay mounted past the 400 ms search debounce: still zero new requests.
    await settle();
    expect(listCount()).toBe(2);
    expect(heldRequests).toHaveLength(0);
    expect(loadingCard()).toBeNull();
  });

  it('3. explicit Refresh: one forced request, table-level loading only, fresh data rendered', async () => {
    renderPage();
    await screen.findByText('PVC-01');
    await expectTotal(45);
    expect(listCount()).toBe(1);

    // The data behind the API changes; only the refresh may pick it up.
    dataset = FRESH_ITEMS;
    holdListRequests = true;

    fireEvent.click(refreshButton());
    await waitFor(() => expect(heldRequests).toHaveLength(1));
    expect(listCount()).toBe(2);

    // TABLE-level loading: the table shell + previous rows stay mounted under the
    // antd Spin overlay — the page-level card branch is never taken.
    expect(hasTable()).toBe(true);
    expect(inTable('PVC-01')).toBe(true);
    const card = loadingCard();
    expect(card).not.toBeNull();
    expect(card!.closest('.ant-spin')).not.toBeNull();
    expect(screen.getByText('Loading Products & Items...')).toBeInTheDocument();

    await releaseList();

    // Fresh response replaced the cached rows.
    await screen.findByText('FRESH-01');
    await waitFor(() => expect(inTable('PVC-01')).toBe(false));
    expect(loadingCard()).toBeNull();
    expect(listCount()).toBe(2); // 1 first load + 1 refresh — nothing else
  });

  it('4. search: table-level loading only, filtered results after the response', async () => {
    renderPage();
    await screen.findByText('PVC-01');
    await expectTotal(45);
    expect(listCount()).toBe(1);

    holdListRequests = true;
    fireEvent.change(searchInput(), { target: { value: 'cu' } });

    await waitFor(() => expect(lastList().search).toBe('cu'));
    expect(listCount()).toBe(2);

    // Table-level only: shell + previous rows stay, loading card inside the Spin.
    expect(hasTable()).toBe(true);
    expect(inTable('PVC-01')).toBe(true);
    const card = loadingCard();
    expect(card).not.toBeNull();
    expect(card!.closest('.ant-spin')).not.toBeNull();

    await releaseList();

    await expectTotal(13);
    expect(inTable('CU-01')).toBe(true);
    expect(inTable('PVC-01')).toBe(false);
    expect(loadingCard()).toBeNull();
    expect(listCount()).toBe(2);
  });

  it('5. filter (Status = ACTIVE): table-level loading only, filtered results after', async () => {
    renderPage();
    await screen.findByText('PVC-03'); // INACTIVE row present on the unfiltered list
    await expectTotal(45);
    expect(listCount()).toBe(1);

    holdListRequests = true;
    fireEvent.click(chevronButton('ACTIVE'));

    await waitFor(() => expect(lastList().status).toBe('ACTIVE'));
    expect(listCount()).toBe(2);

    expect(hasTable()).toBe(true);
    expect(inTable('PVC-03')).toBe(true); // previous rows still mounted while pending
    const card = loadingCard();
    expect(card).not.toBeNull();
    expect(card!.closest('.ant-spin')).not.toBeNull();

    await releaseList();

    await expectTotal(44); // 45 rows − the one INACTIVE row
    expect(inTable('PVC-01')).toBe(true);
    expect(inTable('PVC-03')).toBe(false);
    expect(loadingCard()).toBeNull();
    expect(listCount()).toBe(2);
  });

  it('6. mutation (edit → save): one targeted refresh, page stays mounted, no full-page loading', async () => {
    renderPage();
    await screen.findByText('PVC-01');
    await expectTotal(45);
    expect(listCount()).toBe(1);

    // Open the real edit form for PVC-01 (Base UOM prefilled from the row).
    fireEvent.click(screen.getByLabelText('Edit PVC-01'));
    await screen.findByText(/Edit Item — PVC-01/);
    // Let the form's own InputMaterialSelect lookup settle, then take the baseline.
    await settle();
    const before = listCount();

    holdListRequests = true;
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));

    // Success dialog (PATCH resolved) → closing it triggers the targeted refresh.
    await waitFor(() => expect(document.querySelector('.erp-save-result-close')).not.toBeNull());
    expect(apiMock.patch).toHaveBeenCalledWith('/master-data/items/pvc-1', expect.any(Object));
    fireEvent.click(document.querySelector('.erp-save-result-close') as HTMLElement);

    await waitFor(() => expect(heldRequests).toHaveLength(1));
    expect(listCount()).toBe(before + 1); // exactly one refresh — the page never remounted

    // Form closed, table still mounted, loading at the TABLE level only.
    expect(screen.queryByText(/Edit Item — PVC-01/)).toBeNull();
    expect(hasTable()).toBe(true);
    expect(inTable('PVC-01')).toBe(true);
    const card = loadingCard();
    expect(card).not.toBeNull();
    expect(card!.closest('.ant-spin')).not.toBeNull();

    await releaseList();

    await screen.findByText('PVC-01');
    expect(loadingCard()).toBeNull();
    expect(listCount()).toBe(before + 1);
  });

  it('7. StrictMode: exactly one initial list request (mount-key guard is idempotent)', async () => {
    holdListRequests = true;
    renderPage({ strict: true });

    await waitFor(() => expect(listCount()).toBe(1));
    expect(heldRequests).toHaveLength(1);
    expect(screen.getByTestId('global-loading')).toBeInTheDocument();
    expect(hasTable()).toBe(false);

    await releaseList();

    await screen.findByText('PVC-01');
    await expectTotal(45);
    expect(loadingCard()).toBeNull();
    expect(listCount()).toBe(1);
  });

  it('8. cache isolation: only the Products & Items key is written; other module tabs miss it', async () => {
    renderPage();
    await screen.findByText('PVC-01');
    await expectTotal(45);

    // Exactly one session snapshot exists — for Products & Items, nothing else.
    const keys: string[] = [];
    for (let i = 0; i < window.sessionStorage.length; i++) {
      const k = window.sessionStorage.key(i)!;
      if (k.startsWith('erp_tab_session_')) keys.push(k);
    }
    expect(keys).toEqual(['erp_tab_session_/master-data/products-items']);

    const cached = tabSessionCache.get<any>('/master-data/products-items');
    expect(Array.isArray(cached?.items)).toBe(true);
    expect(cached?.total).toBe(45);

    // Another module's keep-alive tab must NOT see Products & Items data:
    // its loader runs (cache miss) and the Products & Items snapshot is untouched.
    const foreignLoad = jest.fn();
    render(
      <TabKeepAlive tabId="/master-data/machines" load={foreignLoad}>
        <div>foreign-module-tab</div>
      </TabKeepAlive>,
    );
    await screen.findByText('foreign-module-tab');
    await waitFor(() => expect(foreignLoad).toHaveBeenCalledTimes(1));

    expect(tabSessionCache.get('/master-data/machines')).toBeUndefined();
    expect(tabSessionCache.has('/master-data/products-items')).toBe(true);
    expect(inTable('PVC-01')).toBe(true);
    expect(loadingCard()).toBeNull();
  });
});
