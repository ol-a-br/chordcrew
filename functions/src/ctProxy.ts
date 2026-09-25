/**
 * ChurchTools API proxy (Hosting rewrite /ct-api/** → ctProxy).
 *
 * Browsers can't call ChurchTools directly (CORS), so the app sends its
 * requests here and the function forwards them. To keep this from being an
 * open relay:
 *   - callers must be signed-in ChordCrew users (Firebase ID token in
 *     X-Firebase-ID-Token; Authorization carries the ChurchTools token)
 *   - no CORS headers: only the app itself (same origin via the Hosting
 *     rewrite) can use it from a browser
 *   - the target must be https://<name>.church.tools, and only the API
 *     routes and methods the app actually uses are forwarded
 */

import * as functions from 'firebase-functions/v1'
import * as admin from 'firebase-admin'

const CT_HOSTNAME_SUFFIX = '.church.tools'

// Every ChurchTools route used by src/churchtools/api.ts, with its methods.
const ALLOWED_ROUTES: Array<[RegExp, string[]]> = [
  [/^\/whoami$/,                                  ['GET']],
  [/^\/songs$/,                                   ['GET', 'POST']],
  [/^\/songs\/\d+$/,                              ['GET', 'PUT', 'PATCH', 'DELETE']],
  [/^\/songs\/\d+\/arrangements$/,                ['POST']],
  [/^\/songs\/\d+\/arrangements\/\d+$/,           ['PATCH']],
  [/^\/events$/,                                  ['GET']],
  [/^\/events\/\d+\/agenda$/,                     ['GET', 'PUT']],
  [/^\/events\/\d+\/agenda\/songs$/,              ['GET']],
  [/^\/events\/\d+\/agenda\/items$/,              ['POST']],
  [/^\/event\/masterdata$/,                       ['GET']],
]

export type TargetResult = { url: string } | { status: number; error: string }

/**
 * Validate the requested ChurchTools instance, route and method, and build the
 * upstream URL. Pure function — exported for tests.
 *
 * @param baseUrl  value of the X-CT-Base-URL header, e.g. https://myparish.church.tools
 * @param path     request path with the /ct-api prefix already removed
 * @param query    raw query string without the leading "?"
 */
export function resolveTarget(baseUrl: string, path: string, method: string, query: string): TargetResult {
  let base: URL
  try { base = new URL(baseUrl.trim()) }
  catch { return { status: 400, error: 'Invalid X-CT-Base-URL' } }

  if (base.protocol !== 'https:' || base.username || base.password || base.port
      || !base.hostname.endsWith(CT_HOSTNAME_SUFFIX)) {
    return { status: 403, error: 'Target must be https://<name>.church.tools' }
  }

  // Routes are plain segments of letters and digits — rejecting anything else
  // also rules out dot segments ("..", "%2e%2e") that could leave /api.
  const route = ALLOWED_ROUTES.find(([pattern]) => pattern.test(path))
  if (!route) return { status: 404, error: 'Unsupported ChurchTools route' }
  if (!route[1].includes(method)) return { status: 405, error: 'Method not allowed' }

  const target = new URL(`/api${path}`, base.origin)
  target.search = query
  return { url: target.toString() }
}

async function isSignedIn(idToken: string | undefined): Promise<boolean> {
  if (!idToken) return false
  try {
    await admin.auth().verifyIdToken(idToken)
    return true
  } catch {
    return false
  }
}

export const ctProxy = functions
  .region('europe-west1')
  .runWith({ timeoutSeconds: 30, maxInstances: 10 })
  .https.onRequest(async (req, res) => {
    if (!(await isSignedIn(req.get('x-firebase-id-token')))) {
      res.status(401).json({ error: 'Sign in required' }); return
    }

    const baseUrl = req.get('x-ct-base-url')
    if (!baseUrl) { res.status(400).json({ error: 'Missing X-CT-Base-URL header' }); return }

    // Strip the /ct-api prefix the Hosting rewrite preserves
    const path = req.path.replace(/^\/ct-api/, '') || '/'
    const query = req.url.includes('?') ? req.url.slice(req.url.indexOf('?') + 1) : ''
    const target = resolveTarget(baseUrl, path, req.method, query)
    if ('error' in target) { res.status(target.status).json({ error: target.error }); return }

    try {
      const ctRes = await fetch(target.url, {
        method: req.method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': req.get('authorization') || '',
        },
        body: ['POST', 'PUT', 'PATCH'].includes(req.method)
          ? JSON.stringify(req.body)
          : undefined,
        redirect: 'error',
      })
      const text = await ctRes.text()
      res.status(ctRes.status).set('Content-Type', 'application/json').send(text)
    } catch (err) {
      functions.logger.warn('ctProxy upstream error', { target: target.url, err: String(err) })
      res.status(502).json({ error: 'ChurchTools is not reachable' })
    }
  })
