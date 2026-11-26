import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import { App } from 'antd';
import OpeningStock from './OpeningStock';
import OpeningStockHistoryModal from './OpeningStockHistoryModal';
import apiService from '../../services/api';
import dashboardService from '../../services/dashboardService';
import { useHeaderActions } from '../../components/layout/headerActionsStore';

jest.mock('../../services/api');
jest.mock('../../services/dashboardService');
jest.mock('../../hooks/usePermission', () => ({
  usePermission: () => ({
    can: () => true,
    canAny: () => true,
    canAll: () => true,
    canModule: () => true,
    isLoaded: true,
    isError: false,
  }),
}));

const apiMock = apiService as jest.Mocked<typeof apiService>;
const dashMock = dashboardService as jest.Mocked<typeof dashboardService>;

jest.setTimeout(25000);

beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });
});

describe('Store Opening Stock — Template Generator, Wizard & Batch History Reverse/Restore', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useHeaderActions.getState().clearHeaderActions();

    dashMock.getFilterDivisions.mockResolvedValue({
      data: [{ id: 'div-ccd', name: 'Control Cable Division' }],
    } as any);

    apiMock.get.mockImplementation(async (url: string) => {
      if (url === '/warehouses') {
        return {
          data: [
            {
              id: 'wh-ccd',
              name: 'CCD Main Warehouse',
              warehouseCode: 'CCD-MWH-001',
              divisionId: 'div-ccd',
              warehouseType: 'GENERAL',
            },
          ],
        } as any;
      }
      if (url === '/master-data/uom') {
        return {
          data: [{ id: 'u-kg', code: 'KG', name: 'Kilogram' }],
        } as any;
      }
      if (url === '/master-data/items/lookup') {
        return {
          data: [
            {
              id: 'item-1',
              itemCode: 'RM-WIRE-001',
              name: 'Copper Wire 1.20mm',
              categoryName: 'Raw Wire',
              itemType: 'RAW_MATERIAL',
              baseUomId: 'u-kg',
              baseUomCode: 'KG',
              divisionId: 'div-ccd',
              costPrice: 2450,
              isStoreItem: true,
            },
            {
              id: 'item-2',
              itemCode: 'PKG-BOX-002',
              name: 'Standard Carton Box',
              categoryName: 'Packing',
              itemType: 'PACKAGING_MATERIAL',
              baseUomId: 'u-kg',
              baseUomCode: 'KG',
              divisionId: 'div-ccd',
              costPrice: 80,
              isStoreItem: true,
            },
          ],
        } as any;
      }
      if (String(url).startsWith('/inventory/balances')) {
        return { data: [] } as any;
      }
      return { data: [] } as any;
    });
  });

  it('registers Download Template & Import Excel / CSV header actions and enforces mutually exclusive modals', async () => {
    const HeaderHarness: React.FC = () => {
      const actions = useHeaderActions((s) => s.actions);
      return (
        <div>
          <div data-testid="header-toolbar">
            {actions.map((a) => (
              <React.Fragment key={a.key}>{a.node}</React.Fragment>
            ))}
          </div>
          <OpeningStock />
        </div>
      );
    };

    render(
      <App>
        <MemoryRouter>
          <HeaderHarness />
        </MemoryRouter>
      </App>,
    );

    expect(await screen.findByText('Store Opening Stock')).toBeInTheDocument();

    const headerActions = useHeaderActions.getState().actions;
    expect(headerActions.some((a) => a.key === 'os-template-modal')).toBe(true);
    expect(headerActions.some((a) => a.key === 'os-import-wizard')).toBe(true);

    // 1. Open Download Template modal
    fireEvent.click(await screen.findByText('Download Template'));
    expect(await screen.findByText('Download Opening Stock Template')).toBeInTheDocument();
    expect(screen.queryByText('Opening Stock Excel / CSV Import Wizard')).not.toBeInTheDocument();

    // 2. Open Import Excel / CSV wizard -> must automatically close Download Template modal
    fireEvent.click(screen.getByText('Import Excel / CSV'));
    expect(await screen.findByText('Opening Stock Excel / CSV Import Wizard')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByText('Download Opening Stock Template')).not.toBeInTheDocument();
    });

    // 3. Click "Download Pre-Filled Excel (.xlsx) / CSV Template" inside Import Wizard -> must close Import Wizard first
    fireEvent.click(screen.getByText('Download Pre-Filled Excel (.xlsx) / CSV Template'));
    expect(await screen.findByText('Download Opening Stock Template')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByText('Opening Stock Excel / CSV Import Wizard')).not.toBeInTheDocument();
    });
  });

  it('OpeningStockHistoryModal displays POSTED & REVERSED batches and calls reverse / restore endpoints with confirmation', async () => {
    apiMock.get.mockImplementation(async (url: string) => {
      if (url === '/inventory/opening-stock/history') {
        return {
          data: [
            {
              key: 'OPN-20261127-101::wh-ccd',
              batchId: 'b-1',
              referenceNumber: 'OPN-20261127-101',
              transactionDate: '2026-11-27T00:00:00Z',
              warehouseId: 'wh-ccd',
              warehouseCode: 'CCD-MWH-001',
              warehouseName: 'CCD Main Warehouse',
              divisionName: 'Control Cable Division',
              status: 'POSTED',
              createdByName: 'Admin User',
              lineCount: 1,
              totalQuantity: 100,
              totalValue: 245000,
              lines: [
                {
                  ledgerId: 'l-1',
                  itemId: 'item-1',
                  itemCode: 'RM-WIRE-001',
                  itemName: 'Copper Wire 1.20mm',
                  itemType: 'RAW_MATERIAL',
                  uomId: 'u-kg',
                  uomCode: 'KG',
                  quantity: 100,
                  unitCost: 2450,
                  totalCost: 245000,
                  batchNumber: null,
                  serialNumber: null,
                  notes: 'Initial balance',
                  createdAt: '2026-11-27T00:00:00Z',
                },
              ],
            },
            {
              key: 'OPN-20261127-102::wh-ccd',
              batchId: 'b-2',
              referenceNumber: 'OPN-20261127-102',
              transactionDate: '2026-11-26T00:00:00Z',
              warehouseId: 'wh-ccd',
              warehouseCode: 'CCD-MWH-001',
              warehouseName: 'CCD Main Warehouse',
              divisionName: 'Control Cable Division',
              status: 'REVERSED',
              createdByName: 'Admin User',
              lineCount: 1,
              totalQuantity: 50,
              totalValue: 4000,
              lines: [
                {
                  ledgerId: 'l-2',
                  itemId: 'item-2',
                  itemCode: 'PKG-BOX-002',
                  itemName: 'Standard Carton Box',
                  itemType: 'PACKAGING_MATERIAL',
                  uomId: 'u-kg',
                  uomCode: 'KG',
                  quantity: 50,
                  unitCost: 80,
                  totalCost: 4000,
                  batchNumber: null,
                  serialNumber: null,
                  notes: null,
                  createdAt: '2026-11-26T00:00:00Z',
                },
              ],
            },
          ],
        } as any;
      }
      return { data: [] } as any;
    });

    apiMock.post.mockResolvedValue({ success: true, data: {} } as any);

    render(
      <App>
        <MemoryRouter>
          <OpeningStockHistoryModal
            open
            onClose={jest.fn()}
            warehouses={[{ id: 'wh-ccd', name: 'CCD Main Warehouse', code: 'CCD-MWH-001' }]}
            divisions={[{ id: 'div-ccd', name: 'Control Cable Division' }]}
          />
        </MemoryRouter>
      </App>,
    );

    expect(await screen.findByText('OPN-20261127-101')).toBeInTheDocument();
    expect(screen.getByText('POSTED')).toBeInTheDocument();
    expect(screen.getByText('OPN-20261127-102')).toBeInTheDocument();
    expect(screen.getByText('REVERSED')).toBeInTheDocument();

    // Reverse POSTED batch
    fireEvent.click(screen.getByText('Undo / Reverse'));
    expect(await screen.findByText('Undo / Reverse Opening Stock Batch?')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Confirm Safe Reversal'));

    await waitFor(() => {
      expect(apiMock.post).toHaveBeenCalledWith(
        '/inventory/opening-stock/batches/OPN-20261127-101/reverse',
        { warehouseId: 'wh-ccd' },
      );
    });

    // Restore REVERSED batch
    fireEvent.click(screen.getByText('Restore / Re-Post'));
    expect(await screen.findByText('Restore / Re-Post Opening Stock Batch?')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Confirm Restore & Re-Post'));

    await waitFor(() => {
      expect(apiMock.post).toHaveBeenCalledWith(
        '/inventory/opening-stock/batches/OPN-20261127-102/restore',
        { warehouseId: 'wh-ccd' },
      );
    });
  });
});
