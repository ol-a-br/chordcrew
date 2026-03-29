import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { Pencil, ChevronUp, ChevronDown, Columns, AlignLeft, Star, Maximize2 } from 'lucide-react'
import { db } from '@/db'
import { SongRenderer } from '@/components/viewer/SongRenderer'
import { Button } from '@/components/shared/Button'

export default function ViewerPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const song = useLiveQuery(() => id ? db.songs.get(id) : undefined, [id])

  const [transpose, setTranspose] = useState(0)
  const [columns, setColumns] = useState<1 | 2 | 3>(1)
  const [lyricsOnly, setLyricsOnly] = useState(false)
  const [fontScale, setFontScale] = useState(1.0)

  const toggleFavorite = async () => {
    if (!song) return
    await db.songs.update(song.id, { isFavorite: !song.isFavorite })
  }

  if (!song) return <div className="p-8 text-ink-muted">Loading…</div>

  const nextColumn = () => setColumns(c => Math.min(3, c + 1) as 1 | 2 | 3)
  const prevColumn = () => setColumns(c => Math.max(1, c - 1) as 1 | 2 | 3)

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-surface-3 bg-surface-1 shrink-0 flex-wrap">
        {/* Song info */}
        <div className="flex-1 min-w-0 mr-2">
          <h1 className="font-semibold text-sm truncate">{song.title}</h1>
          {song.artist && <p className="text-xs text-ink-muted truncate">{song.artist}</p>}
        </div>

        {/* Transpose */}
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

        {/* Columns */}
        <div className="flex items-center gap-1 border border-surface-3 rounded-lg overflow-hidden">
          {([1, 2, 3] as const).map(n => (
            <button
              key={n}
              onClick={() => setColumns(n)}
              className={`px-2.5 py-1.5 text-xs ${columns === n ? 'bg-chord/20 text-chord' : 'text-ink-muted hover:bg-surface-2'}`}
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
        <Button variant="primary" size="sm" onClick={() => navigate(`/perform/${song.id}`)}>
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
