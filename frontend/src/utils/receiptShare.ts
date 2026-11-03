import { formatNameWithCode } from './formatEntityLabel';

export interface ShareLine {
  itemCode?: string;
  itemName?: string;
  uomCode?: string;
  gatePassQuantity: number;
  receivedQuantity: number;
  difference: number;
}

export interface ShareReceiptInfo {
  receiptCode: string;
  gatePassNo?: string;
  poCode?: string;
  sourceNo?: string;
  heatNumber?: string;
  receiptDate: string;
  divisionName?: string;
  divisionCode?: string;
  sectionName?: string;
  sectionCode?: string;
  departmentName?: string;
  departmentCode?: string;
  warehouseName?: string;
  warehouseCode?: string;
  lines: ShareLine[];
  gatePassTotal: number;
  receivedTotal: number;
  differenceTotal: number;
}

/** Formats a number with commas and up to 2 decimal places */
function fmt(val: number): string {
  return Number(val || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Formats item lines for the WhatsApp receipt message.
 * Uses ➖ Shortage and ➕ Excess (no ❌ mark).
 */
export function formatReceiptItemLines(lines: ShareLine[]): string {
  if (!lines || lines.length === 0) return '';
  const out: string[] = [];
  out.push(`📋 *MATERIAL ITEMS (${lines.length} Line${lines.length > 1 ? 's' : ''}):*`);

  lines.forEach((line, idx) => {
    // Name FIRST, Code in brackets
    const itemTitle = formatNameWithCode(line.itemName, line.itemCode);
    const uom = line.uomCode ? ` ${line.uomCode}` : '';
    const gpQty = fmt(line.gatePassQuantity);
    const rcvQty = fmt(line.receivedQuantity);
    const diffVal = Number(line.difference || 0);

    let statusEmoji = '✅ Balanced';
    if (diffVal < 0) {
      statusEmoji = `➕ Excess (+${fmt(Math.abs(diffVal))}${uom})`;
    } else if (diffVal > 0) {
      statusEmoji = `➖ Shortage (-${fmt(diffVal)}${uom})`;
    }

    out.push(`\n*${idx + 1}. ${itemTitle}*`);
    out.push(`   • Gate Pass Qty: ${gpQty}${uom}`);
    out.push(`   • Received Qty: ${rcvQty}${uom}`);
    out.push(`   • Status: ${statusEmoji}`);
  });

  return out.join('\n');
}

/** Check if user configured a custom Raw Material WhatsApp template in Company Settings */
function getStoredRmReceiptTemplate(): string | null {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const saved = window.localStorage.getItem('erp_whatsapp_settings_v1');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed?.templates?.rmReceipt && typeof parsed.templates.rmReceipt === 'string' && parsed.templates.rmReceipt.trim()) {
          return parsed.templates.rmReceipt.trim();
        }
      }
    }
  } catch {}
  return null;
}

/**
 * Rich, professional WhatsApp share message built from real receipt data.
 * Adheres strictly to the user requirement:
 * 1. Clean names for Warehouse, Division, Section without codes in brackets.
 * 2. Department line removed.
 * 3. ➖ Shortage and ➕ Excess without ugly cross (❌) mark.
 * 4. Item Name FIRST, with Code in brackets: "Packed Spoke 14G (FGR-SPP-001)"
 * 5. Uses Company Settings WhatsApp message template if configured by user.
 */
export function buildReceiptWhatsAppMessage(info: ShareReceiptInfo): string {
  const date = info.receiptDate || '';
  const netDiff = Number(info.differenceTotal || 0);
  let netStatus = '✅ Balanced';
  let netVarianceStr = `${fmt(0)} KG`;
  if (netDiff > 0) {
    netStatus = '➖ Shortage';
    netVarianceStr = `-${fmt(netDiff)} KG`;
  } else if (netDiff < 0) {
    netStatus = '➕ Excess';
    netVarianceStr = `+${fmt(Math.abs(netDiff))} KG`;
  }

  const warehouseDisplay = info.warehouseName?.trim() || info.warehouseCode?.trim() || '';
  const divisionDisplay = info.divisionName?.trim() || info.divisionCode?.trim() || '';
  const sectionDisplay = info.sectionName?.trim() || info.sectionCode?.trim() || '';

  // Check for custom template configured in Company Settings -> WhatsApp Messages
  const customTemplate = getStoredRmReceiptTemplate();
  if (customTemplate) {
    return customTemplate
      .replace(/{company}/g, 'Pakistan Wire Industries (Pvt.) LTD')
      .replace(/{receipt_code}/g, info.receiptCode || '')
      .replace(/{gate_pass_no}/g, info.gatePassNo || '—')
      .replace(/{po_no}/g, info.poCode || '—')
      .replace(/{doc_no}/g, info.gatePassNo || info.receiptCode || '')
      .replace(/{heat_number}/g, info.heatNumber || '—')
      .replace(/{date}/g, date)
      .replace(/{warehouse}/g, warehouseDisplay || '—')
      .replace(/{division}/g, divisionDisplay || '—')
      .replace(/{section}/g, sectionDisplay || '—')
      .replace(/{items}/g, formatReceiptItemLines(info.lines))
      .replace(/{total_gp_qty}/g, fmt(info.gatePassTotal))
      .replace(/{total_rcv_qty}/g, fmt(info.receivedTotal))
      .replace(/{net_variance}/g, `${netVarianceStr} (${netStatus})`);
  }

  const lines: string[] = [];
  lines.push('📦 *Pakistan Wire Industries (Pvt.) LTD*');
  lines.push('*RAW MATERIAL RECEIPT (GATE PASS)*');
  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━');
  lines.push(`📋 *Receipt Code:* ${info.receiptCode}`);
  if (info.gatePassNo) lines.push(`🎫 *Gate Pass No:* ${info.gatePassNo}`);
  if (info.poCode) lines.push(`📑 *PO Number:* ${info.poCode}`);
  if (info.sourceNo) lines.push(`📄 *Source / DC No:* ${info.sourceNo}`);
  if (info.heatNumber) lines.push(`🔥 *Heat Number:* ${info.heatNumber}`);
  if (date) lines.push(`📅 *Receipt Date:* ${date}`);

  // Display only clean entity names without bracketed codes
  if (warehouseDisplay) lines.push(`🏪 *Warehouse:* ${warehouseDisplay}`);
  if (divisionDisplay) lines.push(`🏢 *Division:* ${divisionDisplay}`);
  if (sectionDisplay) lines.push(`🏬 *Section:* ${sectionDisplay}`);
  // Department line removed as requested

  if (info.lines.length > 0) {
    lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━');
    lines.push(formatReceiptItemLines(info.lines));

    lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━');
    lines.push('📊 *RECEIPT SUMMARY TOTALS:*');
    lines.push(`• Total Gate Pass Qty: ${fmt(info.gatePassTotal)}`);
    lines.push(`• Total Received Qty: ${fmt(info.receivedTotal)}`);
    lines.push(`• Net Variance: ${netVarianceStr} (${netStatus})`);
  }

  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━');
  lines.push('🌐 _Generated via PWI ERP System (2026-2027)_');

  return lines.join('\n');
}

export interface ShareReturnLine {
  itemCode?: string;
  itemName?: string;
  uomCode?: string;
  quantity: number;
}

export interface ShareReturnInfo {
  returnCode: string;
  sourceNo?: string;
  referenceReceiptCode?: string;
  returnDate: string;
  divisionName?: string;
  divisionCode?: string;
  sectionName?: string;
  sectionCode?: string;
  departmentName?: string;
  departmentCode?: string;
  warehouseName?: string;
  warehouseCode?: string;
  reason?: string;
  reference?: string;
  lines: ShareReturnLine[];
  quantityTotal: number;
}

export function buildReturnWhatsAppMessage(info: ShareReturnInfo): string {
  const date = info.returnDate || '';
  const lines: string[] = [];

  lines.push('🔄 *Pakistan Wire Industries (Pvt.) LTD*');
  lines.push('*RAW MATERIAL RETURN*');
  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━');
  lines.push(`📋 *Return Code:* ${info.returnCode}`);
  if (info.sourceNo) lines.push(`📄 *Source / DC No:* ${info.sourceNo}`);
  if (info.referenceReceiptCode) lines.push(`🎫 *Ref Gate Pass:* ${info.referenceReceiptCode}`);
  if (date) lines.push(`📅 *Return Date:* ${date}`);

  const warehouseDisplay = info.warehouseName?.trim() || info.warehouseCode?.trim() || '';
  const divisionDisplay = info.divisionName?.trim() || info.divisionCode?.trim() || '';
  const sectionDisplay = info.sectionName?.trim() || info.sectionCode?.trim() || '';

  if (warehouseDisplay) lines.push(`🏪 *Return Warehouse:* ${warehouseDisplay}`);
  if (divisionDisplay) lines.push(`🏢 *Division:* ${divisionDisplay}`);
  if (sectionDisplay) lines.push(`🏬 *Section:* ${sectionDisplay}`);
  if (info.reason) lines.push(`❓ *Reason:* ${info.reason}`);

  if (info.lines.length > 0) {
    lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━');
    lines.push(`📋 *RETURNED ITEMS (${info.lines.length} Line${info.lines.length > 1 ? 's' : ''}):*`);

    info.lines.forEach((line, idx) => {
      const itemTitle = formatNameWithCode(line.itemName, line.itemCode);
      const uom = line.uomCode ? ` ${line.uomCode}` : '';
      const qty = fmt(line.quantity);

      lines.push(`\n*${idx + 1}. ${itemTitle}*`);
      lines.push(`   • Returned Qty: ${qty}${uom}`);
    });

    lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━');
    lines.push('📊 *RETURN SUMMARY TOTAL:*');
    lines.push(`• Total Returned Qty: ${fmt(info.quantityTotal)}`);
  }

  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━');
  lines.push('🌐 _Generated via PWI ERP System (2026-2027)_');

  return lines.join('\n');
}

/**
 * Returns a universal WhatsApp web/app share URL without needing a recipient phone.
 * Allows user to pick ANY contact or group in WhatsApp.
 */
export function waDirectShareUrl(message: string): string {
  return `https://api.whatsapp.com/send?text=${encodeURIComponent(message.trim())}`;
}

/** Returns wa.me link with phone + message pre-filled, or '' if the phone is unusable. */
export function waLink(phone: string, message: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 8) return '';
  const url = new URL('https://wa.me/' + digits);
  if (message.trim()) url.searchParams.set('text', message.trim());
  return url.toString();
}

/** Digits-only phone. Returns null when it is clearly invalid (<8 digits). */
export function normalizeWaPhone(phone: string): string | null {
  const digits = phone.replace(/\D/g, '');
  return digits.length >= 8 ? digits : null;
}