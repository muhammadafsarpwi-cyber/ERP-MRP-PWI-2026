import React, { useEffect, useMemo, useRef, useState } from 'react';
import { tabSessionCache, TAB_REFRESH_EVENT } from '../../services/tabSessionCache';

export interface TabKeepAliveProps {
  /**
   * Canonical workspace-tab id, e.g. '/production/orders'.
   * Must be stable across mounts — the same value every time this tab is
   * rendered — so the session cache key never collides or drifts.
   */
  tabId: string;
  /**
   * The page's data loader. Called once on mount when no cached payload
   * exists. Receives the currently cached payload (if any) so loaders can
   * merge partial state (e.g. filter metadata) instead of discarding it.
   *
   * IMPORTANT: pass a `useCallback`-stabilised function. The wrapper keeps a
   * ref to the latest callback so it never re-runs the mount loader just
   * because the callback identity changed between renders.
   */
  load: (cached: any) => Promise<void> | void;
  /**
   * Optional data accessor used to snapshot this tab's serialisable state into
   * the session cache. When provided, the wrapper calls it after every render
   * so a future re-activation can restore filters / pagination / sort.
   * Return `undefined` to skip snapshotting for this render.
   */
  serialize?: () => any;
  /**
   * Optional predicate: when true the wrapper forces a fresh reload even if a
   * cached payload exists. Used by the global Refresh button.
   */
  forceReload?: boolean;
  /** Page content. */
  children: React.ReactNode;
}

/**
 * TabKeepAlive — the keep-alive mechanism extracted from the working
 * Production Inventory Report tab.
 *
 * What it does (mirrors ProductionInventoryReport exactly):
 *   1. On mount, read any cached payload for `tabId` from `tabSessionCache`.
 *   2. Initialise component state from that payload so switching back to the
 *      tab shows the previously loaded data instantly (no "Loading Records…").
 *   3. Only invoke `load()` when there is NO cache entry — i.e. the tab has
 *      never been loaded in this session. This is the single most important
 *      behaviour: returning to an already-open tab does NOT re-fetch.
 *   4. Listen for the global `TAB_REFRESH_EVENT` (fired by the header Refresh
 *      button) and clear + reload this tab when it targets us.
 *   5. When the workspace tab is closed, `workspaceTabStore.closeTab` already
 *      evicts the cache entry, so a re-open starts fresh.
 *
 * It does NOT touch the page's business logic. The page keeps full control
 * over its own React state; it only needs to (a) seed initial state from the
 * cache, (b) write back to the cache when data changes, and (c) accept a
 * `load` callback. See the ProductionInventoryReport pattern for the canonical
 * usage.
 */
export const TabKeepAlive: React.FC<TabKeepAliveProps> = ({
  tabId,
  load,
  serialize,
  forceReload = false,
  children,
}) => {
  const cached = useMemo(() => tabSessionCache.get<any>(tabId), [tabId]);
  const [ready, setReady] = useState(!cached && !forceReload);
  const loadedOnceRef = useRef(false);
  const lastSerializeRef = useRef<string | undefined>(undefined);

  // Always keep a ref to the latest loader so the mount effect never needs
  // `load` as a dependency (avoids re-running the fetch on every render).
  const loadRef = useRef(load);
  loadRef.current = load;

  useEffect(() => {
    if (forceReload) {
      tabSessionCache.remove(tabId);
    }
    if (tabSessionCache.has(tabId) && !forceReload) {
      // Data already present — nothing to load. The page component seeds its
      // own state from the cache, so we simply mark ready.
      loadedOnceRef.current = true;
      setReady(true);
      return;
    }

    let cancelled = false;
    const run = async () => {
      try {
        await loadRef.current(tabSessionCache.get<any>(tabId));
      } finally {
        if (!cancelled) {
          loadedOnceRef.current = true;
          setReady(true);
        }
      }
    };
    void run();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabId, forceReload]);

  // Global refresh event (header Refresh button / cross-tab refresh).
  useEffect(() => {
    const handleGlobalRefresh = (e: Event) => {
      const detail = (e as CustomEvent)?.detail;
      if (!detail?.tabId || String(detail.tabId).startsWith(tabId)) {
        tabSessionCache.remove(tabId);
        loadedOnceRef.current = false;
        setReady(false);
        // Re-trigger the mount loader by re-running it.
        void loadRef.current(undefined);
        setReady(true);
        loadedOnceRef.current = true;
      }
    };
    window.addEventListener(TAB_REFRESH_EVENT, handleGlobalRefresh);
    return () => window.removeEventListener(TAB_REFRESH_EVENT, handleGlobalRefresh);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabId]);

  // Snapshot serialisable state back into the cache on every render so a
  // future activation can restore filters / pagination / sort.
  useEffect(() => {
    if (!serialize || !loadedOnceRef.current) return;
    try {
      const snapshot = serialize();
      if (snapshot === undefined) return;
      const stable = JSON.stringify(snapshot);
      if (stable === lastSerializeRef.current) return;
      lastSerializeRef.current = stable;
      tabSessionCache.set(tabId, snapshot);
    } catch {
      // ignore serialization failures — cache is best-effort
    }
  });

  // Render a lightweight ready gate. The page component is responsible for
  // showing its own loading state; this wrapper only prevents stale renders
  // before the first load completes.
  return <>{children}</>;
};

export default TabKeepAlive;