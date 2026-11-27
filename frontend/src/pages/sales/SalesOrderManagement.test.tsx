import '@testing-library/jest-dom';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { App as AntdApp } from 'antd';
import SalesOrderManagement from './SalesOrderManagement';
import apiService from '../../services/api';
import { usePermission } from '../../hooks/usePermission';

jest.mock('../../services/api', () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
    post: jest.fn(),
    patch: jest.fn(),
    delete: jest.fn(),
  },
}));

jest.mock('../../hooks/usePermission', () => ({
  __esModule: true,
  usePermission: jest.fn(),
}));

jest.mock('../../utils/printTemplates', () => ({
  __esModule: true,
  printSalesOrderDocument: jest.fn(),
  printTableList: jest.fn(),
  printLoadingAdviceSlip: jest.fn(),
}));

jest.setTimeout(30000);

const mockedApi = apiService as jest.Mocked<typeof apiService>;
const mockedUsePermission = usePermission as jest.Mock;

const SAMPLE_ORDERS = [
  {
    id: '514969ab-af01-4981-ad78-19f8eaa880c1',
    orderNumber: 'SOC-2026-05298',
    customerId: 'cust-1',
    customer: { id: 'cust-1', customerCode: 'CUS-001', companyName: 'ATLAS HONDA LTD' },
    divisionId: 'div-ccd',
    division: { id: 'div-ccd', divisionCode: 'DIV-002-CCD', name: 'Control Cable Division' },
    orderDate: '2026-11-10',
    deliveryDate: '2026-11-30',
    currency: 'PKR',
    subtotal: 1690000,
    discountAmount: 0,
    taxAmount: 0,
    freightAmount: 0,
    totalAmount: 1690000,
    status: 'Delivered',
    items: [
      {
        id: 'soi-1',
        itemId: 'item-1',
        description: '5 MM PVC 2P Outer Casing',
        quantity: 24500,
        shippedQuantity: 24500,
        unitPrice: 10,
        lineTotal: 245000,
        uom: { code: 'M' },
        item: { id: 'item-1', itemCode: 'CCD-FGR-001', name: '5 MM PVC 2P Outer Casing' },
      },
      {
        id: 'soi-2',
        itemId: 'item-2',
        description: '7 MM PVC DS Outer Casing',
        quantity: 144500,
        shippedQuantity: 144500,
        unitPrice: 10,
        lineTotal: 1445000,
        uom: { code: 'M' },
        item: { id: 'item-2', itemCode: 'CCD-FGR-011', name: '7 MM PVC DS Outer Casing' },
      },
    ],
  },
  {
    id: 'a0000000-0000-0000-0000-000000005414',
    orderNumber: 'SOC-2026-05414',
    customerId: 'cust-1',
    customer: { id: 'cust-1', customerCode: 'CUS-001', companyName: 'ATLAS HONDA LTD' },
    divisionId: 'div-ccd',
    division: { id: 'div-ccd', divisionCode: 'DIV-002-CCD', name: 'Control Cable Division' },
    orderDate: '2026-11-12',
    deliveryDate: '2026-11-30',
    currency: 'PKR',
    subtotal: 500000,
    discountAmount: 0,
    taxAmount: 0,
    freightAmount: 0,
    totalAmount: 500000,
    status: 'Shipped',
    items: [],
  },
  {
    id: 'b0000000-0000-0000-0000-000000005500',
    orderNumber: 'SOC-2026-05500',
    customerId: 'cust-1',
    customer: { id: 'cust-1', customerCode: 'CUS-001', companyName: 'ATLAS HONDA LTD' },
    divisionId: 'div-ccd',
    division: { id: 'div-ccd', divisionCode: 'DIV-002-CCD', name: 'Control Cable Division' },
    orderDate: '2026-11-14',
    deliveryDate: '2026-11-30',
    currency: 'PKR',
    subtotal: 250000,
    discountAmount: 0,
    taxAmount: 0,
    freightAmount: 0,
    totalAmount: 250000,
    status: 'Processing',
    items: [],
  },
];

function mockPermissions(grantedCodes: string[]) {
  const set = new Set(grantedCodes);
  mockedUsePermission.mockReturnValue({
    user: { id: 'u-1', email: 'admin@pwi.com', displayName: 'Admin' },
    permissions: grantedCodes,
    can: (code: string) => set.has(code),
    canAny: (...codes: string[]) => codes.some((c) => set.has(c)),
    canAll: (...codes: string[]) => codes.every((c) => set.has(c)),
    canModule: () => true,
    refreshPermissions: jest.fn(),
    isLoaded: true,
    isError: false,
    divisionAccess: { unrestricted: true, items: [], permissionScopes: {} },
    allowedDivisions: [],
    allowedDivisionIds: [],
    divisionsUnrestricted: true,
    permissionDivisionScopes: {},
    canInDivision: (code: string) => set.has(code),
    roleBlocksInDivision: () => false,
  });
}

describe('SalesOrderManagement — workflow action safety & Admin Revert to Processing', () => {
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

  beforeEach(() => {
    jest.clearAllMocks();
    mockedApi.get.mockImplementation(async (url: string) => {
      if (url === '/sales/orders') {
        return { data: SAMPLE_ORDERS, total: SAMPLE_ORDERS.length };
      }
      if (url.startsWith('/sales/orders/514969ab')) {
        return { data: SAMPLE_ORDERS[0] };
      }
      if (url === '/sales/orders/meta/customers') {
        return { data: [{ id: 'cust-1', customerCode: 'CUS-001', companyName: 'ATLAS HONDA LTD' }] };
      }
      return { data: [] };
    });
    mockedApi.patch.mockResolvedValue({
      success: true,
      data: { ...SAMPLE_ORDERS[0], status: 'Processing' },
    });
  });

  it('never renders direct Mark Delivered, Ship Order, Start Processing, or Close Order buttons, and shows Revert to Processing for Admins', async () => {
    mockPermissions([
      'sales.orders.view',
      'sales.orders.create',
      'sales.orders.update',
      'sales.orders.approve',
      'sales.orders.revert_delivery',
    ]);

    render(
      <AntdApp>
        <MemoryRouter initialEntries={['/sales/orders']}>
          <SalesOrderManagement />
        </MemoryRouter>
      </AntdApp>,
    );

    await screen.findByText('SOC-2026-05298');

    // Direct status-jumping shortcuts must not exist anywhere in the table
    expect(screen.queryByRole('button', { name: /mark delivered/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /ship order/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /close order/i })).not.toBeInTheDocument();

    // Admin sees Revert to Processing on Delivered (SOC-2026-05298) and Shipped (SOC-2026-05414) orders
    const revertButtons = screen.getAllByRole('button', { name: /revert to processing/i });
    expect(revertButtons).toHaveLength(2);

    // Clicking Revert to Processing on SOC-2026-05298 opens confirmation dialog and calls /revert-delivery
    fireEvent.click(revertButtons[0]);

    await screen.findByText(/Administrator Recovery: Undo Premature Delivery Status/i);
    const confirmBtn = await screen.findByRole('button', { name: /Yes, Revert to Processing/i });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(mockedApi.patch).toHaveBeenCalledWith(
        '/sales/orders/514969ab-af01-4981-ad78-19f8eaa880c1/revert-delivery',
        {},
      );
    });
  });

  it('hides Revert to Processing button from non-admin operators', async () => {
    mockPermissions([
      'sales.orders.view',
      'sales.orders.create',
      'sales.orders.update',
      'sales.orders.approve',
    ]);

    render(
      <AntdApp>
        <MemoryRouter initialEntries={['/sales/orders']}>
          <SalesOrderManagement />
        </MemoryRouter>
      </AntdApp>,
    );

    await screen.findByText('SOC-2026-05298');
    expect(screen.queryByRole('button', { name: /revert to processing/i })).not.toBeInTheDocument();
  });
});
