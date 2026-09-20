/**
 * WhatsApp Share utility for Maintenance Job Cards
 * Formats rich industrial maintenance ticket summaries for WhatsApp groups and technician dispatch.
 */

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
  const lines: string[] = [];

  lines.push('🏭 *PAKISTAN WIRE INDUSTRIES (PVT) LTD*');
  lines.push('🔧 *MAINTENANCE JOB CARD SUMMARY*');
  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━');
  lines.push(`🎫 *Job Card #:* *${card.jobCardNo}*`);

  const statusLabel = (card.currentStatus || 'OPEN').replace(/_/g, ' ').toUpperCase();
  lines.push(`📊 *Status:* *${statusLabel}*`);

  if (card.priority) {
    lines.push(`⚡ *Priority:* ${card.priority}`);
  }

  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━');

  const mName = card.machine?.name || card.machine?.machineName || 'Machine Asset';
  const mCode = card.machine?.code || card.machine?.machineCode ? ` [${card.machine?.code || card.machine?.machineCode}]` : '';
  lines.push(`⚙️ *Machine / Asset:* *${mName}${mCode}*`);

  const hierarchyParts: string[] = [];
  if (card.division?.name) hierarchyParts.push(card.division.name);
  if (card.section?.name) hierarchyParts.push(card.section.name);
  if (card.department?.name) hierarchyParts.push(card.department.name);
  if (hierarchyParts.length > 0) {
    lines.push(`🏢 *Hierarchy:* ${hierarchyParts.join(' • ')}`);
  }

  if (card.machine?.location) {
    lines.push(`📍 *Location:* ${card.machine.location}`);
  }

  if (card.team?.name) {
    lines.push(`👥 *Team:* ${card.team.name}`);
  }

  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━');
  lines.push(`⚠️ *Reported Fault / Complaint:*`);
  lines.push(`"${card.complaint || 'No complaint notes logged.'}"`);

  if (card.reportedByName) {
    lines.push(`👤 *Reported By:* ${card.reportedByName}`);
  }

  // Timings
  if (card.timings) {
    lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━');
    lines.push('⏱️ *LIFECYCLE TIMINGS:*');
    lines.push(`• ⏳ *Response Wait:* ${formatDuration(card.timings.waitMinutes)} (Open → Start)`);
    lines.push(`• 🕒 *Gross Repair:* ${formatDuration(card.timings.grossRepairMinutes)}`);
    if (card.timings.partsHoldMinutes && card.timings.partsHoldMinutes > 0) {
      lines.push(`• ⏸️ *Parts Delay:* ${formatDuration(card.timings.partsHoldMinutes)} (Hold)`);
    }
    lines.push(`• ✅ *Net Active Labor:* ${formatDuration(card.timings.netRepairMinutes)}`);
  }

  // Assigned Technicians
  if (card.technicians && card.technicians.length > 0) {
    const techNames = card.technicians
      .map((t) => t.name || t.technician?.name)
      .filter(Boolean)
      .join(', ');
    if (techNames) {
      lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━');
      lines.push(`👷 *Assigned Technicians:* ${techNames}`);
    }
  }

  // Replaced Spare Parts
  if (card.parts && card.parts.length > 0) {
    lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━');
    lines.push(`🔩 *REPLACED SPARE PARTS (${card.parts.length}):*`);
    card.parts.forEach((p, idx) => {
      const pName = p.partName || p.name || 'Spare Part';
      const pCode = p.partCode ? ` [${p.partCode}]` : '';
      const qtyStr = p.quantity !== undefined ? ` • Qty: ${p.quantity} ${p.uom || 'Pcs'}` : '';
      lines.push(`${idx + 1}. ${pName}${pCode}${qtyStr}`);
    });
  }

  // Technical Diagnosis & Actions
  if (card.diagnosis || card.correctiveAction || card.preventiveAction) {
    lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━');
    lines.push('📋 *TECHNICAL ACTIONS TAKEN:*');
    if (card.diagnosis) lines.push(`• *Diagnosis:* ${card.diagnosis}`);
    if (card.correctiveAction) lines.push(`• *Corrective:* ${card.correctiveAction}`);
    if (card.preventiveAction) lines.push(`• *Preventive:* ${card.preventiveAction}`);
  }

  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━');
  lines.push(`📅 *Generated via PWI ERP System* • ${new Date().toLocaleString()}`);

  return lines.join('\n');
}

/**
 * Opens WhatsApp Web or WhatsApp Desktop/Mobile app
 * If phone is provided, sends direct message. If not, allows picking any group or contact.
 */
export function openWhatsAppShare(text: string, phone?: string): void {
  const cleanPhone = phone ? phone.replace(/[^0-9]/g, '') : '';
  const encodedText = encodeURIComponent(text);

  let url: string;
  if (cleanPhone) {
    // If local Pakistani 03xx number, convert to 923xx
    const formattedPhone = cleanPhone.startsWith('0')
      ? `92${cleanPhone.slice(1)}`
      : cleanPhone;
    url = `https://api.whatsapp.com/send?phone=${formattedPhone}&text=${encodedText}`;
  } else {
    url = `https://api.whatsapp.com/send?text=${encodedText}`;
  }

  window.open(url, '_blank', 'noopener,noreferrer');
}
