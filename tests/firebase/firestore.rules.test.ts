/**
 * Firestore security rules (firestore.rules) — who may read and write what.
 * Runs against the Firestore + Auth emulators: npm run test:firebase
 */

import { describe, it, beforeAll, afterAll } from 'vitest'
import { readFileSync } from 'fs'
import { randomUUID } from 'crypto'
import { initializeTestEnvironment, assertFails, assertSucceeds, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import {
  doc, setDoc, getDoc, getDocs, updateDoc, deleteDoc, addDoc, collection, query, where, Timestamp,
} from 'firebase/firestore'
import { withAccessFields } from '../../src/utils/teamAccess'
import type { Team } from '../../src/types'
import { PROJECT, FIRESTORE, testUser, cleanupUsers, type TestUser } from './helpers'

let env: RulesTestEnvironment
let alice: TestUser, bob: TestUser, carol: TestUser, anon: TestUser

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT,
    firestore: { ...FIRESTORE, rules: readFileSync('firestore.rules', 'utf8') },
  })
  alice = await testUser('rules-alice')
  bob = await testUser('rules-bob')
  carol = await testUser('rules-carol')
  anon = await testUser(null)
})

afterAll(async () => {
  await cleanupUsers()
  await env.cleanup()
})

// ── Personal data ────────────────────────────────────────────────────────────

describe('/users/{uid}', () => {
  it('lets a user read and write their own data', async () => {
    await assertSucceeds(setDoc(doc(alice.db, 'users', alice.uid, 'songs', 's1'), { title: 'Mine' }))
    await assertSucceeds(getDoc(doc(alice.db, 'users', alice.uid, 'songs', 's1')))
  })

  it("keeps other users and anonymous visitors out", async () => {
    await assertFails(getDoc(doc(bob.db, 'users', alice.uid, 'songs', 's1')))
    await assertFails(setDoc(doc(bob.db, 'users', alice.uid, 'songs', 's2'), { title: 'Theirs' }))
    await assertFails(getDoc(doc(anon.db, 'users', alice.uid, 'songs', 's1')))
  })
})

// ── Share links ──────────────────────────────────────────────────────────────

function share(ownerId: string, extra: Record<string, unknown> = {}) {
  const now = Date.now()
  return {
    encoded: 'abc', setlistName: 'Sunday', ownerId,
    createdAt: Timestamp.fromMillis(now), expiresAt: Timestamp.fromMillis(now + 30 * 864e5),
    ...extra,
  }
}

describe('/shares', () => {
  it('lets the owner publish, re-publish and delete; anyone may read', async () => {
    const id = randomUUID()
    await assertSucceeds(setDoc(doc(alice.db, 'shares', id), share(alice.uid)))
    await assertSucceeds(setDoc(doc(alice.db, 'shares', id), share(alice.uid, { encoded: 'new' })))
    await assertSucceeds(getDoc(doc(anon.db, 'shares', id)))
    await assertSucceeds(deleteDoc(doc(alice.db, 'shares', id)))
  })

  it("stops others from overwriting, taking over or deleting someone's share", async () => {
    const id = randomUUID()
    await setDoc(doc(alice.db, 'shares', id), share(alice.uid))
    await assertFails(setDoc(doc(bob.db, 'shares', id), share(bob.uid)))
    await assertFails(setDoc(doc(bob.db, 'shares', id), share(alice.uid)))
    await assertFails(deleteDoc(doc(bob.db, 'shares', id)))
    await assertFails(setDoc(doc(alice.db, 'shares', id), share(bob.uid)))
  })

  it('rejects shares in another name, anonymous shares and malformed documents', async () => {
    await assertFails(setDoc(doc(bob.db, 'shares', randomUUID()), share(alice.uid)))
    await assertFails(setDoc(doc(anon.db, 'shares', randomUUID()), share('x')))
    await assertFails(setDoc(doc(alice.db, 'shares', randomUUID()), share(alice.uid, { evil: 1 })))
    await assertFails(setDoc(doc(alice.db, 'shares', randomUUID()), share(alice.uid, { encoded: 'x'.repeat(900_001) })))
    await assertFails(setDoc(doc(alice.db, 'shares', randomUUID()),
      share(alice.uid, { expiresAt: Timestamp.fromMillis(Date.now() + 90 * 864e5) })))
  })
})

// ── Teams ────────────────────────────────────────────────────────────────────

function newTeam(owner: TestUser, members: Team['members'] = []): Team {
  return {
    id: randomUUID(), name: 'Band', ownerId: owner.uid, ownerEmail: 'o@example.com', ownerDisplayName: 'Owner',
    members, invites: [], createdAt: 1, updatedAt: 1,
  }
}

/** Seed a team (owner = alice, bob = contributor, carol = reader) bypassing rules. */
async function seedTeam(): Promise<Team> {
  const team = withAccessFields(newTeam(alice, [
    { userId: bob.uid, email: 'bob@example.com', displayName: 'Bob', role: 'contributor' },
    { userId: carol.uid, email: 'carol@example.com', displayName: 'Carol', role: 'reader' },
  ]))
  await env.withSecurityRulesDisabled(async ctx => {
    await setDoc(doc(ctx.firestore(), 'teams', team.id), team)
    await setDoc(doc(ctx.firestore(), 'teams', team.id, 'songs', 's1'), { id: 's1', title: 'Team song' })
  })
  return team
}

describe('/teams — team document', () => {
  it('lets a user create a team that contains only themselves', async () => {
    const team = withAccessFields(newTeam(alice))
    await assertSucceeds(setDoc(doc(alice.db, 'teams', team.id), team))
  })

  it('rejects creating a team with other members or in another name', async () => {
    const withMember = withAccessFields(newTeam(bob, [{ userId: alice.uid, email: 'a', displayName: 'A', role: 'reader' }]))
    await assertFails(setDoc(doc(bob.db, 'teams', withMember.id), withMember))
    const forAlice = withAccessFields(newTeam(alice))
    await assertFails(setDoc(doc(bob.db, 'teams', forAlice.id), forAlice))
  })

  it('lets members read the team, and nobody else', async () => {
    const team = await seedTeam()
    await assertSucceeds(getDoc(doc(alice.db, 'teams', team.id)))
    await assertSucceeds(getDoc(doc(bob.db, 'teams', team.id)))
    await assertSucceeds(getDoc(doc(carol.db, 'teams', team.id)))
    const stranger = await testUser('rules-stranger')
    await assertFails(getDoc(doc(stranger.db, 'teams', team.id)))
    await assertFails(getDoc(doc(anon.db, 'teams', team.id)))
  })

  it('does not let anyone list all teams, only their own via memberIds', async () => {
    await seedTeam()
    await assertFails(getDocs(collection(bob.db, 'teams')))
    await assertSucceeds(getDocs(query(collection(bob.db, 'teams'), where('memberIds', 'array-contains', bob.uid))))
    await assertFails(getDocs(query(collection(bob.db, 'teams'), where('memberIds', 'array-contains', alice.uid))))
  })

  it('lets only the owner change the team; ownership cannot move', async () => {
    const team = await seedTeam()
    await assertSucceeds(updateDoc(doc(alice.db, 'teams', team.id), { name: 'Renamed' }))
    await assertFails(updateDoc(doc(bob.db, 'teams', team.id), { name: 'Hijacked' }))
    await assertFails(setDoc(doc(alice.db, 'teams', team.id), withAccessFields({ ...team, ownerId: bob.uid })))
  })

  it('stops a stranger from adding themselves or taking over', async () => {
    const team = await seedTeam()
    const stranger = await testUser('rules-intruder')
    const joined = withAccessFields({
      ...team,
      members: [...team.members, { userId: stranger.uid, email: 'x', displayName: 'X', role: 'contributor' }],
    })
    await assertFails(setDoc(doc(stranger.db, 'teams', team.id), joined))
    await assertFails(setDoc(doc(stranger.db, 'teams', team.id), withAccessFields({ ...team, ownerId: stranger.uid })))
    await assertFails(deleteDoc(doc(stranger.db, 'teams', team.id)))
  })

  it('removes access as soon as the owner removes a member', async () => {
    const team = await seedTeam()
    await setDoc(doc(alice.db, 'teams', team.id), withAccessFields({
      ...team, members: team.members.filter(m => m.userId !== bob.uid),
    }))
    await assertFails(getDoc(doc(bob.db, 'teams', team.id)))
    await assertFails(setDoc(doc(bob.db, 'teams', team.id, 'songs', 'x'), { id: 'x' }))
  })

  it('keeps pre-migration teams reachable by their owner until backfilled', async () => {
    const legacy = newTeam(alice, [{ userId: bob.uid, email: 'bob@example.com', displayName: 'Bob', role: 'contributor' }])
    await env.withSecurityRulesDisabled(ctx => setDoc(doc(ctx.firestore(), 'teams', legacy.id), legacy))
    await assertFails(getDoc(doc(bob.db, 'teams', legacy.id)))
    await assertSucceeds(getDoc(doc(alice.db, 'teams', legacy.id)))
    await assertSucceeds(setDoc(doc(alice.db, 'teams', legacy.id), withAccessFields(legacy)))
    await assertSucceeds(getDoc(doc(bob.db, 'teams', legacy.id)))
  })
})

describe('/teams — team songs and setlists', () => {
  it('lets owners and contributors write, readers only read', async () => {
    const team = await seedTeam()
    const song = (u: TestUser, id: string) => doc(u.db, 'teams', team.id, 'songs', id)
    await assertSucceeds(setDoc(song(alice, 'a'), { id: 'a' }))
    await assertSucceeds(setDoc(song(bob, 'b'), { id: 'b' }))
    await assertSucceeds(getDocs(collection(carol.db, 'teams', team.id, 'songs')))
    await assertFails(setDoc(song(carol, 'c'), { id: 'c' }))
    await assertFails(deleteDoc(song(carol, 's1')))
  })

  it('lets readers flag personal notes via noteIndicators', async () => {
    const team = await seedTeam()
    await assertSucceeds(setDoc(doc(carol.db, 'teams', team.id, 'noteIndicators', 's1'), { songId: 's1', hasNotes: true }))
  })

  it('keeps non-members out of every team subcollection', async () => {
    const team = await seedTeam()
    const stranger = await testUser('rules-outsider')
    for (const coll of ['songs', 'books', 'setlists', 'setlistItems', 'deletions', 'noteIndicators']) {
      await assertFails(getDocs(collection(stranger.db, 'teams', team.id, coll)))
      await assertFails(setDoc(doc(stranger.db, 'teams', team.id, coll, 'x'), { id: 'x' }))
    }
  })
})

// ── Feedback ─────────────────────────────────────────────────────────────────

function feedback(userId: string, extra: Record<string, unknown> = {}) {
  return {
    stars: 4, category: 'bug', message: 'Chords overlap on iPad', userId,
    userEmail: 'a@example.com', displayName: 'A', appVersion: '0.1.0', language: 'de', submittedAt: Date.now(),
    ...extra,
  }
}

describe('/feedback', () => {
  it('accepts well-formed feedback from a signed-in user in their own name', async () => {
    await assertSucceeds(addDoc(collection(alice.db, 'feedback'), feedback(alice.uid)))
  })

  it('is write-only: nobody can read, change or delete feedback from the client', async () => {
    const ref = await addDoc(collection(alice.db, 'feedback'), feedback(alice.uid))
    await assertFails(getDoc(ref))
    await assertFails(getDocs(collection(alice.db, 'feedback')))
    await assertFails(updateDoc(ref, { stars: 1 }))
    await assertFails(deleteDoc(ref))
  })

  it('rejects anonymous, impersonated and malformed feedback', async () => {
    await assertFails(addDoc(collection(anon.db, 'feedback'), feedback('anonymous')))
    await assertFails(addDoc(collection(bob.db, 'feedback'), feedback(alice.uid)))
    await assertFails(addDoc(collection(alice.db, 'feedback'), feedback(alice.uid, { stars: 9 })))
    await assertFails(addDoc(collection(alice.db, 'feedback'), feedback(alice.uid, { category: 'spam' })))
    await assertFails(addDoc(collection(alice.db, 'feedback'), feedback(alice.uid, { message: 'x'.repeat(5001) })))
    await assertFails(addDoc(collection(alice.db, 'feedback'), feedback(alice.uid, { extra: true })))
  })
})

// ── Everything else ──────────────────────────────────────────────────────────

describe('unlisted collections', () => {
  it('are denied by default', async () => {
    await assertFails(setDoc(doc(alice.db, 'inviteIndex', 'x'), { email: 'a' }))
    await assertFails(getDocs(collection(alice.db, 'anything')))
  })
})
