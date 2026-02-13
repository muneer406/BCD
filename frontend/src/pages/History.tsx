import { useEffect, useState } from "react";
import { Card } from "../components/Card";
import { PageShell } from "../components/PageShell";
import { SectionHeading } from "../components/SectionHeading";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabaseClient";

type SessionRow = {
  id: string;
  created_at: string;
  images?: { image_url: string; image_type: string }[];
};

export function History() {
  const { user } = useAuth();
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    const loadSessions = async () => {
      if (!user) {
        if (!active) return;
        setSessions([]);
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from("sessions")
        .select("id, created_at, images (image_url, image_type)")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (!active) return;

      if (error) {
        setSessions([]);
        setLoading(false);
        return;
      }

      setSessions((data as SessionRow[]) ?? []);
      setLoading(false);
    };

    loadSessions();

    return () => {
      active = false;
    };
  }, [user]);

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
          {sessions.map((session) => {
            const preview = session.images?.[0]?.image_url;
            const dateLabel = new Date(session.created_at).toLocaleString();

            return (
              <Card key={session.id} className="flex flex-wrap gap-6">
                <div className="h-28 w-40 overflow-hidden rounded-2xl bg-sand-100">
                  {preview ? (
                    <img
                      src={preview}
                      alt="Session preview"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-xs text-ink-700">
                      No preview
                    </div>
                  )}
                </div>
                <div className="space-y-2">
                  <p className="text-xs uppercase tracking-[0.2em] text-ink-700">
                    Session
                  </p>
                  <h3 className="text-lg font-heading font-semibold text-ink-900">
                    {dateLabel}
                  </h3>
                  <p className="text-sm text-ink-700">
                    Neutral status: saved for future comparison.
                  </p>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </PageShell>
  );
}
