import React, { useState, useEffect, useMemo } from 'react';
import { Routes, useLocation } from 'react-router-dom';
import { useWorkspaceTabStore } from '../../store/workspaceTabStore';
import { useHeaderActions } from './headerActionsStore';
import './workspaceTabViewport.css';

interface WorkspaceTabViewportProps {
  children: React.ReactNode;
}

export const WorkspaceTabViewport: React.FC<WorkspaceTabViewportProps> = ({ children }) => {
  const tabs = useWorkspaceTabStore((state) => state.tabs);
  const activeTabId = useWorkspaceTabStore((state) => state.activeTabId);
  const location = useLocation();

  const currentPathname = location.pathname;

  // Track tabs that have been visited during this session.
  // On initial mount/refresh, ONLY the currently active route is visited.
  // Previous tabs in the strip remain lazy (unmounted) until clicked.
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

  const isCurrentInTabs = useMemo(() => {
    return tabs.some((t) => t.id === currentPathname || t.pathname === currentPathname);
  }, [tabs, currentPathname]);

  return (
    <div className="erp-tab-viewport-container">
      {tabs.map((tab) => {
        // Lazy-loading: Do not mount DOM nodes for tabs until first visited
        if (!visitedTabIds.has(tab.id)) {
          return null;
        }

        const isActive = tab.id === activeTabId;
        const paneId = `erp-tab-pane-${tab.id.replace(/[^a-zA-Z0-9_-]/g, '_')}`;

        return (
          <div
            key={tab.id}
            id={paneId}
            className={`erp-tab-pane ${isActive ? 'erp-tab-pane--active' : 'erp-tab-pane--offscreen'}`}
            aria-hidden={!isActive}
          >
            <Routes location={tab.route}>
              {routeElements}
            </Routes>
          </div>
        );
      })}

      {/* Fallback for transient / direct routes before committing to tab store */}
      {!isCurrentInTabs && (
        <div
          key={`transient-${currentPathname}`}
          className="erp-tab-pane erp-tab-pane--active"
          aria-hidden={false}
        >
          <Routes location={location}>
            {routeElements}
          </Routes>
        </div>
      )}
    </div>
  );
};

export default WorkspaceTabViewport;
