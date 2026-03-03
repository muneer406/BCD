"""
BCD Dataset Export Script (Phase 7B)
=====================================
Exports all captured images and associated metadata to a local directory
structured for use in future contrastive training or analysis.

Usage:
    python scripts/dataset_export.py [--out-dir dataset] [--user-filter USER_ID]

Output structure:
    dataset/
        manifest.csv                    ← all rows in flat CSV
        <user_id>/
            <session_id>/
                <original_filename>     ← downloaded image from bucket
                metadata.json           ← session + angle metadata

CSV columns:
    user_id, session_id, angle_type, image_path, embedding, timestamp,
    quality_score

Requirements:
    pip install supabase python-dotenv

Set env vars before running:
    SUPABASE_URL=...
    SUPABASE_SERVICE_ROLE_KEY=...

Or put them in backend/.env and run from the backend directory.
"""

import argparse
import csv
import json
import os
import sys
from collections import defaultdict, deque
from pathlib import Path

# Allow running from either the project root or the backend directory.
# Try loading .env from backend/ if it exists.
_base = Path(__file__).resolve().parent.parent
_env_path = _base / ".env"
if _env_path.exists():
    from dotenv import load_dotenv
    load_dotenv(_env_path)

from supabase import create_client  # noqa: E402


# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
STORAGE_BUCKET = "bcd-images"


def _require_env() -> None:
    missing = [k for k, v in [
        ("SUPABASE_URL", SUPABASE_URL),
        ("SUPABASE_SERVICE_ROLE_KEY", SUPABASE_KEY),
    ] if not v]
    if missing:
        print(
            f"ERROR: Missing env vars: {', '.join(missing)}", file=sys.stderr)
        sys.exit(1)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _load_all_images(supabase, user_filter: str | None) -> list[dict]:
    """Fetch all rows from the images table (or filtered by user), paginated."""
    all_rows: list[dict] = []
    page_size = 1000
    start = 0

    while True:
        query = supabase.table("images").select(
            "id, session_id, user_id, image_type, storage_path, created_at"
        )
        if user_filter:
            query = query.eq("user_id", user_filter)
        page = query.range(start, start + page_size - 1).execute().data or []
        all_rows.extend(page)
        if len(page) < page_size:
            break
        start += page_size

    return all_rows


def _load_all_bucket_objects(supabase, user_filter: str | None) -> list[dict]:
    """Fetch all objects from the bucket using Storage API (recursive, paginated)."""
    storage = supabase.storage.from_(STORAGE_BUCKET)
    all_rows: list[dict] = []
    page_size = 1000

    to_scan = deque([""])

    while to_scan:
        prefix = to_scan.popleft()
        offset = 0

        while True:
            options = {
                "limit": page_size,
                "offset": offset,
                "sortBy": {"column": "name", "order": "asc"},
            }

            response = storage.list(prefix, options)
            page = response.data if hasattr(response, "data") else response
            page = page or []

            if not isinstance(page, list):
                page = []

            for item in page:
                name = item.get("name")
                if not name:
                    continue

                full_path = f"{prefix}/{name}" if prefix else name
                is_folder = item.get("id") is None or item.get(
                    "type") == "folder"

                if is_folder:
                    to_scan.append(full_path)
                    continue

                if user_filter and not full_path.startswith(f"{user_filter}/"):
                    continue

                all_rows.append({
                    "name": full_path,
                    "created_at": item.get("created_at"),
                })

            if len(page) < page_size:
                break
            offset += page_size

    all_rows.sort(key=lambda x: x.get("name") or "")
    return all_rows


def _infer_from_storage_path(storage_path: str) -> dict[str, str | None]:
    """Infer user/session/angle metadata from storage path."""
    p = Path(storage_path)
    parts = p.parts

    user_id = parts[0] if len(parts) >= 1 else None
    session_id = parts[1] if len(parts) >= 2 else None

    filename = p.name
    stem = p.stem
    angle_type = stem.split("_", 1)[0] if "_" in stem else stem

    return {
        "user_id": user_id,
        "session_id": session_id,
        "angle_type": angle_type,
        "filename": filename,
    }


def _is_supported_image(storage_path: str) -> bool:
    ext = Path(storage_path).suffix.lower()
    return ext in {".jpg", ".jpeg", ".png", ".webp"}


def _load_angle_analysis(supabase, session_id: str) -> dict[str, float]:
    """Return {angle_type: angle_quality_score} for a session."""
    result = (
        supabase.table("angle_analysis")
        .select("angle_type, angle_quality_score")
        .eq("session_id", session_id)
        .execute()
    )
    return {
        row["angle_type"]: row.get("angle_quality_score")
        for row in (result.data or [])
    }


def _load_angle_embedding(supabase, session_id: str, angle_type: str) -> list | None:
    """Return the raw embedding list for a specific angle, or None."""
    result = (
        supabase.table("angle_embeddings")
        .select("embedding")
        .eq("session_id", session_id)
        .eq("angle_type", angle_type)
        .limit(1)
        .execute()
    )
    rows = result.data or []
    if not rows or not rows[0].get("embedding"):
        return None
    raw = rows[0]["embedding"]
    if isinstance(raw, str):
        raw = json.loads(raw)
    return raw


def _download_image(supabase, storage_path: str) -> bytes | None:
    """Download an image from Supabase Storage. Returns None on failure."""
    try:
        return supabase.storage.from_(STORAGE_BUCKET).download(storage_path)
    except Exception as exc:
        print(f"  WARNING: download failed for {storage_path}: {exc}")
        return None


# ---------------------------------------------------------------------------
# Main export
# ---------------------------------------------------------------------------

def export(out_dir: str, user_filter: str | None = None) -> None:
    _require_env()
    supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

    out_path = Path(out_dir)
    out_path.mkdir(parents=True, exist_ok=True)

    print(
        f"Fetching bucket object list{f' for user {user_filter}' if user_filter else ''}...")
    bucket_objects = _load_all_bucket_objects(supabase, user_filter)
    print(f"Found {len(bucket_objects)} objects in bucket metadata.")

    if not bucket_objects:
        print("Nothing to export from bucket.")
        return

    print("Fetching image rows from DB for metadata enrichment...")
    image_rows = _load_all_images(supabase, user_filter)
    print(f"Found {len(image_rows)} image rows in DB.")

    images_by_path: dict[str, dict] = {
        row["storage_path"]: row
        for row in image_rows
        if row.get("storage_path")
    }

    # Cache quality scores per session to avoid duplicate queries
    _quality_cache: dict[str, dict[str, float]] = {}
    # Cache embeddings per (session_id, angle_type)
    _emb_cache: dict[tuple[str, str], list | None] = {}

    manifest_rows: list[dict] = []
    session_metadata: dict[str, list[dict]] = defaultdict(list)

    total = len(bucket_objects)
    for i, obj in enumerate(bucket_objects, 1):
        storage_path = obj.get("name")
        if not storage_path:
            continue

        if not _is_supported_image(storage_path):
            print(f"[{i}/{total}] skipping non-image object: {storage_path}")
            continue

        image_row = images_by_path.get(storage_path)
        inferred = _infer_from_storage_path(storage_path)

        user_id = str((image_row or {}).get("user_id")
                      or inferred["user_id"] or "")
        session_id = str((image_row or {}).get("session_id")
                         or inferred["session_id"] or "")
        angle_type = str((image_row or {}).get("image_type")
                         or inferred["angle_type"] or "unknown")
        created_at = (image_row or {}).get(
            "created_at") or obj.get("created_at")

        if not user_id or not session_id:
            print(f"[{i}/{total}] skipping unparsable path: {storage_path}")
            continue

        print(f"[{i}/{total}] {user_id[:8]}… / {session_id[:8]}… / {angle_type}")

        # Quality score
        if session_id not in _quality_cache:
            _quality_cache[session_id] = _load_angle_analysis(
                supabase, session_id)
        quality_score = _quality_cache[session_id].get(angle_type)

        # Embedding
        emb_key = (session_id, angle_type)
        if emb_key not in _emb_cache:
            _emb_cache[emb_key] = _load_angle_embedding(
                supabase, session_id, angle_type)
        embedding = _emb_cache[emb_key]

        # Download image
        image_bytes = _download_image(supabase, storage_path)

        # Write image to disk
        session_dir = out_path / user_id / session_id
        session_dir.mkdir(parents=True, exist_ok=True)
        local_filename = str(inferred["filename"] or f"{angle_type}.jpg")
        local_path_rel = str(Path(user_id) / session_id / local_filename)

        if image_bytes:
            (session_dir / local_filename).write_bytes(image_bytes)
        else:
            local_path_rel = ""  # mark as failed

        # Accumulate session metadata
        angle_meta = {
            "angle_type": angle_type,
            "storage_path": storage_path,
            "created_at": created_at,
            "quality_score": quality_score,
            "has_embedding": embedding is not None,
        }
        session_metadata[f"{user_id}/{session_id}"].append(angle_meta)

        # Manifest row (embedding stored as JSON string to keep CSV flat)
        manifest_rows.append({
            "user_id": user_id,
            "session_id": session_id,
            "angle_type": angle_type,
            "image_path": local_path_rel,
            "storage_path": storage_path,
            "timestamp": created_at,
            "quality_score": quality_score,
            "embedding": json.dumps(embedding) if embedding else "",
            "has_db_record": bool(image_row),
        })

    # Write per-session metadata.json
    for key, angles in session_metadata.items():
        user_id, session_id = key.split("/", 1)
        meta_path = out_path / user_id / session_id / "metadata.json"
        meta_path.write_text(json.dumps({
            "user_id": user_id,
            "session_id": session_id,
            "angles": angles,
        }, indent=2))

    # Write manifest CSV
    manifest_path = out_path / "manifest.csv"
    if manifest_rows:
        fieldnames = list(manifest_rows[0].keys())
        with manifest_path.open("w", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames)
            writer.writeheader()
            writer.writerows(manifest_rows)

    # Summary
    success = sum(1 for r in manifest_rows if r["image_path"])
    with_embedding = sum(1 for r in manifest_rows if r["embedding"])
    with_quality = sum(
        1 for r in manifest_rows if r["quality_score"] is not None)
    with_db_record = sum(1 for r in manifest_rows if r["has_db_record"])
    users = len({r["user_id"] for r in manifest_rows})
    sessions = len({r["session_id"] for r in manifest_rows})

    print(f"\n✓ Export complete → {out_path.resolve()}")
    print(f"  {success}/{total} images downloaded")
    print(f"  {with_embedding}/{total} rows have embeddings")
    print(f"  {with_quality}/{total} rows have quality scores")
    print(f"  {with_db_record}/{total} rows linked to DB image records")
    print(f"  {users} unique users, {sessions} unique sessions")
    print(f"  manifest → {manifest_path}")

    # Dataset progress toward target
    TARGET_IMAGES = 1200
    progress = success / TARGET_IMAGES * 100
    print(
        f"\n  Target: {TARGET_IMAGES} images — progress: {progress:.1f}% ({success}/{TARGET_IMAGES})")


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Export BCD dataset to disk")
    parser.add_argument(
        "--out-dir", default="dataset",
        help="Output directory (default: ./dataset)"
    )
    parser.add_argument(
        "--user-filter", default=None,
        help="Export only images for this user UUID"
    )
    args = parser.parse_args()
    export(args.out_dir, args.user_filter)
