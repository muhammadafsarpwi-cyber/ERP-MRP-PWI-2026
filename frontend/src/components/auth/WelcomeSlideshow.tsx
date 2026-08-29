import React, { useCallback, useEffect, useRef, useState } from 'react';
import { LeftOutlined, RightOutlined } from '@ant-design/icons';

export interface WelcomeSlide {
  src: string;
  title?: string;
  subtitle?: string;
}

export const WELCOME_SLIDES: WelcomeSlide[] = [
  { src: `${process.env.PUBLIC_URL}/images/welcome/welcome-01.jpg`, title: 'Precision Manufacturing', subtitle: 'Advanced wire production' },
  { src: `${process.env.PUBLIC_URL}/images/welcome/welcome-02.jpg`, title: 'Production Machinery', subtitle: 'Integrated manufacturing operations' },
  { src: `${process.env.PUBLIC_URL}/images/welcome/welcome-03.jpg`, title: 'Wire Drawing', subtitle: 'Precision drawing and straightening' },
  { src: `${process.env.PUBLIC_URL}/images/welcome/welcome-04.jpg`, title: 'Component Manufacturing', subtitle: 'Spoke and metal component production' },
  { src: `${process.env.PUBLIC_URL}/images/welcome/welcome-05.jpg`, title: 'Cable Production', subtitle: 'Continuous processing lines' },
  { src: `${process.env.PUBLIC_URL}/images/welcome/welcome-06.jpg`, title: 'Factory Floor', subtitle: 'Full-scope production operations' },
];

/** How long each image stays on screen before crossfading to the next. */
export const SLIDE_INTERVAL_MS = 7000;

/** How long the final slide is held before the slideshow reports completion. */
const COMPLETION_DELAY_MS = SLIDE_INTERVAL_MS;

interface WelcomeSlideshowProps {
  slides?: WelcomeSlide[];
  /** Fired once after every slide has been shown (≈ 42 s) or when the user
   *  advances past the last slide. The owner decides where to navigate. */
  onComplete?: () => void;
}

/**
 * Full-screen background slideshow used by the Welcome screen.
 *
 * - The first image loads eagerly, the remainder are lazy-loaded and prewarmed
 *   one or two slots ahead so transitions never flash a fallback background.
 * - Missing images are hidden gracefully (never a broken-image icon).
 * - Crossfade + slow Ken Burns drift; both respect `prefers-reduced-motion`.
 * - Announces completion once per session (auto-advance or manual last step).
 * - Keyboard: ArrowRight → next slide, ArrowLeft → previous slide.
 * - All timers are cleaned up on unmount / navigation.
 */
const WelcomeSlideshow: React.FC<WelcomeSlideshowProps> = ({
  slides = WELCOME_SLIDES,
  onComplete,
}) => {
  const count = slides.length;
  const [active, setActive] = useState(0);
  const doneRef = useRef(false);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  const completed = useCallback(() => {
    if (count === 0 || doneRef.current) return;
    doneRef.current = true;
    onCompleteRef.current?.();
  }, [count]);

  const goTo = useCallback(
    (index: number) => {
      setActive((prev) => {
        const next = Math.max(0, Math.min(index, slides.length - 1));
        return next === prev ? prev : next;
      });
    },
    [slides.length],
  );

  const next = useCallback(() => {
    if (active >= slides.length - 1) {
      completed();
      return;
    }
    setActive(active + 1);
  }, [active, slides.length, completed]);

  const prev = useCallback(() => {
    setActive((current) => Math.max(0, current - 1));
  }, []);

  // Single active-window timer: advance every 7 s; hold the final slide for
  // one more interval and then complete. Cleanup on every change / unmount.
  useEffect(() => {
    if (count === 0) return;
    const delay = active >= count - 1 ? COMPLETION_DELAY_MS : SLIDE_INTERVAL_MS;
    const timer = window.setTimeout(() => {
      if (active >= count - 1) {
        completed();
      } else {
        setActive(active + 1);
      }
    }, delay);
    return () => window.clearTimeout(timer);
  }, [active, count, completed]);

  // Prewarm the next images so sliding into them is instant.
  useEffect(() => {
    const warm = (index: number) => {
      const slide = slides[index];
      if (!slide) return;
      const probe = new Image();
      probe.src = slide.src;
    };
    warm(active + 1);
    warm(active + 2);
  }, [active, slides]);

  // Keyboard ── ArrowRight / ArrowLeft move between slides.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
        return;
      }
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        next();
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        prev();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [next, prev]);

  if (count === 0) {
    return <div className="erp-auth-media" aria-hidden="true" />;
  }

  const isLast = active >= count - 1;
  const activeSlide = slides[active];

  return (
    <div
      className="erp-auth-media"
      role="group"
      aria-roledescription="slideshow"
      aria-label="PWI welcome slideshow"
    >
      {slides.map((slide, i) => (
        <div
          key={slide.src}
          className={`erp-slide${i === active ? ' is-active' : ''}`}
          aria-hidden="true"
        >
          <img
            className="erp-slide-img"
            src={slide.src}
            alt=""
            loading={i === 0 ? 'eager' : 'lazy'}
            draggable={false}
            onError={(event) => {
              event.currentTarget.classList.add('is-missing');
            }}
          />
        </div>
      ))}

      <div className="erp-vignette" aria-hidden="true" />

      <div className="erp-slide-bar">
        <div className="erp-slide-caption">
          {activeSlide?.title && (
            <span className="erp-slide-title">{activeSlide.title}</span>
          )}
          {activeSlide?.subtitle && (
            <span className="erp-slide-sub">{activeSlide.subtitle}</span>
          )}
        </div>

        <div className="erp-slide-dots">
          {slides.map((slide, i) => (
            <button
              key={slide.src}
              type="button"
              className={`erp-slide-dot${i === active ? ' is-active' : ''}`}
              aria-label={`Go to slide ${i + 1}`}
              aria-current={i === active}
              tabIndex={i === active ? 0 : -1}
              onClick={() => goTo(i)}
            />
          ))}
        </div>

        <div className="erp-slide-controls">
          <button
            type="button"
            className="erp-slide-btn"
            aria-label="Previous slide"
            onClick={prev}
            disabled={active === 0}
          >
            <LeftOutlined />
          </button>
          <button
            type="button"
            className="erp-slide-btn"
            aria-label={isLast ? 'Continue to Sign In' : 'Next slide'}
            onClick={next}
          >
            <RightOutlined />
          </button>
          {isLast && <span className="erp-slide-continue">Continue to Sign In</span>}
        </div>
      </div>
    </div>
  );
};

export default WelcomeSlideshow;