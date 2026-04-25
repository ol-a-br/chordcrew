import Dexie, { type Table } from 'dexie'
import type {
  Book, Song, SongVersion, Annotation,
  Setlist, SetlistItem, Team, SyncState, AppSettings, SongNote,
} from '@/types'
import { DEFAULT_SETTINGS } from '@/types'

// ─── Database class ───────────────────────────────────────────────────────────

export class ChordCrewDB extends Dexie {
  books!: Table<Book>
  songs!: Table<Song>
  songVersions!: Table<SongVersion>
  annotations!: Table<Annotation>
  setlists!: Table<Setlist>
  setlistItems!: Table<SetlistItem>
  teams!: Table<Team>
  syncStates!: Table<SyncState>
  settings!: Table<AppSettings & { id: string }>
  songNotes!: Table<SongNote>

  constructor() {
    super('ChordCrewDB')

    this.version(1).stores({
      books:        'id, ownerId, sharedTeamId, updatedAt',
      songs:        'id, bookId, title, artist, isFavorite, updatedAt, *tags',
      songVersions: 'id, songId, savedAt',
      annotations:  'id, songId, userId, isPrivate',
      setlists:     'id, ownerId, sharedTeamId, updatedAt',
      setlistItems: 'id, setlistId, order',
      teams:        'id, ownerId',
      syncStates:   'id, entityType, status',
      settings:     'id',
    })

    // Version 2: add updatedAt index to teams for sync
    this.version(2).stores({
      teams: 'id, ownerId, updatedAt',
    })

    // Version 3: personal song notes (private per user)
    this.version(3).stores({
      songNotes: 'id, songId, userId, updatedAt',
    })
  }
}

export const db = new ChordCrewDB()

// Seed default settings row on first open
db.on('ready', async () => {
  const count = await db.settings.count()
  if (count === 0) {
    await db.settings.put({ id: 'app', ...DEFAULT_SETTINGS })
  }
})

// ─── Helper queries ───────────────────────────────────────────────────────────

export async function getSettings(): Promise<AppSettings> {
  const row = await db.settings.get('app')
  // Merge with DEFAULT_SETTINGS so any field added after initial install gets its default
  return row ? { ...DEFAULT_SETTINGS, ...row } : DEFAULT_SETTINGS
}

export async function saveSettings(patch: Partial<AppSettings>): Promise<void> {
  const current = await getSettings()
  await db.settings.put({ id: 'app', ...current, ...patch })
}

export async function getSongsByBook(bookId: string): Promise<Song[]> {
  return db.songs.where('bookId').equals(bookId).sortBy('title')
}

export async function getFavoriteSongs(): Promise<Song[]> {
  return db.songs.where('isFavorite').equals(1).sortBy('title')
}

export async function searchSongs(query: string): Promise<Song[]> {
  const q = query.toLowerCase()
  const all = await db.songs.toArray()
  return all.filter(s => s.searchText.toLowerCase().includes(q))
}

export async function getSetlistWithItems(
  setlistId: string
): Promise<{ setlist: Setlist; items: SetlistItem[] } | null> {
  const setlist = await db.setlists.get(setlistId)
  if (!setlist) return null
  const items = await db.setlistItems
    .where('setlistId').equals(setlistId)
    .sortBy('order')
  return { setlist, items }
}

export async function upsertSongVersions(
  songId: string,
  content: string,
  userId: string,
  displayName: string
): Promise<void> {
  const existing = await db.songVersions
    .where('songId').equals(songId)
    .sortBy('savedAt')

  // Keep last 3; drop oldest if we already have 3
  if (existing.length >= 3) {
    await db.songVersions.delete(existing[0].id)
  }

  const version: SongVersion = {
    id: crypto.randomUUID(),
    songId,
    content,
    savedAt: Date.now(),
    savedByUserId: userId,
    savedByDisplayName: displayName,
    versionNumber: Math.min((existing.length + 1), 3) as 1 | 2 | 3,
  }
  await db.songVersions.put(version)
}

export async function markPending(
  entityType: SyncState['entityType'],
  entityId: string
): Promise<void> {
  const id = `${entityType}:${entityId}`
  const existing = await db.syncStates.get(id)
  if (existing?.status === 'deleted') return  // don't resurrect a deletion tombstone
  await db.syncStates.put({
    id,
    entityType,
    entityId,
    localVersion: (existing?.localVersion ?? 0) + 1,
    syncedVersion: existing?.syncedVersion ?? 0,
    status: 'pending',
    updatedAt: Date.now(),
  })
}

export async function markDeleted(
  entityType: SyncState['entityType'],
  entityId: string,
  deleteFromPaths: string[],
): Promise<void> {
  await db.syncStates.put({
    id: `${entityType}:${entityId}`,
    entityType,
    entityId,
    localVersion: 0,
    syncedVersion: 0,
    status: 'deleted',
    deleteFromPaths,
    updatedAt: Date.now(),
  })
}

// ─── Team helpers ─────────────────────────────────────────────────────────────

/** Returns all teams the user owns or is a member of. */
export async function getMyTeams(userId: string, userEmail: string): Promise<Team[]> {
  const all = await db.teams.toArray()
  return all.filter(t =>
    t.ownerId === userId ||
    t.members.some(m => m.userId === userId || m.email === userEmail)
  )
}

/** Returns the user's role in a team, or null if not a member. */
export function getTeamRole(team: Team, userId: string, userEmail: string): TeamMemberRole | null {
  if (team.ownerId === userId) return 'owner'
  const member = team.members.find(m => m.userId === userId || m.email === userEmail)
  return member?.role ?? null
}

export function generateId(): string {
  return crypto.randomUUID()
}

// ─── Song note helpers ────────────────────────────────────────────────────────

export async function getSongNote(songId: string, userId: string): Promise<SongNote | undefined> {
  return db.songNotes.get(`${userId}:${songId}`)
}

export async function saveSongNote(songId: string, userId: string, content: string): Promise<void> {
  const id = `${userId}:${songId}`
  await db.songNotes.put({ id, songId, userId, content, updatedAt: Date.now() })
}

export async function deleteSongNote(songId: string, userId: string): Promise<void> {
  await db.songNotes.delete(`${userId}:${songId}`)
}

// ─── Re-export Team types used by helpers ────────────────────────────────────
import type { TeamMemberRole } from '@/types'
export type { TeamMemberRole }
