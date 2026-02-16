#!/usr/bin/env python3
"""
Fix storage_path values in images table by querying actual Supabase Storage files.

This script:
1. Lists all files in bcd-images bucket for the specified session
2. Updates the images table with correct storage_path values
3. Verifies the update was successful
"""

import sys
import os
from pathlib import Path
from supabase import create_client
import re


def fix_storage_paths(user_id: str, session_id: str, dry_run: bool = False):
    """
    Fix storage paths for a session by querying actual Supabase Storage files.

    Args:
        user_id: User UUID
        session_id: Session UUID
        dry_run: If True, show what would be changed without making changes
    """
    # Get from environment
    supabase_url = os.getenv("SUPABASE_URL")
    service_role_key = os.getenv("SERVICE_ROLE_KEY")

    if not supabase_url or not service_role_key:
        print("❌ Missing environment variables:")
        print(f"   SUPABASE_URL: {supabase_url}")
        print(
            f"   SERVICE_ROLE_KEY: {'<set>' if service_role_key else '<not set>'}")
        return False

    supabase = create_client(supabase_url, service_role_key)

    print(f"\n{'='*80}")
    print(f"Fixing storage paths for session: {session_id}")
    print(f"User: {user_id}")
    print(f"{'='*80}\n")

    # Step 1: Get all image records for this session from database
    print("[1/4] Fetching image records from database...")
    response = supabase.table("images").select(
        "*").eq("session_id", session_id).execute()
    db_images = response.data if response.data else []

    if not db_images:
        print(f"  ❌ No image records found for session {session_id}")
        return False

    print(f"  ✓ Found {len(db_images)} image records")
    for img in db_images:
        print(
            f"    - {img['image_type']}: {img.get('storage_path', 'NO PATH')}")

    # Step 2: List files in Supabase Storage for this session
    print(f"\n[2/4] Listing files in Supabase Storage...")
    storage_path = f"{user_id}/{session_id}/"

    try:
        response = supabase.storage.from_("bcd-images").list(storage_path)
        storage_files = response if isinstance(response, list) else []
    except Exception as e:
        print(f"  ❌ Error listing storage: {e}")
        storage_files = []

    if not storage_files:
        print(f"  ❌ No files found in bcd-images/{storage_path}")
        print("  Possible issues:")
        print(f"    1. Path '{storage_path}' doesn't exist in storage")
        print(f"    2. Bucket permissions issue")
        print(f"    3. Files in different path structure")
        return False

    print(f"  ✓ Found {len(storage_files)} files in storage:")
    for file in storage_files:
        if isinstance(file, dict):
            filename = file.get('name', '')
        else:
            filename = str(file)
        if filename:  # Skip empty entries
            print(f"    - {filename}")

    # Step 3: Match database records to storage files
    print(f"\n[3/4] Matching database records to storage files...")

    updates = []

    for db_image in db_images:
        angle_type = db_image['image_type']
        image_id = db_image['id']

        # Find matching file(s) for this angle
        angle_files = [
            f['name'] if isinstance(f, dict) else str(f)
            for f in storage_files
            if (isinstance(f, dict) and f.get('name', '').startswith(angle_type + '_'))
            or (isinstance(f, str) and f.startswith(angle_type + '_'))
        ]

        if not angle_files:
            print(f"  ⚠ {angle_type}: No matching files in storage")
            continue

        if len(angle_files) > 1:
            # Multiple files for same angle - use most recent (highest timestamp)
            # Format: angle_TIMESTAMP_suffix.png
            files_with_ts = []
            for filename in angle_files:
                match = re.search(r'_(\d+)_', filename)
                if match:
                    ts = int(match.group(1))
                    files_with_ts.append((ts, filename))

            if files_with_ts:
                files_with_ts.sort(reverse=True)
                selected_file = files_with_ts[0][1]
                print(
                    f"  ℹ {angle_type}: Multiple files found, using latest: {selected_file}")
            else:
                selected_file = angle_files[0]
                print(
                    f"  ℹ {angle_type}: Multiple files found, using: {selected_file}")
        else:
            selected_file = angle_files[0]
            print(f"  ✓ {angle_type}: {selected_file}")

        new_path = f"{storage_path}{selected_file}"
        old_path = db_image.get('storage_path', '')

        if old_path != new_path:
            updates.append({
                'id': image_id,
                'image_type': angle_type,
                'old_path': old_path,
                'new_path': new_path
            })

    if not updates:
        print("\n  ✓ All storage paths already correct!")
        return True

    # Step 4: Apply updates
    print(f"\n[4/4] Updating database with correct paths...")
    print(f"  Total updates: {len(updates)}\n")

    for update in updates:
        print(f"  {update['image_type']}:")
        print(f"    Old: {update['old_path']}")
        print(f"    New: {update['new_path']}")

    if dry_run:
        print(f"\n  [DRY RUN] Would update {len(updates)} records")
        return True

    # Apply updates to database
    print(f"\n  Applying updates...")
    success_count = 0
    for update in updates:
        try:
            supabase.table("images").update({
                "storage_path": update['new_path']
            }).eq("id", update['id']).execute()
            success_count += 1
            print(f"    ✓ {update['image_type']}")
        except Exception as e:
            print(f"    ❌ {update['image_type']}: {e}")

    print(f"\n  ✓ Updated {success_count}/{len(updates)} records")

    # Verify
    print(f"\n[Verify] Checking updated records...")
    response = supabase.table("images").select(
        "*").eq("session_id", session_id).execute()
    updated_images = response.data if response.data else []

    for img in updated_images:
        print(f"  ✓ {img['image_type']}: {img.get('storage_path', 'NO PATH')}")

    print(f"\n{'='*80}")
    print("✓ Storage paths fixed successfully!")
    print("You can now test the analysis endpoint.")
    print(f"{'='*80}\n")

    return True


if __name__ == "__main__":
    # Use the session/user from the test
    USER_ID = "40470094-88e9-438b-b379-bbfb56828284"
    SESSION_ID = "5839fb9a-0569-4f09-b4b7-c407dfcba3fe"

    # Check for command line arguments
    dry_run = "--dry-run" in sys.argv

    if dry_run:
        print("\n[Running in DRY-RUN mode - no changes will be made]\n")

    # Check environment variables first
    if not os.getenv("SUPABASE_URL") or not os.getenv("SERVICE_ROLE_KEY"):
        print("\n" + "="*80)
        print("❌ Environment variables not set!")
        print("="*80)
        print("\nRun this command in PowerShell with vars set:")
        print("$env:SUPABASE_URL='<your-url>'; $env:SERVICE_ROLE_KEY='<your-key>'; python fix_storage_paths.py\n")
        sys.exit(1)

    success = fix_storage_paths(USER_ID, SESSION_ID, dry_run=dry_run)

    if not success:
        print("\n❌ Failed to fix storage paths")
        sys.exit(1)
