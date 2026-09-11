import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { App } from 'antd';
import { MemoryRouter } from 'react-router-dom';
import ItemManagement, { ITEM_TYPE_ICONS, ITEM_TYPE_WATERMARK_ICONS } from './ItemManagement';
import { ITEM_TYPES } from './items/itemTypes';
import apiService from '../../services/api';

jest.mock('../../services/api');
jest.mock('jspdf');
jest.mock('jspdf-autotable');

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
  apiMock.get.mockReset();
  mockApi();
});

const rowOf = (code: string) => screen.getAllByText(code)[0]!.closest('tr')!;
const lastMainItemsCall = () => {
  return [...apiMock.get.mock.calls]
    .reverse()
    .find(([url, p]) => url === '/master-data/items' && p && (p as any).page && !(p as any).itemType);
};

describe('TASK 13 — Products & Items UI refinement regression', () => {
  it('R1: renders the item type cards in the canonical business order', async () => {
    renderPage();
    await screen.findByTestId('item-type-card-all');
    const cards = screen.getAllByTestId(/^item-type-card-/)
      .filter((el) => el.getAttribute('data-testid') !== 'item-type-card-all');
    expect(cards.map((c) => c.getAttribute('aria-label'))).toEqual(ITEM_TYPES.map((t) => t.label));
    expect(cards[0]).toHaveAttribute('aria-label', 'Raw Material');
  });

  it('R2: every item type has a primary icon (map parity + on-card icon)', async () => {
    renderPage();
    await screen.findByTestId('item-type-card-all');
    // map covers exactly the canonical item types
    expect(Object.keys(ITEM_TYPE_ICONS)).toEqual(ITEM_TYPES.map((t) => t.value));
    for (const t of ITEM_TYPES) {
      const card = screen.getByTestId(`item-type-card-${t.value}`);
      expect(card.querySelector('[data-primary-icon="true"]')).not.toBeNull();
    }
    // no plain, icon-less item type card exists
    for (const card of screen.getAllByTestId(/^item-type-card-/)) {
      expect(card.querySelector('[data-primary-icon="true"]')).not.toBeNull();
    }
  });

  it('R3: every item type has a background watermark icon (map parity + on-card icon)', async () => {
    renderPage();
    await screen.findByTestId('item-type-card-all');
    expect(Object.keys(ITEM_TYPE_WATERMARK_ICONS)).toEqual(ITEM_TYPES.map((t) => t.value));
    for (const t of ITEM_TYPES) {
      const card = screen.getByTestId(`item-type-card-${t.value}`);
      const watermark = card.querySelector('[data-watermark="true"]');
      expect(watermark).not.toBeNull();
      expect(watermark!.getAttribute('aria-hidden')).toBe('true');
    }
  });

  it('R4: active state defaults to All Items and moves to the clicked item type (server refetch)', async () => {
    renderPage();
    const allCard = await screen.findByTestId('item-type-card-all');
    expect(allCard).toHaveAttribute('aria-selected', 'true');
    const rawCard = screen.getByTestId('item-type-card-RAW_MATERIAL');
    expect(rawCard).toHaveAttribute('aria-selected', 'false');
    fireEvent.click(rawCard);
    expect(rawCard).toHaveAttribute('aria-selected', 'true');
    expect(allCard).toHaveAttribute('aria-selected', 'false');
    await waitFor(() => {
      const call = [...apiMock.get.mock.calls]
        .reverse()
        .find(([url, p]) => url === '/master-data/items' && p && (p as any).page && (p as any).itemType === 'RAW_MATERIAL');
      expect(call).toBeDefined();
    });
  });

  it('R5: search box is rendered on the toolbar', async () => {
    renderPage();
    await screen.findByTestId('item-type-card-all');
    expect(screen.getByPlaceholderText('Search by code, name, SKU, barcode, wire size...')).toBeInTheDocument();
  });

  it('R6: exactly one Filters button exists (single filter system), toggles the filter panel', async () => {
    renderPage();
    await screen.findByTestId('item-type-card-all');
    expect(screen.getAllByRole('button', { name: /Filters/i })).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: /Filters/i }));
    expect(await screen.findByPlaceholderText('Division')).toBeInTheDocument();
  });

  it('R7: the active-filter count badge on Filters reflects a chosen filter value', async () => {
    renderPage();
    await screen.findByTestId('item-type-card-all');
    fireEvent.click(screen.getByRole('button', { name: /Filters/i }));
    const statusField = await screen.findByPlaceholderText('Status');
    fireEvent.mouseDown(statusField.closest('.ant-select') as HTMLElement);
    fireEvent.click(await screen.findByText('ACTIVE', { selector: '.ant-select-item-option-content' }));
    await waitFor(() => {
      const badges = Array.from(document.querySelectorAll('.ant-badge-count'));
      const labelled = badges.find((b) => b.textContent === '1');
      expect(labelled).toBeDefined();
    });
    await waitFor(() => {
      const call = [...apiMock.get.mock.calls]
        .reverse()
        .find(([url, p]) => url === '/master-data/items' && p && (p as any).status === 'ACTIVE' && (p as any).page);
      expect(call).toBeDefined();
    });
  });

  it('R8: Clear button appears when filtering/searching and resets filters', async () => {
    renderPage();
    await screen.findByTestId('item-type-card-all');
    expect(screen.queryByRole('button', { name: /Clear/i })).not.toBeInTheDocument();
    const search = screen.getByPlaceholderText('Search by code, name, SKU, barcode, wire size...');
    fireEvent.change(search, { target: { value: 'RAW' } });
    const clearBtn = await screen.findByRole('button', { name: /Clear/i }, { timeout: 3000 });
    fireEvent.click(clearBtn);
    expect(search).toHaveValue('');
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /Clear/i })).not.toBeInTheDocument();
    });
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
    expect(screen.getByRole('columnheader', { name: 'Division / Section' })).toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'Division' })).not.toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'Section' })).not.toBeInTheDocument();
    const rawRow = rowOf('RAW-1');
    expect(within(rawRow).getByText('Wire Division')).toBeInTheDocument();
    expect(within(rawRow).getByText('Wire Section')).toBeInTheDocument();
  });

  it('R10: Wire / Dia + Length are merged into a single stacked 2-line column (no standalone columns)', async () => {
    renderPage();
    await screen.findByText('RAW-1');
    expect(screen.getByRole('columnheader', { name: 'Wire / Dia · Length' })).toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'Wire / Dia' })).not.toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'Length' })).not.toBeInTheDocument();
    const rawRow = rowOf('RAW-1');
    expect(within(rawRow).getByText('1.20')).toBeInTheDocument();
    expect(within(rawRow).getByText('Length: 150.00')).toBeInTheDocument();
  });

  it('R11: the standalone Barcode table column is removed while the barcode row action is preserved', async () => {
    renderPage();
    await screen.findByText('RAW-1');
    expect(screen.queryByRole('columnheader', { name: 'Barcode' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Barcode for RAW-1' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Scan Barcode' })).toBeInTheDocument();
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
    await waitFor(() => {
      expect(within(screen.getByTestId('item-type-card-all')).getByText('3 items')).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(within(screen.getByTestId('item-type-card-RAW_MATERIAL')).getByText('1 items')).toBeInTheDocument();
    });
    expect(within(screen.getByTestId('item-type-card-SERVICE')).getByText('1 items')).toBeInTheDocument();
  });

  it('R15: typing performs server-side search (search param sent to the API)', async () => {
    renderPage();
    await screen.findByTestId('item-type-card-all');
    const search = screen.getByPlaceholderText('Search by code, name, SKU, barcode, wire size...');
    fireEvent.change(search, { target: { value: 'SVC-SKU' } });
    await waitFor(() => {
      expect(
        [...apiMock.get.mock.calls].reverse()
          .find(([url, p]) => url === '/master-data/items' && p && (p as any).search === 'SVC-SKU'),
      ).toBeDefined();
    }, { timeout: 3000 });
  });
});