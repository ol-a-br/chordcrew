/**
 * Share-link XSS regression test.
 *
 * chordsheetjs emits song text as raw HTML, and SongRenderer injects it with
 * dangerouslySetInnerHTML. A hash-based share link (/share#…) is decoded
 * entirely client-side, so anyone could craft one whose lyrics contain markup
 * with an event handler — which then ran as script in the ChordCrew origin.
 * renderToHtml now sanitizes its output; this test proves it in a real browser.
 */

import { test, expect } from '@playwright/test'
import { deflateSync } from 'zlib'

function encodeShare(data: object): string {
  return deflateSync(Buffer.from(JSON.stringify(data)))
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

test('a crafted share link cannot execute script', async ({ page }) => {
  const hash = encodeShare({
    t: 's',
    title: 'XSS Test',
    artist: 'x',
    key: 'C',
    content:
      '{title: <img src=x onerror="window.__xss=1">}\n' +
      '{comment: <svg onload="window.__xss=2"></svg>}\n' +
      '[C]Hello <img src=x onerror="window.__xss=3"> world',
  })

  await page.goto(`/share#${hash}`)
  await expect(page.locator('.chord-sheet')).toContainText('Hello')
  // Give any injected onerror/onload handler time to fire
  await page.waitForTimeout(500)

  expect(await page.evaluate(() => (window as unknown as { __xss?: number }).__xss)).toBeUndefined()
  await expect(page.locator('.chord-sheet img, .chord-sheet svg')).toHaveCount(0)
})
