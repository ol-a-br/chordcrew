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
