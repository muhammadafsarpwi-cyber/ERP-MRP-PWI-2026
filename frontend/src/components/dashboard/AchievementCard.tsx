import React from 'react';
import { RiseOutlined } from '@ant-design/icons';
import {
  achLevel, EmptyState, fmtQty, levelColor, SectionCard, SkeletonChart,
} from './dashboardShared';
import type { ProductionSummary } from '../../services/dashboardService';

interface AchievementCardProps {
  data: ProductionSummary | null;
  loading: boolean;
}

/**
 * Executive achievement gauge. A restrained SVG ring (no chart framework
 * overhead) with the achievement % centered, plus Target / Actual / Scrap /
 * Efficiency metrics beneath.
 */
const AchievementCard: React.FC<AchievementCardProps> = ({ data, loading }) => {
  if (loading && !data) {
    return (
      <SectionCard icon={<RiseOutlined />} title="Achievement Overview">
        <SkeletonChart height={250} />
      </SectionCard>
    );
  }

  if (!data) {
    return (
      <SectionCard icon={<RiseOutlined />} title="Achievement Overview">
        <EmptyState icon={<RiseOutlined />} title="No achievement data" />
      </SectionCard>
    );
  }

  // ── Defensive calculation guards ─────────────────────────────────────
  // Achievement = Actual ÷ Target × 100, Efficiency = Running ÷ (Running +
  // Downtime) × 100. Both are RECOMPUTED from the raw totals here (instead of
  // trusting a pre-rounded percentage field) so a stale or incorrect payload
  // can never render an inflated figure (e.g. 7711.8%). Division by zero and
  // non-finite inputs cleanly return 0%.
  const round2 = (v: number) => (Number.isFinite(v) ? Math.round(v * 100) / 100 : 0);

  const totalTarget = Number(data.summary.totalTarget);
  const totalActual = Number(data.summary.totalActual);
  const pct = totalTarget > 0 ? round2((totalActual / totalTarget) * 100) : 0;

  const runningHours = Number(data.summary.totalRunningHours);
  const downtimeHours = Number(data.summary.totalDowntimeHours);
  const efficiencyPct = runningHours + downtimeHours > 0
    ? round2((runningHours / (runningHours + downtimeHours)) * 100)
    : 0;

  const level = achLevel(pct);
  const ringPct = Math.max(0, Math.min(100, pct));

  return (
    <SectionCard icon={<RiseOutlined />} title="Achievement Overview">
      <div className="erp-achievement">
        <div className="erp-achievement__gauge">
          <svg
            className="erp-achievement__ring"
            viewBox="0 0 160 160"
            role="img"
            aria-label={`Overall achievement ${pct.toFixed(1)} percent`}
          >
            <circle className="erp-achievement__ring-track" cx="80" cy="80" r="66" />
            <circle
              className="erp-achievement__ring-fill"
              cx="80"
              cy="80"
              r="66"
              pathLength={100}
              strokeDasharray={`${ringPct} 100`}
              style={{ stroke: levelColor(level) }}
            />
          </svg>
          <div className="erp-achievement__center">
            <div className="erp-achievement__percentage" style={{ color: levelColor(level) }}>
              {pct.toFixed(1)}%
            </div>
            <div className="erp-achievement__label">Achievement</div>
          </div>
        </div>

        <div className="erp-achievement__metrics">
          <div className="erp-achievement__metric">
            <span className="erp-achievement__metric-dot erp-achievement__metric-dot--target" />
            <div className="erp-achievement__metric-content">
              <div className="erp-achievement__metric-label">Target</div>
              <div className="erp-achievement__metric-value">{fmtQty(data.summary.totalTarget)}</div>
            </div>
          </div>
          <div className="erp-achievement__metric">
            <span className="erp-achievement__metric-dot erp-achievement__metric-dot--actual" />
            <div className="erp-achievement__metric-content">
              <div className="erp-achievement__metric-label">Actual</div>
              <div className="erp-achievement__metric-value">{fmtQty(data.summary.totalActual)}</div>
            </div>
          </div>
          <div className="erp-achievement__metric">
            <span className="erp-achievement__metric-dot erp-achievement__metric-dot--scrap" />
            <div className="erp-achievement__metric-content">
              <div className="erp-achievement__metric-label">Scrap</div>
              <div className="erp-achievement__metric-value">{fmtQty(data.summary.totalScrap)}</div>
            </div>
          </div>
          <div className="erp-achievement__metric">
            <span className="erp-achievement__metric-dot erp-achievement__metric-dot--efficiency" />
            <div className="erp-achievement__metric-content">
              <div className="erp-achievement__metric-label">Efficiency</div>
              <div className="erp-achievement__metric-value">{efficiencyPct.toFixed(1)}%</div>
            </div>
          </div>
        </div>
      </div>
    </SectionCard>
  );
};

export default AchievementCard;