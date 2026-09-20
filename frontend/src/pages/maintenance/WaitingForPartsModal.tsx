import React, { useState } from 'react';
import { Modal, Input, InputNumber, Button, Row, Col, Space, Tag } from 'antd';
import { StopOutlined, ClockCircleOutlined, ToolOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import apiService from '../../services/api';
import { JobCard, JOB_CARD_BASE, errorText } from './jobCards.types';

interface WaitingForPartsModalProps {
  open: boolean;
  card: JobCard | null;
  onClose: () => void;
  onSuccess: (updatedCardId: string) => void;
}

export const WaitingForPartsModal: React.FC<WaitingForPartsModalProps> = ({
  open,
  card,
  onClose,
  onSuccess,
}) => {
  const [partName, setPartName] = useState('');
  const [partCode, setPartCode] = useState('');
  const [quantity, setQuantity] = useState<number>(1);
  const [uom, setUom] = useState('Pcs');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (!open || !card) return null;

  const m = card.machine;
  const machineName = m?.name || m?.machineName || 'Machine';
  const machineCode = m?.machineCode || m?.machineNumber || '—';

  const isValid = Boolean(partName.trim() && quantity > 0 && reason.trim());

  const handleSubmit = async () => {
    if (!isValid || !card) return;
    setSubmitting(true);
    try {
      const formattedRemarks = `Waiting for Spare Part: ${partName.trim()}${partCode.trim() ? ` [${partCode.trim()}]` : ''} - Qty: ${quantity} ${uom}. Reason: ${reason.trim()}`;

      // Transition job status to WAITING_FOR_PARTS
      await apiService.post(`${JOB_CARD_BASE}/${card.id}/waiting-for-parts`, {
        remarks: formattedRemarks,
      });

      // Optionally record part request
      try {
        await apiService.post(`${JOB_CARD_BASE}/${card.id}/parts`, {
          partName: partName.trim(),
          partCode: partCode.trim() || undefined,
          quantity,
          uom,
          remarks: `Waiting for parts - ${reason.trim()}`,
        });
      } catch {
        // Optional parts recording fallback
      }

      onSuccess(card.id);
      onClose();
      // Reset form
      setPartName('');
      setPartCode('');
      setQuantity(1);
      setUom('Pcs');
      setReason('');
    } catch (e) {
      alert(errorText(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onCancel={onClose}
      title={(
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <StopOutlined style={{ color: '#d97706', fontSize: 20 }} />
          <span style={{ fontWeight: 700, fontSize: 16 }}>
            Hold Job Card — Waiting for Spare Parts
          </span>
        </div>
      )}
      footer={[
        <Button key="cancel" onClick={onClose}>
          Cancel
        </Button>,
        <Button
          key="submit"
          type="primary"
          loading={submitting}
          disabled={!isValid}
          style={{
            backgroundColor: isValid ? '#d97706' : undefined,
            borderColor: isValid ? '#b45309' : undefined,
            fontWeight: 600,
          }}
          onClick={handleSubmit}
        >
          Put on Hold (Waiting for Parts)
        </Button>,
      ]}
      width={600}
    >
      <div style={{ padding: '8px 0' }}>
        <p style={{ color: '#64748b', fontSize: 13, marginBottom: 14 }}>
          If a necessary spare part or component is out of stock or awaiting store delivery, record the part requirement here. The job card status will transition to <strong>WAITING FOR PARTS</strong>.
        </p>

        {/* Live Timestamp */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#fffbeb', border: '1px solid #fef3c7', padding: '10px 14px', borderRadius: 8, marginBottom: 14 }}>
          <Space size={8}>
            <ClockCircleOutlined style={{ color: '#d97706', fontSize: 16 }} />
            <div>
              <div style={{ fontSize: 12, color: '#92400e' }}>Hold Timestamp (System Captured):</div>
              <div style={{ fontWeight: 600, color: '#78350f', fontSize: 13 }}>{dayjs().format('DD MMMM YYYY, hh:mm A')}</div>
            </div>
          </Space>
          <Tag color="warning" style={{ fontWeight: 600, borderRadius: 4 }}>Auto Captured</Tag>
        </div>

        {/* Target Job Card Summary */}
        <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: 12, marginBottom: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
            <span style={{ fontWeight: 700, color: '#1e293b' }}>
              <ToolOutlined style={{ marginRight: 6, color: '#2563eb' }} />
              {card.jobCardNo || card.id}
            </span>
            <Tag color="orange" style={{ fontWeight: 600 }}>UNDER REPAIR</Tag>
          </div>
          <div style={{ fontSize: 13, color: '#334155' }}>
            <strong>Machine:</strong> {machineName} <Tag style={{ marginLeft: 4 }}>{machineCode}</Tag>
          </div>
          <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
            <strong>Complaint:</strong> {card.complaint || '—'}
          </div>
        </div>

        {/* Part Name / Description */}
        <div style={{ marginBottom: 14 }}>
          <label style={{ display: 'block', fontWeight: 600, fontSize: 13, marginBottom: 6 }}>
            Missing Spare Part Name / Specifications <span style={{ color: '#ef4444' }}>*</span>:
          </label>
          <Input
            placeholder="e.g. Bearing 6205-2RS, V-Belt B-64, Solenoid Valve 24V DC..."
            value={partName}
            onChange={e => setPartName(e.target.value)}
          />
        </div>

        {/* Part Code & Quantity Row */}
        <Row gutter={12} style={{ marginBottom: 14 }}>
          <Col span={10}>
            <label style={{ display: 'block', fontWeight: 600, fontSize: 13, marginBottom: 6 }}>
              Part Code / Number:
            </label>
            <Input
              placeholder="e.g. SP-BRG-002"
              value={partCode}
              onChange={e => setPartCode(e.target.value)}
            />
          </Col>
          <Col span={7}>
            <label style={{ display: 'block', fontWeight: 600, fontSize: 13, marginBottom: 6 }}>
              Quantity Needed <span style={{ color: '#ef4444' }}>*</span>:
            </label>
            <InputNumber
              min={1}
              style={{ width: '100%' }}
              value={quantity}
              onChange={v => setQuantity(v || 1)}
            />
          </Col>
          <Col span={7}>
            <label style={{ display: 'block', fontWeight: 600, fontSize: 13, marginBottom: 6 }}>
              UOM:
            </label>
            <Input
              placeholder="Pcs, Nos, Sets..."
              value={uom}
              onChange={e => setUom(e.target.value)}
            />
          </Col>
        </Row>

        {/* Reason / Procurement Notes */}
        <div style={{ marginBottom: 14 }}>
          <label style={{ display: 'block', fontWeight: 600, fontSize: 13, marginBottom: 6 }}>
            Reason / Procurement Indent Note <span style={{ color: '#ef4444' }}>*</span>:
          </label>
          <Input.TextArea
            rows={3}
            placeholder="e.g. Out of stock in main store. Purchase Requisition #PR-1049 submitted to Procurement. Expected delivery in 2 days..."
            value={reason}
            onChange={e => setReason(e.target.value)}
          />
          {!reason.trim() && (
            <div style={{ color: '#ef4444', fontSize: 12, marginTop: 4 }}>
              * Please specify why the part is unavailable or when it is expected.
            </div>
          )}
        </div>

        {/* Validation hint */}
        {!isValid && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', background: '#fffbeb', border: '1px solid #fef3c7', borderRadius: 6, color: '#b45309', fontSize: 12 }}>
            <span style={{ fontWeight: 600 }}>Action Required:</span>
            <span>Please enter the spare part description, quantity, and procurement reason to enable the Hold button.</span>
          </div>
        )}
      </div>
    </Modal>
  );
};
