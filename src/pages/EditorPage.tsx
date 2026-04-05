import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { Eye, X, RotateCcw, Tag, History, ChevronDown, Trash2 } from 'lucide-react'
import { db, upsertSongVersions, markPending } from '@/db'
import { deleteSongFromCloud } from '@/sync/firestoreSync'
import { buildSearchText, extractMeta, lintChordPro } from '@/utils/chordpro'
import { ChordProEditor } from '@/components/editor/ChordProEditor'
import type { ChordProEditorHandle } from '@/components/editor/ChordProEditor'
import { SongRenderer } from '@/components/viewer/SongRenderer'
import { Button } from '@/components/shared/Button'
import { useAuth } from '@/auth/AuthContext'
import type { SongVersion } from '@/types'

const AUTOSAVE_DELAY_MS = 1000
const VERSION_INTERVAL_MS = 5 * 60 * 1000  // create a version at most every 5 min

/** Replace or insert a ChordPro directive in the content string. */
function updateDirective(content: string, directive: string, value: string): string {
  const re = new RegExp(`\\{${directive}\\s*:[^}]*\\}`, 'gi')
  if (re.test(content)) {
    return content.replace(re, value.trim() ? `{${directive}: ${value}}` : '')
  }
  if (!value.trim()) return content
  return `{${directive}: ${value}}\n${content}`
}

export default function EditorPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()
  const song = useLiveQuery(() => id ? db.songs.get(id) : undefined, [id])

  const [content, setContent] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [showPreview, setShowPreview] = useState(true)
  const [showHistory, setShowHistory] = useState(false)
  const [showExtraMeta, setShowExtraMeta] = useState(false)
  const [deletePhase, setDeletePhase] = useState<'idle' | 'confirm' | 'deleted'>('idle')
  const deletedSongRef = useRef<typeof song | null>(null)
  const deleteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const tagInputRef = useRef<HTMLInputElement>(null)
  const editorRef = useRef<ChordProEditorHandle>(null)

  // Refs so the auto-save timer always reads the latest values without stale closures
  const contentRef = useRef(content)
  const tagsRef = useRef(tags)
  const songRef = useRef(song)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastVersionSavedRef = useRef<number>(0)

  const versions = useLiveQuery(
    async (): Promise<SongVersion[]> => id
      ? db.songVersions.where('songId').equals(id).sortBy('savedAt')
      : [],
    [id]
  )

  // ── Tap-tempo ─────────────────────────────────────────────────────────────
  const tapTimesRef = useRef<number[]>([])
  const tapResetTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleTap = () => {
    const now = Date.now()
    // Drop taps older than 3 s
    tapTimesRef.current = [...tapTimesRef.current.filter(t => now - t < 3000), now]

    if (tapTimesRef.current.length >= 3) {
      const times = tapTimesRef.current
      const intervals: number[] = []
      for (let i = 1; i < times.length; i++) intervals.push(times[i] - times[i - 1])
      const avgMs = intervals.reduce((a, b) => a + b, 0) / intervals.length
      const bpm = Math.round(60000 / avgMs)
      commitMetaField('tempo', String(bpm))
    }

    // Reset after 3 s of silence
    if (tapResetTimer.current) clearTimeout(tapResetTimer.current)
    tapResetTimer.current = setTimeout(() => { tapTimesRef.current = [] }, 3000)
  }

  // Keep refs in sync with latest state/props so the save timer reads fresh values
  contentRef.current = content
  tagsRef.current = tags
  songRef.current = song

  // Derive metadata from content for display; updated reactively
  const derivedMeta = useMemo(() => extractMeta(content), [content])
  const lintErrors  = useMemo(() => lintChordPro(content), [content])

  useEffect(() => {
    if (song) {
      setContent(song.transcription.content)
      setTags(song.tags ?? [])
    }
  }, [song?.id])

  // Flush any pending auto-save on unmount
  useEffect(() => () => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
  }, [])

  const save = useCallback(async () => {
    const s = songRef.current
    if (!s || !user) return
    const currentContent = contentRef.current
    const currentTags = tagsRef.current
    const meta = extractMeta(currentContent)

    // Create a version at most every VERSION_INTERVAL_MS to avoid flooding history
    const now = Date.now()
    if (now - lastVersionSavedRef.current > VERSION_INTERVAL_MS) {
      await upsertSongVersions(s.id, s.transcription.content, user.id, user.displayName)
      lastVersionSavedRef.current = now
    }

    await db.songs.update(s.id, {
      title:      meta.title ?? s.title,
      artist:     meta.artist ?? s.artist,
      tags:       currentTags,
      searchText: buildSearchText(meta.title ?? s.title, meta.artist ?? s.artist, currentTags, currentContent),
      updatedAt:  now,
      transcription: {
        ...s.transcription,
        content:       currentContent,
        key:           meta.key ?? s.transcription.key,
        tempo:         meta.tempo ?? s.transcription.tempo,
        capo:          meta.capo ?? s.transcription.capo,
        timeSignature: meta.time ?? s.transcription.timeSignature,
      },
    })
    await markPending('song', s.id)
  }, [user])

  const scheduleAutoSave = useCallback(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(save, AUTOSAVE_DELAY_MS)
  }, [save])

  const restoreVersion = useCallback((versionContent: string) => {
    setContent(versionContent)
    setShowHistory(false)
    scheduleAutoSave()
  }, [scheduleAutoSave])

  const commitMetaField = (directive: string, value: string) => {
    setContent(prev => {
      const updated = updateDirective(prev, directive, value)
      return updated
    })
    scheduleAutoSave()
  }

  const handleChange = (val: string) => {
    setContent(val)
    scheduleAutoSave()
  }

  const confirmDelete = async () => {
    if (!song || !user) return
    deletedSongRef.current = song
    await db.songs.delete(song.id)
    await db.syncStates.delete(`song:${song.id}`)
    deleteSongFromCloud(song.id, user.id, undefined).catch(() => {})
    setDeletePhase('deleted')
    deleteTimerRef.current = setTimeout(() => navigate('/library'), 5000)
  }

  const undoDelete = async () => {
    if (deleteTimerRef.current) clearTimeout(deleteTimerRef.current)
    const s = deletedSongRef.current
    if (!s) return
    await db.songs.put(s)
    await markPending('song', s.id)
    deletedSongRef.current = null
    setDeletePhase('idle')
  }

  const addTag = (value: string) => {
    const tag = value.trim().toLowerCase()
    if (!tag || tags.includes(tag)) return
    setTags(prev => [...prev, tag])
    scheduleAutoSave()
  }

  const removeTag = (tag: string) => {
    setTags(t => t.filter(x => x !== tag))
    scheduleAutoSave()
  }

  const handleTagKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const input = e.currentTarget
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      addTag(input.value)
      input.value = ''
    } else if (e.key === 'Backspace' && input.value === '' && tags.length > 0) {
      removeTag(tags[tags.length - 1])
    }
  }

  if (!song) return <div className="p-8 text-ink-muted">Loading…</div>

  // ── Delete: "deleted" phase shows undo banner instead of normal editor ──────
  if (deletePhase === 'deleted') {
    return (
      <div className="flex flex-col h-full items-center justify-center gap-4 text-center px-6">
        <p className="text-ink-muted text-sm">Song deleted.</p>
        <div className="flex gap-3">
          <button
            onClick={undoDelete}
            className="px-4 py-2 rounded-lg bg-chord/10 text-chord text-sm font-medium hover:bg-chord/20 transition-colors"
          >
            Undo
          </button>
          <button
            onClick={() => navigate('/library')}
            className="px-4 py-2 rounded-lg bg-surface-2 text-ink-muted text-sm hover:bg-surface-3 transition-colors"
          >
            Go to Library
          </button>
        </div>
        <p className="text-xs text-ink-faint">Auto-redirecting to library in 5 s…</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Top bar */}
      <div className="flex items-center gap-3 px-4 py-2.5 border-b border-surface-3 bg-surface-1 shrink-0">
        <button onClick={() => navigate(-1)} className="text-ink-muted hover:text-ink">
          <X size={18} />
        </button>
        <div className="flex-1 min-w-0">
          <span className="font-medium text-sm truncate">{song.title}</span>
        </div>
        <button
          onClick={() => setShowPreview(p => !p)}
          className={`p-1.5 rounded ${showPreview ? 'text-chord' : 'text-ink-muted hover:text-ink'}`}
          title="Toggle preview"
        >
          <Eye size={17} />
        </button>
        {(versions?.length ?? 0) > 0 && (
          <button
            onClick={() => setShowHistory(h => !h)}
            className={`p-1.5 rounded ${showHistory ? 'text-chord' : 'text-ink-muted hover:text-ink'}`}
            title="Version history"
          >
            <History size={17} />
          </button>
        )}
        {deletePhase === 'confirm' ? (
          <>
            <span className="text-xs text-red-400 font-medium">Delete this song?</span>
            <button
              onClick={confirmDelete}
              className="px-2.5 py-1 rounded text-xs bg-red-600/20 text-red-400 hover:bg-red-600/30 transition-colors"
            >
              Delete
            </button>
            <button
              onClick={() => setDeletePhase('idle')}
              className="px-2.5 py-1 rounded text-xs text-ink-muted hover:text-ink transition-colors"
            >
              Cancel
            </button>
          </>
        ) : (
          <>
            <button
              onClick={() => setDeletePhase('confirm')}
              className="p-1.5 rounded text-ink-faint hover:text-red-400 transition-colors"
              title="Delete song"
            >
              <Trash2 size={15} />
            </button>
            <Button variant="ghost" size="sm" onClick={() => navigate(`/view/${song.id}`)}>
              <RotateCcw size={14} />
              View
            </Button>
          </>
        )}
      </div>

      {/* Metadata bar — row 1: core song fields + expand toggle */}
      <div className="flex items-center gap-3 px-4 py-1.5 border-b border-surface-3 bg-surface-1 shrink-0 flex-wrap">
        {([
          { label: 'Title',  directive: 'title',  value: derivedMeta.title  ?? '', width: 'w-36', type: 'text' },
          { label: 'Artist', directive: 'artist', value: derivedMeta.artist ?? '', width: 'w-28', type: 'text' },
          { label: 'Key',    directive: 'key',    value: derivedMeta.key    ?? '', width: 'w-12', type: 'text' },
          { label: 'Tempo',  directive: 'tempo',  value: derivedMeta.tempo  ? String(derivedMeta.tempo) : '', width: 'w-14', type: 'number' },
          { label: 'Capo',   directive: 'capo',   value: derivedMeta.capo   ? String(derivedMeta.capo)  : '', width: 'w-12', type: 'number' },
          { label: 'Time',   directive: 'time',   value: derivedMeta.time   ?? '', width: 'w-14', type: 'text' },
        ]).map(({ label, directive, value, width, type }) => (
          <label key={directive} className="flex items-center gap-1 text-xs">
            <span className="text-ink-faint shrink-0">{label}</span>
            <input
              type={type ?? 'text'}
              defaultValue={value}
              key={`${directive}-${song?.id}-${value}`}
              onBlur={e => commitMetaField(directive, e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
              className={`${width} bg-surface-2 border border-surface-3 rounded px-1.5 py-0.5 text-ink text-xs outline-none focus:border-chord/50`}
            />
            {directive === 'tempo' && (
              <button
                type="button"
                onClick={handleTap}
                className="px-1.5 py-0.5 text-xs bg-surface-2 border border-surface-3 rounded text-ink-muted hover:text-ink hover:border-chord/40 active:bg-chord/10 transition-colors select-none"
                title="Tap tempo"
              >
                Tap
              </button>
            )}
          </label>
        ))}

        {/* Expand toggle — shows rows 2+3; dot when hidden rows have content */}
        <button
          type="button"
          onClick={() => setShowExtraMeta(v => !v)}
          title={showExtraMeta ? 'Hide CCLI / copyright / tags' : 'Show CCLI / copyright / tags'}
          className="ml-auto relative p-1 text-ink-faint hover:text-ink rounded transition-colors"
        >
          <ChevronDown
            size={14}
            className={`transition-transform duration-150 ${showExtraMeta ? 'rotate-180' : ''}`}
          />
          {!showExtraMeta && !!(derivedMeta.ccli || derivedMeta.copyright || derivedMeta.url || tags.length > 0) && (
            <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-amber-400 pointer-events-none" />
          )}
        </button>
      </div>

      {/* Metadata rows 2+3 — hidden by default, shown when expanded */}
      {showExtraMeta && (
        <>
          {/* Row 2: attribution (CCLI / copyright / URL) */}
          <div className="flex items-center gap-3 px-4 py-1.5 border-b border-surface-3 bg-surface-1 shrink-0 flex-wrap">
            {([
              { label: 'CCLI',      directive: 'ccli',      value: derivedMeta.ccli      ?? '', width: 'w-24', type: 'text', placeholder: '5281015' },
              { label: 'Copyright', directive: 'copyright', value: derivedMeta.copyright ?? '', width: 'w-64', type: 'text', placeholder: '© Year Author' },
              { label: 'URL',       directive: 'url',       value: derivedMeta.url       ?? '', width: 'w-64', type: 'url',  placeholder: 'https://…' },
            ] as const).map(({ label, directive, value, width, type, placeholder }) => (
              <label key={directive} className="flex items-center gap-1 text-xs">
                <span className="text-ink-faint shrink-0">{label}</span>
                <input
                  type={type}
                  defaultValue={value}
                  key={`${directive}-${song?.id}-${value}`}
                  placeholder={placeholder}
                  onBlur={e => commitMetaField(directive, e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
                  className={`${width} bg-surface-2 border border-surface-3 rounded px-1.5 py-0.5 text-ink text-xs outline-none focus:border-chord/50 placeholder:text-ink-faint/40`}
                />
              </label>
            ))}
          </div>

          {/* Row 3: tags */}
          <div className="flex items-center gap-2 px-4 py-1.5 border-b border-surface-3 bg-surface-1 shrink-0">
            <Tag size={13} className="text-ink-faint shrink-0" />
            <div className="flex flex-wrap items-center gap-1 flex-1">
              {tags.map(tag => (
                <span
                  key={tag}
                  className="flex items-center gap-1 bg-surface-3 text-ink-muted text-xs px-2 py-0.5 rounded-full"
                >
                  {tag}
                  <button
                    onClick={() => removeTag(tag)}
                    className="text-ink-faint hover:text-ink leading-none"
                    title="Remove tag"
                  >
                    ✕
                  </button>
                </span>
              ))}
              <input
                ref={tagInputRef}
                type="text"
                placeholder={tags.length === 0 ? 'add tags (press Enter or ,)' : 'add tag…'}
                className="bg-transparent text-xs text-ink placeholder:text-ink-faint outline-none min-w-[100px] py-0.5"
                onKeyDown={handleTagKeyDown}
                onBlur={e => { if (e.target.value.trim()) { addTag(e.target.value); e.target.value = '' } }}
              />
            </div>
          </div>
        </>
      )}

      {/* Split pane */}
      <div className="flex flex-1 min-h-0 relative">
        {/* Editor */}
        <div className={`flex flex-col min-h-0 ${showPreview ? 'w-1/2' : 'w-full'}`}>
          <ChordProEditor ref={editorRef} value={content} onChange={handleChange} />
        </div>

        {/* Preview */}
        {showPreview && (
          <>
            <div className="w-px bg-surface-3 shrink-0" />
            <div className="flex-1 overflow-y-auto p-6">
              <SongRenderer
                content={content}
                columns={1}
                fontScale={0.95}
                errors={lintErrors}
                onJumpToLine={line => editorRef.current?.jumpToLine(line)}
              />
            </div>
          </>
        )}

        {/* Version history panel — slides in from the right */}
        {showHistory && versions && versions.length > 0 && (
          <>
            <div className="absolute inset-0 z-10" onClick={() => setShowHistory(false)} />
            <div className="absolute right-0 top-0 bottom-0 z-20 w-72 bg-surface-1 border-l border-surface-3 flex flex-col shadow-2xl">
              <div className="flex items-center justify-between px-4 py-3 border-b border-surface-3 shrink-0">
                <span className="text-sm font-semibold text-ink">Version history</span>
                <button onClick={() => setShowHistory(false)} className="p-1 text-ink-muted hover:text-ink">
                  <X size={15} />
                </button>
              </div>
              <div className="overflow-y-auto flex-1 p-3 space-y-2">
                {[...versions].reverse().map((v, i) => {
                  const ago = Date.now() - v.savedAt
                  const label = ago < 60000 ? 'just now'
                    : ago < 3600000 ? `${Math.round(ago / 60000)} min ago`
                    : ago < 86400000 ? `${Math.round(ago / 3600000)} h ago`
                    : new Date(v.savedAt).toLocaleDateString()
                  const preview = v.content.trim().split('\n').slice(0, 3).join(' ↵ ')

                  return (
                    <div key={v.id} className="bg-surface-2 rounded-lg p-3 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-ink-muted font-mono">v{versions.length - i}</span>
                        <span className="text-xs text-ink-faint">{label}</span>
                      </div>
                      <p className="text-xs text-ink-faint truncate font-mono leading-snug">{preview}</p>
                      <button
                        onClick={() => restoreVersion(v.content)}
                        className="w-full text-xs px-2 py-1 bg-chord/10 text-chord hover:bg-chord/20 rounded transition-colors"
                      >
                        Restore this version
                      </button>
                    </div>
                  )
                })}
              </div>
              <p className="px-4 py-2 text-xs text-ink-faint border-t border-surface-3 shrink-0">
                Restoring replaces the editor content. Changes are auto-saved.
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
