import ChordSheetJS, { Chord } from 'chordsheetjs'

const { ChordProParser, HtmlDivFormatter, TextFormatter } = ChordSheetJS

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
    const modifier = originalKey ? targetAccidental(originalKey, transposeOffset) : null
    song = song.transpose(transposeOffset)
    // Always run mapItems to:
    // (a) apply flat/sharp preference when a key is present
    // (b) fix optional chords like (Gm) that song.transpose() skips because
    //     Chord.parse('(Gm)') returns null — we strip/restore the parens manually
    song = song.mapItems((item) => {
      const pair = item as { chords?: string; set?: (o: Record<string, unknown>) => unknown }
      if (pair.chords && pair.set) {
        const c = pair.chords as string
        const isOptional = c.startsWith('(') && c.endsWith(')')
        const name = isOptional ? c.slice(1, -1) : c
        const chord = Chord.parse(name)
        if (!chord) return item
        if (isOptional) {
          // song.transpose() skipped this chord — transpose it now via semitone lookup
          const transposed = transposeChordName(name, transposeOffset, originalKey)
          return pair.set({ chords: `(${transposed})` }) as typeof item
        }
        if (modifier) {
          return pair.set({ chords: chord.useModifier(modifier).toString() }) as typeof item
        }
      }
      return item
    })
  }

  const formatter = new HtmlDivFormatter()
  return formatter.format(song)
}

// ─── Render to plain text ─────────────────────────────────────────────────────

export function renderToText(content: string, transposeOffset = 0): string {
  let song = parseChordPro(content)
  if (transposeOffset !== 0) {
    song = song.transpose(transposeOffset)
  }
  return new TextFormatter().format(song)
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

  const tempo = match('tempo')
  if (tempo) meta.tempo = parseInt(tempo, 10)

  const capo = match('capo')
  if (capo) meta.capo = parseInt(capo, 10)

  return meta
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

export interface ChordProError {
  line: number
  message: string
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
      errors.push({ line: lineNum, message: 'Unclosed directive brace — add a closing }', text })
    else if (closes > opens)
      errors.push({ line: lineNum, message: 'Unexpected } — no matching {', text })
    const openBr  = (text.match(/\[/g) ?? []).length
    const closeBr = (text.match(/\]/g) ?? []).length
    if (openBr > closeBr)
      errors.push({ line: lineNum, message: 'Unclosed chord bracket — add a closing ]', text })
    else if (closeBr > openBr)
      errors.push({ line: lineNum, message: 'Unexpected ] — no matching [', text })
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

const ROOTS = ['C', 'C#', 'Db', 'D', 'D#', 'Eb', 'E', 'F', 'F#', 'Gb', 'G', 'G#', 'Ab', 'A', 'A#', 'Bb', 'B']
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

// ─── Enharmonic preference by target key ─────────────────────────────────────
// Determines whether the target key uses sharps or flats, so transposed chords
// are spelled correctly (e.g. C#m in D, not Dbm).

const NOTE_SEMITONE: Record<string, number> = {
  'B#': 0, C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3,
  E: 4, 'E#': 5, Fb: 4, F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8,
  Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11, Cb: 11,
}

const SHARP_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
const FLAT_NAMES  = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B']

function transposeNoteName(note: string, semitones: number, useFlats: boolean): string {
  const base = NOTE_SEMITONE[note]
  if (base === undefined) return note
  const target = ((base + semitones) % 12 + 12) % 12
  return useFlats ? FLAT_NAMES[target] : SHARP_NAMES[target]
}
// Tonic semitones that prefer flats, by major/minor key
const FLAT_MAJOR = new Set([5, 10, 3, 8, 1, 6, 11])  // F Bb Eb Ab Db Gb Cb
const FLAT_MINOR = new Set([2, 7, 0, 5, 10, 3, 8])    // Dm Gm Cm Fm Bbm Ebm Abm

function targetAccidental(originalKey: string, delta: number): '#' | 'b' {
  const rootMatch = originalKey.match(/^([A-G][b#]?)/)
  if (!rootMatch) return '#'
  const semitone = NOTE_SEMITONE[rootMatch[1]]
  if (semitone === undefined) return '#'
  const target = ((semitone + delta) % 12 + 12) % 12
  const isMinor = /^[A-G][b#]?m(?!aj)/.test(originalKey)
  return (isMinor ? FLAT_MINOR : FLAT_MAJOR).has(target) ? 'b' : '#'
}

// ─── Transpose a key name by N semitones ──────────────────────────────────────
// Only for simple key names (e.g. "G", "Am", "F#"). For full chord names with
// quality suffixes use transposeChordName instead.

export function transposeKey(key: string, semitones: number): string {
  if (!key || semitones === 0) return key
  try {
    const m = key.match(/^([A-G][b#]?)(m(?:aj)?)?\s*$/)
    if (!m) return key
    const [, root, quality = ''] = m
    const modifier = targetAccidental(key, semitones)
    return transposeNoteName(root, semitones, modifier === 'b') + quality
  } catch {
    return key
  }
}

// ─── Transpose any chord name (including quality suffixes) ───────────────────
// Uses a semitone lookup table — bypasses chordsheetjs Chord.transpose() which
// produces enharmonically wrong spellings for some intervals (e.g. G→-7 gives B#
// instead of C). originalKey is used to pick the correct flat/sharp spelling.

export function transposeChordName(
  chordName: string,
  semitones: number,
  originalKey = '',
): string {
  if (!chordName || semitones === 0) return chordName
  try {
    const modifier = originalKey ? targetAccidental(originalKey, semitones) : '#'
    const useFlats = modifier === 'b'
    // Parse: Root([A-G][b#]?) + Quality(anything) + optional /Bass([A-G][b#]?)
    const m = chordName.match(/^([A-G][b#]?)(.*?)(?:\/([A-G][b#]?))?$/)
    if (!m) return chordName
    const [, root, quality, bass] = m
    const newRoot = transposeNoteName(root, semitones, useFlats)
    const newBass = bass ? transposeNoteName(bass, semitones, useFlats) : null
    return newRoot + quality + (newBass ? '/' + newBass : '')
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
