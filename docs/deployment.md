# ChordCrew — Deployment & CI/CD Guide

## Current setup (solo developer)

### Deploy locally

```bash
npm run deploy   # build + firebase deploy → chordcrew.app
```

Requires `firebase-tools` installed and an active `firebase login` session. Uses your personal Firebase account — no secrets or CI involved.

`npm run deploy` ships **hosting, Cloud Functions and Firestore** (`firestore.rules` + `firestore.indexes.json`, incl. the TTL policy on `shares.expiresAt`). The files in the repo are the single source of truth for what protects production data — never edit rules in the Firebase console; change `firestore.rules`, run `npm run test:firebase`, then deploy.

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

## Security headers & Content-Security-Policy

`firebase.json` → `hosting.headers` sets, for every response:

| Header | Purpose |
|---|---|
| `X-Content-Type-Options: nosniff` | Browsers must not guess content types |
| `Referrer-Policy: strict-origin-when-cross-origin` | No full URLs (song/setlist IDs) leak to other sites |
| `Strict-Transport-Security` | HTTPS only for a year |
| `Permissions-Policy` | Camera, microphone, location, payment, USB off (screen wake lock stays allowed) |

and for all app pages (everything except Firebase's reserved `/__/*` paths, which serve the sign-in helper pages):

| Header | Purpose |
|---|---|
| `Content-Security-Policy` | Only the app's own code runs; external sources are limited to what the app uses (see below). Blocks injected scripts even if some other bug lets markup through |
| `X-Frame-Options: DENY` (+ `frame-ancestors 'none'`) | ChordCrew can't be embedded in another site (clickjacking) |

**Allowed external origins** — each one exists for a reason:

| Directive | Origin | Why |
|---|---|---|
| `script-src` | `apis.google.com` | Firebase Auth helper for Google sign-in |
| `script-src`, `frame-src`, `connect-src` | `www.google.com/recaptcha/`, `www.gstatic.com/recaptcha/`, `recaptcha.google.com/recaptcha/` | App Check (reCAPTCHA Enterprise) |
| `style-src`, `font-src` | `fonts.googleapis.com`, `fonts.gstatic.com` | Outfit / JetBrains Mono web fonts |
| `img-src` | `*.googleusercontent.com` | Google profile pictures |
| `connect-src` | `*.googleapis.com` | Firestore, Auth, App Check, Installations |
| `connect-src` | `*.cloudfunctions.net` | Callable functions (team invites) |
| `frame-src` | `*.firebaseapp.com` | Sign-in helper iframe when the auth domain differs from the page |

`style-src` allows `'unsafe-inline'` because the editor (CodeMirror) injects its styles at runtime; scripts never get an inline or `eval` exception.

**Adding a new external service** (e.g. an analytics or lyrics API): add its origin to the matching directive, then verify as below. The Vite dev server sends no CSP, so a missing origin only shows up in production.

**Verify before deploying** a CSP change: `npm run build`, then `firebase emulators:start --only hosting` serves `dist/` with these headers on http://127.0.0.1:5000 — click through the app and watch the browser console for `Refused to …` messages. After deploying, sign in once and run a sync (Google sign-in and Firestore can't be exercised against the emulator).

**Rollback:** delete the `Content-Security-Policy` entry from `firebase.json` and `npm run deploy`.

## App Check

[Firebase App Check](https://firebase.google.com/docs/app-check) makes Firestore and the Cloud Functions accept requests only from the real ChordCrew web app — not from scripts that reuse the (public) Firebase config. The browser proves itself with an invisible reCAPTCHA Enterprise check; no user interaction.

The code is in place (`src/firebase/index.ts`, `functions/src/appCheck.ts`) and inactive until a site key is configured. Roll it out in two phases so nothing breaks:

### Phase 1 — Monitor

1. **Create a reCAPTCHA Enterprise key** — Google Cloud Console, project `chordcrew-50c55` → *Security → reCAPTCHA* → enable the API if asked → *Create key*:
   - Platform: **Website**; domains: `chordcrew.app`, `www.chordcrew.app`, `chordcrew-50c55.web.app`, `chordcrew-50c55.firebaseapp.com`
   - Leave "Use checkbox challenge" **off** (score-based)
2. **Register the app** — Firebase Console → *App Check* → *Apps* → the web app → *reCAPTCHA Enterprise* → paste the **site key** → Save.
3. **Configure the build** — add `VITE_APPCHECK_SITE_KEY=<site key>` to `.env.local` (and the `VITE_APPCHECK_SITE_KEY` repo secret once CI deploys). The site key is public; it is not a secret.
4. `npm run deploy`, then open the app and run a sync once.
5. **Watch the metrics** — Firebase Console → *App Check* → *APIs*: Cloud Firestore and Cloud Functions show *verified* vs. *unverified* requests. Give it a few days of normal use.

Nothing is blocked in this phase, except requests carrying an **invalid** App Check token.

### Phase 2 — Enforce

When (almost) all requests show as verified:

1. **Firestore** — Firebase Console → *App Check* → *APIs* → *Cloud Firestore* → **Enforce**.
2. **Cloud Functions** — set `ENFORCE_APP_CHECK=true` in `functions/.env`, commit, `npm run deploy`.

Rollback: un-enforce Firestore in the console / set `ENFORCE_APP_CHECK=false` and redeploy.

### Local development

reCAPTCHA can't attest `localhost`. With a site key in `.env.local`, `npm run dev` prints an **App Check debug token** in the browser console on first load. Register it under *App Check → Apps → ⋮ → Manage debug tokens* and put it in `.env.local` as `VITE_APPCHECK_DEBUG_TOKEN` so it stays stable. Never register debug tokens you didn't create yourself — each one bypasses App Check. Without a site key, local dev and all tests run without App Check, as before.

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
| Security headers + CSP | ✅ done | `firebase.json` → `hosting.headers`, see [Security headers](#security-headers--content-security-policy) |
| App Check (reCAPTCHA Enterprise) | ⬜ in progress | Code ready; console setup + monitor → enforce, see [App Check](#app-check) |
| Firestore rules deployed from the repo | ✅ done | `npm run deploy` includes `firestore`; rules tested with `npm run test:firebase` |
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
