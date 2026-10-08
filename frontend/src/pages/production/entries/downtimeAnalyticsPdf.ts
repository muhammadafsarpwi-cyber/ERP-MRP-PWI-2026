/* ─────────────────────────────────────────────────────────────────────────────
 * downtimeAnalyticsPdf.ts — "PDF auto-tables" half of Tab A's export story
 *
 * Emits the SAME three-tier DATE → DEPARTMENT → MACHINE hierarchy the on-screen
 * accordion shows: one dark date band, then each department tinted beneath it,
 * then the machines that department owns, indented under it. `downtimeTreeOutline`
 * builds that order as plain data, so the PDF can never disagree with the grid
 * it came from.
 *
 * Borders are the print stylesheet's hairline — `1px solid #e2e8f0`, written as
 * 0.75pt (1 CSS px at 96dpi) in the exact same grey — so screen, printout and
 * PDF all carry one rule weight.
 * ──────────────────────────────────────────────────────────────────────────── */

import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { DOWNTIME_TREE_HEADERS, downtimeTreeOutline } from './analyticsModel';
import type { DateNode } from './analyticsModel';

/** `1px solid #e2e8f0` in PDF points. */
const HAIRLINE = 0.75;
/** #e2e8f0 — the hairline grey, matching downtimeAnalytics.css. */
const HAIRLINE_RGB: [number, number, number] = [226, 232, 240];
/** #0f172a — the date band / department banner ink. */
const INK_RGB: [number, number, number] = [15, 23, 42];
/** #f1f5f9 — department banner fill, the same surface-alt the screen uses. */
const BANNER_FILL_RGB: [number, number, number] = [241, 245, 249];
/** #ffffff — machine leaf rows. */
const LEAF_FILL_RGB: [number, number, number] = [255, 255, 255];

export interface DowntimePdfMeta {
  title: string;
  caption: string;
}

export function buildDowntimePdf(
  tree: readonly DateNode[],
  meta: DowntimePdfMeta,
): jsPDF {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 28;
  const marginY = 66;

  /* ── Title block (drawn once; the table starts beneath it) ─────────────── */
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(...INK_RGB);
  doc.text(meta.title, marginX, 38);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(100, 116, 139);
  doc.text(meta.caption, marginX, 52);

  const outline = downtimeTreeOutline(tree);

  autoTable(doc, {
    head: [[...DOWNTIME_TREE_HEADERS]],
    body: outline.length
      ? outline.map((row) => [row.label, row.entries, row.downtime, row.running, row.reason, row.remarks])
      : [['No downtime was recorded in this period.', '', '', '', '', '']],
    startY: marginY,
    margin: { left: marginX, right: marginX, top: marginY, bottom: 36 },
    theme: 'grid',
    // Keep every leaf line whole: a row is never split across a page.
    rowPageBreak: 'avoid',
    styles: {
      fontSize: 8,
      cellPadding: 3,
      overflow: 'linebreak',
      valign: 'top',
      fillColor: LEAF_FILL_RGB,
      textColor: [51, 65, 85],
      lineColor: HAIRLINE_RGB,
      lineWidth: HAIRLINE,
    },
    headStyles: {
      fillColor: INK_RGB,
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      halign: 'left',
      lineColor: HAIRLINE_RGB,
      lineWidth: HAIRLINE,
    },
    columnStyles: {
      0: { cellWidth: 152, halign: 'left' },
      1: { cellWidth: 50, halign: 'right' },
      2: { cellWidth: 68, halign: 'right' },
      3: { cellWidth: 64, halign: 'right' },
      4: { cellWidth: 150, halign: 'left' },
      5: { cellWidth: 'auto', halign: 'left' },
    },
    // Body rows are indexed from 0 inside their own section, so this lines up
    // with `outline` exactly — one band per level of the three-tier tree.
    didParseCell: (data) => {
      if (data.section !== 'body') return;
      const row = outline[data.row.index];
      if (!row) return;
      if (row.level === 'date') {
        // TIER 1 — a dark plant-wide band, impossible to skim past on paper.
        data.cell.styles.fontStyle = 'bold';
        data.cell.styles.fillColor = INK_RGB;
        data.cell.styles.textColor = [255, 255, 255];
      } else if (row.level === 'department') {
        // TIER 2 — the screen's surface-alt tint, bold, ink text.
        data.cell.styles.fontStyle = 'bold';
        data.cell.styles.fillColor = BANNER_FILL_RGB;
        data.cell.styles.textColor = INK_RGB;
      } else {
        // TIER 3 — plain leaf row; the ASCII indent carries the nesting.
        data.cell.styles.fillColor = LEAF_FILL_RGB;
        data.cell.styles.textColor = [71, 85, 105];
      }
      if (data.column.index === 0) data.cell.styles.halign = 'left';
    },
    didDrawPage: () => {
      const pageNumber = doc.getCurrentPageInfo().pageNumber;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(148, 163, 184);
      doc.text(meta.title, marginX, pageHeight - 18);
      doc.text(`Page ${pageNumber}`, pageWidth - marginX, pageHeight - 18, { align: 'right' });
    },
  });

  return doc;
}
