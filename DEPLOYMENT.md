# Deployment Guide

This document describes the continuous integration / continuous deployment (CI/CD) pipeline for BCD and how to deploy the frontend and backend manually if needed.

---

## CI/CD overview

Pushes and pull requests to `master`/`main` trigger automated workflows defined in `.github/workflows/`.

| Workflow | File | Trigger | Purpose |
|----------|------|---------|---------|
| **CI** | `ci.yml` | PRs and pushes to `master`/`main` | Lint, type check, tests, and build verification for both frontend and backend. |
| **Deploy** | `deploy.yml` | Push to `master`/`main` | Deploys the frontend to Vercel and the backend to Hugging Face Spaces in parallel. |
| **Security Scan** | `security-scan.yml` | Push to `master`/`main`, PRs, weekly cron, or manual | Runs `npm audit`, `pip-audit`, and Trivy container scans; reports findings as PR comments. |
| **Sync HF Space** | `sync-hf-space.yml` | Reusable workflow | Syncs `backend/` to the HF Space repo; called by `deploy.yml` and can be run standalone. |

---

## CI workflow (`ci.yml`)

The CI workflow is split into parallel jobs:

1. **`changes`** — detects which parts of the repo changed using `dorny/paths-filter`.
2. **`lint`** — Node.js type check + ESLint (runs only when `frontend/` or the workflow changes).
3. **`test-backend`** — installs Python dependencies with `uv` and runs `pytest` (runs only when `backend/` or the workflow changes).
4. **`test-frontend`** — installs Node.js dependencies and runs `vitest` (runs only when `frontend/` or the workflow changes).
5. **`build`** — verifies the backend imports (`python -c "import app.main"`) and runs `npm run build` for the frontend. This job is gated by the path filter so frontend-only changes do not run backend build steps and vice versa.

### Path filters

- `frontend/**` changes run `lint`, `test-frontend`, and the frontend portion of `build`.
- `backend/**` changes run `test-backend` and the backend portion of `build`.
- Workflow changes run both frontend and backend jobs.

---

## Deploy workflow (`deploy.yml`)

Trigger: push to `master` or `main`.

The workflow runs two jobs in parallel:

### `deploy-frontend` (Vercel)

Uses `amondnet/vercel-action@v25` to deploy the `frontend/` directory. Required secrets:

- `VERCEL_TOKEN`
- `VERCEL_ORG_ID`
- `VERCEL_PROJECT_ID`

After deployment, the job performs an HTTP 200 check against the deployed Vercel preview/production URL.

### `deploy-backend` (Hugging Face Spaces)

Calls the reusable workflow `.github/workflows/sync-hf-space.yml`, which:

1. Checks out the repository.
2. Configures git credentials with `HF_TOKEN`.
3. Clones the HF Space identified by the `HF_SPACE_ID` repository variable.
4. Rsyncs `backend/` to the root of the Space.
5. Generates the HF Spaces README frontmatter.
6. Commits and pushes only if there are changes.
7. Polls the Space `/health` endpoint until it returns HTTP 200.

Required secrets/variables:

- `HF_TOKEN` (secret)
- `HF_SPACE_ID` (variable, e.g. `muneer320/bcd-backend`)

---

## Security scan workflow (`security-scan.yml`)

Triggers:

- Push to `master`/`main`
- Pull requests
- Weekly on Mondays at 09:00 UTC (`0 9 * * 1`)
- Manual dispatch

Jobs:

1. **`frontend-audit`** — `npm audit --audit-level=moderate`
2. **`backend-audit`** — `pip-audit --no-deps -r requirements.txt`
3. **`container-scan`** — builds both Docker images and scans them with Trivy for `CRITICAL` and `HIGH` severity vulnerabilities.

If a scan fails on a pull request, the workflow posts a comment with the report. Reports are also uploaded as artifacts.

---

## Required GitHub secrets and variables

Configure these in **Settings → Secrets and variables → Actions**:

| Name | Type | Used by |
|------|------|---------|
| `VERCEL_TOKEN` | Secret | `deploy.yml` |
| `VERCEL_ORG_ID` | Secret | `deploy.yml` |
| `VERCEL_PROJECT_ID` | Secret | `deploy.yml` |
| `HF_TOKEN` | Secret | `sync-hf-space.yml` |
| `HF_SPACE_ID` | Variable | `sync-hf-space.yml` |

---

## Manual deployment

### Frontend (Vercel)

Option A — Vercel CLI:

```bash
cd frontend
# Install Vercel CLI if you haven't already
npm i -g vercel

# Link project and deploy
vercel --prod
```

Option B — Git push:

Merging to `master`/`main` triggers `deploy.yml` automatically.

### Backend (Hugging Face Spaces)

Option A — Reusable workflow:

Go to **Actions → Sync backend → HF Space → Run workflow**.

Option B — Local git sync:

```bash
export HF_SPACE_ID="your-username/bcd-backend"
export HF_TOKEN="hf_..."

git clone "https://huggingface.co/spaces/${HF_SPACE_ID}" hf-space
rsync -av --delete --exclude='.git' backend/ hf-space/

# Recreate the HF Spaces README frontmatter
cat > hf-space/README.md << 'EOF'
---
title: BCD Backend
emoji: 🩺
colorFrom: indigo
colorTo: blue
sdk: docker
sdk_version: "1.0"
python_version: "3.11"
app_file: app/main.py
pinned: false
---

EOF
cat backend/README.md >> hf-space/README.md

cd hf-space
git add -A
git commit -m "manual deploy from $(git -C ../ rev-parse --short HEAD)"
git push "https://user:${HF_TOKEN}@huggingface.co/spaces/${HF_SPACE_ID}" main
```

Option C — Docker push (HF Spaces supports Docker SDK):

If you prefer building and pushing a container directly, build `backend/Dockerfile` and push it to the HF Space Docker registry using the token above.

---

## Rollback

- **Vercel:** use the Vercel dashboard to promote a previous deployment.
- **Hugging Face Spaces:** revert the latest commit in the Space repository and push; HF Spaces will rebuild the previous version.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| Vercel deploy fails with 401 | Missing or invalid `VERCEL_TOKEN` | Regenerate token at [vercel.com/account/tokens](https://vercel.com/account/tokens). |
| HF Space clone fails | `HF_TOKEN` lacks `write` access | Create a token with write permissions at [huggingface.co/settings/tokens](https://huggingface.co/settings/tokens). |
| HF Space `/health` check fails | Space still building or `app/main.py` crashing | Check the HF Space "Logs" tab and verify `requirements.txt` installs cleanly. |
| `pip-audit` fails | Known vulnerability in a pinned dependency | Review the report, bump the package, and re-run CI. |
| Frontend build fails | TypeScript or lint errors | Run `npm run build` locally before pushing. |

---

## Related documentation

- [frontend/README.md](frontend/README.md)
- [backend/README.md](backend/README.md)
- [backend/BACKEND_DOCS.md](backend/BACKEND_DOCS.md)
- [SECURITY.md](SECURITY.md)
