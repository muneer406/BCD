/**
 * Per-angle labels aligned with backend `interpretation.py` angle buckets
 * (same numeric cutoffs as _angle_bucket).
 */

export type AngleBucket = 0 | 1 | 2 | 3;

/** Match backend: _angle_bucket */
export function angleBucket(score: number): AngleBucket {
  const s = Math.max(0, Math.min(1, score));
  if (s < 0.15) return 0;
  if (s < 0.35) return 1;
  if (s < 0.6) return 2;
  return 3;
}

const ANGLE_PRIMARY: readonly [string, string, string, string] = [
  "Very consistent",
  "Slight positional difference",
  "Noticeable positional difference",
  "Strong positional change",
];

const ANGLE_SECONDARY: readonly [string, string, string, string] = [
  "This view is close to your personal baseline.",
  "This view differs slightly from your baseline.",
  "This view shows noticeable differences from your baseline.",
  "This view shows strong difference from your baseline.",
];

export function angleInterpretationPrimary(changeScoreVsBaseline: number): string {
  return ANGLE_PRIMARY[angleBucket(changeScoreVsBaseline)];
}

export function angleInterpretationSecondary(changeScoreVsBaseline: number): string {
  return ANGLE_SECONDARY[angleBucket(changeScoreVsBaseline)];
}

/** Session-to-session change in the same metric (current vs previous change_score). */
const DELTA_EPS = 0.02;

export type SessionDeltaKind = "increase" | "stable" | "decrease";

export function sessionDeltaVariation(delta: number): SessionDeltaKind {
  if (delta > DELTA_EPS) return "increase";
  if (delta < -DELTA_EPS) return "decrease";
  return "stable";
}

/**
 * One-line summary for overall session-to-session distance (embedding or aggregate score).
 * Uses the same structural bands as the main interpretation layer (structural_score cutoffs).
 */
export function sessionToSessionOverallSummary(overallDelta: number): string {
  const d = Math.max(0, overallDelta);
  if (d < 0.1) {
    return "Compared to your last session, overall similarity is high.";
  }
  if (d < 0.25) {
    return "Compared to your last session, there is very slight overall difference.";
  }
  if (d < 0.45) {
    return "Compared to your last session, there is moderate overall difference.";
  }
  return "Compared to your last session, there is strong overall variation.";
}

export function comparisonTrendPhrase(
  trend: string | null | undefined,
): string {
  switch (trend) {
    case "stable":
      return "Stable pattern since last session.";
    case "mild_variation":
      return "Mild shift since last session.";
    case "significant_shift":
      return "Larger shift since last session.";
    default:
      return "";
  }
}
