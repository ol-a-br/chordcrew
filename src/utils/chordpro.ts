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
}

export function extractMeta(content: string): ChordProMeta {
  const meta: ChordProMeta = {}

  const match = (directive: string) => {
    const re = new RegExp(`\\{${directive}\\s*:\\s*([^}]+)\\}`, 'i')
    return content.match(re)?.[1]?.trim()
  }

  meta.title    = match('title') ?? match('t')
  meta.subtitle = match('subtitle') ?? match('st')
  meta.artist   = match('artist')
  meta.key      = match('key')
  meta.time     = match('time')

  const tempo = match('tempo')
  if (tempo) meta.tempo = parseInt(tempo, 10)

  const capo = match('capo')
  if (capo) meta.capo = parseInt(capo, 10)

  return meta
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
