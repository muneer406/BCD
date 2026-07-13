# BCD Frontend

React 19 + TypeScript + Vite + Tailwind CSS frontend for the BCD (Breast Changes Detection) app.

## Quick Start

```bash
npm install
cp .env.example .env.local  # Add your Supabase credentials
npm run dev                  # → http://localhost:5173
```

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start Vite dev server with HMR |
| `npm run build` | TypeScript check + production build → `dist/` |
| `npm run lint` | ESLint across `src/` |
| `npm run preview` | Preview production build locally |
| `npm test` | Run Vitest test suite |

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `VITE_SUPABASE_URL` | Yes | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Yes | Supabase anonymous/public key |
| `VITE_API_URL` | Yes | Backend API URL (e.g., `http://localhost:8000` for dev, or your HF Space URL for production) |

## Key Pages

| Route | Description |
|---|---|
| `/` | Landing page |
| `/login` / `/signup` | Authentication |
| `/disclaimer` | Medical disclaimer acceptance |
| `/capture` | 6-angle image capture session |
| `/history` | Session timeline with thumbnails |
| `/result/:sessionId` | Per-session analysis results |

## Architecture

- **State management:** React Context (AuthContext, DraftContext, SessionCacheContext)
- **API client:** Custom `apiClient` wrapping `fetch()` with JWT auth
- **Error handling:** ErrorBoundary component wrapping all routes
- **Accessibility:** ARIA live regions for async status, keyboard-accessible inputs
- **Styling:** Tailwind CSS with custom `ink`, `sand`, `tide` color palette
