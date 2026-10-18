import React from 'react';
import { Button, Tag, Tooltip } from 'antd';
import {
  ClockCircleOutlined, PlusOutlined, RightOutlined,
  CalendarOutlined, CheckCircleOutlined, CarOutlined,
} from '@ant-design/icons';
import type { DashboardScheduleItem } from '../../services/dashboardService';

interface TodayScheduleCardProps {
  items: DashboardScheduleItem[];
  loading?: boolean;
  onAddSchedule?: () => void;
  onViewAll?: () => void;
  onItemClick?: (item: DashboardScheduleItem) => void;
}

export const TodayScheduleCard: React.FC<TodayScheduleCardProps> = ({
  items,
  loading,
  onAddSchedule,
  onViewAll,
  onItemClick,
}) => {
  return (
    <div
      style={{
        background: 'var(--theme-card-bg, #ffffff)',
        border: '1px solid var(--theme-border, #e2e8f0)',
        borderRadius: 14,
        padding: '16px 18px',
        boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.05)',
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 12,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--theme-heading, #0f172a)' }}>
            Today's Schedule
          </span>
          {items.length > 0 && (
            <Tag color="gold" style={{ margin: 0, borderRadius: 10, fontWeight: 700, fontSize: 11 }}>
              {items.length} Active
            </Tag>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Button
            type="link"
            size="small"
            onClick={onViewAll}
            style={{ fontSize: 12, color: 'var(--theme-text-muted, #64748b)', fontWeight: 600, padding: 0 }}
          >
            Calendar <RightOutlined style={{ fontSize: 10 }} />
          </Button>
          <Tooltip title="Create New Schedule or Dispatch">
            <Button
              type="primary"
              shape="circle"
              size="small"
              icon={<PlusOutlined />}
              onClick={onAddSchedule}
              style={{
                background: '#ca8a04',
                borderColor: '#ca8a04',
                boxShadow: '0 2px 4px rgba(202, 138, 4, 0.25)',
              }}
            />
          </Tooltip>
        </div>
      </div>

      {/* List of Scheduled Items */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
          overflowY: 'auto',
          maxHeight: 260,
          flex: 1,
        }}
      >
        {items.length === 0 ? (
          <div
            style={{
              padding: '24px 12px',
              textAlign: 'center',
              color: 'var(--theme-text-muted, #94a3b8)',
              fontSize: 12,
            }}
          >
            <CalendarOutlined style={{ fontSize: 24, marginBottom: 6, color: 'var(--theme-border-strong, #cbd5e1)' }} />
            <div>No scheduled dispatches or jobs for today</div>
            <Button
              size="small"
              type="dashed"
              icon={<PlusOutlined />}
              onClick={onAddSchedule}
              style={{ marginTop: 8, fontSize: 11 }}
            >
              Add Schedule
            </Button>
          </div>
        ) : (
          items.map((item) => {
            const isConfirmed = item.status.toLowerCase().includes('confirm');
            const isBooked = item.status.toLowerCase().includes('book') || item.status.toLowerCase().includes('draft');
            const isDispatched = item.status.toLowerCase().includes('dispatch') || item.status.toLowerCase().includes('complete');

            const tagColor = isConfirmed
              ? 'rgba(245, 158, 11, 0.15)'
              : isDispatched
              ? 'rgba(16, 185, 129, 0.15)'
              : 'var(--theme-surface-alt, #f1f5f9)';
            const tagTextColor = isConfirmed
              ? '#f59e0b'
              : isDispatched
              ? '#10b981'
              : 'var(--theme-text-muted, #475569)';

            return (
              <div
                key={item.id}
                onClick={() => onItemClick?.(item)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '10px 12px',
                  borderRadius: 10,
                  border: '1px solid var(--theme-border, #f1f5f9)',
                  background: 'var(--theme-surface-alt, #fafafa)',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.background = 'var(--theme-hover, #f8fafc)';
                  (e.currentTarget as HTMLElement).style.borderColor = 'var(--theme-border-strong, #e2e8f0)';
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.background = 'var(--theme-surface-alt, #fafafa)';
                  (e.currentTarget as HTMLElement).style.borderColor = 'var(--theme-border, #f1f5f9)';
                }}
              >
                {/* Left: Clock avatar & Job Details */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                  <div
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: '50%',
                      background: isConfirmed ? 'rgba(245, 158, 11, 0.15)' : 'rgba(14, 165, 233, 0.15)',
                      color: isConfirmed ? '#f59e0b' : '#0ea5e9',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 14,
                      flexShrink: 0,
                    }}
                  >
                    <ClockCircleOutlined />
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
                      {item.title}
                    </div>
                    <div
                      style={{
                        fontSize: 11,
                        color: 'var(--theme-text-muted, #64748b)',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {item.subtitle}
                    </div>
                  </div>
                </div>

                {/* Right: Tag & Chevron */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0, marginLeft: 8 }}>
                  <span
                    style={{
                      background: tagColor,
                      color: tagTextColor,
                      fontSize: 11,
                      fontWeight: 700,
                      padding: '2px 8px',
                      borderRadius: 12,
                    }}
                  >
                    {item.status}
                  </span>
                  <RightOutlined style={{ fontSize: 10, color: '#94a3b8' }} />
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default TodayScheduleCard;
