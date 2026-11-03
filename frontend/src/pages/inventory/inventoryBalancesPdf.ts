/* ─────────────────────────────────────────────────────────────────────────────
 * inventoryBalancesPdf.ts — Professional PDF & Print Export for Current Stock Balances
 * Pakistan Wire Industries (Pvt.) Ltd.
 * ──────────────────────────────────────────────────────────────────────────── */

import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { formatNumber } from '../../utils/numberFormat';
import { STANDARD_ITEM_WEIGHTS } from '../production/ItemWiseProductionLedger';

export interface InventoryBalanceExportRow {
  itemCode: string;
  itemName: string;
  warehouseName: string;
  warehouseCode?: string;
  onHand: number;
  reserved: number;
  available: number;
  uomCode: string;
  weightPerPiece?: number | string | null;
  grossText?: string;
  cartonText?: string;
}

export const getItemWeightKg = (
  itemCode?: string,
  weightPerPiece?: number | string | null,
): number => {
  const n = Number(weightPerPiece);
  if (!isNaN(n) && n > 0) return n;
  const code = (itemCode || '').trim();
  if (code && STANDARD_ITEM_WEIGHTS[code]) return STANDARD_ITEM_WEIGHTS[code];
  return 0;
};

export const calculateWeightKg = (
  qty: number,
  uomCode?: string,
  itemCode?: string,
  weightPerPiece?: number | string | null,
): number => {
  if (qty === 0) return 0;
  const uom = (uomCode || '').trim().toUpperCase();
  if (uom === 'KG') return Math.abs(qty);
  const w = getItemWeightKg(itemCode, weightPerPiece);
  if (w <= 0) return 0;
  if (['GRS', 'GR', 'GROSS'].includes(uom)) {
    return Math.abs(qty) * 144 * w;
  }
  return Math.abs(qty) * w;
};

export function exportInventoryBalancesReport(
  records: InventoryBalanceExportRow[],
  warehouseName: string,
  action: 'pdf' | 'print' = 'pdf',
): void {
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'pt',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const todayStr = new Date().toISOString().slice(0, 10);

  // 1. Company Letterhead Header
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(15, 23, 42); // slate-900
  doc.text('PAKISTAN WIRE INDUSTRIES (PVT.) LTD', 40, 36);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(100, 116, 139); // slate-500
  doc.text(`Current Stock Balances & Warehouse Inventory Report`, 40, 52);
  doc.text(`Warehouse: ${warehouseName || 'All Warehouses across Division'}`, 40, 66);

  // Right-aligned report stamp
  doc.text(`Generated On: ${todayStr}`, pageWidth - 40, 36, { align: 'right' });
  doc.text(`Total Items: ${records.length}`, pageWidth - 40, 52, { align: 'right' });

  // Compute Totals
  let totalPieces = 0;
  let totalWeightKg = 0;
  let totalAvailablePieces = 0;
  let totalAvailableKg = 0;

  records.forEach((r) => {
    const isPcs = ['PCS', 'PC', 'EA', 'NOS', 'PIECE', 'PIECES', 'BKTS'].includes((r.uomCode || '').toUpperCase());
    if (isPcs) {
      totalPieces += r.onHand;
      totalAvailablePieces += r.available;
    }
    const onHandKg = calculateWeightKg(r.onHand, r.uomCode, r.itemCode, r.weightPerPiece);
    const availKg = calculateWeightKg(r.available, r.uomCode, r.itemCode, r.weightPerPiece);
    totalWeightKg += onHandKg;
    totalAvailableKg += availKg;
  });

  // 2. Summary KPI Ribbon
  const ribbonY = 76;
  doc.setDrawColor(226, 232, 240);
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(40, ribbonY, pageWidth - 80, 40, 4, 4, 'FD');

  const colWidth = (pageWidth - 80) / 4;

  // Box 1: Total Items
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text('TOTAL ITEMS', 52, ribbonY + 16);
  doc.setFontSize(12);
  doc.setTextColor(15, 23, 42);
  doc.text(`${records.length} Items`, 52, ribbonY + 31);

  // Box 2: Total Pieces
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text('TOTAL ON HAND (PCS)', 52 + colWidth, ribbonY + 16);
  doc.setFontSize(12);
  doc.setTextColor(2, 132, 199); // sky-600
  doc.text(`${formatNumber(totalPieces, 0)} PCS`, 52 + colWidth, ribbonY + 31);

  // Box 3: Total Weight (KG)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text('TOTAL WEIGHT (KG)', 52 + colWidth * 2, ribbonY + 16);
  doc.setFontSize(12);
  doc.setTextColor(14, 165, 233); // cyan-500
  doc.text(`${formatNumber(totalWeightKg, 2)} KG`, 52 + colWidth * 2, ribbonY + 31);

  // Box 4: Total Available
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text('NET AVAILABLE (PCS / KG)', 52 + colWidth * 3, ribbonY + 16);
  doc.setFontSize(11);
  doc.setTextColor(22, 163, 74); // green-600
  doc.text(`${formatNumber(totalAvailablePieces, 0)} PCS (${formatNumber(totalAvailableKg, 1)} KG)`, 52 + colWidth * 3, ribbonY + 31);

  // 3. Tabular Data
  const tableStartY = ribbonY + 50;

  const tableBody = records.map((r, index) => {
    const unitWt = getItemWeightKg(r.itemCode, r.weightPerPiece);
    const onHandKg = calculateWeightKg(r.onHand, r.uomCode, r.itemCode, r.weightPerPiece);
    const availKg = calculateWeightKg(r.available, r.uomCode, r.itemCode, r.weightPerPiece);
    const resKg = calculateWeightKg(r.reserved, r.uomCode, r.itemCode, r.weightPerPiece);

    let onHandStr = `${formatNumber(r.onHand, 0)} ${r.uomCode}`;
    if (onHandKg > 0 && r.uomCode.toUpperCase() !== 'KG') {
      onHandStr += `\n(${formatNumber(onHandKg, 2)} KG)`;
    }
    if (r.cartonText) {
      onHandStr = `${r.cartonText} | ${r.grossText}\n${onHandStr}`;
    }

    let availStr = `${formatNumber(r.available, 0)} ${r.uomCode}`;
    if (availKg > 0 && r.uomCode.toUpperCase() !== 'KG') {
      availStr += `\n(${formatNumber(availKg, 2)} KG)`;
    }

    let resStr = r.reserved > 0 ? `${formatNumber(r.reserved, 0)} ${r.uomCode}` : '—';
    if (r.reserved > 0 && resKg > 0 && r.uomCode.toUpperCase() !== 'KG') {
      resStr += `\n(${formatNumber(resKg, 2)} KG)`;
    }

    return [
      String(index + 1),
      r.itemCode,
      r.itemName,
      r.warehouseName + (r.warehouseCode ? ` (${r.warehouseCode})` : ''),
      onHandStr,
      resStr,
      availStr,
      r.uomCode,
      unitWt > 0 ? `${formatNumber(unitWt, 5)} KG` : '—',
    ];
  });

  autoTable(doc, {
    startY: tableStartY,
    margin: { left: 40, right: 40, bottom: 35 },
    head: [[
      '#',
      'Item Code',
      'Item / Product Name',
      'Warehouse',
      'On Hand Stock (PCs & KG)',
      'Reserved',
      'Available Stock (PCs & KG)',
      'UoM',
      'Unit Wt (KG)',
    ]],
    body: tableBody,
    theme: 'grid',
    styles: {
      fontSize: 8,
      cellPadding: 4,
      valign: 'middle',
      font: 'helvetica',
    },
    headStyles: {
      fillColor: [30, 41, 59], // slate-800
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      halign: 'center',
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252], // slate-50
    },
    columnStyles: {
      0: { halign: 'center', cellWidth: 24 },
      1: { fontStyle: 'bold', textColor: [2, 132, 199], cellWidth: 80 },
      2: { cellWidth: 155 },
      3: { cellWidth: 125, textColor: [71, 85, 105] },
      4: { halign: 'right', fontStyle: 'bold', cellWidth: 105 },
      5: { halign: 'right', cellWidth: 65, textColor: [217, 119, 6] },
      6: { halign: 'right', fontStyle: 'bold', textColor: [22, 163, 74], cellWidth: 105 },
      7: { halign: 'center', cellWidth: 35 },
      8: { halign: 'right', cellWidth: 60, textColor: [100, 116, 139] },
    },
    didDrawPage: (data) => {
      // Footer page numbering
      const totalPages = (doc as any).internal.getNumberOfPages();
      doc.setFontSize(8);
      doc.setTextColor(148, 163, 184);
      doc.text(
        `Page ${data.pageNumber} of ${totalPages} — Pakistan Wire Industries (Pvt.) Ltd. Confidential Inventory Report`,
        pageWidth / 2,
        pageHeight - 16,
        { align: 'center' },
      );
    },
  });

  if (action === 'print') {
    doc.autoPrint();
    const blobUrl = doc.output('bloburl');
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    iframe.src = blobUrl.toString();
    document.body.appendChild(iframe);
    iframe.onload = () => {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    };
  } else {
    doc.save(`Stock-Balances-${warehouseName.replace(/[^a-zA-Z0-9_-]/g, '_') || 'All'}-${todayStr}.pdf`);
  }
}

