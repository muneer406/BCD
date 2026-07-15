export const CYCLE_STORAGE_KEY = "bcd_cycle_logs";

export type CyclePhase =
  | "menstrual"
  | "follicular"
  | "ovulation"
  | "luteal"
  | "unknown";

export type CycleSymptom =
  | "none"
  | "cramping"
  | "tenderness"
  | "bloating"
  | "headache"
  | "mood_changes"
  | "other";

export const PHASE_LABELS: Record<CyclePhase, string> = {
  menstrual: "Menstrual",
  follicular: "Follicular",
  ovulation: "Ovulation",
  luteal: "Luteal",
  unknown: "Not sure/prefer not to say",
};

export const PHASE_COLORS: Record<CyclePhase, string> = {
  menstrual: "bg-red-500",
  follicular: "bg-orange-500",
  ovulation: "bg-green-500",
  luteal: "bg-blue-500",
  unknown: "bg-sand-400",
};

export const PHASE_RING_COLORS: Record<CyclePhase, string> = {
  menstrual: "ring-red-400",
  follicular: "ring-orange-400",
  ovulation: "ring-green-400",
  luteal: "ring-blue-400",
  unknown: "ring-sand-300",
};

export const SYMPTOM_LABELS: Record<CycleSymptom, string> = {
  none: "None",
  cramping: "Cramping",
  tenderness: "Tenderness",
  bloating: "Bloating",
  headache: "Headache",
  mood_changes: "Mood changes",
  other: "Other",
};

export const CYCLE_LENGTH_OPTIONS: (number | "unknown")[] = [
  21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, "unknown",
];

export type CycleLog = {
  date: string; // ISO date (YYYY-MM-DD)
  phase: CyclePhase;
  startDate: string; // ISO date of last menstrual period
  cycleLength: number | "unknown";
  symptoms: CycleSymptom[];
  otherSymptom?: string;
  notes?: string;
  updatedAt: string; // ISO timestamp
};

export type CycleLogs = Record<string, CycleLog>; // keyed by ISO date

export function getCycleLogs(): CycleLogs {
  try {
    const stored = localStorage.getItem(CYCLE_STORAGE_KEY);
    if (!stored) return {};
    return JSON.parse(stored) as CycleLogs;
  } catch {
    return {};
  }
}

export function setCycleLogs(logs: CycleLogs): void {
  try {
    localStorage.setItem(CYCLE_STORAGE_KEY, JSON.stringify(logs));
  } catch {
    // localStorage may be unavailable; fail silently
  }
}

export function saveCycleLog(date: string, log: Omit<CycleLog, "date">): void {
  const logs = getCycleLogs();
  logs[date] = { ...log, date };
  setCycleLogs(logs);
}

export function deleteCycleLog(date: string): void {
  const logs = getCycleLogs();
  delete logs[date];
  setCycleLogs(logs);
}

export function getCycleLogForDate(date: string): CycleLog | null {
  return getCycleLogs()[date] ?? null;
}

function formatISODate(date: Date): string {
  return date.toISOString().split("T")[0];
}

export function getCycleDayForDate(
  targetDate: string | Date,
  startDate: string | Date,
  cycleLength: number | "unknown" = 28,
): number | null {
  const start = new Date(startDate);
  const target = new Date(targetDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(target.getTime())) {
    return null;
  }

  // Normalize to midnight UTC
  const startMid = new Date(
    Date.UTC(start.getFullYear(), start.getMonth(), start.getDate()),
  );
  const targetMid = new Date(
    Date.UTC(target.getFullYear(), target.getMonth(), target.getDate()),
  );

  const diffMs = targetMid.getTime() - startMid.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays < 0) return null;

  const length = cycleLength === "unknown" ? 28 : cycleLength;
  return (diffDays % length) + 1;
}

export function predictPhaseForDate(
  targetDate: string | Date,
  startDate: string | Date,
  cycleLength: number | "unknown" = 28,
): CyclePhase | null {
  const cycleDay = getCycleDayForDate(targetDate, startDate, cycleLength);
  if (cycleDay === null) return null;

  const length = cycleLength === "unknown" ? 28 : cycleLength;

  // Approximate phase ranges:
  // Menstrual: days 1-5
  // Follicular: days 6-13
  // Ovulation: days 14-16
  // Luteal: days 17-cycleLength
  if (cycleDay <= 5) return "menstrual";
  if (cycleDay <= 13) return "follicular";
  if (cycleDay <= 16) return "ovulation";
  return "luteal";
}

export function getPhaseForDate(date: string): CyclePhase | null {
  const log = getCycleLogForDate(date);
  if (log && log.phase !== "unknown") {
    return log.phase;
  }

  // Fall back to predicted phase based on the most recent log with a start date
  const logs = getCycleLogs();
  const candidates = Object.values(logs)
    .filter((l) => l.startDate)
    .sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    );

  const latest = candidates[0];
  if (!latest) return null;

  return predictPhaseForDate(date, latest.startDate, latest.cycleLength);
}

export function getCycleContextForDate(date: string): {
  cycleDay: number | null;
  phase: CyclePhase | null;
  predictedNextPhase: string | null;
} {
  const log = getCycleLogForDate(date);
  const cycleDay = log
    ? getCycleDayForDate(date, log.startDate, log.cycleLength)
    : null;
  const phase = log?.phase ?? getPhaseForDate(date);

  let predictedNextPhase: string | null = null;
  if (phase && cycleDay !== null && log?.cycleLength !== "unknown") {
    const length = log?.cycleLength === "unknown" ? 28 : (log?.cycleLength ?? 28);
    let daysUntil = 0;
    let next: CyclePhase = phase;

    if (phase === "menstrual") {
      next = "follicular";
      daysUntil = 6 - cycleDay;
    } else if (phase === "follicular") {
      next = "ovulation";
      daysUntil = 14 - cycleDay;
    } else if (phase === "ovulation") {
      next = "luteal";
      daysUntil = 17 - cycleDay;
    } else if (phase === "luteal") {
      next = "menstrual";
      daysUntil = length + 1 - cycleDay;
    }

    if (daysUntil === 0 && phase !== "unknown") {
      predictedNextPhase = `Transitioning to ${PHASE_LABELS[next].toLowerCase()} today`;
    } else if (daysUntil > 0) {
      predictedNextPhase = `${PHASE_LABELS[next]} phase in ${daysUntil} day${daysUntil === 1 ? "" : "s"}`;
    } else {
      predictedNextPhase = `${PHASE_LABELS[next]} phase soon`;
    }
  }

  return { cycleDay, phase, predictedNextPhase };
}

export function getDaysInMonth(year: number, month: number): Date[] {
  const days: Date[] = [];
  const date = new Date(year, month, 1);
  while (date.getMonth() === month) {
    days.push(new Date(date));
    date.setDate(date.getDate() + 1);
  }
  return days;
}

export function getMonthStartOffset(year: number, month: number): number {
  return new Date(year, month, 1).getDay();
}
