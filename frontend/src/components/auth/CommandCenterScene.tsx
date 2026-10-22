import React, { useEffect, useRef } from 'react';
import { useThemeStore } from '../../theme/themeStore';
import {
  createCommandCenterScene,
  type CommandCenterHandle,
} from '../../utils/webglCommandCenter';
import './commandCenterScene.css';

/**
 * Edge-to-edge WebGL layer behind the auth screens (Login / Forgot / Reset):
 * the "Enterprise Command Center" industrial hall — structural walls, seam
 * floor, side storage racks loaded with wire rod coils and wire treatment
 * modules — rendered against a theme-driven sky gradient.
 *
 * The scene is BOUND TO THE CENTRAL CSS THEME STATE: it reads `draft.mode`
 * from the theme store (the same state the ThemeToggle and the Appearance
 * preview drive) and cross-fades every material, light and the sky gradient
 * to the matching preset over 0.8 s — mirroring the CSS structural fade in
 * auth.css, so the 3D hall and the glassmorphic login card flip together.
 *
 * Contract with auth.css (see commandCenterScene.css):
 *  - position: fixed, inset: 0, z-index: 0 — edge-to-edge viewport coverage
 *    with zero borders and no in-flow footprint (no layer shifts);
 *  - pointer-events: none, so the header toggle, brand pane, login card and
 *    footer keep receiving input;
 *  - the container carries the themed CSS gradient as the automatic
 *    fallback: before the canvas paints, and when WebGL is unavailable, the
 *    page still shows the correct silver-slate (or carbon) backdrop.
 *
 * The canvas element is created inside the effect (not rendered by React) so
 * every mount gets a fresh WebGL context and StrictMode's double-mount tears
 * the previous one down completely.
 */
const CommandCenterScene: React.FC = () => {
  const hostRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<CommandCenterHandle | null>(null);
  const mode = useThemeStore((state) => state.draft.mode);

  useEffect(() => {
    // jsdom has no WebGL; the auth smoke tests render <Login /> directly, so
    // skip entirely rather than logging warnings during `npm test`.
    if (process.env.NODE_ENV === 'test') return undefined;
    const host = hostRef.current;
    if (!host || typeof document === 'undefined') return undefined;

    // The hall itself is the backdrop, so under prefers-reduced-motion we
    // still render it — but frozen: no camera sway, no capstans, no dust,
    // and theme swaps become instant instead of the 0.8 s fade.
    const reducedMotion =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const canvas = document.createElement('canvas');
    canvas.className = 'erp-command-canvas';
    host.appendChild(canvas);

    const scene = createCommandCenterScene(canvas, {
      mode: useThemeStore.getState().draft.mode,
      reducedMotion,
    });
    if (!scene) {
      host.removeChild(canvas);
      return undefined;
    }
    sceneRef.current = scene;

    const applySize = () => {
      const rect = host.getBoundingClientRect();
      scene.resize(rect.width || window.innerWidth || 1280, rect.height || window.innerHeight || 720);
    };
    applySize();

    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(() => applySize());
      observer.observe(host);
    } else {
      window.addEventListener('resize', applySize);
    }

    // Don't burn GPU while the tab sits in the background.
    const onVisibility = () => {
      if (document.hidden) scene.stop();
      else scene.start();
    };
    document.addEventListener('visibilitychange', onVisibility);

    scene.start();

    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      if (observer) observer.disconnect();
      else window.removeEventListener('resize', applySize);
      scene.dispose();
      sceneRef.current = null;
      if (canvas.parentNode === host) host.removeChild(canvas);
    };
  }, []);

  // Theme sync: follow the central CSS theme state live (ThemeToggle,
  // Appearance preview, persisted preference restore). The mount effect
  // creates the scene once — this only starts the 0.8 s cross-fade.
  useEffect(() => {
    sceneRef.current?.setTheme(mode);
  }, [mode]);

  return <div className="erp-command-scene" ref={hostRef} aria-hidden="true" />;
};

export default CommandCenterScene;
