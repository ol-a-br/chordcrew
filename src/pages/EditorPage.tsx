import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { Eye, X, RotateCcw, Tag, History, ChevronDown, Trash2, Cloud, ExternalLink } from 'lucide-react'
import { db, upsertSongVersions, markPending, markDeleted, getSettings } from '@/db'
import { deleteSongFromCloud, fetchTeamNoteIndicator } from '@/sync/firestoreSync'
import { buildSearchText, extractMeta, lintChordPro, setDirective } from '@/utils/chordpro'
import { getLinkStatus } from '@/utils/linkedSongs'
import { parseKemperRig, formatKemperRig } from '@/midi/kemper'
import { ChordProEditor } from '@/components/editor/ChordProEditor'
import type { ChordProEditorHandle } from '@/components/editor/ChordProEditor'
import { SongRenderer } from '@/components/viewer/SongRenderer'
import { Button } from '@/components/shared/Button'
import { LinkStatusBadge } from '@/components/songs/LinkStatusBadge'
import { SyncCopiesDialog } from '@/components/songs/SyncCopiesDialog'
import { useAuth } from '@/auth/AuthContext'
import { useChurchTools } from '@/churchtools/ChurchToolsContext'
import { ctDeleteSong, ctUpdateSong, ctUpdateArrangement } from '@/churchtools/api'
import { useTranslation } from 'react-i18next'
import type { Song, SongVersion } from '@/types'

const AUTOSAVE_DELAY_MS = 1000
const VERSION_INTERVAL_MS = 5 * 60 * 1000  // create a version at most every 5 min

/** Shows how a {x_kemper_rig} value is read ("Perf 6 · Slot 2", "PC 17") or flags it as invalid. */
function RigHint({ value }: { value: string }) {
  const { t } = useTranslation()
  const rig = parseKemperRig(value)
  return (
    <span className={`text-[10px] whitespace-nowrap ${rig ? 'text-ink-faint' : 'text-red-400'}`}>
      {rig ? formatKemperRig(rig) : t('editor.rigInvalid')}
    </span>
  )
}

export default function EditorPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { t } = useTranslation()
  const [searchParams] = useSearchParams()
  const setlistId = searchParams.get('setlistId')
  const setlistPos = searchParams.get('pos')
  const { user } = useAuth()
  const { baseUrl: ctBaseUrl, token: ctToken } = useChurchTools()
  const song = useLiveQuery(() => id ? db.songs.get(id) : undefined, [id])
  const isCTSong = !!(song?.ctSongId)
  // The Kemper rig field only appears once MIDI out is switched on in Settings
  const midiEnabled = useLiveQuery(async () => (await getSettings()).midiEnabled, [])

  const [content, setContent] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [showPreview, setShowPreview] = useState(true)
  const [showHistory, setShowHistory] = useState(false)
  const [showExtraMeta, setShowExtraMeta] = useState(false)
  const [deletePhase, setDeletePhase] = useState<'idle' | 'confirm' | 'deleted'>('idle')
  const [teamHasNotes, setTeamHasNotes] = useState(false)
  const [showSyncDialog, setShowSyncDialog] = useState(false)
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

  const linkedSongs = useLiveQuery(async (): Promise<Song[]> => {
    if (!song?.linkedSongIds?.length) return []
    const found = await Promise.all(song.linkedSongIds.map(lid => db.songs.get(lid)))
    return found.filter((s): s is Song => !!s)
  }, [song?.id, song?.linkedSongIds?.join(',')])

  const allBooks = useLiveQuery(() => db.books.toArray(), [])

  const editorSongMap = useMemo(() => {
    const m = new Map<string, Song>()
    if (song) m.set(song.id, song)
    linkedSongs?.forEach(s => m.set(s.id, s))
    return m
  }, [song, linkedSongs])

  const linkStatus = useMemo(
    () => song ? getLinkStatus(song, editorSongMap) : 'none',
    [song, editorSongMap]
  )

  // ── Team note indicator ───────────────────────────────────────────────────
  useEffect(() => {
    if (!song) return
    db.books.get(song.bookId).then(book => {
      if (!book?.sharedTeamId) return
      fetchTeamNoteIndicator(book.sharedTeamId, song.id).then(setTeamHasNotes)
    })
  }, [song?.id, song?.bookId])

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
    const now = Date.now()

    if (!s.ctSongId) {
      // Normal song: version history + Firestore sync
      if (now - lastVersionSavedRef.current > VERSION_INTERVAL_MS) {
        await upsertSongVersions(s.id, s.transcription.content, user.id, user.displayName)
        lastVersionSavedRef.current = now
      }
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

    if (s.ctSongId && ctBaseUrl && ctToken) {
      // CT song: push metadata back to ChurchTools (best-effort, no retry)
      const title = meta.title ?? s.title
      const artist = meta.artist ?? s.artist
      ctUpdateSong(ctBaseUrl, ctToken, s.ctSongId, {
        name: title,
        author: artist || null,
        ccli: meta.ccli ?? null,
        copyright: meta.copyright ?? null,
      }).catch(() => {})
      if (s.ctArrangementId) {
        ctUpdateArrangement(ctBaseUrl, ctToken, s.ctSongId, s.ctArrangementId, {
          key: meta.key ?? s.transcription.key,
          tempo: meta.tempo ?? s.transcription.tempo,
          beat: meta.time ?? s.transcription.timeSignature,
        }).catch(() => {})
      }
    } else {
      await markPending('song', s.id)
    }
  }, [user, ctBaseUrl, ctToken])

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
      const updated = setDirective(prev, directive, value)
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
    if (song.ctSongId) {
      // CT song: delete via CT API, then remove locally
      if (ctBaseUrl && ctToken) {
        ctDeleteSong(ctBaseUrl, ctToken, song.ctSongId).catch(() => {})
      }
      await db.songs.delete(song.id)
    } else {
      // Tombstone (as in the library) so the deletion reaches other devices and the
      // team copy is removed too — otherwise the next sync downloads the song again.
      const teamId = (await db.books.get(song.bookId))?.sharedTeamId
      const paths = [`users/${user.id}/songs/${song.id}`]
      if (teamId) paths.push(`teams/${teamId}/songs/${song.id}`)
      await markDeleted('song', song.id, paths)
      deleteSongFromCloud(song.id, user.id, teamId).catch(() => {})
      await db.songs.delete(song.id)
    }
    setDeletePhase('deleted')
    deleteTimerRef.current = setTimeout(() => navigate('/library'), 5000)
  }

  const undoDelete = async () => {
    if (deleteTimerRef.current) clearTimeout(deleteTimerRef.current)
    const s = deletedSongRef.current
    if (!s) return
    // Newer than any deletion record a sync may have written meanwhile
    await db.songs.put({ ...s, updatedAt: Date.now() })
    await db.syncStates.delete(`song:${s.id}`)  // drop the tombstone so markPending applies
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

  if (!song) return <div className="p-8 text-ink-muted">{t('common.loading')}</div>

  // ── Delete: "deleted" phase shows undo banner instead of normal editor ──────
  if (deletePhase === 'deleted') {
    return (
      <div className="flex flex-col h-full items-center justify-center gap-4 text-center px-6">
        <p className="text-ink-muted text-sm">{t('editor.deleted')}</p>
        <div className="flex gap-3">
          <button
            onClick={undoDelete}
            className="px-4 py-2 rounded-lg bg-chord/10 text-chord text-sm font-medium hover:bg-chord/20 transition-colors"
          >
            {t('editor.undo')}
          </button>
          <button
            onClick={() => navigate('/library')}
            className="px-4 py-2 rounded-lg bg-surface-2 text-ink-muted text-sm hover:bg-surface-3 transition-colors"
          >
            {t('editor.goToLibrary')}
          </button>
        </div>
        <p className="text-xs text-ink-faint">{t('editor.autoRedirect')}</p>
      </div>
    )
  }

  return (
    <>
    <div className="flex flex-col h-full">
      {/* Top bar */}
      <div className="flex items-center gap-3 px-4 py-2.5 border-b border-surface-3 bg-surface-1 shrink-0">
        <button
          onClick={() => setlistId ? navigate(`/setlists/${setlistId}`) : navigate(-1)}
          className="text-ink-muted hover:text-ink"
          title={setlistId ? t('viewer.backToSetlist') : t('common.close')}
        >
          <X size={18} />
        </button>
        <div className="flex-1 min-w-0 flex items-center gap-2">
          <span className="font-medium text-sm truncate">{song.title}</span>
          {teamHasNotes && (
            <span
              className="shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-chord/10 text-chord border border-chord/20"
              title={t('editor.teamNotesHint')}
            >
              {t('editor.notesBadge')}
            </span>
          )}
        </div>
        {!isCTSong && (
          <>
            <button
              onClick={() => setShowPreview(p => !p)}
              className={`p-1.5 rounded ${showPreview ? 'text-chord' : 'text-ink-muted hover:text-ink'}`}
              title={t('editor.togglePreview')}
            >
              <Eye size={17} />
            </button>
            {(versions?.length ?? 0) > 0 && (
              <button
                onClick={() => setShowHistory(h => !h)}
                className={`p-1.5 rounded ${showHistory ? 'text-chord' : 'text-ink-muted hover:text-ink'}`}
                title={t('editor.versionHistory')}
              >
                <History size={17} />
              </button>
            )}
          </>
        )}
        {isCTSong && (
          <span className="text-xs px-2 py-0.5 rounded bg-chord/10 text-chord border border-chord/20 shrink-0" title={t('editor.managedByCt')}>
            CT
          </span>
        )}
        <LinkStatusBadge
          status={linkStatus}
          bookNames={(linkedSongs ?? []).map(s => allBooks?.find(b => b.id === s.bookId)?.title ?? '')}
          onClick={() => setShowSyncDialog(true)}
        />
        {deletePhase === 'confirm' ? (
          <>
            <span className="text-xs text-red-400 font-medium">{t('editor.deleteConfirm')}</span>
            <button
              onClick={confirmDelete}
              className="px-2.5 py-1 rounded text-xs bg-red-600/20 text-red-400 hover:bg-red-600/30 transition-colors"
            >
              {t('common.delete')}
            </button>
            <button
              onClick={() => setDeletePhase('idle')}
              className="px-2.5 py-1 rounded text-xs text-ink-muted hover:text-ink transition-colors"
            >
              {t('common.cancel')}
            </button>
          </>
        ) : (
          <>
            <button
              onClick={() => setDeletePhase('confirm')}
              className="p-1.5 rounded text-ink-faint hover:text-red-400 transition-colors"
              title={t('editor.deleteSong')}
            >
              <Trash2 size={15} />
            </button>
            <Button variant="ghost" size="sm" onClick={() => navigate(`/view/${song.id}${setlistId ? `?setlistId=${setlistId}&pos=${setlistPos ?? 0}` : ''}`)}>
              <RotateCcw size={14} />
              {t('song.view')}
            </Button>
          </>
        )}
      </div>

      {/* Metadata bar — row 1: core song fields + expand toggle */}
      <div className="flex items-center gap-3 px-4 py-1.5 border-b border-surface-3 bg-surface-1 shrink-0 flex-wrap">
        {([
          { label: t('editor.fieldTitle'),  directive: 'title',  value: derivedMeta.title  ?? '', width: 'w-36', type: 'text' },
          { label: t('editor.fieldArtist'), directive: 'artist', value: derivedMeta.artist ?? '', width: 'w-28', type: 'text' },
          { label: t('song.key'),    directive: 'key',    value: derivedMeta.key    ?? song?.transcription.key ?? '', width: 'w-12', type: 'text' },
          { label: t('editor.fieldTempo'),  directive: 'tempo',  value: derivedMeta.tempo  ? String(derivedMeta.tempo) : '', width: 'w-14', type: 'number' },
          { label: t('song.capo'),   directive: 'capo',   value: derivedMeta.capo   ? String(derivedMeta.capo)  : '', width: 'w-12', type: 'number' },
          { label: t('song.timeSignature'),   directive: 'time',   value: derivedMeta.time   ?? '', width: 'w-14', type: 'text' },
          ...(midiEnabled ? [
            { label: t('editor.fieldRig'), directive: 'x_kemper_rig', value: derivedMeta.kemperRig ?? '', width: 'w-14', type: 'text',
              title: t('editor.rigFieldHint'), placeholder: '6.2' },
          ] : []),
        ]).map(({ label, directive, value, width, type, title, placeholder }) => (
          <label key={directive} className="flex items-center gap-1 text-xs">
            <span className="text-ink-faint shrink-0">{label}</span>
            <input
              type={type ?? 'text'}
              defaultValue={value}
              key={`${directive}-${song?.id}-${value}`}
              onBlur={e => commitMetaField(directive, e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
              title={title}
              placeholder={placeholder}
              className={`${width} bg-surface-2 border border-surface-3 rounded px-1.5 py-0.5 text-ink text-xs outline-none focus:border-chord/50 placeholder:text-ink-faint/40`}
            />
            {directive === 'x_kemper_rig' && value && <RigHint value={value} />}
            {directive === 'tempo' && (
              <button
                type="button"
                onClick={handleTap}
                className="px-1.5 py-0.5 text-xs bg-surface-2 border border-surface-3 rounded text-ink-muted hover:text-ink hover:border-chord/40 active:bg-chord/10 transition-colors select-none"
                title={t('editor.tapTempo')}
              >
                {t('editor.tap')}
              </button>
            )}
          </label>
        ))}

        {/* Expand toggle — shows rows 2+3; dot when hidden rows have content */}
        <button
          type="button"
          onClick={() => setShowExtraMeta(v => !v)}
          title={showExtraMeta ? t('editor.hideExtraMeta') : t('editor.showExtraMeta')}
          className="ml-auto relative p-1 text-ink-faint hover:text-ink rounded transition-colors"
        >
          <ChevronDown
            size={14}
            className={`transition-transform duration-150 ${showExtraMeta ? 'rotate-180' : ''}`}
          />
          {!showExtraMeta && !!(derivedMeta.ccli || derivedMeta.copyright || derivedMeta.url || tags.length > 0 || (!midiEnabled && derivedMeta.kemperRig)) && (
            <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-amber-400 pointer-events-none" />
          )}
        </button>
      </div>

      {/* Metadata rows 2+3 — hidden by default, shown when expanded */}
      {showExtraMeta && (
        <>
          {/* Row 2: attribution (CCLI / copyright / URL) */}
          <div className="flex items-center gap-3 px-4 py-1.5 border-b border-surface-3 bg-surface-1 shrink-0 flex-wrap">
            {/* CCLI — rendered separately so we can add the SongSelect lookup link */}
            <label className="flex items-center gap-1 text-xs">
              <span className="text-ink-faint shrink-0">CCLI</span>
              <input
                type="text"
                defaultValue={derivedMeta.ccli ?? ''}
                key={`ccli-${song?.id}-${derivedMeta.ccli ?? ''}`}
                placeholder="5281015"
                onBlur={e => commitMetaField('ccli', e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
                className="w-24 bg-surface-2 border border-surface-3 rounded px-1.5 py-0.5 text-ink text-xs outline-none focus:border-chord/50 placeholder:text-ink-faint/40"
              />
            </label>
            <a
              href={`https://songselect.ccli.com/search/results?SearchText=${encodeURIComponent(derivedMeta.title ?? song?.title ?? '')}`}
              target="_blank"
              rel="noopener noreferrer"
              title={t('editor.lookUpSongSelect')}
              className="-ml-2 p-0.5 text-ink-faint hover:text-chord transition-colors"
            >
              <ExternalLink size={11} />
            </a>
            {([
              { label: t('editor.fieldCopyright'), directive: 'copyright', value: derivedMeta.copyright ?? '', width: 'w-64', type: 'text', placeholder: t('editor.copyrightPlaceholder') },
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
            {/* Kemper rig lives in row 1 while MIDI is on; here it stays editable on devices without MIDI */}
            {!midiEnabled && (
              <label className="flex items-center gap-1 text-xs">
                <span className="text-ink-faint shrink-0">{t('editor.fieldRig')}</span>
                <input
                  type="text"
                  defaultValue={derivedMeta.kemperRig ?? ''}
                  key={`x_kemper_rig-${song?.id}-${derivedMeta.kemperRig ?? ''}`}
                  placeholder="6.2"
                  title={t('editor.rigFieldHint')}
                  onBlur={e => commitMetaField('x_kemper_rig', e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
                  className="w-14 bg-surface-2 border border-surface-3 rounded px-1.5 py-0.5 text-ink text-xs outline-none focus:border-chord/50 placeholder:text-ink-faint/40"
                />
                {derivedMeta.kemperRig && <RigHint value={derivedMeta.kemperRig} />}
              </label>
            )}
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
                    title={t('editor.removeTag')}
                  >
                    ✕
                  </button>
                </span>
              ))}
              <input
                ref={tagInputRef}
                type="text"
                placeholder={tags.length === 0 ? t('editor.addTagsPlaceholder') : t('editor.addTagPlaceholder')}
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
        {isCTSong ? (
          /* CT song: no ChordPro editor — lyrics are managed in ChurchTools */
          <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center px-6">
            <Cloud size={32} className="text-ink-faint" />
            <p className="text-sm text-ink-muted">{t('editor.ctManagedTitle')}</p>
            <p className="text-xs text-ink-faint">{t('editor.ctManagedHint')}</p>
          </div>
        ) : (
          <>
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
          </>
        )}

        {/* Version history panel — slides in from the right */}
        {showHistory && versions && versions.length > 0 && (
          <>
            <div className="absolute inset-0 z-10" onClick={() => setShowHistory(false)} />
            <div className="absolute right-0 top-0 bottom-0 z-20 w-72 bg-surface-1 border-l border-surface-3 flex flex-col shadow-2xl">
              <div className="flex items-center justify-between px-4 py-3 border-b border-surface-3 shrink-0">
                <span className="text-sm font-semibold text-ink">{t('editor.versionHistory')}</span>
                <button onClick={() => setShowHistory(false)} className="p-1 text-ink-muted hover:text-ink">
                  <X size={15} />
                </button>
              </div>
              <div className="overflow-y-auto flex-1 p-3 space-y-2">
                {[...versions].reverse().map((v, i) => {
                  const ago = Date.now() - v.savedAt
                  const label = ago < 60000 ? t('editor.justNow')
                    : ago < 3600000 ? t('editor.minutesAgo', { count: Math.round(ago / 60000) })
                    : ago < 86400000 ? t('editor.hoursAgo', { count: Math.round(ago / 3600000) })
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
                        {t('editor.restoreVersion')}
                      </button>
                    </div>
                  )
                })}
              </div>
              <p className="px-4 py-2 text-xs text-ink-faint border-t border-surface-3 shrink-0">
                {t('editor.restoreHint')}
              </p>
            </div>
          </>
        )}
      </div>
    </div>

    {showSyncDialog && song && (
      <SyncCopiesDialog
        song={song}
        linkedSongs={linkedSongs ?? []}
        books={allBooks ?? []}
        onClose={() => setShowSyncDialog(false)}
      />
    )}
    </>
  )
}
