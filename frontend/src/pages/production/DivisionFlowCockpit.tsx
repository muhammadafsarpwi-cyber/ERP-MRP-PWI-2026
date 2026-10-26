import React, { useState, useEffect } from 'react';
import {
  Card, Row, Col, Typography, Tag, Button, Space, Modal, Table, Input, InputNumber,
  Select, Popconfirm, message, Tooltip, theme,
} from 'antd';
import {
  ApartmentOutlined, PlusOutlined, EditOutlined, ArrowUpOutlined, ArrowDownOutlined,
  DeleteOutlined, UndoOutlined, CheckCircleFilled, FilterOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';

const { Text, Title } = Typography;

export interface FlowStep {
  id: string;
  sequenceNo: number;
  departmentCode: string;
  departmentName: string;
  operationName: string;
  primaryUom: string;
  secondaryUom?: string;
  standardSetupMinutes?: number;
  standardRunMinutes?: number;
}

export interface DivisionFlow {
  id: string;
  divisionCode: string;
  divisionName: string;
  routeCodeHint: string;
  accentColor: string;
  badgeBg: string;
  description: string;
  steps: FlowStep[];
}

export const DEFAULT_DIVISION_FLOWS: DivisionFlow[] = [
  {
    id: 'd1000000-0000-0000-0000-000000000001',
    divisionCode: 'DIV-SPD',
    divisionName: 'Spoke Division',
    routeCodeHint: 'Route SPI - Spoke',
    accentColor: '#38bdf8',
    badgeBg: 'rgba(56, 189, 248, 0.12)',
    description: 'Motorcycle & bicycle spoke sequential fabrication lifecycle',
    steps: [
      { id: 's1', sequenceNo: 10, departmentCode: 'SPD-DEPT001', departmentName: 'Straightener', operationName: 'Wire Straightening & Cutting', primaryUom: 'GRS', secondaryUom: 'PCS', standardSetupMinutes: 15, standardRunMinutes: 1 },
      { id: 's2', sequenceNo: 20, departmentCode: 'SPD-DEPT002', departmentName: 'Swagging', operationName: 'Spoke Butting & Swaging', primaryUom: 'GRS', secondaryUom: 'PCS', standardSetupMinutes: 20, standardRunMinutes: 2 },
      { id: 's3', sequenceNo: 30, departmentCode: 'SPD-DEPT003', departmentName: 'Spoke', operationName: 'Spoke Heading & Threading', primaryUom: 'GRS', secondaryUom: 'PCS', standardSetupMinutes: 15, standardRunMinutes: 1.5 },
      { id: 's4', sequenceNo: 40, departmentCode: 'SPD-DEPT004', departmentName: 'Header / Nipple', operationName: 'Nipple Forming & Threading', primaryUom: 'PCS', secondaryUom: 'GRS', standardSetupMinutes: 15, standardRunMinutes: 1 },
      { id: 's5', sequenceNo: 50, departmentCode: 'SPD-DEPT006', departmentName: 'Spoke Plating', operationName: 'Electroplating & Surface Finish', primaryUom: 'KG', secondaryUom: 'NONE', standardSetupMinutes: 30, standardRunMinutes: 3 },
      { id: 's6', sequenceNo: 60, departmentCode: 'SPD-DEPT008', departmentName: 'Spoke Packing', operationName: 'Final Verification & Box Packing', primaryUom: 'GRS', secondaryUom: 'PCS', standardSetupMinutes: 10, standardRunMinutes: 1 },
    ],
  },
  {
    id: 'd1000000-0000-0000-0000-000000000002',
    divisionCode: 'DIV-CCD',
    divisionName: 'Control Cable Division',
    routeCodeHint: 'Route CCD - Control Cable',
    accentColor: '#10b981',
    badgeBg: 'rgba(16, 185, 129, 0.12)',
    description: 'Precision outer spiral, PVC extrusion & inner cable assembly lifecycle',
    steps: [
      { id: 'c1', sequenceNo: 10, departmentCode: 'CCD-DEPT001', departmentName: 'Flattening', operationName: 'Spring Flat Wire Rolling', primaryUom: 'KG', secondaryUom: 'METER', standardSetupMinutes: 20, standardRunMinutes: 1.5 },
      { id: 'c2', sequenceNo: 20, departmentCode: 'CCD-DEPT002', departmentName: 'Spiral', operationName: 'Conduit Outer Spiral Winding', primaryUom: 'METER', secondaryUom: 'KG', standardSetupMinutes: 25, standardRunMinutes: 2 },
      { id: 'c3', sequenceNo: 30, departmentCode: 'CCD-DEPT003', departmentName: 'PVC', operationName: 'Outer PVC Jacket Extrusion', primaryUom: 'METER', secondaryUom: 'KG', standardSetupMinutes: 30, standardRunMinutes: 2 },
      { id: 'c4', sequenceNo: 40, departmentCode: 'CCD-DEPT005', departmentName: 'Cutting & Assembly', operationName: 'Inner Core Insertion & End Nipple Crimping', primaryUom: 'PCS', secondaryUom: 'NONE', standardSetupMinutes: 15, standardRunMinutes: 1 },
      { id: 'c5', sequenceNo: 50, departmentCode: 'CCD-DEPT004', departmentName: 'Packing', operationName: 'Tensile Load Inspection & Final Packaging', primaryUom: 'PCS', secondaryUom: 'NONE', standardSetupMinutes: 10, standardRunMinutes: 1 },
    ],
  },
  {
    id: '83ecd746-1cc9-4849-bec4-d00bcc3ceeec',
    divisionCode: 'DIV-PWI',
    divisionName: 'Main Division E-51 (Wire Drawing)',
    routeCodeHint: 'PWI Core Wire',
    accentColor: '#f59e0b',
    badgeBg: 'rgba(245, 158, 11, 0.12)',
    description: 'High-tensile wire rod breakdown, annealing & continuous drawing lifecycle',
    steps: [
      { id: 'p1', sequenceNo: 10, departmentCode: 'PWI-WD-001', departmentName: 'Rod Breakdown & Descaling', operationName: 'Raw Wire Rod Sizing & Mechanical Descaling', primaryUom: 'KG', secondaryUom: 'NONE', standardSetupMinutes: 30, standardRunMinutes: 2 },
      { id: 'p2', sequenceNo: 20, departmentCode: 'PWI-WD-002', departmentName: 'Intermediate Drawing', operationName: 'Multi-Die Progressive Cold Drawing', primaryUom: 'KG', secondaryUom: 'METER', standardSetupMinutes: 25, standardRunMinutes: 2 },
      { id: 'p3', sequenceNo: 30, departmentCode: 'PWI-WD-003', departmentName: 'Annealing & Heat Treatment', operationName: 'Controlled Atmosphere Heat Treatment', primaryUom: 'KG', secondaryUom: 'NONE', standardSetupMinutes: 40, standardRunMinutes: 3 },
      { id: 'p4', sequenceNo: 40, departmentCode: 'PWI-WD-004', departmentName: 'Surface Treatment', operationName: 'Chemical Pickling & Phosphate Pre-Coat', primaryUom: 'KG', secondaryUom: 'NONE', standardSetupMinutes: 30, standardRunMinutes: 2 },
      { id: 'p5', sequenceNo: 50, departmentCode: 'PWI-WD-005', departmentName: 'Coiling & Spooling', operationName: 'High-Speed Precision Re-Winding & Spooling', primaryUom: 'KG', secondaryUom: 'METER', standardSetupMinutes: 15, standardRunMinutes: 1.5 },
      { id: 'p6', sequenceNo: 60, departmentCode: 'PWI-WD-006', departmentName: 'Final Inspection & Stores', operationName: 'Tensile & Micro-Crack Quality Certification', primaryUom: 'KG', secondaryUom: 'NONE', standardSetupMinutes: 10, standardRunMinutes: 1 },
    ],
  },
  {
    id: '0653339b-94d0-4cc5-b880-e07908b2015f',
    divisionCode: 'DIV-NB',
    divisionName: 'NB Division (Auto Parts & Nipple)',
    routeCodeHint: 'Route NIPPLE - Auto Parts',
    accentColor: '#a855f7',
    badgeBg: 'rgba(168, 85, 247, 0.12)',
    description: 'Cold forging, core tapping, thread rolling & specialized finishing lifecycle',
    steps: [
      { id: 'n1', sequenceNo: 10, departmentCode: 'NB-PRT-001', departmentName: 'Cold Forging & Cutting', operationName: 'Raw Rod Cold Heading & Blank Sizing', primaryUom: 'PCS', secondaryUom: 'KG', standardSetupMinutes: 20, standardRunMinutes: 1 },
      { id: 'n2', sequenceNo: 20, departmentCode: 'NB-PRT-002', departmentName: 'Drilling & Tapping', operationName: 'Automated Center Drilling & Core Tapping', primaryUom: 'PCS', secondaryUom: 'NONE', standardSetupMinutes: 25, standardRunMinutes: 1.5 },
      { id: 'n3', sequenceNo: 30, departmentCode: 'NB-PRT-003', departmentName: 'Threading & Slotting', operationName: 'High-Speed Roll Threading & Head Slotting', primaryUom: 'PCS', secondaryUom: 'NONE', standardSetupMinutes: 20, standardRunMinutes: 1 },
      { id: 'n4', sequenceNo: 40, departmentCode: 'NB-PRT-004', departmentName: 'Surface Plating', operationName: 'Bright Nickel Anti-Corrosion Plating', primaryUom: 'KG', secondaryUom: 'PCS', standardSetupMinutes: 30, standardRunMinutes: 2 },
      { id: 'n5', sequenceNo: 50, departmentCode: 'NB-PRT-005', departmentName: 'Sorting & Packing', operationName: 'Optical Camera Sorting & Count Packaging', primaryUom: 'PCS', secondaryUom: 'GRS', standardSetupMinutes: 10, standardRunMinutes: 1 },
    ],
  },
];

const STORAGE_KEY = 'pwi_division_dept_flows_v2';

export const loadStoredDivisionFlows = (): DivisionFlow[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {}
  return DEFAULT_DIVISION_FLOWS;
};

export const saveStoredDivisionFlows = (flows: DivisionFlow[]) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(flows));
  } catch {}
};

interface DivisionFlowCockpitProps {
  onSelectDivisionFilter?: (divisionCode: string) => void;
  activeDivisionFilter?: string;
  onApplyFlowToNewRouting?: (flow: DivisionFlow) => void;
  routingCountsByDivision?: Record<string, number>;
}

export const DivisionFlowCockpit: React.FC<DivisionFlowCockpitProps> = ({
  onSelectDivisionFilter,
  activeDivisionFilter,
  onApplyFlowToNewRouting,
  routingCountsByDivision = {},
}) => {
  const { token } = theme.useToken();
  const [flows, setFlows] = useState<DivisionFlow[]>(loadStoredDivisionFlows);
  const [editingDivision, setEditingDivision] = useState<DivisionFlow | null>(null);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editableSteps, setEditableSteps] = useState<FlowStep[]>([]);

  useEffect(() => {
    saveStoredDivisionFlows(flows);
  }, [flows]);

  const handleOpenEdit = (div: DivisionFlow) => {
    setEditingDivision(div);
    setEditableSteps(JSON.parse(JSON.stringify(div.steps)));
    setEditModalVisible(true);
  };

  const handleSaveEditedSteps = () => {
    if (!editingDivision) return;
    const renumbered = editableSteps.map((s, idx) => ({
      ...s,
      sequenceNo: (idx + 1) * 10,
    }));
    setFlows((prev) =>
      prev.map((d) => (d.id === editingDivision.id ? { ...d, steps: renumbered } : d))
    );
    message.success(`Updated department sequence flow for ${editingDivision.divisionName}`);
    setEditModalVisible(false);
    setEditingDivision(null);
  };

  const handleResetToFactory = () => {
    if (!editingDivision) return;
    const defaultDiv = DEFAULT_DIVISION_FLOWS.find((d) => d.id === editingDivision.id);
    if (defaultDiv) {
      setEditableSteps(JSON.parse(JSON.stringify(defaultDiv.steps)));
      message.info('Restored default factory sequence flow');
    }
  };

  const handleMoveStep = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= editableSteps.length) return;
    const list = [...editableSteps];
    const temp = list[index];
    list[index] = list[target];
    list[target] = temp;
    setEditableSteps(list);
  };

  const handleDeleteStep = (index: number) => {
    if (editableSteps.length <= 1) {
      message.warning('At least one department step is required in the flow');
      return;
    }
    setEditableSteps(editableSteps.filter((_, idx) => idx !== index));
  };

  const handleAddStep = () => {
    const nextSeq = (editableSteps.length + 1) * 10;
    const newStep: FlowStep = {
      id: `custom_${Date.now()}`,
      sequenceNo: nextSeq,
      departmentCode: `DEPT-${editableSteps.length + 1}`,
      departmentName: `Stage ${editableSteps.length + 1}`,
      operationName: `Custom Production Operation`,
      primaryUom: 'PCS',
      secondaryUom: 'NONE',
      standardSetupMinutes: 15,
      standardRunMinutes: 1,
    };
    setEditableSteps([...editableSteps, newStep]);
  };

  const columns: ColumnsType<FlowStep> = [
    {
      title: '#',
      dataIndex: 'sequenceNo',
      key: 'seq',
      width: 60,
      render: (_, __, idx) => <Tag color="blue" style={{ fontWeight: 600 }}>{(idx + 1) * 10}</Tag>,
    },
    {
      title: 'Department Name',
      key: 'departmentName',
      width: 220,
      render: (_, r, idx) => (
        <Input
          value={r.departmentName}
          onChange={(e) => {
            const val = e.target.value;
            setEditableSteps((prev) =>
              prev.map((s, i) => (i === idx ? { ...s, departmentName: val } : s))
            );
          }}
          placeholder="e.g. Straightener"
        />
      ),
    },
    {
      title: 'Dept Code',
      key: 'departmentCode',
      width: 140,
      render: (_, r, idx) => (
        <Input
          value={r.departmentCode}
          onChange={(e) => {
            const val = e.target.value;
            setEditableSteps((prev) =>
              prev.map((s, i) => (i === idx ? { ...s, departmentCode: val } : s))
            );
          }}
          placeholder="e.g. SPD-DEPT001"
        />
      ),
    },
    {
      title: 'Standard Operation Name',
      key: 'operationName',
      width: 240,
      render: (_, r, idx) => (
        <Input
          value={r.operationName}
          onChange={(e) => {
            const val = e.target.value;
            setEditableSteps((prev) =>
              prev.map((s, i) => (i === idx ? { ...s, operationName: val } : s))
            );
          }}
          placeholder="Standard operation description"
        />
      ),
    },
    {
      title: 'Primary UOM',
      key: 'primaryUom',
      width: 110,
      render: (_, r, idx) => (
        <Select
          value={r.primaryUom}
          style={{ width: '100%' }}
          onChange={(val) => {
            setEditableSteps((prev) =>
              prev.map((s, i) => (i === idx ? { ...s, primaryUom: val } : s))
            );
          }}
          options={[
            { label: 'GRS', value: 'GRS' },
            { label: 'PCS', value: 'PCS' },
            { label: 'KG', value: 'KG' },
            { label: 'METER', value: 'METER' },
          ]}
        />
      ),
    },
    {
      title: 'Setup (min)',
      key: 'setupTime',
      width: 95,
      render: (_, r, idx) => (
        <InputNumber
          min={0}
          value={r.standardSetupMinutes || 0}
          style={{ width: '100%' }}
          onChange={(val) => {
            setEditableSteps((prev) =>
              prev.map((s, i) => (i === idx ? { ...s, standardSetupMinutes: val || 0 } : s))
            );
          }}
        />
      ),
    },
    {
      title: 'Reorder / Actions',
      key: 'actions',
      width: 150,
      render: (_, __, idx) => (
        <Space size="small">
          <Tooltip title="Move Up">
            <Button
              size="small"
              icon={<ArrowUpOutlined />}
              disabled={idx === 0}
              onClick={() => handleMoveStep(idx, -1)}
            />
          </Tooltip>
          <Tooltip title="Move Down">
            <Button
              size="small"
              icon={<ArrowDownOutlined />}
              disabled={idx === editableSteps.length - 1}
              onClick={() => handleMoveStep(idx, 1)}
            />
          </Tooltip>
          <Tooltip title="Delete Step">
            <Button
              size="small"
              danger
              icon={<DeleteOutlined />}
              onClick={() => handleDeleteStep(idx)}
            />
          </Tooltip>
        </Space>
      ),
    },
  ];

  return (
    <div style={{ marginBottom: 16, width: '100%' }}>
      {/* Top Banner & Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: token.colorFillAlter,
          padding: '12px 16px',
          borderRadius: '8px 8px 0 0',
          border: `1px solid ${token.colorBorderSecondary}`,
          borderBottom: 'none',
        }}
      >
        <Space size="middle">
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 8,
              background: 'rgba(56, 189, 248, 0.15)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '1px solid rgba(56, 189, 248, 0.3)',
            }}
          >
            <ApartmentOutlined style={{ fontSize: 20, color: '#38bdf8' }} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Title level={5} style={{ margin: 0, fontWeight: 700 }}>
                Department Process Flow Master Cockpit (4 Production Divisions)
              </Title>
              <Tag color="cyan" style={{ fontSize: 11, fontWeight: 600 }}>
                AUTO-SEQUENCING ENGINE
              </Tag>
            </div>
            <Text type="secondary" style={{ fontSize: 12 }}>
              Authoritative sequential department stages for each manufacturing division. Used to instantly auto-populate multi-operation routing lifecycle without repetitive manual configuration.
            </Text>
          </div>
        </Space>
        {activeDivisionFilter && (
          <Button
            size="small"
            icon={<FilterOutlined />}
            onClick={() => onSelectDivisionFilter && onSelectDivisionFilter('')}
          >
            Clear Division Filter
          </Button>
        )}
      </div>

      {/* 4 Division Flow Cards Grid */}
      <div
        style={{
          background: token.colorBgContainer,
          padding: 12,
          borderRadius: '0 0 8px 8px',
          border: `1px solid ${token.colorBorderSecondary}`,
        }}
      >
        <Row gutter={[12, 12]}>
          {flows.map((div) => {
            const isFilterActive = activeDivisionFilter === div.divisionCode;
            const rtgCount = routingCountsByDivision[div.divisionCode] ?? 0;

            return (
              <Col xs={24} lg={12} key={div.id}>
                <Card
                  size="small"
                  style={{
                    height: '100%',
                    background: isFilterActive ? token.colorFillAlter : token.colorBgElevated,
                    borderColor: isFilterActive ? div.accentColor : token.colorBorderSecondary,
                    boxShadow: isFilterActive ? `0 0 12px ${div.accentColor}33` : undefined,
                    transition: 'all 0.2s ease',
                  }}
                  bodyStyle={{ padding: '12px 14px' }}
                >
                  {/* Card Header */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginBottom: 8,
                      borderBottom: `1px solid ${token.colorBorderSecondary}`,
                      paddingBottom: 8,
                    }}
                  >
                    <Space size="small">
                      <span
                        style={{
                          width: 10,
                          height: 10,
                          borderRadius: '50%',
                          background: div.accentColor,
                          display: 'inline-block',
                          boxShadow: `0 0 6px ${div.accentColor}`,
                        }}
                      />
                      <Text style={{ fontWeight: 700, fontSize: 14 }}>
                        {div.divisionName}
                      </Text>
                      <Tag
                        style={{
                          color: div.accentColor,
                          background: div.badgeBg,
                          borderColor: `${div.accentColor}55`,
                          fontSize: 11,
                          fontWeight: 600,
                        }}
                      >
                        {div.divisionCode}
                      </Tag>
                    </Space>

                    <Space size={6}>
                      <Tooltip title="Filter table to this division">
                        <Button
                          size="small"
                          type={isFilterActive ? 'primary' : 'default'}
                          onClick={() => onSelectDivisionFilter && onSelectDivisionFilter(isFilterActive ? '' : div.divisionCode)}
                          style={{
                            fontSize: 11,
                            borderColor: isFilterActive ? div.accentColor : token.colorBorderSecondary,
                            fontWeight: 600,
                          }}
                        >
                          {rtgCount > 0 ? `${rtgCount} Routings` : 'Filter'}
                        </Button>
                      </Tooltip>
                      <Tooltip title="Customize department sequence">
                        <Button
                          size="small"
                          icon={<EditOutlined />}
                          onClick={() => handleOpenEdit(div)}
                          style={{ fontSize: 11 }}
                        >
                          Edit Flow
                        </Button>
                      </Tooltip>
                    </Space>
                  </div>

                  {/* Horizontal Stepper Badges */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      flexWrap: 'wrap',
                      gap: 6,
                      minHeight: 44,
                      padding: '4px 0',
                    }}
                  >
                    {div.steps.map((step, idx) => (
                      <React.Fragment key={step.id}>
                        <div
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            background: token.colorFillAlter,
                            borderRadius: 6,
                            border: `1px solid ${token.colorBorderSecondary}`,
                            padding: '3px 8px',
                            gap: 6,
                          }}
                        >
                          <span
                            style={{
                              background: div.accentColor,
                              color: '#ffffff',
                              fontWeight: 800,
                              fontSize: 10,
                              borderRadius: 4,
                              padding: '1px 5px',
                              lineHeight: '14px',
                            }}
                          >
                            {idx + 1}
                          </span>
                          <span style={{ color: token.colorText, fontSize: 12, fontWeight: 600 }}>
                            {step.departmentName}
                          </span>
                          <span
                            style={{
                              color: token.colorTextSecondary,
                              fontSize: 10,
                              background: token.colorBgContainer,
                              padding: '1px 4px',
                              borderRadius: 3,
                              border: `1px solid ${token.colorBorderSecondary}`,
                            }}
                          >
                            {step.primaryUom}
                          </span>
                        </div>
                        {idx < div.steps.length - 1 && (
                          <span style={{ color: div.accentColor, fontSize: 11, fontWeight: 800 }}>➔</span>
                        )}
                      </React.Fragment>
                    ))}
                  </div>

                  {/* Card Footer Quick Generator Button */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginTop: 8,
                      paddingTop: 6,
                      borderTop: `1px dashed ${token.colorBorderSecondary}`,
                    }}
                  >
                    <Text type="secondary" style={{ fontSize: 11 }}>
                      {div.steps.length} sequential stages • {div.steps.map(s => s.departmentName).slice(0, 3).join(', ')}...
                    </Text>
                    {onApplyFlowToNewRouting && (
                      <Button
                        type="link"
                        size="small"
                        icon={<PlusOutlined />}
                        onClick={() => onApplyFlowToNewRouting(div)}
                        style={{ color: div.accentColor, padding: 0, fontSize: 12, fontWeight: 600 }}
                      >
                        Create Routing with this Flow
                      </Button>
                    )}
                  </div>
                </Card>
              </Col>
            );
          })}
        </Row>
      </div>

      {/* Edit Division Flow Modal */}
      <Modal
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <ApartmentOutlined style={{ color: editingDivision?.accentColor || '#38bdf8' }} />
            <span>Customize Department Flow — {editingDivision?.divisionName} ({editingDivision?.divisionCode})</span>
          </div>
        }
        open={editModalVisible}
        onCancel={() => { setEditModalVisible(false); setEditingDivision(null); }}
        width={960}
        destroyOnHidden
        footer={[
          <Popconfirm
            key="reset"
            title="Restore Factory Default Sequence?"
            description="This will reset all steps back to standard factory presets."
            onConfirm={handleResetToFactory}
            okText="Restore Default"
          >
            <Button icon={<UndoOutlined />}>Restore Factory Default</Button>
          </Popconfirm>,
          <Button key="cancel" onClick={() => { setEditModalVisible(false); setEditingDivision(null); }}>
            Cancel
          </Button>,
          <Button
            key="save"
            type="primary"
            icon={<CheckCircleFilled />}
            onClick={handleSaveEditedSteps}
            style={{ fontWeight: 600 }}
          >
            Save & Update Flow
          </Button>,
        ]}
      >
        <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text type="secondary">
            Define the exact chronological sequence of departmental stages for this division. Reorder with the arrows or add specialized steps.
          </Text>
          <Button size="small" type="dashed" icon={<PlusOutlined />} onClick={handleAddStep}>
            Add Department Stage
          </Button>
        </div>
        <Table
          dataSource={editableSteps}
          columns={columns}
          rowKey={(r, idx) => r.id || String(idx)}
          pagination={false}
          size="small"
          scroll={{ x: 800 }}
        />
      </Modal>
    </div>
  );
};

export default DivisionFlowCockpit;
