#!/usr/bin/env python3
"""
Quick check: List images in database and in storage for the session.
Set env vars before running:
  $env:SUPABASE_URL='...'
  $env:SERVICE_ROLE_KEY='...'
  python check_storage.py
"""

import os
import sys
from supabase import create_client

USER_ID = "40470094-88e9-438b-b379-bbfb56828284"
SESSION_ID = "5839fb9a-0569-4f09-b4b7-c407dfcba3fe"

# Get credentials
supabase_url = os.getenv("SUPABASE_URL")
service_role_key = os.getenv("SERVICE_ROLE_KEY")

if not supabase_url or not service_role_key:
    print("\n❌ Missing environment variables!")
    print("\nSet them in PowerShell:")
    print('  $env:SUPABASE_URL = "https://vtpgeaqhkbbpvaigxwgq.supabase.co"')
    print('  $env:SERVICE_ROLE_KEY = "<your-service-role-key>"')
    print("\nThen run: python check_storage.py\n")
    sys.exit(1)

supabase = create_client(supabase_url, service_role_key)

print(f"\n{'='*80}")
print("IMAGE STORAGE & DATABASE CHECK")
print(f"{'='*80}\n")

# 1. Check database
print("[1] Images in DATABASE:")
try:
    response = supabase.table("images").select(
        "*").eq("session_id", SESSION_ID).execute()
    db_images = response.data or []

    if not db_images:
        print("  ❌ No image records found!")
    else:
        print(f"  ✓ Found {len(db_images)} records:\n")
        for img in db_images:
            print(f"    Type: {img.get('image_type')}")
            print(f"    Path: {img.get('storage_path')}")
            print()
except Exception as e:
    print(f"  ❌ Error: {e}\n")
    db_images = []

# 2. Check Supabase Storage
print("[2] Files in STORAGE:")
try:
    storage_path = f"{USER_ID}/{SESSION_ID}/"
    response = supabase.storage.from_("bcd-images").list(storage_path)

    if not response:
        print(f"  ❌ No files in bcd-images/{storage_path}")
        print(f"\n  Storage structure might be different.")
        print(f"  Try listing parent directory...\n")

        # Try parent
        try:
            parent_response = supabase.storage.from_(
                "bcd-images").list(f"{USER_ID}/")
            if parent_response:
                print(f"  Files under bcd-images/{USER_ID}/:")
                for item in parent_response:
                    print(f"    {item}")
        except:
            pass
    else:
        print(f"  ✓ Found {len(response)} files:")
        for file in response:
            if isinstance(file, dict):
                filename = file.get('name', '')
                if filename:
                    print(f"    - {filename}")
            else:
                print(f"    - {file}")

except Exception as e:
    print(f"  ❌ Error: {e}\n")

print(f"\n{'='*80}\n")
