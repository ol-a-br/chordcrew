/**
 * OpenSong importer
 *
 * OpenSong songs are XML files (typically with no extension) with the format:
 *   <song>
 *     <title>, <author>, <key>, <tempo>, <time_sig>, <capo>, <ccli>
 *     <lyrics>
 *       [SectionName]   ← section header (V=Verse, C=Chorus, B=Bridge, P=Pre-Chorus)
 *       .chord1  chord2  ← chord line (period prefix, positional)
 *        lyric text      ← lyric line (space prefix)
 *     </lyrics>
 *   </song>
 *
 * This converter produces ChordPro using {start_of_verse:}/{end_of_verse} etc.
 */

import { useState, useRef } from 'react'
import { Upload, Check, AlertCircle, FileText } from 'lucide-react'
import { db, generateId, markPending } from '@/db'
import { extractMeta, buildSearchText } from '@/utils/chordpro'
import { useAuth } from '@/auth/AuthContext'
import type { Book, Song, Transcription } from '@/types'

// ─── OpenSong section name → ChordPro directive ───────────────────────────────

function sectionDirectives(name: string): { open: string; close: string } {
  const n = name.trim()

  const vMatch = n.match(/^V(\d*)$/i)
  if (vMatch) {
    const label = 'Verse' + (vMatch[1] ? ' ' + vMatch[1] : '')
    return { open: `{start_of_verse: ${label}}`, close: '{end_of_verse}' }
  }

  const cMatch = n.match(/^C(\d*)$/i)
  if (cMatch) {
    const label = 'Chorus' + (cMatch[1] ? ' ' + cMatch[1] : '')
    return { open: `{start_of_chorus: ${label}}`, close: '{end_of_chorus}' }
  }

  const bMatch = n.match(/^B(\d*)$/i)
  if (bMatch) {
    const label = 'Bridge' + (bMatch[1] ? ' ' + bMatch[1] : '')
    return { open: `{start_of_verse: ${label}}`, close: '{end_of_verse}' }
  }

  const pMatch = n.match(/^P(\d*)$/i)
  if (pMatch) {
    const label = 'Pre-Chorus' + (pMatch[1] ? ' ' + pMatch[1] : '')
    return { open: `{start_of_verse: ${label}}`, close: '{end_of_verse}' }
  }

  const tMatch = n.match(/^T(\d*)$/i)
  if (tMatch) {
    const label = 'Tag' + (tMatch[1] ? ' ' + tMatch[1] : '')
    return { open: `{start_of_verse: ${label}}`, close: '{end_of_verse}' }
  }

  // Named sections: Intro, Ending, Instrumental, etc.
  const capitalized = n.charAt(0).toUpperCase() + n.slice(1)
  return { open: `{start_of_verse: ${capitalized}}`, close: '{end_of_verse}' }
}

// ─── Chord+lyric merging ──────────────────────────────────────────────────────

interface ChordPos { pos: number; chord: string }

function parseChordPositions(chordLine: string): ChordPos[] {
  const result: ChordPos[] = []
  let i = 0
  while (i < chordLine.length) {
    if (chordLine[i] !== ' ') {
      const start = i
      let depth = 0
      // Advance past one token; track paren depth so "(To Bridge)" stays intact
      while (i < chordLine.length) {
        if (chordLine[i] === '(') depth++
        else if (chordLine[i] === ')') depth--
        if (chordLine[i] === ' ' && depth === 0) break
        i++
      }
      const ch = chordLine.slice(start, i)
      if (ch !== '|' && ch !== '-' && ch.length > 0) {
        result.push({ pos: start, chord: ch })
      }
    } else {
      i++
    }
  }
  return result
}

/**
 * Merge an OpenSong chord line (`.Chord1   Chord2`) with the lyric below it.
 * Both the '.' prefix on the chord line and the leading space on the lyric line
 * act as column-0 alignment markers, so positions map 1:1 after stripping them.
 */
function mergeChordLyric(chordLineRaw: string, lyricLineRaw: string): string {
  // Strip the '.' prefix from chord line and leading space from lyric line
  const chordLine = chordLineRaw.startsWith('.') ? chordLineRaw.slice(1) : chordLineRaw
  const lyric     = lyricLineRaw.startsWith(' ') ? lyricLineRaw.slice(1) : lyricLineRaw

  const chords = parseChordPositions(chordLine)
  if (chords.length === 0) return lyric

  let result   = ''
  let lastPos  = 0
  for (const { pos, chord } of chords) {
    const clamp = Math.min(pos, lyric.length)
    result  += lyric.slice(lastPos, clamp)
    result  += `[${chord}]`
    lastPos  = clamp
  }
  result += lyric.slice(lastPos)
  return result
}

/** A chord-only line (no lyric below) — output chords inline with spaces. */
function chordsOnlyLine(chordLineRaw: string): string {
  const chordLine = chordLineRaw.startsWith('.') ? chordLineRaw.slice(1) : chordLineRaw
  const chords = parseChordPositions(chordLine)
  return chords.map(c => `[${c.chord}]`).join(' ')
}

// ─── Lyrics block conversion ──────────────────────────────────────────────────

function convertLyrics(lyricsContent: string): string {
  const lines  = lyricsContent.split('\n')
  const out: string[] = []
  let currentClose: string | null = null

  const closeSection = () => {
    if (currentClose) {
      out.push(currentClose)
      out.push('')
      currentClose = null
    }
  }

  let i = 0
  while (i < lines.length) {
    const line    = lines[i]
    const trimmed = line.trim()

    // Empty line
    if (trimmed === '') {
      out.push('')
      i++
      continue
    }

    // Section header: entire line is [SectionName]
    const secMatch = trimmed.match(/^\[([^\]]+)\]$/)
    if (secMatch) {
      closeSection()
      const { open, close } = sectionDirectives(secMatch[1])
      out.push(open)
      currentClose = close
      i++
      continue
    }

    // Chord line
    if (line.startsWith('.')) {
      // Skip inline metadata annotations embedded in chord lines:
      // e.g. ".Key - C | Tempo - 77 | Time - 4/4" or ". Tonart - E | ..."
      const afterDot = line.slice(1).trim()
      if (/^(Key|Tonart|Tempo|Time|Taktart)\s*[-|:]/i.test(afterDot)) {
        i++
        continue
      }
      const nextLine = i + 1 < lines.length ? lines[i + 1] : ''
      if (nextLine.startsWith(' ') && nextLine.trim()) {
        out.push(mergeChordLyric(line, nextLine))
        i += 2
      } else {
        const cl = chordsOnlyLine(line)
        if (cl.trim()) out.push(cl)
        i++
      }
      continue
    }

    // Lyric line (leading space)
    if (line.startsWith(' ')) {
      const text = line.slice(1)
      if (text.trim()) out.push(text)
      i++
      continue
    }

    // Free-text line (no '.' or ' ' prefix)
    // Skip pure metadata annotations like "Key - A | Tempo - 70" or German "Tonart - E | Taktart - 4/4"
    if (/^(Key|Tonart|Tempo|Time|Taktart)\s*[-|:]/i.test(trimmed)) {
      i++
      continue
    }
    if (trimmed) out.push(`{comment: ${trimmed}}`)
    i++
  }

  closeSection()
  return out.join('\n')
}

// ─── Full OpenSong → ChordPro conversion ─────────────────────────────────────

interface OpenSongMeta {
  title: string
  author: string
  key: string
  tempo: string
  timeSig: string
  capo: string
  ccli: string
  copyright: string
}

/** Extract key/tempo/time from inline annotations like "Key - C | Tempo - 77 | Time - 4/4"
 *  or the German variant "Tonart - E | Tempo - 160 | Taktart - 4/4". */
function extractInlineMeta(lyrics: string): { key?: string; tempo?: string; timeSig?: string } {
  const result: { key?: string; tempo?: string; timeSig?: string } = {}
  for (const line of lyrics.split('\n')) {
    // Strip leading '.' (chord-line prefix) or spaces
    const t = line.startsWith('.') ? line.slice(1).trim() : line.trim()
    if (!/(Key|Tonart|Tempo|Taktart|Time)\s*[-|:]/i.test(t)) continue

    const keyM = t.match(/(?:Key|Tonart)\s*[-:]\s*([A-G][#b]?m?)\b/i)
    if (keyM && !result.key) result.key = keyM[1]

    const tempoM = t.match(/Tempo\s*[-:]\s*(\d+)/i)
    if (tempoM && !result.tempo) result.tempo = tempoM[1]

    const timeM = t.match(/(?:Time|Taktart)\s*[-:]\s*([\d\/]+)/i)
    if (timeM && !result.timeSig) result.timeSig = timeM[1]
  }
  return result
}

function parseOpenSongXml(text: string): { meta: OpenSongMeta; lyrics: string } | null {
  const parser = new DOMParser()
  const doc    = parser.parseFromString(text, 'text/xml')
  if (doc.querySelector('parsererror') || !doc.querySelector('song')) return null

  const get = (tag: string) => doc.querySelector(tag)?.textContent?.trim() ?? ''

  const lyrics  = get('lyrics')
  const xmlKey  = get('key')
  const xmlTempo = get('tempo')
  const xmlTime = get('time_sig')

  // Fall back to inline annotations when XML tags are absent
  const inline  = (!xmlKey || !xmlTempo) ? extractInlineMeta(lyrics) : {}

  return {
    meta: {
      title:     get('title'),
      author:    get('author'),
      key:       xmlKey   || inline.key    || '',
      tempo:     xmlTempo || inline.tempo  || '',
      timeSig:   xmlTime  || inline.timeSig || '',
      capo:      get('capo'),
      ccli:      get('ccli'),
      copyright: get('copyright'),
    },
    lyrics,
  }
}

function toChordPro(meta: OpenSongMeta, lyrics: string): string {
  const header: string[] = []
  if (meta.title)                             header.push(`{title: ${meta.title}}`)
  if (meta.author.trim())                     header.push(`{artist: ${meta.author}}`)
  if (meta.key.trim())                        header.push(`{key: ${meta.key}}`)
  const tempo = parseInt(meta.tempo, 10)
  if (tempo > 0)                              header.push(`{tempo: ${tempo}}`)
  if (meta.timeSig.trim())                    header.push(`{time: ${meta.timeSig}}`)
  const capo = parseInt(meta.capo, 10)
  if (capo > 0)                               header.push(`{capo: ${capo}}`)
  if (meta.ccli.trim())                       header.push(`{ccli: ${meta.ccli}}`)
  if (meta.copyright.trim())                  header.push(`{copyright: ${meta.copyright}}`)
  header.push('')

  return header.join('\n') + convertLyrics(lyrics)
}

// ─── Book helper ──────────────────────────────────────────────────────────────

async function ensureOpenSongBook(ownerId: string, displayName: string): Promise<string> {
  const existing = await db.books.filter(b => b.title === 'OpenSong').first()
  if (existing) return existing.id
  const bookId = generateId()
  const book: Book = {
    id: bookId, title: 'OpenSong',
    description: 'Songs imported from OpenSong',
    author: displayName, ownerId,
    readOnly: false, shareable: false,
    createdAt: Date.now(), updatedAt: Date.now(),
  }
  await db.books.put(book)
  return bookId
}

// ─── Component ────────────────────────────────────────────────────────────────

type ImportPhase = 'idle' | 'scanning' | 'conflict' | 'importing' | 'done' | 'error'

export function OpenSongImporter() {
  const { user } = useAuth()
  const [phase,         setPhase]         = useState<ImportPhase>('idle')
  const [conflictTitles, setConflictTitles] = useState<string[]>([])
  const [countNew,      setCountNew]      = useState(0)
  const [countUpdated,  setCountUpdated]  = useState(0)
  const [countSkip,     setCountSkip]     = useState(0)
  const [message,       setMessage]       = useState('')
  const inputRef       = useRef<HTMLInputElement>(null)
  const pendingFilesRef = useRef<File[]>([])

  const doImport = async (files: File[], mode: 'skip' | 'overwrite') => {
    if (!user) return
    setPhase('importing')

    try {
      const bookId = await ensureOpenSongBook(user.id, user.displayName)
      const allSongs = await db.songs.toArray()
      const existingByTitle = new Map(allSongs.map(s => [s.title.toLowerCase().trim(), s]))
      let nNew = 0, nUpdated = 0, nSkip = 0

      for (const file of files) {
        const text = await file.text()
        if (!text.includes('<song') || !text.includes('<lyrics')) { nSkip++; continue }

        const parsed = parseOpenSongXml(text)
        if (!parsed) { nSkip++; continue }

        const { meta, lyrics } = parsed
        const title = meta.title || file.name
        const titleKey = title.toLowerCase().trim()
        const existing = existingByTitle.get(titleKey)

        const content = toChordPro(meta, lyrics)
        const metaParsed = extractMeta(content)

        if (existing) {
          if (mode === 'skip') { nSkip++; continue }
          // overwrite — update transcription + metadata
          await db.songs.update(existing.id, {
            artist:     meta.author || existing.artist,
            updatedAt:  Date.now(),
            searchText: buildSearchText(title, meta.author || '', existing.tags, content),
            transcription: {
              ...existing.transcription,
              content,
              key:           metaParsed.key    ?? meta.key    ?? existing.transcription.key,
              capo:          (metaParsed.capo  ?? parseInt(meta.capo,  10)) || existing.transcription.capo,
              tempo:         (metaParsed.tempo ?? parseInt(meta.tempo, 10)) || existing.transcription.tempo,
              timeSignature: metaParsed.time   ?? meta.timeSig ?? existing.transcription.timeSignature,
            },
          })
          await markPending('song', existing.id)
          nUpdated++
          continue
        }

        // new song
        existingByTitle.set(titleKey, { id: '' } as Song)  // guard against intra-batch dupes
        const newId = generateId()
        const transcription: Transcription = {
          content,
          key:           metaParsed.key   ?? meta.key    ?? '',
          capo:          (metaParsed.capo  ?? parseInt(meta.capo,  10)) || 0,
          tempo:         (metaParsed.tempo ?? parseInt(meta.tempo, 10)) || 0,
          timeSignature: metaParsed.time  ?? meta.timeSig ?? '4/4',
          duration:      0,
          chordNotation: 'standard',
          instrument:    'guitar',
          tuning:        'standard',
          format:        'chordpro',
        }
        await db.songs.put({
          id: newId, bookId, title,
          artist:     meta.author ?? '',
          tags:       [],
          searchText: buildSearchText(title, meta.author ?? '', [], content),
          isFavorite: false,
          savedAt:    Date.now(),
          updatedAt:  Date.now(),
          transcription,
        })
        await markPending('song', newId)
        nNew++
      }

      setCountNew(nNew); setCountUpdated(nUpdated); setCountSkip(nSkip)
      setPhase('done')
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Import failed')
      setPhase('error')
    }
  }

  const scanFiles = async (files: File[]) => {
    if (!user) return
    setPhase('scanning')
    pendingFilesRef.current = files

    const existingTitles = new Set(
      (await db.songs.toArray()).map(s => s.title.toLowerCase().trim())
    )
    const dupes: string[] = []

    for (const file of files) {
      const text = await file.text()
      if (!text.includes('<song') || !text.includes('<lyrics')) continue
      const parsed = parseOpenSongXml(text)
      if (!parsed) continue
      const title = parsed.meta.title || file.name
      if (existingTitles.has(title.toLowerCase().trim())) dupes.push(title)
    }

    if (dupes.length === 0) {
      await doImport(files, 'skip')
    } else {
      setConflictTitles(dupes)
      setPhase('conflict')
    }
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    if (files.length) scanFiles(files)
    e.target.value = ''
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const files = Array.from(e.dataTransfer.files)
    if (files.length) scanFiles(files)
  }

  const reset = () => { setPhase('idle'); setConflictTitles([]) }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold text-ink">Import OpenSong files</h2>
        <p className="text-xs text-ink-muted mt-0.5">
          Accepts OpenSong XML files (no extension required). Songs are added to the "OpenSong" book.
          Chords are converted to ChordPro format automatically.
        </p>
      </div>

      {(phase === 'idle' || phase === 'scanning') && (
        <div
          onDrop={handleDrop}
          onDragOver={e => e.preventDefault()}
          onClick={() => inputRef.current?.click()}
          className="flex flex-col items-center justify-center gap-3 border-2 border-dashed border-surface-3 hover:border-chord/50 rounded-xl p-8 cursor-pointer transition-colors group"
        >
          <Upload size={28} className="text-ink-faint group-hover:text-chord transition-colors" />
          <div className="text-center">
            <p className="text-sm font-medium text-ink-muted">
              {phase === 'scanning' ? 'Scanning…' : 'Drop OpenSong files here or click to browse'}
            </p>
            <p className="text-xs text-ink-faint mt-0.5">Multiple files supported</p>
          </div>
          <input ref={inputRef} type="file" multiple className="hidden" onChange={handleFileChange} />
        </div>
      )}

      {phase === 'conflict' && (
        <div className="bg-surface-2 border border-amber-500/30 rounded-xl p-4 space-y-3">
          <p className="text-sm font-medium text-amber-400">
            {conflictTitles.length} song{conflictTitles.length !== 1 ? 's' : ''} already exist in your library
          </p>
          <ul className="text-xs text-ink-muted space-y-0.5 max-h-32 overflow-y-auto font-mono">
            {conflictTitles.map(t => <li key={t} className="truncate">· {t}</li>)}
          </ul>
          <div className="flex gap-2 pt-1">
            <button
              onClick={() => doImport(pendingFilesRef.current, 'skip')}
              className="px-3 py-1.5 text-xs rounded-lg bg-surface-3 text-ink hover:bg-surface-3/80 transition-colors"
            >
              Skip existing
            </button>
            <button
              onClick={() => doImport(pendingFilesRef.current, 'overwrite')}
              className="px-3 py-1.5 text-xs rounded-lg bg-chord/15 text-chord hover:bg-chord/25 transition-colors"
            >
              Overwrite existing
            </button>
            <button onClick={reset} className="ml-auto text-xs text-ink-faint hover:text-ink">
              Cancel
            </button>
          </div>
        </div>
      )}

      {phase === 'importing' && (
        <div className="flex items-center gap-2 text-sm text-ink-muted">
          <div className="w-4 h-4 border-2 border-chord border-t-transparent rounded-full animate-spin shrink-0" />
          Importing…
        </div>
      )}

      {phase === 'done' && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm text-green-400">
            <Check size={16} className="shrink-0" />
            <span>
              {countNew > 0 && `${countNew} new song${countNew !== 1 ? 's' : ''} imported`}
              {countNew > 0 && countUpdated > 0 && ', '}
              {countUpdated > 0 && `${countUpdated} song${countUpdated !== 1 ? 's' : ''} updated`}
              {countNew === 0 && countUpdated === 0 && 'Done'}
            </span>
          </div>
          {countSkip > 0 && (
            <p className="text-xs text-ink-muted pl-6">
              {countSkip} file{countSkip !== 1 ? 's' : ''} skipped
            </p>
          )}
          <button onClick={reset} className="text-xs text-ink-faint hover:text-ink underline">
            Import more files
          </button>
        </div>
      )}

      {phase === 'error' && (
        <div className="space-y-2">
          <div className="flex items-start gap-2 text-sm text-red-400">
            <AlertCircle size={16} className="shrink-0 mt-0.5" />
            {message || 'Import failed'}
          </div>
          <button onClick={reset} className="text-xs text-ink-faint hover:text-ink underline">
            Try again
          </button>
        </div>
      )}

      {phase === 'idle' && (
        <div className="flex items-start gap-2 text-xs text-ink-faint">
          <FileText size={13} className="shrink-0 mt-0.5" />
          Section types V (Verse), C (Chorus), B (Bridge), P (Pre-Chorus) are detected automatically.
          Chords above lyrics are converted using positional alignment.
        </div>
      )}
    </div>
  )
}
