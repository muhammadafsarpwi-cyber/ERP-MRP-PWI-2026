import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import { App } from 'antd';
import GoodsReceiptManagement from './GoodsReceiptManagement';
import apiService from '../../services/api';

jest.mock('../../services/api');

const apiMock = apiService as jest.Mocked<typeof apiService>;

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
});

const receipts = (items: any[]) => ({ data: items, total: items.length });

function mockFetch(receiptRows: any[]) {
  apiMock.get.mockImplementation(async (url: any) => {
    const u = String(url);
    if (u === '/procurement/receipts') return receipts(receiptRows) as any;
    return { data: [] };
  });
}

function renderPage() {
  return render(
    <App>
      <MemoryRouter>
        <GoodsReceiptManagement />
      </MemoryRouter>
    </App>
  );
}

describe('GoodsReceiptManagement — post action', () => {
  beforeEach(() => {
    apiMock.get.mockReset();
    apiMock.patch.mockReset();
  });

  it('does NOT render a Post button for a non-ACCEPTED (e.g. DRAFT) receipt', async () => {
    mockFetch([{ id: 'r-1', receiptCode: 'GRN-001', status: 'DRAFT' }]);
    renderPage();
    await screen.findByText('GRN-001');
    expect(screen.queryByRole('button', { name: /post/i })).not.toBeInTheDocument();
  });

  it('does NOT render a Post button for an already-POSTED receipt (cannot re-post)', async () => {
    mockFetch([{ id: 'r-1', receiptCode: 'GRN-001', status: 'POSTED' }]);
    renderPage();
    await screen.findByText('GRN-001');
    // The "Stock posted" badge confirms the posted state is reflected.
    expect(screen.getByText('Stock posted')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /post/i })).not.toBeInTheDocument();
    expect(apiMock.patch).not.toHaveBeenCalled();
  });

  it('renders EXACTLY ONE Post button for an ACCEPTED receipt', async () => {
    mockFetch([{ id: 'r-1', receiptCode: 'GRN-001', status: 'ACCEPTED' }]);
    renderPage();
    await screen.findByText('GRN-001');
    const postButtons = screen.getAllByRole('button', { name: /post/i });
    expect(postButtons).toHaveLength(1);
  });

  it('post action calls the existing PATCH API /procurement/receipts/:id/post', async () => {
    apiMock.patch.mockResolvedValue({ data: { id: 'r-1', status: 'POSTED' } } as any);
    mockFetch([{ id: 'r-1', receiptCode: 'GRN-001', status: 'ACCEPTED' }]);

    renderPage();
    await screen.findByText('GRN-001');
    await userEvent.click(screen.getByRole('button', { name: /post/i }));

    await waitFor(() =>
      expect(apiMock.patch).toHaveBeenCalledWith('/procurement/receipts/r-1/post'),
    );
  });

  it('successful posting updates the UI to show the posted state', async () => {
    const firstFetch = receipts([{ id: 'r-1', receiptCode: 'GRN-001', status: 'ACCEPTED' }] as any);
    const afterPost = receipts([{ id: 'r-1', receiptCode: 'GRN-001', status: 'POSTED' }] as any);
    apiMock.get.mockImplementation(async (url: any) => {
      const u = String(url);
      if (u === '/procurement/receipts') {
        return apiMock.patch.mock.calls.length > 0 ? afterPost : firstFetch;
      }
      return { data: [] };
    });
    apiMock.patch.mockResolvedValue({ data: { id: 'r-1', status: 'POSTED' } } as any);

    renderPage();
    await screen.findByText('GRN-001');
    await userEvent.click(screen.getByRole('button', { name: /post/i }));

    // "Stock posted" badge reflects the posted status returned by the re-fetch.
    await screen.findByText('Stock posted');
    expect(screen.getAllByText(/post/i).filter((n) => n.textContent === 'Post')).toHaveLength(0);
  });

  it('posting failure displays an error and does not mark the receipt posted', async () => {
    apiMock.patch.mockRejectedValue(new Error('post failed'));
    mockFetch([{ id: 'r-1', receiptCode: 'GRN-001', status: 'ACCEPTED' }]);

    renderPage();
    await screen.findByText('GRN-001');
    await userEvent.click(screen.getByRole('button', { name: /post/i }));

    await waitFor(() => expect(apiMock.patch).toHaveBeenCalledWith('/procurement/receipts/r-1/post'));
    // Status still ACCEPTED — not marked posted.
    expect(screen.queryByText('Stock posted')).not.toBeInTheDocument();
  });
});
