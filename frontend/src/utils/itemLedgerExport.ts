import dayjs from 'dayjs';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { message } from 'antd';
import apiService from '../services/api';
import { formatNumber } from './numberFormat';
import type { ItemStockLedgerData, StockLedgerMovement } from '../components/shared/ItemStockLedgerModal';

/**
 * Breakdown quantity into Cartons (CTN), Gross (GRS), and Pieces (PCS)
 * Carton is placed first to match executive dispatch standards.
 */
export function formatItemUnitBreakdown(
  rawQty: number,
  uomCode?: string,
  itemCode?: string
) {
  const currentUom = (uomCode || 'PCS').trim().toUpperCase();
  const activeCode = (itemCode || '').trim().toUpperCase();
  const isFg =
    currentUom === 'PCS' ||
    currentUom === 'GRS' ||
    currentUom === 'PIECES' ||
    currentUom === 'NO' ||
    currentUom === 'NOS' ||
    activeCode.startsWith('SPI-FG') ||
    activeCode.startsWith('FG-') ||
    activeCode.includes('SPK') ||
    activeCode.includes('NP');

  if (!isFg) return null;

  const absQty = Math.abs(rawQty);
  const isPcs = currentUom !== 'GRS';
  let pcs = 0;
  let gross = 0;

  if (isPcs) {
    pcs = absQty;
    gross = absQty / 144;
  } else {
    gross = absQty;
    pcs = absQty * 144;
  }

  const isCS = activeCode.includes('011') || activeCode.includes('012') || activeCode.includes('CS');
  const grossPerCarton = isCS ? 10.555556 : 10;
  const cartons = gross / grossPerCarton;
  const roundCartons = Math.round(cartons);

  const sign = rawQty < 0 ? '-' : '';
  const fmtCtn = `${sign}${formatNumber(roundCartons, 0)} CTN`;
  const fmtGrs = `${sign}${formatNumber(gross, gross % 1 === 0 ? 0 : 2)} GRS`;
  const fmtPcs = `${sign}${formatNumber(Math.round(pcs), 0)} PCS`;

  return {
    gross,
    cartons: roundCartons,
    pcs,
    fmtCtn,
    fmtGrs,
    fmtPcs,
    sign,
  };
}

/**
 * Clean & condense transaction type for compact reporting
 */
export function cleanTxType(type?: string): string {
  if (!type) return '—';
  const t = type.toUpperCase();
  if (t === 'PRODUCTION_RECEIPT') return 'PROD RECEIPT';
  if (t === 'PRODUCTION_CONSUMPTION') return 'PROD CONS';
  if (t === 'PRODUCTION_SCRAP') return 'SCRAP';
  if (t === 'PRODUCTION_REVERSAL') return 'REVERSAL';
  if (t === 'SALES_DELIVERY') return 'DISPATCH';
  if (t === 'TRANSFER_IN') return 'TRANSFER IN';
  if (t === 'TRANSFER_OUT') return 'TRANSFER OUT';
  if (t === 'OPENING') return 'OPENING';
  return type.replace(/_/g, ' ');
}

/**
 * Clean & condense remarks to strip huge boilerplate and save vertical height
 * Converts 5-line paragraphs into crisp 1-line references.
 */
export function cleanRemarks(notes?: string): string {
  if (!notes) return '—';
  let s = notes.trim();

  // 1. Production Reversal
  if (/reversal/i.test(s)) {
    const pkg = s.match(/(?:HAND-PACK-PKG|PKG|PE)-([0-9]{4})-([0-9]{4,5})/i);
    const pe = s.match(/PE-[0-9]{4}-[0-9]+/i);
    const id = pkg ? `PKG-${pkg[1]}-${pkg[2]}` : (pe ? pe[0] : '');
    return id ? `Rev: Cons (${id})` : 'Reversal of Cons.';
  }

  // 2. Production Consumption (Auto Raw Material Consumption)
  if (/consumption/i.test(s)) {
    const pkg = s.match(/(?:HAND-PACK-PKG|PKG|PE)-([0-9]{4})-([0-9]{4,5})/i);
    const pe = s.match(/PE-[0-9]{4}-[0-9]+/i);
    const id = pkg ? `PKG-${pkg[1]}-${pkg[2]}` : (pe ? pe[0] : '');
    return id ? `Auto Cons (${id})` : 'Raw Material Cons.';
  }

  // 3. Daily Production Receipt
  if (/production receipt|output/i.test(s)) {
    const pe = s.match(/PE-[0-9]{4}-[0-9]+/i);
    return pe ? `Prod Receipt (${pe[0]})` : 'Prod Receipt';
  }

  // 4. Sales Delivery / Dispatch
  if (/sales delivery|dispatch/i.test(s)) {
    const cust = s.match(/to\s+([^(;,]+)/i) || s.match(/Customer:\s*([^|;,]+)/i);
    const sd = s.match(/SD-[0-9]{4}-[0-9]+/i);
    const cName = cust ? cust[1].trim() : '';
    const sdDoc = sd ? ` (${sd[0]})` : '';
    return cName ? `Dispatch: ${cName}${sdDoc}` : `Sales Dispatch${sdDoc}`;
  }

  // 5. Scrap / Rejection
  if (/scrap|rejection/i.test(s)) {
    const pe = s.match(/PE-[0-9]{4}-[0-9]+/i);
    return pe ? `Scrap (${pe[0]})` : 'Scrap / Rejection';
  }

  // 6. Generic cleaning: strip long hashes, repetitive prefixes, dates
  s = s.replace(/HAND-PACK-PKG-([0-9]{4})-([0-9]{4})-[0-9]+/gi, 'PKG-$1-$2');
  s = s.replace(/;\s*audit trail.*$/gi, '');
  s = s.replace(/Automatic raw material consumption for production entry\s*/gi, 'Auto Cons: ');
  s = s.replace(/Reversal of PRODUCTION_CONSUMPTION for production entry\s*/gi, 'Rev: Cons: ');
  s = s.replace(/Daily production receipt\s*/gi, 'Prod Receipt: ');

  if (s.length > 38) {
    s = s.slice(0, 36) + '…';
  }
  return s.trim() || '—';
}

/**
 * Clean & condense flow origin/destination
 */
export function cleanFlow(m: StockLedgerMovement): { main: string; sub?: string; fullText: string } {
  const isDirIn = m.direction === 'IN';
  const cust = m.customerName || (m.notes?.match(/Customer:\s*([^|;,\n]+)/i)?.[1]?.trim());
  const wh = m.warehouse?.name || '';
  const shortWh = wh.replace(/Warehouse/i, '').replace(/SPI/i, '').trim();

  let main = '';
  if (m.referenceType === 'SALES_DELIVERY' || m.transactionType === 'SALES_DELIVERY') {
    main = cust ? `🚚 Dispatch: ${cust}` : '🚚 Sales Dispatch (OUT)';
  } else if (isDirIn) {
    main = cust ? `↳ IN: ${cust}` : (m.department?.name ? `↳ IN: ${m.department.name}` : '↳ Received (IN)');
  } else {
    main = m.department?.name ? `↱ OUT: ${m.department.name}` : '↱ Consumed (OUT)';
  }

  const sub = shortWh ? `Loc: ${shortWh}` : undefined;
  const fullText = sub ? `${main} (${sub})` : main;

  return { main, sub, fullText };
}

/**
 * 1. Export High-Quality, Compact, Multi-Unit PDF Report
 */
export function exportItemLedgerPdf(data: ItemStockLedgerData, warehouseName?: string) {
  if (!data) {
    message.warning('No ledger data available to export');
    return;
  }

  try {
    const doc = new jsPDF({
      orientation: 'landscape',
      unit: 'mm',
      format: 'a4',
    });

    const itemCode = data.item?.itemCode || '—';
    const itemName = data.item?.name || '—';
    const uom = data.item?.uomCode || 'PCS';
    const whName = warehouseName || 'All Warehouses';
    const movements = data.movements || [];

    // Header Background Accent Bar
    doc.setFillColor(15, 23, 42); // slate-900
    doc.rect(0, 0, 297, 18, 'F');

    // Company Header
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(255, 255, 255);
    doc.text('PAKISTAN WIRE INDUSTRIES (PVT.) LTD.', 8, 8);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(148, 163, 184); // slate-400
    doc.text('STOCK MOVEMENT HISTORY & ITEM AUDIT LEDGER', 8, 14);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(255, 255, 255);
    doc.text(`Generated: ${dayjs().format('DD-MMM-YYYY HH:mm')}`, 289, 8, { align: 'right' });
    doc.text(`Warehouse: ${whName}`, 289, 14, { align: 'right' });

    // Item Profile Header Box
    doc.setFillColor(248, 250, 252); // slate-50
    doc.setDrawColor(203, 213, 225); // slate-300
    doc.roundedRect(8, 21, 281, 10, 1.2, 1.2, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(15, 23, 42);
    doc.text(`ITEM: ${itemCode}  —  ${itemName}`, 12, 27);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.text(`Base Unit: ${uom}  |  Total Movements: ${movements.length}`, 284, 27, { align: 'right' });

    // Summary Cards (Carton First!)
    const cardY = 33;
    const cardH = 12;
    const cardW = 67;

    const inBreakdown = formatItemUnitBreakdown(data.summary.totalIn || 0, uom, itemCode);
    const outBreakdown = formatItemUnitBreakdown(data.summary.totalOut || 0, uom, itemCode);
    const balBreakdown = formatItemUnitBreakdown(data.summary.currentBalance || 0, uom, itemCode);

    // Card 1: Total Received
    doc.setFillColor(240, 253, 244); // green-50
    doc.setDrawColor(187, 247, 208); // green-200
    doc.roundedRect(8, cardY, cardW, cardH, 1.2, 1.2, 'FD');
    doc.setFontSize(6.5);
    doc.setTextColor(22, 101, 52); // green-800
    doc.text('TOTAL RECEIVED (+IN)', 12, cardY + 4);
    doc.setFontSize(7.5);
    const inText = inBreakdown
      ? `+${inBreakdown.fmtCtn} • +${inBreakdown.fmtGrs} (= +${inBreakdown.fmtPcs})`
      : `+${formatNumber(data.summary.totalIn || 0, 0)} ${uom}`;
    doc.text(inText, 12, cardY + 9);

    // Card 2: Total Issued
    doc.setFillColor(254, 242, 242); // red-50
    doc.setDrawColor(254, 202, 202); // red-200
    doc.roundedRect(79, cardY, cardW, cardH, 1.2, 1.2, 'FD');
    doc.setFontSize(6.5);
    doc.setTextColor(153, 27, 27); // red-800
    doc.text('TOTAL ISSUED (-OUT)', 83, cardY + 4);
    doc.setFontSize(7.5);
    const outText = outBreakdown
      ? `-${outBreakdown.fmtCtn} • -${outBreakdown.fmtGrs} (= -${outBreakdown.fmtPcs})`
      : `-${formatNumber(data.summary.totalOut || 0, 0)} ${uom}`;
    doc.text(outText, 83, cardY + 9);

    // Card 3: Current Live Balance
    doc.setFillColor(240, 249, 255); // sky-50
    doc.setDrawColor(186, 230, 253); // sky-200
    doc.roundedRect(150, cardY, cardW, cardH, 1.2, 1.2, 'FD');
    doc.setFontSize(6.5);
    doc.setTextColor(3, 105, 161); // sky-800
    doc.text('CURRENT LIVE BALANCE', 154, cardY + 4);
    doc.setFontSize(7.5);
    const balText = balBreakdown
      ? `${balBreakdown.fmtCtn} • ${balBreakdown.fmtGrs} (= ${balBreakdown.fmtPcs})`
      : `${formatNumber(data.summary.currentBalance || 0, 0)} ${uom}`;
    doc.text(balText, 154, cardY + 9);

    // Card 4: Audit Entries
    doc.setFillColor(250, 245, 255); // purple-50
    doc.setDrawColor(233, 213, 255); // purple-200
    doc.roundedRect(221, cardY, cardW + 8, cardH, 1.2, 1.2, 'FD');
    doc.setFontSize(6.5);
    doc.setTextColor(107, 33, 168); // purple-800
    doc.text('AUDIT MOVEMENTS', 225, cardY + 4);
    doc.setFontSize(7.5);
    doc.text(`${movements.length} transactions recorded`, 225, cardY + 9);

    // Table Columns: Compact & High Density (Carton first in headers and rows!)
    const head = [[
      '#',
      'Date & Time',
      'Transaction Type',
      'Doc / Ref #',
      'PO / SOC #',
      'Movement Flow',
      'Received (+IN)\nCTN • GRS • PCS',
      'Issued (-OUT)\nCTN • GRS • PCS',
      'Running Balance\nCTN • GRS • PCS',
      'Remarks',
    ]];

    const body = movements.map((m, idx) => {
      const dt = m.date
        ? dayjs(m.date).format('DD-MMM-YY HH:mm')
        : (m.createdAt ? dayjs(m.createdAt).format('DD-MMM-YY HH:mm') : '—');

      const po = m.poNumber ? `PO: ${m.poNumber}` : '';
      const soc = m.socNumber ? `SOC: ${m.socNumber}` : '';
      const poSoc = [po, soc].filter(Boolean).join('\n') || '—';

      const flow = cleanFlow(m);
      const tx = cleanTxType(m.transactionType);
      const notes = cleanRemarks(m.notes);

      // Unit Conversions with Carton at start, then Gross and PCS
      const inConv = formatItemUnitBreakdown(m.inQuantity, uom, itemCode);
      const outConv = formatItemUnitBreakdown(m.outQuantity, uom, itemCode);
      const balConv = formatItemUnitBreakdown(m.runningBalance, uom, itemCode);

      let inVal = '—';
      if (m.inQuantity > 0) {
        inVal = inConv
          ? `+${inConv.fmtCtn}\n+${inConv.fmtGrs} • +${inConv.fmtPcs}`
          : `+${formatNumber(m.inQuantity, 0)} ${uom}`;
      }

      let outVal = '—';
      if (m.outQuantity > 0) {
        outVal = outConv
          ? `-${outConv.fmtCtn}\n-${outConv.fmtGrs} • -${outConv.fmtPcs}`
          : `-${formatNumber(m.outQuantity, 0)} ${uom}`;
      }

      const balVal = balConv
        ? `${balConv.fmtCtn}\n${balConv.fmtGrs} • ${balConv.fmtPcs}`
        : `${formatNumber(m.runningBalance, 0)} ${uom}`;

      return [
        idx + 1,
        dt,
        tx,
        m.referenceNumber || '—',
        poSoc,
        flow.fullText,
        inVal,
        outVal,
        balVal,
        notes,
      ];
    });

    autoTable(doc, {
      head,
      body,
      startY: 48,
      margin: { left: 8, right: 8 },
      styles: {
        fontSize: 6.8,
        cellPadding: { top: 1.1, bottom: 1.1, left: 1.4, right: 1.4 },
        lineColor: [226, 232, 240],
        lineWidth: 0.12,
        valign: 'middle',
        overflow: 'ellipsize',
      },
      headStyles: {
        fillColor: [15, 23, 42],
        textColor: 255,
        fontStyle: 'bold',
        fontSize: 7.2,
        cellPadding: { top: 1.6, bottom: 1.6, left: 1.4, right: 1.4 },
      },
      alternateRowStyles: {
        fillColor: [248, 250, 252],
      },
      columnStyles: {
        0: { cellWidth: 7, halign: 'center' },
        1: { cellWidth: 22 },
        2: { cellWidth: 25 },
        3: { cellWidth: 24 },
        4: { cellWidth: 22 },
        5: { cellWidth: 38 },
        6: { cellWidth: 37, halign: 'right', fontStyle: 'bold', textColor: [22, 101, 52] },
        7: { cellWidth: 37, halign: 'right', fontStyle: 'bold', textColor: [153, 27, 27] },
        8: { cellWidth: 38, halign: 'right', fontStyle: 'bold', textColor: [2, 132, 199] },
        9: { cellWidth: 31 },
      },
      didDrawPage: (dataObj) => {
        const pageCount = (doc as any).internal.getNumberOfPages();
        doc.setFontSize(6.8);
        doc.setTextColor(148, 163, 184);
        doc.text(
          `Page ${dataObj.pageNumber} of ${pageCount}`,
          doc.internal.pageSize.getWidth() - 8,
          doc.internal.pageSize.getHeight() - 4,
          { align: 'right' }
        );
        doc.text(
          'Pakistan Wire Industries (Pvt.) Ltd. — Official Stock Movement Audit Ledger',
          8,
          doc.internal.pageSize.getHeight() - 4
        );
      },
    });

    const safeName = itemCode.replace(/[^a-zA-Z0-9_-]/g, '_');
    doc.save(`Stock-Ledger-${safeName}-${dayjs().format('YYYY-MM-DD')}.pdf`);
    message.success(`PDF exported successfully for ${itemCode}`);
  } catch (err: any) {
    console.error('Failed to export PDF:', err);
    message.error(err?.message || 'Failed to export PDF report');
  }
}

/**
 * 2. Ultra-Compact, Stylish, Multi-Unit Print View (Browser window.print)
 * Saves maximum paper by packing 30-35 rows per landscape page.
 */
export function printItemLedger(data: ItemStockLedgerData, warehouseName?: string) {
  if (!data) {
    message.warning('No ledger data available to print');
    return;
  }

  const itemCode = data.item?.itemCode || '—';
  const itemName = data.item?.name || '—';
  const uom = data.item?.uomCode || 'PCS';
  const whName = warehouseName || 'All Warehouses';
  const movements = data.movements || [];

  const balBreakdown = formatItemUnitBreakdown(data.summary.currentBalance || 0, uom, itemCode);
  const inBreakdown = formatItemUnitBreakdown(data.summary.totalIn || 0, uom, itemCode);
  const outBreakdown = formatItemUnitBreakdown(data.summary.totalOut || 0, uom, itemCode);

  const rowsHtml = movements.map((m, idx) => {
    const dt = m.date
      ? dayjs(m.date).format('DD-MMM-YY HH:mm')
      : (m.createdAt ? dayjs(m.createdAt).format('DD-MMM-YY HH:mm') : '—');
    const isDirIn = m.direction === 'IN';

    const inConv = formatItemUnitBreakdown(m.inQuantity, uom, itemCode);
    const outConv = formatItemUnitBreakdown(m.outQuantity, uom, itemCode);
    const balConv = formatItemUnitBreakdown(m.runningBalance, uom, itemCode);

    let inHtml = '<span style="color:#94a3b8;">—</span>';
    if (m.inQuantity > 0) {
      inHtml = inConv
        ? `<div style="color:#16a34a;font-weight:800;font-size:9.5px;">+${inConv.fmtCtn}</div>
           <div style="color:#15803d;font-size:8px;font-weight:600;margin-top:1px;">+${inConv.fmtGrs} • +${inConv.fmtPcs}</div>`
        : `<div style="color:#16a34a;font-weight:700;font-size:9.5px;">+${formatNumber(m.inQuantity, 0)} ${uom}</div>`;
    }

    let outHtml = '<span style="color:#94a3b8;">—</span>';
    if (m.outQuantity > 0) {
      outHtml = outConv
        ? `<div style="color:#dc2626;font-weight:800;font-size:9.5px;">-${outConv.fmtCtn}</div>
           <div style="color:#b91c1c;font-size:8px;font-weight:600;margin-top:1px;">-${outConv.fmtGrs} • -${outConv.fmtPcs}</div>`
        : `<div style="color:#dc2626;font-weight:700;font-size:9.5px;">-${formatNumber(m.outQuantity, 0)} ${uom}</div>`;
    }

    const balHtml = balConv
      ? `<div style="color:#0284c7;font-weight:800;font-size:9.5px;">${balConv.fmtCtn}</div>
         <div style="color:#0369a1;font-size:8px;font-weight:700;margin-top:1px;">${balConv.fmtGrs} • ${balConv.fmtPcs}</div>`
      : `<div style="color:#0284c7;font-weight:800;font-size:9.5px;">${formatNumber(m.runningBalance, 0)} ${uom}</div>`;

    const po = m.poNumber ? `<div><strong>PO:</strong> ${m.poNumber}</div>` : '';
    const soc = m.socNumber ? `<div><strong>SOC:</strong> ${m.socNumber}</div>` : '';
    const poSoc = (po || soc) ? `${po}${soc}` : '—';

    const flow = cleanFlow(m);
    const tx = cleanTxType(m.transactionType);
    const notes = cleanRemarks(m.notes);

    return `<tr>
      <td style="text-align:center;color:#64748b;font-size:8.5px;">${idx + 1}</td>
      <td style="white-space:nowrap;font-weight:600;font-size:8.5px;">${dt}</td>
      <td style="font-size:8.5px;font-weight:700;white-space:nowrap;">${tx}</td>
      <td style="font-family:monospace;font-weight:700;color:#0284c7;font-size:8.5px;white-space:nowrap;">${m.referenceNumber || '—'}</td>
      <td style="font-size:8px;line-height:1.15;white-space:nowrap;">${poSoc}</td>
      <td style="font-size:8.5px;line-height:1.15;">
        <div style="color:${isDirIn ? '#16a34a' : '#dc2626'};font-weight:700;white-space:nowrap;">${flow.main}</div>
        ${flow.sub ? `<div style="color:#64748b;font-size:7.5px;white-space:nowrap;">${flow.sub}</div>` : ''}
      </td>
      <td style="text-align:right;font-family:monospace;line-height:1.15;">${inHtml}</td>
      <td style="text-align:right;font-family:monospace;line-height:1.15;">${outHtml}</td>
      <td style="text-align:right;font-family:monospace;line-height:1.15;background:#f0f9ff;">${balHtml}</td>
      <td style="font-size:8px;color:#334155;line-height:1.15;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:160px;" title="${(m.notes || '').replace(/"/g, '&quot;')}">${notes}</td>
    </tr>`;
  }).join('');

  const inCardText = inBreakdown
    ? `+${inBreakdown.fmtCtn} • +${inBreakdown.fmtGrs} (= +${inBreakdown.fmtPcs})`
    : `+${formatNumber(data.summary.totalIn || 0, 0)} ${uom}`;

  const outCardText = outBreakdown
    ? `-${outBreakdown.fmtCtn} • -${outBreakdown.fmtGrs} (= -${outBreakdown.fmtPcs})`
    : `-${formatNumber(data.summary.totalOut || 0, 0)} ${uom}`;

  const balCardText = balBreakdown
    ? `${balBreakdown.fmtCtn} • ${balBreakdown.fmtGrs} (= ${balBreakdown.fmtPcs})`
    : `${formatNumber(data.summary.currentBalance || 0, 0)} ${uom}`;

  const html = `<!doctype html>
  <html>
  <head>
    <meta charset="utf-8" />
    <title>Stock Ledger - ${itemCode}</title>
    <style>
      @page {
        size: A4 landscape;
        margin: 5mm 6mm;
      }
      body {
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
        color: #0f172a;
        margin: 0;
        padding: 4px;
        font-size: 8.5px;
        background: #ffffff;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
      .header-bar {
        border-bottom: 2px solid #0f172a;
        padding-bottom: 4px;
        margin-bottom: 6px;
        display: flex;
        justify-content: space-between;
        align-items: flex-end;
      }
      .company-title {
        font-size: 14px;
        font-weight: 800;
        color: #0f172a;
        letter-spacing: -0.01em;
      }
      .doc-title {
        font-size: 10px;
        color: #0284c7;
        font-weight: 700;
        margin-top: 1px;
      }
      .item-banner {
        background: #f8fafc;
        border: 1px solid #cbd5e1;
        border-radius: 3px;
        padding: 4px 8px;
        margin-bottom: 6px;
        display: flex;
        justify-content: space-between;
      }
      .metric-cards {
        display: flex;
        gap: 6px;
        margin-bottom: 6px;
      }
      .card {
        flex: 1;
        border-radius: 3px;
        padding: 4px 6px;
        border: 1px solid #e2e8f0;
      }
      .card-green { background: #f0fdf4; border-color: #bbf7d0; color: #166534; }
      .card-red { background: #fef2f2; border-color: #fecaca; color: #991b1b; }
      .card-sky { background: #f0f9ff; border-color: #bae6fd; color: #0369a1; }
      .card-purple { background: #faf5ff; border-color: #e9d5ff; color: #6b21a8; }
      .card-label { font-size: 7.5px; font-weight: 700; text-transform: uppercase; margin-bottom: 1px; }
      .card-val { font-size: 9.5px; font-weight: 800; }
      table {
        width: 100%;
        border-collapse: collapse;
        font-size: 8.5px;
        line-height: 1.15;
      }
      th, td {
        border: 1px solid #cbd5e1;
        padding: 1.8px 3.5px;
        vertical-align: middle;
      }
      th {
        background: #0f172a;
        color: #ffffff;
        font-size: 8px;
        font-weight: 700;
        text-align: left;
        padding: 3.5px 3.5px;
        letter-spacing: 0.02em;
        text-transform: uppercase;
      }
      tbody tr:nth-child(even) {
        background: #f8fafc;
      }
      tr {
        page-break-inside: avoid;
      }
      @media print {
        body { padding: 0; }
        .no-print { display: none !important; }
      }
    </style>
  </head>
  <body>
    <div class="header-bar">
      <div>
        <div class="company-title">PAKISTAN WIRE INDUSTRIES (PVT.) LTD.</div>
        <div class="doc-title">ITEM STOCK MOVEMENT HISTORY &amp; AUDIT LEDGER</div>
      </div>
      <div style="text-align: right; font-size: 8.5px; color: #64748b;">
        <div><strong>Warehouse:</strong> ${whName}</div>
        <div>Generated: ${dayjs().format('DD-MMM-YYYY HH:mm')}</div>
      </div>
    </div>

    <div class="item-banner">
      <div>
        <span style="font-size: 8px; font-weight: 700; color: #64748b;">ITEM CODE &amp; DESC: </span>
        <strong style="font-size: 10px; color: #0284c7;">${itemCode}</strong> — <span style="font-weight: 700;">${itemName}</span>
      </div>
      <div style="text-align: right; font-size: 8.5px;">
        <span style="color: #7e22ce; font-weight: 700;">Unit: ${uom}</span> &nbsp;|&nbsp;
        <span style="color: #475569;">Entries: ${movements.length}</span>
      </div>
    </div>

    <div class="metric-cards">
      <div class="card card-green">
        <div class="card-label">Total Received (+ IN)</div>
        <div class="card-val">${inCardText}</div>
      </div>
      <div class="card card-red">
        <div class="card-label">Total Issued (- OUT)</div>
        <div class="card-val">${outCardText}</div>
      </div>
      <div class="card card-sky">
        <div class="card-label">Current Live Balance</div>
        <div class="card-val">${balCardText}</div>
      </div>
      <div class="card card-purple">
        <div class="card-label">Audit Trail Records</div>
        <div class="card-val">${movements.length} Movements</div>
      </div>
    </div>

    <table>
      <thead>
        <tr>
          <th style="width: 22px; text-align: center;">#</th>
          <th style="width: 85px;">Date &amp; Time</th>
          <th style="width: 95px;">Type</th>
          <th style="width: 85px;">Doc / Ref #</th>
          <th style="width: 75px;">PO / SOC #</th>
          <th style="width: 130px;">Movement Flow</th>
          <th style="width: 125px; text-align: right;">
            <div>Received (+IN)</div>
            <div style="font-size: 7px; font-weight: normal; opacity: 0.85;">CTN • GRS • PCS</div>
          </th>
          <th style="width: 125px; text-align: right;">
            <div>Issued (-OUT)</div>
            <div style="font-size: 7px; font-weight: normal; opacity: 0.85;">CTN • GRS • PCS</div>
          </th>
          <th style="width: 130px; text-align: right;">
            <div>Running Balance</div>
            <div style="font-size: 7px; font-weight: normal; opacity: 0.85;">CTN • GRS • PCS</div>
          </th>
          <th>Remarks</th>
        </tr>
      </thead>
      <tbody>
        ${rowsHtml}
      </tbody>
    </table>

    <script>
      window.onload = function() {
        setTimeout(function() {
          window.print();
        }, 300);
      };
    </script>
  </body>
  </html>`;

  const printWin = window.open('', '_blank');
  if (printWin) {
    printWin.document.open();
    printWin.document.write(html);
    printWin.document.close();
  } else {
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const win = window.open(url, '_blank');
    if (!win) {
      message.error('Please allow popups to print stock ledger report');
    }
  }
}

/**
 * 3. Generate Formatted Executive WhatsApp Share
 */
export function shareItemLedgerWhatsApp(data: ItemStockLedgerData, warehouseName?: string) {
  if (!data) {
    message.warning('No ledger data available to share on WhatsApp');
    return;
  }

  const itemCode = data.item?.itemCode || '—';
  const itemName = data.item?.name || '—';
  const uom = data.item?.uomCode || 'PCS';
  const whName = warehouseName || 'All Warehouses';
  const movements = data.movements || [];

  const balBreakdown = formatItemUnitBreakdown(data.summary.currentBalance || 0, uom, itemCode);
  const inBreakdown = formatItemUnitBreakdown(data.summary.totalIn || 0, uom, itemCode);
  const outBreakdown = formatItemUnitBreakdown(data.summary.totalOut || 0, uom, itemCode);

  const balStr = balBreakdown
    ? `*${balBreakdown.fmtCtn} • ${balBreakdown.fmtGrs}* (= ${balBreakdown.fmtPcs})`
    : `*${formatNumber(data.summary.currentBalance || 0, 0)} ${uom}*`;

  const inStr = inBreakdown
    ? `+${inBreakdown.fmtCtn} • +${inBreakdown.fmtGrs} (= +${inBreakdown.fmtPcs})`
    : `${formatNumber(data.summary.totalIn || 0, 0)} ${uom}`;

  const outStr = outBreakdown
    ? `-${outBreakdown.fmtCtn} • -${outBreakdown.fmtGrs} (= -${outBreakdown.fmtPcs})`
    : `${formatNumber(data.summary.totalOut || 0, 0)} ${uom}`;

  // Top recent 5 movements
  const recentMovements = movements.slice(0, 5).map((m, i) => {
    const dt = m.date ? dayjs(m.date).format('DD-MMM-YY') : '—';
    const isDirIn = m.direction === 'IN';
    const sign = isDirIn ? '+IN' : '-OUT';
    const conv = formatItemUnitBreakdown(m.quantity, uom, itemCode);
    const qtyStr = conv ? `${conv.fmtCtn} • ${conv.fmtGrs}` : `${formatNumber(m.quantity, 0)} ${uom}`;
    const ref = m.referenceNumber && m.referenceNumber !== '-' ? ` [${m.referenceNumber}]` : '';
    const cust = m.customerName ? ` (${m.customerName})` : '';
    return `${i + 1}. ${dt} | ${sign} ${qtyStr}${ref}${cust}`;
  }).join('\n');

  const text = `*PAKISTAN WIRE INDUSTRIES (PVT.) LTD.*
📦 *ITEM STOCK LEDGER & AUDIT TRAIL*
────────────────────────────
🏷 *Item:* ${itemCode}
📝 *Description:* ${itemName}
📍 *Warehouse:* ${whName}
📏 *Base Unit:* ${uom}
📅 *Date:* ${dayjs().format('DD-MMM-YYYY HH:mm')}

📊 *STOCK SUMMARY:*
• Total Received (+IN): ${inStr}
• Total Issued (-OUT): ${outStr}
• *Current Live Balance:* ${balStr}
• Total Audit Records: ${movements.length} entries

📋 *RECENT MOVEMENTS:*
${recentMovements || 'No movement records.'}
────────────────────────────
_PWI Enterprise ERP & MRP System_`;

  try {
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(text);
    }
  } catch (e) {
    console.warn('Clipboard write failed:', e);
  }

  const waUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;
  window.open(waUrl, '_blank');
  message.success('Stock ledger summary copied to clipboard & WhatsApp opened!');
}

/**
 * 4. Fetch Ledger from API and immediately Trigger PDF, Print, or WhatsApp
 * (Used for direct row actions in Inventory table)
 */
export async function fetchAndExportItemLedger(
  itemId: string,
  warehouseId: string | undefined,
  warehouseName: string | undefined,
  actionType: 'pdf' | 'print' | 'whatsapp',
  fallbackInfo?: { itemCode?: string; itemName?: string; uomCode?: string }
) {
  const hide = message.loading(`Preparing ${actionType.toUpperCase()} for ${fallbackInfo?.itemCode || 'item'}…`, 0);
  try {
    const params: any = {};
    if (warehouseId) params.warehouseId = warehouseId;

    let res: any;
    try {
      res = await apiService.get<{ success: boolean; data: ItemStockLedgerData }>(
        `/inventory/balances/items/${itemId}/ledger`,
        params
      );
    } catch {
      res = await apiService.get<{ success: boolean; data: ItemStockLedgerData }>(
        `/inventory/receipts/items/${itemId}/ledger`,
        params
      );
    }

    const ledgerData: ItemStockLedgerData = res?.data || res;
    if (!ledgerData || !ledgerData.item) {
      // Fallback object if API returned partial data
      if (fallbackInfo) {
        (ledgerData as any).item = {
          id: itemId,
          itemCode: fallbackInfo.itemCode || '—',
          name: fallbackInfo.itemName || '—',
          uomCode: fallbackInfo.uomCode || 'PCS',
        };
      }
    }

    hide();

    if (actionType === 'pdf') {
      exportItemLedgerPdf(ledgerData, warehouseName);
    } else if (actionType === 'print') {
      printItemLedger(ledgerData, warehouseName);
    } else if (actionType === 'whatsapp') {
      shareItemLedgerWhatsApp(ledgerData, warehouseName);
    }
  } catch (err: any) {
    hide();
    console.error('Failed to export ledger from row action:', err);
    message.error(err?.message || 'Failed to export item ledger');
  }
}
