import React from 'react';
import { TeamOutlined } from '@ant-design/icons';
import {
  achLevel, EmptyState, fmtQty, levelColor, SectionCard, SkeletonRows,
} from './dashboardShared';
import type { ProductionSummary } from '../../services/dashboardService';

interface DepartmentPerformanceProps {
  data: ProductionSummary | null;
  loading: boolean;
}

const STATUS_LABELS = {
  high: 'On Track',
  medium: 'Attention',
  low: 'Critical',
} as const;

const DepartmentPerformance: React.FC<DepartmentPerformanceProps> = ({ data, loading }) => {
  if (loading && !data) {
    return (
      <SectionCard icon={<TeamOutlined />} title="Department Performance">
        <SkeletonRows rows={6} />
      </SectionCard>
    );
  }

  const departments = data?.departments ?? [];

  return (
    <SectionCard
      icon={<TeamOutlined />}
      title="Department Performance"
      subtitle={data ? `${departments.length} departments` : undefined}
    >
      {departments.length > 0 ? (
        <div className="erp-scroll-x">
          <table className="erp-data-table erp-dept-table">
            <thead>
              <tr>
                <th>Department</th>
                <th style={{ textAlign: 'right' }}>Target</th>
                <th style={{ textAlign: 'right' }}>Actual</th>
                <th style={{ textAlign: 'right' }}>Scrap</th>
                <th style={{ textAlign: 'right', minWidth: 140 }}>Achievement</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {departments.map((d) => {
                const achPct = Math.max(0, Math.min(100, d.achievementPercentage));
                const level = achLevel(d.achievementPercentage);
                return (
                  <tr key={d.departmentId}>
                    <td>
                      <div className="erp-dept-name">{d.departmentName}</div>
                      <div className="erp-dept-name__sub">{d.entryCount} entries</div>
                    </td>
                    <td className="erp-num">{fmtQty(d.targetQuantity)}</td>
                    <td className="erp-num">{fmtQty(d.actualQuantity)}</td>
                    <td className={`erp-num${d.scrapQuantity > 0 ? ' erp-num--danger' : ''}`}>{fmtQty(d.scrapQuantity)}</td>
                    <td>
                      <div className="erp-dept-ach">
                        <div className="erp-dept-ach__track">
                          <div className={`erp-dept-ach__fill erp-dept-ach__fill--${level}`} style={{ width: `${achPct}%` }} />
                        </div>
                        <span className="erp-dept-ach__value" style={{ color: levelColor(level) }}>
                          {d.achievementPercentage.toFixed(1)}%
                        </span>
                      </div>
                    </td>
                    <td>
                      <span className={`erp-status-chip erp-status-chip--${level}`}>
                        {STATUS_LABELS[level]}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState
          icon={<TeamOutlined />}
          title="No department performance for the selected period"
          desc="Department metrics appear once production is recorded"
        />
      )}
    </SectionCard>
  );
};

export default DepartmentPerformance;