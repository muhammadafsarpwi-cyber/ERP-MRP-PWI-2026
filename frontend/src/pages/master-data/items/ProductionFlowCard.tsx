import React, { useCallback, useEffect, useState } from 'react';
import { Card, Space, Spin, Tag, Tooltip, Typography } from 'antd';
import { ApartmentOutlined, ArrowRightOutlined, MinusCircleOutlined, CheckCircleOutlined } from '@ant-design/icons';
import apiService from '../../../services/api';
import { formatDimension } from '../../../utils/numberFormat';
import {
  ITEM_TYPES,
  type ProductionFlowResponse,
  type ProductionFlowStage,
} from './itemTypes';
const { Text } = Typography;

interface ProductionFlowCardProps {
  itemId: string;
  style?: React.CSSProperties;
}

const itemTypeLabel = (t?: string | null) => ITEM_TYPES.find((x) => x.value === t)?.label || t || '';

// PROMPT-35: exactly six production-flow stages:
//   01 RAW MATERIAL · 02 RAW MATERIAL SPECIFICATION · 03 FLATTENING
//   04 FLATTENING OUTPUT · 05 SPIRAL · 06 SPIRAL OUTPUT
// Process blocks (odd) emphasise department + operation; output blocks (even)
// emphasise the item code and its configured size/specification.
const STAGE_COLORS: Record<number, { accent: string; soft: string; border: string }> = {
  1: { accent: '#94a3b8', soft: 'rgba(148, 163, 184, 0.10)', border: 'rgba(148, 163, 184, 0.35)' },
  2: { accent: '#94a3b8', soft: 'rgba(148, 163, 184, 0.06)', border: 'rgba(148, 163, 184, 0.25)' },
  3: { accent: '#0284c7', soft: 'rgba(2, 132, 199, 0.10)', border: 'rgba(2, 132, 199, 0.35)' },
  4: { accent: '#0284c7', soft: 'rgba(2, 132, 199, 0.06)', border: 'rgba(2, 132, 199, 0.25)' },
  5: { accent: '#7c3aed', soft: 'rgba(124, 58, 237, 0.10)', border: 'rgba(124, 58, 237, 0.35)' },
  6: { accent: '#7c3aed', soft: 'rgba(124, 58, 237, 0.06)', border: 'rgba(124, 58, 237, 0.25)' },
};

const stageSizeLabel = (stage: ProductionFlowStage): string | null => {
  const parts: string[] = [];
  if (stage.wireSizeMm != null) parts.push(`Wire ${formatDimension(stage.wireSizeMm)} mm`);
  if (stage.diameterMm != null) parts.push(`Ø ${formatDimension(stage.diameterMm)} mm`);
  if (stage.thicknessMm != null && stage.widthMm != null) {
    parts.push(`T ${formatDimension(stage.thicknessMm)} × W ${formatDimension(stage.widthMm)} mm`);
  } else if (stage.thicknessMm != null) {
    parts.push(`T ${formatDimension(stage.thicknessMm)} mm`);
  } else if (stage.widthMm != null) {
    parts.push(`W ${formatDimension(stage.widthMm)} mm`);
  }
  if (stage.lengthPerPiece != null) {
    parts.push(`L ${formatDimension(stage.lengthPerPiece)}${stage.baseUomName ? ` ${stage.baseUomName}` : ''}`);
  }
  return parts.length > 0 ? parts.join(' · ') : null;
};

interface StageBlockProps {
  stage: ProductionFlowStage;
}

export const StageBlock: React.FC<StageBlockProps> = ({ stage }) => {
  const colors = STAGE_COLORS[stage.sequence] ?? STAGE_COLORS[1];
  const isProcess = stage.kind === 'process';

  if (!stage.configured) {
    return (
      <div
        style={{
          flex: '1 1 200px',
          minWidth: 200,
          maxWidth: 300,
          padding: '10px 14px',
          borderRadius: 8,
          border: '1px dashed var(--theme-border, rgba(148, 163, 184, 0.35))',
          background: 'var(--theme-surface-alt, rgba(255,255,255,0.03))',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <span
            style={{
              fontFamily: 'monospace',
              fontSize: 11,
              fontWeight: 700,
              color: colors.accent,
              background: colors.soft,
              padding: '1px 6px',
              borderRadius: 3,
              border: `1px solid ${colors.border}`,
            }}
          >
            {String(stage.sequence).padStart(2, '0')}
          </span>
          <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--theme-text-muted, #94a3b8)' }}>
            {stage.title.toLowerCase()}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 0', color: '#94a3b8' }}>
          <MinusCircleOutlined style={{ fontSize: 16 }} />
          <Text type="secondary" style={{ fontSize: 12, fontStyle: 'italic' }}>Not configured</Text>
        </div>
      </div>
    );
  }

  const size = stageSizeLabel(stage);

  return (
    <div
      style={{
        flex: '1 1 200px',
        minWidth: 200,
        maxWidth: 300,
        padding: '10px 14px',
        borderRadius: 8,
        border: stage.isCurrent
          ? `2px solid ${colors.accent}`
          : `1px solid ${colors.border}`,
        background: colors.soft,
        position: 'relative',
      }}
    >
      {stage.isCurrent && (
        <div
          style={{
            position: 'absolute',
            top: -10,
            left: 12,
            background: colors.accent,
            color: '#fff',
            fontSize: 9,
            fontWeight: 700,
            padding: '2px 8px',
            borderRadius: 4,
            letterSpacing: 0.5,
          }}
        >
          CURRENT
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <span
          style={{
            fontFamily: 'monospace',
            fontSize: 11,
            fontWeight: 700,
            color: colors.accent,
            background: colors.soft,
            padding: '1px 6px',
            borderRadius: 3,
            border: `1px solid ${colors.border}`,
            minWidth: 24,
            textAlign: 'center',
          }}
        >
          {String(stage.sequence).padStart(2, '0')}
        </span>
        <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--theme-text-muted, #94a3b8)' }}>
          {isProcess ? 'PROCESS' : 'OUTPUT · SIZE'}
        </span>
      </div>
      <div
        style={{
          fontSize: 12,
          fontWeight: 700,
          color: 'var(--theme-text, inherit)',
          marginBottom: 4,
          textTransform: 'uppercase',
          letterSpacing: 0.4,
        }}
      >
        {stage.title}

      </div>

      {isProcess ? (
        <>
          {/* Process block — department + operation emphasis */}
          <Tooltip title={`${stage.departmentName ?? 'No department'} · ${stage.operationName ?? 'No operation'}`}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
              <CheckCircleOutlined style={{ color: colors.accent, fontSize: 14 }} />
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--theme-text, inherit)' }}>
                {stage.operationName || stage.departmentName || 'Manufacturing Operation'}
              </span>
            </div>
          </Tooltip>
          {stage.operationCode && (
            <code
              style={{
                display: 'inline-block',
                background: 'var(--theme-hover, rgba(255,255,255,0.08))',
                color: 'var(--theme-accent, #38bdf8)',
                padding: '1px 6px',
                borderRadius: 3,
                fontSize: 10,
                fontFamily: 'monospace',
                marginTop: 4,
              }}
            >
              {stage.operationCode}
            </code>
          )}
          {stage.departmentName && (
            <div style={{ fontSize: 10, color: 'var(--theme-text-muted, #94a3b8)', marginTop: 2 }}>
              Department: {stage.departmentName}
            </div>
          )}
          {/* Reference item at this stage */}
          {stage.itemCode && (
            <div style={{ marginTop: 6, borderTop: `1px solid ${colors.border}`, paddingTop: 5 }}>
              <Tooltip title={`${stage.itemCode} — ${stage.itemName ?? ''}`}>
                <code style={{ fontSize: 10, fontFamily: 'monospace', color: 'var(--theme-accent, #38bdf8)' }}>
                  {stage.itemCode}
                </code>
              </Tooltip>
              {stage.itemName && (
                <div style={{ fontSize: 10, color: 'var(--theme-text-muted, #94a3b8)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={stage.itemName}>
                  {stage.itemName}
                </div>
              )}
            </div>
          )}
        </>
      ) : (
        <>
          {/* Output/specification block — item + size emphasis */}
          <Tooltip title={`${stage.itemCode ?? ''} — ${stage.itemName ?? ''}`}>
            <div
              style={{
                fontWeight: 600,
                fontSize: 13,
                fontFamily: 'monospace',
                color: 'var(--theme-accent, #38bdf8)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {stage.itemCode}
            </div>
          </Tooltip>
          <div
            style={{
              fontSize: 11,
              color: 'var(--theme-text, inherit)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
            title={stage.itemName ?? undefined}
          >
            {stage.itemName}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center', marginTop: 4 }}>
            {stage.itemType && (
              <Tag color="default" style={{ margin: 0, fontSize: 10 }}>{itemTypeLabel(stage.itemType)}</Tag>
            )}
            {stage.baseUomName && (
              <Tag color="blue" style={{ margin: 0, fontSize: 10 }}>{stage.baseUomName}</Tag>
            )}
          </div>
          {/* Size / specification — the item's own configured dimensions */}
          {size ? (
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--theme-text, inherit)', marginTop: 4 }}>
              {size}
            </div>
          ) : (
            <div style={{ fontSize: 10, color: 'var(--theme-text-muted, #94a3b8)', marginTop: 4, fontStyle: 'italic' }}>
              No size configured
            </div>
          )}
          {stage.departmentName && (
            <div style={{ fontSize: 10, color: 'var(--theme-text-muted, #94a3b8)', marginTop: 2 }}>
              Dept: {stage.departmentName}
            </div>
          )}
        </>
      )}
    </div>
  );
};

const QRCodeDisplay: React.FC<{ itemId: string }> = ({ itemId }) => {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    apiService
      .get<{ success: boolean; data: { dataUrl: string; payload: string; url: string } }>(`/master-data/items/${itemId}/qr`)
      .then((res) => {
        if (!cancelled && res?.data?.dataUrl) setDataUrl(res.data.dataUrl);
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [itemId]);

  if (loading) return <Spin size="small" />;
  if (!dataUrl) return <Text type="secondary" style={{ fontSize: 11 }}>QR unavailable</Text>;

  return (
    <div style={{ textAlign: 'center' }}>
      <img src={dataUrl} alt="QR Code" style={{ maxWidth: 110, maxHeight: 110 }} />
    </div>
  );
};

const CardShell: React.FC<{ title: React.ReactNode; children: React.ReactNode; style?: React.CSSProperties }> = ({ title, children, style }) => (
  <Card size="small" title={title} style={{ borderRadius: 8, ...style }}>
    {children}
  </Card>
);

const ProductionFlowCard: React.FC<ProductionFlowCardProps> = ({ itemId, style }) => {
  const [flow, setFlow] = useState<ProductionFlowResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchFlow = useCallback(() => {
    if (!itemId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    apiService
      .get<{ success: boolean; data: ProductionFlowResponse }>(`/master-data/items/${itemId}/production-flow`)
      .then((res) => {
        if (!cancelled && res?.data) setFlow(res.data);
      })
      .catch((err) => {
        if (!cancelled) setError(err?.response?.data?.message || 'Failed to load production flow');
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [itemId]);

  useEffect(() => fetchFlow(), [fetchFlow]);

  const title = (
    <Space>
      <ApartmentOutlined style={{ color: 'var(--theme-accent, #0284c7)' }} />
      <span style={{ fontWeight: 600 }}>Production Flow</span>
      <Tag color="purple" style={{ margin: 0 }}>01 → 06</Tag>
    </Space>
  );

  if (loading) {
    return (
      <CardShell title={title} style={style}>
        <div style={{ textAlign: 'center', padding: 20 }}>
          <Spin tip="Loading production flow..." size="large">
            <div style={{ minHeight: 48 }} />
          </Spin>
        </div>
      </CardShell>
    );
  }

  if (error) {
    return (
      <CardShell title={title} style={style}>
        <Text type="danger" style={{ fontSize: 12 }}>{error}</Text>
      </CardShell>
    );
  }

  if (!flow || !Array.isArray(flow.stages) || flow.stages.length === 0) {
    return (
      <CardShell title={title} style={style}>
        <Text type="secondary" style={{ fontSize: 12 }}>
          Production flow is not configured for this item.
        </Text>
      </CardShell>
    );
  }

  const { stages, current, currentOperation } = flow;
  const configuredCount = stages.filter((s) => s.configured).length;

  return (
    <Card
      size="small"
      title={title}
      style={{ borderRadius: 8, ...style }}
    >
      {/* Status strip */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 8,
          marginBottom: 10,
        }}
      >
        <Tag color="geekblue" style={{ margin: 0 }}>Current: {current.itemCode}</Tag>
        <Tag color="cyan" style={{ margin: 0 }}>Operation: {currentOperation || 'Manufacturing'}</Tag>
        <Tag color="green" style={{ margin: 0 }}>
          {configuredCount} / 6 stages configured
        </Tag>
      </div>

      {/* Six-stage flow: 01 → 06 */}
      <div
        style={{
          display: 'flex',
          alignItems: 'stretch',
          gap: 0,
          overflowX: 'auto',
          padding: '8px 0 4px',
        }}
      >
        {stages.map((stage, idx) => (
          <React.Fragment key={`${stage.sequence}-${stage.stageKey}`}>
            <StageBlock stage={stage} />
            {idx < stages.length - 1 && (
              <div style={{ display: 'flex', alignItems: 'center', padding: '0 6px', flexShrink: 0 }}>
                <ArrowRightOutlined style={{ color: 'var(--theme-accent, #0284c7)', fontSize: 16 }} />
              </div>
            )}
          </React.Fragment>
        ))}
      </div>

      {/* Legend */}
      <div
        style={{
          marginTop: 8,
          display: 'flex',
          flexWrap: 'wrap',
          gap: 12,
          padding: '6px 10px',
          background: 'var(--theme-surface-alt, rgba(255,255,255,0.03))',
          borderRadius: 6,
          border: '1px solid var(--theme-border, rgba(255,255,255,0.08))',
          fontSize: 11,
          color: 'var(--theme-text-muted, #94a3b8)',
        }}
      >
        <span><span style={{ fontWeight: 700 }}>{'01'}</span> Raw Material</span>
        <span><span style={{ fontWeight: 700 }}>{'02'}</span> Raw Material Specification</span>
        <span><span style={{ fontWeight: 700 }}>{'03'}</span> Flattening</span>
        <span><span style={{ fontWeight: 700 }}>{'04'}</span> Flattening Output</span>
        <span><span style={{ fontWeight: 700 }}>{'05'}</span> Spiral</span>
        <span><span style={{ fontWeight: 700 }}>{'06'}</span> Spiral Output</span>
      </div>

      {/* QR Code */}
      <div style={{ marginTop: 10, borderTop: '1px solid var(--theme-border, rgba(255,255,255,0.08))', paddingTop: 10 }}>
        <Text type="secondary" style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>
          QR Code
        </Text>
        <div style={{ marginTop: 4 }}>
          <QRCodeDisplay itemId={itemId} />
        </div>
      </div>
    </Card>
  );
};

export default ProductionFlowCard;