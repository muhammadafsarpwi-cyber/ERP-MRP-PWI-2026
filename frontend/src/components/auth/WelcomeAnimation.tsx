import React, { useEffect, useRef, useState } from 'react';

interface Props {
  reducedMotion: boolean;
  onAnimationComplete: () => void;
}

/** A single brush stroke: reveals the phrase from `from` to `to` (0..1 of its width). */
interface Stroke {
  from: number;
  to: number;
  duration: number;
}

interface Line {
  text: string;
  cls: string;
  tag: 'h1' | 'h2' | 'span';
  strokes: Stroke[];
}

/**
 * Sequential handwriting script:
 *   Stage 1 — "P"     Stage 2 — "PW"     Stage 3 — "PWI"
 *   Stage 4 — "Pakistan Wire Industries" then "(Pvt.) LTD" — the exact
 *   corporate title, revealed at natural word boundaries.
 * Strokes are real sub-phrases, so the pen pauses at natural letter/word breaks.
 */
const LINES: Line[] = [
  {
    text: 'PWI',
    cls: 'pwi-line--primary',
    tag: 'h1',
    strokes: [
      { from: 0.0, to: 0.34, duration: 620 }, // P
      { from: 0.34, to: 0.72, duration: 560 }, // PW
      { from: 0.72, to: 1.0, duration: 460 }, // PWI
    ],
  },
  {
    text: 'Pakistan Wire Industries',
    cls: 'pwi-line--company',
    tag: 'h2',
    strokes: [
      { from: 0.0, to: 0.375, duration: 620 }, // "Pakistan "
      { from: 0.375, to: 0.583, duration: 640 }, // "Wire "
      { from: 0.583, to: 1.0, duration: 560 }, // "Industries"
    ],
  },
  {
    text: '(Pvt.) LTD',
    cls: 'pwi-line--sub',
    tag: 'span',
    strokes: [
      { from: 0.0, to: 0.64, duration: 520 }, // "(Pvt.) "
      { from: 0.64, to: 1.0, duration: 420 }, // "LTD"
    ],
  },
];

interface Seg extends Stroke {
  line: number;
}

const SEGMENTS: Seg[] = LINES.reduce<Seg[]>((acc, l, li) => {
  l.strokes.forEach((s) => acc.push({ line: li, ...s }));
  return acc;
}, []);

const STROKE_PAUSE = 120; // micro lift between strokes of one phrase
const LINE_PAUSE = 380; // pen lift between phrases
const START_LEAD_MS = 220; // pen settles before the first stroke
const MS_END = 400; // time before subtitle settles
const START_FALLBACK_MS = 300;

/** Smoothstep so the brush accelerates into and eases out of every stroke. */
const ease = (t: number) => t * t * (3 - 2 * t);

const WelcomeAnimation: React.FC<Props> = ({ reducedMotion, onAnimationComplete }) => {
  const rootRef = useRef<HTMLDivElement>(null);
  const lineRefs = useRef<(HTMLElement | null)[]>([]);
  const [progress, setProgress] = useState<{ line: number; t: number }>({ line: -1, t: 0 });
  const [pen, setPen] = useState<{ x: number; y: number; visible: boolean }>({ x: 0, y: 0, visible: false });
  const [stage, setStage] = useState<'writing' | 'subtitle' | 'button'>('writing');

  // Fraction of each phrase currently revealed (1 = fully revealed, 0 = hidden).
  const drawFor = (i: number) => {
    if (i < progress.line || (i === progress.line && progress.t >= 1)) return 1;
    if (i === progress.line) return progress.t;
    return 0;
  };

  // Put the brush/pen tip exactly on the leading edge of the reveal mask.
  const positionPen = (li: number, frac: number) => {
    const el = lineRefs.current[li];
    const wrap = rootRef.current;
    if (!el || !wrap) return;
    const r = el.getBoundingClientRect();
    const w = wrap.getBoundingClientRect();
    setPen({
      x: r.left - w.left + r.width * frac,
      y: r.top - w.top + r.height * 0.62,
      visible: true,
    });
  };

  useEffect(() => {
    if (reducedMotion || process.env.NODE_ENV === 'test') {
      setProgress({ line: LINES.length, t: 1 });
      setStage('button');
      onAnimationComplete();
      return;
    }

    let idx = 0;
    let start = 0;
    let raf = 0;
    let started = false;

    const go = () => {
      if (!started) {
        started = true;
        start = 0;
      }
    };

    const step = (ts: number) => {
      if (!started) {
        raf = requestAnimationFrame(step);
        return;
      }
      if (start === 0) start = ts;
      const elapsed = ts - start;
      if (idx >= SEGMENTS.length) {
        cancelAnimationFrame(raf);
        setPen((p) => ({ ...p, visible: false }));
        setStage('subtitle');
        window.setTimeout(() => setStage('button'), MS_END);
        onAnimationComplete();
        return;
      }
      if (elapsed < START_LEAD_MS) {
        raf = requestAnimationFrame(step);
        return;
      }
      const seg = SEGMENTS[idx];
      const raw = Math.min(1, (elapsed - START_LEAD_MS) / seg.duration);
      const t = seg.from + (seg.to - seg.from) * ease(raw);
      setProgress({ line: seg.line, t });
      positionPen(seg.line, t);

      const next = SEGMENTS[idx + 1];
      const pause = next && next.line === seg.line ? STROKE_PAUSE : LINE_PAUSE;
      if (elapsed - START_LEAD_MS >= seg.duration + pause) {
        idx++;
        start = ts;
        if (idx < SEGMENTS.length) {
          const n = SEGMENTS[idx];
          if (n.line !== seg.line) setPen((p) => ({ ...p, visible: false }));
          setProgress({ line: n.line, t: n.from });
        }
      }
      raf = requestAnimationFrame(step);
    };

    try {
      if (document.fonts && typeof document.fonts.ready?.then === 'function') {
        document.fonts.ready.then(go).catch(go);
      }
    } catch {
      /* ignore */
    }
    const fallback = window.setTimeout(go, START_FALLBACK_MS);

    raf = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(fallback);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reducedMotion]);

  // Hard reveal (clip-path) + soft brush edge (mask feather) in sync.
  const revealStyle = (d: number): React.CSSProperties => {
    const pct = d * 100;
    const feather = d >= 1 ? 0 : 3;
    const mask = `linear-gradient(90deg, #000 ${Math.max(0, pct - feather).toFixed(2)}%, transparent ${pct.toFixed(2)}%)`;
    return {
      clipPath: `inset(0 ${(100 - pct).toFixed(2)}% 0 0)`,
      maskImage: mask,
      WebkitMaskImage: mask,
      maskRepeat: 'no-repeat',
      WebkitMaskRepeat: 'no-repeat',
    };
  };

  return (
    <div className="erp-welcome-write" ref={rootRef}>
      <div className="pwi-phrases">
        {LINES.map((l, i) => {
          const style = revealStyle(drawFor(i));
          const refCb = (el: HTMLElement | null) => {
            lineRefs.current[i] = el;
          };

          return (
            <div className="pwi-phrase" key={l.text}>
              {l.tag === 'h1' ? (
                <h1 ref={refCb} className={`pwi-line ${l.cls}`} style={style}>
                  {l.text}
                </h1>
              ) : l.tag === 'h2' ? (
                <h2 ref={refCb} className={`pwi-line ${l.cls}`} style={style}>
                  {l.text}
                </h2>
              ) : (
                <span ref={refCb} className={`pwi-line ${l.cls}`} style={style}>
                  {l.text}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {pen.visible && (
        <span className="erp-write-pen" style={{ left: pen.x, top: pen.y }}>
          <span className="erp-write-pen-glow" />
        </span>
      )}

      {stage === 'subtitle' || stage === 'button' ? (
        <p className={`erp-write-sub${stage === 'button' ? ' is-visible' : ''}`}>
          Enterprise Manufacturing &amp; ERP System
        </p>
      ) : null}
    </div>
  );
};

export default WelcomeAnimation;
