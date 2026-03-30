import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useLiveQuery } from 'dexie-react-hooks'
import { Plus, ListMusic, Play, Calendar } from 'lucide-react'
import { db, generateId } from '@/db'
import { Button } from '@/components/shared/Button'
import { useAuth } from '@/auth/AuthContext'
import type { Setlist } from '@/types'

type SetlistSort = 'name' | 'updatedAt' | 'createdAt'

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
      case 'createdAt': return s.sort((a, b) => b.createdAt - a.createdAt)
      default:          return s.sort((a, b) => b.updatedAt - a.updatedAt)
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
        <div className="text-xs text-ink-muted">{itemCount ?? 0} songs</div>
      </div>
      {setlist.date && (
        <div className="flex items-center gap-1 text-xs text-ink-muted">
          <Calendar size={12} />
          {new Date(setlist.date).toLocaleDateString()}
        </div>
      )}
      <button
        className="p-1.5 bg-chord text-surface-0 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
        onClick={e => { e.stopPropagation(); navigate(`/setlists/${setlist.id}/present`) }}
        title="Present"
      >
        <Play size={14} />
      </button>
    </li>
  )
}
