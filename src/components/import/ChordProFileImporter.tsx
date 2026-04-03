import { useState, useRef } from 'react'
import { Upload, FileText, Check, AlertCircle } from 'lucide-react'
import { db, generateId } from '@/db'
import { extractMeta, buildSearchText } from '@/utils/chordpro'
import { useAuth } from '@/auth/AuthContext'
import type { Book, Song, Transcription } from '@/types'

const ACCEPTED_EXTS = ['.cho', '.chopro', '.chordpro', '.txt']

async function ensureImportBook(ownerId: string, displayName: string): Promise<string> {
  // Look for an existing "Imported" book first
  const existing = await db.books.filter(b => b.title === 'Imported').first()
  if (existing) return existing.id

  const bookId = generateId()
  const book: Book = {
    id: bookId,
    title: 'Imported',
    description: 'Songs imported from ChordPro files',
    author: displayName,
    ownerId,
    readOnly: false,
    shareable: false,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }
  await db.books.put(book)
  return bookId
}

export function ChordProFileImporter() {
  const { user } = useAuth()
  const [status, setStatus] = useState<'idle' | 'importing' | 'done' | 'error'>('idle')
  const [message, setMessage] = useState('')
  const [imported, setImported] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const dropRef = useRef<HTMLDivElement>(null)

  const importFiles = async (files: FileList | File[]) => {
    if (!user) return
    const fileArr = Array.from(files).filter(f =>
      ACCEPTED_EXTS.some(ext => f.name.toLowerCase().endsWith(ext))
    )
    if (fileArr.length === 0) {
      setStatus('error')
      setMessage('No supported files found (.cho, .chopro, .chordpro, .txt)')
      return
    }

    setStatus('importing')
    setMessage('')

    try {
      const bookId = await ensureImportBook(user.id, user.displayName)
      let count = 0

      // Build title set for dedup check
      const existingTitles = new Set(
        (await db.songs.toArray()).map(s => s.title.toLowerCase().trim())
      )
      let dupeCount = 0

      for (const file of fileArr) {
        const content = await file.text()
        const meta = extractMeta(content)
        const title = meta.title || file.name.replace(/\.[^.]+$/, '')

        // Skip duplicates (same title, case-insensitive)
        if (existingTitles.has(title.toLowerCase().trim())) {
          dupeCount++
          continue
        }
        existingTitles.add(title.toLowerCase().trim())

        const transcription: Transcription = {
          content,
          key: meta.key ?? '',
          capo: meta.capo ?? 0,
          tempo: meta.tempo ?? 0,
          timeSignature: meta.time ?? '4/4',
          duration: 0,
          chordNotation: 'standard',
          instrument: 'guitar',
          tuning: 'standard',
          format: 'chordpro',
        }

        const song: Song = {
          id: generateId(),
          bookId,
          title,
          artist: meta.artist ?? '',
          tags: [],
          searchText: buildSearchText(title, meta.artist ?? '', [], content),
          isFavorite: false,
          savedAt: Date.now(),
          updatedAt: Date.now(),
          transcription,
        }

        await db.songs.put(song)
        count++
      }

      setImported(count)
      if (dupeCount > 0) {
        setMessage(`${dupeCount} duplicate${dupeCount > 1 ? 's' : ''} skipped`)
      }
      setStatus('done')
    } catch (err) {
      setStatus('error')
      setMessage(err instanceof Error ? err.message : 'Import failed')
    }
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      importFiles(e.target.files)
      e.target.value = ''
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    if (e.dataTransfer.files.length > 0) importFiles(e.dataTransfer.files)
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold text-ink">Import ChordPro files</h2>
        <p className="text-xs text-ink-muted mt-0.5">
          Accepts <code className="font-mono">.cho</code>,{' '}
          <code className="font-mono">.chopro</code>,{' '}
          <code className="font-mono">.chordpro</code>, and <code className="font-mono">.txt</code> files.
          Songs are added to the "Imported" book.
        </p>
      </div>

      {/* Drop zone */}
      <div
        ref={dropRef}
        onDrop={handleDrop}
        onDragOver={e => e.preventDefault()}
        onClick={() => inputRef.current?.click()}
        className="flex flex-col items-center justify-center gap-3 border-2 border-dashed border-surface-3 hover:border-chord/50 rounded-xl p-8 cursor-pointer transition-colors group"
      >
        <Upload size={28} className="text-ink-faint group-hover:text-chord transition-colors" />
        <div className="text-center">
          <p className="text-sm font-medium text-ink-muted">
            Drop files here or click to browse
          </p>
          <p className="text-xs text-ink-faint mt-0.5">
            Multiple files supported
          </p>
        </div>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".cho,.chopro,.chordpro,.txt"
          className="hidden"
          onChange={handleFileChange}
        />
      </div>

      {/* Status */}
      {status === 'importing' && (
        <div className="flex items-center gap-2 text-sm text-ink-muted">
          <div className="w-4 h-4 border-2 border-chord border-t-transparent rounded-full animate-spin shrink-0" />
          Importing…
        </div>
      )}

      {status === 'done' && (
        <div className="flex items-center gap-2 text-sm text-green-400">
          <Check size={16} className="shrink-0" />
          <span>
            Imported {imported} song{imported !== 1 ? 's' : ''} into the "Imported" book
            {message ? <span className="text-ink-muted ml-1">({message})</span> : ''}
          </span>
        </div>
      )}

      {status === 'error' && (
        <div className="flex items-start gap-2 text-sm text-red-400">
          <AlertCircle size={16} className="shrink-0 mt-0.5" />
          {message || 'Import failed'}
        </div>
      )}

      {status === 'idle' && (
        <div className="flex items-start gap-2 text-xs text-ink-faint">
          <FileText size={13} className="shrink-0 mt-0.5" />
          Title and artist are read from <code className="font-mono">{'{title:}'}</code> and{' '}
          <code className="font-mono">{'{artist:}'}</code> directives; falls back to the filename.
        </div>
      )}
    </div>
  )
}
