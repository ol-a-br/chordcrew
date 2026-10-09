/**
 * A crash must never leave a blank screen.
 *
 *   ERR-1  When React fails mid-update, a recovery screen is shown and
 *          "Reload" brings the app back
 *
 * The crash is provoked the way it happened on Android: something outside
 * React (there: the browser's page translator) swaps the text nodes React
 * owns, and the next React update throws "removeChild … not a child".
 */

import { test, expect } from './fixtures'
import type { Page } from '@playwright/test'

async function waitForApp(page: Page) {
  await page.goto('/')
  const langBtn = page.locator('button').filter({ hasText: 'English' }).first()
  const onboarding = await langBtn.waitFor({ state: 'visible', timeout: 10_000 })
    .then(() => true).catch(() => false)
  if (onboarding) {
    await langBtn.click()
    await page.locator('button').filter({ hasText: /local mode/i }).first().click()
    await page.locator('button').filter({ hasText: /^Skip$/i }).first().click()
    await page.waitForURL(/\/library/, { timeout: 8000 })
  }
  await page.locator('aside').first().waitFor({ state: 'attached', timeout: 8000 })
}

async function seedSetlists(page: Page) {
  await page.evaluate(() => new Promise<void>((resolve, reject) => {
    const req = indexedDB.open('ChordCrewDB')
    req.onerror = () => reject(req.error)
    req.onsuccess = () => {
      const tx = req.result.transaction(['setlists'], 'readwrite')
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
      const now = Date.now()
      tx.objectStore('setlists').put({ id: 'err-1', name: 'Sunday Service', ownerId: 'local', createdAt: now, updatedAt: now })
      tx.objectStore('setlists').put({ id: 'err-2', name: 'Youth Night', ownerId: 'local', createdAt: now, updatedAt: now })
    }
  }))
}

/** Replace every text node under #root with <font><font>…</font></font>, as page translators do. */
async function tamperWithDom(page: Page) {
  await page.evaluate(() => {
    const walker = document.createTreeWalker(document.getElementById('root')!, NodeFilter.SHOW_TEXT)
    const nodes: Text[] = []
    while (walker.nextNode()) nodes.push(walker.currentNode as Text)
    for (const node of nodes) {
      if (!node.textContent?.trim()) continue
      const outer = document.createElement('font')
      const inner = document.createElement('font')
      inner.textContent = node.textContent
      outer.appendChild(inner)
      node.replaceWith(outer)
    }
  })
}

test('ERR-1: a crash shows the recovery screen, and Reload brings the app back', async ({ page }) => {
  page.on('pageerror', () => {})   // the provoked crash is expected
  await waitForApp(page)
  await seedSetlists(page)
  await page.goto('/setlists')
  await page.getByText('Sunday Service').waitFor()

  await tamperWithDom(page)
  await page.locator('button[title="Select setlists"]').click()

  const alert = page.getByRole('alert')
  await expect(alert).toBeVisible()
  await expect(alert).toContainText('Something went wrong')

  await alert.getByRole('button', { name: 'Reload' }).click()
  await expect(page.getByText('Sunday Service')).toBeVisible()
  await expect(page.getByRole('alert')).toHaveCount(0)
})
