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

ChordCrew is a **client-side Progressive Web App** with no server component.

| Component | In scope |
|-----------|----------|
| Source code in this repository | ✅ |
| Runtime JS delivered to end users (`npm run build` output) | ✅ |
| Firebase configuration / Firestore security rules | ✅ |
| Third-party npm dependencies (direct) | ✅ report so we can upgrade |
| Transitive / dev-only build dependencies | ⬜ low priority; no user exposure |
| Firebase infrastructure (Google-managed) | ❌ report to Google |

Because the app has no custom backend, the highest-impact vulnerability classes are:

- **Client-side XSS** — particularly via ChordPro content rendered with
  `dangerouslySetInnerHTML` (mitigated: content is user-supplied and never
  stored cross-user; SongRenderer output passes through chordsheetjs, not raw HTML)
- **Firestore rules misconfiguration** — data exposure between users or teams
- **Dependency supply-chain** — malicious packages in the npm graph

## Security hardening already in place

- Auto-deploy to production is **disabled** (`workflow_dispatch` only); all
  deploys are intentional manual actions
- `main` branch protection is pending (see `docs/deployment.md`)
- Firebase service account will be scoped to **Hosting Admin only** before
  CI/CD is re-enabled (no Firestore / Auth access)
- Dependabot version updates and CodeQL analysis are enabled

## Dependency update policy

Dependabot opens grouped pull requests weekly for direct dependencies.
Transitive-only vulnerabilities in dev/build tools (workbox, rollup, esbuild)
are tracked but treated as low priority because they have no user-facing
runtime exposure.

Critical and high vulnerabilities in **runtime** direct dependencies are
treated as release blockers.
