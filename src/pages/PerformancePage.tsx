import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useFontScale } from '@/hooks/useFontScale'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { X, ChevronUp, ChevronDown, ChevronLeft, ChevronRight, AlignLeft, ZoomIn, ZoomOut, List } from 'lucide-react'
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
  const [fontScale, setFontScale]     = useFontScale()
  const [showControls, setShowControls] = useState(true)
  const [showTray, setShowTray]       = useState(false)
  const [metronome, setMetronome]     = useState(false)
  const [beat, setBeat]               = useState(false)

  const contentRef = useRef<HTMLDivElement>(null)
  const wakeLockRef = useRef<WakeLockSentinel | null>(null)
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const appliedItemRef = useRef<string | null>(null)
  const beatTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

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
  const prevSongId = songItems[currentPos - 1]?.songId
  const nextSongId = songItems[currentPos + 1]?.songId
  const currentSetlistItem = songItems[currentPos]

  // Songs needed for the quick-jump tray
  const traySongIds = useMemo(
    () => songItems.map(i => i.songId!),
    [songItems]
  )
  const traySongMap = useLiveQuery(
    async () => {
      if (traySongIds.length === 0) return {}
      const list = await db.songs.bulkGet(traySongIds)
      return Object.fromEntries(
        list.filter(Boolean).map(s => [s!.id, { title: s!.title, artist: s!.artist }])
      )
    },
    [traySongIds.join(',')]
  )

  // ── Per-slot overrides ────────────────────────────────────────────────────
  useEffect(() => {
    if (!currentSetlistItem || currentSetlistItem.id === appliedItemRef.current) return
    appliedItemRef.current = currentSetlistItem.id
    setTranspose(currentSetlistItem.transposeOffset ?? 0)
    if (currentSetlistItem.columnCount) setColumns(currentSetlistItem.columnCount)
  }, [currentSetlistItem])

  // ── Visual metronome ──────────────────────────────────────────────────────
  useEffect(() => {
    if (beatTimerRef.current) clearInterval(beatTimerRef.current)
    if (metronome && song && song.transcription.tempo > 0) {
      const intervalMs = 60000 / song.transcription.tempo
      beatTimerRef.current = setInterval(() => {
        setBeat(true)
        setTimeout(() => setBeat(false), Math.min(80, intervalMs * 0.15))
      }, intervalMs)
    } else {
      setBeat(false)
    }
    return () => { if (beatTimerRef.current) clearInterval(beatTimerRef.current) }
  }, [metronome, song?.transcription.tempo])

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

  // ── Long-press pedal: hold right = skip song, hold left = back to start ───
  useEffect(() => {
    const LONG_PRESS_MS = 700
    const timers = new Map<string, ReturnType<typeof setTimeout>>()

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return

      if (e.key === 'ArrowRight') {
        timers.set('right', setTimeout(() => {
          timers.delete('right')
          if (nextSongId && setlistId) {
            navigate(`/perform/${nextSongId}?setlistId=${setlistId}&pos=${currentPos + 1}`)
          }
        }, LONG_PRESS_MS))
      }
      if (e.key === 'ArrowLeft') {
        timers.set('left', setTimeout(() => {
          timers.delete('left')
          const container = contentRef.current
          if (container) container.scrollTo({ left: 0, top: 0, behavior: 'auto' })
        }, LONG_PRESS_MS))
      }
    }

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') { clearTimeout(timers.get('right')); timers.delete('right') }
      if (e.key === 'ArrowLeft')  { clearTimeout(timers.get('left'));  timers.delete('left')  }
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      timers.forEach(t => clearTimeout(t))
    }
  }, [nextSongId, setlistId, currentPos, navigate])

  if (!song) return null

  const isMultiColumn = columns > 1
  const trayItems = setlistItems ?? []

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
          <div className="flex items-center gap-0.5 shrink-0">
            <button
              onClick={() => prevSongId && navigate(`/perform/${prevSongId}?setlistId=${setlistId}&pos=${currentPos - 1}`)}
              disabled={!prevSongId}
              className="p-0.5 text-ink-faint hover:text-ink disabled:opacity-30"
              title="Previous song"
            >
              <ChevronLeft size={14} />
            </button>
            <span className="text-xs font-mono text-ink-faint px-1">
              {currentPos + 1}/{songItems.length}
            </span>
            <button
              onClick={() => nextSongId && navigate(`/perform/${nextSongId}?setlistId=${setlistId}&pos=${currentPos + 1}`)}
              disabled={!nextSongId}
              className="p-0.5 text-ink-faint hover:text-ink disabled:opacity-30"
              title="Next song"
            >
              <ChevronRight size={14} />
            </button>
          </div>
        )}

        {song.transcription.key && (
          <span className="text-xs font-mono text-chord shrink-0" title="Key">
            𝄞 {transpose !== 0 ? `${song.transcription.key} → ${transposedKey}` : song.transcription.key}
          </span>
        )}
        {song.transcription.tempo > 0 && (
          <button
            onClick={() => setMetronome(m => !m)}
            className={`relative text-xs font-mono shrink-0 px-1.5 py-0.5 rounded transition-colors ${
              metronome ? 'text-chord bg-chord/10' : 'text-ink-muted hover:text-ink'
            }`}
            title={`Metronome — ${song.transcription.tempo} BPM`}
          >
            ♩ {song.transcription.tempo}
            {metronome && (
              <span
                className={`absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full transition-colors duration-75 ${
                  beat ? 'bg-chord' : 'bg-chord/25'
                }`}
              />
            )}
          </button>
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

        {/* Quick-jump tray toggle — only when in a setlist */}
        {setlistId && songItems.length > 1 && (
          <button
            onClick={() => { setShowTray(t => !t); resetHideTimer() }}
            className={`p-1.5 rounded shrink-0 ${showTray ? 'text-chord' : 'text-ink-muted hover:text-ink'}`}
            title="Song list"
          >
            <List size={15} />
          </button>
        )}
      </div>

      {/* Song content */}
      {isMultiColumn ? (
        /* Multi-column: horizontal column-by-column flip, scrollbar hidden */
        <div
          ref={contentRef}
          className="flex-1 overflow-x-auto overflow-y-hidden hide-scrollbar"
          onClick={resetHideTimer}
        >
          {/* Padding shrinks when controls hide to reclaim screen space */}
          <div
            className="h-full px-6 pb-6"
            style={{
              paddingTop: showControls ? '4rem' : '0.5rem',
              transition: 'padding-top 300ms ease-in-out',
            }}
          >
            <SongRenderer
              content={song.transcription.content}
              transposeOffset={transpose}
              columns={columns}
              lyricsOnly={lyricsOnly}
              fontScale={fontScale}
              expandRepeats
              pageFlip
            />
          </div>
        </div>
      ) : (
        /* Single column: vertical page-flip */
        <div
          ref={contentRef}
          className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden hide-scrollbar px-6 pb-6"
          onClick={resetHideTimer}
          style={{
            paddingTop: showControls ? '4rem' : '0.5rem',
            transition: 'padding-top 300ms ease-in-out',
          }}
        >
          <SongRenderer
            content={song.transcription.content}
            transposeOffset={transpose}
            columns={1}
            lyricsOnly={lyricsOnly}
            fontScale={fontScale}
            expandRepeats
          />
        </div>
      )}

      {/* Tap zones: left half = prev, right half = next */}
      <div className="absolute inset-x-0 bottom-0 top-16 flex pointer-events-none">
        <div className="flex-1 pointer-events-auto" onClick={goPrev} />
        <div className="flex-1 pointer-events-auto" onClick={goNext} />
      </div>

      {/* Quick-jump tray */}
      {showTray && setlistId && (
        <>
          {/* Backdrop — closes tray on tap */}
          <div
            className="absolute inset-0 z-20"
            onClick={() => setShowTray(false)}
          />
          {/* Slide-up panel */}
          <div className="absolute bottom-0 inset-x-0 z-30 bg-surface-1 border-t border-surface-3 rounded-t-2xl max-h-[65vh] flex flex-col shadow-2xl">
            <div className="flex items-center justify-between px-4 py-3 border-b border-surface-3 shrink-0">
              <span className="text-sm font-semibold text-ink">Setlist</span>
              <button
                onClick={() => setShowTray(false)}
                className="p-1 text-ink-muted hover:text-ink"
              >
                <X size={16} />
              </button>
            </div>

            <div className="overflow-y-auto flex-1">
              {trayItems.map(item => {
                if (item.type === 'divider') {
                  return (
                    <div
                      key={item.id}
                      className="px-4 py-1.5 text-xs text-ink-muted uppercase tracking-wider font-semibold bg-surface-2/50"
                    >
                      {item.dividerName ?? '—'}
                    </div>
                  )
                }

                const posInSongItems = songItems.findIndex(s => s.id === item.id)
                const isCurrent = posInSongItems === currentPos
                const songData = item.songId ? traySongMap?.[item.songId] : undefined

                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      setShowTray(false)
                      if (item.songId && posInSongItems !== -1) {
                        navigate(`/perform/${item.songId}?setlistId=${setlistId}&pos=${posInSongItems}`)
                      }
                    }}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                      isCurrent ? 'bg-surface-2' : 'hover:bg-surface-2/60'
                    }`}
                  >
                    <span className={`text-xs font-mono w-5 shrink-0 text-right ${isCurrent ? 'text-chord' : 'text-ink-faint'}`}>
                      {posInSongItems + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className={`text-sm font-medium truncate ${isCurrent ? 'text-chord' : 'text-ink'}`}>
                        {songData?.title ?? 'Unknown'}
                      </div>
                      {songData?.artist && (
                        <div className="text-xs text-ink-muted truncate">{songData.artist}</div>
                      )}
                    </div>
                    {isCurrent && (
                      <div className="w-1.5 h-1.5 rounded-full bg-chord shrink-0" />
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
