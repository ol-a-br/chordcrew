# ChordCrew — Pre-Handoff Checklist

Use this before handing off or sharing any build. All items must be green.

---

## Automated checks

| # | Check | How |
|---|-------|-----|
| 1 | TypeScript builds without errors | `npm run build` |
| 2 | All 26 Playwright tests pass | `npm test` |
| 3 | Dev server starts cleanly | `npm run dev` → localhost:5173 |

---

## Manual spot-checks (real imported data)

These require the chords.wiki import to be loaded. Go to `/import` and load
`data/chords_wiki_library_export_20260329.json` if the DB is empty.

| # | What to check | Expected |
|---|---------------|----------|
| 4 | Open any imported song in Viewer | `[A]` `[B]` `[C]` badges visible before each section |
| 5 | Open a song that has a Chorus section | Vertical left border on the chorus block |
| 6 | Transpose a song with a known key (+2) | Key display shows e.g. `G → A`; 3 chord previews appear below stepper |
| 7 | Open a Setlist → click it | SetlistDetailPage loads with ordered song list |
| 8 | Click a song inside the setlist | Opens Viewer with `←  2/8  →` setlist nav in toolbar |
| 9 | Viewer in landscape on tablet/browser | Default 4 columns selected |
| 10 | Performance mode → press ArrowRight pedal | Jumps exactly one screen height (no smooth scroll) |
| 11 | Performance mode → reach bottom → ArrowRight | Advances to next setlist song (if in setlist context) |

---

## Before each commit / push

- [ ] `npm run build` — no TypeScript errors
- [ ] `npm test` — all 26 tests green
- [ ] Update `docs/roadmap.md` if a planned item became done
- [ ] Update `docs/requirements.md` status fields for any new/completed req

---

*Last updated: 2026-03-30*
