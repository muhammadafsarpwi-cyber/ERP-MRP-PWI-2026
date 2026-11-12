import dayjs from 'dayjs';
import { formatNumber } from '../../../utils/numberFormat';

export interface MachineEntryMini {
  id: string;
  entryId?: string;
  itemId: string;
  itemCode?: string | null;
  itemName: string | null;
  targetQuantity: number;
  actualQuantity: number;
  uom?: string | null;
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

const NUMBER_EMOJIS = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];

/**
 * Natural sort machine codes/names so ST-02 comes before ST-10
 */
function naturalSortMachines(a: MachineStatusRow, b: MachineStatusRow): number {
  const codeA = a.machineCode || a.systemCode || a.name || '';
  const codeB = b.machineCode || b.systemCode || b.name || '';
  return codeA.localeCompare(codeB, undefined, { numeric: true, sensitivity: 'base' });
}

export const PROD_FLEET_WHATSAPP_STORAGE_KEY = 'erp_whatsapp_settings_v1';

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
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const saved = window.localStorage.getItem(PROD_FLEET_WHATSAPP_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (
          parsed?.templates?.dailyProductionFleet &&
          typeof parsed.templates.dailyProductionFleet === 'string' &&
          parsed.templates.dailyProductionFleet.trim()
        ) {
          return parsed.templates.dailyProductionFleet.trim();
        }
      }
    }
  } catch {}
  return null;
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

    const numEmoji = idx < NUMBER_EMOJIS.length ? NUMBER_EMOJIS[idx] : `#${idx + 1}`;
    // Status text without tick or hourglass emoji as requested
    const statusText = m.status === 'ENTERED' ? 'Entered' : 'Entry Required';
    // Achievement tone: green circle up for >= 70%, red circle down for < 70%
    const achTone = achievement >= 70 ? '🟢 ▲' : '🔴 ▼';

    const displayName = m.machineCode
      ? `${m.machineCode} — ${m.name}`
      : m.name || m.systemCode || `Machine ${idx + 1}`;

    machineRows.push(`${numEmoji} *${displayName}* [${statusText}]`);
    machineRows.push(`   *Actual:* ${formatNumber(actual, 0)} ${uom}`);
    machineRows.push(`   *Achievement:* ${achievement.toFixed(2)}% ${achTone}`);

    // Items Breakdown & Item totals accumulation - multi-line bullet list as requested
    if (hasEntries) {
      machineRows.push('   🏷️ *Items:*');
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

    machineRows.push('   ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄');
  });

  const overallAch = totalTarget > 0 ? Number(((totalActual / totalTarget) * 100).toFixed(2)) : 0;
  const overallTone = overallAch >= 70 ? '🟢 ▲' : '🔴 ▼';
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

  // Load custom template from Settings > WhatsApp Messages if configured by user
  const customTemplate = getStoredFleetTemplate();
  const templateToUse = customTemplate || DEFAULT_FLEET_TEMPLATE;

  return templateToUse
    .replace(/\{company\}/gi, 'PAKISTAN WIRE INDUSTRIES (PVT.) LTD')
    .replace(/\{department\}/gi, department.name.toUpperCase())
    .replace(/\{date\}/gi, formattedDate)
    .replace(/\{shift_line\}/gi, shiftLine)
    .replace(/\{shift\}/gi, shiftText || '—')
    .replace(/\{division\}/gi, divisionName || '—')
    .replace(/\{section_line\}/gi, sectionLine)
    .replace(/\{section\}/gi, sectionName || '—')
    .replace(/\{fleet_status\}/gi, fleetStatusText)
    .replace(/\{machines_count\}/gi, String(deptMachines.length))
    .replace(/\{entered_count\}/gi, String(enteredCount))
    .replace(/\{pending_count\}/gi, String(pendingCount))
    .replace(/\{total_production\}/gi, totalProdText)
    .replace(/\{overall_achievement\}/gi, overallAchText)
    .replace(/\{machine_rows\}/gi, machineRows.join('\n'))
    .replace(/\{item_summary\}/gi, itemSummaryLines.join('\n'));
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

