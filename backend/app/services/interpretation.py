"""
Human-readable interpretation of structural, angle-aware, and confidence scores.

Neutral, observational language only — no medical claims.
"""

from __future__ import annotations

from typing import Dict, Optional, TypedDict


class InterpretationFlags(TypedDict, total=False):
    angle_mismatch: bool
    early_baseline: bool


class InterpretationResult(TypedDict):
    summary_text: str
    explanation_text: str
    confidence_label: str
    flags: InterpretationFlags


# Structural (embedding-based overall change)
def _structural_bucket(score: float) -> int:
    if score < 0.10:
        return 0
    if score < 0.25:
        return 1
    if score < 0.45:
        return 2
    return 3


# Angle-aware score
def _angle_bucket(score: float) -> int:
    if score < 0.15:
        return 0
    if score < 0.35:
        return 1
    if score < 0.60:
        return 2
    return 3


def _structural_phrase(bucket: int) -> str:
    return (
        "Structural comparison shows no noticeable difference from your baseline.",
        "Structural comparison shows very slight differences from your baseline.",
        "Structural comparison shows moderate differences from your baseline.",
        "Structural comparison shows strong variation from your baseline.",
    )[bucket]


def _angle_phrase(bucket: int) -> str:
    return (
        "Across viewing angles, positioning looks very consistent.",
        "Across viewing angles, there are slight positional differences.",
        "Across viewing angles, there are noticeable positional differences.",
        "Across viewing angles, there is strong positional change.",
    )[bucket]


def _summary_from_buckets(s_bucket: int, a_bucket: int) -> str:
    max_sev = max(s_bucket, a_bucket)
    if max_sev == 0:
        return "Mostly consistent with your previous sessions"
    if max_sev == 1:
        return "Minor differences detected"
    if max_sev == 2:
        return "Some noticeable differences detected"
    return "Clear variation compared to your baseline"


def _confidence_label(confidence_score: float) -> str:
    if confidence_score >= 0.75:
        return "High"
    if confidence_score >= 0.50:
        return "Moderate"
    return "Low"


def _angle_mismatch(structural_score: float, angle_score: float) -> bool:
    """Low structural change but higher angle-aware change — likely positional drift."""
    return structural_score < 0.25 and angle_score >= 0.35


def generate_interpretation(
    structural_score: float,
    angle_score: float,
    confidence_score: float,
    session_count: int,
) -> InterpretationResult:
    """
    Produce summary and explanation text from numeric scores.

    Args:
        structural_score: Session embedding distance vs baseline (0–1).
        angle_score: Mean per-angle change score (angle-aware, 0–1).
        confidence_score: Analysis confidence in [0, 1].
        session_count: Total completed sessions for this user (including current).
    """
    flags: InterpretationFlags = {}

    if session_count < 3:
        flags["early_baseline"] = True

    # First baseline capture: single session, no prior comparison (scores ~0).
    if session_count == 1 and structural_score <= 1e-6 and angle_score <= 1e-6:
        parts = [
            "This session establishes your personal reference for future comparisons.",
        ]
        if flags.get("early_baseline"):
            parts.append("Your baseline is still being established.")
        explanation = " ".join(parts)
        return {
            "summary_text": "Your baseline is recorded.",
            "explanation_text": explanation,
            "confidence_label": _confidence_label(confidence_score),
            "flags": flags,
        }

    s_bucket = _structural_bucket(structural_score)
    a_bucket = _angle_bucket(angle_score)
    summary = _summary_from_buckets(s_bucket, a_bucket)

    sentences = [_structural_phrase(s_bucket), _angle_phrase(a_bucket)]

    if _angle_mismatch(structural_score, angle_score):
        flags["angle_mismatch"] = True
        sentences.append(
            "Positional differences detected between sessions.",
        )

    if flags.get("early_baseline"):
        sentences.append("Your baseline is still being established.")

    explanation = " ".join(sentences)

    return {
        "summary_text": summary,
        "explanation_text": explanation,
        "confidence_label": _confidence_label(confidence_score),
        "flags": flags,
    }


def interpretation_to_api_dict(
    result: InterpretationResult,
    confidence_score: Optional[float],
) -> Dict[str, object]:
    """Flatten interpretation for JSON responses."""
    out: Dict[str, object] = {
        "summary_text": result["summary_text"],
        "explanation_text": result["explanation_text"],
        "confidence_label": result["confidence_label"],
        "flags": dict(result.get("flags") or {}),
    }
    if confidence_score is not None:
        out["confidence_score"] = float(confidence_score)
    return out
