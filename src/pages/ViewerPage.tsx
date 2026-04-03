import { useState, useMemo, useEffect, useRef } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { Pencil, ChevronUp, ChevronDown, AlignLeft, Star, Maximize2, ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Printer, Share2 } from 'lucide-react'
import { db, generateId, markPending, getTeamRole } from '@/db'
import { SongRenderer } from '@/components/viewer/SongRenderer'
import { Button } from '@/components/shared/Button'
import { transposeKey, getFirstChords, buildSearchText } from '@/utils/chordpro'
import { useFontScale } from '@/hooks/useFontScale'
import { useAuth } from '@/auth/AuthContext'
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

  // Teams — for copy/move to team space
  const teams = useLiveQuery(() => db.teams.toArray(), [])
  const contributorTeams = useMemo(() => {
    if (!teams || !user) return []
    return teams.filter(t => {
      const role = getTeamRole(t, user.id, user.email)
      return role === 'owner' || role === 'contributor'
    })
  }, [teams, user])

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

  // Transposed key and first-3-chords for musician preview
  const transposedKey = useMemo(
    () => transposeKey(song?.transcription.key ?? '', transpose),
    [song?.transcription.key, transpose]
  )
  const firstChords = useMemo(
    () => transpose !== 0 ? getFirstChords(song?.transcription.content ?? '', transpose) : [],
    [song?.transcription.content, transpose]
  )
  // Capo helper: sounding key = written key transposed up by capo value
  const capo = song?.transcription.capo ?? 0
  const soundingKey = useMemo(
    () => (capo > 0 && song?.transcription.key) ? transposeKey(song.transcription.key, capo) : '',
    [capo, song?.transcription.key]
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
        {capo > 0 && (
          <span className="text-xs font-mono text-ink-muted shrink-0" title="Capo helper">
            Capo {capo}{soundingKey ? ` → ${soundingKey}` : ''}
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

        {/* Edit */}
        <Button variant="ghost" size="sm" onClick={() => navigate(`/editor/${song.id}`)}>
          <Pencil size={14} />
        </Button>
      </div>

      {/* Song content — multi-column: wrap to columns (no vertical scroll);
          single-column: normal vertical scroll */}
      {columns > 1 ? (
        <div className="flex-1 min-h-0 overflow-x-auto overflow-y-hidden hide-scrollbar">
          <div className="h-full px-6 py-5">
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
        <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-6 py-5">
          <SongRenderer
            content={song.transcription.content}
            transposeOffset={transpose}
            columns={1}
            lyricsOnly={lyricsOnly}
            fontScale={fontScale}
          />
        </div>
      )}
    </div>
  )
}
