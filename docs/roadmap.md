# ChordCrew — Implementation Roadmap

*Status: `done` · `in-progress` · `next` · `planned` · `deferred`*
*Requirement IDs reference `docs/requirements.md`.*

---

## Phase 1 — Core (MVP) · *complete*

### ✅ Completed

| Item | Req IDs | Notes |
|------|---------|-------|
| Project scaffold: React + TypeScript + Vite + Tailwind | ARCH-01–06 | |
| Dexie.js schema + AppSettings seed on first load | ARCH-01 | |
| Firebase init with graceful no-op when unconfigured | AUTH-02 | |
| Local-mode guest user (no Firebase needed) | AUTH-02–03 | |
| AppShell: sidebar nav + mobile top bar | — | |
| Song library: list, search, book filter, favorites | LIB-01–07 | |
| CodeMirror 6 editor + live split-pane preview | ED-01–02 | |
| Auto-save with 1 s debounce; version throttle 5 min | ED-03–04 | Replaces explicit Save button |
| Song version history (last 3 per song) + slide-over restore panel | ED-04–05 | |
| ChordPro renderer via chordsheetjs HtmlDivFormatter | RENDER-01–08 | |
| Viewer: transpose, lyrics-only, columns (1–5), font scale | VIEW-01–09 | |
| Performance mode: full-screen, wake lock, pedal nav | PERF-01–06 | |
| Setlists: list, create | SET-01–03 | |
| Import: chords.wiki library-backup v1 JSON | IMP-01–04 | |
| Settings: language, columns, pedal keys, clear DB | SETTINGS-01–04 | |
| PWA: Workbox service worker, manifest | PWA-01–02, 04 | |
| i18n: English + German | I18N-01–04 | |
| Playwright test suite (27 tests, all passing) | — | |
| **Visual: Barlow Condensed renderer font** | RENDER-04 | |
| **Visual: Light yellow chord color (#fde68a)** | RENDER-01 | |
| **Visual: Section labels [A] [B] [C] via JS DOM injection** | RENDER-02 | |
| **Visual: Chorus vertical bar (anonymous + named)** | RENDER-03 | |
| **Visual: 𝄞 key and ♩ tempo in Viewer + Performance** | VIEW-08–09, PERF-06 | |
| **Section labels [A][B][C] on real songs (bracket + directive syntax)** | RENDER-02 | |
| **Chorus vertical bar on real songs** | RENDER-03 | |
| **Transpose: key display "G → A" + first-3-chords preview** | VIEW-02 | |
| **Column count 1–5, orientation-based default** | VIEW-04, SETTINGS-06 | |
| **Performance mode: horizontal page-flip column navigation** | PERF-03–04, PERF-12 | |
| **SetlistDetailPage: ordered song list, click → viewer with setlist nav** | SET-04 | |
| **Sort songs: title / artist / last modified / recently accessed** | LIB-09 | |
| **Tag browser in Library sidebar + tag editing in Editor** | LIB-10–11 | |
| **`{start_of_part:}`/`{sop:}` section preprocessing** | RENDER-09 | |
| **Title hidden in renderer (shown in toolbar only)** | RENDER-10 | |
| **Chord modifier superscript** | RENDER-11 | |
| **Column separator lines** | RENDER-12 | |
| **Section badge: graphical box + repeat tracking (B²)** | RENDER-13 | |
| **Column navigation advances to next setlist song at end** | PERF-07 | |
| **Firebase Auth (Google Sign-In) + deployed to chordcrew.app** | AUTH-01 | |
| **Continuous scroll mode toggle in Settings** | SETTINGS-07 | |
| **PWA icons: `public/icons/icon-192.png` + `icon-512.png`** | PWA-03 | Generated from SVG via ImageMagick |
| **CI/CD: GitHub Actions → Firebase deploy on push to `main`** | — | `.github/workflows/deploy.yml` |
| **Mid-word chord spacing fix (negative margin-left)** | RENDER-14 | Cancels flex gap for intra-word chord positions |
| **`{start_of_verse}` without label preprocessed → `{start_of_verse: Verse}`** | RENDER-09 | |
| **Chord quality modifiers extended: sus, m11, maj11, m6, m13, 7sus4/2** | RENDER-11 | |
| **Word-group wrapping: mid-word chord columns wrapped in `display:inline-flex` to prevent line breaks** | RENDER-16 | "Kni[Am]en" stays on one line; DOM post-processing groups word-parts |
| **Edit button in Performance mode toolbar (pencil icon, navigates to `/editor/{id}`)** | PERF-13 | Placed between X close button and song title, same position as Viewer |
| **Keyboard / pedal navigation does not reveal the controls overlay (`noHide=true`)** | PERF-14 | Arrow keys advance song without breaking stage flow |
| **Adjacent-song prewarm: delay 300ms → 100ms; `setTimeout(0)` replaces `requestIdleCallback`** | PERF-15 | Warm cache before user can swipe, especially on Android under wake lock |
| **`lastNavTime` reset at render completion (not just at navigation start)** | PERF-16 | Prevents queued touchEnd from slipping through 800ms cooldown after main-thread-blocking parse |
| **Playwright suite expanded: iPad project (WebKit), touch-ux.spec.ts (TUX-1–8)** | — | 137 tests across chromium · android-tablet · ipad; CDP-only tests skip on WebKit |

### 🔜 Remaining Phase 1 gap

| Item | Req IDs | Priority |
|------|---------|----------|
| Pinch-to-zoom on Viewer and Performance pages | VIEW-10, PERF-11 | medium |
| Swipe-gesture navigation tests for iPad / WebKit (blocked: no CDP on WebKit) | — | low |

---

## Phase 2 — Stage · *complete*

Focus: live performance features — setlist management, autoscroll, PDF, metronome.

| Item | Req IDs | Notes |
|------|---------|-------|
| **SetlistDetailPage: add songs, dividers, reorder, rename, delete** | SET-04–07 | ✅ done |
| **Per-setlist-slot overrides: transpose, columns, notes** | SET-08–10 | ✅ done |
| **Setlist present mode: full-screen, song counter, prev/next song buttons** | SET-13, PERF-09 | ✅ done |
| **Column navigation across setlist songs** | PERF-07 | ✅ done |
| **Long-press pedal: skip song / back to start** | PERF-08 | ✅ done |
| **Quick-jump tray (slide-out song list in present mode)** | PERF-10 | ✅ done |
| **PDF export: `@media print` CSS, single song + setlist** | PDF-01–06 | ✅ done |
| **BPM tap-tempo in Editor** | ED-08 | ✅ done |
| **Song version history + one-tap restore (slide-over panel in Editor)** | ED-04–05 | ✅ done |
| **Chord validation: unknown chords highlighted in editor** | ED-07 | ✅ done |
| **Filter library by key (sidebar "Key" section)** | LIB-08 | ✅ done |
| **Capo helper hint in Viewer (Capo 2 → sounds in A)** | VIEW-11 | ✅ done |
| **Font scale persisted in settings** | SETTINGS-05 | ✅ done |
| **Setlist planned date/time field** | SET-11 | ✅ done |
| **Setlist duplication** | SET-12 | ✅ done |
| **`.cho` / `.chopro` / `.chordpro` single-file import** | IMP-05 | ✅ done |
| **Key transpose dropdown: click key badge → 12-key picker with chord previews** | VIEW-02 | ✅ done |

---

## Phase 3 — Collaboration · *complete*

Focus: Firestore sync, teams, shared song/setlist spaces.

### Sync & Auth

| Item | Req IDs | Notes |
|------|---------|-------|
| **Firestore manual sync with last-write-wins** | SYNC-01–02 | ✅ done |
| **Sync status badge (🟢🟡🔴⬜)** | SYNC-03 | ✅ done |
| **Cloud update polling every 5 min (3-read Firestore check)** | SYNC-04 | ✅ done |
| **Online/offline detection; badge shows "Offline" when disconnected** | SYNC-05 | ✅ done |
| Edit presence banner ("⚠ Lisa is editing") | SYNC-06 | deferred |
| **Stage safety: present mode disables all sync** | SYNC-07 | ✅ done |

### Teams & shared spaces

| Item | Req IDs | Notes |
|------|---------|-------|
| **Team creation and management (name, description)** | TEAMS-01 | ✅ done |
| **Invite members by Google email; accept/decline flow** | TEAMS-04 | ✅ done |
| **Role system: Owner / Contributor / Reader** | TEAMS-03, 08–10 | ✅ done |
| **Remove members; change roles (Owner only)** | TEAMS-04 | ✅ done |
| **Team shared song library — scoped queries in Dexie + Firestore** | TEAMS-02, 05 | ✅ done |
| **Team shared setlists** | TEAMS-02, 05 | ✅ done |
| **Copy / Move song to another book or team space** | TEAMS-06–07 | ✅ done |
| **Reader role enforced in UI** | TEAMS-08 | ✅ done |
| **Bulk song sharing: select-mode with Copy/Move all to team** | TEAMS-06–07 | ✅ done |
| **Team setlists sidebar in SetlistsPage** | TEAMS-02, 05 | ✅ done |

---

## Phase 4 — Import / Export / Metadata · *complete*

Focus: richer song metadata, multiple import sources, library backup/restore.

| Item | Req IDs | Notes |
|------|---------|-------|
| **Export full library as chords.wiki-compatible JSON** | IMP-08 | ✅ done — downloads all books, songs, setlists with metadata |
| **OpenSong XML importer** | IMP-07 | ✅ done — positional chord alignment, section types, CCLI/copyright |
| **OpenSong inline metadata detection** | IMP-09 | ✅ done — parses `Key - C \| Tempo - 77` and German `Tonart - E \| Taktart` from lyrics |
| **Import duplicate resolution: Skip or Overwrite** | IMP-06 | ✅ done — two-phase scan → conflict UI → batch choice |
| **Song attribution metadata: CCLI, copyright, URL** | ED-10, VIEW-12 | ✅ done — stored as `{ccli:}` `{copyright:}` `{url:}` directives |
| **CCLI SongSelect link + external URL link in Viewer** | VIEW-12 | ✅ done — icon buttons appear when fields are populated |
| **Editor metadata rows collapsed by default** | ED-09 | ✅ done — rows 2+3 hidden; amber dot indicates hidden content |
| **Non-chord instruction text in chord position** | RENDER-15 | ✅ done — "(To Bridge)" rendered italic/muted, not yellow/bold |

---

## Phase 5 — Polish & Tools · *complete*

| Item | Req IDs | Notes |
|------|---------|-------|
| **Parse error display: line number + "Fix →" jump in editor** | TOOLS-01 | ✅ done — `lintChordPro()` in chordpro.ts; error panel in SongRenderer; `forwardRef`/`jumpToLine` in ChordProEditor |
| **Create new songbook: inline "+" form in Library sidebar** | TOOLS-02 | ✅ done |
| **Curation page: Duplicates tab (Jaccard similarity)** | TOOLS-03 | ✅ done |
| **Curation page: Parse Errors tab (all songs scan)** | TOOLS-04 | ✅ done |
| **Curation page: Export CSV (all song metadata)** | TOOLS-05 | ✅ done |
| **Help page: Getting Started, ChordPro, import guides, pedal, teams, sync, troubleshooting** | TOOLS-06 | ✅ done |

---

## Phase 6 — Remaining · *next*

| Item | Req IDs | Priority |
|------|---------|----------|
| Pinch-to-zoom on Viewer and Performance pages | VIEW-10, PERF-11 | medium |
| BPM range filter in Library sidebar | LIB-08 | low |
| Autoscroll with `{@mm:ss}` time-tag support | — | low |
| Annotations: text, highlight, symbol (private + shared) | — | low |
| ZIP bulk export | — | low |
| Share-link for single song snapshot | — | low |
| System share sheet for PDF (AirDrop, email) | PDF-07 | deferred |
| Edit presence banner | SYNC-06 | deferred |
| Additional UI languages (beyond EN/DE) | — | |
| Chord diagram rendering for `{chord:}` / `{define:}` | — | Out of scope per spec |

---

## Collaboration & Security · *pending*

To be completed before onboarding any additional contributors. Full details and instructions in `docs/deployment.md`.

| Item | Priority | Status | Notes |
|------|----------|--------|-------|
| Set `develop` as default GitHub branch | high | ✅ done | |
| Remove unused deps with critical CVEs (`jspdf`, `html2canvas`) | high | ✅ done | 0 critical remaining |
| Add `SECURITY.md` with vulnerability reporting policy | high | ✅ done | GitHub-standard security policy |
| Configure Dependabot version updates | medium | ✅ done | `.github/dependabot.yml` — grouped weekly PRs |
| Add `main` branch protection rule | high | ⬜ pending | Require PR + 1 review; block direct push; no admin bypass |
| Set `FIREBASE_SERVICE_ACCOUNT` GitHub secret | high | ⬜ pending | Required before re-enabling CI deploy |
| Scope Firebase service account to Hosting Admin only | high | ⬜ pending | GCP IAM → downgrade from Editor to `roles/firebasehosting.admin` |
| Re-enable CI deploy trigger on `main` | medium | ⬜ pending | Restore `on: push: branches: [main]` in deploy.yml |
| Add GitHub Environment approval gate for deploy | low | ⬜ optional | Useful once multiple contributors can merge PRs |

## Technical Debt & Infrastructure

| Item | Priority | Notes |
|------|----------|-------|
| Expand Playwright suite with import-then-search flow | medium | Needs DB isolation per test |
| ~~Add Playwright tests for Performance mode setlist nav~~ | ~~medium~~ | ✅ done — `performance-navigation.spec.ts` (PERF-1–8) + `touch-ux.spec.ts` (TUX-1–8) |
| ~~Add iPad / WebKit project to Playwright~~ | ~~medium~~ | ✅ done — `ipad` project (WebKit, 834×1194) runs all non-CDP tests |
| Review chordsheetjs version for paragraph separation fix | low | Named sections currently merge into one `.paragraph` |
| Swipe-gesture tests for WebKit/iPad | low | Playwright CDP touch injection only works on Chromium; need alternative (mouse drag or webkit-specific API) |

---

## Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-03-29 | Renderer font: Barlow Condensed | Narrower letterforms → more lyrics per line on tablet |
| 2026-03-29 | Chord color: #fde68a (light yellow) | High contrast on dark stage backgrounds vs prior amber |
| 2026-03-29 | Section labels: JS DOM injection [A][B][C] | Musician convention for rehearsal ("go to letter B") |
| 2026-03-29 | Chorus bar: JS DOM post-process in SongRenderer | chordsheetjs doesn't add `.chorus` class on named sections |
| 2026-03-29 | Key/tempo from `song.transcription`, not renderer | chordsheetjs HtmlDivFormatter strips all metadata directives |
| 2026-03-30 | Section badges: graphical bordered box with repeat superscript | Matches chords.wiki convention; repeated sections (A, B, B², C) instantly recognizable on stage |
| 2026-03-30 | Horizontal page-flip for multi-column | Eliminates accidental scroll; pedal always advances exactly one column |
| 2026-03-31 | Teams scoped to Phase 3 alongside Firestore sync | Teams require per-user cloud identity; natural prerequisite chain |
| 2026-04-01 | Sync manual-only via SyncContext + firestoreSync.ts | Stage safety guaranteed by absence of sync calls in PerformancePage |
| 2026-04-01 | Team invite check queries all Firestore /teams docs | Simple approach; revisit with inviteIndex if team count grows |
| 2026-04-01 | Team books use `Book.sharedTeamId` in same Dexie table | Avoids separate team song table; role enforcement at read/write layer |
| 2026-04-04 | `.column` uses `white-space: pre-wrap` not `pre` | `pre` prevented word-wrap; long lines overflowed column width on narrow screens |
| 2026-04-04 | `.row { break-inside: avoid }` | Prevents CSS column break from orphaning a chord above its lyric |
| 2026-04-04 | Arrow key nav in ViewerPage (not just PerformancePage) | Users navigate with pedal in non-fullscreen viewer |
| 2026-04-04 | Setlist boundary feedback via toast | Disabled buttons gave no explanation; toast communicates the boundary |
| 2026-04-04 | `onSnapshot` in TeamDetailPage for real-time invite sync | Owner's Dexie stays stale after invitee accepts on their device |
| 2026-04-04 | Bulk song sharing via select-mode in LibraryPage | One-by-one share too slow for 50+ songs; select-mode enables `bulkAdd` + `bulkMove` |
| 2026-04-04 | Key badge opens 12-key transpose picker with chord previews | Jump to target key directly without stepping through semitones |
| 2026-04-05 | CCLI/copyright/URL stored as ChordPro directives, not Song fields | Consistent with existing metadata pattern; no schema migration; content is the source of truth |
| 2026-04-05 | Cloud update poll uses 3-read `where('updatedAt', '>', lastSync)` check | Lightweight — 3 Firestore reads per 5-min interval; does not pull data until user triggers Sync Now |
| 2026-04-05 | OpenSong inline metadata extracted before lyrics conversion | Many files omit XML key/tempo tags and embed them as the first "chord line"; extract once and skip during rendering pass |
| 2026-04-05 | Duplicate resolution is batch-level (skip all / overwrite all) | Per-song choice creates too much friction for 100+ file imports; batch decision covers most real-world scenarios |
| 2026-04-05 | Non-chord chord-position text → `.chord-annotation` (italic/muted) | Keeps the ChordPro content unchanged; renderer detects and re-styles non-chord tokens post-render |
| 2026-04-05 | Editor extra metadata rows collapsed by default | Keeps the editor clean for everyday editing; amber dot signals when attribution fields hold data |
| 2026-04-06 | `lintChordPro` in chordpro.ts, error panel in SongRenderer | Per-line brace/bracket check; "Fix →" jumps editor via `forwardRef`/`jumpToLine` on ChordProEditor |
| 2026-04-06 | Jaccard word similarity for duplicate detection (0.75 threshold) | Catches "Amazing Grace" vs "Amazing Grace (Key of G)" without false positives on short common words |
| 2026-04-06 | CSV export (no external dependency) | Browser-native Blob download; avoids adding xlsx library to bundle |
| 2026-04-06 | `develop` branch for active work; `main` for milestone releases | Keeps CI deploy silent during solo development; easy to reverse |
| 2026-04-06 | CI auto-deploy disabled (workflow_dispatch only) | No `FIREBASE_SERVICE_ACCOUNT` secret needed until collaborators join; deploy locally via `npm run deploy` |
| 2026-04-08 | Word-group wrapping replaces negative-margin-only fix | Negative margin cancelled the visual gap but `flex-wrap: wrap` on `.row` could still split "Kni"/"en" onto separate lines; inline-flex wrapper with `flex-wrap: nowrap` prevents this |
| 2026-04-08 | Edit button added to Performance mode toolbar | Musicians often correct lyrics during rehearsal; jumping to the editor from present mode avoids navigating through the library |
| 2026-04-08 | `goNext(true)` / `goPrev(true)` for keyboard/pedal nav in Performance mode | Pedal press should advance the song silently; revealing the toolbar interrupts the band flow |
| 2026-04-08 | `prewarmSongCache` switched from `requestIdleCallback` to `setTimeout(0)` | Under Android wake lock the browser never reaches idle state, so `requestIdleCallback` with a 2 s timeout could defer prewarming until right before the user swipes |
| 2026-04-08 | `lastNavTime` stamped at render completion, not at `navigate()` call | ChordSheetJS parse blocks the main thread for ~800 ms; a queued touchEnd fires right as `navPending` clears, hitting the edge of NAV_COOLDOWN_MS=800; reset from render-done gives a fresh 800 ms window |
| 2026-04-09 | iPad Pro 11 project added to Playwright (WebKit, 834×1194) | All 8 TUX tests pass on WebKit; CDP-dependent swipe tests skip gracefully; establishes baseline for Safari-specific regressions |
| 2026-04-09 | `touch-ux.spec.ts` tests all three projects (chromium · android-tablet · ipad) | Separates standard Playwright API tests (TUX) from CDP-only swipe tests (PERF); enables WebKit coverage without breaking existing test infra |

*Last updated: 2026-04-09*
