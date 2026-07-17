import { useState, useEffect } from 'react'
import { Upload, X, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react'
import { useChurchTools } from '@/churchtools/ChurchToolsContext'
import { ctGetAllSongs, ctCreateSong, ctCreateArrangement } from '@/churchtools/api'
import type { Song } from '@/types'
import type { CTSongPreview, CTSongUploadResult } from '@/churchtools/types'
import { Button } from '@/components/shared/Button'

interface Props {
  songs: Song[]
  onClose: () => void
}

type Phase = 'loading' | 'preview' | 'uploading' | 'done'

export function SongUploadDialog({ songs, onClose }: Props) {
  const { baseUrl, token, categoryId, categories } = useChurchTools()
  const [phase, setPhase] = useState<Phase>('loading')
  const [previews, setPreviews] = useState<CTSongPreview[]>([])
  const [results, setResults] = useState<CTSongUploadResult[]>([])
  const [error, setError] = useState<string | null>(null)
  const [selectedCategoryId, setSelectedCategoryId] = useState(categoryId)

  useEffect(() => {
    let cancelled = false
    ctGetAllSongs(baseUrl, token).then(ctSongs => {
      if (cancelled) return
      const nameMap = new Map(ctSongs.map(s => [s.name.toLowerCase(), s]))
      const preview: CTSongPreview[] = songs.map(s => {
        const match = nameMap.get(s.title.toLowerCase())
        if (match) {
          const defaultArr = match.arrangements.find(a => a.isDefault) ?? match.arrangements[0]
          return {
            localId: s.id,
            localTitle: s.title,
            status: 'exists',
            ctSongId: match.id,
            ctArrangementId: defaultArr?.id,
          }
        }
        return { localId: s.id, localTitle: s.title, status: 'will-create' }
      })
      setPreviews(preview)
      setPhase('preview')
    }).catch(e => {
      if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load ChurchTools songs')
    })
    return () => { cancelled = true }
  }, [baseUrl, token, songs])

  const toCreate = previews.filter(p => p.status === 'will-create')
  const toSkip = previews.filter(p => p.status === 'exists')

  const upload = async () => {
    setPhase('uploading')
    const results: CTSongUploadResult[] = []

    for (const preview of previews) {
      if (preview.status === 'exists') {
        results.push({ localTitle: preview.localTitle, status: 'exists' })
        continue
      }
      const song = songs.find(s => s.id === preview.localId)!
      try {
        const created = await ctCreateSong(baseUrl, token, {
          name: song.title,
          author: song.artist || null,
          ccli: song.transcription.content.match(/\{ccli:([^}]+)\}/)?.[1]?.trim() || null,
          copyright: song.transcription.content.match(/\{copyright:([^}]+)\}/)?.[1]?.trim() || null,
          categoryId: selectedCategoryId,
        })
        await ctCreateArrangement(baseUrl, token, created.id, {
          key: song.transcription.key || null,
          tempo: song.transcription.tempo > 0 ? song.transcription.tempo : null,
          beat: song.transcription.timeSignature || null,
          duration: song.transcription.duration > 0 ? song.transcription.duration : null,
        })
        results.push({ localTitle: song.title, status: 'created' })
      } catch (e) {
        results.push({
          localTitle: song.title,
          status: 'error',
          error: e instanceof Error ? e.message : 'Unknown error',
        })
      }
    }

    setResults(results)
    setPhase('done')
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <div className="bg-surface-1 border border-surface-3 rounded-2xl shadow-2xl w-full max-w-md max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-surface-3">
          <Upload size={18} className="text-chord shrink-0" />
          <span className="font-semibold flex-1">Upload to ChurchTools</span>
          <button onClick={onClose} className="p-1 text-ink-muted hover:text-ink rounded">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* Loading */}
          {phase === 'loading' && !error && (
            <div className="flex items-center gap-2 text-ink-muted text-sm py-4">
              <Loader2 size={16} className="animate-spin" />
              Checking ChurchTools song library…
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="flex items-start gap-2 text-red-400 text-sm">
              <AlertCircle size={16} className="shrink-0 mt-0.5" />
              {error}
            </div>
          )}

          {/* Preview */}
          {phase === 'preview' && (
            <>
              {toCreate.length > 0 && (
                <div>
                  <p className="text-xs text-ink-faint uppercase tracking-wider mb-2">
                    Will create ({toCreate.length})
                  </p>
                  <ul className="space-y-1">
                    {toCreate.map(p => (
                      <li key={p.localId} className="flex items-center gap-2 text-sm">
                        <span className="w-2 h-2 rounded-full bg-chord shrink-0" />
                        {p.localTitle}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {toSkip.length > 0 && (
                <div>
                  <p className="text-xs text-ink-faint uppercase tracking-wider mb-2">
                    Already exists — will skip ({toSkip.length})
                  </p>
                  <ul className="space-y-1">
                    {toSkip.map(p => (
                      <li key={p.localId} className="flex items-center gap-2 text-sm text-ink-muted">
                        <span className="w-2 h-2 rounded-full bg-surface-3 shrink-0" />
                        {p.localTitle}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {toCreate.length === 0 && (
                <p className="text-sm text-ink-muted">All songs already exist in ChurchTools.</p>
              )}
              {categories.length > 1 && (
                <div className="pt-2">
                  <label className="text-xs text-ink-faint mb-1 block">Song category</label>
                  <select
                    value={selectedCategoryId}
                    onChange={e => setSelectedCategoryId(Number(e.target.value))}
                    className="bg-surface-2 text-sm rounded-lg px-3 py-1.5 border border-surface-3 focus:outline-none w-full"
                  >
                    {categories.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
              )}
            </>
          )}

          {/* Uploading */}
          {phase === 'uploading' && (
            <div className="flex items-center gap-2 text-ink-muted text-sm py-4">
              <Loader2 size={16} className="animate-spin" />
              Uploading songs…
            </div>
          )}

          {/* Done */}
          {phase === 'done' && (
            <div className="space-y-1">
              {results.map((r, i) => (
                <div key={i} className="flex items-center gap-2 text-sm">
                  {r.status === 'created' && <CheckCircle2 size={15} className="text-green-400 shrink-0" />}
                  {r.status === 'exists' && <span className="w-4 h-4 flex items-center justify-center text-ink-faint shrink-0">–</span>}
                  {r.status === 'error' && <AlertCircle size={15} className="text-red-400 shrink-0" />}
                  <span className={r.status === 'exists' ? 'text-ink-muted' : ''}>
                    {r.localTitle}
                    {r.status === 'created' && <span className="text-xs text-green-400 ml-1">created</span>}
                    {r.status === 'exists' && <span className="text-xs text-ink-faint ml-1">skipped</span>}
                    {r.status === 'error' && <span className="text-xs text-red-400 ml-1">{r.error}</span>}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-surface-3">
          {phase === 'done' || error ? (
            <Button variant="primary" size="sm" onClick={onClose}>Close</Button>
          ) : phase === 'preview' ? (
            <>
              <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
              <Button
                variant="primary"
                size="sm"
                onClick={upload}
                disabled={toCreate.length === 0}
              >
                <Upload size={14} />
                Upload {toCreate.length > 0 ? `${toCreate.length} song${toCreate.length !== 1 ? 's' : ''}` : '(nothing to do)'}
              </Button>
            </>
          ) : null}
        </div>
      </div>
    </div>
  )
}
