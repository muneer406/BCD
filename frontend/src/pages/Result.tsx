import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  BarChart3,
  CheckCircle,
  Clock,
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
  "Upward angle": "up",
  "Downward angle": "down",
  "Full body": "raised",
};

interface SessionData {
  id: string;
  created_at: string;
  images?: Array<{ storage_path: string; image_type: string }>;
}

export function Result() {
  const { user } = useAuth();
  const { sessionId } = useParams();
  const [previewMap, setPreviewMap] = useState<ImagePreviewMap>({});
  const [isFirstSession, setIsFirstSession] = useState(false);
  const [analysisData, setAnalysisData] = useState<AnalysisResponse | null>(
    null,
  );
  const [comparisonData, setComparisonData] =
    useState<ComparisonResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [previousSessionId, setPreviousSessionId] = useState<string | null>(
    null,
  );

  useEffect(() => {
    let active = true;

    const loadSessionData = async () => {
      if (!user || !sessionId) {
        setLoading(false);
        return;
      }

      try {
        // Get JWT token for API calls
        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData.session?.access_token || "";

        // Get session info (including first-session status)
        const sessionInfo = await apiClient.getSessionInfo(sessionId, token);
        if (!active) return;

        setIsFirstSession(sessionInfo.is_first_session);

        // Load image preview URLs from backend
        const imageTypes = ["front", "left", "right", "up", "down", "raised"];
        const previews: ImagePreviewMap = {};

        await Promise.all(
          imageTypes.map(async (imageType) => {
            try {
              const imagePreview = await apiClient.getImagePreview(
                sessionId,
                imageType,
                token,
              );
              previews[imageType] = imagePreview.preview_url;
            } catch (err) {
              // Image may not exist for this angle, skip
              previews[imageType] = null;
            }
          }),
        );

        if (active) {
          // Only set previews for angles that exist
          const filteredPreviews = Object.fromEntries(
            Object.entries(previews).filter(([, url]) => url !== null),
          );
          setPreviewMap(filteredPreviews);
        }

        // Fetch analysis results from backend
        try {
          const analysisResponse = await fetch(
            `/api/analyze-session/${sessionId}`,
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json",
              },
            },
          );

          if (!active) return;

          if (!analysisResponse.ok) {
            throw new Error(
              `Analysis failed: ${analysisResponse.status} ${analysisResponse.statusText}`,
            );
          }

          const analysis = (await analysisResponse.json()) as AnalysisResponse;
          setAnalysisData(analysis);

          // If not first session, fetch comparison with previous session
          if (!sessionInfo.is_first_session) {
            try {
              const comparisonResponse = await fetch(
                `/api/compare-sessions/${sessionId}/${sessionInfo.session_id}`,
                {
                  method: "GET",
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
                setComparisonData(comparison);
              }
            } catch (err) {
              console.error("Comparison fetch error:", err);
              // Comparison failure is not critical
            }
          }
        } catch (err) {
          console.error("Analysis fetch error:", err);
          // Analysis failure is not critical - show what we have
        }

        if (active) {
          setLoading(false);
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

  const getPreviewForTitle = (title: string) => {
    const imageType = imageTypeByTitle[title];
    return imageType ? (previewMap[imageType] ?? null) : null;
  };

  const renderPreview = (title: string) => {
    const preview = getPreviewForTitle(title);
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
        if (!response.ok) {
          throw new Error("Failed to download image");
        }
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

  if (loading) {
    return (
      <PageShell>
        <div className="flex min-h-[60vh] items-center justify-center">
          <div className="text-center space-y-4">
            <Loader className="h-8 w-8 animate-spin mx-auto text-ink-900" />
            <p className="text-sm text-ink-700">Processing your session...</p>
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
              <div className="flex-1">
                <p className="text-sm text-red-900">{error}</p>
              </div>
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
                : `Change score: ${changeScore.toFixed(2)} ${
                    changeScore === 0
                      ? "(no change from baseline)"
                      : "(compared to baseline)"
                  }`}
            </p>
          </div>
        </div>
      </div>

      {/* Images from this session */}
      {Object.keys(previewMap).length > 0 && (
        <div className="space-y-4">
          <h2 className="text-2xl font-heading font-semibold text-ink-900">
            Captured images
          </h2>
          <div className="grid gap-4 md:grid-cols-2">
            {Object.entries(previewMap).map(([type, preview]) => {
              const label =
                Object.entries(imageTypeByTitle).find(
                  ([, v]) => v === type,
                )?.[0] || type;
              return (
                <div key={type}>
                  <p className="text-sm font-semibold text-ink-900 mb-2">
                    {label}
                  </p>
                  {renderPreview(label)}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Analysis results */}
      {analysisResults && (
        <div className="space-y-6">
          <div>
            <h2 className="text-2xl font-heading font-semibold text-ink-900">
              Analysis results
            </h2>
            <p className="mt-1 text-sm text-ink-700">
              {analysisResults.overall_summary}
            </p>
          </div>

          <Card className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              {analysisResults.per_angle.map((result) => (
                <div
                  key={result.angle_type}
                  className="rounded-2xl border border-sand-100 bg-sand-50 p-4"
                >
                  <p className="text-sm font-semibold text-ink-900 capitalize">
                    {result.angle_type} angle
                  </p>
                  <p className="mt-2 text-xs font-semibold text-tide-600">
                    Score: {result.change_score.toFixed(2)}
                  </p>
                  <p className="mt-2 text-sm text-ink-700">{result.summary}</p>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      {/* Comparison with previous session */}
      {!isFirstSession && comparisonData?.data && (
        <div className="space-y-6 border-t-2 border-sand-200 pt-8">
          <div>
            <h2 className="text-2xl font-heading font-semibold text-ink-900">
              Compared to previous session
            </h2>
            <p className="mt-1 text-sm text-ink-700">
              How this session compares to your most recent capture.
            </p>
          </div>

          <Card className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              {comparisonData.data.per_angle.map((result) => (
                <div
                  key={result.angle_type}
                  className="rounded-2xl border border-sand-100 bg-sand-50 p-4"
                >
                  <p className="text-sm font-semibold text-ink-900 capitalize">
                    {result.angle_type} angle
                  </p>
                  <p className="mt-2 text-xs font-semibold text-tide-600">
                    Delta: {result.delta.toFixed(2)}
                  </p>
                  <p className="mt-2 text-xs text-ink-700">
                    {result.delta < 0.1
                      ? "No significant change"
                      : result.delta < 0.25
                        ? "Mild variation detected"
                        : "Notable change detected"}
                  </p>
                </div>
              ))}
            </div>

            <div className="mt-4 rounded-2xl bg-white/70 p-4">
              <p className="font-semibold text-ink-900 text-sm">
                Overall trend
              </p>
              <p className="mt-2 text-sm text-ink-700 capitalize">
                {comparisonData.data.overall_trend}
              </p>
              <p className="mt-1 text-xs text-ink-600">
                Method: {comparisonData.data.comparison_method}
              </p>
            </div>
          </Card>
        </div>
      )}

      {/* Guidelines reminder */}
      <Card tone="soft">
        <h3 className="text-lg font-heading font-semibold text-ink-900">
          <span className="inline-flex items-center gap-2">
            <Clock className="h-5 w-5 text-ink-900" />
            Next capture
          </span>
        </h3>
        <div className="mt-4 space-y-2 text-sm text-ink-700">
          <p>
            For consistent comparisons, repeat captures with the same
            conditions:
          </p>
          <ul className="list-disc list-inside space-y-1 text-xs">
            <li>Similar lighting as this session</li>
            <li>Same distance from camera</li>
            <li>All 6 angles from the same position</li>
          </ul>
        </div>
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
