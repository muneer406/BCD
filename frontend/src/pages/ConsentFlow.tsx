import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { PageShell } from "../components/PageShell";

const STEPS = [
  {
    title: "What BCD does",
    content: [
      "BCD helps you track how your body looks over time by taking photos privately on your phone.",
      "It compares new photos against your past photos to highlight any visible changes.",
      "It does NOT diagnose breast cancer or any medical condition.",
      "It does NOT replace clinical exams, mammograms, or visits to your doctor.",
    ],
  },
  {
    title: "Your data and privacy",
    content: [
      "Your photos are stored securely and used only for your personal baseline comparisons.",
      "They are processed on secure servers and never shared without your permission.",
      "You can export or delete all your data at any time.",
      "We never sell, share, or use your photos for any purpose without your explicit consent.",
    ],
  },
  {
    title: "Research (optional)",
    content: [
      "You can choose to share anonymous data to help improve BCD.",
      "Only de-identified measurements are shared — never your photos.",
      "You can change your mind at any time.",
      "Choosing 'No' will not affect your experience in any way.",
      "This is completely optional.",
    ],
  },
];

export function ConsentFlow() {
  const [step, setStep] = useState(0);
  const [researchOptIn, setResearchOptIn] = useState<boolean | null>(null);
  const navigate = useNavigate();

  const handleNext = () => {
    if (step < STEPS.length - 1) {
      setStep(step + 1);
    } else {
      // Final step — save consent and proceed
      try {
        localStorage.setItem(
          "bcd_consent",
          JSON.stringify({
            completed: true,
            researchOptIn,
            timestamp: new Date().toISOString(),
          })
        );
      } catch {
        // Non-critical — localStorage may be unavailable
      }
      navigate("/capture", { replace: true });
    }
  };

  const current = STEPS[step];
  const isLastStep = step === STEPS.length - 1;
  const canProceed = !isLastStep || researchOptIn !== null;

  const handleReadAloud = (text: string) => {
    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 0.9;
      utterance.pitch = 1.0;
      window.speechSynthesis.speak(utterance);
    }
  };

  return (
    <PageShell className="flex flex-col items-center justify-center min-h-[80vh]">
      <div className="w-full max-w-lg space-y-6">
        {/* Step indicator */}
        <div className="flex items-center gap-2 justify-center">
          {STEPS.map((_, i) => (
            <div key={i} className="flex items-center gap-2">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-colors ${
                  i <= step
                    ? "bg-ink-900 text-sand-50"
                    : "bg-sand-200 text-ink-400"
                }`}
              >
                {i + 1}
              </div>
              {i < STEPS.length - 1 && (
                <div
                  className={`w-8 h-0.5 rounded transition-colors ${
                    i < step ? "bg-ink-900" : "bg-sand-200"
                  }`}
                />
              )}
            </div>
          ))}
        </div>

        <p className="text-center text-xs text-ink-500">
          Step {step + 1} of {STEPS.length}
        </p>

        {/* Content card */}
        <Card className="p-6 space-y-5">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-heading font-bold text-ink-900">
              {current.title}
            </h2>
            <button
              type="button"
              onClick={() => handleReadAloud(current.content.join(". "))}
              className="inline-flex items-center gap-1.5 rounded-full border border-tide-200 px-3 py-1.5 text-xs font-medium text-tide-700 hover:bg-tide-50 transition-colors"
              title="Read aloud"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="w-3.5 h-3.5"
              >
                <path d="M11 5L6 9H2v6h4l5 4V5z" />
                <path d="M19.07 4.93a10 10 0 010 14.14M15.54 8.46a5 5 0 010 7.07" />
              </svg>
              Listen
            </button>
          </div>

          <ul className="space-y-3">
            {current.content.map((text, i) => (
              <li key={i} className="flex items-start gap-3 text-sm text-ink-700 leading-relaxed">
                <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-tide-400 flex-shrink-0" />
                {text}
              </li>
            ))}
          </ul>

          {/* Research opt-in (step 3 only) */}
          {isLastStep && (
            <div className="space-y-3 pt-2 border-t border-tide-200">
              <p className="text-sm font-semibold text-ink-900">
                Would you like to help improve BCD?
              </p>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setResearchOptIn(true)}
                  className={`flex-1 rounded-xl border-2 px-4 py-3 text-sm font-semibold transition-colors ${
                    researchOptIn === true
                      ? "border-ink-900 bg-ink-900 text-sand-50"
                      : "border-sand-200 bg-white text-ink-700 hover:border-tide-300"
                  }`}
                >
                  Yes, I'm in
                </button>
                <button
                  type="button"
                  onClick={() => setResearchOptIn(false)}
                  className={`flex-1 rounded-xl border-2 px-4 py-3 text-sm font-semibold transition-colors ${
                    researchOptIn === false
                      ? "border-ink-900 bg-ink-900 text-sand-50"
                      : "border-sand-200 bg-white text-ink-700 hover:border-tide-300"
                  }`}
                >
                  No, thanks
                </button>
              </div>
              <p className="text-xs text-ink-500">
                You can change this later in Settings.
              </p>
            </div>
          )}
        </Card>

        {/* Actions */}
        <div className="flex justify-between items-center">
          {step > 0 ? (
            <button
              type="button"
              onClick={() => setStep(step - 1)}
              className="text-sm font-medium text-ink-600 hover:text-ink-900 transition-colors"
            >
              Back
            </button>
          ) : (
            <div />
          )}
          <Button
            onClick={handleNext}
            disabled={!canProceed}
          >
            {isLastStep ? "Start using BCD" : "Continue"}
          </Button>
        </div>

        {/* Medical disclaimer */}
        {isLastStep && (
          <p className="text-xs text-ink-400 text-center leading-relaxed">
            BCD is not a medical device. It does not diagnose breast cancer or any medical condition.
            Always consult your healthcare provider for medical advice.
          </p>
        )}
      </div>
    </PageShell>
  );
}
