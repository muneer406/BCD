"""
BCD Migration Runner — apply pending SQL migrations in order.

Usage:
    python scripts/run_migrations.py

This script:
1. Ensures a schema_migrations tracking table exists in Supabase
2. Finds all PHASE*.sql and SUPABASE_MIGRATIONS.sql files in backend/
3. Prints pending migrations with their SQL content for manual execution

Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env
"""

import os
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from dotenv import load_dotenv
from supabase import create_client

load_dotenv()

MIGRATIONS_DIR = Path(__file__).resolve().parent.parent
MIGRATION_GLOB = "*.sql"
IGNORED = {"SUPABASE_MIGRATIONS.sql"}  # Applied manually as the initial schema


def get_supabase():
    url = os.getenv("SUPABASE_URL", "")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
    if not url or not key:
        print("ERROR: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set")
        sys.exit(1)
    return create_client(url, key)


def get_tracking_sql():
    """Return the SQL to create the migration tracking table."""
    return """
CREATE TABLE IF NOT EXISTS public.schema_migrations (
    id          SERIAL PRIMARY KEY,
    filename    TEXT NOT NULL UNIQUE,
    applied_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    checksum    TEXT
);
"""


def get_migrations(dir_path: Path):
    """Return sorted list of migration files, excluding ignored ones."""
    files = []
    for f in sorted(dir_path.iterdir()):
        if f.is_file() and f.suffix == ".sql" and f.name not in IGNORED and not f.name.startswith("."):
            files.append(f)
    return files


def get_applied(supabase):
    try:
        result = supabase.table("schema_migrations").select("filename").execute()
        return {row["filename"] for row in (result.data or [])}
    except Exception:
        return set()


def main():
    sb = get_supabase()
    applied = get_applied(sb)
    migrations = get_migrations(MIGRATIONS_DIR)

    if not applied:
        # First run: create tracking table
        print("=" * 60)
        print("STEP 0: Create migration tracking table")
        print("=" * 60)
        print("Run this in Supabase SQL Editor:")
        print(get_tracking_sql())
        print()

    # Check for pending migrations
    pending = [m for m in migrations if m.name not in applied]
    if not pending:
        print(f"All {len(migrations)} migration(s) applied. Schema is up to date.")
        return

    print(f"Found {len(pending)} pending migration(s):")

    for m in pending:
        content = m.read_text()
        print()
        print("=" * 60)
        print(f"PENDING: {m.name}")
        print(f"Run this in Supabase SQL Editor:")
        print("=" * 60)
        print(content)
        print()

    print("After running each migration, mark it as applied with:")
    print(f"  python scripts/run_migrations.py --mark-applied")


def mark_applied():
    sb = get_supabase()
    applied = get_applied(sb)
    for m in get_migrations(MIGRATIONS_DIR):
        if m.name not in applied:
            sb.table("schema_migrations").insert({"filename": m.name}).execute()
            print(f"  Marked {m.name} as applied")


if __name__ == "__main__":
    if "--mark-applied" in sys.argv:
        mark_applied()
    else:
        main()
