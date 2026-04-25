export interface CTCategory {
  id: number
  name: string
  nameTranslated: string
  sortKey: number
}

export interface CTArrangement {
  id: number
  name: string
  isDefault: boolean
  key: string | null
  beat: string | null
  tempo: number | null
  duration: number | null
  description: string | null
}

export interface CTSong {
  id: number
  name: string
  author: string | null
  copyright: string | null
  ccli: string | null
  category: CTCategory
  arrangements: CTArrangement[]
}

export interface CTEvent {
  id: number
  name: string
  startDate: string
  endDate: string
  isCanceled: boolean
  calendar: { title: string }
}

export interface CTAgendaItem {
  id: number
  type: 'header' | 'song' | 'text'
  title: string
  position: number
  note: string
  duration: number
  isBeforeEvent: boolean
  responsible: { text: string; persons: unknown[] }
  song?: { songId: number; arrangementId: number; title: string }
  serviceGroupNotes: unknown[]
}

export interface CTAgenda {
  id: number
  calendarId: number
  isLocked: boolean
  eventStartPosition: number
  items: CTAgendaItem[]
}

// Preview item computed before any write happens
export interface CTSongPreview {
  localTitle: string
  localId: string
  status: 'will-create' | 'exists'
  ctSongId?: number
  ctArrangementId?: number
}

export type CTUploadStatus = 'created' | 'exists' | 'error'

export interface CTSongUploadResult {
  localTitle: string
  status: CTUploadStatus
  error?: string
}
