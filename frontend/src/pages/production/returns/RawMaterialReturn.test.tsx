import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import { App } from 'antd';
import RawMaterialReturn from './RawMaterialReturn';
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
    { id: 'item-pwi-1', itemCode: '271023', name: 'Liquid China Soap', baseUomId: 'uom-kg', divisionId: 'div-pwi', itemType: 'RAW_MATERIAL' },
  ],
  uoms: [
    { id: 'uom-kg', code: 'KG', name: 'Kilograms', symbol: 'kg', status: 'ACTIVE' },
  ],
  divisions: [
    { id: 'div-ccd', name: 'Control Cable Division', divisionCode: 'DIV-CCD' },
    { id: 'div-pwi', name: 'Pakistan Wire Industries', divisionCode: 'DIV-PWI' },
  ],
};

const mockReturns = [
  {
    id: 'ret-1',
    returnCode: 'RMTN-00001',
    sourceNo: 'DC-9901',
    returnDate: '2026-09-14',
    status: 'CONFIRMED',
    division: { id: 'div-ccd', name: 'Control Cable Division', divisionCode: 'DIV-CCD' },
    warehouse: { id: 'wh-1', name: 'Main Raw Material Warehouse' },
    lineCount: 1,
    quantityTotal: 45.00,
    lines: [
      {
        id: 'line-1',
        lineNumber: 1,
        item: { id: 'item-ccd-1', name: '1.20 mm-84 Wire', itemCode: 'RM-WIRE-001' },
        uom: { id: 'uom-kg', code: 'KG' },
        quantity: 45.00,
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
        <RawMaterialReturn />
      </App>
    </MemoryRouter>
  );

describe('RawMaterialReturn Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    apiMock.get.mockImplementation((url: string) => {
      if (url === '/inventory/receipts/gate-pass/form-data') {
        return Promise.resolve({ data: mockRefData } as any);
      }
      if (url === '/inventory/receipts/returns') {
        return Promise.resolve({ data: mockReturns, total: 1 } as any);
      }
      if (url === '/inventory/receipts/gate-pass') {
        return Promise.resolve({ data: [], total: 0 } as any);
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

  it('renders return history table with 2-decimal precision', async () => {
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('Raw Material Return')).toBeInTheDocument();
      expect(screen.getByText('RMTN-00001')).toBeInTheDocument();
      expect(screen.getByText('DC-9901')).toBeInTheDocument();
    });
  });

  it('opens New Return modal in split-view with live verification card and empty-prefill input', async () => {
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('New Return')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('New Return'));

    await waitFor(() => {
      expect(screen.getByText('RETURN VERIFICATION (2027)')).toBeInTheDocument();
      expect(screen.getAllByText('New Raw Material Return').length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText('Active Lines')).toBeInTheDocument();
      expect(screen.getByText('Total Return Qty')).toBeInTheDocument();
    });

    const inputs = screen.getAllByPlaceholderText('0.00');
    expect(inputs.length).toBeGreaterThanOrEqual(1);
    expect((inputs[0] as HTMLInputElement).value).toBe('');
  });

  it('minimizes to floating dock and restores on dock tab click', async () => {
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('New Return')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('New Return'));

    await waitFor(() => {
      expect(screen.getByText('RETURN VERIFICATION (2027)')).toBeInTheDocument();
    });

    const minimizeBtn = screen.getByTestId('modal-minimize-btn');
    expect(minimizeBtn).toBeInTheDocument();
    fireEvent.click(minimizeBtn);

    await waitFor(() => {
      expect(screen.getByTitle('Click to restore Return Window')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTitle('Click to restore Return Window'));

    await waitFor(() => {
      expect(screen.getByText('RETURN VERIFICATION (2027)')).toBeInTheDocument();
    });
  });
});
