/**
 * Checks Firestore for team invites addressed to the current user's email.
 * Shows an accept/decline banner for each pending invite.
 * Only renders when Firebase is configured and the user is signed in.
 */

import { useEffect, useState } from 'react'
import { collection, query, where, getDocs, doc, setDoc, updateDoc } from 'firebase/firestore'
import { firestore, firebaseConfigured } from '@/firebase'
import { db } from '@/db'
import { useAuth } from '@/auth/AuthContext'
import type { Team, TeamMember } from '@/types'

interface PendingInvite {
  team: Team
  role: 'contributor' | 'reader'
}

export function TeamInviteNotification() {
  const { user } = useAuth()
  const [pending, setPending] = useState<PendingInvite[]>([])
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (!user || !firebaseConfigured || !firestore) return
    let active = true

    async function checkInvites() {
      // Query all teams where this user's email appears in invites
      // Firestore doesn't support array-of-object queries directly,
      // so we use the locally-synced teams + any teams stored in Firestore
      // that we know about via prior syncs.
      //
      // For discovery of new teams (where we haven't synced yet), we store
      // a lookup document at /inviteIndex/{email} = [{teamId}] written by the inviter.
      try {
        const snap = await getDocs(
          query(collection(firestore!, 'inviteIndex'), where('email', '==', user!.email))
        )

        const invites: PendingInvite[] = []
        for (const indexDoc of snap.docs) {
          const { teamId } = indexDoc.data() as { email: string; teamId: string }
          const teamSnap = await getDocs(collection(firestore!, 'teams'))
          for (const ts of teamSnap.docs) {
            const team = ts.data() as Team
            const invite = team.invites?.find(i => i.email === user!.email)
            if (invite && !dismissed.has(team.id)) {
              invites.push({ team, role: invite.role })
            }
          }
          // Suppress unused variable warning
          void teamId
        }

        // Also check all Firestore teams for this email (simpler approach)
        const allTeamsSnap = await getDocs(collection(firestore!, 'teams'))
        for (const ts of allTeamsSnap.docs) {
          const team = ts.data() as Team
          const invite = team.invites?.find(i => i.email === user!.email)
          if (invite && !dismissed.has(team.id) && !invites.some(i => i.team.id === team.id)) {
            invites.push({ team, role: invite.role })
          }
        }

        if (active) setPending(invites)
      } catch {
        // Silently fail — user may not have Firestore read access to all teams yet
      }
    }

    checkInvites()
    return () => { active = false }
  }, [user, dismissed])

  const accept = async (invite: PendingInvite) => {
    if (!user || !firestore) return
    const { team, role } = invite
    const newMember: TeamMember = {
      userId: user.id,
      email: user.email,
      displayName: user.displayName,
      role,
    }
    const updated: Team = {
      ...team,
      members: [...(team.members ?? []), newMember],
      invites: (team.invites ?? []).filter(i => i.email !== user.email),
      updatedAt: Date.now(),
    }
    // Update Firestore
    await setDoc(doc(firestore, 'teams', team.id), stripUndefined(updated))
    // Store locally
    await db.teams.put(updated)
    setDismissed(d => new Set([...d, team.id]))
  }

  const decline = async (invite: PendingInvite) => {
    if (!user || !firestore) return
    const updated: Team = {
      ...invite.team,
      invites: (invite.team.invites ?? []).filter(i => i.email !== user.email),
      updatedAt: Date.now(),
    }
    try {
      await updateDoc(doc(firestore, 'teams', invite.team.id), {
        invites: updated.invites,
        updatedAt: updated.updatedAt,
      })
    } catch { /* owner may have revoked */ }
    setDismissed(d => new Set([...d, invite.team.id]))
  }

  const visible = pending.filter(i => !dismissed.has(i.team.id))
  if (visible.length === 0) return null

  return (
    <div className="space-y-2 px-4 py-2">
      {visible.map(invite => (
        <div
          key={invite.team.id}
          className="flex items-center gap-3 bg-chord/10 border border-chord/30 rounded-xl px-4 py-2.5 text-sm"
        >
          <div className="flex-1 min-w-0">
            <span className="font-medium">{invite.team.ownerDisplayName}</span>
            <span className="text-ink-muted"> invited you to join </span>
            <span className="font-medium">{invite.team.name}</span>
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

function stripUndefined<T extends object>(obj: T): T {
  return JSON.parse(JSON.stringify(obj)) as T
}
