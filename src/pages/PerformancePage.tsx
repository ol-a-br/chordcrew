import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useFontScale } from '@/hooks/useFontScale'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { X, ChevronUp, ChevronDown, ChevronLeft, ChevronRight, AlignLeft, ZoomIn, ZoomOut, List } from 'lucide-react'
import { db } from '@/db'
import { SongRenderer, prewarmSongCache, isSongCached, getCachedHtml } from '@/components/viewer/SongRenderer'
import { useKeyboardNav } from '@/hooks/useKeyboard'
import { transposeKey, getFirstChords } from '@/utils/chordpro'
import type { SetlistItem } from '@/types'

function getDefaultColumns(): number {
  if (typeof window === 'undefined') return 2
  return window.matchMedia('(orientation: landscape)').matches ? 4 : 2
}

// Module-level: all three variables persist across React component remounts.
//
// lastNavTime: timestamp of the last swipe that triggered navigation. Used as a
//   secondary time-based gate in case navPending is cleared too early.
//
// swipeFired: set true when a swipe gesture is detected. Prevents the synthetic
//   click that browsers fire after touchend from also triggering the tap-zone
//   onClick. Must be module-level because React Router can flush the component
//   remount before the click event propagates, resetting a useRef to false.
//
// navPending: true while the new song hasn't finished rendering. Blocks all
//   swipe/tap navigation. ChordSheetJS parse can take ~700ms on slow hardware,
//   which is exactly the old fixed cooldown — causing the second swipe's queued
//   touchend to fire right after the window expired and skip a song. This flag
//   ties the navigation lock to actual render completion rather than a timer.
let lastNavTime = 0
let swipeFired = false
let navPending = false
const NAV_COOLDOWN_MS = 800

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
  const [showKeyDropdown, setShowKeyDropdown] = useState(false)
  const [metronome, setMetronome]     = useState(false)
  const [beat, setBeat]               = useState(false)
  const [songHtmlReady, setSongHtmlReady] = useState(false)
  const [swipeHint, setSwipeHint] = useState<{ dir: 'prev' | 'next'; targetPos: number } | null>(null)

  const contentRef = useRef<HTMLDivElement>(null)
  const wakeLockRef = useRef<WakeLockSentinel | null>(null)
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const appliedItemRef = useRef<string | null>(null)
  const beatTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const touchStartRef = useRef<{ x: number; y: number } | null>(null)
  const swipeHintTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const transposedKey = useMemo(
    () => transposeKey(song?.transcription.key ?? '', transpose),
    [song?.transcription.key, transpose]
  )

  const keyDropdownEntries = useMemo(() => {
    if (!song?.transcription.key) return []
    const originalKey = song.transcription.key
    const content = song.transcription.content
    return Array.from({ length: 12 }, (_, i) => {
      const delta = i - 5
      const key   = transposeKey(originalKey, delta)
      const chords = getFirstChords(content, delta, 4)
      return { delta, key, chords }
    })
  }, [song?.transcription.key, song?.transcription.content])

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
  const goNext = useCallback((noHide = false) => {
    const container = contentRef.current
    if (!container) return
    if (!noHide) resetHideTimer()

    if (columns > 1) {
      // At end of horizontal content → navigate immediately (no scroll-then-navigate bounce)
      const atEnd = container.scrollLeft + container.clientWidth >= container.scrollWidth - 10
      if (atEnd && nextSongId && setlistId) {
        navPending = true
        lastNavTime = Date.now()
        navigate(`/perform/${nextSongId}?setlistId=${setlistId}&pos=${currentPos + 1}`)
        return
      }
      const stride = getColumnStride()
      container.scrollTo({ left: container.scrollLeft + stride, behavior: 'auto' })
    } else {
      // Single column: vertical page-flip by full screen height
      const atBottom = container.scrollTop + container.clientHeight >= container.scrollHeight - 4
      if (atBottom && nextSongId && setlistId) {
        navPending = true
        lastNavTime = Date.now()
        navigate(`/perform/${nextSongId}?setlistId=${setlistId}&pos=${currentPos + 1}`)
      } else {
        container.scrollBy({ top: container.clientHeight, behavior: 'auto' })
      }
    }
  }, [columns, getColumnStride, nextSongId, setlistId, currentPos, navigate, resetHideTimer])

  const goPrev = useCallback((noHide = false) => {
    const container = contentRef.current
    if (!container) return
    if (!noHide) resetHideTimer()
    if (columns > 1) {
      if (container.scrollLeft < 10 && prevSongId && setlistId) {
        navPending = true
        lastNavTime = Date.now()
        navigate(`/perform/${prevSongId}?setlistId=${setlistId}&pos=${currentPos - 1}`)
        return
      }
      const stride = getColumnStride()
      container.scrollTo({ left: Math.max(0, container.scrollLeft - stride), behavior: 'auto' })
    } else {
      if (container.scrollTop < 4 && prevSongId && setlistId) {
        navPending = true
        lastNavTime = Date.now()
        navigate(`/perform/${prevSongId}?setlistId=${setlistId}&pos=${currentPos - 1}`)
        return
      }
      container.scrollBy({ top: -container.clientHeight, behavior: 'auto' })
    }
  }, [columns, getColumnStride, prevSongId, setlistId, currentPos, navigate, resetHideTimer])

  // ── Reset scroll position when song changes (new DOM element, but be explicit) ─
  useEffect(() => {
    const el = contentRef.current
    if (el) { el.scrollLeft = 0; el.scrollTop = 0 }
  }, [id])

  // ── Async render: let spinner paint before blocking ChordSheetJS parse ───────
  // Cache hit → songHtmlReady = true immediately (no spinner).
  // Cache miss → songHtmlReady = false (spinner shows), then double-rAF fires
  // so the browser can paint the spinner before the synchronous parse blocks.
  useEffect(() => {
    if (!song) { setSongHtmlReady(false); return }
    if (isSongCached(song.transcription.content, transpose, true)) {
      // Stamp lastNavTime when the new song actually finishes rendering so the
      // cooldown guard in handleTouchEnd is measured from render completion, not
      // from when navigate() was called. This prevents a queued touchEnd (held in
      // the event queue while the main thread was blocked by the ChordSheetJS parse)
      // from firing right as navPending clears and slipping through the cooldown.
      if (navPending) lastNavTime = Date.now()
      navPending = false
      setSongHtmlReady(true)
      return
    }
    setSongHtmlReady(false)
    let raf2 = 0
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        getCachedHtml(song.transcription.content, transpose, true)
        if (navPending) lastNavTime = Date.now()
        navPending = false
        setSongHtmlReady(true)
      })
    })
    return () => { cancelAnimationFrame(raf1); cancelAnimationFrame(raf2) }
  }, [song?.id, song?.transcription.content, transpose])

  // ── Clean up swipe hint timer on unmount ─────────────────────────────────────
  useEffect(() => () => { if (swipeHintTimer.current) clearTimeout(swipeHintTimer.current) }, [])

  // ── Prefetch adjacent songs to warm the render cache ─────────────────────────
  useEffect(() => {
    if (!song || songItems.length === 0) return
    const candidates = [
      { entry: songItems[currentPos - 1] },
      { entry: songItems[currentPos + 1] },
    ].filter(({ entry }) => entry?.songId) as { entry: SetlistItem }[]
    if (candidates.length === 0) return
    // Delay to avoid competing with the current song's own DOM processing
    const t = setTimeout(async () => {
      for (const { entry } of candidates) {
        const s = await db.songs.get(entry.songId!)
        if (s) prewarmSongCache(s.transcription.content, entry.transposeOffset ?? 0, true)
      }
    }, 300)
    return () => clearTimeout(t)
  }, [song?.id, currentPos, songItems])

  // Keep controls visible while key dropdown is open
  useEffect(() => {
    if (showKeyDropdown) {
      setShowControls(true)
      if (hideTimer.current) clearTimeout(hideTimer.current)
    }
  }, [showKeyDropdown])

  // ── Swipe gesture (horizontal) ────────────────────────────────────────────
  // handleTouchStart does NOT call resetHideTimer: we don't want the toolbar
  // to appear (and reflow the layout) at the start of every touch.
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
  }, [])

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (!touchStartRef.current) return
    const dx = e.changedTouches[0].clientX - touchStartRef.current.x
    const dy = e.changedTouches[0].clientY - touchStartRef.current.y
    touchStartRef.current = null

    const isSwipe = Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5
    if (!isSwipe) {
      // Plain tap → show/hide controls as before
      resetHideTimer()
      return
    }

    // Block while the previous navigation is still rendering the new song.
    if (navPending) return

    // Cooldown: secondary guard in case navPending is cleared before the queued
    // touchend fires on the freshly-mounted next-song component.
    const now = Date.now()
    if (now - lastNavTime < NAV_COOLDOWN_MS) return

    swipeFired = true
    // Stamp here so the cooldown applies even if goNext/goPrev scroll rather than
    // navigate (e.g. nextSongId not yet resolved from live query). goNext/goPrev
    // will overwrite this with a fresh timestamp when they do navigate().
    lastNavTime = Date.now()

    // Determine whether this swipe will cross a song boundary now (before goNext/
    // goPrev mutate state) so the hint can show the right song index.
    const dir = dx < 0 ? 'next' : 'prev'
    const container = contentRef.current
    let willCrossBoundary = false
    if (container) {
      if (dir === 'next') {
        willCrossBoundary = columns > 1
          ? container.scrollLeft + container.clientWidth >= container.scrollWidth - 10
          : container.scrollTop + container.clientHeight >= container.scrollHeight - 4
      } else {
        willCrossBoundary = columns > 1
          ? container.scrollLeft < 10
          : container.scrollTop < 4
      }
    }

    const targetPos = willCrossBoundary
      ? (dir === 'next' ? currentPos + 1 : currentPos - 1)
      : currentPos

    if (swipeHintTimer.current) clearTimeout(swipeHintTimer.current)
    setSwipeHint({ dir, targetPos })
    swipeHintTimer.current = setTimeout(() => setSwipeHint(null), 700)

    if (dir === 'next') goNext(true)
    else goPrev(true)
  }, [goNext, goPrev, resetHideTimer, currentPos, columns])

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

  if (!song || !songHtmlReady) {
    return (
      <div className="fixed inset-0 bg-surface-0 flex items-center justify-center z-50">
        <div className="w-8 h-8 border-2 border-chord border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  const isMultiColumn = columns > 1
  const trayItems = setlistItems ?? []

  return (
    <div
      className="fixed inset-0 bg-surface-0 flex flex-col z-50"
      onPointerMove={(e) => { if (e.pointerType === 'mouse') resetHideTimer() }}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Controls overlay */}
      <div className={`
        absolute top-0 inset-x-0 z-10 flex items-center gap-2 px-4 py-3
        bg-gradient-to-b from-surface-0/95 to-transparent
        transition-opacity duration-300 ${showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'}
      `}>
        <button onClick={() => setlistId ? navigate(`/setlists/${setlistId}`) : navigate(-1)} className="text-ink-muted hover:text-ink p-1 shrink-0">
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
          <div className="relative shrink-0">
            <button
              onClick={() => setShowKeyDropdown(v => !v)}
              className="text-xs font-mono text-chord bg-chord/10 hover:bg-chord/20 px-2 py-1 rounded transition-colors"
              title="Click to change key"
            >
              𝄞 {transpose !== 0 ? `${song.transcription.key} → ${transposedKey}` : song.transcription.key}
            </button>
            {showKeyDropdown && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setShowKeyDropdown(false)} />
                <div className="absolute left-0 top-full mt-1 z-20 bg-surface-2 border border-surface-3 rounded-xl shadow-xl overflow-hidden w-72">
                  {keyDropdownEntries.map(({ delta, key, chords }) => (
                    <button
                      key={delta}
                      onClick={() => { setTranspose(delta); setShowKeyDropdown(false) }}
                      className={`flex items-center gap-3 w-full text-left px-3 py-2 text-xs transition-colors
                        ${delta === transpose
                          ? 'bg-chord/15 text-chord'
                          : 'text-ink hover:bg-surface-3'
                        }`}
                    >
                      <span className="font-mono w-5 text-right text-ink-faint shrink-0">
                        {delta === 0 ? '0' : delta > 0 ? `+${delta}` : delta}
                      </span>
                      <span className={`font-mono font-bold w-8 shrink-0 ${delta === 0 ? 'text-chord' : ''}`}>
                        {key}
                      </span>
                      <span className="flex gap-1 flex-wrap">
                        {chords.map(c => (
                          <span key={c} className="font-mono text-chord/80 bg-surface-0 px-1 rounded text-[11px]">{c}</span>
                        ))}
                      </span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
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

      {/* Tap zones: left half = prev, right half = next.
          Two guards against accidental double-trigger after a swipe:
          1. swipeFired (module-level) — set by handleTouchEnd, survives remounts
          2. lastNavTime cooldown — catches any click that slips past swipeFired */}
      <div className="absolute inset-x-0 bottom-0 top-16 flex pointer-events-none">
        <div className="flex-1 pointer-events-auto" onClick={() => {
          if (swipeFired) { swipeFired = false; return }
          if (navPending) return
          if (Date.now() - lastNavTime < NAV_COOLDOWN_MS) return
          goPrev()
        }} />
        <div className="flex-1 pointer-events-auto" onClick={() => {
          if (swipeFired) { swipeFired = false; return }
          if (navPending) return
          if (Date.now() - lastNavTime < NAV_COOLDOWN_MS) return
          goNext()
        }} />
      </div>

      {/* Swipe navigation hint — shows direction + setlist position without revealing the toolbar */}
      {swipeHint && (
        <div className="absolute bottom-10 left-1/2 -translate-x-1/2 z-40 pointer-events-none">
          <div className="flex items-center gap-2 bg-black/55 backdrop-blur-sm text-white/90 text-sm font-semibold px-5 py-2.5 rounded-full">
            {swipeHint.dir === 'prev' && <ChevronLeft size={18} />}
            {setlistId && songItems.length > 0 && (
              <span className="font-mono tabular-nums">
                {Math.max(1, Math.min(songItems.length, swipeHint.targetPos + 1))}/{songItems.length}
              </span>
            )}
            {swipeHint.dir === 'next' && <ChevronRight size={18} />}
          </div>
        </div>
      )}

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
