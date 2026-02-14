import {
  Activity,
  Ban,
  Calendar,
  Camera,
  Check,
  Clock,
  Compass,
  Eye,
  FileText,
  Folder,
  Handshake,
  Heart,
  History,
  LayoutGrid,
  LineChart,
  Layers,
  Lock,
  Pin,
  Search,
  Smartphone,
  Stethoscope,
  Trash2,
  User,
} from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { PageShell } from "../components/PageShell";

export function Landing() {
  return (
    <PageShell className="space-y-24">
      {/* 1) Hero */}
      <section className="grid gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
        <div className="space-y-6">
          <p className="text-xs uppercase tracking-[0.3em] text-ink-700">
            Breast Changes Detection
          </p>
          <h1 className="text-5xl font-heading font-semibold text-ink-900 md:text-6xl">
            Track your changes
          </h1>
          <p className="max-w-xl text-lg text-ink-700">
            Capture consistent images and compare only with your own history.
          </p>

          <div className="flex flex-wrap items-center gap-3 text-sm text-ink-700">
            <span className="inline-flex items-center gap-2 rounded-full bg-sand-100 px-4 py-2">
              <Check className="h-4 w-4 text-ink-900" />
              Not a medical diagnosis
            </span>
            <span className="inline-flex items-center gap-2 rounded-full bg-sand-100 px-4 py-2">
              <Check className="h-4 w-4 text-ink-900" />
              Your data stays private
            </span>
            <span className="inline-flex items-center gap-2 rounded-full bg-sand-100 px-4 py-2">
              <Check className="h-4 w-4 text-ink-900" />
              Compare with your own history
            </span>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link to="/signup">
              <Button className="px-8 py-3 text-base">Get started</Button>
            </Link>
            <a href="#how-it-works">
              <Button variant="outline" className="px-8 py-3 text-base">
                Learn how it works
              </Button>
            </a>
          </div>
        </div>

        {/* Subtle abstract diagram */}
        <Card className="p-8">
          <div className="space-y-6">
            <div>
              <p className="text-xs uppercase tracking-[0.25em] text-ink-700">
                Over time
              </p>
              <p className="mt-2 text-lg font-heading font-semibold text-ink-900">
                Sessions become a timeline
              </p>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                {[
                  { label: "Session 1", tone: "bg-sand-100" },
                  { label: "Session 2", tone: "bg-tide-50" },
                  { label: "Session 3", tone: "bg-sand-100" },
                ].map((node) => (
                  <div key={node.label} className="flex flex-col items-center">
                    <div className={`h-10 w-10 rounded-2xl ${node.tone}`} />
                    <span className="mt-2 text-xs text-ink-700">
                      {node.label}
                    </span>
                  </div>
                ))}
              </div>

              <div className="relative">
                <div className="h-1 w-full rounded-full bg-sand-200" />
                <div className="absolute -top-2 left-[12%] h-5 w-5 rounded-full bg-ink-900" />
                <div className="absolute -top-2 left-1/2 h-5 w-5 -translate-x-1/2 rounded-full bg-ink-900" />
                <div className="absolute -top-2 left-[88%] h-5 w-5 -translate-x-full rounded-full bg-ink-900" />
              </div>

              <div className="flex items-center justify-between text-xs text-ink-700">
                <span>Capture</span>
                <span className="inline-flex items-center gap-2">
                  Compare
                  <span aria-hidden className="text-base">
                    →
                  </span>
                </span>
                <span>Trend</span>
              </div>
            </div>
          </div>
        </Card>
      </section>

      <div className="h-px w-full bg-sand-100" />

      {/* 2) What this is / is not */}
      <section className="space-y-8">
        <div className="space-y-2 text-center">
          <p className="text-xs uppercase tracking-[0.3em] text-ink-700">
            Clarity
          </p>
          <h2 className="text-3xl font-heading font-semibold text-ink-900">
            What BCD is (and what it is not)
          </h2>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card className="p-8">
            <h3 className="text-lg font-heading font-semibold text-ink-900">
              What BCD is
            </h3>
            <div className="mt-6 grid gap-4">
              {[
                { icon: User, text: "A personal awareness tool" },
                { icon: Compass, text: "Tracks visual changes over time" },
                { icon: Folder, text: "Builds a private reference history" },
                {
                  icon: Heart,
                  text: "Encourages timely professional checkups",
                },
              ].map((item) => (
                <div key={item.text} className="flex items-start gap-3">
                  <item.icon className="mt-0.5 h-5 w-5 text-ink-900" />
                  <p className="text-sm text-ink-700">{item.text}</p>
                </div>
              ))}
            </div>
          </Card>

          <Card tone="soft" className="p-8">
            <h3 className="text-lg font-heading font-semibold text-ink-900">
              What BCD is not
            </h3>
            <div className="mt-6 grid gap-4">
              {[
                { icon: Ban, text: "Not a cancer detector" },
                { icon: FileText, text: "Not a medical device" },
                { icon: Stethoscope, text: "Not a replacement for screening" },
                { icon: Search, text: "Not providing diagnosis" },
              ].map((item) => (
                <div key={item.text} className="flex items-start gap-3">
                  <item.icon className="mt-0.5 h-5 w-5 text-ink-900" />
                  <p className="text-sm text-ink-700">{item.text}</p>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </section>

      {/* 3) When should I use this? */}
      <section className="space-y-10">
        <div className="space-y-2 text-center">
          <p className="text-xs uppercase tracking-[0.3em] text-ink-700">
            Use cases
          </p>
          <h2 className="text-3xl font-heading font-semibold text-ink-900">
            When should I use this?
          </h2>
        </div>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {[
            {
              icon: Calendar,
              title: "Over time",
              text: "You want to monitor changes across weeks or months.",
            },
            {
              icon: Eye,
              title: "Looks different",
              text: "You noticed something that seems visually different.",
            },
            {
              icon: LayoutGrid,
              title: "Structured tracking",
              text: "You want a consistent way to capture and compare.",
            },
            {
              icon: History,
              title: "Personal history",
              text: "You prefer comparing against your own history.",
            },
          ].map((card) => (
            <Card key={card.title} className="p-6">
              <card.icon className="h-8 w-8 text-ink-900" />
              <h3 className="mt-4 text-lg font-heading font-semibold text-ink-900">
                {card.title}
              </h3>
              <p className="mt-2 text-sm text-ink-700">{card.text}</p>
            </Card>
          ))}
        </div>

        <p className="mx-auto max-w-3xl text-center text-sm font-bold text-ink-900">
          If you feel pain, lumps, discharge, or strong concern, consult a
          healthcare professional directly.
        </p>
      </section>

      <div className="h-px w-full bg-sand-100" />

      {/* 4 & 5) How it works */}
      <section id="how-it-works" className="space-y-12 scroll-mt-24">
        <div className="space-y-2 text-center">
          <p className="text-xs uppercase tracking-[0.3em] text-ink-700">
            How it works
          </p>
          <h2 className="text-3xl font-heading font-semibold text-ink-900">
            Two ways BCD helps you compare
          </h2>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card className="p-8">
            <p className="text-xs uppercase tracking-[0.25em] text-ink-700">
              Phase 1
            </p>
            <h3 className="mt-2 text-xl font-heading font-semibold text-ink-900">
              Session-based visual analysis
            </h3>

            <div className="mt-6 grid gap-4">
              <div className="flex items-center justify-between text-sm text-ink-700">
                <span className="inline-flex items-center gap-2">
                  <Smartphone className="h-4 w-4 text-ink-900" />
                  Phone
                </span>
                <span aria-hidden className="text-lg">
                  →
                </span>
                <span className="inline-flex items-center gap-2">
                  <Camera className="h-4 w-4 text-ink-900" />
                  Captures
                </span>
                <span aria-hidden className="text-lg">
                  →
                </span>
                <span className="inline-flex items-center gap-2">
                  <Search className="h-4 w-4 text-ink-900" />
                  Compare
                </span>
                <span aria-hidden className="text-lg">
                  →
                </span>
                <span className="inline-flex items-center gap-2">
                  <Pin className="h-4 w-4 text-ink-900" />
                  Indicator
                </span>
              </div>

              <div className="grid gap-3">
                {[
                  "Capture guided angles",
                  "Images are standardized for consistency",
                  "Visual difference detection runs",
                  "Session-level differences are highlighted",
                ].map((text) => (
                  <div
                    key={text}
                    className="rounded-2xl bg-sand-50 px-4 py-3 text-sm text-ink-700"
                  >
                    {text}
                  </div>
                ))}
              </div>

              <p className="text-sm text-ink-700">
                Each session checks for visible inconsistencies within the
                current set of images.
              </p>
            </div>
          </Card>

          <Card tone="soft" className="p-8">
            <p className="text-xs uppercase tracking-[0.25em] text-ink-700">
              Phase 2
            </p>
            <h3 className="mt-2 text-xl font-heading font-semibold text-ink-900">
              Time-series change tracking
            </h3>

            <div className="mt-6 space-y-6">
              <div className="rounded-2xl bg-white/70 p-5">
                <div className="flex items-center justify-between">
                  {[
                    { label: "Session A" },
                    { label: "Session B" },
                    { label: "Session C" },
                    { label: "Today" },
                  ].map((node) => (
                    <div
                      key={node.label}
                      className="flex flex-col items-center"
                    >
                      <div className="h-3 w-3 rounded-full bg-ink-900" />
                      <span className="mt-2 text-[11px] text-ink-700">
                        {node.label}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="mt-4 h-1 w-full rounded-full bg-sand-200" />
              </div>

              <div className="grid gap-3">
                {[
                  "Every session becomes a reference point",
                  "New sessions are compared with past sessions",
                  "Gradual or sudden changes are flagged",
                  "Trends are shown over time",
                ].map((text) => (
                  <div
                    key={text}
                    className="rounded-2xl bg-sand-50 px-4 py-3 text-sm text-ink-700"
                  >
                    {text}
                  </div>
                ))}
              </div>

              <p className="text-sm font-semibold text-ink-900">
                BCD compares you to your past - not to population averages.
              </p>
            </div>
          </Card>
        </div>
      </section>

      {/* 6) Data & Privacy */}
      <section className="space-y-10">
        <div className="space-y-2 text-center">
          <p className="text-xs uppercase tracking-[0.3em] text-ink-700">
            Trust
          </p>
          <h2 className="text-3xl font-heading font-semibold text-ink-900">
            Your data, your control
          </h2>
        </div>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {[
            {
              icon: Lock,
              title: "Encrypted storage",
              text: "Images are stored securely and tied to your account.",
            },
            {
              icon: Trash2,
              title: "Deletion options",
              text: "You can remove your sessions and images.",
            },
            {
              icon: User,
              title: "Personal comparisons",
              text: "Used only for your own time-based comparisons.",
            },
            {
              icon: Ban,
              title: "No sharing",
              text: "Not shared as a public training dataset.",
            },
          ].map((item) => (
            <Card key={item.title} className="p-6">
              <item.icon className="h-8 w-8 text-ink-900" />
              <h3 className="mt-4 text-lg font-heading font-semibold text-ink-900">
                {item.title}
              </h3>
              <p className="mt-2 text-sm text-ink-700">{item.text}</p>
            </Card>
          ))}
        </div>

        <Card tone="soft" className="p-8">
          <div className="grid gap-6 lg:grid-cols-2 lg:items-center">
            <div className="space-y-2">
              <h3 className="text-xl font-heading font-semibold text-ink-900">
                Transparency during development
              </h3>
              <p className="text-sm text-ink-700">
                Server-side processing is used during development. Future
                versions may support on-device processing.
              </p>
            </div>
            <div className="rounded-2xl bg-white/70 p-5 text-sm text-ink-700">
              <p>
                Images are linked to your account and used only to generate your
                comparisons.
              </p>
            </div>
          </div>
        </Card>
      </section>

      <div className="h-px w-full bg-sand-100" />

      {/* 7) How to use it */}
      <section className="space-y-10">
        <div className="space-y-2 text-center">
          <p className="text-xs uppercase tracking-[0.3em] text-ink-700">
            Quick guide
          </p>
          <h2 className="text-3xl font-heading font-semibold text-ink-900">
            How to use it
          </h2>
        </div>

        <div className="grid gap-6 md:grid-cols-4">
          {[
            { icon: FileText, text: "Sign up" },
            { icon: Camera, text: "Capture guided angles" },
            { icon: Pin, text: "Review session result" },
            { icon: LineChart, text: "Compare history" },
          ].map((step, index) => (
            <Card key={step.text} className="p-6">
              <div className="flex items-center justify-between">
                <step.icon className="h-8 w-8 text-ink-900" />
                <div className="rounded-full bg-sand-100 px-3 py-1 text-xs font-semibold text-ink-900">
                  {index + 1}
                </div>
              </div>
              <p className="mt-4 text-sm font-semibold text-ink-900">
                {step.text}
              </p>
            </Card>
          ))}
        </div>
      </section>

      {/* 8) Goals */}
      <section className="space-y-10">
        <div className="space-y-2 text-center">
          <p className="text-xs uppercase tracking-[0.3em] text-ink-700">
            Project
          </p>
          <h2 className="text-3xl font-heading font-semibold text-ink-900">
            Our goal
          </h2>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          {[
            { icon: Clock, text: "Encourage earlier attention" },
            { icon: Activity, text: "Provide structured self-awareness" },
            { icon: Layers, text: "Reduce ignored changes" },
            {
              icon: Handshake,
              text: "Promote informed professional consultation",
            },
          ].map((goal) => (
            <Card key={goal.text} className="p-6">
              <div className="flex items-start gap-3">
                <goal.icon className="mt-0.5 h-6 w-6 text-ink-900" />
                <p className="text-sm font-semibold text-ink-900">
                  {goal.text}
                </p>
              </div>
            </Card>
          ))}
        </div>
      </section>

      {/* 9) FAQ */}
      <section className="space-y-10">
        <div className="space-y-2 text-center">
          <p className="text-xs uppercase tracking-[0.3em] text-ink-700">FAQ</p>
          <h2 className="text-3xl font-heading font-semibold text-ink-900">
            Common questions
          </h2>
        </div>

        <div className="grid gap-4">
          {[
            {
              q: "Does this detect cancer?",
              a: "No. BCD does not detect cancer and does not provide diagnosis. It supports personal visual change awareness.",
            },
            {
              q: "How accurate is it?",
              a: "Accuracy depends on consistent captures and available comparisons. The system is designed to be cautious and non-diagnostic.",
            },
            {
              q: "Are my images shared?",
              a: "Your images are linked to your account and used only for your comparisons. They are not shared as a public dataset.",
            },
            {
              q: "Can this replace a mammogram?",
              a: "No. It is not a replacement for screening or professional medical evaluation.",
            },
            {
              q: "What happens if a change is detected?",
              a: "You may see a neutral indicator that something looks different compared to your past sessions. If you feel concerned, consider consulting a healthcare professional.",
            },
            {
              q: "Can I delete my data?",
              a: "Yes. You can remove sessions and images. (More deletion controls will be expanded over time.)",
            },
          ].map((item) => (
            <Card key={item.q} className="p-6">
              <p className="text-sm font-semibold text-ink-900">{item.q}</p>
              <p className="mt-2 text-sm text-ink-700">{item.a}</p>
            </Card>
          ))}
        </div>
      </section>

      {/* 10) CTA */}
      <section className="space-y-6 rounded-3xl bg-white/80 p-8 text-center shadow-lift md:p-12">
        <h2 className="text-3xl font-heading font-semibold text-ink-900">
          Ready to get started?
        </h2>
        <p className="mx-auto max-w-2xl text-lg text-ink-700">
          Create an account to begin building your personal comparison history.
        </p>
        <div className="flex flex-wrap justify-center gap-3">
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
    </PageShell>
  );
}
