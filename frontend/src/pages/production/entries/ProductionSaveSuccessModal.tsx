import React from 'react';
import { Modal, Button, Space, Typography, Divider, Tag } from 'antd';
import { CheckCircleFilled, EyeOutlined, PlusOutlined, UndoOutlined, LoadingOutlined, CloseCircleFilled, ExclamationCircleFilled } from '@ant-design/icons';

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
  actualQuantity?: number | string;
  targetQuantity?: number | string;
  achievementPercentage?: number | string | null;
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
 * PROMPT-35 success confirmation, loading spinner, and feedback modal.
 * When saving is in progress, displays a prominent spinning loader in an independent modal popup.
 * If saving succeeds, displays a big green checkmark and key figures (Actual, Target, Achievement %).
 * If saving fails or returns shortage/error comments, displays the server feedback inside the modal popup.
 */
const ProductionSaveSuccessModal: React.FC<{
  open: boolean;
  saving?: boolean;
  error?: string | null;
  entry: SavedEntrySummary | null;
  mode?: 'create' | 'edit';
  onView: () => void;
  onNew: () => void;
  onClose: () => void;
}> = ({ open, saving = false, error = null, entry, mode = 'create', onView, onNew, onClose }) => {
  if (!open) return null;
  if (!saving && !entry && !error) return null;

  return (
    <Modal
      open={open}
      onCancel={saving ? undefined : onClose}
      centered
      closable={!saving}
      maskClosable={false}
      width={480}
      footer={null}
      style={{ borderRadius: 14, overflow: 'hidden' }}
    >
      {saving ? (
        <div style={{ textAlign: 'center', padding: '28px 16px' }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 76,
              height: 76,
              borderRadius: '50%',
              background: 'rgba(24, 144, 255, 0.08)',
              marginBottom: 16,
            }}
          >
            <LoadingOutlined style={{ fontSize: 44, color: 'var(--theme-primary, #1890ff)' }} spin />
          </div>
          <Title level={4} style={{ margin: 0, color: 'var(--theme-text, #0f172a)' }}>
            Saving Production Entry...
          </Title>
          <Text type="secondary" style={{ display: 'block', marginTop: 8, fontSize: 13 }}>
            Recording production shift figures, inventory updates, and calculating targets. Please wait...
          </Text>
        </div>
      ) : error ? (
        <div style={{ textAlign: 'center', padding: '16px 8px 8px' }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 76,
              height: 76,
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #fee2e2 0%, #fecaca 100%)',
              color: '#dc2626',
              marginBottom: 12,
              boxShadow: '0 4px 12px rgba(220, 38, 38, 0.2)',
            }}
          >
            <CloseCircleFilled style={{ fontSize: 44 }} />
          </div>
          <Title level={4} style={{ margin: 0, color: 'var(--theme-text, #0f172a)' }}>
            Production Entry Feedback / Alert
          </Title>
          <Text type="secondary" style={{ display: 'block', marginTop: 4, fontSize: 12 }}>
            The production entry could not be completed due to the following requirement:
          </Text>

          <div
            style={{
              marginTop: 16,
              marginBottom: 18,
              padding: '12px 16px',
              borderRadius: 8,
              border: '1px solid #fca5a5',
              background: '#fef2f2',
              textAlign: 'left',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              <ExclamationCircleFilled style={{ color: '#dc2626', fontSize: 18, marginTop: 2, flexShrink: 0 }} />
              <Text strong style={{ fontSize: 13, color: '#991b1b', lineHeight: 1.5, wordBreak: 'break-word' }}>
                {error}
              </Text>
            </div>
          </div>

          <Space direction="vertical" style={{ width: '100%', padding: '0 4px' }}>
            <Button type="primary" danger block size="large" onClick={onClose}>
              Review & Adjust Entry
            </Button>
          </Space>
        </div>
      ) : entry ? (
        <>
          <div style={{ textAlign: 'center', padding: '8px 8px 4px' }}>
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 76,
                height: 76,
                borderRadius: '50%',
                background: 'linear-gradient(135deg, #dcfce7 0%, #bbf7d0 100%)',
                color: 'var(--theme-success, #16a34a)',
                marginBottom: 12,
                boxShadow: '0 4px 12px rgba(22, 163, 74, 0.2)',
              }}
            >
              <CheckCircleFilled style={{ fontSize: 44 }} />
            </div>
            <Title level={4} style={{ margin: 0, color: 'var(--theme-text, #0f172a)' }}>
              Production Entry Saved Successfully!
            </Title>
            <Text type="secondary" style={{ display: 'block', marginTop: 4, fontSize: 12 }}>
              {mode === 'edit' ? 'The production entry has been updated.' : 'The production entry has been recorded.'}
            </Text>
            <div style={{ marginTop: 8 }}>
              <Tag
                color="#16a34a"
                style={{
                  padding: '3px 12px',
                  borderRadius: 12,
                  fontSize: 12,
                  fontWeight: 700,
                  background: '#ecfdf5',
                  borderColor: '#10b981',
                  color: '#047857',
                }}
              >
                <CheckCircleFilled style={{ marginRight: 5 }} />
                7 STEPS OK · 100% COMPLETE
              </Tag>
            </div>
          </div>

          <Divider style={{ margin: '12px 0' }} />

          {/* Entry Reference & Machine No. card */}
          <div
            style={{
              marginBottom: 10,
              padding: '10px 14px',
              borderRadius: 8,
              border: '1px solid var(--theme-border-strong, #cbd5e1)',
              background: 'var(--theme-surface-alt, #f8fafc)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ textAlign: 'left' }}>
                <Text type="secondary" style={{ fontSize: 11, letterSpacing: 0.5, textTransform: 'uppercase' }}>ENTRY REFERENCE</Text>
                <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--theme-primary, #1890ff)' }}>
                  {entry.entryNumber || entry.entryId}
                </div>
              </div>
              {entry.machineNo && (
                <div style={{ textAlign: 'right' }}>
                  <Text type="secondary" style={{ fontSize: 11, letterSpacing: 0.5, textTransform: 'uppercase' }}>MACHINE NO.</Text>
                  <div style={{ fontSize: 17, fontWeight: 700, color: '#0f172a' }}>
                    {entry.machineNo}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* 3 Main Figures in one clean row: Actual, Target, Achievement % */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: 8,
              padding: '8px',
              marginBottom: 12,
              borderRadius: 8,
              background: 'var(--theme-surface-alt, #f8fafc)',
              border: '1px solid var(--theme-border, #e2e8f0)',
              textAlign: 'center',
            }}
          >
            {/* Actual Production */}
            <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 6, padding: '6px 4px' }}>
              <Text type="secondary" style={{ fontSize: 10, display: 'block', color: '#1e40af', fontWeight: 600 }}>
                ACTUAL
              </Text>
              <Text strong style={{ fontSize: 14, color: '#1d4ed8' }}>
                {entry.actualQuantity ?? entry.quantity ?? '—'}{entry.uom ? ` ${entry.uom}` : ''}
              </Text>
            </div>

            {/* Target Production */}
            <div style={{ background: '#f5f3ff', border: '1px solid #ddd6fe', borderRadius: 6, padding: '6px 4px' }}>
              <Text type="secondary" style={{ fontSize: 10, display: 'block', color: '#5b21b6', fontWeight: 600 }}>
                TARGET
              </Text>
              <Text strong style={{ fontSize: 14, color: '#6d28d9' }}>
                {entry.targetQuantity !== undefined && entry.targetQuantity !== null ? `${entry.targetQuantity}${entry.uom ? ` ${entry.uom}` : ''}` : '—'}
              </Text>
            </div>

            {/* Achievement % */}
            <div
              style={{
                background: entry.achievementPercentage !== undefined && entry.achievementPercentage !== null && Number(entry.achievementPercentage) >= 100
                  ? '#ecfdf5' : '#fffbeb',
                border: `1px solid ${entry.achievementPercentage !== undefined && entry.achievementPercentage !== null && Number(entry.achievementPercentage) >= 100
                  ? '#a7f3d0' : '#fde68a'}`,
                borderRadius: 6,
                padding: '6px 4px',
              }}
            >
              <Text type="secondary" style={{ fontSize: 10, display: 'block', color: '#374151', fontWeight: 600 }}>
                ACHIEVEMENT
              </Text>
              <Text
                strong
                style={{
                  fontSize: 14,
                  color: entry.achievementPercentage !== undefined && entry.achievementPercentage !== null && Number(entry.achievementPercentage) >= 100
                    ? '#047857' : '#b45309',
                }}
              >
                {entry.achievementPercentage !== undefined && entry.achievementPercentage !== null
                  ? `${entry.achievementPercentage}%`
                  : '—'}
              </Text>
            </div>
          </div>

          <div style={{ padding: '0 4px' }}>
            <Row label="Production Date" value={entry.entryDate ? String(entry.entryDate) : undefined} />
            <Row label="Shift" value={entry.shift} />
            <Row label="Division" value={entry.division} />
            <Row label="Section" value={entry.section} />
            <Row label="Department" value={entry.department} />
            <Row
              label="Item"
              value={entry.itemCode || entry.itemName
                ? <>{entry.itemCode && <Text strong style={{ fontSize: 13 }}>{entry.itemCode}</Text>}{entry.itemName ? ` ${entry.itemName}` : ''}</>
                : undefined}
            />
            <Row label="Status" value={entry.status || 'Saved'} />
          </div>

          <Divider style={{ margin: '14px 0 16px' }} />

          <Space direction="vertical" style={{ width: '100%', padding: '0 4px' }}>
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
        </>
      ) : null}
    </Modal>
  );
};

export default ProductionSaveSuccessModal;