import React, { useState, useEffect } from 'react';
import { SoundFilled, SoundOutlined, LeftOutlined, RightOutlined } from '@ant-design/icons';

interface Props {
  isMusicPlaying: boolean;
  onToggleMusic: () => void;
}

interface TopSlide {
  badge: string;
  title: string;
  tagline: string;
}

const TOP_SLIDES: TopSlide[] = [
  {
    badge: 'PWI OFFICIAL',
    title: 'PAKISTAN WIRE & INDUSTRY (PVT) LTD.',
    tagline: 'Leader in Precision Wire, Spoke & Cable Manufacturing Since 1978',
  },
  {
    badge: 'SPOKE DIVISION',
    title: 'HIGH-PRECISION SPOKE & NIPPLE PROCESSING',
    tagline: 'Automated Wire Drawing, Swagging, Threading & Mirror Nickel-Chrome Auto-Plating',
  },
  {
    badge: 'ENTERPRISE ERP',
    title: 'INTEGRATED MRP & PRODUCTION ECOSYSTEM',
    tagline: 'Real-Time Plant Floor Intelligence, Material Tracking & Total Quality Assurance',
  },
  {
    badge: 'NATIONAL EXCELLENCE',
    title: 'SUPPLYING PREMIUM INDUSTRIAL AUTOMOTIVE COMPONENTS',
    tagline: 'Trusted by OEM Vehicle Manufacturers & High-Tensile Industrial Wire Sectors',
  },
];

const WelcomeTopRibbon: React.FC<Props> = ({ isMusicPlaying, onToggleMusic }) => {
  const [activeSlide, setActiveSlide] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setActiveSlide((prev) => (prev + 1) % TOP_SLIDES.length);
    }, 4800);
    return () => window.clearInterval(timer);
  }, []);

  const handlePrev = (e: React.MouseEvent) => {
    e.stopPropagation();
    setActiveSlide((prev) => (prev - 1 + TOP_SLIDES.length) % TOP_SLIDES.length);
  };

  const handleNext = (e: React.MouseEvent) => {
    e.stopPropagation();
    setActiveSlide((prev) => (prev + 1) % TOP_SLIDES.length);
  };

  const current = TOP_SLIDES[activeSlide];

  return (
    <header className="erp-welcome-top-ribbon" role="banner">
      {/* Brand Identity with Circular Logo */}
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
          <span className="erp-top-live-dot" title="System Online" />
        </div>
      </div>

      {/* Center Sliding Ticker / Showcase */}
      <div className="erp-top-ribbon-slider">
        <button
          type="button"
          className="erp-top-slider-arrow"
          onClick={handlePrev}
          aria-label="Previous Announcement"
          title="Previous Announcement"
        >
          <LeftOutlined />
        </button>

        <div className="erp-top-slide-viewport">
          <div key={activeSlide} className="erp-top-slide-content">
            <span className="erp-top-slide-pill">{current.badge}</span>
            <strong className="erp-top-slide-title">{current.title}</strong>
            <span className="erp-top-slide-sep">—</span>
            <span className="erp-top-slide-tagline">{current.tagline}</span>
          </div>
        </div>

        <button
          type="button"
          className="erp-top-slider-arrow"
          onClick={handleNext}
          aria-label="Next Announcement"
          title="Next Announcement"
        >
          <RightOutlined />
        </button>

        {/* Mini dot indicators */}
        <div className="erp-top-slide-dots" aria-hidden="true">
          {TOP_SLIDES.map((_, idx) => (
            <span
              key={idx}
              className={`erp-top-dot${idx === activeSlide ? ' is-active' : ''}`}
              onClick={(e) => {
                e.stopPropagation();
                setActiveSlide(idx);
              }}
            />
          ))}
        </div>
      </div>

      {/* Classical Background Audio Toggle Pill */}
      <div className="erp-top-ribbon-actions">
        <button
          type="button"
          className={`erp-top-music-btn${isMusicPlaying ? ' is-playing' : ''}`}
          onClick={(e) => {
            e.stopPropagation();
            onToggleMusic();
          }}
          aria-label={isMusicPlaying ? 'Mute soft classical music' : 'Play soft classical music'}
          title={isMusicPlaying ? 'Click to Mute Classical Background Music' : 'Click to Play Soft Classical Ambient Music'}
        >
          <span className="erp-top-music-icon">
            {isMusicPlaying ? <SoundFilled /> : <SoundOutlined />}
          </span>
          <span className="erp-top-music-label">
            {isMusicPlaying ? 'Classical Audio' : 'Audio Muted'}
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
