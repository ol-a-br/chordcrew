import ChordSheetJS from 'chordsheetjs'

const { ChordProParser, HtmlDivFormatter, TextFormatter } = ChordSheetJS

// ─── Preprocess chords.wiki extensions before standard parse ─────────────────
// {sop: Name} / {start_of_part: Name} → {start_of_verse: Name}
// {eop} / {end_of_part} → {end_of_verse}
// These are chords.wiki-specific and not supported by chordsheetjs natively.

export function preprocessChordPro(content: string): string {
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
    song = song.transpose(transposeOffset)
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
  }
  return false
}

// ─── Transpose a key name by N semitones ──────────────────────────────────────
// Delegates to chordsheetjs so enharmonic spelling is consistent with chord transposition.

export function transposeKey(key: string, semitones: number): string {
  if (!key || semitones === 0) return key
  try {
    const html = renderToHtml(`[${key}]\n`, semitones)
    const match = html.match(/<div class="chord">([^<]+)<\/div>/)
    return match?.[1]?.trim() ?? key
  } catch {
    return key
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
