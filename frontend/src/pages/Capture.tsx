import { useMemo, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  Aperture,
  Camera,
  CheckCircle2,
  Images,
  Lightbulb,
  Plus,
  Ruler,
  HelpCircle,
  AlertCircle,
  Sparkles,
  Trash2,
} from "lucide-react";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { ImageModal } from "../components/ImageModal";
import { PageShell } from "../components/PageShell";
import { SimpleModal } from "../components/SimpleModal";
import { SectionHeading } from "../components/SectionHeading";
import { useAuth } from "../context/AuthContext";
import { useDraft } from "../context/DraftContext";
import { captureSteps } from "../data/captureSteps";
import { supabase } from "../lib/supabaseClient";

const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

function getFileExtension(file: File): string {
  // Determine extension from MIME type for safety
  const mimeType = file.type.toLowerCase();
  if (mimeType === "image/jpeg") return "jpg";
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/webp") return "webp";

  // Fallback to filename extension
  const parts = file.name.split(".");
  const ext = parts.length > 1 ? parts.pop()?.toLowerCase() : null;

  // Default to jpg if unknown
  return ext && ["jpg", "jpeg", "png", "webp"].includes(ext) ? ext : "jpg";
}

function validateImageFile(file: File): { valid: boolean; error?: string } {
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
    return {
      valid: false,
      error: `Invalid image format. Supported: JPEG, PNG, WebP (Got: ${file.type})`,
    };
  }

  if (file.size > MAX_FILE_SIZE) {
    return {
      valid: false,
      error: `File too large. Maximum size: 10MB (Got: ${(file.size / 1024 / 1024).toFixed(2)}MB)`,
    };
  }

  return { valid: true };
}

export function Capture() {
  const { user } = useAuth();
  const { images, setImage, removeImage, clearDraft } = useDraft();
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedTooltip, setExpandedTooltip] = useState<string | null>(null);
  const [showSixImageWarning, setShowSixImageWarning] = useState(false);
  const sixImageWarningShownRef = useRef(false);

  // Angle explanations for tooltips
  const angleExplanations: Record<string, string> = {
    front:
      "Straight-on view of the front. Shows symmetry and overall contour from the center perspective.",
    left: "Left side view. Captures the profile and any changes visible from this angle.",
    right:
      "Right side view. Complements the left side for full awareness of lateral changes.",
    up: "Upward angled view. Reveals how the area appears from above.",
    down: "Downward angled view. Shows how the area appears from below for complete perspective.",
    "full-body": "Full body view showing the overall proportions and context.",
  };

  // Get all images grouped by type
  const imagesByType = useMemo(() => {
    const groups = new Map<string, typeof images>();
    for (const image of images) {
      if (!groups.has(image.type)) {
        groups.set(image.type, []);
      }
      groups.get(image.type)!.push(image);
    }
    return groups;
  }, [images]);

  const allStepsPresent = captureSteps.every((step) =>
    imagesByType.has(step.type),
  );
  const completedCount = captureSteps.filter((step) =>
    imagesByType.has(step.type),
  ).length;

  const handleSaveSession = async () => {
    if (!user || !allStepsPresent) return;
    // Only show warning if exactly 6 images (1 per angle), and not already shown for this submission
    const totalImages = images.length;
    if (totalImages === 6 && !sixImageWarningShownRef.current) {
      setShowSixImageWarning(true);
      return;
    }
    setSaving(true);
    setError(null);

    try {
      // Validate all files before starting upload
      const uploadErrors: string[] = [];
      for (const image of images) {
        const validation = validateImageFile(image.file);
        if (!validation.valid) {
          uploadErrors.push(`${image.label}: ${validation.error}`);
        }
      }

      if (uploadErrors.length > 0) {
        throw new Error(uploadErrors.join("\n"));
      }

      // Create session
      const { data: sessionData, error: sessionError } = await supabase
        .from("sessions")
        .insert({ user_id: user.id })
        .select("id")
        .single();

      if (sessionError || !sessionData) {
        throw new Error("Unable to create session. Please try again.");
      }

      const sessionId = sessionData.id as string;
      const failedImages: string[] = [];
      const uploadedPaths: string[] = [];

      // Save all images (including duplicates per type)
      for (const image of images) {
        try {
          const ext = getFileExtension(image.file);
          // Use timestamp to ensure unique filename for each save
          const timestamp = Date.now();
          const randomSuffix = Math.random().toString(36).slice(2, 9);
          const path = `${user.id}/${sessionId}/${image.type}_${timestamp}_${randomSuffix}.${ext}`;

          // Save to storage
          const { error: saveError } = await supabase.storage
            .from("bcd-images")
            .upload(path, image.file, {
              cacheControl: "3600",
              upsert: false,
            });

          if (saveError) {
            failedImages.push(`${image.label}: ${saveError.message}`);
            continue;
          }
          uploadedPaths.push(path);

          // Save metadata with storage path
          const { error: dbError } = await supabase.from("images").insert({
            user_id: user.id,
            session_id: sessionId,
            image_type: image.type,
            storage_path: path,
          });

          if (dbError) {
            // Attempt cleanup: delete uploaded file if DB insert fails
            try {
              await supabase.storage.from("bcd-images").remove([path]);
            } catch {
              // Cleanup failure is non-critical
            }
            failedImages.push(`${image.label}: ${dbError.message}`);
          }
        } catch (err) {
          failedImages.push(
            `${image.label}: ${err instanceof Error ? err.message : "Unknown error"}`,
          );
        }
      }

      if (failedImages.length > 0) {
        const cleanupErrors: string[] = [];

        // Best-effort cleanup of storage objects uploaded during this attempt
        try {
          const chunkSize = 100;
          for (
            let start = 0;
            start < uploadedPaths.length;
            start += chunkSize
          ) {
            const chunk = uploadedPaths.slice(start, start + chunkSize);
            if (chunk.length === 0) continue;
            const { error: removeError } = await supabase.storage
              .from("bcd-images")
              .remove(chunk);
            if (removeError) {
              cleanupErrors.push(
                `Storage cleanup failed: ${removeError.message}`,
              );
            }
          }
        } catch (cleanupErr) {
          cleanupErrors.push(
            `Storage cleanup error: ${cleanupErr instanceof Error ? cleanupErr.message : "Unknown error"}`,
          );
        }

        // Remove session so any inserted image rows are rolled back via cascade
        try {
          const { error: sessionDeleteError } = await supabase
            .from("sessions")
            .delete()
            .eq("id", sessionId)
            .eq("user_id", user.id);
          if (sessionDeleteError) {
            cleanupErrors.push(
              `Session rollback failed: ${sessionDeleteError.message}`,
            );
          }
        } catch (rollbackErr) {
          cleanupErrors.push(
            `Session rollback error: ${rollbackErr instanceof Error ? rollbackErr.message : "Unknown error"}`,
          );
        }

        const cleanupSuffix =
          cleanupErrors.length > 0
            ? `\n\nRollback warnings:\n${cleanupErrors.join("\n")}`
            : "";
        throw new Error(
          `Failed to save ${failedImages.length} image(s):\n${failedImages.join("\n")}${cleanupSuffix}`,
        );
      }

      clearDraft();
      sixImageWarningShownRef.current = false; // reset for next submission
      navigate(`/result/${sessionId}`, { replace: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : "An error occurred";
      setError(message);
    } finally {
      setSaving(false);
    }
  };

  // Handler for confirming the warning and proceeding
  const handleSixImageWarningProceed = () => {
    setShowSixImageWarning(false);
    sixImageWarningShownRef.current = true;
    handleSaveSession();
  };

  // Handler for canceling and letting user add more images
  const handleSixImageWarningCancel = () => {
    setShowSixImageWarning(false);
  };

  return (
    <PageShell className="space-y-10">
      <SectionHeading
        eyebrow="Capture session"
        title="Capture from 6 angles"
        description="Follow each angle for consistent results."
      />

      <div className="relative overflow-hidden rounded-2xl sm:rounded-3xl border border-tide-200 bg-[linear-gradient(135deg,rgba(232,242,247,0.96),rgba(248,244,238,0.94))] p-5 sm:p-6 shadow-lift">
        <div className="pointer-events-none absolute -right-12 top-0 h-28 w-28 rounded-full bg-tide-200/40 blur-3xl" />
        <div className="pointer-events-none absolute bottom-0 left-0 h-24 w-24 rounded-full bg-indigo-100/60 blur-2xl" />

        <div className="relative space-y-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-2">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/70 bg-white/70 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-tide-800">
                <Sparkles className="h-3.5 w-3.5" />
                Capture guide
              </div>
              <div>
                <h3 className="text-lg sm:text-xl font-heading font-semibold text-ink-900">
                  Make each session more consistent and more useful
                </h3>
                <p className="mt-1 max-w-2xl text-sm text-ink-700">
                  Keep the setup steady, then add a little variation within each
                  angle so the analysis has stronger material to compare.
                </p>
              </div>
            </div>

            <div className="inline-flex items-center gap-2 self-start rounded-2xl border border-indigo-200 bg-white/80 px-4 py-3 text-sm font-semibold text-indigo-900 shadow-sm">
              <Images className="h-4 w-4" />
              More images per angle can improve reliability
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-2xl border border-white/80 bg-white/70 p-4">
              <div className="flex items-start gap-3">
                <Lightbulb className="mt-0.5 h-5 w-5 text-tide-900" />
                <div>
                  <p className="text-sm font-semibold text-ink-900">
                    Use bright, even lighting
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-ink-700">
                    Reduce shadows and harsh highlights so details stay easy to
                    compare.
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-white/80 bg-white/70 p-4">
              <div className="flex items-start gap-3">
                <Ruler className="mt-0.5 h-5 w-5 text-tide-900" />
                <div>
                  <p className="text-sm font-semibold text-ink-900">
                    Keep distance and framing stable
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-ink-700">
                    Try to repeat the same camera distance and body position in
                    each session.
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-white/80 bg-white/70 p-4">
              <div className="flex items-start gap-3">
                <Aperture className="mt-0.5 h-5 w-5 text-indigo-900" />
                <div>
                  <p className="text-sm font-semibold text-ink-900">
                    Slightly shift between repeated shots
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-ink-700">
                    Small camera or posture changes help avoid nearly identical
                    duplicates.
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-white/80 bg-white/70 p-4">
              <div className="flex items-start gap-3">
                <Camera className="mt-0.5 h-5 w-5 text-indigo-900" />
                <div>
                  <p className="text-sm font-semibold text-ink-900">
                    Let the background vary a bit
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-ink-700">
                    A little scene variation can help the capture set stay more
                    robust.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-3 rounded-2xl border border-indigo-200/80 bg-ink-900 px-4 py-4 text-sand-50 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="mt-0.5 h-5 w-5 flex-shrink-0 text-green-300" />
              <p className="text-sm leading-relaxed text-sand-100">
                Capture at least one clear image for each angle. If you can add
                a few extra shots per angle, the comparison can become more
                reliable and more resilient to minor capture differences.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Progress */}
      <div className="space-y-3 sm:space-y-4">
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="flex-1 rounded-full bg-sand-100 px-3 sm:px-4 py-2 sm:py-3">
            <p className="text-xs sm:text-sm font-semibold text-ink-900">
              {completedCount} of {captureSteps.length} angles captured
            </p>
            <div className="mt-2 h-2 w-full rounded-full bg-sand-200">
              <div
                className="h-full rounded-full bg-ink-900 transition-all"
                style={{
                  width: `${(completedCount / captureSteps.length) * 100}%`,
                }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Image capture grid */}
      <div className="grid gap-4 sm:gap-6 md:grid-cols-2">
        {captureSteps.map((step) => {
          const typeImages = imagesByType.get(step.type) || [];
          const hasImages = typeImages.length > 0;

          return (
            <Card key={step.type} className="space-y-3 sm:space-y-4">
              <div className="space-y-1">
                <div className="flex items-center gap-1 sm:gap-2">
                  <h3 className="text-base sm:text-lg font-heading font-semibold text-ink-900">
                    {step.label}
                  </h3>
                  <button
                    type="button"
                    onClick={() =>
                      setExpandedTooltip(
                        expandedTooltip === step.type ? null : step.type,
                      )
                    }
                    className="inline-flex items-center justify-center rounded-full p-1 hover:bg-sand-100 transition-colors flex-shrink-0"
                    title={angleExplanations[step.type] || ""}
                  >
                    <HelpCircle className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-ink-600" />
                  </button>
                </div>

                {expandedTooltip === step.type && (
                  <div className="mt-2 rounded-lg bg-blue-50 border border-blue-200 p-2 sm:p-3">
                    <p className="text-xs sm:text-sm text-blue-900">
                      {angleExplanations[step.type] || step.guidance}
                    </p>
                  </div>
                )}

                <p className="text-xs sm:text-sm text-ink-700">
                  {step.guidance}
                </p>
                {hasImages && (
                  <p className="text-xs text-sand-600 font-medium">
                    {typeImages.length} image
                    {typeImages.length !== 1 ? "s" : ""} captured ✓
                  </p>
                )}
              </div>

              {hasImages ? (
                <div className="space-y-2 sm:space-y-3">
                  {/* Gallery grid for multiple images */}
                  {typeImages.length === 1 ? (
                    <ImageModal src={typeImages[0].previewUrl} alt={step.label}>
                      <img
                        src={typeImages[0].previewUrl}
                        alt={step.label}
                        className="h-40 sm:h-48 w-full rounded-lg sm:rounded-2xl object-cover"
                      />
                    </ImageModal>
                  ) : (
                    <div className="grid grid-cols-2 gap-2">
                      {typeImages.map((img, idx) => (
                        <ImageModal
                          key={idx}
                          src={img.previewUrl}
                          alt={`${step.label} ${idx + 1}`}
                        >
                          <div className="relative rounded-lg sm:rounded-2xl overflow-hidden bg-sand-100">
                            <img
                              src={img.previewUrl}
                              alt={`${step.label} ${idx + 1}`}
                              className="h-28 sm:h-32 w-full object-cover hover:opacity-90 transition-opacity"
                            />
                            <div className="absolute top-1 right-1 bg-ink-900 text-white rounded-full w-5 h-5 sm:w-6 sm:h-6 flex items-center justify-center text-xs font-semibold">
                              {idx + 1}
                            </div>
                          </div>
                        </ImageModal>
                      ))}
                    </div>
                  )}

                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <label
                      className={`flex min-h-[44px] w-full items-center justify-center gap-2 rounded-full border px-3 py-2 text-xs sm:text-sm font-semibold transition-colors ${
                        saving
                          ? "pointer-events-none cursor-not-allowed border-sand-200 bg-sand-100 text-ink-400 opacity-50"
                          : "cursor-pointer border-ink-900 bg-ink-900 text-sand-50 hover:bg-ink-800"
                      }`}
                    >
                      <input
                        type="file"
                        accept="image/*"
                        capture="environment"
                        className="hidden"
                        disabled={saving}
                        onChange={(event) => {
                          const file = event.target.files?.[0];
                          if (!file) return;

                          // Validate file
                          const validation = validateImageFile(file);
                          if (!validation.valid) {
                            setError(validation.error || "Invalid file");
                            setTimeout(() => setError(null), 5000);
                            return;
                          }

                          setImage({
                            type: step.type,
                            label: step.label,
                            file,
                            previewUrl: URL.createObjectURL(file),
                          });
                          setError(null);
                        }}
                      />
                      <Plus className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                      Add more
                    </label>
                    <Button
                      variant="outline"
                      disabled={saving}
                      onClick={() => {
                        // Remove the last image of this type
                        if (typeImages.length > 0) {
                          removeImage(step.type);
                        }
                      }}
                      className="min-h-[44px] w-full gap-2 rounded-full border-red-200 text-xs text-red-700 hover:bg-red-50 active:bg-red-100"
                    >
                      <Trash2 className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                      Remove last
                    </Button>
                  </div>
                </div>
              ) : (
                <label
                  className={`flex h-40 sm:h-48 flex-col items-center justify-center rounded-lg sm:rounded-2xl border-2 border-dashed border-sand-300 bg-sand-50 transition-colors ${saving ? "pointer-events-none cursor-not-allowed opacity-50" : "cursor-pointer hover:bg-sand-100"}`}
                >
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    disabled={saving}
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (!file) return;

                      // Validate file
                      const validation = validateImageFile(file);
                      if (!validation.valid) {
                        setError(validation.error || "Invalid file");
                        setTimeout(() => setError(null), 5000);
                        return;
                      }

                      setImage({
                        type: step.type,
                        label: step.label,
                        file,
                        previewUrl: URL.createObjectURL(file),
                      });
                      setError(null);
                    }}
                  />
                  <Camera className="h-8 w-8 sm:h-10 sm:w-10 text-ink-900" />
                  <span className="mt-2 text-xs sm:text-sm font-semibold text-ink-900">
                    Add image
                  </span>
                </label>
              )}
            </Card>
          );
        })}
      </div>

      {/* Error message */}
      {error && (
        <div className="rounded-lg sm:rounded-2xl bg-red-50 p-3 sm:p-4 border border-red-200">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm text-red-900">Error</p>
              <div className="mt-1 text-xs sm:text-sm text-red-800 whitespace-pre-wrap break-words">
                {error}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Save button */}
      <div className="flex flex-col sm:flex-row justify-center gap-3 sm:gap-4">
        <Button
          onClick={handleSaveSession}
          disabled={!allStepsPresent || saving}
          className="w-full sm:w-auto"
        >
          {saving ? "Saving session..." : "Save session"}
        </Button>
      </div>

      {/* 6-image warning modal */}
      <SimpleModal
        open={showSixImageWarning}
        onClose={handleSixImageWarningCancel}
      >
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-6 w-6 text-amber-600" />
            <h2 className="text-lg font-bold text-ink-900">
              More images recommended
            </h2>
          </div>
          <p className="text-ink-800 text-sm">
            You are submitting only{" "}
            <span className="font-semibold">1 image per angle</span> (6 total).
            <br />
            <span className="text-amber-700 font-semibold">
              For best accuracy, add more images for each angle if possible.
            </span>
            <br />
            More images help the system detect changes more reliably and reduce
            errors from lighting or pose.
          </p>
          <div className="flex gap-3 justify-end">
            <Button variant="outline" onClick={handleSixImageWarningCancel}>
              Go back & add more
            </Button>
            <Button onClick={handleSixImageWarningProceed}>
              Submit anyway
            </Button>
          </div>
        </div>
      </SimpleModal>
    </PageShell>
  );
}
