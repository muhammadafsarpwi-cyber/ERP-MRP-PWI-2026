import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Card, Space, Spin, Tag, Typography } from 'antd';
import { ApartmentOutlined, ArrowDownOutlined, ArrowRightOutlined, MinusCircleOutlined } from '@ant-design/icons';
import apiService from '../../../services/api';
import { formatDimension } from '../../../utils/numberFormat';
import {
  ITEM_TYPES,
  type ProductionFlowResponse,
  type ProductionFlowItemSummary,
} from './itemTypes';
import JsBarcode from 'jsbarcode';
const { Text } = Typography;

interface ProductionFlowCardProps {
  itemId: string;
  style?: React.CSSProperties;
}

const itemTypeLabel = (t?: string) => ITEM_TYPES.find((x) => x.value === t)?.label || t || '';

const FlowNode: React.FC<{
  label: string;
  sublabel?: string;
  itemCode?: string | null;
  itemName?: string | null;
  dimension?: string | null;
  uomName?: string | null;
  deptName?: string | null;
  itemType?: string | null;
  borderColor?: string;
  bgColor?: string;
  isCurrent?: boolean;
  barcode?: string | null;
  isNull?: boolean;
}> = ({
  label, sublabel, itemCode, itemName, dimension, uomName, deptName, itemType,
  borderColor = 'var(--theme-border, rgba(255,255,255,0.12))',
  bgColor = 'var(--theme-surface, rgba(0,0,0,0.25))',
  isCurrent = false,
  barcode,
  isNull = false,
}) => (
  <div
    style={{
      background: bgColor,
      padding: '10px 14px',
      borderRadius: 8,
      border: `${isCurrent ? '2px solid var(--theme-accent, #0284c7)' : '1px solid ' + borderColor}`,
      minWidth: 200,
      maxWidth: 300,
      flex: '1 1 200px',
      position: 'relative',
    }}
  >
    {isCurrent && (
      <div
        style={{
          position: 'absolute',
          top: -10,
          left: 12,
          background: 'var(--theme-accent, #0284c7)',
          color: '#fff',
          fontSize: 9,
          fontWeight: 700,
          padding: '2px 8px',
          borderRadius: 4,
          letterSpacing: 0.5,
          textTransform: 'uppercase',
        }}
      >
        CURRENT
      </div>
    )}
    <div
      style={{
        fontSize: 9,
        fontWeight: 700,
        color: 'var(--theme-text-muted, #94a3b8)',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        marginBottom: 4,
      }}
    >
      {label}
    </div>
    {isNull ? (
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 0' }}>
        <MinusCircleOutlined style={{ color: '#94a3b8', fontSize: 16 }} />
        <Text type="secondary" style={{ fontSize: 12, fontStyle: 'italic' }}>
          {sublabel || 'No item configured'}
        </Text>
      </div>
    ) : (
      <>
        {itemName && (
          <div
            style={{
              fontWeight: 600,
              fontSize: 13,
              color: 'var(--theme-text, inherit)',
              lineHeight: 1.3,
              marginBottom: 2,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
            title={itemName}
          >
            {itemName}
          </div>
        )}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center', marginTop: 4 }}>
          {itemCode && (
            <code
              style={{
                background: 'var(--theme-hover, rgba(255,255,255,0.08))',
                color: 'var(--theme-accent, #38bdf8)',
                padding: '1px 6px',
                borderRadius: 3,
                fontSize: 11,
                fontFamily: 'monospace',
              }}
            >
              {itemCode}
            </code>
          )}
          {itemType && (
            <Tag color="default" style={{ margin: 0, fontSize: 10 }}>
              {itemTypeLabel(itemType)}
            </Tag>
          )}
        </div>
        {dimension && (
          <div style={{ fontSize: 11, color: 'var(--theme-text-muted, #94a3b8)', marginTop: 4 }}>
            {dimension}
          </div>
        )}
        {uomName && (
          <div style={{ fontSize: 11, color: 'var(--theme-text-muted, #94a3b8)', marginTop: 2 }}>
            UOM: {uomName}
          </div>
        )}
        {deptName && (
          <div style={{ fontSize: 10, color: 'var(--theme-text-muted, #94a3b8)', marginTop: 2 }}>
            Dept: {deptName}
          </div>
        )}
        {barcode && (
          <div style={{ marginTop: 6 }}>
            <BarcodeValue value={barcode} />
          </div>
        )}
      </>
    )}
  </div>
);

const BarcodeValue: React.FC<{ value: string }> = ({ value }) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const attempted = useRef(false);

  const renderBarcode = useCallback(() => {
    const svg = svgRef.current;
    if (!svg || attempted.current) return;
    try {
      JsBarcode(svg, value, {
        format: 'CODE128',
        width: 1,
        height: 25,
        displayValue: true,
        fontSize: 9,
        font: 'monospace',
        textMargin: 1,
        margin: 2,
        background: 'transparent',
        lineColor: '#000',
      });
      attempted.current = true;
    } catch {
      if (svg) {
        svg.innerHTML = `<text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-family="monospace" font-size="9" fill="#999">${value}</text>`;
      }
      attempted.current = true;
    }
  }, [value]);

  useEffect(() => {
    attempted.current = false;
    const t = setTimeout(renderBarcode, 50);
    return () => clearTimeout(t);
  }, [renderBarcode, value]);

  return (
    <div style={{ overflow: 'visible' }}>
      <svg ref={svgRef} style={{ maxWidth: '100%', overflow: 'visible' }} />
    </div>
  );
};

const QRCodeDisplay: React.FC<{ itemId: string; itemName?: string }> = ({ itemId }) => {
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
      <img src={dataUrl} alt="QR Code" style={{ maxWidth: 120, maxHeight: 120 }} />
    </div>
  );
};

const ProductionFlowCard: React.FC<ProductionFlowCardProps> = ({ itemId, style }) => {
  const [flow, setFlow] = useState<ProductionFlowResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
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

  if (loading) {
    return (
      <Card size="small" title={<Space><ApartmentOutlined /> <span>Production Flow</span></Space>} style={{ borderRadius: 8, ...style }}>
        <div style={{ textAlign: 'center', padding: 20 }}>
          <Spin tip="Loading production flow..." size="large">
            <div style={{ minHeight: 48 }} />
          </Spin>
        </div>
      </Card>
    );
  }

  if (error) {
    return (
      <Card size="small" title={<Space><ApartmentOutlined /> <span>Production Flow</span></Space>} style={{ borderRadius: 8, ...style }}>
        <Text type="danger" style={{ fontSize: 12 }}>{error}</Text>
      </Card>
    );
  }

  if (!flow) return null;

  const { previous, current, currentOperation, next, fullRoute } = flow;

  const formatDimensionStr = (item: ProductionFlowItemSummary): string | null => {
    const parts: string[] = [];
    if (item.wireSizeMm != null) parts.push(`Wire: ${formatDimension(item.wireSizeMm)} mm`);
    if (item.diameterMm != null) parts.push(`Dia: ${formatDimension(item.diameterMm)} mm`);
    if (item.thicknessMm != null || item.widthMm != null) {
      parts.push(`${formatDimension(item.thicknessMm)} × ${formatDimension(item.widthMm)} mm`);
    }
    if (item.lengthPerPiece != null) parts.push(`L: ${formatDimension(item.lengthPerPiece)} m`);
    return parts.length > 0 ? parts.join(' | ') : null;
  };

  return (
    <Card
      size="small"
      title={
        <Space>
          <ApartmentOutlined style={{ color: 'var(--theme-accent, #0284c7)' }} />
          <span style={{ fontWeight: 600 }}>Production Flow</span>
          <Tag color="purple" style={{ margin: 0 }}>PAST → PRESENT → FUTURE</Tag>
        </Space>
      }
      style={{ borderRadius: 8, ...style }}
    >
      {/* Main Flow: Previous → Current → Next */}
      <div
        style={{
          display: 'flex',
          alignItems: 'stretch',
          gap: 0,
          overflowX: 'auto',
          padding: '8px 0',
        }}
      >
        {/* PREVIOUS */}
        <FlowNode
          label="1. INPUT / PAST"
          sublabel="No input material configured — root raw material"
          itemCode={previous?.itemCode}
          itemName={previous?.name}
          dimension={previous ? formatDimensionStr(previous) : null}
          uomName={previous?.baseUomName ?? null}
          deptName={previous?.departmentName ?? null}
          itemType={previous?.itemType}
          borderColor="rgba(139, 92, 246, 0.4)"
          bgColor="rgba(139, 92, 246, 0.06)"
          isNull={!previous}
        />

        {/* Arrow */}
        <div style={{ display: 'flex', alignItems: 'center', padding: '0 4px', flexShrink: 0 }}>
          <ArrowRightOutlined style={{ color: 'var(--theme-accent, #0284c7)', fontSize: 18 }} />
        </div>

        {/* CURRENT OPERATION */}
        <div
          style={{
            minWidth: 140,
            maxWidth: 200,
            flex: '0 0 auto',
            background: 'var(--theme-hover, rgba(255,255,255,0.05))',
            padding: '10px 12px',
            borderRadius: 8,
            border: '1px solid rgba(2, 132, 199, 0.3)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            textAlign: 'center',
          }}
        >
          <div
            style={{
              fontSize: 9,
              fontWeight: 700,
              color: '#0284c7',
              textTransform: 'uppercase',
              letterSpacing: 0.5,
              marginBottom: 4,
            }}
          >
            OPERATION
          </div>
          <div style={{ fontWeight: 600, fontSize: 12, color: 'var(--theme-text, inherit)' }}>
            {currentOperation || 'Manufacturing'}
          </div>
          {current.departmentName && (
            <div style={{ fontSize: 10, color: 'var(--theme-text-muted, #94a3b8)', marginTop: 2 }}>
              {current.departmentName}
            </div>
          )}
          {current.routeTypeName && (
            <Tag color="purple" style={{ marginTop: 4, fontSize: 10 }}>
              {current.routeTypeName}
            </Tag>
          )}
        </div>

        {/* Arrow */}
        <div style={{ display: 'flex', alignItems: 'center', padding: '0 4px', flexShrink: 0 }}>
          <ArrowRightOutlined style={{ color: 'var(--theme-accent, #0284c7)', fontSize: 18 }} />
        </div>

        {/* CURRENT OUTPUT */}
        <FlowNode
          label="2. OUTPUT / PRESENT"
          itemCode={current.itemCode}
          itemName={current.name}
          dimension={formatDimensionStr(current)}
          uomName={current.baseUomName ?? null}
          deptName={current.departmentName ?? null}
          itemType={current.itemType}
          borderColor="var(--theme-accent, #0284c7)"
          bgColor="rgba(2, 132, 199, 0.06)"
          isCurrent
          barcode={current.barcode}
        />

        {/* Arrow */}
        <div style={{ display: 'flex', alignItems: 'center', padding: '0 4px', flexShrink: 0 }}>
          <ArrowRightOutlined style={{ color: 'var(--theme-accent, #0284c7)', fontSize: 18 }} />
        </div>

        {/* NEXT */}
        {next.items.length > 0 ? (
          <FlowNode
            label="3. NEXT / FUTURE"
            itemCode={next.items[0]?.itemCode}
            itemName={next.items[0]?.name}
            dimension={next.items[0] ? formatDimensionStr(next.items[0]) : null}
            uomName={next.items[0]?.baseUomName ?? null}
            deptName={next.items[0]?.departmentName ?? null}
            itemType={next.items[0]?.itemType}
            borderColor="rgba(16, 185, 129, 0.4)"
            bgColor="rgba(16, 185, 129, 0.06)"
          />
        ) : (
          <FlowNode
            label="3. NEXT / FUTURE"
            sublabel={current.itemType === 'FINISHED_GOOD'
              ? 'Finished — ready for dispatch'
              : 'No next operation configured'}
            isNull
            borderColor="rgba(16, 185, 129, 0.3)"
            bgColor="rgba(16, 185, 129, 0.04)"
          />
        )}
      </div>

      {/* Next items list (if multiple consumers) */}
      {next.items.length > 1 && (
        <div style={{ marginTop: 8, padding: '6px 10px', background: 'var(--theme-surface-alt, rgba(255,255,255,0.03))', borderRadius: 6, border: '1px solid var(--theme-border, rgba(255,255,255,0.08))' }}>
          <Text type="secondary" style={{ fontSize: 11 }}>
            This item feeds into {next.items.length} downstream items:
          </Text>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
            {next.items.map((ni) => (
              <Tag key={ni.id} color="green" style={{ margin: 0 }}>
                {ni.itemCode} — {ni.name}
              </Tag>
            ))}
          </div>
        </div>
      )}

      {/* Full Route */}
      {fullRoute.length > 2 && (
        <div style={{ marginTop: 12, borderTop: '1px solid var(--theme-border, rgba(255,255,255,0.08))', paddingTop: 10 }}>
          <Text type="secondary" style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            Full Production Route ({fullRoute.length} stages)
          </Text>
          <div style={{ display: 'flex', alignItems: 'center', overflowX: 'auto', gap: 4, marginTop: 6, padding: '4px 0' }}>
            {fullRoute.map((stage, idx) => (
              <React.Fragment key={stage.itemId}>
                <div
                  style={{
                    minWidth: 100,
                    padding: '4px 8px',
                    borderRadius: 4,
                    border: stage.isCurrent
                      ? '2px solid var(--theme-accent, #0284c7)'
                      : '1px solid var(--theme-border, rgba(255,255,255,0.12))',
                    background: stage.isCurrent
                      ? 'rgba(2, 132, 199, 0.1)'
                      : 'var(--theme-surface-alt, rgba(255,255,255,0.03))',
                    textAlign: 'center',
                    flexShrink: 0,
                  }}
                >
                  <div style={{ fontSize: 8, fontWeight: 700, color: 'var(--theme-text-muted, #94a3b8)' }}>
                    STAGE {stage.stageOrder}
                  </div>
                  <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--theme-text, inherit)' }}>
                    {stage.stageName}
                  </div>
                  <div style={{ fontSize: 9, color: 'var(--theme-text-muted, #94a3b8)', fontFamily: 'monospace' }}>
                    {stage.itemCode}
                  </div>
                </div>
                {idx < fullRoute.length - 1 && (
                  <ArrowDownOutlined style={{ color: 'var(--theme-text-muted, #94a3b8)', fontSize: 10, transform: 'rotate(-90deg)', flexShrink: 0 }} />
                )}
              </React.Fragment>
            ))}
          </div>
        </div>
      )}

      {/* QR Code */}
      <div style={{ marginTop: 10, borderTop: '1px solid var(--theme-border, rgba(255,255,255,0.08))', paddingTop: 10 }}>
        <Text type="secondary" style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>
          QR Code
        </Text>
        <div style={{ marginTop: 4 }}>
          <QRCodeDisplay itemId={itemId} itemName={current.name} />
        </div>
      </div>
    </Card>
  );
};

export default ProductionFlowCard;
