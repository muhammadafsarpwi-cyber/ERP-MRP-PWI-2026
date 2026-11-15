import React, { useCallback, useState } from 'react';
import { Button, Divider, Popover, Segmented, Switch, Tooltip } from 'antd';
import {
  BgColorsOutlined,
  DesktopOutlined,
  DownloadOutlined,
  MoonOutlined,
  SettingOutlined,
  SunOutlined,
} from '@ant-design/icons';
import AdvancedThemeModal from '../../theme/AdvancedThemeModal';
import { ThemeMode } from '../../theme/palettes';
import { selectIsDirty, useThemeStore } from '../../theme/themeStore';
import { usePwaInstall } from '../../context/PwaInstallContext';
import ClassicalMusicControl from '../shared/ClassicalMusicControl';

/**
 * Single Quick-Settings Popover button in the top-right header action strip.
 * Consolidates Theme Mode, Crystal Glass toggle, Background Audio, PWA Install,
 * and Advanced Theme Customizer into one compact popover.
 */
export const ThemeSettingsButton: React.FC = () => {
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);

  const savedMode = useThemeStore((state) => state.saved.mode);
  const savedGlass = useThemeStore((state) => state.saved.glass);
  const revertDraft = useThemeStore((state) => state.revertDraft);
  const setModeImmediate = useThemeStore((state) => state.setModeImmediate);
  const toggleGlassImmediate = useThemeStore((state) => state.toggleGlassImmediate);
  const { isInstalled, isInstallable, promptInstall, openInstallModal } = usePwaInstall();

  const handleModalClose = useCallback(() => {
    if (selectIsDirty(useThemeStore.getState())) {
      revertDraft();
    }
    setModalOpen(false);
  }, [revertDraft]);

  const handleInstallClick = async () => {
    setPopoverOpen(false);
    const success = await promptInstall();
    if (!success) {
      openInstallModal();
    }
  };

  const popoverContent = (
    <div style={{ width: 244, display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* 1. Theme Mode */}
      <div>
        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            color: 'var(--theme-text-muted)',
            marginBottom: 6,
          }}
        >
          Theme Mode
        </div>
        <Segmented
          block
          size="small"
          value={savedMode}
          onChange={(val) => setModeImmediate(val as ThemeMode)}
          options={[
            {
              label: (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <SunOutlined /> Light
                </span>
              ),
              value: 'light',
            },
            {
              label: (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <MoonOutlined /> Dark
                </span>
              ),
              value: 'dark',
            },
            {
              label: (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <DesktopOutlined /> System
                </span>
              ),
              value: 'system',
            },
          ]}
        />
      </div>

      {/* 2. Crystal Glass Effect */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--theme-text)' }}>
          Crystal Glass Effect
        </span>
        <Switch
          size="small"
          checked={savedGlass}
          onChange={toggleGlassImmediate}
          aria-label="Toggle Crystal Glass Effect"
        />
      </div>

      {/* 3. Background Audio / Music */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--theme-text)' }}>
          Background Audio
        </span>
        <ClassicalMusicControl compact />
      </div>

      {/* 4. Install App (only if installable and not already installed) */}
      {!isInstalled && isInstallable && (
        <Button
          block
          size="small"
          icon={<DownloadOutlined />}
          onClick={handleInstallClick}
        >
          Install ERP App
        </Button>
      )}

      <Divider style={{ margin: '2px 0' }} />

      {/* 5. Advanced Theme Customizer */}
      <Button
        block
        type="primary"
        ghost
        size="small"
        icon={<BgColorsOutlined />}
        onClick={() => {
          setPopoverOpen(false);
          setModalOpen(true);
        }}
      >
        Customize Colors &amp; Radius...
      </Button>
    </div>
  );

  return (
    <>
      <Popover
        content={popoverContent}
        trigger="click"
        placement="bottomRight"
        open={popoverOpen}
        onOpenChange={setPopoverOpen}
        getPopupContainer={() => document.body}
      >
        <Tooltip title={popoverOpen ? '' : 'Quick Settings'}>
          <Button
            className="erp-theme-trigger-btn"
            type="text"
            shape="circle"
            aria-label="Quick Settings"
            aria-expanded={popoverOpen}
            aria-haspopup="dialog"
            icon={<SettingOutlined style={{ fontSize: 18 }} />}
          />
        </Tooltip>
      </Popover>

      <AdvancedThemeModal open={modalOpen} onClose={handleModalClose} />
    </>
  );
};

export default ThemeSettingsButton;
