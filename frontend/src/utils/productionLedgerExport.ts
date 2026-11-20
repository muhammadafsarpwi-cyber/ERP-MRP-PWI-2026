import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import dayjs from 'dayjs';

export interface ProductionLedgerExportRow {
  key: string;
  order: number;
  stage: string;
  stageLabel: string;
  departmentName: string;
  itemCode: string;
  itemName: string;
  splitSide?: string;
  uomCode: string | null;
  opBalance: number;
  production: number;
  subTotal: number;
  issuance: number;
  suppressed: boolean;
  closingPieces: number;
  perPieceWeight: number | null;
  totalWeight: number | null;
  scrapTodayPcs: number;
  scrapTodayKg: number;
  scrapMonthPcs: number;
  scrapMonthKg: number;
  remarks: string;
  found: boolean;
}

export interface ProductionLedgerExportChain {
  key: string;
  label: string;
  fgItemCode: string;
  rows: ProductionLedgerExportRow[];
  summary: {
    found: number;
    total: number;
    balanced: boolean;
    totalPacked: number;
    packedUom?: string;
  };
}

export interface ProductionLedgerExportOptions {
  companyName?: string;
  subtitle?: string;
  reportTitle?: string;
  divisionName: string;
  viewMode: 'daily' | 'range';
  endDate: string;
  monthFrom: string;
  rangeStart?: string;
  chains: ProductionLedgerExportChain[];
  summary: {
    found: number;
    total: number;
    balanced: boolean;
    totalPacked: number;
    packedUom?: string;
  };
  showAll: boolean;
  fileStamp?: string;
}

interface LogoAssetCache {
  dataUrl: string;
  bytes: Uint8Array;
}

let cachedLogoPromise: Promise<LogoAssetCache | null> | null = null;

function getLogoUrl(): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  return `${origin}/logo.png`;
}

async function loadLogoAssets(): Promise<LogoAssetCache | null> {
  if (cachedLogoPromise) return cachedLogoPromise;
  cachedLogoPromise = (async () => {
    try {
      const resp = await fetch(getLogoUrl());
      if (!resp.ok) return null;
      const buf = await resp.arrayBuffer();
      const bytes = new Uint8Array(buf);
      let binary = '';
      const chunkSize = 0x8000;
      for (let i = 0; i < bytes.length; i += chunkSize) {
        binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
      }
      const dataUrl = `data:image/png;base64,${btoa(binary)}`;
      return { dataUrl, bytes };
    } catch {
      return null;
    }
  })();
  return cachedLogoPromise;
}

function isCountUnit(uom: string | null | undefined): boolean {
  const u = (uom ?? '').trim().toUpperCase();
  return u === 'PCS' || u === 'GRS' || u === 'CTN';
}

function fmtNum(v: number | null | undefined, uom?: string | null): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—';
  if (isCountUnit(uom)) {
    return Math.round(v).toLocaleString('en-US');
  }
  const rounded = Math.round(v * 100) / 100;
  return rounded.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

function roundNum(v: number | null | undefined, decimals = 2): number {
  if (v === null || v === undefined || !Number.isFinite(v)) return 0;
  const f = Math.pow(10, decimals);
  return Math.round(v * f) / f;
}

function pcsPerCartonForItem(itemCode: string): number {
  const c = (itemCode || '').toUpperCase();
  if (c === 'SPI-FG-SPK-001' || c === 'SPI-FG-SPK-002') return 2880;
  return 1440;
}

function getGrsValue(qty: number, uom: string | null): number | null {
  const u = (uom ?? 'PCS').trim().toUpperCase();
  if (u === 'KG') return null;
  if (u === 'GRS') return roundNum(qty, 2);
  return roundNum(qty / 144, 2);
}

function getCartonsValue(qty: number, stage: string, uom: string | null, itemCode: string): number | null {
  if (stage !== 'FG' && stage !== 'DP') return null;
  const u = (uom ?? 'PCS').trim().toUpperCase();
  if (u === 'KG') return null;
  const pcs = u === 'GRS' ? qty * 144 : qty;
  return roundNum(pcs / pcsPerCartonForItem(itemCode), 1);
}

function formatDualQtyLines(
  qty: number,
  stage: string,
  uom: string | null,
  itemCode: string,
  includeCartons = false,
): string {
  const main = fmtNum(qty, uom);
  const u = (uom ?? (stage === 'RM' ? 'KG' : 'PCS')).trim().toUpperCase();
  if (u === 'KG') return main;
  const grs = getGrsValue(qty, uom);
  const ctn = includeCartons ? getCartonsValue(qty, stage, uom, itemCode) : null;
  const lines = [main];
  if (ctn !== null) lines.push(`${ctn.toLocaleString('en-US', { maximumFractionDigits: 1 })} CTN`);
  if (grs !== null) lines.push(`${grs.toLocaleString('en-US', { maximumFractionDigits: 1 })} GRS`);
  return lines.join('\n');
}

function formatRejectionLines(pcs: number, kg: number, isRmOrKg: boolean, uomCode?: string | null): string {
  if (isRmOrKg) {
    return kg > 0 ? `${fmtNum(kg, 'KG')} KG` : '0';
  }
  const u = (uomCode || 'PCS').trim().toUpperCase();
  if (pcs === 0 && kg === 0) return `0 ${u}`;
  return `${fmtNum(pcs, u)} ${u}\n(${fmtNum(kg, 'KG')} KG)`;
}

function escapeHtml(raw: unknown): string {
  return String(raw ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeXml(raw: unknown): string {
  return String(raw ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function stageBadgePalette(stage: string): { bg: [number, number, number]; fg: [number, number, number]; hexBg: string; hexFg: string } {
  const s = (stage || '').toUpperCase();
  if (s === 'RM') return { bg: [241, 245, 249], fg: [51, 65, 85], hexBg: '#f1f5f9', hexFg: '#334155' };
  if (s === 'ST' || s === 'SW') return { bg: [224, 242, 254], fg: [3, 105, 161], hexBg: '#e0f2fe', hexFg: '#0369a1' };
  if (s === 'SP' || s === 'PL') return { bg: [237, 233, 254], fg: [109, 40, 217], hexBg: '#ede9fe', hexFg: '#6d28d9' };
  if (s === 'HT') return { bg: [255, 237, 213], fg: [194, 65, 12], hexBg: '#ffedd5', hexFg: '#c2410c' };
  if (s === 'PK' || s === 'FG') return { bg: [209, 250, 229], fg: [4, 120, 87], hexBg: '#d1fae5', hexFg: '#047857' };
  if (s === 'DP') return { bg: [254, 243, 199], fg: [180, 83, 9], hexBg: '#fef3c7', hexFg: '#b45309' };
  return { bg: [241, 245, 249], fg: [30, 41, 59], hexBg: '#f1f5f9', hexFg: '#1e293b' };
}

function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

/* ============================================================================
 * 1. EXECUTIVE VECTOR PDF EXPORT (A4 LANDSCAPE)
 * ============================================================================ */

export async function exportProductionLedgerPdf(options: ProductionLedgerExportOptions): Promise<void> {
  const {
    companyName = 'PWI — Pakistan Wire Industries (Pvt.) LTD',
    subtitle = 'ERP / MRP Command Center — Manufacturing Division',
    reportTitle = 'Item-Wise Production Ledger',
    divisionName,
    viewMode,
    endDate,
    monthFrom,
    rangeStart,
    chains,
    summary,
    showAll,
    fileStamp = `${endDate}-${dayjs().format('HHmmss')}`,
  } = options;

  const logoAssets = await loadLogoAssets();
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth(); // 841.89
  const pageH = doc.internal.pageSize.getHeight(); // 595.28
  const marginX = 24;
  const contentW = pageW - marginX * 2;
  const generatedStr = dayjs().format('DD MMM YYYY, HH:mm');
  const dateLabel =
    viewMode === 'daily'
      ? `Production Date: ${endDate} (Baseline: ${monthFrom})`
      : `Date Range: ${rangeStart || monthFrom} to ${endDate}`;
  const chainSummaryText =
    chains.length === 1
      ? chains[0].label
      : `${chains.length} Production Item Chains${showAll ? ' (All Visible)' : ''}`;

  const drawPage1Header = (): number => {
    // Ink-saving soft ice-blue banner with crisp dark navy typography
    doc.setFillColor(239, 246, 255); // #EFF6FF
    doc.setDrawColor(203, 213, 225); // #CBD5E1
    doc.setLineWidth(0.75);
    doc.roundedRect(marginX, 18, contentW, 54, 4, 4, 'FD');
    doc.setFillColor(37, 99, 235); // #2563EB subtle bottom accent
    doc.rect(marginX, 70.5, contentW, 2, 'F');

    let textX = marginX + 12;
    if (logoAssets?.dataUrl) {
      try {
        doc.setFillColor(255, 255, 255);
        doc.setDrawColor(203, 213, 225);
        doc.roundedRect(marginX + 10, 24, 42, 42, 4, 4, 'FD');
        doc.addImage(logoAssets.dataUrl, 'PNG', marginX + 13, 27, 36, 36);
        textX = marginX + 62;
      } catch {
        // Ignore image error
      }
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(15, 23, 42); // #0F172A
    doc.text(companyName, textX, 39);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(30, 58, 138); // #1E3A8A
    doc.text(`${reportTitle}  ·  ${subtitle}`, textX, 53);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(71, 85, 105); // #475569
    doc.text(`Division: ${divisionName}   |   Chain: ${chainSummaryText}`, textX, 64);

    // Right metadata
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(29, 78, 216); // #1D4ED8
    doc.text(dateLabel, pageW - marginX - 12, 38, { align: 'right' });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(51, 65, 85); // #334155
    doc.text(`Generated: ${generatedStr}`, pageW - marginX - 12, 52, { align: 'right' });
    doc.text('Unit Basis: PCS / GRS (144 PCS) / M / KG', pageW - marginX - 12, 63, { align: 'right' });

    // 4-Card KPI Summary Strip
    const kpiY = 82;
    const kpiGap = 10;
    const kpiW = (contentW - kpiGap * 3) / 4;
    const kpiH = 44;

    const kpis = [
      {
        title: showAll ? 'PIPELINE STAGES SHOWN' : 'PIPELINE STAGES',
        value: `${summary.found} / ${summary.total} Stages`,
        sub: summary.found === summary.total ? '100% Sequentially Linked' : `${summary.total - summary.found} Unlinked`,
        accent: [37, 99, 235] as [number, number, number],
      },
      {
        title: viewMode === 'daily' ? 'PRODUCTION CUTOFF' : 'DATE RANGE',
        value: endDate,
        sub: viewMode === 'daily' ? `Anchored: ${monthFrom}` : `${rangeStart || monthFrom} to ${endDate}`,
        accent: [2, 132, 199] as [number, number, number],
      },
      {
        title: 'TOTAL PACKED (TODAY)',
        value: `${fmtNum(summary.totalPacked, summary.packedUom || 'PCS')} ${summary.packedUom || 'PCS'}`,
        sub: 'Finished Goods Packing Output',
        accent: [5, 150, 105] as [number, number, number],
      },
      {
        title: 'MATERIAL RECONCILIATION',
        value: summary.balanced ? '100% Balanced' : 'Discrepancy Detected',
        sub: 'Op + Prod - Issuance = Closing',
        accent: summary.balanced ? ([124, 58, 237] as [number, number, number]) : ([220, 38, 38] as [number, number, number]),
      },
    ];

    kpis.forEach((k, idx) => {
      const x = marginX + idx * (kpiW + kpiGap);
      doc.setFillColor(248, 250, 252);
      doc.setDrawColor(203, 213, 225);
      doc.setLineWidth(0.6);
      doc.roundedRect(x, kpiY, kpiW, kpiH, 4, 4, 'FD');

      doc.setFillColor(...k.accent);
      doc.rect(x, kpiY, kpiW, 2.5, 'F');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7);
      doc.setTextColor(100, 116, 139);
      doc.text(k.title, x + 8, kpiY + 13);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(15, 23, 42);
      doc.text(k.value, x + 8, kpiY + 27);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(...k.accent);
      doc.text(k.sub, x + 8, kpiY + 38);
    });

    return kpiY + kpiH + 12;
  };

  const drawRunningHeader = () => {
    doc.setFillColor(241, 245, 249);
    doc.rect(marginX, 14, contentW, 20, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(15, 23, 42);
    doc.text(`${companyName}  —  ${reportTitle}`, marginX + 8, 27);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(71, 85, 105);
    doc.text(`${divisionName}  |  ${dateLabel}`, pageW - marginX - 8, 27, { align: 'right' });
  };

  let currentY = drawPage1Header();

  // 11-column width budget summing to contentW (793.89pt)
  const colWidths = [
    72, // 0: STAGE
    146, // 1: ITEM (CODE / NAME)
    54, // 2: OP BALANCE
    54, // 3: PRODUCTION
    54, // 4: SUB-TOTAL
    54, // 5: ISSUANCE
    66, // 6: CLOSING PIECES
    30, // 7: UOM
    54, // 8: TOTAL WEIGHT
    96, // 9: PART REJECTION (TODAY & TOTAL)
    0, // 10: REMARKS (remainder)
  ];
  colWidths[10] = contentW - colWidths.slice(0, 10).reduce((a, b) => a + b, 0);

  chains.forEach((chain, chainIdx) => {
    if (chainIdx > 0 && currentY > pageH - 135) {
      doc.addPage();
      drawRunningHeader();
      currentY = 44;
    }

    // Chain section bar (ink-saving light slate tint)
    doc.setFillColor(241, 245, 249); // #F1F5F9
    doc.setDrawColor(203, 213, 225); // #CBD5E1
    doc.setLineWidth(0.6);
    doc.roundedRect(marginX, currentY, contentW, 20, 3, 3, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(15, 23, 42); // #0F172A
    const prefix = chains.length > 1 ? `CHAIN ${chainIdx + 1} OF ${chains.length}: ` : 'ITEM CHAIN: ';
    doc.text(`${prefix}${chain.label}`, marginX + 10, currentY + 13);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(29, 78, 216); // #1D4ED8
    const chainUom = chain.summary.packedUom || 'PCS';
    const chainMeta = `Stages: ${chain.summary.found}/${chain.summary.total}  |  Packed: ${fmtNum(chain.summary.totalPacked, chainUom)} ${chainUom}  |  ${
      chain.summary.balanced ? 'Balanced' : 'Check Discrepancy'
    }`;
    doc.text(chainMeta, pageW - marginX - 10, currentY + 13, { align: 'right' });

    const bodyRows = chain.rows.map((r) => {
      const uomText = r.uomCode || (r.stage === 'RM' ? 'KG' : 'PCS');
      const isKg = r.stage === 'RM' || uomText.toUpperCase() === 'KG';
      const todayRej = formatRejectionLines(r.scrapTodayPcs, r.scrapTodayKg, isKg, uomText);
      const totalRej = formatRejectionLines(r.scrapMonthPcs, r.scrapMonthKg, isKg, uomText);
      const rejText = `Today: ${todayRej.replace('\n', ' ')}\nTotal: ${totalRej.replace('\n', ' ')}`;

      return [
        r.departmentName,
        `${r.itemCode}\n${r.itemName}`,
        formatDualQtyLines(r.opBalance, r.stage, r.uomCode, r.itemCode, false),
        formatDualQtyLines(r.production, r.stage, r.uomCode, r.itemCode, false),
        formatDualQtyLines(r.subTotal, r.stage, r.uomCode, r.itemCode, false),
        r.suppressed ? '—' : formatDualQtyLines(r.issuance, r.stage, r.uomCode, r.itemCode, false),
        formatDualQtyLines(r.closingPieces, r.stage, r.uomCode, r.itemCode, true),
        uomText,
        r.totalWeight !== null ? `${fmtNum(r.totalWeight, 'KG')} KG` : '—',
        rejText,
        r.remarks || '—',
      ];
    });

    autoTable(doc, {
      startY: currentY + 23,
      margin: { top: 42, right: marginX, bottom: 32, left: marginX },
      rowPageBreak: 'avoid',
      theme: 'grid',
      head: [
        [
          'STAGE',
          'ITEM (CODE / NAME)',
          'OP BALANCE',
          'PRODUCTION',
          'SUB-TOTAL',
          'ISSUANCE',
          'CLOSING QTY',
          'UOM',
          'TOTAL WEIGHT',
          'PART REJECTION\n(TODAY & TOTAL)',
          'REMARKS',
        ],
      ],
      body: bodyRows,
      styles: {
        fontSize: 7.4,
        cellPadding: 3,
        overflow: 'linebreak',
        lineWidth: 0.5,
        lineColor: [203, 213, 225],
        textColor: [15, 23, 42],
        valign: 'middle',
      },
      headStyles: {
        fillColor: [241, 245, 249], // #F1F5F9 ink-saving light slate
        textColor: [15, 23, 42], // #0F172A crisp dark navy
        fontStyle: 'bold',
        fontSize: 7.2,
        halign: 'center',
        valign: 'middle',
        cellPadding: 4,
        lineWidth: 0.6,
        lineColor: [203, 213, 225],
      },
      alternateRowStyles: {
        fillColor: [248, 250, 252],
      },
      columnStyles: {
        0: { cellWidth: colWidths[0], halign: 'left', fontStyle: 'bold' },
        1: { cellWidth: colWidths[1], halign: 'left' },
        2: { cellWidth: colWidths[2], halign: 'right' },
        3: { cellWidth: colWidths[3], halign: 'right', fontStyle: 'bold', textColor: [4, 120, 87] },
        4: { cellWidth: colWidths[4], halign: 'right' },
        5: { cellWidth: colWidths[5], halign: 'right' },
        6: { cellWidth: colWidths[6], halign: 'right', fontStyle: 'bold' },
        7: { cellWidth: colWidths[7], halign: 'center', fontStyle: 'bold' },
        8: { cellWidth: colWidths[8], halign: 'right' },
        9: { cellWidth: colWidths[9], halign: 'left', fontSize: 6.9 },
        10: { cellWidth: colWidths[10], halign: 'left', fontSize: 6.9 },
      },
      didParseCell: (data) => {
        if (data.section !== 'body') return;
        const row = chain.rows[data.row.index];
        if (!row) return;

        // Stage badge coloring
        if (data.column.index === 0) {
          const pal = stageBadgePalette(row.stage);
          data.cell.styles.fillColor = pal.bg;
          data.cell.styles.textColor = pal.fg;
        }
        // Negative closing pieces highlight
        if (data.column.index === 6 && row.closingPieces < 0) {
          data.cell.styles.fillColor = [254, 226, 226];
          data.cell.styles.textColor = [185, 28, 28];
        }
        // Rejection highlight
        if (data.column.index === 9 && (row.scrapTodayKg > 0 || row.scrapTodayPcs > 0 || row.scrapMonthKg > 0)) {
          data.cell.styles.fillColor = [255, 247, 237];
          data.cell.styles.textColor = [194, 65, 12];
        }
        // Custom draw for Item Code / Name stacked cleanly
        if (data.column.index === 1) {
          data.cell.text = [''];
        }
      },
      didDrawCell: (data) => {
        if (data.section !== 'body' || data.column.index !== 1) return;
        const row = chain.rows[data.row.index];
        if (!row) return;
        const x = data.cell.x + 4;
        const maxW = Math.max(data.cell.width - 8, 20);
        let y = data.cell.y + 9;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.6);
        doc.setTextColor(2, 132, 199);
        doc.text(row.itemCode, x, y);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.1);
        doc.setTextColor(30, 41, 59);
        const wrapped = doc.splitTextToSize(row.itemName, maxW);
        y += 9;
        doc.text(wrapped, x, y);
      },
      didDrawPage: (data) => {
        if (data.pageNumber > 1) {
          drawRunningHeader();
        }
      },
    });

    const finalY = (doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY ?? currentY + 120;
    currentY = finalY + 14;
  });

  // 3-Column Signature Block
  if (currentY > pageH - 76) {
    doc.addPage();
    drawRunningHeader();
    currentY = 60;
  } else {
    currentY = Math.max(currentY + 10, pageH - 86);
  }

  const sigGap = 24;
  const sigW = (contentW - sigGap * 2) / 3;
  const sigLabels = [
    'Prepared By',
    'Production Manager',
    'Approved By',
  ];
  sigLabels.forEach((lbl, idx) => {
    const sx = marginX + idx * (sigW + sigGap);
    doc.setDrawColor(100, 116, 139);
    doc.setLineWidth(0.75);
    doc.line(sx, currentY + 22, sx + sigW, currentY + 22);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(51, 65, 85);
    doc.text(lbl, sx + sigW / 2, currentY + 34, { align: 'center' });
  });

  // Page X of Y footers across all pages
  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p += 1) {
    doc.setPage(p);
    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(0.5);
    doc.line(marginX, pageH - 22, pageW - marginX, pageH - 22);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.text(`${companyName}  ·  ${divisionName}  ·  Confidential Internal Production Ledger`, marginX, pageH - 11);
    doc.text(`Page ${p} of ${totalPages}`, pageW - marginX, pageH - 11, { align: 'right' });
  }

  doc.save(`item-wise-production-ledger-${fileStamp}.pdf`);
}

/* ============================================================================
 * 2. EXECUTIVE OOXML .XLSX WORKBOOK EXPORT (A4 LANDSCAPE PRINT-READY)
 * ============================================================================ */

interface XlsxCellSpec {
  value: string | number;
  style?: number;
  formula?: string;
}

interface XlsxSheetSpec {
  name: string;
  rows: XlsxCellSpec[][];
  colWidths: number[];
  merges: string[];
  freezeRow: number;
  hasDrawing: boolean;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let k = 0; k < 8; k += 1) {
      c = (c & 1) !== 0 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32Bytes(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) {
    crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function colLetter(idx: number): string {
  let n = idx + 1;
  let out = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

function buildZipBlob(files: { name: string; content: string | Uint8Array }[]): Blob {
  const encoder = new TextEncoder();
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;

  files.forEach((file) => {
    const nameBytes = encoder.encode(file.name);
    const dataBytes = typeof file.content === 'string' ? encoder.encode(file.content) : file.content;
    const crc = crc32Bytes(dataBytes);
    const size = dataBytes.length;

    const lh = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(lh.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, 0x0800, true);
    lv.setUint16(8, 0, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, size, true);
    lv.setUint32(22, size, true);
    lv.setUint16(26, nameBytes.length, true);
    lh.set(nameBytes, 30);
    localParts.push(lh, dataBytes);

    const ch = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(ch.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0x0800, true);
    cv.setUint16(10, 0, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, size, true);
    cv.setUint32(24, size, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint32(42, offset, true);
    ch.set(nameBytes, 46);
    centralParts.push(ch);

    offset += lh.length + dataBytes.length;
  });

  const centralSize = centralParts.reduce((s, p) => s + p.length, 0);
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, files.length, true);
  ev.setUint16(10, files.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);

  return new Blob(
    [
      ...localParts.map((u) => new Uint8Array(u)),
      ...centralParts.map((u) => new Uint8Array(u)),
      new Uint8Array(eocd),
    ],
    { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
  );
}

/**
 * Style indices:
 * 0 = default
 * 1 = Banner title (ink-saving ice-blue #EFF6FF, dark navy bold 14pt, #CBD5E1 border)
 * 2 = Banner subtitle (ink-saving ice-blue #EFF6FF, dark blue #1E3A8A 10pt, #CBD5E1 border)
 * 3 = Metadata / KPI label (soft slate #F1F5F9, bold 9pt)
 * 4 = Metadata / KPI value (white bg, bold 10pt, thin #CBD5E1 border)
 * 5 = Table Header (ink-saving slate #F1F5F9, dark navy #0F172A bold 10pt, wrap, #CBD5E1 border)
 * 6 = Text cell even (left, thin #CBD5E1 border, wrap)
 * 7 = Text cell odd (#F8FAFC, left, thin #CBD5E1 border, wrap)
 * 8 = Center cell even (center, thin #CBD5E1 border)
 * 9 = Center cell odd (#F8FAFC, center, thin #CBD5E1 border)
 * 10 = Integer #,##0 even (right, thin #CBD5E1 border)
 * 11 = Integer #,##0 odd (#F8FAFC, right, thin #CBD5E1 border)
 * 12 = Negative/Alert Integer #,##0 (light red bg, red bold)
 * 13 = Totals Label (slate #F1F5F9, bold, top medium #94A3B8 border)
 * 14 = Totals Integer #,##0 (slate #F1F5F9, bold, top medium #94A3B8 border)
 * 15 = Logo Badge (crisp white bg, thin #CBD5E1 border)
 * 16 = Decimal #,##0.00 even (right, thin #CBD5E1 border)
 * 17 = Decimal #,##0.00 odd (#F8FAFC, right, thin #CBD5E1 border)
 * 18 = Negative/Alert Decimal #,##0.00 (light red bg, red bold)
 * 19 = Totals Dash '—' (centered, slate #F1F5F9, bold, top medium #94A3B8 border)
 * 20 = Totals Decimal #,##0.00 (slate #F1F5F9, bold, top medium #94A3B8 border)
 * 21 = GRS Integer #,##0 even (bold dark blue #1D4ED8, right, thin #CBD5E1 border)
 * 22 = GRS Integer #,##0 odd (#F8FAFC, bold dark blue #1D4ED8, right, thin #CBD5E1 border)
 * 23 = GRS Decimal #,##0.00 even (bold dark blue #1D4ED8, right, thin #CBD5E1 border)
 * 24 = GRS Decimal #,##0.00 odd (#F8FAFC, bold dark blue #1D4ED8, right, thin #CBD5E1 border)
 * 25 = 4-Decimal Unit Weight #,##0.0000 even (right, thin #CBD5E1 border)
 * 26 = 4-Decimal Unit Weight #,##0.0000 odd (#F8FAFC, right, thin #CBD5E1 border)
 */
function buildExcelStylesXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <numFmts count="3">
    <numFmt numFmtId="164" formatCode="#,##0"/>
    <numFmt numFmtId="165" formatCode="#,##0.00"/>
    <numFmt numFmtId="166" formatCode="#,##0.0000"/>
  </numFmts>
  <fonts count="8">
    <font><sz val="10"/><name val="Calibri"/><color rgb="FF0F172A"/></font>
    <font><b/><sz val="14"/><name val="Calibri"/><color rgb="FF0F172A"/></font>
    <font><b/><sz val="10"/><name val="Calibri"/><color rgb="FF1E3A8A"/></font>
    <font><b/><sz val="9"/><name val="Calibri"/><color rgb="FF334155"/></font>
    <font><b/><sz val="10"/><name val="Calibri"/><color rgb="FF0F172A"/></font>
    <font><b/><sz val="10"/><name val="Calibri"/><color rgb="FF0F172A"/></font>
    <font><b/><sz val="10"/><name val="Calibri"/><color rgb="FFB91C1C"/></font>
    <font><b/><sz val="10"/><name val="Calibri"/><color rgb="FF1D4ED8"/></font>
  </fonts>
  <fills count="8">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFEFF6FF"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFF1F5F9"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFF1F5F9"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFF8FAFC"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFFEE2E2"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFFFFFFF"/></patternFill></fill>
  </fills>
  <borders count="3">
    <border><left/><right/><top/><bottom/><diagonal/></border>
    <border>
      <left style="thin"><color rgb="FFCBD5E1"/></left>
      <right style="thin"><color rgb="FFCBD5E1"/></right>
      <top style="thin"><color rgb="FFCBD5E1"/></top>
      <bottom style="thin"><color rgb="FFCBD5E1"/></bottom>
      <diagonal/>
    </border>
    <border>
      <left style="thin"><color rgb="FFCBD5E1"/></left>
      <right style="thin"><color rgb="FFCBD5E1"/></right>
      <top style="medium"><color rgb="FF94A3B8"/></top>
      <bottom style="double"><color rgb="FF94A3B8"/></bottom>
      <diagonal/>
    </border>
  </borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="27">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" horizontal="left"/></xf>
    <xf numFmtId="0" fontId="2" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" horizontal="left"/></xf>
    <xf numFmtId="0" fontId="3" fillId="4" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" horizontal="left"/></xf>
    <xf numFmtId="0" fontId="4" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" horizontal="left"/></xf>
    <xf numFmtId="0" fontId="5" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" horizontal="center" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" horizontal="left" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="0" fillId="5" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" horizontal="left" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="4" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" horizontal="center"/></xf>
    <xf numFmtId="0" fontId="4" fillId="5" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" horizontal="center"/></xf>
    <xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" horizontal="right"/></xf>
    <xf numFmtId="164" fontId="0" fillId="5" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" horizontal="right"/></xf>
    <xf numFmtId="164" fontId="6" fillId="6" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" horizontal="right"/></xf>
    <xf numFmtId="0" fontId="4" fillId="4" borderId="2" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" horizontal="left" wrapText="1"/></xf>
    <xf numFmtId="164" fontId="4" fillId="4" borderId="2" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" horizontal="right"/></xf>
    <xf numFmtId="0" fontId="0" fillId="7" borderId="1" xfId="0" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" horizontal="center"/></xf>
    <xf numFmtId="165" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" horizontal="right"/></xf>
    <xf numFmtId="165" fontId="0" fillId="5" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" horizontal="right"/></xf>
    <xf numFmtId="165" fontId="6" fillId="6" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" horizontal="right"/></xf>
    <xf numFmtId="0" fontId="4" fillId="4" borderId="2" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" horizontal="center"/></xf>
    <xf numFmtId="165" fontId="4" fillId="4" borderId="2" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" horizontal="right"/></xf>
    <xf numFmtId="164" fontId="7" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" horizontal="right"/></xf>
    <xf numFmtId="164" fontId="7" fillId="5" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" horizontal="right"/></xf>
    <xf numFmtId="165" fontId="7" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" horizontal="right"/></xf>
    <xf numFmtId="165" fontId="7" fillId="5" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" horizontal="right"/></xf>
    <xf numFmtId="166" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" horizontal="right"/></xf>
    <xf numFmtId="166" fontId="0" fillId="5" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" horizontal="right"/></xf>
  </cellXfs>
</styleSheet>`;
}

function buildExcelWorksheetXml(sheet: XlsxSheetSpec): string {
  const freezeXml =
    sheet.freezeRow > 0
      ? `<sheetViews><sheetView workbookViewId="0"><pane ySplit="${sheet.freezeRow}" topLeftCell="A${sheet.freezeRow + 1}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>`
      : '<sheetViews><sheetView workbookViewId="0"/></sheetViews>';

  const colsXml = `<cols>${sheet.colWidths
    .map((w, idx) => `<col min="${idx + 1}" max="${idx + 1}" width="${Math.max(8, Math.min(50, w))}" customWidth="1"/>`)
    .join('')}</cols>`;

  const rowsXml = sheet.rows
    .map((row, rIdx) => {
      const rNum = rIdx + 1;
      const isHeader = row.some((c) => c.style === 5);
      const isTotals = row.some((c) => c.style === 13 || c.style === 14 || c.style === 19 || c.style === 20);
      const hasLongText =
        rIdx >= 5 &&
        row.some((c) => typeof c.value === 'string' && c.value.length > 34);
      const ht =
        rIdx === 0
          ? 32
          : rIdx === 1
          ? 22
          : isHeader
          ? 28
          : isTotals
          ? 26
          : rIdx >= 5
          ? hasLongText
            ? 34
            : 24
          : 20;
      const cellsXml = row
        .map((cell, cIdx) => {
          const ref = `${colLetter(cIdx)}${rNum}`;
          const sAttr = cell.style !== undefined ? ` s="${cell.style}"` : '';
          if (cell.formula) {
            const fallback = typeof cell.value === 'number' ? `<v>${cell.value}</v>` : '<v>0</v>';
            return `<c r="${ref}"${sAttr}><f>${escapeXml(cell.formula)}</f>${fallback}</c>`;
          }
          if (typeof cell.value === 'number' && Number.isFinite(cell.value)) {
            return `<c r="${ref}"${sAttr}><v>${cell.value}</v></c>`;
          }
          return `<c r="${ref}" t="inlineStr"${sAttr}><is><t>${escapeXml(cell.value)}</t></is></c>`;
        })
        .join('');
      return `<row r="${rNum}" ht="${ht}" customHeight="1">${cellsXml}</row>`;
    })
    .join('');

  const mergesXml =
    sheet.merges.length > 0
      ? `<mergeCells count="${sheet.merges.length}">${sheet.merges.map((m) => `<mergeCell ref="${m}"/>`).join('')}</mergeCells>`
      : '';

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>
  ${freezeXml}
  ${colsXml}
  <sheetData>${rowsXml}</sheetData>
  ${mergesXml}
  <pageMargins left="0.3" right="0.3" top="0.4" bottom="0.4" header="0.2" footer="0.2"/>
  <pageSetup orientation="landscape" paperSize="9" fitToWidth="1" fitToHeight="0"/>
  ${sheet.hasDrawing ? '<drawing r:id="rId1"/>' : ''}
</worksheet>`;
}

function sanitizeSheetName(raw: string, usedNames: Set<string>): string {
  const cleaned = raw.replace(/[\\/?*[\]:]/g, ' ').replace(/\s+/g, ' ').trim() || 'Ledger';
  let candidate = cleaned.slice(0, 31);
  let counter = 2;
  while (usedNames.has(candidate.toLowerCase())) {
    const suffix = ` (${counter})`;
    candidate = `${cleaned.slice(0, 31 - suffix.length)}${suffix}`;
    counter += 1;
  }
  usedNames.add(candidate.toLowerCase());
  return candidate;
}

export async function exportProductionLedgerExcel(options: ProductionLedgerExportOptions): Promise<void> {
  const {
    companyName = 'PWI — Pakistan Wire Industries (Pvt.) LTD',
    reportTitle = 'Item-Wise Production Ledger',
    divisionName,
    viewMode,
    endDate,
    monthFrom,
    rangeStart,
    chains,
    fileStamp = `${endDate}-${dayjs().format('HHmmss')}`,
  } = options;

  const logoAssets = await loadLogoAssets();
  const hasLogo = Boolean(logoAssets?.bytes);
  const generatedStr = dayjs().format('DD MMM YYYY HH:mm');
  const dateLabel =
    viewMode === 'daily'
      ? `${endDate} (Baseline: ${monthFrom})`
      : `${rangeStart || monthFrom} to ${endDate}`;

  const headers = [
    'Stage',
    'Department',
    'Item Code',
    'Item Name',
    'Op Balance',
    'Op Balance (GRS)',
    'Production',
    'Sub-Total',
    'Issuance',
    'Closing Qty',
    'Closing (GRS)',
    'UOM',
    'Unit Weight',
    'Total Weight (KG)',
    'Rejection Today (Qty)',
    'Rejection Today (KG)',
    'Rejection Total (Qty)',
    'Rejection Total (KG)',
    'Remarks',
  ];

  const usedSheetNames = new Set<string>();
  const sheets: XlsxSheetSpec[] = chains.map((chain) => {
    const sheetName = sanitizeSheetName(chain.label, usedSheetNames);
    const rows: XlsxCellSpec[][] = [];
    const merges: string[] = [];
    const lastCol = colLetter(headers.length - 1);

    // Row 1 & 2: Company Banner (white badge on A1:A2 so dark circular logo pops cleanly)
    const bannerStartCol = hasLogo ? 'B' : 'A';
    rows.push(
      headers.map((_, idx) =>
        idx === 0 && hasLogo
          ? { value: '', style: 15 }
          : {
              value: idx === (hasLogo ? 1 : 0) ? `${companyName} — ${reportTitle}` : '',
              style: 1,
            },
      ),
    );
    merges.push(`${bannerStartCol}1:${lastCol}1`);

    rows.push(
      headers.map((_, idx) =>
        idx === 0 && hasLogo
          ? { value: '', style: 15 }
          : {
              value: idx === (hasLogo ? 1 : 0) ? `Item Chain: ${chain.label}  |  Division: ${divisionName}  |  Period: ${dateLabel}` : '',
              style: 2,
            },
      ),
    );
    merges.push(`${bannerStartCol}2:${lastCol}2`);
    if (hasLogo) {
      merges.push('A1:A2');
    }

    const packedUomLabel = chain.summary.packedUom || 'PCS';
    const packedCountUnit = isCountUnit(packedUomLabel);

    // Row 3: Metadata & KPI Summary Strip
    rows.push([
      { value: 'Division', style: 3 },
      { value: divisionName, style: 4 },
      { value: 'Pipeline Stages', style: 3 },
      { value: `${chain.summary.found} / ${chain.summary.total}`, style: 4 },
      { value: `Packed Today (${packedUomLabel})`, style: 3 },
      { value: roundNum(chain.summary.totalPacked, packedCountUnit ? 0 : 2), style: packedCountUnit ? 10 : 16 },
      { value: 'Reconciliation', style: 3 },
      { value: chain.summary.balanced ? '100% Balanced' : 'Discrepancy', style: 4 },
      { value: 'Generated', style: 3 },
      { value: generatedStr, style: 4 },
    ]);
    merges.push('J3:S3');

    // Row 4: Blank spacer
    rows.push([]);

    // Row 5: Table Header
    rows.push(headers.map((h) => ({ value: h, style: 5 })));
    const dataStartRow = 6;

    chain.rows.forEach((r, idx) => {
      const odd = idx % 2 === 1;
      const txtStyle = odd ? 7 : 6;
      const ctrStyle = odd ? 9 : 8;
      const intStyle = odd ? 11 : 10;
      const decStyle = odd ? 17 : 16;
      const unitWtStyle = odd ? 26 : 25;
      const uomText = r.uomCode || (r.stage === 'RM' ? 'KG' : 'PCS');
      const isCount = isCountUnit(uomText);
      const isKgRow = r.stage === 'RM' || uomText.trim().toUpperCase() === 'KG';
      const qtyStyle = isCount ? intStyle : decStyle;
      const closeStyle = r.closingPieces < 0 ? (isCount ? 12 : 18) : qtyStyle;
      const opGrs = getGrsValue(r.opBalance, r.uomCode);
      const closeGrs = getGrsValue(r.closingPieces, r.uomCode);
      const grsStyle = (v: number | null) =>
        v !== null && Number.isInteger(v) ? (odd ? 22 : 21) : odd ? 24 : 23;
      const unitWeightCell: XlsxCellSpec = isKgRow
        ? { value: 1, style: unitWtStyle }
        : r.perPieceWeight !== null && r.perPieceWeight !== undefined
        ? { value: roundNum(r.perPieceWeight, 4), style: unitWtStyle }
        : { value: '—', style: ctrStyle };

      rows.push([
        { value: r.stage, style: ctrStyle },
        { value: r.departmentName, style: txtStyle },
        { value: r.itemCode, style: txtStyle },
        { value: r.itemName, style: txtStyle },
        { value: roundNum(r.opBalance, isCount ? 0 : 2), style: qtyStyle },
        { value: opGrs ?? '—', style: opGrs === null ? ctrStyle : grsStyle(opGrs) },
        { value: roundNum(r.production, isCount ? 0 : 2), style: qtyStyle },
        { value: roundNum(r.subTotal, isCount ? 0 : 2), style: qtyStyle },
        { value: r.suppressed ? 0 : roundNum(r.issuance, isCount ? 0 : 2), style: qtyStyle },
        { value: roundNum(r.closingPieces, isCount ? 0 : 2), style: closeStyle },
        { value: closeGrs ?? '—', style: closeGrs === null ? ctrStyle : grsStyle(closeGrs) },
        { value: uomText, style: ctrStyle },
        unitWeightCell,
        { value: r.totalWeight !== null ? roundNum(r.totalWeight, 2) : 0, style: decStyle },
        { value: roundNum(r.scrapTodayPcs, 0), style: r.scrapTodayPcs > 0 ? 12 : intStyle },
        { value: roundNum(r.scrapTodayKg, 2), style: r.scrapTodayKg > 0 ? 18 : decStyle },
        { value: roundNum(r.scrapMonthPcs, 0), style: r.scrapMonthPcs > 0 ? 12 : intStyle },
        { value: roundNum(r.scrapMonthKg, 2), style: r.scrapMonthKg > 0 ? 18 : decStyle },
        { value: r.remarks || '—', style: txtStyle },
      ]);
    });

    const dataEndRow = dataStartRow + chain.rows.length - 1;
    // Sequential stage balances (Op Balance, Sub-Total, Issuance, Closing Balance) and Unit Weight are NOT summed across mixed units/stages.
    // Only true aggregate metrics are shown: FG Packed Output (Col 6), Total Weight (Col 13), and Part Rejections (Cols 14–17).
    const dashCols = new Set([4, 5, 7, 8, 9, 10, 12]);
    const intSumCols = new Set([14, 16]);
    const decSumCols = new Set([13, 15, 17]);
    const totalsRow: XlsxCellSpec[] = headers.map((_, cIdx) => {
      if (cIdx === 0) return { value: 'SUMMARY', style: 13 };
      if (cIdx === 1) return { value: 'FG Packed / Weight / Rej', style: 13 };
      if (dashCols.has(cIdx)) return { value: '—', style: 19 };
      if (cIdx === 6 && chain.rows.length > 0) {
        return {
          value: roundNum(chain.summary.totalPacked, packedCountUnit ? 0 : 2),
          formula: `SUMIF(A${dataStartRow}:A${dataEndRow},"FG",G${dataStartRow}:G${dataEndRow})`,
          style: packedCountUnit ? 14 : 20,
        };
      }
      if (intSumCols.has(cIdx) && chain.rows.length > 0) {
        const col = colLetter(cIdx);
        return {
          value: 0,
          formula: `SUM(${col}${dataStartRow}:${col}${dataEndRow})`,
          style: 14,
        };
      }
      if (decSumCols.has(cIdx) && chain.rows.length > 0) {
        const col = colLetter(cIdx);
        return {
          value: 0,
          formula: `SUM(${col}${dataStartRow}:${col}${dataEndRow})`,
          style: 20,
        };
      }
      return { value: '', style: 13 };
    });
    rows.push(totalsRow);

    const colWidths = [
      10, // Stage
      22, // Department
      22, // Item Code
      44, // Item Name
      14, // Op Balance
      14, // Op Balance (GRS)
      14, // Production
      14, // Sub-Total
      14, // Issuance
      15, // Closing Balance
      14, // Closing (GRS)
      8, // UOM
      14, // Unit Weight
      16, // Total Weight (KG)
      16, // Rej Today Qty
      16, // Rej Today KG
      16, // Rej Total Qty
      16, // Rej Total KG
      30, // Remarks
    ];

    return {
      name: sheetName,
      rows,
      colWidths,
      merges,
      freezeRow: 5,
      hasDrawing: hasLogo,
    };
  });

  const contentTypesSheets = sheets
    .map(
      (_, i) =>
        `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
    )
    .join('');

  const workbookSheets = sheets
    .map((s, i) => `<sheet name="${escapeXml(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`)
    .join('');

  const workbookRels = sheets
    .map(
      (_, i) =>
        `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`,
    )
    .join('');

  const zipFiles: { name: string; content: string | Uint8Array }[] = [
    {
      name: '[Content_Types].xml',
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Default Extension="png" ContentType="image/png"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
  ${hasLogo ? '<Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>' : ''}
  ${contentTypesSheets}
</Types>`,
    },
    {
      name: '_rels/.rels',
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`,
    },
    {
      name: 'xl/workbook.xml',
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>${workbookSheets}</sheets>
</workbook>`,
    },
    {
      name: 'xl/_rels/workbook.xml.rels',
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  ${workbookRels}
  <Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`,
    },
    {
      name: 'xl/styles.xml',
      content: buildExcelStylesXml(),
    },
  ];

  if (hasLogo && logoAssets?.bytes) {
    zipFiles.push({ name: 'xl/media/image1.png', content: logoAssets.bytes });
    zipFiles.push({
      name: 'xl/drawings/drawing1.xml',
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <xdr:twoCellAnchor editAs="oneCell">
    <xdr:from><xdr:col>0</xdr:col><xdr:colOff>38100</xdr:colOff><xdr:row>0</xdr:row><xdr:rowOff>38100</xdr:rowOff></xdr:from>
    <xdr:to><xdr:col>0</xdr:col><xdr:colOff>640000</xdr:colOff><xdr:row>1</xdr:row><xdr:rowOff>200000</xdr:rowOff></xdr:to>
    <xdr:pic>
      <xdr:nvPicPr><xdr:cNvPr id="2" name="CompanyLogo"/><xdr:cNvPicPr/></xdr:nvPicPr>
      <xdr:blipFill><a:blip r:embed="rId1"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill>
      <xdr:spPr><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr>
    </xdr:pic>
    <xdr:clientData/>
  </xdr:twoCellAnchor>
</xdr:wsDr>`,
    });
    zipFiles.push({
      name: 'xl/drawings/_rels/drawing1.xml.rels',
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image1.png"/>
</Relationships>`,
    });
  }

  sheets.forEach((sheet, i) => {
    zipFiles.push({
      name: `xl/worksheets/sheet${i + 1}.xml`,
      content: buildExcelWorksheetXml(sheet),
    });
    if (sheet.hasDrawing) {
      zipFiles.push({
        name: `xl/worksheets/_rels/sheet${i + 1}.xml.rels`,
        content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing1.xml"/>
</Relationships>`,
      });
    }
  });

  const blob = buildZipBlob(zipFiles);
  triggerBlobDownload(blob, `item-wise-production-ledger-${fileStamp}.xlsx`);
}

/* ============================================================================
 * 3. EXECUTIVE PRINT VIEW (A4 LANDSCAPE)
 * ============================================================================ */

export async function printProductionLedgerReport(options: ProductionLedgerExportOptions): Promise<void> {
  const {
    companyName = 'PWI — Pakistan Wire Industries (Pvt.) LTD',
    subtitle = 'ERP / MRP Command Center — Manufacturing Division',
    reportTitle = 'Item-Wise Production Ledger',
    divisionName,
    viewMode,
    endDate,
    monthFrom,
    rangeStart,
    chains,
    summary,
    showAll,
  } = options;

  const logoAssets = await loadLogoAssets();
  const logoSrc = logoAssets?.dataUrl || getLogoUrl();
  const generatedStr = dayjs().format('DD MMM YYYY, HH:mm');
  const dateLabel =
    viewMode === 'daily'
      ? `Production Date: ${endDate} (Baseline: ${monthFrom})`
      : `Date Range: ${rangeStart || monthFrom} to ${endDate}`;
  const chainSummaryText =
    chains.length === 1
      ? chains[0].label
      : `${chains.length} Production Item Chains${showAll ? ' (All Visible)' : ''}`;

  const renderUnitCell = (
    qty: number,
    stage: string,
    uom: string | null,
    itemCode: string,
    includeCartons = false,
  ): string => {
    const main = escapeHtml(fmtNum(qty, uom));
    const u = (uom ?? (stage === 'RM' ? 'KG' : 'PCS')).trim().toUpperCase();
    if (u === 'KG') return `<div class="val-main">${main}</div>`;
    const grs = getGrsValue(qty, uom);
    const ctn = includeCartons ? getCartonsValue(qty, stage, uom, itemCode) : null;
    return `
      <div class="val-main">${main}</div>
      ${ctn !== null ? `<div class="sub-unit ctn">${ctn.toLocaleString('en-US', { maximumFractionDigits: 1 })} CTN</div>` : ''}
      ${grs !== null ? `<div class="sub-unit grs">${grs.toLocaleString('en-US', { maximumFractionDigits: 1 })} GRS</div>` : ''}
    `;
  };

  const chainsHtml = chains
    .map((chain, idx) => {
      const rowsHtml = chain.rows
        .map((r) => {
          const pal = stageBadgePalette(r.stage);
          const uomText = r.uomCode || (r.stage === 'RM' ? 'KG' : 'PCS');
          const isKg = r.stage === 'RM' || uomText.toUpperCase() === 'KG';
          const todayRej = formatRejectionLines(r.scrapTodayPcs, r.scrapTodayKg, isKg, uomText).replace('\n', ' ');
          const totalRej = formatRejectionLines(r.scrapMonthPcs, r.scrapMonthKg, isKg, uomText).replace('\n', ' ');
          const hasRej = r.scrapTodayKg > 0 || r.scrapTodayPcs > 0 || r.scrapMonthKg > 0;

          return `
            <tr>
              <td>
                <span class="stage-pill" style="background:${pal.hexBg};color:${pal.hexFg};">${escapeHtml(r.departmentName)}</span>
              </td>
              <td class="col-item">
                <div class="it-code">${escapeHtml(r.itemCode)}</div>
                <div class="it-name">${escapeHtml(r.itemName)}</div>
              </td>
              <td class="col-num">${renderUnitCell(r.opBalance, r.stage, r.uomCode, r.itemCode)}</td>
              <td class="col-num col-prod">${renderUnitCell(r.production, r.stage, r.uomCode, r.itemCode)}</td>
              <td class="col-num">${renderUnitCell(r.subTotal, r.stage, r.uomCode, r.itemCode)}</td>
              <td class="col-num">${r.suppressed ? '<span class="muted">—</span>' : renderUnitCell(r.issuance, r.stage, r.uomCode, r.itemCode)}</td>
              <td class="col-num ${r.closingPieces < 0 ? 'neg-val' : 'col-close'}">${renderUnitCell(r.closingPieces, r.stage, r.uomCode, r.itemCode, true)}</td>
              <td class="col-uom">${escapeHtml(uomText)}</td>
              <td class="col-num">${r.totalWeight !== null ? `${escapeHtml(fmtNum(r.totalWeight, 'KG'))} KG` : '—'}</td>
              <td class="col-rej ${hasRej ? 'rej-active' : ''}">
                <div><strong>Today:</strong> ${escapeHtml(todayRej)}</div>
                <div><strong>Total:</strong> ${escapeHtml(totalRej)}</div>
              </td>
              <td class="col-rem">${escapeHtml(r.remarks || '—')}</td>
            </tr>
          `;
        })
        .join('');

      const chainUom = chain.summary.packedUom || 'PCS';
      return `
        <section class="chain-section ${idx > 0 ? 'chain-gap' : ''}">
          <div class="chain-bar">
            <span>${chains.length > 1 ? `CHAIN ${idx + 1} OF ${chains.length}: ` : 'ITEM CHAIN: '}${escapeHtml(chain.label)}</span>
            <span class="chain-meta">Stages: ${chain.summary.found}/${chain.summary.total} &nbsp;|&nbsp; Packed: ${escapeHtml(fmtNum(chain.summary.totalPacked, chainUom))} ${escapeHtml(chainUom)} &nbsp;|&nbsp; ${chain.summary.balanced ? '100% Balanced' : 'Discrepancy'}</span>
          </div>
          <table>
            <thead>
              <tr>
                <th style="width:92px;">STAGE</th>
                <th style="width:155px;text-align:left;">ITEM (CODE / NAME)</th>
                <th style="width:68px;">OP BALANCE</th>
                <th style="width:68px;">PRODUCTION</th>
                <th style="width:68px;">SUB-TOTAL</th>
                <th style="width:68px;">ISSUANCE</th>
                <th style="width:78px;">CLOSING QTY</th>
                <th style="width:36px;">UOM</th>
                <th style="width:66px;">TOTAL WEIGHT</th>
                <th style="width:118px;">PART REJECTION (TODAY & TOTAL)</th>
                <th>REMARKS</th>
              </tr>
            </thead>
            <tbody>${rowsHtml}</tbody>
          </table>
        </section>
      `;
    })
    .join('');

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(reportTitle)} - ${escapeHtml(endDate)}</title>
  <style>
    @page { size: A4 landscape; margin: 7mm 8mm; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;
      background: #ffffff !important;
      color: #0f172a !important;
      font-size: 8.5pt;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: #eff6ff;
      color: #0f172a;
      padding: 10px 14px;
      border-radius: 6px;
      border: 1px solid #cbd5e1;
      border-bottom: 2.5px solid #2563eb;
      margin-bottom: 10px;
    }
    .header-left { display: flex; align-items: center; gap: 12px; }
    .header-logo {
      width: 42px; height: 42px; border-radius: 6px; background: #ffffff;
      border: 1px solid #cbd5e1; padding: 3px; object-fit: contain;
    }
    .company-name { font-size: 13.5pt; font-weight: 800; letter-spacing: 0.2px; color: #0f172a; }
    .report-sub { font-size: 8.5pt; color: #1e3a8a; margin-top: 2px; font-weight: 600; }
    .header-right { text-align: right; font-size: 8pt; color: #334155; line-height: 1.45; }
    .header-date { font-size: 9pt; font-weight: 700; color: #1d4ed8; }
    .kpi-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 8px;
      margin-bottom: 10px;
    }
    .kpi-card {
      border: 1px solid #cbd5e1;
      border-top: 3px solid #2563eb;
      border-radius: 5px;
      padding: 6px 10px;
      background: #f8fafc;
    }
    .kpi-title { font-size: 6.8pt; font-weight: 700; color: #64748b; letter-spacing: 0.4px; }
    .kpi-val { font-size: 10.5pt; font-weight: 800; color: #0f172a; margin-top: 2px; }
    .kpi-sub { font-size: 7pt; color: #0369a1; margin-top: 1px; }
    .chain-gap { margin-top: 12px; }
    .chain-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: #f1f5f9;
      color: #0f172a;
      border: 1px solid #cbd5e1;
      border-bottom: none;
      padding: 5px 10px;
      font-weight: 700;
      font-size: 8.5pt;
      border-radius: 4px 4px 0 0;
    }
    .chain-meta { font-weight: 600; font-size: 7.8pt; color: #1d4ed8; }
    table {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
    }
    th {
      background: #f1f5f9;
      color: #0f172a;
      font-size: 7pt;
      font-weight: 700;
      padding: 5px 4px;
      border: 1px solid #cbd5e1;
      text-align: center;
    }
    td {
      border: 1px solid #e2e8f0;
      padding: 4px 5px;
      vertical-align: middle;
      font-size: 7.6pt;
    }
    tr { break-inside: avoid; page-break-inside: avoid; }
    tbody tr:nth-child(even) { background: #f8fafc; }
    .stage-pill {
      display: inline-block;
      padding: 2px 6px;
      border-radius: 4px;
      font-weight: 700;
      font-size: 7.2pt;
    }
    .col-item { text-align: left; }
    .it-code { font-weight: 800; color: #0284c7; font-size: 7.8pt; }
    .it-name { font-size: 7.2pt; color: #1e293b; margin-top: 1px; line-height: 1.15; }
    .col-num { text-align: right; font-variant-numeric: tabular-nums; }
    .col-prod .val-main { color: #047857; }
    .col-close .val-main { color: #0f172a; }
    .neg-val { background: #fee2e2 !important; color: #b91c1c !important; }
    .val-main { font-weight: 700; font-size: 8pt; }
    .sub-unit { font-size: 6.5pt; font-weight: 600; line-height: 1.15; }
    .sub-unit.ctn { color: #0284c7; }
    .sub-unit.grs { color: #1d4ed8; font-weight: 700; }
    .col-uom { text-align: center; font-weight: 700; color: #334155; }
    .col-rej { font-size: 6.9pt; line-height: 1.25; }
    .rej-active { background: #fff7ed !important; color: #c2410c !important; }
    .col-rem { font-size: 7pt; color: #334155; }
    .muted { color: #94a3b8; }
    .sig-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 28px;
      margin-top: 22px;
      break-inside: avoid;
      page-break-inside: avoid;
    }
    .sig-box {
      border-top: 1px solid #475569;
      padding-top: 5px;
      text-align: center;
      font-weight: 700;
      font-size: 8pt;
      color: #334155;
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="header-left">
      <img src="${escapeHtml(logoSrc)}" class="header-logo" onerror="this.style.display='none'" />
      <div>
        <div class="company-name">${escapeHtml(companyName)}</div>
        <div class="report-sub">${escapeHtml(reportTitle)} &nbsp;·&nbsp; ${escapeHtml(subtitle)}</div>
        <div class="report-sub">Division: ${escapeHtml(divisionName)} &nbsp;|&nbsp; Chain: ${escapeHtml(chainSummaryText)}</div>
      </div>
    </div>
    <div class="header-right">
      <div class="header-date">${escapeHtml(dateLabel)}</div>
      <div>Generated: ${escapeHtml(generatedStr)}</div>
      <div>Unit Basis: PCS / GRS (144 PCS) / M / KG</div>
    </div>
  </div>

  <div class="kpi-grid">
    <div class="kpi-card">
      <div class="kpi-title">${showAll ? 'PIPELINE STAGES SHOWN' : 'PIPELINE STAGES'}</div>
      <div class="kpi-val">${summary.found} / ${summary.total} Stages</div>
      <div class="kpi-sub">${summary.found === summary.total ? '100% Sequentially Linked' : `${summary.total - summary.found} Unlinked`}</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-title">${viewMode === 'daily' ? 'PRODUCTION CUTOFF' : 'DATE RANGE'}</div>
      <div class="kpi-val">${escapeHtml(endDate)}</div>
      <div class="kpi-sub">${escapeHtml(viewMode === 'daily' ? `Anchored: ${monthFrom}` : `${rangeStart || monthFrom} to ${endDate}`)}</div>
    </div>
    <div class="kpi-card" style="border-top-color:#10b981;">
      <div class="kpi-title">TOTAL PACKED (TODAY)</div>
      <div class="kpi-val" style="color:#047857;">${escapeHtml(fmtNum(summary.totalPacked, summary.packedUom || 'PCS'))} ${escapeHtml(summary.packedUom || 'PCS')}</div>
      <div class="kpi-sub" style="color:#059669;">Finished Goods Packing Output</div>
    </div>
    <div class="kpi-card" style="border-top-color:${summary.balanced ? '#8b5cf6' : '#ef4444'};">
      <div class="kpi-title">MATERIAL RECONCILIATION</div>
      <div class="kpi-val" style="color:${summary.balanced ? '#6d28d9' : '#dc2626'};">${summary.balanced ? '100% Balanced' : 'Discrepancy Detected'}</div>
      <div class="kpi-sub" style="color:#64748b;">Op + Prod - Issuance = Closing</div>
    </div>
  </div>

  ${chainsHtml}

  <div class="sig-grid">
    <div class="sig-box">Prepared By</div>
    <div class="sig-box">Production Manager</div>
    <div class="sig-box">Approved By</div>
  </div>
</body>
</html>`;

  let printFrame = document.getElementById('iwl-print-iframe') as HTMLIFrameElement | null;
  if (printFrame) printFrame.remove();
  printFrame = document.createElement('iframe');
  printFrame.id = 'iwl-print-iframe';
  printFrame.style.position = 'fixed';
  printFrame.style.right = '0';
  printFrame.style.bottom = '0';
  printFrame.style.width = '0';
  printFrame.style.height = '0';
  printFrame.style.border = '0';
  printFrame.style.visibility = 'hidden';
  document.body.appendChild(printFrame);

  const doc = printFrame.contentWindow?.document;
  if (!doc) {
    window.print();
    return;
  }

  doc.open();
  doc.write(html);
  doc.close();

  let printed = false;
  const triggerPrint = () => {
    if (printed) return;
    printed = true;
    const frameWin = printFrame?.contentWindow;
    if (!frameWin) return;
    frameWin.focus();
    frameWin.print();
  };

  // Ensure embedded logo image finishes decoding before invoking print preview
  const imgs = Array.from(doc.querySelectorAll('img'));
  const pendingImgs = imgs.filter((img) => !img.complete);
  if (pendingImgs.length > 0) {
    let remaining = pendingImgs.length;
    const onImgDone = () => {
      remaining -= 1;
      if (remaining <= 0) setTimeout(triggerPrint, 100);
    };
    pendingImgs.forEach((img) => {
      img.addEventListener('load', onImgDone, { once: true });
      img.addEventListener('error', onImgDone, { once: true });
    });
    setTimeout(triggerPrint, 600);
  } else {
    setTimeout(triggerPrint, 180);
  }
}
