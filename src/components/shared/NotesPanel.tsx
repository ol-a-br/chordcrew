/**
 * NotesPanel — personal private note editor for a song.
 *
 * Positioned as an overlay on the right side of the screen so the left
 * portion of the song content remains readable during performance mode.
 *
 * Props:
 *   songId       — current song
 *   userId       — current user (notes are per-user, never shared)
 *   teamId       — if the song belongs to a team, used to write the note indicator
 *   onClose      — called when the panel should be hidden
 *   performanceMode — tighter styling for the stage overlay
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import { X } from 'lucide-react'
import { getSongNote, saveSongNote } from '@/db'
import { syncNote, deleteNoteFromCloud } from '@/sync/firestoreSync'

interface NotesPanelProps {
  songId: string
  userId: string
  teamId?: string
  onClose: () => void
  performanceMode?: boolean
}

const AUTOSAVE_DELAY = 800

export function NotesPanel({ songId, userId, teamId, onClose, performanceMode }: NotesPanelProps) {
  const [content, setContent] = useState('')
  const [saved, setSaved] = useState(true)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const noteId = `${userId}:${songId}`

  // Load note for this song on mount / song change
  useEffect(() => {
    getSongNote(songId, userId).then(note => {
      setContent(note?.content ?? '')
      setSaved(true)
    })
  }, [songId, userId])

  const persist = useCallback(async (text: string) => {
    if (text.trim()) {
      await saveSongNote(songId, userId, text)
      // Best-effort cloud sync — fire and forget
      const note = { id: noteId, songId, userId, content: text, updatedAt: Date.now() }
      syncNote(note, userId, teamId).catch(() => {/* offline — will sync later */})
    } else {
      // Empty note — delete it
      const { deleteSongNote } = await import('@/db')
      await deleteSongNote(songId, userId)
      deleteNoteFromCloud(noteId, songId, userId, teamId).catch(() => {})
    }
    setSaved(true)
  }, [songId, userId, teamId, noteId])

  const handleChange = (text: string) => {
    setContent(text)
    setSaved(false)
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => persist(text), AUTOSAVE_DELAY)
  }

  // Flush on unmount
  useEffect(() => {
    return () => {
      if (saveTimer.current) {
        clearTimeout(saveTimer.current)
        persist(content)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content])

  if (performanceMode) {
    return (
      <div
        className="fixed top-0 right-0 h-full w-72 max-w-[45vw] z-50 flex flex-col"
        style={{ background: 'rgba(13,17,23,0.92)', backdropFilter: 'blur(8px)' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-3 pt-3 pb-2 border-b border-surface-3">
          <span className="text-xs font-semibold text-ink-muted uppercase tracking-wider">My Notes</span>
          <div className="flex items-center gap-2">
            {!saved && <span className="text-[10px] text-ink-faint">saving…</span>}
            <button
              onClick={onClose}
              className="text-ink-faint hover:text-ink transition-colors"
              title="Hide notes"
            >
              <X size={14} />
            </button>
          </div>
        </div>
        <textarea
          className="flex-1 bg-transparent text-sm text-ink placeholder-ink-faint resize-none p-3 focus:outline-none leading-relaxed"
          placeholder="Your private notes…"
          value={content}
          onChange={e => handleChange(e.target.value)}
          autoFocus
        />
      </div>
    )
  }

  return (
    <div className="flex flex-col rounded-xl border border-surface-3 bg-surface-1 overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-surface-3">
        <span className="text-xs font-semibold text-ink-muted uppercase tracking-wider">My Notes</span>
        <div className="flex items-center gap-2">
          {!saved && <span className="text-[10px] text-ink-faint">saving…</span>}
          <button
            onClick={onClose}
            className="text-ink-faint hover:text-ink transition-colors"
            title="Hide notes"
          >
            <X size={14} />
          </button>
        </div>
      </div>
      <textarea
        className="bg-transparent text-sm text-ink placeholder-ink-faint resize-none p-3 focus:outline-none leading-relaxed min-h-[120px]"
        placeholder="Your private notes for this song…"
        value={content}
        onChange={e => handleChange(e.target.value)}
      />
    </div>
  )
}
