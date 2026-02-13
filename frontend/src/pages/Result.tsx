import { Link } from "react-router-dom";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { PageShell } from "../components/PageShell";
import { SectionHeading } from "../components/SectionHeading";

export function Result() {
  return (
    <PageShell className="space-y-10">
      <SectionHeading
        eyebrow="Session complete"
        title="Your session is saved"
        description="Review the insights from this session and how it compares to your previous sessions."
      />

      {/* Main status */}
      <div className="rounded-3xl bg-gradient-to-br from-tide-50 to-sand-50 p-8 shadow-lift">
        <div className="flex items-center gap-4">
          <div className="text-5xl">✓</div>
          <div>
            <h2 className="text-2xl font-heading font-semibold text-ink-900">
              Session successfully saved
            </h2>
            <p className="mt-1 text-ink-700">
              All 6 angles captured and stored.
            </p>
          </div>
        </div>
      </div>

      {/* Session insights grid */}
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <h3 className="text-lg font-heading font-semibold text-ink-900">
            📊 Image quality
          </h3>
          <div className="mt-4 space-y-3">
            <div>
              <p className="text-sm text-ink-700">Front view</p>
              <div className="mt-1 h-2 w-full rounded-full bg-sand-200">
                <div className="h-full w-4/5 rounded-full bg-tide-600" />
              </div>
            </div>
            <div>
              <p className="text-sm text-ink-700">Side angles</p>
              <div className="mt-1 h-2 w-full rounded-full bg-sand-200">
                <div className="h-full w-5/6 rounded-full bg-tide-600" />
              </div>
            </div>
            <div>
              <p className="text-sm text-ink-700">Vertical angles</p>
              <div className="mt-1 h-2 w-full rounded-full bg-sand-200">
                <div className="h-full w-3/4 rounded-full bg-tide-600" />
              </div>
            </div>
          </div>
        </Card>

        <Card tone="soft">
          <h3 className="text-lg font-heading font-semibold text-ink-900">
            ⏱️ Capture notes
          </h3>
          <div className="mt-4 space-y-2 text-sm text-ink-700">
            <p>✓ Consistent lighting throughout</p>
            <p>✓ Even distance from camera</p>
            <p>✓ Clear, focused images</p>
            <p className="text-xs text-ink-600 mt-4">
              Tip: These conditions help with accurate comparisons over time.
            </p>
          </div>
        </Card>
      </div>

      {/* Time series comparison */}
      <Card className="space-y-4">
        <h3 className="text-lg font-heading font-semibold text-ink-900">
          📈 Comparison to previous sessions
        </h3>
        <div className="space-y-3 text-sm">
          <div className="rounded-2xl bg-sand-50 p-4">
            <p className="font-semibold text-ink-900">Today vs Last month</p>
            <p className="mt-2 text-ink-700">
              Visual consistency maintained across angles. No significant
              changes observed.
            </p>
          </div>
          <div className="rounded-2xl bg-sand-50 p-4">
            <p className="font-semibold text-ink-900">Overall trend</p>
            <p className="mt-2 text-ink-700">
              Your baseline remains stable. Keep capturing sessions regularly
              for better trend detection.
            </p>
          </div>
        </div>
      </Card>

      {/* Health recommendation */}
      <Card tone="soft" className="space-y-4">
        <h3 className="text-lg font-heading font-semibold text-ink-900">
          💭 General wellness reminder
        </h3>
        <p className="text-sm text-ink-700">
          If you notice any new or concerning changes between sessions, speaking
          with a healthcare professional can provide personalized guidance. This
          tool is designed to support awareness, not replace medical advice.
        </p>
      </Card>

      {/* Next steps */}
      <div className="flex flex-wrap gap-3">
        <Link to="/history">
          <Button variant="outline">View all sessions</Button>
        </Link>
        <Link to="/capture">
          <Button>Capture another session</Button>
        </Link>
      </div>
    </PageShell>
  );
}
