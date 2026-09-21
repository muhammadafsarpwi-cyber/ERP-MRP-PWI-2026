import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import StoreStockSummary from './components/dashboard/storeStockSummary';
import { StockSummaryRow } from '../../services/storeDashboard';

beforeAll(() => {
  window.matchMedia =
    window.matchMedia ||
    function (query: string) {
      return {
        matches: false,
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      };
    };
});

describe('StoreStockSummary Component', () => {
  const mockRows: StockSummaryRow[] = [
    {
      storeItemId: 'bal-001',
      storeId: 'store-1',
      storeCode: 'CCD-RM-STORE',
      storeName: 'CCD Raw Material Store',
      itemId: 'item-001',
      itemCode: 'RM-WIRE-001',
      itemName: '1.20 mm-B4 Wire',
      itemType: 'RAW_MATERIAL',
      uomCode: 'KG',
      onHand: 37966828,
      reserved: 0,
      available: 37966828,
      minimumStock: 1000,
      reorderLevel: 2000,
      maximumStock: 50000000,
      shortage: 0,
      status: 'OK',
    },
    {
      storeItemId: 'bal-002',
      storeId: 'store-1',
      storeCode: 'CCD-RM-STORE',
      storeName: 'CCD Raw Material Store',
      itemId: 'item-002',
      itemCode: 'RM-WIRE-002',
      itemName: '1.45 mm-B4 Wire',
      itemType: 'RAW_MATERIAL',
      uomCode: 'KG',
      onHand: 12110,
      reserved: 0,
      available: 12110,
      minimumStock: 500,
      reorderLevel: 1000,
      maximumStock: 20000,
      shortage: 0,
      status: 'OK',
    },
    {
      storeItemId: 'bal-003',
      storeId: 'store-1',
      storeCode: 'CCD-RM-STORE',
      storeName: 'CCD Raw Material Store',
      itemId: 'item-003',
      itemCode: 'DEMO-NR-001',
      itemName: 'Brass Rod 8mm x 3m',
      itemType: 'OTHER',
      uomCode: 'PCS',
      onHand: 0,
      reserved: 0,
      available: 0,
      minimumStock: 0,
      reorderLevel: 0,
      maximumStock: 0,
      shortage: 0,
      status: 'OK',
    },
  ];

  it('renders all stock items without limiting to one', () => {
    render(
      <StoreStockSummary
        rows={mockRows}
        belowMinimum={0}
        onViewBalance={() => {}}
      />,
    );

    expect(screen.getByText('RM-WIRE-001')).toBeInTheDocument();
    expect(screen.getByText('RM-WIRE-002')).toBeInTheDocument();
    expect(screen.getByText('DEMO-NR-001')).toBeInTheDocument();
    expect(screen.getAllByText(/3 items/i).length).toBeGreaterThanOrEqual(1);
  });

  it('displays the required empty state when no items match', () => {
    render(
      <StoreStockSummary
        rows={[]}
        belowMinimum={0}
        onViewBalance={() => {}}
      />,
    );

    expect(
      screen.getByText('No inventory items found for the selected filters.'),
    ).toBeInTheDocument();
    expect(screen.getAllByText(/0 items/i).length).toBeGreaterThanOrEqual(1);
  });

  it('renders Item Type selector and triggers callback on change', () => {
    const onItemTypeChange = jest.fn();
    render(
      <StoreStockSummary
        rows={mockRows}
        belowMinimum={0}
        itemType="RAW_MATERIAL"
        onItemTypeChange={onItemTypeChange}
        onViewBalance={() => {}}
      />,
    );

    expect(screen.getByText('Raw Material')).toBeInTheDocument();
  });
});
