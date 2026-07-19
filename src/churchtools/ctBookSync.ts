import { db, generateId } from '@/db'
import { buildSearchText, extractMeta } from '@/utils/chordpro'
import { ctGetAllSongs } from './api'
import type { CTSong } from './types'
import type { Book } from '@/types'

// CT is source of truth for arrangement fields (key/tempo/time) and song identity.
// For optional metadata (ccli, author, copyright), if CT has no value we fall back
// to whatever the local copy already has — so a locally-known CCLI isn't erased
// just because CT hasn't been updated yet.
function buildCtContent(
  ctSong: CTSong,
  arrangement?: CTSong['arrangements'][number],
  localFallback?: { ccli?: string; author?: string; copyright?: string },
): string {
  const lines: string[] = []
  lines.push(`{title: ${ctSong.name}}`)
  const author    = ctSong.author    || localFallback?.author    || ''
  const ccli      = ctSong.ccli      || localFallback?.ccli      || ''
  const copyright = ctSong.copyright || localFallback?.copyright || ''
  if (author)    lines.push(`{artist: ${author}}`)
  if (ccli)      lines.push(`{ccli: ${ccli}}`)
  if (copyright) lines.push(`{copyright: ${copyright}}`)
  if (arrangement?.key) lines.push(`{key: ${arrangement.key}}`)
  if (arrangement?.tempo && arrangement.tempo > 0) lines.push(`{tempo: ${arrangement.tempo}}`)
  if (arrangement?.beat) lines.push(`{time: ${arrangement.beat}}`)
  return lines.join('\n') + '\n'
}

export async function getOrCreateCtBook(userId: string, displayName: string): Promise<Book> {
  const all = await db.books.toArray()
  const existing = all.find(b => b.sourceType === 'churchtools')
  if (existing) return existing
  const id = generateId()
  const book: Book = {
    id,
    title: 'ChurchTools',
    author: displayName,
    ownerId: userId,
    readOnly: false,
    shareable: false,
    sourceType: 'churchtools',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }
  await db.books.add(book)
  return book
}

export interface CtSyncResult {
  added: number
  updated: number
  removed: number
}

export async function syncCtSongs(
  userId: string,
  displayName: string,
  baseUrl: string,
  token: string,
  categoryId: number,
): Promise<CtSyncResult> {
  const book = await getOrCreateCtBook(userId, displayName)

  let ctSongs = await ctGetAllSongs(baseUrl, token)
  if (categoryId > 0) {
    ctSongs = ctSongs.filter(s => s.category.id === categoryId)
  }

  const localSongs = await db.songs.where('bookId').equals(book.id).toArray()

  // Re-home any CT songs that ended up with a stale bookId (e.g. CT book was
  // deleted + recreated with a new ID after a data wipe).
  const allCtSongs = await db.songs.where('ctSongId').above(0).toArray()
  const staleOrphans = allCtSongs.filter(s => s.bookId !== book.id)
  for (const s of staleOrphans) {
    await db.songs.update(s.id, { bookId: book.id })
    localSongs.push({ ...s, bookId: book.id })
  }

  const ctById = new Map<number, CTSong>(ctSongs.map(s => [s.id, s]))
  const localByCtId = new Map(
    localSongs.filter(s => s.ctSongId != null).map(s => [s.ctSongId!, s])
  )

  let added = 0, updated = 0, removed = 0
  const now = Date.now()

  for (const ctSong of ctSongs) {
    const arrangement = ctSong.arrangements.find(a => a.isDefault) ?? ctSong.arrangements[0]
    const local = localByCtId.get(ctSong.id)

    if (!local) {
      const id = generateId()
      await db.songs.add({
        id,
        bookId: book.id,
        title: ctSong.name,
        artist: ctSong.author ?? '',
        tags: [],
        searchText: buildSearchText(ctSong.name, ctSong.author ?? '', [], ''),
        isFavorite: false,
        savedAt: now,
        updatedAt: now,
        ctSongId: ctSong.id,
        ctArrangementId: arrangement?.id,
        transcription: {
          content: buildCtContent(ctSong, arrangement),
          key: arrangement?.key ?? '',
          capo: 0,
          tempo: arrangement?.tempo ?? 0,
          timeSignature: arrangement?.beat ?? '',
          duration: arrangement?.duration ?? 0,
          chordNotation: 'standard',
          instrument: '',
          tuning: 'standard',
          format: 'chordpro',
        },
      })
      added++
    } else {
      const localMeta = extractMeta(local.transcription.content)
      const localFallback = { ccli: localMeta.ccli, author: local.artist, copyright: localMeta.copyright }
      const newContent = buildCtContent(ctSong, arrangement, localFallback)
      // Use CT author when CT has one; otherwise keep local artist
      const artist = ctSong.author || local.artist
      const changed =
        local.title !== ctSong.name ||
        local.artist !== artist ||
        local.ctArrangementId !== arrangement?.id ||
        local.transcription.content !== newContent
      if (changed) {
        await db.songs.update(local.id, {
          title: ctSong.name,
          artist,
          ctArrangementId: arrangement?.id,
          searchText: buildSearchText(ctSong.name, artist, local.tags, ''),
          updatedAt: now,
          transcription: {
            ...local.transcription,
            content: newContent,
            key: arrangement?.key ?? '',
            tempo: arrangement?.tempo ?? 0,
            timeSignature: arrangement?.beat ?? '',
            duration: arrangement?.duration ?? 0,
          },
        })
        updated++
      }
    }
  }

  for (const local of localSongs) {
    if (local.ctSongId != null && !ctById.has(local.ctSongId)) {
      await db.songs.delete(local.id)
      removed++
    }
  }

  return { added, updated, removed }
}
