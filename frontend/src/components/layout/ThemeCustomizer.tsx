import React, { useCallback, useState } from 'react';
import { Button, Tooltip } from 'antd';
import { BgColorsOutlined } from '@ant-design/icons';
import AdvancedThemeModal from '../../theme/AdvancedThemeModal';
import { selectIsDirty, useThemeStore } from '../../theme/themeStore';

/**
 * Header trigger for the theme system.
 *
 * Opens the centred Advanced Theme pop-up (mode, 4-step corner matrix,
 * glassmorphism blur/opacity, palette presets and a custom hex picker). The
 * full 39-palette Theme Studio modal lives behind that panel's "More theme
 * options" link, so this button no longer mounts it directly.
 */
export const ThemeSettingsButton: React.FC = () => {
  const [open, setOpen] = useState(false);
  const revertDraft = useThemeStore((state) => state.revertDraft);

  const handleClose = useCallback(() => {
    // Safety net: the modal already reverts on close, but if it unmounts
    // without firing its own cancel path, don't strand a dirty draft.
    if (selectIsDirty(useThemeStore.getState())) {
      revertDraft();
    }
    setOpen(false);
  }, [revertDraft]);

  return (
    <>
      <Tooltip title="Customize Theme">
        <Button
          className="erp-theme-trigger-btn"
          type="text"
          shape="circle"
          aria-label="Customize theme"
          aria-expanded={open}
          aria-haspopup="dialog"
          onClick={() => setOpen(true)}
          icon={<BgColorsOutlined style={{ fontSize: 18 }} />}
        />
      </Tooltip>

      <AdvancedThemeModal open={open} onClose={handleClose} />
    </>
  );
};

export default ThemeSettingsButton;
