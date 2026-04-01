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
| **Song List** | Scrollable list of song rows in the library |
| **Song Row** | One entry in the song list: title, artist, tag chips, favorite star |
| **Tag Browser** | Sidebar panel listing all tags for filtering the song list |
| **Search Bar** | Text input at the top of the library for filtering songs |

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
| **Viewer Toolbar** | Top bar with song title, setlist nav, key/tempo badges, transpose control, column picker, lyrics-only toggle, font size buttons, favorite star, Present button, Edit button |
| **Song Content Area** | Scrollable area below the toolbar showing the rendered song |
| **Transpose Control** | Up/down chevron buttons with a numeric offset indicator (e.g. +2) |
| **Column Picker** | Row of buttons 1–5 for selecting multi-column layout |
| **Key Badge** | 𝄞 key chip in the toolbar showing the song key (and transposed key when active) |
| **Tempo Badge** | ♩ bpm indicator in the toolbar |

---

## Performance Page

| Name | Description |
|------|-------------|
| **Performance Overlay** | Auto-hiding translucent top bar with controls (fades out after 3 s of inactivity) |
| **Song Display Area** | Full-screen area showing the rendered song content |
| **Page-Flip Container** | Horizontal scroll container used in multi-column mode (scrollbar hidden) |
| **Tap Zones** | Left and right halves of the screen: tap left = previous, tap right = next |

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
| **Setlist List** | Overview list of all setlists |
| **Setlist Row** | One entry: name, date, song count |
| **Setlist Detail** | Page showing an ordered list of songs (and dividers) in a setlist |
| **Setlist Nav** | Prev/next song chevrons + position counter (e.g. 2/8) in the Viewer/Performance toolbar when launched from a setlist |

---

*Last updated: 2026-03-31*
