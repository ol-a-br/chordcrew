// Forgiving text search for the Library search box (and any other "search these
// fields, typos okay" use case — see fuzzyMatch/fuzzyRank below).
//
// The whole thing is word-based, never a raw substring test on the joined text
// (see the comment in matchField for why). Matching happens in two passes:
//
//   1. Split both the field and the query into words.
//   2. For each query word, find every field word it could plausibly mean:
//      an exact prefix match ("ocea" -> "oceans"), or — if that fails — a word
//      within edit distance of it (typo tolerance, see editDistanceWithinBound).
//   3. Require a *distinct* one-to-one assignment of query words to field words
//      (hasDistinctAssignment) — a query only "matches" if every one of its
//      words can be pinned to a different word in the field. This is what stops
//      a single short field word (e.g. "ein") from satisfying two different
//      query words at once (see hasDistinctAssignment's comment).
//
// fuzzyRank turns that per-field match into a sortable relevance vector:
// [which field matched, exact vs. fuzzy, how early in the field] — so title
// beats lyrics, an exact hit beats a typo-tolerant one, and "Mein Erlöser lebt"
// beats "Dir gehört mein Lob" for the query "mein". See fuzzyRank's own comment
// for the exact tie-break order, and fuzzySearch.test.ts for the guarantees
// this file is expected to hold — please add a case there before changing the
// matching or ranking rules.

// How many typo'd characters a query word may have before we give up on it,
// scaled by its length — a fixed distance would either reject real typos on
// long words or let short words (2-3 letters) match almost anything.
function maxEditsFor(wordLength: number): number {
  if (wordLength <= 3) return 0
  if (wordLength <= 6) return 1
  return 2
}

// Optimal-string-alignment distance: like Levenshtein, but an adjacent-letter
// transposition (the most common typo, e.g. "teh" for "the") costs 1 instead of 2.
function editDistanceWithinBound(a: string, b: string, maxDist: number): boolean {
  if (Math.abs(a.length - b.length) > maxDist) return false

  let prevPrevRow: number[] | null = null
  let prevRow = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i++) {
    const currRow = new Array<number>(b.length + 1)
    currRow[0] = i
    let rowMin = currRow[0]
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      let best = Math.min(prevRow[j] + 1, currRow[j - 1] + 1, prevRow[j - 1] + cost)
      if (prevPrevRow && i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        best = Math.min(best, prevPrevRow[j - 2] + 1)
      }
      currRow[j] = best
      if (best < rowMin) rowMin = best
    }
    if (rowMin > maxDist) return false
    prevPrevRow = prevRow
    prevRow = currRow
  }
  return prevRow[b.length] <= maxDist
}

function wordMatchKind(word: string, queryWord: string): 'exact' | 'fuzzy' | null {
  // startsWith, not includes: a short fragment like "ein" sits inside dozens of
  // unrelated German words ("dein", "sein", "klein", "allein", ...), so matching
  // it anywhere in a word turns nearly every song into a false positive. Typing
  // the start of a word ("ocea" -> "oceans") is the common case worth serving;
  // typos on the rest of the word are covered by the edit-distance check below.
  if (word.startsWith(queryWord)) return 'exact'
  const maxDist = maxEditsFor(queryWord.length)
  if (maxDist > 0 && editDistanceWithinBound(word, queryWord, maxDist)) return 'fuzzy'
  return null
}

// Kuhn's algorithm: is there an assignment of each query word to a *distinct*
// text word it matches? Without this, one short text word can satisfy several
// query words at once — e.g. "ein" is edit-distance 1 from "mein" *and* an exact
// match for "ein" itself, so a title containing only the word "ein" would wrongly
// satisfy the two-word query "mein ein". Requiring a one-to-one assignment (like a
// human reading the query against the text) closes that loophole.
function hasDistinctAssignment(candidatesByQueryWord: number[][]): boolean {
  const textWordOwner = new Map<number, number>() // text word index -> query word index

  function augment(queryWordIdx: number, visited: Set<number>): boolean {
    for (const textWordIdx of candidatesByQueryWord[queryWordIdx]) {
      if (visited.has(textWordIdx)) continue
      visited.add(textWordIdx)
      const owner = textWordOwner.get(textWordIdx)
      if (owner === undefined || augment(owner, visited)) {
        textWordOwner.set(textWordIdx, queryWordIdx)
        return true
      }
    }
    return false
  }

  return candidatesByQueryWord.every((_, queryWordIdx) => augment(queryWordIdx, new Set()))
}

interface FieldMatch {
  quality: 'exact' | 'fuzzy'
  /** Index of the earliest text word involved in the match — lower means closer to the start of the field. */
  position: number
}

/** Match `text` against `query`, or null if `text` doesn't match `query` at all. */
function matchField(text: string, query: string): FieldMatch | null {
  const haystack = text.toLowerCase()
  const q = query.trim().toLowerCase()
  if (!q) return { quality: 'exact', position: 0 }

  // Word-based throughout, deliberately — no raw `haystack.includes(q)` fast path.
  // Matching a query as a substring of the raw text blob ignores word boundaries,
  // so a 2-letter query like "me" would match inside "atmen" or "kommen" too,
  // turning nearly every song into a false positive and drowning out real matches.
  const words = haystack.split(/[^\p{L}\p{N}]+/u).filter(Boolean)
  const queryWords = q.split(/\s+/).filter(Boolean)

  const exactCandidates: number[][] = []
  const anyCandidates: number[][] = []
  for (const qw of queryWords) {
    const exact: number[] = []
    const any: number[] = []
    words.forEach((w, i) => {
      const kind = wordMatchKind(w, qw)
      if (kind === 'exact') exact.push(i)
      if (kind) any.push(i)
    })
    exactCandidates.push(exact)
    anyCandidates.push(any)
  }

  if (anyCandidates.some(c => c.length === 0)) return null

  const earliestPosition = (candidates: number[][]) => Math.min(...candidates.map(c => Math.min(...c)))

  if (exactCandidates.every(c => c.length > 0) && hasDistinctAssignment(exactCandidates)) {
    return { quality: 'exact', position: earliestPosition(exactCandidates) }
  }
  if (hasDistinctAssignment(anyCandidates)) {
    return { quality: 'fuzzy', position: earliestPosition(anyCandidates) }
  }
  return null
}

/** True if every word in `query` fuzzily matches a distinct word in `text` (typo-tolerant). */
export function fuzzyMatch(text: string, query: string): boolean {
  return matchField(text, query) !== null
}

/**
 * Ranks a result by, in order: which field it matched (checked in the given
 * priority order — e.g. title before artist/tags before full lyrics text);
 * whether the match was exact/prefix or only found via typo tolerance; and how
 * close to the start of that field the match begins. Compare the returned
 * vectors lexicographically (first differing entry wins) — lower is better, so
 * "Mein Erlöser lebt" outranks "Dir gehört mein Lob" for the query "mein", and
 * a fuzzy match on an earlier field still beats an exact match on a later one.
 */
export function fuzzyRank(fieldsInPriorityOrder: string[], query: string): [number, number, number] {
  for (let i = 0; i < fieldsInPriorityOrder.length; i++) {
    const m = matchField(fieldsInPriorityOrder[i], query)
    if (m) return [i, m.quality === 'exact' ? 0 : 1, m.position]
  }
  return [fieldsInPriorityOrder.length, 1, Infinity]
}

/** Lexicographic comparison of two `fuzzyRank` vectors — for use as a sort comparator. */
export function compareFuzzyRank(a: readonly number[], b: readonly number[]): number {
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return a[i] - b[i]
  }
  return 0
}
