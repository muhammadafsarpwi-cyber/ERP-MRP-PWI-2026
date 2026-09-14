import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
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
    id: 'i-raw',
    itemCode: 'RAW-1',
    name: 'B4 Wire 1.20',
    shortName: 'B4',
    itemType: 'RAW_MATERIAL',
    status: 'ACTIVE',
    barcode: 'BC-RAW-1',
    division: { id: 'd1', divisionCode: 'DIV', name: 'Wire Division' },
    section: { id: 's1', sectionCode: 'SEC', name: 'Wire Section' },
    department: { id: 'dp1', departmentCode: 'DP', name: 'Store' },
    diameterMm: 1.2,
    wireSizeMm: null,
    lengthPerPiece: 150,
    baseUomName: 'KG',
    sku: 'SKU-001',
    costPrice: 120,
    sellingPrice: 150,
  },
];

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
  (global as any).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

beforeEach(() => {
  jest.clearAllMocks();
  localStorage.setItem(
    'erp_user',
    JSON.stringify({
      id: 'u1',
      email: 'admin@pwi.com',
      displayName: 'Admin User',
      defaultCompanyId: 'co-1',
      permissions: ['item.view', 'item.create', 'item.update', 'item.delete', 'item.import'],
    }),
  );

  apiMock.get.mockImplementation(async (url: string) => {
    if (url === '/master-data/items') {
      return { data: ROWS, total: ROWS.length };
    }
    if (url.startsWith('/master-data/items/i-raw/conversions')) {
      return { data: { supportedConversions: [] } };
    }
    if (url.startsWith('/master-data/items/')) {
      return { data: ROWS[0] };
    }
    if (url === '/companies') return { data: [{ id: 'co-1' }], total: 1 };
    if (url === '/master-data/uom') return { data: [{ id: 'u1', code: 'KG', name: 'Kilogram' }], total: 1 };
    if (url === '/master-data/categories') return { data: [], total: 0 };
    if (url === '/divisions') return { data: [{ id: 'd1', code: 'DIV', name: 'Wire Division' }], total: 1 };
    if (url === '/sections') return { data: [{ id: 's1', code: 'SEC', name: 'Wire Section', divisionId: 'd1' }], total: 1 };
    if (url === '/departments') return { data: [{ id: 'dp1', code: 'DP', name: 'Store', divisionId: 'd1', sectionId: 's1' }], total: 1 };
    if (url === '/master-data/route-types') return { data: [], total: 0 };
    if (url === '/master-data/item-types') return { data: [], total: 0 };
    if (url.startsWith('/barcode-management')) return { success: true, data: [], total: 0 };
    return { data: [], total: 0 };
  });
});

function renderPage() {
  return render(
    <App>
      <MemoryRouter initialEntries={['/master-data/items']}>
        <ItemManagement />
      </MemoryRouter>
    </App>,
  );
}

describe('ItemManagement UX Enhancement (Split-View & Minimize)', () => {
  it('renders Add Item modal with Split-View and Live Item Detail Sheet', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('RAW-1')).toBeInTheDocument());

    const addBtn = screen.getByRole('button', { name: /add item/i });
    fireEvent.click(addBtn);

    await waitFor(() => {
      expect(screen.getByTestId('item-live-detail-sheet')).toBeInTheDocument();
    });

    expect(screen.getByText('Live Preview')).toBeInTheDocument();
    expect(screen.getByText('Organization & Classification')).toBeInTheDocument();
    expect(screen.getByText('Technical Specifications')).toBeInTheDocument();
  });

  it('minimizes Add Item Form modal to bottom dock and restores on tab click', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('RAW-1')).toBeInTheDocument());

    const addBtn = screen.getByRole('button', { name: /add item/i });
    fireEvent.click(addBtn);

    await waitFor(() => {
      expect(screen.getByTestId('item-live-detail-sheet')).toBeInTheDocument();
    });

    // Click minimize (-) button
    const minBtn = screen.getByRole('button', { name: /minimize modal/i });
    fireEvent.click(minBtn);

    // Modal should be hidden
    await waitFor(() => {
      expect(screen.queryByTestId('item-live-detail-sheet')).not.toBeInTheDocument();
    });

    // Floating dock should display minimized tab
    const dock = screen.getByTestId('item-minimized-dock');
    expect(dock).toBeInTheDocument();
    expect(dock).toHaveTextContent('New Item Form');

    // Click docked tab to restore
    const restoreTab = screen.getByTitle('Click to restore Item Form');
    fireEvent.click(restoreTab);

    // Modal is restored
    await waitFor(() => {
      expect(screen.getByTestId('item-live-detail-sheet')).toBeInTheDocument();
    });
  });

  it('minimizes Item Details modal to bottom dock and restores on tab click', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('RAW-1')).toBeInTheDocument());

    // Click item code link to open details
    const itemLink = screen.getByRole('button', { name: 'RAW-1' });
    fireEvent.click(itemLink);

    await waitFor(() => {
      expect(screen.getByText('B4 Wire 1.20')).toBeInTheDocument();
    });

    // Find minimize button in header
    const minBtn = screen.getByRole('button', { name: /minimize modal/i });
    fireEvent.click(minBtn);

    // Dock tab should appear
    await waitFor(() => {
      const dock = screen.getByTestId('item-minimized-dock');
      expect(dock).toBeInTheDocument();
      expect(dock).toHaveTextContent('RAW-1');
    });

    // Click to restore
    const restoreTab = screen.getByTitle('Click to restore Item Details');
    fireEvent.click(restoreTab);

    await waitFor(() => {
      expect(screen.getByText('B4 Wire 1.20')).toBeInTheDocument();
    });
  });
});
