import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { Button } from 'antd';
import {
  ArrowRightOutlined,
  LeftOutlined,
  RightOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import WelcomeBackground from '../../components/auth/WelcomeBackground';
import WelcomeAnimation from '../../components/auth/WelcomeAnimation';
import WelcomeCelebration from '../../components/auth/WelcomeCelebration';
import WelcomeTopRibbon from '../../components/auth/WelcomeTopRibbon';
import { classicalAmbientMusic } from '../../utils/classicalAmbientMusic';
import { WELCOME_SLIDE_ITEMS } from '../../config/welcomeImages';
import './welcome.css';

/** Floating particles count */
const PARTICLE_COUNT = 18;

const Welcome: React.FC = () => {
  const navigate = useNavigate();
  const [exiting, setExiting] = useState(false);
  const [activeSlide, setActiveSlide] = useState(0);
  const [isMusicPlaying, setIsMusicPlaying] = useState(false);

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

  const handleToggleMusic = useCallback(() => {
    if (isMusicPlaying) {
      classicalAmbientMusic.stop(300);
      setIsMusicPlaying(false);
    } else {
      const ok = classicalAmbientMusic.start();
      if (ok) setIsMusicPlaying(true);
    }
  }, [isMusicPlaying]);

  // Gentle unlock of classical ambient music on first user interaction anywhere
  useEffect(() => {
    const handleFirstGesture = () => {
      if (!classicalAmbientMusic.getIsPlaying() && process.env.NODE_ENV !== 'test') {
        const ok = classicalAmbientMusic.start();
        if (ok) setIsMusicPlaying(true);
      }
    };

    window.addEventListener('click', handleFirstGesture, { once: true });
    window.addEventListener('keydown', handleFirstGesture, { once: true });
    return () => {
      window.removeEventListener('click', handleFirstGesture);
      window.removeEventListener('keydown', handleFirstGesture);
    };
  }, []);

  const handleEnter = useCallback(() => {
    classicalAmbientMusic.stop(400);
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

  const currentSlide = slides[activeSlide] || slides[0];

  return (
    <div className={`erp-welcome-root${exiting ? ' is-exiting' : ''}`}>
      {/* Top Slide Ribbon (Pakistan Wire & Industry Showcase + Logo + Classical Music Toggle) */}
      <WelcomeTopRibbon
        isMusicPlaying={isMusicPlaying}
        onToggleMusic={handleToggleMusic}
      />

      {/* Background Slideshow */}
      <WelcomeBackground
        reducedMotion={reducedMotion}
        activeIndex={activeSlide}
        onIndexChange={setActiveSlide}
      />

      {/* Overlay Vignette */}
      <div className="erp-welcome-overlay" aria-hidden="true" />

      {/* Festive Fireworks, Flash, Fairy Lights & Confetti Celebration Overlays */}
      <WelcomeCelebration reducedMotion={reducedMotion} />

      {/* Subtle floating gold particles */}
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

      {/* Center Stage Compact Glass Console */}
      <div className="erp-welcome-panel">
        {/* Seamless Rounded Metallic Medallion Logo */}
        <div className="erp-welcome-logo-wrap" title="Pakistan Wire & Industry (Private) Limited">
          <div className="erp-welcome-logo-badge">
            <img
              className="erp-welcome-logo"
              src={`${process.env.PUBLIC_URL}/logo.png`}
              alt="PWI — Pakistan Wire & Industry logo"
            />
          </div>
        </div>

        {/* Live Handwriting Headline Animation */}
        <WelcomeAnimation
          reducedMotion={reducedMotion}
          onAnimationComplete={() => {}}
        />

        {/* 6-Photo Industrial Showcase Card (100% English) */}
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
