import { formatNameWithCode } from './formatEntityLabel';
import {
  DEFAULT_COMPANY_NAME,
  DEFAULT_RM_RECEIPT_ITEM_LINE_TEMPLATE,
  DEFAULT_RM_RECEIPT_TEMPLATE,
  DEFAULT_RM_RETURN_TEMPLATE,
  formatWhatsAppPhoneWithCountryCode,
  renderWhatsAppRepeatingLines,
  renderWhatsAppTemplate,
} from './whatsappTemplateRenderer';

export {
  DEFAULT_RM_RECEIPT_TEMPLATE,
  DEFAULT_RM_RECEIPT_ITEM_LINE_TEMPLATE,
  DEFAULT_RM_RETURN_TEMPLATE,
};

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
  return Number(val || 0).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * Formats item lines for `[RM-GP]` using the centrally controlled
 * `[RM-GP-LINE]` (`rmReceiptItemLine`) sub-template in Settings -> WhatsApp Messages,
 * with zero hardcoded emojis/icons.
 */
export function formatReceiptItemLines(lines: ShareLine[]): string {
  if (!lines || lines.length === 0) return 'No material lines.';

  const rows = lines.map((line, idx) => {
    const itemTitle = formatNameWithCode(line.itemName, line.itemCode);
    const uom = line.uomCode ? line.uomCode.trim() : '';
    const uomSuffix = uom ? ` ${uom}` : '';
    const gpQty = `${fmt(line.gatePassQuantity)}${uomSuffix}`;
    const rcvQty = `${fmt(line.receivedQuantity)}${uomSuffix}`;
    const diffVal = Number(line.difference || 0);

    let variance = `0.00${uomSuffix}`;
    let statusText = 'Balanced';
    if (diffVal < 0) {
      variance = `+${fmt(Math.abs(diffVal))}${uomSuffix}`;
      statusText = `Excess (${variance})`;
    } else if (diffVal > 0) {
      variance = `-${fmt(diffVal)}${uomSuffix}`;
      statusText = `Shortage (${variance})`;
    }

    return {
      index: idx + 1,
      item: itemTitle,
      item_name: line.itemName || line.itemCode || 'Material',
      item_code: line.itemCode || '—',
      uom: uom || 'KG',
      gp_qty: gpQty,
      rcv_qty: rcvQty,
      variance,
      status: statusText,
    };
  });

  return renderWhatsAppRepeatingLines('[RM-GP-LINE]', rows, '\n\n');
}

/**
 * Builds the `[RM-GP]` Raw Material Receipt (Gate Pass) WhatsApp message strictly
 * from Settings -> WhatsApp Messages (`rmReceipt` + `rmReceiptItemLine`).
 */
export function buildReceiptWhatsAppMessage(info: ShareReceiptInfo): string {
  const date = info.receiptDate || '—';
  const netDiff = Number(info.differenceTotal || 0);
  let netStatus = 'Balanced';
  let netVarianceStr = `${fmt(0)} KG`;
  if (netDiff > 0) {
    netStatus = 'Shortage';
    netVarianceStr = `-${fmt(netDiff)} KG`;
  } else if (netDiff < 0) {
    netStatus = 'Excess';
    netVarianceStr = `+${fmt(Math.abs(netDiff))} KG`;
  }

  const warehouseDisplay = info.warehouseName?.trim() || info.warehouseCode?.trim() || '—';
  const divisionDisplay = info.divisionName?.trim() || info.divisionCode?.trim() || '—';
  const sectionDisplay = info.sectionName?.trim() || info.sectionCode?.trim() || '—';
  const lineCountLabel = `${info.lines?.length || 0} Line${(info.lines?.length || 0) === 1 ? '' : 's'}`;

  return renderWhatsAppTemplate('[RM-GP]', {
    company: DEFAULT_COMPANY_NAME,
    receipt_code: info.receiptCode || '—',
    gate_pass_no: info.gatePassNo || '—',
    po_no: info.poCode || '—',
    source_no: info.sourceNo || '—',
    doc_no: info.gatePassNo || info.receiptCode || '—',
    heat_number: info.heatNumber || '—',
    date,
    warehouse: warehouseDisplay,
    division: divisionDisplay,
    section: sectionDisplay,
    lines_count: lineCountLabel,
    items: formatReceiptItemLines(info.lines),
    total_gp_qty: fmt(info.gatePassTotal),
    total_rcv_qty: fmt(info.receivedTotal),
    net_variance: `${netVarianceStr} (${netStatus})`,
  });
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

/**
 * Builds the `[RM-RET]` Raw Material Return WhatsApp message strictly
 * from Settings -> WhatsApp Messages (`rmReturn`).
 */
export function buildReturnWhatsAppMessage(info: ShareReturnInfo): string {
  const date = info.returnDate || '—';
  const warehouseDisplay = info.warehouseName?.trim() || info.warehouseCode?.trim() || '—';
  const divisionDisplay = info.divisionName?.trim() || info.divisionCode?.trim() || '—';
  const sectionDisplay = info.sectionName?.trim() || info.sectionCode?.trim() || '—';

  const itemLines: string[] = [];
  if (info.lines && info.lines.length > 0) {
    itemLines.push(`*RETURNED ITEMS (${info.lines.length} Line${info.lines.length > 1 ? 's' : ''}):*`);
    info.lines.forEach((line, idx) => {
      const itemTitle = formatNameWithCode(line.itemName, line.itemCode);
      const uom = line.uomCode ? ` ${line.uomCode}` : '';
      const qty = fmt(line.quantity);
      itemLines.push(`\n*${idx + 1}. ${itemTitle}*`);
      itemLines.push(`   • Returned Qty: ${qty}${uom}`);
    });
  }

  return renderWhatsAppTemplate('[RM-RET]', {
    company: DEFAULT_COMPANY_NAME,
    return_code: info.returnCode || '—',
    date,
    source_no: info.sourceNo || '—',
    ref_receipt: info.referenceReceiptCode || '—',
    warehouse: warehouseDisplay,
    division: divisionDisplay,
    section: sectionDisplay,
    reason: info.reason || '—',
    items: itemLines.join('\n') || 'No returned items.',
    total_qty: fmt(info.quantityTotal),
  });
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
  const digits = formatWhatsAppPhoneWithCountryCode(phone);
  if (digits.length < 8) return '';
  const url = new URL('https://wa.me/' + digits);
  if (message.trim()) url.searchParams.set('text', message.trim());
  return url.toString();
}

/** Digits-only phone. Returns null when it is clearly invalid (<8 digits). */
export function normalizeWaPhone(phone: string): string | null {
  const digits = formatWhatsAppPhoneWithCountryCode(phone);
  return digits.length >= 8 ? digits : null;
}
