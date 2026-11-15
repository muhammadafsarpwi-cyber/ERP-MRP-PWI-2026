import React, { useState, useEffect, useCallback } from 'react';
import {
  Modal, Steps, Card, Row, Col, Tag, Form, Select, DatePicker, Input, Button,
  Timeline, Empty, Spin, Space, Typography, Divider, App, theme,
} from 'antd';
import {
  GlobalOutlined, ClockCircleOutlined, HistoryOutlined, ArrowRightOutlined,
  CheckCircleOutlined, SendOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import apiService from '../../../services/api';

const { Text } = Typography;

export const IMPORT_STAGES = [
  { key: 'ORDER_PLACED', label: 'Order Placed' },
  { key: 'PRODUCTION_STARTED', label: 'Production Started' },
  { key: 'READY_TO_SHIP', label: 'Ready to Ship' },
  { key: 'ETD_DEPARTED', label: 'ETD Departed' },
  { key: 'IN_TRANSIT', label: 'In Transit' },
  { key: 'ETA_KARACHI', label: 'Arrived Karachi Port' },
  { key: 'CUSTOMS_CLEARED', label: 'Customs Cleared' },
];

const MILESTONE_DEFAULT_STAGE: Record<string, string> = {
  PRODUCTION: 'PRODUCTION_STARTED',
  READY_TO_SHIP: 'READY_TO_SHIP',
  ETD: 'ETD_DEPARTED',
  ETA: 'ETA_KARACHI',
  VESSEL: 'IN_TRANSIT',
  CUSTOMS: 'CUSTOMS_CLEARED',
};

interface ImportUpdateLog {
  id: string;
  milestoneType: string;
  stage?: string | null;
  previousDate?: string | null;
  newDate?: string | null;
  locationPort?: string | null;
  vesselName?: string | null;
  blAwbNumber?: string | null;
  remarks?: string | null;
  revisionNumber: number;
  updatedByName?: string | null;
  createdAt: string;
}

interface PoImportTrackingModalProps {
  open: boolean;
  po: any | null;
  onClose: () => void;
  onUpdated: () => void;
}

const PoImportTrackingModal: React.FC<PoImportTrackingModalProps> = ({
  open,
  po,
  onClose,
  onUpdated,
}) => {
  const { message } = App.useApp();
  const { token } = theme.useToken();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [logs, setLogs] = useState<ImportUpdateLog[]>([]);
  const [livePo, setLivePo] = useState<any | null>(po);

  const fetchUpdates = useCallback(async () => {
    if (!po?.id) return;
    setLoading(true);
    try {
      const [poRes, updRes] = await Promise.all([
        apiService.get<any>(`/procurement/orders/${po.id}`),
        apiService.get<any>(`/procurement/orders/${po.id}/import-updates`),
      ]);
      setLivePo(poRes?.data || po);
      const list = Array.isArray(updRes) ? updRes : (updRes?.data || []);
      setLogs(list);
    } catch {
      message.error('Failed to load import tracking history');
    } finally {
      setLoading(false);
    }
  }, [po, message]);

  useEffect(() => {
    if (open && po?.id) {
      setLivePo(po);
      form.resetFields();
      form.setFieldsValue({
        milestoneType: 'ETA',
        stage: po.importStage || 'IN_TRANSIT',
        locationPort: po.portOfDischarge || 'Karachi Port',
        vesselName: po.vesselName || '',
        blAwbNumber: po.blAwbNumber || '',
      });
      void fetchUpdates();
    }
  }, [open, po, form, fetchUpdates]);

  const handleMilestoneChange = (val: string) => {
    const suggestedStage = MILESTONE_DEFAULT_STAGE[val];
    if (suggestedStage) {
      form.setFieldsValue({ stage: suggestedStage });
    }
    if (val === 'ETD' && livePo?.portOfLoading) {
      form.setFieldsValue({ locationPort: livePo.portOfLoading });
    } else if ((val === 'ETA' || val === 'CUSTOMS') && (livePo?.portOfDischarge || true)) {
      form.setFieldsValue({ locationPort: livePo?.portOfDischarge || 'Karachi Port' });
    }
  };

  const handleSubmitUpdate = async () => {
    if (!livePo?.id) return;
    try {
      const values = await form.validateFields();
      setSaving(true);
      await apiService.post(`/procurement/orders/${livePo.id}/import-updates`, {
        milestoneType: values.milestoneType,
        stage: values.stage || undefined,
        newDate: values.newDate ? values.newDate.format('YYYY-MM-DD') : undefined,
        locationPort: values.locationPort || undefined,
        vesselName: values.vesselName || undefined,
        blAwbNumber: values.blAwbNumber || undefined,
        remarks: values.remarks || undefined,
      });
      message.success('Import milestone & revision history updated');
      form.setFieldsValue({ newDate: undefined, remarks: '' });
      await fetchUpdates();
      onUpdated();
    } catch (err: any) {
      if (err?.errorFields) return;
      message.error(err?.response?.data?.message || 'Failed to save import update');
    } finally {
      setSaving(false);
    }
  };

  const currentStageIdx = Math.max(
    0,
    IMPORT_STAGES.findIndex((s) => s.key === (livePo?.importStage || 'ORDER_PLACED')),
  );

  const fmtDate = (d?: string | null) => (d ? dayjs(d).format('DD-MMM-YYYY') : '—');

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      width={1020}
      destroyOnHidden
      title={
        <Space wrap>
          <GlobalOutlined style={{ color: token.colorPrimary }} />
          <span>Import Shipment Tracker — {livePo?.poCode || ''}</span>
          {livePo?.importCargoType && <Tag color="purple">{livePo.importCargoType}</Tag>}
          {livePo?.incoterm && <Tag color="geekblue">{livePo.incoterm}</Tag>}
          {Number(livePo?.etaRevisionCount || 0) > 0 && (
            <Tag color="warning">ETA Revised {livePo.etaRevisionCount}x</Tag>
          )}
        </Space>
      }
    >
      <Spin spinning={loading}>
        <Card size="small" style={{ marginBottom: 14 }}>
          <Steps
            size="small"
            current={currentStageIdx}
            items={IMPORT_STAGES.map((s) => ({ title: s.label }))}
          />
        </Card>

        <Row gutter={[12, 12]} style={{ marginBottom: 14 }}>
          <Col xs={24} sm={12} md={6}>
            <Card size="small">
              <Text type="secondary" style={{ fontSize: 11 }}>Production Ready Date</Text>
              <div style={{ fontWeight: 700, fontSize: 14 }}>{fmtDate(livePo?.productionReadyDate)}</div>
            </Card>
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Card size="small">
              <Text type="secondary" style={{ fontSize: 11 }}>ETD (Origin: {livePo?.portOfLoading || '—'})</Text>
              <div style={{ fontWeight: 700, fontSize: 14, color: token.colorInfo }}>{fmtDate(livePo?.etdDate)}</div>
            </Card>
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Card size="small">
              <Text type="secondary" style={{ fontSize: 11 }}>ETA ({livePo?.portOfDischarge || 'Karachi Port'})</Text>
              <div style={{ fontWeight: 700, fontSize: 14, color: token.colorWarning }}>{fmtDate(livePo?.etaDate)}</div>
            </Card>
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Card size="small">
              <Text type="secondary" style={{ fontSize: 11 }}>Vessel / B/L #</Text>
              <div style={{ fontWeight: 600, fontSize: 13 }}>
                {livePo?.vesselName || '—'} {livePo?.blAwbNumber ? `(${livePo.blAwbNumber})` : ''}
              </div>
            </Card>
          </Col>
        </Row>

        <Row gutter={[16, 16]}>
          <Col xs={24} lg={10}>
            <Card
              size="small"
              title={
                <Space>
                  <ClockCircleOutlined style={{ color: token.colorPrimary }} />
                  <span>Update Status / Revise Date</span>
                </Space>
              }
            >
              <Form form={form} layout="vertical" size="small">
                <Form.Item name="milestoneType" label="Milestone / Date Type" rules={[{ required: true }]}>
                  <Select
                    onChange={handleMilestoneChange}
                    options={[
                      { value: 'PRODUCTION', label: 'Production Start / Ready Date' },
                      { value: 'READY_TO_SHIP', label: 'Goods Ready to Ship' },
                      { value: 'ETD', label: 'ETD (Origin Departure Date)' },
                      { value: 'ETA', label: 'ETA (Karachi Port Arrival Date)' },
                      { value: 'VESSEL', label: 'Vessel / B/L / Transit Update' },
                      { value: 'CUSTOMS', label: 'Customs / GD Clearance' },
                      { value: 'GENERAL', label: 'General Follow-up Note' },
                    ]}
                  />
                </Form.Item>
                <Form.Item name="stage" label="Current Lifecycle Stage">
                  <Select
                    options={IMPORT_STAGES.map((s) => ({ value: s.key, label: s.label }))}
                  />
                </Form.Item>
                <Form.Item name="newDate" label="New / Revised Date (Old date is kept in history)">
                  <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
                </Form.Item>
                <Row gutter={8}>
                  <Col span={12}>
                    <Form.Item name="locationPort" label="Current Port / Location">
                      <Input placeholder="e.g. Karachi Port" />
                    </Form.Item>
                  </Col>
                  <Col span={12}>
                    <Form.Item name="vesselName" label="Vessel / Carrier">
                      <Input placeholder="e.g. MSC / COSCO" />
                    </Form.Item>
                  </Col>
                </Row>
                <Form.Item name="blAwbNumber" label="B/L or AWB #">
                  <Input placeholder="Bill of Lading / Airway Bill #" />
                </Form.Item>
                <Form.Item
                  name="remarks"
                  label="Remarks / Reason for Update or Delay"
                  rules={[{ required: true, message: 'Please enter remarks for tracking log' }]}
                >
                  <Input.TextArea rows={3} placeholder="e.g. Vessel schedule delayed by 5 days; arriving Karachi Port on 30th" />
                </Form.Item>
                <Button
                  type="primary"
                  icon={<SendOutlined />}
                  loading={saving}
                  onClick={handleSubmitUpdate}
                  block
                >
                  Save Revision &amp; Update Tracker
                </Button>
              </Form>
            </Card>
          </Col>

          <Col xs={24} lg={14}>
            <Card
              size="small"
              title={
                <Space>
                  <HistoryOutlined style={{ color: token.colorPrimary }} />
                  <span>Date Revision &amp; Milestone History ({logs.length})</span>
                </Space>
              }
              styles={{ body: { maxHeight: 440, overflowY: 'auto' } }}
            >
              {logs.length === 0 ? (
                <Empty description="No milestone revisions recorded yet. Add the first update on the left." />
              ) : (
                <Timeline
                  items={logs.map((log) => ({
                    color: log.previousDate && log.newDate && log.previousDate !== log.newDate ? 'orange' : 'green',
                    dot: log.stage === 'CUSTOMS_CLEARED' ? <CheckCircleOutlined /> : undefined,
                    children: (
                      <div style={{ paddingBottom: 4 }}>
                        <Space wrap size={6} style={{ marginBottom: 4 }}>
                          <Tag color="blue" style={{ margin: 0, fontWeight: 700 }}>{log.milestoneType}</Tag>
                          <Tag style={{ margin: 0 }}>Rev #{log.revisionNumber}</Tag>
                          {log.stage && (
                            <Tag color="purple" style={{ margin: 0 }}>
                              {IMPORT_STAGES.find((s) => s.key === log.stage)?.label || log.stage}
                            </Tag>
                          )}
                          <Text type="secondary" style={{ fontSize: 11 }}>
                            {dayjs(log.createdAt).format('DD-MMM-YYYY HH:mm')}
                            {log.updatedByName ? ` • ${log.updatedByName}` : ''}
                          </Text>
                        </Space>

                        {(log.previousDate || log.newDate) && (
                          <div style={{ marginBottom: 4, fontSize: 12.5 }}>
                            {log.previousDate ? (
                              <Space size={6}>
                                <Text delete type="secondary">{fmtDate(log.previousDate)}</Text>
                                <ArrowRightOutlined style={{ fontSize: 11, color: token.colorWarning }} />
                                <Text strong style={{ color: token.colorWarning }}>{fmtDate(log.newDate)}</Text>
                              </Space>
                            ) : (
                              <Text strong style={{ color: token.colorSuccess }}>
                                Promised Date: {fmtDate(log.newDate)}
                              </Text>
                            )}
                          </div>
                        )}

                        {(log.locationPort || log.vesselName || log.blAwbNumber) && (
                          <div style={{ fontSize: 11.5, color: token.colorTextSecondary, marginBottom: 2 }}>
                            {[
                              log.locationPort ? `Port: ${log.locationPort}` : null,
                              log.vesselName ? `Vessel: ${log.vesselName}` : null,
                              log.blAwbNumber ? `B/L: ${log.blAwbNumber}` : null,
                            ].filter(Boolean).join(' • ')}
                          </div>
                        )}

                        {log.remarks && (
                          <div style={{ fontSize: 12.5 }}>{log.remarks}</div>
                        )}
                      </div>
                    ),
                  }))}
                />
              )}
              <Divider style={{ margin: '8px 0' }} />
              <Text type="secondary" style={{ fontSize: 11 }}>
                Every date change is permanently logged with both the previous and revised date so delays and schedule shifts remain fully auditable.
              </Text>
            </Card>
          </Col>
        </Row>
      </Spin>
    </Modal>
  );
};

export default PoImportTrackingModal;
