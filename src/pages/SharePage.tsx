import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Music2, ChevronLeft, ChevronRight } from 'lucide-react'
import { SongRenderer } from '@/components/viewer/SongRenderer'
import { decodeSongShare, decodeSetlistShare, type SharedSong, type SharedSetlist } from '@/utils/share'
import { Button } from '@/components/shared/Button'

export default function SharePage() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [song, setSong] = useState<SharedSong | null>(null)
  const [setlist, setSetlist] = useState<SharedSetlist | null>(null)
  const [setlistPos, setSetlistPos] = useState(0)

  useEffect(() => {
    const hash = window.location.hash.slice(1)
    if (!hash) {
      setError('No share data in URL.')
      setLoading(false)
      return
    }

    async function decode() {
      // Try song first, then setlist
      const s = await decodeSongShare(hash)
      if (s) { setSong(s); setLoading(false); return }
      const l = await decodeSetlistShare(hash)
      if (l) { setSetlist(l); setLoading(false); return }
      setError('Could not decode share link. It may be corrupted or expired.')
      setLoading(false)
    }
    decode()
  }, [])

  if (loading) {
    return (
      <div className="min-h-screen bg-surface-0 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-chord border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-surface-0 flex items-center justify-center p-6">
        <div className="text-center space-y-4 max-w-sm">
          <Music2 size={48} className="text-ink-faint mx-auto" />
          <h1 className="text-lg font-semibold">Share Link Error</h1>
          <p className="text-sm text-ink-muted">{error}</p>
          <Button variant="primary" onClick={() => navigate('/library')}>
            Open ChordCrew
          </Button>
        </div>
      </div>
    )
  }

  // ── Single song view ─────────────────────────────────────────────────────
  if (song) {
    return (
      <div className="min-h-screen bg-surface-0 flex flex-col">
        <header className="flex items-center gap-3 px-4 py-3 border-b border-surface-3 bg-surface-1 shrink-0">
          <div className="flex-1 min-w-0">
            <h1 className="font-semibold text-base truncate">{song.title}</h1>
            <p className="text-xs text-ink-muted truncate">
              {song.artist}{song.key ? ` · ${song.key}` : ''}
            </p>
          </div>
          <span className="text-xs text-ink-faint bg-surface-2 px-2 py-1 rounded">Read-only</span>
        </header>
        <div className="flex-1 overflow-y-auto px-6 py-5">
          <SongRenderer content={song.content} transposeOffset={0} columns={1} />
        </div>
        <footer className="px-4 py-3 border-t border-surface-3 bg-surface-1 text-center">
          <p className="text-xs text-ink-faint">
            Shared via <span className="text-chord font-medium">ChordCrew</span>
          </p>
        </footer>
      </div>
    )
  }

  // ── Setlist view ─────────────────────────────────────────────────────────
  if (setlist) {
    const currentSong = setlist.songs[setlistPos]
    const hasPrev = setlistPos > 0
    const hasNext = setlistPos < setlist.songs.length - 1

    return (
      <div className="min-h-screen bg-surface-0 flex flex-col">
        <header className="flex items-center gap-3 px-4 py-3 border-b border-surface-3 bg-surface-1 shrink-0">
          <div className="flex-1 min-w-0">
            <h1 className="font-semibold text-sm truncate text-ink-muted">{setlist.name}</h1>
            <p className="font-semibold text-base truncate">{currentSong.title}</p>
            <p className="text-xs text-ink-muted truncate">
              {currentSong.artist}{currentSong.key ? ` · ${currentSong.key}` : ''}
            </p>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={() => setSetlistPos(p => p - 1)}
              disabled={!hasPrev}
              className="p-1 text-ink-faint hover:text-ink disabled:opacity-30"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="text-xs font-mono text-ink-faint px-1">
              {setlistPos + 1}/{setlist.songs.length}
            </span>
            <button
              onClick={() => setSetlistPos(p => p + 1)}
              disabled={!hasNext}
              className="p-1 text-ink-faint hover:text-ink disabled:opacity-30"
            >
              <ChevronRight size={16} />
            </button>
          </div>
          <span className="text-xs text-ink-faint bg-surface-2 px-2 py-1 rounded">Read-only</span>
        </header>
        <div className="flex-1 overflow-y-auto px-6 py-5">
          <SongRenderer
            content={currentSong.content}
            transposeOffset={currentSong.transposeOffset}
            columns={1}
          />
        </div>
        <footer className="px-4 py-3 border-t border-surface-3 bg-surface-1 text-center">
          <p className="text-xs text-ink-faint">
            Shared via <span className="text-chord font-medium">ChordCrew</span>
          </p>
        </footer>
      </div>
    )
  }

  return null
}
