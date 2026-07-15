import { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { PageShell } from "../components/PageShell";
import { Spinner } from "../components/Spinner";
import { supabase } from "../lib/supabaseClient";

export function VerifyEmail() {
  const { user } = useAuth();
  const email = user?.email ?? "";
  const isVerified = Boolean(user?.email_confirmed_at);

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState(false);

  const handleResend = async () => {
    if (!email) return;

    setLoading(true);
    setMessage(null);
    setError(false);

    try {
      const { error: resendError } = await supabase.auth.resend({
        type: "signup",
        email,
      });
      if (resendError) throw resendError;
      setMessage("Verification email sent. Check your inbox.");
    } catch {
      setError(true);
      setMessage("Could not resend verification email. Try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <PageShell className="flex min-h-[70vh] items-center justify-center">
      <Card className="w-full max-w-lg">
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-[0.3em] text-ink-700">
            Verify email
          </p>
          <h1 className="text-3xl font-heading font-semibold text-ink-900">
            Verify your email
          </h1>
          <p className="text-sm text-ink-700">
            {isVerified
              ? "Your email has been verified."
              : `We sent a verification link to ${email || "your email address"}.`}
          </p>
        </div>

        {!isVerified && (
          <div className="mt-6 rounded-2xl border border-tide-200 bg-tide-50 p-4 text-sm text-ink-900">
            Check your email to verify your account. Didn&apos;t receive it?{" "}
            <Button
              type="button"
              variant="ghost"
              className="inline-flex align-baseline px-1 py-0"
              onClick={handleResend}
              disabled={loading}
            >
              {loading ? (
                <span className="inline-flex items-center gap-2">
                  <Spinner />
                  Resending...
                </span>
              ) : (
                "Resend"
              )}
            </Button>
          </div>
        )}

        {message ? (
          <p
            className={`mt-4 text-sm ${error ? "text-red-700" : "text-ink-700"}`}
          >
            {message}
          </p>
        ) : null}
      </Card>
    </PageShell>
  );
}
