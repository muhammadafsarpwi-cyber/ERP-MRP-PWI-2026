import React, { useEffect, useRef, useState } from 'react';
import { useLoadingStore } from '../../store/loadingStore';

const SHOW_DELAY_MS = 60;
const HOLD_COMPLETE_MS = 450;

type BarStatus = 'idle' | 'running' | 'completed';

/**
 * Global Top Green Runner Loading Bar.
 * Renders across the sticky app header throughout the entire ERP system.
 * While loading: vivid emerald-green beam sprints continuously across the screen.
 * Once completed: locks solidly at 100% full width, stops motion completely, then fades cleanly.
 */
const GradientLoadingBar: React.FC = () => {
  const counter = useLoadingStore((s) => s.counter);
  const active = counter > 0;
  const [status, setStatus] = useState<BarStatus>('idle');
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (active) {
      if (timerRef.current) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      timerRef.current = window.setTimeout(() => {
        setStatus('running');
      }, SHOW_DELAY_MS);
    } else {
      if (status === 'running') {
        // Transition from running -> completed (stops at 100% full green line) -> idle
        setStatus('completed');
        if (timerRef.current) {
          window.clearTimeout(timerRef.current);
          timerRef.current = null;
        }
        timerRef.current = window.setTimeout(() => {
          setStatus('idle');
        }, HOLD_COMPLETE_MS);
      } else if (status !== 'completed') {
        if (timerRef.current) {
          window.clearTimeout(timerRef.current);
          timerRef.current = null;
        }
        setStatus('idle');
      }
    }
  }, [active, status]);

  useEffect(
    () => () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    },
    [],
  );

  if (status === 'idle') return null;

  return (
    <div
      className={`erp-gradient-loading-bar erp-loading-bar--${status}`}
      aria-hidden="true"
    >
      <div className={`erp-loading-runner erp-loading-runner--${status}`} />
    </div>
  );
};

export default GradientLoadingBar;