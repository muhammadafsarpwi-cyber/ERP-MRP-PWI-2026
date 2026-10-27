import React from 'react';
import { Modal, Button, Space, Typography, Divider, Tag, theme } from 'antd';
import {
  CheckCircleFilled, EyeOutlined, PlusOutlined, UndoOutlined, LoadingOutlined,
  CloseCircleFilled, ExclamationCircleFilled, BarcodeOutlined,
  CalendarOutlined, FieldTimeOutlined, AppstoreOutlined,
} from '@ant-design/icons';

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

/**
 * Enterprise Production Entry Save Confirmation & Success Modal
 * Displays:
 * 1. Success header with 100% complete indicator
 * 2. Entry Reference & Machine No.
 * 3. Actual, Target, Achievement % metrics
 * 4. Produced Item Confirmation Card (Item Code + Item Name)
 * 5. Production Date & Shift
 * 6. High-tech operator action buttons: (+ Enter Another Entry / Next Machine, Generate Labels, View, Close)
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
  onGenerateLabels?: () => void;
}> = ({
  open,
  saving = false,
  error = null,
  entry,
  mode = 'create',
  onView,
  onNew,
  onClose,
  onGenerateLabels,
}) => {
  const { token } = theme.useToken();

  if (!open) return null;
  if (!saving && !entry && !error) return null;

  return (
    <Modal
      open={open}
      zIndex={100000}
      onCancel={saving ? undefined : onClose}
      centered
      closable={!saving}
      maskClosable={false}
      width={500}
      footer={null}
      bodyStyle={{
        backgroundColor: token.colorBgContainer,
        padding: '24px 22px 20px',
        borderRadius: 16,
      }}
      style={{ borderRadius: 16, overflow: 'hidden' }}
    >
      {/* ── Loading Spinner State ── */}
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
              background: token.colorFillAlter,
              marginBottom: 16,
              boxShadow: '0 4px 16px rgba(0, 0, 0, 0.08)',
            }}
          >
            <LoadingOutlined style={{ fontSize: 42, color: token.colorPrimary }} spin />
          </div>
          <Title level={4} style={{ margin: 0, color: token.colorText }}>
            Saving Production Entry...
          </Title>
          <Text style={{ display: 'block', marginTop: 8, fontSize: 13, color: token.colorTextSecondary }}>
            Recording production shift figures, inventory updates, and calculating targets. Please wait...
          </Text>
        </div>
      ) : error ? (
        /* ── Error / Alert State ── */
        <div style={{ textAlign: 'center', padding: '16px 8px 8px' }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 76,
              height: 76,
              borderRadius: '50%',
              background: 'rgba(239, 68, 68, 0.12)',
              color: '#ef4444',
              marginBottom: 12,
              boxShadow: '0 4px 14px rgba(239, 68, 68, 0.2)',
            }}
          >
            <CloseCircleFilled style={{ fontSize: 44 }} />
          </div>
          <Title level={4} style={{ margin: 0, color: token.colorText }}>
            Production Entry Feedback / Alert
          </Title>
          <Text style={{ display: 'block', marginTop: 4, fontSize: 12, color: token.colorTextSecondary }}>
            The production entry could not be completed due to the following requirement:
          </Text>

          <div
            style={{
              marginTop: 16,
              marginBottom: 18,
              padding: '12px 16px',
              borderRadius: 10,
              border: '1px solid rgba(239, 68, 68, 0.3)',
              background: 'rgba(239, 68, 68, 0.06)',
              textAlign: 'left',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              <ExclamationCircleFilled style={{ color: '#ef4444', fontSize: 18, marginTop: 2, flexShrink: 0 }} />
              <Text strong style={{ fontSize: 13, color: '#ef4444', lineHeight: 1.5, wordBreak: 'break-word' }}>
                {error}
              </Text>
            </div>
          </div>

          <Space direction="vertical" style={{ width: '100%', padding: '0 4px' }}>
            <Button
              type="primary"
              danger
              block
              size="large"
              onClick={onClose}
              style={{ height: 42, fontWeight: 700, borderRadius: 10 }}
            >
              Review & Adjust Entry
            </Button>
          </Space>
        </div>
      ) : entry ? (
        /* ── Success State ── */
        <>
          {/* Top Checkmark Header */}
          <div style={{ textAlign: 'center', padding: '4px 8px 10px' }}>
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 72,
                height: 72,
                borderRadius: '50%',
                background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.15) 0%, rgba(16, 185, 129, 0.25) 100%)',
                color: '#10b981',
                marginBottom: 10,
                boxShadow: '0 4px 18px rgba(16, 185, 129, 0.25)',
              }}
            >
              <CheckCircleFilled style={{ fontSize: 42 }} />
            </div>
            <Title level={4} style={{ margin: 0, fontSize: 19, fontWeight: 800, color: token.colorText }}>
              Production Entry Saved Successfully!
            </Title>
            <Text style={{ display: 'block', marginTop: 4, fontSize: 12, color: token.colorTextSecondary }}>
              {mode === 'edit' ? 'The production entry has been updated.' : 'The production entry has been recorded.'}
            </Text>
            <div style={{ marginTop: 8 }}>
              <Tag
                style={{
                  padding: '4px 14px',
                  borderRadius: 14,
                  fontSize: 11,
                  fontWeight: 800,
                  letterSpacing: '0.5px',
                  background: 'rgba(16, 185, 129, 0.12)',
                  borderColor: 'rgba(16, 185, 129, 0.35)',
                  color: '#10b981',
                }}
              >
                <CheckCircleFilled style={{ marginRight: 6 }} />
                7 STEPS OK · 100% COMPLETE
              </Tag>
            </div>
          </div>

          {/* ── 1. Entry Reference & Machine No. Card ── */}
          <div
            style={{
              marginTop: 10,
              marginBottom: 10,
              padding: '12px 16px',
              borderRadius: 12,
              border: `1px solid ${token.colorBorderSecondary}`,
              backgroundColor: token.colorFillAlter,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ textAlign: 'left' }}>
                <div style={{ fontSize: 10, letterSpacing: '0.8px', textTransform: 'uppercase', fontWeight: 800, color: token.colorTextTertiary }}>
                  ENTRY REFERENCE
                </div>
                <div style={{ fontSize: 17, fontWeight: 900, color: token.colorPrimary, marginTop: 2, fontFamily: 'monospace' }}>
                  {entry.entryNumber || entry.entryId}
                </div>
              </div>
              {entry.machineNo && (
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 10, letterSpacing: '0.8px', textTransform: 'uppercase', fontWeight: 800, color: token.colorTextTertiary }}>
                    MACHINE NO.
                  </div>
                  <div style={{ fontSize: 17, fontWeight: 900, color: token.colorText, marginTop: 2 }}>
                    {entry.machineNo}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ── 2. 3-Figure Metrics Bar: Actual, Target, Achievement % ── */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: 8,
              padding: '8px',
              marginBottom: 12,
              borderRadius: 12,
              backgroundColor: token.colorFillAlter,
              border: `1px solid ${token.colorBorderSecondary}`,
              textAlign: 'center',
            }}
          >
            {/* Actual Output */}
            <div
              style={{
                backgroundColor: 'rgba(2, 132, 199, 0.08)',
                border: '1px solid rgba(2, 132, 199, 0.25)',
                borderRadius: 8,
                padding: '8px 4px',
              }}
            >
              <div style={{ fontSize: 10, color: '#0284c7', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                ACTUAL
              </div>
              <div style={{ fontSize: 16, fontWeight: 900, color: '#0284c7', marginTop: 2 }}>
                {entry.actualQuantity ?? entry.quantity ?? '0'}{entry.uom ? ` ${entry.uom}` : ''}
              </div>
            </div>

            {/* Target Output */}
            <div
              style={{
                backgroundColor: 'rgba(124, 58, 237, 0.08)',
                border: '1px solid rgba(124, 58, 237, 0.25)',
                borderRadius: 8,
                padding: '8px 4px',
              }}
            >
              <div style={{ fontSize: 10, color: '#7c3aed', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                TARGET
              </div>
              <div style={{ fontSize: 16, fontWeight: 900, color: '#7c3aed', marginTop: 2 }}>
                {entry.targetQuantity !== undefined && entry.targetQuantity !== null ? `${entry.targetQuantity}${entry.uom ? ` ${entry.uom}` : ''}` : '0'}
              </div>
            </div>

            {/* Achievement % */}
            {(() => {
              const achNum = entry.achievementPercentage !== undefined && entry.achievementPercentage !== null
                ? Number(entry.achievementPercentage)
                : null;
              const isGood = achNum !== null && achNum >= 100;
              const hasVal = achNum !== null && !isNaN(achNum);
              return (
                <div
                  style={{
                    backgroundColor: hasVal && isGood ? 'rgba(16, 185, 129, 0.08)' : 'rgba(245, 158, 11, 0.08)',
                    border: `1px solid ${hasVal && isGood ? 'rgba(16, 185, 129, 0.3)' : 'rgba(245, 158, 11, 0.3)'}`,
                    borderRadius: 8,
                    padding: '8px 4px',
                  }}
                >
                  <div style={{ fontSize: 10, color: hasVal && isGood ? '#10b981' : '#f59e0b', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    ACHIEVEMENT
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 900, color: hasVal && isGood ? '#10b981' : '#f59e0b', marginTop: 2 }}>
                    {hasVal ? `${achNum}%` : '—'}
                  </div>
                </div>
              );
            })()}
          </div>

          {/* ── 3. MANUFACTURED ITEM / PRODUCT CONFIRMATION CARD (HIGHLIGHTED) ── */}
          <div
            style={{
              padding: '12px 14px',
              borderRadius: 12,
              backgroundColor: token.colorFillAlter,
              border: `1.5px solid ${token.colorPrimary}`,
              marginBottom: 10,
              boxShadow: '0 2px 8px rgba(0, 0, 0, 0.04)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.6px', color: token.colorPrimary, display: 'flex', alignItems: 'center', gap: 6 }}>
                <AppstoreOutlined style={{ fontSize: 14 }} />
                MANUFACTURED ITEM / PRODUCT
              </span>
              {entry.itemCode && (
                <Tag
                  color="blue"
                  style={{
                    margin: 0,
                    fontWeight: 800,
                    fontSize: 12,
                    padding: '1px 8px',
                    borderRadius: 6,
                    fontFamily: 'monospace',
                  }}
                >
                  {entry.itemCode}
                </Tag>
              )}
            </div>
            <div style={{ fontSize: 14, fontWeight: 800, color: token.colorText, wordBreak: 'break-word' }}>
              {entry.itemName || entry.itemCode || 'Manufactured Item confirmed'}
            </div>
          </div>

          {/* ── 4. Production Date & Active Shift ── */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, 1fr)',
              gap: 8,
              marginBottom: 16,
            }}
          >
            <div
              style={{
                padding: '9px 12px',
                borderRadius: 10,
                backgroundColor: token.colorFillAlter,
                border: `1px solid ${token.colorBorderSecondary}`,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <CalendarOutlined style={{ color: '#ea580c', fontSize: 16 }} />
              <div>
                <div style={{ fontSize: 10, textTransform: 'uppercase', color: token.colorTextSecondary, fontWeight: 700 }}>
                  Production Date
                </div>
                <div style={{ fontSize: 13, fontWeight: 800, color: token.colorText, marginTop: 1 }}>
                  {entry.entryDate ? String(entry.entryDate) : '—'}
                </div>
              </div>
            </div>

            <div
              style={{
                padding: '9px 12px',
                borderRadius: 10,
                backgroundColor: token.colorFillAlter,
                border: `1px solid ${token.colorBorderSecondary}`,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <FieldTimeOutlined style={{ color: '#10b981', fontSize: 16 }} />
              <div>
                <div style={{ fontSize: 10, textTransform: 'uppercase', color: token.colorTextSecondary, fontWeight: 700 }}>
                  Active Shift
                </div>
                <div style={{ fontSize: 13, fontWeight: 800, color: token.colorText, marginTop: 1 }}>
                  {entry.shift || '—'}
                </div>
              </div>
            </div>
          </div>

          <Divider style={{ margin: '12px 0 16px', borderColor: token.colorBorderSecondary }} />

          {/* ── 5. High-Tech Action Buttons ── */}
          <Space direction="vertical" size={10} style={{ width: '100%' }}>
            {/* 1. Enter Another Entry / Next Machine (MOST PROMINENT) */}
            <Button
              type="primary"
              block
              size="large"
              icon={<PlusOutlined style={{ fontSize: 16 }} />}
              onClick={onNew}
              style={{
                height: 46,
                background: 'linear-gradient(135deg, #ea580c 0%, #f97316 100%)',
                borderColor: '#ea580c',
                color: '#ffffff',
                fontWeight: 900,
                fontSize: 15,
                borderRadius: 12,
                boxShadow: '0 4px 16px rgba(234, 88, 12, 0.35)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
              }}
            >
              {mode === 'edit' ? 'New Machine Entry' : '+ Enter Next Machine Entry'}
            </Button>

            {/* 2. Generate Coils & Unit Labels */}
            <Button
              type="primary"
              block
              size="large"
              icon={<BarcodeOutlined style={{ fontSize: 16 }} />}
              onClick={onGenerateLabels || onView}
              style={{
                height: 42,
                background: 'linear-gradient(135deg, #0284c7 0%, #0ea5e9 100%)',
                borderColor: '#0284c7',
                color: '#ffffff',
                fontWeight: 800,
                fontSize: 14,
                borderRadius: 10,
                boxShadow: '0 4px 14px rgba(2, 132, 199, 0.25)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
              }}
            >
              Generate Coils & Unit Labels
            </Button>

            {/* 3. View Entry Details */}
            <Button
              block
              icon={<EyeOutlined />}
              onClick={onView}
              style={{
                height: 40,
                fontWeight: 700,
                borderRadius: 10,
                backgroundColor: token.colorFillAlter,
                borderColor: token.colorBorderSecondary,
                color: token.colorText,
              }}
            >
              View Entry Details
            </Button>

            {/* 4. Close (Returns to modal or page) */}
            <Button
              type="text"
              block
              icon={<UndoOutlined />}
              onClick={onClose}
              style={{
                height: 36,
                fontWeight: 700,
                color: token.colorTextSecondary,
              }}
            >
              Close
            </Button>
          </Space>
        </>
      ) : null}
    </Modal>
  );
};

export default ProductionSaveSuccessModal;