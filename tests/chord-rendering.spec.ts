/**
 * Chord rendering regression tests.
 *
 * Bug reports (against a real imported ChordPro file with {key: G} {capo: 2}):
 *  1. "Cmaj7" rendered grey/italic and truncated to "Cma7". Root cause:
 *     chordsheetjs's Html/Text formatters auto-transpose every chord by
 *     -capo semitones and re-normalize chord suffixes at render time whenever
 *     a {capo} directive is present — regardless of any transpose requested.
 *     "maj7" got rewritten to chordsheetjs's internal "ma7" spelling, which
 *     isn't in ChordCrew's isKnownChord() quality list, so it fell back to
 *     the "unknown chord" grey/italic annotation style.
 *  2. Transposing into an extreme key (e.g. G -> Gb) correctly respells a
 *     chord as "Cbmaj7", but "Cb" wasn't in isKnownChord()'s ROOTS list, so
 *     the same grey/italic fallback kicked in again for a different reason.
 *  3. Chord-only instrumental lines ("[Em] [D] [Cmaj7]") rendered with zero
 *     pixels between adjacent chords ("EmDCmaj7") because chordsheetjs drops
 *     the spaces between chord-only brackets, and a <ruby> element with an
 *     empty base has no width to separate it from its neighbour.
 *
 * These can only be verified in a real browser: the bug lives in DOM/CSS
 * layout (ruby element sizing) and in the exact class chordsheetjs's
 * formatters assign, not in the string output alone.
 */

import { test, expect, type Page } from '@playwright/test'
import { randomUUID } from 'crypto'

const CAPO_SONG = `{title: Capo Chord Test}
{key: G}
{capo: 2}

{comment: Interlude (2x)}
[Em] [D] [Cmaj7]

{start_of_verse: Verse}
[Em]Line one [D]with a [Cmaj7]chord [G]here
{end_of_verse}
`

interface Seeds {
  songId: string
}

async function seedSong(page: Page, content: string, title: string): Promise<Seeds> {
  const ids = { bookId: randomUUID(), songId: randomUUID(), now: Date.now() }
  await page.evaluate((d) => new Promise<void>((resolve, reject) => {
    const req = indexedDB.open('ChordCrewDB')
    req.onerror = () => reject(req.error)
    req.onsuccess = () => {
      const db = req.result
      const tx = db.transaction(['books', 'songs'], 'readwrite')
      tx.onerror = () => reject(tx.error)
      tx.oncomplete = () => resolve()
      tx.objectStore('books').put({
        id: d.bookId, title: 'Test', author: '', ownerId: 'local',
        readOnly: false, shareable: false, createdAt: d.now, updatedAt: d.now,
      })
      tx.objectStore('songs').put({
        id: d.songId, bookId: d.bookId, title: d.title, artist: '', tags: [],
        searchText: d.title, isFavorite: false, savedAt: d.now, updatedAt: d.now,
        transcription: {
          content: d.content, key: 'G', capo: 2, tempo: 0, timeSignature: '4/4',
          duration: 0, chordNotation: 'standard', instrument: 'guitar',
          tuning: 'standard', format: 'chordpro',
        },
      })
    }
  }), { ...ids, content, title })
  return { songId: ids.songId }
}

async function waitForApp(page: Page) {
  await page.goto('/')
  const langBtn = page.locator('button').filter({ hasText: 'English' }).first()
  const onboarding = await langBtn.waitFor({ state: 'visible', timeout: 10_000 })
    .then(() => true).catch(() => false)
  if (onboarding) {
    await langBtn.click()
    await page.locator('button').filter({ hasText: /local mode/i }).first()
      .waitFor({ state: 'visible', timeout: 5000 })
    await page.locator('button').filter({ hasText: /local mode/i }).first().click()
    await page.locator('button').filter({ hasText: /^Skip$/i }).first()
      .waitFor({ state: 'visible', timeout: 5000 })
    await page.locator('button').filter({ hasText: /^Skip$/i }).first().click()
    await page.waitForURL(/\/library/, { timeout: 8000 })
  }
  await page.locator('aside').first().waitFor({ state: 'attached', timeout: 8000 })
}

async function openViewer(page: Page, songId: string) {
  await page.goto(`/view/${songId}`)
  await page.locator('.chordpro-output').waitFor({ state: 'visible', timeout: 15_000 })
  await page.waitForTimeout(300)
}

// Given a chord's visible text, find its rendered <rt> chord annotation and
// report whether it carries the "unknown chord" grey/italic fallback class.
async function chordInfo(page: Page, chordText: string) {
  return page.evaluate((text) => {
    const rt = Array.from(document.querySelectorAll('rt.chord'))
      .find(el => el.textContent === text)
    if (!rt) return null
    return {
      isAnnotation: rt.classList.contains('chord-annotation'),
      text: rt.textContent,
    }
  }, chordText)
}

test.describe('Chord rendering — capo directive must not alter chords', () => {
  let songId: string

  test.beforeEach(async ({ page }) => {
    await waitForApp(page)
    ;({ songId } = await seedSong(page, CAPO_SONG, 'Capo Chord Test'))
  })

  test('Cmaj7 renders verbatim as a real chord, not the grey "unknown chord" fallback', async ({ page }) => {
    await openViewer(page, songId)
    const info = await chordInfo(page, 'Cmaj7')
    expect(info, '"Cmaj7" must appear verbatim somewhere in the rendered chord sheet').not.toBeNull()
    expect(info!.isAnnotation, 'Cmaj7 must not fall back to chord-annotation styling').toBe(false)
  })

  test('capo does not silently shift chord roots down in pitch', async ({ page }) => {
    await openViewer(page, songId)
    const html = await page.locator('.chordpro-output').innerHTML()
    // The auto-capo-shift bug would turn Em -> Dm, D -> C, G -> F.
    expect(html).not.toMatch(/>Dm</)
    expect(html).not.toMatch(/>F</)
  })

  test('transposing into an extreme key (G -> Gb) still renders a real chord, not grey text', async ({ page }) => {
    await openViewer(page, songId)
    // G major -> Gb major is one semitone down; Gb major's key signature
    // respells the IV chord "Cmaj7" as "Cbmaj7".
    await page.getByRole('button', { name: 'Transpose down' }).click()
    await page.waitForTimeout(200)

    const info = await chordInfo(page, 'Cbmaj7')
    expect(info, '"Cbmaj7" must appear verbatim after transposing G -> Gb').not.toBeNull()
    expect(info!.isAnnotation, 'Cbmaj7 must not fall back to chord-annotation styling').toBe(false)
  })
})

test.describe('Chord rendering — chord-only rows must have visible spacing', () => {
  test('adjacent chords in an instrumental line do not touch (0px gap)', async ({ page }) => {
    await waitForApp(page)
    const { songId } = await seedSong(page, CAPO_SONG, 'Capo Chord Test 2')
    await openViewer(page, songId)

    const gaps = await page.evaluate(() => {
      const comments = Array.from(document.querySelectorAll('.comment'))
      const interludeComment = comments.find(c => c.textContent?.includes('Interlude'))
      if (!interludeComment) return { error: 'interlude comment not found' }
      let chordRow = interludeComment.closest('.row')?.nextElementSibling as HTMLElement | null
      while (chordRow && !chordRow.classList.contains('row')) chordRow = chordRow.nextElementSibling as HTMLElement | null
      if (!chordRow) return { error: 'chord row not found' }
      const rubies = Array.from(chordRow.querySelectorAll('ruby'))
      const rects = rubies.map(r => r.getBoundingClientRect())
      const measuredGaps: number[] = []
      for (let i = 1; i < rects.length; i++) {
        measuredGaps.push(rects[i].x - (rects[i - 1].x + rects[i - 1].width))
      }
      return { gaps: measuredGaps, count: rubies.length }
    })

    expect((gaps as { error?: string }).error, JSON.stringify(gaps)).toBeUndefined()
    const { gaps: measuredGaps, count } = gaps as { gaps: number[]; count: number }
    expect(count, 'expected 3 chord-only rubies (Em, D, Cmaj7)').toBe(3)
    for (const gap of measuredGaps) {
      expect(gap, `adjacent chord-only rubies must have a visible gap, got ${JSON.stringify(measuredGaps)}`).toBeGreaterThan(2)
    }
  })

  test('a normal lyric line does not get the chord-only-row spacing fix applied', async ({ page }) => {
    await waitForApp(page)
    const { songId } = await seedSong(page, CAPO_SONG, 'Capo Chord Test 3')
    await openViewer(page, songId)

    // Find the verse row by one of its lyric words (ruby DOM order interleaves
    // rt/chord text between base/lyric text nodes, so checking row.textContent
    // for the full phrase is unreliable — check the base text nodes directly).
    const result = await page.evaluate(() => {
      const row = Array.from(document.querySelectorAll('.row'))
        .find(r => Array.from(r.querySelectorAll('ruby')).some(ruby => {
          const base = Array.from(ruby.childNodes).find(n => n.nodeType === Node.TEXT_NODE)
          return base?.textContent?.includes('Line one')
        }))
      if (!row) return { found: false }
      const rubies = Array.from(row.querySelectorAll('ruby'))
      const baseTexts = rubies.map(r => {
        const base = Array.from(r.childNodes).find(n => n.nodeType === Node.TEXT_NODE)
        return base?.textContent ?? ''
      })
      const marginRights = rubies.map(r => (r as HTMLElement).style.marginRight)
      return { found: true, joinedLyrics: baseTexts.join(''), marginRights }
    })

    expect(result.found, 'verse row with "Line one" not found').toBe(true)
    expect(result.joinedLyrics).toBe('Line one with a chord here')
    // The chord-only-row fix (margin-right between chords) must never apply
    // to a row that has real lyrics.
    expect(result.marginRights?.every(m => m === '')).toBe(true)
  })
})
