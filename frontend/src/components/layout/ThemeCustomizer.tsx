import React, { useCallback, useState } from 'react';
import { Button, Modal, Tooltip } from 'antd';
import { BgColorsOutlined } from '@ant-design/icons';
import ThemePreferences from '../../theme/ThemePreferences';
import { selectIsDirty, useThemeStore } from '../../theme/themeStore';

export const ThemeSettingsButton: React.FC = () => {
  const [open, setOpen] = useState(false);
  const revertDraft = useThemeStore((state) => state.revertDraft);

  const handleClose = useCallback(() => {
    if (selectIsDirty(useThemeStore.getState())) {
      revertDraft();
    }
    setOpen(false);
  }, [revertDraft]);

  return (
    <>
      <Tooltip title="Theme Studio (34 Curated Themes)">
        <Button
          className="erp-theme-trigger-btn"
          type="text"
          shape="circle"
          aria-label="Theme Studio"
          aria-expanded={open}
          aria-haspopup="dialog"
          onClick={() => setOpen(true)}
          icon={<BgColorsOutlined style={{ fontSize: 18 }} />}
        />
      </Tooltip>

      <Modal
        open={open}
        onCancel={handleClose}
        footer={null}
        width={1040}
        centered
        destroyOnHidden={false}
        className="erp-theme-studio-modal"
        styles={{
          body: {
            padding: 0,
            maxHeight: '85vh',
            overflowY: 'auto',
          },
        }}
      >
        <ThemePreferences
          onApplied={() => setOpen(false)}
          onRequestClose={handleClose}
        />
      </Modal>
    </>
  );
};

export default ThemeSettingsButton;
