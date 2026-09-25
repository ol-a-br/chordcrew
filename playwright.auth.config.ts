import { defineConfig, devices } from '@playwright/test'

/**
 * Auth-flow E2E config: runs the app against the Firebase Auth emulator so the
 * real signInWithRedirect round-trip (leave the page → fake Google account
 * picker → come back) can be tested without a Google account.
 *
 *   npm run test:auth
 *
 * Both servers must be on the same host (127.0.0.1) — the SDK reads the
 * redirect result back through an iframe on the emulator origin, and browsers
 * partition third-party storage by top-level *site*, so localhost vs 127.0.0.1
 * would silently break the round-trip (same class of bug as the production
 * authDomain incident).
 */
const APP = 'http://127.0.0.1:5175'
const AUTH_EMULATOR = 'http://127.0.0.1:9099'

// ANDROID=1 npm run test:auth → real Chrome on the Android emulator/device
// (tests/fixtures.ts); both host ports are adb-reversed onto the device.
const onDevice = Boolean(process.env.ANDROID)
if (onDevice) {
  process.env.PW_ANDROID_DEVICE = '1'
  process.env.PW_ANDROID_PORTS = '5175,9099'
}

export default defineConfig({
  testDir: './tests/auth',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'list',
  // the emulator is slow: Chrome launch + Firebase init easily exceed the defaults
  timeout: onDevice ? 90_000 : 30_000,
  expect: { timeout: onDevice ? 15_000 : 5_000 },
  use: {
    baseURL: APP,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: [
    {
      command: 'firebase emulators:start --only auth --project demo-chordcrew',
      url: AUTH_EMULATOR,
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: 'npm run dev -- --host 127.0.0.1 --port 5175',
      url: APP,
      reuseExistingServer: false,
      timeout: 30_000,
      env: {
        // Any non-empty key marks Firebase as "configured"; the emulator does
        // not validate it. demo-* project ids never touch a real project.
        VITE_FIREBASE_API_KEY: 'fake-api-key',
        VITE_FIREBASE_AUTH_DOMAIN: '127.0.0.1',
        VITE_FIREBASE_PROJECT_ID: 'demo-chordcrew',
        VITE_FIREBASE_STORAGE_BUCKET: '',
        VITE_FIREBASE_MESSAGING_SENDER_ID: '',
        VITE_FIREBASE_APP_ID: '1:1:web:fake',
        VITE_FIREBASE_AUTH_EMULATOR_HOST: AUTH_EMULATOR,
      },
    },
  ],
  projects: onDevice ? [{ name: 'android-device' }] : [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'android-tablet',
      use: {
        // Samsung Galaxy Tab S4 — same descriptor as playwright.config.ts
        userAgent:
          'Mozilla/5.0 (Linux; Android 10; SM-T835) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        viewport: { width: 712, height: 1138 },
        deviceScaleFactor: 2.25,
        isMobile: true,
        hasTouch: true,
        defaultBrowserType: 'chromium',
      },
    },
  ],
})
