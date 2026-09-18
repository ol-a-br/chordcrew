/**
 * Shared test entry point — specs import { test, expect } from './fixtures'.
 *
 * Normally this is plain @playwright/test (desktop/emulated browsers). When
 * PW_ANDROID_DEVICE=1 (set by playwright.android.config.ts, or ANDROID=1 with
 * the auth config) the browser is real Chrome on an Android device/emulator
 * visible to adb, driven through Playwright's Android support:
 *
 *   npm run android:emulator   # boot the ChordCrew tablet AVD (once)
 *   npm run test:android       # main suite on the device
 *   ANDROID=1 npm run test:auth
 *
 * One-time device prep: `node scripts/android-chrome-prep.mjs` (dismisses
 * Chrome's first-run screens and enables the chrome://flags entry that lets
 * production Chrome read Playwright's command-line file). That flag lives in
 * Chrome's profile, so this fixture must never `pm clear` Chrome; instead each
 * test clears the app origin's storage, i.e. starts as a first visit — the
 * state in which the onboarding/sign-in bugs were reported. Host ports listed
 * in PW_ANDROID_PORTS are `adb reverse`d so 127.0.0.1:<port> on the device
 * reaches the dev server / auth emulator on the host.
 */
import { test as base, expect } from '@playwright/test'
import { _android as android, type AndroidDevice } from 'playwright'
import { execFileSync } from 'child_process'
import os from 'os'
import path from 'path'

const CHROME = 'com.android.chrome'

function adb(): string {
  const sdk =
    process.env.ANDROID_HOME ??
    process.env.ANDROID_SDK_ROOT ??
    path.join(os.homedir(), 'Library', 'Android', 'sdk')
  return path.join(sdk, 'platform-tools', 'adb')
}

const androidTest = base.extend<object, { androidDevice: AndroidDevice }>({
  androidDevice: [
    async ({}, use) => {
      const devices = await android.devices()
      if (devices.length === 0) {
        throw new Error(
          'No Android device visible to adb. Boot the emulator first: npm run android:emulator',
        )
      }
      const device = devices[0]
      const serial = device.serial()
      for (const port of (process.env.PW_ANDROID_PORTS ?? '').split(',').filter(Boolean)) {
        execFileSync(adb(), ['-s', serial, 'reverse', `tcp:${port}`, `tcp:${port}`])
      }
      const release = (await device.shell('getprop ro.build.version.release')).toString().trim()
      const chrome = (await device.shell(`dumpsys package ${CHROME} | grep -m1 versionName`)).toString().trim()
      console.log(`[android] ${device.model()} (${serial}) Android ${release}, Chrome ${chrome.replace('versionName=', '')}`)
      await use(device)
      await device.close()
    },
    { scope: 'worker' },
  ],

  context: async ({ androidDevice, baseURL }, use) => {
    const context = await androidDevice.launchBrowser({ baseURL })
    await use(context)
    await context.close()
  },

  page: async ({ context }, use) => {
    const page = context.pages()[0] ?? (await context.newPage())
    // Fresh state per test = first visit on the tablet (IndexedDB, localStorage,
    // service worker, cookies) for every reversed host port.
    const cdp = await context.newCDPSession(page)
    for (const port of (process.env.PW_ANDROID_PORTS ?? '').split(',').filter(Boolean)) {
      await cdp.send('Storage.clearDataForOrigin', { origin: `http://127.0.0.1:${port}`, storageTypes: 'all' })
    }
    await cdp.detach()
    await use(page)
  },
})

// Specs only use the base fixtures, so the Android variant is exposed under
// the base type to keep a single, union-free `test` export.
export const test: typeof base = process.env.PW_ANDROID_DEVICE
  ? (androidTest as unknown as typeof base)
  : base
export { expect }
