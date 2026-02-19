"""
Phase 5 API integration tests.
All external dependencies (DB, ML, storage) are mocked.
"""

import numpy as np
import pytest
from fastapi.testclient import TestClient


# ---------------------------------------------------------------------------
# Shared mocks / fixtures
# ---------------------------------------------------------------------------

FAKE_USER = {"user_id": "test-user-123",
             "role": "authenticated", "email": "t@t.com"}
FAKE_SESSION_ID = "aaaa-bbbb-cccc-dddd"
FAKE_PREV_SESSION_ID = "1111-2222-3333-4444"


def _make_analysis_result(is_first=False):
    """Minimal analysis result dict that matches analyze_session's return shape."""
    from app.processing.quality import variation_level
    score = 0.0 if is_first else 0.42
    return {
        "per_angle": [
            {
                "angle_type": at,
                "change_score": score,
                "variation_level": variation_level(score),
                "angle_quality_score": 0.78,
                "image_quality": [{"blur_score": 300.0, "brightness": 0.50,
                                   "is_blurry": False, "is_too_dark": False,
                                   "is_too_bright": False, "quality_score": 0.78}],
                "summary": f"Distance-based analysis for {at} angle.",
            }
            for at in ["front", "left", "right", "up", "down", "raised"]
        ],
        "overall_summary": "Baseline established." if is_first else "ML analysis complete.",
        "scores": {
            "overall_change_score": score,
            "variation_level": variation_level(score),
            "trend_score": None if is_first else 0.38,
            "is_first_session": is_first,
            "analysis_confidence_score": 0.82,
            "session_quality_score": 0.77,
        },
        "image_quality_summary": {
            "session_quality_score": 0.77,
            "analysis_confidence_score": 0.82,
            "consistency_score": 0.95,
            "low_quality_angles": [],
            "blurry_images_count": 0,
            "total_images": 6,
        },
        "baseline_used": "none" if is_first else "lifetime_mean",
        "comparison_layers_used": [] if is_first else ["lifetime_baseline"],
        "processing_time_ms": 2500,
    }


def _make_comparison_result():
    from app.processing.quality import variation_level
    delta = 0.07
    return {
        "per_angle": [
            {
                "angle_type": "front",
                "current_score": 0.45, "previous_score": 0.42,
                "delta": 0.03, "delta_magnitude": 0.03,
                "embedding_distance": 0.11,
                "variation_level": variation_level(0.03),
            }
        ],
        "overall_delta": delta,
        "stability_index": 1.0 - delta,
        "overall_trend": "stable",
        "overall_variation_level": variation_level(delta),
        "comparison_method": "embedding",
        "rolling_baseline":  {"delta": 0.09, "trend": "stable", "variation_level": "Stable", "available": True},
        "monthly_baseline":  {"delta": 0.09, "trend": "stable", "variation_level": "Stable", "available": True},
        "lifetime_baseline": {"delta": 0.09, "trend": "stable", "variation_level": "Stable", "available": True},
        "baseline_used": "session_embeddings",
        "comparison_layers_used": ["immediate", "rolling", "monthly", "lifetime"],
        "processing_time_ms": 120,
    }


@pytest.fixture
def client(monkeypatch):
    """TestClient with all external calls mocked out."""
    from app.main import app
    from app.dependencies import get_current_user

    # ── Auth override via FastAPI dependency_overrides ──────────────────────
    app.dependency_overrides[get_current_user] = lambda: FAKE_USER

    # ── Patch local names in each API module ─────────────────────────────────
    # All modules import get_session/get_session_images directly, so we must
    # patch the symbol on the module where it lives, not on session_service.
    from app.api import analyze_session as analyze_module
    from app.api import analyze_status as status_module
    from app.api import compare_sessions as compare_module

    def _fake_session(session_id, user_id): return {
        "id": session_id, "status": "completed"}

    def _fake_images(session_id, user_id): return [
        {"image_type": at, "storage_path": f"path/{at}.jpg"}
        for at in ["front", "left", "right", "up", "down", "raised"]
    ]
    monkeypatch.setattr(analyze_module, "get_session",        _fake_session)
    monkeypatch.setattr(analyze_module, "get_session_images", _fake_images)
    monkeypatch.setattr(status_module,  "get_session",        _fake_session)
    monkeypatch.setattr(compare_module, "get_session",        _fake_session)

    # ── ML pipeline ──────────────────────────────────────────────────────────
    monkeypatch.setattr(analyze_module, "run_analysis",
                        lambda images, user_id, session_id: _make_analysis_result())
    monkeypatch.setattr(analyze_module, "_persist_analysis",
                        lambda session_id, user_id, analysis: False)

    # ── Comparison pipeline ───────────────────────────────────────────────────
    monkeypatch.setattr(compare_module, "run_comparison",
                        lambda cid, pid, user_id: _make_comparison_result())

    # ── DB stub for analyze_status (fallback DB query) ────────────────────────
    from app.api import analyze_status as status_module  # noqa: F811

    class _FakeResult:
        data = []

    class _FakeTable:
        def select(self, *a): return self
        def eq(self, *a): return self
        def limit(self, *a): return self
        def execute(self): return _FakeResult()

    class _FakeSupabase:
        def table(self, *a): return _FakeTable()

    monkeypatch.setattr(status_module, "get_supabase_client",
                        lambda: _FakeSupabase())

    yield TestClient(app, raise_server_exceptions=False)

    # ── Cleanup ───────────────────────────────────────────────────────────────
    app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# Health check
# ---------------------------------------------------------------------------

class TestHealthCheck:
    def test_health_ok(self, client):
        r = client.get("/")
        assert r.status_code == 200
        assert r.json() == {"status": "ok"}


# ---------------------------------------------------------------------------
# POST /api/analyze-session
# ---------------------------------------------------------------------------

class TestAnalyzeSession:
    def test_success_returns_200(self, client):
        r = client.post(
            f"/api/analyze-session/{FAKE_SESSION_ID}",
            headers={"Authorization": "Bearer fake-token"},
        )
        assert r.status_code == 200
        data = r.json()
        assert data["success"] is True

    def test_response_has_required_fields(self, client):
        r = client.post(
            f"/api/analyze-session/{FAKE_SESSION_ID}",
            headers={"Authorization": "Bearer fake-token"},
        )
        d = r.json()["data"]
        # Phase 4 fields
        assert "session_id" in d
        assert "overwritten" in d
        assert "is_first_session" in d
        assert "session_analysis" in d
        assert "scores" in d
        # Phase 5 trust fields
        assert "image_quality_summary" in d
        assert "baseline_used" in d
        assert "comparison_layers_used" in d

    def test_scores_has_variation_level(self, client):
        r = client.post(
            f"/api/analyze-session/{FAKE_SESSION_ID}",
            headers={"Authorization": "Bearer fake-token"},
        )
        scores = r.json()["data"]["scores"]
        assert "variation_level" in scores
        assert "analysis_confidence_score" in scores
        assert "session_quality_score" in scores

    def test_image_quality_summary_fields(self, client):
        r = client.post(
            f"/api/analyze-session/{FAKE_SESSION_ID}",
            headers={"Authorization": "Bearer fake-token"},
        )
        qs = r.json()["data"]["image_quality_summary"]
        assert "session_quality_score" in qs
        assert "analysis_confidence_score" in qs
        assert "consistency_score" in qs
        assert "low_quality_angles" in qs
        assert "blurry_images_count" in qs


# ---------------------------------------------------------------------------
# GET /api/analyze-status
# ---------------------------------------------------------------------------

class TestAnalyzeStatus:
    def test_not_started_when_no_job_and_no_db_row(self, client):
        r = client.get(
            f"/api/analyze-status/{FAKE_SESSION_ID}",
            headers={"Authorization": "Bearer fake-token"},
        )
        assert r.status_code == 200
        assert r.json()["data"]["status"] == "not_started"

    def test_processing_when_in_registry(self, client, monkeypatch):
        from app.api import analyze_session as am
        am._analysis_jobs[FAKE_SESSION_ID] = {
            "status": "processing", "error": None}
        try:
            r = client.get(
                f"/api/analyze-status/{FAKE_SESSION_ID}",
                headers={"Authorization": "Bearer fake-token"},
            )
            assert r.json()["data"]["status"] == "processing"
        finally:
            am._analysis_jobs.pop(FAKE_SESSION_ID, None)

    def test_completed_when_in_registry(self, client, monkeypatch):
        from app.api import analyze_session as am
        am._analysis_jobs[FAKE_SESSION_ID] = {
            "status": "completed", "error": None}
        try:
            r = client.get(
                f"/api/analyze-status/{FAKE_SESSION_ID}",
                headers={"Authorization": "Bearer fake-token"},
            )
            assert r.json()["data"]["status"] == "completed"
        finally:
            am._analysis_jobs.pop(FAKE_SESSION_ID, None)

    def test_failed_when_in_registry(self, client, monkeypatch):
        from app.api import analyze_session as am
        am._analysis_jobs[FAKE_SESSION_ID] = {
            "status": "failed", "error": "timeout"}
        try:
            r = client.get(
                f"/api/analyze-status/{FAKE_SESSION_ID}",
                headers={"Authorization": "Bearer fake-token"},
            )
            d = r.json()["data"]
            assert d["status"] == "failed"
            assert d["error"] == "timeout"
        finally:
            am._analysis_jobs.pop(FAKE_SESSION_ID, None)


# ---------------------------------------------------------------------------
# POST /api/compare-sessions
# ---------------------------------------------------------------------------

class TestCompareSessions:
    def test_success_returns_200(self, client):
        r = client.post(
            f"/api/compare-sessions/{FAKE_SESSION_ID}/{FAKE_PREV_SESSION_ID}",
            headers={"Authorization": "Bearer fake-token"},
        )
        assert r.status_code == 200
        assert r.json()["success"] is True

    def test_response_has_phase5_trust_fields(self, client):
        r = client.post(
            f"/api/compare-sessions/{FAKE_SESSION_ID}/{FAKE_PREV_SESSION_ID}",
            headers={"Authorization": "Bearer fake-token"},
        )
        d = r.json()["data"]
        assert "overall_variation_level" in d
        assert "baseline_used" in d
        assert "comparison_layers_used" in d
        assert "processing_time_ms" in d

    def test_per_angle_has_variation_level(self, client):
        r = client.post(
            f"/api/compare-sessions/{FAKE_SESSION_ID}/{FAKE_PREV_SESSION_ID}",
            headers={"Authorization": "Bearer fake-token"},
        )
        per_angle = r.json()["data"]["per_angle"]
        assert len(per_angle) > 0
        assert "variation_level" in per_angle[0]

    def test_baseline_layers_have_variation_level(self, client):
        r = client.post(
            f"/api/compare-sessions/{FAKE_SESSION_ID}/{FAKE_PREV_SESSION_ID}",
            headers={"Authorization": "Bearer fake-token"},
        )
        d = r.json()["data"]
        for layer in ("rolling_baseline", "monthly_baseline", "lifetime_baseline"):
            assert layer in d
            assert "variation_level" in d[layer]

    def test_same_id_returns_400(self, client):
        r = client.post(
            f"/api/compare-sessions/{FAKE_SESSION_ID}/{FAKE_SESSION_ID}",
            headers={"Authorization": "Bearer fake-token"},
        )
        assert r.status_code == 400
