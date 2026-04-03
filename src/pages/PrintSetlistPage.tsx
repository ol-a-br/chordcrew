import { useEffect, useRef, useMemo } from 'react'
import { useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db'
import { SongRenderer } from '@/components/viewer/SongRenderer'
import { transposeKey } from '@/utils/chordpro'
import type { Song, SetlistItem } from '@/types'

function SongBlock({ song, item, columns }: { song: Song; item: SetlistItem; columns: number }) {
  const transposedKey = useMemo(
    () => transposeKey(song.transcription.key ?? '', item.transposeOffset ?? 0),
    [song.transcription.key, item.transposeOffset]
  )
  const transpose = item.transposeOffset ?? 0

  return (
    <div>
      {/* Song header */}
      <div className="mb-4">
        <h2
          className="text-xl font-bold leading-tight"
          style={{ fontFamily: "'Barlow Condensed', sans-serif", color: 'black' }}
        >
          {song.title}
        </h2>
        {song.artist && (
          <p className="text-sm mt-0.5" style={{ color: '#555' }}>{song.artist}</p>
        )}
        <div className="flex gap-4 mt-1 text-sm font-mono" style={{ color: '#666' }}>
          {song.transcription.key && (
            <span>
              𝄞 {transpose !== 0 ? `${song.transcription.key} → ${transposedKey}` : song.transcription.key}
            </span>
          )}
          {song.transcription.tempo > 0 && <span>♩ {song.transcription.tempo}</span>}
          {song.transcription.capo > 0 && <span>Capo {song.transcription.capo}</span>}
          {item.notes && <span className="italic">{item.notes}</span>}
        </div>
      </div>

      <SongRenderer
        content={song.transcription.content}
        transposeOffset={transpose}
        columns={columns}
        lyricsOnly={false}
        fontScale={1.0}
      />
    </div>
  )
}

export default function PrintSetlistPage() {
  const { id } = useParams<{ id: string }>()
  const hasPrinted = useRef(false)

  const setlist = useLiveQuery(() => id ? db.setlists.get(id) : undefined, [id])
  const allItems = useLiveQuery(
    (): Promise<SetlistItem[]> => id
      ? db.setlistItems.where('setlistId').equals(id).sortBy('order')
      : Promise.resolve([]),
    [id]
  )

  const songItems = useMemo(
    () => (allItems ?? []).filter(i => i.type === 'song' && i.songId),
    [allItems]
  )

  const songs = useLiveQuery(
    async (): Promise<Record<string, Song>> => {
      const ids = songItems.map(i => i.songId!)
      if (ids.length === 0) return {}
      const list = await db.songs.bulkGet(ids)
      return Object.fromEntries(list.filter(Boolean).map(s => [s!.id, s!]))
    },
    [songItems.map(i => i.songId).join(',')]
  )

  const isReady = setlist !== undefined && allItems !== undefined && songs !== undefined

  useEffect(() => {
    if (isReady && songItems.length > 0 && !hasPrinted.current) {
      hasPrinted.current = true
      setTimeout(() => window.print(), 400)
    }
  }, [isReady, songItems.length])

  if (!isReady || !setlist) return null

  // Default 2 columns per song in the setlist print
  const columns = 2

  return (
    <div className="bg-white text-black min-h-screen p-8">
      {/* Close button — screen only */}
      <button
        onClick={() => window.close()}
        className="print:hidden fixed top-4 right-4 px-3 py-1.5 bg-gray-800 text-white rounded-lg text-sm z-50"
      >
        Close
      </button>

      {/* Setlist title */}
      <div className="mb-6 pb-3 border-b border-gray-300">
        <h1
          className="text-3xl font-bold"
          style={{ fontFamily: "'Barlow Condensed', sans-serif", color: 'black' }}
        >
          {setlist.name}
        </h1>
        {setlist.date && (
          <p className="text-sm mt-1" style={{ color: '#666' }}>{setlist.date}</p>
        )}
        <p className="text-xs mt-1" style={{ color: '#999' }}>
          {songItems.length} song{songItems.length !== 1 ? 's' : ''}
        </p>
      </div>

      {/* Songs — each gets a page break before it (except the first) */}
      {(allItems ?? []).map((item, idx) => {
        if (item.type === 'divider') {
          return (
            <div
              key={item.id}
              className="mt-6 mb-3 text-xs uppercase tracking-widest font-semibold"
              style={{ color: '#888', borderBottom: '1px solid #ddd', paddingBottom: '4px' }}
            >
              {item.dividerName ?? '—'}
            </div>
          )
        }

        const song = item.songId ? songs?.[item.songId] : undefined
        if (!song) return null

        // First song is after the setlist header; subsequent songs get a page break
        const isFirst = idx === 0 || (allItems ?? []).slice(0, idx).every(i => i.type === 'divider')

        return (
          <div
            key={item.id}
            style={!isFirst ? { pageBreakBefore: 'always', breakBefore: 'page', paddingTop: '1cm' } : undefined}
          >
            <SongBlock song={song} item={item} columns={columns} />
          </div>
        )
      })}
    </div>
  )
}
