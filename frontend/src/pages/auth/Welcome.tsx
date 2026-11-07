import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { Button } from 'antd';
import { ArrowRightOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import WelcomeBackground from '../../components/auth/WelcomeBackground';
import WelcomeAnimation from '../../components/auth/WelcomeAnimation';
import WelcomeTopRibbon from '../../components/auth/WelcomeTopRibbon';
import WelcomeLifecycleShowcase from '../../components/auth/WelcomeLifecycleShowcase';
import {
  collectDivisionImageUrls,
  parseCompanyBrandParts,
  resolveDivisionStageVisual,
} from '../../config/companyWelcomeConfig';
import { useCompanyWelcomeConfig } from '../../store/companyWelcomeStore';
import { useMusicStore } from '../../store/musicStore';
import './welcome.css';

/** Subtle ambient particles count */
const PARTICLE_COUNT = 16;

const Welcome: React.FC = () => {
  const navigate = useNavigate();
  const { config, welcomePortal, enabledDivisions } = useCompanyWelcomeConfig();
  const [exiting, setExiting] = useState(false);
  const [activeDivisionIdx, setActiveDivisionIdx] = useState(0);
  const [activeStageIdx, setActiveStageIdx] = useState(0);

  const brand = useMemo(
    () => parseCompanyBrandParts(config.companyName),
    [config.companyName],
  );
  const logoSrc = config.logoUrl || `${process.env.PUBLIC_URL || ''}/logo.png`;

  const reducedMotion = useMemo(
    () =>
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    [],
  );

  const particles = useMemo(
    () =>
      Array.from({ length: PARTICLE_COUNT }, (_, i) => ({
        left: `${(i * 37 + 9) % 100}%`,
        delay: `${(i * 1.1) % 12}s`,
        duration: `${11 + (i % 7)}s`,
        size: 2 + (i % 3),
      })),
    [],
  );

  // Keep activeDivisionIdx & activeStageIdx within valid bounds if divisions are dynamically modified
  useEffect(() => {
    if (enabledDivisions.length > 0 && activeDivisionIdx >= enabledDivisions.length) {
      setActiveDivisionIdx(0);
      setActiveStageIdx(0);
    }
  }, [activeDivisionIdx, enabledDivisions.length]);

  const safeDivisionIdx =
    enabledDivisions.length > 0 ? activeDivisionIdx % enabledDivisions.length : 0;
  const currentDivision = enabledDivisions[safeDivisionIdx];

  // Exact department-level synchronized visual for WelcomeBackground
  const activeVisual = useMemo(
    () =>
      resolveDivisionStageVisual(
        currentDivision,
        activeStageIdx,
        welcomePortal.heroBannerUrl,
      ),
    [activeStageIdx, currentDivision, welcomePortal.heroBannerUrl],
  );

  // Preload all department background scenes for zero-latency crossfades
  const preloadUrls = useMemo(
    () => collectDivisionImageUrls(enabledDivisions, welcomePortal.heroBannerUrl),
    [enabledDivisions, welcomePortal.heroBannerUrl],
  );

  useEffect(() => {
    document.title = `Welcome | ${brand.monogram} — ${brand.fullName}`;
  }, [brand.fullName, brand.monogram]);

  const handleNextDivision = useCallback(() => {
    if (enabledDivisions.length === 0) return;
    setActiveStageIdx(0);
    setActiveDivisionIdx((prev) => (prev + 1) % enabledDivisions.length);
  }, [enabledDivisions.length]);

  const handlePrevDivision = useCallback(() => {
    if (enabledDivisions.length === 0) return;
    setActiveStageIdx(0);
    setActiveDivisionIdx(
      (prev) => (prev - 1 + enabledDivisions.length) % enabledDivisions.length,
    );
  }, [enabledDivisions.length]);

  const handleEnter = useCallback(() => {
    if (useMusicStore.getState().isPlaying) {
      useMusicStore.getState().pause();
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
      window.setTimeout(() => navigate('/login', { replace: true }), 380);
    }
  }, [navigate]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === 'Escape') {
        handleEnter();
      } else if (e.key === 'ArrowRight') {
        handleNextDivision();
      } else if (e.key === 'ArrowLeft') {
        handlePrevDivision();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handleEnter, handleNextDivision, handlePrevDivision]);

  return (
    <div className={`erp-welcome-root${exiting ? ' is-exiting' : ''}`}>
      {/* Top Corporate Ribbon: Brand Identity, Dynamic Division Marquee, Install App, Theme & Audio Controls */}
      <WelcomeTopRibbon />

      {/* Department-Synchronized Fullscreen Holographic Manufacturing Background */}
      <WelcomeBackground
        activeVisual={activeVisual}
        preloadUrls={preloadUrls}
        reducedMotion={reducedMotion}
      />

      {/* Dark Corporate Cinema Vignette & Purple / Neon-Blue Ambient Glows */}
      <div className="erp-welcome-overlay" aria-hidden="true" />
      <div className="erp-welcome-flares" aria-hidden="true">
        <span className="erp-welcome-flare erp-welcome-flare-1" />
        <span className="erp-welcome-flare erp-welcome-flare-2" />
      </div>

      {/* Subtle Floating High-Tech Data Nodes */}
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

      {/* Center Stage Executive Dark-Corporate Glass Console */}
      <div className="erp-welcome-panel">
        {/* Seamless Rounded Metallic Medallion Logo */}
        <div className="erp-welcome-logo-wrap" title={brand.fullName}>
          <div className="erp-welcome-logo-badge">
            <img
              className="erp-welcome-logo"
              src={logoSrc}
              alt={`${brand.monogram} — ${brand.fullName} logo`}
            />
          </div>
        </div>

        {/* Executive Brand Reveal & Luminous White / Neon-Cyan-Purple Calligraphy */}
        <WelcomeAnimation
          reducedMotion={reducedMotion}
          onAnimationComplete={() => {}}
        />

        {/* Synchronized Dynamic Division & Department Lifecycle Showcase */}
        <WelcomeLifecycleShowcase
          divisions={enabledDivisions}
          activeDivisionIndex={safeDivisionIdx}
          onDivisionChange={setActiveDivisionIdx}
          activeStage={activeStageIdx}
          onStageChange={setActiveStageIdx}
          autoCycle={welcomePortal.autoCycleDivisions}
          divisionCycleIntervalMs={welcomePortal.divisionCycleIntervalMs}
          stagePulseIntervalMs={welcomePortal.stagePulseIntervalMs}
          reducedMotion={reducedMotion}
        />

        {/* Primary Enterprise Entry Action */}
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
            ENTER ENTERPRISE SYSTEM
          </Button>

          <div className="erp-welcome-login-hint">
            Press Enter to proceed to Sign-In Console
          </div>
        </div>
      </div>
    </div>
  );
};

export default Welcome;
