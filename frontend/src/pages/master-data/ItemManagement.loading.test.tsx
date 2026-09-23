/**
 * PRODUCTS-ITEMS-LOADING-01 — focused loading-state tests for Products & Items.
 *
 * The page must present the SHARED standard loading pattern (GlobalLoading →
 * LoadingState: orbital dual-ring indicator, title, description, status badge)
 * for BOTH loading states:
 *   • first load (no rows yet)      → page-level card, and
 *   • refresh with rows present     → the same card centred inside the table's
 *                                     antd Spin overlay (replacing the old
 *                                     ad-hoc hard-coded white card), plus:
 *   • no duplicate list requests — the existing single-flight guard must hold,
 *     even under React StrictMode's double-invoked effects, and
 *   • the existing error UI (alert + Retry) must keep working.
 *
 * The API mock gates the real table query (`limit !== 1`) with a deferred
 * promise so "while pending" states are deterministic; `releaseList()` /
 * `failList()` settle it inside `act`.
 */
import React from 'react';
import { readFileSync } from 'fs';
import { join } from 'path';
import { render, screen, fireEvent, waitFor, act, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { App } from 'antd';
import { MemoryRouter } from 'react-router-dom';
import ItemManagement from './ItemManagement';
import apiService from '../../services/api';
import { tabSessionCache } from '../../services/tabSessionCache';

jest.mock('../../services/api');
jest.setTimeout(120000);

const apiMock = apiService as jest.Mocked<typeof apiService>;

/* ── Fixture: compact item master (same shape the page normalizes) ── */
const ITEMS: Array<Record<string, any>> = [
  {
    id: 'pvc-1',
    itemCode: 'PVC-01',
    name: 'PVC Cable Grade 01',
    sku: 'SKU-PVC-01',
    itemType: 'RAW_MATERIAL',
    status: 'ACTIVE',
    baseUomName: 'KG',
    divisionId: 'div-ccd',
    sectionId: 'sec-pvc',
    departmentId: 'dep-pvc',
    categoryId: 'cat-cable',
    routeTypeId: 'rt-extrude',
    division: { id: 'div-ccd', name: 'Control Cable Division' },
    section: { id: 'sec-pvc', name: 'PVC & Packing Section' },
    department: { id: 'dep-pvc', name: 'PVC Department' },
  },
  {
    id: 'cu-1',
    itemCode: 'CU-01',
    name: 'Copper Wire 1.00 mm',
    itemType: 'FINISHED_GOOD',
    status: 'ACTIVE',
    baseUomName: 'M',
    divisionId: 'div-ccd',
    sectionId: 'sec-store',
    departmentId: 'dep-store',
    division: { id: 'div-ccd', name: 'Control Cable Division' },
    section: { id: 'sec-store', name: 'CCD Store Section' },
    department: { id: 'dep-store', name: 'Store Department' },
  },
  {
    id: 'wd-1',
    itemCode: 'WD-01',
    name: 'Wire Drawing Output 01',
    itemType: 'FINISHED_GOOD',
    status: 'ACTIVE',
    baseUomName: 'M',
    divisionId: 'div-wd',
    sectionId: 'sec-wire',
    departmentId: 'dep-wire',
    division: { id: 'div-wd', name: 'Wire Drawing Division' },
    section: { id: 'sec-wire', name: 'Wire Section' },
    department: { id: 'dep-wire', name: 'Wire Department' },
  },
];

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

/* ── Request introspection: real table queries only (KPI probes use limit=1) ── */
const listCalls = (): Array<[string, Record<string, any>?]> =>
  (apiMock.get.mock.calls as unknown as Array<[string, Record<string, any>?]>).filter(
    ([url, p]) => url === '/master-data/items' && p && p.limit !== 1,
  ) as Array<[string, Record<string, any>?]>;
const listCount = () => listCalls().length;

/* ── Deferred gate: holds the table query so pending states stay pending ── */
type Gate = { resolve: (v: any) => void; reject: (e: any) => void };
let holdListRequests = false;
let heldRequests: Gate[] = [];

const releaseList = async () => {
  const held = heldRequests;
  heldRequests = [];
  await act(async () => {
    held.forEach((g) => g.resolve({ data: ITEMS, total: ITEMS.length }));
  });
};

const failList = async (err: Error = new Error('Network down')) => {
  const held = heldRequests;
  heldRequests = [];
  await act(async () => {
    held.forEach((g) => g.reject(err));
  });
};

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
      email: 'loading.test@erp.com',
      displayName: 'Loading Tester',
      defaultCompanyId: 'co-1',
      permissions: ['item.view'],
    }),
  );
  localStorage.setItem('erp_permissions_ts', String(Date.now()));
  tabSessionCache.clear();

  holdListRequests = false;
  heldRequests = [];

  apiMock.get.mockReset();
  apiMock.get.mockImplementation(async (url: string, params?: any) => {
    if (url === '/master-data/items') {
      if (params?.limit === 1) return { data: [], total: ITEMS.length }; // KPI count probe
      if (holdListRequests) {
        // the real table query — held until the test releases/fails it
        return new Promise((resolve, reject) => {
          heldRequests.push({ resolve, reject });
        });
      }
      return { data: ITEMS, total: ITEMS.length };
    }
    if (url === '/master-data/items/pipeline-stats') {
      return { data: { total: ITEMS.length, active: ITEMS.length, inactive: 0, types: [] } };
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

afterEach(() => {
  holdListRequests = false;
  heldRequests = [];
});

/* ── Render helpers ── */
function renderPage({ strict = false }: { strict?: boolean } = {}) {
  const tree = (
    <App>
      <MemoryRouter initialEntries={['/master-data/items']}>
        <ItemManagement />
      </MemoryRouter>
    </App>
  );
  return render(strict ? <React.StrictMode>{tree}</React.StrictMode> : tree);
}

const loadingCard = () => screen.queryByTestId('global-loading');
const flushAsyncWork = async () => {
  await act(async () => {
    await Promise.resolve();
  });
};

describe('PRODUCTS-ITEMS-LOADING-01 — standard loading UI on Products & Items', () => {
  it('1. shows the loading component while the items request is pending', async () => {
    holdListRequests = true;
    renderPage();

    // the request is genuinely in flight (held) and the shared card is shown
    expect(heldRequests).toHaveLength(1);
    const card = screen.getByTestId('global-loading');
    expect(card).toBeInTheDocument();
    expect(card).toHaveAttribute('role', 'status');
    expect(card).toHaveAttribute('aria-live', 'polite');

    // stays while pending — even after the organization lookups settle —
    // and no empty-state leaks through before the first response
    await flushAsyncWork();
    expect(loadingCard()).toBeInTheDocument();
    expect(screen.queryByText(/No items/)).toBeNull();
  });

  it('2. shows the standard loading title (no stale hard-coded copy)', async () => {
    holdListRequests = true;
    renderPage();

    expect(screen.getByText('Loading Products & Items...')).toBeInTheDocument();
    expect(screen.queryByText(/Loading Item Registry/i)).toBeNull();
    expect(screen.queryByText(/3,833/)).toBeNull();
  });

  it('3. shows the shared orbital loading indicator', async () => {
    holdListRequests = true;
    const { container } = renderPage();

    const card = screen.getByTestId('global-loading');
    expect(card).toBeInTheDocument();
    expect(screen.getByTestId('erp-loading-state')).toBeInTheDocument();
    expect(card.querySelector('.erp-loading-spinner-wrap')).not.toBeNull();
    expect(card.querySelector('.erp-loading-orbital-svg')).not.toBeNull();
    // the standard card must not carry the ad-hoc LoadingOutlined spinner
    expect(card.querySelector('.anticon-loading')).toBeNull();
    expect(container.querySelector('.erp-loading-orbital-svg')).not.toBeNull();
  });

  it('4. shows the standard loading description and status badge', async () => {
    holdListRequests = true;
    renderPage();

    expect(screen.getByText('Fetching products and item records...')).toBeInTheDocument();
    expect(screen.getByText('LIVE DATABASE QUERY')).toBeInTheDocument();
  });

  it('5. removes the loading component after a successful response', async () => {
    holdListRequests = true;
    renderPage();
    expect(loadingCard()).toBeInTheDocument();

    await releaseList();
    await waitFor(() => expect(loadingCard()).toBeNull());
  });

  it('6. shows the items table after loading completes', async () => {
    holdListRequests = true;
    renderPage();

    await releaseList();
    const cell = await screen.findByText('PVC-01');
    expect(cell.closest('tbody')).not.toBeNull(); // the real table rendered
    expect(loadingCard()).toBeNull();
  });

  it('7. removes the loading component after an API error', async () => {
    holdListRequests = true;
    renderPage();
    expect(loadingCard()).toBeInTheDocument();

    await failList();
    await waitFor(() => expect(loadingCard()).toBeNull());
  });

  it('8. keeps the existing error UI functional (alert + Retry re-queries)', async () => {
    holdListRequests = true;
    renderPage();
    await failList();

    // existing error presentation is untouched
    expect(await screen.findByText('Could not load items')).toBeInTheDocument();
    const retry = screen.getByRole('button', { name: /Retry/i });
    expect(retry).toBeInTheDocument();

    // Retry issues a fresh request that succeeds and restores the table
    holdListRequests = false;
    fireEvent.click(retry);
    const cell = await screen.findByText('PVC-01');
    expect(cell.closest('tbody')).not.toBeNull();
    expect(screen.queryByText('Could not load items')).toBeNull();
    expect(listCount()).toBe(2); // initial + retry — nothing lost, nothing duplicated
  });

  it('9. issues exactly one list request — no duplicates, even under StrictMode', async () => {
    holdListRequests = true;
    renderPage({ strict: true });

    // both StrictMode effect runs happen before paint; the single-flight guard
    // (inFlightKeyRef) must collapse them into ONE request
    expect(listCount()).toBe(1);
    expect(heldRequests).toHaveLength(1);
    expect(loadingCard()).toBeInTheDocument();

    await releaseList();
    await waitFor(() => expect(loadingCard()).toBeNull());
    await screen.findByText('PVC-01');
    expect(listCount()).toBe(1); // settled → no trailing duplicate either
  });

  it('10. refresh with rows present: standard card in the Spin overlay (old ad-hoc card gone)', async () => {
    // 1) load normally so rows are on screen
    renderPage();
    await screen.findByText('PVC-01');

    // 2) force a refresh and hold it → rows stay, loading card appears
    holdListRequests = true;
    fireEvent.click(screen.getByTestId('apply-filters'));
    await waitFor(() => expect(loadingCard()).not.toBeNull());
    expect(heldRequests).toHaveLength(1);

    const spin = document.querySelector('.ant-spin');
    expect(spin).not.toBeNull();
    const spinEl = spin as HTMLElement;
    // the shared card lives INSIDE the table's Spin overlay, exactly once
    expect(within(spinEl).getByTestId('global-loading')).toBeInTheDocument();
    expect(spinEl.querySelector('.erp-loading-orbital-svg')).not.toBeNull();
    expect(screen.getByText('Loading Products & Items...')).toBeInTheDocument();
    expect(screen.getByText('Fetching products and item records...')).toBeInTheDocument();
    // the old ad-hoc hard-coded card (LoadingOutlined, light-only) is replaced
    expect(spinEl.querySelector('.anticon-loading')).toBeNull();
    expect(spinEl.textContent).not.toContain('Loading Records...');
    // rows remain visible while refreshing — data behaviour unchanged
    expect(screen.getByText('PVC-01')).toBeInTheDocument();

    // 3) release → overlay card disappears, table stays
    await releaseList();
    await waitFor(() => expect(loadingCard()).toBeNull());
    expect(screen.getByText('PVC-01')).toBeInTheDocument();
    expect(listCount()).toBe(2); // one initial + one refresh, no extras
  });

  it('11. refresh overlay is a solid theme surface — no blur/fade styling (regression)', async () => {
    // load → rows on screen → hold a refresh so the Spin overlay is up
    renderPage();
    await screen.findByText('PVC-01');
    holdListRequests = true;
    fireEvent.click(screen.getByTestId('apply-filters'));
    await waitFor(() => expect(loadingCard()).not.toBeNull());

    // (a) the scoped surface class is wired on this page's table container, and
    //     the selector chain in itemManagement.css matches the real DOM shape
    const tableContainer = document.querySelector('.erp-table-container');
    expect(tableContainer).not.toBeNull();
    expect(tableContainer!.classList.contains('items-loading-surface')).toBe(true);
    expect(
      tableContainer!.querySelector('.erp-table .ant-spin-nested-loading > div > .ant-spin'),
    ).not.toBeNull();

    // (b) antd's interaction block is still in place — the table container keeps
    //     `.ant-spin-blur` (pointer-events: none / user-select: none), so the
    //     table stays non-interactive while loading; only its visual fade goes
    expect(document.querySelector('.ant-spin-container.ant-spin-blur')).not.toBeNull();

    // (c) no element INSIDE the loading overlay carries inline blur/fade styles
    //     (backdrop-filter / filter / opacity < 1)
    const overlay = document.querySelector('.ant-spin') as HTMLElement | null;
    expect(overlay).not.toBeNull();
    const overlayParts: HTMLElement[] = [
      overlay!,
      ...Array.from(overlay!.querySelectorAll<HTMLElement>('*')),
    ];
    overlayParts.forEach((el) => {
      const decl = el.style;
      expect(decl.getPropertyValue('backdrop-filter')).not.toMatch(/blur/);
      expect(decl.getPropertyValue('-webkit-backdrop-filter')).not.toMatch(/blur/);
      expect(decl.getPropertyValue('filter')).not.toMatch(/blur/);
      if (decl.opacity) expect(parseFloat(decl.opacity)).toBeGreaterThanOrEqual(1);
    });

    // (d) the page stylesheet ships the scoped fix — jsdom does not apply CSS
    //     files, so assert the exact source production loads: opaque token
    //     surface, backdrop-filter: none, antd fade neutralized
    const css = readFileSync(join(process.cwd(), 'src/pages/master-data/itemManagement.css'), 'utf8');
    const scoped = '.erp-table-container.items-loading-surface';
    expect(css).toContain(`${scoped} .erp-table .ant-spin-nested-loading > div > .ant-spin {`);
    const overlayRule = css.slice(css.indexOf(`${scoped} .erp-table`));
    expect(overlayRule).toMatch(/background: var\(--theme-surface\) !important/);
    expect(overlayRule).toMatch(/backdrop-filter: none !important/);
    expect(overlayRule).toMatch(/max-height: none !important/);
    expect(css).toMatch(/\.ant-spin-blur \{\s*opacity: 1;/);
    expect(css).toMatch(/\.ant-spin-blur::after \{\s*opacity: 0;/);

    await releaseList();
    await waitFor(() => expect(loadingCard()).toBeNull());
  });
});
