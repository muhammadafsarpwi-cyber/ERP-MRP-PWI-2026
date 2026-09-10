import axios, { AxiosInstance, AxiosResponse, AxiosError } from 'axios';
import { useLoadingStore } from '../store/loadingStore';

const API_BASE_URL =
  process.env.REACT_APP_API_URL || `http://${window.location.hostname}:3001/api/v1`;

export { API_BASE_URL };

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
      (config) => {
        activeRequests += 1;
        loading().begin();
        const token = localStorage.getItem('token');
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
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

    const completeRequest = () => {
      if (activeRequests > 0) {
        activeRequests -= 1;
        loading().end();
      }
    };

    this.api.interceptors.response.use(
      (response: AxiosResponse) => {
        completeRequest();
        return response;
      },
      async (error: AxiosError) => {
        completeRequest();
        const originalRequest = error.config as any;
        const status = error.response?.status;
        const currentPath = window.location.pathname;
        const publicPaths = ['/login', '/forgot-password', '/reset-password', '/auth/refresh'];

        if (status === 401 && !publicPaths.includes(currentPath) && originalRequest && !originalRequest._retry) {
          const refreshToken = localStorage.getItem('refresh_token');
          if (refreshToken) {
            if (isRefreshing) {
              return new Promise((resolve, reject) => {
                failedQueue.push({ resolve, reject });
              })
                .then((token) => {
                  originalRequest.headers.Authorization = `Bearer ${token}`;
                  return this.api(originalRequest);
                })
                .catch((err) => Promise.reject(err));
            }

            originalRequest._retry = true;
            isRefreshing = true;

            try {
              const res = await axios.post(`${API_BASE_URL}/auth/refresh`, { refreshToken });
              const newToken = res.data?.token;
              const newRefreshToken = res.data?.refreshToken;
              if (newToken) {
                localStorage.setItem('token', newToken);
                if (newRefreshToken) {
                  localStorage.setItem('refresh_token', newRefreshToken);
                }
                processQueue(null, newToken);
                originalRequest.headers.Authorization = `Bearer ${newToken}`;
                return this.api(originalRequest);
              }
            } catch (refreshErr) {
              processQueue(refreshErr, null);
              localStorage.removeItem('token');
              localStorage.removeItem('refresh_token');
              localStorage.removeItem('erp_user');
              window.location.href = '/login';
              return Promise.reject(refreshErr);
            } finally {
              isRefreshing = false;
            }
          }

          localStorage.removeItem('token');
          localStorage.removeItem('refresh_token');
          localStorage.removeItem('erp_user');
          window.location.href = '/login';
        }

        if (status === 403 && !publicPaths.includes(currentPath)) {
          const backendMsg = (error.response?.data as any)?.message;
          const msg = Array.isArray(backendMsg) ? backendMsg[0] : backendMsg;
          if (msg) {
            console.warn(`[API 403] ${msg}`);
          }
        }

        return Promise.reject(error);
      }
    );
  }

  async get<T>(url: string, params?: any): Promise<T> {
    const response = await this.api.get<T>(url, { params });
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
}

export const apiService = new ApiService();
export default apiService;
