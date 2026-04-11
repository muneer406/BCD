import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  CheckCircle,
  Download,
  Heart,
  AlertCircle,
  Loader,
  Minus,
  RefreshCw,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { ImageModal } from "../components/ImageModal";
import { PageShell } from "../components/PageShell";
import { SectionHeading } from "../components/SectionHeading";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabaseClient";
import { apiClient } from "../lib/apiClient";
import {
  angleInterpretationPrimary,
  angleInterpretationSecondary,
  comparisonTrendPhrase,
  sessionDeltaVariation,
  sessionToSessionOverallSummary,
  type SessionDeltaKind,
} from "../lib/angleInterpretation";

type ImagePreviewMap = Record<
  string,
  Array<{ preview_url: string; expires_in: number; image_type: string }>
>;

type BaselineLayer = {
  delta: number | null;
  trend: string | null;
  available: boolean;
};

type InterpretationPayload = {
  summary_text: string;
  explanation_text: string;
  confidence_label: string;
  confidence_score?: number;
  flags?: {
    angle_mismatch?: boolean;
    early_baseline?: boolean;
  };
};

type AnalysisResponse = {
  success: boolean;
  data?: {
    session_id: string;
    is_first_session?: boolean;
    session_analysis?: {
      per_angle: Array<{
        angle_type: string;
        change_score: number;
        angle_quality_score?: number;
        summary: string;
      }>;
      overall_summary: string;
    };
    interpretation?: InterpretationPayload;
    /** Region-based lines (3×3 grid vs baseline / last session) */
    localized_insights?: string[];
    scores?: {
      change_score: number;
      trend_score: number | null;
      angle_aware_score?: number;
      angle_aware_variation_level?: string;
      analysis_version?: string;
      analysis_confidence_score?: number;
    };
    processing_time_ms?: number;
    image_quality_summary?: {
      session_quality_score: number;
      consistency_score: number;
      low_quality_angles: string[];
      blurry_images_count: number;
      total_images: number;
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
      embedding_distance: number | null;
    }>;
    overall_delta: number;
    overall_trend: string;
    comparison_method: string;
    rolling_baseline: BaselineLayer;
    monthly_baseline: BaselineLayer;
    lifetime_baseline: BaselineLayer;
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

function angleQualityLabel(score: number | null | undefined): {
  text: string;
  color: string;
} {
  if (score == null) return { text: "—", color: "text-ink-600" };
  if (score >= 0.8) return { text: "Good", color: "text-green-700" };
  if (score >= 0.6) return { text: "Acceptable", color: "text-amber-600" };
  return { text: "Low quality", color: "text-red-600" };
}

function SessionVariationIndicator({ kind }: { kind: SessionDeltaKind }) {
  const base =
    "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold";
  if (kind === "increase") {
    return (
      <span
        className={`${base} bg-amber-50 text-amber-800 border border-amber-200`}
      >
        <TrendingUp className="h-3.5 w-3.5 shrink-0" aria-hidden />
        Increase
      </span>
    );
  }
  if (kind === "decrease") {
    return (
      <span className={`${base} bg-sky-50 text-sky-800 border border-sky-200`}>
        <TrendingDown className="h-3.5 w-3.5 shrink-0" aria-hidden />
        Decrease
      </span>
    );
  }
  return (
    <span className={`${base} bg-sand-100 text-ink-700 border border-sand-200`}>
      <Minus className="h-3.5 w-3.5 shrink-0" aria-hidden />
      Stable
    </span>
  );
}

export function Result() {
  const { user } = useAuth();
  const { sessionId } = useParams();
  const [previewMap, setPreviewMap] = useState<ImagePreviewMap>({});
  const [imagesLoading, setImagesLoading] = useState(true);
  const [isFirstSession, setIsFirstSession] = useState(false);
  const [sessionCreatedAt, setSessionCreatedAt] = useState<string | null>(null);
  const [analysisData, setAnalysisData] = useState<AnalysisResponse | null>(
    null,
  );
  const [analysisLoading, setAnalysisLoading] = useState(true);
  const [comparisonData, setComparisonData] =
    useState<ComparisonResponse | null>(null);
  const [comparisonLoading, setComparisonLoading] = useState(true);
  const [loading, setLoading] = useState(true); // only for session-info
  const [error, setError] = useState<string | null>(null);
  const [reanalyzing, setReanalyzing] = useState(false);
  const [previousSessionId, setPreviousSessionId] = useState<string | null>(
    null,
  );
  // Tracks whether initial load already completed — prevents re-runs from
  // token refresh events (Supabase recreates the user object on TOKEN_REFRESHED,
  // which would otherwise re-trigger the effect).
  const dataLoadedRef = useRef(false);

  useEffect(() => {
    let active = true;

    const loadSessionData = async () => {
      if (!user || !sessionId) {
        setLoading(false);
        return;
      }

      // Skip if data was already successfully loaded for this session.
      // This prevents re-fetching when Supabase fires TOKEN_REFRESHED and
      // recreates the user object with a different reference.
      if (dataLoadedRef.current) return;

      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData.session?.access_token || "";
        const API_URL =
          import.meta.env.VITE_API_URL ||
          "https://muneer320-bcd-backend.hf.space";

        // ── Step 1: Get session info (fast DB lookup) ──────────────────────
        const sessionInfo = await apiClient.getSessionInfo(sessionId, token);
        if (!active) return;

        setIsFirstSession(sessionInfo.is_first_session);
        setPreviousSessionId(sessionInfo.previous_session_id ?? null);
        setSessionCreatedAt(sessionInfo.created_at || null);
        if (sessionInfo.is_first_session) setComparisonLoading(false);
        setLoading(false); // Render the page skeleton immediately
        dataLoadedRef.current = true; // mark loaded — prevents re-run on token refresh

        // ── Step 2: Load images + analysis IN PARALLEL ─────────────────────
        const imageTypes = ["front", "left", "right", "up", "down", "raised"];

        const imagesPromise = Promise.all(
          imageTypes.map(async (imageType) => {
            try {
              const imageResponse = await apiClient.getImagePreview(
                sessionId,
                imageType,
                token,
              );
              if (active) {
                setPreviewMap((prev) => ({
                  ...prev,
                  [imageType]: imageResponse.images,
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
      // Reset so a new session ID or fresh mount loads its own data
      dataLoadedRef.current = false;
    };
    // user?.id is a stable string; using `user` directly would cause this effect
    // to re-run on every TOKEN_REFRESHED event (Supabase recreates the user object).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, sessionId]);

  const handleReanalyze = async () => {
    if (!user || !sessionId || reanalyzing) return;
    setReanalyzing(true);
    setAnalysisLoading(true);
    if (!isFirstSession) setComparisonLoading(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token || "";
      const API_URL =
        import.meta.env.VITE_API_URL ||
        "https://muneer320-bcd-backend.hf.space";

      // Force re-run the ML pipeline
      const res = await fetch(
        `${API_URL}/api/analyze-session/${sessionId}?force=true`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        },
      );
      if (res.ok) {
        const analysis = (await res.json()) as AnalysisResponse;
        setAnalysisData(analysis);
      }
      setAnalysisLoading(false);

      // Also refresh the comparison (Over time) data
      if (!isFirstSession && previousSessionId) {
        try {
          const compRes = await fetch(
            `${API_URL}/api/compare-sessions/${sessionId}/${previousSessionId}`,
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json",
              },
            },
          );
          if (compRes.ok) {
            const comparison = (await compRes.json()) as ComparisonResponse;
            setComparisonData(comparison);
          }
        } catch (err) {
          console.error("Re-compare error:", err);
        } finally {
          setComparisonLoading(false);
        }
      }
    } catch (err) {
      console.error("Re-analyze error:", err);
      setAnalysisLoading(false);
      setComparisonLoading(false);
    } finally {
      setReanalyzing(false);
    }
  };

  const renderPreview = (title: string) => {
    const imageType = imageTypeByTitle[title];
    const images = imageType ? (previewMap[imageType] ?? []) : [];

    if (imagesLoading && images.length === 0) {
      return <Skeleton className="h-40 sm:h-48 w-full" />;
    }

    if (images.length === 0) {
      return (
        <div className="h-40 sm:h-48 w-full rounded-lg sm:rounded-2xl bg-sand-100 flex items-center justify-center text-xs text-ink-700">
          No images available
        </div>
      );
    }

    const handleDownload = async (previewUrl: string, index: number) => {
      try {
        const response = await fetch(previewUrl);
        if (!response.ok) throw new Error("Failed to download image");
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `${title.replaceAll(" ", "-").toLowerCase()}-${
          index + 1
        }.jpg`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
      } catch (err) {
        console.error("Download failed:", err);
      }
    };

    if (images.length === 1) {
      const image = images[0];
      return (
        <ImageModal src={image.preview_url} alt={title}>
          <div className="space-y-2">
            <img
              src={image.preview_url}
              alt={title}
              className="h-40 sm:h-48 w-full rounded-lg sm:rounded-2xl object-cover"
            />
            <button
              onClick={() => handleDownload(image.preview_url, 0)}
              className="w-full flex items-center justify-center gap-1 text-xs font-semibold text-ink-700 hover:text-ink-900 transition-colors"
            >
              <Download className="h-3 w-3" />
              Download
            </button>
          </div>
        </ImageModal>
      );
    }

    return (
      <div className="grid grid-cols-2 gap-2">
        {images.map((image, index) => (
          <ImageModal
            key={`${image.preview_url}-${index}`}
            src={image.preview_url}
            alt={`${title} ${index + 1}`}
          >
            <div className="relative rounded-lg sm:rounded-2xl overflow-hidden bg-sand-100">
              <img
                src={image.preview_url}
                alt={`${title} ${index + 1}`}
                className="h-28 sm:h-32 w-full object-cover hover:opacity-90 transition-opacity"
              />
              <div className="absolute top-1 right-1 bg-ink-900 text-white rounded-full w-5 h-5 sm:w-6 sm:h-6 flex items-center justify-center text-xs font-semibold">
                {index + 1}
              </div>
            </div>
          </ImageModal>
        ))}
      </div>
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
  const trendScore = analysisData?.data?.scores?.trend_score ?? null;
  const angleAwareScore = analysisData?.data?.scores?.angle_aware_score ?? null;
  const analysisVersion = analysisData?.data?.scores?.analysis_version ?? null;
  const processingTimeMs = analysisData?.data?.processing_time_ms ?? null;
  const interpretation = analysisData?.data?.interpretation;
  const rawLocalized = analysisData?.data?.localized_insights;
  const localizedInsights: string[] = Array.isArray(rawLocalized)
    ? rawLocalized.filter((x): x is string => typeof x === "string")
    : [];

  const analysisConfidence =
    interpretation?.confidence_score ??
    analysisData?.data?.scores?.analysis_confidence_score ??
    null;

  const confidenceColor =
    analysisConfidence == null
      ? "text-ink-600"
      : analysisConfidence >= 0.75
        ? "text-green-700"
        : analysisConfidence >= 0.5
          ? "text-amber-600"
          : "text-red-600";

  return (
    <PageShell className="space-y-10">
      <div className="mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
          <div className="flex items-center gap-2 min-w-0">
            <span className="block text-xs font-semibold uppercase tracking-wide text-sand-700">
              {isFirstSession ? "Baseline established" : "Session captured"}
            </span>
            {sessionCreatedAt && (
              <span className="hidden sm:inline-block ml-2 rounded-full bg-sand-100 border border-sand-200 px-3 py-0.5 text-xs font-semibold text-ink-700 shadow-sm whitespace-nowrap">
                {new Date(sessionCreatedAt).toLocaleString(undefined, {
                  dateStyle: "medium",
                  timeStyle: "short",
                })}
              </span>
            )}
          </div>
          {sessionCreatedAt && (
            <span className="sm:hidden inline-block mt-1 rounded-full bg-sand-100 border border-sand-200 px-3 py-0.5 text-xs font-semibold text-ink-700 shadow-sm whitespace-nowrap">
              {new Date(sessionCreatedAt).toLocaleString(undefined, {
                dateStyle: "medium",
                timeStyle: "short",
              })}
            </span>
          )}
        </div>
        <h1 className="mt-2 text-2xl sm:text-3xl font-heading font-bold text-ink-900">
          {isFirstSession ? "Your baseline is set" : "Session analyzed"}
        </h1>
        <p className="mt-1 text-sm text-ink-700">
          {isFirstSession
            ? "We've established your baseline. Future sessions will be compared against this."
            : "Your session has been analyzed and compared with your baseline."}
        </p>
      </div>

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
                  ? "Running analysis..."
                  : "Your session was processed. See the summary below."}
            </p>
          </div>
        </div>
      </div>

      {!isFirstSession && analysisLoading && (
        <div className="rounded-2xl sm:rounded-3xl border border-sand-200 bg-sand-50 p-4 sm:p-6 space-y-3">
          <Skeleton className="h-8 w-full max-w-lg" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-4 w-40" />
        </div>
      )}

      {/* Interpretation — shown after first session (backend-generated copy) */}
      {!isFirstSession && !analysisLoading && analysisData?.data?.scores && (
        <div className="rounded-2xl sm:rounded-3xl border border-sand-200 bg-sand-50 p-4 sm:p-6 space-y-4">
          {interpretation ? (
            <>
              <h2 className="text-xl sm:text-2xl font-heading font-semibold text-ink-900 leading-snug">
                {interpretation.summary_text}
              </h2>
              <p className="text-sm text-ink-700 leading-relaxed">
                {interpretation.explanation_text}
              </p>
              <div className="flex flex-wrap items-baseline gap-2">
                <span className="text-sm font-semibold text-ink-800">
                  Confidence:
                </span>
                <span className={`text-sm font-semibold ${confidenceColor}`}>
                  {interpretation.confidence_label}
                  {analysisConfidence != null && (
                    <span className="text-ink-700 font-normal">
                      {" "}
                      ({(analysisConfidence * 100).toFixed(0)}%)
                    </span>
                  )}
                </span>
              </div>
              <p className="text-xs text-ink-600 leading-relaxed border-t border-sand-200 pt-3">
                These differences may be influenced by lighting, positioning, or
                image quality.
              </p>
              <details className="rounded-xl border border-sand-200 bg-white/80 p-3 sm:p-4">
                <summary className="cursor-pointer text-sm font-semibold text-ink-900 list-none [&::-webkit-details-marker]:hidden">
                  View detailed analysis
                </summary>
                <div className="mt-4 space-y-3 text-sm">
                  <div className="flex justify-between gap-4 border-b border-sand-100 pb-2">
                    <span className="text-ink-600">Structural score</span>
                    <span className="font-mono text-ink-900 tabular-nums">
                      {changeScore.toFixed(3)}
                    </span>
                  </div>
                  <div className="flex justify-between gap-4 border-b border-sand-100 pb-2">
                    <span className="text-ink-600">Angle score</span>
                    <span className="font-mono text-tide-600 tabular-nums">
                      {angleAwareScore != null
                        ? angleAwareScore.toFixed(3)
                        : "—"}
                    </span>
                  </div>
                  <div className="flex justify-between gap-4 border-b border-sand-100 pb-2">
                    <span className="text-ink-600">Trend</span>
                    <span className="font-mono text-ink-900 tabular-nums text-right">
                      {trendScore != null ? trendScore.toFixed(3) : "—"}
                    </span>
                  </div>
                  <p className="text-xs text-ink-500">
                    Trend is a rolling average from recent sessions using the
                    angle-aware score.
                  </p>
                  <div className="flex justify-between gap-4 pt-1">
                    <span className="text-ink-600">Model version</span>
                    <span className="text-ink-900 text-right">
                      {analysisVersion ?? "—"} · EfficientNetV2-S
                    </span>
                  </div>
                  {processingTimeMs !== null && (
                    <p className="text-xs text-ink-400">
                      Analysis completed in{" "}
                      {(processingTimeMs / 1000).toFixed(1)}s
                    </p>
                  )}
                </div>
              </details>
            </>
          ) : (
            <p className="text-sm text-ink-700">
              Analysis summary is unavailable. You can try re-analyze below or
              contact support if this persists.
            </p>
          )}
        </div>
      )}

      {/* Region-based localized copy (backend 3×3 grid) */}
      {!analysisLoading && (
        <Card className="space-y-3">
          <h2 className="text-xl font-heading font-semibold text-ink-900">
            What changed
          </h2>
          {isFirstSession ? (
            <p className="text-sm text-ink-700">
              After your next session, location-specific comparisons can appear
              here as your baseline builds.
            </p>
          ) : localizedInsights.length > 0 ? (
            <ul className="list-disc pl-5 space-y-2 text-sm text-ink-700 leading-relaxed">
              {localizedInsights.map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-ink-700">
              No areas crossed the reporting threshold for this session, or
              comparison data is still accumulating.
            </p>
          )}
          <p className="text-xs text-ink-500 leading-relaxed">
            Descriptions refer to regions in your photos only and can be
            affected by pose, distance, and lighting—not clinical findings.
          </p>
        </Card>
      )}

      {/* ===== THIS SESSION SECTION ===== */}
      <div className="space-y-6 border-t-2 border-sand-200 pt-8">
        <div>
          <h2 className="text-2xl font-heading font-semibold text-ink-900">
            This session
          </h2>
          <p className="mt-1 text-sm text-ink-700">
            Image quality check for each angle — how well-captured are these
            photos?
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
                  const ql = angleQualityLabel(result.angle_quality_score);
                  return (
                    <div
                      key={result.angle_type}
                      className="rounded-2xl border border-sand-100 bg-sand-50 p-4"
                    >
                      <p className="text-sm font-semibold text-ink-900">
                        {title}
                      </p>
                      <p className={`mt-1 text-xs font-semibold ${ql.color}`}>
                        Image quality: {ql.text}
                        {result.angle_quality_score != null &&
                          ` (${(result.angle_quality_score * 100).toFixed(
                            0,
                          )}%)`}
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

          {analysisData?.data?.image_quality_summary && (
            <div className="rounded-2xl bg-white/70 p-4 space-y-3">
              <p className="text-sm font-semibold text-ink-900">
                Session quality
              </p>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <p className="text-xs text-ink-600">Overall quality</p>
                  <p className="text-sm font-semibold text-ink-900">
                    {(
                      analysisData.data.image_quality_summary
                        .session_quality_score * 100
                    ).toFixed(0)}
                    %
                  </p>
                </div>
                <div>
                  <p className="text-xs text-ink-600">Consistency</p>
                  <p className="text-sm font-semibold text-ink-900">
                    {(
                      analysisData.data.image_quality_summary
                        .consistency_score * 100
                    ).toFixed(0)}
                    %
                  </p>
                </div>
                <div>
                  <p className="text-xs text-ink-600">Images analyzed</p>
                  <p className="text-sm font-semibold text-ink-900">
                    {analysisData.data.image_quality_summary.total_images}
                  </p>
                </div>
              </div>
              {analysisData.data.image_quality_summary.low_quality_angles
                .length > 0 && (
                <p className="text-xs text-amber-700">
                  ⚠ Low quality angles:{" "}
                  {analysisData.data.image_quality_summary.low_quality_angles.join(
                    ", ",
                  )}
                </p>
              )}
              {analysisData.data.image_quality_summary.blurry_images_count >
                0 && (
                <p className="text-xs text-amber-700">
                  ⚠{" "}
                  {analysisData.data.image_quality_summary.blurry_images_count}{" "}
                  blurry image(s) detected — retaking may improve accuracy.
                </p>
              )}
            </div>
          )}

          {!analysisLoading && (
            <div className="flex justify-end">
              <button
                onClick={handleReanalyze}
                disabled={reanalyzing}
                className="inline-flex items-center gap-1.5 text-xs text-ink-600 hover:text-ink-900 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                title="Re-run the full ML analysis against your current baseline"
              >
                <RefreshCw
                  className={`h-3 w-3 ${reanalyzing ? "animate-spin" : ""}`}
                />
                {reanalyzing ? "Re-analyzing..." : "Re-analyze"}
              </button>
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
              How each angle has shifted since your last session, relative to
              your personal baseline.
            </p>
          </div>

          <Card className="space-y-5">
            {comparisonLoading ? (
              <>
                <div className="grid gap-4 md:grid-cols-2">
                  {[1, 2, 3, 4, 5, 6].map((i) => (
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
                <div className="rounded-2xl bg-white/70 p-4 space-y-2">
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="h-4 w-20" />
                </div>
                <div className="space-y-3">
                  <Skeleton className="h-4 w-36" />
                  <div className="grid gap-3 sm:grid-cols-3">
                    {[1, 2, 3].map((i) => (
                      <div
                        key={i}
                        className="rounded-xl border border-sand-100 bg-sand-50 p-3 space-y-2"
                      >
                        <Skeleton className="h-3 w-20" />
                        <Skeleton className="h-3 w-12" />
                        <Skeleton className="h-3 w-16" />
                      </div>
                    ))}
                  </div>
                </div>
              </>
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
                      const analysisAngle = analysisResults?.per_angle.find(
                        (a) => a.angle_type === result.angle_type,
                      );
                      const changeVsBaseline = analysisAngle?.change_score ?? 0;
                      const primaryLabel = analysisAngle
                        ? angleInterpretationPrimary(changeVsBaseline)
                        : "Unavailable";
                      const secondaryLine = analysisAngle
                        ? angleInterpretationSecondary(changeVsBaseline)
                        : "Baseline analysis for this view is not available.";
                      const deltaKind = sessionDeltaVariation(result.delta);
                      return (
                        <div
                          key={result.angle_type}
                          className="rounded-2xl border border-sand-100 bg-sand-50 p-4 space-y-2"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-sm font-semibold text-ink-900">
                              {title}
                            </p>
                            <SessionVariationIndicator kind={deltaKind} />
                          </div>
                          <p className="text-base font-semibold text-ink-900 leading-snug">
                            {primaryLabel}
                          </p>
                          <p className="text-sm text-ink-700 leading-relaxed">
                            {secondaryLine}
                          </p>
                          <p className="text-[11px] text-ink-500 font-mono tabular-nums pt-1 border-t border-sand-200/80">
                            {analysisAngle ? (
                              <>
                                Baseline distance {changeVsBaseline.toFixed(3)}
                                {" · "}
                                vs last session {result.delta > 0 ? "+" : ""}
                                {result.delta.toFixed(3)}
                              </>
                            ) : (
                              <>
                                vs last session {result.delta > 0 ? "+" : ""}
                                {result.delta.toFixed(3)}
                              </>
                            )}
                          </p>
                        </div>
                      );
                    })}
                </div>
                {/* Overall trend — interpreted (no raw delta); aligned with main summary */}
                <div className="rounded-2xl bg-white/70 p-4 space-y-3">
                  <p className="font-semibold text-sm text-ink-900">
                    Overall trend
                  </p>
                  <p className="text-sm text-ink-900 leading-relaxed">
                    {sessionToSessionOverallSummary(
                      comparisonData.data.overall_delta,
                    )}
                  </p>
                  {interpretation && (
                    <p className="text-xs text-ink-600 leading-relaxed border-t border-sand-100 pt-3">
                      {interpretation.summary_text}
                    </p>
                  )}
                  <p className="text-xs text-ink-500">
                    {comparisonData.data.rolling_baseline?.available
                      ? "Rolling baseline is available for additional context."
                      : "Your baseline will stabilize as you add more sessions."}
                  </p>
                </div>

                {/* Rolling / monthly / lifetime baselines */}
                {(comparisonData.data.rolling_baseline?.available ||
                  comparisonData.data.monthly_baseline?.available ||
                  comparisonData.data.lifetime_baseline?.available) && (
                  <div className="space-y-3">
                    <p className="text-sm font-semibold text-ink-900">
                      Baseline comparisons
                    </p>
                    <div className="grid gap-3 sm:grid-cols-3">
                      {(
                        [
                          {
                            key: "rolling_baseline",
                            label: "Rolling (last 5)",
                          },
                          {
                            key: "monthly_baseline",
                            label: "Monthly (30 days)",
                          },
                          { key: "lifetime_baseline", label: "Lifetime" },
                        ] as const
                      ).map(({ key, label }) => {
                        const layer = comparisonData.data![key];
                        if (!layer?.available) return null;
                        const phrase = comparisonTrendPhrase(layer.trend);
                        return (
                          <div
                            key={key}
                            className="rounded-xl border border-sand-100 bg-sand-50 p-3"
                          >
                            <p className="text-xs font-semibold text-ink-900">
                              {label}
                            </p>
                            <p className="mt-2 text-xs text-ink-700 leading-snug">
                              {phrase}
                            </p>
                            <p className="mt-2 text-[10px] text-ink-400 font-mono tabular-nums">
                              Δ {layer.delta!.toFixed(3)}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
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
