import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import {
  ProductionUnitLabelCard,
  printProductionUnitLabels,
  generateQrSvgString,
  LABEL_PRESETS,
} from './ProductionUnitLabel';
import { ProductionUnitItem, ProductionUnitStatus, ProductionUnitCodeType } from '../../../services/productionUnitService';

const sampleUnit: ProductionUnitItem = {
  id: 'unit-abc-123',
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
  shiftName: 'Shift A (Morning)',
  operatorName: 'Yousuf / Amir',
  machineId: null,
  machineNo: 'EXT-01',
  departmentName: 'Extrusion',
  lengthMeters: 250,
  weightKg: 26.1,
  jointCount: 1,
  stValue: 'OK',
  qualityStatus: 'PASSED',
  remarks: 'Test label remarks',
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
};

describe('generateQrSvgString Helper', () => {
  it('deterministically outputs valid vector SVG with xmlns and solid fills', () => {
    const svg = generateQrSvgString('PWI-PU-2026000011', 80);
    expect(svg).toContain('<svg');
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(svg).toContain('viewBox=');
    expect(svg).toContain('fill="#ffffff"');
    expect(svg).toContain('fill="#000000"');
    expect(svg).toContain('</svg>');
  });

  it('returns empty string if payload is falsy', () => {
    expect(generateQrSvgString('')).toBe('');
  });
});

describe('ProductionUnitLabelCard Component', () => {
  it('renders all required label fields with high fidelity', () => {
    render(<ProductionUnitLabelCard unit={sampleUnit} template="PVC_COIL" />);

    // Company and Subheader
    expect(screen.getByText('PAKISTAN WIRE INDUSTRIES (PVT) LTD')).toBeInTheDocument();
    expect(screen.getByText(/Quality Wire & Cable Division/i)).toBeInTheDocument();

    // Template badge
    expect(screen.getByText('PVC COIL')).toBeInTheDocument();

    // Item information
    expect(screen.getByText('23/0.076 Twin Flat White')).toBeInTheDocument();
    expect(screen.getByText('(WIR-TF-023-WH)')).toBeInTheDocument();

    // Identity Banner
    expect(screen.getByText('CN-001')).toBeInTheDocument();
    expect(screen.getByText('PWI-PU-2026000001')).toBeInTheDocument();

    // Technical specifications (length without trailing zeros: 250 M)
    expect(screen.getByText('26.10 KG')).toBeInTheDocument();
    expect(screen.getByText('250 M')).toBeInTheDocument();
    expect(screen.getByText('01')).toBeInTheDocument(); // batch

    // Traceability metadata
    expect(screen.getByText(/28/)).toBeInTheDocument(); // PVC batch
    expect(screen.getByText(/Yousuf \/ Amir/)).toBeInTheDocument();
    expect(screen.getByText(/EXT-01/)).toBeInTheDocument();
    expect(screen.getByText(/PASSED/)).toBeInTheDocument();
    expect(screen.getByText(/OK/)).toBeInTheDocument();
  });

  it('renders REPRINT badge when printCount > 0', () => {
    const reprintUnit = { ...sampleUnit, printCount: 2 };
    render(<ProductionUnitLabelCard unit={reprintUnit} />);

    expect(screen.getByText('REPRINT #3')).toBeInTheDocument();
  });

  it('respects codeType QR_ONLY: QR visible, Barcode absent', () => {
    const qrOnlyUnit = { ...sampleUnit, codeType: ProductionUnitCodeType.QR_ONLY };
    const { container } = render(<ProductionUnitLabelCard unit={qrOnlyUnit} />);

    const qrWrapper = container.querySelector('.unit-qr-wrapper');
    expect(qrWrapper).toBeInTheDocument();
    const qrSvg = qrWrapper?.querySelector('svg');
    expect(qrSvg).toBeInTheDocument();
    expect(container.querySelector('.unit-barcode-wrapper')).not.toBeInTheDocument();
  });

  it('respects codeType BARCODE_ONLY: QR absent, Barcode visible', () => {
    const bcOnlyUnit = { ...sampleUnit, codeType: ProductionUnitCodeType.BARCODE_ONLY };
    const { container } = render(<ProductionUnitLabelCard unit={bcOnlyUnit} />);

    expect(container.querySelector('.unit-qr-wrapper')).not.toBeInTheDocument();
    const bcWrapper = container.querySelector('.unit-barcode-wrapper');
    expect(bcWrapper).toBeInTheDocument();
    expect(bcWrapper?.querySelector('svg')).toBeInTheDocument();
  });

  it('respects codeType QR_BARCODE: BOTH QR visible and Barcode visible', () => {
    const qrBarcodeUnit = { ...sampleUnit, codeType: ProductionUnitCodeType.QR_BARCODE };
    const { container } = render(<ProductionUnitLabelCard unit={qrBarcodeUnit} />);

    // QR must be visible and have SVG
    const qrWrapper = container.querySelector('.unit-qr-wrapper');
    expect(qrWrapper).toBeInTheDocument();
    const qrSvg = qrWrapper?.querySelector('svg');
    expect(qrSvg).toBeInTheDocument();

    // Barcode must be visible and have SVG
    const bcWrapper = container.querySelector('.unit-barcode-wrapper');
    expect(bcWrapper).toBeInTheDocument();
    expect(bcWrapper?.querySelector('svg')).toBeInTheDocument();
  });
});

describe('printProductionUnitLabels Engine', () => {
  beforeEach(() => {
    const existing = document.getElementById('pwi-label-print-frame');
    if (existing) existing.remove();
  });

  it('creates an isolated iframe and mounts the print document with BOTH QR and Barcode', () => {
    printProductionUnitLabels({
      units: [sampleUnit],
      template: 'PVC_COIL',
      presetKey: 'ROLL_100x50',
      copies: 1,
    });

    const iframe = document.getElementById('pwi-label-print-frame') as HTMLIFrameElement;
    expect(iframe).toBeInTheDocument();

    const doc = iframe.contentWindow?.document;
    expect(doc).toBeDefined();

    // Verify Title excludes the ERP Command Center title
    expect(doc?.title).toBe('Production Unit Labels - PWI');

    // Verify Label content is present inside iframe
    const bodyText = doc?.body.innerHTML || '';
    expect(bodyText).toContain('CN-001');
    expect(bodyText).toContain('PWI-PU-2026000001');
    expect(bodyText).toContain('PAKISTAN WIRE INDUSTRIES (PVT) LTD');
    expect(bodyText).toContain('26.10 KG');
    expect(bodyText).toContain('250 M');

    // Verify QR SVG is explicitly present inside iframe
    const qrSvg = doc?.querySelector('.qr-container svg');
    expect(qrSvg).toBeInTheDocument();
    expect(qrSvg?.getAttribute('xmlns')).toBe('http://www.w3.org/2000/svg');

    // Verify Barcode SVG element is present
    const bcSvg = doc?.querySelector('.barcode-container svg');
    expect(bcSvg).toBeInTheDocument();

    // Verify ERP shell elements are NOT present in iframe
    expect(bodyText).not.toContain('PWI — Pakistan Wire & Industry | ERP / MRP Command Center');
    expect(bodyText).not.toContain('ant-layout-sider');
    expect(bodyText).not.toContain('ant-menu');
  });

  it('correctly handles 3 units (Print Selected) with 3 distinct labels containing both codes', () => {
    const units = [
      { ...sampleUnit, id: 'u1', coilNo: 'CN-001', unitSerialNo: 'PWI-PU-2026000001', qrPayload: 'PWI-PU-2026000001', barcodePayload: 'PWI-PU-2026000001' },
      { ...sampleUnit, id: 'u2', coilNo: 'CN-002', unitSerialNo: 'PWI-PU-2026000002', qrPayload: 'PWI-PU-2026000002', barcodePayload: 'PWI-PU-2026000002' },
      { ...sampleUnit, id: 'u3', coilNo: 'CN-003', unitSerialNo: 'PWI-PU-2026000003', qrPayload: 'PWI-PU-2026000003', barcodePayload: 'PWI-PU-2026000003' },
    ];

    printProductionUnitLabels({
      units,
      template: 'PVC_COIL',
      presetKey: 'ROLL_100x50',
      copies: 1,
    });

    const iframe = document.getElementById('pwi-label-print-frame') as HTMLIFrameElement;
    const doc = iframe.contentWindow?.document;
    const pages = doc?.querySelectorAll('.label-page');
    expect(pages?.length).toBe(3);

    // Every label must have QR SVG
    const qrSvgs = doc?.querySelectorAll('.qr-container svg');
    expect(qrSvgs?.length).toBe(3);

    // Every label must have Barcode SVG
    const bcSvgs = doc?.querySelectorAll('.barcode-container svg');
    expect(bcSvgs?.length).toBe(3);
  });

  it('correctly handles 20 labels in QR_BARCODE mode with every label having 1 QR + 1 Barcode', () => {
    const twentyUnits: ProductionUnitItem[] = Array.from({ length: 20 }, (_, i) => {
      const num = String(i + 1).padStart(6, '0');
      const serial = `PWI-PU-2026${num}`;
      return {
        ...sampleUnit,
        id: `u-${i + 1}`,
        coilNo: `CN-${String(i + 1).padStart(3, '0')}`,
        unitSerialNo: serial,
        qrPayload: serial,
        barcodePayload: serial,
        codeType: ProductionUnitCodeType.QR_BARCODE,
      };
    });

    printProductionUnitLabels({
      units: twentyUnits,
      template: 'PVC_COIL',
      presetKey: 'ROLL_100x50',
      copies: 1,
    });

    const iframe = document.getElementById('pwi-label-print-frame') as HTMLIFrameElement;
    const doc = iframe.contentWindow?.document;
    const pages = doc?.querySelectorAll('.label-page');
    expect(pages?.length).toBe(20);

    const qrSvgs = doc?.querySelectorAll('.qr-container svg');
    expect(qrSvgs?.length).toBe(20);

    const bcSvgs = doc?.querySelectorAll('.barcode-container svg');
    expect(bcSvgs?.length).toBe(20);
  });

  it('preserves QR payload across reprint with identical serial number', () => {
    const reprintUnit = {
      ...sampleUnit,
      unitSerialNo: 'PWI-PU-2026000001',
      qrPayload: 'PWI-PU-2026000001',
      barcodePayload: 'PWI-PU-2026000001',
      printCount: 3,
    };

    printProductionUnitLabels({
      units: [reprintUnit],
      template: 'PVC_COIL',
      presetKey: 'ROLL_100x50',
      copies: 1,
    });

    const iframe = document.getElementById('pwi-label-print-frame') as HTMLIFrameElement;
    const doc = iframe.contentWindow?.document;
    const bodyText = doc?.body.innerHTML || '';

    expect(bodyText).toContain('REPRINT #4');
    expect(bodyText).toContain('PWI-PU-2026000001');

    const qrSvg = doc?.querySelector('.qr-container svg');
    expect(qrSvg).toBeInTheDocument();
  });

  it('correctly sets custom dimensions when CUSTOM preset is passed', () => {
    printProductionUnitLabels({
      units: [sampleUnit],
      template: 'PVC_COIL',
      presetKey: 'CUSTOM',
      customWidthMm: 120,
      customHeightMm: 80,
      copies: 1,
    });

    const iframe = document.getElementById('pwi-label-print-frame') as HTMLIFrameElement;
    const doc = iframe.contentWindow?.document;
    const styleContent = doc?.head.querySelector('style')?.innerHTML || '';

    expect(styleContent).toContain('size: 120mm 80mm;');
    expect(styleContent).toContain('width: 120mm;');
    expect(styleContent).toContain('height: 80mm;');
  });
});
