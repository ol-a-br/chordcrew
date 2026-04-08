/**
 * Performance mode (presentation) navigation tests — Android tablet
 *
 * Tests setlist navigation via swipe gestures in PerformancePage:
 *   PERF-1  Swipe forward within a multi-column song → stays on same song
 *   PERF-2  Swipe forward at last column → advances to next song
 *   PERF-3  Swipe backward at first column → returns to previous song
 *   PERF-4  Rapid swipes do not skip songs (regression for swipeFired bug)
 *   PERF-5  Cancel (X) button navigates to setlist, not the previous song
 *   PERF-6  Swipe hint shows CURRENT song index when swiping within a song
 *   PERF-7  Swipe hint shows NEW song index when crossing a song boundary
 *
 * Run: npx playwright test --project=android-tablet tests/performance-navigation.spec.ts
 */

import { test, expect, type Page, type CDPSession } from '@playwright/test'
import { randomUUID } from 'crypto'

// ── ChordPro helpers ──────────────────────────────────────────────────────────

/** Short song — fits in a single column (< 1 screen at 2 cols) */
const SHORT_SONG = (title: string) => `{title: ${title}}
{artist: Test Artist}
{key: G}

[G]Short [C]song [G]content
[D]One verse [G]only
`

/**
 * Long song — at 2-column layout on a 712px portrait viewport the CSS columns
 * layout spreads content across multiple screens. We need > 2 screens worth of
 * content so the scrollWidth exceeds 2 × clientWidth.
 */
const LONG_SONG = (title: string) => `{title: ${title}}
{artist: Test Artist}
{key: G}

{start_of_verse: Verse 1}
[G]Amazing [C]grace how [G]sweet the sound
[D]That saved a [G]wretch like me
[G]I once was [C]lost but [G]now am found
[D]Was blind but [G]now I see
{end_of_verse}

{start_of_chorus: Chorus}
[C]How great thou [G]art
[C]How great thou [G]art
[D]Then sings my [G]soul
[D]My saviour [G]God to thee
{end_of_chorus}

{start_of_verse: Verse 2}
[G]Through many [C]dangers [G]toils and snares
[D]I have already [G]come
[G]Tis grace that [C]brought me [G]safe thus far
[D]And grace will [G]lead me home
{end_of_verse}

{start_of_chorus: Chorus}
[C]How great thou [G]art
[C]How great thou [G]art
[D]Then sings my [G]soul
[D]My saviour [G]God to thee
{end_of_chorus}

{start_of_verse: Verse 3}
[G]When we've been [C]there ten [G]thousand years
[D]Bright shining [G]as the sun
[G]We've no less [C]days to [G]sing God's praise
[D]Than when we [G]first begun
{end_of_verse}

{start_of_chorus: Chorus}
[C]How great thou [G]art
[C]How great thou [G]art
[D]Then sings my [G]soul
[D]My saviour [G]God to thee
{end_of_chorus}
`

// ── IDB seed helpers ──────────────────────────────────────────────────────────

interface TestSetup {
  setlistId: string
  songIds: [string, string, string]   // [short-fits-1col, long-multi-col, short-fits-1col]
}

async function seedIdb(page: Page): Promise<TestSetup> {
  const ids = {
    bookId:    randomUUID(),
    song1Id:   randomUUID(),   // song A — short (1 column)
    song2Id:   randomUUID(),   // song B — long  (multi-column)
    song3Id:   randomUUID(),   // song C — short (1 column)
    setlistId: randomUUID(),
    item1Id:   randomUUID(),
    item2Id:   randomUUID(),
    item3Id:   randomUUID(),
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

        // Book
        tx.objectStore('books').put({
          id: d.bookId, title: 'Test Book', author: 'Test', description: '',
          ownerId: 'local', readOnly: false, shareable: false,
          createdAt: d.now, updatedAt: d.now,
        })

        // Helper to make a song object
        const makeSong = (id: string, title: string, content: string) => ({
          id, bookId: d.bookId, title, artist: 'Test Artist',
          tags: [], searchText: `Test Artist ${title}`,
          isFavorite: false, savedAt: d.now, updatedAt: d.now,
          transcription: {
            content, key: 'G', capo: 0, tempo: 0,
            timeSignature: '4/4', duration: 0,
            chordNotation: 'standard', instrument: 'guitar',
            tuning: 'standard', format: 'chordpro',
          },
        })

        tx.objectStore('songs').put(makeSong(d.song1Id, 'Song Alpha (Short)', d.shortSong1))
        tx.objectStore('songs').put(makeSong(d.song2Id, 'Song Beta (Long)',   d.longSong2))
        tx.objectStore('songs').put(makeSong(d.song3Id, 'Song Gamma (Short)', d.shortSong3))

        // Setlist
        tx.objectStore('setlists').put({
          id: d.setlistId, name: 'Perf Test Setlist',
          ownerId: 'local', createdAt: d.now, updatedAt: d.now,
        })

        // SetlistItems
        const makeItem = (id: string, songId: string, order: number) => ({
          id, setlistId: d.setlistId, order, type: 'song', songId,
          transposeOffset: 0,
        })
        tx.objectStore('setlistItems').put(makeItem(d.item1Id, d.song1Id, 0))
        tx.objectStore('setlistItems').put(makeItem(d.item2Id, d.song2Id, 1))
        tx.objectStore('setlistItems').put(makeItem(d.item3Id, d.song3Id, 2))
      }
    })
  }, {
    ...ids,
    shortSong1: SHORT_SONG('Song Alpha (Short)'),
    longSong2:  LONG_SONG('Song Beta (Long)'),
    shortSong3: SHORT_SONG('Song Gamma (Short)'),
  })

  return { setlistId: ids.setlistId, songIds: [ids.song1Id, ids.song2Id, ids.song3Id] }
}

// ── Navigation & app bootstrap ────────────────────────────────────────────────

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

/** Navigate to PerformancePage for song[pos] in the setlist and wait for render */
async function openPerformance(page: Page, setup: TestSetup, pos: number) {
  const { setlistId, songIds } = setup
  const songId = songIds[pos]
  await page.goto(`/perform/${songId}?setlistId=${setlistId}&pos=${pos}`)
  // Wait for spinner to clear and chordpro-output to appear
  await page.locator('.chordpro-output').waitFor({ state: 'visible', timeout: 15_000 })
  // Small settle: CSS column layout needs one paint after mount
  await page.waitForTimeout(200)
}

// ── Touch swipe via CDP ───────────────────────────────────────────────────────

/**
 * Simulate a horizontal swipe using the CDP Input API.
 * forward = left swipe (dx < 0) → next column / next song
 * backward = right swipe (dx > 0) → prev column / prev song
 */
async function swipe(cdp: CDPSession, direction: 'forward' | 'backward') {
  const y   = 600
  const startX = direction === 'forward' ? 580 : 130
  const endX   = direction === 'forward' ? 130 : 580
  const ts     = Date.now() / 1000

  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: startX, y, id: 0, radiusX: 10, radiusY: 10, rotationAngle: 0, force: 1 }],
    modifiers: 0, timestamp: ts,
  })
  await new Promise(r => setTimeout(r, 30))
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchEnd',
    touchPoints: [{ x: endX, y, id: 0, radiusX: 10, radiusY: 10, rotationAngle: 0, force: 1 }],
    modifiers: 0, timestamp: ts + 0.1,
  })
}

/** Returns the scroll position of the content container */
async function getScrollLeft(page: Page): Promise<number> {
  return page.evaluate(() => {
    const el = document.querySelector<HTMLElement>('.chordpro-output')?.closest<HTMLElement>('.overflow-x-auto')
      ?? document.querySelector<HTMLElement>('[class*="overflow-x-auto"]')
    return el?.scrollLeft ?? 0
  })
}

/** Returns true if the song content spans more than one viewport width */
async function isMultiColumn(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const el = document.querySelector<HTMLElement>('.chordpro-output')?.closest<HTMLElement>('.overflow-x-auto')
      ?? document.querySelector<HTMLElement>('[class*="overflow-x-auto"]')
    if (!el) return false
    return el.scrollWidth > el.clientWidth + 20
  })
}

/** Get the swipe hint text currently on screen (null if not visible) */
async function getSwipeHintText(page: Page): Promise<string | null> {
  const hint = page.locator('.rounded-full').filter({ hasText: /\d+\/\d+/ }).first()
  if (await hint.isVisible()) return hint.textContent()
  return null
}

// ═════════════════════════════════════════════════════════════════════════════
// Tests
// ═════════════════════════════════════════════════════════════════════════════

test.describe('Performance mode setlist navigation', () => {
  let setup: TestSetup
  let cdp: CDPSession

  test.beforeEach(async ({ page }) => {
    await waitForApp(page)
    setup = await seedIdb(page)
    cdp = await page.context().newCDPSession(page)
  })

  // ── PERF-1: Swipe forward within a multi-column song ─────────────────────

  test('PERF-1: swipe forward mid-song stays on same song', async ({ page }) => {
    // Song B is long and should span multiple columns
    await openPerformance(page, setup, 1)   // pos=1 = Song Beta (Long)

    const multiCol = await isMultiColumn(page)
    if (!multiCol) {
      console.log('PERF-1: Song Beta rendered as single column — skipping multi-col assertion')
      test.skip()
      return
    }

    const urlBefore = page.url()
    const scrollBefore = await getScrollLeft(page)

    await swipe(cdp, 'forward')
    await page.waitForTimeout(300)   // let scroll settle

    const urlAfter = page.url()
    const scrollAfter = await getScrollLeft(page)

    // URL must NOT have changed to a different song
    expect(urlAfter).toBe(urlBefore)
    // Scroll must have advanced (we moved to column 2)
    expect(scrollAfter).toBeGreaterThan(scrollBefore)
  })

  // ── PERF-2: Swipe forward at last column → next song ──────────────────────

  test('PERF-2: swipe forward at end of song advances to next song', async ({ page }) => {
    // Use Song Alpha (Short) at pos=0: fits on one screen → first swipe crosses boundary
    await openPerformance(page, setup, 0)

    const { setlistId, songIds } = setup

    // Confirm song A is single-page (or swipe until we reach end)
    // For a short song, first forward swipe should navigate to song B
    await swipe(cdp, 'forward')
    await page.waitForTimeout(500)

    // Should now be on Song Beta (pos=1)
    await expect(page).toHaveURL(
      new RegExp(`/perform/${songIds[1]}.*pos=1`),
      { timeout: 3000 }
    )
  })

  // ── PERF-3: Swipe backward at first column → previous song ─────────────────

  test('PERF-3: swipe backward at start of song returns to previous song', async ({ page }) => {
    const { setlistId, songIds } = setup

    // Start on Song Beta (pos=1), at the beginning (scrollLeft=0)
    await openPerformance(page, setup, 1)

    // Verify scrollLeft is 0 (beginning of song)
    const scrollLeft = await getScrollLeft(page)
    expect(scrollLeft).toBeLessThan(10)

    await swipe(cdp, 'backward')
    await page.waitForTimeout(500)

    // Should now be back on Song Alpha (pos=0)
    await expect(page).toHaveURL(
      new RegExp(`/perform/${songIds[0]}.*pos=0`),
      { timeout: 3000 }
    )
  })

  // ── PERF-4: Rapid forward swipes do not skip songs ─────────────────────────

  test('PERF-4: rapid swipes do not skip a song', async ({ page }) => {
    const { songIds } = setup

    // Start at Song Alpha (short, single-page) → one swipe should go to Song Beta
    await openPerformance(page, setup, 0)

    // Swipe forward twice in rapid succession (< 700ms apart)
    await swipe(cdp, 'forward')
    await page.waitForTimeout(100)   // deliberate race — faster than NAV_COOLDOWN_MS
    await swipe(cdp, 'forward')
    await page.waitForTimeout(700)   // let cooldown expire and navigation settle

    // Should be on Song Beta (pos=1), NOT Song Gamma (pos=2)
    const url = page.url()
    expect(url).toContain(songIds[1])
    expect(url).toContain('pos=1')
    expect(url).not.toContain(songIds[2])
  })

  // ── PERF-5: Cancel (X) button → setlist, not prev song ────────────────────
  //
  // Bug: navigate(-1) goes back through browser history which means it goes to
  // the previous song in the setlist, not to the setlist detail page.

  test('PERF-5: cancel button navigates to setlist, not previous song', async ({ page }) => {
    const { setlistId, songIds } = setup

    // Navigate: setlist detail → song A (pos 0) → song B (pos 1)
    await page.goto(`/setlists/${setlistId}`)
    await page.waitForLoadState('domcontentloaded')
    await openPerformance(page, setup, 0)    // song A
    await swipe(cdp, 'forward')              // go to song B
    await page.waitForTimeout(600)
    await expect(page).toHaveURL(/pos=1/, { timeout: 3000 })

    // Wait for song B to load
    await page.locator('.chordpro-output').waitFor({ state: 'visible', timeout: 10_000 })

    // Reveal controls: click in the top-left corner, above the tap-zone overlay
    // (the overlay starts at top-16 = 64px, so y=30 is safely above it)
    await page.mouse.click(60, 30)
    await page.waitForTimeout(300)

    // The X button is the first button in the controls overlay (top-left)
    const cancelBtn = page.locator('button').filter({ has: page.locator('svg') }).first()
    await cancelBtn.waitFor({ state: 'visible', timeout: 3000 })
    await cancelBtn.click()

    await page.waitForTimeout(500)

    const finalUrl = page.url()
    // Should be on the setlist page
    expect(finalUrl).toContain(`/setlists/${setlistId}`)
    // Must NOT have gone back to song A
    expect(finalUrl).not.toContain(`/perform/${songIds[0]}`)
    // Must NOT still be in performance mode
    expect(finalUrl).not.toContain('/perform/')
  })

  // ── PERF-6: Swipe hint shows CURRENT song when swiping mid-song ────────────
  //
  // Bug: targetPos is always currentPos+1 even when just scrolling columns
  // within the same song. Should show currentPos (1-indexed) when mid-song.

  test('PERF-6: swipe hint shows current song index when swiping mid-song', async ({ page }) => {
    // Use Song Beta (long) at pos=1 (song 2 of 3)
    await openPerformance(page, setup, 1)

    const multiCol = await isMultiColumn(page)
    if (!multiCol) {
      console.log('PERF-6: Song Beta is single-column — cannot test mid-song hint')
      test.skip()
      return
    }

    // Swipe forward (stays in same song since not at last column)
    await swipe(cdp, 'forward')

    // The hint should appear briefly — capture it quickly
    const hintText = await page.evaluate(() => {
      const pills = Array.from(document.querySelectorAll('[class*="rounded-full"]'))
      for (const el of pills) {
        if (/\d+\/\d+/.test(el.textContent ?? '')) return el.textContent?.trim() ?? null
      }
      return null
    })

    console.log(`PERF-6 hint text: "${hintText}"`)

    if (hintText) {
      // Song Beta is pos=1 (0-indexed), so 1-indexed = 2
      // Hint should show "2/3" (current song), NOT "3/3" (next song)
      expect(hintText).toContain('2/3')
      expect(hintText).not.toBe('‹ 3/3')
      expect(hintText).not.toBe('3/3 ›')
    }
  })

  // ── PERF-7: Swipe hint shows NEW song index when crossing boundary ──────────

  test('PERF-7: swipe hint shows next song index when crossing boundary', async ({ page }) => {
    // Use Song Alpha (short, 1 col) at pos=0 (song 1 of 3)
    await openPerformance(page, setup, 0)

    await swipe(cdp, 'forward')

    // Capture hint immediately
    const hintText = await page.evaluate(() => {
      const pills = Array.from(document.querySelectorAll('[class*="rounded-full"]'))
      for (const el of pills) {
        if (/\d+\/\d+/.test(el.textContent ?? '')) return el.textContent?.trim() ?? null
      }
      return null
    })

    console.log(`PERF-7 hint text: "${hintText}"`)

    if (hintText) {
      // Song Alpha is pos=0, navigating to pos=1 → hint should show "2/3"
      expect(hintText).toContain('2/3')
    }

    // Also confirm we actually navigated
    await page.waitForTimeout(400)
    await expect(page).toHaveURL(/pos=1/, { timeout: 3000 })
  })

  // ── PERF-8: Scroll is reset to column 1 when entering a new song ───────────

  test('PERF-8: new song starts at first column (scroll reset)', async ({ page }) => {
    // Navigate to Song Beta (long) via swipe from Song Alpha
    await openPerformance(page, setup, 0)

    // Go to song B
    await swipe(cdp, 'forward')
    await page.waitForTimeout(600)
    await expect(page).toHaveURL(/pos=1/, { timeout: 3000 })
    await page.locator('.chordpro-output').waitFor({ state: 'visible', timeout: 10_000 })
    await page.waitForTimeout(300)

    const scrollLeft = await getScrollLeft(page)
    expect(scrollLeft).toBe(0)

    // Swipe forward within song B (should advance to column 2, not navigate away)
    const multiCol = await isMultiColumn(page)
    if (multiCol) {
      await swipe(cdp, 'forward')
      await page.waitForTimeout(300)
      const scrollAfter = await getScrollLeft(page)
      expect(scrollAfter).toBeGreaterThan(0)
      // URL must not have changed to pos=2
      expect(page.url()).toContain('pos=1')
    }
  })
})
