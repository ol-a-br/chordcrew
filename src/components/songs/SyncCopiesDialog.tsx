import { useState, useMemo } from 'react'
import { GitCompare, X, ArrowRight, Check } from 'lucide-react'
import { db, markPending, upsertSongVersions } from '@/db'
import { isSongDiverged } from '@/utils/linkedSongs'
import { Button } from '@/components/shared/Button'
import type { Song, Book } from '@/types'
import { useAuth } from '@/auth/AuthContext'

interface Props {
  song: Song
  linkedSongs: Song[]
  books: Book[]
  onClose: () => void
}

function relativeDate(ts: number): string {
  const diff = Date.now() - ts
  const days = Math.floor(diff / 86_400_000)
  if (days === 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 30) return `${days} days ago`
  const months = Math.floor(days / 30)
  return months === 1 ? '1 month ago' : `${months} months ago`
}

const DIFF_FIELDS: { label: string; get: (s: Song) => string }[] = [
  { label: 'Title',    get: s => s.title },
  { label: 'Artist',   get: s => s.artist ?? '' },
  { label: 'Tags',     get: s => [...(s.tags ?? [])].sort().join(', ') },
  { label: 'Tempo',    get: s => s.transcription.tempo ? `${s.transcription.tempo} BPM` : '—' },
  { label: 'Capo',     get: s => s.transcription.capo ? `Capo ${s.transcription.capo}` : '—' },
  { label: 'Chords',   get: s => s.transcription.content.replace(/\{[^}]*\}/g, '').replace(/\[[^\]]*\]/g, '…').slice(0, 80) },
]

export function SyncCopiesDialog({ song, linkedSongs, books, onClose }: Props) {
  const { user } = useAuth()
  const bookMap = useMemo(() => new Map(books.map(b => [b.id, b.title])), [books])

  // Pick which pair to reconcile (when there are multiple linked copies)
  const [selectedLinkedId, setSelectedLinkedId] = useState<string>(
    linkedSongs.find(s => isSongDiverged(song, s))?.id ?? linkedSongs[0]?.id ?? ''
  )
  const [syncing, setSyncing] = useState(false)
  const [done, setDone] = useState(false)

  const other = linkedSongs.find(s => s.id === selectedLinkedId)

  // Determine direction: newer overwrites older
  const [source, target] = useMemo(() => {
    if (!other) return [song, song]
    return song.updatedAt >= other.updatedAt ? [song, other] : [other, song]
  }, [song, other])

  const diverged = other ? isSongDiverged(song, other) : false

  const handleSync = async () => {
    if (!other || !user) return
    setSyncing(true)
    // Snapshot target's current content before overwriting (revert safety net)
    await upsertSongVersions(target.id, target.transcription.content, user.id, user.displayName)
    // Overwrite all fields except id, bookId, linkedSongIds (preserve per-copy values)
    await db.songs.update(target.id, {
      title:      source.title,
      artist:     source.artist,
      tags:       source.tags,
      searchText: source.searchText,
      isFavorite: source.isFavorite,
      updatedAt:  Date.now(),
      transcription: {
        ...source.transcription,
        key: target.transcription.key, // intentionally preserved (D3)
      },
    })
    await markPending('song', target.id)
    setSyncing(false)
    setDone(true)
    setTimeout(onClose, 800)
  }

  if (!other) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60" onClick={onClose}>
      <div
        className="bg-surface-1 border border-surface-3 rounded-2xl w-full max-w-lg shadow-2xl flex flex-col max-h-[90vh]"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-surface-3 shrink-0">
          <GitCompare size={18} className="text-amber-500 shrink-0" />
          <span className="font-semibold text-sm flex-1">Sync Copies</span>
          <button onClick={onClose} className="text-ink-muted hover:text-ink p-1 rounded">
            <X size={16} />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">
          {/* Pair picker (when there are multiple linked copies) */}
          {linkedSongs.length > 1 && (
            <div>
              <p className="text-xs text-ink-muted mb-1.5">Reconcile with:</p>
              <div className="flex flex-wrap gap-2">
                {linkedSongs.map(s => (
                  <button
                    key={s.id}
                    onClick={() => setSelectedLinkedId(s.id)}
                    className={`px-3 py-1 rounded-lg text-xs border transition-colors ${
                      s.id === selectedLinkedId
                        ? 'bg-amber-500/20 border-amber-500/50 text-amber-400'
                        : 'border-surface-3 text-ink-muted hover:border-amber-500/30 hover:text-ink'
                    }`}
                  >
                    {bookMap.get(s.bookId) ?? 'Unknown book'}
                    {isSongDiverged(song, s) && (
                      <span className="ml-1.5 w-1.5 h-1.5 rounded-full bg-amber-500 inline-block" />
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Direction banner */}
          <div className="flex items-center gap-2 text-xs rounded-lg bg-surface-2 px-3 py-2.5">
            <div className="flex-1 min-w-0">
              <p className="font-medium truncate">{bookMap.get(source.bookId) ?? 'Unknown book'}</p>
              <p className="text-ink-muted">updated {relativeDate(source.updatedAt)}</p>
            </div>
            <ArrowRight size={14} className="text-amber-500 shrink-0" />
            <div className="flex-1 min-w-0 text-right">
              <p className="font-medium truncate">{bookMap.get(target.bookId) ?? 'Unknown book'}</p>
              <p className="text-ink-muted">updated {relativeDate(target.updatedAt)}</p>
            </div>
          </div>

          {!diverged && (
            <p className="text-sm text-ink-muted text-center py-2">These copies are already in sync.</p>
          )}

          {/* Diff table */}
          {diverged && (
            <div className="space-y-1.5">
              <p className="text-xs text-ink-muted uppercase tracking-wider">Changed fields</p>
              {DIFF_FIELDS.map(({ label, get }) => {
                const srcVal = get(source)
                const tgtVal = get(target)
                if (srcVal === tgtVal) return null
                return (
                  <div key={label} className="rounded-lg bg-surface-2 px-3 py-2 text-xs">
                    <p className="text-ink-faint mb-1">{label}</p>
                    <p className="text-ink line-through opacity-50 truncate">{tgtVal || '—'}</p>
                    <p className="text-amber-400 truncate">{srcVal || '—'}</p>
                  </div>
                )
              })}
              <p className="text-[11px] text-ink-faint pt-1">
                Key is preserved per copy.
                The overwritten version can be restored from the Editor's version history.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-5 py-3 border-t border-surface-3 shrink-0">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={syncing || done}>
            Cancel
          </Button>
          {done ? (
            <span className="flex items-center gap-1.5 text-sm text-green-400">
              <Check size={15} /> Synced
            </span>
          ) : (
            <Button
              variant="primary"
              size="sm"
              onClick={handleSync}
              disabled={!diverged || syncing}
            >
              {syncing ? 'Syncing…' : 'Sync now'}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
