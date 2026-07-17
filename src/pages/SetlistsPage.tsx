import { useState, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  Plus, ListMusic, Play, Calendar, Copy, Users, Lock,
  CheckSquare, Square, Trash2, FolderInput, AlertTriangle,
} from 'lucide-react'
import { db, generateId, markPending, getTeamRole } from '@/db'
import { deleteSetlistFromCloud } from '@/sync/firestoreSync'
import { Button } from '@/components/shared/Button'
import { useAuth } from '@/auth/AuthContext'
import type { Setlist, Song } from '@/types'

type SetlistSort = 'name' | 'updatedAt' | 'createdAt' | 'accessedAt'

export default function SetlistsPage() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [sortBy, setSortBy] = useState<SetlistSort>('updatedAt')
  const [activeTeamId, setActiveTeamId] = useState<string | null>(null)

  // Bulk selection
  const [selectMode, setSelectMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [showOrganizeMenu, setShowOrganizeMenu] = useState(false)
  const [bulkToast, setBulkToast] = useState<string | null>(null)
  const bulkToastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  type OrganizeDialog = {
    action: 'copy' | 'move'
    targetTeamId: string
    targetLabel: string
    targetBook: { id: string; title: string } | null
    affectedSongs: Song[]
  }
  const [organizeDialog, setOrganizeDialog] = useState<OrganizeDialog | null>(null)

  const setlistsRaw = useLiveQuery(() => db.setlists.toArray(), [])
  const teams        = useLiveQuery(() => db.teams.toArray(), [])
  const books        = useLiveQuery(() => db.books.toArray(), [])

  const myTeams = useMemo(() => {
    if (!teams || !user) return []
    return teams.filter(t =>
      t.ownerId === user.id ||
      t.members.some(m => m.userId === user.id || m.email === user.email)
    )
  }, [teams, user])

  const contributorTeams = useMemo(() => {
    if (!teams || !user) return []
    return teams.filter(t => {
      const role = getTeamRole(t, user.id, user.email)
      return role === 'owner' || role === 'contributor'
    })
  }, [teams, user])

  const activeTeamRole = useMemo(() => {
    if (!activeTeamId || !user || !teams) return null
    const team = teams.find(t => t.id === activeTeamId)
    if (!team) return null
    return getTeamRole(team, user.id, user.email)
  }, [activeTeamId, user, teams])

  const isReadOnly = activeTeamId ? activeTeamRole === 'reader' : false

  const teamSetlistCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const t of myTeams) counts[t.id] = 0
    setlistsRaw?.forEach(s => { if (s.sharedTeamId) counts[s.sharedTeamId] = (counts[s.sharedTeamId] ?? 0) + 1 })
    return counts
  }, [setlistsRaw, myTeams])

  const filteredSetlists = useMemo(() => {
    const all = setlistsRaw ?? []
    return activeTeamId
      ? all.filter(s => s.sharedTeamId === activeTeamId)
      : all.filter(s => !s.sharedTeamId)
  }, [setlistsRaw, activeTeamId])

  const setlists = useMemo(() => {
    const s = [...filteredSetlists]
    switch (sortBy) {
      case 'name':        return s.sort((a, b) => a.name.localeCompare(b.name))
      case 'createdAt':   return s.sort((a, b) => b.createdAt - a.createdAt)
      case 'accessedAt':  return s.sort((a, b) => ((b.accessedAt ?? 0) - (a.accessedAt ?? 0)))
      default:            return s.sort((a, b) => b.updatedAt - a.updatedAt)
    }
  }, [filteredSetlists, sortBy])

  const personalCount = useMemo(
    () => (setlistsRaw ?? []).filter(s => !s.sharedTeamId).length,
    [setlistsRaw]
  )

  // Organize targets: personal + contributor teams, minus current context
  const organizeTargets = useMemo(() => {
    const targets: Array<{ id: string | null; label: string }> = []
    if (activeTeamId !== null) targets.push({ id: null, label: 'My Setlists' })
    contributorTeams.forEach(t => {
      if (t.id !== activeTeamId) targets.push({ id: t.id, label: t.name })
    })
    return targets
  }, [contributorTeams, activeTeamId])

  const createSetlist = async () => {
    if (!user || !newName.trim()) return
    const id = generateId()
    await db.setlists.add({
      id,
      name: newName.trim(),
      ownerId: user.id,
      sharedTeamId: activeTeamId ?? undefined,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })
    await markPending('setlist', id)
    setCreating(false)
    setNewName('')
    navigate(`/setlists/${id}`)
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

  const exitSelectMode = () => {
    setSelectMode(false)
    setSelectedIds(new Set())
    setShowOrganizeMenu(false)
  }

  const toggleSetlist = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const selectAll = () => setSelectedIds(new Set(setlists.map(s => s.id)))

  const bulkDelete = async () => {
    const count = selectedIds.size
    if (!confirm(`Delete ${count} setlist${count !== 1 ? 's' : ''} and all their songs? This cannot be undone.`)) return
    for (const id of selectedIds) {
      await db.setlistItems.where('setlistId').equals(id).delete()
      await db.syncStates.delete(`setlist:${id}`)
      const setlist = setlistsRaw?.find(s => s.id === id)
      if (user) deleteSetlistFromCloud(id, user.id, setlist?.sharedTeamId).catch(() => {})
    }
    await db.setlists.bulkDelete([...selectedIds])
    exitSelectMode()
    showBulkToast(`Deleted ${count} setlist${count !== 1 ? 's' : ''}`)
  }

  const bulkCopyTo = async (targetTeamId: string | null, targetLabel: string, songIdMap = new Map<string, string>()) => {
    const toCopy = setlists.filter(s => selectedIds.has(s.id))
    const now = Date.now()
    for (const setlist of toCopy) {
      const newId = generateId()
      await db.setlists.add({
        ...setlist,
        id: newId,
        sharedTeamId: targetTeamId ?? undefined,
        name: `${setlist.name} (copy)`,
        createdAt: now,
        updatedAt: now,
        accessedAt: undefined,
      })
      const items = await db.setlistItems.where('setlistId').equals(setlist.id).toArray()
      if (items.length > 0) {
        await db.setlistItems.bulkAdd(
          items.map(item => ({
            ...item,
            id: generateId(),
            setlistId: newId,
            songId: item.songId ? (songIdMap.get(item.songId) ?? item.songId) : item.songId,
          }))
        )
      }
      await markPending('setlist', newId)
    }
    setActiveTeamId(targetTeamId)
    exitSelectMode()
    showBulkToast(`Copied ${toCopy.length} setlist${toCopy.length !== 1 ? 's' : ''} to ${targetLabel}`)
  }

  const bulkMoveTo = async (targetTeamId: string | null, targetLabel: string, songIdMap = new Map<string, string>()) => {
    const ids = [...selectedIds]
    const now = Date.now()
    for (const id of ids) {
      await db.setlists.update(id, { sharedTeamId: targetTeamId ?? undefined, updatedAt: now })
      await markPending('setlist', id)
      if (songIdMap.size > 0) {
        const items = await db.setlistItems.where('setlistId').equals(id).toArray()
        for (const item of items) {
          if (item.songId && songIdMap.has(item.songId)) {
            await db.setlistItems.update(item.id, { songId: songIdMap.get(item.songId) })
          }
        }
      }
    }
    setActiveTeamId(targetTeamId)
    exitSelectMode()
    showBulkToast(`Moved ${ids.length} setlist${ids.length !== 1 ? 's' : ''} to ${targetLabel}`)
  }

  const prepareOrganize = async (action: 'copy' | 'move', targetTeamId: string | null, targetLabel: string) => {
    setShowOrganizeMenu(false)
    if (!targetTeamId) {
      action === 'copy' ? await bulkCopyTo(null, targetLabel) : await bulkMoveTo(null, targetLabel)
      return
    }
    // Collect unique song IDs across selected setlists
    const allSongIds = new Set<string>()
    for (const id of selectedIds) {
      const items = await db.setlistItems.where('setlistId').equals(id).toArray()
      items.forEach(i => { if (i.songId) allSongIds.add(i.songId) })
    }
    // Find songs not in any team book for this target
    const teamBookIds = new Set((books ?? []).filter(b => b.sharedTeamId === targetTeamId).map(b => b.id))
    const affected: Song[] = []
    for (const songId of allSongIds) {
      const song = await db.songs.get(songId)
      if (song && !teamBookIds.has(song.bookId)) affected.push(song)
    }
    if (affected.length === 0) {
      action === 'copy' ? await bulkCopyTo(targetTeamId, targetLabel) : await bulkMoveTo(targetTeamId, targetLabel)
      return
    }
    const teamBooks = (books ?? []).filter(b => b.sharedTeamId === targetTeamId)
    setOrganizeDialog({ action, targetTeamId, targetLabel, targetBook: teamBooks[0] ?? null, affectedSongs: affected })
  }

  const executeOrganize = async (copySongs: boolean) => {
    if (!organizeDialog) return
    const { action, targetTeamId, targetLabel, targetBook, affectedSongs } = organizeDialog
    setOrganizeDialog(null)
    const songIdMap = new Map<string, string>()
    if (copySongs && targetBook) {
      const now = Date.now()
      for (const song of affectedSongs) {
        const newId = generateId()
        await db.songs.add({ ...song, id: newId, bookId: targetBook.id, updatedAt: now, accessedAt: undefined })
        await markPending('song', newId)
        songIdMap.set(song.id, newId)
      }
    }
    action === 'copy'
      ? await bulkCopyTo(targetTeamId, targetLabel, songIdMap)
      : await bulkMoveTo(targetTeamId, targetLabel, songIdMap)
  }

  return (
    <div className="flex h-full">
      {/* Left sidebar */}
      {myTeams.length > 0 && (
        <aside className="hidden md:flex flex-col w-52 border-r border-surface-3 bg-surface-1 py-3 px-2 gap-0.5 shrink-0 overflow-y-auto">
          <SetlistNavItem
            label="My Setlists"
            icon={<ListMusic size={15} />}
            active={!activeTeamId}
            onClick={() => { setActiveTeamId(null); exitSelectMode() }}
            count={personalCount}
          />
          <div className="px-2 pt-3 pb-1 text-[11px] text-ink-faint uppercase tracking-wider">Teams</div>
          {myTeams.map(team => (
            <SetlistNavItem
              key={team.id}
              label={team.name}
              icon={<Users size={14} />}
              active={activeTeamId === team.id}
              onClick={() => { setActiveTeamId(activeTeamId === team.id ? null : team.id); exitSelectMode() }}
              count={teamSetlistCounts[team.id] ?? 0}
            />
          ))}
        </aside>
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile context tabs */}
        {myTeams.length > 0 && (
          <div className="md:hidden flex gap-1 px-4 pt-3 pb-1 overflow-x-auto hide-scrollbar">
            <button
              onClick={() => { setActiveTeamId(null); exitSelectMode() }}
              className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors
                ${!activeTeamId ? 'bg-chord/20 text-chord' : 'bg-surface-2 text-ink-muted hover:text-ink'}`}
            >
              My Setlists
            </button>
            {myTeams.map(team => (
              <button
                key={team.id}
                onClick={() => { setActiveTeamId(team.id); exitSelectMode() }}
                className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors
                  ${activeTeamId === team.id ? 'bg-chord/20 text-chord' : 'bg-surface-2 text-ink-muted hover:text-ink'}`}
              >
                {team.name}
              </button>
            ))}
          </div>
        )}

        {/* Header */}
        <div className="flex items-center gap-2 px-4 py-4 flex-wrap">
          {selectMode ? (
            <>
              <span className="text-sm font-medium flex-1">
                {selectedIds.size > 0 ? `${selectedIds.size} selected` : 'Tap setlists to select'}
              </span>
              {selectedIds.size < setlists.length && (
                <button onClick={selectAll} className="text-xs text-chord hover:text-chord/80 shrink-0">
                  Select all
                </button>
              )}
              {selectedIds.size > 0 && (
                <>
                  <button
                    onClick={bulkDelete}
                    className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs text-red-400 hover:bg-red-400/10 shrink-0"
                  >
                    <Trash2 size={14} />
                    Delete
                  </button>
                  {organizeTargets.length > 0 && (
                    <div className="relative shrink-0">
                      <button
                        onClick={() => setShowOrganizeMenu(v => !v)}
                        className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs text-ink-muted hover:bg-surface-2 hover:text-ink border border-surface-3"
                      >
                        <FolderInput size={14} />
                        Organize
                      </button>
                      {showOrganizeMenu && (
                        <>
                          <div className="fixed inset-0 z-10" onClick={() => setShowOrganizeMenu(false)} />
                          <div className="absolute right-0 top-full mt-1 z-20 bg-surface-2 border border-surface-3 rounded-xl shadow-xl py-1 min-w-[200px]">
                            <div className="px-3 py-1 text-[11px] text-ink-faint uppercase tracking-wider">Copy to</div>
                            {organizeTargets.map(target => (
                              <button
                                key={`copy-${target.id}`}
                                onClick={() => prepareOrganize('copy', target.id, target.label)}
                                className="flex items-center gap-2 w-full text-left px-3 py-1.5 text-xs text-ink hover:bg-surface-3"
                              >
                                {target.id ? <Users size={11} className="text-ink-faint" /> : <ListMusic size={11} className="text-ink-faint" />}
                                {target.label}
                              </button>
                            ))}
                            <hr className="border-surface-3 my-1" />
                            <div className="px-3 py-1 text-[11px] text-ink-faint uppercase tracking-wider">Move to</div>
                            {organizeTargets.map(target => (
                              <button
                                key={`move-${target.id}`}
                                onClick={() => prepareOrganize('move', target.id, target.label)}
                                className="flex items-center gap-2 w-full text-left px-3 py-1.5 text-xs text-ink hover:bg-surface-3"
                              >
                                {target.id ? <Users size={11} className="text-ink-faint" /> : <ListMusic size={11} className="text-ink-faint" />}
                                {target.label}
                              </button>
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </>
              )}
              <Button variant="ghost" size="sm" onClick={exitSelectMode}>Cancel</Button>
            </>
          ) : (
            <>
              <h1 className="text-lg font-semibold flex-1">
                {activeTeamId ? myTeams.find(t => t.id === activeTeamId)?.name ?? t('nav.setlists') : t('nav.setlists')}
              </h1>
              <select
                value={sortBy}
                onChange={e => setSortBy(e.target.value as SetlistSort)}
                className="bg-surface-2 text-xs text-ink-muted rounded-lg px-2 py-1.5 border border-surface-3 focus:outline-none cursor-pointer"
              >
                <option value="updatedAt">Last edited</option>
                <option value="name">Name</option>
                <option value="createdAt">Date created</option>
                <option value="accessedAt">Recently opened</option>
              </select>
              {setlists.length > 0 && (
                <button
                  onClick={toggleSelectMode}
                  className="p-1.5 text-ink-muted hover:text-ink rounded hover:bg-surface-2"
                  title="Select setlists"
                >
                  <CheckSquare size={16} />
                </button>
              )}
              {!isReadOnly && (
                <Button variant="primary" size="sm" onClick={() => setCreating(true)}>
                  <Plus size={15} />
                  {t('setlist.newSetlist')}
                </Button>
              )}
              {isReadOnly && (
                <span className="text-xs text-ink-faint flex items-center gap-1">
                  <Lock size={12} />
                  Read only
                </span>
              )}
            </>
          )}
        </div>

        {/* New setlist form */}
        {creating && !selectMode && (
          <div className="flex gap-2 px-4 mb-3">
            <input
              autoFocus
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') createSetlist(); if (e.key === 'Escape') setCreating(false) }}
              placeholder="Setlist name…"
              className="flex-1 bg-surface-2 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-chord/50"
            />
            <Button variant="primary" size="sm" onClick={createSetlist}>Create</Button>
            <Button variant="ghost" size="sm" onClick={() => setCreating(false)}>Cancel</Button>
          </div>
        )}

        {/* List */}
        <div className="flex-1 overflow-y-auto px-4 pb-6 relative">
          {setlists.length === 0 && !selectMode ? (
            <div className="flex flex-col items-center justify-center py-20 text-ink-muted text-sm space-y-2">
              <ListMusic size={32} className="text-ink-faint mb-2" />
              {activeTeamId ? (
                <>
                  <p>No team setlists yet.</p>
                  {!isReadOnly && (
                    <p className="text-xs text-ink-faint">Create a setlist to share with the team.</p>
                  )}
                </>
              ) : (
                <p>{t('setlist.noSetlists')}</p>
              )}
            </div>
          ) : (
            <ul className="space-y-2 pt-1">
              {setlists.map(setlist => (
                <SetlistRow
                  key={setlist.id}
                  setlist={setlist}
                  navigate={navigate}
                  selectMode={selectMode}
                  selected={selectedIds.has(setlist.id)}
                  onToggleSelect={() => toggleSetlist(setlist.id)}
                />
              ))}
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

      {/* Copy-songs-to-team dialog */}
      {organizeDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
          <div className="bg-surface-1 border border-surface-3 rounded-2xl p-6 max-w-sm w-full space-y-4 shadow-2xl">
            <div className="flex items-start gap-3">
              <AlertTriangle size={20} className="text-amber-400 shrink-0 mt-0.5" />
              <div>
                <h2 className="font-semibold text-sm">Songs from personal books</h2>
                <p className="text-xs text-ink-muted mt-1">
                  {organizeDialog.affectedSongs.length} song{organizeDialog.affectedSongs.length !== 1 ? 's' : ''} in {organizeDialog.action === 'copy' ? 'the copied' : 'these'} setlist{selectedIds.size !== 1 ? 's' : ''} are stored in your personal library and won't be visible to team members.
                </p>
                {organizeDialog.targetBook ? (
                  <p className="text-xs text-ink-muted mt-2">
                    Copy them to <span className="text-ink font-medium">"{organizeDialog.targetBook.title}"</span> to make them available to the team.
                  </p>
                ) : (
                  <p className="text-xs text-amber-400/80 mt-2">
                    No team book found for {organizeDialog.targetLabel}. Create a team book in the Library first to copy songs across.
                  </p>
                )}
              </div>
            </div>

            <div className="bg-surface-2 rounded-lg px-3 py-2 max-h-32 overflow-y-auto">
              {organizeDialog.affectedSongs.slice(0, 6).map(s => (
                <div key={s.id} className="text-xs text-ink-muted py-0.5 truncate">{s.title}</div>
              ))}
              {organizeDialog.affectedSongs.length > 6 && (
                <div className="text-xs text-ink-faint py-0.5">…and {organizeDialog.affectedSongs.length - 6} more</div>
              )}
            </div>

            <div className="flex flex-col gap-2">
              {organizeDialog.targetBook && (
                <button
                  onClick={() => executeOrganize(true)}
                  className="w-full px-4 py-2 bg-chord/20 text-chord rounded-lg text-sm font-medium hover:bg-chord/30 transition-colors"
                >
                  Copy songs to "{organizeDialog.targetBook.title}"
                </button>
              )}
              <button
                onClick={() => executeOrganize(false)}
                className="w-full px-4 py-2 bg-surface-2 text-ink-muted rounded-lg text-sm hover:bg-surface-3 transition-colors"
              >
                {organizeDialog.targetBook ? 'Skip — keep songs in personal book' : `${organizeDialog.action === 'copy' ? 'Copy' : 'Move'} setlist anyway`}
              </button>
              <button
                onClick={() => setOrganizeDialog(null)}
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

function SetlistRow({
  setlist, navigate, selectMode, selected, onToggleSelect
}: {
  setlist: Setlist
  navigate: (p: string) => void
  selectMode?: boolean
  selected?: boolean
  onToggleSelect?: () => void
}) {
  const itemCount = useLiveQuery(
    () => db.setlistItems.where('setlistId').equals(setlist.id).count(),
    [setlist.id]
  )

  const handleDuplicate = async (e: React.MouseEvent) => {
    e.stopPropagation()
    const now = Date.now()
    const newId = generateId()
    await db.setlists.add({
      ...setlist,
      id: newId,
      name: `${setlist.name} (copy)`,
      createdAt: now,
      updatedAt: now,
      accessedAt: undefined,
    })
    const items = await db.setlistItems.where('setlistId').equals(setlist.id).toArray()
    if (items.length > 0) {
      await db.setlistItems.bulkAdd(items.map(item => ({ ...item, id: generateId(), setlistId: newId })))
    }
    navigate(`/setlists/${newId}`)
  }

  return (
    <li
      className={`flex items-center gap-3 p-3 bg-surface-1 rounded-xl border border-surface-3 cursor-pointer group transition-colors
        ${selected ? 'bg-chord/5 border-chord/30' : 'hover:border-surface-3/80 hover:bg-surface-2'}`}
      onClick={() => selectMode ? onToggleSelect?.() : navigate(`/setlists/${setlist.id}`)}
    >
      {selectMode ? (
        <div className="shrink-0">
          {selected
            ? <CheckSquare size={17} className="text-chord" />
            : <Square size={17} className="text-ink-faint" />}
        </div>
      ) : (
        <div className="w-9 h-9 rounded-lg bg-chord/10 flex items-center justify-center shrink-0">
          <ListMusic size={17} className="text-chord" />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="font-medium text-sm">{setlist.name}</div>
        <div className="flex items-center gap-2 text-xs text-ink-muted">
          <span>{itemCount ?? 0} songs</span>
          {setlist.date && (
            <>
              <Calendar size={10} className="shrink-0" />
              <span>{new Date(setlist.date).toLocaleDateString()}</span>
            </>
          )}
          {setlist.sharedTeamId && (
            <Users size={10} className="text-ink-faint shrink-0" />
          )}
        </div>
      </div>

      {!selectMode && (
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            className="p-1.5 text-ink-faint hover:text-ink rounded"
            onClick={handleDuplicate}
            title="Duplicate setlist"
          >
            <Copy size={14} />
          </button>
          <button
            className="p-1.5 bg-chord text-surface-0 rounded-lg"
            onClick={e => { e.stopPropagation(); navigate(`/setlists/${setlist.id}`) }}
            title="Open setlist"
          >
            <Play size={14} />
          </button>
        </div>
      )}
    </li>
  )
}

function SetlistNavItem({ label, icon, active, onClick, count }: {
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
