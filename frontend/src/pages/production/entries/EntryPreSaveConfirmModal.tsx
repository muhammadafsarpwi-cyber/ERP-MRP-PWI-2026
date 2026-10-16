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
  EditOutlined,
} from '@ant-design/icons';
import { formatNumber } from '../../../utils/numberFormat';

const { Text, Title } = Typography;

export interface EditedFieldDiff {
  label: string;
  oldValue: string | number;
  newValue: string | number;
}

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
  uomCode?: string;
  scrapQuantityKg: number;
  scrapQuantityPcs?: number | null;
  processScrapKg?: number;
  shiftName?: string;
  machineName?: string;
  entryDate?: string;
  changes?: EditedFieldDiff[];
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
      zIndex={100000}
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
            <div style={{ fontSize: 16, fontWeight: 700, color: '#0f172a', lineHeight: 1.2 }}>
              {title}
            </div>
            <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
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
            borderTop: '1px solid #e2e8f0',
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
        {/* If Edit Mode: Modified Fields Diff Section */}
        {isEdit && (
          <div
            style={{
              background: (summary.changes && summary.changes.length > 0) ? '#fffbeb' : '#f0f9ff',
              border: `1px solid ${(summary.changes && summary.changes.length > 0) ? '#fde68a' : '#bae6fd'}`,
              borderRadius: 8,
              padding: '12px 14px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: (summary.changes && summary.changes.length > 0) ? '#b45309' : '#0369a1', display: 'flex', alignItems: 'center', gap: 6 }}>
                <EditOutlined /> Modified Fields Summary
              </span>
              <Tag color={summary.changes && summary.changes.length > 0 ? 'warning' : 'blue'} style={{ margin: 0, fontWeight: 700 }}>
                {summary.changes ? `${summary.changes.length} Field(s) Changed` : '0 Changes'}
              </Tag>
            </div>

            {summary.changes && summary.changes.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {summary.changes.map((ch, idx) => (
                  <div
                    key={idx}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      background: '#ffffff',
                      border: '1px solid #e2e8f0',
                      padding: '7px 12px',
                      borderRadius: 6,
                      fontSize: 12.5,
                      boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
                    }}
                  >
                    <span style={{ fontWeight: 600, color: '#334155' }}>
                      {ch.label}:
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ textDecoration: 'line-through', color: '#ef4444', fontWeight: 600 }}>
                        {String(ch.oldValue)}
                      </span>
                      <ArrowRightOutlined style={{ fontSize: 11, color: '#94a3b8' }} />
                      <span style={{ color: '#16a34a', fontWeight: 800, background: '#f0fdf4', padding: '2px 8px', borderRadius: 4, border: '1px solid #bbf7d0' }}>
                        {String(ch.newValue)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ fontSize: 12, color: '#64748b', fontStyle: 'italic', padding: '4px 0' }}>
                No fields changed from original entry — confirming current values.
              </div>
            )}
          </div>
        )}

        {/* Card 1: Product / Item */}
        <div
          style={{
            background: '#f8fafc',
            border: '1px solid #e2e8f0',
            borderRadius: 8,
            padding: '10px 14px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
            <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: '#0284c7', letterSpacing: '0.5px' }}>
              <AppstoreOutlined style={{ marginRight: 5 }} /> Manufactured Product
            </span>
            {summary.wireSizeMm ? (
              <Tag color="cyan" style={{ fontSize: 11, fontWeight: 700, margin: 0 }}>
                Wire Size: {summary.wireSizeMm} mm
              </Tag>
            ) : null}
          </div>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>
            {summary.itemName || 'Production Item'}
            {summary.itemCode ? (
              <span style={{ fontWeight: 500, color: '#64748b', marginLeft: 6 }}>
                ({summary.itemCode})
              </span>
            ) : null}
          </div>
        </div>

        {/* Card 2: Material Flow (Warehouses IN & OUT) */}
        <div
          style={{
            background: '#f8fafc',
            border: '1px solid #e2e8f0',
            borderRadius: 8,
            padding: '12px 14px',
          }}
        >
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: '#059669', letterSpacing: '0.5px', marginBottom: 8 }}>
            <ShopOutlined style={{ marginRight: 5 }} /> Warehouse & Material Flow Verification
          </div>

          <Row gutter={[12, 12]} align="middle">
            <Col xs={24} sm={11}>
              <div style={{ fontSize: 11, color: '#64748b', marginBottom: 2 }}>
                <span style={{ background: 'rgba(34, 197, 94, 0.15)', color: '#16a34a', padding: '1px 5px', borderRadius: 4, fontWeight: 800, marginRight: 6 }}>
                  IN
                </span>
                Source Raw Material Store:
              </div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>
                {summary.rawMaterialWarehouseName || 'Raw Material Store'}
                {summary.rawMaterialWarehouseCode ? ` (${summary.rawMaterialWarehouseCode})` : ''}
              </div>
            </Col>

            <Col xs={24} sm={2} style={{ textAlign: 'center' }}>
              <ArrowRightOutlined style={{ color: '#94a3b8', fontSize: 14 }} />
            </Col>

            <Col xs={24} sm={11}>
              <div style={{ fontSize: 11, color: '#64748b', marginBottom: 2 }}>
                <span style={{ background: 'rgba(6, 182, 212, 0.15)', color: '#0891b2', padding: '1px 5px', borderRadius: 4, fontWeight: 800, marginRight: 6 }}>
                  OUT
                </span>
                Destination Receipt Store:
              </div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>
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
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: 8,
                padding: '10px 14px',
                height: '100%',
              }}
            >
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: '#64748b', marginBottom: 6 }}>
                Production Output Figures
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
                <span style={{ fontSize: 12, color: '#64748b' }}>Good Production:</span>
                <span style={{ fontSize: 16, fontWeight: 800, color: '#0284c7' }}>
                  {formatNumber(summary.actualQuantity, 0)} <span style={{ fontSize: 12, fontWeight: 600 }}>{summary.uomCode || 'PCS'}</span>
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: (summary.processScrapKg ?? 0) > 0 ? 4 : 0 }}>
                <span style={{ fontSize: 12, color: '#64748b' }}>Product Rejection:</span>
                <span style={{ fontSize: 14, fontWeight: 700, color: summary.scrapQuantityKg > 0 ? '#ef4444' : '#64748b' }}>
                  {formatNumber(summary.scrapQuantityKg, 2)} <span style={{ fontSize: 11, fontWeight: 600 }}>KG</span>
                  {summary.scrapQuantityPcs ? (
                    <span style={{ fontSize: 11, fontWeight: 600, color: '#64748b', marginLeft: 6 }}>
                      ({formatNumber(summary.scrapQuantityPcs, 0)} PCS)
                    </span>
                  ) : null}
                </span>
              </div>
              {(summary.processScrapKg ?? 0) > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <span style={{ fontSize: 12, color: '#64748b' }}>Process Cutting Scrap:</span>
                  <span style={{ fontSize: 14, fontWeight: 700, color: '#d97706' }}>
                    {formatNumber(summary.processScrapKg, 2)} <span style={{ fontSize: 11, fontWeight: 600 }}>KG</span>
                  </span>
                </div>
              )}
            </div>
          </Col>

          <Col xs={24} sm={12}>
            <div
              style={{
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: 8,
                padding: '10px 14px',
                height: '100%',
              }}
            >
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: '#64748b', marginBottom: 6 }}>
                <CalendarOutlined style={{ marginRight: 5 }} /> Context & Shift
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontSize: 12, color: '#64748b' }}>Date:</span>
                <span style={{ fontSize: 12.5, fontWeight: 600, color: '#0f172a' }}>
                  {summary.entryDate || 'Today'}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontSize: 12, color: '#64748b' }}>Shift:</span>
                <span style={{ fontSize: 12.5, fontWeight: 600, color: '#0f172a' }}>
                  {summary.shiftName || 'General Shift'}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 12, color: '#64748b' }}>Machine:</span>
                <span style={{ fontSize: 12.5, fontWeight: 600, color: '#0f172a' }}>
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
