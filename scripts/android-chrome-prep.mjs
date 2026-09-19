#!/usr/bin/env node
/**
 * One-time Chrome prep on the Android emulator/device for `npm run test:android`.
 *
 * Production Chrome for Android only reads Playwright's command-line file
 * (--disable-fre, --remote-debugging-socket-name) when the chrome://flags entry
 * "Enable command line on non-rooted devices" is on. Without it Playwright's
 * launchBrowser() hangs forever waiting for its socket. The flag lives in
 * Chrome's profile, so the test fixture must never `pm clear` Chrome.
 *
 * Steps: dismiss the first-run screens once via uiautomator (Chrome's DevTools
 * socket does not exist before that), flip the flag over Chrome's default
 * DevTools socket, then prove Playwright can launch Chrome on the device.
 *
 *   node scripts/android-chrome-prep.mjs
 */
import { execFileSync } from 'node:child_process'
import os from 'node:os'
import path from 'node:path'
import { _android as android, chromium } from 'playwright'

const CHROME = 'com.android.chrome'
const FLAG = 'enable-command-line-on-non-rooted-devices'
const CDP_PORT = 9333
// Chrome reports either the option id (…@1) or its label, depending on version
const ENABLED = /(@1|^Enabled)$/
const sdk = process.env.ANDROID_HOME ?? process.env.ANDROID_SDK_ROOT ?? path.join(os.homedir(), 'Library/Android/sdk')
const ADB = path.join(sdk, 'platform-tools', 'adb')
const adb = (...args) => execFileSync(ADB, args, { encoding: 'utf8' })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const DISMISS = /signin_fre_dismiss|negative_button|no_thanks|dismiss|skip|decline|not_now/i
const DISMISS_TEXT = /^(No thanks|No, thanks|Use without an account|Skip|Not now|Continue|Got it|Accept & continue)$/i

function topActivity() {
  return adb('shell', 'dumpsys activity activities 2>/dev/null | grep -m1 topResumedActivity')
}

function uiNodes() {
  adb('shell', 'uiautomator dump /sdcard/ui.xml >/dev/null 2>&1')
  const xml = adb('shell', 'cat /sdcard/ui.xml')
  return [...xml.matchAll(/<node[^>]*>/g)].map((m) => {
    const n = m[0]
    const get = (a) => n.match(new RegExp(`${a}="([^"]*)"`))?.[1] ?? ''
    const [, x1, y1, x2, y2] = get('bounds').match(/\[(\d+),(\d+)\]\[(\d+),(\d+)\]/) ?? []
    return { text: get('text'), id: get('resource-id'), clickable: get('clickable') === 'true', cx: (+x1 + +x2) / 2, cy: (+y1 + +y2) / 2 }
  })
}

async function dismissFirstRun() {
  adb('shell', `am force-stop ${CHROME}`)
  adb('shell', `am start -a android.intent.action.VIEW -d about:blank ${CHROME}`)
  for (let i = 0; i < 10; i++) {
    await sleep(2500)
    const top = topActivity()
    if (!/firstrun|FirstRun/.test(top)) { console.log('✓ first-run experience done'); return }
    const nodes = uiNodes().filter((n) => n.clickable)
    const btn = nodes.find((n) => DISMISS.test(n.id)) ?? nodes.find((n) => DISMISS_TEXT.test(n.text))
    if (!btn) {
      console.error('First-run screen with no known dismiss button. Clickable nodes:', nodes)
      process.exit(1)
    }
    console.log(`  tapping "${btn.text}" (${btn.id.split('/').pop()})`)
    adb('shell', `input tap ${btn.cx} ${btn.cy}`)
  }
  console.error('Could not get past first-run screens'); process.exit(1)
}

async function enableCommandLineFlag() {
  adb('forward', `tcp:${CDP_PORT}`, 'localabstract:chrome_devtools_remote')
  let browser
  for (let i = 0; i < 20 && !browser; i++) {
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${CDP_PORT}`).catch(() => null)
    if (!browser) await sleep(1500)
  }
  if (!browser) { console.error('Chrome DevTools socket not reachable — first-run dismissal probably failed'); process.exit(1) }
  const context = browser.contexts()[0] ?? (await browser.newContext())
  const page = await context.newPage()
  await page.goto(`chrome://flags/#${FLAG}`)
  const select = page.locator(`#${FLAG} select`)
  await select.waitFor({ timeout: 15_000 })
  const before = await select.inputValue()
  if (!ENABLED.test(before)) {
    await select.selectOption({ label: 'Enabled' })
    await sleep(500)
  }
  const after = await select.inputValue()
  await page.close()
  await browser.close()
  adb('forward', '--remove', `tcp:${CDP_PORT}`)
  if (!ENABLED.test(after)) { console.error(`Flag not enabled (value: ${after})`); process.exit(1) }
  console.log(`✓ chrome://flags/#${FLAG} = Enabled${ENABLED.test(before) ? ' (already)' : ''}`)
  adb('shell', `am force-stop ${CHROME}`)
}

async function verifyPlaywrightLaunch() {
  const [device] = await android.devices()
  if (!device) { console.error('No Android device visible to adb'); process.exit(1) }
  const context = await device.launchBrowser()
  const page = context.pages()[0] ?? (await context.newPage())
  await page.goto('about:blank')
  const ua = await page.evaluate(() => navigator.userAgent)
  await context.close()
  await device.close()
  console.log(`✓ Playwright can drive Chrome on ${device.model()}: ${ua.match(/Chrome\/[\d.]+/)?.[0]}`)
}

// Hard ceiling: a hung Chrome/adb call must fail loudly, never hang for hours
// unattended (this bit us once — a partial failure left Chrome's first-run
// screen up, and the next launchBrowser() call waited forever on a socket
// that was never going to appear).
const OVERALL_TIMEOUT_MS = 5 * 60_000
const timeout = setTimeout(() => {
  console.error(`prep did not finish within ${OVERALL_TIMEOUT_MS / 1000}s — aborting`)
  process.exit(1)
}, OVERALL_TIMEOUT_MS)
timeout.unref?.()

await dismissFirstRun()
await enableCommandLineFlag()
await verifyPlaywrightLaunch()
clearTimeout(timeout)
console.log('Ready: npm run test:android')
