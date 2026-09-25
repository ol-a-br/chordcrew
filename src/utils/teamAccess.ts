import type { Team, TeamMemberRole } from '@/types'

/**
 * Recompute the access-control fields of a team document from its members,
 * invites and owner. Firestore rules read `memberIds` (who may read the team)
 * and `roles` (who may write team songs/setlists), and the invite Cloud
 * Functions query `inviteEmails` — so every write of a team document must go
 * through this function. Mirrored in functions/src/teams.ts; keep both in sync.
 */
export function withAccessFields(team: Team): Team {
  const roles: Record<string, TeamMemberRole> = {}
  for (const m of team.members) {
    if (m.userId) roles[m.userId] = m.role
  }
  roles[team.ownerId] = 'owner'

  const inviteEmails = [...new Set(
    team.invites
      .filter(i => !i.token && i.email)
      .map(i => i.email.trim().toLowerCase())
  )]

  return { ...team, memberIds: Object.keys(roles), roles, inviteEmails }
}

/** True when the user may create, edit or delete a team's songs and setlists. */
export function canEditTeamContent(team: Team, userId: string): boolean {
  if (team.ownerId === userId) return true
  const role = team.members.find(m => m.userId === userId)?.role
  return role === 'owner' || role === 'contributor'
}
