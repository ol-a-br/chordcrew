# ChordCrew — Claude Code Handoff Prompt

You are continuing development of **ChordCrew**, an open-source worship-team chord & lyrics PWA. The Phase 1 scaffold has been created and pushed to the repo. Your job is to make it run correctly, fix any issues, and complete Phase 1.

---

## Repo

```
https://github.com/ol-a-br/chordcrew.git
```

---

## What ChordCrew is

A React + TypeScript PWA for worship bands to manage ChordPro songs and setlists — online and offline. Key constraints:

- **Offline-first**: All data in IndexedDB (Dexie.js). App must work with zero network.
- **Sync is manual**: User presses "Sync Now". Never automatic. No background sync.
- **Chord notation locked to Standard** (A B C D E F G). Never silently rewrite enharmonics.
- **Stage-safe**: Performance mode disables all sync and notifications.
- **PageFlip Cicada V7 pedal** pairs as a keyboard (Mode 2 = Left/Right Arrow). No Web Bluetooth needed — just `keydown` listeners.

---

## Tech Stack

| Layer | Library |
|-------|---------|
| Framework | React 18 + TypeScript + Vite |
| Styling | Tailwind CSS v3 (custom design system — see tailwind.config.js) |
| ChordPro | chordsheetjs |
| Local DB | Dexie.js (IndexedDB) |
| Editor | CodeMirror 6 |
| Auth | Firebase Auth (Google Sign-In) |
| Cloud DB | Firestore (Phase 3) |
| Hosting | Firebase Hosting |
| PWA | vite-plugin-pwa + Workbox |
| i18n | react-i18next (EN + DE) |

---

## Design System (Tailwind custom tokens)

```js
colors: {
  surface: { 0: '#0d1117', 1: '#161b22', 2: '#21262d', 3: '#30363d' },
  ink:     { DEFAULT: '#e6edf3', muted: '#8b949e', faint: '#484f58' },
  chord:   { DEFAULT: '#f59e0b', light: '#fbbf24', dark: '#d97706' },
  section: '#38bdf8',
}
fonts: ui = 'Outfit', mono = 'JetBrains Mono'
```

Dark mode is always on (`class="dark"` on `<html>`). Do not add light mode.

---

## Current file structure (Phase 1 scaffold)

```
src/
  main.tsx                      # Entry point
  App.tsx                       # Router — all routes
  index.css                     # Tailwind base + ChordPro renderer CSS
  types.ts                      # All TypeScript types (mirrors spec data model)
  auth/AuthContext.tsx           # Google login + local-mode fallback
  db/index.ts                   # Dexie schema + query helpers
  firebase/index.ts             # Firebase init (graceful no-op if unconfigured)
  i18n/{index,en,de}.ts/json    # react-i18next EN+DE
  hooks/useKeyboard.ts          # Pedal/keyboard nav hook
  utils/chordpro.ts             # parse, renderToHtml, extractMeta, buildSearchText
  components/
    auth/LoginPage.tsx
    layout/AppShell.tsx         # Sidebar nav + mobile top bar
    shared/Button.tsx
    editor/ChordProEditor.tsx   # CodeMirror 6 with ChordPro syntax highlight
    viewer/SongRenderer.tsx     # dangerouslySetInnerHTML chordsheetjs output
    import/ChordsWikiImporter.tsx  # chords.wiki JSON importer
  pages/
    LibraryPage.tsx             # Books + song list with search
    EditorPage.tsx              # Split-pane editor + live preview
    ViewerPage.tsx              # Song view with transpose, columns, lyrics-only
    PerformancePage.tsx         # Full-screen stage mode + wake lock + pedal nav
    SetlistsPage.tsx            # Setlist list + create
    ImportPage.tsx              # Wraps ChordsWikiImporter
    SettingsPage.tsx            # Language, pedal keys, columns, clear DB, about
```

---

## Data model (key entities)

```typescript
Book      { id, title, author, ownerId, readOnly, shareable, createdAt, updatedAt }
Song      { id, bookId, title, artist, tags[], searchText, isFavorite, savedAt, updatedAt, transcription }
Transcription { content (ChordPro string), key, capo, tempo, timeSignature, duration,
                chordNotation:'standard', instrument, tuning, format:'chordpro' }
SongVersion   { id, songId, content, savedAt, savedByUserId, versionNumber: 1|2|3 }
Annotation    { id, songId, userId, type, position, content, isPrivate, createdAt }
Setlist       { id, name, description, date?, ownerId, createdAt, updatedAt }
SetlistItem   { id, setlistId, order, type:'song'|'divider', songId?, dividerName?,
                transposeOffset, columnCount?, notes? }
SyncState     { id, entityType, entityId, localVersion, syncedVersion, status:'clean'|'pending'|'conflict' }
AppSettings   { language:'en'|'de', darkMode, defaultColumnCount:1|2|3,
                pedalKeyNext:'ArrowRight', pedalKeyPrev:'ArrowLeft', fontScale:1.0 }
```

---

## Phase 1 completion checklist

These are the items that need to be working before Phase 1 is done:

### Must fix / complete
- [ ] `npm install && npm run dev` runs without errors
- [ ] TypeScript compiles (`npm run build`) without errors
- [ ] LoginPage shows when not authenticated; Google login works when Firebase is configured; local-mode guest user works without Firebase
- [ ] Library page: song list loads from Dexie, search works, create new song navigates to editor
- [ ] Editor page: CodeMirror loads, typing updates live preview, Save persists to Dexie
- [ ] Viewer page: ChordPro renders correctly, transpose works (display-only), lyrics-only toggle works
- [ ] Performance page: full-screen, wake lock requested, ArrowLeft/ArrowRight pedal navigation works
- [ ] Import page: drop chords.wiki JSON → songs appear in library (test with the real export file)
- [ ] Settings page: language switch EN↔DE works, pedal key reassignment works
- [ ] PWA installs correctly on iOS Safari and Android Chrome

### Known gaps to fill
- [ ] `SetlistsPage` only lists setlists — add a `SetlistDetailPage` for viewing/editing a setlist's songs
- [ ] No favicon / PWA icons yet — create simple placeholder SVG icons at `public/icons/icon-192.png` and `icon-512.png`
- [ ] `SongRenderer` uses `dangerouslySetInnerHTML` — verify chordsheetjs HTML output matches the CSS class names in `index.css` (`.chord`, `.lyrics`, `.row`, `.column`, `.paragraph`). Adjust CSS if the actual class names differ.
- [ ] Pinch-to-zoom on tablet: add touch event handling to ViewerPage and PerformancePage for `fontScale`
- [ ] `AppSettings` not yet persisted to Dexie on first load — verify the `db.on('ready')` seed works

### Firebase setup (do this once the app runs locally)
1. Create Firebase project named `chordcrew`
2. Enable Authentication → Google
3. Enable Firestore → test mode
4. Copy config to `.env.local` (see `.env.example`)
5. Add GitHub repo secrets for CI/CD (see README)

---

## chords.wiki JSON import format

The user has a real export file: `chords_wiki_library_export_20260329.json`

Structure:
```json
{
  "filetype": "library-backup",
  "version": 1,
  "library": {
    "books": {
      "<bookId>": {
        "id", "title", "author", "songs": {
          "<songId>": {
            "id", "title", "artist", "tags", "saved",
            "transcription": { "content", "key", "tempo", "time_signature", "capo", "duration", ... }
          }
        }
      }
    },
    "setlists": {
      "<setlistId>": {
        "id", "name", "created", "items": {
          "<itemId>": { "order", "type": "song"|"set", "song"?: {...}, "name"?: "..." }
        }
      }
    }
  }
}
```

Stats: 4 books, 298 songs, 88 setlists. The importer in `ChordsWikiImporter.tsx` handles this format.

---

## ChordPro rendering notes

`SongRenderer` uses `chordsheetjs` → `HtmlDivFormatter` → `dangerouslySetInnerHTML`.

The CSS in `src/index.css` under `/* ── ChordPro renderer ── */` styles the output.
Verify these class names match what chordsheetjs actually outputs — if they differ, adjust the CSS.

Key chordsheetjs API:
```typescript
import ChordSheetJS from 'chordsheetjs'
const song = new ChordSheetJS.ChordProParser().parse(content)
const transposed = song.transpose(semitones)   // returns new Song, does not mutate
const html = new ChordSheetJS.HtmlDivFormatter().format(transposed)
```

---

## Pedal navigation (PageFlip Cicada V7, model PFCICADA01)

The Cicada pairs as a Bluetooth keyboard — no Web Bluetooth API needed.
Set pedal to **Mode 2** (Left/Right Arrow buttons on the pedal unit).

In Performance mode:
- `ArrowRight` → next column (or next song in setlist)
- `ArrowLeft`  → previous column

The `useKeyboardNav` hook in `src/hooks/useKeyboard.ts` handles this.
Keys are user-configurable in Settings.

---

## What NOT to change

- The offline-first architecture (Dexie-first, Firestore is sync only)
- The chord notation (always Standard — never German H/B notation)
- The sync model (manual only, never automatic)
- The design tokens (surface/ink/chord colour palette, Outfit + JetBrains Mono fonts)
- The MIT licence

---

## Useful commands

```bash
npm run dev       # dev server → localhost:5173
npm run build     # TypeScript check + Vite build
npm run preview   # preview production build
npm run deploy    # build + firebase deploy (needs firebase-tools + login)
```

---

## Product spec

Full spec is at `docs/ChordCrew_ProductSpec_v0.3.md` in the repo.
