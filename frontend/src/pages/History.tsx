import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { TrendingUp, Minus } from "lucide-react";
import { Card } from "../components/Card";
import { PageShell } from "../components/PageShell";
import { SectionHeading } from "../components/SectionHeading";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabaseClient";

type SessionRow = {
  id: string;
  created_at: string;
  images?: { storage_path: string; image_type: string }[];
  previewUrl?: string | null;
};

export function History() {
  const { user } = useAuth();
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const pageSize = 6;
  const [page, setPage] = useState(1);
  const prevUserIdRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    // Reset state when user changes
    if (prevUserIdRef.current !== user?.id) {
      setSessions([]);
      setHasMore(true);
      setPage(1);
      setLoading(true);
      prevUserIdRef.current = user?.id;
    }
  }, [user?.id]);

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
      } else {
        setLoadingMore(true);
      }

      const from = (page - 1) * pageSize;
      const to = page * pageSize - 1;

      const { data, error } = await supabase
        .from("sessions")
        .select("id, created_at, images (storage_path, image_type)")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .range(from, to);

      if (!active) return;

      if (error) {
        setSessions([]);
        setLoading(false);
        setLoadingMore(false);
        return;
      }

      const rows = (data as SessionRow[]) ?? [];

      const rowsWithPreviews = await Promise.all(
        rows.map(async (session) => {
          const previewPath = session.images?.[0]?.storage_path;
          if (!previewPath) {
            return { ...session, previewUrl: null };
          }

          const { data: signedUrlData, error: urlError } =
            await supabase.storage
              .from("bcd-images")
              .createSignedUrl(previewPath, 3600);

          return {
            ...session,
            previewUrl: urlError ? null : (signedUrlData?.signedUrl ?? null),
          };
        }),
      );

      setSessions((prev) =>
        page === 1 ? rowsWithPreviews : [...prev, ...rowsWithPreviews],
      );
      setHasMore(rows.length === pageSize);
      setLoading(false);
      setLoadingMore(false);
    };

    if (hasMore) {
      loadSessions();
    }

    return () => {
      active = false;
    };
  }, [user, hasMore, page, pageSize]);

  return (
    <PageShell className="space-y-10">
      <SectionHeading
        eyebrow="History"
        title="Your visual timeline"
        description="Browse previous sessions to stay aware of changes over time."
      />

      {loading ? (
        <Card>
          <p className="text-sm text-ink-700">Loading your sessions...</p>
        </Card>
      ) : sessions.length === 0 ? (
        <Card>
          <p className="text-sm text-ink-700">
            No sessions yet. Capture your first set of images to begin.
          </p>
        </Card>
      ) : (
        <div className="grid gap-6">
          {sessions.map((session, index) => {
            const dateLabel = new Date(session.created_at).toLocaleString();
            // Simple trend indicator based on session order (first session gets baseline tag)
            const isFirstSession = index === sessions.length - 1 && sessions.length > 0;
            const trendTag = isFirstSession 
              ? "Baseline" 
              : index === sessions.length - 2 
              ? "Latest" 
              : "Historical";
            const trendColor = trendTag === "Latest" ? "blue" : trendTag === "Baseline" ? "green" : "gray";

            return (
              <Link key={session.id} to={`/result/${session.id}`}>
                <Card className="flex flex-wrap gap-6 transition hover:shadow-lift">
                  <div className="h-28 w-40 overflow-hidden rounded-2xl bg-sand-100">
                    {session.previewUrl ? (
                      <img
                        src={session.previewUrl}
                        alt="Session preview"
                        className="h-full w-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-xs text-ink-700">
                        No preview
                      </div>
                    )}
                  </div>
                  <div className="space-y-2 flex-1">
                    <p className="text-xs uppercase tracking-[0.2em] text-ink-700">
                      Session
                    </p>
                    <h3 className="text-lg font-heading font-semibold text-ink-900">
                      {dateLabel}
                    </h3>
                    <div className="flex items-center gap-3">
                      <p className="text-sm text-ink-700">
                        Saved for comparison.
                      </p>
                      {/* Trend indicator badge */}
                      <div className={`flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold ${
                        trendColor === "blue" ? "bg-blue-100 text-blue-700" :
                        trendColor === "green" ? "bg-green-100 text-green-700" :
                        "bg-sand-100 text-ink-700"
                      }`}>
                        {trendTag === "Latest" && <TrendingUp className="h-3 w-3" />}
                        {trendTag === "Baseline" && <Minus className="h-3 w-3" />}
                        {trendTag}
                      </div>
                    </div>
                  </div>
                </Card>
              </Link>
            );
          })}
          {hasMore ? (
            <div className="flex justify-center">
              <button
                type="button"
                className="rounded-full border border-ink-700 px-5 py-2 text-sm font-semibold text-ink-900 hover:bg-sand-100"
                onClick={() => setPage((prev) => prev + 1)}
                disabled={loadingMore}
              >
                {loadingMore ? "Loading more..." : "Load more"}
              </button>
            </div>
          ) : null}
        </div>
      )}
    </PageShell>
  );
}
