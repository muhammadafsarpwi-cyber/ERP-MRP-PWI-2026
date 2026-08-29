import React from 'react';
import { Button } from 'antd';
import {
  ArrowDownOutlined, ArrowUpOutlined, DatabaseOutlined, HomeOutlined,
  RightOutlined, WarningOutlined,
} from '@ant-design/icons';
import { EmptyState, fmtQty, SectionCard, SkeletonRows, toShortDate } from './dashboardShared';
import type { InventorySummary } from '../../services/dashboardService';

interface InventoryHealthProps {
  inventory: InventorySummary | null;
  loading: boolean;
  nav: (path: string) => void;
}

const InventoryHealth: React.FC<InventoryHealthProps> = ({ inventory, loading, nav }) => {
  if (loading && !inventory) {
    return (
      <SectionCard icon={<DatabaseOutlined />} title="Inventory Health">
        <SkeletonRows rows={6} />
      </SectionCard>
    );
  }

  const whCount = inventory?.warehouses.length ?? 0;

  return (
    <SectionCard
      icon={<DatabaseOutlined />}
      title="Inventory Health"
      subtitle={inventory ? `${whCount} warehouse${whCount !== 1 ? 's' : ''}` : undefined}
      extra={
        <Button size="small" type="link" className="erp-link-btn" onClick={() => nav('/inventory')}>
          View <RightOutlined />
        </Button>
      }
    >
      {inventory ? (
        <div className="erp-inventory">
          {inventory.warehouses.length > 0 && (
            <div className="erp-wh-list">
              {inventory.warehouses.map((wh) => (
                <div key={wh.warehouseId} className="erp-wh">
                  <div className="erp-wh__header">
                    <div className="erp-wh__name">
                      <HomeOutlined className="erp-wh__home" aria-hidden="true" />
                      <span className="erp-wh__code">{wh.warehouseCode}</span>
                      {wh.warehouseName && <span className="erp-wh__label">{wh.warehouseName}</span>}
                    </div>
                    <span className="erp-wh__badge">{wh.totalItems} items</span>
                  </div>
                  <div className="erp-wh__metrics">
                    <div className="erp-wh__metric">
                      <span className="erp-wh__metric-label">On Hand</span>
                      <span className="erp-wh__metric-value">{fmtQty(wh.totalOnHand)}</span>
                    </div>
                    <div className="erp-wh__metric">
                      <span className="erp-wh__metric-label">Reserved</span>
                      <span className="erp-wh__metric-value erp-wh__metric-value--reserved">{fmtQty(wh.totalReserved)}</span>
                    </div>
                    <div className="erp-wh__metric erp-wh__metric--available">
                      <span className="erp-wh__metric-label">Available</span>
                      <span className="erp-wh__metric-value erp-wh__metric-value--available">{fmtQty(wh.totalAvailable)}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {inventory.lowStockItems.length > 0 && (
            <div className="erp-low-stock">
              <WarningOutlined aria-hidden="true" />
              <span>{inventory.lowStockItems.length} Low Stock Item{inventory.lowStockItems.length !== 1 ? 's' : ''}</span>
              <span className="erp-low-stock__hint">(below minimum)</span>
            </div>
          )}

          {inventory.recentTransactions.length > 0 && (
            <div className="erp-inventory__tx">
              <div className="erp-inventory__tx-head">Recent Transactions</div>
              <div>
                {inventory.recentTransactions.slice(0, 5).map((tx) => (
                  <div key={tx.id} className="erp-tx-row">
                    <span className={`erp-tx-row__dir erp-tx-row__dir--${tx.direction}`} aria-hidden="true">
                      {tx.direction === 'IN' ? <ArrowUpOutlined /> : <ArrowDownOutlined />}
                    </span>
                    <span className="erp-tx-row__item">{tx.itemCode}</span>
                    <span className="erp-tx-row__qty">
                      {tx.direction === 'IN' ? '+' : '−'}{fmtQty(tx.quantity)}
                    </span>
                    <span className="erp-tx-row__date">{toShortDate(tx.createdAt)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {inventory.warehouses.length === 0 && (
            <EmptyState
              icon={<DatabaseOutlined />}
              title="No warehouse data is available for this selection"
              desc="Warehouse stock levels will appear once inventory is configured"
            />
          )}
        </div>
      ) : (
        <EmptyState
          icon={<DatabaseOutlined />}
          title="Inventory data is not available"
          desc="Stock health appears once inventory is configured"
        />
      )}
    </SectionCard>
  );
};

export default InventoryHealth;