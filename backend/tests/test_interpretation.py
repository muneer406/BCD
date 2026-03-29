"""Unit tests for interpretation.generate_interpretation."""

import pytest

from app.services.interpretation import generate_interpretation


def test_baseline_first_session():
    r = generate_interpretation(0.0, 0.0, 0.82, 1)
    assert r["summary_text"] == "Your baseline is recorded."
    assert "baseline" in r["explanation_text"].lower()
    assert r["confidence_label"] == "High"
    assert r["flags"].get("early_baseline") is True


def test_mostly_consistent():
    r = generate_interpretation(0.05, 0.10, 0.80, 5)
    assert r["summary_text"] == "Mostly consistent with your previous sessions"
    assert "Structural comparison" in r["explanation_text"]
    assert r["confidence_label"] == "High"
    assert "early_baseline" not in r["flags"]


def test_clear_variation():
    r = generate_interpretation(0.50, 0.65, 0.55, 4)
    assert r["summary_text"] == "Clear variation compared to your baseline"
    assert r["confidence_label"] == "Moderate"


def test_angle_mismatch_flag():
    r = generate_interpretation(0.15, 0.40, 0.76, 5)
    assert r["flags"].get("angle_mismatch") is True
    assert "Positional differences detected between sessions." in r["explanation_text"]


def test_early_baseline_session_count_2():
    r = generate_interpretation(0.12, 0.20, 0.60, 2)
    assert r["flags"].get("early_baseline") is True
    assert "still being established" in r["explanation_text"]


@pytest.mark.parametrize(
    "conf,label",
    [
        (0.76, "High"),
        (0.75, "High"),
        (0.74, "Moderate"),
        (0.50, "Moderate"),
        (0.49, "Low"),
        (0.0, "Low"),
    ],
)
def test_confidence_labels(conf, label):
    r = generate_interpretation(0.1, 0.1, conf, 5)
    assert r["confidence_label"] == label
