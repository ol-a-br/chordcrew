import { useState, useEffect } from 'react'
import { Calendar, Upload, X, CheckCircle2, AlertCircle, Loader2, ChevronRight } from 'lucide-react'
import { useChurchTools } from '@/churchtools/ChurchToolsContext'
import {
  ctGetEvents, ctGetAllSongs, ctGetEventAgendaSongs,
  ctCreateSong, ctCreateArrangement, ctAddAgendaItem,
} from '@/churchtools/api'
import type { Song, Setlist } from '@/types'
import type { CTEvent, CTSongPreview, CTSongUploadResult } from '@/churchtools/types'
import { Button } from '@/components/shared/Button'

interface Props {
  setlist: Setlist
  songs: Song[]   // songs in setlist (song-type items only, ordered)
  onClose: () => void
}

type Phase = 'events' | 'loading-preview' | 'preview' | 'uploading' | 'done'

export function EventPickerDialog({ setlist, songs, onClose }: Props) {
  const { baseUrl, token, categoryId } = useChurchTools()
  const [phase, setPhase] = useState<Phase>('events')
  const [events, setEvents] = useState<CTEvent[]>([])
  const [eventsError, setEventsError] = useState<string | null>(null)
  const [selectedEvent, setSelectedEvent] = useState<CTEvent | null>(null)
  const [previews, setPreviews] = useState<CTSongPreview[]>([])
  const [results, setResults] = useState<CTSongUploadResult[]>([])
  const [error, setError] = useState<string | null>(null)

  // Date to look up events: use setlist date or today
  const lookupDate = setlist.date
    ? setlist.date.slice(0, 10)
    : new Date().toISOString().slice(0, 10)

  useEffect(() => {
    ctGetEvents(baseUrl, token, lookupDate)
      .then(setEvents)
      .catch(e => setEventsError(e instanceof Error ? e.message : 'Failed to load events'))
  }, [baseUrl, token, lookupDate])

  const selectEvent = async (event: CTEvent) => {
    setSelectedEvent(event)
    setPhase('loading-preview')
    try {
      const [ctSongs, agendaSongs] = await Promise.all([
        ctGetAllSongs(baseUrl, token),
        ctGetEventAgendaSongs(baseUrl, token, event.id),
      ])
      const nameMap = new Map(ctSongs.map(s => [s.name.toLowerCase(), s]))
      const agendaIds = new Set(agendaSongs.map(s => s.id))

      const preview: CTSongPreview[] = songs.map(s => {
        const match = nameMap.get(s.title.toLowerCase())
        if (match && agendaIds.has(match.id)) {
          const defaultArr = match.arrangements.find(a => a.isDefault) ?? match.arrangements[0]
          return {
            localId: s.id, localTitle: s.title,
            status: 'exists', ctSongId: match.id, ctArrangementId: defaultArr?.id,
          }
        }
        if (match) {
          const defaultArr = match.arrangements.find(a => a.isDefault) ?? match.arrangements[0]
          return {
            localId: s.id, localTitle: s.title,
            status: 'will-create', ctSongId: match.id, ctArrangementId: defaultArr?.id,
          }
        }
        return { localId: s.id, localTitle: s.title, status: 'will-create' }
      })

      setPreviews(preview)
      setPhase('preview')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load preview')
      setPhase('preview')
    }
  }

  const toAdd = previews.filter(p => p.status === 'will-create')
  const toSkip = previews.filter(p => p.status === 'exists')

  const upload = async () => {
    if (!selectedEvent) return
    setPhase('uploading')
    const results: CTSongUploadResult[] = []

    for (const preview of previews) {
      if (preview.status === 'exists') {
        results.push({ localTitle: preview.localTitle, status: 'exists' })
        continue
      }
      const song = songs.find(s => s.id === preview.localId)!
      try {
        let arrangementId = preview.ctArrangementId
        if (!arrangementId) {
          // Song doesn't exist in CT at all — create it
          let ctSongId = preview.ctSongId
          if (!ctSongId) {
            const created = await ctCreateSong(baseUrl, token, {
              name: song.title,
              author: song.artist || null,
              ccli: song.transcription.content.match(/\{ccli:([^}]+)\}/)?.[1]?.trim() || null,
              copyright: song.transcription.content.match(/\{copyright:([^}]+)\}/)?.[1]?.trim() || null,
              categoryId,
            })
            ctSongId = created.id
          }
          const arr = await ctCreateArrangement(baseUrl, token, ctSongId, {
            key: song.transcription.key || null,
            tempo: song.transcription.tempo > 0 ? song.transcription.tempo : null,
            beat: song.transcription.timeSignature || null,
            duration: song.transcription.duration > 0 ? song.transcription.duration : null,
          })
          arrangementId = arr.id
        }
        await ctAddAgendaItem(baseUrl, token, selectedEvent.id, arrangementId)
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

  const fmtTime = (iso: string) =>
    new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <div className="bg-surface-1 border border-surface-3 rounded-2xl shadow-2xl w-full max-w-md max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-surface-3">
          <Calendar size={18} className="text-chord shrink-0" />
          <div className="flex-1 min-w-0">
            <span className="font-semibold block truncate">Upload to ChurchTools event</span>
            {selectedEvent && (
              <span className="text-xs text-ink-muted">{selectedEvent.name}</span>
            )}
          </div>
          <button onClick={onClose} className="p-1 text-ink-muted hover:text-ink rounded">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* Step 1: pick event */}
          {phase === 'events' && (
            <>
              <p className="text-xs text-ink-faint">
                Events on <span className="text-ink">{lookupDate}</span>
                {!setlist.date && ' (today — set a date on the setlist to look up a specific day)'}
              </p>
              {eventsError && (
                <div className="flex items-start gap-2 text-red-400 text-sm">
                  <AlertCircle size={15} className="shrink-0 mt-0.5" />
                  {eventsError}
                </div>
              )}
              {!eventsError && events.length === 0 && (
                <p className="text-sm text-ink-muted">No events found for this date.</p>
              )}
              {events.map(ev => (
                <button
                  key={ev.id}
                  onClick={() => selectEvent(ev)}
                  className="w-full flex items-center gap-3 p-3 rounded-xl bg-surface-2 hover:bg-surface-3 border border-surface-3 hover:border-chord/40 transition-colors text-left"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{ev.name}</p>
                    <p className="text-xs text-ink-muted">
                      {ev.calendar.title} · {fmtTime(ev.startDate)}–{fmtTime(ev.endDate)}
                    </p>
                  </div>
                  <ChevronRight size={15} className="text-ink-faint shrink-0" />
                </button>
              ))}
            </>
          )}

          {/* Loading preview */}
          {phase === 'loading-preview' && (
            <div className="flex items-center gap-2 text-ink-muted text-sm py-4">
              <Loader2 size={16} className="animate-spin" />
              Checking agenda…
            </div>
          )}

          {/* Preview */}
          {phase === 'preview' && (
            <>
              {error && (
                <div className="flex items-start gap-2 text-red-400 text-sm">
                  <AlertCircle size={15} className="shrink-0 mt-0.5" />
                  {error}
                </div>
              )}
              {toAdd.length > 0 && (
                <div>
                  <p className="text-xs text-ink-faint uppercase tracking-wider mb-2">
                    Will add to agenda ({toAdd.length})
                  </p>
                  <ul className="space-y-1">
                    {toAdd.map(p => (
                      <li key={p.localId} className="flex items-center gap-2 text-sm">
                        <span className="w-2 h-2 rounded-full bg-chord shrink-0" />
                        {p.localTitle}
                        {!p.ctSongId && (
                          <span className="text-xs text-ink-faint">(will also create in CT)</span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {toSkip.length > 0 && (
                <div>
                  <p className="text-xs text-ink-faint uppercase tracking-wider mb-2">
                    Already on agenda — will skip ({toSkip.length})
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
              {toAdd.length === 0 && !error && (
                <p className="text-sm text-ink-muted">All songs are already on the event agenda.</p>
              )}
            </>
          )}

          {/* Uploading */}
          {phase === 'uploading' && (
            <div className="flex items-center gap-2 text-ink-muted text-sm py-4">
              <Loader2 size={16} className="animate-spin" />
              Uploading to agenda…
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
                    {r.status === 'created' && <span className="text-xs text-green-400 ml-1">added</span>}
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
          {phase === 'done' || (phase === 'events' && eventsError) ? (
            <Button variant="primary" size="sm" onClick={onClose}>Close</Button>
          ) : phase === 'preview' ? (
            <>
              <Button variant="ghost" size="sm" onClick={() => { setSelectedEvent(null); setPhase('events') }}>
                Back
              </Button>
              <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
              <Button
                variant="primary"
                size="sm"
                onClick={upload}
                disabled={toAdd.length === 0 || !!error}
              >
                <Upload size={14} />
                {toAdd.length > 0 ? `Add ${toAdd.length} to agenda` : 'Nothing to add'}
              </Button>
            </>
          ) : phase === 'events' ? (
            <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          ) : null}
        </div>
      </div>
    </div>
  )
}
