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

/**
 * Builds a clean, professional, mobile-ready WhatsApp report
 * for a specific manufacturing department fleet.
 */
export function buildDepartmentFleetWhatsAppText(params: DeptFleetWhatsAppParams): string {
  const { department, divisionName, shiftName, shiftTiming, dateStr, machines } = params;

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

  const out: string[] = [];

  // Header Banner
  out.push('🏭 *PAKISTAN WIRE INDUSTRIES (PVT.) LTD*');
  out.push('📋 *DAILY SHIFT PRODUCTION REPORT*');
  out.push('━━━━━━━━━━━━━━━━━━━━');
  out.push(`🏢 *Department:* *${department.name.toUpperCase()}*`);
  out.push(`📅 *Date:* *${formattedDate}*`);
  if (shiftName) {
    out.push(`⏰ *Shift:* *${shiftName}*${shiftTiming ? ` (${shiftTiming})` : ''}`);
  }
  if (divisionName) {
    out.push(`📍 *Division:* *${divisionName}*`);
  }
  out.push(`📊 *Fleet Status:* ${deptMachines.length} Machines (${enteredCount} Entered / ${pendingCount} Pending)`);
  out.push('━━━━━━━━━━━━━━━━━━━━');
  out.push('');
  out.push('⚙️ *MACHINE-WISE PRODUCTION:*');
  out.push('');

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
    const statusIcon = m.status === 'ENTERED' ? '✅ Entered' : '⏳ Entry Required';
    // User requested achievement threshold indicator: >= 70% is ▲, below is ▼
    const achTone = achievement >= 70 ? '▲' : '▼';

    const displayName = m.machineCode
      ? `${m.machineCode} — ${m.name}`
      : m.name || m.systemCode || `Machine ${idx + 1}`;

    out.push(`${numEmoji} *${displayName}* [${statusIcon}]`);
    out.push(`   📦 *Actual:* ${formatNumber(actual, 0)} ${uom}`);
    out.push(`   📊 *Achievement:* ${achievement.toFixed(2)}% ${achTone}`);

    // Items Breakdown & Item totals accumulation
    if (hasEntries) {
      const itemSummaries = m.entries.map((e) => {
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

        return `${iName} (${formatNumber(eQty, 0)} ${eUom})`;
      });
      out.push(`   🏷️ *Items:* ${itemSummaries.join(', ')}`);
    }

    out.push('   ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄');
  });

  const overallAch = totalTarget > 0 ? Number(((totalActual / totalTarget) * 100).toFixed(2)) : 0;
  const overallTone = overallAch >= 70 ? '▲' : '▼';

  // Summary Totals
  out.push('');
  out.push('━━━━━━━━━━━━━━━━━━━━');
  out.push(`📊 *${department.name.toUpperCase()} TOTALS:*`);
  out.push(`• *Total Machines:* ${deptMachines.length} (${enteredCount} Entered / ${pendingCount} Pending)`);
  out.push(`• *Total Production:* *${formatNumber(totalActual, 0)} ${primaryUom}*`);
  out.push(`• *Overall Achievement:* *${overallAch.toFixed(2)}%* ${overallTone}`);

  // Item-wise totals summary at the end
  if (itemTotalsMap.size > 0) {
    out.push('');
    out.push('📦 *ITEM-WISE TOTAL SUMMARY:*');
    Array.from(itemTotalsMap.values()).forEach((item) => {
      out.push(`• *${item.itemName}:* *${formatNumber(item.totalQty, 0)} ${item.uom}*`);
    });
  }

  out.push('━━━━━━━━━━━━━━━━━━━━');
  out.push('📱 _Generated via PWI ERP System_');

  return out.join('\n');
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

