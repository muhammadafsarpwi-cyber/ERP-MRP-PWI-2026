import React, { useEffect, useRef } from 'react';
import { createCableScene, type CableSceneHandle } from '../../utils/webglCableScene';
import { WELCOME_IMAGES } from '../../config/welcomeImages';
import './welcomeCableScene.css';

interface Props {
  /** Mirrors the welcome screen's `prefers-reduced-motion` probe. */
  reducedMotion?: boolean;
  /** Current slideshow index — the camera glides to the matching panel. */
  activeIndex?: number;
}

/**
 * Edge-to-edge WebGL layer for the welcome screen background: a light-premium
 * 3D cinematic gallery of 16 volumetric floating panels (one per division
 * track, same sources as the 2D slideshow), ambient machine motion, and
 * drifting golden particles.
 *
 * Contract with the page (see welcome.css / welcomeCableScene.css):
 *  - absolutely positioned at `inset: 0`, `z-index: 1` — the free band between
 *    the photo slideshow (z0) and the vignette overlay (z2), so the existing
 *    glass panel, particles, celebration canvas and fixed ribbon keep their
 *    stacking order untouched;
 *  - `pointer-events: none`, so the slideshow arrows / dots underneath (and the
 *    panel above) never lose clicks;
 *  - zero borders, zero margins, no in-flow footprint — the flex-centred panel
 *    layout is unaffected and `overflow: hidden` on `.erp-welcome-root` plus the
 *    global `overflow-x: clip` rules keep the page free of scrollbars.
 *
 * The renderer clears OPAQUE, so it visually replaces the 2D slideshow behind
 * it while that slideshow keeps running (it owns the shared 6 s cadence). If
 * WebGL is unavailable or `prefers-reduced-motion` is set, no canvas is
 * created at all and the 2D slideshow remains the visible background — an
 * automatic fallback with zero extra branches in the page.
 *
 * The canvas element is created inside the effect (not rendered by React) so
 * every mount gets a fresh WebGL context and StrictMode's double-mount tears
 * the previous one down completely.
 */
const WelcomeCableScene: React.FC<Props> = ({ reducedMotion = false, activeIndex = 0 }) => {
  const hostRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<CableSceneHandle | null>(null);

  useEffect(() => {
    // jsdom has no WebGL; the auth smoke tests render <Welcome /> directly, so
    // skip entirely rather than logging warnings during `npm test`.
    if (process.env.NODE_ENV === 'test') return undefined;
    // Reduced motion: keep the still 2D slideshow, no animated 3D gallery.
    if (reducedMotion) return undefined;
    const host = hostRef.current;
    if (!host || typeof document === 'undefined') return undefined;
    try {
      host.getBoundingClientRect();
    } catch {
      /* pre-paint or non-browser: keep the fallback */
    }

    const canvas = document.createElement('canvas');
    canvas.className = 'erp-welcome-webgl-canvas';
    host.appendChild(canvas);

    const scene: CableSceneHandle | null = createCableScene(canvas, {
      panelSources: WELCOME_IMAGES,
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

    // Don't burn GPU while the tab sits in the background (people leave the
    // welcome screen open on the reception monitor).
    const onVisibility = () => {
      if (document.hidden) scene.stop();
      else scene.start();
    };
    document.addEventListener('visibilitychange', onVisibility);

    scene.setActive(activeIndex);
    scene.start();

    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      if (observer) observer.disconnect();
      else window.removeEventListener('resize', applySize);
      scene.dispose();
      sceneRef.current = null;
      if (canvas.parentNode === host) host.removeChild(canvas);
    };
    // `activeIndex` is intentionally not a dependency: changing it only glides
    // the camera (handled below), it must never rebuild the WebGL context.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reducedMotion]);

  // Camera direction: follow the shared slideshow cadence + manual arrows/dots.
  useEffect(() => {
    sceneRef.current?.setActive(activeIndex);
  }, [activeIndex]);

  return <div className="erp-welcome-webgl" ref={hostRef} aria-hidden="true" />;
};

export default WelcomeCableScene;
