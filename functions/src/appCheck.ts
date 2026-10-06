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

import { getAppCheck } from 'firebase-admin/app-check'
import * as functions from 'firebase-functions/v1'

export const ENFORCE_APP_CHECK = process.env.ENFORCE_APP_CHECK === 'true'

export type AppCheckStatus = 'verified' | 'missing' | 'invalid'

/**
 * One structured log line per request. The Firebase console has no App Check
 * metrics for Cloud Functions, so this is how to tell whether enforcing would
 * block real users: Logs Explorer → jsonPayload.message="appcheck".
 */
export function logAppCheck(fn: string, status: AppCheckStatus): void {
  functions.logger.info('appcheck', { fn, status, enforced: ENFORCE_APP_CHECK })
}

/** Check the X-Firebase-AppCheck header of a plain HTTP (onRequest) function. */
export async function appCheckAllows(fn: string, token: string | undefined): Promise<boolean> {
  let status: AppCheckStatus = 'missing'
  if (token) {
    try {
      await getAppCheck().verifyToken(token)
      status = 'verified'
    } catch {
      status = 'invalid'
    }
  }
  logAppCheck(fn, status)
  return status === 'verified' || (status === 'missing' && !ENFORCE_APP_CHECK)
}
