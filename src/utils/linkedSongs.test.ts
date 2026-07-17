import { describe, it, expect } from 'vitest'
import { normalizeContent, isSongDiverged, getLinkStatus, resolveLinkedSongs } from './linkedSongs'
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
