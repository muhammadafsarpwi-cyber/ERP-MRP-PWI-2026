import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { App } from 'antd';
import { MemoryRouter } from 'react-router-dom';
import ItemManagement from './ItemManagement';
import apiService from '../../services/api';

jest.mock('../../services/api');

jest.setTimeout(60000);

const apiMock = apiService as jest.Mocked<typeof apiService>;

const ROWS: any[] = [
  {
    id: 'i-raw', itemCode: 'RAW-1', name: 'B4 Wire 1.20', shortName: 'B4',
    itemType: 'RAW_MATERIAL', status: 'ACTIVE', barcode: 'BC-RAW-1',
    division: { id: 'd1', divisionCode: 'DIV', name: 'Wire Division' },
    section: { id: 's1', sectionCode: 'SEC', name: 'Wire Section' },
    department: null, diameterMm: 1.2, wireSizeMm: null, lengthPerPiece: 150,
    baseUomName: 'KG', sku: '', isStockItem: false, isManufacturable: false,
  },
  {
    id: 'i-fin', itemCode: 'FIN-1', name: 'Finished Spoke', shortName: null,
    itemType: 'FINISHED_GOOD', status: 'INACTIVE', barcode: null,
    division: null, section: null, department: null,
    diameterMm: null, wireSizeMm: null, lengthPerPiece: null,
    baseUomName: 'PCS', sku: null, isStockItem: true, isManufacturable: true,
  },
  {
    id: 'i-svc', itemCode: 'SVC-1', name: 'Tooling Service', shortName: null,
    itemType: 'SERVICE', status: 'ACTIVE', barcode: 'BC-SVC-1',
    division: null, section: null, department: null,
    diameterMm: null, wireSizeMm: null, lengthPerPiece: null,
    baseUomName: null, sku: 'SVC-SKU', isStockItem: false, isManufacturable: false,
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
        return true;
      });
      return { data: rows, total: rows.length };
    }
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

describe('TASK 13A — KPI + filter toolbar UI correction', () => {
  it('1: Filters comes before Search in the toolbar DOM order', async () => {
    renderPage();
    await screen.findByTestId('item-type-card-all');
    const filtersBtn = screen.getByRole('button', { name: /Filters/i });
    const search = screen.getByPlaceholderText('Search by code, name, SKU, barcode, wire size...');
    const filtersBadge = filtersBtn.closest('.ant-badge');
    const searchWrap = search.closest('.ant-input-affix-wrapper');
    expect(filtersBadge).not.toBeNull();
    expect(searchWrap).not.toBeNull();
    expect(
      filtersBadge!.compareDocumentPosition(searchWrap!) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('2: Search appears immediately after Filters (no toolbar element between them)', async () => {
    renderPage();
    await screen.findByTestId('item-type-card-all');
    const filtersBtn = screen.getByRole('button', { name: /Filters/i });
    const search = screen.getByPlaceholderText('Search by code, name, SKU, barcode, wire size...');
    const filtersBadge = filtersBtn.closest('.ant-badge') as HTMLElement;
    const searchWrap = search.closest('.ant-input-affix-wrapper') as HTMLElement;
    expect(filtersBadge.nextElementSibling).toBe(searchWrap);
  });

  it('3: the Filters button appears exactly once', async () => {
    renderPage();
    await screen.findByTestId('item-type-card-all');
    expect(screen.getAllByRole('button', { name: /Filters/i })).toHaveLength(1);
  });

  it('4: the Search input appears exactly once', async () => {
    renderPage();
    await screen.findByTestId('item-type-card-all');
    expect(
      screen.getAllByPlaceholderText('Search by code, name, SKU, barcode, wire size...'),
    ).toHaveLength(1);
  });

  it('5: Clear remains available after Filters + Search when filtering/searching', async () => {
    renderPage();
    await screen.findByTestId('item-type-card-all');
    const search = screen.getByPlaceholderText('Search by code, name, SKU, barcode, wire size...');
    expect(screen.queryByRole('button', { name: /Clear/i })).not.toBeInTheDocument();
    fireEvent.change(search, { target: { value: 'RAW' } });
    expect(await screen.findByRole('button', { name: /Clear/i }, { timeout: 3000 })).toBeInTheDocument();
  });

  it('6: all five KPI cards render (Total, Active, Inactive, Stock, Manufactured)', async () => {
    renderPage();
    await screen.findByTestId('item-type-card-all');
    expect(screen.getByTestId('kpi-total')).toBeInTheDocument();
    expect(screen.getByTestId('kpi-active')).toBeInTheDocument();
    expect(screen.getByTestId('kpi-inactive')).toBeInTheDocument();
    expect(screen.getByTestId('kpi-stock')).toBeInTheDocument();
    expect(screen.getByTestId('kpi-manufactured')).toBeInTheDocument();
  });

  it('7: every KPI card has a foreground/main icon', async () => {
    renderPage();
    await screen.findByTestId('item-type-card-all');
    for (const id of ['kpi-total', 'kpi-active', 'kpi-inactive', 'kpi-stock', 'kpi-manufactured']) {
      const card = screen.getByTestId(id);
      const icon = card.querySelector('[data-kpi-icon="true"]');
      expect(icon).not.toBeNull();
      expect(icon!.getAttribute('aria-hidden')).toBe('true');
    }
  });

  it('8: every KPI card has a background/watermark icon', async () => {
    renderPage();
    await screen.findByTestId('item-type-card-all');
    for (const id of ['kpi-total', 'kpi-active', 'kpi-inactive', 'kpi-stock', 'kpi-manufactured']) {
      const card = screen.getByTestId(id);
      const watermark = card.querySelector('[data-kpi-watermark="true"]');
      expect(watermark).not.toBeNull();
      expect(watermark!.getAttribute('aria-hidden')).toBe('true');
    }
  });

  it('9: KPI values stay dynamic and derive from the real data (no hardcoded counts)', async () => {
    renderPage();
    await screen.findByTestId('item-type-card-all');
    await waitFor(() => {
      const v = screen.getByTestId('kpi-total').querySelector('[data-kpi-value="true"]');
      expect(v).not.toBeNull();
      expect(v!.textContent).toBe('3');
    });
    await waitFor(() => {
      const v = screen.getByTestId('kpi-active').querySelector('[data-kpi-value="true"]');
      expect(v!.textContent).toBe('2');
    });
    const inactive = screen.getByTestId('kpi-inactive').querySelector('[data-kpi-value="true"]');
    expect(inactive!.textContent).toBe('1');
    const stock = screen.getByTestId('kpi-stock').querySelector('[data-kpi-value="true"]');
    expect(stock!.textContent).toBe('1');
  });

  it('10: KPI labels are correct', async () => {
    renderPage();
    await screen.findByTestId('item-type-card-all');
    expect(within(screen.getByTestId('kpi-total')).getByText('Total Items')).toBeInTheDocument();
    expect(within(screen.getByTestId('kpi-active')).getByText('Active')).toBeInTheDocument();
    expect(within(screen.getByTestId('kpi-inactive')).getByText('Inactive')).toBeInTheDocument();
    expect(within(screen.getByTestId('kpi-stock')).getByText('Stock Items')).toBeInTheDocument();
    expect(within(screen.getByTestId('kpi-manufactured')).getByText('Manufactured')).toBeInTheDocument();
  });
});