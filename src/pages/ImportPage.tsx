import { useState } from 'react'
import { Download } from 'lucide-react'
import { ChordsWikiImporter } from '@/components/import/ChordsWikiImporter'
import { ChordProFileImporter } from '@/components/import/ChordProFileImporter'
import { OpenSongImporter } from '@/components/import/OpenSongImporter'
import { Button } from '@/components/shared/Button'
import { db } from '@/db'
import { useAuth } from '@/auth/AuthContext'
import type { ChordsWikiExport, ChordsWikiBook, ChordsWikiSetlist } from '@/types'

function ExportSection() {
  const { user } = useAuth()
  const [exporting, setExporting] = useState(false)

  const handleExport = async () => {
    if (!user) return
    setExporting(true)
    try {
      const [books, songs, setlists, setlistItems] = await Promise.all([
        db.books.toArray(),
        db.songs.toArray(),
        db.setlists.toArray(),
        db.setlistItems.toArray(),
      ])

      // Build books map with nested songs (chords.wiki format)
      const booksMap: Record<string, ChordsWikiBook> = {}
      for (const book of books) {
        booksMap[book.id] = {
          id:          book.id,
          title:       book.title,
          author:      book.author ?? user.displayName,
          description: book.description,
          readOnly:    book.readOnly,
          shareable:   book.shareable,
          created:     new Date(book.createdAt).toISOString(),
          songs:       {},
        }
      }

      for (const song of songs) {
        const bookEntry = booksMap[song.bookId]
        if (!bookEntry) continue
        const t = song.transcription
        bookEntry.songs[song.id] = {
          id:     song.id,
          title:  song.title,
          artist: song.artist ?? '',
          tags:   song.tags ?? [],
          saved:  new Date(song.savedAt).toISOString(),
          transcription: {
            format:         'chordpro',
            type:           'chordpro',
            chord_notation: t.chordNotation ?? 'standard',
            instrument:     t.instrument ?? 'guitar',
            tuning:         t.tuning ?? 'standard',
            parts:          [],
            recording:      [],
            capo:           t.capo ?? 0,
            duration:       t.duration ?? 0,
            tempo:          t.tempo ?? 120,
            time_signature: t.timeSignature ?? '4/4',
            key:            t.key ?? '',
            content:        t.content ?? '',
          },
        }
      }

      // Build setlists map
      const setlistsMap: Record<string, ChordsWikiSetlist> = {}
      for (const sl of setlists) {
        const items = setlistItems
          .filter(i => i.setlistId === sl.id)
          .sort((a, b) => a.order - b.order)

        const itemsMap: ChordsWikiSetlist['items'] = {}
        items.forEach((item, idx) => {
          const key = String(idx)
          if (item.type === 'divider') {
            itemsMap[key] = { order: item.order, type: 'set', name: item.dividerName ?? '' }
          } else {
            const song = songs.find(s => s.id === item.songId)
            itemsMap[key] = {
              order: item.order,
              type:  'song',
              song:  song
                ? { id: song.id, title: song.title, artist: song.artist ?? '' }
                : { id: item.songId ?? '', title: '', artist: '' },
            }
          }
        })

        setlistsMap[sl.id] = {
          id:          sl.id,
          name:        sl.name,
          description: sl.description,
          created:     new Date(sl.createdAt).toISOString(),
          items:       itemsMap,
        }
      }

      const payload: ChordsWikiExport = {
        filetype: 'library-backup',
        version:  1,
        created:  Date.now(),
        uid:      user.id,
        library: {
          books:     booksMap,
          setlists:  setlistsMap,
          favorites: {},
          audio:     {},
          midi:      { sequences: {} },
        },
      }

      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href     = url
      a.download = `chordcrew-export-${new Date().toISOString().slice(0, 10)}.json`
      a.click()
      URL.revokeObjectURL(url)
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-base font-semibold text-ink">Export library</h2>
        <p className="text-xs text-ink-muted mt-0.5">
          Download all songs, books, setlists, and metadata as a JSON file.
          Compatible with the chords.wiki import format.
        </p>
      </div>
      <Button variant="secondary" onClick={handleExport} disabled={exporting}>
        <Download size={15} className="mr-1.5" />
        {exporting ? 'Preparing…' : 'Download library backup'}
      </Button>
    </div>
  )
}

export default function ImportPage() {
  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-10">

      <ExportSection />

      <div className="border-t border-surface-3 pt-8">
        <ChordProFileImporter />
      </div>

      <div className="border-t border-surface-3 pt-8">
        <OpenSongImporter />
      </div>

      <div className="border-t border-surface-3 pt-8">
        <ChordsWikiImporter />
      </div>

    </div>
  )
}
