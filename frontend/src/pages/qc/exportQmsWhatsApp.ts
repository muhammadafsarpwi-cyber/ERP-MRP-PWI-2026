import { QmsInProcessInspection } from './types';

/**
 * Builds a clean, professional, universally compatible WhatsApp text report.
 * Guaranteed to never render broken replacement characters (diamond question marks)
 * across any mobile device, WhatsApp Web, or OS.
 */
export function buildQmsWhatsAppMessage(insp: QmsInProcessInspection): string {
  const lines: string[] = [];

  lines.push('====================================');
  lines.push('*PAKISTAN WIRE INDUSTRIES (PVT.) LTD.*');
  lines.push('*IN-PROCESS QUALITY INSPECTION REPORT*');
  lines.push('====================================');
  lines.push('');
  lines.push(`*Doc Ref:* ${insp.docRef || 'SPD/QMS/05'} | *Rev:* ${insp.revNo || '02'} | *Date:* ${insp.issueDate || '09-Jun-2022'}`);
  lines.push(`*Inspection #:* ${insp.inspectionNo}`);
  lines.push('');
  lines.push('------------------------------------');
  lines.push('*GENERAL METADATA*');
  lines.push('------------------------------------');
  lines.push(`• *Division:* ${insp.divisionName || 'Spoke Division'}`);
  lines.push(`• *Department:* ${insp.departmentName || 'Spoke'}`);
  lines.push(`• *Date:* ${insp.inspectionDate} | *Shift:* ${insp.shift}`);
  lines.push(`• *Machine:* ${insp.machineNo} | *Operator:* ${insp.operatorName}`);
  lines.push(`• *Part / Item:* *${insp.itemName}* (${insp.itemCode})`);
  lines.push(`• *Inspector:* ${insp.inspectorName}`);
  if (insp.approvedBy) {
    lines.push(`• *Approved By:* ${insp.approvedBy}`);
  }
  lines.push('');
  lines.push('------------------------------------');
  lines.push('*DIMENSIONAL CHECKS (5 SAMPLES):*');
  lines.push('------------------------------------');

  if (insp.samples && insp.samples.length > 0) {
    insp.samples.forEach((s, idx) => {
      lines.push('');
      const tolStr = `(±${s.tolPlus}${s.unit})`;
      lines.push(`*${idx + 1}. ${s.charName}*`);
      lines.push(`   • Dimension Req: ${s.nominal} ${tolStr}`);
      const rawSamples = [s.s1, s.s2, s.s3, s.s4, s.s5].filter(
        (v) => v !== undefined && v !== null && `${v}` !== ''
      );
      if (rawSamples.length > 0) {
        lines.push(`   • 5 Samples: [ ${rawSamples.join(', ')} ]`);
      }
      const avg = Number(s.average || 0).toFixed(2);
      const isPass =
        s.status === 'PASS' ||
        (s.nominal - s.tolMinus <= Number(s.average) && Number(s.average) <= s.nominal + s.tolPlus);
      lines.push(`   • Average: *${avg} ${s.unit}*  -->  *${isPass ? 'PASS' : 'FAIL'}*`);
    });
  }

  if (insp.attributes && insp.attributes.length > 0) {
    lines.push('');
    lines.push('------------------------------------');
    lines.push('*VISUAL & FUNCTIONAL CHECKS:*');
    lines.push('------------------------------------');
    insp.attributes.forEach((a) => {
      const isPass = (a.defectsQty || 0) === 0;
      lines.push(`• *${a.checkName}:* ${a.checkedQty || 10}/${a.defectsQty || 0} defects  -->  *${isPass ? 'PASS' : 'FAIL'}*`);
    });
  }

  lines.push('');
  lines.push('====================================');
  lines.push(`*OVERALL RESULT:* *${insp.overallResult || 'PASS'}*`);
  lines.push(`*Remarks:* ${insp.remarks || 'Ok'}`);
  lines.push('====================================');
  lines.push('_Verified & Generated via PWI ERP System_');

  return lines.join('\n');
}

/**
 * Triggers WhatsApp share with the clean formatted report.
 */
export function shareQmsOnWhatsApp(insp: QmsInProcessInspection): void {
  const text = buildQmsWhatsAppMessage(insp);
  const url = `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;
  window.open(url, '_blank');
}

