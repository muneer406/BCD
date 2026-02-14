# BCD - Breast Changes Detection / VAAS - Visual Anomaly Awareness System

A **privacy-focused, time-series visual change detection system** built on React, TypeScript, and Supabase. BCD helps users track visual changes over time with calm, neutral guidance-**not** diagnosis.

---

## 🎯 Project Goal

Enable users to:

1. Capture standardized images of themselves (6 angles per session)
2. Store images securely with time-series metadata
3. Receive neutral change indicators by comparing sessions
4. Decide when to seek professional consultation

**What BCD is NOT:**

- ❌ A diagnostic tool
- ❌ A cancer detector
- ❌ A medical device
- ❌ A replacement for doctors/screenings

---

## 📁 Project Structure

```
BCD/
├── frontend/                           # React + TypeScript + Tailwind UI
│   ├── src/
│   │   ├── components/                 # Reusable UI components (Button, Card, etc)
│   │   ├── context/                    # Auth & Draft state management
│   │   ├── pages/                      # Route pages (Capture, Review, History, etc)
│   │   ├── lib/                        # Supabase client config
│   │   ├── data/                       # Static capture angle definitions
│   │   └── index.css                   # Tailwind styles
│   ├── .env.example                    # Environment variable template
│   ├── package.json                    # Dependencies
│   └── README.md                       # Frontend-specific docs
│
├── backend/                            # (Phase 2) FastAPI for anomaly scoring
│   └── .gitkeep
│
├── Docs/                               # Project specifications
│   ├── visual_anomaly_awareness_system.md
│   └── bcd_vaas_frontend_web_app_specification_phase_1_2.md
│
├── SUPABASE_MIGRATIONS.sql             # Database schema (tables, indexes, RLS)
├── SUPABASE_SCHEMA_OVERVIEW.md         # Database architecture overview
├── SUPABASE_SETUP_GUIDE.md             # Step-by-step Supabase configuration
├── STORAGE_SETUP.md                    # Storage bucket & policies
├── SETUP_CHECKLIST.md                  # Testing checklist after setup
│
├── .gitignore                          # Git ignore rules
└── README.md                           # This file
```

---

## 🚀 Quick Start

### Prerequisites

- **Node.js 18+** installed
- **Supabase project** created (free at [supabase.com](https://supabase.com))
- **Git** for version control

### 1. Setup Frontend

```bash
# Navigate to frontend
cd frontend

# Create environment file
cp .env.example .env.local

# Add your Supabase credentials to .env.local
# VITE_SUPABASE_URL=https://[project-id].supabase.co
# VITE_SUPABASE_ANON_KEY=[your-anon-key]

# Install dependencies
npm install

# Start dev server
npm run dev
```

Open http://localhost:5173 in your browser.

### 2. Setup Supabase Database & Storage

Follow **SUPABASE_SETUP_GUIDE.md** (15 minutes):

1. Execute `SUPABASE_MIGRATIONS.sql` in Supabase SQL Editor
2. Create `bcd-images` storage bucket
3. Apply RLS storage policies
4. Test the flow

### 3. Test Auth & Image Capture

1. **Sign up** at http://localhost:5173/signup
2. **Accept disclaimer** to access capture
3. **Capture all 6 angles** using webcam or file upload (you can add multiple images per angle)
4. **Upload session** directly from Capture page
5. **View results** with session summary and comparison data
6. **View history** to confirm data persisted

---

## 🔐 Security & Privacy

### Authentication

- **Supabase Auth** with email/password
- Session tokens stored in browser
- Auto-logout on tab close

### Data Isolation (RLS)

- Users **cannot** see other users' images or sessions
- Row-Level Security policies enforce in database
- Storage policies ensure folder-level isolation

### Image Storage

- Images stored in public bucket (`bcd-images`)
- Folder structure: `{user_id}/{session_id}/{image_type}.jpg`
- URLs generated dynamically, not shareable by default

### No Personal Data

- No sensitive metadata collected
- No IP logging
- No medical history stored

---

## 📊 Database Schema

### Tables

- **`sessions`** - Capture sessions (user + timestamp)
- **`images`** - Image metadata (type + URL + timestamp)
- **`disclaimer_acceptance`** - Consent tracking
- **`user_profiles`** - User email + creation date

### Indexes

- `sessions(user_id, created_at)`
- `images(session_id, user_id, image_type)`

### RLS Policies

All tables protected. Users can only access their own data.

See **SUPABASE_MIGRATIONS.sql** for full CREATE TABLE syntax.

---

## 🛠️ Tech Stack

### Frontend

- **React 18** - UI library
- **TypeScript** - Type safety
- **Vite** - Build tool (HMR, fast dev)
- **Tailwind CSS** - Utility-first styling
- **React Router v6** - Client-side routing
- **Supabase JS Client** - Auth + DB + Storage

### Backend (Phase 2)

- **FastAPI** - Python async web framework
- **OpenCV/PIL** - Image processing
- **NumPy/SciPy** - Numerical computing
- **Pre-trained vision model** - Feature extraction

### Hosting

- **Frontend:** Vercel / Netlify / Firebase Hosting
- **Backend:** Railway / Render / AWS Lambda
- **Database:** Supabase (PostgreSQL)
- **Storage:** Supabase Storage (AWS S3)

---

## 📖 Documentation

| Document                                                      | Purpose                                             |
| ------------------------------------------------------------- | --------------------------------------------------- |
| **SUPABASE_SETUP_GUIDE.md**                                   | 👈 **Start here** - Complete Supabase configuration |
| **SUPABASE_MIGRATIONS.sql**                                   | Database schema to copy-paste into Supabase         |
| **SUPABASE_SCHEMA_OVERVIEW.md**                               | Architecture overview & data flow                   |
| **STORAGE_SETUP.md**                                          | Storage bucket & RLS policy details                 |
| **SETUP_CHECKLIST.md**                                        | Testing flow after Supabase setup                   |
| **frontend/README.md**                                        | Frontend-specific code guide                        |
| **Docs/visual_anomaly_awareness_system.md**                   | Non-technical project overview                      |
| **Docs/bcd_vaas_frontend_web_app_specification_phase_1_2.md** | Technical specifications                            |

---

## 🧪 Testing

### Manual Testing Scenario

1. **Create test account A** - test-a@example.com
2. **Create test account B** - test-b@example.com
3. **Account A:**
   - Sign up
   - Accept disclaimer
   - Capture & save session with images
4. **Account B:**
   - Sign up separately
   - Verify **cannot see Account A's sessions** (RLS blocking)
5. **Cross-check in Supabase Dashboard:**
   - Account A's sessions visible to Account A
   - Account B has empty history
   - Storage folder structure matches user IDs

---

## 🔄 User Flow

```
Landing Page (/)
  ↓
[Authenticated?]
  No → Sign Up (/signup) → Confirm Email → Disclaimer (/disclaimer)
  Yes → [Disclaimer accepted?]
        No → Disclaimer (/disclaimer)
        Yes ↓
          Capture (/capture) - All 6 angles
            ↓ [All 6 angles captured?]
            No → Stay on Capture, add images
            Yes ↓
          Upload Session → Save to DB + Upload to Storage
            ↓
          Result (/result) - Session summary
            ↓
          History (/history) - View all prior sessions
```

---

## 🎥 Image Capture Protocol

Each session requires **all 6 angles** (at least 1 image per angle; more images = better results):

| Angle              | Required | Description                                  |
| ------------------ | -------- | -------------------------------------------- |
| **Front view**     | ✅       | Centered, shoulders relaxed, arms at sides   |
| **Left side**      | ✅       | 90° left turn, steady posture                |
| **Right side**     | ✅       | 90° right turn, steady posture               |
| **Upward angle**   | ✅       | Camera tilted slightly upward at chest level |
| **Downward angle** | ✅       | Camera from above, angle downward            |
| **Full body view** | ✅       | Step back or raise camera to show full torso |

**Key for accuracy:** Consistent distance, lighting, and positioning per session enables accurate time-series comparisons.

**Note:** You can capture multiple images per angle for improved detection confidence. The more images, the better the results.

---

## 🚧 Current Phase & Next Steps

### Phase 1 ✅ Complete

- [x] Frontend UI/UX skeleton
- [x] Auth (signup/login)
- [x] Disclaimer gate
- [x] Image capture + upload
- [x] Session management
- [x] History view
- [x] Supabase integration

### Phase 2 (Coming)

- [ ] Backend FastAPI server
- [ ] ML anomaly detection model
- [ ] Session comparison logic
- [ ] Change score generation
- [ ] Result presentation

### Phase 3+ (Future)

- [ ] Advanced comparisons (graphs, trends)
- [ ] Export functionality
- [ ] Mobile app (React Native)
- [ ] Regulatory compliance (FDA, CE)

---

## 📋 Troubleshooting

### "Cannot sign up"

- Check Email auth is enabled in Supabase > Authentication
- Verify `.env` has correct VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY

### "Images not uploading"

- Confirm `bcd-images` bucket exists and is Public
- Check storage policies are applied
- Verify user is authenticated (check AppHeader)

### "Cannot see sessions in history"

- Ensure disclaimer was accepted (check DB: `disclaimer_acceptance` table)
- Verify RLS policies exist (all `create policy` statements executed)

### "Other users can see my data"

- RLS policies not applied. Run SUPABASE_MIGRATIONS.sql again
- Confirm `enable row level security` statements executed

See **SETUP_CHECKLIST.md** for detailed testing & debugging.

---

## 🤝 Contributing

This is a guided project. If you're working on this:

1. **Follow the specification** - See Docs/ for requirements
2. **Keep changes neutral** - Never add diagnostic language
3. **Test locally** - Use test accounts before deploying
4. **Update docs** - Keep README.md and other guides current

---

## 📜 License

[Add your license here if applicable]

---

## 🙏 Acknowledgments

Built with:

- [Supabase](https://supabase.com) - Open-source Firebase alternative
- [React](https://react.dev) - JavaScript UI library
- [Tailwind CSS](https://tailwindcss.com) - Utility-first CSS
- [Vite](https://vitejs.dev) - Next-generation frontend tooling

---

## 📞 Support

For questions or debugging:

1. Check the relevant guide in the root folder
2. Review JavaScript console for errors
3. Check Supabase dashboard (SQL Editor, Logs, Storage browser)
4. Consult project specifications in Docs/

---

## ✨ What's Next?

**Ready to get started?**

👉 Follow **[SUPABASE_SETUP_GUIDE.md](SUPABASE_SETUP_GUIDE.md)** to configure your Supabase project (15 minutes).

Then test the full flow locally. Questions? Check **SETUP_CHECKLIST.md**.

---

**BCD/VAAS - Making breast health awareness accessible.** 🎯
