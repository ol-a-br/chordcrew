import { test, expect, type Page } from '@playwright/test'

// ── Helpers ───────────────────────────────────────────────────────────────────

async function waitForApp(page: Page) {
  await page.goto('/')
  const langBtn = page.locator('button').filter({ hasText: 'English' }).first()
  const onboarding = await langBtn.waitFor({ state: 'visible', timeout: 5000 })
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
  await expect(page).toHaveURL(/\/library/, { timeout: 8000 })
}

/** Seed two linked songs into IDB and return their IDs. */
async function seedLinkedSongs(
  page: Page,
  opts: { diverged?: boolean } = {}
): Promise<{ idA: string; idB: string }> {
  return page.evaluate(async ({ diverged }) => {
    const idA = 'test-song-a-' + Date.now()
    const idB = 'test-song-b-' + Date.now()

    const base = {
      title: 'Amazing Grace',
      artist: 'John Newton',
      tags: [],
      searchText: 'amazing grace john newton',
      isFavorite: false,
      savedAt: Date.now(),
      updatedAt: Date.now(),
      transcription: {
        content: '{title: Amazing Grace}\n[G]Amazing [C]grace',
        key: 'G',
        capo: 0,
        tempo: 120,
        timeSignature: '4/4',
        duration: 0,
        chordNotation: 'standard',
        instrument: 'guitar',
        tuning: 'standard',
        format: 'chordpro',
      },
    }

    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.open('ChordCrewDB')
      req.onsuccess = (e) => {
        const db = (e.target as IDBOpenDBRequest).result
        const tx = db.transaction(['books', 'songs'], 'readwrite')

        // Ensure default book exists
        const books = tx.objectStore('books')
        books.put({
          id: 'book-personal',
          title: 'My Songs',
          description: '',
          author: 'local',
          ownerId: 'local',
          readOnly: false,
          shareable: false,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        })
        books.put({
          id: 'book-team',
          title: 'Team Book',
          description: '',
          author: 'local',
          ownerId: 'local',
          readOnly: false,
          shareable: true,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        })

        const songs = tx.objectStore('songs')
        songs.put({ ...base, id: idA, bookId: 'book-personal', linkedSongIds: [idB] })
        songs.put({
          ...base,
          id: idB,
          bookId: 'book-team',
          linkedSongIds: [idA],
          updatedAt: diverged ? Date.now() - 86_400_000 : Date.now(),
          transcription: {
            ...base.transcription,
            content: diverged
              ? '{title: Amazing Grace}\n[G]Amazing [D]grace how sweet the sound'
              : base.transcription.content,
          },
        })

        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error)
      }
      req.onerror = () => reject(req.error)
    })
    return { idA, idB }
  }, { diverged: opts.diverged ?? false })
}

/** Seed a single unlinked song for connect-songs tests. */
async function seedSong(page: Page, title: string, bookId = 'book-personal'): Promise<string> {
  return page.evaluate(async ({ title, bookId }) => {
    const id = 'song-' + title.replace(/\s/g, '-').toLowerCase() + '-' + Date.now()
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.open('ChordCrewDB')
      req.onsuccess = (e) => {
        const db = (e.target as IDBOpenDBRequest).result
        const tx = db.transaction(['books', 'songs'], 'readwrite')
        tx.objectStore('books').put({
          id: bookId, title: bookId === 'book-personal' ? 'My Songs' : 'Team Book',
          author: 'local', ownerId: 'local', readOnly: false, shareable: false,
          createdAt: Date.now(), updatedAt: Date.now(),
        })
        tx.objectStore('songs').put({
          id, bookId, title,
          artist: '', tags: [],
          searchText: title.toLowerCase(),
          isFavorite: false,
          savedAt: Date.now(), updatedAt: Date.now(),
          transcription: {
            content: `{title: ${title}}\n[G]Test`,
            key: 'G', capo: 0, tempo: 120, timeSignature: '4/4',
            duration: 0, chordNotation: 'standard', instrument: 'guitar',
            tuning: 'standard', format: 'chordpro',
          },
        })
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error)
      }
      req.onerror = () => reject(req.error)
    })
    return id
  }, { title, bookId })
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test.describe('Linked song copies', () => {

  test('library shows no badge when linked copies are in sync', async ({ page }) => {
    await waitForApp(page)
    await seedLinkedSongs(page, { diverged: false })
    await page.reload()
    await page.waitForURL(/\/library/)
    // Type in search to surface the song + trigger showMeta=true
    await page.locator('input[type="text"], input[type="search"]').first().fill('Amazing Grace')
    await expect(page.locator('[data-testid="link-diverged-badge"]')).toHaveCount(0)
  })

  test('library shows amber badge when linked copies have diverged', async ({ page }) => {
    await waitForApp(page)
    await seedLinkedSongs(page, { diverged: true })
    await page.reload()
    await page.waitForURL(/\/library/)
    // Search to surface the song
    await page.locator('input[type="text"], input[type="search"]').first().fill('Amazing Grace')
    // At least one diverged badge should appear (one per diverged song in results)
    await expect(page.locator('[data-testid="link-diverged-badge"]').first()).toBeVisible({ timeout: 5000 })
  })

  test('clicking diverged badge opens sync dialog', async ({ page }) => {
    await waitForApp(page)
    await seedLinkedSongs(page, { diverged: true })
    await page.reload()
    await page.waitForURL(/\/library/)
    await page.locator('input[type="text"], input[type="search"]').first().fill('Amazing Grace')
    await page.locator('[data-testid="link-diverged-badge"]').first().click()
    // Dialog should appear with title
    await expect(page.getByText('Sync Copies')).toBeVisible({ timeout: 3000 })
  })

  test('sync dialog shows newer/older direction and changed fields', async ({ page }) => {
    await waitForApp(page)
    await seedLinkedSongs(page, { diverged: true })
    await page.reload()
    await page.waitForURL(/\/library/)
    await page.locator('input[type="text"], input[type="search"]').first().fill('Amazing Grace')
    await page.locator('[data-testid="link-diverged-badge"]').first().click()
    await expect(page.getByText('Sync Copies')).toBeVisible()
    // Direction arrow should be visible
    await expect(page.locator('svg').filter({ has: page.locator('[data-icon="arrow-right"], path') }).first()).toBeVisible()
    // Changed fields section
    await expect(page.getByText('Changed fields')).toBeVisible()
  })

  test('confirming sync makes badge disappear', async ({ page }) => {
    await waitForApp(page)
    await seedLinkedSongs(page, { diverged: true })
    await page.reload()
    await page.waitForURL(/\/library/)
    await page.locator('input[type="text"], input[type="search"]').first().fill('Amazing Grace')
    await page.locator('[data-testid="link-diverged-badge"]').first().click()
    await expect(page.getByText('Sync Copies')).toBeVisible()
    await page.getByRole('button', { name: 'Sync now' }).click()
    // Dialog closes and badge disappears
    await expect(page.getByText('Sync Copies')).not.toBeVisible({ timeout: 3000 })
    await expect(page.locator('[data-testid="link-diverged-badge"]')).toHaveCount(0, { timeout: 3000 })
  })

  test('editor toolbar shows diverged badge', async ({ page }) => {
    await waitForApp(page)
    const { idA } = await seedLinkedSongs(page, { diverged: true })
    await page.goto(`/editor/${idA}`)
    await expect(page.locator('[aria-label="Copies diverged — click to sync"]')).toBeVisible({ timeout: 5000 })
  })

  test('viewer toolbar shows diverged badge', async ({ page }) => {
    await waitForApp(page)
    const { idA } = await seedLinkedSongs(page, { diverged: true })
    await page.goto(`/view/${idA}`)
    await expect(page.locator('[aria-label="Copies diverged — click to sync"]')).toBeVisible({ timeout: 5000 })
  })

  test('viewer badge opens sync dialog', async ({ page }) => {
    await waitForApp(page)
    const { idA } = await seedLinkedSongs(page, { diverged: true })
    await page.goto(`/view/${idA}`)
    await page.locator('[aria-label="Copies diverged — click to sync"]').click()
    await expect(page.getByText('Sync Copies')).toBeVisible({ timeout: 3000 })
  })

  test('no badge in performance mode', async ({ page }) => {
    await waitForApp(page)
    const { idA } = await seedLinkedSongs(page, { diverged: true })
    // Performance page uses /perform/:id route
    await page.goto(`/perform/${idA}`)
    await expect(page.locator('[data-testid="link-diverged-badge"]')).toHaveCount(0, { timeout: 3000 })
    await expect(page.locator('[aria-label="Copies diverged — click to sync"]')).toHaveCount(0)
  })

})

test.describe('Curation — Linked Copies tab', () => {

  test('linked copies tab appears and shows clusters', async ({ page }) => {
    await waitForApp(page)
    await seedLinkedSongs(page, { diverged: false })
    await page.reload()
    await page.waitForURL(/\/library/)
    // Navigate via the sidebar link rather than direct URL (AppShell wraps curation)
    await page.goto('/curation')
    await expect(page.getByRole('button', { name: /Linked Copies/i })).toBeVisible({ timeout: 8000 })
    await page.getByRole('button', { name: /Linked Copies/i }).click()
    // Should show the song title inside the cluster list
    await expect(page.getByText('Amazing Grace').first()).toBeVisible({ timeout: 3000 })
  })

  test('diverged cluster shows Sync button in curation', async ({ page }) => {
    await waitForApp(page)
    await seedLinkedSongs(page, { diverged: true })
    await page.reload()
    await page.goto('/curation')
    await page.getByRole('button', { name: /Linked Copies/i }).click()
    await expect(page.locator('[data-testid="curation-sync-btn"]').first()).toBeVisible({ timeout: 5000 })
  })

  test('in-sync cluster shows In sync label', async ({ page }) => {
    await waitForApp(page)
    await seedLinkedSongs(page, { diverged: false })
    await page.reload()
    await page.goto('/curation')
    await page.getByRole('button', { name: /Linked Copies/i }).click()
    await expect(page.getByText('In sync').first()).toBeVisible({ timeout: 5000 })
  })

  test('connect songs dialog opens and allows search', async ({ page }) => {
    await waitForApp(page)
    await seedSong(page, 'How Great Thou Art', 'book-personal')
    await seedSong(page, 'How Great Thou Art', 'book-team')
    await page.reload()
    await page.goto('/curation')
    await page.getByRole('button', { name: /Linked Copies/i }).click()
    await page.getByRole('button', { name: /Connect songs/i }).click()
    await expect(page.getByText('Select first song')).toBeVisible({ timeout: 3000 })
    await page.locator('input[placeholder*="Search"]').fill('How Great')
    await expect(page.locator('[data-testid="connect-song-result"]').first()).toBeVisible({ timeout: 3000 })
  })

  test('connect songs two-step links the pair', async ({ page }) => {
    await waitForApp(page)
    await seedSong(page, 'Great Is Thy Faithfulness', 'book-personal')
    await seedSong(page, 'Great Is Thy Faithfulness', 'book-team')
    await page.reload()
    await page.goto('/curation')
    await page.getByRole('button', { name: /Linked Copies/i }).click()
    await page.getByRole('button', { name: /Connect songs/i }).click()
    // Step 1: pick song A
    await page.locator('input[placeholder*="Search"]').fill('Great Is Thy')
    await page.locator('[data-testid="connect-song-result"]').first().click()
    // Step 2: pick song B
    await expect(page.getByText('Link to:')).toBeVisible({ timeout: 2000 })
    await page.locator('input[placeholder*="Search"]').fill('Great Is Thy')
    await page.locator('[data-testid="connect-song-result"]').first().click()
    // Dialog closes and the newly linked cluster appears in the list
    await expect(page.locator('[data-testid="curation-sync-btn"], .text-green-500\\/70').first()).toBeVisible({ timeout: 5000 })
  })

})
