# ChordCrew — Requirements Specification

*Living document. Every requirement has an ID, description, and implementation status.*
*Status: `done` · `in-progress` · `planned` · `deferred`*

---

## REQ-ARCH — Architecture Constraints

| ID | Requirement | Status |
|----|-------------|--------|
| ARCH-01 | Offline-first: all reads/writes go through Dexie.js (IndexedDB). App must work with zero network. | done |
| ARCH-02 | Sync is manual only — user presses "Sync Now". No automatic or background sync ever. | done |
| ARCH-03 | Chord notation locked to Standard (A B C D E F G). Never silently rewrite enharmonics. | done |
| ARCH-04 | Dark mode always on (`class="dark"` on `<html>`). No light mode toggle. | done |
| ARCH-05 | Stage-safe Performance mode: disables all sync, notifications, and network calls. | done |
| ARCH-06 | MIT licence — no incompatible dependencies. | done |

---

## REQ-AUTH — Authentication

| ID | Requirement | Status |
|----|-------------|--------|
| AUTH-01 | Google Sign-In via Firebase Auth. | done |
| AUTH-02 | Local-mode guest user when Firebase is not configured — full offline functionality. | done |
| AUTH-03 | LoginPage shown when not authenticated; guest user bypasses it in local mode. | done |

---

## REQ-LIB — Song Library

| ID | Requirement | Status |
|----|-------------|--------|
| LIB-01 | Songs grouped in Books (collections). | done |
| LIB-02 | Full-text search across title, artist, lyrics, and tags. | done |
| LIB-03 | Filter by book in sidebar. | done |
| LIB-04 | Favorites virtual collection. | done |
| LIB-05 | Create new song navigates to editor with ChordPro template. | done |
| LIB-06 | Song row shows key badge and favorite star. | done |
| LIB-07 | Sort: alphabetical by title (default). | done |
| LIB-08 | Filter by key in sidebar. BPM-range filter deferred. | in-progress |
| LIB-09 | Sort songs: by title, artist, last modified, date created, recently accessed. | done |
| LIB-10 | Tag browser in sidebar: list all unique tags (case-insensitive), click to filter. | done |
| LIB-11 | Tag editing: add/remove tags on a song from the editor metadata panel. | done |

---

## REQ-ED — Editor

| ID | Requirement | Status |
|----|-------------|--------|
| ED-01 | CodeMirror 6 editor with ChordPro syntax highlighting. | done |
| ED-02 | Live split-pane preview updates as you type. | done |
| ED-03 | Auto-save with 1-second debounce; extracts title/artist/key/tempo/capo from `{directive}` values. | done |
| ED-04 | Song version history — last 3 snapshots per song, throttled to one per 5 minutes. | done |
| ED-05 | Version history slide-over panel with one-tap restore. | done |
| ED-06 | Undo/redo within session (CodeMirror native). | done |
| ED-07 | Chord name validation — unknown chord names highlighted in editor. | done |
| ED-08 | Metadata bar row 1 (core): Title, Artist, Key, Tempo (+ tap-tempo), Capo, Time. | done |
| ED-09 | Metadata bar rows 2+3 (attribution + tags) collapsed by default; ChevronDown toggle; amber dot when hidden rows have content. | done |
| ED-10 | Attribution fields: CCLI number, Copyright, URL — stored as ChordPro directives `{ccli:}` `{copyright:}` `{url:}`. | done |

---

## REQ-VIEW — Song Viewer

| ID | Requirement | Status |
|----|-------------|--------|
| VIEW-01 | ChordPro rendered via chordsheetjs → HtmlDivFormatter. | done |
| VIEW-02 | Transpose ± semitones; 12-key picker dropdown with chord previews; source ChordPro never mutated. | done |
| VIEW-03 | Lyrics-only toggle hides all chord markup. | done |
| VIEW-04 | 1–5 column layout, switchable in toolbar. | done |
| VIEW-05 | Font scale A- / A+ buttons. | done |
| VIEW-06 | Favorite toggle. | done |
| VIEW-07 | Navigate to Performance mode from viewer. | done |
| VIEW-08 | Key shown with treble clef symbol 𝄞. | done |
| VIEW-09 | Tempo shown with quarter-note symbol ♩. | done |
| VIEW-10 | Pinch-to-zoom gesture for font scale (tablet). | planned |
| VIEW-11 | Capo helper: "Capo 2 → plays in A" shown in toolbar when capo > 0. | done |
| VIEW-12 | External link icon opens `{url:}` in new tab; CCLI `#` icon opens SongSelect when `{ccli:}` is set. | done |

---

## REQ-RENDER — ChordPro Rendering

| ID | Requirement | Status |
|----|-------------|--------|
| RENDER-01 | Chord names rendered in light yellow (`#fde68a`) for dark stage backgrounds. | done |
| RENDER-02 | Section labels rendered as `h3.label`; CSS counter adds `[A] [B] [C]` prefix. | done |
| RENDER-03 | Chorus sections (anonymous and named) get a left vertical bar accent. | done |
| RENDER-04 | Renderer font: Barlow Condensed — narrow sans-serif for more lyrics per line. | done |
| RENDER-05 | Multi-column layout with CSS `column-count`; sections do not split across columns. | done |
| RENDER-06 | Comment lines styled as muted italic. | done |
| RENDER-07 | Tab blocks displayed in monospace with horizontal scroll. | done |
| RENDER-08 | Lyrics-only mode hides chord row height and collapses `.column` to inline. | done |
| RENDER-09 | `{start_of_part:}` / `{sop:}` directives preprocessed → standard labeled sections before chordsheetjs parse. | done |
| RENDER-10 | Song title and subtitle hidden in renderer (shown in Viewer toolbar only). | done |
| RENDER-11 | Chord quality/modifier rendered smaller and raised (e.g. Dsus4 → D+sup sus4; D(4) → D+sup 4). | done |
| RENDER-12 | Vertical separator lines between columns (column-rule CSS). | done |
| RENDER-13 | Section badge rendered as graphical bordered box; repeated sections show superscript count (B²). | done |
| RENDER-14 | Spaces between adjacent chords in chord-only lines preserved in rendered output. | done |
| RENDER-15 | Non-chord text in chord position (e.g. "(To Bridge)", "(last Time)") rendered as italic, muted prose — not yellow chord style. | done |

---

## REQ-PERF — Performance / Stage Mode

| ID | Requirement | Status |
|----|-------------|--------|
| PERF-01 | Full-screen fixed overlay — no sidebar, no editing chrome. | done |
| PERF-02 | Screen Wake Lock API — screen never dims during a set. | done |
| PERF-03 | ArrowRight / ArrowLeft pedal navigation (PageFlip Cicada V7, Mode 2). | done |
| PERF-04 | Tap left/right half of screen to navigate columns. | done |
| PERF-05 | Controls overlay auto-hides after 3 s; reappears on pointer/touch. | done |
| PERF-06 | Key (𝄞) and tempo (♩) shown in controls overlay. | done |
| PERF-07 | Column-by-column navigation: last column → advance to next song in setlist. | done |
| PERF-08 | Long-press ArrowRight = skip to next song; long-press ArrowLeft = back to start of song. | done |
| PERF-09 | Song counter "Song 3 of 8" shown in controls overlay during setlist performance. | done |
| PERF-10 | Quick-jump slide-out tray for non-sequential song navigation. | done |
| PERF-11 | Pinch-to-zoom in performance mode. | planned |
| PERF-12 | Multi-column mode: horizontal column-by-column page flip, scrollbar hidden. | done |

---

## REQ-SET — Setlists

| ID | Requirement | Status |
|----|-------------|--------|
| SET-01 | Create named setlist; navigates to detail page. | done |
| SET-02 | List all setlists ordered by last updated. | done |
| SET-03 | Item count shown per setlist row. | done |
| SET-04 | SetlistDetailPage — view ordered song list; click → viewer with setlist nav context. | done |
| SET-05 | Add songs to setlist from library search (inline song picker). | done |
| SET-06 | Drag-and-drop reorder of setlist items. | done |
| SET-07 | Named dividers within a setlist (e.g. "Pre-Service", "Main Set"). | done |
| SET-08 | Per-slot transpose offset (does not alter master song). | done |
| SET-09 | Per-slot column count override. | done |
| SET-10 | Per-slot notes field. | done |
| SET-11 | Optional planned date/time on setlist. | done |
| SET-12 | Duplicate a setlist for recurring services. | done |
| SET-13 | Present mode for setlist (full-screen, song counter, wake lock). | done |

---

## REQ-IMP — Import / Export

| ID | Requirement | Status |
|----|-------------|--------|
| IMP-01 | Drag-and-drop or file-picker upload of chords.wiki library-backup v1 JSON. | done |
| IMP-02 | Import all Books, Songs, and Setlists from real export. | done |
| IMP-03 | Flag songs with filename-style titles for user cleanup. | done |
| IMP-04 | Import summary: book / song / setlist counts + skipped/updated count. | done |
| IMP-05 | Import `.cho` / `.chopro` / `.chordpro` single-file ChordPro import. | done |
| IMP-06 | Duplicate conflict resolution: scan before importing; user chooses "Skip existing" or "Overwrite existing" for the full batch. | done |
| IMP-07 | OpenSong XML import: positional chord→lyric alignment, section detection (V/C/B/P/T), `{ccli:}` + `{copyright:}` tags, inline key/tempo/time fallback from lyrics. | done |
| IMP-08 | Export full library to chords.wiki-compatible JSON (all books, songs, setlists, metadata). | done |
| IMP-09 | OpenSong inline metadata: parse `Key - C \| Tempo - 77 \| Time - 4/4` and German `Tonart - E \| Taktart - 4/4` from lyrics when XML tags are absent. | done |

---

## REQ-SYNC — Sync & Cloud

| ID | Requirement | Status |
|----|-------------|--------|
| SYNC-01 | Firestore manual sync — user-triggered "Sync Now" only. | done |
| SYNC-02 | Last-write-wins conflict strategy. | done |
| SYNC-03 | Sync status badge: 🟢 Synced · 🟡 Pending / stale / updates available · 🔴 Error · ⬜ Offline. | done |
| SYNC-04 | Cloud update polling every 5 minutes: lightweight 3-collection Firestore check; sets "Updates available" status. | done |
| SYNC-05 | Online/offline detection via `navigator.onLine` + window events; badge shows grey "Offline" when disconnected. | done |
| SYNC-06 | Edit presence: "⚠ Lisa is currently editing" non-blocking banner. | deferred |
| SYNC-07 | Stage safety: Performance mode hard-disables all incoming sync. | done |

---

## REQ-PWA — PWA & Offline

| ID | Requirement | Status |
|----|-------------|--------|
| PWA-01 | Workbox service worker — all assets cached for instant offline load. | done |
| PWA-02 | Web App Manifest with name, theme-color, display:standalone. | done |
| PWA-03 | PWA icons: `icon-192.png` and `icon-512.png`. | done |
| PWA-04 | Installable on iOS Safari and Android Chrome. | done |

---

## REQ-I18N — Internationalisation

| ID | Requirement | Status |
|----|-------------|--------|
| I18N-01 | English UI — base language. | done |
| I18N-02 | German UI (Deutsch) — full translation. | done |
| I18N-03 | Language switcher in Settings. | done |
| I18N-04 | Song content is language-agnostic (ChordPro format). | done |

---

## REQ-SETTINGS — Settings

| ID | Requirement | Status |
|----|-------------|--------|
| SETTINGS-01 | Language EN / DE switch. | done |
| SETTINGS-02 | Default column count (1–5). | done |
| SETTINGS-03 | Pedal key reassignment (Next / Prev) via key capture. | done |
| SETTINGS-04 | Clear local database (with confirmation). | done |
| SETTINGS-05 | Font scale preference persisted per device. | done |
| SETTINGS-06 | Default column count extended to 1–5. | done |
| SETTINGS-07 | Continuous scroll mode toggle: when off (default), multi-column uses horizontal page-flip navigation. | done |

---

## REQ-TEAMS — Teams & Collaboration

| ID | Requirement | Status |
|----|-------------|--------|
| TEAMS-01 | Support for multiple teams; a user can be a member of more than one team. | done |
| TEAMS-02 | Each team has a shared song library and setlist space visible to all members. | done |
| TEAMS-03 | Team roles: Owner (full admin), Contributor (create/edit), Reader (view only). | done |
| TEAMS-04 | Owners can invite by Google email, remove members, change roles; invite accepted via notification. | done |
| TEAMS-05 | Songs and setlists scoped to personal space or a named team space. | done |
| TEAMS-06 | Copy a song to another book or team space (original remains). | done |
| TEAMS-07 | Move a song to another book or team space (removes from source). | done |
| TEAMS-08 | Reader role: view and transpose; no edit or delete. | done |
| TEAMS-09 | Contributor role: add, edit, delete songs and setlists within team space. | done |
| TEAMS-10 | Owner role: all Contributor rights plus membership and role management. | done |

---

## REQ-PDF — PDF Export

| ID | Requirement | Status |
|----|-------------|--------|
| PDF-01 | Browser `@media print` CSS — black on white, no external dependencies. | done |
| PDF-02 | Portrait: 2 columns default. | done |
| PDF-03 | Landscape: 4 columns default. | done |
| PDF-04 | Always black on white — independent of screen dark theme. | done |
| PDF-05 | Single song export via PrintSongPage. | done |
| PDF-06 | Full setlist export via PrintSetlistPage. | done |
| PDF-07 | System share sheet (AirDrop, email). | deferred |

---

*Last updated: 2026-04-05*
