import React, { useEffect, useState } from 'react';
import {
  Modal, Tabs, Tag, Space, Typography, Table, Steps, Spin, Alert, Button, Row, Col, Empty
} from 'antd';
import {
  ToolOutlined, ClockCircleOutlined, CheckCircleOutlined,
  PlayCircleOutlined, StopOutlined, AuditOutlined, RollbackOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import apiService from '../../services/api';
import { StatusBadge } from '../../components/shared';
import { JobCard, JOB_CARD_BASE, label, errorText, rowsOf } from './jobCards.types';

const { Text } = Typography;

interface JobCardViewModalProps {
  open: boolean;
  jobCardId: string | null;
  initialCard?: JobCard | null;
  onClose: () => void;
  onActionTrigger?: (action: string, card: JobCard) => void;
}

const STEP_ORDER = ['OPEN', 'ASSIGNED', 'IN_PROGRESS', 'PENDING_VERIFICATION', 'VERIFIED', 'CLOSED'];

export const JobCardViewModal: React.FC<JobCardViewModalProps> = ({
  open,
  jobCardId,
  initialCard,
  onClose,
  onActionTrigger,
}) => {
  const [card, setCard] = useState<JobCard | null>(initialCard || null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [parts, setParts] = useState<any[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [technicians, setTechnicians] = useState<any[]>([]);

  useEffect(() => {
    if (!open || !jobCardId) {
      setCard(null);
      setParts([]);
      setHistory([]);
      setTechnicians([]);
      setError('');
      return;
    }

    if (initialCard && initialCard.id === jobCardId) {
      setCard(initialCard);
    }

    setLoading(true);
    setError('');

    Promise.all([
      apiService.get<any>(`${JOB_CARD_BASE}/${jobCardId}`),
      apiService.get<any>(`${JOB_CARD_BASE}/${jobCardId}/parts`).catch(() => []),
      apiService.get<any>(`${JOB_CARD_BASE}/${jobCardId}/history`).catch(() => []),
      apiService.get<any>(`${JOB_CARD_BASE}/${jobCardId}/technicians`).catch(() => []),
    ])
      .then(([jobRes, partsRes, histRes, techRes]) => {
        const c = jobRes?.data || jobRes;
        setCard(c);
        setParts(rowsOf(partsRes) || []);
        setHistory(rowsOf(histRes) || []);
        setTechnicians(rowsOf(techRes) || []);
      })
      .catch(err => {
        setError(errorText(err));
      })
      .finally(() => {
        setLoading(false);
      });
  }, [open, jobCardId, initialCard]);

  if (!open) return null;

  const m = card?.machine;
  const machineName = m?.name || m?.machineName || 'Unnamed Machine';
  const machineCode = m?.machineCode || m?.machineNumber || '—';
  const currentStatus = card?.currentStatus || '';

  // Determine current stepper index
  let currentStepIndex = STEP_ORDER.indexOf(currentStatus);
  if (currentStatus === 'ON_HOLD' || currentStatus === 'WAITING_FOR_PARTS') {
    currentStepIndex = 2; // In Progress stage
  } else if (currentStatus === 'REJECTED') {
    currentStepIndex = 3; // Pending Verification / Review stage
  } else if (currentStatus === 'APPROVED' || currentStatus === 'COMPLETED') {
    currentStepIndex = 5; // Closed
  }
  if (currentStepIndex === -1) currentStepIndex = 0;

  // Priority color
  const p = (card?.priority || '').toUpperCase();
  const priorityColor = p === 'CRITICAL' ? '#dc2626' : p === 'HIGH' ? '#ef4444' : p === 'MEDIUM' ? '#0284c7' : '#16a34a';

  return (
    <Modal
      open={open}
      onCancel={onClose}
      width={900}
      style={{ top: 20 }}
      footer={[
        <Button key="close" onClick={onClose}>
          Close
        </Button>,
        currentStatus && ['OPEN', 'ASSIGNED'].includes(currentStatus) && onActionTrigger ? (
          <Button
            key="start"
            type="primary"
            icon={<PlayCircleOutlined />}
            style={{ backgroundColor: '#2563eb', borderColor: '#2563eb', fontWeight: 600 }}
            onClick={() => card && onActionTrigger('start', card)}
          >
            Start Job Now
          </Button>
        ) : null,
        currentStatus === 'IN_PROGRESS' && onActionTrigger ? (
          <Button
            key="wait-parts"
            icon={<StopOutlined />}
            style={{ backgroundColor: '#d97706', borderColor: '#b45309', color: '#ffffff', fontWeight: 600 }}
            onClick={() => card && onActionTrigger('waiting-for-parts', card)}
          >
            Wait for Parts
          </Button>
        ) : null,
        currentStatus === 'IN_PROGRESS' && onActionTrigger ? (
          <Button
            key="complete"
            type="primary"
            icon={<CheckCircleOutlined />}
            style={{ backgroundColor: '#059669', borderColor: '#059669', fontWeight: 600 }}
            onClick={() => card && onActionTrigger('complete', card)}
          >
            Close Job Now
          </Button>
        ) : null,
        (currentStatus === 'WAITING_FOR_PARTS' || currentStatus === 'ON_HOLD') && onActionTrigger ? (
          <Button
            key="resume"
            type="primary"
            icon={<PlayCircleOutlined />}
            style={{ backgroundColor: '#2563eb', borderColor: '#2563eb', fontWeight: 600 }}
            onClick={() => card && onActionTrigger('resume', card)}
          >
            Resume Work
          </Button>
        ) : null,
        currentStatus === 'PENDING_VERIFICATION' && onActionTrigger ? (
          <Button
            key="review"
            type="primary"
            icon={<AuditOutlined />}
            style={{ backgroundColor: '#7c3aed', borderColor: '#7c3aed', fontWeight: 600 }}
            onClick={() => card && onActionTrigger('verify', card)}
          >
            Review &amp; Verify
          </Button>
        ) : null,
        currentStatus === 'REJECTED' && onActionTrigger ? (
          <Button
            key="resubmit"
            type="primary"
            icon={<RollbackOutlined />}
            style={{ backgroundColor: '#d97706', borderColor: '#d97706', fontWeight: 600 }}
            onClick={() => card && onActionTrigger('submit-for-verification', card)}
          >
            Resubmit for Review
          </Button>
        ) : null,
      ].filter(Boolean)}
      title={(
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingRight: 24 }}>
          <Space size={8}>
            <ToolOutlined style={{ color: '#2563eb', fontSize: 20 }} />
            <span style={{ fontSize: 16, fontWeight: 700 }}>
              Job Card: {card?.jobCardNo || jobCardId}
            </span>
            <Tag color={priorityColor} style={{ fontWeight: 700, borderRadius: 4, marginLeft: 6 }}>
              {card?.priority || 'NORMAL'}
            </Tag>
            <Tag color="geekblue" style={{ fontWeight: 600, borderRadius: 4 }}>
              {label(card?.maintenanceType || 'MAINTENANCE')}
            </Tag>
          </Space>
          <StatusBadge status={currentStatus} />
        </div>
      )}
    >
      {loading && !card ? (
        <div style={{ textAlign: 'center', padding: '50px 0' }}>
          <Spin size="large" tip="Loading Job Card details..." />
        </div>
      ) : error ? (
        <Alert type="error" showIcon message="Failed to load Job Card" description={error} style={{ margin: '16px 0' }} />
      ) : card ? (
        <div>
          {/* Quick Equipment Summary Banner */}
          <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '12px 16px', margin: '12px 0 16px 0' }}>
            <Row gutter={[16, 8]} align="middle">
              <Col xs={24} sm={12} md={8}>
                <div style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>Equipment / Machine</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#1e293b' }}>
                  {machineName} <Tag style={{ marginLeft: 4 }}>{machineCode}</Tag>
                </div>
              </Col>
              <Col xs={24} sm={12} md={8}>
                <div style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>Location Hierarchy</div>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#334155' }}>
                  {card.division?.name || m?.division?.name || 'Spoke Division'} &rsaquo; {card.section?.name || m?.section?.name || 'Section'} &rsaquo; {card.assignedDepartment?.name || 'Maintenance'}
                </div>
              </Col>
              <Col xs={24} sm={12} md={8}>
                <div style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>Created &amp; Downtime</div>
                <div style={{ fontSize: 12, color: '#334155' }}>
                  <ClockCircleOutlined style={{ marginRight: 4, color: '#2563eb' }} />
                  {card.requestedAt ? dayjs(card.requestedAt).format('DD MMM YYYY, hh:mm A') : '—'}
                  {card.downtimeMinutes ? <strong style={{ color: '#ef4444', marginLeft: 6 }}>({card.downtimeMinutes} mins downtime)</strong> : null}
                </div>
              </Col>
            </Row>
          </div>

          {/* Stepper Progress Bar */}
          <div style={{ padding: '8px 12px 16px 12px', borderBottom: '1px solid #f1f5f9', marginBottom: 14 }}>
            <Steps
              size="small"
              current={currentStepIndex}
              items={[
                { title: 'Open' },
                { title: 'Assigned' },
                { title: currentStatus === 'WAITING_FOR_PARTS' ? 'Waiting Parts' : currentStatus === 'ON_HOLD' ? 'On Hold' : 'In Progress' },
                { title: currentStatus === 'REJECTED' ? 'Returned' : 'Review' },
                { title: 'Verified' },
                { title: 'Closed' },
              ]}
            />
          </div>

          {/* Multi-Tab Detailed Content */}
          <Tabs
            defaultActiveKey="overview"
            items={[
              {
                key: 'overview',
                label: 'Overview & Complaint',
                children: (
                  <div style={{ paddingTop: 4 }}>
                    {/* Complaint Callout Box */}
                    <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, padding: '12px 16px', marginBottom: 14 }}>
                      <div style={{ fontSize: 12, color: '#1e40af', fontWeight: 700, marginBottom: 4 }}>
                        OPERATIONAL COMPLAINT / FAULT REPORTED:
                      </div>
                      <div style={{ fontSize: 14, color: '#1e3a8a', fontWeight: 600 }}>
                        &ldquo;{card.complaint || 'No complaint details entered.'}&rdquo;
                      </div>
                      {card.description && (
                        <div style={{ marginTop: 8, fontSize: 13, color: '#3b82f6', borderTop: '1px dashed #bfdbfe', paddingTop: 6 }}>
                          <strong>Additional Description:</strong> {card.description}
                        </div>
                      )}
                    </div>

                    <Row gutter={[16, 12]}>
                      <Col span={12}>
                        <div style={{ background: '#f8fafc', padding: 12, borderRadius: 6, border: '1px solid #e2e8f0' }}>
                          <div style={{ fontWeight: 600, fontSize: 13, color: '#0f172a', marginBottom: 6 }}>Assignment &amp; Team:</div>
                          <div style={{ fontSize: 12, color: '#475569', marginBottom: 4 }}>
                            <strong>Assigned Technicians:</strong>{' '}
                            {technicians.length > 0
                              ? technicians.map(t => t.technician?.technicianName || t.technicianName || 'Technician').join(', ')
                              : (card.assignedTechnician?.name || 'Unassigned')}
                          </div>
                          <div style={{ fontSize: 12, color: '#475569', marginBottom: 4 }}>
                            <strong>Assigned Department:</strong> {card.assignedDepartment?.name || '—'}
                          </div>
                          <div style={{ fontSize: 12, color: '#475569' }}>
                            <strong>Maintenance Team:</strong> {card.team?.name || 'General Maintenance'}
                          </div>
                        </div>
                      </Col>

                      <Col span={12}>
                        <div style={{ background: '#f8fafc', padding: 12, borderRadius: 6, border: '1px solid #e2e8f0' }}>
                          <div style={{ fontWeight: 600, fontSize: 13, color: '#0f172a', marginBottom: 6 }}>Timestamps &amp; Actors:</div>
                          <div style={{ fontSize: 12, color: '#475569', marginBottom: 4 }}>
                            <strong>Started At:</strong> {card.startedAt ? dayjs(card.startedAt).format('DD MMM YYYY, hh:mm A') : '—'}
                          </div>
                          <div style={{ fontSize: 12, color: '#475569', marginBottom: 4 }}>
                            <strong>Completed At:</strong> {card.completedAt ? dayjs(card.completedAt).format('DD MMM YYYY, hh:mm A') : '—'}
                          </div>
                          <div style={{ fontSize: 12, color: '#475569' }}>
                            <strong>Verified At:</strong> {card.verifiedAt ? dayjs(card.verifiedAt).format('DD MMM YYYY, hh:mm A') : '—'}
                          </div>
                        </div>
                      </Col>
                    </Row>
                  </div>
                ),
              },
              {
                key: 'parts',
                label: `Spare Parts (${parts.length})`,
                children: (
                  <div>
                    {parts.length === 0 ? (
                      <Empty
                        image={Empty.PRESENTED_IMAGE_SIMPLE}
                        description="No spare parts have been logged or charged to this job card yet."
                      />
                    ) : (
                      <Table
                        size="small"
                        rowKey="id"
                        dataSource={parts}
                        pagination={false}
                        columns={[
                          { title: 'Item Code', dataIndex: ['item', 'itemCode'], key: 'code', render: (v, r) => v || r.itemCode || '—' },
                          { title: 'Part Description', dataIndex: ['item', 'name'], key: 'name', render: (v, r) => v || r.partName || r.description || '—' },
                          { title: 'Quantity', dataIndex: 'quantity', key: 'qty', width: 90, render: (v, r) => `${v} ${r.uom || ''}` },
                          { title: 'Warehouse', dataIndex: ['warehouse', 'name'], key: 'wh', render: v => v || 'Main Store' },
                          { title: 'Remarks', dataIndex: 'remarks', key: 'remarks', render: v => v || '—' },
                        ]}
                      />
                    )}
                  </div>
                ),
              },
              {
                key: 'technical',
                label: 'Diagnosis & Work Done',
                children: (
                  <div>
                    <div style={{ marginBottom: 12 }}>
                      <div style={{ fontWeight: 600, fontSize: 13, color: '#0f172a', marginBottom: 4 }}>
                        Root Cause Diagnosis / Fault Findings:
                      </div>
                      <div style={{ background: '#f8fafc', padding: 10, borderRadius: 6, border: '1px solid #e2e8f0', fontSize: 13, color: '#334155' }}>
                        {card.diagnosis || <Text type="secondary">No diagnosis logged yet.</Text>}
                      </div>
                    </div>

                    <div style={{ marginBottom: 12 }}>
                      <div style={{ fontWeight: 600, fontSize: 13, color: '#0f172a', marginBottom: 4 }}>
                        Corrective Action Taken / Work Done:
                      </div>
                      <div style={{ background: '#f8fafc', padding: 10, borderRadius: 6, border: '1px solid #e2e8f0', fontSize: 13, color: '#334155' }}>
                        {card.correctiveAction || <Text type="secondary">No corrective action logged yet.</Text>}
                      </div>
                    </div>

                    {card.preventiveAction && (
                      <div style={{ marginBottom: 12 }}>
                        <div style={{ fontWeight: 600, fontSize: 13, color: '#0f172a', marginBottom: 4 }}>
                          Preventive Recommendations:
                        </div>
                        <div style={{ background: '#f8fafc', padding: 10, borderRadius: 6, border: '1px solid #e2e8f0', fontSize: 13, color: '#334155' }}>
                          {card.preventiveAction}
                        </div>
                      </div>
                    )}

                    {card.remarks && (
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 13, color: '#0f172a', marginBottom: 4 }}>
                          Closing / General Remarks:
                        </div>
                        <div style={{ background: '#f8fafc', padding: 10, borderRadius: 6, border: '1px solid #e2e8f0', fontSize: 13, color: '#334155' }}>
                          {card.remarks}
                        </div>
                      </div>
                    )}
                  </div>
                ),
              },
              {
                key: 'technicians',
                label: `Technicians (${technicians.length})`,
                children: (
                  <div>
                    {technicians.length === 0 ? (
                      <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No individual technicians assigned yet." />
                    ) : (
                      <Table
                        size="small"
                        rowKey="id"
                        dataSource={technicians}
                        pagination={false}
                        columns={[
                          { title: 'Technician Name', key: 'name', render: (_, r) => r.technician?.technicianName || r.technicianName || '—' },
                          { title: 'Employee ID', key: 'emp', render: (_, r) => r.technician?.employeeId || '—' },
                          { title: 'Skill / Trade', key: 'skill', render: (_, r) => r.technician?.skill || '—' },
                          { title: 'Department', key: 'dept', render: (_, r) => r.technician?.department || '—' },
                          { title: 'Assigned At', key: 'date', render: (_, r) => r.assignedAt ? dayjs(r.assignedAt).format('DD MMM YYYY, hh:mm A') : '—' },
                        ]}
                      />
                    )}
                  </div>
                ),
              },
              {
                key: 'history',
                label: `Activity Audit Trail (${history.length})`,
                children: (
                  <div>
                    {history.length === 0 ? (
                      <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No history transitions logged." />
                    ) : (
                      <Table
                        size="small"
                        rowKey="id"
                        dataSource={history}
                        pagination={false}
                        columns={[
                          { title: 'Date & Time', dataIndex: 'createdAt', key: 'date', width: 170, render: v => v ? dayjs(v).format('DD MMM YYYY, hh:mm A') : '—' },
                          {
                            title: 'Status Transition', key: 'transition', width: 220,
                            render: (_, r) => (
                              <Space size={4}>
                                <Tag>{r.fromStatus || 'INIT'}</Tag>
                                <span>&rarr;</span>
                                <Tag color="blue">{r.toStatus}</Tag>
                              </Space>
                            ),
                          },
                          { title: 'Changed By', dataIndex: ['user', 'name'], key: 'by', render: (v, r) => v || r.changedBy || 'System' },
                          { title: 'Remarks / Notes', dataIndex: 'remarks', key: 'rem', render: v => v || '—' },
                        ]}
                      />
                    )}
                  </div>
                ),
              },
            ]}
          />
        </div>
      ) : null}
    </Modal>
  );
};
