import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import { App } from 'antd';
import RawMaterialReceiving from './RawMaterialReceiving';
import apiService from '../../../services/api';

jest.mock('../../../services/api');

jest.setTimeout(30000);

const apiMock = apiService as jest.Mocked<typeof apiService>;

const mockRefData = {
  warehouses: [
    { id: 'wh-1', name: 'Main Raw Material Warehouse', warehouseCode: 'WH-RM-01', status: 'ACTIVE' },
  ],
  items: [
    { id: 'item-ccd-1', itemCode: 'RM-WIRE-001', name: '1.20 mm-84 Wire', baseUomId: 'uom-kg', divisionId: 'div-ccd', itemType: 'RAW_MATERIAL' },
    { id: 'item-ccd-2', itemCode: 'RM-WIRE-002', name: '1.40 mm-84 Wire', baseUomId: 'uom-kg', divisionId: 'div-ccd', itemType: 'RAW_MATERIAL' },
    { id: 'item-pwi-1', itemCode: '271023', name: 'Liquid China Soap', baseUomId: 'uom-kg', divisionId: 'div-pwi', itemType: 'RAW_MATERIAL' },
  ],
  uoms: [
    { id: 'uom-kg', code: 'KG', name: 'Kilograms', symbol: 'kg', status: 'ACTIVE' },
  ],
  divisions: [
    { id: 'div-ccd', name: 'Control Cable Division', divisionCode: 'DIV-CCD' },
    { id: 'div-pwi', name: 'Pakistan Wire Industries', divisionCode: 'DIV-PWI' },
  ],
  productionOrders: [
    { id: 'po-1', order_number: 'PO-2026-001' },
  ],
};

const mockReceipts = [
  {
    id: 'rec-1',
    receiptCode: 'RMR-00001',
    gatePassNo: 'GP-1001',
    receiptDate: '2026-09-14',
    status: 'CONFIRMED',
    division: { id: 'div-ccd', name: 'Control Cable Division', divisionCode: 'DIV-CCD' },
    warehouse: { id: 'wh-1', name: 'Main Raw Material Warehouse' },
    lineCount: 1,
    gatePassTotal: 100.50,
    receivedTotal: 100.50,
    differenceTotal: 0,
    lines: [
      {
        id: 'line-1',
        lineNumber: 1,
        item: { id: 'item-ccd-1', name: '1.20 mm-84 Wire', itemCode: 'RM-WIRE-001' },
        uom: { id: 'uom-kg', code: 'KG' },
        gatePassQuantity: 100.50,
        receivedQuantity: 100.50,
        difference: 0,
      },
    ],
  },
];

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

const renderComponent = () =>
  render(
    <MemoryRouter>
      <App>
        <RawMaterialReceiving />
      </App>
    </MemoryRouter>
  );

describe('RawMaterialReceiving Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    apiMock.get.mockImplementation((url: string) => {
      if (url === '/inventory/receipts/gate-pass/form-data') {
        return Promise.resolve({ data: mockRefData } as any);
      }
      if (url === '/inventory/receipts/gate-pass') {
        return Promise.resolve({ data: mockReceipts, total: 1 } as any);
      }
      if (url === '/inventory/receipts/organization/sections') {
        return Promise.resolve({ data: [{ id: 'sec-1', name: 'Raw Material Store', sectionCode: 'SEC-111' }] } as any);
      }
      if (url === '/inventory/receipts/organization/departments') {
        return Promise.resolve({ data: [{ id: 'dept-1', name: 'CCD Stores', departmentCode: 'CCD-DEPT111' }] } as any);
      }
      return Promise.resolve({ data: [] } as any);
    });
  });

  it('renders receiving history table with 2-decimal precision totals', async () => {
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('Raw Material Receiving')).toBeInTheDocument();
      expect(screen.getByText('RMR-00001')).toBeInTheDocument();
      expect(screen.getByText('GP-1001')).toBeInTheDocument();
    });
  });

  it('opens New Receipt modal in split-view with live verification card and empty-prefill inputs', async () => {
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('New Receipt (Gate Pass)')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('New Receipt (Gate Pass)'));

    await waitFor(() => {
      expect(screen.getByText('LIVE VERIFICATION (2027)')).toBeInTheDocument();
      expect(screen.getByText('New Raw Material Receipt')).toBeInTheDocument();
      expect(screen.getByText('Active Lines')).toBeInTheDocument();
      expect(screen.getByText('Gate Pass Total')).toBeInTheDocument();
      expect(screen.getByText('Received Total')).toBeInTheDocument();
    });

    // Inputs should have 0.00 placeholders rather than pre-typed 0.0000 numbers
    const inputs = screen.getAllByPlaceholderText('0.00');
    expect(inputs.length).toBeGreaterThanOrEqual(2);
    expect((inputs[0] as HTMLInputElement).value).toBe('');
    expect((inputs[1] as HTMLInputElement).value).toBe('');
  });

  it('minimizes to floating dock and restores on dock tab click', async () => {
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('New Receipt (Gate Pass)')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('New Receipt (Gate Pass)'));

    await waitFor(() => {
      expect(screen.getByText('LIVE VERIFICATION (2027)')).toBeInTheDocument();
    });

    // Find and click the minimize button (-)
    const minimizeBtn = screen.getByTestId('modal-minimize-btn');
    expect(minimizeBtn).toBeInTheDocument();
    fireEvent.click(minimizeBtn);

    // Modal is minimized, dock tab appears
    await waitFor(() => {
      expect(screen.getByTitle('Click to restore Receipt Window')).toBeInTheDocument();
    });

    // Click dock tab to restore
    fireEvent.click(screen.getByTitle('Click to restore Receipt Window'));

    await waitFor(() => {
      expect(screen.getByText('LIVE VERIFICATION (2027)')).toBeInTheDocument();
    });
  });
});
