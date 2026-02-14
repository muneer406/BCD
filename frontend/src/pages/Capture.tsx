import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { ImageModal } from "../components/ImageModal";
import { PageShell } from "../components/PageShell";
import { SectionHeading } from "../components/SectionHeading";
import { useAuth } from "../context/AuthContext";
import { useDraft } from "../context/DraftContext";
import { captureSteps } from "../data/captureSteps";
import { supabase } from "../lib/supabaseClient";

function getFileExtension(file: File) {
  const parts = file.name.split(".");
  return parts.length > 1 ? parts.pop() : "jpg";
}

export function Capture() {
  const { user } = useAuth();
  const { images, setImage, removeImage, clearDraft } = useDraft();
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

      // Save all images (including duplicates per type)
      for (const image of images) {
        const ext = getFileExtension(image.file);
        // Use timestamp to ensure unique filename for each save
        const timestamp = Date.now();
        const randomSuffix = Math.random().toString(36).slice(2, 9);
        const path = `${user.id}/${sessionId}/${image.type}_${timestamp}_${randomSuffix}.${ext}`;

        // Save to storage
        const { error: saveError } = await supabase.storage
          .from("bcd-images")
          .upload(path, image.file);

        if (saveError) {
          throw new Error(`Failed to save ${image.label}`);
        }

        // Get signed URL (expires in 1 hour for security)
        const { data: signedUrlData, error: urlError } = await supabase.storage
          .from("bcd-images")
          .createSignedUrl(path, 3600); // 1 hour expiration

        if (urlError || !signedUrlData) {
          throw new Error(`Failed to generate secure URL for ${image.label}`);
        }

        // Save metadata with signed URL
        const { error: dbError } = await supabase.from("images").insert({
          user_id: user.id,
          session_id: sessionId,
          image_type: image.type,
          image_url: signedUrlData.signedUrl,
        });

        if (dbError) {
          throw new Error(`Failed to save ${image.label} details`);
        }
      }

      clearDraft();
      navigate("/result", { replace: true });
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
        description="Follow each angle for consistent results. Tip: More images per angle = better insights."
      />

      {/* Prominent guidelines */}
      <div className="rounded-3xl border-2 border-tide-300 bg-gradient-to-r from-tide-50 to-transparent p-6">
        <div className="space-y-3">
          <h3 className="font-semibold text-tide-900 text-lg">
            ✨ For best results, keep these consistent:
          </h3>
          <div className="grid gap-2 md:grid-cols-3">
            <div className="flex items-start gap-3">
              <span className="text-xl">💡</span>
              <div>
                <p className="font-semibold text-sm text-tide-900">
                  Bright, even lighting
                </p>
                <p className="text-xs text-tide-800">
                  Avoid shadows and harsh light
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <span className="text-xl">📏</span>
              <div>
                <p className="font-semibold text-sm text-tide-900">
                  Same distance & angle
                </p>
                <p className="text-xs text-tide-800">
                  Keep your position steady per session
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <span className="text-xl">📸</span>
              <div>
                <p className="font-semibold text-sm text-tide-900">
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
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="flex-1 rounded-full bg-sand-100 px-4 py-3">
            <p className="text-sm font-semibold text-ink-900">
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
      <div className="grid gap-6 md:grid-cols-2">
        {captureSteps.map((step) => {
          const typeImages = imagesByType.get(step.type) || [];
          const hasImages = typeImages.length > 0;

          return (
            <Card key={step.type} className="space-y-4">
              <div className="space-y-1">
                <h3 className="text-lg font-heading font-semibold text-ink-900">
                  {step.label}
                </h3>
                <p className="text-sm text-ink-700">{step.guidance}</p>
                {hasImages && (
                  <p className="text-xs text-sand-600 font-medium">
                    {typeImages.length} image
                    {typeImages.length !== 1 ? "s" : ""} captured ✓
                  </p>
                )}
              </div>

              {hasImages ? (
                <div className="space-y-3">
                  {/* Gallery grid for multiple images */}
                  {typeImages.length === 1 ? (
                    <ImageModal src={typeImages[0].previewUrl} alt={step.label}>
                      <img
                        src={typeImages[0].previewUrl}
                        alt={step.label}
                        className="h-48 w-full rounded-2xl object-cover"
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
                          <div className="relative rounded-2xl overflow-hidden bg-sand-100">
                            <img
                              src={img.previewUrl}
                              alt={`${step.label} ${idx + 1}`}
                              className="h-32 w-full object-cover hover:opacity-90 transition-opacity"
                            />
                            <div className="absolute top-1 right-1 bg-ink-900 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs font-semibold">
                              {idx + 1}
                            </div>
                          </div>
                        </ImageModal>
                      ))}
                    </div>
                  )}

                  <div className="flex flex-col gap-2">
                    <label className="flex cursor-pointer items-center justify-center rounded-lg bg-sand-50 px-3 py-2 text-sm font-medium text-ink-700 transition-colors hover:bg-sand-100">
                      <input
                        type="file"
                        accept="image/*"
                        capture="environment"
                        className="hidden"
                        onChange={(event) => {
                          const file = event.target.files?.[0];
                          if (!file) return;
                          setImage({
                            type: step.type,
                            label: step.label,
                            file,
                            previewUrl: URL.createObjectURL(file),
                          });
                        }}
                      />
                      + Add more
                    </label>
                    <Button
                      variant="outline"
                      onClick={() => {
                        // Remove the last image of this type
                        if (typeImages.length > 0) {
                          removeImage(step.type);
                        }
                      }}
                      className="text-xs"
                    >
                      Remove last
                    </Button>
                  </div>
                </div>
              ) : (
                <label className="flex h-48 cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-sand-300 bg-sand-50 transition-colors hover:bg-sand-100">
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (!file) return;
                      setImage({
                        type: step.type,
                        label: step.label,
                        file,
                        previewUrl: URL.createObjectURL(file),
                      });
                    }}
                  />
                  <span className="text-4xl">📸</span>
                  <span className="mt-2 text-sm font-semibold text-ink-900">
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
        <div className="rounded-2xl bg-red-50 p-4 text-sm text-red-900">
          <p className="font-semibold">Something went wrong</p>
          <p className="mt-1">{error}</p>
        </div>
      )}

      {/* Save button */}
      <div className="flex items-center gap-4">
        <Button
          onClick={handleSaveSession}
          disabled={!allStepsPresent || saving}
          className="flex-1 md:flex-none"
        >
          {saving ? "Saving session..." : "Save session"}
        </Button>
        {!allStepsPresent && (
          <p className="text-sm text-ink-700">Complete all 6 angles to save</p>
        )}
      </div>
    </PageShell>
  );
}
