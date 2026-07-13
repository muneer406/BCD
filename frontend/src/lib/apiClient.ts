/**
 * API client for backend requests
 * Uses VITE_API_URL environment variable to construct request paths
 */

const API_URL = import.meta.env.VITE_API_URL || "";

// In-memory cache for signed URLs (4-min TTL, under the 5-min server expiry)
const signedUrlCache = new Map<string, { data: unknown; expires: number }>();
const CACHE_TTL = 4 * 60 * 1000;

if (!import.meta.env.VITE_API_URL) {
  console.warn(
    "[apiClient] VITE_API_URL is not set. " +
      "API requests will fail until the VITE_API_URL environment variable is configured. " +
      "Set it in your .env file (e.g., VITE_API_URL=https://your-backend-url) and restart the dev server.",
  );
}

const API_PREFIX = "/api";

function getCached<T>(key: string): T | null {
  const entry = signedUrlCache.get(key);
  if (entry && Date.now() < entry.expires) return entry.data as T;
  signedUrlCache.delete(key);
  return null;
}

function setCache<T>(key: string, data: T): void {
  signedUrlCache.set(key, { data, expires: Date.now() + CACHE_TTL });
}

export const apiClient = {
  async request<T = unknown>(
    endpoint: string,
    token?: string,
    options?: RequestInit,
  ): Promise<T> {
    if (!API_URL) {
      throw new Error(
        "[apiClient] VITE_API_URL is not set. " +
          "The backend API URL must be configured via the VITE_API_URL environment variable " +
          "in your .env.local file.",
      );
    }
    const url = `${API_URL}${API_PREFIX}${endpoint}`;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    if (options?.headers) {
      Object.entries(options.headers as Record<string, string>).forEach(
        ([key, value]) => {
          headers[key] = value;
        },
      );
    }

    const response = await fetch(url, {
      ...options,
      headers,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.detail || `API error: ${response.statusText}`);
    }

    return response.json();
  },

  async getImagePreview(
    sessionId: string,
    imageType: string,
    token: string,
  ): Promise<{
    images: Array<{
      preview_url: string;
      expires_in: number;
      image_type: string;
    }>;
    count: number;
  }> {
    const cacheKey = `preview:${sessionId}:${imageType}`;
    const cached = getCached<{
      images: Array<{ preview_url: string; expires_in: number; image_type: string }>;
      count: number;
    }>(cacheKey);
    if (cached) return cached;
    const data = await this.request(`/image-preview/${sessionId}/${imageType}`, token);
    setCache(cacheKey, data);
    return data;
  },

  async getSessionInfo(
    sessionId: string,
    token: string,
  ): Promise<{
    session_id: string;
    is_first_session: boolean;
    is_current: boolean;
    total_sessions: number;
    created_at: string;
    previous_session_id: string | null;
  }> {
    const cacheKey = `info:${sessionId}`;
    const cached = getCached<{
      session_id: string; is_first_session: boolean; is_current: boolean;
      total_sessions: number; created_at: string; previous_session_id: string | null;
    }>(cacheKey);
    if (cached) return cached;
    const data = await this.request(`/session-info/${sessionId}`, token);
    setCache(cacheKey, data);
    return data;
  },

  async getSessionThumbnails(
    sessionId: string,
    token: string,
  ): Promise<{
    session_id: string;
    thumbnails: Record<string, string>;
    count: number;
  }> {
    return this.request(`/session-thumbnails/${sessionId}`, token);
  },

  async deleteSession(
    sessionId: string,
    token: string,
  ): Promise<{ success: boolean }> {
    return this.request(`/delete-session/${sessionId}`, token, {
      method: "DELETE",
    });
  },
};
