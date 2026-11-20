import React, { useState, useEffect } from 'react';
import { Button, Input, Tag, message } from 'antd';
import {
  MessageOutlined,
  GlobalOutlined,
  SaveOutlined,
  UndoOutlined,
  FileTextOutlined,
  InboxOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import { usePermission } from '../../hooks/usePermission';
import { SETTINGS_PERMISSIONS } from './settingsNavigationConfig';
import { DEFAULT_FLEET_TEMPLATE } from '../../pages/production/entries/deptFleetWhatsApp';
import {
  DEFAULT_DAILY_PRODUCTION_REPORT_TEMPLATE,
  DEFAULT_DIRECTOR_SUMMARY_TEMPLATE,
  DEFAULT_DIRECTOR_SUMMARY_DEPT_TEMPLATE,
} from '../../pages/production/entries/dailyProductionReport';
import { DEFAULT_RM_RECEIPT_TEMPLATE, DEFAULT_RM_RETURN_TEMPLATE } from '../../utils/receiptShare';
import { DEFAULT_RM_SUMMARY_TEMPLATE } from '../../pages/production/receiving/rawMaterialReceivingPdf';
import {
  DEFAULT_PACKING_CUSTOMER_DISPATCH_TEMPLATE,
  DEFAULT_PACKING_DAILY_REPORT_TEMPLATE,
  DEFAULT_PACKING_FGR_STOCK_TEMPLATE,
  DEFAULT_PACKING_NIPPLE_DEFICIT_TEMPLATE,
} from '../../pages/production/packing/packingWhatsApp';
import { DEFAULT_ITEM_LEDGER_WHATSAPP_TEMPLATE } from '../../utils/itemLedgerExport';
import { DEFAULT_JOB_CARD_WHATSAPP_TEMPLATE } from '../../utils/jobCardShare';
import { DEFAULT_QMS_INSPECTION_WHATSAPP_TEMPLATE } from '../../pages/qc/exportQmsWhatsApp';
import {
  WHATSAPP_SETTINGS_STORAGE_KEY,
  dispatchWhatsAppSettingsUpdated,
} from '../../utils/whatsappSettingsStore';
import './whatsAppSettings.css';

const { TextArea } = Input;

export interface WhatsAppTemplateItem {
  id: string;
  name: string;
  template: string;
}

const DEFAULT_PRODUCTION_DOWNTIME_TEMPLATE = [
  '*🏭 Pakistan Wire Industries (Pvt.) LTD*',
  '*Daily Production & Downtime Report*',
  '📅 Date: {date} ({weekday})',
  '━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
  '⚙️ Total Running Time (RT): {running_hours}',
  '🛑 Total Downtime (DT): {downtime_hours}',
  '⏱️ Total Shift Time: {total_time}',
  '📊 Downtime Rate: {downtime_rate}',
  '⚠️ Dominant Stoppage: {top_reason}',
  '━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
  '*Department-Wise Breakdown:*',
  '{department_rows}',
  '━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
  '_Generated via PWI ERP System_',
].join('\n');

const DEFAULT_PRODUCTION_INVENTORY_TEMPLATE = [
  '*{company}*',
  '*{title}*',
  'Division: {division}',
  'Department: {department}',
  'Date Range: {date}',
  '-----------------------------',
  '*Total Items:* {total_items}',
  '*On Hand Stock:* {on_hand}',
  '*Available Stock:* {available}',
  '*Total IN (range):* {total_in}',
  '*Total OUT (range):* {total_out}',
  '*Produced:* {produced}',
  '*Required:* {required}',
  '*Short Items:* {short_items}',
  '-----------------------------',
  '_Generated via PWI ERP System_',
].join('\n');

export interface WhatsAppSettingsData {
  countryCode: string;
  templates: {
    invoice: string;
    reminder: string;
    quotation: string;
    statement: string;
    receipt: string;
    rmReceipt: string;
    rmSummary: string;
    rmReturn: string;
    dailyProductionFleet: string;
    dailyProductionReport: string;
    dailyProductionDirectorSummary: string;
    dailyProductionDirectorDeptBlock: string;
    productionDowntime: string;
    productionInventoryReport: string;
    packingCustomerDispatch: string;
    packingDailyProduction: string;
    packingFgrStock: string;
    packingNippleDeficit: string;
    itemStockLedger: string;
    maintenanceJobCard: string;
    qmsInspection: string;
  };
}

const DEFAULT_WHATSAPP_SETTINGS: WhatsAppSettingsData = {
  countryCode: '92',
  templates: {
    invoice: '{amount}, due on {due_date}.\n\nView and download: {link}\n\nThank you,\n{company}',
    reminder: 'Dear {customer},\n\nA friendly reminder that {balance} is still due on invoice {doc_no} (due {due_date}).',
    quotation: 'Dear {customer},\n\nHere is quotation {doc_no} for {amount}, valid until {due_date}.\n\nView, accept or decline: {link}',
    statement: 'Dear {customer},\n\nYour account balance with {company} is {balance} as of {date}.\n\nPlease reach out if anything looks incorrect.',
    receipt: 'Dear {customer},\n\nWe have received {amount} (receipt {doc_no}) on {date}. Thank you!\n\n{company}',
    rmReceipt: DEFAULT_RM_RECEIPT_TEMPLATE,
    rmSummary: DEFAULT_RM_SUMMARY_TEMPLATE,
    rmReturn: DEFAULT_RM_RETURN_TEMPLATE,
    dailyProductionFleet: DEFAULT_FLEET_TEMPLATE,
    dailyProductionReport: DEFAULT_DAILY_PRODUCTION_REPORT_TEMPLATE,
    dailyProductionDirectorSummary: DEFAULT_DIRECTOR_SUMMARY_TEMPLATE,
    dailyProductionDirectorDeptBlock: DEFAULT_DIRECTOR_SUMMARY_DEPT_TEMPLATE,
    productionDowntime: DEFAULT_PRODUCTION_DOWNTIME_TEMPLATE,
    productionInventoryReport: DEFAULT_PRODUCTION_INVENTORY_TEMPLATE,
    packingCustomerDispatch: DEFAULT_PACKING_CUSTOMER_DISPATCH_TEMPLATE,
    packingDailyProduction: DEFAULT_PACKING_DAILY_REPORT_TEMPLATE,
    packingFgrStock: DEFAULT_PACKING_FGR_STOCK_TEMPLATE,
    packingNippleDeficit: DEFAULT_PACKING_NIPPLE_DEFICIT_TEMPLATE,
    itemStockLedger: DEFAULT_ITEM_LEDGER_WHATSAPP_TEMPLATE,
    maintenanceJobCard: DEFAULT_JOB_CARD_WHATSAPP_TEMPLATE,
    qmsInspection: DEFAULT_QMS_INSPECTION_WHATSAPP_TEMPLATE,
  },
};

const STORAGE_KEY = WHATSAPP_SETTINGS_STORAGE_KEY;

const TAG_VARIABLES = [
  '{customer}',
  '{company}',
  '{doc_no}',
  '{amount}',
  '{balance}',
  '{due_date}',
  '{date}',
  '{link}',
  '{receipt_code}',
  '{gate_pass_no}',
  '{source_no}',
  '{heat_number}',
  '{warehouse}',
  '{division}',
  '{section}',
  '{items}',
  '{total_gp_qty}',
  '{total_rcv_qty}',
  '{net_variance}',
  '{department}',
  '{shift}',
  '{fleet_status}',
  '{total_production}',
  '{overall_achievement}',
  '{machine_rows}',
  '{item_summary}',
  '{department_blocks}',
  '{index}',
  '{target}',
  '{actual}',
  '{achievement}',
  '{part_rejection}',
  '{process_scrap}',
  '{item_rows}',
];

const PROD_DIR_MAIN_PLACEHOLDERS = ['{division}', '{date}', '{department_blocks}'];
const PROD_DIR_DEPT_PLACEHOLDERS = [
  '{index}',
  '{department}',
  '{target}',
  '{actual}',
  '{achievement}',
  '{part_rejection}',
  '{process_scrap}',
  '{item_rows}',
];

export const WhatsAppSettings: React.FC = () => {
  const { can } = usePermission();
  const canEdit = can(SETTINGS_PERMISSIONS.sensitive);

  const [data, setData] = useState<WhatsAppSettingsData>(DEFAULT_WHATSAPP_SETTINGS);
  const [initialData, setInitialData] = useState<WhatsAppSettingsData>(DEFAULT_WHATSAPP_SETTINGS);
  const [hasChanges, setHasChanges] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        const merged: WhatsAppSettingsData = {
          countryCode: parsed.countryCode || DEFAULT_WHATSAPP_SETTINGS.countryCode,
          templates: {
            ...DEFAULT_WHATSAPP_SETTINGS.templates,
            ...(parsed.templates || {}),
          },
        };
        setData(merged);
        setInitialData(merged);
      }
    } catch {
      // fallback
    }
  }, []);

  useEffect(() => {
    const isDifferent = JSON.stringify(data) !== JSON.stringify(initialData);
    setHasChanges(isDifferent);
  }, [data, initialData]);

  const handleCountryCodeChange = (val: string) => {
    if (!canEdit) return;
    setData((prev) => ({ ...prev, countryCode: val }));
  };

  const handleTemplateChange = (key: keyof WhatsAppSettingsData['templates'], val: string) => {
    if (!canEdit) return;
    setData((prev) => ({
      ...prev,
      templates: {
        ...prev.templates,
        [key]: val,
      },
    }));
  };

  const handleSave = () => {
    setSaving(true);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      dispatchWhatsAppSettingsUpdated();
      setTimeout(() => {
        setSaving(false);
        setInitialData(data);
        setHasChanges(false);
        message.success('WhatsApp templates and settings saved successfully.');
      }, 350);
    } catch {
      setSaving(false);
      message.error('Failed to save WhatsApp settings.');
    }
  };

  const handleReset = () => {
    setData(initialData);
    setHasChanges(false);
    message.info('Changes discarded.');
  };

  const handleRestoreDefaults = () => {
    if (!canEdit) return;
    setData(DEFAULT_WHATSAPP_SETTINGS);
    message.info('Default templates loaded. Click Save Changes to apply.');
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
              Phone numbers
            </h3>
            <p className="wa-settings-card-desc">
              Local numbers like <code>0300 1234567</code> get this country code in front. Numbers saved with + or 00 are used as they are.
            </p>
          </div>
        </div>

        <div className="wa-field-group wa-country-code-field">
          <label className="wa-field-label">
            <GlobalOutlined className="wa-field-icon" />
            Country code
          </label>
          <Input
            value={data.countryCode}
            onChange={(e) => handleCountryCodeChange(e.target.value)}
            placeholder="92"
            size="large"
            className="wa-glowing-input wa-country-input"
          />
        </div>
      </div>

      {/* ── 2. Message templates ── */}
      <div className="wa-settings-card">
        <div className="wa-settings-card-header">
          <h3 className="wa-settings-card-title">
            <MessageOutlined className="wa-settings-card-title-icon" />
            Message templates
          </h3>
          <p className="wa-settings-card-desc">
            Used by the WhatsApp buttons. Leave one empty to use the default wording.
          </p>

          {/* Variables Pills */}
          <div className="wa-variables-row">
            {TAG_VARIABLES.map((tag) => (
              <Tag key={tag} className="wa-variable-tag">
                {tag}
              </Tag>
            ))}
          </div>
        </div>

        {/* Templates Grid */}
        <div className="wa-templates-grid">
          {/* Invoice */}
          <div className="wa-template-box">
            <label className="wa-template-label">
              <MessageOutlined className="wa-field-icon" />
              Invoice
            </label>
            <TextArea
              rows={5}
              value={data.templates.invoice}
              onChange={(e) => handleTemplateChange('invoice', e.target.value)}
              className="wa-glowing-input"
            />
          </div>

          {/* Payment reminder */}
          <div className="wa-template-box">
            <label className="wa-template-label">
              <MessageOutlined className="wa-field-icon" />
              Payment reminder
            </label>
            <TextArea
              rows={5}
              value={data.templates.reminder}
              onChange={(e) => handleTemplateChange('reminder', e.target.value)}
              className="wa-glowing-input"
            />
          </div>

          {/* Quotation */}
          <div className="wa-template-box">
            <label className="wa-template-label">
              <MessageOutlined className="wa-field-icon" />
              Quotation
            </label>
            <TextArea
              rows={5}
              value={data.templates.quotation}
              onChange={(e) => handleTemplateChange('quotation', e.target.value)}
              className="wa-glowing-input"
            />
          </div>

          {/* Statement */}
          <div className="wa-template-box">
            <label className="wa-template-label">
              <MessageOutlined className="wa-field-icon" />
              Statement
            </label>
            <TextArea
              rows={5}
              value={data.templates.statement}
              onChange={(e) => handleTemplateChange('statement', e.target.value)}
              className="wa-glowing-input"
            />
          </div>

          {/* Payment receipt */}
          <div className="wa-template-box">
            <label className="wa-template-label">
              <MessageOutlined className="wa-field-icon" />
              Payment receipt
            </label>
            <TextArea
              rows={5}
              value={data.templates.receipt}
              onChange={(e) => handleTemplateChange('receipt', e.target.value)}
              className="wa-glowing-input"
            />
          </div>

          {/* Raw Material Receipt (Gate Pass) - RM-GP */}
          <div className="wa-template-box" style={{ gridColumn: 'span 2' }}>
            <label className="wa-template-label">
              <InboxOutlined className="wa-field-icon" />
              Raw Material Receipt (Gate Pass) — [RM-GP]
            </label>
            <TextArea
              rows={6}
              value={data.templates.rmReceipt}
              onChange={(e) => handleTemplateChange('rmReceipt', e.target.value)}
              className="wa-glowing-input"
              placeholder="Template for Gate Pass receipt share in Raw Material Receiving..."
            />
          </div>

          {/* Raw Material Summary */}
          <div className="wa-template-box" style={{ gridColumn: 'span 2' }}>
            <label className="wa-template-label">
              <FileTextOutlined className="wa-field-icon" />
              Raw Material Receiving Summary (Executive Breakdown)
            </label>
            <TextArea
              rows={5}
              value={data.templates.rmSummary}
              onChange={(e) => handleTemplateChange('rmSummary', e.target.value)}
              className="wa-glowing-input"
              placeholder="Template for overall receiving summary WhatsApp message..."
            />
          </div>

          {/* Daily Shift Production Report (Department Fleet) — [PROD-FLEET] */}
          <div className="wa-template-box" style={{ gridColumn: 'span 2' }}>
            <label className="wa-template-label">
              <ThunderboltOutlined className="wa-field-icon" style={{ color: '#10b981' }} />
              Daily Shift Production Report (Department Fleet) — [PROD-FLEET]
            </label>
            <TextArea
              rows={9}
              value={data.templates.dailyProductionFleet}
              onChange={(e) => handleTemplateChange('dailyProductionFleet', e.target.value)}
              className="wa-glowing-input"
              placeholder="Template for Daily Production Shift Report WhatsApp share..."
            />
          </div>

          {/* Daily Production Summary (Director Executive Breakdown) — [PROD-DIR-SUMMARY] */}
          <div className="wa-template-box" style={{ gridColumn: 'span 2' }}>
            <label className="wa-template-label">
              <FileTextOutlined className="wa-field-icon" style={{ color: '#10b981' }} />
              Daily Production Summary (Director Executive Breakdown) — [PROD-DIR-SUMMARY]
            </label>
            <div className="wa-variables-row" style={{ marginTop: 0 }}>
              {PROD_DIR_MAIN_PLACEHOLDERS.map((tag) => (
                <Tag key={tag} className="wa-variable-tag">
                  {tag}
                </Tag>
              ))}
            </div>
            <TextArea
              rows={7}
              value={data.templates.dailyProductionDirectorSummary}
              onChange={(e) => handleTemplateChange('dailyProductionDirectorSummary', e.target.value)}
              className="wa-glowing-input"
              placeholder="Main template for Director Daily Production Summary..."
            />
          </div>

          {/* Secondary Sub-Template: Department Block Format — [PROD-DIR-SUMMARY] */}
          <div className="wa-template-box" style={{ gridColumn: 'span 2' }}>
            <label className="wa-template-label">
              <ThunderboltOutlined className="wa-field-icon" style={{ color: '#0284c7' }} />
              Department Block Format (Sub-Template for {'{department_blocks}'})
            </label>
            <div className="wa-variables-row" style={{ marginTop: 0 }}>
              {PROD_DIR_DEPT_PLACEHOLDERS.map((tag) => (
                <Tag key={tag} className="wa-variable-tag">
                  {tag}
                </Tag>
              ))}
            </div>
            <span style={{ fontSize: 12, color: 'var(--wa-text-secondary)' }}>
              Each line inside <code>{'{item_rows}'}</code> renders cleanly as:{' '}
              <code>{'  ▪ {item_code} ({item_name}): *{good_qty}*'}</code>
            </span>
            <TextArea
              rows={7}
              value={data.templates.dailyProductionDirectorDeptBlock}
              onChange={(e) => handleTemplateChange('dailyProductionDirectorDeptBlock', e.target.value)}
              className="wa-glowing-input"
              placeholder="Sub-template for each department block inside Daily Production Summary..."
            />
          </div>

          {[
            {
              key: 'dailyProductionReport' as const,
              title: 'Daily Production Full Report (WhatsApp Modal) — [PROD-FULL]',
              rows: 6,
              placeholders: ['{company}', '{division}', '{date}', '{shift_suffix}', '{audited}', '{report_body}', '{generated_label}'],
            },
            {
              key: 'productionDowntime' as const,
              title: 'Daily Production & Downtime Report — [PROD-DT]',
              rows: 6,
              placeholders: ['{date}', '{weekday}', '{running_hours}', '{downtime_hours}', '{total_time}', '{downtime_rate}', '{top_reason}', '{department_rows}'],
            },
            {
              key: 'productionInventoryReport' as const,
              title: 'Production Inventory Report Summary — [PROD-INV]',
              rows: 6,
              placeholders: ['{company}', '{title}', '{division}', '{department}', '{date}', '{total_items}', '{on_hand}', '{available}', '{total_in}', '{total_out}', '{produced}', '{required}', '{short_items}'],
            },
            {
              key: 'packingDailyProduction' as const,
              title: 'Daily Packing Production & Dispatch Report — [PKG-DAILY]',
              rows: 6,
              placeholders: ['{company}', '{date}', '{time}', '{division}', '{shift}', '{batches}', '{total_pcs}', '{total_gross}', '{total_cartons}', '{total_weight}', '{day_progress}'],
            },
            {
              key: 'packingCustomerDispatch' as const,
              title: 'Customer Packed FG Inventory Dispatch Report — [PKG-CUST]',
              rows: 6,
              placeholders: ['{company}', '{date}', '{customer}', '{soc_line}', '{division}', '{items}', '{total_pcs}', '{total_gross}', '{total_cartons}', '{total_weight}', '{total_valuation}'],
            },
            {
              key: 'packingFgrStock' as const,
              title: 'FGR Finished Goods Warehouse Stock Report — [PKG-FGR]',
              rows: 6,
              placeholders: ['{company}', '{warehouse}', '{date}', '{time}', '{items}', '{total_pcs}', '{total_gross}', '{total_cartons}', '{total_weight}', '{total_valuation}'],
            },
            {
              key: 'packingNippleDeficit' as const,
              title: 'Pending Nipple Deficit Alert (Hand Packing) — [PKG-NIP]',
              rows: 6,
              placeholders: ['{date}', '{department}', '{distinct_items}', '{waiting_batches}', '{total_pending_cartons}', '{total_pending_gross}', '{total_pending_pcs}', '{total_packed_weight}', '{items}'],
            },
            {
              key: 'rmReturn' as const,
              title: 'Raw Material Return Note — [RM-RET]',
              rows: 6,
              placeholders: ['{company}', '{date}', '{return_code}', '{source_no}', '{ref_receipt}', '{warehouse}', '{division}', '{section}', '{reason}', '{items}', '{total_qty}'],
            },
            {
              key: 'itemStockLedger' as const,
              title: 'Item Stock Ledger & Audit Trail — [INV-LEDGER]',
              rows: 6,
              placeholders: ['{item_code}', '{item_name}', '{warehouse}', '{uom}', '{date}', '{total_in}', '{total_out}', '{current_balance}', '{movements_count}', '{recent_movements}'],
            },
            {
              key: 'maintenanceJobCard' as const,
              title: 'Maintenance Job Card Summary — [MNT-JC]',
              rows: 6,
              placeholders: ['{job_card_no}', '{status}', '{priority_line}', '{machine}', '{hierarchy_line}', '{location_line}', '{team_line}', '{complaint}', '{reported_by_line}', '{timings_section}', '{technicians_section}', '{parts_section}', '{actions_section}', '{generated_at}'],
            },
            {
              key: 'qmsInspection' as const,
              title: 'QMS In-Process Quality Inspection Report — [QMS-INSP]',
              rows: 6,
              placeholders: ['{doc_ref}', '{rev_no}', '{issue_date}', '{inspection_no}', '{division}', '{department}', '{date}', '{shift}', '{machine}', '{operator}', '{item_name}', '{item_code}', '{inspector}', '{approved_by_line}', '{samples_section}', '{attributes_section}', '{overall_result}', '{remarks}'],
            },
          ].map((cfg) => (
            <div key={cfg.key} className="wa-template-box" style={{ gridColumn: 'span 2' }}>
              <label className="wa-template-label">
                <MessageOutlined className="wa-field-icon" />
                {cfg.title}
              </label>
              <div className="wa-variables-row" style={{ marginTop: 0 }}>
                {cfg.placeholders.map((tag) => (
                  <Tag key={tag} className="wa-variable-tag">
                    {tag}
                  </Tag>
                ))}
              </div>
              <TextArea
                rows={cfg.rows}
                value={data.templates[cfg.key]}
                onChange={(e) => handleTemplateChange(cfg.key, e.target.value)}
                className="wa-glowing-input"
              />
            </div>
          ))}
        </div>
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
          Reset to Defaults
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
        >
          Save WhatsApp Settings
        </Button>
      </div>
    </div>
  );
};

export default WhatsAppSettings;
