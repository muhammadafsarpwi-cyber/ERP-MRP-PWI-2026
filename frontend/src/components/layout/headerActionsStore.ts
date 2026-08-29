import { create } from 'zustand';
import type { ReactNode } from 'react';

export interface HeaderAction {
  key: string;
  node: ReactNode;
}

interface HeaderActionsState {
  actions: HeaderAction[];
  title?: string;
  icon?: ReactNode;
  setHeaderActions: (actions: HeaderAction[]) => void;
  clearHeaderActions: () => void;
  setHeaderTitle: (title: string, icon?: ReactNode) => void;
  clearHeaderTitle: () => void;
}

/**
 * Lightweight global-header action registry. Any page can register a small set
 * of action controls (buttons, links, selects) that render inside the shared
 * application header, instead of spawning a secondary per-page header/banner.
 * A page may also override the header title/icon (e.g. a detail page showing
 * the current record's business number) by calling setHeaderTitle.
 * The page should set actions/title in a useEffect and clear them on unmount.
 */
export const useHeaderActions = create<HeaderActionsState>((set) => ({
  actions: [],
  setHeaderActions: (actions) => set({ actions }),
  clearHeaderActions: () => set({ actions: [] }),
  setHeaderTitle: (title, icon) => set({ title, icon }),
  clearHeaderTitle: () => set({ title: undefined, icon: undefined }),
}));
