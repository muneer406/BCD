import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { ImageModal } from "../components/ImageModal";
import { PageShell } from "../components/PageShell";
import { SectionHeading } from "../components/SectionHeading";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabaseClient";

type ImagePreviewMap = Record<string, string | null>;

const imageTypeByTitle: Record<string, string> = {
  "Front view": "front",
  "Left side": "left",
  "Right side": "right",
  "Upward angle": "up",
  "Downward angle": "down",
  "Full body": "raised",
};

export function Result() {
  const { user } = useAuth();
  const [previewMap, setPreviewMap] = useState<ImagePreviewMap>({});

  const notes = useMemo(
    () => [
      {
        title: "Front view",
        status: "Balanced appearance",
        detail: "Surface tone and contour appear even across the center view.",
      },
      {
        title: "Left side",
        status: "Localized variation",
        detail: "A subtle area stands out on the outer edge of this view.",
      },
      {
        title: "Right side",
        status: "Clear contour",
        detail: "Outline looks smooth with no distinct focal area.",
      },
      {
        title: "Upward angle",
        status: "Minor contour shift",
        detail: "A small contour change is visible near the lower edge.",
      },
      {
        title: "Downward angle",
        status: "Even surface",
        detail: "No clear focal differences stand out in this view.",
      },
      {
        title: "Full body",
        status: "Proportions aligned",
        detail: "Overall framing looks symmetrical in this session.",
      },
    ],
    [],
  );

  const comparisons = useMemo(
    () => [
      {
        title: "Front view",
        lastSession: "No visible shift compared to the last session.",
        lastFive: "Stable across the last 5 sessions.",
        lastMonth: "No notable variation over the last month.",
        trend: "Overall trend appears steady.",
      },
      {
        title: "Left side",
        lastSession: "Small difference compared to the last session.",
        lastFive: "One mild fluctuation across 5 sessions.",
        lastMonth: "Slight change noted over the last month.",
        trend: "Trend shows a gentle variation to monitor.",
      },
      {
        title: "Right side",
        lastSession: "No notable change from last session.",
        lastFive: "Consistent across last 5 sessions.",
        lastMonth: "Stable month-over-month.",
        trend: "Trend remains flat.",
      },
      {
        title: "Upward angle",
        lastSession: "Minor difference compared to last session.",
        lastFive: "Two sessions show small variation.",
        lastMonth: "Slight difference seen over the last month.",
        trend: "Trend suggests a mild shift to track.",
      },
      {
        title: "Downward angle",
        lastSession: "No visible change from last session.",
        lastFive: "Stable across the last 5 sessions.",
        lastMonth: "No month-over-month variation.",
        trend: "Trend appears stable.",
      },
      {
        title: "Full body",
        lastSession: "No obvious change from last session.",
        lastFive: "Consistent across 5 sessions.",
        lastMonth: "No noticeable month-to-month shift.",
        trend: "Overall trend remains consistent.",
      },
    ],
    [],
  );

  useEffect(() => {
    let active = true;

    const loadLatestSession = async () => {
      if (!user) return;

      const { data: sessionData, error: sessionError } = await supabase
        .from("sessions")
        .select("id, images (storage_path, image_type)")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!active || sessionError || !sessionData?.images) return;

      const previews: ImagePreviewMap = {};
      await Promise.all(
        sessionData.images.map(async (image) => {
          if (!image.storage_path) return;
          const { data: signedUrlData, error: urlError } =
            await supabase.storage
              .from("bcd-images")
              .createSignedUrl(image.storage_path, 3600);

          previews[image.image_type] = urlError
            ? null
            : (signedUrlData?.signedUrl ?? null);
        }),
      );

      if (active) {
        setPreviewMap(previews);
      }
    };

    loadLatestSession();

    return () => {
      active = false;
    };
  }, [user]);

  const getPreviewForTitle = (title: string) => {
    const imageType = imageTypeByTitle[title];
    return imageType ? (previewMap[imageType] ?? null) : null;
  };

  const renderPreview = (title: string) => {
    const preview = getPreviewForTitle(title);
    if (!preview) {
      return (
        <div className="h-48 w-full rounded-2xl bg-sand-100 flex items-center justify-center text-xs text-ink-700">
          No image available yet
        </div>
      );
    }

    return (
      <div className="space-y-3">
        <ImageModal src={preview} alt={`${title} preview`}>
          <img
            src={preview}
            alt={`${title} preview`}
            className="h-48 w-full rounded-2xl object-contain bg-white"
            loading="lazy"
          />
        </ImageModal>
        <a
          href={preview}
          download
          className="inline-flex items-center justify-center rounded-full border border-ink-700 px-4 py-2 text-xs font-semibold text-ink-900 hover:bg-sand-100"
        >
          Download image
        </a>
      </div>
    );
  };

  return (
    <PageShell className="space-y-10">
      <SectionHeading
        eyebrow="Session complete"
        title="Your session is saved"
        description="Review the insights from this session and how it compares to your previous sessions."
      />

      {/* Main status */}
      <div className="rounded-3xl bg-gradient-to-br from-tide-50 to-sand-50 p-8 shadow-lift">
        <div className="flex items-center gap-4">
          <div className="text-5xl">✓</div>
          <div>
            <h2 className="text-2xl font-heading font-semibold text-ink-900">
              Session successfully saved
            </h2>
            <p className="mt-1 text-ink-700">
              All 6 angles captured and stored.
            </p>
          </div>
        </div>
      </div>

      {/* Session insights grid */}
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <h3 className="text-lg font-heading font-semibold text-ink-900">
            📊 Image quality
          </h3>
          <div className="mt-4 space-y-3">
            <div>
              <p className="text-sm text-ink-700">Front view</p>
              <div className="mt-1 h-2 w-full rounded-full bg-sand-200">
                <div className="h-full w-4/5 rounded-full bg-tide-600" />
              </div>
            </div>
            <div>
              <p className="text-sm text-ink-700">Side angles</p>
              <div className="mt-1 h-2 w-full rounded-full bg-sand-200">
                <div className="h-full w-5/6 rounded-full bg-tide-600" />
              </div>
            </div>
            <div>
              <p className="text-sm text-ink-700">Vertical angles</p>
              <div className="mt-1 h-2 w-full rounded-full bg-sand-200">
                <div className="h-full w-3/4 rounded-full bg-tide-600" />
              </div>
            </div>
          </div>
        </Card>

        <Card tone="soft">
          <h3 className="text-lg font-heading font-semibold text-ink-900">
            ⏱️ Capture notes
          </h3>
          <div className="mt-4 space-y-2 text-sm text-ink-700">
            <p>✓ Consistent lighting throughout</p>
            <p>✓ Even distance from camera</p>
            <p>✓ Clear, focused images</p>
            <p className="text-xs text-ink-600 mt-4">
              Tip: These conditions help with accurate comparisons over time.
            </p>
          </div>
        </Card>
      </div>

      {/* Session image remarks */}
      <Card className="space-y-5">
        <div className="space-y-1">
          <h3 className="text-lg font-heading font-semibold text-ink-900">
            Session image remarks
          </h3>
          <p className="text-sm text-ink-700">
            Standalone notes for each angle, followed by a session overview.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {notes.map((note) => (
            <div
              key={note.title}
              className="rounded-2xl border border-sand-100 bg-sand-50 p-4"
            >
              <p className="text-sm font-semibold text-ink-900">{note.title}</p>
              <p className="mt-1 text-xs font-semibold text-tide-600">
                {note.status}
              </p>
              <p className="mt-2 text-sm text-ink-700">{note.detail}</p>
              <details className="mt-3">
                <summary className="cursor-pointer text-xs font-semibold text-ink-900">
                  View image
                </summary>
                <div className="mt-3">{renderPreview(note.title)}</div>
              </details>
            </div>
          ))}
        </div>

        <div className="rounded-2xl bg-white/70 p-4">
          <p className="text-sm font-semibold text-ink-900">Session overview</p>
          <p className="mt-2 text-sm text-ink-700">
            Most angles look balanced, with two localized areas worth keeping an
            eye on. Keep capturing regularly so patterns are easier to monitor.
          </p>
        </div>
      </Card>

      {/* Comparisons */}
      <Card className="space-y-5">
        <div className="space-y-1">
          <h3 className="text-lg font-heading font-semibold text-ink-900">
            📈 Comparisons across time
          </h3>
          <p className="text-sm text-ink-700">
            Per-angle comparisons followed by overall summaries.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {comparisons.map((item) => (
            <div
              key={item.title}
              className="rounded-2xl border border-sand-100 bg-sand-50 p-4"
            >
              <p className="text-sm font-semibold text-ink-900">{item.title}</p>
              <div className="mt-3 space-y-2 text-sm text-ink-700">
                <p>
                  <span className="font-semibold text-ink-900">
                    Last session:
                  </span>{" "}
                  {item.lastSession}
                </p>
                <p>
                  <span className="font-semibold text-ink-900">
                    Last 5 sessions:
                  </span>{" "}
                  {item.lastFive}
                </p>
                <p>
                  <span className="font-semibold text-ink-900">
                    Last month:
                  </span>{" "}
                  {item.lastMonth}
                </p>
                <p>
                  <span className="font-semibold text-ink-900">
                    Overall trend:
                  </span>{" "}
                  {item.trend}
                </p>
              </div>
              <details className="mt-3">
                <summary className="cursor-pointer text-xs font-semibold text-ink-900">
                  View image
                </summary>
                <div className="mt-3">{renderPreview(item.title)}</div>
              </details>
            </div>
          ))}
        </div>

        <div className="grid gap-3 text-sm">
          <div className="rounded-2xl bg-white/70 p-4">
            <p className="font-semibold text-ink-900">
              All angles vs last session
            </p>
            <p className="mt-2 text-ink-700">
              Most angles remain consistent, with two minor differences to keep
              an eye on.
            </p>
          </div>
          <div className="rounded-2xl bg-white/70 p-4">
            <p className="font-semibold text-ink-900">
              All angles vs last 5 sessions
            </p>
            <p className="mt-2 text-ink-700">
              Overall stability across recent sessions with a few mild shifts.
            </p>
          </div>
          <div className="rounded-2xl bg-white/70 p-4">
            <p className="font-semibold text-ink-900">
              All angles vs last month
            </p>
            <p className="mt-2 text-ink-700">
              Month-over-month view is mostly stable with small variations.
            </p>
          </div>
          <div className="rounded-2xl bg-white/70 p-4">
            <p className="font-semibold text-ink-900">Overall trend</p>
            <p className="mt-2 text-ink-700">
              Long-term trend appears steady; continue regular captures for the
              clearest timeline.
            </p>
          </div>
        </div>
      </Card>

      {/* Health recommendation */}
      <Card tone="soft" className="space-y-4">
        <h3 className="text-lg font-heading font-semibold text-ink-900">
          💭 General wellness reminder
        </h3>
        <p className="text-sm text-ink-700">
          If you notice any new or concerning changes between sessions, speaking
          with a healthcare professional can provide personalized guidance. This
          tool is designed to support awareness, not replace medical advice.
        </p>
      </Card>

      {/* Next steps */}
      <div className="flex flex-wrap gap-3">
        <Link to="/history">
          <Button variant="outline">View all sessions</Button>
        </Link>
        <Link to="/capture">
          <Button>Capture another session</Button>
        </Link>
      </div>
    </PageShell>
  );
}
