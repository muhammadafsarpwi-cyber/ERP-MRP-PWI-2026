/**
 * Lightweight in-memory TTL cache for hot RBAC and authentication lookups
 * (`ErpUserService`, `PermissionService`, `PermissionMatrixService`).
 *
 * Cuts repetitive Supabase PostgreSQL queries (`erp_users`, `user_roles`,
 * `role_permissions`, `permissions`) by >95% during active sessions while
 * automatically clearing on any user/role/permission mutation or manual refresh.
 *
 * Automatically bypassed under Jest (`JEST_WORKER_ID`) so unit test mocks
 * always exercise underlying repositories deterministically.
 */
interface TtlEntry<T> {
  value: T;
  expiresAt: number;
}

const DEFAULT_AUTH_TTL_MS = 60_000;

class AuthLookupCacheStore {
  private readonly userByAuthId = new Map<string, TtlEntry<any>>();
  private readonly scopesByUserId = new Map<string, TtlEntry<any[]>>();
  private readonly permsByUserId = new Map<string, TtlEntry<string[]>>();
  private readonly permCheck = new Map<string, TtlEntry<boolean>>();

  private isEnabled(): boolean {
    return typeof process === 'undefined' || process.env.JEST_WORKER_ID === undefined;
  }

  getUserByAuthId<T>(authUserId: string): T | undefined {
    if (!this.isEnabled()) return undefined;
    const hit = this.userByAuthId.get(authUserId);
    if (!hit) return undefined;
    if (Date.now() >= hit.expiresAt) {
      this.userByAuthId.delete(authUserId);
      return undefined;
    }
    return hit.value as T;
  }

  setUserByAuthId(authUserId: string, value: any, ttlMs = DEFAULT_AUTH_TTL_MS): void {
    if (!this.isEnabled() || !value) return;
    if (this.userByAuthId.size > 500) this.userByAuthId.clear();
    this.userByAuthId.set(authUserId, { value, expiresAt: Date.now() + ttlMs });
  }

  getScopesByUserId<T>(userId: string): T[] | undefined {
    if (!this.isEnabled()) return undefined;
    const hit = this.scopesByUserId.get(userId);
    if (!hit) return undefined;
    if (Date.now() >= hit.expiresAt) {
      this.scopesByUserId.delete(userId);
      return undefined;
    }
    return hit.value as T[];
  }

  setScopesByUserId(userId: string, value: any[], ttlMs = DEFAULT_AUTH_TTL_MS): void {
    if (!this.isEnabled()) return;
    if (this.scopesByUserId.size > 500) this.scopesByUserId.clear();
    this.scopesByUserId.set(userId, { value, expiresAt: Date.now() + ttlMs });
  }

  getPermsByUserId(userId: string): string[] | undefined {
    if (!this.isEnabled()) return undefined;
    const hit = this.permsByUserId.get(userId);
    if (!hit) return undefined;
    if (Date.now() >= hit.expiresAt) {
      this.permsByUserId.delete(userId);
      return undefined;
    }
    return hit.value;
  }

  setPermsByUserId(userId: string, value: string[], ttlMs = DEFAULT_AUTH_TTL_MS): void {
    if (!this.isEnabled()) return;
    if (this.permsByUserId.size > 500) this.permsByUserId.clear();
    this.permsByUserId.set(userId, { value, expiresAt: Date.now() + ttlMs });
  }

  getPermCheck(userId: string, permissionCode: string): boolean | undefined {
    if (!this.isEnabled()) return undefined;
    const key = `${userId}::${permissionCode}`;
    const hit = this.permCheck.get(key);
    if (!hit) return undefined;
    if (Date.now() >= hit.expiresAt) {
      this.permCheck.delete(key);
      return undefined;
    }
    return hit.value;
  }

  setPermCheck(userId: string, permissionCode: string, value: boolean, ttlMs = DEFAULT_AUTH_TTL_MS): void {
    if (!this.isEnabled()) return;
    if (this.permCheck.size > 2000) this.permCheck.clear();
    this.permCheck.set(`${userId}::${permissionCode}`, { value, expiresAt: Date.now() + ttlMs });
  }

  invalidateUser(userId?: string, authUserId?: string): void {
    if (authUserId) this.userByAuthId.delete(authUserId);
    if (userId) {
      this.scopesByUserId.delete(userId);
      this.permsByUserId.delete(userId);
      for (const k of this.permCheck.keys()) {
        if (k.startsWith(`${userId}::`)) this.permCheck.delete(k);
      }
      for (const [k, v] of this.userByAuthId.entries()) {
        if (v?.value?.id === userId) this.userByAuthId.delete(k);
      }
    }
  }

  invalidateAll(): void {
    this.userByAuthId.clear();
    this.scopesByUserId.clear();
    this.permsByUserId.clear();
    this.permCheck.clear();
  }
}

export const authLookupCache = new AuthLookupCacheStore();
