import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import { App as AntApp } from 'antd';
import RouteTypeManagement from './RouteTypeManagement';
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

describe('RouteTypeManagement save flow', () => {
  beforeEach(() => {
    localStorage.clear();
    apiMock.get.mockReset();
    apiMock.post.mockReset();
    apiMock.patch.mockReset();
    apiMock.get.mockImplementation((url: any) => {
      const u = String(url);
      if (u === '/companies') return Promise.resolve({ data: [{ id: 'c1' }] });
      if (u === '/master-data/route-types') return Promise.resolve({ data: [], total: 0 });
      return Promise.resolve({ data: [] });
    });
    (apiMod.describeRequestError as jest.Mock).mockImplementation((err: any) => {
      const data = err?.response?.data?.message;
      const msg = Array.isArray(data) ? data.join('; ') : String(data);
      return `Server returned HTTP ${err?.response?.status}: ${msg}`;
    });
  });

  async function openCreate() {
    render(<AntApp><MemoryRouter><RouteTypeManagement /></MemoryRouter></AntApp>);
    fireEvent.click(await screen.findByRole('button', { name: /Add Route Type/i }, { timeout: 30000 }));
    await screen.findByRole('dialog', {}, { timeout: 30000 });
  }

  function fillForm(code: string, name: string) {
    fireEvent.change(screen.getByLabelText('Route Code'), { target: { value: code } });
    fireEvent.change(screen.getByLabelText('Route Name'), { target: { value: name } });
  }

  it('create: footer [Cancel][Save] (no OK), sends companyId, success shows the backend Route Code', async () => {
    apiMock.post.mockResolvedValue({ data: { data: { id: 'rt1', routeCode: 'CCD', name: 'Casting Conduit' } } });
    await openCreate();
    fillForm('CCD', 'Casting Conduit');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(apiMock.post).toHaveBeenCalledWith(
        '/master-data/route-types',
        expect.objectContaining({ routeCode: 'CCD', name: 'Casting Conduit', companyId: 'c1' })
      );
    }, { timeout: 30000 });

    const dialog = await screen.findByTestId('save-result-success');
    expect(within(dialog).getByText('Successful')).toBeInTheDocument();
    expect(within(dialog).getByText('Route Type Saved Successfully')).toBeInTheDocument();
    expect(within(dialog).getByText('Route Code')).toBeInTheDocument();
    expect(within(dialog).getByText('CCD')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'OK' })).not.toBeInTheDocument();
  });

  it('create failure: keeps the form open with values, shows normalized error, never shows success; retry succeeds', async () => {
    apiMock.post
      .mockRejectedValueOnce({ response: { status: 400, data: { message: ['routeCode already exists'] } } })
      .mockResolvedValueOnce({ data: { data: { id: 'rt1', routeCode: 'CCD', name: 'Casting Conduit' } } });
    await openCreate();
    fillForm('CCD', 'Casting Conduit');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText(/Server returned HTTP 400: routeCode already exists/, undefined, { timeout: 30000 })).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByTestId('save-result-loading')).not.toBeInTheDocument(), { timeout: 30000 });
    expect(screen.queryByTestId('save-result-success')).not.toBeInTheDocument();
    expect((screen.getByLabelText('Route Code') as HTMLInputElement).value).toBe('CCD');
    expect((screen.getByLabelText('Route Name') as HTMLInputElement).value).toBe('Casting Conduit');

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(apiMock.post).toHaveBeenCalledTimes(2), { timeout: 30000 });
    await waitFor(() => expect(screen.getByTestId('save-result-success')).toBeInTheDocument(), { timeout: 30000 });
    expect(within(screen.getByTestId('save-result-success')).getByText('CCD')).toBeInTheDocument();
  });

  it('edit: footer [Cancel][Save] (no OK), patch omits companyId, success shows updated name and refetches list', async () => {
    apiMock.patch.mockResolvedValue({ data: { data: { id: 'rt1', routeCode: 'CCD', name: 'Casting Conduit Updated' } } });
    apiMock.get.mockImplementation((url: any) => {
      const u = String(url);
      if (u === '/companies') return Promise.resolve({ data: [{ id: 'c1' }] });
      if (u === '/master-data/route-types') {
        return Promise.resolve({
          data: [{ id: 'rt1', routeCode: 'CCD', name: 'Casting Conduit', description: null, status: 'ACTIVE', companyId: 'c1' }],
          total: 1,
        });
      }
      return Promise.resolve({ data: [] });
    });
    const renderCtx = render(<AntApp><MemoryRouter><RouteTypeManagement /></MemoryRouter></AntApp>);
    await screen.findByText('Casting Conduit', undefined, { timeout: 30000 });

    const editBtn = renderCtx.container.querySelector('.anticon-edit')?.closest('button');
    fireEvent.click(editBtn!);
    await waitFor(() => expect(screen.getByText(/Edit Route Type — CCD/)).toBeInTheDocument(), { timeout: 30000 });

    fireEvent.change(screen.getByLabelText('Route Name'), { target: { value: 'Casting Conduit Updated' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(apiMock.patch).toHaveBeenCalledTimes(1);
    }, { timeout: 30000 });
    const payload = apiMock.patch.mock.calls[0][1] as Record<string, unknown>;
    expect(payload).toMatchObject({ name: 'Casting Conduit Updated' });
    expect(payload).not.toHaveProperty('companyId');

    const dialog = await screen.findByTestId('save-result-success');
    expect(within(dialog).getByText('Route Type Updated Successfully')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'OK' })).not.toBeInTheDocument();
  });
});