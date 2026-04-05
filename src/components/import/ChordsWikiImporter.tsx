import { useState, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Upload, CheckCircle, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/shared/Button'
import { db, generateId, markPending } from '@/db'
import { buildSearchText, looksLikeFilename } from '@/utils/chordpro'
import type {
  ChordsWikiExport, Book, Song, Setlist, SetlistItem, Transcription,
} from '@/types'
import { useAuth } from '@/auth/AuthContext'

interface ImportResult {
  books: number
  songs: number
  songsUpdated: number
  setlists: number
  dupes: number
  flagged: string[]
  errors: string[]
}

type Phase = 'idle' | 'scanning' | 'conflict' | 'importing' | 'done' | 'error'

export function ChordsWikiImporter() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const [phase,          setPhase]          = useState<Phase>('idle')
  const [result,         setResult]         = useState<ImportResult | null>(null)
  const [conflictTitles, setConflictTitles] = useState<string[]>([])
  const inputRef       = useRef<HTMLInputElement>(null)
  const pendingDataRef = useRef<ChordsWikiExport | null>(null)

  const doImport = async (data: ChordsWikiExport, mode: 'skip' | 'overwrite') => {
    if (!user) return
    setPhase('importing')

    try {
      const res: ImportResult = { books: 0, songs: 0, songsUpdated: 0, setlists: 0, dupes: 0, flagged: [], errors: [] }

      const allSongs      = await db.songs.toArray()
      const existingByTitle = new Map(allSongs.map(s => [s.title.toLowerCase().trim(), s]))
      const songIdMap: Record<string, string> = {}

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
          const t_      = cwSong.transcription
          const titleKey = cwSong.title.toLowerCase().trim()
          const existing = existingByTitle.get(titleKey)

          if (existing) {
            songIdMap[cwSongId] = existing.id

            if (mode === 'skip') {
              res.dupes++
              continue
            }
            // overwrite
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
            await db.songs.update(existing.id, {
              artist:     cwSong.artist ?? existing.artist,
              tags:       cwSong.tags ?? existing.tags,
              searchText: buildSearchText(cwSong.title, cwSong.artist ?? '', cwSong.tags ?? [], t_.content ?? ''),
              updatedAt:  Date.now(),
              transcription,
            })
            await markPending('song', existing.id)
            res.songsUpdated++
            continue
          }

          // new song
          const newId = generateId()
          songIdMap[cwSongId] = newId
          existingByTitle.set(titleKey, { id: newId } as Song)

          if (looksLikeFilename(cwSong.title)) res.flagged.push(cwSong.title)

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
          await db.songs.put({
            id: newId, bookId,
            title:      cwSong.title,
            artist:     cwSong.artist ?? '',
            tags:       cwSong.tags ?? [],
            searchText: buildSearchText(cwSong.title, cwSong.artist ?? '', cwSong.tags ?? [], t_.content ?? ''),
            isFavorite: false,
            savedAt:    new Date(cwSong.saved ?? Date.now()).getTime(),
            updatedAt:  Date.now(),
            transcription,
          })
          res.songs++
        }
      }

      for (const [, cwSl] of Object.entries(data.library.setlists)) {
        const setlistId = generateId()
        const setlist: Setlist = {
          id: setlistId, name: cwSl.name, description: cwSl.description,
          ownerId: user.id,
          createdAt: new Date(cwSl.created).getTime(),
          updatedAt: Date.now(),
        }
        await db.setlists.put(setlist)

        const items = Object.values(cwSl.items).sort((a, b) => a.order - b.order)
        for (const item of items) {
          const slItem: SetlistItem = {
            id: generateId(), setlistId, order: item.order,
            type:            item.type === 'set' ? 'divider' : 'song',
            songId:          item.type === 'song' ? (songIdMap[item.song?.id ?? ''] ?? undefined) : undefined,
            dividerName:     item.type === 'set' ? item.name : undefined,
            transposeOffset: 0,
          }
          await db.setlistItems.put(slItem)
        }
        res.setlists++
      }

      setResult(res)
      setPhase('done')
    } catch (err) {
      console.error(err)
      setResult({ books: 0, songs: 0, songsUpdated: 0, setlists: 0, dupes: 0, flagged: [], errors: [String(err)] })
      setPhase('error')
    }
  }

  const scanFile = async (file: File) => {
    if (!user) return
    setPhase('scanning')

    try {
      const text = await file.text()
      const data: ChordsWikiExport = JSON.parse(text)
      if (data.filetype !== 'library-backup') throw new Error('Not a chords.wiki library-backup file')

      pendingDataRef.current = data

      const existingTitles = new Set(
        (await db.songs.toArray()).map(s => s.title.toLowerCase().trim())
      )
      const dupes: string[] = []
      for (const cwBook of Object.values(data.library.books)) {
        for (const cwSong of Object.values(cwBook.songs)) {
          if (existingTitles.has(cwSong.title.toLowerCase().trim())) dupes.push(cwSong.title)
        }
      }

      if (dupes.length === 0) {
        await doImport(data, 'skip')
      } else {
        setConflictTitles(dupes)
        setPhase('conflict')
      }
    } catch (err) {
      console.error(err)
      setResult({ books: 0, songs: 0, songsUpdated: 0, setlists: 0, dupes: 0, flagged: [], errors: [String(err)] })
      setPhase('error')
    }
  }

  const reset = () => { setPhase('idle'); setResult(null); setConflictTitles([]) }

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) scanFile(file)
  }

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file) scanFile(file)
  }

  return (
    <div className="max-w-xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-semibold">{t('import.title')}</h1>
        <p className="text-ink-muted text-sm mt-1">{t('import.subtitle')}</p>
      </div>

      {(phase === 'idle' || phase === 'scanning') && (
        <div
          className="border-2 border-dashed border-surface-3 rounded-xl p-10 text-center cursor-pointer hover:border-chord/40 transition-colors"
          onClick={() => inputRef.current?.click()}
          onDrop={onDrop}
          onDragOver={e => e.preventDefault()}
        >
          <Upload className="mx-auto mb-3 text-ink-muted" size={32} />
          <p className="text-ink-muted text-sm">
            {phase === 'scanning' ? t('import.importing') : t('import.dropHint')}
          </p>
          <input ref={inputRef} type="file" accept=".json" className="hidden" onChange={onInputChange} />
        </div>
      )}

      {phase === 'conflict' && (
        <div className="bg-surface-2 border border-amber-500/30 rounded-xl p-4 space-y-3">
          <p className="text-sm font-medium text-amber-400">
            {conflictTitles.length} song{conflictTitles.length !== 1 ? 's' : ''} already exist in your library
          </p>
          <ul className="text-xs text-ink-muted space-y-0.5 max-h-40 overflow-y-auto font-mono">
            {conflictTitles.map(t_ => <li key={t_} className="truncate">· {t_}</li>)}
          </ul>
          <div className="flex gap-2 pt-1">
            <button
              onClick={() => doImport(pendingDataRef.current!, 'skip')}
              className="px-3 py-1.5 text-xs rounded-lg bg-surface-3 text-ink hover:bg-surface-3/80 transition-colors"
            >
              Skip existing
            </button>
            <button
              onClick={() => doImport(pendingDataRef.current!, 'overwrite')}
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
        <div className="flex items-center gap-3 text-ink-muted">
          <div className="w-5 h-5 border-2 border-chord border-t-transparent rounded-full animate-spin" />
          {t('import.importing')}
        </div>
      )}

      {phase === 'done' && result && (
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
              { label: result.songsUpdated > 0 ? 'Updated' : 'Skipped',
                value: result.songsUpdated > 0 ? result.songsUpdated : result.dupes,
                dim: result.songsUpdated === 0 },
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

          <Button variant="secondary" onClick={reset}>
            Import another file
          </Button>
        </div>
      )}

      {phase === 'error' && result && (
        <div className="bg-red-900/30 border border-red-700/40 rounded-lg p-4 text-red-300 text-sm">
          {result.errors[0]}
        </div>
      )}
    </div>
  )
}
