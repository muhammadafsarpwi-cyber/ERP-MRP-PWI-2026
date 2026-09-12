import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import { App as AntApp } from 'antd';
import RoutingManagement from './RoutingManagement';
import apiService, { describeRequestError } from '../../services/api';
import * as apiMod from '../../services/api';

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

function getCalls(): string[] {
  return (apiMock.get as jest.Mock).mock.calls.map((c: any[]) => String(c[0]));
}

describe('RoutingManagement lookups', () => {
  beforeEach(() => {
    apiMock.get.mockReset();
    apiMock.get.mockImplementation((url: any) => {
      const u = String(url);
      if (u === '/production/routings') return Promise.resolve({ data: [], total: 0 });
      if (u === '/bom') return Promise.resolve({ data: [] });
      return Promise.resolve({ data: [] });
    });
  });

  it('loads routings and hits the real lookup endpoints (not /items, /uoms, /admin/*)', async () => {
    render(
      <MemoryRouter>
        <RoutingManagement />
      </MemoryRouter>
    );

    await new Promise((r) => setTimeout(r, 50));

    const calls = getCalls();
    expect(calls).toContain('/production/routings');
    // Broken lookups must never be called.
    expect(calls).not.toContain('/items');
    expect(calls).not.toContain('/uoms');
    expect(calls).not.toContain('/admin/divisions');
    expect(calls).not.toContain('/admin/sections');
    expect(calls).not.toContain('/admin/departments');
    // Real endpoints are used.
    expect(calls.some((u) => u.startsWith('/master-data/items'))).toBe(true);
    expect(calls.some((u) => u.startsWith('/master-data/uom'))).toBe(true);
    expect(calls).toContain('/divisions');
    expect(calls).toContain('/sections');
    expect(calls).toContain('/departments');
  });
});

describe('RoutingManagement save flow', () => {
  beforeEach(() => {
    apiMock.get.mockReset();
    apiMock.post.mockReset();
    apiMock.put.mockReset();
    apiMock.get.mockImplementation((url: any) => {
      const u = String(url);
      if (u === '/production/routings') return Promise.resolve({ data: [], total: 0 });
      if (u === '/master-data/items') return Promise.resolve({ data: [{ id: 'i1', name: 'Finished Goods', itemCode: 'FG-100', itemType: 'FG' }] });
      if (u === '/bom') return Promise.resolve({ data: [{ id: 'b1', bomCode: 'BOM-100', name: 'FG BOM' }] });
      return Promise.resolve({ data: [] });
    });
    (apiMod.describeRequestError as jest.Mock).mockImplementation((err: any) => {
      const data = err?.response?.data?.message;
      const msg = Array.isArray(data) ? data.join('; ') : String(data);
      return `Server returned HTTP ${err?.response?.status}: ${msg}`;
    });
  });

  function fillRoutingForm(name: string) {
    fireEvent.change(screen.getByLabelText('Routing Name'), { target: { value: name } });
    fireEvent.mouseDown(screen.getByLabelText('Product'));
    fireEvent.click(screen.getAllByText('FG-100 - Finished Goods')[0]);
    fireEvent.mouseDown(screen.getByLabelText('BOM'));
    fireEvent.click(screen.getAllByText('BOM-100 - FG BOM')[0]);
  }

  it('routing create uses footer [Cancel][Save] (no OK) and the success dialog shows the actual backend Routing Code', async () => {
    apiMock.post.mockResolvedValue({ data: { id: 'r9', routingCode: 'RTG-NEW-001', name: 'New Routing' } });
    render(
      <AntApp>
        <MemoryRouter>
          <RoutingManagement />
        </MemoryRouter>
      </AntApp>
    );

    fireEvent.click(await screen.findByRole('button', { name: /New Routing/i }, { timeout: 30000 }));
    fillRoutingForm('New Routing');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(apiMock.post).toHaveBeenCalledWith(
        '/production/routings',
        expect.objectContaining({ name: 'New Routing', productId: 'i1', bomId: 'b1' })
      );
    }, { timeout: 30000 });

    await waitFor(() => expect(screen.getByTestId('save-result-success')).toBeInTheDocument(), { timeout: 30000 });
    expect(screen.getByText('Successful')).toBeInTheDocument();
    expect(screen.getByText('Routing Saved Successfully')).toBeInTheDocument();
    expect(screen.getByText('RTG-NEW-001')).toBeInTheDocument();
    // Toast-free success: the generated business code, not a client-side ID.
    expect(screen.queryByRole('button', { name: 'OK' })).not.toBeInTheDocument();
  });

  it('routing create failure keeps the form open with values, shows the normalized error in a persistent dialog, and never shows success', async () => {
    apiMock.post.mockRejectedValue({ response: { status: 400, data: { message: ['name must be unique'] } } });
    render(
      <AntApp>
        <MemoryRouter>
          <RoutingManagement />
        </MemoryRouter>
      </AntApp>
    );

    fireEvent.click(await screen.findByRole('button', { name: /New Routing/i }, { timeout: 30000 }));
    fillRoutingForm('New Routing');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText(/Server returned HTTP 400: name must be unique/, undefined, { timeout: 30000 })).toBeInTheDocument();
    expect(await screen.findByTestId('save-result-error', undefined, { timeout: 30000 })).toBeInTheDocument();
    expect(screen.queryByTestId('save-result-success')).not.toBeInTheDocument();
    expect(screen.queryByText('Successful')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Routing Name')).toBeInTheDocument();
    expect((screen.getByLabelText('Routing Name') as HTMLInputElement).value).toBe('New Routing');
  });

  it('routing create error dialog Retry re-submits and swaps to success; Close dismisses while the form keeps its values', async () => {
    apiMock.post
      .mockRejectedValueOnce({ response: { status: 400, data: { message: ['name must be unique'] } } })
      .mockResolvedValueOnce({ data: { id: 'r9', routingCode: 'RTG-NEW-001', name: 'New Routing' } });
    render(
      <AntApp>
        <MemoryRouter>
          <RoutingManagement />
        </MemoryRouter>
      </AntApp>
    );

    fireEvent.click(await screen.findByRole('button', { name: /New Routing/i }, { timeout: 30000 }));
    fillRoutingForm('New Routing');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    const dialog = await screen.findByTestId('save-result-error', undefined, { timeout: 30000 });
    expect(within(dialog).getByText(/Server returned HTTP 400: name must be unique/)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Retry' }));

    await waitFor(() => expect(apiMock.post).toHaveBeenCalledTimes(2), { timeout: 30000 });
    await waitFor(() => expect(screen.getByTestId('save-result-success')).toBeInTheDocument(), { timeout: 30000 });
    expect(screen.getByText('RTG-NEW-001')).toBeInTheDocument();
    expect(screen.queryByTestId('save-result-error')).not.toBeInTheDocument();
  });
});
