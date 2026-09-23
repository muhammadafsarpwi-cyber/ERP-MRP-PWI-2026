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
  // Desktop viewport: min-width queries match (antd Grid screens.lg/md = true),
  // max-width (xs) queries don't. The split-view live detail sheet only renders
  // on screens.lg.
  window.matchMedia = (query: string) =>
    ({
      matches: !/max-width/i.test(query),
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
  // Fresh permission timestamp so `usePermission` trusts the stored grants
  // instead of refetching /auth/me (which would wipe them in this mock).
  localStorage.setItem('erp_permissions_ts', String(Date.now()));

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

// PageHeader pushes its `extra` (Add Item / Scan / Export) into the header-actions
// store; the real layout renders it through a host component. Mirror that here so
// the Add Item button exists in this suite's tree.
import { useHeaderActions } from '../../components/layout/headerActionsStore';

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

function renderPage() {
  return render(
    <App>
      <MemoryRouter initialEntries={['/master-data/items']}>
        <HeaderActionsHost />
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

    // Split-view live sheet is opt-in via the header toggle (desktop only).
    const previewToggle = await screen.findByRole('button', { name: /live preview/i });
    fireEvent.click(previewToggle);

    await waitFor(() => {
      expect(screen.getByTestId('item-live-detail-sheet')).toBeInTheDocument();
    });

    expect(screen.getByText('Live Form Preview')).toBeInTheDocument();
    expect(screen.getByText('Organization & Classification')).toBeInTheDocument();
    expect(screen.getByText('Technical Specifications')).toBeInTheDocument();
  });

  it('minimizes Add Item Form modal to bottom dock and restores on tab click', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('RAW-1')).toBeInTheDocument());

    const addBtn = screen.getByRole('button', { name: /add item/i });
    fireEvent.click(addBtn);

    // Enable split-view so the live sheet is present before minimizing.
    const previewToggle = await screen.findByRole('button', { name: /live preview/i });
    fireEvent.click(previewToggle);

    await waitFor(() => {
      expect(screen.getByTestId('item-live-detail-sheet')).toBeInTheDocument();
    });

    // Click minimize (-) button (shared modal header control)
    const minBtn = await screen.findByTestId('modal-minimize-btn');
    fireEvent.click(minBtn);

    // Modal closes (antd keeps children mounted in jsdom, but the wrap is
    // hidden) while the minimized tab appears in the bottom dock.
    const sheet = document.querySelector('[data-testid="item-live-detail-sheet"]');
    if (sheet) {
      const wrap = sheet.closest('.ant-modal-wrap') as HTMLElement | null;
      expect(wrap).not.toBeNull();
      expect(wrap!.style.display).toBe('none');
    }

    // Floating dock should display minimized tab
    const dock = screen.getByTestId('item-minimized-dock');
    expect(dock).toBeInTheDocument();
    expect(dock).toHaveTextContent('New Item Form');

    // Click docked tab to restore
    const restoreTab = screen.getByTitle('Click to restore Item Form');
    fireEvent.click(restoreTab);

    // Modal is restored (visible again)
    await waitFor(() => {
      const restored = document.querySelector('[data-testid="item-live-detail-sheet"]');
      expect(restored).toBeInTheDocument();
      const wrap = restored?.closest('.ant-modal-wrap') as HTMLElement | null;
      expect(wrap?.style.display).not.toBe('none');
    });
  });

  it('minimizes Item Details modal to bottom dock and restores on tab click', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('RAW-1')).toBeInTheDocument());

    // Click the item code button to open details
    const itemLink = screen.getByRole('button', { name: 'View item RAW-1' });
    fireEvent.click(itemLink);

    await waitFor(() => {
      // the detail sheet shows the item name in addition to the table row
      expect(screen.getAllByText('B4 Wire 1.20').length).toBeGreaterThan(1);
    });

    // Find minimize button in shared modal header
    const minBtn = await screen.findByTestId('modal-minimize-btn');
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
      expect(screen.getAllByText('B4 Wire 1.20').length).toBeGreaterThan(1);
    });
  });
});
