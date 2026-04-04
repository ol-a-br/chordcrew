/**
 * Firestore manual sync — last-write-wins based on updatedAt.
 *
 * Personal paths:
 *   /users/{uid}/books/{id}
 *   /users/{uid}/songs/{id}
 *   /users/{uid}/setlists/{id}
 *   /users/{uid}/setlistItems/{id}
 *
 * Team paths (shared across all members):
 *   /teams/{teamId}          — team document (members, invites)
 *   /teams/{teamId}/songs/{id}
 *   /teams/{teamId}/setlists/{id}
 *   /teams/{teamId}/setlistItems/{id}
 *
 * Rules:
 * - Upload: push every entity whose SyncState.status === 'pending'
 * - Download: fetch all remote docs, upsert locally if remote.updatedAt > local.updatedAt
 * - SetlistItems have no updatedAt — always upsert from remote
 * - After successful sync, mark SyncStates as 'clean'
 */

import {
  collection, doc, setDoc, getDocs, getDoc, deleteDoc,
} from 'firebase/firestore'
import { firestore } from '@/firebase'
import { db } from '@/db'
import type { Book, Song, Setlist, SetlistItem, Team } from '@/types'

// ─── Upload ───────────────────────────────────────────────────────────────────

async function uploadPending(userId: string): Promise<void> {
  const pending = await db.syncStates.where('status').equals('pending').toArray()
  if (pending.length === 0) return

  // Find which teams this user belongs to (for team-scoped uploads)
  const allTeams = await db.teams.toArray()
  const myTeamIds = new Set(
    allTeams
      .filter(t => t.ownerId === userId || t.members.some(m => m.userId === userId))
      .map(t => t.id)
  )

  for (const state of pending) {
    const { entityType, entityId } = state
    try {
      if (entityType === 'song') {
        const entity = await db.songs.get(entityId)
        if (entity) {
          // Write to personal space; also to team space if song belongs to a team
          await setDoc(doc(firestore!, 'users', userId, 'songs', entityId), stripUndefined(entity))
          if (entity.bookId) {
            const book = await db.books.get(entity.bookId)
            if (book?.sharedTeamId && myTeamIds.has(book.sharedTeamId)) {
              await setDoc(doc(firestore!, 'teams', book.sharedTeamId, 'songs', entityId), stripUndefined(entity))
            }
          }
        }
      } else if (entityType === 'book') {
        const entity = await db.books.get(entityId)
        if (entity) {
          await setDoc(doc(firestore!, 'users', userId, 'books', entityId), stripUndefined(entity))
          if (entity.sharedTeamId && myTeamIds.has(entity.sharedTeamId)) {
            await setDoc(doc(firestore!, 'teams', entity.sharedTeamId, 'books', entityId), stripUndefined(entity))
          }
        }
      } else if (entityType === 'setlist') {
        const entity = await db.setlists.get(entityId)
        if (entity) {
          const target = entity.sharedTeamId && myTeamIds.has(entity.sharedTeamId)
            ? doc(firestore!, 'teams', entity.sharedTeamId, 'setlists', entityId)
            : doc(firestore!, 'users', userId, 'setlists', entityId)
          await setDoc(target, stripUndefined(entity))
          // Also upload all items for this setlist
          const items = await db.setlistItems.where('setlistId').equals(entityId).toArray()
          const itemsBase = entity.sharedTeamId && myTeamIds.has(entity.sharedTeamId)
            ? `teams/${entity.sharedTeamId}`
            : `users/${userId}`
          await Promise.all(items.map(item =>
            setDoc(doc(firestore!, itemsBase, 'setlistItems', item.id), stripUndefined(item))
          ))
        }
      }

      await db.syncStates.put({
        ...state,
        syncedVersion: state.localVersion,
        status: 'clean',
        updatedAt: Date.now(),
      })
    } catch (err) {
      console.error(`Failed to sync ${entityType}:${entityId}`, err)
      throw err
    }
  }
}

// ─── Download ─────────────────────────────────────────────────────────────────

async function downloadPersonal(userId: string): Promise<void> {
  // Books
  const remoteBooks = await getDocs(collection(firestore!, 'users', userId, 'books'))
  for (const snap of remoteBooks.docs) {
    const remote = snap.data() as Book
    const local = await db.books.get(remote.id)
    if (!local || remote.updatedAt > local.updatedAt) await db.books.put(remote)
  }

  // Songs
  const remoteSongs = await getDocs(collection(firestore!, 'users', userId, 'songs'))
  for (const snap of remoteSongs.docs) {
    const remote = snap.data() as Song
    const local = await db.songs.get(remote.id)
    if (!local || remote.updatedAt > local.updatedAt) {
      await db.songs.put(remote)
      await db.syncStates.put({
        id: `song:${remote.id}`, entityType: 'song', entityId: remote.id,
        localVersion: 1, syncedVersion: 1, status: 'clean', updatedAt: Date.now(),
      })
    }
  }

  // Setlists
  const remoteSetlists = await getDocs(collection(firestore!, 'users', userId, 'setlists'))
  for (const snap of remoteSetlists.docs) {
    const remote = snap.data() as Setlist
    const local = await db.setlists.get(remote.id)
    if (!local || remote.updatedAt > local.updatedAt) {
      await db.setlists.put(remote)
      await db.syncStates.put({
        id: `setlist:${remote.id}`, entityType: 'setlist', entityId: remote.id,
        localVersion: 1, syncedVersion: 1, status: 'clean', updatedAt: Date.now(),
      })
    }
  }

  // SetlistItems — no conflict tracking, always upsert remote
  const remoteItems = await getDocs(collection(firestore!, 'users', userId, 'setlistItems'))
  for (const snap of remoteItems.docs) {
    await db.setlistItems.put(snap.data() as SetlistItem)
  }
}

async function downloadTeams(userId: string, userEmail: string): Promise<void> {
  // Get all local teams to know which team spaces to sync
  const localTeams = await db.teams.toArray()
  const myTeamIds = localTeams
    .filter(t => t.ownerId === userId || t.members.some(m => m.userId === userId || m.email === userEmail))
    .map(t => t.id)

  // Also check Firestore for teams where this user is an accepted member
  // (they may have accepted an invite on another device)
  for (const teamId of myTeamIds) {
    const teamSnap = await getDoc(doc(firestore!, 'teams', teamId))
    if (!teamSnap.exists()) continue

    const remoteTeam = teamSnap.data() as Team
    const localTeam = await db.teams.get(remoteTeam.id)
    if (!localTeam || remoteTeam.updatedAt > localTeam.updatedAt) {
      await db.teams.put(remoteTeam)
    }

    // Team songs
    const teamSongs = await getDocs(collection(firestore!, 'teams', teamId, 'songs'))
    for (const snap of teamSongs.docs) {
      const remote = snap.data() as Song
      const local = await db.songs.get(remote.id)
      if (!local || remote.updatedAt > local.updatedAt) await db.songs.put(remote)
    }

    // Team setlists + items
    const teamSetlists = await getDocs(collection(firestore!, 'teams', teamId, 'setlists'))
    for (const snap of teamSetlists.docs) {
      const remote = snap.data() as Setlist
      const local = await db.setlists.get(remote.id)
      if (!local || remote.updatedAt > local.updatedAt) await db.setlists.put(remote)
    }
    const teamItems = await getDocs(collection(firestore!, 'teams', teamId, 'setlistItems'))
    for (const snap of teamItems.docs) {
      await db.setlistItems.put(snap.data() as SetlistItem)
    }
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function syncNow(userId: string, userEmail: string): Promise<void> {
  if (!firestore) throw new Error('Firestore not configured')
  await uploadPending(userId)
  await downloadPersonal(userId)
  await downloadTeams(userId, userEmail)
}

/** Write a team document to Firestore (called after creating/updating a team). */
export async function syncTeam(team: Team): Promise<void> {
  if (!firestore) return
  await setDoc(doc(firestore, 'teams', team.id), stripUndefined(team))
}

// ─── Delete helpers (best-effort, non-blocking) ────────────────────────────────

/**
 * Delete a song from Firestore (personal space + optional team space).
 * Called after `db.songs.delete` so the cloud copy is removed on next opportunity.
 * Failures are swallowed — the local delete already happened.
 */
export async function deleteSongFromCloud(
  songId: string,
  userId: string,
  teamId?: string
): Promise<void> {
  if (!firestore) return
  try {
    await deleteDoc(doc(firestore, 'users', userId, 'songs', songId))
    if (teamId) await deleteDoc(doc(firestore, 'teams', teamId, 'songs', songId))
  } catch { /* best-effort */ }
}

/**
 * Delete a setlist (and its items) from Firestore.
 */
export async function deleteSetlistFromCloud(
  setlistId: string,
  userId: string,
  teamId?: string
): Promise<void> {
  if (!firestore) return
  try {
    const base = teamId ? ['teams', teamId] as const : ['users', userId] as const
    await deleteDoc(doc(firestore, base[0], base[1], 'setlists', setlistId))
  } catch { /* best-effort */ }
}

// ─── Util ─────────────────────────────────────────────────────────────────────

function stripUndefined<T extends object>(obj: T): T {
  return JSON.parse(JSON.stringify(obj)) as T
}
