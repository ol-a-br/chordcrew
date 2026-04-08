/**
 * Android Tablet Navigation & Page-Switching Diagnostics
 *
 * Purpose: identify root cause of slow/buggy navigation on Android tablets.
 * Diagnosis only — no code is changed here.
 *
 * Run: npx playwright test --project=android-tablet tests/android-tablet.diag.spec.ts
 */

import { test, expect, type Page } from '@playwright/test'

// ── Constants ─────────────────────────────────────────────────────────────────
const SLOW_NAV_MS      = 300   // SPA route transition budget
const SLOW_RENDER_MS   = 100   // long-frame threshold for layout thrash detection
const TAP_DELAY_MS     = 250   // suspected 300ms tap delay starts here

// ── Shared helpers ─────────────────────────────────────────────────────────────

async function waitForApp(page: Page) {
  await page.goto('/')

  // On fresh browser contexts the onboarding shows (onboardingDone not set in IDB).
  // Use waitFor (not isVisible) so we actually wait for React to hydrate.
  const onboardingInProgress = await page
    .locator('button').filter({ hasText: 'English' }).first()
    .waitFor({ state: 'visible', timeout: 10_000 })
    .then(() => true)
    .catch(() => false)

  if (onboardingInProgress) {
    await page.locator('button').filter({ hasText: 'English' }).first().click()
    // Login step (Firebase not configured → "Continue in local mode")
    await page.locator('button').filter({ hasText: /local mode/i }).first()
      .waitFor({ state: 'visible', timeout: 5000 })
    await page.locator('button').filter({ hasText: /local mode/i }).first().click()
    // Tutorial step — Skip immediately marks onboardingDone:true in IDB
    await page.locator('button').filter({ hasText: /^Skip$/i }).first()
      .waitFor({ state: 'visible', timeout: 5000 })
    await page.locator('button').filter({ hasText: /^Skip$/i }).first().click()
    // Wait for IDB write + React re-render + React Router Navigate → /library
    await page.waitForURL(/\/library/, { timeout: 8000 })
  }

  // Always ensure we land on /library with the main AppShell rendered
  if (!page.url().includes('/library')) {
    await page.goto('/library')
  }
  await expect(page).toHaveURL(/\/library/, { timeout: 5000 })
  // Aside is the sidebar — only present in AppShell (not in onboarding)
  await page.locator('aside').first().waitFor({ state: 'attached', timeout: 8000 })
}

/** Open the mobile sidebar (hamburger menu) to make nav links visible */
async function openSidebar(page: Page) {
  const burger = page.locator('header button').filter({ has: page.locator('svg') }).first()
  if (await burger.isVisible({ timeout: 1000 }).catch(() => false)) {
    await burger.click()
    // Wait for sidebar to slide in
    await page.waitForTimeout(300)
  }
}

/** Inject a PerformanceObserver for long-animation-frame / longtask before page load */
async function installLongTaskObserver(page: Page) {
  await page.addInitScript(() => {
    ;(window as unknown as Record<string, unknown>).__diagLongTasks = []
    const record = (e: PerformanceEntry) =>
      ((window as unknown as Record<string, unknown[]>).__diagLongTasks as unknown[]).push({
        type: e.entryType,
        start: Math.round(e.startTime),
        duration: Math.round(e.duration),
      })

    let obs: PerformanceObserver | null = null
    try {
      obs = new PerformanceObserver(list => list.getEntries().forEach(record))
      obs.observe({ type: 'long-animation-frame', buffered: true })
    } catch {
      try {
        obs = new PerformanceObserver(list => list.getEntries().forEach(record))
        obs.observe({ type: 'longtask', buffered: true })
      } catch { /* not supported in this build */ }
    }
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Navigation timing
//    Measures wall-clock time for client-side route transitions.
//    Since ChordCrew is an SPA, we use link clicks (not page.goto) so React
//    Router handles it — same path the user takes on device.
// ─────────────────────────────────────────────────────────────────────────────

test('DIAG-1: route transition timing', async ({ page }) => {
  await waitForApp(page)

  type NavResult = { from: string; to: string; ms: number; method: string }
  const results: NavResult[] = []

  async function navigateAndTime(href: string, label: string, from: string): Promise<number> {
    // Use React Router's client-side navigation via history.pushState so we measure
    // the SPA transition, not a full page reload. page.goto causes a full reload.
    const t0 = Date.now()
    await page.evaluate((url) => window.history.pushState({}, '', url), href)
    // Wait for the route's content to mount
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(50)   // let React commit the render
    const ms = Date.now() - t0
    results.push({ from, to: label, ms, method: 'history.pushState' })
    return ms
  }

  await navigateAndTime('/setlists', '/setlists', '/library')
  await navigateAndTime('/settings', '/settings', '/setlists')
  await navigateAndTime('/library',  '/library',  '/settings')
  await navigateAndTime('/setlists', '/setlists', '/library')
  await navigateAndTime('/library',  '/library',  '/setlists')

  // ── Report ───────────────────────────────────────────────────────────────
  console.log('\n═══ DIAG-1: Route transition timing (android-tablet) ═══')
  const slow: NavResult[] = []
  for (const r of results) {
    const flag = r.ms > SLOW_NAV_MS ? '⚠  SLOW' : '✓ ok  '
    console.log(`  ${flag}  ${r.from} → ${r.to}  ${r.ms}ms  [${r.method}]`)
    if (r.ms > SLOW_NAV_MS) slow.push(r)
  }
  const avg = Math.round(results.reduce((s, r) => s + r.ms, 0) / results.length)
  console.log(`  avg: ${avg}ms   slow: ${slow.length}/${results.length}`)

  if (slow.length > 0) {
    test.info().annotations.push({
      type: 'finding',
      description: `SLOW transitions: ${slow.map(r => `${r.from}→${r.to}:${r.ms}ms`).join(', ')} — likely cause: ChordSheetJS sync parse blocking main thread on component mount`,
    })
  } else {
    test.info().annotations.push({ type: 'ruling-out', description: 'Route transitions are fast — routing overhead is not the bottleneck' })
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// 2. Layout thrashing
//    Looks for long-animation-frame / longtask entries during navigation.
//    Also checks how many times the body resizes after a route change.
// ─────────────────────────────────────────────────────────────────────────────

test('DIAG-2: layout thrashing & long frames during navigation', async ({ page }) => {
  await installLongTaskObserver(page)
  await waitForApp(page)

  // Navigate between a few routes to trigger long-frame recording
  await page.goto('/setlists')
  await page.waitForTimeout(200)
  await page.goto('/library')
  await page.waitForTimeout(200)
  await page.goto('/settings')
  await page.waitForTimeout(300)

  // Retrieve collected entries
  const tasks = await page.evaluate(() =>
    (window as unknown as Record<string, unknown[]>).__diagLongTasks ?? []
  ) as { type: string; start: number; duration: number }[]

  // Measure resize callbacks after a navigation settle
  const resizeCount = await page.evaluate(() => new Promise<number>(resolve => {
    let n = 0
    const obs = new ResizeObserver(() => n++)
    obs.observe(document.documentElement)
    setTimeout(() => { obs.disconnect(); resolve(n) }, 300)
  }))

  // ── Report ───────────────────────────────────────────────────────────────
  console.log('\n═══ DIAG-2: Long frames / layout thrash ═══')
  if (tasks.length === 0) {
    console.log('  No long frames recorded (API unsupported or nothing blocked > 50ms)')
  } else {
    for (const t of tasks) {
      const flag = t.duration > SLOW_RENDER_MS ? '⚠ ' : '  '
      console.log(`  ${flag}[${t.type}] t=${t.start}ms  duration=${t.duration}ms`)
    }
  }
  const longOnes = tasks.filter(t => t.duration > SLOW_RENDER_MS)
  console.log(`  Long tasks > ${SLOW_RENDER_MS}ms: ${longOnes.length}`)
  console.log(`  ResizeObserver callbacks during post-nav 300ms idle: ${resizeCount}`)

  if (longOnes.length > 0) {
    const worst = longOnes.reduce((a, b) => b.duration > a.duration ? b : a)
    test.info().annotations.push({
      type: 'finding',
      description: `${longOnes.length} long frame(s). Worst: ${worst.duration}ms at t=${worst.start}ms — main thread blocked, likely ChordSheetJS parse inside useMemo`,
    })
  } else {
    test.info().annotations.push({ type: 'ruling-out', description: 'No long frames detected in this browser context' })
  }

  if (resizeCount > 3) {
    test.info().annotations.push({
      type: 'finding',
      description: `${resizeCount} resize callbacks during idle — padding-top transition on controls show/hide causes layout reflow during navigation`,
    })
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// 3. React Router: lazy-route resolution
//    Checks whether dynamic import() chunks are fetched on each navigation
//    and how long they take. A hung Suspense boundary would keep the previous
//    route visible with no spinner.
// ─────────────────────────────────────────────────────────────────────────────

test('DIAG-3: lazy route chunk fetches', async ({ page }) => {
  const chunks: { name: string; status: number; ms: number }[] = []

  page.on('response', async response => {
    const url = response.url()
    if (/\/assets\/.*\.js(\?|$)/.test(url)) {
      const t = response.timing()
      chunks.push({
        name: url.split('/').pop()!.replace(/\?.*$/, ''),
        status: response.status(),
        ms: Math.round(t.responseEnd - t.requestStart),
      })
    }
  })

  await waitForApp(page)

  // Visit each lazy page in order
  for (const route of ['/setlists', '/settings', '/import', '/library']) {
    await page.goto(route)
    await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {})
    // Check if a Suspense fallback is stuck on screen
    const stuck = await page.locator('[data-suspense], .loading-fallback').count()
    if (stuck > 0) console.log(`  ⚠  Suspense fallback still visible after navigating to ${route}`)
  }

  // ── Report ───────────────────────────────────────────────────────────────
  console.log('\n═══ DIAG-3: Lazy route JS chunk fetches ═══')
  if (chunks.length === 0) {
    console.log('  No JS chunks fetched during navigation — all routes bundled or pre-cached ✓')
    test.info().annotations.push({ type: 'ruling-out', description: 'Lazy-route chunk loading is not the bottleneck (no dynamic fetches observed)' })
  } else {
    const slow = chunks.filter(c => c.ms > SLOW_NAV_MS)
    for (const c of chunks) {
      const flag = c.ms > SLOW_NAV_MS ? '⚠  SLOW' : '✓ ok  '
      console.log(`  ${flag}  ${c.name}  ${c.ms}ms  HTTP ${c.status}`)
    }
    if (slow.length > 0) {
      test.info().annotations.push({
        type: 'finding',
        description: `${slow.length} slow chunk(s): ${slow.map(c => `${c.name}:${c.ms}ms`).join(', ')}`,
      })
    } else {
      test.info().annotations.push({ type: 'ruling-out', description: `${chunks.length} chunk(s) fetched but all under ${SLOW_NAV_MS}ms` })
    }
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// 4. PWA Service Worker — navigate request interception
//    In dev mode (vite dev server) there is no SW — this test rules it out.
//    In production the SW intercepts all navigations and serves index.html
//    from cache; slow cache reads would delay route load.
// ─────────────────────────────────────────────────────────────────────────────

test('DIAG-4: service worker navigate interception', async ({ page }) => {
  await waitForApp(page)

  const swInfo = await page.evaluate(async (): Promise<{
    registered: boolean
    scope: string | null
    state: string | null
  }> => {
    if (!('serviceWorker' in navigator)) return { registered: false, scope: null, state: null }
    const reg = await navigator.serviceWorker.getRegistration('/')
    if (!reg) return { registered: false, scope: null, state: null }
    const sw = reg.active ?? reg.installing ?? reg.waiting
    return { registered: true, scope: reg.scope, state: sw?.state ?? null }
  })

  const docRequests: { url: string; fromSW: boolean; ms: number }[] = []
  page.on('response', response => {
    if (response.request().resourceType() === 'document') {
      try {
        const t = response.timing()
        docRequests.push({
          url: response.url().replace(/^https?:\/\/[^/]+/, ''),
          fromSW: response.fromServiceWorker(),
          ms: Math.round((t.responseEnd ?? 0) - (t.requestStart ?? 0)),
        })
      } catch { /* timing not available for all response types */ }
    }
  })

  await page.goto('/setlists')
  await page.goto('/library')

  // ── Report ───────────────────────────────────────────────────────────────
  console.log('\n═══ DIAG-4: Service Worker ═══')
  console.log(`  SW registered: ${swInfo.registered}  scope: ${swInfo.scope ?? 'n/a'}  state: ${swInfo.state ?? 'n/a'}`)

  if (!swInfo.registered) {
    console.log('  → Dev mode: no SW active. SW interception RULED OUT as cause. ✓')
    test.info().annotations.push({ type: 'ruling-out', description: 'No service worker in dev mode — SW fetch interception is not the cause' })
    return
  }

  for (const r of docRequests) {
    const flag = r.ms > SLOW_NAV_MS ? '⚠  SLOW' : '✓ ok  '
    console.log(`  ${flag}  ${r.url}  fromSW=${r.fromSW}  ${r.ms}ms`)
  }

  const slowSW = docRequests.filter(r => r.fromSW && r.ms > SLOW_NAV_MS)
  if (slowSW.length > 0) {
    test.info().annotations.push({
      type: 'finding',
      description: `SW serving navigate requests slowly: ${slowSW.map(r => `${r.url}:${r.ms}ms`).join(', ')}`,
    })
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// 5. Touch events & 300ms tap delay
//    Checks whether nav elements declare touch-action: manipulation (which
//    suppresses the 300ms delay browsers add for double-tap-to-zoom detection).
//    Also measures wall-clock time from tap to URL change.
// ─────────────────────────────────────────────────────────────────────────────

test('DIAG-5a: touch-action CSS on nav elements', async ({ page }) => {
  await waitForApp(page)
  // On mobile viewport the sidebar is off-screen — open it to make links accessible
  await openSidebar(page)

  type LinkInfo = { tag: string; text: string; href: string; touchAction: string }
  const navItems = await page.evaluate((): LinkInfo[] => {
    const els = Array.from(document.querySelectorAll<HTMLElement>('aside a, aside button, nav a, nav button'))
    return els.slice(0, 15).map(el => ({
      tag: el.tagName.toLowerCase(),
      text: (el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 30),
      href: (el as HTMLAnchorElement).href ?? '',
      touchAction: getComputedStyle(el).touchAction,
    }))
  })

  // ── Report ───────────────────────────────────────────────────────────────
  console.log('\n═══ DIAG-5a: touch-action on nav elements ═══')
  const bad: LinkInfo[] = []
  for (const item of navItems) {
    const ok = ['manipulation', 'none', 'pan-x', 'pan-y', 'pan-x pan-y'].includes(item.touchAction)
    console.log(`  ${ok ? '✓' : '⚠'}  [${item.tag}] "${item.text}"  touch-action: ${item.touchAction}`)
    if (!ok) bad.push(item)
  }

  if (navItems.length === 0) {
    console.log('  No nav elements found in DOM — check selector targeting')
  }

  if (bad.length > 0) {
    test.info().annotations.push({
      type: 'finding',
      description: `${bad.length}/${navItems.length} nav element(s) missing touch-action:manipulation — browser may add 300ms tap delay on double-tap-zoom-capable elements`,
    })
  } else if (navItems.length > 0) {
    test.info().annotations.push({ type: 'ruling-out', description: 'All nav elements have touch-action set — 300ms tap delay is suppressed ✓' })
  }
})

test('DIAG-5b: tap-to-navigation latency', async ({ page, isMobile }) => {
  if (!isMobile) {
    test.skip(true, 'DIAG-5b requires touch support — run with --project=android-tablet')
    return
  }
  await waitForApp(page)
  // Open mobile sidebar so the nav link is in the viewport
  await openSidebar(page)

  // Look for the /setlists sidebar link
  const target = page.locator('a[href="/setlists"]').first()
  const found = await target.isVisible({ timeout: 2000 }).catch(() => false)

  if (!found) {
    console.log('\n═══ DIAG-5b: no /setlists link visible after opening sidebar — skipping ═══')
    test.skip()
    return
  }

  // Warm tap (first tap, browser hasn't double-tap-zoomed yet)
  let t0 = Date.now()
  await target.tap()
  await page.waitForURL(/\/setlists/, { timeout: 4000 })
  const firstTapMs = Date.now() - t0

  // Navigate back and measure second tap
  await page.goto('/library')
  await expect(page).toHaveURL(/\/library/, { timeout: 5000 })
  await openSidebar(page)
  const target2 = page.locator('a[href="/setlists"]').first()

  t0 = Date.now()
  await target2.tap()
  await page.waitForURL(/\/setlists/, { timeout: 4000 })
  const secondTapMs = Date.now() - t0

  // ── Report ───────────────────────────────────────────────────────────────
  console.log('\n═══ DIAG-5b: Tap-to-navigation latency ═══')
  console.log(`  1st tap → /setlists: ${firstTapMs}ms  ${firstTapMs > TAP_DELAY_MS ? '⚠  SLOW' : '✓'}`)
  console.log(`  2nd tap → /setlists: ${secondTapMs}ms  ${secondTapMs > TAP_DELAY_MS ? '⚠  SLOW' : '✓'}`)

  if (firstTapMs > 280 && secondTapMs > 280) {
    test.info().annotations.push({
      type: 'finding',
      description: `Both taps > 280ms (${firstTapMs}ms, ${secondTapMs}ms). Consistent delay suggests 300ms double-tap-zoom suppression missing (touch-action:manipulation not set on <html> or viewport meta tag issue)`,
    })
  } else if (firstTapMs > 280) {
    test.info().annotations.push({
      type: 'finding',
      description: `First tap only is slow (${firstTapMs}ms) — likely initial JS parse/hydration overhead, not 300ms tap delay`,
    })
  } else {
    test.info().annotations.push({ type: 'ruling-out', description: `Tap latency ${firstTapMs}ms / ${secondTapMs}ms — under threshold ✓` })
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// Summary: collect all annotations and print diagnosis at end
// ─────────────────────────────────────────────────────────────────────────────

test('DIAG-SUMMARY: print ranked findings', async ({ page }) => {
  await waitForApp(page)
  // This test just documents how to read the output — actual findings are in
  // the annotations of DIAG-1 through DIAG-5. Run with --reporter=list to see
  // all console.log output inline.
  console.log(`
═══════════════════════════════════════════════════════
  HOW TO READ THIS REPORT
  -----------------------
  Each DIAG-N test logs console output (visible with --reporter=list)
  and annotates findings/ruling-outs.

  Most-likely root causes to check first:
  1. DIAG-1 / DIAG-2  ChordSheetJS parse() blocking main thread in useMemo
                       (synchronous, ~3s on Android for long songs)
  2. DIAG-5a/b        Missing touch-action:manipulation on nav links
                       → 300ms tap delay per interaction
  3. DIAG-3           Lazy route chunk not pre-fetched / slow fetch
  4. DIAG-4           SW serving navigate requests slowly (production only)

  Run with:
    npx playwright test --project=android-tablet tests/android-tablet.diag.spec.ts --reporter=list
═══════════════════════════════════════════════════════
`)
})
