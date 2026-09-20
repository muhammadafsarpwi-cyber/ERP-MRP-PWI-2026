import React, { useState } from 'react';
import { Modal, Input, Button, Tag } from 'antd';
import { AuditOutlined, CheckCircleOutlined, RollbackOutlined, ToolOutlined } from '@ant-design/icons';
import apiService from '../../services/api';
import { JobCard, JOB_CARD_BASE, errorText } from './jobCards.types';

interface ReviewJobCardModalProps {
  open: boolean;
  card: JobCard | null;
  onClose: () => void;
  onSuccess: (action: 'verify' | 'reject', cardId: string) => void;
}

export const ReviewJobCardModal: React.FC<ReviewJobCardModalProps> = ({
  open,
  card,
  onClose,
  onSuccess,
}) => {
  const [remarks, setRemarks] = useState('');
  const [rejectionReason, setRejectionReason] = useState('');
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  if (!open || !card) return null;

  const m = card.machine;
  const machineName = m?.name || m?.machineName || 'Machine';
  const machineCode = m?.machineCode || m?.machineNumber || '—';

  const handleVerify = async () => {
    setSubmitting(true);
    try {
      await apiService.post(`${JOB_CARD_BASE}/${card.id}/verify`, {
        remarks: remarks.trim() || 'Verified and approved by supervisor.',
      });
      onSuccess('verify', card.id);
      onClose();
      setRemarks('');
      setShowRejectForm(false);
    } catch (e) {
      alert(errorText(e));
    } finally {
      setSubmitting(false);
    }
  };

  const handleReject = async () => {
    if (!rejectionReason.trim()) return;
    setSubmitting(true);
    try {
      await apiService.post(`${JOB_CARD_BASE}/${card.id}/reject`, {
        reason: rejectionReason.trim(),
      });
      onSuccess('reject', card.id);
      onClose();
      setRejectionReason('');
      setShowRejectForm(false);
    } catch (e) {
      alert(errorText(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onCancel={() => {
        onClose();
        setShowRejectForm(false);
      }}
      title={(
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <AuditOutlined style={{ color: '#7c3aed', fontSize: 20 }} />
          <span style={{ fontWeight: 700, fontSize: 16 }}>
            Supervisor Review &amp; Quality Verification
          </span>
        </div>
      )}
      footer={[
        <Button key="cancel" onClick={onClose}>
          Cancel
        </Button>,
        !showRejectForm ? (
          <Button
            key="reject-btn"
            danger
            icon={<RollbackOutlined />}
            onClick={() => setShowRejectForm(true)}
          >
            Return for Rework
          </Button>
        ) : null,
        !showRejectForm ? (
          <Button
            key="approve-btn"
            type="primary"
            icon={<CheckCircleOutlined />}
            loading={submitting}
            style={{ backgroundColor: '#7c3aed', borderColor: '#7c3aed', fontWeight: 600 }}
            onClick={handleVerify}
          >
            Verify &amp; Approve Job
          </Button>
        ) : (
          <Button
            key="confirm-reject"
            danger
            type="primary"
            icon={<RollbackOutlined />}
            loading={submitting}
            disabled={!rejectionReason.trim()}
            onClick={handleReject}
          >
            Confirm Return to Technician
          </Button>
        ),
      ].filter(Boolean)}
      width={640}
    >
      <div style={{ padding: '8px 0' }}>
        <p style={{ color: '#64748b', fontSize: 13, marginBottom: 14 }}>
          Inspect the technician&apos;s repair findings and either <strong>verify &amp; approve</strong> the job card or <strong>return for rework</strong> if issues remain unresolved.
        </p>

        {/* Target Job Card Summary */}
        <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: 12, marginBottom: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <span style={{ fontWeight: 700, color: '#1e293b' }}>
              <ToolOutlined style={{ marginRight: 6, color: '#2563eb' }} />
              {card.jobCardNo || card.id}
            </span>
            <Tag color="purple" style={{ fontWeight: 600 }}>AWAITING VERIFICATION</Tag>
          </div>
          <div style={{ fontSize: 13, color: '#334155', marginBottom: 4 }}>
            <strong>Machine:</strong> {machineName} <Tag style={{ marginLeft: 4 }}>{machineCode}</Tag>
          </div>
          <div style={{ fontSize: 12, color: '#64748b' }}>
            <strong>Complaint:</strong> {card.complaint || '—'}
          </div>
        </div>

        {/* Technician Findings Review */}
        <div style={{ background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: 8, padding: 12, marginBottom: 14 }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: '#0f172a', marginBottom: 8 }}>
            Technician Diagnosis &amp; Work Done:
          </div>
          <div style={{ fontSize: 13, color: '#334155', marginBottom: 6 }}>
            <strong style={{ color: '#0369a1' }}>Fault Findings:</strong> {card.diagnosis || '—'}
          </div>
          <div style={{ fontSize: 13, color: '#334155', marginBottom: 6 }}>
            <strong style={{ color: '#059669' }}>Work Completed:</strong> {card.correctiveAction || '—'}
          </div>
          {card.preventiveAction && (
            <div style={{ fontSize: 12, color: '#64748b' }}>
              <strong>Preventive Advice:</strong> {card.preventiveAction}
            </div>
          )}
        </div>

        {!showRejectForm ? (
          <div>
            <label style={{ display: 'block', fontWeight: 600, fontSize: 13, marginBottom: 6 }}>
              Supervisor Verification Remarks (Optional):
            </label>
            <Input.TextArea
              rows={3}
              placeholder="e.g. Inspected machine operation under load. Vibration within normal limits. Machine cleared for production."
              value={remarks}
              onChange={e => setRemarks(e.target.value)}
            />
          </div>
        ) : (
          <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <strong style={{ color: '#991b1b', fontSize: 13 }}>Reason for Returning to Technician:</strong>
              <Button size="small" type="text" onClick={() => setShowRejectForm(false)}>
                Back to Approval
              </Button>
            </div>
            <Input.TextArea
              rows={3}
              placeholder="Specify the defect or incomplete work that requires rework (e.g. Sound still abnormal, oil leak near bearing)..."
              value={rejectionReason}
              onChange={e => setRejectionReason(e.target.value)}
            />
            {!rejectionReason.trim() && (
              <div style={{ color: '#dc2626', fontSize: 12, marginTop: 4 }}>
                * Rejection reason is mandatory to return the card for rework.
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
};
