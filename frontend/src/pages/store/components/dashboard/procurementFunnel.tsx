import React from 'react';
import { Card, Progress, Tooltip, Empty } from 'antd';
import type { ProcurementFunnel as Funnel } from '../../../../services/storeDashboard';
import { cardStyle, fmt, sectionTitle } from './helpers';

interface ProcurementFunnelProps {
  funnel: Funnel;
}

const ProcurementFunnel: React.FC<ProcurementFunnelProps> = ({ funnel }) => {
  const steps = funnel.steps || [];
  const total = Math.max(Number(funnel.requested || 0), 1);

  return (
    <Card
      size="small"
      title={sectionTitle('Procurement Funnel')}
      style={cardStyle}
      styles={{ body: { padding: 12 } }}
    >
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 8,
          marginBottom: 12,
        }}
      >
        {[
          { label: 'Requested Qty', value: funnel.requested, color: 'var(--theme-text)' },
          { label: 'Received Qty', value: funnel.received, color: 'var(--theme-success)' },
          { label: 'Pending Qty', value: funnel.pending, color: 'var(--theme-warning)' },
        ].map((stat) => (
          <div
            key={stat.label}
            style={{
              border: '1px solid var(--theme-border)',
              borderRadius: 8,
              padding: '8px 10px',
              background: 'var(--theme-surface-alt)',
            }}
          >
            <div style={{ fontSize: 17, fontWeight: 700, color: stat.color, fontVariantNumeric: 'tabular-nums' }}>
              {fmt(stat.value)}
            </div>
            <div style={{ fontSize: 11, color: 'var(--theme-text-muted)' }}>{stat.label}</div>
          </div>
        ))}
      </div>

      {steps.length === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No procurement activity" />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
          {steps.map((step) => {
            const pct = Math.min(100, Math.round((Number(step.qty || 0) / total) * 100));
            return (
              <div key={step.key}>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: 12,
                    marginBottom: 2,
                  }}
                >
                  <span style={{ color: 'var(--theme-text)', fontWeight: 500 }}>{step.label}</span>
                  <span style={{ color: 'var(--theme-text-muted)', fontVariantNumeric: 'tabular-nums' }}>
                    {fmt(step.qty)}
                  </span>
                </div>
                <Tooltip title={`${step.label}: ${fmt(step.qty)} units`}>
                  <Progress
                    percent={pct}
                    size="small"
                    strokeColor={step.color}
                    showInfo={false}
                    style={{ marginBottom: 0 }}
                  />
                </Tooltip>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
};

export default ProcurementFunnel;