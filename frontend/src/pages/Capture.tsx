import { useMemo } from "react";
import { Link } from "react-router-dom";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { PageShell } from "../components/PageShell";
import { SectionHeading } from "../components/SectionHeading";
import { useDraft } from "../context/DraftContext";
import { captureSteps } from "../data/captureSteps";

export function Capture() {
  const { images, setImage, removeImage } = useDraft();

  const imageMap = useMemo(() => {
    const map = new Map(images.map((image) => [image.type, image]));
    return map;
  }, [images]);

  const requiredSteps = captureSteps.filter((step) => !step.optional);
  const requiredCount = requiredSteps.length;
  const completedRequiredCount = requiredSteps.filter((step) =>
    imageMap.has(step.type),
  ).length;

  return (
    <PageShell className="space-y-10">
      <SectionHeading
        eyebrow="Capture session"
        title="Follow the guided angles"
        description="Aim for steady lighting and the same distance each session. You can retake any image before review."
      />

      <div className="flex flex-wrap items-center gap-4 text-sm text-ink-700">
        <span className="rounded-full bg-sand-100 px-4 py-2">
          {completedRequiredCount} of {requiredCount} required angles captured
        </span>
        <span className="rounded-full bg-sand-100 px-4 py-2">
          Use soft, even lighting
        </span>
        <span className="rounded-full bg-sand-100 px-4 py-2">
          Keep the camera level
        </span>
      </div>

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
                  <img
                    src={captured.previewUrl}
                    alt={step.label}
                    className="h-48 w-full rounded-2xl object-cover"
                  />
                  <div className="flex gap-3">
                    <Button
                      variant="outline"
                      onClick={() => removeImage(step.type)}
                    >
                      Retake
                    </Button>
                    <label className="inline-flex cursor-pointer items-center text-sm text-ink-700">
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
                      Update image
                    </label>
                  </div>
                </div>
              ) : (
                <label className="flex h-48 cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-sand-200 bg-sand-50 text-sm text-ink-700">
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
                  <span className="text-3xl">+</span>
                  <span className="mt-2">Add image</span>
                </label>
              )}
            </Card>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4 rounded-3xl bg-white/80 px-6 py-4 shadow-lift">
        <div>
          <p className="text-sm text-ink-700">Ready to review your session?</p>
          <p className="text-lg font-heading font-semibold text-ink-900">
            Check each angle before saving.
          </p>
        </div>
        <Link to="/review">
          <Button disabled={completedRequiredCount < requiredCount}>
            Review session
          </Button>
        </Link>
      </div>
    </PageShell>
  );
}
