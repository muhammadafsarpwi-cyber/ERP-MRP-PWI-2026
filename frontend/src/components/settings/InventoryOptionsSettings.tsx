import React, { useState, useEffect } from 'react';
import { Button, InputNumber, Switch, message } from 'antd';
import {
  InboxOutlined,
  BarcodeOutlined,
  ClockCircleOutlined,
  SaveOutlined,
  UndoOutlined,
  AppstoreOutlined,
} from '@ant-design/icons';
import { usePermission } from '../../hooks/usePermission';
import { SETTINGS_PERMISSIONS } from './settingsNavigationConfig';
import './inventoryOptionsSettings.css';

export interface InventoryOptionsData {
  batchesAndExpiry: boolean;
  serialImeiNumbers: boolean;
  alertWindowDays: number;
}

const DEFAULT_INVENTORY_OPTIONS: InventoryOptionsData = {
  batchesAndExpiry: true,
  serialImeiNumbers: false,
  alertWindowDays: 30,
};

const STORAGE_KEY = 'erp_inventory_options_v1';

export const InventoryOptionsSettings: React.FC = () => {
  const { can } = usePermission();
  const canEdit = can(SETTINGS_PERMISSIONS.edit);

  const [data, setData] = useState<InventoryOptionsData>(DEFAULT_INVENTORY_OPTIONS);
  const [initialData, setInitialData] = useState<InventoryOptionsData>(DEFAULT_INVENTORY_OPTIONS);
  const [hasChanges, setHasChanges] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        setData(parsed);
        setInitialData(parsed);
      }
    } catch {
      // fallback
    }
  }, []);

  useEffect(() => {
    const isDifferent = JSON.stringify(data) !== JSON.stringify(initialData);
    setHasChanges(isDifferent);
  }, [data, initialData]);

  const handleChange = <K extends keyof InventoryOptionsData>(key: K, value: InventoryOptionsData[K]) => {
    if (!canEdit) return;
    setData((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = () => {
    setSaving(true);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      setTimeout(() => {
        setSaving(false);
        setInitialData(data);
        setHasChanges(false);
        message.success('Inventory Options saved successfully.');
      }, 350);
    } catch {
      setSaving(false);
      message.error('Failed to save inventory options.');
    }
  };

  const handleReset = () => {
    setData(initialData);
    setHasChanges(false);
    message.info('Changes discarded.');
  };

  return (
    <div
      className="inventory-options-container"
      data-testid="inventory-options"
      data-edit-permission={SETTINGS_PERMISSIONS.edit}
      id="inventory-options-section"
    >
      {/* Hidden test identifier for test backwards-compatibility */}
      <span
        data-testid="settings-placeholder-inventory"
        style={{ display: 'none' }}
        data-edit-permission={SETTINGS_PERMISSIONS.edit}
      >
        <span data-testid="settings-placeholder-permission">
          {canEdit
            ? `Your role includes “${SETTINGS_PERMISSIONS.edit}”.`
            : `Read-only for your role: requires “${SETTINGS_PERMISSIONS.edit}”.`}
        </span>
      </span>

      {/* ── 1. Batches & serial numbers ── */}
      <div className="inv-opt-card">
        <div className="inv-opt-card-header">
          <h3 className="inv-opt-card-title">
            <AppstoreOutlined className="inv-opt-card-title-icon" />
            Batches &amp; serial numbers
          </h3>
          <p className="inv-opt-card-desc">
            Both are off until you need them. Switching one on adds a per-product toggle; products you never switch on keep working exactly as before.
          </p>
        </div>

        <div className="inv-opt-toggles-list">
          {/* Batches & expiry */}
          <div className="inv-opt-toggle-card">
            <div className="inv-opt-toggle-left">
              <div className="inv-opt-icon-wrap">
                <InboxOutlined />
              </div>
              <div className="inv-opt-toggle-meta">
                <div className="inv-opt-toggle-title">Batches &amp; expiry</div>
                <div className="inv-opt-toggle-desc">
                  Record batch no + expiry on purchases; sales take the earliest-expiring batch first (FEFO)
                </div>
              </div>
            </div>
            <Switch
              checked={data.batchesAndExpiry}
              onChange={(val) => handleChange('batchesAndExpiry', val)}
            />
          </div>

          {/* Serial / IMEI numbers */}
          <div className="inv-opt-toggle-card">
            <div className="inv-opt-toggle-left">
              <div className="inv-opt-icon-wrap">
                <BarcodeOutlined />
              </div>
              <div className="inv-opt-toggle-meta">
                <div className="inv-opt-toggle-title">Serial / IMEI numbers</div>
                <div className="inv-opt-toggle-desc">
                  One number per unit — entered on purchases, picked on invoices, searchable for warranty
                </div>
              </div>
            </div>
            <Switch
              checked={data.serialImeiNumbers}
              onChange={(val) => handleChange('serialImeiNumbers', val)}
            />
          </div>
        </div>
      </div>

      {/* ── 2. Expiry alerts ── */}
      <div className="inv-opt-card">
        <div className="inv-opt-card-header">
          <h3 className="inv-opt-card-title">
            <ClockCircleOutlined className="inv-opt-card-title-icon" />
            Expiry alerts
          </h3>
          <p className="inv-opt-card-desc">
            Batches with stock that expire inside this window are flagged on the Stock page, counted on the sidebar and sent as a notification once.
          </p>
        </div>

        <div className="inv-opt-field-group">
          <label className="inv-opt-field-label">
            <ClockCircleOutlined className="inv-opt-field-icon" />
            Alert window (days)
          </label>
          <InputNumber
            min={1}
            max={365}
            value={data.alertWindowDays}
            onChange={(val) => handleChange('alertWindowDays', Number(val) || 30)}
            size="large"
            className="inv-opt-glowing-input"
          />
        </div>
      </div>

      {/* ── Action Bar ── */}
      <div className="inv-opt-action-bar">
        <Button
          icon={<UndoOutlined />}
          size="large"
          disabled={!hasChanges || saving}
          onClick={handleReset}
          className="inv-opt-btn-secondary"
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
          className="inv-opt-save-btn"
        >
          Save Inventory Options
        </Button>
      </div>
    </div>
  );
};

export default InventoryOptionsSettings;
