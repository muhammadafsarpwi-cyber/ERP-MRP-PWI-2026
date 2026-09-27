import React, { useState, useEffect } from 'react';
import { Modal, Button, Alert, Typography, Space } from 'antd';
import {
  ExclamationCircleOutlined,
  DeleteOutlined,
  PauseCircleOutlined,
  CloseOutlined,
} from '@ant-design/icons';

const { Text, Paragraph } = Typography;

export interface DeleteConfirmModalProps {
  open: boolean;
  title?: string;
  itemType?: string;
  itemName?: string;
  itemCode?: string;
  description?: string;
  onConfirm: () => Promise<void>;
  onCancel: () => void;
  onDeactivateInstead?: () => Promise<void>;
  deactivateLabel?: string;
  onForceDelete?: () => Promise<void>;
  forceDeleteLabel?: string;
}

/**
 * Enterprise In-Modal Delete Confirmation & Error Resolution Dialog.
 * Keeps the modal open on foreign-key/business constraint errors, displaying
 * the exact reason and offering friendly resolution options (e.g. Deactivate Instead, Admin Force Purge).
 */
export const DeleteConfirmModal: React.FC<DeleteConfirmModalProps> = ({
  open,
  title,
  itemType = 'Record',
  itemName,
  itemCode,
  description = 'This action cannot be undone. Permanent deletion is blocked automatically if this record is referenced by transactions, stock balances, BOMs, or operations.',
  onConfirm,
  onCancel,
  onDeactivateInstead,
  deactivateLabel = 'Deactivate Instead',
  onForceDelete,
  forceDeleteLabel = 'Force Delete (Admin Purge)',
}) => {
  const [loading, setLoading] = useState(false);
  const [deactivating, setDeactivating] = useState(false);
  const [forceDeleting, setForceDeleting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Reset internal state when modal opens or closes
  useEffect(() => {
    if (open) {
      setLoading(false);
      setDeactivating(false);
      setForceDeleting(false);
      setErrorMsg(null);
    }
  }, [open]);

  const handleConfirm = async () => {
    try {
      setLoading(true);
      setErrorMsg(null);
      await onConfirm();
      // On success, close is handled by parent
    } catch (err: any) {
      const msg =
        err?.response?.data?.message ||
        err?.response?.data?.error ||
        err?.message ||
        'The record could not be deleted because it is currently in use or protected.';
      setErrorMsg(typeof msg === 'string' ? msg : JSON.stringify(msg));
    } finally {
      setLoading(false);
    }
  };

  const handleDeactivate = async () => {
    if (!onDeactivateInstead) return;
    try {
      setDeactivating(true);
      setErrorMsg(null);
      await onDeactivateInstead();
    } catch (err: any) {
      const msg =
        err?.response?.data?.message ||
        err?.message ||
        'Could not deactivate the record. Please verify permissions.';
      setErrorMsg(typeof msg === 'string' ? msg : JSON.stringify(msg));
    } finally {
      setDeactivating(false);
    }
  };

  const handleForceDelete = async () => {
    if (!onForceDelete) return;
    try {
      setForceDeleting(true);
      setErrorMsg(null);
      await onForceDelete();
    } catch (err: any) {
      const msg =
        err?.response?.data?.message ||
        err?.message ||
        'Could not force delete the record. Please verify permissions.';
      setErrorMsg(typeof msg === 'string' ? msg : JSON.stringify(msg));
    } finally {
      setForceDeleting(false);
    }
  };

  const displayTitle = title || `Delete ${itemType}${itemCode ? ` '${itemCode}'` : ''}?`;

  return (
    <Modal
      open={open}
      zIndex={2500}
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: '50%',
              background: 'rgba(239, 68, 68, 0.12)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#ef4444',
              fontSize: 16,
              flexShrink: 0,
            }}
          >
            <ExclamationCircleOutlined />
          </div>
          <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--theme-text)' }}>
            {displayTitle}
          </span>
        </div>
      }
      onCancel={onCancel}
      footer={
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: 10,
            paddingTop: 12,
            borderTop: '1px solid var(--theme-border, #e2e8f0)',
          }}
        >
          <Button onClick={onCancel} disabled={loading || deactivating || forceDeleting}>
            Cancel
          </Button>

          {/* If an error occurred and deactivate alternative exists, offer it directly in footer */}
          {errorMsg && onDeactivateInstead && (
            <Button
              icon={<PauseCircleOutlined />}
              onClick={handleDeactivate}
              loading={deactivating}
              disabled={loading || forceDeleting}
              style={{
                borderColor: 'var(--theme-warning, #f59e0b)',
                color: 'var(--theme-warning, #d97706)',
                fontWeight: 600,
              }}
            >
              {deactivateLabel}
            </Button>
          )}

          {/* If deletion was blocked and force delete is enabled for Admin, offer it in footer */}
          {errorMsg && onForceDelete && (
            <Button
              type="primary"
              danger
              icon={<DeleteOutlined />}
              onClick={handleForceDelete}
              loading={forceDeleting}
              disabled={loading || deactivating}
              style={{ fontWeight: 700 }}
            >
              {forceDeleteLabel}
            </Button>
          )}

          {!errorMsg && (
            <Button
              type="primary"
              danger
              icon={<DeleteOutlined />}
              loading={loading}
              disabled={deactivating || forceDeleting}
              onClick={handleConfirm}
              style={{ fontWeight: 700 }}
            >
              Confirm Delete
            </Button>
          )}
        </div>
      }
      centered
      width={540}
      destroyOnHidden
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: '12px 0 8px' }}>
        {itemName && itemName !== itemCode && (
          <div
            style={{
              padding: '8px 12px',
              borderRadius: 6,
              background: 'var(--theme-surface-alt, #f8fafc)',
              border: '1px solid var(--theme-border, #e2e8f0)',
              fontSize: 13,
            }}
          >
            <Text type="secondary">Target: </Text>
            <Text strong>{itemName}</Text>
            {itemCode && (
              <Text type="secondary" style={{ marginLeft: 6 }}>
                ({itemCode})
              </Text>
            )}
          </div>
        )}

        <Paragraph style={{ margin: 0, fontSize: 13, color: 'var(--theme-text)' }}>
          {description}
        </Paragraph>

        {/* In-Modal Error Box (Shows exact reason why deletion was blocked + Admin Force Delete option) */}
        {errorMsg && (
          <Alert
            type="error"
            showIcon
            message="Deletion Blocked"
            description={
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
                <span style={{ fontSize: 12.5, lineHeight: 1.45 }}>{errorMsg}</span>
                {onDeactivateInstead && (
                  <div style={{ marginTop: 2 }}>
                    <Text type="secondary" style={{ fontSize: 11.5 }}>
                      Recommendation: Deactivate this item so it remains in historical audit logs without cluttering active operations.
                    </Text>
                  </div>
                )}
                {onForceDelete && (
                  <div
                    style={{
                      marginTop: 10,
                      padding: '10px 12px',
                      background: 'rgba(239, 68, 68, 0.08)',
                      borderRadius: 8,
                      border: '1px dashed #ef4444',
                    }}
                  >
                    <div style={{ fontWeight: 600, color: '#ef4444', fontSize: 13, marginBottom: 4 }}>
                      Admin Override / Force Purge Dummy Data
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--theme-text)', marginBottom: 8, lineHeight: 1.4 }}>
                      If this is a dummy, test, or unwanted item that disturbs actual operations, an Administrator can force delete it along with its linked demo logs.
                    </div>
                    <Button
                      type="primary"
                      danger
                      icon={<DeleteOutlined />}
                      loading={forceDeleting}
                      disabled={loading || deactivating}
                      onClick={handleForceDelete}
                      style={{ fontWeight: 700 }}
                    >
                      {forceDeleteLabel}
                    </Button>
                  </div>
                )}
              </div>
            }
            style={{ borderRadius: 8 }}
          />
        )}
      </div>
    </Modal>
  );
};

export default DeleteConfirmModal;
