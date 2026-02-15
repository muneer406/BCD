import { createContext, useContext, useMemo } from "react";

type SessionRow = {
  id: string;
  created_at: string;
  images?: { storage_path: string; image_type: string }[];
};

type CacheEntry = {
  data: SessionRow[];
  timestamp: number;
  page: number;
};

type SessionCacheContextValue = {
  getCachedSessions: (userId: string, page: number) => SessionRow[] | null;
  setCachedSessions: (userId: string, page: number, data: SessionRow[]) => void;
  clearUserCache: (userId: string) => void;
  clearAllCache: () => void;
};

const SessionCacheContext = createContext<SessionCacheContextValue | undefined>(
  undefined,
);

// In-memory cache with 5-minute TTL per user
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const cacheStore = new Map<string, Map<number, CacheEntry>>();

export function SessionCacheProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const value = useMemo<SessionCacheContextValue>(
    () => ({
      getCachedSessions: (userId: string, page: number) => {
        const userCache = cacheStore.get(userId);
        if (!userCache) return null;

        const entry = userCache.get(page);
        if (!entry) return null;

        // Check if cache is still valid
        const now = Date.now();
        if (now - entry.timestamp > CACHE_TTL) {
          userCache.delete(page);
          return null;
        }

        return entry.data;
      },

      setCachedSessions: (userId: string, page: number, data: SessionRow[]) => {
        if (!cacheStore.has(userId)) {
          cacheStore.set(userId, new Map());
        }

        cacheStore.get(userId)!.set(page, {
          data,
          timestamp: Date.now(),
          page,
        });
      },

      clearUserCache: (userId: string) => {
        cacheStore.delete(userId);
      },

      clearAllCache: () => {
        cacheStore.clear();
      },
    }),
    [],
  );

  return (
    <SessionCacheContext.Provider value={value}>
      {children}
    </SessionCacheContext.Provider>
  );
}

export function useSessionCache() {
  const context = useContext(SessionCacheContext);
  if (!context) {
    throw new Error("useSessionCache must be used within SessionCacheProvider");
  }
  return context;
}
