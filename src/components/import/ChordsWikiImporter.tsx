import { useState, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Upload, CheckCircle, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/shared/Button'
import { db, generateId } from '@/db'
import { buildSearchText, looksLikeFilename } from '@/utils/chordpro'
import type {
  ChordsWikiExport, Book, Song, Setlist, SetlistItem, Transcription,
} from '@/types'
import { useAuth } from '@/auth/AuthContext'

interface ImportResult {
  books: number
  songs: number
  setlists: number
  dupes: number
  flagged: string[]
  errors: string[]
}

export function ChordsWikiImporter() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const [state, setState] = useState<'idle' | 'importing' | 'done' | 'error'>('idle')
  const [result, setResult] = useState<ImportResult | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleFile = async (file: File) => {
    if (!user) return
    setState('importing')

    try {
      const text = await file.text()
      const data: ChordsWikiExport = JSON.parse(text)

      if (data.filetype !== 'library-backup') {
        throw new Error('Not a chords.wiki library-backup file')
      }

      const res: ImportResult = { books: 0, songs: 0, setlists: 0, dupes: 0, flagged: [], errors: [] }

      // ── Deduplication: build existing title set ───────────────────────────
      const existingTitles = new Set(
        (await db.songs.toArray()).map(s => s.title.toLowerCase().trim())
      )
      let dupesSkipped = 0

      // ── Import books + songs ──────────────────────────────────────────────
      const songIdMap: Record<string, string> = {} // old id → new id

      for (const [, cwBook] of Object.entries(data.library.books)) {
        const bookId = generateId()

        const book: Book = {
          id: bookId,
          title: cwBook.title,
          description: cwBook.description,
          author: cwBook.author ?? user.displayName,
          ownerId: user.id,
          readOnly: cwBook.readOnly ?? false,
          shareable: cwBook.shareable ?? true,
          createdAt: new Date(cwBook.created).getTime(),
          updatedAt: Date.now(),
        }
        await db.books.put(book)
        res.books++

        for (const [cwSongId, cwSong] of Object.entries(cwBook.songs)) {
          const t_ = cwSong.transcription
          const newId = generateId()
          songIdMap[cwSongId] = newId

          // Skip if a song with the same title already exists
          if (existingTitles.has(cwSong.title.toLowerCase().trim())) {
            dupesSkipped++
            continue
          }
          existingTitles.add(cwSong.title.toLowerCase().trim())

          if (looksLikeFilename(cwSong.title)) {
            res.flagged.push(cwSong.title)
          }

          const transcription: Transcription = {
            content:       t_.content ?? '',
            key:           t_.key ?? '',
            capo:          t_.capo ?? 0,
            tempo:         t_.tempo ?? 120,
            timeSignature: t_.time_signature ?? '4/4',
            duration:      t_.duration ?? 0,
            chordNotation: 'standard',
            instrument:    t_.instrument ?? 'guitar',
            tuning:        t_.tuning ?? 'standard',
            format:        'chordpro',
          }

          const song: Song = {
            id:         newId,
            bookId,
            title:      cwSong.title,
            artist:     cwSong.artist ?? '',
            tags:       cwSong.tags ?? [],
            searchText: buildSearchText(cwSong.title, cwSong.artist ?? '', cwSong.tags ?? [], t_.content ?? ''),
            isFavorite: false,
            savedAt:    new Date(cwSong.saved ?? Date.now()).getTime(),
            updatedAt:  Date.now(),
            transcription,
          }
          await db.songs.put(song)
          res.songs++
        }
      }

      // ── Import setlists ───────────────────────────────────────────────────
      for (const [, cwSl] of Object.entries(data.library.setlists)) {
        const setlistId = generateId()

        const setlist: Setlist = {
          id:        setlistId,
          name:      cwSl.name,
          description: cwSl.description,
          ownerId:   user.id,
          createdAt: new Date(cwSl.created).getTime(),
          updatedAt: Date.now(),
        }
        await db.setlists.put(setlist)

        const items = Object.values(cwSl.items).sort((a, b) => a.order - b.order)
        for (const item of items) {
          const slItem: SetlistItem = {
            id:              generateId(),
            setlistId,
            order:           item.order,
            type:            item.type === 'set' ? 'divider' : 'song',
            songId:          item.type === 'song' ? (songIdMap[item.song?.id ?? ''] ?? undefined) : undefined,
            dividerName:     item.type === 'set' ? item.name : undefined,
            transposeOffset: 0,
          }
          await db.setlistItems.put(slItem)
        }
        res.setlists++
      }

      res.dupes = dupesSkipped
      setResult(res)
      setState('done')
    } catch (err) {
      console.error(err)
      setResult({ books: 0, songs: 0, setlists: 0, dupes: 0, flagged: [], errors: [String(err)] })
      setState('error')
    }
  }

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
  }

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  return (
    <div className="max-w-xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-semibold">{t('import.title')}</h1>
        <p className="text-ink-muted text-sm mt-1">{t('import.subtitle')}</p>
      </div>

      {state === 'idle' && (
        <div
          className="border-2 border-dashed border-surface-3 rounded-xl p-10 text-center cursor-pointer hover:border-chord/40 transition-colors"
          onClick={() => inputRef.current?.click()}
          onDrop={onDrop}
          onDragOver={e => e.preventDefault()}
        >
          <Upload className="mx-auto mb-3 text-ink-muted" size={32} />
          <p className="text-ink-muted text-sm">{t('import.dropHint')}</p>
          <input ref={inputRef} type="file" accept=".json" className="hidden" onChange={onInputChange} />
        </div>
      )}

      {state === 'importing' && (
        <div className="flex items-center gap-3 text-ink-muted">
          <div className="w-5 h-5 border-2 border-chord border-t-transparent rounded-full animate-spin" />
          {t('import.importing')}
        </div>
      )}

      {state === 'done' && result && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-green-400">
            <CheckCircle size={20} />
            <span className="font-medium">{t('import.done')}</span>
          </div>
          <div className="bg-surface-1 rounded-lg p-4 grid grid-cols-4 gap-4 text-center">
            {[
              { label: t('import.books'),    value: result.books    },
              { label: t('import.songs'),    value: result.songs    },
              { label: t('import.setlists'), value: result.setlists },
              { label: 'Skipped',            value: result.dupes,   dim: true },
            ].map(({ label, value, dim }) => (
              <div key={label}>
                <div className={`text-2xl font-bold ${dim ? 'text-ink-faint' : 'text-chord'}`}>{value}</div>
                <div className="text-xs text-ink-muted mt-0.5">{label}</div>
              </div>
            ))}
          </div>

          {result.flagged.length > 0 && (
            <div className="bg-surface-2 rounded-lg p-4 space-y-2">
              <div className="flex items-center gap-2 text-amber-400 text-sm font-medium">
                <AlertTriangle size={15} />
                {t('import.flaggedTitles')} ({result.flagged.length})
              </div>
              <ul className="text-xs text-ink-muted space-y-1 font-mono max-h-40 overflow-y-auto">
                {result.flagged.map(title => <li key={title}>{title}</li>)}
              </ul>
            </div>
          )}

          <Button variant="secondary" onClick={() => { setState('idle'); setResult(null) }}>
            Import another file
          </Button>
        </div>
      )}

      {state === 'error' && result && (
        <div className="bg-red-900/30 border border-red-700/40 rounded-lg p-4 text-red-300 text-sm">
          {result.errors[0]}
        </div>
      )}
    </div>
  )
}
