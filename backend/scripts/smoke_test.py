"""
Phase 7 smoke test — runs against the local server (http://localhost:8000).
Uses real Supabase credentials from .env to obtain a fresh access token.

Usage (from backend/):
    .venv\Scripts\python.exe scripts/smoke_test.py
"""
import json
import os
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

# ── Load .env ───────────────────────────────────────────────────────────────
_env = Path(__file__).resolve().parent.parent / ".env"
if _env.exists():
    for line in _env.read_text().splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, _, v = line.partition("=")
            os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))

BASE = "http://localhost:8000"
PASS, FAIL = 0, 0


def _req(method: str, path: str, token: str | None = None) -> dict:
    url = BASE + path
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(url, method=method, headers=headers)
    with urllib.request.urlopen(req, timeout=180) as resp:
        return json.loads(resp.read())


def check(label: str, cond: bool, detail: str = "") -> None:
    global PASS, FAIL
    if cond:
        PASS += 1
        print(f"  [PASS] {label}")
    else:
        FAIL += 1
        print(f"  [FAIL] {label}" + (f" — {detail}" if detail else ""))


# ── 1. Health checks ────────────────────────────────────────────────────────
print("\n=== 1. Health endpoints ===")
try:
    r1 = _req("GET", "/")
    check("GET /  → {status: ok}", r1.get("status") == "ok")
except Exception as e:
    check("GET /  reachable", False, str(e))

try:
    r2 = _req("GET", "/health")
    check("GET /health  → {status: ok}", r2.get("status") == "ok")
except Exception as e:
    check("GET /health  reachable", False, str(e))

# ── 2. Auth — get token + recent session ───────────────────────────────────
print("\n=== 2. Auth ===")
TOKEN = None
SESSION_ID = None

try:
    from supabase import create_client  # type: ignore
    sb = create_client(
        os.environ["SUPABASE_URL"],
        os.environ["SUPABASE_SERVICE_ROLE_KEY"],
    )
    EMAIL = os.environ.get("TEST_EMAIL", "test1@dev.com")
    PASSWORD = os.environ.get("TEST_PASSWORD", "test@123")
    res = sb.auth.sign_in_with_password({"email": EMAIL, "password": PASSWORD})
    TOKEN = res.session.access_token
    USER_ID = res.user.id
    check("sign_in_with_password succeeds", bool(TOKEN))
    print(f"  user_id: {USER_ID}")
    print(f"  token:   {TOKEN[:40]}...")

    sessions = (
        sb.table("sessions")
        .select("id, created_at, status")
        .eq("user_id", USER_ID)
        .order("created_at", desc=True)
        .limit(3)
        .execute()
    )
    if sessions.data:
        for s in sessions.data:
            print(
                f"  session: {s['id']}  status={s['status']}  {s['created_at'][:19]}")
        SESSION_ID = sessions.data[0]["id"]
    check("at least one session found", bool(SESSION_ID))
except Exception as e:
    check("auth + session lookup", False, str(e))

# ── 3. analyze-session (force=true) ────────────────────────────────────────
if TOKEN and SESSION_ID:
    print(f"\n=== 3. POST /api/analyze-session/{SESSION_ID}?force=true ===")
    print("  (ML pipeline — may take 10–60 s on first run...)")
    try:
        t0 = time.time()
        r = _req(
            "POST", f"/api/analyze-session/{SESSION_ID}?force=true", TOKEN)
        elapsed = time.time() - t0
        check("success == true", r.get("success") is True)
        d = r.get("data", {})
        check("from_cache == false (forced fresh run)",
              d.get("from_cache") is False)

        scores = d.get("scores", {})
        print(f"\n  --- scores (elapsed {elapsed:.1f}s) ---")
        for k, v in scores.items():
            print(f"    {k}: {v}")

        check("change_score present",       "change_score" in scores)
        check("angle_aware_score present",  "angle_aware_score" in scores)
        check("angle_aware_variation_level present",
              "angle_aware_variation_level" in scores)
        check("analysis_version == 'v0.7'", scores.get("analysis_version") == "v0.7",
              f"got: {scores.get('analysis_version')}")
        check("analysis_confidence_score present",
              "analysis_confidence_score" in scores)
        check("session_quality_score present",
              "session_quality_score" in scores)
        check("processing_time_ms present", "processing_time_ms" in d)
        check("image_quality_summary present", "image_quality_summary" in d)
        check("per_angle present", bool(
            d.get("session_analysis", {}).get("per_angle")))

        # Critical logic fix: angle_aware_score should be > 0 for non-first sessions
        is_first = d.get("is_first_session", False)
        print(f"\n  is_first_session: {is_first}")
        if not is_first:
            aa = scores.get("angle_aware_score", 0)
            cs = scores.get("change_score", 0)
            check("angle_aware_score is a float (not None)",
                  isinstance(aa, (int, float)))
            print(f"  structural (change_score):  {cs:.4f}")
            print(f"  angle-aware:                {aa:.4f}")
            if cs < 0.01 and aa > 0.1:
                print("  *** MISMATCH DETECTED: structural ~0 but angle-aware high — "
                      "angle_aware_score is correctly exposing variation that overall_score hid ***")

    except urllib.error.HTTPError as e:
        body = e.read().decode()
        check("analyze-session HTTP success",
              False, f"HTTP {e.code}: {body[:200]}")
    except Exception as e:
        check("analyze-session", False, str(e))

    # ── 4. Cache hit check ──────────────────────────────────────────────────
    print(f"\n=== 4. POST /api/analyze-session/{SESSION_ID} (cache hit) ===")
    try:
        r2 = _req("POST", f"/api/analyze-session/{SESSION_ID}", TOKEN)
        check("success == true", r2.get("success") is True)
        check("from_cache == true", r2.get(
            "data", {}).get("from_cache") is True)
        scores2 = r2.get("data", {}).get("scores", {})
        check("cache hit returns analysis_version",
              "analysis_version" in scores2)
        check("cache hit returns angle_aware_score",
              "angle_aware_score" in scores2)
    except Exception as e:
        check("cache hit check", False, str(e))

    # ── 5. analysis_logs DB check ───────────────────────────────────────────
    print("\n=== 5. Supabase DB — analysis_logs ===")
    # First check row exists (base columns only — these exist from PHASE5)
    try:
        logs = (
            sb.table("analysis_logs")
            .select("id, session_id, status, processing_time_ms, created_at")
            .eq("session_id", SESSION_ID)
            .order("created_at", desc=True)
            .limit(1)
            .execute()
        )
        check("analysis_logs row written", bool(logs.data))
        if logs.data:
            row = logs.data[0]
            print(f"  status={row.get('status')}  "
                  f"time={row.get('processing_time_ms')}ms  "
                  f"at={str(row.get('created_at', ''))[:19]}")
            check("status == completed",       row.get("status") == "completed")
            check("processing_time_ms is set", row.get(
                "processing_time_ms") is not None)
    except Exception as e:
        check("analysis_logs query", False, str(e))

    # Check confidence_score separately — requires PHASE7_MIGRATION.sql
    try:
        logs7 = (
            sb.table("analysis_logs")
            .select("confidence_score")
            .eq("session_id", SESSION_ID)
            .order("created_at", desc=True)
            .limit(1)
            .execute()
        )
        if logs7.data:
            cs = logs7.data[0].get("confidence_score")
            check("confidence_score stored (PHASE7 col)", cs is not None,
                  "None — run PHASE7_MIGRATION.sql in Supabase SQL Editor")
            print(f"  confidence_score: {cs}")
        else:
            check("confidence_score col query returned row", False,
                  "No row — run PHASE7_MIGRATION.sql")
    except Exception as e:
        check("confidence_score column exists (PHASE7)", False,
              f"Column missing — run PHASE7_MIGRATION.sql: {e}")

    # ── 6. session_analysis DB — Phase 7 columns ───────────────────────────
    print("\n=== 6. Supabase DB — session_analysis Phase 7 columns ===")
    try:
        sa = (
            sb.table("session_analysis")
            .select("session_id, overall_change_score, angle_aware_score, analysis_version")
            .eq("session_id", SESSION_ID)
            .limit(1)
            .execute()
        )
        check("session_analysis row found", bool(sa.data))
        if sa.data:
            row = sa.data[0]
            print(f"  overall_change_score: {row.get('overall_change_score')}")
            print(f"  angle_aware_score:    {row.get('angle_aware_score')}")
            print(f"  analysis_version:     {row.get('analysis_version')}")
            check("angle_aware_score stored", row.get(
                "angle_aware_score") is not None)
            check("analysis_version == v0.7", row.get("analysis_version") == "v0.7",
                  f"got: {row.get('analysis_version')} — run PHASE7_MIGRATION.sql if None")
    except Exception as e:
        check("session_analysis query", False, str(e))

else:
    print("\n  Skipping API + DB checks (no token/session).")

# ── Summary ─────────────────────────────────────────────────────────────────
total = PASS + FAIL
print(f"\n{'='*50}")
print(f"  {PASS}/{total} checks passed  |  {FAIL} failed")
print(f"{'='*50}")
if FAIL:
    sys.exit(1)
