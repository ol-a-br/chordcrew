# ChordCrew — Pre-Handoff Checklist

Use this before handing off or sharing any build. All items must be green.

---

## Automated checks

| # | Check | How |
|---|-------|-----|
| 1 | TypeScript builds without errors | `npm run build` |
| 2 | All Playwright tests pass | `npm test` |
| 3 | Dev server starts cleanly | `npm run dev` → localhost:5173 |

---

## Manual spot-checks (real imported data)

These require the chords.wiki import to be loaded. Go to `/import` and load
`data/chords_wiki_library_export_20260329.json` if the DB is empty.

### Rendering & Viewer

| # | What to check | Expected |
|---|---------------|----------|
| 4 | Open any imported song in Viewer | `[A]` `[B]` `[C]` badges visible before each section |
| 5 | Open a song that has a Chorus section | Vertical left border on the chorus block |
| 6 | Transpose a song with a known key (+2) | Key display shows e.g. `G → A`; 3 chord previews appear below stepper |
| 7 | Open a long song with multiple columns | Long lines wrap within their column (no horizontal overflow) |
| 8 | Open a song in multi-column view — press ArrowRight | Scrolls exactly one column width; at last column shows "End of song" toast |
| 9 | Press ArrowLeft at first column | Shows "Beginning of song" toast |
| 10 | Chord+lyric pair that would split across a column break | The entire `.row` stays in one column (no orphaned chord above lyric in next col) |

### Setlists

| # | What to check | Expected |
|---|---------------|----------|
| 11 | Open a Setlist → click it | SetlistDetailPage loads with ordered song list |
| 12 | Click a song inside the setlist | Opens Viewer with `← 2/8 →` setlist nav in toolbar |
| 13 | Viewer: reach last song → press ArrowRight | Toast "Last song in setlist" appears; no crash |
| 14 | Viewer: first song → press ArrowLeft | Toast "First song in setlist" appears |
| 15 | SetlistDetailPage: drag to reorder songs | Order persists after reload |
| 16 | SetlistDetailPage: per-slot transpose | Song opens in Viewer with the slot's transpose applied |

### Performance mode

| # | What to check | Expected |
|---|---------------|----------|
| 17 | Viewer in landscape on tablet/browser | Default 4 columns selected |
| 18 | Performance mode → press ArrowRight pedal | Advances exactly one column (page-flip, no smooth scroll) |
| 19 | Performance mode → reach end → ArrowRight | Advances to next setlist song |
| 20 | Long-press pedal (hold ArrowRight) | Skips to next song in setlist |
| 21 | Quick-jump tray in Performance mode | Slide-out song list appears; tap a song navigates directly |

### Sync & Teams (requires Firebase)

| # | What to check | Expected |
|---|---------------|----------|
| 22 | Sign in with Google | User avatar appears in AppShell; sync badge visible |
| 23 | Edit a song → Settings → Sync Now | Sync badge cycles syncing → clean |
| 24 | Create a team | Team appears in `/teams` list |
| 25 | Invite a teammate by email | Pending invite shown in TeamDetailPage |
| 26 | Invitee opens app → accepts invite | Invite clears from owner's TeamDetailPage (via onSnapshot, no manual refresh) |
| 27 | Team song library | Switching to team space in Library sidebar shows only that team's songs |
| 28 | Copy/Move song to team | Song appears in team space; original personal space unaffected (copy) or cleared (move) |

### PDF export

| # | What to check | Expected |
|---|---------------|----------|
| 29 | Song → Print (single song) | Browser print dialog opens with white background, readable chords |
| 30 | Setlist → Print | All songs in setlist render on white with page breaks between songs |

---

## Before each commit / push

- [ ] `npm run build` — no TypeScript errors
- [ ] `npm test` — all tests green
- [ ] Update `docs/roadmap.md` if a planned item became done
- [ ] Update `docs/requirements.md` status fields for any new/completed req

---

*Last updated: 2026-04-04*
