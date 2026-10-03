## Sync architecture

`SyncContext` exposes `{ status, pendingCount, lastSync, error, syncNow }`.

- `status`: `'unconfigured' | 'clean' | 'pending' | 'syncing' | 'error'`
- Every Dexie write calls `markPending(entityType, id)` which inserts/updates a `SyncState` row
- `syncNow()`: `uploadPending()` → `downloadPersonal()` → `downloadTeams()`
- `stripUndefined()` in `firestoreSync.ts` strips `undefined` fields before Firestore writes (Firestore rejects them)
- Team songs are uploaded to both `/users/{uid}/songs/{id}` and `/teams/{teamId}/songs/{id}` when the song's book has `sharedTeamId`
- Team books live in `/teams/{teamId}/books`; `downloadTeam` downloads them so every member can place team songs (otherwise they show as "(unassigned)"). Editors backfill team books missing there; a team song whose book is still missing gets a local-only placeholder book (`updatedAt: 0`, never pending)
- Deletions (songs and books) write tombstones (`markDeleted`) plus a `deletions` log entry so other devices/members remove them too

Reminder: sync is manual-only (see root `CLAUDE.md` Key Constraints) — never add automatic or background sync here.
