import ChordSheetJS from 'chordsheetjs'

const { ChordProParser, HtmlDivFormatter, TextFormatter } = ChordSheetJS

// ─── Preprocess chords.wiki extensions before standard parse ─────────────────
// {sop: Name} / {start_of_part: Name} → {start_of_verse: Name}
// {eop} / {end_of_part} → {end_of_verse}
// These are chords.wiki-specific and not supported by chordsheetjs natively.

export function preprocessChordPro(content: string): string {
  return content
    .replace(/\{sop\s*:\s*([^}]+)\}/gi, '{start_of_verse: $1}')
    .replace(/\{start_of_part\s*:\s*([^}]+)\}/gi, '{start_of_verse: $1}')
    .replace(/\{eop\b[^}]*\}/gi, '{end_of_verse}')
    .replace(/\{end_of_part\b[^}]*\}/gi, '{end_of_verse}')
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
const QUALITIES = ['', 'm', 'maj7', 'm7', '7', 'sus2', 'sus4', 'dim', 'aug', 'add9', '6', '9', '11', '13', 'maj9', 'm9', 'mmaj7', 'dim7', 'm7b5', '5']

export function isKnownChord(chord: string): boolean {
  // Strip bass note
  const base = chord.split('/')[0]
  return ROOTS.some(r => QUALITIES.some(q => base === r + q))
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
