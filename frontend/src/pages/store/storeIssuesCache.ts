/**
 * Client-side sticky cache & in-flight request deduplicator for the
 * Store Issue Notes (SIN) page and StoreLineItemsEditor.
 *
 * Ensures switching status tabs, closing/reopening the Create/Edit SIN modal,
 * or toggling filters feels instantaneous (0ms client hit) until either a SIN
 * mutation occurs (create/update/post/cancel/delete) or the user clicks Refresh.
 */

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const DEFAULT_ISSUES_TTL_MS = 120_000;
const DEFAULT_LOOKUP_TTL_MS = 300_000;
const DEFAULT_HISTORY_TTL_MS = 60_000;

class StoreIssuesClientCache {
  private readonly store = new Map<string, CacheEntry<any>>();
  private readonly inFlight = new Map<string, Promise<any>>();

  private get<T>(key: string): T | null {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return entry.value as T;
  }

  private set<T>(key: string, value: T, ttlMs: number): T {
    this.store.set(key, {
      value,
      expiresAt: Date.now() + ttlMs,
    });
    return value;
  }

  async getOrFetch<T>(
    key: string,
    fetcher: () => Promise<T>,
    ttlMs: number = DEFAULT_LOOKUP_TTL_MS,
  ): Promise<T> {
    const hit = this.get<T>(key);
    if (hit !== null) {
      return hit;
    }
    const existingFlight = this.inFlight.get(key);
    if (existingFlight) {
      return existingFlight as Promise<T>;
    }
    const promise = fetcher()
      .then((result) => {
        this.set(key, result, ttlMs);
        this.inFlight.delete(key);
        return result;
      })
      .catch((err) => {
        this.inFlight.delete(key);
        throw err;
      });
    this.inFlight.set(key, promise);
    return promise;
  }

  getCached<T>(key: string): T | null {
    return this.get<T>(key);
  }

  setCached<T>(key: string, value: T, ttlMs: number = DEFAULT_ISSUES_TTL_MS): T {
    return this.set(key, value, ttlMs);
  }

  keys = {
    issuesList: (paramsKey: string) => `sin:list:${paramsKey}`,
    lookups: () => 'sin:lookups:core',
    uoms: () => 'sin:uoms:all',
    machines: (deptId: string) => `sin:machines:${deptId || 'ALL'}`,
    personnel: (deptId?: string, machineId?: string) =>
      `sin:personnel:${deptId || 'ALL'}:${machineId || 'ALL'}`,
    storeItems: (storeId: string) => `sin:store-items:${storeId}`,
    masterItems: (divisionId?: string) => `sin:master-items:${divisionId || 'ALL'}`,
    partHistory: (
      machineId: string,
      itemId: string,
      asOfDate?: string,
      excludeIssueId?: string,
    ) => `sin:part-history:${machineId}:${itemId}:${asOfDate || ''}:${excludeIssueId || ''}`,
  };

  ttls = {
    issues: DEFAULT_ISSUES_TTL_MS,
    lookup: DEFAULT_LOOKUP_TTL_MS,
    history: DEFAULT_HISTORY_TTL_MS,
  };

  invalidateIssues(): void {
    for (const k of Array.from(this.store.keys())) {
      if (
        k.startsWith('sin:list:') ||
        k.startsWith('sin:store-items:') ||
        k.startsWith('sin:part-history:') ||
        k.startsWith('sin:personnel:')
      ) {
        this.store.delete(k);
      }
    }
  }

  invalidatePartHistory(): void {
    for (const k of Array.from(this.store.keys())) {
      if (k.startsWith('sin:part-history:')) {
        this.store.delete(k);
      }
    }
  }

  invalidateAll(): void {
    this.store.clear();
  }
}

export const storeIssuesCache = new StoreIssuesClientCache();
