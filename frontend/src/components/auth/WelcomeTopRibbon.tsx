import React, { useMemo, useState } from 'react';
import { PauseCircleOutlined, PlayCircleOutlined } from '@ant-design/icons';
import ClassicalMusicControl from '../shared/ClassicalMusicControl';
import InstallAppHeaderButton from '../pwa/InstallAppHeaderButton';
import ThemeToggle from './ThemeToggle';
import {
  formatDivisionFlowSummary,
  parseCompanyBrandParts,
} from '../../config/companyWelcomeConfig';
import { useCompanyWelcomeConfig } from '../../store/companyWelcomeStore';

interface Props {
  isMusicPlaying?: boolean;
  onToggleMusic?: () => void;
}

interface TopSlide {
  badge: string;
  title: string;
  tagline: string;
}

const WelcomeTopRibbon: React.FC<Props> = () => {
  const [isPaused, setIsPaused] = useState(false);
  const { config, welcomePortal, enabledDivisions } = useCompanyWelcomeConfig();

  const brand = useMemo(
    () => parseCompanyBrandParts(config.companyName),
    [config.companyName],
  );

  const logoSrc = config.logoUrl || `${process.env.PUBLIC_URL || ''}/logo.png`;

  // Dynamically construct announcements from Company Settings & configured Divisions
  const announcements = useMemo<TopSlide[]>(() => {
    const items: TopSlide[] = [
      {
        badge: `${brand.monogram} OFFICIAL`,
        title: brand.fullName,
        tagline: welcomePortal.portalTagline,
      },
    ];

    enabledDivisions.forEach((div) => {
      items.push({
        badge: div.code,
        title: div.name,
        tagline: formatDivisionFlowSummary(div),
      });
    });

    return items;
  }, [brand.fullName, brand.monogram, enabledDivisions, welcomePortal.portalTagline]);

  return (
    <header className="erp-welcome-top-ribbon" role="banner">
      {/* Brand Identity with Circular Medallion Logo */}
      <div className="erp-top-ribbon-brand">
        <div className="erp-top-logo-badge">
          <img
            src={logoSrc}
            alt={`${brand.monogram} Logo`}
            className="erp-top-logo-img"
          />
        </div>
        <div className="erp-top-brand-text">
          <span className="erp-top-brand-code">{brand.monogram}</span>
          <span className="erp-top-live-dot" title="Live Enterprise System Online" />
          <span className="erp-top-live-label">LIVE</span>
        </div>
      </div>

      {/* Continuous Fluid Marquee Showcase (Automatically reflects all configured divisions) */}
      <div
        className="erp-top-ticker-wrap"
        onMouseEnter={() => setIsPaused(true)}
        onMouseLeave={() => setIsPaused(false)}
        title="Hover to pause announcement ticker"
      >
        <div className={`erp-top-ticker-track${isPaused ? ' is-paused' : ''}`}>
          {[...announcements, ...announcements].map((item, idx) => (
            <div key={idx} className="erp-ticker-item">
              <span className="erp-ticker-pill">{item.badge}</span>
              <strong className="erp-ticker-title">{item.title}</strong>
              <span className="erp-ticker-sep">—</span>
              <span className="erp-ticker-tagline">{item.tagline}</span>
              <span className="erp-ticker-bullet">✦</span>
            </div>
          ))}
        </div>
      </div>

      {/* Right Controls: Install App + Theme Toggle + Marquee Pause Toggle + Audio Control */}
      <div className="erp-top-ribbon-actions">
        <InstallAppHeaderButton variant="ribbon" />

        <ThemeToggle />

        <button
          type="button"
          className="erp-top-action-btn erp-top-pause-btn"
          onClick={() => setIsPaused((p) => !p)}
          aria-label={isPaused ? 'Resume ticker marquee' : 'Pause ticker marquee'}
          title={isPaused ? 'Resume scrolling ticker' : 'Pause scrolling ticker'}
        >
          {isPaused ? <PlayCircleOutlined /> : <PauseCircleOutlined />}
        </button>

        <ClassicalMusicControl hideSettingsLink />
      </div>
    </header>
  );
};

export default WelcomeTopRibbon;
