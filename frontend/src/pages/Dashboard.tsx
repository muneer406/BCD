import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Camera, History, Lock, User as UserIcon, CalendarDays, TrendingUp } from "lucide-react";
import { Card } from "../components/Card";
import { PageShell } from "../components/PageShell";
import { SectionHeading } from "../components/SectionHeading";
import { supabase } from "../lib/supabaseClient";
import type { User } from "@supabase/supabase-js";

export default function Dashboard() {
  const [user, setUser] = useState<User | null>(null);
  const [sessionCount, setSessionCount] = useState(0);
  const [firstDate, setFirstDate] = useState<string | null>(null);
  const [daysSinceFirst, setDaysSinceFirst] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const { data: { user: u } } = await supabase.auth.getUser();
      setUser(u);

      if (u) {
        const { data: sessions } = await supabase
          .from("sessions")
          .select("created_at")
          .eq("user_id", u.id)
          .order("created_at", { ascending: true });

        if (sessions) {
          setSessionCount(sessions.length);
          if (sessions.length > 0) {
            const fd = new Date(sessions[0].created_at);
            setFirstDate(fd.toLocaleDateString("en-US", {
              year: "numeric", month: "long", day: "numeric",
            }));
            setDaysSinceFirst(Math.floor((Date.now() - fd.getTime()) / 86400000));
          }
        }
      }
      setLoading(false);
    };
    load();
  }, []);

  if (loading) {
    return (
      <PageShell>
        <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6">
          <div className="animate-pulse space-y-4">
            <div className="h-8 w-48 bg-sand-200 rounded" />
            <div className="h-32 w-full bg-sand-200 rounded-2xl" />
          </div>
        </div>
      </PageShell>
    );
  }

  const initial = user?.email?.[0]?.toUpperCase() || "?";

  const handleResetPassword = async () => {
    const email = user?.email;
    if (!email) return;
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/login`,
    });
    if (error) {
      alert("Could not send reset link. Configure SMTP in Supabase settings.");
    } else {
      alert("Password reset link sent to your email.");
    }
  };

  return (
    <PageShell>
      <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6 space-y-8">
        {/* Welcome header */}
        <div>
          <SectionHeading eyebrow="Dashboard" title="Welcome back" />
          <p className="mt-1 text-sm text-ink-700">{user?.email}</p>
        </div>

        {/* Quick stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Card className="p-4 text-center space-y-1">
            <Camera className="h-5 w-5 mx-auto text-tide-500" />
            <p className="text-2xl font-bold text-ink-900">{sessionCount}</p>
            <p className="text-xs text-ink-600">Sessions</p>
          </Card>
          <Card className="p-4 text-center space-y-1">
            <CalendarDays className="h-5 w-5 mx-auto text-tide-500" />
            <p className="text-2xl font-bold text-ink-900">{daysSinceFirst}</p>
            <p className="text-xs text-ink-600">Days tracking</p>
          </Card>
          <Card className="p-4 text-center space-y-1">
            <TrendingUp className="h-5 w-5 mx-auto text-tide-500" />
            <p className="text-2xl font-bold text-ink-900">{firstDate ? "Active" : "\u2014"}</p>
            <p className="text-xs text-ink-600">Status</p>
          </Card>
          <Card className="p-4 text-center space-y-1">
            <UserIcon className="h-5 w-5 mx-auto text-tide-500" />
            <p className="text-2xl font-bold text-ink-900">{sessionCount > 0 ? "\u2713" : "\u2014"}</p>
            <p className="text-xs text-ink-600">Onboarded</p>
          </Card>
        </div>

        {/* Quick actions */}
        <div className="space-y-3">
          <h2 className="text-lg font-heading font-semibold text-ink-900">Quick actions</h2>
          <div className="grid grid-cols-2 gap-3">
            <Link to="/capture"
              className="flex items-center gap-3 rounded-2xl border border-sand-200 bg-white p-4 hover:bg-sand-50 transition-colors"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-tide-100 text-tide-800">
                <Camera className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-semibold text-ink-900">New session</p>
                <p className="text-xs text-ink-600">Capture photos</p>
              </div>
            </Link>
            <Link to="/history"
              className="flex items-center gap-3 rounded-2xl border border-sand-200 bg-white p-4 hover:bg-sand-50 transition-colors"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-tide-100 text-tide-800">
                <History className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-semibold text-ink-900">History</p>
                <p className="text-xs text-ink-600">View sessions</p>
              </div>
            </Link>
          </div>
        </div>

        {/* Account settings */}
        <Card className="p-5 space-y-4">
          <h2 className="text-lg font-heading font-semibold text-ink-900">Account</h2>
          <div className="flex items-center gap-3 pb-3 border-b border-sand-200">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-ink-900 text-white text-sm font-bold">
              {initial}
            </div>
            <div>
              <p className="text-sm font-semibold text-ink-900">{user?.email}</p>
              <p className="text-xs text-ink-600">Member since {firstDate || "today"}</p>
            </div>
          </div>
          <button
            onClick={handleResetPassword}
            className="flex w-full items-center gap-3 rounded-xl border border-sand-200 p-3 text-sm text-ink-700 hover:bg-sand-50 transition-colors"
          >
            <Lock className="h-4 w-4 text-ink-500" />
            Send password reset email
          </button>
        </Card>

        {/* Image PIN settings */}
        <Card className="p-5 space-y-4">
          <h2 className="text-lg font-heading font-semibold text-ink-900 flex items-center gap-2">
            <Lock className="h-4 w-4 text-tide-500" />
            Image PIN
          </h2>
          <p className="text-xs text-ink-600">
            A PIN protects your session images. Set one when you first view an image,
            then manage it here.
          </p>

          {(() => {
            // Migrate PIN from old sessionStorage if present
            const ssPin = sessionStorage.getItem("bcd_pin");
            if (ssPin && !localStorage.getItem("bcd_pin")) {
              localStorage.setItem("bcd_pin", ssPin);
              sessionStorage.removeItem("bcd_pin");
            }
            const currentPin = localStorage.getItem("bcd_pin");
            const hasPin = !!currentPin;
            return (
              <div className="space-y-3">
                {hasPin ? (
                  <div className="flex items-center gap-2 text-sm text-green-700">
                    <span className="h-2 w-2 rounded-full bg-green-500" />
                    PIN is set
                  </div>
                ) : (
                  <p className="text-sm text-ink-500 italic">
                    No PIN set. Your session images are visible to anyone with access.
                  </p>
                )}
                <button
                  onClick={() => {
                    if (hasPin) {
                      const current = prompt("Enter your current PIN:");
                      if (current !== localStorage.getItem("bcd_pin")) {
                        alert("Incorrect PIN.");
                        return;
                      }
                    }
                    const newPin = prompt(hasPin ? "Enter a new 4-digit PIN:" : "Set a 4-digit PIN to protect your images:");
                    if (newPin && newPin.length >= 4) {
                      localStorage.setItem("bcd_pin", newPin);
                      if (hasPin) sessionStorage.removeItem("bcd_pin_page");
                      alert(hasPin ? "PIN updated successfully." : "PIN set successfully! Use it when viewing session images.");
                      window.location.reload();
                    } else {
                      alert("PIN must be at least 4 characters.");
                    }
                  }}
                  className="flex w-full items-center gap-3 rounded-xl border border-ink-900 bg-ink-900 p-3 text-sm font-semibold text-white hover:bg-ink-800 transition-colors"
                >
                  <Lock className="h-4 w-4" />
                  {hasPin ? "Change PIN" : "Set a PIN"}
                </button>
                {hasPin && (
                  <button
                    onClick={async () => {
                      const pw = prompt("Enter your account password to reset the image PIN:");
                      if (!pw) return;
                      const { error: signInError } = await supabase.auth.signInWithPassword({
                        email: user?.email || "",
                        password: pw,
                      });
                      if (signInError) {
                        alert("Incorrect password. PIN not reset.");
                        return;
                      }
                      localStorage.removeItem("bcd_pin");
                      sessionStorage.removeItem("bcd_pin_page");
                      alert("PIN has been reset. Set a new one above or when viewing images.");
                      window.location.reload();
                    }}
                    className="flex w-full items-center gap-3 rounded-xl border border-red-200 p-3 text-sm text-red-700 hover:bg-red-50 transition-colors"
                  >
                    <Lock className="h-4 w-4 text-red-500" />
                    Forgot PIN — reset with password
                  </button>
                )}
              </div>
            );
          })()}
        </Card>

        {/* Legal links */}
        <div className="text-center text-xs text-ink-500 space-x-4">
          <Link to="/terms" className="underline hover:text-ink-700">Terms of Service</Link>
          <span>·</span>
          <Link to="/privacy" className="underline hover:text-ink-700">Privacy Policy</Link>
          <span>·</span>
          <Link to="/" className="underline hover:text-ink-700">Home</Link>
        </div>
      </div>
    </PageShell>
  );
}
