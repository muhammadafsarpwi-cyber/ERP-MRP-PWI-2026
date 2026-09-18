import React from 'react';
import './largeLoadingBuffer.css';

export interface LoadingStateProps {
  tip?: string;
  title?: string;
  subtitle?: string;
  badgeText?: string;
  minHeight?: number | string;
  size?: 'small' | 'default' | 'large';
  overlay?: boolean;
  style?: React.CSSProperties;
  className?: string;
}

/**
 * Standard enterprise loading indicator for PakWiz ERP.
 * Features the signature orbital dual-ring animated loader with pulsing core
 * and clean typography matching Production Inventory Report standard.
 */
export const LoadingState: React.FC<LoadingStateProps> = ({
  tip,
  title,
  subtitle = 'Retrieving real-time records directly from database...',
  badgeText,
  minHeight,
  size = 'default',
  overlay = false,
  style,
  className = '',
}) => {
  const displayTitle = title || tip || 'Loading data...';
  const defaultHeight = size === 'small' ? 160 : size === 'large' ? 360 : 220;
  const isSmall = size === 'small';

  return (
    <div
      className={`erp-large-loading-buffer ${isSmall ? 'erp-large-loading-buffer--small' : ''} ${overlay ? 'erp-large-loading-buffer--overlay' : ''} ${className}`.trim()}
      style={{ minHeight: minHeight ?? defaultHeight, ...style }}
      data-testid="erp-loading-state"
    >
      <div className="erp-loading-ambient-glow" />

      {/* Enlarged Orbital Dual-Ring Spinner matching Image 1 */}
      <div className={`erp-loading-spinner-wrap ${isSmall ? 'erp-loading-spinner-wrap--small' : ''}`}>
        <svg className="erp-loading-orbital-svg" viewBox="0 0 84 84">
          <defs>
            <linearGradient id="erpLoadingGradMain1" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="var(--theme-primary, #2563eb)" />
              <stop offset="100%" stopColor="#38bdf8" />
            </linearGradient>
            <linearGradient id="erpLoadingGradMain2" x1="100%" y1="0%" x2="0%" y2="100%">
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
            stroke="url(#erpLoadingGradMain1)"
            className="erp-loading-spinning-arc"
          />

          {/* Counter-Spinning Inner Arc */}
          <circle
            cx="42"
            cy="42"
            r="28"
            stroke="url(#erpLoadingGradMain2)"
            className="erp-loading-spinning-arc-fast"
          />

          {/* Inner Calm Core Disc */}
          <circle cx="42" cy="42" r="18" className="erp-loading-inner-core" />

          {/* Central Pulsing Heartbeat Dot */}
          <circle cx="42" cy="42" r="5" className="erp-loading-inner-dot" />
        </svg>
      </div>

      <div className="erp-loading-title">{displayTitle}</div>
      {subtitle && <div className="erp-loading-subtitle">{subtitle}</div>}

      {badgeText && (
        <div className="erp-loading-meta-badge">
          <span className="erp-loading-pulse-dot" />
          <span>{badgeText}</span>
        </div>
      )}
    </div>
  );
};

export interface OrbitalDualRingLoaderProps {
  size?: 'small' | 'default' | 'large';
  style?: React.CSSProperties;
  className?: string;
}

/**
 * Compact standalone Orbital Dual-Ring Spinner matching enterprise loading design.
 * Used as the global Ant Design Spin indicator and standalone spinner.
 */
export const OrbitalDualRingLoader: React.FC<OrbitalDualRingLoaderProps> = ({
  size = 'default',
  style,
  className = '',
}) => {
  const dim = size === 'small' ? 32 : size === 'large' ? 84 : 46;
  const stroke1 = size === 'small' ? 3.2 : size === 'large' ? 4.5 : 3.8;
  const stroke2 = size === 'small' ? 2.2 : size === 'large' ? 3 : 2.5;
  const dotR = size === 'small' ? 3 : size === 'large' ? 5 : 4;

  return (
    <div
      className={`erp-orbital-indicator erp-orbital-indicator--${size} ${className}`.trim()}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: dim,
        height: dim,
        lineHeight: 1,
        ...style,
      }}
      data-testid="orbital-dual-ring-loader"
    >
      <svg
        className="erp-loading-orbital-svg"
        viewBox="0 0 84 84"
        style={{ width: dim, height: dim, overflow: 'visible' }}
      >
        <defs>
          <linearGradient id="erpLoadingGradOrbital1" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="var(--theme-primary, #2563eb)" />
            <stop offset="100%" stopColor="#38bdf8" />
          </linearGradient>
          <linearGradient id="erpLoadingGradOrbital2" x1="100%" y1="0%" x2="0%" y2="100%">
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
          stroke="url(#erpLoadingGradOrbital1)"
          className="erp-loading-spinning-arc"
          style={{ strokeWidth: stroke1 }}
        />

        {/* Counter-Spinning Inner Arc */}
        <circle
          cx="42"
          cy="42"
          r="28"
          stroke="url(#erpLoadingGradOrbital2)"
          className="erp-loading-spinning-arc-fast"
          style={{ strokeWidth: stroke2 }}
        />

        {/* Inner Calm Core Disc */}
        <circle cx="42" cy="42" r="18" className="erp-loading-inner-core" />

        {/* Central Pulsing Heartbeat Dot */}
        <circle cx="42" cy="42" r={dotR} className="erp-loading-inner-dot" />
      </svg>
    </div>
  );
};

export default LoadingState;

