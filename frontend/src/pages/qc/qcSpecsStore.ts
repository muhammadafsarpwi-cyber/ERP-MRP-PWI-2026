import { ItemQcSpecification, QmsInProcessInspection, InspectionSampleRow, AttributeCheckItem } from './types';
import apiService from '../../services/api';

const QC_SPECS_STORAGE_KEY = 'pwi_qc_item_specs_v1';
const QC_INSPECTIONS_STORAGE_KEY = 'pwi_qc_in_process_inspections_v1';

export const DEFAULT_SPOKE_SPECS: ItemQcSpecification[] = [
  {
    id: 'spec-s9-outer',
    divisionCode: 'DIV-SPD',
    departmentCode: 'SPD-DEPT003',
    itemCode: 'WIP-SPK-014',
    itemName: 'S9 (Outer) - 300*17 Outer Straight',
    docRef: 'SPD/QMS/05',
    revNo: '02',
    issueDate: '09-Jun-2022',
    characteristics: [
      { id: 'c1', charName: 'Total Length', nominal: 159.5, tolPlus: 0.5, tolMinus: 0.5, unit: 'mm', isCritical: true },
      { id: 'c2', charName: 'Head Dia', nominal: 6.6, tolPlus: 0.15, tolMinus: 0.15, unit: 'mm', isCritical: true },
      { id: 'c3', charName: 'Bending Length', nominal: 9.8, tolPlus: 0.15, tolMinus: 0.15, unit: 'mm', isCritical: true },
      { id: 'c4', charName: 'Thread Length', nominal: 14.0, tolPlus: 0.25, tolMinus: 0.25, unit: 'mm', isCritical: true },
      { id: 'c5', charName: 'Thread Pressure', nominal: 30.0, tolPlus: 2.0, tolMinus: 2.0, unit: 'PSI', isCritical: false },
    ],
    attributes: [
      { id: 'a1', checkName: 'Thread Checking', sampleSize: 10, maxAllowedDefects: 0 },
      { id: 'a2', checkName: 'Bending Broken', sampleSize: 10, maxAllowedDefects: 0 },
      { id: 'a3', checkName: 'Head Crack', sampleSize: 10, maxAllowedDefects: 0 },
    ],
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'spec-s9-inner',
    divisionCode: 'DIV-SPD',
    departmentCode: 'SPD-DEPT003',
    itemCode: 'WIP-ST-006',
    itemName: 'S9 (Inner) - 300*18 Inner Straight',
    docRef: 'SPD/QMS/05',
    revNo: '02',
    issueDate: '09-Jun-2022',
    characteristics: [
      { id: 'c1', charName: 'Total Length', nominal: 161.0, tolPlus: 0.5, tolMinus: 0.5, unit: 'mm', isCritical: true },
      { id: 'c2', charName: 'Head Dia', nominal: 6.6, tolPlus: 0.15, tolMinus: 0.15, unit: 'mm', isCritical: true },
      { id: 'c3', charName: 'Bending Length', nominal: 9.8, tolPlus: 0.15, tolMinus: 0.15, unit: 'mm', isCritical: true },
      { id: 'c4', charName: 'Thread Length', nominal: 14.0, tolPlus: 0.25, tolMinus: 0.25, unit: 'mm', isCritical: true },
      { id: 'c5', charName: 'Thread Pressure', nominal: 30.0, tolPlus: 2.0, tolMinus: 2.0, unit: 'PSI', isCritical: false },
    ],
    attributes: [
      { id: 'a1', checkName: 'Thread Checking', sampleSize: 10, maxAllowedDefects: 0 },
      { id: 'a2', checkName: 'Bending Broken', sampleSize: 10, maxAllowedDefects: 0 },
      { id: 'a3', checkName: 'Head Crack', sampleSize: 10, maxAllowedDefects: 0 },
    ],
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'spec-cd250-outer',
    divisionCode: 'DIV-SPD',
    departmentCode: 'SPD-DEPT003',
    itemCode: 'WIP-SPK-002',
    itemName: 'CD-250*17 Outer Butted',
    docRef: 'SPD/QMS/05',
    revNo: '02',
    issueDate: '09-Jun-2022',
    characteristics: [
      { id: 'c1', charName: 'Total Length', nominal: 162.0, tolPlus: 0.5, tolMinus: 0.5, unit: 'mm', isCritical: true },
      { id: 'c2', charName: 'Head Dia', nominal: 6.6, tolPlus: 0.15, tolMinus: 0.15, unit: 'mm', isCritical: true },
      { id: 'c3', charName: 'Bending Length', nominal: 9.8, tolPlus: 0.15, tolMinus: 0.15, unit: 'mm', isCritical: true },
      { id: 'c4', charName: 'Thread Length', nominal: 14.0, tolPlus: 0.25, tolMinus: 0.25, unit: 'mm', isCritical: true },
      { id: 'c5', charName: 'Thread Pressure', nominal: 30.0, tolPlus: 2.0, tolMinus: 2.0, unit: 'PSI', isCritical: false },
    ],
    attributes: [
      { id: 'a1', checkName: 'Thread Checking', sampleSize: 10, maxAllowedDefects: 0 },
      { id: 'a2', checkName: 'Bending Broken', sampleSize: 10, maxAllowedDefects: 0 },
      { id: 'a3', checkName: 'Head Crack', sampleSize: 10, maxAllowedDefects: 0 },
    ],
    updatedAt: new Date().toISOString(),
  },
];

export const INITIAL_INSPECTIONS: QmsInProcessInspection[] = [
  {
    id: 'insp-seed-01',
    inspectionNo: 'INS-000007',
    docRef: 'SPD/QMS/05',
    revNo: '02',
    issueDate: '09-Jun-2022',
    inspectionDate: '2026-11-06',
    shift: 'G',
    divisionName: 'Spoke Division',
    departmentName: 'Spoke',
    machineNo: '01',
    operatorName: 'Ashfaq',
    itemCode: 'WIP-SPK-014',
    itemName: 'S9 (Outer)',
    inspectorName: 'Mairaj',
    approvedBy: 'Quality Control Incharge',
    overallResult: 'PASS',
    remarks: 'Ok - All dimensional parameters within standard tolerance',
    samples: [
      { id: 'c1', charName: 'Total Length', nominal: 159.5, tolPlus: 0.5, tolMinus: 0.5, unit: 'mm', s1: 159.0, s2: 159.0, s3: 159.1, s4: 159.0, s5: 159.1, average: 159.04, status: 'PASS' },
      { id: 'c2', charName: 'Head Dia', nominal: 6.6, tolPlus: 0.15, tolMinus: 0.15, unit: 'mm', s1: 6.7, s2: 6.7, s3: 6.6, s4: 6.6, s5: 6.7, average: 6.66, status: 'PASS' },
      { id: 'c3', charName: 'Bending Length', nominal: 9.8, tolPlus: 0.15, tolMinus: 0.15, unit: 'mm', s1: 9.7, s2: 9.7, s3: 9.7, s4: 9.7, s5: 9.7, average: 9.7, status: 'PASS' },
      { id: 'c4', charName: 'Thread Length', nominal: 14.0, tolPlus: 0.25, tolMinus: 0.25, unit: 'mm', s1: 14.0, s2: 14.0, s3: 14.1, s4: 14.0, s5: 14.1, average: 14.04, status: 'PASS' },
      { id: 'c5', charName: 'Thread Pressure', nominal: 30.0, tolPlus: 2.0, tolMinus: 2.0, unit: 'PSI', s1: 30, s2: 30, s3: 30, s4: 31, s5: 31, average: 30.4, status: 'PASS' },
    ],
    attributes: [
      { id: 'a1', checkName: 'Thread Checking', checkedQty: 10, defectsQty: 0, status: 'PASS' },
      { id: 'a2', checkName: 'Bending Broken', checkedQty: 10, defectsQty: 0, status: 'PASS' },
      { id: 'a3', checkName: 'Head Crack', checkedQty: 10, defectsQty: 0, status: 'PASS' },
    ],
    createdAt: new Date().toISOString(),
  },
];

// Load Specifications from storage
export function loadAllSpecs(): ItemQcSpecification[] {
  try {
    const raw = localStorage.getItem(QC_SPECS_STORAGE_KEY);
    if (!raw) {
      localStorage.setItem(QC_SPECS_STORAGE_KEY, JSON.stringify(DEFAULT_SPOKE_SPECS));
      return DEFAULT_SPOKE_SPECS;
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : DEFAULT_SPOKE_SPECS;
  } catch {
    return DEFAULT_SPOKE_SPECS;
  }
}

// Save Specifications to storage
export function saveAllSpecs(specs: ItemQcSpecification[]): void {
  try {
    localStorage.setItem(QC_SPECS_STORAGE_KEY, JSON.stringify(specs));
  } catch (err) {
    console.error('Failed to save QC specs:', err);
  }
}

// Load In-Process Inspections
export function loadInProcessInspections(): QmsInProcessInspection[] {
  try {
    const raw = localStorage.getItem(QC_INSPECTIONS_STORAGE_KEY);
    if (!raw) {
      localStorage.setItem(QC_INSPECTIONS_STORAGE_KEY, JSON.stringify(INITIAL_INSPECTIONS));
      return INITIAL_INSPECTIONS;
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : INITIAL_INSPECTIONS;
  } catch {
    return INITIAL_INSPECTIONS;
  }
}

// Save In-Process Inspections
export function saveInProcessInspections(inspections: QmsInProcessInspection[]): void {
  try {
    localStorage.setItem(QC_INSPECTIONS_STORAGE_KEY, JSON.stringify(inspections));
  } catch (err) {
    console.error('Failed to save QC inspections:', err);
  }
}

// Convert raw DB record into QmsInProcessInspection
export function parseDbInspection(raw: any, specsList: ItemQcSpecification[] = []): QmsInProcessInspection | null {
  if (!raw) return null;
  if (raw.referenceType === 'QMS_SPECS_MASTER' || raw.inspectionNo === 'QMS-SPECS-MASTER') return null;

  let p: any = {};
  if (raw.remarks && typeof raw.remarks === 'string') {
    try {
      p = JSON.parse(raw.remarks);
    } catch {
      p = { remarksText: raw.remarks };
    }
  } else if (raw.remarks && typeof raw.remarks === 'object') {
    p = raw.remarks;
  }

  // Find matching spec to backfill characteristics if samples were not stored in older records
  const itemCode = p.itemCode || raw.itemCode || 'WIP-SPK-014';
  const matchedSpec =
    specsList.find((s) => s.itemCode === itemCode) ||
    DEFAULT_SPOKE_SPECS.find((s) => s.itemCode === itemCode) ||
    DEFAULT_SPOKE_SPECS[0];

  let samples: InspectionSampleRow[] = Array.isArray(p.samples) && p.samples.length > 0 ? p.samples : [];
  if (samples.length === 0 && matchedSpec) {
    samples = matchedSpec.characteristics.map((c) => ({
      ...c,
      s1: Number(c.nominal),
      s2: Number(c.nominal),
      s3: Number(c.nominal),
      s4: Number(c.nominal),
      s5: Number(c.nominal),
      average: Number(c.nominal),
      status: 'PASS',
    }));
  }

  let attributes: AttributeCheckItem[] = Array.isArray(p.attributes) && p.attributes.length > 0 ? p.attributes : [];
  if (attributes.length === 0 && matchedSpec) {
    attributes = (matchedSpec.attributes || []).map((a) => ({
      id: a.id,
      checkName: a.checkName,
      checkedQty: a.sampleSize || 10,
      defectsQty: 0,
      status: 'PASS',
    }));
  }

  return {
    id: raw.id || p.id || `insp-${Date.now()}`,
    inspectionNo: raw.inspectionNo || p.inspectionNo || 'INS-000000',
    docRef: p.docRef || 'SPD/QMS/05',
    revNo: p.revNo || '02',
    issueDate: p.issueDate || '09-Jun-2022',
    inspectionDate: raw.inspectionDate
      ? String(raw.inspectionDate).slice(0, 10)
      : p.inspectionDate || new Date().toISOString().slice(0, 10),
    shift: p.shift || 'G',
    divisionId: p.divisionId || raw.divisionId,
    divisionName: p.divisionName || 'Spoke Division',
    departmentId: p.departmentId || raw.departmentId,
    departmentName: p.departmentName || 'Spoke',
    machineNo: p.machineNo || '01',
    operatorName: p.operatorName || 'Shopfloor Operator',
    itemId: p.itemId || raw.itemId,
    itemCode: itemCode,
    itemName: p.itemName || matchedSpec?.itemName || itemCode,
    inspectorName: p.inspectorName || 'Mairaj',
    approvedBy: p.approvedBy || 'Quality Control Incharge',
    overallResult: (p.overallResult || raw.result || 'PASS') as any,
    remarks:
      typeof p.remarks === 'string'
        ? p.remarks
        : raw.remarks && !raw.remarks.startsWith('{')
          ? raw.remarks
          : 'Ok - All dimensional parameters within standard tolerance.',
    samples,
    attributes,
    createdAt: raw.createdAt || p.createdAt || new Date().toISOString(),
  };
}

// Fetch in-process inspections from DB
export async function fetchDbInProcessInspections(
  companyId: string,
  specsList: ItemQcSpecification[] = []
): Promise<QmsInProcessInspection[]> {
  try {
    const res = await apiService.get<{ data: any[] }>('/qc/inspections', {
      companyId,
      limit: 100,
    });
    const rawList = res?.data || [];
    const inProcess = rawList.filter(
      (r) => r.inspectionType === 'IN_PROCESS' && r.referenceType !== 'QMS_SPECS_MASTER'
    );
    const parsedList: QmsInProcessInspection[] = [];
    for (const r of inProcess) {
      const parsed = parseDbInspection(r, specsList);
      if (parsed) parsedList.push(parsed);
    }

    // Merge with any offline/local cached inspections
    const local = loadInProcessInspections();
    const map = new Map<string, QmsInProcessInspection>();
    parsedList.forEach((p) => {
      map.set(p.inspectionNo, p);
      map.set(p.id, p);
    });
    local.forEach((l) => {
      if (!map.has(l.inspectionNo) && !map.has(l.id)) {
        map.set(l.inspectionNo, l);
      }
    });

    const combined = Array.from(new Set(map.values()));
    combined.sort((a, b) => {
      const d = b.inspectionDate.localeCompare(a.inspectionDate);
      if (d !== 0) return d;
      return b.inspectionNo.localeCompare(a.inspectionNo);
    });

    saveInProcessInspections(combined);
    return combined;
  } catch (err) {
    console.warn('Failed to fetch inspections from DB, using local cache:', err);
    return loadInProcessInspections();
  }
}

// Save an in-process inspection to DB
export async function saveDbInProcessInspection(
  companyId: string,
  insp: QmsInProcessInspection
): Promise<any> {
  try {
    const payload = {
      companyId,
      inspectionType: 'IN_PROCESS',
      inspectionDate: insp.inspectionDate,
      result: insp.overallResult,
      status: 'COMPLETED',
      remarks: JSON.stringify(insp),
    };
    const res = await apiService.post<any>('/qc/inspections', payload);
    return res?.data;
  } catch (err) {
    console.error('Failed to post inspection to DB:', err);
    throw err;
  }
}

// Fetch Item QC Specs from DB
export async function fetchDbSpecs(companyId: string): Promise<ItemQcSpecification[]> {
  try {
    const res = await apiService.get<{ data: any[] }>('/qc/inspections', {
      companyId,
      referenceType: 'QMS_SPECS_MASTER',
      limit: 1,
    });
    const record = res?.data?.[0];
    if (record?.remarks) {
      const parsed = JSON.parse(record.remarks);
      if (Array.isArray(parsed) && parsed.length > 0) {
        saveAllSpecs(parsed);
        return parsed;
      }
    }
    const initial = loadAllSpecs();
    saveDbSpecs(companyId, initial).catch(() => {});
    return initial;
  } catch (err) {
    console.warn('Failed to fetch specs from DB, using local cache:', err);
    return loadAllSpecs();
  }
}

// Save Item QC Specs to DB
export async function saveDbSpecs(companyId: string, specs: ItemQcSpecification[]): Promise<void> {
  try {
    saveAllSpecs(specs);
    await apiService.post('/qc/inspections', {
      companyId,
      inspectionType: 'IN_PROCESS',
      referenceType: 'QMS_SPECS_MASTER',
      inspectionDate: new Date().toISOString().slice(0, 10),
      result: 'PASS',
      status: 'COMPLETED',
      remarks: JSON.stringify(specs),
    });
  } catch (err) {
    console.warn('Failed to save specs to DB:', err);
  }
}

// Helper to export specifications to Excel (.xls HTML format)
export function exportSpecsToExcel(specs: ItemQcSpecification[], divisionName: string, departmentName: string): void {
  const escapeHtml = (val: any) =>
    String(val ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

  let html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
<head>
<meta charset="UTF-8">
<style>
  body { font-family: Calibri, Arial, sans-serif; font-size: 11pt; }
  table { border-collapse: collapse; width: 100%; }
  th, td { border: 1px solid #cbd5e1; padding: 6px 10px; text-align: left; }
  .hdr { background-color: #1e3a8a; color: #ffffff; font-weight: bold; }
  .title { background-color: #0f172a; color: #ffffff; font-weight: bold; font-size: 14pt; }
  .meta { background-color: #f1f5f9; color: #334155; font-size: 10pt; }
</style>
</head>
<body>
<table>
  <tr><td colspan="9" class="title">PAKISTAN WIRE INDUSTRIES (PVT.) LTD — ITEM QC SPECIFICATIONS MASTER</td></tr>
  <tr><td colspan="9" class="meta">Division: ${escapeHtml(divisionName)} | Department: ${escapeHtml(departmentName)} | Export Date: ${new Date().toLocaleDateString()}</td></tr>
  <tr><td colspan="9"></td></tr>
  <tr class="hdr">
    <th>Item Code</th>
    <th>Item Name</th>
    <th>Characteristic</th>
    <th>Standard Spec</th>
    <th>Tolerance (+)</th>
    <th>Tolerance (-)</th>
    <th>Unit</th>
    <th>Min Spec</th>
    <th>Max Spec</th>
  </tr>`;

  specs.forEach((s) => {
    s.characteristics.forEach((c) => {
      const min = c.nominal - c.tolMinus;
      const max = c.nominal + c.tolPlus;
      html += `<tr>
        <td>${escapeHtml(s.itemCode)}</td>
        <td>${escapeHtml(s.itemName)}</td>
        <td>${escapeHtml(c.charName)}</td>
        <td>${c.nominal}</td>
        <td>${c.tolPlus}</td>
        <td>${c.tolMinus}</td>
        <td>${escapeHtml(c.unit)}</td>
        <td>${min.toFixed(2)}</td>
        <td>${max.toFixed(2)}</td>
      </tr>`;
    });
  });

  html += `</table></body></html>`;

  const blob = new Blob([html], { type: 'application/vnd.ms-excel;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `QC_Specs_${divisionName}_${departmentName}_${new Date().toISOString().slice(0, 10)}.xls`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Helper to export CSV template
export function exportSpecsTemplateCsv(): void {
  const csvContent =
    'ItemCode,ItemName,Characteristic,Nominal,TolerancePlus,ToleranceMinus,Unit,IsCritical\n' +
    'WIP-SPK-014,S9 (Outer),Total Length,159.5,0.5,0.5,mm,YES\n' +
    'WIP-SPK-014,S9 (Outer),Head Dia,6.6,0.15,0.15,mm,YES\n' +
    'WIP-SPK-014,S9 (Outer),Bending Length,9.8,0.15,0.15,mm,YES\n' +
    'WIP-SPK-014,S9 (Outer),Thread Length,14.0,0.25,0.25,mm,YES\n' +
    'WIP-SPK-014,S9 (Outer),Thread Pressure,30.0,2.0,2.0,PSI,NO\n';

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'QC_Specs_Import_Template.csv';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

