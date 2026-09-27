import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ProductionUnitsPage } from './ProductionUnitsPage';
import { productionUnitService, ProductionUnitStatus, ProductionUnitCodeType } from '../../../services/productionUnitService';

jest.mock('../../../services/productionUnitService');

const mockUnits = [
  {
    id: 'u-1',
    companyId: 'comp-1',
    productionEntryId: 'pe-1',
    itemId: 'item-1',
    item: { id: 'item-1', itemCode: 'WIR-TF-023-WH', name: '23/0.076 Twin Flat White' },
    uomId: null,
    unitSerialNo: 'PWI-PU-2026000001',
    coilNo: 'CN-001',
    qrPayload: 'PWI-PU-2026000001',
    barcodePayload: 'PWI-PU-2026000001',
    codeType: ProductionUnitCodeType.QR_BARCODE,
    productionDate: '2026-07-22',
    batchNo: '01',
    pvcBatchNo: '28',
    shiftId: null,
    shiftName: 'Shift A',
    operatorName: 'Yousuf / Amir',
    machineId: null,
    machineNo: 'EXT-01',
    departmentName: 'Extrusion',
    lengthMeters: 250,
    weightKg: 26.1,
    jointCount: 1,
    stValue: '04',
    qualityStatus: 'PASS',
    remarks: 'Sample remarks',
    status: ProductionUnitStatus.PRINTED,
    voidedBy: null,
    voidedAt: null,
    voidReason: null,
    firstPrintedAt: '2026-07-22T10:00:00Z',
    firstPrintedBy: 'user-1',
    printCount: 1,
    labelTemplate: 'PVC_COIL',
    createdAt: '2026-07-22T08:00:00Z',
    updatedAt: '2026-07-22T10:00:00Z',
  },
  {
    id: 'u-2',
    companyId: 'comp-1',
    productionEntryId: 'pe-1',
    itemId: 'item-1',
    item: { id: 'item-1', itemCode: 'WIR-TF-023-WH', name: '23/0.076 Twin Flat White' },
    uomId: null,
    unitSerialNo: 'PWI-PU-2026000002',
    coilNo: 'CN-002',
    qrPayload: 'PWI-PU-2026000002',
    barcodePayload: 'PWI-PU-2026000002',
    codeType: ProductionUnitCodeType.QR_BARCODE,
    productionDate: '2026-07-22',
    batchNo: '01',
    pvcBatchNo: '28',
    shiftId: null,
    shiftName: 'Shift A',
    operatorName: 'Yousuf / Amir',
    machineId: null,
    machineNo: 'EXT-01',
    departmentName: 'Extrusion',
    lengthMeters: 250,
    weightKg: 25.8,
    jointCount: 0,
    stValue: '04',
    qualityStatus: 'PASS',
    remarks: null,
    status: ProductionUnitStatus.GENERATED,
    voidedBy: null,
    voidedAt: null,
    voidReason: null,
    firstPrintedAt: null,
    firstPrintedBy: null,
    printCount: 0,
    labelTemplate: 'PVC_COIL',
    createdAt: '2026-07-22T08:00:00Z',
    updatedAt: '2026-07-22T08:00:00Z',
  },
];

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

describe('ProductionUnitsPage Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (productionUnitService.list as jest.Mock).mockResolvedValue({
      success: true,
      data: mockUnits,
      total: 2,
    });
    (productionUnitService.getStats as jest.Mock).mockResolvedValue({
      success: true,
      data: { total: 2, PRINTED: 1, GENERATED: 1, VOID: 0, CANCELLED: 0 },
    });
    (productionUnitService.getTemplates as jest.Mock).mockResolvedValue({
      success: true,
      data: [{ key: 'PVC_COIL', label: 'PVC Coil Label', fields: [] }],
    });
  });

  it('renders the page with title, statistics, and table data', async () => {
    render(<ProductionUnitsPage />);

    expect(screen.getByText('Production Unit Serialization & Labels')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('CN-001')).toBeInTheDocument();
      expect(screen.getByText('CN-002')).toBeInTheDocument();
      expect(screen.getByText('PWI-PU-2026000001')).toBeInTheDocument();
      expect(screen.getByText('PWI-PU-2026000002')).toBeInTheDocument();
    });
  });

  it('opens Generator Modal when Generate Units button is clicked', async () => {
    render(<ProductionUnitsPage />);

    const generateBtn = screen.getByRole('button', { name: /generate units/i });
    fireEvent.click(generateBtn);

    await waitFor(() => {
      expect(screen.getByText('Generate Production Units & Unique Barcode/QR Labels')).toBeInTheDocument();
      expect(screen.getByText('One-Action Bulk Serialization')).toBeInTheDocument();
    });
  });

  it('opens Scan Modal when Scan QR / Barcode button is clicked', async () => {
    render(<ProductionUnitsPage />);

    const scanBtn = screen.getByRole('button', { name: /scan qr \/ barcode/i });
    fireEvent.click(scanBtn);

    await waitFor(() => {
      expect(screen.getByText('Scan Production Unit QR / Barcode')).toBeInTheDocument();
    });
  });

  it('opens Weight Entry Modal when Enter Weights button is clicked', async () => {
    render(<ProductionUnitsPage />);

    await waitFor(() => expect(screen.getByText('CN-001')).toBeInTheDocument());

    const weightBtn = screen.getByRole('button', { name: /enter weights/i });
    fireEvent.click(weightBtn);

    await waitFor(() => {
      expect(screen.getByText(/Batch Weight & Quality Entry/i)).toBeInTheDocument();
    });
  });

  it('displays toolbar buttons: Select All, Clear Selection, Print Selected, Print All, Reprint Selected', async () => {
    render(<ProductionUnitsPage />);

    await waitFor(() => {
      expect(screen.getByText('Select All')).toBeInTheDocument();
      expect(screen.getByText('Clear Selection')).toBeInTheDocument();
      expect(screen.getByText(/Print Selected/)).toBeInTheDocument();
      expect(screen.getByText(/Print All/)).toBeInTheDocument();
      expect(screen.getByText('Reprint Selected')).toBeInTheDocument();
    });
  });

  it('displays individual coil weight inputs and unique serials correctly', async () => {
    render(<ProductionUnitsPage />);

    await waitFor(() => {
      expect(screen.getByText('CN-001')).toBeInTheDocument();
      expect(screen.getByText('CN-002')).toBeInTheDocument();
      const weightInputs = screen.getAllByPlaceholderText('e.g. 26.1');
      expect(weightInputs.length).toBe(2);
      expect((weightInputs[0] as HTMLInputElement).value).toBe('26.10');
      expect((weightInputs[1] as HTMLInputElement).value).toBe('25.80');
    });
  });

  it('renders Bulk Print Modal with isolated label cards when Print All is clicked', async () => {
    render(<ProductionUnitsPage />);

    await waitFor(() => expect(screen.getByText('CN-001')).toBeInTheDocument());

    const printAllBtn = screen.getByText(/Print All/);
    fireEvent.click(printAllBtn);

    await waitFor(() => {
      expect(screen.getByText(/Production Unit Label Bulk Printing/i)).toBeInTheDocument();
      // Verifies label content is present and not blank
      expect(screen.getByTestId('label-CN-001')).toBeInTheDocument();
      expect(screen.getByTestId('label-CN-002')).toBeInTheDocument();
      expect(screen.getAllByText('PAKISTAN WIRE INDUSTRIES (PVT) LTD').length).toBeGreaterThan(0);
      expect(screen.getByText('REPRINT #2')).toBeInTheDocument(); // Unit 1 has printCount = 1
    });
  });
});

