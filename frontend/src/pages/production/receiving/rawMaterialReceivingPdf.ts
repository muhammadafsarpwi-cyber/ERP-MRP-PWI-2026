/* ─────────────────────────────────────────────────────────────────────────────
 * rawMaterialReceivingPdf.ts — Executive PDF, Print, CSV & WhatsApp Export for Raw Material Receiving
 * Pakistan Wire Industries (Pvt.) Ltd.
 * Supports unified Gate Pass Records and Item-Wise Breakdown with Returns & Net In-Hand Balance
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
  returnedTotal?: number;
  netBalanceTotal?: number;
  receiptCount: number;
  gatePassNumbers: string[];
  poNumbers: string[];
}

export interface ReceivingExportMeta {
  divisionName?: string;
  warehouseName?: string;
  dateRangeStr?: string;
  totalReceivedKg: number;
  totalReturnedKg?: number;
  netAvailableKg?: number;
  returnsCount?: number;
  totalGatePassKg: number;
  totalDifferenceKg: number;
  receiptsCount: number;
  uniquePoCount: number;
  linesCount: number;
  distinctItemsCount?: number;
  itemWiseList?: ItemWiseReceivingExportItem[];
}

/* ─────────────────────────────────────────────────────────────────────────────
 * GATE PASS WISE PDF EXPORT & PRINT (WITH INTEGRATED ITEM-WISE & RETURNS)
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
  doc.text('RAW MATERIAL GATE PASS RECEIVING & AUDIT REPORT (INCL. RETURNS & ITEM BREAKDOWN)', 24, 40);

  // Top right meta
  doc.setFontSize(8);
  doc.setTextColor(226, 232, 240);
  doc.text(`Generated: ${todayStr} ${nowTimeStr}`, pageWidth - 24, 22, { align: 'right' });
  doc.text(`Division: ${meta.divisionName || 'All Divisions'}`, pageWidth - 24, 34, { align: 'right' });
  if (meta.dateRangeStr) {
    doc.text(`Date Range: ${meta.dateRangeStr}`, pageWidth - 24, 46, { align: 'right' });
  }

  // 2. Executive 6-KPI Summary Cards (Matching UI Dashboard)
  const kpiTop = 64;
  const kpiHeight = 44;
  const kpiGap = 10;
  const marginX = 24;
  const cardCount = 6;
  const cardWidth = (pageWidth - marginX * 2 - kpiGap * (cardCount - 1)) / cardCount;

  const returnedKg = Number(meta.totalReturnedKg || 0);
  const netKg = meta.netAvailableKg !== undefined
    ? Number(meta.netAvailableKg)
    : Math.max(0, Number(meta.totalReceivedKg || 0) - returnedKg);

  const kpis = [
    {
      title: 'TOTAL RECEIVED',
      value: `${formatNumber(meta.totalReceivedKg, 2)} KG`,
      sub: 'Inward Gate Pass',
      color: [14, 165, 233], // sky-500
      bg: [240, 249, 255],
    },
    {
      title: 'MATERIAL RETURNED',
      value: `${returnedKg > 0 ? '-' : ''}${formatNumber(returnedKg, 2)} KG`,
      sub: `${meta.returnsCount || 0} Return Chalan(s)`,
      color: [217, 119, 6], // amber-600
      bg: [255, 251, 235],
    },
    {
      title: 'NET IN-HAND BALANCE',
      value: `${formatNumber(netKg, 2)} KG`,
      sub: 'Recv - Return (Usable)',
      color: [22, 163, 74], // emerald-600
      bg: [240, 253, 244],
    },
    {
      title: 'GP DECLARED',
      value: `${formatNumber(meta.totalGatePassKg, 2)} KG`,
      sub: 'Supplier Declared',
      color: [100, 116, 139], // slate-500
      bg: [248, 250, 252],
    },
    {
      title: 'WEIGHT VARIANCE',
      value: `${meta.totalDifferenceKg > 0 ? '+' : ''}${formatNumber(meta.totalDifferenceKg, 2)} KG`,
      sub: meta.totalDifferenceKg === 0 ? 'Exact Match' : meta.totalDifferenceKg > 0 ? 'Supplier Excess' : 'Weight Shortage',
      color: meta.totalDifferenceKg === 0 ? [22, 163, 74] : meta.totalDifferenceKg < 0 ? [220, 38, 38] : [217, 119, 6],
      bg: meta.totalDifferenceKg === 0 ? [240, 253, 244] : meta.totalDifferenceKg < 0 ? [254, 242, 242] : [255, 251, 235],
    },
    {
      title: 'RECEIPTS & POS',
      value: `${meta.receiptsCount} GPs`,
      sub: `${meta.uniquePoCount} PO(s) / ${meta.distinctItemsCount ?? (meta.itemWiseList?.length || 0)} Items`,
      color: [124, 58, 237], // purple-600
      bg: [245, 243, 255],
    },
  ];

  kpis.forEach((kpi, index) => {
    const x = marginX + index * (cardWidth + kpiGap);
    doc.setFillColor(kpi.bg[0], kpi.bg[1], kpi.bg[2]);
    doc.roundedRect(x, kpiTop, cardWidth, kpiHeight, 4, 4, 'F');
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(x, kpiTop, cardWidth, kpiHeight, 4, 4, 'S');

    doc.setFontSize(6.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(100, 116, 139);
    doc.text(kpi.title, x + 6, kpiTop + 13);

    doc.setFontSize(9.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(kpi.color[0], kpi.color[1], kpi.color[2]);
    doc.text(kpi.value, x + 6, kpiTop + 27);

    doc.setFontSize(6.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(148, 163, 184);
    doc.text(kpi.sub, x + 6, kpiTop + 38);
  });

  // 3. Tabular Data - Table 1: Gate Pass Receipts
  const tableBody = records.map((r, idx) => {
    const diff = Number(r.differenceTotal || 0);
    const diffStr = diff === 0 ? '0.00' : (diff > 0 ? `+${formatNumber(diff, 2)}` : formatNumber(diff, 2));
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

  // 4. Section 2: Unified Item-Wise Received, Returned & Net In-Hand Balance Breakdown
  const items = meta.itemWiseList;
  if (items && items.length > 0) {
    const finalY = (doc as any).lastAutoTable ? (doc as any).lastAutoTable.finalY + 18 : 200;

    // Check if we need a new page for the Item-Wise section
    let itemStartY = finalY;
    if (finalY > pageHeight - 140) {
      doc.addPage();
      itemStartY = 36;
    }

    doc.setFillColor(30, 41, 59); // slate-800
    doc.rect(marginX, itemStartY, pageWidth - marginX * 2, 22, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.text(
      `ITEM-WISE RAW MATERIAL AUDIT BREAKDOWN — RECEIVED, RETURNED & NET IN-HAND BALANCE (${items.length} Materials)`,
      marginX + 8,
      itemStartY + 15,
    );

    const itemBody = items.map((it, idx) => {
      const itDiff = Number(it.differenceTotal || 0);
      const diffStr = itDiff === 0 ? '0.00' : (itDiff > 0 ? `+${formatNumber(itDiff, 2)}` : formatNumber(itDiff, 2));
      const itRet = Number(it.returnedTotal || 0);
      const itNet = it.netBalanceTotal !== undefined ? Number(it.netBalanceTotal) : Math.max(0, it.receivedTotal - itRet);
      const gps = it.gatePassNumbers.slice(0, 4).join(', ') + (it.gatePassNumbers.length > 4 ? ` (+${it.gatePassNumbers.length - 4})` : '');

      return [
        String(idx + 1),
        it.itemCode || '-',
        it.itemName || '-',
        it.uomCode || 'KG',
        formatNumber(Number(it.gatePassTotal || 0), 2),
        formatNumber(Number(it.receivedTotal || 0), 2),
        itRet > 0 ? `-${formatNumber(itRet, 2)}` : '0.00',
        formatNumber(itNet, 2),
        diffStr,
        `${it.receiptCount || 1} GP(s): ${gps || '-'}`,
      ];
    });

    autoTable(doc, {
      startY: itemStartY + 24,
      head: [[
        '#',
        'Item Code',
        'Material Description',
        'UoM',
        'GP Declared',
        'Received Qty',
        'Returned Qty',
        'Net In-Hand',
        'Variance',
        'Associated Deliveries / Gate Passes',
      ]],
      body: itemBody,
      theme: 'grid',
      styles: {
        fontSize: 8,
        cellPadding: 4,
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
        0: { halign: 'center', cellWidth: 20 },
        1: { fontStyle: 'bold', textColor: [2, 132, 199], cellWidth: 70 },
        2: { cellWidth: 160 },
        3: { halign: 'center', cellWidth: 32 },
        4: { halign: 'right', fontStyle: 'bold', cellWidth: 65 },
        5: { halign: 'right', fontStyle: 'bold', textColor: [2, 132, 199], cellWidth: 65 },
        6: { halign: 'right', fontStyle: 'bold', textColor: [217, 119, 6], cellWidth: 65 },
        7: { halign: 'right', fontStyle: 'bold', textColor: [22, 163, 74], cellWidth: 65 },
        8: { halign: 'right', fontStyle: 'bold', cellWidth: 55 },
        9: { cellWidth: 195, textColor: [71, 85, 105], fontSize: 7.5 },
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
  }

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
 * ITEM-WISE RAW MATERIAL PDF EXPORT & PRINT (WITH RETURN & NET IN-HAND)
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
  doc.text('ITEM-WISE RAW MATERIAL AUDIT — RECEIVED, RETURNED & NET IN-HAND BALANCE', 24, 40);

  // Top right meta
  doc.setFontSize(8);
  doc.setTextColor(226, 232, 240);
  doc.text(`Generated: ${todayStr} ${nowTimeStr}`, pageWidth - 24, 22, { align: 'right' });
  doc.text(`Division: ${meta.divisionName || 'All Divisions'}`, pageWidth - 24, 34, { align: 'right' });
  if (meta.dateRangeStr) {
    doc.text(`Date Range: ${meta.dateRangeStr}`, pageWidth - 24, 46, { align: 'right' });
  }

  // 2. Executive 6-KPI Summary Cards
  const kpiTop = 64;
  const kpiHeight = 44;
  const kpiGap = 10;
  const marginX = 24;
  const cardCount = 6;
  const cardWidth = (pageWidth - marginX * 2 - kpiGap * (cardCount - 1)) / cardCount;

  const returnedKg = Number(meta.totalReturnedKg || 0);
  const netKg = meta.netAvailableKg !== undefined
    ? Number(meta.netAvailableKg)
    : Math.max(0, Number(meta.totalReceivedKg || 0) - returnedKg);

  const kpis = [
    {
      title: 'TOTAL RECEIVED',
      value: `${formatNumber(meta.totalReceivedKg, 2)} KG`,
      sub: 'Inward Gate Pass',
      color: [14, 165, 233],
      bg: [240, 249, 255],
    },
    {
      title: 'MATERIAL RETURNED',
      value: `${returnedKg > 0 ? '-' : ''}${formatNumber(returnedKg, 2)} KG`,
      sub: `${meta.returnsCount || 0} Return Chalan(s)`,
      color: [217, 119, 6],
      bg: [255, 251, 235],
    },
    {
      title: 'NET IN-HAND BALANCE',
      value: `${formatNumber(netKg, 2)} KG`,
      sub: 'Recv - Return (Usable)',
      color: [22, 163, 74],
      bg: [240, 253, 244],
    },
    {
      title: 'GP DECLARED',
      value: `${formatNumber(meta.totalGatePassKg, 2)} KG`,
      sub: 'Supplier Declared',
      color: [100, 116, 139],
      bg: [248, 250, 252],
    },
    {
      title: 'WEIGHT VARIANCE',
      value: `${meta.totalDifferenceKg > 0 ? '+' : ''}${formatNumber(meta.totalDifferenceKg, 2)} KG`,
      sub: meta.totalDifferenceKg === 0 ? 'Exact Match' : meta.totalDifferenceKg > 0 ? 'Supplier Excess' : 'Weight Shortage',
      color: meta.totalDifferenceKg === 0 ? [22, 163, 74] : meta.totalDifferenceKg < 0 ? [220, 38, 38] : [217, 119, 6],
      bg: meta.totalDifferenceKg === 0 ? [240, 253, 244] : meta.totalDifferenceKg < 0 ? [254, 242, 242] : [255, 251, 235],
    },
    {
      title: 'DISTINCT MATERIALS',
      value: `${records.length} Item(s)`,
      sub: `${meta.receiptsCount} Gate Passes`,
      color: [124, 58, 237],
      bg: [245, 243, 255],
    },
  ];

  kpis.forEach((kpi, index) => {
    const x = marginX + index * (cardWidth + kpiGap);
    doc.setFillColor(kpi.bg[0], kpi.bg[1], kpi.bg[2]);
    doc.roundedRect(x, kpiTop, cardWidth, kpiHeight, 4, 4, 'F');
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(x, kpiTop, cardWidth, kpiHeight, 4, 4, 'S');

    doc.setFontSize(6.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(100, 116, 139);
    doc.text(kpi.title, x + 6, kpiTop + 13);

    doc.setFontSize(9.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(kpi.color[0], kpi.color[1], kpi.color[2]);
    doc.text(kpi.value, x + 6, kpiTop + 27);

    doc.setFontSize(6.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(148, 163, 184);
    doc.text(kpi.sub, x + 6, kpiTop + 38);
  });

  // 3. Tabular Data (Item-Wise)
  const tableBody = records.map((item, idx) => {
    const diff = Number(item.differenceTotal || 0);
    const diffStr = diff === 0 ? '0.00' : (diff > 0 ? `+${formatNumber(diff, 2)}` : formatNumber(diff, 2));
    const ret = Number(item.returnedTotal || 0);
    const net = item.netBalanceTotal !== undefined ? Number(item.netBalanceTotal) : Math.max(0, item.receivedTotal - ret);
    const gps = item.gatePassNumbers.slice(0, 3).join(', ') + (item.gatePassNumbers.length > 3 ? ` (+${item.gatePassNumbers.length - 3})` : '');
    const pos = item.poNumbers.slice(0, 2).join(', ') + (item.poNumbers.length > 2 ? ` (+${item.poNumbers.length - 2})` : '');

    return [
      String(idx + 1),
      item.itemCode || '-',
      item.itemName || '-',
      item.uomCode || 'KG',
      formatNumber(Number(item.gatePassTotal || 0), 2),
      formatNumber(Number(item.receivedTotal || 0), 2),
      ret > 0 ? `-${formatNumber(ret, 2)}` : '0.00',
      formatNumber(net, 2),
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
      'GP Declared',
      'Received Qty',
      'Returned Qty',
      'Net In-Hand',
      'Variance',
      'Deliveries',
      'Associated GPs',
      'Linked PO(s)',
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
      fillColor: [15, 23, 42],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      halign: 'center',
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
    columnStyles: {
      0: { halign: 'center', cellWidth: 20 },
      1: { fontStyle: 'bold', textColor: [2, 132, 199], cellWidth: 70 },
      2: { cellWidth: 155 },
      3: { halign: 'center', cellWidth: 30 },
      4: { halign: 'right', fontStyle: 'bold', cellWidth: 60 },
      5: { halign: 'right', fontStyle: 'bold', textColor: [2, 132, 199], cellWidth: 60 },
      6: { halign: 'right', fontStyle: 'bold', textColor: [217, 119, 6], cellWidth: 60 },
      7: { halign: 'right', fontStyle: 'bold', textColor: [22, 163, 74], cellWidth: 60 },
      8: { halign: 'right', fontStyle: 'bold', cellWidth: 50 },
      9: { halign: 'center', cellWidth: 40 },
      10: { cellWidth: 95, textColor: [71, 85, 105], fontSize: 7.5 },
      11: { cellWidth: 75, textColor: [15, 118, 110], fontSize: 7.5 },
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
 * CSV / EXCEL EXPORTS (WITH UNIFIED GATE PASS RECORDS & ITEM-WISE BREAKDOWN)
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

  const returnedKg = Number(meta.totalReturnedKg || 0);
  const netKg = meta.netAvailableKg !== undefined
    ? Number(meta.netAvailableKg)
    : Math.max(0, Number(meta.totalReceivedKg || 0) - returnedKg);

  const summaryRows: (string | number)[][] = [
    [],
    ['"EXECUTIVE SUMMARY TOTALS"'],
    [`"Division"`, `"${meta.divisionName || 'All Divisions'}"`],
    [`"Total Gate Passes (GPs)"`, meta.receiptsCount],
    [`"Total Items / Lines"`, meta.linesCount],
    [`"Unique Purchase Orders"`, meta.uniquePoCount],
    [`"Total Gate Pass Declared (KG)"`, meta.totalGatePassKg.toFixed(2)],
    [`"Total Received Qty (KG)"`, meta.totalReceivedKg.toFixed(2)],
    [`"Material Returned (KG)"`, (-returnedKg).toFixed(2)],
    [`"Return Chalans Count"`, meta.returnsCount || 0],
    [`"Net In-Hand Usable Balance (KG)"`, netKg.toFixed(2)],
    [`"Total Net Weight Difference (KG)"`, meta.totalDifferenceKg.toFixed(2)],
  ];

  // If item-wise breakdown is available, append below
  const itemWiseRows: (string | number)[][] = [];
  if (meta.itemWiseList && meta.itemWiseList.length > 0) {
    itemWiseRows.push([]);
    itemWiseRows.push(['"ITEM-WISE RAW MATERIAL AUDIT BREAKDOWN (RECEIVED, RETURNED & NET IN-HAND)"']);
    itemWiseRows.push([
      'Item Code',
      'Material Name',
      'UoM',
      'Gate Pass Declared (KG)',
      'Total Received Qty (KG)',
      'Material Returned Qty (KG)',
      'Net In-Hand Balance (KG)',
      'Variance / Difference (KG)',
      'Deliveries Count',
      'Associated Gate Passes',
      'Linked Purchase Orders',
    ]);
    meta.itemWiseList.forEach((it) => {
      const itRet = Number(it.returnedTotal || 0);
      const itNet = it.netBalanceTotal !== undefined ? Number(it.netBalanceTotal) : Math.max(0, it.receivedTotal - itRet);
      itemWiseRows.push([
        `"${(it.itemCode || '').replace(/"/g, '""')}"`,
        `"${(it.itemName || '').replace(/"/g, '""')}"`,
        `"${it.uomCode || 'KG'}"`,
        Number(it.gatePassTotal || 0).toFixed(2),
        Number(it.receivedTotal || 0).toFixed(2),
        (-itRet).toFixed(2),
        itNet.toFixed(2),
        Number(it.differenceTotal || 0).toFixed(2),
        it.receiptCount || 1,
        `"${it.gatePassNumbers.join(', ').replace(/"/g, '""')}"`,
        `"${it.poNumbers.join(', ').replace(/"/g, '""')}"`,
      ]);
    });
  }

  const csvContent =
    '\uFEFF' +
    [
      headers.join(','),
      ...rows.map((row) => row.join(',')),
      ...summaryRows.map((r) => r.join(',')),
      ...itemWiseRows.map((r) => r.join(',')),
    ].join('\r\n');

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
    'Material Returned Qty',
    'Net In-Hand Balance',
    'Difference / Variance',
    'Deliveries Count',
    'Associated Gate Passes',
    'Linked Purchase Orders',
  ];

  const rows = records.map((r) => {
    const ret = Number(r.returnedTotal || 0);
    const net = r.netBalanceTotal !== undefined ? Number(r.netBalanceTotal) : Math.max(0, r.receivedTotal - ret);
    return [
      `"${(r.itemCode || '').replace(/"/g, '""')}"`,
      `"${(r.itemName || '').replace(/"/g, '""')}"`,
      `"${r.uomCode || 'KG'}"`,
      Number(r.gatePassTotal || 0).toFixed(2),
      Number(r.receivedTotal || 0).toFixed(2),
      (-ret).toFixed(2),
      net.toFixed(2),
      Number(r.differenceTotal || 0).toFixed(2),
      r.receiptCount || 1,
      `"${r.gatePassNumbers.join(', ').replace(/"/g, '""')}"`,
      `"${r.poNumbers.join(', ').replace(/"/g, '""')}"`,
    ];
  });

  const returnedKg = Number(meta.totalReturnedKg || 0);
  const netKg = meta.netAvailableKg !== undefined
    ? Number(meta.netAvailableKg)
    : Math.max(0, Number(meta.totalReceivedKg || 0) - returnedKg);

  const summaryRows = [
    [],
    ['"SUMMARY TOTALS"'],
    [`"Division"`, `"${meta.divisionName || 'All Divisions'}"`],
    [`"Total Distinct Raw Materials"`, records.length],
    [`"Total Gate Passes Included"`, meta.receiptsCount],
    [`"Total Gate Pass Qty (KG)"`, meta.totalGatePassKg.toFixed(2)],
    [`"Total Received Qty (KG)"`, meta.totalReceivedKg.toFixed(2)],
    [`"Material Returned (KG)"`, (-returnedKg).toFixed(2)],
    [`"Return Chalans Count"`, meta.returnsCount || 0],
    [`"Net In-Hand Usable Balance (KG)"`, netKg.toFixed(2)],
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
 * WHATSAPP MESSAGES (WITH RETURN & NET IN-HAND INCLUDED)
 * ──────────────────────────────────────────────────────────────────────────── */
export function generateReceivingWhatsAppMessage(
  meta: ReceivingExportMeta,
  topRecords: ReceivingExportItem[] = [],
): string {
  const todayStr = new Date().toISOString().slice(0, 10);
  const diffSign = meta.totalDifferenceKg >= 0 ? '+' : '';
  const returnedKg = Number(meta.totalReturnedKg || 0);
  const netKg = meta.netAvailableKg !== undefined
    ? Number(meta.netAvailableKg)
    : Math.max(0, Number(meta.totalReceivedKg || 0) - returnedKg);

  let msg = `*PAKISTAN WIRE INDUSTRIES (PVT.) LTD.*\n`;
  msg += `*Raw Material Receiving & Audit Summary*\n`;
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
  msg += `⚖️ *Gate Pass Declared:* ${formatNumber(meta.totalGatePassKg, 2)} KG\n`;
  msg += `📥 *Total Received:* ${formatNumber(meta.totalReceivedKg, 2)} KG\n`;
  msg += `📤 *Material Returned:* ${returnedKg > 0 ? '-' : ''}${formatNumber(returnedKg, 2)} KG (${meta.returnsCount || 0} Return Chalan(s))\n`;
  msg += `🛡️ *Net In-Hand Balance:* ${formatNumber(netKg, 2)} KG (Usable Stock)\n`;
  msg += `📊 *Net Variance:* ${diffSign}${formatNumber(meta.totalDifferenceKg, 2)} KG\n`;
  msg += `📦 *Total Receipts:* ${meta.receiptsCount} Gate Passes\n`;
  msg += `🔖 *Active POs:* ${meta.uniquePoCount} Orders | ${meta.distinctItemsCount ?? (meta.itemWiseList?.length || 0)} Materials\n`;
  msg += `------------------------------------\n`;

  if (topRecords.length > 0) {
    msg += `*Recent Receipts:*\n`;
    topRecords.slice(0, 5).forEach((r) => {
      msg += `• GP: ${r.gatePassNo || r.receiptCode} | PO: ${r.poCode || 'N/A'} | Recv: ${formatNumber(Number(r.receivedTotal || 0), 2)} KG\n`;
    });
    if (topRecords.length > 5) {
      msg += `_...and ${topRecords.length - 5} more receipts._\n`;
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
  const returnedKg = Number(meta.totalReturnedKg || 0);
  const netKg = meta.netAvailableKg !== undefined
    ? Number(meta.netAvailableKg)
    : Math.max(0, Number(meta.totalReceivedKg || 0) - returnedKg);

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
  msg += `📥 *Total Received:* ${formatNumber(meta.totalReceivedKg, 2)} KG\n`;
  msg += `📤 *Total Returned:* ${returnedKg > 0 ? '-' : ''}${formatNumber(returnedKg, 2)} KG\n`;
  msg += `🛡️ *Net In-Hand Balance:* ${formatNumber(netKg, 2)} KG\n`;
  msg += `📊 *Net Variance:* ${diffSign}${formatNumber(meta.totalDifferenceKg, 2)} KG\n`;
  msg += `------------------------------------\n`;
  msg += `*Material Breakdown (KG):*\n`;

  items.slice(0, 10).forEach((it) => {
    const diff = Number(it.differenceTotal || 0);
    const diffStr = diff === 0 ? 'Match' : (diff > 0 ? `+${formatNumber(diff, 2)}` : formatNumber(diff, 2));
    const itRet = Number(it.returnedTotal || 0);
    const itNet = it.netBalanceTotal !== undefined ? Number(it.netBalanceTotal) : Math.max(0, it.receivedTotal - itRet);
    msg += `• *${it.itemCode}* (${it.itemName})\n`;
    msg += `   Recv: *${formatNumber(it.receivedTotal, 2)}* ${it.uomCode} | Ret: -${formatNumber(itRet, 2)} | Net: *${formatNumber(itNet, 2)}* | Diff: ${diffStr}\n`;
  });

  if (items.length > 10) {
    msg += `_...and ${items.length - 10} more items._\n`;
  }

  msg += `------------------------------------\n`;
  msg += `_PWI ERP Multi-Theme Material Intelligence_`;
  return msg;
}
