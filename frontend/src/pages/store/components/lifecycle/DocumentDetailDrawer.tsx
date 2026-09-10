import React, { useEffect, useState } from 'react';
import { Button, Descriptions, Drawer, Spin, Tag, Tooltip } from 'antd';
import { HistoryOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { DOC_META, DocRef, FIELD_LABELS, isPlainValue, PRETTY_KEYS, statusColor, fmtDate, fmtDateTime } from './helpers';
import apiService from '../../../../services/api';

interface DocumentDetailDrawerProps {
  doc: DocRef | null;
  onClose: () => void;
}

export const DocumentDetailDrawer: React.FC<DocumentDetailDrawerProps> = ({ doc, onClose }) => {
  const navigate = useNavigate();
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleTrace = (itemId: string | null | undefined) => {
    if (!itemId) return;
    onClose();
    navigate(`/store/material-trace/${itemId}`);
  };

  useEffect(() => {
    if (!doc) {
      setData(null);
      setError(null);
      return;
    }
    const meta = DOC_META[doc.type];
    setLoading(true);
    setError(null);
    if (doc.type === 'RESERVATION') {
      setData((doc.extra ?? {}) as Record<string, unknown>);
      setLoading(false);
      return;
    }
    apiService
      .get(meta.endpoint(String(doc.id)))
      .then((res) => {
        const body = (res ?? {}) as Record<string, unknown>;
        setData((body.data && typeof body.data === 'object' ? body.data : body) as Record<string, unknown>);
      })
      .catch(() => setError('Unable to load document details.'))
      .finally(() => setLoading(false));
  }, [doc]);

  const rows: Array<{ label: string; value: unknown }> = [];
  if (data) {
    const meta = DOC_META[doc?.type ?? 'MR'];
    const numberValue = data[meta.numberField];
    if (numberValue != null) rows.push({ label: FIELD_LABELS[meta.numberField] ?? 'Number', value: String(numberValue) });
    if (meta.statusField && data[meta.statusField] != null)
      rows.push({ label: 'Status', value: String(data[meta.statusField]) });
    const extra = (doc && doc.extra) || {};
    for (const [k, v] of Object.entries(extra)) {
      if (rows.some((r) => r.label === FIELD_LABELS[k])) continue;
      rows.push({ label: FIELD_LABELS[k] ?? k, value: v });
    }
    for (const [k, v] of Object.entries(data)) {
      if (!PRETTY_KEYS.has(k)) continue;
      if (rows.some((r) => r.label === (FIELD_LABELS[k] ?? k))) continue;
      if (!isPlainValue(v)) continue;
      rows.push({ label: FIELD_LABELS[k] ?? k, value: v });
    }
    const lines = Array.isArray(data.lines) || Array.isArray(data.items) ? (Array.isArray(data.lines) ? data.lines : data.items) : [];
    if (Array.isArray(lines) && lines.length > 0) {
      rows.push({ label: 'Lines', value: undefined });
    }
  }

  const meta = doc ? DOC_META[doc.type] : null;
  const number = doc?.number || (data && data[meta?.numberField ?? '']) || null;

  return (
    <Drawer
      open={!!doc}
      onClose={onClose}
      title={
        meta ? (
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Tag color={meta.color}>{meta.label}</Tag>
            <span style={{ fontWeight: 600 }}>{number ? String(number) : 'Document'}</span>
          </span>
        ) : (
          'Document'
        )
      }
      width={520}
    >
      {loading ? (
        <div style={{ textAlign: 'center', padding: 48 }}>
          <Spin />
        </div>
      ) : error ? (
        <div style={{ padding: 24, textAlign: 'center' }}>
          <p style={{ color: 'var(--theme-text-muted)' }}>{error}</p>
          <Button onClick={onClose}>Close</Button>
        </div>
      ) : data ? (
        <Descriptions
          column={1}
          size="small"
          bordered
          items={rows.map((row) =>
            row.label === 'Lines'
              ? { key: 'lines', label: row.label, children: lineTable((Array.isArray(data.lines) ? data.lines : data.items) as any[], handleTrace) }
              : { key: row.label, label: row.label, children: renderValue(row.value, { status: row.label === 'Status' }) },
          )}
        />
      ) : (
        <div style={{ padding: 24, textAlign: 'center', color: 'var(--theme-text-muted)' }}>No document selected.</div>
      )}
    </Drawer>
  );
};

const renderValue = (value: unknown, opts: { status?: boolean } = {}): React.ReactNode => {
  if (value == null || value === '') return <span style={{ color: 'var(--theme-text-muted)' }}>—</span>;
  const str = String(value);
  if (opts.status && currentStatusColor(str)) return <Tag color={currentStatusColor(str) as string}>{str}</Tag>;
  return <span>{str}</span>;
};

const currentStatusColor = (status: string): string | undefined => {
  const colors: Record<string, string> = {
    blue: '#1677ff',
    geekblue: '#2f54eb',
    volcano: '#fa541c',
    cyan: '#13c2c2',
    purple: '#722ed1',
    gold: '#faad14',
    orange: '#fa8c16',
    green: '#52c41a',
    red: '#f5222d',
    magenta: '#eb2f96',
    default: '#8c8c8c',
  };
  const c = statusColor(status);
  return colors[c] ?? undefined;
};

const lineTable = (lines: any[], onTrace?: (itemId: string | null | undefined) => void): React.ReactNode => (
  <div style={{ maxHeight: 240, overflow: 'auto' }}>
    <table className="trace-table">
      <thead>
        <tr>
          <th>Item</th>
          <th>Qty</th>
          <th>UoM</th>
          <th>Status</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        {lines.map((ln, idx) => {
          const itemId: string | null | undefined = ln?.item_id || ln?.item?.id || ln?.itemId;
          return (
            <tr key={ln?.id ?? idx}>
              <td>
                {ln?.item_name || ln?.item_code || ln?.item?.item_code || ln?.item?.name || '—'}
                {ln?.item_code ? ` (${ln.item_code})` : ''}
              </td>
              <td>{String(ln?.quantity ?? ln?.requested_quantity ?? ln?.received_quantity ?? '')}</td>
              <td>{ln?.uom_code || ln?.uom?.code || ''}</td>
              <td>{ln?.status ? <Tag color={currentStatusColor(ln.status) as string}>{ln.status}</Tag> : ''}</td>
              <td>
                {onTrace && itemId ? (
                  <Tooltip title="View this item's complete lifecycle">
                    <Button
                      type="link"
                      size="small"
                      icon={<HistoryOutlined />}
                      onClick={(e) => {
                        e.stopPropagation();
                        onTrace(itemId);
                      }}
                    >
                      Trace Item
                    </Button>
                  </Tooltip>
                ) : null}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  </div>
);

export const formatCellDate = (value: unknown): string => {
  if (value == null || value === '') return '—';
  return fmtDate(String(value));
};

export const formatCellDateTime = (value: unknown): string => {
  if (value == null || value === '') return '—';
  return fmtDateTime(String(value));
};