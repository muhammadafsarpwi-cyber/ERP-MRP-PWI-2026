import React, { useState, useEffect, useMemo } from 'react';
import { Modal, Form, Input, Select, Row, Col, Table, InputNumber, Tag, Button, Space, theme, App } from 'antd';
import { SaveOutlined } from '@ant-design/icons';
import { QmsInProcessInspection, InspectionSampleRow, AttributeCheckItem } from './types';
import { loadAllSpecs } from './qcSpecsStore';

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
}) => {
  const { token } = theme.useToken();
  const { message } = App.useApp();
  const [form] = Form.useForm();

  const [sampleRows, setSampleRows] = useState<InspectionSampleRow[]>([]);
  const [attributeRows, setAttributeRows] = useState<AttributeCheckItem[]>([]);
  const [overallResult, setOverallResult] = useState<'PASS' | 'FAIL' | 'PENDING'>('PASS');

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
        revNo: initialInspection.revNo,
        issueDate: initialInspection.issueDate,
      });
      setSampleRows(initialInspection.samples || []);
      setAttributeRows(initialInspection.attributes || []);
      setOverallResult(initialInspection.overallResult || 'PASS');
    } else {
      // New Inspection defaults
      const today = new Date().toISOString().slice(0, 10);
      const firstDeptItem = (groupedItemOptions[0]?.options as any)?.[0]?.value;
      const defaultItem = firstDeptItem || itemsList[0]?.itemCode || 'WIP-ST-001';
      const defaultMachine = machinesForDept[0]?.code || '01';
      form.setFieldsValue({
        inspectionDate: today,
        shift: 'G',
        machineNo: defaultMachine,
        operatorName: 'Ashfaq',
        itemCode: defaultItem,
        inspectorName: 'Mairaj',
        approvedBy: 'Quality Control Incharge',
        docRef: 'SPD/QMS/05',
        revNo: '02',
        issueDate: '09-Jun-2022',
        remarks: 'Ok',
      });
      loadSpecsForItem(defaultItem);
    }
  }, [visible, initialInspection, departmentCode, machinesForDept, groupedItemOptions]);

  // Load item specs into the 5-sample rows
  const loadSpecsForItem = (code: string) => {
    const allSpecs = loadAllSpecs();
    const match = allSpecs.find((s) => s.itemCode === code) || allSpecs[0];

    if (match) {
      const rows: InspectionSampleRow[] = match.characteristics.map((c) => ({
        ...c,
        s1: c.charName === 'Total Length' ? 159.0 : c.charName === 'Head Dia' ? 6.7 : c.charName === 'Bending Length' ? 9.7 : c.charName === 'Thread Length' ? 14.0 : 30,
        s2: c.charName === 'Total Length' ? 159.0 : c.charName === 'Head Dia' ? 6.7 : c.charName === 'Bending Length' ? 9.7 : c.charName === 'Thread Length' ? 14.0 : 30,
        s3: c.charName === 'Total Length' ? 159.1 : c.charName === 'Head Dia' ? 6.6 : c.charName === 'Bending Length' ? 9.7 : c.charName === 'Thread Length' ? 14.1 : 30,
        s4: c.charName === 'Total Length' ? 159.0 : c.charName === 'Head Dia' ? 6.6 : c.charName === 'Bending Length' ? 9.7 : c.charName === 'Thread Length' ? 14.0 : 31,
        s5: c.charName === 'Total Length' ? 159.1 : c.charName === 'Head Dia' ? 6.7 : c.charName === 'Bending Length' ? 9.7 : c.charName === 'Thread Length' ? 14.1 : 31,
        average: 0,
        status: 'PASS',
      }));

      // Calculate averages and statuses
      const evaluated = rows.map((r) => evaluateRow(r));
      setSampleRows(evaluated);

      const attrs: AttributeCheckItem[] = match.attributes.map((a) => ({
        id: a.id,
        checkName: a.checkName,
        checkedQty: a.sampleSize || 10,
        defectsQty: 0,
        status: 'PASS',
      }));
      setAttributeRows(attrs);
    }
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
    const status: 'PASS' | 'FAIL' = anyFailed ? 'FAIL' : 'PASS';

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
    setOverallResult(samplesFailed || attrsFailed ? 'FAIL' : 'PASS');
  };

  const handleFinish = async () => {
    try {
      const values = await form.validateFields();
      const matchedItem = itemsList.find((i) => i.itemCode === values.itemCode);
      const itemName = matchedItem ? matchedItem.name : values.itemCode;

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

  return (
    <Modal
      title={
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingRight: '24px' }}>
          <div>
            <div style={{ fontSize: '16px', fontWeight: 700, color: token.colorTextHeading }}>
              {initialInspection ? 'Edit Running Production Inspection' : 'New In-Process Quality Inspection (QMS)'}
            </div>
            <div style={{ fontSize: '12px', color: token.colorPrimary, fontWeight: 600 }}>
              {divisionName} • {departmentName} • SPD/QMS/05 (Rev: 02)
            </div>
          </div>
          <Tag color={overallResult === 'PASS' ? 'success' : 'error'} style={{ fontSize: '13px', padding: '4px 10px', fontWeight: 700 }}>
            OVERALL: {overallResult}
          </Tag>
        </div>
      }
      open={visible}
      onCancel={onClose}
      width={950}
      footer={[
        <Button key="cancel" onClick={onClose}>
          Cancel
        </Button>,
        <Button key="save" type="primary" icon={<SaveOutlined />} onClick={handleFinish}>
          Save Inspection Record
        </Button>,
      ]}
    >
      <Form form={form} layout="vertical">
        {/* Header Grid */}
        <div
          style={{
            padding: '12px 16px',
            backgroundColor: token.colorFillAlter,
            borderRadius: '8px',
            marginBottom: '16px',
            border: `1px solid ${token.colorBorderSecondary}`,
          }}
        >
          <Row gutter={12}>
            <Col span={6}>
              <Form.Item name="inspectionDate" label="Date" rules={[{ required: true }]}>
                <Input type="date" />
              </Form.Item>
            </Col>
            <Col span={4}>
              <Form.Item name="shift" label="Shift" rules={[{ required: true }]}>
                <Select
                  options={[
                    { value: 'G', label: 'Shift G (General)' },
                    { value: 'A', label: 'Shift A (Morning)' },
                    { value: 'B', label: 'Shift B (Evening)' },
                    { value: 'C', label: 'Shift C (Night)' },
                  ]}
                />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="machineNo" label={`Machine (${departmentName})`} rules={[{ required: true }]}>
                <Select
                  showSearch
                  options={machinesForDept.map((m) => ({
                    value: m.code,
                    label: m.name,
                  }))}
                />
              </Form.Item>
            </Col>
            <Col span={4}>
              <Form.Item name="operatorName" label="Operator" rules={[{ required: true }]}>
                <Select
                  showSearch
                  options={[
                    { value: 'Ashfaq', label: 'Ashfaq' },
                    { value: 'Ali Asghar', label: 'Ali Asghar' },
                    { value: 'Afroze', label: 'Afroze' },
                    { value: 'Amjad Ali', label: 'Amjad Ali' },
                    { value: 'Arsalan', label: 'Arsalan' },
                    { value: 'Sajeel', label: 'Sajeel' },
                  ]}
                />
              </Form.Item>
            </Col>
            <Col span={4}>
              <Form.Item name="inspectorName" label="Inspector" rules={[{ required: true }]}>
                <Input placeholder="Mairaj" />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={12}>
            <Col span={10}>
              <Form.Item name="itemCode" label="Part / Item" rules={[{ required: true }]}>
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
                  onChange={(code) => loadSpecsForItem(code)}
                  options={groupedItemOptions}
                />
              </Form.Item>
            </Col>
            <Col span={5}>
              <Form.Item name="docRef" label="Doc Ref">
                <Input />
              </Form.Item>
            </Col>
            <Col span={4}>
              <Form.Item name="revNo" label="Revision No">
                <Input />
              </Form.Item>
            </Col>
            <Col span={5}>
              <Form.Item name="approvedBy" label="Approved By">
                <Input />
              </Form.Item>
            </Col>
          </Row>
        </div>

        {/* 5-Sample Dimensional Measurements Matrix */}
        <div style={{ marginBottom: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '13px', fontWeight: 700, color: token.colorTextHeading }}>
              DIMENSIONAL INSPECTION DATA (5 SAMPLES)
            </span>
            <span style={{ fontSize: '11px', color: token.colorTextSecondary }}>
              Auto-calculates Mean &amp; verifies tolerance in real-time
            </span>
          </div>

          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              border: `1px solid ${token.colorBorder}`,
              fontSize: '12px',
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
                      const out = isOutOfSpec(val);
                      return (
                        <td key={key} style={{ padding: '4px', border: `1px solid ${token.colorBorder}`, textAlign: 'center' }}>
                          <InputNumber
                            size="small"
                            value={val}
                            step={0.05}
                            style={{
                              width: '74px',
                              borderColor: out ? token.colorError : undefined,
                              backgroundColor: out ? token.colorErrorBg : undefined,
                            }}
                            onChange={(nv) => handleSampleChange(row.id, key, nv !== null ? Number(nv) : null)}
                          />
                        </td>
                      );
                    })}
                    <td style={{ padding: '6px 8px', border: `1px solid ${token.colorBorder}`, textAlign: 'center', fontWeight: 700 }}>
                      {row.average ? `${row.average} ${row.unit}` : '-'}
                    </td>
                    <td style={{ padding: '6px 8px', border: `1px solid ${token.colorBorder}`, textAlign: 'center' }}>
                      <Tag color={row.status === 'PASS' ? 'success' : 'error'} style={{ fontWeight: 600 }}>
                        {row.status}
                      </Tag>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Attribute Checks */}
        <div style={{ marginBottom: '16px' }}>
          <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: '8px', color: token.colorTextHeading }}>
            VISUAL &amp; STRUCTURAL ATTRIBUTE CHECKS (GO / NO-GO)
          </div>
          <Row gutter={12}>
            {attributeRows.map((attr) => (
              <Col span={8} key={attr.id}>
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
                    <Tag color={attr.status === 'PASS' ? 'success' : 'error'}>{attr.status}</Tag>
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
