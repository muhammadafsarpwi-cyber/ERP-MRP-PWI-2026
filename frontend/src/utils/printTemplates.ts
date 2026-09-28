import { formatDecimal } from './numberFormat';
import { renderVisitorSlipHtml, type VisitorSlipAssets, type VisitorSlipData } from './visitorSlipHtml';

function getLogoUrl(): string {
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
  const custName = inv.customer?.name || inv.customer?.companyName || inv.companyName || 'Customer';
  const custAddress = inv.customer?.addressLine1 || inv.customer?.billingAddress || inv.customer?.address || 'Industrial Area';
  const custPhone = inv.customer?.phone || '-';
  const custNtn = inv.customer?.salesTaxNumber || inv.customer?.taxNumber || '-';
  const custState = inv.customer?.state || 'Punjab';

  let totalQty = 0;
  const rowsHtml = (items.length > 0 ? items : [
    {
      description: 'Finished Goods Wire Product',
      hsnCode: '8505',
      quantity: 1,
      rate: Number(inv.totalAmount || inv.total || 1260),
      taxableAmount: Number(inv.subtotal || inv.totalAmount || 1200),
      taxAmount: Number(inv.taxAmount || 60),
      amount: Number(inv.totalAmount || 1260),
    }
  ]).map((it: any, idx: number) => {
    const pName = it.product || it.item?.name || it.description || it.productName || it.name || 'Finished Product';
    const hsn = it.hsnCode || it.item?.itemCode || it.itemCode || '8505';
    const qty = it.quantity || it.qty || 1;
    const rate = it.rate ?? it.unitPrice ?? 0;
    const taxable = it.taxableAmount ?? (qty * rate);
    const taxAmt = it.gstAmount ?? it.taxAmount ?? (taxable * 0.05);
    const halfTax = taxAmt / 2;
    const taxPct = it.gstRate ? `${it.gstRate}%` : (it.taxRate ? `${it.taxRate}%` : '5%');
    const total = it.amount ?? it.lineTotal ?? it.total ?? (taxable + taxAmt);
    totalQty += Number(qty) || 0;

    return `
      <tr style="border-bottom: 1px solid #e2e8f0; font-size: 10px;">
        <td style="text-align: center; padding: 6px 4px; width: 26px;">${idx + 1}</td>
        <td style="padding: 6px 8px;"><strong>${pName}</strong></td>
        <td style="text-align: center; padding: 6px 4px; color: #475569;">${hsn}</td>
        <td style="text-align: right; padding: 6px 6px;">${qty}</td>
        <td style="text-align: right; padding: 6px 6px;">${formatDecimal(rate)}</td>
        <td style="text-align: right; padding: 6px 6px;">${formatDecimal(taxable)}</td>
        <td style="text-align: center; padding: 6px 4px;">${taxPct}</td>
        <td style="text-align: right; padding: 6px 6px;">${formatDecimal(halfTax)}</td>
        <td style="text-align: right; padding: 6px 6px;">${formatDecimal(halfTax)}</td>
        <td style="text-align: right; padding: 6px 8px; font-weight: 700;">${formatDecimal(total)}</td>
      </tr>
    `;
  }).join('');

  const subtotal = Number(inv.subtotal || inv.totalAmount || 1200);
  const totalTax = Number(inv.taxAmount || 60);
  const halfTax = totalTax / 2;
  const grandTotal = Number(inv.totalAmount || (subtotal + totalTax));
  const paidAmount = Number(inv.paidAmount || 0);
  const balanceDue = Number(inv.outstandingAmount ?? inv.balance ?? (grandTotal - paidAmount));
  const words = amountToWords(grandTotal);

  const bodyHtml = `
    <!-- Top Header -->
    <div style="display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #0f172a; padding-bottom: 12px; margin-bottom: 12px;">
      <div style="display: flex; align-items: center; gap: 12px;">
        <div style="background: #181f2c; color: #ffffff; width: 48px; height: 48px; border-radius: 4px; display: flex; align-items: center; justify-content: center; font-weight: 900; font-size: 15px; letter-spacing: 0.5px;">
          PWI
        </div>
        <div>
          <div style="font-size: 18px; font-weight: 800; color: #0f172a; line-height: 1.2;">Pakistan Wire Industries (Pvt) Ltd.</div>
          <div style="font-size: 11px; color: #475569; margin-top: 2px;">State: ${custState}</div>
        </div>
      </div>
      <div style="text-align: right;">
        <div style="display: inline-block; background: #181f2c; color: #ffffff; padding: 4px 14px; font-size: 13px; font-weight: 800; letter-spacing: 0.8px; border-radius: 2px; text-transform: uppercase;">
          TAX INVOICE
        </div>
        <div style="font-size: 12px; font-weight: 800; color: #0f172a; margin-top: 4px; font-family: monospace;">${inv.invoiceNo || 'INV-0003'}</div>
        <div style="font-size: 10px; color: #475569; margin-top: 1px;">Date: ${inv.invoiceDate || '30 Jul 2026'}</div>
        <div style="font-size: 10px; color: #475569;">Due: ${inv.dueDate || '19 Aug 2026'}</div>
      </div>
    </div>

    <!-- 2-Column Details: BILL TO & SUMMARY -->
    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px;">
      <div style="border: 1px solid #e2e8f0; border-radius: 4px; padding: 10px 12px; background: #fafafa;">
        <div style="font-size: 10.5px; font-weight: 800; color: #64748b; text-transform: uppercase; margin-bottom: 4px; letter-spacing: 0.5px;">BILL TO</div>
        <div style="font-size: 13px; font-weight: 800; color: #0f172a;">${custName}</div>
        <div style="font-size: 10.5px; color: #334155; margin-top: 2px;">${custAddress}</div>
        <div style="font-size: 10.5px; color: #334155; margin-top: 2px;">Phone: ${custPhone}</div>
        <div style="font-size: 10.5px; color: #334155;">GSTIN: <span style="font-family: monospace;">${custNtn}</span></div>
        <div style="font-size: 10.5px; color: #334155;">State: ${custState}</div>
      </div>

      <div style="border: 1px solid #e2e8f0; border-radius: 4px; padding: 10px 12px; background: #fafafa;">
        <div style="font-size: 10.5px; font-weight: 800; color: #64748b; text-transform: uppercase; margin-bottom: 6px; letter-spacing: 0.5px;">SUMMARY</div>
        <div style="display: flex; justify-content: space-between; font-size: 10.5px; margin-bottom: 3px;">
          <span style="color: #64748b;">Place of supply:</span>
          <span style="font-weight: 700; color: #0f172a;">${custState}</span>
        </div>
        <div style="display: flex; justify-content: space-between; font-size: 10.5px; margin-bottom: 3px;">
          <span style="color: #64748b;">Tax treatment:</span>
          <span style="font-weight: 700; color: #0f172a;">Intra-state (SGST + CGST)</span>
        </div>
        <div style="display: flex; justify-content: space-between; font-size: 10.5px; margin-bottom: 3px;">
          <span style="color: #64748b;">Payment terms:</span>
          <span style="font-weight: 700; color: #0f172a;">${inv.paymentTerms || 'net 30'}</span>
        </div>
        <div style="display: flex; justify-content: space-between; font-size: 10.5px;">
          <span style="color: #64748b;">Status:</span>
          <span style="font-weight: 800; color: ${inv.status === 'PAID' ? '#16a34a' : '#d97706'}; text-transform: capitalize;">${inv.status || 'Pending'}</span>
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
          <td style="padding: 6px 6px; text-align: right;">${totalQty}</td>
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
          ${inv.notes || `Sample note for ${inv.invoiceNo || 'INV-0003'}`}
        </div>
      </div>

      <div style="width: 250px;">
        <table style="width: 100%; border-collapse: collapse; font-size: 11px;">
          <tr>
            <td style="padding: 3px 0; color: #64748b;">Subtotal</td>
            <td style="padding: 3px 0; text-align: right; font-weight: 600;">Rs ${formatDecimal(subtotal)}</td>
          </tr>
          <tr>
            <td style="padding: 3px 0; color: #64748b;">SGST</td>
            <td style="padding: 3px 0; text-align: right; font-weight: 600;">Rs ${formatDecimal(halfTax)}</td>
          </tr>
          <tr>
            <td style="padding: 3px 0; color: #64748b;">CGST</td>
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
          Customer Signature
        </div>
      </div>
      <div style="text-align: center; width: 230px;">
        <div style="border-top: 1px solid #94a3b8; padding-top: 4px; font-size: 10.5px; font-weight: 700; color: #0f172a;">
          for Pakistan Wire Industries (Pvt) Ltd.
        </div>
      </div>
    </div>

    <!-- Footer Disclaimer -->
    <div style="text-align: center; margin-top: 24px; font-size: 9.5px; color: #94a3b8;">
      Goods once sold are taken back only per the agreed return policy. This is a computer-generated document.
    </div>
  `;

  printHtmlContent(`Invoice - ${inv.invoiceNo || 'Print'}`, bodyHtml);
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
        <td style="text-align: right; padding: 6px 6px;">${qty}</td>
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
        <div style="background: #181f2c; color: #ffffff; width: 48px; height: 48px; border-radius: 4px; display: flex; align-items: center; justify-content: center; font-weight: 900; font-size: 15px; letter-spacing: 0.5px;">
          PWI
        </div>
        <div>
          <div style="font-size: 18px; font-weight: 800; color: #0f172a; line-height: 1.2;">Pakistan Wire Industries (Pvt) Ltd.</div>
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
          <td style="padding: 6px 6px; text-align: right;">${totalQty}</td>
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
          for Pakistan Wire Industries (Pvt) Ltd.
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
        <td style="text-align: right;">${qty}</td>
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
          <div class="company-name">PAKISTAN WIRE INDUSTRIES (PVT) LTD</div>
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

  const rowsHtml = items.map((it: any, idx: number) => {
    const pName = it.item?.name || it.description || 'Delivered Product';
    const qty = it.quantity || it.deliveredQuantity || 0;
    const uom = it.uom?.code || it.uomCode || 'Units';

    return `
      <tr>
        <td style="text-align: center; width: 32px;">${idx + 1}</td>
        <td><strong>${pName}</strong></td>
        <td style="text-align: right;">${qty} ${uom}</td>
        <td>${it.batchNumber || it.serialNumber || 'Standard'}</td>
        <td>${it.remarks || 'Standard Dispatch'}</td>
      </tr>
    `;
  }).join('');

  const bodyHtml = `
    <div class="company-header">
      <div class="company-logo-info">
        <img class="company-logo" src="${getLogoUrl()}" alt="Logo" onerror="this.style.display='none'" />
        <div>
          <div class="company-name">PAKISTAN WIRE INDUSTRIES (PVT) LTD</div>
          <div class="company-sub">Dispatch & Logistics Department | Lahore, Pakistan</div>
        </div>
      </div>
      <div class="doc-badge-box">
        <div class="doc-badge">DELIVERY CHALLAN</div>
        <div class="doc-badge-sub">DISPATCH NOTE / GATE PASS</div>
      </div>
    </div>

    <div class="info-grid">
      <div class="info-card">
        <div class="info-card-title">DISPATCH DETAILS</div>
        <div class="info-row"><span class="info-label">Delivery Note #:</span><span class="info-val">${delivery.deliveryNumber || '-'}</span></div>
        <div class="info-row"><span class="info-label">Dispatch Date:</span><span class="info-val">${delivery.deliveryDate || '-'}</span></div>
        <div class="info-row"><span class="info-label">Originating SO #:</span><span class="info-val">${delivery.salesOrder?.orderNumber || '-'}</span></div>
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
          <th>#</th>
          <th>Product / Description</th>
          <th>Dispatched Quantity</th>
          <th>Batch / Heat #</th>
          <th>Notes / Condition</th>
        </tr>
      </thead>
      <tbody>
        ${rowsHtml || '<tr><td colspan="5" style="text-align: center; padding: 16px;">No delivery lines</td></tr>'}
      </tbody>
    </table>

    <div class="signatures">
      <div class="sig-box">Store In-charge</div>
      <div class="sig-box">Security Gate Out</div>
      <div class="sig-box">Customer Receiver Signature & Stamp</div>
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
    customerPo?: string;
    orderQuantity?: number;
    quantity?: number;
    balanceQuantity?: number;
    uom?: string;
    packageQuantity?: number;
    packagingUnit?: string;
    packaging?: string;
    remarks?: string;
  }>;
}): void {
  if (!data) return;
  const isOutward = data.passType === 'OUTWARD';
  const passTitle = isOutward ? 'OUTWARD GATE PASS' : 'INWARD GATE PASS';
  const badgeColor = isOutward ? '#b45309' : '#047857';
  const passNo = data.gatePassNo || `GP-${isOutward ? 'OUT' : 'IN'}-${Date.now().toString().slice(-6)}`;
  const items = data.items || [];

  // Group and sum totals by UOM and Packaging
  const uomTotals: Record<string, number> = {};
  let totalPackageCount = 0;
  const pkgSummary: Record<string, number> = {};

  items.forEach((it: any) => {
    const qty = Number(it.quantity || it.receivedQuantity || it.deliveredQuantity || 0);
    const uom = it.uom || it.uomCode || 'Units';
    uomTotals[uom] = (uomTotals[uom] || 0) + qty;

    const pkgQty = Number(it.packageQuantity || 0);
    const pkgUnit = it.packagingUnit || 'Coils / Pkgs';
    if (pkgQty > 0) {
      totalPackageCount += pkgQty;
      pkgSummary[pkgUnit] = (pkgSummary[pkgUnit] || 0) + pkgQty;
    }
  });

  const physicalQtyTotalStr = Object.entries(uomTotals)
    .map(([uom, q]) => `${formatDecimal(q)} ${uom}`)
    .join(' + ') || '0 Units';

  const packagingTotalStr = Object.keys(pkgSummary).length > 0
    ? Object.entries(pkgSummary).map(([unit, q]) => `${q} ${unit}`).join(', ')
    : (totalPackageCount > 0 ? `${totalPackageCount} Packages` : 'Standard Packages');

  // Find unique SOCs and POs across line items
  const itemSocs = Array.from(new Set(items.map((i: any) => i.socNumber).filter(Boolean)));
  const itemPos = Array.from(new Set(items.map((i: any) => i.customerPo).filter(Boolean)));

  const effectiveSoc = data.socNumber || (itemSocs.length === 1 ? itemSocs[0] : itemSocs.length > 1 ? itemSocs.join(', ') : '-');
  const effectivePo = data.customerPo || (itemPos.length === 1 ? itemPos[0] : itemPos.length > 1 ? itemPos.join(', ') : '-');

  // QR Code payload: points to verification / gate pass lookup
  const originUrl = typeof window !== 'undefined' && window.location?.origin ? window.location.origin : '';
  const qrPayload = `${originUrl}/barcode-management/scan?code=${encodeURIComponent(passNo)}`;

  const rowsHtml = items.map((it: any, idx: number) => {
    const pName = it.itemName || it.item?.name || it.description || 'Material / Item';
    const code = it.itemCode || it.item?.itemCode || `SKU-${idx + 1}`;
    const qty = it.quantity || it.receivedQuantity || it.deliveredQuantity || 0;
    const uom = it.uom || it.uomCode || 'Units';
    const pkg = it.packaging || (it.packageQuantity ? `${it.packageQuantity} ${it.packagingUnit || 'Coils'}` : 'Pallets / Bundles');
    const rem = it.remarks || '-';

    const orderQty = it.orderQuantity != null ? Number(it.orderQuantity) : null;
    const balanceQty = it.balanceQuantity != null ? Number(it.balanceQuantity) : (orderQty != null ? Math.max(0, orderQty - qty) : null);

    return `
      <tr>
        <td style="text-align: center; width: 36px; vertical-align: top;">${idx + 1}</td>
        <td style="vertical-align: top;">
          <div style="font-size: 11.5px; font-weight: 700; color: #0f172a;">
            ${pName}
            <span style="color: #64748b; font-size: 11px; font-weight: normal;">[${code}]</span>
            ${it.socNumber ? `<span style="display: inline-block; background: #e0f2fe; color: #0369a1; border: 1px solid #bae6fd; padding: 1px 6px; border-radius: 3px; font-size: 10px; font-weight: 700; margin-left: 6px;">📋 SOC: ${it.socNumber}</span>` : ''}
            ${it.customerPo ? `<span style="display: inline-block; background: #fef3c7; color: #92400e; border: 1px solid #fde68a; padding: 1px 6px; border-radius: 3px; font-size: 10px; font-weight: 700; margin-left: 4px;">🔖 PO: ${it.customerPo}</span>` : ''}
          </div>
          ${orderQty != null ? `
            <div style="font-size: 10px; color: #475569; margin-top: 3px; background: #f8fafc; padding: 2px 6px; border-radius: 3px; display: inline-block;">
              Order Qty: <strong>${orderQty} ${uom}</strong> &nbsp;|&nbsp;
              This Gate Pass: <strong style="color: #16a34a;">${qty} ${uom}</strong> &nbsp;|&nbsp;
              Remaining Balance: <strong style="color: ${balanceQty && balanceQty > 0 ? '#ea580c' : '#16a34a'};">${balanceQty ?? 0} ${uom}</strong>
            </div>
          ` : ''}
        </td>
        <td style="text-align: right; font-weight: 700; font-size: 12px; white-space: nowrap; vertical-align: top;">
          ${qty} ${uom}
        </td>
        <td style="text-align: center; font-weight: 600; vertical-align: top; background: #fafafa;">
          ${pkg}
        </td>
        <td style="vertical-align: top; font-size: 10px; color: #64748b;">
          ${rem}
        </td>
      </tr>
    `;
  }).join('');

  const bodyHtml = `
    <div class="company-header">
      <div class="company-logo-info">
        <img class="company-logo" src="${getLogoUrl()}" alt="Logo" onerror="this.style.display='none'" />
        <div>
          <div class="company-name">PAKISTAN WIRE INDUSTRIES (PVT) LTD</div>
          <div class="company-sub">Security, Weighbridge & Gate Control | Lahore, Pakistan</div>
          <div class="company-tax">Division: ${data.divisionName || 'Wire Drawing Division'}</div>
        </div>
      </div>
      <div class="doc-badge-box" style="display: flex; align-items: center; gap: 10px;">
        <div style="text-align: right;">
          <div class="doc-badge" style="background: ${badgeColor};">${passTitle}</div>
          <div class="doc-badge-sub">OFFICIAL SECURITY PERMIT</div>
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
        <div class="info-row"><span class="info-label">SOC # / Sales Order:</span><span class="info-val font-bold" style="color: #0369a1;">${effectiveSoc}</span></div>
        <div class="info-row"><span class="info-label">Dispatch Sequence:</span><span class="info-val font-bold" style="color: #4338ca;">${data.dispatchSequence || '1st Dispatch (Standard)'}</span></div>
        <div class="info-row"><span class="info-label">Movement:</span><span class="info-val font-bold" style="color: ${badgeColor};">${passTitle}</span></div>
      </div>
      <div class="info-card">
        <div class="info-card-title">VEHICLE & TRANSPORTER DETAILS</div>
        <div class="info-row"><span class="info-label">${isOutward ? 'Customer / Consignee:' : 'Supplier / Consignor:'}</span><span class="info-val font-bold" style="font-size: 11.5px;">${data.partyName || 'Authorized Vendor'}</span></div>
        <div class="info-row"><span class="info-label">Customer PO #:</span><span class="info-val font-bold" style="color: #b45309; background: #fef3c7; padding: 1px 6px; border-radius: 3px; display: inline-block;">${effectivePo}</span></div>
        <div class="info-row"><span class="info-label">Vehicle / Truck #:</span><span class="info-val font-bold">${data.vehicleNumber || 'Pending Entry'}</span></div>
        <div class="info-row"><span class="info-label">Driver Name & CNIC:</span><span class="info-val">${data.driverName || 'Driver on Duty'} ${data.driverCnic ? `(${data.driverCnic})` : ''}</span></div>
        <div class="info-row"><span class="info-label">Transporter / Carrier:</span><span class="info-val">${data.transporter || 'Self / Company Logistics'}</span></div>
      </div>
    </div>

    <table class="print-table" style="margin-top: 10px;">
      <thead>
        <tr>
          <th style="width: 36px; text-align: center;">#</th>
          <th>Material / Product Description & SOC Details</th>
          <th style="width: 130px; text-align: right;">Physical Qty</th>
          <th style="width: 140px; text-align: center;">Packaging (Boxes / Coils)</th>
          <th style="width: 140px;">Inspection / Security Remarks</th>
        </tr>
      </thead>
      <tbody>
        ${rowsHtml || '<tr><td colspan="5" style="text-align: center; padding: 16px;">No line items specified</td></tr>'}
      </tbody>
      <tfoot>
        <tr style="background: #f8fafc; border-top: 2px solid #0f172a; border-bottom: 2px solid #0f172a;">
          <td colspan="2" style="text-align: right; font-weight: 800; font-size: 12px; padding: 8px 10px; letter-spacing: 0.5px;">
            TOTAL DISPATCHED:
          </td>
          <td style="text-align: right; font-weight: 800; font-size: 13px; color: #0f172a; padding: 8px 10px; background: #ffffff; border: 2px solid #0f172a;">
            ${physicalQtyTotalStr}
          </td>
          <td style="text-align: center; font-weight: 800; font-size: 13px; color: #0f172a; padding: 8px 10px; background: #ffffff; border: 2px solid #0f172a;">
            ${packagingTotalStr}
          </td>
          <td style="text-align: center; font-size: 10px; color: #64748b; font-weight: 600;">
            Security Verified
          </td>
        </tr>
      </tfoot>
    </table>

    <!-- ORDER FULFILLMENT & SOC PROGRESS SUMMARY CARD -->
    <div style="margin-top: 12px; border: 1px solid #cbd5e1; border-radius: 6px; padding: 8px 12px; background: #f8fafc;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px;">
        <span style="font-size: 11px; font-weight: 800; color: #0f172a; text-transform: uppercase;">
          📦 SOC Order Fulfillment & Dispatch Progress
        </span>
        <span style="font-size: 10.5px; font-weight: 700; color: #4338ca; background: #e0e7ff; padding: 2px 8px; border-radius: 4px;">
          ${data.dispatchSequence || '1st Dispatch (First Time)'}
        </span>
      </div>
      <div style="font-size: 10.5px; color: #334155; line-height: 1.5;">
        <span><strong>Primary SOC:</strong> ${effectiveSoc}</span> &nbsp;&nbsp;|&nbsp;&nbsp;
        <span><strong>Customer PO:</strong> ${effectivePo}</span> &nbsp;&nbsp;|&nbsp;&nbsp;
        <span><strong>Total Physical Qty:</strong> ${physicalQtyTotalStr}</span> &nbsp;&nbsp;|&nbsp;&nbsp;
        <span><strong>Total Packaging:</strong> ${packagingTotalStr}</span>
      </div>
    </div>

    ${data.remarks ? `<div style="margin-top: 10px; font-size: 11px; padding: 8px 12px; background: #ffffff; border: 1px solid #e2e8f0; border-left: 3px solid #3b82f6; border-radius: 4px;"><strong>Remarks:</strong> ${data.remarks}</div>` : ''}

    <div class="signatures" style="margin-top: 36px;">
      <div class="sig-box">Security Gate Officer<br/><small style="color: #64748b;">(Check-in / Check-out)</small></div>
      <div class="sig-box">Store & Weighbridge In-charge<br/><small style="color: #64748b;">(Material Verified)</small></div>
      <div class="sig-box">Driver / Transporter Signature<br/><small style="color: #64748b;">(Physical Handover)</small></div>
      <div class="sig-box">Authorized Admin Approval<br/><small style="color: #64748b;">(PWI Management)</small></div>
    </div>

    <div style="text-align: center; margin-top: 20px; font-size: 9.5px; color: #94a3b8;">
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
        <td style="text-align: right;">${qty}</td>
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
          <div class="company-name">PAKISTAN WIRE INDUSTRIES (PVT) LTD</div>
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
        <td style="text-align: right;">${qty}</td>
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
          <div class="company-name">PAKISTAN WIRE INDUSTRIES (PVT) LTD</div>
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
          <div class="company-name">PAKISTAN WIRE INDUSTRIES (PVT) LTD</div>
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

  const rowsHtml = entries.map((e: any, idx: number) => {
    const d = e.entryDate || e.date || e.createdAt ? new Date(e.entryDate || e.date || e.createdAt).toLocaleDateString() : '-';
    const docNo = e.documentNumber || e.voucherNo || e.reference || '-';
    const type = e.documentType || e.entryType || 'LEDGER';
    const desc = e.narration || e.description || e.notes || 'Transaction';
    const debit = Number(e.debit || 0);
    const credit = Number(e.credit || 0);
    const balance = Number(e.balance ?? e.runningBalance ?? 0);

    return `
      <tr>
        <td style="text-align: center; width: 32px;">${idx + 1}</td>
        <td>${d}</td>
        <td style="font-weight: 600;">${docNo}</td>
        <td><span style="font-size: 10px; font-weight: 700; text-transform: uppercase;">${type}</span></td>
        <td>${desc}</td>
        <td style="text-align: right; color: ${debit > 0 ? '#dc2626' : 'inherit'};">${debit > 0 ? formatDecimal(debit) : '-'}</td>
        <td style="text-align: right; color: ${credit > 0 ? '#16a34a' : 'inherit'};">${credit > 0 ? formatDecimal(credit) : '-'}</td>
        <td style="text-align: right; font-weight: 700;">${formatDecimal(balance)}</td>
      </tr>
    `;
  }).join('');

  const bodyHtml = `
    <div class="company-header">
      <div class="company-logo-info">
        <img class="company-logo" src="${getLogoUrl()}" alt="Logo" onerror="this.style.display='none'" />
        <div>
          <div class="company-name">PAKISTAN WIRE INDUSTRIES (PVT) LTD</div>
          <div class="company-sub">Accounts & Receivables Department | Lahore, Pakistan</div>
          <div class="company-tax">NTN: 0819234-7 | STRN: 17-00-9812-001</div>
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
        <div class="info-row"><span class="info-label">Phone:</span><span class="info-val">${customer.phone || '-'}</span></div>
        <div class="info-row"><span class="info-label">City:</span><span class="info-val">${customer.city || '-'}</span></div>
        <div class="info-row"><span class="info-label">NTN / STRN:</span><span class="info-val">${customer.taxNumber || '-'}</span></div>
      </div>
      <div class="info-card">
        <div class="info-card-title">STATEMENT SUMMARY (${currency})</div>
        <div class="info-row"><span class="info-label">Opening Balance:</span><span class="info-val">${currency} ${formatDecimal(statementData?.openingBalance || 0)}</span></div>
        <div class="info-row"><span class="info-label">Total Debits (Invoices/Returns):</span><span class="info-val" style="color: #dc2626;">${currency} ${formatDecimal(statementData?.periodDebit || 0)}</span></div>
        <div class="info-row"><span class="info-label">Total Credits (Payments/Adjustments):</span><span class="info-val" style="color: #16a34a;">${currency} ${formatDecimal(statementData?.periodCredit || 0)}</span></div>
        <div class="info-row"><span class="info-label">Closing Outstanding:</span><span class="info-val" style="font-size: 13px; font-weight: 800; color: #dc2626;">${currency} ${formatDecimal(statementData?.closingBalance || 0)}</span></div>
      </div>
    </div>

    <table class="print-table">
      <thead>
        <tr>
          <th>#</th>
          <th>Date</th>
          <th>Doc / Voucher #</th>
          <th>Type</th>
          <th>Narration</th>
          <th>Debit (${currency})</th>
          <th>Credit (${currency})</th>
          <th>Balance (${currency})</th>
        </tr>
      </thead>
      <tbody>
        ${rowsHtml || '<tr><td colspan="8" style="text-align: center; padding: 16px;">No transactions found for this period</td></tr>'}
      </tbody>
    </table>

    <div class="totals-wrap">
      <table class="totals-table">
        <tr class="grand-total">
          <td class="total-label">Closing Balance Due:</td>
          <td class="total-val">${currency} ${formatDecimal(statementData?.closingBalance || 0)}</td>
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

