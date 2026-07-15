import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  CircleDot,
  Droplets,
  Save,
  Trash2,
} from "lucide-react";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { PageShell } from "../components/PageShell";
import { SectionHeading } from "../components/SectionHeading";
import {
  CYCLE_LENGTH_OPTIONS,
  deleteCycleLog,
  getCycleContextForDate,
  getCycleLogs,
  getDaysInMonth,
  getMonthStartOffset,
  PHASE_COLORS,
  PHASE_LABELS,
  PHASE_RING_COLORS,
  saveCycleLog,
  SYMPTOM_LABELS,
  type CycleLog,
  type CyclePhase,
  type CycleSymptom,
} from "../utils/cycle";

const PHASES: CyclePhase[] = [
  "menstrual",
  "follicular",
  "ovulation",
  "luteal",
  "unknown",
];
const SYMPTOMS: CycleSymptom[] = [
  "none",
  "cramping",
  "tenderness",
  "bloating",
  "headache",
  "mood_changes",
  "other",
];

function toISODate(d: Date): string {
  return d.toISOString().split("T")[0];
}

export function CycleTracker() {
  const today = useMemo(() => new Date(), []);
  const [viewDate, setViewDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(toISODate(today));
  const [logs, setLogs] = useState<Record<string, CycleLog>>({});
  const [savedMessage, setSavedMessage] = useState<string | null>(null);

  const [phase, setPhase] = useState<CyclePhase>("unknown");
  const [startDate, setStartDate] = useState(toISODate(today));
  const [cycleLength, setCycleLength] = useState<number | "unknown">(28);
  const [symptoms, setSymptoms] = useState<CycleSymptom[]>(["none"]);
  const [otherSymptom, setOtherSymptom] = useState("");
  const [notes, setNotes] = useState("");

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const days = useMemo(() => getDaysInMonth(year, month), [year, month]);
  const startOffset = useMemo(() => getMonthStartOffset(year, month), [year, month]);

  useEffect(() => {
    setLogs(getCycleLogs());
  }, []);

  useEffect(() => {
    const log = logs[selectedDate];
    if (log) {
      setPhase(log.phase);
      setStartDate(log.startDate || selectedDate);
      setCycleLength(log.cycleLength ?? 28);
      setSymptoms(log.symptoms?.length ? log.symptoms : ["none"]);
      setOtherSymptom(log.otherSymptom || "");
      setNotes(log.notes || "");
    } else {
      setPhase("unknown");
      setStartDate(selectedDate);
      setCycleLength(28);
      setSymptoms(["none"]);
      setOtherSymptom("");
      setNotes("");
    }
  }, [selectedDate, logs]);

  const { cycleDay, phase: contextPhase, predictedNextPhase } = useMemo(
    () => getCycleContextForDate(selectedDate),
    [selectedDate, logs],
  );

  const hasLog = Boolean(logs[selectedDate]);

  function persist(updatedLogs: Record<string, CycleLog>) {
    setLogs(updatedLogs);
  }

  function handleSymptomToggle(symptom: CycleSymptom) {
    setSymptoms((prev) => {
      if (symptom === "none") {
        return ["none"];
      }
      const next = prev.filter((s) => s !== "none");
      if (next.includes(symptom)) {
        const filtered = next.filter((s) => s !== symptom);
        return filtered.length ? filtered : ["none"];
      }
      return [...next, symptom];
    });
  }

  function handleSave() {
    const updatedLog: CycleLog = {
      date: selectedDate,
      phase,
      startDate,
      cycleLength,
      symptoms,
      otherSymptom: symptoms.includes("other") ? otherSymptom.trim() : undefined,
      notes: notes.trim() || undefined,
      updatedAt: new Date().toISOString(),
    };
    saveCycleLog(selectedDate, updatedLog);
    const updated = getCycleLogs();
    persist(updated);
    setSavedMessage("Saved");
    setTimeout(() => setSavedMessage(null), 2000);
  }

  function handleDelete() {
    if (!hasLog) return;
    deleteCycleLog(selectedDate);
    const updated = getCycleLogs();
    persist(updated);
  }

  function changeMonth(delta: number) {
    setViewDate((prev) => new Date(prev.getFullYear(), prev.getMonth() + delta, 1));
  }

  function goToToday() {
    const now = new Date();
    setViewDate(now);
    const iso = toISODate(now);
    setSelectedDate(iso);
  }

  const monthLabel = viewDate.toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });

  return (
    <PageShell>
      <div className="mb-8">
        <SectionHeading
          eyebrow="Cycle tracking"
          title="Log your menstrual cycle"
          description="Tracking your cycle can help you understand how hormonal changes relate to your visual sessions."
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Calendar */}
        <Card className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-heading font-semibold text-ink-900 flex items-center gap-2">
              <CalendarIcon className="h-5 w-5 text-tide-600" />
              {monthLabel}
            </h2>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => changeMonth(-1)}
                className="rounded-full p-1.5 text-ink-700 hover:bg-sand-100 transition"
                aria-label="Previous month"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <button
                type="button"
                onClick={goToToday}
                className="text-xs font-semibold text-ink-700 hover:text-ink-900 px-2 py-1 rounded-full hover:bg-sand-100 transition"
              >
                Today
              </button>
              <button
                type="button"
                onClick={() => changeMonth(1)}
                className="rounded-full p-1.5 text-ink-700 hover:bg-sand-100 transition"
                aria-label="Next month"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-7 gap-1 text-center">
            {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d) => (
              <div
                key={d}
                className="text-[11px] font-semibold uppercase tracking-wider text-sand-700 py-1"
              >
                {d}
              </div>
            ))}
            {Array.from({ length: startOffset }).map((_, i) => (
              <div key={`empty-${i}`} />
            ))}
            {days.map((date) => {
              const iso = toISODate(date);
              const log = logs[iso];
              const isSelected = iso === selectedDate;
              const isToday = iso === toISODate(today);
              const phaseForDay =
                log?.phase && log.phase !== "unknown"
                  ? log.phase
                  : null;

              return (
                <button
                  key={iso}
                  type="button"
                  onClick={() => setSelectedDate(iso)}
                  className={`relative flex flex-col items-center justify-center rounded-xl p-1.5 aspect-square transition ${
                    isSelected
                      ? "bg-ink-900 text-sand-50 shadow-lift"
                      : "hover:bg-sand-100 text-ink-900"
                  } ${isToday && !isSelected ? "ring-1 ring-tide-400 bg-tide-50/50" : ""}`}
                >
                  <span className="text-sm font-semibold">{date.getDate()}</span>
                  {phaseForDay && (
                    <span
                      className={`mt-1 h-2 w-2 rounded-full ${PHASE_COLORS[phaseForDay]}`}
                      aria-hidden
                    />
                  )}
                  {isToday && (
                    <span className="absolute top-1 right-1 h-1.5 w-1.5 rounded-full bg-tide-500" />
                  )}
                </button>
              );
            })}
          </div>

          <div className="flex flex-wrap gap-3 pt-2 text-xs">
            {(
              [
                ["menstrual", "Menstrual"],
                ["follicular", "Follicular"],
                ["ovulation", "Ovulation"],
                ["luteal", "Luteal"],
              ] as const
            ).map(([key, label]) => (
              <div key={key} className="flex items-center gap-1.5">
                <span className={`h-2.5 w-2.5 rounded-full ${PHASE_COLORS[key]}`} />
                <span className="text-ink-700">{label}</span>
              </div>
            ))}
          </div>
        </Card>

        {/* Form */}
        <Card className="space-y-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-heading font-semibold text-ink-900 flex items-center gap-2">
                <Droplets className="h-5 w-5 text-tide-600" />
                {new Date(selectedDate).toLocaleDateString(undefined, {
                  weekday: "long",
                  month: "long",
                  day: "numeric",
                })}
              </h2>
              {hasLog && (
                <p className="text-xs text-green-700 mt-1 flex items-center gap-1">
                  <CircleDot className="h-3 w-3" />
                  Logged
                </p>
              )}
            </div>
            <div className="text-right">
              {cycleDay !== null && (
                <p className="text-sm font-semibold text-ink-900">
                  Cycle day {cycleDay}
                </p>
              )}
              {contextPhase && contextPhase !== "unknown" && (
                <p className="text-xs text-ink-700">
                  {PHASE_LABELS[contextPhase]} phase
                </p>
              )}
              {predictedNextPhase && (
                <p className="text-xs text-ink-500">{predictedNextPhase}</p>
              )}
            </div>
          </div>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <label
                htmlFor="phase"
                className="text-sm font-semibold text-ink-900"
              >
                Current phase
              </label>
              <select
                id="phase"
                value={phase}
                onChange={(e) => setPhase(e.target.value as CyclePhase)}
                className="w-full rounded-xl border border-sand-200 bg-white px-3 py-2 text-sm text-ink-900 focus:border-tide-500 focus:outline-none focus:ring-2 focus:ring-tide-200"
              >
                {PHASES.map((p) => (
                  <option key={p} value={p}>
                    {PHASE_LABELS[p]}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="startDate"
                className="text-sm font-semibold text-ink-900"
              >
                Last menstrual period start date
              </label>
              <input
                id="startDate"
                type="date"
                value={startDate}
                max={toISODate(today)}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full rounded-xl border border-sand-200 bg-white px-3 py-2 text-sm text-ink-900 focus:border-tide-500 focus:outline-none focus:ring-2 focus:ring-tide-200"
              />
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="cycleLength"
                className="text-sm font-semibold text-ink-900"
              >
                Cycle length
              </label>
              <select
                id="cycleLength"
                value={cycleLength}
                onChange={(e) =>
                  setCycleLength(
                    e.target.value === "unknown"
                      ? "unknown"
                      : Number(e.target.value),
                  )
                }
                className="w-full rounded-xl border border-sand-200 bg-white px-3 py-2 text-sm text-ink-900 focus:border-tide-500 focus:outline-none focus:ring-2 focus:ring-tide-200"
              >
                {CYCLE_LENGTH_OPTIONS.map((len) => (
                  <option key={len} value={len}>
                    {len === "unknown" ? "Not sure" : `${len} days`}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-semibold text-ink-900">Symptoms</p>
              <div className="grid grid-cols-2 gap-2">
                {SYMPTOMS.map((s) => (
                  <label
                    key={s}
                    className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-sm transition cursor-pointer ${
                      symptoms.includes(s)
                        ? "border-tide-300 bg-tide-50 text-ink-900"
                        : "border-sand-200 bg-white text-ink-700 hover:bg-sand-50"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={symptoms.includes(s)}
                      onChange={() => handleSymptomToggle(s)}
                      className="h-4 w-4 rounded border-sand-300 text-tide-600 focus:ring-tide-500"
                    />
                    {SYMPTOM_LABELS[s]}
                  </label>
                ))}
              </div>
            </div>

            {symptoms.includes("other") && (
              <div className="space-y-1.5">
                <label
                  htmlFor="otherSymptom"
                  className="text-sm font-semibold text-ink-900"
                >
                  Other symptom
                </label>
                <input
                  id="otherSymptom"
                  type="text"
                  value={otherSymptom}
                  onChange={(e) => setOtherSymptom(e.target.value)}
                  placeholder="Describe your symptom"
                  className="w-full rounded-xl border border-sand-200 bg-white px-3 py-2 text-sm text-ink-900 focus:border-tide-500 focus:outline-none focus:ring-2 focus:ring-tide-200"
                />
              </div>
            )}

            <div className="space-y-1.5">
              <label
                htmlFor="notes"
                className="text-sm font-semibold text-ink-900"
              >
                Notes (optional)
              </label>
              <textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                placeholder="Anything else you want to note about today..."
                className="w-full rounded-xl border border-sand-200 bg-white px-3 py-2 text-sm text-ink-900 focus:border-tide-500 focus:outline-none focus:ring-2 focus:ring-tide-200 resize-none"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-2">
            <Button onClick={handleSave} className="flex items-center gap-2">
              <Save className="h-4 w-4" />
              Save log
            </Button>
            {hasLog && (
              <Button
                variant="outline"
                onClick={handleDelete}
                className="flex items-center gap-2 text-red-700 border-red-200 hover:bg-red-50"
              >
                <Trash2 className="h-4 w-4" />
                Delete
              </Button>
            )}
            <Link to="/history">
              <Button variant="ghost">Back to history</Button>
            </Link>
            {savedMessage && (
              <span className="text-sm font-semibold text-green-700 animate-fade">
                {savedMessage}
              </span>
            )}
          </div>
        </Card>
      </div>

      <Card tone="soft" className="mt-6">
        <p className="text-xs text-ink-600 leading-relaxed">
          Cycle predictions are estimates based on the most recent cycle log and
          an average 28-day cycle. They are not a substitute for medical advice
          or fertility tracking.
        </p>
      </Card>
    </PageShell>
  );
}
