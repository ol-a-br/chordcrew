import { db, generateId } from '@/db'
import { buildSearchText } from '@/utils/chordpro'
import { ctGetAllSongs } from './api'
import type { CTSong } from './types'
import type { Book } from '@/types'

function buildCtContent(ctSong: CTSong, arrangement?: CTSong['arrangements'][number]): string {
  const lines: string[] = []
  lines.push(`{title: ${ctSong.name}}`)
  if (ctSong.author) lines.push(`{artist: ${ctSong.author}}`)
  if (ctSong.ccli) lines.push(`{ccli: ${ctSong.ccli}}`)
  if (ctSong.copyright) lines.push(`{copyright: ${ctSong.copyright}}`)
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
      const newContent = buildCtContent(ctSong, arrangement)
      const changed =
        local.title !== ctSong.name ||
        local.artist !== (ctSong.author ?? '') ||
        local.ctArrangementId !== arrangement?.id ||
        local.transcription.content !== newContent
      if (changed) {
        await db.songs.update(local.id, {
          title: ctSong.name,
          artist: ctSong.author ?? '',
          ctArrangementId: arrangement?.id,
          searchText: buildSearchText(ctSong.name, ctSong.author ?? '', local.tags, ''),
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
