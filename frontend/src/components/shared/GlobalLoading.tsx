import React from 'react';
import { LoadingState, OrbitalDualRingLoader, TableEmptyLoadingState } from './LoadingState';

export interface GlobalLoadingProps {
  /** Visible heading above the spinner. Defaults to 'Loading data...' */
  title?: string;
  /** Supporting line of copy under the title. */
  subtitle?: string;
  /** Optional live-telemetry pill badge text (e.g. 'LIVE DATABASE QUERY'). */
  badgeText?: string;
  /** Minimum height of the loading block. */
  minHeight?: number | string;
  /** When true, renders as a full-page centered card instead of an inline block. */
  fullPage?: boolean;
  /** When true, renders as a translucent overlay on top of existing content (used for refresh states). */
  overlay?: boolean;
  /** Compact inline spinner only (no card chrome). */
  spinnerOnly?: boolean;
  /** Size of the standalone spinner when `spinnerOnly` is true. */
  size?: 'small' | 'default' | 'large';
  style?: React.CSSProperties;
  className?: string;
}

/**
 * GlobalLoading — the SINGLE canonical loading indicator for PakWiz ERP.
 *
 * Modelled after the Production Reports / Production Inventory Report loading
 * design: the enlarged neon orbital dual-ring spinner (clockwise outer arc +
 * counter-rotating inner arc + pulsing core dot), ambient glow halo, and clean
 * typography with an optional live-telemetry pill badge.
 *
 * This replaces every ad-hoc `<Spin />`, `<Spin spinning />`, and bespoke
 * spinner across the system so that ALL tabs render one consistent loading
 * experience. It is a thin, stable wrapper over the existing `LoadingState`
 * orbital implementation — no new animation machinery, no divergence.
 */
export const GlobalLoading: React.FC<GlobalLoadingProps> = ({
  title,
  subtitle,
  badgeText,
  minHeight,
  fullPage = false,
  overlay = false,
  spinnerOnly = false,
  size = 'default',
  style,
  className = '',
}) => {
  if (spinnerOnly) {
    return (
      <div
        style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', ...style }}
        className={className.trim()}
        data-testid="global-loading-spinner"
        role="status"
        aria-live="polite"
      >
        <OrbitalDualRingLoader size={size} />
      </div>
    );
  }

  return (
    <div
      style={
        fullPage
          ? {
              position: 'fixed',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'rgba(15, 23, 42, 0.45)',
              backdropFilter: 'blur(4px)',
              WebkitBackdropFilter: 'blur(4px)',
              zIndex: 1200,
              padding: 24,
              ...style,
            }
          : overlay
            ? {
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                zIndex: 50,
                ...style,
              }
            : { width: '100%', ...style }
      }
      className={className.trim()}
      data-testid="global-loading"
      role="status"
      aria-live="polite"
    >
      <LoadingState
        title={title}
        subtitle={subtitle}
        badgeText={badgeText}
        overlay={overlay}
        minHeight={minHeight ?? (fullPage ? 360 : 220)}
        size={fullPage ? 'large' : size}
        style={fullPage ? { maxWidth: 460, width: '100%' } : undefined}
      />
    </div>
  );
};

/** Table-embedded empty loading state (used by ERPTable when loading with 0 rows). */
export const GlobalTableLoading = TableEmptyLoadingState;

export default GlobalLoading;