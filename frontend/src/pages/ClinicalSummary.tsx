import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import {
  CalendarDays,
  Camera,
  Clock3,
  Download,
  AlertCircle,
  Stethoscope,
  User,
} from "lucide-react";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { PageShell } from "../components/PageShell";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabaseClient";
import { apiClient } from "../lib/apiClient";

type ImagePreviewMap = Record<
  string,
  Array<{ preview_url: string; expires_in: number; image_type: string }>
>;

type UserProfile = {
  id: string;
  age_range?: string | null;
  last_menstrual_period?: string | null;
  created_at?: string;
  updated_at?: string;
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
        symmetry_score?: number;
      }>;
      overall_summary: string;
    };
    scores?: {
      change_score: number;
      trend_score: number | null;
      angle_aware_score?: number;
      analysis_confidence_score?: number;
      session_quality_score?: number;
      symmetry_score?: number;
    };
    image_quality_summary?: {
      session_quality_score: number;
      total_images: number;
    };
  };
  error?: string;
};

// Canonical display order matching the capture page
const captureOrder = ["front", "left", "right", "up", "down", "raised"];

const angleDisplayNames: Record<string, string> = {
  front: "Front view",
  left: "Left side",
  right: "Right side",
  up: "Slight upward angle",
  down: "Slight downward angle",
  raised: "Full body view",
};

function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-sand-200 ${className}`} />;
}

function formatDate(date: Date): string {
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

function ageRangeLabel(profile?: UserProfile | null): string {
  if (!profile?.age_range) return "Not provided";
  return profile.age_range;
}

function lastMenstrualPeriodLabel(profile?: UserProfile | null): string {
  if (!profile?.last_menstrual_period) return "Not logged";
  const date = new Date(profile.last_menstrual_period);
  if (Number.isNaN(date.getTime())) return profile.last_menstrual_period;
  return formatDate(date);
}

function sessionTypeLabel(type: string | null): string {
  if (type === "quick") return "Quick check";
  if (type === "full") return "Full session";
  return "Full session";
}

function symmetryText(symmetryScore: number | null | undefined): string {
  if (symmetryScore == null) return "—";
  const displayScore = Math.round((1 - symmetryScore) * 100);
  const clampedScore = Math.max(0, Math.min(100, displayScore));
  let label = "No symmetry data";
  if (clampedScore >= 90) label = "Very symmetrical";
  else if (clampedScore >= 75) label = "Mostly symmetrical";
  else if (clampedScore >= 60) label = "Moderate symmetry";
  else if (clampedScore >= 40) label = "Asymmetrical";
  else label = "Notable asymmetry";
  return `${clampedScore}/100 — ${label}`;
}

function changeText(changeScore: number | null | undefined): string {
  if (changeScore == null) return "Change score: —";
  const score = Number(changeScore);
  let label = "Stable";
  if (score < 0.1) label = "Stable";
  else if (score < 0.25) label = "Minor variation detected";
  else if (score < 0.45) label = "Moderate variation detected";
  else if (score < 0.7) label = "Higher variation detected";
  else label = "Strong variation detected";
  return `Change score: ${score.toFixed(1)} — ${label}`;
}

async function sha256Hex(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function ClinicalSummary() {
  const { user } = useAuth();
  const { sessionId } = useParams();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sessionCreatedAt, setSessionCreatedAt] = useState<string | null>(null);
  const [sessionType, setSessionType] = useState<string | null>("full");
  const [previewMap, setPreviewMap] = useState<ImagePreviewMap>({});
  const [baselinePreviewMap, setBaselinePreviewMap] = useState<ImagePreviewMap>({});
  const [analysisData, setAnalysisData] = useState<AnalysisResponse | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [hashedUserId, setHashedUserId] = useState<string>("—");
  const [isPrinting, setIsPrinting] = useState(false);

  const dataLoadedRef = useRef(false);

  const sessionDate = sessionCreatedAt ? new Date(sessionCreatedAt) : null;
  const createdAtDate = sessionDate ?? new Date();

  const availableAngles = captureOrder.filter(
    (angle) => previewMap[angle]?.length,
  );

  const hasBaseline = availableAngles.some(
    (angle) => baselinePreviewMap[angle]?.length,
  );

  const scores = analysisData?.data?.scores;
  const symmetryScore = scores?.symmetry_score;
  const changeScore =
    scores?.change_score ?? scores?.angle_aware_score ?? null;

  useEffect(() => {
    if (user?.id) {
      sha256Hex(user.id).then(setHashedUserId).catch(() => setHashedUserId("—"));
    }
  }, [user?.id]);

  useEffect(() => {
    let active = true;

    const loadSummaryData = async () => {
      if (!user || !sessionId) {
        setLoading(false);
        return;
      }

      if (dataLoadedRef.current) return;

      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData.session?.access_token || "";
        if (!token) throw new Error("Not authenticated");

        const API_URL = import.meta.env.VITE_API_URL || "";

        const sessionInfoPromise = apiClient.getSessionInfo(sessionId, token);

        const sessionRowPromise = supabase
          .from("sessions")
          .select("id, created_at, session_type")
          .eq("id", sessionId)
          .eq("user_id", user.id)
          .single();

        const profilePromise = supabase
          .from("user_profiles")
          .select("id, age_range, last_menstrual_period, created_at, updated_at")
          .eq("id", user.id)
          .single();

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
          .catch((err) => console.error("Analysis fetch error:", err));

        const [sessionInfo, sessionRowResult, profileResult] = await Promise.all([
          sessionInfoPromise,
          sessionRowPromise,
          profilePromise,
        ]);

        if (!active) return;

        if (sessionRowResult.error) {
          throw new Error("Session not found");
        }

        setSessionCreatedAt(sessionRowResult.data?.created_at ?? null);
        setSessionType(sessionRowResult.data?.session_type ?? "full");

        if (profileResult.data && !profileResult.error) {
          setProfile(profileResult.data as UserProfile);
        }

        const previousSessionId = sessionInfo.previous_session_id;

        const imageTypes = captureOrder;
        await Promise.all(
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
        );

        if (previousSessionId) {
          await Promise.all(
            imageTypes.map(async (imageType) => {
              try {
                const imageResponse = await apiClient.getImagePreview(
                  previousSessionId,
                  imageType,
                  token,
                );
                if (active) {
                  setBaselinePreviewMap((prev) => ({
                    ...prev,
                    [imageType]: imageResponse.images,
                  }));
                }
              } catch {
                // angle may not exist, skip
              }
            }),
          );
        }

        await analysisPromise;

        setLoading(false);
        dataLoadedRef.current = true;
      } catch (err) {
        if (active) {
          const message =
            err instanceof Error ? err.message : "Failed to load clinical summary";
          setError(message);
          setLoading(false);
        }
      }
    };

    loadSummaryData();
    return () => {
      active = false;
      dataLoadedRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, sessionId]);

  const handlePrint = () => {
    setIsPrinting(true);
    window.setTimeout(() => {
      window.print();
      window.setTimeout(() => setIsPrinting(false), 300);
    }, 100);
  };

  if (loading) {
    return (
      <PageShell className="max-w-4xl space-y-8">
        <div className="space-y-4">
          <Skeleton className="h-8 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
        </div>
        <Card className="space-y-6">
          <Skeleton className="h-6 w-1/3" />
          <div className="grid gap-4 sm:grid-cols-2">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        </Card>
        <div className="grid gap-4 sm:grid-cols-2">
          {[0, 1].map((i) => (
            <Skeleton key={i} className="aspect-[4/3] w-full" />
          ))}
        </div>
      </PageShell>
    );
  }

  if (error) {
    return (
      <PageShell className="max-w-4xl">
        <Card className="text-center">
          <div className="flex flex-col items-center gap-3">
            <AlertCircle className="h-10 w-10 text-red-600" />
            <h1 className="text-lg font-heading font-semibold text-ink-900">
              Could not load clinical summary
            </h1>
            <p className="text-sm text-ink-700 max-w-md">{error}</p>
          </div>
        </Card>
      </PageShell>
    );
  }

  return (
    <>
      <PageShell
        className="max-w-4xl clinical-summary print:max-w-none print:p-0"
        aria-busy={isPrinting}
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between print:hidden">
          <div>
            <h1 className="text-2xl sm:text-3xl font-heading font-semibold text-ink-900">
              Clinical summary
            </h1>
            <p className="text-sm text-ink-700">
              Share this report with your healthcare provider.
            </p>
          </div>
          <Button
            onClick={handlePrint}
            className="inline-flex items-center gap-2"
            aria-label="Download or print report"
          >
            <Download className="h-4 w-4" aria-hidden />
            Download report
          </Button>
        </div>

        <section
          className="rounded-2xl border border-sand-200 bg-white p-6 sm:p-8 shadow-sm print:rounded-none print:border-0 print:bg-white print:shadow-none print:p-0"
          aria-labelledby="report-heading"
        >
          <header className="border-b border-sand-200 pb-6 mb-6 print:border-b print:border-gray-300">
            <div className="flex items-start gap-3">
              <Stethoscope className="h-7 w-7 text-tide-700 print:hidden" aria-hidden />
              <div>
                <h2 id="report-heading" className="text-xl sm:text-2xl font-heading font-semibold text-ink-900">
                  BCD Clinical Summary — {formatDate(createdAtDate)}
                </h2>
                <p className="mt-1 text-sm text-ink-700">
                  Generated for clinical review from self-captured photographs.
                </p>
              </div>
            </div>
          </header>

          <section className="mb-8" aria-labelledby="patient-heading">
            <h3
              id="patient-heading"
              className="text-sm font-semibold uppercase tracking-wider text-ink-700 mb-3"
            >
              Patient information
            </h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-xl bg-sand-50 p-4 print:bg-white print:border print:border-gray-200">
                <div className="flex items-center gap-2 text-ink-700 mb-1">
                  <User className="h-4 w-4" aria-hidden />
                  <span className="text-xs font-semibold uppercase tracking-wider">
                    Age range
                  </span>
                </div>
                <p className="text-base font-medium text-ink-900">
                  {ageRangeLabel(profile)}
                </p>
              </div>
              <div className="rounded-xl bg-sand-50 p-4 print:bg-white print:border print:border-gray-200">
                <div className="flex items-center gap-2 text-ink-700 mb-1">
                  <CalendarDays className="h-4 w-4" aria-hidden />
                  <span className="text-xs font-semibold uppercase tracking-wider">
                    Last menstrual period
                  </span>
                </div>
                <p className="text-base font-medium text-ink-900">
                  {lastMenstrualPeriodLabel(profile)}
                </p>
              </div>
            </div>
          </section>

          <section className="mb-8" aria-labelledby="session-heading">
            <h3
              id="session-heading"
              className="text-sm font-semibold uppercase tracking-wider text-ink-700 mb-3"
            >
              Session details
            </h3>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="rounded-xl bg-sand-50 p-4 print:bg-white print:border print:border-gray-200">
                <div className="flex items-center gap-2 text-ink-700 mb-1">
                  <CalendarDays className="h-4 w-4" aria-hidden />
                  <span className="text-xs font-semibold uppercase tracking-wider">
                    Date
                  </span>
                </div>
                <p className="text-base font-medium text-ink-900">
                  {formatDate(createdAtDate)}
                </p>
              </div>
              <div className="rounded-xl bg-sand-50 p-4 print:bg-white print:border print:border-gray-200">
                <div className="flex items-center gap-2 text-ink-700 mb-1">
                  <Clock3 className="h-4 w-4" aria-hidden />
                  <span className="text-xs font-semibold uppercase tracking-wider">
                    Time
                  </span>
                </div>
                <p className="text-base font-medium text-ink-900">
                  {formatTime(createdAtDate)}
                </p>
              </div>
              <div className="rounded-xl bg-sand-50 p-4 print:bg-white print:border print:border-gray-200">
                <div className="flex items-center gap-2 text-ink-700 mb-1">
                  <Camera className="h-4 w-4" aria-hidden />
                  <span className="text-xs font-semibold uppercase tracking-wider">
                    Session type
                  </span>
                </div>
                <p className="text-base font-medium text-ink-900">
                  {sessionTypeLabel(sessionType)}
                </p>
              </div>
            </div>
            <p className="mt-4 text-sm text-ink-700">
              <span className="font-semibold">Angles captured:</span>{" "}
              {availableAngles.length > 0
                ? availableAngles.map((a) => angleDisplayNames[a]).join(", ")
                : "None"}
            </p>
          </section>

          {(symmetryScore != null || changeScore != null) && (
            <section className="mb-8" aria-labelledby="scores-heading">
              <h3
                id="scores-heading"
                className="text-sm font-semibold uppercase tracking-wider text-ink-700 mb-3"
              >
                Summary scores
              </h3>
              <div className="grid gap-4 sm:grid-cols-2">
                {symmetryScore != null && (
                  <div className="rounded-xl bg-emerald-50 p-4 border border-emerald-100 print:bg-white print:border-gray-200">
                    <p className="text-xs font-semibold uppercase tracking-wider text-emerald-800 print:text-ink-700">
                      Symmetry score
                    </p>
                    <p className="mt-1 text-lg font-semibold text-emerald-900 print:text-ink-900">
                      {symmetryText(symmetryScore)}
                    </p>
                  </div>
                )}
                {changeScore != null && (
                  <div className="rounded-xl bg-blue-50 p-4 border border-blue-100 print:bg-white print:border-gray-200">
                    <p className="text-xs font-semibold uppercase tracking-wider text-blue-800 print:text-ink-700">
                      Change from baseline
                    </p>
                    <p className="mt-1 text-lg font-semibold text-blue-900 print:text-ink-900">
                      {changeText(changeScore)}
                    </p>
                  </div>
                )}
              </div>
            </section>
          )}

          <section className="mb-8" aria-labelledby="images-heading">
            <h3
              id="images-heading"
              className="text-sm font-semibold uppercase tracking-wider text-ink-700 mb-3"
            >
              Images
            </h3>
            {availableAngles.length === 0 ? (
              <div className="rounded-xl bg-sand-50 p-6 text-center text-sm text-ink-700 print:bg-white print:border print:border-gray-200">
                No images are available for this session.
              </div>
            ) : (
              <div className="space-y-8">
                {availableAngles.map((angle) => {
                  const currentUrl = previewMap[angle]?.[0]?.preview_url;
                  const baselineUrl = baselinePreviewMap[angle]?.[0]?.preview_url;
                  const showBaseline = hasBaseline && baselineUrl;

                  return (
                    <div key={angle} className="break-inside-avoid">
                      <h4 className="text-base font-semibold text-ink-900 mb-3">
                        {angleDisplayNames[angle]}
                      </h4>
                      <div
                        className={`grid gap-4 ${
                          showBaseline ? "sm:grid-cols-2" : "sm:grid-cols-1"
                        }`}
                      >
                        <figure className="space-y-2">
                          <div className="relative aspect-[4/3] w-full overflow-hidden rounded-xl bg-sand-100 print:rounded-none print:border print:border-gray-200">
                            {currentUrl ? (
                              <img
                                src={currentUrl}
                                alt={`${angleDisplayNames[angle]} from this session`}
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center text-sm text-ink-700">
                                No image
                              </div>
                            )}
                          </div>
                          <figcaption className="text-xs text-ink-600 text-center">
                            Current session
                          </figcaption>
                        </figure>
                        {showBaseline && (
                          <figure className="space-y-2">
                            <div className="relative aspect-[4/3] w-full overflow-hidden rounded-xl bg-sand-100 print:rounded-none print:border print:border-gray-200">
                              {baselineUrl ? (
                                <img
                                  src={baselineUrl}
                                  alt={`${angleDisplayNames[angle]} from baseline session`}
                                  className="h-full w-full object-cover"
                                />
                              ) : (
                                <div className="flex h-full w-full items-center justify-center text-sm text-ink-700">
                                  No baseline image
                                </div>
                              )}
                            </div>
                            <figcaption className="text-xs text-ink-600 text-center">
                              Baseline
                            </figcaption>
                          </figure>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <section
            className="rounded-xl border-l-4 border-amber-400 bg-amber-50 p-4 print:bg-white print:border print:border-gray-300 print:border-l-4"
            aria-labelledby="disclaimer-heading"
          >
            <h3
              id="disclaimer-heading"
              className="text-sm font-semibold uppercase tracking-wider text-amber-900 print:text-ink-900 mb-1"
            >
              Important disclaimer
            </h3>
            <p className="text-sm text-amber-900 print:text-ink-900">
              This report is generated from self-captured photographs and is NOT a
              medical diagnosis. Consult a healthcare provider for clinical evaluation.
            </p>
          </section>

          <footer className="mt-8 border-t border-sand-200 pt-4 text-xs text-ink-600 print:border-t print:border-gray-300">
            <p>
              Generated by BCD on {formatDate(new Date())} at{" "}
              {formatTime(new Date())} · User ID (hashed): {hashedUserId}
            </p>
          </footer>
        </section>
      </PageShell>

      <style>{`
        @media print {
          @page {
            margin: 1.25cm;
            size: auto;
          }

          body {
            background: white !important;
            color: #1b1b1b !important;
          }

          header,
          nav,
          .clinical-summary ~ *,
          .clinical-summary [aria-label="Download or print report"] {
            display: none !important;
          }

          .clinical-summary {
            max-width: none !important;
            padding: 0 !important;
            margin: 0 !important;
          }

          .clinical-summary img {
            max-width: 100%;
            page-break-inside: avoid;
          }

          .clinical-summary section {
            page-break-inside: avoid;
          }

          .break-inside-avoid {
            page-break-inside: avoid;
          }
        }

        @media screen and (max-width: 640px) {
          .clinical-summary section {
            padding: 1rem;
          }
        }
      `}</style>
    </>
  );
}
