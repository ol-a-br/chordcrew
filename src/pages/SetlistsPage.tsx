import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useLiveQuery } from 'dexie-react-hooks'
import { Plus, ListMusic, Play, Calendar, Copy } from 'lucide-react'
import { db, generateId, markPending } from '@/db'
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

  const setlistsRaw = useLiveQuery(() => db.setlists.toArray(), [])

  const setlists = useMemo(() => {
    const s = [...(setlistsRaw ?? [])]
    switch (sortBy) {
      case 'name':      return s.sort((a, b) => a.name.localeCompare(b.name))
      case 'createdAt':   return s.sort((a, b) => b.createdAt - a.createdAt)
      case 'accessedAt':  return s.sort((a, b) => ((b.accessedAt ?? 0) - (a.accessedAt ?? 0)))
      default:            return s.sort((a, b) => b.updatedAt - a.updatedAt)
    }
  }, [setlistsRaw, sortBy])

  const createSetlist = async () => {
    if (!user || !newName.trim()) return
    const id = generateId()
    await db.setlists.add({
      id,
      name: newName.trim(),
      ownerId: user.id,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })
    await markPending('setlist', id)
    setCreating(false)
    setNewName('')
    navigate(`/setlists/${id}`)
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-5">
      <div className="flex items-center gap-3">
        <h1 className="text-lg font-semibold flex-1">{t('nav.setlists')}</h1>
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
        <Button variant="primary" size="sm" onClick={() => setCreating(true)}>
          <Plus size={15} />
          {t('setlist.newSetlist')}
        </Button>
      </div>

      {/* New setlist form */}
      {creating && (
        <div className="flex gap-2">
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
      {setlists?.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-ink-muted text-sm space-y-2">
          <ListMusic size={32} className="text-ink-faint mb-2" />
          <p>{t('setlist.noSetlists')}</p>
        </div>
      )}

      <ul className="space-y-2">
        {setlists?.map(setlist => (
          <SetlistRow key={setlist.id} setlist={setlist} navigate={navigate} />
        ))}
      </ul>
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
