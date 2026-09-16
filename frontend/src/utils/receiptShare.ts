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
  sectionName?: string;
  departmentName?: string;
  warehouseName?: string;
  lines: ShareLine[];
  gatePassTotal: number;
  receivedTotal: number;
  differenceTotal: number;
}

/** Plain-text WhatsApp share message built from the real receipt data. */
export function buildReceiptWhatsAppMessage(info: ShareReceiptInfo): string {
  const date = info.receiptDate || '';
  const org = [info.warehouseName, info.divisionName, info.sectionName, info.departmentName]
    .filter(Boolean)
    .join(' / ');
  let msg = 'RAW MATERIAL RECEIVING\n';
  msg += `Receipt: ${info.receiptCode}\n`;
  if (info.gatePassNo) msg += `Gate Pass: ${info.gatePassNo}\n`;
  if (info.sourceNo) msg += `Source No: ${info.sourceNo}\n`;
  if (date) msg += `Date: ${date}\n`;
  if (org) msg += `Org: ${org}\n`;

  if (info.lines.length > 0) {
    msg += '\n';
    info.lines.forEach((line, idx) => {
      const item = [line.itemCode, line.itemName].filter(Boolean).join(' - ') || `Item ${idx + 1}`;
      msg += `${idx + 1}. ${item}${line.uomCode ? ` (${line.uomCode})` : ''}\n`;
      msg += `   Gate Pass: ${line.gatePassQuantity} | Received: ${line.receivedQuantity} | Diff: ${line.difference}\n`;
    });
    msg += `\nTotals — Gate Pass: ${info.gatePassTotal} | Received: ${info.receivedTotal} | Diff: ${info.differenceTotal}`;
  }
  return msg;
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