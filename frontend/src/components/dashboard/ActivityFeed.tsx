import React from 'react';
import {
  CheckCircleOutlined, ClockCircleOutlined, CloseCircleOutlined, InfoCircleOutlined, RiseOutlined,
} from '@ant-design/icons';
import { EmptyState, SectionCard, SkeletonRows } from './dashboardShared';
import type { ActivityItem } from '../../services/dashboardService';

interface ActivityFeedProps {
  activity: ActivityItem[];
  loading: boolean;
}

type ActionClass = 'create' | 'update' | 'delete' | 'other';

const classify = (action: string): ActionClass => {
  const a = (action || '').toLowerCase();
  if (a.includes('delete') || a.includes('remove')) return 'delete';
  if (a.includes('create') || a.includes('add') || a.includes('register')) return 'create';
  if (a.includes('update') || a.includes('edit') || a.includes('change') || a.includes('approve')) return 'update';
  return 'other';
};

const ACTION_ICON: Record<ActionClass, React.ReactNode> = {
  create: <CheckCircleOutlined />,
  update: <RiseOutlined />,
  delete: <CloseCircleOutlined />,
  other: <InfoCircleOutlined />,
};

const formatTimestamp = (iso: string): string => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const date = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const time = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  return `${date} · ${time}`;
};

const ActivityFeed: React.FC<ActivityFeedProps> = ({ activity, loading }) => {
  if (loading && activity.length === 0) {
    return (
      <SectionCard icon={<ClockCircleOutlined />} title="Recent Activity" subtitle="Operational event stream">
        <SkeletonRows rows={6} />
      </SectionCard>
    );
  }

  return (
    <SectionCard
      icon={<ClockCircleOutlined />}
      title="Recent Activity"
      subtitle="Operational event stream"
    >
      {activity.length > 0 ? (
        <div className="erp-activity">
          {activity.slice(0, 10).map((a) => {
            const kind = classify(a.action);
            return (
              <div key={a.id} className="erp-activity-row">
                <span className={`erp-activity-row__icon erp-activity-row__icon--${kind}`} aria-hidden="true">
                  {ACTION_ICON[kind]}
                </span>
                <div className="erp-activity-row__body">
                  <div className="erp-activity-row__top">
                    <span className={`erp-activity-row__action erp-activity-row__action--${kind}`}>{a.action}</span>
                    <span className="erp-activity-row__target">
                      {a.targetType}
                      {a.targetName ? `: ${a.targetName}` : ''}
                    </span>
                  </div>
                  <div className="erp-activity-row__meta">
                    <span className="erp-activity-row__actor">{a.actorEmail}</span>
                    <span className="erp-activity-row__sep" aria-hidden="true">·</span>
                    <time dateTime={a.createdAt}>{formatTimestamp(a.createdAt)}</time>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <EmptyState
          icon={<ClockCircleOutlined />}
          title="No recent activity"
          desc="System events will appear here as users make changes"
        />
      )}
    </SectionCard>
  );
};

export default ActivityFeed;