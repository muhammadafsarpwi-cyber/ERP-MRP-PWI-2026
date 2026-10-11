import React from 'react';
import { Modal } from 'antd';
import EntryForm from './EntryForm';
import type { EntryContextParams } from './entryDockStore';

export interface ProductionEntryEditModalProps {
  open: boolean;
  mode?: 'create' | 'edit';
  entryId?: string | null;
  modalParams?: EntryContextParams | null;
  onClose: () => void;
  onSuccess?: () => void;
}

/**
 * Enterprise In-Modal Dual-Pane Dialog for Daily Production Entries.
 * - Mode 'edit': Loads existing entry, allows changing manufactured item, quantities, downtime, warehouses.
 * - Mode 'create': Pre-populates selected machine, date, shift, division/department and opens dual-pane entry form.
 * - Left Pane: Operational inputs (Item, Wire Size, Warehouses IN/OUT, Quantities, Scrap KG, Running Hours, Downtime).
 * - Right Pane: Live production, target analysis, and inventory reconciliation impacts.
 * - Fully responsive on mobile, tablets, and wide screens.
 * - 100% theme-aligned with dark/light glassmorphic styling.
 */
export const ProductionEntryEditModal: React.FC<ProductionEntryEditModalProps> = ({
  open,
  mode = 'edit',
  entryId,
  modalParams,
  onClose,
  onSuccess,
}) => {
  if (!open) return null;
  if (mode === 'edit' && !entryId) return null;

  const effectiveModalParams: EntryContextParams = modalParams || (entryId ? { entryId } : ({} as EntryContextParams));

  return (
    <Modal
      open={open}
      zIndex={2400}
      centered
      width="96vw"
      style={{ maxWidth: 1560, top: 20 }}
      styles={{
        body: { padding: '8px 12px', maxHeight: 'calc(92vh - 60px)', overflowY: 'auto' },
      }}
      destroyOnHidden
      footer={null}
      onCancel={onClose}
      closable={true}
    >
      <EntryForm
        mode={mode}
        isModal={true}
        modalParams={effectiveModalParams}
        showLinkedDetails={true}
        onCloseModal={() => {
          onClose();
          onSuccess?.();
        }}
      />
    </Modal>
  );
};

export default ProductionEntryEditModal;
