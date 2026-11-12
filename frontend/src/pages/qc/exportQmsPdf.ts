import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { QmsInProcessInspection } from './types';
import { PWI_LOGO_BASE64 } from '../../assets/pwiLogoBase64';

export function renderInspectionPage(doc: jsPDF, inspection: QmsInProcessInspection): void {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  // Top Corporate Header (Clean, ink-friendly white layout with colorful corporate typography)
  // Embed Official Company Logo on white background
  try {
    doc.addImage(PWI_LOGO_BASE64, 'PNG', 36, 10, 46, 46);
  } catch (err) {
    console.warn('Failed to embed company logo in PDF:', err);
  }

  // QMS Reference Box in Top Right (Compact, ink-friendly light container with clean border)
  const boxWidth = 126;
  const boxX = pageWidth - 36 - boxWidth;
  doc.setFillColor(248, 250, 252); // #f8fafc
  doc.setDrawColor(226, 232, 240); // #e2e8f0
  doc.setLineWidth(1);
  doc.roundedRect(boxX, 10, boxWidth, 48, 4, 4, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(15, 23, 42);
  doc.text('Doc Ref:', boxX + 8, 24);
  doc.setTextColor(2, 132, 199); // Blue accent
  doc.text(inspection.docRef, boxX + 48, 24);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  doc.text('Revision No:', boxX + 8, 36);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text(String(inspection.revNo), boxX + 62, 36);

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 116, 139);
  doc.text('Issue Date:', boxX + 8, 48);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text(inspection.issueDate, boxX + 54, 48);

  // Company Name & Report Subtitles (Slightly smaller, proportional text with zero overlap)
  const textStartX = 90;
  const maxTitleWidth = boxX - textStartX - 10; // Guaranteed safe distance from reference box

  doc.setTextColor(15, 23, 42); // Deep Slate #0f172a
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12); // Reduced from 14 for optimal proportion
  doc.text('PAKISTAN WIRE INDUSTRIES (PVT.) LTD.', textStartX, 23);

  // Dynamically calculate font size so long titles never collide or truncate
  const titleText = `IN-PROCESS QUALITY INSPECTION REPORT (QMS) — ${inspection.divisionName.toUpperCase()}`;
  let titleFontSize = 8.5;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(titleFontSize);
  while (doc.getTextWidth(titleText) > maxTitleWidth && titleFontSize > 6.5) {
    titleFontSize -= 0.5;
    doc.setFontSize(titleFontSize);
  }
  doc.setTextColor(2, 132, 199); // Vibrant Corporate Blue #0284c7
  doc.text(titleText, textStartX, 37);

  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 116, 139); // Slate #64748b
  doc.text(`Factory & Quality Assurance System  •  Department: ${inspection.departmentName}`, textStartX, 49);

  // Corporate Accent Line under header (Saves ink, stylish & clean separation)
  doc.setDrawColor(2, 132, 199); // #0284c7 Primary Blue accent
  doc.setLineWidth(2);
  doc.line(36, 66, pageWidth - 36, 66);

  let currentY = 80;

  // Metadata Card
  doc.setFillColor(248, 250, 252); // #f8fafc
  doc.setDrawColor(226, 232, 240); // #e2e8f0
  doc.roundedRect(36, currentY, pageWidth - 72, 60, 4, 4, 'FD');

  doc.setFontSize(8.5);
  doc.setTextColor(100, 116, 139); // #64748b
  doc.text('Date:', 48, currentY + 16);
  doc.text('Shift:', 150, currentY + 16);
  doc.text('Machine No:', 240, currentY + 16);
  doc.text('Operator:', 350, currentY + 16);
  doc.text('Result:', 460, currentY + 16);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(15, 23, 42); // #0f172a
  doc.text(inspection.inspectionDate, 48, currentY + 28);
  doc.text(`Shift ${inspection.shift}`, 150, currentY + 28);
  doc.text(inspection.machineNo, 240, currentY + 28);
  doc.text(inspection.operatorName, 350, currentY + 28);

  // Status Badge
  const isPass = inspection.overallResult === 'PASS';
  doc.setFillColor(isPass ? 209 : 254, isPass ? 250 : 226, isPass ? 229 : 226);
  doc.setDrawColor(isPass ? 16 : 239, isPass ? 185 : 68, isPass ? 129 : 68);
  doc.roundedRect(460, currentY + 18, 56, 15, 3, 3, 'FD');
  doc.setTextColor(isPass ? 4 : 185, isPass ? 120 : 28, isPass ? 87 : 28);
  doc.text(inspection.overallResult, 474, currentY + 29);

  // Second row in metadata card
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(100, 116, 139);
  doc.text('Part / Item Name:', 48, currentY + 44);
  doc.text('Prepared By (Inspector):', 350, currentY + 44);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(2, 132, 199); // Blue
  doc.text(`${inspection.itemName} (${inspection.itemCode})`, 48, currentY + 54);
  doc.setTextColor(15, 23, 42);
  doc.text(inspection.inspectorName || 'Mairaj', 350, currentY + 54);

  currentY += 72;

  // Section 1: Dimensional Checks (5 Samples)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  doc.text('DIMENSIONAL INSPECTION DATA (5 SAMPLES PER SHIFT)', 36, currentY);
  currentY += 8;

  const sampleHeaders = [
    '#',
    'Characteristic',
    'Dimension Req (Nominal & Tol)',
    'S-1',
    'S-2',
    'S-3',
    'S-4',
    'S-5',
    'Average',
    'Status',
  ];

  const sampleRows = inspection.samples.map((s, idx) => {
    return [
      String(idx + 1),
      s.charName,
      `${s.nominal} (±${s.tolPlus}${s.unit})`,
      s.s1 !== undefined && s.s1 !== null ? String(s.s1) : '-',
      s.s2 !== undefined && s.s2 !== null ? String(s.s2) : '-',
      s.s3 !== undefined && s.s3 !== null ? String(s.s3) : '-',
      s.s4 !== undefined && s.s4 !== null ? String(s.s4) : '-',
      s.s5 !== undefined && s.s5 !== null ? String(s.s5) : '-',
      s.average ? `${s.average} ${s.unit}` : '-',
      s.status,
    ];
  });

  autoTable(doc, {
    startY: currentY,
    head: [sampleHeaders],
    body: sampleRows,
    theme: 'grid',
    styles: {
      font: 'helvetica',
      fontSize: 8,
      cellPadding: 4,
      textColor: [30, 41, 59],
      lineColor: [203, 213, 225],
      lineWidth: 0.5,
    },
    headStyles: {
      fillColor: [30, 58, 138], // Dark Blue #1e3a8a
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      halign: 'center',
    },
    columnStyles: {
      0: { halign: 'center', cellWidth: 20 },
      1: { fontStyle: 'bold', cellWidth: 100 },
      2: { cellWidth: 95 },
      3: { halign: 'center', cellWidth: 38 },
      4: { halign: 'center', cellWidth: 38 },
      5: { halign: 'center', cellWidth: 38 },
      6: { halign: 'center', cellWidth: 38 },
      7: { halign: 'center', cellWidth: 38 },
      8: { halign: 'center', fontStyle: 'bold', cellWidth: 55 },
      9: { halign: 'center', fontStyle: 'bold', cellWidth: 45 },
    },
    margin: { left: 36, right: 36 },
    didParseCell: (data) => {
      if (data.section === 'body' && data.column.index === 9) {
        if (data.cell.raw === 'PASS') {
          data.cell.styles.textColor = [5, 150, 105];
          data.cell.styles.fillColor = [240, 253, 244];
        } else if (data.cell.raw === 'FAIL') {
          data.cell.styles.textColor = [220, 38, 38];
          data.cell.styles.fillColor = [254, 242, 242];
        }
      }
    },
  });

  currentY = (doc as any).lastAutoTable.finalY + 16;

  // Section 2: Visual & Structural Attribute Checks
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  doc.text('VISUAL / FUNCTIONAL ATTRIBUTE CHECKS (GO / NO-GO)', 36, currentY);
  currentY += 8;

  const attrHeaders = ['#', 'Attribute Check Item', 'Checked Sample Qty', 'Defects Found', 'Compliance Status'];
  const attrRows = inspection.attributes.map((a, idx) => [
    String(idx + 1),
    a.checkName,
    String(a.checkedQty),
    String(a.defectsQty),
    a.status,
  ]);

  autoTable(doc, {
    startY: currentY,
    head: [attrHeaders],
    body: attrRows,
    theme: 'grid',
    styles: {
      font: 'helvetica',
      fontSize: 8,
      cellPadding: 4,
      textColor: [30, 41, 59],
      lineColor: [203, 213, 225],
      lineWidth: 0.5,
    },
    headStyles: {
      fillColor: [71, 85, 105], // Slate #475569
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      halign: 'center',
    },
    columnStyles: {
      0: { halign: 'center', cellWidth: 20 },
      1: { fontStyle: 'bold', cellWidth: 200 },
      2: { halign: 'center', cellWidth: 100 },
      3: { halign: 'center', cellWidth: 90 },
      4: { halign: 'center', fontStyle: 'bold', cellWidth: 110 },
    },
    margin: { left: 36, right: 36 },
    didParseCell: (data) => {
      if (data.section === 'body' && data.column.index === 4) {
        if (data.cell.raw === 'PASS') {
          data.cell.styles.textColor = [5, 150, 105];
          data.cell.styles.fillColor = [240, 253, 244];
        } else if (data.cell.raw === 'FAIL') {
          data.cell.styles.textColor = [220, 38, 38];
          data.cell.styles.fillColor = [254, 242, 242];
        }
      }
    },
  });

  currentY = (doc as any).lastAutoTable.finalY + 16;

  // Section 3: Remarks and Sign-off Box
  if (currentY > pageHeight - 90) {
    doc.addPage();
    currentY = 40;
  }

  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(203, 213, 225);
  doc.roundedRect(36, currentY, pageWidth - 72, 64, 4, 4, 'FD');

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(100, 116, 139);
  doc.text('Remarks / Observations:', 48, currentY + 14);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(15, 23, 42);
  doc.text(inspection.remarks || 'Ok - All parameters meet quality specification standards.', 48, currentY + 27);

  // Inspector Signature block
  doc.setDrawColor(148, 163, 184);
  doc.line(320, currentY + 42, 420, currentY + 42);
  doc.setFontSize(8.5);
  doc.setTextColor(15, 23, 42);
  doc.text(inspection.inspectorName || 'Mairaj', 345, currentY + 52);
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  doc.text('QC Inspector (Prepared By)', 330, currentY + 60);

  // Approval Signature block
  doc.line(440, currentY + 42, 540, currentY + 42);
  doc.setFontSize(8.5);
  doc.setTextColor(15, 23, 42);
  doc.text(inspection.approvedBy || 'Quality Incharge', 452, currentY + 52);
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  doc.text('Approved / Verified By', 450, currentY + 60);

  // Footer stamp
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(7.5);
  doc.setTextColor(148, 163, 184);
  doc.text(`Generated via Pakistan Wire Industries (Pvt.) Ltd. Enterprise ERP & QMS System • ${inspection.inspectionNo}`, 36, pageHeight - 16);
}

export function exportQmsToPdf(inspection: QmsInProcessInspection): string {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'pt',
    format: 'a4',
  });

  renderInspectionPage(doc, inspection);

  const cleanPart = (inspection.itemName || 'Inspection').replace(/[^a-zA-Z0-9_-]/g, '_');
  const filename = `${inspection.docRef.replace(/[/]/g, '_')}_${inspection.inspectionNo}_${cleanPart}.pdf`;
  doc.save(filename);
  return filename;
}

export function exportBatchQmsToPdf(inspections: QmsInProcessInspection[]): string {
  if (!inspections || inspections.length === 0) return '';
  if (inspections.length === 1) return exportQmsToPdf(inspections[0]);

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'pt',
    format: 'a4',
  });

  inspections.forEach((insp, idx) => {
    if (idx > 0) {
      doc.addPage();
    }
    renderInspectionPage(doc, insp);
  });

  const dateStr = new Date().toISOString().slice(0, 10);
  const filename = `QMS_Batch_Inspections_${inspections.length}_Records_${dateStr}.pdf`;
  doc.save(filename);
  return filename;
}

