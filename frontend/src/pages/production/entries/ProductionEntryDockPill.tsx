import React from 'react';
import { Space, Badge, Button, Tooltip, Popconfirm } from 'antd';
import {
  ThunderboltFilled,
  UpOutlined,
  CloseOutlined,
  EditFilled,
  ClockCircleOutlined,
} from '@ant-design/icons';
import { useEntryDockStore } from './entryDockStore';

export const ProductionEntryDockPill: React.FC = () => {
  const { isOpen, isMinimized, entryParams, activeStep, hasUnsavedChanges, restore, closeEntry } =
    useEntryDockStore();

  if (!isOpen || !isMinimized) {
    return null;
  }

  const machineLabel = entryParams?.machineCode || entryParams?.machineName || 'Machine Entry';
  const shiftLabel = entryParams?.shiftName || 'Current Shift';

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 18,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 9999,
        background: 'var(--theme-surface, #181c33)',
        border: '2px solid var(--theme-accent, #10b981)',
        boxShadow: '0 8px 32px var(--theme-accent-soft, rgba(16, 185, 129, 0.35)), 0 4px 16px rgba(0, 0, 0, 0.6)',
        borderRadius: 28,
        padding: '6px 14px 6px 18px',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        cursor: 'pointer',
        transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
        backdropFilter: 'blur(12px)',
      }}
      onClick={restore}
      title="Click to restore Production Entry Form"
    >
      {/* Glowing Machine Icon Badge */}
      <div
        style={{
          width: 32,
          height: 32,
          borderRadius: '50%',
          background: 'linear-gradient(135deg, var(--theme-accent, #10b981) 0%, var(--theme-primary, #059669) 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#ffffff',
          boxShadow: '0 0 12px var(--theme-accent-soft)',
          fontSize: 15,
        }}
      >
        <ThunderboltFilled />
      </div>

      {/* Label and Progress */}
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--theme-text, #ffffff)' }}>
            {machineLabel}
          </span>
          <span
            style={{
              fontSize: 10,
              padding: '1px 6px',
              borderRadius: 4,
              background: 'var(--theme-accent-soft, rgba(16, 185, 129, 0.15))',
              color: 'var(--theme-accent, #10b981)',
              fontWeight: 600,
            }}
          >
            {shiftLabel}
          </span>
          {hasUnsavedChanges && (
            <Badge status="processing" color="var(--theme-warning, #faad14)" title="Unsaved changes retained" />
          )}
        </div>
        <div style={{ fontSize: 11, color: 'var(--theme-text-muted, #94a3b8)', display: 'flex', alignItems: 'center', gap: 4 }}>
          <EditFilled style={{ fontSize: 10, color: 'var(--theme-accent, #10b981)' }} />
          <span>Step {activeStep} of 8 (Editing In-Progress • Click to Restore)</span>
        </div>
      </div>

      {/* Action Controls */}
      <Space size={6} onClick={(e) => e.stopPropagation()}>
        <Tooltip title="Restore Window">
          <Button
            type="primary"
            shape="circle"
            size="small"
            icon={<UpOutlined />}
            onClick={restore}
            style={{
              background: 'var(--theme-accent, #10b981)',
              borderColor: 'var(--theme-accent, #10b981)',
            }}
          />
        </Tooltip>

        <Popconfirm
          title="Discard / Close Entry?"
          description="Are you sure you want to close this minimized production entry?"
          onConfirm={closeEntry}
          okText="Yes, Close"
          cancelText="Keep"
          okButtonProps={{ danger: true }}
        >
          <Button
            type="text"
            shape="circle"
            size="small"
            danger
            icon={<CloseOutlined />}
            title="Close Entry"
          />
        </Popconfirm>
      </Space>
    </div>
  );
};

export default ProductionEntryDockPill;
