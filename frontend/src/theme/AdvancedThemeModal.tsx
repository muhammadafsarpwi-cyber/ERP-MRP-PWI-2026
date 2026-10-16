import React from 'react';
import { App, Modal } from 'antd';
import { BgColorsOutlined } from '@ant-design/icons';
import { AppearanceActions, AppearanceControls } from './AppearanceControls';
import { selectIsDirty, useThemeStore } from './themeStore';

export interface AdvancedThemeModalProps {
  open: boolean;
  onClose: () => void;
}

/**
 * Centred "Advanced Theme" pop-up — the primary entry point into the
 * appearance engine (header gear icon).
 *
 * It hosts the shared `AppearanceControls` panel: a 4-step Corner Style
 * matrix, the glassmorphism switch with blur / surface-opacity sliders, the
 * curated palette grid and a WCAG-checked custom hex picker.
 *
 * Semantics match the rest of the theme system:
 *   - every control mutates `draft`, which ThemeProvider renders live across
 *     the whole ERP (CSS variables + antd tokens);
 *   - only "Apply & Save" writes to localStorage via `applyDraft()`;
 *   - cancelling (button, ESC, mask) reverts an unsaved draft, so an aborted
 *     session never leaves a half-applied theme behind.
 *
 * The full 39-palette Theme Studio stays one click away via the panel's
 * "More theme options" link.
 */
export const AdvancedThemeModal: React.FC<AdvancedThemeModalProps> = ({
  open,
  onClose,
}) => {
  const { message } = App.useApp();
  const applyDraft = useThemeStore((state) => state.applyDraft);
  const revertDraft = useThemeStore((state) => state.revertDraft);

  const handleCancel = () => {
    // Revert any live-previewed but unsaved tweaks before closing.
    if (selectIsDirty(useThemeStore.getState())) {
      revertDraft();
    }
    onClose();
  };

  const handleApply = () => {
    applyDraft();
    message.success('Theme appearance saved');
    onClose();
  };

  return (
    <Modal
      open={open}
      onCancel={handleCancel}
      width={940}
      centered
      // Unmount on close so the nested Theme Studio cannot outlive its host
      // and each session starts from the persisted draft.
      destroyOnHidden
      className="erp-advanced-theme-modal"
      title={
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <BgColorsOutlined style={{ color: 'var(--theme-accent, #2563eb)' }} />
          Customize Theme
        </span>
      }
      styles={{
        body: { maxHeight: '68vh', overflowY: 'auto', padding: '20px 24px 8px' },
      }}
      footer={
        <AppearanceActions
          onApply={handleApply}
          onCancel={handleCancel}
          cancelLabel="Cancel"
        />
      }
    >
      <AppearanceControls />
    </Modal>
  );
};

export default AdvancedThemeModal;
