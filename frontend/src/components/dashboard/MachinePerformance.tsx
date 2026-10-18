import React, { useState, useMemo } from 'react';
import { Button, Select, Space } from 'antd';
import { RightOutlined, ToolOutlined } from '@ant-design/icons';
import {
  achLevel, EmptyState, fmtQty, SectionCard, SkeletonRows,
} from './dashboardShared';
import type { MachinePerformanceItem } from '../../services/dashboardService';

interface MachinePerformanceProps {
  items: MachinePerformanceItem[];
  loading: boolean;
  nav: (path: string) => void;
}

const safeAch = (v: number): number => (Number.isFinite(v) ? Math.max(0, Math.min(100, v)) : 0);

const TOP_OPTIONS = [
  { value: 5, label: 'Top 5' },
  { value: 8, label: 'Top 8' },
  { value: 10, label: 'Top 10' },
  { value: 15, label: 'Top 15' },
  { value: 20, label: 'Top 20' },
  { value: 9999, label: 'All' },
];

const MachinePerformance: React.FC<MachinePerformanceProps> = ({ items, loading, nav }) => {
  const [topCount, setTopCount] = useState<number>(8);

  const ranked = useMemo(() => {
    const sorted = [...items].sort((a, b) => b.avgAchievement - a.avgAchievement);
    return topCount === 9999 ? sorted : sorted.slice(0, topCount);
  }, [items, topCount]);

  const subtitle = topCount === 9999
    ? `All ${items.length} machines by achievement`
    : `Top ${Math.min(topCount, items.length || topCount)} by achievement`;

  if (loading && items.length === 0) {
    return (
      <SectionCard icon={<ToolOutlined />} title="Machine Performance" subtitle="Operational ranking">
        <SkeletonRows rows={topCount === 9999 ? 8 : Math.min(topCount, 8)} />
      </SectionCard>
    );
  }

  return (
    <SectionCard
      icon={<ToolOutlined />}
      title="Machine Performance"
      subtitle={subtitle}
      extra={
        <Space size={8} align="center">
          <Select
            size="small"
            value={topCount}
            onChange={(val) => setTopCount(val)}
            style={{ width: 95 }}
            options={TOP_OPTIONS}
            popupMatchSelectWidth={false}
          />
          <Button size="small" type="link" className="erp-link-btn" onClick={() => nav('/master-data/machines')}>
            View All <RightOutlined />
          </Button>
        </Space>
      }
    >
      {ranked.length > 0 ? (
        <div
          className="erp-machines"
          style={{
            maxHeight: topCount > 8 ? 480 : undefined,
            overflowY: topCount > 8 ? 'auto' : undefined,
            paddingRight: topCount > 8 ? 4 : 0,
          }}
        >
          {ranked.map((m) => {
            const pct = safeAch(m.avgAchievement);
            const level = achLevel(pct);
            return (
              <div
                key={m.id}
                className="erp-machine-row"
                role="button"
                tabIndex={0}
                aria-label={`${m.machineName}, achievement ${pct.toFixed(1)} percent`}
                onClick={() => nav('/production/machines')}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') nav('/production/machines');
                }}
              >
                <div className="erp-machine-row__ident">
                  <div className="erp-machine-row__code">
                    <span className={`erp-machine-row__dot erp-machine-row__dot--${level}`} aria-hidden="true" />
                    {m.machineCode}
                  </div>
                  {m.departmentName && <div className="erp-machine-row__dept">{m.departmentName}</div>}
                </div>
                <div className="erp-machine-row__gauge">
                  <div className="erp-machine-row__track">
                    <div
                      className={`erp-machine-row__fill erp-machine-row__fill--${level}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className={`erp-machine-row__value erp-machine-row__value--${level}`}>
                    {pct.toFixed(1)}%
                  </span>
                </div>
                <div className="erp-machine-row__stats">
                  <span className="erp-machine-row__stat" title="Target">
                    <i>T</i> {fmtQty(m.targetQuantity)}
                  </span>
                  <span className="erp-machine-row__stat" title="Actual">
                    <i>A</i> {fmtQty(m.actualQuantity)}
                  </span>
                  <span className="erp-machine-row__stat" title="Scrap">
                    <i>S</i> {fmtQty(m.scrapQuantity)}
                  </span>
                  <span className="erp-machine-row__stat" title="Entries">
                    <i>E</i> {m.entryCount}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <EmptyState
          icon={<ToolOutlined />}
          title="No machine performance data available"
          desc="Performance metrics appear once entries are recorded"
        />
      )}
    </SectionCard>
  );
};

export default MachinePerformance;