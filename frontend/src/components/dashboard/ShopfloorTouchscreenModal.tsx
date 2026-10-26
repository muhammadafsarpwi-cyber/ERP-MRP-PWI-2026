import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Modal,
  Spin,
  Button,
  Progress,
  Badge,
  Select,
  Input,
  message,
  Card,
  Row,
  Col,
  Alert,
  Checkbox,
} from 'antd';
import {
  ArrowLeftOutlined,
  CheckCircleOutlined,
  ThunderboltOutlined,
  ToolOutlined,
  SettingOutlined,
  ExperimentOutlined,
  InboxOutlined,
  ExclamationCircleOutlined,
  LockOutlined,
  CloseOutlined,
  ReloadOutlined,
  UserOutlined,
  SafetyCertificateOutlined,
  DashboardOutlined,
} from '@ant-design/icons';
import shopfloorTouchscreenService, {
  TouchscreenSegment,
  TouchscreenContractJob,
  TouchscreenTelemetry,
  TouchscreenOperator,
  TouchscreenMachineOption,
  TouchscreenShiftOption,
  ShiftReportSubmissionResult,
} from '../../services/shopfloorTouchscreenService';

interface ShopfloorTouchscreenModalProps {
  visible: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export const ShopfloorTouchscreenModal: React.FC<ShopfloorTouchscreenModalProps> = ({
  visible,
  onClose,
  onSuccess,
}) => {
  // Wizard Stages:
  // Step 1: Shift & Machine Identification Ledger
  // Step 2: Dynamic Department & Active SOC Selection
  // Step 3: The 3-Metric Material Execution Form
  // Step 4: Transaction Success Confirmation
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);

  // Loading & Network States
  const [loading, setLoading] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false);

  // Telemetry Data (Step 1)
  const [telemetry, setTelemetry] = useState<TouchscreenTelemetry>({
    operators: [],
    machines: [],
    shifts: [],
  });
  const [selectedOperatorId, setSelectedOperatorId] = useState<string>('');
  const [selectedOperatorName, setSelectedOperatorName] = useState<string>('');
  const [selectedMachineId, setSelectedMachineId] = useState<string>('');
  const [selectedShiftId, setSelectedShiftId] = useState<string>('');

  // Department & Job Selection (Step 2)
  const [departments, setDepartments] = useState<TouchscreenSegment[]>([]);
  const [selectedSegment, setSelectedSegment] = useState<TouchscreenSegment | null>(null);
  const [contracts, setContracts] = useState<TouchscreenContractJob[]>([]);
  const [selectedJob, setSelectedJob] = useState<TouchscreenContractJob | null>(null);

  // The 3 Mandatory Operational Metrics (Step 3)
  const [okQuantity, setOkQuantity] = useState<number>(500);
  const [scrapQuantity, setScrapQuantity] = useState<number>(0);
  const [machineDowntimeMinutes, setMachineDowntimeMinutes] = useState<number>(0);

  // Supervisor Override / PIN when Scrap exceeds 5%
  const [supervisorPin, setSupervisorPin] = useState<string>('');
  const [supervisorName, setSupervisorName] = useState<string>('');
  const [supervisorOverride, setSupervisorOverride] = useState<boolean>(false);

  // Result from submission (Step 4)
  const [submissionResult, setSubmissionResult] = useState<ShiftReportSubmissionResult['data'] | null>(null);

  // Calculate Scrap Rate % in real-time
  const totalShiftPieces = okQuantity + scrapQuantity;
  const scrapRate = useMemo(() => {
    if (totalShiftPieces <= 0) return 0;
    return Math.round((scrapQuantity / totalShiftPieces) * 1000) / 10;
  }, [okQuantity, scrapQuantity, totalShiftPieces]);
  const isScrapExceeded = scrapRate > 5.0;

  // Initialize and load telemetry & departments on open
  const loadInitialData = useCallback(async () => {
    try {
      setLoading(true);
      const [telemetryRes, deptsRes] = await Promise.all([
        shopfloorTouchscreenService.getTelemetry(),
        shopfloorTouchscreenService.getDepartments(),
      ]);

      if (telemetryRes && telemetryRes.data) {
        setTelemetry(telemetryRes.data);
        if (telemetryRes.data.operators.length > 0) {
          setSelectedOperatorId(telemetryRes.data.operators[0].id);
          setSelectedOperatorName(telemetryRes.data.operators[0].name);
        }
        if (telemetryRes.data.machines.length > 0) {
          setSelectedMachineId(telemetryRes.data.machines[0].id);
        }
        if (telemetryRes.data.shifts.length > 0) {
          setSelectedShiftId(telemetryRes.data.shifts[0].id);
        }
      }

      if (deptsRes && deptsRes.data) {
        setDepartments(deptsRes.data);
      }
    } catch (err: any) {
      message.error('Notice: Initializing local shop floor cache: ' + (err?.message || 'Network delay'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (visible) {
      setStep(1);
      setSelectedSegment(null);
      setSelectedJob(null);
      setSubmissionResult(null);
      setSupervisorPin('');
      setSupervisorOverride(false);
      setSupervisorName('');
      loadInitialData();
    }
  }, [visible, loadInitialData]);

  // Handle operator change
  const handleOperatorChange = (opId: string) => {
    setSelectedOperatorId(opId);
    const op = telemetry.operators.find((o) => o.id === opId);
    if (op) {
      setSelectedOperatorName(op.name);
    }
  };

  // Step 1 ➔ Step 2: Validate telemetry and proceed
  const handleProceedToDepartments = () => {
    if (!selectedOperatorId) {
      message.warning('Please select an active Shop Floor Operator.');
      return;
    }
    if (!selectedMachineId) {
      message.warning('Please select an active Machine Station.');
      return;
    }
    setStep(2);
  };

  // Step 2: Select Manufacturing Department & Fetch active SOCs
  const handleSelectDepartment = async (segment: TouchscreenSegment) => {
    setSelectedSegment(segment);
    setLoading(true);
    try {
      const res = await shopfloorTouchscreenService.getActiveContracts(segment.key);
      if (res && res.data) {
        setContracts(res.data);
      }
    } catch (err: any) {
      message.error('Failed to load active contracts: ' + (err?.message || 'Server error'));
    } finally {
      setLoading(false);
    }
  };

  // Step 2 ➔ Step 3: Select Contract Row
  const handleSelectJob = (job: TouchscreenContractJob) => {
    setSelectedJob(job);
    const initialOk = Math.min(500, job.remainingQuantity > 0 ? job.remainingQuantity : 500);
    setOkQuantity(initialOk);
    setScrapQuantity(0);
    setMachineDowntimeMinutes(0);
    setSupervisorPin('');
    setSupervisorOverride(false);
    setStep(3);
  };

  // Steppers for OK Qty
  const adjustOk = (delta: number) => {
    setOkQuantity((prev) => Math.max(0, prev + delta));
  };

  // Steppers for Scrap Qty
  const adjustScrap = (delta: number) => {
    setScrapQuantity((prev) => Math.max(0, prev + delta));
  };

  // Steppers for Downtime
  const adjustDowntime = (delta: number) => {
    setMachineDowntimeMinutes((prev) => Math.max(0, prev + delta));
  };

  // Step 3 ➔ Submit Shift Report
  const handleSubmitShiftReport = async () => {
    if (!selectedJob) return;

    if (okQuantity <= 0 && scrapQuantity <= 0) {
      message.warning('Please enter an OK Quantity or Scrap Quantity greater than 0.');
      return;
    }

    // Critical Rule: If Scrap Qty exceeds 5%, require supervisor pin or override flag
    if (isScrapExceeded && !supervisorOverride && (!supervisorPin || supervisorPin.length < 4)) {
      message.error('Scrap exceeds 5.0% threshold. Supervisor authorization PIN or bypass flag is required.');
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        salesOrderId: selectedJob.salesOrderId,
        salesOrderItemId: selectedJob.salesOrderItemId,
        contractNumber: selectedJob.contractNumber,
        routingId: selectedJob.routingId,
        segmentKey: selectedSegment?.key || 'WIRE_STRAIGHTENING',
        departmentId: selectedJob.departmentId,
        itemId: selectedJob.itemId,
        machineId: selectedMachineId,
        shiftId: selectedShiftId,
        operatorId: selectedOperatorId,
        operatorName: selectedOperatorName || 'Shop Floor Operator',
        totalOutputQty: okQuantity,
        scrapQty: scrapQuantity,
        machineDowntimeMinutes,
        supervisorName: supervisorName || (supervisorOverride || supervisorPin ? 'Shift Supervisor' : undefined),
        supervisorPin: supervisorPin || undefined,
        supervisorOverride: supervisorOverride || Boolean(supervisorPin),
      };

      const res = await shopfloorTouchscreenService.submitShiftReport(payload);
      if (res && res.success) {
        setSubmissionResult(res.data);
        setStep(4);
        message.success(`Shift report recorded successfully: ${res.data.entryNumber}`);
        if (onSuccess) {
          onSuccess();
        }
      } else {
        message.error(res?.message || 'Failed to submit shift report');
      }
    } catch (err: any) {
      message.error('Shift report submission failed: ' + (err?.response?.data?.message || err?.message || 'Server error'));
    } finally {
      setSubmitting(false);
    }
  };

  // Segment icon helper
  const renderSegmentIcon = (iconKey: string) => {
    switch (iconKey) {
      case 'tool':
        return <ToolOutlined style={{ fontSize: 34 }} />;
      case 'thunderbolt':
        return <ThunderboltOutlined style={{ fontSize: 34 }} />;
      case 'setting':
        return <SettingOutlined style={{ fontSize: 34 }} />;
      case 'experiment':
        return <ExperimentOutlined style={{ fontSize: 34 }} />;
      case 'inbox':
        return <InboxOutlined style={{ fontSize: 34 }} />;
      default:
        return <ToolOutlined style={{ fontSize: 34 }} />;
    }
  };

  return (
    <Modal
      open={visible}
      onCancel={onClose}
      footer={null}
      width="96vw"
      style={{ top: 20, maxWidth: 1300 }}
      centered
      destroyOnClose
      closeIcon={<CloseOutlined style={{ color: '#94a3b8', fontSize: 20 }} />}
      styles={{
        content: {
          backgroundColor: '#0a0f1d',
          border: '1px solid #1e293b',
          borderRadius: 20,
          padding: 24,
          boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.9)',
          color: '#f8fafc',
          maxHeight: '94vh',
          overflowY: 'auto',
        },
      }}
    >
      {/* ━━━ TOUCHSCREEN HUD HEADER ━━━ */}
      <div style={{ borderBottom: '1px solid #1e293b', paddingBottom: 16, marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: 12,
                background: 'linear-gradient(135deg, #ea580c 0%, #c2410c 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 0 20px rgba(234, 88, 12, 0.45)',
              }}
            >
              <DashboardOutlined style={{ color: '#ffffff', fontSize: 26 }} />
            </div>
            <div>
              <div style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '1.2px', color: '#ea580c', fontWeight: 800 }}>
                Factory Floor Touch Terminal • Zero-Typing Interface
              </div>
              <h2 style={{ margin: 0, fontSize: 24, fontWeight: 900, color: '#f8fafc' }}>
                Daily Shift Entry Wizard
              </h2>
            </div>
          </div>

          {/* Wizard Step Progression Bar */}
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <div
              onClick={() => step > 1 && setStep(1)}
              style={{
                padding: '8px 16px',
                borderRadius: 24,
                fontSize: 13,
                fontWeight: 800,
                backgroundColor: step === 1 ? '#ea580c' : step > 1 ? '#065f46' : '#1e293b',
                color: '#ffffff',
                cursor: step > 1 ? 'pointer' : 'default',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                boxShadow: step === 1 ? '0 0 12px rgba(234, 88, 12, 0.4)' : 'none',
              }}
            >
              {step > 1 ? <CheckCircleOutlined /> : '1'} Shift & Machine
            </div>
            <div style={{ color: '#475569', fontSize: 16 }}>➔</div>
            <div
              onClick={() => step > 2 && setStep(2)}
              style={{
                padding: '8px 16px',
                borderRadius: 24,
                fontSize: 13,
                fontWeight: 800,
                backgroundColor: step === 2 ? '#ea580c' : step > 2 ? '#065f46' : '#1e293b',
                color: step >= 2 ? '#ffffff' : '#64748b',
                cursor: step > 2 ? 'pointer' : 'default',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                boxShadow: step === 2 ? '0 0 12px rgba(234, 88, 12, 0.4)' : 'none',
              }}
            >
              {step > 2 ? <CheckCircleOutlined /> : '2'} Sector & SOC Job
            </div>
            <div style={{ color: '#475569', fontSize: 16 }}>➔</div>
            <div
              style={{
                padding: '8px 16px',
                borderRadius: 24,
                fontSize: 13,
                fontWeight: 800,
                backgroundColor: step === 3 ? '#ea580c' : step === 4 ? '#065f46' : '#1e293b',
                color: step >= 3 ? '#ffffff' : '#64748b',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                boxShadow: step === 3 ? '0 0 12px rgba(234, 88, 12, 0.4)' : 'none',
              }}
            >
              {step === 4 ? <CheckCircleOutlined /> : '3'} Material Metrics
            </div>
          </div>
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '80px 0' }}>
          <Spin size="large" />
          <div style={{ marginTop: 20, color: '#94a3b8', fontSize: 16, fontWeight: 600 }}>
            Loading Factory Floor Telemetry & Department Matrices...
          </div>
        </div>
      ) : (
        <>
          {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
              STEP 1: SHIFT & MACHINE IDENTIFICATION LEDGER (ZERO TYPING)
              ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
          {step === 1 && (
            <div>
              <div style={{ marginBottom: 20 }}>
                <h3 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: '#e2e8f0' }}>
                  Step 1: Shift & Station Identification
                </h3>
                <div style={{ color: '#94a3b8', fontSize: 14, marginTop: 4 }}>
                  Select your operator profile, station machinery, and scheduled shift via rapid touch selectors (Zero Typing Required).
                </div>
              </div>

              <Row gutter={[24, 24]}>
                {/* 1. OPERATOR SELECTION */}
                <Col xs={24} md={8}>
                  <Card
                    style={{
                      backgroundColor: '#131b2e',
                      borderColor: '#1e293b',
                      borderRadius: 16,
                      height: '100%',
                    }}
                    bodyStyle={{ padding: 22 }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                      <div style={{ width: 40, height: 40, borderRadius: 10, backgroundColor: '#0284c7', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <UserOutlined style={{ color: '#ffffff', fontSize: 20 }} />
                      </div>
                      <div>
                        <div style={{ fontSize: 16, fontWeight: 800, color: '#f8fafc' }}>Active Operator</div>
                        <div style={{ fontSize: 12, color: '#94a3b8' }}>System Registry Lookup</div>
                      </div>
                    </div>

                    <div style={{ fontSize: 13, color: '#cbd5e1', marginBottom: 8, fontWeight: 600 }}>
                      Select Registered Operator:
                    </div>
                    <Select
                      value={selectedOperatorId}
                      onChange={handleOperatorChange}
                      style={{ width: '100%', height: 52 }}
                      dropdownStyle={{ backgroundColor: '#1e293b', color: '#ffffff' }}
                      size="large"
                    >
                      {telemetry.operators.map((op) => (
                        <Select.Option key={op.id} value={op.id}>
                          <span style={{ fontWeight: 700, fontSize: 15 }}>{op.name}</span>
                          {op.username && <span style={{ color: '#94a3b8', marginLeft: 8, fontSize: 12 }}>({op.username})</span>}
                        </Select.Option>
                      ))}
                    </Select>

                    <div style={{ marginTop: 14, padding: '10px 14px', backgroundColor: '#0a0f1d', borderRadius: 10, border: '1px solid #1e293b' }}>
                      <div style={{ fontSize: 12, color: '#94a3b8' }}>Verified Session Operator:</div>
                      <div style={{ fontSize: 15, fontWeight: 800, color: '#38bdf8', marginTop: 2 }}>
                        {selectedOperatorName || 'Unassigned'}
                      </div>
                    </div>
                  </Card>
                </Col>

                {/* 2. MACHINE / STATION SELECTION */}
                <Col xs={24} md={8}>
                  <Card
                    style={{
                      backgroundColor: '#131b2e',
                      borderColor: '#1e293b',
                      borderRadius: 16,
                      height: '100%',
                    }}
                    bodyStyle={{ padding: 22 }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                      <div style={{ width: 40, height: 40, borderRadius: 10, backgroundColor: '#ea580c', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <ToolOutlined style={{ color: '#ffffff', fontSize: 20 }} />
                      </div>
                      <div>
                        <div style={{ fontSize: 16, fontWeight: 800, color: '#f8fafc' }}>Machine Station</div>
                        <div style={{ fontSize: 12, color: '#94a3b8' }}>Asset Machinery Fleet</div>
                      </div>
                    </div>

                    <div style={{ fontSize: 13, color: '#cbd5e1', marginBottom: 8, fontWeight: 600 }}>
                      Select Assigned Station Asset:
                    </div>
                    <Select
                      value={selectedMachineId}
                      onChange={(val) => setSelectedMachineId(val)}
                      style={{ width: '100%', height: 52 }}
                      dropdownStyle={{ backgroundColor: '#1e293b', color: '#ffffff' }}
                      size="large"
                    >
                      {telemetry.machines.map((m) => (
                        <Select.Option key={m.id} value={m.id}>
                          <span style={{ fontWeight: 800, color: '#ea580c' }}>{m.machineCode}</span>
                          <span style={{ marginLeft: 8, color: '#e2e8f0' }}>- {m.name}</span>
                        </Select.Option>
                      ))}
                    </Select>

                    <div style={{ marginTop: 14, padding: '10px 14px', backgroundColor: '#0a0f1d', borderRadius: 10, border: '1px solid #1e293b' }}>
                      <div style={{ fontSize: 12, color: '#94a3b8' }}>Fleet Status:</div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: '#34d399', marginTop: 2 }}>
                        ● Active Operational Asset
                      </div>
                    </div>
                  </Card>
                </Col>

                {/* 3. SHIFT SELECTION */}
                <Col xs={24} md={8}>
                  <Card
                    style={{
                      backgroundColor: '#131b2e',
                      borderColor: '#1e293b',
                      borderRadius: 16,
                      height: '100%',
                    }}
                    bodyStyle={{ padding: 22 }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                      <div style={{ width: 40, height: 40, borderRadius: 10, backgroundColor: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <ThunderboltOutlined style={{ color: '#ffffff', fontSize: 20 }} />
                      </div>
                      <div>
                        <div style={{ fontSize: 16, fontWeight: 800, color: '#f8fafc' }}>Active Shift Roster</div>
                        <div style={{ fontSize: 12, color: '#94a3b8' }}>8-Hour Standard Cycle</div>
                      </div>
                    </div>

                    <div style={{ fontSize: 13, color: '#cbd5e1', marginBottom: 8, fontWeight: 600 }}>
                      Select Manufacturing Shift:
                    </div>
                    <Select
                      value={selectedShiftId}
                      onChange={(val) => setSelectedShiftId(val)}
                      style={{ width: '100%', height: 52 }}
                      dropdownStyle={{ backgroundColor: '#1e293b', color: '#ffffff' }}
                      size="large"
                    >
                      {telemetry.shifts.map((s) => (
                        <Select.Option key={s.id} value={s.id}>
                          <span style={{ fontWeight: 800, fontSize: 15 }}>{s.name}</span>
                        </Select.Option>
                      ))}
                    </Select>

                    <div style={{ marginTop: 14, padding: '10px 14px', backgroundColor: '#0a0f1d', borderRadius: 10, border: '1px solid #1e293b' }}>
                      <div style={{ fontSize: 12, color: '#94a3b8' }}>Standard Shift Capacity:</div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: '#fbbf24', marginTop: 2 }}>
                        8.00 Net Hours Basis
                      </div>
                    </div>
                  </Card>
                </Col>
              </Row>

              {/* Big Step 1 Action Button */}
              <div style={{ marginTop: 30, textAlign: 'center' }}>
                <Button
                  type="primary"
                  onClick={handleProceedToDepartments}
                  style={{
                    height: 60,
                    width: '100%',
                    maxWidth: 500,
                    backgroundColor: '#ea580c',
                    borderColor: '#ea580c',
                    borderRadius: 14,
                    fontSize: 18,
                    fontWeight: 900,
                    letterSpacing: '0.5px',
                    boxShadow: '0 8px 24px rgba(234, 88, 12, 0.4)',
                  }}
                >
                  PROCEED TO SECTION SELECTION ➔
                </Button>
              </div>
            </div>
          )}

          {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
              STEP 2: DYNAMIC DEPARTMENT & ACTIVE SOC SELECTION
              ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
          {step === 2 && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <Button
                    icon={<ArrowLeftOutlined />}
                    onClick={() => setStep(1)}
                    style={{
                      height: 44,
                      backgroundColor: '#1e293b',
                      borderColor: '#334155',
                      color: '#f8fafc',
                      fontWeight: 700,
                      borderRadius: 10,
                    }}
                  >
                    Back to Step 1
                  </Button>
                  <div>
                    <h3 style={{ margin: 0, fontSize: 19, fontWeight: 800, color: '#e2e8f0' }}>
                      Step 2: Department Validation & Pending Sales Order Contracts (SOC)
                    </h3>
                    <div style={{ color: '#94a3b8', fontSize: 13, marginTop: 2 }}>
                      Operator: <strong style={{ color: '#38bdf8' }}>{selectedOperatorName}</strong> | Station: <strong style={{ color: '#ea580c' }}>{telemetry.machines.find(m => m.id === selectedMachineId)?.machineCode || 'Station'}</strong>
                    </div>
                  </div>
                </div>

                <Button
                  icon={<ReloadOutlined />}
                  onClick={loadInitialData}
                  style={{ backgroundColor: '#1e293b', borderColor: '#334155', color: '#cbd5e1', height: 40 }}
                >
                  Refresh Routing Data
                </Button>
              </div>

              {/* 5 PRIMARY GRID BLOCKS FOR DEPARTMENT ROUTING VALIDATION */}
              <div style={{ marginBottom: 24 }}>
                <div style={{ fontSize: 13, textTransform: 'uppercase', color: '#94a3b8', fontWeight: 700, marginBottom: 10 }}>
                  Active Manufacturing Routing Segments:
                </div>
                <Row gutter={[14, 14]}>
                  {departments.map((dept) => {
                    const isSelected = selectedSegment?.key === dept.key;
                    return (
                      <Col xs={24} sm={12} md={dept.key === 'spoke_heading' ? 12 : 8} key={dept.key}>
                        <div
                          onClick={() => handleSelectDepartment(dept)}
                          style={{
                            backgroundColor: isSelected ? '#1e293b' : '#131b2e',
                            borderRadius: 14,
                            padding: '18px 16px',
                            border: `2px solid ${isSelected ? dept.color : '#334155'}`,
                            cursor: 'pointer',
                            transition: 'all 0.15s ease',
                            boxShadow: isSelected ? `0 0 20px ${dept.color}33` : 'none',
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <div
                              style={{
                                width: 50,
                                height: 50,
                                borderRadius: 12,
                                background: dept.bgGradient,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: '#ffffff',
                              }}
                            >
                              {renderSegmentIcon(dept.icon)}
                            </div>
                            <Badge
                              count={`${dept.activeContractsCount} Open SOCs`}
                              style={{
                                backgroundColor: dept.activeContractsCount > 0 ? '#065f46' : '#334155',
                                color: dept.activeContractsCount > 0 ? '#34d399' : '#94a3b8',
                                fontWeight: 700,
                              }}
                            />
                          </div>

                          <div style={{ fontSize: 17, fontWeight: 800, color: '#f8fafc', marginTop: 12 }}>
                            {dept.title}
                          </div>
                          <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4, height: 32, overflow: 'hidden' }}>
                            {dept.description}
                          </div>

                          <div style={{ marginTop: 12, textAlign: 'center', padding: '6px', borderRadius: 8, backgroundColor: '#0a0f1d', color: dept.color, fontWeight: 800, fontSize: 12 }}>
                            {isSelected ? '✓ Selected Section' : 'Tap to View Jobs →'}
                          </div>
                        </div>
                      </Col>
                    );
                  })}
                </Row>
              </div>

              {/* HORIZONTAL CONTRACT ROWS FOR SELECTED DEPARTMENT */}
              {selectedSegment && (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <div style={{ fontSize: 15, fontWeight: 800, color: '#f8fafc' }}>
                      Active Unfulfilled Contracts in <span style={{ color: selectedSegment.color }}>{selectedSegment.title}</span> ({contracts.length} Pending)
                    </div>
                  </div>

                  {contracts.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '40px 20px', backgroundColor: '#131b2e', borderRadius: 14, border: '1px dashed #334155' }}>
                      <div style={{ fontSize: 16, fontWeight: 700, color: '#cbd5e1' }}>
                        No pending unfulfilled balances found for {selectedSegment.title}.
                      </div>
                      <div style={{ fontSize: 13, color: '#94a3b8', marginTop: 4 }}>
                        All current sales order contracts in this phase are fully produced. Select another segment above.
                      </div>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxHeight: '42vh', overflowY: 'auto' }}>
                      {contracts.map((job) => (
                        <div
                          key={job.salesOrderItemId}
                          onClick={() => handleSelectJob(job)}
                          style={{
                            backgroundColor: '#131b2e',
                            borderRadius: 14,
                            padding: '16px 20px',
                            border: '2px solid #1e293b',
                            cursor: 'pointer',
                            transition: 'all 0.15s ease',
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.borderColor = '#ea580c';
                            e.currentTarget.style.boxShadow = '0 6px 18px rgba(234, 88, 12, 0.2)';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.borderColor = '#1e293b';
                            e.currentTarget.style.boxShadow = 'none';
                          }}
                        >
                          <Row gutter={[16, 12]} align="middle">
                            {/* Customer & Contract Number */}
                            <Col xs={24} md={7}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <span style={{ backgroundColor: '#ea580c', color: '#fff', padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 800 }}>
                                  {job.contractNumber}
                                </span>
                                <span style={{ color: '#94a3b8', fontSize: 11 }}>Sales Order Contract</span>
                              </div>
                              <div style={{ fontSize: 18, fontWeight: 800, color: '#f8fafc', marginTop: 4 }}>
                                {job.customerName}
                              </div>
                            </Col>

                            {/* Active Target Item Code & Operation */}
                            <Col xs={24} md={8}>
                              <div style={{ fontSize: 13, color: '#38bdf8', fontWeight: 800 }}>
                                {job.itemCode}
                              </div>
                              <div style={{ fontSize: 14, fontWeight: 700, color: '#e2e8f0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {job.itemName}
                              </div>
                              <div style={{ fontSize: 12, color: '#34d399', marginTop: 2 }}>
                                Active Phase: <strong>{job.operationName}</strong>
                              </div>
                            </Col>

                            {/* Visual Progress Bar (Dispatched vs Total Ordered Target) */}
                            <Col xs={24} md={6}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                                <span style={{ color: '#94a3b8' }}>Produced: <strong style={{ color: '#34d399' }}>{job.stageProduced.toLocaleString()}</strong></span>
                                <span style={{ color: '#94a3b8' }}>Target: <strong style={{ color: '#f8fafc' }}>{job.targetQuantity.toLocaleString()}</strong></span>
                              </div>
                              <Progress
                                percent={job.completionPercentage}
                                status="active"
                                strokeColor={{
                                  '0%': '#ea580c',
                                  '100%': '#10b981',
                                }}
                                trailColor="#0a0f1d"
                                strokeWidth={10}
                              />
                              <div style={{ textAlign: 'right', fontSize: 11, color: '#fbbf24', marginTop: 4 }}>
                                Remaining Balance: {job.remainingQuantity.toLocaleString()} units
                              </div>
                            </Col>

                            {/* Action Button */}
                            <Col xs={24} md={3} style={{ textAlign: 'right' }}>
                              <Button
                                type="primary"
                                style={{
                                  height: 48,
                                  backgroundColor: '#ea580c',
                                  borderColor: '#ea580c',
                                  fontWeight: 800,
                                  borderRadius: 10,
                                  width: '100%',
                                }}
                              >
                                SELECT ➔
                              </Button>
                            </Col>
                          </Row>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
              STEP 3: THE 3-METRIC MATERIAL EXECUTION FORM (TACTILE TOUCH)
              ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
          {step === 3 && selectedJob && (
            <div>
              {/* Top Banner: Selected Contract Details */}
              <div
                style={{
                  backgroundColor: '#131b2e',
                  borderRadius: 14,
                  padding: '14px 20px',
                  border: '1px solid #1e293b',
                  marginBottom: 18,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: 12,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <Button
                    icon={<ArrowLeftOutlined />}
                    onClick={() => setStep(2)}
                    style={{
                      height: 42,
                      backgroundColor: '#0a0f1d',
                      borderColor: '#334155',
                      color: '#f8fafc',
                      fontWeight: 700,
                    }}
                  >
                    Change Job
                  </Button>
                  <div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <span style={{ backgroundColor: '#ea580c', color: '#fff', padding: '1px 8px', borderRadius: 4, fontSize: 11, fontWeight: 800 }}>
                        {selectedJob.contractNumber}
                      </span>
                      <span style={{ fontSize: 17, fontWeight: 800, color: '#f8fafc' }}>
                        {selectedJob.customerName}
                      </span>
                    </div>
                    <div style={{ fontSize: 13, color: '#94a3b8', marginTop: 2 }}>
                      Item: <strong style={{ color: '#38bdf8' }}>{selectedJob.itemCode}</strong> - {selectedJob.itemName} | Station: <strong style={{ color: '#ea580c' }}>{telemetry.machines.find(m => m.id === selectedMachineId)?.machineCode}</strong>
                    </div>
                  </div>
                </div>

                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 12, color: '#94a3b8' }}>Target Contract Remaining Balance:</div>
                  <div style={{ fontSize: 20, fontWeight: 900, color: '#fbbf24' }}>
                    {selectedJob.remainingQuantity.toLocaleString()} Units
                  </div>
                </div>
              </div>

              {/* ━━━ REAL-TIME 5% SCRAP THRESHOLD ALERT & SUPERVISOR OVERRIDE ━━━ */}
              {isScrapExceeded && (
                <div style={{ marginBottom: 18 }}>
                  <Alert
                    type="warning"
                    showIcon
                    icon={<ExclamationCircleOutlined style={{ fontSize: 22, color: '#f59e0b' }} />}
                    message={
                      <div style={{ fontSize: 15, fontWeight: 800, color: '#fef3c7' }}>
                        EXCESSIVE SCRAP THRESHOLD WARNING: Material Scrap is {scrapRate}% (Exceeds 5.0% Target Limit)
                      </div>
                    }
                    description={
                      <div style={{ marginTop: 6, color: '#fde68a', fontSize: 13 }}>
                        Quality policy enforces supervisor review when shift scrap exceeds 5.0% of gross pieces. Please enter your Supervisor Authorization PIN or check the override authorization flag.
                        <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginTop: 12, flexWrap: 'wrap' }}>
                          <Input.Password
                            prefix={<LockOutlined />}
                            placeholder="Supervisor PIN (4 digits)"
                            value={supervisorPin}
                            onChange={(e) => setSupervisorPin(e.target.value)}
                            maxLength={6}
                            style={{ width: 220, height: 44, backgroundColor: '#0a0f1d', borderColor: '#d97706', color: '#f8fafc', fontWeight: 700 }}
                          />
                          <Input
                            prefix={<SafetyCertificateOutlined />}
                            placeholder="Supervisor Name"
                            value={supervisorName}
                            onChange={(e) => setSupervisorName(e.target.value)}
                            style={{ width: 220, height: 44, backgroundColor: '#0a0f1d', borderColor: '#d97706', color: '#f8fafc', fontWeight: 700 }}
                          />
                          <Checkbox
                            checked={supervisorOverride}
                            onChange={(e) => setSupervisorOverride(e.target.checked)}
                            style={{ color: '#fef3c7', fontWeight: 700, fontSize: 14 }}
                          >
                            Authorized by Floor Supervisor
                          </Checkbox>
                        </div>
                      </div>
                    }
                    style={{
                      backgroundColor: '#2e1c0c',
                      borderColor: '#d97706',
                      borderRadius: 14,
                      padding: 16,
                      boxShadow: '0 0 20px rgba(217, 119, 6, 0.3)',
                    }}
                  />
                </div>
              )}

              {/* ━━━ THE 3 LOCKED NUMERIC ENTRY FIELDS ━━━ */}
              <Row gutter={[20, 20]}>
                {/* 1. OK QUANTITY (PIECES) */}
                <Col xs={24} lg={8}>
                  <Card
                    style={{
                      backgroundColor: '#131b2e',
                      borderColor: '#10b981',
                      borderRadius: 16,
                      boxShadow: '0 8px 24px rgba(16, 185, 129, 0.15)',
                    }}
                    bodyStyle={{ padding: 20 }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                      <span style={{ color: '#10b981', fontWeight: 800, fontSize: 15, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        1. OK Quantity
                      </span>
                      <span style={{ backgroundColor: '#065f46', color: '#a7f3d0', padding: '3px 10px', borderRadius: 8, fontSize: 11, fontWeight: 800 }}>
                        Accepted Pieces
                      </span>
                    </div>

                    {/* Prominent Number Display */}
                    <div
                      style={{
                        backgroundColor: '#0a0f1d',
                        borderRadius: 14,
                        padding: '16px 12px',
                        textAlign: 'center',
                        border: '2px solid #059669',
                        marginBottom: 16,
                      }}
                    >
                      <span style={{ fontSize: 46, fontWeight: 900, color: '#10b981', letterSpacing: '1px' }}>
                        {okQuantity.toLocaleString()}
                      </span>
                      <div style={{ color: '#6ee7b7', fontSize: 12, fontWeight: 600 }}>Usable Finished Pieces</div>
                    </div>

                    {/* Touch Counter Buttons: Fine Adjustment */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 6, marginBottom: 10 }}>
                      <Button onClick={() => adjustOk(-100)} style={{ height: 48, backgroundColor: '#0a0f1d', borderColor: '#334155', color: '#f8fafc', fontWeight: 700, padding: 0 }}>
                        -100
                      </Button>
                      <Button onClick={() => adjustOk(-10)} style={{ height: 48, backgroundColor: '#0a0f1d', borderColor: '#334155', color: '#f8fafc', fontWeight: 700, padding: 0 }}>
                        -10
                      </Button>
                      <Button onClick={() => adjustOk(-1)} style={{ height: 48, backgroundColor: '#0a0f1d', borderColor: '#334155', color: '#f8fafc', fontWeight: 700, padding: 0 }}>
                        -1
                      </Button>
                      <Button onClick={() => adjustOk(1)} style={{ height: 48, backgroundColor: '#0a0f1d', borderColor: '#334155', color: '#10b981', fontWeight: 800, padding: 0 }}>
                        +1
                      </Button>
                      <Button onClick={() => adjustOk(10)} style={{ height: 48, backgroundColor: '#0a0f1d', borderColor: '#334155', color: '#10b981', fontWeight: 800, padding: 0 }}>
                        +10
                      </Button>
                      <Button onClick={() => adjustOk(100)} style={{ height: 48, backgroundColor: '#0a0f1d', borderColor: '#334155', color: '#10b981', fontWeight: 800, padding: 0 }}>
                        +100
                      </Button>
                    </div>

                    {/* Quick Preset Pills */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
                      <Button onClick={() => setOkQuantity(250)} style={{ height: 40, backgroundColor: '#0a0f1d', borderColor: '#334155', color: '#cbd5e1', fontSize: 13, fontWeight: 700 }}>
                        250 pcs
                      </Button>
                      <Button onClick={() => setOkQuantity(500)} style={{ height: 40, backgroundColor: '#0a0f1d', borderColor: '#334155', color: '#cbd5e1', fontSize: 13, fontWeight: 700 }}>
                        500 pcs
                      </Button>
                      <Button
                        onClick={() => setOkQuantity(selectedJob.remainingQuantity > 0 ? selectedJob.remainingQuantity : 1000)}
                        style={{ height: 40, backgroundColor: '#065f46', borderColor: '#059669', color: '#ffffff', fontSize: 13, fontWeight: 800 }}
                      >
                        Target Max
                      </Button>
                    </div>
                  </Card>
                </Col>

                {/* 2. SCRAP/REJECTED QUANTITY (PIECES) */}
                <Col xs={24} lg={8}>
                  <Card
                    style={{
                      backgroundColor: '#131b2e',
                      borderColor: isScrapExceeded ? '#f59e0b' : '#f43f5e',
                      borderRadius: 16,
                      boxShadow: isScrapExceeded ? '0 8px 24px rgba(245, 158, 11, 0.25)' : '0 8px 24px rgba(244, 63, 94, 0.15)',
                    }}
                    bodyStyle={{ padding: 20 }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                      <span style={{ color: isScrapExceeded ? '#f59e0b' : '#f43f5e', fontWeight: 800, fontSize: 15, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        2. Scrap Quantity
                      </span>
                      <span
                        style={{
                          backgroundColor: isScrapExceeded ? '#78350f' : '#881337',
                          color: isScrapExceeded ? '#fef3c7' : '#fecdd3',
                          padding: '3px 10px',
                          borderRadius: 8,
                          fontSize: 11,
                          fontWeight: 800,
                        }}
                      >
                        {scrapRate}% Loss Rate
                      </span>
                    </div>

                    {/* Prominent Number Display */}
                    <div
                      style={{
                        backgroundColor: '#0a0f1d',
                        borderRadius: 14,
                        padding: '16px 12px',
                        textAlign: 'center',
                        border: `2px solid ${isScrapExceeded ? '#d97706' : '#e11d48'}`,
                        marginBottom: 16,
                      }}
                    >
                      <span style={{ fontSize: 46, fontWeight: 900, color: isScrapExceeded ? '#f59e0b' : '#f43f5e', letterSpacing: '1px' }}>
                        {scrapQuantity.toLocaleString()}
                      </span>
                      <div style={{ color: isScrapExceeded ? '#fde68a' : '#fda4af', fontSize: 12, fontWeight: 600 }}>
                        {isScrapExceeded ? '⚠️ Warning: Exceeds 5.0% Limit' : 'Within 5.0% Quality Standard'}
                      </div>
                    </div>

                    {/* Touch Counter Buttons */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6, marginBottom: 10 }}>
                      <Button onClick={() => adjustScrap(-10)} style={{ height: 48, backgroundColor: '#0a0f1d', borderColor: '#334155', color: '#f8fafc', fontWeight: 700 }}>
                        -10
                      </Button>
                      <Button onClick={() => adjustScrap(-1)} style={{ height: 48, backgroundColor: '#0a0f1d', borderColor: '#334155', color: '#f8fafc', fontWeight: 700 }}>
                        -1
                      </Button>
                      <Button onClick={() => setScrapQuantity(0)} style={{ height: 48, backgroundColor: '#0a0f1d', borderColor: '#334155', color: '#94a3b8', fontWeight: 700 }}>
                        Zero
                      </Button>
                      <Button onClick={() => adjustScrap(1)} style={{ height: 48, backgroundColor: '#0a0f1d', borderColor: '#334155', color: '#f43f5e', fontWeight: 800 }}>
                        +1
                      </Button>
                      <Button onClick={() => adjustScrap(10)} style={{ height: 48, backgroundColor: '#0a0f1d', borderColor: '#334155', color: '#f43f5e', fontWeight: 800 }}>
                        +10
                      </Button>
                    </div>

                    {/* Quick Preset Pills */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
                      <Button onClick={() => setScrapQuantity(5)} style={{ height: 40, backgroundColor: '#0a0f1d', borderColor: '#334155', color: '#cbd5e1', fontSize: 13, fontWeight: 700 }}>
                        5 pcs
                      </Button>
                      <Button onClick={() => setScrapQuantity(15)} style={{ height: 40, backgroundColor: '#0a0f1d', borderColor: '#334155', color: '#cbd5e1', fontSize: 13, fontWeight: 700 }}>
                        15 pcs
                      </Button>
                      <Button onClick={() => setScrapQuantity(25)} style={{ height: 40, backgroundColor: '#881337', borderColor: '#e11d48', color: '#ffffff', fontSize: 13, fontWeight: 800 }}>
                        25 pcs
                      </Button>
                    </div>
                  </Card>
                </Col>

                {/* 3. MACHINE DOWNTIME (MINUTES) */}
                <Col xs={24} lg={8}>
                  <Card
                    style={{
                      backgroundColor: '#131b2e',
                      borderColor: '#f59e0b',
                      borderRadius: 16,
                      boxShadow: '0 8px 24px rgba(245, 158, 11, 0.15)',
                    }}
                    bodyStyle={{ padding: 20 }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                      <span style={{ color: '#f59e0b', fontWeight: 800, fontSize: 15, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        3. Machine Downtime
                      </span>
                      <span style={{ backgroundColor: '#78350f', color: '#fef3c7', padding: '3px 10px', borderRadius: 8, fontSize: 11, fontWeight: 800 }}>
                        Mechanical / Power
                      </span>
                    </div>

                    {/* Prominent Number Display */}
                    <div
                      style={{
                        backgroundColor: '#0a0f1d',
                        borderRadius: 14,
                        padding: '16px 12px',
                        textAlign: 'center',
                        border: '2px solid #d97706',
                        marginBottom: 16,
                      }}
                    >
                      <span style={{ fontSize: 46, fontWeight: 900, color: '#f59e0b', letterSpacing: '1px' }}>
                        {machineDowntimeMinutes}
                      </span>
                      <span style={{ fontSize: 20, color: '#fbbf24', marginLeft: 8, fontWeight: 800 }}>min</span>
                      <div style={{ color: '#fde68a', fontSize: 12, fontWeight: 600 }}>
                        {(machineDowntimeMinutes / 60).toFixed(2)} Lost Production Hours
                      </div>
                    </div>

                    {/* Touch Counter Buttons */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, marginBottom: 10 }}>
                      <Button onClick={() => adjustDowntime(-15)} style={{ height: 48, backgroundColor: '#0a0f1d', borderColor: '#334155', color: '#f8fafc', fontWeight: 700 }}>
                        -15m
                      </Button>
                      <Button onClick={() => setMachineDowntimeMinutes(0)} style={{ height: 48, backgroundColor: '#0a0f1d', borderColor: '#334155', color: '#94a3b8', fontWeight: 700 }}>
                        0m
                      </Button>
                      <Button onClick={() => adjustDowntime(15)} style={{ height: 48, backgroundColor: '#0a0f1d', borderColor: '#334155', color: '#f59e0b', fontWeight: 800 }}>
                        +15m
                      </Button>
                      <Button onClick={() => adjustDowntime(30)} style={{ height: 48, backgroundColor: '#0a0f1d', borderColor: '#334155', color: '#f59e0b', fontWeight: 800 }}>
                        +30m
                      </Button>
                    </div>

                    {/* Quick Preset Pills */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
                      <Button onClick={() => setMachineDowntimeMinutes(15)} style={{ height: 40, backgroundColor: '#0a0f1d', borderColor: '#334155', color: '#cbd5e1', fontSize: 13, fontWeight: 700 }}>
                        15 Min
                      </Button>
                      <Button onClick={() => setMachineDowntimeMinutes(30)} style={{ height: 40, backgroundColor: '#0a0f1d', borderColor: '#334155', color: '#cbd5e1', fontSize: 13, fontWeight: 700 }}>
                        30 Min
                      </Button>
                      <Button onClick={() => setMachineDowntimeMinutes(60)} style={{ height: 40, backgroundColor: '#78350f', borderColor: '#d97706', color: '#ffffff', fontSize: 13, fontWeight: 800 }}>
                        60 Min
                      </Button>
                    </div>
                  </Card>
                </Col>
              </Row>

              {/* Net Running Hours HUD */}
              <div
                style={{
                  marginTop: 20,
                  padding: '14px 20px',
                  backgroundColor: '#131b2e',
                  borderRadius: 14,
                  border: '1px solid #1e293b',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                }}
              >
                <div>
                  <span style={{ color: '#94a3b8', fontSize: 13 }}>Operator: </span>
                  <strong style={{ color: '#38bdf8', fontSize: 14 }}>{selectedOperatorName}</strong>
                  <span style={{ color: '#475569', margin: '0 10px' }}>|</span>
                  <span style={{ color: '#94a3b8', fontSize: 13 }}>Station: </span>
                  <strong style={{ color: '#ea580c', fontSize: 14 }}>{telemetry.machines.find(m => m.id === selectedMachineId)?.machineCode || 'Station'}</strong>
                </div>

                <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 11, color: '#94a3b8' }}>Net Machine Running Time:</div>
                    <div style={{ fontSize: 16, fontWeight: 800, color: '#34d399' }}>
                      {Math.max(0, 8 - Math.round((machineDowntimeMinutes / 60) * 100) / 100).toFixed(2)} hrs / 8.00 hrs
                    </div>
                  </div>
                </div>
              </div>

              {/* ━━━ HIGH-VISIBILITY GREEN SUBMIT ACTION BUTTON ━━━ */}
              <div style={{ marginTop: 24, textAlign: 'center' }}>
                <Button
                  type="primary"
                  loading={submitting}
                  onClick={handleSubmitShiftReport}
                  style={{
                    height: 64,
                    width: '100%',
                    maxWidth: 620,
                    background: 'linear-gradient(135deg, #059669 0%, #10b981 100%)',
                    borderColor: '#10b981',
                    borderRadius: 16,
                    fontSize: 21,
                    fontWeight: 900,
                    letterSpacing: '0.8px',
                    boxShadow: '0 10px 30px rgba(16, 185, 129, 0.45)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 12,
                  }}
                >
                  <ThunderboltOutlined style={{ fontSize: 24 }} />
                  SUBMIT SHIFT REPORT
                </Button>
              </div>
            </div>
          )}

          {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
              STEP 4: SUBMISSION CONFIRMATION & REAL-TIME BALANCING
              ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
          {step === 4 && submissionResult && (
            <div style={{ textAlign: 'center', padding: '40px 20px' }}>
              <div
                style={{
                  width: 86,
                  height: 86,
                  borderRadius: '50%',
                  backgroundColor: '#065f46',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 20px',
                  boxShadow: '0 0 35px rgba(16, 185, 129, 0.55)',
                }}
              >
                <CheckCircleOutlined style={{ fontSize: 48, color: '#34d399' }} />
              </div>

              <div style={{ fontSize: 13, textTransform: 'uppercase', letterSpacing: '1.2px', color: '#34d399', fontWeight: 800 }}>
                Transaction Verified & Ledger Cascaded
              </div>
              <h2 style={{ fontSize: 28, fontWeight: 900, color: '#f8fafc', margin: '8px 0 16px' }}>
                Shift Report Successfully Recorded!
              </h2>

              {/* Transaction Key Card */}
              <div
                style={{
                  maxWidth: 640,
                  margin: '0 auto 26px',
                  backgroundColor: '#131b2e',
                  borderRadius: 16,
                  padding: 24,
                  border: '1px solid #1e293b',
                  textAlign: 'left',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #1e293b', paddingBottom: 14, marginBottom: 16 }}>
                  <span style={{ color: '#94a3b8', fontSize: 14 }}>Production Entry Number:</span>
                  <span style={{ fontSize: 20, fontWeight: 900, color: '#ea580c', fontFamily: 'monospace' }}>
                    {submissionResult.entryNumber}
                  </span>
                </div>

                <Row gutter={[16, 14]}>
                  <Col span={12}>
                    <div style={{ fontSize: 12, color: '#94a3b8' }}>Target Item:</div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: '#e2e8f0' }}>{submissionResult.itemName}</div>
                  </Col>
                  <Col span={12}>
                    <div style={{ fontSize: 12, color: '#94a3b8' }}>Department / Section:</div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: '#e2e8f0' }}>{submissionResult.departmentName}</div>
                  </Col>
                  <Col span={12}>
                    <div style={{ fontSize: 12, color: '#94a3b8' }}>OK Units (Passed):</div>
                    <div style={{ fontSize: 20, fontWeight: 900, color: '#10b981' }}>
                      +{submissionResult.actualQuantity.toLocaleString()} pcs
                    </div>
                  </Col>
                  <Col span={12}>
                    <div style={{ fontSize: 12, color: '#94a3b8' }}>Scrap Units Logged:</div>
                    <div style={{ fontSize: 20, fontWeight: 900, color: '#f43f5e' }}>
                      {submissionResult.scrapQuantity.toLocaleString()} pcs
                    </div>
                  </Col>
                  <Col span={12}>
                    <div style={{ fontSize: 12, color: '#94a3b8' }}>Updated Contract Remaining Balance:</div>
                    <div style={{ fontSize: 20, fontWeight: 900, color: '#fbbf24' }}>
                      {submissionResult.updatedRemainingQty.toLocaleString()} pcs
                    </div>
                  </Col>
                  <Col span={12}>
                    <div style={{ fontSize: 12, color: '#94a3b8' }}>Department Trend Progress:</div>
                    <div style={{ fontSize: 20, fontWeight: 900, color: '#38bdf8' }}>
                      {submissionResult.newCompletionPercentage}% Completed
                    </div>
                  </Col>
                </Row>
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', justifyContent: 'center', gap: 16 }}>
                <Button
                  onClick={() => {
                    setStep(1);
                    setSelectedSegment(null);
                    setSelectedJob(null);
                    loadInitialData();
                  }}
                  style={{
                    height: 52,
                    padding: '0 26px',
                    backgroundColor: '#1e293b',
                    borderColor: '#334155',
                    color: '#f8fafc',
                    fontWeight: 800,
                    borderRadius: 12,
                    fontSize: 15,
                  }}
                >
                  Record Another Shift Entry
                </Button>
                <Button
                  type="primary"
                  onClick={onClose}
                  style={{
                    height: 52,
                    padding: '0 32px',
                    backgroundColor: '#ea580c',
                    borderColor: '#ea580c',
                    fontWeight: 900,
                    borderRadius: 12,
                    fontSize: 15,
                  }}
                >
                  Return to Dashboard
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </Modal>
  );
};

export default ShopfloorTouchscreenModal;
