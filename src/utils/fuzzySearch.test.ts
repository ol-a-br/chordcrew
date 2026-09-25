import { describe, it, expect } from 'vitest'
import { fuzzyMatch, fuzzyRank, compareFuzzyRank } from './fuzzySearch'

// ─── fuzzyMatch: typo tolerance ─────────────────────────────────────────────

describe('fuzzyMatch — typo tolerance', () => {
  it('matches an exact substring', () => {
    expect(fuzzyMatch('amazing grace how sweet the sound', 'amazing grace')).toBe(true)
  })

  it('is case-insensitive', () => {
    expect(fuzzyMatch('Amazing Grace', 'AMAZING')).toBe(true)
  })

  it('tolerates a single substitution', () => {
    expect(fuzzyMatch('amazing grace how sweet the sound', 'amazng grace')).toBe(true)
  })

  it('tolerates an adjacent-letter transposition (the most common typo)', () => {
    // "waht" -> "what": h/a swapped
    expect(fuzzyMatch('what a beautiful name', 'waht a beautiful')).toBe(true)
    expect(fuzzyMatch('build my life', 'buidl my life')).toBe(true)
  })

  it('matches a truncated prefix of a longer word', () => {
    expect(fuzzyMatch('oceans where feet may fail', 'ocean')).toBe(true)
    expect(fuzzyMatch('same love song title', 'same lov')).toBe(true)
  })

  it('tolerates typos in numbers too', () => {
    expect(fuzzyMatch('10000 reasons bless the lord', '10000 reasns')).toBe(true)
  })

  it('rejects unrelated text', () => {
    expect(fuzzyMatch('in christ alone', 'cat')).toBe(false)
    expect(fuzzyMatch('oceans where feet may fail', 'xyz')).toBe(false)
  })

  it('rejects a word with too many edits for its length', () => {
    // "grace" -> "grate" needs 2 edits (a 3-letter rotation), one more than a
    // 5-letter query word is allowed — see maxEditsFor.
    expect(fuzzyMatch('how great is our god', 'how grate')).toBe(false)
  })

  it('requires an exact match for very short (<=3 char) query words', () => {
    // "god" is 3 letters, so it must match a word exactly/as a prefix, not fuzzily.
    expect(fuzzyMatch('good good father', 'god god father')).toBe(false)
  })

  it('empty query matches everything', () => {
    expect(fuzzyMatch('anything at all', '')).toBe(true)
    expect(fuzzyMatch('anything at all', '   ')).toBe(true)
  })
})

// ─── fuzzyMatch: word boundaries ────────────────────────────────────────────
// Regression tests for a real bug: matching the query as a raw substring of
// the joined text (ignoring word boundaries) made short/common queries match
// almost everything, because they occur *inside* unrelated words.

describe('fuzzyMatch — word boundaries', () => {
  it('does not match a short query buried inside an unrelated word', () => {
    // "me" is a substring of "atmen" and "kommen", but not a word boundary match.
    expect(fuzzyMatch('das was mich atmen lässt', 'me')).toBe(false)
    expect(fuzzyMatch('wir kommen zu dir', 'me')).toBe(false)
  })

  it('matches a short query at the start of a word', () => {
    expect(fuzzyMatch('das ist mein könig', 'me')).toBe(true)
    expect(fuzzyMatch('über die berge und das meer', 'me')).toBe(true)
  })

  it('a short fragment does not fuzzy-match every word that merely contains it', () => {
    // "ein" sits inside "dein", "sein", "kein", "klein", "allein" — none of
    // these should count as matching the query word "ein" on their own.
    expect(fuzzyMatch('dein ist die ehre', 'ein')).toBe(false)
    expect(fuzzyMatch('sein name ist wunderbar', 'ein')).toBe(false)
    expect(fuzzyMatch('kein anderer ist wie du', 'ein')).toBe(false)
  })
})

// ─── fuzzyMatch: distinct word assignment ───────────────────────────────────
// Regression tests for a real bug: each query word was checked independently,
// so a single text word could satisfy two different query words at once
// ("ein" is both an exact match for "ein" and edit-distance 1 from "mein").

describe('fuzzyMatch — distinct word assignment', () => {
  it('matches a multi-word query against its literal phrase', () => {
    expect(fuzzyMatch('mein ein und alles', 'mein ein')).toBe(true)
  })

  it('does not let one text word satisfy two different query words', () => {
    // Only contains the single word "ein" — not a real match for "mein ein",
    // even though "ein" is edit-distance 1 from "mein".
    expect(fuzzyMatch('david war ein mann nach gottes herzen', 'mein ein')).toBe(false)
  })

  it('does match when the text has distinct words for each query word', () => {
    expect(fuzzyMatch('mein leben ist ein geschenk', 'mein ein')).toBe(true)
  })
})

// ─── fuzzyRank: field priority ──────────────────────────────────────────────

describe('fuzzyRank — field priority', () => {
  it('ranks a title match ahead of a metadata match', () => {
    const title = fuzzyRank(['Amazing Grace', 'Traditional', 'amazing grace traditional'], 'amazing')
    const meta = fuzzyRank(['Reckless Love', 'Amazing Music Co', 'reckless love amazing music co'], 'amazing')
    expect(compareFuzzyRank(title, meta)).toBeLessThan(0)
  })

  it('ranks a metadata match ahead of a lyrics-only match', () => {
    const meta = fuzzyRank(['Reckless Love', '', 'reckless love grace-theme'], 'grace')
    const lyrics = fuzzyRank(['Build My Life', '', 'build my life ... amazing grace how sweet ...'], 'grace')
    expect(compareFuzzyRank(meta, lyrics)).toBeLessThan(0)
  })

  it('a fuzzy match on an earlier field still beats an exact match on a later one', () => {
    // Title fuzzily matches ("grase" -> "grace"), artist/tags don't match at all.
    const fuzzyTitle = fuzzyRank(['Amazing Grase', '', 'amazing grase'], 'grace')
    const exactLyrics = fuzzyRank(['Unrelated Song', '', 'unrelated song with the word grace in it'], 'grace')
    expect(compareFuzzyRank(fuzzyTitle, exactLyrics)).toBeLessThan(0)
  })

  it('returns a rank past the field list when nothing matches', () => {
    const [field] = fuzzyRank(['Amazing Grace', 'Traditional', 'amazing grace traditional'], 'xyz')
    expect(field).toBe(3)
  })
})

// ─── fuzzyRank: exact vs. fuzzy ─────────────────────────────────────────────
// Regression test for a real bug: within the same field, a fuzzy (typo-tolerant)
// match could outrank an exact one, e.g. songs with "dein"/"sein" in the title
// (edit-distance 1 from "mein") sorted ahead of songs actually titled "Mein ...".

describe('fuzzyRank — exact beats fuzzy on the same field', () => {
  it('ranks an exact title match ahead of a fuzzy (typo-only) title match', () => {
    const exact = fuzzyRank(['Mein Erlöser lebt', '', 'mein erlöser lebt'], 'mein')
    const fuzzy = fuzzyRank(['Dein ist das Königreich', '', 'dein ist das königreich'], 'mein')
    expect(compareFuzzyRank(exact, fuzzy)).toBeLessThan(0)
  })
})

// ─── fuzzyRank: position within the field ───────────────────────────────────
// Regression test for a real bug: two exact title matches sorted alphabetically
// instead of by how early the query appears, so "Dir gehört mein Lob" could
// outrank "Mein Erlöser lebt" for the query "mein".

describe('fuzzyRank — earlier match position wins', () => {
  it('ranks a title starting with the query ahead of one with it mid-title', () => {
    const startsWithQuery = fuzzyRank(['Mein Erlöser lebt', '', 'mein erlöser lebt'], 'mein')
    const queryInMiddle = fuzzyRank(['Dir gehört mein Lob', '', 'dir gehört mein lob'], 'mein')
    expect(compareFuzzyRank(startsWithQuery, queryInMiddle)).toBeLessThan(0)
  })

  it('ranks by how early the whole multi-word query begins', () => {
    const early = fuzzyRank(['Mein Ein Und Alles', '', 'mein ein und alles'], 'mein ein')
    const late = fuzzyRank(['Alles ist Mein Ein Teil', '', 'alles ist mein ein teil'], 'mein ein')
    expect(compareFuzzyRank(early, late)).toBeLessThan(0)
  })
})

// ─── compareFuzzyRank ────────────────────────────────────────────────────────

describe('compareFuzzyRank', () => {
  it('orders vectors lexicographically', () => {
    expect(compareFuzzyRank([0, 0, 0], [0, 0, 1])).toBeLessThan(0)
    expect(compareFuzzyRank([0, 1, 0], [0, 0, 5])).toBeGreaterThan(0)
    expect(compareFuzzyRank([1, 0, 0], [0, 5, 5])).toBeGreaterThan(0)
  })

  it('returns 0 for identical vectors', () => {
    expect(compareFuzzyRank([0, 1, 2], [0, 1, 2])).toBe(0)
  })
})
