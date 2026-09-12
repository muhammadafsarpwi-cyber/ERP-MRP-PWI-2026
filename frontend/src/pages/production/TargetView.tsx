import React from 'react';
import { Divider, Tag, Typography } from 'antd';
import { AimOutlined } from '@ant-design/icons';
import StatusBadge from '../../components/shared/StatusBadge';
import './targetView.css';

const { Text } = Typography;

/** Plain display record for the Machine Target read-only view / live preview. */
export interface TargetRecord {
  machineNumber?: string | null;
  machineCode?: string | null;
  machineSystemId?: string | null;
  machineName?: string | null;
  division?: string | null;
  section?: string | null;
  department?: string | null;
  itemCode?: string | null;
  itemName?: string | null;
  shift?: string | null;
  shiftName?: string | null;
  uom?: string | null;
  status?: string | null;
  targetQuantity?: number | string | null;
  standardHours?: number | string | null;
  perHour?: number | string | null;
  effectiveFrom?: string | null;
  effectiveTo?: string | null;
  remarks?: string | null;
  createdBy?: string | null;
  createdAt?: string | null;
  updatedBy?: string | null;
  updatedAt?: string | null;
}

const fmt = (v: number | string | null | undefined, max = 4): string => {
  const n = Number(v);
  if (!isFinite(n)) return '—';
  return n.toLocaleString(undefined, { maximumFractionDigits: max });
};

const Field: React.FC<{ label: string; value?: React.ReactNode }> = ({ label, value }) => {
  const hasValue = value !== undefined && value !== null && value !== '';
  return (
    <div className="tv-field">
      <span className="tv-field-label">{label}</span>
      <span className="tv-field-value">{hasValue ? value : <span className="tv-empty">—</span>}</span>
    </div>
  );
};

/**
 * Read-only Machine Target display. Used for BOTH the live right-side preview in
 * the Add/Edit split modal and the View modal — a single source of truth so
 * Add / Edit / View always show the same data.
 */
const TargetView: React.FC<{
  record: TargetRecord;
  showAudit?: boolean;
  live?: boolean;
}> = ({ record, showAudit = false, live = false }) => {
  const machineNumber = record.machineNumber?.trim() || record.machineCode?.trim() || null;
  const machineSecondary = [record.machineCode, record.machineSystemId].filter(Boolean).join(' · ');
  const machineName = record.machineName;
  const hasQty =
    record.targetQuantity !== undefined && record.targetQuantity !== null && record.targetQuantity !== '';
  const hasHours =
    record.standardHours !== undefined && record.standardHours !== null && record.standardHours !== '';
  const perHour = record.perHour;

  return (
    <div className="tv">
      <div className="tv-header">
        <div className="tv-title">
          <span className="tv-icon"><AimOutlined /></span>
          <div className="tv-title-text">
            <div className="tv-title-line">
              <span className="tv-machine-number">{machineNumber ?? '—'}</span>
              {record.machineCode && machineNumber !== record.machineCode ? (
                <Tag className="tv-tag">{record.machineCode}</Tag>
              ) : null}
            </div>
            {machineName ? <div className="tv-subtitle">{machineName}</div> : null}
          </div>
        </div>
        <div className="tv-header-right">
          {live ? <span className="tv-live">LIVE PREVIEW</span> : null}
          <StatusBadge status={record.status || 'ACTIVE'} />
        </div>
      </div>

      <div className="tv-kpis">
        <div className="tv-kpi">
          <span className="tv-kpi-label">Standard Target</span>
          <span className="tv-kpi-value">
            {hasQty ? `${fmt(record.targetQuantity)}${record.uom ? ` ${record.uom}` : ''}`.trim() : '—'}
          </span>
        </div>
        <div className="tv-kpi">
          <span className="tv-kpi-label">Standard Hours</span>
          <span className="tv-kpi-value">
            {hasHours ? `${fmt(record.standardHours)} h` : '—'}
          </span>
        </div>
        <div className="tv-kpi">
          <span className="tv-kpi-label">Target / Hour</span>
          <span className="tv-kpi-value">
            {perHour !== null && perHour !== undefined && perHour !== '' ? (
              `${fmt(perHour)}${record.uom ? ` ${record.uom}` : ''}/h`.trim()
            ) : (
              <span className="tv-empty">auto</span>
            )}
          </span>
        </div>
      </div>

      <div className="tv-fields">
        {machineSecondary ? (
          <Field label="Machine ID / Code" value={<Text style={{ fontFamily: 'Cascadia Code, Consolas, monospace' }}>{machineSecondary}</Text>} />
        ) : null}
        <Field label="Division" value={record.division} />
        <Field label="Section" value={record.section} />
        <Field label="Department" value={record.department} />
        <Field
          label="Item"
          value={record.itemName || record.itemCode || undefined}
        />
        <Field
          label="Shift"
          value={record.shiftName || record.shift || undefined}
        />
        <Field label="UOM" value={record.uom} />
        <Field label="Effective From" value={record.effectiveFrom} />
        <Field label="Effective To" value={record.effectiveTo || (record.effectiveFrom ? 'open-ended' : undefined)} />
        <Field label="Remarks" value={record.remarks} />
      </div>

      {showAudit && (record.createdBy || record.updatedBy) ? (
        <>
          <Divider style={{ margin: '2px 0' }} />
          <div className="tv-audit">
            <Field label="Created By" value={record.createdBy} />
            <Field label="Created At" value={record.createdAt} />
            <Field label="Updated By" value={record.updatedBy} />
            <Field label="Updated At" value={record.updatedAt} />
          </div>
        </>
      ) : null}
    </div>
  );
};

export default TargetView;