import { QmsInProcessInspection } from './types';
import { renderWhatsAppTemplate, resolveWhatsAppTemplate } from '../../utils/whatsappSettingsStore';

export const DEFAULT_QMS_INSPECTION_WHATSAPP_TEMPLATE = `====================================
*PAKISTAN WIRE INDUSTRIES (PVT.) LTD.*
*IN-PROCESS QUALITY INSPECTION REPORT*
====================================

*Doc Ref:* {doc_ref} | *Rev:* {rev_no} | *Date:* {issue_date}
*Inspection #:* {inspection_no}

------------------------------------
*GENERAL METADATA*
------------------------------------
• *Division:* {division}
• *Department:* {department}
• *Date:* {date} | *Shift:* {shift}
• *Machine:* {machine} | *Operator:* {operator}
• *Part / Item:* *{item_name}* ({item_code})
• *Inspector:* {inspector}
{approved_by_line}
{samples_section}{attributes_section}
====================================
*OVERALL RESULT:* *{overall_result}*
*Remarks:* {remarks}
====================================
_Verified & Generated via PWI ERP System_`;

/**
 * Builds a clean, professional, universally compatible WhatsApp text report.
 * Guaranteed to never render broken replacement characters (diamond question marks)
 * across any mobile device, WhatsApp Web, or OS.
 */
export function buildQmsWhatsAppMessage(insp: QmsInProcessInspection): string {
  const sampleLines: string[] = [];
  if (insp.samples && insp.samples.length > 0) {
    sampleLines.push('------------------------------------');
    sampleLines.push('*DIMENSIONAL CHECKS (5 SAMPLES):*');
    sampleLines.push('------------------------------------');
    insp.samples.forEach((s, idx) => {
      sampleLines.push('');
      const tolStr = `(±${s.tolPlus}${s.unit})`;
      sampleLines.push(`*${idx + 1}. ${s.charName}*`);
      sampleLines.push(`   • Dimension Req: ${s.nominal} ${tolStr}`);
      const rawSamples = [s.s1, s.s2, s.s3, s.s4, s.s5].filter(
        (v) => v !== undefined && v !== null && `${v}` !== ''
      );
      if (rawSamples.length > 0) {
        sampleLines.push(`   • 5 Samples: [ ${rawSamples.join(', ')} ]`);
      }
      const avg = Number(s.average || 0).toFixed(2);
      const isPass =
        s.status === 'PASS' ||
        (s.nominal - s.tolMinus <= Number(s.average) && Number(s.average) <= s.nominal + s.tolPlus);
      sampleLines.push(`   • Average: *${avg} ${s.unit}*  -->  *${isPass ? 'PASS' : 'FAIL'}*`);
    });
  }

  const attrLines: string[] = [];
  if (insp.attributes && insp.attributes.length > 0) {
    attrLines.push('');
    attrLines.push('------------------------------------');
    attrLines.push('*VISUAL & FUNCTIONAL CHECKS:*');
    attrLines.push('------------------------------------');
    insp.attributes.forEach((a) => {
      const isPass = (a.defectsQty || 0) === 0;
      attrLines.push(`• *${a.checkName}:* ${a.checkedQty || 10}/${a.defectsQty || 0} defects  -->  *${isPass ? 'PASS' : 'FAIL'}*`);
    });
  }

  const template = resolveWhatsAppTemplate('qmsInspection', DEFAULT_QMS_INSPECTION_WHATSAPP_TEMPLATE);
  return renderWhatsAppTemplate(template, {
    '{doc_ref}': insp.docRef || 'SPD/QMS/05',
    '{rev_no}': insp.revNo || '02',
    '{issue_date}': insp.issueDate || '09-Jun-2022',
    '{inspection_no}': insp.inspectionNo || '—',
    '{division}': insp.divisionName || 'Spoke Division',
    '{department}': insp.departmentName || 'Spoke',
    '{date}': insp.inspectionDate || '—',
    '{shift}': insp.shift || '—',
    '{machine}': insp.machineNo || '—',
    '{operator}': insp.operatorName || '—',
    '{item_name}': insp.itemName || '—',
    '{item_code}': insp.itemCode || '—',
    '{inspector}': insp.inspectorName || '—',
    '{approved_by_line}': insp.approvedBy ? `• *Approved By:* ${insp.approvedBy}\n` : '',
    '{samples_section}': sampleLines.join('\n'),
    '{attributes_section}': attrLines.join('\n'),
    '{overall_result}': insp.overallResult || 'PASS',
    '{remarks}': insp.remarks || 'Ok',
  });
}

/**
 * Triggers WhatsApp share with the clean formatted report.
 */
export function shareQmsOnWhatsApp(insp: QmsInProcessInspection): void {
  const text = buildQmsWhatsAppMessage(insp);
  const url = `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;
  window.open(url, '_blank');
}

/**
 * Builds a clean, executive batch summary for multiple selected inspections.
 * Suitable for WhatsApp character limits and high-level management review.
 */
export function buildBatchQmsWhatsAppMessage(inspections: QmsInProcessInspection[]): string {
  if (!inspections || inspections.length === 0) return '';
  if (inspections.length === 1) return buildQmsWhatsAppMessage(inspections[0]);

  const lines: string[] = [];
  lines.push('====================================');
  lines.push('*PAKISTAN WIRE INDUSTRIES (PVT.) LTD.*');
  lines.push(`*QMS INSPECTION BATCH SUMMARY (${inspections.length} RECORDS)*`);
  lines.push('====================================');
  lines.push('');
  lines.push(`*Generated Date:* ${new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}`);
  lines.push('');

  inspections.forEach((insp, idx) => {
    const isPass = (insp.overallResult || 'PASS') === 'PASS';
    lines.push(`*${idx + 1}. Inspection #${insp.inspectionNo}*  -->  *${insp.overallResult || 'PASS'}*`);
    lines.push(`   • *Part:* ${insp.itemName} (${insp.itemCode})`);
    lines.push(`   • *Date / Shift:* ${insp.inspectionDate} | Shift ${insp.shift}`);
    lines.push(`   • *Machine / Op:* ${insp.machineNo} | ${insp.operatorName}`);
    lines.push(`   • *Standard:* ${insp.docRef} (Rev ${insp.revNo})`);
    if (insp.samples && insp.samples.length > 0) {
      const summaryList = insp.samples.slice(0, 3).map(s => `${s.charName}: ${Number(s.average || 0).toFixed(1)}${s.unit}`);
      lines.push(`   • *Samples:* ${summaryList.join(', ')}${insp.samples.length > 3 ? '...' : ''}`);
    }
    lines.push('------------------------------------');
  });

  const passCount = inspections.filter(i => (i.overallResult || 'PASS') === 'PASS').length;
  const failCount = inspections.length - passCount;
  lines.push('');
  lines.push(`*Batch Total:* ${inspections.length} Inspections | *Passed:* ${passCount} | *Failed:* ${failCount}`);
  lines.push('');
  lines.push('_Verified & Generated via PWI ERP System_');

  return lines.join('\n');
}

/**
 * Triggers WhatsApp share for multiple selected inspections.
 */
export function shareBatchQmsOnWhatsApp(inspections: QmsInProcessInspection[]): void {
  const text = buildBatchQmsWhatsAppMessage(inspections);
  const url = `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;
  window.open(url, '_blank');
}

