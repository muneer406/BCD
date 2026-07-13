"""
BCD Migration Runner — apply pending SQL migrations against Supabase.

Usage:
    python scripts/run_migrations.py

This script:
1. Ensures a schema_migrations tracking table exists in Supabase
2. Finds all PHASE*.sql and SUPABASE_MIGRATIONS.sql files in backend/
3. Executes pending migrations using the Supabase Management API when possible,
   or psql when a direct connection string is available,
   or prints clear copy-paste instructions for the Supabase SQL Editor.

Environment variables:
    SUPABASE_URL                         Supabase project URL (required)
    SUPABASE_SERVICE_ROLE_KEY            Supabase service role key (required)
    SUPABASE_ACCESS_TOKEN                Supabase Management API token (optional)
    SUPABASE_DB_CONNECTION               Postgres connection string, e.g.:
                                         postgresql://postgres:[PASSWORD]@db.[PROJECT].supabase.co:5432/postgres
                                         (optional)
"""

from __future__ import annotations

import hashlib
import os
import re
import subprocess
import sys
import webbrowser
from pathlib import Path
from typing import Iterable

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import requests
from dotenv import load_dotenv

from app.config import get_settings
from app.services.db import get_supabase_client

load_dotenv()

MIGRATIONS_DIR = Path(__file__).resolve().parent.parent
MIGRATION_GLOB = "*.sql"
IGNORED = {"SUPABASE_MIGRATIONS.sql"}  # Applied manually as the initial schema

REQUIRED_ENVS = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]


def _check_required_envs() -> None:
    missing = [name for name in REQUIRED_ENVS if not os.getenv(name)]
    if missing:
        print(f"ERROR: missing required environment variables: {', '.join(missing)}")
        sys.exit(1)


def _split_sql_statements(sql: str) -> list[str]:
    """
    Split SQL into individual statements by semicolons, ignoring semicolons
    inside dollar-quoted strings (e.g. DO $$ ... $$).
    """
    statements: list[str] = []
    current: list[str] = []
    in_dollar_quote = False
    dollar_tag: str | None = None
    i = 0
    chars = list(sql)

    while i < len(chars):
        char = chars[i]

        if char == "$":
            # Look ahead for a dollar tag: $tag$ or $$
            end = i + 1
            while end < len(chars) and (chars[end].isalnum() or chars[end] == "_"):
                end += 1
            if end < len(chars) and chars[end] == "$":
                tag = "".join(chars[i + 1 : end])
                if not in_dollar_quote:
                    in_dollar_quote = True
                    dollar_tag = tag
                    current.extend(chars[i : end + 1])
                    i = end + 1
                    continue
                elif tag == dollar_tag:
                    in_dollar_quote = False
                    dollar_tag = None
                    current.extend(chars[i : end + 1])
                    i = end + 1
                    continue

        if char == ";" and not in_dollar_quote:
            current.append(char)
            statement = "".join(current).strip()
            if statement and not statement.startswith("--"):
                statements.append(statement)
            current = []
            i += 1
            continue

        current.append(char)
        i += 1

    # Capture any trailing statement without a semicolon
    trailing = "".join(current).strip()
    if trailing and not trailing.startswith("--"):
        statements.append(trailing)

    return [s for s in statements if s]


def _file_checksum(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()[:16]


def get_tracking_sql() -> str:
    """Return the SQL to create the migration tracking table."""
    return """
CREATE TABLE IF NOT EXISTS public.schema_migrations (
    id          SERIAL PRIMARY KEY,
    filename    TEXT NOT NULL UNIQUE,
    applied_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    checksum    TEXT
);
"""


def get_migrations(dir_path: Path) -> list[Path]:
    """Return sorted list of migration files, excluding ignored ones."""
    files = []
    for f in sorted(dir_path.iterdir()):
        if f.is_file() and f.suffix == ".sql" and f.name not in IGNORED and not f.name.startswith("."):
            files.append(f)
    return files


def get_applied() -> set[str]:
    try:
        result = get_supabase_client().table("schema_migrations").select("filename").execute()
        return {row["filename"] for row in (result.data or [])}
    except Exception as exc:
        print(f"  Warning: could not read schema_migrations table: {exc}")
        return set()


def _record_applied(filename: str, checksum: str) -> None:
    get_supabase_client().table("schema_migrations").insert(
        {"filename": filename, "checksum": checksum}
    ).execute()


def _management_api_headers() -> dict[str, str]:
    token = os.getenv("SUPABASE_ACCESS_TOKEN", "")
    if not token:
        return {}
    return {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }


def _project_ref() -> str:
    """Extract project ref from SUPABASE_URL, e.g. https://xxx.supabase.co -> xxx."""
    url = os.getenv("SUPABASE_URL", "")
    match = re.search(r"https?://([^.]+)", url)
    if not match:
        raise ValueError(f"Cannot extract project ref from SUPABASE_URL: {url}")
    return match.group(1)


def execute_via_management_api(sql: str) -> tuple[bool, str]:
    """
    Execute SQL using the Supabase Management API /database/query endpoint.
    Returns (success, message_or_output).
    """
    token = os.getenv("SUPABASE_ACCESS_TOKEN", "")
    if not token:
        return False, "SUPABASE_ACCESS_TOKEN not set"

    ref = _project_ref()
    url = f"https://api.supabase.com/v1/projects/{ref}/database/query"
    payload = {"query": sql}

    try:
        response = requests.post(url, headers=_management_api_headers(), json=payload, timeout=60)
        if response.status_code < 300:
            return True, response.text or "OK"
        return False, f"HTTP {response.status_code}: {response.text}"
    except Exception as exc:
        return False, str(exc)


def execute_via_psql(path: Path) -> tuple[bool, str]:
    """Execute an SQL file via psql using a direct Postgres connection string."""
    conn_string = os.getenv("SUPABASE_DB_CONNECTION", "")
    if not conn_string:
        return False, "SUPABASE_DB_CONNECTION not set"

    try:
        result = subprocess.run(
            ["psql", conn_string, "-v", "ON_ERROR_STOP=1", "-f", str(path)],
            capture_output=True,
            text=True,
            timeout=120,
        )
        output = (result.stdout or "") + (result.stderr or "")
        return result.returncode == 0, output
    except FileNotFoundError:
        return False, "psql executable not found in PATH"
    except Exception as exc:
        return False, str(exc)


def _open_dashboard_sql_editor() -> None:
    """Open the Supabase Dashboard SQL Editor in the default browser."""
    url = os.getenv("SUPABASE_URL", "")
    match = re.search(r"https?://([^.]+)", url)
    if match:
        dashboard_url = f"https://supabase.com/dashboard/project/{match.group(1)}/sql"
        try:
            webbrowser.open(dashboard_url)
        except Exception:
            print(f"  Open: {dashboard_url}")


def execute_migration(path: Path) -> tuple[bool, str]:
    """
    Attempt to execute a migration file. Tries, in order:
    1. Supabase Management API (if SUPABASE_ACCESS_TOKEN is set)
    2. psql (if SUPABASE_DB_CONNECTION is set)
    3. Fallback: print instructions
    """
    sql = path.read_text()

    # Prefer the Management API because it doesn't require a network route to Postgres.
    token = os.getenv("SUPABASE_ACCESS_TOKEN", "")
    if token:
        return execute_via_management_api(sql)

    conn_string = os.getenv("SUPABASE_DB_CONNECTION", "")
    if conn_string:
        return execute_via_psql(path)

    return False, "No automatic execution method available"


def _print_manual_instructions(path: Path) -> None:
    content = path.read_text()
    print()
    print("=" * 60)
    print(f"MANUAL EXECUTION REQUIRED: {path.name}")
    print("=" * 60)
    print("Copy and run the following SQL in Supabase Dashboard > SQL Editor:")
    print("-" * 60)
    print(content)
    print("-" * 60)
    _open_dashboard_sql_editor()


def ensure_tracking_table() -> None:
    """Create the schema_migrations table using the best available method."""
    print("Ensuring schema_migrations tracking table exists...")
    success, output = execute_migration(Path(__file__).resolve().parent / "_tracking.sql")
    if success:
        print("  Tracking table is ready.")
        return

    # Fallback: try Management API one statement at a time, then psql, then manual.
    sql = get_tracking_sql()
    token = os.getenv("SUPABASE_ACCESS_TOKEN", "")
    conn_string = os.getenv("SUPABASE_DB_CONNECTION", "")

    if token:
        for statement in _split_sql_statements(sql):
            ok, msg = execute_via_management_api(statement)
            if not ok:
                print(f"  Failed to create tracking table via Management API: {msg}")
                break
        else:
            print("  Tracking table created via Management API.")
            return

    if conn_string:
        tmp_path = Path(__file__).resolve().parent / "_tracking.sql"
        tmp_path.write_text(sql)
        try:
            ok, msg = execute_via_psql(tmp_path)
            if ok:
                print("  Tracking table created via psql.")
                return
            print(f"  Failed to create tracking table via psql: {msg}")
        finally:
            tmp_path.unlink(missing_ok=True)

    print()
    print("=" * 60)
    print("MANUAL STEP 0: Create schema_migrations table")
    print("=" * 60)
    print(sql)
    _open_dashboard_sql_editor()


def main() -> int:
    _check_required_envs()

    applied = get_applied()
    if not applied:
        ensure_tracking_table()
        applied = get_applied()

    migrations = get_migrations(MIGRATIONS_DIR)
    pending = [m for m in migrations if m.name not in applied]

    if not pending:
        print(f"All {len(migrations)} migration(s) applied. Schema is up to date.")
        return 0

    print(f"Found {len(pending)} pending migration(s).")
    exit_code = 0

    for path in pending:
        print()
        print("=" * 60)
        print(f"Applying: {path.name}")
        print("=" * 60)

        success, output = execute_migration(path)
        if success:
            _record_applied(path.name, _file_checksum(path))
            print(f"  SUCCESS: {path.name}")
            if output:
                print(output)
        else:
            print(f"  FAILED: {path.name}")
            print(f"  Reason: {output}")
            _print_manual_instructions(path)
            exit_code = 1
            break

    return exit_code


def mark_applied() -> None:
    _check_required_envs()
    applied = get_applied()
    for path in get_migrations(MIGRATIONS_DIR):
        if path.name not in applied:
            get_supabase_client().table("schema_migrations").insert(
                {"filename": path.name, "checksum": _file_checksum(path)}
            ).execute()
            print(f"  Marked {path.name} as applied")


if __name__ == "__main__":
    if "--mark-applied" in sys.argv:
        mark_applied()
    else:
        sys.exit(main())
