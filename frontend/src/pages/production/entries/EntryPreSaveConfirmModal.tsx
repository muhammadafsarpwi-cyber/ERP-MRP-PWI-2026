import React from 'react';
import { Modal, Button, Typography, Row, Col, Tag, Space, Divider } from 'antd';
import {
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  SaveOutlined,
  ShopOutlined,
  AppstoreOutlined,
  CalendarOutlined,
  ArrowRightOutlined,
} from '@ant-design/icons';
import { formatNumber } from '../../../utils/numberFormat';

const { Text, Title } = Typography;

export interface EntryPreSaveSummary {
  mode: 'create' | 'edit';
  itemCode?: string;
  itemName?: string;
  wireSizeMm?: number | null;
  rawMaterialWarehouseName?: string;
  rawMaterialWarehouseCode?: string;
  receiptWarehouseName?: string;
  receiptWarehouseCode?: string;
  actualQuantity: number;
  scrapQuantityKg: number;
  shiftName?: string;
  machineName?: string;
  entryDate?: string;
}

export interface EntryPreSaveConfirmModalProps {
  open: boolean;
  summary: EntryPreSaveSummary | null;
  loading?: boolean;
  onConfirm: () => Promise<void> | void;
  onCancel: () => void;
}

/**
 * Enterprise 2-Step Pre-Save Audit & Verification Dialog for Daily Production Entries.
 * Summarizes Item, Inbound/Outbound Warehouses, Produced/Scrap quantities, and Machine/Shift
 * before persisting to the inventory ledger.
 */
export const EntryPreSaveConfirmModal: React.FC<EntryPreSaveConfirmModalProps> = ({
  open,
  summary,
  loading = false,
  onConfirm,
  onCancel,
}) => {
  if (!summary) return null;

  const isEdit = summary.mode === 'edit';
  const title = isEdit ? 'Confirm Update Daily Production Entry?' : 'Confirm Save Daily Production Entry?';

  return (
    <Modal
      open={open}
      zIndex={3200}
      centered
      width={640}
      destroyOnHidden
      closable={!loading}
      maskClosable={false}
      onCancel={onCancel}
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div
            style={{
              width: 34,
              height: 34,
              borderRadius: 8,
              background: 'rgba(59, 130, 246, 0.15)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#38bdf8',
              fontSize: 18,
            }}
          >
            <ExclamationCircleOutlined />
          </div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--theme-text, #f8fafc)', lineHeight: 1.2 }}>
              {title}
            </div>
            <div style={{ fontSize: 12, color: 'var(--theme-text-muted, #94a3b8)', marginTop: 2 }}>
              Please verify the material flow, warehouses, and production counts before saving.
            </div>
          </div>
        </div>
      }
      footer={
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: 10,
            paddingTop: 12,
            borderTop: '1px solid var(--theme-border, rgba(148, 163, 184, 0.2))',
          }}
        >
          <Button onClick={onCancel} disabled={loading} size="middle">
            Review / Edit More
          </Button>
          <Button
            type="primary"
            icon={<SaveOutlined />}
            loading={loading}
            onClick={onConfirm}
            size="middle"
            style={{
              background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
              borderColor: '#059669',
              fontWeight: 700,
            }}
          >
            {isEdit ? 'Confirm & Update Entry' : 'Confirm & Save Entry'}
          </Button>
        </div>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '12px 0 4px' }}>
        {/* Card 1: Product / Item */}
        <div
          style={{
            background: 'var(--theme-surface-alt, #1e293b)',
            border: '1px solid var(--theme-border, rgba(148, 163, 184, 0.25))',
            borderRadius: 8,
            padding: '10px 14px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
            <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: '#38bdf8', letterSpacing: '0.5px' }}>
              <AppstoreOutlined style={{ marginRight: 5 }} /> Manufactured Product
            </span>
            {summary.wireSizeMm ? (
              <Tag color="cyan" style={{ fontSize: 11, fontWeight: 600, margin: 0 }}>
                Wire Size: {summary.wireSizeMm} mm
              </Tag>
            ) : null}
          </div>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--theme-text, #f8fafc)' }}>
            {summary.itemName || 'Production Item'}
            {summary.itemCode ? (
              <span style={{ fontWeight: 500, color: 'var(--theme-text-muted, #94a3b8)', marginLeft: 6 }}>
                ({summary.itemCode})
              </span>
            ) : null}
          </div>
        </div>

        {/* Card 2: Material Flow (Warehouses IN & OUT) */}
        <div
          style={{
            background: 'var(--theme-surface-alt, #1e293b)',
            border: '1px solid var(--theme-border, rgba(148, 163, 184, 0.25))',
            borderRadius: 8,
            padding: '12px 14px',
          }}
        >
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: '#10b981', letterSpacing: '0.5px', marginBottom: 8 }}>
            <ShopOutlined style={{ marginRight: 5 }} /> Warehouse & Material Flow Verification
          </div>

          <Row gutter={[12, 12]} align="middle">
            <Col xs={24} sm={11}>
              <div style={{ fontSize: 11, color: 'var(--theme-text-muted, #94a3b8)', marginBottom: 2 }}>
                <span style={{ background: 'rgba(34, 197, 94, 0.15)', color: '#22c55e', padding: '1px 5px', borderRadius: 4, fontWeight: 800, marginRight: 6 }}>
                  IN
                </span>
                Source Raw Material Store:
              </div>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--theme-text, #f8fafc)' }}>
                {summary.rawMaterialWarehouseName || 'Raw Material Store'}
                {summary.rawMaterialWarehouseCode ? ` (${summary.rawMaterialWarehouseCode})` : ''}
              </div>
            </Col>

            <Col xs={24} sm={2} style={{ textAlign: 'center' }}>
              <ArrowRightOutlined style={{ color: 'var(--theme-text-muted, #94a3b8)', fontSize: 14 }} />
            </Col>

            <Col xs={24} sm={11}>
              <div style={{ fontSize: 11, color: 'var(--theme-text-muted, #94a3b8)', marginBottom: 2 }}>
                <span style={{ background: 'rgba(6, 182, 212, 0.15)', color: '#06b6d4', padding: '1px 5px', borderRadius: 4, fontWeight: 800, marginRight: 6 }}>
                  OUT
                </span>
                Destination Receipt Store:
              </div>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--theme-text, #f8fafc)' }}>
                {summary.receiptWarehouseName || 'Finished Goods Store'}
                {summary.receiptWarehouseCode ? ` (${summary.receiptWarehouseCode})` : ''}
              </div>
            </Col>
          </Row>
        </div>

        {/* Card 3: Quantities & Machine Context */}
        <Row gutter={[12, 12]}>
          <Col xs={24} sm={12}>
            <div
              style={{
                background: 'var(--theme-surface-alt, #1e293b)',
                border: '1px solid var(--theme-border, rgba(148, 163, 184, 0.25))',
                borderRadius: 8,
                padding: '10px 14px',
                height: '100%',
              }}
            >
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--theme-text-muted, #94a3b8)', marginBottom: 6 }}>
                Production Output Figures
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
                <span style={{ fontSize: 12, color: 'var(--theme-text-muted, #94a3b8)' }}>Good Production:</span>
                <span style={{ fontSize: 16, fontWeight: 800, color: '#38bdf8' }}>
                  {formatNumber(summary.actualQuantity, 0)} <span style={{ fontSize: 12, fontWeight: 600 }}>PCS</span>
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <span style={{ fontSize: 12, color: 'var(--theme-text-muted, #94a3b8)' }}>Process Scrap / Rejection:</span>
                <span style={{ fontSize: 14, fontWeight: 700, color: summary.scrapQuantityKg > 0 ? '#f87171' : 'var(--theme-text-muted, #94a3b8)' }}>
                  {formatNumber(summary.scrapQuantityKg, 2)} <span style={{ fontSize: 11, fontWeight: 600 }}>KG</span>
                </span>
              </div>
            </div>
          </Col>

          <Col xs={24} sm={12}>
            <div
              style={{
                background: 'var(--theme-surface-alt, #1e293b)',
                border: '1px solid var(--theme-border, rgba(148, 163, 184, 0.25))',
                borderRadius: 8,
                padding: '10px 14px',
                height: '100%',
              }}
            >
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--theme-text-muted, #94a3b8)', marginBottom: 6 }}>
                <CalendarOutlined style={{ marginRight: 5 }} /> Context & Shift
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontSize: 12, color: 'var(--theme-text-muted, #94a3b8)' }}>Date:</span>
                <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--theme-text, #f8fafc)' }}>
                  {summary.entryDate || 'Today'}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontSize: 12, color: 'var(--theme-text-muted, #94a3b8)' }}>Shift:</span>
                <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--theme-text, #f8fafc)' }}>
                  {summary.shiftName || 'General Shift'}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 12, color: 'var(--theme-text-muted, #94a3b8)' }}>Machine:</span>
                <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--theme-text, #f8fafc)' }}>
                  {summary.machineName || 'Unassigned'}
                </span>
              </div>
            </div>
          </Col>
        </Row>
      </div>
    </Modal>
  );
};

export default EntryPreSaveConfirmModal;
