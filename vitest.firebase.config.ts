import { defineConfig } from 'vitest/config'

/**
 * Security tests for Firestore rules and Cloud Functions, run against the
 * Firebase emulators (Firestore needs Java):
 *
 *   npm run test:firebase
 *
 * The script builds functions/ and wraps this config in
 * `firebase emulators:exec`, which starts and stops the emulators.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/firebase/**/*.test.ts'],
    testTimeout: 30_000,
    hookTimeout: 60_000,
    // All files share one emulator instance — run them one after another.
    fileParallelism: false,
  },
})
