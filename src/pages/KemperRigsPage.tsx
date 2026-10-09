import { useState, useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { useTranslation, Trans } from 'react-i18next'
import { ArrowRight, Lock } from 'lucide-react'
import { db, getSettings, getTeamRole, markPending, upsertSongVersions } from '@/db'
import { extractMeta, setDirective } from '@/utils/chordpro'
import { fuzzyMatch } from '@/utils/fuzzySearch'
import {
  parseKemperRig, formatKemperRig, buildRigRemap, rigMatchesPattern, type KemperRig,
} from '@/midi/kemper'
import { SearchInput } from '@/components/shared/SearchInput'
import { useAuth } from '@/auth/AuthContext'
import type { Song, User } from '@/types'

// ─── Kemper rigs table ───────────────────────────────────────────────────────
// Every song's {x_kemper_rig} and {tempo} in one place, editable inline, plus a
// bulk "replace rig" for when performances are reorganised on the Kemper.

type StatusFilter = 'all' | 'set' | 'missing' | 'invalid'
type SortBy = 'title' | 'rig'

interface Row {
  song: Song
  bookTitle: string
  rigValue: string            // raw directive value ('' = none)
  rig: KemperRig | null       // parsed; null when missing or invalid
  lockedReason: string | null // i18n key: why this song can't be edited here
}

// label = i18n key
const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: 'all',     label: 'kemper.filterAll' },
  { value: 'set',     label: 'kemper.filterSet' },
  { value: 'missing', label: 'kemper.filterMissing' },
  { value: 'invalid', label: 'kemper.filterInvalid' },
]

/** Sort key: valid rigs (programs, then performance.slot), then invalid values, then songs without a rig. */
function rigSortKey(row: Row): number[] {
  if (row.rig?.kind === 'program') return [0, row.rig.program, 0]
  if (row.rig?.kind === 'performance') return [1, row.rig.performance, row.rig.slot]
  return [row.rigValue ? 2 : 3, 0, 0]
}

/** Writes rig and/or tempo directives into a song, like the editor's metadata fields do. */
async function writeSongMeta(songId: string, patch: { rig?: string; tempo?: string }, user: User): Promise<void> {
  const song = await db.songs.get(songId)   // fresh copy — the table row may predate an earlier edit
  if (!song) return
  const before = song.transcription.content
  let content = before
  if (patch.rig !== undefined) content = setDirective(content, 'x_kemper_rig', patch.rig.trim())
  if (patch.tempo !== undefined) content = setDirective(content, 'tempo', patch.tempo.trim())
  if (content === before) return

  await upsertSongVersions(song.id, before, user.id, user.displayName)
  await db.songs.update(song.id, {
    updatedAt: Date.now(),
    transcription: {
      ...song.transcription,
      content,
      tempo: patch.tempo !== undefined ? (extractMeta(content).tempo ?? 0) : song.transcription.tempo,
    },
  })
  await markPending('song', song.id)
}

export default function KemperRigsPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { t } = useTranslation()
  const songs = useLiveQuery(() => db.songs.toArray(), [])
  const books = useLiveQuery(() => db.books.toArray(), [])
  const teams = useLiveQuery(() => db.teams.toArray(), [])
  const settings = useLiveQuery(() => getSettings(), [])

  const [query, setQuery] = useState('')
  const [bookId, setBookId] = useState('')
  const [status, setStatus] = useState<StatusFilter>('all')
  const [sortBy, setSortBy] = useState<SortBy>('title')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<string | null>(null)

  const rows = useMemo((): Row[] => {
    if (!songs || !books) return []
    const bookMap = new Map(books.map(b => [b.id, b]))
    const teamMap = new Map((teams ?? []).map(t => [t.id, t]))
    return songs.map(song => {
      const book = bookMap.get(song.bookId)
      const team = book?.sharedTeamId ? teamMap.get(book.sharedTeamId) : undefined
      const role = team && user ? getTeamRole(team, user.id, user.email) : null
      const rigValue = extractMeta(song.transcription.content).kemperRig ?? ''
      return {
        song,
        bookTitle: book?.title ?? '—',
        rigValue,
        rig: parseKemperRig(rigValue),
        // ChurchTools songs are rebuilt from ChurchTools on every CT sync — a rig would be lost
        lockedReason: song.ctSongId || book?.sourceType === 'churchtools' ? 'kemper.lockedCt'
          : book?.readOnly ? 'kemper.lockedReadOnly'
          : book?.sharedTeamId && role === 'reader' ? 'kemper.lockedReader'
          : null,
      }
    })
  }, [songs, books, teams, user])

  const visible = useMemo(() => {
    const filtered = rows.filter(r =>
      (!bookId || r.song.bookId === bookId) &&
      (status === 'all'
        || (status === 'set' && !!r.rig)
        || (status === 'missing' && !r.rigValue)
        || (status === 'invalid' && !!r.rigValue && !r.rig)) &&
      (!query || fuzzyMatch(`${r.song.title} ${r.song.artist} ${r.rigValue}`, query)),
    )
    const byTitle = (a: Row, b: Row) => a.song.title.localeCompare(b.song.title)
    if (sortBy === 'title') return filtered.sort(byTitle)
    return filtered.sort((a, b) => {
      const ka = rigSortKey(a), kb = rigSortKey(b)
      for (let i = 0; i < ka.length; i++) if (ka[i] !== kb[i]) return ka[i] - kb[i]
      return byTitle(a, b)
    })
  }, [rows, bookId, status, query, sortBy])

  const counts = useMemo(() => ({
    set: rows.filter(r => r.rig).length,
    invalid: rows.filter(r => r.rigValue && !r.rig).length,
  }), [rows])

  // ── Bulk replace ──────────────────────────────────────────────────────────
  const remap = from.trim() ? buildRigRemap(from, to) : null
  const remapError = remap && 'error' in remap ? remap.error : null
  const replacement = (row: Row): string | null =>
    remap && !('error' in remap) && row.rig && !row.lockedReason && rigMatchesPattern(row.rig, remap.from)
      ? remap.replace(row.rig)
      : null
  const matches = visible.filter(r => replacement(r) !== null)

  const applyRemap = async () => {
    if (!user) return
    setBusy(true)
    let n = 0
    for (const row of matches) {
      const value = replacement(row)
      if (value === null) continue
      await writeSongMeta(row.song.id, { rig: value }, user)
      n++
    }
    setBusy(false)
    setConfirming(false)
    setResult(t('kemper.updated', { count: n, from: from.trim(), to: to.trim() || t('kemper.noRigParen') }))
    setFrom('')
    setTo('')
  }

  const commitCell = (row: Row, field: 'rig' | 'tempo', value: string, original: string) => {
    if (!user || value.trim() === original) return
    void writeSongMeta(row.song.id, { [field]: value }, user)
  }

  const cellKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, original: string) => {
    if (e.key === 'Enter') e.currentTarget.blur()
    if (e.key === 'Escape') { e.currentTarget.value = original; e.currentTarget.blur() }
  }

  if (!songs || !books) return <div className="p-8 text-ink-muted">{t('common.loading')}</div>

  const inputClass = 'bg-surface-2 border border-surface-3 rounded px-1.5 py-0.5 text-ink text-sm outline-none focus:border-chord/50 placeholder:text-ink-faint/40'

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-4">
      <div>
        <h1 className="text-xl font-semibold">{t('kemper.title')}</h1>
        <p className="text-sm text-ink-muted mt-1">
          <Trans i18nKey="kemper.intro" components={{ code: <code className="font-mono" /> }} />{' '}
          {t('kemper.rigCount', { count: rows.length, set: counts.set })}
          {counts.invalid > 0 && <>, <span className="text-red-400">{t('kemper.invalidCount', { count: counts.invalid })}</span></>}.
        </p>
      </div>

      {settings && (!settings.midiEnabled || !settings.midiSendRig) && (
        <p className="text-xs text-amber-400 bg-amber-400/10 rounded-lg px-3 py-2">
          {!settings.midiEnabled ? t('kemper.midiOff') : t('kemper.sendRigOff')} — {t('kemper.notSent')}{' '}
          <Link to="/settings" className="underline hover:text-amber-300">{t('nav.settings')}</Link>
        </p>
      )}

      {/* Bulk replace */}
      <section className="bg-surface-1 rounded-xl px-4 py-3 space-y-2">
        <h2 className="text-xs text-ink-faint uppercase tracking-wider">{t('kemper.replaceTitle')}</h2>
        <div className="flex items-center gap-2 flex-wrap text-sm">
          <label className="flex items-center gap-1.5">
            <span className="text-ink-muted">{t('kemper.from')}</span>
            <input
              aria-label={t('kemper.replaceFrom')}
              value={from}
              onChange={e => { setFrom(e.target.value); setConfirming(false); setResult(null) }}
              placeholder="6.*"
              className={`w-20 ${inputClass}`}
            />
          </label>
          <ArrowRight size={14} className="text-ink-faint" />
          <label className="flex items-center gap-1.5">
            <span className="text-ink-muted">{t('kemper.to')}</span>
            <input
              aria-label={t('kemper.replaceTo')}
              value={to}
              onChange={e => { setTo(e.target.value); setConfirming(false); setResult(null) }}
              placeholder="8.*"
              className={`w-20 ${inputClass}`}
            />
          </label>
          {remap && !remapError && (
            confirming ? (
              <>
                <button
                  onClick={applyRemap}
                  disabled={busy}
                  className="px-3 py-1 text-xs rounded-lg bg-chord text-surface-0 font-medium hover:bg-chord-light disabled:opacity-50"
                >
                  {busy ? t('kemper.updating') : t('kemper.confirmUpdate', { count: matches.length })}
                </button>
                <button onClick={() => setConfirming(false)} className="px-2 py-1 text-xs text-ink-muted hover:text-ink">
                  {t('common.cancel')}
                </button>
              </>
            ) : (
              <button
                onClick={() => setConfirming(true)}
                disabled={matches.length === 0}
                className="px-3 py-1 text-xs rounded-lg border border-surface-3 bg-surface-2 text-ink hover:border-chord/50 disabled:opacity-40 disabled:hover:border-surface-3"
              >
                {matches.length === 0 ? t('kemper.noMatches') : t('kemper.replaceIn', { count: matches.length })}
              </button>
            )
          )}
        </div>
        {remapError && <p className="text-xs text-red-400">{t(`kemper.remapError.${remapError}`)}</p>}
        {result && <p className="text-xs text-green-400">{result}</p>}
        <p className="text-xs text-ink-faint">
          <Trans i18nKey="kemper.replaceHint" components={{ code: <code className="font-mono" /> }} />
        </p>
      </section>

      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <SearchInput value={query} onChange={setQuery} placeholder={t('kemper.searchPlaceholder')} className="flex-1 min-w-[12rem]" />
        <select
          aria-label={t('kemper.book')}
          value={bookId}
          onChange={e => setBookId(e.target.value)}
          className="bg-surface-2 text-sm rounded-lg px-3 py-2 border border-surface-3 focus:outline-none max-w-[12rem]"
        >
          <option value="">{t('setlistDetail.allBooks')}</option>
          {books.slice().sort((a, b) => a.title.localeCompare(b.title)).map(b => (
            <option key={b.id} value={b.id}>{b.title}</option>
          ))}
        </select>
        <div className="flex bg-surface-2 rounded-lg overflow-hidden border border-surface-3">
          {STATUS_FILTERS.map(f => (
            <button
              key={f.value}
              onClick={() => setStatus(f.value)}
              className={`px-3 py-1.5 text-sm ${status === f.value ? 'bg-chord/20 text-chord' : 'text-ink-muted hover:text-ink'}`}
            >
              {t(f.label)}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="bg-surface-1 rounded-xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-ink-faint uppercase tracking-wider border-b border-surface-3">
              <th className="px-3 py-2 font-normal">
                <button onClick={() => setSortBy('title')} className={`uppercase tracking-wider ${sortBy === 'title' ? 'text-chord' : 'hover:text-ink'}`}>{t('kemper.colSong')}</button>
              </th>
              <th className="px-3 py-2 font-normal hidden md:table-cell">{t('kemper.book')}</th>
              <th className="px-3 py-2 font-normal w-24">{t('editor.fieldTempo')}</th>
              <th className="px-3 py-2 font-normal w-56">
                <button onClick={() => setSortBy('rig')} className={`uppercase tracking-wider ${sortBy === 'rig' ? 'text-chord' : 'hover:text-ink'}`}>{t('editor.fieldRig')}</button>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-3/60">
            {visible.map(row => {
              const tempo = row.song.transcription.tempo ? String(row.song.transcription.tempo) : ''
              const next = replacement(row)
              return (
                <tr key={row.song.id} data-testid="rig-row" className="hover:bg-surface-2/40">
                  <td className="px-3 py-1.5">
                    <button onClick={() => navigate(`/editor/${row.song.id}`)} className="text-left hover:text-chord">
                      {row.song.title}
                    </button>
                    {row.song.artist && <span className="block text-xs text-ink-faint">{row.song.artist}</span>}
                  </td>
                  <td className="px-3 py-1.5 text-ink-muted hidden md:table-cell">{row.bookTitle}</td>
                  <td className="px-3 py-1.5">
                    {row.lockedReason ? <span className="text-ink-muted">{tempo}</span> : (
                      <input
                        aria-label={t('kemper.tempoOf', { title: row.song.title })}
                        type="number"
                        defaultValue={tempo}
                        key={`tempo-${row.song.id}-${tempo}`}
                        onBlur={e => commitCell(row, 'tempo', e.target.value, tempo)}
                        onKeyDown={e => cellKeyDown(e, tempo)}
                        className={`w-16 ${inputClass}`}
                      />
                    )}
                  </td>
                  <td className="px-3 py-1.5">
                    <div className="flex items-center gap-2">
                      {row.lockedReason ? (
                        <span className="flex items-center gap-1 text-ink-muted" title={t(row.lockedReason)}>
                          <Lock size={11} className="text-ink-faint" />{row.rigValue}
                        </span>
                      ) : (
                        <input
                          aria-label={t('kemper.rigOf', { title: row.song.title })}
                          defaultValue={row.rigValue}
                          key={`rig-${row.song.id}-${row.rigValue}`}
                          placeholder="—"
                          onBlur={e => commitCell(row, 'rig', e.target.value, row.rigValue)}
                          onKeyDown={e => cellKeyDown(e, row.rigValue)}
                          className={`w-16 ${inputClass}`}
                        />
                      )}
                      {row.rigValue && (
                        <span className={`text-xs whitespace-nowrap ${row.rig ? 'text-ink-faint' : 'text-red-400'}`}>
                          {row.rig ? formatKemperRig(row.rig) : t('editor.rigInvalid')}
                        </span>
                      )}
                      {next !== null && (
                        <span className="text-xs text-chord whitespace-nowrap">→ {next || t('kemper.noRig')}</span>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
            {visible.length === 0 && (
              <tr><td colSpan={4} className="px-3 py-6 text-center text-ink-muted">{t('kemper.noSongsMatch')}</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
