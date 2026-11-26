import '@testing-library/jest-dom';
import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { App as AntdApp } from 'antd';
import SalesDeliveryManagement from './SalesDeliveryManagement';
import apiService from '../../services/api';
import { tabSessionCache } from '../../services/tabSessionCache';

jest.mock('../../services/api', () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
    post: jest.fn(),
    patch: jest.fn(),
    delete: jest.fn(),
  },
}));

jest.mock('../../services/lookupsCache', () => ({
  __esModule: true,
  getLookupsSnapshot: () => ({
    divisions: [
      { id: 'div-ccd', divisionCode: 'DIV-002-CCD', name: 'Control Cable Division' },
      { id: 'div-spk', divisionCode: 'DIV-001-SD', name: 'Spoke Division' },
    ],
    warehouses: [
      { id: 'wh-ccd', warehouseCode: 'CCD-FGDW', name: 'CCD Finished Goods Warehouse', divisionId: 'div-ccd' },
    ],
    customers: [
      { id: 'cust-ccd', customerCode: 'CUS-CCD-01', companyName: 'SUZUKI MOTOR CORP', name: 'SUZUKI MOTOR CORP', divisionId: 'div-ccd' },
    ],
  }),
  prefetchAllLookups: jest.fn().mockResolvedValue({
    divisions: [
      { id: 'div-ccd', divisionCode: 'DIV-002-CCD', name: 'Control Cable Division' },
      { id: 'div-spk', divisionCode: 'DIV-001-SD', name: 'Spoke Division' },
    ],
    warehouses: [
      { id: 'wh-ccd', warehouseCode: 'CCD-FGDW', name: 'CCD Finished Goods Warehouse', divisionId: 'div-ccd' },
    ],
  }),
  fetchCachedCustomers: jest.fn().mockResolvedValue([
    { id: 'cust-ccd', customerCode: 'CUS-CCD-01', companyName: 'SUZUKI MOTOR CORP', name: 'SUZUKI MOTOR CORP', divisionId: 'div-ccd' },
  ]),
}));

jest.mock('../../utils/printTemplates', () => ({
  __esModule: true,
  printDeliveryNoteDocument: jest.fn(),
  printTableList: jest.fn(),
  printGatePassDocument: jest.fn(),
}));

const mockedApi = apiService as jest.Mocked<typeof apiService>;

const SOC_5882_ORDER = {
  id: 'soc-5882',
  orderNumber: 'SOC-2026-05882',
  customerId: 'cust-ccd',
  divisionId: 'div-ccd',
  division: { id: 'div-ccd', divisionCode: 'DIV-002-CCD', name: 'Control Cable Division' },
  items: [
    {
      id: 'soi-3',
      itemId: 'item-003',
      quantity: 10000, // 40 Coils
      uom: { code: 'M' },
      item: { id: 'item-003', itemCode: 'CCD-FGR-003', name: 'Clutch Cable CD-70', packagingSize: 250, packagingUnit: 'Coils' },
    },
    {
      id: 'soi-2',
      itemId: 'item-002',
      quantity: 9000, // 36 Coils
      uom: { code: 'M' },
      item: { id: 'item-002', itemCode: 'CCD-FGR-002', name: 'Front Brake Cable CD-70', packagingSize: 250, packagingUnit: 'Coils' },
    },
    {
      id: 'soi-11',
      itemId: 'item-011',
      quantity: 8000, // 32 Coils
      uom: { code: 'M' },
      item: { id: 'item-011', itemCode: 'CCD-FGR-011', name: 'Throttle Cable CG-125', packagingSize: 250, packagingUnit: 'Coils' },
    },
    {
      id: 'soi-1',
      itemId: 'item-001',
      quantity: 6000, // 24 Coils
      uom: { code: 'M' },
      item: { id: 'item-001', itemCode: 'CCD-FGR-001', name: 'Speedometer Cable CD-70', packagingSize: 250, packagingUnit: 'Coils' },
    },
  ],
};

/**
 * Deliberately simulates retroactive overall totals (`totalDeliveredQuantity: 33000`, `totalBalanceQuantity: 0`,
 * `isCompleted: true`) AND missing item-level `orderedQuantity` (`0`) on raw payload so we prove the frontend
 * strictly computes chronological point-in-time progress (40 -> 108 -> 132 Coils; 30% -> 82% -> 100%)
 * and hydrates true item-level Ordered / Prev / Cum / Bal from `salesOrder.items`!
 */
const buildMultiItemDelivery = (opts: {
  id: string;
  deliveryNumber: string;
  gatePassNumber: string;
  deliveryDate: string;
  embedOrderItems: boolean;
  linesSpec: Array<{ itemId: string; itemCode: string; itemName: string; qty: number; coils: number }>;
}) => {
  const dispQty = opts.linesSpec.reduce((s, l) => s + l.qty, 0);
  const dispCoils = opts.linesSpec.reduce((s, l) => s + l.coils, 0);
  return {
    id: opts.id,
    deliveryNumber: opts.deliveryNumber,
    gatePassNumber: opts.gatePassNumber,
    salesOrderId: 'soc-5882',
    salesOrderNumber: 'SOC-2026-05882',
    salesOrderNumbers: ['SOC-2026-05882'],
    salesOrder: opts.embedOrderItems
      ? SOC_5882_ORDER
      : {
          id: 'soc-5882',
          orderNumber: 'SOC-2026-05882',
          divisionId: 'div-ccd',
          division: { id: 'div-ccd', divisionCode: 'DIV-002-CCD', name: 'Control Cable Division' },
        },
    customerId: 'cust-ccd',
    companyName: 'SUZUKI MOTOR CORP',
    divisionId: 'div-ccd',
    divisionCode: 'DIV-002-CCD',
    divisionName: 'Control Cable Division',
    warehouseId: 'wh-ccd',
    deliveryDate: opts.deliveryDate,
    expectedDate: opts.deliveryDate,
    carrier: 'PWI Fleet',
    trackingNumber: 'LHR-9901',
    status: 'CONFIRMED',
    subtotal: dispQty * 100,
    taxAmount: dispQty * 18,
    totalAmount: dispQty * 118,
    // Simulate stale retroactive overall totals that previously caused Bug #1
    totalOrderQuantity: 33000,
    totalOrderCartons: 132,
    totalDispatchQuantity: dispQty,
    totalDispatchCartons: dispCoils,
    totalDeliveredQuantity: 33000,
    totalDeliveredCartons: 132,
    totalBalanceQuantity: 0,
    totalBalanceCartons: 0,
    completionPercent: 100,
    isCompleted: true,
    itemsSummary: opts.linesSpec.map((ls) => ({
      itemId: ls.itemId,
      itemCode: ls.itemCode,
      itemName: ls.itemName,
      socNumber: 'SOC-2026-05882',
      uom: 'M',
      packagingUnit: 'Coils',
      packagingSize: 250,
      orderedQuantity: 0, // Simulate missing item-level orderedQuantity that previously caused Bug #2 (`Ordered: —`)
      orderedCartons: 0,
      dispatchedQuantity: ls.qty,
      dispatchedCartons: ls.coils,
      totalShippedQuantity: ls.qty,
      totalShippedCartons: ls.coils,
      balanceQuantity: 0,
      balanceCartons: 0,
      isCompleted: true,
    })),
    lines: opts.linesSpec.map((ls, i) => ({
      id: `${opts.id}-l-${i}`,
      itemId: ls.itemId,
      itemCode: ls.itemCode,
      description: `${ls.itemName} [SOC: SOC-2026-05882]`,
      quantity: ls.qty,
      uomCode: 'M',
      packagingUnit: 'Coils',
      packagingSize: 250,
      unitPrice: 100,
      taxAmount: ls.qty * 18,
      lineTotal: ls.qty * 118,
    })),
  };
};

const buildSampleDeliveries = (embedOrderItems: boolean) => [
  // Returned in reverse order (newest first, like API default DESC) to verify chronological sorting!
  buildMultiItemDelivery({
    id: 'dn-88',
    deliveryNumber: 'DN-2026-00088',
    gatePassNumber: 'GP-0088',
    deliveryDate: '2026-11-22',
    embedOrderItems,
    linesSpec: [
      { itemId: 'item-002', itemCode: 'CCD-FGR-002', itemName: 'Front Brake Cable CD-70', qty: 2000, coils: 8 },
      { itemId: 'item-011', itemCode: 'CCD-FGR-011', itemName: 'Throttle Cable CG-125', qty: 1000, coils: 4 },
      { itemId: 'item-001', itemCode: 'CCD-FGR-001', itemName: 'Speedometer Cable CD-70', qty: 3000, coils: 12 },
    ], // 24 Coils (6,000 M) -> Cumulative 132 / 132 Coils (100% Complete), Bal 0
  }),
  buildMultiItemDelivery({
    id: 'dn-87',
    deliveryNumber: 'DN-2026-00087',
    gatePassNumber: 'GP-0087',
    deliveryDate: '2026-11-21',
    embedOrderItems,
    linesSpec: [
      { itemId: 'item-003', itemCode: 'CCD-FGR-003', itemName: 'Clutch Cable CD-70', qty: 6000, coils: 24 },
      { itemId: 'item-002', itemCode: 'CCD-FGR-002', itemName: 'Front Brake Cable CD-70', qty: 4000, coils: 16 },
      { itemId: 'item-011', itemCode: 'CCD-FGR-011', itemName: 'Throttle Cable CG-125', qty: 4000, coils: 16 },
      { itemId: 'item-001', itemCode: 'CCD-FGR-001', itemName: 'Speedometer Cable CD-70', qty: 3000, coils: 12 },
    ], // 68 Coils (17,000 M) -> Cumulative 108 / 132 Coils (82%), Bal 24 Coils (6,000 M)
  }),
  buildMultiItemDelivery({
    id: 'dn-86',
    deliveryNumber: 'DN-2026-00086',
    gatePassNumber: 'GP-0086',
    deliveryDate: '2026-11-20',
    embedOrderItems,
    linesSpec: [
      { itemId: 'item-003', itemCode: 'CCD-FGR-003', itemName: 'Clutch Cable CD-70', qty: 4000, coils: 16 },
      { itemId: 'item-002', itemCode: 'CCD-FGR-002', itemName: 'Front Brake Cable CD-70', qty: 3000, coils: 12 },
      { itemId: 'item-011', itemCode: 'CCD-FGR-011', itemName: 'Throttle Cable CG-125', qty: 3000, coils: 12 },
    ], // 40 Coils (10,000 M) -> Cumulative 40 / 132 Coils (30%), Bal 92 Coils (23,000 M)
  }),
];

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={['/sales/deliveries']}>
      <AntdApp>
        <SalesDeliveryManagement />
      </AntdApp>
    </MemoryRouter>,
  );

describe('SalesDeliveryManagement chronological point-in-time progress & itemized breakdown', () => {
  beforeAll(() => {
    window.matchMedia =
      window.matchMedia ||
      ((query: string) =>
        ({
          matches: false,
          media: query,
          onchange: null,
          addListener: jest.fn(),
          removeListener: jest.fn(),
          addEventListener: jest.fn(),
          removeEventListener: jest.fn(),
          dispatchEvent: jest.fn(),
        } as any));
    window.scrollTo = jest.fn();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    tabSessionCache.clear();
  });

  test('computes strict point-in-time 30% / 82% / 100% progress and exact item Ordered & Prev on DN-00086/87/88', async () => {
    const sampleWithEmbeddedItems = buildSampleDeliveries(true);
    mockedApi.get.mockImplementation(async (url: string) => {
      if (url === '/sales/deliveries') {
        return {
          data: sampleWithEmbeddedItems,
          total: sampleWithEmbeddedItems.length,
          nextGatePassNumber: 'GP-0089',
        };
      }
      if (url === '/sales/orders/meta/customers') {
        return { data: [] };
      }
      return { data: [] };
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('DN-2026-00086')).toBeInTheDocument();
      expect(screen.getByText('DN-2026-00087')).toBeInTheDocument();
      expect(screen.getByText('DN-2026-00088')).toBeInTheDocument();
    });

    // When salesOrder.items is embedded on /sales/deliveries, zero /sales/orders fetch is needed on mount
    expect(mockedApi.get.mock.calls.filter(([u]) => u === '/sales/orders')).toHaveLength(0);

    // Verify Delivery #1 (DN-2026-00086): 40 Coils -> Cumulative 40 / 132 Coils (30%), Balance After: 92 Coils (23,000 M)
    const dn86Row = screen.getByText('DN-2026-00086').closest('tr')!;
    expect(within(dn86Row).getByText('40 / 132 Coils (30%)')).toBeInTheDocument();
    expect(within(dn86Row).getByText('92 Coils (23,000 M)')).toBeInTheDocument();
    expect(within(dn86Row).queryByText(/100%/)).not.toBeInTheDocument();

    // Verify Delivery #2 (DN-2026-00087): 68 Coils -> Cumulative 108 / 132 Coils (82%), Balance After: 24 Coils (6,000 M)
    const dn87Row = screen.getByText('DN-2026-00087').closest('tr')!;
    expect(within(dn87Row).getByText('108 / 132 Coils (82%)')).toBeInTheDocument();
    expect(within(dn87Row).getByText('24 Coils (6,000 M)')).toBeInTheDocument();
    expect(within(dn87Row).queryByText(/100%/)).not.toBeInTheDocument();

    // Verify Delivery #3 (DN-2026-00088): 24 Coils -> Cumulative 132 / 132 Coils (100% Complete), Balance After: 0 Coils (0 M)
    const dn88Row = screen.getByText('DN-2026-00088').closest('tr')!;
    expect(within(dn88Row).getByText('132 / 132 Coils (100% Complete)')).toBeInTheDocument();
    expect(within(dn88Row).getByText(/0 Coils \(0 M\)/)).toBeInTheDocument();

    // Hover DN-2026-00087 Quantities cell to inspect Itemized Delivery Breakdown popover
    const popoverTrigger = within(dn87Row).getByText('108 / 132 Coils (82%)');
    fireEvent.mouseOver(popoverTrigger);
    fireEvent.mouseEnter(popoverTrigger);

    await waitFor(() => {
      expect(screen.getByText('Itemized Delivery Breakdown')).toBeInTheDocument();
      expect(screen.getByText(/\[CCD-FGR-003\] Clutch Cable CD-70/)).toBeInTheDocument();
      expect(screen.getByText(/\[CCD-FGR-002\] Front Brake Cable CD-70/)).toBeInTheDocument();
    });

    // Verify zero `Ordered: —`, zero CTN/GRS, zero undefined in the popover!
    const bodyText = document.body.textContent || '';
    expect(bodyText).not.toContain('Ordered: —');
    expect(bodyText).toContain('40 Coils (10,000 M)'); // CCD-FGR-003 Ordered
    expect(bodyText).toContain('Prev: 16 Coils');      // CCD-FGR-003 Prev from DN-2026-00086
    expect(bodyText).toContain('Prev: 12 Coils');      // CCD-FGR-002 Prev from DN-2026-00086
    expect(bodyText).toContain('28 / 36 Coils (78%)'); // CCD-FGR-002 Cum
    expect(bodyText).toContain('Bal: 8 Coils (2,000 M)');
    expect(bodyText).not.toContain('undefined');
    expect(bodyText).not.toMatch(/\bCTN\b/);
    expect(bodyText).not.toMatch(/\bGRS\b/);
  });

  test('auto-hydrates SOC items when gateway omits salesOrder.items and maintains sticky v2 cache', async () => {
    const sampleWithoutEmbeddedItems = buildSampleDeliveries(false);
    mockedApi.get.mockImplementation(async (url: string) => {
      if (url === '/sales/deliveries') {
        return {
          data: sampleWithoutEmbeddedItems,
          total: sampleWithoutEmbeddedItems.length,
          nextGatePassNumber: 'GP-0089',
        };
      }
      if (url === '/sales/orders') {
        return { data: [SOC_5882_ORDER] };
      }
      return { data: [] };
    });

    const firstRender = renderPage();

    await waitFor(() => {
      expect(screen.getByText('DN-2026-00087')).toBeInTheDocument();
    });

    // Auto-hydrated /sales/orders once so item-level Ordered quantities are available
    await waitFor(() => {
      expect(mockedApi.get.mock.calls.filter(([u]) => u === '/sales/orders')).toHaveLength(1);
    });

    const dn87Row = screen.getByText('DN-2026-00087').closest('tr')!;
    const popoverTrigger = within(dn87Row).getByText('108 / 132 Coils (82%)');
    fireEvent.mouseOver(popoverTrigger);
    fireEvent.mouseEnter(popoverTrigger);

    await waitFor(() => {
      expect(screen.getByText('Itemized Delivery Breakdown')).toBeInTheDocument();
      expect(document.body.textContent || '').not.toContain('Ordered: —');
      expect(document.body.textContent || '').toContain('36 Coils (9,000 M)');
    });

    // Remount uses sticky v2 cache without duplicate API calls
    firstRender.unmount();
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('DN-2026-00086')).toBeInTheDocument();
    });
    expect(mockedApi.get.mock.calls.filter(([u]) => u === '/sales/deliveries')).toHaveLength(1);
  });
});
