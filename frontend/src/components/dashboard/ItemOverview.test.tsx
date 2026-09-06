import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import ItemOverview from './ItemOverview';
import type { ItemOverview as ItemOverviewType } from '../../services/dashboardService';

const base = (over: Partial<ItemOverviewType> = {}): ItemOverviewType => ({
  id: 'i-1',
  itemCode: 'RM-WIRE-120',
  name: '1.20mm Wire',
  departmentName: 'Wire Drawing',
  itemType: 'RAW_MATERIAL',
  status: 'ACTIVE',
  isManufacturable: true,
  isPurchasable: false,
  isSellable: false,
  costPrice: 10,
  sellingPrice: null,
  minimumStockLevel: 5,
  maximumStockLevel: null,
  reorderLevel: 2,
  stock: { onHand: 40, reserved: 2, available: 38 },
  production: { entryCount: 12, totalActual: 480 },
  ...over,
});

const renderOverview = (items: ItemOverviewType[]) =>
  render(
    <ItemOverview
      items={items}
      loading={false}
      search=""
      onSearch={() => {}}
      onOpen={() => {}}
      nav={() => {}}
    />
  );

describe('Item Overview — null-safe rendering (TASK #39 Part K)', () => {
  it('K1: never crashes when stock / production are missing (backend null edge)', () => {
    const missing = base({ stock: undefined as any, production: undefined as any });
    renderOverview([missing]);
    expect(screen.getByText('RM-WIRE-120')).toBeInTheDocument();
    expect(screen.getByText('1.20mm Wire')).toBeInTheDocument();
    // stockHealth falls back to healthy and zeros render safely.
    expect(screen.getAllByText('0').length).toBeGreaterThan(0);
  });

  it('K2: renders real stock + production figures when present', () => {
    renderOverview([base()]);
    expect(screen.getByText('40')).toBeInTheDocument();
    expect(screen.getByText('38')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
  });

  it('K3: health chip marks low stock against the minimum level', () => {
    renderOverview([base({ stock: { onHand: 3, reserved: 1, available: 2 } })]);
    expect(screen.getByText('3')).toHaveClass('erp-num--danger');
  });

  it('K4: row click still calls onOpen when fields are null', () => {
    const onOpen = jest.fn();
    render(
      <ItemOverview
        items={[base({ stock: undefined as any })]}
        loading={false}
        search=""
        onSearch={() => {}}
        onOpen={onOpen}
        nav={() => {}}
      />
    );
    fireEvent.click(screen.getByText('RM-WIRE-120'));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('K5: shows a plain empty state instead of crashing on an empty list', () => {
    renderOverview([]);
    expect(screen.getByText(/No item data is available for this selection/i)).toBeInTheDocument();
  });
});