import React from 'react';
import { Modal, Button, Typography, Spin, Space } from 'antd';
import { CheckCircleFilled, LoadingOutlined, CloseCircleFilled } from '@ant-design/icons';
import './SaveResultDialog.css';

const { Text, Title } = Typography;

export type SaveResultPhase = 'loading' | 'success' | 'error';

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
}

interface SaveResultDialogProps {
  open: boolean;
  /** loading = centered "Saving…" processing state during the real API request;
   *  success = confirmed result; error = persistent failure (visible until dismissed or retried). */
  phase: SaveResultPhase;
  result?: SaveResultData | null;
  /** Persistent failure detail rendered only while phase === 'error'. */
  errorMessage?: string;
  /** Re-submits the exact same request (same form values). The parent flips the
   *  phase back to 'loading' so a retry can never be mistaken for a new result. */
  onRetry?: () => void;
  onClose: () => void;
  /** Success headline. Defaults to "Successful". */
  successTitle?: string;
  /** Label for the success confirmation button. Defaults to "Close". */
  okLabel?: string;
  /** Failure message line under "Save Failed". Defaults to "The request was not persisted." */
  errorLead?: string;
}

/**
 * Reusable save-result dialog for the [Cancel][Save] forms (Routing, Routing
 * Operation, Route Type). One component serves all three flows:
 *  - loading : large centered circular spinner ("Saving…" / "Processing request…")
 *              shown only while the real API request is in flight (no fake delay).
 *  - success : large circular check-mark pop-in, "Successful", and the ACTUAL
 *              backend-generated business code (never a client-side fake ID).
 *  - error   : persistent failure state — the modal stays open with the exact
 *              normalized error until the user dismisses it (Close) or retries.
 *              A failed request can never transition to success by itself.
 * Theme tokens keep it consistent in light and dark mode.
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
    style={{ borderRadius: 14, overflow: 'hidden' }}
  >
    {phase === 'loading' ? (
      <div className="erp-save-result-loading" data-testid="save-result-loading">
        <Title level={4} className="erp-save-result-title">Saving...</Title>
        <div className="erp-save-result-spinner" role="status" aria-live="polite" data-testid="save-result-spinner">
          <Spin indicator={<LoadingOutlined className="erp-save-result-spinner-icon" />} />
        </div>
        <Text type="secondary" className="erp-save-result-hint">Processing request...</Text>
      </div>
    ) : phase === 'success' ? (
      <div className="erp-save-result-success erp-save-result-anim" data-testid="save-result-success">
        <div className="erp-save-result-check" aria-hidden="true">
          <CheckCircleFilled />
        </div>
        <Title level={4} className="erp-save-result-title">{successTitle}</Title>
        {result?.title ? <Text strong className="erp-save-result-message">{result.title}</Text> : null}
        {result?.message ? <Text type="secondary" className="erp-save-result-hint">{result.message}</Text> : null}
        {result?.recordCode || result?.recordName ? (
          <div className="erp-save-result-record">
            {result.recordType ? <Text type="secondary" className="erp-save-result-record-label">{result.recordType}</Text> : null}
            {result.recordCode ? <span className="erp-save-result-code">{result.recordCode}</span> : null}
            {result.recordName ? <Text type="secondary" className="erp-save-result-record-name">{result.recordName}</Text> : null}
          </div>
        ) : null}
        <Button type="primary" block size="large" className="erp-save-result-close" onClick={onClose}>
          {okLabel}
        </Button>
      </div>
    ) : (
      <div className="erp-save-result-error erp-save-result-anim" data-testid="save-result-error">
        <div className="erp-save-result-error-icon" aria-hidden="true">
          <CloseCircleFilled />
        </div>
        <Title level={4} className="erp-save-result-title erp-save-result-title-error">Save Failed</Title>
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