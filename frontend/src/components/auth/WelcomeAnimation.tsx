import React, { useEffect, useState } from 'react';

interface Props {
  reducedMotion: boolean;
  onAnimationComplete: () => void;
}

/**
 * Handwriting / brush-stroke animation.
 * Uses SVG text with stroke-dasharray to progressively reveal the company name,
 * simulating a brush writing the words across the screen.
 */
const WelcomeAnimation: React.FC<Props> = ({ reducedMotion, onAnimationComplete }) => {
  const [phase, setPhase] = useState(0); // 0=welcome, 1=pwi, 2=full, 3=complete

  useEffect(() => {
    if (reducedMotion) { setPhase(3); onAnimationComplete(); return; }
    const t1 = setTimeout(() => setPhase(1), 400);
    const t2 = setTimeout(() => setPhase(2), 2400);
    const t3 = setTimeout(() => { setPhase(3); onAnimationComplete(); }, 4200);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [reducedMotion, onAnimationComplete]);

  if (reducedMotion) {
    return (
      <div className="erp-welcome-text">
        <div className="erp-welcome-line erp-welcome-line--welcome">WELCOME TO</div>
        <div className="erp-welcome-line erp-welcome-line--pwi">PAKISTAN WIRE &amp; INDUSTRY</div>
        <div className="erp-welcome-line erp-welcome-line--full">PRIVATE LIMITED</div>
      </div>
    );
  }

  return (
    <div className="erp-welcome-text">
      <div className={`erp-welcome-line erp-welcome-line--welcome ${phase >= 1 ? 'is-visible' : ''}`}>
        {phase >= 1 && <span>WELCOME TO</span>}
      </div>
      <div className={`erp-welcome-line erp-welcome-line--pwi ${phase >= 2 ? 'is-visible' : ''}`}>
        {phase >= 2 && <span>PAKISTAN WIRE &amp; INDUSTRY</span>}
      </div>
      <div className={`erp-welcome-line erp-welcome-line--full ${phase >= 3 ? 'is-visible' : ''}`}>
        {phase >= 3 && <span>PRIVATE LIMITED</span>}
      </div>
    </div>
  );
};

export default WelcomeAnimation;