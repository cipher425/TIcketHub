import axios from 'axios';

const baseURL = import.meta.env.VITE_API_URL || '/api/v1';

export const api = axios.create({ baseURL, withCredentials: true, timeout: 20_000 });

/**
 * The access token lives ONLY in memory (not localStorage), so an XSS bug cannot read a
 * long-lived credential. On page load we get a new one from the httpOnly refresh cookie.
 */
let accessToken = null;
let refreshPromise = null;
let onSessionExpired = () => {};

export const setAccessToken = (token) => {
  accessToken = token;
};
export const getAccessToken = () => accessToken;
export const setSessionExpiredHandler = (fn) => {
  onSessionExpired = fn;
};

export class ApiError extends Error {
  constructor(message, status, code, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function toApiError(err) {
  if (err instanceof ApiError) return err;
  const res = err?.response;
  const e = res?.data?.error;
  if (!res) return new ApiError('Network error - please check your connection', 0, 'NETWORK');
  return new ApiError(e?.message || 'Something went wrong', res.status, e?.code || 'UNKNOWN', e?.details);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Single-flight refresh: if 5 requests get a 401 at once, only ONE refresh call is made.
 * Important because refresh tokens rotate - a second call with the old token would look
 * like token theft to the server.
 */
export function refreshSession() {
  if (!refreshPromise) {
    refreshPromise = (async () => {
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const res = await axios.post(`${baseURL}/auth/refresh`, null, { withCredentials: true });
          setAccessToken(res.data.data.accessToken);
          return res.data.data;
        } catch (err) {
          const apiErr = toApiError(err);
          // Another tab rotated the cookie a moment ago: retry once with the new cookie.
          if (apiErr.code === 'REFRESH_RACE' && attempt === 0) {
            await sleep(400);
            continue;
          }
          setAccessToken(null);
          throw apiErr;
        }
      }
      throw new ApiError('Session expired', 401, 'REFRESH_INVALID');
    })().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

api.interceptors.request.use((config) => {
  if (accessToken) config.headers.Authorization = `Bearer ${accessToken}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  async (err) => {
    const original = err.config;
    const status = err.response?.status;
    const code = err.response?.data?.error?.code;
    const isAuthCall = original?.url?.includes('/auth/');
    if (status === 401 && !original._retry && !isAuthCall && (code === 'TOKEN_INVALID' || code === 'UNAUTHORIZED')) {
      original._retry = true;
      try {
        await refreshSession();
        return api(original);
      } catch {
        onSessionExpired();
      }
    }
    return Promise.reject(toApiError(err));
  }
);

/** Helpers returning the { data, meta } envelope. */
export const http = {
  get: (url, params, config) => api.get(url, { params, ...config }).then((r) => r.data),
  post: (url, body, config) => api.post(url, body, config).then((r) => r.data),
  patch: (url, body) => api.patch(url, body).then((r) => r.data),
  put: (url, body) => api.put(url, body).then((r) => r.data),
  delete: (url) => api.delete(url).then((r) => r.data),
};
