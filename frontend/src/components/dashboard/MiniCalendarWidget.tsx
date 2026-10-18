import React, { useState, useEffect, useMemo } from 'react';
import { Button, Tooltip } from 'antd';
import { LeftOutlined, RightOutlined, CalendarOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';

interface MiniCalendarWidgetProps {
  selectedDate?: string | null; // 'YYYY-MM-DD'
  activeDates?: string[]; // list of dates with recorded production entries ['YYYY-MM-DD', ...]
  onSelectDate: (dateStr: string) => void;
  loading?: boolean;
}

export const MiniCalendarWidget: React.FC<MiniCalendarWidgetProps> = ({
  selectedDate,
  activeDates = [],
  onSelectDate,
  loading,
}) => {
  const [currentMonth, setCurrentMonth] = useState(() => {
    return selectedDate && dayjs(selectedDate).isValid() ? dayjs(selectedDate) : dayjs();
  });

  // Automatically sync the calendar month view when selectedDate changes
  useEffect(() => {
    if (selectedDate && dayjs(selectedDate).isValid()) {
      const targetMonth = dayjs(selectedDate);
      if (!targetMonth.isSame(currentMonth, 'month')) {
        setCurrentMonth(targetMonth);
      }
    }
  }, [selectedDate]);

  const monthYearLabel = currentMonth.format('MMMM YYYY');

  // Days grid calculation
  const calendarDays = useMemo(() => {
    const startOfMonth = currentMonth.startOf('month');
    const endOfMonth = currentMonth.endOf('month');
    const startDayOfWeek = (startOfMonth.day() + 6) % 7; // Monday = 0
    const totalDays = endOfMonth.date();

    const days: Array<{
      dateStr: string;
      dayNum: number;
      isCurrentMonth: boolean;
      hasActivity: boolean;
      isSelected: boolean;
      isToday: boolean;
    }> = [];

    // Padding from previous month
    const prevMonth = currentMonth.subtract(1, 'month');
    const prevMonthDays = prevMonth.endOf('month').date();
    for (let i = startDayOfWeek - 1; i >= 0; i--) {
      const d = prevMonthDays - i;
      const dateStr = prevMonth.date(d).format('YYYY-MM-DD');
      days.push({
        dateStr,
        dayNum: d,
        isCurrentMonth: false,
        hasActivity: activeDates.includes(dateStr),
        isSelected: selectedDate === dateStr,
        isToday: dateStr === dayjs().format('YYYY-MM-DD'),
      });
    }

    // Current month days
    for (let d = 1; d <= totalDays; d++) {
      const dateStr = currentMonth.date(d).format('YYYY-MM-DD');
      days.push({
        dateStr,
        dayNum: d,
        isCurrentMonth: true,
        hasActivity: activeDates.includes(dateStr),
        isSelected: selectedDate === dateStr,
        isToday: dateStr === dayjs().format('YYYY-MM-DD'),
      });
    }

    // Remaining days to fill 35 or 42 cells
    const remaining = 35 - days.length > 0 ? 35 - days.length : (42 - days.length > 0 ? 42 - days.length : 0);
    const nextMonth = currentMonth.add(1, 'month');
    for (let d = 1; d <= remaining; d++) {
      const dateStr = nextMonth.date(d).format('YYYY-MM-DD');
      days.push({
        dateStr,
        dayNum: d,
        isCurrentMonth: false,
        hasActivity: activeDates.includes(dateStr),
        isSelected: selectedDate === dateStr,
        isToday: dateStr === dayjs().format('YYYY-MM-DD'),
      });
    }

    return days;
  }, [currentMonth, selectedDate, activeDates]);

  return (
    <div
      style={{
        background: 'var(--theme-card-bg, #ffffff)',
        border: '1px solid var(--theme-border, #e2e8f0)',
        borderRadius: 14,
        padding: '14px 16px',
        boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.05)',
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
      }}
    >
      {/* Month Navigation Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 12,
        }}
      >
        <button
          type="button"
          onClick={() => setCurrentMonth((prev) => prev.subtract(1, 'month'))}
          style={{
            border: 'none',
            background: 'transparent',
            cursor: 'pointer',
            padding: '4px 8px',
            borderRadius: 6,
            color: 'var(--theme-text-muted, #64748b)',
            display: 'flex',
            alignItems: 'center',
          }}
          title="Previous Month"
        >
          <LeftOutlined style={{ fontSize: 12 }} />
        </button>

        <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--theme-heading, #0f172a)' }}>
          {monthYearLabel}
        </span>

        <button
          type="button"
          onClick={() => setCurrentMonth((prev) => prev.add(1, 'month'))}
          style={{
            border: 'none',
            background: 'transparent',
            cursor: 'pointer',
            padding: '4px 8px',
            borderRadius: 6,
            color: 'var(--theme-text-muted, #64748b)',
            display: 'flex',
            alignItems: 'center',
          }}
          title="Next Month"
        >
          <RightOutlined style={{ fontSize: 12 }} />
        </button>
      </div>

      {/* Weekday Labels (Mo, Tu, We, Th, Fr, Sa, Su) */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(7, 1fr)',
          textAlign: 'center',
          fontSize: 11,
          fontWeight: 600,
          color: 'var(--theme-text-muted, #94a3b8)',
          marginBottom: 6,
        }}
      >
        <span>Mo</span>
        <span>Tu</span>
        <span>We</span>
        <span>Th</span>
        <span>Fr</span>
        <span>Sa</span>
        <span>Su</span>
      </div>

      {/* Days Grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(7, 1fr)',
          gap: '2px',
          rowGap: '4px',
          textAlign: 'center',
          flex: 1,
        }}
      >
        {calendarDays.map((d, idx) => {
          return (
            <div
              key={`${d.dateStr}-${idx}`}
              onClick={() => onSelectDate(d.dateStr)}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                padding: '2px 0',
                borderRadius: 8,
                transition: 'all 0.15s ease',
                position: 'relative',
              }}
              onMouseEnter={(e) => {
                if (!d.isSelected) {
                  (e.currentTarget as HTMLElement).style.background = 'var(--theme-hover, #f8fafc)';
                }
              }}
              onMouseLeave={(e) => {
                if (!d.isSelected) {
                  (e.currentTarget as HTMLElement).style.background = 'transparent';
                }
              }}
              title={
                d.isSelected
                  ? `${d.dateStr} — Selected date`
                  : d.hasActivity
                  ? `${d.dateStr} — Has production activity`
                  : d.dateStr
              }
            >
              {/* Circular Badge for Selected Day */}
              <span
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: d.isSelected
                    ? '#0d9488'
                    : d.isToday
                    ? 'var(--theme-surface-alt, #f1f5f9)'
                    : 'transparent',
                  color: d.isSelected
                    ? '#ffffff'
                    : !d.isCurrentMonth
                    ? 'var(--theme-text-muted, #cbd5e1)'
                    : 'var(--theme-heading, #0f172a)',
                  fontWeight: d.isSelected || d.isToday ? 700 : 500,
                  fontSize: 12,
                  boxShadow: d.isSelected ? '0 2px 8px rgba(13, 148, 136, 0.45)' : 'none',
                  border: d.isToday && !d.isSelected ? '1px solid var(--theme-border, #cbd5e1)' : 'none',
                  transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                }}
              >
                {d.dayNum}
              </span>

              {/* Activity indicator dot */}
              {d.hasActivity ? (
                <span
                  style={{
                    width: 4,
                    height: 4,
                    borderRadius: '50%',
                    background: d.isSelected ? '#0d9488' : '#ef4444',
                    marginTop: 1,
                  }}
                />
              ) : (
                <span style={{ width: 4, height: 4, marginTop: 1 }} />
              )}
            </div>
          );
        })}
      </div>

      {/* Legend Footer */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderTop: '1px solid var(--theme-border, #f1f5f9)',
          paddingTop: 8,
          marginTop: 6,
          fontSize: 10,
          color: 'var(--theme-text-muted, #64748b)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#ef4444' }} />
          <span>Recorded Entry</span>
        </div>
        <button
          type="button"
          onClick={() => onSelectDate(dayjs().format('YYYY-MM-DD'))}
          style={{
            border: 'none',
            background: 'transparent',
            color: 'var(--theme-primary, #2563eb)',
            fontWeight: 600,
            cursor: 'pointer',
            padding: 0,
            fontSize: 11,
          }}
        >
          Jump to Today
        </button>
      </div>
    </div>
  );
};

export default MiniCalendarWidget;
