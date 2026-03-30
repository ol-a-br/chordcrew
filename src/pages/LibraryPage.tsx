import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useLiveQuery } from 'dexie-react-hooks'
import { Plus, Search, Star, BookOpen, ChevronRight, Music, Tag } from 'lucide-react'
import { db, generateId, markPending } from '@/db'
import { Button } from '@/components/shared/Button'
import { buildSearchText } from '@/utils/chordpro'
import { useAuth } from '@/auth/AuthContext'
import type { Song } from '@/types'

type SortKey = 'title' | 'artist' | 'updatedAt' | 'savedAt' | 'accessedAt'

const SORT_LABELS: Record<SortKey, string> = {
  title:      'Title',
  artist:     'Artist',
  updatedAt:  'Last edited',
  savedAt:    'Date created',
  accessedAt: 'Recently opened',
}

const EMPTY_CHORDPRO = `{title:New Song}
{subtitle:Artist Name}
{key:G}
{tempo:120}
{time:4/4}

[Verse 1]
[G]Your lyrics [C]here
[G]Second line [D]here

[Chorus]
[G]Chorus [C]lyrics [D]go [G]here
`

export default function LibraryPage() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [activeBookId, setActiveBookId] = useState<string | 'all' | 'favorites'>('all')
  const [activeTag, setActiveTag] = useState<string | null>(null)
  const [sortBy, setSortBy] = useState<SortKey>('title')

  const books   = useLiveQuery(() => db.books.toArray(), [])
  const allSongs = useLiveQuery(() => db.songs.toArray(), [])

  // Unique tags across all songs (case-insensitive, sorted)
  const allTags = useMemo(() => {
    const tagSet = new Set<string>()
    allSongs?.forEach(s => s.tags.forEach(t => tagSet.add(t.toLowerCase().trim())))
    return [...tagSet].sort()
  }, [allSongs])

  const filteredSongs = useMemo(() => {
    if (!allSongs) return []
    let songs = allSongs
    if (activeBookId === 'favorites') songs = songs.filter(s => s.isFavorite)
    else if (activeBookId !== 'all') songs = songs.filter(s => s.bookId === activeBookId)
    if (activeTag) songs = songs.filter(s => s.tags.some(t => t.toLowerCase() === activeTag))
    if (query.trim()) {
      const q = query.toLowerCase()
      songs = songs.filter(s => s.searchText.includes(q))
    }
    return songs
  }, [allSongs, activeBookId, activeTag, query])

  const sortedSongs = useMemo(() => {
    const s = [...filteredSongs]
    switch (sortBy) {
      case 'artist':     return s.sort((a, b) => (a.artist || '').localeCompare(b.artist || ''))
      case 'updatedAt':  return s.sort((a, b) => b.updatedAt - a.updatedAt)
      case 'savedAt':    return s.sort((a, b) => b.savedAt - a.savedAt)
      case 'accessedAt': return s.sort((a, b) => ((b.accessedAt ?? 0) - (a.accessedAt ?? 0)))
      default:           return s.sort((a, b) => a.title.localeCompare(b.title))
    }
  }, [filteredSongs, sortBy])

  const createSong = async () => {
    if (!user) return
    const bookId = activeBookId === 'all' || activeBookId === 'favorites'
      ? (books?.[0]?.id ?? await ensureDefaultBook(user.id, user.displayName))
      : activeBookId

    const id = generateId()
    await db.songs.add({
      id,
      bookId,
      title: 'New Song',
      artist: '',
      tags: [],
      searchText: buildSearchText('New Song', '', [], EMPTY_CHORDPRO),
      isFavorite: false,
      savedAt: Date.now(),
      updatedAt: Date.now(),
      transcription: {
        content: EMPTY_CHORDPRO,
        key: 'G', capo: 0, tempo: 120,
        timeSignature: '4/4', duration: 0,
        chordNotation: 'standard',
        instrument: 'guitar', tuning: 'standard',
        format: 'chordpro',
      },
    })
    await markPending('song', id)
    navigate(`/editor/${id}`)
  }

  const handleNavClick = (bookId: typeof activeBookId) => {
    setActiveBookId(bookId)
    setActiveTag(null)
  }

  const handleTagClick = (tag: string) => {
    setActiveTag(activeTag === tag ? null : tag)
    setActiveBookId('all')
  }

  return (
    <div className="flex h-full">
      {/* Left panel — navigation */}
      <aside className="hidden md:flex flex-col w-52 border-r border-surface-3 bg-surface-1 py-3 px-2 gap-0.5 shrink-0 overflow-y-auto">
        <NavItem label={t('library.allSongs')} icon={<Music size={15} />} active={activeBookId === 'all' && !activeTag} onClick={() => handleNavClick('all')} count={allSongs?.length} />
        <NavItem label={t('library.favorites')} icon={<Star size={15} />} active={activeBookId === 'favorites'} onClick={() => handleNavClick('favorites')} count={allSongs?.filter(s => s.isFavorite).length} />

        {books && books.length > 0 && (
          <>
            <div className="px-2 pt-3 pb-1 text-[11px] text-ink-faint uppercase tracking-wider">{t('library.books')}</div>
            {books.map(book => (
              <NavItem key={book.id} label={book.title} icon={<BookOpen size={15} />} active={activeBookId === book.id} onClick={() => handleNavClick(book.id)} count={allSongs?.filter(s => s.bookId === book.id).length} />
            ))}
          </>
        )}

        {allTags.length > 0 && (
          <>
            <div className="px-2 pt-3 pb-1 text-[11px] text-ink-faint uppercase tracking-wider">Tags</div>
            {allTags.map(tag => (
              <NavItem key={tag} label={tag} icon={<Tag size={14} />} active={activeTag === tag} onClick={() => handleTagClick(tag)} count={allSongs?.filter(s => s.tags.some(t => t.toLowerCase() === tag)).length} />
            ))}
          </>
        )}
      </aside>

      {/* Right panel — song list */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-surface-3 flex-wrap">
          <div className="relative flex-1 min-w-[120px]">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint" />
            <input
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder={t('library.searchPlaceholder')}
              className="w-full bg-surface-2 rounded-lg pl-9 pr-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:outline-none focus:ring-1 focus:ring-chord/50"
            />
          </div>

          {/* Sort selector */}
          <select
            value={sortBy}
            onChange={e => setSortBy(e.target.value as SortKey)}
            className="bg-surface-2 text-xs text-ink-muted rounded-lg px-2 py-2 border border-surface-3 focus:outline-none focus:ring-1 focus:ring-chord/50 cursor-pointer"
          >
            {(Object.keys(SORT_LABELS) as SortKey[]).map(k => (
              <option key={k} value={k}>{SORT_LABELS[k]}</option>
            ))}
          </select>

          <Button variant="primary" size="sm" onClick={createSong}>
            <Plus size={15} />
            {t('library.newSong')}
          </Button>
        </div>

        {/* Active tag indicator */}
        {activeTag && (
          <div className="flex items-center gap-2 px-4 py-1.5 bg-chord/5 border-b border-chord/20">
            <Tag size={12} className="text-chord" />
            <span className="text-xs text-chord">{activeTag}</span>
            <button onClick={() => setActiveTag(null)} className="text-xs text-ink-muted hover:text-ink ml-1">✕</button>
          </div>
        )}

        {/* Song list */}
        <div className="flex-1 overflow-y-auto">
          {sortedSongs.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-ink-muted text-sm space-y-1">
              <Music size={32} className="text-ink-faint mb-2" />
              <p>{t('library.noSongs')}</p>
              <p className="text-xs text-ink-faint">{t('library.noSongsHint')}</p>
            </div>
          ) : (
            <ul>
              {sortedSongs.map(song => (
                <SongRow key={song.id} song={song} navigate={navigate} />
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}

function SongRow({ song, navigate }: { song: Song; navigate: (path: string) => void }) {
  return (
    <li
      className="flex items-center gap-3 px-4 py-3 border-b border-surface-3/50 hover:bg-surface-2 cursor-pointer group"
      onClick={() => navigate(`/view/${song.id}`)}
    >
      <div className="flex-1 min-w-0">
        <div className="font-medium text-sm truncate">{song.title}</div>
        <div className="text-xs text-ink-muted truncate">{song.artist || '—'}</div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {song.transcription.key && (
          <span className="text-xs bg-chord/10 text-chord px-2 py-0.5 rounded font-mono">
            {song.transcription.key}
          </span>
        )}
        {song.tags.length > 0 && (
          <span className="text-xs text-ink-faint truncate max-w-[80px]">
            {song.tags[0]}
          </span>
        )}
        {song.isFavorite && <Star size={13} className="text-chord fill-chord" />}
        <button
          className="text-ink-faint hover:text-ink opacity-0 group-hover:opacity-100 p-1"
          onClick={e => { e.stopPropagation(); navigate(`/editor/${song.id}`) }}
          title="Edit"
        >
          <ChevronRight size={16} />
        </button>
      </div>
    </li>
  )
}

function NavItem({ label, icon, active, onClick, count }: {
  label: string; icon: React.ReactNode; active: boolean
  onClick: () => void; count?: number
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-2 py-2 rounded-lg text-sm w-full text-left transition-colors
        ${active ? 'bg-chord/10 text-chord' : 'text-ink-muted hover:bg-surface-2 hover:text-ink'}`}
    >
      {icon}
      <span className="flex-1 truncate">{label}</span>
      {count !== undefined && (
        <span className="text-xs text-ink-faint">{count}</span>
      )}
    </button>
  )
}

async function ensureDefaultBook(ownerId: string, displayName: string): Promise<string> {
  const existing = await db.books.limit(1).toArray()
  if (existing[0]) return existing[0].id
  const id = generateId()
  await db.books.add({
    id, title: `${displayName}'s Songs`,
    author: displayName, ownerId,
    readOnly: false, shareable: true,
    createdAt: Date.now(), updatedAt: Date.now(),
  })
  return id
}
