import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { X, ChevronUp, ChevronDown, AlignLeft, ZoomIn, ZoomOut } from 'lucide-react'
import { db } from '@/db'
import { SongRenderer } from '@/components/viewer/SongRenderer'
import { useKeyboardNav } from '@/hooks/useKeyboard'
import { transposeKey } from '@/utils/chordpro'
import type { SetlistItem } from '@/types'

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

  const transposedKey = useMemo(
    () => transposeKey(song?.transcription.key ?? '', transpose),
    [song?.transcription.key, transpose]
  )

  const setlistItems = useLiveQuery(
    async (): Promise<SetlistItem[]> => setlistId ? db.setlistItems.where('setlistId').equals(setlistId).sortBy('order') : [],
    [setlistId]
  )
  const songItems = useMemo(
    () => setlistItems?.filter(i => i.type === 'song' && i.songId) ?? [],
    [setlistItems]
  )
  const nextSongId = songItems[currentPos + 1]?.songId

  // ── Wake Lock ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const acquire = async () => {
      try {
        if ('wakeLock' in navigator) {
          wakeLockRef.current = await navigator.wakeLock.request('screen')
        }
      } catch { /* not supported */ }
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

  // ── Compute CSS column stride for precise column-by-column navigation ─────
  const getColumnStride = useCallback((): number => {
    const container = contentRef.current
    if (!container || columns <= 1) return 0
    const output = container.querySelector<HTMLElement>('.chordpro-output')
    if (output) {
      const style = getComputedStyle(output)
      const colW = parseFloat(style.columnWidth) || 0
      const gap  = parseFloat(style.columnGap)   || 0
      if (colW > 0) return colW + gap
    }
    return container.clientWidth / columns
  }, [columns])

  // ── Navigation ────────────────────────────────────────────────────────────
  const goNext = useCallback(() => {
    const container = contentRef.current
    if (!container) return
    resetHideTimer()

    if (columns > 1) {
      // Horizontal column-by-column flip
      const stride = getColumnStride()
      const newLeft = container.scrollLeft + stride
      container.scrollTo({ left: newLeft, behavior: 'auto' })
      // At end of horizontal content → advance to next song
      if (newLeft + container.clientWidth >= container.scrollWidth - 10 && nextSongId && setlistId) {
        setTimeout(() => navigate(`/perform/${nextSongId}?setlistId=${setlistId}&pos=${currentPos + 1}`), 120)
      }
    } else {
      // Single column: vertical page-flip by full screen height
      const atBottom = container.scrollTop + container.clientHeight >= container.scrollHeight - 4
      if (atBottom && nextSongId && setlistId) {
        navigate(`/perform/${nextSongId}?setlistId=${setlistId}&pos=${currentPos + 1}`)
      } else {
        container.scrollBy({ top: container.clientHeight, behavior: 'auto' })
      }
    }
  }, [columns, getColumnStride, nextSongId, setlistId, currentPos, navigate, resetHideTimer])

  const goPrev = useCallback(() => {
    const container = contentRef.current
    if (!container) return
    resetHideTimer()
    if (columns > 1) {
      const stride = getColumnStride()
      container.scrollTo({ left: Math.max(0, container.scrollLeft - stride), behavior: 'auto' })
    } else {
      container.scrollBy({ top: -container.clientHeight, behavior: 'auto' })
    }
  }, [columns, getColumnStride, resetHideTimer])

  useKeyboardNav({ onNext: goNext, onPrev: goPrev, enabled: true })

  if (!song) return null

  const isMultiColumn = columns > 1

  return (
    <div
      className="fixed inset-0 bg-surface-0 flex flex-col z-50"
      onPointerMove={resetHideTimer}
      onTouchStart={resetHideTimer}
    >
      {/* Controls overlay */}
      <div className={`
        absolute top-0 inset-x-0 z-10 flex items-center gap-2 px-4 py-3
        bg-gradient-to-b from-surface-0/95 to-transparent
        transition-opacity duration-300 ${showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'}
      `}>
        <button onClick={() => navigate(-1)} className="text-ink-muted hover:text-ink p-1 shrink-0">
          <X size={20} />
        </button>

        <div className="flex-1 min-w-0">
          <div className="font-semibold text-base truncate leading-tight">{song.title}</div>
          {song.artist && <div className="text-xs text-ink-muted truncate">{song.artist}</div>}
        </div>

        {setlistId && songItems.length > 0 && (
          <span className="text-xs font-mono text-ink-faint shrink-0">
            {currentPos + 1}/{songItems.length}
          </span>
        )}

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
        <div className="flex items-center gap-0.5 bg-surface-2/80 rounded-lg px-1">
          <button onClick={() => setTranspose(t => t - 1)} className="p-1 text-ink-muted hover:text-ink"><ChevronDown size={15} /></button>
          <span className="text-xs font-mono w-6 text-center">
            {transpose > 0 ? `+${transpose}` : transpose}
          </span>
          <button onClick={() => setTranspose(t => t + 1)} className="p-1 text-ink-muted hover:text-ink"><ChevronUp size={15} /></button>
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

        <button
          onClick={() => setLyricsOnly(l => !l)}
          className={`p-1.5 rounded shrink-0 ${lyricsOnly ? 'text-chord' : 'text-ink-muted hover:text-ink'}`}
        >
          <AlignLeft size={15} />
        </button>

        <button onClick={() => setFontScale(s => Math.max(0.8, s - 0.1))} className="p-1 text-ink-muted hover:text-ink shrink-0">
          <ZoomOut size={15} />
        </button>
        <button onClick={() => setFontScale(s => Math.min(2.5, s + 0.1))} className="p-1 text-ink-muted hover:text-ink shrink-0">
          <ZoomIn size={15} />
        </button>
      </div>

      {/* Song content */}
      {isMultiColumn ? (
        /* Multi-column: horizontal column-by-column flip, scrollbar hidden */
        <div
          ref={contentRef}
          className="flex-1 overflow-x-auto overflow-y-hidden hide-scrollbar"
          onClick={resetHideTimer}
        >
          {/* Inner wrapper: gives SongRenderer a definite height for CSS column-fill: auto */}
          <div className="h-full pt-16 px-6 pb-6">
            <SongRenderer
              content={song.transcription.content}
              transposeOffset={transpose}
              columns={columns}
              lyricsOnly={lyricsOnly}
              fontScale={fontScale}
              pageFlip
            />
          </div>
        </div>
      ) : (
        /* Single column: vertical page-flip */
        <div
          ref={contentRef}
          className="flex-1 overflow-y-auto overflow-x-hidden px-6 pt-16 pb-6"
          onClick={resetHideTimer}
        >
          <SongRenderer
            content={song.transcription.content}
            transposeOffset={transpose}
            columns={1}
            lyricsOnly={lyricsOnly}
            fontScale={fontScale}
          />
        </div>
      )}

      {/* Tap zones: left half = prev, right half = next */}
      <div className="absolute inset-x-0 bottom-0 top-16 flex pointer-events-none">
        <div className="flex-1 pointer-events-auto" onClick={goPrev} />
        <div className="flex-1 pointer-events-auto" onClick={goNext} />
      </div>
    </div>
  )
}
