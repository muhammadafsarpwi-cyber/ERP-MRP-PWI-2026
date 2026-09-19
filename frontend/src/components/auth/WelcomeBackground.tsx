import React, { useEffect, useMemo, useState } from 'react';
import { WELCOME_IMAGES, WELCOME_SLIDE_INTERVAL_MS, WELCOME_SLIDE_FADE_MS } from '../../config/welcomeImages';

interface Props {
  reducedMotion: boolean;
  activeIndex?: number;
  onIndexChange?: (index: number) => void;
}

/** Cinematic full-screen background slideshow with crossfade + slow Ken Burns zoom. */
const WelcomeBackground: React.FC<Props> = ({ reducedMotion, activeIndex, onIndexChange }) => {
  const [internalIndex, setInternalIndex] = useState(0);
  const images = useMemo(() => WELCOME_IMAGES, []);

  const currentIndex = activeIndex !== undefined ? activeIndex : internalIndex;

  useEffect(() => {
    if (reducedMotion) return;
    const timer = window.setInterval(() => {
      if (activeIndex !== undefined) {
        onIndexChange?.((activeIndex + 1) % images.length);
      } else {
        setInternalIndex((i) => {
          const next = (i + 1) % images.length;
          onIndexChange?.(next);
          return next;
        });
      }
    }, WELCOME_SLIDE_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [activeIndex, images.length, onIndexChange, reducedMotion]);

  return (
    <div className="erp-welcome-bg" aria-hidden="true">
      {images.map((src, i) => (
        <div
          key={src}
          className={`erp-welcome-slide${i === currentIndex ? ' is-active' : ''}`}
          style={{ transitionDuration: reducedMotion ? '0ms' : `${WELCOME_SLIDE_FADE_MS}ms` }}
        >
          <img src={src} alt="" className="erp-welcome-img" draggable={false} />
        </div>
      ))}
    </div>
  );
};

export default WelcomeBackground;