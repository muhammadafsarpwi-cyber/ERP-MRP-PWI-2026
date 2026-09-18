import React from 'react';
import { Modal, Button, Typography, Spin, Space, Tag } from 'antd';
import { LoadingOutlined, CloseCircleFilled } from '@ant-design/icons';
import UserAvatar from '../layout/UserAvatar';
import './SaveResultDialog.css';

const { Text, Title } = Typography;

export type SaveResultPhase = 'loading' | 'success' | 'error';

export interface SaveResultTagItem {
  label: string;
  color?: string;
}

export interface SaveResultData {
  /** Success headline rendered under "Successful", e.g. "Routing Saved Successfully". */
  title: string;
  /** Optional secondary line. */
  message?: string;
  /** Business-code label, e.g. "Routing Code". The raw backend UUID is never shown as primary. */
  recordType?: string;
  /** Actual backend-generated business code, e.g. "RTG-CCD-001". */
  recordCode?: string;
  /** Optional human-readable record name. */
  recordName?: string;
  /** Optional user avatar URL or image path */
  avatarUrl?: string | null;
  /** Optional user or entity display name */
  userName?: string;
  /** Optional user or entity email / subtitle */
  userEmail?: string;
  /** Optional role badges or status tags */
  tags?: Array<SaveResultTagItem | string>;
  /** Optional custom extra content */
  extra?: React.ReactNode;
}

interface SaveResultDialogProps {
  open: boolean;
  /** loading = centered circular spinner processing state during real API request;
   *  success = confirmed result with green checkmark; error = failure state. */
  phase: SaveResultPhase;
  result?: SaveResultData | null;
  /** Persistent failure detail rendered only while phase === 'error'. */
  errorMessage?: string;
  /** Re-submits the exact same request. */
  onRetry?: () => void;
  onClose: () => void;
  /** Success headline. Defaults to "Successful". */
  successTitle?: string;
  /** Label for the success confirmation button. Defaults to "Close". */
  okLabel?: string;
  /** Failure message line under "Save Failed". Defaults to "The request was not persisted." */
  errorLead?: string;
  /** Title headline for error state. Defaults to "Save Failed". */
  errorTitle?: string;
  /** Loading title headline. Defaults to "Saving...". */
  loadingTitle?: string;
  /** Loading sub-text. Defaults to "Processing request...". */
  loadingHint?: string;
}

/**
 * Reusable save-result dialog across ERP workflows.
 *  - loading : large centered circular spinner with pulsing ring shown while request in flight.
 *  - success : animated circular green check-mark matching the 2027 model design,
 *              headline ("Successful"), user identity (photo, name, email, role badges),
 *              and record details.
 *  - error   : persistent failure state with exact error details and Retry/Close actions.
 */
const SaveResultDialog: React.FC<SaveResultDialogProps> = ({
  open,
  phase,
  result,
  errorMessage,
  onRetry,
  onClose,
  successTitle = 'Successful',
  okLabel = 'Close',
  errorLead = 'The request was not persisted.',
  errorTitle = 'Save Failed',
  loadingTitle = 'Saving...',
  loadingHint = 'Processing request...',
}) => (
  <Modal
    open={open}
    centered
    closable={false}
    maskClosable={false}
    keyboard={false}
    width={460}
    footer={null}
    destroyOnHidden
    zIndex={3500}
    wrapClassName="erp-save-result-modal-wrap"
    style={{ borderRadius: 16, overflow: 'hidden' }}
  >
    {phase === 'loading' ? (
      <div className="erp-save-result-loading" data-testid="save-result-loading">
        <Title level={4} className="erp-save-result-title">{loadingTitle}</Title>
        <div className="erp-save-result-orbital-wrap" role="status" aria-live="polite" data-testid="save-result-spinner">
          <svg className="erp-save-result-orbital-svg" viewBox="0 0 120 120">
            <defs>
              <linearGradient id="erpOrbitalGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#4f46e5" />
                <stop offset="50%" stopColor="#818cf8" />
                <stop offset="100%" stopColor="#c7d2fe" stopOpacity="0.2" />
              </linearGradient>
            </defs>
            {/* Inner resting circle and glowing core */}
            <circle className="erp-orbital-inner-disc" cx="60" cy="60" r="42" />
            <circle className="erp-orbital-inner-core" cx="60" cy="60" r="16" />
            {/* Outer perimeter track */}
            <circle className="erp-orbital-outer-track" cx="60" cy="60" r="52" fill="none" />
            {/* Rotating orbital arc around the outer circumference */}
            <circle className="erp-orbital-spinning-arc" cx="60" cy="60" r="52" fill="none" />
          </svg>
        </div>
        <Text type="secondary" className="erp-save-result-hint">{loadingHint}</Text>
      </div>
    ) : phase === 'success' ? (
      <div className="erp-save-result-success erp-save-result-anim" data-testid="save-result-success">
        <div className="erp-save-result-check-ring" aria-hidden="true" data-testid="save-result-check-ring">
          <svg className="erp-save-result-svg-check" viewBox="0 0 52 52">
            <circle className="erp-save-result-svg-circle" cx="26" cy="26" r="23" fill="none" />
            <path className="erp-save-result-svg-stroke" fill="none" d="M14.1 27.2l7.1 7.2 16.7-16.8" />
          </svg>
        </div>
        <Title level={4} className="erp-save-result-title">{successTitle}</Title>
        {result?.title ? <Text strong className="erp-save-result-message">{result.title}</Text> : null}
        {result?.message ? <Text type="secondary" className="erp-save-result-hint">{result.message}</Text> : null}

        {(result?.userName || result?.avatarUrl || (result?.tags && result.tags.length > 0)) ? (
          <div className="erp-save-result-user-card" data-testid="save-result-user-card">
            <UserAvatar
              avatarUrl={result.avatarUrl}
              displayName={result.userName}
              size={54}
              className="erp-save-result-user-avatar"
            />
            <div className="erp-save-result-user-meta">
              {result.userName ? <div className="erp-save-result-user-name">{result.userName}</div> : null}
              {result.userEmail ? <div className="erp-save-result-user-email">{result.userEmail}</div> : null}
              {result.tags && result.tags.length > 0 ? (
                <div className="erp-save-result-tags">
                  {result.tags.map((t, idx) => {
                    const label = typeof t === 'string' ? t : t.label;
                    const color = typeof t === 'string' ? 'blue' : (t.color || 'blue');
                    return (
                      <Tag key={idx} color={color} className="erp-save-result-tag">
                        {label}
                      </Tag>
                    );
                  })}
                </div>
              ) : null}
            </div>
          </div>
        ) : null}

        {result?.recordCode || result?.recordName ? (
          <div className="erp-save-result-record">
            {result.recordType ? <Text type="secondary" className="erp-save-result-record-label">{result.recordType}</Text> : null}
            {result.recordCode ? <span className="erp-save-result-code">{result.recordCode}</span> : null}
            {result.recordName ? <Text type="secondary" className="erp-save-result-record-name">{result.recordName}</Text> : null}
          </div>
        ) : null}

        {result?.extra ? <div className="erp-save-result-extra">{result.extra}</div> : null}

        <Button type="primary" block size="large" className="erp-save-result-close" onClick={onClose}>
          {okLabel}
        </Button>
      </div>
    ) : (
      <div className="erp-save-result-error erp-save-result-anim" data-testid="save-result-error">
        <div className="erp-save-result-error-icon" aria-hidden="true">
          <CloseCircleFilled />
        </div>
        <Title level={4} className="erp-save-result-title erp-save-result-title-error">{errorTitle}</Title>
        <Text strong className="erp-save-result-message">{errorLead}</Text>
        {errorMessage ? <div className="erp-save-result-error-detail">{errorMessage}</div> : null}
        <Space className="erp-save-result-error-actions">
          <Button size="large" onClick={onClose}>Close</Button>
          {onRetry ? (
            <Button type="primary" size="large" onClick={onRetry}>Retry</Button>
          ) : null}
        </Space>
      </div>
    )}
  </Modal>
);

export default SaveResultDialog;