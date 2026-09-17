import React from 'react';
import './largeLoadingBuffer.css';

export interface LargeLoadingBufferProps {
  title?: string;
  subtitle?: string;
  badgeText?: string;
  minHeight?: number | string;
  overlay?: boolean;
}

export const LargeLoadingBuffer: React.FC<LargeLoadingBufferProps> = ({
  title = 'Loading Data...',
  subtitle = 'Retrieving real-time records directly from database',
  badgeText = 'Direct DB Synchronization',
  minHeight = 320,
  overlay = false,
}) => {
  return (
    <div
      className={`erp-large-loading-buffer ${overlay ? 'erp-large-loading-buffer--overlay' : ''}`}
      style={{ minHeight }}
      data-testid="large-loading-buffer"
    >
      <div className="erp-loading-ambient-glow" />

      {/* 84px Enlarged Orbital Dual-Ring Spinner */}
      <div className="erp-loading-spinner-wrap">
        <svg className="erp-loading-orbital-svg" viewBox="0 0 84 84">
          <defs>
            <linearGradient id="erpLoadingGrad1" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="var(--theme-primary, #2563eb)" />
              <stop offset="100%" stopColor="#38bdf8" />
            </linearGradient>
            <linearGradient id="erpLoadingGrad2" x1="100%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#38bdf8" />
              <stop offset="100%" stopColor="#06b6d4" />
            </linearGradient>
          </defs>

          {/* Outer Track Ring */}
          <circle cx="42" cy="42" r="36" className="erp-loading-outer-track" />

          {/* Outer Spinning Arc (Clockwise) */}
          <circle
            cx="42"
            cy="42"
            r="36"
            stroke="url(#erpLoadingGrad1)"
            className="erp-loading-spinning-arc"
          />

          {/* Counter-Spinning Inner Arc */}
          <circle
            cx="42"
            cy="42"
            r="28"
            stroke="url(#erpLoadingGrad2)"
            className="erp-loading-spinning-arc-fast"
          />

          {/* Inner Calm Core Disc */}
          <circle cx="42" cy="42" r="18" className="erp-loading-inner-core" />

          {/* Central Pulsing Heartbeat Dot */}
          <circle cx="42" cy="42" r="5" className="erp-loading-inner-dot" />
        </svg>
      </div>

      <div className="erp-loading-title">{title}</div>
      <div className="erp-loading-subtitle">{subtitle}</div>

      {badgeText && (
        <div className="erp-loading-meta-badge">
          <span className="erp-loading-pulse-dot" />
          <span>{badgeText}</span>
        </div>
      )}
    </div>
  );
};

export default LargeLoadingBuffer;
