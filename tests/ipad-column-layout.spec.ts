/**
 * iPad Pro 13" landscape — CSS column layout regression tests.
 *
 * Bug: with 4+ columns in performance/page-flip mode, content wraps
 * incorrectly or overflows. Reported against:
 *   /perform/{songId}?setlistId=...&pos=3 on iPad 13" landscape.
 *
 * The layout stack that must work:
 *   fixed.inset-0.flex-col (PerformancePage root)
 *     └─ flex-1.overflow-x-auto.overflow-y-hidden  (multi-column scroll pane)
 *          └─ h-full.px-6.pb-6  (padding wrapper)
 *               └─ .chordpro-output.page-flip.chordpro-columns-4
 *                    height: 100%; column-fill: auto;  ← must resolve to a px value
 *
 * Test projects:  ipad-13-landscape (defined inline below via use:{})
 * Run:  npx playwright test tests/ipad-column-layout.spec.ts
 */

import { test, expect, type Page } from '@playwright/test'
import { randomUUID } from 'crypto'

// ── Device profile ────────────────────────────────────────────────────────────
// iPad Pro 12.9" / 13" landscape: 2732×2048px display at 2× → 1366×1024 CSS px

test.use({
  viewport: { width: 1366, height: 1024 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  userAgent:
    'Mozilla/5.0 (iPad; CPU OS 17_4 like Mac OS X) AppleWebKit/605.1.15 ' +
    '(KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
})

// ── Song fixture ──────────────────────────────────────────────────────────────
// Must be long enough that 4-column page-flip mode creates MULTIPLE pages
// (5+ CSS columns, i.e. horizontal overflow into a second swipe-page).
//
// At 1366×1024, controls ~64px, pb-6=24px → column height ≈ 936px.
// At 16px base font, one chord+lyric ruby pair ≈ 40px.
// Each CSS column holds ≈ 936/40 = 23 rows.
// 4 columns × 23 rows = 92 rows per "page".
// Section labels + margins add ~30px per section.
// Use ≥110 rows to guarantee overflow into a 5th column (second swipe-page).

// One verse block = 6 rows + 6-row chorus + labels ≈ 510px
// repeated 10 times = 5100px > 4 × 936 = 3744px → guarantees overflow
const VERSE_BLOCK = (n: number) => `
{start_of_verse: Verse ${n}}
[G]Great is the [D]Lord and wor[Em]thy of praise
[C]His love en[G]dures for[D]ever and ever
[G]Lift up your [D]voice and [Em]sing to His [C]name
[G]His glory [D]shines for[G]ever and evermore
[G]From the [D]rising of the [Em]sun to the [C]going down
[G]We will [D]praise His [G]name always
{end_of_verse}

{start_of_chorus: Chorus}
[C]Ho[G]ly ho[D]ly ho[Em]ly is the Lord God Almighty
[C]Heaven and earth are [G]full of His [D]glory and grace
[C]Ho[G]ly ho[D]ly ho[Em]ly is the Lord our God
[G]Worthy of [D]praise and honour for[G]ever
[Em]All the an[C]gels cry [G]holy holy
[D]All cre[Em]ation sings [C]holy is the Lord
{end_of_chorus}
`

const LONG_SONG = `{title: Great Is The Lord}
{artist: Worship Band}
{key: G}
{tempo: 76}
${Array.from({ length: 8 }, (_, i) => VERSE_BLOCK(i + 1)).join('')}
{start_of_bridge: Bridge}
[Em]You are ex[C]alted far a[G]bove all gods
[D]There is none [Em]like you Lord
[Em]Every knee shall [C]bow and every [G]tongue confess
[D]That you are [Em]Lord
[Em]Your love en[C]dures for[G]ever and ever
[D]Your mercy never [Em]ends never fails
[Em]From ever[C]lasting to ever[G]lasting you are God
[D]And we will [Em]praise you forever
{end_of_bridge}
${VERSE_BLOCK(9)}
{start_of_verse: Outro}
[G]Great is the [D]Lord for[Em]ever amen
[C]His love will [G]never [D]fail us
[G]We will [D]praise Him [Em]now and [C]forever
[G]Great is [D]the [G]Lord
{end_of_verse}
`

// ── IDB seed ──────────────────────────────────────────────────────────────────

interface Seeds {
  songId: string
  setlistId: string
  itemId: string
}

async function seedIdb(page: Page): Promise<Seeds> {
  const ids = {
    bookId:    randomUUID(),
    songId:    randomUUID(),
    setlistId: randomUUID(),
    itemId:    randomUUID(),
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
          id: d.bookId, title: 'iPad Test Book', author: 'Test',
          ownerId: 'local', readOnly: false, shareable: false,
          createdAt: d.now, updatedAt: d.now,
        })

        tx.objectStore('songs').put({
          id: d.songId, bookId: d.bookId, title: 'Great Is The Lord',
          artist: 'Worship Band', tags: [], searchText: 'Great Is The Lord Worship Band',
          isFavorite: false, savedAt: d.now, updatedAt: d.now,
          transcription: {
            content: d.content, key: 'G', capo: 0, tempo: 76,
            timeSignature: '4/4', duration: 0,
            chordNotation: 'standard', instrument: 'guitar',
            tuning: 'standard', format: 'chordpro',
          },
        })

        tx.objectStore('setlists').put({
          id: d.setlistId, name: 'iPad Test Setlist',
          ownerId: 'local', createdAt: d.now, updatedAt: d.now,
        })

        tx.objectStore('setlistItems').put({
          id: d.itemId, setlistId: d.setlistId, order: 0,
          type: 'song', songId: d.songId, transposeOffset: 0,
        })
      }
    })
  }, { ...ids, content: LONG_SONG })

  return { songId: ids.songId, setlistId: ids.setlistId, itemId: ids.itemId }
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

async function openPerformance(page: Page, songId: string, setlistId: string, pos = 0) {
  await page.goto(`/perform/${songId}?setlistId=${setlistId}&pos=${pos}`)
  await page.locator('.chordpro-output').waitFor({ state: 'visible', timeout: 15_000 })
  await page.waitForTimeout(400)
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

test.describe('iPad 13" landscape — 4-column layout', () => {
  let seeds: Seeds

  test.beforeEach(async ({ page }) => {
    await waitForApp(page)
    seeds = await seedIdb(page)
  })

  // ── IPAD-1: landscape default is 4 columns ─────────────────────────────────
  // getDefaultColumns() returns 4 when orientation is landscape.
  // On a 1366×1024 viewport (width > height) this must apply automatically.

  test('IPAD-1: performance page defaults to 4-column layout in landscape', async ({ page }) => {
    await openPerformance(page, seeds.songId, seeds.setlistId)

    const columnClass = await page.evaluate(() => {
      const el = document.querySelector('.chordpro-output')
      if (!el) return ''
      return Array.from(el.classList).find(c => c.startsWith('chordpro-columns-')) ?? ''
    })

    expect(columnClass, 'landscape viewport must default to 4 columns').toBe('chordpro-columns-4')
  })

  // ── IPAD-2: page-flip container has a concrete computed height ─────────────
  // .chordpro-output.page-flip uses height:100%. If the parent chain lacks a
  // concrete height, this resolves to 0 and CSS column-fill:auto produces only
  // one column (all content stacks in column 1, no horizontal paging).

  test('IPAD-2: page-flip container resolves to a concrete non-zero height', async ({ page }) => {
    await openPerformance(page, seeds.songId, seeds.setlistId)

    const { outputHeight, parentHeight, grandparentHeight } = await page.evaluate(() => {
      const output = document.querySelector('.chordpro-output.page-flip') as HTMLElement | null
      const parent = output?.parentElement as HTMLElement | null
      const grandparent = parent?.parentElement as HTMLElement | null
      return {
        outputHeight:      output      ? output.getBoundingClientRect().height      : -1,
        parentHeight:      parent      ? parent.getBoundingClientRect().height      : -1,
        grandparentHeight: grandparent ? grandparent.getBoundingClientRect().height : -1,
      }
    })

    expect(grandparentHeight, 'scroll pane (flex-1) must have concrete height').toBeGreaterThan(100)
    expect(parentHeight, 'padding wrapper (h-full) must have concrete height').toBeGreaterThan(100)
    expect(outputHeight, '.chordpro-output.page-flip must have concrete height (not 0)').toBeGreaterThan(100)
  })

  // ── IPAD-3: content flows into multiple CSS columns ────────────────────────
  // When height is concrete and content is long enough, column-fill:auto creates
  // extra columns to the right. The scroll container's scrollWidth must exceed
  // its clientWidth — that is the horizontal paging mechanism.
  // If this fails, all content piles into column 1 and users cannot page forward.

  test('IPAD-3: content overflows into multiple columns (horizontal scrollable area)', async ({ page }) => {
    await openPerformance(page, seeds.songId, seeds.setlistId)

    const { scrollWidth, clientWidth, columnCount } = await page.evaluate(() => {
      const scrollPane = document.querySelector('.chordpro-output.page-flip')?.parentElement?.parentElement as HTMLElement | null
      const output = document.querySelector('.chordpro-output') as HTMLElement | null
      const colClass = Array.from(output?.classList ?? []).find(c => c.startsWith('chordpro-columns-')) ?? ''
      const columnCount = colClass ? parseInt(colClass.replace('chordpro-columns-', ''), 10) : 0
      return {
        scrollWidth:  scrollPane ? scrollPane.scrollWidth  : 0,
        clientWidth:  scrollPane ? scrollPane.clientWidth  : 0,
        columnCount,
      }
    })

    expect(columnCount, 'must be in 4-column mode').toBe(4)
    expect(scrollWidth, 'scroll container must overflow horizontally (content in 2+ columns)').toBeGreaterThan(clientWidth)
  })

  // ── IPAD-4: no paragraph overflows the container height ───────────────────
  // break-inside:avoid on .paragraph prevents column breaks within a paragraph.
  // If a paragraph is taller than the column height, it overflows below the
  // viewport — the bottom portion is invisible and unreachable.
  // Each paragraph height must be <= column height (with 2px tolerance).

  test('IPAD-4: no paragraph exceeds column height (break-inside:avoid overflow)', async ({ page }) => {
    await openPerformance(page, seeds.songId, seeds.setlistId)

    const result = await page.evaluate(() => {
      const output = document.querySelector('.chordpro-output.page-flip') as HTMLElement | null
      if (!output) return { containerHeight: 0, overflowing: [] as string[] }

      const containerHeight = output.getBoundingClientRect().height
      const overflowing: string[] = []

      output.querySelectorAll<HTMLElement>('.paragraph').forEach((para, i) => {
        const h = para.getBoundingClientRect().height
        if (h > containerHeight + 2) {
          const label = para.querySelector('h3.label, .chord')?.textContent?.trim() ?? `paragraph[${i}]`
          overflowing.push(`"${label}" height=${Math.round(h)}px > container=${Math.round(containerHeight)}px`)
        }
      })

      return { containerHeight, overflowing }
    })

    expect(result.overflowing, 'paragraphs taller than column height cannot be reached by user:\n' + result.overflowing.join('\n')).toHaveLength(0)
  })

  // ── IPAD-5: CSS column widths match the 4-column layout ───────────────────
  // With column-count:4 and a 1366px viewport, each CSS column should be
  // approximately (containerWidth − 3 gaps) / 4.
  // A column narrower than ~200px on a 13" iPad means the column-count is being
  // silently ignored (content stacks in 1 column) or the container is too narrow.

  test('IPAD-5: CSS column width is consistent with 4-column layout (≥200px each)', async ({ page }) => {
    await openPerformance(page, seeds.songId, seeds.setlistId)

    const columnWidth = await page.evaluate(() => {
      const output = document.querySelector('.chordpro-output') as HTMLElement | null
      if (!output) return 0
      return parseFloat(getComputedStyle(output).columnWidth) || 0
    })

    // If column-width is 'auto' (0 from parseFloat), fall back to checking
    // that at least one paragraph renders within a reasonable column-sized box.
    if (columnWidth > 0) {
      expect(columnWidth, 'each CSS column must be ≥200px on a 13" iPad in 4-column mode').toBeGreaterThanOrEqual(200)
    } else {
      // column-width:auto — measure a paragraph's rendered width instead
      const paraWidth = await page.evaluate(() => {
        const para = document.querySelector('.chordpro-output .paragraph') as HTMLElement | null
        return para ? para.getBoundingClientRect().width : 0
      })
      // On 1366px viewport with 4 columns and reasonable padding:
      // max expected single-paragraph width ≈ 1366 / 4 × 1.5 (generous) = ~512px
      expect(paraWidth, 'paragraph width must fit within a 4-column layout').toBeLessThan(600)
      expect(paraWidth, 'paragraph width must be meaningful (>100px)').toBeGreaterThan(100)
    }
  })

  // ── IPAD-6: column selector responds and re-renders for column counts 3–5 ──
  // Switching between column counts must update the CSS class and reflow.
  // Tests the picker buttons in the controls toolbar.

  test('IPAD-6: column selector buttons switch between 3, 4, and 5 columns', async ({ page }) => {
    await openPerformance(page, seeds.songId, seeds.setlistId)

    for (const n of [3, 5, 4] as const) {
      // Column buttons are labeled "1" through "5" in the toolbar
      await page.locator('.bg-surface-2\\/80 button').filter({ hasText: String(n) }).first().tap()
      await page.waitForTimeout(200)

      const cls = await page.evaluate(() => {
        const el = document.querySelector('.chordpro-output')
        return Array.from(el?.classList ?? []).find(c => c.startsWith('chordpro-columns-')) ?? ''
      })
      expect(cls, `after tapping ${n}, column class must update`).toBe(`chordpro-columns-${n}`)
    }
  })

  // ── IPAD-8: chord annotations do not overflow their CSS column boundary ─────
  // `ruby rt` chord annotations have white-space:nowrap — on narrow 4-column
  // layouts (~311px/column) long chords like "Amaj7/C#" might overflow the column
  // boundary and visually overlap the next column's content.

  test('IPAD-8: chord annotations do not overflow their CSS column boundary', async ({ page }) => {
    await openPerformance(page, seeds.songId, seeds.setlistId)

    const scrollPane = page.locator('.chordpro-output.page-flip').locator('..').locator('..')
    const scrollLeft = await scrollPane.evaluate(el => el.scrollLeft)

    const result = await page.evaluate(({ scrollLeft }) => {
      const output = document.querySelector('.chordpro-output.page-flip') as HTMLElement | null
      if (!output) return { overflowing: [] as string[], columnWidthPx: 0 }

      const style = getComputedStyle(output)
      const outputRect = output.getBoundingClientRect()
      const columnCount = parseInt(style.columnCount) || 4
      const columnGap = parseFloat(style.columnGap) || 24

      // Column width is based on the VISIBLE container width (clientWidth), not
      // scrollWidth (which includes all overflow pages). clientWidth = one page width.
      const containerWidth = output.clientWidth
      const columnWidth = (containerWidth - (columnCount - 1) * columnGap) / columnCount

      const overflowing: string[] = []
      output.querySelectorAll<HTMLElement>('ruby rt').forEach(rt => {
        const rect = rt.getBoundingClientRect()
        // Convert viewport position to scrollable coordinate space.
        // outputRect.left is the output div's current left edge in the viewport.
        const relLeft = rect.left - outputRect.left + scrollLeft
        const relRight = rect.right - outputRect.left + scrollLeft
        // Which column (0-indexed)? Clamp in case of rounding to gap area.
        const stride = columnWidth + columnGap
        const colIndex = Math.max(0, Math.floor((relLeft + 1) / stride))
        // Right boundary of this column's content area
        const colRightEdge = (colIndex + 1) * columnWidth + colIndex * columnGap
        const overflow = relRight - colRightEdge
        if (overflow > 6) { // 6px tolerance for sub-pixel rendering
          overflowing.push(`"${rt.textContent?.trim()}" overflows by ${Math.round(overflow)}px (col ${colIndex + 1})`)
        }
      })

      return { overflowing, columnWidthPx: Math.round(columnWidth) }
    }, { scrollLeft })

    expect(
      result.overflowing,
      `Chord annotations must not overflow their column (col width: ${result.columnWidthPx}px):\n` + result.overflowing.join('\n')
    ).toHaveLength(0)
  })

  // ── IPAD-7: 5-column layout has narrower columns than 4-column ────────────
  // Verifies that switching column counts actually changes the CSS column-width.
  // With column-count:4, each column ≈ containerWidth/4.
  // With column-count:5, each column ≈ containerWidth/5 (narrower).
  // If both produce the same column-width, column-count CSS is not being applied.

  test('IPAD-7: 5-column layout produces narrower columns than 4-column', async ({ page }) => {
    await openPerformance(page, seeds.songId, seeds.setlistId)

    async function getColumnWidthPx() {
      return page.evaluate(() => {
        const output = document.querySelector('.chordpro-output') as HTMLElement | null
        if (!output) return 0
        // columnWidth in computed style is the actual computed pixel width of each column
        const cw = parseFloat(getComputedStyle(output).columnWidth)
        if (cw > 0) return cw
        // Fallback: measure the first paragraph's bounding box width
        const para = output.querySelector<HTMLElement>('.paragraph')
        return para ? para.getBoundingClientRect().width : 0
      })
    }

    // 4 columns (default in landscape)
    const colWidth4 = await getColumnWidthPx()

    // Switch to 5 columns
    await page.locator('.bg-surface-2\\/80 button').filter({ hasText: '5' }).first().tap()
    await page.waitForTimeout(300)
    const colWidth5 = await getColumnWidthPx()

    // 5-column columns must be narrower than 4-column columns.
    // On 1366px: 4-col ≈ 311px, 5-col ≈ 245px.
    expect(colWidth4, '4-column width must be > 0').toBeGreaterThan(0)
    expect(colWidth5, '5-column width must be > 0').toBeGreaterThan(0)
    expect(colWidth5, '5-column columns must be narrower than 4-column columns').toBeLessThan(colWidth4)
  })
})
