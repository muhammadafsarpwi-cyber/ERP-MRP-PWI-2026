import axios, { AxiosInstance, AxiosResponse, AxiosError } from 'axios';
import { message } from 'antd';
import { useLoadingStore } from '../store/loadingStore';
import { useUserStore } from '../store/userStore';
import {
  REFRESH_SKEW_SECONDS,
  clearSessionStorage,
  createSingleFlight,
  isTokenExpiring,
} from './sessionRefresh';

const API_BASE_URL =
  process.env.REACT_APP_API_URL || `http://${window.location.hostname}:3001/api/v1`;

export { API_BASE_URL };

/**
 * Resolves a stored file/asset URL (e.g. /uploads/receipts/...) to a full URL
 * pointing to the backend host, preventing broken images on frontend origins.
 */
export function resolveFileUrl(url: string | null | undefined): string {
  if (!url) return '';
  if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:') || url.startsWith('blob:')) {
    return url;
  }
  try {
    const origin = new URL(API_BASE_URL).origin;
    return `${origin}${url.startsWith('/') ? '' : '/'}${url}`;
  } catch {
    return url;
  }
}

/**
 * Renders a user-readable description for a failed API request. Preserves the
 * backend status/message when one is available and explains pure network
 * failures (which axios surfaces as a bare "Network Error") so callers can
 * render actionable text instead of the raw axios message.
 */
export function describeRequestError(err: unknown): string {
  if (err && typeof err === 'object' && 'response' in err) {
    const axiosErr = err as { response?: { status?: number; data?: any }; message?: string };
    if (axiosErr.response) {
      const status = axiosErr.response.status;
      const raw = axiosErr.response.data;
      let backendMsg: string | null = null;
      if (raw && typeof raw === 'object' && 'message' in raw) {
        backendMsg = Array.isArray(raw.message) ? raw.message.join('; ') : String(raw.message);
      } else if (raw && typeof raw === 'object' && 'error' in raw) {
        backendMsg = String((raw as any).error);
      }
      return backendMsg
        ? `Server returned HTTP ${status}: ${backendMsg}`
        : `Server returned HTTP ${status}`;
    }
  }
  if (err && typeof err === 'object' && 'request' in err && !('response' in err)) {
    return `Cannot reach the API server at ${API_BASE_URL}. Make sure the backend is running and accessible from this browser, then retry.`;
  }
  const msg = err instanceof Error ? err.message : String(err);
  if (msg === 'Network Error') {
    return `Cannot reach the API server at ${API_BASE_URL}. Make sure the backend is running and accessible from this browser, then retry.`;
  }
  return msg || 'Unknown request error';
}

/**
 * Prompt #16 §30 — turns a backend 403 into a message a user can act on.
 *
 * The raw backend text is deliberately NOT echoed: it can contain permission
 * codes (`Missing required permission: manufacturing...`), SQL, or other
 * internals. Only the two distinctions that matter to a person are surfaced:
 * a division the caller is not allowed to use, versus a general permission
 * they lack. The original message still goes to the console for debugging.
 *
 * Returns `null` when there is nothing safe/meaningful to show.
 */
export function describeForbiddenMessage(backendMessage: unknown): string | null {
  const raw = Array.isArray(backendMessage) ? backendMessage[0] : backendMessage;
  const text = typeof raw === 'string' ? raw.trim() : '';
  if (!text) return null;
  // Division-scope refusals raised by DivisionScopeGuard / service asserts.
  if (/division/i.test(text) && /(access|scope|permission|forbidden)/i.test(text)) {
    return 'You do not have access to this division.';
  }
  if (/^(missing required permission|forbidden)/i.test(text) || /permission/i.test(text)) {
    return 'You do not have permission to perform this action.';
  }
  // Anything else: generic wording only (never the backend's raw text).
  return 'You do not have permission to perform this action.';
}

/** Paths that legitimately answer 401 without meaning "your session died". */
const PUBLIC_PATHS = ['/login', '/forgot-password', '/reset-password'];

/** Never run auth machinery for these — they ARE the auth machinery. */
const AUTH_PATHS = ['/auth/refresh', '/auth/login', '/auth/signup', '/auth/logout'];

/** Owns the single teardown/redirect for a dead session (issue #3, cause 3). */
const sessionTeardown = createSingleFlight();

/** The in-flight refresh promise, shared by every concurrent 401. */
let refreshInFlight: Promise<string | null> | null = null;

/**
 * Tear the session down and navigate to /login exactly once.
 *
 * PROMPT #26 (issue #3, causes 2 + 3): the previous implementation assigned
 * `window.location.href` and then FELL THROUGH into the 403 handler and
 * `Promise.reject(error)`. That fall-through is why a dead session produced a
 * burst of toast errors and a stuck UI instead of a clean redirect. The
 * `return` is load-bearing, and the single-flight guard stops N parallel 401s
 * from each redirecting.
 */
function endSessionAndRedirect(reason: string): void {
  if (!sessionTeardown.claim()) return;
  clearSessionStorage();
  try {
    useUserStore.getState().clearUser?.();
  } catch {
    /* store shape differs — storage clear above is what actually matters */
  }
  // eslint-disable-next-line no-console
  console.warn(`[API] session ended: ${reason}`);
  window.location.href = '/login';
}

/**
 * Re-arm the terminal-session guard after a successful sign-in.
 *
 * `endSessionAndRedirect()` latches `sessionTeardown` so a burst of parallel
 * 401s produces exactly ONE navigation. That latch has to be released again
 * once a new session exists, otherwise a later terminal failure in the same
 * tab would be swallowed (no redirect, no storage clear) and the app would sit
 * there looking signed-in while every request 401s.
 */
export function markSessionActive(): void {
  sessionTeardown.reset();
  refreshInFlight = null;
}

async function refreshAccessToken(): Promise<string | null> {
  if (refreshInFlight) return refreshInFlight;

  const refreshToken = localStorage.getItem('refresh_token');
  if (!refreshToken) return null;

  const run = (async (): Promise<string | null> => {
    try {
      const res = await axios.post(`${API_BASE_URL}/auth/refresh`, { refreshToken });
      const newToken = res.data?.token as string | undefined;
      const newRefreshToken = res.data?.refreshToken as string | undefined;
      if (!newToken) return null;

      localStorage.setItem('token', newToken);
      localStorage.setItem('access_token', newToken);
      if (newRefreshToken) localStorage.setItem('refresh_token', newRefreshToken);

      // PROMPT #26 (issue #3, cause 4): a silent token rotation that leaves
      // `erp_user` / `erp_permissions_ts` untouched keeps the OLD identity and
      // OLD division context alive for the rest of the TTL — so revoked sidebar
      // buttons stay clickable and division pickers show divisions the server
      // has already removed. Re-pull the authoritative profile right after the
      // refresh, and reuse it to settle any waiting 401s.
      await syncIdentityAfterRefresh();
      return newToken;
    } catch {
      return null;
    } finally {
      refreshInFlight = null;
    }
  })();

  refreshInFlight = run;
  return run;
}

/**
 * Re-read `GET /auth/me` after a successful refresh so permissions and division
 * access on the client match what the server will actually enforce.
 *
 * Never rejects: a failure here must not turn a successful token refresh into a
 * logout, it just leaves the previous (still valid) identity in place.
 */
async function syncIdentityAfterRefresh(): Promise<void> {
  try {
    const response = await axios.get(`${API_BASE_URL}/auth/me`, {
      headers: { Authorization: `Bearer ${localStorage.getItem('token') || ''}` },
    });
    const userData = response.data?.data;
    if (!userData || typeof userData !== 'object') return;
    localStorage.setItem('erp_user', JSON.stringify(userData));
    localStorage.setItem('erp_permissions_ts', Date.now().toString());
    try {
      useUserStore.getState().setUser(userData);
    } catch {
      /* ignore */
    }
    window.dispatchEvent(new CustomEvent('erp:session-synced'));
  } catch {
    /* keep the previous identity; the next refresh/focus will retry */
  }
}

class ApiService {
  private api: AxiosInstance;

  constructor() {
    this.api = axios.create({
      baseURL: API_BASE_URL,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    this.setupInterceptors();
  }

  private setupInterceptors() {
    const loading = () => useLoadingStore.getState();
    let activeRequests = 0;

    this.api.interceptors.request.use(
      async (config: any) => {
        if (!config?.silent) {
          activeRequests += 1;
          loading().begin();
        }
        const token = localStorage.getItem('token') || localStorage.getItem('access_token');
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }

        // PROMPT #26 (issue #3, cause 1): refresh BEFORE the request is sent
        // when the access token is already expired / about to be. Previously
        // the only recovery was reactive (a 401 AFTER the call failed), which
        // is what left the app in a broken state after a long idle period.
        // Guarded so the refresh call itself never recurses.
        const isAuthCall = AUTH_PATHS.some((p) => String(config?.url || '').includes(p));
        if (!isAuthCall && !config?._retry && token && isTokenExpiring(token, REFRESH_SKEW_SECONDS)) {
          const fresh = await refreshAccessToken();
          if (fresh) {
            config.headers.Authorization = `Bearer ${fresh}`;
          } else {
            endSessionAndRedirect('access token expired and refresh failed');
          }
        }
        return config;
      },
      (error) => {
        return Promise.reject(error);
      }
    );

    let isRefreshing = false;
    let failedQueue: Array<{ resolve: (token: string) => void; reject: (err: any) => void }> = [];

    const processQueue = (error: any, token: string | null = null) => {
      failedQueue.forEach((prom) => {
        if (error) {
          prom.reject(error);
        } else if (token) {
          prom.resolve(token);
        }
      });
      failedQueue = [];
    };

    const completeRequest = (config?: any) => {
      if (!config?.silent && activeRequests > 0) {
        activeRequests -= 1;
        loading().end();
      }
    };

    this.api.interceptors.response.use(
      (response: AxiosResponse) => {
        completeRequest(response.config);
        return response;
      },
      async (error: AxiosError) => {
        completeRequest(error.config);
        const originalRequest = error.config as any;
        const status = error.response?.status;
        const currentPath = window.location.pathname;
        const isPublicPath = PUBLIC_PATHS.includes(currentPath);

        if (status === 401 && !isPublicPath && originalRequest && !originalRequest._retry) {
          const isAuthCall = AUTH_PATHS.some((p) => String(originalRequest.url || '').includes(p));

          if (!isAuthCall) {
            originalRequest._retry = true;

            if (isRefreshing) {
              // A refresh is already running (started by the request
              // interceptor, or by an earlier 401). Park this request until it
              // settles instead of firing a second /auth/refresh.
              return new Promise((resolve, reject) => {
                failedQueue.push({ resolve, reject });
              })
                .then((token) => {
                  originalRequest.headers.Authorization = `Bearer ${token}`;
                  return this.api(originalRequest);
                })
                .catch((err) => Promise.reject(err));
            }

            isRefreshing = true;
            try {
              const newToken = await refreshAccessToken();
              if (newToken) {
                processQueue(null, newToken);
                originalRequest.headers.Authorization = `Bearer ${newToken}`;
                return this.api(originalRequest);
              }
              processQueue(error, null);
            } catch (refreshErr) {
              processQueue(refreshErr, null);
            } finally {
              isRefreshing = false;
            }
          }

          // Terminal: no refresh token, or the refresh itself failed.
          // NOTE the `return` — without it this fell through into the 403
          // branch below and rejected with the ORIGINAL error after already
          // having torn the session down (issue #3, cause 2).
          endSessionAndRedirect(`HTTP 401 on ${originalRequest?.url ?? 'request'}`);
          return Promise.reject(error);
        }

        if (status === 403 && !isPublicPath) {
          const backendMsg = (error.response?.data as any)?.message;
          const msg = Array.isArray(backendMsg) ? backendMsg[0] : backendMsg;
          if (msg) {
            console.warn(`[API 403] ${msg}`);
          }
          // §30 — surface a clear, non-technical explanation. A shared key
          // collapses a burst of parallel 403s into one toast instead of a
          // stack. The user is deliberately NOT logged out: a 403 means
          // "not allowed to do that", not "session invalid".
          const friendly = describeForbiddenMessage(backendMsg);
          if (friendly) {
            message.warning({ content: friendly, duration: 4, key: 'api-403' });
          }
        }

        return Promise.reject(error);
      }
    );
  }

  /**
   * PROMPT #26 — call after a successful sign-in so the terminal-session guard
   * is armed again for the new session. See {@link markSessionActive}.
   */
  markSessionActive(): void {
    markSessionActive();
  }

  async get<T>(url: string, params?: any, config?: any): Promise<T> {
    const response = await this.api.get<T>(url, { params, ...config });
    return response.data;
  }

  /**
   * Fetch a protected binary asset (visitor photo, generated document, …)
   * through the same axios instance, so the Authorization header is attached.
   * Private files are therefore never requested through a bare `<img src>`,
   * which could not carry credentials. `silent` keeps the global loading
   * overlay from flashing while an image streams in.
   */
  async getFile<T = Blob>(url: string, params?: any): Promise<T> {
    const config: any = {
      params,
      responseType: 'blob',
      // `silent` is handled by our request interceptor (skips the global loader).
      silent: true,
    };
    const response = await this.api.get<T>(url, config);
    return response.data;
  }

  async post<T>(url: string, data?: any): Promise<T> {
    const response = await this.api.post<T>(url, data);
    return response.data;
  }

  async upload<T>(url: string, formData: FormData): Promise<T> {
    const response = await this.api.post<T>(url, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  }

  async put<T>(url: string, data?: any): Promise<T> {
    const response = await this.api.put<T>(url, data);
    return response.data;
  }

  async patch<T>(url: string, data?: any): Promise<T> {
    const response = await this.api.patch<T>(url, data);
    return response.data;
  }

  async delete<T>(url: string): Promise<T> {
    const response = await this.api.delete<T>(url);
    return response.data;
  }

  /**
   * PROMPT #26 (issue #3, cause 5) — revalidate the session when the user comes
   * back to a tab that has been left open.
   *
   * Without this, a laptop left open overnight keeps rendering whatever
   * permissions were cached at the last successful `/auth/me`, so:
   *  - an admin who revoked a role in the meantime still sees those buttons, and
   *    clicking one produces a 403 the user cannot act on, and
   *  - a user whose division access changed still sees stale division pickers.
   *
   * Listens to `visibilitychange` (tab switched back in), `focus` (window
   * refocused) and a slow interval (a tab that stays visible but idle). All
   * three funnel into ONE in-flight check, and the check is a no-op unless the
   * cached identity is actually stale, so it costs nothing in the common case.
   *
   * Deliberately NOT `window.location.reload()` — reloading is a band-aid that
   * throws away the user's open tabs, unsaved form state and scroll position,
   * and the brief explicitly rules it out.
   */
  startSessionWatchdog(options: { staleAfterMs?: number; intervalMs?: number } = {}): () => void {
    const staleAfterMs = options.staleAfterMs ?? 60_000;
    const intervalMs = options.intervalMs ?? 60_000;

    let checking = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    const revalidate = async () => {
      if (checking) return;
      const token = localStorage.getItem('token') || localStorage.getItem('access_token');
      if (!token) return; // not signed in — nothing to revalidate

      // Cheap gate: only do work when the token is near expiry or the cached
      // permission/division snapshot has aged out.
      const ts = Number(localStorage.getItem('erp_permissions_ts') || '0');
      const identityStale = !ts || Date.now() - ts > staleAfterMs;
      if (!identityStale && !isTokenExpiring(token, REFRESH_SKEW_SECONDS)) return;

      checking = true;
      try {
        if (isTokenExpiring(token, REFRESH_SKEW_SECONDS)) {
          const fresh = await refreshAccessToken();
          if (!fresh) {
            endSessionAndRedirect('access token expired while the tab was in the background');
            return;
          }
        } else {
          await syncIdentityAfterRefresh();
        }
      } finally {
        checking = false;
      }
    };

    const onVisible = () => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      void revalidate();
    };

    document?.addEventListener?.('visibilitychange', onVisible);
    window?.addEventListener?.('focus', onVisible);
    timer = setInterval(() => void revalidate(), intervalMs);

    return () => {
      document?.removeEventListener?.('visibilitychange', onVisible);
      window?.removeEventListener?.('focus', onVisible);
      if (timer) clearInterval(timer);
    };
  }
}

export const apiService = new ApiService();
export default apiService;
