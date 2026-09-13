import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import { App as AntApp } from 'antd';
import CategoryManagement from './CategoryManagement';
import apiService from '../../services/api';

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
  (global as any).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

const hierarchy = [
  {
    id: 'fin', companyId: 'c1', categoryCode: 'CAT-FIN', name: 'Finished Goods', description: null,
    parentCategoryId: null, parentCategory: null, status: 'ACTIVE', level: 0, childCount: 2, usageCount: 0,
    children: [
      {
        id: 'cc', companyId: 'c1', categoryCode: 'CAT-FIN-CC', name: 'Control Cable', description: 'Cables',
        parentCategoryId: 'fin', parentCategory: { id: 'fin', name: 'Finished Goods' }, status: 'ACTIVE',
        level: 1, childCount: 0, usageCount: 14, children: [],
      },
      {
        id: 'elec', companyId: 'c1', categoryCode: 'CAT-FIN-ELEC', name: 'Electrical Parts', description: null,
        parentCategoryId: 'fin', parentCategory: { id: 'fin', name: 'Finished Goods' }, status: 'ACTIVE',
        level: 1, childCount: 0, usageCount: 8, children: [],
      },
    ],
  },
  {
    id: 'raw', companyId: 'c1', categoryCode: 'CAT-RAW', name: 'Raw Materials', description: null,
    parentCategoryId: null, parentCategory: null, status: 'ACTIVE', level: 0, childCount: 1, usageCount: 0,
    children: [
      {
        id: 'met', companyId: 'c1', categoryCode: 'CAT-RAW-MET', name: 'Metals', description: null,
        parentCategoryId: 'raw', parentCategory: { id: 'raw', name: 'Raw Materials' }, status: 'ACTIVE',
        level: 1, childCount: 1, usageCount: 8, children: [
          {
            id: 'hcs', companyId: 'c1', categoryCode: 'CAT-RAW-HCS', name: 'High Carbon Steel Wire', description: null,
            parentCategoryId: 'met', parentCategory: { id: 'met', name: 'Metals' }, status: 'ACTIVE',
            level: 2, childCount: 0, usageCount: 15, children: [],
          },
        ],
      },
    ],
  },
];

function setup() {
  localStorage.clear();
  apiMock.get.mockReset();
  apiMock.post.mockReset();
  apiMock.patch.mockReset();
  apiMock.get.mockImplementation((url: any) => {
    const u = String(url);
    if (u === '/companies') return Promise.resolve({ data: [{ id: 'c1' }] });
    if (u === '/master-data/categories/hierarchy') return Promise.resolve({ data: hierarchy });
    return Promise.resolve({ data: [] });
  });
  render(<AntApp><MemoryRouter><CategoryManagement /></MemoryRouter></AntApp>);
  return apiMock;
}

describe('CategoryManagement hierarchy table', () => {
  beforeEach(setup);

  it('renders full tree default-expanded with level/children/items/status columns', async () => {
    await screen.findByText('Control Cable', {}, { timeout: 30000 });
    expect(screen.getAllByText('Finished Goods').length).toBeGreaterThan(0);
    expect(screen.getByText('Control Cable')).toBeInTheDocument();
    expect(screen.getByText('Electrical Parts')).toBeInTheDocument();
    expect(screen.getAllByText('Raw Materials').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Metals').length).toBeGreaterThan(0);
    expect(screen.getByText('High Carbon Steel Wire')).toBeInTheDocument();
    expect(screen.getAllByText('L0').length).toBeGreaterThan(0);
    expect(screen.getByText('L2')).toBeInTheDocument();
    expect(screen.getByText('14')).toBeInTheDocument();
    expect(screen.getByText('15')).toBeInTheDocument();
    expect(screen.getAllByText('Active').length).toBeGreaterThan(0);
  });

  it('search keeps matching node and its ancestors only', async () => {
    await screen.findByText('Control Cable', {}, { timeout: 30000 });
    fireEvent.change(screen.getByPlaceholderText('Search categories...'), { target: { value: 'Control' } });
    await waitFor(() => {
      expect(screen.getByText('Control Cable')).toBeInTheDocument();
      expect(screen.queryByText('Electrical Parts')).not.toBeInTheDocument();
      expect(screen.queryByText('High Carbon Steel Wire')).not.toBeInTheDocument();
      expect(screen.queryByText('Raw Materials')).not.toBeInTheDocument();
    });
    expect(screen.getAllByText('Finished Goods').length).toBeGreaterThan(0);
  });

  it('create: opens modal, validates code format, posts with companyId and parent', async () => {
    await screen.findByText('Control Cable', {}, { timeout: 30000 });
    fireEvent.click(screen.getByRole('button', { name: /Add Category/i }));
    const dialog = await screen.findByRole('dialog', {}, { timeout: 30000 });
    fireEvent.change(within(dialog).getByLabelText('Category Code'), { target: { value: 'CAT-TEST' } });
    fireEvent.change(within(dialog).getByLabelText('Category Name'), { target: { value: 'Test Category' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'OK' }));
    await waitFor(() => {
      expect(apiMock.post).toHaveBeenCalledWith(
        '/master-data/categories',
        expect.objectContaining({ companyId: 'c1', categoryCode: 'CAT-TEST', name: 'Test Category' })
      );
    }, { timeout: 30000 });
  });

  it('edit: prefills form and patches; parent selector excludes the node subtree', async () => {
    await screen.findByText('Control Cable', {}, { timeout: 30000 });
    const rawRow = screen.getAllByText('Raw Materials')[0].closest('tr')!;
    fireEvent.click(within(rawRow).getByRole('button', { name: /Edit/i }));
    const dialog = await screen.findByRole('dialog', {}, { timeout: 30000 });
    const codeInput = within(dialog).getByLabelText('Category Code');
    expect(codeInput).toHaveValue('CAT-RAW');
    expect(codeInput).toBeDisabled();
    fireEvent.change(within(dialog).getByLabelText('Category Name'), { target: { value: 'Raw Materials v2' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'OK' }));
    await waitFor(() => {
      expect(apiMock.patch).toHaveBeenCalledWith(
        '/master-data/categories/raw',
        expect.objectContaining({ categoryCode: 'CAT-RAW', name: 'Raw Materials v2' })
      );
    }, { timeout: 30000 });
  });

  it('deactivate: confirm then calls deactivate endpoint', async () => {
    await screen.findByText('Control Cable', {}, { timeout: 30000 });
    const metRow = screen.getAllByText('Metals')[0].closest('tr')!;
    fireEvent.click(within(metRow).getByRole('button', { name: /Deactivate/ }));
    const okButton = screen.getByRole('button', { name: 'OK' });
    fireEvent.click(okButton);
    await waitFor(() => {
      expect(apiMock.patch).toHaveBeenCalledWith('/master-data/categories/met/deactivate');
    }, { timeout: 30000 });
  });
});