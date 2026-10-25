import { describe, it, expect } from 'vitest'
import { normalizeContent, isSongDiverged, getLinkStatus, resolveLinkedSongs, findExistingCopy } from './linkedSongs'
import type { Song } from '@/types'

// ─── Fixtures ────────────────────────────────────────────────────────────────

function makeSong(overrides: Partial<Song> = {}): Song {
  return {
    id: 'a',
    bookId: 'book1',
    title: 'Amazing Grace',
    artist: 'John Newton',
    tags: ['hymn'],
    searchText: '',
    isFavorite: false,
    savedAt: 1000,
    updatedAt: 2000,
    transcription: {
      content: '{title: Amazing Grace}\n[G]Amazing [C]grace',
      key: 'G',
      capo: 0,
      tempo: 120,
      timeSignature: '3/4',
      duration: 0,
      chordNotation: 'standard',
      instrument: 'guitar',
      tuning: 'standard',
      format: 'chordpro',
    },
    ...overrides,
  }
}

// ─── normalizeContent ─────────────────────────────────────────────────────────

describe('normalizeContent', () => {
  it('collapses multiple spaces', () => {
    expect(normalizeContent('hello   world')).toBe('hello world')
  })
  it('trims leading/trailing whitespace', () => {
    expect(normalizeContent('  hello\n')).toBe('hello')
  })
  it('collapses newlines', () => {
    expect(normalizeContent('line1\n\nline2')).toBe('line1 line2')
  })
})

// ─── isSongDiverged ──────────────────────────────────────────────────────────

describe('isSongDiverged', () => {
  it('returns false for identical songs', () => {
    const a = makeSong()
    const b = makeSong({ id: 'b', bookId: 'book2' })
    expect(isSongDiverged(a, b)).toBe(false)
  })

  it('detects content divergence', () => {
    const a = makeSong()
    const b = makeSong({ id: 'b', transcription: { ...a.transcription, content: '{title: Amazing Grace}\n[G]Amazing [D]grace' } })
    expect(isSongDiverged(a, b)).toBe(true)
  })

  it('detects title divergence', () => {
    const a = makeSong()
    const b = makeSong({ id: 'b', title: 'Amazing Grace (Alt)' })
    expect(isSongDiverged(a, b)).toBe(true)
  })

  it('detects artist divergence', () => {
    const a = makeSong()
    const b = makeSong({ id: 'b', artist: 'Traditional' })
    expect(isSongDiverged(a, b)).toBe(true)
  })

  it('detects tempo divergence', () => {
    const a = makeSong()
    const b = makeSong({ id: 'b', transcription: { ...a.transcription, tempo: 80 } })
    expect(isSongDiverged(a, b)).toBe(true)
  })

  it('detects capo divergence', () => {
    const a = makeSong()
    const b = makeSong({ id: 'b', transcription: { ...a.transcription, capo: 2 } })
    expect(isSongDiverged(a, b)).toBe(true)
  })

  it('detects tag divergence', () => {
    const a = makeSong()
    const b = makeSong({ id: 'b', tags: ['hymn', 'classic'] })
    expect(isSongDiverged(a, b)).toBe(true)
  })

  it('tag order does not matter', () => {
    const a = makeSong({ tags: ['hymn', 'classic'] })
    const b = makeSong({ id: 'b', tags: ['classic', 'hymn'] })
    expect(isSongDiverged(a, b)).toBe(false)
  })

  it('ignores key difference (D3)', () => {
    const a = makeSong()
    const b = makeSong({ id: 'b', transcription: { ...a.transcription, key: 'D' } })
    expect(isSongDiverged(a, b)).toBe(false)
  })

  it('content whitespace normalised before compare', () => {
    const a = makeSong()
    const b = makeSong({
      id: 'b',
      transcription: { ...a.transcription, content: '{title: Amazing Grace}\n[G]Amazing [C]grace\n' },
    })
    expect(isSongDiverged(a, b)).toBe(false)
  })
})

// ─── resolveLinkedSongs ───────────────────────────────────────────────────────

describe('resolveLinkedSongs', () => {
  it('resolves present linked songs', () => {
    const a = makeSong({ id: 'a', linkedSongIds: ['b'] })
    const b = makeSong({ id: 'b' })
    const map = new Map([['a', a], ['b', b]])
    const { found, broken } = resolveLinkedSongs(a, map)
    expect(found).toHaveLength(1)
    expect(found[0].id).toBe('b')
    expect(broken).toHaveLength(0)
  })

  it('reports broken links for missing IDs', () => {
    const a = makeSong({ id: 'a', linkedSongIds: ['missing'] })
    const map = new Map([['a', a]])
    const { found, broken } = resolveLinkedSongs(a, map)
    expect(found).toHaveLength(0)
    expect(broken).toEqual(['missing'])
  })
})

// ─── getLinkStatus ────────────────────────────────────────────────────────────

describe('getLinkStatus', () => {
  it('returns none when no linked songs', () => {
    const a = makeSong()
    expect(getLinkStatus(a, new Map([['a', a]]))).toBe('none')
  })

  it('returns in-sync when copies are identical', () => {
    const a = makeSong({ id: 'a', linkedSongIds: ['b'] })
    const b = makeSong({ id: 'b', linkedSongIds: ['a'] })
    const map = new Map([['a', a], ['b', b]])
    expect(getLinkStatus(a, map)).toBe('in-sync')
  })

  it('returns diverged when any copy has drifted', () => {
    const a = makeSong({ id: 'a', linkedSongIds: ['b'] })
    const b = makeSong({ id: 'b', linkedSongIds: ['a'], title: 'Different Title' })
    const map = new Map([['a', a], ['b', b]])
    expect(getLinkStatus(a, map)).toBe('diverged')
  })

  it('returns broken when a linked ID is missing', () => {
    const a = makeSong({ id: 'a', linkedSongIds: ['gone'] })
    const map = new Map([['a', a]])
    expect(getLinkStatus(a, map)).toBe('broken')
  })

  it('broken takes precedence over in-sync', () => {
    const a = makeSong({ id: 'a', linkedSongIds: ['b', 'gone'] })
    const b = makeSong({ id: 'b', linkedSongIds: ['a'] })
    const map = new Map([['a', a], ['b', b]])
    expect(getLinkStatus(a, map)).toBe('broken')
  })

  it('key-only difference does not cause diverged', () => {
    const a = makeSong({ id: 'a', linkedSongIds: ['b'] })
    const b = makeSong({ id: 'b', linkedSongIds: ['a'], transcription: { ...a.transcription, key: 'D' } })
    const map = new Map([['a', a], ['b', b]])
    expect(getLinkStatus(a, map)).toBe('in-sync')
  })
})

// ─── findExistingCopy ─────────────────────────────────────────────────────────

describe('findExistingCopy', () => {
  const other = { title: 'Other Song', transcription: { ...makeSong().transcription, content: '[D]Other' } }

  it('returns an identical song from another book', () => {
    const song = makeSong()
    const copy = makeSong({ id: 'b', bookId: 'team' })
    expect(findExistingCopy(song, [copy])?.id).toBe('b')
  })
  it('matches identical content even when key, tags or tempo differ', () => {
    const song = makeSong()
    const copy = makeSong({ id: 'b', ...other, title: 'Renamed', tags: [], transcription: { ...song.transcription, key: 'A', tempo: 90, content: song.transcription.content + '\n\n' } })
    expect(findExistingCopy(song, [copy])?.id).toBe('b')
  })
  it('matches a linked copy even when it has drifted', () => {
    const song = makeSong({ linkedSongIds: ['b'] })
    const copy = makeSong({ id: 'b', ...other })
    expect(findExistingCopy(song, [copy])?.id).toBe('b')
  })
  it('matches a copy that links back to the song', () => {
    const song = makeSong()
    const copy = makeSong({ id: 'b', ...other, linkedSongIds: ['a'] })
    expect(findExistingCopy(song, [copy])?.id).toBe('b')
  })
  it('matches the same ChurchTools song', () => {
    const song = makeSong({ ctSongId: 42 })
    const copy = makeSong({ id: 'b', ...other, ctSongId: 42 })
    expect(findExistingCopy(song, [copy])?.id).toBe('b')
  })
  it('matches the same title and artist, ignoring case and whitespace', () => {
    const song = makeSong()
    const copy = makeSong({ id: 'b', ...other, title: ' amazing  GRACE ', artist: 'john newton' })
    expect(findExistingCopy(song, [copy])?.id).toBe('b')
  })
  it('matches the same title when one song has no artist', () => {
    const song = makeSong()
    const copy = makeSong({ id: 'b', ...other, title: 'Amazing Grace', artist: '' })
    expect(findExistingCopy(song, [copy])?.id).toBe('b')
  })
  it('does not match the same title by a different artist', () => {
    const song = makeSong()
    const copy = makeSong({ id: 'b', ...other, title: 'Amazing Grace', artist: 'Chris Tomlin' })
    expect(findExistingCopy(song, [copy])).toBeUndefined()
  })
  it('returns undefined for an unrelated song', () => {
    const song = makeSong()
    expect(findExistingCopy(song, [makeSong({ id: 'b', ...other })])).toBeUndefined()
  })
  it('never returns the song itself', () => {
    const song = makeSong()
    expect(findExistingCopy(song, [song])).toBeUndefined()
  })
  it('prefers a linked copy over an unlinked identical one', () => {
    const song = makeSong({ linkedSongIds: ['c'] })
    const unlinked = makeSong({ id: 'b' })
    const linked = makeSong({ id: 'c' })
    expect(findExistingCopy(song, [unlinked, linked])?.id).toBe('c')
  })
  it('prefers identical content over a title-only match', () => {
    const song = makeSong()
    const titleOnly = makeSong({ id: 'b', transcription: other.transcription })
    const sameContent = makeSong({ id: 'c', title: 'Renamed' })
    expect(findExistingCopy(song, [titleOnly, sameContent])?.id).toBe('c')
  })
})
