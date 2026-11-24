/**
 * Tab Session Cache
 * 
 * Retains loaded page data while a workspace tab remains open.
 * Prevents redundant re-fetching/re-rendering when switching between tabs.
 * Cache entries are evicted only when the user explicitly closes the tab,
 * or when a manual refresh is requested.
 */

interface CacheItem<T = any> {
  data: T;
  timestamp: number;
}

const sessionMap = new Map<string, CacheItem>();
const inFlightRequests = new Set<string>();
const STORAGE_PREFIX = 'erp_tab_session_';

export const tabSessionCache = {
  get<T>(key: string): T | undefined {
    // 1. Fast memory tier
    const item = sessionMap.get(key);
    if (item && item.data !== undefined) {
      return item.data as T;
    }

    // 2. Browser sessionStorage tier (persists across hot reloads & navigation)
    try {
      if (typeof window !== 'undefined' && window.sessionStorage) {
        const serialized = window.sessionStorage.getItem(STORAGE_PREFIX + key);
        if (serialized) {
          const parsed: CacheItem<T> = JSON.parse(serialized);
          sessionMap.set(key, parsed);
          return parsed.data;
        }
      }
    } catch {
      // ignore storage errors
    }

    return undefined;
  },

  set<T>(key: string, data: T): void {
    const item: CacheItem<T> = { data, timestamp: Date.now() };
    sessionMap.set(key, item);
    inFlightRequests.delete(key);

    try {
      if (typeof window !== 'undefined' && window.sessionStorage) {
        window.sessionStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(item));
      }
    } catch {
      // ignore storage quota / serialization errors
    }
  },

  has(key: string): boolean {
    if (sessionMap.has(key)) return true;
    try {
      if (typeof window !== 'undefined' && window.sessionStorage) {
        return window.sessionStorage.getItem(STORAGE_PREFIX + key) !== null;
      }
    } catch {
      // ignore
    }
    return false;
  },

  remove(key: string): void {
    sessionMap.delete(key);
    inFlightRequests.delete(key);
    try {
      if (typeof window !== 'undefined' && window.sessionStorage) {
        window.sessionStorage.removeItem(STORAGE_PREFIX + key);
      }
    } catch {
      // ignore
    }
  },

  clear(): void {
    sessionMap.clear();
    inFlightRequests.clear();
    try {
      if (typeof window !== 'undefined' && window.sessionStorage) {
        const toDelete: string[] = [];
        for (let i = 0; i < window.sessionStorage.length; i++) {
          const k = window.sessionStorage.key(i);
          if (k && k.startsWith(STORAGE_PREFIX)) toDelete.push(k);
        }
        toDelete.forEach((k) => window.sessionStorage.removeItem(k));
      }
    } catch {
      // ignore
    }
  },

  /** Lock to avoid duplicate initial fetches in React 18 StrictMode */
  tryAcquireFetchLock(key: string): boolean {
    if (inFlightRequests.has(key) || this.has(key)) return false;
    inFlightRequests.add(key);
    return true;
  },

  releaseFetchLock(key: string): void {
    inFlightRequests.delete(key);
  },
};

export const TAB_REFRESH_EVENT = 'erp_tab_refresh_event';

const WORKSPACE_TABS_STORAGE_KEY = 'pwi_erp_workspace_tabs_v1';

export function normalizeTabPath(raw?: string | null): string {
  if (!raw) return '/';
  const cleaned = String(raw).split('?')[0].split('#')[0].replace(/\/+$/, '') || '/';
  // Strip version suffixes like /dashboard/v5 -> /dashboard for route matching
  return cleaned.replace(/\/v\d+$/, '') || '/';
}

export function getActiveWorkspaceTabId(): string | null {
  try {
    const raw = localStorage.getItem(WORKSPACE_TABS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.activeTabId === 'string' && parsed.activeTabId.trim()) {
        return parsed.activeTabId;
      }
    }
  } catch {
    // ignore storage errors
  }
  if (typeof window !== 'undefined' && window.location?.pathname) {
    return window.location.pathname;
  }
  return null;
}

export function isRouteActive(canonicalTabIds: string | string[]): boolean {
  const activeRaw = getActiveWorkspaceTabId();
  if (!activeRaw) return false;
  const active = normalizeTabPath(activeRaw);
  const ids = Array.isArray(canonicalTabIds) ? canonicalTabIds : [canonicalTabIds];
  return ids.some((id) => {
    const norm = normalizeTabPath(id);
    if (norm === '/') return active === '/';
    return active === norm || active.startsWith(`${norm}/`);
  });
}

/**
 * Strict route-scoped matcher for `TAB_REFRESH_EVENT`.
 * - When `detail.tabId` or `detail.path` is omitted, returns true ONLY for the
 *   currently active workspace tab (preventing background tabs from reloading).
 * - When a target route is specified, matches on an exact segment boundary
 *   rather than `.includes()` / bare `.startsWith()` (so `/sales/orders`
 *   never triggers `/sales/orders-division-review` or `/sales/order-command`).
 */
export function matchesTabRefreshDetail(
  detail: { tabId?: string; path?: string } | undefined | null,
  canonicalTabIds: string | string[],
): boolean {
  const rawTarget = detail?.tabId || detail?.path;
  if (!rawTarget) {
    return isRouteActive(canonicalTabIds);
  }
  const target = normalizeTabPath(rawTarget);
  const ids = Array.isArray(canonicalTabIds) ? canonicalTabIds : [canonicalTabIds];
  return ids.some((id) => {
    const norm = normalizeTabPath(id);
    if (norm === '/') return target === '/';
    return target === norm || target.startsWith(`${norm}/`);
  });
}

export function matchesTabRefresh(
  event: Event,
  canonicalTabIds: string | string[],
): boolean {
  const detail = (event as CustomEvent<{ tabId?: string; path?: string }>)?.detail;
  return matchesTabRefreshDetail(detail, canonicalTabIds);
}

/** Marks a short window during which API GET requests bypass server/ETag cache. */
export function markManualRefreshWindow(durationMs = 800): void {
  if (typeof window !== 'undefined') {
    (window as any).__erpBypassServerCacheUntil = Date.now() + durationMs;
  }
}

/**
 * Dispatches a manual refresh request for the active tab or a specific tabId.
 */
export function triggerTabRefresh(tabId?: string): void {
  const target = tabId ?? getActiveWorkspaceTabId() ?? undefined;
  markManualRefreshWindow(800);
  if (target) {
    tabSessionCache.remove(target);
  }
  window.dispatchEvent(new CustomEvent(TAB_REFRESH_EVENT, { detail: { tabId: target } }));
}
