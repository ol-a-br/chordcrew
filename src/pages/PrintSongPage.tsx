import { useEffect, useRef, useMemo } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db'
import { SongRenderer } from '@/components/viewer/SongRenderer'
import { transposeKey } from '@/utils/chordpro'

export default function PrintSongPage() {
  const { id } = useParams<{ id: string }>()
  const [searchParams] = useSearchParams()
  const transpose = parseInt(searchParams.get('transpose') ?? '0', 10)
  const columns   = parseInt(searchParams.get('columns')   ?? '2', 10)
  const hasPrinted = useRef(false)

  const song = useLiveQuery(() => id ? db.songs.get(id) : undefined, [id])

  const transposedKey = useMemo(
    () => transposeKey(song?.transcription.key ?? '', transpose),
    [song?.transcription.key, transpose]
  )

  useEffect(() => {
    if (song && !hasPrinted.current) {
      hasPrinted.current = true
      setTimeout(() => window.print(), 300)
    }
  }, [song])

  if (!song) return null

  return (
    <div className="bg-white text-black min-h-screen p-8">
      {/* Close button — screen only, hidden when printing */}
      <button
        onClick={() => window.close()}
        style={{ printColorAdjust: 'exact' } as React.CSSProperties}
        className="print:hidden fixed top-4 right-4 px-3 py-1.5 bg-gray-800 text-white rounded-lg text-sm z-50"
      >
        Close
      </button>

      {/* Song header */}
      <div className="mb-5">
        <h1
          className="text-2xl font-bold leading-tight"
          style={{ fontFamily: "'Barlow Condensed', sans-serif", color: 'black' }}
        >
          {song.title}
        </h1>
        {song.artist && (
          <p className="text-sm mt-0.5" style={{ color: '#555' }}>{song.artist}</p>
        )}
        <div className="flex gap-4 mt-1.5 text-sm font-mono" style={{ color: '#666' }}>
          {song.transcription.key && (
            <span>
              𝄞 {transpose !== 0 ? `${song.transcription.key} → ${transposedKey}` : song.transcription.key}
            </span>
          )}
          {song.transcription.tempo > 0 && <span>♩ {song.transcription.tempo}</span>}
          {song.transcription.capo > 0 && <span>Capo {song.transcription.capo}</span>}
          {song.transcription.timeSignature && song.transcription.timeSignature !== '4/4' && (
            <span>{song.transcription.timeSignature}</span>
          )}
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
