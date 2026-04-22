import { useMemo, useEffect, useState, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  ArrowLeft, Play, Music, Pencil, Check,
  GripVertical, Trash2, Plus, Search, Copy,
  ChevronUp, ChevronDown, Printer, Link2, AlertTriangle, FileDown,
} from 'lucide-react'
import { db, generateId, markPending } from '@/db'
import { Button } from '@/components/shared/Button'
import { encodeSetlistShare, buildShareUrl, copyShareUrl } from '@/utils/share'
import { transposeKey, extractMeta, isValidKey } from '@/utils/chordpro'
import type { SetlistItem, Song } from '@/types'

export default function SetlistDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const [editMode, setEditMode] = useState(false)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dragOverId, setDragOverId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [filterBookId, setFilterBookId] = useState('')
  const [filterTags, setFilterTags] = useState<string[]>([])
  const [showPersonalSongs, setShowPersonalSongs] = useState(false)
  const [shareCopied, setShareCopied] = useState(false)

  type AddSongDialog = { song: Song; targetBook: { id: string; title: string } | null }
  const [addSongDialog, setAddSongDialog] = useState<AddSongDialog | null>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (id) db.setlists.update(id, { accessedAt: Date.now() })
  }, [id])

  const setlist = useLiveQuery(() => id ? db.setlists.get(id) : undefined, [id])
  const items = useLiveQuery(
    () => id ? db.setlistItems.where('setlistId').equals(id).sortBy('order') : [],
    [id]
  )

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
    [songIds.join(',')]
  )

  const books = useLiveQuery(async () => {
    if (!editMode && !setlist?.sharedTeamId) return []
    const all = await db.books.toArray()
    return all.sort((a, b) => a.title.localeCompare(b.title))
  }, [editMode, setlist?.sharedTeamId])

  const isTeamSetlist = !!setlist?.sharedTeamId

  // Set of book IDs that belong to this setlist's team — null when not a team setlist
  const teamBookIds = useMemo(() => {
    if (!setlist?.sharedTeamId || !books) return null
    return new Set(books.filter(b => b.sharedTeamId === setlist.sharedTeamId).map(b => b.id))
  }, [books, setlist?.sharedTeamId])

  // Books available in the "Add Song" filter — personal books hidden for team setlists
  const availableBooksForFilter = useMemo(() => {
    if (!books) return []
    if (!setlist?.sharedTeamId) return books
    return books.filter(b => b.sharedTeamId === setlist.sharedTeamId)
  }, [books, setlist?.sharedTeamId])

  // Reset book filter if it points to a personal book while editing a team setlist
  useEffect(() => {
    if (isTeamSetlist && filterBookId && teamBookIds && !teamBookIds.has(filterBookId)) {
      setFilterBookId('')
    }
  }, [isTeamSetlist, teamBookIds, filterBookId])

  const allTagsForFilter = useLiveQuery(async () => {
    if (!editMode) return []
    const all = await db.songs.toArray()
    const set = new Set<string>()
    for (const s of all) for (const t of s.tags ?? []) set.add(t.toLowerCase().trim())
    return [...set].sort()
  }, [editMode])

  // Songs for the add-song panel
  const addPanelSongs = useLiveQuery(async (): Promise<Song[]> => {
    if (!editMode) return []
    let all = await db.songs.toArray()

    // In a team setlist, hide personal songs by default
    if (setlist?.sharedTeamId && !showPersonalSongs) {
      const bks = await db.books.toArray()
      const tIds = new Set(bks.filter(b => b.sharedTeamId === setlist.sharedTeamId).map(b => b.id))
      all = all.filter(s => tIds.has(s.bookId))
    }

    if (filterBookId) all = all.filter(s => s.bookId === filterBookId)
    if (filterTags.length > 0) all = all.filter(s => filterTags.every(t => (s.tags ?? []).some(st => st.toLowerCase().trim() === t)))

    const q = searchQuery.trim().toLowerCase()
    if (q) all = all.filter(s => s.title.toLowerCase().includes(q) || (s.artist ?? '').toLowerCase().includes(q))

    const hasFilter = q || filterBookId || filterTags.length > 0 || showPersonalSongs
    return hasFilter ? all : all.sort((a, b) => (b.accessedAt ?? 0) - (a.accessedAt ?? 0)).slice(0, 12)
  }, [editMode, searchQuery, filterBookId, filterTags.join(','), setlist?.sharedTeamId, showPersonalSongs])

  if (setlist === undefined) return <div className="p-8 text-ink-muted">Loading…</div>
  if (!setlist) return <div className="p-8 text-ink-muted">Setlist not found.</div>

  const allItems = items ?? []
  const songItems = allItems.filter(i => i.type === 'song' && i.songId)
  const maxOrder = allItems.reduce((m, i) => Math.max(m, i.order), -1)

  // Set of songIds currently in the setlist for the ✓ indicator
  const setlistSongIdSet = new Set(songItems.map(i => i.songId!))

  const handlePresent = () => {
    const first = songItems[0]
    if (first?.songId) navigate(`/perform/${first.songId}?setlistId=${id}&pos=0`)
  }

  const handleShareSetlist = async () => {
    if (!setlist || !songs) return
    const sharedSongs = songItems
      .map(item => {
        const s = songs[item.songId!]
        if (!s) return null
        return {
          title: s.title,
          artist: s.artist,
          key: s.transcription.key,
          content: s.transcription.content,
          transposeOffset: item.transposeOffset ?? 0,
        }
      })
      .filter(Boolean) as { title: string; artist: string; key: string; content: string; transposeOffset: number }[]
    if (sharedSongs.length === 0) return
    const encoded = await encodeSetlistShare({ name: setlist.name, songs: sharedSongs })
    const url = buildShareUrl(encoded)
    const ok = await copyShareUrl(url)
    if (ok) {
      setShareCopied(true)
      setTimeout(() => setShareCopied(false), 2000)
    }
  }

  const handleExportCsv = () => {
    if (!setlist || !items) return
    const escape = (v: string) => `"${v.replace(/"/g, '""')}"`
    const headers = ['#', 'Type', 'Title', 'Artist', 'Key', 'Tempo', 'Time', 'Capo', 'Tags', 'Notes']
    const rows: string[][] = [headers]
    let pos = 0
    for (const item of items) {
      if (item.type === 'divider') {
        rows.push([
          String(++pos), 'divider',
          item.dividerName ?? '', '', '', '', '', '', '', item.notes ?? '',
        ])
      } else {
        const song = songs?.[item.songId!]
        const raw = song ? (extractMeta(song.transcription.content).key || song.transcription.key || '') : ''
        const baseKey = isValidKey(raw) ? raw : ''
        const key = baseKey && item.transposeOffset ? transposeKey(baseKey, item.transposeOffset) : baseKey
        rows.push([
          String(++pos), 'song',
          song?.title ?? '',
          song?.artist ?? '',
          key,
          song?.transcription.tempo ? String(song.transcription.tempo) : '',
          song?.transcription.timeSignature ?? '',
          song?.transcription.capo ? String(song.transcription.capo) : '',
          (song?.tags ?? []).join('; '),
          item.notes ?? '',
        ])
      }
    }
    const csv = rows.map(r => r.map(escape).join(',')).join('\r\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${setlist.name.replace(/[^a-z0-9]/gi, '_')}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleSongClick = (songId: string, posInSongItems: number) => {
    if (editMode) return
    navigate(`/view/${songId}?setlistId=${id}&pos=${posInSongItems}`)
  }

  // ── Touch setlist (update timestamp + mark pending for sync) ─────────────────

  const touchSetlist = async () => {
    if (!id) return
    await db.setlists.update(id, { updatedAt: Date.now() })
    await markPending('setlist', id)
  }

  // ── Rename setlist ────────────────────────────────────────────────────────────

  const handleSetlistNameBlur = async (e: React.FocusEvent<HTMLInputElement>) => {
    const name = e.currentTarget.value.trim()
    if (name && id) {
      await db.setlists.update(id, { name, updatedAt: Date.now() })
      await markPending('setlist', id)
    }
  }

  const handleSetlistNameKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') e.currentTarget.blur()
  }

  const handleSetlistDateBlur = async (e: React.FocusEvent<HTMLInputElement>) => {
    const date = e.currentTarget.value.trim() || undefined
    if (id) {
      await db.setlists.update(id, { date, updatedAt: Date.now() })
      await markPending('setlist', id)
    }
  }

  // ── Rename divider ────────────────────────────────────────────────────────────

  const handleDividerNameBlur = async (itemId: string, value: string) => {
    const dividerName = value.trim() || 'Section'
    await db.setlistItems.update(itemId, { dividerName })
    await touchSetlist()
  }

  // ── Delete item ───────────────────────────────────────────────────────────────

  const handleDelete = async (itemId: string) => {
    await db.setlistItems.delete(itemId)
    await touchSetlist()
  }

  // ── Drag and drop ─────────────────────────────────────────────────────────────

  const onDragStart = (e: React.DragEvent, itemId: string) => {
    setDraggingId(itemId)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', itemId)
  }

  const onDragOver = (e: React.DragEvent, itemId: string) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (itemId !== draggingId) setDragOverId(itemId)
  }

  const onDragEnd = () => {
    setDraggingId(null)
    setDragOverId(null)
  }

  const onDrop = async (e: React.DragEvent, toId: string) => {
    e.preventDefault()
    const fromId = draggingId
    setDraggingId(null)
    setDragOverId(null)
    if (!fromId || fromId === toId) return
    await moveItem(fromId, toId)
  }

  const moveItem = async (fromId: string, toId: string) => {
    const current = [...allItems]
    const fromIdx = current.findIndex(i => i.id === fromId)
    const toIdx = current.findIndex(i => i.id === toId)
    if (fromIdx === -1 || toIdx === -1) return

    const [moved] = current.splice(fromIdx, 1)
    current.splice(toIdx, 0, moved)

    const updated = current.map((item, idx) => ({ ...item, order: idx }))
    await db.setlistItems.bulkPut(updated)
    await touchSetlist()
  }

  // ── Add song ──────────────────────────────────────────────────────────────────

  const addSong = async (songId: string) => {
    if (!id) return
    const newItem: SetlistItem = {
      id: generateId(),
      setlistId: id,
      order: maxOrder + 1,
      type: 'song',
      songId,
      transposeOffset: 0,
    }
    await db.setlistItems.put(newItem)
    await touchSetlist()
  }

  // ── Add divider ───────────────────────────────────────────────────────────────

  const addDivider = async () => {
    if (!id) return
    const newItem: SetlistItem = {
      id: generateId(),
      setlistId: id,
      order: maxOrder + 1,
      type: 'divider',
      dividerName: 'New Section',
      transposeOffset: 0,
    }
    await db.setlistItems.put(newItem)
    await touchSetlist()
  }

  // ── Per-slot overrides ────────────────────────────────────────────────────────

  const adjustTranspose = async (itemId: string, newOffset: number) => {
    await db.setlistItems.update(itemId, { transposeOffset: newOffset })
    await touchSetlist()
  }

  const setItemColumns = async (itemId: string, columnCount: number | undefined) => {
    await db.setlistItems.update(itemId, { columnCount })
    await touchSetlist()
  }

  const setItemNotes = async (itemId: string, notes: string) => {
    const trimmed = notes.trim() || undefined
    await db.setlistItems.update(itemId, { notes: trimmed })
    await touchSetlist()
  }

  // ── Toggle edit mode ──────────────────────────────────────────────────────────

  const handleAddPersonalSong = (song: Song) => {
    const teamBooks = (books ?? []).filter(b => b.sharedTeamId === setlist?.sharedTeamId)
    setAddSongDialog({ song, targetBook: teamBooks[0] ?? null })
  }

  const confirmAddPersonalSong = async (copyToTeam: boolean) => {
    if (!addSongDialog) return
    const { song, targetBook } = addSongDialog
    setAddSongDialog(null)
    if (copyToTeam && targetBook) {
      const newId = generateId()
      await db.songs.add({ ...song, id: newId, bookId: targetBook.id, updatedAt: Date.now(), accessedAt: undefined })
      await markPending('song', newId)
      await addSong(newId)
    } else {
      await addSong(song.id)
    }
  }

  const toggleEditMode = () => {
    setEditMode(prev => {
      if (!prev) setTimeout(() => searchInputRef.current?.focus(), 100)
      return !prev
    })
    setSearchQuery('')
    setFilterBookId('')
    setFilterTags([])
    setShowPersonalSongs(false)
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

        {editMode ? (
          <input
            className="flex-1 bg-surface-2 border border-surface-3 focus:border-chord/60 rounded-lg px-3 py-1.5 text-base font-semibold text-ink outline-none min-w-0"
            defaultValue={setlist.name}
            onBlur={handleSetlistNameBlur}
            onKeyDown={handleSetlistNameKeyDown}
            aria-label="Setlist name"
          />
        ) : (
          <h1 className="text-lg font-semibold flex-1 truncate">{setlist.name}</h1>
        )}

        <button
          onClick={toggleEditMode}
          className={`p-1.5 rounded transition-colors ${
            editMode
              ? 'text-chord bg-chord/10 hover:bg-chord/20'
              : 'text-ink-muted hover:text-ink'
          }`}
          title={editMode ? 'Done editing' : 'Edit setlist'}
        >
          {editMode ? <Check size={18} /> : <Pencil size={18} />}
        </button>

        {!editMode && songItems.length > 0 && (
          <>
            <button
              onClick={handleShareSetlist}
              className="p-1.5 text-ink-muted hover:text-ink rounded relative"
              title="Copy read-only share link"
            >
              <Link2 size={17} />
              {shareCopied && (
                <span className="absolute -bottom-6 left-1/2 -translate-x-1/2 text-[10px] text-chord whitespace-nowrap">
                  Copied!
                </span>
              )}
            </button>
            <button
              onClick={handleExportCsv}
              className="p-1.5 text-ink-muted hover:text-ink rounded"
              title="Export setlist as CSV"
            >
              <FileDown size={17} />
            </button>
            <button
              onClick={() => window.open(`/print/setlist/${id}`, '_blank')}
              className="p-1.5 text-ink-muted hover:text-ink rounded"
              title="Print setlist / Save as PDF"
            >
              <Printer size={17} />
            </button>
            <Button variant="primary" size="sm" onClick={handlePresent}>
              <Play size={14} />
              Present
            </Button>
          </>
        )}
      </div>

      {/* Date field (edit mode) + song count + date badge */}
      <div className="flex items-center gap-3 flex-wrap">
        {editMode && (
          <label className="flex items-center gap-1.5 text-xs">
            <span className="text-ink-faint">Date</span>
            <input
              type="date"
              defaultValue={setlist.date ?? ''}
              key={`date-${setlist.id}-${setlist.date}`}
              onBlur={handleSetlistDateBlur}
              className="bg-surface-2 border border-surface-3 focus:border-chord/40 rounded px-2 py-0.5 text-xs text-ink outline-none"
            />
          </label>
        )}
        {!editMode && setlist.date && (
          <span className="text-xs text-ink-faint font-mono">{setlist.date}</span>
        )}
        {allItems.length > 0 && (
          <p className="text-xs text-ink-muted">
            {songItems.length} song{songItems.length !== 1 ? 's' : ''}
          </p>
        )}
      </div>

      {/* Empty state (non-edit) */}
      {allItems.length === 0 && !editMode && (
        <div className="flex flex-col items-center justify-center py-20 text-ink-muted text-sm space-y-2">
          <Music size={32} className="text-ink-faint mb-2" />
          <p>No songs in this setlist yet</p>
          <button
            onClick={toggleEditMode}
            className="mt-3 text-chord hover:text-chord-light text-xs underline"
          >
            Add songs
          </button>
        </div>
      )}

      {/* Item list */}
      <ul className="space-y-2">
        {allItems.map(item => {
          const isDragging = draggingId === item.id
          const isDragOver = dragOverId === item.id

          const rowBase = `flex items-center gap-3 rounded-xl border transition-all`
          const dragRingClass = isDragOver ? 'ring-1 ring-chord/50 border-chord' : ''
          const dragOpacity = isDragging ? 'opacity-40' : ''

          if (item.type === 'divider') {
            return (
              <li
                key={item.id}
                className={`${rowBase} ${dragRingClass} ${dragOpacity} px-3 py-1.5 border-surface-3 ${
                  editMode ? 'bg-surface-1' : ''
                }`}
                draggable={editMode}
                onDragStart={editMode ? e => onDragStart(e, item.id) : undefined}
                onDragOver={editMode ? e => onDragOver(e, item.id) : undefined}
                onDragEnd={editMode ? onDragEnd : undefined}
                onDrop={editMode ? e => onDrop(e, item.id) : undefined}
              >
                {editMode && (
                  <GripVertical
                    size={16}
                    className="text-ink-faint cursor-grab active:cursor-grabbing shrink-0"
                  />
                )}

                {editMode ? (
                  <input
                    className="flex-1 bg-transparent text-xs text-section uppercase tracking-wider font-semibold outline-none border-b border-transparent focus:border-chord/40 min-w-0"
                    defaultValue={item.dividerName ?? ''}
                    onBlur={e => handleDividerNameBlur(item.id, e.currentTarget.value)}
                    onKeyDown={e => e.key === 'Enter' && e.currentTarget.blur()}
                    aria-label="Divider name"
                  />
                ) : (
                  <span className="flex-1 text-xs text-ink-muted uppercase tracking-wider font-semibold border-b border-surface-3 w-full py-0.5">
                    {item.dividerName ?? '—'}
                  </span>
                )}

                {editMode && (
                  <button
                    onClick={() => handleDelete(item.id)}
                    className="p-1 text-ink-faint hover:text-red-400 transition-colors shrink-0"
                    title="Remove divider"
                  >
                    <Trash2 size={15} />
                  </button>
                )}
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
              className={`${dragRingClass} ${dragOpacity} rounded-xl border transition-all ${
                editMode
                  ? 'flex flex-col bg-surface-1 border-surface-3 p-3'
                  : 'flex items-center gap-3 p-3 bg-surface-1 border-surface-3 hover:border-chord/30 hover:bg-surface-2 cursor-pointer'
              } group`}
              draggable={editMode}
              onDragStart={editMode ? e => onDragStart(e, item.id) : undefined}
              onDragOver={editMode ? e => onDragOver(e, item.id) : undefined}
              onDragEnd={editMode ? onDragEnd : undefined}
              onDrop={editMode ? e => onDrop(e, item.id) : undefined}
              onClick={() => item.songId && !editMode && handleSongClick(item.songId, pos)}
            >
              {/* Main row */}
              <div className="flex items-center gap-3">
                {editMode ? (
                  <GripVertical
                    size={16}
                    className="text-ink-faint cursor-grab active:cursor-grabbing shrink-0"
                  />
                ) : (
                  <span className="text-xs font-mono text-ink-faint w-5 text-center shrink-0">
                    {pos + 1}
                  </span>
                )}

                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm truncate">
                    {song?.title ?? 'Unknown song'}
                  </div>
                  {song?.artist && (
                    <div className="text-xs text-ink-muted truncate">{song.artist}</div>
                  )}
                  {!editMode && item.notes && (
                    <div className="text-xs text-ink-faint italic truncate">{item.notes}</div>
                  )}
                </div>

                {isTeamSetlist && song && teamBookIds && !teamBookIds.has(song.bookId) && (
                  <span title="Personal book — not visible to team members" className="shrink-0">
                    <AlertTriangle size={14} className="text-amber-400" />
                  </span>
                )}

                {song && (() => {
                  const raw = extractMeta(song.transcription.content).key || song.transcription.key || ''
                  const baseKey = isValidKey(raw) ? raw : ''
                  const displayKey = baseKey && item.transposeOffset
                    ? transposeKey(baseKey, item.transposeOffset)
                    : baseKey
                  return displayKey ? (
                    <span className="text-xs font-mono text-chord bg-chord/10 px-2 py-0.5 rounded shrink-0">
                      {displayKey}
                    </span>
                  ) : null
                })()}

                {song && song.transcription.tempo > 0 && (
                  <span className="text-xs font-mono text-ink-muted shrink-0" title="Tempo">
                    ♩ {song.transcription.tempo}
                  </span>
                )}

                {editMode && (
                  <button
                    onClick={e => { e.stopPropagation(); handleDelete(item.id) }}
                    className="p-1 text-ink-faint hover:text-red-400 transition-colors shrink-0"
                    title="Remove song"
                  >
                    <Trash2 size={15} />
                  </button>
                )}
              </div>

              {/* Per-slot overrides row — edit mode only */}
              {editMode && (
                <div className="flex items-center gap-2 pl-6 mt-2 flex-wrap">
                  {/* Transpose */}
                  <div className="flex items-center gap-0 bg-surface-2 rounded overflow-hidden border border-surface-3">
                    <button
                      onClick={e => { e.stopPropagation(); adjustTranspose(item.id, item.transposeOffset - 1) }}
                      className="px-1 py-0.5 text-ink-faint hover:text-ink"
                    >
                      <ChevronDown size={12} />
                    </button>
                    <span className="text-xs font-mono w-7 text-center text-ink-muted select-none">
                      {item.transposeOffset > 0 ? `+${item.transposeOffset}` : item.transposeOffset}
                    </span>
                    <button
                      onClick={e => { e.stopPropagation(); adjustTranspose(item.id, item.transposeOffset + 1) }}
                      className="px-1 py-0.5 text-ink-faint hover:text-ink"
                    >
                      <ChevronUp size={12} />
                    </button>
                  </div>

                  {/* Column override */}
                  <div className="flex overflow-hidden rounded border border-surface-3">
                    {[1, 2, 3, 4, 5].map(n => (
                      <button
                        key={n}
                        onClick={e => { e.stopPropagation(); setItemColumns(item.id, item.columnCount === n ? undefined : n) }}
                        className={`px-1.5 py-0.5 text-xs ${item.columnCount === n ? 'bg-chord/20 text-chord' : 'text-ink-faint hover:text-ink'}`}
                        title={`${n} column${n > 1 ? 's' : ''}`}
                      >
                        {n}
                      </button>
                    ))}
                  </div>

                  {/* Notes */}
                  <input
                    type="text"
                    defaultValue={item.notes ?? ''}
                    onBlur={e => setItemNotes(item.id, e.currentTarget.value)}
                    onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
                    placeholder="notes…"
                    onClick={e => e.stopPropagation()}
                    className="flex-1 min-w-24 bg-surface-2 border border-surface-3 focus:border-chord/40 rounded px-2 py-0.5 text-xs text-ink placeholder:text-ink-faint outline-none"
                  />
                </div>
              )}
            </li>
          )
        })}
      </ul>

      {/* Edit-mode bottom panel */}
      {editMode && (
        <div className="mt-4 border-t border-surface-3 pt-4 space-y-3">
          {/* Add divider button */}
          <button
            onClick={addDivider}
            className="flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink transition-colors"
          >
            <Plus size={15} />
            Add Divider
          </button>

          {/* Add song search + filters */}
          <div className="space-y-2">
            <p className="text-xs font-medium text-ink-muted uppercase tracking-wider">Add Song</p>

            {/* Search */}
            <div className="relative">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint pointer-events-none" />
              <input
                ref={searchInputRef}
                type="search"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search songs…"
                className="w-full bg-surface-2 border border-surface-3 focus:border-chord/60 rounded-lg pl-9 pr-3 py-2 text-sm text-ink placeholder:text-ink-faint outline-none"
              />
            </div>

            {/* Filters row */}
            {(availableBooksForFilter.length > 1 || (allTagsForFilter ?? []).length > 0) && (
              <div className="space-y-2">
                {/* Book filter */}
                {availableBooksForFilter.length > 1 && (
                  <select
                    value={filterBookId}
                    onChange={e => setFilterBookId(e.target.value)}
                    className="w-full bg-surface-2 border border-surface-3 focus:border-chord/40 rounded-lg px-3 py-1.5 text-xs text-ink outline-none"
                  >
                    <option value="">{isTeamSetlist ? 'All team books' : 'All books'}</option>
                    {availableBooksForFilter.map(b => (
                      <option key={b.id} value={b.id}>{b.title}</option>
                    ))}
                  </select>
                )}

                {/* Tag chips */}
                {(allTagsForFilter ?? []).length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {(allTagsForFilter ?? []).map(tag => {
                      const active = filterTags.includes(tag)
                      return (
                        <button
                          key={tag}
                          onClick={() => setFilterTags(prev => active ? prev.filter(t => t !== tag) : [...prev, tag])}
                          className={`px-2 py-0.5 rounded-full text-xs transition-colors ${
                            active
                              ? 'bg-chord/20 text-chord border border-chord/40'
                              : 'bg-surface-2 text-ink-muted border border-surface-3 hover:border-chord/30 hover:text-ink'
                          }`}
                        >
                          {tag}
                        </button>
                      )
                    })}
                    {filterTags.length > 0 && (
                      <button
                        onClick={() => setFilterTags([])}
                        className="px-2 py-0.5 rounded-full text-xs text-ink-faint hover:text-ink border border-transparent hover:border-surface-3 transition-colors"
                      >
                        clear
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Song results */}
            <ul className="space-y-0.5 max-h-72 overflow-y-auto">
              {(addPanelSongs ?? []).map(song => {
                const alreadyIn = setlistSongIdSet.has(song.id)
                const isPersonal = teamBookIds !== null && !teamBookIds.has(song.bookId)
                return (
                  <li
                    key={song.id}
                    className={`flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer group ${
                      isPersonal ? 'opacity-50 hover:opacity-80' : 'hover:bg-surface-2'
                    }`}
                    onClick={() => isPersonal ? handleAddPersonalSong(song) : addSong(song.id)}
                    title={isPersonal ? 'Personal book — click to copy to team' : undefined}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{song.title}</div>
                      {song.artist && (
                        <div className="text-xs text-ink-muted truncate">{song.artist}</div>
                      )}
                    </div>

                    {song.transcription.key && (
                      <span className="text-xs font-mono text-chord bg-chord/10 px-2 py-0.5 rounded shrink-0">
                        {song.transcription.key}
                      </span>
                    )}

                    {isPersonal ? (
                      <Copy size={14} className="text-ink-faint group-hover:text-amber-400 shrink-0 transition-colors" />
                    ) : alreadyIn ? (
                      <Check size={15} className="text-chord shrink-0" />
                    ) : (
                      <Plus size={15} className="text-ink-faint group-hover:text-ink shrink-0" />
                    )}
                  </li>
                )
              })}

              {(addPanelSongs ?? []).length === 0 && (
                <li className="px-3 py-4 text-sm text-ink-faint text-center">
                  {searchQuery.trim() || filterBookId || filterTags.length > 0
                    ? 'No songs match these filters'
                    : 'No songs in library yet'}
                </li>
              )}
            </ul>

            {isTeamSetlist && (
              <button
                onClick={() => setShowPersonalSongs(v => !v)}
                className="text-xs text-ink-faint hover:text-ink transition-colors w-full text-center pt-1"
              >
                {showPersonalSongs ? 'Hide personal songs' : 'Show personal songs…'}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Copy personal song to team dialog */}
      {addSongDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
          <div className="bg-surface-1 border border-surface-3 rounded-2xl p-6 max-w-sm w-full space-y-4 shadow-2xl">
            <div className="flex items-start gap-3">
              <Copy size={18} className="text-amber-400 shrink-0 mt-0.5" />
              <div>
                <h2 className="font-semibold text-sm">Personal song</h2>
                <p className="text-sm text-ink-muted mt-1">
                  <span className="text-ink font-medium">"{addSongDialog.song.title}"</span> is in your personal library and won't be visible to other team members.
                </p>
                {addSongDialog.targetBook && (
                  <p className="text-xs text-ink-muted mt-2">
                    Copy it to <span className="text-ink font-medium">"{addSongDialog.targetBook.title}"</span> to share it with the team.
                  </p>
                )}
                {!addSongDialog.targetBook && (
                  <p className="text-xs text-amber-400/80 mt-2">
                    No team book found. Create one in the Library to share songs with the team.
                  </p>
                )}
              </div>
            </div>
            <div className="flex flex-col gap-2">
              {addSongDialog.targetBook && (
                <button
                  onClick={() => confirmAddPersonalSong(true)}
                  className="w-full px-4 py-2 bg-chord/20 text-chord rounded-lg text-sm font-medium hover:bg-chord/30 transition-colors"
                >
                  Copy to team & add to setlist
                </button>
              )}
              <button
                onClick={() => confirmAddPersonalSong(false)}
                className="w-full px-4 py-2 bg-surface-2 text-ink-muted rounded-lg text-sm hover:bg-surface-3 transition-colors"
              >
                Add anyway <span className="text-ink-faint text-xs">(only you will see it)</span>
              </button>
              <button
                onClick={() => setAddSongDialog(null)}
                className="w-full px-4 py-2 text-ink-faint text-sm hover:text-ink transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
