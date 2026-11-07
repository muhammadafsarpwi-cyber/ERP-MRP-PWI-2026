import React, { useEffect, useState } from 'react';
import {
  ActiveStageVisual,
  FUTURISTIC_EARTH_BANNER_URL,
} from '../../config/companyWelcomeConfig';

interface Props {
  activeVisual: ActiveStageVisual;
  preloadUrls?: string[];
  reducedMotion: boolean;
}

interface SlideBufferItem {
  key: string;
  src: string;
  fallbackSrc: string;
  variant: 'a' | 'b';
}

const SECONDARY_FALLBACK_URL = `${process.env.PUBLIC_URL || ''}/assets/welcome/welcome-hero-banner.jpg`;

/**
 * Department-Synchronized Fullscreen Holographic Background Engine.
 * Smoothly crossfades to the exact 3D industrial machine scene mapped to the
 * currently active department in WelcomeLifecycleShowcase, while preserving a
 * unified futuristic dark corporate aesthetic (deep purple & neon cyan-blue).
 */
const WelcomeBackground: React.FC<Props> = ({
  activeVisual,
  preloadUrls = [],
  reducedMotion,
}) => {
  const [layers, setLayers] = useState<SlideBufferItem[]>(() => [
    {
      key: `${activeVisual.imageUrl}-0`,
      src: activeVisual.imageUrl || FUTURISTIC_EARTH_BANNER_URL,
      fallbackSrc: activeVisual.fallbackUrl || FUTURISTIC_EARTH_BANNER_URL,
      variant: 'a',
    },
  ]);

  const [failedSrcs, setFailedSrcs] = useState<Record<string, boolean>>({});

  // Preload all configured department scenes in the background so transitions never flash
  useEffect(() => {
    if (process.env.NODE_ENV === 'test' || typeof Image === 'undefined') return;
    preloadUrls.forEach((url) => {
      if (!url) return;
      const img = new Image();
      img.src = url;
    });
  }, [preloadUrls]);

  // Push new slide layer when the synchronized department visual URL changes
  useEffect(() => {
    const nextSrc = activeVisual.imageUrl || FUTURISTIC_EARTH_BANNER_URL;
    setLayers((prev) => {
      const top = prev[prev.length - 1];
      if (top && top.src === nextSrc) {
        return prev;
      }
      const nextVariant: 'a' | 'b' = top?.variant === 'a' ? 'b' : 'a';
      const nextItem: SlideBufferItem = {
        key: `${nextSrc}-${Date.now()}`,
        src: nextSrc,
        fallbackSrc: activeVisual.fallbackUrl || FUTURISTIC_EARTH_BANNER_URL,
        variant: nextVariant,
      };
      // Keep only previous + current layer for clean GPU-composited crossfade
      return [...prev.slice(-1), nextItem];
    });
  }, [activeVisual.fallbackUrl, activeVisual.imageUrl]);

  const resolveSafeSrc = (item: SlideBufferItem): string => {
    if (!failedSrcs[item.src]) return item.src;
    if (!failedSrcs[item.fallbackSrc]) return item.fallbackSrc;
    return SECONDARY_FALLBACK_URL;
  };

  return (
    <div
      className="erp-welcome-bg"
      aria-hidden="true"
      data-testid="welcome-holographic-earth-bg"
      data-active-scene={activeVisual.sceneKey}
      data-active-department={activeVisual.stageName}
    >
      {layers.map((item, idx) => {
        const isTop = idx === layers.length - 1;
        const resolved = resolveSafeSrc(item);
        return (
          <div
            key={item.key}
            className={[
              'erp-welcome-slide',
              isTop ? 'is-active' : 'is-exiting-slide',
              `kb-${item.variant}`,
            ].join(' ')}
            style={{ transitionDuration: reducedMotion ? '0ms' : '950ms' }}
          >
            <img
              src={resolved}
              alt=""
              className={`erp-welcome-img${reducedMotion ? ' is-static' : ''}`}
              draggable={false}
              loading="eager"
              onError={() => {
                setFailedSrcs((prev) => ({ ...prev, [resolved]: true }));
              }}
            />
          </div>
        );
      })}

      {/* Ambient Synchronized Department Telemetry Watermark (Bottom-Left HUD) */}
      <div className="erp-welcome-bg-hud">
        <span className="erp-bg-hud-dot" />
        <span className="erp-bg-hud-code">{activeVisual.divisionCode}</span>
        <span className="erp-bg-hud-sep">/</span>
        <span className="erp-bg-hud-stage">{activeVisual.stageName}</span>
        <span className="erp-bg-hud-sep">—</span>
        <span className="erp-bg-hud-tag">{activeVisual.telemetryTag}</span>
      </div>
    </div>
  );
};

export default WelcomeBackground;
