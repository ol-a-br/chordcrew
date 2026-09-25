import { describe, it, expect } from 'vitest'
import { resolveTarget } from './ctProxy'

// URL validation of the ChurchTools proxy. Runs with the normal unit tests
// (npm run test:unit); the HTTP-level checks live in tests/firebase/ctProxy.test.ts.

const B = 'https://myparish.church.tools'

// [description, X-CT-Base-URL, path, method, query, expected upstream URL or HTTP status]
const CASES: Array<[string, string, string, string, string, string | number]> = [
  ['whoami', B, '/whoami', 'GET', '', 'https://myparish.church.tools/api/whoami'],
  ['songs paging with query', B, '/songs', 'GET', 'limit=100&page=2', 'https://myparish.church.tools/api/songs?limit=100&page=2'],
  ['create song', B, '/songs', 'POST', '', 'https://myparish.church.tools/api/songs'],
  ['patch arrangement', B, '/songs/12/arrangements/3', 'PATCH', '', 'https://myparish.church.tools/api/songs/12/arrangements/3'],
  ['agenda put', B, '/events/7/agenda', 'PUT', '', 'https://myparish.church.tools/api/events/7/agenda'],
  ['masterdata', B, '/event/masterdata', 'GET', '', 'https://myparish.church.tools/api/event/masterdata'],
  ['trailing slash base', B + '/', '/whoami', 'GET', '', 'https://myparish.church.tools/api/whoami'],
  ['http rejected', 'http://myparish.church.tools', '/whoami', 'GET', '', 403],
  ['other host rejected', 'https://evil.com', '/whoami', 'GET', '', 403],
  ['suffix trick rejected', 'https://church.tools.evil.com', '/whoami', 'GET', '', 403],
  ['bare domain rejected', 'https://church.tools', '/whoami', 'GET', '', 403],
  ['userinfo rejected', 'https://evil.com@myparish.church.tools', '/whoami', 'GET', '', 403],
  ['backslash trick rejected', 'https://evil.com\\@myparish.church.tools', '/whoami', 'GET', '', 403],
  ['custom port rejected', 'https://myparish.church.tools:8443', '/whoami', 'GET', '', 403],
  ['garbage base', 'not a url', '/whoami', 'GET', '', 400],
  ['unknown route', B, '/persons', 'GET', '', 404],
  ['dot segments', B, '/songs/../persons', 'GET', '', 404],
  ['encoded dot segments', B, '/songs/%2e%2e/persons', 'GET', '', 404],
  ['non-numeric id', B, '/songs/abc', 'GET', '', 404],
  ['wrong method', B, '/whoami', 'DELETE', '', 405],
  ['delete events not allowed', B, '/events/7/agenda', 'DELETE', '', 405],
]

describe('resolveTarget', () => {
  it.each(CASES)('%s', (_description, base, path, method, query, expected) => {
    const result = resolveTarget(base, path, method, query)
    expect('url' in result ? result.url : result.status).toBe(expected)
  })
})
