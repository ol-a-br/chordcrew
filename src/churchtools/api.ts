import type { CTSong, CTArrangement, CTEvent, CTCategory, CTAgenda } from './types'

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

export async function ctGetAgenda(baseUrl: string, token: string, eventId: number): Promise<CTAgenda> {
  const res = await fetch(endpoint(baseUrl, `/events/${eventId}/agenda`), {
    headers: headers(baseUrl, token),
  })
  await checkResponse(res)
  return (await res.json()).data as CTAgenda
}

// PUT full agenda — the only documented way to control item positions.
// Items in newArrangementIds are inserted after the last item of the target
// section (identified by sectionItemIndex, an index into agenda.items).
// All existing items are preserved in order; PUT recreates them so item IDs
// change, but serviceGroupNotes are empty for typical use.
export async function ctPutAgendaWithSection(
  baseUrl: string,
  token: string,
  eventId: number,
  agenda: CTAgenda,
  newArrangementIds: number[],
  sectionItemIndex: number,  // index in agenda.items of the chosen header
): Promise<void> {
  const items = agenda.items

  // Find the last item index that belongs to this section (before next header)
  let insertAfterIndex = sectionItemIndex
  for (let i = sectionItemIndex + 1; i < items.length; i++) {
    if (items[i].type === 'header') break
    insertAfterIndex = i
  }

  // Reconstruct PUT payload from existing items
  type PutItem = { type: string; title?: string; note?: string; duration?: number; responsible?: string; arrangementId?: number }
  const toPayload = (it: (typeof items)[number]): PutItem => ({
    type: it.type,
    ...(it.title ? { title: it.title } : {}),
    ...(it.note ? { note: it.note } : {}),
    ...(it.duration > 0 ? { duration: it.duration } : {}),
    ...(it.responsible?.text ? { responsible: it.responsible.text } : {}),
    ...(it.type === 'song' && it.song?.arrangementId ? { arrangementId: it.song.arrangementId } : {}),
  })

  const newItems: PutItem[] = newArrangementIds.map(id => ({ type: 'song', arrangementId: id }))

  const putItems = [
    ...items.slice(0, insertAfterIndex + 1).map(toPayload),
    ...newItems,
    ...items.slice(insertAfterIndex + 1).map(toPayload),
  ]

  const res = await fetch(endpoint(baseUrl, `/events/${eventId}/agenda`), {
    method: 'PUT',
    headers: headers(baseUrl, token),
    body: JSON.stringify({
      calendarId: agenda.calendarId,
      eventStartPosition: agenda.eventStartPosition ?? 0,
      items: putItems,
    }),
  })
  await checkResponse(res)
}

export async function ctDeleteSong(baseUrl: string, token: string, songId: number): Promise<void> {
  const res = await fetch(endpoint(baseUrl, `/songs/${songId}`), {
    method: 'DELETE',
    headers: headers(baseUrl, token),
  })
  await checkResponse(res)
}

export async function ctUpdateSong(
  baseUrl: string,
  token: string,
  songId: number,
  patch: { name?: string; author?: string | null; ccli?: string | null; copyright?: string | null },
): Promise<CTSong> {
  const body: Record<string, unknown> = {}
  if (patch.name !== undefined) body.name = patch.name
  if ('author' in patch) body.author = patch.author ?? ''
  if ('ccli' in patch) body.ccli = patch.ccli ?? ''
  if ('copyright' in patch) body.copyright = patch.copyright ?? ''
  const res = await fetch(endpoint(baseUrl, `/songs/${songId}`), {
    method: 'PATCH',
    headers: headers(baseUrl, token),
    body: JSON.stringify(body),
  })
  await checkResponse(res)
  const data = await res.json()
  return data.data as CTSong
}

export async function ctUpdateArrangement(
  baseUrl: string,
  token: string,
  songId: number,
  arrangementId: number,
  patch: { key?: string | null; tempo?: number | null; beat?: string | null; duration?: number | null },
): Promise<CTArrangement> {
  const body: Record<string, unknown> = {}
  if (patch.key !== undefined) body.key = patch.key && CT_VALID_KEYS.has(patch.key) ? patch.key : null
  if (patch.tempo !== undefined) body.tempo = patch.tempo && patch.tempo > 0 ? patch.tempo : null
  if (patch.beat !== undefined) body.beat = patch.beat ?? null
  if (patch.duration !== undefined) body.duration = patch.duration && patch.duration > 0 ? patch.duration : null
  const res = await fetch(endpoint(baseUrl, `/songs/${songId}/arrangements/${arrangementId}`), {
    method: 'PATCH',
    headers: headers(baseUrl, token),
    body: JSON.stringify(body),
  })
  await checkResponse(res)
  const data = await res.json()
  return data.data as CTArrangement
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
