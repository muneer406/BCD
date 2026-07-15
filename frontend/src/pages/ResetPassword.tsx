import { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { PageShell } from "../components/PageShell";
import { Spinner } from "../components/Spinner";
import { supabase } from "../lib/supabaseClient";

export function ResetPassword() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState(false);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setSuccess(false);
    setError(false);

    try {
      const redirectTo = `${window.location.origin}/login`;
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(
        email,
        { redirectTo },
      );
      if (resetError) throw resetError;
      setSuccess(true);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <PageShell className="flex min-h-[70vh] items-center justify-center">
      <Card className="w-full max-w-lg">
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-[0.3em] text-ink-700">
            Reset password
          </p>
          <h1 className="text-3xl font-heading font-semibold text-ink-900">
            Forgot your password?
          </h1>
          <p className="text-sm text-ink-700">
            Enter your email and we’ll send you a link to reset it.
          </p>
        </div>

        {success ? (
          <div className="mt-6 rounded-2xl border border-tide-200 bg-tide-50 p-4 text-sm text-ink-900">
            Check your email for the password reset link.
          </div>
        ) : (
          <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
            <label className="block text-sm text-ink-700">
              Email
              <input
                type="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="mt-2 w-full rounded-2xl border border-sand-200 bg-white px-4 py-3 text-sm focus:border-tide-300 focus:outline-none"
                placeholder="you@example.com"
              />
            </label>
            {error ? (
              <p className="text-sm text-red-700">
                Could not send reset link. Try again.
              </p>
            ) : null}
            <Button type="submit" fullWidth disabled={loading}>
              {loading ? (
                <span className="inline-flex items-center gap-2">
                  <Spinner />
                  Sending...
                </span>
              ) : (
                "Send reset link"
              )}
            </Button>
          </form>
        )}

        <div className="mt-6 text-sm text-ink-700">
          Remember your password?{" "}
          <Link to="/login" className="font-semibold text-ink-900">
            Log in
          </Link>
        </div>
      </Card>
    </PageShell>
  );
}
