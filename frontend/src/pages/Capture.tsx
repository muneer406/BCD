import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Camera,
  Lightbulb,
  Ruler,
  HelpCircle,
  AlertCircle,
} from "lucide-react";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { ImageModal } from "../components/ImageModal";
import { PageShell } from "../components/PageShell";
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
        throw new Error(
          `Failed to save ${failedImages.length} image(s):\n${failedImages.join("\n")}`,
        );
      }

      clearDraft();
      navigate(`/result/${sessionId}`, { replace: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : "An error occurred";
      setError(message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <PageShell className="space-y-10">
      <SectionHeading
        eyebrow="Capture session"
        title="Capture from 6 angles"
        description="Follow each angle for consistent results."
      />

      {/* Prominent guidelines */}
      <div className="rounded-2xl sm:rounded-3xl border-2 border-tide-300 bg-gradient-to-r from-tide-50 to-transparent p-4 sm:p-6">
        <div className="space-y-2 sm:space-y-3">
          <h3 className="font-semibold text-tide-900 text-base sm:text-lg">
            ✨ For best results, keep these consistent:
          </h3>
          <div className="grid gap-2 md:grid-cols-3">
            <div className="flex items-start gap-2 sm:gap-3">
              <Lightbulb className="h-4 w-4 sm:h-5 sm:w-5 text-tide-900 flex-shrink-0" />
              <div className="min-w-0">
                <p className="font-semibold text-xs sm:text-sm text-tide-900">
                  Bright, even lighting
                </p>
                <p className="text-xs text-tide-800">
                  Avoid shadows and harsh light
                </p>
              </div>
            </div>
            <div className="flex items-start gap-2 sm:gap-3">
              <Ruler className="h-4 w-4 sm:h-5 sm:w-5 text-tide-900 flex-shrink-0" />
              <div className="min-w-0">
                <p className="font-semibold text-xs sm:text-sm text-tide-900">
                  Same distance & angle
                </p>
                <p className="text-xs text-tide-800">
                  Keep your position steady per session
                </p>
              </div>
            </div>
            <div className="flex items-start gap-2 sm:gap-3">
              <Camera className="h-4 w-4 sm:h-5 sm:w-5 text-tide-900 flex-shrink-0" />
              <div className="min-w-0">
                <p className="font-semibold text-xs sm:text-sm text-tide-900">
                  Multiple images per angle
                </p>
                <p className="text-xs text-tide-800">
                  More = better detection accuracy
                </p>
              </div>
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

                  <div className="flex flex-col gap-2">
                    <label
                      className={`flex items-center justify-center rounded-lg bg-sand-50 px-2 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm font-medium transition-colors ${
                        saving
                          ? "pointer-events-none cursor-not-allowed opacity-50 text-ink-400"
                          : "cursor-pointer text-ink-700 hover:bg-sand-100"
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
                      + Add more
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
                      className="text-xs self-center"
                    >
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
    </PageShell>
  );
}
