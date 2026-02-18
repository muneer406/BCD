import { useEffect, useRef, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import {
  TrendingUp,
  Calendar,
  Camera,
  AlertCircle,
  Loader,
} from "lucide-react";
import { Card } from "../components/Card";
import { PageShell } from "../components/PageShell";
import { SectionHeading } from "../components/SectionHeading";
import { useAuth } from "../context/AuthContext";
import { useSessionCache } from "../context/SessionCacheContext";
import { supabase } from "../lib/supabaseClient";

type SessionRow = {
  id: string;
  created_at: string;
  images?: { storage_path: string; image_type: string }[];
};

type SessionWithThumbnail = SessionRow & {
  thumbnailUrl?: string;
  imageCount: number;
  sessionNumber: number;
};

export function History() {
  const { user } = useAuth();
  const { getCachedSessions, setCachedSessions, clearUserCache } =
    useSessionCache();
  const [sessions, setSessions] = useState<SessionWithThumbnail[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const pageSize = 6;
  const [page, setPage] = useState(1);
  const prevUserIdRef = useRef<string | undefined>(undefined);
  const [totalSessions, setTotalSessions] = useState(0);

  // Process session data - add metadata (no thumbnails for privacy)
  const processSessionsData = useCallback(
    async (
      rows: SessionRow[],
      totalCount: number,
    ): Promise<SessionWithThumbnail[]> => {
      return rows.map((session, index) => {
        const imageCount = session.images?.length ?? 0;
        // Sessions are ordered by most recent first, so calculate chronological number
        // sessionNumber = totalSessions - ((page - 1) * pageSize + index)
        const sessionNumber = totalCount - ((page - 1) * pageSize + index);

        return {
          ...session,
          thumbnailUrl: undefined, // Never show thumbnails for privacy
          imageCount,
          sessionNumber,
        };
      });
    },
    [page, pageSize],
  );

  useEffect(() => {
    // Reset pagination when user changes
    if (prevUserIdRef.current !== user?.id) {
      setSessions([]);
      setHasMore(true);
      setPage(1);
      setError(null);
      // Clear cache for old user
      if (prevUserIdRef.current) {
        clearUserCache(prevUserIdRef.current);
      }
      prevUserIdRef.current = user?.id;
    }
  }, [user?.id, clearUserCache]);

  useEffect(() => {
    let active = true;

    const loadSessions = async () => {
      if (!user) {
        if (!active) return;
        setSessions([]);
        setLoading(false);
        setLoadingMore(false);
        return;
      }

      const isInitialLoad = page === 1;
      if (isInitialLoad) {
        setLoading(true);
        setError(null);
      } else {
        setLoadingMore(true);
      }

      try {
        // Always fetch total count on first page (needed for session numbering)
        let currentTotal = totalSessions;
        if (page === 1 && !totalSessions) {
          const { count } = await supabase
            .from("sessions")
            .select("id", { count: "exact", head: true })
            .eq("user_id", user.id);
          if (!active) return;
          currentTotal = count ?? 0;
          setTotalSessions(currentTotal);
        }

        // Try to get from cache first
        const cachedData = getCachedSessions(user.id, page);
        if (cachedData) {
          if (!active) return;
          const processedData = await processSessionsData(
            cachedData as SessionRow[],
            currentTotal,
          );
          setSessions((prev) =>
            page === 1 ? processedData : [...prev, ...processedData],
          );
          setHasMore(cachedData.length === pageSize);
          setLoading(false);
          setLoadingMore(false);
          return;
        }

        const from = (page - 1) * pageSize;
        const to = page * pageSize - 1;

        const { data, error: queryError } = await supabase
          .from("sessions")
          .select("id, created_at, images (storage_path, image_type)")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .range(from, to);

        if (!active) return;

        if (queryError) {
          setError("Failed to load sessions. Please try again.");
          setSessions([]);
          setLoading(false);
          setLoadingMore(false);
          return;
        }

        const rows = (data as SessionRow[]) ?? [];

        // Cache the results
        if (rows.length > 0) {
          setCachedSessions(user.id, page, rows);
        }

        // Process sessions - add thumbnail and other metadata
        const processedData = await processSessionsData(rows, currentTotal);
        setSessions((prev) =>
          page === 1 ? processedData : [...prev, ...processedData],
        );
        setHasMore(rows.length === pageSize);
      } catch (err) {
        if (!active) return;
        const message =
          err instanceof Error ? err.message : "Failed to load sessions";
        setError(message);
      } finally {
        if (active) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
    };

    if (hasMore) {
      loadSessions();
    }

    return () => {
      active = false;
    };
  }, [
    user,
    hasMore,
    page,
    pageSize,
    getCachedSessions,
    setCachedSessions,
    totalSessions,
    processSessionsData,
  ]);

  if (loading) {
    return (
      <PageShell className="space-y-10">
        <SectionHeading
          eyebrow="History"
          title="Your visual timeline"
          description="Browse previous sessions to stay aware of changes over time."
        />
        <Card>
          <div className="flex items-center justify-center gap-2 text-sm text-ink-700">
            <Loader className="h-4 w-4 animate-spin" />
            Loading your sessions...
          </div>
        </Card>
      </PageShell>
    );
  }

  return (
    <PageShell className="space-y-10">
      <SectionHeading
        eyebrow="History"
        title="Your visual timeline"
        description="Browse previous sessions to stay aware of changes over time."
      />

      {error && (
        <div className="rounded-lg sm:rounded-2xl bg-red-50 p-4 border border-red-200">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm text-red-900">{error}</p>
            </div>
          </div>
        </div>
      )}

      {!error && sessions.length === 0 ? (
        <Card>
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <Camera className="h-8 w-8 text-sand-400 mb-3" />
            <p className="text-sm text-ink-700">
              No sessions yet. Capture your first set of images to begin.
            </p>
          </div>
        </Card>
      ) : (
        <div className="grid gap-6">
          {sessions.map((session) => {
            const dateLabel = new Date(session.created_at).toLocaleDateString(
              "en-US",
              {
                year: "numeric",
                month: "short",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              },
            );

            return (
              <Link key={session.id} to={`/result/${session.id}`}>
                <Card className="flex flex-col sm:flex-row gap-4 sm:gap-6 transition hover:shadow-lg">
                  {/* Thumbnail */}
                  <div className="h-24 w-24 sm:h-28 sm:w-40 flex-shrink-0 overflow-hidden rounded-xl sm:rounded-2xl bg-sand-100 flex items-center justify-center">
                    {session.thumbnailUrl ? (
                      <img
                        src={session.thumbnailUrl}
                        alt="Session thumbnail"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <Camera className="h-10 w-10 sm:h-12 sm:w-12 text-sand-400" />
                    )}
                  </div>

                  {/* Session info */}
                  <div className="space-y-2 flex-1 min-w-0">
                    <p className="text-xs uppercase tracking-[0.15em] sm:tracking-[0.2em] text-ink-700">
                      Session {session.sessionNumber}
                    </p>
                    <h3 className="text-base sm:text-lg font-heading font-semibold text-ink-900 break-words flex items-center gap-2">
                      <Calendar className="h-4 w-4 flex-shrink-0" />
                      {dateLabel}
                    </h3>
                    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-3 pt-1">
                      <p className="text-xs sm:text-sm text-ink-700">
                        {session.imageCount} image
                        {session.imageCount !== 1 ? "s" : ""} captured
                      </p>
                      <div className="flex items-center gap-1 rounded-full px-2 sm:px-3 py-0.5 sm:py-1 text-xs font-semibold bg-blue-100 text-blue-700">
                        <TrendingUp className="h-3 w-3" />
                        View results
                      </div>
                    </div>
                  </div>
                </Card>
              </Link>
            );
          })}

          {/* Load more button */}
          {hasMore && (
            <div className="flex justify-center">
              <button
                type="button"
                className="rounded-full border border-ink-700 px-5 py-2 text-sm font-semibold text-ink-900 hover:bg-sand-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                onClick={() => setPage((prev) => prev + 1)}
                disabled={loadingMore}
              >
                {loadingMore && <Loader className="h-4 w-4 animate-spin" />}
                {loadingMore ? "Loading more..." : "Load more"}
              </button>
            </div>
          )}
        </div>
      )}
    </PageShell>
  );
}
