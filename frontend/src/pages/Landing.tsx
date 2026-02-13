import { Link } from "react-router-dom";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { PageShell } from "../components/PageShell";

export function Landing() {
  return (
    <PageShell className="space-y-20">
      {/* Hero Section */}
      <section className="text-center">
        <div className="mb-8">
          <h1 className="text-5xl font-heading font-semibold text-ink-900 md:text-6xl">
            Track your changes
          </h1>
          <p className="mt-4 text-xl text-ink-700">
            Consistent captures. Time-based comparisons. Personal baseline
            awareness.
          </p>
        </div>
        <div className="flex flex-wrap justify-center gap-4">
          <Link to="/signup">
            <Button className="px-8 py-3 text-base">Get started</Button>
          </Link>
          <Link to="/login">
            <Button variant="outline" className="px-8 py-3 text-base">
              Log in
            </Button>
          </Link>
        </div>
      </section>

      {/* How it works - Visual cards */}
      <section className="space-y-8">
        <h2 className="text-center text-3xl font-heading font-semibold text-ink-900">
          How BCD works
        </h2>
        <div className="grid gap-6 md:grid-cols-3">
          <Card className="flex flex-col items-center p-8 text-center">
            <div className="mb-4 text-5xl">📸</div>
            <h3 className="text-lg font-heading font-semibold text-ink-900">
              Capture angles
            </h3>
            <p className="mt-2 text-sm text-ink-700">
              6 guided angles with consistent lighting and positioning.
            </p>
          </Card>
          <Card className="flex flex-col items-center p-8 text-center">
            <div className="mb-4 text-5xl">⏱️</div>
            <h3 className="text-lg font-heading font-semibold text-ink-900">
              Build your baseline
            </h3>
            <p className="mt-2 text-sm text-ink-700">
              Each session becomes a reference point for future comparisons.
            </p>
          </Card>
          <Card className="flex flex-col items-center p-8 text-center">
            <div className="mb-4 text-5xl">📊</div>
            <h3 className="text-lg font-heading font-semibold text-ink-900">
              Compare over time
            </h3>
            <p className="mt-2 text-sm text-ink-700">
              Review trends and changes between your own sessions.
            </p>
          </Card>
        </div>
      </section>

      {/* Key benefits - Visual layout */}
      <section className="rounded-3xl bg-gradient-to-br from-sand-50 to-tide-50 p-8 md:p-12">
        <h2 className="text-center text-3xl font-heading font-semibold text-ink-900 mb-8">
          Why BCD
        </h2>
        <div className="grid gap-8 md:grid-cols-2">
          <div className="space-y-4">
            <div className="flex gap-4">
              <div className="text-2xl">✓</div>
              <div>
                <h4 className="font-semibold text-ink-900">Non-diagnostic</h4>
                <p className="text-sm text-ink-700">
                  A personal awareness tool, not a medical device.
                </p>
              </div>
            </div>
            <div className="flex gap-4">
              <div className="text-2xl">✓</div>
              <div>
                <h4 className="font-semibold text-ink-900">Your baseline</h4>
                <p className="text-sm text-ink-700">
                  Compare to your own history, not population averages.
                </p>
              </div>
            </div>
          </div>
          <div className="space-y-4">
            <div className="flex gap-4">
              <div className="text-2xl">✓</div>
              <div>
                <h4 className="font-semibold text-ink-900">Private & secure</h4>
                <p className="text-sm text-ink-700">
                  Your data belongs to you. No AI training or sharing.
                </p>
              </div>
            </div>
            <div className="flex gap-4">
              <div className="text-2xl">✓</div>
              <div>
                <h4 className="font-semibold text-ink-900">Simple to use</h4>
                <p className="text-sm text-ink-700">
                  Straightforward captures and comparisons.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Call to action */}
      <section className="space-y-6 rounded-3xl bg-white/80 p-8 text-center shadow-lift md:p-12">
        <h2 className="text-3xl font-heading font-semibold text-ink-900">
          Ready to get started?
        </h2>
        <p className="text-lg text-ink-700">
          Sign up in a few seconds to begin your journey of awareness.
        </p>
        <Link to="/signup">
          <Button className="px-8 py-3 text-base">Create account now</Button>
        </Link>
        <p className="text-sm text-ink-600">
          Already have an account?{" "}
          <Link to="/login" className="font-semibold underline">
            Log in here
          </Link>
        </p>
      </section>
    </PageShell>
  );
}
