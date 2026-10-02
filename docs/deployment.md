# ChordCrew — Deployment & CI/CD Guide

## Current setup (solo developer)

### Deploy locally

```bash
npm run deploy   # build + firebase deploy → chordcrew.app
```

Requires `firebase-tools` installed and an active `firebase login` session. Uses your personal Firebase account — no secrets or CI involved.

`npm run deploy` ships **hosting, Cloud Functions and Firestore** (`firestore.rules` + `firestore.indexes.json`, incl. the TTL policy on `shares.expiresAt`). The files in the repo are the single source of truth for what protects production data — never edit rules in the Firebase console; change `firestore.rules`, run `npm run test:firebase`, then deploy.

### GitHub Actions

**CI (`.github/workflows/ci.yml`)** runs on every pull request and on pushes to `develop`/`main` — no secrets, read-only token, GitHub-owned actions only. Three parallel jobs:

| Job | What it checks |
|---|---|
| Build, unit tests, audit | `npm run build`, functions build, committed `functions/lib` matches `functions/src`, `npm run test:unit`, `npm audit --omit=dev --audit-level=high` (root + functions) |
| Firestore rules & Cloud Functions | `npm run test:firebase` on the emulators (Java + firebase-tools installed in the job) |
| E2E | Playwright, `chromium` project (the WebKit/iPad and Android suites stay local) |

**Deploy (`.github/workflows/deploy.yml`)** exists but is **disabled** (trigger: `workflow_dispatch` only). It will not run on any push or merge until re-enabled. This is intentional while working solo.

### GitHub repository settings (one-time, in the web UI)

These can't be set from the repo files — do them once under **Settings**:

1. **Branch protection** — *Settings → Branches → Add rule* (or *Rules → Rulesets*), for `develop` **and** `main`:
   - ✅ Require a pull request before merging
   - ✅ Require status checks to pass → select **Build, unit tests, audit**, **Firestore rules & Cloud Functions (emulators)** and **E2E (Playwright, chromium)** (they appear in the list after CI has run once)
   - ✅ Block force pushes; ✅ Do not allow deletions
   - Approvals: solo, leave at 0 (you can't approve your own PRs); set to 1 once collaborators join
2. **Code scanning** — *Settings → Code security → Code scanning → CodeQL analysis → Set up → Default* (JavaScript/TypeScript + GitHub Actions).
3. **Secret scanning** — *Settings → Code security*: enable **Secret scanning** and **Push protection** (blocks pushes that contain API keys or service-account JSON).
4. **Private vulnerability reporting** — *Settings → Code security*: enable, so the link in `SECURITY.md` works.
5. **Dependabot** — *Settings → Code security*: **Dependabot alerts** and **Dependabot security updates** on. Version updates for `/`, `/functions` and GitHub Actions are configured in `.github/dependabot.yml`.

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
- ✅ Require status checks to pass (the three CI checks — see [GitHub repository settings](#github-repository-settings-one-time-in-the-web-ui))

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
| CI on every PR | ✅ done | `.github/workflows/ci.yml` — build, unit, audit, emulator security tests, E2E |
| Branch protection (`develop` + `main`, required CI checks) | ⬜ pending | See [GitHub repository settings](#github-repository-settings-one-time-in-the-web-ui) |
| CodeQL default setup, secret scanning + push protection, private vulnerability reporting | ⬜ pending | Same section — verify/enable in Settings → Code security |
| `FIREBASE_SERVICE_ACCOUNT` secret set | ⬜ pending | Needed before re-enabling CI |
| Service account scoped to Hosting Admin only | ⬜ pending | Downgrade from Editor in GCP IAM |
| Dependabot alerts reviewed | ✅ done | Removed unused `jspdf`/`html2canvas`; 0 critical remaining |
| Dependabot version updates configured | ✅ done | `.github/dependabot.yml` — grouped weekly PRs for `/`, `/functions` and GitHub Actions |
| SECURITY.md added | ✅ done | GitHub-standard security policy |
| GitHub Actions pinned to commit SHAs | ✅ done | `uses: owner/action@<sha> # vX.Y.Z` — a moved tag can't swap in other code; Dependabot updates the SHA and the comment |
| Security headers + CSP | ✅ done | `firebase.json` → `hosting.headers`, see [Security headers](#security-headers--content-security-policy) |
| App Check (reCAPTCHA Enterprise) | ⬜ in progress | Code ready; console setup + monitor → enforce, see [App Check](#app-check) |
| Firestore rules deployed from the repo | ✅ done | `npm run deploy` includes `firestore`; rules tested with `npm run test:firebase` |
| GitHub Environment approval gate | ⬜ optional | Add when collaborators join |

---

## Dependabot alerts

As of 2026-09-30: `npm audit` reports **0 vulnerabilities** in `/` and `/functions`.

History: the 2 former critical alerts were in `jspdf`, which was never imported
(the print pages use `@media print`); `jspdf` and `html2canvas` were removed.

Transitive fixes are pinned with `overrides` in the root `package.json`. Remove an
override once the parent package ships the fixed version itself:

| Override | Why | Parent |
|----------|-----|--------|
| `serialize-javascript` `^7.0.5` | High-severity advisory in the PWA build chain | workbox-build ← vite-plugin-pwa |
| `@grpc/grpc-js` `^1.14.5` | GHSA-m9gg-hp2v-232j, GHSA-f596-whhp-79r4; firebase pins `~1.9.0`, which has no patched release. Only the Node build of Firestore uses gRPC (tests, rules-unit-testing); the browser bundle uses WebChannel | @firebase/firestore ← firebase |

`functions/` needs no override: `npm audit fix` there picks up the patched
`@grpc/grpc-js` (via firebase-admin → google-gax).

```bash
npm audit          # see full report
npm audit fix      # auto-fix where possible (test after)
```

Do not run `npm audit fix --force` — it may introduce breaking changes.

---

*Last updated: 2026-09-30*
