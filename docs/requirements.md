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
| AUTH-01 | Google Sign-In via Firebase Auth. | planned |
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
| LIB-08 | Filter by key, tag, artist, BPM range. | planned |
| LIB-09 | Sort songs: by title, artist, last modified, date created, recently accessed. | planned |
| LIB-10 | Tag browser in sidebar: list all unique tags (case-insensitive), click to filter. | planned |
| LIB-11 | Tag editing: add/remove tags on a song from the editor metadata panel. | planned |

---

## REQ-ED — Editor

| ID | Requirement | Status |
|----|-------------|--------|
| ED-01 | CodeMirror 6 editor with ChordPro syntax highlighting. | done |
| ED-02 | Live split-pane preview updates as you type. | done |
| ED-03 | Save persists to Dexie; updates title/artist/key from `{directive}` values. | done |
| ED-04 | "Unsaved" indicator when content has changed. | done |
| ED-05 | Song version history — last 3 snapshots per song, drop oldest on 4th save. | done |
| ED-06 | Undo/redo within session (CodeMirror native). | done |
| ED-07 | Chord name validation — highlight unrecognised chord names. | planned |

---

## REQ-VIEW — Song Viewer

| ID | Requirement | Status |
|----|-------------|--------|
| VIEW-01 | ChordPro rendered via chordsheetjs → HtmlDivFormatter. | done |
| VIEW-02 | Transpose ± semitones, display-only — source ChordPro never mutated. | done |
| VIEW-03 | Lyrics-only toggle hides all chord markup. | done |
| VIEW-04 | 1 / 2 / 3 column layout, switchable in toolbar. | done |
| VIEW-05 | Font scale A- / A+ buttons. | done |
| VIEW-06 | Favorite toggle. | done |
| VIEW-07 | Navigate to Performance mode from viewer. | done |
| VIEW-08 | Key shown with treble clef symbol 𝄞. | done |
| VIEW-09 | Tempo shown with quarter-note symbol ♩. | done |
| VIEW-10 | Pinch-to-zoom gesture for font scale (tablet). | planned |
| VIEW-11 | Capo helper hint ("Capo 2 → play in A"). | planned |

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
| RENDER-09 | {start_of_part:}/{sop:} directives preprocessed → standard labeled sections before chordsheetjs parse. | planned |
| RENDER-10 | Song title ({title:}) styled larger; subtitle ({subtitle:}) styled smaller and muted in renderer output. | planned |
| RENDER-11 | Chord quality/modifier rendered as smaller superscript (e.g. Dsus4 → D + ˢᵘˢ⁴). | planned |
| RENDER-12 | Vertical separator lines between columns (column-rule CSS). | planned |
| RENDER-13 | Section badge rendered as graphical bordered box; repeated sections show superscript count (B²). | planned |

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
| PERF-07 | Column-by-column navigation: last column → advance to next song in setlist. | planned |
| PERF-08 | Long-press ArrowRight = skip to next song; long-press ArrowLeft = back to start. | planned |
| PERF-09 | Song counter "Song 3 of 8" in header during setlist performance. | planned |
| PERF-10 | Quick-jump slide-out tray for non-sequential navigation. | planned |
| PERF-11 | Pinch-to-zoom in performance mode. | planned |
| PERF-12 | Multi-column mode: horizontal column-by-column page flip, scrollbar hidden. Single-column uses vertical page flip. | planned |

---

## REQ-SET — Setlists

| ID | Requirement | Status |
|----|-------------|--------|
| SET-01 | Create named setlist; navigates to detail page. | done |
| SET-02 | List all setlists ordered by last updated. | done |
| SET-03 | Item count shown per setlist row. | done |
| SET-04 | SetlistDetailPage — view and edit songs in a setlist. | planned |
| SET-05 | Add songs to setlist from library search. | planned |
| SET-06 | Drag-and-drop reorder of setlist items. | planned |
| SET-07 | Named dividers within a setlist (e.g. "Pre-Service", "Main Set"). | planned |
| SET-08 | Per-slot transpose offset (does not alter master song). | planned |
| SET-09 | Per-slot column count override. | planned |
| SET-10 | Per-slot notes field. | planned |
| SET-11 | Optional planned date/time on setlist. | planned |
| SET-12 | Duplicate a setlist for recurring services. | deferred |
| SET-13 | Present mode for setlist (full-screen, song counter, wake lock). | planned |

---

## REQ-IMP — Import

| ID | Requirement | Status |
|----|-------------|--------|
| IMP-01 | Drag-and-drop or file-picker upload of chords.wiki library-backup v1 JSON. | done |
| IMP-02 | Import all Books, Songs (298), and Setlists (88) from real export. | done |
| IMP-03 | Flag songs with filename-style titles for user cleanup. | done |
| IMP-04 | Import summary: book / song / setlist counts. | done |
| IMP-05 | Import `.cho` / `.chopro` single-file ChordPro import. | planned |
| IMP-06 | Deduplication warning when song with same title + artist already exists. | planned |

---

## REQ-SYNC — Sync & Collaboration (Phase 3)

| ID | Requirement | Status |
|----|-------------|--------|
| SYNC-01 | Firestore manual sync — user-triggered "Sync Now" only. | planned |
| SYNC-02 | Last-write-wins conflict strategy. | planned |
| SYNC-03 | Sync status badge: 🟢 In sync · 🟡 Pending · 🔴 Failed · ✈️ Offline. | planned |
| SYNC-04 | Edit presence: "⚠ Lisa is currently editing" non-blocking banner. | planned |
| SYNC-05 | Stage safety: Performance mode hard-disables all incoming sync. | planned |
| SYNC-06 | Shared books/setlists — invite by Google email. | deferred |

---

## REQ-PWA — PWA & Offline

| ID | Requirement | Status |
|----|-------------|--------|
| PWA-01 | Workbox service worker — all assets cached for instant offline load. | done |
| PWA-02 | Web App Manifest with name, theme-color, display:standalone. | done |
| PWA-03 | PWA icons: `icon-192.png` and `icon-512.png`. | planned |
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
| SETTINGS-02 | Default column count (1/2/3). | done |
| SETTINGS-03 | Pedal key reassignment (Next / Prev) via key capture. | done |
| SETTINGS-04 | Clear local database (with confirmation). | done |
| SETTINGS-05 | Font scale preference persisted per device. | planned |
| SETTINGS-06 | Default column count extended to 1–5. | planned |
| SETTINGS-07 | Continuous scroll mode toggle: when off (default), multi-column uses page-flip navigation. | planned |

---

## REQ-PDF — PDF Export (Phase 2)

| ID | Requirement | Status |
|----|-------------|--------|
| PDF-01 | Fully offline PDF generation (jsPDF + html2canvas). | planned |
| PDF-02 | Portrait: 2 columns default (configurable 1–3). | planned |
| PDF-03 | Landscape: 4 columns default (configurable 1–5). | planned |
| PDF-04 | Always black on white — independent of screen theme. | planned |
| PDF-05 | Single song export. | planned |
| PDF-06 | Full setlist export (one song per page or compact). | planned |
| PDF-07 | System share sheet (AirDrop, email, messaging). | planned |

---

*Last updated: 2026-03-30*
