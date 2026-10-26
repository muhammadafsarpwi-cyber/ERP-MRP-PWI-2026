import React from 'react';
import { Modal, Grid } from 'antd';
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
  const screens = Grid.useBreakpoint();
  const isMobile = !screens.md;

  if (!open) return null;
  if (mode === 'edit' && !entryId) return null;

  const effectiveModalParams: EntryContextParams = modalParams || (entryId ? { entryId } : ({} as EntryContextParams));

  return (
    <Modal
      open={open}
      zIndex={2400}
      centered={!isMobile}
      width={isMobile ? '100vw' : '96vw'}
      style={
        isMobile
          ? { maxWidth: '100vw', width: '100vw', top: 0, left: 0, margin: 0, padding: 0, height: '100vh' }
          : { maxWidth: 1560, top: 20 }
      }
      styles={{
        body: {
          padding: isMobile ? '6px 6px' : '8px 12px',
          maxHeight: isMobile ? '100vh' : 'calc(92vh - 60px)',
          height: isMobile ? '100vh' : undefined,
          borderRadius: isMobile ? 0 : undefined,
          overflowY: 'auto',
        },
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
