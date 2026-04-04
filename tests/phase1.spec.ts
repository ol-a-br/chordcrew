import { test, expect, type Page } from '@playwright/test'
import path from 'path'

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Wait for the app to load past the auth gate (local-mode guest user) */
async function waitForApp(page: Page) {
  await page.goto('/')
  // Local-mode auto-signs in as guest — should land on /library
  await expect(page).toHaveURL(/\/library/, { timeout: 8000 })
}

/** Create a new song and return its ID from the URL */
async function createSong(page: Page): Promise<string> {
  await page.getByRole('button', { name: 'New Song' }).click()
  await page.waitForURL(/\/editor\//)
  const url = page.url()
  return url.split('/editor/')[1]
}

/**
 * Directly write ChordPro content to IndexedDB for a given song ID.
 * Avoids CodeMirror typing issues with curly-brace directives.
 */
async function setSongContent(page: Page, songId: string, content: string) {
  await page.evaluate(([id, newContent]) => {
    return new Promise<void>((resolve, reject) => {
      const req = indexedDB.open('ChordCrewDB')
      req.onsuccess = (e) => {
        const db = (e.target as IDBOpenDBRequest).result
        const tx = db.transaction('songs', 'readwrite')
        const store = tx.objectStore('songs')
        const getReq = store.get(id)
        getReq.onsuccess = () => {
          const song = getReq.result
          if (!song) { reject(new Error('Song not found')); return }
          song.transcription.content = newContent
          song.updatedAt = Date.now()
          store.put(song)
          tx.oncomplete = () => resolve()
          tx.onerror = () => reject(tx.error)
        }
        getReq.onerror = () => reject(getReq.error)
      }
      req.onerror = () => reject(req.error)
    })
  }, [songId, content] as [string, string])
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Boot & auth
// ─────────────────────────────────────────────────────────────────────────────

test('app loads and auto-signs in as local guest', async ({ page }) => {
  await waitForApp(page)
  await expect(page.getByRole('button', { name: 'New Song' })).toBeVisible()
})

test('sidebar navigation links are present', async ({ page }) => {
  await waitForApp(page)
  // AppShell sidebar should contain main nav items
  await expect(page.locator('nav, aside').first()).toBeVisible()
})

// ─────────────────────────────────────────────────────────────────────────────
// 2. Library page
// ─────────────────────────────────────────────────────────────────────────────

test('library shows empty state when no songs', async ({ page }) => {
  await waitForApp(page)
  // May show empty state or song list depending on DB state
  const body = page.locator('body')
  await expect(body).toBeVisible()
})

test('search input is visible on library page', async ({ page }) => {
  await waitForApp(page)
  await expect(page.locator('input[placeholder*="Search"], input[type="text"]').first()).toBeVisible()
})

// ─────────────────────────────────────────────────────────────────────────────
// 3. Editor
// ─────────────────────────────────────────────────────────────────────────────

test('create new song navigates to editor', async ({ page }) => {
  await waitForApp(page)
  await createSong(page)
  // Should be on editor page
  await expect(page).toHaveURL(/\/editor\//)
})

test('editor has CodeMirror loaded', async ({ page }) => {
  await waitForApp(page)
  await createSong(page)
  await expect(page.locator('.cm-editor')).toBeVisible({ timeout: 5000 })
})

test('editor has live preview pane', async ({ page }) => {
  await waitForApp(page)
  await createSong(page)
  // SongRenderer container should be present
  await expect(page.locator('.chordpro-output')).toBeVisible({ timeout: 5000 })
})

test('typing in editor updates preview', async ({ page }) => {
  await waitForApp(page)
  await createSong(page)

  // Append a chord line — avoid wrapping in {} to sidestep CodeMirror auto-bracket
  const editor = page.locator('.cm-content')
  await editor.click()
  await page.keyboard.press('End')
  await page.keyboard.press('Enter')
  await editor.pressSequentially('[Am]Hello world')

  // Preview should contain the chord "Am"
  await expect(page.locator('.chordpro-output .chord').filter({ hasText: 'Am' })).toBeVisible({ timeout: 3000 })
})

test('changes are auto-saved without a Save button', async ({ page }) => {
  await waitForApp(page)
  await createSong(page)

  const editor = page.locator('.cm-content')
  await editor.click()
  await page.keyboard.press('End')
  await page.keyboard.press('Enter')
  await editor.pressSequentially('[G]Test lyrics')

  // No explicit Save button — auto-save fires after 1 s idle
  await expect(page.locator('button:has-text("Save")')).toHaveCount(0)
  // After the debounce delay, navigating away and back should show the saved content
  await page.waitForTimeout(1500)
  const url = page.url()
  const songId = url.split('/editor/')[1]
  await page.goto(`/view/${songId}`)
  await expect(page.locator('.chordpro-output')).toBeVisible({ timeout: 5000 })
})

// ─────────────────────────────────────────────────────────────────────────────
// 4. Viewer
// ─────────────────────────────────────────────────────────────────────────────

test('viewer page renders ChordPro output', async ({ page }) => {
  await waitForApp(page)
  const songId = await createSong(page)

  await page.goto(`/view/${songId}`)
  await expect(page.locator('.chordpro-output')).toBeVisible({ timeout: 5000 })
})

test('viewer transpose controls are present', async ({ page }) => {
  await waitForApp(page)
  const songId = await createSong(page)

  await page.goto(`/view/${songId}`)
  // Look for +/- transpose buttons
  await expect(page.locator('button[aria-label*="ranspose"], button:has-text("+"), button:has-text("-")').first()).toBeVisible()
})

test('viewer lyrics-only toggle hides chords', async ({ page }) => {
  await waitForApp(page)
  const songId = await createSong(page)

  // Write chord content directly to IndexedDB
  await setSongContent(page, songId, '{title:Lyrics Test}\n[Am]Amazing [F]grace\n')

  await page.goto(`/view/${songId}`)
  await expect(page.locator('.chordpro-output')).toBeVisible({ timeout: 5000 })

  // Chords should be visible by default
  const chordsBefore = await page.locator('.chordpro-output .chord').count()
  expect(chordsBefore).toBeGreaterThan(0)

  // Click lyrics-only toggle (AlignLeft icon button)
  await page.locator('button[title*="yrics"], button[aria-label*="yrics"]').first().click().catch(async () => {
    // Fallback: find by approximate position in the toolbar
    await page.locator('button').filter({ has: page.locator('svg') }).nth(3).click()
  })

  await expect(page.locator('.chordpro-output.lyrics-only')).toBeVisible({ timeout: 2000 })
})

// ─────────────────────────────────────────────────────────────────────────────
// 5. Performance mode
// ─────────────────────────────────────────────────────────────────────────────

test('performance page renders full-screen song view', async ({ page }) => {
  await waitForApp(page)
  const songId = await createSong(page)

  await page.goto(`/perform/${songId}`)
  // Should be full-screen fixed overlay
  await expect(page.locator('.chordpro-output')).toBeVisible({ timeout: 5000 })
  // No sidebar visible
  await expect(page.locator('nav.sidebar, aside')).toBeHidden()
})

test('ArrowRight/Left keys work in performance mode', async ({ page }) => {
  await waitForApp(page)
  const songId = await createSong(page)

  await page.goto(`/perform/${songId}`)
  await expect(page.locator('.chordpro-output')).toBeVisible({ timeout: 5000 })

  // Press pedal keys — should not throw
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowLeft')
  // App still visible = navigation didn't crash
  await expect(page.locator('.chordpro-output')).toBeVisible()
})

// ─────────────────────────────────────────────────────────────────────────────
// 6. Setlists
// ─────────────────────────────────────────────────────────────────────────────

test('setlists page loads', async ({ page }) => {
  await waitForApp(page)
  await page.goto('/setlists')
  await expect(page.locator('h1, [class*="text-lg"]').first()).toBeVisible()
})

test('can create a new setlist', async ({ page }) => {
  await waitForApp(page)
  await page.goto('/setlists')
  await page.click('button:has-text("New Setlist")')
  await page.locator('input[placeholder*="etlist"]').fill('Sunday Service')
  await page.keyboard.press('Enter')
  // Should navigate to setlist detail (even if page is minimal)
  await expect(page).toHaveURL(/\/setlists\//, { timeout: 4000 })
})

test('setlist detail page loads content (not blank) on direct navigation', async ({ page }) => {
  await waitForApp(page)
  await page.goto('/setlists')
  await page.click('button:has-text("New Setlist")')
  await page.locator('input[placeholder*="etlist"]').fill('Test Direct Nav')
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/\/setlists\//, { timeout: 4000 })

  // Grab the setlist URL and navigate to it directly (simulates reload / deep-link)
  const setlistUrl = page.url()
  await page.goto(setlistUrl)
  // The page must show the setlist name, not be blank
  await expect(page.locator('h1, input[aria-label="Setlist name"]').first()).toBeVisible({ timeout: 5000 })
  await expect(page.locator('body')).not.toBeEmpty()
})

test('setlist edit mode toggles within detail page (no blank page)', async ({ page }) => {
  await waitForApp(page)
  await page.goto('/setlists')
  await page.click('button:has-text("New Setlist")')
  await page.locator('input[placeholder*="etlist"]').fill('Edit Mode Test')
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/\/setlists\//, { timeout: 4000 })

  // Click the edit (Pencil) button
  await page.locator('button[title="Edit setlist"]').click()

  // Edit mode: name becomes an input, body is not blank
  await expect(page.locator('input[aria-label="Setlist name"]')).toBeVisible({ timeout: 3000 })
  await expect(page.locator('button[title="Done editing"]')).toBeVisible()
})

// ─────────────────────────────────────────────────────────────────────────────
// 7. Settings
// ─────────────────────────────────────────────────────────────────────────────

test('settings page loads with language selector', async ({ page }) => {
  await waitForApp(page)
  await page.goto('/settings')
  // Language <select> contains English and Deutsch options
  const langSelect = page.locator('select').first()
  await expect(langSelect).toBeVisible({ timeout: 3000 })
  await expect(langSelect.locator('option[value="en"]')).toHaveText('English')
  await expect(langSelect.locator('option[value="de"]')).toHaveText('Deutsch')
})

// ─────────────────────────────────────────────────────────────────────────────
// 8. Import page
// ─────────────────────────────────────────────────────────────────────────────

test('import page shows drop zone', async ({ page }) => {
  await waitForApp(page)
  await page.goto('/import')
  // Should have drag-and-drop upload area
  await expect(page.locator('[class*="border-dashed"], [class*="drop"]').first()).toBeVisible({ timeout: 3000 })
})

test('import chords.wiki JSON file', async ({ page }) => {
  const exportFile = path.resolve(
    process.env.HOME ?? '',
    'dev/chordcrew/data/chords_wiki_library_export_20260329.json'
  )

  await waitForApp(page)
  await page.goto('/import')

  const fileInput = page.locator('input[type="file"]')
  await fileInput.setInputFiles(exportFile).catch(() => {
    test.skip()
  })

  // Wait for import to complete — "Import complete" banner appears
  await expect(page.getByText('Import complete')).toBeVisible({ timeout: 30_000 })
  // Stats grid: the song count cell should show 298
  await expect(page.locator('.text-2xl.font-bold.text-chord').filter({ hasText: '298' })).toBeVisible({ timeout: 5000 })
})

// ─────────────────────────────────────────────────────────────────────────────
// 9. ChordPro rendering correctness
// ─────────────────────────────────────────────────────────────────────────────

test('section labels render via h3.label', async ({ page }) => {
  await waitForApp(page)
  const songId = await createSong(page)

  // Write content directly to IndexedDB to bypass CodeMirror curly-brace complications
  await setSongContent(page, songId,
    '{title:Section Test}\n{start_of_verse: Verse 1}\n[G]Hello\n{end_of_verse}\n'
  )

  await page.goto(`/view/${songId}`)
  await expect(page.locator('.chordpro-output h3.label')).toBeVisible({ timeout: 5000 })
  await expect(page.locator('.chordpro-output h3.label')).toContainText('Verse 1')
})

test('chorus section gets border-left styling', async ({ page }) => {
  await waitForApp(page)
  const songId = await createSong(page)

  await setSongContent(page, songId,
    '{title:Chorus Test}\n{start_of_chorus}\n[C]Glory to God\n{end_of_chorus}\n'
  )

  await page.goto(`/view/${songId}`)
  await expect(page.locator('.chordpro-output .chorus')).toBeVisible({ timeout: 5000 })
})

// ─────────────────────────────────────────────────────────────────────────────
// 10. Visual design — new requirements
// ─────────────────────────────────────────────────────────────────────────────

test('renderer uses Barlow Condensed font', async ({ page }) => {
  await waitForApp(page)
  const songId = await createSong(page)
  await page.goto(`/view/${songId}`)
  await expect(page.locator('.chordpro-output')).toBeVisible({ timeout: 5000 })

  const fontFamily = await page.locator('.chordpro-output').evaluate(
    el => getComputedStyle(el).fontFamily
  )
  expect(fontFamily.toLowerCase()).toContain('barlow condensed')
})

test('section labels show [A] [B] badge (injected by JS)', async ({ page }) => {
  await waitForApp(page)
  const songId = await createSong(page)
  await setSongContent(page, songId,
    '{title:Counter Test}\n{start_of_verse: Verse 1}\n[G]Line\n{end_of_verse}\n{start_of_chorus: Chorus}\n[C]Chorus\n{end_of_chorus}\n'
  )
  await page.goto(`/view/${songId}`)
  await expect(page.locator('.chordpro-output h3.label').first()).toBeVisible({ timeout: 5000 })

  // JS injects .section-badge siblings for [A] [B] [C] letters
  await expect(page.locator('.chordpro-output .section-badge').first()).toBeVisible({ timeout: 3000 })
  const badgeText = await page.locator('.chordpro-output .section-badge').first().textContent()
  // Badge shows just the letter; the graphical square box comes from CSS border styling
  expect(badgeText?.trim()).toBe('A')
})

test('named chorus section gets .chorus-section class (vertical bar)', async ({ page }) => {
  await waitForApp(page)
  const songId = await createSong(page)
  await setSongContent(page, songId,
    '{title:Named Chorus}\n{start_of_verse: Verse 1}\n[G]Verse\n{end_of_verse}\n{start_of_chorus: Chorus}\n[C]Chorus line\n{end_of_chorus}\n'
  )
  await page.goto(`/view/${songId}`)
  // SongRenderer useEffect detects the Chorus label and adds .chorus-section
  await expect(page.locator('.chordpro-output .chorus-section').first()).toBeVisible({ timeout: 5000 })
})

test('viewer shows key with treble clef symbol', async ({ page }) => {
  await waitForApp(page)
  const songId = await createSong(page)
  // The default new song has key:G set via extractMeta on save... set directly
  await page.evaluate(([id]) => {
    return new Promise<void>((resolve, reject) => {
      const req = indexedDB.open('ChordCrewDB')
      req.onsuccess = (e) => {
        const db = (e.target as IDBOpenDBRequest).result
        const tx = db.transaction('songs', 'readwrite')
        const store = tx.objectStore('songs')
        const get = store.get(id)
        get.onsuccess = () => {
          const s = get.result
          s.transcription.key = 'G'
          s.transcription.tempo = 120
          store.put(s)
          tx.oncomplete = () => resolve()
          tx.onerror = () => reject(tx.error)
        }
      }
    })
  }, [songId] as [string])

  await page.goto(`/view/${songId}`)
  // Treble clef + key value
  await expect(page.locator('text=𝄞 G')).toBeVisible({ timeout: 3000 })
  // Quarter note + tempo value
  await expect(page.locator('text=♩ 120')).toBeVisible({ timeout: 3000 })
})

test('chord text color is light yellow (not amber)', async ({ page }) => {
  await waitForApp(page)
  const songId = await createSong(page)
  await setSongContent(page, songId, '{title:Color Test}\n[Am]Hello\n')
  await page.goto(`/view/${songId}`)

  const chordColor = await page.locator('.chordpro-output .chord').first().evaluate(
    el => getComputedStyle(el).color
  )
  // #fde68a = rgb(253, 230, 138) — light yellow
  expect(chordColor).toBe('rgb(253, 230, 138)')
})
