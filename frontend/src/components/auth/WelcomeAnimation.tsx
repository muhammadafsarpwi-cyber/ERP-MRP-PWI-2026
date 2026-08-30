import React, { useEffect, useRef, useState } from 'react';

interface Props {
  reducedMotion: boolean;
  onAnimationComplete: () => void;
}

/**
 * PREMIUM HANDWRITTEN HEADLINE
 *
 * The previous hand-authored single-stroke SVG "font" produced thin, distorted,
 * hard-to-read letters, so this uses a real, elegant script/brush font
 * (Dancing Script). Every glyph is a genuine, readable letterform.
 *
 * Each phrase is revealed progressively left-to-right by a moving clip mask,
 * and the gold brush nib is placed on the SAME leading edge of that mask using
 * the live element geometry — so the tip stays glued to the newest ink
 * (essentially zero gap) and never travels independently, and there is no
 * separate timeline or decorative arrow.
 *
 * Sequence: PWI → PAKISTAN WIRE & INDUSTRY → PRIVATE LIMITED → subtitle → WELCOME.
 */

interface Line {
  text: string;
  cls: string;
  duration: number;
}

const LINES: Line[] = [
  { text: 'PWI', cls: 'pwi-line--primary', duration: 950 },
  { text: 'PAKISTAN WIRE & INDUSTRY', cls: 'pwi-line--company', duration: 1900 },
  { text: 'PRIVATE LIMITED', cls: 'pwi-line--company', duration: 1400 },
];
const LINE_PAUSE = 430; // hold after a phrase so the pen "lifts" before the next
const MS_END = 1000; // extra beat before the subtitle/enter stage settles
const START_FALLBACK_MS = 650; // max wait for the webfont before starting

const WelcomeAnimation: React.FC<Props> = ({ reducedMotion, onAnimationComplete }) => {
  const rootRef = useRef<HTMLDivElement>(null);
  const lineRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const [progress, setProgress] = useState<{ line: number; t: number }>({ line: -1, t: 0 });
  const [pen, setPen] = useState<{ x: number; y: number; visible: boolean }>({ x: 0, y: 0, visible: false });
  const [stage, setStage] = useState<'writing' | 'subtitle' | 'button'>('writing');

  // Fraction of each phrase currently revealed (1 = fully revealed, 0 = hidden).
  const drawFor = (i: number) => {
    if (i < progress.line || (i === progress.line && progress.t >= 1)) return 1;
    if (i === progress.line) return progress.t;
    return 0;
  };

  // Put the brush tip exactly on the leading (newest-ink) edge of the reveal mask.
  const positionPen = (li: number, frac: number) => {
    const el = lineRefs.current[li];
    const wrap = rootRef.current;
    if (!el || !wrap) return;
    const r = el.getBoundingClientRect();
    const w = wrap.getBoundingClientRect();
    setPen({
      x: r.left - w.left + r.width * frac,
      y: r.top - w.top + r.height * 0.58,
      visible: true,
    });
  };

  useEffect(() => {
    if (reducedMotion) {
      setProgress({ line: LINES.length, t: 1 });
      setStage('subtitle');
      const t = setTimeout(() => setStage('button'), 250);
      onAnimationComplete();
      return () => clearTimeout(t);
    }

    let current = -1;
    let start = 0;
    let raf = 0;
    let started = false;

    const go = () => {
      if (!started) { started = true; start = 0; }
    };

    const step = (ts: number) => {
      if (!started) { raf = requestAnimationFrame(step); return; }
      if (start === 0) start = ts;
      const elapsed = ts - start;
      if (current >= LINES.length) {
        cancelAnimationFrame(raf);
        setPen((p) => ({ ...p, visible: false }));
        setStage('subtitle');
        window.setTimeout(() => setStage('button'), MS_END);
        onAnimationComplete();
        return;
      }
      if (current < 0) {
        if (elapsed > 350) { current = 0; start = ts; }
        raf = requestAnimationFrame(step);
        return;
      }
      const dur = LINES[current].duration;
      const t = Math.min(1, elapsed / dur);
      setProgress({ line: current, t });
      positionPen(current, t);
      if (elapsed >= dur + LINE_PAUSE) {
        current++;
        start = ts;
        setProgress({ line: current, t: 0 });
      }
      raf = requestAnimationFrame(step);
    };

    try {
      if (document.fonts && typeof document.fonts.ready?.then === 'function') {
        document.fonts.ready.then(go).catch(go);
      }
    } catch { /* ignore */ }
    const fallback = window.setTimeout(go, START_FALLBACK_MS);

    raf = requestAnimationFrame(step);
    return () => { cancelAnimationFrame(raf); window.clearTimeout(fallback); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reducedMotion]);

  return (
    <div className="erp-welcome-write" ref={rootRef} aria-hidden="true">
      <div className="pwi-phrases">
        {LINES.map((l, i) => {
          const d = drawFor(i);
          return (
            <div className="pwi-phrase" key={l.text}>
              <span
                ref={(el) => { lineRefs.current[i] = el; }}
                className={`pwi-line ${l.cls}`}
                style={{ clipPath: `inset(0 ${(1 - d) * 100}% 0 0)` }}
              >
                {l.text}
              </span>
            </div>
          );
        })}
      </div>

      {pen.visible && (
        <span className="erp-write-pen" style={{ left: pen.x, top: pen.y }} />
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
