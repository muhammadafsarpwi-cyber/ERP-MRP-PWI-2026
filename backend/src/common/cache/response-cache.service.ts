import { Injectable } from '@nestjs/common';
import * as crypto from 'crypto';

export interface CacheRule {
  id: string;
  pattern: RegExp;
  ttlMs: number;
  tags: string[];
  perUser?: boolean;
  excludePattern?: RegExp;
}

interface CacheEntry {
  key: string;
  value: unknown;
  etag: string;
  expiresAt: number;
  tags: Set<string>;
}

const DEFAULT_CACHE_RULES: CacheRule[] = [
  {
    id: 'team-chat:users',
    pattern: /^\/team-chat\/users$/,
    ttlMs: 15_000,
    tags: ['team-chat:users'],
    perUser: true,
  },
  {
    id: 'team-chat:conversations',
    pattern: /^\/team-chat\/conversations$/,
    ttlMs: 15_000,
    tags: ['team-chat:conversations'],
    perUser: true,
  },
  {
    id: 'team-chat:attachment',
    pattern: /^\/team-chat\/messages\/[^/]+\/attachment$/,
    ttlMs: 60_000,
    tags: ['team-chat:attachment'],
    perUser: true,
  },
  {
    id: 'items',
    pattern: /^\/(master-data\/)?items(\/.*)?$/,
    excludePattern: /\/(cleanup|delete-eligibility|stock-ledger|inventory|production-history|qr|convert)$/,
    ttlMs: 30_000,
    tags: ['items'],
  },
  {
    id: 'machines',
    pattern: /^\/(production\/)?machines(\/.*)?$/,
    excludePattern: /\/qr$/,
    ttlMs: 30_000,
    tags: ['machines'],
  },
  {
    id: 'departments',
    pattern: /^\/(organization\/)?departments(\/.*)?$/,
    ttlMs: 60_000,
    tags: ['departments'],
  },
  {
    id: 'divisions',
    pattern: /^\/divisions(\/.*)?$/,
    ttlMs: 60_000,
    tags: ['divisions'],
  },
  {
    id: 'warehouses',
    pattern: /^\/((organization\/)?warehouses|store\/stores)(\/[^/]+)?$/,
    ttlMs: 60_000,
    tags: ['warehouses'],
  },
  {
    id: 'uoms',
    pattern: /^\/(uoms|master-data\/uoms?|master-data\/uom-conversions)(\/.*)?$/,
    ttlMs: 60_000,
    tags: ['uoms'],
  },
  {
    id: 'routings',
    pattern: /^\/production\/routings(\/.*)?$/,
    ttlMs: 30_000,
    tags: ['routings'],
  },
  {
    id: 'machine-tooling',
    pattern: /^\/machine-tooling\/components(\/[^/]+)?$/,
    ttlMs: 30_000,
    tags: ['machine-tooling'],
  },
  {
    id: 'sections-and-masters',
    pattern: /^\/(sections|master-data\/(operations|categories|item-types|route-types))(\/.*)?$/,
    ttlMs: 60_000,
    tags: ['masters'],
  },
  {
    id: 'nipple-alerts',
    pattern: /^\/sales\/analytics\/nipple-import-alerts$/,
    ttlMs: 60_000,
    tags: ['nipple-alerts'],
  },
  {
    id: 'comm-summary',
    pattern: /^\/communication\/settings\/summary$/,
    ttlMs: 15_000,
    tags: ['comm-summary'],
    perUser: true,
  },
  {
    id: 'customers',
    pattern: /^\/(customer\/customers|sales\/orders\/meta\/customers)(\/.*)?$/,
    excludePattern: /\/analytics\//,
    ttlMs: 60_000,
    tags: ['customers'],
  },
  {
    id: 'dashboard-lookups',
    pattern: /^\/dashboard\/(divisions|sections|departments|shifts)$/,
    ttlMs: 60_000,
    tags: ['dashboard', 'masters'],
    perUser: true,
  },
  {
    id: 'dashboard-metrics',
    pattern: /^\/dashboard\/(summary|last-entry-date|production(\/trend)?|machines\/performance|items\/overview|inventory|procurement\/summary|sales\/summary|schedule(\/today)?|calendar-activity|alerts|activity|department-ledger)$/,
    ttlMs: 25_000,
    tags: ['dashboard'],
    perUser: true,
  },
  {
    id: 'sales:order-command-overview',
    pattern: /^\/sales\/orders\/command-overview$/,
    ttlMs: 15_000,
    tags: ['sales-command', 'sales-orders'],
    perUser: true,
  },
];

const INVALIDATION_RULES: Array<{ pattern: RegExp; tags: string[] | 'ALL' }> = [
  { pattern: /^\/(master-data\/)?items(\/|$)/, tags: ['items', 'routings', 'nipple-alerts', 'masters', 'dashboard'] },
  { pattern: /^\/(production\/)?machines(\/|$)/, tags: ['machines', 'routings', 'machine-tooling', 'dashboard'] },
  { pattern: /^\/(organization\/)?departments(\/|$)/, tags: ['departments', 'divisions', 'machines', 'routings', 'masters', 'dashboard'] },
  { pattern: /^\/divisions(\/|$)/, tags: ['divisions', 'departments', 'warehouses', 'items', 'routings', 'masters', 'dashboard'] },
  { pattern: /^\/((organization\/)?warehouses|store\/stores)(\/|$)/, tags: ['warehouses', 'routings', 'dashboard'] },
  { pattern: /^\/(uoms|master-data\/uoms?|master-data\/uom-conversions)(\/|$)/, tags: ['uoms', 'items', 'routings', 'masters', 'dashboard'] },
  { pattern: /^\/production\/routings(\/|$)/, tags: ['routings', 'dashboard'] },
  { pattern: /^\/machine-tooling(\/|$)/, tags: ['machine-tooling', 'machines', 'dashboard'] },
  { pattern: /^\/team-chat(\/|$)/, tags: ['team-chat:users', 'team-chat:conversations'] },
  { pattern: /^\/(sections|master-data\/(operations|categories|item-types|route-types))(\/|$)/, tags: ['masters', 'items', 'routings', 'dashboard'] },
  { pattern: /^\/customer(\/|$)/, tags: ['customers', 'dashboard'] },
  { pattern: /^\/(sales|procurement|inventory|production|store|bom)(\/|$)/, tags: ['nipple-alerts', 'routings', 'dashboard', 'sales-command', 'sales-orders'] },
  { pattern: /^\/(notifications|communication)(\/|$)/, tags: ['comm-summary'] },
  { pattern: /^\/admin\/(users|roles|permissions|recycle-bin)(\/|$)/, tags: 'ALL' },
];

@Injectable()
export class ResponseCacheService {
  private static readonly MAX_ENTRIES = 500;
  private readonly store = new Map<string, CacheEntry>();
  private readonly inFlight = new Map<string, Promise<{ value: unknown; etag: string }>>();

  normalizeApiPath(rawUrlOrPath: string): string {
    const pathOnly = String(rawUrlOrPath || '').split('?')[0];
    return pathOnly.replace(/^\/api\/v1(?=\/|$)/, '') || '/';
  }

  matchRule(rawPath: string): CacheRule | null {
    const normalized = this.normalizeApiPath(rawPath);
    for (const rule of DEFAULT_CACHE_RULES) {
      if (rule.pattern.test(normalized)) {
        if (rule.excludePattern && rule.excludePattern.test(normalized)) {
          return null;
        }
        return rule;
      }
    }
    return null;
  }

  computeEtag(value: unknown): string {
    const json = JSON.stringify(value) ?? '';
    const hash = crypto.createHash('sha1').update(json).digest('base64url').slice(0, 16);
    return `W/"rc-${hash}"`;
  }

  get(key: string): CacheEntry | null {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() >= entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    // Refresh insertion order for lightweight LRU eviction
    this.store.delete(key);
    this.store.set(key, entry);
    return entry;
  }

  set(key: string, value: unknown, ttlMs: number, tags: string[]): string {
    const etag = this.computeEtag(value);
    if (this.store.size >= ResponseCacheService.MAX_ENTRIES && !this.store.has(key)) {
      const oldestKey = this.store.keys().next().value;
      if (oldestKey !== undefined) {
        this.store.delete(oldestKey);
      }
    }
    this.store.set(key, {
      key,
      value,
      etag,
      expiresAt: Date.now() + ttlMs,
      tags: new Set(tags),
    });
    return etag;
  }

  getInFlight(key: string): Promise<{ value: unknown; etag: string }> | undefined {
    return this.inFlight.get(key);
  }

  setInFlight(key: string, promise: Promise<{ value: unknown; etag: string }>): void {
    this.inFlight.set(key, promise);
  }

  deleteInFlight(key: string): void {
    this.inFlight.delete(key);
  }

  invalidateTags(tags: string[]): void {
    if (!tags || tags.length === 0) return;
    const tagSet = new Set(tags);
    for (const [key, entry] of this.store.entries()) {
      for (const t of entry.tags) {
        if (tagSet.has(t)) {
          this.store.delete(key);
          break;
        }
      }
    }
  }

  invalidateForMutation(rawPath: string): void {
    const normalized = this.normalizeApiPath(rawPath);
    const matchedTags = new Set<string>();
    for (const rule of INVALIDATION_RULES) {
      if (rule.pattern.test(normalized)) {
        if (rule.tags === 'ALL') {
          this.invalidateAll();
          return;
        }
        rule.tags.forEach((t) => matchedTags.add(t));
      }
    }
    if (matchedTags.size > 0) {
      this.invalidateTags(Array.from(matchedTags));
    }
  }

  invalidateAll(): void {
    this.store.clear();
  }
}
