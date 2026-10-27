import React from 'react';
import { Modal } from 'antd';
import EntryDetail from './EntryDetail';

export interface ProductionEntryDetailModalProps {
  open: boolean;
  entryId: string | null;
  onClose: () => void;
  onEdit?: (entryId: string) => void;
  onDeleted?: () => void;
}

/**
 * Enterprise Production Entry Detail Modal
 * Opens full shift production entry breakdown in a classic, professional,
 * high-fidelity popup modal responsive on both laptop and mobile viewports.
 */
export const ProductionEntryDetailModal: React.FC<ProductionEntryDetailModalProps> = ({
  open,
  entryId,
  onClose,
  onEdit,
  onDeleted,
}) => {
  if (!open || !entryId) return null;

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      width="96vw"
      zIndex={65000}
      style={{
        top: 20,
        maxWidth: 1520,
        paddingBottom: 20,
      }}
      bodyStyle={{
        padding: '12px 18px',
        maxHeight: 'calc(92vh - 40px)',
        overflowY: 'auto',
      }}
      destroyOnClose
      centered
      closeIcon={
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 28,
            height: 28,
            borderRadius: 6,
            background: 'rgba(239, 68, 68, 0.15)',
            border: '1px solid rgba(239, 68, 68, 0.4)',
            color: '#ef4444',
            fontSize: 14,
            fontWeight: 800,
          }}
          title="Close Modal"
        >
          ✕
        </span>
      }
      className="erp-entry-detail-modal"
    >
      <EntryDetail
        id={entryId}
        isModal={true}
        onClose={onClose}
        onEdit={onEdit}
        onDeleted={onDeleted}
      />
    </Modal>
  );
};

export default ProductionEntryDetailModal;
