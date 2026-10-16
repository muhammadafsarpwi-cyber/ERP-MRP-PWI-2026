import React, { useEffect } from 'react';
import { App } from 'antd';
import { BgColorsOutlined } from '@ant-design/icons';
import {
  AppearanceActions,
  AppearanceControls,
} from '../../theme/AppearanceControls';
import { selectIsDirty, useThemeStore } from '../../theme/themeStore';
import './settings.css';

/**
 * System Settings › Appearance.
 *
 * A second, permanent home for exactly the same controls the header gear
 * opens as a pop-up — mode, the 4-step Corner Style matrix, the
 * glassmorphism blur / opacity sliders, curated palette swatches and the
 * WCAG-checked custom accent picker. Same shared `AppearanceControls` panel,
 * same zustand draft store, so a user who customises from either entry point
 * gets an identical result.
 *
 * Persistence is explicit: changes preview live across the ERP, "Save
 * Changes" writes them to localStorage, and leaving the page with unsaved
 * tweaks discards them rather than stranding a half-applied theme.
 */
const AppearanceSettings: React.FC = () => {
  const { message } = App.useApp();
  const isDirty = useThemeStore(selectIsDirty);
  const applyDraft = useThemeStore((state) => state.applyDraft);
  const revertDraft = useThemeStore((state) => state.revertDraft);

  // Leaving with unsaved tweaks reverts them — "Apply & Save" stays the only
  // thing that persists. Guarded so the no-op case costs nothing.
  useEffect(() => {
    return () => {
      if (selectIsDirty(useThemeStore.getState())) {
        useThemeStore.getState().revertDraft();
      }
    };
  }, []);

  const handleSave = () => {
    applyDraft();
    message.success('Appearance settings saved');
  };

  const handleDiscard = () => {
    revertDraft();
    message.info('Appearance changes discarded');
  };

  return (
    <div className="erp-settings-appearance" data-testid="appearance-settings">
      <div className="erp-appearance-page-head">
        <div className="erp-appearance-page-icon">
          <BgColorsOutlined />
        </div>
        <div>
          <h2 className="erp-appearance-page-title">Appearance</h2>
          <p className="erp-appearance-page-desc">
            Fine-grained control over how the ERP looks. Every change previews
            live across the header, navigation sider, dashboard cards, filter
            sheets and analytical widgets, and is saved per user. Tables, data
            grids and print layouts always keep their solid, high-contrast
            surfaces.
          </p>
        </div>
      </div>

      <div className="erp-appearance-card">
        <AppearanceControls />
        <div style={{ marginTop: 18 }}>
          <AppearanceActions
            onApply={handleSave}
            applyLabel="Save Changes"
            onCancel={isDirty ? handleDiscard : undefined}
            cancelLabel="Discard"
          />
        </div>
      </div>

      <p className="erp-appearance-section-hint" style={{ margin: 0 }}>
        Looking for the full 39-palette library? Open the theme customizer from
        the header or use “More theme options” above.
      </p>
    </div>
  );
};

export default AppearanceSettings;
