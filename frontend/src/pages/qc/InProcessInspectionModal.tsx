import React, { useState, useEffect, useMemo } from 'react';
import { Modal, Form, Input, Select, Row, Col, Table, InputNumber, Tag, Button, Space, Alert, theme, App } from 'antd';
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

// Department-wise machine definitions (Exact 60 Supabase machines)
const DEPARTMENT_MACHINES: Record<string, Array<{ code: string; name: string }>> = {
  // Spoke Division
  'SPD-DEPT003': [
    { code: 'SPK-01', name: 'SPK-01 (Spoke Machine SPK-01)' },
    { code: 'SPK-02', name: 'SPK-02 (Spoke Machine SPK-02)' },
    { code: 'SPK-03', name: 'SPK-03 (Spoke Machine SPK-03)' },
    { code: 'SPK-04', name: 'SPK-04 (Spoke Machine SPK-04)' },
    { code: 'SPK-05', name: 'SPK-05 (Spoke Machine SPK-05)' },
    { code: 'SPK-06', name: 'SPK-06 (Spoke Machine SPK-06)' },
    { code: 'SPK-07', name: 'SPK-07 (Spoke Machine SPK-07)' },
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
    { code: 'BL-01', name: 'BL-01 (Barrel Machine BL-01)' },
    { code: 'BL-02', name: 'BL-02 (Barrel Machine BL-02)' },
    { code: 'BL-03', name: 'BL-03 (Barrel Machine BL-03)' },
    { code: 'BL-04', name: 'BL-04 (Barrel Machine BL-04)' },
    { code: 'BL-05', name: 'BL-05 (Barrel Machine BL-05)' },
    { code: 'BL-06', name: 'BL-06 (Barrel Machine BL-06)' },
    { code: 'BL-07', name: 'BL-07 (Barrel Machine BL-07)' },
    { code: 'BL-08', name: 'BL-08 (Barrel Machine BL-08)' },
    { code: 'BL-09', name: 'BL-09 (Barrel Machine BL-09)' },
  ],
  'SPD-DEPT007': [
    { code: 'NPL-01', name: 'NPL-01 (Nipple Plating Line 01)' },
    { code: 'BL-10', name: 'BL-10 (Barrel Machine BL-10)' },
    { code: 'BL-11', name: 'BL-11 (Barrel Machine BL-11)' },
    { code: 'BL-12', name: 'BL-12 (Barrel Machine BL-12)' },
  ],
  'SPD-DEPT008': [
    { code: 'PKS-01', name: 'PKS-01 (Spoke Packing Station 01)' },
    { code: 'PKS-02', name: 'PKS-02 (Spoke Packing Station 02)' },
  ],
  // Control Cable Division
  'CCD-DEPT001': [
    { code: 'FT-01', name: 'FT-01 (Flattening Machine FT-01)' },
    { code: 'FT-02', name: 'FT-02 (Flattening Machine FT-02)' },
    { code: 'FT-03', name: 'FT-03 (Flattening Machine FT-03)' },
    { code: 'FT-04', name: 'FT-04 (Flattening Machine FT-04)' },
    { code: 'FT-05', name: 'FT-05 (Flattening Machine FT-05)' },
  ],
  'CCD-DEPT002': [
    { code: 'SP-01', name: 'SP-01 (Spiral Machine SP-01)' },
    { code: 'SP-02', name: 'SP-02 (Spiral Machine SP-02)' },
    { code: 'SP-03', name: 'SP-03 (Spiral Machine SP-03)' },
    { code: 'SP-04', name: 'SP-04 (Spiral Machine SP-04)' },
    { code: 'SP-05', name: 'SP-05 (Spiral Machine SP-05)' },
    { code: 'SP-06', name: 'SP-06 (Spiral Machine SP-06)' },
    { code: 'SP-07', name: 'SP-07 (Spiral Machine SP-07)' },
    { code: 'SP-08', name: 'SP-08 (Spiral Machine SP-08)' },
    { code: 'SP-09', name: 'SP-09 (Spiral Machine SP-09)' },
    { code: 'SP-10', name: 'SP-10 (Spiral Machine SP-10)' },
    { code: 'SP-11', name: 'SP-11 (Spiral Machine SP-11)' },
    { code: 'SP-12', name: 'SP-12 (Spiral Machine SP-12)' },
    { code: 'SP-13', name: 'SP-13 (Spiral Machine SP-13)' },
    { code: 'SP-14', name: 'SP-14 (Spiral Machine SP-14)' },
  ],
  'CCD-DEPT003': [
    { code: 'PVC-01', name: 'PVC-01 (PVC Coating Line PVC-01)' },
    { code: 'PVC -02', name: 'PVC -02 (PVC Coating Line PVC -02)' },
  ],
  'CCD-DEPT004': [
    { code: 'PK-01', name: 'PK-01 (CCD Packing Station PK-01)' },
    { code: 'PK-02', name: 'PK-02 (CCD Packing Station PK-02)' },
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
  machinesList?: Array<{ code: string; name: string }>;
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
  machinesList,
  itemsList,
  companyId,
}) => {
  const { token } = theme.useToken();
  const { message } = App.useApp();
  const [form] = Form.useForm();

  const [sampleRows, setSampleRows] = useState<InspectionSampleRow[]>([]);
  const [attributeRows, setAttributeRows] = useState<AttributeCheckItem[]>([]);
  const [overallResult, setOverallResult] = useState<'PASS' | 'FAIL' | 'PENDING'>('PASS');
  const [missingSpecsWarning, setMissingSpecsWarning] = useState<string | null>(null);

  // Operators state & dynamic addition
  const [operatorList, setOperatorList] = useState<string[]>([]);
  const [newOperatorName, setNewOperatorName] = useState<string>('');
  const [operatorSearchText, setOperatorSearchText] = useState<string>('');

  // Inspectors state & dynamic addition
  const [inspectorList, setInspectorList] = useState<string[]>([]);
  const [newInspectorName, setNewInspectorName] = useState<string>('');
  const [inspectorSearchText, setInspectorSearchText] = useState<string>('');

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
      setOperatorSearchText('');
      message.info(`Operator "${existing}" is already in the list`);
      return;
    }

    const updated = [...operatorList, nameToAdd];
    setOperatorList(updated);
    form.setFieldValue('operatorName', nameToAdd);
    setNewOperatorName('');
    setOperatorSearchText('');
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
      setInspectorSearchText('');
      message.info(`Inspector "${existing}" is already in the list`);
      return;
    }

    const updated = [...inspectorList, nameToAdd];
    setInspectorList(updated);
    form.setFieldValue('inspectorName', nameToAdd);
    setNewInspectorName('');
    setInspectorSearchText('');
    saveAllInspectors(updated);

    if (resolvedCompanyId) {
      saveDbInspectors(resolvedCompanyId, updated).catch(() => {});
    }
    message.success(`Inspector "${nameToAdd}" added and saved!`);
  };

  // Cascading machines list strictly for the active department (prioritizes live machinesList from DB)
  const machinesForDept = useMemo(() => {
    if (machinesList && machinesList.length > 0) return machinesList;
    return DEPARTMENT_MACHINES[departmentCode] || [
      { code: '01', name: 'Machine 01' },
      { code: '02', name: 'Machine 02' },
    ];
  }, [machinesList, departmentCode]);

  // Group items by active department, prioritizing items with configured QC specs
  const groupedItemOptions = useMemo(() => {
    const allConfiguredSpecs = loadAllSpecs();
    const configuredCodes = new Set(
      allConfiguredSpecs
        .filter((s) => s.characteristics && s.characteristics.length > 0)
        .map((s) => (s.itemCode || '').toUpperCase().trim())
    );

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
      deptPrefixes = ['FT-', 'FLAT'];
    } else if (departmentCode === 'CCD-DEPT002') {
      deptPrefixes = ['CCD-FGR', 'CCD-CAS', 'CAS-', 'SP-'];
    } else if (departmentCode === 'CCD-DEPT003') {
      deptPrefixes = ['CCD-IN', 'IN-', 'PVC'];
    } else if (departmentCode === 'CCD-DEPT004') {
      deptPrefixes = ['CCD-FG', 'CA-', 'PK'];
    }

    // Filter out cross-division items strictly
    const divisionCleanItems = (itemsList || []).filter((it) => {
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

    const deptItems = divisionCleanItems.filter((it) => {
      const code = (it.itemCode || '').toUpperCase();
      return deptPrefixes.some((pfx) => code.startsWith(pfx));
    });

    const targetPool = deptItems.length > 0 ? deptItems : divisionCleanItems;

    const configured = targetPool.filter((it) => configuredCodes.has((it.itemCode || '').toUpperCase().trim()));
    const unconfigured = targetPool.filter((it) => !configuredCodes.has((it.itemCode || '').toUpperCase().trim()));

    // Ensure configured specs from master show even if not yet in itemsList
    allConfiguredSpecs.forEach((spec) => {
      const code = (spec.itemCode || '').toUpperCase().trim();
      const inDept = deptPrefixes.some((pfx) => code.startsWith(pfx));
      if (inDept && !configured.some((c) => (c.itemCode || '').toUpperCase().trim() === code)) {
        configured.push({
          id: spec.id,
          itemCode: spec.itemCode,
          name: spec.itemName || spec.itemCode,
        });
      }
    });

    const groups: any[] = [];
    if (configured.length > 0) {
      groups.push({
        label: `★ Configured Items in QC Master (${configured.length})`,
        options: configured.map((i) => ({
          value: i.itemCode,
          label: `${i.itemCode} — ${i.name} (Ready for Inspection)`,
        })),
      });
    }

    if (unconfigured.length > 0) {
      groups.push({
        label: `⚠️ Other Items (Needs QC Specs in Master) (${unconfigured.length})`,
        options: unconfigured.map((i) => ({
          value: i.itemCode,
          label: `${i.itemCode} — ${i.name}`,
        })),
      });
    }

    return groups;
  }, [itemsList, departmentCode, divisionCode]);

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
      setMissingSpecsWarning(null);
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
      setMissingSpecsWarning(null);
      setOverallResult('PENDING');
    }
  }, [visible, initialInspection, departmentCode, machinesForDept, divisionCode]);

  // Load item specs into the 5-sample rows with BLANK sample boxes
  const loadSpecsForItem = (code?: string) => {
    if (!code) {
      setSampleRows([]);
      setAttributeRows([]);
      setOverallResult('PENDING');
      setMissingSpecsWarning(null);
      return;
    }

    const allSpecs = loadAllSpecs();
    const match = allSpecs.find((s) => (s.itemCode || '').trim().toUpperCase() === code.trim().toUpperCase());

    // CRITICAL FIX: If no specs are configured for this item in Item QC Specs Master,
    // NEVER populate fake/dummy tolerances! Keep table blank and warn user.
    if (!match || !match.characteristics || match.characteristics.length === 0) {
      setSampleRows([]);
      setAttributeRows([]);
      setOverallResult('PENDING');
      setMissingSpecsWarning(
        `Item "${code}" does not have quality specifications configured in Item QC Specs Master. Please configure nominal dimensions and tolerances in the Specs Master tab first.`
      );
      return;
    }

    setMissingSpecsWarning(null);
    const chars = match.characteristics;

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

    const rawAttrs = match.attributes && match.attributes.length > 0 ? match.attributes : [];
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
                  onSearch={(val) => setOperatorSearchText(val)}
                  onSelect={() => setOperatorSearchText('')}
                  onClear={() => setOperatorSearchText('')}
                  options={operatorList.map((op) => ({ value: op, label: op }))}
                  filterOption={(input, option) =>
                    String(option?.label || '').toLowerCase().includes(input.toLowerCase())
                  }
                  dropdownRender={(menu) => (
                    <div>
                      {operatorSearchText &&
                        !operatorList.some(
                          (o) => o.toLowerCase() === operatorSearchText.trim().toLowerCase()
                        ) && (
                          <div
                            style={{
                              padding: '7px 12px',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              backgroundColor: token.colorPrimaryBg,
                              color: token.colorPrimary,
                              fontWeight: 600,
                              fontSize: '12px',
                              borderBottom: `1px solid ${token.colorBorderSecondary}`,
                            }}
                            onMouseDown={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              handleAddNewOperator(operatorSearchText.trim());
                            }}
                          >
                            <span>+ Add "{operatorSearchText.trim()}" as new operator</span>
                            <Tag color="processing" style={{ margin: 0 }}>Click to Add</Tag>
                          </div>
                        )}
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
                        onMouseDown={(e) => e.stopPropagation()}
                      >
                        <Input
                          placeholder="Type new operator..."
                          size="small"
                          value={newOperatorName}
                          onChange={(e) => setNewOperatorName(e.target.value)}
                          onMouseDown={(e) => e.stopPropagation()}
                          onKeyDown={(e) => {
                            e.stopPropagation();
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              const target = newOperatorName.trim() || operatorSearchText.trim();
                              handleAddNewOperator(target);
                            }
                          }}
                          style={{ flex: 1 }}
                        />
                        <Button
                          type="primary"
                          size="small"
                          icon={<PlusOutlined />}
                          onMouseDown={(e) => e.stopPropagation()}
                          onClick={(e) => {
                            e.stopPropagation();
                            const target = newOperatorName.trim() || operatorSearchText.trim();
                            handleAddNewOperator(target);
                          }}
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
                  onSearch={(val) => setInspectorSearchText(val)}
                  onSelect={() => setInspectorSearchText('')}
                  onClear={() => setInspectorSearchText('')}
                  options={inspectorList.map((ins) => ({ value: ins, label: ins }))}
                  filterOption={(input, option) =>
                    String(option?.label || '').toLowerCase().includes(input.toLowerCase())
                  }
                  dropdownRender={(menu) => (
                    <div>
                      {inspectorSearchText &&
                        !inspectorList.some(
                          (i) => i.toLowerCase() === inspectorSearchText.trim().toLowerCase()
                        ) && (
                          <div
                            style={{
                              padding: '7px 12px',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              backgroundColor: token.colorPrimaryBg,
                              color: token.colorPrimary,
                              fontWeight: 600,
                              fontSize: '12px',
                              borderBottom: `1px solid ${token.colorBorderSecondary}`,
                            }}
                            onMouseDown={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              handleAddNewInspector(inspectorSearchText.trim());
                            }}
                          >
                            <span>+ Add "{inspectorSearchText.trim()}" as new inspector</span>
                            <Tag color="processing" style={{ margin: 0 }}>Click to Add</Tag>
                          </div>
                        )}
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
                        onMouseDown={(e) => e.stopPropagation()}
                      >
                        <Input
                          placeholder="Type new inspector..."
                          size="small"
                          value={newInspectorName}
                          onChange={(e) => setNewInspectorName(e.target.value)}
                          onMouseDown={(e) => e.stopPropagation()}
                          onKeyDown={(e) => {
                            e.stopPropagation();
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              const target = newInspectorName.trim() || inspectorSearchText.trim();
                              handleAddNewInspector(target);
                            }
                          }}
                          style={{ flex: 1 }}
                        />
                        <Button
                          type="primary"
                          size="small"
                          icon={<PlusOutlined />}
                          onMouseDown={(e) => e.stopPropagation()}
                          onClick={(e) => {
                            e.stopPropagation();
                            const target = newInspectorName.trim() || inspectorSearchText.trim();
                            handleAddNewInspector(target);
                          }}
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

          {missingSpecsWarning ? (
            <Alert
              type="warning"
              showIcon
              message="No QC Specifications Configured for this Item"
              description={
                <div>
                  <div style={{ fontWeight: 600 }}>{missingSpecsWarning}</div>
                  <div style={{ marginTop: 6, fontSize: '12px', color: token.colorTextSecondary }}>
                    Nominal dimensions and upper/lower tolerances must be configured in the <strong>Item QC Specs Master</strong> tab before recording production inspection samples. Auto-populating dummy tolerances has been disabled.
                  </div>
                </div>
              }
              style={{ marginBottom: 12, borderRadius: 8 }}
            />
          ) : sampleRows.length === 0 ? (
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
