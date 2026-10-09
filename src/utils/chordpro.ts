import ChordSheetJS, { Chord } from 'chordsheetjs'
import DOMPurify from 'dompurify'

const { ChordProParser, HtmlDivFormatter, TextFormatter } = ChordSheetJS

// ─── HTML sanitization ───────────────────────────────────────────────────────
// chordsheetjs's HtmlDivFormatter does NOT escape song text: a title, lyric,
// chord, comment or section label containing markup is emitted as raw HTML.
// Song content is untrusted (share links, team songs, imports), and the output
// is injected with dangerouslySetInnerHTML — so every render is passed through
// an allow-list sanitizer limited to the structure chordsheetjs produces.
const SANITIZE_CONFIG = {
  ALLOWED_TAGS: ['div', 'span', 'h1', 'h2', 'h3', 'h4', 'table', 'tbody', 'tr', 'td', 'br'],
  ALLOWED_ATTR: ['class'],
}

export function sanitizeSongHtml(html: string): string {
  // Fail closed: without a DOM, DOMPurify would return its input unchanged.
  if (!DOMPurify.isSupported) throw new Error('HTML sanitizer unavailable')
  return DOMPurify.sanitize(html, SANITIZE_CONFIG)
}

// ─── Preprocess chords.wiki extensions before standard parse ─────────────────
// {sop: Name} / {start_of_part: Name} → {start_of_verse: Name}
// {eop} / {end_of_part} → {end_of_verse}
// These are chords.wiki-specific and not supported by chordsheetjs natively.

export function preprocessChordPro(content: string): string {
  // ── Normalize consecutive spaces in lyrics lines ──────────────────────────
  // chordsheetjs splits text at the first word boundary after a chord, creating
  // extra columns with empty chords.  Worse, it converts runs of 2+ spaces into
  // ", " (comma + space) — a parser bug.  Normalizing 2+ spaces to a single
  // space avoids both issues.  Skip directive lines ({…}) and tab/grid blocks
  // where spacing is meaningful for alignment.
  const lines = content.split('\n')
  let inLiteral = false
  const normalizedLines = lines.map(line => {
    if (/\{(?:start_of_tab|sot|start_of_grid|sog)\b/i.test(line)) { inLiteral = true; return line }
    if (/\{(?:end_of_tab|eot|end_of_grid|eog)\b/i.test(line)) { inLiteral = false; return line }
    if (inLiteral) return line
    if (line.trimStart().startsWith('{')) return line
    // A chord immediately followed by 2+ spaces (e.g. "[F]   Ich") signals a
    // deliberate pause before the lyric starts. chordsheetjs drops ANY plain
    // whitespace directly after a chord bracket entirely (the column ends up
    // with empty lyrics and the gap vanishes), so swap it for a single
    // non-breaking space first — chordsheetjs's word-boundary splitter doesn't
    // treat U+00A0 as a break point, so it survives as visible spacing before
    // the word instead of being eaten.
    line = line.replace(/(\])  +(?=\S)/g, '$1 ')
    return line.replace(/  +/g, ' ')
  })
  content = normalizedLines.join('\n')

  return content
    // chords.wiki start_of_part / sop → standard labeled section
    .replace(/\{sop\s*:\s*([^}]+)\}/gi, '{start_of_verse: $1}')
    .replace(/\{start_of_part\s*:\s*([^}]+)\}/gi, '{start_of_verse: $1}')
    .replace(/\{eop\b[^}]*\}/gi, '{end_of_verse}')
    .replace(/\{end_of_part\b[^}]*\}/gi, '{end_of_verse}')
    // Anonymous section directives → add default label so badge tracking works.
    // {start_of_verse} → {start_of_verse: Verse}
    // {start_of_chorus} → {start_of_chorus: Chorus} (keeps .paragraph.chorus CSS class)
    // Must run before named variants to avoid double-matching.
    .replace(/\{start_of_verse\s*\}/gi, '{start_of_verse: Verse}')
    .replace(/\{start_of_bridge\s*\}/gi, '{start_of_bridge: Bridge}')
    .replace(/\{(start_of_chorus)\s*\}/gi, '{$1: Chorus}')
    .replace(/\{(soc)\s*\}/gi, '{start_of_chorus: Chorus}')
    // {soc: Name} shorthand with explicit name
    .replace(/\{soc\s*:\s*([^}]+)\}/gi, '{start_of_chorus: $1}')
    .replace(/\{eoc\b[^}]*\}/gi, '{end_of_chorus}')
    // {inline: | [C] / / / | [F2] / / / |} → a comment line where each [Chord] is
    // replaced with «Chord» (guillemet markers). SongRenderer detects the «»
    // markers and injects chord-styled <span>s, keeping everything on one baseline.
    .replace(/\{inline\s*:\s*([^}]+)\}/gi, (_m, c: string) => {
      const marked = c.trim().replace(/\[([^\]]*)\]/g, '«$1»')
      return `{comment: ${marked}}`
    })
    // {repeat: Chorus} or {repeat: Chorus 2x} → a ↺ comment line that SongRenderer
    // uses in Pass 2 to inject the correct repeat badge (e.g. A2, C3).
    // Using a comment (not start_of_verse) avoids incorrect badge assignment order.
    .replace(/\{repeat\s*:\s*([^}]+)\}/gi, (_m, c: string) => {
      const s = c.trim().replace(/\s+/g, ' ')
      const xm = s.match(/^(.*?)\s+(\d+)x\s*$/i)
      if (xm) return `{comment: ↺ ${xm[1].trim()} ×${xm[2]}}`
      return `{comment: ↺ ${s}}`
    })
    // {new_song} — multi-song file separator; ignore in single-song view
    .replace(/\{new_song[^}]*\}/gi, '')
}

// ─── Parse ────────────────────────────────────────────────────────────────────

export function parseChordPro(content: string) {
  const parser = new ChordProParser()
  try {
    return parser.parse(preprocessChordPro(content))
  } catch {
    // Return empty song on parse error
    return parser.parse('{title:Parse Error}\n')
  }
}

// ─── Render to HTML ───────────────────────────────────────────────────────────

export function renderToHtml(content: string, transposeOffset = 0): string {
  let song = parseChordPro(content)

  if (transposeOffset !== 0) {
    const originalKey = content.match(/\{key\s*:\s*([^}]+)\}/i)?.[1]?.trim() ?? ''
    // Transpose every chord via transposeChordName (key-aware normalize — see
    // its definition for why chordsheetjs's own Chord.useModifier() is not used
    // directly). mapItems also fixes optional chords like (Gm) that
    // song.transpose() used to skip because Chord.parse('(Gm)') returns null.
    song = song.mapItems((item) => {
      const pair = item as { chords?: string; set?: (o: Record<string, unknown>) => unknown }
      if (pair.chords && pair.set) {
        const c = pair.chords as string
        const isOptional = c.startsWith('(') && c.endsWith(')')
        const name = isOptional ? c.slice(1, -1) : c
        const chord = Chord.parse(name)
        if (!chord) return item
        const transposed = transposeChordName(name, transposeOffset, originalKey)
        return pair.set({ chords: isOptional ? `(${transposed})` : transposed }) as typeof item
      }
      return item
    })
  }

  // chordsheetjs's Html formatters auto-transpose chords by -capo semitones and
  // re-normalize chord suffixes (e.g. "Cmaj7" → "Cma7") at render time whenever a
  // {capo} directive is present — regardless of any transpose we already applied.
  // ChordCrew treats {capo} as informational only (shown via a separate "Capo N"
  // helper in the UI); the chords in the body are what should render, verbatim.
  song = song.setCapo(null)

  const formatter = new HtmlDivFormatter({ normalizeChords: false })
  return sanitizeSongHtml(formatter.format(song))
}

// ─── Render to plain text ─────────────────────────────────────────────────────

export function renderToText(content: string, transposeOffset = 0): string {
  let song = parseChordPro(content)
  if (transposeOffset !== 0) {
    const originalKey = content.match(/\{key\s*:\s*([^}]+)\}/i)?.[1]?.trim() ?? ''
    // Same transposeChordName-based transpose as renderToHtml.
    song = song.mapItems((item) => {
      const pair = item as { chords?: string; set?: (o: Record<string, unknown>) => unknown }
      if (pair.chords && pair.set) {
        const c = pair.chords as string
        const isOptional = c.startsWith('(') && c.endsWith(')')
        const name = isOptional ? c.slice(1, -1) : c
        const chord = Chord.parse(name)
        if (!chord) return item
        const transposed = transposeChordName(name, transposeOffset, originalKey)
        return pair.set({ chords: isOptional ? `(${transposed})` : transposed }) as typeof item
      }
      return item
    })
  }
  song = song.setCapo(null)
  return new TextFormatter({ normalizeChords: false }).format(song)
}

// ─── Extract metadata from ChordPro ──────────────────────────────────────────

export interface ChordProMeta {
  title?: string
  subtitle?: string
  artist?: string
  key?: string
  tempo?: number
  capo?: number
  time?: string
  ccli?: string
  copyright?: string
  url?: string
  kemperRig?: string   // {x_kemper_rig: 17 | 6.2} — raw value, parsed by src/midi/kemper.ts
}

export function extractMeta(content: string): ChordProMeta {
  const meta: ChordProMeta = {}

  const match = (directive: string) => {
    const re = new RegExp(`\\{${directive}\\s*:\\s*([^}]+)\\}`, 'i')
    return content.match(re)?.[1]?.trim()
  }

  meta.title     = match('title') ?? match('t')
  meta.subtitle  = match('subtitle') ?? match('st')
  meta.artist    = match('artist')
  meta.key       = match('key')
  meta.time      = match('time')
  meta.ccli      = match('ccli')
  meta.copyright = match('copyright')
  meta.url       = match('url')
  meta.kemperRig = match('x_kemper_rig')

  const tempo = match('tempo')
  if (tempo) meta.tempo = parseInt(tempo, 10)

  const capo = match('capo')
  if (capo) meta.capo = parseInt(capo, 10)

  return meta
}

/** Replace or insert a ChordPro directive in the content string; an empty value removes it. */
export function setDirective(content: string, directive: string, value: string): string {
  const re = new RegExp(`\\{${directive}\\s*:[^}]*\\}`, 'gi')
  if (re.test(content)) {
    if (value.trim()) return content.replace(re, `{${directive}: ${value}}`)
    // Removing: drop the whole line when the directive stands alone on it
    const ownLine = new RegExp(`^[ \\t]*\\{${directive}\\s*:[^}]*\\}[ \\t]*(\\r?\\n|$)`, 'gim')
    return content.replace(ownLine, '').replace(re, '')
  }
  if (!value.trim()) return content
  return `{${directive}: ${value}}\n${content}`
}

// ─── Expand repeat sections for performance mode ─────────────────────────────
// In performance mode, a song might contain a section label like [Chorus] with
// no content following it (just a repeat marker). This function finds those
// empty repeats and substitutes the full content from the first occurrence,
// so the performer doesn't have to flip back to see the chorus chords.
//
// Handles both bracket-notation ([Chorus]) and directive-notation
// ({start_of_chorus: Chorus} ... {end_of_chorus}).
// A section is considered "empty" if it has no chord markers ([X]) and no
// non-whitespace lyric text (other than directive lines).

function sectionHasContent(lines: string[]): boolean {
  return lines.some(line => {
    if (/\{[^}]*\}/.test(line)) return false  // directive-only line
    if (/\[[A-G][^[\]]*\]/.test(line)) return true  // has a chord
    const stripped = line.replace(/\[[^\]]*\]/g, '').trim()
    return stripped.length > 0  // has lyric text
  })
}

function canonicalSectionName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s+\d+$/, '')     // "Verse 2" → "verse"
    .replace(/\s+×\d+$/i, '')   // "Chorus ×2" → "chorus"
    .replace(/\s*\([^)]*\)/, '') // "Chorus (2)" → "chorus"
    .trim()
}

export function expandRepeatSections(content: string): string {
  const lines = content.split('\n')

  // Detect a standalone bracket heading: entire line is [SomeName] with no chord chars around it
  const bracketHeading = (line: string): string | null => {
    const m = line.match(/^\s*\[([A-Za-z][^\]]+)\]\s*$/)
    if (!m) return null
    // Exclude chord lines like [G], [Am7] etc.
    if (/^[A-G][b#]?[a-z0-9]*$/.test(m[1].trim())) return null
    return m[1].trim()
  }

  // Track first-seen content per canonical name
  const firstContent = new Map<string, string[]>()

  // ── Pass 1: split into segments, collect first-occurrence content ─────────
  type Seg = { heading: string | null; body: string[] }
  const segs: Seg[] = []
  let preamble: string[] = []
  let cur: Seg | null = null

  for (const line of lines) {
    const name = bracketHeading(line)
    if (name !== null) {
      if (cur) segs.push(cur)
      else preamble = [...preamble]  // lock preamble
      cur = { heading: line, body: [] }
    } else {
      if (cur) cur.body.push(line)
      else preamble.push(line)
    }
  }
  if (cur) segs.push(cur)

  for (const seg of segs) {
    if (!seg.heading) continue
    const name = bracketHeading(seg.heading)!
    const key = canonicalSectionName(name)
    if (sectionHasContent(seg.body) && !firstContent.has(key)) {
      firstContent.set(key, seg.body)
    }
  }

  // ── Pass 2: rebuild, expanding empty sections ─────────────────────────────
  const out: string[] = [...preamble]
  for (const seg of segs) {
    out.push(seg.heading ?? '')
    if (sectionHasContent(seg.body)) {
      out.push(...seg.body)
    } else {
      const key = seg.heading ? canonicalSectionName(bracketHeading(seg.heading) ?? '') : ''
      const stored = firstContent.get(key)
      if (stored && stored.length > 0) {
        out.push(...stored)
      } else {
        out.push(...seg.body)  // no stored content, leave as-is
      }
    }
  }

  return out.join('\n')
}

// ─── ChordPro lint: per-line brace / bracket mismatch detection ──────────────

/** What is wrong with a line; the UI shows it via the i18n key `lint.<code>`. */
export type ChordProLintCode = 'unclosedBrace' | 'unexpectedBrace' | 'unclosedBracket' | 'unexpectedBracket'

export interface ChordProError {
  line: number
  code: ChordProLintCode
  text: string
}

export function lintChordPro(content: string): ChordProError[] {
  const errors: ChordProError[] = []
  const lines = content.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const lineNum = i + 1
    const text = lines[i]
    const opens  = (text.match(/\{/g) ?? []).length
    const closes = (text.match(/\}/g) ?? []).length
    if (opens > closes)
      errors.push({ line: lineNum, code: 'unclosedBrace', text })
    else if (closes > opens)
      errors.push({ line: lineNum, code: 'unexpectedBrace', text })
    const openBr  = (text.match(/\[/g) ?? []).length
    const closeBr = (text.match(/\]/g) ?? []).length
    if (openBr > closeBr)
      errors.push({ line: lineNum, code: 'unclosedBracket', text })
    else if (closeBr > openBr)
      errors.push({ line: lineNum, code: 'unexpectedBracket', text })
  }
  return errors
}

// ─── Detect if a title looks like a raw filename ─────────────────────────────

export function looksLikeFilename(title: string): boolean {
  return /[_-]/.test(title) && /\.(txt|cho|chopro)$/i.test(title)
}

// ─── Build search text for a song ────────────────────────────────────────────

export function buildSearchText(
  title: string,
  artist: string,
  tags: string[],
  content: string
): string {
  // Strip ChordPro directives and chord markers for raw lyric text
  const lyrics = content
    .replace(/\{[^}]*\}/g, ' ')      // remove directives
    .replace(/\[[^\]]*\]/g, ' ')     // remove chord markers
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 500)                   // limit to first 500 chars

  return [title, artist, ...tags, lyrics].join(' ').toLowerCase()
}

// ─── Standard chord names (for validation hints) ─────────────────────────────

// Includes the rare theoretical naturals (Cb, Fb, E#, B#) so songs whose
// authors wrote them still render as chords. Transposition never produces
// them (see transposeChordName).
const ROOTS = ['C', 'C#', 'Db', 'D', 'D#', 'Eb', 'E', 'E#', 'F', 'F#', 'Gb', 'G', 'G#', 'Ab', 'A', 'A#', 'Bb', 'B', 'B#', 'Cb', 'Fb']
const QUALITIES = [
  '', 'm', 'maj7', 'm7', '7', 'sus', 'sus2', 'sus4', 'dim', 'aug',
  'add9', 'add2', 'add4', 'add11', '6', '9', '11', '13',
  'maj9', 'maj11', 'maj13', 'm6', 'm9', 'm11', 'm13',
  'mmaj7', 'dim7', 'm7b5', '7sus4', '7sus2',
  '5', '2', '4',
]

export function isKnownChord(chord: string): boolean {
  const base = chord.split('/')[0]
  for (const r of ROOTS) {
    if (!base.startsWith(r)) continue
    const quality = base.slice(r.length)
    // Normalize parenthesized modifier: "(4)" → "4"
    const normalized = (quality.startsWith('(') && quality.endsWith(')'))
      ? quality.slice(1, -1) : quality
    if (QUALITIES.includes(normalized)) return true
    // Accept pure numeric modifiers (number-notation style: D4, C2, G(4))
    if (/^\d{1,2}$/.test(normalized)) return true
    // Accept compound numeric+quality modifiers (e.g. 2sus → Esus2, 9sus4, 4add9)
    if (/^\d+(sus|add|maj|min|m)\d*$/.test(normalized)) return true
    // Accept (noX) omit modifier: C2(no3), Cadd9(no3), C(no3)
    // Case 1: (noX) embedded after a base quality — e.g. normalized = '2(no3)'
    const noModMatch = normalized.match(/^(.*)\(no\d+\)$/)
    if (noModMatch) {
      const base = noModMatch[1]
      if (base === '' || QUALITIES.includes(base) || /^\d{1,2}$/.test(base) || /^\d+(sus|add|maj|min|m)\d*$/.test(base)) return true
    }
    // Case 2: (noX) was the entire quality, parens already stripped — e.g. normalized = 'no3'
    if (/^no\d+$/.test(normalized)) return true
  }
  return false
}

// ─── Key validation ───────────────────────────────────────────────────────────

const VALID_KEY_RE = /^[A-G][b#]?m?(aj)?$/

export function isValidKey(key: string): boolean {
  return VALID_KEY_RE.test(key.trim())
}

// ─── Enharmonic spelling for transposition ───────────────────────────────────
// Transposed keys and chords are spelled here rather than by chordsheetjs.
// Its Key.transpose() lands on theoretical keys (Eb +1 → "Fb", F# -1 → "E#",
// C +3 → "D#") and its key-aware normalize() relies on a small, incomplete
// enharmonics table — e.g. in a song in A, transposing down 3 semitones spelled
// the G chord (now E) as "Fb", and Am in a song in G became "Gbm" instead of
// "F#m". Chord charts never use those names.
//
// Rules: the target key always gets its common spelling (Db, Eb, Ab, Bb, C#m,
// G#m, …; the tritone key follows the transpose direction: F#/D#m up, Gb/Ebm
// down). Each transposed root and bass note is spelled by its scale degree in
// that key, and the theoretical names Cb, Fb, E#, B# become B, E, F, C.

const NATURAL_PC: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }
const LETTERS = 'CDEFGAB'
const SHARP_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
const FLAT_NAMES  = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B']

// Common key spelling per pitch class (C = 0); null = tritone, spelled by direction
const MAJOR_KEY_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', null, 'G', 'Ab', 'A', 'Bb', 'B']
const MINOR_KEY_NAMES = ['C', 'C#', 'D', null, 'E', 'F', 'F#', 'G', 'G#', 'A', 'Bb', 'B']

// Letter steps above the tonic for each semitone interval: the diatonic degrees
// plus the usual chromatic chords — in major #1 (C#dim passing chord in C), b3,
// #4 (D/F#), b6, b7; in minor b2, #3 (A/C# in Am), #4, #6 (D/F#), #7 (E/G#).
const MAJOR_STEPS = [0, 0, 1, 2, 2, 3, 3, 4, 5, 5, 6, 6]
const MINOR_STEPS = [0, 1, 1, 2, 2, 3, 3, 4, 5, 5, 6, 6]

const PRACTICAL_NAMES: Record<string, string> = { Cb: 'B', Fb: 'E', 'E#': 'F', 'B#': 'C' }

const KEY_RE = /^([A-G][b#]?)(m(?:aj)?)?\s*$/
const NOTE = '[A-G][b#]?'

function pitchClass(note: string): number {
  const offset = note.slice(1) === '#' ? 1 : note.slice(1) === 'b' ? -1 : 0
  return (NATURAL_PC[note[0]] + offset + 12) % 12
}

/** Spell pitch class `pc` as a scale degree of the key `tonic` (major or minor). */
function spellInKey(pc: number, tonic: string, minor: boolean): string {
  const interval = (pc - pitchClass(tonic) + 12) % 12
  const steps = (minor ? MINOR_STEPS : MAJOR_STEPS)[interval]
  const letter = LETTERS[(LETTERS.indexOf(tonic[0]) + steps) % 7]
  const offset = (pc - NATURAL_PC[letter] + 18) % 12 - 6   // -6..5
  // A double accidental (e.g. C## as the leading tone of D#m) → nearest plain name
  if (Math.abs(offset) > 1) return offset > 0 ? SHARP_NAMES[pc] : FLAT_NAMES[pc]
  const name = letter + (offset === 1 ? '#' : offset === -1 ? 'b' : '')
  return PRACTICAL_NAMES[name] ?? name
}

// ─── Transpose a key name by N semitones ──────────────────────────────────────
// Only for simple key names (e.g. "G", "Am", "F#"). For full chord names with
// quality suffixes use transposeChordName instead.

export function transposeKey(key: string, semitones: number): string {
  if (!key || semitones === 0) return key
  const m = key.trim().match(KEY_RE)
  if (!m) return key
  const [, root, quality = ''] = m
  const minor = quality === 'm'
  const pc = (pitchClass(root) + (semitones % 12) + 12) % 12
  const tonic = (minor ? MINOR_KEY_NAMES : MAJOR_KEY_NAMES)[pc]
    ?? (semitones > 0 ? SHARP_NAMES[pc] : FLAT_NAMES[pc])
  return tonic + quality
}

// ─── Transpose any chord name (including quality suffixes) ───────────────────
// originalKey (the song's declared {key}) determines the target key whose
// scale the transposed root and bass are spelled in (see above). Without a
// usable key, notes are spelled with sharps going up and flats going down.
// The quality suffix is kept exactly as written.

export function transposeChordName(
  chordName: string,
  semitones: number,
  originalKey = '',
): string {
  if (!chordName || semitones === 0) return chordName
  try {
    if (!Chord.parse(chordName)) return chordName
    const m = chordName.match(new RegExp(`^(${NOTE})(.*?)(?:/(${NOTE}))?$`))
    // Notation the speller doesn't handle (e.g. ♯/♭ symbols) → chordsheetjs as before
    if (!m) return Chord.parse(chordName)!.transpose(semitones).toString()
    const [, root, suffix, bass] = m
    const target = transposeKey(originalKey.trim(), semitones).match(KEY_RE)
    const spell = (note: string) => {
      const pc = (pitchClass(note) + (semitones % 12) + 12) % 12
      if (target) return spellInKey(pc, target[1], target[2] === 'm')
      return semitones > 0 ? SHARP_NAMES[pc] : FLAT_NAMES[pc]
    }
    return spell(root) + suffix + (bass ? '/' + spell(bass) : '')
  } catch {
    return chordName
  }
}

// ─── Extract first N unique chords from a song (after transposition) ─────────

export function getFirstChords(content: string, transposeOffset: number, limit = 3): string[] {
  const html = renderToHtml(content, transposeOffset)
  const parser = new DOMParser()
  const doc = parser.parseFromString(`<div>${html}</div>`, 'text/html')
  const chords: string[] = []
  doc.querySelectorAll('.chord').forEach(el => {
    if (chords.length >= limit) return
    const text = el.textContent?.trim() ?? ''
    if (text && isKnownChord(text) && !chords.includes(text)) {
      chords.push(text)
    }
  })
  return chords
}
