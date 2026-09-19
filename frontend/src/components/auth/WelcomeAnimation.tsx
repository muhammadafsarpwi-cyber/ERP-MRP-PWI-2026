import React, { useEffect, useRef, useState } from 'react';

interface Props {
  reducedMotion: boolean;
  onAnimationComplete: () => void;
}

interface Line {
  text: string;
  cls: string;
  duration: number;
  tag: 'h1' | 'h2' | 'span';
}

const LINES: Line[] = [
  { text: 'PWI', cls: 'pwi-line--primary', duration: 800, tag: 'h1' },
  { text: 'Pakistan Wire & Industry', cls: 'pwi-line--company', duration: 1500, tag: 'h2' },
  { text: '(Private) Limited', cls: 'pwi-line--sub', duration: 1000, tag: 'span' },
];

const LINE_PAUSE = 350; // brief lift after each phrase
const MS_END = 400; // time before subtitle settles
const START_FALLBACK_MS = 300;

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

    let current = -1;
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
      if (current >= LINES.length) {
        cancelAnimationFrame(raf);
        setPen((p) => ({ ...p, visible: false }));
        setStage('subtitle');
        window.setTimeout(() => setStage('button'), MS_END);
        onAnimationComplete();
        return;
      }
      if (current < 0) {
        if (elapsed > 200) {
          current = 0;
          start = ts;
        }
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

  return (
    <div className="erp-welcome-write" ref={rootRef}>
      <div className="pwi-phrases">
        {LINES.map((l, i) => {
          const d = drawFor(i);
          const style = { clipPath: `inset(0 ${(1 - d) * 100}% 0 0)` };

          if (l.tag === 'h1') {
            return (
              <div className="pwi-phrase" key={l.text}>
                <h1
                  ref={(el) => {
                    lineRefs.current[i] = el;
                  }}
                  className={`pwi-line ${l.cls}`}
                  style={style}
                >
                  {l.text}
                </h1>
              </div>
            );
          }

          if (l.tag === 'h2') {
            return (
              <div className="pwi-phrase" key={l.text}>
                <h2
                  ref={(el) => {
                    lineRefs.current[i] = el;
                  }}
                  className={`pwi-line ${l.cls}`}
                  style={style}
                >
                  {l.text}
                </h2>
              </div>
            );
          }

          return (
            <div className="pwi-phrase" key={l.text}>
              <span
                ref={(el) => {
                  lineRefs.current[i] = el;
                }}
                className={`pwi-line ${l.cls}`}
                style={style}
              >
                {l.text}
              </span>
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
