import React, { useState, useEffect, useMemo } from 'react';
import { Routes, useLocation } from 'react-router-dom';
import { useWorkspaceTabStore } from '../../store/workspaceTabStore';
import { useHeaderActions } from './headerActionsStore';
import './workspaceTabViewport.css';

interface WorkspaceTabViewportProps {
  children: React.ReactNode;
}

/**
 * Canonical tab id that MainLayout.openTab() will create for a given path.
 * Mirrors MainLayout's `tabId` computation (every /settings/* path collapses
 * onto the single '/settings' tab).
 */
function canonicalTabIdFor(pathname: string): string {
  return pathname.startsWith('/settings') ? '/settings' : pathname;
}

interface PaneDescriptor {
  id: string;
  /** Stable route this pane always renders — never the live global location. */
  route: string;
  /** true when the pane exists only because the tab store has not committed it yet. */
  isPending: boolean;
}

export const WorkspaceTabViewport: React.FC<WorkspaceTabViewportProps> = React.memo(({ children }) => {
  const tabs = useWorkspaceTabStore((state) => state.tabs);
  const activeTabId = useWorkspaceTabStore((state) => state.activeTabId);
  const location = useLocation();

  const currentPathname = location.pathname;

  // Track tabs that have been visited during this session.
  // On initial mount/refresh, ONLY the currently active route is visited.
  // Previous tabs in the strip remain lazy (unmounted) until clicked.
  // Once visited, a pane stays mounted until its tab is closed (keep-alive).
  const [visitedTabIds, setVisitedTabIds] = useState<Set<string>>(() => {
    const initial = new Set<string>();
    if (activeTabId) initial.add(activeTabId);
    if (currentPathname) initial.add(currentPathname);
    return initial;
  });

  // Extract nested <Route> elements if children is wrapped in <Routes>
  const routeElements = useMemo(() => {
    if (React.isValidElement(children) && (children.props as any)?.children) {
      return (children.props as any).children;
    }
    return children;
  }, [children]);

  // Mark current route / active tab as visited
  useEffect(() => {
    const target = activeTabId || currentPathname;
    if (target) {
      setVisitedTabIds((prev) => {
        if (prev.has(target)) return prev;
        const next = new Set(prev);
        next.add(target);
        return next;
      });
    }
  }, [activeTabId, currentPathname]);

  // Clean up visited tabs when a tab is closed and removed from store
  useEffect(() => {
    const openIds = new Set(tabs.map((t) => t.id));
    setVisitedTabIds((prev) => {
      let changed = false;
      const next = new Set<string>();
      prev.forEach((id) => {
        if (openIds.has(id) || id === currentPathname) {
          next.add(id);
        } else {
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [tabs, currentPathname]);

  // Sync header actions and notify widgets whenever active tab changes
  useEffect(() => {
    if (activeTabId) {
      useHeaderActions.getState().syncHeaderForActiveTab(activeTabId);
      requestAnimationFrame(() => {
        window.dispatchEvent(
          new CustomEvent('erp-tab-activated', { detail: { tabId: activeTabId } })
        );
      });
    }
  }, [activeTabId]);

  const canonicalTabId = canonicalTabIdFor(currentPathname);

  /**
   * ── Pane list ──────────────────────────────────────────────────────────
   * One pane per visited tab, each pinned to ITS OWN stable route.
   * A deep link the tab store has not committed yet is rendered by exactly ONE
   * pending pane keyed with the very id openTab() will create, so when the
   * store catches up React re-uses that subtree instead of mounting a second
   * copy of the page (previously: transient pane + real pane = 2 mounts).
   */
  const panes = useMemo<PaneDescriptor[]>(() => {
    const list: PaneDescriptor[] = [];

    tabs.forEach((tab) => {
      const isSettingsMatch = tab.id.startsWith('/settings') && currentPathname.startsWith('/settings');
      const isVisited =
        visitedTabIds.has(tab.id) ||
        tab.id === activeTabId ||
        tab.id === currentPathname ||
        isSettingsMatch;
      if (!isVisited) return; // Lazy: mount only on first visit, keep-alive afterwards
      list.push({ id: tab.id, route: tab.route || tab.pathname || tab.id, isPending: false });
    });

    if (!list.some((pane) => pane.id === canonicalTabId)) {
      list.push({
        id: canonicalTabId,
        route: `${currentPathname}${location.search}`,
        isPending: true,
      });
    }

    return list;
  }, [tabs, visitedTabIds, activeTabId, currentPathname, location.search, canonicalTabId]);

  /**
   * ── Activation ─────────────────────────────────────────────────────────
   * Exactly one pane is visible. `activeTabId` decides ONLY whether a pane is
   * shown; WHAT a pane renders is decided solely by that pane's own route, so
   * a pane can never display another tab's page (the "wrong page flash").
   * While the tab store still has no pane for the URL in the address bar, the
   * pending pane owns visibility (the window the old duplicate transient pane
   * used to cover).
   */
  const pendingPane = panes.find((pane) => pane.isPending);
  const activePaneId = pendingPane ? pendingPane.id : activeTabId;
  const liveRoute = `${location.pathname}${location.search}`;

  return (
    <div className="erp-tab-viewport-container">
      {panes.map((pane) => {
        const isActive = pane.id === activePaneId;
        const paneId = `erp-tab-pane-${pane.id.replace(/[^a-zA-Z0-9_-]/g, '_')}`;

        // Hand React Router the live location object only when this pane's own
        // route IS the address bar (identical path) — that keeps `location.state`
        // / `location.key` working for the visible page without ever letting a
        // pane render a path other than its own.
        const paneLocation = pane.route === liveRoute ? location : pane.route;

        return (
          <div
            key={pane.id}
            id={paneId}
            className={`erp-tab-pane ${isActive ? 'erp-tab-pane--active' : 'erp-tab-pane--offscreen'}`}
            aria-hidden={!isActive}
          >
            <Routes location={paneLocation}>
              {routeElements}
            </Routes>
          </div>
        );
      })}
    </div>
  );
});

export default WorkspaceTabViewport;
