import { useState, useMemo, useEffect, useRef } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { Pencil, ChevronUp, ChevronDown, AlignLeft, Star, Maximize2, ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Printer, Share2, ExternalLink, Hash, Link2, StickyNote } from 'lucide-react'
import { encodeSongShare, buildShareUrl, copyShareUrl } from '@/utils/share'
import { db, generateId, markPending, getTeamRole } from '@/db'
import { SongRenderer } from '@/components/viewer/SongRenderer'
import { Button } from '@/components/shared/Button'
import { transposeKey, getFirstChords, buildSearchText, extractMeta, lintChordPro, isValidKey } from '@/utils/chordpro'
import { useFontScale } from '@/hooks/useFontScale'
import { useAuth } from '@/auth/AuthContext'
import { NotesPanel } from '@/components/shared/NotesPanel'
import type { SetlistItem, Book } from '@/types'

function getDefaultColumns(): number {
  if (typeof window === 'undefined') return 2
  return window.matchMedia('(orientation: landscape)').matches ? 4 : 2
}

export default function ViewerPage() {
  const { id } = useParams<{ id: string }>()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const song = useLiveQuery(() => id ? db.songs.get(id) : undefined, [id])

  const setlistId = searchParams.get('setlistId')
  const currentPos = parseInt(searchParams.get('pos') ?? '0', 10)

  const [transpose, setTranspose] = useState(0)
  const [columns, setColumns] = useState(getDefaultColumns)
  const [lyricsOnly, setLyricsOnly] = useState(false)
  const [fontScale, setFontScale] = useFontScale()
  const [showShareMenu, setShowShareMenu] = useState(false)
  const [showKeyDropdown, setShowKeyDropdown] = useState(false)
  const [showNotes, setShowNotes] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const touchStartRef = useRef<{ x: number; y: number } | null>(null)

  // Teams — for copy/move to team space
  const teams = useLiveQuery(() => db.teams.toArray(), [])
  const contributorTeams = useMemo(() => {
    if (!teams || !user) return []
    return teams.filter(t => {
      const role = getTeamRole(t, user.id, user.email)
      return role === 'owner' || role === 'contributor'
    })
  }, [teams, user])

  // Book for team ID (needed by notes panel)
  const book = useLiveQuery(() => song?.bookId ? db.books.get(song.bookId) : undefined, [song?.bookId])
  const teamId = book?.sharedTeamId

  // Setlist context for prev/next navigation
  // Track last-accessed time for "recently accessed" sort in library
  useEffect(() => {
    if (id) db.songs.update(id, { accessedAt: Date.now() })
  }, [id])

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

  // Apply per-slot overrides once when the setlist item changes
  const appliedItemRef = useRef<string | null>(null)
  useEffect(() => {
    if (!currentSetlistItem || currentSetlistItem.id === appliedItemRef.current) return
    appliedItemRef.current = currentSetlistItem.id
    setTranspose(currentSetlistItem.transposeOffset ?? 0)
    if (currentSetlistItem.columnCount) setColumns(currentSetlistItem.columnCount)
  }, [currentSetlistItem])

  // Show a brief boundary toast (2 s auto-dismiss)
  const showToast = (msg: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current)
    setToast(msg)
    toastTimer.current = setTimeout(() => setToast(null), 2000)
  }

  const handleShareReadOnly = async () => {
    if (!song) return
    const encoded = await encodeSongShare({
      title: song.title,
      artist: song.artist,
      key: song.transcription.key,
      content: song.transcription.content,
    })
    const url = buildShareUrl(encoded)
    const ok = await copyShareUrl(url)
    showToast(ok ? 'Read-only link copied!' : 'Could not copy link')
  }

  // Setlist navigation helpers (used by buttons AND keyboard)
  const goPrev = () => {
    if (!setlistId) return
    if (prevSongId) navigate(`/view/${prevSongId}?setlistId=${setlistId}&pos=${currentPos - 1}`)
    else showToast('Beginning of setlist')
  }
  const goNext = () => {
    if (!setlistId) return
    if (nextSongId) navigate(`/view/${nextSongId}?setlistId=${setlistId}&pos=${currentPos + 1}`)
    else showToast('End of setlist')
  }

  // Column stride: width of one CSS column (container / columns)
  const getColumnStride = () => {
    const el = scrollRef.current
    if (!el || columns <= 1) return 0
    return el.clientWidth / columns
  }

  // Arrow key column navigation (viewer mode — no long-press, no setlist skip)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // Ignore when typing in an input
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      const el = scrollRef.current
      if (!el) return
      if (e.key === 'ArrowRight') {
        e.preventDefault()
        if (columns > 1) {
          const stride = getColumnStride()
          const newLeft = el.scrollLeft + stride
          // At the last column of content → go to next song if in setlist
          if (newLeft + el.clientWidth >= el.scrollWidth - 10) {
            goNext()
          } else {
            el.scrollTo({ left: newLeft, behavior: 'smooth' })
          }
        } else {
          goNext()
        }
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault()
        if (columns > 1) {
          const stride = getColumnStride()
          if (el.scrollLeft < 10) {
            goPrev()
          } else {
            el.scrollTo({ left: Math.max(0, el.scrollLeft - stride), behavior: 'smooth' })
          }
        } else {
          goPrev()
        }
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [columns, setlistId, prevSongId, nextSongId, currentPos])

  // Effective key: content directive takes priority over stored field; validate both
  const effectiveKey = useMemo(() => {
    if (!song) return ''
    const fromContent = extractMeta(song.transcription.content).key ?? ''
    const candidate = fromContent || song.transcription.key || ''
    return isValidKey(candidate) ? candidate : ''
  }, [song])

  // Transposed key and first-3-chords for musician preview
  const transposedKey = useMemo(
    () => transposeKey(effectiveKey, transpose),
    [effectiveKey, transpose]
  )
  const firstChords = useMemo(
    () => transpose !== 0 ? getFirstChords(song?.transcription.content ?? '', transpose) : [],
    [song?.transcription.content, transpose]
  )
  const keyDropdownEntries = useMemo(() => {
    if (!effectiveKey || !song) return []
    const originalKey = effectiveKey
    const content = song.transcription.content
    return Array.from({ length: 12 }, (_, i) => {
      const delta = i - 5
      const key   = transposeKey(originalKey, delta)
      const chords = getFirstChords(content, delta, 4)
      return { delta, key, chords }
    })
  }, [effectiveKey, song?.transcription.content])
  // Capo helper: sounding key = written key transposed up by capo value
  const capo = song?.transcription.capo ?? 0
  const soundingKey = useMemo(
    () => (capo > 0 && effectiveKey) ? transposeKey(effectiveKey, capo) : '',
    [capo, effectiveKey]
  )

  const applyTranspose = (next: number) => {
    setTranspose(next)
    if (currentSetlistItem && setlistId) {
      db.setlistItems.update(currentSetlistItem.id, { transposeOffset: next })
      db.setlists.update(setlistId, { updatedAt: Date.now() })
      markPending('setlist', setlistId)
    }
  }

  // Extra metadata (CCLI, copyright, URL) extracted from ChordPro content
  const derivedMeta = useMemo(
    () => extractMeta(song?.transcription.content ?? ''),
    [song?.transcription.content]
  )
  const lintErrors = useMemo(
    () => lintChordPro(song?.transcription.content ?? ''),
    [song?.transcription.content]
  )

  const toggleFavorite = async () => {
    if (!song) return
    await db.songs.update(song.id, { isFavorite: !song.isFavorite })
  }

  /** Ensure a team book exists in Dexie; return its id. */
  const ensureTeamBook = async (teamId: string, teamName: string): Promise<string> => {
    const existing = await db.books.where('sharedTeamId').equals(teamId).first()
    if (existing) return existing.id
    const bookId = generateId()
    const book: Book = {
      id: bookId, title: `${teamName} Songs`,
      author: user?.displayName ?? 'Team',
      ownerId: user?.id ?? '',
      sharedTeamId: teamId,
      readOnly: false, shareable: true,
      createdAt: Date.now(), updatedAt: Date.now(),
    }
    await db.books.add(book)
    await markPending('book', bookId)
    return bookId
  }

  const copyToTeam = async (teamId: string, teamName: string) => {
    if (!song) return
    const bookId = await ensureTeamBook(teamId, teamName)
    const newId = generateId()
    const now = Date.now()
    await db.songs.add({
      ...song,
      id: newId,
      bookId,
      savedAt: now,
      updatedAt: now,
      accessedAt: undefined,
      searchText: buildSearchText(song.title, song.artist, song.tags, song.transcription.content),
    })
    await markPending('song', newId)
    setShowShareMenu(false)
    navigate(`/view/${newId}`)
  }

  const moveToTeam = async (teamId: string, teamName: string) => {
    if (!song) return
    const bookId = await ensureTeamBook(teamId, teamName)
    await db.songs.update(song.id, { bookId, updatedAt: Date.now() })
    await markPending('song', song.id)
    setShowShareMenu(false)
  }

  // Horizontal swipe in single-column setlist mode → prev/next song
  const onTouchStart = (e: React.TouchEvent) => {
    touchStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
  }
  const onTouchEnd = (e: React.TouchEvent) => {
    if (!touchStartRef.current || !setlistId || columns > 1) return
    const dx = e.changedTouches[0].clientX - touchStartRef.current.x
    const dy = e.changedTouches[0].clientY - touchStartRef.current.y
    touchStartRef.current = null
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      if (dx < 0) goNext()
      else goPrev()
    }
  }

  if (!song) return (
    <div className="flex-1 flex items-center justify-center">
      <div className="w-7 h-7 border-2 border-chord border-t-transparent rounded-full animate-spin" />
    </div>
  )

  return (
    <div className="flex flex-col h-full" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-surface-3 bg-surface-1 shrink-0 flex-wrap">

        {/* Edit — leftmost for consistency with performance mode */}
        <Button variant="ghost" size="sm" onClick={() => navigate(`/editor/${song.id}`)}>
          <Pencil size={14} />
        </Button>

        {/* Setlist prev nav */}
        {setlistId && (
          <button
            onClick={goPrev}
            className="p-1.5 rounded text-ink-muted hover:text-ink"
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
              onClick={goNext}
              className="p-1.5 rounded text-ink-muted hover:text-ink"
              title="Next song"
            >
              <ChevronRight size={16} />
            </button>
          </>
        )}

        {/* Key badge — click to open 12-key transpose picker */}
        {effectiveKey && (
          <div className="relative shrink-0">
            <button
              onClick={() => setShowKeyDropdown(v => !v)}
              className="text-xs font-mono text-chord bg-chord/10 hover:bg-chord/20 px-2 py-1 rounded transition-colors"
              title="Click to change key"
            >
              𝄞 {transpose !== 0 ? `${effectiveKey} → ${transposedKey}` : effectiveKey}
            </button>
            {showKeyDropdown && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setShowKeyDropdown(false)} />
                <div className="absolute left-0 top-full mt-1 z-20 bg-surface-2 border border-surface-3 rounded-xl shadow-xl overflow-hidden w-72">
                  {keyDropdownEntries.map(({ delta, key, chords }) => (
                    <button
                      key={delta}
                      onClick={() => { applyTranspose(delta); setShowKeyDropdown(false) }}
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

        {capo > 0 && (
          <span className="text-xs font-mono text-ink-muted shrink-0" title="Capo helper">
            Capo {capo}{soundingKey ? ` → ${soundingKey}` : ''}
          </span>
        )}

        {/* Transpose */}
        <div className="flex flex-col items-center gap-0.5">
          <div className="flex items-center gap-1">
            <button onClick={() => applyTranspose(transpose - 1)} aria-label="Transpose down" className="p-1.5 hover:bg-surface-2 rounded text-ink-muted hover:text-ink">
              <ChevronDown size={16} />
            </button>
            <span className="text-xs font-mono w-8 text-center">
              {transpose > 0 ? `+${transpose}` : transpose === 0 ? '0' : transpose}
            </span>
            <button onClick={() => applyTranspose(transpose + 1)} aria-label="Transpose up" className="p-1.5 hover:bg-surface-2 rounded text-ink-muted hover:text-ink">
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
        <div className="flex items-center gap-0.5">
          <button onClick={() => setFontScale(s => Math.max(0.7, s - 0.1))} className="p-1.5 text-ink-muted hover:text-ink">
            <ZoomOut size={16} />
          </button>
          <button onClick={() => setFontScale(s => Math.min(2.5, s + 0.1))} className="p-1.5 text-ink-muted hover:text-ink">
            <ZoomIn size={16} />
          </button>
        </div>

        {/* Favorite */}
        <button onClick={toggleFavorite} className="p-1.5 hover:bg-surface-2 rounded">
          <Star size={16} className={song.isFavorite ? 'text-chord fill-chord' : 'text-ink-muted'} />
        </button>

        {/* Notes toggle */}
        {user && (
          <button
            onClick={() => setShowNotes(v => !v)}
            className={`p-1.5 rounded ${showNotes ? 'text-chord bg-chord/10' : 'text-ink-muted hover:bg-surface-2 hover:text-ink'}`}
            title="My notes"
          >
            <StickyNote size={16} />
          </button>
        )}

        {/* External URL link */}
        {derivedMeta.url && (
          <a
            href={derivedMeta.url}
            target="_blank"
            rel="noopener noreferrer"
            className="p-1.5 text-ink-muted hover:text-ink rounded shrink-0"
            title="Open link"
          >
            <ExternalLink size={16} />
          </a>
        )}

        {/* CCLI SongSelect link */}
        {derivedMeta.ccli && (
          <a
            href={`https://songselect.ccli.com/songs/${derivedMeta.ccli}`}
            target="_blank"
            rel="noopener noreferrer"
            className="p-1.5 text-ink-muted hover:text-ink rounded shrink-0"
            title={`CCLI #${derivedMeta.ccli} — open in SongSelect`}
          >
            <Hash size={16} />
          </a>
        )}

        {/* Share read-only link */}
        <button
          onClick={handleShareReadOnly}
          className="p-1.5 text-ink-muted hover:text-ink rounded"
          title="Copy read-only share link"
        >
          <Link2 size={16} />
        </button>

        {/* Print / PDF */}
        <button
          onClick={() => window.open(`/print/song/${song.id}?transpose=${transpose}&columns=${columns}`, '_blank')}
          className="p-1.5 text-ink-muted hover:text-ink rounded"
          title="Print / Save as PDF"
        >
          <Printer size={16} />
        </button>

        {/* Copy/Move to team */}
        {contributorTeams.length > 0 && (
          <div className="relative">
            <button
              onClick={() => setShowShareMenu(v => !v)}
              className="p-1.5 text-ink-muted hover:text-ink rounded"
              title="Copy / Move to team"
            >
              <Share2 size={16} />
            </button>
            {showShareMenu && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setShowShareMenu(false)} />
                <div className="absolute right-0 top-full mt-1 z-20 bg-surface-2 border border-surface-3 rounded-xl shadow-xl py-1 min-w-[160px]">
                  {contributorTeams.map(team => (
                    <div key={team.id} className="px-2 py-1">
                      <div className="text-xs text-ink-faint px-1 py-0.5 font-medium">{team.name}</div>
                      <button
                        onClick={() => copyToTeam(team.id, team.name)}
                        className="block w-full text-left px-2 py-1 text-xs text-ink hover:bg-surface-3 rounded"
                      >
                        Copy here
                      </button>
                      <button
                        onClick={() => moveToTeam(team.id, team.name)}
                        className="block w-full text-left px-2 py-1 text-xs text-ink hover:bg-surface-3 rounded"
                      >
                        Move here
                      </button>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* Present mode */}
        <Button variant="primary" size="sm" onClick={() => navigate(`/perform/${song.id}${setlistId ? `?setlistId=${setlistId}&pos=${currentPos}` : ''}`)}>
          <Maximize2 size={14} />
          Present
        </Button>
      </div>

      {/* Notes panel */}
      {showNotes && user && (
        <div className="shrink-0 px-4 pt-2 pb-1">
          <NotesPanel
            songId={song.id}
            userId={user.id}
            teamId={teamId}
            onClose={() => setShowNotes(false)}
          />
        </div>
      )}

      {/* Song content — multi-column: wrap to columns (no vertical scroll);
          single-column: normal vertical scroll */}
      <div className="flex-1 min-h-0 relative">
        {columns > 1 ? (
          <div ref={scrollRef} className="h-full overflow-x-auto overflow-y-hidden hide-scrollbar">
            <div className="h-full px-6 py-5">
              <SongRenderer
                content={song.transcription.content}
                transposeOffset={transpose}
                columns={columns}
                lyricsOnly={lyricsOnly}
                fontScale={fontScale}
                pageFlip
                errors={lintErrors}
                songKey={transposedKey}
                tempo={song.transcription.tempo}
              />
            </div>
          </div>
        ) : (
          <div ref={scrollRef} className="h-full overflow-y-auto overflow-x-hidden px-6 py-5">
            <SongRenderer
              content={song.transcription.content}
              transposeOffset={transpose}
              columns={1}
              lyricsOnly={lyricsOnly}
              fontScale={fontScale}
              errors={lintErrors}
              onJumpToLine={() => navigate(`/editor/${id}`)}
              songKey={transposedKey}
              tempo={song.transcription.tempo}
            />
          </div>
        )}

        {/* Setlist boundary toast */}
        {toast && (
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 pointer-events-none">
            <div className="bg-surface-2 border border-surface-3 text-ink-muted text-xs px-4 py-2 rounded-full shadow-lg animate-fade-in">
              {toast}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
