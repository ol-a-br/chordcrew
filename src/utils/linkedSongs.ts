import type { Song } from '@/types'

/** Collapse all whitespace runs to a single space for content comparison. */
export function normalizeContent(content: string): string {
  return content.replace(/\s+/g, ' ').trim()
}

/**
 * Returns true when two linked songs have drifted from each other.
 *
 * Compares: transcription content, title, artist, tags, tempo, capo.
 * Intentionally excludes transcription.key (different keys per book are allowed, D3).
 */
export function isSongDiverged(a: Song, b: Song): boolean {
  if (normalizeContent(a.transcription.content) !== normalizeContent(b.transcription.content)) return true
  if (a.title !== b.title) return true
  if ((a.artist ?? '') !== (b.artist ?? '')) return true
  if (a.transcription.tempo !== b.transcription.tempo) return true
  if (a.transcription.capo !== b.transcription.capo) return true
  const tagsA = [...(a.tags ?? [])].sort().join('\0')
  const tagsB = [...(b.tags ?? [])].sort().join('\0')
  if (tagsA !== tagsB) return true
  return false
}

/**
 * Given a song and a map of all songs, resolve its linked copies.
 * Returns { found: Song[], broken: string[] } where broken is linked IDs
 * that no longer exist in the local DB.
 */
export function resolveLinkedSongs(
  song: Song,
  songMap: Map<string, Song>,
): { found: Song[]; broken: string[] } {
  const found: Song[] = []
  const broken: string[] = []
  for (const id of song.linkedSongIds ?? []) {
    const linked = songMap.get(id)
    if (linked) found.push(linked)
    else broken.push(id)
  }
  return { found, broken }
}

/**
 * Returns divergence status for a song relative to its linked copies.
 * - 'none'    — no linked copies
 * - 'in-sync' — all copies identical (key excluded)
 * - 'diverged' — at least one copy has drifted
 * - 'broken'  — at least one linked ID no longer resolves
 */
export type LinkStatus = 'none' | 'in-sync' | 'diverged' | 'broken'

export function getLinkStatus(song: Song, songMap: Map<string, Song>): LinkStatus {
  if (!song.linkedSongIds?.length) return 'none'
  const { found, broken } = resolveLinkedSongs(song, songMap)
  if (broken.length > 0) return 'broken'
  if (found.some(linked => isSongDiverged(song, linked))) return 'diverged'
  return 'in-sync'
}
