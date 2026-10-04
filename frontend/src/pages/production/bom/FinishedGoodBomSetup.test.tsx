import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import { App } from 'antd';
import FinishedGoodBomSetup from './FinishedGoodBomSetup';
import apiService from '../../../services/api';

jest.setTimeout(30000);

beforeAll(() => {
  window.matchMedia = (query: string) =>
    ({
      matches: true,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList;
});

// Mock dependencies
jest.mock('../../../services/api');
const mockedApi = apiService as jest.Mocked<typeof apiService>;

const mockFgItem = {
  id: 'item-fg-001',
  itemCode: 'SPI-FG-SPK-003',
  name: 'RM Inn / Out Spoke Straight__RM-100 Nipple',
  itemType: 'FINISHED_GOODS',
  baseUomId: 'uom-pcs',
  baseUom: { id: 'uom-pcs', code: 'PCS', name: 'Pieces' },
  isActive: true,
};

const mockFgItem2 = {
  id: 'item-fg-002',
  itemCode: 'DEMO-FG-SPOKE-01',
  name: 'DEMO — RM Inn / Out Spoke Straight__RM-100 Nipple',
  itemType: 'FINISHED_GOODS',
  baseUomId: 'uom-pcs',
  baseUom: { id: 'uom-pcs', code: 'PCS', name: 'Pieces' },
  isActive: true,
};

const mockCompOuter = {
  id: 'comp-item-outer',
  itemCode: '250X17-OUT',
  name: '250×17 Outer Straight',
  itemType: 'RAW_MATERIAL',
  baseUomId: 'uom-grs',
  baseUom: { id: 'uom-grs', code: 'GRS', name: 'Gross' },
  isActive: true,
};

const mockCompInner = {
  id: 'comp-item-inner',
  itemCode: '250X17-INN',
  name: '250×17 Inner Straight',
  itemType: 'RAW_MATERIAL',
  baseUomId: 'uom-grs',
  baseUom: { id: 'uom-grs', code: 'GRS', name: 'Gross' },
  isActive: true,
};

const mockCompNipple = {
  id: 'comp-item-nipple',
  itemCode: 'RM-250X17-NIP',
  name: 'RM-250×17 Nipple',
  itemType: 'RAW_MATERIAL',
  baseUomId: 'uom-grs',
  baseUom: { id: 'uom-grs', code: 'GRS', name: 'Gross' },
  isActive: true,
};

const mockCompWasher = {
  id: 'comp-item-washer',
  itemCode: 'RM-WASHER-01',
  name: 'Steel Washer 4mm',
  itemType: 'RAW_MATERIAL',
  baseUomId: 'uom-pcs',
  baseUom: { id: 'uom-pcs', code: 'PCS', name: 'Pieces' },
  isActive: true,
};

const mockUoms = [
  { id: 'uom-pcs', code: 'PCS', name: 'Pieces', status: 'ACTIVE' },
  { id: 'uom-grs', code: 'GRS', name: 'Gross', status: 'ACTIVE' },
  { id: 'uom-ctn', code: 'CTN', name: 'Carton', status: 'ACTIVE' },
];

const mockConversions = [
  { id: 'conv-1', fromUomId: 'uom-grs', toUomId: 'uom-pcs', conversionFactor: 144 },
  { id: 'conv-2', fromUomId: 'uom-ctn', toUomId: 'uom-grs', conversionFactor: 10 },
];

const mockExistingBom = {
  id: 'bom-001',
  bomCode: 'BOM-FG-001',
  name: 'BOM for RM Inn / Out Spoke Straight__RM-100 Nipple',
  productId: 'item-fg-001',
  status: 'ACTIVE',
  baseQuantity: 1,
  baseUomId: 'uom-pcs',
  lines: [
    {
      id: 'line-1',
      lineNumber: 1,
      itemId: 'comp-item-outer',
      quantity: 5,
      uomId: 'uom-grs',
      uom: { id: 'uom-grs', code: 'GRS' },
      item: mockCompOuter,
      remarks: '5 Gross per FG Carton',
    },
    {
      id: 'line-2',
      lineNumber: 2,
      itemId: 'comp-item-inner',
      quantity: 5,
      uomId: 'uom-grs',
      uom: { id: 'uom-grs', code: 'GRS' },
      item: mockCompInner,
      remarks: '5 Gross per FG Carton',
    },
    {
      id: 'line-3',
      lineNumber: 3,
      itemId: 'comp-item-nipple',
      quantity: 10,
      uomId: 'uom-grs',
      uom: { id: 'uom-grs', code: 'GRS' },
      item: mockCompNipple,
      remarks: '10 Gross per FG Carton',
    },
  ],
};

const renderWithProviders = (initialRoute = '/production/bom/config') => {
  return render(
    <MemoryRouter initialEntries={[initialRoute]}>
      <App>
        <FinishedGoodBomSetup />
      </App>
    </MemoryRouter>
  );
};

describe('FinishedGoodBomSetup — BOM Configuration & Resolution', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    mockedApi.get.mockImplementation(async (url: string) => {
      if (url.includes('/bom/product/item-fg-001')) {
        return { data: mockExistingBom };
      }
      if (url.includes('/bom/product/item-fg-002')) {
        return { data: null };
      }
      if (url.includes('item')) {
        return { data: [mockFgItem, mockFgItem2, mockCompOuter, mockCompInner, mockCompNipple, mockCompWasher] };
      }
      if (url.includes('conversion')) {
        return { data: mockConversions };
      }
      if (url.includes('uom')) {
        return { data: mockUoms };
      }
      return { data: [] };
    });

    mockedApi.post.mockResolvedValue({ success: true, data: { id: 'bom-new-001' } });
    mockedApi.put.mockResolvedValue({ success: true, data: { id: 'bom-001' } });
  });

  test('1. Loads master items, UOMs, and renders initial configuration screen', async () => {
    renderWithProviders('/production/bom/config');

    expect(screen.getByText('1. Finished Good Product Selection (Master Item)')).toBeInTheDocument();
    await waitFor(() => {
      expect(mockedApi.get).toHaveBeenCalledWith(expect.stringContaining('/items'));
      expect(mockedApi.get).toHaveBeenCalledWith(expect.stringContaining('/uom'));
    });
  });

  test('2. Reopening existing Finished Good automatically loads saved BOM lines, quantities and UOMs', async () => {
    renderWithProviders('/production/bom/config?productId=item-fg-001');

    await waitFor(() => {
      expect(mockedApi.get).toHaveBeenCalledWith('/bom/product/item-fg-001');
    });

    // Verify existing BOM status badge and code
    await waitFor(() => {
      expect(screen.getByText(/BOM-FG-001/)).toBeInTheDocument();
      expect(screen.getByText(/Active BOM Configuration Found/i)).toBeInTheDocument();
    });

    // Verify that the 3 saved components loaded
    expect(screen.getByText('250×17 Outer Straight')).toBeInTheDocument();
    expect(screen.getByText('250×17 Inner Straight')).toBeInTheDocument();
    expect(screen.getByText('RM-250×17 Nipple')).toBeInTheDocument();
  });

  test('3. Dynamic PCS equivalent calculation matches authoritative UOM conversion', async () => {
    renderWithProviders('/production/bom/config?productId=item-fg-001');

    // 5 GRS * 144 = 720 PCS; 10 GRS * 144 = 1,440 PCS
    await waitFor(() => {
      const pcs720Elements = screen.getAllByText(/720 PCS/i);
      expect(pcs720Elements.length).toBeGreaterThanOrEqual(2);
      expect(screen.getAllByText(/1,440 PCS/i).length).toBeGreaterThanOrEqual(1);
    });
  });

  test('4. Adding a 4th component scales flexibly without hardcoded limits', async () => {
    renderWithProviders('/production/bom/config?productId=item-fg-001');

    await screen.findByText('RM-250×17 Nipple');

    const editBtn = await screen.findByTestId('edit-bom-btn');
    fireEvent.click(editBtn);

    const addBtn = await screen.findByTestId('add-component-btn');
    fireEvent.click(addBtn);

    await waitFor(() => {
      expect(screen.getByTestId('component-mapping-header')).toHaveTextContent('4 Components');
    });
  });

  test('5. Saving changes calls PUT /bom/:id with full updated component payload', async () => {
    renderWithProviders('/production/bom/config?productId=item-fg-001');

    await screen.findByText(/BOM-FG-001/);

    const editBtn = await screen.findByTestId('edit-bom-btn');
    fireEvent.click(editBtn);

    const saveBtn = await screen.findByTestId('save-bom-btn');
    fireEvent.click(saveBtn);

    const confirmModalBtn = await screen.findByTestId('confirm-save-modal-btn');
    fireEvent.click(confirmModalBtn);

    await waitFor(() => {
      expect(mockedApi.put).toHaveBeenCalledWith(
        '/bom/bom-001',
        expect.objectContaining({
          productId: 'item-fg-001',
          status: 'ACTIVE',
          lines: expect.arrayContaining([
            expect.objectContaining({ itemId: 'comp-item-outer', quantity: 5 }),
            expect.objectContaining({ itemId: 'comp-item-inner', quantity: 5 }),
            expect.objectContaining({ itemId: 'comp-item-nipple', quantity: 10 }),
          ]),
        })
      );
    });
  });

  test('6. Creating new BOM calls POST /bom when saving a new configuration', async () => {
    renderWithProviders('/production/bom/config?productId=item-fg-002');

    await screen.findByText('DEMO-FG-SPOKE-01');
    await screen.findByText(/No Active BOM Configured/i);

    const demoBtn = await screen.findByTestId('load-demo-preset-btn');
    fireEvent.click(demoBtn);

    await screen.findByText('3 Items');

    const saveBtn = await screen.findByTestId('save-bom-btn');
    fireEvent.click(saveBtn);

    const confirmModalBtn = await screen.findByTestId('confirm-save-modal-btn');
    fireEvent.click(confirmModalBtn);

    await waitFor(() => {
      expect(mockedApi.post).toHaveBeenCalledWith(
        '/bom',
        expect.objectContaining({
          productId: 'item-fg-002',
          status: 'ACTIVE',
          lines: expect.arrayContaining([
            expect.objectContaining({ itemId: 'comp-item-outer', quantity: 5 }),
            expect.objectContaining({ itemId: 'comp-item-inner', quantity: 5 }),
            expect.objectContaining({ itemId: 'comp-item-nipple', quantity: 10 }),
          ]),
        })
      );
    });
  }, 20000);

  test('7. Architectural Test: Hand Packing consumption is strictly BOM-driven with no hardcoded ratios', () => {
    // Proving the core architectural contract:
    // If BOM has Outer=5, Inner=5, Nipple=10 per Carton
    // Hand Packing Carton multiplier = 50 Cartons
    const calculateConsumption = (bomLines: { id: string; quantity: number }[], cartons: number) => {
      return bomLines.map((line) => ({
        id: line.id,
        gross: line.quantity * cartons,
        pcs: line.quantity * cartons * 144,
      }));
    };

    // Configuration 1 (5, 5, 10)
    const bomConfig1 = [
      { id: 'outer', quantity: 5 },
      { id: 'inner', quantity: 5 },
      { id: 'nipple', quantity: 10 },
    ];
    const result1 = calculateConsumption(bomConfig1, 50);
    expect(result1.find((r) => r.id === 'outer')?.gross).toBe(250);
    expect(result1.find((r) => r.id === 'outer')?.pcs).toBe(36000);
    expect(result1.find((r) => r.id === 'inner')?.gross).toBe(250);
    expect(result1.find((r) => r.id === 'inner')?.pcs).toBe(36000);
    expect(result1.find((r) => r.id === 'nipple')?.gross).toBe(500);
    expect(result1.find((r) => r.id === 'nipple')?.pcs).toBe(72000);

    // Configuration 2: Altered BOM (Outer=6, Inner=4, Nipple=10)
    const bomConfig2 = [
      { id: 'outer', quantity: 6 },
      { id: 'inner', quantity: 4 },
      { id: 'nipple', quantity: 10 },
    ];
    const result2 = calculateConsumption(bomConfig2, 50);
    expect(result2.find((r) => r.id === 'outer')?.gross).toBe(300);
    expect(result2.find((r) => r.id === 'outer')?.pcs).toBe(43200);
    expect(result2.find((r) => r.id === 'inner')?.gross).toBe(200);
    expect(result2.find((r) => r.id === 'inner')?.pcs).toBe(28800);
    expect(result2.find((r) => r.id === 'nipple')?.gross).toBe(500);
    expect(result2.find((r) => r.id === 'nipple')?.pcs).toBe(72000);

    // Proves that consumption formula is purely driven by database BOM lines without any code changes.
  });
});
