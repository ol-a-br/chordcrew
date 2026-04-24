# ChordCrew — Claude Code Guide

## What this project is

ChordCrew is an open-source worship-team chord & lyrics PWA. Worship bands use it to manage ChordPro songs and setlists — online and offline.

Repo: https://github.com/ol-a-br/chordcrew

## Commands

```bash
npm run dev       # dev server → localhost:5173
npm run build     # TypeScript check + Vite build
npm run preview   # preview production build
npm run deploy    # build + firebase deploy (needs firebase-tools + login)
npm test          # Playwright E2E tests
npm run test:ui   # Playwright interactive UI
```

## Key documents

- `docs/requirements.md` — requirements spec with implementation status (REQ-IDs)
- `docs/roadmap.md` — phased implementation plan with decision log
- `docs/deployment.md` — CI/CD setup, branch strategy, security checklist, Dependabot notes
- `data/chords_wiki_library_export_20260329.json` — real export (4 books, 298 songs, 88 setlists)

## Branch strategy

- **`develop`** — active development; all commits go here (default branch)
- **`main`** — production-stable; updated via PR at major milestones only; triggers Firebase deploy when CI is re-enabled

Auto-deploy is currently **disabled** (workflow_dispatch only). Deploy manually with `npm run deploy`. See `docs/deployment.md` for the full checklist to re-enable CI/CD safely when adding collaborators.

## Architecture

**Offline-first**: Dexie.js (IndexedDB) is the source of truth. Firestore is sync-only (Phase 3). All reads and writes go through `src/db/index.ts`.

**Sync is manual**: User presses "Sync Now" in Settings. `SyncContext` + `src/sync/firestoreSync.ts` handle upload/download with last-write-wins. Never add automatic or background sync.

**Stage-safe**: Performance mode disables all sync and notifications. Do not add network calls or toasts in `PerformancePage`.

**Teams**: Scoped via `Book.sharedTeamId`. Team songs/setlists live in the same Dexie tables as personal content; role enforcement is at the read/write layer. Firestore paths: `/users/{uid}/songs|books|setlists` (personal) and `/teams/{teamId}/songs|setlists` (shared).

## Commit discipline

Commit after each logical unit of work — not at the end of the session. Specifically:

- **After each feature or fix** that builds cleanly (`npm run build`) and has passed any relevant tests
- **Before starting something new** — never carry uncommitted changes across task boundaries
- **Before context gets large** — long sessions compress context; uncommitted code in a rewrite can silently drop earlier features (see: transpose dropdown incident)
- **One concern per commit** — do not bundle unrelated changes; a commit message should describe one thing

Use targeted `Edit` calls on specific code sections rather than full-file `Write` rewrites. Full rewrites are the main way existing features get silently lost across context boundaries.

## Key constraints — never violate these

- Chord notation is always **Standard** (A B C D E F G). Never rewrite enharmonics, never use German H/B notation.
- Sync model is **manual only** — no automatic, no background, no optimistic sync.
- Dark mode is **always on** (`class="dark"` on `<html>`). Do not add a light mode toggle.
- Design tokens are fixed — do not change the surface/ink/chord colour palette or the Outfit + JetBrains Mono fonts.
- MIT licence — do not add dependencies with incompatible licences.

## Tech stack

| Layer | Library |
|-------|---------|
| Framework | React 18 + TypeScript + Vite |
| Styling | Tailwind CSS v3 (custom tokens in `tailwind.config.js`) |
| ChordPro | chordsheetjs |
| Local DB | Dexie.js (IndexedDB) |
| Editor | CodeMirror 6 |
| Auth | Firebase Auth (Google Sign-In) |
| Cloud DB | Firestore (manual sync, Phase 3) |
| Hosting | Firebase Hosting |
| PWA | vite-plugin-pwa + Workbox |
| i18n | react-i18next (EN + DE) |

## Design tokens (Tailwind)

```js
colors: {
  surface: { 0: '#0d1117', 1: '#161b22', 2: '#21262d', 3: '#30363d' },
  ink:     { DEFAULT: '#e6edf3', muted: '#8b949e', faint: '#484f58' },
  chord:   { DEFAULT: '#f59e0b', light: '#fbbf24', dark: '#d97706' },
  section: '#38bdf8',
}
fonts: ui = 'Outfit', mono = 'JetBrains Mono'
```

## Source layout

```
src/
  main.tsx                        # Entry point
  App.tsx                         # Router — all routes
  index.css                       # Tailwind base + ChordPro renderer CSS
  types.ts                        # All TypeScript types
  auth/AuthContext.tsx             # Google login + local-mode fallback
  db/index.ts                     # Dexie schema + query helpers (getMyTeams, getTeamRole)
  firebase/index.ts               # Firebase init (graceful no-op if unconfigured)
  i18n/{index,en,de}.ts/json      # react-i18next EN+DE
  hooks/useKeyboard.ts            # Pedal/keyboard nav hook
  utils/chordpro.ts               # parse, renderToHtml, extractMeta, buildSearchText
  sync/
    firestoreSync.ts              # uploadPending, downloadPersonal, downloadTeams, syncNow
    SyncContext.tsx               # SyncProvider — status, pendingCount, lastSync, syncNow
  components/
    auth/LoginPage.tsx
    layout/AppShell.tsx           # Sidebar nav + mobile top bar + SyncBadge + TeamInviteNotification
    shared/Button.tsx
    editor/ChordProEditor.tsx     # CodeMirror 6 with ChordPro syntax highlight
    viewer/SongRenderer.tsx       # dangerouslySetInnerHTML chordsheetjs output
    import/ChordsWikiImporter.tsx # chords.wiki JSON importer
    teams/TeamInviteNotification.tsx  # Checks Firestore for pending invites on mount
  pages/
    LibraryPage.tsx               # Song list; team nav in sidebar; team-aware create
    EditorPage.tsx
    ViewerPage.tsx                # Arrow key column navigation + setlist boundary toasts
    PerformancePage.tsx
    SetlistsPage.tsx
    SetlistDetailPage.tsx         # Reorder, add/remove songs, per-slot overrides
    TeamsPage.tsx                 # List teams; create team form
    TeamDetailPage.tsx            # Members, invites, role management; onSnapshot live sync
    ImportPage.tsx
    CurationPage.tsx              # Duplicates (Jaccard), parse errors scan, CSV export
    HelpPage.tsx                  # User documentation, migration guides, troubleshooting
    PrintSongPage.tsx             # @media print PDF export for a single song
    PrintSetlistPage.tsx          # @media print PDF export for a full setlist
    SettingsPage.tsx              # Includes Cloud Sync section
```

## ChordPro rendering

`SongRenderer` uses `chordsheetjs` → `HtmlDivFormatter` → `dangerouslySetInnerHTML`. CSS lives in `src/index.css` under `/* ── ChordPro renderer ── */`. Class names must match what chordsheetjs outputs (`.chord`, `.lyrics`, `.row`, `.column`, `.paragraph`).

```typescript
import ChordSheetJS from 'chordsheetjs'
const song = new ChordSheetJS.ChordProParser().parse(content)
const transposed = song.transpose(semitones)  // returns new Song, does not mutate
const html = new ChordSheetJS.HtmlDivFormatter().format(transposed)
```

After `dangerouslySetInnerHTML` renders the `.column` divs from chordsheetjs, a `useEffect` in `SongRenderer` runs a post-processing pass that converts each `.column` into a native `<ruby>` element so lyric text from different chord positions flows inline and wraps at real word boundaries. The chord name moves into `<rt class="chord">`. A `<wbr>` element is inserted after each `<ruby>` (except the last in a row) to provide explicit line-break opportunities between chord positions.

Key CSS rules that must not be removed:
- `.row { break-inside: avoid; overflow-wrap: break-word; }` — keeps chord+lyric pairs in one CSS column; `overflow-wrap` handles single words wider than the column width
- `.row <wbr> between rubies` — injected by SongRenderer JS; without these, Safari/WebKit treats adjacent ruby elements as an unbreakable run and lyric lines overflow into the next CSS column instead of wrapping
- `ruby { white-space: pre-wrap; }` — **do not remove**; removing it causes Safari/WebKit to stop rendering `<rt>` chord annotations entirely (chords disappear). The `<wbr>` elements sit outside ruby so `pre-wrap` does not suppress the break opportunities they provide.
- `.paragraph { break-inside: avoid; }` — prevents whole sections from splitting mid-paragraph in normal layout
- `.page-flip .paragraph { break-inside: auto; }` — overrides the above in performance/page-flip mode so sections taller than one column (at large font scales) flow across columns rather than overflowing

## Pedal navigation (PageFlip Cicada V7)

The pedal pairs as a Bluetooth keyboard — no Web Bluetooth API needed. Set pedal to **Mode 2** (emits Left/Right Arrow). Arrow key handling exists in both `PerformancePage` and `ViewerPage`. Keys are user-configurable in Settings.

- `ArrowRight` → next column (or next song in setlist; shows toast at boundary)
- `ArrowLeft` → previous column (or previous song; shows toast at boundary)

Column stride = `containerWidth / columns`. At the last column, navigating right advances to the next setlist song.

## iOS/iPadOS safe area handling

The viewport meta uses `viewport-fit=cover` so web content extends under the system status bar (clock, battery). Every top-level UI surface must account for `env(safe-area-inset-top)`.

**AppShell (sidebar + page content)**
- **Sidebar logo row**: `paddingTop: max(1rem, env(safe-area-inset-top))`. The sidebar is `fixed inset-y-0` on mobile (overlay starts at viewport top=0) **and** `static` on iPad landscape — both cases need the guard.
- **Mobile top bar** (`lg:hidden`): already uses `paddingTop: max(0.75rem, env(safe-area-inset-top))`.
- **Main content on iPad** (lg, mobile header hidden): a `hidden lg:block` spacer div with `height: env(safe-area-inset-top)` sits between the (hidden) mobile header and the page content, pushing content below the status bar without affecting the mobile layout.

**PerformancePage (full-screen, outside AppShell)**
- The controls overlay at the top uses `paddingTop: max(0.75rem, env(safe-area-inset-top))`.
- The bottom already uses `paddingBottom: env(safe-area-inset-bottom)`.

Do not add `env(safe-area-inset-top)` to the root `<div>` — it would double-count with the mobile header's own safe-area padding.

## Sync architecture

`SyncContext` exposes `{ status, pendingCount, lastSync, error, syncNow }`.

- `status`: `'unconfigured' | 'clean' | 'pending' | 'syncing' | 'error'`
- Every Dexie write calls `markPending(entityType, id)` which inserts/updates a `SyncState` row
- `syncNow()`: `uploadPending()` → `downloadPersonal()` → `downloadTeams()`
- `stripUndefined()` in `firestoreSync.ts` strips `undefined` fields before Firestore writes (Firestore rejects them)
- Team songs are uploaded to both `/users/{uid}/songs/{id}` and `/teams/{teamId}/songs/{id}` when the song's book has `sharedTeamId`

## Teams architecture

- `TeamMemberRole`: `'owner' | 'contributor' | 'reader'`
- Team invite flow: owner adds email → stored in `team.invites[]` → pushed to Firestore → `TeamInviteNotification` on invitee's AppShell queries all `/teams` docs on mount → accept writes user to `members[]` and removes from `invites[]`
- `TeamDetailPage` uses `onSnapshot` to keep local Dexie in sync with Firestore in real-time (so owner sees accepted invites without manual sync)
- `LibraryPage` shows team spaces in the sidebar; `createSong` auto-creates a team book on first use

## chords.wiki import format

The user's real export file is `chords_wiki_library_export_20260329.json` (4 books, 298 songs, 88 setlists). `ChordsWikiImporter.tsx` handles this format — top-level keys are `filetype`, `version`, `library.books`, `library.setlists`.

## Firebase setup

Copy `.env.example` to `.env.local` and fill in the Firebase config values. The app runs in local-mode (guest user, no sync) when Firebase is not configured — this is intentional.

## Implementation status

Phases 1–5 are complete. See `docs/roadmap.md` for the full list of completed items. The only remaining gap is pinch-to-zoom on Viewer and Performance pages (medium priority).
