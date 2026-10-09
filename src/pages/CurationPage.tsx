import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { useTranslation } from 'react-i18next'
import { AlertTriangle, Copy, Download, Trash2, GitCompare, Link2, Link2Off, Check } from 'lucide-react'
import { db, markDeleted, linkSongs } from '@/db'
import { deleteSongFromCloud } from '@/sync/firestoreSync'
import { lintChordPro } from '@/utils/chordpro'
import { fuzzyMatch } from '@/utils/fuzzySearch'
import { isSongDiverged, getLinkStatus } from '@/utils/linkedSongs'
import { SyncCopiesDialog } from '@/components/songs/SyncCopiesDialog'
import { SearchInput } from '@/components/shared/SearchInput'
import { useAuth } from '@/auth/AuthContext'
import type { Song, Book } from '@/types'

// ─── Diff helpers ─────────────────────────────────────────────────────────────

// label = field name; shown via the i18n key `curation.field.<label>`
interface DiffField { label: string; value: string }

function songFieldValue(song: Song, label: string, bookMap: Map<string, string>): string {
  switch (label) {
    case 'Title':   return song.title
    case 'Artist':  return song.artist ?? '—'
    case 'Key':     return song.transcription.key ?? '—'
    case 'Tempo':   return song.transcription.tempo ? `${song.transcription.tempo} BPM` : '—'
    case 'Book':    return bookMap.get(song.bookId) ?? '—'
    case 'Tags':    return (song.tags ?? []).join(', ') || '—'
    case 'Updated': return new Date(song.updatedAt).toISOString().slice(0, 10)
    default:        return ''
  }
}

const DIFF_FIELD_ORDER = ['Title', 'Artist', 'Key', 'Tempo', 'Book', 'Tags', 'Updated']  // also i18n keys: curation.field.*

function getDiffFields(song: Song, other: Song, bookMap: Map<string, string>): DiffField[] {
  const result: DiffField[] = []
  for (const label of DIFF_FIELD_ORDER) {
    if (songFieldValue(song, label, bookMap) !== songFieldValue(other, label, bookMap)) {
      result.push({ label, value: songFieldValue(song, label, bookMap) })
      if (result.length === 2) break
    }
  }
  return result
}

function contentLines(content: string): string[] {
  return content
    .split('\n')
    .map(line => line.replace(/\[[^\]]*\]/g, '').trim())
    .filter(line => line && !line.startsWith('{'))
}

function getContentDiffLines(song: Song, other: Song): string[] {
  const otherSet = new Set(contentLines(other.transcription.content))
  return contentLines(song.transcription.content)
    .filter(line => !otherSet.has(line))
    .slice(0, 2)
}

// ─── Jaccard word similarity ──────────────────────────────────────────────────

function normalizeTitle(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim()
}

function wordSet(title: string): Set<string> {
  return new Set(normalizeTitle(title).split(/\s+/).filter(Boolean))
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1
  let intersection = 0
  for (const w of a) if (b.has(w)) intersection++
  const union = a.size + b.size - intersection
  return union === 0 ? 0 : intersection / union
}

interface DuplicateGroup {
  songs: Song[]
  similarity: number
}

function findDuplicates(songs: Song[]): DuplicateGroup[] {
  const groups: DuplicateGroup[] = []
  const used = new Set<string>()

  for (let i = 0; i < songs.length; i++) {
    if (used.has(songs[i].id)) continue
    const wA = wordSet(songs[i].title)
    const group: Song[] = [songs[i]]
    let maxSim = 0

    for (let j = i + 1; j < songs.length; j++) {
      if (used.has(songs[j].id)) continue
      const wB = wordSet(songs[j].title)
      const sim = jaccard(wA, wB)
      if (sim >= 0.75) {
        group.push(songs[j])
        used.add(songs[j].id)
        if (sim > maxSim) maxSim = sim
      }
    }

    if (group.length > 1) {
      used.add(songs[i].id)
      groups.push({ songs: group, similarity: maxSim })
    }
  }

  return groups
}

// ─── CSV export ───────────────────────────────────────────────────────────────

function escapeCsv(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

function exportCsv(songs: Song[], books: Book[]) {
  const bookMap = new Map(books.map(b => [b.id, b.title]))
  const header = ['Title', 'Artist', 'Key', 'Tempo', 'Capo', 'Tags', 'CCLI', 'Copyright', 'Book', 'Updated']
  const rows = songs.map(s => {
    const t = s.transcription
    const cells: string[] = [
      s.title,
      s.artist ?? '',
      t.key ?? '',
      t.tempo ? String(t.tempo) : '',
      t.capo ? String(t.capo) : '',
      (s.tags ?? []).join('; '),
      extractDirective(t.content, 'ccli'),
      extractDirective(t.content, 'copyright'),
      bookMap.get(s.bookId) ?? '',
      new Date(s.updatedAt).toISOString().slice(0, 10),
    ]
    return cells.map(escapeCsv).join(',')
  })
  const csv = [header.join(','), ...rows].join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `chordcrew_songs_${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

function extractDirective(content: string, name: string): string {
  const m = content.match(new RegExp(`\\{${name}\\s*:\\s*([^}]+)\\}`, 'i'))
  return m?.[1]?.trim() ?? ''
}

// ─── Linked copy clusters ─────────────────────────────────────────────────────

function computeLinkedClusters(songs: Song[]): Song[][] {
  const visited = new Set<string>()
  const clusters: Song[][] = []
  const songMap = new Map(songs.map(s => [s.id, s]))
  for (const song of songs) {
    if (!song.linkedSongIds?.length || visited.has(song.id)) continue
    const cluster: Song[] = []
    const queue = [song.id]
    while (queue.length) {
      const id = queue.shift()!
      if (visited.has(id)) continue
      visited.add(id)
      const s = songMap.get(id)
      if (!s) continue
      cluster.push(s)
      for (const lid of s.linkedSongIds ?? []) {
        if (!visited.has(lid)) queue.push(lid)
      }
    }
    if (cluster.length > 1) clusters.push(cluster)
  }
  return clusters
}

// ─── Tabs ─────────────────────────────────────────────────────────────────────

type Tab = 'duplicates' | 'errors' | 'linked' | 'export'

export default function CurationPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { t } = useTranslation()
  const [tab, setTab] = useState<Tab>('duplicates')
  const [errorFilter, setErrorFilter] = useState('')
  const [sameBookOnly, setSameBookOnly] = useState(false)

  const songs = useLiveQuery(() => db.songs.toArray(), [])
  const books = useLiveQuery<Book[]>(() => db.books.toArray(), [])

  const bookMap = useMemo(() => new Map((books ?? []).map(b => [b.id, b.title])), [books])
  const fullBookMap = useMemo(() => new Map((books ?? []).map(b => [b.id, b])), [books])

  // ── Linked copies ─────────────────────────────────────────────────────────
  const songMap = useMemo(() => new Map((songs ?? []).map(s => [s.id, s])), [songs])
  const linkedClusters = useMemo(() => computeLinkedClusters(songs ?? []), [songs])

  // Cross-book Jaccard pairs not yet linked (Jaccard ≥ 0.75, different books)
  const suggestedPairs = useMemo(() => {
    if (!songs) return []
    const existing = findDuplicates(songs)
    const pairs: [Song, Song][] = []
    for (const group of existing) {
      for (let i = 0; i < group.songs.length; i++) {
        for (let j = i + 1; j < group.songs.length; j++) {
          const a = group.songs[i], b = group.songs[j]
          if (a.bookId === b.bookId) continue          // same book → handled by duplicates tab
          if (a.linkedSongIds?.includes(b.id)) continue // already linked
          pairs.push([a, b])
        }
      }
    }
    return pairs
  }, [songs])

  const [curationSyncSong, setCurationSyncSong] = useState<Song | null>(null)

  // ── Connect songs (retroactive linking) ──────────────────────────────────
  const [showConnect, setShowConnect] = useState(false)
  const [connectStep, setConnectStep] = useState<1 | 2>(1)
  const [connectSongA, setConnectSongA] = useState<Song | null>(null)
  const [connectQuery, setConnectQuery] = useState('')

  const connectResults = useMemo(() => {
    if (!connectQuery.trim()) return []
    return (songs ?? [])
      .filter(s => {
        if (connectStep === 2 && connectSongA) {
          if (s.id === connectSongA.id) return false
          if (connectSongA.linkedSongIds?.includes(s.id)) return false
        }
        return fuzzyMatch(`${s.title} ${s.artist ?? ''}`, connectQuery)
      })
      .slice(0, 12)
  }, [songs, connectQuery, connectStep, connectSongA])

  const handleConnectSelect = async (song: Song) => {
    if (connectStep === 1) {
      setConnectSongA(song)
      setConnectQuery('')
      setConnectStep(2)
    } else if (connectSongA) {
      await linkSongs(connectSongA.id, song.id)
      setShowConnect(false)
      setConnectStep(1)
      setConnectSongA(null)
      setConnectQuery('')
    }
  }

  const handleLinkSuggestion = async (a: Song, b: Song) => {
    await linkSongs(a.id, b.id)
  }

  // ── Duplicates ────────────────────────────────────────────────────────────
  const duplicateGroups = useMemo(() => {
    if (!songs) return []
    return findDuplicates(songs)
  }, [songs])

  const visibleDuplicateGroups = useMemo(() => {
    if (!sameBookOnly) return duplicateGroups
    // For each group, keep only songs that share a book with at least one other
    // song in the group. A group with 2 songs in "Book A" and 1 in "Book B"
    // should still appear — showing only the 2 "Book A" songs.
    return duplicateGroups
      .map(g => {
        const byBook = new Map<string, Song[]>()
        for (const s of g.songs) {
          const arr = byBook.get(s.bookId) ?? []
          arr.push(s)
          byBook.set(s.bookId, arr)
        }
        const samebookSongs = [...byBook.values()]
          .filter(arr => arr.length >= 2)
          .flat()
        return samebookSongs.length >= 2 ? { ...g, songs: samebookSongs } : null
      })
      .filter(Boolean) as DuplicateGroup[]
  }, [duplicateGroups, sameBookOnly])

  // ── Exact same-book duplicates (for bulk removal) ─────────────────────────
  const exactSameBookGroups = useMemo(() => {
    if (!songs) return []
    const map = new Map<string, Song[]>()
    for (const s of songs) {
      const key = `${s.bookId}|${normalizeTitle(s.title)}`
      const arr = map.get(key) ?? []
      arr.push(s)
      map.set(key, arr)
    }
    return [...map.values()].filter(arr => arr.length > 1)
  }, [songs])

  const removeExactDuplicates = async () => {
    const toDelete = exactSameBookGroups.reduce((sum, g) => sum + g.length - 1, 0)
    if (!confirm(t('curation.removeDuplicatesConfirm', { count: toDelete }))) return
    for (const group of exactSameBookGroups) {
      const sorted = [...group].sort((a, b) => b.updatedAt - a.updatedAt)
      for (const song of sorted.slice(1)) {
        if (user) {
          const book = books?.find(b => b.id === song.bookId)
          const teamId = book?.sharedTeamId
          const paths = [`users/${user.id}/songs/${song.id}`]
          if (teamId) paths.push(`teams/${teamId}/songs/${song.id}`)
          await markDeleted('song', song.id, paths)
          deleteSongFromCloud(song.id, user.id, teamId)
        }
        await db.songs.delete(song.id)
      }
    }
  }

  // ── Delete song ───────────────────────────────────────────────────────────
  const deleteSong = async (song: Song) => {
    if (!confirm(t('curation.deleteSongConfirm', { title: song.title }))) return
    if (user) {
      const book = books?.find(b => b.id === song.bookId)
      const teamId = book?.sharedTeamId
      const paths = [`users/${user.id}/songs/${song.id}`]
      if (teamId) paths.push(`teams/${teamId}/songs/${song.id}`)
      await markDeleted('song', song.id, paths)
      deleteSongFromCloud(song.id, user.id, teamId)
    }
    await db.songs.delete(song.id)
  }

  // ── Parse errors ──────────────────────────────────────────────────────────
  const songErrors = useMemo(() => {
    if (!songs) return []
    return songs
      .map(s => ({ song: s, errors: lintChordPro(s.transcription.content) }))
      .filter(({ errors }) => errors.length > 0)
  }, [songs])

  const filteredErrors = useMemo(() => {
    if (!errorFilter) return songErrors
    return songErrors.filter(({ song }) => fuzzyMatch(song.title, errorFilter))
  }, [songErrors, errorFilter])

  // ── Export ────────────────────────────────────────────────────────────────
  const handleExport = () => {
    if (songs && books) exportCsv(songs as Song[], books)
  }

  const tabClass = (name: Tab) =>
    `px-4 py-2 text-sm font-medium border-b-2 transition-colors ${tab === name
      ? 'border-chord text-chord'
      : 'border-transparent text-ink-muted hover:text-ink hover:border-surface-3'
    }`

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-4">
      <div>
        <h1 className="text-xl font-semibold">{t('curation.title')}</h1>
        <p className="text-sm text-ink-muted mt-1">{t('curation.intro')}</p>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-surface-3 gap-1">
        <button className={tabClass('duplicates')} onClick={() => setTab('duplicates')}>
          {t('curation.tabDuplicates')}
          {duplicateGroups.length > 0 && (
            <span className="ml-2 bg-amber-500/20 text-amber-400 text-xs px-1.5 py-0.5 rounded-full">{visibleDuplicateGroups.length}</span>
          )}
        </button>
        <button className={tabClass('errors')} onClick={() => setTab('errors')}>
          {t('curation.tabErrors')}
          {songErrors.length > 0 && (
            <span className="ml-2 bg-red-500/20 text-red-400 text-xs px-1.5 py-0.5 rounded-full">{songErrors.length}</span>
          )}
        </button>
        <button className={tabClass('linked')} onClick={() => setTab('linked')}>
          {t('curation.tabLinked')}
          {linkedClusters.length > 0 && (
            <span className="ml-2 bg-amber-500/20 text-amber-400 text-xs px-1.5 py-0.5 rounded-full">{linkedClusters.length}</span>
          )}
        </button>
        <button className={tabClass('export')} onClick={() => setTab('export')}>
          {t('curation.tabExport')}
        </button>
      </div>

      {/* Duplicates tab */}
      {tab === 'duplicates' && (
        <div className="space-y-3">
          {/* Filter toggle + bulk remove */}
          {duplicateGroups.length > 0 && (
            <div className="flex items-center justify-between gap-4">
              <label className="flex items-center gap-2 text-xs text-ink-muted cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={sameBookOnly}
                  onChange={e => setSameBookOnly(e.target.checked)}
                  className="accent-amber-400 rounded"
                />
                {t('curation.sameBookOnly')}
              </label>
              {exactSameBookGroups.length > 0 && (
                <button
                  onClick={removeExactDuplicates}
                  className="flex items-center gap-1.5 text-xs text-red-400 hover:text-red-300 transition-colors shrink-0"
                  title={t('curation.removeDuplicatesHint')}
                >
                  <Trash2 size={12} />
                  {t('curation.removeDuplicates', { count: exactSameBookGroups.reduce((s, g) => s + g.length - 1, 0) })}
                </button>
              )}
            </div>
          )}

          {visibleDuplicateGroups.length === 0 ? (
            <div className="text-ink-muted text-sm py-8 text-center">
              {duplicateGroups.length === 0
                ? t('curation.noDuplicates')
                : t('curation.noSameBookDuplicates')}
            </div>
          ) : (
            visibleDuplicateGroups.map((group, i) => {
              const isExact = group.songs.every(s => s.title.toLowerCase().trim() === group.songs[0].title.toLowerCase().trim())
              const isCrossBook = group.songs.some(s => s.bookId !== group.songs[0].bookId)
              const alreadyLinked = group.songs.length === 2 && group.songs[0].linkedSongIds?.includes(group.songs[1].id)
              return (
                <div key={i} className="bg-surface-1 border border-surface-3 rounded-xl overflow-hidden">
                  <div className="flex items-center gap-2 px-4 py-2 bg-surface-2 border-b border-surface-3">
                    <Copy size={13} className="text-amber-400" />
                    <span className="text-xs text-amber-400 font-medium flex-1">
                      {isExact ? t('curation.exactDuplicate') : t('curation.similarTitles', { percent: Math.round(group.similarity * 100) })}
                    </span>
                    {isCrossBook && !alreadyLinked && (
                      <button
                        onClick={() => handleLinkSuggestion(group.songs[0], group.songs[1])}
                        className="flex items-center gap-1 text-[11px] text-chord border border-chord/30 rounded px-2 py-0.5 hover:border-chord/60 transition-colors shrink-0"
                        title={t('curation.linkAsCopyHint')}
                      >
                        <Link2 size={11} /> {t('curation.linkAsCopy')}
                      </button>
                    )}
                    {alreadyLinked && (
                      <span className="flex items-center gap-1 text-[11px] text-green-500/70">
                        <Check size={11} /> {t('curation.linked')}
                      </span>
                    )}
                  </div>
                  <ul className="divide-y divide-surface-3">
                    {group.songs.map((song, idx) => {
                      const neighbor = group.songs[idx + 1] ?? group.songs[idx - 1]
                      const metaDiffs = isExact ? [] : getDiffFields(song, neighbor, bookMap)
                      const contentDiffs = isExact ? [] : getContentDiffLines(song, neighbor)
                      return (
                        <li key={song.id} className="flex items-start gap-3 px-4 py-2.5">
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium truncate">{song.title}</div>
                            <div className="text-xs text-ink-muted truncate">
                              {[song.artist, bookMap.get(song.bookId)].filter(Boolean).join(' · ')}
                            </div>
                            {metaDiffs.length > 0 && (
                              <div className="flex gap-3 mt-0.5">
                                {metaDiffs.map(({ label, value }) => (
                                  <span key={label} className="text-xs">
                                    <span className="text-ink-faint">{t(`curation.field.${label}`)}: </span>
                                    <span className="text-amber-400/80">{value}</span>
                                  </span>
                                ))}
                              </div>
                            )}
                            {contentDiffs.length > 0 && (
                              <div className="mt-1 space-y-0.5">
                                {contentDiffs.map((line, li) => (
                                  <div key={li} className="text-xs font-mono text-ink-faint/80 truncate">+ {line}</div>
                                ))}
                              </div>
                            )}
                          </div>
                          <button
                            onClick={() => navigate(`/editor/${song.id}`)}
                            className="text-xs text-chord hover:text-chord/80 shrink-0 mt-0.5"
                          >
                            {t('common.edit')}
                          </button>
                          <button
                            onClick={() => deleteSong(song)}
                            className="text-ink-faint hover:text-red-400 transition-colors shrink-0 mt-0.5"
                            title={t('editor.deleteSong')}
                          >
                            <Trash2 size={14} />
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                </div>
              )
            })
          )}
        </div>
      )}

      {/* Parse errors tab */}
      {tab === 'errors' && (
        <div className="space-y-3">
          {songErrors.length === 0 ? (
            <div className="text-ink-muted text-sm py-8 text-center">{t('curation.noErrors')}</div>
          ) : (
            <>
              <SearchInput
                value={errorFilter}
                onChange={setErrorFilter}
                placeholder={t('curation.filterPlaceholder')}
                iconSize={14}
              />
              {filteredErrors.map(({ song, errors }) => (
                <div key={song.id} className="bg-surface-1 border border-red-900/40 rounded-xl overflow-hidden">
                  <div className="flex items-center gap-2 px-4 py-2 bg-red-900/20 border-b border-red-900/30">
                    <AlertTriangle size={13} className="text-red-400" />
                    <span className="text-sm font-medium text-ink flex-1 truncate">{song.title}</span>
                    <span className="text-xs text-red-400">{t('curation.errorCount', { count: errors.length })}</span>
                    <button
                      onClick={() => navigate(`/editor/${song.id}`)}
                      className="text-xs text-chord hover:text-chord/80 ml-2"
                    >
                      {t('lint.fix')}
                    </button>
                  </div>
                  <ul className="divide-y divide-red-900/20">
                    {errors.map((err, i) => (
                      <li key={i} className="flex items-start gap-3 px-4 py-2 text-xs">
                        <span className="text-red-400 font-mono shrink-0 mt-0.5">{t('curation.lineShort', { line: err.line })}</span>
                        <div className="flex-1 min-w-0">
                          <div className="text-red-200">{t(`lint.${err.code}`)}</div>
                          <div className="text-red-400/60 font-mono truncate mt-0.5">{err.text}</div>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </>
          )}
        </div>
      )}

      {/* Linked Copies tab */}
      {tab === 'linked' && (
        <div className="space-y-4">
          {/* Header + Connect button */}
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-ink-muted">
              {t('curation.linkedIntro')}
            </p>
            <button
              onClick={() => { setShowConnect(true); setConnectStep(1); setConnectSongA(null); setConnectQuery('') }}
              className="flex items-center gap-1.5 text-xs text-chord hover:text-chord/80 shrink-0 border border-chord/30 hover:border-chord/60 rounded-lg px-3 py-1.5 transition-colors"
            >
              <Link2 size={13} />
              {t('curation.connectSongs')}
            </button>
          </div>

          {/* Jaccard-based suggestions */}
          {suggestedPairs.length > 0 && (
            <div className="bg-surface-1 border border-amber-500/20 rounded-xl overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-2 bg-amber-500/5 border-b border-amber-500/20">
                <GitCompare size={13} className="text-amber-400" />
                <span className="text-xs text-amber-400 font-medium">{t('curation.suggestions')}</span>
              </div>
              <ul className="divide-y divide-surface-3">
                {suggestedPairs.map(([a, b], i) => (
                  <li key={i} className="flex items-center gap-3 px-4 py-2.5">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{a.title}</div>
                      <div className="text-xs text-amber-600 truncate">
                        {bookMap.get(a.bookId) ?? (a.ctSongId != null ? 'ChurchTools' : t('library.unknownBook'))} → {bookMap.get(b.bookId) ?? (b.ctSongId != null ? 'ChurchTools' : t('library.unknownBook'))}
                      </div>
                    </div>
                    <button
                      onClick={() => handleLinkSuggestion(a, b)}
                      className="flex items-center gap-1.5 text-xs text-chord border border-chord/30 hover:border-chord/60 rounded-lg px-2.5 py-1 transition-colors shrink-0"
                    >
                      <Link2 size={12} />
                      {t('curation.link')}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Known linked clusters */}
          {linkedClusters.length === 0 ? (
            <div className="text-ink-muted text-sm py-8 text-center">
              {t('curation.noLinked')}
            </div>
          ) : (
            linkedClusters.map((cluster, ci) => {
              const clusterSongMap = new Map(cluster.map(s => [s.id, s]))
              return (
                <div key={ci} className="bg-surface-1 border border-surface-3 rounded-xl overflow-hidden">
                  <ul className="divide-y divide-surface-3">
                    {cluster.map(song => {
                      const status = getLinkStatus(song, songMap)
                      const linkedInCluster = (song.linkedSongIds ?? [])
                        .map(id => clusterSongMap.get(id))
                        .filter(Boolean) as Song[]
                      const divergedBooks = linkedInCluster
                        .filter(s => isSongDiverged(song, s))
                        .map(s => bookMap.get(s.bookId) ?? t('library.unknownBook'))
                      return (
                        <li key={song.id} className="flex items-center gap-3 px-4 py-2.5">
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium truncate">{song.title}</div>
                            <div className="text-xs text-amber-600 truncate">
                              {bookMap.get(song.bookId) ?? (song.ctSongId != null ? 'ChurchTools' : t('library.unknownBook'))}
                              {' · '}
                              {new Date(song.updatedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}
                            </div>
                          </div>
                          {status === 'broken' && (
                            <span title={t('linkStatus.notFound')} className="text-ink-faint">
                              <Link2Off size={14} />
                            </span>
                          )}
                          {status === 'in-sync' && (
                            <span className="text-xs text-green-500/70 flex items-center gap-1">
                              <Check size={13} /> {t('curation.inSync')}
                            </span>
                          )}
                          {status === 'diverged' && (
                            <button
                              onClick={() => setCurationSyncSong(song)}
                              className="flex items-center gap-1.5 text-xs text-amber-500 border border-amber-500/30 hover:border-amber-400/60 rounded-lg px-2.5 py-1 transition-colors shrink-0"
                              title={t('linkStatus.divergedFrom', { books: divergedBooks.join(', ') })}
                              data-testid="curation-sync-btn"
                            >
                              <GitCompare size={12} />
                              {t('curation.sync')}
                            </button>
                          )}
                          <button
                            onClick={() => navigate(`/editor/${song.id}`)}
                            className="text-xs text-ink-faint hover:text-chord transition-colors shrink-0"
                          >
                            {t('common.edit')}
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                </div>
              )
            })
          )}

          {/* Connect songs dialog */}
          {showConnect && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60" onClick={() => setShowConnect(false)}>
              <div className="bg-surface-1 border border-surface-3 rounded-2xl w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
                <div className="flex items-center gap-3 px-5 py-4 border-b border-surface-3">
                  <Link2 size={16} className="text-chord shrink-0" />
                  <span className="font-semibold text-sm flex-1">
                    {connectStep === 1 ? t('curation.selectFirst') : t('curation.linkTo', { title: connectSongA?.title })}
                  </span>
                  <button onClick={() => setShowConnect(false)} className="text-ink-muted hover:text-ink">✕</button>
                </div>
                <div className="px-5 py-4 space-y-3">
                  {connectStep === 2 && connectSongA && (
                    <div className="text-xs text-ink-muted bg-surface-2 rounded-lg px-3 py-2">
                      <span className="font-medium text-ink">{connectSongA.title}</span>
                      {' '}{t('curation.in')} {bookMap.get(connectSongA.bookId) ?? (connectSongA.ctSongId != null ? 'ChurchTools' : t('library.unknownBook'))}
                      <button
                        onClick={() => { setConnectStep(1); setConnectSongA(null); setConnectQuery('') }}
                        className="ml-2 text-ink-faint hover:text-ink"
                      >
                        {t('curation.change')}
                      </button>
                    </div>
                  )}
                  <SearchInput
                    autoFocus
                    value={connectQuery}
                    onChange={setConnectQuery}
                    placeholder={t('curation.searchPlaceholder')}
                    iconSize={14}
                  />
                  <ul className="max-h-56 overflow-y-auto space-y-0.5">
                    {connectResults.map(song => (
                      <li
                        key={song.id}
                        onClick={() => handleConnectSelect(song)}
                        className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-surface-2 cursor-pointer"
                        data-testid="connect-song-result"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium truncate">{song.title}</div>
                          <div className="text-xs text-amber-600 truncate">{bookMap.get(song.bookId) ?? (song.ctSongId != null ? 'ChurchTools' : t('library.unknownBook'))}</div>
                        </div>
                      </li>
                    ))}
                    {connectQuery.trim() && connectResults.length === 0 && (
                      <li className="text-sm text-ink-faint text-center py-4">{t('curation.noSongsMatch')}</li>
                    )}
                  </ul>
                </div>
              </div>
            </div>
          )}

          {/* Sync dialog from curation */}
          {curationSyncSong && (
            <SyncCopiesDialog
              song={curationSyncSong}
              linkedSongs={(curationSyncSong.linkedSongIds ?? []).flatMap(id => {
                const s = songMap.get(id); return s ? [s] : []
              })}
              books={books ?? []}
              onClose={() => setCurationSyncSong(null)}
            />
          )}
        </div>
      )}

      {/* Export tab */}
      {tab === 'export' && (
        <div className="space-y-4">
          <div className="bg-surface-1 border border-surface-3 rounded-xl p-5 space-y-3">
            <div className="flex items-center gap-3">
              <Download size={18} className="text-chord" />
              <div>
                <div className="font-medium text-sm">{t('curation.exportTitle')}</div>
                <div className="text-xs text-ink-muted mt-0.5">
                  {t('curation.exportIncludes')}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-4 text-xs text-ink-muted">
              <span>{t('setlist.songCount', { count: songs?.length ?? 0 })}</span>
              <span>{t('curation.bookCount', { count: books?.length ?? 0 })}</span>
            </div>
            <button
              onClick={handleExport}
              className="flex items-center gap-2 px-4 py-2 bg-chord/10 text-chord rounded-lg text-sm hover:bg-chord/20 transition-colors"
            >
              <Download size={14} />
              {t('curation.downloadCsv')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
