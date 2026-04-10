/**
 * Touch & tablet UX tests — cross-browser, runs on all Playwright projects:
 *   chromium · android-tablet · ipad
 *
 * Uses only standard Playwright APIs (no CDPSession / no Chrome DevTools Protocol)
 * so every test runs on both Chromium (Android) and WebKit (iPad / Safari).
 *
 * For swipe-gesture tests that require CDP touch injection see:
 *   tests/performance-navigation.spec.ts  (chromium / android-tablet only)
 *
 * Tests:
 *   TUX-1   Word-group DOM wrapper exists for mid-word chord columns
 *   TUX-2   Word-group columns share the same visual line (no mid-word break)
 *   TUX-3   Performance mode has an edit (pencil) button in the controls overlay
 *   TUX-4   Edit button navigates to /editor/{id}
 *   TUX-5   Performance controls auto-hide after 3 seconds of inactivity
 *   TUX-6   Arrow-key / pedal navigation does not reveal the controls overlay
 *   TUX-7   Tap the right half of the screen to advance to next setlist song
 *   TUX-8   Tapping the song content re-shows auto-hidden controls
 *   TUX-9   Mid-word split columns stay together in a word-group
 *   TUX-10  No spurious comma from double-space in lyrics
 *   TUX-11  Empty-chord columns are merged into predecessors
 *   TUX-12  Trailing chord (no lyrics) is not in a word-group
 *
 * Run all:
 *   npx playwright test tests/touch-ux.spec.ts
 * Run on a single project:
 *   npx playwright test --project=ipad tests/touch-ux.spec.ts
 */

import { test, expect, type Page } from '@playwright/test'
import { randomUUID } from 'crypto'

// ── ChordPro fixtures ─────────────────────────────────────────────────────────

/**
 * Song A — deliberately has a chord INSIDE two different words:
 *   [G]Kni[Am]en  →  "Kni" (col1) + "en" (col2) form "Knien" — must not split
 *   [C]Gott[D]es  →  "Gott" (col1) + "es" (col2) form "Gottes" — must not split
 */
const SONG_A_CONTENT = `{title: Mid-Word Test}
{artist: TUX}
{key: G}

[G]Kni[Am]en und be[G]ten
[C]Gott[D]es[G]sohn ist ge[D]kom[G]men
`

/** Song B — short, single-column, used as the "next song" in setlist nav tests */
const SONG_B_CONTENT = `{title: Second Song}
{artist: TUX}
{key: C}

[C]Hello [G]world
[Am]Testing done
`

/**
 * Song C — exercises several rendering edge cases:
 *   Line 1: long line with mid-word split "brin[F/A#]gt" — word parts must not
 *           be separated visually.
 *   Line 2: double spaces in lyrics "[F/A#],   text  b[F]et" — chordsheetjs has
 *           a bug that converts "  " to ", ". Preprocessing normalizes spaces.
 *   Line 3: trailing chord with no lyrics "Lob[Dm]" — the Dm chord must render
 *           at the same height as other chords (not pushed down by a word-group).
 */
const SONG_C_CONTENT = `{title: Wrap Line Test}
{artist: TUX}
{key: F}

[F]Wirf dein Vertrauen auf ihn denn er trägt dich und hält dich und lässt dich nicht los und brin[F/A#]gt dich ans Ziel
[F/A#],   Und Er hört Glauben wenn ich___  b[F]et
Singe Ihm Sei[(Csus)]n Lob[Dm]
`

// ── IDB seed ──────────────────────────────────────────────────────────────────

interface TestSetup {
  songAId: string
  songBId: string
  songCId: string
  setlistId: string
}

async function seedIdb(page: Page): Promise<TestSetup> {
  const ids = {
    bookId:    randomUUID(),
    songAId:   randomUUID(),
    songBId:   randomUUID(),
    songCId:   randomUUID(),
    setlistId: randomUUID(),
    itemAId:   randomUUID(),
    itemBId:   randomUUID(),
    now:       Date.now(),
  }

  await page.evaluate((d) => {
    return new Promise<void>((resolve, reject) => {
      const req = indexedDB.open('ChordCrewDB')
      req.onerror = () => reject(req.error)
      req.onsuccess = () => {
        const db = req.result
        const tx = db.transaction(['books', 'songs', 'setlists', 'setlistItems'], 'readwrite')
        tx.onerror = () => reject(tx.error)
        tx.oncomplete = () => resolve()

        tx.objectStore('books').put({
          id: d.bookId, title: 'TUX Book', author: 'TUX', description: '',
          ownerId: 'local', readOnly: false, shareable: false,
          createdAt: d.now, updatedAt: d.now,
        })

        const makeSong = (id: string, title: string, content: string) => ({
          id, bookId: d.bookId, title, artist: 'TUX',
          tags: [], searchText: `TUX ${title}`,
          isFavorite: false, savedAt: d.now, updatedAt: d.now,
          transcription: {
            content, key: 'G', capo: 0, tempo: 0,
            timeSignature: '4/4', duration: 0,
            chordNotation: 'standard', instrument: 'guitar',
            tuning: 'standard', format: 'chordpro',
          },
        })

        tx.objectStore('songs').put(makeSong(d.songAId, 'Mid-Word Test',   d.songAContent))
        tx.objectStore('songs').put(makeSong(d.songBId, 'Second Song',     d.songBContent))
        tx.objectStore('songs').put(makeSong(d.songCId, 'Wrap Line Test',  d.songCContent))

        tx.objectStore('setlists').put({
          id: d.setlistId, name: 'TUX Setlist',
          ownerId: 'local', createdAt: d.now, updatedAt: d.now,
        })

        const makeItem = (id: string, songId: string, order: number) => ({
          id, setlistId: d.setlistId, order, type: 'song', songId,
          transposeOffset: 0,
        })
        tx.objectStore('setlistItems').put(makeItem(d.itemAId, d.songAId, 0))
        tx.objectStore('setlistItems').put(makeItem(d.itemBId, d.songBId, 1))
      }
    })
  }, { ...ids, songAContent: SONG_A_CONTENT, songBContent: SONG_B_CONTENT, songCContent: SONG_C_CONTENT })

  return { songAId: ids.songAId, songBId: ids.songBId, songCId: ids.songCId, setlistId: ids.setlistId }
}

// ── App bootstrap ─────────────────────────────────────────────────────────────

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
  // Two aside elements on library page — use .first() to avoid strict mode violation
  await page.locator('aside').first().waitFor({ state: 'attached', timeout: 8000 })
}

/** Open PerformancePage for songId at setlist position pos */
async function openPerformance(page: Page, songId: string, setlistId: string, pos: number) {
  await page.goto(`/perform/${songId}?setlistId=${setlistId}&pos=${pos}`)
  await page.locator('.chordpro-output').waitFor({ state: 'visible', timeout: 15_000 })
  // Allow DOM post-processing (section badges, word-groups) to complete
  await page.waitForTimeout(200)
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Touch & tablet UX', () => {
  let setup: TestSetup

  test.beforeEach(async ({ page }) => {
    await waitForApp(page)
    setup = await seedIdb(page)
  })

  // ── TUX-1: Word-group DOM structure ──────────────────────────────────────────

  test('TUX-1: mid-word chord columns are wrapped in .word-group', async ({ page }) => {
    await page.goto(`/view/${setup.songAId}`)
    await page.locator('.chordpro-output').waitFor({ state: 'visible', timeout: 10_000 })
    await page.waitForTimeout(300)   // let useEffect post-processing complete

    const groupCount = await page.locator('.word-group').count()
    expect(groupCount).toBeGreaterThan(0)

    // Every .word-group must contain at least two .column children
    const allGroupsHaveMultipleCols = await page.evaluate(() => {
      const groups = document.querySelectorAll('.word-group')
      return Array.from(groups).every(g => g.querySelectorAll('.column').length >= 2)
    })
    expect(allGroupsHaveMultipleCols).toBe(true)
  })

  // ── TUX-2: Word-group columns on same visual line ─────────────────────────────

  test('TUX-2: word-group columns share the same visual line (no mid-word break)', async ({ page }) => {
    await page.goto(`/view/${setup.songAId}`)
    await page.locator('.chordpro-output').waitFor({ state: 'visible', timeout: 10_000 })
    await page.waitForTimeout(400)

    const result = await page.evaluate(() => {
      const groups = Array.from(document.querySelectorAll('.word-group'))
      if (groups.length === 0) return { checked: 0, broken: 0 }

      let broken = 0
      for (const group of groups) {
        const cols = Array.from(group.querySelectorAll<HTMLElement>('.column'))
        if (cols.length < 2) continue
        // Compare the bottom of the chord row (top of lyrics) for all columns.
        // We use the lyrics span top as the reference — all lyrics in a word-group
        // must be on the same visual line.
        const tops = cols.map(col => {
          const lyrics = col.querySelector<HTMLElement>('.lyrics')
          return lyrics ? Math.round(lyrics.getBoundingClientRect().top) : -1
        }).filter(t => t >= 0)

        const minTop = Math.min(...tops)
        const maxTop = Math.max(...tops)
        if (maxTop - minTop > 3) broken++   // > 3px tolerance = on different lines
      }
      return { checked: groups.length, broken }
    })

    expect(result.checked).toBeGreaterThan(0)
    expect(result.broken).toBe(0)
  })

  // ── TUX-3: Edit button present in performance mode ─────────────────────────

  test('TUX-3: performance mode controls include an edit (pencil) button', async ({ page }) => {
    await openPerformance(page, setup.songAId, setup.setlistId, 0)

    // Controls are visible on initial load — check before they auto-hide
    await expect(page.locator('button[title="Edit song"]')).toBeVisible({ timeout: 3000 })
  })

  // ── TUX-4: Edit button navigates to editor ────────────────────────────────────

  test('TUX-4: edit button navigates to /editor/{id}', async ({ page }) => {
    await openPerformance(page, setup.songAId, setup.setlistId, 0)

    await page.locator('button[title="Edit song"]').click()
    await page.waitForURL(/\/editor\//, { timeout: 5000 })

    expect(page.url()).toContain(setup.songAId)
  })

  // ── TUX-5: Controls auto-hide after 3 seconds ─────────────────────────────────

  test('TUX-5: performance controls auto-hide after 3 seconds of inactivity', async ({ page }) => {
    await openPerformance(page, setup.songAId, setup.setlistId, 0)

    // Controls visible immediately on load
    const overlay = page.locator('div.absolute.top-0.inset-x-0.z-10').first()
    await expect(overlay).toHaveClass(/opacity-100/, { timeout: 2000 })

    // After 3.5 s with no interaction, controls should be hidden
    await page.waitForTimeout(3500)
    await expect(overlay).toHaveClass(/opacity-0/, { timeout: 1000 })
  })

  // ── TUX-6: Arrow-key navigation does not reveal controls ─────────────────────

  test('TUX-6: arrow-key navigation does not reveal the controls overlay', async ({ page }) => {
    await openPerformance(page, setup.songAId, setup.setlistId, 0)

    // Wait for controls to auto-hide
    const overlay = page.locator('div.absolute.top-0.inset-x-0.z-10').first()
    await page.waitForTimeout(3500)
    await expect(overlay).toHaveClass(/opacity-0/, { timeout: 1000 })

    // Navigate with keyboard
    await page.keyboard.press('ArrowRight')
    await page.waitForTimeout(500)

    // Controls must stay hidden
    await expect(overlay).toHaveClass(/opacity-0/)
    // opacity-100 must NOT be present
    const cls = await overlay.getAttribute('class') ?? ''
    expect(cls).not.toContain('opacity-100')
  })

  // ── TUX-7: Tap right half navigates to next setlist song ──────────────────────

  test('TUX-7: tapping the right half of the screen advances to next setlist song', async ({ page }) => {
    await openPerformance(page, setup.songAId, setup.setlistId, 0)

    const viewport = page.viewportSize()!
    // Click right-half tap zone, below the controls overlay (top-16 = 64px)
    await page.mouse.click(
      Math.floor(viewport.width * 0.75),
      Math.floor(viewport.height * 0.5),
    )
    await page.waitForTimeout(800)

    // Should navigate to Song B (pos=1)
    expect(page.url()).toContain(setup.songBId)
    expect(page.url()).toContain('pos=1')
  })

  // ── TUX-8: Tapping content re-shows hidden controls ───────────────────────────

  test('TUX-8: tapping the song content re-shows auto-hidden controls', async ({ page }) => {
    await openPerformance(page, setup.songAId, setup.setlistId, 0)

    const overlay = page.locator('div.absolute.top-0.inset-x-0.z-10').first()

    // Wait for controls to hide
    await page.waitForTimeout(3500)
    await expect(overlay).toHaveClass(/opacity-0/, { timeout: 1000 })

    // Tap the centre of the song content area (below tap zones' concern)
    const viewport = page.viewportSize()!
    await page.mouse.click(
      Math.floor(viewport.width * 0.5),
      Math.floor(viewport.height * 0.5),
    )
    await page.waitForTimeout(300)

    // Controls should be visible again
    await expect(overlay).toHaveClass(/opacity-100/, { timeout: 2000 })
  })

  // ── TUX-9: Mid-word columns are in a word-group ────────────────────────────
  // "brin[F/A#]gt" must produce a .word-group wrapper so both halves stay
  // together when flex-wrap kicks in.  Both chords must be at the same height.

  test('TUX-9: mid-word split columns stay together in a word-group', async ({ page }) => {
    await page.goto(`/view/${setup.songCId}`)
    await page.locator('.chordpro-output').waitFor({ state: 'visible', timeout: 10_000 })
    await page.waitForTimeout(400)

    const result = await page.evaluate(() => {
      // Find a word-group that contains both "brin" and "gt"
      const groups = Array.from(document.querySelectorAll('.chordpro-output .word-group'))
      for (const g of groups) {
        const lyricsEls = Array.from(g.querySelectorAll('.lyrics'))
        const allText = lyricsEls.map(el => el.textContent ?? '').join('|')
        if (allText.includes('brin') && allText.includes('gt')) {
          // Check chord heights: all chords in the group should be at the same top
          const chords = Array.from(g.querySelectorAll('.chord'))
          const tops = chords.map(c => Math.round(c.getBoundingClientRect().top))
          const nonEmpty = chords.filter(c => c.textContent?.trim() !== '')
          return {
            found: true,
            chordCount: nonEmpty.length,
            chordTopsAligned: tops.length < 2 || Math.abs(tops[0] - tops[1]) < 3,
            hasContinuationClass: g.querySelector('.continuation') !== null,
          }
        }
      }
      return { found: false, chordCount: 0, chordTopsAligned: false, hasContinuationClass: false }
    })

    expect(result.found, 'word-group containing "brin" and "gt" not found').toBe(true)
    expect(result.chordCount, 'expected 2 chords in word-group').toBe(2)
    expect(result.chordTopsAligned, 'chord tops must be at the same height').toBe(true)
    expect(result.hasContinuationClass, 'continuation column must have .continuation class').toBe(true)
  })

  // ── TUX-10: No comma artifact from double-space normalization ────────────────
  // chordsheetjs converts "  " (double space) to ", " in lyrics text.
  // Our preprocessor normalizes consecutive spaces to prevent this.

  test('TUX-10: no spurious comma from double-space in lyrics', async ({ page }) => {
    await page.goto(`/view/${setup.songCId}`)
    await page.locator('.chordpro-output').waitFor({ state: 'visible', timeout: 10_000 })
    await page.waitForTimeout(400)

    const text = await page.evaluate(() => {
      return document.querySelector('.chordpro-output')?.textContent ?? ''
    })
    // The source has "ich___  b" (double space) which chordsheetjs would turn into
    // "ich___ , b". After preprocessing, the comma must not appear.
    expect(text).not.toContain('ich___ , b')
    expect(text).toContain('ich___')
  })

  // ── TUX-11: Empty-chord columns are merged ─────────────────────────────────
  // chordsheetjs splits lyrics at the first word boundary, creating extra columns
  // with empty chords. Post-processing merges them into the predecessor.

  test('TUX-11: no empty-chord columns in rendered output', async ({ page }) => {
    await page.goto(`/view/${setup.songCId}`)
    await page.locator('.chordpro-output').waitFor({ state: 'visible', timeout: 10_000 })
    await page.waitForTimeout(400)

    const emptyChordCount = await page.evaluate(() => {
      const chords = Array.from(document.querySelectorAll('.chordpro-output .row .chord'))
      return chords.filter(c => c.textContent?.trim() === '').length
    })

    // After merging, no column should have an empty chord div
    // (except the very first column of a row which may legitimately have no chord)
    // We allow first-column empty chords since they can't be merged into a predecessor.
    const firstColEmptyCount = await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('.chordpro-output .row'))
      let count = 0
      for (const row of rows) {
        const firstCol = row.querySelector(':scope > .column, :scope > .word-group .column')
        if (firstCol) {
          const chord = firstCol.querySelector('.chord')
          if (chord && chord.textContent?.trim() === '') count++
        }
      }
      return count
    })

    expect(emptyChordCount, 'all empty-chord columns should be merged or be first-column').toBe(firstColEmptyCount)
  })

  // ── TUX-12: Trailing chord (no lyrics) is not in a word-group ────────────
  // "Lob[Dm]" — the Dm has no following lyrics. It must NOT be grouped into
  // a word-group, so its chord renders at the normal chord height.

  test('TUX-12: trailing chord without lyrics is not in a word-group', async ({ page }) => {
    await page.goto(`/view/${setup.songCId}`)
    await page.locator('.chordpro-output').waitFor({ state: 'visible', timeout: 10_000 })
    await page.waitForTimeout(400)

    const result = await page.evaluate(() => {
      // Find the Dm chord
      const chords = Array.from(document.querySelectorAll('.chordpro-output .chord'))
      const dmChord = chords.find(c => c.textContent?.trim() === 'Dm')
      if (!dmChord) return { found: false, inWordGroup: false, chordAligned: false }

      const column = dmChord.closest('.column')
      const inWordGroup = column?.closest('.word-group') !== null

      // Check: Dm chord top should match other chords in the same row
      const row = column?.closest('.row')
      if (!row) return { found: true, inWordGroup, chordAligned: false }
      const rowChords = Array.from(row.querySelectorAll('.chord')).filter(c => c.textContent?.trim() !== '')
      const tops = rowChords.map(c => Math.round(c.getBoundingClientRect().top))
      const dmTop = Math.round(dmChord.getBoundingClientRect().top)
      const aligned = tops.every(t => Math.abs(t - dmTop) < 5)

      return { found: true, inWordGroup, chordAligned: aligned }
    })

    expect(result.found, 'Dm chord not found').toBe(true)
    expect(result.inWordGroup, 'Dm column should NOT be in a word-group').toBe(false)
    expect(result.chordAligned, 'Dm chord should be at same height as other chords').toBe(true)
  })
})
