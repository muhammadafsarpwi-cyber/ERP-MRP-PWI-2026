import React, { useState, useEffect } from 'react';
import {
  Card, Row, Col, Typography, InputNumber, Button, Space, Tag, Input,
  Table, message, Alert, Tooltip, Divider,
} from 'antd';
import {
  AimOutlined, SaveOutlined, ReloadOutlined, SendOutlined,
  CheckCircleFilled, ThunderboltOutlined, ClockCircleOutlined,
  AppstoreOutlined, ArrowRightOutlined,
} from '@ant-design/icons';
import {
  PackingShiftTargetConfig,
  getSavedPackingTargetConfig,
  savePackingTargetConfig,
  PACKING_TARGET_EVENT,
  PCS_PER_GROSS,
  GROSS_PER_CARTON,
  PCS_PER_CARTON,
} from './packingTargetConfig';
import { formatNumber } from '../../../utils/numberFormat';

const { Title, Text } = Typography;

interface PackingShiftTargetSetupProps {
  onNavigateTab?: (tabKey: string) => void;
}

export const PackingShiftTargetSetup: React.FC<PackingShiftTargetSetupProps> = ({ onNavigateTab }) => {
  const [targetConfig, setTargetConfig] = useState<PackingShiftTargetConfig>(() => getSavedPackingTargetConfig());
  const [cartonsInput, setCartonsInput] = useState<number>(() => getSavedPackingTargetConfig().baseCartons);
  const [shiftHoursInput, setShiftHoursInput] = useState<number>(() => getSavedPackingTargetConfig().shiftHours || 8);
  const [shiftNameInput, setShiftNameInput] = useState<string>(() => getSavedPackingTargetConfig().shiftName || 'General (8:30 AM - 5:30 PM)');
  const [notesInput, setNotesInput] = useState<string>(() => getSavedPackingTargetConfig().notes || 'Standard 8-Hour Packing Line Target');
  const [savedSuccess, setSavedSuccess] = useState<boolean>(false);

  // Sync state if another tab or component updates target config
  useEffect(() => {
    const handleTargetUpdate = (e: any) => {
      const cfg = e.detail;
      if (cfg && typeof cfg.baseCartons === 'number') {
        setTargetConfig(cfg);
        setCartonsInput(cfg.baseCartons);
        setShiftHoursInput(cfg.shiftHours || 8);
        setShiftNameInput(cfg.shiftName || 'General (8:30 AM - 5:30 PM)');
        setNotesInput(cfg.notes || '');
      }
    };
    window.addEventListener(PACKING_TARGET_EVENT, handleTargetUpdate);
    return () => window.removeEventListener(PACKING_TARGET_EVENT, handleTargetUpdate);
  }, []);

  // Live conversions based on the current cartons input
  const currentCartons = Number(cartonsInput) > 0 ? Number(cartonsInput) : 100;
  const currentGross = currentCartons * GROSS_PER_CARTON; // 10 GRS / CTN
  const currentPcs = currentGross * PCS_PER_GROSS; // 144 PCS / GRS -> 144,000 PCS for 100 CTN
  const currentHours = Number(shiftHoursInput) > 0 ? Number(shiftHoursInput) : 8;

  // Hourly Productivity Rate
  const cartonsPerHour = Math.round((currentCartons / currentHours) * 10) / 10;
  const grossPerHour = Math.round((currentGross / currentHours) * 10) / 10;
  const pcsPerHour = Math.round(currentPcs / currentHours);

  // Line Cycle Pace (for standard 8-worker chain)
  const pcsPerWorkerHour = Math.round(pcsPerHour / 8);
  const minutesPerCarton = Math.round(((currentHours * 60) / currentCartons) * 10) / 10;

  // Approximate Raw Material BOM Requirements for this Target
  const spokeGross = Math.round(currentCartons * 5 * 10) / 10; // 5 GRS / CTN each for Inner & Outer
  const spokePcs = spokeGross * PCS_PER_GROSS;
  const spokeInnerKg = Math.round(spokePcs * 0.0105 * 10) / 10;
  const spokeOuterKg = Math.round(spokePcs * 0.0105 * 10) / 10;
  const nippleGross = Math.round(currentCartons * 10 * 10) / 10; // 10 GRS / CTN
  const nipplePcs = nippleGross * PCS_PER_GROSS;
  const nippleKg = Math.round(nipplePcs * 0.0035 * 10) / 10;
  const totalTargetWeightKg = Math.round((spokeInnerKg + spokeOuterKg + nippleKg) * 10) / 10;

  // Handle Save
  const handleSaveTarget = () => {
    const updated: PackingShiftTargetConfig = {
      baseCartons: currentCartons,
      shiftHours: currentHours,
      shiftName: shiftNameInput.trim() || 'General (8:30 AM - 5:30 PM)',
      notes: notesInput.trim() || 'Authoritative Packing Line Shift Target',
      updatedAt: new Date().toISOString(),
      updatedBy: 'Operator',
    };
    savePackingTargetConfig(updated);
    setTargetConfig(updated);
    setSavedSuccess(true);
    message.success(`Packing Target updated to ${currentCartons} Cartons (${formatNumber(currentGross, 0)} Gross / ${formatNumber(currentPcs, 0)} PCS). This will remain in effect until changed.`);
    setTimeout(() => setSavedSuccess(false), 5000);
  };

  // Preset selector
  const applyPreset = (ctn: number) => {
    setCartonsInput(ctn);
  };

  // Reset to default 100 Cartons
  const handleResetToStandard = () => {
    setCartonsInput(100);
    setShiftHoursInput(8);
    setShiftNameInput('General (8:30 AM - 5:30 PM)');
    setNotesInput('Standard 8-Hour Packing Line Authoritative Shift Target');
    const standard: PackingShiftTargetConfig = {
      baseCartons: 100,
      shiftHours: 8,
      shiftName: 'General (8:30 AM - 5:30 PM)',
      notes: 'Standard 8-Hour Packing Line Authoritative Shift Target',
      updatedAt: new Date().toISOString(),
      updatedBy: 'System Standard',
    };
    savePackingTargetConfig(standard);
    setTargetConfig(standard);
    setSavedSuccess(true);
    message.info('Reset to Standard: 100 Cartons (1,000 Gross / 144,000 PCS)');
    setTimeout(() => setSavedSuccess(false), 4000);
  };

  // Overtime Scaling Table Data
  const overtimeTableData = [
    { key: 'ot-0', otHours: 0, label: 'Standard Shift (8h)', totalHours: 8, cartons: currentCartons, gross: currentGross, pcs: currentPcs },
    { key: 'ot-1', otHours: 1, label: '+1 Hour Overtime', totalHours: 9, cartons: Math.round((currentCartons + (currentCartons / 8) * 1) * 10) / 10, gross: Math.round((currentGross + (currentGross / 8) * 1) * 10) / 10, pcs: Math.round(currentPcs + (currentPcs / 8) * 1) },
    { key: 'ot-2', otHours: 2, label: '+2 Hours Overtime', totalHours: 10, cartons: Math.round((currentCartons + (currentCartons / 8) * 2) * 10) / 10, gross: Math.round((currentGross + (currentGross / 8) * 2) * 10) / 10, pcs: Math.round(currentPcs + (currentPcs / 8) * 2) },
    { key: 'ot-3', otHours: 3, label: '+3 Hours Overtime', totalHours: 11, cartons: Math.round((currentCartons + (currentCartons / 8) * 3) * 10) / 10, gross: Math.round((currentGross + (currentGross / 8) * 3) * 10) / 10, pcs: Math.round(currentPcs + (currentPcs / 8) * 3) },
    { key: 'ot-4', otHours: 4, label: '+4 Hours Overtime (Double OT)', totalHours: 12, cartons: Math.round((currentCartons + (currentCartons / 8) * 4) * 10) / 10, gross: Math.round((currentGross + (currentGross / 8) * 4) * 10) / 10, pcs: Math.round(currentPcs + (currentPcs / 8) * 4) },
  ];

  return (
    <div className="packing-target-setup-container" style={{ padding: '4px 0 24px 0', width: '100%' }}>
      {/* ── 1. PROMINENT LIVE TARGET HERO DISPLAY (HUGE BOLD TYPOGRAPHY) ── */}
      <Card
        size="small"
        bordered={false}
        style={{
          borderRadius: 8,
          border: '2px solid #059669',
          background: 'linear-gradient(135deg, rgba(5, 150, 105, 0.08) 0%, rgba(2, 132, 199, 0.05) 100%)',
          marginBottom: 16,
          boxShadow: '0 4px 16px rgba(5, 150, 105, 0.12)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, borderBottom: '1px solid rgba(5, 150, 105, 0.2)', paddingBottom: 10, marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ background: '#059669', color: '#ffffff', width: 34, height: 34, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>
              <AimOutlined />
            </div>
            <div>
              <div style={{ fontWeight: 900, fontSize: 16, color: 'var(--theme-text, #0f172a)' }}>
                Authoritative Packing Department Shift Target
              </div>
              <div style={{ fontSize: 12, color: 'var(--theme-text-muted, #64748b)' }}>
                Persistent Baseline Standard — Automatically Applied to All New Packing Entries Until Changed
              </div>
            </div>
          </div>
          <Space>
            <Tag color="success" style={{ fontWeight: 800, fontSize: 12, padding: '4px 10px', borderRadius: 4 }}>
              <CheckCircleFilled style={{ marginRight: 4 }} />
              ACTIVE BASELINE: {targetConfig.baseCartons} CARTONS
            </Tag>
            {onNavigateTab && (
              <Button
                type="primary"
                icon={<SendOutlined />}
                onClick={() => onNavigateTab('packing-entry')}
                style={{ background: '#0284c7', borderColor: '#0284c7', fontWeight: 700 }}
              >
                Go to Packing Production Entry
              </Button>
            )}
          </Space>
        </div>

        {/* Live Massive Bold Target Numbers Banner */}
        <Row gutter={[16, 16]} align="middle">
          <Col xs={24} md={8}>
            <div style={{
              background: 'var(--theme-card-bg, #ffffff)',
              border: '2px solid #10b981',
              borderRadius: 8,
              padding: '16px 20px',
              textAlign: 'center',
              boxShadow: '0 2px 8px rgba(16, 185, 129, 0.15)',
            }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: '#059669', letterSpacing: 1, textTransform: 'uppercase' }}>
                TARGET CARTONS (CTN)
              </div>
              <div style={{ fontSize: 44, fontWeight: 900, color: '#059669', lineHeight: 1.15, marginTop: 4 }}>
                {formatNumber(currentCartons, 0)}
              </div>
              <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--theme-text, #1e293b)', marginTop: 2 }}>
                CARTONS TOTAL TARGET
              </div>
            </div>
          </Col>

          <Col xs={24} md={8}>
            <div style={{
              background: 'var(--theme-card-bg, #ffffff)',
              border: '2px solid #0284c7',
              borderRadius: 8,
              padding: '16px 20px',
              textAlign: 'center',
              boxShadow: '0 2px 8px rgba(2, 132, 199, 0.15)',
            }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: '#0284c7', letterSpacing: 1, textTransform: 'uppercase' }}>
                TARGET GROSS (GRS)
              </div>
              <div style={{ fontSize: 44, fontWeight: 900, color: '#0284c7', lineHeight: 1.15, marginTop: 4 }}>
                {formatNumber(currentGross, 0)}
              </div>
              <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--theme-text, #1e293b)', marginTop: 2 }}>
                GROSS (1 CTN = 10 GRS)
              </div>
            </div>
          </Col>

          <Col xs={24} md={8}>
            <div style={{
              background: 'var(--theme-card-bg, #ffffff)',
              border: '2px solid #f59e0b',
              borderRadius: 8,
              padding: '16px 20px',
              textAlign: 'center',
              boxShadow: '0 2px 8px rgba(245, 158, 11, 0.15)',
            }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: '#b45309', letterSpacing: 1, textTransform: 'uppercase' }}>
                TARGET PIECES (PCS)
              </div>
              <div style={{ fontSize: 44, fontWeight: 900, color: '#d97706', lineHeight: 1.15, marginTop: 4 }}>
                {formatNumber(currentPcs, 0)}
              </div>
              <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--theme-text, #1e293b)', marginTop: 2 }}>
                PIECES (144 PCS/GRS)
              </div>
            </div>
          </Col>
        </Row>

        {savedSuccess && (
          <Alert
            type="success"
            showIcon
            style={{ marginTop: 14, borderRadius: 6, fontWeight: 700 }}
            message={`Target successfully saved and applied: ${currentCartons} Cartons (${formatNumber(currentGross, 0)} Gross / ${formatNumber(currentPcs, 0)} Pieces). All new entries will use this target.`}
          />
        )}
      </Card>

      {/* ── 2. INTERACTIVE TARGET CONFIGURATION FORM ── */}
      <Row gutter={[16, 16]}>
        <Col xs={24} lg={14}>
          <Card
            size="small"
            bordered={false}
            title={
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--theme-text)' }}>
                  ⚙️ Configure Shift Packing Target
                </span>
                <Tag color="cyan" style={{ fontWeight: 700 }}>Active Storage</Tag>
              </div>
            }
            style={{
              borderRadius: 8,
              border: '1px solid var(--theme-border, #e2e8f0)',
              background: 'var(--theme-card-bg, #ffffff)',
              boxShadow: 'none',
              marginBottom: 16,
            }}
          >
            {/* Quick Preset Buttons */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--theme-text-muted, #64748b)', marginBottom: 8 }}>
                Quick Preset Targets:
              </div>
              <Space wrap size={8}>
                <Button
                  size="middle"
                  onClick={() => applyPreset(50)}
                  type={cartonsInput === 50 ? 'primary' : 'default'}
                  style={{ fontWeight: 700, borderRadius: 6 }}
                >
                  50 Cartons (500 GRS)
                </Button>
                <Button
                  size="middle"
                  onClick={() => applyPreset(75)}
                  type={cartonsInput === 75 ? 'primary' : 'default'}
                  style={{ fontWeight: 700, borderRadius: 6 }}
                >
                  75 Cartons (750 GRS)
                </Button>
                <Button
                  size="middle"
                  onClick={() => applyPreset(100)}
                  type={cartonsInput === 100 ? 'primary' : 'default'}
                  style={{ fontWeight: 800, borderRadius: 6, background: cartonsInput === 100 ? '#059669' : undefined, borderColor: '#059669' }}
                >
                  🎯 100 Cartons (Standard Baseline)
                </Button>
                <Button
                  size="middle"
                  onClick={() => applyPreset(150)}
                  type={cartonsInput === 150 ? 'primary' : 'default'}
                  style={{ fontWeight: 700, borderRadius: 6 }}
                >
                  150 Cartons (1,500 GRS)
                </Button>
                <Button
                  size="middle"
                  onClick={() => applyPreset(200)}
                  type={cartonsInput === 200 ? 'primary' : 'default'}
                  style={{ fontWeight: 800, borderRadius: 6, background: cartonsInput === 200 ? '#0284c7' : undefined, borderColor: '#0284c7' }}
                >
                  🚀 200 Cartons (Peak Production)
                </Button>
              </Space>
            </div>

            <Divider style={{ margin: '14px 0' }} />

            {/* Target Edit Fields */}
            <Row gutter={[16, 14]}>
              <Col xs={24} sm={12}>
                <label style={{ display: 'block', fontWeight: 800, fontSize: 13, color: 'var(--theme-text, #1e293b)', marginBottom: 6 }}>
                  Base Shift Target (Cartons):
                </label>
                <InputNumber
                  min={1}
                  max={50000}
                  value={cartonsInput}
                  onChange={(val) => setCartonsInput(val ? Number(val) : 100)}
                  addonAfter="Cartons"
                  style={{ width: '100%', fontWeight: 900, fontSize: 16 }}
                />
                <div style={{ fontSize: 11, color: 'var(--theme-text-muted, #64748b)', marginTop: 4 }}>
                  1 Carton = 10 Gross = 1,440 Finished Goods Pieces
                </div>
              </Col>

              <Col xs={24} sm={12}>
                <label style={{ display: 'block', fontWeight: 800, fontSize: 13, color: 'var(--theme-text, #1e293b)', marginBottom: 6 }}>
                  Planned Shift Duration:
                </label>
                <InputNumber
                  min={1}
                  max={24}
                  value={shiftHoursInput}
                  onChange={(val) => setShiftHoursInput(val ? Number(val) : 8)}
                  addonAfter="Hours"
                  style={{ width: '100%', fontWeight: 700 }}
                />
                <div style={{ fontSize: 11, color: 'var(--theme-text-muted, #64748b)', marginTop: 4 }}>
                  Standard factory general shift = 8 planned working hours
                </div>
              </Col>

              <Col xs={24} sm={12}>
                <label style={{ display: 'block', fontWeight: 700, fontSize: 12.5, color: 'var(--theme-text, #1e293b)', marginBottom: 6 }}>
                  Shift Name / Schedule:
                </label>
                <Input
                  value={shiftNameInput}
                  onChange={(e) => setShiftNameInput(e.target.value)}
                  style={{ width: '100%', fontWeight: 600 }}
                  placeholder="e.g. General (8:30 AM - 5:30 PM)"
                />
              </Col>

              <Col xs={24} sm={12}>
                <label style={{ display: 'block', fontWeight: 700, fontSize: 12.5, color: 'var(--theme-text, #1e293b)', marginBottom: 6 }}>
                  Target Directive / Notes:
                </label>
                <Input
                  value={notesInput}
                  onChange={(e) => setNotesInput(e.target.value)}
                  style={{ width: '100%', fontWeight: 600 }}
                  placeholder="e.g. Standard 8-Hour Hand Packing Directive"
                />
              </Col>
            </Row>

            <Divider style={{ margin: '16px 0' }} />

            {/* Action Buttons */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
              <Button
                icon={<ReloadOutlined />}
                onClick={handleResetToStandard}
                style={{ fontWeight: 600 }}
              >
                Reset to Standard 100 Cartons
              </Button>

              <Button
                type="primary"
                size="large"
                icon={<SaveOutlined />}
                onClick={handleSaveTarget}
                style={{
                  background: '#059669',
                  borderColor: '#059669',
                  fontWeight: 900,
                  fontSize: 14,
                  padding: '0 28px',
                  boxShadow: '0 2px 8px rgba(5, 150, 105, 0.35)',
                }}
              >
                💾 Save & Apply Target Permanently
              </Button>
            </div>
          </Card>
        </Col>

        {/* ── 3. PRODUCTIVITY METRICS & BOM CONSUMPTION REQUIREMENTS ── */}
        <Col xs={24} lg={10}>
          <Card
            size="small"
            bordered={false}
            title={
              <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--theme-text)' }}>
                ⚡ Production Pace & BOM Requirements
              </span>
            }
            style={{
              borderRadius: 8,
              border: '1px solid var(--theme-border, #e2e8f0)',
              background: 'var(--theme-card-bg, #ffffff)',
              boxShadow: 'none',
              marginBottom: 16,
            }}
          >
            {/* Metric KPI Boxes */}
            <Row gutter={[10, 10]}>
              <Col span={12}>
                <div style={{ background: 'var(--theme-surface-alt, rgba(0,0,0,0.02))', border: '1px solid var(--theme-border, #e2e8f0)', borderRadius: 6, padding: '10px 12px' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--theme-text-muted, #64748b)' }}>HOURLY OUTPUT RATE</div>
                  <div style={{ fontSize: 18, fontWeight: 900, color: '#0284c7', marginTop: 2 }}>
                    {cartonsPerHour} <span style={{ fontSize: 12 }}>CTN/hr</span>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--theme-text-muted, #64748b)', fontWeight: 600 }}>
                    {formatNumber(pcsPerHour, 0)} PCS / Hour
                  </div>
                </div>
              </Col>

              <Col span={12}>
                <div style={{ background: 'var(--theme-surface-alt, rgba(0,0,0,0.02))', border: '1px solid var(--theme-border, #e2e8f0)', borderRadius: 6, padding: '10px 12px' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--theme-text-muted, #64748b)' }}>CYCLE TIME PACE</div>
                  <div style={{ fontSize: 18, fontWeight: 900, color: '#059669', marginTop: 2 }}>
                    {minutesPerCarton} <span style={{ fontSize: 12 }}>min/CTN</span>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--theme-text-muted, #64748b)', fontWeight: 600 }}>
                    ~{pcsPerWorkerHour} PCS/worker-hr (8 workers)
                  </div>
                </div>
              </Col>
            </Row>

            <Divider style={{ margin: '12px 0' }} />

            {/* Required BOM Raw Material Deductions */}
            <div style={{ fontWeight: 800, fontSize: 12.5, color: 'var(--theme-text, #1e293b)', marginBottom: 8 }}>
              📦 Required Component Stock for this Target ({currentCartons} Cartons):
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 8px', background: 'rgba(234, 88, 12, 0.08)', borderRadius: 4 }}>
                <span style={{ fontWeight: 700, fontSize: 12, color: '#c2410c' }}>1. Inner Plated Spokes (SPI-PL-004):</span>
                <span style={{ fontWeight: 800, fontSize: 12.5, color: '#c2410c' }}>
                  {formatNumber(spokeGross, 0)} GRS ({formatNumber(spokePcs, 0)} PCS) · {spokeInnerKg} KG
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 8px', background: 'rgba(234, 88, 12, 0.08)', borderRadius: 4 }}>
                <span style={{ fontWeight: 700, fontSize: 12, color: '#c2410c' }}>2. Outer Plated Spokes (SPI-PL-004):</span>
                <span style={{ fontWeight: 800, fontSize: 12.5, color: '#c2410c' }}>
                  {formatNumber(spokeGross, 0)} GRS ({formatNumber(spokePcs, 0)} PCS) · {spokeOuterKg} KG
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 8px', background: 'rgba(2, 132, 199, 0.08)', borderRadius: 4 }}>
                <span style={{ fontWeight: 700, fontSize: 12, color: '#0369a1' }}>3. Finished Brass Nipples (WH-002):</span>
                <span style={{ fontWeight: 800, fontSize: 12.5, color: '#0369a1' }}>
                  {formatNumber(nippleGross, 0)} GRS ({formatNumber(nipplePcs, 0)} PCS) · {nippleKg} KG
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 8px', background: 'var(--theme-surface-alt, rgba(0,0,0,0.03))', border: '1px solid var(--theme-border, #e2e8f0)', borderRadius: 4, marginTop: 4 }}>
                <span style={{ fontWeight: 800, fontSize: 12, color: 'var(--theme-text, #1e293b)' }}>Total Target Assembly Weight:</span>
                <span style={{ fontWeight: 900, fontSize: 13, color: '#059669' }}>
                  ⚖️ {formatNumber(totalTargetWeightKg, 1)} KG (~{(totalTargetWeightKg / 1000).toFixed(2)} Metric Tons)
                </span>
              </div>
            </div>
          </Card>
        </Col>
      </Row>

      {/* ── 4. OVERTIME (OT) PRO-RATA SCALING SCHEDULE TABLE ── */}
      <Card
        size="small"
        bordered={false}
        title={
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--theme-text)' }}>
              ⏰ Overtime (OT) Pro-Rata Scaling Schedule
            </span>
            <Tag color="blue" style={{ fontWeight: 700 }}>
              Base Target: {currentCartons} Cartons / 8 Hours
            </Tag>
          </div>
        }
        style={{
          borderRadius: 8,
          border: '1px solid var(--theme-border, #e2e8f0)',
          background: 'var(--theme-card-bg, #ffffff)',
          boxShadow: 'none',
        }}
      >
        <Table
          dataSource={overtimeTableData}
          pagination={false}
          size="middle"
          bordered
          columns={[
            {
              title: 'Overtime Category',
              dataIndex: 'label',
              key: 'label',
              render: (txt: string, r: any) => (
                <Space>
                  <ClockCircleOutlined style={{ color: r.otHours > 0 ? '#f59e0b' : '#059669' }} />
                  <span style={{ fontWeight: 800, color: r.otHours > 0 ? '#b45309' : 'var(--theme-text)' }}>{txt}</span>
                  {r.otHours === 0 && <Tag color="green" style={{ fontWeight: 700 }}>STANDARD</Tag>}
                </Space>
              ),
            },
            {
              title: 'Shift Hours',
              dataIndex: 'totalHours',
              key: 'totalHours',
              align: 'center' as const,
              render: (h: number) => <span style={{ fontWeight: 700 }}>{h} Hours</span>,
            },
            {
              title: 'Scaled Target Cartons',
              dataIndex: 'cartons',
              key: 'cartons',
              align: 'right' as const,
              render: (c: number) => (
                <span style={{ fontWeight: 900, color: '#059669', fontSize: 14 }}>
                  {formatNumber(c, c % 1 === 0 ? 0 : 1)} Cartons
                </span>
              ),
            },
            {
              title: 'Scaled Gross (GRS)',
              dataIndex: 'gross',
              key: 'gross',
              align: 'right' as const,
              render: (g: number) => (
                <span style={{ fontWeight: 800, color: '#0284c7', fontSize: 13.5 }}>
                  {formatNumber(g, g % 1 === 0 ? 0 : 1)} GRS
                </span>
              ),
            },
            {
              title: 'Scaled Total Pieces (PCS)',
              dataIndex: 'pcs',
              key: 'pcs',
              align: 'right' as const,
              render: (p: number) => (
                <span style={{ fontWeight: 800, color: 'var(--theme-text)', fontSize: 13.5 }}>
                  {formatNumber(p, 0)} PCS
                </span>
              ),
            },
          ]}
        />
      </Card>
    </div>
  );
};

export default PackingShiftTargetSetup;
