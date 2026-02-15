from typing import Any, Dict, List

from fastapi.testclient import TestClient

from app.dependencies import get_current_user
from app.main import app


class FakeResult:
    def __init__(self, data: List[Dict[str, Any]] | None):
        self.data = data


class FakeTable:
    def __init__(self, name: str, store: Dict[str, List[Dict[str, Any]]]):
        self.name = name
        self.store = store

    def select(self, *_args, **_kwargs):
        return self

    def eq(self, *_args, **_kwargs):
        return self

    def limit(self, *_args, **_kwargs):
        return self

    def delete(self):
        self.store[self.name] = []
        return self

    def insert(self, rows):
        if isinstance(rows, list):
            self.store[self.name] = rows
        else:
            self.store[self.name] = [rows]
        return self

    def execute(self):
        return FakeResult(self.store.get(self.name, []))


class FakeSupabase:
    def __init__(self, store: Dict[str, List[Dict[str, Any]]]):
        self.store = store

    def table(self, name: str):
        return FakeTable(name, self.store)


def setup_client():
    app.dependency_overrides[get_current_user] = lambda: {"user_id": "user-1"}
    return TestClient(app)


def test_analyze_session_success(monkeypatch):
    client = setup_client()

    from app.api import analyze_session as analyze_module

    monkeypatch.setattr(
        analyze_module,
        "get_session",
        lambda _sid, _uid: {"id": "session-1", "status": "completed"},
    )
    monkeypatch.setattr(
        analyze_module,
        "get_session_images",
        lambda *_args, **_kwargs: [
            {"image_type": "front"},
            {"image_type": "left"},
            {"image_type": "right"},
            {"image_type": "up"},
            {"image_type": "down"},
            {"image_type": "raised"},
        ],
    )
    monkeypatch.setattr(
        analyze_module,
        "run_analysis",
        lambda _images: {
            "per_angle": [
                {"angle_type": "front", "change_score": 0.1, "summary": "ok"}
            ],
            "overall_summary": "ok",
            "scores": {"overall_change_score": 0.1},
        },
    )

    store: Dict[str, List[Dict[str, Any]]] = {}
    monkeypatch.setattr(analyze_module, "get_supabase_client",
                        lambda: FakeSupabase(store))

    response = client.post("/api/analyze-session/session-1")
    assert response.status_code == 200
    payload = response.json()
    assert payload["success"] is True
    assert payload["data"]["session_id"] == "session-1"


def test_analyze_session_missing_angles(monkeypatch):
    client = setup_client()

    from app.api import analyze_session as analyze_module

    monkeypatch.setattr(
        analyze_module,
        "get_session",
        lambda _sid, _uid: {"id": "session-1", "status": "completed"},
    )
    monkeypatch.setattr(
        analyze_module,
        "get_session_images",
        lambda *_args, **_kwargs: [{"image_type": "front"}],
    )

    response = client.post("/api/analyze-session/session-1")
    assert response.status_code == 400


def test_compare_sessions_success(monkeypatch):
    client = setup_client()

    from app.api import compare_sessions as compare_module

    monkeypatch.setattr(
        compare_module,
        "get_session",
        lambda _sid, _uid: {"id": _sid, "status": "completed"},
    )
    monkeypatch.setattr(
        compare_module,
        "run_comparison",
        lambda *_args, **_kwargs: {"overall_trend": "stable"},
    )

    response = client.post("/api/compare-sessions/a/b")
    assert response.status_code == 200
    payload = response.json()
    assert payload["success"] is True
    assert payload["data"]["overall_trend"] == "stable"


def test_fetch_session_analysis(monkeypatch):
    client = setup_client()

    from app.api import session_analysis as analysis_module

    monkeypatch.setattr(
        analysis_module,
        "get_session",
        lambda _sid, _uid: {"id": "session-1", "status": "completed"},
    )
    monkeypatch.setattr(
        analysis_module,
        "get_session_analysis",
        lambda *_args, **_kwargs: {
            "session_id": "session-1",
            "overall_change_score": 0.1,
            "per_angle": [],
        },
    )

    response = client.get("/api/sessions/session-1/analysis")
    assert response.status_code == 200
    payload = response.json()
    assert payload["success"] is True
