/**
 * PROMPT #26 — the token-lifecycle primitives behind the axios interceptors.
 *
 * Issue #3 ("sidebar buttons die after the ERP is left open") had FIVE
 * independent causes, all of which live in this file plus `usePermission.ts`:
 *
 *  1. NO PROACTIVE REFRESH. The access token expired while the tab was idle and
 *     the app only reacted to the resulting 401 — which arrives *after* the
 *     request has already failed, so the user sees an error and every sidebar
 *     item gated on a revalidation never comes back.
 *  2. MISSING `return` AFTER `window.location.href = '/login'` in the 401
 *     branch. Control fell through into the 403 branch and then
 *     `Promise.reject(error)`, so the caller got a spurious rejection and the
 *     interceptor cascade kept running against a half-torn-down session.
 *  3. NO REDIRECT DEDUPE. With N components polling, N concurrent 401s each
 *     navigated to `/login` (and each raced the refresh).
 *  4. THE REFRESH NEVER UPDATED `erp_user` / `erp_permissions_ts`. After a
 *     silent refresh the identity/division context on the client stayed stale
 *     for up to the 5-minute permissions TTL — so the sidebar kept rendering
 *     the OLD permission set (buttons that were revoked stayed clickable, and
 *     division pickers showed divisions the server had just removed).
 *  5. `usePermission.refreshPermissions()` swallowed the error and set
 *     `isLoaded = true` with an EMPTY permission list, so `effectiveCan`
 *     filtered out every sidebar entry at once. (Fixed in `usePermission.ts`;
 *     the primitives here make the failure detectable in the first place.)
 *
 * Everything here is pure/DOM-light so it can be unit tested without axios,
 * without a router and without a real network.
 */

/** Refresh when the access token has fewer than this many seconds left. */
export const REFRESH_SKEW_SECONDS = 60;

/** Keys this app owns. Cleared together, always, on a terminal session failure. */
export const SESSION_STORAGE_KEYS = [
  'token',
  'access_token',
  'refresh_token',
  'erp_user',
  'erp_permissions_ts',
] as const;

export interface DecodedTokenClaims {
  exp?: number;
  iat?: number;
  [claim: string]: unknown;
}

function base64UrlDecode(segment: string): string {
  const padded = segment.replace(/-/g, '+').replace(/_/g, '/');
  const remainder = padded.length % 4;
  const full = remainder === 0 ? padded : padded + '='.repeat(4 - remainder);

  if (typeof atob === 'function') {
    const binary = atob(full);
    // Recover multi-byte UTF-8 characters (base64 of a UTF-8 payload).
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    if (typeof TextDecoder === 'function') {
      try {
        return new TextDecoder('utf-8').decode(bytes);
      } catch {
        /* fall through */
      }
    }
    return binary;
  }

  // Node / test environment.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const BufferCtor = (globalThis as any).Buffer;
  if (BufferCtor) return BufferCtor.from(full, 'base64').toString('utf8');
  throw new Error('No base64 decoder available');
}

/**
 * Decode the JWT payload WITHOUT verifying the signature.
 *
 * This is deliberately only ever used to read the `exp` clock so the client
 * can refresh *before* the server rejects it. It grants nothing: every
 * authorization decision is made server-side by `SupabaseJwtGuard` /
 * `PermissionGuard` / `DivisionScopeGuard`. A tampered `exp` can at worst
 * cause an extra refresh round-trip, never extra access.
 */
export function decodeJwtClaims(token: string | null | undefined): DecodedTokenClaims | null {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length < 2 || !parts[1]) return null;
  try {
    const json = base64UrlDecode(parts[1]);
    const parsed = JSON.parse(json);
    return parsed && typeof parsed === 'object' ? (parsed as DecodedTokenClaims) : null;
  } catch {
    return null;
  }
}

/** Seconds until the access token expires; `Infinity` when unknown. */
export function secondsUntilExpiry(token: string | null | undefined, nowMs: number = Date.now()): number {
  const claims = decodeJwtClaims(token);
  if (!claims || typeof claims.exp !== 'number') return Infinity;
  return claims.exp - Math.floor(nowMs / 1000);
}

/** True when the token is expired, or close enough to expiry to be useless. */
export function isTokenExpiring(
  token: string | null | undefined,
  skewSeconds: number = REFRESH_SKEW_SECONDS,
  nowMs: number = Date.now(),
): boolean {
  const seconds = secondsUntilExpiry(token, nowMs);
  if (seconds === Infinity) return false;
  return seconds <= skewSeconds;
}

/**
 * Remove every key this app owns from storage.
 *
 * Done in BOTH `localStorage` and `sessionStorage` because a tab left open for
 * a long time can be restored from a session snapshot; leaving a stale token
 * behind in either place is how "logged out but still authenticated" happens.
 * `erp_permissions_ts` is included so a fresh login can never adopt the
 * previous session's cache window.
 */
export function clearSessionStorage(storage?: Storage | null): void {
  const targets: Storage[] = [];
  const g = globalThis as any;
  if (storage) targets.push(storage);
  if (g?.localStorage) targets.push(g.localStorage);
  if (g?.sessionStorage) targets.push(g.sessionStorage);

  for (const target of targets) {
    for (const key of SESSION_STORAGE_KEYS) {
      try {
        target.removeItem(key);
      } catch {
        /* private mode / disabled storage — nothing we can do */
      }
    }
  }
}

/**
 * Single-flight guard for the terminal "your session is over" action.
 *
 * Without it, N concurrent 401s each clear storage and each assign
 * `window.location.href`, and the losing navigations abort whichever request
 * happened to be mid-flight — which is what made the UI freeze rather than
 * simply sign the user out.
 */
export function createSingleFlight() {
  let redirecting = false;
  return {
    get isRedirecting() {
      return redirecting;
    },
    /**
     * @returns true when the caller owns the teardown and must `return`
     *          immediately afterwards; false when someone else already owns it.
     */
    claim(): boolean {
      if (redirecting) return false;
      redirecting = true;
      return true;
    },
    reset(): void {
      redirecting = false;
    },
  };
}
