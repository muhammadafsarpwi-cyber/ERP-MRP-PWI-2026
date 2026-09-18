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
  sourceNo?: string;
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
 * Rich, professional WhatsApp share message built from real receipt data.
 * Adheres strictly to the user requirement:
 * Item Name FIRST, with Code in brackets: "Packed Spoke 14G (FGR-SPP-001)"
 */
export function buildReceiptWhatsAppMessage(info: ShareReceiptInfo): string {
  const date = info.receiptDate || '';
  const lines: string[] = [];

  lines.push('📦 *PAKISTAN WIRE INDUSTRIES (PVT) LTD*');
  lines.push('*RAW MATERIAL RECEIPT (GATE PASS)*');
  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━');
  lines.push(`📋 *Receipt Code:* ${info.receiptCode}`);
  if (info.gatePassNo) lines.push(`🎫 *Gate Pass No:* ${info.gatePassNo}`);
  if (info.sourceNo) lines.push(`📄 *Source / DC No:* ${info.sourceNo}`);
  if (date) lines.push(`📅 *Receipt Date:* ${date}`);

  const warehouseStr = formatNameWithCode(info.warehouseName, info.warehouseCode);
  const divisionStr = formatNameWithCode(info.divisionName, info.divisionCode);
  const sectionStr = formatNameWithCode(info.sectionName, info.sectionCode);
  const deptStr = formatNameWithCode(info.departmentName, info.departmentCode);

  if (warehouseStr !== '—') lines.push(`🏪 *Warehouse:* ${warehouseStr}`);
  if (divisionStr !== '—') lines.push(`🏢 *Division:* ${divisionStr}`);
  if (sectionStr !== '—') lines.push(`🏬 *Section:* ${sectionStr}`);
  if (deptStr !== '—') lines.push(`🏷️ *Department:* ${deptStr}`);

  if (info.lines.length > 0) {
    lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━');
    lines.push(`📋 *MATERIAL ITEMS (${info.lines.length} Line${info.lines.length > 1 ? 's' : ''}):*`);

    info.lines.forEach((line, idx) => {
      // Name FIRST, Code in brackets
      const itemTitle = formatNameWithCode(line.itemName, line.itemCode);
      const uom = line.uomCode ? ` ${line.uomCode}` : '';
      const gpQty = fmt(line.gatePassQuantity);
      const rcvQty = fmt(line.receivedQuantity);
      const diffVal = Number(line.difference || 0);

      let statusEmoji = '✅ Balanced';
      if (diffVal < 0) {
        statusEmoji = `⚠️ Excess (+${fmt(Math.abs(diffVal))}${uom})`;
      } else if (diffVal > 0) {
        statusEmoji = `❌ Shortage (-${fmt(diffVal)}${uom})`;
      }

      lines.push(`\n*${idx + 1}. ${itemTitle}*`);
      lines.push(`   • Gate Pass Qty: ${gpQty}${uom}`);
      lines.push(`   • Received Qty: ${rcvQty}${uom}`);
      lines.push(`   • Status: ${statusEmoji}`);
    });

    lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━');
    lines.push('📊 *RECEIPT SUMMARY TOTALS:*');
    lines.push(`• Total Gate Pass Qty: ${fmt(info.gatePassTotal)}`);
    lines.push(`• Total Received Qty: ${fmt(info.receivedTotal)}`);
    const netDiff = Number(info.differenceTotal || 0);
    const netStatus = netDiff === 0 ? '✅ Matched' : netDiff > 0 ? `❌ Short (-${fmt(netDiff)})` : `⚠️ Excess (+${fmt(Math.abs(netDiff))})`;
    lines.push(`• Net Variance: ${fmt(netDiff)} (${netStatus})`);
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

  lines.push('🔄 *PAKISTAN WIRE INDUSTRIES (PVT) LTD*');
  lines.push('*RAW MATERIAL RETURN*');
  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━');
  lines.push(`📋 *Return Code:* ${info.returnCode}`);
  if (info.sourceNo) lines.push(`📄 *Source / DC No:* ${info.sourceNo}`);
  if (info.referenceReceiptCode) lines.push(`🎫 *Ref Gate Pass:* ${info.referenceReceiptCode}`);
  if (date) lines.push(`📅 *Return Date:* ${date}`);

  const warehouseStr = formatNameWithCode(info.warehouseName, info.warehouseCode);
  const divisionStr = formatNameWithCode(info.divisionName, info.divisionCode);
  const sectionStr = formatNameWithCode(info.sectionName, info.sectionCode);
  const deptStr = formatNameWithCode(info.departmentName, info.departmentCode);

  if (warehouseStr !== '—') lines.push(`🏪 *Return Warehouse:* ${warehouseStr}`);
  if (divisionStr !== '—') lines.push(`🏢 *Division:* ${divisionStr}`);
  if (sectionStr !== '—') lines.push(`🏬 *Section:* ${sectionStr}`);
  if (deptStr !== '—') lines.push(`🏷️ *Department:* ${deptStr}`);
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