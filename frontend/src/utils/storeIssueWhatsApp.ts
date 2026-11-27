import dayjs from 'dayjs';
import {
  DEFAULT_COMPANY_NAME,
  openWhatsAppWithTemplate,
  renderWhatsAppTemplate,
} from './whatsappTemplateRenderer';

export interface StoreIssueWhatsAppLineInput {
  itemCode?: string;
  itemName?: string;
  quantity: number;
  uomCode?: string;
  oldItemReturnedQty?: number;
  lastIssuedSummary?: string;
  remainingStock?: number;
  remainingStockUom?: string;
  remarks?: string;
}

export interface StoreIssueWhatsAppInput {
  companyName?: string;
  sinNumber?: string;
  date?: string;
  divisionName?: string;
  sectionName?: string;
  machineName?: string;
  operatorName?: string;
  shiftInchargeName?: string;
  issuedByName?: string;
  purpose?: string;
  remarks?: string;
  lines: StoreIssueWhatsAppLineInput[];
}

function fmtNum(val: number | undefined | null): string {
  const num = Number(val ?? 0);
  if (!Number.isFinite(num)) return '0';
  return Number.isInteger(num)
    ? num.toLocaleString('en-US')
    : Number(num.toFixed(2)).toLocaleString('en-US');
}

/**
 * Formats the part-on-machine history summary into up to 3 crisp, mobile-friendly lines:
 *   Last Issued: 16-Oct-2026 (SIN-20261016-65057 · 1 SET)
 *   Production Since Last Issue: 6,286.92 GRS (905,317 PCS)
 *   Total Issues on Machine: 1
 */
export function formatLastIssuedSummaryForWhatsApp(rawSummary?: string): string {
  const clean = String(rawSummary || '').trim();
  if (!clean) return 'First time issuing this part to this machine';
  if (/^First time issuing/i.test(clean)) return clean;

  // Split inline "Last Issued: ... · Production Since Last Issue: ... · Total Issues: ..." cleanly
  const normalized = clean
    .replace(/\s*[·|]\s*Production Since Last Issue:/i, '\nProduction Since Last Issue:')
    .replace(/\s*[·|]\s*Machine Production Since Then:/i, '\nProduction Since Last Issue:')
    .replace(/\s*[·|]\s*Total Issues(?:\s+on Machine)?:/i, '\nTotal Issues on Machine:');

  return normalized
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .join('\n');
}

export function buildStoreIssueWhatsAppReplacements(
  input: StoreIssueWhatsAppInput,
): Record<string, string> {
  const formattedDate = input.date ? dayjs(input.date).format('DD-MMM-YYYY') : dayjs().format('DD-MMM-YYYY');
  const receiverParts = [
    input.operatorName ? `Operator: ${input.operatorName}` : '',
    input.shiftInchargeName ? `Shift Incharge: ${input.shiftInchargeName}` : '',
  ].filter(Boolean);

  const lines = Array.isArray(input.lines) ? input.lines : [];

  const itemsText =
    lines.length > 0
      ? lines
          .map((l, idx) => {
            const label = [l.itemCode, l.itemName].filter(Boolean).join(' — ') || 'Store Item';
            const retPart =
              Number(l.oldItemReturnedQty || 0) > 0
                ? ` | Old Scrap Returned: ${fmtNum(l.oldItemReturnedQty)} ${l.uomCode || ''}`.trimEnd()
                : '';
            return `${idx + 1}. *${label}*\n   Qty Issued: ${fmtNum(l.quantity)} ${l.uomCode || 'PCS'}${retPart}`;
          })
          .join('\n')
      : 'No items listed';

  const lastIssuedText =
    lines
      .map((l, idx) => {
        const formatted = formatLastIssuedSummaryForWhatsApp(l.lastIssuedSummary);
        if (lines.length > 1) {
          return `${idx + 1}. *${l.itemCode || l.itemName || 'Item'}*\n${formatted}`;
        }
        return formatted;
      })
      .join('\n\n') || 'First time issuing this part to this machine';

  const remainingStockText =
    lines.length > 0
      ? lines
          .map((l, idx) => {
            const codeLabel = [l.itemCode, l.itemName].filter(Boolean).join(' — ') || 'Item';
            const uom = l.remainingStockUom || l.uomCode || 'PCS';
            const rem = l.remainingStock !== undefined && l.remainingStock !== null ? fmtNum(l.remainingStock) : '—';
            const prefix = lines.length > 1 ? `${idx + 1}. ` : '';
            return `${prefix}${codeLabel}: ${rem} ${uom}`;
          })
          .join('\n')
      : '—';

  const remarksCombined = [input.purpose, input.remarks]
    .map((s) => String(s || '').trim())
    .filter(Boolean)
    .join(' | ');

  return {
    company: input.companyName || DEFAULT_COMPANY_NAME,
    sin_number: input.sinNumber || 'DRAFT',
    date: formattedDate,
    division: input.divisionName || '—',
    section: input.sectionName || '—',
    machine: input.machineName || 'General Allocation',
    receiver: receiverParts.join(' | ') || '—',
    issued_by: input.issuedByName || 'Store Incharge',
    items: itemsText,
    last_issued_summary: lastIssuedText,
    remaining_stock: remainingStockText,
    remarks: remarksCombined || '—',
  };
}

export function buildStoreIssueWhatsAppMessage(input: StoreIssueWhatsAppInput): string {
  return renderWhatsAppTemplate('[SIN-ISSUE]', buildStoreIssueWhatsAppReplacements(input));
}

export function shareStoreIssueOnWhatsApp(
  input: StoreIssueWhatsAppInput,
  phone?: string,
): string {
  return openWhatsAppWithTemplate(
    '[SIN-ISSUE]',
    buildStoreIssueWhatsAppReplacements(input),
    phone,
  );
}
