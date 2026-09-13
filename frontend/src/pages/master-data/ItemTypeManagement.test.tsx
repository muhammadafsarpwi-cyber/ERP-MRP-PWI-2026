import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import { App as AntApp } from 'antd';
import ItemTypeManagement from './ItemTypeManagement';
import apiService from '../../services/api';
import * as apiMod from '../../services/api';

jest.mock('../../services/api');

const apiMock = apiService as jest.Mocked<typeof apiService>;

jest.setTimeout(120000);

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

describe('ItemTypeManagement save flow', () => {
  beforeEach(() => {
    localStorage.clear();
    apiMock.get.mockReset();
    apiMock.post.mockReset();
    apiMock.patch.mockReset();
    apiMock.get.mockImplementation((url: any) => {
      const u = String(url);
      if (u === '/companies') return Promise.resolve({ data: [{ id: 'c1' }] });
      if (u === '/master-data/item-types') return Promise.resolve({ data: [], total: 0 });
      return Promise.resolve({ data: [] });
    });
    (apiMod.describeRequestError as jest.Mock).mockImplementation((err: any) => {
      const data = err?.response?.data?.message;
      const msg = Array.isArray(data) ? data.join('; ') : String(data);
      return `Server returned HTTP ${err?.response?.status}: ${msg}`;
    });
  });

  async function openCreate() {
    render(<AntApp><MemoryRouter><ItemTypeManagement /></MemoryRouter></AntApp>);
    fireEvent.click(await screen.findByRole('button', { name: /Add Item Type/i }, { timeout: 30000 }));
    await screen.findByRole('dialog', {}, { timeout: 30000 });
  }

  function fillForm(code: string, name: string) {
    fireEvent.change(screen.getByLabelText('Item Type Code'), { target: { value: code } });
    fireEvent.change(screen.getByLabelText('Item Type Name'), { target: { value: name } });
  }

  it('create: footer [Cancel][Save] (no OK), sends companyId, success shows the backend Code', async () => {
    apiMock.post.mockResolvedValue({ data: { data: { id: 'it1', code: 'REWORK', name: 'Rework / rectified goods' } } });
    await openCreate();
    fillForm('REWORK', 'Rework / rectified goods');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(apiMock.post).toHaveBeenCalledWith(
        '/master-data/item-types',
        expect.objectContaining({ code: 'REWORK', name: 'Rework / rectified goods', companyId: 'c1' })
      );
    }, { timeout: 30000 });

    const dialog = await screen.findByTestId('save-result-success');
    expect(within(dialog).getByText('Successful')).toBeInTheDocument();
    expect(within(dialog).getByText('Item Type Saved Successfully')).toBeInTheDocument();
    expect(within(dialog).getByText('REWORK')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'OK' })).not.toBeInTheDocument();
  });

  it('create failure: keeps form open with values, shows normalized error, never shows success; retry succeeds', async () => {
    apiMock.post
      .mockRejectedValueOnce({ response: { status: 400, data: { message: ['code already exists'] } } })
      .mockResolvedValueOnce({ data: { data: { id: 'it1', code: 'REWORK', name: 'Rework / rectified goods' } } });
    await openCreate();
    fillForm('REWORK', 'Rework / rectified goods');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText(/Server returned HTTP 400: code already exists/, undefined, { timeout: 30000 })).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByTestId('save-result-loading')).not.toBeInTheDocument(), { timeout: 30000 });
    expect(screen.queryByTestId('save-result-success')).not.toBeInTheDocument();
    expect((screen.getByLabelText('Item Type Code') as HTMLInputElement).value).toBe('REWORK');
    expect((screen.getByLabelText('Item Type Name') as HTMLInputElement).value).toBe('Rework / rectified goods');

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(apiMock.post).toHaveBeenCalledTimes(2), { timeout: 30000 });
    await waitFor(() => expect(screen.getByTestId('save-result-success')).toBeInTheDocument(), { timeout: 30000 });
    expect(within(screen.getByTestId('save-result-success')).getByText('REWORK')).toBeInTheDocument();
  });

  it('edit: code input is disabled, patch omits companyId, success shows updated name', async () => {
    apiMock.patch.mockResolvedValue({ data: { data: { id: 'it1', code: 'REWORK', name: 'Rework updated' } } });
    apiMock.get.mockImplementation((url: any) => {
      const u = String(url);
      if (u === '/companies') return Promise.resolve({ data: [{ id: 'c1' }] });
      if (u === '/master-data/item-types') {
        return Promise.resolve({
          data: [{ id: 'it1', code: 'REWORK', name: 'Rework / rectified goods', description: null, status: 'ACTIVE', companyId: 'c1', usageCount: 3 }],
          total: 1,
        });
      }
      return Promise.resolve({ data: [] });
    });
    const renderCtx = render(<AntApp><MemoryRouter><ItemTypeManagement /></MemoryRouter></AntApp>);
    await screen.findByText('Rework / rectified goods', undefined, { timeout: 30000 });

    const editBtn = renderCtx.container.querySelector('.anticon-edit')?.closest('button');
    fireEvent.click(editBtn!);
    await waitFor(() => expect(screen.getByText(/Edit Item Type — REWORK/)).toBeInTheDocument(), { timeout: 30000 });

    expect((screen.getByLabelText('Item Type Code') as HTMLInputElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Item Type Name'), { target: { value: 'Rework updated' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(apiMock.patch).toHaveBeenCalledTimes(1);
    }, { timeout: 30000 });
    const payload = apiMock.patch.mock.calls[0][1] as Record<string, unknown>;
    expect(payload).toMatchObject({ name: 'Rework updated' });
    // The disabled code field submits the unchanged code (a no-op on the backend);
    // it must never be modified because codes are immutable.
    expect(payload).toMatchObject({ code: 'REWORK' });
    expect(payload).not.toHaveProperty('companyId');

    const dialog = await screen.findByTestId('save-result-success');
    expect(within(dialog).getByText('Item Type Updated Successfully')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'OK' })).not.toBeInTheDocument();
  });

  it('deactivate: warns about usage count and calls the deactivate endpoint', async () => {
    apiMock.patch.mockResolvedValue({ data: { data: { id: 'it1', code: 'REWORK', name: 'Rework / rectified goods', status: 'INACTIVE' } } });
    apiMock.get.mockImplementation((url: any) => {
      const u = String(url);
      if (u === '/companies') return Promise.resolve({ data: [{ id: 'c1' }] });
      if (u === '/master-data/item-types') {
        return Promise.resolve({
          data: [{ id: 'it1', code: 'REWORK', name: 'Rework / rectified goods', description: null, status: 'ACTIVE', companyId: 'c1', usageCount: 3 }],
          total: 1,
        });
      }
      return Promise.resolve({ data: [] });
    });
    render(<AntApp><MemoryRouter><ItemTypeManagement /></MemoryRouter></AntApp>);
    await screen.findByText('Rework / rectified goods', undefined, { timeout: 30000 });

    const title = `Deactivate item type 'REWORK'? It is used by 3 item(s). Inactive types can still be assigned to existing items but cannot be chosen for new ones.`;
    const deactivateBtn = screen.getAllByRole('button', { name: /Deactivate/i }).find((b) => b.textContent === 'Deactivate');
    fireEvent.click(deactivateBtn!);

    expect((await screen.findByText(title, undefined, { timeout: 30000 }))).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Yes' }));

    await waitFor(() => {
      expect(apiMock.patch).toHaveBeenCalledWith('/master-data/item-types/it1/deactivate', {});
    }, { timeout: 30000 });
  });
});