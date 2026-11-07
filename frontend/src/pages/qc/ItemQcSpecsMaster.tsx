import React, { useState } from 'react';
import { Card, Table, Button, Space, Modal, Form, Input, InputNumber, Select, App, Row, Col, Tag, Typography, Upload, Divider, theme } from 'antd';
import { PlusOutlined, DownloadOutlined, UploadOutlined, EditOutlined, DeleteOutlined, FileExcelOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { ItemQcSpecification, DimensionalCharacteristic } from './types';
import { saveAllSpecs, exportSpecsToExcel, exportSpecsTemplateCsv } from './qcSpecsStore';

interface ItemQcSpecsMasterProps {
  specs: ItemQcSpecification[];
  onSpecsChange: (newSpecs: ItemQcSpecification[]) => void;
  divisionName: string;
  departmentName: string;
  divisionCode: string;
  departmentCode: string;
  itemsList: Array<{ id: string; itemCode: string; name: string }>;
}

export const ItemQcSpecsMaster: React.FC<ItemQcSpecsMasterProps> = ({
  specs,
  onSpecsChange,
  divisionName,
  departmentName,
  divisionCode,
  departmentCode,
  itemsList,
}) => {
  const { token } = theme.useToken();
  const { message } = App.useApp();
  const [modalVisible, setModalVisible] = useState(false);
  const [importModalVisible, setImportModalVisible] = useState(false);
  const [editingSpec, setEditingSpec] = useState<ItemQcSpecification | null>(null);
  const [form] = Form.useForm();

  const [characteristics, setCharacteristics] = useState<DimensionalCharacteristic[]>([]);

  // Filter specs by active division (or all if not strictly matched)
  const filteredSpecs = specs.filter(
    (s) => !divisionCode || s.divisionCode === divisionCode || s.divisionCode === 'DIV-SPD'
  );

  const handleOpenAdd = () => {
    setEditingSpec(null);
    form.resetFields();
    setCharacteristics([
      { id: 'c1', charName: 'Total Length', nominal: 159.5, tolPlus: 0.5, tolMinus: 0.5, unit: 'mm', isCritical: true },
      { id: 'c2', charName: 'Head Dia', nominal: 6.6, tolPlus: 0.15, tolMinus: 0.15, unit: 'mm', isCritical: true },
      { id: 'c3', charName: 'Bending Length', nominal: 9.8, tolPlus: 0.15, tolMinus: 0.15, unit: 'mm', isCritical: true },
      { id: 'c4', charName: 'Thread Length', nominal: 14.0, tolPlus: 0.25, tolMinus: 0.25, unit: 'mm', isCritical: true },
      { id: 'c5', charName: 'Thread Pressure', nominal: 30.0, tolPlus: 2.0, tolMinus: 2.0, unit: 'PSI', isCritical: false },
    ]);
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

  const handleDeleteSpec = (id: string) => {
    const updated = specs.filter((s) => s.id !== id);
    onSpecsChange(updated);
    saveAllSpecs(updated);
    message.success('Item specification deleted');
  };

  const handleSaveSpec = async () => {
    try {
      const values = await form.validateFields();
      const matched = itemsList.find((i) => i.itemCode === values.itemCode);
      const itemName = matched ? matched.name : values.itemName || values.itemCode;

      const newSpec: ItemQcSpecification = {
        id: editingSpec ? editingSpec.id : `spec-${Date.now()}`,
        divisionCode: divisionCode || 'DIV-SPD',
        departmentCode: departmentCode || 'SPD-DEPT003',
        itemCode: values.itemCode,
        itemName,
        docRef: values.docRef || 'SPD/QMS/05',
        revNo: values.revNo || '02',
        issueDate: values.issueDate || '09-Jun-2022',
        characteristics,
        attributes: [
          { id: 'a1', checkName: 'Thread Checking', sampleSize: 10, maxAllowedDefects: 0 },
          { id: 'a2', checkName: 'Bending Broken', sampleSize: 10, maxAllowedDefects: 0 },
          { id: 'a3', checkName: 'Head Crack', sampleSize: 10, maxAllowedDefects: 0 },
        ],
        updatedAt: new Date().toISOString(),
      };

      const updated = editingSpec
        ? specs.map((s) => (s.id === editingSpec.id ? newSpec : s))
        : [...specs, newSpec];

      onSpecsChange(updated);
      saveAllSpecs(updated);
      message.success('Item QC Specifications saved!');
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

          <Divider orientation="left" style={{ margin: '8px 0 12px 0', fontSize: '13px' }}>
            Dimensional Characteristics &amp; Tolerances (±)
          </Divider>

          <table style={{ width: '100%', borderCollapse: 'collapse', border: `1px solid ${token.colorBorder}` }}>
            <thead>
              <tr style={{ backgroundColor: token.colorFillAlter, textAlign: 'left' }}>
                <th style={{ padding: '6px 8px', border: `1px solid ${token.colorBorder}` }}>Characteristic</th>
                <th style={{ padding: '6px 8px', border: `1px solid ${token.colorBorder}` }}>Target Value</th>
                <th style={{ padding: '6px 8px', border: `1px solid ${token.colorBorder}` }}>Tol (+)</th>
                <th style={{ padding: '6px 8px', border: `1px solid ${token.colorBorder}` }}>Tol (-)</th>
                <th style={{ padding: '6px 8px', border: `1px solid ${token.colorBorder}` }}>Unit</th>
              </tr>
            </thead>
            <tbody>
              {characteristics.map((c) => (
                <tr key={c.id}>
                  <td style={{ padding: '6px 8px', border: `1px solid ${token.colorBorder}`, fontWeight: 600 }}>{c.charName}</td>
                  <td style={{ padding: '4px', border: `1px solid ${token.colorBorder}` }}>
                    <InputNumber value={c.nominal} step={0.1} style={{ width: '100%' }} onChange={(v) => handleUpdateChar(c.id, 'nominal', Number(v || 0))} />
                  </td>
                  <td style={{ padding: '4px', border: `1px solid ${token.colorBorder}` }}>
                    <InputNumber value={c.tolPlus} step={0.05} style={{ width: '100%' }} onChange={(v) => handleUpdateChar(c.id, 'tolPlus', Number(v || 0))} />
                  </td>
                  <td style={{ padding: '4px', border: `1px solid ${token.colorBorder}` }}>
                    <InputNumber value={c.tolMinus} step={0.05} style={{ width: '100%' }} onChange={(v) => handleUpdateChar(c.id, 'tolMinus', Number(v || 0))} />
                  </td>
                  <td style={{ padding: '4px', border: `1px solid ${token.colorBorder}` }}>
                    <Input value={c.unit} style={{ width: '100%' }} onChange={(e) => handleUpdateChar(c.id, 'unit', e.target.value)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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

