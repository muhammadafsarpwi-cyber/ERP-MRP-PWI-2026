import React, { useEffect, useMemo, useRef, useState } from 'react';
import { parseCompanyBrandParts } from '../../config/companyWelcomeConfig';
import { useCompanyWelcomeConfig } from '../../store/companyWelcomeStore';

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

function buildDynamicLines(companyName?: string | null): Line[] {
  const { monogram, headline, legalSuffix } = parseCompanyBrandParts(companyName);

  const list: Line[] = [
    {
      text: monogram,
      cls: 'pwi-line--primary',
      tag: 'h1',
      strokes: [
        { from: 0.0, to: 0.34, duration: 540 },
        { from: 0.34, to: 0.72, duration: 480 },
        { from: 0.72, to: 1.0, duration: 420 },
      ],
    },
    {
      text: headline,
      cls: 'pwi-line--company',
      tag: 'h2',
      strokes: [
        { from: 0.0, to: 0.38, duration: 560 },
        { from: 0.38, to: 0.65, duration: 560 },
        { from: 0.65, to: 1.0, duration: 500 },
      ],
    },
  ];

  if (legalSuffix) {
    list.push({
      text: legalSuffix,
      cls: 'pwi-line--sub',
      tag: 'span',
      strokes: [
        { from: 0.0, to: 0.64, duration: 460 },
        { from: 0.64, to: 1.0, duration: 380 },
      ],
    });
  }

  return list;
}

interface Seg extends Stroke {
  line: number;
}

const STROKE_PAUSE = 110;
const LINE_PAUSE = 320;
const START_LEAD_MS = 180;
const MS_END = 320;
const START_FALLBACK_MS = 260;

/** Smoothstep so the brush accelerates into and eases out of every stroke. */
const ease = (t: number) => t * t * (3 - 2 * t);

const WelcomeAnimation: React.FC<Props> = ({ reducedMotion, onAnimationComplete }) => {
  const { config, welcomePortal } = useCompanyWelcomeConfig();
  const lines = useMemo(() => buildDynamicLines(config.companyName), [config.companyName]);
  const segments = useMemo(
    () =>
      lines.reduce<Seg[]>((acc, l, li) => {
        l.strokes.forEach((s) => acc.push({ line: li, ...s }));
        return acc;
      }, []),
    [lines],
  );

  const rootRef = useRef<HTMLDivElement>(null);
  const lineRefs = useRef<(HTMLElement | null)[]>([]);
  const [progress, setProgress] = useState<{ line: number; t: number }>({ line: -1, t: 0 });
  const [pen, setPen] = useState<{ x: number; y: number; visible: boolean }>({
    x: 0,
    y: 0,
    visible: false,
  });
  const [stage, setStage] = useState<'writing' | 'subtitle' | 'button'>('writing');

  const drawFor = (i: number) => {
    if (i < progress.line || (i === progress.line && progress.t >= 1)) return 1;
    if (i === progress.line) return progress.t;
    return 0;
  };

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
      setProgress({ line: lines.length, t: 1 });
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
      if (idx >= segments.length) {
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
      const seg = segments[idx];
      const raw = Math.min(1, (elapsed - START_LEAD_MS) / seg.duration);
      const t = seg.from + (seg.to - seg.from) * ease(raw);
      setProgress({ line: seg.line, t });
      positionPen(seg.line, t);

      const next = segments[idx + 1];
      const pause = next && next.line === seg.line ? STROKE_PAUSE : LINE_PAUSE;
      if (elapsed - START_LEAD_MS >= seg.duration + pause) {
        idx++;
        start = ts;
        if (idx < segments.length) {
          const n = segments[idx];
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
  }, [reducedMotion, segments]);

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
        {lines.map((l, i) => {
          const style = revealStyle(drawFor(i));
          const refCb = (el: HTMLElement | null) => {
            lineRefs.current[i] = el;
          };

          return (
            <div className="pwi-phrase" key={`${l.tag}-${l.text}`}>
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
          {welcomePortal.portalTagline}
        </p>
      ) : null}
    </div>
  );
};

export default WelcomeAnimation;
