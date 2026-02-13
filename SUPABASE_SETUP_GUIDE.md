# BCD/VAAS Supabase Complete Setup Guide

This guide walks you through setting up Supabase from scratch for the BCD project with all tables, RLS policies, storage, and functions.

---

## Prerequisites

✅ You have:

- A Supabase project created
- `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in your frontend `.env`

---

## Step 1: Execute Database Migrations

### 1.1 Open SQL Editor

1. Go to your **Supabase Dashboard**
2. Click **SQL Editor** (left sidebar)
3. Click **New Query** button

### 1.2 Copy & Paste Migrations

1. Open the file: `SUPABASE_MIGRATIONS.sql` from the root of your BCD project
2. Copy **ALL** the contents (from `--` comments to the last line)
3. Paste into the Supabase SQL Editor window
4. Click the **blue Run button** (top right of editor)

**Expected output:**

```
Query executed successfully
```

**What was created:**

- ✅ `sessions` table
- ✅ `images` table
- ✅ `disclaimer_acceptance` table
- ✅ `user_profiles` table
- ✅ 5 indexes for performance
- ✅ RLS policies on all tables
- ✅ Auto-profile creation function and trigger

### 1.3 Verify Tables Exist

In the same SQL Editor, run this quick test:

```sql
select table_name from information_schema.tables where table_schema = 'public';
```

You should see:

```
sessions
images
disclaimer_acceptance
user_profiles
```

---

## Step 2: Create Storage Bucket

### 2.1 Open Storage

1. Go to **Storage** (left sidebar of dashboard)
2. You should see a list of buckets (empty if new project)

### 2.2 Create Bucket

1. Click **Create a new bucket**
2. Fill in:
   - **Bucket name:** `bcd-images`
   - **Privacy:** Select **Public** (checkbox should be checked)
3. Click **Create bucket**

### 2.3 Set Storage Policies

1. Click on the **`bcd-images`** bucket
2. Go to **Policies** tab (top of bucket view)
3. Click **New Policy** button

#### Policy 1: Upload own folder

1. Click **New Policy** > **Create custom policy**
2. Fill in:
   - **Name:** `allow_upload_own_folder`
   - **Target role:** `authenticated`
   - **Operation:** `INSERT`
   - **Using expression:** Leave blank
   - **With check:** Paste this:
     ```
     (bucket_id = 'bcd-images' AND auth.uid()::text = (storage.foldername(name))[1])
     ```
3. Click **Save policy**

#### Policy 2: Read own images

1. Click **New Policy** > **Create custom policy**
2. Fill in:
   - **Name:** `allow_read_own_images`
   - **Target role:** `authenticated`
   - **Operation:** `SELECT`
   - **Using expression:** Paste this:
     ```
     (bucket_id = 'bcd-images' AND auth.uid()::text = (storage.foldername(name))[1])
     ```
   - **With check:** Leave blank
3. Click **Save policy**

#### Policy 3: Public read (optional, for sharing)

1. Click **New Policy** > **Create custom policy**
2. Fill in:
   - **Name:** `allow_public_read`
   - **Target role:** `authenticated`
   - **Operation:** `SELECT`
   - **Using expression:** Paste this:
     ```
     (bucket_id = 'bcd-images')
     ```
   - **With check:** Leave blank
3. Click **Save policy**

### 2.4 Alternative: SQL-based Policies

If the UI approach above doesn't work, use SQL instead:

1. Go back to **SQL Editor**
2. Create a new query
3. Paste this:

```sql
-- Ensure bucket exists
insert into storage.buckets (id, name, public)
values ('bcd-images', 'bcd-images', true)
on conflict (id) do nothing;

-- Policy 1: Upload
create policy "allow_upload_own_folder"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'bcd-images'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Policy 2: Read
create policy "allow_read_own_images"
on storage.objects for select
to authenticated
using (
  bucket_id = 'bcd-images'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Policy 3: Public read
create policy "allow_public_read"
on storage.objects for select
to authenticated
using (bucket_id = 'bcd-images');
```

4. Click **Run**

---

## Step 3: Configure Auth Settings

### 3.1 Enable Email Auth

1. Go to **Authentication** (left sidebar)
2. Click **Providers** tab
3. Scroll down to **Email**
4. Toggle **Email** to **ON**
5. Configure:
   - **Enter Confirm email (optional):** Can leave as is
   - **Redirect URL after Confirmation:** `http://localhost:5173/` (for local testing)
6. Click **Save**

### 3.2 Enable Auto Confirm (Development Only)

For testing purposes, auto-confirm emails:

1. Click **Settings** tab (under Authentication)
2. Scroll down to **Email**
3. Check **Enable email confirmations** (if not already)
4. Alternatively, skip confirmation by checking **Skip confirmation for new users** (less secure)

---

## Step 4: Test the Frontend

### 4.1 Install Dependencies & Start Dev Server

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:5173 in your browser.

### 4.2 Test Auth Sign-Up

1. Click **Sign up**
2. Enter:
   - Email: `test@example.com`
   - Password: `TestPassword123!`
3. Click **Create account**
4. You should be redirected to `/disclaimer`

**Check Supabase:**

- Go to **Authentication** > **Users**
- You should see `test@example.com` listed

### 4.3 Accept Disclaimer

1. Check the **I understand...** checkbox
2. Click **Continue**
3. You should be redirected to `/capture`

**Check Supabase Database:**

- Go to **SQL Editor**
- Run this query:
  ```sql
  select * from public.disclaimer_acceptance;
  ```
- You should see an entry with your user's ID

### 4.4 Test Image Capture & Upload

1. You're now on `/capture`
2. For each of the 6 required angles (Front, Left, Right, Up, Down, Full body):
   - Click the **Add image** box
   - Use your webcam OR upload a photo
   - After uploading, you'll see a preview
   - Click the image to see it full-screen (modal view)
   - You can add more images per angle for better results
3. Once all 6 angles have at least 1 image, the **Upload session** button activates
4. Click **Upload session**
5. All images are uploaded to `bcd-images` storage and metadata saved to database
6. You're redirected to `/result` with session summary and comparison data

**Check Supabase:**

- **Storage:**
  - Go to **Storage** > **bcd-images**
  - You should see a folder with your user ID
  - Inside: a folder with session ID
  - Inside that: 6 image files (front.jpg, left.jpg, right.jpg, up.jpg, down.jpg, raised.jpg)

- **Database - Sessions:**
  - SQL Editor, run:
    ```sql
    select * from public.sessions where user_id = auth.uid();
    ```
  - You should see 1 session entry

- **Database - Images:**
  - Run:
    ```sql
    select * from public.images where session_id = '{session-id}';
    ```
  - You should see 6 image metadata entries

### 4.5 Test Result & History View

1. On `/result`, you should see:
   - Session complete confirmation
   - Image quality metrics
   - Comparison to previous sessions (dummy data)
   - Health reminder
2. Click **View all sessions** or **Capture another session**
3. Click **History** in the header
4. You should see your session listed with a thumbnail
5. The date/time should display correctly

---

## Step 5: Verification Checklist

- [ ] SQL migrations executed without errors
- [ ] All 4 tables appear in database (`sessions`, `images`, `disclaimer_acceptance`, `user_profiles`)
- [ ] Indexes created on tables
- [ ] `bcd-images` storage bucket created and public
- [ ] 3 storage policies applied (or SQL executed)
- [ ] Auth > Email provider enabled
- [ ] Frontend can sign up new user
- [ ] Disclaimer saves correctly
- [ ] Images upload to storage with correct folder structure
- [ ] Session data saves to database
- [ ] User can view history

---

## Common Issues & Solutions

### Issue: "FUNCTION storage.foldername does not exist"

**Cause:** Supabase version doesn't have the function yet.

**Solution:** Use simplified policies instead:

```sql
-- Simplified - allows upload to any path
create policy "allow_upload_simple"
on storage.objects for insert
to authenticated
with check (bucket_id = 'bcd-images');

create policy "allow_read_simple"
on storage.objects for select
to authenticated
using (bucket_id = 'bcd-images');
```

---

### Issue: Images upload but don't appear in directory

**Possible causes:**

1. Storage policies not applied correctly
2. Bucket not set to Public
3. User not authenticated

**Debug:**

1. Check browser console for errors
2. In Supabase dashboard, confirm policies exist
3. Verify auth status in Components > AppHeader

---

### Issue: "User ID doesn't match" or upload blocked

**Solution:** Check storage policies - they should reference `auth.uid()` not a hardcoded UUID.

---

### Issue: Login works but can't access `/capture`

**Cause:** Disclaimer not accepted yet.

**Fix:**

1. Go to `/disclaimer` manually
2. Run in SQL Editor:
   ```sql
   select * from public.disclaimer_acceptance where user_id = auth.uid();
   ```
3. If empty, the disclaimer save failed - check browser console

---

## Database Query Examples

Helpful queries for debugging:

```sql
-- All sessions for current user
select id, created_at, (select count(*) from images where session_id = sessions.id) as image_count
from sessions where user_id = auth.uid()
order by created_at desc;

-- All images in a session
select image_type, image_url, created_at
from images where session_id = '{session-id}'
order by image_type;

-- Check RLS policies are working
-- (Run as anon role to verify access is denied)
set role anon;
select * from public.sessions where user_id != auth.uid();
-- Should return 0 rows

-- Revert to authenticated
set role authenticated;
```

---

## Next Steps

Once the setup checklist is complete:

1. **Test with multiple users** (create 2-3 test accounts)
2. **Try retaking images** (click Retake on capture page)
3. **Test image deletion** (delete a session and verify images are removed)
4. **Ready for Phase 2:** Backend API integration for anomaly scoring

---

## Support Files Reference

- **SUPABASE_MIGRATIONS.sql** — Full database schema
- **STORAGE_SETUP.md** — Detailed storage configuration
- **SETUP_CHECKLIST.md** — Testing checklist
- **frontend/README.md** — Frontend architecture

---

**All set!** Your Supabase project is now fully configured for BCD/VAAS. 🎉
