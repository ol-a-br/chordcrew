/**
 * Shows an accept/decline banner for each pending email invite addressed to
 * the current user. Invites are looked up and accepted through Cloud Functions
 * (src/sync/teamInvites.ts): the Firestore rules do not let users read teams
 * they are not a member of, or change a team's membership themselves.
 * Only renders when Firebase is configured and the user is signed in.
 */

import { useEffect, useState } from 'react'
import { firebaseConfigured } from '@/firebase'
import { db } from '@/db'
import { useAuth } from '@/auth/AuthContext'
import { listMyInvites, acceptInvite, declineInvite, type PendingInvite } from '@/sync/teamInvites'

export function TeamInviteNotification() {
  const { user } = useAuth()
  const [pending, setPending] = useState<PendingInvite[]>([])
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (!user || !firebaseConfigured) return
    let active = true
    listMyInvites()
      .then(invites => { if (active) setPending(invites) })
      .catch(() => { /* offline or functions unavailable — try again next launch */ })
    return () => { active = false }
  }, [user])

  const accept = async (invite: PendingInvite) => {
    if (!user) return
    try {
      const team = await acceptInvite(invite.teamId)
      await db.teams.put(team)
    } catch { /* invite may have been revoked */ }
    setDismissed(d => new Set([...d, invite.teamId]))
  }

  const decline = async (invite: PendingInvite) => {
    if (!user) return
    try { await declineInvite(invite.teamId) } catch { /* owner may have revoked */ }
    setDismissed(d => new Set([...d, invite.teamId]))
  }

  const visible = pending.filter(i => !dismissed.has(i.teamId))
  if (visible.length === 0) return null

  return (
    <div className="space-y-2 px-4 py-2">
      {visible.map(invite => (
        <div
          key={invite.teamId}
          className="flex items-center gap-3 bg-chord/10 border border-chord/30 rounded-xl px-4 py-2.5 text-sm"
        >
          <div className="flex-1 min-w-0">
            <span className="font-medium">{invite.ownerDisplayName}</span>
            <span className="text-ink-muted"> invited you to join </span>
            <span className="font-medium">{invite.teamName}</span>
            <span className="text-ink-muted"> as </span>
            <span className="text-chord">{invite.role}</span>
          </div>
          <button
            onClick={() => accept(invite)}
            className="text-xs px-2.5 py-1 bg-chord text-surface-0 rounded-lg hover:bg-chord-light shrink-0"
          >
            Accept
          </button>
          <button
            onClick={() => decline(invite)}
            className="text-xs px-2.5 py-1 text-ink-muted hover:text-ink shrink-0"
          >
            Decline
          </button>
        </div>
      ))}
    </div>
  )
}

