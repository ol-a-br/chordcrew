/**
 * Firebase App Check for the Cloud Functions.
 *
 * Rollout happens in two phases (docs/deployment.md):
 *   1. monitor — ENFORCE_APP_CHECK=false: requests without an App Check token
 *      are still served, so the Firebase console can show how much traffic is
 *      verified before anything is blocked. Invalid tokens are always rejected.
 *   2. enforce — ENFORCE_APP_CHECK=true in functions/.env: requests must carry
 *      a valid token from the ChordCrew web app.
 */

import * as admin from 'firebase-admin'

export const ENFORCE_APP_CHECK = process.env.ENFORCE_APP_CHECK === 'true'

/** Check the X-Firebase-AppCheck header of a plain HTTP (onRequest) function. */
export async function appCheckAllows(token: string | undefined): Promise<boolean> {
  if (!token) return !ENFORCE_APP_CHECK
  try {
    await admin.appCheck().verifyToken(token)
    return true
  } catch {
    return false
  }
}
