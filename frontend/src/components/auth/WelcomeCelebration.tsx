import React, { useEffect, useRef } from 'react';

interface Props {
  reducedMotion: boolean;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  alpha: number;
  decay: number;
  size: number;
  color: string;
  flicker: boolean;
}

interface FireworkRocket {
  x: number;
  y: number;
  targetY: number;
  vx: number;
  vy: number;
  color: string;
  trail: { x: number; y: number; alpha: number }[];
}

interface ConfettiPiece {
  x: number;
  y: number;
  vx: number;
  vy: number;
  sizeX: number;
  sizeY: number;
  angle: number;
  vAngle: number;
  tilt: number;
  vTilt: number;
  color: string;
}

const FESTIVE_COLORS = [
  '#f5d47a', // PWI Champagne Gold
  '#fbbf24', // Golden Amber
  '#38bdf8', // Sapphire Cyan
  '#f43f5e', // Festive Ruby
  '#34d399', // Emerald Green
  '#ffffff', // Diamond White
  '#e879f9', // Royal Orchid
];

const WelcomeCelebration: React.FC<Props> = ({ reducedMotion }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const flashRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (reducedMotion || process.env.NODE_ENV === 'test') return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    const onResize = () => {
      if (!canvas) return;
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };
    window.addEventListener('resize', onResize);

    const particles: Particle[] = [];
    const rockets: FireworkRocket[] = [];
    const confetti: ConfettiPiece[] = [];

    // Initialize festive confetti
    const CONFETTI_COUNT = 45;
    for (let i = 0; i < CONFETTI_COUNT; i++) {
      confetti.push({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 1.2,
        vy: 1.2 + Math.random() * 1.8,
        sizeX: 6 + Math.random() * 6,
        sizeY: 8 + Math.random() * 8,
        angle: Math.random() * Math.PI * 2,
        vAngle: (Math.random() - 0.5) * 0.06,
        tilt: Math.random() * Math.PI,
        vTilt: 0.05 + Math.random() * 0.07,
        color: FESTIVE_COLORS[Math.floor(Math.random() * FESTIVE_COLORS.length)],
      });
    }

    const triggerFlash = () => {
      if (flashRef.current) {
        flashRef.current.style.opacity = '0.32';
        window.setTimeout(() => {
          if (flashRef.current) flashRef.current.style.opacity = '0';
        }, 120);
      }
    };

    const explode = (x: number, y: number, color: string) => {
      triggerFlash();
      const count = 45 + Math.floor(Math.random() * 25);
      for (let i = 0; i < count; i++) {
        const speed = 2.5 + Math.random() * 4.5;
        const angle = Math.random() * Math.PI * 2;
        particles.push({
          x,
          y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          alpha: 1,
          decay: 0.012 + Math.random() * 0.016,
          size: 2.2 + Math.random() * 2.2,
          color: Math.random() > 0.3 ? color : FESTIVE_COLORS[Math.floor(Math.random() * FESTIVE_COLORS.length)],
          flicker: Math.random() > 0.4,
        });
      }
    };

    const launchRocket = () => {
      const startX = width * 0.15 + Math.random() * (width * 0.7);
      const targetY = height * 0.12 + Math.random() * (height * 0.38);
      const color = FESTIVE_COLORS[Math.floor(Math.random() * FESTIVE_COLORS.length)];
      rockets.push({
        x: startX,
        y: height,
        targetY,
        vx: (Math.random() - 0.5) * 1.5,
        vy: -(7.5 + Math.random() * 3.5),
        color,
        trail: [],
      });
    };

    let lastLaunchTime = Date.now();
    let nextLaunchDelay = 1200 + Math.random() * 1500;
    let animId = 0;

    const render = () => {
      ctx.clearRect(0, 0, width, height);

      // Launch fireworks periodically
      const now = Date.now();
      if (now - lastLaunchTime > nextLaunchDelay) {
        launchRocket();
        if (Math.random() > 0.5) {
          // Double burst for grand celebration
          window.setTimeout(launchRocket, 250);
        }
        lastLaunchTime = now;
        nextLaunchDelay = 1800 + Math.random() * 1800;
      }

      // Update & Draw Rockets
      for (let i = rockets.length - 1; i >= 0; i--) {
        const r = rockets[i];
        r.x += r.vx;
        r.y += r.vy;
        r.vy += 0.08; // gravity deceleration

        r.trail.push({ x: r.x, y: r.y, alpha: 0.8 });
        if (r.trail.length > 8) r.trail.shift();

        // Draw trail
        for (let t = 0; t < r.trail.length; t++) {
          const pt = r.trail[t];
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, 2, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(255, 230, 160, ${pt.alpha * 0.6})`;
          ctx.fill();
          pt.alpha *= 0.85;
        }

        // Draw rocket head
        ctx.beginPath();
        ctx.arc(r.x, r.y, 3, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.shadowColor = r.color;
        ctx.shadowBlur = 10;
        ctx.fill();
        ctx.shadowBlur = 0;

        if (r.y <= r.targetY || r.vy >= -0.5) {
          explode(r.x, r.y, r.color);
          rockets.splice(i, 1);
        }
      }

      // Update & Draw Explosions Particles
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.06; // slight gravity
        p.vx *= 0.98;
        p.alpha -= p.decay;

        if (p.alpha <= 0) {
          particles.splice(i, 1);
          continue;
        }

        ctx.save();
        ctx.globalAlpha = p.flicker && Math.random() > 0.4 ? p.alpha * 0.5 : p.alpha;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.shadowColor = p.color;
        ctx.shadowBlur = 8;
        ctx.fill();
        ctx.restore();
      }

      // Update & Draw Confetti
      for (let i = 0; i < confetti.length; i++) {
        const c = confetti[i];
        c.y += c.vy;
        c.x += c.vx + Math.sin(c.angle) * 0.8;
        c.angle += c.vAngle;
        c.tilt += c.vTilt;

        if (c.y > height + 20) {
          c.y = -15;
          c.x = Math.random() * width;
        }

        ctx.save();
        ctx.translate(c.x, c.y);
        ctx.rotate(c.angle);
        const scaleY = Math.sin(c.tilt);
        ctx.scale(1, scaleY);
        ctx.fillStyle = c.color;
        ctx.globalAlpha = 0.78;
        ctx.fillRect(-c.sizeX / 2, -c.sizeY / 2, c.sizeX, c.sizeY);
        ctx.restore();
      }

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);

    return () => {
      window.removeEventListener('resize', onResize);
      cancelAnimationFrame(animId);
    };
  }, [reducedMotion]);

  return (
    <>
      {/* Festive Ambient Illumination Flash for fireworks */}
      <div
        ref={flashRef}
        className="erp-celebration-flash"
        aria-hidden="true"
      />

      {/* Festive Fairy String Lights across top */}
      <div className="erp-festive-lights-bar" aria-hidden="true">
        {Array.from({ length: 24 }).map((_, i) => (
          <span
            key={i}
            className={`erp-festive-bulb bulb-${i % 5}`}
            style={{ animationDelay: `${(i * 0.18) % 1.8}s` }}
          />
        ))}
      </div>

      {/* Celebratory Canvas: Fireworks, Sparklers & Falling Confetti */}
      <canvas
        ref={canvasRef}
        className="erp-celebration-canvas"
        aria-hidden="true"
      />
    </>
  );
};

export default WelcomeCelebration;
