/* ─────────────────────────────────────────────────────────────────────────────
 * rawMaterialReceivingPdf.ts — Executive PDF, Print, CSV & WhatsApp Export for Raw Material Receiving
 * Pakistan Wire Industries (Pvt.) Ltd.
 * Supports both Gate Pass-Wise and Item-Wise Breakdown Reports
 * ──────────────────────────────────────────────────────────────────────────── */

import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { formatNumber } from '../../../utils/numberFormat';

export interface ReceivingExportItem {
  id: string;
  receiptCode: string;
  gatePassNo?: string | null;
  sourceNo?: string | null;
  heatNumber?: string | null;
  receiptDate: string;
  status: string;
  divisionName?: string;
  sectionName?: string;
  departmentName?: string;
  warehouseName?: string;
  poCode?: string | null;
  lineCount?: number;
  gatePassTotal?: number;
  receivedTotal?: number;
  differenceTotal?: number;
}

export interface ItemWiseReceivingExportItem {
  itemId: string;
  itemCode: string;
  itemName: string;
  uomCode: string;
  gatePassTotal: number;
  receivedTotal: number;
  differenceTotal: number;
  receiptCount: number;
  gatePassNumbers: string[];
  poNumbers: string[];
}

export interface ReceivingExportMeta {
  divisionName?: string;
  warehouseName?: string;
  dateRangeStr?: string;
  totalReceivedKg: number;
  totalGatePassKg: number;
  totalDifferenceKg: number;
  receiptsCount: number;
  uniquePoCount: number;
  linesCount: number;
  distinctItemsCount?: number;
}

/* ─────────────────────────────────────────────────────────────────────────────
 * GATE PASS WISE PDF EXPORT & PRINT
 * ──────────────────────────────────────────────────────────────────────────── */
export function exportReceivingPdf(
  records: ReceivingExportItem[],
  meta: ReceivingExportMeta,
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
  const nowTimeStr = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });

  // 1. Header Banner
  doc.setFillColor(15, 23, 42); // slate-900
  doc.rect(0, 0, pageWidth, 54, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text('PAKISTAN WIRE INDUSTRIES (PVT.) LTD.', 24, 24);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(148, 163, 184); // slate-400
  doc.text('RAW MATERIAL GATE PASS RECEIVING & PO FULFILLMENT AUDIT', 24, 40);

  // Top right meta
  doc.setFontSize(8);
  doc.setTextColor(226, 232, 240);
  doc.text(`Generated: ${todayStr} ${nowTimeStr}`, pageWidth - 24, 22, { align: 'right' });
  doc.text(`Division: ${meta.divisionName || 'All Divisions'}`, pageWidth - 24, 34, { align: 'right' });
  if (meta.dateRangeStr) {
    doc.text(`Date Range: ${meta.dateRangeStr}`, pageWidth - 24, 46, { align: 'right' });
  }

  // 2. Executive KPI Summary Cards
  const kpiTop = 64;
  const kpiHeight = 44;
  const kpiGap = 12;
  const marginX = 24;
  const cardWidth = (pageWidth - marginX * 2 - kpiGap * 4) / 5;

  const kpis = [
    {
      title: 'TOTAL RECEIVED',
      value: `${formatNumber(meta.totalReceivedKg, 2)} KG`,
      color: [14, 165, 233],
      bg: [240, 249, 255],
    },
    {
      title: 'GATE PASS DECLARED',
      value: `${formatNumber(meta.totalGatePassKg, 2)} KG`,
      color: [100, 116, 139],
      bg: [248, 250, 252],
    },
    {
      title: 'WEIGHT VARIANCE',
      value: `${meta.totalDifferenceKg > 0 ? '+' : ''}${formatNumber(meta.totalDifferenceKg, 2)} KG`,
      color: meta.totalDifferenceKg === 0 ? [22, 163, 74] : meta.totalDifferenceKg < 0 ? [220, 38, 38] : [22, 163, 74],
      bg: meta.totalDifferenceKg === 0 ? [240, 253, 244] : meta.totalDifferenceKg < 0 ? [254, 242, 242] : [240, 253, 244],
    },
    {
      title: 'RECEIPTS / LINES',
      value: `${meta.receiptsCount} / ${meta.linesCount}`,
      color: [99, 102, 241],
      bg: [238, 242, 255],
    },
    {
      title: 'PURCHASE ORDERS',
      value: `${meta.uniquePoCount} PO(s)`,
      color: [13, 148, 136],
      bg: [240, 253, 250],
    },
  ];

  kpis.forEach((kpi, index) => {
    const x = marginX + index * (cardWidth + kpiGap);
    doc.setFillColor(kpi.bg[0], kpi.bg[1], kpi.bg[2]);
    doc.roundedRect(x, kpiTop, cardWidth, kpiHeight, 4, 4, 'F');
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(x, kpiTop, cardWidth, kpiHeight, 4, 4, 'S');

    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(100, 116, 139);
    doc.text(kpi.title, x + 8, kpiTop + 14);

    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(kpi.color[0], kpi.color[1], kpi.color[2]);
    doc.text(kpi.value, x + 8, kpiTop + 32);
  });

  // 3. Tabular Data
  const tableBody = records.map((r, idx) => {
    const diff = Number(r.differenceTotal || 0);
    const diffStr = diff === 0 ? '0' : (diff > 0 ? `+${formatNumber(diff, 2)}` : formatNumber(diff, 2));
    return [
      String(idx + 1),
      r.gatePassNo || '-',
      r.receiptDate || '-',
      r.receiptCode || '-',
      r.poCode || '-',
      r.heatNumber || '-',
      r.divisionName || 'DIV-SPD',
      r.warehouseName || '-',
      String(r.lineCount || 1),
      formatNumber(Number(r.gatePassTotal || 0), 2),
      formatNumber(Number(r.receivedTotal || 0), 2),
      diffStr,
      r.status || 'CONFIRMED',
    ];
  });

  autoTable(doc, {
    startY: kpiTop + kpiHeight + 12,
    head: [[
      '#',
      'Gate Pass No',
      'Date',
      'Receipt Code',
      'PO Number',
      'Heat No',
      'Division',
      'Warehouse / Store',
      'Lines',
      'GP Qty (KG)',
      'Received (KG)',
      'Diff (KG)',
      'Status',
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
      fillColor: [30, 41, 59],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      halign: 'center',
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
    columnStyles: {
      0: { halign: 'center', cellWidth: 20 },
      1: { fontStyle: 'bold', textColor: [2, 132, 199], cellWidth: 65 },
      2: { halign: 'center', cellWidth: 55 },
      3: { fontStyle: 'bold', cellWidth: 65 },
      4: { halign: 'center', textColor: [15, 118, 110], cellWidth: 65 },
      5: { halign: 'center', cellWidth: 50 },
      6: { cellWidth: 105 },
      7: { cellWidth: 100, textColor: [71, 85, 105] },
      8: { halign: 'center', cellWidth: 30 },
      9: { halign: 'right', fontStyle: 'bold', cellWidth: 60 },
      10: { halign: 'right', fontStyle: 'bold', textColor: [22, 163, 74], cellWidth: 60 },
      11: { halign: 'right', fontStyle: 'bold', cellWidth: 50 },
      12: { halign: 'center', cellWidth: 55 },
    },
    didDrawPage: (data) => {
      const totalPages = (doc as any).internal.getNumberOfPages();
      doc.setFontSize(8);
      doc.setTextColor(148, 163, 184);
      doc.text(
        `Page ${data.pageNumber} of ${totalPages} — Pakistan Wire Industries (Pvt.) Ltd. Raw Material Gate Pass Receiving Report`,
        pageWidth / 2,
        pageHeight - 14,
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
    const divSafe = (meta.divisionName || 'All-Divisions').replace(/[^a-zA-Z0-9_-]/g, '_');
    doc.save(`Raw-Material-Receiving-${divSafe}-${todayStr}.pdf`);
  }
}

/* ─────────────────────────────────────────────────────────────────────────────
 * ITEM-WISE RAW MATERIAL PDF EXPORT & PRINT
 * ──────────────────────────────────────────────────────────────────────────── */
export function exportItemWiseReceivingPdf(
  records: ItemWiseReceivingExportItem[],
  meta: ReceivingExportMeta,
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
  const nowTimeStr = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });

  // 1. Header Banner
  doc.setFillColor(15, 23, 42); // slate-900
  doc.rect(0, 0, pageWidth, 54, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text('PAKISTAN WIRE INDUSTRIES (PVT.) LTD.', 24, 24);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(148, 163, 184); // slate-400
  doc.text('ITEM-WISE RAW MATERIAL INWARD TOTALS & AUDIT SUMMARY', 24, 40);

  // Top right meta
  doc.setFontSize(8);
  doc.setTextColor(226, 232, 240);
  doc.text(`Generated: ${todayStr} ${nowTimeStr}`, pageWidth - 24, 22, { align: 'right' });
  doc.text(`Division: ${meta.divisionName || 'All Divisions'}`, pageWidth - 24, 34, { align: 'right' });
  if (meta.dateRangeStr) {
    doc.text(`Date Range: ${meta.dateRangeStr}`, pageWidth - 24, 46, { align: 'right' });
  }

  // 2. Executive KPI Summary Cards
  const kpiTop = 64;
  const kpiHeight = 44;
  const kpiGap = 12;
  const marginX = 24;
  const cardWidth = (pageWidth - marginX * 2 - kpiGap * 4) / 5;

  const kpis = [
    {
      title: 'TOTAL RECEIVED',
      value: `${formatNumber(meta.totalReceivedKg, 2)} KG`,
      color: [14, 165, 233],
      bg: [240, 249, 255],
    },
    {
      title: 'GATE PASS DECLARED',
      value: `${formatNumber(meta.totalGatePassKg, 2)} KG`,
      color: [100, 116, 139],
      bg: [248, 250, 252],
    },
    {
      title: 'WEIGHT VARIANCE',
      value: `${meta.totalDifferenceKg > 0 ? '+' : ''}${formatNumber(meta.totalDifferenceKg, 2)} KG`,
      color: meta.totalDifferenceKg === 0 ? [22, 163, 74] : meta.totalDifferenceKg < 0 ? [220, 38, 38] : [22, 163, 74],
      bg: meta.totalDifferenceKg === 0 ? [240, 253, 244] : meta.totalDifferenceKg < 0 ? [254, 242, 242] : [240, 253, 244],
    },
    {
      title: 'DISTINCT RAW MATERIALS',
      value: `${records.length} Item(s)`,
      color: [99, 102, 241],
      bg: [238, 242, 255],
    },
    {
      title: 'TOTAL DELIVERIES / GPS',
      value: `${meta.receiptsCount} Gate Passes`,
      color: [13, 148, 136],
      bg: [240, 253, 250],
    },
  ];

  kpis.forEach((kpi, index) => {
    const x = marginX + index * (cardWidth + kpiGap);
    doc.setFillColor(kpi.bg[0], kpi.bg[1], kpi.bg[2]);
    doc.roundedRect(x, kpiTop, cardWidth, kpiHeight, 4, 4, 'F');
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(x, kpiTop, cardWidth, kpiHeight, 4, 4, 'S');

    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(100, 116, 139);
    doc.text(kpi.title, x + 8, kpiTop + 14);

    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(kpi.color[0], kpi.color[1], kpi.color[2]);
    doc.text(kpi.value, x + 8, kpiTop + 32);
  });

  // 3. Tabular Data (Item-Wise)
  const tableBody = records.map((item, idx) => {
    const diff = Number(item.differenceTotal || 0);
    const diffStr = diff === 0 ? '0.00' : (diff > 0 ? `+${formatNumber(diff, 2)}` : formatNumber(diff, 2));
    const gps = item.gatePassNumbers.slice(0, 4).join(', ') + (item.gatePassNumbers.length > 4 ? ` (+${item.gatePassNumbers.length - 4})` : '');
    const pos = item.poNumbers.slice(0, 3).join(', ') + (item.poNumbers.length > 3 ? ` (+${item.poNumbers.length - 3})` : '');

    return [
      String(idx + 1),
      item.itemCode || '-',
      item.itemName || '-',
      item.uomCode || 'KG',
      formatNumber(Number(item.gatePassTotal || 0), 2),
      formatNumber(Number(item.receivedTotal || 0), 2),
      diffStr,
      String(item.receiptCount || 1),
      gps || '-',
      pos || '—',
    ];
  });

  autoTable(doc, {
    startY: kpiTop + kpiHeight + 12,
    head: [[
      '#',
      'Item Code',
      'Raw Material Description',
      'UoM',
      'Gate Pass Declared',
      'Total Received',
      'Variance / Diff',
      'Deliveries',
      'Associated Gate Passes',
      'Linked PO(s)',
    ]],
    body: tableBody,
    theme: 'grid',
    styles: {
      fontSize: 8,
      cellPadding: 5,
      valign: 'middle',
      font: 'helvetica',
    },
    headStyles: {
      fillColor: [15, 23, 42],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      halign: 'center',
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
    columnStyles: {
      0: { halign: 'center', cellWidth: 24 },
      1: { fontStyle: 'bold', textColor: [2, 132, 199], cellWidth: 85 },
      2: { cellWidth: 200 },
      3: { halign: 'center', cellWidth: 35 },
      4: { halign: 'right', fontStyle: 'bold', cellWidth: 70 },
      5: { halign: 'right', fontStyle: 'bold', textColor: [22, 163, 74], cellWidth: 70 },
      6: { halign: 'right', fontStyle: 'bold', cellWidth: 65 },
      7: { halign: 'center', cellWidth: 45 },
      8: { cellWidth: 105, textColor: [71, 85, 105] },
      9: { cellWidth: 85, textColor: [15, 118, 110] },
    },
    didDrawPage: (data) => {
      const totalPages = (doc as any).internal.getNumberOfPages();
      doc.setFontSize(8);
      doc.setTextColor(148, 163, 184);
      doc.text(
        `Page ${data.pageNumber} of ${totalPages} — Pakistan Wire Industries (Pvt.) Ltd. Item-Wise Raw Material Receiving Audit`,
        pageWidth / 2,
        pageHeight - 14,
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
    const divSafe = (meta.divisionName || 'All-Divisions').replace(/[^a-zA-Z0-9_-]/g, '_');
    doc.save(`Item-Wise-Receiving-${divSafe}-${todayStr}.pdf`);
  }
}

/* ─────────────────────────────────────────────────────────────────────────────
 * CSV EXPORTS
 * ──────────────────────────────────────────────────────────────────────────── */
export function exportReceivingCsv(
  records: ReceivingExportItem[],
  meta: ReceivingExportMeta,
): void {
  const headers = [
    'Gate Pass No',
    'Receipt Date',
    'Receipt Code',
    'PO Number',
    'Heat Number',
    'Division',
    'Warehouse',
    'Lines Count',
    'Gate Pass Qty (KG)',
    'Received Qty (KG)',
    'Difference (KG)',
    'Status',
  ];

  const rows = records.map((r) => [
    `"${(r.gatePassNo || '').replace(/"/g, '""')}"`,
    `"${r.receiptDate || ''}"`,
    `"${r.receiptCode || ''}"`,
    `"${(r.poCode || '').replace(/"/g, '""')}"`,
    `"${(r.heatNumber || '').replace(/"/g, '""')}"`,
    `"${(r.divisionName || '').replace(/"/g, '""')}"`,
    `"${(r.warehouseName || '').replace(/"/g, '""')}"`,
    r.lineCount || 1,
    Number(r.gatePassTotal || 0).toFixed(2),
    Number(r.receivedTotal || 0).toFixed(2),
    Number(r.differenceTotal || 0).toFixed(2),
    `"${r.status || ''}"`,
  ]);

  const summaryRows = [
    [],
    ['"SUMMARY TOTALS"'],
    [`"Division"`, `"${meta.divisionName || 'All Divisions'}"`],
    [`"Total Receipts"`, meta.receiptsCount],
    [`"Total Lines"`, meta.linesCount],
    [`"Unique POs"`, meta.uniquePoCount],
    [`"Total Gate Pass Qty (KG)"`, meta.totalGatePassKg.toFixed(2)],
    [`"Total Received Qty (KG)"`, meta.totalReceivedKg.toFixed(2)],
    [`"Total Net Difference (KG)"`, meta.totalDifferenceKg.toFixed(2)],
  ];

  const csvContent =
    '\uFEFF' +
    [headers.join(','), ...rows.map((row) => row.join(',')), ...summaryRows.map((r) => r.join(','))].join('\r\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const todayStr = new Date().toISOString().slice(0, 10);
  const divSafe = (meta.divisionName || 'All-Divisions').replace(/[^a-zA-Z0-9_-]/g, '_');
  link.setAttribute('href', url);
  link.setAttribute('download', `Raw-Material-Receiving-${divSafe}-${todayStr}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function exportItemWiseReceivingCsv(
  records: ItemWiseReceivingExportItem[],
  meta: ReceivingExportMeta,
): void {
  const headers = [
    'Item Code',
    'Item / Raw Material Name',
    'UoM',
    'Gate Pass Declared Qty',
    'Total Received Qty',
    'Difference / Variance',
    'Deliveries Count',
    'Associated Gate Passes',
    'Linked Purchase Orders',
  ];

  const rows = records.map((r) => [
    `"${(r.itemCode || '').replace(/"/g, '""')}"`,
    `"${(r.itemName || '').replace(/"/g, '""')}"`,
    `"${r.uomCode || 'KG'}"`,
    Number(r.gatePassTotal || 0).toFixed(2),
    Number(r.receivedTotal || 0).toFixed(2),
    Number(r.differenceTotal || 0).toFixed(2),
    r.receiptCount || 1,
    `"${r.gatePassNumbers.join(', ').replace(/"/g, '""')}"`,
    `"${r.poNumbers.join(', ').replace(/"/g, '""')}"`,
  ]);

  const summaryRows = [
    [],
    ['"SUMMARY TOTALS"'],
    [`"Division"`, `"${meta.divisionName || 'All Divisions'}"`],
    [`"Total Distinct Raw Materials"`, records.length],
    [`"Total Gate Passes Included"`, meta.receiptsCount],
    [`"Total Gate Pass Qty (KG)"`, meta.totalGatePassKg.toFixed(2)],
    [`"Total Received Qty (KG)"`, meta.totalReceivedKg.toFixed(2)],
    [`"Total Net Difference (KG)"`, meta.totalDifferenceKg.toFixed(2)],
  ];

  const csvContent =
    '\uFEFF' +
    [headers.join(','), ...rows.map((row) => row.join(',')), ...summaryRows.map((r) => r.join(','))].join('\r\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const todayStr = new Date().toISOString().slice(0, 10);
  const divSafe = (meta.divisionName || 'All-Divisions').replace(/[^a-zA-Z0-9_-]/g, '_');
  link.setAttribute('href', url);
  link.setAttribute('download', `Item-Wise-Receiving-${divSafe}-${todayStr}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/* ─────────────────────────────────────────────────────────────────────────────
 * WHATSAPP MESSAGES
 * ──────────────────────────────────────────────────────────────────────────── */
export function generateReceivingWhatsAppMessage(
  meta: ReceivingExportMeta,
  topRecords: ReceivingExportItem[] = [],
): string {
  const todayStr = new Date().toISOString().slice(0, 10);
  const diffSign = meta.totalDifferenceKg >= 0 ? '+' : '';

  let msg = `*PAKISTAN WIRE INDUSTRIES (PVT.) LTD.*\n`;
  msg += `*Raw Material Receiving — Gate Pass Summary*\n`;
  msg += `_Generated on: ${todayStr}_\n`;
  msg += `------------------------------------\n`;
  msg += `🏢 *Division:* ${meta.divisionName || 'All Divisions'}\n`;
  if (meta.warehouseName) {
    msg += `🏬 *Warehouse:* ${meta.warehouseName}\n`;
  }
  if (meta.dateRangeStr) {
    msg += `📅 *Date Range:* ${meta.dateRangeStr}\n`;
  }
  msg += `------------------------------------\n`;
  msg += `📦 *Total Receipts:* ${meta.receiptsCount} Gate Passes\n`;
  msg += `📋 *Total Items/Lines:* ${meta.linesCount} lines\n`;
  msg += `🔖 *Active POs:* ${meta.uniquePoCount} Orders\n`;
  msg += `⚖️ *Gate Pass Declared:* ${formatNumber(meta.totalGatePassKg, 2)} KG\n`;
  msg += `✅ *Total Received:* ${formatNumber(meta.totalReceivedKg, 2)} KG\n`;
  msg += `📊 *Net Variance:* ${diffSign}${formatNumber(meta.totalDifferenceKg, 2)} KG\n`;
  msg += `------------------------------------\n`;

  if (topRecords.length > 0) {
    msg += `*Recent Receipts:*\n`;
    topRecords.slice(0, 6).forEach((r) => {
      msg += `• GP: ${r.gatePassNo || r.receiptCode} | PO: ${r.poCode || 'N/A'} | Recv: ${formatNumber(Number(r.receivedTotal || 0), 2)} KG\n`;
    });
    if (topRecords.length > 6) {
      msg += `_...and ${topRecords.length - 6} more receipts._\n`;
    }
  }

  msg += `------------------------------------\n`;
  msg += `_PWI ERP Multi-Theme Material Intelligence_`;
  return msg;
}

export function generateItemWiseReceivingWhatsAppMessage(
  meta: ReceivingExportMeta,
  items: ItemWiseReceivingExportItem[],
): string {
  const todayStr = new Date().toISOString().slice(0, 10);
  const diffSign = meta.totalDifferenceKg >= 0 ? '+' : '';

  let msg = `*PAKISTAN WIRE INDUSTRIES (PVT.) LTD.*\n`;
  msg += `*Raw Material Receiving — Item-Wise Material Breakdown*\n`;
  msg += `_Generated on: ${todayStr}_\n`;
  msg += `------------------------------------\n`;
  msg += `🏢 *Division:* ${meta.divisionName || 'All Divisions'}\n`;
  if (meta.warehouseName) {
    msg += `🏬 *Warehouse:* ${meta.warehouseName}\n`;
  }
  if (meta.dateRangeStr) {
    msg += `📅 *Date Range:* ${meta.dateRangeStr}\n`;
  }
  msg += `------------------------------------\n`;
  msg += `📦 *Distinct Materials:* ${items.length} Items\n`;
  msg += `📋 *Total Gate Passes:* ${meta.receiptsCount} Deliveries\n`;
  msg += `⚖️ *Total GP Declared:* ${formatNumber(meta.totalGatePassKg, 2)} KG\n`;
  msg += `✅ *Total Received:* ${formatNumber(meta.totalReceivedKg, 2)} KG\n`;
  msg += `📊 *Net Variance:* ${diffSign}${formatNumber(meta.totalDifferenceKg, 2)} KG\n`;
  msg += `------------------------------------\n`;
  msg += `*Material Breakdown (KG):*\n`;

  items.slice(0, 12).forEach((it) => {
    const diff = Number(it.differenceTotal || 0);
    const diffStr = diff === 0 ? 'Match' : (diff > 0 ? `+${formatNumber(diff, 2)}` : formatNumber(diff, 2));
    msg += `• *${it.itemCode}* (${it.itemName})\n`;
    msg += `   Recv: *${formatNumber(it.receivedTotal, 2)}* ${it.uomCode} | GP: ${formatNumber(it.gatePassTotal, 2)} | Diff: ${diffStr} (${it.receiptCount} GPs)\n`;
  });

  if (items.length > 12) {
    msg += `_...and ${items.length - 12} more items._\n`;
  }

  msg += `------------------------------------\n`;
  msg += `_PWI ERP Multi-Theme Material Intelligence_`;
  return msg;
}
