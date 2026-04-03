import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { Plus, Users, Crown, UserCheck } from 'lucide-react'
import { db, generateId } from '@/db'
import { firebaseConfigured } from '@/firebase'
import { syncTeam } from '@/sync/firestoreSync'
import { Button } from '@/components/shared/Button'
import { useAuth } from '@/auth/AuthContext'
import type { Team } from '@/types'

export default function TeamsPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [newDesc, setNewDesc] = useState('')

  const teams = useLiveQuery(() => db.teams.toArray(), [])

  const myTeams = teams?.filter(t =>
    t.ownerId === user?.id ||
    t.members.some(m => m.userId === user?.id || m.email === user?.email)
  ) ?? []

  const createTeam = async () => {
    if (!user || !newName.trim()) return
    const team: Team = {
      id: generateId(),
      name: newName.trim(),
      description: newDesc.trim() || undefined,
      ownerId: user.id,
      ownerEmail: user.email,
      ownerDisplayName: user.displayName,
      members: [],
      invites: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    await db.teams.add(team)
    if (firebaseConfigured) {
      try { await syncTeam(team) } catch { /* will sync later */ }
    }
    setCreating(false)
    setNewName('')
    setNewDesc('')
    navigate(`/teams/${team.id}`)
  }

  if (!firebaseConfigured) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-6">
        <h1 className="text-lg font-semibold mb-4">Teams</h1>
        <div className="bg-surface-1 rounded-xl p-6 text-center text-ink-muted space-y-2">
          <Users size={32} className="text-ink-faint mx-auto mb-2" />
          <p className="text-sm">Teams require Firebase to be configured.</p>
          <p className="text-xs text-ink-faint">
            Copy <code className="font-mono">.env.example</code> to{' '}
            <code className="font-mono">.env.local</code> and add your Firebase config.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-5">
      <div className="flex items-center gap-3">
        <h1 className="text-lg font-semibold flex-1">Teams</h1>
        <Button variant="primary" size="sm" onClick={() => setCreating(true)}>
          <Plus size={15} />
          New Team
        </Button>
      </div>

      {creating && (
        <div className="bg-surface-1 rounded-xl p-4 space-y-3 border border-chord/20">
          <h2 className="text-sm font-medium">Create team</h2>
          <input
            autoFocus
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') createTeam(); if (e.key === 'Escape') setCreating(false) }}
            placeholder="Team name…"
            className="w-full bg-surface-2 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-chord/50"
          />
          <input
            value={newDesc}
            onChange={e => setNewDesc(e.target.value)}
            placeholder="Description (optional)"
            className="w-full bg-surface-2 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-chord/50"
          />
          <div className="flex gap-2">
            <Button variant="primary" size="sm" onClick={createTeam} disabled={!newName.trim()}>Create</Button>
            <Button variant="ghost" size="sm" onClick={() => setCreating(false)}>Cancel</Button>
          </div>
        </div>
      )}

      {myTeams.length === 0 && !creating && (
        <div className="flex flex-col items-center justify-center py-20 text-ink-muted text-sm space-y-2">
          <Users size={32} className="text-ink-faint mb-2" />
          <p>No teams yet.</p>
          <p className="text-xs text-ink-faint">Create a team to share songs and setlists with your band.</p>
        </div>
      )}

      <ul className="space-y-2">
        {myTeams.map(team => (
          <TeamRow key={team.id} team={team} userId={user?.id ?? ''} navigate={navigate} />
        ))}
      </ul>
    </div>
  )
}

function TeamRow({ team, userId, navigate }: { team: Team; userId: string; navigate: (p: string) => void }) {
  const isOwner = team.ownerId === userId
  const memberCount = team.members.length + 1 // +1 for owner
  const pendingInvites = team.invites.length

  return (
    <li
      className="flex items-center gap-3 p-3 bg-surface-1 rounded-xl border border-surface-3 hover:border-surface-3/80 hover:bg-surface-2 cursor-pointer"
      onClick={() => navigate(`/teams/${team.id}`)}
    >
      <div className="w-9 h-9 rounded-lg bg-chord/10 flex items-center justify-center shrink-0">
        <Users size={17} className="text-chord" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-medium text-sm flex items-center gap-1.5">
          {team.name}
          {isOwner && <Crown size={11} className="text-chord shrink-0" />}
        </div>
        <div className="text-xs text-ink-muted flex items-center gap-2">
          <UserCheck size={11} />
          <span>{memberCount} member{memberCount !== 1 ? 's' : ''}</span>
          {pendingInvites > 0 && (
            <span className="text-amber-400">{pendingInvites} pending invite{pendingInvites !== 1 ? 's' : ''}</span>
          )}
          {team.description && (
            <span className="truncate text-ink-faint">{team.description}</span>
          )}
        </div>
      </div>
    </li>
  )
}
