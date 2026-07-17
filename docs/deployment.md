# ChordCrew — Deployment & CI/CD Guide

## Current setup (solo developer)

### Deploy locally

```bash
npm run deploy   # build + firebase deploy → chordcrew.app
```

Requires `firebase-tools` installed and an active `firebase login` session. Uses your personal Firebase account — no secrets or CI involved.

### GitHub Actions

`.github/workflows/deploy.yml` exists but is **disabled** (trigger: `workflow_dispatch` only). It will not run on any push or merge until re-enabled. This is intentional while working solo.

### Branch strategy

| Branch | Purpose |
|--------|---------|
| `develop` | Active development — all day-to-day commits go here |
| `main` | Production-stable — only updated via PR at major milestones |

`main` is the branch Firebase Hosting deploys from (when CI is re-enabled). `develop` is the default GitHub branch.

---

## Re-enabling CI/CD (when adding collaborators)

Complete all of the following steps **before** re-enabling automatic deploys.

### Step 1 — Set the `FIREBASE_SERVICE_ACCOUNT` secret

1. Firebase Console → Project settings (gear icon) → **Service accounts**
2. Click **Generate new private key** → download the JSON file
3. GitHub repo → **Settings → Secrets and variables → Actions → New repository secret**
   - Name: `FIREBASE_SERVICE_ACCOUNT`
   - Value: paste the full JSON content

### Step 2 — Scope the service account to minimum permissions

The generated service account defaults to Editor. Downgrade it:

1. GCP Console → **IAM & Admin → IAM**
2. Find the service account (email ends in `@…gserviceaccount.com`)
3. Edit → change role to **Firebase Hosting Admin** only (`roles/firebasehosting.admin`)

This limits blast radius if the key is ever leaked — an attacker could only overwrite hosted files, not touch Firestore, Auth, or other Firebase services.

### Step 3 — Restore the push trigger in deploy.yml

```yaml
on:
  push:
    branches: [main]   # restore this line; remove workflow_dispatch line
```

### Step 4 — Protect the `main` branch

GitHub repo → **Settings → Branches → Add branch protection rule** for `main`:

- ✅ Require a pull request before merging
- ✅ Require at least 1 approval
- ✅ Do not allow bypassing the above settings (applies to admins too)
- ✅ Require status checks to pass (add the `deploy` job once it exists)

This ensures every deploy is preceded by a deliberate code review — no direct pushes to `main`.

### Step 5 (optional) — Add a GitHub Environment gate

For an explicit human approval step between merge and deploy:

1. GitHub repo → **Settings → Environments → New environment** → name: `production`
2. Add yourself (and any future collaborators) as **Required reviewers**
3. In `deploy.yml`, add to the deploy job:

```yaml
jobs:
  deploy:
    environment: production   # triggers approval gate before deploy runs
```

Useful once there are multiple contributors who can merge PRs.

---

## Security checklist

| Task | Status | Notes |
|------|--------|-------|
| Auto-deploy disabled on push | ✅ done | `workflow_dispatch` only in deploy.yml |
| `develop` branch as default | ✅ done | |
| `main` branch protection | ⬜ pending | Require PR + review before merge |
| `FIREBASE_SERVICE_ACCOUNT` secret set | ⬜ pending | Needed before re-enabling CI |
| Service account scoped to Hosting Admin only | ⬜ pending | Downgrade from Editor in GCP IAM |
| Dependabot alerts reviewed | ✅ done | Removed unused `jspdf`/`html2canvas`; 0 critical remaining |
| Dependabot version updates configured | ✅ done | `.github/dependabot.yml` — grouped weekly PRs |
| SECURITY.md added | ✅ done | GitHub-standard security policy |
| GitHub Environment approval gate | ⬜ optional | Add when collaborators join |

---

## Dependabot alerts

As of 2026-04-06 (after cleanup): **0 critical, 4 high, 12 moderate** on `develop`.

The 2 previous critical vulnerabilities were in `jspdf` — a dependency that was
never actually imported in the app (the print pages use `@media print` instead).
Both `jspdf` and `html2canvas` have been removed.

Remaining alerts are all in **transitive dev/build dependencies** with no
user-facing runtime exposure:

| Package | Severity | Via | Fix available? |
|---------|----------|-----|----------------|
| `serialize-javascript` | High | workbox-build ← vite-plugin-pwa | awaiting upstream |
| `undici` | High | @firebase/functions, @firebase/storage | awaiting Firebase SDK update |
| Firebase SDK packages | Moderate | undici | awaiting Firebase SDK update |
| `vite` / `esbuild` | Moderate | dev build chain | auto-fix applies patches |

```bash
npm audit          # see full report
npm audit fix      # auto-fix where possible (test after)
```

Do not run `npm audit fix --force` — it may introduce breaking changes.

---

*Last updated: 2026-04-06*
