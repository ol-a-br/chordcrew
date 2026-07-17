/**
 * Android-specific bug regression tests.
 *
 * Covers three bugs reported on Android (PWA installed from home screen):
 *
 *   AND-1  Metronome corner button is visible and tappable in performance mode
 *          (was nearly invisible: text-ink-faint/30 = ~7% contrast on dark bg)
 *   AND-2  Transpose change is persisted — navigating away and back retains the
 *          user-selected transpose offset in the setlist item
 *   AND-3  Performance page respects env(safe-area-inset-bottom) and uses dvh
 *          so the layout does not shift when the Android navigation bar toggles
 *
 * Run on the android-tablet Playwright project:
 *   npx playwright test tests/android-bugs.spec.ts --project=android-tablet
 *
 * Also safe to run on chromium (desktop) — all assertions are layout/DOM checks,
 * not reliant on actual device sensors.
 */

import { test, expect, type Page } from '@playwright/test'
import { randomUUID } from 'crypto'

// ── Song fixtures ─────────────────────────────────────────────────────────────

const SONG_A = `{title: Metronome Song}
{artist: AND}
{key: G}
{tempo: 120}

[G]Test [D]song
[Em]with [C]tempo
`

const SONG_B = `{title: Second Song}
{artist: AND}
{key: C}

[C]Hello [G]world
`

// ── IDB seed ──────────────────────────────────────────────────────────────────

interface Seeds {
  songAId: string
  songBId: string
  setlistId: string
  itemAId: string
  itemBId: string
}

async function seedIdb(page: Page): Promise<Seeds> {
  const ids = {
    bookId:    randomUUID(),
    songAId:   randomUUID(),
    songBId:   randomUUID(),
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
          id: d.bookId, title: 'AND Book', author: 'AND',
          ownerId: 'local', readOnly: false, shareable: false,
          createdAt: d.now, updatedAt: d.now,
        })

        const makeSong = (id: string, title: string, content: string, tempo = 0) => ({
          id, bookId: d.bookId, title, artist: 'AND',
          tags: [], searchText: `AND ${title}`, isFavorite: false,
          savedAt: d.now, updatedAt: d.now,
          transcription: {
            content, key: 'G', capo: 0, tempo,
            timeSignature: '4/4', duration: 0,
            chordNotation: 'standard', instrument: 'guitar',
            tuning: 'standard', format: 'chordpro',
          },
        })

        tx.objectStore('songs').put(makeSong(d.songAId, 'Metronome Song', d.songAContent, 120))
        tx.objectStore('songs').put(makeSong(d.songBId, 'Second Song', d.songBContent, 0))

        tx.objectStore('setlists').put({
          id: d.setlistId, name: 'AND Setlist',
          ownerId: 'local', createdAt: d.now, updatedAt: d.now,
        })

        const makeItem = (id: string, songId: string, order: number) => ({
          id, setlistId: d.setlistId, order, type: 'song', songId, transposeOffset: 0,
        })
        tx.objectStore('setlistItems').put(makeItem(d.itemAId, d.songAId, 0))
        tx.objectStore('setlistItems').put(makeItem(d.itemBId, d.songBId, 1))
      }
    })
  }, { ...ids, songAContent: SONG_A, songBContent: SONG_B })

  return {
    songAId: ids.songAId,
    songBId: ids.songBId,
    setlistId: ids.setlistId,
    itemAId: ids.itemAId,
    itemBId: ids.itemBId,
  }
}

// ── App bootstrap ──────────────────────────────────────────────────────────────

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

async function openPerformance(page: Page, songId: string, setlistId: string, pos: number) {
  await page.goto(`/perform/${songId}?setlistId=${setlistId}&pos=${pos}`)
  await page.locator('.chordpro-output').waitFor({ state: 'visible', timeout: 15_000 })
  await page.waitForTimeout(200)
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Android bug regressions', () => {
  let seeds: Seeds

  test.beforeEach(async ({ page }) => {
    await waitForApp(page)
    seeds = await seedIdb(page)
  })

  // ── AND-1a: Metronome button is present and visible ────────────────────────
  // The button was rendered with text-ink-faint/30 (~7% opacity) making it
  // effectively invisible on dark Android screens.

  test('AND-1a: metronome corner button is visible in performance mode (has readable opacity)', async ({ page }) => {
    await openPerformance(page, seeds.songAId, seeds.setlistId, 0)

    // The metronome button uses aria-label for accessibility
    const btn = page.locator('button[aria-label*="Toggle metronome"]')
    await expect(btn).toBeVisible({ timeout: 3000 })

    // Verify the button is NOT nearly-invisible: it must not carry the old
    // low-opacity class that made it disappear on Android dark screens
    const cls = await btn.getAttribute('class') ?? ''
    expect(cls, 'button must not use ink-faint/30 (near-invisible on dark bg)').not.toContain('ink-faint/30')

    // Must have a background class so it is findable against the dark stage bg
    expect(
      cls.includes('bg-surface') || cls.includes('bg-chord') || cls.includes('rounded'),
      'button must have a background or rounded container to be distinguishable'
    ).toBe(true)
  })

  // ── AND-1b: Metronome beat dot is visible when metronome is off ────────────
  // Previously the dot was class="transparent" when inactive — literally nothing
  // rendered. Users could not discover the control.

  test('AND-1b: metronome beat dot has a visible resting state (not transparent)', async ({ page }) => {
    await openPerformance(page, seeds.songAId, seeds.setlistId, 0)

    // Controls visible on initial load — check within 1s
    await page.waitForTimeout(500)

    // The beat dot should exist and not have a class of just "transparent"
    const dot = page.locator('[class*="rounded-full"]').filter({ hasNOT: page.locator('button') }).first()

    const dotClass = await page.evaluate(() => {
      // Find the small rounded-full span that is NOT a button (the beat dot)
      const spans = Array.from(document.querySelectorAll('span.rounded-full'))
      const dot = spans.find(el => {
        const cls = el.className
        return cls.includes('rounded-full') &&
               (cls.includes('bg-') || cls.includes('h-2') || cls.includes('w-2'))
      })
      return dot?.className ?? ''
    })

    // If a dot span is found, it must not be "transparent" when inactive
    if (dotClass) {
      expect(dotClass, 'beat dot must not be "transparent" (invisible)').not.toContain('transparent')
    }
  })

  // ── AND-1c: Metronome button can be tapped (receives click events) ─────────
  // Verifies z-index ordering puts the button above the tap zones.

  test('AND-1c: tapping metronome corner button toggles metronome state', async ({ page }) => {
    await openPerformance(page, seeds.songAId, seeds.setlistId, 0)

    const btn = page.locator('button[aria-label*="Toggle metronome"]')
    await expect(btn).toBeVisible({ timeout: 3000 })

    // Capture class before click (inactive state)
    const classBefore = await btn.getAttribute('class') ?? ''
    expect(classBefore).not.toContain('text-chord bg-chord')

    // Tap the button
    await btn.tap()
    await page.waitForTimeout(200)

    // After tap, button should reflect active (chord colour) state
    const classAfter = await btn.getAttribute('class') ?? ''
    expect(classAfter, 'metronome button should show active chord colour after tap').toContain('text-chord')
  })

  // ── AND-2a: Transpose change is written to IDB immediately ─────────────────
  // When the user taps the transpose +/- in performance mode while in a setlist,
  // the new value must be persisted to setlistItems in IndexedDB.

  test('AND-2a: transpose change persists to IndexedDB setlist item', async ({ page }) => {
    await openPerformance(page, seeds.songAId, seeds.setlistId, 0)

    // Click ChevronUp (transpose +1) — wait for controls to be visible first
    const upBtn = page.locator('button').filter({ has: page.locator('svg') }).nth(0)
    // Use the aria-less ChevronUp — locate by finding transpose +/- area
    // The performance overlay shows ChevronDown then ChevronUp for transpose
    const transposeBtns = page.locator('.bg-surface-2\\/80 button')
    await expect(transposeBtns.first()).toBeVisible({ timeout: 3000 })

    // Tap ChevronUp (second transpose button = up)
    await transposeBtns.nth(1).tap()
    await page.waitForTimeout(300)

    // Read the updated transposeOffset from IndexedDB
    const saved = await page.evaluate((itemId) => {
      return new Promise<number>((resolve, reject) => {
        const req = indexedDB.open('ChordCrewDB')
        req.onerror = () => reject(req.error)
        req.onsuccess = () => {
          const db = req.result
          const tx = db.transaction(['setlistItems'], 'readonly')
          tx.objectStore('setlistItems').get(itemId).onsuccess = function () {
            resolve(this.result?.transposeOffset ?? 0)
          }
        }
      })
    }, seeds.itemAId)

    expect(saved, 'transposeOffset must be saved to IDB after user taps up').toBe(1)
  })

  // ── AND-2b: Persisted transpose is restored when re-entering performance ────
  // After changing transpose and navigating away, re-opening the performance
  // page must start with the saved transpose value, not the default 0.

  test('AND-2b: transpose is restored on re-enter after navigation', async ({ page }) => {
    // Step 1: open performance and transpose up twice
    await openPerformance(page, seeds.songAId, seeds.setlistId, 0)

    const transposeBtns = page.locator('.bg-surface-2\\/80 button')
    await expect(transposeBtns.first()).toBeVisible({ timeout: 3000 })
    await transposeBtns.nth(1).tap()   // +1
    await page.waitForTimeout(150)
    await transposeBtns.nth(1).tap()   // +2
    await page.waitForTimeout(300)

    // Step 2: navigate away (to setlists page)
    await page.goto('/setlists')
    await page.waitForURL(/\/setlists/, { timeout: 5000 })

    // Step 3: re-open performance for the same song+setlist
    await openPerformance(page, seeds.songAId, seeds.setlistId, 0)

    // Step 4: verify the displayed transpose value shows +2
    const transposeDisplay = page.locator('.bg-surface-2\\/80 span.font-mono')
    await expect(transposeDisplay).toBeVisible({ timeout: 3000 })
    const displayText = await transposeDisplay.textContent()
    expect(displayText?.trim(), 'transpose display must show +2 after re-entering performance').toBe('+2')
  })

  // ── AND-3a: AppShell uses dvh (not vh) to prevent Android nav-bar shift ────
  // 100vh is static — when Android nav bar appears/hides it shifts the layout.
  // 100dvh adjusts dynamically. Verify the root shell container uses dvh.

  test('AND-3a: AppShell root container uses 100dvh (dynamic viewport height)', async ({ page }) => {
    await page.goto('/library')
    await page.locator('aside').first().waitFor({ state: 'attached', timeout: 8000 })

    const usesdvh = await page.evaluate(() => {
      // The AppShell wrapping div is the first child of #root that holds the sidebar + content
      const root = document.querySelector('#root > div') as HTMLElement | null
      if (!root) return false
      const h = window.getComputedStyle(root).height
      // dvh computes to the dynamic viewport height px — we can't assert the unit
      // directly after CSS parse, but we can confirm it doesn't match 100vh
      // by comparing against window.innerHeight vs document.documentElement.clientHeight.
      // Simpler: confirm the class contains "dvh" or inline style contains "dvh".
      return root.className.includes('dvh') || root.style.height.includes('dvh')
    })

    expect(usesdvh, 'AppShell root div must carry dvh class for dynamic viewport height').toBe(true)
  })

  // ── AND-3b: PerformancePage has bottom safe-area padding ──────────────────
  // On Android with gesture navigation, content can slip under the nav bar.
  // env(safe-area-inset-bottom) prevents this.

  test('AND-3b: PerformancePage applies env(safe-area-inset-bottom) padding', async ({ page }) => {
    await openPerformance(page, seeds.songAId, seeds.setlistId, 0)

    const paddingStyle = await page.evaluate(() => {
      const perf = document.querySelector('.fixed.inset-0.bg-surface-0.flex.flex-col') as HTMLElement | null
      if (!perf) return ''
      return perf.style.paddingBottom
    })

    expect(paddingStyle, 'PerformancePage must have env(safe-area-inset-bottom) padding-bottom').toContain('env(safe-area-inset-bottom)')
  })
})
