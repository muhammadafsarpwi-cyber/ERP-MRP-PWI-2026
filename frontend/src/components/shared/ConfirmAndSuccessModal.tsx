import React from 'react';
import { Modal, Button, theme } from 'antd';
import {
  ExclamationCircleOutlined,
  CheckOutlined,
  CloseCircleOutlined,
} from '@ant-design/icons';

export type ConfirmAndSuccessPhase = 'idle' | 'confirm' | 'saving' | 'success' | 'error';

export interface ConfirmSummaryRow {
  label: string;
  value: React.ReactNode;
  highlight?: boolean;
}

export interface ConfirmAndSuccessModalProps {
  open: boolean;
  phase: ConfirmAndSuccessPhase;
  /** Step 1: Confirmation title, e.g. "Confirm Material Issue" */
  confirmTitle?: string;
  /** Step 1: Description under title */
  confirmDescription?: string;
  /** Step 1: Key/value summary lines shown in a subtle card */
  summaryRows?: ConfirmSummaryRow[];
  /** Step 1: Optional warning/info alert rendered below summaryRows */
  confirmAlert?: React.ReactNode;
  /** Step 1: Primary button label, e.g. "Confirm & Issue" / "Confirm & Post" / "Confirm & Save" */
  confirmText?: string;
  /** Step 2: Saving label, e.g. "Saving..." / "Processing..." */
  savingText?: string;
  /** Step 2: Sub-label under saving text */
  savingSubtext?: string;
  /** Step 3: Reference / Voucher # shown on success */
  referenceNumber?: string;
  /** Step 3: Success message below "Successful" */
  successMessage?: string;
  /** Step 3: Optional secondary action button (e.g. "View in Store Stock Balance") */
  extraSuccessAction?: { label: string; onClick: () => void };
  /** Error phase: Backend error message */
  errorMessage?: string;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
  onOk?: () => void;
  zIndex?: number;
}

const ANIMATION_CSS = `
@keyframes pwi-ring-spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}
@keyframes pwi-circle-stroke {
  0% { stroke-dashoffset: 166; }
  100% { stroke-dashoffset: 0; }
}
@keyframes pwi-check-stroke {
  0% { stroke-dashoffset: 48; }
  100% { stroke-dashoffset: 0; }
}
`;

/**
 * Standardized 3-Step Confirmation & Animated Success Modal:
 * 1. Centered Confirmation Dialog (Go Back / Confirm & ...)
 * 2. Circular Green Spinning Loader (Saving...)
 * 3. Hand-Drawn Animated Green Checkmark (Successful + Reference # + OK)
 */
export const ConfirmAndSuccessModal: React.FC<ConfirmAndSuccessModalProps> = ({
  open,
  phase,
  confirmTitle = 'Confirm Submission',
  confirmDescription = 'Please review the details below before saving.',
  summaryRows = [],
  confirmAlert,
  confirmText = 'Confirm & Save',
  savingText = 'Saving...',
  savingSubtext = 'Updating ledger and stock balances',
  referenceNumber,
  successMessage = 'Record saved and posted successfully.',
  extraSuccessAction,
  errorMessage = 'Failed to complete the operation. Please try again.',
  onConfirm,
  onCancel,
  onOk,
  zIndex = 2600,
}) => {
  const { token } = theme.useToken();

  if (!open || phase === 'idle') return null;

  const isSaving = phase === 'saving';

  return (
    <Modal
      open={open}
      centered
      width={440}
      zIndex={zIndex}
      closable={phase === 'confirm' || phase === 'error'}
      maskClosable={false}
      footer={null}
      onCancel={isSaving ? undefined : phase === 'success' ? (onOk || onCancel) : onCancel}
      destroyOnHidden
    >
      <style>{ANIMATION_CSS}</style>

      {/* STEP 1: CENTERED CONFIRMATION DIALOG */}
      {phase === 'confirm' && (
        <div style={{ padding: '4px 2px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: 10,
                background: 'rgba(16, 185, 129, 0.14)',
                color: '#10b981',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 20,
                flexShrink: 0,
              }}
            >
              <ExclamationCircleOutlined />
            </div>
            <div>
              <div style={{ fontSize: 16.5, fontWeight: 700, color: token.colorText, lineHeight: 1.25 }}>
                {confirmTitle}
              </div>
              <div style={{ fontSize: 12.5, color: token.colorTextSecondary, marginTop: 2 }}>
                {confirmDescription}
              </div>
            </div>
          </div>

          {summaryRows.length > 0 && (
            <div
              style={{
                backgroundColor: token.colorFillAlter,
                border: `1px solid ${token.colorBorderSecondary}`,
                borderRadius: 10,
                padding: '10px 14px',
                marginBottom: 18,
                display: 'flex',
                flexDirection: 'column',
                gap: 7,
                fontSize: 13,
              }}
            >
              {summaryRows.map((row, idx) => (
                <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                  <span style={{ color: token.colorTextSecondary }}>{row.label}</span>
                  <strong style={{ color: row.highlight ? '#10b981' : token.colorText, textAlign: 'right' }}>
                    {row.value}
                  </strong>
                </div>
              ))}
            </div>
          )}

          {confirmAlert && <div style={{ marginBottom: 14 }}>{confirmAlert}</div>}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <Button
              size="large"
              onClick={onCancel}
              style={{ minWidth: 110, borderRadius: 8, fontWeight: 600 }}
            >
              Go Back
            </Button>
            <Button
              type="primary"
              size="large"
              icon={<CheckOutlined />}
              onClick={onConfirm}
              style={{
                minWidth: 155,
                borderRadius: 8,
                fontWeight: 700,
                background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                borderColor: '#059669',
                boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)',
              }}
            >
              {confirmText}
            </Button>
          </div>
        </div>
      )}

      {/* STEP 2: CIRCULAR GREEN SPINNING LOADER */}
      {phase === 'saving' && (
        <div style={{ textAlign: 'center', padding: '26px 12px' }}>
          <div style={{ width: 64, height: 64, margin: '0 auto 16px' }}>
            <svg
              viewBox="0 0 64 64"
              style={{
                width: '100%',
                height: '100%',
                animation: 'pwi-ring-spin 0.9s linear infinite',
              }}
            >
              <circle
                cx="32"
                cy="32"
                r="26"
                fill="none"
                stroke="rgba(16, 185, 129, 0.2)"
                strokeWidth="5"
              />
              <circle
                cx="32"
                cy="32"
                r="26"
                fill="none"
                stroke="#10b981"
                strokeWidth="5"
                strokeLinecap="round"
                strokeDasharray="110 60"
              />
            </svg>
          </div>
          <div style={{ fontSize: 16, fontWeight: 700, color: token.colorText }}>
            {savingText}
          </div>
          <div style={{ fontSize: 12.5, color: token.colorTextSecondary, marginTop: 4 }}>
            {savingSubtext}
          </div>
        </div>
      )}

      {/* STEP 3: HAND-DRAWN ANIMATED GREEN CHECKMARK */}
      {phase === 'success' && (
        <div style={{ textAlign: 'center', padding: '18px 10px 8px' }}>
          <div style={{ width: 72, height: 72, margin: '0 auto 14px' }}>
            <svg viewBox="0 0 64 64" fill="none" style={{ width: '100%', height: '100%' }}>
              <circle
                cx="32"
                cy="32"
                r="26"
                stroke="#10b981"
                strokeWidth="3.5"
                strokeLinecap="round"
                strokeDasharray="166"
                strokeDashoffset="0"
                style={{
                  animation: 'pwi-circle-stroke 0.45s cubic-bezier(0.65, 0, 0.45, 1) forwards',
                }}
              />
              <path
                d="M 20 33 L 28.5 41.5 L 45 24"
                stroke="#10b981"
                strokeWidth="4"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeDasharray="48"
                strokeDashoffset="0"
                style={{
                  animation: 'pwi-check-stroke 0.35s 0.25s cubic-bezier(0.65, 0, 0.45, 1) backwards',
                }}
              />
            </svg>
          </div>

          <div style={{ fontSize: 19, fontWeight: 800, color: token.colorText, marginBottom: 6 }}>
            Successful
          </div>

          {referenceNumber && (
            <div
              style={{
                display: 'inline-block',
                padding: '4px 12px',
                borderRadius: 8,
                backgroundColor: token.colorFillAlter,
                border: `1px solid ${token.colorBorderSecondary}`,
                fontSize: 12.5,
                fontWeight: 700,
                color: '#10b981',
                fontFamily: 'monospace',
                marginBottom: 8,
              }}
            >
              Reference: {referenceNumber}
            </div>
          )}

          <div style={{ fontSize: 13, color: token.colorTextSecondary, marginBottom: 20 }}>
            {successMessage}
          </div>

          <div style={{ display: 'flex', justifyContent: 'center', gap: 10, flexWrap: 'wrap' }}>
            {extraSuccessAction && (
              <Button
                size="large"
                onClick={extraSuccessAction.onClick}
                style={{
                  borderRadius: 8,
                  fontWeight: 600,
                }}
              >
                {extraSuccessAction.label}
              </Button>
            )}
            <Button
              type="primary"
              size="large"
              onClick={onOk || onCancel}
              style={{
                minWidth: 130,
                borderRadius: 8,
                fontWeight: 700,
                background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                borderColor: '#059669',
              }}
            >
              OK
            </Button>
          </div>
        </div>
      )}

      {/* ERROR STATE */}
      {phase === 'error' && (
        <div style={{ textAlign: 'center', padding: '18px 10px 8px' }}>
          <div style={{ fontSize: 48, color: '#ef4444', marginBottom: 10 }}>
            <CloseCircleOutlined />
          </div>
          <div style={{ fontSize: 17, fontWeight: 700, color: token.colorText, marginBottom: 6 }}>
            Operation Failed
          </div>
          <div style={{ fontSize: 13, color: token.colorTextSecondary, marginBottom: 20 }}>
            {errorMessage}
          </div>
          <Button
            size="large"
            onClick={onCancel}
            style={{ minWidth: 120, borderRadius: 8, fontWeight: 600 }}
          >
            Go Back
          </Button>
        </div>
      )}
    </Modal>
  );
};

export default ConfirmAndSuccessModal;
