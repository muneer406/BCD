import { Link } from "react-router-dom";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { PageShell } from "../components/PageShell";
import { SectionHeading } from "../components/SectionHeading";

export function Result() {
  return (
    <PageShell className="space-y-10">
      <SectionHeading
        eyebrow="Session result"
        title="Your session is saved"
        description="Results are presented in a neutral, descriptive tone. No scores or medical claims are shown here."
      />

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <h3 className="text-lg font-heading font-semibold text-ink-900">
            Neutral summary
          </h3>
          <p className="mt-3 text-sm text-ink-700">
            No significant visual change detected compared to your most recent
            session.
          </p>
        </Card>
        <Card tone="soft">
          <h3 className="text-lg font-heading font-semibold text-ink-900">
            Gentle reminder
          </h3>
          <p className="mt-3 text-sm text-ink-700">
            If you notice new or concerning changes, consider speaking with a
            qualified healthcare professional.
          </p>
        </Card>
      </div>

      <div className="flex flex-wrap gap-3">
        <Link to="/history">
          <Button variant="outline">View history</Button>
        </Link>
        <Link to="/capture">
          <Button>Start another session</Button>
        </Link>
      </div>
    </PageShell>
  );
}
