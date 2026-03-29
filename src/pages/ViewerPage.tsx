import { useState, useMemo } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { Pencil, ChevronUp, ChevronDown, AlignLeft, Star, Maximize2, ChevronLeft, ChevronRight } from 'lucide-react'
import { db } from '@/db'
import { SongRenderer } from '@/components/viewer/SongRenderer'
import { Button } from '@/components/shared/Button'
import { transposeKey, getFirstChords } from '@/utils/chordpro'

function getDefaultColumns(): number {
  if (typeof window === 'undefined') return 2
  return window.matchMedia('(orientation: landscape)').matches ? 4 : 2
}

export default function ViewerPage() {
  const { id } = useParams<{ id: string }>()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const song = useLiveQuery(() => id ? db.songs.get(id) : undefined, [id])

  const setlistId = searchParams.get('setlistId')
  const currentPos = parseInt(searchParams.get('pos') ?? '0', 10)

  const [transpose, setTranspose] = useState(0)
  const [columns, setColumns] = useState(getDefaultColumns)
  const [lyricsOnly, setLyricsOnly] = useState(false)
  const [fontScale, setFontScale] = useState(1.0)

  // Setlist context for prev/next navigation
  const setlistItems = useLiveQuery<import('@/types').SetlistItem[]>(
    async () => setlistId ? db.setlistItems.where('setlistId').equals(setlistId).sortBy('order') : [],
    [setlistId]
  )
  const songItems = useMemo(
    () => setlistItems?.filter(i => i.type === 'song' && i.songId) ?? [],
    [setlistItems]
  )
  const prevSongId = songItems[currentPos - 1]?.songId
  const nextSongId = songItems[currentPos + 1]?.songId

  // Transposed key and first-3-chords for musician preview
  const transposedKey = useMemo(
    () => transposeKey(song?.transcription.key ?? '', transpose),
    [song?.transcription.key, transpose]
  )
  const firstChords = useMemo(
    () => transpose !== 0 ? getFirstChords(song?.transcription.content ?? '', transpose) : [],
    [song?.transcription.content, transpose]
  )

  const toggleFavorite = async () => {
    if (!song) return
    await db.songs.update(song.id, { isFavorite: !song.isFavorite })
  }

  if (!song) return <div className="p-8 text-ink-muted">Loading…</div>

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-surface-3 bg-surface-1 shrink-0 flex-wrap">

        {/* Setlist prev nav */}
        {setlistId && (
          <button
            onClick={() => prevSongId && navigate(`/view/${prevSongId}?setlistId=${setlistId}&pos=${currentPos - 1}`)}
            disabled={!prevSongId}
            className="p-1.5 rounded text-ink-muted hover:text-ink disabled:opacity-30"
            title="Previous song"
          >
            <ChevronLeft size={16} />
          </button>
        )}

        {/* Song info */}
        <div className="flex-1 min-w-0 mr-2">
          <h1 className="font-semibold text-base truncate leading-tight">{song.title}</h1>
          {song.artist && <p className="text-xs text-ink-muted truncate">{song.artist}</p>}
        </div>

        {/* Setlist position + next nav */}
        {setlistId && (
          <>
            <span className="text-xs text-ink-faint font-mono shrink-0">
              {currentPos + 1}/{songItems.length}
            </span>
            <button
              onClick={() => nextSongId && navigate(`/view/${nextSongId}?setlistId=${setlistId}&pos=${currentPos + 1}`)}
              disabled={!nextSongId}
              className="p-1.5 rounded text-ink-muted hover:text-ink disabled:opacity-30"
              title="Next song"
            >
              <ChevronRight size={16} />
            </button>
          </>
        )}

        {/* Key & tempo metadata */}
        {song.transcription.key && (
          <span className="text-xs font-mono text-chord bg-chord/10 px-2 py-1 rounded shrink-0" title="Key">
            𝄞 {transpose !== 0 ? `${song.transcription.key} → ${transposedKey}` : song.transcription.key}
          </span>
        )}
        {song.transcription.tempo > 0 && (
          <span className="text-xs font-mono text-ink-muted shrink-0" title="Tempo">
            ♩ {song.transcription.tempo}
          </span>
        )}

        {/* Transpose */}
        <div className="flex flex-col items-center gap-0.5">
          <div className="flex items-center gap-1">
            <button onClick={() => setTranspose(t => t - 1)} className="p-1.5 hover:bg-surface-2 rounded text-ink-muted hover:text-ink">
              <ChevronDown size={16} />
            </button>
            <span className="text-xs font-mono w-8 text-center">
              {transpose > 0 ? `+${transpose}` : transpose === 0 ? '0' : transpose}
            </span>
            <button onClick={() => setTranspose(t => t + 1)} className="p-1.5 hover:bg-surface-2 rounded text-ink-muted hover:text-ink">
              <ChevronUp size={16} />
            </button>
          </div>
          {/* First 3 chords preview when transposed */}
          {firstChords.length > 0 && (
            <div className="flex gap-1">
              {firstChords.map(c => (
                <span key={c} className="text-xs font-mono text-chord bg-chord/10 px-1 rounded leading-tight">{c}</span>
              ))}
            </div>
          )}
        </div>

        {/* Columns 1–5 */}
        <div className="flex items-center gap-0 border border-surface-3 rounded-lg overflow-hidden">
          {[1, 2, 3, 4, 5].map(n => (
            <button
              key={n}
              onClick={() => setColumns(n)}
              className={`px-2 py-1.5 text-xs ${columns === n ? 'bg-chord/20 text-chord' : 'text-ink-muted hover:bg-surface-2'}`}
            >
              {n}
            </button>
          ))}
        </div>

        {/* Lyrics only */}
        <button
          onClick={() => setLyricsOnly(l => !l)}
          className={`p-1.5 rounded ${lyricsOnly ? 'text-chord bg-chord/10' : 'text-ink-muted hover:bg-surface-2 hover:text-ink'}`}
          title="Lyrics only"
        >
          <AlignLeft size={16} />
        </button>

        {/* Font size */}
        <div className="flex items-center gap-1">
          <button onClick={() => setFontScale(s => Math.max(0.7, s - 0.1))} className="p-1 text-ink-muted hover:text-ink text-sm font-bold">A-</button>
          <button onClick={() => setFontScale(s => Math.min(2.0, s + 0.1))} className="p-1 text-ink-muted hover:text-ink text-sm font-bold">A+</button>
        </div>

        {/* Favorite */}
        <button onClick={toggleFavorite} className="p-1.5 hover:bg-surface-2 rounded">
          <Star size={16} className={song.isFavorite ? 'text-chord fill-chord' : 'text-ink-muted'} />
        </button>

        {/* Present mode */}
        <Button variant="primary" size="sm" onClick={() => navigate(`/perform/${song.id}${setlistId ? `?setlistId=${setlistId}&pos=${currentPos}` : ''}`)}>
          <Maximize2 size={14} />
          Present
        </Button>

        {/* Edit */}
        <Button variant="ghost" size="sm" onClick={() => navigate(`/editor/${song.id}`)}>
          <Pencil size={14} />
        </Button>
      </div>

      {/* Song content */}
      <div className="flex-1 overflow-y-auto px-6 py-5">
        <SongRenderer
          content={song.transcription.content}
          transposeOffset={transpose}
          columns={columns}
          lyricsOnly={lyricsOnly}
          fontScale={fontScale}
        />
      </div>
    </div>
  )
}
