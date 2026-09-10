import React, { useEffect, useRef, useState } from 'react';
import { useLoadingStore } from '../../store/loadingStore';

const SHOW_DELAY_MS = 120;
const MIN_DISPLAY_MS = 320;

/**
 * Global top loading bar. Renders a thin 3px animated gradient bar anchored to
 * the bottom edge of the sticky app header. It tracks the global loading store
 * counter and only becomes visible after a short debounce, holding its minimum
 * display time so extremely fast requests never cause a flicker.
 */
const GradientLoadingBar: React.FC = () => {
  const counter = useLoadingStore((s) => s.counter);
  const active = counter > 0;
  const [visible, setVisible] = useState(false);
  const showTimer = useRef<number | null>(null);
  const hideTimer = useRef<number | null>(null);

  useEffect(() => {
    if (active) {
      if (hideTimer.current) {
        window.clearTimeout(hideTimer.current);
        hideTimer.current = null;
      }
      if (!visible) {
        showTimer.current = window.setTimeout(() => setVisible(true), SHOW_DELAY_MS);
      }
    } else if (visible) {
      if (showTimer.current) {
        window.clearTimeout(showTimer.current);
        showTimer.current = null;
      }
      hideTimer.current = window.setTimeout(() => setVisible(false), MIN_DISPLAY_MS);
    }
  }, [active, visible]);

  useEffect(
    () => () => {
      if (showTimer.current) window.clearTimeout(showTimer.current);
      if (hideTimer.current) window.clearTimeout(hideTimer.current);
    },
    [],
  );

  return (
    <div className={`erp-gradient-loading-bar${visible ? ' is-visible' : ''}`} aria-hidden="true" />
  );
};

export default GradientLoadingBar;