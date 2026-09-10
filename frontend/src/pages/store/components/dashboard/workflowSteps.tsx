import React from 'react';
import {
  FileTextOutlined,
  SendOutlined,
  AuditOutlined,
  CrownOutlined,
  CheckCircleOutlined,
  FileSearchOutlined,
  CarOutlined,
  CalendarOutlined,
  InboxOutlined,
  AppstoreOutlined,
  SwapOutlined,
} from '@ant-design/icons';
import type { DashboardWorkflowStep } from '../../../../services/storeDashboard';
import { fmt } from './helpers';

const STEP_ICONS: Record<string, React.ReactNode> = {
  materialRequirement: <FileTextOutlined />,
  materialRequest: <SendOutlined />,
  managerApproval: <AuditOutlined />,
  gmApproval: <CrownOutlined />,
  approved: <CheckCircleOutlined />,
  prCreated: <FileSearchOutlined />,
  procurement: <CarOutlined />,
  eta: <CalendarOutlined />,
  grn: <InboxOutlined />,
  storeStock: <AppstoreOutlined />,
  movement: <SwapOutlined />,
};

interface WorkflowStepsProps {
  steps: DashboardWorkflowStep[];
  onNavigate: (path: string) => void;
}

const WorkflowSteps: React.FC<WorkflowStepsProps> = ({ steps, onNavigate }) => {
  return (
    <div
      style={{
        display: 'flex',
        gap: 8,
        overflowX: 'auto',
        paddingBottom: 8,
        scrollbarWidth: 'thin',
      }}
      className="erp-workflow-steps"
    >
      {steps.map((step, index) => {
        const pending = Number(step.pending || 0);
        const completed = Number(step.completed || 0);
        const done = pending === 0 && completed > 0;
        return (
          <button
            key={step.key}
            type="button"
            onClick={() => onNavigate(step.path)}
            title={`${step.label} · ${fmt(pending, 0)} pending · ${fmt(completed, 0)} completed`}
            style={{
              flex: '0 0 auto',
              width: 148,
              minHeight: 96,
              padding: '10px 10px',
              borderRadius: 8,
              cursor: 'pointer',
              border: '1px solid var(--theme-border)',
              background: 'var(--theme-surface)',
              textAlign: 'left',
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
              transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
            }}
            className="erp-workflow-step"
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: 7,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 14,
                  color: done ? 'var(--theme-success)' : 'var(--theme-accent)',
                  background: done ? 'var(--theme-success-soft)' : 'var(--theme-accent-soft)',
                }}
              >
                {STEP_ICONS[step.key] ?? <FileTextOutlined />}
              </span>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  padding: '1px 7px',
                  borderRadius: 10,
                  color: 'var(--theme-text-muted)',
                  border: '1px solid var(--theme-border-strong)',
                }}
              >
                {index + 1}
              </span>
            </div>
            <div
              style={{
                fontSize: 12.5,
                fontWeight: 600,
                color: 'var(--theme-text)',
                lineHeight: 1.3,
              }}
            >
              {step.label}
            </div>
            <div
              style={{
                display: 'flex',
                alignItems: 'baseline',
                gap: 6,
                fontSize: 11,
                color: 'var(--theme-text-muted)',
              }}
            >
              <span style={{ fontSize: 16, fontWeight: 700, color: done ? 'var(--theme-success)' : 'var(--theme-text)' }}>
                {fmt(pending, 0)}
              </span>
              <span>
                pending · <span style={{ color: 'var(--theme-text-muted)' }}>{fmt(completed, 0)} done</span>
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );
};

export default WorkflowSteps;