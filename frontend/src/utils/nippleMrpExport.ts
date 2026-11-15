import dayjs from 'dayjs';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { message } from 'antd';
import { formatDecimal } from './numberFormat';
import { getLogoUrl } from './printTemplates';

export interface NippleMrpExportOptions {
  rows: any[];
  totals: any;
  timePhasedPlan: {
    baseDateIso?: string;
    horizonIso?: string;
    safetyMonths: number;
    shipmentMilestones: any[];
    matrixRows: any[];
  };
  viewMode: 'summary' | 'matrix';
  safetyMonths: number;
  horizonIso: string;
  includeFgrStock: boolean;
  isInventoryMode: boolean;
  remarks?: string;
}

interface LogoAssetCache {
  dataUrl: string;
  bytes: Uint8Array;
}

let cachedLogoPromise: Promise<LogoAssetCache | null> | null = null;

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

function renderRemarksToPng(remarks: string): { dataUrl: string; widthMm: number; heightMm: number } | null {
  try {
    const clean = String(remarks || '').trim();
    if (!clean) return null;
    const canvas = document.createElement('canvas');
    const scale = 2;
    const widthPx = 1100;
    const padX = 18;
    const padY = 14;
    const lineHeight = 26;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.font = '500 16px "Segoe UI", "Jameel Noori Nastaleeq", "Noto Nastaliq Urdu", Tahoma, Arial, sans-serif';

    const paragraphs = clean.split(/\r?\n/);
    const wrappedLines: { text: string; rtl: boolean }[] = [];
    const maxLineW = widthPx - padX * 2;
    for (const para of paragraphs) {
      const isRtl = /[\u0600-\u06FF]/.test(para);
      const words = para.split(/\s+/);
      let line = '';
      for (const word of words) {
        const test = line ? `${line} ${word}` : word;
        if (ctx.measureText(test).width > maxLineW && line) {
          wrappedLines.push({ text: line, rtl: isRtl });
          line = word;
        } else {
          line = test;
        }
      }
      wrappedLines.push({ text: line, rtl: isRtl });
    }

    const heightPx = Math.max(54, padY * 2 + 22 + wrappedLines.length * lineHeight);
    canvas.width = widthPx * scale;
    canvas.height = heightPx * scale;

    ctx.scale(scale, scale);
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(0, 0, widthPx, heightPx);
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(1, 1, widthPx - 2, heightPx - 2);

    ctx.fillStyle = '#0f172a';
    ctx.font = '700 13px "Segoe UI", Arial, sans-serif';
    ctx.fillText('REPORT REMARKS / NOTES:', padX, padY + 11);

    ctx.fillStyle = '#1e293b';
    ctx.font = '500 16px "Segoe UI", "Jameel Noori Nastaleeq", "Noto Nastaliq Urdu", Tahoma, Arial, sans-serif';
    wrappedLines.forEach((l, idx) => {
      const y = padY + 34 + idx * lineHeight;
      if (l.rtl) {
        ctx.direction = 'rtl';
        ctx.textAlign = 'right';
        ctx.fillText(l.text, widthPx - padX, y);
      } else {
        ctx.direction = 'ltr';
        ctx.textAlign = 'left';
        ctx.fillText(l.text, padX, y);
      }
    });

    const widthMm = 281;
    const heightMm = Math.round(((heightPx / widthPx) * widthMm) * 10) / 10;
    return { dataUrl: canvas.toDataURL('image/png'), widthMm, heightMm };
  } catch {
    return null;
  }
}

const CLOSED_PO_STATUSES = ['FULLY_RECEIVED', 'RECEIVED', 'CLOSED', 'CANCELLED', 'VOID'];

function getOpenPos(row: any): any[] {
  return (row.linkedPurchaseOrders || []).filter((p: any) => {
    const st = String(p.status || 'DRAFT').toUpperCase();
    if (CLOSED_PO_STATUSES.includes(st)) return false;
    const openQty =
      p.pendingQuantity !== undefined
        ? Number(p.pendingQuantity)
        : Math.max(0, Number(p.orderedQuantity || 0) - Number(p.receivedQuantity || 0));
    return openQty > 0;
  });
}

function getStatusText(row: any, isInventoryMode: boolean): string {
  if (!isInventoryMode) {
    const isShort = Number(row.finalBalanceShortage ?? row.balance ?? 0) > 0;
    return isShort ? 'Production Required' : 'Stock Sufficient';
  }
  switch (row.importStatus) {
    case 'STOCK_SUFFICIENT':
      return 'Stock Sufficient';
    case 'PO_COVERED':
      return 'PO Placed (Covered)';
    case 'PARTIAL_PO_PLACED':
      return `Partial PO (Order ${formatDecimal(row.remainingImportRequirement || 0, 0)} GRS)`;
    default:
      return 'Import Required (No PO)';
  }
}

function buildSpokeDetailsList(rows: any[]) {
  const list: any[] = [];
  rows.forEach((r: any) => {
    (r.linkedSpokeSets || []).forEach((s: any) => {
      const ord = Math.max(0, Number(s.orderedQuantity || 0));
      const disp = Math.max(0, Number(s.dispatchedQuantity || 0));
      const pendOrder =
        s.pendingOrderQuantity !== undefined
          ? Math.max(0, Number(s.pendingOrderQuantity))
          : Math.max(0, ord - disp);
      const packed = Math.max(0, Number(s.packedQuantity || 0));
      const withoutNipple = Math.max(0, Number(s.withoutNippleQuantity || 0));
      const balToPack =
        s.balanceToPackQuantity !== undefined
          ? Math.max(0, Number(s.balanceToPackQuantity))
          : Math.max(0, pendOrder - packed);
      const pctPacked = pendOrder > 0 ? Math.min(100, Math.round((packed / pendOrder) * 100)) : 100;

      list.push({
        itemCode: r.itemCode || '',
        itemName: r.itemName || '',
        spokeName: s.spokeName || '',
        ord,
        disp,
        pendOrder,
        packed,
        withoutNipple,
        balToPack,
        pctPacked,
        uom: s.uom || r.uom || 'GRS',
      });
    });
  });
  return list;
}

function buildOpenPoDetailsList(rows: any[], milestones: any[] = []) {
  const milestoneByPo = new Map<string, any>();
  milestones.forEach((m: any) => {
    if (m.poCode) milestoneByPo.set(String(m.poCode).trim().toUpperCase(), m);
    if (m.poNumber) milestoneByPo.set(String(m.poNumber).trim().toUpperCase(), m);
    if (m.poId) milestoneByPo.set(String(m.poId), m);
  });

  const list: any[] = [];
  rows.forEach((r: any) => {
    getOpenPos(r).forEach((p: any) => {
      const code = String(p.poCode || p.poNumber || '').trim();
      const ms = milestoneByPo.get(code.toUpperCase()) || milestoneByPo.get(String(p.poId || ''));
      const ordered = Math.max(0, Number(p.orderedQuantity || 0));
      const received = Math.max(0, Number(p.receivedQuantity || 0));
      const openQty =
        p.pendingQuantity !== undefined
          ? Math.max(0, Number(p.pendingQuantity))
          : Math.max(0, ordered - received);
      const stage = p.importStage
        ? String(p.importStage).replace(/_/g, ' ')
        : String(p.status || 'ORDERED').replace(/_/g, ' ');
      const fileNumber = p.lcTtNumber || p.fileNumber || ms?.fileNumber || '—';
      const etaDate = p.expectedDeliveryDate
        ? String(p.expectedDeliveryDate).slice(0, 10)
        : ms?.etaDate || '—';

      list.push({
        itemCode: r.itemCode || '',
        itemName: r.itemName || '',
        poCode: code || '—',
        supplierName: p.supplierName || ms?.vendorName || '—',
        origin: p.purchaseOrigin || 'IMPORT',
        stage,
        fileNumber,
        etaDate,
        ordered,
        received,
        openQty,
        uom: r.uom || 'GRS',
      });
    });
  });
  return list;
}

// ============================================================================
// 1. EXECUTIVE VECTOR PDF EXPORT (A4 LANDSCAPE via jsPDF + jspdf-autotable)
// ============================================================================
export async function exportNippleMrpPdf(options: NippleMrpExportOptions): Promise<void> {
  const { rows, totals, timePhasedPlan, viewMode, safetyMonths, horizonIso, isInventoryMode, remarks } = options;

  try {
    const logoAssets = await loadLogoAssets();
    const doc = new jsPDF({
      orientation: 'landscape',
      unit: 'mm',
      format: 'a4',
    });

    const pageWidth = doc.internal.pageSize.getWidth(); // 297mm
    const pageHeight = doc.internal.pageSize.getHeight(); // 210mm
    const margin = 8;
    const nowStr = dayjs().format('DD-MMM-YYYY HH:mm');
    const viewLabel =
      viewMode === 'matrix'
        ? `TIME-PHASED SHIPMENT PLAN (${safetyMonths}M SAFETY TARGET)`
        : 'DEMAND & STOCK BALANCE SUMMARY';

    const drawHeaderBanner = () => {
      // Navy corporate header bar
      doc.setFillColor(15, 23, 42);
      doc.rect(0, 0, pageWidth, 18, 'F');

      // Subtle cyan bottom accent stripe
      doc.setFillColor(2, 132, 199);
      doc.rect(0, 18, pageWidth, 1.2, 'F');

      let textX = margin;
      if (logoAssets?.dataUrl) {
        doc.setFillColor(255, 255, 255);
        doc.roundedRect(margin, 2.2, 13.5, 13.5, 1.5, 1.5, 'F');
        doc.addImage(logoAssets.dataUrl, 'PNG', margin + 0.8, 3, 11.9, 11.9);
        textX = margin + 16.5;
      }

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12.5);
      doc.setTextColor(255, 255, 255);
      doc.text('PAKISTAN WIRE INDUSTRIES (PVT.) LTD.', textX, 7.8);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(186, 230, 253);
      doc.text('Nipple Demand, Stock Balance & Import MRP Report', textX, 13.6);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(255, 255, 255);
      doc.text(viewLabel, pageWidth - margin, 7.6, { align: 'right' });

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(203, 213, 225);
      doc.text(
        `Generated: ${nowStr}   |   All Quantities in GRS (1 GRS = 144 PCS)`,
        pageWidth - margin,
        13.6,
        { align: 'right' },
      );
    };

    // Page 1 Header + 4-Box KPI Strip
    drawHeaderBanner();

    const kpiY = 22.5;
    const kpiH = 15.5;
    const gap = 4;
    const kpiW = (pageWidth - margin * 2 - gap * 3) / 4;

    const kpiCards = [
      {
        title: 'TOTAL PENDING ORDER',
        value: `${formatDecimal(totals.netPendingOrder, 0)} GRS`,
        sub: `Gross Ord: ${formatDecimal(totals.totalDemand, 0)}  |  Disp: ${formatDecimal(totals.totalDispatched, 0)} GRS`,
        bg: [248, 250, 252] as [number, number, number],
        border: [148, 163, 184] as [number, number, number],
        accent: [15, 23, 42] as [number, number, number],
        valColor: [15, 23, 42] as [number, number, number],
      },
      {
        title: 'REMAINING TO PACK',
        value: `${formatDecimal(totals.remainingToPack, 0)} GRS`,
        sub: `Packed (w/ Nipple): ${formatDecimal(totals.packedFgr, 0)}${
          totals.withoutNippleCartonsFgr > 0 ? `  |  No-Nipple: ${formatDecimal(totals.withoutNippleCartonsFgr, 0)}` : ''
        }`,
        bg: [254, 242, 242] as [number, number, number],
        border: [252, 165, 165] as [number, number, number],
        accent: [220, 38, 38] as [number, number, number],
        valColor: [185, 28, 28] as [number, number, number],
      },
      {
        title: 'UNPACKED NIPPLE STOCK (WH-002)',
        value: `${formatDecimal(totals.currentFg, 0)} GRS`,
        sub: `Packable Now: ${formatDecimal(totals.packableFromStockGrs, 0)}  |  Surplus: +${formatDecimal(totals.stockSurplus, 0)} GRS`,
        bg: [240, 253, 244] as [number, number, number],
        border: [134, 239, 172] as [number, number, number],
        accent: [22, 163, 74] as [number, number, number],
        valColor: [21, 128, 61] as [number, number, number],
      },
      {
        title: 'ORDER TODAY (4M LEAD) / IN-TRANSIT POs',
        value: `Order Today: ${formatDecimal(totals.orderTodayQty ?? rows.reduce((s, r) => s + Number(r.orderTodayQty || 0), 0), 0)} GRS`,
        sub: `Net Deficit: ${formatDecimal(totals.netDeficitRequired, 0)}  |  Open PO: ${formatDecimal(totals.openPoPendingQty, 0)} GRS`,
        bg: [239, 246, 255] as [number, number, number],
        border: [147, 197, 253] as [number, number, number],
        accent: [37, 99, 235] as [number, number, number],
        valColor:
          (totals.orderTodayQty ?? rows.reduce((s, r) => s + Number(r.orderTodayQty || 0), 0)) > 0
            ? ([185, 28, 28] as [number, number, number])
            : ([29, 78, 216] as [number, number, number]),
      },
    ];

    kpiCards.forEach((card, idx) => {
      const x = margin + idx * (kpiW + gap);
      doc.setFillColor(...card.bg);
      doc.setDrawColor(...card.border);
      doc.setLineWidth(0.25);
      doc.roundedRect(x, kpiY, kpiW, kpiH, 1.5, 1.5, 'FD');

      doc.setFillColor(...card.accent);
      doc.rect(x, kpiY, 1.4, kpiH, 'F');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6.5);
      doc.setTextColor(71, 85, 105);
      doc.text(card.title, x + 3.5, kpiY + 4.3);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.2);
      doc.setTextColor(...card.valColor);
      doc.text(card.value, x + 3.5, kpiY + 9.8);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.4);
      doc.setTextColor(100, 116, 139);
      doc.text(card.sub, x + 3.5, kpiY + 13.8);
    });

    // Section Title: Reconciled Demand & Stock Balance Table
    let cursorY = kpiY + kpiH + 5.5;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(15, 23, 42);
    doc.text('1. NIPPLE DEMAND, STOCK BALANCE & IMPORT REPLENISHMENT SUMMARY (ALL IN GRS)', margin, cursorY);

    const summaryHead = [[
      '#',
      'SKU',
      'Nipple Product',
      'Total\nOrder',
      'Disp.',
      'Pending\nOrder',
      'Packed\n(w/ Nipple)',
      'No-Nipple\nFGR',
      'Balance\nto Pack',
      'Unpacked\nWH-002',
      'Packable\nNow',
      'Deficit /\nSurplus',
      'Mo. Usage\n(Auto/Man)',
      'Lead+\nBuf',
      'Covg\n(Mo)',
      'Stockout\nDate',
      'Open\nPOs',
      'Order\nToday',
      'Status',
    ]];

    const totalOrderToday = Number(
      totals.orderTodayQty ?? rows.reduce((s, r) => s + Number(r.orderTodayQty || 0), 0),
    );
    const totalEffUsage = Number(
      totals.effectiveMonthlyUsage ?? rows.reduce((s, r) => s + Number(r.effectiveMonthlyUsage || 0), 0),
    );

    const summaryBody = rows.map((r: any, idx: number) => {
      const remToPack = Number(r.remainingToPack ?? r.netPendingDemand ?? 0);
      const unpacked = Number(r.currentUnpackedNippleStock ?? r.currentFgStock ?? r.fgStock ?? 0);
      const packable = Number(r.packableFromStockGrs ?? Math.min(unpacked, remToPack));
      const deficit = Number(r.netDeficitRequired || 0);
      const surplus = Number(r.stockSurplus || 0);
      const netPosLabel =
        deficit > 0 ? `-${formatDecimal(deficit, 0)} Deficit` : `+${formatDecimal(surplus, 0)} Surplus`;
      const effUsage = Number(r.effectiveMonthlyUsage ?? r.monthlyAvgConsumption ?? 0);
      const usageTag = r.usageSource === 'MANUAL' ? 'Man' : 'Auto';
      const leadM = Number(r.importLeadTimeMonths ?? 4);
      const bufM = Number(r.safetyBufferMonths ?? 1);
      const cov = Number(r.coverageMonths ?? 999);
      const stockoutStr = r.projectedStockoutDate ? dayjs(r.projectedStockoutDate).format('DD MMM YY') : '—';
      const orderToday = Number(r.orderTodayQty || 0);

      return [
        idx + 1,
        r.itemCode || '—',
        r.itemName || '—',
        formatDecimal(r.totalDemand || 0, 0),
        formatDecimal(r.totalDispatched || 0, 0),
        formatDecimal(r.netPendingOrder || 0, 0),
        formatDecimal(r.packedWithNipplesFgr ?? r.packedInCartonsFgr ?? 0, 0),
        formatDecimal(r.withoutNippleCartonsFgr || 0, 0),
        formatDecimal(remToPack, 0),
        formatDecimal(unpacked, 0),
        formatDecimal(packable, 0),
        netPosLabel,
        `${formatDecimal(effUsage, 0)} (${usageTag})`,
        `${leadM}+${bufM}M`,
        cov >= 999 ? '999M' : `${cov.toFixed(1)}M`,
        stockoutStr,
        formatDecimal(r.openPoPendingQty || 0, 0),
        formatDecimal(orderToday, 0),
        getStatusText(r, isInventoryMode),
      ];
    });

    const summaryFoot = [[
      '',
      'TOTAL',
      `All ${rows.length} Nipple Items`,
      formatDecimal(totals.totalDemand || 0, 0),
      formatDecimal(totals.totalDispatched || 0, 0),
      formatDecimal(totals.netPendingOrder || 0, 0),
      formatDecimal(totals.packedFgr || 0, 0),
      formatDecimal(totals.withoutNippleCartonsFgr || 0, 0),
      formatDecimal(totals.remainingToPack || 0, 0),
      formatDecimal(totals.currentFg || 0, 0),
      formatDecimal(totals.packableFromStockGrs || 0, 0),
      totals.netDeficitRequired > 0
        ? `-${formatDecimal(totals.netDeficitRequired, 0)} Deficit`
        : `+${formatDecimal(totals.stockSurplus || 0, 0)} Surplus`,
      formatDecimal(totalEffUsage, 0),
      '',
      '',
      '',
      formatDecimal(totals.openPoPendingQty || 0, 0),
      formatDecimal(totalOrderToday, 0),
      '',
    ]];

    autoTable(doc, {
      head: summaryHead,
      body: summaryBody,
      foot: summaryFoot,
      startY: cursorY + 2,
      rowPageBreak: 'avoid',
      margin: { left: margin, right: margin, bottom: 12 },
      styles: {
        fontSize: 6.7,
        cellPadding: { top: 1.8, bottom: 1.8, left: 1.2, right: 1.2 },
        lineColor: [203, 213, 225],
        lineWidth: 0.15,
        valign: 'middle',
        textColor: [15, 23, 42],
      },
      headStyles: {
        fillColor: [15, 23, 42],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 6.3,
        halign: 'right',
        valign: 'middle',
      },
      footStyles: {
        fillColor: [241, 245, 249],
        textColor: [15, 23, 42],
        fontStyle: 'bold',
        fontSize: 6.7,
        halign: 'right',
        lineWidth: 0.25,
        lineColor: [15, 23, 42],
      },
      alternateRowStyles: {
        fillColor: [248, 250, 252],
      },
      columnStyles: {
        0: { cellWidth: 6, halign: 'center' },
        1: { cellWidth: 15, halign: 'left', fontStyle: 'bold', textColor: [3, 105, 161] },
        2: { cellWidth: 28, halign: 'left', fontStyle: 'bold' },
        3: { cellWidth: 13, halign: 'right' },
        4: { cellWidth: 12, halign: 'right' },
        5: { cellWidth: 13, halign: 'right', fontStyle: 'bold' },
        6: { cellWidth: 13.5, halign: 'right', textColor: [8, 145, 178], fontStyle: 'bold' },
        7: { cellWidth: 12, halign: 'right', textColor: [180, 83, 9] },
        8: { cellWidth: 13, halign: 'right', fontStyle: 'bold', textColor: [185, 28, 28] },
        9: { cellWidth: 13.5, halign: 'right', fontStyle: 'bold', textColor: [21, 128, 61] },
        10: { cellWidth: 12.5, halign: 'right' },
        11: { cellWidth: 19, halign: 'center', fontStyle: 'bold' },
        12: { cellWidth: 14.5, halign: 'right' },
        13: { cellWidth: 10, halign: 'center' },
        14: { cellWidth: 10, halign: 'center', fontStyle: 'bold' },
        15: { cellWidth: 15, halign: 'center' },
        16: { cellWidth: 12, halign: 'right', textColor: [29, 78, 216] },
        17: { cellWidth: 16, halign: 'right', fontStyle: 'bold' },
        18: { cellWidth: 23, halign: 'center', fontStyle: 'bold' },
      },
      didParseCell: (data) => {
        if (
          data.section === 'head' &&
          [0, 1, 2, 11, 13, 14, 15, 18].includes(data.column.index)
        ) {
          data.cell.styles.halign = data.column.index <= 2 ? 'left' : 'center';
        }
        if (data.section === 'foot' && data.column.index <= 2) {
          data.cell.styles.halign = 'left';
        }
        if (data.section === 'body') {
          const r = rows[data.row.index];
          const isDeficit = Number(r?.netDeficitRequired || 0) > 0;
          const cov = Number(r?.coverageMonths ?? 999);
          const leadM = Number(r?.importLeadTimeMonths ?? 4);
          const orderToday = Number(r?.orderTodayQty || 0);
          if (data.column.index === 11) {
            data.cell.styles.fillColor = isDeficit ? [254, 242, 242] : [240, 253, 244];
            data.cell.styles.textColor = isDeficit ? [153, 27, 27] : [22, 101, 52];
          }
          if (data.column.index === 14) {
            const isRisk = cov < leadM;
            data.cell.styles.fillColor = isRisk ? [254, 226, 226] : [220, 252, 231];
            data.cell.styles.textColor = isRisk ? [153, 27, 27] : [22, 101, 52];
          }
          if (data.column.index === 17) {
            data.cell.styles.fillColor = orderToday > 0 ? [254, 226, 226] : [220, 252, 231];
            data.cell.styles.textColor = orderToday > 0 ? [153, 27, 27] : [22, 101, 52];
          }
          if (data.column.index === 18) {
            const st = String(r?.importStatus || '');
            if (st === 'STOCK_SUFFICIENT' || !isDeficit) {
              data.cell.styles.fillColor = [220, 252, 231];
              data.cell.styles.textColor = [22, 101, 52];
            } else if (st === 'PO_COVERED') {
              data.cell.styles.fillColor = [219, 234, 254];
              data.cell.styles.textColor = [30, 64, 175];
            } else if (st === 'PARTIAL_PO_PLACED') {
              data.cell.styles.fillColor = [254, 243, 199];
              data.cell.styles.textColor = [146, 64, 14];
            } else {
              data.cell.styles.fillColor = [254, 226, 226];
              data.cell.styles.textColor = [153, 27, 27];
            }
          }
        }
      },
    });

    cursorY = (doc as any).lastAutoTable.finalY + 7;

    // Optional Time-Phased Shipment Projection Matrix (when in matrix mode or when shipments exist)
    if (viewMode === 'matrix' && timePhasedPlan.matrixRows.length > 0) {
      if (cursorY > pageHeight - 60) {
        doc.addPage();
        drawHeaderBanner();
        cursorY = 24;
      }

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.5);
      doc.setTextColor(15, 23, 42);
      doc.text(
        `2. TIME-PHASED IMPORT SHIPMENT PROJECTION MATRIX (${safetyMonths}M SAFETY · HORIZON ${horizonIso})`,
        margin,
        cursorY,
      );

      const milestones = timePhasedPlan.shipmentMilestones || [];
      const msHeaders = milestones.flatMap((ms: any, idx: number) => [
        `S#${idx + 1} ${ms.poNumber}\nBefore`,
        `S#${idx + 1} (${ms.etaDate})\nShip (+)`,
        `S#${idx + 1}\nBurn (-)`,
        `S#${idx + 1}\nAfter`,
      ]);

      const matrixHead = [[
        '#',
        'SKU',
        'Product (Nipple)',
        'Last 3M',
        'Mo. Avg',
        `${safetyMonths}M Safety`,
        'Stock\nin Hand',
        ...msHeaders,
        'Ending\nStock',
        'Safe\n(Mo)',
        'Rec.\nOrder',
      ]];

      const matrixBody = timePhasedPlan.matrixRows.map((r: any) => {
        const msVals = milestones.flatMap((ms: any) => {
          const p = r.milestoneProjections?.[ms.poId || ms.poNumber] || {};
          return [
            formatDecimal(p.stockBeforeShipment ?? r.stockInHand ?? 0, 0),
            `+${formatDecimal(p.shipmentQtyGrs || 0, 0)}`,
            `-${formatDecimal(p.materialConsumedTillEta || 0, 0)}`,
            formatDecimal(p.stockAfterShipment ?? r.stockInHand ?? 0, 0),
          ];
        });
        return [
          r.sNo,
          r.itemCode,
          r.itemName,
          formatDecimal(r.last3MonthSales || 0, 0),
          formatDecimal(r.monthlyAverage || 0, 0),
          formatDecimal(r.forecastSafetyStock || 0, 0),
          formatDecimal(r.stockInHand || 0, 0),
          ...msVals,
          formatDecimal(r.endingProjectedStock || 0, 0),
          Number(r.safeInMonths || 0) >= 99 ? '99+' : Number(r.safeInMonths || 0).toFixed(1),
          formatDecimal(r.matrixRecommendedOrderQty || 0, 0),
        ];
      });

      autoTable(doc, {
        head: matrixHead,
        body: matrixBody,
        startY: cursorY + 2,
        margin: { left: margin, right: margin, bottom: 12 },
        styles: {
          fontSize: 6.5,
          cellPadding: { top: 1.8, bottom: 1.8, left: 1.3, right: 1.3 },
          lineColor: [203, 213, 225],
          lineWidth: 0.15,
          halign: 'right',
          valign: 'middle',
        },
        headStyles: {
          fillColor: [30, 58, 138],
          textColor: [255, 255, 255],
          fontStyle: 'bold',
          fontSize: 6.2,
          halign: 'right',
        },
        alternateRowStyles: {
          fillColor: [248, 250, 252],
        },
        columnStyles: {
          0: { halign: 'center', cellWidth: 6 },
          1: { halign: 'left', fontStyle: 'bold', textColor: [3, 105, 161] },
          2: { halign: 'left', fontStyle: 'bold' },
        },
      });
    }

    // Page 2: Linked Spoke Sets Breakdown & Open Import POs + Signature Block
    doc.addPage();
    drawHeaderBanner();
    let p2Y = 23.5;

    const spokeList = buildSpokeDetailsList(rows);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(15, 23, 42);
    doc.text('LINKED SPOKE SETS ORDER & PACKING BREAKDOWN (ALL IN GRS)', margin, p2Y);

    autoTable(doc, {
      head: [[
        '#',
        'Nipple SKU',
        'Nipple Product',
        'Spoke Set Name',
        'Total Order',
        'Dispatched',
        'Pending Order',
        'Packed (w/ Nipple)',
        'Without Nipple FGR',
        'Balance to Pack',
        '% Packed',
      ]],
      body:
        spokeList.length > 0
          ? spokeList.map((s, idx) => [
              idx + 1,
              s.itemCode,
              s.itemName,
              s.spokeName,
              formatDecimal(s.ord, 0),
              formatDecimal(s.disp, 0),
              formatDecimal(s.pendOrder, 0),
              formatDecimal(s.packed, 0),
              formatDecimal(s.withoutNipple, 0),
              formatDecimal(s.balToPack, 0),
              `${s.pctPacked}%`,
            ])
          : [['—', '—', 'No linked spoke sets found', '—', '0', '0', '0', '0', '0', '0', '0%']],
      foot: [[
        '',
        'TOTAL',
        `${spokeList.length} Spoke Lines`,
        '',
        formatDecimal(spokeList.reduce((sum, s) => sum + s.ord, 0), 0),
        formatDecimal(spokeList.reduce((sum, s) => sum + s.disp, 0), 0),
        formatDecimal(spokeList.reduce((sum, s) => sum + s.pendOrder, 0), 0),
        formatDecimal(spokeList.reduce((sum, s) => sum + s.packed, 0), 0),
        formatDecimal(spokeList.reduce((sum, s) => sum + s.withoutNipple, 0), 0),
        formatDecimal(spokeList.reduce((sum, s) => sum + s.balToPack, 0), 0),
        '',
      ]],
      startY: p2Y + 2,
      margin: { left: margin, right: margin, bottom: 12 },
      styles: {
        fontSize: 7.2,
        cellPadding: { top: 1.8, bottom: 1.8, left: 2, right: 2 },
        lineColor: [203, 213, 225],
        lineWidth: 0.15,
        halign: 'right',
        valign: 'middle',
      },
      headStyles: {
        fillColor: [15, 23, 42],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 7,
      },
      footStyles: {
        fillColor: [241, 245, 249],
        textColor: [15, 23, 42],
        fontStyle: 'bold',
        lineColor: [15, 23, 42],
        lineWidth: 0.25,
      },
      alternateRowStyles: {
        fillColor: [248, 250, 252],
      },
      columnStyles: {
        0: { halign: 'center', cellWidth: 8 },
        1: { halign: 'left', cellWidth: 22, fontStyle: 'bold', textColor: [3, 105, 161] },
        2: { halign: 'left', cellWidth: 44, fontStyle: 'bold' },
        3: { halign: 'left', cellWidth: 55 },
        8: { textColor: [180, 83, 9] },
        9: { fontStyle: 'bold', textColor: [185, 28, 28] },
        10: { halign: 'center', cellWidth: 16, fontStyle: 'bold' },
      },
    });

    p2Y = (doc as any).lastAutoTable.finalY + 7;
    if (p2Y > pageHeight - 52) {
      doc.addPage();
      drawHeaderBanner();
      p2Y = 23.5;
    }

    const poList = buildOpenPoDetailsList(rows, timePhasedPlan.shipmentMilestones);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(15, 23, 42);
    doc.text('OPEN IMPORT PURCHASE ORDERS (IN-TRANSIT PIPELINE)', margin, p2Y);

    autoTable(doc, {
      head: [[
        '#',
        'Nipple SKU',
        'Nipple Product',
        'PO Number',
        'Vendor / Supplier',
        'Origin',
        'Stage',
        'File # / LC',
        'ETA Date',
        'Ordered (GRS)',
        'Received (GRS)',
        'Open In-Transit',
      ]],
      body:
        poList.length > 0
          ? poList.map((p, idx) => [
              idx + 1,
              p.itemCode,
              p.itemName,
              p.poCode,
              p.supplierName,
              p.origin,
              p.stage,
              p.fileNumber,
              p.etaDate,
              formatDecimal(p.ordered, 0),
              formatDecimal(p.received, 0),
              formatDecimal(p.openQty, 0),
            ])
          : [['—', '—', 'No open or in-transit purchase orders', '—', '—', '—', '—', '—', '—', '0', '0', '0']],
      foot: [[
        '',
        'TOTAL',
        `${poList.length} Open PO Line(s)`,
        '',
        '',
        '',
        '',
        '',
        '',
        formatDecimal(poList.reduce((sum, p) => sum + p.ordered, 0), 0),
        formatDecimal(poList.reduce((sum, p) => sum + p.received, 0), 0),
        formatDecimal(poList.reduce((sum, p) => sum + p.openQty, 0), 0),
      ]],
      startY: p2Y + 2,
      margin: { left: margin, right: margin, bottom: 24 },
      styles: {
        fontSize: 7.2,
        cellPadding: { top: 1.8, bottom: 1.8, left: 2, right: 2 },
        lineColor: [203, 213, 225],
        lineWidth: 0.15,
        halign: 'right',
        valign: 'middle',
      },
      headStyles: {
        fillColor: [30, 58, 138],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 7,
      },
      footStyles: {
        fillColor: [239, 246, 255],
        textColor: [15, 23, 42],
        fontStyle: 'bold',
        lineColor: [30, 58, 138],
        lineWidth: 0.25,
      },
      alternateRowStyles: {
        fillColor: [248, 250, 252],
      },
      columnStyles: {
        0: { halign: 'center', cellWidth: 8 },
        1: { halign: 'left', cellWidth: 21, fontStyle: 'bold', textColor: [3, 105, 161] },
        2: { halign: 'left', cellWidth: 38, fontStyle: 'bold' },
        3: { halign: 'left', cellWidth: 24, fontStyle: 'bold' },
        4: { halign: 'left', cellWidth: 46 },
        5: { halign: 'center', cellWidth: 16 },
        6: { halign: 'center', cellWidth: 26 },
        7: { halign: 'center', cellWidth: 20 },
        8: { halign: 'center', cellWidth: 20 },
        11: { fontStyle: 'bold', textColor: [29, 78, 216] },
      },
    });

    // Optional Remarks / Notes box (supports English + Urdu)
    let cursorAfterTableY = (doc as any).lastAutoTable.finalY + 8;
    if (remarks && remarks.trim()) {
      const remarksImg = renderRemarksToPng(remarks);
      if (remarksImg) {
        if (cursorAfterTableY + remarksImg.heightMm + 22 > pageHeight - 12) {
          doc.addPage();
          drawHeaderBanner();
          cursorAfterTableY = 24;
        }
        doc.addImage(remarksImg.dataUrl, 'PNG', margin, cursorAfterTableY, remarksImg.widthMm, remarksImg.heightMm);
        cursorAfterTableY += remarksImg.heightMm + 10;
      }
    }

    // Signature block at bottom of last page
    let sigY = cursorAfterTableY + 8;
    if (sigY > pageHeight - 22) {
      doc.addPage();
      drawHeaderBanner();
      sigY = 38;
    }

    const sigLabels = [
      'Prepared By (MRP / Planning)',
      'Store / Inventory Manager',
      'Approved By (GM / Operations)',
    ];
    const sigW = (pageWidth - margin * 2 - 40) / 3;
    sigLabels.forEach((label, i) => {
      const x1 = margin + 5 + i * (sigW + 15);
      const x2 = x1 + sigW;
      doc.setDrawColor(100, 116, 139);
      doc.setLineWidth(0.35);
      doc.line(x1, sigY, x2, sigY);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      doc.setTextColor(51, 65, 85);
      doc.text(label, (x1 + x2) / 2, sigY + 4.2, { align: 'center' });
    });

    // Global Page Numbering & Footer on every page
    const totalPages = (doc as any).internal.getNumberOfPages();
    for (let pageNo = 1; pageNo <= totalPages; pageNo++) {
      doc.setPage(pageNo);
      doc.setDrawColor(226, 232, 240);
      doc.setLineWidth(0.2);
      doc.line(margin, pageHeight - 9, pageWidth - margin, pageHeight - 9);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(100, 116, 139);
      doc.text(
        'Pakistan Wire Industries (Pvt.) Ltd. — Enterprise ERP & MRP System  |  Unit: GRS (1 GRS = 144 PCS)',
        margin,
        pageHeight - 5,
      );
      doc.setFont('helvetica', 'bold');
      doc.text(`Page ${pageNo} of ${totalPages}`, pageWidth - margin, pageHeight - 5, {
        align: 'right',
      });
    }

    doc.save(`Nipple_MRP_Report_${dayjs().format('YYYY-MM-DD')}.pdf`);
    message.success('Executive PDF report downloaded');
  } catch (err: any) {
    console.error('Failed to export Nipple MRP PDF:', err);
    message.error(err?.message || 'Failed to generate PDF report');
  }
}

// ============================================================================
// 2. MULTI-SHEET FORMATTED EXCEL WORKBOOK (.xlsx) WITH DYNAMIC SUM FORMULAS
// ============================================================================
interface XlsxCell {
  value: string | number;
  formula?: string;
  style?: number; // xf style index
}

function escapeXml(str: any): string {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function colIndexToLetter(colIndex0: number): string {
  let n = colIndex0 + 1;
  let s = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

// CRC32 + Stored ZIP Builder (zero external dependency, produces standard .xlsx OOXML archive)
const CRC_TABLE = (() => {
  const tbl = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    tbl[n] = c >>> 0;
  }
  return tbl;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function buildZipBlob(files: { name: string; content: string | Uint8Array }[]): Blob {
  const encoder = new TextEncoder();
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;

  files.forEach((file) => {
    const nameBytes = encoder.encode(file.name);
    const dataBytes = typeof file.content === 'string' ? encoder.encode(file.content) : file.content;
    const crc = crc32(dataBytes);
    const size = dataBytes.length;

    const localHeader = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(localHeader.buffer);
    lv.setUint32(0, 0x04034b50, true); // Local file header signature
    lv.setUint16(4, 20, true); // Version needed
    lv.setUint16(6, 0x0800, true); // UTF-8 filename flag
    lv.setUint16(8, 0, true); // Compression method 0 (STORE)
    lv.setUint16(10, 0, true);
    lv.setUint16(12, 0, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, size, true);
    lv.setUint32(22, size, true);
    lv.setUint16(26, nameBytes.length, true);
    lv.setUint16(28, 0, true);
    localHeader.set(nameBytes, 30);

    localParts.push(localHeader, dataBytes);

    const centralHeader = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(centralHeader.buffer);
    cv.setUint32(0, 0x02014b50, true); // Central directory signature
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0x0800, true);
    cv.setUint16(10, 0, true);
    cv.setUint16(12, 0, true);
    cv.setUint16(14, 0, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, size, true);
    cv.setUint32(24, size, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint16(30, 0, true);
    cv.setUint16(32, 0, true);
    cv.setUint16(34, 0, true);
    cv.setUint16(36, 0, true);
    cv.setUint32(38, 0, true);
    cv.setUint32(42, offset, true);
    centralHeader.set(nameBytes, 46);

    centralParts.push(centralHeader);
    offset += localHeader.length + dataBytes.length;
  });

  const centralSize = centralParts.reduce((s, p) => s + p.length, 0);
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(4, 0, true);
  ev.setUint16(6, 0, true);
  ev.setUint16(8, files.length, true);
  ev.setUint16(10, files.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);
  ev.setUint16(20, 0, true);

  const blobParts: BlobPart[] = [
    ...localParts.map((u) => new Uint8Array(u)),
    ...centralParts.map((u) => new Uint8Array(u)),
    new Uint8Array(eocd),
  ];

  return new Blob(blobParts, {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

// Style indices in xl/styles.xml:
// 0: Normal Left
// 1: Company Title Banner (Navy bg, white bold 13pt)
// 2: Subtitle / Meta (Slate light bg, bold 9.5pt)
// 3: Table Header Dark (Navy bg, white bold, wrapped, center)
// 4: Data Text Left (Thin border)
// 5: Data Integer (#,##0, right aligned, thin border)
// 6: Data Deficit (#,##0, soft red bg, dark red bold, thin border)
// 7: Data Surplus / Good (#,##0, soft green bg, dark green bold, thin border)
// 8: Totals Label (Slate-100 bg, bold, top/bottom border)
// 9: Totals Integer (#,##0, Slate-100 bg, bold, top/bottom border)
// 10: Section Subheader (Blue-900 bg, white bold)
// 11: KPI Label (Light gray bg, bold)
// 12: KPI Value Integer (#,##0, Light blue bg, bold)
// 13: Decimal (0.00, right aligned, thin border)
function buildStylesXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <numFmts count="2">
    <numFmt numFmtId="164" formatCode="#,##0"/>
    <numFmt numFmtId="165" formatCode="0.00"/>
  </numFmts>
  <fonts count="7">
    <font><sz val="10"/><name val="Calibri"/><color rgb="FF0F172A"/></font>
    <font><b/><sz val="13"/><name val="Calibri"/><color rgb="FFFFFFFF"/></font>
    <font><b/><sz val="10"/><name val="Calibri"/><color rgb="FF1E293B"/></font>
    <font><b/><sz val="10"/><name val="Calibri"/><color rgb="FFFFFFFF"/></font>
    <font><b/><sz val="10"/><name val="Calibri"/><color rgb="FF991B1B"/></font>
    <font><b/><sz val="10"/><name val="Calibri"/><color rgb="FF166534"/></font>
    <font><b/><sz val="10"/><name val="Calibri"/><color rgb="FF0F172A"/></font>
  </fonts>
  <fills count="9">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF0F172A"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFF1F5F9"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF1E3A8A"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFFEE2E2"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFDCFCE7"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFE2E8F0"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFEFF6FF"/></patternFill></fill>
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
      <left style="thin"><color rgb="FF0F172A"/></left>
      <right style="thin"><color rgb="FF0F172A"/></right>
      <top style="medium"><color rgb="FF0F172A"/></top>
      <bottom style="double"><color rgb="FF0F172A"/></bottom>
      <diagonal/>
    </border>
  </borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="14">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center" horizontal="left"/></xf>
    <xf numFmtId="0" fontId="2" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" horizontal="left"/></xf>
    <xf numFmtId="0" fontId="3" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" horizontal="center" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" horizontal="left"/></xf>
    <xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" horizontal="right"/></xf>
    <xf numFmtId="164" fontId="4" fillId="5" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" horizontal="right"/></xf>
    <xf numFmtId="164" fontId="5" fillId="6" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" horizontal="right"/></xf>
    <xf numFmtId="0" fontId="6" fillId="7" borderId="2" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" horizontal="left"/></xf>
    <xf numFmtId="164" fontId="6" fillId="7" borderId="2" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" horizontal="right"/></xf>
    <xf numFmtId="0" fontId="3" fillId="4" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" horizontal="left"/></xf>
    <xf numFmtId="0" fontId="2" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" horizontal="left"/></xf>
    <xf numFmtId="164" fontId="6" fillId="8" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" horizontal="right"/></xf>
    <xf numFmtId="165" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" horizontal="right"/></xf>
  </cellXfs>
</styleSheet>`;
}

interface SheetSpec {
  name: string;
  rows: XlsxCell[][];
  colWidths: number[];
  freezeRow?: number;
  merges?: string[];
  hasDrawing?: boolean;
}

function buildWorksheetXml(sheet: SheetSpec): string {
  const freezeXml =
    sheet.freezeRow && sheet.freezeRow > 0
      ? `<sheetViews><sheetView workbookViewId="0"><pane ySplit="${sheet.freezeRow}" topLeftCell="A${sheet.freezeRow + 1}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>`
      : '<sheetViews><sheetView workbookViewId="0"/></sheetViews>';

  const colsXml =
    sheet.colWidths.length > 0
      ? `<cols>${sheet.colWidths
          .map(
            (w, idx) =>
              `<col min="${idx + 1}" max="${idx + 1}" width="${Math.max(10, Math.min(48, w))}" customWidth="1"/>`,
          )
          .join('')}</cols>`
      : '';

  const rowsXml = sheet.rows
    .map((row, rIdx) => {
      const rNum = rIdx + 1;
      const ht = rIdx === 0 ? (sheet.hasDrawing ? 32 : 24) : row.some((c) => c.style === 3) ? 28 : 19;
      const cellsXml = row
        .map((cell, cIdx) => {
          const ref = `${colIndexToLetter(cIdx)}${rNum}`;
          const sAttr = cell.style !== undefined ? ` s="${cell.style}"` : '';
          if (cell.formula) {
            const fallbackVal = typeof cell.value === 'number' ? `<v>${cell.value}</v>` : '<v>0</v>';
            return `<c r="${ref}"${sAttr}><f>${escapeXml(cell.formula)}</f>${fallbackVal}</c>`;
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
    sheet.merges && sheet.merges.length > 0
      ? `<mergeCells count="${sheet.merges.length}">${sheet.merges
          .map((m) => `<mergeCell ref="${m}"/>`)
          .join('')}</mergeCells>`
      : '';

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  ${freezeXml}
  ${colsXml}
  <sheetData>${rowsXml}</sheetData>
  ${mergesXml}
  <pageSetup orientation="landscape" paperSize="9"/>
  ${sheet.hasDrawing ? '<drawing r:id="rId1"/>' : ''}
</worksheet>`;
}

export async function exportNippleMrpExcel(options: NippleMrpExportOptions): Promise<void> {
  const { rows, totals, timePhasedPlan, safetyMonths, horizonIso, isInventoryMode, remarks } = options;

  try {
    const logoAssets = await loadLogoAssets();
    const nowStr = dayjs().format('DD-MMM-YYYY HH:mm');
    const dateTag = dayjs().format('YYYY-MM-DD');

    // ---------------- SHEET 1: Nipple Demand & Stock ----------------
    const s1Headers = [
      'SKU',
      'Nipple Product',
      'Linked Spoke Sets',
      'Total Order (GRS)',
      'Dispatched (GRS)',
      'Pending Order (GRS)',
      'Packed w/ Nipple (GRS)',
      'Without Nipple Stock (GRS)',
      'Balance to Pack (GRS)',
      'Unpacked Stock WH-002 (GRS)',
      'Packable Now (GRS)',
      'Net Deficit (GRS)',
      'Stock Surplus (GRS)',
      'Mo. Usage (GRS/mo)',
      'Usage Mode',
      'Lead + Buffer (Mo)',
      'Coverage (Mo)',
      'Projected Stockout',
      'Open PO Balance (GRS)',
      'Order Today (GRS)',
      'Status',
    ];
    const s1LastCol = colIndexToLetter(s1Headers.length - 1);

    const s1DataRows: XlsxCell[][] = rows.map((r: any) => {
      const remToPack = Math.round(Number(r.remainingToPack ?? r.netPendingDemand ?? 0));
      const unpacked = Math.round(Number(r.currentUnpackedNippleStock ?? r.currentFgStock ?? r.fgStock ?? 0));
      const packable = Math.round(Number(r.packableFromStockGrs ?? Math.min(unpacked, remToPack)));
      const deficit = Math.round(Number(r.netDeficitRequired || 0));
      const surplus = Math.round(Number(r.stockSurplus || 0));
      const effUsage = Math.round(Number(r.effectiveMonthlyUsage ?? r.monthlyAvgConsumption ?? 0));
      const leadM = Number(r.importLeadTimeMonths ?? 4);
      const bufM = Number(r.safetyBufferMonths ?? 1);
      const cov = Number(r.coverageMonths ?? 999);
      const orderToday = Math.round(Number(r.orderTodayQty || 0));
      return [
        { value: r.itemCode || '', style: 4 },
        { value: r.itemName || '', style: 4 },
        { value: Array.isArray(r.linkedSpokeSets) ? r.linkedSpokeSets.length : 0, style: 5 },
        { value: Math.round(Number(r.totalDemand || 0)), style: 5 },
        { value: Math.round(Number(r.totalDispatched || 0)), style: 5 },
        { value: Math.round(Number(r.netPendingOrder || 0)), style: 5 },
        { value: Math.round(Number(r.packedWithNipplesFgr ?? r.packedInCartonsFgr ?? 0)), style: 7 },
        { value: Math.round(Number(r.withoutNippleCartonsFgr || 0)), style: 5 },
        { value: remToPack, style: remToPack > 0 ? 6 : 7 },
        { value: unpacked, style: 7 },
        { value: packable, style: 5 },
        { value: deficit, style: deficit > 0 ? 6 : 5 },
        { value: surplus, style: surplus > 0 ? 7 : 5 },
        { value: effUsage, style: 5 },
        { value: r.usageSource === 'MANUAL' ? 'Manual' : 'Auto (3M)', style: 4 },
        { value: `${leadM}M + ${bufM}M`, style: 4 },
        { value: cov >= 999 ? '999M' : `${cov.toFixed(1)}M`, style: cov < leadM ? 6 : 7 },
        { value: r.projectedStockoutDate || '—', style: 4 },
        { value: Math.round(Number(r.openPoPendingQty || 0)), style: 5 },
        { value: orderToday, style: orderToday > 0 ? 6 : 7 },
        { value: getStatusText(r, isInventoryMode), style: 4 },
      ];
    });

    const totalOrderTodayXlsx = Math.round(
      Number(totals.orderTodayQty ?? rows.reduce((s, r) => s + Number(r.orderTodayQty || 0), 0)),
    );
    const totalEffUsageXlsx = Math.round(
      Number(totals.effectiveMonthlyUsage ?? rows.reduce((s, r) => s + Number(r.effectiveMonthlyUsage || 0), 0)),
    );

    const s1StartRow = 7; // Row 6 is header, Row 7.. is data
    const s1EndRow = s1StartRow + Math.max(0, s1DataRows.length - 1);
    const s1TotalRow: XlsxCell[] = s1Headers.map((_, cIdx) => {
      if (cIdx === 0) return { value: 'TOTAL', style: 8 };
      if (cIdx === 1) return { value: `All ${rows.length} Nipple Items`, style: 8 };
      if ([14, 15, 16, 17, 20].includes(cIdx)) return { value: '', style: 8 };
      const colLtr = colIndexToLetter(cIdx);
      const sumCols: Record<number, number> = {
        2: rows.reduce((s, r) => s + (Array.isArray(r.linkedSpokeSets) ? r.linkedSpokeSets.length : 0), 0),
        3: Math.round(totals.totalDemand || 0),
        4: Math.round(totals.totalDispatched || 0),
        5: Math.round(totals.netPendingOrder || 0),
        6: Math.round(totals.packedFgr || 0),
        7: Math.round(totals.withoutNippleCartonsFgr || 0),
        8: Math.round(totals.remainingToPack || 0),
        9: Math.round(totals.currentFg || 0),
        10: Math.round(totals.packableFromStockGrs || 0),
        11: Math.round(totals.netDeficitRequired || 0),
        12: Math.round(totals.stockSurplus || 0),
        13: totalEffUsageXlsx,
        18: Math.round(totals.openPoPendingQty || 0),
        19: totalOrderTodayXlsx,
      };
      return {
        value: sumCols[cIdx] ?? 0,
        formula: s1DataRows.length > 0 ? `SUM(${colLtr}${s1StartRow}:${colLtr}${s1EndRow})` : undefined,
        style: 9,
      };
    });

    const sheet1Rows: XlsxCell[][] = [
      [{ value: '        PAKISTAN WIRE INDUSTRIES (PVT.) LTD. — NIPPLE DEMAND, STOCK BALANCE & IMPORT MRP REPORT', style: 1 }],
      [{ value: `        Generated: ${nowStr}   |   Unit Standard: All Quantities in GRS (1 GRS = 144 PCS)`, style: 2 }],
      [
        { value: 'KPI: Total Pending Order', style: 11 },
        { value: Math.round(totals.netPendingOrder || 0), style: 12 },
        { value: 'KPI: Remaining to Pack', style: 11 },
        { value: Math.round(totals.remainingToPack || 0), style: 12 },
        { value: 'KPI: Unpacked Stock (WH-002)', style: 11 },
        { value: Math.round(totals.currentFg || 0), style: 12 },
        { value: 'KPI: Net Deficit / In-Transit POs', style: 11 },
        { value: Math.round(totals.netDeficitRequired || 0), style: 12 },
        { value: 'Open PO (GRS)', style: 11 },
        { value: Math.round(totals.openPoPendingQty || 0), style: 12 },
      ],
      [],
      [{ value: '1. NIPPLE DEMAND & STOCK RECONCILIATION SUMMARY', style: 10 }],
      s1Headers.map((h) => ({ value: h, style: 3 })),
      ...s1DataRows,
      s1TotalRow,
    ];

    const s1Merges = [`A1:${s1LastCol}1`, `A2:${s1LastCol}2`, `A5:${s1LastCol}5`];
    if (remarks && remarks.trim()) {
      sheet1Rows.push([]);
      const remTitleRow = sheet1Rows.length + 1;
      sheet1Rows.push([{ value: 'REPORT REMARKS / NOTES:', style: 10 }]);
      s1Merges.push(`A${remTitleRow}:${s1LastCol}${remTitleRow}`);
      const remBodyRow = sheet1Rows.length + 1;
      sheet1Rows.push([{ value: remarks.trim(), style: 4 }]);
      s1Merges.push(`A${remBodyRow}:${s1LastCol}${remBodyRow}`);
    }
    sheet1Rows.push([]);
    sheet1Rows.push([
      { value: 'Prepared By (MRP / Planning): ___________________', style: 4 },
      { value: '', style: 4 },
      { value: '', style: 4 },
      { value: 'Store / Inventory Manager: ___________________', style: 4 },
      { value: '', style: 4 },
      { value: '', style: 4 },
      { value: 'Approved By (GM / Operations): ___________________', style: 4 },
    ]);

    const s1ColWidths = s1Headers.map((h, idx) => {
      const maxData = Math.max(
        h.length,
        ...s1DataRows.map((row) => String(row[idx]?.value ?? '').length),
      );
      return idx === 1 ? Math.max(26, maxData + 3) : Math.max(13, maxData + 3);
    });

    const sheet1: SheetSpec = {
      name: 'Nipple Demand & Stock',
      rows: sheet1Rows,
      colWidths: s1ColWidths,
      freezeRow: 6,
      merges: s1Merges,
      hasDrawing: Boolean(logoAssets?.bytes),
    };

    // ---------------- SHEET 2: Time-Phased Shipment Plan ----------------
    const milestones = timePhasedPlan.shipmentMilestones || [];
    const s2Headers = [
      'S.No',
      'SKU',
      'Product (Nipple)',
      'Last 3M Sales (GRS)',
      'Monthly Avg (GRS)',
      'Daily Burn (GRS/d)',
      `${safetyMonths}M Safety Target (GRS)`,
      'Stock in Hand (GRS)',
      ...milestones.flatMap((ms: any, i: number) => [
        `S#${i + 1} ${ms.poNumber} (${ms.vendorName} | ${ms.fileNumber} | ETA ${ms.etaDate}) Before`,
        `S#${i + 1} ${ms.poNumber} Ship Qty (+)`,
        `S#${i + 1} ${ms.poNumber} Consumed (-)`,
        `S#${i + 1} ${ms.poNumber} Stock After`,
      ]),
      'Ending Projected Stock (GRS)',
      'Safe in Months',
      'Recommended Order to Vendor (GRS)',
    ];
    const s2LastCol = colIndexToLetter(s2Headers.length - 1);

    const s2DataRows: XlsxCell[][] = (timePhasedPlan.matrixRows || []).map((r: any) => {
      const msCells: XlsxCell[] = milestones.flatMap((ms: any) => {
        const p = r.milestoneProjections?.[ms.poId || ms.poNumber] || {};
        const before = Math.round(Number(p.stockBeforeShipment ?? r.stockInHand ?? 0));
        const ship = Math.round(Number(p.shipmentQtyGrs || 0));
        const cons = Math.round(Number(p.materialConsumedTillEta || 0));
        const after = Math.round(Number(p.stockAfterShipment ?? r.stockInHand ?? 0));
        return [
          { value: before, style: before < 0 ? 6 : 5 },
          { value: ship, style: ship > 0 ? 7 : 5 },
          { value: cons, style: 5 },
          { value: after, style: after < 0 ? 6 : 5 },
        ];
      });

      const rec = Math.round(Number(r.matrixRecommendedOrderQty || 0));
      const safeMonths = Number(r.safeInMonths || 0);
      return [
        { value: Number(r.sNo || 0), style: 5 },
        { value: r.itemCode || '', style: 4 },
        { value: r.itemName || '', style: 4 },
        { value: Math.round(Number(r.last3MonthSales || 0)), style: 5 },
        { value: Math.round(Number(r.monthlyAverage || 0)), style: 5 },
        { value: Number(Number(r.dailyConsumptionRate || 0).toFixed(2)), style: 13 },
        { value: Math.round(Number(r.forecastSafetyStock || 0)), style: 5 },
        { value: Math.round(Number(r.stockInHand || 0)), style: 7 },
        ...msCells,
        { value: Math.round(Number(r.endingProjectedStock || 0)), style: Number(r.endingProjectedStock || 0) < 0 ? 6 : 5 },
        { value: Number(safeMonths.toFixed(2)), style: 13 },
        { value: rec, style: rec > 0 ? 7 : 5 },
      ];
    });

    const s2StartRow = 5;
    const s2EndRow = s2StartRow + Math.max(0, s2DataRows.length - 1);
    const s2TotalRow: XlsxCell[] = s2Headers.map((_, cIdx) => {
      if (cIdx === 0) return { value: '', style: 8 };
      if (cIdx === 1) return { value: 'TOTAL', style: 8 };
      if (cIdx === 2) return { value: `All ${s2DataRows.length} Nipple Items`, style: 8 };
      if (cIdx === s2Headers.length - 2) return { value: '', style: 8 }; // Safe in Months not summed
      const colLtr = colIndexToLetter(cIdx);
      const colTotal = s2DataRows.reduce((s, r) => s + Number(r[cIdx]?.value || 0), 0);
      return {
        value: Math.round(colTotal),
        formula: s2DataRows.length > 0 ? `SUM(${colLtr}${s2StartRow}:${colLtr}${s2EndRow})` : undefined,
        style: 9,
      };
    });

    const sheet2Rows: XlsxCell[][] = [
      [{ value: `PAKISTAN WIRE INDUSTRIES (PVT.) LTD. — TIME-PHASED IMPORT SHIPMENT PROJECTION MATRIX (${safetyMonths}M SAFETY TARGET)`, style: 1 }],
      [{ value: `Generated: ${nowStr}   |   Projection Horizon: ${horizonIso}   |   All Quantities in GRS`, style: 2 }],
      [],
      s2Headers.map((h) => ({ value: h, style: 3 })),
      ...s2DataRows,
      s2TotalRow,
    ];

    const s2ColWidths = s2Headers.map((h, idx) => {
      const maxData = Math.max(
        Math.min(h.length, 24),
        ...s2DataRows.map((row) => String(row[idx]?.value ?? '').length),
      );
      return idx === 2 ? Math.max(26, maxData + 3) : Math.max(13, maxData + 3);
    });

    const sheet2: SheetSpec = {
      name: 'Time-Phased Shipment Plan',
      rows: sheet2Rows,
      colWidths: s2ColWidths,
      freezeRow: 4,
      merges: [`A1:${s2LastCol}1`, `A2:${s2LastCol}2`],
    };

    // ---------------- SHEET 3: Spoke Set & Open PO Details ----------------
    const spokeList = buildSpokeDetailsList(rows);
    const poList = buildOpenPoDetailsList(rows, milestones);

    const spokeHeaders = [
      'Nipple SKU',
      'Nipple Product',
      'Spoke Set Name',
      'Total Order (GRS)',
      'Dispatched (GRS)',
      'Pending Order (GRS)',
      'Packed w/ Nipple (GRS)',
      'Without Nipple Stock (GRS)',
      'Balance to Pack (GRS)',
      '% Packed',
    ];
    const spokeDataRows: XlsxCell[][] = spokeList.map((s) => [
      { value: s.itemCode, style: 4 },
      { value: s.itemName, style: 4 },
      { value: s.spokeName, style: 4 },
      { value: Math.round(s.ord), style: 5 },
      { value: Math.round(s.disp), style: 5 },
      { value: Math.round(s.pendOrder), style: 5 },
      { value: Math.round(s.packed), style: 7 },
      { value: Math.round(s.withoutNipple), style: 5 },
      { value: Math.round(s.balToPack), style: s.balToPack > 0 ? 6 : 7 },
      { value: `${s.pctPacked}%`, style: 4 },
    ]);

    const spokeStart = 6;
    const spokeEnd = spokeStart + Math.max(0, spokeDataRows.length - 1);
    const spokeTotalRow: XlsxCell[] = spokeHeaders.map((_, cIdx) => {
      if (cIdx === 0) return { value: 'TOTAL', style: 8 };
      if (cIdx === 1) return { value: `${spokeList.length} Spoke Lines`, style: 8 };
      if (cIdx === 2 || cIdx === 9) return { value: '', style: 8 };
      const colLtr = colIndexToLetter(cIdx);
      const val = spokeDataRows.reduce((s, r) => s + Number(r[cIdx]?.value || 0), 0);
      return {
        value: Math.round(val),
        formula: spokeDataRows.length > 0 ? `SUM(${colLtr}${spokeStart}:${colLtr}${spokeEnd})` : undefined,
        style: 9,
      };
    });

    const poHeaders = [
      'Nipple SKU',
      'Nipple Product',
      'PO Number',
      'Vendor / Supplier',
      'Origin',
      'Import Stage',
      'File # / LC Ref',
      'ETA Date',
      'Ordered (GRS)',
      'Received (GRS)',
      'Open In-Transit (GRS)',
    ];
    const poDataRows: XlsxCell[][] = poList.map((p) => [
      { value: p.itemCode, style: 4 },
      { value: p.itemName, style: 4 },
      { value: p.poCode, style: 4 },
      { value: p.supplierName, style: 4 },
      { value: p.origin, style: 4 },
      { value: p.stage, style: 4 },
      { value: p.fileNumber, style: 4 },
      { value: p.etaDate, style: 4 },
      { value: Math.round(p.ordered), style: 5 },
      { value: Math.round(p.received), style: 7 },
      { value: Math.round(p.openQty), style: 7 },
    ]);

    const poHeaderRowIdx = 6 + spokeDataRows.length + 3; // 1-based row number for PO header
    const poStart = poHeaderRowIdx + 1;
    const poEnd = poStart + Math.max(0, poDataRows.length - 1);
    const poTotalRow: XlsxCell[] = poHeaders.map((_, cIdx) => {
      if (cIdx === 0) return { value: 'TOTAL', style: 8 };
      if (cIdx === 1) return { value: `${poList.length} Open POs`, style: 8 };
      if (cIdx < 8) return { value: '', style: 8 };
      const colLtr = colIndexToLetter(cIdx);
      const val = poDataRows.reduce((s, r) => s + Number(r[cIdx]?.value || 0), 0);
      return {
        value: Math.round(val),
        formula: poDataRows.length > 0 ? `SUM(${colLtr}${poStart}:${colLtr}${poEnd})` : undefined,
        style: 9,
      };
    });

    const s3LastCol = colIndexToLetter(poHeaders.length - 1);
    const sheet3Rows: XlsxCell[][] = [
      [{ value: 'PAKISTAN WIRE INDUSTRIES (PVT.) LTD. — SPOKE SET & OPEN IMPORT PO LINE DETAILS', style: 1 }],
      [{ value: `Generated: ${nowStr}   |   All Quantities in GRS (1 GRS = 144 PCS)`, style: 2 }],
      [],
      [{ value: 'SECTION A: LINKED SPOKE SETS BREAKDOWN', style: 10 }],
      spokeHeaders.map((h) => ({ value: h, style: 3 })),
      ...spokeDataRows,
      spokeTotalRow,
      [],
      [{ value: 'SECTION B: OPEN IMPORT PURCHASE ORDERS (IN-TRANSIT)', style: 10 }],
      poHeaders.map((h) => ({ value: h, style: 3 })),
      ...poDataRows,
      poTotalRow,
    ];

    const s3ColCount = Math.max(spokeHeaders.length, poHeaders.length);
    const s3ColWidths = Array.from({ length: s3ColCount }, (_, idx) => {
      const h1 = spokeHeaders[idx] || '';
      const h2 = poHeaders[idx] || '';
      const maxLen = Math.max(
        h1.length,
        h2.length,
        ...spokeDataRows.map((r) => String(r[idx]?.value ?? '').length),
        ...poDataRows.map((r) => String(r[idx]?.value ?? '').length),
      );
      return idx <= 3 ? Math.max(22, maxLen + 3) : Math.max(14, maxLen + 3);
    });

    const sheet3: SheetSpec = {
      name: 'Spoke Set & Open PO Details',
      rows: sheet3Rows,
      colWidths: s3ColWidths,
      freezeRow: 5,
      merges: [
        `A1:${s3LastCol}1`,
        `A2:${s3LastCol}2`,
        `A4:${s3LastCol}4`,
        `A${poHeaderRowIdx - 1}:${s3LastCol}${poHeaderRowIdx - 1}`,
      ],
    };

    const sheets = [sheet1, sheet2, sheet3];

    const hasLogo = Boolean(logoAssets?.bytes);
    const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  ${hasLogo ? '<Default Extension="png" ContentType="image/png"/>' : ''}
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
  ${hasLogo ? '<Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>' : ''}
  ${sheets
    .map(
      (_, i) =>
        `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
    )
    .join('\n  ')}
</Types>`;

    const rootRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;

    const workbookXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    ${sheets
      .map(
        (s, i) => `<sheet name="${escapeXml(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`,
      )
      .join('\n    ')}
  </sheets>
</workbook>`;

    const workbookRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  ${sheets
    .map(
      (_, i) =>
        `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`,
    )
    .join('\n  ')}
  <Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

    const zipFiles: { name: string; content: string | Uint8Array }[] = [
      { name: '[Content_Types].xml', content: contentTypesXml },
      { name: '_rels/.rels', content: rootRelsXml },
      { name: 'xl/workbook.xml', content: workbookXml },
      { name: 'xl/_rels/workbook.xml.rels', content: workbookRelsXml },
      { name: 'xl/styles.xml', content: buildStylesXml() },
      ...sheets.map((s, i) => ({
        name: `xl/worksheets/sheet${i + 1}.xml`,
        content: buildWorksheetXml(s),
      })),
    ];

    if (logoAssets?.bytes) {
      const sheet1RelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing1.xml"/>
</Relationships>`;
      const drawing1RelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image1.png"/>
</Relationships>`;
      const drawing1Xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <xdr:twoCellAnchor editAs="oneCell">
    <xdr:from><xdr:col>0</xdr:col><xdr:colOff>30000</xdr:colOff><xdr:row>0</xdr:row><xdr:rowOff>15000</xdr:rowOff></xdr:from>
    <xdr:to><xdr:col>0</xdr:col><xdr:colOff>420000</xdr:colOff><xdr:row>1</xdr:row><xdr:rowOff>210000</xdr:rowOff></xdr:to>
    <xdr:pic>
      <xdr:nvPicPr><xdr:cNvPr id="2" name="PWI Logo"/><xdr:cNvPicPr><a:picLocks noChangeAspect="1"/></xdr:cNvPicPr></xdr:nvPicPr>
      <xdr:blipFill><a:blip r:embed="rId1"/><a:stretch><a:fillRect/></xdr:stretch></xdr:blipFill>
      <xdr:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="390000" cy="390000"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr>
    </xdr:pic>
    <xdr:clientData/>
  </xdr:twoCellAnchor>
</xdr:wsDr>`;
      zipFiles.push(
        { name: 'xl/media/image1.png', content: logoAssets.bytes },
        { name: 'xl/drawings/drawing1.xml', content: drawing1Xml },
        { name: 'xl/drawings/_rels/drawing1.xml.rels', content: drawing1RelsXml },
        { name: 'xl/worksheets/_rels/sheet1.xml.rels', content: sheet1RelsXml },
      );
    }

    const blob = buildZipBlob(zipFiles);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Nipple_MRP_Report_${dateTag}.xlsx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    message.success('Multi-sheet Excel workbook (.xlsx) downloaded');
  } catch (err: any) {
    console.error('Failed to export Nipple MRP Excel:', err);
    message.error(err?.message || 'Failed to generate Excel workbook');
  }
}

// ============================================================================
// 3. DISTRACTION-FREE A4 LANDSCAPE PRINT VIEW (@media print)
// ============================================================================
export async function printNippleMrpReport(options: NippleMrpExportOptions): Promise<void> {
  const { rows, totals, timePhasedPlan, viewMode, safetyMonths, horizonIso, isInventoryMode, remarks } = options;

  const logoAssets = await loadLogoAssets();
  const logoUrl = logoAssets?.dataUrl || getLogoUrl();
  const nowStr = dayjs().format('DD-MMM-YYYY HH:mm');
  const activeModeLabel =
    viewMode === 'matrix'
      ? `TIME-PHASED SHIPMENT PLAN (${safetyMonths}M SAFETY TARGET)`
      : 'DEMAND & STOCK BALANCE SUMMARY';

  const spokeList = buildSpokeDetailsList(rows);
  const poList = buildOpenPoDetailsList(rows, timePhasedPlan.shipmentMilestones);

  const summaryRowsHtml = rows
    .map((r: any, idx: number) => {
      const remToPack = Number(r.remainingToPack ?? r.netPendingDemand ?? 0);
      const unpacked = Number(r.currentUnpackedNippleStock ?? r.currentFgStock ?? r.fgStock ?? 0);
      const packable = Number(r.packableFromStockGrs ?? Math.min(unpacked, remToPack));
      const deficit = Number(r.netDeficitRequired || 0);
      const surplus = Number(r.stockSurplus || 0);
      const isDeficit = deficit > 0;
      const statusText = getStatusText(r, isInventoryMode);
      const effUsage = Number(r.effectiveMonthlyUsage ?? r.monthlyAvgConsumption ?? 0);
      const usageTag = r.usageSource === 'MANUAL' ? 'Man' : 'Auto';
      const leadM = Number(r.importLeadTimeMonths ?? 4);
      const bufM = Number(r.safetyBufferMonths ?? 1);
      const cov = Number(r.coverageMonths ?? 999);
      const isCovRisk = cov < leadM;
      const stockoutStr = r.projectedStockoutDate ? dayjs(r.projectedStockoutDate).format('DD MMM YY') : '—';
      const orderToday = Number(r.orderTodayQty || 0);

      return `
        <tr>
          <td class="c bold">${idx + 1}</td>
          <td class="bold sku">${escapeXml(r.itemCode)}</td>
          <td class="bold">${escapeXml(r.itemName)}</td>
          <td class="c">${Array.isArray(r.linkedSpokeSets) ? r.linkedSpokeSets.length : 0}</td>
          <td class="num">${formatDecimal(r.totalDemand || 0, 0)}</td>
          <td class="num">${formatDecimal(r.totalDispatched || 0, 0)}</td>
          <td class="num bold">${formatDecimal(r.netPendingOrder || 0, 0)}</td>
          <td class="num cyan">${formatDecimal(r.packedWithNipplesFgr ?? r.packedInCartonsFgr ?? 0, 0)}</td>
          <td class="num amber">${formatDecimal(r.withoutNippleCartonsFgr || 0, 0)}</td>
          <td class="num bold ${remToPack > 0 ? 'red' : 'green'}">${formatDecimal(remToPack, 0)}</td>
          <td class="num bold green">${formatDecimal(unpacked, 0)}</td>
          <td class="num">${formatDecimal(packable, 0)}</td>
          <td class="c bold ${isDeficit ? 'pill-red' : 'pill-green'}">
            ${isDeficit ? `-${formatDecimal(deficit, 0)} Deficit` : `+${formatDecimal(surplus, 0)} Surplus`}
          </td>
          <td class="num">${formatDecimal(effUsage, 0)} <span style="font-size:8px;color:#64748b;">(${usageTag})</span></td>
          <td class="c">${leadM}+${bufM}M</td>
          <td class="c bold ${isCovRisk ? 'pill-red' : 'pill-green'}">${cov >= 999 ? '999M' : `${cov.toFixed(1)}M`}</td>
          <td class="c">${escapeXml(stockoutStr)}</td>
          <td class="num blue">${formatDecimal(r.openPoPendingQty || 0, 0)}</td>
          <td class="num bold ${orderToday > 0 ? 'pill-red' : 'pill-green'}">${formatDecimal(orderToday, 0)}</td>
          <td class="c bold">${escapeXml(statusText)}</td>
        </tr>
      `;
    })
    .join('');

  const milestones = timePhasedPlan.shipmentMilestones || [];
  const matrixSectionHtml =
    viewMode === 'matrix' && timePhasedPlan.matrixRows.length > 0
      ? `
        <div class="section-block">
          <div class="section-title">TIME-PHASED IMPORT SHIPMENT PROJECTION MATRIX (${safetyMonths}M SAFETY · HORIZON ${escapeXml(horizonIso)})</div>
          <table>
            <thead>
              <tr>
                <th rowspan="2" class="c">#</th>
                <th rowspan="2">SKU &amp; Product</th>
                <th rowspan="2" class="num">Last 3M</th>
                <th rowspan="2" class="num">Mo. Avg</th>
                <th rowspan="2" class="num">${safetyMonths}M Safety</th>
                <th rowspan="2" class="num">Stock in Hand</th>
                ${milestones
                  .map(
                    (ms: any, i: number) =>
                      `<th colspan="4" class="c">S#${i + 1}: ${escapeXml(ms.vendorName)}<br/><span style="font-weight:400;font-size:8px;">${escapeXml(ms.fileNumber)} · ETA ${escapeXml(ms.etaDate)}</span></th>`,
                  )
                  .join('')}
                <th rowspan="2" class="c">Safe (Mo)</th>
                <th rowspan="2" class="num">Rec. Order</th>
              </tr>
              <tr>
                ${milestones
                  .map(
                    () =>
                      `<th class="num">Before</th><th class="num">Ship (+)</th><th class="num">Burn (-)</th><th class="num">After</th>`,
                  )
                  .join('')}
              </tr>
            </thead>
            <tbody>
              ${timePhasedPlan.matrixRows
                .map((r: any) => {
                  const cells = milestones
                    .map((ms: any) => {
                      const p = r.milestoneProjections?.[ms.poId || ms.poNumber] || {};
                      const before = Number(p.stockBeforeShipment ?? r.stockInHand ?? 0);
                      const ship = Number(p.shipmentQtyGrs || 0);
                      const cons = Number(p.materialConsumedTillEta || 0);
                      const after = Number(p.stockAfterShipment ?? r.stockInHand ?? 0);
                      return `
                        <td class="num ${before < 0 ? 'red bold' : ''}">${formatDecimal(before, 0)}</td>
                        <td class="num blue bold">+${formatDecimal(ship, 0)}</td>
                        <td class="num amber">-${formatDecimal(cons, 0)}</td>
                        <td class="num bold ${after < 0 ? 'red' : ''}">${formatDecimal(after, 0)}</td>
                      `;
                    })
                    .join('');
                  return `
                    <tr>
                      <td class="c bold">${r.sNo}</td>
                      <td><b>${escapeXml(r.itemName)}</b><div class="sub-sku">${escapeXml(r.itemCode)}</div></td>
                      <td class="num">${formatDecimal(r.last3MonthSales || 0, 0)}</td>
                      <td class="num">${formatDecimal(r.monthlyAverage || 0, 0)}</td>
                      <td class="num">${formatDecimal(r.forecastSafetyStock || 0, 0)}</td>
                      <td class="num bold cyan">${formatDecimal(r.stockInHand || 0, 0)}</td>
                      ${cells}
                      <td class="c bold">${Number(r.safeInMonths || 0) >= 99 ? '99+' : Number(r.safeInMonths || 0).toFixed(2)}</td>
                      <td class="num bold green">${formatDecimal(r.matrixRecommendedOrderQty || 0, 0)}</td>
                    </tr>
                  `;
                })
                .join('')}
            </tbody>
          </table>
        </div>
      `
      : '';

  const spokeRowsHtml =
    spokeList.length > 0
      ? spokeList
          .map(
            (s, i) => `
          <tr>
            <td class="c">${i + 1}</td>
            <td class="bold sku">${escapeXml(s.itemCode)}</td>
            <td class="bold">${escapeXml(s.itemName)}</td>
            <td>${escapeXml(s.spokeName)}</td>
            <td class="num">${formatDecimal(s.ord, 0)}</td>
            <td class="num">${formatDecimal(s.disp, 0)}</td>
            <td class="num bold">${formatDecimal(s.pendOrder, 0)}</td>
            <td class="num cyan">${formatDecimal(s.packed, 0)}</td>
            <td class="num amber">${formatDecimal(s.withoutNipple, 0)}</td>
            <td class="num bold ${s.balToPack > 0 ? 'red' : 'green'}">${formatDecimal(s.balToPack, 0)}</td>
            <td class="c bold">${s.pctPacked}%</td>
          </tr>
        `,
          )
          .join('')
      : `<tr><td colspan="11" class="c" style="color:#64748b;">No active linked Spoke Set orders</td></tr>`;

  const poRowsHtml =
    poList.length > 0
      ? poList
          .map(
            (p, i) => `
          <tr>
            <td class="c">${i + 1}</td>
            <td class="bold sku">${escapeXml(p.itemCode)}</td>
            <td class="bold">${escapeXml(p.itemName)}</td>
            <td class="bold">${escapeXml(p.poCode)}</td>
            <td>${escapeXml(p.supplierName)}</td>
            <td class="c">${escapeXml(p.origin)}</td>
            <td class="c">${escapeXml(p.stage)}</td>
            <td class="c">${escapeXml(p.fileNumber)}</td>
            <td class="c">${escapeXml(p.etaDate)}</td>
            <td class="num">${formatDecimal(p.ordered, 0)}</td>
            <td class="num green">${formatDecimal(p.received, 0)}</td>
            <td class="num bold blue">${formatDecimal(p.openQty, 0)}</td>
          </tr>
        `,
          )
          .join('')
      : `<tr><td colspan="12" class="c" style="color:#64748b;">No Open / In-Transit Purchase Orders</td></tr>`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Pakistan Wire Industry — Nipple Demand, Stock Balance &amp; Import MRP Report</title>
  <style>
    @page { size: A4 landscape; margin: 8mm 10mm; }
    * { box-sizing: border-box; font-family: 'Segoe UI', Roboto, Arial, sans-serif; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    html, body { margin: 0; padding: 0; color: #0f172a; background: #ffffff; font-size: 10px; line-height: 1.35; }
    .page-wrap { padding: 8px 10px; }
    .toolbar { display: flex; justify-content: flex-end; gap: 8px; margin-bottom: 8px; }
    .toolbar button { padding: 5px 12px; border: 1px solid #0f172a; background: #0f172a; color: #fff; font-weight: 700; font-size: 11px; border-radius: 4px; cursor: pointer; }
    .toolbar button.secondary { background: #fff; color: #0f172a; }
    .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2.5px solid #0f172a; padding-bottom: 8px; margin-bottom: 10px; }
    .brand { display: flex; align-items: center; gap: 10px; }
    .brand img { width: 44px; height: 44px; object-fit: contain; }
    .brand-title { font-size: 16px; font-weight: 800; color: #0f172a; letter-spacing: 0.3px; }
    .brand-sub { font-size: 10.5px; color: #334155; font-weight: 600; margin-top: 1px; }
    .meta-box { text-align: right; }
    .mode-badge { display: inline-block; background: #0f172a; color: #ffffff; font-weight: 800; font-size: 10px; padding: 3px 9px; border-radius: 4px; letter-spacing: 0.4px; }
    .meta-sub { font-size: 9.5px; color: #475569; margin-top: 3px; }
    .kpi-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 10px; }
    .kpi-card { border: 1px solid #cbd5e1; border-left: 3.5px solid #0f172a; border-radius: 5px; padding: 6px 9px; background: #f8fafc; break-inside: avoid; }
    .kpi-label { font-size: 8.5px; font-weight: 700; color: #475569; text-transform: uppercase; letter-spacing: 0.3px; }
    .kpi-val { font-size: 13px; font-weight: 800; margin-top: 2px; color: #0f172a; font-variant-numeric: tabular-nums; }
    .kpi-sub { font-size: 8.5px; color: #64748b; margin-top: 2px; }
    .section-block { margin-top: 10px; break-inside: avoid; }
    .section-title { font-size: 10.5px; font-weight: 800; color: #0f172a; text-transform: uppercase; letter-spacing: 0.3px; margin-bottom: 4px; border-left: 3px solid #0284c7; padding-left: 6px; }
    table { width: 100%; border-collapse: collapse; font-size: 9px; font-variant-numeric: tabular-nums; }
    thead { display: table-header-group; }
    tr { break-inside: avoid; page-break-inside: avoid; }
    th { background: #0f172a; color: #ffffff; padding: 4.5px 5px; font-size: 8.5px; font-weight: 700; text-align: left; border: 1px solid #0f172a; text-transform: uppercase; }
    th.num { text-align: right; }
    th.c { text-align: center; }
    td { padding: 4px 5px; border: 1px solid #cbd5e1; vertical-align: middle; }
    tbody tr:nth-child(even) { background: #f8fafc; }
    tfoot td { background: #e2e8f0; font-weight: 800; border-top: 2px solid #0f172a; border-bottom: 2px solid #0f172a; }
    .num { text-align: right; }
    .c { text-align: center; }
    .bold { font-weight: 700; }
    .sku { color: #0369a1; white-space: nowrap; }
    .sub-sku { font-size: 8px; color: #0369a1; font-weight: 700; }
    .red { color: #b91c1c; }
    .green { color: #15803d; }
    .cyan { color: #0e7490; }
    .amber { color: #b45309; }
    .blue { color: #1d4ed8; }
    .pill-red { background: #fee2e2; color: #991b1b; }
    .pill-green { background: #dcfce7; color: #166534; }
    .signatures { display: grid; grid-template-columns: repeat(3, 1fr); gap: 36px; margin-top: 24px; padding-top: 10px; break-inside: avoid; }
    .sig-box { text-align: center; padding-top: 22px; border-top: 1.2px solid #334155; font-size: 9.5px; font-weight: 700; color: #1e293b; }
    .print-footer { margin-top: 10px; padding-top: 5px; border-top: 1px solid #cbd5e1; display: flex; justify-content: space-between; font-size: 8.5px; color: #64748b; }
    @media print {
      .no-print, .toolbar { display: none !important; }
      .page-wrap { padding: 0; }
    }
  </style>
</head>
<body>
  <div class="page-wrap">
    <div class="toolbar no-print">
      <button onclick="window.print()">Print Report (A4 Landscape)</button>
      <button class="secondary" onclick="window.close()">Close Window</button>
    </div>

    <div class="header">
      <div class="brand">
        <img src="${logoUrl}" alt="PWI" onerror="this.style.display='none'" />
        <div>
          <div class="brand-title">PAKISTAN WIRE INDUSTRIES (PVT.) LTD.</div>
          <div class="brand-sub">Nipple Demand, Stock Balance &amp; Import MRP Report</div>
        </div>
      </div>
      <div class="meta-box">
        <div class="mode-badge">${activeModeLabel}</div>
        <div class="meta-sub">Generated: ${nowStr} &nbsp;|&nbsp; All Quantities in GRS (1 GRS = 144 PCS)</div>
      </div>
    </div>

    <div class="kpi-grid">
      <div class="kpi-card" style="border-left-color:#0f172a;">
        <div class="kpi-label">Total Pending Order</div>
        <div class="kpi-val">${formatDecimal(totals.netPendingOrder || 0, 0)} GRS</div>
        <div class="kpi-sub">Gross Ord: ${formatDecimal(totals.totalDemand || 0, 0)} · Disp: ${formatDecimal(totals.totalDispatched || 0, 0)} GRS</div>
      </div>
      <div class="kpi-card" style="border-left-color:#dc2626;">
        <div class="kpi-label">Remaining to Pack</div>
        <div class="kpi-val red">${formatDecimal(totals.remainingToPack || 0, 0)} GRS</div>
        <div class="kpi-sub">Packed w/ Nipple: ${formatDecimal(totals.packedFgr || 0, 0)}${totals.withoutNippleCartonsFgr > 0 ? ` · No-Nipple: ${formatDecimal(totals.withoutNippleCartonsFgr, 0)}` : ''} GRS</div>
      </div>
      <div class="kpi-card" style="border-left-color:#16a34a;">
        <div class="kpi-label">Unpacked Nipple Stock (WH-002)</div>
        <div class="kpi-val green">${formatDecimal(totals.currentFg || 0, 0)} GRS</div>
        <div class="kpi-sub">Packable Now: ${formatDecimal(totals.packableFromStockGrs || 0, 0)} · Surplus: +${formatDecimal(totals.stockSurplus || 0, 0)} GRS</div>
      </div>
      <div class="kpi-card" style="border-left-color:#2563eb;">
        <div class="kpi-label">Order Today (4M Lead) / Open POs</div>
        <div class="kpi-val ${(totals.orderTodayQty ?? rows.reduce((s, r) => s + Number(r.orderTodayQty || 0), 0)) > 0 ? 'red' : 'blue'}">Order Today: ${formatDecimal(totals.orderTodayQty ?? rows.reduce((s, r) => s + Number(r.orderTodayQty || 0), 0), 0)} GRS</div>
        <div class="kpi-sub">Net Deficit: ${formatDecimal(totals.netDeficitRequired || 0, 0)} · Open PO: ${formatDecimal(totals.openPoPendingQty || 0, 0)} GRS</div>
      </div>
    </div>

    <div class="section-title">1. Reconciled Nipple Demand, Stock Balance &amp; 4M Lead-Time Planning Summary (All in GRS)</div>
    <table>
      <thead>
        <tr>
          <th class="c">#</th>
          <th>SKU</th>
          <th>Nipple Product</th>
          <th class="c">Spokes</th>
          <th class="num">Total Ord</th>
          <th class="num">Disp.</th>
          <th class="num">Pend. Ord</th>
          <th class="num">Packed (w/ Nipple)</th>
          <th class="num">No-Nipple</th>
          <th class="num">Bal to Pack</th>
          <th class="num">Unpacked WH-002</th>
          <th class="num">Packable Now</th>
          <th class="c">Deficit / Surplus</th>
          <th class="num">Mo. Usage</th>
          <th class="c">Lead+Buf</th>
          <th class="c">Covg</th>
          <th class="c">Stockout</th>
          <th class="num">Open PO</th>
          <th class="num">Order Today</th>
          <th class="c">Status</th>
        </tr>
      </thead>
      <tbody>${summaryRowsHtml}</tbody>
      <tfoot>
        <tr>
          <td colspan="3">GRAND TOTAL (ALL ${rows.length} NIPPLE ITEMS)</td>
          <td class="c">—</td>
          <td class="num">${formatDecimal(totals.totalDemand || 0, 0)}</td>
          <td class="num">${formatDecimal(totals.totalDispatched || 0, 0)}</td>
          <td class="num">${formatDecimal(totals.netPendingOrder || 0, 0)}</td>
          <td class="num cyan">${formatDecimal(totals.packedFgr || 0, 0)}</td>
          <td class="num amber">${formatDecimal(totals.withoutNippleCartonsFgr || 0, 0)}</td>
          <td class="num red">${formatDecimal(totals.remainingToPack || 0, 0)}</td>
          <td class="num green">${formatDecimal(totals.currentFg || 0, 0)}</td>
          <td class="num">${formatDecimal(totals.packableFromStockGrs || 0, 0)}</td>
          <td class="c">${totals.netDeficitRequired > 0 ? `-${formatDecimal(totals.netDeficitRequired, 0)} Deficit` : `+${formatDecimal(totals.stockSurplus || 0, 0)} Surplus`}</td>
          <td class="num">${formatDecimal(totals.effectiveMonthlyUsage ?? rows.reduce((s, r) => s + Number(r.effectiveMonthlyUsage || 0), 0), 0)}</td>
          <td class="c">—</td>
          <td class="c">—</td>
          <td class="c">—</td>
          <td class="num blue">${formatDecimal(totals.openPoPendingQty || 0, 0)}</td>
          <td class="num red">${formatDecimal(totals.orderTodayQty ?? rows.reduce((s, r) => s + Number(r.orderTodayQty || 0), 0), 0)}</td>
          <td class="c">—</td>
        </tr>
      </tfoot>
    </table>

    ${matrixSectionHtml}

    <div class="section-block">
      <div class="section-title">2. Linked Spoke Sets Breakdown</div>
      <table>
        <thead>
          <tr>
            <th class="c">#</th>
            <th>Nipple SKU</th>
            <th>Nipple Product</th>
            <th>Spoke Set Name</th>
            <th class="num">Total Order</th>
            <th class="num">Dispatched</th>
            <th class="num">Pending Order</th>
            <th class="num">Packed (w/ Nipple)</th>
            <th class="num">Without Nipple FGR</th>
            <th class="num">Balance to Pack</th>
            <th class="c">% Packed</th>
          </tr>
        </thead>
        <tbody>${spokeRowsHtml}</tbody>
      </table>
    </div>

    <div class="section-block">
      <div class="section-title">3. Open Import Purchase Orders (In-Transit)</div>
      <table>
        <thead>
          <tr>
            <th class="c">#</th>
            <th>Nipple SKU</th>
            <th>Nipple Product</th>
            <th>PO Number</th>
            <th>Vendor / Supplier</th>
            <th class="c">Origin</th>
            <th class="c">Stage</th>
            <th class="c">File # / LC</th>
            <th class="c">ETA Date</th>
            <th class="num">Ordered (GRS)</th>
            <th class="num">Received (GRS)</th>
            <th class="num">Open In-Transit</th>
          </tr>
        </thead>
        <tbody>${poRowsHtml}</tbody>
      </table>
    </div>

    ${
      remarks && remarks.trim()
        ? `<div class="avoid-break" style="margin-top:14px;padding:10px 14px;border:1px solid #cbd5e1;border-radius:6px;background:#f8fafc;">
            <div style="font-size:10.5px;font-weight:800;color:#0f172a;text-transform:uppercase;letter-spacing:0.4px;margin-bottom:4px;">Report Remarks / Notes</div>
            <div dir="auto" style="font-size:11.5px;color:#1e293b;white-space:pre-wrap;line-height:1.5;">${escapeXml(remarks.trim())}</div>
          </div>`
        : ''
    }

    <div class="signatures">
      <div class="sig-box">Prepared By (MRP / Planning)</div>
      <div class="sig-box">Store / Inventory Manager</div>
      <div class="sig-box">Approved By (GM / Director Operations)</div>
    </div>

    <div class="print-footer">
      <span>Pakistan Wire Industries (Pvt.) Ltd. — Official Nipple MRP &amp; Inventory Control Report</span>
      <span>Printed on ${nowStr} · Unit: GRS (1 GRS = 144 PCS)</span>
    </div>
  </div>
</body>
</html>`;

  const win = window.open('', '_blank', 'width=1280,height=860');
  if (!win) {
    message.error('Please allow pop-ups in your browser to open the Print View');
    return;
  }
  win.document.open();
  win.document.write(html);
  win.document.close();
  setTimeout(() => {
    win.focus();
    win.print();
  }, 350);
}
