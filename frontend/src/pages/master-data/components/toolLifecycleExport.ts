import dayjs from 'dayjs';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

export interface ToolExportKpi {
  label: string;
  value: string;
  tone?: 'neutral' | 'primary' | 'success' | 'warning' | 'danger';
}

export interface ToolExportColumn {
  header: string;
  key: string;
  align?: 'left' | 'right' | 'center';
  widthWeight?: number;
}

export interface ToolExportPayload {
  reportTitle: string;
  subtitle: string;
  fileBaseName: string;
  printedBy: string;
  generatedAt?: string;
  filterSummary: string;
  kpis: ToolExportKpi[];
  columns: ToolExportColumn[];
  rows: Array<Record<string, string | number>>;
}

let cachedLogoDataUrl: string | null | undefined;

async function fetchAsDataUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { cache: 'force-cache' });
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise<string | null>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(typeof reader.result === 'string' ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

export async function loadCompanyLogoDataUrl(): Promise<string | null> {
  if (cachedLogoDataUrl !== undefined) {
    return cachedLogoDataUrl;
  }
  const primary = await fetchAsDataUrl('/logo.png');
  if (primary) {
    cachedLogoDataUrl = primary;
    return primary;
  }
  const fallback = await fetchAsDataUrl('/logo-mark.png');
  cachedLogoDataUrl = fallback;
  return fallback;
}

function escapeCsvCell(val: unknown): string {
  const s = val === null || val === undefined ? '' : String(val);
  const normalized = s.replace(/\r\n|\r|\n/g, ' ').trim();
  return `"${normalized.replace(/"/g, '""')}"`;
}

function escapeHtml(val: unknown): string {
  return String(val ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function exportToolReportCSV(payload: ToolExportPayload): void {
  const headerLine = payload.columns.map((c) => escapeCsvCell(c.header)).join(',');
  const dataLines = payload.rows.map((row) =>
    payload.columns.map((c) => escapeCsvCell(row[c.key] ?? '')).join(','),
  );
  const csvContent = '\uFEFF' + [headerLine, ...dataLines].join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = `${payload.fileBaseName}-${dayjs().format('YYYY-MM-DD')}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const PDF_TONE_COLORS: Record<NonNullable<ToolExportKpi['tone']>, [number, number, number]> = {
  neutral: [71, 85, 105],
  primary: [37, 99, 235],
  success: [5, 150, 105],
  warning: [217, 119, 6],
  danger: [220, 38, 38],
};

export function exportToolReportPDF(payload: ToolExportPayload, logoDataUrl: string | null): void {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 28;
  const contentWidth = pageWidth - marginX * 2;
  const generatedAt = payload.generatedAt || dayjs().format('DD MMM YYYY, hh:mm A');

  let textStartX = marginX;
  if (logoDataUrl) {
    try {
      doc.addImage(logoDataUrl, 'PNG', marginX, 20, 40, 40);
      textStartX = marginX + 50;
    } catch {
      textStartX = marginX;
    }
  }

  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text('PAKISTAN WIRE INDUSTRIES (PVT.) LTD.', textStartX, 32);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(71, 85, 105);
  doc.text(payload.subtitle, textStartX, 44);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(29, 78, 216);
  doc.text(payload.reportTitle, textStartX, 58);

  // Right-side metadata block
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(71, 85, 105);
  doc.text(`Printed: ${generatedAt}`, pageWidth - marginX, 31, { align: 'right' });
  doc.text(`Prepared By: ${payload.printedBy}`, pageWidth - marginX, 43, { align: 'right' });
  doc.text(`Records: ${payload.rows.length.toLocaleString()}`, pageWidth - marginX, 55, { align: 'right' });

  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.75);
  doc.line(marginX, 66, pageWidth - marginX, 66);

  // Active filter summary bar
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(marginX, 72, contentWidth, 18, 3, 3, 'F');
  doc.setFontSize(7.8);
  doc.setTextColor(51, 65, 85);
  doc.text(`Scope / Filters: ${payload.filterSummary}`, marginX + 8, 84, {
    maxWidth: contentWidth - 16,
  });

  // KPI strip
  let cursorY = 98;
  if (payload.kpis.length > 0) {
    const gap = 6;
    const cardW = (contentWidth - gap * (payload.kpis.length - 1)) / payload.kpis.length;
    const cardH = 34;

    payload.kpis.forEach((kpi, idx) => {
      const x = marginX + idx * (cardW + gap);
      const accent = PDF_TONE_COLORS[kpi.tone || 'neutral'];
      doc.setFillColor(255, 255, 255);
      doc.setDrawColor(226, 232, 240);
      doc.setLineWidth(0.6);
      doc.roundedRect(x, cursorY, cardW, cardH, 3, 3, 'FD');

      // Top accent line
      doc.setFillColor(accent[0], accent[1], accent[2]);
      doc.rect(x, cursorY, cardW, 2.5, 'F');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6.5);
      doc.setTextColor(100, 116, 139);
      doc.text(kpi.label.toUpperCase(), x + 6, cursorY + 13, { maxWidth: cardW - 12 });

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(accent[0], accent[1], accent[2]);
      doc.text(String(kpi.value), x + 6, cursorY + 27, { maxWidth: cardW - 12 });
    });

    cursorY += cardH + 10;
  }

  const head = [payload.columns.map((c) => c.header)];
  const body = payload.rows.map((r) =>
    payload.columns.map((c) => {
      const v = r[c.key];
      return v === null || v === undefined || v === '' ? '—' : String(v);
    }),
  );

  const columnStyles: Record<number, { halign?: 'left' | 'right' | 'center'; cellWidth?: number }> = {};
  const totalWeight = payload.columns.reduce((sum, c) => sum + (c.widthWeight || 1), 0);
  payload.columns.forEach((col, i) => {
    columnStyles[i] = {
      halign: col.align || 'left',
      cellWidth: totalWeight > 0 ? ((col.widthWeight || 1) / totalWeight) * contentWidth : undefined,
    };
  });

  autoTable(doc, {
    startY: cursorY,
    head,
    body,
    theme: 'grid',
    margin: { left: marginX, right: marginX, bottom: 52 },
    styles: {
      fontSize: 7.4,
      cellPadding: { top: 4, right: 5, bottom: 4, left: 5 },
      textColor: [30, 41, 59],
      lineColor: [203, 213, 225],
      lineWidth: 0.4,
      valign: 'middle',
      overflow: 'linebreak',
    },
    headStyles: {
      fillColor: [30, 41, 59],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 7.5,
      halign: 'left',
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
    columnStyles,
    rowPageBreak: 'avoid',
  });

  const lastAutoTable = (doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable;
  let sigY = (lastAutoTable?.finalY ?? cursorY) + 28;
  if (sigY > pageHeight - 72) {
    doc.addPage();
    sigY = 56;
  }

  // Three signature blocks on last page
  const sigLabels = [
    `Prepared By (${payload.printedBy})`,
    'Production / Tool Room Incharge',
    'Approved By (Plant Manager)',
  ];
  const sigColW = (contentWidth - 60) / 3;
  sigLabels.forEach((label, idx) => {
    const sx = marginX + idx * (sigColW + 30);
    doc.setDrawColor(148, 163, 184);
    doc.setLineWidth(0.7);
    doc.line(sx, sigY + 18, sx + sigColW, sigY + 18);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(71, 85, 105);
    doc.text(label, sx + sigColW / 2, sigY + 29, { align: 'center' });
  });

  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p += 1) {
    doc.setPage(p);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.text(
      `Pakistan Wire Industries (Pvt.) LTD · Machine Tools & Components · ${generatedAt}`,
      marginX,
      pageHeight - 16,
    );
    doc.text(`Page ${p} of ${totalPages}`, pageWidth - marginX, pageHeight - 16, { align: 'right' });
  }

  doc.save(`${payload.fileBaseName}-${dayjs().format('YYYY-MM-DD')}.pdf`);
}

function getPrintToneCss(tone?: ToolExportKpi['tone']): string {
  switch (tone) {
    case 'primary':
      return '#1d4ed8';
    case 'success':
      return '#047857';
    case 'warning':
      return '#b45309';
    case 'danger':
      return '#b91c1c';
    default:
      return '#0f172a';
  }
}

function renderCellHtml(colKey: string, value: string | number): string {
  const str = value === null || value === undefined || value === '' ? '—' : String(value);
  if (colKey === 'status') {
    const upper = str.toUpperCase();
    if (upper === 'ACTIVE') {
      return `<span class="badge badge-active">ACTIVE</span>`;
    }
    if (upper === 'STANDBY') {
      return `<span class="badge badge-standby">STANDBY</span>`;
    }
    if (upper === 'CLOSED') {
      return `<span class="badge badge-closed">CLOSED</span>`;
    }
  }
  return escapeHtml(str);
}

export function buildToolReportPrintHtml(
  payload: ToolExportPayload,
  logoDataUrl: string | null,
): string {
  const generatedAt = payload.generatedAt || dayjs().format('DD MMM YYYY, hh:mm A');

  const kpiCardsHtml = payload.kpis
    .map(
      (kpi) => `
      <div class="kpi-card" style="border-top-color:${getPrintToneCss(kpi.tone)};">
        <div class="kpi-label">${escapeHtml(kpi.label)}</div>
        <div class="kpi-value" style="color:${getPrintToneCss(kpi.tone)};">${escapeHtml(kpi.value)}</div>
      </div>`,
    )
    .join('');

  const theadHtml = payload.columns
    .map(
      (col) =>
        `<th style="text-align:${col.align || 'left'};">${escapeHtml(col.header)}</th>`,
    )
    .join('');

  const tbodyHtml =
    payload.rows.length > 0
      ? payload.rows
          .map((row) => {
            const cells = payload.columns
              .map(
                (col) =>
                  `<td style="text-align:${col.align || 'left'};">${renderCellHtml(col.key, row[col.key] ?? '')}</td>`,
              )
              .join('');
            return `<tr>${cells}</tr>`;
          })
          .join('')
      : `<tr><td colspan="${payload.columns.length}" style="text-align:center;padding:24px;color:#64748b;">No records match the current filters.</td></tr>`;

  const logoHtml = logoDataUrl
    ? `<img src="${logoDataUrl}" alt="PWI Logo" class="company-logo" />`
    : `<div class="logo-fallback">PWI</div>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(payload.reportTitle)} — Pakistan Wire Industries (Pvt.) LTD</title>
  <style>
    @page {
      size: A4 landscape;
      margin: 10mm 11mm 12mm 11mm;
    }
    * {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    html, body {
      margin: 0;
      padding: 0;
      background: #ffffff;
      color: #0f172a;
      font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, Roboto, Arial, sans-serif;
      font-size: 10.5px;
      line-height: 1.4;
    }
    .sheet {
      width: 100%;
      padding: 14px 16px;
      background: #ffffff;
    }
    .letterhead {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 2px solid #0f172a;
      padding-bottom: 10px;
      margin-bottom: 10px;
      gap: 16px;
    }
    .brand-left {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .company-logo {
      width: 48px;
      height: 48px;
      object-fit: contain;
    }
    .logo-fallback {
      width: 44px;
      height: 44px;
      border-radius: 8px;
      background: #0f172a;
      color: #ffffff;
      font-weight: 800;
      font-size: 14px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .company-name {
      font-size: 16px;
      font-weight: 800;
      letter-spacing: 0.02em;
      color: #0f172a;
      text-transform: uppercase;
    }
    .company-sub {
      font-size: 10.5px;
      color: #475569;
      margin-top: 1px;
    }
    .report-title {
      font-size: 13.5px;
      font-weight: 700;
      color: #1d4ed8;
      margin-top: 3px;
    }
    .meta-right {
      text-align: right;
      font-size: 10px;
      color: #334155;
      line-height: 1.55;
      white-space: nowrap;
    }
    .meta-right strong {
      color: #0f172a;
    }
    .filter-bar {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      padding: 6px 10px;
      font-size: 10px;
      color: #334155;
      margin-bottom: 10px;
    }
    .filter-bar strong {
      color: #0f172a;
    }
    .kpi-strip {
      display: grid;
      grid-template-columns: repeat(${Math.max(payload.kpis.length, 1)}, minmax(0, 1fr));
      gap: 8px;
      margin-bottom: 12px;
    }
    .kpi-card {
      border: 1px solid #cbd5e1;
      border-top-width: 3px;
      border-radius: 6px;
      padding: 6px 8px;
      background: #ffffff;
    }
    .kpi-label {
      font-size: 8.5px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: #64748b;
    }
    .kpi-value {
      font-size: 13.5px;
      font-weight: 800;
      margin-top: 2px;
      font-variant-numeric: tabular-nums;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      table-layout: auto;
      font-size: 9.8px;
    }
    thead {
      display: table-header-group;
    }
    tr {
      page-break-inside: avoid;
      break-inside: avoid;
    }
    th {
      background: #1e293b;
      color: #ffffff;
      font-weight: 700;
      padding: 6px 7px;
      border: 1px solid #1e293b;
      white-space: nowrap;
      font-size: 9.2px;
      letter-spacing: 0.02em;
    }
    td {
      padding: 5.5px 7px;
      border: 1px solid #cbd5e1;
      color: #0f172a;
      vertical-align: middle;
      font-variant-numeric: tabular-nums;
    }
    tbody tr:nth-child(even) {
      background: #f8fafc;
    }
    .badge {
      display: inline-block;
      padding: 1.5px 6px;
      border-radius: 999px;
      font-size: 8.5px;
      font-weight: 700;
      letter-spacing: 0.03em;
      border: 1px solid transparent;
    }
    .badge-active {
      background: #dcfce7;
      color: #166534;
      border-color: #86efac;
    }
    .badge-standby {
      background: #fef3c7;
      color: #92400e;
      border-color: #fcd34d;
    }
    .badge-closed {
      background: #f1f5f9;
      color: #334155;
      border-color: #cbd5e1;
    }
    .signatures {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 32px;
      margin-top: 28px;
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .sig-box {
      text-align: center;
      padding-top: 24px;
    }
    .sig-line {
      border-top: 1px solid #64748b;
      padding-top: 5px;
      font-size: 9.8px;
      font-weight: 700;
      color: #334155;
    }
    .footer-note {
      margin-top: 14px;
      padding-top: 6px;
      border-top: 1px solid #e2e8f0;
      display: flex;
      justify-content: space-between;
      font-size: 8.8px;
      color: #64748b;
    }
    .no-print-bar {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      padding: 8px 16px;
      background: #f1f5f9;
      border-bottom: 1px solid #cbd5e1;
    }
    .btn-print {
      background: #1d4ed8;
      color: #ffffff;
      border: none;
      border-radius: 6px;
      padding: 6px 14px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
    }
    .btn-close {
      background: #ffffff;
      color: #334155;
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      padding: 6px 12px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
    }
    @media print {
      .no-print-bar { display: none !important; }
      .sheet { padding: 0; }
    }
  </style>
</head>
<body>
  <div class="no-print-bar">
    <button class="btn-close" onclick="window.close()">Close</button>
    <button class="btn-print" onclick="window.print()">Print Report</button>
  </div>
  <div class="sheet">
    <div class="letterhead">
      <div class="brand-left">
        ${logoHtml}
        <div>
          <div class="company-name">Pakistan Wire Industries (Pvt.) LTD.</div>
          <div class="company-sub">${escapeHtml(payload.subtitle)}</div>
          <div class="report-title">${escapeHtml(payload.reportTitle)}</div>
        </div>
      </div>
      <div class="meta-right">
        <div><strong>Print Date:</strong> ${escapeHtml(generatedAt)}</div>
        <div><strong>Prepared By:</strong> ${escapeHtml(payload.printedBy)}</div>
        <div><strong>Total Records:</strong> ${payload.rows.length.toLocaleString()}</div>
      </div>
    </div>

    <div class="filter-bar">
      <strong>Active Scope &amp; Filters:</strong> ${escapeHtml(payload.filterSummary)}
    </div>

    ${payload.kpis.length > 0 ? `<div class="kpi-strip">${kpiCardsHtml}</div>` : ''}

    <table>
      <thead><tr>${theadHtml}</tr></thead>
      <tbody>${tbodyHtml}</tbody>
    </table>

    <div class="signatures">
      <div class="sig-box"><div class="sig-line">Prepared By (${escapeHtml(payload.printedBy)})</div></div>
      <div class="sig-box"><div class="sig-line">Production / Tool Room Incharge</div></div>
      <div class="sig-box"><div class="sig-line">Approved By (Plant Manager)</div></div>
    </div>

    <div class="footer-note">
      <span>Pakistan Wire Industries (Pvt.) LTD — PWI ERP &amp; MRP System</span>
      <span>Report Generated: ${escapeHtml(generatedAt)}</span>
    </div>
  </div>
  <script>
    window.addEventListener('load', function () {
      setTimeout(function () {
        try { window.focus(); window.print(); } catch (e) {}
      }, 220);
    });
  </script>
</body>
</html>`;
}

export function printToolReport(
  payload: ToolExportPayload,
  logoDataUrl: string | null,
  targetWindow?: Window | null,
): boolean {
  const win = targetWindow || window.open('', '_blank', 'width=1240,height=840');
  if (!win) {
    return false;
  }
  const html = buildToolReportPrintHtml(payload, logoDataUrl);
  win.document.open();
  win.document.write(html);
  win.document.close();
  return true;
}
