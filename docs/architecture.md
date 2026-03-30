# ChordCrew — Architecture & Data Storage

## Overview

ChordCrew is an **offline-first PWA**. The local browser database is the single source of truth at all times. Cloud sync (Firestore) is an optional overlay that will be added in Phase 3. The app is fully functional without any network connection.

---

## Local database

### Technology

| Layer     | Library       | Role |
|-----------|---------------|------|
| Storage   | IndexedDB     | Native browser key-value store, persisted on disk |
| ORM       | Dexie.js v3   | Type-safe wrapper, reactive queries (`useLiveQuery`) |
| Source    | `src/db/index.ts` | Schema, migrations, helper functions |

### Physical location on macOS

IndexedDB data is stored inside the browser's user-data directory. The exact path depends on which browser you use for development:

| Browser | Path |
|---------|------|
| Chrome / Chromium | `~/Library/Application Support/Google/Chrome/Default/IndexedDB/http_localhost_5173_0.indexeddb.leveldb/` |
| Firefox | `~/Library/Application Support/Firefox/Profiles/<id>/storage/default/http+++localhost+5173/idb/` |
| Safari | `~/Library/WebKit/WebsiteData/Default/IndexedDB/localhost/` |
| Chrome (deployed app) | Same Chrome path but keyed on `https_chordcrew-50c55.web.app_0.indexeddb.leveldb/` |

The data is **not** in the project directory. It lives in the browser's sandbox. To inspect it, use **Chrome DevTools → Application → IndexedDB → ChordCrewDB**.

### Database name and tables

Database name: **`ChordCrewDB`** (defined in `src/db/index.ts`)

| Table | Primary key | Notable indexes | Description |
|-------|-------------|-----------------|-------------|
| `books` | `id` | — | Song books / collections |
| `songs` | `id` | `bookId`, `title`, `artist`, `isFavorite`, `updatedAt`, `*tags` | All songs with ChordPro content |
| `songVersions` | `id` | `songId`, `versionNumber` | Up to 3 rolling snapshots per song |
| `setlists` | `id` | — | Setlists (service plans) |
| `setlistItems` | `id` | `setlistId`, `order` | Ordered songs within a setlist |
| `annotations` | `id` | `songId`, `userId` | Per-user text/highlight annotations |
| `syncState` | `id` | `entityType`, `status` | Tracks which records need cloud sync |
| `settings` | `id` (always `"app"`) | — | Single app-wide settings record |

### Song storage detail

Each `Song` record contains:
- **`transcription.content`** — the raw ChordPro text. This is the master source for everything: rendered output, extracted metadata, search index, transpose.
- **`searchText`** — a denormalised, lowercased string (`title + artist + tags + content`) used for fast client-side full-text search without a secondary index.
- **`tags[]`** — lowercase string array. Stored separately from ChordPro content so they can be edited without touching the ChordPro text.
- **`accessedAt`** — unix-ms timestamp written every time the song is opened in the viewer. Used for "recently accessed" sort in the library.

---

## ChordPro rendering pipeline

```
song.transcription.content  (raw ChordPro string)
        │
        ▼
preprocessChordPro()        (src/utils/chordpro.ts)
  ├─ {sop:}/{start_of_part:} → {start_of_verse:}
  ├─ {inline: [C] / / /}    → [C] / / /   (strip directive, keep content)
  ├─ {repeat: Chorus 2x}    → {comment: ↺ Chorus ×2}
  └─ {new_song}             → (removed)
        │
        ▼
ChordProParser.parse()      (chordsheetjs)
        │
        ▼
song.transpose(semitones)   (if transpose ≠ 0)
        │
        ▼
HtmlDivFormatter.format()   (chordsheetjs)
        │
        ▼
dangerouslySetInnerHTML     (SongRenderer — React)
        │
        ▼
useEffect() post-processing  (SongRenderer)
  ├─ Section detection: h3.label (directive) or .chord header (bracket notation)
  ├─ Badge injection: [A] [B] B² (named section repeat tracking)
  ├─ Chorus detection: adds .chorus-section (vertical bar)
  └─ Chord quality split: Am7 → A + m7 (slightly raised)
```

---

## Sync model (Phase 3)

The sync model is **manual-only**. The user presses "Sync Now" to push/pull. No background sync, no automatic sync, no optimistic writes.

Design decisions:
- **Conflict resolution**: last-writer-wins on a per-field basis. `syncState` tracks which records are `pending` (written locally but not yet synced).
- **Firestore location**: `eur3` (Europe multi-region, Frankfurt/Belgium).
- **Auth**: Google Sign-In via Firebase Auth. Guest mode (offline-only) is always available without an account.

### Current status (Phase 1 complete)

The app is currently in **local-only mode**. Firestore and Auth are code-complete but inactive until the Firebase project config is provided via `.env.local`. See **Activating Firebase** below.

---

## PWA / service worker

Built with **vite-plugin-pwa** + Workbox. Strategy: `NetworkFirst` for navigation, `CacheFirst` for fonts and static assets. The service worker is registered in `src/main.tsx`.

Cached data (Workbox): app shell, JS bundles, CSS, Google Fonts.
Persistent data (IndexedDB): all user songs, setlists, settings.

---

## Activating Firebase (cloud sync + auth)

The app is deployed at `https://chordcrew-50c55.web.app`. To enable Google Sign-In and cloud sync:

1. Go to [console.firebase.google.com](https://console.firebase.google.com) → project **chordcrew-50c55**
2. **Authentication** → Sign-in method → Google → Enable; add `chordcrew-50c55.web.app` to Authorized domains
3. **Firestore** → Create database (if not done) → choose `eur3` region → test mode initially
4. **Project settings** → Your apps → Web app → copy the config object
5. Create `.env.local` in the repo root:
   ```
   VITE_FIREBASE_API_KEY=AIza...
   VITE_FIREBASE_AUTH_DOMAIN=chordcrew-50c55.firebaseapp.com
   VITE_FIREBASE_PROJECT_ID=chordcrew-50c55
   VITE_FIREBASE_STORAGE_BUCKET=chordcrew-50c55.appspot.com
   VITE_FIREBASE_MESSAGING_SENDER_ID=123456789
   VITE_FIREBASE_APP_ID=1:123456789:web:abc...
   ```
6. `npm run deploy` — rebuilds with config baked in and deploys

The `.env.local` file is gitignored (never committed). The values are baked into the Vite bundle at build time.

---

## Key constraints (never violate)

- **Chord notation**: always Standard (A B C D E F G). No German H/B.
- **Sync**: manual-only. No background or automatic sync.
- **Dark mode**: always on (`class="dark"` on `<html>`). No light mode.
- **Design tokens**: fixed colour palette and fonts (see `tailwind.config.js`).
- **Licence**: MIT — no incompatible dependencies.

---

*Last updated: 2026-03-31*
