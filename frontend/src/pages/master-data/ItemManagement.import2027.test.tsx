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
    division: null, section: null, department: null,
    diameterMm: 1.2, wireSizeMm: null, lengthPerPiece: 150,
    baseUomName: 'KG', sku: '', isStockItem: false, isManufacturable: false,
  },
];

function mockApi() {
  apiMock.get.mockImplementation(async (url: string) => {
    if (url === '/auth/me') {
      return {
        data: {
          id: 'u1', email: 'e@x.com', displayName: 'User', defaultCompanyId: 'co-1',
          permissions: ['item.view', 'item.create', 'item.update', 'item.delete',
            'item.activate', 'item.deactivate', 'item_barcode.view'],
        },
      };
    }
    if (url === '/master-data/items') {
      return { data: ROWS, total: ROWS.length };
    }
    if (url === '/master-data/uom' || url === '/master-data/uoms') {
      return { data: [{ id: 'uom-kg', code: 'KG', name: 'Kilogram' }], total: 1 };
    }
    if (url === '/master-data/item-types') {
      return { data: [{ id: 'type-raw', code: 'RAW_MATERIAL', name: 'Raw Material' }], total: 1 };
    }
    if (url === '/companies') {
      return { data: [{ id: 'co-1' }], total: 1 };
    }
    return { data: [], total: 0 };
  });
  apiMock.post.mockResolvedValue({ data: { success: true } });
}

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

describe('2027 Model UX — Import Items Modernization & Error Triage', () => {
  it('1: PageHeader displays the Enterprise 2027 badge and crystal KPI cards', async () => {
    renderPage();
    await screen.findByText('RAW-1');
    expect(screen.getByText('Enterprise 2027')).toBeInTheDocument();

    const totalCard = screen.getByTestId('kpi-total');
    expect(totalCard).toHaveClass('item-crystal-kpi-card');
  });

  it('2: Table columns render with accessible icons and correct column headers', async () => {
    renderPage();
    await screen.findByText('RAW-1');

    expect(screen.getByRole('columnheader', { name: 'tag Item Code' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'appstore Item Name' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'tool Wire / Dia Length' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'apartment Division / Section' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'check-circle Item Status' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Row Actions' })).toBeInTheDocument();
  });

  it('3: Opening Import modal displays modern title, 2027 UX badge, and minimize button', async () => {
    renderPage();
    await screen.findByText('RAW-1');

    const importBtn = screen.getByRole('button', { name: /import/i });
    fireEvent.click(importBtn);

    expect(await screen.findByText('Import Items Master')).toBeInTheDocument();
    expect(screen.getByText('2027 UX')).toBeInTheDocument();
    expect(screen.getByTitle('Minimize to dock (keeps file open in background)')).toBeInTheDocument();
  });

  it('4: Minimizing Import modal collapses into floating bottom dock and restores on click', async () => {
    renderPage();
    await screen.findByText('RAW-1');

    fireEvent.click(screen.getByRole('button', { name: /import/i }));
    await screen.findByText('Import Items Master');

    const minBtn = screen.getByTitle('Minimize to dock (keeps file open in background)');
    fireEvent.click(minBtn);

    // Modal is hidden and dock appears
    await waitFor(() => {
      expect(screen.getByTitle('Click to restore Import Items modal')).toBeInTheDocument();
    });

    // Clicking the dock restores the modal
    const dock = screen.getByTitle('Click to restore Import Items modal');
    fireEvent.click(dock);

    await waitFor(() => {
      expect(screen.getByText('Import Items Master')).toBeInTheDocument();
    });
  });

  it('5: Real-time progress bar, percentage, speed, and time remaining render during import', async () => {
    let resolvePost: () => void;
    apiMock.post.mockImplementation(() => new Promise((res) => {
      resolvePost = () => res({ data: { success: true } });
    }));
    renderPage();
    await screen.findByText('RAW-1');

    fireEvent.click(screen.getByRole('button', { name: /import/i }));
    await screen.findByText('Import Items Master');

    const csvContent = 'itemCode,name,itemType,uomCode\nNEW-001,Test Item 1,RAW_MATERIAL,KG';
    const file = new File([csvContent], 'test-items.csv', { type: 'text/csv' });
    file.text = jest.fn().mockResolvedValue(csvContent);

    const uploadInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    expect(uploadInput).toBeTruthy();
    fireEvent.change(uploadInput, { target: { files: [file] } });

    const importActionBtn = await screen.findByRole('button', { name: /import 1 valid row/i });
    fireEvent.click(importActionBtn);

    // During import, the progress card should appear
    expect(await screen.findByText(/Uploading & Importing Items Master…/i)).toBeInTheDocument();
    expect(screen.getByText(/Estimated Time/i)).toBeInTheDocument();
    expect(screen.getByText(/Import Speed/i)).toBeInTheDocument();

    // Resolve API post so import completes
    resolvePost!();

    await waitFor(() => {
      expect(screen.getByText('Import finished')).toBeInTheDocument();
    });
  });
});

