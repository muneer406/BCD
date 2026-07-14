# BCD — Laptop Sync Instructions

Run these in PowerShell on your laptop to sync the repo with the latest code.

## 1. Pull the latest code

```powershell
cd C:\Users\munee\MuneerBackup\Muneer\MainFolder\CodingPractices\BCD

# Fetch and reset to latest master
git fetch origin
git reset --hard origin/master
```

## 2. Clean stale local files

```powershell
# Remove old virtual environments and caches
Remove-Item -Recurse -Force .venv, __pycache__, node_modules, .pytest_cache, backend/.venv -ErrorAction SilentlyContinue

# Deep clean all __pycache__ dirs
Get-ChildItem -Recurse -Directory -Hidden __pycache__ | Remove-Item -Recurse -Force
```

## 3. Set up environment files

```powershell
# Backend
Copy-Item backend/.env.example backend/.env
```

Then edit `backend/.env` and add:

```
SUPABASE_URL=https://vtpgeaqhkbbpvaigxwgq.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ0cGdlYXFoa2JicHZhaWd4d2dxIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTAwMzE1NiwiZXhwIjoyMDg2NTc5MTU2fQ.HDljzGdJwNsi1-i5SskZmNMyy5xgRzpi2PFt3Pa23yE
BACKDOOR_PASSWORD=
ALLOWED_ORIGINS=*
```

```powershell
# Frontend
Copy-Item frontend/.env.example frontend/.env.local
```

Then edit `frontend/.env.local` and add:

```
VITE_SUPABASE_URL=https://vtpgeaqhkbbpvaigxwgq.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ0cGdlYXFoa2JicHZhaWd4d2dxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEwMDMxNTYsImV4cCI6MjA4NjU3OTE1Nn0.aJ-Zk7QZvDJzCGbyBw_Kf5VKd5U6oGPfWByPruQOE7E
VITE_API_URL=http://localhost:8000
```

## 4. Reinstall dependencies

```powershell
cd frontend
npm install
```

```powershell
cd backend
python -m venv .venv
.venv\Scripts\activate
uv pip install -r requirements.txt
```

## 5. Verify

```powershell
cd frontend
npx tsc -b --noEmit
npm run lint
```

If these pass, the sync is complete.
