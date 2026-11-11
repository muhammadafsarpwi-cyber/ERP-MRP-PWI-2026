import React, { useState, useMemo } from 'react';
import { Card, Table, Button, Space, Modal, Form, Input, InputNumber, Select, App, Row, Col, Tag, Typography, Upload, Divider, Radio, theme } from 'antd';
import { PlusOutlined, DownloadOutlined, UploadOutlined, EditOutlined, DeleteOutlined, FileExcelOutlined, CheckCircleOutlined, ExclamationCircleOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { ItemQcSpecification, DimensionalCharacteristic } from './types';
import { saveAllSpecs, saveDbSpecs, exportSpecsToExcel, exportSpecsTemplateCsv } from './qcSpecsStore';

interface ItemQcSpecsMasterProps {
  specs: ItemQcSpecification[];
  onSpecsChange: (newSpecs: ItemQcSpecification[]) => void;
  divisionName: string;
  departmentName: string;
  divisionCode: string;
  departmentCode: string;
  itemsList: Array<{ id: string; itemCode: string; name: string }>;
  companyId?: string;
}

// Curated standard items per department (ensures department items are always available even if itemsList is loading)
const STANDARD_DEPT_ITEMS: Record<string, Array<{ itemCode: string; name: string }>> = {
  'SPD-DEPT001': [
    { itemCode: 'WIP-ST-001', name: 'CD-250*17 Butted Straight Wire' },
    { itemCode: 'WIP-ST-004', name: 'S9-300*17 Outer Straight Wire' },
    { itemCode: 'WIP-ST-006', name: 'S9-300*18 Inner Straight Wire' },
  ],
  'SPD-DEPT002': [
    { itemCode: 'WIP-SW-001', name: 'CD-250*17 Swagged Spoke Wire' },
    { itemCode: 'WIP-SW-002', name: 'S9-300*17 Swagged Spoke Wire' },
  ],
  'SPD-DEPT003': [
    { itemCode: 'WIP-SPK-001', name: 'CD-250*17 Inner Butted Spoke' },
    { itemCode: 'WIP-SPK-002', name: 'CD-250*17 Outer Butted Spoke' },
    { itemCode: 'WIP-SPK-014', name: 'S9 (Outer) - 300*17 Outer Straight' },
    { itemCode: 'WIP-SPK-015', name: 'S9 (Inner) - 300*18 Inner Straight' },
  ],
  'SPD-DEPT004': [
    { itemCode: 'WIP-HD-001', name: 'Head Blank CD-250' },
    { itemCode: 'WIP-HD-002', name: 'Head Blank S9-300' },
  ],
  'SPD-DEPT005': [
    { itemCode: 'WIP-NP-001', name: 'Brass Nipple 14G Standard' },
    { itemCode: 'WIP-NP-002', name: 'Steel Nipple 10G Heavy Duty' },
  ],
  'SPD-DEPT006': [
    { itemCode: 'WIP-SPL-001', name: 'Zinc Plated Spoke Wire S9' },
    { itemCode: 'WIP-SPL-002', name: 'Nickel Plated Spoke CD-250' },
  ],
  'SPD-DEPT008': [
    { itemCode: 'SPI-FG-001', name: 'Spoke Set CD-70 Finished Pack (72 Pcs)' },
    { itemCode: 'SPI-FG-002', name: 'Spoke Set CG-125 Finished Pack (72 Pcs)' },
  ],
  'CCD-DEPT001': [
    { itemCode: 'FLAT-001', name: 'Flat Outer Spiral Wire' },
    { itemCode: 'FLAT-002', name: 'Flat Wire High Tensile' },
  ],
  'CCD-DEPT002': [
    { itemCode: 'CCD-CAS-001', name: 'Outer Casing Spiral Tube' },
    { itemCode: 'CCD-CAS-002', name: 'Heavy Casing Spiral 6.0mm' },
  ],
  'CCD-DEPT003': [
    { itemCode: 'CCD-IN-001', name: 'Inner Steel Wire 1x19' },
    { itemCode: 'CCD-IN-002', name: 'Inner Wire Galvanized 7x7' },
  ],
  'CCD-DEPT005': [
    { itemCode: 'CCD-FG-001', name: 'Clutch Cable Assy CD-70' },
    { itemCode: 'CCD-FG-002', name: 'Front Brake Cable Assy CG-125' },
    { itemCode: 'CCD-FG-003', name: 'Throttle Cable Assy CD-70' },
  ],
};

// Check if a given spec belongs to a specific department
export const isSpecInDepartment = (
  spec: ItemQcSpecification,
  activeDeptCode: string,
  activeDivCode: string
): boolean => {
  if (!activeDeptCode || activeDeptCode === 'ALL') return true;
  const itemCode = (spec.itemCode || '').toUpperCase().trim();
  const specDept = (spec.departmentCode || '').trim();

  // Straightener (SPD-DEPT001)
  if (activeDeptCode === 'SPD-DEPT001') {
    return itemCode.startsWith('WIP-ST') || itemCode.startsWith('ST-') || specDept === 'SPD-DEPT001';
  }
  // Swagging (SPD-DEPT002)
  if (activeDeptCode === 'SPD-DEPT002') {
    return itemCode.startsWith('WIP-SW') || itemCode.startsWith('SW-') || specDept === 'SPD-DEPT002';
  }
  // Spoke (SPD-DEPT003)
  if (activeDeptCode === 'SPD-DEPT003') {
    if (
      itemCode.startsWith('WIP-ST') ||
      itemCode.startsWith('ST-') ||
      itemCode.startsWith('WIP-SW') ||
      itemCode.startsWith('SW-') ||
      itemCode.startsWith('WIP-HD') ||
      itemCode.startsWith('HD-') ||
      itemCode.startsWith('WIP-NP') ||
      itemCode.startsWith('WIP-NPL') ||
      itemCode.startsWith('FG-NP') ||
      itemCode.startsWith('NP-') ||
      itemCode.startsWith('WIP-SPL') ||
      itemCode.startsWith('SPL-') ||
      itemCode.startsWith('BL-') ||
      itemCode.startsWith('PKS') ||
      itemCode.startsWith('SPI-FG') ||
      itemCode.startsWith('SP-')
    ) {
      return false;
    }
    return itemCode.startsWith('WIP-SPK') || itemCode.startsWith('SPK-') || specDept === 'SPD-DEPT003';
  }
  // Header (SPD-DEPT004)
  if (activeDeptCode === 'SPD-DEPT004') {
    return itemCode.startsWith('WIP-HD') || itemCode.startsWith('HD-') || specDept === 'SPD-DEPT004';
  }
  // Nipple (SPD-DEPT005)
  if (activeDeptCode === 'SPD-DEPT005') {
    return (
      itemCode.startsWith('WIP-NP') ||
      itemCode.startsWith('WIP-NPL') ||
      itemCode.startsWith('FG-NP') ||
      itemCode.startsWith('NP-') ||
      specDept === 'SPD-DEPT005'
    );
  }
  // Spoke Plating (SPD-DEPT006)
  if (activeDeptCode === 'SPD-DEPT006') {
    return (
      itemCode.startsWith('WIP-SPL') ||
      itemCode.startsWith('SPL-') ||
      itemCode.startsWith('BL-') ||
      specDept === 'SPD-DEPT006'
    );
  }
  // Spoke Packing (SPD-DEPT008)
  if (activeDeptCode === 'SPD-DEPT008') {
    return (
      itemCode.startsWith('PKS') ||
      itemCode.startsWith('SPI-FG') ||
      itemCode.startsWith('SP-') ||
      specDept === 'SPD-DEPT008'
    );
  }

  // Control Cable Division
  // Flattening (CCD-DEPT001)
  if (activeDeptCode === 'CCD-DEPT001') {
    return (
      itemCode.startsWith('FLAT') ||
      itemCode.startsWith('FL-') ||
      itemCode.startsWith('FT-') ||
      specDept === 'CCD-DEPT001'
    );
  }
  // Spiral / Outer Casing (CCD-DEPT002)
  if (activeDeptCode === 'CCD-DEPT002') {
    if (itemCode.startsWith('FLAT') || itemCode.startsWith('FL-') || itemCode.startsWith('FT-')) return false;
    return (
      itemCode.startsWith('CCD-CAS') ||
      itemCode.startsWith('CAS-') ||
      itemCode.startsWith('CCD-FGR') ||
      specDept === 'CCD-DEPT002'
    );
  }
  // PVC / Inner Wire (CCD-DEPT003)
  if (activeDeptCode === 'CCD-DEPT003') {
    return (
      itemCode.startsWith('CCD-IN') ||
      itemCode.startsWith('IN-') ||
      itemCode.startsWith('PV-') ||
      specDept === 'CCD-DEPT003'
    );
  }
  // Cutting & Packing / Assembly (CCD-DEPT005 or CCD-DEPT004)
  if (activeDeptCode === 'CCD-DEPT005' || activeDeptCode === 'CCD-DEPT004') {
    return (
      itemCode.startsWith('CCD-FG') ||
      itemCode.startsWith('CA-') ||
      itemCode.startsWith('CPK-') ||
      itemCode.startsWith('PK-') ||
      specDept === activeDeptCode
    );
  }

  return specDept === activeDeptCode;
};

// Generate smart default characteristics based on division and department
const getDefaultCharsForScope = (divCode: string, deptCode: string): DimensionalCharacteristic[] => {
  if (divCode === 'DIV-CCD' || (deptCode && deptCode.startsWith('CCD'))) {
    if (deptCode === 'CCD-DEPT001' || deptCode.includes('FLAT')) {
      // Flattening
      return [
        { id: `c-${Date.now()}-1`, charName: 'Thickness', nominal: 1.25, tolPlus: 0.03, tolMinus: 0.03, unit: 'mm', isCritical: true },
        { id: `c-${Date.now()}-2`, charName: 'Width', nominal: 2.45, tolPlus: 0.05, tolMinus: 0.05, unit: 'mm', isCritical: true },
        { id: `c-${Date.now()}-3`, charName: 'Tensile Strength', nominal: 950.0, tolPlus: 50.0, tolMinus: 50.0, unit: 'N/mm²', isCritical: false },
      ];
    } else if (deptCode === 'CCD-DEPT002' || deptCode === 'CCD-DEPT003') {
      // Outer Casing / PVC / Inner Wire
      return [
        { id: `c-${Date.now()}-1`, charName: 'Outer Diameter', nominal: 5.0, tolPlus: 0.1, tolMinus: 0.1, unit: 'mm', isCritical: true },
        { id: `c-${Date.now()}-2`, charName: 'Inner Diameter', nominal: 2.5, tolPlus: 0.1, tolMinus: 0.1, unit: 'mm', isCritical: true },
        { id: `c-${Date.now()}-3`, charName: 'Coating Thickness', nominal: 0.65, tolPlus: 0.05, tolMinus: 0.05, unit: 'mm', isCritical: false },
      ];
    } else {
      // Assembly
      return [
        { id: `c-${Date.now()}-1`, charName: 'Total Cable Length', nominal: 1050.0, tolPlus: 5.0, tolMinus: 5.0, unit: 'mm', isCritical: true },
        { id: `c-${Date.now()}-2`, charName: 'Stroke / Travel', nominal: 75.0, tolPlus: 2.0, tolMinus: 2.0, unit: 'mm', isCritical: true },
        { id: `c-${Date.now()}-3`, charName: 'Fitting Pull Force', nominal: 120.0, tolPlus: 10.0, tolMinus: 10.0, unit: 'kg', isCritical: false },
      ];
    }
  }

  // Spoke Division
  if (deptCode === 'SPD-DEPT001') {
    // Straightener
    return [
      { id: `c-${Date.now()}-1`, charName: 'Wire Diameter', nominal: 3.2, tolPlus: 0.02, tolMinus: 0.02, unit: 'mm', isCritical: true },
      { id: `c-${Date.now()}-2`, charName: 'Cut Length', nominal: 300.0, tolPlus: 0.5, tolMinus: 0.5, unit: 'mm', isCritical: true },
      { id: `c-${Date.now()}-3`, charName: 'Straightness', nominal: 0.2, tolPlus: 0.05, tolMinus: 0.05, unit: 'mm', isCritical: false },
    ];
  } else if (deptCode === 'SPD-DEPT002') {
    // Swagging
    return [
      { id: `c-${Date.now()}-1`, charName: 'Butted Length', nominal: 45.0, tolPlus: 0.5, tolMinus: 0.5, unit: 'mm', isCritical: true },
      { id: `c-${Date.now()}-2`, charName: 'Reduced Dia', nominal: 2.8, tolPlus: 0.03, tolMinus: 0.03, unit: 'mm', isCritical: true },
      { id: `c-${Date.now()}-3`, charName: 'Transition Taper', nominal: 12.0, tolPlus: 0.5, tolMinus: 0.5, unit: 'mm', isCritical: false },
    ];
  } else if (deptCode === 'SPD-DEPT004') {
    // Header
    return [
      { id: `c-${Date.now()}-1`, charName: 'Head Dia', nominal: 6.6, tolPlus: 0.15, tolMinus: 0.15, unit: 'mm', isCritical: true },
      { id: `c-${Date.now()}-2`, charName: 'Head Thickness', nominal: 1.8, tolPlus: 0.1, tolMinus: 0.1, unit: 'mm', isCritical: true },
      { id: `c-${Date.now()}-3`, charName: 'Shank Dia', nominal: 3.2, tolPlus: 0.02, tolMinus: 0.02, unit: 'mm', isCritical: false },
    ];
  } else if (deptCode === 'SPD-DEPT005') {
    // Nipple
    return [
      { id: `c-${Date.now()}-1`, charName: 'Overall Length', nominal: 16.0, tolPlus: 0.2, tolMinus: 0.2, unit: 'mm', isCritical: true },
      { id: `c-${Date.now()}-2`, charName: 'Body Dia', nominal: 4.0, tolPlus: 0.1, tolMinus: 0.1, unit: 'mm', isCritical: true },
      { id: `c-${Date.now()}-3`, charName: 'Flange Head Dia', nominal: 6.0, tolPlus: 0.15, tolMinus: 0.15, unit: 'mm', isCritical: false },
    ];
  } else if (deptCode === 'SPD-DEPT006') {
    // Spoke Plating
    return [
      { id: `c-${Date.now()}-1`, charName: 'Plating Thickness', nominal: 8.0, tolPlus: 1.5, tolMinus: 1.5, unit: 'µm', isCritical: true },
      { id: `c-${Date.now()}-2`, charName: 'Salt Spray Resistance', nominal: 48.0, tolPlus: 4.0, tolMinus: 4.0, unit: 'Hrs', isCritical: false },
    ];
  } else if (deptCode === 'SPD-DEPT008') {
    // Spoke Packing
    return [
      { id: `c-${Date.now()}-1`, charName: 'Pack Count', nominal: 72.0, tolPlus: 0.0, tolMinus: 0.0, unit: 'Pcs', isCritical: true },
      { id: `c-${Date.now()}-2`, charName: 'Box Gross Weight', nominal: 850.0, tolPlus: 10.0, tolMinus: 10.0, unit: 'g', isCritical: false },
    ];
  }

  // Spoke Department (SPD-DEPT003) standard
  return [
    { id: `c-${Date.now()}-1`, charName: 'Total Length', nominal: 159.5, tolPlus: 0.5, tolMinus: 0.5, unit: 'mm', isCritical: true },
    { id: `c-${Date.now()}-2`, charName: 'Head Dia', nominal: 6.6, tolPlus: 0.15, tolMinus: 0.15, unit: 'mm', isCritical: true },
    { id: `c-${Date.now()}-3`, charName: 'Bending Length', nominal: 9.8, tolPlus: 0.15, tolMinus: 0.15, unit: 'mm', isCritical: true },
    { id: `c-${Date.now()}-4`, charName: 'Thread Length', nominal: 14.0, tolPlus: 0.25, tolMinus: 0.25, unit: 'mm', isCritical: true },
    { id: `c-${Date.now()}-5`, charName: 'Thread Pressure', nominal: 30.0, tolPlus: 2.0, tolMinus: 2.0, unit: 'PSI', isCritical: false },
  ];
};

export const ItemQcSpecsMaster: React.FC<ItemQcSpecsMasterProps> = ({
  specs,
  onSpecsChange,
  divisionName,
  departmentName,
  divisionCode,
  departmentCode,
  itemsList,
  companyId,
}) => {
  const { token } = theme.useToken();
  const { message } = App.useApp();
  const [modalVisible, setModalVisible] = useState(false);
  const [importModalVisible, setImportModalVisible] = useState(false);
  const [editingSpec, setEditingSpec] = useState<ItemQcSpecification | null>(null);
  const [form] = Form.useForm();

  const [characteristics, setCharacteristics] = useState<DimensionalCharacteristic[]>([]);

  // Resolve companyId for DB sync
  const resolvedCompanyId = useMemo(() => {
    if (companyId) return companyId;
    try {
      const raw = localStorage.getItem('erp_user');
      return raw ? JSON.parse(raw)?.defaultCompanyId || '' : '';
    } catch {
      return '';
    }
  }, [companyId]);

  // Scope filter: Show only active department specs by default, or all division specs
  const [scopeFilter, setScopeFilter] = useState<'DEPARTMENT' | 'ALL'>('DEPARTMENT');

  // Deduplicated specs across the division
  const deduplicatedDivisionSpecs = useMemo(() => {
    const uniqueMap = new Map<string, ItemQcSpecification>();
    (specs || []).forEach((s) => {
      if (!s || !s.itemCode) return;
      const key = s.itemCode.trim().toUpperCase();
      if (!uniqueMap.has(key)) {
        uniqueMap.set(key, s);
      } else {
        const existing = uniqueMap.get(key)!;
        const existingTime = existing.updatedAt ? new Date(existing.updatedAt).getTime() : 0;
        const newTime = s.updatedAt ? new Date(s.updatedAt).getTime() : 0;
        if (newTime >= existingTime && (s.characteristics?.length || 0) >= (existing.characteristics?.length || 0)) {
          uniqueMap.set(key, s);
        }
      }
    });

    return Array.from(uniqueMap.values()).filter((s) => {
      const code = (s.itemCode || '').toUpperCase();
      if (divisionCode === 'DIV-CCD') {
        const isSpoke = code.startsWith('WIP-') || code.startsWith('SPK-') || code.startsWith('ST-');
        if (isSpoke) return false;
      } else if (divisionCode === 'DIV-SPD') {
        const isCcd = code.startsWith('CCD') || code.startsWith('FLAT') || code.startsWith('CAS') || code.startsWith('IN-');
        if (isCcd) return false;
      }
      return true;
    });
  }, [specs, divisionCode]);

  // Department-specific count and filtered list
  const departmentSpecs = useMemo(() => {
    return deduplicatedDivisionSpecs.filter((s) => isSpecInDepartment(s, departmentCode, divisionCode));
  }, [deduplicatedDivisionSpecs, departmentCode, divisionCode]);

  const filteredSpecs = useMemo(() => {
    return scopeFilter === 'DEPARTMENT' ? departmentSpecs : deduplicatedDivisionSpecs;
  }, [scopeFilter, departmentSpecs, deduplicatedDivisionSpecs]);

  // Group items for Add/Edit Modal: Missing Specs first, then Configured Specs
  const groupedItemOptions = useMemo(() => {
    // 1. Gather all items from itemsList that belong to the active division
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
          code.startsWith('WIP-NP') ||
          code.startsWith('WIP-SPL')
        )
          return false;
      }
      return true;
    });

    // 2. Department prefixes
    let deptPrefixes: string[] = [];
    if (departmentCode === 'SPD-DEPT001') deptPrefixes = ['WIP-ST', 'ST-'];
    else if (departmentCode === 'SPD-DEPT002') deptPrefixes = ['WIP-SW', 'SW-'];
    else if (departmentCode === 'SPD-DEPT003') deptPrefixes = ['WIP-SPK', 'SPK-'];
    else if (departmentCode === 'SPD-DEPT004') deptPrefixes = ['WIP-HD', 'HD-'];
    else if (departmentCode === 'SPD-DEPT005') deptPrefixes = ['WIP-NP', 'WIP-NPL', 'FG-NP', 'NP-'];
    else if (departmentCode === 'SPD-DEPT006') deptPrefixes = ['WIP-SPL', 'SPL-'];
    else if (departmentCode === 'SPD-DEPT008') deptPrefixes = ['PKS', 'SPI-FG', 'SP-'];
    else if (departmentCode === 'CCD-DEPT001') deptPrefixes = ['FLAT', 'FL-', 'FT-'];
    else if (departmentCode === 'CCD-DEPT002') deptPrefixes = ['CCD-FGR', 'CCD-CAS', 'CAS-'];
    else if (departmentCode === 'CCD-DEPT003') deptPrefixes = ['CCD-IN', 'IN-', 'PV-'];
    else if (departmentCode === 'CCD-DEPT005' || departmentCode === 'CCD-DEPT004') deptPrefixes = ['CCD-FG', 'CA-', 'CPK-', 'PK-'];

    // Collect department items from itemsList
    const rawDeptMatches = divisionCleanItems.filter((it) => {
      const code = (it.itemCode || '').toUpperCase();
      return deptPrefixes.some((pfx) => code.startsWith(pfx));
    });

    // Merge with standard fallback items for this department
    const standardItems = STANDARD_DEPT_ITEMS[departmentCode] || [];
    const deptItemsMap = new Map<string, { itemCode: string; name: string }>();
    standardItems.forEach((it) => deptItemsMap.set(it.itemCode.toUpperCase(), it));
    rawDeptMatches.forEach((it) => deptItemsMap.set(it.itemCode.toUpperCase(), { itemCode: it.itemCode, name: it.name }));
    const allDeptItems = Array.from(deptItemsMap.values());

    // Check which items already have specs in specs
    const configuredSet = new Set(
      (specs || []).map((s) => (s.itemCode || '').trim().toUpperCase())
    );

    const missingDeptItems = allDeptItems.filter((it) => !configuredSet.has(it.itemCode.toUpperCase()));
    const configuredDeptItems = allDeptItems.filter((it) => configuredSet.has(it.itemCode.toUpperCase()));

    const groups: any[] = [];

    // Group 1: Missing Specs for this department (User requested this directly!)
    if (missingDeptItems.length > 0) {
      groups.push({
        label: `★ Missing Specs for ${departmentName} (${missingDeptItems.length} items to add)`,
        options: missingDeptItems.map((i) => ({
          value: i.itemCode,
          label: `⚠️ ${i.itemCode} — ${i.name} [Needs Specs]`,
          name: i.name,
        })),
      });
    }

    // Group 2: Already Configured Specs for this department
    if (configuredDeptItems.length > 0) {
      groups.push({
        label: `✓ Configured Specs for ${departmentName} (${configuredDeptItems.length} items)`,
        options: configuredDeptItems.map((i) => ({
          value: i.itemCode,
          label: `✓ ${i.itemCode} — ${i.name} [Configured]`,
          name: i.name,
        })),
      });
    }

    return groups;
  }, [itemsList, departmentCode, departmentName, divisionName, divisionCode, specs]);

  const handleOpenAdd = () => {
    setEditingSpec(null);
    form.resetFields();
    const defaultDoc = divisionCode === 'DIV-CCD' ? 'CCD/QMS/05' : 'SPD/QMS/05';

    // Auto-pick the first missing item for this department if available
    let initialItemCode = '';
    let initialItemName = '';
    const missingGroup = groupedItemOptions[0]?.options;
    if (missingGroup && missingGroup.length > 0) {
      initialItemCode = missingGroup[0].value;
      initialItemName = (missingGroup[0] as any).name || missingGroup[0].value;
    }

    form.setFieldsValue({
      itemCode: initialItemCode || undefined,
      itemName: initialItemName || undefined,
      docRef: defaultDoc,
      revNo: '02',
      issueDate: '09-Jun-2022',
    });
    setCharacteristics(getDefaultCharsForScope(divisionCode, departmentCode));
    setModalVisible(true);
  };

  const handleOpenEdit = (spec: ItemQcSpecification) => {
    setEditingSpec(spec);
    form.setFieldsValue({
      itemCode: spec.itemCode,
      itemName: spec.itemName,
      docRef: spec.docRef,
      revNo: spec.revNo,
      issueDate: spec.issueDate,
    });
    setCharacteristics(spec.characteristics || []);
    setModalVisible(true);
  };

  const handleAddCharRow = () => {
    const isCcd = divisionCode === 'DIV-CCD';
    const newChar: DimensionalCharacteristic = {
      id: `c-${Date.now()}-${characteristics.length + 1}`,
      charName: '',
      nominal: 0,
      tolPlus: 0.1,
      tolMinus: 0.1,
      unit: isCcd ? 'mm' : 'mm',
      isCritical: false,
    };
    setCharacteristics((prev) => [...prev, newChar]);
  };

  const handleRemoveChar = (id: string) => {
    setCharacteristics((prev) => prev.filter((c) => c.id !== id));
  };

  const handleDeleteSpec = (id: string) => {
    const updated = specs.filter((s) => s.id !== id);
    onSpecsChange(updated);
    saveAllSpecs(updated);
    if (resolvedCompanyId) {
      saveDbSpecs(resolvedCompanyId, updated).catch(() => {});
    }
    message.success('Item specification deleted');
  };

  const handleSaveSpec = async () => {
    try {
      const values = await form.validateFields();
      if (!characteristics || characteristics.length === 0) {
        message.warning('Please add at least one characteristic parameter');
        return;
      }
      const hasEmptyName = characteristics.some((c) => !c.charName || !c.charName.trim());
      if (hasEmptyName) {
        message.warning('Please enter a parameter name for all rows (e.g. Thickness, Width, Outer Dia...)');
        return;
      }

      const matched =
        itemsList.find((i) => i.itemCode === values.itemCode) ||
        (STANDARD_DEPT_ITEMS[departmentCode] || []).find((i) => i.itemCode === values.itemCode);
      const itemName = matched ? matched.name : values.itemName || values.itemCode;
      const isCcd =
        divisionCode === 'DIV-CCD' ||
        (values.itemCode || '').toUpperCase().startsWith('CCD') ||
        (values.itemCode || '').toUpperCase().startsWith('FLAT');
      const assignedDivCode = isCcd ? 'DIV-CCD' : 'DIV-SPD';
      const assignedDeptCode = departmentCode || (isCcd ? 'CCD-DEPT001' : 'SPD-DEPT003');

      const newSpec: ItemQcSpecification = {
        id: editingSpec ? editingSpec.id : `spec-${Date.now()}`,
        divisionCode: assignedDivCode,
        departmentCode: assignedDeptCode,
        itemCode: values.itemCode.trim(),
        itemName,
        docRef: values.docRef || (isCcd ? 'CCD/QMS/05' : 'SPD/QMS/05'),
        revNo: values.revNo || '02',
        issueDate: values.issueDate || '09-Jun-2022',
        characteristics,
        attributes: editingSpec?.attributes || [
          { id: 'a1', checkName: isCcd ? 'Surface Burrs & Scratches' : 'Thread Checking', sampleSize: 10, maxAllowedDefects: 0 },
          { id: 'a2', checkName: isCcd ? 'Edge Smoothness' : 'Bending Broken', sampleSize: 10, maxAllowedDefects: 0 },
          { id: 'a3', checkName: isCcd ? 'Color Uniformity' : 'Head Crack', sampleSize: 10, maxAllowedDefects: 0 },
        ],
        updatedAt: new Date().toISOString(),
      };

      // Strict deduplication when updating specs list by itemCode or id
      const targetCode = newSpec.itemCode.toUpperCase();
      const updated = editingSpec
        ? specs.map((s) => (s.id === editingSpec.id || s.itemCode?.trim().toUpperCase() === targetCode ? newSpec : s))
        : [...specs.filter((s) => s.itemCode?.trim().toUpperCase() !== targetCode), newSpec];

      onSpecsChange(updated);
      saveAllSpecs(updated);
      if (resolvedCompanyId) {
        saveDbSpecs(resolvedCompanyId, updated).catch(() => {});
      }
      message.success(`Item QC Specifications for "${newSpec.itemCode}" saved successfully!`);
      setModalVisible(false);
    } catch {
      message.error('Please verify all form fields');
    }
  };

  const handleUpdateChar = (id: string, field: keyof DimensionalCharacteristic, val: any) => {
    setCharacteristics((prev) => prev.map((c) => (c.id === id ? { ...c, [field]: val } : c)));
  };

  // CSV Bulk Import Parser
  const handleCsvUpload = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        if (!text) return;

        const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
        if (lines.length <= 1) {
          message.warning('CSV file appears empty or missing data rows');
          return;
        }

        // Group rows by itemCode
        const grouped = new Map<string, { itemName: string; chars: DimensionalCharacteristic[] }>();

        for (let i = 1; i < lines.length; i++) {
          const parts = lines[i].split(',').map((p) => p.trim());
          if (parts.length < 5) continue;
          const [itemCode, itemName, charName, nominal, tolPlus, tolMinus, unit, isCritical] = parts;

          if (!grouped.has(itemCode)) {
            grouped.set(itemCode, { itemName: itemName || itemCode, chars: [] });
          }

          grouped.get(itemCode)!.chars.push({
            id: `c-${Date.now()}-${i}`,
            charName,
            nominal: Number(nominal || 0),
            tolPlus: Number(tolPlus || 0.1),
            tolMinus: Number(tolMinus || 0.1),
            unit: unit || 'mm',
            isCritical: String(isCritical || '').toUpperCase() === 'YES',
          });
        }

        const newSpecs: ItemQcSpecification[] = [];
        grouped.forEach((data, code) => {
          newSpecs.push({
            id: `imported-${code}-${Date.now()}`,
            divisionCode: divisionCode || 'DIV-SPD',
            departmentCode: departmentCode || 'SPD-DEPT003',
            itemCode: code,
            itemName: data.itemName,
            docRef: 'SPD/QMS/05',
            revNo: '02',
            issueDate: '09-Jun-2022',
            characteristics: data.chars,
            attributes: [
              { id: 'a1', checkName: 'Thread Checking', sampleSize: 10, maxAllowedDefects: 0 },
              { id: 'a2', checkName: 'Bending Broken', sampleSize: 10, maxAllowedDefects: 0 },
              { id: 'a3', checkName: 'Head Crack', sampleSize: 10, maxAllowedDefects: 0 },
            ],
            updatedAt: new Date().toISOString(),
          });
        });

        // Merge with existing specs (replace matching itemCode, keep others)
        const updated = [...specs];
        newSpecs.forEach((ns) => {
          const idx = updated.findIndex((s) => s.itemCode === ns.itemCode);
          if (idx >= 0) {
            updated[idx] = ns;
          } else {
            updated.push(ns);
          }
        });

        onSpecsChange(updated);
        saveAllSpecs(updated);
        message.success(`Successfully imported specifications for ${newSpecs.length} items!`);
        setImportModalVisible(false);
      } catch (err) {
        message.error('Failed to parse CSV file. Please check template format.');
      }
    };
    reader.readAsText(file);
    return false; // prevent upload
  };

  const columns: ColumnsType<ItemQcSpecification> = [
    {
      title: 'Item Code',
      dataIndex: 'itemCode',
      key: 'itemCode',
      width: 140,
      render: (code: string) => <Tag color="blue">{code}</Tag>,
    },
    {
      title: 'Item Name',
      dataIndex: 'itemName',
      key: 'itemName',
      render: (name: string, r) => (
        <div>
          <div style={{ fontWeight: 600, color: token.colorText }}>{name}</div>
          <div style={{ fontSize: '11px', color: token.colorTextSecondary }}>
            {r.docRef} (Rev: {r.revNo})
          </div>
        </div>
      ),
    },
    {
      title: 'Characteristics & Tolerances',
      dataIndex: 'characteristics',
      key: 'chars',
      render: (chars: DimensionalCharacteristic[]) => (
        <Space size={[4, 6]} wrap>
          {chars.map((c) => (
            <Tag key={c.id}>
              <strong>{c.charName}:</strong> {c.nominal} (±{c.tolPlus} {c.unit})
            </Tag>
          ))}
        </Space>
      ),
    },
    {
      title: 'Updated',
      dataIndex: 'updatedAt',
      key: 'updated',
      width: 110,
      render: (d: string) => (d ? new Date(d).toLocaleDateString() : '-'),
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 130,
      render: (_, r) => (
        <Space size={4}>
          <Button size="small" icon={<EditOutlined />} onClick={() => handleOpenEdit(r)}>
            Edit
          </Button>
          <Button size="small" danger icon={<DeleteOutlined />} onClick={() => handleDeleteSpec(r.id)} />
        </Space>
      ),
    },
  ];

  return (
    <div style={{ width: '100%', maxWidth: '100%', overflowX: 'hidden' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '14px',
          flexWrap: 'wrap',
          gap: '10px',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <Typography.Title level={5} style={{ margin: 0 }}>
              Item Quality Specifications Master
            </Typography.Title>
            <Tag color="processing" style={{ fontWeight: 600 }}>
              {scopeFilter === 'DEPARTMENT'
                ? `${departmentName} Department (${departmentSpecs.length} items)`
                : `All ${divisionName} (${deduplicatedDivisionSpecs.length} items)`}
            </Tag>
            <Radio.Group
              value={scopeFilter}
              onChange={(e) => setScopeFilter(e.target.value)}
              size="small"
              buttonStyle="solid"
            >
              <Radio.Button value="DEPARTMENT">
                {departmentName} Only ({departmentSpecs.length})
              </Radio.Button>
              <Radio.Button value="ALL">
                All {divisionName} ({deduplicatedDivisionSpecs.length})
              </Radio.Button>
            </Radio.Group>
          </div>
          <Typography.Text type="secondary" style={{ fontSize: '12px' }}>
            Showing items strictly filtered to active department scope. Pre-configured tolerances auto-load in inspections.
          </Typography.Text>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
          <Button icon={<DownloadOutlined />} onClick={exportSpecsTemplateCsv}>
            CSV Template
          </Button>
          <Button icon={<FileExcelOutlined />} onClick={() => exportSpecsToExcel(filteredSpecs, divisionName, departmentName)}>
            Export Specs (Excel)
          </Button>
          <Button icon={<UploadOutlined />} onClick={() => setImportModalVisible(true)}>
            Import Specs (Excel / CSV)
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={handleOpenAdd}>
            Add Item Specs
          </Button>
        </div>
      </div>

      <Table
        size="small"
        scroll={{ x: 750 }}
        columns={columns}
        dataSource={filteredSpecs}
        rowKey="id"
        pagination={{ pageSize: 10 }}
        locale={{
          emptyText: (
            <div style={{ padding: '28px 16px', textAlign: 'center' }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: token.colorTextHeading, marginBottom: 6 }}>
                No QC Specifications Configured for {scopeFilter === 'DEPARTMENT' ? `${departmentName} Department` : divisionName}
              </div>
              <div style={{ fontSize: 12, color: token.colorTextSecondary, maxWidth: 520, margin: '0 auto 16px' }}>
                {scopeFilter === 'DEPARTMENT' && deduplicatedDivisionSpecs.length > 0 ? (
                  <span>
                    There are {deduplicatedDivisionSpecs.length} configured item(s) in other departments of this division. You can switch to division view or add specifications for {departmentName}.
                  </span>
                ) : (
                  <span>
                    No item quality criteria, nominal dimensions, or tolerance limits have been saved yet. Click below to add specifications for this department.
                  </span>
                )}
              </div>
              <Space>
                {scopeFilter === 'DEPARTMENT' && deduplicatedDivisionSpecs.length > 0 && (
                  <Button onClick={() => setScopeFilter('ALL')}>
                    View All {divisionName} Specs ({deduplicatedDivisionSpecs.length})
                  </Button>
                )}
                <Button type="primary" icon={<PlusOutlined />} onClick={handleOpenAdd}>
                  + Add Item Specs for {departmentName}
                </Button>
              </Space>
            </div>
          ),
        }}
      />

      {/* Add / Edit Specs Modal */}
      <Modal
        title={editingSpec ? 'Edit Item Quality Specifications' : 'Add Item Quality Specifications'}
        open={modalVisible}
        onCancel={() => setModalVisible(false)}
        onOk={handleSaveSpec}
        width={780}
      >
        <Form form={form} layout="vertical">
          <div
            style={{
              marginBottom: '12px',
              padding: '8px 12px',
              background: token.colorFillAlter,
              borderRadius: '6px',
              border: `1px solid ${token.colorBorderSecondary}`,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '6px',
            }}
          >
            <Space size={6}>
              <Tag color="blue" style={{ fontWeight: 600 }}>{divisionName}</Tag>
              <Tag color="cyan" style={{ fontWeight: 600 }}>★ {departmentName} Department ({departmentCode})</Tag>
            </Space>
            <Typography.Text type="secondary" style={{ fontSize: '11px' }}>
              Specs will be bound to {departmentName} department
            </Typography.Text>
          </div>

          <Row gutter={12}>
            <Col span={13}>
              <Form.Item name="itemCode" label="Item Code / Selection" rules={[{ required: true, message: 'Please select an item' }]}>
                <Select
                  showSearch
                  allowClear
                  optionFilterProp="label"
                  placeholder="Select item or type code..."
                  filterOption={(input, option) => {
                    const label = String(option?.label || '');
                    const value = String(option?.value || '');
                    const term = input.toLowerCase();
                    return label.toLowerCase().includes(term) || value.toLowerCase().includes(term);
                  }}
                  onChange={(val, opt: any) => {
                    if (!val) {
                      form.setFieldsValue({ itemName: '' });
                      return;
                    }
                    const found =
                      itemsList.find((i) => i.itemCode === val) ||
                      (STANDARD_DEPT_ITEMS[departmentCode] || []).find((i) => i.itemCode === val);
                    const resolvedName = found?.name || opt?.name || val;
                    form.setFieldsValue({ itemName: resolvedName });

                    const existingSpec = specs.find(
                      (s) => (s.itemCode || '').trim().toUpperCase() === val.trim().toUpperCase()
                    );
                    if (existingSpec && existingSpec.characteristics && existingSpec.characteristics.length > 0) {
                      setCharacteristics(existingSpec.characteristics);
                      form.setFieldsValue({
                        docRef: existingSpec.docRef || form.getFieldValue('docRef'),
                        revNo: existingSpec.revNo || form.getFieldValue('revNo'),
                        issueDate: existingSpec.issueDate || form.getFieldValue('issueDate'),
                      });
                    } else {
                      setCharacteristics(getDefaultCharsForScope(divisionCode, departmentCode));
                    }
                  }}
                  options={groupedItemOptions}
                />
              </Form.Item>
            </Col>
            <Col span={11}>
              <Form.Item name="itemName" label="Item Name / Description" rules={[{ required: true, message: 'Please enter item name' }]}>
                <Input placeholder="e.g. S9 (Outer) - 300*17 Outer Straight" />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={12}>
            <Col span={10}>
              <Form.Item name="docRef" label="Doc Ref" initialValue={divisionCode === 'DIV-CCD' ? 'CCD/QMS/05' : 'SPD/QMS/05'}>
                <Input />
              </Form.Item>
            </Col>
            <Col span={7}>
              <Form.Item name="revNo" label="Revision No" initialValue="02">
                <Input />
              </Form.Item>
            </Col>
            <Col span={7}>
              <Form.Item name="issueDate" label="Issue Date" initialValue="09-Jun-2022">
                <Input />
              </Form.Item>
            </Col>
          </Row>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '12px 0 8px 0' }}>
            <span style={{ fontSize: '13px', fontWeight: 700, color: token.colorTextHeading }}>
              Dimensional Characteristics &amp; Tolerances (±)
            </span>
            <Tag color="cyan">{divisionName} • {departmentName}</Tag>
          </div>

          <div style={{ width: '100%', overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
            <table style={{ width: '100%', minWidth: '550px', borderCollapse: 'collapse', border: `1px solid ${token.colorBorder}` }}>
            <thead>
              <tr style={{ backgroundColor: token.colorFillAlter, textAlign: 'left' }}>
                <th style={{ padding: '6px 8px', border: `1px solid ${token.colorBorder}`, width: '32%' }}>
                  Parameter Name
                </th>
                <th style={{ padding: '6px 8px', border: `1px solid ${token.colorBorder}`, width: '22%' }}>
                  Dimension Requirement
                </th>
                <th style={{ padding: '6px 8px', border: `1px solid ${token.colorBorder}`, width: '15%' }}>
                  Tol (+)
                </th>
                <th style={{ padding: '6px 8px', border: `1px solid ${token.colorBorder}`, width: '15%' }}>
                  Tol (-)
                </th>
                <th style={{ padding: '6px 8px', border: `1px solid ${token.colorBorder}`, width: '11%' }}>
                  Unit
                </th>
                <th style={{ padding: '6px 8px', border: `1px solid ${token.colorBorder}`, textAlign: 'center', width: '45px' }}>
                  Action
                </th>
              </tr>
            </thead>
            <tbody>
              {characteristics.map((c) => (
                <tr key={c.id}>
                  <td style={{ padding: '4px', border: `1px solid ${token.colorBorder}` }}>
                    <Input
                      value={c.charName}
                      placeholder="e.g. Thickness, Width, Outer Dia..."
                      style={{ fontWeight: 600 }}
                      onChange={(e) => handleUpdateChar(c.id, 'charName', e.target.value)}
                    />
                  </td>
                  <td style={{ padding: '4px', border: `1px solid ${token.colorBorder}` }}>
                    <InputNumber
                      value={c.nominal}
                      step={0.1}
                      style={{ width: '100%' }}
                      onChange={(v) => handleUpdateChar(c.id, 'nominal', Number(v || 0))}
                    />
                  </td>
                  <td style={{ padding: '4px', border: `1px solid ${token.colorBorder}` }}>
                    <InputNumber
                      value={c.tolPlus}
                      step={0.05}
                      style={{ width: '100%' }}
                      onChange={(v) => handleUpdateChar(c.id, 'tolPlus', Number(v || 0))}
                    />
                  </td>
                  <td style={{ padding: '4px', border: `1px solid ${token.colorBorder}` }}>
                    <InputNumber
                      value={c.tolMinus}
                      step={0.05}
                      style={{ width: '100%' }}
                      onChange={(v) => handleUpdateChar(c.id, 'tolMinus', Number(v || 0))}
                    />
                  </td>
                  <td style={{ padding: '4px', border: `1px solid ${token.colorBorder}` }}>
                    <Input
                      value={c.unit}
                      style={{ width: '100%' }}
                      onChange={(e) => handleUpdateChar(c.id, 'unit', e.target.value)}
                    />
                  </td>
                  <td style={{ padding: '4px', border: `1px solid ${token.colorBorder}`, textAlign: 'center' }}>
                    <Button
                      type="text"
                      danger
                      size="small"
                      icon={<DeleteOutlined />}
                      onClick={() => handleRemoveChar(c.id)}
                      disabled={characteristics.length <= 1}
                      title="Delete parameter"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

          <Button
            type="dashed"
            icon={<PlusOutlined />}
            onClick={handleAddCharRow}
            style={{ width: '100%', marginTop: '10px' }}
          >
            + Add Characteristic Parameter
          </Button>
        </Form>
      </Modal>

      {/* Import Modal */}
      <Modal
        title="Import Item QC Specifications (Excel / CSV)"
        open={importModalVisible}
        onCancel={() => setImportModalVisible(false)}
        footer={null}
        width={500}
      >
        <div style={{ padding: '12px 0' }}>
          <Typography.Paragraph>
            Upload a comma-separated (CSV) file containing the items and their target tolerances.
            You can download the sample template first to fill in your factory specifications.
          </Typography.Paragraph>

          <Space direction="vertical" style={{ width: '100%' }}>
            <Button icon={<DownloadOutlined />} onClick={exportSpecsTemplateCsv} block>
              Download Sample CSV Template
            </Button>
            <Divider style={{ margin: '12px 0' }} />
            <Upload.Dragger
              accept=".csv,.txt"
              showUploadList={false}
              beforeUpload={handleCsvUpload}
              style={{ padding: '20px' }}
            >
              <p className="ant-upload-drag-icon">
                <UploadOutlined style={{ fontSize: '32px', color: token.colorPrimary }} />
              </p>
              <p className="ant-upload-text">Click or drag CSV file to this area to import</p>
              <p className="ant-upload-hint">Supports bulk import for all items across {divisionName}</p>
            </Upload.Dragger>
          </Space>
        </div>
      </Modal>
    </div>
  );
};

