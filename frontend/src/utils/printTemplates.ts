import dayjs from 'dayjs';
import { formatDecimal, formatQty } from './numberFormat';
import { renderVisitorSlipHtml, type VisitorSlipAssets, type VisitorSlipData } from './visitorSlipHtml';

export function getLogoUrl(): string {
  if (typeof window !== 'undefined' && window.location?.origin) {
    return `${window.location.origin}/logo.png`;
  }
  return '/logo.png';
}

export function printHtmlContent(title: string, bodyContent: string): void {
  // Remove any previous print frame
  const existingFrame = document.getElementById('pwi-print-frame');
  if (existingFrame) {
    existingFrame.remove();
  }

  const iframe = document.createElement('iframe');
  iframe.id = 'pwi-print-frame';
  iframe.setAttribute('title', 'PWI Print Document');
  iframe.style.position = 'fixed';
  iframe.style.left = '-10000px';
  iframe.style.top = '-10000px';
  iframe.style.width = '210mm';
  iframe.style.height = '297mm';
  iframe.style.border = 'none';
  iframe.style.zIndex = '-9999';
  document.body.appendChild(iframe);

  const doc = iframe.contentWindow?.document;
  if (!doc) {
    window.print();
    return;
  }

  doc.open();
  doc.write(`
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <title>${title}</title>
        <style>
          @page {
            size: A4 portrait;
            margin: 8mm 10mm;
          }
          * {
            box-sizing: border-box;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          html, body {
            margin: 0;
            padding: 0;
            width: 100% !important;
            background: #ffffff !important;
            color: #111827 !important;
            font-family: Arial, "Helvetica Neue", Helvetica, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            font-size: 11px;
            line-height: 1.4;
          }
          .pwi-print-container {
            width: 100%;
            max-width: 190mm;
            margin: 0 auto;
            padding: 0;
          }
          .company-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-bottom: 2px solid #0f172a;
            padding-bottom: 10px;
            margin-bottom: 12px;
          }
          .company-logo-info {
            display: flex;
            align-items: center;
            gap: 12px;
          }
          .company-logo {
            width: 58px;
            height: 58px;
            object-fit: contain;
          }
          .company-name {
            font-size: 17px;
            font-weight: 800;
            color: #0f172a;
            letter-spacing: 0.5px;
          }
          .company-sub {
            font-size: 9.5px;
            color: #475569;
            margin-top: 1px;
          }
          .company-tax {
            font-size: 9.5px;
            font-weight: 700;
            color: #1e293b;
            margin-top: 2px;
          }
          .doc-badge-box {
            text-align: right;
          }
          .doc-badge {
            display: inline-block;
            border: 2px solid #0f172a;
            font-size: 14px;
            font-weight: 900;
            padding: 4px 12px;
            letter-spacing: 0.8px;
            text-transform: uppercase;
          }
          .doc-badge-sub {
            font-size: 9px;
            font-weight: 700;
            color: #64748b;
            margin-top: 2px;
            letter-spacing: 0.5px;
          }
          .info-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 12px;
            margin-bottom: 12px;
          }
          .info-card {
            border: 1px solid #cbd5e1;
            border-radius: 4px;
            padding: 8px 10px;
            background: #fafafa;
          }
          .info-card-title {
            font-size: 10.5px;
            font-weight: 800;
            text-transform: uppercase;
            color: #0f172a;
            border-bottom: 1px solid #e2e8f0;
            padding-bottom: 3px;
            margin-bottom: 6px;
            letter-spacing: 0.5px;
          }
          .info-row {
            display: flex;
            justify-content: space-between;
            margin-bottom: 3px;
            font-size: 10.5px;
          }
          .info-label {
            color: #64748b;
            font-weight: 600;
          }
          .info-val {
            color: #0f172a;
            font-weight: 700;
            text-align: right;
          }
          table.print-table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 12px;
          }
          table.print-table th {
            background-color: #1e293b !important;
            color: #ffffff !important;
            font-size: 10px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            padding: 6px 7px;
            border: 1px solid #1e293b;
          }
          table.print-table td {
            padding: 6px 7px;
            border: 1px solid #cbd5e1;
            font-size: 10.5px;
            color: #1e293b;
          }
          table.print-table tr:nth-child(even) td {
            background-color: #f8fafc;
          }
          .totals-wrap {
            display: flex;
            justify-content: flex-end;
            margin-bottom: 14px;
          }
          .totals-table {
            width: 320px;
            border-collapse: collapse;
          }
          .totals-table td {
            padding: 4px 8px;
            font-size: 11px;
            border-bottom: 1px solid #e2e8f0;
          }
          .totals-table td.total-label {
            color: #475569;
            font-weight: 600;
          }
          .totals-table td.total-val {
            text-align: right;
            font-weight: 700;
            color: #0f172a;
          }
          .totals-table tr.grand-total td {
            font-size: 13px;
            font-weight: 900;
            border-top: 2px solid #0f172a;
            border-bottom: 2px solid #0f172a;
            background: #f1f5f9;
            color: #0f172a;
          }
          .signatures {
            display: grid;
            grid-template-columns: 1fr 1fr 1fr;
            gap: 24px;
            margin-top: 30px;
            padding-top: 10px;
          }
          .sig-box {
            text-align: center;
            border-top: 1px dashed #64748b;
            padding-top: 5px;
            font-size: 10px;
            font-weight: 700;
            color: #475569;
          }
          .footer-note {
            margin-top: 16px;
            text-align: center;
            font-size: 9px;
            color: #94a3b8;
            border-top: 1px solid #e2e8f0;
            padding-top: 5px;
          }
        </style>
      </head>
      <body>
        <div class="pwi-print-container">
          ${bodyContent}
        </div>
      </body>
    </html>
  `);
  doc.close();

  const triggerPrint = () => {
    try {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    } catch {
      window.print();
    }
  };

  // Wait for all images inside iframe to finish loading
  const imgs = Array.from(doc.images || []);
  if (imgs.length > 0) {
    let pending = imgs.length;
    const onDone = () => {
      pending--;
      if (pending <= 0) {
        setTimeout(triggerPrint, 150);
      }
    };
    imgs.forEach(img => {
      if (img.complete) {
        pending--;
      } else {
        img.onload = onDone;
        img.onerror = onDone;
      }
    });
    if (pending <= 0) {
      setTimeout(triggerPrint, 150);
    }
  } else {
    setTimeout(triggerPrint, 150);
  }
}

function amountToWords(num: number): string {
  if (!num || isNaN(num) || num === 0) return 'Zero Rupees Only';
  const a = ['', 'One ', 'Two ', 'Three ', 'Four ', 'Five ', 'Six ', 'Seven ', 'Eight ', 'Nine ', 'Ten ', 'Eleven ', 'Twelve ', 'Thirteen ', 'Fourteen ', 'Fifteen ', 'Sixteen ', 'Seventeen ', 'Eighteen ', 'Nineteen '];
  const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  const n = ('000000000' + Math.floor(Math.abs(num))).slice(-9);
  const match = n.match(/^(\d{2})(\d{2})(\d{2})(\d{1})(\d{2})$/);
  if (!match) return 'Rupees Only';

  let str = '';
  str += Number(match[1]) !== 0 ? (a[Number(match[1])] || b[Number(match[1][0])] + ' ' + a[Number(match[1][1])]) + 'Crore ' : '';
  str += Number(match[2]) !== 0 ? (a[Number(match[2])] || b[Number(match[2][0])] + ' ' + a[Number(match[2][1])]) + 'Lakh ' : '';
  str += Number(match[3]) !== 0 ? (a[Number(match[3])] || b[Number(match[3][0])] + ' ' + a[Number(match[3][1])]) + 'Thousand ' : '';
  str += Number(match[4]) !== 0 ? (a[Number(match[4])] || b[Number(match[4][0])] + ' ' + a[Number(match[4][1])]) + 'Hundred ' : '';
  str += Number(match[5]) !== 0 ? ((str !== '') ? 'and ' : '') + (a[Number(match[5])] || b[Number(match[5][0])] + ' ' + a[Number(match[5][1])]) : '';

  return (str.trim() || 'Zero') + ' Rupees Only';
}

// 1. INVOICE PRINT (PIXEL-PERFECT REFERENCE MATCHING IMAGE 4)
export function printInvoiceDocument(inv: any): void {
  if (!inv) return;
  const items = inv.items || inv.lines || [];
  const custCode = inv.customer?.customerCode || '';
  const custName = inv.customer?.companyName || inv.customer?.name || inv.companyName || 'Customer';
  const custAddress = inv.customer?.addressLine1 || inv.customer?.billingAddress || inv.customer?.address || 'Industrial Area';
  const custCity = inv.customer?.city || '';
  const custPhone = inv.customer?.phone || inv.customer?.mobile || '-';
  const custNtn = inv.customer?.taxNumber || inv.customerTaxNumber || '-';
  const custStrn = inv.customer?.salesTaxNumber || inv.customerStrn || '-';

  const dnNo = inv.deliveryNumber || inv.relatedDelivery?.deliveryNumber || 'Direct Dispatch';
  const gpNo = inv.gatePassNumber || inv.relatedDelivery?.gatePassNumber || '-';
  const socNo = inv.socNumber || inv.salesOrder?.orderNumber || 'Direct Sale';
  const divName = inv.divisionName || inv.salesOrder?.division?.name || '-';
  const paymentTerms = inv.paymentTerms || inv.customer?.paymentTerms || 'Cash / Immediate';

  let totalQty = 0;
  const normalizedRows =
    items.length > 0
      ? items
      : [
          {
            description: inv.notes || 'Finished Goods Wire Product',
            itemCode: null,
            quantity: 1,
            uom: 'Lot',
            rate: Number(inv.subtotal || inv.totalAmount || 0),
            taxableAmount: Number(inv.subtotal || inv.totalAmount || 0),
            gstAmount: Number(inv.taxAmount || 0),
            gstRate:
              Number(inv.subtotal || 0) > 0 && Number(inv.taxAmount || 0) > 0
                ? Math.round((Number(inv.taxAmount) / Number(inv.subtotal)) * 10000) / 100
                : 0,
            amount: Number(inv.totalAmount || 0),
          },
        ];

  const rowsHtml = normalizedRows
    .map((it: any, idx: number) => {
      const code = it.itemCode || it.item?.itemCode || '';
      const pName = it.product || it.item?.name || it.description || it.productName || it.name || 'Finished Product';
      const uom = it.uom || it.uomCode || it.uom?.code || 'GRS';
      const qty = Number(it.quantity ?? it.qty ?? 1);
      const rate = Number(it.rate ?? it.unitPrice ?? 0);
      const taxable = Number(it.taxableAmount ?? qty * rate);
      const taxAmt = Number(it.gstAmount ?? it.taxAmount ?? 0);
      const pctNum =
        it.gstRate != null
          ? Number(it.gstRate)
          : it.taxRate != null
          ? Number(it.taxRate)
          : taxable > 0 && taxAmt > 0
          ? Math.round((taxAmt / taxable) * 10000) / 100
          : 0;
      const total = Number(it.amount ?? it.lineTotal ?? it.total ?? taxable + taxAmt);
      totalQty += qty;

      return `
      <tr style="border-bottom: 1px solid #cbd5e1; font-size: 10.5px;">
        <td style="text-align: center; padding: 7px 4px; width: 28px; color: #475569;">${idx + 1}</td>
        <td style="padding: 7px 8px;">
          ${code ? `<div style="display: inline-block; font-family: monospace; font-size: 9.5px; font-weight: 800; color: #c2410c; background: #fff7ed; border: 1px solid #fdba74; padding: 1px 6px; border-radius: 3px; margin-bottom: 2px;">${code}</div>` : ''}
          <div style="font-weight: 700; color: #0f172a;">${pName}</div>
        </td>
        <td style="padding: 7px 6px; font-size: 9.5px; color: #334155; font-family: monospace;">${it.socNumber || socNo || '-'}</td>
        <td style="text-align: right; padding: 7px 6px; font-weight: 700;">${formatQty(qty)}</td>
        <td style="text-align: center; padding: 7px 4px;">${uom}</td>
        <td style="text-align: right; padding: 7px 6px;">${formatDecimal(rate)}</td>
        <td style="text-align: right; padding: 7px 6px;">${formatDecimal(taxable)}</td>
        <td style="text-align: center; padding: 7px 4px;">${pctNum}%</td>
        <td style="text-align: right; padding: 7px 6px;">${formatDecimal(taxAmt)}</td>
        <td style="text-align: right; padding: 7px 8px; font-weight: 800; color: #0f172a;">${formatDecimal(total)}</td>
      </tr>
    `;
    })
    .join('');

  const subtotal = Number(inv.subtotal || 0);
  const totalTax = Number(inv.taxAmount || 0);
  const grandTotal = Number(inv.totalAmount || subtotal + totalTax);
  const paidAmount = Number(inv.paidAmount || 0);
  const balanceDue = Number(inv.outstandingAmount ?? inv.balance ?? Math.max(0, grandTotal - paidAmount));
  const words = amountToWords(grandTotal);
  const effectiveGstPct = subtotal > 0 && totalTax > 0 ? Math.round((totalTax / subtotal) * 10000) / 100 : 0;

  const bodyHtml = `
    <!-- Top Header -->
    <div style="display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2.5px solid #0f172a; padding-bottom: 12px; margin-bottom: 12px;">
      <div style="display: flex; align-items: center; gap: 12px;">
        <img src="${getLogoUrl()}" alt="Pakistan Wire Industries (Pvt.) LTD" style="height: 58px; width: auto; max-width: 120px; object-fit: contain;" onerror="this.style.display='none'" />
        <div>
          <div style="font-size: 18px; font-weight: 900; color: #0f172a; line-height: 1.2; text-transform: uppercase;">Pakistan Wire Industries (Pvt.) LTD</div>
          <div style="font-size: 10.5px; color: #334155; font-weight: 600; margin-top: 2px;">Plot 179, Block E, SITE Superhighway, Karachi, Pakistan</div>
          <div style="font-size: 10px; color: #475569; margin-top: 2px;">NTN: <strong>0819234-7</strong> | STRN: <strong>17-00-9812-001</strong></div>
        </div>
      </div>
      <div style="text-align: right;">
        <div style="display: inline-block; background: #0f172a; color: #ffffff; padding: 5px 14px; font-size: 12.5px; font-weight: 800; letter-spacing: 0.8px; border-radius: 3px; text-transform: uppercase;">
          SALES TAX INVOICE
        </div>
        <div style="font-size: 13px; font-weight: 800; color: #0f172a; margin-top: 5px; font-family: monospace;">${inv.invoiceNo || '-'}</div>
        <div style="font-size: 10px; color: #475569; margin-top: 2px;">Invoice Date: <strong>${inv.invoiceDate || '-'}</strong></div>
        <div style="font-size: 10px; color: #b91c1c;">Due Date: <strong>${inv.dueDate || inv.invoiceDate || '-'}</strong></div>
      </div>
    </div>

    <!-- 2-Column Details: BILL TO & DISPATCH / TAX PARTICULARS -->
    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 14px;">
      <div style="border: 1px solid #cbd5e1; border-radius: 4px; padding: 10px 12px; background: #f8fafc;">
        <div style="font-size: 10px; font-weight: 800; color: #475569; text-transform: uppercase; margin-bottom: 5px; letter-spacing: 0.5px;">BUYER / BILL TO</div>
        ${custCode ? `<div style="display: inline-block; font-family: monospace; font-size: 10px; font-weight: 800; color: #1d4ed8; background: #eff6ff; border: 1px solid #93c5fd; padding: 1px 6px; border-radius: 3px; margin-bottom: 3px;">${custCode}</div>` : ''}
        <div style="font-size: 13px; font-weight: 800; color: #0f172a;">${custName}</div>
        <div style="font-size: 10.5px; color: #334155; margin-top: 2px;">${[custAddress, custCity].filter(Boolean).join(', ')}</div>
        <div style="font-size: 10.5px; color: #334155; margin-top: 2px;">Phone: ${custPhone}</div>
        <div style="font-size: 10.5px; color: #334155; margin-top: 2px;">NTN: <span style="font-family: monospace;">${custNtn}</span> | STRN: <span style="font-family: monospace;">${custStrn}</span></div>
      </div>

      <div style="border: 1px solid #cbd5e1; border-radius: 4px; padding: 10px 12px; background: #f8fafc;">
        <div style="font-size: 10px; font-weight: 800; color: #475569; text-transform: uppercase; margin-bottom: 5px; letter-spacing: 0.5px;">DISPATCH & COMMERCIAL PARTICULARS</div>
        <div style="display: flex; justify-content: space-between; font-size: 10.5px; margin-bottom: 3px;">
          <span style="color: #64748b;">Division:</span>
          <span style="font-weight: 700; color: #0f172a;">${divName}</span>
        </div>
        <div style="display: flex; justify-content: space-between; font-size: 10.5px; margin-bottom: 3px;">
          <span style="color: #64748b;">Delivery Note #:</span>
          <span style="font-weight: 700; color: #0f172a; font-family: monospace;">${dnNo}</span>
        </div>
        <div style="display: flex; justify-content: space-between; font-size: 10.5px; margin-bottom: 3px;">
          <span style="color: #64748b;">Gate Pass #:</span>
          <span style="font-weight: 800; color: #0369a1; font-family: monospace;">${gpNo}</span>
        </div>
        <div style="display: flex; justify-content: space-between; font-size: 10.5px; margin-bottom: 3px;">
          <span style="color: #64748b;">Originating SOC #:</span>
          <span style="font-weight: 700; color: #0f172a; font-family: monospace;">${socNo}</span>
        </div>
        <div style="display: flex; justify-content: space-between; font-size: 10.5px; margin-bottom: 3px;">
          <span style="color: #64748b;">Credit Terms:</span>
          <span style="font-weight: 700; color: #0f172a;">${paymentTerms}</span>
        </div>
        <div style="display: flex; justify-content: space-between; font-size: 10.5px;">
          <span style="color: #64748b;">Status:</span>
          <span style="font-weight: 800; color: ${String(inv.status).toLowerCase() === 'paid' ? '#16a34a' : '#d97706'}; text-transform: uppercase;">${inv.status || 'Pending'}</span>
        </div>
      </div>
    </div>

    <!-- Items Table -->
    <table class="print-table" style="width: 100%; border-collapse: collapse; margin-bottom: 12px;">
      <thead>
        <tr style="background: #0f172a; color: #ffffff; font-size: 10px;">
          <th style="padding: 6px 4px; text-align: center; width: 28px;">#</th>
          <th style="padding: 6px 8px; text-align: left;">ITEM CODE & DESCRIPTION</th>
          <th style="padding: 6px 6px; text-align: left;">SOC #</th>
          <th style="padding: 6px 6px; text-align: right;">QTY</th>
          <th style="padding: 6px 4px; text-align: center;">UOM</th>
          <th style="padding: 6px 6px; text-align: right;">RATE</th>
          <th style="padding: 6px 6px; text-align: right;">SUBTOTAL</th>
          <th style="padding: 6px 4px; text-align: center;">TAX %</th>
          <th style="padding: 6px 6px; text-align: right;">SALES TAX</th>
          <th style="padding: 6px 8px; text-align: right;">TOTAL (PKR)</th>
        </tr>
      </thead>
      <tbody>
        ${rowsHtml}
        <tr style="border-top: 2px solid #0f172a; font-weight: 800; background: #f8fafc; font-size: 10.5px;">
          <td colspan="3" style="padding: 6px 8px;">TOTALS</td>
          <td style="padding: 6px 6px; text-align: right;">${formatQty(totalQty)}</td>
          <td colspan="2"></td>
          <td style="padding: 6px 6px; text-align: right;">Rs ${formatDecimal(subtotal)}</td>
          <td></td>
          <td style="padding: 6px 6px; text-align: right;">Rs ${formatDecimal(totalTax)}</td>
          <td style="padding: 6px 8px; text-align: right;">Rs ${formatDecimal(grandTotal)}</td>
        </tr>
      </tbody>
    </table>

    <!-- Bottom Section: Amount in words & Notes (Left), Totals Breakdown (Right) -->
    <div style="display: flex; justify-content: space-between; gap: 16px; margin-top: 10px;">
      <div style="flex: 1; border: 1px solid #cbd5e1; border-radius: 4px; padding: 10px 12px; background: #ffffff;">
        <div style="font-size: 10px; font-weight: 800; color: #64748b; text-transform: uppercase;">AMOUNT IN WORDS</div>
        <div style="font-size: 11px; font-weight: 700; color: #0f172a; margin-top: 4px; margin-bottom: 10px;">
          ${words}
        </div>
        <div style="font-size: 10px; font-weight: 800; color: #64748b; text-transform: uppercase;">REMARKS / DISPATCH REFERENCE</div>
        <div style="font-size: 10.5px; color: #475569; margin-top: 4px;">
          ${inv.notes || `Official Sales Tax Invoice for Delivery Note ${dnNo}${gpNo !== '-' ? ` (Gate Pass: ${gpNo})` : ''}.`}
        </div>
      </div>

      <div style="width: 260px;">
        <table style="width: 100%; border-collapse: collapse; font-size: 11px;">
          <tr>
            <td style="padding: 4px 0; color: #64748b;">Subtotal (Excl. Tax)</td>
            <td style="padding: 4px 0; text-align: right; font-weight: 600;">Rs ${formatDecimal(subtotal)}</td>
          </tr>
          <tr>
            <td style="padding: 4px 0; color: #64748b;">Sales Tax / GST (${effectiveGstPct > 0 ? `${effectiveGstPct}%` : '0%'})</td>
            <td style="padding: 4px 0; text-align: right; font-weight: 600;">Rs ${formatDecimal(totalTax)}</td>
          </tr>
          <tr style="border-top: 1.5px solid #0f172a; border-bottom: 1.5px solid #0f172a; font-weight: 800;">
            <td style="padding: 5px 0; font-size: 12px; color: #0f172a;">Grand Total</td>
            <td style="padding: 5px 0; text-align: right; font-size: 12px;">Rs ${formatDecimal(grandTotal)}</td>
          </tr>
          <tr>
            <td style="padding: 4px 0; color: #64748b;">Paid to Date</td>
            <td style="padding: 4px 0; text-align: right; font-weight: 600; color: #16a34a;">Rs ${formatDecimal(paidAmount)}</td>
          </tr>
          <tr style="font-weight: 800;">
            <td style="padding: 4px 0; color: ${balanceDue > 0 ? '#dc2626' : '#16a34a'}; font-size: 12px;">Remaining Balance</td>
            <td style="padding: 4px 0; text-align: right; color: ${balanceDue > 0 ? '#dc2626' : '#16a34a'}; font-size: 12px;">Rs ${formatDecimal(balanceDue)}</td>
          </tr>
        </table>
      </div>
    </div>

    <!-- Signatures -->
    <div style="display: flex; justify-content: space-between; margin-top: 38px; padding: 0 12px;">
      <div style="text-align: center; width: 170px;">
        <div style="border-top: 1px solid #94a3b8; padding-top: 4px; font-size: 10px; color: #475569;">Prepared By</div>
      </div>
      <div style="text-align: center; width: 170px;">
        <div style="border-top: 1px solid #94a3b8; padding-top: 4px; font-size: 10px; color: #475569;">Accounts Verified</div>
      </div>
      <div style="text-align: center; width: 170px;">
        <div style="border-top: 1px solid #94a3b8; padding-top: 4px; font-size: 10px; color: #475569;">Customer Signature</div>
      </div>
      <div style="text-align: center; width: 220px;">
        <div style="border-top: 1px solid #94a3b8; padding-top: 4px; font-size: 10px; font-weight: 700; color: #0f172a;">
          For Pakistan Wire Industries (Pvt.) LTD
        </div>
      </div>
    </div>

    <!-- Footer Disclaimer -->
    <div style="text-align: center; margin-top: 22px; font-size: 9.5px; color: #64748b;">
      Goods once dispatched will be accepted back only with formal RMA authorization. Computer-generated Sales Tax Invoice.
    </div>
  `;

  printHtmlContent(`Tax Invoice - ${inv.invoiceNo || 'Print'}`, bodyHtml);
}

// 1B. PURCHASE ORDER PRINT (Exact Match to User Reference Screenshot)
export function printPurchaseOrderDocument(po: any): void {
  if (!po) return;
  const items = po.items || po.lines || [];
  const supName = po.supplier?.name || po.supplier?.companyName || po.supplierName || 'Valued Supplier';
  const supAddress = po.supplier?.addressLine1 || po.supplier?.address || po.deliveryAddress || 'Industrial Area';
  const supPhone = po.supplier?.phone || po.supplier?.contactPhone || '-';
  const supNtn = po.supplier?.taxNumber || po.supplier?.ntn || po.supplier?.gstin || '-';
  const supState = po.supplier?.state || 'Punjab';

  let totalQty = 0;
  const rowsHtml = (items.length > 0 ? items : [
    {
      description: 'Industrial Raw Material Product',
      hsnCode: '8505',
      quantity: 1,
      rate: Number(po.totalAmount || 1260),
      taxableAmount: Number(po.subtotal || po.totalAmount || 1200),
      taxAmount: Number(po.taxAmount || 60),
      amount: Number(po.totalAmount || 1260),
    }
  ]).map((it: any, idx: number) => {
    const pName = it.product || it.item?.name || it.description || it.productName || it.itemName || it.name || 'Raw Material / Wire Product';
    const hsn = it.hsnCode || it.item?.itemCode || it.itemCode || '8505';
    const qty = it.quantity || it.qty || 1;
    const rate = it.rate ?? it.unitPrice ?? 0;
    const taxable = it.taxableAmount ?? (qty * rate);
    const taxAmt = it.gstAmount ?? it.taxAmount ?? (taxable * 0.18);
    const halfTax = taxAmt / 2;
    const taxPct = it.gstPercent ? `${it.gstPercent}%` : (it.taxPercent ? `${it.taxPercent}%` : '18%');
    const total = it.amount ?? it.totalPrice ?? it.lineTotal ?? it.total ?? (taxable + taxAmt);
    totalQty += Number(qty) || 0;

    return `
      <tr style="border-bottom: 1px solid #e2e8f0; font-size: 10px;">
        <td style="text-align: center; padding: 6px 4px; width: 26px;">${idx + 1}</td>
        <td style="padding: 6px 8px;"><strong>${pName}</strong></td>
        <td style="text-align: center; padding: 6px 4px; color: #475569;">${hsn}</td>
        <td style="text-align: right; padding: 6px 6px;">${formatQty(qty)}</td>
        <td style="text-align: right; padding: 6px 6px;">${formatDecimal(rate)}</td>
        <td style="text-align: right; padding: 6px 6px;">${formatDecimal(taxable)}</td>
        <td style="text-align: center; padding: 6px 4px;">${taxPct}</td>
        <td style="text-align: right; padding: 6px 6px;">${formatDecimal(halfTax)}</td>
        <td style="text-align: right; padding: 6px 6px;">${formatDecimal(halfTax)}</td>
        <td style="text-align: right; padding: 6px 8px; font-weight: 700;">${formatDecimal(total)}</td>
      </tr>
    `;
  }).join('');

  const subtotal = Number(po.subtotal || po.totalAmount || 1200);
  const totalTax = Number(po.taxAmount || (subtotal * 0.18));
  const halfTax = totalTax / 2;
  const grandTotal = Number(po.totalAmount || (subtotal + totalTax));
  const paidAmount = Number(po.receivedAmount || 0);
  const balanceDue = Number(po.outstandingAmount ?? (grandTotal - paidAmount));
  const words = amountToWords(grandTotal);

  const bodyHtml = `
    <!-- Top Header -->
    <div style="display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #0f172a; padding-bottom: 12px; margin-bottom: 12px;">
      <div style="display: flex; align-items: center; gap: 12px;">
        <img src="${getLogoUrl()}" alt="Pakistan Wire Industries (Pvt.) LTD" style="height: 54px; width: auto; max-width: 120px; object-fit: contain;" onerror="this.style.display='none'" />
        <div>
          <div style="font-size: 18px; font-weight: 800; color: #0f172a; line-height: 1.2;">Pakistan Wire Industries (Pvt.) LTD</div>
          <div style="font-size: 11px; color: #475569; margin-top: 2px;">State: ${supState}</div>
        </div>
      </div>
      <div style="text-align: right;">
        <div style="display: inline-block; background: #181f2c; color: #ffffff; padding: 4px 14px; font-size: 13px; font-weight: 800; letter-spacing: 0.8px; border-radius: 2px; text-transform: uppercase;">
          PURCHASE ORDER
        </div>
        <div style="font-size: 12px; font-weight: 800; color: #0f172a; margin-top: 4px; font-family: monospace;">${po.poCode || 'PO-0003'}</div>
        <div style="font-size: 10px; color: #475569; margin-top: 1px;">Date: ${po.orderDate || '30 Jul 2026'}</div>
        <div style="font-size: 10px; color: #475569;">Due: ${po.expectedDeliveryDate || '19 Aug 2026'}</div>
      </div>
    </div>

    <!-- 2-Column Details: VENDOR / SUPPLIER & SUMMARY -->
    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px;">
      <div style="border: 1px solid #e2e8f0; border-radius: 4px; padding: 10px 12px; background: #fafafa;">
        <div style="font-size: 10.5px; font-weight: 800; color: #64748b; text-transform: uppercase; margin-bottom: 4px; letter-spacing: 0.5px;">VENDOR / SUPPLIER</div>
        <div style="font-size: 13px; font-weight: 800; color: #0f172a;">${supName}</div>
        <div style="font-size: 10.5px; color: #334155; margin-top: 2px;">${supAddress}</div>
        <div style="font-size: 10.5px; color: #334155; margin-top: 2px;">Phone: ${supPhone}</div>
        <div style="font-size: 10.5px; color: #334155;">GSTIN/NTN: <span style="font-family: monospace;">${supNtn}</span></div>
        <div style="font-size: 10.5px; color: #334155;">State: ${supState}</div>
      </div>

      <div style="border: 1px solid #e2e8f0; border-radius: 4px; padding: 10px 12px; background: #fafafa;">
        <div style="font-size: 10.5px; font-weight: 800; color: #64748b; text-transform: uppercase; margin-bottom: 6px; letter-spacing: 0.5px;">SUMMARY</div>
        <div style="display: flex; justify-content: space-between; font-size: 10.5px; margin-bottom: 3px;">
          <span style="color: #64748b;">Place of supply:</span>
          <span style="font-weight: 700; color: #0f172a;">${supState}</span>
        </div>
        <div style="display: flex; justify-content: space-between; font-size: 10.5px; margin-bottom: 3px;">
          <span style="color: #64748b;">Tax treatment:</span>
          <span style="font-weight: 700; color: #0f172a;">Intra-state (SGST + CGST)</span>
        </div>
        <div style="display: flex; justify-content: space-between; font-size: 10.5px; margin-bottom: 3px;">
          <span style="color: #64748b;">Payment terms:</span>
          <span style="font-weight: 700; color: #0f172a;">${po.paymentTerms || 'net 30'}</span>
        </div>
        <div style="display: flex; justify-content: space-between; font-size: 10.5px;">
          <span style="color: #64748b;">Status:</span>
          <span style="font-weight: 800; color: ${po.status === 'FULLY_RECEIVED' || po.status === 'APPROVED' ? '#16a34a' : '#d97706'}; text-transform: capitalize;">${po.status || 'Pending'}</span>
        </div>
      </div>
    </div>

    <!-- Items Table -->
    <table class="print-table" style="width: 100%; border-collapse: collapse; margin-bottom: 12px;">
      <thead>
        <tr style="background: #181f2c; color: #ffffff; font-size: 10px;">
          <th style="padding: 6px 4px; text-align: center; width: 26px;">#</th>
          <th style="padding: 6px 8px; text-align: left;">DESCRIPTION</th>
          <th style="padding: 6px 4px; text-align: center;">HSN</th>
          <th style="padding: 6px 6px; text-align: right;">QTY</th>
          <th style="padding: 6px 6px; text-align: right;">RATE</th>
          <th style="padding: 6px 6px; text-align: right;">TAXABLE</th>
          <th style="padding: 6px 4px; text-align: center;">GST %</th>
          <th style="padding: 6px 6px; text-align: right;">SGST</th>
          <th style="padding: 6px 6px; text-align: right;">CGST</th>
          <th style="padding: 6px 8px; text-align: right;">AMOUNT</th>
        </tr>
      </thead>
      <tbody>
        ${rowsHtml}
        <tr style="border-top: 2px solid #181f2c; font-weight: 800; background: #f8fafc; font-size: 10.5px;">
          <td colspan="3" style="padding: 6px 8px;">Total</td>
          <td style="padding: 6px 6px; text-align: right;">${formatQty(totalQty)}</td>
          <td colspan="5"></td>
          <td style="padding: 6px 8px; text-align: right;">Rs ${formatDecimal(grandTotal)}</td>
        </tr>
      </tbody>
    </table>

    <!-- Bottom Section: Amount in words & Notes (Left), Totals Breakdown (Right) -->
    <div style="display: flex; justify-content: space-between; gap: 16px; margin-top: 10px;">
      <div style="flex: 1; border: 1px solid #cbd5e1; border-radius: 4px; padding: 10px 12px; background: #ffffff;">
        <div style="font-size: 10px; font-weight: 800; color: #64748b; text-transform: uppercase;">AMOUNT IN WORDS</div>
        <div style="font-size: 11px; font-weight: 700; color: #0f172a; margin-top: 4px; margin-bottom: 12px;">
          ${words}
        </div>
        <div style="font-size: 10px; font-weight: 800; color: #64748b; text-transform: uppercase;">NOTES:</div>
        <div style="font-size: 10.5px; color: #475569; margin-top: 4px;">
          ${po.notes || `Sample note for ${po.poCode || 'PO-0003'}`}
        </div>
      </div>

      <div style="width: 250px;">
        <table style="width: 100%; border-collapse: collapse; font-size: 11px;">
          <tr>
            <td style="padding: 3px 0; color: #64748b;">Subtotal</td>
            <td style="padding: 3px 0; text-align: right; font-weight: 600;">Rs ${formatDecimal(subtotal)}</td>
          </tr>
          <tr>
            <td style="padding: 3px 0; color: #64748b;">SGST (9%)</td>
            <td style="padding: 3px 0; text-align: right; font-weight: 600;">Rs ${formatDecimal(halfTax)}</td>
          </tr>
          <tr>
            <td style="padding: 3px 0; color: #64748b;">CGST (9%)</td>
            <td style="padding: 3px 0; text-align: right; font-weight: 600;">Rs ${formatDecimal(halfTax)}</td>
          </tr>
          <tr style="border-top: 1px solid #0f172a; border-bottom: 1px solid #0f172a; font-weight: 800;">
            <td style="padding: 5px 0; font-size: 12px; color: #0f172a;">Total</td>
            <td style="padding: 5px 0; text-align: right; font-size: 12px;">Rs ${formatDecimal(grandTotal)}</td>
          </tr>
          <tr>
            <td style="padding: 4px 0; color: #64748b;">Paid</td>
            <td style="padding: 4px 0; text-align: right; font-weight: 600; color: #16a34a;">Rs ${formatDecimal(paidAmount)}</td>
          </tr>
          <tr style="font-weight: 800;">
            <td style="padding: 4px 0; color: #dc2626; font-size: 12px;">Balance Due</td>
            <td style="padding: 4px 0; text-align: right; color: #dc2626; font-size: 12px;">Rs ${formatDecimal(balanceDue)}</td>
          </tr>
        </table>
      </div>
    </div>

    <!-- Signatures -->
    <div style="display: flex; justify-content: space-between; margin-top: 40px; padding: 0 16px;">
      <div style="text-align: center; width: 180px;">
        <div style="border-top: 1px solid #94a3b8; padding-top: 4px; font-size: 10.5px; color: #475569;">
          Authorized Supplier Signature
        </div>
      </div>
      <div style="text-align: center; width: 230px;">
        <div style="border-top: 1px solid #94a3b8; padding-top: 4px; font-size: 10.5px; font-weight: 700; color: #0f172a;">
          for Pakistan Wire Industries (Pvt.) LTD
        </div>
      </div>
    </div>

    <!-- Footer Disclaimer -->
    <div style="text-align: center; margin-top: 24px; font-size: 9.5px; color: #94a3b8;">
      This is a computer-generated Purchase Order. Supplies are subject to terms and inspection.
    </div>
  `;

  printHtmlContent(`Purchase Order - ${po.poCode || 'Print'}`, bodyHtml);
}

// 2. SALES ORDER PRINT
export function printSalesOrderDocument(order: any): void {
  if (!order) return;
  const items = order.items || order.lines || [];
  const custName = order.customer?.companyName || order.customer?.name || order.companyName || 'Valued Customer';
  const custCode = order.customer?.customerCode || 'N/A';

  const rowsHtml = items.map((it: any, idx: number) => {
    const pName = it.item?.name || it.description || it.productName || 'Order Product';
    const qty = it.quantity || it.orderedQuantity || 0;
    const rate = it.unitPrice || 0;
    const total = it.lineTotal || (qty * rate);

    return `
      <tr>
        <td style="text-align: center; width: 32px;">${idx + 1}</td>
        <td><strong>${pName}</strong></td>
        <td style="text-align: right;">${formatQty(qty)}</td>
        <td style="text-align: right;">${formatDecimal(rate)}</td>
        <td style="text-align: right; font-weight: 700;">${formatDecimal(total)}</td>
      </tr>
    `;
  }).join('');

  const bodyHtml = `
    <div class="company-header">
      <div class="company-logo-info">
        <img class="company-logo" src="${getLogoUrl()}" alt="Logo" onerror="this.style.display='none'" />
        <div>
          <div class="company-name">Pakistan Wire Industries (Pvt.) LTD</div>
          <div class="company-sub">Industrial Wire & Fastener Manufacturers | Lahore, Pakistan</div>
          <div class="company-tax">Tel: +92 42 35889900 | sales@pwi.com.pk</div>
        </div>
      </div>
      <div class="doc-badge-box">
        <div class="doc-badge">SALES ORDER CONFIRMATION</div>
        <div class="doc-badge-sub">OFFICIAL SOC</div>
      </div>
    </div>

    <div class="info-grid">
      <div class="info-card">
        <div class="info-card-title">ORDER DETAILS</div>
        <div class="info-row"><span class="info-label">Order #:</span><span class="info-val">${order.orderNumber || '-'}</span></div>
        <div class="info-row"><span class="info-label">Order Date:</span><span class="info-val">${order.orderDate || '-'}</span></div>
        <div class="info-row"><span class="info-label">Expected Delivery:</span><span class="info-val">${order.deliveryDate || '-'}</span></div>
        <div class="info-row"><span class="info-label">Status:</span><span class="info-val" style="text-transform: uppercase;">${order.status || 'Draft'}</span></div>
      </div>
      <div class="info-card">
        <div class="info-card-title">CUSTOMER DETAILS</div>
        <div class="info-row"><span class="info-label">Customer Name:</span><span class="info-val">${custName}</span></div>
        <div class="info-row"><span class="info-label">Customer Code:</span><span class="info-val">${custCode}</span></div>
        <div class="info-row"><span class="info-label">Phone:</span><span class="info-val">${order.customer?.phone || '-'}</span></div>
      </div>
    </div>

    <table class="print-table">
      <thead>
        <tr>
          <th>#</th>
          <th>Product Description</th>
          <th>Quantity</th>
          <th>Unit Price (PKR)</th>
          <th>Line Total (PKR)</th>
        </tr>
      </thead>
      <tbody>
        ${rowsHtml || '<tr><td colspan="5" style="text-align: center; padding: 16px;">No line items</td></tr>'}
      </tbody>
    </table>

    <div class="totals-wrap">
      <table class="totals-table">
        <tr>
          <td class="total-label">Subtotal:</td>
          <td class="total-val">Rs ${formatDecimal(order.subtotal || 0)}</td>
        </tr>
        <tr>
          <td class="total-label">Sales Tax:</td>
          <td class="total-val">Rs ${formatDecimal(order.taxAmount || 0)}</td>
        </tr>
        <tr class="grand-total">
          <td class="total-label">Total Amount:</td>
          <td class="total-val">Rs ${formatDecimal(order.totalAmount || 0)}</td>
        </tr>
      </table>
    </div>

    <div class="signatures">
      <div class="sig-box">Sales Executive</div>
      <div class="sig-box">Production Head</div>
      <div class="sig-box">Authorized Signature</div>
    </div>
  `;

  printHtmlContent(`Sales Order - ${order.orderNumber || 'Print'}`, bodyHtml);
}

// 3. SALES DELIVERY NOTE / CHALLAN PRINT
export function printDeliveryNoteDocument(delivery: any): void {
  if (!delivery) return;
  const items = delivery.items || delivery.lines || [];
  const custName = delivery.customer?.companyName || delivery.customer?.name || 'Valued Customer';
  const divisionName = String(delivery.divisionName || delivery.division?.name || 'Spoke Division')
    .replace(/\s*\(DIV-[^)]+\)$/i, '')
    .trim() || 'Spoke Division';

  const isMeterUom = (u?: string | null) =>
    ['M', 'MTR', 'METER', 'METRE', 'METERS', 'METRES'].includes(String(u || '').toUpperCase().trim());

  const dedupeTokens = (rawList: Array<string | null | undefined>): string[] => {
    const seen = new Set<string>();
    const out: string[] = [];
    rawList.forEach((raw) => {
      if (!raw) return;
      String(raw)
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s && s !== '-')
        .forEach((token) => {
          const key = token.toUpperCase();
          if (!seen.has(key)) {
            seen.add(key);
            out.push(token);
          }
        });
    });
    return out;
  };

  const uniqueSocs = dedupeTokens([
    delivery.salesOrder?.orderNumber,
    delivery.salesOrderNumber,
    ...items.map((it: any) => {
      const descMatch = String(it.description || it.itemName || '').match(/\[SOC:\s*([^\]]+)\]/i);
      return [it.socNumber, it.salesOrderNumber, it.salesOrder?.orderNumber, descMatch?.[1]]
        .filter(Boolean)
        .join(',');
    }),
  ]);
  const originatingSoc = uniqueSocs.length > 0 ? uniqueSocs.join(', ') : '-';

  const uomTotals: Record<string, number> = {};
  const pkgTotals: Record<string, number> = {};
  let totalCartons = 0;
  let totalPackets = 0;

  const rowsHtml = items.map((it: any, idx: number) => {
    const code = it.itemCode || it.item?.itemCode || `SKU-${idx + 1}`;
    const rawName = it.itemName || it.item?.name || it.description || 'Delivered Product';
    const cleanName = String(rawName).replace(/\s*\[SOC:\s*[^\]]+\]/gi, '').trim();
    const qty = Number(it.quantity || it.deliveredQuantity || 0);
    const uom = it.uom?.code || it.uomCode || 'Units';
    const uomUpper = String(uom).toUpperCase().trim();
    uomTotals[uom] = (uomTotals[uom] || 0) + qty;

    const finWpm = it.finishedWeightPerMeter ?? it.item?.finishedWeightPerMeter;
    const rawWpm = it.weightPerMeter ?? it.item?.weightPerMeter;
    const effectiveWpm = isMeterUom(uom)
      ? ((finWpm != null && Number(finWpm) > 0) ? Number(finWpm) : ((rawWpm != null && Number(rawWpm) > 0) ? Number(rawWpm) : 0))
      : 0;
    const meterWeightKg = it.totalWeightKg != null && isMeterUom(uom)
      ? Number(it.totalWeightKg)
      : (effectiveWpm > 0 ? Number((qty * effectiveWpm).toFixed(3)) : 0);

    const rawPkgUnit = String(it.packagingUnit || it.item?.packagingUnit || '').trim();
    const pkgSize = Number(it.packagingSize || it.item?.packagingSize || 0);
    const isCartonPkg = /^(ctn|carton|cartons)$/i.test(rawPkgUnit) || (!rawPkgUnit && (uomUpper === 'GRS' || uomUpper === 'GROSS'));
    let cartons = 0;
    if (isCartonPkg) {
      const explicitPkgQty = it.packageQuantity != null ? Number(it.packageQuantity) : null;
      if (explicitPkgQty != null && explicitPkgQty > 0) {
        cartons = explicitPkgQty;
      } else if (uomUpper === 'GRS' || uomUpper === 'GROSS') {
        cartons = Number((qty / (pkgSize > 1 ? pkgSize : 10)).toFixed(2));
      } else if (uomUpper === 'PCS' || uomUpper === 'PC') {
        cartons = Number((qty / 1440).toFixed(2));
      }
    }
    const packets = cartons > 0 ? Math.round(cartons * 40) : 0;
    if (cartons > 0) {
      totalCartons += cartons;
      totalPackets += packets;
      pkgTotals['Carton'] = (pkgTotals['Carton'] || 0) + cartons;
    } else if (it.packageQuantity != null && Number(it.packageQuantity) > 0) {
      const unitLabel = rawPkgUnit || 'Packages';
      pkgTotals[unitLabel] = (pkgTotals[unitLabel] || 0) + Number(it.packageQuantity);
    }

    const pkgCellHtml = cartons > 0
      ? `<div style="font-weight: 700; color: #0f172a;">${formatQty(cartons)} Carton</div>
         <div style="font-size: 10px; font-weight: 700; color: #0369a1; margin-top: 2px;">${formatQty(packets)} Packets</div>`
      : `<div>${it.packaging || (it.packageQuantity ? `${formatQty(Number(it.packageQuantity))} ${rawPkgUnit || 'Coils'}` : 'Standard')}</div>`;

    return `
      <tr>
        <td style="text-align: center; width: 32px; vertical-align: top;">${idx + 1}</td>
        <td style="vertical-align: top;">
          <div style="margin-bottom: 3px;">
            <span style="color: #EA580C; background: #FFF7ED; border: 1px solid #FED7AA; border-radius: 4px; padding: 1px 6px; font-size: 10px; font-weight: 700; white-space: nowrap; display: inline-block; font-family: monospace;">${code}</span>
          </div>
          ${renderItemNameHtml(cleanName, 'font-size: 11.5px; font-weight: 700; color: #0f172a; line-height: 1.35;')}
        </td>
        <td style="text-align: right; font-weight: 700; white-space: nowrap; vertical-align: top;">
          ${formatQty(qty)} ${uom}
          ${meterWeightKg > 0 ? `<div style="font-size: 10px; color: #0369a1; font-weight: 700;">Wt: ${formatQty(meterWeightKg)} Kg</div>` : ''}
        </td>
        <td style="text-align: center; vertical-align: top; background: #fafafa;">
          ${pkgCellHtml}
        </td>
        <td style="vertical-align: top;">${it.remarks || 'Standard Dispatch'}</td>
      </tr>
    `;
  }).join('');

  const totalQtyStr = Object.entries(uomTotals).map(([u, q]) => `${formatQty(q)} ${u}`).join(' + ') || '0 Units';
  const totalPkgStr = Object.keys(pkgTotals).length > 0
    ? Object.entries(pkgTotals).map(([u, q]) => `${formatQty(q)} ${u}`).join(', ')
    : 'Standard Packages';

  const bodyHtml = `
    <div class="company-header">
      <div class="company-logo-info">
        <img class="company-logo" src="${getLogoUrl()}" alt="Logo" onerror="this.style.display='none'" />
        <div>
          <div class="company-name">Pakistan Wire Industries (Pvt.) LTD</div>
          <div class="company-sub">Plot 179, Block E, SITE Superhighway, Karachi, Pakistan</div>
          <div class="company-tax">Dispatch &amp; Logistics Department | Division: ${divisionName}</div>
        </div>
      </div>
      <div class="doc-badge-box">
        <div class="doc-badge">DELIVERY CHALLAN</div>
        <div class="doc-badge-sub">${delivery.gatePassNumber ? `GATE PASS #: ${delivery.gatePassNumber}` : 'DISPATCH NOTE / GATE PASS'}</div>
      </div>
    </div>

    <div class="info-grid">
      <div class="info-card">
        <div class="info-card-title">DISPATCH DETAILS</div>
        <div class="info-row"><span class="info-label">Delivery Note #:</span><span class="info-val">${delivery.deliveryNumber || '-'}</span></div>
        ${delivery.gatePassNumber ? `<div class="info-row"><span class="info-label">Gate Pass # (Book):</span><span class="info-val" style="font-family: monospace; font-weight: 800; color: #1d4ed8;">${delivery.gatePassNumber}</span></div>` : ''}
        <div class="info-row"><span class="info-label">Dispatch Date:</span><span class="info-val">${delivery.deliveryDate || '-'}</span></div>
        <div class="info-row"><span class="info-label">Originating SO #:</span><span class="info-val font-bold" style="color: #1d4ed8;">${originatingSoc}</span></div>
        <div class="info-row"><span class="info-label">Carrier / Vehicle #:</span><span class="info-val">${delivery.carrier || delivery.vehicleNumber || 'Company Transport'}</span></div>
      </div>
      <div class="info-card">
        <div class="info-card-title">DESTINATION (CONSIGNEE)</div>
        <div class="info-row"><span class="info-label">Customer Name:</span><span class="info-val">${custName}</span></div>
        <div class="info-row"><span class="info-label">Shipping Address:</span><span class="info-val">${delivery.shippingAddress || delivery.destination || 'Customer Warehouse'}</span></div>
        <div class="info-row"><span class="info-label">Receiver Contact:</span><span class="info-val">${delivery.contactPhone || '-'}</span></div>
      </div>
    </div>

    <table class="print-table">
      <thead>
        <tr>
          <th style="width: 32px; text-align: center;">#</th>
          <th>MATERIAL / PRODUCT DESCRIPTION</th>
          <th style="width: 115px; text-align: right;">Dispatched Quantity</th>
          <th style="width: 155px; text-align: center;">PACKAGING (CARTONS / PACKETS)</th>
          <th>Notes / Condition</th>
        </tr>
      </thead>
      <tbody>
        ${rowsHtml || '<tr><td colspan="5" style="text-align: center; padding: 16px;">No delivery lines</td></tr>'}
      </tbody>
      <tfoot>
        <tr style="background: #f8fafc; border-top: 2px solid #0f172a; border-bottom: 2px solid #0f172a;">
          <td colspan="2" style="text-align: right; font-weight: 800; font-size: 12px; padding: 8px 10px;">TOTAL DISPATCHED:</td>
          <td style="text-align: right; font-weight: 800; font-size: 12.5px; padding: 8px 10px; background: #ffffff; border: 2px solid #0f172a;">${totalQtyStr}</td>
          <td style="text-align: center; font-weight: 800; font-size: 12.5px; padding: 8px 10px; background: #ffffff; border: 2px solid #0f172a;">
            <div>${totalPkgStr}</div>
            ${totalPackets > 0 ? `<div style="font-size: 10.5px; font-weight: 700; color: #0369a1; margin-top: 2px;">${formatQty(totalPackets)} Packets</div>` : ''}
          </td>
          <td style="text-align: center; font-size: 10px; color: #64748b; font-weight: 600;">Dispatched</td>
        </tr>
      </tfoot>
    </table>

    <div class="signatures">
      <div class="sig-box">Prepared By (Dispatch)<br/><small style="color: #64748b;">(Sales / Dispatch Desk)</small></div>
      <div class="sig-box">Store / Warehouse Incharge<br/><small style="color: #64748b;">(Material Count Verified)</small></div>
      <div class="sig-box">Gate Security Officer<br/><small style="color: #64748b;">(Exit Stamp &amp; Receiver Handover)</small></div>
    </div>
  `;

  printHtmlContent(`Delivery Challan - ${delivery.deliveryNumber || 'Print'}`, bodyHtml);
}

// 3B. OFFICIAL SECURITY GATE PASS (INWARD / OUTWARD)
export function printGatePassDocument(data: {
  passType?: 'INWARD' | 'OUTWARD';
  gatePassNo?: string;
  referenceNo?: string;
  customerPo?: string;
  socNumber?: string;
  dispatchSequence?: string;
  dispatchSequences?: Array<{
    socNumber: string;
    dispatchOrdinal: number;
    dispatchLabel?: string;
    totalSocDispatches?: number;
    isFinalDispatch?: boolean;
  }>;
  date?: string;
  time?: string;
  partyName?: string;
  divisionName?: string;
  vehicleNumber?: string;
  driverName?: string;
  driverCnic?: string;
  transporter?: string;
  remarks?: string;
  items?: Array<{
    itemCode?: string;
    itemName?: string;
    socNumber?: string;
    salesOrderNumber?: string;
    description?: string;
    customerPo?: string;
    orderQuantity?: number;
    quantity?: number;
    balanceQuantity?: number;
    dispatchOrdinal?: number;
    dispatchLabel?: string;
    totalSocDispatches?: number;
    isFinalDispatch?: boolean;
    uom?: string;
    uomCode?: string;
    packageQuantity?: number;
    packagingUnit?: string;
    packagingSize?: number;
    packaging?: string;
    weightKg?: number;
    weightPerMeter?: number;
    remarks?: string;
  }>;
}): void {
  if (!data) return;
  const isOutward = data.passType === 'OUTWARD';
  const passTitle = isOutward ? 'OUTWARD GATE PASS' : 'INWARD GATE PASS';
  const passNo = data.gatePassNo || `GP-${isOutward ? 'OUT' : 'IN'}-${Date.now().toString().slice(-6)}`;
  const items = data.items || [];
  const divisionDisplay = String(data.divisionName || 'Spoke Division')
    .replace(/\s*\(DIV-[^)]+\)$/i, '')
    .trim() || 'Spoke Division';

  const formatOrdinalDispatch = (n: number): string => {
    const safe = Math.max(1, Math.round(n));
    const mod100 = safe % 100;
    if (mod100 >= 11 && mod100 <= 13) return `${safe}th Dispatch`;
    switch (safe % 10) {
      case 1: return `${safe}st Dispatch`;
      case 2: return `${safe}nd Dispatch`;
      case 3: return `${safe}rd Dispatch`;
      default: return `${safe}th Dispatch`;
    }
  };

  const dedupeTokens = (rawList: Array<string | null | undefined>): string[] => {
    const seen = new Set<string>();
    const out: string[] = [];
    rawList.forEach((raw) => {
      if (!raw) return;
      String(raw)
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s && s !== '-')
        .forEach((token) => {
          const key = token.toUpperCase();
          if (!seen.has(key)) {
            seen.add(key);
            out.push(token);
          }
        });
    });
    return out;
  };

  const normalizePkgUnit = (unit?: string | null): string => {
    const raw = String(unit || '').trim();
    if (!raw) return 'Carton';
    if (/^(ctn|carton|cartons)$/i.test(raw)) return 'Carton';
    return raw;
  };

  // Group and sum totals by UOM, Packaging, and Packets (1 Carton = 40 Packets)
  const uomTotals: Record<string, number> = {};
  let totalPackageCount = 0;
  let totalCartons = 0;
  let totalPackets = 0;
  let totalMeterWeightKg = 0;
  const pkgSummary: Record<string, number> = {};

  items.forEach((it: any) => {
    const qty = Number(it.quantity || it.receivedQuantity || it.deliveredQuantity || 0);
    const uom = it.uom || it.uomCode || 'Units';
    const uomUpper = String(uom).toUpperCase().trim();
    uomTotals[uom] = (uomTotals[uom] || 0) + qty;
    if (it.weightKg != null && Number(it.weightKg) > 0) {
      totalMeterWeightKg += Number(it.weightKg);
    }

    const rawPkgUnit = String(it.packagingUnit || '').trim();
    const isCartonLike =
      /^(ctn|carton|cartons)$/i.test(rawPkgUnit) ||
      (!rawPkgUnit && (uomUpper === 'GRS' || uomUpper === 'GROSS'));

    let rowPkgQty = Number(it.packageQuantity || 0);
    if (rowPkgQty <= 0 && isCartonLike && qty > 0) {
      const pkgSize = Number(it.packagingSize || 0);
      if (uomUpper === 'GRS' || uomUpper === 'GROSS') {
        rowPkgQty = Number((qty / (pkgSize > 1 ? pkgSize : 10)).toFixed(2));
      } else if (uomUpper === 'PCS' || uomUpper === 'PC') {
        rowPkgQty = Number((qty / 1440).toFixed(2));
      }
    }

    if (rowPkgQty > 0) {
      const pkgUnit = isCartonLike ? 'Carton' : normalizePkgUnit(rawPkgUnit || 'Coils / Pkgs');
      totalPackageCount += rowPkgQty;
      pkgSummary[pkgUnit] = (pkgSummary[pkgUnit] || 0) + rowPkgQty;
      if (isCartonLike) {
        totalCartons += rowPkgQty;
        totalPackets += Math.round(rowPkgQty * 40);
      }
    }
  });

  const physicalQtyTotalStr = Object.entries(uomTotals)
    .map(([uom, q]) => `${formatQty(q)} ${uom}`)
    .join(' + ') || '0 Units';

  const packagingTotalStr = Object.keys(pkgSummary).length > 0
    ? Object.entries(pkgSummary).map(([unit, q]) => `${formatQty(q)} ${unit}`).join(', ')
    : (totalPackageCount > 0 ? `${formatQty(totalPackageCount)} Packages` : 'Standard Packages');

  // Find unique SOCs and POs across line items and header without ever repeating duplicates
  const lineSocTokens = items.map((i: any) => {
    const descMatch = String(i.description || i.itemName || '').match(/\[SOC:\s*([^\]]+)\]/i);
    return [i.socNumber, i.salesOrderNumber, descMatch?.[1]].filter(Boolean).join(',');
  });
  const uniqueSocs = dedupeTokens([...lineSocTokens, data.socNumber]);
  const uniquePos = dedupeTokens([...items.map((i: any) => i.customerPo), data.customerPo]);

  const effectiveSoc = uniqueSocs.length > 0 ? uniqueSocs.join(', ') : '-';
  const effectivePo = uniquePos.length > 0 ? uniquePos.join(', ') : '-';

  // QR Code payload: points to verification / gate pass lookup
  const originUrl = typeof window !== 'undefined' && window.location?.origin ? window.location.origin : '';
  const qrPayload = `${originUrl}/barcode-management/scan?code=${encodeURIComponent(passNo)}`;

  const rowsHtml = items.map((it: any, idx: number) => {
    const rawName = it.itemName || it.item?.name || it.description || 'Material / Item';
    const cleanName = String(rawName)
      .replace(/\s*\[SOC:\s*[^\]]+\]/gi, '')
      .replace(/\s*\(\d+(?:\.\d+)?\s*(?:CTN|Carton)[^)]*\)/gi, '')
      .trim();
    const code = it.itemCode || it.item?.itemCode || `SKU-${idx + 1}`;
    const qty = Number(it.quantity || it.receivedQuantity || it.deliveredQuantity || 0);
    const uom = it.uom || it.uomCode || 'Units';
    const uomUpper = String(uom).toUpperCase().trim();
    const rem = it.remarks || '-';

    const descSocMatch = String(it.description || rawName || '').match(/\[SOC:\s*([^\]]+)\]/i);
    const rowSocs = dedupeTokens([it.socNumber, it.salesOrderNumber, descSocMatch?.[1]]);
    const rowSoc = rowSocs.length > 0 ? rowSocs.join(', ') : (effectiveSoc !== '-' ? effectiveSoc : '-');

    const orderQty = it.orderQuantity != null ? Number(it.orderQuantity) : null;
    const balanceQty = it.balanceQuantity != null ? Number(it.balanceQuantity) : (orderQty != null ? Math.max(0, orderQty - qty) : null);

    const rawPkgUnit = String(it.packagingUnit || '').trim();
    const isCartonLike =
      /^(ctn|carton|cartons)$/i.test(rawPkgUnit) ||
      (!rawPkgUnit && (uomUpper === 'GRS' || uomUpper === 'GROSS'));

    let cartonsCount = Number(it.packageQuantity || 0);
    if (cartonsCount <= 0 && isCartonLike && qty > 0) {
      const pkgSize = Number(it.packagingSize || 0);
      if (uomUpper === 'GRS' || uomUpper === 'GROSS') {
        cartonsCount = Number((qty / (pkgSize > 1 ? pkgSize : 10)).toFixed(2));
      } else if (uomUpper === 'PCS' || uomUpper === 'PC') {
        cartonsCount = Number((qty / 1440).toFixed(2));
      }
    }
    const packetsCount = isCartonLike && cartonsCount > 0 ? Math.round(cartonsCount * 40) : 0;

    const pkgCellHtml = isCartonLike && cartonsCount > 0
      ? `<div style="font-weight: 700; color: #0f172a; white-space: nowrap;">${formatQty(cartonsCount)} Carton</div>
         <div style="font-size: 10px; font-weight: 700; color: #0369a1; margin-top: 2px; white-space: nowrap;">${formatQty(packetsCount)} Packets</div>`
      : `<div>${it.packaging || (cartonsCount > 0 ? `${formatQty(cartonsCount)} ${normalizePkgUnit(rawPkgUnit || 'Coils')}` : 'Pallets / Bundles')}</div>`;

    const seqFromHeader = (Array.isArray(data.dispatchSequences) ? data.dispatchSequences : []).find(
      (s) => s.socNumber && s.socNumber.toUpperCase() === String(rowSoc || '').toUpperCase(),
    );
    const rowOrdinal = it.dispatchOrdinal != null
      ? Number(it.dispatchOrdinal)
      : (seqFromHeader?.dispatchOrdinal != null ? Number(seqFromHeader.dispatchOrdinal) : undefined);
    const rowDispatchLabel = it.dispatchLabel
      || seqFromHeader?.dispatchLabel
      || (rowOrdinal != null ? formatOrdinalDispatch(rowOrdinal) : undefined);
    const isFinalRow = it.isFinalDispatch !== undefined
      ? Boolean(it.isFinalDispatch)
      : (balanceQty != null ? balanceQty <= 0 : false);
    const remarkClean = rem && rem !== '-' ? rem : '';

    return `
      <tr>
        <td style="text-align: center; vertical-align: top; padding-left: 2px; padding-right: 2px;">${idx + 1}</td>
        <td style="text-align: left; vertical-align: top; overflow: hidden;">
          <div style="display: flex; align-items: center; gap: 4px; flex-wrap: nowrap; white-space: nowrap;">
            <span style="font-size: 11px; font-weight: 800; color: #1d4ed8; background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 4px; padding: 2px 6px; display: inline-block; white-space: nowrap;">
              ${rowSoc}
            </span>
            ${it.customerPo ? `<span style="font-size: 9px; color: #92400e; background: #fef3c7; border: 1px solid #fde68a; border-radius: 3px; font-weight: 700; padding: 1px 4px; display: inline-block; white-space: nowrap;">PO: ${it.customerPo}</span>` : ''}
          </div>
          ${orderQty != null ? `
            <div style="margin-top: 4px; font-size: 11px; line-height: 1.45; color: #334155;">
              <div style="white-space: nowrap;">Order Qty: <strong style="color: #0f172a;">${formatQty(orderQty)} ${uom}</strong></div>
              <div style="white-space: nowrap;">This Gate Pass: <strong style="color: #16a34a;">${formatQty(qty)} ${uom}</strong></div>
              <div style="white-space: nowrap;">Remaining Balance: <strong style="color: ${balanceQty && balanceQty > 0 ? '#ea580c' : '#16a34a'};">${formatQty(balanceQty ?? 0)} ${uom}</strong></div>
            </div>
          ` : ''}
        </td>
        <td style="vertical-align: top; text-align: left;">
          <div style="margin-bottom: 3px;">
            <span style="color: #EA580C; background: #FFF7ED; border: 1px solid #FED7AA; border-radius: 4px; padding: 1px 6px; font-size: 10px; font-weight: 700; white-space: nowrap; display: inline-block; font-family: monospace;">${code}</span>
          </div>
          ${renderItemNameHtml(cleanName, 'font-size: 12px; font-weight: 700; color: #0f172a; line-height: 1.35; word-break: normal; overflow-wrap: break-word;')}
        </td>
        <td style="text-align: center; font-weight: 700; font-size: 12px; white-space: nowrap; vertical-align: top;">
          ${formatQty(qty)} ${uom}
          ${it.weightKg != null && Number(it.weightKg) > 0 ? `<div style="font-size: 10px; color: #0369a1; font-weight: 700; margin-top: 2px;">Wt: ${formatQty(Number(it.weightKg))} Kg</div>` : ''}
        </td>
        <td style="text-align: center; font-weight: 600; vertical-align: top; background: #fafafa;">
          ${pkgCellHtml}
        </td>
        <td style="vertical-align: top; font-size: 10px; color: #475569; overflow: hidden;">
          ${rowDispatchLabel ? `
            <div style="display: flex; flex-direction: column; align-items: flex-start; gap: 3px;">
              <span style="display: inline-block; font-size: 9.5px; font-weight: 800; color: #1d4ed8; background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 4px; padding: 1px 5px; white-space: nowrap;">${rowDispatchLabel}</span>
              ${rowOrdinal != null ? `<span style="display: inline-block; font-size: 9.5px; font-weight: 800; color: #1d4ed8; background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 4px; padding: 1px 5px; white-space: nowrap;">GP #${rowOrdinal}</span>` : ''}
              <span style="display: inline-block; font-size: 9.5px; font-weight: 700; border-radius: 4px; padding: 1px 5px; white-space: nowrap; ${isFinalRow
                ? 'color: #15803d; background: #dcfce7; border: 1px solid #86efac;'
                : 'color: #b45309; background: #fef3c7; border: 1px solid #fde68a;'}">${isFinalRow ? 'Final Dispatch' : 'Partial Dispatch'}</span>
            </div>
          ` : ''}
          ${remarkClean ? `<div style="margin-top: 3px; color: #64748b;">${remarkClean}</div>` : (!rowDispatchLabel ? '-' : '')}
        </td>
      </tr>
    `;
  }).join('');

  // Build per-SOC dispatch sequence pills cleanly from explicit dispatchSequences or item metadata
  const derivedSequences = Array.isArray(data.dispatchSequences) && data.dispatchSequences.length > 0
    ? data.dispatchSequences.map((s) => ({
        socNumber: s.socNumber,
        dispatchOrdinal: s.dispatchOrdinal,
        dispatchLabel: s.dispatchLabel || formatOrdinalDispatch(s.dispatchOrdinal),
      }))
    : uniqueSocs
        .map((soc) => {
          const matchedItem = items.find((it: any) => {
            const descMatch = String(it.description || it.itemName || '').match(/\[SOC:\s*([^\]]+)\]/i);
            const s = (it.socNumber || it.salesOrderNumber || descMatch?.[1] || '').trim();
            return s.toUpperCase() === soc.toUpperCase();
          });
          if (matchedItem?.dispatchOrdinal == null && !matchedItem?.dispatchLabel) return null;
          const ord = Number(matchedItem.dispatchOrdinal || 1);
          return {
            socNumber: soc,
            dispatchOrdinal: ord,
            dispatchLabel: matchedItem.dispatchLabel || formatOrdinalDispatch(ord),
          };
        })
        .filter((x): x is { socNumber: string; dispatchOrdinal: number; dispatchLabel: string } => Boolean(x));

  const dispatchSequencePillsHtml = derivedSequences.length > 0
    ? derivedSequences
        .map(
          (s) =>
            `<span style="display: inline-block; font-size: 10px; font-weight: 800; color: #1d4ed8; background: #eff6ff; border: 1px solid #bfdbfe; padding: 1px 6px; border-radius: 4px; margin-right: 4px; margin-bottom: 2px; white-space: nowrap;">${s.socNumber}: ${s.dispatchLabel}</span>`,
        )
        .join('')
    : `<span style="display: inline-block; font-size: 10px; font-weight: 800; color: #1d4ed8; background: #eff6ff; border: 1px solid #bfdbfe; padding: 1px 6px; border-radius: 4px; white-space: nowrap;">${data.dispatchSequence || '1st Dispatch'}</span>`;

  const bodyHtml = `
    <div class="company-header">
      <div class="company-logo-info">
        <img class="company-logo" src="${getLogoUrl()}" alt="Logo" onerror="this.style.display='none'" />
        <div>
          <div class="company-name">Pakistan Wire Industries (Pvt.) LTD</div>
          <div class="company-sub">Plot 179, Block E, SITE Superhighway, Karachi, Pakistan</div>
          <div class="company-tax">Security, Weighbridge &amp; Gate Control | Division: ${divisionDisplay}</div>
        </div>
      </div>
      <div class="doc-badge-box" style="display: flex; align-items: center; gap: 12px;">
        <div style="text-align: right;">
          <div style="font-size: 15px; font-weight: 900; color: #1d4ed8; letter-spacing: 0.6px; text-transform: uppercase; white-space: nowrap; line-height: 1.2;">${passTitle}</div>
          <div style="font-size: 8.5px; font-weight: 700; color: #64748b; letter-spacing: 0.8px; margin-top: 2px;">OFFICIAL SECURITY PERMIT</div>
        </div>
        <div style="display: flex; flex-direction: column; align-items: center; background: #ffffff; padding: 3px; border: 1px solid #cbd5e1; border-radius: 4px; box-shadow: 0 1px 2px rgba(0,0,0,0.05);">
          <img src="https://api.qrserver.com/v1/create-qr-code/?size=85x85&margin=1&data=${encodeURIComponent(qrPayload)}" style="width: 65px; height: 65px; display: block;" alt="Gate Pass QR" onerror="this.style.display='none'" />
          <span style="font-size: 7.5px; color: #475569; font-weight: 800; letter-spacing: 0.5px; margin-top: 1px;">SCAN TO VERIFY</span>
        </div>
      </div>
    </div>

    <div class="info-grid">
      <div class="info-card">
        <div class="info-card-title">GATE PASS IDENTIFICATION</div>
        <div class="info-row"><span class="info-label">Gate Pass #:</span><span class="info-val font-bold" style="font-size: 12px; color: #0f172a;">${passNo}</span></div>
        <div class="info-row"><span class="info-label">Date & Time:</span><span class="info-val">${data.date || new Date().toISOString().split('T')[0]} ${data.time || new Date().toLocaleTimeString()}</span></div>
        <div class="info-row"><span class="info-label">Delivery Note Ref #:</span><span class="info-val font-bold">${data.referenceNo || '-'}</span></div>
        <div class="info-row"><span class="info-label">SOC # / Sales Order:</span><span class="info-val font-bold" style="color: #1d4ed8;">${effectiveSoc}</span></div>
        <div class="info-row"><span class="info-label">Dispatch Sequence:</span><span class="info-val">${dispatchSequencePillsHtml}</span></div>
        <div class="info-row"><span class="info-label">Movement:</span><span class="info-val font-bold" style="color: #1d4ed8;">${passTitle}</span></div>
      </div>
      <div class="info-card">
        <div class="info-card-title">VEHICLE & TRANSPORTER DETAILS</div>
        <div class="info-row"><span class="info-label">${isOutward ? 'Customer / Consignee:' : 'Supplier / Consignor:'}</span><span class="info-val font-bold" style="font-size: 12.5px; color: #1d4ed8; font-weight: 800;">${data.partyName || 'Authorized Vendor'}</span></div>
        <div class="info-row"><span class="info-label">Customer PO #:</span><span class="info-val font-bold" style="color: #b45309; background: #fef3c7; padding: 1px 6px; border-radius: 3px; display: inline-block;">${effectivePo}</span></div>
        <div class="info-row"><span class="info-label">Vehicle / Truck #:</span><span class="info-val font-bold">${data.vehicleNumber || 'Pending Entry'}</span></div>
        <div class="info-row"><span class="info-label">Driver Name & CNIC:</span><span class="info-val">${data.driverName || 'Driver on Duty'} ${data.driverCnic ? `(${data.driverCnic})` : ''}</span></div>
        <div class="info-row"><span class="info-label">Transporter / Carrier:</span><span class="info-val">${data.transporter || 'Self / Company Logistics'}</span></div>
      </div>
    </div>

    <table class="print-table" style="margin-top: 10px; table-layout: fixed; width: 100%;">
      <colgroup>
        <col style="width: 4%;" />
        <col style="width: 23%;" />
        <col style="width: 33%;" />
        <col style="width: 13%;" />
        <col style="width: 15%;" />
        <col style="width: 12%;" />
      </colgroup>
      <thead>
        <tr>
          <th style="text-align: center;">#</th>
          <th style="text-align: left;">SOC #</th>
          <th style="text-align: left;">MATERIAL / PRODUCT DESCRIPTION</th>
          <th style="text-align: center; white-space: nowrap;">Physical Qty</th>
          <th style="text-align: center;">PACKAGING (CARTONS / PACKETS)</th>
          <th style="text-align: left;">Inspection / Security Remarks</th>
        </tr>
      </thead>
      <tbody>
        ${rowsHtml || '<tr><td colspan="6" style="text-align: center; padding: 16px;">No line items specified</td></tr>'}
      </tbody>
      <tfoot>
        <tr style="background: #f8fafc; border-top: 2px solid #0f172a; border-bottom: 2px solid #0f172a;">
          <td colspan="3" style="text-align: right; font-weight: 800; font-size: 12px; padding: 8px 10px; letter-spacing: 0.5px;">
            TOTAL DISPATCHED
          </td>
          <td style="text-align: center; font-weight: 800; font-size: 12.5px; color: #0f172a; padding: 8px 4px; box-sizing: border-box; background: #ffffff; border: 2px solid #0f172a; white-space: nowrap;">
            ${physicalQtyTotalStr}
            ${totalMeterWeightKg > 0 ? `<div style="font-size: 10.5px; color: #0369a1; font-weight: 800; margin-top: 2px;">Total Wt: ${formatQty(Math.round(totalMeterWeightKg * 1000) / 1000)} Kg</div>` : ''}
          </td>
          <td style="text-align: center; font-weight: 800; font-size: 12.5px; color: #0f172a; padding: 8px 4px; box-sizing: border-box; background: #ffffff; border: 2px solid #0f172a;">
            <div style="white-space: nowrap;">${packagingTotalStr}</div>
            ${totalPackets > 0 ? `<div style="font-size: 10.5px; font-weight: 700; color: #0369a1; margin-top: 2px; white-space: nowrap;">${formatQty(totalPackets)} Packets</div>` : ''}
          </td>
          <td style="text-align: center; font-size: 10px; color: #64748b; font-weight: 600;">
            Security Verified
          </td>
        </tr>
      </tfoot>
    </table>

    <!-- ORDER FULFILLMENT & SOC PROGRESS SUMMARY CARD -->
    <div style="margin-top: 12px; border: 1px solid #cbd5e1; border-radius: 6px; padding: 8px 12px; background: #f8fafc;">
      <div style="display: flex; justify-content: space-between; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 6px; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px;">
        <span style="font-size: 11px; font-weight: 800; color: #0f172a; text-transform: uppercase;">
          SOC ORDER FULFILLMENT &amp; DISPATCH PROGRESS
        </span>
        <div style="display: flex; align-items: center; gap: 4px; flex-wrap: wrap;">
          ${dispatchSequencePillsHtml}
        </div>
      </div>
      <div style="font-size: 10.5px; color: #334155; line-height: 1.5;">
        <span><strong>Primary SOC:</strong> ${effectiveSoc}</span> &nbsp;&nbsp;|&nbsp;&nbsp;
        <span><strong>Customer PO:</strong> ${effectivePo}</span> &nbsp;&nbsp;|&nbsp;&nbsp;
        <span><strong>Total Physical Qty:</strong> ${physicalQtyTotalStr}</span> &nbsp;&nbsp;|&nbsp;&nbsp;
        ${totalMeterWeightKg > 0 ? `<span><strong>Total Weight:</strong> ${formatQty(Math.round(totalMeterWeightKg * 1000) / 1000)} Kg</span> &nbsp;&nbsp;|&nbsp;&nbsp;` : ''}
        <span><strong>Total Packaging:</strong> ${packagingTotalStr}${totalPackets > 0 ? ` (${formatQty(totalPackets)} Packets)` : ''}</span>
      </div>
    </div>

    ${data.remarks ? `<div style="margin-top: 10px; font-size: 11px; padding: 8px 12px; background: #ffffff; border: 1px solid #e2e8f0; border-left: 3px solid #3b82f6; border-radius: 4px;"><strong>Remarks:</strong> ${data.remarks}</div>` : ''}

    <div class="signatures" style="margin-top: 32px;">
      <div class="sig-box">Prepared By (Dispatch)<br/><small style="color: #64748b;">(Sales / Dispatch Desk)</small></div>
      <div class="sig-box">Store / Warehouse Incharge<br/><small style="color: #64748b;">(Material Count &amp; Loading Verified)</small></div>
      <div class="sig-box">Gate Security Officer<br/><small style="color: #64748b;">(Exit Stamp &amp; Vehicle Check)</small></div>
    </div>

    <div style="text-align: center; margin-top: 18px; font-size: 9.5px; color: #94a3b8;">
      Original Copy: Gate Security | 2nd Copy: Receiving Store / Customer | 3rd Copy: Accounts Audit
    </div>
  `;

  printHtmlContent(`${passTitle} - ${passNo}`, bodyHtml);
}

// 4. SALES RETURN PRINT
export function printSalesReturnDocument(ret: any): void {
  if (!ret) return;
  const items = ret.lines || ret.items || [];
  const custName = ret.customer?.companyName || ret.customer?.name || ret.companyName || 'Customer';

  const rowsHtml = items.map((it: any, idx: number) => {
    const pName = it.item?.name || it.itemName || it.description || 'Returned Item';
    const qty = it.quantity || 0;
    const cond = (it.condition || 'GOOD').toUpperCase();
    const rate = it.unitPrice || 0;
    const total = it.lineTotal || (qty * rate);

    return `
      <tr>
        <td style="text-align: center; width: 32px;">${idx + 1}</td>
        <td><strong>${pName}</strong></td>
        <td style="text-align: center; font-weight: 700; color: ${cond === 'GOOD' ? '#16a34a' : '#dc2626'};">${cond}</td>
        <td style="text-align: right;">${formatQty(qty)}</td>
        <td style="text-align: right;">${formatDecimal(rate)}</td>
        <td style="text-align: right; font-weight: 700;">${formatDecimal(total)}</td>
      </tr>
    `;
  }).join('');

  const bodyHtml = `
    <div class="company-header">
      <div class="company-logo-info">
        <img class="company-logo" src="${getLogoUrl()}" alt="Logo" onerror="this.style.display='none'" />
        <div>
          <div class="company-name">Pakistan Wire Industries (Pvt.) LTD</div>
          <div class="company-sub">Quality Assurance & Finished Goods Return | Lahore, Pakistan</div>
        </div>
      </div>
      <div class="doc-badge-box">
        <div class="doc-badge">SALES RETURN VOUCHER</div>
        <div class="doc-badge-sub">GOODS RETURN NOTE (GRN)</div>
      </div>
    </div>

    <div class="info-grid">
      <div class="info-card">
        <div class="info-card-title">RETURN & VOUCHER DETAILS</div>
        <div class="info-row"><span class="info-label">Return #:</span><span class="info-val">${ret.returnNumber || '-'}</span></div>
        <div class="info-row"><span class="info-label">Return Date:</span><span class="info-val">${ret.returnDate || '-'}</span></div>
        <div class="info-row"><span class="info-label">Original Invoice #:</span><span class="info-val">${ret.salesInvoice?.invoiceNo || '-'}</span></div>
        <div class="info-row"><span class="info-label">Credit Note #:</span><span class="info-val">${ret.creditNoteNumber || 'Pending Generation'}</span></div>
        <div class="info-row"><span class="info-label">Reason:</span><span class="info-val" style="color: #dc2626;">${ret.reason || '-'}</span></div>
      </div>
      <div class="info-card">
        <div class="info-card-title">CUSTOMER DETAILS</div>
        <div class="info-row"><span class="info-label">Customer Name:</span><span class="info-val">${custName}</span></div>
        <div class="info-row"><span class="info-label">Warehouse:</span><span class="info-val">${ret.warehouse?.name || 'Main FG Warehouse'}</span></div>
        <div class="info-row"><span class="info-label">Stock Status:</span><span class="info-val">${ret.stockPosted ? 'Restocked into Inventory' : 'Pending Physical Restock'}</span></div>
        <div class="info-row"><span class="info-label">Ledger Status:</span><span class="info-val">${ret.creditPosted ? 'Ledger Credited' : 'Pending Ledger Posting'}</span></div>
      </div>
    </div>

    <table class="print-table">
      <thead>
        <tr>
          <th>#</th>
          <th>Item Description</th>
          <th>Condition</th>
          <th>Returned Qty</th>
          <th>Rate (PKR)</th>
          <th>Refund Total (PKR)</th>
        </tr>
      </thead>
      <tbody>
        ${rowsHtml || '<tr><td colspan="6" style="text-align: center; padding: 16px;">No return lines</td></tr>'}
      </tbody>
    </table>

    <div class="totals-wrap">
      <table class="totals-table">
        <tr>
          <td class="total-label">Subtotal:</td>
          <td class="total-val">Rs ${formatDecimal(ret.subtotal || 0)}</td>
        </tr>
        <tr>
          <td class="total-label">Tax Adjustment:</td>
          <td class="total-val">Rs ${formatDecimal(ret.taxAmount || 0)}</td>
        </tr>
        <tr class="grand-total">
          <td class="total-label">Total Refund Value:</td>
          <td class="total-val" style="color: #dc2626;">Rs ${formatDecimal(ret.totalAmount || 0)}</td>
        </tr>
      </table>
    </div>

    <div class="signatures">
      <div class="sig-box">QA Inspector</div>
      <div class="sig-box">Store Supervisor</div>
      <div class="sig-box">Accounts In-charge</div>
    </div>
  `;

  printHtmlContent(`Sales Return - ${ret.returnNumber || 'Print'}`, bodyHtml);
}

// 5. SALES QUOTATION PRINT
export function printQuotationDocument(q: any): void {
  if (!q) return;
  const items = q.items || q.lines || [];
  const custName = q.customer?.companyName || q.customer?.name || q.companyName || 'Valued Customer';

  const rowsHtml = items.map((it: any, idx: number) => {
    const pName = it.item?.name || it.description || 'Quoted Product';
    const qty = it.quantity || 0;
    const rate = it.unitPrice || 0;
    const total = it.lineTotal || (qty * rate);

    return `
      <tr>
        <td style="text-align: center; width: 32px;">${idx + 1}</td>
        <td><strong>${pName}</strong></td>
        <td style="text-align: right;">${formatQty(qty)}</td>
        <td style="text-align: right;">${formatDecimal(rate)}</td>
        <td style="text-align: right; font-weight: 700;">${formatDecimal(total)}</td>
      </tr>
    `;
  }).join('');

  const bodyHtml = `
    <div class="company-header">
      <div class="company-logo-info">
        <img class="company-logo" src="${getLogoUrl()}" alt="Logo" onerror="this.style.display='none'" />
        <div>
          <div class="company-name">Pakistan Wire Industries (Pvt.) LTD</div>
          <div class="company-sub">Official Commercial Quotation & Technical Proposal | Lahore, Pakistan</div>
        </div>
      </div>
      <div class="doc-badge-box">
        <div class="doc-badge">SALES QUOTATION</div>
        <div class="doc-badge-sub">PRICE PROPOSAL</div>
      </div>
    </div>

    <div class="info-grid">
      <div class="info-card">
        <div class="info-card-title">QUOTATION INFO</div>
        <div class="info-row"><span class="info-label">Quotation #:</span><span class="info-val">${q.quotationNumber || '-'}</span></div>
        <div class="info-row"><span class="info-label">Date:</span><span class="info-val">${q.quotationDate || '-'}</span></div>
        <div class="info-row"><span class="info-label">Valid Until:</span><span class="info-val">${q.validUntil || '-'}</span></div>
        <div class="info-row"><span class="info-label">Payment Terms:</span><span class="info-val">${q.paymentTerms || 'Standard'}</span></div>
      </div>
      <div class="info-card">
        <div class="info-card-title">CUSTOMER INFO</div>
        <div class="info-row"><span class="info-label">Customer Name:</span><span class="info-val">${custName}</span></div>
        <div class="info-row"><span class="info-label">Status:</span><span class="info-val" style="text-transform: uppercase;">${q.status || 'Draft'}</span></div>
      </div>
    </div>

    <table class="print-table">
      <thead>
        <tr>
          <th>#</th>
          <th>Product / Specification</th>
          <th>Quantity</th>
          <th>Unit Price (PKR)</th>
          <th>Total (PKR)</th>
        </tr>
      </thead>
      <tbody>
        ${rowsHtml || '<tr><td colspan="5" style="text-align: center; padding: 16px;">No line items</td></tr>'}
      </tbody>
    </table>

    <div class="totals-wrap">
      <table class="totals-table">
        <tr>
          <td class="total-label">Subtotal:</td>
          <td class="total-val">Rs ${formatDecimal(q.subtotal || 0)}</td>
        </tr>
        <tr>
          <td class="total-label">Tax:</td>
          <td class="total-val">Rs ${formatDecimal(q.taxAmount || 0)}</td>
        </tr>
        <tr class="grand-total">
          <td class="total-label">Quotation Total:</td>
          <td class="total-val">Rs ${formatDecimal(q.totalAmount || 0)}</td>
        </tr>
      </table>
    </div>

    <div class="signatures">
      <div class="sig-box">Sales Officer</div>
      <div class="sig-box">Commercial Manager</div>
      <div class="sig-box">Client Acceptance Stamp & Signature</div>
    </div>
  `;

  printHtmlContent(`Quotation - ${q.quotationNumber || 'Print'}`, bodyHtml);
}

// 6. CLEAN TABLE LIST PRINT
export function printTableList(title: string, headers: string[], rows: (string | number)[][]): void {
  const headerHtml = headers.map(h => `<th>${h}</th>`).join('');
  const rowsHtml = rows.map((r, idx) => `
    <tr>
      <td style="text-align: center; width: 36px;">${idx + 1}</td>
      ${r.map(cell => `<td>${cell ?? '-'}</td>`).join('')}
    </tr>
  `).join('');

  const bodyHtml = `
    <div class="company-header">
      <div class="company-logo-info">
        <img class="company-logo" src="${getLogoUrl()}" alt="Logo" onerror="this.style.display='none'" />
        <div>
          <div class="company-name">Pakistan Wire Industries (Pvt.) LTD</div>
          <div class="company-sub">Enterprise Management Report | Printed on ${new Date().toLocaleDateString()}</div>
        </div>
      </div>
      <div class="doc-badge-box">
        <div class="doc-badge">${title.toUpperCase()}</div>
        <div class="doc-badge-sub">TOTAL RECORDS: ${rows.length}</div>
      </div>
    </div>

    <table class="print-table">
      <thead>
        <tr>
          <th>#</th>
          ${headerHtml}
        </tr>
      </thead>
      <tbody>
        ${rowsHtml || '<tr><td colspan="100" style="text-align: center; padding: 16px;">No records found</td></tr>'}
      </tbody>
    </table>

    <div class="footer-note">
      Printed from PWI ERP System on ${new Date().toLocaleString()}
    </div>
  `;

  printHtmlContent(title, bodyHtml);
}

// 7. CUSTOMER LEDGER STATEMENT PRINT
export function printCustomerStatementDocument(customer: any, statementData: any): void {
  if (!customer) return;
  const entries = statementData?.entries || statementData?.ledgerEntries || [];
  const custName = customer.companyName || customer.name || 'Valued Customer';
  const custCode = customer.customerCode || 'N/A';
  const currency = statementData?.currency || customer.currencyCode || 'PKR';

  const aging = statementData?.aging;
  const agingHtml = aging
    ? `
      <div style="margin: 10px 0 12px; border: 1px solid #cbd5e1; border-radius: 6px; padding: 8px 10px; background: #f8fafc;">
        <div style="font-size: 10px; font-weight: 800; color: #334155; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 6px;">
          RECEIVABLES AGING BREAKDOWN (${currency})
        </div>
        <table class="print-table" style="margin: 0;">
          <thead>
            <tr>
              <th>Current</th>
              <th>1–30 Days Overdue</th>
              <th>31–60 Days Overdue</th>
              <th>61–90 Days Overdue</th>
              <th>90+ Days Overdue</th>
              <th>Total Open</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style="text-align: right; font-weight: 700;">${formatDecimal(aging.current || 0)}</td>
              <td style="text-align: right; font-weight: 700;">${formatDecimal(aging.days1to30 || 0)}</td>
              <td style="text-align: right; font-weight: 700; color: #d97706;">${formatDecimal(aging.days31to60 || 0)}</td>
              <td style="text-align: right; font-weight: 700; color: #ea580c;">${formatDecimal(aging.days61to90 || 0)}</td>
              <td style="text-align: right; font-weight: 800; color: #dc2626;">${formatDecimal(aging.days90Plus || 0)}</td>
              <td style="text-align: right; font-weight: 800;">${formatDecimal(aging.totalOpenBalance || 0)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    `
    : '';

  const rowsHtml = entries.map((e: any, idx: number) => {
    const d = e.transactionDate || e.entryDate || e.date || e.createdAt
      ? new Date(e.transactionDate || e.entryDate || e.date || e.createdAt).toLocaleDateString()
      : '-';
    const dueStr = e.dueDate ? new Date(e.dueDate).toLocaleDateString() : '-';
    const docNo = e.documentNumber || e.voucherNo || e.reference || '-';
    const type = e.documentType || e.entryType || 'LEDGER';
    const desc = [e.reference, e.socNumber ? `SOC: ${e.socNumber}` : '', e.poReference ? `PO: ${e.poReference}` : '', e.notes]
      .filter(Boolean)
      .join(' | ') || 'Transaction';
    const debit = Number(e.debit || 0);
    const credit = Number(e.credit || 0);
    const balance = Number(e.balance ?? e.runningBalance ?? 0);
    const balSuffix = balance > 0 ? 'DR' : balance < 0 ? 'CR' : '';

    return `
      <tr>
        <td style="text-align: center; width: 32px;">${idx + 1}</td>
        <td style="white-space: nowrap;">${d}</td>
        <td style="font-weight: 600; font-family: monospace;">${docNo}</td>
        <td><span style="font-size: 9.5px; font-weight: 700; text-transform: uppercase;">${String(type).replace(/_/g, ' ')}</span></td>
        <td>${desc}</td>
        <td style="white-space: nowrap;">${dueStr}</td>
        <td style="text-align: right; color: ${debit > 0 ? '#dc2626' : 'inherit'};">${debit > 0 ? formatDecimal(debit) : '-'}</td>
        <td style="text-align: right; color: ${credit > 0 ? '#16a34a' : 'inherit'};">${credit > 0 ? formatDecimal(credit) : '-'}</td>
        <td style="text-align: right; font-weight: 700; white-space: nowrap;">${formatDecimal(Math.abs(balance))} ${balSuffix}</td>
      </tr>
    `;
  }).join('');

  const bodyHtml = `
    <div class="company-header">
      <div class="company-logo-info">
        <img class="company-logo" src="${getLogoUrl()}" alt="Logo" onerror="this.style.display='none'" />
        <div>
          <div class="company-name">Pakistan Wire Industries (Pvt.) LTD</div>
          <div class="company-sub">Plot 179, Block E, SITE Superhighway, Karachi, Pakistan</div>
          <div class="company-tax">Accounts &amp; Receivables Department | NTN: 0819234-7 | STRN: 17-00-9812-001</div>
        </div>
      </div>
      <div class="doc-badge-box">
        <div class="doc-badge">STATEMENT OF ACCOUNT</div>
        <div class="doc-badge-sub">CUSTOMER FINANCIAL LEDGER</div>
      </div>
    </div>

    <div class="info-grid">
      <div class="info-card">
        <div class="info-card-title">CUSTOMER ACCOUNT</div>
        <div class="info-row"><span class="info-label">Customer Name:</span><span class="info-val">${custName}</span></div>
        <div class="info-row"><span class="info-label">Customer Code:</span><span class="info-val">${custCode}</span></div>
        <div class="info-row"><span class="info-label">Payment Terms:</span><span class="info-val">${customer.paymentTerms || 'Standard'}</span></div>
        <div class="info-row"><span class="info-label">Phone:</span><span class="info-val">${customer.phone || '-'}</span></div>
        <div class="info-row"><span class="info-label">City / Tax ID:</span><span class="info-val">${customer.city || '-'} | NTN: ${customer.taxNumber || '-'}</span></div>
      </div>
      <div class="info-card">
        <div class="info-card-title">STATEMENT SUMMARY (${currency})</div>
        <div class="info-row"><span class="info-label">Opening Balance:</span><span class="info-val">${currency} ${formatDecimal(statementData?.openingBalance || 0)}</span></div>
        <div class="info-row"><span class="info-label">Total Debits (Invoices / Notes):</span><span class="info-val" style="color: #dc2626;">${currency} ${formatDecimal(statementData?.periodDebit || 0)}</span></div>
        <div class="info-row"><span class="info-label">Total Credits (Receipts / Returns):</span><span class="info-val" style="color: #16a34a;">${currency} ${formatDecimal(statementData?.periodCredit || 0)}</span></div>
        <div class="info-row"><span class="info-label">Unadjusted Advance Balance:</span><span class="info-val" style="color: #0284c7;">${currency} ${formatDecimal(statementData?.unadjustedAdvanceBalance || 0)}</span></div>
        <div class="info-row"><span class="info-label">Net Closing Balance:</span><span class="info-val" style="font-size: 13px; font-weight: 800; color: ${(statementData?.closingBalance || 0) >= 0 ? '#dc2626' : '#16a34a'};">${currency} ${formatDecimal(Math.abs(statementData?.closingBalance || 0))} ${(statementData?.closingBalance || 0) > 0 ? 'DR' : (statementData?.closingBalance || 0) < 0 ? 'CR' : ''}</span></div>
      </div>
    </div>

    ${agingHtml}

    <table class="print-table">
      <thead>
        <tr>
          <th>#</th>
          <th>Date</th>
          <th>Doc / Voucher #</th>
          <th>Type</th>
          <th>Reference &amp; Narration</th>
          <th>Due Date</th>
          <th>Debit (${currency})</th>
          <th>Credit (${currency})</th>
          <th>Balance (${currency})</th>
        </tr>
      </thead>
      <tbody>
        ${rowsHtml || '<tr><td colspan="9" style="text-align: center; padding: 16px;">No transactions found for this period</td></tr>'}
      </tbody>
    </table>

    <div class="totals-wrap">
      <table class="totals-table">
        <tr class="grand-total">
          <td class="total-label">Net Closing Balance:</td>
          <td class="total-val">${currency} ${formatDecimal(Math.abs(statementData?.closingBalance || 0))} ${(statementData?.closingBalance || 0) > 0 ? 'DR' : (statementData?.closingBalance || 0) < 0 ? 'CR' : ''}</td>
        </tr>
      </table>
    </div>

    <div class="signatures">
      <div class="sig-box">Accounts Officer</div>
      <div class="sig-box">Finance Manager</div>
      <div class="sig-box">Customer Acknowledgment</div>
    </div>

    <div class="footer-note">
      Generated from PWI ERP Financial Management System on ${new Date().toLocaleString()}
    </div>
  `;

  printHtmlContent(`Statement - ${custName}`, bodyHtml);
}

// 7B. OFFICIAL PAYMENT RECEIPT VOUCHER (PRV / RCV-YYYY-NNNNN)
export function printPaymentReceiptVoucher(receipt: any): void {
  if (!receipt) return;
  const currency = receipt.currency || 'PKR';
  const custName = receipt.customerName || receipt.customer?.name || receipt.customer?.companyName || 'Valued Customer';
  const custCode = receipt.customerCode || receipt.customer?.customerCode || '-';
  const receiptDate = receipt.receiptDate ? dayjs(receipt.receiptDate).format('DD MMM YYYY') : dayjs().format('DD MMM YYYY');
  const allocations = Array.isArray(receipt.allocations) ? receipt.allocations : [];
  const totalAmt = Number(receipt.amount || 0);
  const allocTotal = Number(receipt.allocatedAmount || 0);
  const advanceAmt = Number(receipt.unallocatedAdvanceAmount || Math.max(0, totalAmt - allocTotal));

  const allocRowsHtml = allocations.map((a: any, idx: number) => `
    <tr>
      <td style="text-align: center; width: 32px;">${idx + 1}</td>
      <td style="font-family: monospace; font-weight: 700; color: #1d4ed8;">${a.invoiceNo || '-'}</td>
      <td>${a.allocationDate ? dayjs(a.allocationDate).format('DD MMM YYYY') : receiptDate}</td>
      <td style="text-transform: uppercase; font-size: 10px; font-weight: 700;">${String(a.allocationType || 'DIRECT').replace(/_/g, ' ')}</td>
      <td style="text-align: right;">${formatDecimal(a.invoiceTotal || 0)}</td>
      <td style="text-align: right; font-weight: 700; color: #16a34a;">${formatDecimal(a.allocatedAmount || 0)}</td>
      <td style="text-align: right; font-weight: 700;">${formatDecimal(a.invoiceBalance ?? 0)}</td>
    </tr>
  `).join('');

  const bodyHtml = `
    <div class="company-header">
      <div class="company-logo-info">
        <img class="company-logo" src="${getLogoUrl()}" alt="Logo" onerror="this.style.display='none'" />
        <div>
          <div class="company-name">Pakistan Wire Industries (Pvt.) LTD</div>
          <div class="company-sub">Plot 179, Block E, SITE Superhighway, Karachi, Pakistan</div>
          <div class="company-tax">Accounts &amp; Receivables Department | NTN: 0819234-7 | STRN: 17-00-9812-001</div>
        </div>
      </div>
      <div class="doc-badge-box">
        <div class="doc-badge">PAYMENT RECEIPT VOUCHER</div>
        <div class="doc-badge-sub">VOUCHER #: ${receipt.receiptNumber || '-'}</div>
      </div>
    </div>

    <div class="info-grid">
      <div class="info-card">
        <div class="info-card-title">RECEIVED WITH THANKS FROM</div>
        <div class="info-row"><span class="info-label">Customer Name:</span><span class="info-val">${custName}</span></div>
        <div class="info-row"><span class="info-label">Customer Code:</span><span class="info-val" style="font-family: monospace;">${custCode}</span></div>
        <div class="info-row"><span class="info-label">Division:</span><span class="info-val">${receipt.divisionName || 'All Divisions'}</span></div>
        <div class="info-row"><span class="info-label">Phone / City:</span><span class="info-val">${receipt.customerPhone || '-'} | ${receipt.customerCity || '-'}</span></div>
        <div class="info-row"><span class="info-label">Address:</span><span class="info-val">${receipt.customerAddress || '-'}</span></div>
      </div>
      <div class="info-card">
        <div class="info-card-title">RECEIPT &amp; INSTRUMENT DETAILS</div>
        <div class="info-row"><span class="info-label">Receipt Voucher #:</span><span class="info-val" style="font-family: monospace; font-weight: 800; color: #059669;">${receipt.receiptNumber || '-'}</span></div>
        <div class="info-row"><span class="info-label">Receipt Date:</span><span class="info-val">${receiptDate}</span></div>
        <div class="info-row"><span class="info-label">Receipt Type:</span><span class="info-val">${String(receipt.receiptType || 'INVOICE_PAYMENT').replace(/_/g, ' ')}</span></div>
        <div class="info-row"><span class="info-label">Payment Mode:</span><span class="info-val">${String(receipt.paymentMode || 'BANK_TRANSFER').replace(/_/g, ' ')}</span></div>
        <div class="info-row"><span class="info-label">Deposit Account / Bank:</span><span class="info-val">${receipt.bankAccountName || receipt.bankName || 'Cash / Bank'}</span></div>
        ${receipt.chequeNumber ? `<div class="info-row"><span class="info-label">Cheque # / Date:</span><span class="info-val" style="font-family: monospace;">${receipt.chequeNumber}${receipt.chequeDate ? ` (${dayjs(receipt.chequeDate).format('DD MMM YYYY')})` : ''} — ${String(receipt.clearanceStatus || 'CLEARED').replace(/_/g, ' ')}</span></div>` : ''}
        ${receipt.socNumber || receipt.poReference ? `<div class="info-row"><span class="info-label">SOC / PO Reference:</span><span class="info-val">${[receipt.socNumber, receipt.poReference].filter(Boolean).join(' / ')}</span></div>` : ''}
        ${receipt.journalNumber ? `<div class="info-row"><span class="info-label">GL Journal #:</span><span class="info-val" style="font-family: monospace;">${receipt.journalNumber}</span></div>` : ''}
      </div>
    </div>

    <div style="margin: 10px 0 12px; border: 1.5px solid #059669; border-radius: 6px; padding: 10px 14px; background: #ecfdf5; display: flex; justify-content: space-between; align-items: center;">
      <div>
        <div style="font-size: 10px; font-weight: 800; color: #065f46; text-transform: uppercase;">TOTAL AMOUNT RECEIVED (${currency})</div>
        <div style="font-size: 11px; color: #047857; margin-top: 2px;">Status: <strong>${receipt.status || 'POSTED'}</strong>${receipt.clearanceStatus ? ` | Instrument: <strong>${String(receipt.clearanceStatus).replace(/_/g, ' ')}</strong>` : ''}</div>
      </div>
      <div style="font-size: 20px; font-weight: 900; color: #065f46;">Rs ${formatDecimal(totalAmt)}</div>
    </div>

    <table class="print-table">
      <thead>
        <tr>
          <th>#</th>
          <th>Settled Invoice #</th>
          <th>Allocation Date</th>
          <th>Allocation Type</th>
          <th>Invoice Total (${currency})</th>
          <th>Allocated (${currency})</th>
          <th>Remaining Balance (${currency})</th>
        </tr>
      </thead>
      <tbody>
        ${allocRowsHtml || `<tr><td colspan="7" style="text-align: center; padding: 14px;">Recorded as Advance / On-Account Receipt (Rs ${formatDecimal(advanceAmt)} available for future invoice adjustment)</td></tr>`}
      </tbody>
    </table>

    <div class="totals-wrap">
      <table class="totals-table">
        <tr>
          <td class="total-label">Total Settled to Invoices:</td>
          <td class="total-val">Rs ${formatDecimal(allocTotal)}</td>
        </tr>
        <tr>
          <td class="total-label">Unallocated Advance Balance:</td>
          <td class="total-val" style="color: #0284c7;">Rs ${formatDecimal(advanceAmt)}</td>
        </tr>
        <tr class="grand-total">
          <td class="total-label">Total Receipt Amount:</td>
          <td class="total-val" style="color: #059669;">Rs ${formatDecimal(totalAmt)}</td>
        </tr>
      </table>
    </div>

    ${receipt.remarks ? `
      <div style="border: 1px solid #cbd5e1; border-radius: 4px; padding: 8px 12px; margin: 10px 0; font-size: 10.5px; background: #f8fafc;">
        <strong>Remarks / Narration:</strong> ${receipt.remarks}
      </div>
    ` : ''}

    <div class="signatures">
      <div class="sig-box">Accounts Officer</div>
      <div class="sig-box">Finance Manager</div>
      <div class="sig-box">Customer / Representative Signature</div>
    </div>

    <div class="footer-note">
      Printed from PWI ERP Financial Management System on ${new Date().toLocaleString()}
    </div>
  `;

  printHtmlContent(`Payment Receipt Voucher - ${receipt.receiptNumber || 'Print'}`, bodyHtml);
}

/**
 * VISITOR SLIP (Prompt #19 §8/§10/§29).
 *
 * Deliberately thin: the layout lives in `renderVisitorSlipHtml`, which the
 * on-screen preview renders too, so the preview and the printout cannot drift
 * apart. This function only hands that markup to the project's EXISTING print
 * pipeline (`printHtmlContent` → hidden iframe → A4 `@page` → `window.print`).
 *
 * Because the document is written into a detached iframe, no ERP navigation,
 * menu, button or table chrome can reach the page — §8 comes for free from the
 * architecture already in use, not from per-element print CSS.
 *
 * `assets.photoDataUrl` / `assets.signatureDataUrl` are supplied by the caller
 * after it fetched them through the authenticated API. That is deliberate: the
 * slip never builds a URL to a private storage path, so a visitor photo or a
 * host signature is never readable from an unauthenticated address (§6, §22).
 * Both are optional — a missing image degrades to a placeholder and the slip
 * still prints (§26).
 */
export function printVisitorSlipDocument(
  slip: VisitorSlipData,
  assets: VisitorSlipAssets = {},
): void {
  if (!slip) return;
  const reference = slip.visitorReference ? ` - ${slip.visitorReference}` : '';
  printHtmlContent(
    `Visitor Slip${reference}`,
    renderVisitorSlipHtml(slip, assets, getLogoUrl()),
  );
}

/**
 * LOADING ADVICE & DISPATCH SLIP
 */
export function printLoadingAdviceSlip(delivery: any, order?: any): void {
  if (!delivery) return;

  const docNo = delivery.deliveryNumber || delivery.adviceNumber || 'DN-PENDING';
  const socNo = order?.orderNumber || delivery.salesOrderNumber || delivery.salesOrder?.orderNumber || '-';
  const customer = delivery.customer || order?.customer || {};
  const custName = customer.companyName || customer.name || order?.companyName || 'Valued Customer';
  const custCode = customer.customerCode || '';
  const custPhone = customer.phone || customer.mobile || '-';
  const address = delivery.shippingAddress || order?.shipToAddress || customer.address || 'Factory Pickup / Direct Delivery';
  const carrier = delivery.carrier || delivery.vehicleNumber || 'Pending / Self Vehicle';
  const tracking = delivery.trackingNumber || delivery.biltyNumber || '-';
  const dateStr = dayjs(delivery.deliveryDate || new Date()).format('DD-MMM-YYYY');
  const divisionName = order?.division?.name || 'Spoke Division';

  const lines = delivery.lines || delivery.items || [];
  let totalDispatchQty = 0;

  const rowsHtml = lines.map((l: any, idx: number) => {
    const itemObj = l.item || {};
    const desc = l.description || itemObj.name || `Item #${idx + 1}`;
    const code = itemObj.itemCode || l.itemCode || '-';
    const uom = l.uom?.code || l.uomCode || 'GRS';
    const dispatchQty = Number(l.quantity || 0);
    totalDispatchQty += dispatchQty;

    const ordered = Number(l.orderedQuantity || l.orderQuantity || 0);
    const remaining = Number(l.remainingQuantity ?? Math.max(0, ordered - dispatchQty));

    return `
      <tr style="border-bottom: 1px solid #e2e8f0; font-size: 11px;">
        <td style="padding: 7px 4px; text-align: center; color: #64748b;">${idx + 1}</td>
        <td style="padding: 7px 6px; font-family: monospace; font-weight: 700; color: #1e3a8a;">${code}</td>
        <td style="padding: 7px 8px; font-weight: 600; color: #0f172a;">${desc}</td>
        <td style="padding: 7px 6px; text-align: right; color: #475569;">${ordered > 0 ? formatDecimal(ordered) : '-'}</td>
        <td style="padding: 7px 8px; text-align: right; font-weight: 800; color: #059669; font-size: 12px;">${formatDecimal(dispatchQty)} ${uom}</td>
        <td style="padding: 7px 6px; text-align: right; font-weight: 700; color: #ea580c;">${ordered > 0 ? formatDecimal(remaining) : '-'}</td>
      </tr>
    `;
  }).join('');

  const html = `
    <div class="pwi-print-container" style="padding: 10px 15px; font-family: Arial, sans-serif; color: #0f172a;">
      <!-- Header -->
      <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2.5px solid #0f172a; padding-bottom: 8px; margin-bottom: 12px;">
        <div style="display: flex; align-items: center; gap: 12px;">
          <img src="${getLogoUrl()}" alt="Logo" style="height: 55px; object-fit: contain;" onerror="this.style.display='none'" />
          <div>
            <div style="font-size: 18px; font-weight: 900; letter-spacing: 0.5px; color: #0f172a;">Pakistan Wire Industries (Pvt.) LTD</div>
            <div style="font-size: 10.5px; color: #475569; font-weight: 600;">Plot 14-16, Phase II, Industrial Estate, Hattar, Pakistan</div>
            <div style="font-size: 10px; color: #64748b;">Tel: +92-995-617150 | Email: dispatch@pwi.com.pk</div>
          </div>
        </div>
        <div style="text-align: right;">
          <div style="background: #0284c7; color: #ffffff; padding: 4px 12px; border-radius: 4px; font-weight: 800; font-size: 13px; letter-spacing: 0.5px; display: inline-block;">
            LOADING ADVICE
          </div>
          <div style="font-size: 11px; font-weight: 700; color: #0f172a; margin-top: 5px;">Doc #: <span style="font-family: monospace; color: #0284c7;">${docNo}</span></div>
          <div style="font-size: 10.5px; color: #475569;">Date: <strong>${dateStr}</strong></div>
        </div>
      </div>

      <!-- Info Grid -->
      <div style="display: grid; grid-template-columns: 1.2fr 1fr; gap: 12px; margin-bottom: 14px;">
        <div style="border: 1px solid #cbd5e1; border-radius: 6px; padding: 8px 12px; background: #f8fafc;">
          <div style="font-size: 10px; font-weight: 800; color: #64748b; text-transform: uppercase; margin-bottom: 4px;">CONSIGNEE / CUSTOMER</div>
          <div style="font-size: 13px; font-weight: 800; color: #0f172a;">${custName} ${custCode ? `[${custCode}]` : ''}</div>
          <div style="font-size: 11px; color: #334155; margin-top: 3px;"><strong>Destination:</strong> ${address}</div>
          <div style="font-size: 10.5px; color: #475569; margin-top: 2px;">Contact: ${custPhone}</div>
        </div>

        <div style="border: 1px solid #cbd5e1; border-radius: 6px; padding: 8px 12px; background: #f8fafc;">
          <div style="font-size: 10px; font-weight: 800; color: #64748b; text-transform: uppercase; margin-bottom: 4px;">VEHICLE & DISPATCH</div>
          <div style="display: flex; justify-content: space-between; font-size: 11px; margin-bottom: 2px;">
            <span style="color: #64748b;">SOC Reference:</span>
            <strong style="color: #1e3a8a; font-family: monospace;">${socNo}</strong>
          </div>
          <div style="display: flex; justify-content: space-between; font-size: 11px; margin-bottom: 2px;">
            <span style="color: #64748b;">Vehicle / Transporter:</span>
            <strong style="color: #0f172a;">${carrier}</strong>
          </div>
          <div style="display: flex; justify-content: space-between; font-size: 11px; margin-bottom: 2px;">
            <span style="color: #64748b;">Bilty / Tracking #:</span>
            <strong>${tracking}</strong>
          </div>
          <div style="display: flex; justify-content: space-between; font-size: 11px;">
            <span style="color: #64748b;">Division:</span>
            <strong>${divisionName}</strong>
          </div>
        </div>
      </div>

      <!-- Line Items Table -->
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 14px;">
        <thead>
          <tr style="background: #0f172a; color: #ffffff; font-size: 10px; text-transform: uppercase; letter-spacing: 0.3px;">
            <th style="padding: 7px 4px; text-align: center; width: 30px;">#</th>
            <th style="padding: 7px 6px; text-align: left; width: 120px;">ITEM CODE</th>
            <th style="padding: 7px 8px; text-align: left;">DESCRIPTION</th>
            <th style="padding: 7px 6px; text-align: right; width: 85px;">ORDER QTY</th>
            <th style="padding: 7px 8px; text-align: right; width: 110px;">THIS DISPATCH</th>
            <th style="padding: 7px 6px; text-align: right; width: 90px;">REMAINING BAL</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml}
          <tr style="border-top: 2px solid #0f172a; background: #f1f5f9; font-weight: 800; font-size: 11px;">
            <td colspan="4" style="padding: 8px 8px; text-align: right;">TOTAL DISPATCH QUANTITY:</td>
            <td style="padding: 8px 8px; text-align: right; color: #059669; font-size: 12.5px;">${formatDecimal(totalDispatchQty)}</td>
            <td></td>
          </tr>
        </tbody>
      </table>

      <!-- Dispatch Instructions / Notes -->
      <div style="border: 1px dashed #cbd5e1; border-radius: 4px; padding: 6px 10px; margin-bottom: 30px; font-size: 10.5px; color: #475569; background: #ffffff;">
        <strong>Instructions / Remarks:</strong> ${delivery.notes || 'Please verify material count before exit. Transporter takes custody upon signature below.'}
      </div>

      <!-- Clearance Signatures -->
      <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-top: 30px;">
        <div style="text-align: center; border-top: 1.5px solid #64748b; padding-top: 4px; font-size: 10px; font-weight: 700; color: #334155;">
          <div>PREPARED BY</div>
          <div style="font-size: 9px; color: #64748b; font-weight: normal;">(Sales / Dispatch)</div>
        </div>
        <div style="text-align: center; border-top: 1.5px solid #64748b; padding-top: 4px; font-size: 10px; font-weight: 700; color: #334155;">
          <div>STORE INCHARGE</div>
          <div style="font-size: 9px; color: #64748b; font-weight: normal;">(Loaded / Verified)</div>
        </div>
        <div style="text-align: center; border-top: 1.5px solid #64748b; padding-top: 4px; font-size: 10px; font-weight: 700; color: #334155;">
          <div>GATE SECURITY</div>
          <div style="font-size: 9px; color: #64748b; font-weight: normal;">(Outward Verified)</div>
        </div>
        <div style="text-align: center; border-top: 1.5px solid #64748b; padding-top: 4px; font-size: 10px; font-weight: 700; color: #334155;">
          <div>DRIVER / TRANSPORTER</div>
          <div style="font-size: 9px; color: #64748b; font-weight: normal;">(Received in Good Order)</div>
        </div>
      </div>
    </div>
  `;

  printHtmlContent(`Loading_Advice_${docNo}`, html);
}

// 7. GOODS RECEIPT NOTE (GRN) PRINT
export function printGoodsReceiptDocument(gr: any): void {
  if (!gr) return;
  const items = gr.items || gr.lines || [];
  const supName = gr.supplier?.name || gr.supplier?.companyName || gr.supplierName || 'Valued Supplier';
  const supAddress = gr.supplier?.addressLine1 || gr.supplier?.address || gr.deliveryAddress || 'Industrial Area';
  const supPhone = gr.supplier?.phone || gr.supplier?.contactPhone || '-';
  const supNtn = gr.supplier?.taxNumber || gr.supplier?.ntn || gr.supplier?.gstin || '-';
  const whName = gr.warehouse?.name || (gr as any).warehouseName || 'Main Raw Material Warehouse';
  const poRef = gr.po?.poCode || gr.poCode || (gr.notes && typeof gr.notes === 'string' ? gr.notes.match(/PO #([A-Z0-9-]+)/)?.[1] : undefined) || '—';
  const grnNo = gr.grnNumber || '—';
  const receiptCode = gr.receiptCode || 'CGR-GRN';
  const formattedDate = gr.receiptDate ? dayjs(gr.receiptDate).format('DD/MM/YYYY') : dayjs().format('DD/MM/YYYY');

  let totalOrdered = 0;
  let totalReceived = 0;
  let totalAccepted = 0;
  let totalValue = 0;

  const rowsHtml = (items.length > 0 ? items : [
    {
      itemName: 'Industrial Received Material',
      itemCode: 'RM-MAT-001',
      quantityOrdered: 1,
      quantityReceived: 1,
      quantityAccepted: 1,
      quantityRejected: 0,
      uomCode: 'KG',
      unitPrice: 0,
      totalPrice: 0,
    }
  ]).map((it: any, idx: number) => {
    const pCode = it.item?.itemCode || it.itemCode || `SKU-00${idx + 1}`;
    const pName = it.item?.name || it.itemName || it.name || it.description || 'Received Material';
    const ordQty = Number(it.quantityOrdered || it.orderQuantity || it.quantity || 0);
    const recQty = Number(it.quantityReceived || it.quantity || 0);
    const accQty = Number(it.quantityAccepted ?? recQty);
    const rejQty = Number(it.quantityRejected || 0);
    const uom = it.uom?.code || it.uomCode || 'PCS';
    const rate = Number(it.unitPrice || it.rate || 0);
    const tot = Number(it.totalPrice || it.lineTotal || (accQty * rate));
    const remarks = it.conditionNotes || it.notes || (rejQty > 0 ? `Rejected: ${rejQty} ${uom}` : 'Inspected & Passed');

    totalOrdered += ordQty;
    totalReceived += recQty;
    totalAccepted += accQty;
    totalValue += tot;

    return `
      <tr style="border-bottom: 1px solid #e2e8f0; font-size: 10px;">
        <td style="text-align: center; padding: 6px 4px; width: 26px;">${idx + 1}</td>
        <td style="padding: 6px 8px; font-family: monospace; font-weight: 700; color: #0284c7;">${pCode}</td>
        <td style="padding: 6px 8px;"><strong>${pName}</strong></td>
        <td style="text-align: right; padding: 6px 6px;">${formatQty(ordQty)}</td>
        <td style="text-align: right; padding: 6px 6px; font-weight: 700; color: #0f172a;">${formatQty(recQty)}</td>
        <td style="text-align: right; padding: 6px 6px; color: #16a34a; font-weight: 700;">${formatQty(accQty)}</td>
        <td style="text-align: right; padding: 6px 6px; color: ${rejQty > 0 ? '#dc2626' : '#94a3b8'};">${formatQty(rejQty)}</td>
        <td style="text-align: center; padding: 6px 4px; font-weight: 600;">${uom}</td>
        <td style="text-align: right; padding: 6px 6px;">${formatDecimal(rate)}</td>
        <td style="text-align: right; padding: 6px 8px; font-weight: 700;">${formatDecimal(tot)}</td>
        <td style="padding: 6px 8px; font-size: 9px; color: #475569;">${remarks}</td>
      </tr>
    `;
  }).join('');

  const bodyHtml = `
    <!-- Top Header -->
    <div style="display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #0f172a; padding-bottom: 12px; margin-bottom: 12px;">
      <div style="display: flex; align-items: center; gap: 12px;">
        <img src="${getLogoUrl()}" alt="Pakistan Wire Industries (Pvt.) LTD" style="height: 54px; width: auto; max-width: 120px; object-fit: contain;" onerror="this.style.display='none'" />
        <div>
          <div style="font-size: 18px; font-weight: 800; color: #0f172a; line-height: 1.2;">Pakistan Wire Industries (Pvt.) LTD</div>
          <div style="font-size: 11px; color: #475569; margin-top: 2px;">Inbound Quality & Warehouse Reception System</div>
        </div>
      </div>
      <div style="text-align: right;">
        <div style="display: inline-block; background: #0284c7; color: #ffffff; padding: 4px 14px; font-size: 13px; font-weight: 800; letter-spacing: 0.8px; border-radius: 2px; text-transform: uppercase;">
          GOODS RECEIPT NOTE (GRN)
        </div>
        <div style="font-size: 13px; font-weight: 700; color: #0f172a; margin-top: 4px; font-family: monospace;">Receipt #: ${receiptCode}</div>
        <div style="font-size: 11px; color: #475569;">GRN #: <strong>${grnNo}</strong> | Date: ${formattedDate}</div>
      </div>
    </div>

    <!-- Metadata Two Column Box -->
    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 14px; font-size: 11px;">
      <div style="border: 1px solid #cbd5e1; border-radius: 4px; padding: 10px; background: #f8fafc;">
        <div style="font-weight: 700; color: #0284c7; margin-bottom: 6px; text-transform: uppercase; font-size: 10px; letter-spacing: 0.5px;">
          Supplier / Consignor Details
        </div>
        <div style="font-weight: 800; font-size: 13px; color: #0f172a;">${supName}</div>
        <div style="color: #475569; margin-top: 2px;">${supAddress}</div>
        <div style="color: #475569; margin-top: 2px;">Phone: ${supPhone} | NTN/GST: ${supNtn}</div>
      </div>

      <div style="border: 1px solid #cbd5e1; border-radius: 4px; padding: 10px; background: #f8fafc;">
        <div style="font-weight: 700; color: #0284c7; margin-bottom: 6px; text-transform: uppercase; font-size: 10px; letter-spacing: 0.5px;">
          Receiving & Store Reference
        </div>
        <div><strong>PO / PR Reference:</strong> <span style="font-family: monospace; color: #0284c7; font-weight: 700;">${poRef}</span></div>
        <div><strong>Target Warehouse / Store:</strong> ${whName}</div>
        <div><strong>Delivery Note / Challan #:</strong> ${gr.deliveryNoteNumber || '—'}</div>
        <div><strong>Receipt Status:</strong> <span style="font-weight: 700; color: ${gr.status === 'POSTED' ? '#7c3aed' : '#0284c7'};">${gr.status || 'DRAFT'}</span></div>
      </div>
    </div>

    <!-- Table of Received Items -->
    <table style="width: 100%; border-collapse: collapse; margin-bottom: 14px; border: 1px solid #cbd5e1;">
      <thead>
        <tr style="background: #0f172a; color: #ffffff; font-size: 9.5px; text-transform: uppercase; letter-spacing: 0.5px;">
          <th style="padding: 7px 4px; width: 26px; text-align: center;">#</th>
          <th style="padding: 7px 8px; text-align: left; width: 110px;">Item Code</th>
          <th style="padding: 7px 8px; text-align: left;">Product Description</th>
          <th style="padding: 7px 6px; text-align: right; width: 65px;">Ordered</th>
          <th style="padding: 7px 6px; text-align: right; width: 65px;">Received</th>
          <th style="padding: 7px 6px; text-align: right; width: 65px;">Accepted</th>
          <th style="padding: 7px 6px; text-align: right; width: 65px;">Rejected</th>
          <th style="padding: 7px 4px; text-align: center; width: 45px;">UOM</th>
          <th style="padding: 7px 6px; text-align: right; width: 75px;">Unit Rate</th>
          <th style="padding: 7px 8px; text-align: right; width: 85px;">Total Value</th>
          <th style="padding: 7px 8px; text-align: left; width: 120px;">Remarks</th>
        </tr>
      </thead>
      <tbody>
        ${rowsHtml}
      </tbody>
      <tfoot>
        <tr style="background: #f1f5f9; font-weight: 800; font-size: 11px; border-top: 2px solid #0f172a;">
          <td colspan="3" style="padding: 8px; text-align: right;">TOTALS:</td>
          <td style="padding: 8px 6px; text-align: right;">${formatQty(totalOrdered)}</td>
          <td style="padding: 8px 6px; text-align: right;">${formatQty(totalReceived)}</td>
          <td style="padding: 8px 6px; text-align: right; color: #16a34a;">${formatQty(totalAccepted)}</td>
          <td colspan="3" style="padding: 8px 6px; text-align: right;">PKR</td>
          <td style="padding: 8px 8px; text-align: right; font-size: 12px; color: #0f172a;">Rs ${formatDecimal(totalValue)}</td>
          <td></td>
        </tr>
      </tfoot>
    </table>

    ${gr.notes ? `
      <div style="border: 1px solid #cbd5e1; border-radius: 4px; padding: 8px 12px; margin-bottom: 16px; background: #fdfdfe; font-size: 10px;">
        <strong>Inspection & Receiving Remarks:</strong> ${gr.notes}
      </div>
    ` : ''}

    <!-- Signatures Section -->
    <div style="display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap: 12px; margin-top: 36px; padding-top: 8px;">
      <div style="text-align: center; border-top: 1.5px solid #64748b; padding-top: 4px; font-size: 10px; font-weight: 700; color: #334155;">
        <div>STORE KEEPER</div>
        <div style="font-size: 9px; color: #64748b; font-weight: normal;">(Received in Warehouse)</div>
      </div>
      <div style="text-align: center; border-top: 1.5px solid #64748b; padding-top: 4px; font-size: 10px; font-weight: 700; color: #334155;">
        <div>QUALITY INSPECTOR (QC)</div>
        <div style="font-size: 9px; color: #64748b; font-weight: normal;">(Inspected & Tested)</div>
      </div>
      <div style="text-align: center; border-top: 1.5px solid #64748b; padding-top: 4px; font-size: 10px; font-weight: 700; color: #334155;">
        <div>STORE INCHARGE / HOD</div>
        <div style="font-size: 9px; color: #64748b; font-weight: normal;">(Verified & Approved)</div>
      </div>
      <div style="text-align: center; border-top: 1.5px solid #64748b; padding-top: 4px; font-size: 10px; font-weight: 700; color: #334155;">
        <div>GATE SECURITY INWARD</div>
        <div style="font-size: 9px; color: #64748b; font-weight: normal;">(Vehicle / Material Entry)</div>
      </div>
    </div>
  `;

  printHtmlContent(`Goods_Receipt_${receiptCode}`, bodyHtml);
}



/**
 * Renders an item name for print tables. When the name contains a double underscore (`__`),
 * the part before it is the primary (bold) spoke name and the part after it is shown
 * as a clean secondary nipple-spec sub-line.
 */
function renderItemNameHtml(rawName: string, primaryStyle: string): string {
  const parts = String(rawName || '').split('__').map((p) => p.trim()).filter(Boolean);
  const primary = parts[0] || String(rawName || '').trim();
  const secondary = parts.slice(1).join(' ');
  return `<div style="${primaryStyle}">${primary}</div>${
    secondary
      ? `<div style="font-size: 10.5px; font-weight: 600; color: #475569; line-height: 1.3; margin-top: 1px;">${secondary}</div>`
      : ''
  }`;
}
