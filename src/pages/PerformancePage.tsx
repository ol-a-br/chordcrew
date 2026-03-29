import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { X, ChevronUp, ChevronDown, AlignLeft, ZoomIn, ZoomOut } from 'lucide-react'
import { db } from '@/db'
import { SongRenderer } from '@/components/viewer/SongRenderer'
import { useKeyboardNav } from '@/hooks/useKeyboard'
import { transposeKey } from '@/utils/chordpro'

function getDefaultColumns(): number {
  if (typeof window === 'undefined') return 2
  return window.matchMedia('(orientation: landscape)').matches ? 4 : 2
}

export default function PerformancePage() {
  const { id } = useParams<{ id: string }>()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const song = useLiveQuery(() => id ? db.songs.get(id) : undefined, [id])

  const setlistId = searchParams.get('setlistId')
  const currentPos = parseInt(searchParams.get('pos') ?? '0', 10)

  const [transpose, setTranspose]     = useState(0)
  const [columns, setColumns]         = useState(getDefaultColumns)
  const [lyricsOnly, setLyricsOnly]   = useState(false)
  const [fontScale, setFontScale]     = useState(1.15)
  const [showControls, setShowControls] = useState(true)
  const contentRef = useRef<HTMLDivElement>(null)
  const wakeLockRef = useRef<WakeLockSentinel | null>(null)
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Transposed key display
  const transposedKey = useMemo(
    () => transposeKey(song?.transcription.key ?? '', transpose),
    [song?.transcription.key, transpose]
  )

  // Setlist context: next song id
  const setlistItems = useLiveQuery<import('@/types').SetlistItem[]>(
    async () => setlistId ? db.setlistItems.where('setlistId').equals(setlistId).sortBy('order') : [],
    [setlistId]
  )
  const songItems = useMemo(
    () => setlistItems?.filter(i => i.type === 'song' && i.songId) ?? [],
    [setlistItems]
  )
  const nextSongId = songItems[currentPos + 1]?.songId

  // ── Wake Lock: keep screen on ─────────────────────────────────────────────
  useEffect(() => {
    const acquire = async () => {
      try {
        if ('wakeLock' in navigator) {
          wakeLockRef.current = await navigator.wakeLock.request('screen')
        }
      } catch { /* not supported or denied */ }
    }
    acquire()
    return () => { wakeLockRef.current?.release() }
  }, [])

  // ── Auto-hide controls ────────────────────────────────────────────────────
  const resetHideTimer = useCallback(() => {
    setShowControls(true)
    if (hideTimer.current) clearTimeout(hideTimer.current)
    hideTimer.current = setTimeout(() => setShowControls(false), 3000)
  }, [])

  useEffect(() => {
    resetHideTimer()
    return () => { if (hideTimer.current) clearTimeout(hideTimer.current) }
  }, [resetHideTimer])

  // ── Page-flip navigation: jump by one full screen height ──────────────────
  const goNext = useCallback(() => {
    const container = contentRef.current
    if (!container) return
    const atBottom = container.scrollTop + container.clientHeight >= container.scrollHeight - 4
    if (atBottom && nextSongId && setlistId) {
      // Advance to next song in setlist
      navigate(`/perform/${nextSongId}?setlistId=${setlistId}&pos=${currentPos + 1}`)
    } else {
      container.scrollBy({ top: container.clientHeight, behavior: 'auto' })
    }
  }, [nextSongId, setlistId, currentPos, navigate])

  const goPrev = useCallback(() => {
    const container = contentRef.current
    if (!container) return
    container.scrollBy({ top: -container.clientHeight, behavior: 'auto' })
  }, [])

  // ── PageFlip Cicada V7 — Mode 2: Left/Right Arrow ─────────────────────────
  useKeyboardNav({ onNext: goNext, onPrev: goPrev, enabled: true })

  if (!song) return null

  return (
    <div
      className="fixed inset-0 bg-surface-0 flex flex-col z-50"
      onPointerMove={resetHideTimer}
      onTouchStart={resetHideTimer}
    >
      {/* Controls overlay — auto-hides after 3s */}
      <div className={`
        absolute top-0 inset-x-0 z-10 flex items-center gap-3 px-4 py-3
        bg-gradient-to-b from-surface-0/95 to-transparent
        transition-opacity duration-300 ${showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'}
      `}>
        {/* Close */}
        <button onClick={() => navigate(-1)} className="text-ink-muted hover:text-ink p-1">
          <X size={20} />
        </button>

        {/* Title + artist */}
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-base truncate leading-tight">{song.title}</div>
          {song.artist && <div className="text-xs text-ink-muted truncate">{song.artist}</div>}
        </div>

        {/* Setlist position */}
        {setlistId && songItems.length > 0 && (
          <span className="text-xs font-mono text-ink-faint shrink-0">
            {currentPos + 1}/{songItems.length}
          </span>
        )}

        {/* Key & tempo */}
        {song.transcription.key && (
          <span className="text-xs font-mono text-chord shrink-0" title="Key">
            𝄞 {transpose !== 0 ? `${song.transcription.key} → ${transposedKey}` : song.transcription.key}
          </span>
        )}
        {song.transcription.tempo > 0 && (
          <span className="text-xs font-mono text-ink-muted shrink-0" title="Tempo">
            ♩ {song.transcription.tempo}
          </span>
        )}

        {/* Transpose */}
        <div className="flex items-center gap-1 bg-surface-2/80 rounded-lg px-1">
          <button onClick={() => setTranspose(t => t - 1)} className="p-1.5 text-ink-muted hover:text-ink"><ChevronDown size={15} /></button>
          <span className="text-xs font-mono w-7 text-center">
            {transpose > 0 ? `+${transpose}` : transpose}
          </span>
          <button onClick={() => setTranspose(t => t + 1)} className="p-1.5 text-ink-muted hover:text-ink"><ChevronUp size={15} /></button>
        </div>

        {/* Column count 1–5 */}
        <div className="flex items-center gap-0 bg-surface-2/80 rounded-lg overflow-hidden">
          {[1, 2, 3, 4, 5].map(n => (
            <button
              key={n}
              onClick={() => setColumns(n)}
              className={`px-2 py-1.5 text-xs ${columns === n ? 'bg-chord/30 text-chord' : 'text-ink-muted hover:text-ink'}`}
            >
              {n}
            </button>
          ))}
        </div>

        {/* Lyrics only */}
        <button
          onClick={() => setLyricsOnly(l => !l)}
          className={`p-1.5 rounded ${lyricsOnly ? 'text-chord' : 'text-ink-muted hover:text-ink'}`}
        >
          <AlignLeft size={16} />
        </button>

        {/* Font */}
        <button onClick={() => setFontScale(s => Math.max(0.8, s - 0.1))} className="p-1 text-ink-muted hover:text-ink">
          <ZoomOut size={16} />
        </button>
        <button onClick={() => setFontScale(s => Math.min(2.5, s + 0.1))} className="p-1 text-ink-muted hover:text-ink">
          <ZoomIn size={16} />
        </button>
      </div>

      {/* Song content — page-flip scroll (jumps by screen height) */}
      <div
        ref={contentRef}
        className="flex-1 overflow-y-auto overflow-x-hidden px-6 pt-16 pb-6"
        onClick={resetHideTimer}
      >
        <SongRenderer
          content={song.transcription.content}
          transposeOffset={transpose}
          columns={columns}
          lyricsOnly={lyricsOnly}
          fontScale={fontScale}
        />
      </div>

      {/* Bottom tap zones — tap left/right half to navigate */}
      <div className="absolute inset-x-0 bottom-0 top-16 flex pointer-events-none">
        <div className="flex-1 pointer-events-auto" onClick={goPrev} />
        <div className="flex-1 pointer-events-auto" onClick={goNext} />
      </div>
    </div>
  )
}
