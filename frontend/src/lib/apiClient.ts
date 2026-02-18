/**
 * API client for backend requests
 * Uses VITE_API_URL environment variable to construct request paths
 */

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";
const API_PREFIX = "/api";

export const apiClient = {
  /**
   * Make an authenticated API request
   * @param endpoint - API endpoint path (e.g., "/image-preview/uuid/front")
   * @param options - Fetch options
   * @returns - Parsed JSON response
   */
  async request<T = unknown>(
    endpoint: string,
    token?: string,
    options?: RequestInit,
  ): Promise<T> {
    const url = `${API_URL}${API_PREFIX}${endpoint}`;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    // Merge with any additional headers from options
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

  /**
   * Get signed URL for an image preview
   * @param sessionId - Session UUID
   * @param imageType - angle type (front, left, right, up, down, raised)
   * @param token - JWT token for authentication
   */
  async getImagePreview(
    sessionId: string,
    imageType: string,
    token: string,
  ): Promise<{ preview_url: string; expires_in: number; image_type: string }> {
    return this.request(`/image-preview/${sessionId}/${imageType}`, token);
  },

  /**
   * Get session metadata and first-session status
   * @param sessionId - Session UUID
   * @param token - JWT token for authentication
   */
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
    return this.request(`/session-info/${sessionId}`, token);
  },

  /**
   * Get all image thumbnails for a session
   * More efficient than individual requests
   * @param sessionId - Session UUID
   * @param token - JWT token for authentication
   */
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
};
