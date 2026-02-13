# Supabase Storage Setup Guide for BCD/VAAS

## Overview

BCD stores user-captured images in Supabase Storage. This guide covers bucket creation and RLS policies.

---

## 1. Create Storage Bucket

### Via Dashboard

1. Go to **Storage** in your Supabase dashboard
2. Click **Create a new bucket**
3. Fill in:
   - **Name:** `bcd-images`
   - **Privacy:** `Public` (images are referenced by URL, not downloaded by logged-in users)
   - Click **Create bucket**

### Via SQL (Alternative)

```sql
insert into storage.buckets (id, name, public)
values ('bcd-images', 'bcd-images', true);
```

---

## 2. Storage Path Structure

Images are organized by user and session:

```
bcd-images/
├── {user_id}/
│   ├── {session_id}/
│   │   ├── front.jpg
│   │   ├── left.jpg
│   │   ├── right.jpg
│   │   ├── up.jpg
│   │   ├── down.jpg
│   │   └── raised.jpg
│   └── {session_id}/
│       └── ...
└── {user_id}/
    └── ...
```

---

## 3. Storage Policies (RLS)

Set these policies in Supabase Dashboard > Storage > bcd-images > Policies

### Policy 1: Users can upload to their own folder

**Name:** `allow_upload_own_folder`

- **Target roles:** `authenticated`
- **Operation:** `INSERT`
- **Check:** `(bucket_id = 'bcd-images' AND (auth.uid())::text = (storage.foldername(name))[1])`
- **With check:** `(bucket_id = 'bcd-images' AND (auth.uid())::text = (storage.foldername(name))[1])`

### Policy 2: Users can read their own images

**Name:** `allow_read_own_images`

- **Target roles:** `authenticated`
- **Operation:** `SELECT`
- **Check:** `(bucket_id = 'bcd-images' AND (auth.uid())::text = (storage.foldername(name))[1])`

### Policy 3: Public read access (for viewing shared results)

**Name:** `allow_public_read`

- **Target roles:** `authenticated`
- **Operation:** `SELECT`
- **Check:** `(bucket_id = 'bcd-images')`

---

## 4. Via SQL (Alternative - Batch Apply)

If the dashboard approach doesn't work, use SQL in the SQL Editor:

```sql
-- Create bcd-images bucket if it doesn't exist
insert into storage.buckets (id, name, public)
values ('bcd-images', 'bcd-images', true)
on conflict (id) do nothing;

-- Policy 1: Allow users to upload to their own folder
create policy "allow_upload_own_folder"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'bcd-images'
  AND (auth.uid())::text = (storage.foldername(name))[1]
);

-- Policy 2: Allow users to read their own images
create policy "allow_read_own_images"
on storage.objects for select
to authenticated
using (
  bucket_id = 'bcd-images'
  AND (auth.uid())::text = (storage.foldername(name))[1]
);

-- Policy 3: Allow public read (optional, for view-only links)
create policy "allow_public_read"
on storage.objects for select
to authenticated
using (bucket_id = 'bcd-images');
```

---

## 5. Testing Access

Once set up, test in the Supabase dashboard:

1. **Storage explorer** > **bcd-images**
2. Create a folder matching your user ID (UUID format)
3. Try uploading a test file to `{user_id}/test-session/test.jpg`
4. Verify the file appears and can be accessed

---

## 6. Frontend Integration

The frontend (`src/pages/Review.tsx`) handles uploads like this:

```typescript
const path = `${user.id}/${sessionId}/${image.type}.${ext}`;
const { error: uploadError } = await supabase.storage
  .from("bcd-images")
  .upload(path, image.file, { upsert: true });

const publicUrl = supabase.storage.from("bcd-images").getPublicUrl(path)
  .data.publicUrl;
```

This automatically creates the folder structure and generates public URLs.

---

## 7. Important Notes

- **Public bucket:** Images are publicly readable by URL. This is intentional for performance.
- **RLS policies:** Even though the bucket is public, only authenticated users can upload via the policies.
- **Access control:** User IDs in the path ensure users can only see their own images via the policies.
- **Upsert:** The `upsert: true` option allows retaking images (overwrites old ones).

---

## Verification Checklist

- [ ] Bucket `bcd-images` created in Storage
- [ ] Bucket is set to **Public**
- [ ] All 3 storage policies are applied
- [ ] Frontend `.env` has `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`
- [ ] Test upload from frontend works
- [ ] Images are public URLs accessible in browser
