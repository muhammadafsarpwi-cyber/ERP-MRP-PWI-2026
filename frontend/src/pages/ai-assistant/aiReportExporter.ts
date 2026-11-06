import dayjs from 'dayjs';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { AiColumn, KpiCardData } from './types';
import { AiAnswer } from '../../services/aiAssistantService';
import { formatQty } from './reportGenerator';

export interface ExportableAiMessage {
  id: string;
  text: string;
  timestamp?: string;
  divisionScope?: string;
  departmentScope?: string;
  periodLabel?: string;
  reportTitle?: string;
  kpiCards?: KpiCardData[];
  tableData?: {
    columns: AiColumn[];
    rows: any[];
  };
  backendAnswer?: AiAnswer;
  auditTrail?: {
    dataSource: string;
    filters: string[];
    period: string;
    timestamp: string;
    recordsExamined: number;
  };
  whatsappText?: string;
}

export type ExportActionType = 'pdf' | 'excel' | 'whatsapp';

const NUMBER_EMOJIS = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];

/**
 * Detects whether a user query is asking for PDF, Excel, or WhatsApp export,
 * and whether it is a standalone follow-up command (referring to the previous report)
 * or combined with a new data query.
 */
export function detectExportCommand(rawQuery: string): {
  format: ExportActionType | null;
  isStandaloneFollowUp: boolean;
} {
  const q = rawQuery.toLowerCase().trim();

  const hasPdf =
    /\b(pdf)\b/i.test(q) ||
    q.includes('پی ڈی ایف') ||
    q.includes('پی ڈی اف');

  const hasExcel =
    /\b(excel|xls|xlsx|csv|spreadsheet)\b/i.test(q) ||
    q.includes('ایکسل') ||
    q.includes('اکسل');

  const hasWhatsApp =
    /\b(whatsapp|whats\s*app|wa)\b/i.test(q) ||
    q.includes('واٹس ایپ') ||
    q.includes('واٹس اپ') ||
    q.includes('واٹساپ');

  const format: ExportActionType | null = hasPdf
    ? 'pdf'
    : hasExcel
    ? 'excel'
    : hasWhatsApp
    ? 'whatsapp'
    : null;

  if (!format) {
    return { format: null, isStandaloneFollowUp: false };
  }

  // Check if the query also specifies a new date, month, machine, or dimension
  const hasNewReportSubject =
    /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?|today|yesterday|operator|customer|spoke|flattening|spiral|swagging|straightener|plating|top\s+\d+)\b/i.test(q) ||
    /(?:جنوری|فروری|مارچ|اپریل|مئی|جون|جولائی|اگست|ستمبر|اکتوبر|نومبر|دسمبر|آج|کل|مشین\s+وائز|اپریٹر|کسٹمر|سپوک|سٹریٹنر|سویجنگ|پلیٹنگ|ٹاپ)/.test(q) ||
    /\b\d{1,2}[-/]\d{1,2}[-/]\d{2,4}\b/.test(q);

  return {
    format,
    isStandaloneFollowUp: !hasNewReportSubject,
  };
}

/**
 * Strips emojis and non-ASCII glyphs that standard jsPDF Helvetica cannot render,
 * while preserving clean ASCII text, numbers, and punctuation.
 */
function cleanPdfText(input: any): string {
  if (input === null || input === undefined) return '';
  return String(input)
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE00}-\u{FE0F}]/gu, '')
    .replace(/[•·]/g, '-')
    .replace(/[—–]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extracts structured plain-text columns and rows from an ExportableAiMessage
 * so both PDF and Excel exports have clean, readable cell values.
 */
export function extractStructuredTable(msg: ExportableAiMessage): {
  headers: string[];
  rows: { cells: string[]; isSectionHeader?: boolean; isSubtotal?: boolean; isGrandTotal?: boolean }[];
} {
  if (msg.backendAnswer && msg.backendAnswer.columns.length > 0) {
    const cols = msg.backendAnswer.columns;
    const rows = (msg.backendAnswer.rows || []).map((r) => ({
      cells: cols.map((c) => {
        const v = r[c];
        if (typeof v === 'number') return formatQty(v);
        return v !== null && v !== undefined ? String(v) : '—';
      }),
    }));
    return { headers: cols, rows };
  }

  if (!msg.tableData || !msg.tableData.columns || msg.tableData.columns.length === 0) {
    return { headers: [], rows: [] };
  }

  const columns = msg.tableData.columns;
  const headers = columns.map((c) => String(c.title || c.dataIndex || c.key || 'Column'));

  const rows = (msg.tableData.rows || []).map((r: any) => {
    const isSectionHeader = Boolean(r?.isSectionHeader);
    const isSubtotal = Boolean(r?.isSubtotal);
    const isGrandTotal = Boolean(r?.isGrandTotal);

    const cells = columns.map((col, colIdx) => {
      const key = String(col.dataIndex || col.key || '');
      const rawVal = r?.[key];

      if (isSectionHeader) {
        if (colIdx === 0) return String(r.machine || r[key] || '');
        if (colIdx === 1) return String(r.itemDisplay || r[key] || '');
        return '';
      }

      // Special composite columns from Granular Daily Ledger
      if (key === 'itemDisplay') {
        if (isSubtotal || isGrandTotal) return String(r.itemDisplay || '');
        if (r.itemCode && r.itemName) return `${r.itemCode} — ${r.itemName}`;
        return String(rawVal ?? '');
      }

      if (key === 'runtimeDynamicTarget') {
        const dyn = r.runtimeDynamicTarget !== undefined && r.runtimeDynamicTarget !== null
          ? `${formatQty(r.runtimeDynamicTarget)} ${r.uom || ''}`.trim()
          : '';
        const rate = r.targetPerHour !== undefined && r.targetPerHour !== null
          ? `(${formatQty(r.targetPerHour)}/hr${r.runningHours ? ` × ${r.runningHours}h` : ''})`
          : '';
        return [dyn, rate].filter(Boolean).join(' ');
      }

      if (key === 'actualProduction') {
        if (rawVal === null || rawVal === undefined) return '';
        return `${formatQty(rawVal)} ${r.uom || ''}`.trim();
      }

      if (key === 'achievementPct' || key === 'efficiency') {
        if (rawVal === null || rawVal === undefined) return '';
        return `${rawVal}%`;
      }

      if (key === 'productScrapPcs') {
        if (r.productScrapPcs === null || r.productScrapPcs === undefined) return '';
        return `${formatQty(r.productScrapPcs)} PCS (${formatQty(r.productScrapKg)} KG)`;
      }

      if (key === 'processScrapKg') {
        if (r.processScrapKg === null || r.processScrapKg === undefined) return '';
        return `${formatQty(r.processScrapPcs)} PCS (${formatQty(r.processScrapKg)} KG)`;
      }

      if (typeof rawVal === 'number') {
        return formatQty(rawVal);
      }

      if (Array.isArray(rawVal)) {
        return rawVal.join(', ');
      }

      return rawVal !== null && rawVal !== undefined ? String(rawVal) : '—';
    });

    return {
      cells,
      isSectionHeader,
      isSubtotal,
      isGrandTotal,
    };
  });

  return { headers, rows };
}

/**
 * Formats an AI Assistant report into a professional, mobile-ready WhatsApp message
 * matching PWI's executive WhatsApp standard (Actual, Achievement %, Item breakdown,
 * Department Totals, and Item-Wise Total Summary at the bottom).
 */
export function buildAiReportWhatsAppText(msg: ExportableAiMessage): string {
  const title = (msg.reportTitle || 'AI Production & Analytics Report').replace(/^[📊📋🎙️\s]+/, '');
  const divScope = msg.divisionScope || 'ALL';
  const deptScope = msg.departmentScope && msg.departmentScope !== 'ALL' ? msg.departmentScope : 'All Departments';
  const period = msg.periodLabel || dayjs().format('DD-MMM-YYYY');

  const out: string[] = [];
  out.push('🏭 *PAKISTAN WIRE INDUSTRIES (PVT.) LTD*');
  out.push(`📋 *${title.toUpperCase()}*`);
  out.push('━━━━━━━━━━━━━━━━━━━━');
  out.push(`🏢 *Division:* *${divScope}*`);
  out.push(`🏭 *Department:* *${deptScope}*`);
  out.push(`📅 *Date / Period:* *${period}*`);
  out.push('━━━━━━━━━━━━━━━━━━━━');

  const rawRows = msg.tableData?.rows || [];

  // Case 1: Granular Daily Production Ledger (has itemCode/itemName + actualProduction + runtimeDynamicTarget)
  const isGranularDaily = rawRows.some(
    (r: any) => !r.isSectionHeader && !r.isSubtotal && !r.isGrandTotal && r.actualProduction !== undefined && r.machine,
  );

  if (isGranularDaily) {
    const dataRows = rawRows.filter((r: any) => !r.isSectionHeader && !r.isSubtotal && !r.isGrandTotal);
    const categories = Array.from(new Set(dataRows.map((r: any) => r.categoryGroup || r.departmentName || 'Production')));
    const itemTotalsMap = new Map<string, { itemName: string; totalQty: number; uom: string }>();

    let grandActual = 0;
    let grandTarget = 0;
    let primaryUom = dataRows[0]?.uom || 'PCS';
    const allMachinesSet = new Set<string>();

    categories.forEach((cat) => {
      const catRows = dataRows.filter((r: any) => (r.categoryGroup || r.departmentName || 'Production') === cat);
      if (catRows.length === 0) return;

      out.push('');
      out.push(`⚙️ *${String(cat).toUpperCase()}:*`);
      out.push('');

      // Group lines by machine within this category
      const machineOrder: string[] = [];
      const machineGroupMap = new Map<
        string,
        {
          machine: string;
          actual: number;
          target: number;
          uom: string;
          items: { name: string; qty: number; uom: string }[];
        }
      >();

      catRows.forEach((r: any) => {
        const mCode = String(r.machine || 'MACHINE');
        allMachinesSet.add(mCode);
        const uom = String(r.uom || primaryUom);
        const actual = Number(r.actualProduction || 0);
        const target = Number(r.runtimeDynamicTarget || 0);
        const itemLabel = r.itemName && r.itemName !== 'Manufactured Product' ? r.itemName : r.itemCode || 'Item';

        if (!machineGroupMap.has(mCode)) {
          machineOrder.push(mCode);
          machineGroupMap.set(mCode, {
            machine: mCode,
            actual: 0,
            target: 0,
            uom,
            items: [],
          });
        }
        const mEntry = machineGroupMap.get(mCode)!;
        mEntry.actual += actual;
        mEntry.target += target;
        mEntry.items.push({ name: itemLabel, qty: actual, uom });

        // Accumulate item-wise total across report
        const itemKey = `${r.itemCode || ''}__${itemLabel}`;
        const existingItem = itemTotalsMap.get(itemKey);
        if (existingItem) {
          existingItem.totalQty += actual;
        } else {
          itemTotalsMap.set(itemKey, { itemName: itemLabel, totalQty: actual, uom });
        }

        grandActual += actual;
        grandTarget += target;
      });

      machineOrder.forEach((mCode, idx) => {
        const m = machineGroupMap.get(mCode)!;
        const ach = m.target > 0 ? Number(((m.actual / m.target) * 100).toFixed(2)) : m.actual > 0 ? 100 : 0;
        const achTone = ach >= 70 ? '▲' : '▼';
        const numEmoji = idx < NUMBER_EMOJIS.length ? NUMBER_EMOJIS[idx] : `#${idx + 1}`;

        out.push(`${numEmoji} *${m.machine}* [✅ Entered]`);
        out.push(`   📦 *Actual:* ${formatQty(m.actual)} ${m.uom}`);
        out.push(`   📊 *Achievement:* ${ach.toFixed(2)}% ${achTone}`);
        if (m.items.length > 0) {
          const itemsStr = m.items.map((it) => `${it.name} (${formatQty(it.qty)} ${it.uom})`).join(', ');
          out.push(`   🏷️ *Items:* ${itemsStr}`);
        }
        out.push('   ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄');
      });
    });

    const overallAch = grandTarget > 0 ? Number(((grandActual / grandTarget) * 100).toFixed(2)) : 0;
    const overallTone = overallAch >= 70 ? '▲' : '▼';

    out.push('');
    out.push('━━━━━━━━━━━━━━━━━━━━');
    out.push(`📊 *REPORT TOTALS (${period}):*`);
    out.push(`• *Total Machines:* ${allMachinesSet.size} Machines`);
    out.push(`• *Total Production:* *${formatQty(grandActual)} ${primaryUom}*`);
    out.push(`• *Overall Achievement:* *${overallAch.toFixed(2)}%* ${overallTone}`);

    if (itemTotalsMap.size > 0) {
      out.push('');
      out.push('📦 *ITEM-WISE TOTAL SUMMARY:*');
      Array.from(itemTotalsMap.values()).forEach((item) => {
        out.push(`• *${item.itemName}:* *${formatQty(item.totalQty)} ${item.uom}*`);
      });
    }

    out.push('━━━━━━━━━━━━━━━━━━━━');
    out.push('📱 _Generated via PWI ERP AI Assistant_');
    return out.join('\n');
  }

  // Case 2: Machine-wise Summary Report (totalProduction, totalTarget, avgDaily, efficiency)
  const isMachineSummary = rawRows.some(
    (r: any) => !r.isSubtotal && !r.isGrandTotal && r.machine && r.totalProduction !== undefined,
  );

  if (isMachineSummary) {
    const machineRows = rawRows.filter((r: any) => !r.isSubtotal && !r.isGrandTotal);
    const grandRow = rawRows.find((r: any) => r.isGrandTotal);
    const uom = msg.kpiCards?.[0]?.unit || 'PCS';

    out.push('');
    out.push('⚙️ *MACHINE-WISE PRODUCTION:*');
    out.push('');

    machineRows.forEach((r: any, idx: number) => {
      const numEmoji = idx < NUMBER_EMOJIS.length ? NUMBER_EMOJIS[idx] : `#${idx + 1}`;
      const eff = Number(r.efficiency || 0);
      const achTone = eff >= 70 ? '▲' : '▼';
      out.push(`${numEmoji} *${r.machine}* (${r.department || deptScope})`);
      out.push(`   📦 *Actual:* ${formatQty(r.totalProduction)} ${uom}`);
      out.push(`   📊 *Achievement:* ${eff}% ${achTone}`);
      if (r.avgDaily !== undefined) {
        out.push(`   📈 *Daily Avg:* ${formatQty(r.avgDaily)} ${uom}/day`);
      }
      out.push('   ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄');
    });

    if (grandRow) {
      const overallEff = Number(grandRow.efficiency || 0);
      const overallTone = overallEff >= 70 ? '▲' : '▼';
      out.push('');
      out.push('━━━━━━━━━━━━━━━━━━━━');
      out.push(`📊 *TOTAL SUMMARY (${period}):*`);
      out.push(`• *Total Machines:* ${machineRows.length} Machines`);
      out.push(`• *Total Production:* *${formatQty(grandRow.totalProduction)} ${uom}*`);
      out.push(`• *Overall Achievement:* *${overallEff}%* ${overallTone}`);
    }

    out.push('━━━━━━━━━━━━━━━━━━━━');
    out.push('📱 _Generated via PWI ERP AI Assistant_');
    return out.join('\n');
  }

  // Case 3: Generic Table or Backend Answer
  const { headers, rows } = extractStructuredTable(msg);
  if (rows.length > 0 && headers.length > 0) {
    out.push('');
    let itemIdx = 0;
    rows.forEach((row) => {
      if (row.isSectionHeader) {
        out.push(`\n🏭 *${row.cells[0]}*`);
        return;
      }
      if (row.isSubtotal || row.isGrandTotal) {
        out.push('━━━━━━━━━━━━━━━━━━━━');
        out.push(`📊 *${row.cells[0]}:* ${row.cells.slice(1).filter(Boolean).join(' | ')}`);
        return;
      }
      const numEmoji = itemIdx < NUMBER_EMOJIS.length ? NUMBER_EMOJIS[itemIdx] : `#${itemIdx + 1}`;
      itemIdx += 1;
      out.push(`${numEmoji} *${row.cells[0]}*`);
      for (let i = 1; i < headers.length; i++) {
        if (row.cells[i] && row.cells[i] !== '—') {
          out.push(`   • *${headers[i]}:* ${row.cells[i]}`);
        }
      }
      out.push('   ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄');
    });
  } else if (msg.text) {
    out.push('');
    out.push(msg.text.replace(/\*\*/g, '*'));
  }

  if (msg.kpiCards && msg.kpiCards.length > 0) {
    out.push('');
    out.push('📊 *KEY SUMMARY METRICS:*');
    msg.kpiCards.forEach((k) => {
      out.push(`• *${k.title}:* *${k.value} ${k.unit || ''}*`.trim());
    });
  }

  out.push('━━━━━━━━━━━━━━━━━━━━');
  out.push('📱 _Generated via PWI ERP AI Assistant_');
  return out.join('\n');
}

/**
 * Generates and downloads a corporate A4 Landscape PDF for an AI Assistant report.
 */
export function exportAiReportToPdf(msg: ExportableAiMessage): string {
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'pt',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const title = cleanPdfText(msg.reportTitle || 'AI Production & Analytics Report');
  const divScope = cleanPdfText(msg.divisionScope || 'ALL');
  const deptScope = cleanPdfText(msg.departmentScope || 'ALL');
  const period = cleanPdfText(msg.periodLabel || dayjs().format('DD-MMM-YYYY'));
  const generatedAt = dayjs().format('DD-MMM-YYYY hh:mm A');

  // Corporate Top Header Bar
  doc.setFillColor(15, 23, 42); // #0f172a
  doc.rect(0, 0, pageWidth, 68, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text('PAKISTAN WIRE INDUSTRIES (PVT.) LTD', 32, 26);

  doc.setFontSize(11);
  doc.setTextColor(147, 197, 253); // #93c5fd
  doc.text(title, 32, 44);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(203, 213, 225);
  doc.text(
    `Division: ${divScope}   |   Department: ${deptScope}   |   Period: ${period}   |   Generated: ${generatedAt}`,
    32,
    58,
  );

  let currentY = 82;

  // Render Executive KPI Strip if available
  if (msg.kpiCards && msg.kpiCards.length > 0) {
    const cards = msg.kpiCards.slice(0, 6);
    const gap = 8;
    const totalAvailWidth = pageWidth - 64;
    const cardWidth = (totalAvailWidth - gap * (cards.length - 1)) / cards.length;

    cards.forEach((kpi, idx) => {
      const x = 32 + idx * (cardWidth + gap);
      doc.setFillColor(248, 250, 252);
      doc.setDrawColor(203, 213, 225);
      doc.roundedRect(x, currentY, cardWidth, 42, 4, 4, 'FD');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      doc.setTextColor(100, 116, 139);
      doc.text(cleanPdfText(kpi.title).slice(0, 28), x + 8, currentY + 14);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10.5);
      doc.setTextColor(15, 23, 42);
      const valText = cleanPdfText(`${kpi.value} ${kpi.unit || ''}`);
      doc.text(valText.slice(0, 24), x + 8, currentY + 31);
    });

    currentY += 54;
  }

  const { headers, rows } = extractStructuredTable(msg);

  if (headers.length > 0 && rows.length > 0) {
    const pdfHeaders = headers.map((h) => cleanPdfText(h));
    const pdfBody = rows.map((r) => r.cells.map((c) => cleanPdfText(c)));

    autoTable(doc, {
      startY: currentY,
      head: [pdfHeaders],
      body: pdfBody,
      margin: { left: 32, right: 32, bottom: 38 },
      styles: {
        font: 'helvetica',
        fontSize: 8.5,
        cellPadding: 5,
        textColor: [15, 23, 42],
        lineColor: [226, 232, 240],
        lineWidth: 0.5,
      },
      headStyles: {
        fillColor: [30, 58, 138], // #1e3a8a
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 8.5,
      },
      alternateRowStyles: {
        fillColor: [248, 250, 252],
      },
      didParseCell: (data) => {
        if (data.section === 'body') {
          const meta = rows[data.row.index];
          if (meta?.isSectionHeader) {
            data.cell.styles.fillColor = [224, 231, 255]; // #e0e7ff
            data.cell.styles.textColor = [30, 58, 138];
            data.cell.styles.fontStyle = 'bold';
          } else if (meta?.isSubtotal) {
            data.cell.styles.fillColor = [219, 234, 254]; // #dbeafe
            data.cell.styles.textColor = [29, 78, 216];
            data.cell.styles.fontStyle = 'bold';
          } else if (meta?.isGrandTotal) {
            data.cell.styles.fillColor = [209, 250, 229]; // #d1fae5
            data.cell.styles.textColor = [6, 95, 70];
            data.cell.styles.fontStyle = 'bold';
          }
        }
      },
      didDrawPage: () => {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(100, 116, 139);
        doc.text(
          `PWI Enterprise ERP & MRP System — Audited AI Report (${period})`,
          32,
          pageHeight - 16,
        );
        doc.text(
          `Page ${doc.getCurrentPageInfo().pageNumber}`,
          pageWidth - 75,
          pageHeight - 16,
        );
      },
    });
  } else {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(15, 23, 42);
    const wrapped = doc.splitTextToSize(cleanPdfText(msg.text), pageWidth - 64);
    doc.text(wrapped, 32, currentY + 14);
  }

  const safePeriod = period.replace(/[^A-Za-z0-9_-]/g, '_');
  const filename = `PWI_AI_Report_${divScope}_${safePeriod}.pdf`;
  doc.save(filename);
  return filename;
}

/**
 * Generates and downloads a formatted Microsoft Excel (.xls) workbook for an AI Assistant report.
 */
export function exportAiReportToExcel(msg: ExportableAiMessage): string {
  const title = msg.reportTitle || 'AI Production & Analytics Report';
  const divScope = msg.divisionScope || 'ALL';
  const deptScope = msg.departmentScope || 'ALL';
  const period = msg.periodLabel || dayjs().format('DD-MMM-YYYY');
  const generatedAt = dayjs().format('DD-MMM-YYYY hh:mm A');

  const escapeHtml = (s: any) =>
    String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');

  const { headers, rows } = extractStructuredTable(msg);
  const colSpan = Math.max(headers.length, 4);

  let html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
<head>
<meta charset="UTF-8">
<style>
  body { font-family: Calibri, Arial, sans-serif; font-size: 11pt; }
  table { border-collapse: collapse; width: 100%; }
  th, td { border: 1px solid #cbd5e1; padding: 6px 10px; text-align: left; }
  .banner { background-color: #0f172a; color: #ffffff; font-weight: bold; font-size: 14pt; }
  .subbanner { background-color: #1e293b; color: #93c5fd; font-weight: bold; font-size: 11pt; }
  .meta { background-color: #f1f5f9; color: #334155; font-size: 10pt; font-weight: bold; }
  .tbl-head { background-color: #1e3a8a; color: #ffffff; font-weight: bold; }
  .sec-row { background-color: #e0e7ff; color: #1e3a8a; font-weight: bold; }
  .sub-row { background-color: #dbeafe; color: #1d4ed8; font-weight: bold; }
  .grand-row { background-color: #d1fae5; color: #065f46; font-weight: bold; }
</style>
</head>
<body>
<table>
  <tr><td colspan="${colSpan}" class="banner">PAKISTAN WIRE INDUSTRIES (PVT.) LTD — ENTERPRISE ERP &amp; MRP</td></tr>
  <tr><td colspan="${colSpan}" class="subbanner">${escapeHtml(title)}</td></tr>
  <tr><td colspan="${colSpan}" class="meta">Division: ${escapeHtml(divScope)} | Department: ${escapeHtml(deptScope)} | Period: ${escapeHtml(period)} | Generated: ${escapeHtml(generatedAt)}</td></tr>
  <tr><td colspan="${colSpan}"></td></tr>`;

  if (msg.kpiCards && msg.kpiCards.length > 0) {
    html += `<tr><td colspan="${colSpan}" class="sec-row">EXECUTIVE KPI SUMMARY</td></tr><tr>`;
    msg.kpiCards.forEach((k) => {
      html += `<td style="background:#f8fafc;font-weight:bold;">${escapeHtml(k.title)}: <span style="color:#1d4ed8;">${escapeHtml(k.value)} ${escapeHtml(k.unit || '')}</span></td>`;
    });
    html += `</tr><tr><td colspan="${colSpan}"></td></tr>`;
  }

  if (headers.length > 0 && rows.length > 0) {
    html += `<tr>${headers.map((h) => `<th class="tbl-head">${escapeHtml(h)}</th>`).join('')}</tr>`;
    rows.forEach((r) => {
      const rowClass = r.isGrandTotal
        ? ' class="grand-row"'
        : r.isSubtotal
        ? ' class="sub-row"'
        : r.isSectionHeader
        ? ' class="sec-row"'
        : '';
      html += `<tr${rowClass}>${r.cells.map((c) => `<td>${escapeHtml(c)}</td>`).join('')}</tr>`;
    });
  } else {
    html += `<tr><td colspan="${colSpan}">${escapeHtml(msg.text)}</td></tr>`;
  }

  html += `</table></body></html>`;

  const blob = new Blob(['\uFEFF' + html], { type: 'application/vnd.ms-excel;charset=utf-8;' });
  const safePeriod = period.replace(/[^A-Za-z0-9_-]/g, '_');
  const filename = `PWI_AI_Report_${divScope}_${safePeriod}.xls`;

  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1500);

  return filename;
}

/**
 * Copies WhatsApp text to clipboard and opens WhatsApp Web / Desktop to share.
 */
export function shareAiReportOnWhatsApp(whatsappText: string): void {
  if (!whatsappText) return;
  try {
    navigator.clipboard.writeText(whatsappText);
  } catch {}
  const url = `https://api.whatsapp.com/send?text=${encodeURIComponent(whatsappText)}`;
  window.open(url, '_blank', 'noopener,noreferrer');
}

