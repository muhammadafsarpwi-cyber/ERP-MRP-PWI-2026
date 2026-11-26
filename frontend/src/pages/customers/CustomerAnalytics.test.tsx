import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import CustomerAnalytics from './CustomerAnalytics';
import apiService from '../../services/api';
import { tabSessionCache } from '../../services/tabSessionCache';
import { SPOKE_DIVISION_DEFAULT_ID } from './safetyStockBufferUtils';

jest.setTimeout(60000);

jest.mock('../../services/api', () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
  },
}));

const DIV_SPOKE = SPOKE_DIVISION_DEFAULT_ID;
const DIV_CABLE = 'd1000000-0000-0000-0000-000000000002';

const DIVISIONS = [
  { id: DIV_SPOKE, divisionCode: 'DIV-001-SPI', name: 'Spoke Division' },
  { id: DIV_CABLE, divisionCode: 'DIV-002-CCD', name: 'Control Cable Division' },
];

const SPOKE_ORDERS = [
  {
    id: 'so-spk-1',
    orderNumber: 'SOC-2026-05801',
    divisionId: DIV_SPOKE,
    division: { id: DIV_SPOKE, divisionCode: 'DIV-001-SPI', name: 'Spoke Division' },
    customerId: 'cust-spk-1',
    customer: { id: 'cust-spk-1', customerCode: 'CUS-ASA-005', customerName: 'ALI SHAH AUTOS' },
    orderDate: '2026-11-10',
    status: 'CONFIRMED',
    items: [
      {
        id: 'soi-spk-1',
        itemId: 'item-spk-1',
        quantity: 200,
        unitPrice: 500,
        uomCode: 'GRS',
        item: {
          id: 'item-spk-1',
          itemCode: 'SPI-FG-SPK-001',
          itemName: '10G-185MM Spoke Butted',
          salesUomCode: 'GRS',
          uomCode: 'GRS',
          packagingSize: 10,
          packagingUnit: 'Carton',
        },
      },
    ],
  },
];

const CABLE_ORDERS = [
  {
    id: 'so-ccd-1',
    orderNumber: 'SOC-2026-06101',
    divisionId: DIV_CABLE,
    division: { id: DIV_CABLE, divisionCode: 'DIV-002-CCD', name: 'Control Cable Division' },
    customerId: 'cust-ccd-1',
    customer: { id: 'cust-ccd-1', customerCode: 'CUS-MTR-009', customerName: 'METRO CABLES' },
    orderDate: '2026-11-15',
    status: 'CONFIRMED',
    items: [
      {
        id: 'soi-ccd-1',
        itemId: 'item-ccd-1',
        quantity: 10000,
        unitPrice: 15,
        uomCode: 'M',
        item: {
          id: 'item-ccd-1',
          itemCode: 'CCD-FG-BRK-001',
          itemName: 'Brake Cable 100M Coil',
          salesUomCode: 'M',
          uomCode: 'M',
          packagingSize: 100,
          packagingUnit: 'Coil',
        },
      },
    ],
  },
];

function buildMockApiImplementation() {
  return jest.fn((url: string) => {
    const isSpokeQuery = url.includes(`divisionId=${DIV_SPOKE}`);
    const isCableQuery = url.includes(`divisionId=${DIV_CABLE}`);
    const orders = isSpokeQuery
      ? SPOKE_ORDERS
      : isCableQuery
      ? CABLE_ORDERS
      : [...SPOKE_ORDERS, ...CABLE_ORDERS];

    if (url.startsWith('/sales/orders/meta/customers')) {
      return Promise.resolve({
        data: orders.map((o) => o.customer),
      });
    }
    if (url.startsWith('/sales/orders')) {
      return Promise.resolve({ data: orders });
    }
    if (url.startsWith('/sales/deliveries')) {
      return Promise.resolve({ data: [] });
    }
    if (url.startsWith('/customer/customers')) {
      return Promise.resolve({
        data: orders.map((o) => o.customer),
      });
    }
    if (url.startsWith('/production/entries')) {
      return Promise.resolve({ data: [] });
    }
    if (url.startsWith('/production/open-stock/history')) {
      if (isCableQuery) {
        return Promise.resolve({
          data: [
            {
              id: 'os-ccd-1',
              itemId: 'item-ccd-1',
              itemCode: 'CCD-FG-BRK-001',
              itemName: 'Brake Cable 100M Coil',
              divisionId: DIV_CABLE,
              divisionCode: 'DIV-002-CCD',
              divisionName: 'Control Cable Division',
              quantity: 500,
              uomCode: 'M',
              packagingSize: 100,
              packagingUnit: 'Coil',
              customerName: 'SAFETY STOCK (CCD)',
              isSafetyStock: true,
            },
          ],
        });
      }
      return Promise.resolve({ data: [] });
    }
    if (url.startsWith('/production/open-stock/matrix')) {
      return Promise.resolve({ data: [] });
    }
    if (url.startsWith('/production/open-stock/items')) {
      const items = orders.flatMap((o) =>
        o.items.map((li) => ({
          ...li.item,
          divisionId: o.divisionId,
          division: o.division,
        })),
      );
      return Promise.resolve({ data: items });
    }
    if (url.startsWith('/divisions')) {
      return Promise.resolve({ data: DIVISIONS });
    }
    if (url.startsWith('/master-data/uom-conversions')) {
      return Promise.resolve({ data: [] });
    }
    return Promise.resolve({ data: [] });
  });
}

async function selectTopDivisionOption(container: HTMLElement, optionText: string) {
  const sel = container.querySelector('.ca-header-division-filter .ant-select') as HTMLElement;
  expect(sel).not.toBeNull();
  fireEvent.mouseDown(sel.querySelector('.ant-select-selector') as HTMLElement);
  const matches = await screen.findAllByText(
    optionText,
    { selector: '.ant-select-item-option-content, .ant-select-item-option-content *' },
    { timeout: 10000 },
  );
  fireEvent.click(matches[matches.length - 1]);
  await waitFor(
    () => {
      expect(sel.querySelector('.ant-select-selection-item')?.textContent ?? '').toContain(
        optionText,
      );
    },
    { timeout: 10000 },
  );
}

describe('CustomerAnalytics Division Selector, Dynamic Units & Caching', () => {
  beforeAll(() => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: (query: string) => ({
        matches: query.includes('min-width'),
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }),
    });
    (global as any).ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  });

  beforeEach(() => {
    jest.clearAllMocks();
    tabSessionCache.clear();
    (apiService.get as jest.Mock).mockImplementation(buildMockApiImplementation());
  });

  it('defaults strictly to Spoke Division, keeps a single header selector, scopes API requests, and switches to Control Cable (M/COIL) while caching master lookups', async () => {
    const { container } = render(
      <MemoryRouter initialEntries={['/customers/analytics']}>
        <CustomerAnalytics />
      </MemoryRouter>,
    );

    await waitFor(
      () => {
        expect(screen.getAllByText('ALI SHAH AUTOS').length).toBeGreaterThan(0);
      },
      { timeout: 15000 },
    );

    // Only ONE division selector in the top header (no duplicate in Safety Stock Buffer dock)
    const divisionSelectors = screen.getAllByRole('combobox', {
      name: 'Filter Customer Analytics by division',
    });
    expect(divisionSelectors).toHaveLength(1);
    expect(
      container.querySelectorAll('.ca-header-actions .ca-header-division-filter .ant-select'),
    ).toHaveLength(1);
    expect(container.querySelector('.ca-safety-dock-controls .ant-select')).toBeNull();

    // Initial mount fetched strictly Spoke Division, NOT unfiltered All Divisions
    const initialCalls = (apiService.get as jest.Mock).mock.calls.map((c) => String(c[0]));
    expect(initialCalls).toEqual(
      expect.arrayContaining([
        expect.stringContaining(`/sales/orders?limit=500&status=all&divisionId=${DIV_SPOKE}`),
        expect.stringContaining(`/sales/deliveries?limit=500&status=all&divisionId=${DIV_SPOKE}`),
        expect.stringContaining(
          `/production/entries?machineNo=HAND-PACK&limit=500&allDates=true&divisionId=${DIV_SPOKE}`,
        ),
      ]),
    );
    expect(screen.queryByText('METRO CABLES')).not.toBeInTheDocument();
    expect(screen.getAllByText(/200 GRS/i).length).toBeGreaterThan(0);

    // Switch top Division dropdown to Control Cable Division (M / COIL)
    await selectTopDivisionOption(container, 'Control Cable Division');

    await waitFor(
      () => {
        expect(screen.getAllByText('METRO CABLES').length).toBeGreaterThan(0);
      },
      { timeout: 15000 },
    );
    expect(screen.queryByText('ALI SHAH AUTOS')).not.toBeInTheDocument();
    expect(screen.getAllByText(/10,000 M/i).length).toBeGreaterThan(0);

    // Master lookups (/divisions, /master-data/uom-conversions) cached on client after initial mount
    const allCallsAfterCable = (apiService.get as jest.Mock).mock.calls.map((c) => String(c[0]));
    expect(allCallsAfterCable.filter((u) => u.startsWith('/divisions'))).toHaveLength(1);
    expect(
      allCallsAfterCable.filter((u) => u.startsWith('/master-data/uom-conversions')),
    ).toHaveLength(1);
  });

  it('supports All Divisions mixed units, serves revisited divisions from sticky session cache, and invalidates on Refresh', async () => {
    const { container } = render(
      <MemoryRouter initialEntries={['/customers/analytics']}>
        <CustomerAnalytics />
      </MemoryRouter>,
    );

    await waitFor(
      () => {
        expect(screen.getAllByText('ALI SHAH AUTOS').length).toBeGreaterThan(0);
      },
      { timeout: 15000 },
    );

    // Switch to All Divisions -> shows mixed customers across both divisions without merging GRS + M
    await selectTopDivisionOption(container, 'All Divisions');

    await waitFor(
      () => {
        expect(screen.getAllByText('ALI SHAH AUTOS').length).toBeGreaterThan(0);
        expect(screen.getAllByText('METRO CABLES').length).toBeGreaterThan(0);
      },
      { timeout: 15000 },
    );

    const ordersCountBeforeSpokeRevisit = (apiService.get as jest.Mock).mock.calls
      .map((c) => String(c[0]))
      .filter((u) => u.startsWith('/sales/orders?')).length;

    // Switch back to Spoke Division -> instantaneous sticky client cache hit (zero new /sales/orders requests)
    await selectTopDivisionOption(container, 'Spoke Division');

    await waitFor(
      () => {
        expect(screen.queryByText('METRO CABLES')).not.toBeInTheDocument();
      },
      { timeout: 15000 },
    );
    const ordersCountAfterSpokeRevisit = (apiService.get as jest.Mock).mock.calls
      .map((c) => String(c[0]))
      .filter((u) => u.startsWith('/sales/orders?')).length;
    expect(ordersCountAfterSpokeRevisit).toBe(ordersCountBeforeSpokeRevisit);

    // Manual Refresh button clears division snapshot cache and re-fetches Spoke Division
    const refreshBtn = container.querySelector('.ca-refresh-btn') as HTMLElement;
    expect(refreshBtn).not.toBeNull();
    fireEvent.click(refreshBtn);
    await waitFor(
      () => {
        const ordersCountAfterRefresh = (apiService.get as jest.Mock).mock.calls
          .map((c) => String(c[0]))
          .filter((u) => u.startsWith('/sales/orders?')).length;
        expect(ordersCountAfterRefresh).toBe(ordersCountBeforeSpokeRevisit + 1);
      },
      { timeout: 15000 },
    );
  });

  it('prevents 4-digit legacy SOC double-counting, Draft-SOC packing leaks, and Safety Stock KPI pollution', async () => {
    tabSessionCache.clear();
    const forensicOrders = [
      {
        id: 'so-5810',
        orderNumber: 'SOC-2026-05810',
        divisionId: DIV_SPOKE,
        division: DIVISIONS[0],
        customerId: 'cust-cfp',
        customer: { id: 'cust-cfp', customerCode: 'CUS-CFP-001', customerName: 'CROWN FIT PAKISTAN' },
        orderDate: '2026-10-01',
        status: 'Delivered',
        items: [
          {
            id: 'soi-5810-1',
            itemId: 'item-006',
            quantity: 3000,
            uomCode: 'GRS',
            item: {
              id: 'item-006',
              itemCode: 'SPI-FG-SPK-006',
              name: '300X17 S9 Inn / Out Spoke Straight__125-S9 Nipple',
              salesUomCode: 'GRS',
              packagingSize: 10,
              packagingUnit: 'Carton',
            },
          },
          {
            id: 'soi-5810-2',
            itemId: 'item-001',
            quantity: 8300,
            uomCode: 'GRS',
            item: {
              id: 'item-001',
              itemCode: 'SPI-FG-SPK-001',
              name: '250X17 INN / OUT Spoke Butted__225X17 Nipple',
              salesUomCode: 'GRS',
              packagingSize: 10,
              packagingUnit: 'Carton',
            },
          },
        ],
      },
      {
        id: 'so-5831',
        orderNumber: 'SOC-2026-05831',
        divisionId: DIV_SPOKE,
        division: DIVISIONS[0],
        customerId: 'cust-cfp',
        customer: { id: 'cust-cfp', customerCode: 'CUS-CFP-001', customerName: 'CROWN FIT PAKISTAN' },
        orderDate: '2026-11-18',
        status: 'Confirmed',
        items: [
          {
            id: 'soi-5831-1',
            itemId: 'item-006',
            quantity: 5000,
            uomCode: 'GRS',
            item: {
              id: 'item-006',
              itemCode: 'SPI-FG-SPK-006',
              name: '300X17 S9 Inn / Out Spoke Straight__125-S9 Nipple',
              salesUomCode: 'GRS',
              packagingSize: 10,
              packagingUnit: 'Carton',
            },
          },
          {
            id: 'soi-5831-2',
            itemId: 'item-002',
            quantity: 1500,
            uomCode: 'GRS',
            item: {
              id: 'item-002',
              itemCode: 'SPI-FG-SPK-002',
              name: '250X17 Inn / Out Spoke Butted__CD-250X17 Nipple',
              salesUomCode: 'GRS',
              packagingSize: 10,
              packagingUnit: 'Carton',
            },
          },
        ],
      },
      {
        id: 'so-5806',
        orderNumber: 'SOC-2026-05806',
        divisionId: DIV_SPOKE,
        division: DIVISIONS[0],
        customerId: 'cust-asa',
        customer: { id: 'cust-asa', customerCode: 'CUS-ASA-001', customerName: 'ALI SHAH AUTOS' },
        orderDate: '2026-10-15',
        status: 'Processing',
        items: [
          {
            id: 'soi-5806-11',
            itemId: 'item-011',
            quantity: 6544.72,
            uomCode: 'GRS',
            item: {
              id: 'item-011',
              itemCode: 'SPI-FG-SPK-011',
              name: '300X17 S9 Inn / Out Spoke Straight (CS)__125-S9 Nipple (CS)',
              salesUomCode: 'GRS',
              packagingSize: 10.556,
              packagingUnit: 'Carton',
            },
          },
        ],
      },
      {
        id: 'so-5832-draft',
        orderNumber: 'SOC-2026-05832',
        divisionId: DIV_SPOKE,
        division: DIVISIONS[0],
        customerId: 'cust-asa',
        customer: { id: 'cust-asa', customerCode: 'CUS-ASA-001', customerName: 'ALI SHAH AUTOS' },
        orderDate: '2026-11-24',
        status: 'Draft',
        items: [
          {
            id: 'soi-5832-6',
            itemId: 'item-006',
            quantity: 10000,
            uomCode: 'GRS',
            item: { id: 'item-006', itemCode: 'SPI-FG-SPK-006', name: '300X17 S9 Inn / Out Spoke Straight__125-S9 Nipple', salesUomCode: 'GRS', packagingSize: 10 },
          },
        ],
      },
    ];

    const forensicDeliveries = [
      {
        id: 'dn-3',
        deliveryNumber: 'DN-2026-00003',
        salesOrderId: 'so-5810',
        salesOrder: { id: 'so-5810', orderNumber: 'SOC-2026-05810', division: DIVISIONS[0] },
        customerId: 'cust-cfp',
        customer: { id: 'cust-cfp', customerCode: 'CUS-CFP-001', customerName: 'CROWN FIT PAKISTAN' },
        status: 'CONFIRMED',
        lines: [
          {
            id: 'dnl-3-1',
            quantity: 3000,
            description: '300X17 S9 [SOC: SOC-2026-5810]',
            item: { id: 'item-006', itemCode: 'SPI-FG-SPK-006', name: '300X17 S9 Inn / Out Spoke Straight__125-S9 Nipple', salesUomCode: 'GRS', packagingSize: 10 },
          },
          {
            id: 'dnl-3-2',
            quantity: 8300,
            description: '250X17 [SOC: SOC-2026-5810]',
            item: { id: 'item-001', itemCode: 'SPI-FG-SPK-001', name: '250X17 INN / OUT Spoke Butted__225X17 Nipple', salesUomCode: 'GRS', packagingSize: 10 },
          },
        ],
      },
      {
        id: 'dn-6',
        deliveryNumber: 'DN-2026-00006',
        salesOrderId: 'so-5806',
        salesOrder: { id: 'so-5806', orderNumber: 'SOC-2026-05806', division: DIVISIONS[0] },
        customerId: 'cust-asa',
        customer: { id: 'cust-asa', customerCode: 'CUS-ASA-001', customerName: 'ALI SHAH AUTOS' },
        status: 'CONFIRMED',
        lines: [
          {
            id: 'dnl-6-1',
            quantity: 3114.02,
            description: '300X17 S9 (CS) [SOC: SOC-2026-05806]',
            item: { id: 'item-011', itemCode: 'SPI-FG-SPK-011', name: '300X17 S9 Inn / Out Spoke Straight (CS)__125-S9 Nipple (CS)', salesUomCode: 'GRS', packagingSize: 10.556 },
          },
        ],
      },
    ];

    const forensicPackEntries = [
      {
        id: 'pe-5810-1',
        entryNumber: 'PE-5810-1',
        divisionId: DIV_SPOKE,
        actualQuantity: 8300 * 144,
        packingMode: 'FULL_SET',
        item: { id: 'item-001', itemCode: 'SPI-FG-SPK-001', name: '250X17 INN / OUT Spoke Butted__225X17 Nipple', packagingSize: 10 },
        remarks: '[HAND PACKING] Batch: PKG-5810-A | SOC: SOC-2026-5810 | Customer: CROWN FIT PAKISTAN | Cartons: 830',
      },
      {
        id: 'pe-5810-2',
        entryNumber: 'PE-5810-2',
        divisionId: DIV_SPOKE,
        actualQuantity: 3000 * 144,
        packingMode: 'FULL_SET',
        item: { id: 'item-006', itemCode: 'SPI-FG-SPK-006', name: '300X17 S9 Inn / Out Spoke Straight__125-S9 Nipple', packagingSize: 10 },
        remarks: '[HAND PACKING] Batch: PKG-5810-B | SOC: SOC-2026-5810 | Customer: CROWN FIT PAKISTAN | Cartons: 300',
      },
      {
        id: 'pe-5831-006',
        entryNumber: 'PE-5831-1',
        divisionId: DIV_SPOKE,
        actualQuantity: 4000 * 144,
        packingMode: 'FULL_SET',
        item: { id: 'item-006', itemCode: 'SPI-FG-SPK-006', name: '300X17 S9 Inn / Out Spoke Straight__125-S9 Nipple', packagingSize: 10 },
        remarks: '[HAND PACKING] Batch: PKG-5831-A | SOC: SOC-2026-05831 | Customer: CROWN FIT PAKISTAN | Cartons: 400',
      },
      {
        id: 'pe-5831-002',
        entryNumber: 'PE-5831-2',
        divisionId: DIV_SPOKE,
        actualQuantity: 1000 * 144,
        packingMode: 'FULL_SET',
        item: { id: 'item-002', itemCode: 'SPI-FG-SPK-002', name: '250X17 Inn / Out Spoke Butted__CD-250X17 Nipple', packagingSize: 10 },
        remarks: '[HAND PACKING] Batch: PKG-5831-B | SOC: SOC-2026-05831 | Customer: CROWN FIT PAKISTAN | Cartons: 100',
      },
      {
        id: 'pe-5806-1',
        entryNumber: 'PE-5806-1',
        divisionId: DIV_SPOKE,
        actualQuantity: 720000, // 5,000 GRS
        packingMode: 'FULL_SET',
        item: { id: 'item-011', itemCode: 'SPI-FG-SPK-011', name: '300X17 S9 Inn / Out Spoke Straight (CS)__125-S9 Nipple (CS)', packagingSize: 10.556 },
        remarks: '[HAND PACKING] Batch: PKG-5806 | SOC: SOC-2026-05806 | Customer: ALI SHAH AUTOS | Cartons: 474',
      },
      // Draft SOC explicit packing MUST NOT leak onto SOC-2026-05806 or ALI SHAH AUTOS ready stock!
      {
        id: 'pe-5832-draft',
        entryNumber: 'PE-5832-1',
        divisionId: DIV_SPOKE,
        actualQuantity: 500 * 144,
        packingMode: 'FULL_SET',
        item: { id: 'item-006', itemCode: 'SPI-FG-SPK-006', name: '300X17 S9 Inn / Out Spoke Straight__125-S9 Nipple', packagingSize: 10 },
        remarks: '[HAND PACKING] Batch: PKG-5832 | SOC: SOC-2026-05832 | Customer: ALI SHAH AUTOS | Cartons: 50',
      },
      // Safety Stock MUST NOT inflate Ordered Demand or Customer Ready KPIs!
      {
        id: 'pe-safety',
        entryNumber: 'PE-SAFE-1',
        divisionId: DIV_SPOKE,
        actualQuantity: 1000 * 144,
        packingMode: 'FULL_SET',
        item: { id: 'item-006', itemCode: 'SPI-FG-SPK-006', name: '300X17 S9 Inn / Out Spoke Straight__125-S9 Nipple', packagingSize: 10 },
        remarks: '[HAND PACKING] Batch: PKG-SAFE | SOC: SAFETY_STOCK | Customer: SAFETY STOCK | Cartons: 100',
      },
    ];

    (apiService.get as jest.Mock).mockImplementation((url: string) => {
      if (url.startsWith('/sales/orders/meta/customers')) {
        return Promise.resolve({ data: forensicOrders.map((o) => o.customer) });
      }
      if (url.startsWith('/sales/orders')) {
        return Promise.resolve({ data: forensicOrders });
      }
      if (url.startsWith('/sales/deliveries')) {
        return Promise.resolve({ data: forensicDeliveries });
      }
      if (url.startsWith('/customer/customers')) {
        return Promise.resolve({ data: forensicOrders.map((o) => o.customer) });
      }
      if (url.startsWith('/production/entries')) {
        return Promise.resolve({ data: forensicPackEntries });
      }
      if (url.startsWith('/production/open-stock/history')) {
        return Promise.resolve({ data: [] });
      }
      if (url.startsWith('/production/open-stock/matrix')) {
        return Promise.resolve({ data: [] });
      }
      if (url.startsWith('/production/open-stock/items')) {
        return Promise.resolve({
          data: forensicOrders.flatMap((o) => o.items.map((i) => ({ ...i.item, divisionId: DIV_SPOKE }))),
        });
      }
      if (url.startsWith('/divisions')) {
        return Promise.resolve({ data: DIVISIONS });
      }
      return Promise.resolve({ data: [] });
    });

    const { container } = render(
      <MemoryRouter initialEntries={['/customers/analytics']}>
        <CustomerAnalytics />
      </MemoryRouter>,
    );

    await waitFor(
      () => {
        expect(screen.getAllByText('CROWN FIT PAKISTAN').length).toBeGreaterThan(0);
        expect(screen.getAllByText('ALI SHAH AUTOS').length).toBeGreaterThan(0);
      },
      { timeout: 15000 },
    );

    // Top 7 KPIs strictly reflect regular committed orders ONLY (Safety 1,000 GRS & Draft 05832 excluded):
    // Ordered = 17,800 (CROWN) + 6,544.72 (ALI) = 24,344.72 GRS -> 24,344.72 or 24,345
    // Dispatched = 11,300 (CROWN) + 3,114.02 (ALI) = 14,414.02 GRS (NO fake +3,000/+8,300 double-count on CROWN FIT!)
    // Ready = 5,000 (CROWN) + 1,886.11 (ALI) = 6,886.11 GRS (NO Draft leakage, NO Safety inflation!)
    const kpiValues = Array.from(container.querySelectorAll('.action-kpi-card')).map((el) => el.textContent || '');
    const joinedKpis = kpiValues.join(' | ');
    expect(joinedKpis).toMatch(/24,344\.72|24,345/); // 17,800 + 6,544.72
    expect(joinedKpis).toMatch(/14,414\.02|14,414/); // 11,300 + 3,114.02
    expect(joinedKpis).toMatch(/6,886\.11|6,886/); // 5,000 + 1,886.11
    expect(joinedKpis).not.toContain('25,345'); // Did NOT add 1,000 Safety into Ordered Demand!
    expect(joinedKpis).not.toContain('25,344'); // Did NOT add 1,000 Safety into Ordered Demand!
    expect(joinedKpis).not.toContain('25,714'); // Did NOT double-count CROWN 05810!
    // Total Orders = 3 (2 CROWN FIT + 1 ALI SHAH, NOT including Draft SOC-2026-05832 or Safety batches)
    const totalOrdersCard = kpiValues.find((t) => t.includes('Total Orders')) || '';
    expect(totalOrdersCard).toContain('3Total Orders');
  });

  it('ignores and purges legacy v1 sessionStorage cache on mount and ignores OUT/adjustment/non-FG open-stock history rows', async () => {
    // Seed stale pre-fix v1 snapshot in sessionStorage (simulating an open browser tab before code update)
    window.sessionStorage.setItem(
      `erp_tab_session_customer_analytics_snapshot_v1_${DIV_SPOKE}`,
      JSON.stringify({
        timestamp: Date.now(),
        data: {
          customers: [
            {
              id: 'stale-cust',
              customerCode: 'STALE',
              name: 'STALE CACHED CUSTOMER 99999',
              customerType: 'B2B',
              totalOrders: 99,
              totalOrderedGross: 99999,
              totalDispatchedGross: 88888,
              totalDispatchedCartons: 8888,
              totalOrderValue: 0,
              pendingGross: 11111,
              fulfillmentPct: 89,
              readyToDispatchGross: 0,
              readyToDispatchCartons: 0,
              totalPackedGross: 88888,
              totalPackedCartons: 8888,
            },
          ],
          itemStats: [],
          safetyDivisions: DIVISIONS,
          safetyBatchesMeta: [],
          divisionOptions: DIVISIONS,
          fetchedAt: Date.now(),
        },
      }),
    );

    const baseMock = buildMockApiImplementation();
    (apiService.get as jest.Mock).mockImplementation((url: string) => {
      if (url.startsWith('/production/open-stock/history')) {
        return Promise.resolve({
          data: [
            {
              id: 'os-adj-out',
              referenceType: 'PRODUCTION_STOCK_ADJUSTMENT',
              transactionType: 'ADJUSTMENT_OUT',
              direction: 'OUT',
              quantity: 50000,
              uomCode: 'GRS',
              itemType: 'FINISHED_GOOD',
              warehouseCode: 'SPI-FGDW-007',
              itemCode: 'SPI-FG-SPK-001',
              notes: 'Customer: ALI SHAH AUTOS | SOC: SOC-2026-05801',
            },
            {
              id: 'os-nipple-fg',
              referenceType: 'PRODUCTION_ITEM_OPEN_STOCK',
              transactionType: 'OPENING',
              direction: 'IN',
              quantity: 72000,
              uomCode: 'PCS',
              itemType: 'FINISHED_GOOD',
              warehouseCode: 'SPI-NP-006',
              itemCode: 'FG-NP-001',
              notes: '(120 Kg @ 360 Rs/Kg)',
            },
          ],
        });
      }
      return baseMock(url);
    });

    render(
      <MemoryRouter initialEntries={['/customers/analytics']}>
        <CustomerAnalytics />
      </MemoryRouter>,
    );

    await waitFor(
      () => {
        expect(screen.getAllByText('ALI SHAH AUTOS').length).toBeGreaterThan(0);
      },
      { timeout: 15000 },
    );

    // Legacy v1 cache must be ignored AND removed from sessionStorage
    expect(screen.queryByText('STALE CACHED CUSTOMER 99999')).not.toBeInTheDocument();
    expect(
      window.sessionStorage.getItem(`erp_tab_session_customer_analytics_snapshot_v1_${DIV_SPOKE}`),
    ).toBeNull();
    // OUT / adjustment open-stock row must NOT inflate ALI SHAH AUTOS packed/ready above 100 GRS
    expect(screen.queryByText(/50,000/)).not.toBeInTheDocument();
  });
});
