# ChordCrew — Product Specification
*Version 0.3 · Final Draft · March 2026*

---

## 1. Vision & Goals

**ChordCrew** is an open-source, worship-team chord & lyrics app built around the ChordPro format. It works flawlessly **on stage and in rehearsal** — online or offline — and gives the team leader full control over what gets synced and when.

### Design Principles

1. **Offline-first, always.** The local database is never cleared without an explicit user action.
2. **Sync is intentional.** No background auto-sync that could corrupt songs mid-set or distract during a live performance.
3. **Chord notation is stable.** What you type is what you see. No silent enharmonic substitutions (C# never becomes Db).
4. **Stage-ready UI.** Large text, dark mode, pedal navigation, multi-column layout — designed for live performance.
5. **Open format.** All data is standard ChordPro; you can always export and take it anywhere.
6. **Open source.** Code hosted on GitHub under an open licence — transparent, community-improvable, never held hostage to a vendor.

---

## 2. Repository & Hosting

| Aspect | Decision |
|--------|----------|
| Source code | GitHub — public repository, open source |
| Licence | MIT (permissive; others can learn from and contribute to the code) |
| Suggested repo name | `github.com/<yourhandle>/chordcrew` |
| App hosting | Firebase Hosting (free SSL, CDN, CI/CD via GitHub Actions) |
| Custom domain | `chordcrew.app` (recommended, ~$12–15/year) |
| CI/CD | GitHub Actions → Firebase deploy on push to `main` |
| Issue tracking | GitHub Issues |
| Project board | GitHub Projects |

---

## 3. Users & Roles

| Role | Description |
|------|-------------|
| **Owner** | Creates books and setlists, manages sharing, controls sync. Full read/write. |
| **Editor** | Teammate with full read/write access to shared books and setlists. |
| **Viewer** | Read-only access — e.g. a guest musician for a single set. *(Phase 4)* |

Authentication via **Google Sign-In** (Firebase Auth). No passwords to manage.
Expected team size: ~10 members, not all active simultaneously.

---

## 4. Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                  Client (PWA)                           │
│  React + TypeScript + Tailwind CSS                      │
│  Installable on iOS, Android, Desktop (no app store)    │
│                                                         │
│  ┌──────────────┐    ┌────────────────────────────────┐ │
│  │  IndexedDB   │    │   ChordPro Parser / Renderer   │ │
│  │  (Dexie.js)  │◄──►│   (chordsheetjs, extended)     │ │
│  │  Local DB    │    └────────────────────────────────┘ │
│  └──────┬───────┘                                       │
│         │  Explicit sync only (user-triggered)          │
└─────────┼───────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────┐
│              Backend (Firebase / Google Cloud)          │
│  Firebase Auth · Firestore · Firebase Hosting           │
│  Estimated cost: $0/month on free tier for ~10 users    │
└─────────────────────────────────────────────────────────┘
```

### Key Architectural Decisions

**Offline-first with IndexedDB**
All reads and writes go to local IndexedDB first via Dexie.js. The app works fully offline with zero degradation. The Firestore cloud copy is a secondary replica, not the session source of truth.

**Explicit sync only**
Sync is always triggered by the user pressing a **"Sync Now"** button — never automatic. A persistent status badge shows: 🟢 In sync · 🟡 Pending changes · 🔴 Conflict · ✈️ Offline

**Last-write-wins with edit presence**
No merge conflict UI needed. When two people edit the same song, the last sync wins. However, when any user enters Edit mode on a song, ChordCrew writes a lightweight `presence` record to Firestore. If another team member opens the same song in Edit mode, they see a non-blocking banner: *"⚠ Lisa is currently editing this song."* The presence record is cleared on save, cancel, or disconnect.

**Stage safety**
Performance / Stage mode hard-disables all incoming sync and all presence notifications for the duration of the set.

**PWA**
Installed via "Add to Home Screen" on iOS/Android or the browser install prompt on desktop. Workbox service worker caches all assets for instant offline load.

---

## 5. Data Model

```
User
  id, email, displayName, photoURL

Book  (= collection / folder of songs, analogous to chords.wiki "books")
  id, title, description, author
  ownerId, sharedTeamId?
  readOnly, shareable
  createdAt, updatedAt

Song  (belongs to one Book)
  id, bookId
  title, artist
  tags: string[]
  searchText: string              ← denormalised for fast full-text search
  isFavorite: boolean
  savedAt, updatedAt

  Transcription:
    content: string               ← raw ChordPro text — source of truth
    key: string                   ← e.g. "G", "Eb", "F#m"
    capo: number                  ← 0 = no capo
    tempo: number                 ← BPM
    timeSignature: string         ← e.g. "4/4", "3/4"
    duration: number              ← seconds (optional; used for autocue)
    chordNotation: "standard"     ← always Standard (A B C D E F G)
    instrument: string            ← "guitar" | "piano" | ... (metadata only)
    tuning: string                ← "standard" etc. (metadata only)
    format: "chordpro"

SongVersion  (last 3 stored per song)
  id, songId
  content: string                 ← snapshot of ChordPro at save time
  savedAt, savedByUserId, savedByDisplayName
  versionNumber: 1 | 2 | 3       ← oldest is dropped when a 4th is created

Annotation  (per song; private or shared)
  id, songId, userId
  type: "text" | "highlight" | "symbol"
  position: { section, lineIndex, charIndex }
  content: string
  isPrivate: boolean
  createdAt, updatedAt

SongPresence  (ephemeral Firestore record; not stored locally)
  songId, userId, displayName, startedAt

Setlist
  id, name, description
  date?: ISO8601                  ← planned service date/time
  ownerId, sharedTeamId?
  createdAt, updatedAt

SetlistItem
  id, setlistId, order
  type: "song" | "divider"
  songId?: string                 ← if type = "song"
  dividerName?: string            ← if type = "divider" (e.g. "Probe", "Service")
  transposeOffset: number         ← per-setlist key override (semitones); default 0
  columnCount?: number            ← per-setlist column count override
  notes?: string                  ← performance notes for this slot

Team
  id, name, ownerId
  members[]: { userId, email, role: "editor" | "viewer" }

SyncState  (local metadata, not synced to cloud)
  entityType, entityId
  localVersion, syncedVersion
  status: "clean" | "pending" | "conflict"
```

---

## 6. Feature Specification

### 6.1 Song Library & Organisation

| Feature | Detail |
|---------|--------|
| Library structure | Songs grouped in **Books** (collections); users can have multiple books |
| Song CRUD | Create, read, update, delete; each song belongs to exactly one book |
| Favorites | Star any song for quick access in a "Favorites" virtual collection |
| Search | Full-text across title, artist, lyrics content, and tags |
| Filter | By book, key, tag, artist, BPM range, recently used |
| Sort | Title, artist, key, last modified, recently used |
| Song metadata | Title, artist, key, capo, BPM, time signature, duration, instrument, tuning, tags |

### 6.2 ChordPro Editor

- Syntax-highlighted plain-text editor (CodeMirror 6)
- Live split-pane preview as you type
- **Full chords.wiki extended ChordPro spec supported:**

| Category | Directives |
|----------|------------|
| Metadata | `{title}` `{subtitle}` `{key}` `{tempo}` `{time}` `{capo}` |
| Comments | `{comment}` / `{c}` · `{comment_box}` / `{cb}` · `{guitar_comment}` / `{gc}` |
| Section blocks | `{start_of_chorus}` / `{soc}` · `{end_of_chorus}` / `{eoc}` · `{start_of_part:name}` / `{sop}` · `{end_of_part}` / `{eop}` |
| Section shorthand | `[Verse 1]` `[Chorus]` `[Bridge]` — full-line bracket syntax |
| Repeats | `{repeat_part:name}` / `{repeat:name}` / `{rp:name}` |
| Layout | `{column_break}` / `{colb}` · `{new_page}` / `{np}` · `{textsize:...}` |
| Tabs | `{start_of_tab}` / `{sot}` · `{end_of_tab}` / `{eot}` |
| Chord comments | `[*comment]` — shown above lyrics, never transposed |
| Chord definitions | `{define:...}` · `{chord:...}` |
| Custom styles | `{start_of_style}` / `{end_of_style}` with `@section.element: {...}` syntax |
| MIDI | `{midi:...}` · `{start_of_midi}` / `{end_of_midi}` |
| Time tags | `{@mm:ss}` / `{@mm:ss.fff}` — inline and on section directives |
| Conditionals | `{1:text}` `{2+:text}` `{1-3:text}` — for repeated sections |
| Editor comments | Lines starting with `#` — visible in editor, never rendered |

- Chord notation locked to **Standard (A B C D E F G)** — no silent enharmonic rewriting
- Chord name validation highlights unrecognised names
- Undo/redo history (per session)

### 6.3 Song Rendering (View / Performance)

| Feature | Detail |
|---------|--------|
| Chord display | Chords inline above lyrics at correct syllable positions |
| Notation stability | C# always renders as C# regardless of transposition |
| **Transpose** | Semitone ± buttons; display-only offset, source ChordPro never mutated |
| **Capo helper** | Shows "Capo 2 → play in A" hint |
| **Multi-column** | 1, 2, or 3 columns; configurable globally, per song, and per setlist slot |
| **Font / zoom** | Pinch-to-zoom gesture on tablet; persists per device |
| Night mode | Dark background with warm neutral text; available everywhere |
| Section labels | Verse / Chorus / Bridge etc. visually distinct |
| **Lyrics-only mode** | Toggle hides all chord markup — for vocalists who don't need chords |
| Custom styles | `@chorus`, `@verse`, inline `{+style}` rendered faithfully |
| Screen wake lock | Screen never dims in Performance mode (Web Wake Lock API) |
| No chord diagrams | Deliberately omitted — no beginners in the band |

### 6.4 Annotations

| Feature | Detail |
|---------|--------|
| Types | Freetext note · highlight (colour a lyric range) · symbol (🔊 🔇 🔁 ✋ etc.) |
| Placement | Attached to a specific line or word within a song |
| Visibility | Private (you only) or shared with the team |
| Offline | Created and read fully offline; synced on next manual sync |
| Performance mode | Annotations visible; toggled on/off with one tap |

### 6.5 Version History

- Last **3 versions** stored per song (4th save drops the oldest)
- Each version records: full ChordPro snapshot, timestamp, and author's display name
- Simple diff view between any two versions
- One-tap restore to any saved version (creates a new pending edit, does not auto-save)

### 6.6 Autoscroll / AutoCue

- Manual speed control (slider)
- BPM-linked mode: scroll speed derived from song tempo
- Respects `{@mm:ss}` time tags for section-accurate pacing
- Pause / resume on touch or pedal long-press
- Speed fine-tune ± 5% without stopping

### 6.7 BPM / Metronome

- BPM shown from song metadata; overridable per session without altering source
- Tap-tempo input
- Visual beat indicator (flashing bar)
- Audio click track (optional, mutable)
- Time signature configurable: `4/4`, `3/4`, `6/8`, etc.
- Metronome state is local only — never synced

### 6.8 Bluetooth Pedal — PageFlip Cicada V7 (PFCICADA01)

The Cicada V7 pairs to the OS as a standard Bluetooth keyboard — no Web Bluetooth API is needed. ChordCrew simply listens for `keydown` events.

| Aspect | Detail |
|--------|--------|
| Pairing | Done at OS level (Bluetooth settings); app has no involvement |
| Recommended pedal mode | **Mode 2: Left / Right Arrow** (→ / ←) |
| Event listener | Standard `keydown`: `ArrowRight` = Next · `ArrowLeft` = Prev |
| Key binding | Fully configurable in Settings; any key can be remapped |
| Platforms | All browsers including **Safari on iPad** — no restrictions |
| Desktop fallback | Same key bindings work with a physical keyboard (useful for testing) |
| Active only in | Performance mode — ignored in Edit / Library mode |

**Column navigation logic:**

- One pedal press = scroll exactly **one column** into view
- At the last column of the current song in a setlist → **Next** loads the first column of the next song
- At the first column of the current song → **Prev** loads the last column of the previous song
- Long-press Right = jump to next song (skip current)
- Long-press Left = jump back to start of current song

### 6.9 Setlist / Playlist Mode

| Feature | Detail |
|---------|--------|
| Create | Named setlist with optional description and planned date/time |
| Add songs | Search / browse library; drag-and-drop to reorder |
| Dividers | Named section dividers within a setlist (e.g. "Probe", "Service") |
| Per-slot overrides | Transpose offset, column count, notes — without altering the master song |
| Duplicate | Clone a setlist for a recurring service |
| "Present" mode | Full-screen stage view; hides all editing chrome; activates wake lock |
| Song counter | "Song 3 of 8" in header |
| Quick-jump | Slide-out song tray for non-sequential navigation |
| Emergency jump | Any song reachable in ≤ 2 taps |
| Stage safety | All sync and presence notifications disabled while in Present mode |

### 6.10 PDF Export

PDF generation runs **fully offline** — no server round-trip, no internet needed.

| Option | Detail |
|--------|--------|
| Orientation | **Portrait** (default) or **Landscape** — user's choice per export |
| Columns — Portrait | Default 2 columns (configurable 1–3) |
| Columns — Landscape | Default 4 columns (configurable 1–5) |
| Colour | Always **black text on white background** — optimised for printing |
| Independence | Completely independent of current screen display settings and theme |
| Font size | Configurable per export; does not affect screen view |
| Content | Single song, or all songs in a setlist (one song per page or compact) |
| Annotations | Include or exclude toggle |
| Share | System share sheet (email, AirDrop, messaging apps, etc.) |
| Print | Direct print from device |

### 6.11 Sync & Collaboration

**Philosophy:** Local first. The cloud is a backup and a collaboration channel, not a live dependency.

| Aspect | Behaviour |
|--------|-----------|
| Trigger | Manual "Sync Now" button only — never automatic |
| Scope | Sync all, or select specific books / setlists |
| Conflict strategy | **Last write wins** — no merge UI needed |
| Edit presence | Non-blocking banner when a teammate is currently editing the same song |
| Stage safety | Present mode disables all incoming sync and notifications |
| Status badge | 🟢 In sync · 🟡 Pending · 🔴 Failed · ✈️ Offline |

**Sharing:**
- Export song / book as `.cho`, ZIP, or PDF
- Share link: one-time snapshot link → teammate imports into their own library
- Team invite: add teammate's Google email to a shared book or setlist

### 6.12 Import: chords.wiki JSON Backup

A dedicated one-time import wizard accepts the chords.wiki `library-backup` v1 JSON format.

Steps:
1. Parse all **Books** → import as ChordCrew Books
2. Parse all **Songs** with full `transcription.*` metadata
3. Parse all **Setlists** including `type:"set"` dividers → import as SetlistItems of type `"divider"`
4. Flag songs where title looks like a raw filename (e.g. `kutless-god_of_wonders.txt`) for user cleanup
5. Deduplicate detection: warn if a song with the same title + artist already exists locally
6. Report any unrecognised ChordPro directives found in imported content

**Your export at a glance (2026-03-29):**

| Item | Count |
|------|-------|
| Books | 4 ("Oliver" · "Bibel" · "Oliver - Archiv" · "Susanne") |
| Total songs | 298 |
| Setlists | 88 |

### 6.13 Internationalisation (i18n)

- UI in **English** and **German** at launch (react-i18next)
- Language switcher in Settings
- Framework supports adding further languages without code changes
- Song content is language-agnostic

---

## 7. UX & UI Guidelines

- **Two primary modes:** *Library / Edit* (management, writing, planning) and *Performance* (read-only, full-screen, stage-optimised)
- Performance mode shows only song content + a minimal control bar
- Responsive layout: phone (1 col) · tablet (1–2 col) · desktop (1–3 col)
- Touch targets minimum **48×48 px** for on-stage tablet use
- Dark mode available in both modes; default to dark in Performance mode
- Common tasks reachable in **≤ 3 taps**
- Landscape and portrait supported on all devices
- Rendering output is version-stable — no surprise layout changes after an update

---

## 8. Tech Stack

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| Framework | React 18 + TypeScript | Ecosystem, PWA, type safety |
| Styling | Tailwind CSS v3 | Dark mode utilities, responsive, rapid iteration |
| ChordPro parsing | chordsheetjs (+ custom extensions) | Covers standard + chords.wiki extended spec |
| Local DB | Dexie.js (IndexedDB wrapper) | Persistent, never auto-cleared by browser |
| Auth | Firebase Auth — Google Sign-In | Zero-config, free tier |
| Cloud DB | Firestore | Real-time presence, integrates with Auth |
| Hosting | Firebase Hosting | Free SSL, CDN, GitHub Actions deploy |
| Offline / PWA | Workbox | Service worker, asset caching |
| Code editor | CodeMirror 6 | Lightweight, touch-friendly, syntax plugin API |
| PDF generation | jsPDF + html2canvas | Fully offline, no server round-trip |
| Pedal / keyboard | Native `keydown` event listener | No Web Bluetooth needed for Cicada V7 |
| i18n | react-i18next | EN + DE at launch, extensible |
| Wake lock | Screen Wake Lock API | Prevents dimming in Performance mode |
| CI/CD | GitHub Actions → Firebase deploy | Push to `main` = live deploy |

**Estimated monthly cost (≤10 users): $0** — entirely within Firebase free tier.

---

## 9. Phased Roadmap

### Phase 1 — Core (MVP)
- [ ] GitHub repository set up, MIT licence, CI/CD to Firebase
- [ ] PWA shell with Workbox service worker (offline from day 1)
- [ ] Google Sign-In via Firebase Auth
- [ ] Song CRUD with CodeMirror ChordPro editor + live split-pane preview
- [ ] Full chords.wiki extended ChordPro rendering (chordsheetjs + extensions)
- [ ] Chord transposition (display-only offset, source never mutated)
- [ ] Lyrics-only toggle (hide chords for vocalists)
- [ ] Book (collection) management
- [ ] Full-text search and tag filtering; favorites
- [ ] Dark mode / night theme
- [ ] Font zoom via pinch gesture (persists per device)
- [ ] ChordPro import (`.cho`, `.chopro`) and single-song export
- [ ] **chords.wiki JSON backup importer** (library-backup v1 format, 298 songs + 88 setlists)
- [ ] English UI only (i18n framework in place for Phase 3)

### Phase 2 — Stage
- [ ] Setlist creation: dividers, drag-and-drop reorder, per-slot overrides, date/time field
- [ ] Performance / Present mode: full-screen, wake lock, no editing chrome, song counter, quick-jump tray
- [ ] Multi-column layout (1–3 cols on screen; column count configurable per song and per setlist slot)
- [ ] **PageFlip Cicada V7 pedal support** — `ArrowLeft` / `ArrowRight` keydown, configurable bindings
- [ ] Column-by-column navigation: last column → advance to next song; first column → back to prev song
- [ ] BPM display + tap-tempo + visual / audio metronome
- [ ] Autoscroll with `{@mm:ss}` time-tag support
- [ ] Annotations (text, highlight, symbol — private and shared)
- [ ] Song version history (last 3 versions, diff view, one-tap restore)
- [ ] PDF export: portrait (2 col default) + landscape (4 col default), black on white, offline
- [ ] ZIP bulk export of book or setlist

### Phase 3 — Collaboration
- [ ] Firestore sync — explicit, user-triggered, last-write-wins
- [ ] Edit presence: "⚠ Lisa is currently editing" banner via Firestore presence
- [ ] Shared books and setlists — invite by Google account email
- [ ] Stage safety: Present mode disables all sync and notifications
- [ ] Share-link export for individual song snapshots
- [ ] German UI translation (i18n keys already in place)
- [ ] Sync scope selector: sync all / sync selected books or setlists

### Phase 4 — Polish
- [ ] Viewer role (read-only teammates)
- [ ] Published / locked books and setlists
- [ ] Setlist duplication for recurring services
- [ ] Additional UI languages beyond EN / DE
- [ ] Chord diagram rendering for `{chord:...}` and `{define:...}` (future nice-to-have)

---

## 10. Out of Scope

- Native iOS / Android app (PWA + Safari covers the use case)
- Audio / video recording
- ProPresenter or presentation software integration
- MIDI playback (MIDI directives stored as metadata only)
- Subscription / billing (self-hosted / Firebase free tier)
- Public song discovery or social features
- Instrument-specific views (bass charts, drum notation)
- Starter library of pre-loaded songs

---

## Appendix A — chords.wiki JSON Export: Field Mapping

| chords.wiki field | ChordCrew field |
|---|---|
| `library.books[*]` | Book |
| `book.songs[*]` | Song |
| `song.transcription.content` | transcription.content |
| `song.transcription.key` | transcription.key |
| `song.transcription.tempo` | transcription.tempo |
| `song.transcription.time_signature` | transcription.timeSignature |
| `song.transcription.capo` | transcription.capo |
| `song.transcription.duration` | transcription.duration |
| `song.transcription.chord_notation` | transcription.chordNotation (always "standard") |
| `song.transcription.instrument` | transcription.instrument |
| `song.transcription.tuning` | transcription.tuning |
| `song.tags` | song.tags |
| `library.setlists[*]` | Setlist |
| `setlist.items[*] type:"song"` | SetlistItem type:"song" |
| `setlist.items[*] type:"set"` | SetlistItem type:"divider" |
| `setlist.items[*].order` | SetlistItem.order |

Fields `parts` and `recording` are empty in all inspected songs — safely ignored on import.

---

## Appendix B — Resolved Design Decisions

| Decision | Resolution |
|----------|------------|
| App name | **ChordCrew** |
| Domain | `chordcrew.app` |
| Source code | GitHub, public, MIT licence |
| Conflict strategy | Last write wins + edit presence notification |
| PDF orientation | User-selectable: Portrait (2 col) / Landscape (4 col); always black on white |
| Screen zoom | Pinch-to-zoom gesture; persists per device |
| Chord diagrams | Not implemented — not needed for the band |
| Lyrics-only mode | Toggle in Performance mode — for vocalists |
| Version history | Last 3 versions per song |
| Bluetooth pedal | PageFlip Cicada V7 (PFCICADA01) — Mode 2 (Left/Right Arrow); standard keydown listener |
| Chord notation | Standard only (A B C D E F G); no silent enharmonic rewriting |
| Hosting cost | Firebase free tier — $0/month for ≤10 users |

---

*ChordCrew Product Spec v0.3 — March 2026. All open questions resolved. Ready for Phase 1 implementation.*
