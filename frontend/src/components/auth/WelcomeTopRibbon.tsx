import React, { useState } from 'react';
import { SoundFilled, SoundOutlined, PauseCircleOutlined, PlayCircleOutlined } from '@ant-design/icons';

interface Props {
  isMusicPlaying: boolean;
  onToggleMusic: () => void;
}

interface TopSlide {
  badge: string;
  title: string;
  tagline: string;
}

const ANNOUNCEMENTS: TopSlide[] = [
  {
    badge: 'PWI OFFICIAL',
    title: 'PAKISTAN WIRE & INDUSTRY (PVT) LTD.',
    tagline: 'Leader in Precision Wire, Spoke & Cable Manufacturing Since 1978',
  },
  {
    badge: 'SPOKE DIVISION',
    title: 'SPOKE & NIPPLE PROCESSING (SPD)',
    tagline: 'Continuous Wire Drawing, Swagging, Threading & Mirror Nickel-Chrome Auto-Plating',
  },
  {
    badge: 'ENTERPRISE ERP',
    title: 'INTEGRATED MRP & PRODUCTION ECOSYSTEM',
    tagline: 'Real-Time Plant Floor Scheduling, Material Tracking & Total Quality Traceability',
  },
  {
    badge: 'NATIONAL EXCELLENCE',
    title: 'INDUSTRIAL & AUTOMOTIVE WIRE SOLUTIONS',
    tagline: 'High Tensile Galvanized & Annealed Wire Coils for OEM Vehicle Assembly',
  },
];

const WelcomeTopRibbon: React.FC<Props> = ({ isMusicPlaying, onToggleMusic }) => {
  const [isPaused, setIsPaused] = useState(false);

  return (
    <header className="erp-welcome-top-ribbon" role="banner">
      {/* Brand Identity with Circular Medallion Logo */}
      <div className="erp-top-ribbon-brand">
        <div className="erp-top-logo-badge">
          <img
            src={`${process.env.PUBLIC_URL}/logo.png`}
            alt="PWI Logo"
            className="erp-top-logo-img"
          />
        </div>
        <div className="erp-top-brand-text">
          <span className="erp-top-brand-code">PWI</span>
          <span className="erp-top-live-dot" title="Live Enterprise System Online" />
          <span className="erp-top-live-label">LIVE</span>
        </div>
      </div>

      {/* Continuous Fluid Marquee Showcase (Never cuts off text, flows infinitely) */}
      <div
        className="erp-top-ticker-wrap"
        onMouseEnter={() => setIsPaused(true)}
        onMouseLeave={() => setIsPaused(false)}
        title="Hover to pause announcement ticker"
      >
        <div className={`erp-top-ticker-track${isPaused ? ' is-paused' : ''}`}>
          {/* Repeat sequence twice for continuous seamless infinite loop */}
          {[...ANNOUNCEMENTS, ...ANNOUNCEMENTS].map((item, idx) => (
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

      {/* Right Controls: Marquee Pause Toggle + Classical Audio Control */}
      <div className="erp-top-ribbon-actions">
        <button
          type="button"
          className="erp-top-action-btn erp-top-pause-btn"
          onClick={() => setIsPaused((p) => !p)}
          aria-label={isPaused ? 'Resume ticker marquee' : 'Pause ticker marquee'}
          title={isPaused ? 'Resume scrolling ticker' : 'Pause scrolling ticker'}
        >
          {isPaused ? <PlayCircleOutlined /> : <PauseCircleOutlined />}
        </button>

        <button
          type="button"
          className={`erp-top-music-btn${isMusicPlaying ? ' is-playing' : ''}`}
          onClick={(e) => {
            e.stopPropagation();
            onToggleMusic();
          }}
          aria-label={isMusicPlaying ? 'Mute soft classical music' : 'Play soft classical music'}
          title={isMusicPlaying ? 'Click to Mute Classical Ambient Music' : 'Click to Play Soft Classical Ambient Music'}
        >
          <span className="erp-top-music-icon">
            {isMusicPlaying ? <SoundFilled /> : <SoundOutlined />}
          </span>
          <span className="erp-top-music-label">
            {isMusicPlaying ? 'Classical Music' : 'Audio Muted'}
          </span>
          {isMusicPlaying && (
            <span className="erp-top-soundwave" aria-hidden="true">
              <span className="wave-bar bar-1" />
              <span className="wave-bar bar-2" />
              <span className="wave-bar bar-3" />
            </span>
          )}
        </button>
      </div>
    </header>
  );
};

export default WelcomeTopRibbon;
