import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { App } from 'antd';
import { MemoryRouter } from 'react-router-dom';
import ItemManagement, { ITEM_TYPE_ICONS, ITEM_TYPE_WATERMARK_ICONS } from './ItemManagement';
import { ITEM_TYPES } from './items/itemTypes';
import apiService from '../../services/api';
import { tabSessionCache } from '../../services/tabSessionCache';

jest.mock('../../services/api');

jest.setTimeout(60000);

const apiMock = apiService as jest.Mocked<typeof apiService>;

// Item Master fixtures. Counts are derived from this REAL list at runtime (never
// hard-coded), so the "real/dynamic counts" tests actually verify it.
const ROWS: any[] = [
  {
    id: 'i-raw', itemCode: 'RAW-1', name: 'B4 Wire 1.20', shortName: 'B4',
    itemType: 'RAW_MATERIAL', status: 'ACTIVE', barcode: 'BC-RAW-1',
    division: { id: 'd1', divisionCode: 'DIV', name: 'Wire Division' },
    section: { id: 's1', sectionCode: 'SEC', name: 'Wire Section' },
    department: { id: 'dp1', departmentCode: 'DP', name: 'Store' },
    diameterMm: 1.2, wireSizeMm: null, lengthPerPiece: 150,
    baseUomName: 'KG', sku: '',
  },
  {
    id: 'i-fin', itemCode: 'FIN-1', name: 'Finished Spoke', shortName: null,
    itemType: 'FINISHED_GOOD', status: 'INACTIVE', barcode: null,
    division: null, section: null, department: null,
    diameterMm: null, wireSizeMm: null, lengthPerPiece: null,
    baseUomName: 'PCS', sku: null,
  },
  {
    id: 'i-svc', itemCode: 'SVC-1', name: 'Tooling Service', shortName: null,
    itemType: 'SERVICE', status: 'ACTIVE', barcode: 'BC-SVC-1',
    division: { id: 'd1', divisionCode: 'DIV', name: 'Wire Division' },
    section: null, department: null,
    diameterMm: null, wireSizeMm: null, lengthPerPiece: null,
    thicknessMm: null, widthMm: null, baseUomName: null, sku: 'SVC-SKU',
  },
];

function mockApi() {
  apiMock.get.mockImplementation(async (url: string, params?: any) => {
    if (url === '/master-data/items') {
      const rows = ROWS.filter((r) => {
        if (params?.itemType && r.itemType !== params.itemType) return false;
        if (params?.status && r.status !== params.status) return false;
        if (params?.isStockItem && !r.isStockItem) return false;
        if (params?.isManufacturable && !r.isManufacturable) return false;
        if (params?.search) {
          const kw = String(params.search).toLowerCase();
          const hay = `${r.itemCode} ${r.name} ${r.sku ?? ''} ${r.barcode ?? ''}`.toLowerCase();
          if (!hay.includes(kw)) return false;
        }
        return true;
      });
      return { data: rows, total: rows.length };
    }
    if (url === '/master-data/items/pipeline-stats') {
      // Chevron ribbon counts (ALL ITEMS / ACTIVE / INACTIVE + item-type tabs).
      return {
        data: {
          total: ROWS.length,
          active: ROWS.filter((r) => r.status === 'ACTIVE').length,
          inactive: ROWS.filter((r) => r.status !== 'ACTIVE').length,
          types: [
            { key: 'RAW_MATERIAL', label: 'Raw Material', count: ROWS.filter((r) => r.itemType === 'RAW_MATERIAL').length },
            { key: 'SERVICE', label: 'Service', count: ROWS.filter((r) => r.itemType === 'SERVICE').length },
          ],
        },
        total: 3,
      };
    }
    if (url.startsWith('/master-data/items/')) {
      const id = url.split('/').pop();
      return { data: ROWS.find((r) => r.id === id) ?? null };
    }
    if (url === '/companies') return { data: [{ id: 'co-1' }], total: 1 };
    return { data: [], total: 0 };
  });
}

function renderPage() {
  return render(
    <App>
      <MemoryRouter initialEntries={['/master-data/items']}>
        <ItemManagement />
      </MemoryRouter>
    </App>,
  );
}

// antd uses responsive hooks + ResizeObserver; make jsdom behave.
beforeAll(() => {
  window.matchMedia = (query: string) =>
    ({
      matches: false, media: query, onchange: null,
      addListener: () => {}, removeListener: () => {},
      addEventListener: () => {}, removeEventListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList;
  (global as any).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

beforeEach(() => {
  localStorage.setItem('erp_user', JSON.stringify({
    id: 'u1', email: 'e@x.com', displayName: 'User', defaultCompanyId: 'co-1',
    permissions: ['item.view', 'item.create', 'item.update', 'item.delete',
      'item.activate', 'item.deactivate', 'item_barcode.view'],
  }));
  localStorage.setItem('erp_permissions_ts', String(Date.now()));
  window.sessionStorage.clear();
  tabSessionCache.clear();
  apiMock.get.mockReset();
  mockApi();
});

const SEARCH_PLACEHOLDER = 'Search Item Register (code, name, SKU, barcode)...';

const rowOf = (code: string) => screen.getAllByText(code)[0]!.closest('tr')!;
/** The list queries only (the KPI/type count probes use limit=1). */
const mainItemCalls = () =>
  [...apiMock.get.mock.calls].filter(
    ([url, p]) => url === '/master-data/items' && p && (p as any).page && (p as any).limit !== 1,
  );
const lastMainItemsCall = () => mainItemCalls()[mainItemCalls().length - 1];
/** Chevron ribbon button found by its letters only (icon label + count stripped). */
const chevronByLetters = (letters: string) =>
  Array.from(document.querySelectorAll('button')).find(
    (b) => (b.textContent ?? '').replace(/[^A-Z]/g, '') === letters,
  );
const waitForChevron = (letters: string) =>
  waitFor(() => expect(chevronByLetters(letters)).toBeTruthy(), { timeout: 8000 });

describe('TASK 13 — Products & Items UI refinement regression', () => {
  it('R1: the chevron pipeline ribbon renders the canonical tabs in order (ALL ITEMS → ACTIVE → INACTIVE → types)', async () => {
    renderPage();
    await waitForChevron('RAWMATERIAL');
    const expected = ['ALLITEMS', 'ACTIVE', 'INACTIVE', 'RAWMATERIAL', 'SERVICE'];
    const buttons = expected.map((letters) => chevronByLetters(letters));
    buttons.forEach((b) => expect(b).toBeTruthy());
    const allButtons = Array.from(document.querySelectorAll('button'));
    const positions = buttons.map((b) => allButtons.indexOf(b!));
    expect(positions).toEqual([...positions].sort((a, b) => a - b)); // DOM order = canonical order
    expect(chevronByLetters('RAWMATERIAL')).toBeTruthy();
  });

  it('R2: every canonical item type has a primary icon (map parity + on-ribbon icon)', async () => {
    renderPage();
    await waitForChevron('RAWMATERIAL');
    // map covers exactly the canonical item types
    expect(Object.keys(ITEM_TYPE_ICONS)).toEqual(ITEM_TYPES.map((t) => t.value));
    // the item-type chevrons rendered on the ribbon all carry their icon
    for (const letters of ['RAWMATERIAL', 'SERVICE']) {
      const chevron = chevronByLetters(letters);
      expect(chevron).toBeTruthy();
      expect(chevron!.querySelector('.anticon')).not.toBeNull();
    }
  });

  it('R3: the background-watermark icon map stays in parity with the canonical item types', async () => {
    renderPage();
    await screen.findByPlaceholderText(SEARCH_PLACEHOLDER);
    expect(Object.keys(ITEM_TYPE_WATERMARK_ICONS)).toEqual(ITEM_TYPES.map((t) => t.value));
  });

  it('R4: active state defaults to ALL ITEMS and moves to the clicked item type (server refetch)', async () => {
    renderPage();
    // default mount query carries no item type filter
    await waitFor(() => {
      const call = lastMainItemsCall();
      expect(call).toBeDefined();
      expect(call![1]).not.toHaveProperty('itemType');
    }, { timeout: 8000 });
    await waitForChevron('RAWMATERIAL');
    fireEvent.click(chevronByLetters('RAWMATERIAL')!);
    await waitFor(() => {
      const call = [...mainItemCalls()]
        .reverse()
        .find(([, p]) => (p as any).itemType === 'RAW_MATERIAL');
      expect(call).toBeDefined();
    });
  });

  it('R5: search box is rendered on the toolbar', async () => {
    renderPage();
    await screen.findByPlaceholderText(SEARCH_PLACEHOLDER);
    expect(screen.getByPlaceholderText(SEARCH_PLACEHOLDER)).toBeInTheDocument();
  });

  it('R6: exactly one More Filters button exists (single filter system), toggles the filter panel', async () => {
    renderPage();
    await screen.findByPlaceholderText(SEARCH_PLACEHOLDER);
    expect(screen.getAllByRole('button', { name: /More Filters/ })).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: /More Filters/ }));
    expect(await screen.findByText('Section', { selector: '.ant-select-selection-placeholder' })).toBeInTheDocument();
  });

  it('R7: the active-filter count badge on Filters reflects a chosen filter value', async () => {
    renderPage();
    await screen.findByPlaceholderText(SEARCH_PLACEHOLDER);
    fireEvent.click(screen.getByRole('button', { name: /More Filters/ }));
    const statusPlaceholder = await screen.findByText('Status', { selector: '.ant-select-selection-placeholder' });
    const statusSelect = statusPlaceholder.closest('.ant-select') as HTMLElement;
    fireEvent.mouseDown(statusSelect.querySelector('.ant-select-selector') as HTMLElement);
    fireEvent.click(await screen.findByText('ACTIVE', { selector: '.ant-select-item-option-content' }));
    await waitFor(() => {
      const badges = Array.from(document.querySelectorAll('.ant-badge-count'));
      expect(badges.some((b) => b.textContent === '1')).toBe(true);
    });
    await waitFor(() => {
      const call = [...mainItemCalls()]
        .reverse()
        .find(([, p]) => (p as any).status === 'ACTIVE');
      expect(call).toBeDefined();
    });
  });

  it('R8: Clear Filters resets the search/filters and the server query', async () => {
    renderPage();
    const search = await screen.findByPlaceholderText(SEARCH_PLACEHOLDER);
    const clearBtn = screen.getByTestId('clear-filters');
    const applyBtn = screen.getByTestId('apply-filters');
    expect(clearBtn).toBeInTheDocument();
    expect(applyBtn).toBeInTheDocument();

    fireEvent.change(search, { target: { value: 'RAW' } });
    await waitFor(() => {
      const call = lastMainItemsCall();
      expect(call).toBeDefined();
      expect((call![1] as any).search).toBe('RAW');
    }, { timeout: 5000 });

    fireEvent.click(clearBtn);
    expect(search).toHaveValue('');
    // server-side list refetch without the search string
    await waitFor(() => {
      const call = lastMainItemsCall();
      expect(call).toBeDefined();
      expect(call![1]).toEqual(expect.not.objectContaining({ search: expect.anything() }));
    });
  });

  it('R9: Division + Section are merged into a single stacked 2-line column (no standalone columns)', async () => {
    renderPage();
    await screen.findByText('RAW-1');
    expect(screen.getByRole('columnheader', { name: 'apartment Division / Section' })).toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'Division' })).not.toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'Section' })).not.toBeInTheDocument();
    const rawRow = rowOf('RAW-1');
    expect(within(rawRow).getByText('Wire Division')).toBeInTheDocument();
    expect(within(rawRow).getByText('Wire Section')).toBeInTheDocument();
  });

  it('R10: Wire / Dia + Length are merged into a single stacked 2-line column (no standalone columns)', async () => {
    renderPage();
    await screen.findByText('RAW-1');
    expect(screen.getByRole('columnheader', { name: 'tool Wire / Dia Length' })).toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'Wire / Dia' })).not.toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'Length' })).not.toBeInTheDocument();
    const rawRow = rowOf('RAW-1');
    expect(within(rawRow).getByText('1.20')).toBeInTheDocument();
    expect(within(rawRow).getByText('L: 150.00')).toBeInTheDocument();
  });

  it('R11: the standalone Barcode table column is removed while the barcode row action is preserved', async () => {
    renderPage();
    await screen.findByText('RAW-1');
    expect(screen.queryByRole('columnheader', { name: 'Barcode' })).not.toBeInTheDocument();
    // the barcode action lives in the row "More actions" menu
    fireEvent.click(screen.getByRole('button', { name: 'More actions for RAW-1' }));
    fireEvent.click(await screen.findByText('Barcode & QR'));
    expect(await screen.findByText('Barcode — RAW-1')).toBeInTheDocument();
    expect(screen.getByText('Primary Barcode')).toBeInTheDocument();
  });

  it('R12: null Section renders a safe em-dash (no crash, no undefined/null text)', async () => {
    renderPage();
    await screen.findByText('SVC-1');
    const svcRow = rowOf('SVC-1');
    // division present, section missing → the merged cell still renders a dash
    expect(within(svcRow).getByText('Wire Division')).toBeInTheDocument();
    expect(within(svcRow).getAllByText('—').length).toBeGreaterThan(0);
    // raw row lookup unaffected by real browser layout — sanity check raw row still fine
    expect(within(rowOf('RAW-1')).getByText('Wire Section')).toBeInTheDocument();
  });

  it('R13: null Wire/Dia + Length render a safe em-dash (no NaN/undefined rendering)', async () => {
    renderPage();
    await screen.findByText('FIN-1');
    const finRow = rowOf('FIN-1');
    expect(within(finRow).getAllByText('—').length).toBeGreaterThan(0);
    expect(screen.queryByText('NaN')).not.toBeInTheDocument();
  });

  it('R14: item counts are real and dynamic — All Items and per-type count from the API', async () => {
    renderPage();
    await waitForChevron('RAWMATERIAL');
    await waitFor(() => {
      expect(chevronByLetters('ALLITEMS')!.textContent).toContain(String(ROWS.length));
    }, { timeout: 8000 });
    await waitFor(() => {
      expect(chevronByLetters('RAWMATERIAL')!.textContent).toContain('1');
    }, { timeout: 8000 });
    expect(chevronByLetters('SERVICE')!.textContent).toContain('1');
  });

  it('R15: typing performs server-side search (search param sent to the API)', async () => {
    renderPage();
    const search = await screen.findByPlaceholderText(SEARCH_PLACEHOLDER);
    fireEvent.change(search, { target: { value: 'SVC-SKU' } });
    await waitFor(() => {
      expect(
        [...mainItemCalls()].reverse()
          .find(([, p]) => (p as any).search === 'SVC-SKU'),
      ).toBeDefined();
    }, { timeout: 5000 });
  });
});