/**
 * WhatsApp Share utility for Maintenance Job Cards
 * Formats rich industrial maintenance ticket summaries for WhatsApp groups and technician dispatch.
 */

import {
  formatWhatsAppPhoneWithCountryCode,
  renderWhatsAppTemplate,
  resolveWhatsAppTemplate,
} from './whatsappSettingsStore';

export const DEFAULT_JOB_CARD_WHATSAPP_TEMPLATE = `🏭 *Pakistan Wire Industries (Pvt.) LTD*
🔧 *MAINTENANCE JOB CARD SUMMARY*
━━━━━━━━━━━━━━━━━━━━━━━━━
🎫 *Job Card #:* *{job_card_no}*
📊 *Status:* *{status}*
{priority_line}━━━━━━━━━━━━━━━━━━━━━━━━━
⚙️ *Machine / Asset:* *{machine}*
{hierarchy_line}{location_line}{team_line}━━━━━━━━━━━━━━━━━━━━━━━━━
⚠️ *Reported Fault / Complaint:*
"{complaint}"
{reported_by_line}{timings_section}{technicians_section}{parts_section}{actions_section}━━━━━━━━━━━━━━━━━━━━━━━━━
📅 *Generated via PWI ERP System* • {generated_at}`;

export interface JobCardShareData {
  jobCardNo: string;
  currentStatus: string;
  priority?: string;
  complaint?: string;
  reportedByName?: string;
  requestedAt?: string;
  startedAt?: string;
  completedAt?: string;
  closedAt?: string;
  machine?: {
    name?: string;
    machineName?: string;
    code?: string;
    machineCode?: string;
    criticality?: string;
    location?: string;
  };
  division?: { name?: string };
  section?: { name?: string };
  department?: { name?: string };
  team?: { name?: string };
  technicians?: Array<{ name?: string; technician?: { name?: string } }>;
  diagnosis?: string;
  correctiveAction?: string;
  preventiveAction?: string;
  timings?: {
    waitMinutes?: number;
    grossRepairMinutes?: number;
    partsHoldMinutes?: number;
    netRepairMinutes?: number;
  };
  parts?: Array<{
    name?: string;
    partName?: string;
    partCode?: string;
    quantity?: number;
    uom?: string;
  }>;
}

function formatDuration(minutes?: number): string {
  if (minutes === undefined || minutes === null) return '—';
  if (minutes < 1) return '< 1m';
  if (minutes < 60) return `${minutes}m`;
  const hrs = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hrs < 24) return mins > 0 ? `${hrs}h ${mins}m` : `${hrs}h`;
  const days = Math.floor(hrs / 24);
  const remHrs = hrs % 24;
  return remHrs > 0 ? `${days}d ${remHrs}h` : `${days}d`;
}

export function buildJobCardWhatsAppMessage(card: JobCardShareData): string {
  const statusLabel = (card.currentStatus || 'OPEN').replace(/_/g, ' ').toUpperCase();
  const mName = card.machine?.name || card.machine?.machineName || 'Machine Asset';
  const mCode = card.machine?.code || card.machine?.machineCode ? ` [${card.machine?.code || card.machine?.machineCode}]` : '';

  const hierarchyParts: string[] = [];
  if (card.division?.name) hierarchyParts.push(card.division.name);
  if (card.section?.name) hierarchyParts.push(card.section.name);
  if (card.department?.name) hierarchyParts.push(card.department.name);

  let timingsSection = '';
  if (card.timings) {
    const tLines = [
      '━━━━━━━━━━━━━━━━━━━━━━━━━',
      '⏱️ *LIFECYCLE TIMINGS:*',
      `• ⏳ *Response Wait:* ${formatDuration(card.timings.waitMinutes)} (Open → Start)`,
      `• 🕒 *Gross Repair:* ${formatDuration(card.timings.grossRepairMinutes)}`,
    ];
    if (card.timings.partsHoldMinutes && card.timings.partsHoldMinutes > 0) {
      tLines.push(`• ⏸️ *Parts Delay:* ${formatDuration(card.timings.partsHoldMinutes)} (Hold)`);
    }
    tLines.push(`• ✅ *Net Active Labor:* ${formatDuration(card.timings.netRepairMinutes)}`);
    timingsSection = `${tLines.join('\n')}\n`;
  }

  let techniciansSection = '';
  if (card.technicians && card.technicians.length > 0) {
    const techNames = card.technicians.map((t) => t.name || t.technician?.name).filter(Boolean).join(', ');
    if (techNames) {
      techniciansSection = `━━━━━━━━━━━━━━━━━━━━━━━━━\n👷 *Assigned Technicians:* ${techNames}\n`;
    }
  }

  let partsSection = '';
  if (card.parts && card.parts.length > 0) {
    const pLines = ['━━━━━━━━━━━━━━━━━━━━━━━━━', `🔩 *REPLACED SPARE PARTS (${card.parts.length}):*`];
    card.parts.forEach((p, idx) => {
      const pName = p.partName || p.name || 'Spare Part';
      const pCode = p.partCode ? ` [${p.partCode}]` : '';
      const qtyStr = p.quantity !== undefined ? ` • Qty: ${p.quantity} ${p.uom || 'Pcs'}` : '';
      pLines.push(`${idx + 1}. ${pName}${pCode}${qtyStr}`);
    });
    partsSection = `${pLines.join('\n')}\n`;
  }

  let actionsSection = '';
  if (card.diagnosis || card.correctiveAction || card.preventiveAction) {
    const aLines = ['━━━━━━━━━━━━━━━━━━━━━━━━━', '📋 *TECHNICAL ACTIONS TAKEN:*'];
    if (card.diagnosis) aLines.push(`• *Diagnosis:* ${card.diagnosis}`);
    if (card.correctiveAction) aLines.push(`• *Corrective:* ${card.correctiveAction}`);
    if (card.preventiveAction) aLines.push(`• *Preventive:* ${card.preventiveAction}`);
    actionsSection = `${aLines.join('\n')}\n`;
  }

  const template = resolveWhatsAppTemplate('maintenanceJobCard', DEFAULT_JOB_CARD_WHATSAPP_TEMPLATE);
  return renderWhatsAppTemplate(template, {
    '{job_card_no}': card.jobCardNo || '',
    '{status}': statusLabel,
    '{priority_line}': card.priority ? `⚡ *Priority:* ${card.priority}\n` : '',
    '{machine}': `${mName}${mCode}`,
    '{hierarchy_line}': hierarchyParts.length > 0 ? `🏢 *Hierarchy:* ${hierarchyParts.join(' • ')}\n` : '',
    '{location_line}': card.machine?.location ? `📍 *Location:* ${card.machine.location}\n` : '',
    '{team_line}': card.team?.name ? `👥 *Team:* ${card.team.name}\n` : '',
    '{complaint}': card.complaint || 'No complaint notes logged.',
    '{reported_by_line}': card.reportedByName ? `👤 *Reported By:* ${card.reportedByName}\n` : '',
    '{timings_section}': timingsSection,
    '{technicians_section}': techniciansSection,
    '{parts_section}': partsSection,
    '{actions_section}': actionsSection,
    '{generated_at}': new Date().toLocaleString(),
  });
}

/**
 * Opens WhatsApp Web or WhatsApp Desktop/Mobile app
 * If phone is provided, sends direct message. If not, allows picking any group or contact.
 */
export function openWhatsAppShare(text: string, phone?: string): void {
  const formattedPhone = formatWhatsAppPhoneWithCountryCode(phone);
  const encodedText = encodeURIComponent(text);

  const url = formattedPhone
    ? `https://api.whatsapp.com/send?phone=${formattedPhone}&text=${encodedText}`
    : `https://api.whatsapp.com/send?text=${encodedText}`;

  window.open(url, '_blank', 'noopener,noreferrer');
}
