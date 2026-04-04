# ChordCrew — Implementation Roadmap

*Status: `done` · `in-progress` · `next` · `planned` · `deferred`*
*Requirement IDs reference `docs/requirements.md`.*

---

## Phase 1 — Core (MVP) · *current*

### ✅ Completed

| Item | Req IDs | Notes |
|------|---------|-------|
| Project scaffold: React + TypeScript + Vite + Tailwind | ARCH-01–06 | |
| Dexie.js schema + AppSettings seed on first load | ARCH-01 | |
| Firebase init with graceful no-op when unconfigured | AUTH-02 | |
| Local-mode guest user (no Firebase needed) | AUTH-02–03 | |
| AppShell: sidebar nav + mobile top bar | — | |
| Song library: list, search, book filter, favorites | LIB-01–07 | |
| CodeMirror 6 editor + live split-pane preview | ED-01–06 | |
| Save song: persists to Dexie, extracts ChordPro metadata | ED-03 | |
| Song version history (last 3 per song) | ED-05 | |
| ChordPro renderer via chordsheetjs HtmlDivFormatter | RENDER-01–08 | |
| Viewer: transpose, lyrics-only, columns, font scale | VIEW-01–09 | |
| Performance mode: full-screen, wake lock, pedal nav | PERF-01–06 | |
| Setlists: list, create | SET-01–03 | |
| Import: chords.wiki library-backup v1 JSON (298 songs, 88 setlists) | IMP-01–04 | |
| Settings: language, columns, pedal keys, clear DB | SETTINGS-01–04 | |
| PWA: Workbox service worker, manifest | PWA-01–02, 04 | |
| i18n: English + German | I18N-01–04 | |
| Playwright test suite (26 tests, all passing) | — | |
| **Visual: Barlow Condensed renderer font** | RENDER-04 | |
| **Visual: Light yellow chord color (#fde68a)** | RENDER-01 | |
| **Visual: Section labels [A] [B] [C] via CSS counter** | RENDER-02 | |
| **Visual: Chorus vertical bar (anonymous + named)** | RENDER-03 | |
| **Visual: 𝄞 key and ♩ tempo in Viewer + Performance** | VIEW-08–09, PERF-06 | |
| **Section labels [A][B][C] on real songs (bracket + directive syntax)** | RENDER-02 | |
| **Chorus vertical bar on real songs (bracket + directive syntax)** | RENDER-03 | |
| **Transpose: key display "G → A" + first-3-chords preview** | VIEW-02 | |
| **Column count 1–5, orientation-based default (4 landscape, 2 portrait)** | VIEW-04, PERF | |
| **Performance mode: page-flip navigation (jumps full screen height)** | PERF-03–04 | |
| **SetlistDetailPage: ordered song list, click → viewer with setlist nav** | SET-04 | |
| **Sort songs: title / artist / last modified / recently accessed** | LIB-09 | |
| **Tag browser in Library sidebar + tag editing in Editor** | LIB-10, LIB-11 | |
| **{start_of_part:}/{sop:} section preprocessing** | RENDER-09 | |
| **Title/subtitle hidden in renderer (shown in toolbar only)** | RENDER-10 | |
| **Chord modifier superscript (Dsus4 → D+sup, D4 → D+sup 4, D(4) → D+sup 4)** | RENDER-11 | |
| **Chord-only line spacing: column-gap preserves spaces between chords** | RENDER-14 | |
| **Column separator lines** | RENDER-12 | |
| **Section badge: graphical box + repeat tracking (B²)** | RENDER-13 | |
| **Horizontal column-by-column page flip (no scrollbar)** | PERF-12 | |
| **Column navigation advances to next setlist song at end** | PERF-07 | |
| **Recently opened sort for Setlists** | — | |
| **Firebase Auth (Google Sign-In) + deployed to chordcrew-50c55.web.app** | AUTH-01 | |
| **Continuous scroll mode toggle in Settings** | SETTINGS-07 | |

### ✅ Phase 1 gaps — now complete

| Item | Req IDs | Notes |
|------|---------|-------|
| **PWA icons: `public/icons/icon-192.png` + `icon-512.png`** | PWA-03 | Generated from SVG via ImageMagick |
| **CI/CD: GitHub Actions → Firebase deploy on push to `main`** | — | `.github/workflows/deploy.yml`; requires `FIREBASE_SERVICE_ACCOUNT` + `VITE_FIREBASE_*` secrets in repo settings |

### 🔜 Remaining Phase 1 gap

| Item | Req IDs | Priority |
|------|---------|----------|
| Pinch-to-zoom on Viewer and Performance pages | VIEW-10, PERF-11 | medium |

---

## Phase 2 — Stage · *next up*

Focus: live performance features — setlist management, autoscroll, PDF, metronome.

| Item | Req IDs | Priority |
|------|---------|----------|
| **SetlistDetailPage: add songs, dividers, reorder, rename, delete** | SET-04–07 | ✅ done |
| **Per-setlist-slot overrides: transpose, columns, notes** | SET-08–10 | ✅ done |
| **Setlist present mode: full-screen, song counter, prev/next song buttons** | SET-13, PERF-09 | ✅ done |
| **Column navigation across setlist songs** | PERF-07 | ✅ done |
| **Long-press pedal: skip song / back to start** | PERF-08 | ✅ done |
| **Quick-jump tray (slide-out song list in present mode)** | PERF-10 | ✅ done |
| **PDF export: print pages with @media print CSS, single song + setlist** | PDF-01, 04–06 | ✅ done |
| **BPM tap-tempo in Editor + visual metronome in Performance** | — | ✅ done |
| Autoscroll with `{@mm:ss}` time-tag support | — | low |
| Annotations: text, highlight, symbol (private + shared) | — | low |
| **Song version history + one-tap restore (slide-over panel in Editor)** | ED-05 | ✅ done |
| **Chord validation: unknown chords highlighted orange in editor** | ED-07 | ✅ done |
| **Filter library by key (sidebar "Key" section)** | LIB-08 | ✅ done |
| **Tag browser + tag editing** | LIB-10–11 | ✅ done (Phase 1) |
| **Capo helper hint in viewer (Capo 2 → sounds in A)** | VIEW-11 | ✅ done |
| **Font scale persisted in settings (localStorage via useFontScale)** | SETTINGS-05 | ✅ done |
| **Setlist planned date/time field** | SET-11 | ✅ done |
| **`.cho` / `.chopro` / `.chordpro` single-file import** | IMP-05 | ✅ done |
| **Deduplication: skip existing titles on import (both importers)** | IMP-06 | ✅ done |

---

## Phase 3 — Collaboration · *in progress*

Focus: Firestore sync, teams, shared song/setlist spaces, edit presence.

### Sync & Auth

| Item | Req IDs | Priority |
|------|---------|----------|
| **Firestore manual sync with last-write-wins** | SYNC-01–02 | ✅ done |
| **Sync status badge (🟢🟡🔴)** | SYNC-03 | ✅ done |
| Edit presence banner ("⚠ Lisa is editing") | SYNC-04 | high — deferred |
| **Stage safety: present mode disables all sync** | SYNC-05 | ✅ done (sync is manual-only; no calls in PerformancePage) |

### Teams & shared spaces

| Item | Req IDs | Priority |
|------|---------|----------|
| **Team creation and management (name, description)** | TEAMS-01 | ✅ done |
| **Invite members by Google email; accept/decline flow** | TEAMS-04 | ✅ done |
| **Role system: Owner / Contributor / Reader** | TEAMS-03, 08–10 | ✅ done |
| **Remove members; change roles (Owner only)** | TEAMS-04 | ✅ done |
| **Team shared song library — scoped queries in Dexie + Firestore** | TEAMS-02, 05 | ✅ done |
| **Team shared setlists** | TEAMS-02, 05 | ✅ done (via sharedTeamId on setlists) |
| **Copy song to another book or team space** | TEAMS-06 | ✅ done |
| **Move song to another book or team space** | TEAMS-07 | ✅ done |
| **Reader role enforced in UI (no edit/delete buttons)** | TEAMS-08 | ✅ done |

### Other

| Item | Req IDs | Priority |
|------|---------|----------|
| ZIP bulk export | — | low |
| Share-link for single song snapshot | — | low |

---

## Phase 4 — Polish · *deferred*

| Item | Req IDs | Notes |
|------|---------|-------|
| Viewer role (read-only teammates) | — | |
| Published / locked books and setlists | — | |
| **Setlist duplication for recurring services** | SET-12 | ✅ done |
| Additional UI languages (beyond EN/DE) | — | |
| Chord diagram rendering for `{chord:}` / `{define:}` | — | Out of scope per spec |

---

## Technical Debt & Infrastructure

| Item | Priority | Notes |
|------|----------|-------|
| ~~Add `public/icons/icon-192.png` + `icon-512.png`~~ | ~~high~~ | ✅ Done — generated from SVG via ImageMagick |
| Expand Playwright suite with import-then-search flow | medium | Needs DB isolation per test |
| Add Playwright tests for Performance mode setlist nav | medium | Phase 2 feature |
| Review chordsheetjs version for paragraph separation fix | low | Named sections currently merge into one `.paragraph` |

---

## Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-03-29 | Renderer font: Barlow Condensed | Narrower letterforms → more lyrics per line on tablet |
| 2026-03-29 | Chord color: #fde68a (light yellow) | High contrast on dark stage backgrounds vs prior amber |
| 2026-03-29 | Section labels: CSS counter [A][B][C] | Musician convention for rehearsal ("go to letter B") |
| 2026-03-29 | Chorus bar: JS DOM post-process in SongRenderer | chordsheetjs doesn't add `.chorus` class on named sections |
| 2026-03-29 | Key/tempo: from `song.transcription`, not renderer | chordsheetjs HtmlDivFormatter strips all metadata directives |
| 2026-03-30 | Section badges: graphical bordered box with repeat superscript | Matches chords.wiki convention; makes repeated sections (A, B, B², C) instantly recognizable on stage |
| 2026-03-30 | Horizontal page-flip for multi-column | Eliminates accidental scroll; pedal/tap always advances exactly one column at a time |
| 2026-03-31 | Teams scoped to Phase 3 alongside Firestore sync | Teams require per-user cloud identity; building on top of Firebase Auth makes natural prerequisite chain |
| 2026-04-01 | Sync manual-only via SyncContext + firestoreSync.ts | Stage safety guaranteed by absence of sync calls in PerformancePage |
| 2026-04-01 | Team invite check queries all Firestore /teams docs | Simple approach; scales to small team counts; revisit with inviteIndex if needed |
| 2026-04-01 | Team books use `Book.sharedTeamId` in same Dexie table | Avoids separate team song table; role enforcement is at read/write layer |
| 2026-04-04 | `.column` uses `white-space: pre-wrap` not `pre` | `pre` prevented word-wrap; long lines overflowed column width on narrow screens |
| 2026-04-04 | `.row { break-inside: avoid }` | Prevents CSS column break from orphaning a chord above its lyric in the next column |
| 2026-04-04 | Arrow key nav added to ViewerPage (not just PerformancePage) | Users navigate with pedal in non-fullscreen viewer; same stride calculation as PerformancePage |
| 2026-04-04 | Setlist boundary feedback via toast, not disabled buttons | Disabled buttons gave no explanation; toast message communicates the boundary clearly |
| 2026-04-04 | `onSnapshot` in TeamDetailPage for real-time invite sync | Owner's Dexie otherwise stays stale after invitee accepts on their device |

*Last updated: 2026-04-04*
