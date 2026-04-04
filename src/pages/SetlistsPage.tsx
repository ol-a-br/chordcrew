import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useLiveQuery } from 'dexie-react-hooks'
import { Plus, ListMusic, Play, Calendar, Copy, Users, Lock } from 'lucide-react'
import { db, generateId, markPending, getTeamRole } from '@/db'
import { Button } from '@/components/shared/Button'
import { useAuth } from '@/auth/AuthContext'
import type { Setlist } from '@/types'

type SetlistSort = 'name' | 'updatedAt' | 'createdAt' | 'accessedAt'

export default function SetlistsPage() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [sortBy, setSortBy] = useState<SetlistSort>('updatedAt')
  const [activeTeamId, setActiveTeamId] = useState<string | null>(null)

  const setlistsRaw = useLiveQuery(() => db.setlists.toArray(), [])
  const teams        = useLiveQuery(() => db.teams.toArray(), [])

  // Teams the current user belongs to
  const myTeams = useMemo(() => {
    if (!teams || !user) return []
    return teams.filter(t =>
      t.ownerId === user.id ||
      t.members.some(m => m.userId === user.id || m.email === user.email)
    )
  }, [teams, user])

  // Role in the active team context
  const activeTeamRole = useMemo(() => {
    if (!activeTeamId || !user || !teams) return null
    const team = teams.find(t => t.id === activeTeamId)
    if (!team) return null
    return getTeamRole(team, user.id, user.email)
  }, [activeTeamId, user, teams])

  const isReadOnly = activeTeamId ? activeTeamRole === 'reader' : false

  // Setlist counts per team for sidebar badges
  const teamSetlistCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const t of myTeams) counts[t.id] = 0
    setlistsRaw?.forEach(s => { if (s.sharedTeamId) counts[s.sharedTeamId] = (counts[s.sharedTeamId] ?? 0) + 1 })
    return counts
  }, [setlistsRaw, myTeams])

  // Filter setlists by active context
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

  return (
    <div className="flex h-full">
      {/* Left sidebar — only shown when user has teams */}
      {myTeams.length > 0 && (
        <aside className="hidden md:flex flex-col w-52 border-r border-surface-3 bg-surface-1 py-3 px-2 gap-0.5 shrink-0 overflow-y-auto">
          <SetlistNavItem
            label="My Setlists"
            icon={<ListMusic size={15} />}
            active={!activeTeamId}
            onClick={() => setActiveTeamId(null)}
            count={personalCount}
          />
          <div className="px-2 pt-3 pb-1 text-[11px] text-ink-faint uppercase tracking-wider">Teams</div>
          {myTeams.map(team => (
            <SetlistNavItem
              key={team.id}
              label={team.name}
              icon={<Users size={14} />}
              active={activeTeamId === team.id}
              onClick={() => setActiveTeamId(activeTeamId === team.id ? null : team.id)}
              count={teamSetlistCounts[team.id] ?? 0}
            />
          ))}
        </aside>
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile context tabs — shown when teams exist */}
        {myTeams.length > 0 && (
          <div className="md:hidden flex gap-1 px-4 pt-3 pb-1 overflow-x-auto hide-scrollbar">
            <button
              onClick={() => setActiveTeamId(null)}
              className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors
                ${!activeTeamId ? 'bg-chord/20 text-chord' : 'bg-surface-2 text-ink-muted hover:text-ink'}`}
            >
              My Setlists
            </button>
            {myTeams.map(team => (
              <button
                key={team.id}
                onClick={() => setActiveTeamId(team.id)}
                className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors
                  ${activeTeamId === team.id ? 'bg-chord/20 text-chord' : 'bg-surface-2 text-ink-muted hover:text-ink'}`}
              >
                {team.name}
              </button>
            ))}
          </div>
        )}

        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-4">
          <h1 className="text-lg font-semibold flex-1">
            {activeTeamId
              ? myTeams.find(t => t.id === activeTeamId)?.name ?? t('nav.setlists')
              : t('nav.setlists')}
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
        </div>

        {/* New setlist form */}
        {creating && (
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
        <div className="flex-1 overflow-y-auto px-4 pb-6">
          {setlists.length === 0 ? (
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
            <ul className="space-y-2">
              {setlists.map(setlist => (
                <SetlistRow key={setlist.id} setlist={setlist} navigate={navigate} />
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}

function SetlistRow({ setlist, navigate }: { setlist: Setlist; navigate: (p: string) => void }) {
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
      className="flex items-center gap-3 p-3 bg-surface-1 rounded-xl border border-surface-3 hover:border-surface-3/80 hover:bg-surface-2 cursor-pointer group"
      onClick={() => navigate(`/setlists/${setlist.id}`)}
    >
      <div className="w-9 h-9 rounded-lg bg-chord/10 flex items-center justify-center shrink-0">
        <ListMusic size={17} className="text-chord" />
      </div>
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
            <Users size={10} className="text-ink-faint shrink-0" aria-label="Team setlist" />
          )}
        </div>
      </div>

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
      {count !== undefined && (
        <span className="text-xs text-ink-faint">{count}</span>
      )}
    </button>
  )
}
