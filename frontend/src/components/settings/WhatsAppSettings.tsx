import React, { useState, useEffect, useMemo } from 'react';
import { Button, Input, Tag, Tooltip, message, theme } from 'antd';
import {
  MessageOutlined,
  GlobalOutlined,
  SaveOutlined,
  UndoOutlined,
  SearchOutlined,
} from '@ant-design/icons';
import { usePermission } from '../../hooks/usePermission';
import { SETTINGS_PERMISSIONS } from './settingsNavigationConfig';
import {
  WHATSAPP_TEMPLATE_REGISTRY,
  buildDefaultWhatsAppTemplatesMap,
  readWhatsAppSettings,
  saveWhatsAppSettings,
  WhatsAppTemplateCategory,
  WhatsAppTemplateKey,
} from '../../utils/whatsappTemplateRenderer';
import './whatsAppSettings.css';

const { TextArea } = Input;

export interface WhatsAppTemplateItem {
  id: string;
  name: string;
  template: string;
}

export interface WhatsAppSettingsData {
  countryCode: string;
  templates: Record<WhatsAppTemplateKey, string>;
}

const DEFAULT_WHATSAPP_SETTINGS: WhatsAppSettingsData = {
  countryCode: '92',
  templates: buildDefaultWhatsAppTemplatesMap(),
};

const CATEGORIES_ORDER: readonly WhatsAppTemplateCategory[] = [
  'Raw Material & Inventory',
  'Sales, Dispatch & Receivables',
  'Procurement',
  'Production & Packing',
  'Maintenance & Quality (QMS)',
  'AI Assistant & System',
];

export const WhatsAppSettings: React.FC = () => {
  const { token } = theme.useToken();
  const { can } = usePermission();
  const canEdit = can(SETTINGS_PERMISSIONS.sensitive);

  const [data, setData] = useState<WhatsAppSettingsData>(DEFAULT_WHATSAPP_SETTINGS);
  const [initialData, setInitialData] = useState<WhatsAppSettingsData>(DEFAULT_WHATSAPP_SETTINGS);
  const [hasChanges, setHasChanges] = useState(false);
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');

  useEffect(() => {
    const parsed = readWhatsAppSettings();
    const merged: WhatsAppSettingsData = {
      countryCode: parsed.countryCode || DEFAULT_WHATSAPP_SETTINGS.countryCode,
      templates: {
        ...DEFAULT_WHATSAPP_SETTINGS.templates,
        ...(parsed.templates as Partial<Record<WhatsAppTemplateKey, string>>),
      },
    };
    setData(merged);
    setInitialData(merged);
  }, []);

  useEffect(() => {
    const isDifferent = JSON.stringify(data) !== JSON.stringify(initialData);
    setHasChanges(isDifferent);
  }, [data, initialData]);

  const filteredRegistry = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return WHATSAPP_TEMPLATE_REGISTRY.filter((item) => {
      if (selectedCategory !== 'ALL' && item.category !== selectedCategory) {
        return false;
      }
      if (!q) return true;
      return (
        item.title.toLowerCase().includes(q) ||
        item.code.toLowerCase().includes(q) ||
        item.key.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q) ||
        item.placeholders.some((p) => p.toLowerCase().includes(q))
      );
    });
  }, [searchQuery, selectedCategory]);

  const groupedTemplates = useMemo(() => {
    return CATEGORIES_ORDER.map((category) => ({
      category,
      items: filteredRegistry.filter((item) => item.category === category),
    })).filter((group) => group.items.length > 0);
  }, [filteredRegistry]);

  const handleCountryCodeChange = (val: string) => {
    if (!canEdit) return;
    setData((prev) => ({ ...prev, countryCode: val }));
  };

  const handleTemplateChange = (key: WhatsAppTemplateKey, val: string) => {
    if (!canEdit) return;
    setData((prev) => ({
      ...prev,
      templates: {
        ...prev.templates,
        [key]: val,
      },
    }));
  };

  const handleInsertPlaceholder = (key: WhatsAppTemplateKey, placeholder: string) => {
    if (!canEdit) {
      if (navigator?.clipboard?.writeText) {
        navigator.clipboard.writeText(placeholder).catch(() => {});
        message.info(`Copied ${placeholder}`);
      }
      return;
    }
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(placeholder).catch(() => {});
    }
    setData((prev) => {
      const current = prev.templates[key] || '';
      const separator = current && !current.endsWith(' ') && !current.endsWith('\n') ? ' ' : '';
      return {
        ...prev,
        templates: {
          ...prev.templates,
          [key]: `${current}${separator}${placeholder}`,
        },
      };
    });
    message.success(`Inserted ${placeholder}`);
  };

  const handleResetSingleTemplate = (key: WhatsAppTemplateKey, defaultVal: string) => {
    if (!canEdit) return;
    handleTemplateChange(key, defaultVal);
    message.info('Template restored to default wording. Click Save WhatsApp Settings to apply.');
  };

  const handleSave = () => {
    setSaving(true);
    try {
      saveWhatsAppSettings(data);
      setSaving(false);
      setInitialData(data);
      setHasChanges(false);
      message.success('WhatsApp templates and settings saved. Changes are active across the ERP immediately.');
    } catch {
      setSaving(false);
      message.error('Failed to save WhatsApp settings.');
    }
  };

  const handleReset = () => {
    setData(initialData);
    setHasChanges(false);
    message.info('Unsaved changes discarded.');
  };

  const handleRestoreDefaults = () => {
    if (!canEdit) return;
    setData(DEFAULT_WHATSAPP_SETTINGS);
    message.info('All default templates loaded. Click Save WhatsApp Settings to apply.');
  };

  return (
    <div
      className="whatsapp-settings-container"
      data-testid="whatsapp-settings"
      data-edit-permission={SETTINGS_PERMISSIONS.sensitive}
      id="whatsapp-settings-section"
    >
      {/* Hidden test identifier for test backwards-compatibility */}
      <span
        data-testid="settings-placeholder-whatsapp"
        style={{ display: 'none' }}
        data-edit-permission={SETTINGS_PERMISSIONS.sensitive}
      >
        <span data-testid="settings-placeholder-permission">
          {canEdit
            ? `Your role includes “${SETTINGS_PERMISSIONS.sensitive}”.`
            : `Read-only for your role: requires “${SETTINGS_PERMISSIONS.sensitive}”.`}
        </span>
      </span>

      {/* ── 1. Phone numbers & Country code ── */}
      <div className="wa-settings-card">
        <div className="wa-settings-card-header">
          <div className="wa-settings-header-left">
            <h3 className="wa-settings-card-title">
              <GlobalOutlined className="wa-settings-card-title-icon" />
              Phone Numbers & Country Code
            </h3>
            <p className="wa-settings-card-desc">
              Local numbers like <code>0300 1234567</code> automatically receive this country code prefix. Numbers saved with <code>+</code> or international prefix are used as entered.
            </p>
          </div>
        </div>

        <div className="wa-field-group wa-country-code-field">
          <label className="wa-field-label">
            <GlobalOutlined className="wa-field-icon" />
            Default Country Code
          </label>
          <Input
            value={data.countryCode}
            onChange={(e) => handleCountryCodeChange(e.target.value)}
            placeholder="92"
            size="large"
            disabled={!canEdit}
            className="wa-glowing-input wa-country-input"
          />
        </div>
      </div>

      {/* ── 2. Unified ERP Message Templates Registry ── */}
      <div className="wa-settings-card">
        <div className="wa-settings-card-header">
          <h3 className="wa-settings-card-title">
            <MessageOutlined className="wa-settings-card-title-icon" />
            Centralized ERP WhatsApp Message Templates ({WHATSAPP_TEMPLATE_REGISTRY.length})
          </h3>
          <p className="wa-settings-card-desc">
            Controls 100% of WhatsApp share messages across Raw Material Receiving, Store Ledgers, Sales, Dispatch, Receivables, Procurement, Production, Packing, Maintenance, QMS, and AI Assistant. Edit wording, reorder placeholders, or remove any icons/formatting freely — leaving a box blank restores its clean default template.
          </p>

          <div className="wa-filter-toolbar">
            <div className="wa-category-pills">
              <Button
                size="small"
                type={selectedCategory === 'ALL' ? 'primary' : 'default'}
                onClick={() => setSelectedCategory('ALL')}
              >
                All ({WHATSAPP_TEMPLATE_REGISTRY.length})
              </Button>
              {CATEGORIES_ORDER.map((cat) => {
                const count = WHATSAPP_TEMPLATE_REGISTRY.filter((t) => t.category === cat).length;
                return (
                  <Button
                    key={cat}
                    size="small"
                    type={selectedCategory === cat ? 'primary' : 'default'}
                    onClick={() => setSelectedCategory(cat)}
                  >
                    {cat} ({count})
                  </Button>
                );
              })}
            </div>

            <Input
              allowClear
              prefix={<SearchOutlined style={{ color: token.colorTextTertiary }} />}
              placeholder="Search by code (e.g. [RM-GP]), module, or {placeholder}..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ maxWidth: 340 }}
              data-testid="wa-template-search"
            />
          </div>
        </div>

        {groupedTemplates.map((group) => (
          <div key={group.category} className="wa-category-section">
            <h4 className="wa-category-heading">
              <span>{group.category}</span>
              <Tag color="processing">{group.items.length} Templates</Tag>
            </h4>

            <div className="wa-templates-grid">
              {group.items.map((cfg) => (
                <div
                  key={cfg.key}
                  className="wa-template-box"
                  data-testid={`wa-card-${cfg.key}`}
                >
                  <div className="wa-template-header-row">
                    <div>
                      <label className="wa-template-label">
                        <MessageOutlined className="wa-field-icon" />
                        <span>{cfg.title}</span>
                        <Tag
                          color="blue"
                          style={{ marginInlineEnd: 0, fontFamily: 'monospace', fontWeight: 700 }}
                        >
                          {cfg.code}
                        </Tag>
                      </label>
                      <p className="wa-template-desc">{cfg.description}</p>
                    </div>
                    {canEdit && data.templates[cfg.key] !== cfg.defaultTemplate && (
                      <Button
                        type="link"
                        size="small"
                        onClick={() => handleResetSingleTemplate(cfg.key, cfg.defaultTemplate)}
                        style={{ padding: 0, height: 'auto', fontSize: 12 }}
                      >
                        Reset
                      </Button>
                    )}
                  </div>

                  <TextArea
                    rows={cfg.rows}
                    value={data.templates[cfg.key] ?? cfg.defaultTemplate}
                    onChange={(e) => handleTemplateChange(cfg.key, e.target.value)}
                    disabled={!canEdit}
                    className="wa-glowing-input"
                    data-testid={`wa-template-${cfg.key}`}
                    placeholder={`Enter custom template for ${cfg.title} ${cfg.code}...`}
                  />

                  <div className="wa-placeholders-footer">
                    <span className="wa-placeholders-caption">
                      Supported Placeholders (click to insert):
                    </span>
                    <div className="wa-variables-row">
                      {cfg.placeholders.map((tag) => (
                        <Tooltip key={tag} title={`Click to insert ${tag}`}>
                          <Tag
                            className="wa-variable-tag"
                            color="geekblue"
                            onClick={() => handleInsertPlaceholder(cfg.key, tag)}
                          >
                            {tag}
                          </Tag>
                        </Tooltip>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* ── Action Bar ── */}
      <div className="wa-action-bar">
        <Button
          icon={<UndoOutlined />}
          size="large"
          disabled={!canEdit || saving}
          onClick={handleRestoreDefaults}
          className="wa-btn-secondary"
        >
          Reset All to Defaults
        </Button>
        <Button
          icon={<UndoOutlined />}
          size="large"
          disabled={!hasChanges || saving}
          onClick={handleReset}
          className="wa-btn-secondary"
        >
          Discard Changes
        </Button>
        <Button
          type="primary"
          icon={<SaveOutlined />}
          size="large"
          loading={saving}
          onClick={handleSave}
          disabled={!canEdit}
          className="wa-save-btn"
          data-testid="wa-save-settings-btn"
        >
          Save WhatsApp Settings
        </Button>
      </div>
    </div>
  );
};

export default WhatsAppSettings;
