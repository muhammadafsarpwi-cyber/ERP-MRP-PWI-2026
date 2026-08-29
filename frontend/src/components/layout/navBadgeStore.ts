import { create } from 'zustand';

interface NavBadgeState {
  badges: Record<string, number>;
  setNavBadge: (key: string, count: number) => void;
  clearNavBadge: (key: string) => void;
}

/**
 * Lightweight live-count registry for the sidebar navigation. Pages push a
 * real count for a canonical nav route key (e.g. a Maintenance queue key);
 * MainLayout renders a count chip next to the matching menu item. Zero is
 * stored explicitly so queue entries can show a subtle "0" badge — callers
 * use clearNavBadge to remove an entry entirely (e.g. stale/absent queues).
 */
export const useNavBadgeStore = create<NavBadgeState>((set) => ({
  badges: {},
  setNavBadge: (key, count) =>
    set((s) => {
      const safe = Math.trunc(Number(count) || 0);
      if (!Number.isFinite(safe) || safe < 0) return s;
      return { badges: { ...s.badges, [key]: safe } };
    }),
  clearNavBadge: (key) =>
    set((s) => {
      if (!(key in s.badges)) return s;
      const rest = { ...s.badges };
      delete rest[key];
      return { badges: rest };
    }),
}));