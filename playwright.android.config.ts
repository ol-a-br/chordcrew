import { defineConfig } from '@playwright/test'

/**
 * Runs the main E2E suite in real Chrome on an Android device/emulator via
 * adb (see tests/fixtures.ts). Local mode (no Firebase), like playwright.config.ts.
 *
 *   npm run android:emulator   # boot the tablet AVD (scripts/android-emulator.sh)
 *   npm run test:android
 *
 * iPad-specific and diagnostic specs are left out; the auth redirect test has
 * its own config (ANDROID=1 npm run test:auth).
 */
const PORT = 5176
process.env.PW_ANDROID_DEVICE = '1'
process.env.PW_ANDROID_PORTS = String(PORT)

export default defineConfig({
  testDir: './tests',
  testIgnore: ['**/auth/**', '**/firebase/**', '**/ipad-*', '**/*.diag.spec.ts'],
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'list',
  timeout: 90_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: `npm run dev -- --host 127.0.0.1 --port ${PORT}`,
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: false,
    timeout: 30_000,
    env: {
      VITE_FIREBASE_API_KEY: '',
      VITE_FIREBASE_AUTH_DOMAIN: '',
      VITE_FIREBASE_PROJECT_ID: '',
      VITE_FIREBASE_STORAGE_BUCKET: '',
      VITE_FIREBASE_MESSAGING_SENDER_ID: '',
      VITE_FIREBASE_APP_ID: '',
    },
  },
  projects: [{ name: 'android-device' }],
})
