import React, { useState, useMemo } from 'react';
import { Card, Table, Button, Space, Modal, Form, Input, InputNumber, Select, App, Row, Col, Tag, Typography, Upload, Divider, theme } from 'antd';
import { PlusOutlined, DownloadOutlined, UploadOutlined, EditOutlined, DeleteOutlined, FileExcelOutlined } from '@ant-design/icons';
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
    return [
      { id: `c-${Date.now()}-1`, charName: 'Wire Diameter', nominal: 3.2, tolPlus: 0.02, tolMinus: 0.02, unit: 'mm', isCritical: true },
      { id: `c-${Date.now()}-2`, charName: 'Cut Length', nominal: 300.0, tolPlus: 0.5, tolMinus: 0.5, unit: 'mm', isCritical: true },
      { id: `c-${Date.now()}-3`, charName: 'Straightness', nominal: 0.2, tolPlus: 0.05, tolMinus: 0.05, unit: 'mm', isCritical: false },
    ];
  } else if (deptCode === 'SPD-DEPT006') {
    return [
      { id: `c-${Date.now()}-1`, charName: 'Plating Thickness', nominal: 8.0, tolPlus: 1.5, tolMinus: 1.5, unit: 'µm', isCritical: true },
      { id: `c-${Date.now()}-2`, charName: 'Salt Spray Resistance', nominal: 48.0, tolPlus: 4.0, tolMinus: 4.0, unit: 'Hrs', isCritical: false },
    ];
  }

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

  // Filter specs by active division
  const filteredSpecs = useMemo(() => {
    return specs.filter((s) => {
      if (!divisionCode) return true;
      if (s.divisionCode === divisionCode) return true;
      const code = (s.itemCode || '').toUpperCase();
      if (divisionCode === 'DIV-CCD') {
        return code.startsWith('CCD') || code.startsWith('FLAT') || code.startsWith('CAS') || code.startsWith('IN-') || code.startsWith('CA-');
      } else if (divisionCode === 'DIV-SPD') {
        return !code.startsWith('CCD') && !code.startsWith('FLAT') && !code.startsWith('CAS');
      }
      return true;
    });
  }, [specs, divisionCode]);

  // Group items by Department affinity
  const groupedItemOptions = useMemo(() => {
    if (!itemsList || itemsList.length === 0) {
      return [
        {
          label: `Standard ${departmentName} Items`,
          options: [
            { value: 'WIP-ST-001', label: 'WIP-ST-001 — CD-250*17 Butted' },
            { value: 'WIP-ST-004', label: 'WIP-ST-004 — S9-300*17 Outer Straight' },
            { value: 'WIP-ST-006', label: 'WIP-ST-006 — S9-300*18 Inner Straight' },
            { value: 'WIP-SPK-014', label: 'WIP-SPK-014 — S9 (Outer) - 300*17 Outer Straight' },
            { value: 'WIP-SPK-002', label: 'WIP-SPK-002 — CD-250*17 Outer Butted' },
          ],
        },
      ];
    }

    // Determine departmental prefixes
    let deptPrefixes: string[] = [];
    if (departmentCode === 'SPD-DEPT001') { // Straightener
      deptPrefixes = ['WIP-ST', 'ST-'];
    } else if (departmentCode === 'SPD-DEPT002') { // Swagging
      deptPrefixes = ['WIP-SW', 'SW-'];
    } else if (departmentCode === 'SPD-DEPT003') { // Spoke
      deptPrefixes = ['WIP-SPK', 'SPK-'];
    } else if (departmentCode === 'SPD-DEPT004') { // Header
      deptPrefixes = ['WIP-HD', 'HD-'];
    } else if (departmentCode === 'SPD-DEPT005') { // Nipple
      deptPrefixes = ['WIP-NP', 'WIP-NPL', 'FG-NP', 'NP-'];
    } else if (departmentCode === 'SPD-DEPT006') { // Spoke Plating
      deptPrefixes = ['WIP-SPL', 'SPL-'];
    } else if (departmentCode === 'SPD-DEPT008') { // Spoke Packing
      deptPrefixes = ['PKS', 'SPI-FG', 'SP-'];
    } else if (departmentCode === 'CCD-DEPT001') { // Flattening
      deptPrefixes = ['FLAT', 'FL-', 'FT-'];
    } else if (departmentCode === 'CCD-DEPT002') { // Outer Casing
      deptPrefixes = ['CCD-FGR', 'CCD-CAS', 'CAS-'];
    } else if (departmentCode === 'CCD-DEPT003') { // Inner Wire
      deptPrefixes = ['CCD-IN', 'IN-'];
    } else if (departmentCode === 'CCD-DEPT004') { // Assembly
      deptPrefixes = ['CCD-FG', 'CA-'];
    }

    // Filter out foreign division items strictly
    const divisionCleanItems = itemsList.filter((it) => {
      const code = (it.itemCode || '').toUpperCase();
      if (divisionCode === 'DIV-SPD') {
        // Spoke division should never have CCD cable items
        if (code.startsWith('CCD-') || code.startsWith('FLAT')) return false;
      } else if (divisionCode === 'DIV-CCD') {
        // Control cable division should never have Spoke WIP items
        if (code.startsWith('WIP-SPK') || code.startsWith('WIP-ST') || code.startsWith('WIP-SW') || code.startsWith('WIP-HD') || code.startsWith('WIP-NPL') || code.startsWith('WIP-SPL')) return false;
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

  const handleOpenAdd = () => {
    setEditingSpec(null);
    form.resetFields();
    const defaultDoc = divisionCode === 'DIV-CCD' ? 'CCD/QMS/05' : 'SPD/QMS/05';
    form.setFieldsValue({
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

      const matched = itemsList.find((i) => i.itemCode === values.itemCode);
      const itemName = matched ? matched.name : values.itemName || values.itemCode;
      const isCcd = divisionCode === 'DIV-CCD' || (values.itemCode || '').toUpperCase().startsWith('CCD') || (values.itemCode || '').toUpperCase().startsWith('FLAT');
      const assignedDivCode = isCcd ? 'DIV-CCD' : 'DIV-SPD';
      const assignedDeptCode = departmentCode || (isCcd ? 'CCD-DEPT001' : 'SPD-DEPT003');

      const newSpec: ItemQcSpecification = {
        id: editingSpec ? editingSpec.id : `spec-${Date.now()}`,
        divisionCode: assignedDivCode,
        departmentCode: assignedDeptCode,
        itemCode: values.itemCode,
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

      const updated = editingSpec
        ? specs.map((s) => (s.id === editingSpec.id ? newSpec : s))
        : [...specs, newSpec];

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
    <div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '14px',
          flexWrap: 'wrap',
          gap: '8px',
        }}
      >
        <div>
          <Typography.Title level={5} style={{ margin: 0 }}>
            Item Quality Specifications Master
          </Typography.Title>
          <Typography.Text type="secondary" style={{ fontSize: '12px' }}>
            Pre-configured nominal specs and tolerances auto-loaded during Running Production Inspections
          </Typography.Text>
        </div>
        <Space wrap>
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
        </Space>
      </div>

      <Table
        size="small"
        columns={columns}
        dataSource={filteredSpecs}
        rowKey="id"
        pagination={{ pageSize: 10 }}
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
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="itemCode" label="Item Code / Selection" rules={[{ required: true }]}>
                <Select
                  showSearch
                  optionFilterProp="label"
                  placeholder="Select item or type code..."
                  filterOption={(input, option) => {
                    const label = String(option?.label || '');
                    const value = String(option?.value || '');
                    const term = input.toLowerCase();
                    return label.toLowerCase().includes(term) || value.toLowerCase().includes(term);
                  }}
                  onChange={(val) => {
                    const found = itemsList.find((i) => i.itemCode === val);
                    if (found) {
                      form.setFieldsValue({ itemName: found.name });
                    }
                  }}
                  options={groupedItemOptions}
                />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="docRef" label="Doc Ref" initialValue="SPD/QMS/05">
                <Input />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="revNo" label="Revision No" initialValue="02">
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

          <table style={{ width: '100%', borderCollapse: 'collapse', border: `1px solid ${token.colorBorder}` }}>
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

