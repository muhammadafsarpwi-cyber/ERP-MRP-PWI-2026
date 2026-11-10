import React, { useState, useEffect, useMemo } from 'react';
import { Modal, Form, Input, Select, Row, Col, Table, InputNumber, Tag, Button, Space, theme, App } from 'antd';
import { SaveOutlined, PlusOutlined } from '@ant-design/icons';
import { QmsInProcessInspection, InspectionSampleRow, AttributeCheckItem } from './types';
import {
  loadAllSpecs,
  loadInProcessInspections,
  loadAllOperators,
  saveAllOperators,
  fetchDbOperators,
  saveDbOperators,
  loadAllInspectors,
  saveAllInspectors,
  fetchDbInspectors,
  saveDbInspectors,
} from './qcSpecsStore';

// Calculate next automatic sequential Document Reference (e.g. SPD/QMS/06, SPD/QMS/07...)
const getNextDocRef = (divisionCode: string): string => {
  const existing = loadInProcessInspections();
  const pfx = divisionCode === 'DIV-CCD' ? 'CCD/QMS/' : 'SPD/QMS/';
  let maxNum = 5; // Initial reference starts at 05
  existing.forEach((insp) => {
    const doc = (insp.docRef || '').trim();
    const regex = new RegExp(`^${pfx.replace('/', '\\/')}(\\d+)`, 'i');
    const match = doc.match(regex);
    if (match && match[1]) {
      const n = parseInt(match[1], 10);
      if (!isNaN(n) && n > maxNum) {
        maxNum = n;
      }
    }
  });
  return `${pfx}${String(maxNum + 1).padStart(2, '0')}`;
};

// Department-wise machine definitions (from authoritative Supabase database)
const DEPARTMENT_MACHINES: Record<string, Array<{ code: string; name: string }>> = {
  // Spoke Division
  'SPD-DEPT003': [
    { code: '01', name: 'SPK-01 (Machine 01)' },
    { code: '02', name: 'SPK-02 (Machine 02)' },
    { code: '03', name: 'SPK-03 (Machine 03)' },
    { code: '04', name: 'SPK-04 (Machine 04)' },
    { code: '05', name: 'SPK-05 (Machine 05)' },
    { code: '06', name: 'SPK-06 (Machine 06)' },
    { code: '07', name: 'SPK-07 (Machine 07)' },
  ],
  'SPD-DEPT001': [
    { code: 'ST-01', name: 'ST-01 (Straightener Machine 01)' },
    { code: 'ST-02', name: 'ST-02 (Straightener Machine 02)' },
    { code: 'ST-03', name: 'ST-03 (Straightener Machine 03)' },
    { code: 'ST-04', name: 'ST-04 (Straightener Machine 04)' },
    { code: 'ST-05', name: 'ST-05 (Straightener Machine 05)' },
  ],
  'SPD-DEPT002': [
    { code: 'SW-01', name: 'SW-01 (Swagging Machine 01)' },
    { code: 'SW-02', name: 'SW-02 (Swagging Machine 02)' },
    { code: 'SW-03', name: 'SW-03 (Swagging Machine 03)' },
    { code: 'SW-04', name: 'SW-04 (Swagging Machine 04)' },
    { code: 'SW-05', name: 'SW-05 (Swagging Machine 05)' },
    { code: 'SW-06', name: 'SW-06 (Swagging Machine 06)' },
  ],
  'SPD-DEPT004': [
    { code: 'HD-01', name: 'HD-01 (Header Machine 01)' },
    { code: 'HD-02', name: 'HD-02 (Header Machine 02)' },
  ],
  'SPD-DEPT005': [
    { code: 'NP-01', name: 'NP-01 (Nipple Machine 01)' },
    { code: 'NP-02', name: 'NP-02 (Nipple Machine 02)' },
  ],
  'SPD-DEPT006': [
    { code: 'SPL-01', name: 'SPL-01 (Spoke Plating Line 01)' },
    { code: 'BL-01', name: 'BL-01 (Barrel Machine 01)' },
    { code: 'BL-02', name: 'BL-02 (Barrel Machine 02)' },
    { code: 'BL-03', name: 'BL-03 (Barrel Machine 03)' },
    { code: 'BL-04', name: 'BL-04 (Barrel Machine 04)' },
  ],
  'SPD-DEPT008': [
    { code: 'PKS-01', name: 'PKS-01 (Spoke Packing Station 01)' },
    { code: 'PKS-02', name: 'PKS-02 (Spoke Packing Station 02)' },
  ],
  // Control Cable Division
  'CCD-DEPT001': [
    { code: 'FL-01', name: 'FL-01 (Flattening Machine 01)' },
    { code: 'FL-02', name: 'FL-02 (Flattening Machine 02)' },
    { code: 'FT-01', name: 'FT-01 (Flattening Machine FT-01)' },
    { code: 'FT-02', name: 'FT-02 (Flattening Machine FT-02)' },
    { code: 'FT-03', name: 'FT-03 (Flattening Machine FT-03)' },
    { code: 'FT-04', name: 'FT-04 (Flattening Machine FT-04)' },
  ],
  'CCD-DEPT004': [
    { code: 'CPK-01', name: 'CPK-01 (CCD Packing Station 01)' },
    { code: 'PK-01', name: 'PK-01 (Packing Station PK-01)' },
    { code: 'PK-02', name: 'PK-02 (Packing Station PK-02)' },
  ],
  'CCD-DEPT003': [
    { code: 'PV-01', name: 'PV-01 (PVC Coating Line 01)' },
  ],
};

interface InProcessInspectionModalProps {
  visible: boolean;
  onClose: () => void;
  onSave: (inspection: QmsInProcessInspection) => void;
  initialInspection?: QmsInProcessInspection | null;
  divisionName: string;
  departmentName: string;
  divisionCode: string;
  departmentCode: string;
  itemsList: Array<{ id: string; itemCode: string; name: string }>;
  companyId?: string;
}

export const InProcessInspectionModal: React.FC<InProcessInspectionModalProps> = ({
  visible,
  onClose,
  onSave,
  initialInspection,
  divisionName,
  departmentName,
  divisionCode,
  departmentCode,
  itemsList,
  companyId,
}) => {
  const { token } = theme.useToken();
  const { message } = App.useApp();
  const [form] = Form.useForm();

  const [sampleRows, setSampleRows] = useState<InspectionSampleRow[]>([]);
  const [attributeRows, setAttributeRows] = useState<AttributeCheckItem[]>([]);
  const [overallResult, setOverallResult] = useState<'PASS' | 'FAIL' | 'PENDING'>('PASS');

  // Operators state & dynamic addition
  const [operatorList, setOperatorList] = useState<string[]>([]);
  const [newOperatorName, setNewOperatorName] = useState<string>('');

  // Inspectors state & dynamic addition
  const [inspectorList, setInspectorList] = useState<string[]>([]);
  const [newInspectorName, setNewInspectorName] = useState<string>('');

  // Mobile viewport detection
  const [isMobile, setIsMobile] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.innerWidth <= 768 : false
  );

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(typeof window !== 'undefined' && window.innerWidth <= 768);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Resolve active companyId
  const resolvedCompanyId = useMemo(() => {
    if (companyId) return companyId;
    try {
      const raw = localStorage.getItem('erp_user');
      return raw ? JSON.parse(raw)?.defaultCompanyId || '' : '';
    } catch {
      return '';
    }
  }, [companyId]);

  // Load operators & inspectors from store and sync with DB
  useEffect(() => {
    if (!visible) return;

    // Load initial from storage
    const currentOps = loadAllOperators();
    setOperatorList(currentOps);

    const currentInsps = loadAllInspectors();
    setInspectorList(currentInsps);

    // Sync from database if companyId available
    if (resolvedCompanyId) {
      fetchDbOperators(resolvedCompanyId)
        .then((ops) => {
          if (Array.isArray(ops) && ops.length > 0) {
            setOperatorList(ops);
          }
        })
        .catch(() => {});

      fetchDbInspectors(resolvedCompanyId)
        .then((insps) => {
          if (Array.isArray(insps) && insps.length > 0) {
            setInspectorList(insps);
          }
        })
        .catch(() => {});
    }
  }, [visible, resolvedCompanyId]);

  // Add new operator handler
  const handleAddNewOperator = (nameOverride?: string) => {
    const nameToAdd = (nameOverride !== undefined ? nameOverride : newOperatorName).trim();
    if (!nameToAdd) {
      message.warning('Please enter an operator name');
      return;
    }

    const existing = operatorList.find((op) => op.toLowerCase() === nameToAdd.toLowerCase());
    if (existing) {
      form.setFieldValue('operatorName', existing);
      setNewOperatorName('');
      message.info(`Operator "${existing}" is already in the list`);
      return;
    }

    const updated = [...operatorList, nameToAdd];
    setOperatorList(updated);
    form.setFieldValue('operatorName', nameToAdd);
    setNewOperatorName('');
    saveAllOperators(updated);

    if (resolvedCompanyId) {
      saveDbOperators(resolvedCompanyId, updated).catch(() => {});
    }
    message.success(`Operator "${nameToAdd}" added and saved!`);
  };

  // Add new inspector handler
  const handleAddNewInspector = (nameOverride?: string) => {
    const nameToAdd = (nameOverride !== undefined ? nameOverride : newInspectorName).trim();
    if (!nameToAdd) {
      message.warning('Please enter an inspector name');
      return;
    }

    const existing = inspectorList.find((ins) => ins.toLowerCase() === nameToAdd.toLowerCase());
    if (existing) {
      form.setFieldValue('inspectorName', existing);
      setNewInspectorName('');
      message.info(`Inspector "${existing}" is already in the list`);
      return;
    }

    const updated = [...inspectorList, nameToAdd];
    setInspectorList(updated);
    form.setFieldValue('inspectorName', nameToAdd);
    setNewInspectorName('');
    saveAllInspectors(updated);

    if (resolvedCompanyId) {
      saveDbInspectors(resolvedCompanyId, updated).catch(() => {});
    }
    message.success(`Inspector "${nameToAdd}" added and saved!`);
  };

  // Cascading machines list strictly for the active department
  const machinesForDept = useMemo(() => {
    return DEPARTMENT_MACHINES[departmentCode] || [
      { code: '01', name: 'Machine 01' },
      { code: '02', name: 'Machine 02' },
    ];
  }, [departmentCode]);

  // Group items by active department, followed by entire division
  const groupedItemOptions = useMemo(() => {
    if (!itemsList || itemsList.length === 0) {
      return [
        {
          label: 'Default Specifications',
          options: [
            { value: 'WIP-ST-001', label: 'WIP-ST-001 — CD-250*17 Butted Straightener' },
            { value: 'WIP-ST-006', label: 'WIP-ST-006 — S9-300*18 Inner Straight' },
            { value: 'WIP-SPK-014', label: 'WIP-SPK-014 — S9 (Outer) - 300*17 Outer Straight' },
            { value: 'WIP-SPK-002', label: 'WIP-SPK-002 — CD-250*17 Outer Butted' },
          ],
        },
      ];
    }

    let deptPrefixes: string[] = [];
    if (departmentCode === 'SPD-DEPT001') {
      deptPrefixes = ['WIP-ST', 'ST-'];
    } else if (departmentCode === 'SPD-DEPT002') {
      deptPrefixes = ['WIP-SW', 'SW-'];
    } else if (departmentCode === 'SPD-DEPT003') {
      deptPrefixes = ['WIP-SPK', 'SPK-'];
    } else if (departmentCode === 'SPD-DEPT004') {
      deptPrefixes = ['WIP-HD', 'HD-'];
    } else if (departmentCode === 'SPD-DEPT005') {
      deptPrefixes = ['WIP-NP', 'WIP-NPL', 'FG-NP', 'NP-'];
    } else if (departmentCode === 'SPD-DEPT006') {
      deptPrefixes = ['WIP-SPL', 'SPL-'];
    } else if (departmentCode === 'SPD-DEPT008') {
      deptPrefixes = ['PKS', 'SPI-FG', 'SP-'];
    } else if (departmentCode === 'CCD-DEPT001') {
      deptPrefixes = ['FLAT', 'FL-', 'FT-'];
    } else if (departmentCode === 'CCD-DEPT002') {
      deptPrefixes = ['CCD-FGR', 'CCD-CAS', 'CAS-'];
    } else if (departmentCode === 'CCD-DEPT003') {
      deptPrefixes = ['CCD-IN', 'IN-'];
    } else if (departmentCode === 'CCD-DEPT004') {
      deptPrefixes = ['CCD-FG', 'CA-'];
    }

    // Filter out cross-division items strictly
    const divisionCleanItems = itemsList.filter((it) => {
      const code = (it.itemCode || '').toUpperCase();
      if (divisionCode === 'DIV-SPD') {
        if (code.startsWith('CCD-') || code.startsWith('FLAT')) return false;
      } else if (divisionCode === 'DIV-CCD') {
        if (
          code.startsWith('WIP-SPK') ||
          code.startsWith('WIP-ST') ||
          code.startsWith('WIP-SW') ||
          code.startsWith('WIP-HD') ||
          code.startsWith('WIP-NPL') ||
          code.startsWith('WIP-SPL')
        )
          return false;
      }
      return true;
    });

    const deptMatches: any[] = [];
    const otherItems: any[] = [];

    divisionCleanItems.forEach((it) => {
      const code = (it.itemCode || '').toUpperCase();
      const isDept = deptPrefixes.some((pfx) => code.startsWith(pfx));
      if (isDept) {
        deptMatches.push(it);
      } else {
        otherItems.push(it);
      }
    });

    const groups: any[] = [];
    if (deptMatches.length > 0) {
      groups.push({
        label: `★ ${departmentName} Department Items (${deptMatches.length})`,
        options: deptMatches.map((i) => ({
          value: i.itemCode,
          label: `${i.itemCode} — ${i.name}`,
        })),
      });
    }

    if (otherItems.length > 0) {
      groups.push({
        label: `All ${divisionName} Items (${otherItems.length})`,
        options: otherItems.map((i) => ({
          value: i.itemCode,
          label: `${i.itemCode} — ${i.name}`,
        })),
      });
    }

    return groups;
  }, [itemsList, departmentCode, departmentName, divisionName, divisionCode]);

  // Load specs or existing inspection data
  useEffect(() => {
    if (!visible) return;

    if (initialInspection) {
      // Auto-increment Revision Number when editing/revising:
      // If previous was '01' -> becomes '02'
      // If previous was '02' -> becomes '03', etc.
      const prevRevNum = parseInt(initialInspection.revNo || '1', 10);
      const nextRevNum = isNaN(prevRevNum) ? 2 : prevRevNum + 1;
      const nextRev = String(nextRevNum).padStart(2, '0');

      form.setFieldsValue({
        inspectionDate: initialInspection.inspectionDate,
        shift: initialInspection.shift,
        machineNo: initialInspection.machineNo,
        operatorName: initialInspection.operatorName,
        itemCode: initialInspection.itemCode,
        inspectorName: initialInspection.inspectorName,
        approvedBy: initialInspection.approvedBy,
        remarks: initialInspection.remarks,
        docRef: initialInspection.docRef,
        revNo: nextRev, // Automatically incremented revision!
        issueDate: initialInspection.issueDate,
      });
      setSampleRows(initialInspection.samples || []);
      setAttributeRows(initialInspection.attributes || []);
      recalcOverall(initialInspection.samples || [], initialInspection.attributes || []);
    } else {
      // New Inspection defaults - blank operator, inspector, and itemCode
      const today = new Date().toISOString().slice(0, 10);
      const nextDoc = getNextDocRef(divisionCode);
      const defaultMachine = machinesForDept[0]?.code || '01';
      form.setFieldsValue({
        inspectionDate: today,
        shift: 'G',
        machineNo: defaultMachine,
        operatorName: undefined,
        itemCode: undefined, // Blank part/item selection
        inspectorName: '', // Blank inspector name (user enters own name)
        approvedBy: 'Quality Control Incharge',
        docRef: nextDoc, // Automatic next sequential doc reference
        revNo: '01', // Initial revision starts at 01
        issueDate: '09-Jun-2022',
        remarks: 'Ok',
      });
      setSampleRows([]); // Empty table until item is selected
      setAttributeRows([]);
      setOverallResult('PENDING');
    }
  }, [visible, initialInspection, departmentCode, machinesForDept, divisionCode]);

  // Load item specs into the 5-sample rows with BLANK sample boxes
  const loadSpecsForItem = (code?: string) => {
    if (!code) {
      setSampleRows([]);
      setAttributeRows([]);
      setOverallResult('PENDING');
      return;
    }

    const allSpecs = loadAllSpecs();
    const match = allSpecs.find((s) => s.itemCode === code);

    const isCcd =
      divisionCode === 'DIV-CCD' ||
      (code || '').toUpperCase().startsWith('CCD') ||
      (code || '').toUpperCase().startsWith('FLAT') ||
      (code || '').toUpperCase().startsWith('CAS');

    const chars =
      match && match.characteristics && match.characteristics.length > 0
        ? match.characteristics
        : isCcd
          ? [
              { id: 'c1', charName: 'Thickness', nominal: 1.25, tolPlus: 0.03, tolMinus: 0.03, unit: 'mm', isCritical: true },
              { id: 'c2', charName: 'Width', nominal: 2.45, tolPlus: 0.05, tolMinus: 0.05, unit: 'mm', isCritical: true },
              { id: 'c3', charName: 'Tensile Strength', nominal: 950.0, tolPlus: 50.0, tolMinus: 50.0, unit: 'N/mm²', isCritical: false },
            ]
          : [
              { id: 'c1', charName: 'Total Length', nominal: 159.5, tolPlus: 0.5, tolMinus: 0.5, unit: 'mm', isCritical: true },
              { id: 'c2', charName: 'Head Dia', nominal: 6.6, tolPlus: 0.15, tolMinus: 0.15, unit: 'mm', isCritical: true },
              { id: 'c3', charName: 'Bending Length', nominal: 9.8, tolPlus: 0.15, tolMinus: 0.15, unit: 'mm', isCritical: true },
              { id: 'c4', charName: 'Thread Length', nominal: 14.0, tolPlus: 0.25, tolMinus: 0.25, unit: 'mm', isCritical: true },
              { id: 'c5', charName: 'Thread Pressure', nominal: 30.0, tolPlus: 2.0, tolMinus: 2.0, unit: 'PSI', isCritical: false },
            ];

    // All sample boxes are initialized blank (undefined)
    const rows: InspectionSampleRow[] = chars.map((c) => ({
      ...c,
      s1: undefined,
      s2: undefined,
      s3: undefined,
      s4: undefined,
      s5: undefined,
      average: null,
      status: 'PENDING',
    }));

    setSampleRows(rows);

    const rawAttrs =
      match && match.attributes && match.attributes.length > 0
        ? match.attributes
        : isCcd
          ? [
              { id: 'a1', checkName: 'Surface Burrs & Scratches', sampleSize: 10, maxAllowedDefects: 0 },
              { id: 'a2', checkName: 'Edge Smoothness', sampleSize: 10, maxAllowedDefects: 0 },
            ]
          : [
              { id: 'a1', checkName: 'Thread Checking', sampleSize: 10, maxAllowedDefects: 0 },
              { id: 'a2', checkName: 'Bending Broken', sampleSize: 10, maxAllowedDefects: 0 },
              { id: 'a3', checkName: 'Head Crack', sampleSize: 10, maxAllowedDefects: 0 },
            ];

    const attrs: AttributeCheckItem[] = rawAttrs.map((a: any) => ({
      id: a.id,
      checkName: a.checkName,
      checkedQty: a.sampleSize || a.checkedQty || 10,
      defectsQty: 0,
      status: 'PASS',
    }));

    setAttributeRows(attrs);
    setOverallResult('PENDING');
  };

  const evaluateRow = (row: InspectionSampleRow): InspectionSampleRow => {
    const samples = [row.s1, row.s2, row.s3, row.s4, row.s5].filter((v) => typeof v === 'number' && !isNaN(v)) as number[];
    if (samples.length === 0) {
      return { ...row, average: null, status: 'PENDING' };
    }

    const sum = samples.reduce((acc, v) => acc + v, 0);
    const avg = Number((sum / samples.length).toFixed(2));

    const min = row.nominal - row.tolMinus;
    const max = row.nominal + row.tolPlus;

    const anyFailed = samples.some((v) => v < min - 0.0001 || v > max + 0.0001);
    let status: 'PASS' | 'FAIL' | 'PENDING' = 'PENDING';
    if (anyFailed) {
      status = 'FAIL';
    } else if (samples.length === 5) {
      status = 'PASS';
    } else {
      status = 'PENDING';
    }

    return { ...row, average: avg, status };
  };

  const handleSampleChange = (rowId: string, sampleKey: 's1' | 's2' | 's3' | 's4' | 's5', val: number | null) => {
    setSampleRows((prev) => {
      const next = prev.map((r) => {
        if (r.id === rowId) {
          const updated = { ...r, [sampleKey]: val };
          return evaluateRow(updated);
        }
        return r;
      });
      recalcOverall(next, attributeRows);
      return next;
    });
  };

  const handleAttributeChange = (attrId: string, defects: number) => {
    setAttributeRows((prev) => {
      const next = prev.map((a) => {
        if (a.id === attrId) {
          const status: 'PASS' | 'FAIL' = defects > 0 ? 'FAIL' : 'PASS';
          return { ...a, defectsQty: defects, status };
        }
        return a;
      });
      recalcOverall(sampleRows, next);
      return next;
    });
  };

  const recalcOverall = (samples: InspectionSampleRow[], attrs: AttributeCheckItem[]) => {
    const samplesFailed = samples.some((s) => s.status === 'FAIL');
    const attrsFailed = attrs.some((a) => a.status === 'FAIL');
    if (samplesFailed || attrsFailed) {
      setOverallResult('FAIL');
      return;
    }
    const hasPending = samples.some((s) => s.status === 'PENDING' || s.average === null);
    if (hasPending || samples.length === 0) {
      setOverallResult('PENDING');
      return;
    }
    setOverallResult('PASS');
  };

  const renderStatusBadge = (status: 'PASS' | 'FAIL' | 'PENDING' | string) => {
    const isFail = status === 'FAIL';
    const isPass = status === 'PASS';
    const bg = isFail ? '#ef4444' : isPass ? '#10b981' : '#2563eb';
    const label = isFail ? 'FAIL' : isPass ? 'PASS' : 'PENDING';

    return (
      <span
        style={{
          display: 'inline-block',
          backgroundColor: bg,
          color: '#ffffff',
          fontWeight: 800,
          fontSize: '11px',
          padding: '3px 10px',
          borderRadius: '4px',
          letterSpacing: '0.5px',
          minWidth: '58px',
          textAlign: 'center',
          boxShadow: `0 1px 3px ${isFail ? 'rgba(239, 68, 68, 0.4)' : isPass ? 'rgba(16, 185, 129, 0.4)' : 'rgba(37, 99, 235, 0.4)'}`,
        }}
      >
        {label}
      </span>
    );
  };

  const handleFinish = async () => {
    try {
      const values = await form.validateFields();
      const matchedItem = itemsList.find((i) => i.itemCode === values.itemCode);
      const itemName = matchedItem ? matchedItem.name : values.itemCode;

      // Ensure entered operator is retained in master list & synced to DB
      if (values.operatorName && values.operatorName.trim()) {
        const op = values.operatorName.trim();
        if (!operatorList.some((o) => o.toLowerCase() === op.toLowerCase())) {
          const nextOps = [...operatorList, op];
          setOperatorList(nextOps);
          saveAllOperators(nextOps);
          if (resolvedCompanyId) {
            saveDbOperators(resolvedCompanyId, nextOps).catch(() => {});
          }
        }
      }

      // Ensure entered inspector is retained in master list & synced to DB
      if (values.inspectorName && values.inspectorName.trim()) {
        const ins = values.inspectorName.trim();
        if (!inspectorList.some((i) => i.toLowerCase() === ins.toLowerCase())) {
          const nextIns = [...inspectorList, ins];
          setInspectorList(nextIns);
          saveAllInspectors(nextIns);
          if (resolvedCompanyId) {
            saveDbInspectors(resolvedCompanyId, nextIns).catch(() => {});
          }
        }
      }

      const newInsp: QmsInProcessInspection = {
        id: initialInspection?.id || `insp-${Date.now()}`,
        inspectionNo: initialInspection?.inspectionNo || `INS-${String(Math.floor(100000 + Math.random() * 900000))}`,
        docRef: values.docRef || 'SPD/QMS/05',
        revNo: values.revNo || '02',
        issueDate: values.issueDate || '09-Jun-2022',
        inspectionDate: values.inspectionDate,
        shift: values.shift,
        divisionName,
        departmentName,
        machineNo: values.machineNo,
        operatorName: values.operatorName,
        itemCode: values.itemCode,
        itemName,
        inspectorName: values.inspectorName,
        approvedBy: values.approvedBy,
        overallResult,
        remarks: values.remarks,
        samples: sampleRows,
        attributes: attributeRows,
        createdAt: initialInspection?.createdAt || new Date().toISOString(),
      };

      onSave(newInsp);
      message.success('Running Production Inspection saved successfully!');
      onClose();
    } catch {
      message.error('Please complete all required fields');
    }
  };

  const modalTitle = (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '8px',
        paddingRight: isMobile ? '28px' : '24px',
      }}
    >
      <div>
        <div
          style={{
            fontSize: isMobile ? '14px' : '16px',
            fontWeight: 700,
            color: token.colorTextHeading,
            lineHeight: 1.3,
          }}
        >
          {initialInspection
            ? `Edit & Revise Inspection ${initialInspection.inspectionNo} (Revision: ${form.getFieldValue('revNo') || '02'})`
            : 'New In-Process Quality Inspection (QMS)'}
        </div>
        <div style={{ fontSize: isMobile ? '11px' : '12px', color: token.colorPrimary, fontWeight: 600, marginTop: '2px' }}>
          {divisionName} • {departmentName} • {form.getFieldValue('docRef') || 'SPD/QMS/05'} (Rev: {form.getFieldValue('revNo') || '01'})
        </div>
      </div>
      <span
        style={{
          display: 'inline-block',
          backgroundColor: overallResult === 'PASS' ? '#10b981' : overallResult === 'FAIL' ? '#ef4444' : '#2563eb',
          color: '#ffffff',
          fontWeight: 800,
          fontSize: isMobile ? '11px' : '12px',
          padding: isMobile ? '3px 10px' : '4px 14px',
          borderRadius: '6px',
          letterSpacing: '0.5px',
        }}
      >
        OVERALL: {overallResult}
      </span>
    </div>
  );

  const modalFooter = [
    <Button key="cancel" onClick={onClose} style={isMobile ? { flex: 1 } : undefined}>
      Cancel
    </Button>,
    <Button
      key="save"
      type="primary"
      icon={<SaveOutlined />}
      onClick={handleFinish}
      style={isMobile ? { flex: 1.5 } : undefined}
    >
      Save Inspection Record
    </Button>,
  ];

  return (
    <Modal
      title={modalTitle}
      open={visible}
      onCancel={onClose}
      width={isMobile ? '96%' : 1040}
      style={{
        top: isMobile ? 8 : 24,
        maxWidth: isMobile ? '100vw' : '90vw',
        margin: isMobile ? '0 auto' : undefined,
        paddingBottom: isMobile ? 8 : 24,
      }}
      styles={{
        body: {
          maxHeight: isMobile ? 'calc(100vh - 120px)' : 'calc(85vh - 120px)',
          overflowY: 'auto',
          padding: isMobile ? '12px 10px' : '16px 24px',
        },
      }}
      footer={
        <div style={isMobile ? { display: 'flex', gap: '8px', width: '100%' } : undefined}>
          {modalFooter}
        </div>
      }
    >
      <Form form={form} layout="vertical">
        {/* Header Grid */}
        <div
          style={{
            padding: isMobile ? '10px 12px' : '12px 16px',
            backgroundColor: token.colorFillAlter,
            borderRadius: '8px',
            marginBottom: '16px',
            border: `1px solid ${token.colorBorderSecondary}`,
          }}
        >
          <Row gutter={[12, 12]}>
            <Col xs={24} sm={12} md={4}>
              <Form.Item name="inspectionDate" label="Date" rules={[{ required: true }]} style={{ marginBottom: isMobile ? '10px' : '14px' }}>
                <Input type="date" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12} md={5}>
              <Form.Item name="shift" label="Shift" rules={[{ required: true }]} style={{ marginBottom: isMobile ? '10px' : '14px' }}>
                <Select
                  style={{ width: '100%' }}
                  options={[
                    { value: 'G', label: 'Shift G (General)' },
                    { value: 'A', label: 'Shift A (Morning)' },
                    { value: 'B', label: 'Shift B (Evening)' },
                    { value: 'C', label: 'Shift C (Night)' },
                  ]}
                />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12} md={5}>
              <Form.Item name="machineNo" label={`Machine (${departmentName})`} rules={[{ required: true }]} style={{ marginBottom: isMobile ? '10px' : '14px' }}>
                <Select
                  showSearch
                  placeholder="Select machine..."
                  options={machinesForDept.map((m) => ({
                    value: m.code,
                    label: m.name,
                  }))}
                />
              </Form.Item>
            </Col>

            {/* Operator with Dynamic Master Dropdown & Quick Add */}
            <Col xs={24} sm={12} md={5}>
              <Form.Item
                name="operatorName"
                label="Operator"
                rules={[{ required: true, message: 'Please select or add operator' }]}
                style={{ marginBottom: isMobile ? '10px' : '14px' }}
              >
                <Select
                  showSearch
                  allowClear
                  placeholder="Select or Add Operator..."
                  options={operatorList.map((op) => ({ value: op, label: op }))}
                  filterOption={(input, option) =>
                    String(option?.label || '').toLowerCase().includes(input.toLowerCase())
                  }
                  dropdownRender={(menu) => (
                    <div>
                      {menu}
                      <div
                        style={{
                          borderTop: `1px solid ${token.colorBorderSecondary}`,
                          padding: '8px 10px',
                          display: 'flex',
                          gap: '6px',
                          alignItems: 'center',
                          backgroundColor: token.colorFillAlter,
                        }}
                        onMouseDown={(e) => e.preventDefault()}
                      >
                        <Input
                          placeholder="Add new operator..."
                          size="small"
                          value={newOperatorName}
                          onChange={(e) => setNewOperatorName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              handleAddNewOperator();
                            }
                          }}
                        />
                        <Button
                          type="primary"
                          size="small"
                          icon={<PlusOutlined />}
                          onClick={() => handleAddNewOperator()}
                        >
                          Add
                        </Button>
                      </div>
                    </div>
                  )}
                />
              </Form.Item>
            </Col>

            {/* Inspector with Dynamic Master Dropdown & Quick Add */}
            <Col xs={24} sm={12} md={5}>
              <Form.Item
                name="inspectorName"
                label="Inspector"
                rules={[{ required: true, message: 'Please select or add inspector' }]}
                style={{ marginBottom: isMobile ? '10px' : '14px' }}
              >
                <Select
                  showSearch
                  allowClear
                  placeholder="Select or Add Inspector..."
                  options={inspectorList.map((ins) => ({ value: ins, label: ins }))}
                  filterOption={(input, option) =>
                    String(option?.label || '').toLowerCase().includes(input.toLowerCase())
                  }
                  dropdownRender={(menu) => (
                    <div>
                      {menu}
                      <div
                        style={{
                          borderTop: `1px solid ${token.colorBorderSecondary}`,
                          padding: '8px 10px',
                          display: 'flex',
                          gap: '6px',
                          alignItems: 'center',
                          backgroundColor: token.colorFillAlter,
                        }}
                        onMouseDown={(e) => e.preventDefault()}
                      >
                        <Input
                          placeholder="Add new inspector..."
                          size="small"
                          value={newInspectorName}
                          onChange={(e) => setNewInspectorName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              handleAddNewInspector();
                            }
                          }}
                        />
                        <Button
                          type="primary"
                          size="small"
                          icon={<PlusOutlined />}
                          onClick={() => handleAddNewInspector()}
                        >
                          Add
                        </Button>
                      </div>
                    </div>
                  )}
                />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={[12, 12]}>
            <Col xs={24} sm={12} md={10}>
              <Form.Item name="itemCode" label="Part / Item" rules={[{ required: true, message: 'Please select part/item' }]} style={{ marginBottom: isMobile ? '10px' : '14px' }}>
                <Select
                  showSearch
                  allowClear
                  optionFilterProp="label"
                  placeholder="Select Part / Item from list..."
                  filterOption={(input, option) => {
                    const label = String(option?.label || '');
                    const value = String(option?.value || '');
                    const term = input.toLowerCase();
                    return label.toLowerCase().includes(term) || value.toLowerCase().includes(term);
                  }}
                  onChange={(code) => loadSpecsForItem(code)}
                  options={groupedItemOptions}
                />
              </Form.Item>
            </Col>
            <Col xs={24} sm={6} md={5}>
              <Form.Item name="docRef" label="Doc Ref" rules={[{ required: true }]} style={{ marginBottom: isMobile ? '10px' : '14px' }}>
                <Input placeholder="e.g. SPD/QMS/06" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={6} md={4}>
              <Form.Item name="revNo" label="Revision No" style={{ marginBottom: isMobile ? '10px' : '14px' }}>
                <Input placeholder="02" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12} md={5}>
              <Form.Item name="approvedBy" label="Approved By" style={{ marginBottom: isMobile ? '10px' : '14px' }}>
                <Input placeholder="Quality Control Incharge" />
              </Form.Item>
            </Col>
          </Row>
        </div>

        {/* 5-Sample Dimensional Measurements Matrix */}
        <div style={{ marginBottom: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', flexWrap: 'wrap', gap: '8px' }}>
            <span style={{ fontSize: isMobile ? '12px' : '13px', fontWeight: 700, color: token.colorTextHeading }}>
              DIMENSIONAL INSPECTION DATA (5 SAMPLES)
            </span>
            <Space size={isMobile ? 'small' : 'middle'} wrap style={{ fontSize: '11px' }}>
              <span style={{ color: '#10b981', fontWeight: 700 }}>● Green = PASS</span>
              <span style={{ color: '#1677ff', fontWeight: 700 }}>● Blue = PENDING</span>
              <span style={{ color: '#ef4444', fontWeight: 700 }}>● Red = FAIL</span>
              {!isMobile && <span style={{ color: token.colorTextSecondary }}>| Auto-calculates Mean &amp; Tolerance</span>}
            </Space>
          </div>

          {isMobile && sampleRows.length > 0 && (
            <div style={{ fontSize: '11px', color: token.colorPrimary, marginBottom: '6px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span>↔ Scroll horizontally to fill all 5 samples (S-1 to S-5)</span>
            </div>
          )}

          {sampleRows.length === 0 ? (
            <div
              style={{
                padding: isMobile ? '24px 12px' : '36px 16px',
                textAlign: 'center',
                border: `1.5px dashed ${token.colorBorder}`,
                borderRadius: '8px',
                backgroundColor: token.colorFillAlter,
              }}
            >
              <div style={{ fontSize: '26px', marginBottom: '8px' }}>🔍</div>
              <div style={{ fontSize: '14px', fontWeight: 700, color: token.colorTextHeading }}>
                Please select a Part / Item above
              </div>
              <div style={{ fontSize: '12px', color: token.colorTextSecondary, marginTop: '4px' }}>
                Select an item from the dropdown to automatically load its dimensional quality specifications and tolerances.
              </div>
            </div>
          ) : (
            <div
              style={{
                overflowX: 'auto',
                WebkitOverflowScrolling: 'touch',
                borderRadius: '6px',
                border: `1px solid ${token.colorBorder}`,
              }}
            >
              <table
                style={{
                  width: '100%',
                  minWidth: isMobile ? '680px' : '100%',
                  borderCollapse: 'collapse',
                  fontSize: isMobile ? '11px' : '12px',
                }}
              >
                <thead>
                  <tr style={{ backgroundColor: token.colorFillAlter, textAlign: 'left' }}>
                    <th style={{ padding: '8px', border: `1px solid ${token.colorBorder}` }}>Characteristic</th>
                    <th style={{ padding: '8px', border: `1px solid ${token.colorBorder}` }}>Dimension Requirement (Nominal &amp; Tol)</th>
                    <th style={{ padding: '8px', border: `1px solid ${token.colorBorder}`, textAlign: 'center' }}>S-1</th>
                    <th style={{ padding: '8px', border: `1px solid ${token.colorBorder}`, textAlign: 'center' }}>S-2</th>
                    <th style={{ padding: '8px', border: `1px solid ${token.colorBorder}`, textAlign: 'center' }}>S-3</th>
                    <th style={{ padding: '8px', border: `1px solid ${token.colorBorder}`, textAlign: 'center' }}>S-4</th>
                    <th style={{ padding: '8px', border: `1px solid ${token.colorBorder}`, textAlign: 'center' }}>S-5</th>
                    <th style={{ padding: '8px', border: `1px solid ${token.colorBorder}`, textAlign: 'center' }}>Average</th>
                    <th style={{ padding: '8px', border: `1px solid ${token.colorBorder}`, textAlign: 'center' }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {sampleRows.map((row) => {
                    const min = row.nominal - row.tolMinus;
                    const max = row.nominal + row.tolPlus;
                    const isOutOfSpec = (val: number | null | undefined) =>
                      typeof val === 'number' && (val < min - 0.0001 || val > max + 0.0001);

                    return (
                      <tr key={row.id}>
                        <td style={{ padding: '6px 8px', border: `1px solid ${token.colorBorder}`, fontWeight: 600 }}>{row.charName}</td>
                        <td style={{ padding: '6px 8px', border: `1px solid ${token.colorBorder}` }}>
                          {row.nominal} (±{row.tolPlus} {row.unit})
                        </td>
                        {(['s1', 's2', 's3', 's4', 's5'] as const).map((key) => {
                          const val = row[key];
                          const isFilled = typeof val === 'number' && !isNaN(val);
                          const out = isFilled && isOutOfSpec(val);

                          let boxBorder = '1.5px solid #ef4444';
                          let boxBg = 'rgba(239, 68, 68, 0.08)';
                          let boxColor: string | undefined = undefined;

                          if (isFilled) {
                            if (out) {
                              boxBorder = '1.5px solid #dc2626';
                              boxBg = 'rgba(220, 38, 38, 0.18)';
                              boxColor = '#dc2626';
                            } else {
                              boxBorder = '1.5px solid #10b981';
                              boxBg = 'rgba(16, 185, 129, 0.12)';
                              boxColor = '#059669';
                            }
                          }

                          return (
                            <td key={key} style={{ padding: '4px', border: `1px solid ${token.colorBorder}`, textAlign: 'center' }}>
                              <InputNumber
                                size={isMobile ? 'middle' : 'small'}
                                value={val}
                                step={0.05}
                                placeholder="—"
                                style={{
                                  width: isMobile ? '64px' : '74px',
                                  border: boxBorder,
                                  backgroundColor: boxBg,
                                  color: boxColor,
                                  fontWeight: isFilled ? 700 : 400,
                                  borderRadius: '4px',
                                  transition: 'all 0.2s ease',
                                }}
                                onChange={(nv) => handleSampleChange(row.id, key, nv !== null && !isNaN(Number(nv)) ? Number(nv) : null)}
                              />
                            </td>
                          );
                        })}
                        <td style={{ padding: '6px 8px', border: `1px solid ${token.colorBorder}`, textAlign: 'center', fontWeight: 700 }}>
                          {row.average !== null && row.average !== undefined ? `${row.average} ${row.unit}` : '-'}
                        </td>
                        <td style={{ padding: '6px 8px', border: `1px solid ${token.colorBorder}`, textAlign: 'center' }}>
                          {renderStatusBadge(row.status)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Attribute Checks */}
        <div style={{ marginBottom: '16px' }}>
          <div style={{ fontSize: isMobile ? '12px' : '13px', fontWeight: 700, marginBottom: '8px', color: token.colorTextHeading }}>
            VISUAL &amp; STRUCTURAL ATTRIBUTE CHECKS (GO / NO-GO)
          </div>
          <Row gutter={[12, 12]}>
            {attributeRows.map((attr) => (
              <Col xs={24} sm={12} md={8} key={attr.id}>
                <div
                  style={{
                    padding: '10px 12px',
                    backgroundColor: token.colorFillAlter,
                    borderRadius: '6px',
                    border: `1px solid ${token.colorBorderSecondary}`,
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '12px' }}>{attr.checkName}</div>
                    <div style={{ fontSize: '11px', color: token.colorTextSecondary }}>Checked Sample: {attr.checkedQty}</div>
                  </div>
                  <Space>
                    <span style={{ fontSize: '11px' }}>Defects:</span>
                    <InputNumber
                      size="small"
                      min={0}
                      max={attr.checkedQty}
                      value={attr.defectsQty}
                      style={{ width: '60px' }}
                      onChange={(nv) => handleAttributeChange(attr.id, Number(nv || 0))}
                    />
                    {renderStatusBadge(attr.status)}
                  </Space>
                </div>
              </Col>
            ))}
          </Row>
        </div>

        {/* Remarks */}
        <Form.Item name="remarks" label="Remarks / Observation Notes">
          <Input.TextArea rows={2} placeholder="Ok - All parameters within tolerance limits" />
        </Form.Item>
      </Form>
    </Modal>
  );
};
