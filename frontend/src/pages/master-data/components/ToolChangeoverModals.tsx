import React, { useEffect, useState } from 'react';
import {
  Modal,
  Form,
  Select,
  Input,
  DatePicker,
  TimePicker,
  Button,
  Space,
  Row,
  Col,
  Tag,
  Typography,
  Alert,
  Radio,
  theme,
} from 'antd';
import {
  SwapOutlined,
  PauseCircleOutlined,
  StopOutlined,
  PlayCircleOutlined,
  CloseOutlined,
  ToolOutlined,
  UserOutlined,
  CalendarOutlined,
  CheckOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import apiService from '../../../services/api';
import { ConfirmAndSuccessModal, type ConfirmAndSuccessPhase } from '../../../components/shared';

export interface ActiveToolForChangeover {
  id: string;
  machineId: string;
  machine?: { id: string; machineCode?: string | null; machineNumber?: string | null; name?: string | null } | null;
  component?: {
    id: string;
    componentCode: string;
    componentName: string;
    componentType: string;
    expectedLifeQuantity?: string | number | null;
    uomCode?: string | null;
  } | null;
  installedToolCode: string;
  newToolDescription?: string | null;
  usedByInstalled?: number | null;
  sessionCount?: number;
  operatorName?: string | null;
  shiftInchargeName?: string | null;
}

export interface StandbyToolOption {
  id: string;
  machineId: string;
  machine?: { id: string; machineCode?: string | null; name?: string | null } | null;
  component?: {
    id: string;
    componentCode: string;
    componentName: string;
    componentType: string;
    uomCode?: string | null;
  } | null;
  toolCode: string;
  newToolDescription?: string | null;
  preservedLife: number;
  remainingLife?: number | null;
  sessionCount: number;
  lastOperatorName?: string | null;
  lastShiftInchargeName?: string | null;
  storeIssueNumber?: string | null;
}

const fmtQty = (v: unknown): string => {
  const n = Number(v ?? 0);
  if (!Number.isFinite(n)) return '0';
  return Number(n.toFixed(4)).toLocaleString('en-US', { maximumFractionDigits: 4 });
};

/* ============================================================================
 * 1. UNMOUNT / TOOL CHANGEOVER MODAL (ACTIVE -> STANDBY or CLOSED)
 * ============================================================================ */

interface ToolChangeoverModalProps {
  open: boolean;
  tool: ActiveToolForChangeover | null;
  onClose: () => void;
  onSuccess: () => void;
}

export const ToolChangeoverModal: React.FC<ToolChangeoverModalProps> = ({
  open,
  tool,
  onClose,
  onSuccess,
}) => {
  const { token } = theme.useToken();
  const [form] = Form.useForm();
  const [actionMode, setActionMode] = useState<'STANDBY' | 'CLOSE'>('STANDBY');
  const [confirmPhase, setConfirmPhase] = useState<ConfirmAndSuccessPhase>('idle');
  const [pendingPayload, setPendingPayload] = useState<any>(null);
  const [errorMsg, setErrorMsg] = useState<string | undefined>(undefined);
  const [savedLife, setSavedLife] = useState<number>(0);

  useEffect(() => {
    if (open && tool) {
      setActionMode('STANDBY');
      setConfirmPhase('idle');
      setErrorMsg(undefined);
      form.resetFields();
      form.setFieldsValue({
        action: 'STANDBY',
        changeDate: dayjs(),
        changeTime: dayjs(),
        conditionStatus: 'USED',
        dispositionType: 'SCRAPPED',
        operatorName: tool.operatorName || undefined,
        shiftInchargeName: tool.shiftInchargeName || undefined,
      });
    }
  }, [open, tool, form]);

  const handlePrepareSubmit = async () => {
    try {
      const values = await form.validateFields();
      const payload = {
        action: values.action || actionMode,
        changeDate: values.changeDate ? values.changeDate.format('YYYY-MM-DD') : dayjs().format('YYYY-MM-DD'),
        changeTime: values.changeTime ? values.changeTime.format('HH:mm') : dayjs().format('HH:mm'),
        operatorName: values.operatorName?.trim() || undefined,
        shiftInchargeName: values.shiftInchargeName?.trim() || undefined,
        conditionStatus: values.action === 'CLOSE' ? (values.conditionStatus || 'USED') : 'USED',
        dispositionType: values.action === 'CLOSE' ? (values.dispositionType || 'SCRAPPED') : undefined,
        reason: values.reason?.trim() || undefined,
        remarks: values.remarks?.trim() || undefined,
      };
      setPendingPayload(payload);
      setErrorMsg(undefined);
      setConfirmPhase('confirm');
    } catch {
      // Ant Design form validation handles inline errors
    }
  };

  const executeChangeover = async () => {
    if (!tool || !pendingPayload) return;
    setConfirmPhase('saving');
    try {
      const res: any = await apiService.post(`/machine-tooling/changes/${tool.id}/changeover`, pendingPayload);
      const totalLife = Number(res?.totalCumulativeLife ?? tool.usedByInstalled ?? 0);
      setSavedLife(totalLife);
      setConfirmPhase('success');
      onClose();
      onSuccess();
    } catch (err: any) {
      const raw = err?.response?.data?.message || err?.message || 'Failed to complete tool changeover';
      setErrorMsg(Array.isArray(raw) ? raw.join('; ') : String(raw));
      setConfirmPhase('error');
    }
  };

  const uomLabel = tool?.component?.uomCode ? ` ${tool.component.uomCode}` : '';
  const isStandby = actionMode === 'STANDBY';

  return (
    <>
      <Modal
        title={null}
        footer={null}
        closable={false}
        open={open}
        zIndex={1060}
        onCancel={onClose}
        width={680}
        styles={{
          content: { padding: 0, background: 'transparent', boxShadow: 'none' },
          body: { padding: 0 },
        }}
        destroyOnHidden
      >
        <div
          style={{
            padding: 7,
            borderRadius: 20,
            background: isStandby
              ? 'linear-gradient(135deg, rgba(245, 158, 11, 0.25), rgba(148, 163, 184, 0.20))'
              : 'linear-gradient(135deg, rgba(239, 68, 68, 0.25), rgba(148, 163, 184, 0.20))',
            border: isStandby
              ? '1px solid rgba(245, 158, 11, 0.4)'
              : '1px solid rgba(239, 68, 68, 0.4)',
            boxShadow: '0 24px 60px rgba(0, 0, 0, 0.28)',
          }}
        >
          <div
            style={{
              borderRadius: 14,
              background: token.colorBgContainer,
              border: `1px solid ${token.colorBorderSecondary}`,
              overflow: 'hidden',
            }}
          >
            {/* Header */}
            <div
              style={{
                padding: '16px 20px',
                borderBottom: `1px solid ${token.colorBorderSecondary}`,
                background: token.colorFillAlter,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 10,
                    background: isStandby
                      ? 'linear-gradient(135deg, #d97706 0%, #f59e0b 100%)'
                      : 'linear-gradient(135deg, #dc2626 0%, #ef4444 100%)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#fff',
                    fontSize: 18,
                  }}
                >
                  <SwapOutlined />
                </div>
                <div>
                  <div
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      letterSpacing: '0.07em',
                      textTransform: 'uppercase',
                      color: isStandby ? '#d97706' : '#dc2626',
                    }}
                  >
                    MACHINE TOOLING · LIFECYCLE CONTROL
                  </div>
                  <div style={{ fontSize: 17, fontWeight: 800, color: token.colorText }}>
                    Tool Changeover / Unmount
                  </div>
                </div>
              </div>
              <Button
                type="text"
                size="small"
                icon={<CloseOutlined />}
                onClick={onClose}
                style={{ color: token.colorTextSecondary }}
              />
            </div>

            {/* Body */}
            <div style={{ padding: '18px 20px', maxHeight: '74vh', overflowY: 'auto' }}>
              {tool && (
                <div
                  style={{
                    padding: '12px 14px',
                    borderRadius: 10,
                    border: `1px solid ${token.colorBorderSecondary}`,
                    background: token.colorFillAlter,
                    marginBottom: 16,
                  }}
                >
                  <Row gutter={[12, 8]}>
                    <Col xs={24} sm={8}>
                      <Typography.Text type="secondary" style={{ fontSize: 11, display: 'block' }}>
                        MACHINE
                      </Typography.Text>
                      <Typography.Text strong style={{ fontSize: 13.5 }}>
                        {tool.machine?.machineCode || '—'}
                      </Typography.Text>
                    </Col>
                    <Col xs={24} sm={9}>
                      <Typography.Text type="secondary" style={{ fontSize: 11, display: 'block' }}>
                        ACTIVE TOOL RUN
                      </Typography.Text>
                      <Typography.Text strong style={{ fontSize: 13.5, color: token.colorPrimary }}>
                        {tool.installedToolCode}
                      </Typography.Text>
                    </Col>
                    <Col xs={24} sm={7}>
                      <Typography.Text type="secondary" style={{ fontSize: 11, display: 'block' }}>
                        LIVE ACCUMULATED LIFE
                      </Typography.Text>
                      <Tag color="blue" style={{ fontWeight: 700, fontSize: 12.5, margin: 0 }}>
                        {fmtQty(tool.usedByInstalled)}{uomLabel}
                      </Tag>
                    </Col>
                  </Row>
                </div>
              )}

              <Form form={form} layout="vertical">
                <Form.Item
                  name="action"
                  label={<Typography.Text strong>Select Changeover Action</Typography.Text>}
                  rules={[{ required: true }]}
                >
                  <Radio.Group
                    value={actionMode}
                    onChange={(e) => setActionMode(e.target.value)}
                    style={{ width: '100%' }}
                  >
                    <Space direction="vertical" style={{ width: '100%' }} size={10}>
                      <div
                        onClick={() => {
                          setActionMode('STANDBY');
                          form.setFieldValue('action', 'STANDBY');
                        }}
                        style={{
                          padding: '12px 14px',
                          borderRadius: 10,
                          cursor: 'pointer',
                          border:
                            actionMode === 'STANDBY'
                              ? '1.5px solid #f59e0b'
                              : `1px solid ${token.colorBorderSecondary}`,
                          background:
                            actionMode === 'STANDBY'
                              ? 'rgba(245, 158, 11, 0.08)'
                              : token.colorFillAlter,
                        }}
                      >
                        <Radio value="STANDBY">
                          <Space size={6}>
                            <PauseCircleOutlined style={{ color: '#d97706' }} />
                            <Typography.Text strong>
                              Part / Size Changeover — Keep in Standby (Reusable)
                            </Typography.Text>
                          </Space>
                        </Radio>
                        <div style={{ marginLeft: 24, marginTop: 4, fontSize: 12, color: token.colorTextSecondary }}>
                          Pauses the production counter and preserves accumulated life ({fmtQty(tool?.usedByInstalled)}{uomLabel}) in the reusable Standby / Tool Crib pool so it can be re-mounted later.
                        </div>
                      </div>

                      <div
                        onClick={() => {
                          setActionMode('CLOSE');
                          form.setFieldValue('action', 'CLOSE');
                        }}
                        style={{
                          padding: '12px 14px',
                          borderRadius: 10,
                          cursor: 'pointer',
                          border:
                            actionMode === 'CLOSE'
                              ? '1.5px solid #ef4444'
                              : `1px solid ${token.colorBorderSecondary}`,
                          background:
                            actionMode === 'CLOSE'
                              ? 'rgba(239, 68, 68, 0.08)'
                              : token.colorFillAlter,
                        }}
                      >
                        <Radio value="CLOSE">
                          <Space size={6}>
                            <StopOutlined style={{ color: '#dc2626' }} />
                            <Typography.Text strong>
                              Tool Worn Out / Damaged — Close Permanently
                            </Typography.Text>
                          </Space>
                        </Radio>
                        <div style={{ marginLeft: 24, marginTop: 4, fontSize: 12, color: token.colorTextSecondary }}>
                          Freezes final cumulative life, records physical condition &amp; disposition, and permanently archives this run in Tool Life History.
                        </div>
                      </div>
                    </Space>
                  </Radio.Group>
                </Form.Item>

                {actionMode === 'CLOSE' && (
                  <Row gutter={[14, 10]}>
                    <Col xs={24} sm={12}>
                      <Form.Item
                        name="conditionStatus"
                        label="Physical Condition"
                        rules={[{ required: true, message: 'Select condition' }]}
                      >
                        <Select
                          options={[
                            { value: 'USED', label: 'USED (Normal Wear)' },
                            { value: 'DAMAGED', label: 'DAMAGED (Broken / Chipped)' },
                            { value: 'REWORKED', label: 'REWORKED' },
                            { value: 'OTHER', label: 'OTHER' },
                          ]}
                        />
                      </Form.Item>
                    </Col>
                    <Col xs={24} sm={12}>
                      <Form.Item
                        name="dispositionType"
                        label="Disposition"
                        rules={[{ required: true, message: 'Select disposition' }]}
                      >
                        <Select
                          options={[
                            { value: 'SCRAPPED', label: 'Scrapped' },
                            { value: 'RETURN_TO_STORE', label: 'Return to Store' },
                            { value: 'SENT_FOR_REWORK', label: 'Sent for Rework' },
                            { value: 'RETAINED', label: 'Retained' },
                            { value: 'OTHER', label: 'Other' },
                          ]}
                        />
                      </Form.Item>
                    </Col>
                  </Row>
                )}

                <Row gutter={[14, 10]}>
                  <Col xs={24} sm={12}>
                    <Form.Item
                      name="changeDate"
                      label="Changeover Date"
                      rules={[{ required: true, message: 'Date is required' }]}
                    >
                      <DatePicker
                        prefix={<CalendarOutlined style={{ color: token.colorTextTertiary }} />}
                        style={{ width: '100%' }}
                        format="YYYY-MM-DD"
                      />
                    </Form.Item>
                  </Col>
                  <Col xs={24} sm={12}>
                    <Form.Item name="changeTime" label="Changeover Time">
                      <TimePicker style={{ width: '100%' }} format="HH:mm" />
                    </Form.Item>
                  </Col>
                </Row>

                <Row gutter={[14, 10]}>
                  <Col xs={24} sm={12}>
                    <Form.Item name="operatorName" label="Operator Name">
                      <Input
                        prefix={<UserOutlined style={{ color: token.colorTextTertiary }} />}
                        placeholder="Operator performing changeover"
                      />
                    </Form.Item>
                  </Col>
                  <Col xs={24} sm={12}>
                    <Form.Item name="shiftInchargeName" label="Shift Incharge">
                      <Input
                        prefix={<UserOutlined style={{ color: token.colorTextTertiary }} />}
                        placeholder="Verifying shift incharge"
                      />
                    </Form.Item>
                  </Col>
                </Row>

                <Form.Item name="remarks" label="Remarks / Changeover Notes" style={{ marginBottom: 0 }}>
                  <Input.TextArea
                    rows={2}
                    placeholder={
                      isStandby
                        ? 'e.g. Switched machine from 10G to 12G spoke size — die still in good condition'
                        : 'e.g. Punch tip cracked after normal service life'
                    }
                  />
                </Form.Item>
              </Form>
            </div>

            {/* Footer */}
            <div
              style={{
                padding: '13px 20px',
                borderTop: `1px solid ${token.colorBorderSecondary}`,
                background: token.colorFillAlter,
                display: 'flex',
                justifyContent: 'flex-end',
                gap: 10,
              }}
            >
              <Button onClick={onClose}>Cancel</Button>
              <Button
                type="primary"
                icon={isStandby ? <PauseCircleOutlined /> : <StopOutlined />}
                onClick={handlePrepareSubmit}
                style={{
                  background: isStandby
                    ? 'linear-gradient(135deg, #d97706 0%, #f59e0b 100%)'
                    : 'linear-gradient(135deg, #dc2626 0%, #ef4444 100%)',
                  borderColor: isStandby ? '#d97706' : '#dc2626',
                  fontWeight: 700,
                }}
              >
                {isStandby ? 'Pause & Move to Standby' : 'Close Tool Permanently'}
              </Button>
            </div>
          </div>
        </div>
      </Modal>

      <ConfirmAndSuccessModal
        open={confirmPhase !== 'idle'}
        phase={confirmPhase}
        confirmTitle={
          pendingPayload?.action === 'STANDBY'
            ? 'Confirm Move Tool to Standby'
            : 'Confirm Permanent Tool Closure'
        }
        confirmDescription={
          pendingPayload?.action === 'STANDBY'
            ? 'This will unmount the tool, pause its live counter, and preserve its accumulated production life in the reusable Standby pool.'
            : 'This will freeze the final production life and permanently close this tool run in Tool Life History.'
        }
        confirmText={pendingPayload?.action === 'STANDBY' ? 'Confirm & Move to Standby' : 'Confirm & Close Permanently'}
        savingText="Processing..."
        savingSubtext="Recording tool changeover & freezing session production"
        referenceNumber={tool?.installedToolCode}
        successMessage={
          pendingPayload?.action === 'STANDBY'
            ? `Tool moved to Standby (Reusable). Preserved cumulative life: ${fmtQty(savedLife)}${uomLabel}.`
            : `Tool run permanently closed. Final cumulative life: ${fmtQty(savedLife)}${uomLabel}.`
        }
        errorMessage={errorMsg}
        summaryRows={[
          { label: 'Machine', value: tool?.machine?.machineCode || '—' },
          { label: 'Tool Run', value: tool?.installedToolCode || '—' },
          {
            label: 'Action',
            value: pendingPayload?.action === 'STANDBY' ? 'Keep in Standby (Reusable)' : 'Close Permanently',
            highlight: true,
          },
        ]}
        onConfirm={executeChangeover}
        onCancel={() => setConfirmPhase('idle')}
        onOk={() => setConfirmPhase('idle')}
      />
    </>
  );
};

/* ============================================================================
 * 2. RE-MOUNT REUSABLE STANDBY TOOL MODAL (STANDBY -> ACTIVE)
 * ============================================================================ */

interface RemountStandbyToolModalProps {
  open: boolean;
  machines: Array<{ value: string; label: string }>;
  standbyTools: StandbyToolOption[];
  loadingStandby?: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const RemountStandbyToolModal: React.FC<RemountStandbyToolModalProps> = ({
  open,
  machines,
  standbyTools,
  loadingStandby,
  onClose,
  onSuccess,
}) => {
  const { token } = theme.useToken();
  const [form] = Form.useForm();
  const [selectedToolId, setSelectedToolId] = useState<string | undefined>(undefined);
  const [confirmPhase, setConfirmPhase] = useState<ConfirmAndSuccessPhase>('idle');
  const [pendingPayload, setPendingPayload] = useState<any>(null);
  const [errorMsg, setErrorMsg] = useState<string | undefined>(undefined);
  const [remountedSession, setRemountedSession] = useState<number>(2);

  const selectedTool = standbyTools.find((t) => t.id === selectedToolId) || null;

  useEffect(() => {
    if (open) {
      setSelectedToolId(undefined);
      setConfirmPhase('idle');
      setErrorMsg(undefined);
      form.resetFields();
      form.setFieldsValue({
        mountDate: dayjs(),
        mountTime: dayjs(),
      });
    }
  }, [open, form]);

  const handleSelectStandbyTool = (toolId: string) => {
    setSelectedToolId(toolId);
    const found = standbyTools.find((t) => t.id === toolId);
    if (found) {
      if (!form.getFieldValue('machineId') && found.machineId) {
        form.setFieldValue('machineId', found.machineId);
      }
      if (!form.getFieldValue('operatorName') && found.lastOperatorName) {
        form.setFieldValue('operatorName', found.lastOperatorName);
      }
      if (!form.getFieldValue('shiftInchargeName') && found.lastShiftInchargeName) {
        form.setFieldValue('shiftInchargeName', found.lastShiftInchargeName);
      }
    }
  };

  const handlePrepareSubmit = async () => {
    try {
      const values = await form.validateFields();
      const payload = {
        changeId: values.standbyToolId,
        machineId: values.machineId,
        mountDate: values.mountDate ? values.mountDate.format('YYYY-MM-DD') : dayjs().format('YYYY-MM-DD'),
        mountTime: values.mountTime ? values.mountTime.format('HH:mm') : dayjs().format('HH:mm'),
        operatorName: values.operatorName?.trim() || undefined,
        shiftInchargeName: values.shiftInchargeName?.trim() || undefined,
        remarks: values.remarks?.trim() || undefined,
      };
      setPendingPayload(payload);
      setErrorMsg(undefined);
      setConfirmPhase('confirm');
    } catch {
      // form validation handles inline errors
    }
  };

  const executeRemount = async () => {
    if (!pendingPayload) return;
    setConfirmPhase('saving');
    try {
      const res: any = await apiService.post(`/machine-tooling/changes/${pendingPayload.changeId}/remount`, {
        machineId: pendingPayload.machineId,
        mountDate: pendingPayload.mountDate,
        mountTime: pendingPayload.mountTime,
        operatorName: pendingPayload.operatorName,
        shiftInchargeName: pendingPayload.shiftInchargeName,
        remarks: pendingPayload.remarks,
      });
      setRemountedSession(Number(res?.sessionNumber ?? 2));
      setConfirmPhase('success');
      onClose();
      onSuccess();
    } catch (err: any) {
      const raw = err?.response?.data?.message || err?.message || 'Failed to re-mount standby tool';
      setErrorMsg(Array.isArray(raw) ? raw.join('; ') : String(raw));
      setConfirmPhase('error');
    }
  };

  const targetMachineLabel =
    machines.find((m) => m.value === pendingPayload?.machineId)?.label ||
    selectedTool?.machine?.machineCode ||
    'Selected Machine';

  return (
    <>
      <Modal
        title={null}
        footer={null}
        closable={false}
        open={open}
        zIndex={1060}
        onCancel={onClose}
        width={680}
        styles={{
          content: { padding: 0, background: 'transparent', boxShadow: 'none' },
          body: { padding: 0 },
        }}
        destroyOnHidden
      >
        <div
          style={{
            padding: 7,
            borderRadius: 20,
            background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.25), rgba(148, 163, 184, 0.20))',
            border: '1px solid rgba(16, 185, 129, 0.4)',
            boxShadow: '0 24px 60px rgba(0, 0, 0, 0.28)',
          }}
        >
          <div
            style={{
              borderRadius: 14,
              background: token.colorBgContainer,
              border: `1px solid ${token.colorBorderSecondary}`,
              overflow: 'hidden',
            }}
          >
            {/* Header */}
            <div
              style={{
                padding: '16px 20px',
                borderBottom: `1px solid ${token.colorBorderSecondary}`,
                background: token.colorFillAlter,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 10,
                    background: 'linear-gradient(135deg, #059669 0%, #10b981 100%)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#fff',
                    fontSize: 18,
                  }}
                >
                  <PlayCircleOutlined />
                </div>
                <div>
                  <div
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      letterSpacing: '0.07em',
                      textTransform: 'uppercase',
                      color: '#059669',
                    }}
                  >
                    TOOL CRIB · STANDBY RE-MOUNT
                  </div>
                  <div style={{ fontSize: 17, fontWeight: 800, color: token.colorText }}>
                    Re-Mount Reusable Standby Tool
                  </div>
                </div>
              </div>
              <Button
                type="text"
                size="small"
                icon={<CloseOutlined />}
                onClick={onClose}
                style={{ color: token.colorTextSecondary }}
              />
            </div>

            {/* Body */}
            <div style={{ padding: '18px 20px', maxHeight: '74vh', overflowY: 'auto' }}>
              {standbyTools.length === 0 && !loadingStandby ? (
                <Alert
                  type="info"
                  showIcon
                  message="No Tools Currently in Standby"
                  description="When you unmount a healthy punch or die during a part/size changeover and choose 'Keep in Standby (Reusable)', it will appear here ready to re-mount."
                />
              ) : (
                <Form form={form} layout="vertical">
                  <Form.Item
                    name="standbyToolId"
                    label={
                      <Space size={6}>
                        <ToolOutlined style={{ color: '#059669' }} />
                        <span>Select Standby Tool Run (Reusable Pool)</span>
                      </Space>
                    }
                    rules={[{ required: true, message: 'Please select a standby tool run' }]}
                  >
                    <Select
                      showSearch
                      loading={loadingStandby}
                      optionFilterProp="label"
                      placeholder="Choose a reusable standby tool run..."
                      onChange={handleSelectStandbyTool}
                      options={standbyTools.map((t) => {
                        const uom = t.component?.uomCode ? ` ${t.component.uomCode}` : '';
                        return {
                          value: t.id,
                          label: `${t.toolCode} — Previous Life: ${fmtQty(t.preservedLife)}${uom} (Last: ${t.machine?.machineCode || '—'})`,
                        };
                      })}
                    />
                  </Form.Item>

                  {selectedTool && (
                    <Alert
                      type="success"
                      showIcon
                      style={{ marginBottom: 14 }}
                      message={`Resuming ${selectedTool.toolCode} (Session #${selectedTool.sessionCount + 1})`}
                      description={`Preserved Cumulative Life: ${fmtQty(selectedTool.preservedLife)}${selectedTool.component?.uomCode ? ` ${selectedTool.component.uomCode}` : ''}. New daily production on the target machine will automatically add onto this total.`}
                    />
                  )}

                  <Form.Item
                    name="machineId"
                    label="Target Machine"
                    rules={[{ required: true, message: 'Please select the target machine' }]}
                  >
                    <Select
                      showSearch
                      optionFilterProp="label"
                      placeholder="Select target machine (e.g. SPK-06)"
                      options={machines}
                    />
                  </Form.Item>

                  <Row gutter={[14, 10]}>
                    <Col xs={24} sm={12}>
                      <Form.Item
                        name="mountDate"
                        label="Mount Date"
                        rules={[{ required: true, message: 'Mount date is required' }]}
                      >
                        <DatePicker
                          prefix={<CalendarOutlined style={{ color: token.colorTextTertiary }} />}
                          style={{ width: '100%' }}
                          format="YYYY-MM-DD"
                        />
                      </Form.Item>
                    </Col>
                    <Col xs={24} sm={12}>
                      <Form.Item name="mountTime" label="Mount Time">
                        <TimePicker style={{ width: '100%' }} format="HH:mm" />
                      </Form.Item>
                    </Col>
                  </Row>

                  <Row gutter={[14, 10]}>
                    <Col xs={24} sm={12}>
                      <Form.Item name="operatorName" label="Operator Name">
                        <Input
                          prefix={<UserOutlined style={{ color: token.colorTextTertiary }} />}
                          placeholder="Operator mounting tool"
                        />
                      </Form.Item>
                    </Col>
                    <Col xs={24} sm={12}>
                      <Form.Item name="shiftInchargeName" label="Shift Incharge">
                        <Input
                          prefix={<UserOutlined style={{ color: token.colorTextTertiary }} />}
                          placeholder="Shift incharge"
                        />
                      </Form.Item>
                    </Col>
                  </Row>

                  <Form.Item name="remarks" label="Remarks / Setup Notes" style={{ marginBottom: 0 }}>
                    <Input.TextArea
                      rows={2}
                      placeholder="e.g. Re-mounted for 10G spoke production batch"
                    />
                  </Form.Item>
                </Form>
              )}
            </div>

            {/* Footer */}
            <div
              style={{
                padding: '13px 20px',
                borderTop: `1px solid ${token.colorBorderSecondary}`,
                background: token.colorFillAlter,
                display: 'flex',
                justifyContent: 'flex-end',
                gap: 10,
              }}
            >
              <Button onClick={onClose}>Cancel</Button>
              {standbyTools.length > 0 && (
                <Button
                  type="primary"
                  icon={<CheckOutlined />}
                  onClick={handlePrepareSubmit}
                  style={{
                    background: 'linear-gradient(135deg, #059669 0%, #10b981 100%)',
                    borderColor: '#059669',
                    fontWeight: 700,
                  }}
                >
                  Re-Mount &amp; Resume Counter
                </Button>
              )}
            </div>
          </div>
        </div>
      </Modal>

      <ConfirmAndSuccessModal
        open={confirmPhase !== 'idle'}
        phase={confirmPhase}
        confirmTitle="Confirm Re-Mount Standby Tool"
        confirmDescription="This will reactivate the selected standby tool run on the target machine and resume accumulating daily production onto its preserved life."
        confirmText="Confirm & Re-Mount"
        savingText="Re-Mounting..."
        savingSubtext="Activating tool run & linking machine production counter"
        referenceNumber={selectedTool?.toolCode}
        successMessage={`Tool ${selectedTool?.toolCode || ''} re-mounted successfully (Session #${remountedSession}). Live production tracking resumed.`}
        errorMessage={errorMsg}
        summaryRows={[
          { label: 'Standby Tool Run', value: selectedTool?.toolCode || '—' },
          { label: 'Target Machine', value: targetMachineLabel },
          {
            label: 'Preserved Previous Life',
            value: `${fmtQty(selectedTool?.preservedLife)}${selectedTool?.component?.uomCode ? ` ${selectedTool.component.uomCode}` : ''}`,
            highlight: true,
          },
        ]}
        onConfirm={executeRemount}
        onCancel={() => setConfirmPhase('idle')}
        onOk={() => setConfirmPhase('idle')}
      />
    </>
  );
};
