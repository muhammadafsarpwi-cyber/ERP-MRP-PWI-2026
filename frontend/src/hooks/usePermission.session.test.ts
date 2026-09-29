import { act, renderHook, waitFor } from '@testing-library/react';

import apiService from '../services/api';
import { PERMISSIONS_FOCUS_TTL_MS, isSessionGone, usePermission } from './usePermission';

/**
 * PROMPT #26 (issue #3) — tests T13/T14: what `usePermission` does when the
 * session dies or the identity goes stale while the tab sits open.
 *
 * The reported symptom was "the sidebar buttons die after the ERP is left
 * open". The mechanism was in this hook:
 *
 *   catch { setIsLoaded(true); }        // ← the old code
 *
 * A failed `/auth/me` revalidation left `permissions` EMPTY while marking the
 * hook as "loaded", so `MainLayout.effectiveCan` returned false for every nav
 * entry simultaneously — a permanently empty sidebar, with no error anywhere.
 *
 * These tests pin the replacement contract:
 *   • an auth failure (401/403/no token) is surfaced, and `isLoaded` stays
 *     false so the shell can offer a retry instead of rendering a dead menu;
 *   • a TRANSIENT failure keeps the permissions already on screen;
 *   • focus / visibilitychange / `erp:session-synced` revalidate without a
 *     browser refresh, so a revoked permission or a changed division scope
 *     disappears on its own.
 */

jest.mock('../services/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), markSessionActive: jest.fn() },
}));

const mockedGet = apiService.get as unknown as jest.Mock;

const PERM = 'manufacturing.material_receiving.view';
const D_CCD = 'd1000000-0000-0000-0000-000000000002';
const D_SPD = 'd1000000-0000-0000-0000-000000000001';

const MINUTE = 60 * 1000;

/** Old enough that the mount effect revalidates (the hook's own 5-minute TTL). */
const MOUNT_STALE_AGE = 30 * MINUTE;
/** Old enough to trip the focus/visibility gate, but not the mount TTL. */
const FOCUS_STALE_AGE = PERMISSIONS_FOCUS_TTL_MS + MINUTE;

function ageCache(ageMs: number) {
  localStorage.setItem('erp_permissions_ts', String(Date.now() - ageMs));
}

function seedIdentity(
  permissions: string[],
  extra: Record<string, unknown> = {},
  cacheAgeMs: number | null = null,
) {
  localStorage.setItem(
    'erp_user',
    JSON.stringify({ id: 'u1', email: 'anas@pwi.test', displayName: 'Anus', permissions, ...extra }),
  );
  ageCache(cacheAgeMs ?? 0);
  localStorage.setItem('token', 'access-token');
}

function axiosLikeError(status: number) {
  const err: any = new Error(`Request failed with status code ${status}`);
  err.response = { status, data: {} };
  return err;
}

describe('usePermission — session lifecycle (PROMPT #26)', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    mockedGet.mockReset();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('isSessionGone', () => {
    it('is true only when neither token is stored', () => {
      expect(isSessionGone()).toBe(true);
      localStorage.setItem('access_token', 'x');
      expect(isSessionGone()).toBe(false);
      localStorage.removeItem('access_token');
      localStorage.setItem('token', 'x');
      expect(isSessionGone()).toBe(false);
    });
  });

  describe('failed revalidation', () => {
    it('surfaces a 401 as an error instead of wiping the permission set', async () => {
      seedIdentity([PERM], {}, MOUNT_STALE_AGE);
      mockedGet.mockRejectedValue(axiosLikeError(401));

      const { result } = renderHook(() => usePermission());

      await waitFor(() => expect(result.current.isError).toBe(true));
      expect(result.current.isLoaded).toBe(false);
      // The cached permission is still available so a retry has something to
      // compare against — the failure is visible, not silent.
      expect(result.current.can(PERM)).toBe(true);
    });

    it('treats a 403 the same way (authorization was revoked server-side)', async () => {
      seedIdentity([PERM], {}, MOUNT_STALE_AGE);
      mockedGet.mockRejectedValue(axiosLikeError(403));

      const { result } = renderHook(() => usePermission());

      await waitFor(() => expect(result.current.isError).toBe(true));
      expect(result.current.isLoaded).toBe(false);
    });

    it('treats "the interceptor already cleared the tokens" as a dead session', async () => {
      seedIdentity([PERM], {}, MOUNT_STALE_AGE);
      mockedGet.mockImplementation(async () => {
        // What `endSessionAndRedirect()` leaves behind.
        localStorage.removeItem('token');
        throw new Error('Network Error');
      });

      const { result } = renderHook(() => usePermission());

      await waitFor(() => expect(result.current.isError).toBe(true));
      expect(result.current.isLoaded).toBe(false);
    });

    it('keeps the previous identity on a TRANSIENT failure (network blip)', async () => {
      seedIdentity([PERM], {}, MOUNT_STALE_AGE);
      mockedGet.mockRejectedValue(axiosLikeError(503));

      const { result } = renderHook(() => usePermission());

      await waitFor(() => expect(result.current.isError).toBe(true));
      // A flaky network must not empty the sidebar — that is the other half of
      // the original bug.
      expect(result.current.isLoaded).toBe(true);
      expect(result.current.can(PERM)).toBe(true);
    });

    it('clears the error once a retry succeeds', async () => {
      seedIdentity([PERM], {}, MOUNT_STALE_AGE);
      mockedGet.mockRejectedValueOnce(axiosLikeError(500));
      mockedGet.mockResolvedValueOnce({ data: { id: 'u1', email: 'a@b.c', displayName: 'A', permissions: [PERM] } });

      const { result } = renderHook(() => usePermission());
      await waitFor(() => expect(result.current.isError).toBe(true));

      await act(async () => {
        await result.current.refreshPermissions();
      });

      expect(result.current.isError).toBe(false);
      expect(result.current.isLoaded).toBe(true);
    });
  });

  describe('revalidation without a browser refresh', () => {
    it('re-pulls /auth/me on window focus when the cache is stale', async () => {
      seedIdentity([PERM], {}, MOUNT_STALE_AGE);
      mockedGet.mockResolvedValue({ data: { id: 'u1', email: 'a@b.c', displayName: 'A', permissions: [PERM] } });

      const { result } = renderHook(() => usePermission());
      await waitFor(() => expect(mockedGet).toHaveBeenCalledTimes(1));

      // Freshness from the successful mount fetch, then aged past the focus TTL.
      ageCache(FOCUS_STALE_AGE);
      act(() => {
        window.dispatchEvent(new Event('focus'));
      });

      await waitFor(() => expect(mockedGet).toHaveBeenCalledTimes(2));
      expect(result.current.can(PERM)).toBe(true);
    });

    it('does NOT revalidate on focus while the cache is still fresh', async () => {
      seedIdentity([PERM]);
      mockedGet.mockResolvedValue({ data: { id: 'u1', email: 'a@b.c', displayName: 'A', permissions: [PERM] } });

      const { result } = renderHook(() => usePermission());
      await waitFor(() => expect(result.current.isLoaded).toBe(true));
      mockedGet.mockClear();

      act(() => {
        window.dispatchEvent(new Event('focus'));
      });

      expect(mockedGet).not.toHaveBeenCalled();
    });

    it('drops a permission the server revoked, without a reload', async () => {
      seedIdentity([PERM, 'production.entry.view'], {}, MOUNT_STALE_AGE);
      mockedGet.mockResolvedValue({ data: { id: 'u1', email: 'a@b.c', displayName: 'A', permissions: ['production.entry.view'] } });

      const { result } = renderHook(() => usePermission());
      expect(result.current.can(PERM)).toBe(true);

      // A revoked role, discovered on return to the tab.
      await act(async () => {
        ageCache(FOCUS_STALE_AGE);
        window.dispatchEvent(new Event('focus'));
      });

      await waitFor(() => expect(result.current.can(PERM)).toBe(false));
      expect(result.current.can('production.entry.view')).toBe(true);
    });

    it('picks up a NARROWED division scope, without a reload', async () => {
      // The reported leak in reverse: Anus's server-side scope was corrected
      // from "everything" to DIV-CCD only. The client must follow.
      seedIdentity(
        [PERM],
        { divisions: { unrestricted: true, items: [], permissionScopes: {} } },
        MOUNT_STALE_AGE,
      );
      mockedGet.mockResolvedValue({
        data: {
          id: 'u1',
          email: 'a@b.c',
          displayName: 'A',
          permissions: [PERM],
          divisions: { unrestricted: false, items: [{ id: D_CCD, divisionCode: 'DIV-CCD', name: 'CCD' }], permissionScopes: {} },
        },
      });

      const { result } = renderHook(() => usePermission());
      expect(result.current.divisionsUnrestricted).toBe(true);
      expect(result.current.canInDivision(PERM, D_SPD)).toBe(true);

      await act(async () => {
        ageCache(FOCUS_STALE_AGE);
        window.dispatchEvent(new Event('focus'));
      });

      await waitFor(() => expect(result.current.divisionsUnrestricted).toBe(false));
      expect(result.current.allowedDivisionIds).toEqual([D_CCD]);
      expect(result.current.canInDivision(PERM, D_CCD)).toBe(true);
      expect(result.current.canInDivision(PERM, D_SPD)).toBe(false);
    });

    it('revalidates when the api layer reports a completed token refresh', async () => {
      seedIdentity([PERM], {}, MOUNT_STALE_AGE);
      mockedGet.mockResolvedValue({ data: { id: 'u1', email: 'a@b.c', displayName: 'A', permissions: [PERM] } });

      const { result } = renderHook(() => usePermission());
      await waitFor(() => expect(result.current.isLoaded).toBe(true));
      mockedGet.mockClear();

      act(() => {
        window.dispatchEvent(new CustomEvent('erp:session-synced'));
      });

      await waitFor(() => expect(mockedGet).toHaveBeenCalled());
    });

    it('never reloads the page to revalidate', async () => {
      seedIdentity([PERM], {}, MOUNT_STALE_AGE);
      const assign = jest.fn();
      Object.defineProperty(window, 'location', {
        configurable: true,
        value: { ...window.location, assign, href: window.location.href },
      });

      mockedGet.mockResolvedValue({ data: { id: 'u1', email: 'a@b.c', displayName: 'A', permissions: [PERM] } });
      const { result } = renderHook(() => usePermission());
      await waitFor(() => expect(result.current.isLoaded).toBe(true));

      await act(async () => {
        ageCache(FOCUS_STALE_AGE);
        window.dispatchEvent(new Event('focus'));
      });

      await waitFor(() => expect(mockedGet).toHaveBeenCalledTimes(2));
      expect(assign).not.toHaveBeenCalled();
    });

    it('detaches its listeners on unmount', async () => {
      seedIdentity([PERM], {}, MOUNT_STALE_AGE);
      mockedGet.mockResolvedValue({ data: { id: 'u1', email: 'a@b.c', displayName: 'A', permissions: [PERM] } });

      const { unmount } = renderHook(() => usePermission());
      await waitFor(() => expect(mockedGet).toHaveBeenCalledTimes(1));
      unmount();
      mockedGet.mockClear();

      act(() => {
        window.dispatchEvent(new Event('focus'));
        document.dispatchEvent(new Event('visibilitychange'));
        window.dispatchEvent(new CustomEvent('erp:session-synced'));
      });

      expect(mockedGet).not.toHaveBeenCalled();
    });
  });
});
