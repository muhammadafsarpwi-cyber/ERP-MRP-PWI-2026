import React from 'react';
import { Card, Tag, Empty, Tooltip } from 'antd';
import type { ActivityRow } from '../../../../services/storeDashboard';
import { activityTypeMeta, cardStyle, fmtDateTime, PRESET_HEX, sectionTitle, statusColor } from './helpers';

interface RecentActivityProps {
  activity: ActivityRow[];
}

const RecentActivity: React.FC<RecentActivityProps> = ({ activity }) => {
  return (
    <Card
      size="small"
      title={sectionTitle('Recent Activity')}
      style={cardStyle}
      styles={{ body: { padding: '4px 12px 12px' } }}
    >
      {activity.length === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No recent activity" />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {activity.map((row, index) => {
            const meta = activityTypeMeta(row.type);
            return (
              <div
                key={`${row.type}-${row.id}-${index}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '8px 0',
                  borderBottom: index < activity.length - 1 ? '1px solid var(--theme-border)' : 'none',
                }}
              >
                <span
                  style={{
                    width: 26,
                    height: 26,
                    borderRadius: 7,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 14,
                    flexShrink: 0,
                    color: PRESET_HEX[meta.color] || '#8c8c8c',
                    background: 'var(--theme-surface-alt)',
                  }}
                  title={meta.label}
                >
                  {meta.icon}
                </span>
                <div style={{ minWidth: 0, flexGrow: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <Tooltip title={meta.label}>
                      <span style={{ fontSize: 12.5, fontWeight: 600 }}>{row.document}</span>
                    </Tooltip>
                    <Tag color={statusColor(row.status)} style={{ marginInlineEnd: 0, fontSize: 11 }}>
                      {row.status}
                    </Tag>
                  </div>
                  <div
                    style={{
                      fontSize: 12,
                      color: 'var(--theme-text-muted)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                    title={row.summary}
                  >
                    {row.summary || [row.store, row.org].filter(Boolean).join(' · ')}
                  </div>
                </div>
                <span
                  style={{
                    fontSize: 11.5,
                    color: 'var(--theme-text-muted)',
                    flexShrink: 0,
                    alignSelf: 'flex-start',
                    marginTop: 2,
                  }}
                >
                  {fmtDateTime(row.date)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
};

export default RecentActivity;