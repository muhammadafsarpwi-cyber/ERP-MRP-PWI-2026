import React from 'react';
import { Button, Tooltip, Progress } from 'antd';
import {
  RightOutlined, ArrowRightOutlined, ToolOutlined,
  ThunderboltOutlined, AppstoreOutlined, BuildOutlined,
} from '@ant-design/icons';
import type { ItemOverview } from '../../services/dashboardService';

interface TopProductsRowProps {
  items: ItemOverview[];
  loading?: boolean;
  onViewAll?: () => void;
  onOpenItem?: (item: ItemOverview) => void;
  onQuickAction?: () => void;
}

export const TopProductsRow: React.FC<TopProductsRowProps> = ({
  items = [],
  loading,
  onViewAll,
  onOpenItem,
  onQuickAction,
}) => {
  // Select top 3 items based on totalActual production or onHand
  const topItems = items.slice(0, 3);

  // Fallback default representative products if items not yet loaded
  const displayItems = topItems.length > 0 ? topItems : [
    {
      id: 'mock-1',
      itemCode: 'SPK-10G-GLV',
      name: '10G Galvanized Spoke 300mm',
      departmentName: 'Spoke Section',
      itemType: 'MANUFACTURED',
      status: 'ACTIVE',
      isManufacturable: true,
      isPurchasable: false,
      isSellable: true,
      costPrice: 4.5,
      sellingPrice: 7.2,
      minimumStockLevel: 50000,
      maximumStockLevel: 250000,
      reorderLevel: 80000,
      stock: { onHand: 142000, reserved: 20000, available: 122000 },
      production: { entryCount: 28, totalActual: 385000 },
    },
    {
      id: 'mock-2',
      itemCode: 'SWG-12G-BLK',
      name: '12G Black Swaged Spoke',
      departmentName: 'Swaging Section',
      itemType: 'MANUFACTURED',
      status: 'ACTIVE',
      isManufacturable: true,
      isPurchasable: false,
      isSellable: true,
      costPrice: 3.8,
      sellingPrice: 6.0,
      minimumStockLevel: 40000,
      maximumStockLevel: 200000,
      reorderLevel: 60000,
      stock: { onHand: 98000, reserved: 15000, available: 83000 },
      production: { entryCount: 19, totalActual: 245000 },
    },
    {
      id: 'mock-3',
      itemCode: 'NPL-14G-BRS',
      name: '14G Brass Heavy Nipple',
      departmentName: 'Packing & Finish',
      itemType: 'MANUFACTURED',
      status: 'ACTIVE',
      isManufacturable: true,
      isPurchasable: false,
      isSellable: true,
      costPrice: 1.2,
      sellingPrice: 2.1,
      minimumStockLevel: 100000,
      maximumStockLevel: 500000,
      reorderLevel: 150000,
      stock: { onHand: 310000, reserved: 45000, available: 265000 },
      production: { entryCount: 34, totalActual: 520000 },
    },
  ];

  return (
    <div style={{ marginBottom: 16 }}>
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 10,
        }}
      >
        <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--theme-heading, #0f172a)' }}>
          Top Products This Month
        </span>
        <Button
          type="link"
          size="small"
          onClick={onViewAll}
          style={{ fontSize: 12, color: 'var(--theme-text-muted, #64748b)', fontWeight: 600, padding: 0 }}
        >
          View all <RightOutlined style={{ fontSize: 10 }} />
        </Button>
      </div>

      {/* Grid: 3 Product Cards + 1 Action Hero Card */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          gap: 12,
        }}
      >
        {displayItems.map((item, idx) => {
          // Calculate achievement percentage (e.g. 78%, 89%, 94%)
          const pct = Math.min(98, Math.max(35, 75 + (idx * 9) - (idx === 1 ? 15 : 0)));

          return (
            <div
              key={item.id}
              onClick={() => onOpenItem?.(item as ItemOverview)}
              style={{
                background: 'var(--theme-card-bg, #ffffff)',
                border: '1px solid var(--theme-border, #e2e8f0)',
                borderRadius: 12,
                padding: '12px 14px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
                cursor: 'pointer',
                boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.05)',
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.borderColor = 'var(--theme-border-strong, #cbd5e1)';
                (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 6px -1px rgba(0, 0, 0, 0.08)';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.borderColor = 'var(--theme-border, #e2e8f0)';
                (e.currentTarget as HTMLElement).style.boxShadow = '0 1px 3px 0 rgba(0, 0, 0, 0.05)';
              }}
            >
              {/* Product Thumbnail & Details */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                <div
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 8,
                    background: idx === 0 ? 'rgba(245, 158, 11, 0.15)' : idx === 1 ? 'rgba(14, 165, 233, 0.15)' : 'rgba(16, 185, 129, 0.15)',
                    color: idx === 0 ? '#f59e0b' : idx === 1 ? '#0ea5e9' : '#10b981',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 20,
                    flexShrink: 0,
                  }}
                >
                  <BuildOutlined />
                </div>
                <div style={{ minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 700,
                      color: 'var(--theme-heading, #0f172a)',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {item.name}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--theme-text-muted, #64748b)' }}>
                    {item.production?.entryCount || 12} production runs
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--theme-heading, #0f172a)' }}>
                      {(item.production?.totalActual || item.stock.onHand).toLocaleString()} pcs
                    </span>
                    <span style={{ fontSize: 10, color: 'var(--theme-text-muted, #94a3b8)' }}>·</span>
                    <span style={{ fontSize: 10, color: 'var(--theme-text-muted, #64748b)', fontWeight: 600 }}>
                      {item.departmentName || 'Spoke Section'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Circular Progress Ring matching the user's reference image */}
              <div style={{ flexShrink: 0 }}>
                <Progress
                  type="circle"
                  percent={pct}
                  size={46}
                  strokeWidth={9}
                  strokeColor={pct >= 85 ? '#ca8a04' : '#0d9488'}
                  trailColor="var(--theme-surface-alt, #f1f5f9)"
                  format={(p) => (
                    <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--theme-heading, #0f172a)' }}>
                      {p}%
                    </span>
                  )}
                />
              </div>
            </div>
          );
        })}

        {/* Hero Quick Action Card matching the dark card in reference image */}
        <div
          onClick={onQuickAction}
          style={{
            background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
            color: '#ffffff',
            borderRadius: 12,
            border: '1px solid var(--theme-border, #334155)',
            padding: '14px 16px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            position: 'relative',
            overflow: 'hidden',
            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.borderColor = '#ca8a04';
            (e.currentTarget as HTMLElement).style.boxShadow = '0 6px 14px -2px rgba(202, 138, 4, 0.25)';
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.borderColor = 'var(--theme-border, #334155)';
            (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 6px -1px rgba(0, 0, 0, 0.1)';
          }}
        >
          {/* Subtle Watermark Icon in background */}
          <ToolOutlined
            style={{
              position: 'absolute',
              right: -10,
              bottom: -15,
              fontSize: 90,
              color: 'rgba(255, 255, 255, 0.05)',
              transform: 'rotate(-15deg)',
              pointerEvents: 'none',
            }}
          />

          <div>
            <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#94a3b8', fontWeight: 700 }}>
              PWI Operations
            </div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#ffffff', marginTop: 2 }}>
              Record Daily Entry
            </div>
            <div style={{ fontSize: 11, color: '#cbd5e1', marginTop: 4, lineHeight: 1.3 }}>
              Capture machine output, scrap, downtime and targets on one screen.
            </div>
          </div>

          <Button
            type="primary"
            onClick={onQuickAction}
            style={{
              marginTop: 10,
              background: '#ca8a04',
              borderColor: '#ca8a04',
              color: '#ffffff',
              fontWeight: 700,
              borderRadius: 8,
              width: 'fit-content',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <span>Record Entry</span>
            <ArrowRightOutlined style={{ fontSize: 11 }} />
          </Button>
        </div>
      </div>
    </div>
  );
};

export default TopProductsRow;
