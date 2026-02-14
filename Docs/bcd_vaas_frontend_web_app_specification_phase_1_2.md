# BCD / VAAS – Frontend & Web App Specification

> **Scope:** Frontend-first development (Web App)
> **Tech Stack:** React + TailwindCSS + Supabase + FastAPI (API later)
> **Goal:** Build a presentable, usable, and logically structured web app **before** ML work begins

---

## 0. Philosophy (Read This First)

This frontend is **not a medical dashboard**.

Design principles:

- Calm, neutral, reassuring
- No panic colors (no red alerts)
- No medical jargon
- No "diagnosis" language

Everything should feel like **guided self-awareness**, not examination.

---

## 1. Phase-wise Breakdown (High Level)

### Phase 1 – UI + UX Skeleton (No AI)

- Pages
- Auth
- Image capture & save
- History view
- Static / mock outputs

### Phase 2 – Data Flow & Persistence

- Supabase auth
- Image storage
- Session history
- Time-series structure

_(ML / anomaly detection comes later)_

---

## 2. Atomic Task Breakdown (Frontend Only)

Each task should be independently doable.

### Setup

- Initialize React app
- Install TailwindCSS
- Configure Supabase client
- Setup routing

---

### Auth Tasks

- Create simple email/username + password auth
- Supabase Auth integration
- Login page
- Signup page
- Auth guard for protected routes
- Logout functionality

Auth goal is **identity**, not security perfection (for now).

---

### Layout Tasks

- Global layout component
- Header (logo + logout)
- Page container with max width
- Responsive mobile-first design

---

## 3. Pages Required (Frontend MVP)

### 3.1 Landing / Intro Page (`/`)

**Purpose:** Explain what this is, gently.

Content blocks:

- Project name: **BCD – Breast Changes Detection**
- One-liner:
  > "Track visual changes over time to stay aware of your breast health."
- Bullet points (soft language):
  - Not a medical diagnosis
  - Uses visual change comparison
  - Encourages professional consultation when needed

CTA buttons:

- "Get Started"
- "Login"

Design:

- White / light neutral background
- Soft gradients
- Rounded cards
- No aggressive illustrations

---

### 3.2 Auth Pages (`/login`, `/signup`)

Minimal. No drama.

Elements:

- Input: email / username
- Input: password
- Button: login / signup
- Small disclaimer text

Design:

- Centered card
- Clean typography
- No distractions

---

### 3.3 Disclaimer Gate (`/disclaimer`)

**Non-skippable on first use.**

Text sections:

- This is not a diagnostic tool
- Does not detect cancer
- For awareness only
- Consult professionals for concerns

Actions:

- Checkbox: "I understand"
- Button: "Continue"

Store acceptance flag in Supabase.

---

### 3.4 Capture Page (`/capture`)

**Core interaction page.**

Elements:

- Camera access OR image selection
- Overlay guidelines:
  - Distance
  - Lighting
  - Angle consistency
- Save button

UX notes:

- One image at a time
- Clear retake option
- Gentle instructions

No processing shown yet (mock state).

---

### 3.5 Session Review Page (`/review`)

Show captured image preview.

Elements:

- Image preview
- Timestamp
- Static placeholder text:
  > "Analyzing visual changes compared to your previous sessions..."

Button:

- "Save session"

This writes data to Supabase.

---

### 3.6 History Page (`/history`)

Purpose: Time-series awareness.

Elements:

- List of previous sessions
  - Date
  - Thumbnail
  - Status label (neutral)

Later expandable to:

- Change graphs
- Trend indicators

---

### 3.7 Result Page (`/result`)

**Mocked for now.**

Text examples:

- "No significant visual change detected compared to last session."
- "Noticeable visual differences compared to earlier sessions."

Tone:

- Calm
- Informational
- No risk scores yet

CTA:

- "View History"
- "Learn When to Consult a Doctor"

---

## 4. Supabase Data Model (Frontend-Relevant)

### Tables

#### `users`

- id
- email
- created_at

#### `sessions`

- id
- user_id
- created_at
- image_url
- notes (optional)

#### `disclaimer_acceptance`

- user_id
- accepted_at

Images stored in:

- Supabase Storage (bucket: `bcd-images`)

---

## 5. Design Direction

### Visual Style

- Tailwind defaults
- Neutral palette (gray, slate, soft blue)
- Rounded corners
- Large line height
- No red/green verdict colors

### Inspiration Keywords

- Calm
- Private
- Respectful
- Minimal

Avoid:

- Medical dashboards
- Sharp contrasts
- Alarmist UI

---

## 6. Wording & Copy Rules

Never say:

- "Cancer"
- "Diagnosis"
- "Positive / Negative"

Prefer:

- "Change"
- "Difference"
- "Awareness"
- "Recommendation"

---

## 7. What We Intentionally Ignore (For Now)

- ML accuracy
- Model training
- On-device inference
- Advanced security
- Regulatory compliance

These come **after** the product feels real.

---

## 8. Definition of Done (Frontend Phase)

Frontend is complete when:

- A user can sign up
- Add images
- See session history
- Understand what the app does
- Never think it diagnoses cancer

---

## Next Document (Later)

- Backend API spec
- Image preprocessing pipeline
- Anomaly detection logic
- Risk communication rules

---

**This document intentionally over-optimizes clarity over cleverness.**
