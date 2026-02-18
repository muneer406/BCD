import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  CheckCircle,
  Download,
  Heart,
  AlertCircle,
  Loader,
} from "lucide-react";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { ImageModal } from "../components/ImageModal";
import { PageShell } from "../components/PageShell";
import { SectionHeading } from "../components/SectionHeading";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabaseClient";
import { apiClient } from "../lib/apiClient";

type ImagePreviewMap = Record<string, string | null>;

type AnalysisResponse = {
  success: boolean;
  data?: {
    session_id: string;
    session_analysis?: {
      per_angle: Array<{
        angle_type: string;
        change_score: number;
        summary: string;
      }>;
      overall_summary: string;
      overall_change_score: number;
    };
    scores?: {
      change_score: number;
    };
  };
  error?: string;
};

type ComparisonResponse = {
  success: boolean;
  data?: {
    per_angle: Array<{
      angle_type: string;
      delta: number;
    }>;
    overall_delta: number;
    overall_trend: string;
    comparison_method: string;
  };
  error?: string;
};

const imageTypeByTitle: Record<string, string> = {
  "Front view": "front",
  "Left side": "left",
  "Right side": "right",
  "Slight upward angle": "up",
  "Slight downward angle": "down",
  "Full body view": "raised",
};

// Canonical display order matching the capture page
const captureOrder = ["front", "left", "right", "up", "down", "raised"];

// Skeleton shimmer component
function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div className={`animate-pulse rounded-lg bg-sand-200 ${className}`} />
  );
}

export function Result() {
  const { user } = useAuth();
  const { sessionId } = useParams();
  const [previewMap, setPreviewMap] = useState<ImagePreviewMap>({});
  const [imagesLoading, setImagesLoading] = useState(true);
  const [isFirstSession, setIsFirstSession] = useState(false);
  const [analysisData, setAnalysisData] = useState<AnalysisResponse | null>(
    null,
  );
  const [analysisLoading, setAnalysisLoading] = useState(true);
  const [comparisonData, setComparisonData] =
    useState<ComparisonResponse | null>(null);
  const [comparisonLoading, setComparisonLoading] = useState(false);
  const [loading, setLoading] = useState(true); // only for session-info
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    const loadSessionData = async () => {
      if (!user || !sessionId) {
        setLoading(false);
        return;
      }

      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData.session?.access_token || "";
        const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

        // ── Step 1: Get session info (fast DB lookup) ──────────────────────
        const sessionInfo = await apiClient.getSessionInfo(sessionId, token);
        if (!active) return;

        setIsFirstSession(sessionInfo.is_first_session);
        setLoading(false); // Render the page skeleton immediately

        // ── Step 2: Load images + analysis IN PARALLEL ─────────────────────
        const imageTypes = ["front", "left", "right", "up", "down", "raised"];

        const imagesPromise = Promise.all(
          imageTypes.map(async (imageType) => {
            try {
              const imagePreview = await apiClient.getImagePreview(
                sessionId,
                imageType,
                token,
              );
              if (active) {
                setPreviewMap((prev) => ({
                  ...prev,
                  [imageType]: imagePreview.preview_url,
                }));
              }
            } catch {
              // angle may not exist, skip
            }
          }),
        ).finally(() => {
          if (active) setImagesLoading(false);
        });

        const analysisPromise = fetch(
          `${API_URL}/api/analyze-session/${sessionId}`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
          },
        )
          .then(async (res) => {
            if (!active) return;
            if (res.ok) {
              const analysis = (await res.json()) as AnalysisResponse;
              if (active) setAnalysisData(analysis);
            }
          })
          .catch((err) => console.error("Analysis fetch error:", err))
          .finally(() => {
            if (active) setAnalysisLoading(false);
          });

        // Run both in parallel — don't await one before the other
        await Promise.all([imagesPromise, analysisPromise]);

        // ── Step 3: Comparison (after analysis, only if needed) ────────────
        if (!active) return;
        if (!sessionInfo.is_first_session && sessionInfo.previous_session_id) {
          setComparisonLoading(true);
          try {
            const comparisonResponse = await fetch(
              `${API_URL}/api/compare-sessions/${sessionId}/${sessionInfo.previous_session_id}`,
              {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${token}`,
                  "Content-Type": "application/json",
                },
              },
            );
            if (!active) return;
            if (comparisonResponse.ok) {
              const comparison =
                (await comparisonResponse.json()) as ComparisonResponse;
              if (active) setComparisonData(comparison);
            }
          } catch (err) {
            console.error("Comparison fetch error:", err);
          } finally {
            if (active) setComparisonLoading(false);
          }
        }
      } catch (err) {
        if (active) {
          const message =
            err instanceof Error ? err.message : "Failed to load session";
          setError(message);
          setLoading(false);
        }
      }
    };

    loadSessionData();
    return () => {
      active = false;
    };
  }, [user, sessionId]);

  const renderPreview = (title: string) => {
    const imageType = imageTypeByTitle[title];
    const preview = imageType ? (previewMap[imageType] ?? null) : null;

    if (imagesLoading && !preview) {
      return <Skeleton className="h-40 sm:h-48 w-full" />;
    }

    if (!preview) {
      return (
        <div className="h-40 sm:h-48 w-full rounded-lg sm:rounded-2xl bg-sand-100 flex items-center justify-center text-xs text-ink-700">
          No image available
        </div>
      );
    }

    const handleDownload = async () => {
      try {
        const response = await fetch(preview);
        if (!response.ok) throw new Error("Failed to download image");
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `${title.replaceAll(" ", "-").toLowerCase()}.jpg`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
      } catch (err) {
        console.error("Download failed:", err);
      }
    };

    return (
      <ImageModal src={preview} alt={title}>
        <div className="space-y-2">
          <img
            src={preview}
            alt={title}
            className="h-40 sm:h-48 w-full rounded-lg sm:rounded-2xl object-cover"
          />
          <button
            onClick={handleDownload}
            className="w-full flex items-center justify-center gap-1 text-xs font-semibold text-ink-700 hover:text-ink-900 transition-colors"
          >
            <Download className="h-3 w-3" />
            Download
          </button>
        </div>
      </ImageModal>
    );
  };

  // Only block the page for session-info (fast)
  if (loading) {
    return (
      <PageShell>
        <div className="flex min-h-[60vh] items-center justify-center">
          <div className="text-center space-y-4">
            <Loader className="h-8 w-8 animate-spin mx-auto text-ink-900" />
            <p className="text-sm text-ink-700">Loading session...</p>
          </div>
        </div>
      </PageShell>
    );
  }

  if (error) {
    return (
      <PageShell>
        <div className="max-w-2xl mx-auto space-y-6">
          <SectionHeading
            eyebrow="Session Error"
            title="Unable to load results"
            description="We encountered an issue processing your session."
          />
          <div className="rounded-lg sm:rounded-2xl bg-red-50 p-4 border border-red-200">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-900">{error}</p>
            </div>
          </div>
          <div className="flex justify-center gap-3">
            <Link to="/capture">
              <Button variant="outline">Try again</Button>
            </Link>
            <Link to="/history">
              <Button>View history</Button>
            </Link>
          </div>
        </div>
      </PageShell>
    );
  }

  const analysisResults = analysisData?.data?.session_analysis;
  const changeScore = analysisData?.data?.scores?.change_score ?? 0;

  return (
    <PageShell className="space-y-10">
      <SectionHeading
        eyebrow={isFirstSession ? "Baseline established" : "Session captured"}
        title={isFirstSession ? "Your baseline is set" : "Session analyzed"}
        description={
          isFirstSession
            ? "We've established your baseline. Future sessions will be compared against this."
            : "Your session has been analyzed and compared with your baseline."
        }
      />

      {/* Success banner */}
      <div className="rounded-2xl sm:rounded-3xl border-2 border-green-300 bg-gradient-to-r from-green-50 to-transparent p-4 sm:p-6">
        <div className="flex items-center gap-2 sm:gap-3">
          <CheckCircle className="h-5 w-5 sm:h-6 sm:w-6 text-green-700 flex-shrink-0" />
          <div>
            <p className="font-semibold text-green-900 text-sm sm:text-base">
              {isFirstSession
                ? "Baseline captured successfully"
                : "Session analyzed successfully"}
            </p>
            <p className="text-xs sm:text-sm text-green-800 mt-1">
              {isFirstSession
                ? "Your first session establishes the baseline for all future comparisons."
                : analysisLoading
                  ? "Calculating change score..."
                  : `Change score: ${changeScore.toFixed(2)} ${changeScore === 0 ? "(no change from baseline)" : "(compared to baseline)"}`}
            </p>
          </div>
        </div>
      </div>

      {/* ===== THIS SESSION SECTION ===== */}
      <div className="space-y-6 border-t-2 border-sand-200 pt-8">
        <div>
          <h2 className="text-2xl font-heading font-semibold text-ink-900">
            This session
          </h2>
          <p className="mt-1 text-sm text-ink-700">
            Detailed observations from each angle captured.
          </p>
        </div>

        <Card className="space-y-5">
          {analysisLoading ? (
            // Skeleton grid while analysis loads
            <div className="grid gap-4 md:grid-cols-2">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div
                  key={i}
                  className="rounded-2xl border border-sand-100 bg-sand-50 p-4 space-y-2"
                >
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-3 w-16" />
                  <Skeleton className="h-12 w-full" />
                </div>
              ))}
            </div>
          ) : analysisResults ? (
            <div className="grid gap-4 md:grid-cols-2">
              {[...analysisResults.per_angle]
                .sort(
                  (a, b) =>
                    captureOrder.indexOf(a.angle_type) -
                    captureOrder.indexOf(b.angle_type),
                )
                .map((result) => {
                  const title =
                    Object.entries(imageTypeByTitle).find(
                      ([, v]) => v === result.angle_type,
                    )?.[0] || result.angle_type;
                  return (
                    <div
                      key={result.angle_type}
                      className="rounded-2xl border border-sand-100 bg-sand-50 p-4"
                    >
                      <p className="text-sm font-semibold text-ink-900">
                        {title}
                      </p>
                      <p className="mt-1 text-xs font-semibold text-tide-600">
                        Score: {result.change_score.toFixed(2)}
                      </p>
                      <p className="mt-2 text-sm text-ink-700">
                        {result.summary}
                      </p>
                      <details className="mt-3">
                        <summary className="cursor-pointer text-xs font-semibold text-ink-900">
                          View image
                        </summary>
                        <div className="mt-3">{renderPreview(title)}</div>
                      </details>
                    </div>
                  );
                })}
            </div>
          ) : (
            <p className="text-sm text-ink-700 py-4 text-center">
              Analysis unavailable for this session.
            </p>
          )}

          {analysisResults && (
            <div className="rounded-2xl bg-white/70 p-4">
              <p className="text-sm font-semibold text-ink-900">
                Session summary
              </p>
              <p className="mt-2 text-sm text-ink-700">
                {analysisResults.overall_summary}
              </p>
            </div>
          )}
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
              How this session compares to your previous session.
            </p>
          </div>

          <Card className="space-y-5">
            {comparisonLoading ? (
              <div className="grid gap-4 md:grid-cols-2">
                {[1, 2, 3, 4].map((i) => (
                  <div
                    key={i}
                    className="rounded-2xl border border-sand-100 bg-sand-50 p-4 space-y-2"
                  >
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-3 w-16" />
                    <Skeleton className="h-8 w-full" />
                  </div>
                ))}
              </div>
            ) : comparisonData?.data ? (
              <>
                <div className="grid gap-4 md:grid-cols-2">
                  {[...comparisonData.data.per_angle]
                    .sort(
                      (a, b) =>
                        captureOrder.indexOf(a.angle_type) -
                        captureOrder.indexOf(b.angle_type),
                    )
                    .map((result) => {
                      const title =
                        Object.entries(imageTypeByTitle).find(
                          ([, v]) => v === result.angle_type,
                        )?.[0] || result.angle_type;
                      return (
                        <div
                          key={result.angle_type}
                          className="rounded-2xl border border-sand-100 bg-sand-50 p-4"
                        >
                          <p className="text-sm font-semibold text-ink-900">
                            {title}
                          </p>
                          <p className="mt-1 text-xs font-semibold text-tide-600">
                            Delta: {result.delta.toFixed(2)}
                          </p>
                          <p className="mt-2 text-xs text-ink-700">
                            {result.delta < 0.1
                              ? "No significant change"
                              : result.delta < 0.25
                                ? "Mild variation detected"
                                : "Notable change detected"}
                          </p>
                          <details className="mt-3">
                            <summary className="cursor-pointer text-xs font-semibold text-ink-900">
                              View image
                            </summary>
                            <div className="mt-3">{renderPreview(title)}</div>
                          </details>
                        </div>
                      );
                    })}
                </div>
                <div className="rounded-2xl bg-white/70 p-4">
                  <p className="font-semibold text-sm text-ink-900">
                    Overall trend
                  </p>
                  <p className="mt-2 text-sm text-ink-700 capitalize">
                    {comparisonData.data.overall_trend.replace("_", " ")}
                  </p>
                </div>
              </>
            ) : (
              <p className="text-sm text-ink-700 py-4 text-center">
                Comparison data unavailable for this session.
              </p>
            )}
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
