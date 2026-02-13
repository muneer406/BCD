# BCD/VAAS Supabase Integration — Complete Implementation Guide

## Overview

Your BCD frontend is now integrated with Supabase for:

- User authentication (email/password)
- Session management (capture sessions)
- Image storage (Supabase Storage)
- Disclaimer tracking
- Row-Level Security (RLS) for data isolation

All frontend code is ready to go. You just need to set up Supabase following the guides below.

---

## Documentation Files

Read these in order:

| File                        | Purpose                                           | Read Time |
| --------------------------- | ------------------------------------------------- | --------- |
| **SUPABASE_SETUP_GUIDE.md** | Step-by-step Supabase configuration (start here!) | 15 min    |
| **SUPABASE_MIGRATIONS.sql** | Complete database schema to execute               | Reference |
| **STORAGE_SETUP.md**        | Storage bucket & RLS policies                     | 5 min     |
| **SETUP_CHECKLIST.md**      | Testing checklist after setup                     | 10 min    |

---

## Quick Start (TL;DR)

1. **Execute SQL migrations:**
   - Go to Supabase Dashboard > SQL Editor > New Query
   - Copy contents of `SUPABASE_MIGRATIONS.sql`
   - Paste and click Run

2. **Create storage bucket:**
   - Storage > Create new bucket > Name: `bcd-images` > Public
   - Add 2-3 storage policies (see STORAGE_SETUP.md)

3. **Run frontend:**

   ```bash
   cd frontend
   npm install
   npm run dev
   ```

4. **Test:**
   - Sign up > Accept disclaimer > Capture images > Review > Save
   - Check Supabase dashboard for tables and storage files

---

## Frontend Code Status

✅ **All ready to use:**

- **Auth flows:** Signup, Login, Logout, Session persistence
- **Route guards:** Protected routes, disclaimer gate
- **Data operations:**
  - Session creation
  - Image upload to storage
  - Image metadata saved to database
  - Session history view
- **Error handling:** User-friendly messages for all failures
- **TypeScript:** Full type safety throughout

**Files to review:**

- `frontend/src/lib/supabaseClient.ts` — Supabase client config
- `frontend/src/context/AuthContext.tsx` — User auth state
- `frontend/src/pages/Review.tsx` — Image upload logic
- `frontend/src/pages/Disclaimer.tsx` — Disclaimer acceptance
- `frontend/src/pages/History.tsx` — Session browsing

---

## Database Schema

### Tables Created

```
sessions
├── id (uuid, primary key)
├── user_id (uuid, references auth.users)
├── created_at (timestamp)
├── notes (text, optional)
└── status (text: 'in_progress' | 'completed' | 'reviewed')

images
├── id (uuid, primary key)
├── session_id (uuid, references sessions)
├── user_id (uuid, references auth.users)
├── image_type (text: 'front' | 'left' | 'right' | 'up' | 'down' | 'raised')
├── image_url (text, public URL)
└── created_at (timestamp)

disclaimer_acceptance
├── id (uuid, primary key)
├── user_id (uuid, unique, references auth.users)
└── accepted_at (timestamp)

user_profiles
├── id (uuid, primary key, references auth.users)
├── email (text)
├── created_at (timestamp)
└── updated_at (timestamp)
```

### RLS Policies

All tables have Row-Level Security enabled:

- Users can only see/modify their own sessions
- Users can only upload/see their own images
- Disclaimer acceptance is user-specific
- Auto-create user profile on signup

---

## Storage Structure

After first image upload, your storage will look like:

```
bcd-images/
└── {user-uuid}/
    └── {session-uuid}/
        ├── front.jpg
        ├── left.jpg
        ├── right.jpg
        ├── up.jpg
        ├── down.jpg
        └── raised.jpg
```

Public URLs are generated automatically and stored in the `images` table.

---

## Execution Sequence

### User Flow:

1. **Landing Page (`/`)** → Unauthenticated user
2. **Sign Up (`/signup`)** → Create account via Supabase Auth
3. **Disclaimer (`/disclaimer`)** → Accept terms (stored in DB)
4. **Capture (`/capture`)** → Upload 5-6 images (draft state)
5. **Review (`/review`)** → Preview before save
6. **Save** →
   - Create session in `sessions` table
   - Upload images to `bcd-images` storage
   - Insert metadata to `images` table
7. **Result (`/result`)** → Confirmation page
8. **History (`/history`)** → Browse past sessions

### Data Flow:

```
Frontend (Draft)
  ↓
User clicks Save Session
  ↓
Create Session in DB
  ↓
Upload Image File → Storage
  ↓
Get Public URL from Storage
  ↓
Save Image Metadata to DB
  ↓
Clear Draft & Navigate to Result
```

---

## Environment Variables

Your `.env` file should have (you already added these):

```dotenv
VITE_SUPABASE_URL=https://[your-project-id].supabase.co
VITE_SUPABASE_ANON_KEY=[your-anon-key]
```

These are read from the Supabase project settings:

- Project Settings > API
- Copy "Project URL" and "Anon Public Role" key

---

## Testing Scenario

Once set up, test with:

1. **Create 2 test accounts:**
   - Account A: test-a@example.com
   - Account B: test-b@example.com

2. **Account A captures session:**
   - Add 5 test images
   - Save session
   - Note session ID

3. **Account B signs up & checks:**
   - Account B cannot see Account A's sessions (RLS blocks it)
   - Account B can only see empty history

4. **Verify isolation in Dashboard:**

   ```sql
   -- Run as Account A (current user)
   select count(*) from sessions; -- Should be 1 or more

   -- Account B sees no sessions (RLS policy filters them)
   ```

---

## Troubleshooting

### "Storage policies don't exist" error

→ See **STORAGE_SETUP.md** for applying policies via SQL Editor

### "Images not uploading"

→ Check:

1. User is authenticated (check AppHeader)
2. `.env` has correct credentials
3. `bcd-images` bucket exists and is Public
4. Storage policies are applied

### "User can see other users' data"

→ RLS policies not working. Verify:

1. All `enable row level security` statements executed
2. All policy `create policy` statements executed
3. Policies target correct columns (user_id = auth.uid())

---

## What's Next

After testing successful:

1. **Backend API (Phase 2):**
   - FastAPI server for anomaly detection
   - Receives images, returns change scores
   - Integration point: `frontend/src/pages/Result.tsx`

2. **Anomaly Model:**
   - Computer vision model for visual comparison
   - Baseline-to-current session comparison
   - Neutral change scoring

3. **Advanced Features:**
   - Advanced image comparison graphs
   - Trend analysis over multiple sessions
   - Export session data
   - User settings/preferences

---

## Key Files Reference

```
BCD/
├── SUPABASE_MIGRATIONS.sql      ← Run this in SQL Editor
├── STORAGE_SETUP.md              ← Storage configuration
├── SUPABASE_SETUP_GUIDE.md       ← Full step-by-step guide (START HERE)
├── SETUP_CHECKLIST.md            ← Testing checklist
├── SUPABASE_SCHEMA.md            ← This file (overview)
│
├── frontend/
│   ├── .env                       ← Your Supabase credentials
│   ├── .env.example               ← Reference
│   └── src/
│       ├── lib/supabaseClient.ts  ← Supabase JS client
│       ├── context/
│       │   ├── AuthContext.tsx    ← User auth state
│       │   └── DraftContext.tsx   ← Capture session state
│       └── pages/
│           ├── Review.tsx         ← Image upload logic
│           ├── Disclaimer.tsx     ← Disclaimer acceptance
│           └── History.tsx        ← Session browsing
│
├── Docs/
│   ├── visual_anomaly_awareness_system.md
│   └── bcd_vaas_frontend_web_app_specification_phase_1_2.md
│
└── backend/
    └── (Coming Phase 2)
```

---

## Version Info

- **React:** 18.x
- **TypeScript:** Latest
- **Tailwind:** 3.4.17
- **Supabase JS:** Latest
- **Vite:** 7.x

---

**You're ready to configure Supabase!** 👉 Start with **SUPABASE_SETUP_GUIDE.md**
