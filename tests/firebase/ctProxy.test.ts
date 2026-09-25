/**
 * ChurchTools proxy (functions/src/ctProxy.ts) over HTTP: only signed-in app
 * users, no CORS, only allowed targets and routes. The URL validation itself
 * is unit-tested in functions/src/ctProxy.test.ts.
 * Runs against the Auth and Functions emulators: npm run test:firebase
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { testUser, cleanupUsers, FUNCTIONS_ORIGIN, PROJECT, REGION } from './helpers'

const PROXY = `${FUNCTIONS_ORIGIN}/${PROJECT}/${REGION}/ctProxy/ct-api`
let idToken = ''

beforeAll(async () => {
  idToken = await (await testUser('proxy-user')).idToken()
})

afterAll(cleanupUsers)

function request(path: string, headers: Record<string, string> = {}, method = 'GET') {
  return fetch(PROXY + path, {
    method,
    headers: { 'X-CT-Base-URL': 'https://myparish.church.tools', Authorization: 'Login ct-token', ...headers },
  })
}

describe('ctProxy', () => {
  it('rejects callers without a valid Firebase ID token', async () => {
    expect((await request('/whoami')).status).toBe(401)
    expect((await request('/whoami', { 'X-Firebase-ID-Token': 'forged.token.value' })).status).toBe(401)
  })

  it('rejects a forged App Check token even before enforcement is on', async () => {
    const res = await request('/whoami', { 'X-Firebase-ID-Token': idToken, 'X-Firebase-AppCheck': 'forged.appcheck.token' })
    expect(res.status).toBe(401)
    expect(await res.text()).toMatch(/App verification failed/)
  })

  it('sends no CORS allow-origin, so other websites cannot use it', async () => {
    const res = await fetch(PROXY + '/whoami', {
      method: 'OPTIONS',
      headers: { Origin: 'https://evil.example', 'Access-Control-Request-Method': 'GET' },
    })
    expect(res.headers.get('access-control-allow-origin')).toBeNull()
  })

  it('refuses non-ChurchTools targets, unknown routes and wrong methods', async () => {
    const auth = { 'X-Firebase-ID-Token': idToken }
    expect((await request('/whoami', { ...auth, 'X-CT-Base-URL': 'http://myparish.church.tools' })).status).toBe(403)
    expect((await request('/whoami', { ...auth, 'X-CT-Base-URL': 'https://evil.com' })).status).toBe(403)
    expect((await request('/persons', auth)).status).toBe(404)
    expect((await request('/whoami', auth, 'DELETE')).status).toBe(405)
  })

  it('forwards valid requests from signed-in users', async () => {
    const res = await request('/whoami', { 'X-Firebase-ID-Token': idToken })
    // ChurchTools (or, offline, the 502 fallback) answered — not one of the
    // proxy's own rejections. Status alone can't tell: upstream may say 401 too.
    const body = await res.text()
    expect(body).not.toMatch(/Sign in required|Target must be|Unsupported ChurchTools route|Method not allowed|X-CT-Base-URL/)
    expect(res.headers.get('access-control-allow-origin')).toBeNull()
  })
})
