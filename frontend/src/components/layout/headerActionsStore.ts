import { create } from 'zustand';
import React, { type ReactNode } from 'react';
import { useWorkspaceTabStore } from '../../store/workspaceTabStore';

export function areReactNodesEqual(a: any, b: any, depth = 0): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  if (typeof a !== 'object' || typeof b !== 'object') return false;
  if (depth > 6) return true;

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((item, idx) => areReactNodesEqual(item, b[idx], depth + 1));
  }

  if (React.isValidElement(a) && React.isValidElement(b)) {
    if (a.type !== b.type || a.key !== b.key) return false;
    const aProps = (a as any).props || {};
    const bProps = (b as any).props || {};
    const aKeys = Object.keys(aProps);
    const bKeys = Object.keys(bProps);
    if (aKeys.length !== bKeys.length) return false;
    for (const key of aKeys) {
      if (typeof aProps[key] === 'function' && typeof bProps[key] === 'function') {
        continue;
      }
      if (!areReactNodesEqual(aProps[key], bProps[key], depth + 1)) {
        return false;
      }
    }
    return true;
  }

  // Plain object comparison (e.g. style={{ ... }})
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  for (const k of aKeys) {
    if (typeof a[k] === 'function' && typeof b[k] === 'function') continue;
    if (!areReactNodesEqual(a[k], b[k], depth + 1)) return false;
  }
  return true;
}

export interface HeaderAction {
  key: string;
  node: ReactNode;
}

interface TabHeaderMeta {
  title?: string | ReactNode;
  subtitle?: string;
  icon?: ReactNode;
  extra?: ReactNode;
}

interface HeaderActionsState {
  actions: HeaderAction[];
  title?: string | ReactNode;
  subtitle?: string;
  icon?: ReactNode;
  extra?: ReactNode;
  tabActionsMap: Record<string, HeaderAction[]>;
  tabMetaMap: Record<string, TabHeaderMeta>;
  /**
   * Ref-count of tabs whose action slot has been claimed by the page that owns
   * it (see `claimActionsSlot`). An anonymous (no tab id) registration targets
   * "whichever tab is active right now", which is only correct while the caller
   * itself is the active page — a keep-alive pane that re-registers from the
   * background would otherwise hijack the visible header of the tab on screen.
   */
  claimedActionsTabs: Record<string, number>;
  claimActionsSlot: (tabId: string) => void;
  releaseActionsSlot: (tabId: string) => void;
  setHeaderActions: (actions: HeaderAction[], tabId?: string) => void;
  clearHeaderActions: (tabId?: string) => void;
  setHeaderTitle: (title: string | ReactNode, icon?: ReactNode, tabId?: string) => void;
  setHeaderMeta: (title: string | ReactNode, subtitle?: string, icon?: ReactNode, extra?: ReactNode, tabId?: string) => void;
  clearHeaderTitle: (tabId?: string) => void;
  clearHeaderMeta: (tabId?: string) => void;
  syncHeaderForActiveTab: (tabId: string) => void;
  removeTabHeader: (tabId: string) => void;
}

const getActiveTabId = (): string => {
  try {
    return useWorkspaceTabStore.getState().activeTabId || 'default';
  } catch {
    return 'default';
  }
};

/**
 * Lightweight global-header action registry. Any page can register a small set
 * of action controls (buttons, links, selects) that render inside the shared
 * application header, instead of spawning a secondary per-page header/banner.
 * Actions and header metadata are scoped per workspace tab so switching between
 * background and active tabs does not overwrite or leak controls.
 */
export const useHeaderActions = create<HeaderActionsState>((set, get) => ({
  actions: [],
  tabActionsMap: {},
  tabMetaMap: {},
  claimedActionsTabs: {},

  claimActionsSlot: (tabId) => {
    const claimed = get().claimedActionsTabs;
    set({ claimedActionsTabs: { ...claimed, [tabId]: (claimed[tabId] || 0) + 1 } });
  },

  releaseActionsSlot: (tabId) => {
    const claimed = { ...get().claimedActionsTabs };
    if ((claimed[tabId] || 0) <= 1) delete claimed[tabId];
    else claimed[tabId] = claimed[tabId] - 1;
    set({ claimedActionsTabs: claimed });
  },

  setHeaderActions: (actions, tabId) => {
    const activeTab = tabId || getActiveTabId();
    // A registration without a tab id claims "the active tab". When the target
    // slot is owned by a page that registered explicitly, this write can only
    // come from a keep-alive pane running in the background — drop it instead
    // of overwriting the visible header of the tab that is on screen.
    if (!tabId && (get().claimedActionsTabs[activeTab] || 0) > 0) return;
    const currentActive = getActiveTabId();
    const currentActions = get().tabActionsMap[activeTab];
    if (currentActions && currentActions.length === actions.length) {
      const isSame = currentActions.every(
        (a, idx) => a.key === actions[idx]?.key && areReactNodesEqual(a.node, actions[idx]?.node)
      );
      if (isSame && (activeTab !== currentActive || get().actions === actions)) return;
    }
    const nextMap = { ...get().tabActionsMap, [activeTab]: actions };
    set({
      tabActionsMap: nextMap,
      actions: activeTab === currentActive ? actions : get().actions,
    });
  },

  clearHeaderActions: (tabId) => {
    const activeTab = tabId || getActiveTabId();
    // Same guard as setHeaderActions: a background pane's cleanup must not
    // wipe the actions of the tab that is currently on screen.
    if (!tabId && (get().claimedActionsTabs[activeTab] || 0) > 0) return;
    const currentActive = getActiveTabId();
    if (!get().tabActionsMap[activeTab] && (activeTab !== currentActive || get().actions.length === 0)) {
      return;
    }
    const nextMap = { ...get().tabActionsMap };
    delete nextMap[activeTab];
    set({
      tabActionsMap: nextMap,
      actions: activeTab === currentActive ? [] : get().actions,
    });
  },

  setHeaderTitle: (title, icon, tabId) => {
    const activeTab = tabId || getActiveTabId();
    const currentActive = getActiveTabId();
    const currentMeta = get().tabMetaMap[activeTab] || {};
    if (areReactNodesEqual(currentMeta.title, title) && areReactNodesEqual(currentMeta.icon, icon)) {
      return;
    }
    const nextMeta = { ...currentMeta, title, icon };
    const nextMetaMap = { ...get().tabMetaMap, [activeTab]: nextMeta };
    set({
      tabMetaMap: nextMetaMap,
      title: activeTab === currentActive ? title : get().title,
      icon: activeTab === currentActive ? icon : get().icon,
    });
  },

  setHeaderMeta: (title, subtitle, icon, extra, tabId) => {
    const activeTab = tabId || getActiveTabId();
    const currentActive = getActiveTabId();
    const isCurrentActive =
      activeTab === currentActive ||
      (typeof window !== 'undefined' && window.location.pathname === activeTab);

    const nextMeta = { title, subtitle, icon, extra };
    const nextMetaMap = { ...get().tabMetaMap, [activeTab]: nextMeta };
    if (activeTab === '/master-data/items') nextMetaMap['/master-data/products-items'] = nextMeta;
    if (activeTab === '/master-data/products-items') nextMetaMap['/master-data/items'] = nextMeta;

    set({
      tabMetaMap: nextMetaMap,
      title: isCurrentActive ? title : get().title,
      subtitle: isCurrentActive ? subtitle : get().subtitle,
      icon: isCurrentActive ? icon : get().icon,
      extra: isCurrentActive ? extra : get().extra,
    });
  },

  clearHeaderTitle: (tabId) => {
    const activeTab = tabId || getActiveTabId();
    const currentActive = getActiveTabId();
    const currentMeta = get().tabMetaMap[activeTab];
    if (currentMeta) {
      if (currentMeta.title === undefined && currentMeta.icon === undefined) return;
      const nextMetaMap = {
        ...get().tabMetaMap,
        [activeTab]: { ...currentMeta, title: undefined, icon: undefined },
      };
      set({
        tabMetaMap: nextMetaMap,
        title: activeTab === currentActive ? undefined : get().title,
        icon: activeTab === currentActive ? undefined : get().icon,
      });
    } else {
      if (get().title === undefined && get().icon === undefined) return;
      set({ title: undefined, icon: undefined });
    }
  },

  clearHeaderMeta: (tabId) => {
    if (!tabId) return;
    const nextMetaMap = { ...get().tabMetaMap };
    delete nextMetaMap[tabId];
    set({
      tabMetaMap: nextMetaMap,
    });
  },

  syncHeaderForActiveTab: (tabId) => {
    const { tabActionsMap, tabMetaMap } = get();
    const actions =
      tabActionsMap[tabId] ||
      (tabId === '/master-data/items' ? tabActionsMap['/master-data/products-items'] : undefined) ||
      (tabId === '/master-data/products-items' ? tabActionsMap['/master-data/items'] : undefined) ||
      [];
    const meta =
      tabMetaMap[tabId] ||
      (tabId === '/master-data/items' ? tabMetaMap['/master-data/products-items'] : undefined) ||
      (tabId === '/master-data/products-items' ? tabMetaMap['/master-data/items'] : undefined);
    set({
      actions,
      title: meta?.title,
      subtitle: meta?.subtitle,
      icon: meta?.icon,
      extra: meta?.extra,
    });
  },

  removeTabHeader: (tabId) => {
    const { tabActionsMap, tabMetaMap } = get();
    const nextActions = { ...tabActionsMap };
    const nextMeta = { ...tabMetaMap };
    delete nextActions[tabId];
    delete nextMeta[tabId];
    set({ tabActionsMap: nextActions, tabMetaMap: nextMeta });
  },
}));
