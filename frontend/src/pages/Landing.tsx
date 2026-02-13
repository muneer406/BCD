import { Link } from "react-router-dom";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { PageShell } from "../components/PageShell";
import { SectionHeading } from "../components/SectionHeading";

export function Landing() {
  return (
    <PageShell className="space-y-16">
      <section className="grid gap-10 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-6">
          <p className="text-xs uppercase tracking-[0.3em] text-ink-700">
            Visual change awareness
          </p>
          <h1 className="text-4xl font-heading font-semibold text-ink-900 md:text-5xl">
            BCD helps you track visual changes over time with calm, steady
            guidance.
          </h1>
          <p className="text-lg text-ink-700">
            Capture consistent images, compare them to your own baseline, and
            receive neutral insights designed to support awareness, not
            conclusions.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link to="/signup">
              <Button>Get started</Button>
            </Link>
            <Link to="/login">
              <Button variant="outline">Log in</Button>
            </Link>
          </div>
          <div className="grid gap-3 text-sm text-ink-700">
            <p>• Not a medical tool or clinical system.</p>
            <p>• Focused on your personal baseline.</p>
            <p>• Encourages professional consultation for concerns.</p>
          </div>
        </div>
        <div className="grid gap-4">
          <Card>
            <h3 className="text-xl font-heading font-semibold">
              Guided capture
            </h3>
            <p className="mt-2 text-sm text-ink-700">
              Step-by-step angles with gentle prompts to keep each session
              consistent.
            </p>
          </Card>
          <Card tone="soft">
            <h3 className="text-xl font-heading font-semibold">
              Time-series view
            </h3>
            <p className="mt-2 text-sm text-ink-700">
              Compare today with last month or earlier sessions to notice new
              patterns.
            </p>
          </Card>
          <Card>
            <h3 className="text-xl font-heading font-semibold">
              Neutral results
            </h3>
            <p className="mt-2 text-sm text-ink-700">
              Calm, descriptive language without alarms or medical verdicts.
            </p>
          </Card>
        </div>
      </section>

      <section className="grid gap-10 rounded-[36px] bg-white/80 p-8 shadow-lift md:p-12">
        <SectionHeading
          eyebrow="How it works"
          title="A steady rhythm for awareness"
          description="Each session follows the same six angles so your visual baseline stays consistent over time."
        />
        <div className="grid gap-4 md:grid-cols-3">
          {[
            {
              title: "Capture a session",
              text: "Follow the guided angles and keep lighting steady.",
            },
            {
              title: "Review calmly",
              text: "Check your images before saving the session.",
            },
            {
              title: "See the trend",
              text: "Look back at prior sessions for gentle comparisons.",
            },
          ].map((step) => (
            <Card key={step.title} tone="soft">
              <h4 className="text-lg font-heading font-semibold text-ink-900">
                {step.title}
              </h4>
              <p className="mt-2 text-sm text-ink-700">{step.text}</p>
            </Card>
          ))}
        </div>
      </section>
    </PageShell>
  );
}
