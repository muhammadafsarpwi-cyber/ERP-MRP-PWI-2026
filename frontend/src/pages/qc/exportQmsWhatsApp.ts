import { QmsInProcessInspection } from './types';
import {
  DEFAULT_COMPANY_NAME,
  DEFAULT_QMS_BATCH_WHATSAPP_TEMPLATE,
  DEFAULT_QMS_INSPECTION_WHATSAPP_TEMPLATE,
  buildWhatsAppShareUrl,
  renderWhatsAppTemplate,
} from '../../utils/whatsappTemplateRenderer';

export {
  DEFAULT_QMS_INSPECTION_WHATSAPP_TEMPLATE,
  DEFAULT_QMS_BATCH_WHATSAPP_TEMPLATE,
};

/**
 * Builds `[QMS-INSP]` In-Process Quality Inspection WhatsApp report
 * strictly from Settings -> WhatsApp Messages (`qmsInspection`).
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
        (v) => v !== undefined && v !== null && `${v}` !== '',
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
      attrLines.push(
        `• *${a.checkName}:* ${a.checkedQty || 10}/${a.defectsQty || 0} defects  -->  *${isPass ? 'PASS' : 'FAIL'}*`,
      );
    });
  }

  return renderWhatsAppTemplate('[QMS-INSP]', {
    company: DEFAULT_COMPANY_NAME.toUpperCase(),
    doc_ref: insp.docRef || 'SPD/QMS/05',
    rev_no: insp.revNo || '02',
    issue_date: insp.issueDate || '09-Jun-2022',
    inspection_no: insp.inspectionNo || '—',
    division: insp.divisionName || 'Spoke Division',
    department: insp.departmentName || 'Spoke',
    date: insp.inspectionDate || '—',
    shift: insp.shift || '—',
    machine: insp.machineNo || '—',
    operator: insp.operatorName || '—',
    item_name: insp.itemName || '—',
    item_code: insp.itemCode || '—',
    inspector: insp.inspectorName || '—',
    approved_by_line: insp.approvedBy ? `• *Approved By:* ${insp.approvedBy}\n` : '',
    samples_section: sampleLines.join('\n'),
    attributes_section: attrLines.join('\n'),
    overall_result: insp.overallResult || 'PASS',
    remarks: insp.remarks || 'Ok',
  });
}

export function shareQmsOnWhatsApp(insp: QmsInProcessInspection): void {
  const text = buildQmsWhatsAppMessage(insp);
  window.open(buildWhatsAppShareUrl(text), '_blank', 'noopener,noreferrer');
}

/**
 * Builds `[QMS-BATCH]` Batch Inspection Summary strictly from Settings -> WhatsApp Messages (`qmsBatchSummary`).
 */
export function buildBatchQmsWhatsAppMessage(inspections: QmsInProcessInspection[]): string {
  if (!inspections || inspections.length === 0) return '';
  if (inspections.length === 1) return buildQmsWhatsAppMessage(inspections[0]);

  const itemLines: string[] = [];
  inspections.forEach((insp, idx) => {
    itemLines.push(`*${idx + 1}. Inspection #${insp.inspectionNo}*  -->  *${insp.overallResult || 'PASS'}*`);
    itemLines.push(`   • *Part:* ${insp.itemName} (${insp.itemCode})`);
    itemLines.push(`   • *Date / Shift:* ${insp.inspectionDate} | Shift ${insp.shift}`);
    itemLines.push(`   • *Machine / Op:* ${insp.machineNo} | ${insp.operatorName}`);
    itemLines.push(`   • *Standard:* ${insp.docRef} (Rev ${insp.revNo})`);
    if (insp.samples && insp.samples.length > 0) {
      const summaryList = insp.samples
        .slice(0, 3)
        .map((s) => `${s.charName}: ${Number(s.average || 0).toFixed(1)}${s.unit}`);
      itemLines.push(`   • *Samples:* ${summaryList.join(', ')}${insp.samples.length > 3 ? '...' : ''}`);
    }
    itemLines.push('------------------------------------');
  });

  const passCount = inspections.filter((i) => (i.overallResult || 'PASS') === 'PASS').length;
  const failCount = inspections.length - passCount;
  const dateStr = new Date().toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });

  return renderWhatsAppTemplate('[QMS-BATCH]', {
    company: DEFAULT_COMPANY_NAME.toUpperCase(),
    date: dateStr,
    records_count: String(inspections.length),
    passed_count: String(passCount),
    failed_count: String(failCount),
    items: itemLines.join('\n'),
  });
}

export function shareBatchQmsOnWhatsApp(inspections: QmsInProcessInspection[]): void {
  const text = buildBatchQmsWhatsAppMessage(inspections);
  window.open(buildWhatsAppShareUrl(text), '_blank', 'noopener,noreferrer');
}
