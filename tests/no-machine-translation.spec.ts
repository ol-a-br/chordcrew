/**
 * Browser machine translation must never run on ChordCrew.
 *
 * The UI is localized at build time (src/i18n/*.json). When Chrome/Safari
 * "Translate page" ran anyway (the page was declared lang="en" while showing
 * German UI text), it translated song content — "Am" became "Bin", "Fb" became
 * "Facebook" — and, by swapping React-owned text nodes for <font> wrappers,
 * crashed the app to a blank screen (e.g. Setlists → select-mode checkbox).
 *
 *   TRANS-1  The document opts out of machine translation
 *   TRANS-2  <html lang> follows the UI language chosen in onboarding
 */

import { test, expect } from './fixtures'

test('TRANS-1: document opts out of browser machine translation', async ({ page }) => {
  await page.goto('/')
  expect(await page.locator('html').getAttribute('translate')).toBe('no')
  await expect(page.locator('meta[name="google"]')).toHaveAttribute('content', 'notranslate')
})

test('TRANS-2: <html lang> follows the UI language', async ({ page }) => {
  await page.goto('/')
  await page.locator('button').filter({ hasText: 'Deutsch' }).first().click()
  await expect(page.locator('html')).toHaveAttribute('lang', 'de')

  // Survives a reload (language is restored from localStorage at startup)
  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('lang', 'de')
})
