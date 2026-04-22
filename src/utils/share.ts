/**
 * URL-based sharing for songs and setlists.
 * Encodes content in the URL hash using deflate compression + base64url.
 * No Firebase required — works offline and for anonymous recipients.
 */

// ── Compression helpers (native CompressionStream API) ───────────────────────

async function compress(text: string): Promise<string> {
  const encoder = new TextEncoder()
  const stream = new Blob([encoder.encode(text)])
    .stream()
    .pipeThrough(new CompressionStream('deflate'))
  const compressed = await new Response(stream).arrayBuffer()
  return bufferToBase64Url(compressed)
}

async function decompress(encoded: string): Promise<string> {
  const buffer = base64UrlToBuffer(encoded)
  const stream = new Blob([buffer])
    .stream()
    .pipeThrough(new DecompressionStream('deflate'))
  const text = await new Response(stream).text()
  return text
}

function bufferToBase64Url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function base64UrlToBuffer(str: string): ArrayBuffer {
  const base64 = str.replace(/-/g, '+').replace(/_/g, '/')
  const padded = base64 + '='.repeat((4 - base64.length % 4) % 4)
  const binary = atob(padded)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes.buffer
}

// ── Song sharing ─────────────────────────────────────────────────────────────

export interface SharedSong {
  title: string
  artist: string
  key: string
  content: string
}

export async function encodeSongShare(song: SharedSong): Promise<string> {
  const json = JSON.stringify({ t: 's', ...song })
  return compress(json)
}

export async function decodeSongShare(hash: string): Promise<SharedSong | null> {
  try {
    const json = await decompress(hash)
    const data = JSON.parse(json)
    if (data.t !== 's') return null
    return { title: data.title, artist: data.artist, key: data.key, content: data.content }
  } catch {
    return null
  }
}

// ── Setlist sharing ──────────────────────────────────────────────────────────

export interface SharedSetlistSong {
  title: string
  artist: string
  key: string
  content: string
  transposeOffset: number
}

export interface SharedSetlist {
  name: string
  songs: SharedSetlistSong[]
}

export async function encodeSetlistShare(setlist: SharedSetlist): Promise<string> {
  const json = JSON.stringify({ t: 'l', ...setlist })
  return compress(json)
}

export async function decodeSetlistShare(hash: string): Promise<SharedSetlist | null> {
  try {
    const json = await decompress(hash)
    const data = JSON.parse(json)
    if (data.t !== 'l') return null
    return { name: data.name, songs: data.songs }
  } catch {
    return null
  }
}

// ── Build share URL ──────────────────────────────────────────────────────────

export function buildShareUrl(encoded: string): string {
  const base = window.location.origin
  return `${base}/share#${encoded}`
}

export function buildSetlistShareUrl(setlistId: string): string {
  return `${window.location.origin}/share/${setlistId}`
}

export async function copyShareUrl(url: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(url)
    return true
  } catch {
    return false
  }
}

// ── Firestore-backed setlist share (short URL) ────────────────────────────────
// Writes to /shares/{setlistId} — one document per setlist, overwrites on refresh.
// TTL: 30 days from creation.

const SHARE_TTL_MS = 30 * 24 * 60 * 60 * 1000

export async function publishSetlistShare(
  setlistId: string,
  setlistName: string,
  encoded: string,
  ownerId: string,
): Promise<boolean> {
  try {
    const { firestore } = await import('@/firebase')
    if (!firestore) return false
    const { doc, setDoc, Timestamp } = await import('firebase/firestore')
    const now = Date.now()
    await setDoc(doc(firestore, 'shares', setlistId), {
      encoded,
      setlistName,
      ownerId,
      createdAt: Timestamp.fromMillis(now),
      expiresAt: Timestamp.fromMillis(now + SHARE_TTL_MS),
    })
    return true
  } catch {
    return false
  }
}

export async function fetchSetlistShare(setlistId: string): Promise<string | null> {
  try {
    const { firestore } = await import('@/firebase')
    if (!firestore) return null
    const { doc, getDoc, Timestamp } = await import('firebase/firestore')
    const snap = await getDoc(doc(firestore, 'shares', setlistId))
    if (!snap.exists()) return null
    const data = snap.data()
    const expiresAt = data.expiresAt as { toMillis(): number } | undefined
    if (expiresAt && expiresAt.toMillis() < Timestamp.now().toMillis()) return null
    return data.encoded as string
  } catch {
    return null
  }
}
