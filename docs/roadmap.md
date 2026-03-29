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

### 🔜 Remaining Phase 1 gaps

| Item | Req IDs | Priority |
|------|---------|----------|
| PWA icons: `public/icons/icon-192.png` + `icon-512.png` | PWA-03 | high |
| `SetlistDetailPage`: view/edit songs within a setlist | SET-04 | high |
| Pinch-to-zoom on Viewer and Performance pages | VIEW-10, PERF-11 | medium |
| Firebase setup: create project, enable Auth + Firestore | AUTH-01 | medium |
| CI/CD: GitHub Actions → Firebase deploy on push to `main` | — | medium |

---

## Phase 2 — Stage · *next up*

Focus: live performance features — setlist management, autoscroll, PDF, metronome.

| Item | Req IDs | Priority |
|------|---------|----------|
| SetlistDetailPage: add songs, dividers, reorder | SET-04–07 | critical |
| Per-setlist-slot overrides: transpose, columns, notes | SET-08–10 | high |
| Setlist present mode: full-screen, song counter | SET-13, PERF-09 | high |
| Column navigation across setlist songs (PERF-07) | PERF-07 | high |
| Long-press pedal: skip song / back to start | PERF-08 | medium |
| Quick-jump tray (slide-out song list in present mode) | PERF-10 | medium |
| PDF export: portrait + landscape, offline | PDF-01–07 | medium |
| BPM display + tap-tempo + visual metronome | — | medium |
| Autoscroll with `{@mm:ss}` time-tag support | — | low |
| Annotations: text, highlight, symbol (private + shared) | — | low |
| Song version diff view + one-tap restore | ED-05 | low |
| Chord validation highlighting in editor | ED-07 | low |
| Filter/sort library: key, tag, artist, BPM, recently used | LIB-08–09 | low |
| Capo helper hint in viewer | VIEW-11 | low |
| Font scale persisted in settings | SETTINGS-05 | low |
| Setlist planned date/time field | SET-11 | low |
| `.cho` / `.chopro` single-file import | IMP-05 | low |
| Deduplication warning on import | IMP-06 | low |

---

## Phase 3 — Collaboration · *future*

Focus: Firestore sync, team sharing, edit presence.

| Item | Req IDs | Priority |
|------|---------|----------|
| Firestore manual sync with last-write-wins | SYNC-01–02 | critical |
| Sync status badge (🟢🟡🔴✈️) | SYNC-03 | high |
| Edit presence banner ("⚠ Lisa is editing") | SYNC-04 | high |
| Stage safety: present mode disables all sync | SYNC-05 | high |
| Google Sign-In (Firebase Auth) | AUTH-01 | high |
| Shared books/setlists — invite by Google email | SYNC-06 | medium |
| ZIP bulk export | — | low |
| Share-link for single song snapshot | — | low |

---

## Phase 4 — Polish · *deferred*

| Item | Req IDs | Notes |
|------|---------|-------|
| Viewer role (read-only teammates) | — | |
| Published / locked books and setlists | — | |
| Setlist duplication for recurring services | SET-12 | |
| Additional UI languages (beyond EN/DE) | — | |
| Chord diagram rendering for `{chord:}` / `{define:}` | — | Out of scope per spec |

---

## Technical Debt & Infrastructure

| Item | Priority | Notes |
|------|----------|-------|
| Add `public/icons/icon-192.png` + `icon-512.png` | high | Placeholder SVG renders to PNG |
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

---

*Last updated: 2026-03-29*
