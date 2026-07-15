import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { PageShell } from "../components/PageShell";
import { Spinner } from "../components/Spinner";
import { supabase } from "../lib/supabaseClient";

type AuthMode = "login" | "signup";

type AuthPageProps = {
  mode: AuthMode;
};

export function AuthPage({ mode }: AuthPageProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [needsVerification, setNeedsVerification] = useState(false);
  const [resendingVerification, setResendingVerification] = useState(false);

  const isLogin = mode === "login";
  const heading = isLogin ? "Welcome back" : "Create your space";
  const subcopy = isLogin
    ? "Log in to continue your visual change tracking."
    : "Sign up to start building your personal baseline.";

  const clearFeedback = () => {
    setMessage(null);
    setNeedsVerification(false);
  };

  const handleResendVerification = async () => {
    if (!email) return;
    setResendingVerification(true);
    clearFeedback();

    try {
      const { error } = await supabase.auth.resend({
        type: "signup",
        email,
      });
      if (error) throw error;
      setMessage("Verification email sent. Check your inbox.");
    } catch (error) {
      const messageText =
        error instanceof Error
          ? error.message
          : "Could not resend verification email. Try again.";
      setMessage(messageText);
    } finally {
      setResendingVerification(false);
    }
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    clearFeedback();

    try {
      if (isLogin) {
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;

        if (!data.user?.email_confirmed_at) {
          setNeedsVerification(true);
          setMessage(
            "Your email is not verified. Please check your inbox and verify your account before logging in.",
          );
          setLoading(false);
          return;
        }
      } else {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
        });
        if (error) throw error;

        if (!data.user?.email_confirmed_at) {
          setMessage(
            "Check your email to verify your account. Didn't receive it?",
          );
          setLoading(false);
          return;
        }
      }

      const from = (location.state as { from?: Location })?.from?.pathname;
      navigate(from || "/capture", { replace: true });
    } catch (error) {
      const messageText =
        error instanceof Error
          ? error.message
          : "Unable to sign in right now. Try again soon.";
      setMessage(messageText);
    } finally {
      setLoading(false);
    }
  };

  return (
    <PageShell className="flex min-h-[70vh] items-center justify-center">
      <Card className="w-full max-w-lg">
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-[0.3em] text-ink-700">
            {isLogin ? "Login" : "Sign up"}
          </p>
          <h1 className="text-3xl font-heading font-semibold text-ink-900">
            {heading}
          </h1>
          <p className="text-sm text-ink-700">{subcopy}</p>
        </div>

        <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
          <label className="block text-sm text-ink-700">
            Email
            <input
              type="email"
              required
              value={email}
              onChange={(event) => {
                setEmail(event.target.value);
                clearFeedback();
              }}
              className="mt-2 w-full rounded-2xl border border-sand-200 bg-white px-4 py-3 text-sm focus:border-tide-300 focus:outline-none"
              placeholder="you@example.com"
            />
          </label>
          <label className="block text-sm text-ink-700">
            Password
            <input
              type="password"
              required
              value={password}
              onChange={(event) => {
                setPassword(event.target.value);
                clearFeedback();
              }}
              className="mt-2 w-full rounded-2xl border border-sand-200 bg-white px-4 py-3 text-sm focus:border-tide-300 focus:outline-none"
              placeholder="Enter a secure password"
            />
          </label>
          {isLogin ? (
            <div className="text-right">
              <Link
                to="/reset-password"
                className="text-sm font-semibold text-ink-900 hover:underline"
              >
                Forgot password?
              </Link>
            </div>
          ) : null}
          {message ? (
            <div className="rounded-2xl border border-tide-200 bg-tide-50 p-4 text-sm text-ink-900">
              <p>{message}</p>
              {needsVerification ? (
                <Button
                  type="button"
                  variant="outline"
                  className="mt-3"
                  onClick={handleResendVerification}
                  disabled={resendingVerification}
                >
                  {resendingVerification ? (
                    <span className="inline-flex items-center gap-2">
                      <Spinner />
                      Resending...
                    </span>
                  ) : (
                    "Resend verification"
                  )}
                </Button>
              ) : null}
            </div>
          ) : null}
          <Button type="submit" fullWidth disabled={loading}>
            {loading ? (
              <span className="inline-flex items-center gap-2">
                <Spinner />
                Please wait...
              </span>
            ) : isLogin ? (
              "Log in"
            ) : (
              "Create account"
            )}
          </Button>
        </form>

        <p className="mt-6 text-xs text-ink-700">
          By continuing, you acknowledge this tool offers awareness support only
          and does not provide medical conclusions.
        </p>
        <div className="mt-4 text-sm text-ink-700">
          {isLogin ? (
            <span>
              New here?{" "}
              <Link to="/signup" className="font-semibold text-ink-900">
                Create an account
              </Link>
            </span>
          ) : (
            <span>
              Already have an account?{" "}
              <Link to="/login" className="font-semibold text-ink-900">
                Log in
              </Link>
            </span>
          )}
        </div>
      </Card>
    </PageShell>
  );
}
