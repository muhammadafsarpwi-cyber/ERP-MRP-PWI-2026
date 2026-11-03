/* ─────────────────────────────────────────────────────────────────────────────
 * rejectionAnalyticsPdf.ts — Professional PDF & Print Export for Rejection & Scrap
 * ──────────────────────────────────────────────────────────────────────────── */

import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { formatNumber, formatCompact } from '../../../utils/numberFormat';
import type { DepartmentScrapGroup } from './analyticsModel';

export function exportDepartmentRejectionPdf(
  deptGroup: DepartmentScrapGroup,
  dateRangeStr?: string,
): void {
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'pt',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  // 1. Company Letterhead Header
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(15, 23, 42); // slate-900
  doc.text('PAKISTAN WIRE INDUSTRIES (PVT.) LTD', 40, 36);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(100, 116, 139); // slate-500
  doc.text(
    `Department Rejection & Scrap Report — ${deptGroup.department}`,
    40,
    52,
  );

  if (dateRangeStr) {
    doc.text(`Period / Date Range: ${dateRangeStr}`, 40, 66);
  }

  // Right-aligned report stamp
  const todayStr = new Date().toISOString().slice(0, 10);
  doc.text(`Generated On: ${todayStr}`, pageWidth - 40, 36, { align: 'right' });
  doc.text(`Total Records: ${deptGroup.entriesCount}`, pageWidth - 40, 52, { align: 'right' });

  // 2. Summary KPI Ribbon
  const ribbonY = dateRangeStr ? 78 : 66;
  doc.setDrawColor(226, 232, 240);
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(40, ribbonY, pageWidth - 80, 42, 4, 4, 'FD');

  const colW = (pageWidth - 80) / 4;
  const metrics = [
    {
      label: 'TOTAL PRODUCED',
      val: `${formatNumber(deptGroup.actualKg, 2)} KG (${formatCompact(deptGroup.actualUnits, 1)} ${deptGroup.primaryUom})`,
      color: [16, 185, 129] as [number, number, number],
    },
    {
      label: 'PART REJECT',
      val: `${formatNumber(deptGroup.partRejectKg, 2)} KG (${formatNumber(deptGroup.partRejectUnits, 0)} ${deptGroup.primaryUom} • ${deptGroup.partRejectPct.toFixed(2)}%)`,
      color: [244, 63, 94] as [number, number, number],
    },
    {
      label: 'PROCESS SCRAP',
      val: `${formatNumber(deptGroup.processScrapKg, 2)} KG (${deptGroup.processScrapPct.toFixed(2)}% of KG)`,
      color: [14, 165, 233] as [number, number, number],
    },
    {
      label: 'TOTAL LOSS / WASTAGE',
      val: `${formatNumber(deptGroup.scrapKg, 2)} KG (${deptGroup.wastagePct.toFixed(2)}% Loss)`,
      color: [225, 29, 72] as [number, number, number],
    },
  ];

  metrics.forEach((m, i) => {
    const x = 40 + i * colW + 12;
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(100, 116, 139);
    doc.text(m.label, x, ribbonY + 16);

    doc.setFontSize(9.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(m.color[0], m.color[1], m.color[2]);
    doc.text(m.val, x, ribbonY + 32);
  });

  // 3. Line Items Table with clear PCS % and KG %
  const tableData = deptGroup.items.map((row) => {
    const kgPct = row.actualKg > 0 ? (row.partRejectKg / row.actualKg) * 100 : 0;
    return [
      row.date || '—',
      row.machine || '—',
      row.product || row.itemCode || '—',
      row.shift || '—',
      `${formatNumber(row.actualUnits, 0)} ${row.uomCode}\n(${formatNumber(row.actualKg, 2)} KG)`,
      `${formatNumber(row.partRejectUnits, 0)} ${row.uomCode} (${row.partRejectPct.toFixed(2)}%)\n(${formatNumber(row.partRejectKg, 2)} KG • ${kgPct.toFixed(2)}%)`,
      `${formatNumber(row.processScrapKg, 2)} KG\n(${row.processScrapPct.toFixed(2)}%)`,
      `${formatNumber(row.scrapKg, 2)} KG\n(${row.wastagePct.toFixed(2)}%)`,
      row.defectReason || '—',
      row.operator || '—',
    ];
  });

  autoTable(doc, {
    startY: ribbonY + 54,
    head: [[
      'Date',
      'Machine',
      'Item / Product',
      'Shift',
      'Produced Output',
      'Part Reject',
      'Process Scrap',
      'Total Scrap',
      'Defect Reason',
      'Operator',
    ]],
    body: tableData,
    margin: { left: 40, right: 40, bottom: 40 },
    theme: 'grid',
    styles: {
      fontSize: 8,
      cellPadding: 3.5,
      valign: 'middle',
      lineColor: [226, 232, 240],
      lineWidth: 0.5,
      font: 'helvetica',
      textColor: [30, 41, 59],
    },
    headStyles: {
      fillColor: [30, 41, 59],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8,
      halign: 'center',
    },
    columnStyles: {
      0: { cellWidth: 55, halign: 'center' }, // Date
      1: { cellWidth: 50 }, // Machine
      2: { cellWidth: 115 }, // Item / Product
      3: { cellWidth: 42, halign: 'center' }, // Shift
      4: { cellWidth: 78, halign: 'right' }, // Produced Output
      5: { cellWidth: 98, halign: 'right', textColor: [225, 29, 72] }, // Part Reject (PCS & KG with %)
      6: { cellWidth: 68, halign: 'right', textColor: [14, 165, 233] }, // Process Scrap
      7: { cellWidth: 68, halign: 'right', fontStyle: 'bold', textColor: [225, 29, 72] }, // Total Scrap
      8: { cellWidth: 130, fontSize: 7.2 }, // Defect Reason (clear, compact)
      9: { cellWidth: 55 }, // Operator
    },
    didDrawPage: (data) => {
      // Footer page numbering
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(148, 163, 184);
      doc.text(
        `Page ${data.pageNumber} of ${doc.getNumberOfPages()} — PWI ERP Rejection & Scrap Intelligence`,
        pageWidth / 2,
        pageHeight - 20,
        { align: 'center' },
      );
    },
  });

  const safeDept = deptGroup.department.replace(/[^a-zA-Z0-9_-]/g, '_');
  doc.save(`Rejection_Report_${safeDept}_${todayStr}.pdf`);
}
