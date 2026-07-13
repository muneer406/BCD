/**
 * API client for backend requests
 * Uses VITE_API_URL environment variable to construct request paths
 */

if (!import.meta.env.VITE_API_URL) {
  console.warn(
    "[apiClient] VITE_API_URL is not set. " +
      "API requests will fail until the VITE_API_URL environment variable is configured. " +
      "Set it in your .env file (e.g., VITE_API_URL=https://your-backend-url) and restart the dev server.",
  );
}

const API_URL = import.meta.env.VITE_API_URL || "";
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
    if (!API_URL) {
      throw new Error(
        "[apiClient] VITE_API_URL is not set. " +
          "The backend API URL must be configured via the VITE_API_URL environment variable " +
          "before making API requests. Add it to your .env file and restart the dev server.",
      );
    }
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
   * Get signed URLs for all images of a specific angle
   * @param sessionId - Session UUID
   * @param imageType - angle type (front, left, right, up, down, raised)
   * @param token - JWT token for authentication
   */
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

  /**
   * Delete a session and all its data.
   * @param sessionId - Session UUID to delete
   * @param token - JWT token for authentication
   */
  async deleteSession(
    sessionId: string,
    token: string,
  ): Promise<{ success: boolean }> {
    return this.request(`/delete-session/${sessionId}`, token, {
      method: "DELETE",
    });
  },
};
