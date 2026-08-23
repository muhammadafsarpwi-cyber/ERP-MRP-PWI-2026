import React, { useCallback, useState } from 'react';
import { Button, Popover, Tooltip } from 'antd';
import { SettingOutlined } from '@ant-design/icons';
import ThemePreferences from '../../theme/ThemePreferences';
import { selectIsDirty, useThemeStore } from '../../theme/themeStore';

export const ThemeSettingsButton: React.FC = () => {
  const [open, setOpen] = useState(false);
  const revertDraft = useThemeStore((state) => state.revertDraft);

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next && selectIsDirty(useThemeStore.getState())) {
        revertDraft();
      }
      setOpen(next);
    },
    [revertDraft]
  );

  return (
    <Popover
      content={
        <ThemePreferences
          onApplied={() => setOpen(false)}
          onRequestClose={() => handleOpenChange(false)}
        />
      }
      trigger="click"
      open={open}
      onOpenChange={handleOpenChange}
      placement="bottomRight"
      overlayClassName="erp-theme-popover"
      arrow={false}
    >
      <Tooltip title="Theme Settings">
        <Button
          className="erp-theme-trigger-btn"
          type="text"
          shape="circle"
          aria-label="Theme Settings"
          aria-expanded={open}
          aria-haspopup="dialog"
          icon={<SettingOutlined style={{ fontSize: 17 }} />}
        />
      </Tooltip>
    </Popover>
  );
};

export default ThemeSettingsButton;
