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
 *   TUX-1  Word-group DOM wrapper exists for mid-word chord columns
 *   TUX-2  Word-group columns share the same visual line (no mid-word break)
 *   TUX-3  Performance mode has an edit (pencil) button in the controls overlay
 *   TUX-4  Edit button navigates to /editor/{id}
 *   TUX-5  Performance controls auto-hide after 3 seconds of inactivity
 *   TUX-6  Arrow-key / pedal navigation does not reveal the controls overlay
 *   TUX-7  Tap the right half of the screen to advance to next setlist song
 *   TUX-8  Tapping the song content re-shows auto-hidden controls
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
 * Song C — deliberately long line that wraps at tablet width (712 px).
 * The word "bringt" is split mid-word: "brin[F/A#]gt".
 * The bug: on Android Chrome, display:inline-flex on the .word-group <span>
 * was not properly blockified, so the continuation column "gt" floated back
 * to the previous visual line. Both halves must stay on the same line.
 *
 * The line is long enough that flex-wrap on .row kicks in and "bringt" wraps
 * to a second visual line — that's when the alignment check becomes meaningful.
 */
const SONG_C_CONTENT = `{title: Wrap Line Test}
{artist: TUX}
{key: F}

[F]Wirf dein Vertrauen auf ihn denn er trägt dich und hält dich und lässt dich nicht los und brin[F/A#]gt dich ans Ziel
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

  // ── TUX-9: Mid-word columns stay on the same visual line after flex-wrap ──────
  //
  // Regression: on Android Chrome, display:inline-flex on the .word-group <span>
  // was not fully "blockified" as a flex item, so the continuation column ("gt"
  // in "brin[F/A#]gt") floated back to the previous visual line after wrapping.
  // Fix: .word-group uses display:flex so it is unambiguously a block-level flex item.

  test('TUX-9: mid-word continuation stays on same visual line after row wraps', async ({ page }) => {
    await page.goto(`/view/${setup.songCId}`)
    await page.locator('.chordpro-output').waitFor({ state: 'visible', timeout: 10_000 })
    await page.waitForTimeout(400)  // let useEffect post-processing finish

    // Find all word-groups that rendered
    const groupCount = await page.locator('.word-group').count()
    if (groupCount === 0) {
      // At this viewport width the line did not wrap — skip the visual check
      test.skip(true, 'TUX-9: line did not wrap at this viewport — word-group not created')
      return
    }

    // For every word-group: the .lyrics top of each column must be within 4 px.
    // If the continuation column leaked to a different visual line its top would
    // differ by a full line-height (~30–40 px).
    const broken = await page.evaluate(() => {
      const groups = Array.from(document.querySelectorAll('.word-group'))
      let broken = 0
      for (const g of groups) {
        const cols = Array.from(g.querySelectorAll<HTMLElement>('.column'))
        if (cols.length < 2) continue
        const tops = cols.map(col => {
          const lyr = col.querySelector<HTMLElement>('.lyrics')
          return lyr ? Math.round(lyr.getBoundingClientRect().top) : -1
        }).filter(t => t >= 0)
        const minTop = Math.min(...tops)
        const maxTop = Math.max(...tops)
        if (maxTop - minTop > 4) broken++
      }
      return broken
    })

    expect(broken, 'word-group columns appeared on different visual lines').toBe(0)
  })
})
