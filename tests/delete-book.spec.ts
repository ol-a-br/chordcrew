import { test, expect } from './fixtures'
import type { Page } from '@playwright/test'

// Deleting a book that contains songs asks whether to delete the songs too.

async function waitForApp(page: Page) {
  await page.goto('/')
  const langBtn = page.locator('button').filter({ hasText: 'English' }).first()
  const onboarding = await langBtn.waitFor({ state: 'visible', timeout: 5000 })
    .then(() => true).catch(() => false)
  if (onboarding) {
    await langBtn.click()
    await page.locator('button').filter({ hasText: /local mode/i }).first().click()
    await page.locator('button').filter({ hasText: /^Skip$/i }).first().click()
    await page.waitForURL(/\/library/, { timeout: 8000 })
  }
  await expect(page).toHaveURL(/\/library/, { timeout: 8000 })
}

/** Seed two books; "Old Book" holds two songs. */
async function seed(page: Page) {
  await page.evaluate(async () => {
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.open('ChordCrewDB')
      req.onsuccess = (e) => {
        const db = (e.target as IDBOpenDBRequest).result
        const tx = db.transaction(['books', 'songs'], 'readwrite')
        const book = (id: string, title: string) => ({
          id, title, author: 'local', ownerId: 'local', readOnly: false, shareable: false,
          createdAt: Date.now(), updatedAt: Date.now(),
        })
        tx.objectStore('books').put(book('book-keep', 'Main Book'))
        tx.objectStore('books').put(book('book-old', 'Old Book'))
        for (const title of ['First Song', 'Second Song']) {
          tx.objectStore('songs').put({
            id: 'song-' + title.replace(/\s/g, '-').toLowerCase(), bookId: 'book-old', title,
            artist: '', tags: [], searchText: title.toLowerCase(), isFavorite: false,
            savedAt: Date.now(), updatedAt: Date.now(),
            transcription: {
              content: `{title: ${title}}\n[G]Test`, key: 'G', capo: 0, tempo: 120,
              timeSignature: '4/4', duration: 0, chordNotation: 'standard',
              instrument: 'guitar', tuning: 'standard', format: 'chordpro',
            },
          })
        }
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error)
      }
      req.onerror = () => reject(req.error)
    })
  })
  await page.reload()
}

async function readDb(page: Page) {
  return page.evaluate(async () => {
    return new Promise<{ books: string[]; songs: { id: string; bookId: string }[] }>((resolve, reject) => {
      const req = indexedDB.open('ChordCrewDB')
      req.onsuccess = (e) => {
        const db = (e.target as IDBOpenDBRequest).result
        const tx = db.transaction(['books', 'songs'], 'readonly')
        const booksReq = tx.objectStore('books').getAll()
        const songsReq = tx.objectStore('songs').getAll()
        tx.oncomplete = () => resolve({
          books: booksReq.result.map((b: { id: string }) => b.id),
          songs: songsReq.result.map((s: { id: string; bookId: string }) => ({ id: s.id, bookId: s.bookId })),
        })
        tx.onerror = () => reject(tx.error)
      }
      req.onerror = () => reject(req.error)
    })
  })
}

async function openDeleteDialog(page: Page) {
  const navItem = page.locator('button').filter({ hasText: 'Old Book' }).first()
  await navItem.hover()
  await navItem.locator('[title="Delete book"]').click()
  const dialog = page.getByRole('dialog', { name: 'Delete book "Old Book"' })
  await expect(dialog).toBeVisible()
  await expect(dialog).toContainText('2 songs')
  return dialog
}

test.describe('Delete book with songs', () => {
  test.beforeEach(async ({ page, viewport }) => {
    // The book sidebar (with the delete action) is hidden below the md breakpoint
    test.skip((viewport?.width ?? 0) < 768, 'book sidebar hidden on narrow viewports')
    await waitForApp(page)
    await seed(page)
  })

  test('DB-1: "Delete book and 2 songs" removes the book and its songs', async ({ page }) => {
    const dialog = await openDeleteDialog(page)
    await dialog.getByRole('button', { name: 'Delete book and 2 songs' }).click()
    await expect(dialog).toBeHidden()
    await expect.poll(async () => (await readDb(page)).books).not.toContain('book-old')
    const { songs } = await readDb(page)
    expect(songs.filter(s => s.id.startsWith('song-first') || s.id.startsWith('song-second'))).toEqual([])
  })

  test('DB-2: "Keep songs" removes the book and moves its songs', async ({ page }) => {
    const dialog = await openDeleteDialog(page)
    await dialog.getByRole('button', { name: 'Keep songs (move to "Main Book")' }).click()
    await expect(dialog).toBeHidden()
    await expect.poll(async () => (await readDb(page)).books).not.toContain('book-old')
    const { songs } = await readDb(page)
    const moved = songs.filter(s => s.id === 'song-first-song' || s.id === 'song-second-song')
    expect(moved.map(s => s.bookId)).toEqual(['book-keep', 'book-keep'])
  })

  test('DB-3: Cancel keeps the book and its songs', async ({ page }) => {
    const dialog = await openDeleteDialog(page)
    await dialog.getByRole('button', { name: 'Cancel' }).click()
    await expect(dialog).toBeHidden()
    const { books, songs } = await readDb(page)
    expect(books).toContain('book-old')
    expect(songs.filter(s => s.bookId === 'book-old')).toHaveLength(2)
  })
})
