import { useState, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  Plus, Search, Star, BookOpen, ChevronRight, Music, Tag, Users,
  CheckSquare, Square, Trash2, FolderInput, Pencil, Check, X, Upload,
} from 'lucide-react'
import { db, generateId, markPending, markDeleted, getTeamRole } from '@/db'
import { deleteSongFromCloud } from '@/sync/firestoreSync'
import { Button } from '@/components/shared/Button'
import { buildSearchText } from '@/utils/chordpro'
import { useAuth } from '@/auth/AuthContext'
import { useChurchTools } from '@/churchtools/ChurchToolsContext'
import { SongUploadDialog } from '@/components/churchtools/SongUploadDialog'
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
  const [activeTeamId, setActiveTeamId] = useState<string | null>(null)
  const [activeTag, setActiveTag] = useState<string | null>(null)
  const [activeKey, setActiveKey] = useState<string | null>(null)
  const [sortBy, setSortBy] = useState<SortKey>('title')
  const [newBookName, setNewBookName] = useState('')
  const [showNewBook, setShowNewBook] = useState(false)
  const newBookInputRef = useRef<HTMLInputElement>(null)

  // Book rename/delete state
  const [renamingBookId, setRenamingBookId] = useState<string | null>(null)
  const [renameBookName, setRenameBookName] = useState('')
  const renameInputRef = useRef<HTMLInputElement>(null)

  // Bulk tag state
  const [showTagMenu, setShowTagMenu] = useState(false)
  const [bulkTagInput, setBulkTagInput] = useState('')
  const tagMenuRef = useRef<HTMLDivElement>(null)

  const { isConfigured: ctConfigured } = useChurchTools()
  const [showCtUpload, setShowCtUpload] = useState(false)
  const [ctUploadSongs, setCtUploadSongs] = useState<Song[]>([])

  // Bulk selection state
  const [selectMode, setSelectMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [showOrganizeMenu, setShowOrganizeMenu] = useState(false)
  const [bulkToast, setBulkToast] = useState<string | null>(null)
  const bulkToastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const books    = useLiveQuery(() => db.books.toArray(), [])
  const allSongs = useLiveQuery(() => db.songs.toArray(), [])
  const teams    = useLiveQuery(() => db.teams.toArray(), [])

  // Personal books only (no team books in the "Books" sidebar section)
  const personalBooks = useMemo(() => (books ?? []).filter(b => !b.sharedTeamId), [books])

  // Teams the current user belongs to
  const myTeams = useMemo(() => {
    if (!teams || !user) return []
    return teams.filter(t =>
      t.ownerId === user.id ||
      t.members.some(m => m.userId === user.id || m.email === user.email)
    )
  }, [teams, user])

  // Teams where user can contribute (for share targets)
  const contributorTeams = useMemo(() => {
    if (!teams || !user) return []
    return teams.filter(t => {
      const role = getTeamRole(t, user.id, user.email)
      return role === 'owner' || role === 'contributor'
    })
  }, [teams, user])

  // Map bookId → teamId for role/filter lookups
  const bookTeamMap = useMemo(() => {
    const map: Record<string, string> = {}
    ;(books ?? []).forEach(b => { if (b.sharedTeamId) map[b.id] = b.sharedTeamId })
    return map
  }, [books])

  // Role for the active context (team or personal)
  const activeTeamRole = useMemo(() => {
    if (!activeTeamId || !user || !teams) return null
    const team = teams.find(t => t.id === activeTeamId)
    if (!team) return null
    return getTeamRole(team, user.id, user.email)
  }, [activeTeamId, user, teams])

  const isActiveReadOnly = useMemo(() => {
    if (activeTeamId) return activeTeamRole === 'reader'
    if (activeBookId === 'all' || activeBookId === 'favorites') return false
    const book = (books ?? []).find(b => b.id === activeBookId)
    return book?.readOnly ?? false
  }, [activeTeamId, activeTeamRole, activeBookId, books])

  // Unique tags across all songs (case-insensitive, sorted)
  const allTags = useMemo(() => {
    const tagSet = new Set<string>()
    allSongs?.forEach(s => s.tags.forEach(t => tagSet.add(t.toLowerCase().trim())))
    return [...tagSet].sort()
  }, [allSongs])

  // Unique keys across all songs, sorted
  const allKeys = useMemo(() => {
    const keySet = new Set<string>()
    allSongs?.forEach(s => { if (s.transcription.key) keySet.add(s.transcription.key) })
    return [...keySet].sort((a, b) => a.localeCompare(b))
  }, [allSongs])

  const filteredSongs = useMemo(() => {
    if (!allSongs) return []
    let songs = allSongs
    if (activeTeamId) {
      songs = songs.filter(s => bookTeamMap[s.bookId] === activeTeamId)
    } else if (activeBookId === 'favorites') {
      songs = songs.filter(s => s.isFavorite)
    } else if (activeBookId !== 'all') {
      songs = songs.filter(s => s.bookId === activeBookId)
    } else {
      songs = songs.filter(s => !bookTeamMap[s.bookId])
    }
    if (activeTag) songs = songs.filter(s => s.tags.some(t => t.toLowerCase() === activeTag))
    if (activeKey) songs = songs.filter(s => s.transcription.key === activeKey)
    if (query.trim()) {
      const q = query.toLowerCase()
      songs = songs.filter(s => s.searchText.includes(q))
    }
    return songs
  }, [allSongs, activeBookId, activeTeamId, activeTag, activeKey, query, bookTeamMap])

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

  // Organize dropdown targets: personal books + contributor teams, minus current context
  const organizeTargets = useMemo(() => {
    const targets: Array<{ type: 'book' | 'team'; id: string; label: string }> = []
    // Personal books (excluding current book if in a specific book)
    personalBooks.forEach(b => {
      if (activeTeamId || activeBookId !== b.id) {
        targets.push({ type: 'book', id: b.id, label: b.title })
      }
    })
    // Contributor teams (excluding current team)
    contributorTeams.forEach(t => {
      if (t.id !== activeTeamId) {
        targets.push({ type: 'team', id: t.id, label: t.name })
      }
    })
    return targets
  }, [personalBooks, contributorTeams, activeTeamId, activeBookId])

  const showOrganizeButton = organizeTargets.length > 0 || true // always show (delete is always available)

  const createSong = async () => {
    if (!user) return
    let bookId: string
    if (activeTeamId) {
      const teamBook = (books ?? []).find(b => b.sharedTeamId === activeTeamId)
      if (teamBook) {
        bookId = teamBook.id
      } else {
        const team = myTeams.find(t => t.id === activeTeamId)
        bookId = generateId()
        await db.books.add({
          id: bookId, title: `${team?.name ?? 'Team'} Songs`,
          author: user.displayName, ownerId: user.id,
          sharedTeamId: activeTeamId,
          readOnly: false, shareable: true,
          createdAt: Date.now(), updatedAt: Date.now(),
        })
        await markPending('book', bookId)
      }
    } else {
      bookId = activeBookId === 'all' || activeBookId === 'favorites'
        ? (personalBooks?.[0]?.id ?? await ensureDefaultBook(user.id, user.displayName))
        : activeBookId
    }

    const id = generateId()
    await db.songs.add({
      id, bookId,
      title: 'New Song', artist: '',
      tags: [],
      searchText: buildSearchText('New Song', '', [], EMPTY_CHORDPRO),
      isFavorite: false,
      savedAt: Date.now(), updatedAt: Date.now(),
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

  // ─── Bulk helpers ─────────────────────────────────────────────────────────────

  const showBulkToast = (msg: string) => {
    if (bulkToastTimer.current) clearTimeout(bulkToastTimer.current)
    setBulkToast(msg)
    bulkToastTimer.current = setTimeout(() => setBulkToast(null), 3000)
  }

  const toggleSelectMode = () => {
    setSelectMode(s => !s)
    setSelectedIds(new Set())
    setShowOrganizeMenu(false)
  }

  const toggleSong = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const selectAll = () => setSelectedIds(new Set(sortedSongs.map(s => s.id)))

  const exitSelectMode = () => {
    setSelectMode(false)
    setSelectedIds(new Set())
    setShowOrganizeMenu(false)
  }

  const bulkDelete = async () => {
    const count = selectedIds.size
    if (!confirm(`Delete ${count} song${count !== 1 ? 's' : ''}? This cannot be undone.`)) return
    const songs = sortedSongs.filter(s => selectedIds.has(s.id))
    for (const song of songs) {
      if (user) {
        const teamId = bookTeamMap[song.bookId]
        const paths = [`users/${user.id}/songs/${song.id}`]
        if (teamId) paths.push(`teams/${teamId}/songs/${song.id}`)
        await markDeleted('song', song.id, paths)
        // Best-effort immediate cloud delete; uploadPending retries if this fails
        deleteSongFromCloud(song.id, user.id, teamId).catch(() => {})
      }
      await db.songs.delete(song.id)
    }
    exitSelectMode()
    showBulkToast(`Deleted ${count} song${count !== 1 ? 's' : ''}`)
  }

  const ensureTeamBook = async (teamId: string, teamName: string): Promise<string> => {
    const existing = await db.books.where('sharedTeamId').equals(teamId).first()
    if (existing) return existing.id
    const bookId = generateId()
    await db.books.add({
      id: bookId, title: `${teamName} Songs`,
      author: user?.displayName ?? 'Team',
      ownerId: user?.id ?? '',
      sharedTeamId: teamId,
      readOnly: false, shareable: true,
      createdAt: Date.now(), updatedAt: Date.now(),
    })
    await markPending('book', bookId)
    return bookId
  }

  const bulkCopyTo = async (targetId: string, targetType: 'book' | 'team', targetLabel: string) => {
    const songs = sortedSongs.filter(s => selectedIds.has(s.id))
    setShowOrganizeMenu(false)
    const bookId = targetType === 'team'
      ? await ensureTeamBook(targetId, targetLabel)
      : targetId
    const now = Date.now()
    const newSongs = songs.map(song => ({
      ...song,
      id: generateId(),
      bookId,
      savedAt: now, updatedAt: now,
      accessedAt: undefined as number | undefined,
      searchText: buildSearchText(song.title, song.artist, song.tags, song.transcription.content),
    }))
    await db.songs.bulkAdd(newSongs)
    for (const s of newSongs) await markPending('song', s.id)
    exitSelectMode()
    // Navigate to the target context
    if (targetType === 'team') handleTeamClick(targetId)
    else handleNavClick(targetId)
    showBulkToast(`Copied ${songs.length} song${songs.length !== 1 ? 's' : ''} to ${targetLabel}`)
  }

  const bulkMoveTo = async (targetId: string, targetType: 'book' | 'team', targetLabel: string) => {
    const songs = sortedSongs.filter(s => selectedIds.has(s.id))
    setShowOrganizeMenu(false)
    const bookId = targetType === 'team'
      ? await ensureTeamBook(targetId, targetLabel)
      : targetId
    const now = Date.now()
    for (const song of songs) {
      await db.songs.update(song.id, { bookId, updatedAt: now })
      await markPending('song', song.id)
    }
    exitSelectMode()
    if (targetType === 'team') handleTeamClick(targetId)
    else handleNavClick(targetId)
    showBulkToast(`Moved ${songs.length} song${songs.length !== 1 ? 's' : ''} to ${targetLabel}`)
  }

  // ─── Bulk tag ─────────────────────────────────────────────────────────────────

  const bulkAddTag = async (tag: string) => {
    const normalized = tag.trim().toLowerCase()
    if (!normalized) return
    const songs = sortedSongs.filter(s => selectedIds.has(s.id))
    const now = Date.now()
    for (const song of songs) {
      if (song.tags.includes(normalized)) continue
      const newTags = [...song.tags, normalized]
      await db.songs.update(song.id, {
        tags: newTags,
        searchText: buildSearchText(song.title, song.artist, newTags, song.transcription.content),
        updatedAt: now,
      })
      await markPending('song', song.id)
    }
    setBulkTagInput('')
    setShowTagMenu(false)
    showBulkToast(`Tagged ${songs.length} song${songs.length !== 1 ? 's' : ''} with "${normalized}"`)
  }

  // ─── Create book ──────────────────────────────────────────────────────────────

  const createBook = async () => {
    const name = newBookName.trim()
    if (!name || !user) return
    const id = generateId()
    await db.books.put({
      id,
      title: name,
      description: '',
      author: user.displayName,
      ownerId: user.id,
      readOnly: false,
      shareable: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })
    setNewBookName('')
    setShowNewBook(false)
    handleNavClick(id)
  }

  const openNewBook = () => {
    setShowNewBook(true)
    setTimeout(() => newBookInputRef.current?.focus(), 50)
  }

  const startRenameBook = (book: { id: string; title: string }) => {
    setRenamingBookId(book.id)
    setRenameBookName(book.title)
    setTimeout(() => renameInputRef.current?.focus(), 50)
  }

  const commitRenameBook = async () => {
    const name = renameBookName.trim()
    if (!name || !renamingBookId) { setRenamingBookId(null); return }
    await db.books.update(renamingBookId, { title: name, updatedAt: Date.now() })
    await markPending('book', renamingBookId)
    setRenamingBookId(null)
  }

  const cancelRenameBook = () => {
    setRenamingBookId(null)
    setRenameBookName('')
  }

  const deleteBook = async (bookId: string, bookTitle: string) => {
    const songCount = allSongs?.filter(s => s.bookId === bookId).length ?? 0
    const msg = songCount > 0
      ? `Delete book "${bookTitle}"? Its ${songCount} song${songCount !== 1 ? 's' : ''} will become unassigned.`
      : `Delete book "${bookTitle}"?`
    if (!confirm(msg)) return
    // Reassign songs to no book (we can't leave dangling bookIds)
    if (songCount > 0) {
      const songs = allSongs?.filter(s => s.bookId === bookId) ?? []
      const defaultBookId = personalBooks.find(b => b.id !== bookId)?.id
      for (const song of songs) {
        if (defaultBookId) {
          await db.songs.update(song.id, { bookId: defaultBookId, updatedAt: Date.now() })
          await markPending('song', song.id)
        }
      }
    }
    await db.books.delete(bookId)
    await db.syncStates.delete(`book:${bookId}`)
    if (activeBookId === bookId) handleNavClick('all')
  }

  // ─── Navigation handlers ──────────────────────────────────────────────────────

  const handleNavClick = (bookId: typeof activeBookId) => {
    setActiveBookId(bookId)
    setActiveTeamId(null)
    setActiveTag(null)
    setActiveKey(null)
    if (selectMode) exitSelectMode()
  }

  const handleTeamClick = (teamId: string) => {
    setActiveTeamId(activeTeamId === teamId ? null : teamId)
    setActiveBookId('all')
    setActiveTag(null)
    setActiveKey(null)
    if (selectMode) exitSelectMode()
  }

  const handleTagClick = (tag: string) => {
    setActiveTag(activeTag === tag ? null : tag)
    setActiveBookId('all')
    setActiveTeamId(null)
  }

  const handleKeyClick = (key: string) => {
    setActiveKey(activeKey === key ? null : key)
  }

  return (
    <>
    <div className="flex h-full">
      {/* Left panel */}
      <aside className="hidden md:flex flex-col w-52 border-r border-surface-3 bg-surface-1 py-3 px-2 gap-0.5 shrink-0 overflow-y-auto">
        <NavItem label={t('library.allSongs')} icon={<Music size={15} />} active={activeBookId === 'all' && !activeTag && !activeTeamId} onClick={() => handleNavClick('all')} count={allSongs?.filter(s => !bookTeamMap[s.bookId]).length} />
        <NavItem label={t('library.favorites')} icon={<Star size={15} />} active={activeBookId === 'favorites' && !activeTeamId} onClick={() => handleNavClick('favorites')} count={allSongs?.filter(s => s.isFavorite).length} />

        <>
          <div className="px-2 pt-3 pb-1 flex items-center">
            <span className="text-[11px] text-ink-faint uppercase tracking-wider flex-1">{t('library.books')}</span>
            <button
              onClick={openNewBook}
              title="New book"
              className="text-ink-faint hover:text-ink-muted transition-colors p-0.5"
            >
              <Plus size={13} />
            </button>
          </div>
          {personalBooks.map(book => (
            renamingBookId === book.id ? (
              <div key={book.id} className="flex items-center gap-1 px-2 pb-1">
                <input
                  ref={renameInputRef}
                  value={renameBookName}
                  onChange={e => setRenameBookName(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') commitRenameBook()
                    if (e.key === 'Escape') cancelRenameBook()
                  }}
                  className="flex-1 bg-surface-2 border border-chord/40 rounded-md px-2 py-1 text-xs text-ink focus:outline-none focus:ring-1 focus:ring-chord/60"
                />
                <button onClick={commitRenameBook} className="p-0.5 text-green-400 hover:text-green-300"><Check size={13} /></button>
                <button onClick={cancelRenameBook} className="p-0.5 text-ink-faint hover:text-ink"><X size={13} /></button>
              </div>
            ) : (
              <BookNavItem
                key={book.id}
                book={book}
                active={activeBookId === book.id && !activeTeamId}
                count={allSongs?.filter(s => s.bookId === book.id).length}
                onClick={() => handleNavClick(book.id)}
                onRename={() => startRenameBook(book)}
                onDelete={() => deleteBook(book.id, book.title)}
              />
            )
          ))}
          {showNewBook && (
            <div className="px-2 pb-1">
              <input
                ref={newBookInputRef}
                value={newBookName}
                onChange={e => setNewBookName(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') createBook()
                  if (e.key === 'Escape') { setShowNewBook(false); setNewBookName('') }
                }}
                onBlur={() => { if (!newBookName.trim()) { setShowNewBook(false) } }}
                placeholder="Book name…"
                className="w-full bg-surface-2 border border-chord/40 rounded-md px-2 py-1 text-xs text-ink placeholder:text-ink-faint focus:outline-none focus:ring-1 focus:ring-chord/60"
              />
            </div>
          )}
        </>

        {myTeams.length > 0 && (
          <>
            <div className="px-2 pt-3 pb-1 text-[11px] text-ink-faint uppercase tracking-wider">Teams</div>
            {myTeams.map(team => {
              const teamSongCount = allSongs?.filter(s => bookTeamMap[s.bookId] === team.id).length ?? 0
              return (
                <NavItem key={team.id} label={team.name} icon={<Users size={14} />} active={activeTeamId === team.id} onClick={() => handleTeamClick(team.id)} count={teamSongCount} />
              )
            })}
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

        {allKeys.length > 0 && (
          <>
            <div className="px-2 pt-3 pb-1 text-[11px] text-ink-faint uppercase tracking-wider">Key</div>
            {allKeys.map(key => (
              <NavItem
                key={key}
                label={key}
                icon={<span className="text-xs font-mono text-chord leading-none">𝄞</span>}
                active={activeKey === key}
                onClick={() => handleKeyClick(key)}
                count={allSongs?.filter(s => s.transcription.key === key).length}
              />
            ))}
          </>
        )}
      </aside>

      {/* Right panel — song list */}
      <div className="flex-1 flex flex-col min-w-0">

        {/* Mobile filter strip — visible only on small screens (sidebar is hidden) */}
        {!selectMode && (
          <div className="md:hidden flex gap-1.5 px-3 py-2 border-b border-surface-3 bg-surface-1 overflow-x-auto hide-scrollbar shrink-0">
            <MobileChip
              label={t('library.allSongs')}
              active={activeBookId === 'all' && !activeTag && !activeTeamId && !activeKey}
              onClick={() => { handleNavClick('all'); setActiveKey(null) }}
            />
            <MobileChip
              label={t('library.favorites')}
              active={activeBookId === 'favorites' && !activeTeamId}
              onClick={() => handleNavClick('favorites')}
            />
            {personalBooks.map(book => (
              <MobileChip
                key={book.id}
                label={book.title}
                active={activeBookId === book.id && !activeTeamId}
                onClick={() => handleNavClick(book.id)}
              />
            ))}
            {myTeams.map(team => (
              <MobileChip
                key={team.id}
                label={team.name}
                active={activeTeamId === team.id}
                onClick={() => handleTeamClick(team.id)}
                isTeam
              />
            ))}
            {allTags.map(tag => (
              <MobileChip
                key={tag}
                label={`#${tag}`}
                active={activeTag === tag}
                onClick={() => handleTagClick(tag)}
              />
            ))}
            {allKeys.map(key => (
              <MobileChip
                key={key}
                label={key}
                active={activeKey === key}
                onClick={() => handleKeyClick(key)}
              />
            ))}
          </div>
        )}

        {/* Header */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-surface-3 flex-wrap">
          {selectMode ? (
            <>
              <span className="text-sm font-medium flex-1">
                {selectedIds.size > 0 ? `${selectedIds.size} selected` : 'Tap songs to select'}
              </span>
              {selectedIds.size < sortedSongs.length && (
                <button onClick={selectAll} className="text-xs text-chord hover:text-chord/80 shrink-0">
                  Select all
                </button>
              )}
              {selectedIds.size > 0 && (
                <>
                  {/* Tag */}
                  <div className="relative shrink-0" ref={tagMenuRef}>
                    <button
                      onClick={() => { setShowTagMenu(v => !v); setBulkTagInput('') }}
                      className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs text-ink-muted hover:bg-surface-2 hover:text-ink transition-colors border border-surface-3"
                    >
                      <Tag size={14} />
                      Tag
                    </button>
                    {showTagMenu && (
                      <>
                        <div className="fixed inset-0 z-10" onClick={() => setShowTagMenu(false)} />
                        <div className="absolute left-0 top-full mt-1 z-20 bg-surface-2 border border-surface-3 rounded-xl shadow-xl p-3 min-w-[200px] space-y-2">
                          <div className="text-[11px] text-ink-faint uppercase tracking-wider">Add tag to {selectedIds.size} song{selectedIds.size !== 1 ? 's' : ''}</div>
                          <div className="flex gap-1.5">
                            <input
                              autoFocus
                              value={bulkTagInput}
                              onChange={e => setBulkTagInput(e.target.value)}
                              onKeyDown={e => {
                                if (e.key === 'Enter') bulkAddTag(bulkTagInput)
                                if (e.key === 'Escape') setShowTagMenu(false)
                              }}
                              placeholder="New tag…"
                              className="flex-1 bg-surface-3 rounded px-2 py-1 text-xs text-ink placeholder:text-ink-faint focus:outline-none focus:ring-1 focus:ring-chord/50"
                            />
                            <button
                              onClick={() => bulkAddTag(bulkTagInput)}
                              disabled={!bulkTagInput.trim()}
                              className="px-2 py-1 rounded bg-chord/15 text-chord text-xs disabled:opacity-40 hover:bg-chord/25 transition-colors"
                            >
                              Add
                            </button>
                          </div>
                          {allTags.length > 0 && (
                            <>
                              <div className="text-[11px] text-ink-faint">Existing tags</div>
                              <div className="flex flex-wrap gap-1 max-h-28 overflow-y-auto">
                                {allTags.map(tag => (
                                  <button
                                    key={tag}
                                    onClick={() => bulkAddTag(tag)}
                                    className="px-2 py-0.5 rounded-full bg-surface-3 text-ink-muted text-xs hover:bg-chord/15 hover:text-chord transition-colors"
                                  >
                                    {tag}
                                  </button>
                                ))}
                              </div>
                            </>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                  {/* Delete */}
                  <button
                    onClick={bulkDelete}
                    className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs text-red-400 hover:bg-red-400/10 transition-colors shrink-0"
                    title="Delete selected songs"
                  >
                    <Trash2 size={14} />
                    Delete
                  </button>
                  {/* Organize (copy/move) */}
                  {showOrganizeButton && (
                    <div className="relative shrink-0">
                      <button
                        onClick={() => setShowOrganizeMenu(v => !v)}
                        className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs text-ink-muted hover:bg-surface-2 hover:text-ink transition-colors border border-surface-3"
                      >
                        <FolderInput size={14} />
                        Organize
                      </button>
                      {showOrganizeMenu && (
                        <>
                          <div className="fixed inset-0 z-10" onClick={() => setShowOrganizeMenu(false)} />
                          <div className="absolute right-0 top-full mt-1 z-20 bg-surface-2 border border-surface-3 rounded-xl shadow-xl py-1 min-w-[200px]">
                            {organizeTargets.length > 0 ? (
                              <>
                                <div className="px-3 py-1 text-[11px] text-ink-faint uppercase tracking-wider">Copy to</div>
                                {organizeTargets.map(target => (
                                  <button
                                    key={`copy-${target.id}`}
                                    onClick={() => bulkCopyTo(target.id, target.type, target.label)}
                                    className="flex items-center gap-2 w-full text-left px-3 py-1.5 text-xs text-ink hover:bg-surface-3"
                                  >
                                    {target.type === 'team' ? <Users size={11} className="text-ink-faint" /> : <BookOpen size={11} className="text-ink-faint" />}
                                    {target.label}
                                  </button>
                                ))}
                                <hr className="border-surface-3 my-1" />
                                <div className="px-3 py-1 text-[11px] text-ink-faint uppercase tracking-wider">Move to</div>
                                {organizeTargets.map(target => (
                                  <button
                                    key={`move-${target.id}`}
                                    onClick={() => bulkMoveTo(target.id, target.type, target.label)}
                                    className="flex items-center gap-2 w-full text-left px-3 py-1.5 text-xs text-ink hover:bg-surface-3"
                                  >
                                    {target.type === 'team' ? <Users size={11} className="text-ink-faint" /> : <BookOpen size={11} className="text-ink-faint" />}
                                    {target.label}
                                  </button>
                                ))}
                              </>
                            ) : (
                              <p className="px-3 py-2 text-xs text-ink-faint">No other books or teams available</p>
                            )}
                            {ctConfigured && (
                              <>
                                <hr className="border-surface-3 my-1" />
                                <button
                                  onClick={async () => {
                                    const list = await db.songs.bulkGet([...selectedIds])
                                    setCtUploadSongs(list.filter(Boolean) as Song[])
                                    setShowOrganizeMenu(false)
                                    setShowCtUpload(true)
                                  }}
                                  className="flex items-center gap-2 w-full text-left px-3 py-1.5 text-xs text-chord hover:bg-surface-3"
                                >
                                  <Upload size={11} />
                                  Upload to ChurchTools
                                </button>
                              </>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </>
              )}
              <Button variant="ghost" size="sm" onClick={toggleSelectMode}>Cancel</Button>
            </>
          ) : (
            <>
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

              <select
                value={sortBy}
                onChange={e => setSortBy(e.target.value as SortKey)}
                className="bg-surface-2 text-xs text-ink-muted rounded-lg px-2 py-2 border border-surface-3 focus:outline-none focus:ring-1 focus:ring-chord/50 cursor-pointer"
              >
                {(Object.keys(SORT_LABELS) as SortKey[]).map(k => (
                  <option key={k} value={k}>{SORT_LABELS[k]}</option>
                ))}
              </select>

              {/* Select mode button — always available when there are songs */}
              {sortedSongs.length > 0 && (
                <button
                  onClick={toggleSelectMode}
                  className="p-1.5 text-ink-muted hover:text-ink rounded hover:bg-surface-2"
                  title="Select songs"
                >
                  <CheckSquare size={16} />
                </button>
              )}

              {!isActiveReadOnly && (
                <Button variant="primary" size="sm" onClick={createSong}>
                  <Plus size={15} />
                  {t('library.newSong')}
                </Button>
              )}
            </>
          )}
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
        <div className="flex-1 overflow-y-auto relative">
          {sortedSongs.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-ink-muted text-sm space-y-1">
              <Music size={32} className="text-ink-faint mb-2" />
              {activeTeamId && !isActiveReadOnly ? (
                <>
                  <p>No team songs yet.</p>
                  <p className="text-xs text-ink-faint">Add a new song, or use select mode to copy songs here.</p>
                </>
              ) : activeTeamId && isActiveReadOnly ? (
                <>
                  <p>No team songs yet.</p>
                  <p className="text-xs text-ink-faint">Team owners and contributors can add songs.</p>
                </>
              ) : (
                <>
                  <p>{t('library.noSongs')}</p>
                  <p className="text-xs text-ink-faint">{t('library.noSongsHint')}</p>
                </>
              )}
            </div>
          ) : (
            <ul>
              {sortedSongs.map(song => {
                const teamId = bookTeamMap[song.bookId]
                const team = teamId ? teams?.find(t => t.id === teamId) : undefined
                const role = team && user ? getTeamRole(team, user.id, user.email) : null
                const readOnly = role === 'reader'
                return (
                  <SongRow
                    key={song.id}
                    song={song}
                    navigate={navigate}
                    readOnly={readOnly}
                    selectMode={selectMode}
                    selected={selectedIds.has(song.id)}
                    onToggleSelect={() => toggleSong(song.id)}
                  />
                )
              })}
            </ul>
          )}

          {/* Bulk toast */}
          {bulkToast && (
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 pointer-events-none z-10">
              <div className="bg-surface-2 border border-surface-3 text-ink text-xs px-4 py-2 rounded-full shadow-lg animate-fade-in whitespace-nowrap">
                {bulkToast}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>

    {showCtUpload && ctUploadSongs.length > 0 && (
      <SongUploadDialog
        songs={ctUploadSongs}
        onClose={() => { setShowCtUpload(false); setCtUploadSongs([]) }}
      />
    )}
    </>
  )
}

function SongRow({
  song, navigate, readOnly, selectMode, selected, onToggleSelect
}: {
  song: Song
  navigate: (path: string) => void
  readOnly?: boolean
  selectMode?: boolean
  selected?: boolean
  onToggleSelect?: () => void
}) {
  return (
    <li
      className={`flex items-center gap-3 px-4 py-3 border-b border-surface-3/50 cursor-pointer group transition-colors
        ${selected ? 'bg-chord/5' : 'hover:bg-surface-2'}`}
      onClick={() => selectMode ? onToggleSelect?.() : navigate(`/view/${song.id}`)}
    >
      {selectMode && (
        <div className="shrink-0 text-chord">
          {selected
            ? <CheckSquare size={17} className="text-chord" />
            : <Square size={17} className="text-ink-faint" />}
        </div>
      )}
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
          <span className="text-xs text-ink-faint truncate max-w-[80px]">{song.tags[0]}</span>
        )}
        {song.isFavorite && <Star size={13} className="text-chord fill-chord" />}
        {!readOnly && !selectMode && (
          <button
            className="text-ink-faint hover:text-ink opacity-0 group-hover:opacity-100 p-1"
            onClick={e => { e.stopPropagation(); navigate(`/editor/${song.id}`) }}
            title="Edit"
          >
            <ChevronRight size={16} />
          </button>
        )}
      </div>
    </li>
  )
}

function MobileChip({ label, active, onClick, isTeam }: {
  label: string; active: boolean; onClick: () => void; isTeam?: boolean
}) {
  return (
    <button
      onClick={onClick}
      className={`shrink-0 px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
        active
          ? isTeam ? 'bg-chord/20 text-chord border border-chord/40' : 'bg-chord/20 text-chord border border-chord/40'
          : 'bg-surface-2 text-ink-muted border border-surface-3 hover:border-chord/30 hover:text-ink'
      }`}
    >
      {isTeam && <span className="mr-1 opacity-60">⊕</span>}
      {label}
    </button>
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
      {count !== undefined && <span className="text-xs text-ink-faint">{count}</span>}
    </button>
  )
}

function BookNavItem({ book, active, count, onClick, onRename, onDelete }: {
  book: { id: string; title: string }
  active: boolean
  count?: number
  onClick: () => void
  onRename: () => void
  onDelete: () => void
}) {
  const [hovered, setHovered] = useState(false)
  return (
    <div
      className="relative"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <button
        onClick={onClick}
        className={`flex items-center gap-2 px-2 py-2 rounded-lg text-sm w-full text-left transition-colors
          ${active ? 'bg-chord/10 text-chord' : 'text-ink-muted hover:bg-surface-2 hover:text-ink'}`}
      >
        <BookOpen size={15} />
        <span className="flex-1 truncate">{book.title}</span>
        {!hovered && count !== undefined && <span className="text-xs text-ink-faint">{count}</span>}
        {hovered && (
          <span className="flex items-center gap-0.5">
            <span
              role="button"
              onClick={e => { e.stopPropagation(); onRename() }}
              className="p-0.5 rounded hover:text-ink-muted text-ink-faint"
              title="Rename book"
            >
              <Pencil size={11} />
            </span>
            <span
              role="button"
              onClick={e => { e.stopPropagation(); onDelete() }}
              className="p-0.5 rounded hover:text-red-400 text-ink-faint"
              title="Delete book"
            >
              <Trash2 size={11} />
            </span>
          </span>
        )}
      </button>
    </div>
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
