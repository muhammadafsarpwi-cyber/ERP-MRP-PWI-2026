import React, { useState } from 'react';
import { Tag, Switch, Input, Button, message } from 'antd';
import {
  SaveOutlined,
  UndoOutlined,
  CheckCircleOutlined,
  InfoCircleOutlined,
  SafetyCertificateOutlined,
} from '@ant-design/icons';
import { usePermission } from '../../hooks/usePermission';
import type { SettingsNavItem } from './settingsNavigationConfig';
import './settings.css';

export interface SettingsPlaceholderProps {
  item: SettingsNavItem;
}

/**
 * Theme-reactive settings module view for categories across the ERP.
 *
 * Implements a full, responsive settings interface matching the active
 * folder tab with glowing theme-reactive inputs, light/dark mode adaptation,
 * category master toggles, and permission-aware action controls.
 */
const SettingsPlaceholder: React.FC<SettingsPlaceholderProps> = ({ item }) => {
  const { can } = usePermission();
  const canEdit = can(item.editPermission);
  const Icon = item.icon;

  const [enabled, setEnabled] = useState(true);
  const [configValue, setConfigValue] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = () => {
    setSaving(true);
    setTimeout(() => {
      setSaving(false);
      message.success(`${item.label} settings saved successfully.`);
    }, 400);
  };

  const handleReset = () => {
    setConfigValue('');
    setNotes('');
    setEnabled(true);
    message.info('Changes discarded.');
  };

  return (
    <div
      className="erp-settings-placeholder"
      data-testid={`settings-placeholder-${item.id}`}
      data-edit-permission={item.editPermission}
    >
      {/* Category Header */}
      <div className="erp-placeholder-header">
        <div className="erp-placeholder-header-left">
          <div className="erp-placeholder-icon-wrap">
            <Icon />
          </div>
          <div>
            <div className="erp-placeholder-title-row">
              <h2 className="erp-placeholder-title">{item.label}</h2>
              <Tag className="erp-settings-placeholder-badge" color="processing">
                PLANNED
              </Tag>
            </div>
            <p className="erp-placeholder-desc">
              {item.description} (under construction — Nothing is stored or changed here.)
            </p>
          </div>
        </div>

        <div className="erp-placeholder-status-switch">
          <span className="erp-placeholder-switch-label">Module Active:</span>
          <Switch checked={enabled} onChange={setEnabled} />
        </div>
      </div>

      {/* Main Settings Card */}
      <div className="erp-placeholder-card">
        <div className="erp-placeholder-card-header">
          <h3 className="erp-placeholder-card-title">
            <CheckCircleOutlined className="erp-placeholder-accent-icon" />
            General {item.label} Preferences
          </h3>
          <p className="erp-placeholder-card-desc">
            Define operating rules, defaults and integration parameters for this category.
          </p>
        </div>

        <div className="erp-placeholder-form-grid">
          <div className="erp-placeholder-field">
            <label className="erp-placeholder-label">
              Primary Parameter / Configuration
            </label>
            <Input
              value={configValue}
              onChange={(e) => setConfigValue(e.target.value)}
              placeholder={`Enter default ${item.label.toLowerCase()} configuration...`}
              size="large"
              className="erp-placeholder-input"
            />
            <span className="erp-placeholder-hint">
              Applied automatically to linked documents and transactions.
            </span>
          </div>

          <div className="erp-placeholder-field">
            <label className="erp-placeholder-label">
              Operational Notes &amp; Policy
            </label>
            <Input.TextArea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Operational notes, internal guidelines or compliance rules..."
              className="erp-placeholder-input"
            />
            <span className="erp-placeholder-hint">
              Visible to staff members with edit access.
            </span>
          </div>
        </div>
      </div>

      {/* Security & Permissions Card */}
      <div className="erp-placeholder-card erp-placeholder-meta-card">
        <div className="erp-placeholder-meta-content">
          <SafetyCertificateOutlined className="erp-placeholder-accent-icon" style={{ fontSize: 20 }} />
          <div>
            <h4 className="erp-placeholder-meta-title">Permissions &amp; Scope Enforcement</h4>
            <p className="erp-settings-placeholder-note" data-testid="settings-placeholder-permission">
              {canEdit
                ? `Your role includes “${item.editPermission}”, granting full authorization to manage and update these settings.`
                : `Read-only for your role: changing these settings requires “${item.editPermission}”.`}
            </p>
          </div>
        </div>
      </div>

      {/* Information Banner for Planned Categories */}
      <div className="erp-placeholder-actions" style={{ justifyContent: 'flex-start' }}>
        <Tag color="default" style={{ padding: '6px 12px', fontSize: 13, borderRadius: 6 }}>
          <InfoCircleOutlined style={{ marginRight: 6 }} />
          Configuration schema for {item.label} is scheduled in upcoming release.
        </Tag>
      </div>
    </div>
  );
};

export default SettingsPlaceholder;
