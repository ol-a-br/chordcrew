import { useMemo, useEffect, useState, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  ArrowLeft, Play, Music, Pencil, Check,
  GripVertical, Trash2, Plus, Search,
  ChevronUp, ChevronDown, Printer,
} from 'lucide-react'
import { db, generateId } from '@/db'
import { Button } from '@/components/shared/Button'
import type { SetlistItem, Song } from '@/types'

export default function SetlistDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const [editMode, setEditMode] = useState(false)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dragOverId, setDragOverId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
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

  // Songs for the add-song panel
  const addPanelSongs = useLiveQuery(async (): Promise<Song[]> => {
    if (!editMode) return []
    if (searchQuery.trim() === '') {
      return db.songs.orderBy('accessedAt').reverse().limit(12).toArray()
    }
    const q = searchQuery.toLowerCase()
    const all = await db.songs.toArray()
    return all.filter(s =>
      s.title.toLowerCase().includes(q) || (s.artist ?? '').toLowerCase().includes(q)
    )
  }, [editMode, searchQuery])

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

  const handleSongClick = (songId: string, posInSongItems: number) => {
    if (editMode) return
    navigate(`/view/${songId}?setlistId=${id}&pos=${posInSongItems}`)
  }

  // ── Rename setlist ────────────────────────────────────────────────────────────

  const handleSetlistNameBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    const name = e.currentTarget.value.trim()
    if (name && id) {
      db.setlists.update(id, { name, updatedAt: Date.now() })
    }
  }

  const handleSetlistNameKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') e.currentTarget.blur()
  }

  // ── Rename divider ────────────────────────────────────────────────────────────

  const handleDividerNameBlur = (itemId: string, value: string) => {
    const dividerName = value.trim() || 'Section'
    db.setlistItems.update(itemId, { dividerName })
    if (id) db.setlists.update(id, { updatedAt: Date.now() })
  }

  // ── Delete item ───────────────────────────────────────────────────────────────

  const handleDelete = async (itemId: string) => {
    await db.setlistItems.delete(itemId)
    if (id) await db.setlists.update(id, { updatedAt: Date.now() })
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
    if (id) await db.setlists.update(id, { updatedAt: Date.now() })
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
    await db.setlists.update(id, { updatedAt: Date.now() })
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
    await db.setlists.update(id, { updatedAt: Date.now() })
  }

  // ── Per-slot overrides ────────────────────────────────────────────────────────

  const adjustTranspose = async (itemId: string, newOffset: number) => {
    await db.setlistItems.update(itemId, { transposeOffset: newOffset })
    if (id) await db.setlists.update(id, { updatedAt: Date.now() })
  }

  const setItemColumns = async (itemId: string, columnCount: number | undefined) => {
    await db.setlistItems.update(itemId, { columnCount })
    if (id) await db.setlists.update(id, { updatedAt: Date.now() })
  }

  const setItemNotes = async (itemId: string, notes: string) => {
    const trimmed = notes.trim() || undefined
    await db.setlistItems.update(itemId, { notes: trimmed })
    if (id) await db.setlists.update(id, { updatedAt: Date.now() })
  }

  // ── Toggle edit mode ──────────────────────────────────────────────────────────

  const toggleEditMode = () => {
    setEditMode(prev => {
      if (!prev) setTimeout(() => searchInputRef.current?.focus(), 100)
      return !prev
    })
    setSearchQuery('')
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

      {/* Song count */}
      {allItems.length > 0 && (
        <p className="text-xs text-ink-muted">
          {songItems.length} song{songItems.length !== 1 ? 's' : ''}
        </p>
      )}

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

                {song?.transcription.key && (
                  <span className="text-xs font-mono text-chord bg-chord/10 px-2 py-0.5 rounded shrink-0">
                    {song.transcription.key}
                  </span>
                )}

                {!editMode && item.transposeOffset !== 0 && (
                  <span className="text-xs font-mono text-ink-muted shrink-0">
                    {item.transposeOffset > 0 ? `+${item.transposeOffset}` : item.transposeOffset}
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

          {/* Add song search */}
          <div className="space-y-2">
            <p className="text-xs font-medium text-ink-muted uppercase tracking-wider">Add Song</p>
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

            {/* Song results */}
            <ul className="space-y-0.5 max-h-72 overflow-y-auto">
              {(addPanelSongs ?? []).map(song => {
                const alreadyIn = setlistSongIdSet.has(song.id)
                return (
                  <li
                    key={song.id}
                    className="flex items-center gap-3 px-3 py-2 hover:bg-surface-2 rounded-lg cursor-pointer group"
                    onClick={() => addSong(song.id)}
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

                    {alreadyIn ? (
                      <Check size={15} className="text-chord shrink-0" />
                    ) : (
                      <Plus size={15} className="text-ink-faint group-hover:text-ink shrink-0" />
                    )}
                  </li>
                )
              })}

              {(addPanelSongs ?? []).length === 0 && searchQuery.trim() !== '' && (
                <li className="px-3 py-4 text-sm text-ink-faint text-center">
                  No songs found
                </li>
              )}

              {(addPanelSongs ?? []).length === 0 && searchQuery.trim() === '' && (
                <li className="px-3 py-4 text-sm text-ink-faint text-center">
                  No songs in library yet
                </li>
              )}
            </ul>
          </div>
        </div>
      )}
    </div>
  )
}
