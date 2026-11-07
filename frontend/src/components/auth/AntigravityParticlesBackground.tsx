import React, { useEffect, useRef } from 'react';
import { useThemeStore } from '../../theme/themeStore';

interface ParticleNode {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  baseAlpha: number;
  pulsePhase: number;
  pulseSpeed: number;
  rvx: number;
  rvy: number;
  colorHex: string;
  isAccentRed: boolean;
}

/**
 * High-tech Digital Holographic Palette:
 * Blue and Red particles with subtle interconnecting constellation nodes and waves.
 */
const BLUE_PALETTE = ['#00d2ff', '#0099ff', '#3b82f6', '#2563eb', '#60a5fa'];
const RED_PALETTE = ['#ff3366', '#ea4335', '#ef4444', '#f87171', '#ff5252'];

const REPULSE_RADIUS = 160;
const REPULSE_FORCE = 1.35;
const VELOCITY_DAMPING = 0.92;
const LINK_DISTANCE = 115;

function createParticle(width: number, height: number, index: number): ParticleNode {
  // ~65% Blue / Cyan, ~35% Red / Coral
  const isAccentRed = index % 7 === 1 || index % 7 === 4;
  const palette = isAccentRed ? RED_PALETTE : BLUE_PALETTE;
  const colorHex = palette[index % palette.length];

  const depthRoll = (index * 13) % 10;
  const radius =
    depthRoll < 4
      ? 1.5 + Math.random() * 1.0 // background fine micro-nodes
      : depthRoll < 8
      ? 2.4 + Math.random() * 1.2 // midground glowing particles
      : 3.6 + Math.random() * 1.6; // foreground buoyant orbs

  // Free-floating organic drifting velocities in all directions with slight upward buoyant bias
  const angle = Math.random() * Math.PI * 2;
  const speed = 0.25 + Math.random() * 0.45;

  return {
    x: Math.random() * width,
    y: Math.random() * height,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed - 0.18, // subtle antigravity lift
    radius,
    baseAlpha: depthRoll >= 8 ? 0.65 + Math.random() * 0.25 : 0.35 + Math.random() * 0.35,
    pulsePhase: Math.random() * Math.PI * 2,
    pulseSpeed: 0.012 + Math.random() * 0.018,
    rvx: 0,
    rvy: 0,
    colorHex,
    isAccentRed,
  };
}

/**
 * True "Antigravity" High-Tech Particle Simulation:
 * - Fluid buoyant upward floating + organic multidirectional drift
 * - Interactive cursor repulsion force-field (repulse effect) with smooth inertia
 * - Luminous constellation link lines between proximate nodes
 * - Smooth wave ripples on click
 * - Non-intrusive z-index 0 layering with protective radial contrast zone
 */
const AntigravityParticlesBackground: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const mode = useThemeStore((state) => state.draft.mode);
  const modeRef = useRef(mode);
  modeRef.current = mode;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || typeof window === 'undefined') return undefined;

    let ctx: CanvasRenderingContext2D | null = null;
    try {
      ctx = canvas.getContext('2d');
    } catch {
      ctx = null;
    }
    if (!ctx) return undefined;

    const reducedMotion =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let width = window.innerWidth || 1280;
    let height = window.innerHeight || 800;
    let dpr = Math.min(window.devicePixelRatio || 1, 2);
    let particles: ParticleNode[] = [];
    let rafId: number | null = null;
    let isRunning = true;

    // Interactive pointer & click ripples
    const pointer = {
      x: -9999,
      y: -9999,
      active: false,
    };

    interface Ripple {
      x: number;
      y: number;
      r: number;
      maxR: number;
      alpha: number;
    }
    const ripples: Ripple[] = [];

    const syncCanvasMetrics = () => {
      width = window.innerWidth || 1280;
      height = window.innerHeight || 800;
      dpr = Math.min(window.devicePixelRatio || 1, 2);

      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);

      // Balanced density based on viewport resolution
      const targetCount = Math.min(105, Math.max(52, Math.floor((width * height) / 16000)));
      if (particles.length === 0) {
        particles = Array.from({ length: targetCount }, (_, i) =>
          createParticle(width, height, i),
        );
      } else if (particles.length < targetCount) {
        const extra = Array.from({ length: targetCount - particles.length }, (_, i) =>
          createParticle(width, height, particles.length + i),
        );
        particles.push(...extra);
      } else if (particles.length > targetCount) {
        particles.length = targetCount;
      }
    };

    syncCanvasMetrics();

    const drawFrame = () => {
      ctx!.clearRect(0, 0, width, height);
      const isDark = modeRef.current === 'dark';

      // 1. Process Click Ripples (Antigravity shockwave)
      for (let rIdx = ripples.length - 1; rIdx >= 0; rIdx -= 1) {
        const rip = ripples[rIdx];
        rip.r += 4.5;
        rip.alpha *= 0.94;

        if (rip.alpha > 0.02 && rip.r < rip.maxR) {
          ctx!.save();
          ctx!.beginPath();
          ctx!.arc(rip.x, rip.y, rip.r, 0, Math.PI * 2);
          ctx!.strokeStyle = isDark
            ? `rgba(0, 210, 255, ${rip.alpha * 0.45})`
            : `rgba(0, 153, 255, ${rip.alpha * 0.35})`;
          ctx!.lineWidth = 2;
          ctx!.stroke();
          ctx!.restore();
        } else {
          ripples.splice(rIdx, 1);
        }
      }

      // 2. Update Particle Motion & Interactive Repulsion
      for (let i = 0; i < particles.length; i += 1) {
        const p = particles[i];

        if (!reducedMotion) {
          p.pulsePhase += p.pulseSpeed;

          // Interactive cursor hover repulsion (True Antigravity Force-Field)
          if (pointer.active) {
            const dx = p.x - pointer.x;
            const dy = p.y - pointer.y;
            const distSq = dx * dx + dy * dy;
            if (distSq > 0.01 && distSq < REPULSE_RADIUS * REPULSE_RADIUS) {
              const dist = Math.sqrt(distSq);
              // Quadratic ease-out push factor
              const factor = Math.pow(1 - dist / REPULSE_RADIUS, 1.8) * REPULSE_FORCE;
              p.rvx += (dx / dist) * factor * 1.8;
              p.rvy += (dy / dist) * factor * 1.8;
            }
          }

          // Apply velocity, repulsion inertia and damping
          p.x += p.vx + p.rvx;
          p.y += p.vy + p.rvy;

          p.rvx *= VELOCITY_DAMPING;
          p.rvy *= VELOCITY_DAMPING;

          // Infinite smooth toroidal screen wrapping
          const pad = p.radius + 18;
          if (p.y < -pad) {
            p.y = height + pad;
            p.x = Math.random() * width;
          } else if (p.y > height + pad) {
            p.y = -pad;
          }
          if (p.x < -pad) p.x = width + pad;
          else if (p.x > width + pad) p.x = -pad;
        }
      }

      // 3. Draw Constellation Network Links between Proximate Particles
      ctx!.lineWidth = 0.75;
      for (let i = 0; i < particles.length; i += 1) {
        const p1 = particles[i];
        for (let j = i + 1; j < particles.length; j += 1) {
          const p2 = particles[j];
          const dx = p1.x - p2.x;
          const dy = p1.y - p2.y;
          const distSq = dx * dx + dy * dy;

          if (distSq < LINK_DISTANCE * LINK_DISTANCE) {
            const dist = Math.sqrt(distSq);
            const linkAlpha = (1 - dist / LINK_DISTANCE) * (isDark ? 0.28 : 0.18);
            ctx!.strokeStyle =
              p1.isAccentRed && p2.isAccentRed
                ? isDark
                  ? `rgba(239, 68, 68, ${linkAlpha})`
                  : `rgba(220, 38, 38, ${linkAlpha})`
                : isDark
                ? `rgba(56, 189, 248, ${linkAlpha})`
                : `rgba(37, 99, 235, ${linkAlpha})`;

            ctx!.beginPath();
            ctx!.moveTo(p1.x, p1.y);
            ctx!.lineTo(p2.x, p2.y);
            ctx!.stroke();
          }
        }
      }

      // 4. Draw Glowing Particles & Halos
      for (let i = 0; i < particles.length; i += 1) {
        const p = particles[i];
        const breath = 0.82 + 0.18 * Math.sin(p.pulsePhase);
        const alpha = Math.min(0.92, p.baseAlpha * breath * (isDark ? 1.05 : 0.9));

        // Outer soft glow aura
        if (p.radius > 2.2) {
          ctx!.save();
          ctx!.globalAlpha = alpha * (isDark ? 0.28 : 0.16);
          ctx!.fillStyle = p.colorHex;
          ctx!.beginPath();
          ctx!.arc(p.x, p.y, p.radius * 2.6, 0, Math.PI * 2);
          ctx!.fill();
          ctx!.restore();
        }

        // Core sharp particle
        ctx!.globalAlpha = alpha;
        ctx!.fillStyle = p.colorHex;
        ctx!.beginPath();
        ctx!.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx!.fill();
      }

      ctx!.globalAlpha = 1;

      if (!reducedMotion && isRunning) {
        rafId = window.requestAnimationFrame(drawFrame);
      }
    };

    const handlePointerMove = (e: MouseEvent | PointerEvent) => {
      pointer.x = e.clientX;
      pointer.y = e.clientY;
      pointer.active = true;
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches && e.touches.length > 0) {
        pointer.x = e.touches[0].clientX;
        pointer.y = e.touches[0].clientY;
        pointer.active = true;
      }
    };

    const handlePointerDown = (e: MouseEvent | PointerEvent) => {
      ripples.push({
        x: e.clientX,
        y: e.clientY,
        r: 10,
        maxR: 180,
        alpha: 0.9,
      });

      // Scatter nearby particles outward on click
      for (const p of particles) {
        const dx = p.x - e.clientX;
        const dy = p.y - e.clientY;
        const distSq = dx * dx + dy * dy;
        if (distSq < 220 * 220 && distSq > 0.1) {
          const dist = Math.sqrt(distSq);
          const force = (1 - dist / 220) * 8.5;
          p.rvx += (dx / dist) * force;
          p.rvy += (dy / dist) * force;
        }
      }
    };

    const clearPointer = () => {
      pointer.active = false;
      pointer.x = -9999;
      pointer.y = -9999;
    };

    const handleVisibility = () => {
      if (document.hidden) {
        isRunning = false;
        if (rafId !== null) {
          window.cancelAnimationFrame(rafId);
          rafId = null;
        }
      } else if (!isRunning) {
        isRunning = true;
        if (!reducedMotion) {
          rafId = window.requestAnimationFrame(drawFrame);
        }
      }
    };

    window.addEventListener('resize', syncCanvasMetrics, { passive: true });
    window.addEventListener('pointermove', handlePointerMove, { passive: true });
    window.addEventListener('pointerdown', handlePointerDown, { passive: true });
    window.addEventListener('touchmove', handleTouchMove, { passive: true });
    window.addEventListener('pointerleave', clearPointer, { passive: true });
    window.addEventListener('blur', clearPointer);
    document.addEventListener('visibilitychange', handleVisibility);

    drawFrame();

    return () => {
      isRunning = false;
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId);
      }
      window.removeEventListener('resize', syncCanvasMetrics);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('pointerleave', clearPointer);
      window.removeEventListener('blur', clearPointer);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);

  // Re-sync immediately on theme change
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || typeof window === 'undefined') return;
    if (
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      window.dispatchEvent(new Event('resize'));
    }
  }, [mode]);

  return (
    <>
      <div
        className="erp-antigravity-bg"
        data-testid="antigravity-particles-bg"
        data-theme-mode={mode}
        aria-hidden="true"
      >
        <canvas ref={canvasRef} className="erp-antigravity-canvas" />
      </div>
      <div
        className="erp-antigravity-shield"
        data-testid="antigravity-readability-shield"
        aria-hidden="true"
      />
    </>
  );
};

export default AntigravityParticlesBackground;
