import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from 'antd';
import { ArrowRightOutlined, SoundOutlined, SoundFilled } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import WelcomeBackground from '../../components/auth/WelcomeBackground';
import WelcomeAnimation from '../../components/auth/WelcomeAnimation';
import './welcome.css';

/** Number of floating golden particles — kept modest and performant. */
const PARTICLE_COUNT = 22;

const Welcome: React.FC = () => {
  const navigate = useNavigate();
  const [redirecting] = useState(() => !!localStorage.getItem('token'));
  const [exiting, setExiting] = useState(false);
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

  useEffect(() => {
    document.title = 'Welcome | PWI — Pakistan Wire & Industry';
    if (redirecting) navigate('/dashboard', { replace: true });
  }, [redirecting, navigate]);

  useEffect(() => {
    // Subtle cinematic intro sound — optional, starts only after user interaction.
    if (muted || soundReady) return;
    if (audioRef.current) {
      audioRef.current.volume = 0.25;
      audioRef.current.play().catch(() => setMuted(true));
      setSoundReady(true);
    }
  }, [muted, soundReady]);

  const handleEnter = () => {
    // Ensure the audio never blocks the transition.
    if (audioRef.current) { audioRef.current.pause(); audioRef.current.currentTime = 0; }
    setExiting(true);
    window.setTimeout(() => navigate('/login', { replace: true }), 620);
  };

  const toggleMute = () => {
    setMuted((m) => !m);
    setSoundReady(false);
  };

  return (
    <div className={`erp-welcome-root${exiting ? ' is-exiting' : ''}`}>
      <WelcomeBackground reducedMotion={reducedMotion} />
      <div className="erp-welcome-overlay" aria-hidden="true" />
      <div className="erp-welcome-particles" aria-hidden="true">
        {particles.map((p, i) => (
          <span
            key={i}
            className="erp-welcome-particle"
            style={{ left: p.left, animationDelay: p.delay, animationDuration: p.duration, width: p.size, height: p.size }}
          />
        ))}
      </div>

      {/* Optional subtle audio */}
      <audio ref={audioRef} src={`${process.env.PUBLIC_URL}/assets/welcome/welcome-intro.wav`} preload="none" loop />
      <Button
        className="erp-welcome-sound"
        type="text"
        icon={muted ? <SoundOutlined /> : <SoundFilled />}
        aria-label={muted ? 'Unmute welcome sound' : 'Mute welcome sound'}
        onClick={toggleMute}
      />

      <div className="erp-welcome-panel">
        <img className="erp-welcome-logo" src={`${process.env.PUBLIC_URL}/logo.png`} alt="PWI — Pakistan Wire & Industry logo" />
        <div className="erp-welcome-brand">Pakistan Wire &amp; Industry</div>
        <WelcomeAnimation reducedMotion={reducedMotion} onAnimationComplete={() => {}} />
        <p className="erp-welcome-sub">
          Enterprise Manufacturing &amp; ERP System
        </p>
        <Button
          type="primary"
          className="erp-welcome-enter"
          size="large"
          icon={<ArrowRightOutlined />}
          onClick={handleEnter}
          onKeyDown={(e) => { if (e.key === 'Enter') handleEnter(); }}
          aria-label="Welcome — enter the ERP"
        >
          WELCOME
        </Button>
      </div>
    </div>
  );
};

export default Welcome;