import type { CTSong, CTArrangement, CTEvent, CTCategory } from './types'

// Keys the ChurchTools API accepts on arrangements
const CT_VALID_KEYS = new Set([
  'A', 'Ab', 'Am', 'B', 'Bb', 'Bbm', 'Bm', 'C', 'C#m', 'Cm',
  'D', 'D#m', 'Db', 'Dm', 'E', 'Eb', 'Ebm', 'Em', 'F', 'F#', 'F#m',
  'Fm', 'G', 'G#m', 'Gb', 'Gm',
])

// All browser calls go through the /ct-api proxy (Firebase Function) to avoid CORS.
// The proxy validates the target hostname ends in .church.tools and forwards the request.
function endpoint(_baseUrl: string, path: string): string {
  return `/ct-api${path}`
}

function headers(baseUrl: string, token: string): HeadersInit {
  return {
    'Content-Type': 'application/json',
    'Authorization': `Login ${token}`,
    'X-CT-Base-URL': baseUrl,
  }
}

async function checkResponse(res: Response): Promise<void> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.message || body.translatedMessage || `HTTP ${res.status}`)
  }
}

// ── Auth ──────────────────────────────────────────────────────────────────────

export async function ctWhoAmI(
  baseUrl: string,
  token: string,
): Promise<{ id: number; firstName: string; lastName: string }> {
  const res = await fetch(endpoint(baseUrl, '/whoami'), { headers: headers(baseUrl, token) })
  await checkResponse(res)
  const data = await res.json()
  return {
    id: data.data.id,
    firstName: data.data.firstName ?? '',
    lastName: data.data.lastName ?? '',
  }
}

// ── Songs ─────────────────────────────────────────────────────────────────────

export async function ctGetAllSongs(baseUrl: string, token: string): Promise<CTSong[]> {
  const songs: CTSong[] = []
  let page = 1
  for (;;) {
    const res = await fetch(endpoint(baseUrl, `/songs?limit=100&page=${page}`), {
      headers: headers(baseUrl, token),
    })
    await checkResponse(res)
    const data = await res.json()
    songs.push(...(data.data as CTSong[]))
    if (page >= (data.meta?.pagination?.lastPage ?? 1)) break
    page++
  }
  return songs
}

export async function ctCreateSong(
  baseUrl: string,
  token: string,
  song: { name: string; author?: string | null; ccli?: string | null; copyright?: string | null; categoryId: number },
): Promise<CTSong> {
  const res = await fetch(endpoint(baseUrl, '/songs'), {
    method: 'POST',
    headers: headers(baseUrl, token),
    body: JSON.stringify({
      name: song.name,
      categoryId: song.categoryId,
      ...(song.author ? { author: song.author } : {}),
      ...(song.ccli ? { ccli: song.ccli } : {}),
      ...(song.copyright ? { copyright: song.copyright } : {}),
    }),
  })
  await checkResponse(res)
  const data = await res.json()
  return data.data as CTSong
}

export async function ctCreateArrangement(
  baseUrl: string,
  token: string,
  songId: number,
  arr: { key?: string | null; tempo?: number | null; beat?: string | null; duration?: number | null },
): Promise<CTArrangement> {
  const body: Record<string, unknown> = { name: 'Standard-Arrangement' }
  if (arr.key && CT_VALID_KEYS.has(arr.key)) body.key = arr.key
  if (arr.tempo && arr.tempo > 0) body.tempo = arr.tempo
  if (arr.beat) body.beat = arr.beat
  if (arr.duration && arr.duration > 0) body.duration = arr.duration

  const res = await fetch(endpoint(baseUrl, `/songs/${songId}/arrangements`), {
    method: 'POST',
    headers: headers(baseUrl, token),
    body: JSON.stringify(body),
  })
  await checkResponse(res)
  const data = await res.json()
  return data.data as CTArrangement
}

// ── Events ────────────────────────────────────────────────────────────────────

export async function ctGetEvents(baseUrl: string, token: string, date: string): Promise<CTEvent[]> {
  const nextDay = new Date(date)
  nextDay.setDate(nextDay.getDate() + 1)
  const to = nextDay.toISOString().slice(0, 10)
  const res = await fetch(endpoint(baseUrl, `/events?from=${date}&to=${to}&limit=50`), {
    headers: headers(baseUrl, token),
  })
  await checkResponse(res)
  const data = await res.json()
  return (data.data as CTEvent[]).filter(e => !e.isCanceled)
}

export async function ctGetEventAgendaSongs(
  baseUrl: string,
  token: string,
  eventId: number,
): Promise<CTSong[]> {
  const res = await fetch(endpoint(baseUrl, `/events/${eventId}/agenda/songs`), {
    headers: headers(baseUrl, token),
  })
  await checkResponse(res)
  const data = await res.json()
  return data.data as CTSong[]
}

export async function ctAddAgendaItem(
  baseUrl: string,
  token: string,
  eventId: number,
  arrangementId: number,
  note?: string,
): Promise<void> {
  const res = await fetch(endpoint(baseUrl, `/events/${eventId}/agenda/items`), {
    method: 'POST',
    headers: headers(baseUrl, token),
    body: JSON.stringify({
      type: 'song',
      arrangementId,
      ...(note ? { note } : {}),
    }),
  })
  await checkResponse(res)
}

// ── Masterdata ────────────────────────────────────────────────────────────────

export async function ctGetSongCategories(baseUrl: string, token: string): Promise<CTCategory[]> {
  const res = await fetch(endpoint(baseUrl, '/event/masterdata'), {
    headers: headers(baseUrl, token),
  })
  await checkResponse(res)
  const data = await res.json()
  return (data.data?.songCategories ?? []) as CTCategory[]
}
