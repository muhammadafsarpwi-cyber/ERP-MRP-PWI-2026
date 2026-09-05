import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import InputMaterialSelect from './InputMaterialSelect';
import type { Item } from './itemTypes';
import apiService from '../../../services/api';

jest.mock('../../../services/api');

jest.setTimeout(45000);

const apiMock = apiService as jest.Mocked<typeof apiService>;

const DEPTS: Array<{ id: string; departmentCode: string; name: string; divisionId: null; sectionId: null }> = [
  { id: 'dept-store', name: 'Store', departmentCode: 'STRO', divisionId: null, sectionId: null },
  { id: 'dept-flat', name: 'Flattening', departmentCode: 'FLAT', divisionId: null, sectionId: null },
];

// TASK #34C fixtures — the production chain items (sample data lives in the DB).
const MAT_RAW = {
  id: 'item-R1', itemCode: '1.20MM-B4', name: '1.20 mm-B4 Wire', itemType: 'RAW_MATERIAL',
  status: 'ACTIVE', departmentId: 'dept-store', departmentName: 'Store', baseUomName: 'KG', wireSizeMm: 1.2,
};
const MAT_SEMI = {
  id: 'item-S1', itemCode: 'FLAT-WIRE-040-260', name: 'Flat Wire T 0.40 x W 2.60 mm', itemType: 'SEMI_FINISHED',
  status: 'ACTIVE', departmentId: 'dept-flat', departmentName: 'Flattening', baseUomName: 'KG', wireSizeMm: 0.4,
};
const MAT_WIP = {
  id: 'item-A', itemCode: 'WIP-FT-001', name: 'Flat Wire A', itemType: 'FINISHED_GOOD',
  status: 'ACTIVE', departmentId: 'dept-flat', departmentName: 'Flattening', baseUomName: 'KG',
};
const MAT_SVC = { id: 'item-SVC', itemCode: 'SVC-001', name: 'Tooling Service', itemType: 'SERVICE', status: 'ACTIVE', departmentId: 'dept-store' };
const MAT_INACT = { id: 'item-IN', itemCode: 'INACT-1', name: 'Discontinued Wire', itemType: 'RAW_MATERIAL', status: 'INACTIVE' };

const ALL: Item[] = [MAT_RAW, MAT_SEMI, MAT_WIP, MAT_SVC, MAT_INACT];

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

beforeEach(() => {
  apiMock.get.mockReset();
});

function mockItemsEndpoint(allItems: typeof ALL = ALL) {
  apiMock.get.mockImplementation(async (url: string, params?: any) => {
    if (url === '/master-data/items') {
      const kw = params?.search ? String(params.search).toLowerCase() : '';
      const items = allItems.filter(
        (i) =>
          (!kw ||
            i.itemCode.toLowerCase().includes(kw) ||
            i.name.toLowerCase().includes(kw) ||
            (i.sku ?? '').toLowerCase().includes(kw)) &&
          (!params?.departmentId || i.departmentId === params.departmentId) &&
          !(params?.status && i.status !== params.status),
      );
      return { data: items, total: items.length };
    }
    if (url.startsWith('/master-data/items/')) {
      const id = url.split('/').pop();
      const item = allItems.find((i) => i.id === id);
      return item ? { data: item } : { data: null };
    }
    return {} as never;
  });
}

async function getCombobox(ariaLabel: string): Promise<HTMLElement> {
  const matches = await screen.findAllByLabelText(ariaLabel);
  const combo = matches.find((el) => el.getAttribute('role') === 'combobox');
  if (!combo) throw new Error(`combobox "${ariaLabel}" not found`);
  return combo as HTMLElement;
}

async function openInputSelect() {
  const combo = await getCombobox('Input Material Select');
  fireEvent.mouseDown(combo);
  return combo;
}

async function pickOption(label: string) {
  const options = await screen.findAllByText(label, { selector: '.ant-select-item-option-content' });
  await userEvent.click(options[options.length - 1]);
}

describe('TASK #34C — Item Master Production Input selector', () => {
  it('A: loads the REAL Item Master dataset (not a fixed/sample list) via the items API', async () => {
    mockItemsEndpoint();
    render(<InputMaterialSelect departments={DEPTS} />);
    await waitFor(() =>
      expect(apiMock.get).toHaveBeenCalledWith(
        '/master-data/items',
        expect.objectContaining({ page: 1, limit: 100, status: 'ACTIVE', sortField: 'itemCode', sortOrder: 'ASC' }),
      ),
    );
    await openInputSelect();
    expect(await screen.findByText('1.20MM-B4 — 1.20 mm-B4 Wire', { selector: '.ant-select-item-option-content' })).toBeInTheDocument();
    expect(screen.getByText('FLAT-WIRE-040-260 — Flat Wire T 0.40 x W 2.60 mm', { selector: '.ant-select-item-option-content' })).toBeInTheDocument();
  });

  it('B: raw materials are discoverable and SERVICE/ASSET/OTHER + non-ACTIVE are excluded', async () => {
    mockItemsEndpoint();
    render(<InputMaterialSelect departments={DEPTS} />);
    await openInputSelect();
    // RAW_MATERIAL must appear (the production chain's root raw wire).
    expect(await screen.findByText('1.20MM-B4 — 1.20 mm-B4 Wire', { selector: '.ant-select-item-option-content' })).toBeInTheDocument();
    expect(screen.queryByText('SVC-001 — Tooling Service')).not.toBeInTheDocument();
    expect(screen.queryByText('INACT-1 — Discontinued Wire')).not.toBeInTheDocument();
  });

  it('C: Source / Store Department filter queries server with departmentId and narrows options', async () => {
    mockItemsEndpoint();
    render(<InputMaterialSelect departments={DEPTS} />);
    const deptCombo = await getCombobox('Source / Store Department');
    fireEvent.mouseDown(deptCombo);
    const opts = await screen.findAllByText('Store', { selector: '.ant-select-item-option-content' });
    await userEvent.click(opts[opts.length - 1]);
    await waitFor(() =>
      expect(apiMock.get).toHaveBeenCalledWith(
        '/master-data/items',
        expect.objectContaining({ departmentId: 'dept-store' }),
      ),
    );
    await openInputSelect();
    expect(await screen.findByText('1.20MM-B4 — 1.20 mm-B4 Wire', { selector: '.ant-select-item-option-content' })).toBeInTheDocument();
    expect(screen.queryByText('FLAT-WIRE-040-260 — Flat Wire T 0.40 x W 2.60 mm')).not.toBeInTheDocument();
  });

  it('D: clearing the Source / Store Department filter restores the full list', async () => {
    mockItemsEndpoint();
    render(<InputMaterialSelect departments={DEPTS} />);
    const deptCombo = await getCombobox('Source / Store Department');
    fireEvent.mouseDown(deptCombo);
    const opts = await screen.findAllByText('Store', { selector: '.ant-select-item-option-content' });
    await userEvent.click(opts[opts.length - 1]);
    await waitFor(() =>
      expect(apiMock.get).toHaveBeenCalledWith('/master-data/items', expect.objectContaining({ departmentId: 'dept-store' })),
    );
    const clear = (deptCombo.closest('.ant-select')?.querySelector('.ant-select-clear') as HTMLElement) ?? deptCombo;
    fireEvent.mouseDown(clear);
    fireEvent.click(clear);
    await waitFor(() => expect(apiMock.get.mock.calls.length).toBeGreaterThan(2));
    const lastItemsCall = [...apiMock.get.mock.calls]
      .reverse()
      .find(([url]) => url === '/master-data/items');
    expect(lastItemsCall).toBeDefined();
    expect(lastItemsCall![1]).toEqual(expect.not.objectContaining({ departmentId: expect.anything() }));
  });

  it('E: typing an item code triggers server-side search (search param sent)', async () => {
    mockItemsEndpoint();
    render(<InputMaterialSelect departments={DEPTS} />);
    const combo = await getCombobox('Input Material Select');
    fireEvent.change(combo, { target: { value: '1.20MM' } });
    await waitFor(
      () => expect(apiMock.get).toHaveBeenCalledWith('/master-data/items', expect.objectContaining({ search: '1.20MM' })),
      { timeout: 3000 },
    );
  });

  it('F: typing an item name triggers server-side search (name path)', async () => {
    mockItemsEndpoint();
    render(<InputMaterialSelect departments={DEPTS} />);
    const combo = await getCombobox('Input Material Select');
    fireEvent.change(combo, { target: { value: 'Flat Wire' } });
    await waitFor(
      () => expect(apiMock.get).toHaveBeenCalledWith('/master-data/items', expect.objectContaining({ search: 'Flat Wire' })),
      { timeout: 3000 },
    );
  });

  it('G: the current item cannot be selected as its own input', async () => {
    mockItemsEndpoint();
    render(<InputMaterialSelect departments={DEPTS} excludeItemId="item-A" />);
    await openInputSelect();
    expect(await screen.findByText('1.20MM-B4 — 1.20 mm-B4 Wire', { selector: '.ant-select-item-option-content' })).toBeInTheDocument();
    expect(screen.queryByText('WIP-FT-001 — Flat Wire A')).not.toBeInTheDocument();
  });

  it('§13: the selected input material exposes Item Master details (type, dept, UOM, wire size)', async () => {
    mockItemsEndpoint();
    render(<InputMaterialSelect departments={DEPTS} value="item-R1" />);
    expect(await screen.findByText('1.20MM-B4')).toBeInTheDocument();
    expect(screen.getByText('1.20 mm-B4 Wire')).toBeInTheDocument();
    expect(screen.getByText('Raw Material')).toBeInTheDocument();
    expect(screen.getByText('Store')).toBeInTheDocument();
    expect(screen.getByText('KG')).toBeInTheDocument();
    expect(screen.getByText('1.20')).toBeInTheDocument();
  });
});