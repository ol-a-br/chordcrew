import { describe, it, expect } from 'vitest'
import { withAccessFields, canEditTeamContent } from './teamAccess'
import type { Team } from '@/types'

const BASE: Team = {
  id: 't1',
  name: 'Band',
  ownerId: 'owner',
  ownerEmail: 'owner@example.com',
  ownerDisplayName: 'Owner',
  members: [
    { userId: 'c1', email: 'c1@example.com', displayName: 'C1', role: 'contributor' },
    { userId: 'r1', email: 'r1@example.com', displayName: 'R1', role: 'reader' },
  ],
  invites: [
    { email: 'New@Example.com', role: 'reader', invitedAt: 1 },
    { email: '', role: 'contributor', invitedAt: 2, token: 'tok' },
  ],
  createdAt: 1,
  updatedAt: 1,
}

describe('withAccessFields', () => {
  it('derives memberIds and roles from owner + members', () => {
    const t = withAccessFields(BASE)
    expect(t.memberIds?.sort()).toEqual(['c1', 'owner', 'r1'])
    expect(t.roles).toEqual({ owner: 'owner', c1: 'contributor', r1: 'reader' })
  })

  it('lists only email invites, lower-cased, excluding link invites', () => {
    expect(withAccessFields(BASE).inviteEmails).toEqual(['new@example.com'])
  })

  it('always keeps the owner as owner, even if listed as a member', () => {
    const t = withAccessFields({
      ...BASE,
      members: [{ userId: 'owner', email: 'o', displayName: 'O', role: 'reader' }],
    })
    expect(t.roles).toEqual({ owner: 'owner' })
    expect(t.memberIds).toEqual(['owner'])
  })

  it('overwrites stale access fields instead of merging them', () => {
    const stale = { ...BASE, memberIds: ['removed'], roles: { removed: 'contributor' as const } }
    const t = withAccessFields(stale)
    expect(t.memberIds).not.toContain('removed')
    expect(t.roles).not.toHaveProperty('removed')
  })
})

describe('canEditTeamContent', () => {
  it('allows owner and contributors, not readers or strangers', () => {
    expect(canEditTeamContent(BASE, 'owner')).toBe(true)
    expect(canEditTeamContent(BASE, 'c1')).toBe(true)
    expect(canEditTeamContent(BASE, 'r1')).toBe(false)
    expect(canEditTeamContent(BASE, 'stranger')).toBe(false)
  })
})
