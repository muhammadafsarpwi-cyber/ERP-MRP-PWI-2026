import { useEffect, useState } from 'react';

/**
 * Breakpoints of the settings shell.
 *
 * `lg` (992px) is the same cut-off `MainLayout` uses for its desktop sidebar,
 * so the settings navigation collapses at exactly the moment the main ERP
 * sidebar does and the two never fight for horizontal space.
 *
 * Implemented on top of `window.matchMedia` instead of `Grid.useBreakpoint()`
 * so the state is deterministic and directly testable in jsdom (antd's
 * responsive observer only settles after its listeners fire).
 */
export const SETTINGS_DESKTOP_QUERY = '(min-width: 992px)';
export const SETTINGS_TABLET_QUERY = '(min-width: 768px) and (max-width: 991.98px)';

export interface SettingsBreakpoint {
  /** < 768px — navigation collapses into a toggleable menu. */
  isMobile: boolean;
  /** 768–991px — sidebar present but descriptions hidden. */
  isTablet: boolean;
  /** >= 992px — full navigation with descriptions. */
  isDesktop: boolean;
}

function matches(query: string, fallback: boolean): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return fallback;
  return window.matchMedia(query).matches;
}

function read(): SettingsBreakpoint {
  const isDesktop = matches(SETTINGS_DESKTOP_QUERY, true);
  if (isDesktop) return { isMobile: false, isTablet: false, isDesktop: true };
  const isTablet = matches(SETTINGS_TABLET_QUERY, false);
  return { isMobile: !isTablet, isTablet, isDesktop: false };
}

export function useSettingsResponsive(): SettingsBreakpoint {
  const [bp, setBp] = useState<SettingsBreakpoint>(() => read());

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined;

    setBp(read());
    const desktopMq = window.matchMedia(SETTINGS_DESKTOP_QUERY);
    const tabletMq = window.matchMedia(SETTINGS_TABLET_QUERY);
    const onChange = () => setBp(read());

    if (typeof desktopMq.addEventListener === 'function') {
      desktopMq.addEventListener('change', onChange);
      tabletMq.addEventListener('change', onChange);
      return () => {
        desktopMq.removeEventListener('change', onChange);
        tabletMq.removeEventListener('change', onChange);
      };
    }
    /* istanbul ignore next — legacy Safari listener API */
    desktopMq.addListener(onChange);
    tabletMq.addListener(onChange);
    return () => {
      desktopMq.removeListener(onChange);
      tabletMq.removeListener(onChange);
    };
  }, []);

  return bp;
}
