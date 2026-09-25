/**
 * Team invite Cloud Functions (functions/src/teams.ts): the only way a
 * non-owner can become a team member. Runs against the Firestore, Auth and
 * Functions emulators: npm run test:firebase
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { randomUUID } from 'crypto'
import { doc, setDoc, getDoc } from 'firebase/firestore'
import { withAccessFields } from '../../src/utils/teamAccess'
import type { Team } from '../../src/types'
import { testUser, cleanupUsers, type TestUser } from './helpers'

interface Preview { teamName: string; role: string | null; alreadyMember: boolean }
interface Invite { teamId: string; teamName: string; role: string }

let owner: TestUser

beforeAll(async () => {
  owner = await testUser('inv-owner', 'owner@example.com')
})

afterAll(cleanupUsers)

/** Create a team owned by `owner` with the given invites (through the rules). */
async function createTeam(invites: Team['invites']): Promise<Team> {
  const team = withAccessFields({
    id: randomUUID(), name: 'Worship Band', ownerId: owner.uid, ownerEmail: 'owner@example.com',
    ownerDisplayName: 'Owner', members: [], invites: [], createdAt: 1, updatedAt: 1,
  })
  await setDoc(doc(owner.db, 'teams', team.id), team)
  const invited = withAccessFields({ ...team, invites, updatedAt: 2 })
  await setDoc(doc(owner.db, 'teams', team.id), invited)
  return invited
}

const linkInvite = (token: string) => ({ email: '', role: 'contributor' as const, invitedAt: 1, token })
const emailInvite = (email: string) => ({ email, role: 'reader' as const, invitedAt: 1 })

describe('link invites', () => {
  it('shows the team to anyone holding the token, even before sign-in', async () => {
    const team = await createTeam([linkInvite('tok-preview')])
    const anon = await testUser(null)
    const preview = await anon.call<Preview>('previewInvite', { teamId: team.id, token: 'tok-preview' })
    expect(preview).toMatchObject({ teamName: 'Worship Band', role: 'contributor', alreadyMember: false })
  })

  it('reveals nothing for a wrong token or an unknown team', async () => {
    const team = await createTeam([linkInvite('tok-secret')])
    const guest = await testUser('inv-guest')
    await expect(guest.call('previewInvite', { teamId: team.id })).rejects.toThrow()
    await expect(guest.call('previewInvite', { teamId: team.id, token: 'wrong' })).rejects.toThrow()
    await expect(guest.call('previewInvite', { teamId: 'no-such-team', token: 'tok-secret' })).rejects.toThrow()
    await expect(guest.call('acceptInvite', { teamId: team.id, token: 'wrong' })).rejects.toThrow()
  })

  it('adds the user with the invited role and consumes the token', async () => {
    const team = await createTeam([linkInvite('tok-join')])
    const joiner = await testUser('inv-joiner')
    const joined = await joiner.call<Team>('acceptInvite', { teamId: team.id, token: 'tok-join' })
    expect(joined.roles?.[joiner.uid]).toBe('contributor')
    expect(joined.invites.some(i => i.token)).toBe(false)
    expect((await getDoc(doc(joiner.db, 'teams', team.id))).exists()).toBe(true)

    const latecomer = await testUser('inv-latecomer')
    await expect(latecomer.call('acceptInvite', { teamId: team.id, token: 'tok-join' })).rejects.toThrow()
  })

  it('requires sign-in to accept', async () => {
    const team = await createTeam([linkInvite('tok-auth')])
    const anon = await testUser(null)
    await expect(anon.call('acceptInvite', { teamId: team.id, token: 'tok-auth' })).rejects.toThrow()
  })
})

describe('email invites', () => {
  it('lists, and lets the invited user accept, their own invite only', async () => {
    const team = await createTeam([emailInvite('inv-carol@example.com')])
    const carol = await testUser('inv-carol', 'inv-carol@example.com')
    const other = await testUser('inv-other', 'inv-other@example.com')

    const invites = await carol.call<Invite[]>('listMyInvites')
    expect(invites).toContainEqual({ teamId: team.id, teamName: 'Worship Band', ownerDisplayName: 'Owner', role: 'reader' })
    expect(await other.call<Invite[]>('listMyInvites')).not.toContainEqual(expect.objectContaining({ teamId: team.id }))
    await expect(other.call('acceptInvite', { teamId: team.id })).rejects.toThrow()

    const joined = await carol.call<Team>('acceptInvite', { teamId: team.id })
    expect(joined.roles?.[carol.uid]).toBe('reader')
    expect(joined.inviteEmails).not.toContain('inv-carol@example.com')
  })

  it('does not let an unverified email address claim an invite', async () => {
    const team = await createTeam([emailInvite('inv-frank@example.com')])
    const impostor = await testUser('inv-impostor', 'inv-frank@example.com', false)
    expect(await impostor.call<Invite[]>('listMyInvites')).toEqual([])
    await expect(impostor.call('acceptInvite', { teamId: team.id })).rejects.toThrow()
  })

  it('removes a declined invite for good', async () => {
    const team = await createTeam([emailInvite('inv-erin@example.com')])
    const erin = await testUser('inv-erin', 'inv-erin@example.com')
    await erin.call('declineInvite', { teamId: team.id })
    expect(await erin.call<Invite[]>('listMyInvites')).not.toContainEqual(expect.objectContaining({ teamId: team.id }))
    await expect(erin.call('acceptInvite', { teamId: team.id })).rejects.toThrow()
  })
})
