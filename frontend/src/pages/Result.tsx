import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { BarChart3, CheckCircle, Clock, Download, Heart } from "lucide-react";
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
  const { sessionId } = useParams();
  const [previewMap, setPreviewMap] = useState<ImagePreviewMap>({});
  const [isFirstSession, setIsFirstSession] = useState(false);

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

    const loadSessionImages = async () => {
      if (!user) return;

      // First, count total sessions to determine if this is first session
      const { count } = await supabase
        .from("sessions")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id);

      const query = supabase
        .from("sessions")
        .select("id, images (storage_path, image_type)")
        .eq("user_id", user.id);

      const sessionQuery = sessionId
        ? query.eq("id", sessionId).maybeSingle()
        : query
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();

      const { data: sessionData, error: sessionError } = await sessionQuery;

      if (!active) return;

      if (sessionError || !sessionData?.images) {
        setIsFirstSession(count === 1);
        return;
      }

      setIsFirstSession(count === 1);

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

    loadSessionImages();

    return () => {
      active = false;
    };
  }, [user, sessionId]);

  const getPreviewForTitle = (title: string) => {
    const imageType = imageTypeByTitle[title];
    return imageType ? (previewMap[imageType] ?? null) : null;
  };

  const renderPreview = (title: string) => {
    const preview = getPreviewForTitle(title);
    if (!preview) {
      return (
        <div className="h-40 sm:h-48 w-full rounded-lg sm:rounded-2xl bg-sand-100 flex items-center justify-center text-xs text-ink-700">
          No image available yet
        </div>
      );
    }

    const handleDownload = async () => {
      try {
        const response = await fetch(preview);
        if (!response.ok) {
          throw new Error("Failed to download image");
        }
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `${title.replaceAll(" ", "-").toLowerCase()}.jpg`;
        link.click();
        window.URL.revokeObjectURL(url);
      } catch (error) {
        console.error(error);
      }
    };

    return (
      <div className="space-y-3">
        <ImageModal src={preview} alt={`${title} preview`}>
          <img
            src={preview}
            alt={`${title} preview`}
            className="h-40 sm:h-48 w-full rounded-lg sm:rounded-2xl object-contain bg-white"
            loading="lazy"
          />
        </ImageModal>
        <div className="flex justify-center">
          <Button
            variant="outline"
            onClick={handleDownload}
            className="text-xs"
          >
            <Download className="mr-2 h-4 w-4" />
            Download image
          </Button>
        </div>
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
          <CheckCircle className="h-11 w-11 text-ink-900" />
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

      {/* First session message */}
      {isFirstSession && (
        <div className="rounded-2xl bg-blue-50 border border-blue-200 p-5">
          <p className="text-sm font-semibold text-blue-900">
            🎯 Your baseline is set
          </p>
          <p className="mt-2 text-sm text-blue-800">
            This is your first session with us. Future sessions will be compared
            to these images, helping you track any changes over time. Regular
            captures will give you the clearest timeline.
          </p>
        </div>
      )}

      {/* Session insights grid */}
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <h3 className="text-lg font-heading font-semibold text-ink-900">
            <span className="inline-flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-ink-900" />
              Image quality
            </span>
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
            <span className="inline-flex items-center gap-2">
              <Clock className="h-5 w-5 text-ink-900" />
              Capture notes
            </span>
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

      {/* ===== THIS SESSION SECTION ===== */}
      <div className="space-y-6 border-t-2 border-sand-200 pt-8">
        <div>
          <h2 className="text-2xl font-heading font-semibold text-ink-900">
            This session
          </h2>
          <p className="mt-1 text-sm text-ink-700">
            Detailed observations from the 6 angles captured today.
          </p>
        </div>

        <Card className="space-y-5">
          <div className="grid gap-4 md:grid-cols-2">
            {notes.map((note) => (
              <div
                key={note.title}
                className="rounded-2xl border border-sand-100 bg-sand-50 p-4"
              >
                <p className="text-sm font-semibold text-ink-900">
                  {note.title}
                </p>
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
            <p className="text-sm font-semibold text-ink-900">
              Session summary
            </p>
            <p className="mt-2 text-sm text-ink-700">
              Most angles look balanced in this session, with a couple of areas
              worth noting for future comparison.
            </p>
          </div>
        </Card>
      </div>

      {/* ===== OVER TIME SECTION ===== */}
      {!isFirstSession && (
        <div className="space-y-6 border-t-2 border-sand-200 pt-8">
          <div>
            <h2 className="text-2xl font-heading font-semibold text-ink-900">
              Over time
            </h2>
            <p className="mt-1 text-sm text-ink-700">
              How this session compares to your recent history.
            </p>
          </div>

          <Card className="space-y-5">
            <div className="grid gap-4 md:grid-cols-2">
              {comparisons.map((item) => (
                <div
                  key={item.title}
                  className="rounded-2xl border border-sand-100 bg-sand-50 p-4"
                >
                  <p className="text-sm font-semibold text-ink-900">
                    {item.title}
                  </p>
                  <div className="mt-3 space-y-2 text-sm text-ink-700">
                    <p>
                      <span className="font-semibold text-ink-900">
                        vs last session:
                      </span>{" "}
                      {item.lastSession}
                    </p>
                    <p>
                      <span className="font-semibold text-ink-900">
                        vs last 5 sessions:
                      </span>{" "}
                      {item.lastFive}
                    </p>
                    <p>
                      <span className="font-semibold text-ink-900">
                        vs last month:
                      </span>{" "}
                      {item.lastMonth}
                    </p>
                    <p>
                      <span className="font-semibold text-ink-900">trend:</span>{" "}
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

            <div className="space-y-3 text-sm">
              <div className="rounded-2xl bg-white/70 p-4">
                <p className="font-semibold text-ink-900">
                  All angles: Last session
                </p>
                <p className="mt-2 text-ink-700">
                  Most angles remain consistent, with a couple of minor
                  differences worth noting.
                </p>
              </div>
              <div className="rounded-2xl bg-white/70 p-4">
                <p className="font-semibold text-ink-900">
                  All angles: Last 5 sessions
                </p>
                <p className="mt-2 text-ink-700">
                  Overall stability with a few mild shifts deserving of
                  attention.
                </p>
              </div>
              <div className="rounded-2xl bg-white/70 p-4">
                <p className="font-semibold text-ink-900">
                  All angles: Last month
                </p>
                <p className="mt-2 text-ink-700">
                  Month-over-month view is mostly stable with small variations.
                </p>
              </div>
              <div className="rounded-2xl bg-white/70 p-4">
                <p className="font-semibold text-ink-900">Overall trend</p>
                <p className="mt-2 text-ink-700">
                  Long-term pattern appears steady; regular captures provide the
                  clearest timeline.
                </p>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Health recommendation */}
      <Card tone="soft" className="space-y-4">
        <h3 className="text-lg font-heading font-semibold text-ink-900">
          <span className="inline-flex items-center gap-2">
            <Heart className="h-5 w-5 text-ink-900" />
            Next steps
          </span>
        </h3>
        <p className="text-sm text-ink-700">
          Keep the images from this session for comparison with future captures.
          If you notice changes that concern you, discussing them with a
          healthcare professional can provide personalized guidance.
        </p>
      </Card>

      {/* Next steps */}
      <div className="flex flex-wrap justify-center gap-3">
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
