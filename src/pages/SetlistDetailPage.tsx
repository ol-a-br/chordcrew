import { useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { ArrowLeft, Play, Music } from 'lucide-react'
import { db } from '@/db'
import { Button } from '@/components/shared/Button'

export default function SetlistDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const setlist = useLiveQuery(() => id ? db.setlists.get(id) : undefined, [id])
  const items = useLiveQuery(
    () => id ? db.setlistItems.where('setlistId').equals(id).sortBy('order') : [],
    [id]
  )

  // Load all songs referenced by the setlist items in one query
  const songIds = useMemo(
    () => (items ?? []).filter(i => i.type === 'song' && i.songId).map(i => i.songId!),
    [items]
  )
  const songs = useLiveQuery(
    async () => {
      if (songIds.length === 0) return {}
      const list = await db.songs.bulkGet(songIds)
      return Object.fromEntries(list.filter(Boolean).map(s => [s!.id, s!]))
    },
    // Re-run when the set of songIds changes
    [songIds.join(',')]
  )

  if (setlist === undefined) return <div className="p-8 text-ink-muted">Loading…</div>
  if (!setlist) return <div className="p-8 text-ink-muted">Setlist not found.</div>

  const songItems = (items ?? []).filter(i => i.type === 'song' && i.songId)

  const handlePresent = () => {
    const first = songItems[0]
    if (first?.songId) navigate(`/perform/${first.songId}?setlistId=${id}&pos=0`)
  }

  const handleSongClick = (songId: string, posInSongItems: number) => {
    navigate(`/view/${songId}?setlistId=${id}&pos=${posInSongItems}`)
  }

  // Track position within song items (dividers don't count)
  let songPos = -1

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate('/setlists')}
          className="p-1.5 text-ink-muted hover:text-ink rounded"
          title="Back to setlists"
        >
          <ArrowLeft size={18} />
        </button>
        <h1 className="text-lg font-semibold flex-1 truncate">{setlist.name}</h1>
        {songItems.length > 0 && (
          <Button variant="primary" size="sm" onClick={handlePresent}>
            <Play size={14} />
            Present
          </Button>
        )}
      </div>

      {/* Song count */}
      {(items ?? []).length > 0 && (
        <p className="text-xs text-ink-muted">{songItems.length} song{songItems.length !== 1 ? 's' : ''}</p>
      )}

      {/* Empty state */}
      {(items ?? []).length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-ink-muted text-sm space-y-2">
          <Music size={32} className="text-ink-faint mb-2" />
          <p>No songs in this setlist yet</p>
        </div>
      )}

      {/* Item list */}
      <ul className="space-y-2">
        {(items ?? []).map(item => {
          if (item.type === 'divider') {
            return (
              <li
                key={item.id}
                className="px-3 py-1.5 text-xs text-ink-muted uppercase tracking-wider font-semibold border-b border-surface-3"
              >
                {item.dividerName ?? '—'}
              </li>
            )
          }

          // Song item
          songPos++
          const pos = songPos
          const song = item.songId ? songs?.[item.songId] : undefined

          return (
            <li
              key={item.id}
              className="flex items-center gap-3 p-3 bg-surface-1 rounded-xl border border-surface-3 hover:border-chord/30 hover:bg-surface-2 cursor-pointer group"
              onClick={() => item.songId && handleSongClick(item.songId, pos)}
            >
              {/* Position number */}
              <span className="text-xs font-mono text-ink-faint w-5 text-center shrink-0">
                {pos + 1}
              </span>

              {/* Song info */}
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm truncate">
                  {song?.title ?? 'Unknown song'}
                </div>
                {song?.artist && (
                  <div className="text-xs text-ink-muted truncate">{song.artist}</div>
                )}
              </div>

              {/* Key badge */}
              {song?.transcription.key && (
                <span className="text-xs font-mono text-chord bg-chord/10 px-2 py-0.5 rounded shrink-0">
                  {song.transcription.key}
                </span>
              )}

              {/* Per-slot transpose indicator */}
              {item.transposeOffset !== 0 && (
                <span className="text-xs font-mono text-ink-muted shrink-0">
                  {item.transposeOffset > 0 ? `+${item.transposeOffset}` : item.transposeOffset}
                </span>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
