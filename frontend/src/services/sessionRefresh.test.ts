import {
  REFRESH_SKEW_SECONDS,
  SESSION_STORAGE_KEYS,
  clearSessionStorage,
  createSingleFlight,
  decodeJwtClaims,
  isTokenExpiring,
  secondsUntilExpiry,
} from './sessionRefresh';

/**
 * PROMPT #26 (issue #3) — tests T10..T12.
 *
 * The ERP's sidebar used to die after the app sat open. The first cause is
 * mechanical: nothing refreshed the access token *before* it expired, so the
 * very first request after an idle period was rejected and every permission
 * gate downstream resolved to "denied". These primitives are what make the
 * client refresh proactively, so they are pinned here.
 */

/** Build a syntactically valid (unsigned — never verified) JWT with the given `exp`. */
function jwt(expSeconds: number | null, extra: Record<string, unknown> = {}): string {
  const b64url = (value: string) =>
    btoa(String.fromCharCode(...new TextEncoder().encode(value)))
      .replace(/=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');

  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = b64url(JSON.stringify(expSeconds === null ? extra : { ...extra, exp: expSeconds }));
  return `${header}.${payload}.signature-not-verified`;
}

describe('sessionRefresh — token lifecycle primitives', () => {
  const NOW_MS = 1_700_000_000_000;
  const NOW_SEC = Math.floor(NOW_MS / 1000);

  describe('decodeJwtClaims', () => {
    it('reads the payload segment', () => {
      const token = jwt(NOW_SEC + 3600, { sub: 'user-1', role: 'PRODUCTION' });
      expect(decodeJwtClaims(token)).toEqual({ sub: 'user-1', role: 'PRODUCTION', exp: NOW_SEC + 3600 });
    });

    it('decodes a payload that contains non-ASCII characters', () => {
      // base64 of UTF-8 bytes: a naive atob() returns mojibake here.
      const token = jwt(NOW_SEC + 60, { name: 'Anüs Çelik' });
      expect(decodeJwtClaims(token)?.name).toBe('Anüs Çelik');
    });

    it('tolerates every malformed input instead of throwing', () => {
      expect(decodeJwtClaims(null)).toBeNull();
      expect(decodeJwtClaims(undefined)).toBeNull();
      expect(decodeJwtClaims('')).toBeNull();
      expect(decodeJwtClaims('not-a-jwt')).toBeNull();
      expect(decodeJwtClaims('only.two')).toBeNull();
      expect(decodeJwtClaims('a.!!!not-base64!!!.c')).toBeNull();
      // Valid base64, valid JSON, but not an object.
      expect(decodeJwtClaims(`x.${btoa('"just-a-string"')}.y`)).toBeNull();
    });
  });

  describe('secondsUntilExpiry', () => {
    it('counts down to the exp claim', () => {
      expect(secondsUntilExpiry(jwt(NOW_SEC + 900), NOW_MS)).toBe(900);
      expect(secondsUntilExpiry(jwt(NOW_SEC - 30), NOW_MS)).toBe(-30);
    });

    it('is Infinity when the token carries no usable exp', () => {
      // A non-expiring token must not trigger a refresh storm.
      expect(secondsUntilExpiry(jwt(null, { sub: 'u' }), NOW_MS)).toBe(Infinity);
      expect(secondsUntilExpiry('garbage', NOW_MS)).toBe(Infinity);
      expect(secondsUntilExpiry(null, NOW_MS)).toBe(Infinity);
    });
  });

  describe('isTokenExpiring (proactive refresh trigger)', () => {
    it('is false while the token comfortably outlives the skew window', () => {
      expect(isTokenExpiring(jwt(NOW_SEC + REFRESH_SKEW_SECONDS + 30), REFRESH_SKEW_SECONDS, NOW_MS)).toBe(false);
    });

    it('is true INSIDE the skew window, before the token actually expired', () => {
      // This is the whole point: refresh ahead of the failure, not after it.
      expect(isTokenExpiring(jwt(NOW_SEC + 30), REFRESH_SKEW_SECONDS, NOW_MS)).toBe(true);
    });

    it('is true at the exact skew boundary', () => {
      expect(isTokenExpiring(jwt(NOW_SEC + REFRESH_SKEW_SECONDS), REFRESH_SKEW_SECONDS, NOW_MS)).toBe(true);
    });

    it('is true once the token is already expired', () => {
      expect(isTokenExpiring(jwt(NOW_SEC - 1), REFRESH_SKEW_SECONDS, NOW_MS)).toBe(true);
    });

    it('is false for a token with no exp claim (no refresh storm)', () => {
      expect(isTokenExpiring(jwt(null, { sub: 'u' }), REFRESH_SKEW_SECONDS, NOW_MS)).toBe(false);
      expect(isTokenExpiring(null, REFRESH_SKEW_SECONDS, NOW_MS)).toBe(false);
    });

    it('honours a caller-supplied skew', () => {
      const token = jwt(NOW_SEC + 300);
      expect(isTokenExpiring(token, 60, NOW_MS)).toBe(false);
      expect(isTokenExpiring(token, 600, NOW_MS)).toBe(true);
    });
  });

  describe('clearSessionStorage', () => {
    it('removes every key this app owns from localStorage and sessionStorage', () => {
      for (const key of SESSION_STORAGE_KEYS) {
        localStorage.setItem(key, 'value');
        sessionStorage.setItem(key, 'value');
      }
      localStorage.setItem('unrelated-app-key', 'keep me');
      sessionStorage.setItem('unrelated-app-key', 'keep me');

      clearSessionStorage();

      for (const key of SESSION_STORAGE_KEYS) {
        expect(localStorage.getItem(key)).toBeNull();
        expect(sessionStorage.getItem(key)).toBeNull();
      }
      // Never nuke data that belongs to something else on the origin.
      expect(localStorage.getItem('unrelated-app-key')).toBe('keep me');
      expect(sessionStorage.getItem('unrelated-app-key')).toBe('keep me');
    });

    it('includes the permissions cache timestamp so a new login starts clean', () => {
      // A stale `erp_permissions_ts` would otherwise make the new session
      // believe its identity cache is still fresh.
      expect(SESSION_STORAGE_KEYS).toContain('erp_permissions_ts');
      expect(SESSION_STORAGE_KEYS).toContain('erp_user');
      expect(SESSION_STORAGE_KEYS).toContain('token');
    });

    it('never throws when storage is unavailable (private mode)', () => {
      const hostile = {
        removeItem: () => {
          throw new Error('SecurityError');
        },
      } as unknown as Storage;
      expect(() => clearSessionStorage(hostile)).not.toThrow();
    });
  });

  describe('createSingleFlight', () => {
    it('lets exactly one caller own the teardown', () => {
      const flight = createSingleFlight();
      expect(flight.isRedirecting).toBe(false);
      expect(flight.claim()).toBe(true);
      expect(flight.isRedirecting).toBe(true);
      // Every concurrent 401 after that must NOT redirect again.
      expect(flight.claim()).toBe(false);
      expect(flight.claim()).toBe(false);
    });

    it('can be reset for the next terminal failure', () => {
      const flight = createSingleFlight();
      expect(flight.claim()).toBe(true);
      flight.reset();
      expect(flight.isRedirecting).toBe(false);
      expect(flight.claim()).toBe(true);
    });

    it('keeps separate instances independent (one per interceptor chain)', () => {
      const a = createSingleFlight();
      const b = createSingleFlight();
      expect(a.claim()).toBe(true);
      expect(b.claim()).toBe(true);
    });
  });
});
