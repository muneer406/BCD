import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
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

export function Review() {
  const { user } = useAuth();
  const { images, clearDraft } = useDraft();
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const orderedImages = useMemo(() => {
    return captureSteps.flatMap((step) =>
      images.filter((image) => image.type === step.type),
    );
  }, [images]);

  const handleSave = async () => {
    if (!user || orderedImages.length === 0) return;
    setSaving(true);
    setMessage(null);

    const { data: sessionData, error: sessionError } = await supabase
      .from("sessions")
      .insert({ user_id: user.id })
      .select("id")
      .single();

    if (sessionError || !sessionData) {
      setMessage("Unable to create a new session. Try again soon.");
      setSaving(false);
      return;
    }

    const sessionId = sessionData.id as string;

    for (const image of orderedImages) {
      const ext = getFileExtension(image.file);
      const timestamp = Date.now();
      const randomSuffix = Math.random().toString(36).slice(2, 9);
      const path = `${user.id}/${sessionId}/${image.type}_${timestamp}_${randomSuffix}.${ext}`;
      const { error: saveError } = await supabase.storage
        .from("bcd-images")
        .upload(path, image.file, { upsert: false });

      if (saveError) {
        setMessage("Unable to save all images. Try again soon.");
        setSaving(false);
        return;
      }

      const { error: imageError } = await supabase.from("images").insert({
        user_id: user.id,
        session_id: sessionId,
        image_type: image.type,
        storage_path: path,
      });

      if (imageError) {
        setMessage("Unable to save image details. Try again soon.");
        setSaving(false);
        return;
      }
    }

    clearDraft();
    navigate(`/result/${sessionId}`, { replace: true });
  };

  return (
    <PageShell className="space-y-10">
      <SectionHeading
        eyebrow="Session review"
        title="Check your images before saving"
        description="Make sure each angle feels consistent and clear. You can retake any image from the capture page."
      />

      {orderedImages.length === 0 ? (
        <Card>
          <p className="text-sm text-ink-700">
            No images in this session yet. Head back to capture to add them.
          </p>
        </Card>
      ) : (
        <div className="grid gap-6 md:grid-cols-2">
          {orderedImages.map((image, index) => (
            <Card key={`${image.type}-${index}`} className="space-y-3">
              <h3 className="text-lg font-heading font-semibold text-ink-900">
                {image.label}
              </h3>
              <img
                src={image.previewUrl}
                alt={image.label}
                className="h-48 w-full rounded-2xl object-cover"
              />
            </Card>
          ))}
        </div>
      )}

      {message ? <p className="text-sm text-ink-700">{message}</p> : null}

      <div className="flex flex-wrap justify-center gap-4">
        <Button variant="outline" onClick={() => navigate("/capture")}>
          Back to capture
        </Button>
        <Button
          onClick={handleSave}
          disabled={saving || orderedImages.length === 0}
        >
          {saving ? "Saving session..." : "Save session"}
        </Button>
      </div>
    </PageShell>
  );
}
