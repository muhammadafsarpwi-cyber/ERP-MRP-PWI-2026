import React from 'react';
import { Modal, Button, Typography, Divider } from 'antd';
import { CheckCircleFilled } from '@ant-design/icons';
import './targetSaveSuccessModal.css';

const { Text, Title } = Typography;

export interface SuccessTargetSummary {
  machineNumber?: string | null;
  machineCode?: string | null;
  machineSystemId?: string | null;
  machineName?: string | null;
  itemCode?: string | null;
  itemName?: string | null;
  shift?: string;
  uom?: string;
  targetQuantity?: number | string;
  standardHours?: number | string;
  effectiveFrom?: string;
  effectiveTo?: string | null;
  status?: string;
}

/** A single summary row: label + value (value omitted → row hidden). */
const Row: React.FC<{ label: string; value?: React.ReactNode }> = ({ label, value }) => {
  if (value === undefined || value === null || value === '') return null;
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, padding: '5px 0' }}>
      <Text type="secondary" style={{ fontSize: 12 }}>{label}</Text>
      <Text strong style={{ fontSize: 13, textAlign: 'right' }}>{value}</Text>
    </div>
  );
};

const fmtQty = (v: number | string | null | undefined): string => {
  const n = Number(v);
  if (!isFinite(n)) return '—';
  return n.toLocaleString(undefined, { maximumFractionDigits: 4 });
};

/**
 * Machine Target save-conformation modal. Rendered ONLY after the backend has
 * confirmed the record was persisted (POST/PUT /production/machine-targets),
 * so a failed request can never reach this screen. Plain centered antd Modal
 * with a single OK action — deliberately not draggable/resizable, matching the
 * Production Entry success modal. The check-mark pop-in animation plays exactly
 * once per open and the modal never auto-closes before the user presses OK.
 */
const TargetSaveSuccessModal: React.FC<{
  open: boolean;
  target: SuccessTargetSummary | null;
  mode?: 'create' | 'edit';
  onClose: () => void;
}> = ({ open, target, mode = 'create', onClose }) => {
  if (!open || !target) return null;

  const qty = Number(target.targetQuantity);
  const hours = Number(target.standardHours);
  const perHour = hours > 0 ? Number(((qty * 1) / hours).toFixed(4)) : null;

  const machineSecondary = [target.machineCode, target.machineSystemId].filter(Boolean).join(' · ');
  const machinePrimary = target.machineNumber || target.machineCode || target.machineName || '—';

  return (
    <Modal
      open={open}
      onCancel={onClose}
      centered
      closable={false}
      maskClosable={false}
      width={460}
      footer={null}
      style={{ borderRadius: 14, overflow: 'hidden' }}
    >
      <div className="erp-target-save-success-anim" style={{ textAlign: 'center', padding: '8px 8px 4px' }}>
        <div
          className="erp-target-save-success-check"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 88,
            height: 88,
            borderRadius: '50%',
            background: 'linear-gradient(135deg, #dcfce7 0%, #bbf7d0 100%)',
            color: 'var(--theme-success, #16a34a)',
            marginBottom: 14,
          }}
        >
          <CheckCircleFilled style={{ fontSize: 52 }} />
        </div>
        <Title level={4} style={{ margin: 0, color: 'var(--theme-text, #0f172a)' }}>
          Machine Target Saved Successfully
        </Title>
        <Text type="secondary" style={{ display: 'block', marginTop: 4, fontSize: 12 }}>
          {mode === 'edit'
            ? 'The machine target has been updated.'
            : 'The machine target has been recorded.'}
        </Text>
      </div>

      <Divider style={{ margin: '14px 0' }} />

      <div style={{ padding: '4px 8px 0' }}>
        <Row label="Machine" value={machinePrimary} />
        <Row label="Machine Code / ID" value={machineSecondary || undefined} />
        <Row
          label="Machine Name"
          value={target.machineName && target.machineName !== machinePrimary ? target.machineName : undefined}
        />
        <Row
          label="Item"
          value={
            target.itemCode || target.itemName
              ? (
                <>
                  {target.itemCode && <Text strong style={{ fontSize: 13 }}>{target.itemCode}</Text>}
                  {target.itemName ? ` ${target.itemName}` : ''}
                </>
              )
              : undefined
          }
        />
        <Row label="Shift" value={target.shift} />
        <Row label="UOM" value={target.uom} />
        <Row
          label="Standard Target"
          value={qty > 0 || target.targetQuantity !== undefined ? `${fmtQty(target.targetQuantity)}${target.uom ? ` ${target.uom}` : ''}` : undefined}
        />
        <Row label="Standard Hours" value={target.standardHours !== undefined ? `${fmtQty(target.standardHours)} h` : undefined} />
        <Row label="Target / Hour" value={perHour !== null ? `${fmtQty(perHour)}${target.uom ? ` ${target.uom}` : ''}/h` : undefined} />
        <Row label="Effective" value={target.effectiveFrom ? `${target.effectiveFrom} → ${target.effectiveTo ?? 'open'}` : undefined} />
        <Row label="Status" value={target.status || 'Saved'} />
      </div>

      <Divider style={{ margin: '14px 0 16px' }} />

      <Button type="primary" block size="large" style={{ padding: '0 8px' }} onClick={onClose}>
        OK
      </Button>
    </Modal>
  );
};

export default TargetSaveSuccessModal;