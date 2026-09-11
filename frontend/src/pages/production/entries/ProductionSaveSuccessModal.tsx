import React from 'react';
import { Modal, Button, Space, Typography, Divider } from 'antd';
import { CheckCircleFilled, EyeOutlined, PlusOutlined, UndoOutlined } from '@ant-design/icons';

const { Text, Title } = Typography;

export interface SavedEntrySummary {
  entryId: string;
  entryNumber?: string | null;
  entryDate?: string;
  shift?: string;
  division?: string;
  section?: string;
  department?: string;
  machineNo?: string;
  itemCode?: string;
  itemName?: string;
  quantity?: number | string;
  uom?: string;
  status?: string;
}

/** A single summary row: label + value (value omitted → row hidden). */
const Row: React.FC<{ label: string; value?: React.ReactNode }> = ({ label, value }) => {
  if (value === undefined || value === null || value === '') return null;
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, padding: '5px 0' }}>
      <Text type="secondary" style={{ fontSize: 12 }}>{label}</Text>
      <Text strong style={{ fontSize: 13, textAlign: 'right' }}>{value}</Text>
    </div>
  );
};

/**
 * PROMPT-35 success confirmation modal. Shown ONLY after the backend confirms
 * the Production Entry was persisted (POST/PUT /production/entries). It is a
 * plain, centered antd Modal — deliberately NOT draggable/resizable — reusing
 * the app's existing theme CSS variables. On failure the form stays open with
 * the real error and this modal never appears.
 */
const ProductionSaveSuccessModal: React.FC<{
  open: boolean;
  entry: SavedEntrySummary | null;
  mode?: 'create' | 'edit';
  onView: () => void;
  onNew: () => void;
  onClose: () => void;
}> = ({ open, entry, mode = 'create', onView, onNew, onClose }) => {
  if (!entry) return null;
  return (
    <Modal
      open={open}
      onCancel={onClose}
      centered
      closable={false}
      maskClosable={false}
      width={460}
      footer={null}
      style={{ borderRadius: 14, overflow: 'hidden' }}
    >
      <div style={{ textAlign: 'center', padding: '8px 8px 4px' }}>
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 72,
            height: 72,
            borderRadius: '50%',
            background: 'linear-gradient(135deg, #dcfce7 0%, #bbf7d0 100%)',
            color: 'var(--theme-success, #16a34a)',
            marginBottom: 12,
          }}
        >
          <CheckCircleFilled style={{ fontSize: 40 }} />
        </div>
        <Title level={4} style={{ margin: 0, color: 'var(--theme-text, #0f172a)' }}>
          Production Entry Saved Successfully
        </Title>
        <Text type="secondary" style={{ display: 'block', marginTop: 4, fontSize: 12 }}>
          {mode === 'edit' ? 'The production entry has been updated.' : 'The production entry has been recorded.'}
        </Text>
      </div>

      <Divider style={{ margin: '14px 0' }} />

      <div style={{ padding: '4px 8px 0' }}>
        {entry.entryNumber && (
          <div
            style={{
              textAlign: 'center',
              marginBottom: 8,
              padding: '8px 12px',
              borderRadius: 8,
              border: '1px solid var(--theme-border-strong, #cbd5e1)',
              background: 'var(--theme-surface-alt, #f8fafc)',
            }}
          >
            <Text type="secondary" style={{ fontSize: 11, letterSpacing: 0.5 }}>ENTRY REFERENCE</Text>
            <br />
            <Text strong style={{ fontSize: 18, color: 'var(--theme-primary)' }}>
              {entry.entryNumber}
            </Text>
          </div>
        )}
        <Row label="Production Date" value={entry.entryDate ? String(entry.entryDate) : undefined} />
        <Row label="Shift" value={entry.shift} />
        <Row label="Division" value={entry.division} />
        <Row label="Section" value={entry.section} />
        <Row label="Department" value={entry.department} />
        <Row label="Machine" value={entry.machineNo} />
        <Row
          label="Item"
          value={entry.itemCode || entry.itemName
            ? <>{entry.itemCode && <Text strong style={{ fontSize: 13 }}>{entry.itemCode}</Text>}{entry.itemName ? ` ${entry.itemName}` : ''}</>
            : undefined}
        />
        <Row
          label="Quantity"
          value={entry.quantity !== undefined && entry.quantity !== null
            ? `${entry.quantity}${entry.uom ? ` ${entry.uom}` : ''}`
            : undefined}
        />
        <Row label="Status" value={entry.status || 'Saved'} />
      </div>

      <Divider style={{ margin: '14px 0 16px' }} />

      <Space direction="vertical" style={{ width: '100%', padding: '0 8px' }}>
        <Button type="primary" block size="large" icon={<EyeOutlined />} onClick={onView}>
          View Entry
        </Button>
        <Button block icon={<PlusOutlined />} onClick={onNew}>
          {mode === 'edit' ? 'New Entry' : 'Enter Another Entry'}
        </Button>
        <Button block icon={<UndoOutlined />} onClick={onClose}>
          Close
        </Button>
      </Space>
    </Modal>
  );
};

export default ProductionSaveSuccessModal;