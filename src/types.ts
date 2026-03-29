// ─── Core entity types — mirrors the ChordCrew spec data model ───────────────

export interface User {
  id: string
  email: string
  displayName: string
  photoURL?: string
}

export interface Book {
  id: string
  title: string
  description?: string
  author: string
  ownerId: string
  sharedTeamId?: string
  readOnly: boolean
  shareable: boolean
  createdAt: number   // Unix ms
  updatedAt: number
}

export interface Transcription {
  content: string           // Raw ChordPro text — source of truth
  key: string               // e.g. "G", "Eb", "F#m"
  capo: number              // 0 = no capo
  tempo: number             // BPM
  timeSignature: string     // "4/4", "3/4", etc.
  duration: number          // seconds (0 = unknown)
  chordNotation: 'standard' // always standard
  instrument: string        // "guitar" | "piano" | etc. (metadata only)
  tuning: string            // "standard" | etc.
  format: 'chordpro'
}

export interface Song {
  id: string
  bookId: string
  title: string
  artist: string
  tags: string[]
  searchText: string        // denormalised: "Artist Title tag1 tag2"
  isFavorite: boolean
  savedAt: number
  updatedAt: number
  transcription: Transcription
}

export interface SongVersion {
  id: string
  songId: string
  content: string           // ChordPro snapshot
  savedAt: number
  savedByUserId: string
  savedByDisplayName: string
  versionNumber: 1 | 2 | 3
}

export type AnnotationType = 'text' | 'highlight' | 'symbol'

export interface AnnotationPosition {
  section?: string
  lineIndex: number
  charIndex: number
}

export interface Annotation {
  id: string
  songId: string
  userId: string
  type: AnnotationType
  position: AnnotationPosition
  content: string
  isPrivate: boolean
  createdAt: number
  updatedAt: number
}

export interface Setlist {
  id: string
  name: string
  description?: string
  date?: string             // ISO8601 planned service date
  ownerId: string
  sharedTeamId?: string
  createdAt: number
  updatedAt: number
}

export type SetlistItemType = 'song' | 'divider'

export interface SetlistItem {
  id: string
  setlistId: string
  order: number
  type: SetlistItemType
  songId?: string
  dividerName?: string
  transposeOffset: number   // semitones; 0 = no change
  columnCount?: number      // override; undefined = use global setting
  notes?: string
}

export type TeamMemberRole = 'editor' | 'viewer'

export interface TeamMember {
  userId: string
  email: string
  role: TeamMemberRole
}

export interface Team {
  id: string
  name: string
  ownerId: string
  members: TeamMember[]
}

export type SyncStatus = 'clean' | 'pending' | 'conflict'

export interface SyncState {
  id: string                // "{entityType}:{entityId}"
  entityType: 'book' | 'song' | 'setlist' | 'setlistItem' | 'annotation'
  entityId: string
  localVersion: number
  syncedVersion: number
  status: SyncStatus
  updatedAt: number
}

// ─── UI / app state types ─────────────────────────────────────────────────────

export interface AppSettings {
  language: 'en' | 'de'
  darkMode: boolean
  defaultColumnCount: 1 | 2 | 3
  pedalKeyNext: string      // keydown event.key, default "ArrowRight"
  pedalKeyPrev: string      // keydown event.key, default "ArrowLeft"
  fontScale: number         // multiplier, default 1.0
}

export const DEFAULT_SETTINGS: AppSettings = {
  language: 'en',
  darkMode: true,
  defaultColumnCount: 2,
  pedalKeyNext: 'ArrowRight',
  pedalKeyPrev: 'ArrowLeft',
  fontScale: 1.0,
}

// ─── chords.wiki import types ─────────────────────────────────────────────────

export interface ChordsWikiTranscription {
  format: string
  type: string
  chord_notation: string
  instrument: string
  tuning: string
  parts: unknown[]
  recording: unknown[]
  capo: number
  duration: number
  tempo: number
  time_signature: string
  key: string
  content: string
}

export interface ChordsWikiSong {
  id: string
  title: string
  artist: string
  tags?: string[]
  search_text?: string
  saved: string
  transcription: ChordsWikiTranscription
}

export interface ChordsWikiSetlistItem {
  order: number
  type: 'song' | 'set'
  name?: string
  song?: {
    id: string
    title: string
    artist: string
    book_ref?: { id: string; song_id: string }
  }
}

export interface ChordsWikiSetlist {
  id: string
  name: string
  created: string
  description?: string
  items: Record<string, ChordsWikiSetlistItem>
}

export interface ChordsWikiBook {
  id: string
  title: string
  author: string
  description?: string
  readOnly: boolean
  shareable: boolean
  created: string
  songs: Record<string, ChordsWikiSong>
}

export interface ChordsWikiExport {
  filetype: 'library-backup'
  version: number
  created: number
  uid: string
  library: {
    books: Record<string, ChordsWikiBook>
    setlists: Record<string, ChordsWikiSetlist>
    favorites: Record<string, unknown>
    audio: Record<string, unknown>
    midi: { sequences: Record<string, unknown> }
  }
}
