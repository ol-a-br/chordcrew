import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { ArrowLeft, Crown, UserPlus, Trash2, ChevronDown } from 'lucide-react'
import { db, generateId } from '@/db'
import { syncTeam } from '@/sync/firestoreSync'
import { firebaseConfigured } from '@/firebase'
import { Button } from '@/components/shared/Button'
import { useAuth } from '@/auth/AuthContext'
import type { Team, TeamMember, TeamInvite, TeamMemberRole } from '@/types'

const ROLE_LABELS: Record<TeamMemberRole, string> = {
  owner:       'Owner',
  contributor: 'Contributor',
  reader:      'Reader',
}

export default function TeamDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()

  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<'contributor' | 'reader'>('contributor')
  const [showInviteForm, setShowInviteForm] = useState(false)
  const [inviteError, setInviteError] = useState('')

  const team = useLiveQuery(() => id ? db.teams.get(id) : undefined, [id])

  if (team === undefined) return <div className="p-8 text-ink-muted">Loading…</div>
  if (!team) return <div className="p-8 text-ink-muted">Team not found.</div>

  const isOwner = team.ownerId === user?.id
  const myRole: TeamMemberRole = isOwner ? 'owner' :
    (team.members.find(m => m.userId === user?.id || m.email === user?.email)?.role ?? 'reader')

  const saveTeam = async (updated: Team) => {
    await db.teams.put(updated)
    if (firebaseConfigured) {
      try { await syncTeam(updated) } catch { /* will retry on next sync */ }
    }
  }

  const handleInvite = async () => {
    const email = inviteEmail.trim().toLowerCase()
    if (!email || !email.includes('@')) { setInviteError('Enter a valid email address.'); return }
    if (team.ownerId === user?.id && email === user.email) { setInviteError('That\'s you.'); return }
    if (team.members.some(m => m.email === email)) { setInviteError('Already a member.'); return }
    if (team.invites.some(i => i.email === email)) { setInviteError('Already invited.'); return }

    const invite: TeamInvite = { email, role: inviteRole, invitedAt: Date.now() }
    const updated: Team = {
      ...team,
      invites: [...team.invites, invite],
      updatedAt: Date.now(),
    }
    await saveTeam(updated)
    setInviteEmail('')
    setInviteError('')
    setShowInviteForm(false)
  }

  const handleRevokeInvite = async (email: string) => {
    const updated: Team = {
      ...team,
      invites: team.invites.filter(i => i.email !== email),
      updatedAt: Date.now(),
    }
    await saveTeam(updated)
  }

  const handleRemoveMember = async (memberId: string) => {
    if (!confirm('Remove this member from the team?')) return
    const updated: Team = {
      ...team,
      members: team.members.filter(m => m.userId !== memberId),
      updatedAt: Date.now(),
    }
    await saveTeam(updated)
  }

  const handleChangeRole = async (memberId: string, role: 'contributor' | 'reader') => {
    const updated: Team = {
      ...team,
      members: team.members.map(m => m.userId === memberId ? { ...m, role } : m),
      updatedAt: Date.now(),
    }
    await saveTeam(updated)
  }

  const handleDeleteTeam = async () => {
    if (!confirm(`Delete team "${team.name}"? This cannot be undone.`)) return
    await db.teams.delete(team.id)
    navigate('/teams')
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/teams')} className="text-ink-muted hover:text-ink">
          <ArrowLeft size={18} />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-semibold truncate">{team.name}</h1>
          {team.description && <p className="text-xs text-ink-muted">{team.description}</p>}
        </div>
        {isOwner && (
          <Button variant="primary" size="sm" onClick={() => setShowInviteForm(v => !v)}>
            <UserPlus size={14} />
            Invite
          </Button>
        )}
      </div>

      {/* Invite form */}
      {showInviteForm && isOwner && (
        <div className="bg-surface-1 rounded-xl p-4 space-y-3 border border-chord/20">
          <h2 className="text-sm font-medium">Invite by Google email</h2>
          <div className="flex gap-2">
            <input
              autoFocus
              type="email"
              value={inviteEmail}
              onChange={e => { setInviteEmail(e.target.value); setInviteError('') }}
              onKeyDown={e => { if (e.key === 'Enter') handleInvite(); if (e.key === 'Escape') setShowInviteForm(false) }}
              placeholder="name@example.com"
              className="flex-1 bg-surface-2 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-chord/50"
            />
            <select
              value={inviteRole}
              onChange={e => setInviteRole(e.target.value as 'contributor' | 'reader')}
              className="bg-surface-2 text-sm rounded-lg px-2 py-2 border border-surface-3 focus:outline-none"
            >
              <option value="contributor">Contributor</option>
              <option value="reader">Reader</option>
            </select>
          </div>
          {inviteError && <p className="text-xs text-red-400">{inviteError}</p>}
          <div className="flex gap-2">
            <Button variant="primary" size="sm" onClick={handleInvite}>Send Invite</Button>
            <Button variant="ghost" size="sm" onClick={() => setShowInviteForm(false)}>Cancel</Button>
          </div>
          <p className="text-xs text-ink-faint">
            The invitee will see a notification next time they open ChordCrew and can accept or decline.
          </p>
        </div>
      )}

      {/* Members */}
      <section>
        <h2 className="text-xs text-ink-faint uppercase tracking-wider mb-2">Members</h2>
        <div className="bg-surface-1 rounded-xl divide-y divide-surface-3">
          {/* Owner row */}
          <MemberRow
            displayName={team.ownerDisplayName}
            email={team.ownerEmail}
            role="owner"
            isOwner={isOwner}
            isCurrentUser={team.ownerId === user?.id}
            canManage={false}
            onChangeRole={() => {}}
            onRemove={() => {}}
          />
          {/* Other members */}
          {team.members.map(member => (
            <MemberRow
              key={member.userId}
              displayName={member.displayName}
              email={member.email}
              role={member.role}
              isOwner={isOwner}
              isCurrentUser={member.userId === user?.id}
              canManage={isOwner && member.userId !== user?.id}
              onChangeRole={role => handleChangeRole(member.userId, role)}
              onRemove={() => handleRemoveMember(member.userId)}
            />
          ))}
        </div>
      </section>

      {/* Pending invites */}
      {team.invites.length > 0 && (
        <section>
          <h2 className="text-xs text-ink-faint uppercase tracking-wider mb-2">Pending Invites</h2>
          <div className="bg-surface-1 rounded-xl divide-y divide-surface-3">
            {team.invites.map(invite => (
              <div key={invite.email} className="flex items-center gap-3 px-4 py-3">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-mono truncate">{invite.email}</div>
                  <div className="text-xs text-ink-faint">{ROLE_LABELS[invite.role]} · invited {new Date(invite.invitedAt).toLocaleDateString()}</div>
                </div>
                {isOwner && (
                  <button
                    onClick={() => handleRevokeInvite(invite.email)}
                    className="p-1.5 text-ink-faint hover:text-red-400 rounded"
                    title="Revoke invite"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Role guide */}
      <section>
        <h2 className="text-xs text-ink-faint uppercase tracking-wider mb-2">Roles</h2>
        <div className="bg-surface-1 rounded-xl px-4 py-3 space-y-1.5 text-xs text-ink-muted">
          <p><span className="text-ink font-medium">Owner</span> — full control: invite/remove members, change roles, delete team</p>
          <p><span className="text-ink font-medium">Contributor</span> — add/edit/delete songs and setlists in the team</p>
          <p><span className="text-ink font-medium">Reader</span> — view team songs and setlists; cannot modify</p>
        </div>
      </section>

      {/* My role (if not owner) */}
      {!isOwner && (
        <div className="text-xs text-ink-faint text-center">
          Your role in this team: <span className="text-ink">{ROLE_LABELS[myRole]}</span>
        </div>
      )}

      {/* Danger zone */}
      {isOwner && (
        <section>
          <h2 className="text-xs text-ink-faint uppercase tracking-wider mb-2">Danger zone</h2>
          <div className="bg-surface-1 rounded-xl px-4 py-3 space-y-3">
            <p className="text-xs text-ink-muted">Deleting the team removes it from your local device. Other members keep their local copies until they sync.</p>
            <Button variant="danger" size="sm" onClick={handleDeleteTeam}>
              <Trash2 size={14} />
              Delete Team
            </Button>
          </div>
        </section>
      )}
    </div>
  )
}

// ─── Member row component ─────────────────────────────────────────────────────

interface MemberRowProps {
  displayName: string
  email: string
  role: TeamMemberRole
  isOwner: boolean
  isCurrentUser: boolean
  canManage: boolean
  onChangeRole: (role: 'contributor' | 'reader') => void
  onRemove: () => void
}

function MemberRow({ displayName, email, role, isCurrentUser, canManage, onChangeRole, onRemove }: MemberRowProps) {
  const [showMenu, setShowMenu] = useState(false)

  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <div className="w-7 h-7 rounded-full bg-chord/20 flex items-center justify-center text-chord text-xs font-bold shrink-0">
        {displayName[0]?.toUpperCase() ?? '?'}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm flex items-center gap-1.5">
          {displayName}
          {isCurrentUser && <span className="text-xs text-ink-faint">(you)</span>}
          {role === 'owner' && <Crown size={11} className="text-chord shrink-0" />}
        </div>
        <div className="text-xs text-ink-faint truncate">{email}</div>
      </div>
      {canManage ? (
        <div className="relative">
          <button
            onClick={() => setShowMenu(v => !v)}
            className="flex items-center gap-1 text-xs text-ink-muted hover:text-ink bg-surface-2 border border-surface-3 rounded px-2 py-1"
          >
            {ROLE_LABELS[role]}
            <ChevronDown size={11} />
          </button>
          {showMenu && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setShowMenu(false)} />
              <div className="absolute right-0 top-full mt-1 z-20 bg-surface-2 border border-surface-3 rounded-lg shadow-xl py-1 min-w-[120px]">
                {(['contributor', 'reader'] as const).map(r => (
                  <button
                    key={r}
                    onClick={() => { onChangeRole(r); setShowMenu(false) }}
                    className={`block w-full text-left px-3 py-1.5 text-xs hover:bg-surface-3 ${role === r ? 'text-chord' : 'text-ink'}`}
                  >
                    {ROLE_LABELS[r]}
                  </button>
                ))}
                <hr className="border-surface-3 my-1" />
                <button
                  onClick={() => { onRemove(); setShowMenu(false) }}
                  className="block w-full text-left px-3 py-1.5 text-xs text-red-400 hover:bg-surface-3"
                >
                  Remove
                </button>
              </div>
            </>
          )}
        </div>
      ) : (
        <span className="text-xs text-ink-faint px-2 py-1">{ROLE_LABELS[role]}</span>
      )}
    </div>
  )
}
