import { describe, it, expect } from 'vitest'
import { isKnownChord, renderToHtml, renderToText } from './chordpro'

// ─── isKnownChord — recognized qualities and roots ────────────────────────────

describe('isKnownChord', () => {
  it('recognizes common quality suffixes', () => {
    expect(isKnownChord('Cmaj7')).toBe(true)
    expect(isKnownChord('Cadd9')).toBe(true)
    expect(isKnownChord('D4')).toBe(true)
    expect(isKnownChord('Am7')).toBe(true)
    expect(isKnownChord('G/B')).toBe(true)
  })

  // Regression: transposing into a key with an extreme signature (e.g. Gb major)
  // respells chords using theoretical naturals like "Cb" (Gb major's IV chord).
  // These roots were missing from ROOTS, so the chord fell through to the
  // "unknown chord" annotation styling (grey, italic) instead of rendering as
  // a normal chord.
  it('recognizes the rare enharmonic roots Cb, Fb, E#, B#', () => {
    expect(isKnownChord('Cbmaj7')).toBe(true)
    expect(isKnownChord('Fbmaj7')).toBe(true)
    expect(isKnownChord('B#7')).toBe(true)
    expect(isKnownChord('E#m')).toBe(true)
  })

  it('rejects genuinely unknown chord-position text (performance instructions)', () => {
    expect(isKnownChord('To Bridge')).toBe(false)
    expect(isKnownChord('N.C.')).toBe(false)
  })
})

// ─── renderToHtml — {capo} directive must not alter rendered chords ──────────
// chordsheetjs's Html formatters auto-transpose chords by -capo semitones and
// re-normalize chord suffixes (e.g. "Cmaj7" → "Cma7") at render time whenever a
// {capo} directive is present, regardless of any transpose we request. ChordCrew
// treats {capo} as informational only — chords in the body must render verbatim.

describe('renderToHtml with a {capo} directive', () => {
  const CONTENT = `{title: T}\n{key: G}\n{capo: 2}\n[Em]a [D]b [Cmaj7]c [G]d [Cadd9]e [D4]f\n`

  it('renders chords verbatim at transposeOffset 0 — no capo auto-shift, no suffix renormalization', () => {
    const html = renderToHtml(CONTENT, 0)
    expect(html).toContain('>Em<')
    expect(html).toContain('>D<')
    expect(html).toContain('>Cmaj7<')
    expect(html).toContain('>G<')
    expect(html).toContain('>Cadd9<')
    expect(html).toContain('>D4<')
    // The specific reported bug: chordsheetjs's normalize() shortens "maj7" to "ma7"
    expect(html).not.toContain('Cma7')
    // The capo auto-shift bug: roots silently transposed down by the capo amount
    expect(html).not.toContain('>Dm<')
    expect(html).not.toContain('>C<')
    expect(html).not.toContain('>F<')
  })

  it('applies exactly the requested transpose — capo does not stack an extra shift', () => {
    const html = renderToHtml(CONTENT, 2) // Em -> F#m, D -> E, G -> A
    expect(html).toContain('F#m')
    expect(html).toContain('>E<')
    expect(html).toContain('>A<')
    // A double-shift (transpose + capo) would land on F#m+(-2)=Em again, or similar
    // wrong values — guard the suffix-mangling bug too, independent of transpose.
    expect(html).not.toContain('ma7')
  })

  it('respells chords correctly (not as chord-annotation text) when transposing into an extreme key', () => {
    // G major -> Gb major (-1 semitone): the IV chord "Cmaj7" is properly
    // spelled "Cbmaj7" per Gb major's key signature.
    const html = renderToHtml(CONTENT, -1)
    expect(html).toContain('Cbmaj7')
    expect(html).not.toContain('chord-annotation')
  })
})

// ─── renderToHtml — transposing onto a natural note must not produce its ─────
// sharp enharmonic (chordsheetjs's Chord.transpose()/useModifier() bug: e.g.
// transposing D down 2 semitones produced "B#" instead of "C").

describe('renderToHtml transposing into natural-note targets', () => {
  const CONTENT = `{title: T}\n{key: A}\n[A5]a [D]b [F#m]c [E]d [Gsus2]e [D]f\n`

  it('spells naturals as naturals, not as sharp enharmonics of the note below', () => {
    const html = renderToHtml(CONTENT, -2) // A major -> G major
    expect(html).toContain('>G5<')
    expect(html).toContain('>C<')
    expect(html).toContain('>Em<')
    expect(html).toContain('>D<')
    expect(html).toContain('>Fsus2<')
    expect(html).not.toContain('B#')
    expect(html).not.toContain('E#sus2')
  })
})

// ─── renderToText — same guarantees for the plain-text/print export path ─────

describe('renderToText with a {capo} directive', () => {
  const CONTENT = `{title: T}\n{key: G}\n{capo: 2}\n[Em]a [D]b [Cmaj7]c [G]d\n`

  it('renders chords verbatim — no capo auto-shift, no suffix renormalization', () => {
    const text = renderToText(CONTENT, 0)
    expect(text).toContain('Cmaj7')
    expect(text).not.toContain('Cma7')
    expect(text).not.toContain('Dm')
  })
})

// ─── renderToHtml — song content must never become live markup ───────────────
// chordsheetjs emits song text unescaped. Song content is untrusted (share
// links, team songs, imports), so renderToHtml sanitizes its output. Every
// position a ChordPro author controls is covered here.

describe('renderToHtml sanitizes untrusted song content', () => {
  const PAYLOAD = '<img src=x onerror=alert(1)>'
  const positions: Record<string, string> = {
    title:    `{title: ${PAYLOAD}}\n[C]la`,
    subtitle: `{title: T}\n{subtitle: ${PAYLOAD}}\n[C]la`,
    chord:    `{title: T}\n[${PAYLOAD}]la`,
    lyrics:   `{title: T}\n[C]la ${PAYLOAD} la`,
    comment:  `{title: T}\n{comment: ${PAYLOAD}}\n[C]la`,
    label:    `{title: T}\n{start_of_verse: ${PAYLOAD}}\n[C]la\n{end_of_verse}`,
  }

  for (const [position, content] of Object.entries(positions)) {
    it(`strips markup injected via the ${position}`, () => {
      const html = renderToHtml(content, 0)
      expect(html).not.toMatch(/<img|onerror/i)
    })
  }

  it('removes script elements and event-handler attributes', () => {
    const html = renderToHtml('{title: T}\n[C]a <script>alert(1)</script> <svg onload=alert(1)> b', 0)
    expect(html).not.toMatch(/<script|<svg|onload|alert/i)
  })

  it('keeps the chordsheetjs structure and the text of normal songs', () => {
    const html = renderToHtml('{title: Amazing Grace}\n{start_of_chorus}\n[G]Amazing [C]grace & <3\n{end_of_chorus}', 0)
    expect(html).toContain('<h1>Amazing Grace</h1>')
    expect(html).toContain('class="chord"')
    expect(html).toContain('class="lyrics"')
    expect(html).toContain('>G<')
    expect(html).toContain('&amp; &lt;3')
  })
})
