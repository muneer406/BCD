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
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const imageMap = useMemo(() => {
    const map = new Map(images.map((image) => [image.type, image]));
    return map;
  }, [images]);

  const allStepsPresent = captureSteps.every((step) => imageMap.has(step.type));
  const completedCount = captureSteps.filter((step) =>
    imageMap.has(step.type),
  ).length;

  const handleUploadSession = async () => {
    if (!user || !allStepsPresent) return;
    setUploading(true);
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

      // Upload all images
      for (const step of captureSteps) {
        const image = imageMap.get(step.type);
        if (!image) continue;

        const ext = getFileExtension(image.file);
        const path = `${user.id}/${sessionId}/${image.type}.${ext}`;

        // Upload to storage
        const { error: uploadError } = await supabase.storage
          .from("bcd-images")
          .upload(path, image.file, { upsert: true });

        if (uploadError) {
          throw new Error(`Failed to upload ${image.label}`);
        }

        // Get public URL
        const publicUrl = supabase.storage.from("bcd-images").getPublicUrl(path)
          .data.publicUrl;

        // Save metadata
        const { error: dbError } = await supabase.from("images").insert({
          user_id: user.id,
          session_id: sessionId,
          image_type: image.type,
          image_url: publicUrl,
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
      setUploading(false);
    }
  };

  return (
    <PageShell className="space-y-10">
      <SectionHeading
        eyebrow="Capture session"
        title="Capture from 6 angles"
        description="Follow each angle for consistent results. Tip: More images per angle = better insights."
      />

      {/* Progress and tips */}
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
        <div className="grid gap-2 md:grid-cols-2">
          <div className="rounded-2xl bg-tide-50 p-4 text-sm text-tide-900">
            <span className="font-semibold">💡 Tip:</span> Use consistent
            lighting and distance for better comparisons.
          </div>
          <div className="rounded-2xl bg-sand-50 p-4 text-sm text-ink-900">
            <span className="font-semibold">✓ All 6 angles required</span> to
            upload session.
          </div>
        </div>
      </div>

      {/* Image capture grid */}
      <div className="grid gap-6 md:grid-cols-2">
        {captureSteps.map((step) => {
          const captured = imageMap.get(step.type);
          return (
            <Card key={step.type} className="space-y-4">
              <div className="space-y-1">
                <h3 className="text-lg font-heading font-semibold text-ink-900">
                  {step.label}
                </h3>
                <p className="text-sm text-ink-700">{step.guidance}</p>
              </div>

              {captured ? (
                <div className="space-y-3">
                  <ImageModal src={captured.previewUrl} alt={step.label}>
                    <img
                      src={captured.previewUrl}
                      alt={step.label}
                      className="h-48 w-full rounded-2xl object-cover"
                    />
                  </ImageModal>
                  <div className="flex gap-3">
                    <Button
                      variant="outline"
                      onClick={() => removeImage(step.type)}
                      className="flex-1"
                    >
                      Retake
                    </Button>
                    <label className="flex flex-1 cursor-pointer items-center justify-center rounded-lg bg-sand-50 text-sm font-medium text-ink-700 transition-colors hover:bg-sand-100">
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
                      Add more
                    </label>
                  </div>
                </div>
              ) : (
                <label className="flex h-48 cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-sand-200 bg-sand-50 transition-colors hover:bg-sand-100">
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

      {/* Upload button */}
      <div className="flex items-center gap-4">
        <Button
          onClick={handleUploadSession}
          disabled={!allStepsPresent || uploading}
          className="flex-1 md:flex-none"
        >
          {uploading ? "Uploading session..." : "Upload session"}
        </Button>
        {!allStepsPresent && (
          <p className="text-sm text-ink-700">
            Complete all 6 angles to upload
          </p>
        )}
      </div>
    </PageShell>
  );
}
