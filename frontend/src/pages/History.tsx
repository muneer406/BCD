import { useEffect, useRef, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  TrendingUp,
  Calendar,
  Camera,
  AlertCircle,
  Loader,
  Sparkles,
  TimerReset,
} from "lucide-react";
import { Card } from "../components/Card";
import { PageShell } from "../components/PageShell";
import { SectionHeading } from "../components/SectionHeading";
import { useAuth } from "../context/AuthContext";
import { useSessionCache } from "../context/SessionCacheContext";
import { supabase } from "../lib/supabaseClient";
import { ROYAL_RESULT_IDS } from "../lib/constants";

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
    (rows: SessionRow[], totalCount: number): SessionWithThumbnail[] => {
      return rows.map((session, index) => {
        const imageCount = session.images?.length ?? 0;

        // Sessions are ordered by most recent first, so calculate chronological number
        // sessionNumber = totalSessions - ((page - 1) * pageSize + index)
        const sessionNumber =
          totalCount > 0 ? totalCount - ((page - 1) * pageSize + index) : 0;

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
        // Try to get from cache first
        const cachedData = getCachedSessions(user.id, page);
        if (cachedData) {
          if (!active) return;
          const processedData = processSessionsData(
            cachedData as SessionRow[],
            totalSessions,
          );
          setSessions((prev) =>
            page === 1 ? processedData : [...prev, ...processedData],
          );
          setHasMore(cachedData.length === pageSize);
          setLoading(false);
          setLoadingMore(false);
          if (page > 1 || totalSessions > 0) {
            return;
          }
        }

        const from = (page - 1) * pageSize;
        const to = page * pageSize - 1;
        const dataPromise = supabase
          .from("sessions")
          .select("id, created_at, images (storage_path, image_type)")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .range(from, to);
        const countPromise =
          page === 1 && totalSessions === 0
            ? supabase
                .from("sessions")
                .select("id", { count: "exact", head: true })
                .eq("user_id", user.id)
            : Promise.resolve({ count: totalSessions, error: null });

        const [{ data, error: queryError }, { count, error: countError }] =
          await Promise.all([dataPromise, countPromise]);

        if (!active) return;

        if (queryError) {
          setError("Failed to load sessions. Please try again.");
          setSessions([]);
          setLoading(false);
          setLoadingMore(false);
          return;
        }

        if (!countError && typeof count === "number") {
          setTotalSessions(count);
        }

        const rows = (data as SessionRow[]) ?? [];

        // Cache the results
        if (rows.length > 0) {
          setCachedSessions(user.id, page, rows);
        }

        // Process sessions - add thumbnail and other metadata
        const processedData = processSessionsData(rows, count ?? totalSessions);
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
        <div className="space-y-4">
          <Card className="relative overflow-hidden border-tide-200 bg-[linear-gradient(135deg,rgba(232,242,247,0.96),rgba(248,244,238,0.94))]">
            <div className="pointer-events-none absolute -right-10 top-0 h-24 w-24 rounded-full bg-tide-200/50 blur-3xl" />
            <div className="pointer-events-none absolute bottom-0 left-8 h-16 w-16 rounded-full bg-indigo-100/60 blur-2xl" />
            <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-3">
                <div className="inline-flex items-center gap-2 rounded-full border border-white/70 bg-white/70 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-tide-800">
                  <Sparkles className="h-3.5 w-3.5" />
                  Building timeline
                </div>
                <div>
                  <h3 className="text-lg font-heading font-semibold text-ink-900">
                    Arranging your recent sessions
                  </h3>
                  <p className="mt-1 max-w-2xl text-sm text-ink-700">
                    We&apos;re pulling your latest captures and organizing them
                    into a clean visual timeline.
                  </p>
                </div>
              </div>
              <div className="inline-flex items-center gap-2 self-start rounded-full border border-indigo-200 bg-white/80 px-4 py-2 text-sm font-semibold text-indigo-900 shadow-sm">
                <TimerReset className="h-4 w-4" />
                <Loader className="h-4 w-4 animate-spin" />
                Loading sessions
              </div>
            </div>
          </Card>

          <div className="grid gap-4">
            {[0, 1, 2].map((item) => (
              <Card
                key={item}
                className="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-6"
              >
                <div className="h-24 w-24 animate-pulse rounded-2xl bg-sand-200 sm:h-28 sm:w-40" />
                <div className="flex-1 space-y-3">
                  <div className="h-3 w-24 animate-pulse rounded-full bg-sand-200" />
                  <div className="h-6 w-full max-w-sm animate-pulse rounded-full bg-sand-200" />
                  <div className="flex flex-wrap gap-2">
                    <div className="h-8 w-28 animate-pulse rounded-full bg-sand-200" />
                    <div className="h-8 w-32 animate-pulse rounded-full bg-sand-200" />
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
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

            const isRoyal = ROYAL_RESULT_IDS.includes(session.id);
            if (isRoyal) {
              return (
                <Link key={session.id} to={`/result/${session.id}`} className="block relative group my-8">
                  {/* Glowing aura */}
                  <div className="absolute inset-0 bg-gradient-to-r from-amber-300 via-pink-300 to-amber-300 rounded-lg transform skew-x-[-2deg] scale-[1.02] group-hover:scale-[1.05] transition duration-500 opacity-60 blur-md"></div>
                  
                  {/* Main Royal Container */}
                  <div className="relative flex flex-col sm:flex-row gap-6 sm:gap-10 transition duration-500 royal-pattern royal-border royal-clip p-6 sm:p-8">
                    
                    {/* Decorative Corner Ornaments */}
                    <div className="absolute top-2 left-2 w-4 h-4 border-t-2 border-l-2 border-amber-500 opacity-80"></div>
                    <div className="absolute top-2 right-2 w-4 h-4 border-t-2 border-r-2 border-amber-500 opacity-80"></div>
                    <div className="absolute bottom-2 left-2 w-4 h-4 border-b-2 border-l-2 border-amber-500 opacity-80"></div>
                    <div className="absolute bottom-2 right-2 w-4 h-4 border-b-2 border-r-2 border-amber-500 opacity-80"></div>

                    {/* Thumbnail */}
                    <div className="relative h-32 w-32 sm:h-40 sm:w-40 flex-shrink-0 mx-auto sm:mx-0 group-hover:scale-105 transition duration-500">
                      {/* Hexagon/Diamond clip */}
                      <div className="absolute inset-0 bg-gradient-to-br from-amber-300 to-amber-600 royal-image-clip transform scale-105 opacity-50 blur-sm"></div>
                      <div className="relative w-full h-full flex items-center justify-center bg-gradient-to-br from-amber-50 to-pink-50 royal-image-clip border-[3px] border-amber-400 z-10 shadow-inner">
                        {session.thumbnailUrl ? (
                          <img
                            src={session.thumbnailUrl}
                            alt="Session thumbnail"
                            className="w-[96%] h-[96%] object-cover royal-image-clip"
                          />
                        ) : (
                          <Camera className="h-12 w-12 sm:h-16 sm:w-16 text-amber-500/80 drop-shadow-md" />
                        )}
                      </div>
                    </div>

                    {/* Session info */}
                    <div className="space-y-4 flex-1 min-w-0 z-10 flex flex-col justify-center text-center sm:text-left relative">
                      {/* Faint background crest */}
                      <div className="absolute -right-8 -top-8 opacity-[0.08] pointer-events-none transform rotate-12 scale-150">
                        <Sparkles className="w-full h-full text-amber-700" strokeWidth={0.5} />
                      </div>
                      
                      <div>
                        <p className="text-xs sm:text-sm font-bold uppercase tracking-[0.3em] royal-gradient-text drop-shadow-sm mb-1">
                          {session.sessionNumber > 0
                            ? `Session ${session.sessionNumber}`
                            : "Recent session"}
                        </p>
                        <h3 className="text-xl sm:text-3xl font-heading font-extrabold text-amber-900 break-words flex items-center justify-center sm:justify-start gap-3 drop-shadow-sm">
                          <Calendar className="h-5 w-5 sm:h-7 sm:w-7 flex-shrink-0 text-amber-600" />
                          {dateLabel}
                        </h3>
                      </div>
                      
                      <div className="flex flex-col sm:flex-row items-center sm:items-start gap-4 pt-2">
                        <p className="text-sm sm:text-base text-amber-950/80 font-medium tracking-wide">
                          {session.imageCount} image
                          {session.imageCount !== 1 ? "s" : ""} captured
                        </p>
                        <div className="flex items-center gap-2 rounded-none border border-amber-400 bg-amber-50/70 px-5 py-2 text-xs font-bold uppercase tracking-wider text-amber-900 shadow-[inset_0_0_15px_rgba(251,191,36,0.2)] hover:bg-amber-100/80 hover:shadow-[0_0_15px_rgba(251,191,36,0.4)] transition duration-300">
                          <Sparkles className="h-4 w-4" />
                          View details
                          <ArrowRight className="h-4 w-4" />
                        </div>
                      </div>
                    </div>
                  </div>
                </Link>
              );
            }

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
                      {session.sessionNumber > 0
                        ? `Session ${session.sessionNumber}`
                        : "Recent session"}
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
                        <ArrowRight className="h-3 w-3" />
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
