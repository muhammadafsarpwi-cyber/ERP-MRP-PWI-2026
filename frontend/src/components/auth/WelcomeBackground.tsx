import React, { useEffect, useMemo, useState } from 'react';
import { WELCOME_IMAGES, WELCOME_SLIDE_INTERVAL_MS, WELCOME_SLIDE_FADE_MS } from '../../config/welcomeImages';

interface Props {
  reducedMotion: boolean;
}

/** Cinematic full-screen background slideshow with crossfade + slow Ken Burns zoom. */
const WelcomeBackground: React.FC<Props> = ({ reducedMotion }) => {
  const [index, setIndex] = useState(0);
  const images = useMemo(() => WELCOME_IMAGES, []);

  useEffect(() => {
    if (reducedMotion) return;
    const timer = window.setInterval(() => {
      setIndex((i) => (i + 1) % images.length);
    }, WELCOME_SLIDE_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [images.length, reducedMotion]);

  return (
    <div className="erp-welcome-bg" aria-hidden="true">
      {images.map((src, i) => (
        <div
          key={src}
          className={`erp-welcome-slide${i === index ? ' is-active' : ''}`}
          style={{ transitionDuration: reducedMotion ? '0ms' : `${WELCOME_SLIDE_FADE_MS}ms` }}
        >
          <img src={src} alt="" className="erp-welcome-img" draggable={false} />
        </div>
      ))}
    </div>
  );
};

export default WelcomeBackground;