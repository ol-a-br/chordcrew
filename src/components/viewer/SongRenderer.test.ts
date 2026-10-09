import { describe, it, expect } from 'vitest'
import { splitRubyBase } from './SongRenderer'

// A <ruby> never wraps internally in WebKit/Safari, so only the first word(s)
// of a lyric run may go into it — the rest must stay plain, wrappable text.

describe('splitRubyBase', () => {
  it('keeps only the first word under a short chord', () => {
    expect(splitRubyBase('Over the mountains and over the sea ', 'G'))
      .toEqual(['Over', ' the mountains and over the sea '])
  })

  it('keeps enough words to cover a wide chord, so no gap opens after the base', () => {
    expect(splitRubyBase('I will praise you Lord', 'Cadd9')).toEqual(['I will praise', ' you Lord'])
    expect(splitRubyBase('a long time ago', 'Cmaj7/G')).toEqual(['a long time', ' ago'])
  })

  it('keeps a whole run that is not longer than the chord', () => {
    expect(splitRubyBase('my ', 'Gsus4')).toEqual(['my ', ''])
    expect(splitRubyBase('', 'Em')).toEqual(['', ''])
  })

  it('splits a chordless run after its first word', () => {
    expect(splitRubyBase('Wenn bei dir ', '')).toEqual(['Wenn', ' bei dir '])
  })

  it('never loses or reorders text', () => {
    const lyrics = '  Und wenn die Nacht am dunkelsten ist, '
    for (const chord of ['', 'D', 'Em7', 'F#m7b5/C#']) {
      expect(splitRubyBase(lyrics, chord).join('')).toBe(lyrics)
    }
  })
})
