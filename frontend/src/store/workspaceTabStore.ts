import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { tabSessionCache } from '../services/tabSessionCache';

export interface WorkspaceTab {
  id: string; // Canonical key, e.g. "/production/targets"
  route: string; // Full route path with search params, e.g. "/production/targets"
  pathname: string;
  title: string;
  closable: boolean;
  timestamp: number;
}

export const DASHBOARD_TAB: WorkspaceTab = {
  id: '/dashboard',
  route: '/dashboard',
  pathname: '/dashboard',
  title: 'Dashboard',
  closable: false,
  timestamp: 0,
};

interface WorkspaceTabState {
  tabs: WorkspaceTab[];
  activeTabId: string;
  
  /** Open a tab. If tab already exists, activate it without duplicating. */
  openTab: (tabData: {
    id: string;
    route: string;
    pathname: string;
    title: string;
    closable?: boolean;
  }) => WorkspaceTab;

  /** Activate a tab by its ID */
  activateTab: (id: string) => WorkspaceTab | undefined;

  /** Close a single tab by ID. Returns next route to navigate to if closed tab was active. */
  closeTab: (id: string) => { nextRoute?: string } | undefined;

  /** Close all tabs except the given ID and Dashboard */
  closeOtherTabs: (id: string) => { nextRoute?: string };

  /** Close all tabs to the left of the given ID (Dashboard is never closed) */
  closeLeftTabs: (id: string) => { nextRoute?: string };

  /** Close all tabs to the right of the given ID (Dashboard is never closed) */
  closeRightTabs: (id: string) => { nextRoute?: string };

  /** Close all tabs except Dashboard */
  closeAllTabs: () => { nextRoute: string };

  /** Reorder tabs (for drag-and-drop or manual ordering) */
  reorderTabs: (sourceIndex: number, destinationIndex: number) => void;

  /** Reset workspace to initial default */
  resetWorkspace: () => void;
}

export const useWorkspaceTabStore = create<WorkspaceTabState>()(
  persist(
    (set, get) => ({
      tabs: [{ ...DASHBOARD_TAB }],
      activeTabId: '/dashboard',

      openTab: (tabData) => {
        const { tabs } = get();
        const canonicalId = tabData.id;
        const existingIndex = tabs.findIndex((t) => t.id === canonicalId);

        if (existingIndex !== -1) {
          // Tab already exists! NEVER create duplicate. Update route in case search params changed.
          const existing = tabs[existingIndex];
          const updatedTab: WorkspaceTab = {
            ...existing,
            route: tabData.route,
            title: tabData.title || existing.title,
            timestamp: Date.now(),
          };

          const nextTabs = [...tabs];
          nextTabs[existingIndex] = updatedTab;

          set({
            tabs: nextTabs,
            activeTabId: canonicalId,
          });
          return updatedTab;
        }

        // New tab
        const newTab: WorkspaceTab = {
          id: canonicalId,
          route: tabData.route,
          pathname: tabData.pathname,
          title: tabData.title || 'Page',
          closable: canonicalId !== '/dashboard' ? (tabData.closable ?? true) : false,
          timestamp: Date.now(),
        };

        set({
          tabs: [...tabs, newTab],
          activeTabId: canonicalId,
        });
        return newTab;
      },

      activateTab: (id) => {
        const { tabs } = get();
        const target = tabs.find((t) => t.id === id);
        if (target) {
          set({ activeTabId: id });
        }
        return target;
      },

      closeTab: (id) => {
        const { tabs, activeTabId } = get();
        const targetIndex = tabs.findIndex((t) => t.id === id);
        if (targetIndex === -1) return undefined;

        const target = tabs[targetIndex];
        // Dashboard cannot be closed
        if (!target.closable || id === '/dashboard') return undefined;

        // Evict session cache for closed tab so future opening starts fresh
        tabSessionCache.remove(id);

        const nextTabs = tabs.filter((t) => t.id !== id);
        let nextRoute: string | undefined;

        if (activeTabId === id) {
          // Determine sensible neighboring tab to activate:
          // Prefer previous tab, else next tab, fallback to Dashboard
          const nextActiveIndex = targetIndex > 0 ? targetIndex - 1 : 0;
          const nextActiveTab = nextTabs[nextActiveIndex] || nextTabs[0] || DASHBOARD_TAB;
          set({
            tabs: nextTabs,
            activeTabId: nextActiveTab.id,
          });
          nextRoute = nextActiveTab.route;
        } else {
          set({ tabs: nextTabs });
        }

        return { nextRoute };
      },

      closeOtherTabs: (id) => {
        const { tabs } = get();
        const target = tabs.find((t) => t.id === id);
        if (!target) return {};

        // Evict closed tabs from cache
        tabs.forEach((t) => {
          if (t.id !== '/dashboard' && t.id !== id) {
            tabSessionCache.remove(t.id);
          }
        });

        // Retain Dashboard and the target tab
        const nextTabs = tabs.filter(
          (t) => t.id === '/dashboard' || t.id === id
        );

        set({
          tabs: nextTabs,
          activeTabId: id,
        });

        return { nextRoute: target.route };
      },

      closeLeftTabs: (id) => {
        const { tabs, activeTabId } = get();
        const targetIndex = tabs.findIndex((t) => t.id === id);
        if (targetIndex <= 0) return {};

        // Evict closed tabs to the left
        tabs.forEach((t, idx) => {
          if (t.id !== '/dashboard' && idx < targetIndex) {
            tabSessionCache.remove(t.id);
          }
        });

        // Keep Dashboard and tabs at or to the right of id
        const nextTabs = tabs.filter(
          (t, index) => t.id === '/dashboard' || index >= targetIndex
        );

        let nextRoute: string | undefined;
        const stillHasActive = nextTabs.some((t) => t.id === activeTabId);
        if (!stillHasActive) {
          const target = tabs[targetIndex];
          set({ tabs: nextTabs, activeTabId: id });
          nextRoute = target.route;
        } else {
          set({ tabs: nextTabs });
        }

        return { nextRoute };
      },

      closeRightTabs: (id) => {
        const { tabs, activeTabId } = get();
        const targetIndex = tabs.findIndex((t) => t.id === id);
        if (targetIndex === -1 || targetIndex >= tabs.length - 1) return {};

        // Evict closed tabs to the right
        tabs.forEach((t, idx) => {
          if (t.id !== '/dashboard' && idx > targetIndex) {
            tabSessionCache.remove(t.id);
          }
        });

        // Keep tabs at or to the left of id
        const nextTabs = tabs.filter(
          (t, index) => index <= targetIndex
        );

        let nextRoute: string | undefined;
        const stillHasActive = nextTabs.some((t) => t.id === activeTabId);
        if (!stillHasActive) {
          const target = tabs[targetIndex];
          set({ tabs: nextTabs, activeTabId: id });
          nextRoute = target.route;
        } else {
          set({ tabs: nextTabs });
        }

        return { nextRoute };
      },

      closeAllTabs: () => {
        const { tabs } = get();
        tabs.forEach((t) => {
          if (t.id !== '/dashboard') {
            tabSessionCache.remove(t.id);
          }
        });
        set({
          tabs: [{ ...DASHBOARD_TAB }],
          activeTabId: '/dashboard',
        });
        return { nextRoute: '/dashboard' };
      },

      reorderTabs: (sourceIndex, destinationIndex) => {
        const { tabs } = get();
        if (
          sourceIndex < 0 ||
          sourceIndex >= tabs.length ||
          destinationIndex < 0 ||
          destinationIndex >= tabs.length
        ) {
          return;
        }
        const nextTabs = [...tabs];
        const [moved] = nextTabs.splice(sourceIndex, 1);
        nextTabs.splice(destinationIndex, 0, moved);
        set({ tabs: nextTabs });
      },

      resetWorkspace: () => {
        tabSessionCache.clear();
        set({
          tabs: [{ ...DASHBOARD_TAB }],
          activeTabId: '/dashboard',
        });
      },
    }),
    {
      name: 'pwi_erp_workspace_tabs_v1',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        tabs: state.tabs.length > 0 ? state.tabs : [{ ...DASHBOARD_TAB }],
        activeTabId: state.activeTabId || '/dashboard',
      }),
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        // Defensive validation: ensure Dashboard is always present, valid, and unclosable
        if (!Array.isArray(state.tabs) || state.tabs.length === 0) {
          state.tabs = [{ ...DASHBOARD_TAB }];
          state.activeTabId = '/dashboard';
        } else {
          // Filter out any null or malformed tabs
          state.tabs = state.tabs.filter(
            (t) => t && typeof t.id === 'string' && typeof t.route === 'string'
          );
          const hasDashboard = state.tabs.some((t) => t.id === '/dashboard');
          if (!hasDashboard) {
            state.tabs.unshift({ ...DASHBOARD_TAB });
          } else {
            const d = state.tabs.find((t) => t.id === '/dashboard');
            if (d) d.closable = false;
          }
          if (!state.tabs.some((t) => t.id === state.activeTabId)) {
            state.activeTabId = state.tabs[0]?.id || '/dashboard';
          }
        }
      },
    }
  )
);
