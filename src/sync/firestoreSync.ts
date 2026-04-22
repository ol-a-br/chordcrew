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
  query, where, limit,
} from 'firebase/firestore'
import { firestore } from '@/firebase'
import { db } from '@/db'
import type { Book, Song, Setlist, SetlistItem, Team, SongNote } from '@/types'

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
          const remoteRef = doc(firestore!, 'users', userId, 'songs', entityId)
          const remoteSnap = await getDoc(remoteRef)
          const remote = remoteSnap.exists() ? (remoteSnap.data() as Song) : null

          if (remote && remote.updatedAt > entity.updatedAt) {
            // Remote is newer — pull it down instead of overwriting it with stale local data.
            // Preserve accessedAt (a device-local field that doesn't affect content).
            await db.songs.put(stripUndefined({ ...remote, accessedAt: entity.accessedAt ?? remote.accessedAt }))
          } else {
            // Local is newer (or no remote exists) — upload
            await setDoc(remoteRef, stripUndefined(entity))
            if (entity.bookId) {
              const book = await db.books.get(entity.bookId)
              if (book?.sharedTeamId && myTeamIds.has(book.sharedTeamId)) {
                await setDoc(doc(firestore!, 'teams', book.sharedTeamId, 'songs', entityId), stripUndefined(entity))
              }
            }
          }
        }
      } else if (entityType === 'book') {
        const entity = await db.books.get(entityId)
        if (entity) {
          const remoteRef = doc(firestore!, 'users', userId, 'books', entityId)
          const remoteSnap = await getDoc(remoteRef)
          const remote = remoteSnap.exists() ? (remoteSnap.data() as Book) : null

          if (remote && remote.updatedAt > entity.updatedAt) {
            await db.books.put(remote)
          } else {
            await setDoc(remoteRef, stripUndefined(entity))
            if (entity.sharedTeamId && myTeamIds.has(entity.sharedTeamId)) {
              await setDoc(doc(firestore!, 'teams', entity.sharedTeamId, 'books', entityId), stripUndefined(entity))
            }
          }
        }
      } else if (entityType === 'setlist') {
        const entity = await db.setlists.get(entityId)
        if (entity) {
          const isTeam = !!(entity.sharedTeamId && myTeamIds.has(entity.sharedTeamId))
          const remoteRef = isTeam
            ? doc(firestore!, 'teams', entity.sharedTeamId!, 'setlists', entityId)
            : doc(firestore!, 'users', userId, 'setlists', entityId)
          const remoteSnap = await getDoc(remoteRef)
          const remote = remoteSnap.exists() ? (remoteSnap.data() as Setlist) : null

          if (remote && remote.updatedAt > entity.updatedAt) {
            // Remote setlist is newer — download it; items will be refreshed in downloadPersonal
            await db.setlists.put(stripUndefined({ ...remote, accessedAt: entity.accessedAt ?? remote.accessedAt }))
          } else {
            await setDoc(remoteRef, stripUndefined(entity))
            const items = await db.setlistItems.where('setlistId').equals(entityId).toArray()
            const itemsBase = isTeam ? `teams/${entity.sharedTeamId}` : `users/${userId}`
            await Promise.all(items.map(item =>
              setDoc(doc(firestore!, itemsBase, 'setlistItems', item.id), stripUndefined(item))
            ))
          }
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

async function downloadPersonal(userId: string): Promise<Set<string>> {
  // Books — return discovered team IDs so downloadTeams can sync them even on
  // a fresh device where local Dexie has no teams yet.
  //
  // Books and setlists are always written from Firestore regardless of local
  // updatedAt: they're small, upload always runs before download in syncNow,
  // and the updatedAt guard caused stale local copies to survive indefinitely.
  // The only exception: skip if a 'pending' syncState exists (local unsaved changes).
  const discoveredTeamIds = new Set<string>()
  const remoteBooks = await getDocs(collection(firestore!, 'users', userId, 'books'))
  for (const snap of remoteBooks.docs) {
    const remote = snap.data() as Book
    const syncState = await db.syncStates.get(`book:${remote.id}`)
    if (syncState?.status !== 'pending') {
      await db.books.put(remote)
    }
    if (remote.sharedTeamId) discoveredTeamIds.add(remote.sharedTeamId)
  }

  // Songs — skip if still pending (uploadPending should have resolved it, but guard defensively)
  const remoteSongs = await getDocs(collection(firestore!, 'users', userId, 'songs'))
  for (const snap of remoteSongs.docs) {
    const remote = snap.data() as Song
    const local = await db.songs.get(remote.id)
    const syncState = await db.syncStates.get(`song:${remote.id}`)
    if (syncState?.status === 'pending') continue  // uploadPending already handled or will handle
    if (!local || remote.updatedAt > local.updatedAt) {
      // Preserve device-local accessedAt when pulling remote content
      await db.songs.put(stripUndefined({ ...remote, accessedAt: local?.accessedAt ?? remote.accessedAt }))
      await db.syncStates.put({
        id: `song:${remote.id}`, entityType: 'song', entityId: remote.id,
        localVersion: 1, syncedVersion: 1, status: 'clean', updatedAt: Date.now(),
      })
    }
  }

  // Setlists — same always-download approach as books
  const remoteSetlists = await getDocs(collection(firestore!, 'users', userId, 'setlists'))
  for (const snap of remoteSetlists.docs) {
    const remote = snap.data() as Setlist
    const syncState = await db.syncStates.get(`setlist:${remote.id}`)
    if (syncState?.status !== 'pending') {
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

  // Notes — always download; they are user-private and small
  const remoteNotes = await getDocs(collection(firestore!, 'users', userId, 'notes'))
  for (const snap of remoteNotes.docs) {
    const remote = snap.data() as SongNote
    const local = await db.songNotes.get(remote.id)
    if (!local || remote.updatedAt > local.updatedAt) {
      await db.songNotes.put(remote)
    }
  }

  return discoveredTeamIds
}

async function downloadTeams(userId: string, userEmail: string, discoveredTeamIds: Set<string>): Promise<void> {
  // Merge local known teams + teams discovered from personal books during downloadPersonal.
  // On a fresh device, localTeams is empty — discoveredTeamIds bridges that gap.
  const localTeams = await db.teams.toArray()
  const localTeamIds = localTeams
    .filter(t => t.ownerId === userId || t.members.some(m => m.userId === userId || m.email === userEmail))
    .map(t => t.id)
  const myTeamIds = [...new Set([...localTeamIds, ...discoveredTeamIds])]

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

/**
 * Fetch note indicators for a specific team song (for the editor badge).
 * Returns true if any team member has notes for this song.
 */
export async function fetchTeamNoteIndicator(teamId: string, songId: string): Promise<boolean> {
  if (!firestore) return false
  try {
    const snap = await getDoc(doc(firestore, 'teams', teamId, 'noteIndicators', songId))
    return snap.exists() && snap.data()?.hasNotes === true
  } catch { return false }
}

// ─── Repair: upload orphaned local entities ────────────────────────────────────
//
// Entities created by the importer before markPending calls were added have no
// SyncState entry → they were never uploaded to Firestore → invisible on other
// devices.  This repair runs once (guarded by localStorage) and uploads any
// book / song / setlist that lacks a SyncState.

// v2: uses getDoc to verify actual Firestore presence instead of trusting syncState history.
// This handles the case where v1 set its flag on a device before the source device had
// uploaded, leaving Firestore empty for personal books/setlists.
const REPAIR_FLAG = 'chordcrew-repair-v2'

async function repairOrphaned(userId: string): Promise<void> {
  if (localStorage.getItem(REPAIR_FLAG)) return   // already done on this device
  if (!firestore) return

  // Build myTeamIds from local teams + sharedTeamId refs in local books
  const allBooks = await db.books.toArray()
  const allTeams = await db.teams.toArray()
  const myTeamIds = new Set([
    ...allTeams
      .filter(t => t.ownerId === userId || t.members.some(m => m.userId === userId))
      .map(t => t.id),
    ...allBooks.map(b => b.sharedTeamId).filter(Boolean) as string[],
  ])

  // ── Books: upload any book not present in Firestore ──
  for (const book of allBooks) {
    const snap = await getDoc(doc(firestore, 'users', userId, 'books', book.id))
    if (snap.exists()) continue   // already in Firestore — nothing to do
    await setDoc(doc(firestore, 'users', userId, 'books', book.id), stripUndefined(book))
    if (book.sharedTeamId && myTeamIds.has(book.sharedTeamId)) {
      await setDoc(doc(firestore, 'teams', book.sharedTeamId, 'books', book.id), stripUndefined(book))
    }
    await db.syncStates.put({
      id: `book:${book.id}`, entityType: 'book', entityId: book.id,
      localVersion: 1, syncedVersion: 1, status: 'clean', updatedAt: Date.now(),
    })
  }

  // ── Songs: upload any song not present in Firestore ──
  const allSongs = await db.songs.toArray()
  const bookTeamMap = new Map(allBooks.filter(b => b.sharedTeamId).map(b => [b.id, b.sharedTeamId!]))
  for (const song of allSongs) {
    const snap = await getDoc(doc(firestore, 'users', userId, 'songs', song.id))
    if (snap.exists()) continue
    await setDoc(doc(firestore, 'users', userId, 'songs', song.id), stripUndefined(song))
    const teamId = bookTeamMap.get(song.bookId)
    if (teamId && myTeamIds.has(teamId)) {
      await setDoc(doc(firestore, 'teams', teamId, 'songs', song.id), stripUndefined(song))
    }
    await db.syncStates.put({
      id: `song:${song.id}`, entityType: 'song', entityId: song.id,
      localVersion: 1, syncedVersion: 1, status: 'clean', updatedAt: Date.now(),
    })
  }

  // ── Setlists: upload any setlist not present in Firestore ──
  const allSetlists = await db.setlists.toArray()
  for (const setlist of allSetlists) {
    const target = setlist.sharedTeamId && myTeamIds.has(setlist.sharedTeamId)
      ? doc(firestore, 'teams', setlist.sharedTeamId, 'setlists', setlist.id)
      : doc(firestore, 'users', userId, 'setlists', setlist.id)
    const snap = await getDoc(target)
    if (snap.exists()) continue
    await setDoc(target, stripUndefined(setlist))
    const items = await db.setlistItems.where('setlistId').equals(setlist.id).toArray()
    const itemsBase = setlist.sharedTeamId && myTeamIds.has(setlist.sharedTeamId)
      ? `teams/${setlist.sharedTeamId}`
      : `users/${userId}`
    await Promise.all(items.map(item =>
      setDoc(doc(firestore!, itemsBase, 'setlistItems', item.id), stripUndefined(item))
    ))
    await db.syncStates.put({
      id: `setlist:${setlist.id}`, entityType: 'setlist', entityId: setlist.id,
      localVersion: 1, syncedVersion: 1, status: 'clean', updatedAt: Date.now(),
    })
  }

  localStorage.setItem(REPAIR_FLAG, '1')
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function syncNow(userId: string, userEmail: string): Promise<void> {
  if (!firestore) throw new Error('Firestore not configured')
  await repairOrphaned(userId)
  await uploadPending(userId)
  const discoveredTeamIds = await downloadPersonal(userId)
  await downloadTeams(userId, userEmail, discoveredTeamIds)
}

/** Write a team document to Firestore (called after creating/updating a team). */
export async function syncTeam(team: Team): Promise<void> {
  if (!firestore) return
  await setDoc(doc(firestore, 'teams', team.id), stripUndefined(team))
}

/**
 * Upload a single song note to Firestore (personal path) and optionally
 * write/remove a team note indicator so worship leaders know notes exist.
 */
export async function syncNote(
  note: SongNote,
  userId: string,
  teamId?: string
): Promise<void> {
  if (!firestore) return
  await setDoc(doc(firestore, 'users', userId, 'notes', note.id), stripUndefined(note))
  if (teamId) {
    // The indicator just marks that *someone* has a note; content never leaves personal space
    await setDoc(
      doc(firestore, 'teams', teamId, 'noteIndicators', note.songId),
      { songId: note.songId, hasNotes: true, updatedAt: Date.now() }
    )
  }
}

/**
 * Delete a note from Firestore. If no other team member has a note for this song,
 * also removes the team indicator (best-effort).
 */
export async function deleteNoteFromCloud(
  noteId: string,
  songId: string,
  userId: string,
  teamId?: string
): Promise<void> {
  if (!firestore) return
  try {
    await deleteDoc(doc(firestore, 'users', userId, 'notes', noteId))
    if (teamId) {
      // Remove indicator only if no other notes for this song exist in the team space.
      // We can't enumerate others' private notes, so we just delete it — if another
      // member still has a note, their next sync will re-create the indicator.
      await deleteDoc(doc(firestore, 'teams', teamId, 'noteIndicators', songId))
    }
  } catch { /* best-effort */ }
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

// ─── Cloud update check ────────────────────────────────────────────────────────

/**
 * Lightweight check: does Firestore have any personal entity (book/song/setlist)
 * with updatedAt > lastSync? Fetches at most 1 document per collection.
 * Returns true if an update is found.
 */
export async function checkForCloudUpdates(userId: string, lastSync: number): Promise<boolean> {
  if (!firestore) return false
  const colls = ['books', 'songs', 'setlists'] as const
  for (const coll of colls) {
    const q = query(
      collection(firestore, 'users', userId, coll),
      where('updatedAt', '>', lastSync),
      limit(1)
    )
    const snap = await getDocs(q)
    if (!snap.empty) return true
  }
  return false
}

// ─── Util ─────────────────────────────────────────────────────────────────────

function stripUndefined<T extends object>(obj: T): T {
  return JSON.parse(JSON.stringify(obj)) as T
}
