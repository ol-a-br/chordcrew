# Security Policy

## Supported versions

ChordCrew is a single-branch, continuously-deployed project. Only the latest
release (the most recent commit on `main`) receives security fixes.

| Branch    | Supported |
|-----------|-----------|
| `main`    | ✅ yes    |
| `develop` | ⬜ pre-release — fixes land here first |
| older tags | ❌ no   |

## Reporting a vulnerability

**Please do not report security issues in public GitHub Issues.**

Send a description of the vulnerability to the maintainer via
[GitHub private vulnerability reporting](https://github.com/ol-a-br/chordcrew/security/advisories/new).

Include:
- Description of the vulnerability and potential impact
- Steps to reproduce or a proof-of-concept
- Affected versions/components
- Any suggested fix or mitigation, if known

You can expect:
- **Acknowledgement** within 3 business days
- **Status update** within 10 business days (confirmed / not applicable / fix in progress)
- Credit in the changelog or release notes if you would like it

If GitHub's advisory form is unavailable, open a
[GitHub Security Advisory draft](https://github.com/ol-a-br/chordcrew/security/advisories)
directly.

## Scope

ChordCrew is a **client-side Progressive Web App** backed by Firebase. Its only
server-side code is a small set of Cloud Functions in `functions/`: the
ChurchTools proxy (`ctProxy`) and the team-invite callables
(`listMyInvites`, `previewInvite`, `acceptInvite`, `declineInvite`).

| Component | In scope |
|-----------|----------|
| Source code in this repository | ✅ |
| Runtime JS delivered to end users (`npm run build` output) | ✅ |
| Firebase configuration / Firestore security rules | ✅ |
| Cloud Functions in `functions/` | ✅ |
| Third-party npm dependencies (direct) | ✅ report so we can upgrade |
| Transitive / dev-only build dependencies | ⬜ low priority; no user exposure |
| Firebase infrastructure (Google-managed) | ❌ report to Google |

The highest-impact vulnerability classes are:

- **Client-side XSS** — particularly via ChordPro content rendered with
  `dangerouslySetInnerHTML`. Song content is untrusted (share links, team songs,
  imports) and chordsheetjs does not escape it, so `renderToHtml()` passes all
  output through a DOMPurify allow-list (`sanitizeSongHtml()` in `src/utils/chordpro.ts`)
- **Firestore rules misconfiguration** — data exposure between users or teams
- **Cloud Function abuse** — e.g. using `ctProxy` as a relay, or bypassing
  invite checks
- **Dependency supply-chain** — malicious packages in the npm graph

## Security hardening already in place

- Firestore rules live in `firestore.rules`, are deployed by `npm run deploy`
  and tested on the emulators (`npm run test:firebase`). Team access is
  enforced by membership and role, not only in the UI
- Team invites are accepted only through Cloud Functions that verify the
  token or the caller's verified e-mail server-side
- `ctProxy` accepts only signed-in app users (Firebase ID token) and HTTPS
  `*.church.tools` targets, and sends no CORS headers (same-origin only)
- Security headers and a Content-Security-Policy on Firebase Hosting (no
  inline scripts, no eval)
- Firebase App Check (reCAPTCHA Enterprise) — rolled out monitor-then-enforce
- CI on every pull request: build, unit tests, `npm audit`, rules and
  functions tests, E2E; GitHub Actions are pinned to commit SHAs
- Auto-deploy to production is **disabled** (`workflow_dispatch` only); all
  deploys are intentional manual actions
- Still pending (see `docs/deployment.md`): `main` branch protection,
  verifying CodeQL / secret scanning in the repository settings, and scoping
  the Firebase service account to **Hosting Admin only** before CI/CD is
  re-enabled

## Dependency update policy

Dependabot opens grouped pull requests weekly for direct dependencies.
Transitive-only vulnerabilities in dev/build tools (workbox, rollup, esbuild)
are tracked but treated as low priority because they have no user-facing
runtime exposure.

Critical and high vulnerabilities in **runtime** direct dependencies are
treated as release blockers.
