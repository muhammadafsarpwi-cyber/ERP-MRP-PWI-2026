import React, { useState, useEffect } from 'react';
import { Modal, Form, Input, Select, Row, Col, Table, InputNumber, Tag, Button, Space, theme, App, Divider } from 'antd';
import { CheckCircleOutlined, CloseCircleOutlined, SaveOutlined } from '@ant-design/icons';
import { QmsInProcessInspection, InspectionSampleRow, AttributeCheckItem } from './types';
import { loadAllSpecs } from './qcSpecsStore';

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
      const defaultItem = itemsList[0]?.itemCode || 'WIP-SPK-014';
      form.setFieldsValue({
        inspectionDate: today,
        shift: 'G',
        machineNo: '01',
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
  }, [visible, initialInspection]);

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
            <Col span={5}>
              <Form.Item name="machineNo" label="Machine No" rules={[{ required: true }]}>
                <Select
                  showSearch
                  options={[
                    { value: '01', label: 'Machine 01 (SPK-01)' },
                    { value: '02', label: 'Machine 02 (SPK-02)' },
                    { value: '03', label: 'Machine 03 (SPK-03)' },
                    { value: '04', label: 'Machine 04 (SPK-04)' },
                    { value: '05', label: 'Machine 05 (SPK-05)' },
                    { value: '06', label: 'Machine 06 (SPK-06)' },
                  ]}
                />
              </Form.Item>
            </Col>
            <Col span={5}>
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
                  onChange={(code) => loadSpecsForItem(code)}
                  options={
                    itemsList.length > 0
                      ? itemsList.map((i) => ({ value: i.itemCode, label: `${i.itemCode} — ${i.name}` }))
                      : [
                          { value: 'WIP-SPK-014', label: 'WIP-SPK-014 — S9 (Outer) - 300*17 Outer Straight' },
                          { value: 'WIP-ST-006', label: 'WIP-ST-006 — S9 (Inner) - 300*18 Inner Straight' },
                          { value: 'WIP-SPK-002', label: 'WIP-SPK-002 — CD-250*17 Outer Butted' },
                        ]
                  }
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
                <th style={{ padding: '8px', border: `1px solid ${token.colorBorder}` }}>Spec Req (Nominal &amp; Tol)</th>
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

