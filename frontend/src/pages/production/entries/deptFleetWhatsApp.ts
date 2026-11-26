import dayjs from 'dayjs';
import { formatNumber } from '../../../utils/numberFormat';
import {
  formatWhatsAppPhoneWithCountryCode,
  renderWhatsAppTemplate,
  resolveWhatsAppTemplate,
  WHATSAPP_SETTINGS_STORAGE_KEY,
} from '../../../utils/whatsappSettingsStore';

export interface MachineEntryMini {
  id: string;
  entryId?: string;
  itemId: string;
  itemCode?: string | null;
  itemName: string | null;
  targetQuantity: number;
  actualQuantity: number;
  uom?: string | null;
  remarks?: string | null;
}

export interface MachineStatusRow {
  id: string;
  systemCode: string;
  machineCode: string;
  name: string;
  machineStatus?: string;
  status: 'ENTERED' | 'ENTRY_REQUIRED';
  entryCount: number;
  primaryEntryId?: string | null;
  remarks?: string | null;
  divisionId: string | null;
  sectionId: string | null;
  departmentId: string | null;
  departmentName: string | null;
  targetQuantity?: number | null;
  actualQuantity?: number;
  uom?: string | null;
  achievementPercentage?: number | null;
  variance?: number | null;
  entries: MachineEntryMini[];
}

export interface DeptFleetWhatsAppParams {
  department: {
    id: string;
    name: string;
    departmentCode?: string;
  };
  divisionName?: string;
  sectionName?: string;
  shiftName?: string;
  shiftTiming?: string;
  dateStr?: string; // e.g. "2026-11-05" or "05-Nov-2026"
  machines: MachineStatusRow[];
}

/**
 * Formats machine-level remarks cleanly for mobile WhatsApp readability.
 */
function formatMachineRemarks(rawRemarks: Array<string | null | undefined>): string[] {
  const uniqueBlocks = Array.from(
    new Set(
      rawRemarks
        .map((r) => String(r || '').replace(/\r\n/g, '\n').trim())
        .filter(Boolean)
    )
  );
  if (uniqueBlocks.length === 0) return [];

  const lines: string[] = [];
  uniqueBlocks.forEach((block) => {
    block
      .split(/\n|;/)
      .map((part) => part.replace(/\s+/g, ' ').trim())
      .filter(Boolean)
      .forEach((clean) => lines.push(clean));
  });
  return Array.from(new Set(lines));
}

/**
 * Natural sort machine codes/names so ST-02 comes before ST-10
 */
function naturalSortMachines(a: MachineStatusRow, b: MachineStatusRow): number {
  const codeA = a.machineCode || a.systemCode || a.name || '';
  const codeB = b.machineCode || b.systemCode || b.name || '';
  return codeA.localeCompare(codeB, undefined, { numeric: true, sensitivity: 'base' });
}

export const PROD_FLEET_WHATSAPP_STORAGE_KEY = WHATSAPP_SETTINGS_STORAGE_KEY;

export const DEFAULT_FLEET_TEMPLATE = `*PAKISTAN WIRE INDUSTRIES (PVT.) LTD*
*DAILY SHIFT PRODUCTION REPORT*
━━━━━━━━━━━━━━━━━━━━
*Department:* *{department}*
*Date:* *{date}*
{shift_line}*Division:* *{division}*
{section_line}*Fleet Status:* {fleet_status}
━━━━━━━━━━━━━━━━━━━━

*MACHINE-WISE PRODUCTION:*

{machine_rows}
━━━━━━━━━━━━━━━━━━━━
*{department} TOTALS:*
• *Total Machines:* {fleet_status}
• *Total Production:* *{total_production}*
• *Overall Achievement:* *{overall_achievement}*

*ITEM-WISE TOTAL SUMMARY:*
{item_summary}
━━━━━━━━━━━━━━━━━━━━
_Generated via PWI ERP System_`;

/**
 * Retrieves custom Daily Production Fleet WhatsApp template configured in Settings > WhatsApp Messages
 */
export function getStoredFleetTemplate(): string | null {
  const custom = resolveWhatsAppTemplate('dailyProductionFleet', '');
  return custom || null;
}

/**
 * Builds a clean, professional, mobile-ready WhatsApp report
 * for a specific manufacturing department fleet.
 */
export function buildDepartmentFleetWhatsAppText(params: DeptFleetWhatsAppParams): string {
  const { department, divisionName, sectionName, shiftName, shiftTiming, dateStr, machines } = params;

  // Filter active machines for this department
  const deptMachines = (machines || [])
    .filter((m) => m.departmentId === department.id && (m.machineStatus ? m.machineStatus === 'ACTIVE' : true))
    .sort(naturalSortMachines);

  const formattedDate = dateStr
    ? dayjs(dateStr).isValid()
      ? dayjs(dateStr).format('DD-MMM-YYYY')
      : dateStr
    : dayjs().format('DD-MMM-YYYY');

  const enteredCount = deptMachines.filter((m) => m.status === 'ENTERED').length;
  const pendingCount = deptMachines.filter((m) => m.status === 'ENTRY_REQUIRED').length;

  let totalTarget = 0;
  let totalActual = 0;
  let primaryUom = 'PCS';

  // Map to accumulate item-wise totals across all machines in this department
  const itemTotalsMap = new Map<string, { itemName: string; totalQty: number; uom: string }>();

  const machineRows: string[] = [];

  deptMachines.forEach((m, idx) => {
    const hasEntries = m.entries && m.entries.length > 0;

    const target = m.targetQuantity !== undefined && m.targetQuantity !== null
      ? Number(m.targetQuantity)
      : hasEntries
        ? m.entries.reduce((sum, e) => sum + (Number(e.targetQuantity) || 0), 0)
        : 0;

    const actual = m.actualQuantity !== undefined && m.actualQuantity !== null
      ? Number(m.actualQuantity)
      : hasEntries
        ? m.entries.reduce((sum, e) => sum + (Number(e.actualQuantity) || 0), 0)
        : 0;

    const uom = m.uom || (hasEntries ? m.entries[0]?.uom : null) || 'PCS';
    if (idx === 0) primaryUom = uom;

    const achievement = m.achievementPercentage !== undefined && m.achievementPercentage !== null
      ? Number(m.achievementPercentage)
      : target > 0
        ? Number(((actual / target) * 100).toFixed(2))
        : (actual > 0 ? 100 : 0);

    totalTarget += target;
    totalActual += actual;

    // Status text without tick or hourglass emoji as requested
    const statusText = m.status === 'ENTERED' ? 'Entered' : 'Entry Required';
    // Achievement tone: up triangle for >= 70%, down triangle for < 70% (no colored circle balls)
    const achTone = achievement >= 70 ? '▲' : '▼';

    const displayName = m.machineCode
      ? `${m.machineCode} — ${m.name}`
      : m.name || m.systemCode || `Machine ${idx + 1}`;

    machineRows.push(`*${displayName}* [${statusText}]`);
    machineRows.push(`   *Actual:* ${formatNumber(actual, 0)} ${uom}`);
    machineRows.push(`   *Achievement:* ${achievement.toFixed(2)}% ${achTone}`);

    // Items Breakdown & Item totals accumulation - multi-line bullet list without forced emojis
    if (hasEntries) {
      machineRows.push('   *Items:*');
      m.entries.forEach((e) => {
        const iName = e.itemName || e.itemCode || 'Item';
        const eUom = e.uom || uom;
        const eQty = Number(e.actualQuantity) || 0;

        // Accumulate into department item-wise summary
        const key = e.itemId || e.itemCode || iName;
        const existing = itemTotalsMap.get(key);
        if (existing) {
          existing.totalQty += eQty;
        } else {
          itemTotalsMap.set(key, { itemName: iName, totalQty: eQty, uom: eUom });
        }

        machineRows.push(`   * ${iName} (${formatNumber(eQty, 0)} ${eUom})`);
      });
    }

    // Machine-wise Remarks (only if non-empty)
    const remarkLines = formatMachineRemarks([
      m.remarks,
      ...(m.entries || []).map((e) => e.remarks),
    ]);
    if (remarkLines.length === 1) {
      machineRows.push('   *Remarks:*');
      machineRows.push(`     ${remarkLines[0]}`);
    } else if (remarkLines.length > 1) {
      machineRows.push('   *Remarks:*');
      remarkLines.forEach((line) => {
        machineRows.push(`     - ${line}`);
      });
    }

    machineRows.push('   ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄');
  });

  const overallAch = totalTarget > 0 ? Number(((totalActual / totalTarget) * 100).toFixed(2)) : 0;
  const overallTone = overallAch >= 70 ? '▲' : '▼';
  const overallAchText = `${overallAch.toFixed(2)}% ${overallTone}`;
  const totalProdText = `${formatNumber(totalActual, 0)} ${primaryUom}`;
  const fleetStatusText = `${deptMachines.length} Machines (${enteredCount} Entered / ${pendingCount} Pending)`;

  // Item-wise totals summary at the end
  const itemSummaryLines: string[] = [];
  if (itemTotalsMap.size > 0) {
    Array.from(itemTotalsMap.values()).forEach((item) => {
      itemSummaryLines.push(`• *${item.itemName}:* *${formatNumber(item.totalQty, 0)} ${item.uom}*`);
    });
  }

  const shiftText = shiftName ? `*${shiftName}*${shiftTiming ? ` (${shiftTiming})` : ''}` : '';
  const shiftLine = shiftText ? `*Shift:* ${shiftText}\n` : '';
  const sectionLine = sectionName ? `*Section:* *${sectionName}*\n` : '';

  // Render via centralized 0ms template renderer ([PROD-FLEET])
  return renderWhatsAppTemplate(
    '[PROD-FLEET]',
    {
      company: 'PAKISTAN WIRE INDUSTRIES (PVT.) LTD',
      department: department.name.toUpperCase(),
      date: formattedDate,
      shift_line: shiftLine,
      shift: shiftText || '—',
      division: divisionName || '—',
      section_line: sectionLine,
      section: sectionName || '—',
      fleet_status: fleetStatusText,
      machines_count: String(deptMachines.length),
      entered_count: String(enteredCount),
      pending_count: String(pendingCount),
      total_production: totalProdText,
      overall_achievement: overallAchText,
      machine_rows: machineRows.join('\n'),
      item_summary: itemSummaryLines.join('\n'),
    },
    true,
  );
}

/**
 * Dispatches the WhatsApp message directly to WhatsApp (Web or Mobile App)
 * and copies to clipboard for seamless reliability.
 */
export function openWhatsAppDirect(text: string, phone?: string): void {
  if (!text) return;

  // Copy to clipboard first
  if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).catch(() => {});
  }

  const cleanPhone = phone ? phone.replace(/[^0-9]/g, '') : '';
  const url = cleanPhone
    ? `https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encodeURIComponent(text)}`
    : `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;

  window.open(url, '_blank', 'noopener,noreferrer');
}

