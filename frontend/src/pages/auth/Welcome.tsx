import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { Button } from 'antd';
import {
  ArrowRightOutlined,
  SoundOutlined,
  SoundFilled,
  LeftOutlined,
  RightOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import WelcomeBackground from '../../components/auth/WelcomeBackground';
import WelcomeAnimation from '../../components/auth/WelcomeAnimation';
import { WELCOME_SLIDE_ITEMS } from '../../config/welcomeImages';
import './welcome.css';

/** Floating particles count */
const PARTICLE_COUNT = 18;

const Welcome: React.FC = () => {
  const navigate = useNavigate();
  const [exiting, setExiting] = useState(false);
  const [activeSlide, setActiveSlide] = useState(0);
  const [muted, setMuted] = useState(true);
  const [soundReady, setSoundReady] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const reducedMotion = useMemo(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    [],
  );

  const particles = useMemo(
    () =>
      Array.from({ length: PARTICLE_COUNT }, (_, i) => ({
        left: `${(i * 37) % 100}%`,
        delay: `${(i * 0.9) % 12}s`,
        duration: `${9 + (i % 7)}s`,
        size: 2 + (i % 3),
      })),
    [],
  );

  const slides = useMemo(() => WELCOME_SLIDE_ITEMS, []);

  useEffect(() => {
    document.title = 'Welcome | PWI — Pakistan Wire & Industry';
  }, []);

  const handleNextSlide = useCallback(() => {
    setActiveSlide((prev) => (prev + 1) % slides.length);
  }, [slides.length]);

  const handlePrevSlide = useCallback(() => {
    setActiveSlide((prev) => (prev - 1 + slides.length) % slides.length);
  }, [slides.length]);

  const handleEnter = useCallback(() => {
    if (
      audioRef.current &&
      typeof audioRef.current.pause === 'function' &&
      process.env.NODE_ENV !== 'test'
    ) {
      try {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      } catch {
        /* ignore */
      }
    }
    setExiting(true);

    try {
      sessionStorage.setItem('pwi_welcome_passed', 'true');
    } catch {
      /* ignore */
    }

    if (process.env.NODE_ENV === 'test') {
      navigate('/login', { replace: true });
    } else {
      window.setTimeout(() => navigate('/login', { replace: true }), 400);
    }
  }, [navigate]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === 'Escape') {
        handleEnter();
      } else if (e.key === 'ArrowRight') {
        handleNextSlide();
      } else if (e.key === 'ArrowLeft') {
        handlePrevSlide();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handleEnter, handleNextSlide, handlePrevSlide]);

  useEffect(() => {
    if (muted || soundReady) return;
    if (audioRef.current) {
      audioRef.current.volume = 0.25;
      audioRef.current.play().catch(() => setMuted(true));
      setSoundReady(true);
    }
  }, [muted, soundReady]);

  const toggleMute = () => {
    setMuted((m) => !m);
    setSoundReady(false);
  };

  const currentSlide = slides[activeSlide] || slides[0];

  return (
    <div className={`erp-welcome-root${exiting ? ' is-exiting' : ''}`}>
      <WelcomeBackground
        reducedMotion={reducedMotion}
        activeIndex={activeSlide}
        onIndexChange={setActiveSlide}
      />
      <div className="erp-welcome-overlay" aria-hidden="true" />
      <div className="erp-welcome-particles" aria-hidden="true">
        {particles.map((p, i) => (
          <span
            key={i}
            className="erp-welcome-particle"
            style={{
              left: p.left,
              animationDelay: p.delay,
              animationDuration: p.duration,
              width: p.size,
              height: p.size,
            }}
          />
        ))}
      </div>

      {/* Optional subtle intro audio */}
      <audio
        ref={audioRef}
        src={`${process.env.PUBLIC_URL}/assets/welcome/welcome-intro.wav`}
        preload="none"
        loop
      />
      <Button
        className="erp-welcome-sound"
        type="text"
        icon={muted ? <SoundOutlined /> : <SoundFilled />}
        aria-label={muted ? 'Unmute welcome sound' : 'Mute welcome sound'}
        onClick={toggleMute}
      />

      {/* Center Stage Compact Glass Console */}
      <div className="erp-welcome-panel">
        <div className="erp-welcome-logo-wrap">
          <img
            className="erp-welcome-logo"
            src={`${process.env.PUBLIC_URL}/logo.png`}
            alt="PWI — Pakistan Wire & Industry logo"
          />
        </div>

        {/* Live Handwriting Headline Animation */}
        <WelcomeAnimation
          reducedMotion={reducedMotion}
          onAnimationComplete={() => {}}
        />

        {/* 6-Photo Industrial Showcase Bar (100% English) */}
        <div className="erp-welcome-showcase-card">
          <div className="erp-welcome-showcase-nav">
            <button
              type="button"
              className="erp-welcome-nav-arrow prev"
              onClick={handlePrevSlide}
              aria-label="Previous Slide"
              title="Previous Photo (←)"
            >
              <LeftOutlined />
            </button>

            <div className="erp-welcome-showcase-content">
              <div className="erp-welcome-slide-badge">
                <span className="erp-welcome-slide-num">{`0${activeSlide + 1}`}</span>
                <span className="erp-welcome-slide-total">/ 0{slides.length}</span>
                <span className="erp-welcome-slide-divider">•</span>
                <span className="erp-welcome-slide-caption-en">{currentSlide.title}</span>
              </div>
              <p className="erp-welcome-slide-desc">{currentSlide.subtitle}</p>
            </div>

            <button
              type="button"
              className="erp-welcome-nav-arrow next"
              onClick={handleNextSlide}
              aria-label="Next Slide"
              title="Next Photo (→)"
            >
              <RightOutlined />
            </button>
          </div>

          {/* Dots Indicator */}
          <div
            className="erp-welcome-dots"
            role="tablist"
            aria-label="Company gallery navigation"
          >
            {slides.map((s, idx) => (
              <button
                key={s.src}
                type="button"
                role="tab"
                aria-selected={idx === activeSlide}
                aria-label={`Slide ${idx + 1}: ${s.title}`}
                className={`erp-welcome-dot${idx === activeSlide ? ' is-active' : ''}`}
                onClick={() => setActiveSlide(idx)}
              >
                <span className="erp-welcome-dot-inner" />
              </button>
            ))}
          </div>
        </div>

        {/* OK / Enter Button (100% English) */}
        <div className="erp-welcome-action-wrap">
          <Button
            type="primary"
            className="erp-welcome-enter"
            size="large"
            icon={<ArrowRightOutlined className="erp-welcome-enter-arrow" />}
            onClick={handleEnter}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleEnter();
            }}
            aria-label="Enter System"
          >
            OK — ENTER SYSTEM
          </Button>

          <div className="erp-welcome-login-hint">
            Press Enter or click OK to sign in
          </div>
        </div>
      </div>
    </div>
  );
};

export default Welcome;
