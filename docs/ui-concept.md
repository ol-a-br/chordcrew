# ChordCrew — UI Concept & Element Names

This document defines the canonical names for all UI areas and elements used in ChordCrew.
Use these terms consistently in code comments, commit messages, and issue reports.

---

## App-Level Areas

| Name | Description |
|------|-------------|
| **App Shell** | The outer chrome: sidebar (desktop) or top bar (mobile) + main content area |
| **Sidebar** | Left-side navigation panel with links to Library, Setlists, Import, Settings |
| **Mobile Top Bar** | Collapsed navigation bar shown on narrow screens instead of the sidebar |
| **Main Content Area** | The scrollable area to the right of the sidebar |

---

## Library Page

| Name | Description |
|------|-------------|
| **Library Sidebar** | Left panel (desktop): All Songs, Favorites, Books, Teams, Tags, Key sections for navigation |
| **Song List** | Scrollable list of song rows in the right panel |
| **Song Row** | One entry in the song list: title, artist, key badge, tag, favorite star, edit chevron |
| **Tag Browser** | Sidebar section listing all tags for filtering the song list |
| **Key Filter** | Sidebar section listing unique song keys for filtering |
| **Search Bar** | Text input at the top of the library for filtering songs |
| **Select Mode** | Activated via the checkbox icon in the header; turns song rows into checkboxes for multi-selection |
| **Bulk Share Bar** | Dropdown in the header during Select Mode: "Share to team" with Copy / Move options for each team |
| **Team Context** | Clicking a team in the sidebar switches the song list to show only that team's songs; role-aware (readers see no edit/create buttons) |

---

## Editor Page

| Name | Description |
|------|-------------|
| **Editor Toolbar** | Top bar with X (close), song title, dirty indicator, preview toggle, View and Save buttons |
| **Metadata Bar** | Row of compact input fields (Title, Artist, Key, Tempo, Capo, Time) directly below the toolbar |
| **Tags Bar** | Row below the metadata bar with tag chips and an add-tag input |
| **Editor Pane** | Left half of the split view — CodeMirror 6 text editor for ChordPro source |
| **Preview Pane** | Right half of the split view — live rendered song output |
| **Split Divider** | The 1px vertical rule between the editor and preview panes |

---

## Viewer Page

| Name | Description |
|------|-------------|
| **Viewer Toolbar** | Top bar with song title, setlist nav, key badge, tempo badge, transpose control, column picker, lyrics-only toggle, font size buttons, favorite star, print, share, Present button, Edit button |
| **Song Content Area** | Scrollable area (single-column) or horizontal page-flip container (multi-column) below the toolbar |
| **Key Badge** | 𝄞 key chip in the toolbar; click to open the Key Dropdown. Shows `G → A` when transposed |
| **Key Dropdown** | 12-row picker that appears when the Key Badge is clicked. Rows run from −5 to +6 semitones relative to the original key. Each row: signed delta, target key name, first 4 chords as preview chips. The row matching the current transpose is highlighted |
| **Transpose Control** | Up/down chevron buttons with a numeric offset indicator (e.g. +2); fine-grained semitone stepping |
| **Column Picker** | Row of buttons 1–5 for selecting multi-column layout |
| **Tempo Badge** | ♩ bpm indicator in the toolbar |
| **Capo Badge** | Shows capo number and sounding key (e.g. Capo 2 → A) when capo > 0 |
| **Page-Flip Container** | In multi-column mode (columns > 1): horizontal scroll div with hidden scrollbar; arrow keys advance exactly one column width. At the last column, ArrowRight navigates to the next setlist song |
| **Setlist Boundary Toast** | 2-second auto-dismiss pill shown at the bottom when the user tries to navigate past the first or last song in the setlist |
| **Share Menu** | Dropdown for Copy / Move the current song to a team space (visible when the user is a contributor/owner in at least one team) |

---

## Performance Page

| Name | Description |
|------|-------------|
| **Performance Overlay** | Auto-hiding translucent top bar with controls (fades out after 3 s of inactivity) |
| **Song Display Area** | Full-screen area showing the rendered song content |
| **Page-Flip Container** | Horizontal scroll container used in multi-column mode (scrollbar hidden). One "page" = the visible viewport width. Scrollbar is hidden; navigation is via pedal/tap/arrow keys only |
| **Tap Zones** | Left and right halves of the screen: tap left = previous column/song, tap right = next column/song |
| **Setlist Tray** | Slide-out song list in Performance mode; tap a song to jump directly to it |
| **Metronome** | Visual flash indicator in Performance mode, driven by song BPM |

---

## Column Navigation & Page-Flip

Column navigation is consistent across Viewer and Performance pages.

| Concept | Detail |
|---------|--------|
| **Column count** | 1–5 columns selectable via Column Picker; default is 4 (landscape) or 2 (portrait) |
| **Column stride** | `scrollContainer.clientWidth / columns` — the exact pixel distance scrolled on each arrow/pedal press |
| **ArrowRight / pedal next** | Scrolls one stride right. At the last column (scroll position + viewport ≥ content width − 10 px), navigates to the next setlist song instead |
| **ArrowLeft / pedal prev** | Scrolls one stride left. At the first column (scroll position < 10 px), navigates to the previous setlist song instead |
| **Long-press pedal (PerformancePage)** | Holding the pedal key > 600 ms skips to the next song in the setlist |
| **Boundary toast (ViewerPage)** | A 2-second pill notification appears at the bottom when navigation cannot go further in either direction |
| **CSS layout** | `.chordpro-output.page-flip` sets `column-fill: auto` so content flows into columns left-to-right. `.row { break-inside: avoid }` prevents a chord/lyric pair from splitting across a column break. `.paragraph { break-inside: avoid }` keeps a whole section together |
| **Word wrap** | `.column { white-space: pre-wrap; overflow-wrap: break-word; max-width: 100% }` — preserves inter-chord spacing while allowing long lines to wrap within a column |

---

## Font Scaling & Zoom

ChordCrew uses CSS `font-size` scaling, not browser pinch-zoom.

| Concept | Detail |
|---------|--------|
| **Font scale** | A multiplier (0.7 – 2.5×) applied to the render area via `style={{ fontSize: \`${fontScale}em\` }}` |
| **ZoomIn / ZoomOut buttons** | Step by 0.1× per press; available in Viewer and Performance toolbars |
| **Persistence** | Font scale is stored in `localStorage` via `useFontScale` hook so it survives page reloads |
| **Interaction with columns** | Larger font → fewer columns fit comfortably; user adjusts column count manually. There is no automatic column adjustment on font change |
| **Pinch-to-zoom** | Not yet implemented (deferred, medium priority). Browser native pinch-zoom works as a fallback on mobile |

---

## Render Area (Song Renderer)

| Name | Description |
|------|-------------|
| **Render Area** | The `<div class="chordpro-output">` element containing the formatted song |
| **Paragraph** | One section block (`.paragraph`) — wraps rows for one song section |
| **Row** | One line of chord+lyric pairs (`.row`) — flex container of columns |
| **Column** | One chord-above-lyric unit (`.column`) — inline-flex with chord on top, lyric below |
| **Chord** | The chord name displayed above the lyric (`.chord`) — styled amber/yellow |
| **Lyric** | The lyric text below the chord (`.lyrics`) |
| **Section Header** | The label that names a section — either a directive-style `h3.label` or a bracket-notation first row |
| **Section Badge** | The bordered letter box [A], [B], [C2] etc. prepended to a section header or repeat indicator |
| **Chorus Bar** | The vertical left border (2px, chord colour at 50% opacity) on chorus paragraphs |
| **Repeat Indicator** | A comment line starting with ↺ generated from `{repeat: SectionName}`, showing the repeat badge |
| **Inline Chord Line** | A comment line from `{inline:}` showing bar/beat structure with chord names on one baseline |
| **Song Title** | The `{title:}` directive rendered large at the top of the render area (`.title`) |
| **Song Subtitle** | The `{subtitle:}` directive rendered smaller beneath the title (`.subtitle`) |
| **Tab Block** | A monospaced pre-formatted guitar tab block (`.tab`) |

---

## Setlists Page & Detail

| Name | Description |
|------|-------------|
| **Setlists Sidebar** | Left panel (desktop): "My Setlists" + one entry per team the user belongs to. Mirrors the Library Sidebar pattern |
| **Mobile Context Tabs** | Horizontal pill-tab strip above the setlist list on narrow screens; switches between personal and team contexts |
| **Team Context (Setlists)** | Clicking a team in the sidebar shows only that team's setlists; readers see no create button |
| **Setlist List** | Scrollable list of setlist rows in the active context |
| **Setlist Row** | One entry: name, date, song count, team icon (if shared), duplicate + open buttons |
| **Setlist Detail** | Page showing an ordered list of songs (and dividers) in a setlist |
| **Setlist Nav** | Prev/next song chevrons + position counter (e.g. 2/8) in the Viewer/Performance toolbar when launched from a setlist |

---

*Last updated: 2026-04-04*
