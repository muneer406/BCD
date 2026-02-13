# Supabase Complete Entity Reference

This file is a quick checklist of all Supabase entities that need to be created or configured.

---

## ✅ Database Tables (Execute SUPABASE_MIGRATIONS.sql)

- [x] **sessions** — User capture sessions
  - Columns: id, user_id, created_at, notes, status
  - Primary key: id (uuid)
  - Foreign key: user_id → auth.users(id)
  - Indexes: user_id, created_at

- [x] **images** — Image metadata
  - Columns: id, session_id, user_id, image_type, image_url, created_at
  - Primary key: id (uuid)
  - Foreign keys: session_id → sessions(id), user_id → auth.users(id)
  - Constraints: image_type IN ('front', 'left', 'right', 'up', 'down', 'raised')
  - Indexes: session_id, user_id, image_type

- [x] **disclaimer_acceptance** — Consent tracking
  - Columns: id, user_id, accepted_at
  - Primary key: id (uuid)
  - Unique: user_id
  - Foreign key: user_id → auth.users(id)

- [x] **user_profiles** — User metadata
  - Columns: id, email, created_at, updated_at
  - Primary key: id (uuid, references auth.users)
  - Foreign key: id → auth.users(id)

---

## ✅ Row-Level Security (RLS) Policies

All enabled with `alter table ... enable row level security`

### sessions (4 policies)

- [ ] `sessions_select_own` — SELECT for own user
- [ ] `sessions_insert_own` — INSERT for own user
- [ ] `sessions_update_own` — UPDATE for own user
- [ ] `sessions_delete_own` — DELETE for own user

### images (3 policies)

- [ ] `images_select_own` — SELECT for own user
- [ ] `images_insert_own` — INSERT for own user
- [ ] `images_delete_own` — DELETE for own user

### disclaimer_acceptance (4 policies)

- [ ] `disclaimer_select_own` — SELECT for own user
- [ ] `disclaimer_insert_own` — INSERT for own user
- [ ] `disclaimer_update_own` — UPDATE for own user
- [ ] `disclaimer_delete_own` — DELETE for own user

### user_profiles (3 policies)

- [ ] `user_profiles_select_own` — SELECT for own user
- [ ] `user_profiles_insert_own` — INSERT for own user
- [ ] `user_profiles_update_own` — UPDATE for own user

---

## ✅ Indexes (Auto-created with migrations)

- [x] `sessions_user_id_idx` on sessions(user_id)
- [x] `sessions_created_at_idx` on sessions(created_at)
- [x] `images_session_id_idx` on images(session_id)
- [x] `images_user_id_idx` on images(user_id)
- [x] `images_image_type_idx` on images(image_type)

---

## ✅ Functions & Triggers (Auto-created with migrations)

- [x] **handle_new_user()** — Function to auto-create user_profiles
- [x] **on_auth_user_created** — Trigger on auth.users INSERT

---

## ⚙️ Storage Configuration

### Bucket

- [ ] **bcd-images** — Public bucket for image files
  - Visibility: Public
  - Folder structure: `{user_id}/{session_id}/{image_type}.{ext}`

### Storage Policies (3 required)

#### Policy 1: Upload

- [ ] Name: `allow_upload_own_folder`
- [ ] Target role: authenticated
- [ ] Operation: INSERT
- [ ] Check: `(bucket_id = 'bcd-images' AND auth.uid()::text = (storage.foldername(name))[1])`

#### Policy 2: Read

- [ ] Name: `allow_read_own_images`
- [ ] Target role: authenticated
- [ ] Operation: SELECT
- [ ] Using: `(bucket_id = 'bcd-images' AND auth.uid()::text = (storage.foldername(name))[1])`

#### Policy 3: Public Read (Optional)

- [ ] Name: `allow_public_read`
- [ ] Target role: authenticated
- [ ] Operation: SELECT
- [ ] Using: `(bucket_id = 'bcd-images')`

---

## 🔐 Authentication Configuration

### Email Provider

- [ ] Enable email/password authentication
- [ ] Configure email confirmation settings (optional)
- [ ] Set redirect URL for email links (http://localhost:5173)

---

## 📊 Summary

**Total items to configure:**

- 4 database tables ✅
- 14 RLS policies ✅
- 5 indexes ✅
- 2 functions/triggers ✅
- 1 storage bucket ⚙️
- 3 storage policies ⚙️
- 1 auth provider ⚙️

**Total: 30 items**

---

## 🔍 Verification Queries

Run these after setup to verify everything:

```sql
-- Verify tables exist
select table_name from information_schema.tables
where table_schema = 'public'
order by table_name;

-- Verify RLS is enabled
select schemaname, tablename, rowsecurity
from pg_tables
where schemaname = 'public';

-- Verify policies exist
select count(*) from pg_policies where schemaname = 'public';

-- Verify indexes exist
select schemaname, tablename, indexname from pg_indexes
where schemaname = 'public'
order by tablename;

-- Verify triggers exist
select trigger_name, event_object_table
from information_schema.triggers
where trigger_schema = 'public';
```

---

## 📋 Setup Checklist

- [ ] SQL Migrations executed (SUPABASE_MIGRATIONS.sql)
- [ ] All 4 tables visible in dashboard
- [ ] All RLS policies created and enabled
- [ ] All indexes created
- [ ] Functions and trigger created
- [ ] `bcd-images` bucket created and public
- [ ] 3 storage policies applied
- [ ] Email auth provider enabled
- [ ] Frontend `.env` has credentials
- [ ] Frontend tests pass (sign up → capture → upload → history)
- [ ] Data isolation verified (user A cannot see user B's data)

---

## 🆘 If Something's Missing

**Missing table?**
→ Run SUPABASE_MIGRATIONS.sql again (check for errors)

**Missing RLS policies?**
→ Manually add via: SQL Editor > New Query > See STORAGE_SETUP.md

**Storage issues?**
→ Create bucket manually: Storage > Create new bucket > Name: bcd-images > Public

**Auth not working?**
→ Go to Authentication > Providers > Enable Email

---

## 📖 Reference Files

- **SUPABASE_MIGRATIONS.sql** — Copy-paste for DB setup
- **STORAGE_SETUP.md** — Storage bucket & policies
- **SUPABASE_SETUP_GUIDE.md** — Full step-by-step guide
- **SETUP_CHECKLIST.md** — Testing checklist
