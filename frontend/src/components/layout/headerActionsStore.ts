import { create } from 'zustand';
import type { ReactNode } from 'react';
import { useWorkspaceTabStore } from '../../store/workspaceTabStore';

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

  setHeaderActions: (actions, tabId) => {
    const activeTab = tabId || getActiveTabId();
    const currentActive = getActiveTabId();
    const nextMap = { ...get().tabActionsMap, [activeTab]: actions };
    set({
      tabActionsMap: nextMap,
      actions: activeTab === currentActive ? actions : get().actions,
    });
  },

  clearHeaderActions: (tabId) => {
    const activeTab = tabId || getActiveTabId();
    const currentActive = getActiveTabId();
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
    const nextMeta = { title, subtitle, icon, extra };
    const nextMetaMap = { ...get().tabMetaMap, [activeTab]: nextMeta };
    set({
      tabMetaMap: nextMetaMap,
      title: activeTab === currentActive ? title : get().title,
      subtitle: activeTab === currentActive ? subtitle : get().subtitle,
      icon: activeTab === currentActive ? icon : get().icon,
      extra: activeTab === currentActive ? extra : get().extra,
    });
  },

  clearHeaderTitle: (tabId) => {
    const activeTab = tabId || getActiveTabId();
    const currentActive = getActiveTabId();
    const currentMeta = get().tabMetaMap[activeTab];
    if (currentMeta) {
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
      set({ title: undefined, icon: undefined });
    }
  },

  clearHeaderMeta: (tabId) => {
    const activeTab = tabId || getActiveTabId();
    const currentActive = getActiveTabId();
    const nextMetaMap = { ...get().tabMetaMap };
    delete nextMetaMap[activeTab];
    set({
      tabMetaMap: nextMetaMap,
      title: activeTab === currentActive ? undefined : get().title,
      subtitle: activeTab === currentActive ? undefined : get().subtitle,
      icon: activeTab === currentActive ? undefined : get().icon,
      extra: activeTab === currentActive ? undefined : get().extra,
    });
  },

  syncHeaderForActiveTab: (tabId) => {
    const { tabActionsMap, tabMetaMap } = get();
    const actions = tabActionsMap[tabId] || [];
    const meta = tabMetaMap[tabId];
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
