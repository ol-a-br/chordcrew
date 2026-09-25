## Sync architecture

`SyncContext` exposes `{ status, pendingCount, lastSync, error, syncNow }`.

- `status`: `'unconfigured' | 'clean' | 'pending' | 'syncing' | 'error'`
- Every Dexie write calls `markPending(entityType, id)` which inserts/updates a `SyncState` row
- `syncNow()`: `uploadPending()` → `downloadPersonal()` → `downloadTeams()`
- `stripUndefined()` in `firestoreSync.ts` strips `undefined` fields before Firestore writes (Firestore rejects them)
- Team songs are uploaded to both `/users/{uid}/songs/{id}` and `/teams/{teamId}/songs/{id}` when the song's book has `sharedTeamId`

Reminder: sync is manual-only (see root `CLAUDE.md` Key Constraints) — never add automatic or background sync here.
