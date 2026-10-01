import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { App } from 'antd';
import { MemoryRouter } from 'react-router-dom';
import ItemManagement from './ItemManagement';
import apiService from '../../services/api';
import { tabSessionCache } from '../../services/tabSessionCache';

jest.mock('../../services/api');
jest.setTimeout(60000);

const apiMock = apiService as jest.Mocked<typeof apiService>;

const DEMO_ROW: any = {
  id: 'd1', itemCode: 'DEMO-1', name: 'Dummy PVC Item', shortName: null,
  itemType: 'RAW_MATERIAL', status: 'ACTIVE', barcode: null,
  division: null, section: null, department: null,
  diameterMm: null, wireSizeMm: null, lengthPerPiece: null,
  baseUomName: 'KG', sku: null, isStockItem: false, isManufacturable: false,
};

const CLEAN_ELIGIBILITY = {
  totalDependents: 0,
  totalProtected: 0,
  reason: 'No references found. Safe to delete.',
  companyName: 'PakWiz Industries',
};

const DIRTY_ELIGIBILITY = {
  totalDependents: 2,
  totalProtected: 3,
  reason: 'Hard delete blocked because this record has protected transactional history: 3 stock ledger entrys. Deactivate or discontinue it instead.',
  companyName: 'PakWiz Industries',
};

let liveRows: any[];
let eligibility: any;

function mockApi() {
  (apiMock.get as jest.Mock).mockImplementation(async (url: string) => {
    if (url === '/master-data/items') return { data: liveRows, total: liveRows.length };
    if (url.includes('/delete-eligibility')) return { data: eligibility };
    return { data: [], total: 0 };
  });
  (apiMock.delete as jest.Mock).mockResolvedValue({});
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

function setPermissions(perms: string[]) {
  localStorage.setItem('erp_user', JSON.stringify({
    id: 'u1', email: 'e@x.com', displayName: 'User', defaultCompanyId: 'co-1',
    permissions: perms,
  }));
  localStorage.setItem('erp_permissions_ts', String(Date.now()));
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
  liveRows = [{ ...DEMO_ROW }];
  eligibility = { ...CLEAN_ELIGIBILITY };
  window.sessionStorage.clear();
  tabSessionCache.clear();
  setPermissions(['item.view', 'item.delete', 'item.deactivate']);
  mockApi();
});

async function openDeleteModal() {
  renderPage();
  await screen.findByText('DEMO-1');
  fireEvent.click(screen.getByRole('button', { name: 'More actions for DEMO-1' }));
  fireEvent.click(await screen.findByText('Delete Item'));
}

describe('DUMMY CLEANUP — item delete confirmation with eligibility', () => {
  it('1: delete modal shows dependency counts before confirming', async () => {
    eligibility = { ...DIRTY_ELIGIBILITY };
    await openDeleteModal();
    expect(await screen.findByText(/Dependencies: 2 eligible/)).toBeInTheDocument();
    expect(screen.getByText(/Protected Transactions: 3/)).toBeInTheDocument();
    expect(screen.getByText(/Hard delete blocked because this record has protected transactional history/)).toBeInTheDocument();
  });

  it('2: Cancel prevents deletion', async () => {
    await openDeleteModal();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => {
      expect(screen.queryByText(/Dependencies: 0 eligible/)).not.toBeInTheDocument();
    });
    expect(apiMock.delete).not.toHaveBeenCalled();
    expect(screen.getByText('DEMO-1')).toBeInTheDocument();
  });

  it('3: eligible record deletes without force and disappears after refresh', async () => {
    await openDeleteModal();
    expect(await screen.findByText(/Dependencies: 0 eligible/)).toBeInTheDocument();
    liveRows = [];
    const title = await screen.findByText("Delete Item 'DEMO-1'?");
    const modal = title.closest('.ant-modal') as HTMLElement;
    // NOTE: the button's accessible name includes its icon label
    // ("delete Confirm Delete"), so match by substring.
    const confirmBtn = await waitFor(() => within(modal).getByRole('button', { name: /Confirm Delete/ }));
    fireEvent.click(confirmBtn);
    await waitFor(() => {
      expect(apiMock.delete).toHaveBeenCalledWith('/master-data/items/d1');
    });
    expect((apiMock.delete as jest.Mock).mock.calls[0][0]).not.toContain('force');
    await waitFor(() => {
      expect(screen.queryByText('DEMO-1')).not.toBeInTheDocument();
    });
  });

  it('4: protected record shows protected counts in the modal', async () => {
    eligibility = { ...DIRTY_ELIGIBILITY };
    await openDeleteModal();
    expect(await screen.findByText(/Protected Transactions: 3/)).toBeInTheDocument();
    expect(screen.queryByText('Confirm Delete')).toBeInTheDocument();
  });

  it('5: unauthorized user gets no Delete Item action', async () => {
    setPermissions(['item.view']);
    renderPage();
    await screen.findByText('DEMO-1');
    fireEvent.click(screen.getByRole('button', { name: 'More actions for DEMO-1' }));
    await waitFor(() => {
      expect(screen.queryByText('Delete Item')).not.toBeInTheDocument();
    });
  });
});
