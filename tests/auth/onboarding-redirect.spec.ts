import { test, expect, type Page } from '@playwright/test'

/**
 * Regression test for "Google sign-in brings me back to the language screen".
 *
 * On a fresh device the onboarding flow's login step calls signInWithRedirect.
 * The page navigates away and back, remounting OnboardingPage with fresh
 * state; before the fix it restarted at the language step even though the
 * sign-in had succeeded. This drives the real redirect round-trip against the
 * Firebase Auth emulator's fake account picker (npm run test:auth).
 */

const LANGUAGE_PROMPT = 'Choose your language / Sprache wählen'
const SIGN_IN_TITLE   = 'Sign in to unlock sync & teams'
const TUTORIAL_SLIDE1 = 'Your song library'

async function chooseAccountInEmulatorWidget(page: Page) {
  // We really left the app: the emulator's fake Google account chooser
  await expect(page).toHaveURL(/127\.0\.0\.1:9099\/emulator\/auth\/handler/)
  await page.locator('#add-account-button').click()
  await page.locator('#autogen-button').click()
  await page.locator('#sign-in').click()
}

test('fresh device: onboarding resumes at the tutorial after Google redirect sign-in', async ({ page }) => {
  await page.goto('/')

  // Step 1 — language (must still be the first step on a fresh device)
  await expect(page.getByText(LANGUAGE_PROMPT)).toBeVisible()
  await page.locator('button').filter({ hasText: 'English' }).first().click()

  // Step 2 — login
  await expect(page.getByText(SIGN_IN_TITLE)).toBeVisible()
  await page.getByRole('button', { name: 'Sign in with Google' }).click()

  // Redirect out to the (fake) Google account picker and back
  await chooseAccountInEmulatorWidget(page)
  await expect(page).toHaveURL(/127\.0\.0\.1:5175/)

  // Step 3 — tutorial. Before the fix this showed the language chooser again.
  await expect(page.getByText(TUTORIAL_SLIDE1)).toBeVisible({ timeout: 15_000 })
  await expect(page.getByText(LANGUAGE_PROMPT)).toHaveCount(0)
  await expect(page.getByText(SIGN_IN_TITLE)).toHaveCount(0)

  // Finish the tutorial → signed-in app, not the login page
  for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Next' }).click()
  await page.getByRole('button', { name: 'Get started' }).click()
  await expect(page).toHaveURL(/\/library/)
  await expect(page.getByRole('button', { name: 'Sign in with Google' })).toHaveCount(0)
  await expect(page.getByText(LANGUAGE_PROMPT)).toHaveCount(0)
})
