import React, { useRef, useEffect } from 'react';
import { QRCodeSVG } from '@rc-component/qrcode';
import { renderToStaticMarkup } from 'react-dom/server';
import JsBarcode from 'jsbarcode';
import { ProductionUnitItem, ProductionUnitCodeType } from '../../../services/productionUnitService';

export interface LabelDimensionPreset {
  widthMm: number;
  heightMm: number;
  label: string;
  mode: 'roll' | 'sheet';
}

export const LABEL_PRESETS: Record<string, LabelDimensionPreset> = {
  ROLL_100x50: {
    widthMm: 100,
    heightMm: 50,
    label: '100 × 50 mm (Standard Coil Roll - Default)',
    mode: 'roll',
  },
  ROLL_100x75: {
    widthMm: 100,
    heightMm: 75,
    label: '100 × 75 mm (Large Coil / Box Roll)',
    mode: 'roll',
  },
  ROLL_75x50: {
    widthMm: 75,
    heightMm: 50,
    label: '75 × 50 mm (Compact Reel Roll)',
    mode: 'roll',
  },
  ROLL_62x45: {
    widthMm: 62,
    heightMm: 45,
    label: '62 × 45 mm (Barcode Sticker Roll)',
    mode: 'roll',
  },
  SHEET_A4_2COL: {
    widthMm: 95,
    heightMm: 65,
    label: 'A4 Sheet (2 Columns × 4 Rows)',
    mode: 'sheet',
  },
  SHEET_A4_3COL: {
    widthMm: 63,
    heightMm: 45,
    label: 'A4 Sheet (3 Columns × 6 Rows)',
    mode: 'sheet',
  },
  CUSTOM: {
    widthMm: 100,
    heightMm: 50,
    label: 'Custom Dimensions (User-Defined mm)',
    mode: 'roll',
  },
};

// ─── Single SVG Barcode Renderer ───────────────────────────────────────────────
export const BarcodeSvg: React.FC<{
  value: string;
  height?: number;
  width?: number;
  fontSize?: number;
}> = ({ value, height = 30, width = 1.15, fontSize = 9 }) => {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (svgRef.current && value) {
      try {
        JsBarcode(svgRef.current, value, {
          format: 'CODE128',
          width,
          height,
          displayValue: true,
          fontSize,
          font: 'monospace',
          textMargin: 1,
          margin: 1,
          background: '#ffffff',
          lineColor: '#000000',
        });
      } catch (err) {
        console.error('JsBarcode render error:', err);
      }
    }
  }, [value, height, width, fontSize]);

  return <svg ref={svgRef} style={{ maxWidth: '100%', height: 'auto', display: 'block' }} />;
};

/**
 * Deterministically generates pure vector SVG markup for the QR code.
 * Ensures xmlns attribute is present so it renders with 100% fidelity in any document/iframe.
 */
export function generateQrSvgString(payload: string, size = 80): string {
  if (!payload) return '';
  let svg = renderToStaticMarkup(
    React.createElement(QRCodeSVG, {
      value: payload,
      size,
      level: 'M',
      bgColor: '#ffffff',
      fgColor: '#000000',
    })
  );
  if (!svg.includes('xmlns="http://www.w3.org/2000/svg"')) {
    svg = svg.replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ');
  }
  return svg;
}

// ─── React Label Preview Component (WYSIWYG on Screen) ────────────────────────
export interface ProductionUnitLabelCardProps {
  unit: ProductionUnitItem;
  template?: string;
  isReprint?: boolean;
}

export const ProductionUnitLabelCard: React.FC<ProductionUnitLabelCardProps> = ({
  unit,
  template = 'PVC_COIL',
  isReprint = unit.printCount > 0,
}) => {
  const codeType = unit.codeType || ProductionUnitCodeType.QR_BARCODE;

  return (
    <div
      className="pwi-production-unit-label"
      data-unit-id={unit.id}
      data-testid={`label-${unit.coilNo}`}
      style={{
        background: '#ffffff',
        color: '#0f172a',
        border: '1.5px solid #0f172a',
        borderRadius: 6,
        padding: '10px 12px',
        boxShadow: '0 2px 6px rgba(0,0,0,0.12)',
        fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        boxSizing: 'border-box',
        width: '100%',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderBottom: '2px solid #0f172a',
          paddingBottom: 4,
          marginBottom: 6,
        }}
      >
        <div>
          <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: '0.04em', color: '#09090b', lineHeight: 1.2 }}>
            PAKISTAN WIRE INDUSTRIES (PVT) LTD
          </div>
          <div style={{ fontSize: 8.5, color: '#475569', fontWeight: 600, textTransform: 'uppercase' }}>
            Quality Wire & Cable Division · ISO 9001:2015
          </div>
        </div>
        <div style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
          <span
            style={{
              background: '#0f172a',
              color: '#fff',
              fontSize: 9,
              fontWeight: 800,
              padding: '2px 6px',
              borderRadius: 3,
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
            }}
          >
            {template.replace('_', ' ')}
          </span>
          {isReprint && (
            <span
              style={{
                marginLeft: 4,
                background: '#dc2626',
                color: '#fff',
                fontSize: 8.5,
                fontWeight: 800,
                padding: '2px 5px',
                borderRadius: 3,
              }}
            >
              REPRINT #{unit.printCount + 1}
            </span>
          )}
        </div>
      </div>

      {/* Main Content: Left details, Right QR/Barcode */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        {/* Left Information Pane */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Item */}
          <div style={{ marginBottom: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            <span style={{ fontSize: 9.5, color: '#64748b', fontWeight: 700 }}>ITEM:</span>{' '}
            <strong style={{ fontSize: 11.5, color: '#09090b' }}>
              {unit.item?.name || 'Finished Product'}
            </strong>
            {unit.item?.itemCode && (
              <span style={{ fontSize: 9.5, color: '#475569', marginLeft: 4 }}>
                ({unit.item.itemCode})
              </span>
            )}
          </div>

          {/* Key Identification Banner: Coil No & Serial */}
          <div
            style={{
              display: 'flex',
              gap: 8,
              background: '#f8fafc',
              padding: '3px 6px',
              borderRadius: 4,
              border: '1px solid #cbd5e1',
              marginBottom: 4,
            }}
          >
            <div style={{ flex: 1 }}>
              <span style={{ fontSize: 8.5, color: '#64748b', fontWeight: 800, display: 'block' }}>COIL #</span>
              <strong style={{ fontSize: 15, color: '#1d4ed8', fontWeight: 900 }}>{unit.coilNo}</strong>
            </div>
            <div style={{ flex: 1.2 }}>
              <span style={{ fontSize: 8.5, color: '#64748b', fontWeight: 800, display: 'block' }}>SERIAL NO</span>
              <strong style={{ fontSize: 10, fontFamily: 'monospace', color: '#0f172a' }}>{unit.unitSerialNo}</strong>
            </div>
          </div>

          {/* Technical Specs: Weight & Length & Batch */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4, marginBottom: 4 }}>
            <div style={{ background: '#fef3c7', padding: '2px 4px', borderRadius: 3, border: '1px solid #fde68a' }}>
              <span style={{ fontSize: 7.5, color: '#92400e', fontWeight: 800, display: 'block' }}>WEIGHT</span>
              <strong style={{ fontSize: 11.5, color: '#78350f' }}>
                {unit.weightKg != null ? `${Number(unit.weightKg).toFixed(2)} KG` : '—'}
              </strong>
            </div>
            <div style={{ background: '#e0f2fe', padding: '2px 4px', borderRadius: 3, border: '1px solid #bae6fd' }}>
              <span style={{ fontSize: 7.5, color: '#0369a1', fontWeight: 800, display: 'block' }}>LENGTH</span>
              <strong style={{ fontSize: 11, color: '#075985' }}>
                {unit.lengthMeters != null ? `${Number(unit.lengthMeters)} M` : '—'}
              </strong>
            </div>
            <div style={{ background: '#f3e8ff', padding: '2px 4px', borderRadius: 3, border: '1px solid #e9d5ff' }}>
              <span style={{ fontSize: 7.5, color: '#6b21a8', fontWeight: 800, display: 'block' }}>BATCH</span>
              <strong style={{ fontSize: 10.5, color: '#581c87' }}>{unit.batchNo || '—'}</strong>
            </div>
          </div>

          {/* Traceability Metadata Footer */}
          <div style={{ fontSize: 8.5, color: '#334155', lineHeight: '13px' }}>
            <div>
              {unit.pvcBatchNo && <span><strong>PVC Batch:</strong> {unit.pvcBatchNo} · </span>}
              {unit.stValue && <span><strong>S.T.:</strong> {unit.stValue} · </span>}
              {unit.jointCount != null && <span><strong>Joints:</strong> {unit.jointCount} · </span>}
              {unit.qualityStatus && <span><strong>QC:</strong> {unit.qualityStatus}</span>}
            </div>
            <div>
              <strong>Date:</strong> {unit.productionDate} · <strong>Shift:</strong> {unit.shiftName || 'A'}
              {unit.operatorName && <span> · <strong>Op:</strong> {unit.operatorName}</span>}
              {unit.machineNo && <span> · <strong>M/C:</strong> {unit.machineNo}</span>}
            </div>
          </div>
        </div>

        {/* Right Machine-Readable Pane: QR & Barcode */}
        <div
          style={{
            width: codeType === ProductionUnitCodeType.BARCODE_ONLY ? 140 : 105,
            textAlign: 'center',
            flexShrink: 0,
          }}
        >
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              background: '#ffffff',
              padding: 2,
            }}
          >
            {codeType !== ProductionUnitCodeType.BARCODE_ONLY && (
              <div
                className="unit-qr-wrapper"
                data-unit-id={unit.id}
                data-testid={`qr-${unit.coilNo}`}
                style={{
                  display: 'inline-block',
                  marginBottom: codeType === ProductionUnitCodeType.QR_ONLY ? 0 : 3,
                }}
              >
                <QRCodeSVG
                  value={unit.qrPayload}
                  size={codeType === ProductionUnitCodeType.QR_ONLY ? 95 : 70}
                  level="M"
                  bgColor="#ffffff"
                  fgColor="#000000"
                  style={{ display: 'block' }}
                />
              </div>
            )}
            {codeType !== ProductionUnitCodeType.QR_ONLY && (
              <div
                className="unit-barcode-wrapper"
                data-unit-id={unit.id}
                data-testid={`barcode-${unit.coilNo}`}
                style={{
                  width: '100%',
                  marginTop: codeType === ProductionUnitCodeType.BARCODE_ONLY ? 4 : 0,
                }}
              >
                <BarcodeSvg
                  value={unit.barcodePayload}
                  height={codeType === ProductionUnitCodeType.BARCODE_ONLY ? 38 : 22}
                  width={codeType === ProductionUnitCodeType.BARCODE_ONLY ? 1.25 : 0.95}
                  fontSize={codeType === ProductionUnitCodeType.BARCODE_ONLY ? 9 : 8}
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── Print Execution Engine (Pure, Isolated Iframe) ───────────────────────────
export interface PrintLabelsOptions {
  units: ProductionUnitItem[];
  template: string;
  presetKey: string;
  customWidthMm?: number;
  customHeightMm?: number;
  copies?: number;
}

export function printProductionUnitLabels(options: PrintLabelsOptions): void {
  const {
    units,
    template,
    presetKey,
    customWidthMm = 100,
    customHeightMm = 50,
    copies = 1,
  } = options;

  if (!units || !units.length) return;

  const preset = LABEL_PRESETS[presetKey] || LABEL_PRESETS.ROLL_100x50;
  const isSheet = preset.mode === 'sheet';
  const widthMm = presetKey === 'CUSTOM' ? customWidthMm : preset.widthMm;
  const heightMm = presetKey === 'CUSTOM' ? customHeightMm : preset.heightMm;

  // 1. Remove previous print frame
  const existingFrame = document.getElementById('pwi-label-print-frame');
  if (existingFrame) {
    existingFrame.remove();
  }

  // 2. Create isolated iframe
  const iframe = document.createElement('iframe');
  iframe.id = 'pwi-label-print-frame';
  iframe.setAttribute('title', 'PWI Production Unit Labels');
  iframe.style.position = 'fixed';
  iframe.style.left = '-10000px';
  iframe.style.top = '-10000px';
  iframe.style.width = '210mm';
  iframe.style.height = '297mm';
  iframe.style.border = 'none';
  iframe.style.zIndex = '-9999';
  document.body.appendChild(iframe);

  const doc = iframe.contentWindow?.document;
  if (!doc) {
    window.print();
    return;
  }

  // Expand units by copies
  const expandedUnits: ProductionUnitItem[] = [];
  units.forEach((u) => {
    for (let c = 0; c < copies; c++) {
      expandedUnits.push(u);
    }
  });

  // 3. Build HTML string for the labels
  let labelsHtml = '';

  expandedUnits.forEach((unit, idx) => {
    const isReprint = unit.printCount > 0;
    const codeType = unit.codeType || ProductionUnitCodeType.QR_BARCODE;
    const qrSize = codeType === ProductionUnitCodeType.QR_ONLY ? 100 : 75;
    const qrSvg = generateQrSvgString(unit.qrPayload, qrSize);

    const labelInner = `
      <div class="label-card">
        <!-- Header -->
        <div class="label-header">
          <div>
            <div class="company-title">PAKISTAN WIRE INDUSTRIES (PVT) LTD</div>
            <div class="company-sub">Quality Wire & Cable Division · ISO 9001:2015</div>
          </div>
          <div class="badge-group">
            <span class="badge template-badge">${template.replace('_', ' ')}</span>
            ${isReprint ? `<span class="badge reprint-badge">REPRINT #${unit.printCount + 1}</span>` : ''}
          </div>
        </div>

        <!-- Body -->
        <div class="label-body">
          <!-- Left Details -->
          <div class="left-col">
            <div class="item-row">
              <span class="lbl">ITEM:</span>
              <strong class="item-name">${unit.item?.name || 'Finished Product'}</strong>
              ${unit.item?.itemCode ? `<span class="item-code">(${unit.item.itemCode})</span>` : ''}
            </div>

            <!-- Identity Banner -->
            <div class="id-banner">
              <div class="coil-box">
                <span class="sub-lbl">COIL #</span>
                <span class="coil-no">${unit.coilNo}</span>
              </div>
              <div class="serial-box">
                <span class="sub-lbl">SERIAL NO</span>
                <span class="serial-no">${unit.unitSerialNo}</span>
              </div>
            </div>

            <!-- Technical Specs -->
            <div class="specs-grid">
              <div class="spec-cell weight-cell">
                <span class="sub-lbl">WEIGHT</span>
                <span class="val">${unit.weightKg != null ? `${Number(unit.weightKg).toFixed(2)} KG` : '—'}</span>
              </div>
              <div class="spec-cell length-cell">
                <span class="sub-lbl">LENGTH</span>
                <span class="val">${unit.lengthMeters != null ? `${Number(unit.lengthMeters)} M` : '—'}</span>
              </div>
              <div class="spec-cell batch-cell">
                <span class="sub-lbl">BATCH</span>
                <span class="val">${unit.batchNo || '—'}</span>
              </div>
            </div>

            <!-- Traceability Metadata -->
            <div class="meta-footer">
              <div>
                ${unit.pvcBatchNo ? `<span><strong>PVC Batch:</strong> ${unit.pvcBatchNo} · </span>` : ''}
                ${unit.stValue ? `<span><strong>S.T.:</strong> ${unit.stValue} · </span>` : ''}
                ${unit.jointCount != null ? `<span><strong>Joints:</strong> ${unit.jointCount} · </span>` : ''}
                ${unit.qualityStatus ? `<span><strong>QC:</strong> ${unit.qualityStatus}</span>` : ''}
              </div>
              <div>
                <strong>Date:</strong> ${unit.productionDate} · <strong>Shift:</strong> ${unit.shiftName || 'A'}
                ${unit.operatorName ? ` · <strong>Op:</strong> ${unit.operatorName}` : ''}
                ${unit.machineNo ? ` · <strong>M/C:</strong> ${unit.machineNo}` : ''}
              </div>
            </div>
          </div>

          <!-- Right Codes -->
          <div class="right-col ${codeType === ProductionUnitCodeType.BARCODE_ONLY ? 'wide-code' : ''} ${codeType === ProductionUnitCodeType.QR_ONLY ? 'qr-only-col' : ''}">
            ${codeType !== ProductionUnitCodeType.BARCODE_ONLY ? `
              <div class="qr-container" data-testid="print-qr-${unit.coilNo}">
                ${qrSvg}
              </div>
            ` : ''}
            ${codeType !== ProductionUnitCodeType.QR_ONLY ? `
              <div class="barcode-container">
                <svg id="print-bc-${idx}" class="barcode-svg" data-testid="print-bc-${unit.coilNo}"></svg>
              </div>
            ` : ''}
          </div>
        </div>
      </div>
    `;

    if (isSheet) {
      labelsHtml += labelInner;
    } else {
      labelsHtml += `<div class="label-page">${labelInner}</div>`;
    }
  });

  // Page style configuration
  let pageCss = '';
  if (isSheet) {
    const cols = presetKey === 'SHEET_A4_3COL' ? 3 : 2;
    pageCss = `
      @page {
        size: A4 portrait;
        margin: 6mm;
      }
      body {
        margin: 0;
        padding: 0;
      }
      .sheet-grid {
        display: grid;
        grid-template-columns: repeat(${cols}, 1fr);
        gap: 3mm;
        width: 100%;
      }
      .label-card {
        border: 1px solid #000000;
        border-radius: 4px;
        page-break-inside: avoid;
        break-inside: avoid;
      }
    `;
  } else {
    pageCss = `
      @page {
        size: ${widthMm}mm ${heightMm}mm;
        margin: 0mm;
      }
      body {
        margin: 0;
        padding: 0;
      }
      .label-page {
        width: ${widthMm}mm;
        height: ${heightMm}mm;
        page-break-after: always;
        break-after: page;
        box-sizing: border-box;
        overflow: hidden;
      }
      .label-page:last-child {
        page-break-after: auto;
        break-after: auto;
      }
      .label-card {
        width: 100%;
        height: 100%;
        box-sizing: border-box;
        border: none;
      }
    `;
  }

  // Write full document into iframe
  doc.open();
  doc.write(`
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <title>Production Unit Labels - PWI</title>
        <style>
          * {
            box-sizing: border-box;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          html, body {
            background: #ffffff !important;
            color: #000000 !important;
            font-family: Arial, "Helvetica Neue", Helvetica, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            font-size: 8pt;
            line-height: 1.25;
          }
          ${pageCss}

          .label-card {
            background: #ffffff;
            padding: 2mm 3mm;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
          }
          .label-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-bottom: 1.5pt solid #000000;
            padding-bottom: 1.5mm;
            margin-bottom: 1.5mm;
          }
          .company-title {
            font-size: 8.5pt;
            font-weight: 900;
            letter-spacing: 0.03em;
            color: #000000;
            line-height: 1.1;
          }
          .company-sub {
            font-size: 6pt;
            font-weight: 700;
            text-transform: uppercase;
            color: #333333;
          }
          .badge-group {
            text-align: right;
            white-space: nowrap;
          }
          .badge {
            display: inline-block;
            font-size: 6.5pt;
            font-weight: 800;
            padding: 1px 4px;
            border-radius: 2px;
            text-transform: uppercase;
          }
          .template-badge {
            background: #000000;
            color: #ffffff;
          }
          .reprint-badge {
            background: #b91c1c;
            color: #ffffff;
            margin-left: 2px;
          }

          .label-body {
            display: flex;
            gap: 2.5mm;
            align-items: center;
            flex: 1;
          }
          .left-col {
            flex: 1;
            min-width: 0;
          }
          .item-row {
            margin-bottom: 1.5mm;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
          }
          .lbl {
            font-size: 6.5pt;
            font-weight: 800;
            color: #444444;
          }
          .item-name {
            font-size: 8pt;
            font-weight: 900;
            color: #000000;
          }
          .item-code {
            font-size: 6.5pt;
            color: #333333;
            margin-left: 2px;
          }

          .id-banner {
            display: flex;
            gap: 2mm;
            background: #f1f5f9;
            border: 0.8pt solid #94a3b8;
            border-radius: 2px;
            padding: 1.5mm 2.5mm;
            margin-bottom: 1.5mm;
          }
          .coil-box {
            flex: 1;
          }
          .serial-box {
            flex: 1.3;
          }
          .sub-lbl {
            display: block;
            font-size: 5.5pt;
            font-weight: 800;
            color: #475569;
          }
          .coil-no {
            font-size: 11pt;
            font-weight: 900;
            color: #000000;
            line-height: 1;
          }
          .serial-no {
            font-size: 7.5pt;
            font-family: monospace;
            font-weight: 800;
            color: #000000;
          }

          .specs-grid {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 1.5mm;
            margin-bottom: 1.5mm;
          }
          .spec-cell {
            padding: 1mm 1.5mm;
            border-radius: 2px;
            border: 0.5pt solid #cbd5e1;
          }
          .weight-cell {
            background: #fef9c3;
            border-color: #fde047;
          }
          .length-cell {
            background: #e0f2fe;
            border-color: #7dd3fc;
          }
          .batch-cell {
            background: #f3e8ff;
            border-color: #d8b4fe;
          }
          .spec-cell .val {
            font-size: 8pt;
            font-weight: 900;
            color: #000000;
          }

          .meta-footer {
            font-size: 6pt;
            color: #1e293b;
            line-height: 1.25;
          }

          .right-col {
            width: 28mm;
            text-align: center;
            flex-shrink: 0;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
          }
          .right-col.wide-code {
            width: 34mm;
          }
          .qr-container {
            width: 19mm;
            height: 19mm;
            display: flex;
            align-items: center;
            justify-content: center;
            margin-bottom: 0.5mm;
          }
          .right-col.qr-only-col .qr-container {
            width: 26mm;
            height: 26mm;
            margin-bottom: 0;
          }
          .qr-container svg {
            width: 100% !important;
            height: 100% !important;
            display: block;
          }
          .barcode-container {
            width: 100%;
          }
          .barcode-container svg {
            max-width: 100% !important;
            height: auto !important;
            display: block;
          }
        </style>
      </head>
      <body>
        ${isSheet ? `<div class="sheet-grid">${labelsHtml}</div>` : labelsHtml}
      </body>
    </html>
  `);
  doc.close();

  // 4. Render Barcode SVGs inside the iframe
  expandedUnits.forEach((unit, idx) => {
    if (unit.codeType !== ProductionUnitCodeType.QR_ONLY) {
      const svgEl = doc.getElementById(`print-bc-${idx}`) as SVGSVGElement | null;
      if (svgEl && unit.barcodePayload) {
        try {
          JsBarcode(svgEl, unit.barcodePayload, {
            format: 'CODE128',
            width: unit.codeType === ProductionUnitCodeType.BARCODE_ONLY ? 1.25 : 0.95,
            height: unit.codeType === ProductionUnitCodeType.BARCODE_ONLY ? 32 : 16,
            displayValue: true,
            fontSize: unit.codeType === ProductionUnitCodeType.BARCODE_ONLY ? 9 : 7,
            font: 'monospace',
            textMargin: 1,
            margin: 0,
            background: '#ffffff',
            lineColor: '#000000',
          });
        } catch (e) {
          console.error('Barcode render error in iframe:', e);
        }
      }
    }
  });

  // 5. Trigger iframe print after layout paint
  setTimeout(() => {
    try {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    } catch (e) {
      console.error('Iframe print error, falling back to window.print():', e);
      window.print();
    }
  }, 250);
}
