# Supabase Setup Checklist for BCD/VAAS

Follow this step-by-step guide to get your Supabase project fully configured.

---

## Phase 1: Database Setup (5 minutes)

### Step 1: Execute SQL Migrations

1. Go to your **Supabase Dashboard**
2. Navigate to **SQL Editor** > **New Query**
3. Copy the entire contents of `SUPABASE_MIGRATIONS.sql` from this project
4. Paste into the SQL editor
5. Click **Run** (top right)
6. Verify: No errors appear in the console

**What this creates:**

- `sessions` table
- `images` table
- `disclaimer_acceptance` table
- `user_profiles` table
- RLS policies for all tables
- Auto-profile creation trigger

---

## Phase 2: Storage Setup (3 minutes)

### Step 1: Create Storage Bucket

1. Go to **Storage** in your Supabase dashboard
2. Click **Create a new bucket**
3. Name: `bcd-images`
4. Privacy: **Public**
5. Click **Create bucket**

### Step 2: Add Storage Policies

1. In Storage, open `bcd-images` bucket
2. Click **Policies** tab
3. Click **New Policy** > **Create from template** > **Authenticated users can upload files to their own folder**
4. Click **Review** and paste this policy name: `allow_upload_own_folder`
5. In the Check expression, replace with:
   ```
   (bucket_id = 'bcd-images' AND (auth.uid())::text = (storage.foldername(name))[1])
   ```
6. Click **Save**

7. Repeat for read access:
   - **New Policy** > **Authenticated users can download files from their own folder**
   - Replace expression with:
   ```
   (bucket_id = 'bcd-images' AND (auth.uid())::text = (storage.foldername(name))[1])
   ```

   - Click **Save**

**Alternatively:** Execute the SQL from `STORAGE_SETUP.md` in your SQL Editor instead.

---

## Phase 3: Environment Configuration (1 minute)

✅ **Already done** (you mentioned you've added credentials)

Verify your `frontend/.env` has:

```dotenv
VITE_SUPABASE_URL=https://[your-project-id].supabase.co
VITE_SUPABASE_ANON_KEY=[your-anon-key]
```

---

## Phase 4: Test the Setup (5 minutes)

### Step 1: Start the Dev Server

```bash
cd frontend
npm run dev
```

Open http://localhost:5173

### Step 2: Test Auth Flow

1. **Sign Up:**
   - Click "Sign up" on landing page
   - Enter email: `test@example.com`
   - Enter password: `TestPassword123!`
   - Verify redirect to `/disclaimer`

2. **Check Supabase Auth:**
   - Dashboard > Authentication > Users
   - Verify `test@example.com` appears

3. **Check Profile Creation:**
   - Dashboard > SQL Editor
   - Run: `select * from public.user_profiles;`
   - Verify entry for your test user

### Step 3: Test Disclaimer Gate

1. Click checkbox: "I understand and want to continue"
2. Click **Continue**
3. Verify redirect to `/capture` page
4. Check database:
   - Run: `select * from public.disclaimer_acceptance;`
   - Verify entry for your user

### Step 4: Test Image Capture & Upload

1. Click **Capture**
2. Use browser webcam OR upload test images for each angle
3. Complete all 5 required angles
4. Click **Review session**
5. Click **Save session**
6. Check Supabase:
   - Database > `sessions` table: Verify new session
   - Database > `images` table: Verify 5-6 image entries
   - Storage > `bcd-images`: Verify images uploaded in folder structure

### Step 5: Test History View

1. Click **History** in nav
2. Verify session appears with thumbnail
3. Dates/times should display correctly

---

## Phase 5: Verify RLS Policies (Optional, Advanced)

### Test User Isolation

1. **In dashboard, verify a user cannot see another user's data:**
   - SQL Editor > New Query
   - Run as service role (not anon):
   ```sql
   set role authenticated;
   set request.jwt.claims = '{"sub": "different-user-id"}';
   select * from public.sessions;
   ```

   - Should return empty result

---

## Common Issues & Fixes

### Issue: `storage.foldername() is not recognized`

**Fix:** Use simpler policy:

```sql
(bucket_id = 'bcd-images')
```

This allows uploading to any path. For stricter control, wait for Supabase to fix the function.

---

### Issue: Images not uploading

**Check:**

1. User is authenticated (session exists)
2. `VITE_SUPABASE_URL` is correct in `.env`
3. `VITE_SUPABASE_ANON_KEY` is correct in `.env`
4. `bcd-images` bucket exists and is Public
5. Storage policies are applied

---

### Issue: "User not found" on session save

**Check:**

1. User is logged in
2. Disclaimer was accepted (check table)
3. Refresh page and try again

---

## Next Steps After Verification

Once everything is working:

1. **Test with real images** from phone/camera
2. **Create second test user** to verify isolation
3. **Ready for Phase 2:** Backend anomaly scoring API integration

---

## Table Quick Reference

| Table                   | Purpose                 | Auth             |
| ----------------------- | ----------------------- | ---------------- |
| `sessions`              | Tracks capture sessions | RLS protected    |
| `images`                | Image metadata          | RLS protected    |
| `disclaimer_acceptance` | User consent tracking   | RLS protected    |
| `user_profiles`         | User info (email, etc)  | RLS protected    |
| `bcd-images` (Storage)  | Image files             | Storage policies |

---

## SQL Queries for Testing

```sql
-- See all sessions for authenticated user (run as anon role)
select * from public.sessions where user_id = auth.uid();

-- See all images in a session
select * from public.images where session_id = '{session_id}';

-- Check disclaimer acceptance
select * from public.disclaimer_acceptance where user_id = auth.uid();

-- Count images by type
select image_type, count(*) from public.images group by image_type;
```

---

**You're all set!** 🎉 Every table, policy, and bucket is configured for BCD/VAAS.

Questions? Check the troubleshooting section above or review `SUPABASE_MIGRATIONS.sql` for table definitions.
