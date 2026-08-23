import React from 'react';
import { App, Button, Divider, Switch, Tooltip, Typography } from 'antd';
import {
  CheckOutlined,
  CloseOutlined,
  ReloadOutlined,
  SettingOutlined,
} from '@ant-design/icons';
import { PALETTES, resolveRoles } from './palettes';
import type { ThemeMode } from './palettes';
import { useThemeStore } from './themeStore';

const { Text } = Typography;

interface RoleLegendProps {
  mode: ThemeMode;
  paletteId: string;
}

const RoleLegend: React.FC<RoleLegendProps> = ({ mode, paletteId }) => {
  const roles = resolveRoles(
    PALETTES.find((p) => p.id === paletteId) ?? PALETTES[0],
    mode
  );
  const items = [
    { label: 'Navigation', color: roles.primary },
    { label: 'Surface', color: roles.surface },
    { label: 'Accent', color: roles.accent },
  ];
  return (
    <div className="erp-role-legend">
      {items.map((item) => (
        <span key={item.label} className="erp-role-legend-item">
          <span className="erp-role-dot" style={{ background: item.color }} />
          {item.label}
        </span>
      ))}
    </div>
  );
};

interface ThemePreferencesProps {
  onRequestClose?: () => void;
  onApplied?: () => void;
  embedded?: boolean;
}

export const ThemePreferences: React.FC<ThemePreferencesProps> = ({
  onRequestClose,
  onApplied,
  embedded = false,
}) => {
  const { message } = App.useApp();
  const draft = useThemeStore((state) => state.draft);
  const setMode = useThemeStore((state) => state.setMode);
  const setPalette = useThemeStore((state) => state.setPalette);
  const applyDraft = useThemeStore((state) => state.applyDraft);
  const resetToDefaults = useThemeStore((state) => state.resetToDefaults);

  const handleApply = () => {
    applyDraft();
    message.success('Theme settings saved');
    if (onApplied) onApplied();
  };

  const handleReset = () => {
    resetToDefaults();
    message.info('Theme restored to defaults');
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape' && onRequestClose) {
      event.stopPropagation();
      onRequestClose();
    }
  };

  return (
    <div
      className={`erp-theme-panel${embedded ? ' erp-theme-panel-embedded' : ''}`}
      role="dialog"
      aria-label="Theme settings"
      onKeyDown={handleKeyDown}
    >
      <div className="erp-theme-panel-head">
        <span className="erp-theme-panel-icon" aria-hidden="true">
          <SettingOutlined />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <Text strong style={{ fontSize: 15 }}>
            Appearance
          </Text>
          <Text type="secondary" style={{ display: 'block', fontSize: 12 }}>
            Three-color theme, previewed instantly
          </Text>
        </div>
        {onRequestClose && (
          <Tooltip title="Close">
            <Button
              type="text"
              size="small"
              shape="circle"
              icon={<CloseOutlined />}
              aria-label="Close theme settings"
              onClick={onRequestClose}
            />
          </Tooltip>
        )}
      </div>

      <div className="erp-theme-section">
        <div className="erp-theme-mode-row">
          <div style={{ minWidth: 0 }}>
            <Text strong>Dark Mode</Text>
            <Text type="secondary" style={{ display: 'block', fontSize: 12 }}>
              Indigo dark dashboard appearance
            </Text>
          </div>
          <Switch
            checked={draft.mode === 'dark'}
            checkedChildren="ON"
            unCheckedChildren="OFF"
            aria-label="Toggle dark mode"
            onChange={(checked) => setMode(checked ? 'dark' : 'light')}
          />
        </div>

        <div className="erp-palette-head">
          <Text strong>Color Palette</Text>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {PALETTES.length} presets
          </Text>
        </div>

        <RoleLegend mode={draft.mode} paletteId={draft.paletteId} />

        <div
          className="erp-swatch-grid"
          role="radiogroup"
          aria-label="Color palette"
        >
          {PALETTES.map((palette) => {
            const selected = draft.paletteId === palette.id;
            const roles = resolveRoles(palette, draft.mode);
            return (
              <Tooltip key={palette.id} title={palette.name} mouseEnterDelay={0.3}>
                <button
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  aria-label={`${palette.name} palette`}
                  className={`erp-swatch${selected ? ' erp-swatch-selected' : ''}`}
                  onClick={() => setPalette(palette.id)}
                >
                  <span
                    className="erp-swatch-seg"
                    style={{ background: roles.primary }}
                    aria-hidden="true"
                  />
                  <span
                    className="erp-swatch-seg"
                    style={{ background: roles.surface }}
                    aria-hidden="true"
                  />
                  <span
                    className="erp-swatch-seg"
                    style={{ background: roles.accent }}
                    aria-hidden="true"
                  />
                  {selected && (
                    <CheckOutlined className="erp-swatch-check" aria-hidden="true" />
                  )}
                </button>
              </Tooltip>
            );
          })}
        </div>
      </div>

      <Divider style={{ margin: 0 }} />

      <div className="erp-theme-panel-footer">
        <Button icon={<ReloadOutlined />} onClick={handleReset}>
          Reset
        </Button>
        <Button type="primary" icon={<CheckOutlined />} onClick={handleApply}>
          Apply
        </Button>
      </div>
    </div>
  );
};

export default ThemePreferences;
