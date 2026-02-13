import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { PageShell } from "../components/PageShell";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabaseClient";

export function Disclaimer() {
  const { user, refreshDisclaimer } = useAuth();
  const navigate = useNavigate();
  const [acknowledged, setAcknowledged] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const handleContinue = async () => {
    if (!user) return;
    setSubmitting(true);
    setMessage(null);

    const { error } = await supabase.from("disclaimer_acceptance").upsert({
      user_id: user.id,
      accepted_at: new Date().toISOString(),
    });

    if (error) {
      setMessage("Unable to save your acknowledgment. Try again soon.");
      setSubmitting(false);
      return;
    }

    await refreshDisclaimer();
    navigate("/capture", { replace: true });
  };

  return (
    <PageShell className="flex min-h-[70vh] items-center justify-center">
      <Card className="w-full max-w-2xl space-y-6">
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-[0.3em] text-ink-700">
            Before you begin
          </p>
          <h1 className="text-3xl font-heading font-semibold text-ink-900">
            Important awareness notice
          </h1>
        </div>
        <div className="space-y-3 text-sm text-ink-700">
          <p>
            This tool supports visual change awareness only. It does not provide
            medical conclusions or replace professional care.
          </p>
          <p>
            If you notice concerning changes, we recommend speaking with a
            qualified healthcare professional.
          </p>
          <p>
            Your images are stored securely for your personal baseline and are
            used to compare changes over time.
          </p>
        </div>
        <label className="flex items-start gap-3 text-sm text-ink-700">
          <input
            type="checkbox"
            checked={acknowledged}
            onChange={(event) => setAcknowledged(event.target.checked)}
            className="mt-1 h-4 w-4 rounded border-sand-200 text-ink-900"
          />
          <span>I understand and want to continue.</span>
        </label>
        {message ? <p className="text-sm text-ink-700">{message}</p> : null}
        <Button
          fullWidth
          onClick={handleContinue}
          disabled={!acknowledged || submitting}
        >
          {submitting ? "Saving..." : "Continue"}
        </Button>
      </Card>
    </PageShell>
  );
}
